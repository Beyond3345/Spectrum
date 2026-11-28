//! The project's Spectrum › <project> collection made to match its `.bib` (Zotero 10's local API writes): each
//! entry Zotero has goes into the collection, an entry it lacks becomes a new item there once every `.bib` was
//! read whole and the entry has stayed the same since the last sync (or Spectrum just wrote it), entries taken
//! out of the `.bib` come out of the collection (never out of the library). 2.8's `reconcile`.

use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;

use reqwest::Method;
use serde_json::{Value, json};
use spectrum_core::project::read_meta;
use spectrum_core::settings::{read_project_settings, update_project_settings};

use super::items::{ZoteroRef, item_identity, same_key, same_ref, same_work};
use super::new_item::item_from_entry;
use super::{API_OFF, Auth, KEY_REFUSED, LIB, LIBRARY, NOT_OPEN, Zotero, needs_ten};
use crate::bibtex::{BibEntry, parse_bib_entries, parsed_whole};
use crate::dedupe::bib_identity;
use crate::error::RefError;
use crate::http::encode_component;
use crate::project::{project_files, read_bibs};

const WAITING: &str = "Waiting for Zotero to sync this project’s collection";

/// What a sync did.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct SyncCounts {
    pub added: usize,
    pub created: usize,
    pub removed: usize,
    pub failed: usize,
    pub held: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncOutcome {
    /// No permission yet.
    Off,
    /// Zotero isn't open or its local API is off.
    Unreachable(String),
    /// Zotero 7–9: read-only.
    ReadOnly(String),
    /// Nothing to keep: no entries and no collection, or a template's working copy.
    Empty,
    /// The stored collection isn't in this computer's Zotero yet, or a GitHub pull may bring it.
    Waiting(String),
    Synced {
        collection: String,
        counts: SyncCounts,
        message: Option<String>,
        /// Entries still being typed: sync again after this.
        again_after: Option<Duration>,
    },
    Error(String),
}

/// What a sync is told.
#[derive(Debug, Clone, Default)]
pub struct SyncOptions {
    /// After a `.bib` save: entries taken out leave the collection.
    pub remove: bool,
    /// Keys of entries Spectrum just wrote, which become items at once when Zotero lacks them.
    pub added: Vec<String>,
    /// A GitHub pull is under way and may bring the other computer's collection.
    pub pulling: bool,
    /// The bundled templates' sample entries as "key\nnormalised title", which never become items.
    pub samples: HashSet<String>,
}

struct BibItem {
    entry: BibEntry,
    id: ZoteroRef,
    display_title: String,
}

fn fingerprint(e: &BibEntry) -> String {
    serde_json::to_string(&(&e.kind, &e.key, &e.fields)).unwrap_or_default()
}

fn is_item_key(k: &str) -> bool {
    k.len() == 8
        && k.chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}

impl Zotero {
    /// Syncs the project's collection; one sync at a time. Errors come back as [`SyncOutcome::Error`].
    pub async fn sync_collection(&self, root: &Path, options: &SyncOptions) -> SyncOutcome {
        let _held = self.sync_lock.lock().await;
        self.reconcile(root, options)
            .await
            .unwrap_or_else(|e| SyncOutcome::Error(e.to_string()))
    }

