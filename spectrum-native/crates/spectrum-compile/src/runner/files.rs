//! The files around a compile: the main file (and the document a `% !TEX root` names), the build folder, the
//! project's files, and the PDF copied beside the source.

use std::path::{Path, PathBuf};

use spectrum_core::project::{EntryKind, scan_tree};

use crate::paths::{canonical, relative_under, resolve, to_slash};

pub(crate) enum Kind {
    Latex,
    Typst,
    Markdown,
}

pub(crate) fn kind_of(path: &Path) -> Kind {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "typ" => Kind::Typst,
        "md" | "markdown" => Kind::Markdown,
        _ => Kind::Latex,
    }
}

/// The document a compile runs.
#[derive(Debug, Clone)]
pub(crate) struct MainFile {
    pub(crate) abs: PathBuf,
    /// From the project's folder, with `/`.
    pub(crate) rel: String,
}

impl MainFile {
    pub(crate) fn dir(&self) -> &Path {
        self.abs.parent().unwrap_or(Path::new(""))
    }

    /// The name without its extension, which the engine names its PDF, log and `SyncTeX` by.
    pub(crate) fn base(&self) -> String {
        self.abs
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default()
    }
}

/// The main file as a file in the project, or the reason it can't be compiled. A `.tex` whose top names
/// another document (`% !TEX root = ../thesis.tex`, before any `\documentclass`) compiles that document; the
/// document's own comment isn't followed.
pub(crate) fn main_file(root: &Path, rel: &Path) -> Result<MainFile, String> {
    let shown = to_slash(rel);
    let abs = resolve(root, rel);
    let Some(inside) = relative_under(root, &abs) else {
        return Err(format!("The main file “{shown}” isn’t in the project."));
    };
    let main = MainFile {
        rel: to_slash(&inside),
        abs,
    };
    // a leading '-' would be read as an engine option (latexmk's can run any command)
    if starts_with_dash(&main.abs) {
        return Err("The main file’s name can’t start with “-”.".to_owned());
    }
    if !main.abs.is_file() {
        return Err(format!("The main file “{shown}” doesn’t exist."));
    }
    if !matches!(kind_of(&main.abs), Kind::Latex) {
        return Ok(main);
    }
    let tex = std::fs::read(&main.abs)
        .map(|b| String::from_utf8_lossy(&b).into_owned())
        .unwrap_or_default();
    let top: String = tex.chars().take(4096).collect();
    let top = top.split("\\documentclass").next().unwrap_or("");
    let Some(named) = crate::regex(r"(?im)^\s*%\s*!TEX\s+root\s*=\s*(.+?)\s*$")
        .captures(top)
        .map(|c| c[1].replace('\\', "/"))
    else {
        return Ok(main);
    };
    match project_file(root, &resolve(main.dir(), Path::new(&named))) {
        Some(target) if !starts_with_dash(&target.abs) => Ok(target),
        _ => Err(format!(
            "The “% !TEX root” in “{}” names “{named}”, which isn’t a file in the project.",
            main.rel
        )),
    }
}

fn starts_with_dash(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|n| n.to_string_lossy().starts_with('-'))
}

/// `abs` if it's a file in the project, by its name on disk (macOS finds Main.tex as main.tex).
fn project_file(root: &Path, abs: &Path) -> Option<MainFile> {
    relative_under(root, abs)?;
    if !abs.is_file() {
        return None;
    }
    let on_disk = relative_under(&canonical(root), &canonical(abs))?;
    Some(MainFile {
        abs: root.join(&on_disk),
        rel: to_slash(&on_disk),
    })
}

/// The project's folders and files (as the file tree lists them), each from the project's folder.
pub(crate) fn project_entries(root: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    for entry in scan_tree(root).unwrap_or_default() {
        match entry.kind {
            EntryKind::Dir => dirs.push(entry.rel),
            EntryKind::File => files.push(entry.rel),
        }
    }
    (dirs, files)
}

/// `<out_dir><suffix>`: the build folder's temp and generated-file siblings.
pub(crate) fn sibling(out_dir: &Path, suffix: &str) -> PathBuf {
    let mut name = out_dir.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

/// An empty folder at `dir` (what an earlier compile left there goes).
pub(crate) fn fresh_dir(dir: &Path) -> Result<(), String> {
    match std::fs::remove_dir_all(dir) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => {
            return Err(format!(
                "The build folder {} couldn’t be cleared: {e}",
                dir.display()
            ));
        }
    }
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("The build folder {} couldn’t be made: {e}", dir.display()))
}

/// Copies the build's PDF beside the source, the only file a compile writes in the project (a sync client would
/// copy anything else to the other computer). On failure the log says why and the copy stays as it was.
pub(crate) fn copy_pdf(root: &Path, pdf: &Path, target: &Path) -> Result<PathBuf, String> {
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    if relative_under(root, target).is_none() {
        return Err(format!(
            "[spectrum warning] {name} wasn’t updated: it isn’t in the project."
        ));
    }
    std::fs::copy(pdf, target).map(|_| target.to_path_buf()).map_err(|e| {
        if cfg!(windows) && e.kind() == std::io::ErrorKind::PermissionDenied {
            format!("[spectrum warning] {name} is open in another program, so the copy next to the source wasn’t updated.")
        } else {
            format!("[spectrum warning] {name} wasn’t updated: {e}")
        }
    })
}

/// The diagnostics' paths as the project's files (TeX names them from the main file's folder).
pub(crate) fn project_paths(
    mut diagnostics: Vec<crate::Diagnostic>,
    main_rel: &str,
    files: &[PathBuf],
) -> Vec<crate::Diagnostic> {
    let names: Vec<String> = files.iter().map(|f| to_slash(f)).collect();
    for d in &mut diagnostics {
        if let Some(path) = &d.path {
            d.path = Some(PathBuf::from(crate::project_file(
                &to_slash(path),
                main_rel,
                &names,
            )));
        }
    }
    diagnostics
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_file_checks_and_tex_root() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("chapters")).unwrap();
        std::fs::write(root.join("thesis.tex"), "\\documentclass{book}").unwrap();
        std::fs::write(
            root.join("chapters/one.tex"),
            "% !TEX root = ..\\thesis.tex\n\\chapter{One}",
        )
        .unwrap();
        std::fs::write(
            root.join("chapters/lost.tex"),
            "% !TEX root = ../../x.tex\n",
        )
        .unwrap();
        std::fs::write(root.join("-x.tex"), "").unwrap();

        let main = main_file(root, Path::new("chapters/one.tex")).unwrap();
        assert_eq!(main.rel, "thesis.tex");
        assert_eq!(main.base(), "thesis");
        assert!(
            main_file(root, Path::new("chapters/lost.tex"))
                .unwrap_err()
                .contains("% !TEX root")
        );
        assert!(
            main_file(root, Path::new("-x.tex"))
                .unwrap_err()
                .contains("“-”")
        );
        assert!(
            main_file(root, Path::new("none.tex"))
                .unwrap_err()
                .contains("doesn’t exist")
        );
        assert!(
            main_file(root, Path::new("../etc/passwd"))
                .unwrap_err()
                .contains("isn’t in the project")
        );
    }

    #[test]
    fn siblings_and_fresh_folders() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("build").join("main.tex");
        assert_eq!(
            sibling(&out, "-tmp"),
            dir.path().join("build").join("main.tex-tmp")
        );
        fresh_dir(&out).unwrap();
        std::fs::write(out.join("old.aux"), "x").unwrap();
        fresh_dir(&out).unwrap();
        assert_eq!(std::fs::read_dir(&out).unwrap().count(), 0);
    }
}
