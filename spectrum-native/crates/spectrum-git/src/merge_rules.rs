//! How two copies of a project that changed apart come back together, file by file (2.8's `mergeRules.js`):
//! which side a file takes, project.json and settings.json key by key, chats by message, the name of a
//! conflicted copy, paths that differ only in letter case or Unicode form, the brake on deleting many files
//! at once, and a file written only while it still holds what was checked. "Ours" is this computer's copy.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::Path;
use std::sync::LazyLock;

use chrono::{Datelike, Timelike};
use regex::Regex;
use serde_json::{Map, Value, json};

use crate::error::{GitError, Result};
use crate::merge3::merge_text;
use crate::util::{key_of, nfc, now_ms, parse_iso_ms, sha256_hex, temp_beside};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Pick {
    Drop,
    Equal,
    Ours,
    Theirs,
    Merge,
}

/// What a file needs, from the three copies' hashes (`None` where a copy hasn't it). With no base everything
/// on either side stays; a deletion on one side and a change on the other keeps the changed one.
pub(crate) fn decide(base: Option<&str>, ours: Option<&str>, theirs: Option<&str>) -> Pick {
    match (base, ours, theirs) {
        (_, None, None) => Pick::Drop,
        _ if ours == theirs => Pick::Equal,
        (None, Some(_), None) => Pick::Ours,
        (None, None, Some(_)) => Pick::Theirs,
        (None, _, _) => Pick::Merge,
        (b, None, t) => {
            if t == b {
                Pick::Ours
            } else {
                Pick::Theirs
            }
        }
        (b, o, None) => {
            if o == b {
                Pick::Theirs
            } else {
                Pick::Ours
            }
        }
        (b, o, t) => {
            if t == b {
                Pick::Ours
            } else if o == b {
                Pick::Theirs
            } else {
                Pick::Merge
            }
        }
    }
}

/// project.json or settings.json changed on both sides: each key from the side that changed it, ours where
/// both did, one level deeper where both hold a group there; never the id.
pub(crate) fn merge_meta(
    base: Option<&Map<String, Value>>,
    ours: &Map<String, Value>,
    theirs: &Map<String, Value>,
    depth: u8,
) -> Map<String, Value> {
    let mut merged = Map::new();
    let keys: Vec<&String> = ours
        .keys()
        .chain(theirs.keys().filter(|k| !ours.contains_key(*k)))
        .collect();
    for key in keys {
        let was = base.and_then(|b| b.get(key));
        let (o, t) = (ours.get(key), theirs.get(key));
        let value = match (o, t) {
            (Some(Value::Object(o)), Some(Value::Object(t)))
                if depth == 0 && was.is_none_or(Value::is_object) =>
            {
                Some(Value::Object(merge_meta(
                    was.and_then(Value::as_object),
                    o,
                    t,
                    1,
                )))
            }
            _ if o == was => t.cloned(),
            _ => o.cloned(),
        };
        if let Some(value) = value {
            merged.insert(key.clone(), value);
        }
    }
    if depth == 0
        && let Some(id) = ours.get("id")
    {
        merged.insert("id".into(), id.clone());
    }
    merged
}

fn message_key(m: &Value) -> String {
    json!([m.get("role"), m.get("createdAt"), m.get("content")]).to_string()
}

fn list(v: Option<&Value>) -> Vec<Value> {
    v.and_then(Value::as_array).cloned().unwrap_or_default()
}

