//! A project's file actions from the sidebar: create, rename, move to the Bin. Blocking file IO:
//! call from the background executor. Errors come back as the toast shows them. Ported from 2.8's
//! `routes/projects.js` (`editablePath`, `unfit`, rename's same-file check, `moveToBin`).

use spectrum_core::UserNotice;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

/// The Bin as the platform calls it.
pub const BIN: &str = if cfg!(windows) { "Recycle Bin" } else { "Bin" };

fn shown(rel: &Path) -> String {
    rel.file_name()
        .unwrap_or(rel.as_os_str())
        .to_string_lossy()
        .into_owned()
}

/// A name NTFS or a sync app can't hold: `:` makes a hidden stream on NTFS, Windows drops a
/// trailing dot or space, and CON and the like are devices. Refused on every system for a name
/// typed here, since the project may be opened on Windows.
pub fn unfit_name(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let device = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || (stem.len() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && stem.as_bytes()[3].is_ascii_digit());
    name.is_empty()
        || name == "."
        || name == ".."
        || name
            .chars()
            .any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\\') || c.is_control())
        || name.ends_with(['.', ' '])
        || device
}

const UNFIT: &str = "That name can't be used on Windows or in a sync app. Choose another one.";

/// `rel` inside `root`, as a path the user may change: relative, no `..`, not the project folder
/// itself, not the app's `.spectrum` folder, and not through a link to somewhere outside.
pub fn editable(root: &Path, rel: &Path) -> Result<PathBuf, UserNotice> {
    let invalid = || UserNotice::new("That path can't be changed", rel.display().to_string());
    let mut parts = rel.components().peekable();
    if parts.peek().is_none() || !parts.all(|c| matches!(c, Component::Normal(_))) {
        return Err(invalid());
    }
    let first = rel
        .components()
        .next()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase());
    if first.as_deref() == Some(spectrum_core::project::APP_DIR) {
        return Err(invalid());
    }
    let abs = root.join(rel);
    // the deepest folder that exists decides where the path really goes (the last part may be a
    // link: renaming or binning a link changes only the link)
    if let (Ok(real_root), Some(parent)) = (fs::canonicalize(root), abs.parent()) {
        let existing = parent.ancestors().find(|p| p.exists());
        if let Some(real) = existing.and_then(|p| fs::canonicalize(p).ok())
            && !real.starts_with(&real_root)
        {
            return Err(UserNotice::new(
                "That path can't be changed",
                "It goes through a link to somewhere outside the project.",
            ));
        }
    }
    Ok(abs)
}

fn checked_name(rel: &Path) -> Result<(), UserNotice> {
    let name = rel
        .file_name()
        .map(|n| n.to_string_lossy())
        .unwrap_or_default();
    if unfit_name(&name) {
        return Err(UserNotice::new(format!("Can't use “{name}”"), UNFIT));
    }
    Ok(())
}

fn io_notice(title: String, err: &io::Error) -> UserNotice {
    UserNotice::new(title, err.to_string())
}

/// Makes an empty file, never replacing one (APFS and NTFS also match other letter cases).
pub fn create_file(root: &Path, rel: &Path) -> Result<PathBuf, UserNotice> {
    let abs = editable(root, rel)?;
    checked_name(rel)?;
    let title = || format!("Couldn't create “{}”", shown(rel));
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| io_notice(title(), &e))?;
    }
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&abs)
    {
        Ok(_) => Ok(abs),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => Err(UserNotice::new(
            title(),
            "A file or folder with that name already exists.",
        )),
        Err(e) => Err(io_notice(title(), &e)),
    }
}

/// Makes a folder (and any missing folders above it).
pub fn create_folder(root: &Path, rel: &Path) -> Result<PathBuf, UserNotice> {
    let abs = editable(root, rel)?;
    checked_name(rel)?;
    let title = || format!("Couldn't create “{}”", shown(rel));
    if fs::symlink_metadata(&abs).is_ok() {
        return Err(UserNotice::new(
            title(),
            "A file or folder with that name already exists.",
        ));
    }
    fs::create_dir_all(&abs).map_err(|e| io_notice(title(), &e))?;
    Ok(abs)
}

/// Renames or moves `from` to `to`, never over another file. A change of letter case only is a
/// rename of the same file, which case-insensitive disks allow.
pub fn rename(root: &Path, from: &Path, to: &Path) -> Result<PathBuf, UserNotice> {
    let abs_from = editable(root, from)?;
    let abs_to = editable(root, to)?;
    // a name already there may still move into another folder
    if from.file_name() != to.file_name() {
        checked_name(to)?;
    }
    let title = || format!("Couldn't rename “{}”", shown(from));
    fs::symlink_metadata(&abs_from).map_err(|e| io_notice(title(), &e))?;
    if fs::symlink_metadata(&abs_to).is_ok() {
        let same = matches!(
            (fs::canonicalize(&abs_from), fs::canonicalize(&abs_to)),
            (Ok(a), Ok(b)) if a == b
        );
        if !same {
            return Err(UserNotice::new(
                title(),
                "A file or folder with that name already exists.",
            ));
        }
    }
    if let Some(parent) = abs_to.parent() {
        fs::create_dir_all(parent).map_err(|e| io_notice(title(), &e))?;
    }
    fs::rename(&abs_from, &abs_to).map_err(|e| io_notice(title(), &e))?;
    Ok(abs_to)
}

