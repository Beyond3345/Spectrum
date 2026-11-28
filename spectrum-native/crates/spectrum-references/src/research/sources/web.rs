//! The web, through the user's search connections.

use futures::FutureExt;
use futures::future::BoxFuture;

use super::{PER_SOURCE, SearchContext, Source, tidy};
use crate::csl::summary_of;
use crate::detect::{ItemKind, detect_input};
use crate::error::RefError;
use crate::research::ResearchResult;
use crate::search::{SearchConfig, web_search};
use crate::text::clean_text;

pub(crate) struct Web;

impl Source for Web {
    fn id(&self) -> &'static str {
        "web"
    }
    fn label(&self) -> &'static str {
        "Web"
    }
    fn name(&self) -> &'static str {
        "the web"
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move {
            let empty = SearchConfig::default();
            let hits = web_search(
                cx.resolver,
                cx.search.unwrap_or(&empty),
                question,
                PER_SOURCE,
            )
            .await?;
            Ok(hits
                .into_iter()
                .map(|h| {
                    let meta = summary_of(&h.rec);
                    let id = detect_input(if h.rec.doi.is_empty() {
                        &h.rec.url
                    } else {
                        &h.rec.doi
                    });
                    let arxiv = h.rec.arxiv.as_ref().map_or_else(
                        || {
                            if id.kind == ItemKind::Arxiv {
                                id.id.clone()
                            } else {
                                id.arxiv.clone()
                            }
                        },
                        |a| a.id.clone(),
                    );
                    tidy(ResearchResult {
                        title: meta.title,
                        authors: meta.authors,
                        year: meta.year,
                        venue: clean_text(&h.rec.container),
                        doi: if meta.doi.is_empty() && id.kind == ItemKind::Doi {
                            id.id.clone()
                        } else {
                            meta.doi
                        },
                        arxiv,
                        url: if h.rec.url.is_empty() && !h.rec.doi.is_empty() {
                            format!("https://doi.org/{}", h.rec.doi)
                        } else {
                            h.rec.url.clone()
                        },
                        abstract_text: clean_text(&h.summary).chars().take(600).collect(),
                        ..ResearchResult::from("web")
                    })
                })
                .collect())
        }
        .boxed()
    }
}
