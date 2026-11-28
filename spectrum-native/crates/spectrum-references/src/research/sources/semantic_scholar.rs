//! Semantic Scholar's paper search; a key goes in `x-api-key`.

use futures::FutureExt;
use futures::future::BoxFuture;
use serde_json::Value;

use super::scholarly::{ScholarHit, from_record};
use super::{PER_SOURCE, SearchContext, Source};
use crate::csl::{ArxivRef, Record, issued_from_date, parse_name, str_of};
use crate::error::RefError;
use crate::http::{Http, query};
use crate::research::ResearchResult;

fn csl_type(t: &str) -> Option<&'static str> {
    Some(match t {
        "JournalArticle" | "Review" => "article-journal",
        "Conference" => "paper-conference",
        "Book" => "book",
        "BookSection" => "chapter",
        _ => return None,
    })
}

fn s(v: &Value, path: &str) -> String {
    v.pointer(path).map(str_of).unwrap_or_default()
}

pub(crate) async fn search_semantic_scholar(
    http: &Http,
    q: &str,
    limit: usize,
    api_key: &str,
    years: (Option<i32>, Option<i32>),
) -> Result<Vec<ScholarHit>, RefError> {
    let limit = limit.to_string();
    let year = match years {
        (None, None) => String::new(),
        (a, b) => format!(
            "{}-{}",
            a.map(|y| y.to_string()).unwrap_or_default(),
            b.map(|y| y.to_string()).unwrap_or_default()
        ),
    };
    let mut params = vec![
        ("query", q),
        ("limit", limit.as_str()),
        (
            "fields",
            "title,abstract,url,year,authors,venue,publicationVenue,journal,externalIds,publicationTypes,citationCount,openAccessPdf",
        ),
    ];
    if !year.is_empty() {
        params.push(("year", year.as_str()));
    }
    let headers: Vec<(&str, &str)> = if api_key.is_empty() {
        Vec::new()
    } else {
        vec![("x-api-key", api_key)]
    };
    let data = http
        .get_json(
            &format!(
                "{}/graph/v1/paper/search?{}",
                http.endpoints.semantic_scholar,
                query(&params)
            ),
            &headers,
            None,
        )
        .await?;
    Ok(data
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|paper| {
            let venue = [
                s(paper, "/journal/name"),
                s(paper, "/publicationVenue/name"),
                s(paper, "/venue"),
            ]
            .into_iter()
            .find(|v| !v.is_empty())
            .unwrap_or_default();
            // S2 files arXiv preprints as journal articles in the journal "ArXiv"
            let preprint = venue.to_lowercase().starts_with("arxiv");
            let kind = if preprint {
                "misc"
            } else {
                paper
                    .get("publicationTypes")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .find_map(|t| csl_type(&str_of(t)))
                    .unwrap_or("misc")
            };
            let arxiv = s(paper, "/externalIds/ArXiv");
            let rec = Record {
                kind: kind.into(),
                title: s(paper, "/title"),
                author: paper
                    .get("authors")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|a| parse_name(&s(a, "/name")))
                    .collect(),
                issued: issued_from_date(&s(paper, "/year")).unwrap_or_default(),
                container: if preprint { String::new() } else { venue },
                volume: if preprint {
                    String::new()
                } else {
                    s(paper, "/journal/volume")
                },
                page: if preprint {
                    String::new()
                } else {
                    s(paper, "/journal/pages").trim().to_owned()
                },
                doi: s(paper, "/externalIds/DOI"),
                arxiv: (!arxiv.is_empty()).then(|| ArxivRef {
                    id: arxiv,
                    primary_class: String::new(),
                }),
                url: s(paper, "/url"),
                ..Record::default()
            };
            ScholarHit {
                rec,
                summary: s(paper, "/abstract"),
                citations: paper.get("citationCount").and_then(Value::as_u64),
                open_access: s(paper, "/openAccessPdf/url"),
                preprint: Some(preprint),
            }
        })
        .collect())
}

pub(crate) struct SemanticScholar;

impl Source for SemanticScholar {
    fn id(&self) -> &'static str {
        "semanticscholar"
    }
    fn label(&self) -> &'static str {
        "Semantic Scholar"
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move {
            let hits = search_semantic_scholar(
                &cx.resolver.http,
                question,
                PER_SOURCE,
                &cx.keys.semantic_scholar_key,
                (cx.year_from, cx.year_to),
            )
            .await?;
            Ok(hits
                .iter()
                .map(|h| from_record(h, "semanticscholar"))
                .collect())
        }
        .boxed()
    }
}