/// A message as `disk` has it, with what the other copy marked on it since (proposals closed, checkpoints).
fn with_marks(m: &Value, twin: Option<&Value>) -> Value {
    let Some(theirs) = twin.and_then(|t| t.get("meta")).filter(|t| t.is_object()) else {
        return m.clone();
    };
    let meta = m
        .get("meta")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let changes = list(meta.get("changes"));
    let mut closed = list(meta.get("closed"));
    let path = |c: &Value| c.get("filePath").cloned();
    let theirs_closed = list(theirs.get("closed")).into_iter().chain(
        list(theirs.get("changes"))
            .into_iter()
            .filter(|c| c.get("status").is_some_and(|s| !s.is_null())),
    );
    for c in theirs_closed {
        let open = changes
            .iter()
            .any(|d| path(d) == path(&c) && d.get("status").is_none_or(Value::is_null));
        if open && !closed.iter().any(|d| path(d) == path(&c)) {
            closed.push(json!({ "filePath": path(&c), "status": c.get("status") }));
        }
    }
    let shut = closed.len() - list(meta.get("closed")).len();
    let ids: HashSet<String> = list(meta.get("checkpoints"))
        .iter()
        .map(|c| c.get("id").map(Value::to_string).unwrap_or_default())
        .collect();
    let more: Vec<Value> = list(theirs.get("checkpoints"))
        .into_iter()
        .filter(|c| !ids.contains(&c.get("id").map(Value::to_string).unwrap_or_default()))
        .collect();
    if shut == 0 && more.is_empty() {
        return m.clone();
    }
    let mut next = meta.clone();
    if !more.is_empty() {
        let mut all = list(meta.get("checkpoints"));
        all.extend(more);
        next.insert("checkpoints".into(), Value::Array(all));
    }
    if shut > 0 {
        let left: Vec<Value> = changes
            .into_iter()
            .filter(|c| {
                c.get("status").is_some_and(|s| !s.is_null())
                    || !closed.iter().any(|d| path(d) == path(c))
            })
            .collect();
        next.insert("closed".into(), Value::Array(closed));
        if left.is_empty() {
            next.remove("changes")
        } else {
            next.insert("changes".into(), Value::Array(left))
        };
    }
    let mut out = m.clone();
    out["meta"] = Value::Object(next);
    out
}

/// A chat changed on both sides, from its two files' bytes: every message from both, theirs first.
/// `None` unless both are the same chat. The bool: ours had messages theirs lacks.
pub(crate) fn merge_chat_files(ours: &[u8], theirs: &[u8]) -> Option<(Vec<u8>, bool)> {
    let chat = |b: &[u8]| -> Option<Value> {
        let v: Value = serde_json::from_slice(b).ok()?;
        (v.get("id")?.is_string() && v.get("messages")?.is_array()).then_some(v)
    };
    let (mine, disk) = (chat(ours)?, chat(theirs)?);
    if mine["id"] != disk["id"] {
        return None;
    }
    let incoming = list(mine.get("messages"));
    let twins: HashMap<String, &Value> = incoming.iter().map(|m| (message_key(m), m)).collect();
    let there: HashSet<String> = list(disk.get("messages")).iter().map(message_key).collect();
    let mut messages: Vec<Value> = list(disk.get("messages"))
        .iter()
        .map(|m| with_marks(m, twins.get(&message_key(m)).copied()))
        .collect();
    let theirs_len = messages.len();
    messages.extend(
        incoming
            .iter()
            .filter(|m| !there.contains(&message_key(m)))
            .cloned(),
    );
    let updated = now_ms().max(
        mine.get("updatedAt")
            .and_then(Value::as_str)
            .and_then(parse_iso_ms)
            .map_or(0, |t| t + 1),
    );
    let mut merged = mine.clone();
    if disk.get("agent") == Some(&Value::Bool(true)) {
        merged["agent"] = Value::Bool(true);
    }
    let more = messages.len() > theirs_len;
    merged["messages"] = Value::Array(messages);
    merged["updatedAt"] = json!(
        chrono::DateTime::from_timestamp_millis(updated)
            .unwrap_or_default()
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    );
    Some((serde_json::to_vec(&merged).ok()?, more))
}

