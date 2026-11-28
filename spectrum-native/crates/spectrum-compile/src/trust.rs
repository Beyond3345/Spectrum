//! Trust this project (2.8's `trustService.js`): the projects whose compiles run unconfined, kept on this computer
//! only (`DATA_DIR/trusted-projects.json`), never in the project's own files, which could then arrive from
//! someone else already trusted. Each by its id, its folder and that folder's identity on the disk (device, file
//! number, time made): a copy, a moved folder or one put in its place inherits nothing.
//! ponytail: a project removed from the list leaves its entry, which matches nothing else

use std::path::{Path, PathBuf};

use serde_json::{Map, Value};
use spectrum_core::AppPaths;

use crate::CompileError;

static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn file(paths: &AppPaths) -> PathBuf {
    paths.data_dir.join("trusted-projects.json")
}

fn read(path: &Path) -> Map<String, Value> {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .and_then(|v| match v {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .unwrap_or_default()
}

/// The folder as the disk knows it, as 2.8 wrote it (`dev:ino:birthtimeNs` on a Mac), or `None` when it isn't a
/// folder.
fn folder_mark(root: &Path) -> Option<String> {
    let meta = std::fs::metadata(root).ok()?;
    if !meta.is_dir() {
        return None;
    }
    let born = meta
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos());
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Some(format!("{}:{}:{born}", meta.dev(), meta.ino()))
    }
    #[cfg(not(unix))]
    {
        // Windows' volume and file index aren't on stable Rust's metadata: the creation time stands alone
        Some(format!("0:0:{born}"))
    }
}

/// Whether the project in this folder is the one the user trusted.
pub fn is_trusted(paths: &AppPaths, id: &str, root: &Path) -> bool {
    let data = read(&file(paths));
    let Some(entry) = data.get(id) else {
        return false;
    };
    entry.get("path").and_then(Value::as_str) == Some(&*root.to_string_lossy())
        && entry.get("folder").and_then(Value::as_str) == folder_mark(root).as_deref()
}

/// Trusts the project in this folder, or stops trusting it; whether it is trusted now.
pub fn set_trusted(
    paths: &AppPaths,
    id: &str,
    root: &Path,
    trusted: bool,
) -> Result<bool, CompileError> {
    let _held = LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let path = file(paths);
    let mut data = read(&path);
    let folder = trusted.then(|| folder_mark(root)).flatten();
    match &folder {
        Some(folder) => {
            data.insert(
                id.to_owned(),
                serde_json::json!({ "path": root.to_string_lossy(), "folder": folder }),
            );
        }
        None => {
            data.remove(id);
        }
    }
    std::fs::create_dir_all(&paths.data_dir)
        .map_err(|e| CompileError::io("couldn't make", &paths.data_dir, e))?;
    let part = path.with_extension("json.part");
    let text = serde_json::to_vec_pretty(&Value::Object(data))?;
    std::fs::write(&part, text).map_err(|e| CompileError::io("couldn't write", &part, e))?;
    std::fs::rename(&part, &path).map_err(|e| CompileError::io("couldn't write", &path, e))?;
    Ok(folder.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trust_follows_the_folder_not_a_copy_or_a_replacement() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(
            dir.path().join("data"),
            dir.path().join("l"),
            dir.path().into(),
        );
        let root = dir.path().join("paper");
        std::fs::create_dir_all(&root).unwrap();
        assert!(!is_trusted(&paths, "p1", &root));
        assert!(set_trusted(&paths, "p1", &root, true).unwrap());
        assert!(is_trusted(&paths, "p1", &root));
        // another id, or another folder at another path
        assert!(!is_trusted(&paths, "p2", &root));
        let copy = dir.path().join("copy");
        std::fs::create_dir_all(&copy).unwrap();
        assert!(!is_trusted(&paths, "p1", &copy));
        // a folder put in its place
        std::fs::remove_dir(&root).unwrap();
        std::fs::create_dir_all(dir.path().join("spare")).unwrap();
        std::fs::rename(dir.path().join("spare"), &root).unwrap();
        assert!(!is_trusted(&paths, "p1", &root));
        assert!(!set_trusted(&paths, "p1", &root, false).unwrap());
        assert!(!is_trusted(&paths, "p1", &root));
    }
}
