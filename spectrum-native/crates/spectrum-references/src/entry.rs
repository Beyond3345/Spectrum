//! One `.bib` entry as the References card edits it (`{ type, key, fields }`) and the text it is written as,
//! for Biber or classic BibTeX (2.8's `bibEntry.js`).

use std::sync::LazyLock;

use regex::Regex;

use crate::text::{fold_ascii, re};

/// An entry before it is written: its type as the card names it, its key ('' for the suggested one) and its
/// fields in order, their values TeX already.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Draft {
    pub kind: String,
    pub key: String,
    pub fields: Vec<(String, String)>,
}

impl Draft {
    pub fn get(&self, name: &str) -> &str {
        self.fields
            .iter()
            .find(|(n, _)| n == name)
            .map_or("", |(_, v)| v.as_str())
    }

    /// Sets a field in its place, or adds it at the end.
    pub fn set(&mut self, name: &str, value: impl Into<String>) {
        let value = value.into();
        match self.fields.iter_mut().find(|(n, _)| n == name) {
            Some(slot) => slot.1 = value,
            None => self.fields.push((name.to_owned(), value)),
        }
    }

    pub fn remove(&mut self, name: &str) {
        self.fields.retain(|(n, _)| n != name);
    }
}

/// The types the card offers: id, label, and the fields it shows in order (Biber's names where BibTeX has
/// another; [`format_entry`] writes them for classic BibTeX).
pub const ENTRY_TYPES: &[(&str, &str, &[&str])] = &[
    (
        "article",
        "Article",
        &[
            "author", "title", "journal", "year", "volume", "number", "pages", "doi", "eprint",
            "url",
        ],
    ),
    (
        "inproceedings",
        "Conference paper",
        &[
            "author",
            "title",
            "booktitle",
            "year",
            "pages",
            "publisher",
            "address",
            "doi",
            "url",
        ],
    ),
    (
        "book",
        "Book",
        &[
            "author",
            "editor",
            "title",
            "edition",
            "publisher",
            "address",
            "year",
            "isbn",
            "series",
            "volume",
            "doi",
            "url",
        ],
    ),
    (
        "inbook",
        "Part of a book",
        &[
            "author",
            "title",
            "booktitle",
            "chapter",
            "pages",
            "editor",
            "edition",
            "publisher",
            "address",
            "year",
            "isbn",
        ],
    ),
    (
        "incollection",
        "Chapter in a collection",
        &[
            "author",
            "title",
            "booktitle",
            "editor",
            "chapter",
            "pages",
            "edition",
            "publisher",
            "address",
            "year",
            "isbn",
        ],
    ),
    (
        "manual",
        "Manual or datasheet",
        &[
            "title",
            "organization",
            "author",
            "version",
            "edition",
            "year",
            "url",
            "urldate",
        ],
    ),
    (
        "software",
        "Software",
        &["author", "title", "version", "year", "url", "doi"],
    ),
    (
        "online",
        "Web page",
        &["author", "title", "organization", "date", "url", "urldate"],
    ),
    (
        "report",
        "Report or standard",
        &[
            "author",
            "title",
            "type",
            "institution",
            "number",
            "year",
            "url",
            "doi",
        ],
    ),
    (
        "thesis",
        "Thesis",
        &[
            "author",
            "title",
            "type",
            "institution",
            "year",
            "url",
            "doi",
        ],
    ),
    (
        "misc",
        "Other",
        &["author", "title", "howpublished", "year", "url", "note"],
    ),
];

pub const FIELD_LABELS: &[(&str, &str)] = &[
    ("author", "Authors"),
    ("editor", "Editors"),
    ("title", "Title"),
    ("journal", "Journal"),
    ("booktitle", "Book or proceedings"),
    ("chapter", "Chapter"),
    ("edition", "Edition"),
    ("version", "Version"),
    ("type", "Kind"),
    ("year", "Year"),
    ("date", "Date"),
    ("organization", "Organisation"),
    ("volume", "Volume"),
    ("number", "Number"),
    ("series", "Series"),
    ("pages", "Pages"),
    ("publisher", "Publisher"),
    ("institution", "Institution"),
    ("school", "School"),
    ("address", "Place"),
    ("isbn", "ISBN"),
    ("doi", "DOI"),
    ("eprint", "arXiv ID"),
    ("howpublished", "How published"),
    ("url", "URL"),
    ("urldate", "Accessed"),
    ("note", "Note"),
];

