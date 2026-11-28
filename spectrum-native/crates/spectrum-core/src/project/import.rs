//! Overleaf .zip and arXiv e-print imports (2.8's `extractZip` and `extractArxivSource`). An entry that
//! points outside the project fails the import; a link is never made (it could point anywhere on disk).

use std::fs;
use std::io::{self, Read, Seek};
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;

use super::tree::is_hidden_path;
use crate::{CoreError, json};

/// App data and Finder and Explorer litter never come out of an archive (any letter case: APFS and NTFS
/// ignore it), nor does a repository, whose config would say where a later backup to GitHub pushes.
const ARCHIVE_SKIP: [&str; 8] = [
    ".spectrum",
    ".git",
    "__macosx",
    ".ds_store",
    "thumbs.db",
    "desktop.ini",
    ".snapshots",
    ".compile",
];

/// NTFS can't hold <>:"|?* (a ':' would make a hidden stream) or a trailing dot or space, and CON, AUX and
/// the like are devices there whatever their extension.
fn fit_for_windows(part: &str) -> String {
    let part: String = part
        .chars()
        .map(|c| if "<>:\"|?*".contains(c) { '_' } else { c })
        .collect();
    let part = part.trim_end_matches(['.', ' ']);
    let stem = part
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let device = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || (stem.len() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && stem.as_bytes()[3].is_ascii_digit());
    if device {
        format!("_{part}")
    } else {
        part.to_owned()
    }
}

/// An entry's place in the project, or `None` to pass it by. `..` or an absolute path is refused.
fn entry_path(name: &str, windows: bool) -> Result<Option<PathBuf>, CoreError> {
    let unsafe_entry = || CoreError::UnsafeArchive {
        entry: name.to_owned(),
    };
    let normalised = name.replace('\\', "/");
    if normalised.starts_with('/')
        || normalised
            .split('/')
            .next()
            .is_some_and(|p| p.len() == 2 && p.ends_with(':'))
    {
        return Err(unsafe_entry());
    }
    let mut parts = Vec::new();
    for part in normalised.split('/') {
        match part {
            "" | "." => {}
            ".." => return Err(unsafe_entry()),
            _ => {
                let part = if windows {
                    fit_for_windows(part)
                } else {
                    part.to_owned()
                };
                if !part.is_empty() {
                    parts.push(part);
                }
            }
        }
    }
    if parts.is_empty()
        || parts
            .iter()
            .any(|p| ARCHIVE_SKIP.contains(&p.to_lowercase().as_str()))
    {
        return Ok(None);
    }
    Ok(Some(parts.iter().collect()))
}

fn write_entry(root: &Path, rel: &Path, mut reader: impl Read) -> Result<(), CoreError> {
    let target = root.join(rel);
    if let Some(dir) = target.parent() {
        fs::create_dir_all(dir).map_err(|e| CoreError::io("couldn't create", dir, e))?;
    }
    let mut out =
        fs::File::create(&target).map_err(|e| CoreError::io("couldn't create", &target, e))?;
    io::copy(&mut reader, &mut out).map_err(|e| CoreError::io("couldn't write", &target, e))?;
    Ok(())
}

fn make_dir(root: &Path, rel: &Path) -> Result<(), CoreError> {
    let dir = root.join(rel);
    fs::create_dir_all(&dir).map_err(|e| CoreError::io("couldn't create", &dir, e))
}

/// Extracts a .zip (an Overleaf download) into `root`, then unwraps a single top-level folder, as a zip made
/// by compressing a folder holds just that folder.
// ponytail: no size limit, as 2.8; cap the bytes written if zip bombs ever matter
pub fn extract_zip<R: Read + Seek>(reader: R, root: &Path) -> Result<(), CoreError> {
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|e| CoreError::Archive(e.to_string()))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| CoreError::Archive(e.to_string()))?;
        let Some(rel) = entry_path(file.name(), cfg!(windows))? else {
            continue;
        };
        if file.is_symlink() {
            tracing::warn!(entry = file.name(), "a link in the zip was passed by");
        } else if file.is_dir() {
            make_dir(root, &rel)?;
        } else {
            write_entry(root, &rel, &mut file)?;
        }
    }
    unwrap_single_folder(root)
}

