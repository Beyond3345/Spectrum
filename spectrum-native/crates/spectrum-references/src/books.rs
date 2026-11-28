//! Books: an ISBN through Open Library, Google Books and Crossref; a title through Open Library's search, else
//! Google Books'; a work's editions; and a formatted citation checked against them and Crossref.

use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

use crate::csl::{Record, parse_name, str_of, year_issued, year_of};
use crate::detect::isbn_of;
use crate::entry::Edition;
use crate::error::RefError;
use crate::formatted::edition_of;
use crate::resolve::{FoundRecord, Hit, Resolver, crossref_items};
use crate::text::{clean_text, normalise_title, re};

fn title_with_subtitle(title: &str, subtitle: &str) -> String {
    clean_text(&if subtitle.is_empty() {
        title.to_owned()
    } else {
        format!("{title}: {subtitle}")
    })
}

static TRAILING_NON_DIGITS: LazyLock<Regex> = LazyLock::new(|| re(r"\D+$"));
static TITLE_TRAIL: LazyLock<Regex> = LazyLock::new(|| re(r"[,:;\s]+$"));
static EDITION_IN_TITLE: LazyLock<fancy_regex::Regex> =
    LazyLock::new(|| crate::text::fre(&format!(r"(?i)[,:\s]*(?:{})", crate::formatted::EDITION)));

/// A book record, its edition read from a title that holds one ("Introduction to Algorithms, fourth edition").
fn book_record(mut rec: Record, edition: &str) -> Record {
    let from_title = edition_of(&rec.title);
    if !from_title.is_empty() {
        let plain = EDITION_IN_TITLE.replace(&rec.title, "").into_owned();
        rec.title = TITLE_TRAIL.replace(&plain, "").into_owned();
    }
    let from_edition = edition_of(edition);
    let cleaned = TRAILING_NON_DIGITS
        .replace(&clean_text(edition), "")
        .into_owned();
    rec.edition = [from_edition, cleaned, from_title]
        .into_iter()
        .find(|e| !e.is_empty())
        .unwrap_or_default();
    rec.kind = "book".into();
    rec
}

fn s(v: &Value, path: &str) -> String {
    v.pointer(path).map(str_of).unwrap_or_default()
}

/// Open Library's `/api/books` with `jscmd=data`.
fn open_library_record(d: &Value, isbn: &str) -> Option<Record> {
    let title = s(d, "/title");
    if title.is_empty() {
        return None;
    }
    let rec = Record {
        title: title_with_subtitle(&title, &s(d, "/subtitle")),
        author: d
            .get("authors")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|x| parse_name(&s(x, "/name")))
                    .collect()
            })
            .unwrap_or_default(),
        issued: year_issued(&s(d, "/publish_date")),
        publisher: clean_text(&s(d, "/publishers/0/name")),
        place: clean_text(&s(d, "/publish_places/0/name")),
        isbn: vec![isbn.to_owned()],
        url: s(d, "/url"),
        ..Record::default()
    };
    Some(book_record(rec, &s(d, "/edition_name")))
}

fn identifiers(v: &Value) -> String {
    v.get("industryIdentifiers")
        .and_then(Value::as_array)
        .and_then(|a| {
            a.iter()
                .map(|i| isbn_of(&s(i, "/identifier")))
                .find(|i| !i.is_empty())
        })
        .unwrap_or_default()
}

/// A Google Books `volumeInfo`.
fn google_books_record(v: &Value) -> Option<Record> {
    let title = s(v, "/title");
    if title.is_empty() {
        return None;
    }
    let url = [s(v, "/canonicalVolumeLink"), s(v, "/infoLink")]
        .into_iter()
        .find(|u| !u.is_empty())
        .unwrap_or_default();
    let rec = Record {
        title: title_with_subtitle(&title, &s(v, "/subtitle")),
        author: v
            .get("authors")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|x| parse_name(&str_of(x))).collect())
            .unwrap_or_default(),
        issued: year_issued(&s(v, "/publishedDate")),
        publisher: clean_text(&s(v, "/publisher")),
        isbn: vec![identifiers(v)]
            .into_iter()
            .filter(|i| !i.is_empty())
            .collect(),
        url,
        ..Record::default()
    };
    Some(book_record(rec, ""))
}