/// What a field holds, shown in an empty box.
pub const FIELD_HINTS: &[(&str, &str)] = &[
    ("author", "Surname, Given and Surname, Given"),
    ("editor", "Surname, Given and …"),
    ("year", "2026"),
    ("date", "2026-11-27"),
    ("urldate", "2026-11-27"),
    ("pages", "42--45"),
    ("edition", "4"),
    ("isbn", "978-0-262-04630-5"),
    ("doi", "10.…"),
    ("url", "https://…"),
    ("eprint", "1706.03762"),
];

/// The fields shown for a type, then any other the entry holds, so nothing it writes is hidden.
pub fn fields_shown(kind: &str, fields: &[(String, String)]) -> Vec<String> {
    let own = ENTRY_TYPES
        .iter()
        .find(|(id, _, _)| *id == kind)
        .map_or(ENTRY_TYPES[ENTRY_TYPES.len() - 1].2, |t| t.2);
    let mut out: Vec<String> = own.iter().map(|s| (*s).to_owned()).collect();
    for (name, value) in fields {
        if !own.contains(&name.as_str()) && !value.trim().is_empty() {
            out.push(name.clone());
        }
    }
    out
}

/// What a key may hold: not what ends one in an entry's head, nor TeX's specials.
pub fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && !key
            .chars()
            .any(|c| c.is_whitespace() || ",{}()\"=#%~\\".contains(c))
}

fn field_name_ok(name: &str) -> bool {
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_alphanumeric() || c == '_' || c == ':' || c == '-')
}

// written as they are: TeX's specials mean nothing there
const VERBATIM: &[&str] = &[
    "url",
    "doi",
    "eprint",
    "urldate",
    "isbn",
    "issn",
    "file",
    "archiveprefix",
    "primaryclass",
    "howpublished",
];

// the order fields are written in; others follow in the order they came
const ORDER: &[&str] = &[
    "author",
    "editor",
    "title",
    "journal",
    "journaltitle",
    "booktitle",
    "chapter",
    "edition",
    "version",
    "type",
    "year",
    "date",
    "month",
    "organization",
    "volume",
    "number",
    "series",
    "pages",
    "publisher",
    "institution",
    "school",
    "location",
    "address",
    "isbn",
    "issn",
    "doi",
    "howpublished",
    "url",
    "urldate",
    "eprint",
    "archiveprefix",
    "primaryclass",
    "note",
];

static MATHS_SPLIT: LazyLock<Regex> = LazyLock::new(|| re(r"\$[^$]*\$"));

/// `& % # _` typed bare escaped (not inside `$…$`, nor one escaped already), so a hand-typed title compiles.
pub fn tex_value(name: &str, value: &str) -> String {
    if VERBATIM.contains(&name.to_ascii_lowercase().as_str()) {
        return value.to_owned();
    }
    let escape = |part: &str| {
        let mut out = String::with_capacity(part.len());
        let mut prev = None;
        for c in part.chars() {
            if "&%#_".contains(c) && prev != Some('\\') {
                out.push('\\');
            }
            out.push(c);
            prev = Some(c);
        }
        out
    };
    let mut out = String::new();
    let mut last = 0;
    for m in MATHS_SPLIT.find_iter(value) {
        out.push_str(&escape(&value[last..m.start()]));
        out.push_str(m.as_str());
        last = m.end();
    }
    out.push_str(&escape(&value[last..]));
    out
}

pub fn braces_balanced(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut depth = 0i32;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            _ => {}
        }
        i += 1;
    }
    depth == 0
}

fn rename(f: &mut Vec<(String, String)>, map: &[(&str, &str)]) {
    for (from, to) in map {
        if let Some(i) = f.iter().position(|(n, _)| n == from) {
            let (_, v) = f.remove(i);
            if !f.iter().any(|(n, _)| n == to) {
                f.insert(i, ((*to).to_owned(), v));
            }
        }
    }
}

fn get<'a>(f: &'a [(String, String)], name: &str) -> Option<&'a str> {
    f.iter().find(|(n, _)| n == name).map(|(_, v)| v.as_str())
}

fn put(f: &mut Vec<(String, String)>, name: &str, value: String) {
    match f.iter_mut().find(|(n, _)| n == name) {
        Some(slot) => slot.1 = value,
        None => f.push((name.to_owned(), value)),
    }
}

fn del(f: &mut Vec<(String, String)>, name: &str) {
    f.retain(|(n, _)| n != name);
}

static MASTER: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)master"));
static MASTER_OR_MA: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)master|^ma"));

/// How the project's `.bib` is written.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Style {
    /// Biber's types and field names (`@online`, `journaltitle`, `location`, `date`).
    pub biblatex: bool,
    /// A classic style that ignores `url`, so a web page's address goes in `howpublished`.
    pub legacy_urls: bool,
}

