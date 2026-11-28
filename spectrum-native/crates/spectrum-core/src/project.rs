//! Projects: ordinary folders anywhere on disk, each with its metadata in `.spectrum/project.json`, listed in
//! `DATA_DIR/registry.json` (2.8's `projectService.js`).

mod import;
mod main_file;
mod tree;

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub use import::{extract_arxiv, extract_zip};
pub use main_file::{conflict_copies, detect_main_file};
pub use tree::{EntryKind, TreeEntry, is_hidden_path, scan_tree};

use crate::{CoreError, json, random};

/// The app's folder inside every project.
pub const APP_DIR: &str = ".spectrum";

pub fn meta_file(root: &Path) -> PathBuf {
    root.join(APP_DIR).join("project.json")
}

/// `.spectrum/project.json`. Keys this version doesn't know (a later one's, `layout`) stay in `extra`, so the
/// file comes through a save here whole.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    /// ISO 8601, as JavaScript's `toISOString`.
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub archived: bool,
    pub file_order: Map<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main_file: Option<String>,
    /// The project is a working copy of that template.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_draft: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_saved_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_hash: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl ProjectMeta {
    /// Metadata from parsed JSON, filled in as 2.8's `normaliseMeta` does. `None` for a non-object.
    pub fn from_value(value: Value) -> Option<Self> {
        let Value::Object(map) = value else {
            return None;
        };
        let mut meta: Self = json::lenient(map);
        meta.normalise();
        Some(meta)
    }

    fn normalise(&mut self) {
        if self.name.is_empty() {
            "Untitled".clone_into(&mut self.name);
        }
        if self.created_at.is_empty() {
            self.created_at = now_iso();
        }
        if self.updated_at.is_empty() {
            self.updated_at.clone_from(&self.created_at);
        }
        for field in [
            &mut self.main_file,
            &mut self.template_draft,
            &mut self.template_saved_at,
            &mut self.template_hash,
        ] {
            if field.as_deref() == Some("") {
                *field = None;
            }
        }
    }

    /// 2.8 takes a folder for a project only when its id is `[A-Za-z0-9_-]+`.
    pub fn has_valid_id(&self) -> bool {
        !self.id.is_empty()
            && self
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    }
}

/// The project's metadata; `None` when the folder has no `project.json`.
pub fn read_meta(root: &Path) -> Result<Option<ProjectMeta>, CoreError> {
    let file = meta_file(root);
    Ok(json::read_object(&file)?.and_then(|map| ProjectMeta::from_value(Value::Object(map))))
}

pub fn write_meta(root: &Path, meta: &ProjectMeta) -> Result<(), CoreError> {
    let file = meta_file(root);
    let lock = json::lock_for(&file);
    let _held = lock.lock();
    json::write_pretty(&file, meta)
}

