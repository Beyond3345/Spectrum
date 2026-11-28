use serde_json::json;

use super::*;
use crate::bibtex::parsed_whole;
use crate::zotero::new_item::item_from_entry;

#[test]
fn citation_keys_come_out_of_a_pickers_citation() {
    assert_eq!(cite_keys("\\parencite[p.~3]{a, b}"), ["a", "b"]);
    assert_eq!(cite_keys("\\parencites[see][4]{a}[5]{b}"), ["a", "b"]);
    assert!(cite_keys("").is_empty());
}

#[test]
fn an_export_keeps_its_first_entry_without_file_paths() {
    let text = "@comment{x}\n@article{k,\n  title = {T {A}},\n  file = {/Users/a/b.pdf:application/pdf},\n  year = {2020}\n}\n@book{other, title={B}}";
    assert_eq!(
        clean_entry(text),
        "@article{k,\n  title = {T {A}},\n  year = {2020}\n}"
    );
    assert_eq!(
        clean_entry("@article{k,\n  file = {a{b}c}\n}"),
        "@article{k\n}"
    );
    assert!(parsed_whole(
        "@article{a, title={x}}\n@string{s = {y}}\n@book{b, title={z}}"
    ));
    assert!(!parsed_whole("@article{a, title={x}\n"));
    assert!(!parsed_whole("@article{a, title={x}}\n@article{"));
}

#[test]
fn a_bib_entry_becomes_an_item_of_the_right_type() {
    let entries = parse_bib_entries(
        &[
            "@article{vaswani2017, author = {Vaswani, Ashish and Noam Shazeer and {Google Brain}}, title = {Attention Is {All} You Need}, journal = {NeurIPS}, volume = {30}, number = {2}, pages = {5998--6008}, year = {2017}, doi = {10.5555/x}}",
            "@misc{bert, author = {Devlin, Jacob}, title = {BERT}, eprint = {1810.04805}, archivePrefix = {arXiv}, year = {2018}}",
            "@book{knuth, editor = {Knuth, Donald}, title = {The \\TeX book}, publisher = {Addison-Wesley}, address = {Reading}, year = {1984}, doi = {10.1/b}}",
            "@mastersthesis{t, author = {Doe, Jane}, title = {On Things}, school = {ANU}, year = {2020}}",
            "@misc{m, title = {Something}, howpublished = {Online}}",
        ]
        .join("\n"),
    );
    assert_eq!(
        item_from_entry(&entries[0]),
        json!({
            "itemType": "journalArticle",
            "title": "Attention Is All You Need",
            "creators": [
                {"creatorType": "author", "lastName": "Vaswani", "firstName": "Ashish"},
                {"creatorType": "author", "lastName": "Shazeer", "firstName": "Noam"},
                {"creatorType": "author", "name": "Google Brain"}
            ],
            "date": "2017",
            "citationKey": "vaswani2017",
            "publicationTitle": "NeurIPS",
            "volume": "30",
            "issue": "2",
            "pages": "5998-6008",
            "DOI": "10.5555/x"
        })
    );
    let p = item_from_entry(&entries[1]);
    assert_eq!(
        (
            p["itemType"].as_str(),
            p["archiveID"].as_str(),
            p["repository"].as_str()
        ),
        (Some("preprint"), Some("arXiv:1810.04805"), Some("arXiv"))
    );
    let b = item_from_entry(&entries[2]);
    assert_eq!(
        (
            b["itemType"].as_str(),
            b["creators"][0]["creatorType"].as_str(),
            b["publisher"].as_str(),
            b["place"].as_str()
        ),
        (
            Some("book"),
            Some("editor"),
            Some("Addison-Wesley"),
            Some("Reading")
        )
    );
    assert_eq!(
        (b.get("DOI"), b["extra"].as_str()),
        (None, Some("DOI: 10.1/b"))
    );
    let t = item_from_entry(&entries[3]);
    assert_eq!(
        (
            t["itemType"].as_str(),
            t["university"].as_str(),
            t["thesisType"].as_str()
        ),
        (Some("thesis"), Some("ANU"), Some("Master’s thesis"))
    );
    let m = item_from_entry(&entries[4]);
    assert_eq!(
        (m["itemType"].as_str(), m.get("publisher")),
        (Some("document"), None)
    );
}

#[test]
fn two_references_are_the_same_by_key_doi_arxiv_or_title_and_year() {
    let r = |f: &dyn Fn(&mut ZoteroRef)| {
        let mut x = ZoteroRef {
            title: "deep learning".into(),
            year: "2015".into(),
            ..ZoteroRef::default()
        };
        f(&mut x);
        x
    };
    assert!(same_ref(
        &r(&|x| x.key = "LeCun2015".into()),
        &r(&|x| {
            x.key = "lecun2015".into();
            x.title = "x".into();
        })
    ));
    assert!(same_ref(
        &r(&|x| x.doi = "10.1/a".into()),
        &r(&|x| {
            x.doi = "10.1/a".into();
            x.title = "x".into();
        })
    ));
    assert!(same_ref(&r(&|_| {}), &r(&|_| {})));
    assert!(!same_ref(
        &r(&|x| x.doi = "10.1/a".into()),
        &r(&|x| x.doi = "10.1/b".into())
    ));
    assert!(!same_ref(&r(&|_| {}), &r(&|x| x.year = "2016".into())));
}
