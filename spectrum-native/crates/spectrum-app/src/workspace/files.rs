//! The sidebar's Files tree (Blueprint 1): real folders that open and close with a chevron, never
//! flattened paths. Each folder lists its files first, then its subfolders, each by name, so
//! `main.tex` stays at the top as in the mockup. Also the arrow-key moves on the tree's rows.

use spectrum_core::project::{EntryKind, TreeEntry};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

/// What a row's line icon says.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    /// LaTeX, Typst or Markdown you write.
    Source,
    Bibliography,
    /// A diagram composer file (in `diagrams/`).
    Diagram,
    Image,
    /// PDFs and everything else.
    Other,
    Folder,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileItem {
    pub rel: PathBuf,
    /// The file or folder's own name.
    pub label: String,
    pub kind: FileKind,
    /// Nesting level: 0 at the project's top.
    pub depth: usize,
    /// A folder's direct children (shown beside it while it is closed).
    pub children: usize,
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
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "eps" | "webp" | "tif" | "tiff" | "bmp" => {
            FileKind::Image
        }
        _ => FileKind::Other,
    }
}

fn name_of(rel: &Path) -> String {
    rel.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Every file and folder in tree order (depth first). `entries` is `scan_tree`'s list, which
/// names each folder before what is in it.
pub fn file_items(entries: &[TreeEntry]) -> Vec<FileItem> {
    let mut by_parent: BTreeMap<&Path, Vec<&TreeEntry>> = BTreeMap::new();
    for e in entries {
        by_parent
            .entry(e.rel.parent().unwrap_or(Path::new("")))
            .or_default()
            .push(e);
    }
    let mut out = Vec::with_capacity(entries.len());
    walk(Path::new(""), 0, &by_parent, &mut out);
    out
}

fn walk(
    dir: &Path,
    depth: usize,
    by_parent: &BTreeMap<&Path, Vec<&TreeEntry>>,
    out: &mut Vec<FileItem>,
) {
    let Some(kids) = by_parent.get(dir) else {
        return;
    };
    let mut kids = kids.clone();
    kids.sort_by_cached_key(|e| (e.kind == EntryKind::Dir, name_of(&e.rel).to_lowercase()));
    for e in kids {
        let is_dir = e.kind == EntryKind::Dir;
        out.push(FileItem {
            rel: e.rel.clone(),
            label: name_of(&e.rel),
            kind: if is_dir {
                FileKind::Folder
            } else {
                kind_of(&e.rel)
            },
            depth,
            children: by_parent.get(e.rel.as_path()).map_or(0, Vec::len),
        });
        if is_dir {
            walk(&e.rel, depth + 1, by_parent, out);
        }
    }
}

/// The indices of the rows shown: everything not inside a closed folder.
pub fn visible(items: &[FileItem], expanded: &HashSet<PathBuf>) -> Vec<usize> {
    let mut shown = Vec::new();
    let mut closed: Option<&Path> = None;
    for (ix, item) in items.iter().enumerate() {
        if let Some(dir) = closed {
            if item.rel.starts_with(dir) {
                continue;
            }
            closed = None;
        }
        shown.push(ix);
        if item.is_dir() && !expanded.contains(&item.rel) {
            closed = Some(&item.rel);
        }
    }
    shown
}

/// The folders holding `rel`, innermost first.
pub fn ancestors(rel: &Path) -> impl Iterator<Item = PathBuf> + '_ {
    rel.ancestors()
        .skip(1)
        .filter(|a| !a.as_os_str().is_empty())
        .map(Path::to_path_buf)
}

/// A key pressed on the tree.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreeKey {
    Up,
    Down,
    Left,
    Right,
    Enter,
    Home,
    End,
}

impl TreeKey {
    pub fn from_key(key: &str) -> Option<Self> {
        Some(match key {
            "up" => Self::Up,
            "down" => Self::Down,
            "left" => Self::Left,
            "right" => Self::Right,
            "enter" => Self::Enter,
            "home" => Self::Home,
            "end" => Self::End,
            _ => return None,
        })
    }
}

