//! A project's files, without the app's data, version control, Finder and Explorer litter, sync apps' own
//! files, build folders and TeX's build files.

use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use crate::CoreError;

/// 2.8's `HIDDEN_ENTRIES`: never in the file tree, versions or AI context.
const HIDDEN: [&str; 14] = [
    ".spectrum",
    ".git",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
    ".compile",
    ".snapshots",
    ".SynologyWorkingDirectory",
    ".dropbox",
    ".dropbox.cache",
    "Icon\r",
    "@eaDir",
    "#recycle",
    ".spectrum-shared",
];
/// Package and build folders, new in 3.0's tree.
const BUILD_DIRS: [&str; 2] = ["node_modules", "target"];
/// TeX's build files, from the .gitignore 2.8 writes into a project (`.bbl` stays: arXiv takes it).
const TEX_BUILD: [&str; 17] = [
    ".aux",
    ".log",
    ".out",
    ".toc",
    ".lof",
    ".lot",
    ".fls",
    ".fdb_latexmk",
    ".synctex.gz",
    ".bcf",
    ".blg",
    ".run.xml",
    ".xdv",
    ".nav",
    ".snm",
    ".vrb",
    ".synctex(busy)",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Dir,
}

/// A file or folder, by its path from the project's folder. A link is a file and is never followed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    pub rel: PathBuf,
    pub kind: EntryKind,
}

fn hidden_name(name: &str, kind: EntryKind) -> bool {
    HIDDEN.contains(&name)
        || match kind {
            EntryKind::Dir => BUILD_DIRS.contains(&name) || name.starts_with("_minted-"),
            EntryKind::File => TEX_BUILD.iter().any(|ext| name.ends_with(ext)),
        }
}

/// Whether a path from the project's folder is one [`scan_tree`] leaves out, for a change whose kind isn't
/// known any more (a removed file).
pub fn is_hidden_path(rel: &Path) -> bool {
    let names: Vec<_> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(n) => Some(n.to_string_lossy()),
            _ => None,
        })
        .collect();
    let Some((last, folders)) = names.split_last() else {
        return false;
    };
    folders.iter().any(|n| hidden_name(n, EntryKind::Dir))
        || hidden_name(last, EntryKind::File)
        || hidden_name(last, EntryKind::Dir)
}

/// Every file and folder under `root`, folders before their contents, names in byte order. A folder that
/// can't be read is an error, never left out: a folder missing from a listing reads as its files deleted.
pub fn scan_tree(root: &Path) -> Result<Vec<TreeEntry>, CoreError> {
    let mut out = Vec::new();
    walk(root, Path::new(""), &mut out)?;
    Ok(out)
}

fn walk(root: &Path, rel: &Path, out: &mut Vec<TreeEntry>) -> Result<(), CoreError> {
    let dir = root.join(rel);
    let read = fs::read_dir(&dir).map_err(|e| CoreError::io("couldn't list", &dir, e))?;
    let mut entries = Vec::new();
    for entry in read {
        let entry = entry.map_err(|e| CoreError::io("couldn't list", &dir, e))?;
        // file_type doesn't follow links, so a link (or a sync app's placeholder) is a file
        let kind = match entry.file_type() {
            Ok(t) if t.is_dir() => EntryKind::Dir,
            Ok(_) => EntryKind::File,
            // gone in between
            Err(err) if err.kind() == io::ErrorKind::NotFound => continue,
            Err(err) => return Err(CoreError::io("couldn't read", &entry.path(), err)),
        };
        entries.push((entry.file_name(), kind));
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    for (name, kind) in entries {
        if hidden_name(&name.to_string_lossy(), kind) {
            continue;
        }
        let child = rel.join(&name);
        out.push(TreeEntry {
            rel: child.clone(),
            kind,
        });
        if kind == EntryKind::Dir {
            walk(root, &child, out)?;
        }
    }
    Ok(())
}

/// A path from the project's folder as 2.8 stores one: '/'-separated. `None` for a name that isn't UTF-8.
pub(crate) fn slash_path(rel: &Path) -> Option<String> {
    let parts: Option<Vec<&str>> = rel.components().map(|c| c.as_os_str().to_str()).collect();
    parts.map(|p| p.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(root: &Path, rel: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, "").unwrap();
    }

    #[test]
    fn leaves_out_junk_and_never_follows_links() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        for rel in [
            "main.tex",
            "main.aux",
            "main.synctex.gz",
            "main.bbl",
            ".git/HEAD",
            ".spectrum/project.json",
            "node_modules/x/a.tex",
            "figs/a.png",
            "figs/.DS_Store",
            "_minted-main/x",
            "target/debug/x",
        ] {
            touch(root, rel);
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(root, root.join("loop")).unwrap();
        let rels: Vec<String> = scan_tree(root)
            .unwrap()
            .iter()
            .map(|e| slash_path(&e.rel).unwrap())
            .collect();
        let mut expected = vec!["figs", "figs/a.png", "main.bbl", "main.tex"];
        if cfg!(unix) {
            expected.insert(2, "loop");
        }
        assert_eq!(rels, expected);
        assert!(is_hidden_path(Path::new(".git/objects/ab")));
        assert!(is_hidden_path(Path::new("out/main.aux")));
        assert!(!is_hidden_path(Path::new("chapters/one.tex")));
    }

    #[test]
    fn a_missing_folder_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(scan_tree(&dir.path().join("gone")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn names_that_are_not_utf8() {
        use std::os::unix::ffi::OsStrExt;
        let dir = tempfile::tempdir().unwrap();
        let name = std::ffi::OsStr::from_bytes(b"caf\xe9.tex");
        // APFS refuses names that aren't UTF-8; other file systems take them
        if fs::write(dir.path().join(name), "").is_err() {
            return;
        }
        let tree = scan_tree(dir.path()).unwrap();
        assert_eq!(tree[0].rel, Path::new(name));
        assert_eq!(slash_path(&tree[0].rel), None);
    }
}
