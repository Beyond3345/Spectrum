//! Each document's SyncTeX file, kept after its compile: `<cache>/synctex/<doc>.gz`, with where
//! TeX ran beside it in `<doc>.json` (`{ root, cwd, copy? }`), e.g. `chapters/thesis.tex.gz`.

use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use super::{SyncBox, Synctex};
use crate::paths::{canonical, relative_under, resolve, to_slash};

const APP_DIR: &str = ".spectrum";

#[derive(Debug, thiserror::Error)]
pub enum SynctexError {
    #[error("Compile the project first to jump between the source and the PDF.")]
    NotCompiled,
    #[error("Couldn’t find the source for that part of the PDF.")]
    NoSource,
    #[error("This file isn’t part of the compiled PDF.")]
    NotInPdf,
    #[error("That file isn’t inside the project.")]
    OutsideProject,
    #[error("Couldn’t use the SyncTeX file: {0}")]
    Io(#[from] io::Error),
    #[error("Couldn’t read where the last compile ran: {0}")]
    Meta(#[from] serde_json::Error),
}

/// The source line under a point in the PDF.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EditHit {
    /// project-relative, with `/`
    pub file: String,
    pub line: i64,
    pub column: Option<i64>,
}

/// Where TeX ran, to read the inputs it names relative to that folder. `copy`: the folder of
/// auto mode's copy of the project (Jyutping), whose files stand for the project's at the same
/// paths.
#[derive(Debug, Serialize, Deserialize)]
struct Where {
    root: PathBuf,
    cwd: PathBuf,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    copy: Option<PathBuf>,
}

type Parsed = HashMap<PathBuf, (Option<SystemTime>, u64, Arc<Synctex>)>;

/// One project's kept SyncTeX files, each parsed once per version.
pub struct SynctexStore {
    root: PathBuf,
    dir: PathBuf,
    ansi_code_page: Option<u32>,
    // ponytail: one entry per document compiled this session; an LRU if that ever adds up
    parsed: Mutex<Parsed>,
}

impl SynctexStore {
    /// `dir`: the project's `<cache>/synctex`. `ansi_code_page`: Windows' ANSI code page (HKLM
    /// ACP), `None` elsewhere.
    pub fn new(root: PathBuf, dir: PathBuf, ansi_code_page: Option<u32>) -> Self {
        Self {
            root,
            dir,
            ansi_code_page,
            parsed: Mutex::new(HashMap::new()),
        }
    }

    /// A project file as a project-relative path with `/`.
    fn project_relative(&self, file: &str) -> Result<String, SynctexError> {
        let rel = relative_under(&self.root, &resolve(&self.root, Path::new(file)))
            .ok_or(SynctexError::OutsideProject)?;
        Ok(to_slash(&rel))
    }

    fn stored(&self, doc: &str) -> Result<(PathBuf, PathBuf), SynctexError> {
        let doc = self.project_relative(doc)?;
        if doc.is_empty() {
            return Err(SynctexError::OutsideProject);
        }
        let with = |ext: &str| {
            let mut name = OsString::from(self.dir.join(&doc));
            name.push(ext);
            PathBuf::from(name)
        };
        Ok((with(".gz"), with(".json")))
    }

    /// Keeps the SyncTeX file a compile of `doc` just built (`built`, TeX run in `cwd`).
    pub fn keep(
        &self,
        doc: &str,
        built: &Path,
        cwd: &Path,
        copy: Option<&Path>,
    ) -> Result<(), SynctexError> {
        let (file, meta) = self.stored(doc)?;
        if let Some(parent) = meta.parent() {
            fs::create_dir_all(parent)?;
        }
        let place = Where {
            root: self.root.clone(),
            cwd: cwd.to_path_buf(),
            copy: copy.map(Path::to_path_buf),
        };
        write_atomic(&meta, serde_json::to_string_pretty(&place)?.as_bytes())?;
        // an engine that wrote none leaves nothing to keep
        if let Err(err) = rename_over(built, &file) {
            tracing::debug!(?err, built = %built.display(), "no SyncTeX file to keep");
            self.drop_doc(doc)?;
        }
        Ok(())
    }

