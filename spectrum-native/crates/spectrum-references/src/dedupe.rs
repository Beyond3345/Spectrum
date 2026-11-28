//! Whether a work is in the project's `.bib` already (2.8's `bibIdentity`, `findDuplicate`), which `.bib` an
//! add goes to (`pickBibTarget`, `texIncludesBib`), and the entries with the earlier one each duplicates
//! (Review's `bibRecords`).

use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;

use crate::bibtex::{BibEntry, line_of, parse_bib_entries};
use crate::csl::surname_key;
use crate::detect::{
    ARXIV_BARE_RE, ARXIV_LABELLED_RE, ARXIV_URL_RE, DOI_RE, clean_doi, isbn_of, strip_version,
};
use crate::entry::four_digits;
use crate::text::{latex_to_text, normalise_title, re, squash, without_comments};

/// What a work is known by. Strings are lower case where they're compared so; empty when unknown.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Identity {
    pub key: String,
    pub file: String,
    pub doi: String,
    pub isbn: String,
    pub arxiv: String,
    pub first_author: String,
    pub title: String,
    pub year: String,
    pub display_title: String,
}

static ARXIV_DOI: LazyLock<Regex> = LazyLock::new(|| re(r"^10\.48550/arxiv\.(.+)$"));
static AND: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\s+and\s+"));

/// An entry's identity, as 2.8 matches entries.
pub fn bib_identity(entry: &BibEntry, file: &str) -> Identity {
    let f = |n: &str| entry.get(n);
    let doi = DOI_RE
        .captures(f("doi"))
        .or_else(|| DOI_RE.captures(f("url")))
        .map(|c| clean_doi(&c[1]).to_lowercase())
        .unwrap_or_default();
    let mut arxiv = ARXIV_DOI
        .captures(&doi)
        .map(|c| c[1].to_owned())
        .unwrap_or_default();
    let prefix = if f("archiveprefix").is_empty() {
        f("eprinttype")
    } else {
        f("archiveprefix")
    };
    if arxiv.is_empty()
        && !f("eprint").is_empty()
        && (prefix.is_empty() || prefix.to_lowercase().contains("arxiv"))
    {
        let eprint = f("eprint");
        let eprint = eprint
            .get(..6)
            .filter(|p| p.eq_ignore_ascii_case("arxiv:"))
            .map_or(eprint, |_| eprint[6..].trim_start());
        if let Ok(Some(c)) = ARXIV_BARE_RE.captures(eprint) {
            arxiv = c.get(1).map_or(String::new(), |m| m.as_str().to_owned());
        }
    }
    if arxiv.is_empty() {
        let text = ["journal", "url", "note", "howpublished", "eprint"]
            .iter()
            .map(|n| f(n))
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        arxiv = ARXIV_URL_RE
            .captures(&text)
            .or_else(|| ARXIV_LABELLED_RE.captures(&text))
            .map(|c| c[1].to_owned())
            .unwrap_or_default();
    }
    let author = AND.split(f("author")).next().unwrap_or("").trim();
    let surname = if author.contains(',') {
        author.split(',').next().unwrap_or("")
    } else {
        author
    };
    let year_source = if f("year").is_empty() {
        f("date")
    } else {
        f("year")
    };
    Identity {
        key: entry.key.clone(),
        file: file.to_owned(),
        doi,
        isbn: if entry.kind == "book" {
            isbn_of(f("isbn"))
        } else {
            String::new()
        },
        arxiv: strip_version(&arxiv).to_lowercase(),
        first_author: surname_key(surname),
        title: normalise_title(f("title")),
        year: four_digits(year_source).unwrap_or_default(),
        display_title: squash(&latex_to_text(f("title"))),
    }
}

