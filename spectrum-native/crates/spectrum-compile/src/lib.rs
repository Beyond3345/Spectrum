//! Engine discovery, compile runner and sandbox, log parser and SyncTeX.

mod log_parser;
mod paths;

pub use log_parser::{
    Diagnostic, DiagnosticKind, Severity, last_pass, parse_tex_log, parse_typst_diagnostics,
    project_file,
};

/// A pattern written in this crate. Every one is compiled by the tests, so a typo fails them.
#[allow(
    clippy::expect_used,
    reason = "constant patterns, each compiled by the tests"
)]
pub(crate) fn regex(pattern: &str) -> regex::Regex {
    regex::Regex::new(pattern).expect("a constant pattern in spectrum-compile")
}
