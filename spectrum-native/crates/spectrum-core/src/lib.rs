//! Paths, project model, settings, keystore, file watcher, events and errors.

mod error;
mod json;
pub mod paths;
pub mod project;
mod random;
pub mod settings;
#[cfg(windows)]
mod win32;

pub use error::{CoreError, UserNotice};
pub use paths::AppPaths;
pub use settings::{AppSettings, ProjectSettings};