/// The entry as text. biblatex: Biber's types and names; otherwise classic BibTeX's (`@misc`, `@phdthesis`,
/// `journal`, `address`, `year`), an access date and a version in `note`.
pub fn format_entry(draft: &Draft, style: Style) -> String {
    let mut f: Vec<(String, String)> = draft
        .fields
        .iter()
        .filter(|(_, v)| !v.trim().is_empty())
        .map(|(n, v)| (n.clone(), tex_value(n, v.trim())))
        .collect();
    let kind = draft.kind.as_str();
    let mut head = kind.to_owned();
    if style.biblatex {
        rename(
            &mut f,
            &[
                ("journal", "journaltitle"),
                ("address", "location"),
                ("school", "institution"),
            ],
        );
        if (kind == "thesis" || kind == "report") && get(&f, "type").is_none() {
            put(
                &mut f,
                "type",
                if kind == "thesis" {
                    "phdthesis"
                } else {
                    "techreport"
                }
                .to_owned(),
            );
        }
        if kind == "thesis" && get(&f, "type").is_some_and(|t| MASTER.is_match(t)) {
            put(&mut f, "type", "mathesis".to_owned());
        }
        if let (Some(y), None) = (get(&f, "year").map(str::to_owned), get(&f, "date")) {
            put(&mut f, "date", y);
        }
        if get(&f, "date").is_some() {
            del(&mut f, "year");
        }
    } else {
        rename(
            &mut f,
            &[("journaltitle", "journal"), ("location", "address")],
        );
        if kind == "thesis" {
            head = String::from(if MASTER_OR_MA.is_match(get(&f, "type").unwrap_or("")) {
                "mastersthesis"
            } else {
                "phdthesis"
            });
            rename(&mut f, &[("institution", "school")]);
            del(&mut f, "type");
        } else {
            head = String::from(match kind {
                "online" | "software" => "misc",
                "report" => "techreport",
                other => other,
            });
        }
        if get(&f, "year").is_none()
            && let Some(d) = get(&f, "date")
                .filter(|d| d.len() >= 4 && d[..4].chars().all(|c| c.is_ascii_digit()))
        {
            let y = d[..4].to_owned();
            put(&mut f, "year", y);
        }
        let notes: Vec<String> = [
            get(&f, "version").map(|v| format!("Version {v}")),
            get(&f, "urldate").map(|v| format!("Accessed {v}")),
        ]
        .into_iter()
        .flatten()
        .collect();
        if !notes.is_empty() && get(&f, "note").is_none() {
            put(&mut f, "note", notes.join(". "));
            del(&mut f, "urldate");
        }
        if style.legacy_urls
            && (kind == "online" || kind == "software")
            && let Some(url) = get(&f, "url").map(str::to_owned)
        {
            if get(&f, "howpublished").is_none() {
                put(&mut f, "howpublished", format!("\\url{{{url}}}"));
            }
            del(&mut f, "url");
        }
    }
    let rank = |name: &str| {
        let lower = name.to_ascii_lowercase();
        ORDER
            .iter()
            .position(|o| *o == lower)
            .unwrap_or(ORDER.len())
    };
    f.sort_by_key(|(n, _)| rank(n));
    let width = f.iter().map(|(n, _)| n.chars().count()).max().unwrap_or(0);
    let lines: Vec<String> = f
        .iter()
        .map(|(n, v)| format!("  {n:<width$} = {{{v}}},"))
        .collect();
    format!("@{head}{{{},\n{}\n}}", draft.key, lines.join("\n"))
}

static AND: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\s+and\s+"));

/// First author's surname and the year, as the lookups key an entry: `Cormen2022`.
pub fn suggest_key(fields: &[(String, String)]) -> String {
    let field = |n: &str| get(fields, n).unwrap_or("");
    let names = [field("author"), field("editor"), field("organization")]
        .into_iter()
        .find(|s| !s.is_empty())
        .unwrap_or("");
    let first = AND.split(names).next().unwrap_or("").trim();
    let first = first
        .strip_prefix('{')
        .and_then(|s| s.strip_suffix('}'))
        .unwrap_or(first);
    let surname = if first.contains(',') {
        first.split(',').next().unwrap_or("")
    } else {
        first.split_whitespace().last().unwrap_or("")
    };
    let source = if surname.is_empty() {
        field("title")
            .split_whitespace()
            .find(|w| w.chars().count() > 3)
            .unwrap_or("Ref")
    } else {
        surname
    };
    let stem: String = fold_ascii(source)
        .chars()
        .filter(char::is_ascii_alphabetic)
        .collect();
    let year = [field("year"), field("date")]
        .iter()
        .find_map(|s| four_digits(s))
        .unwrap_or_default();
    let mut chars = stem.chars();
    let stem = match chars.next() {
        Some(c) => c.to_ascii_uppercase().to_string() + chars.as_str(),
        None => "Ref".to_owned(),
    };
    stem + &year
}

