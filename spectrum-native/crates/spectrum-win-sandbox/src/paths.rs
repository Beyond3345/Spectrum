//! Windows path rules as plain text, so they hold (and are tested) on every platform.

use std::path::Path;

/// Why a path was refused.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PathError {
    #[error("the path is not Unicode")]
    NotUnicode,
    #[error("“{0}” is not a full path on a local drive (C:\\…)")]
    NotLocal(String),
    #[error(
        "“{0}” has a part Windows reads another way (., .., a stream, a trailing dot or space)"
    )]
    Ambiguous(String),
}

/// A local Windows path as `C:\folder\file`: drive letter in upper case, backslashes, no trailing
/// one (but `C:\` for a drive). A `\\?\C:\` prefix is taken off. Refused: network and device
/// paths, `.` and `..`, streams (`file:name`), and names Windows trims (trailing dot or space),
/// which could each name something other than what was checked.
pub fn normalise(path: &Path) -> Result<String, PathError> {
    let text = path.to_str().ok_or(PathError::NotUnicode)?;
    let text = text.replace('/', "\\");
    let local = text.strip_prefix(r"\\?\").unwrap_or(&text);
    let mut chars = local.chars();
    let (Some(drive), Some(':'), Some('\\')) = (chars.next(), chars.next(), chars.next()) else {
        return Err(PathError::NotLocal(text));
    };
    if !drive.is_ascii_alphabetic() {
        return Err(PathError::NotLocal(text));
    }
    let rest = chars.as_str().trim_end_matches('\\');
    let mut out = format!("{}:", drive.to_ascii_uppercase());
    if rest.is_empty() {
        out.push('\\');
        return Ok(out);
    }
    for part in rest.split('\\') {
        let odd = part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with(['.', ' '])
            || part.contains(|c: char| c.is_control() || r#"<>:"|?*"#.contains(c));
        if odd {
            return Err(PathError::Ambiguous(text));
        }
        out.push('\\');
        out.push_str(part);
    }
    Ok(out)
}

fn fold(text: &str) -> impl Iterator<Item = char> + '_ {
    text.chars().flat_map(char::to_lowercase)
}

/// Whether two normalised paths are the same, ignoring case as NTFS does.
pub fn same(a: &str, b: &str) -> bool {
    fold(a).eq(fold(b))
}

/// Whether `path` is `root` or below it. Both normalised; case is ignored.
pub fn within(path: &str, root: &str) -> bool {
    let root = root.trim_end_matches('\\');
    let mut path = fold(path);
    for expected in fold(root) {
        if path.next() != Some(expected) {
            return false;
        }
    }
    matches!(path.next(), None | Some('\\'))
}

/// Whether one path holds the other.
pub fn overlaps(a: &str, b: &str) -> bool {
    within(a, b) || within(b, a)
}

/// The last name of a normalised path.
pub fn file_name(path: &str) -> &str {
    path.rsplit('\\').next().unwrap_or(path)
}

const SECRET_NAMES: [&str; 7] = [
    ".netrc",
    ".npmrc",
    ".pypirc",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
];
const SECRET_EXTENSIONS: [&str; 7] = [".pem", ".p12", ".pfx", ".keystore", ".jks", ".ppk", ".key"];

/// Whether a file or folder name is one a sandboxed program is never granted: Spectrum's, git's
/// and Claude's folders, `.env` files, credentials, private keys and keystores, and on NTFS a
/// stream, a short 8.3 name or a name Windows trims, which may each be one of those. The list of
/// 2.8's `agentHiddenName` (`apps/backend/src/utils/pathUtils.js`): keep the two the same.
pub fn is_secret_name(name: &str) -> bool {
    let secret = |n: &str| {
        matches!(n, ".spectrum" | ".git" | ".claude" | ".env")
            || n.starts_with(".env.")
            || SECRET_NAMES.contains(&n)
            || SECRET_EXTENSIONS.iter().any(|e| n.ends_with(e))
    };
    // both foldings, as a file system that ignores case takes 'ſ' for 's' and the Kelvin sign for 'k'
    secret(&name.to_lowercase())
        || secret(&name.to_uppercase().to_lowercase())
        || name.contains(':')
        || name.ends_with(['.', ' '])
        || is_short_name(name)
}

/// `GIT~1`, `ENV~1.TXT`: a tilde, digits, then the end or a dot.
fn is_short_name(name: &str) -> bool {
    name.match_indices('~').any(|(at, _)| {
        let rest = &name[at + 1..];
        let digits = rest.chars().take_while(char::is_ascii_digit).count();
        digits > 0 && matches!(rest[digits..].chars().next(), None | Some('.'))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn norm(text: &str) -> Result<String, PathError> {
        normalise(Path::new(text))
    }

    #[test]
    fn normalises_local_paths() {
        assert_eq!(
            norm(r"c:\Draft\main.tex").as_deref(),
            Ok(r"C:\Draft\main.tex")
        );
        assert_eq!(norm(r"\\?\C:\Draft\").as_deref(), Ok(r"C:\Draft"));
        assert_eq!(norm("C:/Draft/build").as_deref(), Ok(r"C:\Draft\build"));
        assert_eq!(norm(r"D:\").as_deref(), Ok(r"D:\"));
    }

    #[test]
    fn refuses_network_relative_and_device_paths() {
        for bad in [
            r"\\server\share\x",
            r"\\?\UNC\server\share",
            r"\\.\pipe\x",
            r"Draft\main.tex",
            r"C:Draft",
            r"\Draft",
            "",
        ] {
            assert!(matches!(norm(bad), Err(PathError::NotLocal(_))), "{bad}");
        }
    }

    #[test]
    fn refuses_names_windows_reads_another_way() {
        for bad in [
            r"C:\a\..\b",
            r"C:\a\.\b",
            r"C:\a\\b",
            r"C:\a\main.tex:secret",
            r"C:\a\.env::$DATA",
            r"C:\a\.git.\config",
            r"C:\a\.env ",
            "C:\\a\\b\u{0}c",
            r"C:\a\b*",
        ] {
            assert!(matches!(norm(bad), Err(PathError::Ambiguous(_))), "{bad}");
        }
    }

    #[test]
    fn within_ignores_case_and_respects_name_boundaries() {
        assert!(within(r"C:\Draft\a", r"c:\draft"));
        assert!(within(r"C:\Draft", r"C:\Draft"));
        assert!(!within(r"C:\Draft2\a", r"C:\Draft"));
        assert!(!within(r"C:\", r"C:\Draft"));
        assert!(within(r"C:\Draft", r"C:\"));
        assert!(overlaps(r"C:\a", r"C:\a\b") && overlaps(r"C:\a\b", r"C:\a"));
        assert!(!overlaps(r"C:\a", r"C:\b"));
        assert!(same(r"C:\ÉCOLE", r"c:\école"));
    }

    #[test]
    fn secret_names_match_2_8() {
        for hidden in [
            ".git",
            ".Spectrum",
            ".claude",
            ".env",
            ".ENV.local",
            ".npmrc",
            "id_ed25519",
            "server.PEM",
            "deck.key",
            "GIT~1",
            "ENV~1.TXT",
            ".env::$DATA",
            "main.tex:secret",
            ".git.",
            ".env ",
            "\u{212a}eys.\u{212a}ey",
        ] {
            assert!(is_secret_name(hidden), "{hidden}");
        }
        for shown in [
            "main.tex",
            "fig~a.png",
            "notes~.tex",
            "chapter 1",
            "env",
            "keys.txt",
        ] {
            assert!(!is_secret_name(shown), "{shown}");
        }
    }

    #[test]
    fn file_name_is_the_last_part() {
        assert_eq!(file_name(r"C:\a\b.tex"), "b.tex");
    }
}
