//! The user's web search connections (Settings › Search & Web): OpenAlex, Semantic Scholar, `SerpApi`, Exa,
//! Tavily and Brave, the default tried first and the others in order, never one connection's key sent to
//! another (2.8's `searchService.js`). The model's own search and DDGS are not here yet (see `FEATURE_PARITY.md`).

use std::sync::Arc;
use std::time::Duration;

use serde_json::{Value, json};
use spectrum_core::AppSettings;
use spectrum_core::keystore::{KeyStore, SecretStore};
use tokio::sync::Semaphore;

use crate::csl::{Name, Record, issued_from_date, parse_name, str_of, year_of};
use crate::detect::{ItemKind, detect_input};
use crate::error::RefError;
use crate::http::{Http, query};
use crate::research::sources::{search_openalex, search_semantic_scholar};
use crate::resolve::{Resolver, iso_now};

pub const SEARCH_PROVIDERS: &[&str] = &[
    "llm",
    "openalex",
    "semanticscholar",
    "serpapi",
    "exa",
    "tavily",
    "brave",
    "ddgs",
];

// papers, standards and LaTeX documentation: Brave ranks these higher and Tavily prefers them
const CITABLE_SITES: &[&str] = &[
    "arxiv.org",
    "doi.org",
    "openreview.net",
    "aclanthology.org",
    "proceedings.neurips.cc",
    "proceedings.mlr.press",
    "openaccess.thecvf.com",
    "dl.acm.org",
    "ieeexplore.ieee.org",
    "link.springer.com",
    "sciencedirect.com",
    "nature.com",
    "science.org",
    "pnas.org",
    "jstor.org",
    "pubmed.ncbi.nlm.nih.gov",
    "semanticscholar.org",
    "iso.org",
    "rfc-editor.org",
    "w3.org",
    "nist.gov",
    "ctan.org",
    "tex.stackexchange.com",
    "latex-project.org",
    "tug.org",
];

/// One search connection with its own key (the key itself, not a keystore reference).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Connection {
    pub provider: String,
    pub api_key: String,
    /// `SerpApi`'s engine: `google_scholar`, google or baidu.
    pub engine: String,
}

/// The default connection and the enabled ones.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SearchConfig {
    pub provider: String,
    pub connections: Vec<Connection>,
}

fn name_of<T: serde::Serialize>(v: &T) -> String {
    serde_json::to_value(v)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

impl SearchConfig {
    /// From the app's settings, each key read from the keystore.
    pub fn from_settings<S: SecretStore>(
        settings: &AppSettings,
        keys: &KeyStore<S>,
    ) -> Result<Self, spectrum_core::CoreError> {
        let provider = name_of(&settings.search_provider);
        let engine = name_of(&settings.serp_engine);
        let mut connections = Vec::new();
        for p in &settings.search_connections {
            let key = settings
                .search_provider_keys
                .get(p)
                .cloned()
                .filter(|k| !k.is_empty())
                .unwrap_or_else(|| {
                    if *p == provider {
                        settings.search_provider_key.clone()
                    } else {
                        String::new()
                    }
                });
            let api_key = match keys.with_keys(Value::String(key))? {
                Value::String(k) => k,
                _ => String::new(),
            };
            connections.push(Connection {
                provider: p.clone(),
                api_key,
                engine: engine.clone(),
            });
        }
        Ok(Self {
            provider,
            connections,
        })
    }

    /// Known providers once each, the default first.
    pub fn ordered(&self) -> Vec<Connection> {
        let mut out: Vec<Connection> = Vec::new();
        for c in &self.connections {
            if SEARCH_PROVIDERS.contains(&c.provider.as_str()) {
                match out.iter_mut().find(|o| o.provider == c.provider) {
                    Some(o) => *o = c.clone(),
                    None => out.push(c.clone()),
                }
            }
        }
        out.sort_by_key(|c| c.provider != self.provider);
        out
    }

    fn redact(&self, message: &str) -> String {
        self.connections
            .iter()
            .filter(|c| c.api_key.len() >= 6)
            .fold(message.to_owned(), |m, c| {
                m.replace(&c.api_key, "[redacted]")
            })
    }
}

/// A page or paper a connection found, and the words it showed under it.
#[derive(Debug, Clone, Default)]
pub struct WebHit {
    pub rec: Record,
    pub summary: String,
}

/// A web page keeps its address and available publication date.
fn page(title: &str, url: &str, summary: &str, date: &str) -> WebHit {
    let title = title
        .strip_prefix("[PDF] ")
        .or_else(|| title.strip_prefix("PDF "))
        .unwrap_or(title);
    WebHit {
        rec: Record {
            kind: "webpage".into(),
            title: title.into(),
            url: url.into(),
            issued: issued_from_date(date).unwrap_or_default(),
            accessed: iso_now(),
            ..Record::default()
        },
        summary: summary.into(),
    }
}

fn s(v: &Value, path: &str) -> String {
    v.pointer(path).map(str_of).unwrap_or_default()
}

fn arr<'a>(v: &'a Value, path: &str) -> Vec<&'a Value> {
    v.pointer(path)
        .and_then(Value::as_array)
        .map(|a| a.iter().collect())
        .unwrap_or_default()
}