/// Beside `rel`, the other side's copy of a file that didn't merge, named as Dropbox names one
/// (`main (GitHub’s conflicted copy 2026-10-18 104233).tex`), so the editor's conflicted-copy banner offers it.
pub(crate) fn conflict_copy_path(
    rel: &str,
    label: &str,
    at: chrono::DateTime<chrono::Local>,
) -> String {
    let slash = rel.rfind('/').map_or(0, |i| i + 1);
    let name = &rel[slash..];
    let (stem, ext) = match name.rfind('.') {
        Some(dot) if dot > 0 => name.split_at(dot),
        _ => (name, ""),
    };
    let who: String = label
        .chars()
        .filter(|c| {
            !matches!(
                c,
                '(' | ')' | '.' | '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\0'
                    ..='\x1f'
            )
        })
        .collect();
    let who = who.trim();
    let whose = if who.is_empty() {
        String::new()
    } else {
        format!("{who}’s ")
    };
    let when = format!(
        "{}-{:02}-{:02} {:02}{:02}{:02}",
        at.year(),
        at.month(),
        at.day(),
        at.hour(),
        at.minute(),
        at.second()
    );
    format!(
        "{}{stem} ({whose}conflicted copy {when}){ext}",
        &rel[..slash]
    )
}

/// Two paths of one side that differ only in letter case.
pub(crate) type CasePair = (String, String);

/// A file by its key, with each side's spelling and the one to keep.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Spelt {
    pub rel: String,
    pub base: Option<String>,
    pub ours: Option<String>,
    pub theirs: Option<String>,
}

/// Every file once by its key (in first-seen order), with the spelling to keep: the side that respelt it
/// (in letter case) keeps its spelling, else ours; of Unicode forms, the composed one. `clashes`: two paths
/// of one side that differ only in letter case, which a Mac or Windows disk can't keep apart.
pub(crate) fn respell_keys(
    base: &[String],
    ours: &[String],
    theirs: &[String],
) -> (Vec<(String, Spelt)>, Vec<CasePair>) {
    let mut order: Vec<String> = Vec::new();
    let mut files: HashMap<String, Spelt> = HashMap::new();
    let mut clashes = Vec::new();
    for (side, rels) in [(0, base), (1, ours), (2, theirs)] {
        for rel in rels {
            let key = key_of(rel);
            let entry = files.entry(key.clone()).or_insert_with(|| {
                order.push(key);
                Spelt::default()
            });
            let slot = match side {
                0 => &mut entry.base,
                1 => &mut entry.ours,
                _ => &mut entry.theirs,
            };
            match slot {
                Some(first) if side != 0 => clashes.push((first.clone(), rel.clone())),
                Some(_) => {}
                None => *slot = Some(rel.clone()),
            }
        }
    }
    let same = |a: &str, b: &str| nfc(a) == nfc(b);
    let out = order
        .into_iter()
        .map(|key| {
            let mut e = files.remove(&key).unwrap_or_default();
            let (was, mine, other) = (e.base.as_deref(), e.ours.as_deref(), e.theirs.as_deref());
            let pick = match (mine, other, was) {
                (Some(m), Some(o), Some(w)) if !same(m, o) && !same(w, o) && same(w, m) => o,
                _ => mine.or(other).or(was).unwrap_or_default(),
            };
            let rel = [mine, other, was]
                .into_iter()
                .flatten()
                .find(|r| same(r, pick) && *r == nfc(r))
                .unwrap_or(pick)
                .to_owned();
            e.rel = rel;
            (key, e)
        })
        .collect();
    (out, clashes)
}

static BIB_HEAD: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r#"@([A-Za-z]+)\s*[{(]\s*([^,\s{}()"=]+)\s*,"#).ok());

/// Each .bib entry's key and where it starts.
fn bib_entries(text: &str) -> Vec<(String, usize)> {
    let Some(re) = BIB_HEAD.as_ref() else {
        return Vec::new();
    };
    re.captures_iter(text)
        .filter(|c| {
            !["comment", "string", "preamble"].contains(&c[1].to_ascii_lowercase().as_str())
        })
        .filter_map(|c| Some((c[2].to_owned(), c.get(0)?.start())))
        .collect()
}

fn latin1(b: &[u8]) -> String {
    b.iter().map(|&x| char::from(x)).collect()
}