/// `DATA_DIR/registry.json`: every project's folder, and the name, tags and archived flag a missing folder
/// still lists with.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Registry {
    pub version: u32,
    pub projects: Vec<RegistryEntry>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            version: 1,
            projects: Vec::new(),
            extra: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RegistryEntry {
    pub id: String,
    pub path: PathBuf,
    pub name: String,
    pub tags: Vec<String>,
    pub archived: bool,
    pub added_at: String,
    /// `inPlace` (1.10's) and the like.
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Registry {
    fn from_map(mut map: Map<String, Value>) -> Self {
        // entry by entry, so one odd entry can't empty the list (and the next save lose every project)
        let projects = match map.remove("projects") {
            Some(Value::Array(items)) => items
                .into_iter()
                .filter_map(|item| match item {
                    Value::Object(entry) => Some(json::lenient::<RegistryEntry>(entry)),
                    _ => None,
                })
                .collect(),
            _ => Vec::new(),
        };
        let mut registry: Self = json::lenient(map);
        registry.projects = projects;
        registry
    }
}

/// The project list; empty when there is none yet; `CoreError::Unreadable` when the file can't be read.
pub fn load_registry(file: &Path) -> Result<Registry, CoreError> {
    let lock = json::lock_for(file);
    let _held = lock.lock();
    Ok(json::read_object(file)?
        .map(Registry::from_map)
        .unwrap_or_default())
}

/// Reads the list, lets `f` change it and writes it back (only when changed), one change at a time.
pub fn update_registry<R>(file: &Path, f: impl FnOnce(&mut Registry) -> R) -> Result<R, CoreError> {
    let lock = json::lock_for(file);
    let _held = lock.lock();
    let before = json::read_object(file)?
        .map(Registry::from_map)
        .unwrap_or_default();
    let mut next = before.clone();
    let result = f(&mut next);
    if next != before {
        json::write_pretty(file, &next)?;
    }
    Ok(result)
}

/// Lists the project (replacing any entry with its id or folder), keeping when it was first added.
pub fn register(file: &Path, root: &Path, meta: &ProjectMeta) -> Result<(), CoreError> {
    update_registry(file, |registry| {
        let previous = registry.projects.iter().find(|p| p.id == meta.id).cloned();
        registry
            .projects
            .retain(|p| p.id != meta.id && p.path != root);
        registry.projects.push(RegistryEntry {
            id: meta.id.clone(),
            path: root.to_path_buf(),
            name: meta.name.clone(),
            tags: meta.tags.clone(),
            archived: meta.archived,
            added_at: previous
                .as_ref()
                .map_or_else(now_iso, |p| p.added_at.clone()),
            extra: previous.map(|p| p.extra).unwrap_or_default(),
        });
    })
}

/// A display name as a folder name that works on macOS and Windows (2.8's `sanitiseFolderName`).
pub fn sanitise_folder_name(name: &str) -> String {
    let clean: String = name
        .chars()
        .filter(|c| {
            !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
                && !c.is_ascii_control()
        })
        .collect();
    // and a leading ~, which Synology passes by and OneDrive refuses
    let clean = clean.trim().trim_start_matches(['.', '~']).trim();
    // Windows drops a trailing dot or space, and CON, AUX and the like are device names
    let short: String = clean.chars().take(100).collect();
    let short = short.trim().trim_end_matches(['.', ' ']);
    let stem = short
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let device = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || (stem.len() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && stem.as_bytes()[3].is_ascii_digit());
    if short.is_empty() {
        "Untitled".to_owned()
    } else if device {
        let (head, tail) = short.split_at(stem.len());
        format!("{head}_{tail}")
    } else {
        short.to_owned()
    }
}

/// Creates `<parent>/<base>`, or `<base> 2`, `<base> 3`… when that is taken.
pub fn make_unique_folder(parent: &Path, base: &str) -> Result<PathBuf, CoreError> {
    for n in 1u32.. {
        let candidate = parent.join(if n == 1 {
            base.to_owned()
        } else {
            format!("{base} {n}")
        });
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => {}
            Err(err) => return Err(CoreError::io("couldn't create", &candidate, err)),
        }
    }
    Err(CoreError::io(
        "couldn't create",
        parent,
        io::Error::other("no free folder name"),
    ))
}

/// Makes a project folder in `parent`, fills it with `populate` (an import, a template), then writes its
/// metadata and lists it. On failure nothing is left behind.
pub fn create_project(
    registry_file: &Path,
    parent: &Path,
    name: &str,
    populate: impl FnOnce(&Path) -> Result<(), CoreError>,
) -> Result<(PathBuf, ProjectMeta), CoreError> {
    if !parent.is_absolute() {
        return Err(CoreError::NotAbsolute(parent.to_path_buf()));
    }
    fs::create_dir_all(parent).map_err(|e| CoreError::io("couldn't create", parent, e))?;
    let parent = fs::canonicalize(parent).map_err(|e| CoreError::io("couldn't find", parent, e))?;
    let display: String = name.trim().chars().take(200).collect();
    let display = if display.is_empty() {
        "Untitled".to_owned()
    } else {
        display
    };
    let root = make_unique_folder(&parent, &sanitise_folder_name(&display))?;
    let made = (|| {
        populate(&root)?;
        let now = now_iso();
        let mut meta = ProjectMeta {
            id: random::uuid_v4()?,
            name: display,
            created_at: now.clone(),
            updated_at: now,
            main_file: detect_main_file(&root, &[])?,
            ..ProjectMeta::default()
        };
        // made now, so in the folders its author chose (2.1's layout never moves it)
        meta.extra.insert("layout".into(), Value::from(2));
        write_meta(&root, &meta)?;
        register(registry_file, &root, &meta)?;
        Ok(meta)
    })();
    match made {
        Ok(meta) => Ok((root, meta)),
        Err(err) => {
            let _ = fs::remove_dir_all(&root);
            Err(err)
        }
    }
}

