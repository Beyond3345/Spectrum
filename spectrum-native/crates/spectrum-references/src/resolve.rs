//! Looking a reference up: a DOI through doi.org's content negotiation (Crossref, `DataCite`) with Crossref's API
//! as the fallback, an arXiv id through arXiv's API (its published DOI preferred), a link through the page's
//! citation details, a title through Crossref's search (2.8's `referenceService.js`, the lookups).

use std::sync::LazyLock;
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;
use serde_json::Value;

use crate::csl::{Record, normalise_author, str_of, year_of};
use crate::detect::{Item, ItemKind, clean_doi};
use crate::error::RefError;
use crate::html::{is_challenge, read_html_citation, title_fits_page};
use crate::http::{Http, encode_doi, query};
use crate::search::SearchConfig;
use crate::text::{clean_text, normalise_title, re};

const CSL_JSON: &str = "application/vnd.citationstyles.csl+json";
const MAX_HTML_BYTES: usize = 3 * 1024 * 1024;
const NO_PAGE: &str =
    "That site didn’t return the page. Open it in a browser and paste the DOI instead.";

/// Now as JavaScript's `toISOString` writes it.
pub(crate) fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let days = i64::try_from(secs / 86_400).unwrap_or(0);
    let rem = secs % 86_400;
    // days since 1970-01-01 → civil date (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z",
        rem / 3600,
        rem / 60 % 60,
        rem % 60
    )
}

/// A work found by a lookup, and where it was read.
#[derive(Debug, Clone, PartialEq)]
pub struct FoundRecord {
    pub record: Record,
    pub source: String,
    /// False for a formatted citation no source confirmed, kept as it reads.
    pub verified: bool,
    /// An Open Library work, whose editions the card can offer.
    pub work: String,
}

impl FoundRecord {
    fn new(record: Record, source: &str) -> Self {
        Self {
            record,
            source: source.into(),
            verified: true,
            work: String::new(),
        }
    }
}

/// A work a search found that may be the one asked for.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct Candidate {
    /// What [`crate::add_reference`] takes: a DOI, "ISBN …" or a link.
    pub id: String,
    pub work: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: String,
    pub venue: String,
    pub doi: String,
}

/// A search hit: a work, or a book from the book search (its ISBN, which fetches it again, and its work).
#[derive(Debug, Clone, Default)]
pub(crate) struct Hit {
    pub rec: Record,
    pub isbn: String,
    pub work: String,
}

/// A lookup's outcome: a work, or a choice to make, or nothing.
#[derive(Debug, Clone, PartialEq)]
#[allow(clippy::large_enum_variant)]
pub enum Found {
    Record(FoundRecord),
    Choose(Vec<Candidate>),
    NotFound(String),
}

/// What looks references up. Clone freely.
#[derive(Clone, Default)]
pub struct Resolver {
    pub http: Http,
    /// The user's search connections, for pages that block Spectrum and titles nothing else knows.
    pub search: Option<SearchConfig>,
}

static TITLE_AND_YEAR_WORDS: LazyLock<Regex> = LazyLock::new(|| re(r"\bet al\b"));

/// How a Crossref hit fits the query, word order included: 0 not the same title; 1 the same title; 2 the same
/// title once a year and/or the hit's first-author surname typed with it are set aside, and those agree.
pub fn title_match(query: &str, item: &Record) -> u8 {
    let title = normalise_title(&clean_text(&item.title));
    let q = normalise_title(query);
    if title.is_empty() || q.is_empty() {
        return 0;
    }
    if q == title {
        return 1;
    }
    let surname: Vec<String> = item
        .author
        .first()
        .map(|a| {
            normalise_title(&normalise_author(a).family)
                .split(' ')
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let year = year_of(item);
    let (mut agrees, mut disagrees) = (false, false);
    let stripped = TITLE_AND_YEAR_WORDS.replace_all(&q, " ");
    let rest: Vec<&str> = stripped
        .split(' ')
        .filter(|w| {
            if w.len() == 4 && w.chars().all(|c| c.is_ascii_digit()) {
                if *w == year {
                    agrees = true;
                } else {
                    disagrees = true;
                }
                return false;
            }
            if surname.iter().any(|s| s == w) {
                agrees = true;
                return false;
            }
            !w.is_empty()
        })
        .collect();
    if agrees && !disagrees && rest.join(" ") == title {
        2
    } else {
        0
    }
}

/// The one hit to take without asking: exactly one has the query's title, and the year or author typed with it
/// agree. A bare title can belong to several works, so it's always a choice.
pub(crate) fn pick_candidate<'a>(query: &str, items: &'a [Hit]) -> Option<&'a Hit> {
    let scores: Vec<u8> = items.iter().map(|it| title_match(query, &it.rec)).collect();
    let i = scores.iter().position(|s| *s == 2)?;
    (scores.iter().filter(|s| **s > 0).count() == 1).then(|| &items[i])
}

