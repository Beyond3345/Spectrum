//! The settings that follow the user (2.8's `settingsRepoService.js`): a private `spectrum-settings`
//! repository of theirs on GitHub, cloned into `DATA_DIR/settings-repo`:
//!   settings/<machine id>.json  each computer's own (written by the settings code, never a key or path)
//!   personas/<id>.json          { id, updatedAt, by, persona } or { id, updatedAt, by, deleted: true }
//!   skills/<id>/                skill.json { id, updatedAt, by, files } (or deleted) and files/
//!   templates/<id>/             the user's own templates (the template code fills these)
//! A persona, skill or template changed on both computers is taken whole from the newer, never merged by
//! line. `DATA_DIR/settings-repo.json` keeps what this computer and the repository last agreed on.
//! The caller schedules it: 2.8 pulls at start, when the window comes forward and every 5 minutes, and
//! pushes within 30 s of a change.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Value, json};
use sha1::{Digest, Sha1};

use crate::error::{GitError, Result};
use crate::github::GitHub;
use crate::merge_rules::Pick;
use crate::pull::{MergeOptions, merge_origin, merge_sides};
use crate::repo::{
    self, Author, CommitOptions, MAX_FILE_BYTES, ahead_behind, commit_all, fetch_origin, head_oid,
    init_repo, is_repo, open, push_origin, remote_head,
};
use crate::util::{hex, now_iso, secret_looking, write_json};

const REPO: &str = "spectrum-settings";
static PERSONA_ID: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z0-9_-]{1,100}$").ok());
static SKILL_ID: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"^[a-z0-9]+(?:-[a-z0-9]+)*$").ok());

fn ok_id(re: &LazyLock<Option<Regex>>, id: &str) -> bool {
    re.as_ref().is_some_and(|re| re.is_match(id)) && id.len() <= 100
}

fn sha1(data: &[u8]) -> String {
    hex(&Sha1::digest(data))
}

/// This computer, as computer.json names it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Machine {
    pub id: String,
    pub name: String,
}

/// After a sync: the repository is here, and whether this computer has shared settings in it yet (when not,
/// the window takes the repository's first).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsRepoState {
    pub ready: bool,
    pub first: bool,
}

pub struct SettingsRepo {
    pub dir: PathBuf,
    state_file: PathBuf,
    github: GitHub,
    login: String,
    author: Author,
    machine: Machine,
}

const PUBLIC: &str = "Your spectrum-settings repository on GitHub is public, so Spectrum won’t put your settings, personas and skills in it. Make it private on GitHub, then sync again.";

/// Which copy of a persona or skill wins, each side by its hash: the side that changed it since the two
/// last agreed; both, this computer's; nothing agreed yet, the repository's when it has the item.
// ponytail: "just changed" holds while each change syncs within moments; one made offline long ago still wins
fn step(
    here: Option<&str>,
    there: Option<&str>,
    base: Option<&str>,
    first: bool,
    in_repo: bool,
) -> Pick {
    if here == there {
        return Pick::Equal;
    }
    if first || base.is_none() {
        return if in_repo { Pick::Theirs } else { Pick::Ours };
    }
    if there == base {
        Pick::Ours
    } else if here == base {
        Pick::Theirs
    } else {
        Pick::Ours
    }
}

/// A file the repository never takes (keys, over 100 MB).
fn stays(abs: &Path) -> bool {
    secret_looking(&abs.file_name().unwrap_or_default().to_string_lossy())
        || fs::metadata(abs).is_ok_and(|m| m.len() > MAX_FILE_BYTES)
}

