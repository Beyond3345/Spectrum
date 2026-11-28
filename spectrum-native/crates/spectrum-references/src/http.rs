//! The services the lookups call and how: their base addresses (tests point them at a local server), 2.8's
//! `User-Agent`, Crossref's one-at-a-time queue with a second between searches, retries on 429 and 503, and
//! pasted links kept off this computer and the local network.

use std::fmt::Write as _;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use reqwest::header::HeaderMap;
use serde_json::Value;
use tokio::sync::Mutex;
use url::Url;

use crate::error::RefError;

/// The base address of every service, without a trailing slash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoints {
    pub doi: String,
    pub crossref: String,
    pub arxiv: String,
    pub openlibrary: String,
    pub googlebooks: String,
    pub openalex: String,
    pub semantic_scholar: String,
    pub pubmed: String,
    pub unpaywall: String,
    pub exa: String,
    pub brave: String,
    pub tavily: String,
    pub serpapi: String,
    pub dblp: String,
    pub europepmc: String,
    pub inspire: String,
    pub doaj: String,
    pub datacite: String,
    pub hal: String,
    pub eric: String,
    /// Zotero's local server; 127.0.0.1, never localhost, which may resolve to `::1` where Zotero doesn't listen.
    pub zotero: String,
}

impl Default for Endpoints {
    fn default() -> Self {
        Self {
            doi: "https://doi.org".into(),
            crossref: "https://api.crossref.org".into(),
            arxiv: "https://export.arxiv.org".into(),
            openlibrary: "https://openlibrary.org".into(),
            googlebooks: "https://www.googleapis.com/books/v1".into(),
            openalex: "https://api.openalex.org".into(),
            semantic_scholar: "https://api.semanticscholar.org".into(),
            pubmed: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils".into(),
            unpaywall: "https://api.unpaywall.org".into(),
            exa: "https://api.exa.ai".into(),
            brave: "https://api.search.brave.com".into(),
            tavily: "https://api.tavily.com".into(),
            serpapi: "https://serpapi.com".into(),
            dblp: "https://dblp.org".into(),
            europepmc: "https://www.ebi.ac.uk/europepmc/webservices/rest".into(),
            inspire: "https://inspirehep.net".into(),
            doaj: "https://doaj.org".into(),
            datacite: "https://api.datacite.org".into(),
            hal: "https://api.archives-ouvertes.fr".into(),
            eric: "https://api.ies.ed.gov/eric".into(),
            zotero: "http://127.0.0.1:23119".into(),
        }
    }
}

impl Endpoints {
    /// Every service under one address, at `<base>/doi`, `<base>/crossref` and so on: for tests.
    pub fn local(base: &str) -> Self {
        let at = |p: &str| format!("{base}/{p}");
        Self {
            doi: at("doi"),
            crossref: at("crossref"),
            arxiv: at("arxiv"),
            openlibrary: at("openlibrary"),
            googlebooks: at("googlebooks"),
            openalex: at("openalex"),
            semantic_scholar: at("s2"),
            pubmed: at("pubmed"),
            unpaywall: at("unpaywall"),
            exa: at("exa"),
            brave: at("brave"),
            tavily: at("tavily"),
            serpapi: at("serpapi"),
            dblp: at("dblp"),
            europepmc: at("europepmc"),
            inspire: at("inspire"),
            doaj: at("doaj"),
            datacite: at("datacite"),
            hal: at("hal"),
            eric: at("eric"),
            zotero: at("zotero"),
        }
    }

    /// The lookup services' own hosts, which a pasted link may always name.
    fn trusted_hosts(&self) -> Vec<String> {
        [&self.doi, &self.crossref, &self.arxiv]
            .iter()
            .filter_map(|b| Url::parse(b).ok())
            .map(|u| host_port(&u))
            .collect()
    }
}

fn host_port(u: &Url) -> String {
    match u.port() {
        Some(p) => format!("{}:{p}", u.host_str().unwrap_or("")),
        None => u.host_str().unwrap_or("").to_owned(),
    }
}

/// An answer read whole.
#[derive(Debug, Clone)]
pub(crate) struct Reply {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl Reply {
    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status)
    }

    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    pub fn json(&self) -> Option<Value> {
        serde_json::from_slice(&self.body).ok()
    }

    pub fn header(&self, name: &str) -> &str {
        self.headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
    }
}

const TIMEOUT: Duration = Duration::from_secs(20);
const SEARCH_TIMEOUT: Duration = Duration::from_secs(30);
const SEARCH_GAP: Duration = Duration::from_secs(1);
pub(crate) const USER_AGENT: &str = "Spectrum/1.0";

/// The HTTP side of the crate. Clone it freely: clones share the client and Crossref's queue.
#[derive(Clone)]
pub struct Http {
    pub(crate) endpoints: Arc<Endpoints>,
    follow: reqwest::Client,
    manual: reqwest::Client,
    // Crossref's public pool takes one request at a time and about one search a second (doi.org hands Crossref
    // DOIs on to it): requests to either wait here, holding the time of the last search
    crossref: Arc<Mutex<Option<Instant>>>,
}

