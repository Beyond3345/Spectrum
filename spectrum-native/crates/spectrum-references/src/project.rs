//! The project's files as the references code reads them: its file list, a document with its `\input`s
//! inlined, its `.bib` files, and an entry appended without touching a byte already there. Blocking: run on a
//! background thread.

use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;
use spectrum_core::project::{EntryKind, scan_tree};

use crate::dedupe::BibFile;
use crate::error::RefError;
use crate::text::{re, without_comments};

/// Every file in the project, '/'-separated, as the file tree lists them.
pub(crate) fn project_files(root: &Path) -> Result<Vec<String>, RefError> {
    Ok(scan_tree(root)?
        .into_iter()
        .filter(|e| e.kind == EntryKind::File)
        .map(|e| slashed(&e.rel))
        .collect())
}

pub(crate) fn slashed(p: &Path) -> String {
    p.components()
        .filter_map(|c| match c {
            Component::Normal(n) => Some(n.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// A project path from a '/'-separated one; `None` for one that leaves the project.
pub(crate) fn safe_join(root: &Path, rel: &str) -> Option<PathBuf> {
    let mut out = root.to_path_buf();
    for part in rel.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => return None,
            p if p.contains(':') && cfg!(windows) => return None,
            p => out.push(p),
        }
    }
    Path::new(rel).is_relative().then_some(out)
}

/// `a/b/../c` → `a/c`.
pub(crate) fn normalise(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            ".." => {
                parts.pop();
            }
            "" | "." => {}
            p => parts.push(p),
        }
    }
    parts.join("/")
}

pub(crate) fn folder_of(path: &str) -> &str {
    path.rfind('/').map_or("", |k| &path[..=k])
}

static INPUT: LazyLock<Regex> = LazyLock::new(|| {
    re(r"\\(?:input|include|subfile)\s*\{([^}]+)\}|\\(sub)?import\*?\s*\{([^}]*)\}\s*\{([^}]+)\}")
});

/// The main file with its `\input`, `\include`, `\subfile`, `\import` and `\subimport` files inlined, looked
/// up from the main file's folder first, then the project's (2.8's `inlineInputs`). Also the files read.
pub(crate) fn inline_inputs(
    root: &Path,
    main: &str,
    strip_comments: bool,
) -> (String, Vec<String>) {
    fn visit(
        root: &Path,
        rel: &str,
        main_dir: &str,
        depth: usize,
        strip: bool,
        seen: &mut Vec<String>,
    ) -> Option<String> {
        if depth > 10 || seen.iter().any(|s| s == rel) {
            return Some(String::new());
        }
        let mut tex = fs::read_to_string(safe_join(root, rel)?).ok()?;
        seen.push(rel.to_owned());
        if strip {
            tex = without_comments(&tex);
        }
        let mut out = String::new();
        let mut last = 0;
        for c in INPUT.captures_iter(&tex) {
            let Some(m) = c.get(0) else { continue };
            let target = c.get(1).map_or_else(
                || {
                    normalise(&format!(
                        "{}/{}",
                        c.get(3).map_or("", |g| g.as_str().trim()),
                        c.get(4).map_or("", |g| g.as_str().trim())
                    ))
                },
                |g| g.as_str().trim().to_owned(),
            );
            let name = if Path::new(&target).extension().is_some() {
                target
            } else {
                format!("{target}.tex")
            };
            let child = c
                .get(2)
                .and_then(|_| {
                    visit(
                        root,
                        &normalise(&format!("{}{name}", folder_of(rel))),
                        main_dir,
                        depth + 1,
                        strip,
                        seen,
                    )
                })
                .or_else(|| {
                    visit(
                        root,
                        &normalise(&format!("{main_dir}{name}")),
                        main_dir,
                        depth + 1,
                        strip,
                        seen,
                    )
                })
                .or_else(|| visit(root, &normalise(&name), main_dir, depth + 1, strip, seen));
            out.push_str(&tex[last..m.start()]);
            out.push('\n');
            out.push_str(&child.unwrap_or_default());
            out.push('\n');
            last = m.end();
        }
        out.push_str(&tex[last..]);
        Some(out)
    }
    let mut seen = Vec::new();
    let text = visit(
        root,
        &normalise(main),
        folder_of(main),
        0,
        strip_comments,
        &mut seen,
    )
    .unwrap_or_default();
    (text, seen)
}

/// Every `.bib` in the project with its text; an unreadable one is left out.
pub(crate) fn read_bibs(root: &Path, files: &[String]) -> Vec<BibFile> {
    files
        .iter()
        .filter(|f| f.to_lowercase().ends_with(".bib"))
        .filter_map(|f| {
            let text = fs::read_to_string(safe_join(root, f)?).ok()?;
            Some(BibFile {
                file: f.clone(),
                text,
            })
        })
        .collect()
}

/// One entry appended, every existing byte untouched; one blank line between entries, the file's line ending.
pub(crate) fn append_entry(file: &Path, entry: &str) -> Result<(), RefError> {
    let existing = fs::read_to_string(file).unwrap_or_default();
    let eol = if existing.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let sep = if existing.trim().is_empty()
        || existing.ends_with("\n\n")
        || existing.ends_with("\r\n\r\n")
    {
        String::new()
    } else if existing.ends_with('\n') {
        eol.to_owned()
    } else {
        format!("{eol}{eol}")
    };
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| RefError::io("create", dir, e))?;
    }
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(file)
        .map_err(|e| RefError::io("open", file, e))?;
    f.write_all(format!("{sep}{}{eol}", entry.replace('\n', eol)).as_bytes())
        .map_err(|e| RefError::io("write to", file, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inlines_inputs_and_appends_entries() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("chapters")).unwrap();
        fs::write(
            root.join("main.tex"),
            "A\n\\input{chapters/one}\n% \\input{gone}\nB",
        )
        .unwrap();
        fs::write(root.join("chapters/one.tex"), "One \\bibliography{refs}").unwrap();
        let (text, files) = inline_inputs(root, "main.tex", true);
        assert!(
            text.contains("One \\bibliography{refs}") && !text.contains("gone"),
            "{text}"
        );
        assert_eq!(files, ["main.tex", "chapters/one.tex"]);
        let bib = root.join("refs.bib");
        fs::write(&bib, "@misc{a, title={A}}").unwrap();
        append_entry(&bib, "@misc{b,\n  title = {B},\n}").unwrap();
        assert_eq!(
            fs::read_to_string(&bib).unwrap(),
            "@misc{a, title={A}}\n\n@misc{b,\n  title = {B},\n}\n"
        );
        assert!(safe_join(root, "../x.bib").is_none());
        assert_eq!(normalise("a/./b/../c"), "a/c");
    }
}
