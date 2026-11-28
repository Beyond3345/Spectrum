use serde_json::json;

use super::*;

fn fixture(name: &str) -> Value {
    let path = format!(
        "{}/tests/fixtures/research/{name}",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn reads_europe_pmc() {
    let found = parse_europe_pmc(&fixture("europepmc.json"));
    assert_eq!(found[0].title, "Attention in Drosophila");
    assert_eq!(found[0].authors, ["Marie Curie", "Fly Consortium"]);
    assert_eq!(
        (
            found[0].venue.as_str(),
            found[0].citations,
            found[0].preprint
        ),
        ("Journal of Attention", Some(7), Some(false))
    );
    assert_eq!(
        found[0].open_access,
        "https://europepmc.org/articles/PMC8000001"
    );
    assert_eq!(found[0].url, "https://europepmc.org/article/MED/34567890");
    assert_eq!(
        (
            found[1].preprint,
            found[1].venue.as_str(),
            found[1].authors[0].as_str()
        ),
        (Some(true), "bioRxiv", "Hopper G")
    );
    assert_eq!(found[1].url, "https://europepmc.org/article/PPR/PPR123456");
}

#[test]
fn reads_inspire() {
    let found = parse_inspire(&fixture("inspire.json"));
    assert_eq!(found[0].authors, ["Georges Aad", "Tatevik Abajyan"]);
    assert_eq!(
        (
            found[0].arxiv.as_str(),
            found[0].doi.as_str(),
            found[0].year.as_str()
        ),
        ("1207.7214", "10.1016/j.physletb.2012.08.020", "2012")
    );
    assert_eq!(
        (
            found[0].venue.as_str(),
            found[0].citations,
            found[0].preprint
        ),
        ("Phys.Lett.B 716", Some(12000), Some(false))
    );
    assert_eq!(found[0].url, "https://inspirehep.net/literature/1124337");
    assert_eq!(
        (found[1].year.as_str(), found[1].preprint),
        ("2024", Some(true))
    );
}

#[test]
fn reads_doaj_eric_hal_datacite_and_open_library() {
    let doaj = parse_doaj(
        &json!({"results": [{"bibjson": {"title": "Open widgets", "author": [{"name": "Ada Lovelace"}], "year": "2020", "journal": {"title": "J. Open"}, "identifier": [{"type": "eissn", "id": "1234-5678"}, {"type": "DOI", "id": "10.1/open"}], "link": [{"type": "fulltext", "url": "https://j.test/1"}]}}]}),
    );
    assert_eq!(
        (
            doaj[0].doi.as_str(),
            doaj[0].open_access.as_str(),
            doaj[0].venue.as_str()
        ),
        ("10.1/open", "https://j.test/1", "J. Open")
    );
    let eric = parse_eric(
        &json!({"response": {"docs": [{"id": "EJ1234", "title": "Teaching widgets", "author": ["Doe, Jane"], "publicationdateyear": 2019, "source": "J. Ed.", "e_fulltextauth": 1}]}}),
    );
    assert_eq!(
        (eric[0].authors[0].as_str(), eric[0].year.as_str()),
        ("Jane Doe", "2019")
    );
    assert_eq!(
        eric[0].open_access,
        "https://files.eric.ed.gov/fulltext/EJ1234.pdf"
    );
    let hal = parse_hal(
        &json!({"response": {"docs": [{"title_s": ["Une thèse"], "authFullName_s": ["Marie Curie"], "producedDateY_i": 1903, "uri_s": "https://hal.science/tel-1", "docType_s": "THESE", "doiId_s": "10.1/these"}]}}),
    );
    assert_eq!(
        (hal[0].title.as_str(), hal[0].year.as_str(), hal[0].preprint),
        ("Une thèse", "1903", Some(false))
    );
    let dc = parse_datacite(
        &json!({"data": [{"attributes": {"doi": "10.5281/zenodo.123", "titles": [{"title": "Widget dataset"}], "creators": [{"name": "Lovelace, Ada"}], "publicationYear": 2022, "publisher": "Zenodo", "types": {"resourceTypeGeneral": "Dataset"}}}]}),
    );
    assert_eq!(
        (
            dc[0].authors[0].as_str(),
            dc[0].venue.as_str(),
            dc[0].url.as_str()
        ),
        (
            "Ada Lovelace",
            "Zenodo",
            "https://doi.org/10.5281/zenodo.123"
        )
    );
    let ol = parse_open_library(
        &json!({"docs": [{"key": "/works/OL1W", "title": "Introduction to Algorithms", "author_name": ["Thomas H. Cormen"], "first_publish_year": 1990, "publisher": ["MIT Press"], "isbn": ["123", "9780262046305"]}]}),
    );
    assert_eq!(
        (ol[0].isbn.as_str(), ol[0].url.as_str()),
        ("9780262046305", "https://openlibrary.org/works/OL1W")
    );
}
