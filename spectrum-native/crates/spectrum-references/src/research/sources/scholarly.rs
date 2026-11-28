//! What the scholarly sources share: a record with its abstract, citations and open copy turned into a result
//! (2.8's `fromRecord`), markup-free text, and the arXiv adapter.

use std::sync::LazyLock;

use futures::FutureExt;
use futures::future::BoxFuture;
use regex::Regex;

use super::{PER_SOURCE, SearchContext, Source, tidy};
use crate::arxiv::{id_of_url, search_arxiv};
use crate::csl::{Record, summary_of};
use crate::error::RefError;
use crate::research::ResearchResult;
use crate::research::keywords;
use crate::research::merge::arxiv_of_doi;
use crate::text::{decode_entities, re, squash};

/// A work as a scholarly database gives it: the record, its abstract, how often cited, its open copy, whether
/// a preprint (None when the source can't tell).
#[derive(Debug, Clone, Default)]
pub(crate) struct ScholarHit {
    pub rec: Record,
    pub summary: String,
    pub citations: Option<u64>,
    pub open_access: String,
    pub preprint: Option<bool>,
}

static BLOCK_TAG: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)</?(?:[\w-]+:)?(?:p|sec|title|br|div|list-item)\b[^>]*>"));
static ANY_TAG: LazyLock<Regex> = LazyLock::new(|| re(r"<[^>]+>"));

/// A block (JATS's `<jats:p>`, a `<br>`) parts words; inline markup (`<i>`, `<sup>`) doesn't.
pub(crate) fn plain(value: &str) -> String {
    squash(&decode_entities(
        &ANY_TAG.replace_all(&BLOCK_TAG.replace_all(value, " "), ""),
    ))
}

static ARXIV_URL: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)arxiv\.org/(?:abs|pdf)/(.+?)(?:v\d+)?(?:\.pdf)?/?$"));

/// An abs or pdf link's id, without its version.
pub(crate) fn arxiv_of_url(url: &str) -> String {
    ARXIV_URL
        .captures(url)
        .map(|c| c[1].to_owned())
        .unwrap_or_default()
}

// a preprint server's record that its source files as an article
static PREPRINT_VENUE: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?i)\b(?:arxiv|biorxiv|medrxiv|chemrxiv|ssrn|research square|preprints?)\b")
});

pub(crate) fn from_record(hit: &ScholarHit, source: &str) -> ResearchResult {
    let meta = summary_of(&hit.rec);
    let venue = plain(&hit.rec.container);
    let arxiv = [
        hit.rec
            .arxiv
            .as_ref()
            .map(|a| a.id.clone())
            .unwrap_or_default(),
        arxiv_of_doi(&meta.doi),
        arxiv_of_url(&hit.open_access),
        arxiv_of_url(&hit.rec.url),
    ]
    .into_iter()
    .find(|a| !a.is_empty())
    .unwrap_or_default();
    let preprint = if hit.preprint == Some(true) || PREPRINT_VENUE.is_match(&venue) {
        Some(true)
    } else if venue.is_empty() {
        None
    } else {
        Some(false)
    };
    tidy(ResearchResult {
        title: meta.title,
        authors: meta.authors,
        year: meta.year,
        doi: meta.doi,
        venue,
        arxiv,
        url: hit.rec.url.clone(),
        abstract_text: plain(&hit.summary),
        citations: hit.citations,
        open_access: hit.open_access.clone(),
        preprint,
        ..ResearchResult::from(source)
    })
}

pub(crate) struct Arxiv;

impl Source for Arxiv {
    fn id(&self) -> &'static str {
        "arxiv"
    }
    fn label(&self) -> &'static str {
        "arXiv"
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move {
            let words = keywords(question);
            let q = if words.is_empty() {
                question.to_owned()
            } else {
                words.join(" ")
            };
            let papers =
                search_arxiv(&cx.resolver.http, &q, PER_SOURCE, cx.year_from, cx.year_to).await?;
            Ok(papers
                .into_iter()
                .map(|p| {
                    // the id from the address keeps an old-style archive (hep-th/9901001), and loses its version
                    let id = id_of_url(&p.url);
                    tidy(ResearchResult {
                        title: p.title,
                        authors: p.authors,
                        year: p.year,
                        preprint: Some(p.doi.is_empty() && p.journal_ref.is_empty()),
                        venue: p.journal_ref,
                        doi: p.doi,
                        url: format!("https://arxiv.org/abs/{id}"),
                        open_access: format!("https://arxiv.org/pdf/{id}"),
                        arxiv: id,
                        abstract_text: p.abstract_text,
                        ..ResearchResult::from("arxiv")
                    })
                })
                .collect())
        }
        .boxed()
    }
}
