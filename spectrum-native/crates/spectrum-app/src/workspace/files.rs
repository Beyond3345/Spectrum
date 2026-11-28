//! The sidebar's file list: the Blueprint 1 mockup lists files by their path from the project
//! folder (`diagrams/circuit.tex`), top-level files first, with a dot for each file's kind.

use spectrum_core::project::{EntryKind, TreeEntry};
use std::path::{Path, PathBuf};

/// What a file's dot says.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    /// LaTeX, Typst or Markdown you write.
    Source,
    Bibliography,
    /// A diagram composer file (in `diagrams/`).
    Diagram,
    /// Figures, PDFs and everything else.
    Other,
    /// A folder with nothing in it (folders with files show through their files' paths).
    Folder,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileItem {
    pub rel: PathBuf,
    pub label: String,
    pub kind: FileKind,
}

impl FileItem {
    pub fn is_dir(&self) -> bool {
        self.kind == FileKind::Folder
    }
}

pub fn kind_of(rel: &Path) -> FileKind {
    let ext = rel
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let in_diagrams = rel
        .components()
        .next()
        .is_some_and(|c| c.as_os_str().eq_ignore_ascii_case("diagrams"))
        && rel.components().count() > 1;
    match ext.as_str() {
        "bib" => FileKind::Bibliography,
        _ if in_diagrams => FileKind::Diagram,
        "tex" | "ltx" | "sty" | "cls" | "typ" | "md" | "markdown" => FileKind::Source,
        _ => FileKind::Other,
    }
}

/// `/`-separated, as the mockup and 2.8 write paths on every platform.
fn label_of(rel: &Path) -> String {
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// The list in sidebar order: files at the top level first, then files in folders, each by path;
/// empty folders show as `name/` so a file can still be made in them.
pub fn file_items(entries: &[TreeEntry]) -> Vec<FileItem> {
    let has_children = |dir: &Path| {
        entries
            .iter()
            .any(|e| e.rel != dir && e.rel.starts_with(dir))
    };
    let mut items: Vec<FileItem> = entries
        .iter()
        .filter(|e| e.kind == EntryKind::File || !has_children(&e.rel))
        .map(|e| {
            let dir = e.kind == EntryKind::Dir;
            let label = label_of(&e.rel);
            FileItem {
                label: if dir { format!("{label}/") } else { label },
                kind: if dir {
                    FileKind::Folder
                } else {
                    kind_of(&e.rel)
                },
                rel: e.rel.clone(),
            }
        })
        .collect();
    items.sort_by(|a, b| {
        let nested = |i: &FileItem| i.is_dir() || i.rel.components().count() > 1;
        (nested(a), a.label.to_lowercase()).cmp(&(nested(b), b.label.to_lowercase()))
    });
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(rel: &str, kind: EntryKind) -> TreeEntry {
        TreeEntry {
            rel: PathBuf::from(rel),
            kind,
        }
    }

    #[test]
    fn lists_like_the_mockup() {
        use EntryKind::{Dir, File};
        let entries = [
            entry("diagrams", Dir),
            entry("diagrams/circuit.tex", File),
            entry("empty", Dir),
            entry("figures", Dir),
            entry("figures/plot.pdf", File),
            entry("main.tex", File),
            entry("refs.bib", File),
        ];
        let items = file_items(&entries);
        let labels: Vec<_> = items.iter().map(|i| i.label.as_str()).collect();
        assert_eq!(
            labels,
            [
                "main.tex",
                "refs.bib",
                "diagrams/circuit.tex",
                "empty/",
                "figures/plot.pdf"
            ]
        );
        let kinds: Vec<_> = items.iter().map(|i| i.kind).collect();
        assert_eq!(
            kinds,
            [
                FileKind::Source,
                FileKind::Bibliography,
                FileKind::Diagram,
                FileKind::Folder,
                FileKind::Other
            ]
        );
    }

    #[test]
    fn a_top_level_file_named_diagrams_is_not_a_diagram() {
        assert_eq!(kind_of(Path::new("diagrams.tex")), FileKind::Source);
        assert_eq!(kind_of(Path::new("Diagrams/flow.tex")), FileKind::Diagram);
        assert_eq!(kind_of(Path::new("chapters/intro.TEX")), FileKind::Source);
    }
}
