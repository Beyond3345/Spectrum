//! SyncTeX against 2.8. The fixtures are real pdfLaTeX and Tectonic output for
//! tests/fixtures/synctex/main.tex (the build folder renamed /project); the expected lookups are
//! what 2.8's synctex.js answered for the same files, for every line and a grid of points.
#![allow(clippy::unwrap_used, reason = "test helpers outside #[test] functions")]

use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde_json::Value;
use spectrum_compile::{EditHit, SyncBox, Synctex, SynctexError, SynctexStore};

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/synctex")
}

fn expected(engine: &str) -> Value {
    let gz = std::fs::read(fixtures().join(format!("{engine}.expected.json.gz"))).unwrap();
    let mut text = String::new();
    flate2::read::GzDecoder::new(gz.as_slice())
        .read_to_string(&mut text)
        .unwrap();
    serde_json::from_str(&text).unwrap()
}

fn close(a: f64, b: &Value) -> bool {
    (a - b.as_f64().unwrap()).abs() < 1e-9
}

fn same_boxes(got: &[SyncBox], want: &Value) -> bool {
    let want = want.as_array().unwrap();
    got.len() == want.len()
        && got.iter().zip(want).all(|(g, w)| {
            g.page == w["page"].as_i64().unwrap()
                && close(g.x, &w["x"])
                && close(g.y, &w["y"])
                && close(g.width, &w["width"])
                && close(g.height, &w["height"])
        })
}

fn agrees_with_2_8(engine: &str) {
    let data = Synctex::read(&fixtures().join(format!("{engine}.synctex.gz")), None).unwrap();
    let want = expected(engine);
    let mut found = 0;
    for case in want["forward"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let line = case["line"].as_i64().unwrap();
        let tags: HashSet<i64> = data
            .inputs()
            .filter(|(_, n)| *n == name)
            .map(|(t, _)| t)
            .collect();
        let got = data.forward(&tags, line);
        assert!(
            same_boxes(&got, &case["boxes"]),
            "{engine} forward {name}:{line}: {got:?} vs {}",
            case["boxes"]
        );
        found += usize::from(!got.is_empty());
    }
    assert!(
        found > 40,
        "{engine}: forward found boxes for {found} lines"
    );
    let mut hits = 0;
    for case in want["inverse"].as_array().unwrap() {
        let [page, x, y, hit] = case.as_array().unwrap().as_slice() else {
            panic!("{case}")
        };
        let got = data.inverse(
            page.as_i64().unwrap(),
            x.as_f64().unwrap(),
            y.as_f64().unwrap(),
        );
        let got = got.map(|h| serde_json::json!([h.tag, h.line, h.column]));
        assert_eq!(
            got.as_ref().unwrap_or(&Value::Null),
            hit,
            "{engine} inverse {case}"
        );
        hits += usize::from(got.is_some());
    }
    assert!(hits > 1000, "{engine}: {hits} points hit");
}

#[test]
fn pdflatex_agrees_with_2_8() {
    agrees_with_2_8("pdflatex");
}

#[test]
fn tectonic_agrees_with_2_8() {
    agrees_with_2_8("tectonic");
}

fn gzip(text: &[u8]) -> Vec<u8> {
    let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    gz.write_all(text).unwrap();
    gz.finish().unwrap()
}

/// A project with the fixture's sources, its root canonical so paths compare as the disk spells them.
fn project() -> (tempfile::TempDir, PathBuf) {
    let tmp = tempfile::tempdir().unwrap();
    let root = std::fs::canonicalize(tmp.path()).unwrap().join("project");
    std::fs::create_dir_all(root.join("chapters")).unwrap();
    std::fs::copy(fixtures().join("main.tex"), root.join("main.tex")).unwrap();
    std::fs::copy(
        fixtures().join("chapters/two.tex"),
        root.join("chapters/two.tex"),
    )
    .unwrap();
    (tmp, root)
}