/// The entry that is this work: the same DOI, ISBN or arXiv id, or the same normalised title and year. A
/// generic title ("Deep learning") under two different DOIs also needs the same first author.
pub fn find_duplicate<'a>(index: &'a [Identity], id: &Identity) -> Option<&'a Identity> {
    let id_doi = id.doi.to_lowercase();
    let id_arxiv = id.arxiv.to_lowercase();
    let same_work = |e: &Identity| {
        !(!e.doi.is_empty() && !id_doi.is_empty() && e.doi != id_doi)
            || (!e.first_author.is_empty()
                && !id.first_author.is_empty()
                && e.first_author == id.first_author)
    };
    index.iter().find(|e| {
        (!id_doi.is_empty() && e.doi == id_doi)
            || (!id.isbn.is_empty() && e.isbn == id.isbn)
            || (!id_arxiv.is_empty() && e.arxiv == id_arxiv)
            || (!id.title.is_empty() && e.title == id.title && e.year == id.year && same_work(e))
    })
}

/// A `.bib` file and its text.
#[derive(Debug, Clone)]
pub struct BibFile {
    pub file: String,
    pub text: String,
}

/// Every entry of every file, as identities, in file order.
pub fn build_bib_index(files: &[BibFile]) -> Vec<Identity> {
    files
        .iter()
        .flat_map(|f| {
            parse_bib_entries(&f.text)
                .into_iter()
                .map(move |e| bib_identity(&e, &f.file))
        })
        .collect()
}

/// An earlier entry with another key that is the same work, and what matched.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DuplicateOf {
    pub key: String,
    pub file: String,
    /// "DOI", "arXiv id" or "title".
    pub by: String,
}

/// A `.bib` entry as Review reads it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BibRecord {
    pub file: String,
    pub line: usize,
    pub key: String,
    pub kind: String,
    /// The names of the fields it has.
    pub fields: Vec<String>,
    pub doi: String,
    pub title: String,
    pub duplicate_of: Option<DuplicateOf>,
}

/// Each entry with its file and line, and the earlier entry with another key it duplicates.
// ponytail: each entry against every earlier one, fine for a few thousand entries
pub fn bib_records(files: &[BibFile]) -> Vec<BibRecord> {
    let index = build_bib_index(files);
    let entries: Vec<(&BibFile, BibEntry)> = files
        .iter()
        .flat_map(|f| parse_bib_entries(&f.text).into_iter().map(move |e| (f, e)))
        .collect();
    entries
        .iter()
        .enumerate()
        .map(|(i, (f, e))| {
            let id = &index[i];
            let earlier: Vec<Identity> = index[..i]
                .iter()
                .filter(|x| x.key != e.key)
                .cloned()
                .collect();
            let twin = find_duplicate(&earlier, id);
            let duplicate_of = twin.map(|t| DuplicateOf {
                key: t.key.clone(),
                file: t.file.clone(),
                by: if !id.doi.is_empty() && t.doi == id.doi {
                    "DOI"
                } else if !id.arxiv.is_empty() && t.arxiv == id.arxiv {
                    "arXiv id"
                } else {
                    "title"
                }
                .to_owned(),
            });
            BibRecord {
                file: f.file.clone(),
                line: line_of(&f.text, e.at),
                key: e.key.clone(),
                kind: e.kind.clone(),
                fields: e.fields.iter().map(|(n, _)| n.clone()).collect(),
                doi: e.get("doi").to_owned(),
                title: id.display_title.clone(),
                duplicate_of,
            }
        })
        .collect()
}

fn base_name(p: &str) -> String {
    let p = p.trim().replace('\\', "/");
    let name = p.rsplit('/').next().unwrap_or("");
    let name = if name.len() > 4 && name[name.len() - 4..].eq_ignore_ascii_case(".bib") {
        &name[..name.len() - 4]
    } else {
        name
    };
    name.to_lowercase()
}

