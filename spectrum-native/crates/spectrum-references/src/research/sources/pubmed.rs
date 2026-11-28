//! PubMed through NCBI's E-utilities: `esearch` for the ids, `efetch` for the records. A key raises the rate;
//! `tool=Spectrum` as 2.8 sends it, and no email.

use futures::FutureExt;
use futures::future::BoxFuture;
use serde_json::Value;

use super::scholarly::plain;
use super::{PER_SOURCE, SearchContext, Source, tidy};
use crate::detect::clean_doi;
use crate::error::RefError;
use crate::http::{USER_AGENT, query};
use crate::research::ResearchResult;
use crate::xml::{Node, parse};

fn year_in(text: &str) -> String {
    crate::entry::four_digits(text).unwrap_or_default()
}

/// PubMed's efetch XML → results: titles and abstracts without their markup, structured abstracts with their
/// headings, group authors, the PMC copy.
pub fn parse_pubmed(xml: &str) -> Vec<ResearchResult> {
    let Some(root) = parse(xml) else {
        return Vec::new();
    };
    root.all("PubmedArticle")
        .map(|a| {
            let citation = a.first("MedlineCitation");
            let article = citation.and_then(|c| c.first("Article"));
            let text = |n: Option<&Node>| n.map(|n| plain(&n.text())).unwrap_or_default();
            let ids: Vec<&Node> = a
                .at(&["PubmedData", "ArticleIdList"])
                .map(|l| l.all("ArticleId").collect())
                .unwrap_or_default();
            let id_of = |kind: &str| {
                ids.iter()
                    .find(|i| i.attr("IdType") == kind)
                    .map(|i| plain(&i.text()))
                    .unwrap_or_default()
            };
            let date = article.and_then(|x| x.at(&["Journal", "JournalIssue", "PubDate"]));
            let year = {
                let y = text(date.and_then(|d| d.first("Year")));
                year_in(&if y.is_empty() {
                    text(date.and_then(|d| d.first("MedlineDate")))
                } else {
                    y
                })
            };
            let pmid = text(citation.and_then(|c| c.first("PMID")));
            let pmc = id_of("pmc");
            let doi = id_of("doi");
            let authors = article
                .and_then(|x| x.first("AuthorList"))
                .map(|l| {
                    l.all("Author")
                        .map(|au| {
                            let group = text(au.first("CollectiveName"));
                            if group.is_empty() {
                                [text(au.first("ForeName")), text(au.first("LastName"))]
                                    .into_iter()
                                    .filter(|s| !s.is_empty())
                                    .collect::<Vec<_>>()
                                    .join(" ")
                            } else {
                                group
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();
            let abstract_text = article
                .and_then(|x| x.first("Abstract"))
                .map(|ab| {
                    ab.all("AbstractText")
                        .map(|t| {
                            let label = t.attr("Label");
                            let body = plain(&t.text());
                            if label.is_empty() {
                                body
                            } else {
                                format!("{label}: {body}")
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .unwrap_or_default();
            let preprint = article
                .and_then(|x| x.first("PublicationTypeList"))
                .is_some_and(|l| {
                    l.all("PublicationType")
                        .any(|t| plain(&t.text()) == "Preprint")
                });
            tidy(ResearchResult {
                title: text(article.and_then(|x| x.first("ArticleTitle")))
                    .trim_end_matches('.')
                    .to_owned(),
                authors,
                year,
                venue: text(article.and_then(|x| x.at(&["Journal", "Title"]))),
                doi: if doi.is_empty() { doi } else { clean_doi(&doi) },
                url: if pmid.is_empty() {
                    String::new()
                } else {
                    format!("https://pubmed.ncbi.nlm.nih.gov/{pmid}/")
                },
                abstract_text,
                open_access: if pmc.is_empty() {
                    pmc
                } else {
                    format!("https://pmc.ncbi.nlm.nih.gov/articles/{pmc}/")
                },
                preprint: Some(preprint),
                ..ResearchResult::from("pubmed")
            })
        })
        .collect()
}

pub(crate) struct PubMed;

impl Source for PubMed {
    fn id(&self) -> &'static str {
        "pubmed"
    }
    fn label(&self) -> &'static str {
        "PubMed"
    }
    fn search<'a>(
        &'a self,
        question: &'a str,
        cx: &'a SearchContext<'a>,
    ) -> BoxFuture<'a, Result<Vec<ResearchResult>, RefError>> {
        async move {
            let http = &cx.resolver.http;
            let base = &http.endpoints.pubmed;
            let key = cx.keys.ncbi_key.as_str();
            let retmax = PER_SOURCE.to_string();
            let (from, to) = (
                cx.year_from.unwrap_or(1800).to_string(),
                cx.year_to.unwrap_or(3000).to_string(),
            );
            let mut params = vec![("db", "pubmed"), ("tool", "Spectrum")];
            if !key.is_empty() {
                params.push(("api_key", key));
            }
            let mut search = params.clone();
            search.extend([
                ("term", question),
                ("retmax", retmax.as_str()),
                ("retmode", "json"),
                ("sort", "relevance"),
            ]);
            if cx.year_from.is_some() || cx.year_to.is_some() {
                search.extend([
                    ("datetype", "pdat"),
                    ("mindate", from.as_str()),
                    ("maxdate", to.as_str()),
                ]);
            }
            let found = http
                .get_json(
                    &format!("{base}/esearch.fcgi?{}", query(&search)),
                    &[],
                    None,
                )
                .await?;
            let ids: Vec<String> = found
                .pointer("/esearchresult/idlist")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            if ids.is_empty() {
                return Ok(Vec::new());
            }
            let joined = ids.join(",");
            let mut fetch = params;
            fetch.extend([("id", joined.as_str()), ("retmode", "xml")]);
            let res = http
                .client()
                .get(format!("{base}/efetch.fcgi?{}", query(&fetch)))
                .header("User-Agent", USER_AGENT)
                .timeout(std::time::Duration::from_secs(30))
                .send()
                .await
                .map_err(|_| RefError::Lookup("Couldn’t reach PubMed.".into()))?;
            if !res.status().is_success() {
                return Err(RefError::Lookup(format!(
                    "PubMed returned {}.",
                    res.status().as_u16()
                )));
            }
            Ok(parse_pubmed(&res.text().await.unwrap_or_default()))
        }
        .boxed()
    }
}

#[cfg(test)]
mod tests {
    const PUBMED: &str = r#"<?xml version="1.0" ?><PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">42</PMID><Article>
<Journal><JournalIssue><PubDate><Year>2021</Year></PubDate></JournalIssue><Title>Journal of Attention</Title></Journal>
<ArticleTitle>Attention in <i>Drosophila</i> &amp; mice.</ArticleTitle><Abstract><AbstractText Label="BACKGROUND">Flies <sup>2</sup> attend.</AbstractText><AbstractText Label="RESULTS">They do.</AbstractText></Abstract>
<AuthorList><Author><LastName>Curie</LastName><ForeName>Marie</ForeName></Author><Author><CollectiveName>Fly Consortium</CollectiveName></Author></AuthorList>
<PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation>
<PubmedData><ArticleIdList><ArticleId IdType="pubmed">42</ArticleId><ArticleId IdType="doi">10.5555/fly</ArticleId><ArticleId IdType="pmc">PMC123</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>"#;

    #[test]
    fn pubmed_records_keep_clean_titles_structured_abstracts_and_pmc_copies() {
        let r = &super::parse_pubmed(PUBMED)[0];
        assert_eq!(r.title, "Attention in Drosophila & mice");
        assert_eq!(r.authors, ["Marie Curie", "Fly Consortium"]);
        assert_eq!(
            (r.year.as_str(), r.venue.as_str(), r.doi.as_str()),
            ("2021", "Journal of Attention", "10.5555/fly")
        );
        assert_eq!(r.url, "https://pubmed.ncbi.nlm.nih.gov/42/");
        assert_eq!(
            r.abstract_text,
            "BACKGROUND: Flies 2 attend. RESULTS: They do."
        );
        assert_eq!(
            r.open_access,
            "https://pmc.ncbi.nlm.nih.gov/articles/PMC123/"
        );
        assert_eq!(
            (r.preprint, r.sources.as_slice()),
            (Some(false), ["pubmed".to_owned()].as_slice())
        );
    }
}