/// Now as JavaScript's `new Date().toISOString()`: `2026-11-28T09:30:00.000Z`.
pub(crate) fn now_iso() -> String {
    let since = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = since.as_secs();
    let days = i64::try_from(secs / 86_400).unwrap_or_default();
    let rem = secs % 86_400;
    // Howard Hinnant's civil_from_days
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60,
        since.subsec_millis()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn folder_names_work_everywhere() {
        assert_eq!(sanitise_folder_name("  ~.My: Thesis?.  "), "My Thesis");
        assert_eq!(sanitise_folder_name("con.tex"), "con_.tex");
        assert_eq!(sanitise_folder_name("COM1"), "COM1_");
        assert_eq!(sanitise_folder_name("computer"), "computer");
        assert_eq!(sanitise_folder_name("///"), "Untitled");
    }

    #[test]
    fn meta_keeps_unknown_keys_and_fills_gaps() {
        let meta = ProjectMeta::from_value(json!({
            "id": "abc", "name": "", "createdAt": "2020-01-01T00:00:00.000Z", "layout": 2, "mainFile": "",
            "tags": "oops"
        }))
        .unwrap();
        assert_eq!(meta.name, "Untitled");
        assert_eq!(meta.updated_at, "2020-01-01T00:00:00.000Z");
        assert_eq!(meta.main_file, None);
        assert_eq!(meta.tags, Vec::<String>::new());
        assert_eq!(meta.extra["layout"], json!(2));
        assert!(meta.has_valid_id());
    }

    #[test]
    fn creates_lists_and_cleans_up() {
        let dir = tempfile::tempdir().unwrap();
        let registry = dir.path().join("data").join("registry.json");
        let parent = dir.path().join("Spectrum");
        let (root, meta) = create_project(&registry, &parent, " Paper ", |root| {
            fs::write(
                root.join("paper.tex"),
                "\\documentclass{article}\\begin{document}\\end{document}",
            )
            .map_err(|e| CoreError::io("write", root, e))
        })
        .unwrap();
        assert!(root.ends_with("Paper"));
        assert_eq!(meta.main_file.as_deref(), Some("paper.tex"));
        assert_eq!(read_meta(&root).unwrap().unwrap(), meta);
        let listed = load_registry(&registry).unwrap();
        assert_eq!(listed.projects.len(), 1);
        assert_eq!(listed.projects[0].path, root);

        let failed = create_project(&registry, &parent, "Paper", |_| {
            Err(CoreError::ArxivPdfOnly)
        });
        assert!(failed.is_err());
        assert!(!parent.join("Paper 2").exists());
    }

    #[test]
    fn registry_survives_an_odd_entry() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("registry.json");
        let stored = json!({ "version": 1, "projects": [
            { "id": "a", "path": "/x/a", "name": "A", "tags": "bad", "addedAt": "t", "inPlace": true },
            { "id": "b", "path": "/x/b", "name": "B", "tags": [], "archived": false, "addedAt": "t" }
        ]});
        fs::write(&file, stored.to_string()).unwrap();
        let registry = load_registry(&file).unwrap();
        assert_eq!(registry.projects.len(), 2);
        assert_eq!(registry.projects[0].extra["inPlace"], json!(true));
    }

    #[test]
    fn iso_time_has_javascripts_shape() {
        let now = now_iso();
        assert_eq!(now.len(), 24);
        assert!(now.ends_with('Z') && now.as_bytes()[10] == b'T');
        assert!(now.as_str() > "2025-01-01");
    }
}