    /// Forgets it, so a jump never lands in a PDF it didn't describe.
    fn drop_doc(&self, doc: &str) -> Result<(), SynctexError> {
        let (file, meta) = self.stored(doc)?;
        for path in [file, meta] {
            match fs::remove_file(path) {
                Err(err) if err.kind() != io::ErrorKind::NotFound => return Err(err.into()),
                _ => {}
            }
        }
        Ok(())
    }

    fn load(&self, doc: &str) -> Result<(Arc<Synctex>, Where), SynctexError> {
        let (file, meta) = self.stored(doc)?;
        let missing = |err: io::Error| {
            if err.kind() == io::ErrorKind::NotFound {
                SynctexError::NotCompiled
            } else {
                err.into()
            }
        };
        let stat = fs::metadata(&file).map_err(missing)?;
        let key = (stat.modified().ok(), stat.len());
        let mut parsed = self.parsed.lock().unwrap_or_else(PoisonError::into_inner);
        let data = match parsed.get(&file) {
            Some((modified, len, data)) if (*modified, *len) == key => Arc::clone(data),
            _ => {
                let data = match Synctex::read(&file, self.ansi_code_page) {
                    Ok(data) => Arc::new(data),
                    // a half-written or garbled file reads as none, until the next compile
                    Err(err) if err.kind() != io::ErrorKind::NotFound => {
                        tracing::warn!(?err, file = %file.display(), "unreadable SyncTeX file");
                        return Err(SynctexError::NotCompiled);
                    }
                    Err(err) => return Err(missing(err)),
                };
                parsed.insert(file, (key.0, key.1, Arc::clone(&data)));
                data
            }
        };
        drop(parsed);
        let place = serde_json::from_slice(&fs::read(&meta).map_err(missing)?)?;
        Ok((data, place))
    }

    /// The source line under a point on a page of `doc`'s PDF: page 1-based, x and y in points
    /// from the top left.
    pub fn edit(&self, doc: &str, page: i64, x: f64, y: f64) -> Result<EditHit, SynctexError> {
        let (data, place) = self.load(doc)?;
        let hit = data.inverse(page, x, y).ok_or(SynctexError::NoSource)?;
        let file = data
            .input(hit.tag)
            .and_then(|name| project_path(&place, name));
        let file = file.ok_or(SynctexError::NoSource)?;
        Ok(EditHit {
            file,
            line: hit.line,
            column: hit.column,
        })
    }