/// A .bib both computers added entries to: each entry only theirs has, cut out of theirs and put after the
/// rest once the rest merges. `None` when theirs added none or the rest still conflicts.
pub(crate) fn merge_bib_files(base: &[u8], ours: &[u8], theirs: &[u8]) -> Option<Vec<u8>> {
    let (b, o, t) = (latin1(base), latin1(ours), latin1(theirs));
    let known: HashSet<String> = bib_entries(&b)
        .into_iter()
        .chain(bib_entries(&o))
        .map(|(k, _)| k.to_lowercase())
        .collect();
    let entries = bib_entries(&t);
    let added: Vec<(usize, usize)> = entries
        .iter()
        .enumerate()
        .filter(|(_, (k, _))| !known.contains(&k.to_lowercase()))
        .map(|(i, (_, at))| (*at, entries.get(i + 1).map_or(t.len(), |e| e.1)))
        .collect();
    if added.is_empty() {
        return None;
    }
    let mut rest = t.clone();
    let mut cut = Vec::new();
    for (at, end) in added.into_iter().rev() {
        let text = t[at..end].trim_end();
        let mut start = at;
        while start > 0 && rest.as_bytes()[start - 1].is_ascii_whitespace() {
            start -= 1;
        }
        cut.insert(0, text.to_owned());
        rest = format!("{}{}", &rest[..start], &rest[at + text.len()..]);
    }
    let to_bytes = |s: &str| {
        s.chars()
            .map(|c| u8::try_from(u32::from(c)).unwrap_or(b'?'))
            .collect::<Vec<u8>>()
    };
    let merged = latin1(&merge_text(base, ours, &to_bytes(&rest))?);
    let nl = if o.contains("\r\n") { "\r\n" } else { "\n" };
    let sep = format!("{nl}{nl}");
    Some(to_bytes(&format!(
        "{}{sep}{}{nl}",
        merged.trim_end(),
        cut.join(&sep)
    )))
}

/// More than 5 files and more than a quarter of a side's files deleted at once (of all of them, or of the
/// user's own outside .spectrum) is more likely a sync gone wrong: how many, else 0.
pub(crate) fn deletion_brake(deleting: &[String], files: &[String]) -> usize {
    let user = |rels: &[String]| {
        rels.iter()
            .filter(|r| !key_of(r).starts_with(".spectrum/"))
            .count()
    };
    [(deleting.len(), files.len()), (user(deleting), user(files))]
        .into_iter()
        .find(|&(n, of)| n > 5 && n * 4 > of)
        .map_or(0, |(n, _)| n)
}

/// `bytes` at `rel` in `root` through a temp file beside it, only while the file there still holds what was
/// checked: `expect`, its SHA-256, or `None` for none there. False when something else landed there. Never
/// makes `root` itself, so a project folder gone meanwhile isn't made again.
// ponytail: a change in the moment between the check and the rename is still written over, as 2.8's
pub(crate) fn place_if_unchanged(
    root: &Path,
    rel: &str,
    bytes: &[u8],
    expect: Option<&str>,
) -> Result<bool> {
    let parts: Vec<&str> = rel.split('/').collect();
    let mut at = root.to_path_buf();
    for part in &parts[..parts.len() - 1] {
        at.push(part);
        match fs::create_dir(&at) {
            Err(e) if e.kind() != io::ErrorKind::AlreadyExists => {
                return Err(GitError::io("create", &at, e));
            }
            _ => {}
        }
    }
    let dest = at.join(parts[parts.len() - 1]);
    let tmp = temp_beside(&dest);
    fs::write(&tmp, bytes).map_err(|e| GitError::io("write", &dest, e))?;
    let now = match fs::read(&dest) {
        Ok(b) => Some(sha256_hex(&b)),
        Err(e)
            if matches!(
                e.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
            ) =>
        {
            None
        }
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            return Err(GitError::io("read", &dest, e));
        }
    };
    if now.as_deref() != expect {
        let _ = fs::remove_file(&tmp);
        return Ok(false);
    }
    fs::rename(&tmp, &dest).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        GitError::io("write", &dest, e)
    })?;
    Ok(true)
}

#[cfg(test)]
mod tests;
