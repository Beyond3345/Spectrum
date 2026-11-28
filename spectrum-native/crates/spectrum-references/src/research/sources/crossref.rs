//! Crossref, through the references resolver's queue: its public pool takes one request at a time.

use futures::FutureExt;
use futures::future::BoxFuture;
use serde_json::Value;

use super::scholarly::{ScholarHit, from_record};
use super::{PER_SOURCE, SearchContext, Source};
use crate::csl::{Record, str_of};
use crate::error::RefError;
use crate::http::query;
use crate::research::ResearchResult;

// figures, peer reviews, grants and datasets crowd out the papers themselves
const NOT_A_WORK: &[&str] = &[
    "component",
    "peer-review",
    "grant",
    "dataset",
    "journal",
    "journal-issue",
    "journal-volume",
];

pub(crate) struct Crossref;

impl Source for Crossref {
    fn id(&self) -> &'static str {
        "crossref"
    }
    fn label(&self) -> &'static str {
        "Crossref"
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move {
            let filter = [cx.year_from.map(|y| format!("from-pub-date:{y}")), cx.year_to.map(|y| format!("until-pub-date:{y}"))]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(",");
            let rows = PER_SOURCE.to_string();
            let mut params = vec![
                ("query.bibliographic", question),
                ("rows", rows.as_str()),
                ("select", "DOI,title,author,issued,container-title,type,abstract,is-referenced-by-count,URL"),
            ];
            if !filter.is_empty() {
                params.push(("filter", filter.as_str()));
            }
            let http = &cx.resolver.http;
            let res = http.get(&format!("{}/works?{}", http.endpoints.crossref, query(&params)), "application/json").await?;
            if !res.ok() {
                return Err(RefError::Lookup(format!("Crossref returned {}.", res.status)));
            }
            let items = res.json().and_then(|v| v.pointer("/message/items").and_then(Value::as_array).cloned()).unwrap_or_default();
            Ok(items
                .iter()
                .filter_map(|it| {
                    let rec = Record::from_value(it);
                    if rec.doi.is_empty() || rec.title.is_empty() || NOT_A_WORK.contains(&rec.kind.as_str()) {
                        return None;
                    }
                    let hit = ScholarHit {
                        summary: it.get("abstract").map(str_of).unwrap_or_default(),
                        citations: it.get("is-referenced-by-count").and_then(Value::as_u64),
                        preprint: Some(rec.kind == "posted-content"),
                        rec,
                        open_access: String::new(),
                    };
                    Some(from_record(&hit, "crossref"))
                })
                .collect())
        }
        .boxed()
    }
}
