//! 2.8's merge-rules tests, ported.
#![allow(clippy::needless_pass_by_value)]

use super::*;
use chrono::TimeZone;

fn obj(v: Value) -> Map<String, Value> {
    v.as_object().cloned().unwrap()
}

#[test]
fn a_file_takes_the_side_that_changed_it() {
    use Pick::*;
    assert_eq!(decide(None, None, None), Drop);
    assert_eq!(decide(Some("a"), Some("b"), Some("b")), Equal);
    assert_eq!(
        [
            decide(None, Some("a"), None),
            decide(None, None, Some("a")),
            decide(None, Some("a"), Some("b"))
        ],
        [Ours, Theirs, Merge]
    );
    assert_eq!(
        [
            decide(Some("a"), Some("b"), Some("a")),
            decide(Some("a"), Some("a"), Some("b")),
            decide(Some("a"), Some("b"), Some("c"))
        ],
        [Ours, Theirs, Merge]
    );
    assert_eq!(
        [
            decide(Some("a"), None, Some("a")),
            decide(Some("a"), None, Some("b"))
        ],
        [Ours, Theirs]
    );
    assert_eq!(
        [
            decide(Some("a"), Some("a"), None),
            decide(Some("a"), Some("b"), None)
        ],
        [Theirs, Ours]
    );
}

#[test]
fn meta_merges_key_by_key_one_level_deep_and_keeps_our_id() {
    let base = obj(
        json!({ "id": "p1", "name": "Thesis", "tags": ["a"], "compile": { "engine": "pdflatex", "autoCompile": 0 }, "zotero": { "collectionKey": "K1" } }),
    );
    let ours = obj(
        json!({ "id": "p1", "name": "Thesis", "tags": ["a", "mine"], "compile": { "engine": "xelatex", "autoCompile": 0 }, "zotero": { "collectionKey": "K1" } }),
    );
    let theirs = obj(
        json!({ "id": "other", "name": "PhD thesis", "tags": ["a"], "compile": { "engine": "pdflatex", "autoCompile": 2 }, "github": { "owner": "o", "repo": "r" } }),
    );
    assert_eq!(
        Value::Object(merge_meta(Some(&base), &ours, &theirs, 0)),
        json!({ "id": "p1", "name": "PhD thesis", "tags": ["a", "mine"], "compile": { "engine": "xelatex", "autoCompile": 2 }, "github": { "owner": "o", "repo": "r" } })
    );
    assert_eq!(
        Value::Object(merge_meta(
            Some(&Map::new()),
            &obj(json!({ "skills": { "on": ["x"] } })),
            &obj(json!({ "skills": { "on": ["y"], "off": ["z"] } })),
            0
        )),
        json!({ "skills": { "on": ["x"], "off": ["z"] } })
    );
    assert_eq!(
        Value::Object(merge_meta(
            Some(&obj(json!({ "a": { "b": { "c": 1, "d": 1 } } }))),
            &obj(json!({ "a": { "b": { "c": 2, "d": 1 } } })),
            &obj(json!({ "a": { "b": { "c": 1, "d": 2 } } })),
            0
        )),
        json!({ "a": { "b": { "c": 2, "d": 1 } } })
    );
    let ignored = obj(json!({ "languageToolIgnored": { "de:A": true } }));
    assert_eq!(
        Value::Object(merge_meta(
            Some(&ignored),
            &obj(json!({ "languageToolIgnored": {} })),
            &ignored,
            0
        )),
        json!({ "languageToolIgnored": {} })
    );
    let todo = json!({ "id": "t", "text": "Fix", "done": false });
    let mut noted = todo.clone();
    noted["note"] = json!("See p. 3");
    let mut done = todo.clone();
    done["done"] = json!(true);
    let mut want = noted.clone();
    want["done"] = json!(true);
    assert_eq!(
        Value::Object(merge_meta(
            Some(&obj(todo.clone())),
            &obj(noted),
            &obj(done),
            0
        )),
        want
    );
}

#[test]
fn a_chat_keeps_every_message_from_both_sides() {
    let m =
        |content: &str, at: &str| json!({ "role": "user", "content": content, "createdAt": at });
    let theirs = json!({ "id": "c1", "messages": [m("hi", "1"), m("there", "2")], "updatedAt": "2026-10-01T00:00:00.000Z" });
    let ours = json!({ "id": "c1", "messages": [m("hi", "1"), m("here", "3")], "updatedAt": "2026-10-01T00:00:00.000Z" });
    let (data, more) =
        merge_chat_files(ours.to_string().as_bytes(), theirs.to_string().as_bytes()).unwrap();
    let merged: Value = serde_json::from_slice(&data).unwrap();
    let contents: Vec<&str> = merged["messages"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x["content"].as_str().unwrap())
        .collect();
    assert_eq!(contents, ["hi", "there", "here"]);
    assert!(more);
    assert!(
        !merge_chat_files(theirs.to_string().as_bytes(), theirs.to_string().as_bytes())
            .unwrap()
            .1
    );
    assert!(
        merge_chat_files(
            br#"{"id":"c1","messages":[]}"#,
            br#"{"id":"c2","messages":[]}"#
        )
        .is_none()
    );
    assert!(merge_chat_files(b"not json", theirs.to_string().as_bytes()).is_none());
}

