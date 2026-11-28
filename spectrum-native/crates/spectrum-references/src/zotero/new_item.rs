//! A `.bib` entry as a new Zotero item, through a small map of BibTeX's fields to Zotero's.

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Value, json};

use crate::bibtex::BibEntry;
use crate::csl::parse_name;
use crate::detect::clean_doi;
use crate::text::{latex_to_text, match_brace, re, squash};

static DASHES: LazyLock<Regex> = LazyLock::new(|| re("-+"));

fn item_type(t: &str) -> &'static str {
    match t {
        "article" => "journalArticle",
        "inproceedings" | "conference" => "conferencePaper",
        "proceedings" | "book" => "book",
        "inbook" | "incollection" => "bookSection",
        "phdthesis" | "mastersthesis" | "thesis" => "thesis",
        "techreport" | "report" => "report",
        "online" | "electronic" | "www" => "webpage",
        "unpublished" => "manuscript",
        _ => "document",
    }
}

// the fields each item type takes besides title, creators, date, url, abstract and citation key
fn fields_of(item_type: &str) -> &'static [(&'static str, &'static str)] {
    match item_type {
        "journalArticle" => &[
            ("container", "publicationTitle"),
            ("volume", "volume"),
            ("number", "issue"),
            ("pages", "pages"),
            ("doi", "DOI"),
            ("issn", "ISSN"),
        ],
        "conferencePaper" => &[
            ("container", "proceedingsTitle"),
            ("volume", "volume"),
            ("pages", "pages"),
            ("publisher", "publisher"),
            ("address", "place"),
            ("doi", "DOI"),
            ("isbn", "ISBN"),
        ],
        "book" => &[
            ("volume", "volume"),
            ("series", "series"),
            ("edition", "edition"),
            ("publisher", "publisher"),
            ("address", "place"),
            ("isbn", "ISBN"),
        ],
        "bookSection" => &[
            ("container", "bookTitle"),
            ("volume", "volume"),
            ("pages", "pages"),
            ("publisher", "publisher"),
            ("address", "place"),
            ("isbn", "ISBN"),
        ],
        "thesis" => &[("school", "university"), ("address", "place")],
        "report" => &[
            ("number", "reportNumber"),
            ("institution", "institution"),
            ("pages", "pages"),
            ("address", "place"),
        ],
        "preprint" => &[
            ("repository", "repository"),
            ("archiveID", "archiveID"),
            ("doi", "DOI"),
        ],
        "webpage" => &[("container", "websiteTitle")],
        "manuscript" => &[("address", "place")],
        _ => &[("publisher", "publisher")],
    }
}

fn plain_text(v: &str) -> String {
    squash(&latex_to_text(v).replace(['{', '}'], ""))
}

/// BibTeX's names split on the ands outside braces; "others" left out.
fn split_names(value: &str) -> Vec<String> {
    let mut names = Vec::new();
    let (mut depth, mut start, mut i) = (0i32, 0, 0);
    let b = value.as_bytes();
    while i < b.len() {
        match b[i] {
            b'{' => depth += 1,
            b'}' => depth -= 1,
            c if depth == 0 && c.is_ascii_whitespace() => {
                let rest = &value[i..];
                let trimmed = rest.trim_start();
                if trimmed.len() >= 4
                    && trimmed[..3].eq_ignore_ascii_case("and")
                    && trimmed.as_bytes()[3].is_ascii_whitespace()
                {
                    names.push(value[start..i].to_owned());
                    let skip = rest.len() - trimmed.len() + 3;
                    let after = &value[i + skip..];
                    i += skip + (after.len() - after.trim_start().len());
                    start = i;
                    continue;
                }
            }
            _ => {}
        }
        i += 1;
    }
    names.push(value[start..].to_owned());
    names
        .into_iter()
        .map(|n| n.trim().to_owned())
        .filter(|n| !n.is_empty() && n != "others")
        .collect()
}

fn creators_of(value: &str, creator_type: &str) -> Vec<Value> {
    split_names(value)
        .into_iter()
        .filter_map(|raw| {
            if raw.starts_with('{') && match_brace(&raw, 0) == Some(raw.len() - 1) {
                return Some(json!({ "creatorType": creator_type, "name": plain_text(&raw) }));
            }
            let n = parse_name(&plain_text(&raw))?;
            Some(if n.literal.is_empty() {
                json!({ "creatorType": creator_type, "lastName": n.family, "firstName": n.given })
            } else {
                json!({ "creatorType": creator_type, "name": n.literal })
            })
        })
        .collect()
}

