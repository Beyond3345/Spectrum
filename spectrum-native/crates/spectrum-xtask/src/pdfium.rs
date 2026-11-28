//! `fetch-pdfium`: the pinned pdfium-binaries release, checked against `assets/pdfium.json`'s
//! SHA-256, unpacked to `target/pdfium/<triple>/<library>`. The binary is never committed.

use anyhow::{Context, Result, bail, ensure};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;

fn workspace() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

/// The triple this machine builds for, if Spectrum ships for it.
pub fn host_target() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("aarch64-apple-darwin"),
        ("windows", "x86_64") => Some("x86_64-pc-windows-msvc"),
        _ => None,
    }
}

/// Downloads and unpacks PDFium for `target` unless the same archive is already unpacked.
/// Returns the library's path.
pub fn fetch(target: &str) -> Result<PathBuf> {
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(workspace().join("assets/pdfium.json")).context("reading pdfium.json")?,
    )?;
    let asset = &manifest["assets"][target];
    let (Some(url), Some(sha256), Some(inner)) = (
        asset["url"].as_str(),
        asset["sha256"].as_str(),
        asset["library"].as_str(),
    ) else {
        bail!("pdfium.json has no asset for {target}");
    };
    let inner = Path::new(inner);
    let dir = workspace().join("target/pdfium").join(target);
    let library = dir.join(inner.file_name().context("library name")?);
    let stamp = dir.join("sha256");
    if library.is_file() && std::fs::read_to_string(&stamp).is_ok_and(|s| s.trim() == sha256) {
        return Ok(library);
    }

    std::fs::create_dir_all(&dir)?;
    let archive = dir.join("download.tgz");
    eprintln!("downloading {url}");
    run(Command::new("curl")
        .args(["-fsSL", "--retry", "3", "-o"])
        .arg(&archive)
        .arg(url))?;
    let got = hex(&Sha256::digest(std::fs::read(&archive)?));
    if got != sha256 {
        let _ = std::fs::remove_file(&archive);
        bail!("SHA-256 mismatch for {url}: expected {sha256}, got {got}");
    }

    // relative paths: GNU tar (Git Bash on Windows) reads `C:` as a remote host
    let unpack = dir.join("unpack");
    let _ = std::fs::remove_dir_all(&unpack);
    std::fs::create_dir_all(&unpack)?;
    run(Command::new("tar")
        .args(["-xzf", "../download.tgz"])
        .current_dir(&unpack))?;
    let found = unpack.join(inner);
    ensure!(found.is_file(), "{} not in the archive", inner.display());
    std::fs::copy(&found, &library)?;
    std::fs::remove_dir_all(&unpack)?;
    std::fs::remove_file(&archive)?;
    std::fs::write(&stamp, sha256)?;
    Ok(library)
}

fn run(command: &mut Command) -> Result<()> {
    let status = command
        .status()
        .with_context(|| format!("running {command:?}"))?;
    ensure!(status.success(), "{command:?} failed: {status}");
    Ok(())
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::new(), |mut s, b| {
        let _ = write!(s, "{b:02x}");
        s
    })
}
