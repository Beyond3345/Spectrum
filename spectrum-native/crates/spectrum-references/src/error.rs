//! The crate's errors. Their `Display` is the user's copy, as 2.8 words it.

use std::path::{Path, PathBuf};

use spectrum_core::{CoreError, UserNotice};

#[derive(Debug, thiserror::Error)]
pub enum RefError {
    /// The source has no such work (2.8's `NOT_FOUND`).
    #[error("{0}")]
    NotFound(String),
    /// A pasted link to this computer or the local network, or one with a password in it.
    #[error("{0}")]
    Blocked(String),
    /// A lookup or search that failed: unreachable, too slow, an HTTP error.
    #[error("{0}")]
    Lookup(String),
    /// What was asked can't be done as asked (2.8's 400s).
    #[error("{0}")]
    Invalid(String),
    /// Zotero isn't open, its local API is off, or it took too long.
    #[error("{0}")]
    ZoteroUnreachable(String),
    /// Zotero no longer takes Spectrum's key; it has been forgotten.
    #[error("{0}")]
    ZoteroKeyRefused(String),
    /// Zotero answered, but not as hoped.
    #[error("{0}")]
    Zotero(String),
    /// The user cancelled a prompt waiting in Zotero.
    #[error("Cancelled.")]
    Cancelled,
    #[error("Couldn’t {action} {}: {source}", path.display())]
    Io {
        action: &'static str,
        path: PathBuf,
        source: std::io::Error,
    },
    #[error(transparent)]
    Core(#[from] CoreError),
}

impl RefError {
    pub(crate) fn io(action: &'static str, path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            action,
            path: path.to_path_buf(),
            source,
        }
    }

    /// The error as a toast: a title for its kind, the message as the detail.
    pub fn notice(&self) -> UserNotice {
        let title = match self {
            Self::NotFound(_) => "Not found",
            Self::Blocked(_) => "Link not opened",
            Self::Lookup(_) => "Lookup failed",
            Self::Invalid(_) => "Can’t do that",
            Self::ZoteroUnreachable(_) | Self::ZoteroKeyRefused(_) | Self::Zotero(_) => "Zotero",
            Self::Cancelled => "Cancelled",
            Self::Io { .. } => "Couldn’t save",
            Self::Core(e) => return e.notice(),
        };
        let notice = UserNotice::new(title, self.to_string());
        match self {
            Self::ZoteroKeyRefused(_) => notice.with_action("Allow Spectrum in Zotero"),
            _ => notice,
        }
    }
}
