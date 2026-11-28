//! The lossless `.bib` reader on a varied real-world file: every byte comes back, every slice of it too, and
//! edits touch only what they change.

#![allow(clippy::pedantic)]
#![allow(clippy::unwrap_used)]

use spectrum_references::{Bibliography, Item, parse_bib_entries};

const VARIED: &str = include_str!("fixtures/varied.bib");

#[test]
fn unchanged_input_comes_back_byte_for_byte() {
    for text in [
        VARIED.to_owned(),
        VARIED.replace('\n', "\r\n"),
        String::new(),
        "\u{feff}@misc{a, title={x}}".to_owned(),
    ] {
        assert_eq!(Bibliography::parse(&text).to_string(), text);
    }
}

#[test]
fn every_prefix_and_suffix_round_trips() {
    // a file cut anywhere (a half-typed entry, a save mid-edit) still comes back as it was
    let cuts: Vec<usize> = VARIED.char_indices().map(|(i, _)| i).step_by(7).collect();
    for &i in &cuts {
        assert_eq!(
            Bibliography::parse(&VARIED[..i]).to_string(),
            &VARIED[..i],
            "prefix {i}"
        );
        assert_eq!(
            Bibliography::parse(&VARIED[i..]).to_string(),
            &VARIED[i..],
            "suffix {i}"
        );
    }
}

#[test]
fn reads_entries_strings_and_specials() {
    let bib = Bibliography::parse(VARIED);
    let keys: Vec<&str> = bib.entries().map(|e| e.key.as_str()).collect();
    assert_eq!(
        keys,
        [
            "LeCun2015",
            "vaswani2017attention",
            "he2015deep",
            "Knuth:TAOCP:1",
            "Schroedinger1926",
            "chen_2019",
            "who2020covid",
            "after_broken",
            "spaced_key",
            "empty_fields",
            "note-only"
        ]
    );
    let specials = bib
        .items
        .iter()
        .filter(|i| matches!(i, Item::Special { .. }))
        .count();
    assert_eq!(specials, 3, "a preamble and two comments");
    let strings = bib.strings();
    assert_eq!(strings[1], ("acm".to_owned(), "ACM Press".to_owned()));
    let knuth = bib.entries().find(|e| e.key == "Knuth:TAOCP:1").unwrap();
    assert_eq!(
        knuth.field("publisher").unwrap().value(&strings),
        "ACM Press and Addison-Wesley"
    );
    assert_eq!(knuth.field("month").unwrap().value(&strings), "jan");
    let vaswani = bib
        .entries()
        .find(|e| e.key == "vaswani2017attention")
        .unwrap();
    assert_eq!(
        vaswani.field("booktitle").unwrap().value(&strings),
        "Advances in Neural Information Processing Systems"
    );
    let chen = bib.entries().find(|e| e.key == "chen_2019").unwrap();
    assert_eq!(
        chen.field("note").unwrap().value(&strings),
        "Percent inside braces: 100% kept, \"quotes\" too"
    );
    // the broken entry stays in the file as text, nothing lost
    assert!(
        bib.items
            .iter()
            .any(|i| matches!(i, Item::Text(t) if t.contains("@techreport{broken2021")))
    );
}

#[test]
fn an_edit_changes_only_its_field() {
    let mut bib = Bibliography::parse(VARIED);
    let e = bib
        .entries_mut()
        .find(|e| e.key == "Schroedinger1926")
        .unwrap();
    e.set("doi", "10.1002/andp.19263840404");
    e.set("year", "1926a");
    let edited = bib.to_string();
    let before: Vec<&str> = VARIED.lines().collect();
    let after: Vec<&str> = edited.lines().collect();
    let changed: Vec<(&str, &str)> = before
        .iter()
        .zip(&after)
        .filter(|(a, b)| a != b)
        .map(|(a, b)| (*a, *b))
        .collect();
    assert_eq!(changed[0], ("YEAR = \"1926\"}", "YEAR = {1926a},"));
    assert_eq!(after.len(), before.len() + 1);
    assert!(
        edited.contains("YEAR = {1926a},\ndoi = {10.1002/andp.19263840404}}"),
        "{edited}"
    );
}

#[test]
fn the_lenient_reader_finds_what_2_8_found() {
    let entries = parse_bib_entries(VARIED);
    let keys: Vec<&str> = entries.iter().map(|e| e.key.as_str()).collect();
    // 2.8's reader reads the broken entry too, and has no key for "spaced_key" with spaces before the comma
    assert!(keys.contains(&"broken2021") && keys.contains(&"after_broken"));
    let he = entries.iter().find(|e| e.key == "he2015deep").unwrap();
    assert_eq!(he.get("eprint"), "1512.03385");
    assert_eq!(
        he.get("title"),
        "Deep Residual Learning for Image Recognition"
    );
}

#[test]
fn appending_keeps_the_file_and_its_line_endings() {
    let mut bib = Bibliography::parse("@misc{a, title = {A}}\r\n");
    bib.push("@misc{b,\n  title = {B},\n}");
    assert_eq!(
        bib.to_string(),
        "@misc{a, title = {A}}\r\n\r\n@misc{b,\r\n  title = {B},\r\n}\r\n"
    );
    let mut empty = Bibliography::parse("");
    empty.push("@misc{c,\n  title = {C},\n}");
    assert_eq!(empty.to_string(), "@misc{c,\n  title = {C},\n}\n");
}
