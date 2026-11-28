//! Checkpoints: 2.8's content-addressed history in `.spectrum/history` (`versionService.js`), read and written
//! in the same format, so every checkpoint 2.8 (or 1.7.0) saved shows up and 2.8 lists the ones saved here.
//! Not git: checkpoints work in projects without a repository, and in a sync app's folder, where a
//! repository would be damaged. Every call is blocking; run it off the UI thread.

mod store;

use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::Path;

use serde_json::{Value, json};

use crate::diff::{FileDiff, count_lines, diff_bytes};
use crate::error::{GitError, Result};
use crate::util::{extname, is_text, join, locked, now_iso, now_ms, parse_iso_ms, write_json};
use store::{
    Version, WRITTEN, history_dir, manifest_path, object_path, read_manifest, read_object,
    read_versions, snapshot, tracked_files, write_index,
};

const DAY_MS: i64 = 24 * 60 * 60 * 1000;
/// A compile's checkpoint takes the place of the last one compiles made within this long of its first.
const COMPILE_WINDOW_MS: i64 = 10 * 60 * 1000;
const EPOCH_2026_MS: i64 = 1_767_225_600_000;

/// Why a checkpoint was saved: 2.8's five reasons. Anything else on disk reads as `Manual`, as in 2.8.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    Manual,
    /// Before an agent's direct edits or an applied suggestion.
    BeforeAi,
    BeforeRestore,
    BeforeTransfer,
    /// After a successful compile; the one automatic kind.
    Compile,
}

impl Reason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::BeforeAi => "before-ai",
            Self::BeforeRestore => "before-restore",
            Self::BeforeTransfer => "before-transfer",
            Self::Compile => "compile",
        }
    }
    fn parse(text: &str) -> Self {
        match text {
            "before-ai" => Self::BeforeAi,
            "before-restore" => Self::BeforeRestore,
            "before-transfer" => Self::BeforeTransfer,
            "compile" => Self::Compile,
            _ => Self::Manual,
        }
    }
}

/// A checkpoint as the Versions panel shows it. `summary` is 2.8's `{ kind, files, added, removed }`.
#[derive(Debug, Clone, PartialEq)]
pub struct Checkpoint {
    pub id: u64,
    /// The number shown (1.7.0's versions keep theirs; later ones count on by time).
    pub number: u64,
    pub created_at: String,
    pub label: String,
    pub reason: Reason,
    pub summary: Value,
}

