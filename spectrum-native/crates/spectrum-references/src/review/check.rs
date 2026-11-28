//! Verify citations: each `.bib` entry looked up where its identifier says (Crossref or doi.org for a DOI,
//! arXiv for an arXiv id, OpenAlex for a title alone) and compared with its record by code, retractions read
//! from Crossref's updates and OpenAlex's flag (2.8's `referenceCheck.js` and `referenceMatch.js`). No model.

use std::sync::LazyLock;

use futures::StreamExt;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;

use crate::bibtex::BibEntry;
use crate::csl::{Record, str_of, summary_of, year_of};
use crate::dedupe::bib_identity;
use crate::detect::{Item, ItemKind};
use crate::error::RefError;
use crate::http::{encode_component, encode_doi, query};
use crate::resolve::Resolver;
use crate::text::{latex_to_text, normalise_title, re, squash};

/// A publisher's mark before a retracted work's title ("RETRACTED: …").
static RETRACTED_MARK: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)^\s*(?:retracted|withdrawn)(?:\s+article)?\s*[:.–—-]\s*"));

fn words(title: &str) -> Vec<String> {
    normalise_title(&RETRACTED_MARK.replace(title, ""))
        .split(' ')
        .filter(|w| !w.is_empty())
        .map(str::to_owned)
        .collect()
}

static SUBTITLE: LazyLock<Regex> = LazyLock::new(|| re(r"\s*[:–—]\s+|\s+-\s+|[?!.]\s+"));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Level {
    Same,
    Close,
    Near,
    Differs,
}

/// 'same' once normalised, 'close' when most words are shared (Dice 0.8) or one is the other with a subtitle.
pub(crate) fn title_level(a: &str, b: &str) -> Level {
    let (x, y) = (words(a), words(b));
    if x.is_empty() || y.is_empty() {
        return Level::Differs;
    }
    if x == y {
        return Level::Same;
    }
    let (short, long, long_title) = if x.len() <= y.len() {
        (&x, &y, b)
    } else {
        (&y, &x, a)
    };
    if short.len() >= 3 && words(SUBTITLE.split(long_title).next().unwrap_or("")) == *short {
        return Level::Close;
    }
    let short_set: std::collections::HashSet<&String> = short.iter().collect();
    let long_set: std::collections::HashSet<&String> = long.iter().collect();
    let shared = short_set.iter().filter(|w| long_set.contains(*w)).count();
    if 2 * shared * 10 >= 8 * (short_set.len() + long_set.len()) {
        Level::Close
    } else {
        Level::Differs
    }
}

/// The surname of a name as a `.bib`, a record or a model writes it, folded.
pub(crate) fn surname(name: &str) -> String {
    let text = latex_to_text(name).replace(['{', '}'], "");
    let text = text.trim();
    let family = if text.contains(',') {
        text.split(',').next().unwrap_or("")
    } else {
        text
    };
    normalise_title(family)
        .split(' ')
        .next_back()
        .unwrap_or("")
        .to_owned()
}

static AND: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\s+and\s+"));

fn first_author_of(field: &str) -> String {
    surname(AND.split(field).next().unwrap_or(""))
}

struct Compared {
    title: Level,
    author: Option<Level>,
    year: Option<Level>,
}

fn compare(want: (&str, &str, &str), got: (&str, &str, &str)) -> Compared {
    let author = (!want.1.is_empty() && !got.1.is_empty()).then(|| {
        if want.1 == got.1 {
            Level::Same
        } else {
            Level::Differs
        }
    });
    let year = match (want.2.parse::<i64>(), got.2.parse::<i64>()) {
        (Ok(a), Ok(b)) => Some(match (a - b).abs() {
            0 => Level::Same,
            1 => Level::Near,
            _ => Level::Differs,
        }),
        _ => None,
    };
    Compared {
        title: title_level(want.0, got.0),
        author,
        year,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CheckStatus {
    Found,
    Differs,
    NotFound,
    Retracted,
    Unchecked,
}

/// Where a record was read: a page the user can open.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct ReadAt {
    pub from: String,
    pub url: String,
}

/// A retraction or a notice on a work.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[allow(clippy::struct_field_names)]
pub struct Notice {
    pub label: String,
    pub date: String,
    pub notice: String,
    pub url: String,
    pub from: String,
}

/// The record read, briefly.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Brief {
    pub title: String,
    pub authors: Vec<String>,
    pub year: String,
    pub doi: String,
    pub venue: String,
}

