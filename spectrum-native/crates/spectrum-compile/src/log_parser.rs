//! Compile logs as diagnostics: the TeX engines' (pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk,
//! Tectonic) and Typst's.

mod tex;
mod typst;

use std::path::PathBuf;

pub use tex::{last_pass, parse_tex_log, project_file};
pub use typst::parse_typst_diagnostics;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
}

/// What a diagnostic is about, for filtering and for the fix the app offers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticKind {
    /// Any TeX error or warning without a finer kind.
    General,
    /// Overfull or underfull `\hbox` / `\vbox`.
    BadBox,
    UndefinedReference,
    UndefinedCitation,
    /// A file TeX or BibTeX couldn't find (`File ... not found`, `No file x.tex`).
    MissingFile,
    /// BibTeX or Biber.
    Bibliography,
    Typst,
    /// A line the app wrote into the log itself (`[spectrum] ...`).
    App,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    /// Project-relative when the file is in the project, else as the log names it.
    pub path: Option<PathBuf>,
    /// From 1.
    pub line: Option<u32>,
    /// Typst's only: as Typst prints it, from 0 in characters.
    pub column: Option<u32>,
    pub severity: Severity,
    pub message: String,
    pub kind: DiagnosticKind,
    /// TeX's only: what it had read of the line when it stopped (its `l.N ...` line), the
    /// command at fault last.
    pub context: Option<String>,
}

/// Lines split as JavaScript's `split(/\r?\n/)` does.
fn lines(log: &str) -> impl Iterator<Item = &str> {
    log.split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
}
