//! Research against recorded answers from every source on a local server: one search across them all, merged,
//! marked against the .bib, logged per source, filtered, saved and changed (2.8's research.test.js). No network.

#![allow(clippy::pedantic)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::too_many_lines)]

mod support;

use std::collections::BTreeMap;

use spectrum_references::research::{
    ResearchKeys, ResearchQuery, Services, SessionChange, add_results, delete_session, get_session,
    list_sessions, search_research, update_session,
};
use spectrum_references::{Connection, Endpoints, Http, Resolver, SearchConfig, Status};
use support::{Server, fixture, json, text};

async fn mock(s2_busy: bool) -> Server {
    Server::start(move |req| match req.path.as_str() {
        "/openalex/works" => json(200, &fixture("research/openalex.json")),
        "/s2/graph/v1/paper/search" if s2_busy => json(429, r#"{"message":"Too Many Requests"}"#),
        "/s2/graph/v1/paper/search" => json(200, r#"{"data":[{"title":"Attention is all you need","url":"https://www.semanticscholar.org/paper/1","year":2017,"venue":"Neural Information Processing Systems","authors":[{"name":"Ashish Vaswani"},{"name":"Noam Shazeer"}],"externalIds":{"ArXiv":"1706.03762","DOI":"10.5555/attn"},"abstract":"The dominant sequence transduction models are based on complex recurrent networks.","citationCount":1000,"publicationTypes":["Conference"]}]}"#),
        "/arxiv/api/query" => text(200, "application/atom+xml", &fixture("research/arxiv.xml")),
        "/crossref/works" => json(200, &fixture("research/crossref.json")),
        "/pubmed/esearch.fcgi" => json(200, r#"{"esearchresult":{"idlist":["42"]}}"#),
        "/pubmed/efetch.fcgi" => text(200, "text/xml", &fixture("research/pubmed.xml")),
        "/brave/res/v1/web/search" => json(200, r#"{"web":{"results":[{"title":"Attention (machine learning) explained","url":"https://example.com/attention","description":"A blog post"}]}}"#),
        "/dblp/search/publ/api" => json(200, &fixture("research/dblp.json")),
        "/europepmc/search" => json(200, &fixture("research/europepmc.json")),
        "/inspire/api/literature" => json(200, &fixture("research/inspire.json")),
        _ => text(404, "text/plain", "not found"),
    })
    .await
}

fn project() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".spectrum")).unwrap();
    std::fs::write(
        dir.path().join(".spectrum/project.json"),
        r#"{"id":"research-1","name":"Search"}"#,
    )
    .unwrap();
    std::fs::write(dir.path().join("main.tex"), "\\documentclass{article}\n\\begin{document}\n\\bibliography{references}\n\\end{document}\n").unwrap();
    std::fs::write(
        dir.path().join("references.bib"),
        "@article{Hopper2024,\n  title = {A preprint on attention},\n  author = {Hopper, Grace},\n  year = {2024}\n}\n@book{Knuth1984,\n  title = {Literate programming with attention},\n  author = {Knuth, Donald E.},\n  year = {1984},\n  abstract = {Attention to {programs}.}\n}\n",
    )
    .unwrap();
    dir
}

fn keys() -> ResearchKeys {
    ResearchKeys {
        openalex_key: "oa-secret-key".into(),
        openalex_email: "me@example.com".into(),
        semantic_scholar_key: String::new(),
        ncbi_key: "ncbi-secret-key".into(),
    }
}

fn sources(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| (*s).to_owned()).collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn one_search_runs_every_source_merges_marks_and_logs() {
    let server = mock(true).await;
    let resolver = Resolver::new(Http::new(Endpoints::local(&server.base)));
    let web = SearchConfig {
        provider: "brave".into(),
        connections: vec![Connection {
            provider: "brave".into(),
            api_key: "brave-secret-key".into(),
            engine: String::new(),
        }],
    };
    let services = Services {
        resolver: &resolver,
        search: Some(&web),
        zotero: None,
        model: None,
    };
    let dir = project();
    let query = ResearchQuery {
        question: "attention".into(),
        sources: sources(&[
            "openalex",
            "semanticscholar",
            "arxiv",
            "crossref",
            "pubmed",
            "web",
            "bib",
        ]),
        preprints: true,
        ..ResearchQuery::default()
    };
    let session = search_research(dir.path(), &query, &keys(), services)
        .await
        .unwrap();

    let openalex = &server.hits("/openalex/works")[0];
    assert_eq!(
        (openalex.q("api_key"), openalex.q("mailto")),
        ("oa-secret-key", "me@example.com")
    );
    assert_eq!(
        server.hits("/pubmed/esearch.fcgi")[0].q("api_key"),
        "ncbi-secret-key"
    );
    assert_eq!(server.hits("/pubmed/esearch.fcgi")[0].q("tool"), "Spectrum");
    assert!(
        server.hits("/arxiv/api/query")[0]
            .target
            .contains("search_query=all:attention&")
    );

    let run = &session.runs[0];
    assert_eq!(run.queries, ["attention"]);
    let counts: BTreeMap<&str, usize> = run
        .per_source
        .iter()
        .map(|(k, v)| (k.as_str(), v.count))
        .collect();
    assert_eq!(
        counts,
        BTreeMap::from([
            ("arxiv", 2),
            ("bib", 2),
            ("crossref", 2),
            ("openalex", 2),
            ("pubmed", 1),
            ("semanticscholar", 0),
            ("web", 1)
        ])
    );
    assert!(
        run.per_source["semanticscholar"]
            .error
            .as_deref()
            .unwrap()
            .contains("limiting requests")
    );
    assert!(
        !serde_json::to_string(&session)
            .unwrap()
            .contains("secret-key")
    );

    let attention: Vec<_> = session
        .results
        .iter()
        .filter(|r| r.title.eq_ignore_ascii_case("attention is all you need"))
        .collect();
    assert_eq!(attention.len(), 1);
    let a = attention[0];
    assert_eq!(a.sources, ["openalex", "arxiv", "crossref"]);
    assert_eq!(
        (a.doi.as_str(), a.arxiv.as_str(), a.citations, a.preprint),
        ("10.5555/attn", "1706.03762", Some(950), Some(false))
    );
    assert_eq!(
        a.abstract_text,
        "The dominant sequence transduction models."
    );
    let preprint = session
        .results
        .iter()
        .find(|r| r.title == "A preprint on attention")
        .unwrap();
    assert_eq!(
        (preprint.in_bib.as_str(), preprint.preprint),
        ("Hopper2024", Some(true))
    );
    assert_eq!(preprint.sources, ["arxiv", "bib"]);
    assert_eq!(
        session
            .results
            .iter()
            .find(|r| r.title == "Literate programming with attention")
            .unwrap()
            .in_bib,
        "Knuth1984"
    );
    assert_eq!(
        session
            .results
            .iter()
            .find(|r| r.doi == "10.5555/sorting")
            .unwrap()
            .abstract_text,
        "Sorting fast."
    );
    assert_eq!(
        session
            .results
            .iter()
            .find(|r| r.sources.contains(&"web".to_owned()))
            .unwrap()
            .url,
        "https://example.com/attention"
    );
    let ids: std::collections::HashSet<&str> =
        session.results.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(ids.len(), session.results.len());

    // saved in the project, in 2.8's place and shape, and listed
    let saved: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(
            dir.path()
                .join(format!(".spectrum/research/{}.json", session.id)),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        saved["results"].as_array().unwrap().len(),
        session.results.len()
    );
    assert_eq!(saved["runs"][0]["perSource"]["openalex"]["count"], 2);
    let list = list_sessions(dir.path());
    assert_eq!(
        (
            list[0].id.as_str(),
            list[0].question.as_str(),
            list[0].count,
            list[0].kept
        ),
        (session.id.as_str(), "attention", session.results.len(), 0)
    );

    // a change merges field by field, and a search again keeps it
    let id = a.id.clone();
    let change = SessionChange {
        question: None,
        results: vec![(
            id.clone(),
            BTreeMap::from([
                ("decision".to_owned(), Some("keep".to_owned())),
                ("reason".to_owned(), Some("Key paper".to_owned())),
            ]),
        )],
    };
    update_session(dir.path(), &session.id, &change)
        .await
        .unwrap();
    let again = ResearchQuery {
        session_id: Some(session.id.clone()),
        ..query.clone()
    };
    let after = search_research(dir.path(), &again, &keys(), services)
        .await
        .unwrap();
    let kept = after.results.iter().find(|r| r.id == id).unwrap();
    assert_eq!(
        (
            kept.decision.as_str(),
            kept.reason.as_str(),
            after.runs.len()
        ),
        ("keep", "Key paper", 2)
    );
    let bad = SessionChange {
        question: None,
        results: vec![(
            id.clone(),
            BTreeMap::from([("decision".to_owned(), Some("maybe".to_owned()))]),
        )],
    };
    assert!(update_session(dir.path(), &session.id, &bad).await.is_err());

    // Add kept to .bib through the resolver: no registry here knows the DOI, and it says so
    let (added, _, _) = add_results(dir.path(), &session.id, None, "", services)
        .await
        .unwrap();
    assert_eq!(added.len(), 1);
    assert_eq!(added[0].status, Status::NotFound);

    assert_eq!(
        get_session(dir.path(), &session.id).unwrap().question,
        "attention"
    );
    delete_session(dir.path(), &session.id).unwrap();
    assert!(get_session(dir.path(), &session.id).is_err());
    assert!(get_session(dir.path(), "../escape").is_err());
}

#[tokio::test(flavor = "multi_thread")]
async fn filters_reach_the_sources_and_the_new_ones_answer() {
    let server = mock(false).await;
    let resolver = Resolver::new(Http::new(Endpoints::local(&server.base)));
    let services = Services {
        resolver: &resolver,
        search: None,
        zotero: None,
        model: None,
    };
    let dir = project();
    let query = ResearchQuery {
        question: "attention in transformers".into(),
        sources: sources(&["openalex", "semanticscholar", "arxiv", "crossref", "pubmed"]),
        year_from: Some(2017),
        year_to: Some(2020),
        preprints: false,
        ..ResearchQuery::default()
    };
    let session = search_research(dir.path(), &query, &ResearchKeys::default(), services)
        .await
        .unwrap();
    let filter = server.hits("/openalex/works")[0].q("filter").to_owned();
    assert!(
        filter.contains("from_publication_date:2017-01-01,to_publication_date:2020-12-31")
            && !filter.contains("preprint"),
        "{filter}"
    );
    assert_eq!(server.hits("/s2/")[0].q("year"), "2017-2020");
    assert!(server.hits("/arxiv/")[0].target.contains("search_query=all:attention+AND+all:transformers+AND+submittedDate:%5B201701010000+TO+202012312359%5D&"));
    assert!(
        server.hits("/crossref/works")[0]
            .q("filter")
            .contains("from-pub-date:2017,until-pub-date:2020")
    );
    let es = &server.hits("/pubmed/esearch.fcgi")[0];
    assert_eq!(
        (es.q("mindate"), es.q("maxdate"), es.q("datetype")),
        ("2017", "2020", "pdat")
    );
    assert_eq!(
        session.runs[0].filters,
        Some(serde_json::json!({ "yearFrom": 2017, "yearTo": 2020, "preprints": false }))
    );
    assert!(
        !session
            .results
            .iter()
            .any(|r| r.title == "A preprint on attention")
    );
    assert!(!session.results.iter().any(|r| r.year == "2021"));

    // DBLP, Europe PMC and INSPIRE-HEP run beside the others
    let more = ResearchQuery {
        question: "attention".into(),
        sources: sources(&["dblp", "europepmc", "inspire", "nonesuch"]),
        preprints: true,
        ..ResearchQuery::default()
    };
    let s = search_research(dir.path(), &more, &ResearchKeys::default(), services)
        .await
        .unwrap();
    let run = &s.runs[0];
    assert_eq!(
        (
            run.per_source["dblp"].count,
            run.per_source["europepmc"].count,
            run.per_source["inspire"].count
        ),
        (2, 2, 2)
    );
    assert!(run.per_source["nonesuch"].error.is_some());
    let vaswani: Vec<_> = s
        .results
        .iter()
        .filter(|r| r.sources.contains(&"dblp".to_owned()))
        .collect();
    assert_eq!(
        vaswani.len(),
        1,
        "DBLP's paper and its CoRR copy are one work"
    );
}