    /// Where a line of a project file ended up in `doc`'s PDF: one box per typeset line, in
    /// points from each page's top left; the first box's page is the one to show.
    pub fn view(&self, doc: &str, file: &str, line: i64) -> Result<Vec<SyncBox>, SynctexError> {
        let rel = self.project_relative(file)?;
        let (data, place) = self.load(doc)?;
        let tags: HashSet<i64> = data
            .inputs()
            .filter(|(_, name)| project_path(&place, name).as_deref() == Some(rel.as_str()))
            .map(|(tag, _)| tag)
            .collect();
        let boxes = data.forward(&tags, line);
        if boxes.is_empty() {
            return Err(SynctexError::NotInPdf);
        }
        Ok(boxes)
    }
}

/// An input as a project-relative path; TeX names them absolute or from where it ran, often
/// with ./
fn project_path(place: &Where, name: &str) -> Option<String> {
    if name.is_empty() {
        return None;
    }
    let mut input = resolve(&place.cwd, Path::new(name));
    if let Some(copy) = &place.copy
        && let Some(copied) = relative_under(copy, &input).filter(|c| !c.as_os_str().is_empty())
    {
        input = resolve(&place.root, &copied);
    }
    if cfg!(windows) && input.to_string_lossy().contains('?') {
        let root = resolve(&place.root, Path::new(""));
        input = PathBuf::from(repair_root_prefix(
            &input.to_string_lossy(),
            &root.to_string_lossy(),
        ));
    }
    let rel = to_slash(&relative_under(
        &canonical(&place.root),
        &canonical(&input),
    )?);
    let first = rel.split('/').next().unwrap_or_default();
    (!rel.is_empty() && first != ".." && first.to_lowercase() != APP_DIR).then_some(rel)
}

/// Some Windows TeX engines replace characters outside the ANSI code page with '?'. Only this
/// known project's root prefix is repaired, never a guessed source filename.
fn repair_root_prefix(input: &str, root: &str) -> String {
    let mut pattern = String::from("(?i)^");
    for c in root.chars() {
        let escaped = regex::escape(c.encode_utf8(&mut [0; 4]));
        if u32::from(c) > 127 {
            pattern.push_str("(?:");
            pattern.push_str(&escaped);
            pattern.push_str(r"|\?)");
        } else {
            pattern.push_str(&escaped);
        }
    }
    let Ok(prefix) = regex::Regex::new(&pattern) else {
        return input.to_owned();
    };
    match prefix.find(input) {
        Some(m) if input[m.end()..].is_empty() || input[m.end()..].starts_with('\\') => {
            format!("{root}{}", &input[m.end()..])
        }
        _ => input.to_owned(),
    }
}

fn write_atomic(path: &Path, data: &[u8]) -> io::Result<()> {
    let mut tmp = OsString::from(path);
    tmp.push(format!(".{}.tmp", std::process::id()));
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, data)?;
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

/// `fs::rename`, retried for a few seconds on Windows (a scanner or indexer holds a new file
/// open for a moment); across drives it copies beside the target and renames that over it.
fn rename_over(from: &Path, to: &Path) -> io::Result<()> {
    if cfg!(windows) {
        // Windows won't rename over a read-only file
        if let Ok(meta) = fs::symlink_metadata(to) {
            let mut perms = meta.permissions();
            if meta.is_file() && perms.readonly() {
                #[allow(clippy::permissions_set_readonly_false, reason = "Windows only")]
                perms.set_readonly(false);
                fs::set_permissions(to, perms)?;
            }
        }
    }
    let mut wait = 50;
    loop {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(err) if err.kind() == io::ErrorKind::CrossesDevices => {
                let mut tmp = OsString::from(to);
                tmp.push(format!(".{}.tmp", std::process::id()));
                let tmp = PathBuf::from(tmp);
                if let Err(err) = fs::copy(from, &tmp).and_then(|_| rename_over(&tmp, to)) {
                    let _ = fs::remove_file(&tmp);
                    return Err(err);
                }
                return fs::remove_file(from);
            }
            Err(err) => {
                let busy = matches!(
                    err.kind(),
                    io::ErrorKind::PermissionDenied | io::ErrorKind::ResourceBusy
                );
                if !cfg!(windows) || wait > 1600 || !busy {
                    return Err(err);
                }
                std::thread::sleep(std::time::Duration::from_millis(wait));
                wait *= 2;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_prefix_repair() {
        let root = r"C:\Users\Zoë\Paper";
        assert_eq!(
            repair_root_prefix(r"C:\Users\Zo?\Paper\main.tex", root),
            r"C:\Users\Zoë\Paper\main.tex"
        );
        assert_eq!(repair_root_prefix(r"c:\users\zo?\paper", root), root);
        // a '?' in the file's own name stays; so does a longer folder name
        assert_eq!(
            repair_root_prefix(r"C:\Users\Zoë\Paper\?.tex", root),
            r"C:\Users\Zoë\Paper\?.tex"
        );
        assert_eq!(
            repair_root_prefix(r"C:\Users\Zo?\Paper2\a.tex", root),
            r"C:\Users\Zo?\Paper2\a.tex"
        );
    }
}