#[test]
fn store_keeps_and_reads_through_the_copy_folder() {
    let (tmp, root) = project();
    let cache = tmp.path().join("cache/synctex");
    let store = SynctexStore::new(root.clone(), cache.clone(), None);
    assert!(matches!(
        store.view("main.tex", "main.tex", 5),
        Err(SynctexError::NotCompiled)
    ));

    // the fixture's inputs live under /project: say it was auto mode's copy of this project
    let built = tmp.path().join("main.synctex.gz");
    std::fs::copy(fixtures().join("pdflatex.synctex.gz"), &built).unwrap();
    store
        .keep(
            "main.tex",
            &built,
            Path::new("/project"),
            Some(Path::new("/project")),
        )
        .unwrap();
    assert!(!built.exists());
    assert!(cache.join("main.tex.gz").exists());
    let meta: Value =
        serde_json::from_str(&std::fs::read_to_string(cache.join("main.tex.json")).unwrap())
            .unwrap();
    assert_eq!(meta["root"], root.to_string_lossy().as_ref());
    assert_eq!(meta["cwd"], "/project");
    assert_eq!(meta["copy"], "/project");

    let want = expected("pdflatex");
    let case = |name: &str, line: i64| {
        want["forward"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["name"] == name && c["line"] == line)
            .unwrap()["boxes"]
            .clone()
    };
    let boxes = store.view("main.tex", "chapters/two.tex", 2).unwrap();
    assert!(same_boxes(&boxes, &case("/project/./chapters/two.tex", 2)));
    assert!(
        boxes.len() >= 2,
        "a wrapped source line makes a box per typeset line"
    );
    assert!(same_boxes(
        &store.view("main.tex", "./main.tex", 25).unwrap(),
        &case("/project/./main.tex", 25)
    ));

    // a point that 2.8 sent to a project file
    let point = want["inverse"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c[3].is_array() && c[3][0] == 9)
        .unwrap();
    let hit = store
        .edit(
            "main.tex",
            point[0].as_i64().unwrap(),
            point[1].as_f64().unwrap(),
            point[2].as_f64().unwrap(),
        )
        .unwrap();
    assert_eq!(
        hit,
        EditHit {
            file: "chapters/two.tex".into(),
            line: point[3][1].as_i64().unwrap(),
            column: None
        }
    );

    assert!(matches!(
        store.view("main.tex", "other.tex", 1),
        Err(SynctexError::NotInPdf)
    ));
    assert!(matches!(
        store.view("main.tex", "../outside.tex", 1),
        Err(SynctexError::OutsideProject)
    ));
    assert!(matches!(
        store.edit("main.tex", 99, 10.0, 10.0),
        Err(SynctexError::NoSource)
    ));
    assert!(matches!(
        store.view("chapters/two.tex", "main.tex", 1),
        Err(SynctexError::NotCompiled)
    ));

    // a compile that wrote no SyncTeX file leaves none behind
    store
        .keep("main.tex", &tmp.path().join("none.synctex.gz"), &root, None)
        .unwrap();
    assert!(!cache.join("main.tex.gz").exists() && !cache.join("main.tex.json").exists());
    assert!(matches!(
        store.view("main.tex", "main.tex", 5),
        Err(SynctexError::NotCompiled)
    ));
}

#[test]
fn garbled_file_reads_as_not_compiled() {
    let (tmp, root) = project();
    let cache = tmp.path().join("synctex");
    let store = SynctexStore::new(root.clone(), cache.clone(), None);
    let built = tmp.path().join("x.gz");
    std::fs::write(&built, b"not gzip at all").unwrap();
    store.keep("main.tex", &built, &root, None).unwrap();
    assert!(matches!(
        store.view("main.tex", "main.tex", 1),
        Err(SynctexError::NotCompiled)
    ));
}

/// A hand-written file: an input in the app's own folder is never a source, a repeated `v`
/// (`=`) and a GBK path decoded with the Windows code page.
#[test]
fn hand_written_file() {
    let (tmp, root) = project();
    let mut text = Vec::new();
    text.extend_from_slice(b"SyncTeX Version:1\nInput:1:");
    text.extend_from_slice(root.join("main.tex").to_string_lossy().as_bytes());
    text.extend_from_slice(b"\nInput:2:");
    text.extend_from_slice(
        root.join(".spectrum/build/gen.tex")
            .to_string_lossy()
            .as_bytes(),
    );
    text.extend_from_slice(b"\nInput:3:/elsewhere/\xD6\xD0.tex\n");
    text.extend_from_slice(
        b"Output:pdf\nMagnification:1000\nUnit:1\nX Offset:0\nY Offset:0\nContent:\n{1\n\
[1,1:0,0:6578176,6578176,0\n\
(1,3:657817,657817:3289088,657817,0\nx1,3:657817,657817\ng1,3:1315635,=\n)\n\
(2,5:657817,1973453:3289088,657817,0\nx2,5:657817,1973453\n)\n]\n}\nPostamble:\n",
    );
    let built = tmp.path().join("hand.synctex.gz");
    std::fs::write(&built, gzip(&text)).unwrap();
    let data = Synctex::read(&built, Some(936)).unwrap();
    assert_eq!(data.input(3), Some("/elsewhere/中.tex"));

    let store = SynctexStore::new(root.clone(), tmp.path().join("synctex"), Some(936));
    store.keep("main.tex", &built, &root, None).unwrap();
    let hit = store.edit("main.tex", 1, 20.0, 5.0).unwrap();
    assert_eq!(
        hit,
        EditHit {
            file: "main.tex".into(),
            line: 3,
            column: None
        }
    );
    assert!(matches!(
        store.edit("main.tex", 1, 20.0, 25.0),
        Err(SynctexError::NoSource)
    ));
    let boxes = store.view("main.tex", "main.tex", 3).unwrap();
    assert_eq!(boxes.len(), 1);
    let b = boxes[0];
    assert_eq!(b.page, 1);
    assert!((b.x - 10.0).abs() < 1e-3 && b.y.abs() < 1e-3, "{b:?}");
    assert!(
        (b.width - 50.0).abs() < 1e-3 && (b.height - 10.0).abs() < 1e-3,
        "{b:?}"
    );
}
