//! Library items: what an item is known by, the library search, items into the `.bib` (Better BibTeX's export,
//! else Zotero's, the `file` field dropped), the citation picker, and a `.bib` entry as a new item.

use std::collections::HashMap;
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use reqwest::Method;
use serde_json::{Value, json};

use super::{LIB, Zotero};
use crate::add::{ReadyEntry, Resolved, append_entries, bib_context};
use crate::bibtex::parse_bib_entries;
use crate::csl::{Name, Record, base_key, str_of};
use crate::detect::{clean_doi, strip_version};
use crate::entry::four_digits;
use crate::error::RefError;
use crate::http::{encode_component, query};
use crate::text::{match_brace, normalise_title, re};

const HIDDEN_TYPES: &[&str] = &["attachment", "note", "annotation"];

fn visible(items: Option<Value>) -> Vec<Value> {
    match items {
        Some(Value::Array(a)) => a
            .into_iter()
            .filter(|it| {
                it.get("key").is_some()
                    && it.get("data").is_some_and(|d| {
                        !HIDDEN_TYPES
                            .contains(&d.get("itemType").and_then(Value::as_str).unwrap_or(""))
                    })
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn d(item: &Value) -> &Value {
    item.get("data").unwrap_or(&Value::Null)
}

fn f(v: &Value, k: &str) -> String {
    v.get(k).map(str_of).unwrap_or_default()
}

static ARXIV_IN: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?im)arxiv\.org/(?:abs|pdf)/([\w./-]+?)(?:v\d+)?(?:\.pdf)?(?:[?#]|$)|^arxiv:\s*(\S+)")
});
static EXTRA_DOI: LazyLock<Regex> = LazyLock::new(|| re(r"(?im)^DOI:\s*(\S+)"));
static EXTRA_ARXIV: LazyLock<Regex> = LazyLock::new(|| re(r"(?im)^arXiv:\s*(\S+)"));
static EXTRA_KEY: LazyLock<Regex> = LazyLock::new(|| re(r"(?im)^Citation Key:\s*(\S+)"));
static ARXIV_DOI: LazyLock<Regex> = LazyLock::new(|| re(r"^10\.48550/arxiv\.(.+)$"));

fn arxiv_in(text: &str) -> String {
    ARXIV_IN
        .captures(text)
        .and_then(|c| c.get(1).or_else(|| c.get(2)).map(|m| m.as_str().to_owned()))
        .unwrap_or_default()
}

/// What an item is known by, as `bib_identity` has it for an entry: its citation key, DOI, arXiv id, title and
/// year.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ZoteroRef {
    pub key: String,
    pub doi: String,
    pub arxiv: String,
    pub title: String,
    pub year: String,
}

pub fn item_identity(item: &Value) -> ZoteroRef {
    let data = d(item);
    let extra = f(data, "extra");
    let doi_raw = [
        f(data, "DOI"),
        EXTRA_DOI
            .captures(&extra)
            .map(|c| c[1].to_owned())
            .unwrap_or_default(),
    ]
    .into_iter()
    .find(|x| !x.is_empty())
    .unwrap_or_default();
    let doi = if doi_raw.is_empty() {
        String::new()
    } else {
        clean_doi(&doi_raw).to_lowercase()
    };
    let arxiv = [
        ARXIV_DOI
            .captures(&doi)
            .map(|c| c[1].to_owned())
            .unwrap_or_default(),
        arxiv_in(&f(data, "archiveID")),
        arxiv_in(&f(data, "url")),
        EXTRA_ARXIV
            .captures(&extra)
            .map(|c| c[1].to_owned())
            .unwrap_or_default(),
    ]
    .into_iter()
    .find(|x| !x.is_empty())
    .unwrap_or_default();
    ZoteroRef {
        key: [
            f(data, "citationKey"),
            EXTRA_KEY
                .captures(&extra)
                .map(|c| c[1].to_owned())
                .unwrap_or_default(),
        ]
        .into_iter()
        .find(|x| !x.is_empty())
        .unwrap_or_default(),
        doi,
        arxiv: strip_version(&arxiv).to_lowercase(),
        title: normalise_title(&f(data, "title")),
        year: four_digits(&f(data, "date")).unwrap_or_default(),
    }
}

/// One citation key, where no two DOIs or arXiv ids disagree.
pub(crate) fn same_key(a: &ZoteroRef, b: &ZoteroRef) -> bool {
    !a.key.is_empty()
        && a.key.eq_ignore_ascii_case(&b.key)
        && !(!a.doi.is_empty() && !b.doi.is_empty() && a.doi != b.doi)
        && !(!a.arxiv.is_empty() && !b.arxiv.is_empty() && a.arxiv != b.arxiv)
}

/// The same reference: one citation key, DOI or arXiv id, or the same title and year, where no DOIs disagree.
pub fn same_ref(a: &ZoteroRef, b: &ZoteroRef) -> bool {
    same_key(a, b)
        || (!a.doi.is_empty() && a.doi == b.doi)
        || (!a.arxiv.is_empty() && a.arxiv == b.arxiv)
        || (!a.title.is_empty()
            && a.title == b.title
            && a.year == b.year
            && !(!a.doi.is_empty() && !b.doi.is_empty() && a.doi != b.doi))
}

/// The same work by DOI, arXiv id, or title and year, whatever the keys.
pub(crate) fn same_work(a: &ZoteroRef, b: &ZoteroRef) -> bool {
    same_ref(
        &ZoteroRef {
            key: String::new(),
            ..a.clone()
        },
        &ZoteroRef {
            key: String::new(),
            ..b.clone()
        },
    )
}

/// A library item as the picker, `\cite` completion and Research list it.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub item_key: String,
    /// The key its entry goes in under: Zotero's, Better BibTeX's, else Spectrum's `AuthorYear`.
    pub key: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: String,
    pub venue: String,
    pub doi: String,
    pub arxiv: String,
    pub url: String,
    #[serde(rename = "abstract")]
    pub abstract_text: String,
}

/// An item as a record, for the `AuthorYear` key Spectrum gives an item with none.
fn record_of(data: &Value) -> Record {
    let creators = data
        .get("creators")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Record {
        author: creators
            .iter()
            .filter(|c| f(c, "creatorType") == "author")
            .map(|c| {
                if f(c, "name").is_empty() {
                    Name::family(&f(c, "lastName"), &f(c, "firstName"))
                } else {
                    Name::literal(&f(c, "name"))
                }
            })
            .collect(),
        title: f(data, "title"),
        issued: four_digits(&f(data, "date"))
            .and_then(|y| y.parse().ok())
            .map(|y| vec![y])
            .unwrap_or_default(),
        ..Record::default()
    }
}

fn creator_name(c: &Value) -> String {
    let name = f(c, "name");
    if name.is_empty() {
        [f(c, "firstName"), f(c, "lastName")]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        name
    }
}

impl Zotero {
    /// Library items matching `q` in any field, attachments and notes left out.
    pub(crate) async fn find_items(&self, q: &str, limit: usize) -> Result<Vec<Value>, RefError> {
        let limit = limit.to_string();
        let route = format!(
            "{LIB}/items?{}",
            query(&[
                ("q", q),
                ("qmode", "everything"),
                ("itemType", "-attachment"),
                ("limit", limit.as_str())
            ])
        );
        Ok(visible(self.json(&route).await?))
    }

    /// The items by item key, up to 50.
    pub(crate) async fn get_items(&self, keys: &[String]) -> Result<Vec<Value>, RefError> {
        if keys.is_empty() {
            return Ok(Vec::new());
        }
        let list = keys
            .iter()
            .map(|k| encode_component(k))
            .collect::<Vec<_>>()
            .join(",");
        Ok(visible(
            self.json(&format!("{LIB}/items?itemKey={list}")).await?,
        ))
    }

    /// Each item's citation key: Zotero's own field, then Better BibTeX's.
    async fn citation_keys(&self, items: &[Value]) -> HashMap<String, String> {
        let mut keys: HashMap<String, String> = items
            .iter()
            .map(|it| (f(it, "key"), item_identity(it).key))
            .collect();
        let missing: Vec<String> = keys
            .iter()
            .filter(|(_, v)| v.is_empty())
            .map(|(k, _)| k.clone())
            .collect();
        if !missing.is_empty()
            && let Ok(found) = self.rpc("item.citationkey", json!([missing])).await
        {
            for k in &missing {
                if let Some(v) = found.get(k).and_then(Value::as_str) {
                    keys.insert(k.clone(), v.to_owned());
                }
            }
        }
        keys
    }

    /// The library searched, each item with the key its entry goes in under (`with_keys`: ask Better BibTeX for
    /// the ones Zotero lacks; Research needs none).
    pub async fn search_library(
        &self,
        q: &str,
        limit: usize,
        with_keys: bool,
    ) -> Result<Vec<LibraryItem>, RefError> {
        let items = self.find_items(q, limit).await?;
        let keys = if with_keys {
            self.citation_keys(&items).await
        } else {
            HashMap::new()
        };
        Ok(items
            .iter()
            .map(|it| {
                let data = d(it);
                let id = item_identity(it);
                let creators = data
                    .get("creators")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let authors: Vec<&Value> = creators
                    .iter()
                    .filter(|c| f(c, "creatorType") == "author")
                    .collect();
                let names: Vec<String> = if authors.is_empty() {
                    creators.iter().map(creator_name).collect()
                } else {
                    authors.into_iter().map(creator_name).collect()
                };
                let key = keys
                    .get(&f(it, "key"))
                    .filter(|k| !k.is_empty())
                    .cloned()
                    .unwrap_or_else(|| {
                        if id.key.is_empty() {
                            base_key(&record_of(data))
                        } else {
                            id.key.clone()
                        }
                    });
                LibraryItem {
                    item_key: f(it, "key"),
                    key,
                    title: f(data, "title"),
                    authors: names.into_iter().filter(|n| !n.is_empty()).collect(),
                    year: id.year,
                    venue: [
                        "publicationTitle",
                        "proceedingsTitle",
                        "bookTitle",
                        "websiteTitle",
                        "repository",
                        "publisher",
                    ]
                    .iter()
                    .map(|k| f(data, k))
                    .find(|v| !v.is_empty())
                    .unwrap_or_default(),
                    doi: id.doi,
                    arxiv: id.arxiv,
                    url: f(data, "url"),
                    abstract_text: f(data, "abstractNote"),
                }
            })
            .collect())
    }

    async fn bbt_export(&self, citekey: &str, biblatex: bool) -> String {
        let format = if biblatex {
            "Better BibLaTeX"
        } else {
            "Better BibTeX"
        };
        match self.rpc("item.export", json!([[citekey], format])).await {
            // older Better BibTeX answers [status, type, text]
            Ok(Value::Array(a)) => a
                .last()
                .and_then(Value::as_str)
                .map(clean_entry)
                .unwrap_or_default(),
            Ok(Value::String(s)) => clean_entry(&s),
            _ => String::new(),
        }
    }

    async fn zotero_export(&self, item: &Value, biblatex: bool) -> Result<String, RefError> {
        let key = f(item, "key");
        let res = self
            .get(&format!(
                "{LIB}/items/{}?format={}",
                encode_component(&key),
                if biblatex { "biblatex" } else { "bibtex" }
            ))
            .await?;
        if !res.ok() {
            let title = f(d(item), "title");
            return Err(RefError::Zotero(format!(
                "Zotero couldn’t export “{}” (HTTP {}).",
                if title.is_empty() { key } else { title },
                res.status
            )));
        }
        Ok(clean_entry(&res.text()))
    }

    /// Zotero references into the project's `.bib`, each under its citation key (Zotero's, Better BibTeX's, else
    /// Spectrum's `AuthorYear`). `item_keys` from a search, `citekeys` from the picker. The entry is Better
    /// BibTeX's export when it can give one, else Zotero's, as BibLaTeX or BibTeX as the project uses.
    pub async fn import_refs(
        &self,
        root: &Path,
        item_keys: &[String],
        citekeys: &[String],
        bib_file: &str,
    ) -> Result<Resolved, RefError> {
        let items: HashMap<String, Value> = self
            .get_items(item_keys)
            .await?
            .into_iter()
            .map(|it| (f(&it, "key"), it))
            .collect();
        let keys = self
            .citation_keys(&items.values().cloned().collect::<Vec<_>>())
            .await;
        let biblatex = bib_context(root, bib_file)?.style.biblatex;
        let mut ready = Vec::new();
        let refs = item_keys
            .iter()
            .map(|k| (Some(k.clone()), String::new()))
            .chain(citekeys.iter().map(|c| (None, c.clone())));
        for (item_key, citekey) in refs {
            let input = item_key.clone().unwrap_or_else(|| citekey.clone());
            let made = async {
                let item = match &item_key {
                    Some(k) => Some(items.get(k).cloned().ok_or_else(|| {
                        RefError::Zotero("That item isn’t in your Zotero library any more.".into())
                    })?),
                    None => None,
                };
                let citekey = if citekey.is_empty() {
                    item_key
                        .as_ref()
                        .and_then(|k| keys.get(k).cloned())
                        .unwrap_or_default()
                } else {
                    citekey.clone()
                };
                if !citekey.is_empty() {
                    let exported = self.bbt_export(&citekey, biblatex).await;
                    if !exported.is_empty() {
                        return Ok((exported, citekey));
                    }
                }
                let found = match item {
                    Some(it) => it,
                    None => self
                        .find_items(&citekey, 10)
                        .await?
                        .into_iter()
                        .find(|it| item_identity(it).key == citekey)
                        .ok_or_else(|| {
                            RefError::Zotero(format!("{citekey} isn’t in your Zotero library."))
                        })?,
                };
                let key = if citekey.is_empty() {
                    base_key(&record_of(d(&found)))
                } else {
                    citekey
                };
                Ok::<_, RefError>((self.zotero_export(&found, biblatex).await?, key))
            };
            ready.push(match made.await {
                Ok((bibtex, key)) => ReadyEntry {
                    input,
                    bibtex,
                    key,
                    error: String::new(),
                },
                Err(e) => ReadyEntry {
                    input,
                    bibtex: String::new(),
                    key: String::new(),
                    error: e.to_string(),
                },
            });
        }
        append_entries(root, bib_file, ready).await
    }

    /// Better BibTeX's citation picker (Cite As You Write) for `command` (parencite, citep or cite): the user
    /// picks in Zotero and what was picked goes into the `.bib`. `None` when the picker was closed.
    pub async fn pick_citation(
        &self,
        root: &Path,
        command: &str,
        bib_file: &str,
    ) -> Result<Option<(String, Resolved)>, RefError> {
        let format = match command {
            "parencite" => "biblatex",
            "citep" => "natbib",
            _ => "latex",
        };
        let res = self
            .in_zotero(
                &format!(
                    "/better-bibtex/cayw?{}",
                    query(&[("format", format), ("command", command)])
                ),
                Method::GET,
                None,
                &[],
            )
            .await?;
        if !res.ok() {
            return Err(RefError::Zotero(format!(
                "Zotero’s citation picker answered HTTP {}.",
                res.status
            )));
        }
        let text = res.text().trim().to_owned();
        let mut citekeys: Vec<String> = Vec::new();
        for k in cite_keys(&text) {
            if !citekeys.contains(&k) {
                citekeys.push(k);
            }
        }
        if citekeys.is_empty() {
            return Ok(None);
        }
        let added = self.import_refs(root, &[], &citekeys, bib_file).await?;
        Ok(Some((text, added)))
    }
}

static CITE_PARTS: LazyLock<Regex> = LazyLock::new(|| re(r"\[[^\]]*\]|\{([^{}]*)\}"));

/// The keys a citation command cites: `a`, `b` from `\parencite[p.~3]{a,b}` or `\parencites{a}[4]{b}`.
pub(crate) fn cite_keys(text: &str) -> Vec<String> {
    CITE_PARTS
        .captures_iter(text)
        .filter_map(|c| c.get(1))
        .flat_map(|m| {
            m.as_str()
                .split(',')
                .map(str::trim)
                .filter(|k| !k.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .collect()
}

static FILE_FIELD: LazyLock<Regex> = LazyLock::new(|| re(r"(?i),\s*file\s*=\s*\{"));

/// The first entry of an export without its `file` field (paths to PDFs on this computer).
pub fn clean_entry(text: &str) -> String {
    let entries = parse_bib_entries(text);
    let Some(first) = entries.first() else {
        return String::new();
    };
    let end = entries.get(1).map_or(text.len(), |e| e.at);
    let mut out = text[first.at..end].trim().to_owned();
    while let Some(m) = FILE_FIELD.find(&out) {
        let Some(close) = match_brace(&out, m.end() - 1) else {
            break;
        };
        out.replace_range(m.start()..=close, "");
    }
    out
}

#[cfg(test)]
mod tests;
