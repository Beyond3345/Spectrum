//! A project's own settings in `.spectrum/settings.json` (2.8's `projectSettings.js`), which go with the project
//! to the user's other computers. Not in `project.json`: 1.10.4 rewrites that through its own list of keys.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{CoreError, json};

/// Each key is absent when the project makes no choice of its own; the shapes are 2.8's and are read by the
/// crates that own them (compile options, skills `{ on, off }`, language `{ languages }`, Jyutping, to-do groups).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProjectSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compile: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jyutping: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub todo_groups: Option<Value>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

pub fn project_settings_file(root: &Path) -> PathBuf {
    root.join(".spectrum").join("settings.json")
}

fn read(file: &Path) -> Result<ProjectSettings, CoreError> {
    Ok(json::read_object(file)?
        .map(json::lenient)
        .unwrap_or_default())
}

/// The project's settings: empty when it has none; `CoreError::Unreadable` when the file can't be read
/// (2.8's callers that don't mind treat that as empty).
pub fn read_project_settings(root: &Path) -> Result<ProjectSettings, CoreError> {
    let file = project_settings_file(root);
    let lock = json::lock_for(&file);
    let _held = lock.lock();
    read(&file)
}

/// Reads, lets `f` change and atomically writes the project's settings, under the project's lock. A file that
/// can't be read is left alone rather than replaced; an unchanged one isn't rewritten.
pub fn update_project_settings(
    root: &Path,
    f: impl FnOnce(&mut ProjectSettings),
) -> Result<ProjectSettings, CoreError> {
    let file = project_settings_file(root);
    let lock = json::lock_for(&file);
    let _held = lock.lock();
    let before = read(&file)?;
    let mut next = before.clone();
    f(&mut next);
    if next != before {
        json::write_pretty(&file, &next)?;
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trips_without_loss_and_refuses_a_broken_file() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path();
        assert_eq!(
            read_project_settings(root).unwrap(),
            ProjectSettings::default()
        );
        let file = project_settings_file(root);
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(
            &file,
            json!({ "compile": { "engine": "xelatex" }, "newer": 1 }).to_string(),
        )
        .unwrap();
        let next =
            update_project_settings(root, |s| s.skills = Some(json!({ "on": ["a"], "off": [] })))
                .unwrap();
        assert_eq!(next.compile, Some(json!({ "engine": "xelatex" })));
        let back: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(back["newer"], json!(1));
        assert_eq!(back["skills"]["on"], json!(["a"]));
        assert!(back.get("jyutping").is_none());

        std::fs::write(&file, "not json").unwrap();
        assert!(matches!(
            read_project_settings(root),
            Err(CoreError::Unreadable { .. })
        ));
        assert!(update_project_settings(root, |s| s.compile = None).is_err());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "not json");
    }

    #[test]
    fn concurrent_updates_lose_nothing() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().to_path_buf();
        let threads: Vec<_> = (0..8)
            .map(|i| {
                let root = root.clone();
                std::thread::spawn(move || {
                    update_project_settings(&root, |s| {
                        s.extra.insert(format!("k{i}"), json!(i));
                    })
                    .unwrap();
                })
            })
            .collect();
        for t in threads {
            t.join().unwrap();
        }
        assert_eq!(read_project_settings(&root).unwrap().extra.len(), 8);
    }
}