/// What a key does to the tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TreeMove {
    Select(PathBuf),
    Expand(PathBuf),
    Collapse(PathBuf),
    Open(PathBuf),
}

/// 2.8's tree keys: Up and Down move through the rows shown, Home and End jump to the ends; Right
/// opens a folder, then enters it; Left closes it, or goes to the folder above; Enter opens a file
/// or opens and closes a folder.
pub fn tree_key(
    items: &[FileItem],
    expanded: &HashSet<PathBuf>,
    selected: Option<&Path>,
    key: TreeKey,
) -> Option<TreeMove> {
    let rows = visible(items, expanded);
    let at = selected.and_then(|s| rows.iter().position(|&ix| items[ix].rel == s));
    let row = |pos: usize| TreeMove::Select(items[rows[pos]].rel.clone());
    let last = rows.len().checked_sub(1)?;
    let Some(at) = at else {
        return match key {
            TreeKey::Up | TreeKey::End => Some(row(last)),
            TreeKey::Down | TreeKey::Home => Some(row(0)),
            _ => None,
        };
    };
    let item = &items[rows[at]];
    let open = item.is_dir() && expanded.contains(&item.rel);
    match key {
        TreeKey::Up => at.checked_sub(1).map(row),
        TreeKey::Down => (at < last).then(|| row(at + 1)),
        TreeKey::Home => Some(row(0)),
        TreeKey::End => Some(row(last)),
        TreeKey::Right if item.is_dir() && !open => Some(TreeMove::Expand(item.rel.clone())),
        TreeKey::Right if open && item.children > 0 => Some(row(at + 1)),
        TreeKey::Right => None,
        TreeKey::Left if open => Some(TreeMove::Collapse(item.rel.clone())),
        TreeKey::Left => ancestors(&item.rel).next().map(TreeMove::Select),
        TreeKey::Enter if item.is_dir() => Some(if open {
            TreeMove::Collapse(item.rel.clone())
        } else {
            TreeMove::Expand(item.rel.clone())
        }),
        TreeKey::Enter => Some(TreeMove::Open(item.rel.clone())),
    }
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

    /// The mockup's project, in `scan_tree`'s order.
    fn mockup() -> Vec<FileItem> {
        use EntryKind::{Dir, File};
        file_items(&[
            entry("diagrams", Dir),
            entry("diagrams/circuit.tex", File),
            entry("diagrams/parts", Dir),
            entry("diagrams/parts/r.tex", File),
            entry("figures", Dir),
            entry("figures/a.png", File),
            entry("figures/b.pdf", File),
            entry("figures/C.jpg", File),
            entry("main.tex", File),
            entry("refs.bib", File),
        ])
    }

    fn set(paths: &[&str]) -> HashSet<PathBuf> {
        paths.iter().map(PathBuf::from).collect()
    }

    fn shown(items: &[FileItem], expanded: &HashSet<PathBuf>) -> Vec<String> {
        visible(items, expanded)
            .into_iter()
            .map(|ix| format!("{}{}", "  ".repeat(items[ix].depth), items[ix].label))
            .collect()
    }

    #[test]
    fn builds_folders_with_files_first() {
        let items = mockup();
        let kinds: Vec<_> = items.iter().map(|i| (i.label.as_str(), i.kind)).collect();
        assert_eq!(
            kinds,
            [
                ("main.tex", FileKind::Source),
                ("refs.bib", FileKind::Bibliography),
                ("diagrams", FileKind::Folder),
                ("circuit.tex", FileKind::Diagram),
                ("parts", FileKind::Folder),
                ("r.tex", FileKind::Diagram),
                ("figures", FileKind::Folder),
                ("a.png", FileKind::Image),
                ("b.pdf", FileKind::Other),
                ("C.jpg", FileKind::Image),
            ]
        );
        let figures = items.iter().find(|i| i.label == "figures").unwrap();
        assert_eq!((figures.depth, figures.children), (0, 3));
        assert_eq!(items.iter().find(|i| i.label == "r.tex").unwrap().depth, 2);
    }

    #[test]
    fn closed_folders_hide_everything_inside() {
        let items = mockup();
        assert_eq!(
            shown(&items, &HashSet::new()),
            ["main.tex", "refs.bib", "diagrams", "figures"]
        );
        // diagrams open, its subfolder closed, figures closed (the snapshot's state)
        assert_eq!(
            shown(&items, &set(&["diagrams"])),
            [
                "main.tex",
                "refs.bib",
                "diagrams",
                "  circuit.tex",
                "  parts",
                "figures"
            ]
        );
        // an open folder inside a closed one stays hidden
        assert_eq!(shown(&items, &set(&["diagrams/parts"])).len(), 4);
        assert_eq!(
            shown(&items, &set(&["diagrams", "diagrams/parts", "figures"])).len(),
            10
        );
    }

    #[test]
    fn a_top_level_file_named_diagrams_is_not_a_diagram() {
        assert_eq!(kind_of(Path::new("diagrams.tex")), FileKind::Source);
        assert_eq!(kind_of(Path::new("Diagrams/flow.tex")), FileKind::Diagram);
        assert_eq!(kind_of(Path::new("chapters/intro.TEX")), FileKind::Source);
    }

    #[test]
    fn arrow_keys_walk_the_rows_shown() {
        let items = mockup();
        let open = set(&["diagrams"]);
        let key = |sel: Option<&str>, k| tree_key(&items, &open, sel.map(Path::new), k);
        let to = |p: &str| Some(TreeMove::Select(PathBuf::from(p)));
        assert_eq!(key(None, TreeKey::Down), to("main.tex"));
        assert_eq!(key(None, TreeKey::Up), to("figures"));
        assert_eq!(key(Some("refs.bib"), TreeKey::Down), to("diagrams"));
        assert_eq!(
            key(Some("diagrams"), TreeKey::Down),
            to("diagrams/circuit.tex")
        );
        // skips the closed subfolder's file
        assert_eq!(key(Some("diagrams/parts"), TreeKey::Down), to("figures"));
        assert_eq!(key(Some("figures"), TreeKey::Down), None);
        assert_eq!(key(Some("main.tex"), TreeKey::Up), None);
        assert_eq!(key(Some("figures"), TreeKey::Home), to("main.tex"));
        assert_eq!(key(Some("main.tex"), TreeKey::End), to("figures"));
    }

    #[test]
    fn right_and_left_open_enter_close_and_climb() {
        let items = mockup();
        let open = set(&["diagrams"]);
        let key = |sel: &str, k| tree_key(&items, &open, Some(Path::new(sel)), k);
        let p = PathBuf::from;
        assert_eq!(
            key("figures", TreeKey::Right),
            Some(TreeMove::Expand(p("figures")))
        );
        assert_eq!(
            key("diagrams", TreeKey::Right),
            Some(TreeMove::Select(p("diagrams/circuit.tex")))
        );
        assert_eq!(key("main.tex", TreeKey::Right), None);
        assert_eq!(
            key("diagrams", TreeKey::Left),
            Some(TreeMove::Collapse(p("diagrams")))
        );
        assert_eq!(
            key("diagrams/parts", TreeKey::Left),
            Some(TreeMove::Select(p("diagrams")))
        );
        assert_eq!(key("main.tex", TreeKey::Left), None);
        assert_eq!(
            key("main.tex", TreeKey::Enter),
            Some(TreeMove::Open(p("main.tex")))
        );
        assert_eq!(
            key("figures", TreeKey::Enter),
            Some(TreeMove::Expand(p("figures")))
        );
        assert_eq!(
            key("diagrams", TreeKey::Enter),
            Some(TreeMove::Collapse(p("diagrams")))
        );
    }

    #[test]
    fn ancestors_are_the_folders_above() {
        let a: Vec<_> = ancestors(Path::new("a/b/c.tex")).collect();
        assert_eq!(a, [PathBuf::from("a/b"), PathBuf::from("a")]);
        assert_eq!(ancestors(Path::new("main.tex")).count(), 0);
    }
}
