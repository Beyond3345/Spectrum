//! The zero-key sources 3.0.0 adds: Europe PMC, INSPIRE-HEP, DOAJ, ERIC, HAL, `DataCite` (Zenodo's DOIs among
//! them) and Open Library. Each is one JSON request and a reader of its answer.

use std::fmt::Write as _;

use futures::FutureExt;
use futures::future::BoxFuture;
use serde_json::Value;

use super::scholarly::{arxiv_of_url, plain};
use super::{PER_SOURCE, SearchContext, Source, tidy};
use crate::csl::{parse_name, str_of};
use crate::detect::{clean_doi, isbn_of};
use crate::error::RefError;
use crate::http::{Endpoints, encode_component, query};
use crate::research::ResearchResult;

/// A source that is one GET of JSON.
pub(crate) struct JsonSource {
    id: &'static str,
    label: &'static str,
    url: fn(&Endpoints, &str, &SearchContext<'_>) -> String,
    parse: fn(&Value) -> Vec<ResearchResult>,
}

impl Source for JsonSource {
    fn id(&self) -> &'static str {
        self.id
    }
    fn label(&self) -> &'static str {
        self.label
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move {
            let http = &cx.resolver.http;
            let url = (self.url)(&http.endpoints, question, cx);
            Ok((self.parse)(
                &http
                    .get_json(&url, &[("Accept", "application/json")], None)
                    .await?,
            ))
        }
        .boxed()
    }
}

fn s(v: &Value, path: &str) -> String {
    v.pointer(path).map(str_of).unwrap_or_default()
}

fn arr<'a>(v: &'a Value, path: &str) -> impl Iterator<Item = &'a Value> + 'a {
    v.pointer(path)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
}

