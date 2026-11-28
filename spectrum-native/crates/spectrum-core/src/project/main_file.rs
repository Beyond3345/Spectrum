//! Which file a project compiles (2.8's `detectMainFile`), never a sync app's conflict copy
//! (`conflictCopies.js`).

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::LazyLock;

use regex::{Regex, RegexBuilder};

use super::tree::{EntryKind, scan_tree, slash_path};
use crate::CoreError;

fn caseless(pattern: &str) -> Option<Regex> {
    RegexBuilder::new(pattern)
        .case_insensitive(true)
        .build()
        .ok()
}

// Synology Drive: <name>_<computer>_<Mon-D[D]-HHMM[SS]-YYYY>_<reason>[_n]
static SYNOLOGY: LazyLock<Option<Regex>> = LazyLock::new(|| {
    caseless(
        r"^(.+)_(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{1,2}-\d{4}(?:\d{2})?-\d{4}_[A-Za-z]*Conflict[A-Za-z]*(?:_\d+)?$",
    )
});
// Dropbox: "a (Andy's conflicted copy 2013-01-03)", "a (Case Conflict)"
static DROPBOX: LazyLock<Option<Regex>> = LazyLock::new(|| {
    caseless(
        r"^(.*\S) \((?:[^()]*conflicted copy[^()]*(?:\(\d+\))?|case conflict(?: \d+)?|unicode encoding conflict)\)(?: \(\d+\))?$",
    )
});
static DOCUMENTCLASS: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"\\documentclass\b").ok());
static BEGIN_DOCUMENT: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"\\begin\s*\{document\}").ok());

fn captures<'a>(re: &LazyLock<Option<Regex>>, text: &'a str) -> Option<&'a str> {
    re.as_ref()?.captures(text)?.get(1).map(|m| m.as_str())
}

fn found(re: &LazyLock<Option<Regex>>, text: &str) -> bool {
    re.as_ref().is_some_and(|re| re.is_match(text))
}

/// Node's `path.posix.extname`, near enough: from the last '.', unless that starts the name.
fn extname(name: &str) -> &str {
    match name.rfind('.') {
        Some(i) if i > 0 => &name[i..],
        _ => "",
    }
}

/// The conflict copies among '/'-separated paths, each with the path of its original. `machine_names` are the
/// system names of the user's computers, which `OneDrive` puts in its copies' names (`a-DESKTOP-AB12CD.txt`).
pub fn conflict_copies(paths: &[String], machine_names: &[String]) -> HashMap<String, String> {
    let files: HashSet<&str> = paths.iter().map(String::as_str).collect();
    let mut names: Vec<String> = machine_names
        .iter()
        .map(|n| n.trim().to_lowercase())
        .filter(|n| !n.is_empty())
        .collect();
    names.dedup();
    let mut copies = HashMap::new();
    for file in paths {
        let dir = &file[..file.rfind('/').map_or(0, |i| i + 1)];
        let base = &file[dir.len()..];
        let ext = extname(base);
        let stem = &base[..base.len() - ext.len()];
        let at = |name: &str| format!("{dir}{name}{ext}");
        let mut original = None;
        if let Some(head) = captures(&SYNOLOGY, stem) {
            // the computer's name follows the last '_', unless a longer original is in the project
            let parts: Vec<&str> = head.split('_').collect();
            original = (1..parts.len())
                .rev()
                .map(|i| at(&parts[..i].join("_")))
                .find(|c| files.contains(c.as_str()));
            if original.is_none() && parts.len() > 1 {
                original = Some(at(&parts[..parts.len() - 1].join("_")));
            }
        }
        if original.is_none()
            && let Some(head) = captures(&DROPBOX, stem)
        {
            original = Some(at(head));
        }
        if original.is_none() {
            let trimmed = stem.trim_end_matches(|c: char| c.is_ascii_digit());
            let numbered = trimmed
                .strip_suffix('-')
                .filter(|_| trimmed.len() < stem.len());
            for s in [Some(stem), numbered].into_iter().flatten() {
                let lower = s.to_lowercase();
                for n in &names {
                    if lower.ends_with(&format!("-{n}")) && s.len() > n.len() {
                        let candidate = at(&s[..s.len() - n.len() - 1]);
                        if files.contains(candidate.as_str()) {
                            original = Some(candidate);
                        }
                    }
                }
            }
        }
        if let Some(original) = original.filter(|o| o != file) {
            copies.insert(file.clone(), original);
        }
    }
    copies
}

