//! `CoreError`, and `UserNotice`, the user-facing error shape every crate shares.

use std::path::{Path, PathBuf};

/// What went wrong in `spectrum-core`.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("{action} {path}: {source}")]
    Io {
        action: &'static str,
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("couldn't write JSON to {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    /// The file exists but isn't a JSON object, so it was left as it is rather than replaced.
    #[error("{path} can't be read, so it wasn't changed")]
    Unreadable { path: PathBuf },
    /// An archive entry names a place outside the folder it is extracted into.
    #[error("the archive entry {entry:?} points outside the project")]
    UnsafeArchive { entry: String },
    #[error("couldn't read the archive: {0}")]
    Archive(String),
    #[error("the arXiv entry has no LaTeX source (PDF only)")]
    ArxivPdfOnly,
    #[error("{0}")]
    Keystore(String),
    #[error("invalid API key")]
    InvalidKey,
    #[error("couldn't watch {path}: {source}")]
    Watch {
        path: PathBuf,
        #[source]
        source: notify::Error,
    },
    #[error("the home folder can't be found")]
    NoHome,
    #[error("{0} must be a full folder path")]
    NotAbsolute(PathBuf),
}

impl CoreError {
    pub(crate) fn io(action: &'static str, path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            action,
            path: path.to_path_buf(),
            source,
        }
    }

    /// The error as the window shows it.
    pub fn notice(&self) -> UserNotice {
        let name = |p: &Path| {
            p.file_name().map_or_else(
                || p.display().to_string(),
                |n| n.to_string_lossy().into_owned(),
            )
        };
        match self {
            Self::Io { path, source, .. } => UserNotice::new(
                "Couldn’t use a file",
                format!("“{}”: {source}.", path.display()),
            ),
            Self::Json { path, .. } => UserNotice::new(
                "Couldn’t save",
                format!("“{}” couldn’t be written.", name(path)),
            ),
            Self::Unreadable { path } => UserNotice::new(
                "Settings file can’t be read",
                format!("“{}” can’t be read, so it wasn’t changed.", path.display()),
            )
            .with_action("Fix or remove the file, then try again."),
            Self::UnsafeArchive { entry } => UserNotice::new(
                "Archive refused",
                format!(
                    "“{entry}” in the archive points outside the project, so nothing was imported."
                ),
            ),
            Self::Archive(detail) => {
                UserNotice::new("Couldn’t read the archive", format!("{detail}."))
            }
            Self::ArxivPdfOnly => UserNotice::new(
                "No LaTeX source",
                "This arXiv entry has no LaTeX source (PDF only).",
            ),
            Self::Keystore(detail) => UserNotice::new("Keychain", detail.clone()),
            Self::InvalidKey => {
                UserNotice::new("Invalid API key", "Check the key and type it again.")
            }
            Self::Watch { path, source } => UserNotice::new(
                "Can’t follow changes",
                format!(
                    "Spectrum can’t watch “{}” for changes: {source}.",
                    name(path)
                ),
            ),
            Self::NoHome => {
                UserNotice::new("No home folder", "Spectrum can’t find your home folder.")
            }
            Self::NotAbsolute(path) => UserNotice::new(
                "Choose a full path",
                format!("“{}” must be a full folder path.", path.display()),
            ),
        }
    }
}

/// A user-facing error: what happened, the details, and what to do about it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserNotice {
    pub title: String,
    pub detail: String,
    pub action: Option<String>,
}

impl UserNotice {
    pub fn new(title: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            detail: detail.into(),
            action: None,
        }
    }

    #[must_use]
    pub fn with_action(mut self, action: impl Into<String>) -> Self {
        self.action = Some(action.into());
        self
    }
}

impl From<&CoreError> for UserNotice {
    fn from(err: &CoreError) -> Self {
        err.notice()
    }
}