#[test]
fn a_conflicted_copy_is_named_so_the_banner_finds_it() {
    let at = chrono::Local
        .with_ymd_and_hms(2026, 10, 18, 10, 42, 33)
        .unwrap();
    let copy = conflict_copy_path("chapters/intro.tex", "GitHub", at);
    assert_eq!(
        copy,
        "chapters/intro (GitHub’s conflicted copy 2026-10-18 104233).tex"
    );
    assert_eq!(
        conflict_copy_path("Makefile", "A/B: C", at),
        "Makefile (AB C’s conflicted copy 2026-10-18 104233)"
    );
    let found =
        spectrum_core::project::conflict_copies(&["chapters/intro.tex".into(), copy.clone()], &[]);
    assert_eq!(
        found.get(&copy).map(String::as_str),
        Some("chapters/intro.tex")
    );
}

#[test]
fn a_path_respelt_on_one_side_is_one_file_with_that_sides_spelling() {
    let s = |v: &[&str]| v.iter().map(|x| (*x).to_owned()).collect::<Vec<_>>();
    let (files, clashes) = respell_keys(
        &s(&["Intro.tex", "fig/A.pdf", "same.tex"]),
        &s(&["Intro.tex", "Fig/A.pdf", "same.tex"]),
        &s(&["intro.tex", "fig/A.pdf", "Cafe\u{301}.tex"]),
    );
    let get = |k: &str| {
        files
            .iter()
            .find(|(key, _)| key == k)
            .map(|(_, e)| e.clone())
            .unwrap()
    };
    assert_eq!(get("intro.tex").rel, "intro.tex");
    assert_eq!(get("fig/a.pdf").rel, "Fig/A.pdf");
    assert_eq!(get("café.tex").rel, "Cafe\u{301}.tex");
    let one =
        |b: &[&str], o: &[&str], t: &[&str]| respell_keys(&s(b), &s(o), &s(t)).0[0].1.rel.clone();
    assert_eq!(one(&[], &["Cafe\u{301}.tex"], &["Café.tex"]), "Café.tex");
    assert_eq!(
        one(&["Cafe\u{301}.tex"], &["Cafe\u{301}.tex"], &["Café.tex"]),
        "Café.tex"
    );
    assert_eq!(one(&[], &["A.tex"], &["a.tex"]), "A.tex");
    assert_eq!(
        clashes,
        [] as [(std::string::String, std::string::String); 0]
    );
    assert_eq!(
        respell_keys(&[], &s(&["a.tex", "A.tex"]), &[]).1,
        [("a.tex".to_owned(), "A.tex".to_owned())]
    );
}

#[test]
fn a_bib_both_sides_added_to_keeps_both() {
    let b = "@article{a,\n  title = {A}\n}\n";
    let ours = format!("{b}\n@article{{mine,\n  title = {{Mine}}\n}}\n");
    let theirs = format!(
        "{b}\n@article{{new1,\n  title = {{New 1}}\n}}\n\n@article{{new2,\n  title = {{New 2}}\n}}\n"
    );
    let merged = merge_bib_files(b.as_bytes(), ours.as_bytes(), theirs.as_bytes()).unwrap();
    assert_eq!(
        String::from_utf8(merged).unwrap(),
        format!(
            "{ours}\n@article{{new1,\n  title = {{New 1}}\n}}\n\n@article{{new2,\n  title = {{New 2}}\n}}\n"
        )
    );
    assert!(merge_bib_files(b.as_bytes(), ours.as_bytes(), ours.as_bytes()).is_none());
    assert!(
        merge_bib_files(
            b.as_bytes(),
            b"@article{a,\n  title = {A, ours}\n}\n",
            b"@article{a,\n  title = {A, theirs}\n}\n@article{n,\n  title = {N}\n}\n"
        )
        .is_none()
    );
}

#[test]
fn deleting_many_files_at_once_needs_asking() {
    let files = |n: usize, dir: &str| (0..n).map(|i| format!("{dir}f{i}.tex")).collect::<Vec<_>>();
    assert_eq!(deletion_brake(&files(5, ""), &files(5, "")), 0);
    assert_eq!(deletion_brake(&files(6, ""), &files(20, "")), 6);
    assert_eq!(deletion_brake(&files(6, ""), &files(30, "")), 0);
    let mut all = files(10, "");
    all.extend(files(100, ".spectrum/history/"));
    assert_eq!(deletion_brake(&files(6, ""), &all), 6);
}

#[test]
fn a_file_is_written_only_while_it_holds_what_was_checked() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    assert!(place_if_unchanged(root, "a/b/new.tex", b"one", None).unwrap());
    assert_eq!(fs::read(root.join("a/b/new.tex")).unwrap(), b"one");
    assert!(!place_if_unchanged(root, "a/b/new.tex", b"two", None).unwrap());
    assert!(!place_if_unchanged(root, "a/b/new.tex", b"two", Some(&sha256_hex(b"other"))).unwrap());
    assert!(place_if_unchanged(root, "a/b/new.tex", b"two", Some(&sha256_hex(b"one"))).unwrap());
    assert_eq!(
        fs::read_dir(root.join("a/b")).unwrap().count(),
        1,
        "no temp file left"
    );
    assert!(place_if_unchanged(&root.join("gone"), "x/y.tex", b"z", None).is_err());
}
