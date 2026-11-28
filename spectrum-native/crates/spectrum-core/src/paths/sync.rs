//! The sync apps' folders (Synology Drive, `OneDrive`, Dropbox, Google Drive, iCloud Drive), ported from 2.8's
//! `syncService.js` (`detectSyncRoots`, `placeOf`). Only names are read, never what is in the folders.

use std::ffi::OsStr;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// A sync app.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SyncProvider {
    Synology,
    OneDrive,
    Dropbox,
    Google,
    ICloud,
}

impl SyncProvider {
    pub fn label(self) -> &'static str {
        match self {
            Self::Synology => "Synology Drive",
            Self::OneDrive => "OneDrive",
            Self::Dropbox => "Dropbox",
            Self::Google => "Google Drive",
            Self::ICloud => "iCloud Drive",
        }
    }
}

/// A sync app's top folder on this computer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncRoot {
    pub path: PathBuf,
    pub provider: SyncProvider,
}

/// Where a folder sits in a sync app's folder: `rel` is '/'-separated from its top (the same on every computer).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncPlace {
    pub provider: SyncProvider,
    pub rel: String,
}

/// Synology's documented marker in the folder of a classic sync task.
const MARKER: &str = ".SynologyWorkingDirectory";
const ICLOUD: [&str; 3] = ["Library", "Mobile Documents", "com~apple~CloudDocs"];
/// macOS asks before an app looks inside these, so the marker check passes them by.
#[cfg(target_os = "macos")]
const PROTECTED: [&str; 7] = [
    "Desktop",
    "Documents",
    "Downloads",
    "Library",
    "Movies",
    "Music",
    "Pictures",
];

/// APFS and NTFS ignore case.
fn caseless(p: &Path) -> PathBuf {
    if cfg!(any(target_os = "macos", windows)) {
        PathBuf::from(p.to_string_lossy().to_lowercase())
    } else {
        p.to_path_buf()
    }
}

fn same_folder(a: &Path, b: &Path) -> bool {
    caseless(a) == caseless(b)
}

/// `p` is `root` or inside it.
fn within(p: &Path, root: &Path) -> bool {
    caseless(p).starts_with(caseless(root))
}

