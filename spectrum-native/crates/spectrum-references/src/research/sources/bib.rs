//! The project's own `.bib`: entries whose title, abstract or keywords hold at least half the question's words.

use futures::FutureExt;
use futures::future::BoxFuture;

use super::{PER_SOURCE, SearchContext, Source, tidy};
use crate::bibtex::parse_bib_entries;
use crate::csl::parse_name;
use crate::dedupe::BibFile;
use crate::detect::clean_doi;
use crate::entry::four_digits;
use crate::error::RefError;
use crate::research::{ResearchResult, keywords};
use crate::text::{latex_to_text, normalise_title};

static AND: std::sync::LazyLock<regex::Regex> =
    std::sync::LazyLock::new(|| crate::text::re(r"(?i)\s+and\s+"));

/// "Vaswani, Ashish" and "Ashish Vaswani" alike.
fn bib_author(name: &str) -> String {
    parse_name(&latex_to_text(name)).map_or_else(String::new, |n| {
        if n.literal.is_empty() {
            [n.given, n.family]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        } else {
            n.literal
        }
    })
}

fn text(v: &str) -> String {
    latex_to_text(v).replace(['{', '}'], "").trim().to_owned()
}

pub fn from_bib(question: &str, bibs: &[BibFile]) -> Vec<ResearchResult> {
    let words = keywords(question);
    if words.is_empty() {
        return Vec::new();
    }
    let need = words.len().div_ceil(2);
    let mut matched: Vec<(usize, crate::bibtex::BibEntry)> = bibs
        .iter()
        .flat_map(|b| parse_bib_entries(&b.text))
        .filter_map(|e| {
            let said = normalise_title(
                &[e.get("title"), e.get("abstract"), e.get("keywords")]
                    .iter()
                    .filter(|s| !s.is_empty())
                    .copied()
                    .collect::<Vec<_>>()
                    .join(" "),
            );
            let said: Vec<&str> = said.split(' ').collect();
            let hits = words
                .iter()
                .filter(|w| said.iter().any(|s| s.starts_with(w.as_str())))
                .count();
            (hits >= need).then_some((hits, e))
        })
        .collect();
    matched.sort_by_key(|(hits, _)| std::cmp::Reverse(*hits));
    matched
        .into_iter()
        .take(PER_SOURCE)
        .map(|(_, e)| {
            let prefix = if e.get("archiveprefix").is_empty() {
                e.get("eprinttype")
            } else {
                e.get("archiveprefix")
            };
            let venue = ["journal", "booktitle", "journaltitle", "publisher"]
                .iter()
                .map(|n| e.get(n))
                .find(|v| !v.is_empty())
                .unwrap_or("");
            tidy(ResearchResult {
                title: text(e.get("title")),
                authors: AND
                    .split(e.get("author"))
                    .map(bib_author)
                    .filter(|a| !a.is_empty())
                    .collect(),
                year: four_digits(if e.get("year").is_empty() {
                    e.get("date")
                } else {
                    e.get("year")
                })
                .unwrap_or_default(),
                venue: text(venue),
                doi: if e.get("doi").is_empty() {
                    String::new()
                } else {
                    clean_doi(e.get("doi"))
                },
                arxiv: if prefix.to_lowercase().contains("arxiv") {
                    e.get("eprint").to_owned()
                } else {
                    String::new()
                },
                url: e.get("url").to_owned(),
                abstract_text: text(e.get("abstract")),
                in_bib: e.key.clone(),
                ..ResearchResult::from("bib")
            })
        })
        .collect()
}

pub(crate) struct Bib;

impl Source for Bib {
    fn id(&self) -> &'static str {
        "bib"
    }
    fn label(&self) -> &'static str {
        ".bib"
    }
    fn name(&self) -> &'static str {
        "the project’s .bib"
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move { Ok(from_bib(question, cx.bibs)) }.boxed()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn finds_entries_holding_half_the_words() {
        let bibs = [super::BibFile {
            file: "references.bib".into(),
            text: "@book{Knuth1984,\n  title = {Literate programming with attention},\n  author = {Knuth, Donald E.},\n  year = {1984},\n  abstract = {Attention to {programs}.}\n}\n@misc{Other, title = {Nothing here}}".into(),
        }];
        let found = super::from_bib("attention to programs", &bibs);
        assert_eq!(found.len(), 1);
        assert_eq!(
            (
                found[0].in_bib.as_str(),
                found[0].authors[0].as_str(),
                found[0].abstract_text.as_str()
            ),
            ("Knuth1984", "Donald E. Knuth", "Attention to programs.")
        );
    }
}
