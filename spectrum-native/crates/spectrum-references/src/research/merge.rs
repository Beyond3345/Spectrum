//! Results merged by DOI, arXiv id, ISBN, then title (the fullest record kept, published over preprint), and
//! marked with the `.bib` key of the work the project has (2.8's `mergeResults`, `markInBib`).

use std::fmt::Write as _;
use std::sync::LazyLock;

use regex::Regex;
use sha1::{Digest, Sha1};

use super::ResearchResult;
use crate::dedupe::{Identity, find_duplicate};
use crate::text::{normalise_title, re};

static ARXIV_DOI: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^10\.48550/arxiv\.(.+)$"));

pub(crate) fn arxiv_of_doi(doi: &str) -> String {
    ARXIV_DOI
        .captures(doi)
        .map(|c| c[1].to_owned())
        .unwrap_or_default()
}

struct Id {
    doi: String,
    arxiv: String,
    isbn: String,
    title: String,
    year: i64,
    preprint: bool,
}

fn identity(r: &ResearchResult) -> Id {
    let doi = r.doi.to_lowercase();
    let arxiv = if r.arxiv.is_empty() {
        arxiv_of_doi(&doi)
    } else {
        r.arxiv.clone()
    }
    .to_lowercase();
    Id {
        arxiv: crate::detect::strip_version(&arxiv),
        doi,
        isbn: r.isbn.clone(),
        title: normalise_title(&r.title),
        year: r.year.parse().unwrap_or(0),
        preprint: r.preprint == Some(true),
    }
}

/// The same DOI, arXiv id or ISBN, or the same title within a year where no publisher DOIs disagree.
fn same_work(a: &Id, b: &Id) -> bool {
    if (!a.doi.is_empty() && a.doi == b.doi)
        || (!a.arxiv.is_empty() && a.arxiv == b.arxiv)
        || (!a.isbn.is_empty() && a.isbn == b.isbn)
    {
        return true;
    }
    if a.title.is_empty() || a.title != b.title {
        return false;
    }
    // "Deep learning" is a book and a Nature review; a preprint's DOI and a publisher's stand for one paper
    let own = |x: &Id| {
        if x.preprint || !arxiv_of_doi(&x.doi).is_empty() {
            String::new()
        } else {
            x.doi.clone()
        }
    };
    if !own(a).is_empty() && !own(b).is_empty() && own(a) != own(b) {
        return false;
    }
    // a preprint can come out years before the paper
    a.year == 0
        || b.year == 0
        || (a.year - b.year).abs() <= if a.preprint == b.preprint { 1 } else { 3 }
}

fn filled(r: &ResearchResult) -> usize {
    let strings = [
        &r.id,
        &r.title,
        &r.year,
        &r.venue,
        &r.doi,
        &r.arxiv,
        &r.isbn,
        &r.url,
        &r.abstract_text,
        &r.open_access,
        &r.in_bib,
        &r.zotero,
        &r.decision,
        &r.reason,
        &r.why,
        &r.suggest,
        &r.theme,
        &r.note,
        &r.pdf,
    ];
    strings.iter().filter(|s| !s.is_empty()).count()
        + usize::from(!r.authors.is_empty())
        + usize::from(!r.sources.is_empty())
        + usize::from(r.citations.is_some())
        + usize::from(r.preprint.is_some())
        + r.extra.len()
}

fn pick(base: &str, other: &str) -> String {
    if base.is_empty() { other } else { base }.to_owned()
}

/// One work's two records: the fuller one's fields, the other's for its gaps, the longer abstract and author
/// list, the user's decisions from the one kept.
fn combine(old: &ResearchResult, next: &ResearchResult) -> ResearchResult {
    let (base, other) = if filled(next) > filled(old) {
        (next, old)
    } else {
        (old, next)
    };
    let mut extra = other.extra.clone();
    extra.extend(base.extra.clone());
    let mut out = ResearchResult {
        id: pick(&base.id, &other.id),
        title: pick(&base.title, &other.title),
        authors: if old.authors.len() >= next.authors.len() {
            old.authors.clone()
        } else {
            next.authors.clone()
        },
        year: pick(&base.year, &other.year),
        venue: pick(&base.venue, &other.venue),
        doi: pick(&base.doi, &other.doi),
        arxiv: pick(&base.arxiv, &other.arxiv),
        isbn: pick(&base.isbn, &other.isbn),
        url: pick(&base.url, &other.url),
        abstract_text: if old.abstract_text.chars().count() >= next.abstract_text.chars().count() {
            old.abstract_text.clone()
        } else {
            next.abstract_text.clone()
        },
        citations: old.citations.max(next.citations),
        open_access: pick(&base.open_access, &other.open_access),
        preprint: None,
        sources: old.sources.clone(),
        in_bib: pick(&base.in_bib, &other.in_bib),
        zotero: pick(&base.zotero, &other.zotero),
        decision: pick(&base.decision, &other.decision),
        reason: pick(&base.reason, &other.reason),
        why: pick(&base.why, &other.why),
        suggest: pick(&base.suggest, &other.suggest),
        theme: pick(&base.theme, &other.theme),
        note: pick(&base.note, &other.note),
        pdf: pick(&base.pdf, &other.pdf),
        extra,
    };
    for s in &next.sources {
        if !out.sources.contains(s) {
            out.sources.push(s.clone());
        }
    }
    // published once any source knows it so, and then shown as published rather than as its preprint
    let published = [old, next].into_iter().find(|r| r.preprint == Some(false));
    if let Some(p) = published.filter(|_| old.preprint == Some(true) || next.preprint == Some(true))
    {
        for (to, from) in [
            (&mut out.doi, &p.doi),
            (&mut out.venue, &p.venue),
            (&mut out.year, &p.year),
            (&mut out.url, &p.url),
        ] {
            if !from.is_empty() {
                to.clone_from(from);
            }
        }
    }
    out.preprint = if old.preprint == Some(false) || next.preprint == Some(false) {
        Some(false)
    } else if old.preprint == Some(true) || next.preprint == Some(true) {
        Some(true)
    } else {
        None
    };
    // the user's fields stay as they were
    for (to, from) in [
        (&mut out.id, &old.id),
        (&mut out.decision, &old.decision),
        (&mut out.reason, &old.reason),
        (&mut out.why, &old.why),
        (&mut out.suggest, &old.suggest),
        (&mut out.theme, &old.theme),
        (&mut out.note, &old.note),
        (&mut out.pdf, &old.pdf),
    ] {
        if !from.is_empty() {
            to.clone_from(from);
        }
    }
    out
}

