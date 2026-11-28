//! Each document's compiled PDF beside it (2.8's `compiledPdfs`), which checkpoints and GitHub leave out,
//! never a PDF a source includes.

use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use spectrum_core::project::{EntryKind, scan_tree};

use crate::error::Result;
use crate::util::slash;

static SOURCE: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"(?i)\.(tex|ltx|typ|md|markdown)$").ok());
static TEX: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"(?i)\.(tex|ltx)$").ok());
// a PDF a source includes: LaTeX's \includegraphics or \includepdf, Typst's image("…"), Markdown's ![…](…)
static INCLUDED: LazyLock<Option<Regex>> = LazyLock::new(|| {
    Regex::new(
        r#"\\include(?:graphics|pdf)\*?\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}|\bimage\(\s*"([^"]*)"|!\[[^\]]*\]\(\s*<?([^)\s>]*)"#,
    )
    .ok()
});
static COMMENT: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\\.|%[^\r\n]*").ok());
static DOCUMENTCLASS: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"\\documentclass\b").ok());

fn matches(re: &LazyLock<Option<Regex>>, text: &str) -> bool {
    re.as_ref().is_some_and(|re| re.is_match(text))
}

/// A .tex compiles on its own: a `\documentclass` outside a comment in its first 16 KB.
fn is_document(file: &Path) -> bool {
    let mut head = Vec::with_capacity(16384);
    let Ok(f) = fs::File::open(file) else {
        return false;
    };
    if f.take(16384).read_to_end(&mut head).is_err() {
        return false;
    }
    let text = String::from_utf8_lossy(&head);
    let visible = match COMMENT.as_ref() {
        Some(re) => re.replace_all(&text, |c: &regex::Captures| {
            let m = &c[0];
            if m.starts_with('%') {
                " ".repeat(m.len())
            } else {
                m.to_owned()
            }
        }),
        None => text,
    };
    matches(&DOCUMENTCLASS, &visible)
}

/// The compiled PDFs, '/'-separated: any .typ or Markdown file's, a .tex's only with `\documentclass`.
pub(crate) fn compiled_pdfs(root: &Path) -> Result<Vec<String>> {
    let mut docs = Vec::new();
    let mut included = HashSet::new();
    for entry in scan_tree(root)? {
        let Some(rel) = slash(&entry.rel) else {
            continue;
        };
        if entry.kind != EntryKind::File || !matches(&SOURCE, &rel) {
            continue;
        }
        let abs = root.join(&entry.rel);
        if !matches(&TEX, &rel) || is_document(&abs) {
            docs.push(rel);
        }
        let text = fs::read(&abs).map(|b| String::from_utf8_lossy(&b).into_owned());
        if let (Ok(text), Some(re)) = (text, INCLUDED.as_ref()) {
            for c in re.captures_iter(&text) {
                let Some(m) = (1..=3).find_map(|i| c.get(i)) else {
                    continue;
                };
                let name = m
                    .as_str()
                    .trim()
                    .rsplit('/')
                    .next()
                    .unwrap_or("")
                    .to_lowercase();
                included.insert(name.strip_suffix(".pdf").unwrap_or(&name).to_owned());
            }
        }
    }
    Ok(docs
        .into_iter()
        .filter_map(|rel| {
            let dot = rel.rfind('.')?;
            let pdf = format!("{}.pdf", &rel[..dot]);
            let name = pdf.rsplit('/').next()?.to_lowercase();
            (!included.contains(&name[..name.len() - 4])).then_some(pdf)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_documents_pdf_is_compiled_and_an_included_one_is_not() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::write(
            root.join("main.tex"),
            "% \\documentclass{x}\n\\documentclass{article}\n\\includegraphics[w=1]{figs/plot.pdf}",
        )
        .unwrap();
        fs::write(
            root.join("part.tex"),
            "% \\documentclass{article}\nJust text",
        )
        .unwrap();
        fs::write(root.join("notes.typ"), "#image(\"main.pdf\")").unwrap();
        fs::write(root.join("plot.md"), "# Plot").unwrap();
        let mut pdfs = compiled_pdfs(root).unwrap();
        pdfs.sort();
        // main.pdf is included by notes.typ, plot.pdf by main.tex
        assert_eq!(pdfs, ["notes.pdf"]);
    }
}
