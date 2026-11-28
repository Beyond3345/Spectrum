//! Small shared helpers: hashes, atomic writes, '/'-separated paths, time, and the name rules 2.8 shares
//! between checkpoints and GitHub.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex, PoisonError};

use regex::{Regex, RegexBuilder};
use sha2::{Digest, Sha256};
use unicode_normalization::UnicodeNormalization;

use crate::error::{GitError, Result};

pub(crate) fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

/// A temp file name beside `path` that no other writer in this run picks.
pub(crate) fn temp_beside(path: &Path) -> PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(
        ".{}-{}-{}.tmp",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed),
        now_ms()
    ));
    path.with_file_name(name)
}

/// Writes through a temp file beside `path` and a rename, so no reader sees half a file. Makes the folders.
pub(crate) fn write_atomic(path: &Path, data: &[u8]) -> Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| GitError::io("create", dir, e))?;
    }
    let tmp = temp_beside(path);
    let done = fs::write(&tmp, data).and_then(|()| fs::rename(&tmp, path));
    if let Err(err) = done {
        let _ = fs::remove_file(&tmp);
        return Err(GitError::io("write", path, err));
    }
    Ok(())
}

/// JSON as 2.8's `writeJsonAtomic` writes it: two-space indent.
pub(crate) fn write_json(path: &Path, value: &serde_json::Value) -> Result<()> {
    let text = serde_json::to_vec_pretty(value).unwrap_or_default();
    write_atomic(path, &text)
}

/// The file's bytes, `None` when it isn't there.
pub(crate) fn read_if_exists(path: &Path) -> Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(err)
            if matches!(
                err.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
            ) =>
        {
            Ok(None)
        }
        Err(err) => Err(GitError::io("read", path, err)),
    }
}

/// A path from the project's folder as 2.8 stores one: '/'-separated. `None` for a name that isn't UTF-8.
pub(crate) fn slash(rel: &Path) -> Option<String> {
    let parts: Option<Vec<&str>> = rel.components().map(|c| c.as_os_str().to_str()).collect();
    parts.map(|p| p.join("/"))
}

/// `root` joined with a '/'-separated path, refusing anything that climbs out (`..`, an absolute path, a drive).
pub(crate) fn join(root: &Path, rel: &str) -> Result<PathBuf> {
    let mut out = root.to_path_buf();
    for part in rel.split('/') {
        let p = Path::new(part);
        match p.components().next() {
            None => {}
            Some(Component::Normal(_)) if p.components().count() == 1 => out.push(part),
            _ => return Err(GitError::OutsideProject),
        }
    }
    if out == root {
        return Err(GitError::OutsideProject);
    }
    Ok(out)
}

pub(crate) fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// JavaScript's `new Date().toISOString()`.
pub(crate) fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// JavaScript's `Date.parse` for an ISO date, in ms; `None` when it isn't one.
pub(crate) fn parse_iso_ms(text: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|d| d.timestamp_millis())
}

/// A path folded as APFS folds names, in letter case and Unicode form (2.8's `keyOf`).
pub(crate) fn key_of(rel: &str) -> String {
    rel.nfc().collect::<String>().to_lowercase()
}

pub(crate) fn nfc(text: &str) -> String {
    text.nfc().collect()
}

const TEXT_EXTENSIONS: [&str; 22] = [
    "tex", "bib", "sty", "cls", "bst", "txt", "md", "json", "yaml", "yml", "csv", "tsv", "bbx",
    "cbx", "lbx", "cfg", "def", "clo", "ltx", "mmd", "typ", "markdown",
];

/// Whether 2.8 diffs a file by lines (its `isText`, by extension).
pub fn is_text(rel: &str) -> bool {
    extname(rel.rsplit('/').next().unwrap_or(rel))
        .strip_prefix('.')
        .is_some_and(|ext| TEXT_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

/// Node's `path.extname`: from the last '.', unless that starts the name.
pub(crate) fn extname(name: &str) -> &str {
    match name.rfind('.') {
        Some(i) if i > 0 => &name[i..],
        _ => "",
    }
}

fn caseless(pattern: &str) -> Option<Regex> {
    RegexBuilder::new(pattern)
        .case_insensitive(true)
        .build()
        .ok()
}

// 2.8's SECRET_NAME: an .env file, a file of credentials, a private key or a keystore
static SECRET_NAME: LazyLock<Option<Regex>> = LazyLock::new(|| {
    caseless(
        r"^(?:\.env(\..*)?|\.netrc|\.npmrc|\.pypirc|id_rsa|id_dsa|id_ecdsa|id_ed25519|.*\.(pem|p12|pfx|keystore|jks|ppk))$",
    )
});

/// A file name GitHub backups and the settings repository leave out.
pub fn secret_looking(rel: &str) -> bool {
    let name = rel.rsplit('/').next().unwrap_or(rel);
    SECRET_NAME.as_ref().is_some_and(|re| re.is_match(name))
}

static SYNOLOGY: LazyLock<Option<Regex>> = LazyLock::new(|| {
    caseless(
        r"^(.+)_(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{1,2}-\d{4}(?:\d{2})?-\d{4}_[A-Za-z]*Conflict[A-Za-z]*(?:_\d+)?$",
    )
});
static DROPBOX: LazyLock<Option<Regex>> = LazyLock::new(|| {
    caseless(
        r"^(.*\S) \((?:[^()]*conflicted copy[^()]*(?:\(\d+\))?|case conflict(?: \d+)?|unicode encoding conflict)\)(?: \(\d+\))?$",
    )
});

/// 2.8's `looksLikeConflictCopy`: a Synology or Dropbox conflict copy's name (a pull's own copy is one too).
pub(crate) fn looks_like_conflict_copy(name: &str) -> bool {
    let stem = &name[..name.len() - extname(name).len()];
    [&SYNOLOGY, &DROPBOX].iter().any(|re| {
        re.as_ref()
            .is_some_and(|re| re.is_match(stem) || re.is_match(name))
    })
}

/// One lock per folder (a project's history, a repository), so two writers never interleave.
pub(crate) fn lock_for(path: &Path) -> Arc<Mutex<()>> {
    static LOCKS: LazyLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = LazyLock::new(Mutex::default);
    let key = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    LOCKS
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .entry(key)
        .or_default()
        .clone()
}

/// `f` under `path`'s lock.
pub(crate) fn locked<T>(path: &Path, f: impl FnOnce() -> T) -> T {
    let lock = lock_for(path);
    let _held = lock.lock().unwrap_or_else(PoisonError::into_inner);
    f()
}