    async fn create_collection(
        &self,
        data: Value,
        auth: &Auth,
    ) -> Result<(String, Value), RefError> {
        let res = self
            .call(
                &format!("{LIB}/collections"),
                Method::POST,
                Some(&json!([data])),
                &[],
                Some(auth),
                None,
            )
            .await?;
        let out = self.written(res, auth).await?.json().unwrap_or(Value::Null);
        let key = out
            .pointer("/successful/0/key")
            .or_else(|| out.pointer("/success/0"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        if key.is_empty() {
            let why = out
                .pointer("/failed/0/message")
                .and_then(Value::as_str)
                .unwrap_or("no reason given");
            return Err(RefError::Zotero(format!(
                "Zotero didn’t make the collection: {why}."
            )));
        }
        Ok((
            key,
            out.pointer("/successful/0/data").cloned().unwrap_or(data),
        ))
    }

    /// A new collection for the project inside a top-level Spectrum collection: "<project> (2)" and so on when
    /// a Spectrum collection already has the name.
    async fn new_collection(
        &self,
        project: &str,
        auth: &Auth,
    ) -> Result<(String, Value), RefError> {
        let parents: Vec<Value> = self
            .all(&format!("{LIB}/collections/top"))
            .await?
            .into_iter()
            .filter(|c| c.pointer("/data/name").and_then(Value::as_str) == Some("Spectrum"))
            .collect();
        let mut taken = HashSet::new();
        for p in &parents {
            let key = p.get("key").and_then(Value::as_str).unwrap_or("");
            for c in self
                .all(&format!("{LIB}/collections/{key}/collections"))
                .await?
            {
                taken.insert(
                    c.pointer("/data/name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned(),
                );
            }
        }
        let parent = match parents.first() {
            Some(p) => p
                .get("key")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
            None => {
                self.create_collection(json!({ "name": "Spectrum" }), auth)
                    .await?
                    .0
            }
        };
        let mut name = project.to_owned();
        let mut n = 2;
        while taken.contains(&name) {
            name = format!("{project} ({n})");
            n += 1;
        }
        self.create_collection(json!({ "name": name, "parentCollection": parent }), auth)
            .await
    }

    /// An item's collections changed, against its version; another change first (412) is read and tried again.
    async fn change_collections(
        &self,
        item: &Value,
        change: impl Fn(&[String]) -> Vec<String>,
        auth: &Auth,
    ) -> Result<(), RefError> {
        let mut current = item.clone();
        for _ in 0..3 {
            let now: Vec<String> = current
                .pointer("/data/collections")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|c| c.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            let next = change(&now);
            if next == now {
                return Ok(());
            }
            let key = current
                .get("key")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let version = current
                .get("version")
                .or_else(|| current.pointer("/data/version"))
                .map(crate::csl::str_of)
                .unwrap_or_default();
            let res = self
                .call(
                    &format!("{LIB}/items/{}", encode_component(&key)),
                    Method::PATCH,
                    Some(&json!({ "collections": next })),
                    &[("If-Unmodified-Since-Version", version)],
                    Some(auth),
                    None,
                )
                .await?;
            if res.status != 412 {
                return self.written(res, auth).await.map(|_| ());
            }
            match self
                .json(&format!("{LIB}/items/{}", encode_component(&key)))
                .await?
            {
                Some(v) => current = v,
                None => return Ok(()),
            }
        }
        Err(RefError::Zotero("Zotero kept changing an item while Spectrum added it to the collection. It’s tried again next time.".into()))
    }

    /// The library item that is this entry: by DOI, arXiv id, title and year, then citation key (the last only
    /// for an item no other entry is the work of).
    async fn find_in_library(
        &self,
        e: &BibItem,
        all: &[ZoteroRef],
    ) -> Result<Option<Value>, RefError> {
        let tries = [
            (e.id.doi.clone(), "doi"),
            (e.id.arxiv.clone(), "arxiv"),
            (e.display_title.replace(['{', '}'], ""), "title"),
            (e.id.key.clone(), "key"),
        ];
        for (q, by) in tries {
            if q.is_empty() {
                continue;
            }
            let hit = self.find_items(&q, 25).await?.into_iter().find(|it| {
                let other = item_identity(it);
                match by {
                    "title" => same_work(&e.id, &other),
                    "key" => {
                        same_key(&e.id, &other)
                            && !all.iter().any(|x| *x != e.id && same_work(x, &other))
                    }
                    "doi" => other.doi == e.id.doi,
                    _ => other.arxiv == e.id.arxiv,
                }
            });
            if hit.is_some() {
                return Ok(hit);
            }
        }
        Ok(None)
    }

    #[allow(clippy::too_many_lines)]
    async fn reconcile(&self, root: &Path, options: &SyncOptions) -> Result<SyncOutcome, RefError> {
        let auth = self.read_auth();
        if auth.key.is_empty() {
            return Ok(SyncOutcome::Off);
        }
        let found = self.probe().await;
        if !found.running {
            return Ok(SyncOutcome::Unreachable(NOT_OPEN.into()));
        }
        if found.local_api != "on" {
            return Ok(SyncOutcome::Unreachable(API_OFF.into()));
        }
        if !found.writes {
            return Ok(SyncOutcome::ReadOnly(needs_ten(&found.version)));
        }
        // the key is the database's that gave it: one Zotero answers for under another id is asked for again
        if auth.server_id != found.server_id {
            self.discard_key(&auth.key).await;
            return Err(RefError::ZoteroKeyRefused(KEY_REFUSED.into()));
        }
        let meta = read_meta(root)?.unwrap_or_default();
        if meta.template_draft.is_some() {
            return Ok(SyncOutcome::Empty);
        }
        let files = project_files(root)?;
        let bibs = read_bibs(root, &files);
        let complete = !bibs.is_empty()
            && bibs.len()
                == files
                    .iter()
                    .filter(|f| f.to_lowercase().ends_with(".bib"))
                    .count()
            && bibs.iter().all(|b| parsed_whole(&b.text));
        let entries: Vec<BibItem> = bibs
            .iter()
            .flat_map(|b| {
                parse_bib_entries(&b.text)
                    .into_iter()
                    .map(move |e| (b.file.clone(), e))
            })
            .map(|(file, entry)| {
                let id = bib_identity(&entry, &file);
                BibItem {
                    id: ZoteroRef {
                        key: id.key,
                        doi: id.doi,
                        arxiv: id.arxiv,
                        title: id.title,
                        year: id.year,
                    },
                    display_title: id.display_title,
                    entry,
                }
            })
            .collect();
        // strictly: a settings.json that can't be read would otherwise have a new collection made each sync
        let stored = read_project_settings(root)?
            .extra
            .get("zotero")
            .cloned()
            .unwrap_or(Value::Null);
        let s = |k: &str| {
            stored
                .get(k)
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned()
        };
        let bound = s("projectId") == meta.id
            && s("library") == LIBRARY
            && is_item_key(&s("collectionKey"));
        if !bound && entries.is_empty() {
            return Ok(SyncOutcome::Empty);
        }
        let (ck, name) = if bound {
            let Some(c) = self
                .json(&format!(
                    "{LIB}/collections/{}",
                    encode_component(&s("collectionKey"))
                ))
                .await?
            else {
                return Ok(SyncOutcome::Waiting(WAITING.into()));
            };
            (
                s("collectionKey"),
                c.pointer("/data/name")
                    .and_then(Value::as_str)
                    .unwrap_or(&meta.name)
                    .to_owned(),
            )
        } else {
            if options.pulling {
                return Ok(SyncOutcome::Waiting(WAITING.into()));
            }
            let (key, data) = self.new_collection(&meta.name, &auth).await?;
            let binding = json!({ "projectId": meta.id, "library": LIBRARY, "collectionKey": key });
            update_project_settings(root, |p| {
                p.extra.insert("zotero".into(), binding);
            })?;
            (
                key,
                data.get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(&meta.name)
                    .to_owned(),
            )
        };
        let mut members: Vec<(Value, ZoteroRef)> = self
            .all(&format!(
                "{LIB}/collections/{}/items",
                encode_component(&ck)
            ))
            .await?
            .into_iter()
            .filter(|it| {
                !["attachment", "note", "annotation"].contains(
                    &it.pointer("/data/itemType")
                        .and_then(Value::as_str)
                        .unwrap_or(""),
                )
            })
            .map(|it| {
                let id = item_identity(&it);
                (it, id)
            })
            .collect();
        let ids: Vec<ZoteroRef> = entries.iter().map(|e| e.id.clone()).collect();
        // an entry's member: the same work, else the same key while the entry has no member of its own work and no
        // other entry is the member's work (an entry Spectrum renamed taken2020a for an item under taken2020)
        let is_entry_of = |e: &ZoteroRef, m: &ZoteroRef, members: &[(Value, ZoteroRef)]| {
            same_work(e, m)
                || (same_key(e, m)
                    && !members.iter().any(|(_, x)| same_work(e, x))
                    && !ids.iter().any(|x| x != e && same_work(x, m)))
        };
        let made = if bound {
            stored
                .get("created")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default()
        } else {
            serde_json::Map::new()
        };
        let mut counts = SyncCounts::default();
        let mut missing: Vec<&BibItem> = Vec::new();
        // ponytail: a search or four per entry the collection lacks; a whole-library index if large .bibs drag
        for e in &entries {
            if members.iter().any(|(_, m)| is_entry_of(&e.id, m, &members))
                || missing.iter().any(|m| same_ref(&e.id, &m.id))
            {
                continue;
            }
            let item = match made
                .get(&e.entry.key)
                .and_then(Value::as_str)
                .filter(|k| is_item_key(k))
            {
                // made on another computer: that item, once Zotero's sync has brought it here
                Some(k) => {
                    if let Some(it) = self.get_items(&[k.to_owned()]).await?.into_iter().next() {
                        Some(it)
                    } else {
                        counts.held += 1;
                        continue;
                    }
                }
                None => self.find_in_library(e, &ids).await?,
            };
            let Some(item) = item else {
                missing.push(e);
                continue;
            };
            self.change_collections(
                &item,
                |list| {
                    if list.contains(&ck) {
                        list.to_vec()
                    } else {
                        [list.to_vec(), vec![ck.clone()]].concat()
                    }
                },
                &auth,
            )
            .await?;
            let id = item_identity(&item);
            members.push((item, id));
            counts.added += 1;
        }
        let before = self.last_read.lock().get(root).cloned();
        self.last_read.lock().insert(
            root.to_path_buf(),
            entries.iter().map(|e| fingerprint(&e.entry)).collect(),
        );
        let trusted: HashSet<String> = options.added.iter().map(|k| k.to_lowercase()).collect();
        let mut ready: Vec<&BibItem> = Vec::new();
        let mut unsteady = false;
        for e in missing {
            if options
                .samples
                .contains(&format!("{}\n{}", e.entry.key.to_lowercase(), e.id.title))
            {
                continue;
            }
            let steady = before
                .as_ref()
                .is_some_and(|b| b.contains(&fingerprint(&e.entry)))
                || trusted.contains(&e.entry.key.to_lowercase());
            if complete && !e.id.title.is_empty() && steady {
                ready.push(e);
            } else {
                counts.held += 1;
                unsteady |= complete && !e.id.title.is_empty();
            }
        }
        let mut failure = String::new();
        let mut created_now = serde_json::Map::new();
        for slice in ready.chunks(50) {
            let batch: Vec<Value> = slice
                .iter()
                .map(|e| {
                    let mut item = item_from_entry(&e.entry);
                    item["collections"] = json!([ck]);
                    item
                })
                .collect();
            let res = self
                .call(
                    &format!("{LIB}/items"),
                    Method::POST,
                    Some(&Value::Array(batch)),
                    &[],
                    Some(&auth),
                    None,
                )
                .await?;
            let out = self
                .written(res, &auth)
                .await?
                .json()
                .unwrap_or(Value::Null);
            let success = out
                .get("successful")
                .or_else(|| out.get("success"))
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            counts.created += success.len();
            for (n, it) in &success {
                let key = it
                    .as_str()
                    .map(str::to_owned)
                    .or_else(|| it.get("key").and_then(Value::as_str).map(str::to_owned))
                    .unwrap_or_default();
                if let (Some(e), true) = (
                    n.parse::<usize>().ok().and_then(|i| slice.get(i)),
                    is_item_key(&key),
                ) {
                    created_now.insert(e.entry.key.clone(), json!(key));
                }
            }
            let failed: Vec<Value> = out
                .get("failed")
                .and_then(Value::as_object)
                .map(|o| o.values().cloned().collect())
                .unwrap_or_default();
            counts.failed += failed.len();
            if failure.is_empty() {
                failed
                    .first()
                    .and_then(|f| f.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .clone_into(&mut failure);
            }
        }
        // what Spectrum made, by citation key, so another computer waits for these items rather than making them
        if !created_now.is_empty() {
            update_project_settings(root, |p| {
                if let Some(z) = p
                    .extra
                    .get_mut("zotero")
                    .filter(|z| z.get("collectionKey").and_then(Value::as_str) == Some(ck.as_str()))
                {
                    let mut created = z
                        .get("created")
                        .and_then(Value::as_object)
                        .cloned()
                        .unwrap_or_default();
                    created.extend(created_now.clone());
                    z["created"] = Value::Object(created);
                }
            })?;
        }
        if options.remove && complete {
            for (item, m) in members.clone() {
                if entries.iter().any(|e| is_entry_of(&e.id, &m, &members)) {
                    continue;
                }
                self.change_collections(
                    &item,
                    |list| list.iter().filter(|c| **c != ck).cloned().collect(),
                    &auth,
                )
                .await?;
                counts.removed += 1;
            }
        }
        let message = (counts.failed > 0).then(|| {
            format!(
                "Zotero didn’t take {} {}: {}.",
                counts.failed,
                if counts.failed == 1 {
                    "entry"
                } else {
                    "entries"
                },
                if failure.is_empty() {
                    "no reason given"
                } else {
                    &failure
                }
            )
        });
        // looked at again once typing has had a minute to stop
        Ok(SyncOutcome::Synced {
            collection: format!("Spectrum › {name}"),
            counts,
            message,
            again_after: unsteady.then_some(Duration::from_secs(60)),
        })
    }
}
