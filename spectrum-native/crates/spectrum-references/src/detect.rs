//! What a pasted line is: a DOI, an arXiv id, a link, an ISBN, a formatted citation, RIS, or a title to search
//! (2.8's `detectInput`, `splitLines`, `classifyLine`, `parseRis`).

use std::sync::LazyLock;

use regex::Regex;

use crate::bibtex::BibEntry;
use crate::csl::{Name, Record, parse_name, year_issued};
use crate::formatted::parse_formatted;
use crate::text::{clean_text, fre, re};

// SICI DOIs may hold "<digits::…>"; any other "<" (an HTML tag) ends the DOI
pub(crate) const DOI_PATTERN: &str = r#"\b(10\.\d{4,9}/(?:[^\s"<>]|<\d+::[^\s"<>]*>)+)"#;
const ARXIV_NEW: &str = r"\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}";
const ARXIV_OLD: &str = r"[a-z-]+(?:\.[a-z]{2})?/\d{7}";

pub(crate) static DOI_RE: LazyLock<Regex> = LazyLock::new(|| re(&format!("(?i){DOI_PATTERN}")));
pub(crate) static ARXIV_URL_RE: LazyLock<Regex> = LazyLock::new(|| {
    re(&format!(
        r"(?i)(?:arxiv|ar5iv)\.org/(?:abs|pdf|html)/({ARXIV_OLD}|{ARXIV_NEW})"
    ))
});
pub(crate) static ARXIV_BARE_RE: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    fre(&format!(
        r"(?i)(?<![A-Za-z0-9_./-])({ARXIV_NEW}|{ARXIV_OLD})(?:v\d+)?(?!\d)"
    ))
});
pub(crate) static ARXIV_LABELLED_RE: LazyLock<Regex> = LazyLock::new(|| {
    re(&format!(
        r"(?i)arxiv(?:\s*preprint)?(?:\s*arxiv)?\s*[:.]?\s*({ARXIV_NEW}|{ARXIV_OLD})"
    ))
});
static URL_RE: LazyLock<Regex> = LazyLock::new(|| re(r#"(?i)(?:https?://|www\.)[^\s<>"]+"#));
static ARXIV_DOI: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^10\.48550/arxiv\.(.+)$"));
static DOI_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)/(?:abstract|full|pdf|epdf|html|fulltext)$"));
static CSHL_VERSION: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)v\d+(?:\.full(?:\.pdf)?|\.abstract|\.full-text)?$"));

/// `decodeURIComponent`: `None` for a malformed escape or bytes that aren't UTF-8.
pub(crate) fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Trailing punctuation dropped, and a closing bracket only when it has no partner.
pub(crate) fn trim_trailing(text: &str) -> String {
    let mut s = text.to_owned();
    loop {
        let count = |c: char| s.matches(c).count();
        match s.chars().last() {
            Some('.' | ',' | ';' | ':' | '\'' | '"') => {
                s.pop();
            }
            Some(')') if count('(') < count(')') => {
                s.pop();
            }
            Some(']') if count('[') < count(']') => {
                s.pop();
            }
            _ => return s,
        }
    }
}

/// A DOI as a link or citation writes it, made bare: decoded, no query, no `/abstract`, no bioRxiv version.
pub fn clean_doi(raw: &str) -> String {
    let doi = raw.trim();
    let doi = percent_decode(doi).unwrap_or_else(|| doi.to_owned());
    let doi = doi.split(['?', '#']).next().unwrap_or("");
    let doi = trim_trailing(&DOI_SUFFIX.replace(doi, ""));
    // bioRxiv/medRxiv URLs add a version (and .full, .full.pdf…) that no CSHL DOI has
    if doi.starts_with("10.1101/") {
        return CSHL_VERSION.replace(&doi, "").into_owned();
    }
    doi
}

