//! `.spectrum/history` on disk, exactly as 2.8 (and 1.7.0 before it) keeps it:
//!   objects/<sha[0:2]>/<sha>.gz   gzipped file bytes, by the SHA-256 of the bytes
//!   manifests/<id>.json           { files: { rel: sha }, skipped?, createdAt, label, reason, summary, since? }
//!   index.json                    { nextId, versions: [{ id, createdAt, label, reason, summary, manifestLabel? }] }

use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, PoisonError};

use flate2::Compression;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use serde_json::{Map, Value, json};
use spectrum_core::project::{EntryKind, scan_tree};

use super::Reason;
use crate::compiled::compiled_pdfs;
use crate::error::{GitError, Result};
use crate::util::{read_if_exists, sha256_hex, slash, write_atomic, write_json};

/// 1.7.0's ids count from 1; every id made since is far above.
pub(super) const LEGACY_IDS: u64 = 1_000_000_000;
const MAX_TRACKED_BYTES: u64 = 50 * 1024 * 1024;
/// JavaScript's `Number.MAX_SAFE_INTEGER`.
const MAX_ID: u64 = (1 << 53) - 1;

pub(super) fn history_dir(root: &Path) -> PathBuf {
    root.join(".spectrum").join("history")
}
pub(super) fn object_path(root: &Path, sha: &str) -> PathBuf {
    history_dir(root)
        .join("objects")
        .join(sha.get(..2).unwrap_or("00"))
        .join(format!("{sha}.gz"))
}
pub(super) fn manifest_path(root: &Path, id: u64) -> PathBuf {
    history_dir(root)
        .join("manifests")
        .join(format!("{id}.json"))
}
fn index_path(root: &Path) -> PathBuf {
    history_dir(root).join("index.json")
}

/// Stored files this run wrote, which a compile's checkpoint taking another's place may remove again.
pub(super) static WRITTEN: LazyLock<Mutex<HashSet<PathBuf>>> = LazyLock::new(Mutex::default);

/// A checkpoint as read from disk.
#[derive(Debug, Clone)]
pub(super) struct Version {
    pub id: u64,
    pub number: u64,
    pub created_at: String,
    pub label: String,
    /// The label the manifest had when index.json was last written (tells a 1.7.0 rename apart).
    pub manifest_label: Option<String>,
    pub reason: Reason,
    pub summary: Value,
    pub files: BTreeMap<String, String>,
    pub since: Option<String>,
}

impl Version {
    pub fn details(&self) -> Map<String, Value> {
        let mut m = Map::new();
        m.insert("createdAt".into(), json!(self.created_at));
        m.insert("label".into(), json!(self.label));
        m.insert("reason".into(), json!(self.reason.as_str()));
        m.insert("summary".into(), self.summary.clone());
        m
    }
}

/// JavaScript's `String(x || '')`.
pub(super) fn js_string(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null | Value::Bool(false)) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) if n.as_f64() == Some(0.0) => String::new(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(true)) => "true".into(),
        Some(other) => other.to_string(),
    }
}

fn read_json(path: &Path) -> Result<Option<Value>> {
    match read_if_exists(path)? {
        None => Ok(None),
        Some(bytes) => Ok(serde_json::from_slice(&bytes).ok()),
    }
}

fn files_of(data: &Value) -> BTreeMap<String, String> {
    data.get("files")
        .and_then(Value::as_object)
        .map(|m| {
            m.iter()
                .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_owned())))
                .collect()
        })
        .unwrap_or_default()
}

