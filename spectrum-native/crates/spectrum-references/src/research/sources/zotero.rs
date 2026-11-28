//! The user's Zotero library: items found for at least half the question's words (Zotero's search takes every
//! word it's given, which a question's rarely all match, so each word is searched for).

use std::collections::HashMap;

use futures::FutureExt;
use futures::future::BoxFuture;

use super::{PER_SOURCE, SearchContext, Source, tidy};
use crate::error::RefError;
use crate::research::{ResearchResult, keywords};
use crate::zotero::LibraryItem;

pub(crate) struct ZoteroLibrary;

impl Source for ZoteroLibrary {
    fn id(&self) -> &'static str {
        "zotero"
    }
    fn label(&self) -> &'static str {
        "Zotero"
    }
    fn name(&self) -> &'static str {
        "your Zotero library"
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move {
            let zotero = cx
                .zotero
                .ok_or_else(|| RefError::ZoteroUnreachable(crate::zotero::NOT_OPEN.into()))?;
            let words = keywords(question);
            let mut found: Vec<(LibraryItem, usize)> = Vec::new();
            let mut at: HashMap<String, usize> = HashMap::new();
            for word in &words {
                for hit in zotero.search_library(word, 25, false).await? {
                    if let Some(&i) = at.get(&hit.item_key) {
                        found[i].1 += 1;
                    } else {
                        at.insert(hit.item_key.clone(), found.len());
                        found.push((hit, 1));
                    }
                }
            }
            let need = words.len().div_ceil(2);
            found.retain(|(_, n)| *n >= need);
            found.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
            Ok(found
                .into_iter()
                .take(PER_SOURCE)
                .map(|(h, _)| {
                    tidy(ResearchResult {
                        title: h.title,
                        authors: h.authors,
                        year: h.year,
                        venue: h.venue,
                        doi: h.doi,
                        arxiv: h.arxiv,
                        url: h.url,
                        abstract_text: h.abstract_text,
                        zotero: h.item_key,
                        ..ResearchResult::from("zotero")
                    })
                })
                .collect())
        }
        .boxed()
    }
}
