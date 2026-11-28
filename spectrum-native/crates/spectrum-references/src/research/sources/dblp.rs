//! DBLP: computer science's conferences and journals, no key. arXiv copies are filed under the venue "`CoRR`".

use std::sync::LazyLock;

use futures::FutureExt;
use futures::future::BoxFuture;
use regex::Regex;
use serde_json::Value;

use super::scholarly::{arxiv_of_url, plain};
use super::{PER_SOURCE, SearchContext, Source, tidy};
use crate::csl::str_of;
use crate::error::RefError;
use crate::http::query;
use crate::research::ResearchResult;
use crate::research::merge::arxiv_of_doi;
use crate::text::re;

// DBLP tells namesakes apart with a number: "Wei Wang 0002"
static HOMONYM: LazyLock<Regex> = LazyLock::new(|| re(r"\s+\d{4}$"));

fn list(v: Option<&Value>) -> Vec<Value> {
    match v {
        Some(Value::Array(a)) => a.clone(),
        Some(Value::Null) | None => Vec::new(),
        Some(other) => vec![other.clone()],
    }
}

/// DBLP's `publ/api` JSON → results.
pub fn parse_dblp(data: &Value) -> Vec<ResearchResult> {
    list(data.pointer("/result/hits/hit"))
        .iter()
        .filter_map(|hit| hit.get("info"))
        .map(|info| {
            let s = |k: &str| info.get(k).map(str_of).unwrap_or_default();
            let authors = list(info.pointer("/authors/author"))
                .iter()
                .map(|a| {
                    HOMONYM
                        .replace(&a.get("text").map_or_else(|| str_of(a), str_of), "")
                        .into_owned()
                })
                .collect();
            let links: Vec<String> = list(info.get("ee")).iter().map(str_of).collect();
            let doi = s("doi");
            let venue = plain(&s("venue"));
            let arxiv = [arxiv_of_doi(&doi)]
                .into_iter()
                .chain(links.iter().map(|l| arxiv_of_url(l)))
                .find(|a| !a.is_empty())
                .unwrap_or_default();
            let preprint = venue.eq_ignore_ascii_case("CoRR")
                || s("type") == "Informal and Other Publications";
            tidy(ResearchResult {
                title: plain(&s("title")).trim_end_matches('.').to_owned(),
                authors,
                year: s("year"),
                venue,
                doi,
                arxiv,
                url: links.first().cloned().unwrap_or_else(|| s("url")),
                preprint: Some(preprint),
                ..ResearchResult::from("dblp")
            })
        })
        .collect()
}

pub(crate) struct Dblp;

impl Source for Dblp {
    fn id(&self) -> &'static str {
        "dblp"
    }
    fn label(&self) -> &'static str {
        "DBLP"
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move {
            let http = &cx.resolver.http;
            let h = PER_SOURCE.to_string();
            let url = format!(
                "{}/search/publ/api?{}",
                http.endpoints.dblp,
                query(&[("q", question), ("format", "json"), ("h", h.as_str())])
            );
            Ok(parse_dblp(&http.get_json(&url, &[], None).await?))
        }
        .boxed()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_dblp_hits() {
        let data: serde_json::Value =
            serde_json::from_str(include_str!("../../../tests/fixtures/research/dblp.json"))
                .unwrap();
        let found = super::parse_dblp(&data);
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].title, "Attention is All you Need");
        assert_eq!(found[0].authors, ["Ashish Vaswani", "Wei Wang"]);
        assert_eq!(
            (
                found[0].venue.as_str(),
                found[0].year.as_str(),
                found[0].preprint
            ),
            ("NIPS", "2017", Some(false))
        );
        assert_eq!(
            (found[1].arxiv.as_str(), found[1].preprint),
            ("1706.03762", Some(true))
        );
    }
}
