//! Checkpoints, diffs and GitHub sync.

mod compiled;
pub mod diff;
mod error;
pub mod github;
pub mod history;
mod merge3;
mod merge_rules;
mod pull;
mod repo;
mod settings_repo;
mod sync;
#[allow(unsafe_code)]
mod transport;
mod util;

pub use pull::{PullResult, PullState};
pub use repo::{Author, refusal};
pub use settings_repo::{Machine, SettingsRepo, SettingsRepoState};
pub use sync::{Backup, BackupOptions, Link, ProjectStatus, ProjectSync};

pub use diff::{FileDiff, Hunk, HunkKind, TextChanges, WordChange, diff_bytes, diff_text};
pub use error::{GitError, Result};
pub use util::{is_text, secret_looking};
