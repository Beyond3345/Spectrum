//! A work's metadata as the lookups give it (CSL-JSON from doi.org, a Crossref work, a page's citation tags)
//! and how 2.8 turns one into a `.bib` entry: names, keys, types and fields (`referenceService.js`).

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

use crate::detect::{clean_doi, isbn_of, strip_version};
use crate::entry::{Draft, Style, format_entry};
use crate::text::{
    clean_text, fold_ascii, latex_to_text, normalise_title, plain_tex, re, tex_escape,
};

/// A person or a group, as CSL names them.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Name {
    pub family: String,
    pub given: String,
    /// A group ("ATLAS Collaboration") or "others" for a list cut short.
    pub literal: String,
    pub particle: String,
    pub dropping_particle: String,
    pub suffix: String,
}

impl Name {
    pub fn family(family: &str, given: &str) -> Self {
        Self {
            family: family.into(),
            given: given.into(),
            ..Self::default()
        }
    }

    pub fn literal(literal: &str) -> Self {
        Self {
            literal: literal.into(),
            ..Self::default()
        }
    }

    fn from_value(v: &Value) -> Option<Self> {
        let s = |k: &str| v.get(k).map(str_of).unwrap_or_default();
        let n = Self {
            family: s("family"),
            given: s("given"),
            literal: if s("literal").is_empty() {
                s("name")
            } else {
                s("literal")
            },
            particle: s("non-dropping-particle"),
            dropping_particle: s("dropping-particle"),
            suffix: s("suffix"),
        };
        (!n.family.is_empty() || !n.literal.is_empty() || !n.given.is_empty()).then_some(n)
    }

    fn literal_text(&self) -> String {
        clean_text(&self.literal)
    }

    fn last(&self) -> String {
        [&self.dropping_particle, &self.particle, &self.family]
            .iter()
            .filter(|s| !s.is_empty())
            .map(|s| clean_text(s))
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// The arXiv side of a work: its id without version and its primary category.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ArxivRef {
    pub id: String,
    pub primary_class: String,
}

/// A work. Fields are as the source gave them (`title` may hold tags and entities); missing ones are empty.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Record {
    /// The CSL type (`article-journal`, `webpage`, …).
    pub kind: String,
    pub title: String,
    pub author: Vec<Name>,
    pub editor: Vec<Name>,
    /// `issued`'s date parts (year, month, day); empty when unknown.
    pub issued: Vec<i64>,
    /// A year from `published-print`, `published-online`, `published` or `issued.raw`, when `issued` has none.
    pub other_year: String,
    pub container: String,
    pub volume: String,
    pub issue: String,
    pub page: String,
    pub article_number: String,
    pub number: String,
    pub publisher: String,
    pub place: String,
    pub edition: String,
    pub version: String,
    pub chapter_number: String,
    pub genre: String,
    pub doi: String,
    pub url: String,
    pub isbn: Vec<String>,
    pub categories: Vec<String>,
    pub arxiv: Option<ArxivRef>,
    /// When a web page was read (ISO 8601).
    pub accessed: String,
}

/// A JSON value as text: a string, a number, or an array's first.
pub(crate) fn str_of(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Array(a) => a.first().map(str_of).unwrap_or_default(),
        _ => String::new(),
    }
}

fn date_parts(v: Option<&Value>) -> Vec<i64> {
    v.and_then(|d| d.get("date-parts"))
        .and_then(|p| p.get(0))
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .map_while(|n| {
                    n.as_i64()
                        .or_else(|| n.as_str().and_then(|s| s.parse().ok()))
                })
                .collect()
        })
        .unwrap_or_default()
}

static YEAR4: LazyLock<Regex> = LazyLock::new(|| re(r"\d{4}"));

