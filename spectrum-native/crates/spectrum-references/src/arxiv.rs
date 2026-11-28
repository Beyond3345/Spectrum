//! arXiv's API: an id's Atom entry as a record (`arxivRecordFromAtom`) and the search the Research tab runs
//! (`searchArxiv`).

use crate::csl::{ArxivRef, Record, parse_name};
use crate::detect::strip_version;
use crate::error::RefError;
use crate::http::{Http, USER_AGENT};
use crate::text::squash;
use crate::xml::{Node, parse};

/// Words a search leaves out: arXiv finds nothing for one when every word must match.
pub(crate) const STOPWORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "has",
    "have", "how", "in", "into", "is", "it", "its", "of", "on", "or", "that", "the", "their",
    "this", "to", "was", "what", "when", "where", "which", "who", "why", "with", "within",
    "without", "using", "use", "used", "based", "between", "about", "over", "under", "via", "vs",
    "versus",
];

/// One entry of a feed.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Paper {
    pub title: String,
    pub abstract_text: String,
    pub authors: Vec<String>,
    /// The entry's id, its abstract page (`http://arxiv.org/abs/1706.03762v7`).
    pub url: String,
    pub year: String,
    /// The published version's DOI and citation, when the authors gave them.
    pub doi: String,
    pub journal_ref: String,
    pub primary_class: String,
}

fn entries(xml: &str) -> Vec<Node> {
    parse(xml)
        .map(|feed| feed.all("entry").cloned().collect())
        .unwrap_or_default()
}

fn paper(entry: &Node) -> Paper {
    Paper {
        title: squash(&entry.child_text("title")),
        abstract_text: squash(&entry.child_text("summary")),
        authors: entry
            .all("author")
            .map(|a| squash(&a.child_text("name")))
            .filter(|n| !n.is_empty())
            .collect(),
        url: squash(&entry.child_text("id")),
        year: entry
            .child_text("published")
            .trim()
            .chars()
            .take(4)
            .collect(),
        doi: squash(&entry.child_text("arxiv:doi")),
        journal_ref: squash(&entry.child_text("arxiv:journal_ref")),
        primary_class: entry
            .first("arxiv:primary_category")
            .map(|n| n.attr("term").to_owned())
            .unwrap_or_default(),
    }
}

/// An id's entry → its published DOI ('' when none) and a preprint record; `None` for no entry or arXiv's error.
pub fn arxiv_record_from_atom(xml: &str, id: &str) -> Option<(String, Record)> {
    let entry = entries(xml).into_iter().next()?;
    let p = paper(&entry);
    if p.title.is_empty() || p.url.contains("/api/errors") {
        return None;
    }
    let record = Record {
        kind: "article".into(),
        title: p.title,
        author: p.authors.iter().filter_map(|a| parse_name(a)).collect(),
        issued: p.year.parse().map(|y| vec![y]).unwrap_or_default(),
        url: format!("https://arxiv.org/abs/{id}"),
        arxiv: Some(ArxivRef {
            id: id.to_owned(),
            primary_class: p.primary_class,
        }),
        ..Record::default()
    };
    Some((p.doi, record))
}

/// arXiv's search: every word must match (stop words aside), submissions within the years. At most 10.
pub async fn search_arxiv(
    http: &Http,
    query: &str,
    max: usize,
    year_from: Option<i32>,
    year_to: Option<i32>,
) -> Result<Vec<Paper>, RefError> {
    let max = max.clamp(1, 10);
    // arXiv reads words apart as OR, and ranks half its papers for a few common words, so every word must match
    let typed: Vec<String> = query
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()).to_owned())
        .filter(|w| !w.is_empty())
        .collect();
    let kept: Vec<&String> = typed
        .iter()
        .filter(|w| !STOPWORDS.contains(&w.to_lowercase().as_str()))
        .collect();
    let fallback = query.to_owned();
    let chosen: Vec<&String> = if !kept.is_empty() {
        kept
    } else if !typed.is_empty() {
        typed.iter().collect()
    } else {
        vec![&fallback]
    };
    let mut words: Vec<String> = chosen
        .iter()
        .map(|w| format!("all:{}", crate::http::encode_component(w)))
        .collect();
    if year_from.is_some() || year_to.is_some() {
        words.push(format!(
            "submittedDate:%5B{}01010000+TO+{}12312359%5D",
            year_from.unwrap_or(1991),
            year_to.unwrap_or(9999)
        ));
    }
    let url = format!(
        "{}/api/query?search_query={}&start=0&max_results={max}",
        http.endpoints.arxiv,
        words.join("+AND+")
    );
    let res = http
        .client()
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| RefError::Lookup("Couldn’t reach arXiv.".into()))?;
    if !res.status().is_success() {
        return Err(RefError::Lookup(format!(
            "arXiv search failed: {}",
            res.status().as_u16()
        )));
    }
    let xml = res.text().await.unwrap_or_default();
    Ok(entries(&xml).iter().map(paper).collect())
}

/// The id of an abstract page's address, without its version (`hep-th/9901001` kept whole).
pub(crate) fn id_of_url(url: &str) -> String {
    let id = url
        .find("arxiv.org/abs/")
        .map_or(url, |k| &url[k + "arxiv.org/abs/".len()..]);
    strip_version(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn atom(id: &str, doi: &str, title: &str) -> String {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/{id}v1</id>
    <title>{title}</title>
    <published>2021-01-01T00:00:00Z</published>
    <author><name>Ada Lovelace</name></author>
    <author><name>Charles Babbage</name></author>
    {}
    <arxiv:primary_category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>"#,
            if doi.is_empty() {
                String::new()
            } else {
                format!("<arxiv:doi>{doi}</arxiv:doi>")
            }
        )
    }

    #[test]
    fn parses_arxiv_atom_entries() {
        let (doi, rec) = arxiv_record_from_atom(
            &atom("2101.00002", "", "Preprint  Widgets\n  Again"),
            "2101.00002",
        )
        .unwrap();
        assert_eq!(doi, "");
        assert_eq!(rec.title, "Preprint Widgets Again");
        let names: Vec<(&str, &str)> = rec
            .author
            .iter()
            .map(|a| (a.given.as_str(), a.family.as_str()))
            .collect();
        assert_eq!(names, [("Ada", "Lovelace"), ("Charles", "Babbage")]);
        assert_eq!(rec.arxiv.unwrap().primary_class, "cs.LG");
        assert!(
            arxiv_record_from_atom("<feed xmlns=\"http://www.w3.org/2005/Atom\"></feed>", "x")
                .is_none()
        );
        assert_eq!(
            id_of_url("http://arxiv.org/abs/hep-th/9901001v2"),
            "hep-th/9901001"
        );
    }
}
