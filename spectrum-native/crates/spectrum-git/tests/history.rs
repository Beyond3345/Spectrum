//! Checkpoints in temp projects: 2.8's on-disk history read as it is, create, list, restore, rename,
//! delete, diffs, binary files, renamed files and names that aren't UTF-8.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::similar_names,
    clippy::format_collect
)]

use std::fs;
use std::io::Write;
use std::path::Path;

use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use spectrum_git::history::{self, ChangeStatus, Reason};
use spectrum_git::{FileDiff, HunkKind};

fn write(root: &Path, rel: &str, bytes: &[u8]) {
    let path = root.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}

fn read(root: &Path, rel: &str) -> Option<Vec<u8>> {
    fs::read(root.join(rel)).ok()
}

fn sha(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A stored file as 2.8's `snapshotDisk` writes one.
fn store_2_8(root: &Path, bytes: &[u8]) -> String {
    let sha = sha(bytes);
    let path = root
        .join(".spectrum/history/objects")
        .join(&sha[..2])
        .join(format!("{sha}.gz"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    enc.write_all(bytes).unwrap();
    fs::write(path, enc.finish().unwrap()).unwrap();
    sha
}

/// A project as 2.8.0 left it: a 1.7.0 checkpoint (files only in its manifest, details in index.json, id 3)
/// and a 2.8 one with its details in the manifest, renamed by 1.7.0 since (index.json's label differs).
fn project_from_2_8(root: &Path) -> (u64, u64) {
    write(root, "main.tex", b"now\n");
    write(
        root,
        ".spectrum/project.json",
        br#"{"id":"p1","name":"Paper"}"#,
    );
    let one = store_2_8(root, b"one\n");
    let two = store_2_8(root, b"two\n");
    let png = store_2_8(root, b"PNG\0old");
    let dir = root.join(".spectrum/history/manifests");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("3.json"),
        json!({ "files": { "main.tex": one } }).to_string(),
    )
    .unwrap();
    let new_id: u64 = 23_706_000_123; // 2.8: seconds since 2026 and three digits
    let summary =
        json!({ "kind": "updated", "files": ["main.tex", "fig.png"], "added": 1, "removed": 1 });
    fs::write(
        dir.join(format!("{new_id}.json")),
        serde_json::to_string_pretty(&json!({
            "files": { "main.tex": two, "fig.png": png },
            "createdAt": "2026-10-02T09:00:00.000Z", "label": "Draft", "reason": "compile", "summary": summary
        }))
        .unwrap(),
    )
    .unwrap();
    // a sync app's conflict copy and a temp file are never read as checkpoints
    fs::write(dir.join("5 (conflicted copy).json"), "{}").unwrap();
    fs::write(root.join(".spectrum/history/index.json"), serde_json::to_string_pretty(&json!({
        "nextId": 4,
        "versions": [
            { "id": 3, "createdAt": "2026-01-05T10:00:00.000Z", "label": "From 1.7", "reason": "manual",
              "summary": { "kind": "initial", "files": ["main.tex"], "added": 1, "removed": 0 } },
            { "id": new_id, "createdAt": "2026-10-02T09:00:00.000Z", "label": "Renamed in 1.7", "reason": "compile",
              "summary": summary, "manifestLabel": "Draft" }
        ]
    })).unwrap()).unwrap();
    (3, new_id)
}

#[test]
fn checkpoints_2_8_saved_show_up_and_restore() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let (old, new) = project_from_2_8(root);
    let list = history::list(root).unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(
        (list[1].id, list[1].number, list[1].label.as_str()),
        (old, 3, "From 1.7")
    );
    assert_eq!(list[0].id, new);
    assert_eq!(list[0].number, 4, "later ones count on from 1.7.0's");
    assert_eq!(
        list[0].label, "Renamed in 1.7",
        "a 1.7.0 rename in index.json wins over the manifest"
    );
    assert_eq!(list[0].reason, Reason::Compile);

    let restored = history::restore(root, old, None).unwrap();
    assert_eq!(read(root, "main.tex").unwrap(), b"one\n");
    let safety = restored.safety.expect("what was there is kept");
    assert_eq!(safety.reason, Reason::BeforeRestore);
    assert_eq!(
        history::read_file(root, safety.id, "main.tex").unwrap(),
        b"now\n"
    );
    // one file only, from the 2.8 checkpoint: a binary file comes back byte for byte
    history::restore(root, new, Some("fig.png")).unwrap();
    assert_eq!(read(root, "fig.png").unwrap(), b"PNG\0old");
    assert_eq!(read(root, "main.tex").unwrap(), b"one\n");

    // what 2.8 reads back: our manifest in its shape, index.json with every id and a nextId above them
    let index: Value =
        serde_json::from_slice(&read(root, ".spectrum/history/index.json").unwrap()).unwrap();
    let ids: Vec<u64> = index["versions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["id"].as_u64().unwrap())
        .collect();
    assert!(ids.contains(&old) && ids.contains(&new) && ids.contains(&safety.id));
    assert!(index["nextId"].as_u64().unwrap() > safety.id);
    let manifest: Value = serde_json::from_slice(
        &read(
            root,
            &format!(".spectrum/history/manifests/{}.json", safety.id),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(manifest["reason"], "before-restore");
    assert_eq!(manifest["files"]["main.tex"], sha(b"now\n"));
    assert!(manifest["createdAt"].as_str().unwrap().ends_with('Z'));
    assert!(
        safety.id > 1_000_000_000,
        "ids made since 1.7.0 are far above its own"
    );
}

#[test]
fn create_skips_unchanged_and_app_data_and_compiled_pdfs() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "main.tex", b"\\documentclass{article}\nHello\n");
    write(root, "main.pdf", b"%PDF compiled");
    write(root, ".spectrum/settings.json", br#"{"compile":{}}"#);
    write(root, ".git/HEAD", b"ref: refs/heads/main\n");
    let first = history::create(root, "First", Reason::Manual).unwrap();
    assert!(!first.unchanged);
    assert_eq!(first.checkpoint.summary["kind"], "initial");
    assert_eq!(
        first.checkpoint.summary["files"],
        json!(["main.tex"]),
        "no compiled PDF, .spectrum or .git"
    );
    let again = history::create(root, "", Reason::Manual).unwrap();
    assert!(again.unchanged);
    assert_eq!(again.checkpoint.id, first.checkpoint.id);
}

#[test]
fn compiles_leave_one_checkpoint_per_ten_minutes_unless_named() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "a.tex", b"1\n");
    history::create(root, "", Reason::Compile).unwrap();
    write(root, "a.tex", b"2\n");
    let second = history::create(root, "", Reason::Compile).unwrap();
    let list = history::list(root).unwrap();
    assert_eq!(list.len(), 1, "the second compile's took the first's place");
    assert_eq!(list[0].id, second.checkpoint.id);
    // asked for with nothing changed: the compile's becomes it
    let manual = history::create(root, "Named", Reason::Manual).unwrap();
    assert!(manual.unchanged);
    assert_eq!(history::list(root).unwrap()[0].label, "Named");
    write(root, "a.tex", b"3\n");
    history::create(root, "", Reason::Compile).unwrap();
    assert_eq!(history::list(root).unwrap().len(), 2);
}

#[test]
fn diffs_between_checkpoints_and_the_disk() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "a.tex", b"one\ntwo\n");
    write(root, "old-name.tex", b"moved\n");
    write(root, "pic.png", b"\x89PNG\0one");
    let a = history::create(root, "", Reason::Manual)
        .unwrap()
        .checkpoint
        .id;
    write(root, "a.tex", b"one\n2\nthree\n");
    fs::rename(root.join("old-name.tex"), root.join("new-name.tex")).unwrap();
    write(root, "pic.png", b"\x89PNG\0two");
    let b = history::create(root, "", Reason::Manual)
        .unwrap()
        .checkpoint
        .id;
    let changes = history::compare(root, a, b).unwrap();
    let by: Vec<_> = changes
        .iter()
        .map(|c| (c.path.as_str(), c.status, c.added, c.removed, c.binary))
        .collect();
    assert_eq!(
        by,
        [
            ("a.tex", ChangeStatus::Modified, 2, 1, false),
            ("new-name.tex", ChangeStatus::Added, 1, 0, false),
            ("old-name.tex", ChangeStatus::Removed, 0, 1, false),
            ("pic.png", ChangeStatus::Modified, 0, 0, true),
        ]
    );
    assert_eq!(history::changes(root, b).unwrap(), changes);
    let FileDiff::Text(text) = history::file_diff(root, Some(a), Some(b), "a.tex").unwrap() else {
        panic!()
    };
    assert_eq!(text.hunks[0].kind, HunkKind::Changed);
    assert_eq!(
        history::file_diff(root, Some(a), None, "pic.png").unwrap(),
        FileDiff::Binary { changed: true }
    );
    write(root, "a.tex", b"changed on disk\n");
    let now = history::compare_with_current(root, b).unwrap();
    assert_eq!(now.len(), 1);
    assert_eq!(now[0].path, "a.tex");

    // restoring a brings the old name back and takes the new one away
    history::restore(root, a, None).unwrap();
    assert!(read(root, "old-name.tex").is_some());
    assert!(read(root, "new-name.tex").is_none());
}

