//! `GitError`: what can go wrong in checkpoints, diffs and GitHub sync. Display is the user's copy.

use std::path::{Path, PathBuf};

use spectrum_core::{CoreError, UserNotice};

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("Couldn’t {action} {}: {source}", path.display())]
    Io {
        action: &'static str,
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("Checkpoint not found.")]
    NotFound,
    #[error("That file isn’t in this checkpoint.")]
    NotInCheckpoint,
    #[error("That file couldn’t be read when this checkpoint was saved, so it isn’t in it.")]
    SkippedFile,
    #[error(
        "Some of this checkpoint’s files haven’t arrived from your other computer yet. Try again once syncing has finished."
    )]
    NotArrived,
    #[error("That path isn’t inside the project.")]
    OutsideProject,
    /// Spectrum leaves the repository alone, or won't do what was asked, for the reason given.
    #[error("{0}")]
    Refused(String),
    /// A file changed while a pull wrote; nothing was left half done and it can be tried again.
    #[error("A file changed while it was being pulled. Spectrum tries again shortly.")]
    Changed,
    /// The project is on GitHub already (from this or the other computer): link to that repository.
    #[error("This project is on GitHub as {owner}/{repo}. Link it here first.")]
    LinkFirst { owner: String, repo: String },
    /// A pull would delete many files at once; nothing was backed up. Sync asks first.
    #[error("GitHub’s changes would delete {0} {files} here, so nothing was backed up. Choose Sync to look at them first.", files = files(.0))]
    WouldDelete(usize),
    #[error("Sign in to GitHub in Settings › GitHub first.")]
    SignedOut,
    #[error("Sign in to GitHub again.")]
    SignInAgain,
    #[error("Couldn’t reach GitHub. Spectrum tries again when the connection is back.")]
    Offline,
    /// GitHub refused, with its own message; `status` is GitHub's HTTP status.
    #[error("{message}")]
    GitHub { status: u16, message: String },
    #[error("{0}")]
    Git(#[from] git2::Error),
    #[error("{0}")]
    Core(#[from] CoreError),
}

#[allow(clippy::trivially_copy_pass_by_ref)] // thiserror hands fields over by reference
fn files(n: &usize) -> &'static str {
    if *n == 1 { "file" } else { "files" }
}

impl GitError {
    pub(crate) fn io(action: &'static str, path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            action,
            path: path.to_path_buf(),
            source,
        }
    }

    /// Whether it only waits for the connection (or GitHub's own trouble), and is worth trying again later.
    pub fn is_waiting(&self) -> bool {
        match self {
            Self::Offline | Self::Changed => true,
            Self::GitHub { status, .. } => *status >= 500,
            Self::Git(err) => matches!(err.class(), git2::ErrorClass::Net),
            _ => false,
        }
    }

    /// The error as the window shows it.
    pub fn notice(&self) -> UserNotice {
        let title = match self {
            Self::NotFound
            | Self::NotInCheckpoint
            | Self::SkippedFile
            | Self::NotArrived
            | Self::OutsideProject => "Checkpoint",
            Self::Io { .. } | Self::Core(_) => "File problem",
            _ => "GitHub",
        };
        let notice = UserNotice::new(title, self.to_string());
        match self {
            Self::SignedOut | Self::SignInAgain => notice.with_action("Open Settings › GitHub"),
            _ => notice,
        }
    }
}

pub type Result<T, E = GitError> = std::result::Result<T, E>;