/// The first run of four digits in `s`.
pub(crate) fn four_digits(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    (0..bytes.len().saturating_sub(3))
        .find(|&i| bytes[i..i + 4].iter().all(u8::is_ascii_digit))
        .map(|i| s[i..i + 4].to_owned())
}

/// What stops a draft being written; empty when nothing does.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DraftProblems {
    pub key: Option<String>,
    pub kind: Option<String>,
    pub fields: Vec<(String, String)>,
}

impl DraftProblems {
    pub fn any(&self) -> bool {
        self.key.is_some() || self.kind.is_some() || !self.fields.is_empty()
    }

    /// The first problem, as the card says it.
    pub fn first(&self) -> Option<String> {
        self.key
            .clone()
            .or_else(|| self.kind.clone())
            .or_else(|| self.fields.first().map(|(n, m)| format!("{n}: {m}")))
    }
}

/// `taken`: the project's keys, lower-cased; a key of '' stands for the suggested one.
pub fn draft_problems<S: std::hash::BuildHasher>(
    draft: &Draft,
    taken: &std::collections::HashSet<String, S>,
) -> DraftProblems {
    let mut out = DraftProblems::default();
    let key = if draft.key.is_empty() {
        suggest_key(&draft.fields)
    } else {
        draft.key.clone()
    };
    if !valid_key(&key) {
        out.key = Some("A key can’t hold spaces or any of , { } ( ) \" = # % ~ \\".to_owned());
    } else if taken.contains(&key.to_lowercase()) {
        out.key = Some(format!("{key} is already used in the project"));
    }
    if draft.kind.is_empty() || !draft.kind.chars().all(|c| c.is_ascii_alphabetic()) {
        out.kind = Some("Choose an entry type".to_owned());
    }
    for (name, value) in &draft.fields {
        let problem = if !field_name_ok(name) {
            Some("Not a field name")
        } else if value.chars().count() > 20_000 {
            Some("Too long")
        } else if !braces_balanced(value) {
            Some("Each { needs its }")
        } else {
            None
        };
        if let Some(p) = problem {
            out.fields.push((name.clone(), p.to_owned()));
        }
    }
    if draft.get("title").trim().is_empty() && !out.fields.iter().any(|(n, _)| n == "title") {
        out.fields
            .push(("title".to_owned(), "Give the entry a title".to_owned()));
    }
    out
}

/// An edition of a book, as the card's Edition menu lists it.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Edition {
    pub isbn: String,
    pub year: String,
    pub publisher: String,
    pub place: String,
    pub edition: String,
    pub format: String,
    pub source: String,
}

/// "2022 · 4th ed. · MIT Press · Hardcover · 9780262046305"
pub fn edition_label(e: &Edition) -> String {
    let ordinal = match e.edition.parse::<u32>() {
        Ok(n) if n > 0 => {
            let suffix = if (11..14).contains(&(n % 100)) {
                "th"
            } else {
                match n % 10 {
                    1 => "st",
                    2 => "nd",
                    3 => "rd",
                    _ => "th",
                }
            };
            format!("{n}{suffix} ed.")
        }
        _ => e.edition.clone(),
    };
    [e.year.as_str(), &ordinal, &e.publisher, &e.format, &e.isbn]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

/// A book's draft with an edition's year, publisher, place, ISBN and edition in place of its own; the key
/// follows the year while it is still the suggested one.
pub fn apply_edition(draft: &Draft, e: &Edition) -> Draft {
    let mut next = draft.clone();
    for (name, value) in [
        ("year", &e.year),
        ("publisher", &e.publisher),
        ("address", &e.place),
        ("isbn", &e.isbn),
        ("edition", &e.edition),
    ] {
        if value.is_empty() {
            next.remove(name);
        } else {
            next.set(name, value.clone());
        }
    }
    next.key = if draft.key.is_empty() || draft.key == suggest_key(&draft.fields) {
        if draft.key.is_empty() {
            String::new()
        } else {
            suggest_key(&next.fields)
        }
    } else {
        draft.key.clone()
    };
    next
}

#[cfg(test)]
mod tests;