/// `p`'s place in `root`, '/'-separated.
fn rel_from(root: &Path, p: &Path) -> String {
    let skip = root.components().count();
    p.components()
        .skip(skip)
        .filter_map(|c| match c {
            Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn home_join(home: &Path, parts: &[&str]) -> PathBuf {
    parts
        .iter()
        .fold(home.to_path_buf(), |p, part| p.join(part))
}

/// The sync apps' folders under `home` (and those the system names elsewhere).
// ponytail: looked for once at start; 2.8 looked again every minute, for a sync app set up while it ran
pub fn detect_sync_roots(home: &Path) -> Vec<SyncRoot> {
    detect_with(home, &dropbox_infos(home))
}

/// Where Dropbox writes `info.json` (help.dropbox.com/installs/locate-dropbox-folder).
fn dropbox_infos(home: &Path) -> Vec<PathBuf> {
    if cfg!(windows) {
        ["APPDATA", "LOCALAPPDATA"]
            .iter()
            .filter_map(std::env::var_os)
            .map(|dir| PathBuf::from(dir).join("Dropbox").join("info.json"))
            .collect()
    } else {
        vec![home.join(".dropbox").join("info.json")]
    }
}

fn detect_with(home: &Path, dropbox_infos: &[PathBuf]) -> Vec<SyncRoot> {
    let mut found: Vec<SyncRoot> = Vec::new();
    let mut add = |p: PathBuf, provider: SyncProvider| {
        if p.is_absolute() && !found.iter().any(|r| same_folder(&r.path, &p)) && p.is_dir() {
            found.push(SyncRoot { path: p, provider });
        }
    };
    #[cfg(target_os = "macos")]
    {
        // File Provider folders, named <Provider>-<Account> (Synology's are its On-demand tasks)
        let cloud = home.join("Library").join("CloudStorage");
        for entry in fs::read_dir(&cloud).into_iter().flatten().flatten() {
            let name = entry.file_name();
            let provider = match name.to_string_lossy().split('-').next() {
                Some("OneDrive") => SyncProvider::OneDrive,
                Some("SynologyDrive") => SyncProvider::Synology,
                Some("Dropbox") => SyncProvider::Dropbox,
                Some("GoogleDrive") => SyncProvider::Google,
                _ => continue,
            };
            add(cloud.join(name), provider);
        }
        add(home_join(home, &ICLOUD), SyncProvider::ICloud);
    }
    #[cfg(windows)]
    {
        let from_env: Vec<PathBuf> = ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"]
            .iter()
            .filter_map(std::env::var_os)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .collect();
        let onedrive = if from_env.is_empty() {
            one_drive_from_registry()
        } else {
            from_env
        };
        for p in onedrive {
            add(p, SyncProvider::OneDrive);
        }
        add(home.join("iCloudDrive"), SyncProvider::ICloud);
    }
    // Dropbox says where its folders are
    for file in dropbox_infos {
        let Ok(text) = fs::read(file) else { continue };
        let Ok(serde_json::Value::Object(info)) = serde_json::from_slice(&text) else {
            continue;
        };
        for account in info.values() {
            if let Some(p) = account.get("path").and_then(serde_json::Value::as_str) {
                add(PathBuf::from(p), SyncProvider::Dropbox);
            }
        }
    }
    // classic Synology tasks go anywhere; ~/SynologyDrive is the default
    for entry in fs::read_dir(home).into_iter().flatten().flatten() {
        let name = entry.file_name();
        let skip = name.to_string_lossy().starts_with('.') || protected(&name);
        if skip || !entry.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        if home.join(&name).join(MARKER).exists() {
            add(home.join(&name), SyncProvider::Synology);
        }
    }
    found
}

#[cfg(target_os = "macos")]
fn protected(name: &OsStr) -> bool {
    PROTECTED.iter().any(|p| OsStr::new(p) == name)
}

#[cfg(not(target_os = "macos"))]
fn protected(_name: &OsStr) -> bool {
    false
}

/// `OneDrive`'s folders as its own settings list them, for when the environment doesn't say.
// ponytail: reg.exe prints in the console's code page, so a folder with non-ASCII letters may not match;
// RegGetValueW through windows-sys if that ever shows
#[cfg(windows)]
fn one_drive_from_registry() -> Vec<PathBuf> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let output = std::process::Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\OneDrive\Accounts",
            "/s",
            "/v",
            "UserFolder",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let Ok(re) = regex::Regex::new(r"UserFolder\s+REG_(?:EXPAND_)?SZ\s+(.+)") else {
        return Vec::new();
    };
    re.captures_iter(&text)
        .map(|c| PathBuf::from(c[1].trim()))
        .collect()
}

/// iCloud's Desktop & Documents leaves those folders where they are and syncs them as iCloud Drive's own:
/// its Desktop and Documents are then the same folders as the home folder's.
fn icloud_keeps(home: &Path, name: &str) -> bool {
    let a = fs::canonicalize(home_join(home, &ICLOUD).join(name));
    let b = fs::canonicalize(home.join(name));
    matches!((a, b), (Ok(a), Ok(b)) if same_folder(&a, &b))
}

/// Where `p` is in a sync app's folder, or `None` outside them. `roots` from [`detect_sync_roots`].
pub fn place_of(p: &Path, home: &Path, roots: &[SyncRoot]) -> Option<SyncPlace> {
    if let Some(root) = roots
        .iter()
        .filter(|r| within(p, &r.path))
        .max_by_key(|r| r.path.as_os_str().len())
    {
        return Some(SyncPlace {
            provider: root.provider,
            rel: rel_from(&root.path, p),
        });
    }
    let kept = if cfg!(target_os = "macos") {
        &["Desktop", "Documents"][..]
    } else {
        &[]
    };
    for name in kept {
        let dir = home.join(name);
        if within(p, &dir) && icloud_keeps(home, name) {
            let rel = rel_from(&dir, p);
            let rel = if rel.is_empty() {
                (*name).to_owned()
            } else {
                format!("{name}/{rel}")
            };
            return Some(SyncPlace {
                provider: SyncProvider::ICloud,
                rel,
            });
        }
    }
    // the nearest folder at or above p with Synology's marker (never the drive's root, as 2.8)
    p.ancestors()
        .filter(|dir| dir.parent().is_some())
        .find(|dir| dir.join(MARKER).exists())
        .map(|marker| SyncPlace {
            provider: SyncProvider::Synology,
            rel: rel_from(marker, p),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_dropbox_and_synology_folders() {
        let home = tempfile::tempdir().unwrap();
        let home = home.path();
        let dropbox = home.join("Dropbox (Work)");
        fs::create_dir_all(home.join(".dropbox")).unwrap();
        fs::create_dir_all(&dropbox).unwrap();
        let info = serde_json::json!({ "business": { "path": dropbox } });
        fs::write(home.join(".dropbox/info.json"), info.to_string()).unwrap();
        fs::create_dir_all(home.join("SynologyDrive").join(MARKER)).unwrap();
        fs::create_dir_all(home.join("Plain")).unwrap();
        // the macOS layout on every platform; Windows reads %APPDATA% instead
        let roots = detect_with(home, &[home.join(".dropbox/info.json")]);
        assert!(roots.contains(&SyncRoot {
            path: dropbox.clone(),
            provider: SyncProvider::Dropbox
        }));
        assert!(roots.iter().any(|r| r.provider == SyncProvider::Synology));
        assert!(!roots.iter().any(|r| r.path.ends_with("Plain")));

        let place = place_of(&dropbox.join("Spectrum").join("Thesis"), home, &roots).unwrap();
        assert_eq!(
            place,
            SyncPlace {
                provider: SyncProvider::Dropbox,
                rel: "Spectrum/Thesis".into()
            }
        );
        assert_eq!(place_of(&home.join("Plain"), home, &roots), None);
    }

    #[test]
    fn a_synology_marker_above_is_found_without_a_root() {
        let home = tempfile::tempdir().unwrap();
        let nas = home.path().join("elsewhere").join("nas");
        fs::create_dir_all(nas.join(MARKER)).unwrap();
        let place = place_of(&nas.join("a").join("b"), home.path(), &[]).unwrap();
        assert_eq!(place.rel, "a/b");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn icloud_desktop_and_documents() {
        let home = tempfile::tempdir().unwrap();
        let home = home.path();
        let docs = home.join("Documents");
        fs::create_dir_all(&docs).unwrap();
        assert_eq!(place_of(&docs.join("Spectrum"), home, &[]), None);
        let icloud = home_join(home, &ICLOUD);
        fs::create_dir_all(&icloud).unwrap();
        std::os::unix::fs::symlink(&docs, icloud.join("Documents")).unwrap();
        let place = place_of(&docs.join("Spectrum"), home, &[]).unwrap();
        assert_eq!(
            place,
            SyncPlace {
                provider: SyncProvider::ICloud,
                rel: "Documents/Spectrum".into()
            }
        );
    }

    #[cfg(any(target_os = "macos", windows))]
    #[test]
    fn folders_compare_without_case() {
        assert!(within(
            Path::new("/Users/A/Dropbox/x"),
            Path::new("/users/a/dropbox")
        ));
        assert!(!within(
            Path::new("/Users/A/Dropboxed"),
            Path::new("/Users/A/Dropbox")
        ));
    }
}