/// Moves the contents of a lone top-level folder up into `root`.
fn unwrap_single_folder(root: &Path) -> Result<(), CoreError> {
    let entries: Vec<fs::DirEntry> = fs::read_dir(root)
        .map_err(|e| CoreError::io("couldn't list", root, e))?
        .filter_map(Result::ok)
        .filter(|e| !is_hidden_path(Path::new(&e.file_name())))
        .collect();
    let [only] = entries.as_slice() else {
        return Ok(());
    };
    if !only.file_type().is_ok_and(|t| t.is_dir()) {
        return Ok(());
    }
    let temp = root.join(format!(".unwrap-{}", crate::random::uuid_v4()?));
    json::rename_over(&only.path(), &temp).map_err(|e| CoreError::io("couldn't move", &temp, e))?;
    for entry in fs::read_dir(&temp).map_err(|e| CoreError::io("couldn't list", &temp, e))? {
        let entry = entry.map_err(|e| CoreError::io("couldn't list", &temp, e))?;
        let to = root.join(entry.file_name());
        json::rename_over(&entry.path(), &to)
            .map_err(|e| CoreError::io("couldn't move", &to, e))?;
    }
    fs::remove_dir_all(&temp).map_err(|e| CoreError::io("couldn't remove", &temp, e))
}

