//! `CompileError`: what stops engine discovery or a compile before an engine reports anything.

use std::path::PathBuf;

use spectrum_core::UserNotice;

#[derive(Debug, thiserror::Error)]
pub enum CompileError {
    #[error("{action} {path}: {source}")]
    Io {
        action: &'static str,
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("engines.json can't be read: {0}")]
    Manifest(#[from] serde_json::Error),
    /// A program the compile needs isn't on this computer (`spawn x ENOENT` in 2.8).
    #[error("{0} isn't available")]
    NotFound(String),
}

impl CompileError {
    pub(crate) fn io(
        action: &'static str,
        path: impl Into<PathBuf>,
        source: std::io::Error,
    ) -> Self {
        Self::Io {
            action,
            path: path.into(),
            source,
        }
    }

    /// The error as the window shows it.
    pub fn notice(&self) -> UserNotice {
        match self {
            Self::Io { path, source, .. } => UserNotice::new(
                "The compile couldn’t use a file",
                format!("{}: {source}", path.display()),
            ),
            Self::Manifest(err) => {
                UserNotice::new("Spectrum’s list of engines is damaged", err.to_string())
                    .with_action("Reinstall Spectrum.")
            }
            Self::NotFound(name) => UserNotice::new(
                format!("{name} isn’t available"),
                format!("{name} wasn’t found on this computer."),
            )
            .with_action("Install it, or choose another engine in the Compile menu."),
        }
    }
}