fn to_candidate(hit: &Hit) -> Candidate {
    let rec = &hit.rec;
    let id = [
        rec.doi.clone(),
        if hit.isbn.is_empty() {
            String::new()
        } else {
            format!("ISBN {}", hit.isbn)
        },
        rec.url.clone(),
    ]
    .into_iter()
    .find(|s| !s.is_empty())
    .unwrap_or_default();
    let container = clean_text(&rec.container);
    Candidate {
        id,
        work: hit.work.clone(),
        title: clean_text(&rec.title),
        authors: rec
            .author
            .iter()
            .map(crate::csl::display_name)
            .filter(|s| !s.is_empty())
            .collect(),
        year: year_of(rec),
        venue: if container.is_empty() && !hit.isbn.is_empty() {
            clean_text(&rec.publisher)
        } else {
            container
        },
        doi: rec.doi.clone(),
    }
}

// figures, reviews, grants and recommendation records crowd out the papers themselves
const NOT_A_WORK: &[&str] = &["component", "peer-review", "grant", "dataset"];
static NOT_A_WORK_TITLE: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)^(?:Faculty Opinions recommendation of|(?:Figure|Table) \d+[:.])"));

pub(crate) fn crossref_items(v: &Value) -> Vec<Record> {
    v.pointer("/message/items")
        .and_then(Value::as_array)
        .map(|a| a.iter().map(Record::from_value).collect())
        .unwrap_or_default()
}

impl Resolver {
    pub fn new(http: Http) -> Self {
        Self { http, search: None }
    }

    /// A DOI's record: doi.org's CSL-JSON, else Crossref's API.
    pub async fn record_from_doi(&self, doi: &str) -> Result<Record, RefError> {
        let e = &self.http.endpoints;
        let mut status = 0;
        if let Ok(res) = self
            .http
            .get(&format!("{}/{}", e.doi, encode_doi(doi)), CSL_JSON)
            .await
        {
            status = res.status;
            if let Some(v) = res.json().filter(|_| res.ok())
                && !str_of(v.get("title").unwrap_or(&Value::Null)).is_empty()
            {
                let mut rec = Record::from_value(&v);
                if rec.doi.is_empty() {
                    doi.clone_into(&mut rec.doi);
                }
                return Ok(rec);
            }
        }
        let res = self
            .http
            .get(
                &format!("{}/works/{}", e.crossref, encode_doi(doi)),
                "application/json",
            )
            .await?;
        if res.ok()
            && let Some(message) = res.json().and_then(|v| v.get("message").cloned())
            && !str_of(message.get("title").unwrap_or(&Value::Null)).is_empty()
        {
            let mut rec = Record::from_value(&message);
            if rec.doi.is_empty() {
                doi.clone_into(&mut rec.doi);
            }
            return Ok(rec);
        }
        if status == 404 && res.status == 404 {
            return Err(RefError::NotFound(format!(
                "No record found for DOI {doi}."
            )));
        }
        Err(RefError::Lookup(format!(
            "Couldn’t fetch the details for DOI {doi} (HTTP {}).",
            if res.ok() { status } else { res.status }
        )))
    }

    /// An arXiv id's record: the published version through its DOI when there is one, else the preprint.
    pub async fn record_from_arxiv(&self, id: &str) -> Result<Record, RefError> {
        let url = format!("{}/api/query?id_list={id}", self.http.endpoints.arxiv);
        let res = self.http.get(&url, "application/atom+xml").await?;
        if !res.ok() {
            return Err(RefError::Lookup(format!(
                "arXiv lookup failed (HTTP {}).",
                res.status
            )));
        }
        let (doi, record) = crate::arxiv::arxiv_record_from_atom(&res.text(), id)
            .ok_or_else(|| RefError::NotFound(format!("No arXiv paper found with ID {id}.")))?;
        if !doi.is_empty()
            && let Ok(mut published) = Box::pin(self.record_from_doi(&clean_doi(&doi))).await
        {
            published.arxiv = record.arxiv;
            return Ok(published);
        }
        Ok(record)
    }

    /// A DOI or arXiv item's record; the web search upgrades its results with it.
    pub async fn record_for(&self, item: &Item) -> Result<Record, RefError> {
        if item.kind == ItemKind::Doi {
            self.record_from_doi(&item.id).await
        } else {
            self.record_from_arxiv(&item.id).await
        }
    }