/// Extracts an arXiv e-print into `root`: a gzipped tarball, or for a single-file paper a gzipped .tex
/// (written as main.tex). A PDF-only entry is `CoreError::ArxivPdfOnly`.
// ponytail: the whole e-print in memory, as 2.8; arXiv caps sources at 50 MB
pub fn extract_arxiv(data: &[u8], root: &Path) -> Result<(), CoreError> {
    let data = if data.starts_with(&[0x1f, 0x8b]) {
        let mut out = Vec::new();
        GzDecoder::new(data)
            .read_to_end(&mut out)
            .map_err(|e| CoreError::Archive(e.to_string()))?;
        out
    } else {
        data.to_vec()
    };
    if data.starts_with(b"%PDF-") {
        return Err(CoreError::ArxivPdfOnly);
    }
    if data.len() <= 262 || &data[257..262] != b"ustar" {
        return write_entry(root, Path::new("main.tex"), data.as_slice());
    }
    let mut archive = tar::Archive::new(data.as_slice());
    for entry in archive
        .entries()
        .map_err(|e| CoreError::Archive(e.to_string()))?
    {
        let entry = entry.map_err(|e| CoreError::Archive(e.to_string()))?;
        let name = String::from_utf8_lossy(&entry.path_bytes()).into_owned();
        let kind = entry.header().entry_type();
        let Some(rel) = entry_path(&name, cfg!(windows))? else {
            continue;
        };
        if kind.is_dir() {
            make_dir(root, &rel)?;
        } else if kind.is_file() || kind.is_contiguous() {
            write_entry(root, &rel, entry)?;
        } else if kind.is_symlink() || kind.is_hard_link() {
            tracing::warn!(entry = %name, "a link in the arXiv source was passed by");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};

    fn zip_of(entries: &[(&str, &str)]) -> Cursor<Vec<u8>> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, text) in entries {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(text.as_bytes()).unwrap();
        }
        Cursor::new(writer.finish().unwrap().into_inner())
    }

    fn gz(data: &[u8]) -> Vec<u8> {
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(data).unwrap();
        enc.finish().unwrap()
    }

    #[test]
    fn zip_unwraps_its_folder_and_skips_litter() {
        let dir = tempfile::tempdir().unwrap();
        let zip = zip_of(&[
            ("paper/main.tex", "x"),
            ("paper/figs/a.png", "p"),
            ("__MACOSX/paper/._main.tex", ""),
            ("paper/.git/config", ""),
        ]);
        extract_zip(zip, dir.path()).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("main.tex")).unwrap(),
            "x"
        );
        assert!(dir.path().join("figs/a.png").exists());
        assert!(!dir.path().join("paper").exists() && !dir.path().join("__MACOSX").exists());
        assert!(!dir.path().join(".git").exists());
    }

    #[test]
    fn zip_slip_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("p");
        fs::create_dir(&root).unwrap();
        for name in [
            "../evil.tex",
            "a/../../evil.tex",
            "/etc/evil",
            "..\\evil.tex",
            "C:/evil",
        ] {
            let err = extract_zip(zip_of(&[(name, "x")]), &root).unwrap_err();
            assert!(matches!(err, CoreError::UnsafeArchive { .. }), "{name}");
        }
        assert!(!dir.path().join("evil.tex").exists());
    }

    #[cfg(unix)]
    #[test]
    fn zip_links_are_never_made() {
        let dir = tempfile::tempdir().unwrap();
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .add_symlink(
                "link",
                "/etc/passwd",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
        writer
            .start_file("main.tex", zip::write::SimpleFileOptions::default())
            .unwrap();
        let zip = Cursor::new(writer.finish().unwrap().into_inner());
        extract_zip(zip, dir.path()).unwrap();
        assert!(fs::symlink_metadata(dir.path().join("link")).is_err());
        assert!(dir.path().join("main.tex").exists());
    }

    fn tarball(build: impl FnOnce(&mut tar::Builder<Vec<u8>>)) -> Vec<u8> {
        let mut builder = tar::Builder::new(Vec::new());
        build(&mut builder);
        gz(&builder.into_inner().unwrap())
    }

    fn file_header(size: usize) -> tar::Header {
        let mut header = tar::Header::new_ustar();
        header.set_size(size as u64);
        header.set_mode(0o644);
        header.set_cksum();
        header
    }

    #[test]
    fn arxiv_tarball_extracts_files_but_no_links() {
        let dir = tempfile::tempdir().unwrap();
        let data = tarball(|b| {
            b.append_data(&mut file_header(1), "ms.tex", "x".as_bytes())
                .unwrap();
            b.append_data(&mut file_header(1), "figs/a.pdf", "y".as_bytes())
                .unwrap();
            let mut link = tar::Header::new_ustar();
            link.set_entry_type(tar::EntryType::Symlink);
            link.set_size(0);
            b.append_link(&mut link, "evil", "/etc/passwd").unwrap();
        });
        extract_arxiv(&data, dir.path()).unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("ms.tex")).unwrap(), "x");
        assert!(dir.path().join("figs/a.pdf").exists());
        assert!(fs::symlink_metadata(dir.path().join("evil")).is_err());
    }

    #[test]
    fn arxiv_traversal_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        // the tar crate's own writer refuses '..', so the name goes straight into the header
        let mut header = file_header(1);
        header.as_old_mut().name[..9].copy_from_slice(b"../x.tex\0");
        header.set_cksum();
        let mut raw = header.as_bytes().to_vec();
        raw.extend_from_slice(&[b'x'; 512]);
        raw.extend_from_slice(&[0; 1024]);
        let err = extract_arxiv(&gz(&raw), dir.path()).unwrap_err();
        assert!(matches!(err, CoreError::UnsafeArchive { .. }));
    }

    #[test]
    fn arxiv_single_file_and_pdf_only() {
        let dir = tempfile::tempdir().unwrap();
        extract_arxiv(&gz(b"\\documentclass{article}"), dir.path()).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("main.tex")).unwrap(),
            "\\documentclass{article}"
        );
        assert!(matches!(
            extract_arxiv(&gz(b"%PDF-1.7"), dir.path()),
            Err(CoreError::ArxivPdfOnly)
        ));
    }

    #[test]
    fn windows_names_are_fitted() {
        assert_eq!(
            entry_path("a:b/con.tex", true).unwrap(),
            Some(PathBuf::from("a_b/_con.tex"))
        );
        assert_eq!(
            entry_path("dir./x?", true).unwrap(),
            Some(PathBuf::from("dir/x_"))
        );
        assert_eq!(
            entry_path("a:b", false).unwrap(),
            Some(PathBuf::from("a:b"))
        );
    }
}