impl Record {
    /// A record from CSL-JSON or a Crossref work.
    pub fn from_value(v: &Value) -> Self {
        let s = |k: &str| v.get(k).map(str_of).unwrap_or_default();
        let names = |k: &str| {
            v.get(k)
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Name::from_value).collect())
                .unwrap_or_default()
        };
        let list = |k: &str| match v.get(k) {
            Some(Value::Array(a)) => a.iter().map(str_of).filter(|s| !s.is_empty()).collect(),
            Some(other) => vec![str_of(other)]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect(),
            None => Vec::new(),
        };
        let issued = date_parts(v.get("issued"));
        let other_year = ["issued", "published-print", "published-online", "published"]
            .iter()
            .find_map(|k| {
                let d = v.get(*k)?;
                let parts = date_parts(Some(d));
                let y = parts.first().map_or_else(
                    || {
                        let raw = d
                            .get("raw")
                            .or_else(|| d.get("literal"))
                            .map(str_of)
                            .unwrap_or_default();
                        YEAR4
                            .find(&raw)
                            .map(|m| m.as_str().to_owned())
                            .unwrap_or_default()
                    },
                    i64::to_string,
                );
                (y.len() == 4 && y.chars().all(|c| c.is_ascii_digit())).then_some(y)
            })
            .unwrap_or_default();
        Self {
            kind: s("type"),
            title: s("title"),
            author: names("author"),
            editor: names("editor"),
            issued,
            other_year,
            container: s("container-title"),
            volume: s("volume"),
            issue: s("issue"),
            page: s("page"),
            article_number: s("article-number"),
            number: s("number"),
            publisher: s("publisher"),
            place: s("publisher-place"),
            edition: s("edition"),
            version: s("version"),
            chapter_number: s("chapter-number"),
            genre: s("genre"),
            doi: s("DOI"),
            url: s("URL"),
            isbn: list("ISBN"),
            categories: list("categories"),
            arxiv: None,
            accessed: s("accessed"),
        }
    }

    pub fn year(&self) -> String {
        year_of(self)
    }
}

/// The year a work came out, or "".
pub fn year_of(rec: &Record) -> String {
    match rec.issued.first() {
        Some(y) if (1000..=9999).contains(y) => y.to_string(),
        _ => rec.other_year.clone(),
    }
}

static ISSUED: LazyLock<Regex> =
    LazyLock::new(|| re(r"^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?(?:$|[T\s])"));

/// A date's parts at the precision given; never a date read from a URL or a copyright year, nor 30 February.
pub fn issued_from_date(value: &str) -> Option<Vec<i64>> {
    let c = ISSUED.captures(value.trim())?;
    let parts: Vec<i64> = (1..=3)
        .filter_map(|i| c.get(i)?.as_str().parse().ok())
        .collect();
    if let Some(&m) = parts.get(1) {
        if !(1..=12).contains(&m) {
            return None;
        }
        if let Some(&d) = parts.get(2) {
            let y = parts[0];
            let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
            let days = match m {
                2 if leap => 29,
                2 => 28,
                4 | 6 | 9 | 11 => 30,
                _ => 31,
            };
            if !(1..=days).contains(&d) {
                return None;
            }
        }
    }
    Some(parts)
}

static RE_YEAR: LazyLock<Regex> = LazyLock::new(|| re(r"\b(1[5-9]\d\d|20\d\d)\b"));

/// A date as RIS and book sources give it ("2019///", "c2009"): its parts, or its year alone.
pub(crate) fn year_issued(value: &str) -> Vec<i64> {
    let text = value.trim_end_matches('/');
    issued_from_date(text)
        .or_else(|| {
            RE_YEAR
                .captures(text)
                .and_then(|c| c[1].parse().ok())
                .map(|y| vec![y])
        })
        .unwrap_or_default()
}

const GROUP_WORDS: &[&str] = &[
    "team",
    "collaboration",
    "consortium",
    "group",
    "project",
    "collective",
    "committee",
    "initiative",
];
pub(crate) const PARTICLES: &[&str] = &[
    "van", "von", "de", "der", "den", "da", "di", "du", "la", "le", "del", "della", "dos", "das",
    "ter", "ten",
];

/// "Ashish Vaswani", "Vaswani, Ashish", "Johannes van der Waals", "Gemini Team" → a name.
pub fn parse_name(raw: &str) -> Option<Name> {
    let s = clean_text(raw);
    if s.is_empty() {
        return None;
    }
    if let Some((family, rest)) = s.split_once(',') {
        return Some(Name::family(family.trim(), rest.trim()));
    }
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() > 1 && GROUP_WORDS.contains(&parts[parts.len() - 1].to_lowercase().as_str()) {
        return Some(Name::literal(&s));
    }
    if parts.len() == 1 {
        return Some(Name {
            family: parts[0].into(),
            ..Name::default()
        });
    }
    let mut i = parts.len() - 1;
    while i > 1 && parts[i - 1].chars().next().is_some_and(char::is_lowercase) {
        i -= 1;
    }
    Some(Name::family(&parts[i..].join(" "), &parts[..i].join(" ")))
}

