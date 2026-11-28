use std::collections::BTreeMap;

use super::*;
use crate::csl::{base_key, to_bibtex};
use crate::entry::Style;

const NOW: &str = "2026-10-11T03:00:00Z";

fn fields_of(bib: &str) -> BTreeMap<String, String> {
    bib.lines()
        .filter_map(|l| {
            let (name, value) = l.strip_prefix("  ")?.split_once(" = {")?;
            Some((name.trim().to_owned(), value.strip_suffix("},")?.to_owned()))
        })
        .collect()
}

fn read(html: &str, url: &str) -> HtmlCitation {
    read_html_citation(html, url, NOW).expect("a citation")
}

fn bib(rec: &Record) -> String {
    to_bibtex(rec, &base_key(rec), Style::default())
}

#[test]
fn parses_meta_tags_in_any_attribute_order_and_quoting() {
    let meta = parse_html_meta(
        r#"
    <meta name="citation_title" content="Widgets &amp; Gadgets">
    <meta content='M&uuml;ller, Hans' name='citation_author'>
    <META property="og:title" CONTENT="An &quot;OG&quot; title &#8211; &#x2014;">
    <meta name=citation_year content=2019>
    <meta content="x > y" name="description" />
    <meta name="citation_author" content="Johannes Diderik van der Waals">"#,
    );
    let get = |k: &str| {
        meta.iter()
            .find(|(n, _)| n == k)
            .map(|(_, v)| v.clone())
            .unwrap_or_default()
    };
    assert_eq!(get("citation_title"), ["Widgets & Gadgets"]);
    assert_eq!(
        get("citation_author"),
        ["Müller, Hans", "Johannes Diderik van der Waals"]
    );
    assert_eq!(get("og:title"), ["An \"OG\" title – —"]);
    assert_eq!(get("citation_year"), ["2019"]);
    assert_eq!(get("description"), ["x > y"]);
}