/// A `.bib` entry as a new Zotero item, through a small map of BibTeX's fields to Zotero's.
#[allow(clippy::too_many_lines)]
pub fn item_from_entry(entry: &BibEntry) -> Value {
    let g = |n: &str| entry.get(n);
    let prefix = if g("archiveprefix").is_empty() {
        g("eprinttype")
    } else {
        g("archiveprefix")
    };
    let eprint = g("eprint");
    let arxiv_eprint =
        if !eprint.is_empty() && (prefix.is_empty() || prefix.to_lowercase().contains("arxiv")) {
            eprint
                .get(..6)
                .filter(|p| p.eq_ignore_ascii_case("arxiv:"))
                .map_or(eprint, |_| eprint[6..].trim_start())
                .to_owned()
        } else {
            String::new()
        };
    let journal = if g("journal").is_empty() {
        g("journaltitle")
    } else {
        g("journal")
    };
    let mut kind = item_type(&entry.kind);
    if !arxiv_eprint.is_empty()
        && (["misc", "unpublished", "online"].contains(&entry.kind.as_str())
            || (entry.kind == "article"
                && (journal.is_empty() || journal.to_lowercase().contains("arxiv"))))
    {
        kind = "preprint";
    }
    let doi = if g("doi").is_empty() {
        String::new()
    } else {
        clean_doi(g("doi"))
    };
    let or = |a: &str, b: &str| {
        if a.is_empty() {
            b.to_owned()
        } else {
            a.to_owned()
        }
    };
    let values: HashMap<&str, String> = [
        ("container", or(journal, g("booktitle"))),
        ("volume", g("volume").to_owned()),
        ("number", or(g("number"), g("issue"))),
        ("pages", DASHES.replace_all(g("pages"), "-").into_owned()),
        ("publisher", or(g("publisher"), g("organization"))),
        ("address", or(g("address"), g("location"))),
        ("edition", g("edition").to_owned()),
        ("series", g("series").to_owned()),
        ("isbn", g("isbn").to_owned()),
        ("issn", g("issn").to_owned()),
        ("school", or(g("school"), g("institution"))),
        ("institution", or(g("institution"), g("organization"))),
        (
            "repository",
            if arxiv_eprint.is_empty() {
                String::new()
            } else {
                "arXiv".into()
            },
        ),
        (
            "archiveID",
            if arxiv_eprint.is_empty() {
                String::new()
            } else {
                format!("arXiv:{arxiv_eprint}")
            },
        ),
        ("doi", doi.clone()),
    ]
    .into_iter()
    .collect();
    let edited = [
        "journalArticle",
        "conferencePaper",
        "book",
        "bookSection",
        "document",
    ]
    .contains(&kind);
    let mut creators = creators_of(g("author"), "author");
    if edited {
        creators.extend(creators_of(g("editor"), "editor"));
    }
    let mut item = Map::new();
    let mut put = |k: &str, v: Value| {
        if v.as_str() != Some("") {
            item.insert(k.to_owned(), v);
        }
    };
    put("itemType", json!(kind));
    put("title", json!(plain_text(g("title"))));
    put("creators", Value::Array(creators));
    put("date", json!(plain_text(&or(g("date"), g("year")))));
    put("url", json!(g("url")));
    put("abstractNote", json!(plain_text(g("abstract"))));
    put("citationKey", json!(entry.key));
    let fields = fields_of(kind);
    for (from, to) in fields {
        let v = &values[from];
        if !v.is_empty() {
            put(
                to,
                json!(if matches!(*from, "doi" | "archiveID") {
                    v.clone()
                } else {
                    plain_text(v)
                }),
            );
        }
    }
    if !doi.is_empty() && !fields.iter().any(|(k, _)| *k == "doi") {
        put("extra", json!(format!("DOI: {doi}")));
    }
    if kind == "thesis" {
        put(
            "thesisType",
            json!(if entry.kind == "mastersthesis" {
                "Master’s thesis"
            } else {
                "PhD thesis"
            }),
        );
    }
    Value::Object(item)
}