    async fn record_from_page(&self, url: &str) -> Result<Record, RefError> {
        let (res, final_url) = self
            .http
            .get_page(
                url,
                "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                None,
                MAX_HTML_BYTES,
            )
            .await?;
        if res.status == 404 || res.status == 410 {
            return Err(RefError::NotFound(format!(
                "Couldn’t open that link (HTTP {}).",
                res.status
            )));
        }
        // 202/203 and friends are bot checks and interstitials, not the page
        if res.status != 200 {
            return Err(RefError::Lookup(if res.ok() {
                NO_PAGE.into()
            } else {
                format!("Couldn’t open that link (HTTP {}).", res.status)
            }));
        }
        let content_type = res.header("content-type").to_lowercase();
        if !content_type.is_empty()
            && !content_type.contains("html")
            && !content_type.contains("xml")
        {
            return Err(RefError::NotFound(
                "That link isn’t a web page with citation details.".into(),
            ));
        }
        let found = read_html_citation(&res.text(), &final_url, &iso_now()).ok_or_else(|| {
            RefError::NotFound("Couldn’t find citation details on that page.".into())
        })?;
        if !found.doi.is_empty() {
            match self.record_from_doi(&found.doi).await {
                Ok(record)
                    if found.page_title.is_empty()
                        || title_fits_page(&record.title, &found.page_title) =>
                {
                    return Ok(record);
                }
                Err(err) if found.record.is_none() => return Err(err),
                _ => {}
            }
        }
        if !found.arxiv.is_empty() {
            return self.record_from_arxiv(&found.arxiv).await;
        }
        let record = found.record.ok_or_else(|| {
            RefError::NotFound("Couldn’t find citation details on that page.".into())
        })?;
        if record.kind == "webpage" && is_challenge(&record, &final_url) {
            return Err(RefError::Lookup(NO_PAGE.into()));
        }
        Ok(record)
    }

    /// A link's record, with the search connections asked for what a blocked or thin page lacks.
    pub async fn record_from_url(&self, url: &str) -> Result<Record, RefError> {
        self.http.assert_public_url(url).await?;
        let (mut record, mut failure) = match self.record_from_page(url).await {
            Ok(r) => (Some(r), None),
            Err(e @ RefError::Blocked(_)) => return Err(e),
            Err(e) => (None, Some(e)),
        };
        let thin = record
            .as_ref()
            .is_none_or(|r| year_of(r).is_empty() || (r.author.is_empty() && r.editor.is_empty()));
        if let (Some(search), true) = (&self.search, thin) {
            let target = record.as_ref().map_or_else(
                || url.to_owned(),
                |r| {
                    if r.url.is_empty() {
                        url.to_owned()
                    } else {
                        r.url.clone()
                    }
                },
            );
            match crate::search::reference_records(&self.http, search, "", &target).await {
                Ok(found) => {
                    if let Some(extra) = found
                        .into_iter()
                        .next()
                        .filter(|x| !is_challenge(x, &x.url))
                    {
                        record = Some(match record {
                            Some(mut r) => {
                                if r.author.is_empty() {
                                    r.author = extra.author;
                                }
                                if year_of(&r).is_empty() {
                                    r.issued = extra.issued;
                                }
                                if r.doi.is_empty() {
                                    r.doi = extra.doi;
                                }
                                r
                            }
                            None => extra,
                        });
                    }
                }
                Err(e) => failure = Some(e),
            }
        }
        record.ok_or_else(|| {
            failure.unwrap_or_else(|| {
                RefError::NotFound("Couldn’t find citation details for that page.".into())
            })
        })
    }

    /// Up to 5 works for a query, those with its exact title first.
    pub(crate) async fn search_crossref(&self, q: &str) -> Result<Vec<Record>, RefError> {
        let url = format!(
            "{}/works?{}",
            self.http.endpoints.crossref,
            query(&[
                ("query.bibliographic", q),
                ("rows", "20"),
                ("select", "DOI,title,author,issued,container-title,type")
            ])
        );
        let res = self.http.get(&url, "application/json").await?;
        if !res.ok() {
            return Err(RefError::Lookup(format!(
                "Crossref search failed (HTTP {}).",
                res.status
            )));
        }
        let mut items: Vec<Record> = res
            .json()
            .map(|v| crossref_items(&v))
            .unwrap_or_default()
            .into_iter()
            .filter(|it| {
                !it.doi.is_empty()
                    && !it.title.is_empty()
                    && !NOT_A_WORK.contains(&it.kind.as_str())
                    && !NOT_A_WORK_TITLE.is_match(&clean_text(&it.title))
            })
            .collect();
        items.sort_by_key(|it| std::cmp::Reverse(title_match(q, it)));
        items.truncate(5);
        Ok(items)
    }