/// An arXiv id without its version.
pub fn strip_version(id: &str) -> String {
    let id = id.trim();
    match id.rfind(['v', 'V']) {
        Some(k) if k + 1 < id.len() && id[k + 1..].chars().all(|c| c.is_ascii_digit()) => {
            id[..k].to_owned()
        }
        _ => id.to_owned(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemKind {
    Doi,
    Arxiv,
    Url,
    Isbn,
    /// A formatted citation (APA, IEEE, Chicago, MLA), read without a lookup.
    Citation,
    Ris,
    Bibtex,
    /// A title (or anything else) to search for.
    Query,
}

/// One reference to look up. `id` is the DOI, arXiv id, link, ISBN or query, as `kind` says.
#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub kind: ItemKind,
    pub input: String,
    pub id: String,
    /// A DOI's arXiv id (`10.48550/arXiv.…`).
    pub arxiv: String,
    /// What a formatted citation says, kept when its id can't be looked up.
    pub parsed: Option<Record>,
    /// A RIS record.
    pub record: Option<Record>,
    /// A pasted BibTeX entry.
    pub entry: Option<BibEntry>,
}

impl Item {
    pub(crate) fn new(kind: ItemKind, input: &str, id: &str) -> Self {
        Self {
            kind,
            input: input.into(),
            id: id.into(),
            arxiv: String::new(),
            parsed: None,
            record: None,
            entry: None,
        }
    }

    pub fn doi(&self) -> &str {
        if self.kind == ItemKind::Doi {
            &self.id
        } else {
            ""
        }
    }

    pub fn arxiv_id(&self) -> &str {
        match self.kind {
            ItemKind::Arxiv => &self.id,
            ItemKind::Doi => &self.arxiv,
            _ => "",
        }
    }

    pub fn isbn(&self) -> &str {
        if self.kind == ItemKind::Isbn {
            &self.id
        } else {
            ""
        }
    }
}

fn bare_arxiv(text: &str) -> Option<String> {
    let caps = ARXIV_BARE_RE.captures(text).ok().flatten()?;
    Some(caps.get(1)?.as_str().to_owned())
}

/// One item: DOI, arXiv id, link, else a query.
pub fn detect_input(text: &str) -> Item {
    let input = text.trim();
    if let Some(c) = DOI_RE.captures(input) {
        let clean = clean_doi(&c[1]);
        let mut item = Item::new(ItemKind::Doi, input, &clean);
        if let Some(a) = ARXIV_DOI.captures(&clean) {
            item.arxiv = strip_version(&a[1]);
        }
        return item;
    }
    if let Some(c) = ARXIV_URL_RE.captures(input) {
        return Item::new(ItemKind::Arxiv, input, &strip_version(&c[1]));
    }
    if let Some(m) = URL_RE.find(input) {
        let href = trim_trailing(m.as_str());
        let url = if href.len() >= 4 && href[..4].eq_ignore_ascii_case("www.") {
            format!("https://{href}")
        } else {
            href
        };
        return Item::new(ItemKind::Url, input, &url);
    }
    if let Some(id) = bare_arxiv(input) {
        return Item::new(ItemKind::Arxiv, input, &strip_version(&id));
    }
    Item::new(ItemKind::Query, input, input)
}

/// One item a non-empty line, or one an id when a line lists several DOIs or arXiv ids.
pub fn split_lines(text: &str) -> Vec<Item> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .flat_map(|line| {
            let dois: Vec<String> = DOI_RE
                .captures_iter(line)
                .map(|c| c[1].to_owned())
                .collect();
            let ids = if dois.is_empty() {
                ARXIV_BARE_RE
                    .captures_iter(line)
                    .filter_map(|c| Some(c.ok()?.get(1)?.as_str().to_owned()))
                    .collect()
            } else {
                dois
            };
            if ids.len() > 1 {
                ids.iter().map(|id| detect_input(id)).collect()
            } else {
                vec![classify_line(line)]
            }
        })
        .collect()
}

fn isbn13(twelve: &str) -> String {
    let sum: u32 = twelve
        .chars()
        .enumerate()
        .map(|(i, c)| c.to_digit(10).unwrap_or(0) * if i % 2 == 1 { 3 } else { 1 })
        .sum();
    format!("{twelve}{}", (10 - sum % 10) % 10)
}

/// An ISBN-10 or ISBN-13 whose check digit is right, as 13 digits; "" for anything else.
pub fn isbn_of(raw: &str) -> String {
    let d: String = raw
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect::<String>()
        .to_uppercase();
    let digits = |s: &str| s.chars().all(|c| c.is_ascii_digit());
    if d.len() == 10 && digits(&d[..9]) && (d.ends_with('X') || digits(&d[9..])) {
        let sum: u32 = d
            .chars()
            .zip((1..=10).rev())
            .map(|(c, w)| if c == 'X' { 10 } else { c.to_digit(10).unwrap_or(0) } * w)
            .sum();
        return if sum.is_multiple_of(11) {
            isbn13(&format!("978{}", &d[..9]))
        } else {
            String::new()
        };
    }
    if d.len() == 13
        && digits(&d)
        && (d.starts_with("978") || d.starts_with("979"))
        && isbn13(&d[..12]) == d
    {
        return d;
    }
    String::new()
}

static ISBN_LABELLED: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)\bISBN(?:-1[03])?:?\s*([\dX][\dX\s-]{8,16}[\dX])"));
static ISBN_ALONE: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^([\dX][\dX\s-]{8,16}[\dX])$"));