/// Moves a file or folder to the system Bin. A link goes for good (only the link is lost).
pub fn move_to_bin(root: &Path, rel: &Path) -> Result<(), UserNotice> {
    let abs = editable(root, rel)?;
    let title = || format!("Couldn't move “{}” to the {BIN}", shown(rel));
    let meta = fs::symlink_metadata(&abs).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => UserNotice::new(title(), "It's no longer there."),
        _ => io_notice(title(), &e),
    })?;
    if meta.file_type().is_symlink() {
        return fs::remove_file(&abs).map_err(|e| io_notice(title(), &e));
    }
    trash::delete(&abs).map_err(|e| UserNotice::new(title(), e.to_string()))?;
    // the Bin's tools can report success and leave it where it was
    if fs::symlink_metadata(&abs).is_ok() {
        return Err(UserNotice::new(title(), "It is still in the project."));
    }
    Ok(())
}

/// A new file's or folder's path: `name` in the folder of `near` (inside it when it is a folder).
pub fn sibling_path(near: Option<(&Path, bool)>, name: &str) -> PathBuf {
    let folder = match near {
        Some((path, true)) => path.to_path_buf(),
        Some((path, false)) => path.parent().map(Path::to_path_buf).unwrap_or_default(),
        None => PathBuf::new(),
    };
    folder.join(name.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.tex"), "x").unwrap();
        fs::create_dir(dir.path().join(".spectrum")).unwrap();
        dir
    }

    #[test]
    fn refuses_names_windows_or_sync_apps_cant_hold() {
        for bad in [
            "a:b",
            "CON",
            "con.tex",
            "com1",
            "trailing.",
            "space ",
            "a*b",
            "",
            "..",
        ] {
            assert!(unfit_name(bad), "{bad:?}");
        }
        for good in [
            "main.tex",
            "Chapter 1.tex",
            "console.tex",
            "com.tex",
            ".latexmkrc",
        ] {
            assert!(!unfit_name(good), "{good:?}");
        }
    }

    #[test]
    fn refuses_paths_outside_or_into_app_data() {
        let dir = project();
        let root = dir.path();
        for bad in [
            "",
            "../x",
            "/etc/passwd",
            ".spectrum/project.json",
            ".SPECTRUM/x",
            "a/../../b",
        ] {
            assert!(editable(root, Path::new(bad)).is_err(), "{bad:?}");
        }
        assert!(editable(root, Path::new("figures/plot.pdf")).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_folder_link_leading_outside() {
        let dir = project();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("out")).unwrap();
        assert!(create_file(dir.path(), Path::new("out/x.tex")).is_err());
        assert!(!outside.path().join("x.tex").exists());
        // the link itself may go
        assert!(move_to_bin(dir.path(), Path::new("out")).is_ok());
        assert!(outside.path().exists());
    }

    #[test]
    fn creates_files_and_folders_without_replacing() {
        let dir = project();
        let root = dir.path();
        create_file(root, Path::new("chapters/intro.tex")).unwrap();
        assert!(root.join("chapters/intro.tex").is_file());
        let again = create_file(root, Path::new("main.tex")).unwrap_err();
        assert!(again.detail.contains("already exists"));
        assert_eq!(fs::read_to_string(root.join("main.tex")).unwrap(), "x");
        create_folder(root, Path::new("figures")).unwrap();
        assert!(create_folder(root, Path::new("figures")).is_err());
        assert!(create_file(root, Path::new("bad:name.tex")).is_err());
    }

    #[test]
    fn renames_never_over_another_file_but_allows_a_case_change() {
        let dir = project();
        let root = dir.path();
        fs::write(root.join("refs.bib"), "y").unwrap();
        assert!(rename(root, Path::new("refs.bib"), Path::new("main.tex")).is_err());
        assert_eq!(fs::read_to_string(root.join("main.tex")).unwrap(), "x");

        rename(root, Path::new("refs.bib"), Path::new("bib/refs.bib")).unwrap();
        assert!(root.join("bib/refs.bib").is_file());

        rename(root, Path::new("main.tex"), Path::new("Main.tex")).unwrap();
        let names: Vec<_> = fs::read_dir(root)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(names.contains(&"Main.tex".to_owned()), "{names:?}");
        assert!(rename(root, Path::new("gone.tex"), Path::new("x.tex")).is_err());
    }

    #[test]
    fn binning_a_missing_file_says_so() {
        let dir = project();
        let err = move_to_bin(dir.path(), Path::new("gone.tex")).unwrap_err();
        assert_eq!(err.detail, "It's no longer there.");
    }

    #[test]
    fn new_paths_go_beside_or_inside_the_selection() {
        assert_eq!(sibling_path(None, " a.tex "), PathBuf::from("a.tex"));
        assert_eq!(
            sibling_path(Some((Path::new("figs"), true)), "a.tex"),
            PathBuf::from("figs/a.tex")
        );
        assert_eq!(
            sibling_path(Some((Path::new("figs/b.png"), false)), "a.tex"),
            PathBuf::from("figs/a.tex")
        );
    }
}