#[test]
fn restore_moves_an_untracked_file_aside_and_rename_and_delete_work() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "main.pdf", b"%PDF hand-made");
    let id = history::create(root, "", Reason::Manual)
        .unwrap()
        .checkpoint
        .id;
    // main.pdf is now main.tex's compiled PDF, which checkpoints don't hold
    write(root, "main.tex", b"\\documentclass{article}");
    write(root, "main.pdf", b"%PDF compiled");
    let restored = history::restore(root, id, None).unwrap();
    assert_eq!(restored.kept_aside, ["main (before restore).pdf"]);
    assert_eq!(
        read(root, "main (before restore).pdf").unwrap(),
        b"%PDF compiled"
    );
    assert_eq!(read(root, "main.pdf").unwrap(), b"%PDF hand-made");

    let renamed = history::rename(root, id, "Kept").unwrap();
    assert_eq!(renamed.label, "Kept");
    let before = history::list(root).unwrap().len();
    history::delete(root, id).unwrap();
    assert_eq!(history::list(root).unwrap().len(), before - 1);
    assert!(matches!(
        history::read_file(root, id, "main.pdf"),
        Err(spectrum_git::GitError::NotFound)
    ));
    assert!(matches!(
        history::restore(root, 999, None),
        Err(spectrum_git::GitError::NotFound)
    ));
    assert!(history::restore(root, id, Some("../x")).is_err());
}

#[test]
fn a_checkpoint_whose_files_have_not_arrived_is_not_half_restored() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "a.tex", b"a\n");
    let id = history::create(root, "", Reason::Manual)
        .unwrap()
        .checkpoint
        .id;
    fs::remove_dir_all(root.join(".spectrum/history/objects")).unwrap();
    write(root, "a.tex", b"changed\n");
    assert!(matches!(
        history::restore(root, id, None),
        Err(spectrum_git::GitError::NotArrived)
    ));
    assert_eq!(read(root, "a.tex").unwrap(), b"changed\n");
}

#[cfg(unix)]
#[test]
fn a_name_that_is_not_utf8_is_skipped_not_fatal() {
    use std::os::unix::ffi::OsStrExt;
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "a.tex", b"a\n");
    let name = std::ffi::OsStr::from_bytes(b"caf\xe9.tex");
    if fs::write(root.join(name), b"latin-1 name").is_err() {
        // APFS refuses names that aren't UTF-8, so there's nothing to skip
        return;
    }
    let created = history::create(root, "", Reason::Manual).unwrap();
    assert_eq!(created.skipped.len(), 1);
    assert_eq!(created.checkpoint.summary["files"], json!(["a.tex"]));
}
