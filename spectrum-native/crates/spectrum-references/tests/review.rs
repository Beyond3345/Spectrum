//! Review on a fixture project read from disk (findings with their file and line), and Verify citations
//! against recorded Crossref, arXiv and OpenAlex answers. No network.

#![allow(clippy::pedantic)]
#![allow(clippy::unwrap_used, clippy::expect_used)]

mod support;

use std::path::PathBuf;

use spectrum_references::review::{
    CheckStatus, Group, ReviewInput, Severity, check_references, review_gaps, run_review,
};
use spectrum_references::{Endpoints, Http, Resolver, line_of, parse_bib_entries};
use support::{Server, json, text};

fn paper() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/review/paper")
}

#[test]
fn a_fixture_project_gives_findings_with_their_place() {
    let mut input = ReviewInput::read(&paper(), "main.tex", "", false, None).unwrap();
    input.anonymous = true;
    let found = run_review(&input);
    let at = |group: Group, severity: Severity, start: &str, place: (&str, usize)| {
        assert!(
            found.iter().any(|f| f.group == group
                && f.severity == severity
                && f.message.starts_with(start)
                && f.file.as_deref() == Some(place.0)
                && f.line == Some(place.1)),
            "no {start:?} at {place:?}: {found:#?}"
        );
    };
    at(
        Group::References,
        Severity::Warning,
        "No bibliography entry has the key “nobody99”",
        ("main.tex", 11),
    );
    at(
        Group::References,
        Severity::Warning,
        "Nothing has the label “tab:none”",
        ("sections/method.tex", 2),
    );
    at(
        Group::References,
        Severity::Error,
        "Can’t find the image “figures/missing”",
        ("main.tex", 18),
    );
    at(
        Group::References,
        Severity::Info,
        "Figure “A figure nobody mentions.” has no \\label",
        ("main.tex", 17),
    );
    at(
        Group::References,
        Severity::Info,
        "2 entries in refs.bib are never cited: retracted2020 and unused2001",
        ("refs.bib", 9),
    );
    at(
        Group::Privacy,
        Severity::Warning,
        "\\author names the authors",
        ("main.tex", 4),
    );
    at(
        Group::Privacy,
        Severity::Warning,
        "\\email can identify the authors",
        ("main.tex", 4),
    );
    at(
        Group::Privacy,
        Severity::Warning,
        "The acknowledgements can identify the authors",
        ("main.tex", 21),
    );
    at(
        Group::Privacy,
        Severity::Info,
        "FIXME comment: “say which engine”",
        ("sections/method.tex", 3),
    );
    assert!(
        !found
            .iter()
            .any(|f| f.message.contains("sec:method") || f.message.contains("fig:engine")),
        "{found:#?}"
    );
    // no log, no PDF: Review says to compile rather than giving an all-clear
    let gaps = review_gaps(&input, None);
    assert!(
        gaps.iter()
            .any(|(g, m)| *g == Group::Compile && m == "Compile first.")
    );
    assert!(gaps.iter().any(|(g, _)| *g == Group::Accessibility));
}

#[tokio::test(flavor = "multi_thread")]
async fn verify_citations_reads_each_entrys_record() {
    let server = Server::start(|req| match req.path.as_str() {
        "/crossref/works/10.1234/ae" => json(200, r#"{"message":{"DOI":"10.1234/ae","title":["Notes on the Analytical Engine"],"author":[{"family":"Lovelace","given":"Ada"}],"issued":{"date-parts":[[1842]]},"container-title":["Scientific Memoirs"]}}"#),
        "/crossref/works/10.1234/gone" => json(200, r#"{"message":{"DOI":"10.1234/gone","title":["Widgets cure everything"],"author":[{"family":"Fraud","given":"Some"}],"issued":{"date-parts":[[2020]]},"updated-by":[{"type":"retraction","DOI":"10.1234/gone.r","source":"retraction-watch","updated":{"date-parts":[[2021,3,4]]}}]}}"#),
        p if p.starts_with("/openalex/works/doi:") => json(200, r#"{"id":"https://openalex.org/W9","is_retracted":false}"#),
        "/arxiv/api/query" => text(200, "application/atom+xml", r#"<feed xmlns="http://www.w3.org/2005/Atom"></feed>"#),
        _ => text(404, "text/plain", "no"),
    })
    .await;
    let resolver = Resolver::new(Http::new(Endpoints::local(&server.base)));
    let bib = std::fs::read_to_string(paper().join("refs.bib")).unwrap();
    let entries: Vec<_> = parse_bib_entries(&bib)
        .into_iter()
        .map(|e| {
            let line = line_of(&bib, e.at);
            (e, "refs.bib".to_owned(), line)
        })
        .collect();
    let rows = check_references(&resolver, &entries).await;
    assert_eq!(
        (rows[0].key.as_str(), rows[0].status, rows[0].line),
        ("lovelace1843", CheckStatus::Found, 1)
    );
    assert!(rows[0].note.contains("a year apart"), "{:?}", rows[0]);
    assert_eq!(rows[1].status, CheckStatus::Retracted);
    let r = rows[1].retraction.as_ref().unwrap();
    assert_eq!(
        (r.from.as_str(), r.date.as_str(), r.notice.as_str()),
        (
            "Retraction Watch, through Crossref",
            "2021-03-04",
            "10.1234/gone.r"
        )
    );
    assert_eq!(
        (rows[2].status, rows[2].note.as_str()),
        (CheckStatus::NotFound, "arXiv has no paper 2101.00002.")
    );
}
