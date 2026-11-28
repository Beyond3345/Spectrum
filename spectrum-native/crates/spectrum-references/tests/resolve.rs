//! The reference resolvers against a local stand-in for doi.org, Crossref, arXiv and publisher pages, writing
//! into a scratch project (2.8's references.test.js integration run). No network.

#![allow(clippy::pedantic)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::too_many_lines)]

mod support;

use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::{Value, json};
use spectrum_references::{
    Draft, Endpoints, Http, Resolver, Status, add_reference, commit_reference, parse_bib_entries,
    resolve_references,
};
use support::{Reply, Server, json as reply_json, text};

fn csl() -> BTreeMap<&'static str, Value> {
    let y = |n: i64| json!({ "date-parts": [[n]] });
    BTreeMap::from([
        (
            "10.1234/busy",
            json!({ "type": "article-journal", "title": "Busy Widgets", "author": [{"family": "Busy", "given": "B."}], "issued": y(2024), "DOI": "10.1234/busy" }),
        ),
        (
            "10.1234/journal.1",
            json!({ "type": "article-journal", "title": "Notes on the Analytical Engine", "author": [{"family": "Lovelace", "given": "Ada"}], "issued": y(1843), "container-title": "Scientific Memoirs", "volume": "3", "page": "666-731", "DOI": "10.1234/journal.1" }),
        ),
        (
            "10.1234/smith.2",
            json!({ "type": "article-journal", "title": "A Different Study", "author": [{"family": "Smith", "given": "Jane"}], "issued": y(2020), "container-title": "J. Tests", "DOI": "10.1234/smith.2" }),
        ),
        (
            "10.1234/smith.3",
            json!({ "type": "article-journal", "title": "Yet Another Study", "author": [{"family": "Smith", "given": "Jane"}], "issued": y(2020), "container-title": "J. Tests", "DOI": "10.1234/smith.3" }),
        ),
        (
            "10.1234/journal.2",
            json!({ "type": "paper-conference", "title": "Published Widgets", "author": [{"family": "Lovelace", "given": "Ada"}], "issued": y(2021), "container-title": "Proceedings of WidgetConf", "DOI": "10.1234/journal.2" }),
        ),
        (
            "10.1234/journal.3",
            json!({ "type": "chapter", "title": "A Chapter on Things", "author": [{"family": "Müller", "given": "Hans"}], "issued": y(2015), "container-title": "The Book of Things", "publisher": "Springer", "DOI": "10.1234/journal.3" }),
        ),
        (
            "10.1234/journal.4",
            json!({ "type": "report", "title": "Widget Safety Report", "author": [{"literal": "CSIRO"}], "issued": y(2022), "publisher": "CSIRO", "number": "TR-7", "DOI": "10.1234/journal.4" }),
        ),
        (
            "10.1234/journal.5",
            json!({ "type": "article-journal", "title": "Neural Widgets for Everyone", "author": [{"family": "Doe", "given": "Jane"}], "issued": y(2023), "container-title": "Widget Letters", "DOI": "10.1234/journal.5" }),
        ),
        (
            "10.1234/journal.6",
            json!({ "type": "thesis", "title": "On Widgets", "author": [{"family": "Roe", "given": "John"}], "issued": y(2019), "publisher": "University of Sydney", "DOI": "10.1234/journal.6" }),
        ),
    ])
}

fn atom(id: &str, doi: &str) -> String {
    let doi = if doi.is_empty() {
        String::new()
    } else {
        format!("<arxiv:doi>{doi}</arxiv:doi>")
    };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><entry><id>http://arxiv.org/abs/{id}v1</id><title>Preprint Widgets</title><published>2021-01-01T00:00:00Z</published><author><name>Ada Lovelace</name></author><author><name>Charles Babbage</name></author>{doi}<arxiv:primary_category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/></entry></feed>"#
    )
}

fn search(q: &str, csl: &BTreeMap<&str, Value>) -> Vec<Value> {
    let figure = json!({ "type": "component", "title": "Figure 2: Neural Widgets for Everyone", "DOI": "10.1234/fig.2" });
    let opinion = json!({ "type": "dataset", "title": "Faculty Opinions recommendation of Neural Widgets for Everyone", "DOI": "10.1234/fo.1" });
    let (j5, j6) = (
        csl["10.1234/journal.5"].clone(),
        csl["10.1234/journal.6"].clone(),
    );
    match q {
        "Neural Widgets for Everyone" => vec![figure, j6, j5],
        "Doe 2023 Neural Widgets for Everyone" => vec![opinion, j6, j5],
        "widgets maybe" => vec![j5, j6],
        _ => Vec::new(),
    }
}

