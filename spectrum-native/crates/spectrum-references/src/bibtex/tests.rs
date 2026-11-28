use super::*;

const EXISTING_BIB: &str = r#"% my refs
@string{jt = "Journal of Tests"}
@Article{Smith2020,
  author = {Smith, Jane},
  title = {{Deep} Learning for \&-Things},
  journal = jt,
  year = 2020,
  doi = {10.9999/EXISTING}
}

@misc{Vaswani2017,
  title = "Attention Is {All} You Need",
  author = "Vaswani, Ashish",
  eprint = {1706.03762v5},
  archivePrefix = {arXiv},
  year = {2017}
}
@inproceedings{Lee2019, title={Schr{\"o}dinger's Widgets}, year={2019}, note={arXiv:1901.00001}}"#;

#[test]
fn parses_existing_bib_files_leniently() {
    let entries = parse_bib_entries(EXISTING_BIB);
    let keys: Vec<_> = entries.iter().map(|e| e.key.as_str()).collect();
    assert_eq!(keys, ["Smith2020", "Vaswani2017", "Lee2019"]);
    assert_eq!(entries[0].get("year"), "2020");
    assert_eq!(entries[0].get("journal"), "jt");
    assert_eq!(entries[1].get("title"), "Attention Is {All} You Need");
    assert_eq!(entries[2].get("title"), "Schr{\\\"o}dinger's Widgets");
}

#[test]
fn round_trips_and_reads_strings() {
    let bib = Bibliography::parse(EXISTING_BIB);
    assert_eq!(bib.to_string(), EXISTING_BIB);
    assert_eq!(bib.entries().count(), 3);
    let strings = bib.strings();
    let smith = bib.entries().next().unwrap();
    assert_eq!(
        smith.field("JOURNAL").unwrap().value(&strings),
        "Journal of Tests"
    );
    assert_eq!(smith.field("year").unwrap().value(&strings), "2020");
}

#[test]
fn edits_change_only_their_field() {
    let mut bib = Bibliography::parse(EXISTING_BIB);
    let e = bib.entries_mut().nth(1).unwrap();
    e.set("year", "2018");
    e.set("doi", "10.1/x");
    e.remove("eprint");
    let text = bib.to_string();
    assert!(
        text.contains("  year = {2018},\n  doi = {10.1/x}\n}"),
        "{text}"
    );
    assert!(!text.contains("eprint"));
    assert!(text.starts_with("% my refs\n@string{jt = \"Journal of Tests\"}\n@Article{Smith2020,"));
}

#[test]
fn broken_text_stays_text() {
    for text in [
        "@article{x, title = {open",
        "email@example.com",
        "@ { }",
        "@misc(k, a = \"b\")\n@comment{ x { y } }",
    ] {
        assert_eq!(Bibliography::parse(text).to_string(), text);
    }
    assert_eq!(
        Bibliography::parse("@misc(k, a = \"b\")")
            .entries()
            .next()
            .unwrap()
            .key,
        "k"
    );
}

#[test]
fn parsed_whole_spots_half_written_files() {
    assert!(parsed_whole(EXISTING_BIB));
    assert!(!parsed_whole(
        "@article{a, title = {x}\n@article{b, title = {y"
    ));
    assert!(!parsed_whole("@article{, title = {x}}"));
}
