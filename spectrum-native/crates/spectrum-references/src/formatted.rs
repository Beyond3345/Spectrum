//! A reference formatted in APA, IEEE, Chicago or MLA style read into a record, nothing looked up (2.8's
//! `parseFormatted`, `splitAuthors`, `editionOf`).

use std::sync::LazyLock;

use regex::Regex;

use crate::csl::{Name, PARTICLES, Record, parse_name};
use crate::detect::{DOI_RE, clean_doi, trim_trailing};
use crate::text::{clean_text, fcaps, fre, re};

const ORDINALS: &[&str] = &[
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
];
pub(crate) const EDITION: &str = r"\(?\b(\d+)(?:st|nd|rd|th)?\s+ed(?:ition|n?\.)?(?![a-z])\)?|\(?\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+ed(?:ition|\.)?(?![a-z])\)?";

pub(crate) static EDITION_RE: LazyLock<fancy_regex::Regex> =
    LazyLock::new(|| fre(&format!("(?i){EDITION}")));
static EDITION_IN_TITLE: LazyLock<fancy_regex::Regex> =
    LazyLock::new(|| fre(&format!(r"(?i)^(.*?)[,\s]*({EDITION})(.*)$")));

fn ordinal_number(word: &str) -> String {
    ORDINALS
        .iter()
        .position(|o| o.eq_ignore_ascii_case(word))
        .map(|i| (i + 1).to_string())
        .unwrap_or_default()
}

fn edition_from(groups: &[String], first: usize) -> String {
    if groups[first].is_empty() {
        ordinal_number(&groups[first + 1])
    } else {
        groups[first].clone()
    }
}

/// "4th ed.", "(Fourth edition)" → "4".
pub fn edition_of(text: &str) -> String {
    fcaps(&EDITION_RE, text)
        .map(|g| edition_from(&g, 1))
        .unwrap_or_default()
}

static INITIALS: LazyLock<fancy_regex::Regex> =
    LazyLock::new(|| fre(r"^(?:\p{Lu}(?:\.|(?=[\s-]|$))\s?-?\s?)+$"));
static SURNAME: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"^(?:(?:van|von|de|der|den|da|di|du|la|le|del|della|dos|das|ter|ten)\s+)*\p{Lu}[\p{L}'’-]*$",
    )
});
static ET_AL: LazyLock<Regex> = LazyLock::new(|| re(r"(?i),?\s+et\s+al\.?$"));
static AND_SEP: LazyLock<Regex> = LazyLock::new(|| re(r"\s*,?\s*(?:&|\band\b)\s+"));
static TOKEN_SEP: LazyLock<Regex> = LazyLock::new(|| re(r"\s*[,;]\s*"));
static ALL_LETTERS: LazyLock<Regex> = LazyLock::new(|| re(r"^\p{L}+$"));
static ENDS_INITIAL: LazyLock<Regex> = LazyLock::new(|| re(r"\s\p{Lu}\.$"));

fn is_match(re: &fancy_regex::Regex, s: &str) -> bool {
    re.is_match(s).unwrap_or(false)
}

/// The authors of a formatted citation: APA's "Cormen, T. H., & Stein, C.", Chicago's and MLA's "Cormen,
/// Thomas H., and Clifford Stein", IEEE's "T. H. Cormen et al.".
pub fn split_authors(text: &str) -> Vec<Name> {
    let mut s = text
        .trim()
        .trim_end_matches(|c: char| c == ',' || c == ';' || c == ':' || c.is_whitespace())
        .to_owned();
    // a final full stop goes, but not an initial's
    if s.ends_with('.') {
        let before: Vec<char> = s[..s.len() - 1].chars().rev().take(2).collect();
        let initial = before.first().is_some_and(|c| c.is_uppercase())
            && before
                .get(1)
                .is_none_or(|c| c.is_whitespace() || *c == '.' || *c == '-');
        if !initial {
            s.pop();
        }
    }
    let et_al = ET_AL.is_match(&s);
    let s = ET_AL.replace(&s, "");
    let joined = AND_SEP.replace_all(&s, ", ");
    let tokens: Vec<&str> = TOKEN_SEP.split(&joined).filter(|t| !t.is_empty()).collect();
    let mut names = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        let next = tokens.get(i + 1);
        let pair = SURNAME.is_match(tokens[i])
            && next.is_some_and(|n| {
                is_match(&INITIALS, n)
                    || (i == 0 && (ALL_LETTERS.is_match(n) || ENDS_INITIAL.is_match(n)))
            });
        if let (true, Some(n)) = (pair, next) {
            names.push(Name::family(tokens[i], n));
            i += 2;
            continue;
        }
        if let Some(n) = parse_name(tokens[i]) {
            names.push(n);
        }
        i += 1;
    }
    if et_al {
        names.push(Name::literal("others"));
    }
    names
}