    /// A title: Crossref, the book search when Crossref has no work of that title, then the search connections.
    pub(crate) async fn search_title(&self, q: &str) -> Result<Found, RefError> {
        let mut failure = None;
        let mut hits: Vec<Hit> = match self.search_crossref(q).await {
            Ok(items) => items
                .into_iter()
                .map(|rec| Hit {
                    rec,
                    ..Hit::default()
                })
                .collect(),
            Err(e) => {
                failure = Some(e);
                Vec::new()
            }
        };
        if !hits.iter().any(|h| title_match(q, &h.rec) > 0) {
            hits.extend(self.search_books(q).await.unwrap_or_default());
        }
        if hits.is_empty()
            && let Some(search) = &self.search
        {
            hits = crate::search::reference_records(&self.http, search, q, "")
                .await?
                .into_iter()
                .map(|rec| Hit {
                    rec,
                    ..Hit::default()
                })
                .collect();
        }
        if hits.is_empty() {
            return match (failure, &self.search) {
                (Some(e), None) => Err(e),
                _ => Ok(Found::NotFound("No matching works found.".into())),
            };
        }
        let Some(pick) = pick_candidate(q, &hits) else {
            return Ok(Found::Choose(hits.iter().map(to_candidate).collect()));
        };
        if !pick.rec.doi.is_empty() {
            return Ok(Found::Record(FoundRecord::new(
                self.record_from_doi(&pick.rec.doi).await?,
                "Crossref",
            )));
        }
        if !pick.isbn.is_empty() {
            let mut found = self.record_from_isbn(&pick.isbn).await?;
            found.work.clone_from(&pick.work);
            return Ok(Found::Record(found));
        }
        Ok(Found::Record(FoundRecord::new(pick.rec.clone(), "")))
    }

    /// One item: its record, a choice, or nothing found.
    pub async fn find(&self, item: &Item) -> Result<Found, RefError> {
        let record = |r, s| Ok(Found::Record(FoundRecord::new(r, s)));
        match item.kind {
            ItemKind::Doi => record(self.record_from_doi(&item.id).await?, "doi.org"),
            ItemKind::Arxiv => record(self.record_from_arxiv(&item.id).await?, "arXiv"),
            ItemKind::Url => record(self.record_from_url(&item.id).await?, "the web page"),
            ItemKind::Isbn => Ok(Found::Record(self.record_from_isbn(&item.id).await?)),
            ItemKind::Citation => match &item.parsed {
                Some(p) => Ok(Found::Record(self.verify_citation(p, &item.input).await)),
                None => self.search_title(&item.id).await,
            },
            ItemKind::Ris => record(
                item.record.clone().unwrap_or_default(),
                "the RIS you pasted",
            ),
            ItemKind::Bibtex | ItemKind::Query => self.search_title(&item.id).await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::csl::Name;

    fn hit(doi: &str, title: &str, family: &str, year: i64) -> Hit {
        let rec = Record {
            doi: doi.into(),
            title: title.into(),
            author: if family.is_empty() {
                vec![]
            } else {
                vec![Name::family(family, "")]
            },
            issued: if year == 0 { vec![] } else { vec![year] },
            ..Record::default()
        };
        Hit {
            rec,
            ..Hit::default()
        }
    }

    #[test]
    fn auto_picks_a_query_only_on_an_exact_corroborated_title_match() {
        let items = [
            hit("10.1/a", "Neural Widgets for Everyone!", "Doe", 2023),
            hit("10.1/b", "Other", "", 0),
        ];
        let pick = |q: &str, items: &[Hit]| pick_candidate(q, items).map(|h| h.rec.doi.clone());
        assert_eq!(
            pick("Doe 2023 neural widgets for éveryone", &items).as_deref(),
            Some("10.1/a")
        );
        assert_eq!(
            pick("Neural widgets for everyone, Doe et al.", &items).as_deref(),
            Some("10.1/a")
        );
        assert_eq!(pick("neural widgets for everyone", &items), None);
        assert_eq!(pick("Neural widgets for everyone 2019", &items), None);
        let mineault = [hit(
            "10.1/m",
            "Is Attention All You Need?",
            "Mineault",
            2025,
        )];
        assert_eq!(pick("Attention is all you need 2025", &mineault), None);
        let twice = [
            items[0].clone(),
            hit("10.1/c", "Neural Widgets for Everyone!", "Doe", 2023),
        ];
        assert_eq!(pick("Doe 2023 neural widgets for everyone", &twice), None);
        assert_eq!(pick("widgets for everyone", &items), None);
        assert_eq!(pick("anything", &[]), None);
    }

    #[test]
    fn iso_now_has_javascripts_shape() {
        let now = iso_now();
        assert_eq!(now.len(), 24);
        assert!(now.starts_with("20") && &now[19..] == ".000Z" && &now[10..11] == "T");
    }
}