fn skipped_of(data: &Value) -> BTreeSet<String> {
    data.get("skipped")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

pub(super) struct Index {
    pub next_id: u64,
    pub versions: Vec<Value>,
    pub missing: bool,
}

pub(super) fn read_index(root: &Path) -> Result<Index> {
    let path = index_path(root);
    let Some(bytes) = read_if_exists(&path)? else {
        return Ok(Index {
            next_id: 1,
            versions: Vec::new(),
            missing: true,
        });
    };
    // 2.8 throws on a broken index.json; a listing that fails over it helps no one, so it reads as empty
    let data: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    Ok(Index {
        next_id: data
            .get("nextId")
            .and_then(Value::as_u64)
            .filter(|n| *n > 0)
            .unwrap_or(1),
        versions: data
            .get("versions")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        missing: false,
    })
}

/// One checkpoint's files from its manifest.
pub(super) fn read_manifest(
    root: &Path,
    id: u64,
) -> Result<(BTreeMap<String, String>, BTreeSet<String>)> {
    if id == 0 || id > MAX_ID {
        return Err(GitError::NotFound);
    }
    let data = read_json(&manifest_path(root, id))?.ok_or(GitError::NotFound)?;
    Ok((files_of(&data), skipped_of(&data)))
}

pub(super) struct Listing {
    pub versions: Vec<Version>,
    /// A manifest couldn't be read (still arriving from another computer).
    pub partial: bool,
    /// index.json misses a version this build made.
    pub unindexed: bool,
}

/// Every checkpoint whose manifest is on disk, oldest first, numbered as 2.8 numbers them.
pub(super) fn read_versions(root: &Path) -> Result<Listing> {
    let index = read_index(root)?;
    let from_index: BTreeMap<u64, &Value> = index
        .versions
        .iter()
        .filter_map(|v| Some((v.get("id")?.as_u64()?, v)))
        .collect();
    let dir = history_dir(root).join("manifests");
    let mut versions = Vec::new();
    let (mut partial, mut unindexed) = (false, false);
    let names = match fs::read_dir(&dir) {
        Ok(read) => read
            .filter_map(|e| e.ok()?.file_name().into_string().ok())
            .collect(),
        Err(_) => Vec::new(),
    };
    for name in names {
        let Some(id) = name
            .strip_suffix(".json")
            .filter(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
            .and_then(|s| s.parse::<u64>().ok())
            .filter(|id| (1..=MAX_ID).contains(id))
        else {
            continue;
        };
        let path = dir.join(&name);
        let Ok(Some(data)) = read_json(&path) else {
            partial = true;
            continue;
        };
        if !data.is_object() {
            partial = true;
            continue;
        }
        let entry = from_index.get(&id).copied();
        let own = !js_string(data.get("createdAt")).is_empty();
        if own && entry.is_none() && !index.missing {
            unindexed = true;
        }
        let mtime;
        let meta: &Value = if own {
            &data
        } else if let Some(e) = entry {
            e
        } else {
            let at = fs::metadata(&path)
                .and_then(|m| m.modified())
                .map(chrono::DateTime::<chrono::Utc>::from)
                .unwrap_or_default();
            mtime = json!({ "createdAt": at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true) });
            &mtime
        };
        let manifest_label = own.then(|| js_string(data.get("label")));
        let renamed = own
            && entry.is_some_and(|e| {
                e.get("manifestLabel").and_then(Value::as_str) == manifest_label.as_deref()
                    && js_string(e.get("label")) != manifest_label.clone().unwrap_or_default()
            });
        let label_from = if renamed { entry.unwrap_or(meta) } else { meta };
        let summary = meta
            .get("summary")
            .filter(|s| s.is_object())
            .cloned()
            .unwrap_or_else(|| json!({ "kind": "updated", "files": [], "added": 0, "removed": 0 }));
        versions.push(Version {
            id,
            number: 0,
            created_at: js_string(meta.get("createdAt")),
            label: js_string(label_from.get("label")),
            manifest_label,
            reason: Reason::parse(meta.get("reason").and_then(Value::as_str).unwrap_or("")),
            summary,
            files: files_of(&data),
            since: data.get("since").and_then(Value::as_str).map(str::to_owned),
        });
    }
    versions.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.id.cmp(&b.id)));
    let mut shown = 0;
    for v in &mut versions {
        // a 1.7.0 id another version's number already took counts on
        v.number = if v.id < LEGACY_IDS && v.id > shown {
            v.id
        } else {
            shown + 1
        };
        shown = shown.max(v.number);
    }
    Ok(Listing {
        versions,
        partial,
        unindexed,
    })
}