/// A folder's files the repository takes, '/'-separated, with their SHA-1s.
fn files_of(dir: &Path) -> BTreeMap<String, String> {
    fn walk(dir: &Path, rel: &str, out: &mut BTreeMap<String, String>) {
        for e in fs::read_dir(dir.join(rel)).into_iter().flatten().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let item = if rel.is_empty() {
                name
            } else {
                format!("{rel}/{name}")
            };
            let Ok(t) = e.file_type() else { continue };
            if t.is_dir() {
                walk(dir, &item, out);
            } else if t.is_file()
                && !stays(&dir.join(&item))
                && let Ok(bytes) = fs::read(dir.join(&item))
            {
                out.insert(item, sha1(&bytes));
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(dir, "", &mut out);
    out
}

/// JavaScript's `sha1(JSON.stringify(Object.entries(files).sort()))`.
fn hash_of_files(files: Option<&BTreeMap<String, String>>) -> Option<String> {
    let mut entries: Vec<(&String, &String)> = files?.iter().collect();
    entries.sort_by_key(|(k, v)| format!("{k},{v}"));
    Some(sha1(
        json!(
            entries
                .iter()
                .map(|(k, v)| json!([k, v]))
                .collect::<Vec<_>>()
        )
        .to_string()
        .as_bytes(),
    ))
}

fn copy_dir(src: &Path, dest: &Path, keep: &dyn Fn(&Path) -> bool) -> Result<()> {
    fs::create_dir_all(dest).map_err(|e| GitError::io("create", dest, e))?;
    for e in fs::read_dir(src)
        .map_err(|e| GitError::io("read", src, e))?
        .flatten()
    {
        let (from, to) = (e.path(), dest.join(e.file_name()));
        if e.file_type().is_ok_and(|t| t.is_dir()) {
            copy_dir(&from, &to, keep)?;
        } else if keep(&from) {
            fs::copy(&from, &to).map_err(|err| GitError::io("copy", &from, err))?;
        }
    }
    Ok(())
}

/// `dir`'s files replaced by `src`'s through a folder beside it; the files of `dir` the repository never
/// takes are this computer's alone and go across into the new one.
#[allow(clippy::items_after_statements)]
fn replace_folder(src: &Path, dir: &Path) -> Result<()> {
    let staged = crate::util::temp_beside(dir);
    copy_dir(src, &staged, &|_| true)?;
    fn keep_own(dir: &Path, staged: &Path, rel: &Path) {
        for e in fs::read_dir(dir.join(rel)).into_iter().flatten().flatten() {
            let item = rel.join(e.file_name());
            if e.file_type().is_ok_and(|t| t.is_dir()) {
                keep_own(dir, staged, &item);
            } else if stays(&dir.join(&item)) && !staged.join(&item).exists() {
                if let Some(parent) = staged.join(&item).parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::copy(dir.join(&item), staged.join(&item));
            }
        }
    }
    keep_own(dir, &staged, Path::new(""));
    let old = crate::util::temp_beside(&staged);
    if dir.exists() {
        fs::rename(dir, &old).map_err(|e| GitError::io("move", dir, e))?;
    }
    fs::rename(&staged, dir).map_err(|e| GitError::io("move", &staged, e))?;
    let _ = fs::remove_dir_all(old);
    Ok(())
}

impl SettingsRepo {
    /// `data_dir`: the app's; `login`: the signed-in account's.
    pub fn new(
        data_dir: &Path,
        github: GitHub,
        login: &str,
        author: Author,
        machine: Machine,
    ) -> Self {
        Self {
            dir: data_dir.join("settings-repo"),
            state_file: data_dir.join("settings-repo.json"),
            github,
            login: login.into(),
            author,
            machine,
        }
    }

    fn read_state(&self) -> Map<String, Value> {
        fs::read(&self.state_file)
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default()
    }

    fn write_state(&self, key: &str, agreed: Map<String, Value>) -> Result<()> {
        let mut state = self.read_state();
        state.insert(key.into(), Value::Object(agreed));
        write_json(&self.state_file, &Value::Object(state))
    }

    /// The repository on GitHub, made private when there's none, refused when it's public.
    async fn private_repo(&self) -> Result<()> {
        let found = match self.github.repo(&self.login, REPO).await {
            Err(GitError::GitHub { status: 404, .. }) => {
                let body = json!({ "name": REPO, "private": true, "description": "Spectrum’s settings, personas, skills and templates", "auto_init": false });
                match self
                    .github
                    .api(reqwest::Method::POST, "/user/repos", Some(body))
                    .await
                {
                    Err(GitError::GitHub { status: 422, .. }) => {
                        self.github.repo(&self.login, REPO).await?
                    }
                    other => other?,
                }
            }
            other => other?,
        };
        if found["private"] != Value::Bool(true) {
            return Err(GitError::Refused(PUBLIC.into()));
        }
        Ok(())
    }

    /// Found or made on GitHub, and here (made from nothing when GitHub's is still empty).
    async fn ensure(&self) -> Result<()> {
        self.private_repo().await?;
        let url = self.github.repo_url(&self.login, REPO);
        if !is_repo(&self.dir)
            || open(&self.dir).ok().and_then(|r| repo::remote_url(&r)) != Some(url.clone())
        {
            // another account's copy, or one that never got going, starts again
            let _ = fs::remove_dir_all(&self.dir);
            let _ = fs::remove_file(&self.state_file);
            fs::create_dir_all(&self.dir).map_err(|e| GitError::io("create", &self.dir, e))?;
            let r = init_repo(&self.dir, "main", false)?;
            repo::set_remote(&r, &url)?;
        }
        Ok(())
    }

    fn commit(&self) -> Result<bool> {
        let message = format!("Settings from {}", self.machine.name);
        Ok(commit_all(
            &self.dir,
            &CommitOptions {
                message: &message,
                author: &self.author,
                hold: &|_| false,
                always: false,
                compiled: false,
            },
        )?
        .committed)
    }

    /// Of the items changed on both sides since the common commit, which side's is newer by its updatedAt.
    fn newer_items(&self) -> Result<HashMap<String, Pick>> {
        let r = open(&self.dir)?;
        let (base, ours, theirs) = merge_sides(&r)?;
        let items = |files: &crate::pull::Files| {
            let mut out: HashMap<String, String> = HashMap::new();
            for (rel, (oid, _)) in files {
                if let Some(item) = item_of(rel) {
                    out.entry(item)
                        .or_default()
                        .push_str(&[rel.as_str(), ":", &oid.to_string(), ";"].concat());
                }
            }
            out
        };
        let (b, o, t) = (items(&base), items(&ours), items(&theirs));
        let when = |files: &crate::pull::Files, item: &str| -> String {
            files
                .get(&meta_of(item))
                .and_then(|(oid, _)| r.find_blob(*oid).ok())
                .and_then(|blob| serde_json::from_slice::<Value>(blob.content()).ok())
                .and_then(|v| v["updatedAt"].as_str().map(str::to_owned))
                .unwrap_or_default()
        };
        let mut winners = HashMap::new();
        for item in o.keys().chain(t.keys()).collect::<HashSet<_>>() {
            let (oi, ti, bi) = (o.get(item), t.get(item), b.get(item));
            if oi == ti || oi == bi || ti == bi {
                continue;
            }
            winners.insert(
                item.clone(),
                if when(&theirs, item) > when(&ours, item) {
                    Pick::Theirs
                } else {
                    Pick::Ours
                },
            );
        }
        Ok(winners)
    }

    /// Commit this computer's changes, take GitHub's in (the newer item where both changed one) and push.
    async fn pull_and_push(&self) -> Result<()> {
        let (dir, token) = (self.dir.clone(), self.github.token().to_owned());
        self.commit()?;
        let t = token.clone();
        let d = dir.clone();
        tokio::task::spawn_blocking(move || fetch_origin(&d, Some(&t)))
            .await
            .map_err(|_| GitError::Offline)??;
        let winners = self.newer_items()?;
        let message = format!("Settings merged on {}", self.machine.name);
        let side = |rel: &str| item_of(rel).and_then(|i| winners.get(&i).copied());
        merge_origin(
            &dir,
            &MergeOptions {
                author: &self.author,
                allow_deletions: true,
                dry_run: false,
                base: None,
                side: &side,
                message: &message,
                checkpoint: false,
            },
        )?;
        let r = open(&dir)?;
        if head_oid(&r).is_some() && (remote_head(&r).is_none() || ahead_behind(&dir)?.0 > 0) {
            self.private_repo().await?;
            if !tokio::task::spawn_blocking(move || push_origin(&dir, Some(&token)))
                .await
                .map_err(|_| GitError::Offline)??
            {
                return Err(GitError::Refused(
                    "GitHub’s settings changed meanwhile. Spectrum tries again shortly.".into(),
                ));
            }
        }
        Ok(())
    }

    /// The repository brought up to date both ways, then the user's own skills (`own_skills`, 2.8's
    /// `DATA_DIR/skills/own`) followed. A public repository gets nothing.
    pub async fn sync(&self, own_skills: &Path) -> Result<SettingsRepoState> {
        self.ensure().await?;
        self.pull_and_push().await?;
        self.sync_skills(own_skills)?;
        // what the skills' sync wrote goes up now rather than in 30 s
        if self.commit()? {
            self.pull_and_push().await?;
        }
        Ok(SettingsRepoState {
            ready: is_repo(&self.dir),
            first: !self
                .dir
                .join("settings")
                .join(format!("{}.json", self.machine.id))
                .exists(),
        })
    }

    /// This computer's personas joined with the repository's, in this computer's order with new ones after;
    /// each goes to personas/<id>.json when it changed here and comes from it when it changed there. Returns
    /// the personas and whether they changed. `local`: `[{ id, name, colour, prompt }]`.
    pub fn sync_personas(&self, local: &[Value]) -> Result<(Vec<Value>, bool)> {
        let local: Vec<Value> = local
            .iter()
            .filter(|p| p["id"].as_str().is_some_and(|id| ok_id(&PERSONA_ID, id)))
            .cloned()
            .collect();
        if !is_repo(&self.dir) {
            return Ok((local, false));
        }
        let dir = self.dir.join("personas");
        let state = self.read_state();
        let first = !state.contains_key("personas");
        let base = state
            .get("personas")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut repo_items: BTreeMap<String, Value> = BTreeMap::new();
        for e in fs::read_dir(&dir).into_iter().flatten().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let Some(data) = fs::read(e.path())
                .ok()
                .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            else {
                continue;
            };
            if let Some(id) = data["id"]
                .as_str()
                .filter(|id| ok_id(&PERSONA_ID, id) && name == format!("{id}.json"))
            {
                repo_items.insert(id.to_owned(), data);
            }
        }
        let hash = |p: Option<&Value>| {
            p.map(|p| {
                sha1(
                    json!([p.get("name"), p.get("colour"), p.get("prompt")])
                        .to_string()
                        .as_bytes(),
                )
            })
        };
        let mine: HashMap<String, &Value> = local
            .iter()
            .map(|p| (p["id"].as_str().unwrap_or_default().to_owned(), p))
            .collect();
        let mut out: Vec<(String, Value)> = local
            .iter()
            .map(|p| (p["id"].as_str().unwrap_or_default().to_owned(), p.clone()))
            .collect();
        let mut ids: Vec<String> = Vec::new();
        for id in out
            .iter()
            .map(|(id, _)| id.clone())
            .chain(repo_items.keys().cloned())
            .chain(base.keys().cloned())
        {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
        let mut agreed = Map::new();
        for id in ids {
            let there = repo_items.get(&id);
            let theirs = there
                .filter(|t| t["deleted"] != Value::Bool(true))
                .map(|t| &t["persona"]);
            let (h, t) = (hash(mine.get(&id).copied()), hash(theirs));
            let side = step(
                h.as_deref(),
                t.as_deref(),
                base.get(&id).and_then(Value::as_str),
                first,
                there.is_some(),
            );
            match side {
                Pick::Ours => {
                    let at = now_iso();
                    let data = match mine.get(&id) {
                        Some(p) => {
                            json!({ "id": id, "updatedAt": at, "by": self.machine.id, "persona": p })
                        }
                        None => {
                            json!({ "id": id, "updatedAt": at, "by": self.machine.id, "deleted": true })
                        }
                    };
                    write_json(&dir.join(format!("{id}.json")), &data)?;
                }
                Pick::Theirs => match theirs {
                    Some(p) => {
                        let mut p = p.clone();
                        p["id"] = json!(id);
                        match out.iter_mut().find(|(i, _)| *i == id) {
                            Some(slot) => slot.1 = p,
                            None => out.push((id.clone(), p)),
                        }
                    }
                    None => out.retain(|(i, _)| *i != id),
                },
                _ => {}
            }
            if let Some(now) = if side == Pick::Theirs { t } else { h } {
                agreed.insert(id, json!(now));
            }
        }
        self.write_state("personas", agreed)?;
        let personas: Vec<Value> = out.into_iter().map(|(_, p)| p).collect();
        let changed = personas != local;
        Ok((personas, changed))
    }

    /// The user's own skills and skills/<id>/ in the repository brought into step, as personas are.
    pub fn sync_skills(&self, own: &Path) -> Result<()> {
        let dir = self.dir.join("skills");
        let state = self.read_state();
        let first = !state.contains_key("skills");
        let base = state
            .get("skills")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let names = |d: &Path| -> Vec<String> {
            fs::read_dir(d)
                .into_iter()
                .flatten()
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        };
        let mut local: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
        for id in names(own) {
            if ok_id(&SKILL_ID, &id) && own.join(&id).join("SKILL.md").exists() {
                local.insert(id.clone(), files_of(&own.join(&id)));
            }
        }
        let mut repo_items: BTreeMap<String, Value> = BTreeMap::new();
        for id in names(&dir) {
            let data = fs::read(dir.join(&id).join("skill.json"))
                .ok()
                .and_then(|b| serde_json::from_slice::<Value>(&b).ok());
            if let Some(data) =
                data.filter(|d| d["id"].as_str() == Some(id.as_str()) && ok_id(&SKILL_ID, &id))
            {
                repo_items.insert(id, data);
            }
        }
        let mut ids: Vec<String> = local
            .keys()
            .chain(repo_items.keys())
            .chain(base.keys())
            .cloned()
            .collect();
        ids.dedup();
        let ids: Vec<String> = ids
            .into_iter()
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        let mut agreed = Map::new();
        for id in ids {
            let there = repo_items.get(&id);
            let files: Option<BTreeMap<String, String>> = there
                .filter(|t| t["deleted"] != Value::Bool(true))
                .and_then(|t| t["files"].as_object())
                .map(|m| {
                    m.iter()
                        .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_owned())))
                        .collect()
                });
            let (h, t) = (hash_of_files(local.get(&id)), hash_of_files(files.as_ref()));
            let side = step(
                h.as_deref(),
                t.as_deref(),
                base.get(&id).and_then(Value::as_str),
                first,
                there.is_some(),
            );
            let mut now = if side == Pick::Theirs {
                t.clone()
            } else {
                h.clone()
            };
            let item = dir.join(&id);
            match side {
                Pick::Ours => {
                    let at = now_iso();
                    let _ = fs::remove_dir_all(item.join("files"));
                    match local.get(&id) {
                        Some(f) => {
                            copy_dir(&own.join(&id), &item.join("files"), &|p| !stays(p))?;
                            write_json(
                                &item.join("skill.json"),
                                &json!({ "id": id, "updatedAt": at, "by": self.machine.id, "files": f }),
                            )?;
                        }
                        None => write_json(
                            &item.join("skill.json"),
                            &json!({ "id": id, "updatedAt": at, "by": self.machine.id, "deleted": true }),
                        )?,
                    }
                }
                Pick::Theirs if files.is_some() => {
                    // only once every file is there as skill.json lists it
                    if hash_of_files(Some(&files_of(&item.join("files")))) == t {
                        fs::create_dir_all(own).map_err(|e| GitError::io("create", own, e))?;
                        replace_folder(&item.join("files"), &own.join(&id))?;
                    } else {
                        now.clone_from(&h);
                    }
                }
                Pick::Theirs => {
                    let _ = fs::remove_dir_all(own.join(&id));
                }
                _ => {}
            }
            if let Some(now) = now {
                agreed.insert(id, json!(now));
            }
        }
        self.write_state("skills", agreed)
    }
}