/// "Surname, Given" (or a group's name) as "Given Surname".
fn display(name: &str) -> String {
    parse_name(name).map_or_else(String::new, |n| {
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

fn doi(raw: &str) -> String {
    if raw.is_empty() {
        String::new()
    } else {
        clean_doi(raw.trim_start_matches("https://doi.org/"))
    }
}

fn per() -> String {
    PER_SOURCE.to_string()
}

// ─── Europe PMC: biomedical literature with PubMed, PMC and the bioRxiv/medRxiv preprints ───

pub(crate) static EUROPE_PMC: JsonSource = JsonSource {
    id: "europepmc",
    label: "Europe PMC",
    url: europe_pmc_url,
    parse: parse_europe_pmc,
};

fn europe_pmc_url(e: &Endpoints, q: &str, cx: &SearchContext<'_>) -> String {
    let mut term = q.to_owned();
    if cx.year_from.is_some() || cx.year_to.is_some() {
        let _ = write!(
            term,
            " AND PUB_YEAR:[{} TO {}]",
            cx.year_from.unwrap_or(1800),
            cx.year_to.unwrap_or(3000)
        );
    }
    if !cx.preprints {
        term.push_str(" NOT SRC:PPR");
    }
    let page = per();
    format!(
        "{}/search?{}",
        e.europepmc,
        query(&[
            ("query", term.as_str()),
            ("format", "json"),
            ("pageSize", page.as_str()),
            ("resultType", "core")
        ])
    )
}

pub fn parse_europe_pmc(data: &Value) -> Vec<ResearchResult> {
    arr(data, "/resultList/result")
        .map(|r| {
            let (source, id, pmid, pmc_id) =
                (s(r, "/source"), s(r, "/id"), s(r, "/pmid"), s(r, "/pmcid"));
            let authors: Vec<String> = {
                let listed: Vec<String> = arr(r, "/authorList/author")
                    .map(|a| {
                        let collective = s(a, "/collectiveName");
                        if collective.is_empty() {
                            [s(a, "/firstName"), s(a, "/lastName")]
                                .into_iter()
                                .filter(|x| !x.is_empty())
                                .collect::<Vec<_>>()
                                .join(" ")
                        } else {
                            collective
                        }
                    })
                    .collect();
                if listed.is_empty() {
                    s(r, "/authorString")
                        .trim_end_matches('.')
                        .split(", ")
                        .map(str::to_owned)
                        .collect()
                } else {
                    listed
                }
            };
            let venue = [
                s(r, "/journalInfo/journal/title"),
                s(r, "/journalTitle"),
                s(r, "/bookOrReportDetails/publisher"),
            ]
            .into_iter()
            .find(|v| !v.is_empty())
            .unwrap_or_default();
            tidy(ResearchResult {
                title: plain(&s(r, "/title")).trim_end_matches('.').to_owned(),
                authors,
                year: s(r, "/pubYear"),
                venue,
                doi: doi(&s(r, "/doi")),
                url: if pmid.is_empty() {
                    format!("https://europepmc.org/article/{source}/{id}")
                } else {
                    format!("https://europepmc.org/article/MED/{pmid}")
                },
                abstract_text: plain(&s(r, "/abstractText")),
                citations: r.get("citedByCount").and_then(Value::as_u64),
                open_access: if s(r, "/isOpenAccess") == "Y" && !pmc_id.is_empty() {
                    format!("https://europepmc.org/articles/{pmc_id}")
                } else {
                    String::new()
                },
                preprint: Some(source == "PPR"),
                ..ResearchResult::from("europepmc")
            })
        })
        .collect()
}

// ─── INSPIRE-HEP: high-energy physics, with arXiv ids and citation counts ───

pub(crate) static INSPIRE: JsonSource = JsonSource {
    id: "inspire",
    label: "INSPIRE-HEP",
    url: inspire_url,
    parse: parse_inspire,
};

fn inspire_url(e: &Endpoints, q: &str, _: &SearchContext<'_>) -> String {
    let size = per();
    format!(
        "{}/api/literature?{}",
        e.inspire,
        query(&[
            ("q", q),
            ("size", size.as_str()),
            (
                "fields",
                "titles,authors.full_name,dois,arxiv_eprints,publication_info,citation_count,abstracts,control_number,preprint_date"
            )
        ])
    )
}

pub fn parse_inspire(data: &Value) -> Vec<ResearchResult> {
    arr(data, "/hits/hits")
        .filter_map(|h| h.get("metadata"))
        .map(|m| {
            let journal = s(m, "/publication_info/0/journal_title");
            let year = [
                s(m, "/publication_info/0/year"),
                s(m, "/preprint_date").chars().take(4).collect(),
            ]
            .into_iter()
            .find(|y| !y.is_empty())
            .unwrap_or_default();
            let arxiv = s(m, "/arxiv_eprints/0/value");
            let volume = s(m, "/publication_info/0/journal_volume");
            tidy(ResearchResult {
                title: plain(&s(m, "/titles/0/title")),
                authors: arr(m, "/authors")
                    .map(|a| display(&s(a, "/full_name")))
                    .collect(),
                year,
                venue: [journal.clone(), volume]
                    .into_iter()
                    .filter(|x| !x.is_empty())
                    .collect::<Vec<_>>()
                    .join(" "),
                doi: doi(&s(m, "/dois/0/value")),
                url: format!(
                    "https://inspirehep.net/literature/{}",
                    s(m, "/control_number")
                ),
                abstract_text: plain(&s(m, "/abstracts/0/value")),
                citations: m.get("citation_count").and_then(Value::as_u64),
                open_access: if arxiv.is_empty() {
                    String::new()
                } else {
                    format!("https://arxiv.org/pdf/{arxiv}")
                },
                preprint: Some(journal.is_empty() && !arxiv.is_empty()),
                arxiv,
                ..ResearchResult::from("inspire")
            })
        })
        .collect()
}

// ─── DOAJ: peer-reviewed open-access journals ───

pub(crate) static DOAJ: JsonSource = JsonSource {
    id: "doaj",
    label: "DOAJ",
    url: doaj_url,
    parse: parse_doaj,
};

fn doaj_url(e: &Endpoints, q: &str, _: &SearchContext<'_>) -> String {
    format!(
        "{}/api/search/articles/{}?pageSize={}",
        e.doaj,
        encode_component(q),
        PER_SOURCE
    )
}

pub fn parse_doaj(data: &Value) -> Vec<ResearchResult> {
    arr(data, "/results")
        .filter_map(|r| r.get("bibjson"))
        .map(|b| {
            let doi_id = arr(b, "/identifier")
                .find(|i| s(i, "/type").eq_ignore_ascii_case("doi"))
                .map(|i| s(i, "/id"))
                .unwrap_or_default();
            let fulltext = arr(b, "/link")
                .find(|l| s(l, "/type") == "fulltext")
                .map(|l| s(l, "/url"))
                .unwrap_or_default();
            tidy(ResearchResult {
                title: plain(&s(b, "/title")),
                authors: arr(b, "/author").map(|a| s(a, "/name")).collect(),
                year: s(b, "/year"),
                venue: s(b, "/journal/title"),
                doi: doi(&doi_id),
                url: fulltext.clone(),
                abstract_text: plain(&s(b, "/abstract")),
                open_access: fulltext,
                preprint: Some(false),
                ..ResearchResult::from("doaj")
            })
        })
        .collect()
}

// ─── ERIC: education research ───

pub(crate) static ERIC: JsonSource = JsonSource {
    id: "eric",
    label: "ERIC",
    url: eric_url,
    parse: parse_eric,
};

fn eric_url(e: &Endpoints, q: &str, _: &SearchContext<'_>) -> String {
    let rows = per();
    format!(
        "{}/?{}",
        e.eric,
        query(&[
            ("search", q),
            ("format", "json"),
            ("rows", rows.as_str()),
            (
                "fields",
                "id,title,author,publicationdateyear,source,description,url,e_fulltextauth"
            )
        ])
    )
}

pub fn parse_eric(data: &Value) -> Vec<ResearchResult> {
    arr(data, "/response/docs")
        .map(|d| {
            let id = s(d, "/id");
            let fulltext = d.get("e_fulltextauth").and_then(Value::as_u64) == Some(1)
                || s(d, "/e_fulltextauth") == "1";
            tidy(ResearchResult {
                title: plain(&s(d, "/title")),
                authors: arr(d, "/author").map(|a| display(&str_of(a))).collect(),
                year: s(d, "/publicationdateyear"),
                venue: s(d, "/source"),
                url: format!("https://eric.ed.gov/?id={id}"),
                abstract_text: plain(&s(d, "/description")),
                open_access: if fulltext {
                    format!("https://files.eric.ed.gov/fulltext/{id}.pdf")
                } else {
                    String::new()
                },
                ..ResearchResult::from("eric")
            })
        })
        .collect()
}

// ─── HAL: the French and European open archive, theses among it ───

pub(crate) static HAL: JsonSource = JsonSource {
    id: "hal",
    label: "HAL",
    url: hal_url,
    parse: parse_hal,
};

fn hal_url(e: &Endpoints, q: &str, _: &SearchContext<'_>) -> String {
    let rows = per();
    format!(
        "{}/search/?{}",
        e.hal,
        query(&[
            ("q", q),
            ("wt", "json"),
            ("rows", rows.as_str()),
            (
                "fl",
                "title_s,authFullName_s,producedDateY_i,journalTitle_s,doiId_s,arxivId_s,uri_s,abstract_s,docType_s,fileMain_s"
            )
        ])
    )
}

pub fn parse_hal(data: &Value) -> Vec<ResearchResult> {
    arr(data, "/response/docs")
        .map(|d| {
            let doc_type = s(d, "/docType_s");
            tidy(ResearchResult {
                title: plain(&s(d, "/title_s/0")),
                authors: arr(d, "/authFullName_s").map(str_of).collect(),
                year: s(d, "/producedDateY_i"),
                venue: s(d, "/journalTitle_s"),
                doi: doi(&s(d, "/doiId_s")),
                arxiv: s(d, "/arxivId_s"),
                url: s(d, "/uri_s"),
                abstract_text: plain(&s(d, "/abstract_s/0")),
                open_access: s(d, "/fileMain_s"),
                // HAL files preprints and working papers as UNDEFINED
                preprint: Some(doc_type == "UNDEFINED"),
                ..ResearchResult::from("hal")
            })
        })
        .collect()
}

// ─── DataCite: datasets, software and Zenodo records ───

pub(crate) static DATACITE: JsonSource = JsonSource {
    id: "datacite",
    label: "DataCite / Zenodo",
    url: datacite_url,
    parse: parse_datacite,
};

fn datacite_url(e: &Endpoints, q: &str, _: &SearchContext<'_>) -> String {
    let size = per();
    format!(
        "{}/dois?{}",
        e.datacite,
        query(&[("query", q), ("page[size]", size.as_str())])
    )
}

pub fn parse_datacite(data: &Value) -> Vec<ResearchResult> {
    arr(data, "/data")
        .filter_map(|r| r.get("attributes"))
        .map(|a| {
            let kind = s(a, "/types/resourceTypeGeneral");
            let doi_value = doi(&s(a, "/doi"));
            tidy(ResearchResult {
                title: plain(&s(a, "/titles/0/title")),
                authors: arr(a, "/creators")
                    .map(|c| display(&s(c, "/name")))
                    .collect(),
                year: s(a, "/publicationYear"),
                venue: [s(a, "/publisher/name"), s(a, "/publisher")]
                    .into_iter()
                    .find(|p| !p.is_empty() && !p.starts_with('{'))
                    .unwrap_or_default(),
                arxiv: arxiv_of_url(&s(a, "/url")),
                url: if doi_value.is_empty() {
                    s(a, "/url")
                } else {
                    format!("https://doi.org/{doi_value}")
                },
                doi: doi_value,
                abstract_text: plain(&s(a, "/descriptions/0/description")),
                citations: a.get("citationCount").and_then(Value::as_u64),
                preprint: Some(kind == "Preprint"),
                ..ResearchResult::from("datacite")
            })
        })
        .collect()
}

// ─── Open Library: books, by title, with their ISBNs ───

pub(crate) static OPEN_LIBRARY: JsonSource = JsonSource {
    id: "openlibrary",
    label: "Open Library",
    url: open_library_url,
    parse: parse_open_library,
};

fn open_library_url(e: &Endpoints, q: &str, _: &SearchContext<'_>) -> String {
    let limit = per();
    format!(
        "{}/search.json?{}",
        e.openlibrary,
        query(&[
            ("q", q),
            ("limit", limit.as_str()),
            (
                "fields",
                "key,title,subtitle,author_name,first_publish_year,publisher,isbn"
            )
        ])
    )
}

pub fn parse_open_library(data: &Value) -> Vec<ResearchResult> {
    arr(data, "/docs")
        .map(|d| {
            let (title, subtitle) = (s(d, "/title"), s(d, "/subtitle"));
            tidy(ResearchResult {
                title: if subtitle.is_empty() {
                    title
                } else {
                    format!("{title}: {subtitle}")
                },
                authors: arr(d, "/author_name").map(str_of).collect(),
                year: s(d, "/first_publish_year"),
                venue: s(d, "/publisher/0"),
                isbn: arr(d, "/isbn")
                    .map(|i| isbn_of(&str_of(i)))
                    .find(|i| !i.is_empty())
                    .unwrap_or_default(),
                url: format!("https://openlibrary.org{}", s(d, "/key")),
                preprint: Some(false),
                ..ResearchResult::from("openlibrary")
            })
        })
        .collect()
}

#[cfg(test)]
mod tests;