fn isbn_in(line: &str) -> String {
    ISBN_LABELLED
        .captures(line)
        .or_else(|| ISBN_ALONE.captures(line))
        .map(|c| isbn_of(&c[1]))
        .unwrap_or_default()
}

/// One pasted line: a DOI, arXiv id or link, an ISBN, a formatted citation, else a title to search.
pub fn classify_line(line: &str) -> Item {
    let mut item = detect_input(line);
    // a citation with an id is looked up by it, and kept as it reads if the lookup fails
    let parsed = if item.input.contains(char::is_whitespace) {
        parse_formatted(&item.input)
    } else {
        None
    };
    if item.kind != ItemKind::Query {
        item.parsed = parsed;
        return item;
    }
    let isbn = isbn_in(&item.input);
    if !isbn.is_empty() {
        let mut out = Item::new(ItemKind::Isbn, &item.input, &isbn);
        out.parsed = parsed;
        return out;
    }
    match parsed {
        Some(p) => {
            let mut out = Item::new(ItemKind::Citation, &item.input, &item.input);
            out.parsed = Some(p);
            out
        }
        None => item,
    }
}

fn ris_type(tag: &str) -> &'static str {
    match tag {
        "JOUR" | "JFULL" => "article-journal",
        "MGZN" => "article-magazine",
        "NEWS" => "article-newspaper",
        "BOOK" | "EBOOK" | "EDBOOK" => "book",
        "CHAP" | "ECHAP" => "chapter",
        "CONF" | "CPAPER" => "paper-conference",
        "RPRT" | "STAND" => "report",
        "THES" => "thesis",
        "ELEC" | "WEB" | "BLOG" => "webpage",
        "COMP" => "software",
        "DATA" => "dataset",
        _ => "other",
    }
}

static RIS_LINE: LazyLock<Regex> = LazyLock::new(|| re(r"^([A-Z][A-Z0-9])  -\s?(.*)$"));

/// RIS records (`TY … ER`), as reference managers export them.
pub fn parse_ris(text: &str) -> Vec<Record> {
    let mut records = Vec::new();
    let mut tags: Option<Vec<(String, String)>> = None;
    for line in text.lines() {
        let Some(m) = RIS_LINE.captures(line) else {
            continue;
        };
        let (tag, value) = (&m[1], m[2].trim());
        match tag {
            "TY" => tags = Some(vec![("TY".into(), value.into())]),
            "ER" => {
                if let Some(t) = tags.take() {
                    records.push(ris_record(&t));
                }
            }
            _ => {
                if let Some(t) = tags.as_mut()
                    && !value.is_empty()
                {
                    t.push((tag.into(), value.into()));
                }
            }
        }
    }
    records
}

fn ris_record(t: &[(String, String)]) -> Record {
    let all = |n: &str| {
        t.iter()
            .filter(|(k, _)| k == n)
            .map(|(_, v)| v.clone())
            .collect::<Vec<_>>()
    };
    let one = |names: &[&str]| {
        names
            .iter()
            .find_map(|n| all(n).into_iter().next())
            .unwrap_or_default()
    };
    let kind = ris_type(&one(&["TY"])).to_owned();
    let names = |tags: &[&str]| {
        tags.iter()
            .flat_map(|n| all(n))
            .filter_map(|v| parse_name(&v))
            .collect::<Vec<Name>>()
    };
    let mut editors = vec!["ED"];
    if kind == "chapter" {
        editors.push("A2");
    }
    let doi = DOI_RE
        .captures(&one(&["DO"]))
        .map(|c| clean_doi(&c[1]))
        .unwrap_or_default();
    Record {
        title: one(&["TI", "T1", "CT", if kind == "book" { "BT" } else { "" }]),
        author: names(&["AU", "A1"]),
        editor: names(&editors),
        issued: year_issued(&one(&["PY", "Y1", "DA"])),
        container: if kind == "book" {
            String::new()
        } else {
            one(&["T2", "JO", "JF", "JA", "BT"])
        },
        volume: one(&["VL"]),
        issue: one(&["IS"]),
        page: [one(&["SP"]), one(&["EP"])]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-"),
        publisher: one(&["PB"]),
        place: one(&["CY", "PP"]),
        edition: one(&["ET"]),
        isbn: all("SN")
            .into_iter()
            .filter(|v| !isbn_of(v).is_empty())
            .collect(),
        doi,
        url: one(&["UR", "L2"]),
        kind,
        ..Record::default()
    }
}

/// What a RIS record is called in the card: its title, or "RIS record".
pub(crate) fn ris_label(rec: &Record) -> String {
    let t = clean_text(&rec.title);
    if t.is_empty() { "RIS record".into() } else { t }
}

#[cfg(test)]
mod tests;
