//! Research: a question searched in every chosen source at once, the results merged into a session the project
//! keeps in `.spectrum/research/<id>.json` (2.8's format), one failing source never stopping the others
//! (2.8's `researchService.js`). The sources are adapters in [`sources`].

mod merge;
mod session;
pub mod sources;

use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};

pub use merge::{mark_in_bib, merge_results};
pub use session::{
    AddedResult, ResearchKeys, ResearchQuery, Services, SessionChange, SessionSummary, add_results,
    delete_session, get_session, list_sessions, search_research, update_session,
};

fn lenient_string<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(match Value::deserialize(d)? {
        Value::String(s) => s,
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    })
}

fn empty(s: &str) -> bool {
    s.is_empty()
}

/// One work found, as a session keeps it. Empty fields aren't written; unknown ones are kept.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ResearchResult {
    #[serde(skip_serializing_if = "empty")]
    pub id: String,
    #[serde(skip_serializing_if = "empty")]
    pub title: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,
    #[serde(skip_serializing_if = "empty", deserialize_with = "lenient_string")]
    pub year: String,
    #[serde(skip_serializing_if = "empty")]
    pub venue: String,
    #[serde(skip_serializing_if = "empty")]
    pub doi: String,
    #[serde(skip_serializing_if = "empty")]
    pub arxiv: String,
    /// A book's ISBN (13 digits), from the book sources.
    #[serde(skip_serializing_if = "empty")]
    pub isbn: String,
    #[serde(skip_serializing_if = "empty")]
    pub url: String,
    #[serde(rename = "abstract", skip_serializing_if = "empty")]
    pub abstract_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub citations: Option<u64>,
    /// An open copy's address.
    #[serde(skip_serializing_if = "empty")]
    pub open_access: String,
    /// True for a preprint, false when the source knows it published, `None` when it can't tell.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preprint: Option<bool>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<String>,
    /// The project's `.bib` key, when it has the work.
    #[serde(skip_serializing_if = "empty")]
    pub in_bib: String,
    /// The Zotero item key, for a result from the Zotero library.
    #[serde(skip_serializing_if = "empty")]
    pub zotero: String,
    /// The user's: "keep" or "drop", and why.
    #[serde(skip_serializing_if = "empty")]
    pub decision: String,
    #[serde(skip_serializing_if = "empty")]
    pub reason: String,
    /// The AI's sorting: why it matters, a keep/drop suggestion, a theme.
    #[serde(skip_serializing_if = "empty")]
    pub why: String,
    #[serde(skip_serializing_if = "empty")]
    pub suggest: String,
    #[serde(skip_serializing_if = "empty")]
    pub theme: String,
    /// The note and PDF kept for it, project paths.
    #[serde(skip_serializing_if = "empty")]
    pub note: String,
    #[serde(skip_serializing_if = "empty")]
    pub pdf: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl ResearchResult {
    /// A result found in `source`.
    pub fn from(source: &str) -> Self {
        Self {
            sources: vec![source.to_owned()],
            ..Self::default()
        }
    }
}

/// One source's count or error in a run.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SourceRun {
    pub count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// One search of a session: when, what, and what each source gave.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ResearchRun {
    pub at: String,
    pub queries: Vec<String>,
    pub per_source: BTreeMap<String, SourceRun>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filters: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub triage: Option<SourceRun>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// A research session as `.spectrum/research/<id>.json` holds it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ResearchSession {
    pub id: String,
    pub question: String,
    pub sources: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub runs: Vec<ResearchRun>,
    pub results: Vec<ResearchResult>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// The question's search words, folded, lower case, without stop words: at most 8.
pub fn keywords(question: &str) -> Vec<String> {
    crate::text::normalise_title(question)
        .split(' ')
        .filter(|w| w.chars().count() > 1 && !crate::arxiv::STOPWORDS.contains(w))
        .take(8)
        .map(str::to_owned)
        .collect()
}