static YEAR_AT_END: std::sync::LazyLock<regex::Regex> =
    std::sync::LazyLock::new(|| crate::text::re(r"(\d{4})\s*$"));
static VENUE_YEAR: std::sync::LazyLock<regex::Regex> =
    std::sync::LazyLock::new(|| crate::text::re(r",?\s*\d{4}\s*$"));

/// Scholar's line under each result: "A Vaswani, N Shazeer… - Advances in neural …, 2017 - proceedings.neurips.cc"
fn scholar_hit(item: &Value) -> WebHit {
    let summary = s(item, "/publication_info/summary");
    let mut parts = summary.split(" - ");
    let names = parts.next().unwrap_or("");
    let rest: Vec<&str> = parts.collect();
    let venue_year = if rest.len() > 1 { rest[0] } else { "" };
    let year = YEAR_AT_END
        .captures(venue_year)
        .map(|c| c[1].to_owned())
        .unwrap_or_default();
    let venue = VENUE_YEAR.replace(venue_year, "").trim().to_owned();
    let mut author: Vec<Name> = names
        .split(',')
        .filter_map(|n| parse_name(&n.replace('…', "")))
        .collect();
    if names.contains('…') {
        author.push(Name::literal("others"));
    }
    WebHit {
        rec: Record {
            kind: if s(item, "/type") == "Book" {
                "book"
            } else {
                "article-journal"
            }
            .into(),
            title: s(item, "/title"),
            author,
            issued: year.parse().map(|y| vec![y]).unwrap_or_default(),
            // Scholar shortens long venues with …, which would go into the .bib as is
            container: if venue.contains('…') || venue.chars().all(|c| c.is_ascii_digit()) {
                String::new()
            } else {
                venue
            },
            url: s(item, "/link"),
            ..Record::default()
        },
        summary: s(item, "/snippet"),
    }
}

