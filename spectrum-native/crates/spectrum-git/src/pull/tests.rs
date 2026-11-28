//! 2.8's github-merge tests, ported: two computers' copies of a project and a bare "GitHub" repository in
//! temp folders, each committing, pushing, fetching and merging as Back up, Pull and Sync do.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::*;
use crate::repo::{
    CommitOptions, clone_into, commit_all, fetch_origin, init_repo, push_origin, set_remote,
};

fn author() -> Author {
    Author {
        name: "Octo Cat".into(),
        email: "7+octo@users.noreply.github.com".into(),
    }
}

fn write(root: &Path, rel: &str, bytes: &[u8]) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, bytes).unwrap();
}

fn read(root: &Path, rel: &str) -> Option<String> {
    fs::read(root.join(rel))
        .ok()
        .map(|b| String::from_utf8_lossy(&b).into_owned())
}

fn commit(root: &Path) -> crate::repo::Committed {
    commit_all(
        root,
        &CommitOptions {
            message: "Backup",
            author: &author(),
            hold: &|_| false,
            always: false,
            compiled: true,
        },
    )
    .unwrap()
}

fn merge(root: &Path, allow_deletions: bool) -> Result<PullResult> {
    merge_origin(
        root,
        &MergeOptions {
            author: &author(),
            allow_deletions,
            dry_run: false,
            base: None,
            side: &|_| None,
            message: "Pull from GitHub",
            checkpoint: true,
        },
    )
}

/// What Sync does on one computer: commit, fetch, merge, push.
fn sync(root: &Path) -> PullResult {
    commit(root);
    fetch_origin(root, None).unwrap();
    let result = merge(root, false).unwrap();
    if result.state != PullState::Confirm {
        assert!(push_origin(root, None).unwrap());
    }
    result
}

struct Pair {
    _dir: tempfile::TempDir,
    a: PathBuf,
    b: PathBuf,
    remote: PathBuf,
}

/// Two computers' copies of a new project: A's first commit pushed, B cloned from it.
fn pair(files: &[(&str, &[u8])]) -> Pair {
    let dir = tempfile::tempdir().unwrap();
    let (a, b, remote) = (
        dir.path().join("A"),
        dir.path().join("B"),
        dir.path().join("remote.git"),
    );
    Repository::init_bare(&remote).unwrap();
    write(
        &a,
        ".spectrum/project.json",
        br#"{"id":"p1","name":"Paper"}"#,
    );
    for (rel, bytes) in files {
        write(&a, rel, bytes);
    }
    let repo = init_repo(&a, "main", true).unwrap();
    set_remote(&repo, remote.to_str().unwrap()).unwrap();
    commit(&a);
    assert!(push_origin(&a, None).unwrap());
    clone_into(&b, remote.to_str().unwrap(), None).unwrap();
    Pair {
        _dir: dir,
        a,
        b,
        remote,
    }
}

fn remote_files(p: &Pair) -> Vec<String> {
    let r = Repository::open_bare(&p.remote).unwrap();
    tree_files(&r, r.refname_to_id("refs/heads/main").ok())
        .unwrap()
        .into_keys()
        .collect()
}

fn copies(root: &Path, dir: &str) -> Vec<String> {
    fs::read_dir(root.join(dir))
        .unwrap()
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|n| n.contains("GitHub’s conflicted copy"))
        .collect()
}