impl Default for Http {
    fn default() -> Self {
        Self::new(Endpoints::default())
    }
}

impl Http {
    pub fn new(endpoints: Endpoints) -> Self {
        let build = |policy| {
            reqwest::Client::builder()
                .redirect(policy)
                .build()
                .unwrap_or_default()
        };
        Self {
            endpoints: Arc::new(endpoints),
            follow: build(reqwest::redirect::Policy::limited(10)),
            manual: build(reqwest::redirect::Policy::none()),
            crossref: Arc::new(Mutex::new(None)),
        }
    }

    pub fn endpoints(&self) -> &Endpoints {
        &self.endpoints
    }

    async fn once(
        &self,
        client: &reqwest::Client,
        url: &str,
        accept: &str,
        timeout: Duration,
        max: usize,
    ) -> Result<Reply, RefError> {
        let host = Url::parse(url).map(|u| host_port(&u)).unwrap_or_default();
        let failed = |e: &reqwest::Error| {
            RefError::Lookup(if e.is_timeout() {
                format!("{host} took too long to respond.")
            } else {
                format!("Couldn’t reach {host}.")
            })
        };
        let run = async {
            let mut res = client
                .get(url)
                .header("User-Agent", USER_AGENT)
                .header("Accept", accept)
                .send()
                .await
                .map_err(|e| failed(&e))?;
            let status = res.status().as_u16();
            let headers = res.headers().clone();
            let mut body = Vec::new();
            if !(300..400).contains(&status) {
                while body.len() < max {
                    match res.chunk().await.map_err(|e| failed(&e))? {
                        Some(chunk) => body.extend_from_slice(&chunk),
                        None => break,
                    }
                }
                body.truncate(max);
            }
            Ok(Reply {
                status,
                headers,
                body,
            })
        };
        // the body's reading too
        tokio::time::timeout(timeout, run)
            .await
            .unwrap_or_else(|_| {
                Err(RefError::Lookup(format!(
                    "{host} took too long to respond."
                )))
            })
    }

    /// A lookup: Crossref and doi.org one at a time (searches a second apart), 429 and 503 tried twice more.
    pub(crate) async fn get(&self, url: &str, accept: &str) -> Result<Reply, RefError> {
        let queued =
            url.starts_with(&self.endpoints.crossref) || url.starts_with(&self.endpoints.doi);
        let search = queued && url.contains("/works?");
        for attempt in 0.. {
            let res = if queued {
                let mut last = self.crossref.lock().await;
                if search {
                    if let Some(at) = *last {
                        tokio::time::sleep(SEARCH_GAP.saturating_sub(at.elapsed())).await;
                    }
                    *last = Some(Instant::now());
                }
                self.once(&self.follow, url, accept, TIMEOUT, usize::MAX)
                    .await?
            } else {
                self.once(&self.follow, url, accept, TIMEOUT, usize::MAX)
                    .await?
            };
            if (res.status != 429 && res.status != 503) || attempt >= 2 {
                return Ok(res);
            }
            let wait = res
                .header("retry-after")
                .parse::<f64>()
                .unwrap_or(1.0)
                .clamp(0.0, 10.0);
            tokio::time::sleep(Duration::from_secs_f64(wait)).await;
        }
        Err(RefError::Lookup("Couldn’t reach the service.".into()))
    }

    /// A pasted link, at most 5 redirects, each checked like the link itself; `max` bytes of its body at most.
    /// Returns the answer and the address it came from.
    pub(crate) async fn get_page(
        &self,
        url: &str,
        accept: &str,
        timeout: Option<Duration>,
        max: usize,
    ) -> Result<(Reply, String), RefError> {
        let mut current = url.to_owned();
        for _ in 0..=5 {
            self.assert_public_url(&current).await?;
            let res = self
                .once(
                    &self.manual,
                    &current,
                    accept,
                    timeout.unwrap_or(TIMEOUT),
                    max,
                )
                .await?;
            let location = res.header("location").to_owned();
            if !(300..400).contains(&res.status) || location.is_empty() {
                return Ok((res, current));
            }
            current = Url::parse(&current)
                .and_then(|base| base.join(&location))
                .map_err(|_| {
                    RefError::Lookup(
                        "That link redirects somewhere that isn’t a web address.".into(),
                    )
                })?
                .to_string();
        }
        Err(RefError::Lookup(
            "That link redirects too many times.".into(),
        ))
    }