#[allow(clippy::too_many_lines, clippy::many_single_char_names)]
async fn records(
    http: &Http,
    c: &Connection,
    q: &str,
    limit: usize,
    references: bool,
) -> Result<Vec<WebHit>, RefError> {
    let e = &http.endpoints;
    let need_key = |name: &str| {
        if c.api_key.is_empty() {
            Err(RefError::Lookup(format!("{name} needs an API key")))
        } else {
            Ok(())
        }
    };
    let n = limit.to_string();
    match c.provider.as_str() {
        "openalex" => Ok(
            search_openalex(http, q, limit, &c.api_key, "", (None, None), true)
                .await?
                .into_iter()
                .map(|h| WebHit {
                    rec: h.rec,
                    summary: h.summary,
                })
                .collect(),
        ),
        "semanticscholar" => Ok(
            search_semantic_scholar(http, q, limit, &c.api_key, (None, None))
                .await?
                .into_iter()
                .map(|h| WebHit {
                    rec: h.rec,
                    summary: h.summary,
                })
                .collect(),
        ),
        "serpapi" => {
            need_key("SerpApi")?;
            let engine = if references {
                if c.engine.is_empty() {
                    "google_scholar"
                } else {
                    c.engine.as_str()
                }
            } else if c.engine == "baidu" {
                "baidu"
            } else {
                "google"
            };
            let mut params = vec![
                ("engine", engine),
                ("q", q),
                ("api_key", c.api_key.as_str()),
                ("num", n.as_str()),
            ];
            if engine == "baidu" {
                params.push(("rn", n.as_str()));
            }
            let data = http
                .get_json(
                    &format!("{}/search.json?{}", e.serpapi, query(&params)),
                    &[],
                    None,
                )
                .await?;
            Ok(arr(&data, "/organic_results")
                .into_iter()
                .take(limit)
                .map(|item| {
                    if engine == "google_scholar" {
                        scholar_hit(item)
                    } else {
                        let snippet = [s(item, "/snippet"), s(item, "/publication_info/summary")]
                            .into_iter()
                            .find(|x| !x.is_empty())
                            .unwrap_or_default();
                        page(
                            &s(item, "/title"),
                            &s(item, "/link"),
                            &snippet,
                            &s(item, "/date"),
                        )
                    }
                })
                .collect())
        }
        "exa" => {
            need_key("Exa")?;
            let mut body = json!({ "query": q, "numResults": limit, "contents": { "highlights": { "maxCharacters": 600 } } });
            if references {
                body["category"] = json!("publication");
            }
            let data = http
                .get_json(
                    &format!("{}/search", e.exa),
                    &[("x-api-key", c.api_key.as_str())],
                    Some(&body),
                )
                .await?;
            Ok(arr(&data, "/results")
                .into_iter()
                .map(|item| {
                    let highlights = arr(item, "/highlights")
                        .iter()
                        .map(|h| str_of(h))
                        .collect::<Vec<_>>()
                        .join(" … ");
                    let work = item
                        .get("entities")
                        .and_then(Value::as_array)
                        .and_then(|a| a.iter().find(|x| s(x, "/type") == "publication"))
                        .and_then(|x| x.get("properties"));
                    let summary = [
                        work.map(|w| s(w, "/abstract")).unwrap_or_default(),
                        highlights,
                        s(item, "/summary"),
                    ]
                    .into_iter()
                    .find(|x| !x.is_empty())
                    .unwrap_or_default();
                    match work {
                        None => {
                            let mut hit = page(
                                &s(item, "/title"),
                                &s(item, "/url"),
                                &summary,
                                &s(item, "/publishedDate"),
                            );
                            hit.rec.author = parse_name(&s(item, "/author")).into_iter().collect();
                            hit
                        }
                        Some(w) => {
                            let kind = match s(w, "/type").as_str() {
                                "article" | "review" => "article-journal",
                                "book" => "book",
                                "book-chapter" => "chapter",
                                "dissertation" => "thesis",
                                "report" => "report",
                                _ => "misc",
                            };
                            let year = [s(w, "/year"), s(w, "/date")]
                                .into_iter()
                                .find(|x| !x.is_empty())
                                .unwrap_or_default();
                            WebHit {
                                rec: Record {
                                    kind: kind.into(),
                                    title: [s(w, "/title"), s(item, "/title")]
                                        .into_iter()
                                        .find(|x| !x.is_empty())
                                        .unwrap_or_default(),
                                    author: arr(w, "/authors")
                                        .iter()
                                        .filter_map(|a| parse_name(&s(a, "/name")))
                                        .collect(),
                                    issued: issued_from_date(&year).unwrap_or_default(),
                                    doi: s(w, "/doi"),
                                    url: s(item, "/url"),
                                    ..Record::default()
                                },
                                summary,
                            }
                        }
                    }
                })
                .collect())
        }
        "tavily" => {
            need_key("Tavily")?;
            let body = if references {
                json!({ "query": q, "max_results": limit, "search_depth": "advanced", "include_domains": CITABLE_SITES, "include_domains_mode": "prefer", "include_published_date": true })
            } else {
                json!({ "query": q, "max_results": limit, "search_depth": "basic" })
            };
            let auth = format!("Bearer {}", c.api_key);
            let data = http
                .get_json(
                    &format!("{}/search", e.tavily),
                    &[("Authorization", auth.as_str())],
                    Some(&body),
                )
                .await?;
            Ok(arr(&data, "/results")
                .into_iter()
                .map(|i| {
                    page(
                        &s(i, "/title"),
                        &s(i, "/url"),
                        &s(i, "/content"),
                        &s(i, "/published_date"),
                    )
                })
                .collect())
        }
        "brave" => {
            need_key("Brave Search")?;
            let goggles = CITABLE_SITES
                .iter()
                .map(|site| format!("$boost=3,site={site}"))
                .collect::<Vec<_>>()
                .join("\n");
            let mut params = vec![
                ("q", q),
                ("count", n.as_str()),
                ("text_decorations", "false"),
            ];
            if references {
                params.push(("goggles", goggles.as_str()));
            }
            let data = http
                .get_json(
                    &format!("{}/res/v1/web/search?{}", e.brave, query(&params)),
                    &[
                        ("Accept", "application/json"),
                        ("X-Subscription-Token", c.api_key.as_str()),
                    ],
                    None,
                )
                .await?;
            Ok(arr(&data, "/web/results")
                .into_iter()
                .map(|i| {
                    page(
                        &s(i, "/title"),
                        &s(i, "/url"),
                        &s(i, "/description"),
                        &s(i, "/page_age"),
                    )
                })
                .collect())
        }
        // ponytail: the model's native search (decision 53) and DDGS (Python, session 3e) aren't built yet
        "llm" => Err(RefError::Lookup(
            "Search with the model isn’t available in this version yet.".into(),
        )),
        "ddgs" => Err(RefError::Lookup(
            "DDGS isn’t available in this version yet.".into(),
        )),
        other => Err(RefError::Lookup(format!(
            "Unknown search provider \"{other}\""
        ))),
    }
}