/// One entry against its record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CheckRow {
    pub key: String,
    pub file: String,
    pub line: usize,
    pub title: String,
    pub status: CheckStatus,
    pub read: Option<ReadAt>,
    pub record: Option<Brief>,
    /// (field, the .bib's, the record's)
    pub differences: Vec<(String, String, String)>,
    pub retraction: Option<Notice>,
    pub notices: Vec<Notice>,
    pub note: String,
}

const WITHDRAWN: &[&str] = &["retraction", "withdrawal", "removal", "partial_retraction"];
const NOTICES: &[&str] = &[
    "correction",
    "erratum",
    "expression_of_concern",
    "addendum",
    "corrigendum",
];

fn label(kind: &str) -> String {
    match kind {
        "expression_of_concern" => "Expression of concern".into(),
        "partial_retraction" => "Partial retraction".into(),
        other => {
            let mut c = other.chars();
            c.next().map_or_else(String::new, |f| {
                f.to_uppercase().collect::<String>() + c.as_str()
            })
        }
    }
}

fn date_of(v: Option<&Value>) -> String {
    v.and_then(|d| d.pointer("/date-parts/0"))
        .and_then(Value::as_array)
        .map(|p| {
            p.iter()
                .filter_map(Value::as_i64)
                .enumerate()
                .map(|(i, n)| {
                    if i > 0 {
                        format!("{n:02}")
                    } else {
                        n.to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join("-")
        })
        .unwrap_or_default()
}

fn plain(s: &str) -> String {
    squash(&latex_to_text(s).replace(['{', '}'], ""))
}

fn brief(rec: &Record) -> Brief {
    let meta = summary_of(rec);
    Brief {
        title: meta.title,
        authors: meta.authors.into_iter().take(3).collect(),
        year: year_of(rec),
        doi: meta.doi,
        venue: plain(&rec.container),
    }
}

/// Crossref's updates of a work: the first that withdraws it, and the notices.
fn updates_of(work: &Value) -> (Option<Notice>, Vec<Notice>) {
    let all: Vec<&Value> = work
        .get("updated-by")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|u| u.get("type").is_some())
        .collect();
    let notice = |u: &Value, from: &str| {
        let kind = u.get("type").map(str_of).unwrap_or_default();
        let doi = u.get("DOI").map(str_of).unwrap_or_default();
        Notice {
            label: u
                .get("label")
                .map(str_of)
                .filter(|l| !l.is_empty())
                .unwrap_or_else(|| label(&kind)),
            date: date_of(u.get("updated")),
            url: if doi.is_empty() {
                String::new()
            } else {
                format!("https://doi.org/{doi}")
            },
            notice: doi,
            from: from.into(),
        }
    };
    let retraction = all
        .iter()
        .find(|u| WITHDRAWN.contains(&u.get("type").map(str_of).unwrap_or_default().as_str()))
        .map(|u| {
            let from = if u.get("source").map(str_of).as_deref() == Some("retraction-watch") {
                "Retraction Watch, through Crossref"
            } else {
                "the publisher, through Crossref"
            };
            notice(u, from)
        });
    let notices = all
        .iter()
        .filter(|u| NOTICES.contains(&u.get("type").map(str_of).unwrap_or_default().as_str()))
        .map(|u| notice(u, ""))
        .collect();
    (retraction, notices)
}

fn row(entry: &BibEntry, file: &str, line: usize, status: CheckStatus) -> CheckRow {
    CheckRow {
        key: entry.key.clone(),
        file: file.into(),
        line,
        title: plain(entry.get("title")),
        status,
        read: None,
        record: None,
        differences: Vec::new(),
        retraction: None,
        notices: Vec::new(),
        note: String::new(),
    }
}

/// A row from the record read: the fields that differ, and found, differs or retracted.
fn finish(
    mut r: CheckRow,
    want: (&str, &str, &str),
    record: Brief,
    read: ReadAt,
    retraction: Option<Notice>,
    notices: Vec<Notice>,
) -> CheckRow {
    let first = record
        .authors
        .first()
        .map(|a| surname(a))
        .unwrap_or_default();
    let cmp = compare(want, (&record.title, &first, &record.year));
    if cmp.title == Level::Differs {
        r.differences
            .push(("title".into(), want.0.into(), record.title.clone()));
    }
    if cmp.author == Some(Level::Differs) {
        r.differences.push((
            "first author".into(),
            want.1.into(),
            record.authors.first().cloned().unwrap_or_default(),
        ));
    }
    if cmp.year == Some(Level::Differs) {
        r.differences
            .push(("year".into(), want.2.into(), record.year.clone()));
    }
    // a title marked RETRACTED by its publisher, where no update says so
    let marked = (retraction.is_none() && RETRACTED_MARK.is_match(&record.title)).then(|| Notice {
        label: "Retracted".into(),
        from: format!("the title {} gives it", read.from),
        url: read.url.clone(),
        ..Notice::default()
    });
    let small: Vec<&str> = [
        (cmp.title == Level::Close).then_some("The title differs a little (a subtitle, a word)."),
        (cmp.year == Some(Level::Near)).then_some(
            "The year is a year apart (a preprint and its paper, or online and in print).",
        ),
    ]
    .into_iter()
    .flatten()
    .collect();
    r.retraction = retraction.or(marked);
    r.status = if r.retraction.is_some() {
        CheckStatus::Retracted
    } else if r.differences.is_empty() {
        CheckStatus::Found
    } else {
        CheckStatus::Differs
    };
    r.read = Some(read);
    r.record = Some(record);
    r.notices = notices;
    r.note = [r.note.as_str()]
        .into_iter()
        .chain(small)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    r
}

/// One entry checked: `file` and `line` say where it is, for click-to-jump.
pub async fn check_entry(
    resolver: &Resolver,
    entry: &BibEntry,
    file: &str,
    line: usize,
) -> CheckRow {
    let id = bib_identity(entry, file);
    let title = plain(entry.get("title"));
    let author_field = if entry.get("author").is_empty() {
        entry.get("editor")
    } else {
        entry.get("author")
    };
    let author = first_author_of(author_field);
    let want = (title.as_str(), author.as_str(), id.year.as_str());
    let mut r = row(entry, file, line, CheckStatus::Unchecked);
    match check_inner(resolver, &id, want, r.clone(), !entry.get("url").is_empty()).await {
        Ok(done) => done,
        Err((read, e)) => {
            r.read = read;
            r.note = format!("The lookup failed: {e}");
            r
        }
    }
}

#[allow(clippy::too_many_lines, clippy::result_large_err)]
async fn check_inner(
    resolver: &Resolver,
    id: &crate::dedupe::Identity,
    want: (&str, &str, &str),
    mut r: CheckRow,
    has_url: bool,
) -> Result<CheckRow, (Option<ReadAt>, RefError)> {
    let http = &resolver.http;
    if !id.doi.is_empty() {
        let read = ReadAt {
            from: "Crossref".into(),
            url: format!("https://doi.org/{}", id.doi),
        };
        let res = http
            .get(
                &format!("{}/works/{}", http.endpoints.crossref, encode_doi(&id.doi)),
                "application/json",
            )
            .await
            .map_err(|e| (None, e))?;
        let (record, read, mut retraction, notices) = if res.status == 404 {
            let read = ReadAt {
                from: "doi.org".into(),
                url: format!("https://doi.org/{}", id.doi),
            };
            let item = Item::new(ItemKind::Doi, &id.doi, &id.doi);
            match resolver.record_for(&item).await {
                Ok(rec) => (rec, read, None, Vec::new()),
                Err(RefError::NotFound(_)) => {
                    r.status = CheckStatus::NotFound;
                    r.note = format!(
                        "No registry knows the DOI {}: neither Crossref nor doi.org has a record of it.",
                        id.doi
                    );
                    r.read = Some(read);
                    return Ok(r);
                }
                Err(e) => return Err((Some(read), e)),
            }
        } else if !res.ok() {
            return Err((
                Some(read),
                RefError::Lookup(format!("Crossref answered {}.", res.status)),
            ));
        } else {
            let work = res
                .json()
                .and_then(|v| v.get("message").cloned())
                .unwrap_or(Value::Null);
            let (retraction, notices) = updates_of(&work);
            // the DOI cited is a retraction notice's own
            if let Some(n) = work
                .get("update-to")
                .and_then(Value::as_array)
                .and_then(|a| {
                    a.iter().find(|u| {
                        WITHDRAWN.contains(&u.get("type").map(str_of).unwrap_or_default().as_str())
                    })
                })
            {
                let what = n
                    .get("label")
                    .map(str_of)
                    .filter(|l| !l.is_empty())
                    .unwrap_or_else(|| label(&n.get("type").map(str_of).unwrap_or_default()));
                r.note = format!(
                    "This DOI is the {} notice of {}, not the work itself.",
                    what.to_lowercase(),
                    n.get("DOI").map(str_of).unwrap_or_default()
                );
            }
            (Record::from_value(&work), read, retraction, notices)
        };
        if retraction.is_none() {
            let url = format!(
                "{}/works/doi:{}?select=id,is_retracted",
                http.endpoints.openalex,
                encode_doi(&id.doi)
            );
            if http
                .get_json(&url, &[], None)
                .await
                .ok()
                .and_then(|v| v.get("is_retracted").and_then(Value::as_bool))
                == Some(true)
            {
                retraction = Some(Notice {
                    label: "Retracted".into(),
                    from: "OpenAlex".into(),
                    url: format!("https://doi.org/{}", id.doi),
                    ..Notice::default()
                });
            }
        }
        return Ok(finish(r, want, brief(&record), read, retraction, notices));
    }
    if !id.arxiv.is_empty() {
        let read = ReadAt {
            from: "arXiv".into(),
            url: format!("https://arxiv.org/abs/{}", id.arxiv),
        };
        return match resolver.record_from_arxiv(&id.arxiv).await {
            Ok(rec) => Ok(finish(r, want, brief(&rec), read, None, Vec::new())),
            Err(RefError::NotFound(_)) => {
                r.status = CheckStatus::NotFound;
                r.note = format!("arXiv has no paper {}.", id.arxiv);
                r.read = Some(read);
                Ok(r)
            }
            Err(e) => Err((Some(read), e)),
        };
    }
    if !want.0.is_empty() {
        let title: String = want.0.chars().take(300).collect();
        let url = format!(
            "{}/works?{}",
            http.endpoints.openalex,
            query(&[
                ("search", &title),
                ("per_page", "5"),
                (
                    "select",
                    "id,doi,display_name,publication_year,authorships,is_retracted,primary_location"
                )
            ])
        );
        let search = ReadAt {
            from: "OpenAlex, by title".into(),
            url: format!(
                "https://openalex.org/works?search={}",
                encode_component(&want.0.chars().take(200).collect::<String>())
            ),
        };
        let data = http
            .get_json(&url, &[], None)
            .await
            .map_err(|e| (Some(search.clone()), e))?;
        let works: Vec<(Brief, bool, String)> = data
            .get("results")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|w| {
                let s = |p: &str| w.pointer(p).map(str_of).unwrap_or_default();
                let b = Brief {
                    title: s("/display_name"),
                    authors: w
                        .get("authorships")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .map(|a| {
                            a.pointer("/author/display_name")
                                .map(str_of)
                                .unwrap_or_default()
                        })
                        .filter(|a| !a.is_empty())
                        .collect(),
                    year: s("/publication_year"),
                    doi: s("/doi").trim_start_matches("https://doi.org/").to_owned(),
                    venue: s("/primary_location/source/display_name"),
                };
                (
                    b,
                    w.get("is_retracted").and_then(Value::as_bool) == Some(true),
                    s("/id"),
                )
            })
            .collect();
        let fits = |b: &Brief| {
            compare(
                want,
                (
                    &b.title,
                    &b.authors.first().map(|a| surname(a)).unwrap_or_default(),
                    &b.year,
                ),
            )
        };
        let best = works
            .iter()
            .find(|(b, _, _)| {
                let c = fits(b);
                c.title != Level::Differs && c.author != Some(Level::Differs)
            })
            .or_else(|| {
                works
                    .iter()
                    .find(|(b, _, _)| fits(b).title != Level::Differs)
            });
        let Some((b, retracted, url)) = best else {
            r.status = CheckStatus::NotFound;
            r.read = Some(search);
            r.note = "OpenAlex has no work with this title. Give the entry a DOI or an arXiv id if it has one, or check the title.".into();
            return Ok(r);
        };
        let retraction = retracted.then(|| Notice {
            label: "Retracted".into(),
            from: "OpenAlex".into(),
            url: if b.doi.is_empty() {
                url.clone()
            } else {
                format!("https://doi.org/{}", b.doi)
            },
            ..Notice::default()
        });
        let mut b = b.clone();
        b.authors.truncate(3);
        return Ok(finish(
            r,
            want,
            b,
            ReadAt {
                from: "OpenAlex, by title".into(),
                url: url.clone(),
            },
            retraction,
            Vec::new(),
        ));
    }
    r.note = if has_url {
        "A web page with no DOI or title to look up: open its link to check it."
    } else {
        "This entry has no DOI, arXiv id or title to look up."
    }
    .into();
    Ok(r)
}

// ponytail: a bibliography of more than 300 entries is checked in its first 300; the rest are listed as not checked
const MAX_ENTRIES: usize = 300;

/// Every entry (with its file and line), four at a time; past the first 300 they are listed as not checked.
pub async fn check_references(
    resolver: &Resolver,
    entries: &[(BibEntry, String, usize)],
) -> Vec<CheckRow> {
    let checked = entries
        .iter()
        .take(MAX_ENTRIES)
        .map(|(e, f, l)| check_entry(resolver, e, f, *l));
    let mut rows: Vec<CheckRow> = futures::stream::iter(checked).buffered(4).collect().await;
    rows.extend(entries.iter().skip(MAX_ENTRIES).map(|(e, f, l)| CheckRow {
        note: format!("Only the first {MAX_ENTRIES} entries are checked at a time."),
        ..row(e, f, *l, CheckStatus::Unchecked)
    }));
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_titles_authors_and_years() {
        assert_eq!(
            title_level("Attention is all you need", "Attention Is All You Need!"),
            Level::Same
        );
        assert_eq!(
            title_level(
                "Attention is all you need",
                "Attention is all you need: a study"
            ),
            Level::Close
        );
        assert_eq!(
            title_level(
                "Attention is all you need",
                "Attention is all you need in speech separation"
            ),
            Level::Differs
        );
        assert_eq!(
            title_level("RETRACTED: Deep widgets", "Deep widgets"),
            Level::Same
        );
        assert_eq!(surname("Vaswani, Ashish"), "vaswani");
        assert_eq!(surname("{OpenAI}"), "openai");
        assert_eq!(
            first_author_of("Ashish Vaswani and Noam Shazeer"),
            "vaswani"
        );
        let c = compare(("T", "doe", "2020"), ("T", "doe", "2021"));
        assert_eq!((c.author, c.year), (Some(Level::Same), Some(Level::Near)));
    }
}
