//! Engine discovery, compile runner and sandbox, log parser and SyncTeX.

mod blocked;
mod engines;
mod error;
mod log_parser;
mod paths;
mod process;
mod runner;
#[cfg(target_os = "macos")]
mod sandbox;
mod synctex;
mod trust;

pub use blocked::blocked_notes;
pub use engines::{
    Asset, EngineManifest, Engines, PandocMinimum, PandocRelease, Release, TARGET, TinymistRelease,
    TypstRelease, TypstReleases, at_least, bundled_dir, find_executable, sha256_file,
    system_search_path, unix_search_path, verify_sha256, version_of, windows_search_path,
    with_tex_folder,
};
pub use error::CompileError;
pub use log_parser::{
    Diagnostic, DiagnosticKind, Severity, last_pass, parse_tex_log, parse_typst_diagnostics,
    project_file,
};
pub use process::CancelToken;
pub use runner::{
    BibTool, CompileEvent, CompileOutcome, CompileRequest, CompileStatus, LatexEngine,
    MarkdownEngine, Runner, Toolchain, Trust, compile,
};
#[cfg(target_os = "macos")]
pub use sandbox::{CompileSandbox, Confinement};
pub use synctex::{
    EditHit, SyncBox, SyncHit, Synctex, SynctexError, SynctexStore, decode_synctex,
    windows_code_page_label,
};
pub use trust::{is_trusted, set_trusted};

/// A pattern written in this crate. Every one is compiled by the tests, so a typo fails them.
#[allow(
    clippy::expect_used,
    reason = "constant patterns, each compiled by the tests"
)]
pub(crate) fn regex(pattern: &str) -> regex::Regex {
    regex::Regex::new(pattern).expect("a constant pattern in spectrum-compile")
}
