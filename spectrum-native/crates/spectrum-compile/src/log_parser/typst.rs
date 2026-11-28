//! Typst's errors and warnings. 2.8 ran Typst with `--diagnostic-format short`
//! (`main.typ:3:1: error: unknown variable: foo`); the default human format (`error: ...` then
//! `┌─ main.typ:3:1`, hints as `= hint: ...`) reads the same way.

use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;

use super::{Diagnostic, DiagnosticKind, Severity, lines};
use crate::paths::{relative_under, resolve, strip_verbatim, to_slash};
use crate::regex;

static SHORT: LazyLock<Regex> =
    LazyLock::new(|| regex(r"^(.*?):([0-9]+):([0-9]+): (error|warning): (.*)$"));
static HEADLINE: LazyLock<Regex> = LazyLock::new(|| regex(r"^(error|warning): (.*)$"));
static LOCATION: LazyLock<Regex> = LazyLock::new(|| regex(r"^\s*┌─ (.*):([0-9]+):([0-9]+)$"));
static HINT: LazyLock<Regex> = LazyLock::new(|| regex(r"^\s*(?:= )?(?:hint|help):\s*(.*)$"));

/// A diagnostic's file as the project sees it: Typst prints it from the folder it ran in, and on
/// Windows as a `\\?\` path, which shares no root with the project's until that prefix goes.
fn project_path(file: &str, project_root: &Path, cwd: &Path) -> PathBuf {
    let raw = strip_verbatim(file.trim());
    let abs = resolve(cwd, Path::new(&raw));
    match relative_under(project_root, &abs) {
        Some(rel) => PathBuf::from(to_slash(&rel)),
        None => PathBuf::from(to_slash(Path::new(&raw))),
    }
}

fn severity(word: &str) -> Severity {
    if word == "error" {
        Severity::Error
    } else {
        Severity::Warning
    }
}

/// Typst's errors and warnings, each hint added to the message of the diagnostic before it.
/// Ones with no place in the source (`error: input file not found`) are left out, as 2.8 did.
/// `cwd`: the folder Typst ran in.
pub fn parse_typst_diagnostics(log: &str, project_root: &Path, cwd: &Path) -> Vec<Diagnostic> {
    let mut diagnostics: Vec<Diagnostic> = Vec::new();
    // human format: a headline waiting for its location line
    let mut headline: Option<(Severity, String)> = None;
    let place = |file: &str, line: &str, column: &str, severity, message: &str| Diagnostic {
        path: Some(project_path(file, project_root, cwd)),
        line: line.parse().ok(),
        column: column.parse().ok(),
        severity,
        message: message.trim().to_owned(),
        kind: DiagnosticKind::Typst,
        context: None,
    };
    for line in lines(log) {
        if let Some(m) = SHORT.captures(line) {
            diagnostics.push(place(&m[1], &m[2], &m[3], severity(&m[4]), &m[5]));
            headline = None;
        } else if let Some(m) = HEADLINE.captures(line) {
            headline = Some((severity(&m[1]), m[2].to_owned()));
        } else if let Some(m) = LOCATION.captures(line) {
            if let Some((severity, message)) = headline.take() {
                diagnostics.push(place(&m[1], &m[2], &m[3], severity, &message));
            }
        } else if let (Some(m), Some(last), None) =
            (HINT.captures(line), diagnostics.last_mut(), &headline)
        {
            last.message.push_str("\nHint: ");
            last.message.push_str(m[1].trim());
        }
    }
    diagnostics
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_pattern_compiles() {
        for re in [&SHORT, &HEADLINE, &LOCATION, &HINT] {
            let _ = re.is_match("");
        }
    }
}