/// What a persona, skill or template file belongs to: its item's folder or file, taken whole.
fn item_of(rel: &str) -> Option<String> {
    static RE: LazyLock<Option<Regex>> =
        LazyLock::new(|| Regex::new(r"^(personas/[^/]+\.json|(?:skills|templates)/[^/]+)").ok());
    RE.as_ref()?.captures(rel).map(|c| c[1].to_owned())
}

fn meta_of(item: &str) -> String {
    if item.starts_with("personas/") {
        item.to_owned()
    } else if item.starts_with("skills/") {
        format!("{item}/skill.json")
    } else {
        format!("{item}/template.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn which_copy_wins() {
        assert_eq!(step(Some("a"), Some("a"), None, true, true), Pick::Equal);
        assert_eq!(
            step(Some("a"), Some("b"), None, true, true),
            Pick::Theirs,
            "first: the repository's"
        );
        assert_eq!(step(Some("a"), None, None, true, false), Pick::Ours);
        assert_eq!(
            step(Some("b"), Some("a"), Some("a"), false, true),
            Pick::Ours
        );
        assert_eq!(
            step(Some("a"), Some("b"), Some("a"), false, true),
            Pick::Theirs
        );
        assert_eq!(
            step(Some("c"), Some("b"), Some("a"), false, true),
            Pick::Ours,
            "both: this computer's"
        );
        assert_eq!(
            item_of("skills/x/files/SKILL.md").as_deref(),
            Some("skills/x")
        );
        assert_eq!(
            item_of("personas/a.json").as_deref(),
            Some("personas/a.json")
        );
        assert_eq!(item_of("settings/m.json"), None);
        assert_eq!(meta_of("templates/t"), "templates/t/template.json");
    }

    #[test]
    fn hashes_match_2_8() {
        // node -e "crypto.createHash('sha1').update(JSON.stringify(Object.entries({b:'2',a:'1'}).sort())).digest('hex')"
        let files = BTreeMap::from([
            ("b".to_owned(), "2".to_owned()),
            ("a".to_owned(), "1".to_owned()),
        ]);
        assert_eq!(
            hash_of_files(Some(&files)).unwrap(),
            sha1(br#"[["a","1"],["b","2"]]"#)
        );
        assert_eq!(hash_of_files(None), None);
    }
}
