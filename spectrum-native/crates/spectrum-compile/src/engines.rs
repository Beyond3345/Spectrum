//! The engines: the manifest of pinned releases (`assets/engines.json`), SHA-256 checks of a file on disk,
//! and where each program is, as 2.8's `engineService.js` and `findExecutable` found them.

mod search_path;

use std::collections::BTreeMap;
use std::ffi::{OsStr, OsString};
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use sha2::{Digest, Sha256};
use spectrum_core::AppPaths;

pub use search_path::{system_search_path, unix_search_path, windows_search_path, with_tex_folder};

use crate::CompileError;

/// The target triple whose assets this build uses (Mac builds are Apple silicon only).
pub const TARGET: &str = if cfg!(windows) {
    "x86_64-pc-windows-msvc"
} else {
    "aarch64-apple-darwin"
};
const EXE: &str = std::env::consts::EXE_SUFFIX;
const MANIFEST: &str = include_str!("../../../assets/engines.json");

/// `assets/engines.json`: each engine's pinned release and its archive for each target.
#[derive(Debug, Clone, Deserialize)]
pub struct EngineManifest {
    pub tectonic: Release,
    pub typst: TypstReleases,
    pub pandoc: PandocRelease,
    /// Locked to 2.17: the biblatex in Tectonic's bundle works with no other Biber.
    pub biber: Release,
    pub texlab: Release,
    pub tinymist: TinymistRelease,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Release {
    pub version: String,
    /// By target triple.
    pub assets: BTreeMap<String, Asset>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Asset {
    pub url: String,
    /// The release archive's digest, lowercase hex, as GitHub (or `SourceForge`) publishes it.
    pub sha256: String,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstReleases {
    /// The version Spectrum carries; the others download into the data folder.
    pub built_in: String,
    pub versions: Vec<TypstRelease>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TypstRelease {
    pub version: String,
    pub released: String,
    pub assets: BTreeMap<String, Asset>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PandocRelease {
    #[serde(flatten)]
    pub release: Release,
    pub minimum: PandocMinimum,
}

/// The oldest pandoc each kind of Markdown output works with.
#[derive(Debug, Clone, Deserialize)]
pub struct PandocMinimum {
    pub latex: String,
    pub typst: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TinymistRelease {
    #[serde(flatten)]
    pub release: Release,
    /// The Typst inside it.
    pub typst: String,
}

impl EngineManifest {
    /// The manifest built into Spectrum.
    pub fn bundled() -> Result<Self, CompileError> {
        Ok(serde_json::from_str(MANIFEST)?)
    }
}

impl Release {
    /// The archive for this build's target, if there is one.
    pub fn asset(&self) -> Option<&Asset> {
        self.assets.get(TARGET)
    }
}

/// A file's SHA-256 as lowercase hex.
pub fn sha256_file(path: &Path) -> Result<String, CompileError> {
    let mut file =
        std::fs::File::open(path).map_err(|e| CompileError::io("couldn't open", path, e))?;
    let mut hash = Sha256::new();
    let mut buf = vec![0; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| CompileError::io("couldn't read", path, e))?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    Ok(hex(&hash.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().fold(String::new(), |mut hex, b| {
        use std::fmt::Write;
        let _ = write!(hex, "{b:02x}");
        hex
    })
}

/// SHA-256 of some bytes as lowercase hex.
#[cfg_attr(
    not(target_os = "macos"),
    allow(dead_code, reason = "the Mac sandbox's")
)]
pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

/// Whether the file on disk is the one whose digest is `expected` (hex, either case).
pub fn verify_sha256(path: &Path, expected: &str) -> Result<bool, CompileError> {
    Ok(sha256_file(path)?.eq_ignore_ascii_case(expected.trim()))
}

/// The folder beside Spectrum's own executable, where the release carries Tectonic, Typst and `TexLab`.
pub fn bundled_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()?
        .parent()
        .map(Path::to_path_buf)
}

/// Where every engine of a compile comes from: Spectrum's own first (beside the app, then downloaded into the
/// data folder), then the search PATH.
#[derive(Debug, Clone)]
pub struct Engines {
    bundled: Option<PathBuf>,
    downloads: PathBuf,
    search_path: OsString,
    built_in_typst: String,
}

impl Engines {
    /// `bundled`: the folder Spectrum carries engines in ([`bundled_dir`]); `search_path`: from
    /// [`system_search_path`].
    pub fn new(
        paths: &AppPaths,
        bundled: Option<PathBuf>,
        search_path: OsString,
        manifest: &EngineManifest,
    ) -> Self {
        Self {
            bundled,
            downloads: paths.data_dir.join("engines"),
            search_path,
            built_in_typst: manifest.typst.built_in.clone(),
        }
    }

    pub fn search_path(&self) -> &OsStr {
        &self.search_path
    }

    /// The same engines with another PATH (a project's TeX folder first, [`with_tex_folder`]).
    #[must_use]
    pub fn with_search_path(&self, search_path: OsString) -> Self {
        Self {
            search_path,
            ..self.clone()
        }
    }

    /// The data folder's `engines`, where downloads go.
    pub fn engines_dir(&self) -> &Path {
        &self.downloads
    }

    /// A program Spectrum carries: `<bundled>/<name>`, or `<name>-<target>` as `src-tauri/binaries` names them
    /// in development.
    pub fn built_in(&self, name: &str) -> Option<PathBuf> {
        let dir = self.bundled.as_deref()?;
        [format!("{name}{EXE}"), format!("{name}-{TARGET}{EXE}")]
            .into_iter()
            .map(|file| dir.join(file))
            .find(|file| file.is_file())
    }

    /// The built-in Tectonic, else one on the PATH.
    pub fn tectonic(&self) -> Option<PathBuf> {
        self.built_in("tectonic").or_else(|| self.find("tectonic"))
    }

    /// A Typst version's executable: the built-in one for `None` or its own version, else one downloaded into
    /// `engines/typst/<version>`. Never the PATH's, as in 2.8: a project pins a version.
    pub fn typst(&self, version: Option<&str>) -> Option<PathBuf> {
        match version.filter(|v| !v.is_empty()) {
            None => self.built_in("typst"),
            Some(v) if v == self.built_in_typst => self.built_in("typst"),
            Some(v) if is_version(v) => {
                let file = self
                    .downloads
                    .join("typst")
                    .join(v)
                    .join(format!("typst{EXE}"));
                file.is_file().then_some(file)
            }
            Some(_) => None,
        }
    }

    /// The Typst version Spectrum carries.
    pub fn built_in_typst_version(&self) -> &str {
        &self.built_in_typst
    }

    /// The pandoc Spectrum downloaded, else one on the PATH.
    pub fn pandoc(&self) -> Option<PathBuf> {
        let own = self.downloads.join("pandoc").join(format!("pandoc{EXE}"));
        if own.is_file() {
            return Some(own);
        }
        self.find("pandoc")
    }

    /// The Biber Spectrum downloaded for the built-in Tectonic.
    pub fn tectonic_biber(&self) -> Option<PathBuf> {
        let file = self.downloads.join("biber").join(format!("biber{EXE}"));
        file.is_file().then_some(file)
    }

    /// Where that Biber (a packed Perl program) unpacks itself.
    pub fn biber_cache(&self) -> PathBuf {
        self.downloads.join("biber").join("cache")
    }

    /// The first `name` on the search PATH.
    pub fn find(&self, name: &str) -> Option<PathBuf> {
        find_executable(name, &self.search_path)
    }
}

fn is_version(v: &str) -> bool {
    let parts: Vec<_> = v.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

/// The first match for `name` on `search_path`, as 2.8's `findExecutable`: on Windows each extension it can
/// run, in cmd.exe's order, and an entry in quotes; elsewhere an executable file.
pub fn find_executable(name: &str, search_path: &OsStr) -> Option<PathBuf> {
    let names: Vec<String> = if cfg!(windows) && !has_windows_extension(name) {
        [".com", ".exe", ".bat", ".cmd"]
            .iter()
            .map(|ext| format!("{name}{ext}"))
            .collect()
    } else {
        vec![name.to_owned()]
    };
    for dir in std::env::split_paths(search_path) {
        if dir.as_os_str().is_empty() {
            continue;
        }
        let dir = unquoted(dir);
        for candidate in names.iter().map(|n| dir.join(n)) {
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn has_windows_extension(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|ext| {
            ["com", "exe", "bat", "cmd"]
                .iter()
                .any(|e| e.eq_ignore_ascii_case(ext))
        })
}

/// Windows allows a PATH entry in quotes, as cmd.exe and libuv read it.
fn unquoted(dir: PathBuf) -> PathBuf {
    if !cfg!(windows) {
        return dir;
    }
    let text = dir.to_string_lossy();
    match text.strip_prefix('"').and_then(|t| t.strip_suffix('"')) {
        Some(inner) => PathBuf::from(inner),
        None => dir,
    }
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

/// The version an executable prints for `--version` (`3.14`, `0.15.1`), or `None` when it can't run.
pub async fn version_of(executable: &Path) -> Option<String> {
    let mut command = tokio::process::Command::new(executable);
    command.arg("--version").kill_on_drop(true);
    crate::process::no_window(&mut command);
    let output = tokio::time::timeout(std::time::Duration::from_secs(20), command.output())
        .await
        .ok()?
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    crate::regex(r"\d+\.\d+(?:\.\d+)?")
        .find(&text)
        .map(|m| m.as_str().to_owned())
}

/// `version` is `minimum` or later, comparing numbers part by part (`3.8.3` ≥ `3.8`).
pub fn at_least(version: &str, minimum: &str) -> bool {
    let parts = |v: &str| -> Vec<u64> { v.split('.').map(|p| p.parse().unwrap_or(0)).collect() };
    let (left, right) = (parts(version), parts(minimum));
    for i in 0..left.len().max(right.len()) {
        let (a, b) = (
            left.get(i).copied().unwrap_or(0),
            right.get(i).copied().unwrap_or(0),
        );
        if a != b {
            return a > b;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engines(bundled: Option<PathBuf>, data: &Path, search: &OsStr) -> Engines {
        let paths = AppPaths::new(data.to_path_buf(), data.join("logs"), data.join("p"));
        Engines::new(
            &paths,
            bundled,
            search.to_os_string(),
            &EngineManifest::bundled().unwrap(),
        )
    }

    fn executable(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
    }

    #[test]
    fn manifest_pins_the_3_0_versions_for_both_targets_only() {
        let m = EngineManifest::bundled().unwrap();
        assert_eq!(m.tectonic.version, "0.17.0");
        assert_eq!(m.typst.built_in, "0.15.1");
        assert_eq!(m.pandoc.release.version, "3.14");
        assert_eq!(m.biber.version, "2.17");
        assert_eq!(m.texlab.version, "5.26.0");
        assert_eq!(m.tinymist.release.version, "0.15.12");
        assert_eq!(m.tinymist.typst, "0.15.1");
        let releases = [
            &m.tectonic,
            &m.pandoc.release,
            &m.biber,
            &m.texlab,
            &m.tinymist.release,
        ];
        let typst = m.typst.versions.iter().map(|v| &v.assets);
        for assets in releases.iter().map(|r| &r.assets).chain(typst) {
            let keys: Vec<_> = assets.keys().map(String::as_str).collect();
            assert_eq!(keys, ["aarch64-apple-darwin", "x86_64-pc-windows-msvc"]);
            for asset in assets.values() {
                assert_eq!(asset.sha256.len(), 64);
                assert!(asset.url.starts_with("https://"));
            }
        }
        assert_eq!(
            m.tectonic.asset().unwrap().sha256,
            if cfg!(windows) {
                "f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f"
            } else {
                "a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667"
            }
        );
    }

    #[test]
    fn sha256_of_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("abc");
        std::fs::write(&file, "abc").unwrap();
        let abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert_eq!(sha256_file(&file).unwrap(), abc);
        assert!(verify_sha256(&file, &abc.to_uppercase()).unwrap());
        assert!(!verify_sha256(&file, &"0".repeat(64)).unwrap());
        assert!(verify_sha256(&dir.path().join("none"), abc).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn find_takes_the_first_executable_on_the_path() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a"), dir.path().join("b"));
        std::fs::create_dir_all(&a).unwrap();
        std::fs::write(a.join("pdflatex"), "not executable").unwrap();
        executable(&b.join("pdflatex"));
        std::fs::create_dir_all(b.join("latexmk")).unwrap();
        let path = std::env::join_paths([&a, &b]).unwrap();
        assert_eq!(find_executable("pdflatex", &path), Some(b.join("pdflatex")));
        assert_eq!(find_executable("latexmk", &path), None);
        assert_eq!(find_executable("pdflatex", OsStr::new("")), None);
    }

    #[test]
    fn spectrum_s_own_engines_come_before_the_path() {
        let dir = tempfile::tempdir().unwrap();
        let (bundled, data, bin) = (
            dir.path().join("app"),
            dir.path().join("data"),
            dir.path().join("bin"),
        );
        for name in ["tectonic", "pandoc", "typst"] {
            executable(&bin.join(format!("{name}{EXE}")));
        }
        let path = std::env::join_paths([&bin]).unwrap();
        let none = engines(Some(bundled.clone()), &data, &path);
        assert_eq!(none.tectonic(), Some(bin.join(format!("tectonic{EXE}"))));
        assert_eq!(none.pandoc(), Some(bin.join(format!("pandoc{EXE}"))));
        // the PATH's Typst is never used: a project pins a version
        assert_eq!(none.typst(None), None);
        assert_eq!(none.tectonic_biber(), None);

        executable(&bundled.join(format!("tectonic-{TARGET}{EXE}")));
        executable(&bundled.join(format!("typst{EXE}")));
        executable(&data.join(format!("engines/pandoc/pandoc{EXE}")));
        executable(&data.join(format!("engines/typst/0.13.1/typst{EXE}")));
        executable(&data.join(format!("engines/biber/biber{EXE}")));
        let own = engines(Some(bundled.clone()), &data, &path);
        assert_eq!(
            own.tectonic(),
            Some(bundled.join(format!("tectonic-{TARGET}{EXE}")))
        );
        assert_eq!(own.typst(None), Some(bundled.join(format!("typst{EXE}"))));
        assert_eq!(own.typst(Some("0.15.1")), own.typst(Some("")));
        assert_eq!(
            own.typst(Some("0.13.1")),
            Some(data.join(format!("engines/typst/0.13.1/typst{EXE}")))
        );
        assert_eq!(own.typst(Some("0.14.2")), None);
        assert_eq!(own.typst(Some("../x")), None);
        assert_eq!(
            own.pandoc(),
            Some(data.join(format!("engines/pandoc/pandoc{EXE}")))
        );
        assert!(own.tectonic_biber().is_some());
    }

    #[test]
    fn versions_compare_part_by_part() {
        assert!(at_least("3.14", "3.8.3"));
        assert!(at_least("3.8.3", "3.8.3"));
        assert!(!at_least("3.8", "3.8.3"));
        assert!(!at_least("2.19.2", "3.1"));
    }
}