async fn mock() -> (Server, Arc<AtomicUsize>) {
    let busy = Arc::new(AtomicUsize::new(0));
    let b = busy.clone();
    let csl = csl();
    let server = Server::start(move |req| {
        let p = req.path.as_str();
        if let Some(doi) = p.strip_prefix("/doi/") {
            let doi = doi.to_lowercase();
            if doi == "10.1234/busy" && b.fetch_add(1, Ordering::SeqCst) == 0 {
                return Reply { status: 429, headers: vec![("retry-after".into(), "0".into())], body: String::new() };
            }
            if !req.headers.get("accept").is_some_and(|a| a.contains("citationstyles.csl+json")) {
                return reply_json(406, "{}");
            }
            if doi == "10.5555/crossref-only" {
                return text(406, "text/html", "<html>Not acceptable</html>");
            }
            return csl.get(doi.as_str()).map_or_else(|| text(404, "text/plain", "DOI not found"), |v| text(200, "application/vnd.citationstyles.csl+json", &v.to_string()));
        }
        if p == "/crossref/works" {
            assert_eq!(req.q("rows"), "20");
            let items: Vec<Value> = search(req.q("query.bibliographic"), &csl)
                .into_iter()
                .map(|mut it| {
                    it["title"] = json!([it["title"]]);
                    it["container-title"] = json!([it.get("container-title").cloned().unwrap_or(Value::Null)]);
                    it
                })
                .collect();
            return reply_json(200, &json!({ "status": "ok", "message": { "items": items } }).to_string());
        }
        if let Some(doi) = p.strip_prefix("/crossref/works/") {
            return if doi == "10.5555/crossref-only" {
                reply_json(200, &json!({ "status": "ok", "message": { "type": "journal-article", "title": ["Crossref &amp; Friends"], "author": [{"given": "Kim", "family": "Lee"}], "container-title": ["J. Tests"], "issued": {"date-parts": [[2018]]}, "DOI": "10.5555/crossref-only" } }).to_string())
            } else {
                text(404, "text/plain", "Resource not found.")
            };
        }
        if p == "/arxiv/api/query" {
            return match req.q("id_list") {
                "2101.00001" => text(200, "application/atom+xml", &atom("2101.00001", "10.1234/journal.2")),
                "2101.00002" => text(200, "application/atom+xml", &atom("2101.00002", "")),
                _ => text(200, "application/atom+xml", "<feed xmlns=\"http://www.w3.org/2005/Atom\"></feed>"),
            };
        }
        let html = |b: &str| text(200, "text/html; charset=utf-8", b);
        match p {
            "/page/meta-doi" => html(r#"<html><head><meta name="citation_doi" content="10.1234/journal.3"><title>x</title></head></html>"#),
            "/page/meta-full" => html(r#"<meta name="citation_title" content="Fast Widgets"><meta name="citation_author" content="Doe, Jane"><meta name="citation_date" content="2019"><meta name="citation_conference_title" content="WidgetConf">"#),
            "/page/body-doi" => html(r#"<html><head><title>Widget Safety Report – CSIRO</title></head><body>Cite: <a href="https://doi.org/10.1234/journal.4">doi</a></body></html>"#),
            "/page/cites-others" => html(r#"<html><head><title>Widgets - Wikipedia</title></head><body>See <a href="https://doi.org/10.1234/journal.1">ref</a></body></html>"#),
            "/page/plain" => html("<html><head><title>A Plain Page</title></head></html>"),
            "/challenge" => html("<html><head><title>Verifying your browser | Widgets</title></head></html>"),
            "/page/bot-check" => text(203, "text/html", "<title>pubmed.example</title>"),
            "/page/to-challenge" => Reply { status: 302, headers: vec![("location".into(), "/challenge".into())], body: String::new() },
            "/page/to-local" => Reply { status: 302, headers: vec![("location".into(), "http://127.0.0.1:9/internal".into())], body: String::new() },
            _ => text(404, "text/plain", "nope"),
        }
    })
    .await;
    (server, busy)
}

fn project(files: &[(&str, &str)]) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    for (rel, content) in files {
        let path = dir.path().join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
    }
    dir
}

fn fields_of(bib: &str) -> BTreeMap<String, String> {
    bib.lines()
        .filter_map(|l| {
            let (name, value) = l.strip_prefix("  ")?.split_once(" = {")?;
            Some((name.trim().to_owned(), value.strip_suffix("},")?.to_owned()))
        })
        .collect()
}

fn type_of(bib: &str) -> &str {
    &bib[1..bib.find('{').unwrap()]
}

#[tokio::test(flavor = "multi_thread")]
async fn resolves_deduplicates_and_writes_references_into_a_project() {
    let (server, busy) = mock().await;
    let base = server.base.clone();
    let resolver = Resolver::new(Http::new(Endpoints::local(&base)));
    let original = "% keep me exactly\n@article{Smith2020,\n  title = {Old},\n  year = {2020},\n  doi = {10.9999/EXISTING}\n}";
    let dir = project(&[
        (
            ".spectrum/project.json",
            r#"{"id":"refs-1","name":"Paper"}"#,
        ),
        (
            "main.tex",
            "\\documentclass{article}\n\\begin{document}\n\\bibliography{references}\n\\end{document}\n",
        ),
        ("references.bib", original),
    ]);
    let root = dir.path();
    let bib_path = root.join("references.bib");
    let only = |input: String| {
        let resolver = resolver.clone();
        async move {
            let out = resolve_references(&resolver, root, &input, "", None, false)
                .await
                .unwrap();
            assert_eq!(out.results.len(), 1, "{input}");
            out.results.into_iter().next().unwrap()
        }
    };

    // DOI → added, appended after one blank line
    let out = resolve_references(
        &resolver,
        root,
        "https://doi.org/10.1234/journal.1",
        "",
        None,
        false,
    )
    .await
    .unwrap();
    assert_eq!(
        (out.bib_file.as_str(), out.bib_included),
        ("references.bib", true)
    );
    let r = &out.results[0];
    assert_eq!(
        (
            r.status,
            r.key.as_str(),
            r.title.as_str(),
            r.year.as_str(),
            r.doi.as_str()
        ),
        (
            Status::Added,
            "Lovelace1843",
            "Notes on the Analytical Engine",
            "1843",
            "10.1234/journal.1"
        )
    );
    assert_eq!(r.authors, ["Ada Lovelace"]);
    assert!(
        r.bibtex
            .starts_with("@article{Lovelace1843,\n  author  = {Lovelace, Ada},"),
        "{}",
        r.bibtex
    );
    assert_eq!(
        std::fs::read_to_string(&bib_path).unwrap(),
        format!("{original}\n\n{}\n", r.bibtex)
    );

    // the same DOI again (any case) is a duplicate, with no lookup
    let before = server.requests.lock().len();
    let r = only("doi:10.1234/JOURNAL.1".into()).await;
    assert_eq!(
        (r.status, r.key.as_str(), r.bib_file.as_str()),
        (Status::Duplicate, "Lovelace1843", "references.bib")
    );
    assert_eq!(server.requests.lock().len(), before);
    assert_eq!(only("10.9999/existing".into()).await.key, "Smith2020");

    // clashing keys get suffixes
    let out = resolve_references(
        &resolver,
        root,
        "10.1234/smith.2\n10.1234/smith.3",
        "",
        None,
        false,
    )
    .await
    .unwrap();
    let keys: Vec<(Status, &str)> = out
        .results
        .iter()
        .map(|r| (r.status, r.key.as_str()))
        .collect();
    assert_eq!(
        keys,
        [(Status::Added, "Smith2020a"), (Status::Added, "Smith2020b")]
    );

    // arXiv with a DOI → the published version, which keeps its arXiv id
    let r = only("https://arxiv.org/abs/2101.00001v2".into()).await;
    assert_eq!(
        (r.status, r.key.as_str(), type_of(&r.bibtex)),
        (Status::Added, "Lovelace2021", "inproceedings")
    );
    assert_eq!(
        fields_of(&r.bibtex)["booktitle"],
        "Proceedings of WidgetConf"
    );
    assert_eq!(fields_of(&r.bibtex)["eprint"], "2101.00001");
    let again = only("10.48550/arXiv.2101.00001".into()).await;
    assert_eq!(
        (again.status, again.key.as_str()),
        (Status::Duplicate, "Lovelace2021")
    );

    // arXiv without a DOI → the preprint
    let r = only("arXiv:2101.00002".into()).await;
    assert_eq!(r.key, "Lovelace2021a");
    let f = fields_of(&r.bibtex);
    assert_eq!(f["author"], "Lovelace, Ada and Babbage, Charles");
    assert_eq!(
        (
            f["journal"].as_str(),
            f["primaryClass"].as_str(),
            f["url"].as_str()
        ),
        (
            "arXiv preprint arXiv:2101.00002",
            "cs.LG",
            "https://arxiv.org/abs/2101.00002"
        )
    );
    assert_eq!(only("2101.00002v3".into()).await.status, Status::Duplicate);

    // links: a DOI meta tag, citation tags, a DOI in the body, a page that only cites one, a plain page
    let r = only(format!("{base}/page/meta-doi")).await;
    assert_eq!(
        (r.key.as_str(), type_of(&r.bibtex)),
        ("Muller2015", "incollection")
    );
    assert!(
        r.bibtex.contains("author    = {Müller, Hans}"),
        "{}",
        r.bibtex
    );
    let r = only(format!("{base}/page/meta-full")).await;
    assert_eq!(
        (r.key.as_str(), type_of(&r.bibtex)),
        ("Doe2019", "inproceedings")
    );
    assert_eq!(
        fields_of(&r.bibtex)["url"],
        format!("{base}/page/meta-full")
    );
    let r = only(format!("{base}/page/body-doi")).await;
    assert_eq!(
        (
            r.key.as_str(),
            type_of(&r.bibtex),
            fields_of(&r.bibtex)["institution"].as_str(),
            fields_of(&r.bibtex)["number"].as_str()
        ),
        ("CSIRO2022", "techreport", "CSIRO", "TR-7")
    );
    let cites = only(format!("{base}/page/cites-others")).await;
    assert_eq!(
        (
            type_of(&cites.bibtex),
            fields_of(&cites.bibtex)["title"].as_str()
        ),
        ("misc", "Widgets - Wikipedia")
    );
    let plain = only(format!("{base}/page/plain")).await;
    assert_eq!(plain.key, "Plain");
    assert!(
        !fields_of(&plain.bibtex).contains_key("note"),
        "static pages need no access date in APA 7"
    );

    // bot checks, challenge pages and local addresses are refused
    for page in ["bot-check", "to-challenge"] {
        let r = only(format!("{base}/page/{page}")).await;
        assert_eq!(r.status, Status::Error, "{page}");
        assert!(
            r.message.contains("didn’t return the page"),
            "{}",
            r.message
        );
    }
    for link in [
        format!("{base}/page/to-local"),
        "http://localhost:1/admin".into(),
        "http://192.168.1.1/".into(),
    ] {
        let r = only(link.clone()).await;
        assert!(
            r.status == Status::Error && r.message.contains("this computer or the local network"),
            "{link}: {}",
            r.message
        );
    }

    // Crossref asks to slow down → wait and try again
    let r = only("10.1234/busy".into()).await;
    assert_eq!(
        (r.status, r.key.as_str(), busy.load(Ordering::SeqCst)),
        (Status::Added, "Busy2024", 2)
    );

    // a title is added only on an exact, corroborated match; a bare title is a choice
    assert_eq!(
        only("Doe 2023 Neural Widgets for Everyone".into())
            .await
            .key,
        "Doe2023"
    );
    let bare = only("Neural Widgets for Everyone".into()).await;
    assert_eq!(bare.status, Status::Choose);
    let ids: Vec<&str> = bare.candidates.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(ids, ["10.1234/journal.5", "10.1234/journal.6"]);
    let r = only("widgets maybe".into()).await;
    assert_eq!(
        (
            r.candidates[1].title.as_str(),
            r.candidates[1].authors[0].as_str(),
            r.candidates[1].year.as_str()
        ),
        ("On Widgets", "John Roe", "2019")
    );
    let added = add_reference(&resolver, root, "10.1234/journal.6", "", false)
        .await
        .unwrap();
    assert_eq!(
        (added.results[0].status, added.results[0].key.as_str()),
        (Status::Added, "Roe2019")
    );
    assert!(
        added.results[0]
            .bibtex
            .contains("school = {University of Sydney}")
    );
    assert_eq!(
        add_reference(&resolver, root, "10.1234/journal.6", "", false)
            .await
            .unwrap()
            .results[0]
            .status,
        Status::Duplicate
    );
    assert!(
        add_reference(&resolver, root, "just words", "", false)
            .await
            .is_err()
    );

    // Crossref's API when doi.org can't answer; nothing found
    let r = only("10.5555/crossref-only".into()).await;
    assert_eq!(r.key, "Lee2018");
    assert_eq!(fields_of(&r.bibtex)["title"], "Crossref \\& Friends");
    assert_eq!(
        only("10.1234/missing".into()).await.status,
        Status::NotFound
    );
    assert_eq!(only("2101.09999".into()).await.status, Status::NotFound);
    assert_eq!(
        only("nothing matches this".into()).await.status,
        Status::NotFound
    );

    // every write appended; nothing before it changed
    let text = std::fs::read_to_string(&bib_path).unwrap();
    assert!(text.starts_with(&format!("{original}\n\n@article{{Lovelace1843,")));
    let keys: Vec<String> = parse_bib_entries(&text)
        .into_iter()
        .map(|e| e.key)
        .collect();
    assert_eq!(
        keys,
        [
            "Smith2020",
            "Lovelace1843",
            "Smith2020a",
            "Smith2020b",
            "Lovelace2021",
            "Lovelace2021a",
            "Muller2015",
            "Doe2019",
            "CSIRO2022",
            "Widgets",
            "Plain",
            "Busy2024",
            "Doe2023",
            "Roe2019",
            "Lee2018"
        ]
    );
    assert!(!text.contains("\n\n\n"));
}

#[tokio::test(flavor = "multi_thread")]
async fn targets_previews_and_commits() {
    let (server, _) = mock().await;
    let resolver = Resolver::new(Http::new(Endpoints::local(&server.base)));
    // a .bib the document doesn't load yet is created, and said so
    let dir = project(&[
        (".spectrum/project.json", r#"{"id":"refs-2","name":"P"}"#),
        ("main.tex", "\\addbibresource{other.bib}\n"),
    ]);
    let out = resolve_references(&resolver, dir.path(), "10.1234/journal.5", "", None, false)
        .await
        .unwrap();
    assert_eq!(
        (out.bib_file.as_str(), out.bib_included),
        ("references.bib", false)
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("references.bib")).unwrap(),
        format!("{}\n", out.results[0].bibtex)
    );
    // biblatex: Biber's names
    assert!(
        out.results[0]
            .bibtex
            .contains("journaltitle = {Widget Letters}"),
        "{}",
        out.results[0].bibtex
    );
    // a Typst project: refs.bib, loaded by #bibliography
    let typ = project(&[
        (
            ".spectrum/project.json",
            r#"{"id":"refs-3","name":"P","mainFile":"main.typ"}"#,
        ),
        ("main.typ", "= Intro\n#bibliography(\"refs.bib\")\n"),
        ("refs.bib", ""),
        ("references.bib", ""),
    ]);
    let out = resolve_references(&resolver, typ.path(), "10.1234/journal.5", "", None, true)
        .await
        .unwrap();
    assert_eq!(
        (
            out.bib_file.as_str(),
            out.bib_included,
            out.results[0].status
        ),
        ("refs.bib", true, Status::Draft)
    );
    assert_eq!(
        std::fs::read_to_string(typ.path().join("refs.bib")).unwrap(),
        "",
        "a preview writes nothing"
    );
    let draft = out.results[0].draft.clone().unwrap();
    assert_eq!(
        (draft.kind.as_str(), draft.key.as_str()),
        ("article", "Doe2023")
    );
    // the card's commit, with the type and format the user chose
    let chosen = Draft {
        kind: "online".into(),
        ..draft
    };
    let done = commit_reference(
        typ.path(),
        &chosen,
        "",
        "",
        Some(spectrum_references::Style {
            biblatex: false,
            legacy_urls: false,
        }),
    )
    .await
    .unwrap();
    assert_eq!(done.results[0].status, Status::Added);
    assert!(
        done.results[0].bibtex.starts_with("@misc{Doe2023,"),
        "{}",
        done.results[0].bibtex
    );
    let bad = Draft {
        kind: "article".into(),
        key: "a b".into(),
        fields: vec![("title".into(), "T".into())],
    };
    assert!(
        commit_reference(typ.path(), &bad, "", "", None)
            .await
            .is_err()
    );
}