static LATEX_BIB: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\(?:bibliography|addbibresource)\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}"));
static TYPST_BIB: LazyLock<Regex> =
    LazyLock::new(|| re(r#"#bibliography\(\s*(\([^)]*\)|"[^"]*")"#));
static TYPST_COMMENT: LazyLock<Regex> = LazyLock::new(|| re(r"(?m)//.*$"));
static STRING: LazyLock<Regex> = LazyLock::new(|| re(r#""([^"]*)""#));

/// The `bibliography:` of a Markdown file's YAML front matter: one name or a list.
pub(crate) fn front_matter_bibliography(source: &str) -> Option<Vec<String>> {
    let body = source
        .strip_prefix("---\n")
        .or_else(|| source.strip_prefix("---\r\n"))?;
    let end = body.lines().position(|l| l == "---" || l == "...")?;
    let lines: Vec<&str> = body.lines().take(end).collect();
    let at = lines.iter().position(|l| l.starts_with("bibliography:"))?;
    let unquote = |s: &str| s.trim().trim_matches(|c| c == '"' || c == '\'').to_owned();
    let inline = lines[at]["bibliography:".len()..].trim();
    if !inline.is_empty() {
        let inline = inline.trim_start_matches('[').trim_end_matches(']');
        return Some(
            inline
                .split(',')
                .map(unquote)
                .filter(|s| !s.is_empty())
                .collect(),
        );
    }
    Some(
        lines[at + 1..]
            .iter()
            .take_while(|l| l.trim_start().starts_with('-'))
            .map(|l| unquote(l.trim_start().trim_start_matches('-')))
            .filter(|s| !s.is_empty())
            .collect(),
    )
}

/// Whether any source loads the `.bib`: LaTeX's `\bibliography{…}` or `\addbibresource{…}`, Typst's
/// `#bibliography("…")`, or a Markdown front matter's `bibliography`.
pub fn tex_includes_bib(sources: &[String], bib_file: &str) -> bool {
    let name = base_name(bib_file);
    sources.iter().any(|source| {
        let front = front_matter_bibliography(source).unwrap_or_default();
        let text = without_comments(source);
        let latex = LATEX_BIB
            .captures_iter(&text)
            .flat_map(|c| c[1].split(',').map(str::to_owned).collect::<Vec<_>>());
        let typst_text = TYPST_COMMENT.replace_all(source, "");
        let typst = TYPST_BIB.captures_iter(&typst_text).flat_map(|c| {
            STRING
                .captures_iter(&c[1])
                .map(|s| s[1].to_owned())
                .collect::<Vec<_>>()
        });
        front
            .into_iter()
            .chain(latex)
            .chain(typst)
            .any(|p| base_name(&p) == name)
    })
}

/// A `.bib` path the user chose that isn't a project `.bib` (`..`, `.spectrum/`, not `.bib`).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("That bibliography file isn’t valid.")]
pub struct BadBibFile;

/// The `.bib` an add goes to: the one asked for; else one the sources load; else `references.bib`; else the
/// first; else a new `references.bib` (`refs.bib` in a Typst project). Candidates in the order
/// `references.bib`, then shallowest, then by name.
pub fn pick_bib_target(
    files: &[String],
    requested: &str,
    sources: &[String],
    typst: bool,
) -> Result<String, BadBibFile> {
    if !requested.is_empty() {
        let mut rel = requested.replace('\\', "/");
        while let Some(r) = rel.strip_prefix("./") {
            rel = String::from(r);
        }
        let bad = rel.split('/').any(|p| {
            p.is_empty()
                || p == ".."
                || p.eq_ignore_ascii_case(".spectrum")
                || p.eq_ignore_ascii_case(".git")
        });
        if !rel.to_lowercase().ends_with(".bib") || bad || Path::new(&rel).is_absolute() {
            return Err(BadBibFile);
        }
        return Ok(rel);
    }
    let mut bibs: Vec<&String> = files
        .iter()
        .filter(|f| f.to_lowercase().ends_with(".bib"))
        .collect();
    bibs.sort_by(|a, b| {
        (*b == "references.bib")
            .cmp(&(*a == "references.bib"))
            .then(a.split('/').count().cmp(&b.split('/').count()))
            .then(a.cmp(b))
    });
    Ok(bibs
        .iter()
        .find(|b| tex_includes_bib(sources, b))
        .or_else(|| bibs.first())
        .map_or_else(
            || if typst { "refs.bib" } else { "references.bib" }.to_owned(),
            |b| (*b).clone(),
        ))
}

#[cfg(test)]
mod tests;