static NOT_FULL_STOP: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?:^|[\s(])(?:\p{Lu}|vs|Vol|vol|No|no|ed|eds|Ed|Eds|Proc|pp|p|Jr|St)$"));

/// Text up to the first full stop, ? or ! that ends a sentence (not an initial's, "ed.", "pp.", nor one in
/// brackets), and what follows.
pub(crate) fn first_sentence(text: &str) -> (String, String) {
    let s = text.trim();
    let mut depth = 0i32;
    for (i, c) in s.char_indices() {
        match c {
            '(' | '[' => depth += 1,
            ')' | ']' => depth -= 1,
            '.' | '?' | '!' if depth <= 0 => {
                let after = &s[i + 1..];
                let ends = after.is_empty() || after.starts_with(char::is_whitespace);
                if ends && !(c == '.' && NOT_FULL_STOP.is_match(&s[..i])) {
                    let head = if c == '.' { &s[..i] } else { &s[..=i] };
                    return (head.trim().to_owned(), after.trim().to_owned());
                }
            }
            _ => {}
        }
    }
    (s.to_owned(), String::new())
}

static PROCEEDINGS: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"(?i)\b(?:proc\.?|proceedings|conference|symposium|workshop|congress|meeting)\b|advances in neural",
    )
});
static NUMBERING: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*(?:\[\d+\]|\(\d+\)|\d+\.)\s+"));
static URL_IN: LazyLock<Regex> = LazyLock::new(|| re(r"https?://\S+"));
static LINKS: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"(?i)\s*(?:\[Online\]\.?\s*)?(?:(?:Retrieved from|Available(?: at)?:?)\s*)?(?:https?://\S+|doi:\s*\S+)",
    )
});
static TRAIL: LazyLock<Regex> = LazyLock::new(|| re(r"[\s,]+$"));
static QUOTED: LazyLock<Regex> =
    LazyLock::new(|| re(r#"^(.*?)[“"]([^”"]{3,}?)[,.]?[”"][.,]?\s*(.*)$"#));
static APA: LazyLock<Regex> =
    LazyLock::new(|| re(r"^(.+?)\s*\((1[5-9]\d\d|20\d\d)[a-z]?(?:,[^)]*)?\)\.?\s+(.+)$"));
static CHICAGO: LazyLock<Regex> =
    LazyLock::new(|| re(r"^(.+?)\.\s+(1[5-9]\d\d|20\d\d)[a-z]?\.\s+(.+)$"));
static YEAR_AFTER_AUTHORS: LazyLock<Regex> =
    LazyLock::new(|| re(r"[.,]\s*(1[5-9]\d\d|20\d\d)[a-z]?\.?\s*$"));
static IEEE_AUTHOR: LazyLock<Regex> =
    LazyLock::new(|| re(r"^(?:and\s+)?(?:\p{Lu}\.\s?-?)+\s*\p{Lu}[\p{L}'’-]+(?:\s+et\s+al\.?)?$"));
static COMMA_SPACE: LazyLock<Regex> = LazyLock::new(|| re(r",\s+"));
static TITLE_TRAIL: LazyLock<Regex> = LazyLock::new(|| re(r"[.,:;\s]+$"));
static TWO_LETTERS: LazyLock<Regex> = LazyLock::new(|| re(r"\p{L}{2}"));
static NAME_WORD: LazyLock<Regex> = LazyLock::new(|| re(r"^[\p{Lu}'’]"));

/// The rest of a citation, with what each `take` found cut out of it.
struct Rest(String);

impl Rest {
    fn take(&mut self, re: &Regex) -> Option<Vec<String>> {
        let c = re.captures(&self.0)?;
        let m = c.get(0)?;
        let groups = (0..c.len())
            .map(|i| c.get(i).map_or(String::new(), |g| g.as_str().to_owned()))
            .collect();
        self.0 = format!("{} {}", &self.0[..m.start()], &self.0[m.end()..]);
        Some(groups)
    }

    fn take_fancy(&mut self, re: &fancy_regex::Regex) -> Option<Vec<String>> {
        let c = re.captures(&self.0).ok().flatten()?;
        let m = c.get(0)?;
        let groups = (0..c.len())
            .map(|i| c.get(i).map_or(String::new(), |g| g.as_str().to_owned()))
            .collect();
        self.0 = format!("{} {}", &self.0[..m.start()], &self.0[m.end()..]);
        Some(groups)
    }
}

static PAGES: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\bpp?\.\s*(\d+(?:\s*[-–—]+\s*\d+)?)"));
static VOLUME: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\bvol(?:ume)?\.?\s*(\d+)"));
static ISSUE: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(?:no|iss(?:ue)?)\.?\s*(\d+)"));
static VOL_ISSUE: LazyLock<Regex> = LazyLock::new(|| re(r",\s*(\d+)\s*\((\d+(?:[-–]\d+)?)\)"));
static RANGE: LazyLock<Regex> = LazyLock::new(|| re(r"(\d+)\s*[-–—]+\s*(\d+)"));
static YEAR: LazyLock<Regex> = LazyLock::new(|| re(r"\b(1[5-9]\d\d|20\d\d)[a-z]?\b"));
static THESIS: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?i)\b(Ph\.?\s?D\.?|Doctoral|Master'?s|M\.?S(?:c)?\.?)\s+(?:thesis|dissertation)\b")
});
static REPORT: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)\bTech(?:nical|\.)?\s+Rep(?:ort|\.)?(?:\s+no\.)?"));
static IN_PART: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^\s*,?\s*In:?\s+"));
static EDITORS: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^\s*(.+?)\s*\((?:Eds?|Hrsg)\.?\),\s*"));
static EDITED_BY: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)^\s*(?:edited by|ed\.\s+by)\s+(.+?),\s*"));
static PLACE: LazyLock<Regex> =
    LazyLock::new(|| re(r"([\p{L} .'-]+?(?:,\s*\p{Lu}{2}(?:,\s*USA)?)?)\s*:\s*(\p{L}[^,.;:()]*)"));
