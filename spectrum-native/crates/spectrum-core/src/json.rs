//! JSON files on disk: atomic writes, one writer per file, and reads that never mistake a broken file for
//! an empty one.

use std::collections::HashMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock};

use parking_lot::Mutex;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

use crate::CoreError;

/// One lock per file, so read-modify-write cycles on it never interleave.
// ponytail: the map only grows (one entry per settings file touched); prune it if that ever adds up
static LOCKS: LazyLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = LazyLock::new(Mutex::default);

pub(crate) fn lock_for(path: &Path) -> Arc<Mutex<()>> {
    LOCKS.lock().entry(path.to_path_buf()).or_default().clone()
}

/// The file as a JSON object; `None` when it doesn't exist; `Unreadable` when it exists but isn't one.
pub(crate) fn read_object(path: &Path) -> Result<Option<Map<String, Value>>, CoreError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(CoreError::io("couldn't read", path, err)),
    };
    match serde_json::from_slice(&bytes) {
        Ok(Value::Object(map)) => Ok(Some(map)),
        _ => Err(CoreError::Unreadable {
            path: path.to_path_buf(),
        }),
    }
}

/// `T` from `map`, field by field: a field of the wrong type keeps `T::default()`'s value, as 2.8's settings
/// parse does, rather than failing the whole file. Unknown fields land in `T`'s flattened `extra`.
// ponytail: one trial parse per field (O(n²) in fields, ~100 µs for AppSettings); per-field
// deserialisers if it ever shows in a profile
pub(crate) fn lenient<T: Serialize + DeserializeOwned + Default>(map: Map<String, Value>) -> T {
    let mut base = match serde_json::to_value(T::default()) {
        Ok(Value::Object(base)) => base,
        _ => Map::new(),
    };
    for (key, value) in map {
        let previous = base.insert(key.clone(), value);
        if serde_json::from_value::<T>(Value::Object(base.clone())).is_err() {
            tracing::warn!(field = %key, "settings field of the wrong type; keeping the default");
            match previous {
                Some(previous) => base.insert(key, previous),
                None => base.remove(&key),
            };
        }
    }
    serde_json::from_value(Value::Object(base)).unwrap_or_default()
}

/// `value` as 2.8 writes JSON (two-space indent, no trailing newline), atomically.
pub(crate) fn write_pretty<T: Serialize>(path: &Path, value: &T) -> Result<(), CoreError> {
    let text = serde_json::to_vec_pretty(value).map_err(|source| CoreError::Json {
        path: path.to_path_buf(),
        source,
    })?;
    write_atomic(path, &text)
}

/// Writes through a temp file in the same folder and a rename, so readers never see half a file. Keeps the
/// file's permissions.
pub(crate) fn write_atomic(path: &Path, data: &[u8]) -> Result<(), CoreError> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let dir = path.parent().unwrap_or(Path::new("."));
    fs::create_dir_all(dir).map_err(|e| CoreError::io("couldn't create", dir, e))?;
    let mut tmp_name = path.file_name().unwrap_or_default().to_os_string();
    tmp_name.push(format!(
        ".{}.{}.tmp",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let tmp = dir.join(tmp_name);
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(data)?;
        file.sync_all()?;
        if let Ok(meta) = fs::metadata(path) {
            let perms = meta.permissions();
            // the new file is writable on Windows, as rename_over leaves the old one
            #[cfg(windows)]
            #[allow(clippy::permissions_set_readonly_false)]
            let perms = {
                let mut perms = perms;
                perms.set_readonly(false);
                perms
            };
            fs::set_permissions(&tmp, perms)?;
        }
        rename_over(&tmp, path)
    })();
    if let Err(err) = result {
        let _ = fs::remove_file(&tmp);
        return Err(CoreError::io("couldn't write", path, err));
    }
    Ok(())
}

/// `fs::rename`, retried for a few seconds on Windows, which refuses while a virus scanner, the search
/// indexer or a sync client holds the target open for a moment after each write.
pub(crate) fn rename_over(from: &Path, to: &Path) -> io::Result<()> {
    #[cfg(windows)]
    if let Ok(meta) = fs::symlink_metadata(to) {
        let mut perms = meta.permissions();
        if meta.is_file() && perms.readonly() {
            #[allow(clippy::permissions_set_readonly_false)]
            perms.set_readonly(false);
            fs::set_permissions(to, perms)?;
        }
    }
    let mut wait = 50;
    loop {
        match fs::rename(from, to) {
            Err(err) if cfg!(windows) && wait <= 1600 && retryable(&err) => {
                std::thread::sleep(std::time::Duration::from_millis(wait));
                wait *= 2;
            }
            other => return other,
        }
    }
}

/// Access denied (5), sharing violation (32), lock violation (33).
fn retryable(err: &io::Error) -> bool {
    err.kind() == io::ErrorKind::PermissionDenied || matches!(err.raw_os_error(), Some(5 | 32 | 33))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_replaces_and_leaves_no_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("sub").join("a.json");
        write_atomic(&file, b"one").unwrap();
        write_atomic(&file, b"two").unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"two");
        assert_eq!(fs::read_dir(file.parent().unwrap()).unwrap().count(), 1);
    }

    #[test]
    fn read_object_tells_missing_from_broken() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.json");
        assert!(read_object(&file).unwrap().is_none());
        fs::write(&file, "[1]").unwrap();
        assert!(matches!(
            read_object(&file),
            Err(CoreError::Unreadable { .. })
        ));
        fs::write(&file, "{\"a\":").unwrap();
        assert!(matches!(
            read_object(&file),
            Err(CoreError::Unreadable { .. })
        ));
    }
}