/// `DataCite` puts particles in the given name ("Aaron van den" + "Oord"): they move to the surname.
pub fn normalise_author(a: &Name) -> Name {
    if !a.literal_text().is_empty() || !a.particle.is_empty() || a.given.is_empty() {
        return a.clone();
    }
    let words: Vec<&str> = a.given.split_whitespace().collect();
    let mut i = words.len();
    while i > 1 && PARTICLES.contains(&words[i - 1]) {
        i -= 1;
    }
    if i == words.len() {
        return a.clone();
    }
    Name {
        given: words[..i].join(" "),
        particle: words[i..].join(" "),
        ..a.clone()
    }
}

pub fn display_name(author: &Name) -> String {
    let a = normalise_author(author);
    let literal = a.literal_text();
    if !literal.is_empty() {
        return literal;
    }
    [&a.given, &a.dropping_particle, &a.particle, &a.family]
        .iter()
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(s))
        .collect::<Vec<_>>()
        .join(" ")
}

/// A name as BibTeX writes it: `van der Waals, Jr, J.`, `{OpenAI}`, `others`.
pub fn bib_name(author: &Name) -> String {
    if author.literal == "others" {
        return "others".into();
    }
    let a = normalise_author(author);
    let literal = a.literal_text();
    if !literal.is_empty() {
        return format!("{{{}}}", tex_escape(&literal, false));
    }
    let last = tex_escape(&a.last(), false);
    if a.given.is_empty() {
        return if last.contains(char::is_whitespace) {
            format!("{{{last}}}")
        } else {
            last
        };
    }
    let suffix = if a.suffix.is_empty() {
        String::new()
    } else {
        tex_escape(&a.suffix, false)
    };
    [last, suffix, tex_escape(&clean_text(&a.given), false)]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

fn letters(s: &str) -> String {
    fold_ascii(s)
        .chars()
        .filter(char::is_ascii_alphabetic)
        .collect()
}

fn capitalise(s: &str) -> String {
    let mut c = s.chars();
    c.next().map_or_else(String::new, |f| {
        f.to_uppercase().collect::<String>() + c.as_str()
    })
}

const TITLE_STOPWORDS: &[&str] = &[
    "a", "an", "the", "on", "of", "in", "for", "and", "to", "with", "from", "by", "at", "via",
    "towards", "toward",
];

/// `AuthorSurname` + Year: `Vaswani2017`, `VanderWaals1873`, `OpenAI2023`.
pub fn base_key(rec: &Record) -> String {
    let mut stem = String::new();
    if let Some(author) = rec.author.first().map(normalise_author) {
        let literal = author.literal_text();
        if literal.is_empty() {
            stem = letters(
                &[author.particle.as_str(), author.family.as_str()]
                    .iter()
                    .filter(|s| !s.is_empty())
                    .copied()
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        } else {
            let mut words: Vec<String> = fold_ascii(&literal)
                .split_whitespace()
                .map(|w| {
                    w.chars()
                        .filter(char::is_ascii_alphabetic)
                        .collect::<String>()
                })
                .filter(|w| !w.is_empty())
                .collect();
            if words.len() > 1 && words[0].eq_ignore_ascii_case("the") {
                words.remove(0);
            }
            stem = words.iter().take(2).map(|w| capitalise(w)).collect();
        }
    }
    if stem.is_empty() {
        stem = fold_ascii(&latex_to_text(&clean_text(&rec.title)))
            .split_whitespace()
            .map(|w| {
                w.chars()
                    .filter(char::is_ascii_alphabetic)
                    .collect::<String>()
            })
            .find(|w| !w.is_empty() && !TITLE_STOPWORDS.contains(&w.to_lowercase().as_str()))
            .unwrap_or_else(|| "Ref".into());
    }
    capitalise(&stem) + &year_of(rec)
}

fn suffix(n: usize) -> String {
    let letter = char::from(b'a' + u8::try_from(n % 26).unwrap_or(0));
    if n < 26 {
        letter.to_string()
    } else {
        suffix(n / 26 - 1) + &letter.to_string()
    }
}

/// The first free key: base, base+a, base+b, … (keys compare case-insensitively; `taken` is lower case).
pub fn unique_key<S: std::hash::BuildHasher>(base: &str, taken: &HashSet<String, S>) -> String {
    if !taken.contains(&base.to_lowercase()) {
        return base.to_owned();
    }
    let mut n = 0;
    loop {
        let key = format!("{base}{}", suffix(n));
        if !taken.contains(&key.to_lowercase()) {
            return key;
        }
        n += 1;
    }
}

// CSL types → the card's entry types
fn entry_type(csl: &str) -> &'static str {
    match csl {
        "journal-article" | "article-journal" | "article-magazine" | "article-newspaper" => {
            "article"
        }
        "proceedings-article" | "paper-conference" => "inproceedings",
        "book" | "monograph" | "edited-book" | "reference-book" => "book",
        "chapter" | "book-chapter" => "incollection",
        "report" => "report",
        "thesis" | "dissertation" => "thesis",
        "webpage" => "online",
        "software" => "software",
        _ => "misc",
    }
}

/// The record's DOI, an arXiv one as `10.48550/arXiv.<id>`.
pub fn doi_of(rec: &Record) -> String {
    let doi = if rec.doi.is_empty() {
        String::new()
    } else {
        clean_doi(&rec.doi)
    };
    match doi.to_lowercase().strip_prefix("10.48550/arxiv.") {
        Some(_) => format!("10.48550/arXiv.{}", &doi["10.48550/arxiv.".len()..]),
        None => doi,
    }
}

static CATEGORY: LazyLock<Regex> = LazyLock::new(|| re(r"\(([a-z-]+(?:\.[A-Za-z-]+)?)\)$"));

pub fn arxiv_of(rec: &Record) -> Option<ArxivRef> {
    if let Some(a) = &rec.arxiv {
        return Some(a.clone());
    }
    let doi = doi_of(rec);
    let id = doi.strip_prefix("10.48550/arXiv.")?;
    // DataCite lists categories like "Computation and Language (cs.CL)", primary first
    let primary_class = rec
        .categories
        .iter()
        .find_map(|c| CATEGORY.captures(c).map(|m| m[1].to_owned()))
        .unwrap_or_default();
    Some(ArxivRef {
        id: strip_version(id),
        primary_class,
    })
}

fn isbn_of_record(rec: &Record) -> String {
    rec.isbn
        .iter()
        .flat_map(|v| {
            v.split([',', ';'])
                .map(str::trim)
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .map(|v| isbn_of(&v))
        .find(|v| !v.is_empty())
        .unwrap_or_default()
}

static DASHES: LazyLock<Regex> = LazyLock::new(|| re(r"\s*[-–—]+\s*"));

/// A record → the References card's draft, its values TeX already.
#[allow(clippy::too_many_lines)]
pub fn record_to_draft(rec: &Record, key: &str) -> Draft {
    let arxiv = arxiv_of(rec);
    let mut kind = entry_type(&rec.kind);
    let preprint = arxiv.is_some() && kind == "misc";
    if preprint {
        kind = "article";
    }
    let webpage = kind == "online";
    let chapter = kind == "incollection" || kind == "inbook";
    let container = tex_escape(&clean_text(&rec.container), false);
    let doi = doi_of(rec);
    let url = arxiv.as_ref().map_or_else(
        || clean_text(&rec.url),
        |a| format!("https://arxiv.org/abs/{}", a.id),
    );
    let authors: Vec<String> = rec
        .author
        .iter()
        .map(bib_name)
        .filter(|s| !s.is_empty())
        .collect();
    let editors: Vec<String> = if !authors.is_empty() && !chapter {
        Vec::new()
    } else {
        rec.editor
            .iter()
            .map(bib_name)
            .filter(|s| !s.is_empty())
            .collect()
    };
    let plain = |v: &str| tex_escape(&clean_text(v), false);
    let mut d = Draft {
        kind: kind.into(),
        key: key.into(),
        fields: Vec::new(),
    };
    let mut add = |name: &str, value: String| {
        if !value.trim().is_empty() {
            d.fields.push((name.into(), value.trim().to_owned()));
        }
    };
    add("author", authors.join(" and "));
    add("editor", editors.join(" and "));
    let title = clean_text(&rec.title);
    add(
        "title",
        if webpage {
            plain_tex(&title, true)
        } else {
            tex_escape(&title, true)
        },
    );
    if kind == "article" {
        add(
            "journal",
            match (&arxiv, preprint) {
                (Some(a), true) => format!("arXiv preprint arXiv:{}", a.id),
                _ => container.clone(),
            },
        );
    }
    if kind == "inproceedings" || chapter {
        add("booktitle", container.clone());
    }
    add("chapter", plain(&rec.chapter_number));
    add("edition", plain(&rec.edition));
    add("version", plain(&rec.version));
    if kind == "thesis" && rec.genre.to_lowercase().contains("master") {
        add("type", "mastersthesis".into());
    }
    add("year", year_of(rec));
    if webpage {
        if rec.issued.len() > 1 {
            let date = rec
                .issued
                .iter()
                .enumerate()
                .map(|(i, n)| {
                    if i > 0 {
                        format!("{n:02}")
                    } else {
                        n.to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join("-");
            add("date", date);
        }
        let site = clean_text(if rec.publisher.is_empty() {
            &rec.container
        } else {
            &rec.publisher
        });
        if rec.author.len() != 1
            || display_name(&rec.author[0]).to_lowercase() != site.to_lowercase()
        {
            add("organization", plain(&site));
        }
    }
    add("volume", plain(&rec.volume));
    let number = if rec.issue.is_empty() && kind == "report" {
        &rec.number
    } else {
        &rec.issue
    };
    add("number", plain(number));
    let pages = if rec.page.is_empty() {
        &rec.article_number
    } else {
        &rec.page
    };
    add(
        "pages",
        DASHES.replace_all(&plain(pages), "--").into_owned(),
    );
    if !preprint {
        let name = match kind {
            "report" | "thesis" => "institution",
            "software" => "organization",
            _ => "publisher",
        };
        add(name, plain(&rec.publisher));
    }
    if kind == "book" || chapter || kind == "inproceedings" {
        add("address", plain(&rec.place));
    }
    if kind == "book" || chapter {
        add("isbn", isbn_of_record(rec));
    }
    add("doi", doi.clone());
    if webpage || arxiv.is_some() || doi.is_empty() || kind == "misc" {
        add("url", url);
    }
    // published versions keep their arXiv id too, so pasting the preprint later is a duplicate
    if let Some(a) = arxiv {
        add("eprint", a.id);
        add("archivePrefix", "arXiv".into());
        add("primaryClass", a.primary_class);
    }
    d
}

/// The entry for a record, written for Biber or classic BibTeX.
pub fn to_bibtex(rec: &Record, key: &str, style: Style) -> String {
    format_entry(&record_to_draft(rec, key), style)
}

/// A work's title, authors, year and DOI, for the card's summary line.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct Summary {
    pub title: String,
    pub authors: Vec<String>,
    pub year: String,
    pub doi: String,
}

pub fn summary_of(rec: &Record) -> Summary {
    Summary {
        title: clean_text(&rec.title),
        authors: rec
            .author
            .iter()
            .map(display_name)
            .filter(|s| !s.is_empty())
            .collect(),
        year: year_of(rec),
        doi: doi_of(rec),
    }
}

/// Last word of a surname, folded: "van den Oord" → "oord", "{`OpenAI`}" → "openai".
pub(crate) fn surname_key(name: &str) -> String {
    normalise_title(name)
        .split(' ')
        .next_back()
        .unwrap_or("")
        .to_owned()
}

const BOOK_TYPES: &[&str] = &["book", "monograph", "edited-book", "reference-book"];

/// What a record is known by, as [`crate::dedupe::bib_identity`] has it for an entry.
pub fn identity_of(rec: &Record) -> crate::dedupe::Identity {
    let author = rec.author.first().map(normalise_author);
    crate::dedupe::Identity {
        doi: doi_of(rec).to_lowercase(),
        isbn: if BOOK_TYPES.contains(&rec.kind.as_str()) {
            isbn_of_record(rec)
        } else {
            String::new()
        },
        arxiv: arxiv_of(rec)
            .map(|a| a.id.to_lowercase())
            .unwrap_or_default(),
        title: normalise_title(&clean_text(&rec.title)),
        year: year_of(rec),
        first_author: author
            .map(|a| {
                let lit = a.literal_text();
                surname_key(&if lit.is_empty() { a.last() } else { lit })
            })
            .unwrap_or_default(),
        ..crate::dedupe::Identity::default()
    }
}

#[cfg(test)]
mod tests;
