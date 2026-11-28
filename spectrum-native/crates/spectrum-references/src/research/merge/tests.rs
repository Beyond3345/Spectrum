use super::*;
use crate::dedupe::{BibFile, build_bib_index};

fn r(f: impl FnOnce(&mut ResearchResult)) -> ResearchResult {
    let mut x = ResearchResult::default();
    f(&mut x);
    x
}

fn s(v: &[&str]) -> Vec<String> {
    v.iter().map(|x| (*x).to_owned()).collect()
}

#[test]
fn merges_by_doi_then_arxiv_then_title_and_keeps_the_users_fields() {
    let old = r(|x| {
        x.id = "old".into();
        x.title = "Deep learning".into();
        x.doi = "10.1038/nature14539".into();
        x.year = "2015".into();
        x.decision = "keep".into();
        x.reason = "Key review".into();
        x.sources = s(&["openalex"]);
    });
    let incoming = [
        r(|x| {
            x.title = "Deep Learning".into();
            x.doi = "10.1038/NATURE14539".into();
            x.year = "2015".into();
            x.abstract_text = "A longer abstract than none.".into();
            x.authors = s(&["Yann LeCun", "Yoshua Bengio"]);
            x.citations = Some(5);
            x.sources = s(&["crossref"]);
        }),
        r(|x| {
            x.title = "Deep learning".into();
            x.doi = "10.7551/mitpress/book".into();
            x.year = "2016".into();
            x.sources = s(&["crossref"]);
        }),
        r(|x| {
            x.title = "Deep learning".into();
            x.arxiv = "1234.5678v2".into();
            x.year = "2015".into();
            x.sources = s(&["arxiv"]);
        }),
        r(|x| {
            x.title = "Attention".into();
            x.doi = "10.48550/arXiv.1234.5678".into();
            x.sources = s(&["openalex"]);
        }),
    ];
    let merged = merge_results(&[old], &incoming);
    assert_eq!(merged.len(), 2);
    let m = &merged[0];
    assert_eq!(
        (
            m.id.as_str(),
            m.title.as_str(),
            m.doi.as_str(),
            m.year.as_str()
        ),
        ("old", "Deep learning", "10.1038/nature14539", "2015")
    );
    assert_eq!(
        (m.decision.as_str(), m.reason.as_str(), m.arxiv.as_str()),
        ("keep", "Key review", "1234.5678v2")
    );
    assert_eq!(m.sources, s(&["openalex", "crossref", "arxiv"]));
    assert_eq!(
        (m.abstract_text.as_str(), m.citations),
        ("A longer abstract than none.", Some(5))
    );
    assert_eq!(m.authors, s(&["Yann LeCun", "Yoshua Bengio"]));
    assert_eq!(merged[1].doi, "10.7551/mitpress/book");
    assert_eq!(merged[1].id.len(), 12);
    let again = merge_results(
        &[],
        &[r(|x| {
            x.title = "Deep learning".into();
            x.doi = "10.7551/mitpress/book".into();
        })],
    );
    assert_eq!(
        again[0].id, merged[1].id,
        "the same paper gets the same id on another computer"
    );
}

#[test]
fn a_preprint_joins_its_published_version_but_two_publishers_dont() {
    let rows = [
        r(|x| {
            x.title = "Folding proteins".into();
            x.doi = "10.1101/2021.01.01.1".into();
            x.year = "2021".into();
            x.venue = "bioRxiv".into();
            x.url = "https://www.biorxiv.org/1".into();
            x.preprint = Some(true);
            x.abstract_text = "The preprint’s longer abstract.".into();
        }),
        r(|x| {
            x.title = "Folding proteins".into();
            x.doi = "10.1038/s1".into();
            x.year = "2022".into();
            x.venue = "Nature".into();
            x.preprint = Some(false);
        }),
        r(|x| {
            x.title = "Folding proteins".into();
            x.doi = "10.1016/other".into();
            x.year = "2022".into();
            x.venue = "Cell".into();
            x.preprint = Some(false);
        }),
    ];
    let merged = merge_results(&[], &rows);
    let p = &merged[0];
    assert_eq!(
        (
            p.doi.as_str(),
            p.venue.as_str(),
            p.year.as_str(),
            p.url.as_str(),
            p.preprint,
            p.abstract_text.as_str()
        ),
        (
            "10.1038/s1",
            "Nature",
            "2022",
            "https://www.biorxiv.org/1",
            Some(false),
            "The preprint’s longer abstract."
        )
    );
    assert_eq!(merged[1].doi, "10.1016/other");
    let slow = merge_results(
        &[],
        &[
            r(|x| {
                x.title = "Slow review".into();
                x.arxiv = "2201.00001".into();
                x.year = "2022".into();
                x.preprint = Some(true);
            }),
            r(|x| {
                x.title = "Slow review".into();
                x.doi = "10.1000/slow".into();
                x.year = "2025".into();
                x.preprint = Some(false);
            }),
            r(|x| {
                x.title = "Slow review".into();
                x.doi = "10.1000/later".into();
                x.year = "2029".into();
                x.preprint = Some(false);
            }),
        ],
    );
    assert_eq!(slow.len(), 2);
}

#[test]
fn books_join_by_isbn_and_results_are_marked_in_the_bib() {
    let merged = merge_results(
        &[],
        &[
            r(|x| {
                x.title = "Introduction to Algorithms".into();
                x.isbn = "9780262046305".into();
            }),
            r(|x| {
                x.title = "Introduction to algorithms, fourth edition".into();
                x.isbn = "9780262046305".into();
            }),
        ],
    );
    assert_eq!(merged.len(), 1);
    let index = build_bib_index(&[BibFile {
        file: "references.bib".into(),
        text: "@article{Hopper2025, title = {A preprint on attention}, author = {Hopper, Grace}, year = {2025}, doi = {10.1000/pub}}".into(),
    }]);
    let mut rows = vec![
        r(|x| {
            x.title = "A preprint on attention".into();
            x.authors = s(&["Grace Hopper"]);
            x.year = "2024".into();
            x.arxiv = "2401.00001".into();
            x.preprint = Some(true);
        }),
        r(|x| {
            x.title = "Other".into();
            x.in_bib = "Gone2020".into();
        }),
    ];
    mark_in_bib(&mut rows, &index);
    assert_eq!(
        rows[0].in_bib, "Hopper2025",
        "a preprint is In .bib under its published version"
    );
    assert_eq!(rows[1].in_bib, "", "a key taken out since is unmarked");
}