fn shown(v: &Version) -> Checkpoint {
    Checkpoint {
        id: v.id,
        number: v.number,
        created_at: v.created_at.clone(),
        label: v.label.clone(),
        reason: v.reason,
        summary: v.summary.clone(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeStatus {
    Added,
    Removed,
    Modified,
    /// In the checkpoint and still on disk, but no longer captured (too big, a compiled PDF, unreadable).
    Untracked,
}

/// One file's change between two checkpoints, or a checkpoint and the disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub status: ChangeStatus,
    pub added: usize,
    pub removed: usize,
    pub binary: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Created {
    pub checkpoint: Checkpoint,
    /// Nothing changed since the latest checkpoint, which is returned.
    pub unchanged: bool,
    /// Files it couldn't capture: unreadable, outside the project, or over 50 MB.
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Restored {
    /// The safety checkpoint of what was there, unless nothing had changed since the latest.
    pub safety: Option<Checkpoint>,
    /// Untracked files a restore would have overwritten, moved aside to `name (before restore).ext`.
    pub kept_aside: Vec<String>,
}

enum Side<'a> {
    History(&'a BTreeMap<String, String>),
    Disk(&'a BTreeMap<String, String>),
}

impl Side<'_> {
    fn files(&self) -> &BTreeMap<String, String> {
        match self {
            Self::History(f) | Self::Disk(f) => f,
        }
    }
    fn read(&self, root: &Path, rel: &str, sha: &str) -> Result<Vec<u8>> {
        match self {
            Self::History(_) => read_object(root, sha),
            Self::Disk(_) => {
                fs::read(root.join(rel)).map_err(|e| GitError::io("read", &root.join(rel), e))
            }
        }
    }
}

fn line_count(text: &str) -> usize {
    if text.is_empty() {
        0
    } else {
        text.split('\n').count() - usize::from(text.ends_with('\n'))
    }
}

fn diff_sides(root: &Path, from: &Side, to: &Side) -> Vec<FileChange> {
    let paths: BTreeSet<&String> = from.files().keys().chain(to.files().keys()).collect();
    let mut out = Vec::new();
    for rel in paths {
        let (a, b) = (from.files().get(rel), to.files().get(rel));
        if a == b {
            continue;
        }
        let status = match (a, b) {
            (None, _) => ChangeStatus::Added,
            (_, None) => ChangeStatus::Removed,
            _ => ChangeStatus::Modified,
        };
        let binary = !is_text(rel);
        let (mut added, mut removed) = (0, 0);
        if !binary {
            let text = |side: &Side, sha: Option<&String>| -> Option<String> {
                match sha {
                    None => Some(String::new()),
                    Some(sha) => side
                        .read(root, rel, sha)
                        .ok()
                        .map(|b| String::from_utf8_lossy(&b).into_owned()),
                }
            };
            // a stored file still to arrive from another computer: no line counts, rather than no listing
            if let (Some(before), Some(after)) = (text(from, a), text(to, b)) {
                (added, removed) = match (a, b) {
                    (None, _) => (line_count(&after), 0),
                    (_, None) => (0, line_count(&before)),
                    _ => count_lines(&before, &after),
                };
            }
        }
        out.push(FileChange {
            path: rel.clone(),
            status,
            added,
            removed,
            binary,
        });
    }
    out
}

fn find(versions: &[Version], id: u64) -> Result<usize> {
    versions
        .iter()
        .position(|v| v.id == id)
        .ok_or(GitError::NotFound)
}

/// Every checkpoint, newest first. Puts back index.json entries another computer's index.json dropped,
/// for 2.8 and 1.7.0, which otherwise don't list them.
pub fn list(root: &Path) -> Result<Vec<Checkpoint>> {
    let listing = read_versions(root)?;
    if listing.unindexed {
        // listing still works where index.json can't be written
        let _ = locked(&history_dir(root), || -> Result<()> {
            let mut again = read_versions(root)?;
            if again.unindexed {
                write_index(root, &mut again.versions)?;
            }
            Ok(())
        });
    }
    Ok(listing.versions.iter().rev().map(shown).collect())
}

/// An id another computer won't also make: the second since 2026 and three more digits.
fn new_id(root: &Path, versions: &[Version]) -> u64 {
    let taken: HashSet<u64> = versions.iter().map(|v| v.id).collect();
    // ponytail: the three digits come from the clock's nanoseconds rather than a random source; the loop
    // below still skips any id taken here
    let nanos = u64::from(chrono::Utc::now().timestamp_subsec_nanos());
    let secs = u64::try_from((now_ms() - EPOCH_2026_MS).max(0) / 1000).unwrap_or(0);
    let mut id = secs * 1000 + nanos % 1000;
    while taken.contains(&id) || manifest_path(root, id).exists() {
        id += 1;
    }
    id
}

// one port of 2.8's saveVersion, kept whole so the two read side by side
#[allow(clippy::too_many_lines)]
fn save(root: &Path, label: &str, reason: Reason) -> Result<Created> {
    let label: String = label.chars().take(120).collect();
    let mut listing = read_versions(root)?;
    let snap = snapshot(root, true)?;
    let mut files = snap.files;
    let latest = listing.versions.last().cloned();
    // a file that can't be read now keeps what the latest version had of it
    for rel in &snap.skipped {
        if let Some(sha) = latest.as_ref().and_then(|l| l.files.get(rel)) {
            files.insert(rel.clone(), sha.clone());
        }
    }
    let mut skipped = snap.skipped.clone();
    skipped.extend(snap.large.iter().cloned());
    if let Some(latest) = latest.as_ref().filter(|l| l.files == files) {
        // asked for, and only matching a compile's that the next compile would replace: that one becomes it
        if latest.reason == Reason::Compile
            && latest.label.is_empty()
            && (reason != Reason::Compile || !label.is_empty())
        {
            let at = listing.versions.len() - 1;
            let v = &mut listing.versions[at];
            v.created_at = now_iso();
            v.reason = reason;
            v.label.clone_from(&label);
            let path = manifest_path(root, v.id);
            let mut data = match fs::read(&path)
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
            {
                Some(Value::Object(m)) => m,
                _ => serde_json::Map::new(),
            };
            data.extend(v.details());
            write_json(&path, &Value::Object(data))?;
            v.manifest_label = Some(v.label.clone());
            let checkpoint = shown(v);
            write_index(root, &mut listing.versions)?;
            return Ok(Created {
                checkpoint,
                unchanged: true,
                skipped,
            });
        }
        return Ok(Created {
            checkpoint: shown(latest),
            unchanged: true,
            skipped,
        });
    }
    // compiles leave at most one checkpoint every 10 minutes, unless one was named, and never in place of
    // the only copy of what a restore replaced
    let since = latest
        .as_ref()
        .map(|l| l.since.clone().unwrap_or_else(|| l.created_at.clone()));
    let restored = listing
        .versions
        .iter()
        .take(listing.versions.len().saturating_sub(1))
        .any(|v| v.files == files);
    let replaceable = reason == Reason::Compile
        && latest
            .as_ref()
            .is_some_and(|l| l.reason == Reason::Compile && l.label.is_empty())
        && !restored
        && since
            .as_deref()
            .and_then(parse_iso_ms)
            .is_some_and(|s| now_ms() - s < COMPILE_WINDOW_MS);
    let replaced = if replaceable {
        listing.versions.pop()
    } else {
        None
    };
    let empty = BTreeMap::new();
    let previous = listing.versions.last();
    let changes = diff_sides(
        root,
        &Side::History(previous.map_or(&empty, |p| &p.files)),
        &Side::History(&files),
    );
    let kind = if previous.is_none() {
        "initial"
    } else if changes.len() == 1 {
        "edited"
    } else {
        "updated"
    };
    let mut version = Version {
        id: new_id(root, &listing.versions),
        number: listing.versions.iter().map(|v| v.number).max().unwrap_or(0) + 1,
        created_at: now_iso(),
        label: label.clone(),
        manifest_label: Some(label),
        reason,
        summary: json!({
            "kind": kind,
            "files": changes.iter().map(|c| c.path.clone()).collect::<Vec<_>>(),
            "added": changes.iter().map(|c| c.added).sum::<usize>(),
            "removed": changes.iter().map(|c| c.removed).sum::<usize>(),
        }),
        files: files.clone(),
        since: replaced.as_ref().and(since),
    };
    let mut manifest = serde_json::Map::new();
    manifest.insert("files".into(), json!(files));
    if !snap.skipped.is_empty() {
        manifest.insert("skipped".into(), json!(snap.skipped));
    }
    manifest.extend(version.details());
    if let Some(since) = &version.since {
        manifest.insert("since".into(), json!(since));
    }
    write_json(&manifest_path(root, version.id), &Value::Object(manifest))?;
    let gone = replaced
        .as_ref()
        .is_some_and(|r| fs::remove_file(manifest_path(root, r.id)).is_ok());
    let checkpoint = shown(&version);
    version.number = checkpoint.number;
    listing.versions.push(version);
    write_index(root, &mut listing.versions)?;
    // the stored files only the replaced one used that this run wrote; not while a manifest can't be read
    if let (true, false, Some(replaced)) = (gone, listing.partial, replaced) {
        let used: HashSet<&String> = listing
            .versions
            .iter()
            .flat_map(|v| v.files.values())
            .collect();
        let mut written = WRITTEN
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for sha in replaced.files.values().collect::<BTreeSet<_>>() {
            let target = object_path(root, sha);
            if !used.contains(sha) && written.remove(&target) {
                let _ = fs::remove_file(target);
            }
        }
    }
    Ok(Created {
        checkpoint,
        unchanged: false,
        skipped,
    })
}

/// Saves a checkpoint unless nothing changed since the latest one (then returns that one, `unchanged`).
/// `label` is cut to 120 characters. A compile's checkpoint replaces the last compile's within 10 minutes.
pub fn create(root: &Path, label: &str, reason: Reason) -> Result<Created> {
    locked(&history_dir(root), || save(root, label, reason))
}

/// What a checkpoint changed compared with the one before it.
pub fn changes(root: &Path, id: u64) -> Result<Vec<FileChange>> {
    let versions = read_versions(root)?.versions;
    let at = find(&versions, id)?;
    let empty = BTreeMap::new();
    let before = if at > 0 {
        &versions[at - 1].files
    } else {
        &empty
    };
    Ok(diff_sides(
        root,
        &Side::History(before),
        &Side::History(&versions[at].files),
    ))
}

/// What differs going from checkpoint `from` to checkpoint `to`.
pub fn compare(root: &Path, from: u64, to: u64) -> Result<Vec<FileChange>> {
    let (a, _) = read_manifest(root, from)?;
    let (b, _) = read_manifest(root, to)?;
    Ok(diff_sides(root, &Side::History(&a), &Side::History(&b)))
}

/// What differs going from a checkpoint to the files on disk now.
pub fn compare_with_current(root: &Path, id: u64) -> Result<Vec<FileChange>> {
    let (files, _) = read_manifest(root, id)?;
    let disk = snapshot(root, false)?;
    let tracked: HashSet<String> = tracked_files(root)?.0.into_iter().collect();
    Ok(
        diff_sides(root, &Side::History(&files), &Side::Disk(&disk.files))
            .into_iter()
            .map(|c| {
                if c.status == ChangeStatus::Removed
                    && !tracked.contains(&c.path)
                    && root.join(&c.path).exists()
                {
                    FileChange {
                        status: ChangeStatus::Untracked,
                        added: 0,
                        removed: 0,
                        ..c
                    }
                } else {
                    c
                }
            })
            .collect(),
    )
}

/// A file's bytes as a checkpoint holds them.
pub fn read_file(root: &Path, id: u64, rel: &str) -> Result<Vec<u8>> {
    let (files, _) = read_manifest(root, id)?;
    read_object(root, files.get(rel).ok_or(GitError::NotInCheckpoint)?)
}

/// One file's diff from checkpoint `from` (`None`: nothing) to checkpoint `to` (`None`: the disk now).
pub fn file_diff(root: &Path, from: Option<u64>, to: Option<u64>, rel: &str) -> Result<FileDiff> {
    let side = |id: Option<u64>, disk: bool| -> Result<Vec<u8>> {
        match id {
            Some(id) => match read_file(root, id, rel) {
                Err(GitError::NotInCheckpoint) => Ok(Vec::new()),
                other => other,
            },
            None if disk => Ok(crate::util::read_if_exists(&join(root, rel)?)?.unwrap_or_default()),
            None => Ok(Vec::new()),
        }
    };
    Ok(diff_bytes(&side(from, false)?, &side(to, true)?))
}

/// Restores the whole project, or one file, after a safety checkpoint of what's there. Untracked files the
/// restore would overwrite are moved aside first. The caller holds the project's file lock (saves, pulls).
pub fn restore(root: &Path, id: u64, rel: Option<&str>) -> Result<Restored> {
    locked(&history_dir(root), || {
        let (files, skipped) = read_manifest(root, id)?;
        if let Some(rel) = rel {
            join(root, rel)?;
            if skipped.contains(rel) {
                return Err(GitError::SkippedFile);
            }
        }
        // a checkpoint from another computer whose stored files haven't all synced would only half restore
        let needed: BTreeSet<&String> = match rel {
            Some(rel) => files.get(rel).into_iter().collect(),
            None => files.values().collect(),
        };
        if needed.iter().any(|sha| !object_path(root, sha).exists()) {
            return Err(GitError::NotArrived);
        }
        let safety = save(root, "", Reason::BeforeRestore)?;
        let (tracked, _, _) = tracked_files(root)?;
        let tracked_set: HashSet<&String> = tracked.iter().collect();
        let targets: BTreeSet<String> = match rel {
            Some(rel) => [rel.to_owned()].into(),
            None => tracked.iter().chain(files.keys()).cloned().collect(),
        };
        let mut kept_aside = Vec::new();
        for rel in targets {
            if skipped.contains(&rel) {
                continue;
            }
            // no checkpoint holds the app's data or the repository: a manifest that names them isn't followed
            if rel
                .split('/')
                .any(|p| p.eq_ignore_ascii_case(".spectrum") || p.eq_ignore_ascii_case(".git"))
            {
                continue;
            }
            let abs = join(root, &rel)?;
            if files.contains_key(&rel) && !tracked_set.contains(&rel) && abs.exists() {
                let name = abs.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                let ext = extname(name);
                let stem = &name[..name.len() - ext.len()];
                let mut aside = abs.with_file_name(format!("{stem} (before restore){ext}"));
                for n in 2.. {
                    if fs::symlink_metadata(&aside).is_err() {
                        break;
                    }
                    aside = abs.with_file_name(format!("{stem} (before restore)-{n}{ext}"));
                }
                fs::rename(&abs, &aside).map_err(|e| GitError::io("move", &abs, e))?;
                let rel_aside = aside
                    .strip_prefix(root)
                    .ok()
                    .and_then(crate::util::slash)
                    .unwrap_or_default();
                kept_aside.push(rel_aside);
            }
            match files.get(&rel) {
                Some(sha) => {
                    // a link keeps its target
                    let target = fs::canonicalize(&abs).unwrap_or(abs);
                    crate::util::write_atomic(&target, &read_object(root, sha)?)?;
                }
                None => match fs::remove_file(&abs) {
                    Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                        return Err(GitError::io("delete", &abs, e));
                    }
                    _ => {}
                },
            }
        }
        Ok(Restored {
            safety: (!safety.unchanged).then_some(safety.checkpoint),
            kept_aside,
        })
    })
}

/// Renames a checkpoint (cut to 120 characters).
pub fn rename(root: &Path, id: u64, label: &str) -> Result<Checkpoint> {
    locked(&history_dir(root), || {
        let mut versions = read_versions(root)?.versions;
        let at = find(&versions, id)?;
        versions[at].label = label.chars().take(120).collect();
        let path = manifest_path(root, id);
        let Some(Value::Object(mut data)) = fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
        else {
            return Err(GitError::NotFound);
        };
        data.extend(versions[at].details());
        write_json(&path, &Value::Object(data))?;
        versions[at].manifest_label = Some(versions[at].label.clone());
        let out = shown(&versions[at]);
        write_index(root, &mut versions)?;
        Ok(out)
    })
}

/// Deletes a checkpoint, then the stored files nothing uses that came more than 90 days ago.
pub fn delete(root: &Path, id: u64) -> Result<()> {
    locked(&history_dir(root), || {
        let listing = read_versions(root)?;
        let mut versions = listing.versions;
        let removed = versions.remove(find(&versions, id)?);
        remove_versions(root, &[removed], &mut versions, listing.partial)
    })
}

/// Deletes compiles' checkpoints (unless named) saved more than `days` days ago; returns how many went.
pub fn delete_automatic(root: &Path, days: u32) -> Result<usize> {
    locked(&history_dir(root), || {
        let listing = read_versions(root)?;
        let cutoff = now_ms() - i64::from(days) * DAY_MS;
        let (old, mut rest): (Vec<Version>, Vec<Version>) =
            listing.versions.into_iter().partition(|v| {
                v.reason == Reason::Compile
                    && v.label.is_empty()
                    && parse_iso_ms(&v.created_at).is_some_and(|t| t < cutoff)
            });
        if !old.is_empty() {
            remove_versions(root, &old, &mut rest, listing.partial)?;
        }
        Ok(old.len())
    })
}

fn remove_versions(
    root: &Path,
    removed: &[Version],
    versions: &mut [Version],
    partial: bool,
) -> Result<()> {
    for v in removed {
        let _ = fs::remove_file(manifest_path(root, v.id));
    }
    write_index(root, versions)?;
    if partial {
        return Ok(());
    }
    let used: HashSet<&String> = versions.iter().flat_map(|v| v.files.values()).collect();
    // ponytail: a stored file goes only when nothing here uses it and it came over 90 days ago, as another
    // computer's checkpoint may still be on its way through a sync app (2.8's rule)
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_hours(2160);
    let objects = history_dir(root).join("objects");
    for shard in fs::read_dir(&objects).into_iter().flatten().flatten() {
        for entry in fs::read_dir(shard.path()).into_iter().flatten().flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if used.contains(&name.trim_end_matches(".gz").to_owned()) {
                continue;
            }
            let old = entry
                .metadata()
                .and_then(|m| m.modified())
                .is_ok_and(|t| t < cutoff);
            if old {
                let _ = fs::remove_file(entry.path());
            }
        }
        let _ = fs::remove_dir(shard.path());
    }
    Ok(())
}