/// Each connection in order until one gives something; every failure said, keys redacted.
async fn try_connections<T, F, Fut>(config: &SearchConfig, mut run: F) -> Result<Vec<T>, RefError>
where
    F: FnMut(Connection) -> Fut,
    Fut: Future<Output = Result<Vec<T>, RefError>>,
{
    let mut errors = Vec::new();
    for c in config.ordered() {
        let provider = c.provider.clone();
        match run(c).await {
            Ok(found) if !found.is_empty() => return Ok(found),
            Ok(_) => errors.push(format!("{provider}: No usable results.")),
            Err(e) => errors.push(format!("{provider}: {}", config.redact(&e.to_string()))),
        }
    }
    Err(RefError::Lookup(if errors.is_empty() {
        "Set up a search connection in Settings › Search & Web.".into()
    } else {
        errors.join(" · ")
    }))
}

fn canonical(u: &str) -> String {
    url::Url::parse(u).map_or_else(
        |_| String::new(),
        |mut p| {
            p.set_fragment(None);
            p.to_string().trim_end_matches('/').to_owned()
        },
    )
}

/// Records for a free query, or the exact page for a known address (Exa's contents for it, else a search).
pub async fn reference_records(
    http: &Http,
    config: &SearchConfig,
    q: &str,
    target_url: &str,
) -> Result<Vec<Record>, RefError> {
    let partial: std::cell::RefCell<Option<Record>> = std::cell::RefCell::new(None);
    let result = try_connections(config, |c| {
        let partial = &partial;
        async move {
            let hits = if !target_url.is_empty() && c.provider == "exa" {
                if c.api_key.is_empty() {
                    return Err(RefError::Lookup("Exa needs an API key".into()));
                }
                let body = json!({ "urls": [target_url], "text": { "maxCharacters": 1000 } });
                let data = http.get_json(&format!("{}/contents", http.endpoints.exa), &[("x-api-key", c.api_key.as_str())], Some(&body)).await?;
                arr(&data, "/results")
                    .into_iter()
                    .map(|i| {
                        let mut hit = page(&s(i, "/title"), &s(i, "/url"), "", &s(i, "/publishedDate"));
                        hit.rec.author = parse_name(&s(i, "/author")).into_iter().collect();
                        hit
                    })
                    .collect()
            } else {
                let asked = if target_url.is_empty() { q.to_owned() } else { format!("Citation metadata: title, author, original publication date, publisher and DOI for {target_url}") };
                records(http, &c, &asked, 5, true).await?
            };
            let found: Vec<Record> = hits.into_iter().map(|h| h.rec).filter(|r| !r.title.is_empty() && (target_url.is_empty() || canonical(&r.url) == canonical(target_url))).collect();
            if target_url.is_empty() {
                return Ok(found);
            }
            for record in found {
                let previous = partial.borrow_mut().take();
                let merged = match previous {
                    Some(prev) => Record {
                        author: if prev.author.is_empty() { record.author.clone() } else { prev.author.clone() },
                        issued: if year_of(&prev).is_empty() { record.issued.clone() } else { prev.issued.clone() },
                        publisher: if prev.publisher.is_empty() { record.publisher.clone() } else { prev.publisher.clone() },
                        ..prev
                    },
                    None => record,
                };
                let done = !merged.author.is_empty() && !year_of(&merged).is_empty();
                *partial.borrow_mut() = Some(merged.clone());
                if done {
                    return Ok(vec![merged]);
                }
            }
            Ok(Vec::new())
        }
    })
    .await;
    match (result, partial.into_inner()) {
        (Ok(r), _) => Ok(r),
        (Err(_), Some(p)) => Ok(vec![p]),
        (Err(e), None) => Err(e),
    }
}

