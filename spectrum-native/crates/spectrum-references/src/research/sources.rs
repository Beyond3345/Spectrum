//! The research sources, one adapter each behind [`Source`]: 2.8's eight (OpenAlex, Semantic Scholar, arXiv,
//! Crossref, PubMed, the web through the search connections, Zotero, the project's `.bib`) and the plan's
//! zero-key additions (DBLP, Europe PMC, INSPIRE-HEP, DOAJ, ERIC, HAL, DataCite/Zenodo, Open Library). Which are
//! pinned comes from `researchPinnedSources`; discipline presets pick a set.

mod bib;
mod crossref;
mod dblp;
mod extra;
mod openalex;
mod pubmed;
mod scholarly;
mod semantic_scholar;
mod web;
mod zotero;

use futures::future::BoxFuture;
use spectrum_core::AppSettings;

pub(crate) use openalex::search_openalex;
pub use pubmed::parse_pubmed;
pub(crate) use semantic_scholar::search_semantic_scholar;

use super::{ResearchResult, session::ResearchKeys};
use crate::dedupe::BibFile;
use crate::error::RefError;
use crate::resolve::Resolver;
use crate::search::SearchConfig;
use crate::zotero::Zotero;

/// 10 a source keeps one search quick and polite; Search again with other words reaches further.
pub const PER_SOURCE: usize = 10;

/// What a source search may use besides the question.
pub struct SearchContext<'a> {
    pub resolver: &'a Resolver,
    pub keys: &'a ResearchKeys,
    pub year_from: Option<i32>,
    pub year_to: Option<i32>,
    pub preprints: bool,
    pub bibs: &'a [BibFile],
    pub search: Option<&'a SearchConfig>,
    pub zotero: Option<&'a Zotero>,
}

/// One place to search.
pub trait Source: Send + Sync {
    /// As sessions store it (`openalex`).
    fn id(&self) -> &'static str;
    /// As the Research tab names it (`OpenAlex`).
    fn label(&self) -> &'static str;
    /// The words for a note's "Found through …" (`the project’s .bib`).
    fn name(&self) -> &'static str {
        self.label()
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>>;
}

static SOURCES: &[&dyn Source] = &[
    &openalex::OpenAlex,
    &semantic_scholar::SemanticScholar,
    &scholarly::Arxiv,
    &crossref::Crossref,
    &pubmed::PubMed,
    &web::Web,
    &zotero::ZoteroLibrary,
    &bib::Bib,
    &dblp::Dblp,
    &extra::EUROPE_PMC,
    &extra::INSPIRE,
    &extra::DOAJ,
    &extra::ERIC,
    &extra::HAL,
    &extra::DATACITE,
    &extra::OPEN_LIBRARY,
];

/// Every source, in the order the Research tab lists them.
pub fn all_sources() -> &'static [&'static dyn Source] {
    SOURCES
}

pub fn source(id: &str) -> Option<&'static dyn Source> {
    SOURCES.iter().copied().find(|s| s.id() == id)
}

/// The five pinned until the user chooses.
pub const DEFAULT_PINNED: &[&str] = &["openalex", "semanticscholar", "arxiv", "crossref", "pubmed"];
/// What a new search starts with in 2.8: the scholarly databases and the project's own `.bib`.
pub const DEFAULT_SOURCES: &[&str] = &["openalex", "semanticscholar", "arxiv", "crossref", "bib"];

/// The sources pinned as pills, in the user's order: `researchPinnedSources`, known ids only, else the five.
pub fn pinned_sources(settings: &AppSettings) -> Vec<String> {
    let chosen: Vec<String> = settings
        .extra
        .get("researchPinnedSources")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .filter(|id| source(id).is_some())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    if chosen.is_empty() {
        DEFAULT_PINNED.iter().map(|s| (*s).to_owned()).collect()
    } else {
        chosen
    }
}

/// A discipline's sources, for the `+ Sources` popover.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Preset {
    General,
    CsEng,
    PhysicsAstro,
    Biomed,
    BooksHumanities,
    DatasetsCode,
}

impl Preset {
    pub const ALL: [Self; 6] = [
        Self::General,
        Self::CsEng,
        Self::PhysicsAstro,
        Self::Biomed,
        Self::BooksHumanities,
        Self::DatasetsCode,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::General => "General",
            Self::CsEng => "CS & Eng",
            Self::PhysicsAstro => "Physics & Astro",
            Self::Biomed => "Biomed",
            Self::BooksHumanities => "Books & Humanities",
            Self::DatasetsCode => "Datasets & Code",
        }
    }

    pub fn sources(self) -> &'static [&'static str] {
        match self {
            Self::General => DEFAULT_PINNED,
            Self::CsEng => &["dblp", "semanticscholar", "arxiv", "openalex", "crossref"],
            Self::PhysicsAstro => &[
                "inspire",
                "arxiv",
                "openalex",
                "semanticscholar",
                "crossref",
            ],
            Self::Biomed => &[
                "pubmed",
                "europepmc",
                "semanticscholar",
                "openalex",
                "crossref",
            ],
            Self::BooksHumanities => {
                &["openlibrary", "crossref", "openalex", "hal", "doaj", "eric"]
            }
            Self::DatasetsCode => &["datacite", "openalex", "semanticscholar", "arxiv"],
        }
    }
}

/// A result without the parts that make it no result: trimmed, a whole year.
pub(crate) fn tidy(mut r: ResearchResult) -> ResearchResult {
    r.title = r.title.trim().to_owned();
    if !(r.year.len() == 4 && r.year.chars().all(|c| c.is_ascii_digit())) {
        r.year.clear();
    }
    r.authors.retain(|a| !a.trim().is_empty());
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sources_have_unique_ids_and_presets_name_known_ones() {
        let mut ids: Vec<&str> = all_sources().iter().map(|s| s.id()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), all_sources().len());
        for p in Preset::ALL {
            for id in p.sources() {
                assert!(source(id).is_some(), "{} names {id}", p.label());
            }
        }
        let mut settings = AppSettings::default();
        assert_eq!(pinned_sources(&settings), DEFAULT_PINNED);
        settings.extra.insert(
            "researchPinnedSources".into(),
            serde_json::json!(["dblp", "nope", "arxiv"]),
        );
        assert_eq!(pinned_sources(&settings), ["dblp", "arxiv"]);
    }
}