#[test]
fn reads_citations_from_pages_in_the_documented_order() {
    assert_eq!(
        read(
            r#"<meta name="citation_doi" content="doi:10.1234/abc.">"#,
            "https://x.test"
        )
        .doi,
        "10.1234/abc"
    );
    assert_eq!(
        read(
            r#"<meta name="DC.Identifier" content="https://doi.org/10.1234/dc">"#,
            "https://x.test"
        )
        .doi,
        "10.1234/dc"
    );
    assert_eq!(
        read(
            r#"<meta name="prism.doi" content="10.1234/prism">"#,
            "https://x.test"
        )
        .doi,
        "10.1234/prism"
    );
    assert_eq!(read(r#"<meta name="dc.identifier" content="ISBN 123"><meta name="bepress_citation_doi" content="10.1234/bp">"#, "https://x.test").doi, "10.1234/bp");
    assert_eq!(read(r#"<meta name="citation_title" content="T"><meta name="citation_arxiv_id" content="2101.00002v2">"#, "https://x.test").arxiv, "2101.00002");
    assert_eq!(
        read(
            r#"<title>T</title><a href="https://doi.org/10.1234/x">x</a>"#,
            "https://x.test"
        )
        .doi,
        "10.1234/x"
    );

    let rec = read(
        r#"<meta name="citation_title" content="Fast Widgets">
    <meta name="citation_author" content="Doe, Jane"><meta name="citation_author" content="John Roe">
    <meta name="citation_publication_date" content="2019/05/01">
    <meta name="citation_conference_title" content="WidgetConf 2019">
    <meta name="citation_firstpage" content="12"><meta name="citation_lastpage" content="34">
    <a href="https://doi.org/10.1234/cited-elsewhere">ref</a>"#,
        "https://x.test/p",
    )
    .record
    .unwrap();
    let b = bib(&rec);
    assert!(b.starts_with("@inproceedings{Doe2019,"), "{b}");
    let f = fields_of(&b);
    assert_eq!(
        (
            f["author"].as_str(),
            f["booktitle"].as_str(),
            f["pages"].as_str(),
            f["url"].as_str()
        ),
        (
            "Doe, Jane and Roe, John",
            "WidgetConf 2019",
            "12--34",
            "https://x.test/p"
        )
    );

    let body = read(
        r#"<title>In Body</title><p>Cite as <a href="https://doi.org/10.1234/in-body">x</a></p>"#,
        "https://x.test",
    );
    assert_eq!(
        (
            body.doi.as_str(),
            body.page_title.as_str(),
            body.record.unwrap().kind.as_str()
        ),
        ("10.1234/in-body", "In Body", "webpage")
    );
    assert!(
        read_html_citation(
            r#"<p>Cite as <a href="https://doi.org/10.1234/in-body">x</a></p>"#,
            "https://x.test",
            NOW
        )
        .is_none()
    );
    assert!(title_fits_page(
        "Widget Safety Report",
        "Widget Safety Report | CSIRO"
    ));
    assert!(!title_fits_page(
        "Learning representations by back-propagating errors",
        "Geoffrey Hinton - Wikipedia"
    ));

    let page = read(
        r#"<title>Ignored</title><meta property="og:title" content="A Blog Post"><meta property="article:published_time" content="2024-03-02T10:00:00Z">"#,
        "https://blog.test/post",
    );
    assert_eq!(
        bib(&page.record.unwrap()),
        "@misc{Blog2024,\n  title = {A Blog Post},\n  year  = {2024},\n  date  = {2024-03-02},\n  url   = {https://blog.test/post},\n}"
    );
    assert_eq!(
        read("<title>Only &amp; title</title>", "https://x.test")
            .record
            .unwrap()
            .title,
        "Only & title"
    );
    assert!(read_html_citation("<p>nothing</p>", "https://x.test", NOW).is_none());
}

#[test]
fn alphaxiv_citation_exports_supply_omitted_authors() {
    let url = "https://www.alphaxiv.org/abs/2609.navier-stokes";
    let html = format!(
        r#"<meta name="citation_title" content="Finite Time Blowup for Navier–Stokes">
    <meta name="citation_publication_date" content="2026/9/8">
    <script type="application/ld+json">{{"@type":"ScholarlyArticle","headline":"Finite Time Blowup for Navier–Stokes","url":"{url}","author":[],"publisher":{{"name":"arXiv"}}}}</script>
    <button aria-label="Copy BibTeX"><span><span>@misc</span>{{openai-finite-time-blowup,
      <span>author</span> = {{<span>OpenAI</span>}},
      <span>title</span> = {{Finite Time Blowup for Navier–Stokes}},
      <span>publisher</span> = {{OpenAI}}
    }}</span></button>"#
    );
    let rec = read(&html, url).record.unwrap();
    assert_eq!(
        rec.author,
        vec![Name {
            family: "OpenAI".into(),
            ..Name::default()
        }]
    );
    assert_eq!(rec.issued, vec![2026, 9, 8]);
    assert_eq!(rec.publisher, "OpenAI");
    assert_eq!(base_key(&rec), "OpenAI2026");
    let f = fields_of(&bib(&rec));
    assert_eq!((f["author"].as_str(), f["url"].as_str()), ("OpenAI", url));
    assert!(!f.contains_key("eprint"));
}

#[test]
fn citation_exports_match_the_title_and_keep_grouped_names() {
    let url = "https://example.com/paper";
    let metadata = r#"<meta name="citation_title" content="A Paper">"#;
    let citation = |title: &str, author: &str| {
        format!(
            "<pre>@misc{{k, title = {{{title}}}, author = {{{author}}}, year = {{2026}}}}</pre>"
        )
    };
    assert!(
        read(
            &format!("{metadata}{}", citation("Another Paper", "Wrong Author")),
            url
        )
        .record
        .unwrap()
        .author
        .is_empty()
    );
    assert!(
        read(
            &format!(
                "{metadata}<script>{}</script>",
                citation("A Paper", "Script Author")
            ),
            url
        )
        .record
        .unwrap()
        .author
        .is_empty()
    );
    let rec = read(
        &format!(
            "{metadata}{}",
            citation(
                "A Paper",
                "Doe, Jane and {Research and {Development}} and Roe, John"
            )
        ),
        url,
    )
    .record
    .unwrap();
    assert_eq!(
        rec.author,
        vec![
            Name::family("Doe", "Jane"),
            Name::literal("Research and Development"),
            Name::family("Roe", "John")
        ]
    );
    assert_eq!(
        fields_of(&to_bibtex(&rec, "K", Style::default()))["author"],
        "Doe, Jane and {Research and Development} and Roe, John"
    );
    let right = read(
        &format!(
            "{metadata}<meta name=\"citation_author\" content=\"Right Author\">{}",
            citation("A Paper", "Wrong Author")
        ),
        url,
    )
    .record
    .unwrap();
    assert_eq!(right.author, vec![Name::family("Author", "Right")]);
    let structured = format!(
        r#"<script type="application/ld+json">{{"@type":"ScholarlyArticle","url":"{url}","name":"A Paper","author":{{"@type":"Organization","name":"Right Organization"}}}}</script>"#
    );
    assert_eq!(
        read(
            &format!(
                "{metadata}{structured}{}",
                citation("A Paper", "Wrong Author")
            ),
            url
        )
        .record
        .unwrap()
        .author,
        vec![Name::literal("Right Organization")]
    );
}

#[test]
fn json_ld_supplies_author_date_and_publisher() {
    let url = "https://www.businessinsider.com/what-are-loops-ai-engineering-tips-2026-6";
    let html = format!(
        r##"<title>Short search title</title><script type="application/ld+json">{{"@graph":[{{"@type":"WebPage","@id":"{url}","name":"Short title"}},{{"@type":"NewsArticle","@id":"{url}#article","headline":"Forget prompts: 'Loop engineering' is all the rage now","datePublished":"2026-06-20T09:01:01.239Z","author":{{"@id":"#author"}},"publisher":{{"@type":"Organization","name":"Business Insider"}}}},{{"@type":"Person","@id":"#author","name":"Brent D. Griffiths"}}]}}</script>"##
    );
    let rec = read(&html, url).record.unwrap();
    assert_eq!(base_key(&rec), "Griffiths2026");
    assert_eq!(rec.author, vec![Name::family("Griffiths", "Brent D.")]);
    let f = fields_of(&bib(&rec));
    assert_eq!(
        (
            f["date"].as_str(),
            f["organization"].as_str(),
            f["url"].as_str()
        ),
        ("2026-06-20", "Business Insider", url)
    );
    assert!(f["title"].contains("`Loop engineering'"));
    let org = read(r#"<script type="application/ld+json">{"@type":"Article","headline":"A result","author":{"@type":"Organization","name":"OpenAI"},"publisher":{"name":"OpenAI"},"datePublished":"2026-09-08"}</script>"#, "https://openai.com/article").record.unwrap();
    let f = fields_of(&to_bibtex(&org, "K", Style::default()));
    assert_eq!(f["author"], "{OpenAI}");
    assert!(
        !f.contains_key("organization"),
        "APA 7 omits a repeated site name"
    );
    assert_eq!(read(r#"<script type="application/ld+json">broken</script><title>Fallback</title><time datetime="2026-06-20"></time>"#, url).record.unwrap().issued[2], 20);
    assert!(read(r#"<title>No date</title><script type="application/ld+json">{"@type":"Article","url":"https://other.test/story","headline":"Other story","datePublished":"2000-01-01"}</script>"#, url).record.unwrap().issued.is_empty());
}
