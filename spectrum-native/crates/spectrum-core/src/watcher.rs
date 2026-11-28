//! A project folder's changes from outside the app (Finder, a git pull, an agent, a sync client), debounced
//! and sent as `FsEvent`s, without what the file tree leaves out (`.git`, `.spectrum`, TeX's build files).

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};

use crate::CoreError;
use crate::project::is_hidden_path;

/// A change under the watched folder, by absolute path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FsEvent {
    /// Created or changed (or renamed to here).
    Changed(PathBuf),
    /// Gone (or renamed from here).
    Removed(PathBuf),
    /// The watch itself failed; the caller should rescan the folder.
    Error(String),
}

/// Watches a folder for as long as it lives.
pub struct ProjectWatcher {
    _debouncer: Debouncer<RecommendedWatcher>,
}

impl ProjectWatcher {
    /// Watches `root` recursively, sending events at most every `debounce` (2.8's watch waited 300 ms).
    pub fn new(root: &Path, debounce: Duration) -> Result<(Self, Receiver<FsEvent>), CoreError> {
        let (tx, rx) = mpsc::channel();
        // FSEvents reports canonical paths (/private/var/… for /var/…), so both spellings are tried
        let roots: Vec<PathBuf> = [Some(root.to_path_buf()), std::fs::canonicalize(root).ok()]
            .into_iter()
            .flatten()
            .collect();
        let watch_err = |source| CoreError::Watch {
            path: root.to_path_buf(),
            source,
        };
        let mut debouncer = new_debouncer(debounce, move |result: DebounceEventResult| {
            forward(&roots, &tx, result);
        })
        .map_err(watch_err)?;
        debouncer
            .watcher()
            .watch(root, RecursiveMode::Recursive)
            .map_err(watch_err)?;
        Ok((
            Self {
                _debouncer: debouncer,
            },
            rx,
        ))
    }
}

fn forward(roots: &[PathBuf], tx: &Sender<FsEvent>, result: DebounceEventResult) {
    let events = match result {
        Ok(events) => events,
        Err(err) => {
            tracing::warn!(%err, "file watch failed");
            let _ = tx.send(FsEvent::Error(err.to_string()));
            return;
        }
    };
    for event in events {
        let rel = roots.iter().find_map(|r| event.path.strip_prefix(r).ok());
        if rel.is_some_and(is_hidden_path) {
            continue;
        }
        let path = event.path;
        let event = if path.symlink_metadata().is_ok() {
            FsEvent::Changed(path)
        } else {
            FsEvent::Removed(path)
        };
        // the receiver gone means nobody is listening any more
        if tx.send(event).is_err() {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn next_matching(rx: &Receiver<FsEvent>, want: impl Fn(&FsEvent) -> bool) -> Option<FsEvent> {
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while let Some(left) = deadline.checked_duration_since(std::time::Instant::now()) {
            match rx.recv_timeout(left) {
                Ok(event) if want(&event) => return Some(event),
                Ok(_) => {}
                Err(_) => return None,
            }
        }
        None
    }

    #[test]
    fn reports_changes_and_removals_but_not_hidden_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let (_watcher, rx) = ProjectWatcher::new(root, Duration::from_millis(100)).unwrap();
        // FSEvents may deliver nothing for changes made right after the stream starts
        std::thread::sleep(Duration::from_millis(300));
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".git").join("index"), "x").unwrap();
        fs::write(root.join("main.tex"), "x").unwrap();
        let named = |e: &FsEvent, name: &str, removed: bool| match e {
            FsEvent::Changed(p) => !removed && p.ends_with(name),
            FsEvent::Removed(p) => removed && p.ends_with(name),
            FsEvent::Error(_) => false,
        };
        assert!(next_matching(&rx, |e| named(e, "main.tex", false)).is_some());
        fs::remove_file(root.join("main.tex")).unwrap();
        assert!(next_matching(&rx, |e| named(e, "main.tex", true)).is_some());
        while let Ok(event) = rx.try_recv() {
            assert!(
                !matches!(&event, FsEvent::Changed(p) | FsEvent::Removed(p) if p.components().any(|c| c.as_os_str() == ".git"))
            );
        }
    }
}