static BARE_VOLUME: LazyLock<Regex> = LazyLock::new(|| re(r",\s*(\d+)[\s,]*$"));
static EMPTY_BRACKETS: LazyLock<Regex> = LazyLock::new(|| re(r"\(\s*\)"));
static PART_SEP: LazyLock<Regex> = LazyLock::new(|| re(r"\s*[,;:]\s*"));
static VOLUME_AT_END: LazyLock<Regex> = LazyLock::new(|| re(r"^(.*\D)\s+(\d+)$"));
static MASTER: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)master|m\.?s"));

/// A reference formatted in APA, IEEE, Chicago or MLA style → what it says, or `None` when the text doesn't
/// read as one (a bare title, a sentence).
#[allow(clippy::too_many_lines)]
pub fn parse_formatted(raw: &str) -> Option<Record> {
    let s = clean_text(raw);
    let s = NUMBERING.replace(&s, "").replace(['‘', '’'], "'");
    let doi = DOI_RE.captures(&s).map(|c| c[1].to_owned());
    let url = URL_IN.find(&s).map(|m| m.as_str().to_owned());
    let s = LINKS.replace_all(&s, "");
    let s = TRAIL.replace(&s, "").trim().to_owned();
    let (mut authors_text, mut title, mut rest): (String, String, String);
    let mut year = String::new();
    if let Some(q) = QUOTED.captures(&s).filter(|q| !q[1].trim().is_empty()) {
        authors_text = q[1].to_owned();
        title = q[2].to_owned();
        rest = q[3].to_owned();
        // Chicago author-date puts the year after the authors
        if let Some(y) = YEAR_AFTER_AUTHORS.captures(&authors_text) {
            y[1].clone_into(&mut year);
            let at = y.get(0).map_or(authors_text.len(), |m| m.start());
            authors_text.truncate(at);
        }
    } else if let Some(c) = APA.captures(&s).or_else(|| CHICAGO.captures(&s)) {
        authors_text = c[1].to_owned();
        c[2].clone_into(&mut year);
        (title, rest) = first_sentence(&c[3]);
    } else {
        // IEEE: authors with initials first, then the title after a comma; else MLA and Chicago's bibliography
        let tokens: Vec<&str> = COMMA_SPACE.split(&s).collect();
        let mut n = 0;
        while n + 1 < tokens.len() && IEEE_AUTHOR.is_match(tokens[n]) {
            n += 1;
        }
        if n > 0 {
            authors_text = tokens[..n].join(", ");
            (title, rest) = first_sentence(&tokens[n..].join(", "));
        } else {
            let after;
            (authors_text, after) = first_sentence(&s);
            (title, rest) = first_sentence(&after);
        }
    }
    // an edition written into the title ("Introduction to algorithms (4th ed.)")
    if let Some(g) = fcaps(&EDITION_IN_TITLE, &title) {
        rest = format!("{} {} {rest}", g[2], g[g.len() - 1])
            .trim()
            .to_owned();
        title.clone_from(&g[1]);
    }
    let title = TITLE_TRAIL.replace(&title, "").trim().to_owned();
    let authors = split_authors(&authors_text);
    // a name has at most four words, each capitalised but its particles: anything else is a sentence or a title
    let not_a_name = |a: &Name| {
        let joined = format!("{} {}", a.given, a.family);
        let words: Vec<&str> = joined.split_whitespace().collect();
        words.len() > 4
            || words
                .iter()
                .any(|w| !NAME_WORD.is_match(w) && !PARTICLES.contains(w))
    };
    if !TWO_LETTERS.is_match(&title)
        || authors.is_empty()
        || authors
            .iter()
            .any(|a| a.literal.is_empty() && not_a_name(a))
    {
        return None;
    }

    let mut rec = Record::default();
    let mut r = Rest(format!(" {} ", rest.strip_suffix('.').unwrap_or(&rest)));
    if let Some(g) = r.take_fancy(&EDITION_RE) {
        rec.edition = edition_from(&g, 1);
    }
    if let Some(g) = r.take(&PAGES) {
        rec.page.clone_from(&g[1]);
    }
    if let Some(g) = r.take(&VOLUME) {
        rec.volume.clone_from(&g[1]);
    }
    if let Some(g) = r.take(&ISSUE) {
        rec.issue.clone_from(&g[1]);
    }
    if let Some(g) = r.take(&VOL_ISSUE) {
        rec.volume.clone_from(&g[1]);
        rec.issue.clone_from(&g[2]);
    }
    if rec.page.is_empty()
        && let Some(g) = r.take(&RANGE)
    {
        rec.page = format!("{}-{}", g[1], g[2]);
    }
    if let Some(g) = r.take(&YEAR)
        && year.is_empty()
    {
        year.clone_from(&g[1]);
    }
    let thesis = r.take(&THESIS);
    let report = r.take(&REPORT);
    let mut editors = Vec::new();
    let in_part = r.take(&IN_PART).is_some();
    if in_part {
        if let Some(g) = r.take(&EDITORS) {
            editors = split_authors(&g[1]);
        }
        if let Some(g) = r.take(&EDITED_BY) {
            editors = split_authors(&g[1]);
        }
    }
    let (mut place, mut publisher) = (String::new(), String::new());
    if let Some(g) = r.take(&PLACE) {
        g[1].trim().clone_into(&mut place);
        g[2].trim().clone_into(&mut publisher);
    }
    // APA's bare volume: "Journal, 30, 5998–6008"
    if rec.volume.is_empty()
        && let Some(g) = r.take(&BARE_VOLUME)
    {
        rec.volume.clone_from(&g[1]);
    }
    let mut parts: Vec<String> = Vec::new();
    let mut left = EMPTY_BRACKETS
        .replace_all(&r.0, " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    while !left.is_empty() {
        let (sentence, after) = first_sentence(&left);
        parts.extend(PART_SEP.split(&sentence).map(str::to_owned));
        left = after;
    }
    parts.retain(|p| {
        !p.trim().is_empty() && !p.chars().all(|c| c.is_ascii_digit() || c.is_whitespace())
    });

    let mut container = String::new();
    let last = parts.last().cloned().unwrap_or_default();
    let kind = if thesis.is_some() {
        if publisher.is_empty() {
            publisher.clone_from(&last);
        }
        "thesis"
    } else if report.is_some() {
        if publisher.is_empty() {
            publisher = parts.first().cloned().unwrap_or_default();
        }
        "report"
    } else if in_part {
        container = parts.first().cloned().unwrap_or_default();
        if publisher.is_empty() && parts.len() > 1 {
            publisher.clone_from(&last);
        }
        if PROCEEDINGS.is_match(&container) {
            "paper-conference"
        } else {
            "chapter"
        }
    } else if !parts.is_empty()
        && (!rec.volume.is_empty() || !rec.issue.is_empty() || !rec.page.is_empty())
        && rec.edition.is_empty()
    {
        container.clone_from(&parts[0]);
        // Chicago: "Nature 521, no. 7553"
        if let Some(v) = VOLUME_AT_END.captures(&container.clone())
            && rec.volume.is_empty()
        {
            v[1].clone_into(&mut container);
            v[2].clone_into(&mut rec.volume);
        }
        if PROCEEDINGS.is_match(&container) {
            "paper-conference"
        } else {
            "article-journal"
        }
    } else {
        if publisher.is_empty() {
            publisher.clone_from(&last);
        }
        "book"
    };
    if year.is_empty() {
        return None;
    }
    rec.kind = kind.into();
    rec.title = title;
    rec.author = authors;
    rec.editor = editors;
    rec.issued = year.parse().map(|y| vec![y]).unwrap_or_default();
    rec.container = container;
    rec.publisher = publisher;
    rec.place = place;
    if let Some(t) = thesis
        && MASTER.is_match(&t[1])
    {
        rec.genre = "Master's thesis".into();
    }
    match (doi, url) {
        (Some(d), _) => rec.doi = clean_doi(&d),
        (None, Some(u)) => rec.url = trim_trailing(&u),
        _ => {}
    }
    Some(rec)
}

#[cfg(test)]
mod tests;
