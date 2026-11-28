//! The PATH compiles search, as 2.8's Tauri shell built it for the backend (`src-tauri/src/main.rs`,
//! `search_path`): an app started from Finder or Explorer gets a bare PATH, without Homebrew, `MacTeX`, `MiKTeX`
//! or a TeX Live installed since login.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// The PATH for engines on this computer. On a Mac it asks the login shell (up to 4 s), so call it off the UI
/// thread, once at startup.
pub fn system_search_path() -> OsString {
    #[cfg(windows)]
    {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
        let program_files = std::env::var_os("ProgramFiles").map(PathBuf::from);
        OsString::from(windows_search_path(
            &std::env::var("PATH").unwrap_or_default(),
            local.as_deref(),
            program_files.as_deref(),
            Path::new(r"C:\texlive"),
        ))
    }
    #[cfg(unix)]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let login = login_shell_path().unwrap_or_default();
        OsString::from(unix_search_path(&login, &home))
    }
}

/// The login shell's PATH, then the usual tool folders (`MacTeX`'s texbin, Homebrew, Cargo, the system's),
/// each once.
pub fn unix_search_path(login: &str, home: &str) -> String {
    let extra = [
        "/Library/TeX/texbin".to_owned(),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
        format!("{home}/.cargo/bin"),
        "/usr/bin".into(),
        "/bin".into(),
        "/usr/sbin".into(),
        "/sbin".into(),
    ];
    let mut dirs: Vec<String> = Vec::new();
    for dir in login.split(':').map(str::to_owned).chain(extra) {
        if !dir.is_empty() && !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    dirs.join(":")
}

/// `path` with the `MiKTeX` (per-user, then all users) and newest TeX Live (`C:\texlive\<year>\bin\windows`)
/// folders added at the end when they exist and aren't on it already (compared without case or a trailing `\`).
pub fn windows_search_path(
    path: &str,
    local: Option<&Path>,
    program_files: Option<&Path>,
    texlive: &Path,
) -> String {
    let newest = std::fs::read_dir(texlive).ok().and_then(|years| {
        years
            .flatten()
            .map(|year| year.file_name())
            .filter(|name| name.to_string_lossy().parse::<u16>().is_ok())
            .max()
    });
    let miktex = |dir: &Path| dir.join("MiKTeX").join("miktex").join("bin").join("x64");
    let tex: [Option<PathBuf>; 3] = [
        local.map(|dir| miktex(&dir.join("Programs"))),
        program_files.map(miktex),
        newest.map(|year| texlive.join(year).join("bin").join("windows")),
    ];
    let mut dirs: Vec<String> = path
        .split(';')
        .filter(|dir| !dir.is_empty())
        .map(str::to_owned)
        .collect();
    // Windows takes `/` and `\` alike in PATH entries, and any case, so compare them that way
    let same = |a: &str, b: &str| {
        let norm = |s: &str| {
            s.replace('/', "\\")
                .trim_end_matches('\\')
                .to_ascii_lowercase()
        };
        norm(a) == norm(b)
    };
    for dir in tex.into_iter().flatten().filter(|dir| dir.is_dir()) {
        let dir = dir.to_string_lossy().into_owned();
        if !dirs.iter().any(|d| same(d, &dir)) {
            dirs.push(dir);
        }
    }
    dirs.join(";")
}

/// The PATH with a TeX installation's folder first (Settings › Engines › LaTeX), or `None` when `folder` isn't
/// an absolute path to a folder: the PATH as it is.
pub fn with_tex_folder(folder: &Path, path: &std::ffi::OsStr) -> Option<OsString> {
    if !folder.is_absolute() || !folder.is_dir() {
        return None;
    }
    std::env::join_paths(std::iter::once(folder.to_path_buf()).chain(std::env::split_paths(path)))
        .ok()
}

/// What `$SHELL -ilc` prints for `$PATH`, or `None` after 4 s (an rc file waiting on input, say).
#[cfg(unix)]
pub fn login_shell_path() -> Option<String> {
    shell_path(&std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()))
}

#[cfg(unix)]
fn shell_path(shell: &str) -> Option<String> {
    use std::io::Read;
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::time::Duration;

    const MARK: &str = "__SPECTRUM_PATH__";
    // works in sh, bash, zsh and fish
    let script = format!("printf '%s%s%s' {MARK} \"$PATH\" {MARK}");
    let mut child = Command::new(shell)
        .args(["-ilc", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    // stop at the second mark: a job the rc files leave running keeps stdout open
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let mut buf = [0; 4096];
        loop {
            let text = String::from_utf8_lossy(&out);
            if let [_, path, _, ..] = text.split(MARK).collect::<Vec<_>>()[..] {
                let _ = tx.send(path.to_owned());
                return;
            }
            match stdout.read(&mut buf) {
                Ok(0) | Err(_) => return,
                Ok(n) => out.extend_from_slice(&buf[..n]),
            }
        }
    });
    let path = rx.recv_timeout(Duration::from_secs(4)).ok();
    crate::process::kill_group(child.id());
    let _ = child.wait();
    path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unix_path_keeps_login_order_and_adds_tool_folders_once() {
        let path = unix_search_path("/a:/opt/homebrew/bin::/b", "/Users/x");
        assert_eq!(
            path,
            "/a:/opt/homebrew/bin:/b:/Library/TeX/texbin:/usr/local/bin:/Users/x/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        );
        assert!(unix_search_path("", "/h").starts_with("/Library/TeX/texbin:"));
    }

    #[test]
    fn windows_path_adds_miktex_and_newest_texlive_that_exist() {
        let dir = tempfile::tempdir().unwrap();
        let local = dir.path().join("local");
        let program_files = dir.path().join("pf");
        let texlive = dir.path().join("texlive");
        let user_miktex = local.join("Programs/MiKTeX/miktex/bin/x64");
        std::fs::create_dir_all(&user_miktex).unwrap();
        for year in ["2024", "2026", "notes"] {
            std::fs::create_dir_all(texlive.join(year).join("bin/windows")).unwrap();
        }
        let user = user_miktex.to_string_lossy().into_owned();
        // joined part by part, so the separators match what the code builds on Windows
        let newest = texlive
            .join("2026")
            .join("bin")
            .join("windows")
            .to_string_lossy()
            .into_owned();
        // all-users MiKTeX isn't installed; the per-user one is already on the PATH, in other case
        let path = windows_search_path(
            &format!(r"C:\Windows;;{}\", user.to_uppercase()),
            Some(&local),
            Some(&program_files),
            &texlive,
        );
        assert_eq!(
            path,
            format!(r"C:\Windows;{}\;{newest}", user.to_uppercase())
        );
        let bare = windows_search_path("", Some(&local), None, &dir.path().join("none"));
        assert_eq!(bare, user);
    }

    #[test]
    fn tex_folder_goes_first_only_when_it_is_a_folder() {
        let dir = tempfile::tempdir().unwrap();
        let path = std::env::join_paths(["/usr/bin"]).unwrap();
        let joined = with_tex_folder(dir.path(), &path).unwrap();
        let parts: Vec<_> = std::env::split_paths(&joined).collect();
        assert_eq!(parts, [dir.path().to_path_buf(), PathBuf::from("/usr/bin")]);
        assert!(with_tex_folder(Path::new("relative"), &path).is_none());
        assert!(with_tex_folder(&dir.path().join("missing"), &path).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn login_shell_path_reads_between_the_marks() {
        let path = shell_path("/bin/sh").unwrap();
        assert_ne!(path, "");
    }
}