fn sha1_12(text: &str) -> String {
    let digest = Sha1::digest(text.as_bytes());
    digest.iter().fold(String::new(), |mut s, b| {
        let _ = write!(s, "{b:02x}");
        s
    })[..12]
        .to_owned()
}

fn result_id(r: &ResearchResult) -> String {
    let id = identity(r);
    let basis = if !id.doi.is_empty() {
        format!("doi:{}", id.doi)
    } else if !id.arxiv.is_empty() {
        format!("arxiv:{}", id.arxiv)
    } else {
        format!("title:{}:{}", id.title, id.year)
    };
    sha1_12(&basis)
}

/// The session's results with new ones merged in: a match keeps its id and the user's decision; the others
/// come after, each with an id from what it is, so the same paper has the same id on every computer.
pub fn merge_results(
    results: &[ResearchResult],
    incoming: &[ResearchResult],
) -> Vec<ResearchResult> {
    let mut out: Vec<ResearchResult> = results.to_vec();
    for next in incoming {
        let id = identity(next);
        if let Some(mut i) = out.iter().position(|r| same_work(&identity(r), &id)) {
            out[i] = combine(&out[i], next);
            // a record that links two rows (a preprint's arXiv id and the paper's DOI) makes them one work
            let mut j = out.len();
            while j > 0 {
                j -= 1;
                if j == i || !same_work(&identity(&out[i]), &identity(&out[j])) {
                    continue;
                }
                out[i] = combine(&out[i], &out[j]);
                out.remove(j);
                if j < i {
                    i -= 1;
                }
            }
        } else {
            let mut rid = result_id(next);
            while out.iter().any(|r| r.id == rid) {
                rid = sha1_12(&rid);
            }
            let mut r = next.clone();
            r.id = rid;
            out.push(r);
        }
    }
    out
}

static CSHL: LazyLock<Regex> = LazyLock::new(|| re(r"^10\.1101/(?:\d{4}\.\d{2}\.\d{2}\.)?\d+$"));

// a DOI that names the paper itself: not a preprint's, nor arXiv's, bioRxiv's or medRxiv's
fn own_doi(doi: &str, preprint: bool) -> String {
    if preprint || !arxiv_of_doi(doi).is_empty() || CSHL.is_match(doi) {
        String::new()
    } else {
        doi.to_owned()
    }
}

/// Marks each result found in the project's `.bib` with its key, and unmarks the ones taken out since.
pub fn mark_in_bib(results: &mut [ResearchResult], index: &[Identity]) {
    for r in results.iter_mut() {
        let id = identity(r);
        let first_author = r
            .authors
            .first()
            .map(|a| {
                normalise_title(a)
                    .split(' ')
                    .next_back()
                    .unwrap_or("")
                    .to_owned()
            })
            .unwrap_or_default();
        let want = Identity {
            doi: id.doi.clone(),
            arxiv: id.arxiv.clone(),
            isbn: id.isbn.clone(),
            title: id.title.clone(),
            year: r.year.clone(),
            first_author: first_author.clone(),
            ..Identity::default()
        };
        let found = find_duplicate(index, &want).or_else(|| {
            // a preprint whose published version the .bib has, within the years a preprint may come first
            (!id.title.is_empty() && !first_author.is_empty() && id.year != 0).then_some(())?;
            index.iter().find(|e| {
                let ey: i64 = e.year.parse().unwrap_or(0);
                let (a, b) = (own_doi(&e.doi, false), own_doi(&id.doi, id.preprint));
                e.title == id.title
                    && e.first_author == first_author
                    && ey != 0
                    && (ey - id.year).abs() <= 3
                    && !(!a.is_empty() && !b.is_empty() && a != b)
            })
        });
        match found {
            Some(e) => r.in_bib.clone_from(&e.key),
            None => r.in_bib.clear(),
        }
    }
}

#[cfg(test)]
mod tests;