const LOOKUP_DEADLINE: Duration = Duration::from_secs(8);

/// A general web search for the Research tab: pages and papers from the connections, a DOI or arXiv result
/// upgraded with its record (four lookups at a time, eight seconds in all), the provider that answered.
pub async fn web_search(
    resolver: &Resolver,
    config: &SearchConfig,
    q: &str,
    limit: usize,
) -> Result<Vec<WebHit>, RefError> {
    let http = &resolver.http;
    let scholarly = std::sync::atomic::AtomicBool::new(false);
    let hits = try_connections(config, |c| {
        scholarly.store(
            matches!(c.provider.as_str(), "openalex" | "semanticscholar"),
            std::sync::atomic::Ordering::Relaxed,
        );
        async move {
            Ok(records(http, &c, q, limit.clamp(1, 10), true)
                .await?
                .into_iter()
                .filter(|h| {
                    !h.rec.title.is_empty()
                        && (!h.rec.doi.is_empty()
                            || h.rec.url.starts_with("http://")
                            || h.rec.url.starts_with("https://"))
                })
                .collect())
        }
    })
    .await?;
    if scholarly.load(std::sync::atomic::Ordering::Relaxed) {
        return Ok(hits);
    }
    let gate = Arc::new(Semaphore::new(4));
    let deadline = tokio::time::Instant::now() + LOOKUP_DEADLINE;
    let upgraded = hits.into_iter().map(|hit| {
        let gate = gate.clone();
        async move {
            let id = detect_input(if hit.rec.doi.is_empty() {
                &hit.rec.url
            } else {
                &hit.rec.doi
            });
            if !matches!(id.kind, ItemKind::Doi | ItemKind::Arxiv) {
                return hit;
            }
            // an arXiv id goes through its DataCite DOI: arXiv's own API allows one request every few seconds
            let doi = if id.kind == ItemKind::Doi {
                id.id.clone()
            } else {
                format!("10.48550/arXiv.{}", id.id)
            };
            let lookup = async {
                let _held = gate.acquire().await.ok()?;
                resolver.record_from_doi(&doi).await.ok()
            };
            match tokio::time::timeout_at(deadline, lookup).await {
                Ok(Some(mut rec)) => {
                    if !hit.rec.url.is_empty() {
                        rec.url.clone_from(&hit.rec.url);
                    }
                    WebHit {
                        rec,
                        summary: hit.summary,
                    }
                }
                _ => hit,
            }
        }
    });
    Ok(futures::future::join_all(upgraded).await)
}
