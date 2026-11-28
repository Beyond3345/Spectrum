//! Lexical path helpers for logs and SyncTeX, which name files from wherever the engine ran.

use std::path::{Component, Path, PathBuf};

/// Node's `path.resolve(base, name)`: `name` from `base`, with `.` and `..` folded away.
pub(crate) fn resolve(base: &Path, name: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in base.join(name).components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

/// `path` relative to `root` when it is inside it (`""` for `root` itself). Windows compares
/// without case, as `path.win32.relative` does.
pub(crate) fn relative_under(root: &Path, path: &Path) -> Option<PathBuf> {
    let root = resolve(root, Path::new(""));
    let path = resolve(path, Path::new(""));
    let mut rest = path.components();
    for part in root.components() {
        let other = rest.next()?;
        let same = if cfg!(windows) {
            part.as_os_str().to_string_lossy().to_lowercase()
                == other.as_os_str().to_string_lossy().to_lowercase()
        } else {
            part == other
        };
        if !same {
            return None;
        }
    }
    Some(rest.as_path().to_path_buf())
}

/// A path written with `/` whatever the platform (`path.split(path.sep).join('/')`).
pub(crate) fn to_slash(path: &Path) -> String {
    let text = path.to_string_lossy();
    if cfg!(windows) {
        text.replace('\\', "/")
    } else {
        text.into_owned()
    }
}

/// Drops Windows' `\\?\` (and `\\?\UNC\`) prefix, which shares no root with an ordinary path.
pub(crate) fn strip_verbatim(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else {
        path.strip_prefix(r"\\?\").unwrap_or(path).to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_folds_dots() {
        assert_eq!(
            resolve(Path::new("/a/b"), Path::new("./c/../d.tex")),
            PathBuf::from("/a/b/d.tex")
        );
        assert_eq!(
            resolve(Path::new("/a"), Path::new("/x/./y")),
            PathBuf::from("/x/y")
        );
        assert_eq!(
            resolve(Path::new("/"), Path::new("../x")),
            PathBuf::from("/x")
        );
    }

    #[test]
    fn relative_under_only_inside() {
        assert_eq!(
            relative_under(Path::new("/p"), Path::new("/p/a/b.tex")),
            Some(PathBuf::from("a/b.tex"))
        );
        assert_eq!(
            relative_under(Path::new("/p"), Path::new("/p")),
            Some(PathBuf::new())
        );
        assert_eq!(relative_under(Path::new("/p"), Path::new("/q/a")), None);
        assert_eq!(relative_under(Path::new("/p/a"), Path::new("/p")), None);
    }

    #[test]
    fn verbatim_prefixes() {
        assert_eq!(strip_verbatim(r"\\?\C:\x"), r"C:\x");
        assert_eq!(strip_verbatim(r"\\?\UNC\server\share"), r"\\server\share");
        assert_eq!(strip_verbatim("/a"), "/a");
    }
}