fn first_isbn(rec: &Record) -> String {
    rec.isbn.first().cloned().unwrap_or_default()
}

impl Resolver {
    async fn json_or_none(&self, url: &str) -> Option<Value> {
        let res = self.http.get(url, "application/json").await.ok()?;
        res.ok().then(|| res.json()).flatten()
    }

    async fn json_or_fail(&self, url: &str) -> Result<Option<Value>, RefError> {
        let res = self.http.get(url, "application/json").await?;
        if !res.ok() {
            return Err(RefError::Lookup(format!(
                "The book search failed (HTTP {}).",
                res.status
            )));
        }
        Ok(res.json())
    }

    /// An ISBN's book: Open Library, then Google Books and Crossref for what the first one found lacks.
    pub async fn record_from_isbn(&self, isbn: &str) -> Result<FoundRecord, RefError> {
        let e = self.http.endpoints.clone();
        let mut record: Option<Record> = None;
        let mut source = "";
        for name in ["Open Library", "Google Books", "Crossref"] {
            let found = match name {
                "Open Library" => self
                    .json_or_none(&format!(
                        "{}/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data",
                        e.openlibrary
                    ))
                    .await
                    .and_then(|v| {
                        v.get(format!("ISBN:{isbn}"))
                            .and_then(|d| open_library_record(d, isbn))
                    }),
                "Google Books" => self
                    .json_or_none(&format!("{}/volumes?q=isbn:{isbn}", e.googlebooks))
                    .await
                    .and_then(|v| {
                        v.pointer("/items/0/volumeInfo")
                            .and_then(google_books_record)
                    }),
                _ => self
                    .json_or_none(&format!("{}/works?filter=isbn:{isbn}&rows=1", e.crossref))
                    .await
                    .and_then(|v| crossref_items(&v).into_iter().next())
                    .filter(|r| !r.title.is_empty()),
            };
            let Some(found) = found else { continue };
            match record.as_mut() {
                None => {
                    record = Some(Record {
                        isbn: vec![isbn.to_owned()],
                        ..found
                    });
                    source = name;
                }
                Some(r) => {
                    if r.author.is_empty() {
                        r.author = found.author;
                    }
                    if r.publisher.is_empty() {
                        r.publisher = found.publisher;
                    }
                    if r.place.is_empty() {
                        r.place = found.place;
                    }
                    if r.issued.is_empty() {
                        r.issued = found.issued;
                    }
                    if r.edition.is_empty() {
                        r.edition = found.edition;
                    }
                }
            }
            if let Some(r) = &record
                && !r.author.is_empty()
                && !r.publisher.is_empty()
                && !year_of(r).is_empty()
            {
                break;
            }
        }
        let record =
            record.ok_or_else(|| RefError::NotFound(format!("No book found for ISBN {isbn}.")))?;
        Ok(FoundRecord {
            record,
            source: source.into(),
            verified: true,
            work: String::new(),
        })
    }