#[test]
fn one_sided_changes_merge_and_a_binary_file_keeps_githubs_beside_it() {
    let lines = |k: i32| {
        (0..12)
            .map(|i| {
                if i == k {
                    format!("changed {k}")
                } else {
                    format!("line {i}")
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let p = pair(&[
        ("main.tex", lines(-1).as_bytes()),
        ("only.tex", b"one"),
        ("fig.png", b"PNG\0one"),
    ]);
    write(&p.a, "main.tex", lines(1).as_bytes());
    write(&p.a, "fig.png", b"PNG\0from A");
    sync(&p.a);
    write(&p.b, "main.tex", lines(10).as_bytes());
    write(&p.b, "only.tex", b"B changed");
    write(&p.b, "fig.png", b"PNG\0from B");
    let result = sync(&p.b);
    assert_eq!(result.state, PullState::Merged);
    assert_eq!(result.conflicts, 1);
    assert_eq!(
        read(&p.b, "main.tex").unwrap(),
        lines(1).replace("line 10", "changed 10")
    );
    assert_eq!(read(&p.b, "only.tex").unwrap(), "B changed");
    assert_eq!(
        read(&p.b, "fig.png").unwrap(),
        "PNG\0from B",
        "this computer’s binary file stays"
    );
    let copy = copies(&p.b, "").pop().expect("GitHub’s beside it");
    assert!(copy.starts_with("fig (GitHub’s conflicted copy "));
    assert_eq!(read(&p.b, &copy).unwrap(), "PNG\0from A");
    assert!(
        remote_files(&p).contains(&copy),
        "the conflicted copy is committed"
    );
    let r = Repository::open_bare(&p.remote).unwrap();
    assert_eq!(
        r.find_commit(r.refname_to_id("refs/heads/main").unwrap())
            .unwrap()
            .parent_count(),
        2
    );
    // a "Before pull from GitHub" checkpoint holds what B had
    let list = crate::history::list(&p.b).unwrap();
    assert_eq!(list[0].label, "Before pull from GitHub");
    assert_eq!(
        crate::history::read_file(&p.b, list[0].id, "main.tex").unwrap(),
        lines(10).into_bytes()
    );
    // and A takes it all in
    sync(&p.a);
    assert_eq!(read(&p.a, "main.tex"), read(&p.b, "main.tex"));
    assert_eq!(read(&p.a, &copy).unwrap(), "PNG\0from A");
    assert_eq!(read(&p.a, "fig.png").unwrap(), "PNG\0from B");
    for root in [&p.a, &p.b] {
        assert!(!commit(root).committed, "nothing left to commit");
    }
}

#[test]
fn a_text_conflict_keeps_ours_and_app_files_merge_without_copies() {
    let chat = |messages: Value| {
        json!({ "id": "c1", "title": "Chat", "messages": messages, "updatedAt": "2026-10-25T00:00:00.000Z" }).to_string()
    };
    let msg = |c: &str, at: &str| json!({ "role": "user", "content": c, "createdAt": at });
    let todo = |extra: Value| {
        let mut t = json!({ "id": "t1", "text": "Fix intro", "done": false });
        t.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        serde_json::to_string_pretty(&t).unwrap()
    };
    let p = pair(&[
        ("main.tex", b"same line\n"),
        (
            ".spectrum/chats/c1.json",
            chat(json!([msg("hello", "1")])).as_bytes(),
        ),
        (".spectrum/todos/t1.json", todo(json!({})).as_bytes()),
        (
            ".spectrum/settings.json",
            json!({ "compile": { "engine": "xelatex", "draft": false } })
                .to_string()
                .as_bytes(),
        ),
    ]);
    write(&p.a, "main.tex", "A’s line\n".as_bytes());
    write(
        &p.a,
        ".spectrum/chats/c1.json",
        chat(json!([msg("hello", "1"), msg("from A", "2")])).as_bytes(),
    );
    write(
        &p.a,
        ".spectrum/todos/t1.json",
        todo(json!({ "done": true })).as_bytes(),
    );
    write(
        &p.a,
        ".spectrum/settings.json",
        json!({ "compile": { "engine": "lualatex", "draft": false } })
            .to_string()
            .as_bytes(),
    );
    sync(&p.a);
    write(&p.b, "main.tex", "B’s line\n".as_bytes());
    write(
        &p.b,
        ".spectrum/chats/c1.json",
        chat(json!([msg("hello", "1"), msg("from B", "3")])).as_bytes(),
    );
    write(
        &p.b,
        ".spectrum/todos/t1.json",
        todo(json!({ "text": "Fix the intro" })).as_bytes(),
    );
    write(
        &p.b,
        ".spectrum/settings.json",
        json!({ "compile": { "engine": "xelatex", "draft": true } })
            .to_string()
            .as_bytes(),
    );
    let result = sync(&p.b);
    assert_eq!(result.conflicts, 1);
    assert!(result.changed_app);
    assert_eq!(read(&p.b, "main.tex").unwrap(), "B’s line\n");
    let copy = copies(&p.b, "").pop().unwrap();
    assert_eq!(read(&p.b, &copy).unwrap(), "A’s line\n");
    let chat: Value =
        serde_json::from_str(&read(&p.b, ".spectrum/chats/c1.json").unwrap()).unwrap();
    let said: Vec<&str> = chat["messages"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["content"].as_str().unwrap())
        .collect();
    assert_eq!(said, ["hello", "from A", "from B"]);
    let todo: Value =
        serde_json::from_str(&read(&p.b, ".spectrum/todos/t1.json").unwrap()).unwrap();
    assert_eq!(
        todo,
        json!({ "id": "t1", "text": "Fix the intro", "done": true })
    );
    let settings: Value =
        serde_json::from_str(&read(&p.b, ".spectrum/settings.json").unwrap()).unwrap();
    assert_eq!(
        settings,
        json!({ "compile": { "engine": "lualatex", "draft": true } }),
        "one level deep"
    );
    assert_eq!(
        copies(&p.b, ".spectrum/chats"),
        [] as [std::string::String; 0]
    );
}

#[test]
fn a_deletion_wins_only_over_an_unchanged_file_and_many_wait_for_a_yes() {
    let p = pair(&[("gone.tex", b"old"), ("kept.tex", b"old")]);
    fs::remove_file(p.a.join("gone.tex")).unwrap();
    fs::remove_file(p.a.join("kept.tex")).unwrap();
    sync(&p.a);
    write(&p.b, "kept.tex", b"B changed it");
    sync(&p.b);
    assert!(read(&p.b, "gone.tex").is_none());
    assert_eq!(read(&p.b, "kept.tex").unwrap(), "B changed it");

    let many: Vec<(String, Vec<u8>)> = (0..8)
        .map(|i| (format!("f{i}.tex"), b"x".to_vec()))
        .collect();
    let refs: Vec<(&str, &[u8])> = many
        .iter()
        .map(|(a, b)| (a.as_str(), b.as_slice()))
        .collect();
    let p = pair(&refs);
    for (rel, _) in &many {
        fs::remove_file(p.a.join(rel)).unwrap();
    }
    sync(&p.a);
    let result = sync(&p.b);
    assert_eq!(result.state, PullState::Confirm);
    assert_eq!(result.deleting, 8);
    assert!(
        read(&p.b, "f0.tex").is_some(),
        "nothing deleted before the yes"
    );
    assert_eq!(merge(&p.b, true).unwrap().state, PullState::Merged);
    assert!(read(&p.b, "f0.tex").is_none());
}

#[test]
fn a_file_changed_after_the_commit_puts_back_what_the_pull_wrote() {
    let p = pair(&[("a.tex", b"a\n"), ("b.tex", b"b\n")]);
    write(&p.a, "a.tex", b"A's a\n");
    write(&p.a, "b.tex", b"A's b\n");
    sync(&p.a);
    commit(&p.b);
    fetch_origin(&p.b, None).unwrap();
    let head = Repository::open(&p.b)
        .unwrap()
        .refname_to_id("HEAD")
        .unwrap();
    write(&p.b, "b.tex", b"typed meanwhile\n");
    assert!(matches!(merge(&p.b, false), Err(GitError::Changed)));
    assert_eq!(read(&p.b, "a.tex").unwrap(), "a\n", "put back");
    assert_eq!(read(&p.b, "b.tex").unwrap(), "typed meanwhile\n");
    assert_eq!(
        Repository::open(&p.b)
            .unwrap()
            .refname_to_id("HEAD")
            .unwrap(),
        head,
        "the branch stays"
    );
}

#[test]
fn secrets_compiled_pdfs_and_spectrums_own_files_stay_out_and_the_users_excludes_stay() {
    let p = pair(&[("main.tex", b"\\documentclass{article}")]);
    write(&p.a, ".env", b"KEY=1");
    write(&p.a, "deploy.key", b"-----BEGIN PRIVATE KEY-----");
    write(&p.a, "deck.key", b"Keynote");
    write(&p.a, "main.pdf", b"%PDF compiled");
    write(&p.a, "figure.pdf", b"%PDF figure");
    write(&p.a, ".spectrum/history/index.json", b"{}");
    write(&p.a, ".spectrum/notes/n1.json", b"{}");
    write(&p.a, "draft (Ann's conflicted copy 2026-01-01).tex", b"x");
    let exclude = p.a.join(".git/info/exclude");
    fs::write(&exclude, "# mine\nsecret-notes.txt\n").unwrap();
    write(&p.a, "secret-notes.txt", b"private");
    let done = commit(&p.a);
    assert_eq!(done.left.len(), 2, "{:?}", done.left);
    assert!(push_origin(&p.a, None).unwrap());
    let files = remote_files(&p);
    for rel in ["deck.key", "figure.pdf", ".spectrum/notes/n1.json"] {
        assert!(files.contains(&rel.to_owned()), "{rel} goes up");
    }
    for rel in [
        ".env",
        "deploy.key",
        "main.pdf",
        ".spectrum/history/index.json",
        "draft (Ann's conflicted copy 2026-01-01).tex",
        "secret-notes.txt",
    ] {
        assert!(!files.contains(&rel.to_owned()), "{rel} stays out");
    }
    let text = fs::read_to_string(&exclude).unwrap();
    assert!(text.starts_with("# mine\nsecret-notes.txt\n# >>> Spectrum"));
    assert!(text.contains("/main.pdf\n"));
    commit(&p.a);
    assert_eq!(
        fs::read_to_string(&exclude).unwrap(),
        text,
        "rewritten in place, once"
    );
}

#[test]
fn crlf_from_a_windows_checkout_is_no_change_and_bib_entries_both_stay() {
    let bib = "@article{a,\n  title = {A}\n}\n";
    let p = pair(&[
        ("refs.bib", bib.as_bytes()),
        ("main.tex", b"one\ntwo\nthree\n"),
    ]);
    write(
        &p.a,
        "refs.bib",
        format!("{bib}\n@article{{fromA,\n  title = {{A2}}\n}}\n").as_bytes(),
    );
    sync(&p.a);
    write(
        &p.b,
        "refs.bib",
        format!("{bib}\n@article{{fromB,\n  title = {{B2}}\n}}\n").as_bytes(),
    );
    let result = sync(&p.b);
    assert_eq!(result.conflicts, 0);
    let merged = read(&p.b, "refs.bib").unwrap();
    assert!(merged.contains("fromA") && merged.contains("fromB"));

    // Git for Windows' checkout, which its own config reads as LF: no change, and no block on a pull
    let mut repo = Repository::open(&p.b).unwrap();
    repo.config()
        .unwrap()
        .set_bool("core.autocrlf", true)
        .unwrap();
    drop(repo);
    write(&p.b, "main.tex", b"one\r\ntwo\r\nthree\r\n");
    assert!(!commit(&p.b).committed);
    write(&p.a, "main.tex", b"one\nTWO\nthree\n");
    sync(&p.a);
    assert_eq!(sync(&p.b).state, PullState::Merged);
    assert_eq!(
        read(&p.b, "main.tex").unwrap(),
        "one\nTWO\nthree\n",
        "as GitHub has it, as 2.8 writes it"
    );
    write(&p.b, "main.tex", b"one\r\nTWO\r\nthree\r\nfour\r\n");
    sync(&p.b);
    repo = Repository::open(&p.remote).unwrap();
    let files = tree_files(&repo, repo.refname_to_id("refs/heads/main").ok()).unwrap();
    let blob = repo.find_blob(files["main.tex"].0).unwrap();
    assert_eq!(
        blob.content(),
        b"one\nTWO\nthree\nfour\n",
        "an edit goes up as LF"
    );
}

#[test]
fn spectrum_leaves_a_busy_or_unusual_repository_alone() {
    let p = pair(&[("a.tex", b"a")]);
    assert_eq!(crate::repo::refusal(&p.a), None);
    fs::write(p.a.join(".git/index.lock"), "").unwrap();
    assert!(crate::repo::refusal(&p.a).unwrap().contains("index.lock"));
    fs::remove_file(p.a.join(".git/index.lock")).unwrap();
    fs::write(p.a.join(".git/MERGE_HEAD"), "x").unwrap();
    assert!(
        crate::repo::refusal(&p.a)
            .unwrap()
            .contains("merge or rebase")
    );
    fs::remove_file(p.a.join(".git/MERGE_HEAD")).unwrap();
    fs::write(p.a.join(".gitattributes"), "*.pdf filter=lfs").unwrap();
    assert!(crate::repo::refusal(&p.a).unwrap().contains("LFS"));
}