    /// JSON from a search API (2.8's `getJson`): no redirects, 30 s, the service's own words on an error.
    pub(crate) async fn get_json(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: Option<&Value>,
    ) -> Result<Value, RefError> {
        let host = Url::parse(url).map(|u| host_port(&u)).unwrap_or_default();
        let mut req = match body {
            Some(b) => self.manual.post(url).json(b),
            None => self.manual.get(url),
        };
        req = req.header("User-Agent", USER_AGENT);
        for (k, v) in headers {
            req = req.header(*k, *v);
        }
        let run = async {
            let res = req.send().await.map_err(|e| {
                RefError::Lookup(if e.is_timeout() {
                    format!("{host} took too long to respond.")
                } else {
                    format!("Couldn’t reach {host}.")
                })
            })?;
            let status = res.status().as_u16();
            let text = res.text().await.unwrap_or_default();
            let said: String = text.chars().take(200).collect();
            // some (SerpApi, Brave) also say so when the plan's searches have run out: keep what they said
            if status == 429 {
                return Err(RefError::Lookup(format!(
                    "{host} is limiting requests, or the plan’s searches have run out: {said}"
                )));
            }
            if !(200..300).contains(&status) {
                return Err(RefError::Lookup(format!(
                    "{host} returned {status}: {said}"
                )));
            }
            serde_json::from_str(&text).map_err(|_| {
                RefError::Lookup(format!("{host} sent an answer that couldn’t be read."))
            })
        };
        tokio::time::timeout(SEARCH_TIMEOUT, run)
            .await
            .unwrap_or_else(|_| {
                Err(RefError::Lookup(format!(
                    "{host} took too long to respond."
                )))
            })
    }

    /// A pasted link that may be opened: http or https, no username or password, not this computer or the local
    /// network. ponytail: checks the address before fetching; a DNS answer that changes in between isn't caught.
    pub(crate) async fn assert_public_url(&self, url: &str) -> Result<(), RefError> {
        let u = Url::parse(url)
            .map_err(|_| RefError::Blocked("Only http and https links can be looked up.".into()))?;
        if u.scheme() != "http" && u.scheme() != "https" {
            return Err(RefError::Blocked(
                "Only http and https links can be looked up.".into(),
            ));
        }
        if !u.username().is_empty() || u.password().is_some() {
            return Err(RefError::Blocked(
                "Links containing a username or password aren’t sent to citation services.".into(),
            ));
        }
        if self.endpoints.trusted_hosts().contains(&host_port(&u)) {
            return Ok(());
        }
        let blocked = || {
            RefError::Blocked(
                "That link points to this computer or the local network, so it wasn’t opened."
                    .into(),
            )
        };
        let name = u
            .host_str()
            .unwrap_or("")
            .trim_start_matches('[')
            .trim_end_matches(']')
            .to_lowercase();
        if name == "localhost" || name.ends_with(".localhost") {
            return Err(blocked());
        }
        let addresses: Vec<IpAddr> = match name.parse::<IpAddr>() {
            Ok(ip) => vec![ip],
            Err(_) => tokio::net::lookup_host((name.as_str(), 0))
                .await
                .map(|a| a.map(|s| s.ip()).collect())
                .unwrap_or_default(),
        };
        if addresses.iter().any(is_private) {
            return Err(blocked());
        }
        Ok(())
    }

    pub(crate) fn client(&self) -> &reqwest::Client {
        &self.manual
    }
}

/// This computer, the local network, link-local, multicast and the like.
pub(crate) fn is_private(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            a == 0
                || a == 10
                || a == 127
                || a >= 224
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192 && b == 168)
                || (a == 100 && (64..=127).contains(&b))
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_private(&IpAddr::V4(v4));
            }
            let first = v6.segments()[0];
            v6.is_unspecified()
                || v6.is_loopback()
                || (first & 0xfe00) == 0xfc00
                || (first & 0xffc0) == 0xfe80
                || (first & 0xff00) == 0xff00
        }
    }
}

/// A DOI as a URL path: each part between slashes percent-encoded.
pub(crate) fn encode_doi(doi: &str) -> String {
    doi.split('/')
        .map(encode_component)
        .collect::<Vec<_>>()
        .join("/")
}

/// `encodeURIComponent`.
pub(crate) fn encode_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(char::from(b));
        } else {
            let _ = write!(out, "%{b:02X}");
        }
    }
    out
}

/// `URLSearchParams` as a query string.
pub(crate) fn query(pairs: &[(&str, &str)]) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(pairs)
        .finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_addresses_are_known() {
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "172.20.0.1",
            "192.168.1.1",
            "169.254.0.1",
            "100.64.0.1",
            "0.0.0.0",
            "::1",
            "fd00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(is_private(&ip.parse().unwrap()), "{ip}");
        }
        for ip in ["8.8.8.8", "172.32.0.1", "2001:4860::8888"] {
            assert!(!is_private(&ip.parse().unwrap()), "{ip}");
        }
        assert_eq!(
            encode_doi("10.1002/(SICI)1097<857>"),
            "10.1002/(SICI)1097%3C857%3E"
        );
    }

    #[tokio::test]
    async fn pasted_links_stay_off_this_computer() {
        let http = Http::default();
        for url in [
            "http://localhost:8080/x",
            "http://127.0.0.1/x",
            "http://[::1]/",
            "ftp://example.com/",
            "https://user:pw@example.com/",
            "http://a.localhost/",
        ] {
            assert!(
                matches!(http.assert_public_url(url).await, Err(RefError::Blocked(_))),
                "{url}"
            );
        }
    }
}