/// index.json with every version on disk (oldest first) and a nextId above them all, for 1.7.0.
pub(super) fn write_index(root: &Path, versions: &mut [Version]) -> Result<()> {
    let old = read_index(root)?;
    let ids: HashSet<u64> = versions.iter().map(|v| v.id).collect();
    // a manifest that couldn't be read keeps its entry; a deleted version's manifest is gone by now
    let kept: Vec<Value> = old
        .versions
        .iter()
        .filter(|v| {
            v.get("id")
                .and_then(Value::as_u64)
                .is_some_and(|id| !ids.contains(&id) && manifest_path(root, id).exists())
        })
        .cloned()
        .collect();
    for v in versions.iter_mut() {
        if v.manifest_label.is_none() || v.manifest_label.as_deref() == Some(v.label.as_str()) {
            continue;
        }
        // renamed in 1.7.0: the manifest takes the label too
        let path = manifest_path(root, v.id);
        let Ok(Some(Value::Object(mut data))) = read_json(&path) else {
            continue;
        };
        data.insert("label".into(), json!(v.label));
        write_json(&path, &Value::Object(data))?;
        v.manifest_label = Some(v.label.clone());
    }
    let mut entries: Vec<Value> = kept.clone();
    for v in versions.iter() {
        let mut e = Map::new();
        e.insert("id".into(), json!(v.id));
        e.extend(v.details());
        if let Some(label) = &v.manifest_label {
            e.insert("manifestLabel".into(), json!(label));
        }
        entries.push(Value::Object(e));
    }
    let next = entries
        .iter()
        .filter_map(|v| v.get("id").and_then(Value::as_u64))
        .map(|id| id + 1)
        .chain([old.next_id])
        .max()
        .unwrap_or(1);
    entries.sort_by(|a, b| {
        js_string(a.get("createdAt"))
            .cmp(&js_string(b.get("createdAt")))
            .then(
                a.get("id")
                    .and_then(Value::as_u64)
                    .cmp(&b.get("id").and_then(Value::as_u64)),
            )
    });
    write_json(
        &index_path(root),
        &json!({ "nextId": next, "versions": entries }),
    )
}

pub(super) fn read_object(root: &Path, sha: &str) -> Result<Vec<u8>> {
    let path = object_path(root, sha);
    let gz = fs::read(&path).map_err(|e| GitError::io("read", &path, e))?;
    let mut out = Vec::new();
    GzDecoder::new(&gz[..])
        .read_to_end(&mut out)
        .map_err(|e| GitError::io("read", &path, e))?;
    Ok(out)
}

fn store_object(root: &Path, sha: &str, bytes: &[u8]) -> Result<()> {
    let target = object_path(root, sha);
    if target.exists() {
        return Ok(());
    }
    let mut enc = GzEncoder::new(Vec::new(), Compression::default());
    let gz = enc
        .write_all(bytes)
        .and_then(|()| enc.finish())
        .map_err(|e| GitError::io("compress", &target, e))?;
    write_atomic(&target, &gz)?;
    WRITTEN
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .insert(target);
    Ok(())
}

/// The files a checkpoint captures: the visible tree minus compiled PDFs; over 50 MB in `large`; a link
/// out of the project, a name that isn't UTF-8 or a file that can't be read in `skipped`.
pub(super) struct Snapshot {
    pub files: BTreeMap<String, String>,
    pub skipped: Vec<String>,
    pub large: Vec<String>,
}

/// What the tracked files are now, by path; their SHA-256 when `hash`, stored too when `store`.
pub(super) fn tracked_files(root: &Path) -> Result<(Vec<String>, Vec<String>, Vec<String>)> {
    let compiled: HashSet<String> = compiled_pdfs(root)?
        .into_iter()
        .map(|p| p.to_lowercase())
        .collect();
    let real_root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let (mut tracked, mut skipped, mut large) = (Vec::new(), Vec::new(), Vec::new());
    for entry in scan_tree(root)? {
        if entry.kind != EntryKind::File {
            continue;
        }
        let Some(rel) = slash(&entry.rel) else {
            skipped.push(entry.rel.to_string_lossy().replace('\\', "/"));
            continue;
        };
        if compiled.contains(&rel.to_lowercase()) {
            continue;
        }
        let abs = root.join(&entry.rel);
        let inside = fs::canonicalize(&abs).is_ok_and(|real| real.starts_with(&real_root));
        match fs::metadata(&abs) {
            Ok(m) if inside && m.is_file() => {
                if m.len() <= MAX_TRACKED_BYTES {
                    tracked.push(rel);
                } else {
                    large.push(rel);
                }
            }
            // a link to a folder is neither
            Ok(m) if inside && m.is_dir() => {}
            _ => skipped.push(rel),
        }
    }
    tracked.sort();
    Ok((tracked, skipped, large))
}

// ponytail: every file is read and hashed on each checkpoint (2.8 keeps a stat cache); add one keyed on
// size, mtime and inode if a big project's checkpoints get slow
pub(super) fn snapshot(root: &Path, store: bool) -> Result<Snapshot> {
    let (tracked, mut skipped, large) = tracked_files(root)?;
    let mut files = BTreeMap::new();
    for rel in tracked {
        let Ok(bytes) = fs::read(root.join(&rel)) else {
            skipped.push(rel);
            continue;
        };
        let sha = sha256_hex(&bytes);
        if store {
            store_object(root, &sha, &bytes)?;
        }
        files.insert(rel, sha);
    }
    Ok(Snapshot {
        files,
        skipped,
        large,
    })
}