/// Strips TeX comments: a '%' not straight after a backslash, to the end of its line.
fn without_comments(tex: &str) -> String {
    tex.lines()
        .map(|line| {
            let mut prev = '\0';
            let cut = line.char_indices().find(|&(_, c)| {
                let comment = c == '%' && prev != '\\';
                prev = c;
                comment
            });
            cut.map_or(line, |(i, _)| &line[..i])
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn depth(p: &str) -> usize {
    p.split('/').count()
}

/// JavaScript's `localeCompare`, near enough: case-insensitive first.
fn locale_cmp(a: &str, b: &str) -> Ordering {
    a.to_lowercase()
        .cmp(&b.to_lowercase())
        .then_with(|| a.cmp(b))
}

fn named(p: &str, name: &str) -> bool {
    p.rsplit('/')
        .next()
        .is_some_and(|base| base.eq_ignore_ascii_case(name))
}

/// The project's main file, '/'-separated: the .tex that compiles on its own (`\documentclass` and
/// `\begin{document}` outside comments), shallowest first, then main.tex, ms.tex, paper.tex, then by name;
/// else main.typ or the shallowest .typ; else a main.md (never another README.md).
pub fn detect_main_file(
    root: &Path,
    machine_names: &[String],
) -> Result<Option<String>, CoreError> {
    let files: Vec<String> = scan_tree(root)?
        .into_iter()
        .filter(|e| e.kind == EntryKind::File)
        .filter_map(|e| slash_path(&e.rel))
        .collect();
    let copies = conflict_copies(&files, machine_names);
    let candidates = |ext: &str| -> Vec<&String> {
        files
            .iter()
            .filter(|p| !copies.contains_key(*p) && p.to_lowercase().ends_with(ext))
            .collect()
    };

    let preferred = ["main.tex", "ms.tex", "paper.tex"];
    let rank = |p: &str| {
        preferred
            .iter()
            .position(|n| named(p, n))
            .unwrap_or(preferred.len())
    };
    let mut tex: Vec<&String> = candidates(".tex")
        .into_iter()
        .filter(|p| {
            // read as UTF-8 with replacement, as Node's readFile(…, 'utf8') does; one that can't be read is passed by
            std::fs::read(root.join(p)).is_ok_and(|bytes| {
                let text = without_comments(&String::from_utf8_lossy(&bytes));
                found(&DOCUMENTCLASS, &text) && found(&BEGIN_DOCUMENT, &text)
            })
        })
        .collect();
    tex.sort_by(|a, b| {
        depth(a)
            .cmp(&depth(b))
            .then(rank(a).cmp(&rank(b)))
            .then_with(|| locale_cmp(a, b))
    });
    if let Some(first) = tex.first() {
        return Ok(Some((*first).clone()));
    }

    let mut typst = candidates(".typ");
    typst.sort_by(|a, b| {
        named(b, "main.typ")
            .cmp(&named(a, "main.typ"))
            .then(depth(a).cmp(&depth(b)))
            .then_with(|| locale_cmp(a, b))
    });
    if let Some(first) = typst.first() {
        return Ok(Some((*first).clone()));
    }

    let mut markdown: Vec<&String> = candidates(".md")
        .into_iter()
        .filter(|p| named(p, "main.md"))
        .collect();
    markdown.sort_by(|a, b| depth(a).cmp(&depth(b)).then_with(|| locale_cmp(a, b)));
    Ok(markdown.first().map(|p| (*p).clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const DOC: &str = "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n";

    fn put(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    #[test]
    fn patterns_compile() {
        assert!(
            SYNOLOGY.is_some()
                && DROPBOX.is_some()
                && DOCUMENTCLASS.is_some()
                && BEGIN_DOCUMENT.is_some()
        );
    }

    #[test]
    fn shallowest_document_then_preferred_names() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        put(root, "zeta.tex", DOC);
        put(root, "paper.tex", DOC);
        put(root, "sub/main.tex", DOC);
        put(root, "chapter.tex", "\\section{One}");
        put(
            root,
            "commented.tex",
            "% \\documentclass{article}\n% \\begin{document}",
        );
        assert_eq!(
            detect_main_file(root, &[]).unwrap().as_deref(),
            Some("paper.tex")
        );
        put(root, "Main.tex", DOC);
        assert_eq!(
            detect_main_file(root, &[]).unwrap().as_deref(),
            Some("Main.tex")
        );
    }

    #[test]
    fn an_escaped_percent_is_not_a_comment() {
        assert_eq!(
            without_comments("50\\% done % note\n\\documentclass"),
            "50\\% done \n\\documentclass"
        );
    }

    #[test]
    fn never_a_conflict_copy() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        put(root, "main (Andy's conflicted copy 2013-01-03).tex", DOC);
        put(root, "main.tex", "\\input{x}");
        assert_eq!(detect_main_file(root, &[]).unwrap(), None);
        put(root, "main_Andy-PC_Jan-03-0901-2013_CaseConflict.tex", DOC);
        assert_eq!(detect_main_file(root, &[]).unwrap(), None);
        put(root, "main-DESKTOP-AB12CD.tex", DOC);
        assert_eq!(
            detect_main_file(root, &["DESKTOP-AB12CD".into()]).unwrap(),
            None
        );
        assert_eq!(
            detect_main_file(root, &[]).unwrap().as_deref(),
            Some("main-DESKTOP-AB12CD.tex")
        );
    }

    #[test]
    fn conflict_copy_originals() {
        let paths: Vec<String> = [
            "a_b.txt",
            "a_b_Andy-PC_Jan-03-0901-2013_CaseConflict_1.txt",
            "c (Case Conflict).txt",
            "d-PC-2.txt",
            "d.txt",
        ]
        .map(String::from)
        .to_vec();
        let copies = conflict_copies(&paths, &["pc".into()]);
        assert_eq!(
            copies["a_b_Andy-PC_Jan-03-0901-2013_CaseConflict_1.txt"],
            "a_b.txt"
        );
        assert_eq!(copies["c (Case Conflict).txt"], "c.txt");
        assert_eq!(copies["d-PC-2.txt"], "d.txt");
        assert_eq!(copies.len(), 3);
    }

    #[test]
    fn typst_then_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        put(root, "README.md", "# Hi");
        assert_eq!(detect_main_file(root, &[]).unwrap(), None);
        put(root, "notes/main.md", "# Hi");
        assert_eq!(
            detect_main_file(root, &[]).unwrap().as_deref(),
            Some("notes/main.md")
        );
        put(root, "a.typ", "");
        put(root, "deep/main.typ", "");
        assert_eq!(
            detect_main_file(root, &[]).unwrap().as_deref(),
            Some("deep/main.typ")
        );
    }
}