    /// Books for a title, only those with an ISBN (which fetches them again).
    pub(crate) async fn search_books(&self, q: &str) -> Result<Vec<Hit>, RefError> {
        let e = self.http.endpoints.clone();
        let enc = crate::http::encode_component(q);
        let mut books: Vec<Hit> = Vec::new();
        let ol = format!(
            "{}/search.json?q={enc}&limit=5&fields=key,title,subtitle,author_name,first_publish_year,publisher,isbn,edition_count",
            e.openlibrary
        );
        if let Ok(Some(v)) = self.json_or_fail(&ol).await {
            for d in v
                .get("docs")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                let title = s(d, "/title");
                if title.is_empty() {
                    continue;
                }
                let isbn = d
                    .get("isbn")
                    .and_then(Value::as_array)
                    .and_then(|a| {
                        a.iter()
                            .map(|i| isbn_of(&str_of(i)))
                            .find(|i| !i.is_empty())
                    })
                    .unwrap_or_default();
                let rec = book_record(
                    Record {
                        title: title_with_subtitle(&title, &s(d, "/subtitle")),
                        author: d
                            .get("author_name")
                            .and_then(Value::as_array)
                            .map(|a| a.iter().filter_map(|x| parse_name(&str_of(x))).collect())
                            .unwrap_or_default(),
                        issued: year_issued(&s(d, "/first_publish_year")),
                        publisher: clean_text(&s(d, "/publisher/0")),
                        isbn: vec![isbn.clone()]
                            .into_iter()
                            .filter(|i| !i.is_empty())
                            .collect(),
                        ..Record::default()
                    },
                    "",
                );
                let key = s(d, "/key");
                let work = key
                    .rsplit('/')
                    .next()
                    .filter(|w| w.starts_with("OL") && w.ends_with('W'))
                    .unwrap_or("")
                    .to_owned();
                books.push(Hit { rec, isbn, work });
            }
        }
        if !books.iter().any(|b| !b.isbn.is_empty()) {
            let gb = format!(
                "{}/volumes?q={enc}&maxResults=5&printType=books",
                e.googlebooks
            );
            books = self
                .json_or_fail(&gb)
                .await
                .ok()
                .flatten()
                .and_then(|v| v.get("items").and_then(Value::as_array).cloned())
                .unwrap_or_default()
                .iter()
                .filter_map(|it| it.get("volumeInfo").and_then(google_books_record))
                .map(|rec| Hit {
                    isbn: first_isbn(&rec),
                    rec,
                    work: String::new(),
                })
                .collect();
        }
        let mut seen: Vec<String> = Vec::new();
        books.retain(|b| {
            !b.isbn.is_empty() && !seen.contains(&b.isbn) && {
                seen.push(b.isbn.clone());
                true
            }
        });
        Ok(books)
    }

    /// The editions of an Open Library work, newest first, and Google Books' for the same title and author where
    /// they have an ISBN Open Library doesn't list.
    pub async fn book_editions(
        &self,
        work: &str,
        title: &str,
        author: &str,
    ) -> Result<Vec<Edition>, RefError> {
        let valid = work.len() > 3
            && work.starts_with("OL")
            && work.ends_with('W')
            && work[2..work.len() - 1].chars().all(|c| c.is_ascii_digit());
        if !valid {
            return Err(RefError::Invalid("That isn’t an Open Library work.".into()));
        }
        let e = self.http.endpoints.clone();
        let mut editions: Vec<Edition> = Vec::new();
        let mut add = |ed: Edition| {
            if !ed.isbn.is_empty() && !editions.iter().any(|o| o.isbn == ed.isbn) {
                editions.push(ed);
            }
        };
        let year = |d: &str| {
            year_of(&Record {
                issued: year_issued(d),
                ..Record::default()
            })
        };
        if let Ok(Some(v)) = self
            .json_or_fail(&format!(
                "{}/works/{work}/editions.json?limit=50",
                e.openlibrary
            ))
            .await
        {
            for d in v
                .get("entries")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                let isbns = ["isbn_13", "isbn_10"]
                    .iter()
                    .flat_map(|k| {
                        d.get(*k)
                            .and_then(Value::as_array)
                            .cloned()
                            .unwrap_or_default()
                    })
                    .map(|i| isbn_of(&str_of(&i)));
                let name = s(d, "/edition_name");
                let edition = edition_of(&name);
                add(Edition {
                    isbn: isbns
                        .into_iter()
                        .find(|i| !i.is_empty())
                        .unwrap_or_default(),
                    year: year(&s(d, "/publish_date")),
                    publisher: clean_text(&s(d, "/publishers/0")),
                    place: clean_text(&s(d, "/publish_places/0")),
                    edition: if edition.is_empty() {
                        clean_text(&name).trim_end_matches(['.', ' ']).to_owned()
                    } else {
                        edition
                    },
                    format: clean_text(&s(d, "/physical_format")),
                    source: "Open Library".into(),
                });
            }
        }
        if !title.is_empty() {
            let q = format!(
                "intitle:{title}{}",
                if author.is_empty() {
                    String::new()
                } else {
                    format!(" inauthor:{author}")
                }
            );
            let url = format!(
                "{}/volumes?q={}&maxResults=10&printType=books",
                e.googlebooks,
                crate::http::encode_component(&q)
            );
            let items = self
                .json_or_fail(&url)
                .await
                .ok()
                .flatten()
                .and_then(|v| v.get("items").and_then(Value::as_array).cloned())
                .unwrap_or_default();
            for v in items.iter().filter_map(|it| it.get("volumeInfo")) {
                if normalise_title(&s(v, "/title")) != normalise_title(title) {
                    continue;
                }
                let print = s(v, "/printType");
                add(Edition {
                    isbn: identifiers(v),
                    year: year(&s(v, "/publishedDate")),
                    publisher: clean_text(&s(v, "/publisher")),
                    place: String::new(),
                    edition: edition_of(&format!("{} {}", s(v, "/title"), s(v, "/subtitle"))),
                    format: if print == "BOOK" {
                        String::new()
                    } else {
                        clean_text(&print)
                    },
                    source: "Google Books".into(),
                });
            }
        }
        editions.sort_by_key(|ed| std::cmp::Reverse(ed.year.parse::<u32>().unwrap_or(0)));
        Ok(editions)
    }

    /// A formatted citation checked online: the work Crossref has under the same title (and year), a book's ISBN
    /// from the book search, or else the citation as it reads.
    pub(crate) async fn verify_citation(&self, parsed: &Record, input: &str) -> FoundRecord {
        let want = normalise_title(&parsed.title);
        let year = year_of(parsed);
        let same_title = |rec: &Record| normalise_title(&clean_text(&rec.title)) == want;
        if let Ok(hits) = self.search_crossref(input).await
            && let Some(hit) = hits.iter().find(|r| {
                same_title(r) && (year.is_empty() || year_of(r).is_empty() || year_of(r) == year)
            })
            && let Ok(record) = self.record_from_doi(&hit.doi).await
        {
            return FoundRecord {
                record,
                source: "Crossref".into(),
                verified: true,
                work: String::new(),
            };
        }
        if parsed.kind == "book" {
            let q = [
                parsed.title.clone(),
                parsed
                    .author
                    .first()
                    .map(|a| a.family.clone())
                    .unwrap_or_default(),
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
            if let Ok(books) = self.search_books(&q).await
                && let Some(book) = books.iter().find(|b| same_title(&b.rec))
                && let Ok(found) = self.record_from_isbn(&book.isbn).await
            {
                // the edition pasted stands; the book found gives its ISBN when its year agrees
                let same_edition = year.is_empty() || year_of(&found.record) == year;
                let mut record = parsed.clone();
                record.isbn = if same_edition {
                    found.record.isbn.clone()
                } else {
                    Vec::new()
                };
                if record.publisher.is_empty() {
                    record.publisher.clone_from(&found.record.publisher);
                }
                if record.place.is_empty() {
                    record.place.clone_from(&found.record.place);
                }
                return FoundRecord {
                    record,
                    source: found.source,
                    verified: true,
                    work: String::new(),
                };
            }
        }
        FoundRecord {
            record: parsed.clone(),
            source: "the citation as pasted".into(),
            verified: false,
            work: String::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_an_edition_out_of_a_title() {
        let r = book_record(
            Record {
                title: "Introduction to Algorithms, fourth edition".into(),
                ..Record::default()
            },
            "",
        );
        assert_eq!(
            (r.title.as_str(), r.edition.as_str()),
            ("Introduction to Algorithms", "4")
        );
        assert_eq!(
            book_record(
                Record {
                    title: "T".into(),
                    ..Record::default()
                },
                "3rd"
            )
            .edition,
            "3"
        );
    }
}
