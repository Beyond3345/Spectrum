//! What a web page says about the work it shows: its citation tags, JSON-LD, a displayed BibTeX export, or
//! the page itself (2.8's `readHtmlCitation` and its helpers).

use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;
use url::Url;

use crate::bibtex::parse_bib_entries;
use crate::csl::{Name, Record, issued_from_date, parse_name};
use crate::detect::{DOI_RE, clean_doi, strip_version};
use crate::text::{
    clean_text, decode_entities, fre, latex_to_text, match_brace, normalise_title, re,
};

static META: LazyLock<Regex> = LazyLock::new(|| re(r#"(?i)<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>"#));
static ATTR: LazyLock<Regex> =
    LazyLock::new(|| re(r#"([^\s=<>"'/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))"#));

/// `<meta name|property=… content=…>` → (lower-cased name, decoded values), in the page's order.
pub fn parse_html_meta(html: &str) -> Vec<(String, Vec<String>)> {
    let mut meta: Vec<(String, Vec<String>)> = Vec::new();
    for tag in META.find_iter(html) {
        let mut name = String::new();
        let mut property = String::new();
        let mut content = String::new();
        for a in ATTR.captures_iter(tag.as_str()) {
            let value = a
                .get(2)
                .or_else(|| a.get(3))
                .or_else(|| a.get(4))
                .map_or("", |m| m.as_str());
            match a[1].to_lowercase().as_str() {
                "name" => value.clone_into(&mut name),
                "property" => value.clone_into(&mut property),
                "content" => value.clone_into(&mut content),
                _ => {}
            }
        }
        let key = if name.is_empty() { property } else { name }
            .trim()
            .to_lowercase();
        let content = decode_entities(&content).trim().to_owned();
        if key.is_empty() || content.is_empty() {
            continue;
        }
        match meta.iter_mut().find(|(k, _)| *k == key) {
            Some((_, v)) => v.push(content),
            None => meta.push((key, vec![content])),
        }
    }
    meta
}

struct Structured {
    title: String,
    author: Vec<Name>,
    issued: Vec<i64>,
    publisher: String,
}

static LD_JSON: LazyLock<Regex> = LazyLock::new(|| {
    re(r#"(?is)<script\b[^>]*\btype\s*=\s*["']application/ld\+json["'][^>]*>(.*?)</script>"#)
});
static PAGE_TYPE: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?:^|[/#])(?:NewsArticle|Article|BlogPosting|ScholarlyArticle|WebPage)$")
});

fn types(n: &Value) -> Vec<String> {
    match n.get("@type") {
        Some(Value::String(s)) => vec![s.clone()],
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(|t| t.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

fn s(v: Option<&Value>) -> String {
    v.and_then(Value::as_str).unwrap_or("").to_owned()
}

fn canonical(u: &str, base: &str) -> String {
    let parsed = Url::parse(base).and_then(|b| b.join(u));
    parsed.map_or_else(
        |_| String::new(),
        |mut p| {
            p.set_fragment(None);
            p.to_string().trim_end_matches('/').to_owned()
        },
    )
}

#[allow(clippy::items_after_statements)]
fn structured_page(html: &str, url: &str) -> Option<Structured> {
    let mut nodes: Vec<Value> = Vec::new();
    fn collect(v: &Value, nodes: &mut Vec<Value>) {
        match v {
            Value::Array(a) => a.iter().for_each(|x| collect(x, nodes)),
            Value::Object(o) => {
                nodes.push(v.clone());
                if let Some(g) = o.get("@graph") {
                    collect(g, nodes);
                }
            }
            _ => {}
        }
    }
    for m in LD_JSON.captures_iter(html) {
        // malformed metadata is not a failed page
        if let Ok(v) = serde_json::from_str::<Value>(m[1].trim()) {
            collect(&v, &mut nodes);
        }
    }
    let mut candidates: Vec<&Value> = nodes
        .iter()
        .filter(|n| types(n).iter().any(|t| PAGE_TYPE.is_match(t)))
        .collect();
    candidates.sort_by_key(|n| types(n).iter().any(|t| t == "WebPage"));
    let address = |n: &Value| {
        [
            s(n.get("url")),
            s(n.get("mainEntityOfPage").and_then(|m| m.get("@id"))),
            s(n.get("mainEntityOfPage")),
            s(n.get("@id")),
        ]
        .into_iter()
        .find(|a| !a.is_empty())
        .unwrap_or_default()
    };
    let want = canonical(url, url);
    let page = candidates
        .iter()
        .find(|n| {
            let a = address(n);
            !a.is_empty() && canonical(&a, url) == want
        })
        .or_else(|| candidates.iter().find(|n| address(n).is_empty()))?;
    let deref = |v: &Value| -> Value {
        let id = v.as_str().map_or_else(|| s(v.get("@id")), str::to_owned);
        if id.is_empty() {
            return v.clone();
        }
        nodes
            .iter()
            .find(|n| s(n.get("@id")) == id && n.get("name").is_some())
            .cloned()
            .unwrap_or_else(|| v.clone())
    };
    let authors: Vec<Value> = match page.get("author") {
        Some(Value::Array(a)) => a.clone(),
        Some(v) => vec![v.clone()],
        None => Vec::new(),
    };
    let author = authors
        .iter()
        .map(deref)
        .filter_map(|a| {
            if let Some(text) = a.as_str() {
                return if text.to_lowercase().starts_with("http") {
                    None
                } else {
                    parse_name(text)
                };
            }
            if s(a.get("@type")) == "Organization" {
                let name = s(a.get("name"));
                return (!name.is_empty()).then(|| Name::literal(&clean_text(&name)));
            }
            let family = s(a.get("familyName"));
            if family.is_empty() {
                parse_name(&s(a.get("name")))
            } else {
                Some(Name::family(
                    &clean_text(&family),
                    &clean_text(&s(a.get("givenName"))),
                ))
            }
        })
        .collect();
    let title = [s(page.get("headline")), s(page.get("name"))]
        .into_iter()
        .find(|t| !t.is_empty())
        .unwrap_or_default();
    let date = [s(page.get("datePublished")), s(page.get("dateCreated"))]
        .into_iter()
        .find(|t| !t.is_empty())
        .unwrap_or_default();
    Some(Structured {
        title: clean_text(&title),
        author,
        issued: issued_from_date(&date).unwrap_or_default(),
        publisher: clean_text(&s(page
            .get("publisher")
            .map(deref)
            .as_ref()
            .and_then(|p| p.get("name")))),
    })
}

struct Exported {
    author: Vec<Name>,
    publisher: String,
    issued: Vec<i64>,
}

static SCRIPT_STYLE: LazyLock<fancy_regex::Regex> =
    LazyLock::new(|| fre(r"(?is)<(script|style)\b[^>]*>.*?</\1>"));
static EXPORT_BLOCK: LazyLock<fancy_regex::Regex> =
    LazyLock::new(|| fre(r"(?is)<(pre|code|button)\b[^>]*>(.*?)</\1>"));
static AND: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^\s+and\s+"));

/// Some paper pages leave the authors out of their metadata but show a complete BibTeX export.
fn exported_citation(html: &str, title: &str) -> Option<Exported> {
    if title.is_empty() {
        return None;
    }
    let visible = SCRIPT_STYLE.replace_all(html, "").into_owned();
    for block in EXPORT_BLOCK.captures_iter(visible.as_str()).flatten() {
        let Some(inner) = block.get(2) else { continue };
        let entries = parse_bib_entries(&clean_text(inner.as_str()));
        let Some(entry) = entries
            .into_iter()
            .find(|e| normalise_title(e.get("title")) == normalise_title(title))
        else {
            continue;
        };
        let names = entry.get("author").trim().to_owned();
        let mut authors = Vec::new();
        let mut start = 0;
        let mut i = 0;
        while i <= names.len() {
            if names.as_bytes().get(i) == Some(&b'{') {
                i = match_brace(&names, i)?;
                i += 1;
                continue;
            }
            let sep = AND.find(&names[i..]).map(|m| m.len());
            if sep.is_none() && i < names.len() {
                i += names[i..].chars().next().map_or(1, char::len_utf8);
                continue;
            }
            let name = names[start..i].trim();
            let author = if name.starts_with('{') && match_brace(name, 0) == Some(name.len() - 1) {
                Some(Name::literal(&latex_to_text(&name[1..name.len() - 1])))
            } else {
                parse_name(&latex_to_text(name))
            };
            authors.extend(author);
            i += sep.unwrap_or(1);
            start = i;
        }
        let date = if entry.get("date").is_empty() {
            entry.get("year")
        } else {
            entry.get("date")
        };
        return Some(Exported {
            author: authors,
            publisher: latex_to_text(entry.get("publisher")),
            issued: issued_from_date(date).unwrap_or_default(),
        });
    }
    None
}

/// What a page gives: a DOI to look up, an arXiv id, or a record read from it (kept as a fallback beside a DOI).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct HtmlCitation {
    pub doi: String,
    pub arxiv: String,
    pub record: Option<Record>,
    /// Set for a DOI found in the page's text, which counts only when its record's title fits this.
    pub page_title: String,
}

static TITLE_TAG: LazyLock<Regex> = LazyLock::new(|| re(r"(?is)<title[^>]*>(.*?)</title>"));
static TIME_TAG: LazyLock<Regex> =
    LazyLock::new(|| re(r#"(?i)<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["'][^>]*>"#));

/// A page → what it says about its work, in 2.8's order; `None` when it says nothing. `now`: when it was read.
#[allow(clippy::too_many_lines)]
pub fn read_html_citation(html: &str, url: &str, now: &str) -> Option<HtmlCitation> {
    let meta = parse_html_meta(html);
    let all = |n: &str| {
        meta.iter()
            .find(|(k, _)| k == n)
            .map(|(_, v)| v.clone())
            .unwrap_or_default()
    };
    let one = |names: &[&str]| {
        names
            .iter()
            .find_map(|n| all(n).into_iter().next())
            .unwrap_or_default()
    };
    let structured = structured_page(html, url);
    let meta_doi = [
        "citation_doi",
        "dc.identifier",
        "prism.doi",
        "bepress_citation_doi",
    ]
    .iter()
    .flat_map(|n| all(n))
    .find_map(|v| DOI_RE.captures(&v).map(|c| c[1].to_owned()));
    let title = one(&["citation_title"]);
    let page_title = [
        title.clone(),
        structured
            .as_ref()
            .map(|s| s.title.clone())
            .unwrap_or_default(),
        one(&["og:title", "twitter:title"]),
        clean_text(
            TITLE_TAG
                .captures(html)
                .map_or("", |c| c.get(1).map_or("", |m| m.as_str())),
        ),
    ]
    .into_iter()
    .find(|t| !t.is_empty())
    .unwrap_or_default();
    let exported = exported_citation(html, &page_title);
    let citation_authors: Vec<Name> = all("citation_author")
        .iter()
        .filter_map(|a| parse_name(a))
        .collect();
    let author_tag = one(&["author"]);
    let authors = if !citation_authors.is_empty() {
        citation_authors
    } else if let Some(s) = structured.as_ref().filter(|s| !s.author.is_empty()) {
        s.author.clone()
    } else if let Some(e) = exported.as_ref().filter(|e| !e.author.is_empty()) {
        e.author.clone()
    } else if !author_tag.is_empty() && !author_tag.to_lowercase().starts_with("http") {
        parse_name(&author_tag).into_iter().collect()
    } else {
        Vec::new()
    };
    let or = |a: Vec<i64>, b: Vec<i64>| if a.is_empty() { b } else { a };
    let mut record = None;
    if !title.is_empty() {
        let (journal, conference, book) = (
            one(&["citation_journal_title"]),
            one(&["citation_conference_title"]),
            one(&["citation_book_title"]),
        );
        let kind = if !journal.is_empty() {
            "article-journal"
        } else if !conference.is_empty() {
            "paper-conference"
        } else if !book.is_empty() {
            "chapter"
        } else {
            "other"
        };
        let issued = issued_from_date(&one(&[
            "citation_publication_date",
            "citation_date",
            "citation_year",
        ]))
        .unwrap_or_default();
        let issued = or(
            or(
                issued,
                structured
                    .as_ref()
                    .map(|s| s.issued.clone())
                    .unwrap_or_default(),
            ),
            exported
                .as_ref()
                .map(|e| e.issued.clone())
                .unwrap_or_default(),
        );
        let publisher = [
            one(&["citation_publisher"]),
            exported
                .as_ref()
                .map(|e| e.publisher.clone())
                .unwrap_or_default(),
            structured
                .as_ref()
                .map(|s| s.publisher.clone())
                .unwrap_or_default(),
        ]
        .into_iter()
        .find(|p| !p.is_empty())
        .unwrap_or_default();
        record = Some(Record {
            kind: kind.into(),
            title: title.clone(),
            author: authors.clone(),
            issued,
            container: [journal, conference, book]
                .into_iter()
                .find(|c| !c.is_empty())
                .unwrap_or_default(),
            volume: one(&["citation_volume"]),
            issue: one(&["citation_issue"]),
            page: [one(&["citation_firstpage"]), one(&["citation_lastpage"])]
                .into_iter()
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
                .join("-"),
            publisher,
            url: url.into(),
            ..Record::default()
        });
    }
    // the meta record stays as a fallback in case the DOI can't be resolved
    if let Some(doi) = meta_doi {
        return Some(HtmlCitation {
            doi: clean_doi(&doi),
            record,
            ..HtmlCitation::default()
        });
    }
    if record.is_some() {
        let arxiv = one(&["citation_arxiv_id"]);
        if !arxiv.is_empty() {
            return Some(HtmlCitation {
                arxiv: strip_version(&arxiv),
                ..HtmlCitation::default()
            });
        }
        return Some(HtmlCitation {
            record,
            ..HtmlCitation::default()
        });
    }
    let published = or(
        or(
            structured
                .as_ref()
                .map(|s| s.issued.clone())
                .unwrap_or_default(),
            issued_from_date(&one(&[
                "article:published_time",
                "og:published_time",
                "datepublished",
                "parsely-pub-date",
                "sailthru.date",
                "dc.date.issued",
                "dcterms.issued",
                "dc.date",
                "pubdate",
                "date",
            ]))
            .unwrap_or_default(),
        ),
        or(
            TIME_TAG
                .captures(html)
                .and_then(|c| issued_from_date(&c[1]))
                .unwrap_or_default(),
            exported
                .as_ref()
                .map(|e| e.issued.clone())
                .unwrap_or_default(),
        ),
    );
    let webpage = (!page_title.is_empty()).then(|| Record {
        kind: "webpage".into(),
        title: page_title.clone(),
        author: authors,
        issued: published,
        publisher: [
            exported
                .as_ref()
                .map(|e| e.publisher.clone())
                .unwrap_or_default(),
            structured
                .as_ref()
                .map(|s| s.publisher.clone())
                .unwrap_or_default(),
            one(&["og:site_name"]),
        ]
        .into_iter()
        .find(|p| !p.is_empty())
        .unwrap_or_default(),
        url: url.into(),
        accessed: now.into(),
        ..Record::default()
    });
    // a DOI in the text may be the page's own, or one it cites (Wikipedia, blogs): it only counts when its
    // record's title fits the page title
    let body_doi = DOI_RE
        .captures(&decode_entities(html))
        .map(|c| c[1].to_owned());
    if let (Some(doi), false) = (body_doi, page_title.is_empty()) {
        return Some(HtmlCitation {
            doi: clean_doi(&doi),
            record: webpage,
            page_title,
            ..HtmlCitation::default()
        });
    }
    webpage.map(|w| HtmlCitation {
        record: Some(w),
        ..HtmlCitation::default()
    })
}

/// Whether a record is what a page is about: its title is in the page title, or nearly all its words are.
pub fn title_fits_page(record_title: &str, page_title: &str) -> bool {
    let r = normalise_title(&clean_text(record_title));
    let p = normalise_title(page_title);
    if r.is_empty() || p.is_empty() {
        return false;
    }
    if format!(" {p} ").contains(&format!(" {r} ")) {
        return true;
    }
    let page_words: Vec<&str> = p.split(' ').collect();
    let words: Vec<&str> = r.split(' ').collect();
    let hits = words.iter().filter(|w| page_words.contains(w)).count();
    hits * 5 >= words.len() * 4
}

static CHALLENGE_TITLE: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"(?i)verif(?:y|ying) (?:you are (?:a )?human|your browser)|just a moment|attention required|captcha|are you a robot|access denied|cookies must be enabled",
    )
});

/// "Verify you are human" and the like stand in for the page that was asked for.
pub(crate) fn is_challenge(record: &Record, final_url: &str) -> bool {
    let Ok(u) = Url::parse(final_url) else {
        return false;
    };
    let title = clean_text(&record.title);
    u.path().to_lowercase().contains("/challenge")
        || title.to_lowercase() == u.host_str().unwrap_or("").to_lowercase()
        || CHALLENGE_TITLE.is_match(&title)
}

#[cfg(test)]
mod tests;
