//! JSON-RPC client for TexLab and Tinymist.
//!
//! [`LanguageServer::start`] runs a server binary (found elsewhere) on a project folder and returns the
//! handle plus a stream of [`LspEvent`]s. Documents are synced with UTF-16 incremental changes; the handle
//! keeps their text so a server that crashes is started again (up to three times, with exponential
//! backoff) with every open document re-opened.

mod document;
mod framing;
mod rpc;
mod server;
mod settings;

pub use lsp_types;
pub use server::{LanguageServer, ServerConfig, ServerKind, file_uri};
pub use settings::{texlab_settings, tinymist_settings};

use std::time::Duration;

use lsp_types::{PublishDiagnosticsParams, ShowMessageParams};

/// What a server says unasked, and what happens to it.
#[derive(Debug, Clone, PartialEq)]
pub enum LspEvent {
    Diagnostics(PublishDiagnosticsParams),
    ShowMessage(ShowMessageParams),
    /// It stopped unasked; it's started again after `delay`. `attempt` counts from 1.
    Restarting {
        attempt: u32,
        delay: Duration,
    },
    /// Started again, with the open documents re-opened.
    Restarted,
    /// It stopped and won't be started again (out of retries, or it couldn't be started).
    Failed {
        message: String,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum LspError {
    #[error("Couldn’t start the language server: {0}")]
    Spawn(#[source] std::io::Error),
    #[error("The language server stopped.")]
    Exited,
    #[error("The language server isn’t running (it’s restarting or has stopped).")]
    NotRunning,
    #[error("The language server didn’t answer {0} in time.")]
    Timeout(String),
    #[error("The language server answered with an error ({code}): {message}")]
    Server { code: i64, message: String },
    #[error("The language server’s answer wasn’t understood: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{} isn’t an absolute path.", .0.display())]
    NotAbsolute(std::path::PathBuf),
    #[error("TexLab can’t work in a folder whose path has [, ], ^ or | in it: {}", .0.display())]
    UnsupportedPath(std::path::PathBuf),
}
