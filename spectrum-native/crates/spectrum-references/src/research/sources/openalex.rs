//! OpenAlex: free; a free key raises the daily budget, an email joins its polite pool. Abstracts come as an
//! inverted index.

use futures::FutureExt;
use futures::future::BoxFuture;
use serde_json::Value;

use super::scholarly::{ScholarHit, from_record};
use super::{PER_SOURCE, SearchContext, Source};
use crate::csl::{Record, issued_from_date, parse_name, str_of};
use crate::error::RefError;
use crate::http::{Http, query};
use crate::research::ResearchResult;

// work types worth citing (not paratext, errata, datasets and the like) and their CSL types
const TYPES: &str = "article|conference-paper|preprint|review|book|book-chapter|dissertation|report|standard|reference-entry";

fn csl_type(t: &str) -> &'static str {
    match t {
        "article" | "review" => "article-journal",
        "conference-paper" => "paper-conference",
        "book" => "book",
        "book-chapter" => "chapter",
        "dissertation" => "thesis",
        "report" => "report",
        _ => "misc",
    }
}

fn s(v: &Value, path: &str) -> String {
    v.pointer(path).map(str_of).unwrap_or_default()
}

/// OpenAlex's search, as 2.8 asks it (`searchOpenAlex`): retracted works and non-works left out.
#[allow(clippy::too_many_lines)]
pub(crate) async fn search_openalex(
    http: &Http,
    q: &str,
    limit: usize,
    api_key: &str,
    mailto: &str,
    years: (Option<i32>, Option<i32>),
    preprints: bool,
) -> Result<Vec<ScholarHit>, RefError> {
    let types = if preprints {
        TYPES.to_owned()
    } else {
        TYPES.replace("|preprint", "")
    };
    let mut filter = vec![format!("type:{types}"), "is_retracted:false".to_owned()];
    if let Some(y) = years.0 {
        filter.push(format!("from_publication_date:{y}-01-01"));
    }
    if let Some(y) = years.1 {
        filter.push(format!("to_publication_date:{y}-12-31"));
    }
    let filter = filter.join(",");
    let limit = limit.to_string();
    let mut params = vec![
        ("search", q),
        ("filter", filter.as_str()),
        ("per_page", limit.as_str()),
        (
            "select",
            "id,doi,display_name,publication_year,type,authorships,primary_location,biblio,abstract_inverted_index,cited_by_count,open_access",
        ),
    ];
    if !api_key.is_empty() {
        params.push(("api_key", api_key));
    }
    if !mailto.is_empty() {
        params.push(("mailto", mailto));
    }
    let data = http
        .get_json(
            &format!("{}/works?{}", http.endpoints.openalex, query(&params)),
            &[],
            None,
        )
        .await?;
    Ok(data
        .get("results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|work| {
            let mut words: Vec<(u64, String)> = Vec::new();
            if let Some(index) = work
                .get("abstract_inverted_index")
                .and_then(Value::as_object)
            {
                for (word, positions) in index {
                    for p in positions
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(Value::as_u64)
                    {
                        words.push((p, word.clone()));
                    }
                }
            }
            words.sort_by_key(|(p, _)| *p);
            let kind = s(work, "/type");
            let source_type = s(work, "/primary_location/source/type");
            let pages = [s(work, "/biblio/first_page"), s(work, "/biblio/last_page")]
                .into_iter()
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
                .join("-");
            let container = [
                s(work, "/primary_location/raw_source_name"),
                s(work, "/primary_location/source/display_name"),
            ]
            .into_iter()
            .find(|c| !c.is_empty())
            .unwrap_or_default();
            let doi = s(work, "/doi");
            let url = [
                s(work, "/primary_location/landing_page_url"),
                doi.clone(),
                s(work, "/id"),
            ]
            .into_iter()
            .find(|u| !u.is_empty())
            .unwrap_or_default();
            let rec = Record {
                kind: if kind == "article" && source_type == "conference" {
                    "paper-conference"
                } else {
                    csl_type(&kind)
                }
                .into(),
                title: s(work, "/display_name"),
                author: work
                    .get("authorships")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|a| parse_name(&s(a, "/author/display_name")))
                    .collect(),
                issued: issued_from_date(&s(work, "/publication_year")).unwrap_or_default(),
                container,
                volume: s(work, "/biblio/volume"),
                issue: s(work, "/biblio/issue"),
                page: pages,
                publisher: s(work, "/primary_location/source/host_organization_name"),
                doi: doi
                    .trim_start_matches("https://doi.org/")
                    .trim_start_matches("http://doi.org/")
                    .to_owned(),
                url,
                ..Record::default()
            };
            let oa = work.pointer("/open_access/is_oa").and_then(Value::as_bool) == Some(true);
            ScholarHit {
                rec,
                summary: words
                    .into_iter()
                    .map(|(_, w)| w)
                    .collect::<Vec<_>>()
                    .join(" "),
                citations: work.get("cited_by_count").and_then(Value::as_u64),
                open_access: if oa {
                    s(work, "/open_access/oa_url")
                } else {
                    String::new()
                },
                preprint: Some(kind == "preprint"),
            }
        })
        .collect())
}

pub(crate) struct OpenAlex;

impl Source for OpenAlex {
    fn id(&self) -> &'static str {
        "openalex"
    }
    fn label(&self) -> &'static str {
        "OpenAlex"
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move {
            let hits = search_openalex(
                &cx.resolver.http,
                question,
                PER_SOURCE,
                &cx.keys.openalex_key,
                &cx.keys.openalex_email,
                (cx.year_from, cx.year_to),
                cx.preprints,
            )
            .await?;
            Ok(hits.iter().map(|h| from_record(h, "openalex")).collect())
        }
        .boxed()
    }
}
