//! TeX logs (pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk, Tectonic) as errors and warnings.
//! A port of 2.8's `apps/frontend/src/editor/compileLog.ts`, case for case.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;

use super::{Diagnostic, DiagnosticKind, Severity, lines};
use crate::regex;

// a Windows path starts with its drive, C:/...
static LOCATED: LazyLock<Regex> = LazyLock::new(|| {
    regex(r"^(?:\./)?((?:[A-Za-z]:)?[^\s:()][^:()\n]*\.[A-Za-z]{2,4}):([0-9]+):\s*(.*)$")
});
static TECTONIC: LazyLock<Regex> = LazyLock::new(|| regex(r"^(error|warning):\s*(.*)$"));
// Tectonic names \input files as written, without ".tex": "warning: sections/intro:2: ..."
static TECTONIC_LOCATED: LazyLock<Regex> =
    LazyLock::new(|| regex(r"^(?:\./)?((?:[A-Za-z]:)?[^\s:()][^:()\n]*):([0-9]+):\s*(.*)$"));
static TECTONIC_SKIP: LazyLock<Regex> = LazyLock::new(|| regex("its output follows|^caused by"));
// A TeX pass runs from its banner to "Transcript written on" (Tectonic: to its next "note:")
static PASS_START: LazyLock<Regex> = LazyLock::new(|| {
    regex(r"(?i)^(This is (pdf|Xe|LuaHB|Lua|e-)?TeX, Version|note: (Re)?running TeX)")
});
// pdfTeX glues "Transcript written on" to the end of its SyncTeX line when its column count
// happens to be 0 there, so it can come mid-line
static PASS_END: LazyLock<Regex> = LazyLock::new(|| regex("Transcript written on|^note: "));
static LATEX_WARNING: LazyLock<Regex> = LazyLock::new(|| {
    regex(r"^(?:LaTeX|Package (\S+)|Class (\S+))(?: [0-9A-Za-z_]+)? Warning: (.*)$")
});
static BOX: LazyLock<Regex> = LazyLock::new(|| {
    regex(r"^(?:Over|Under)full \\[hv]box\b.*?(?:at lines? ([0-9]+)(?:--[0-9]+)?)?$")
});
static INPUT_LINE: LazyLock<Regex> = LazyLock::new(|| regex("on input line ([0-9]+)"));
static UNDEFINED_CS: LazyLock<Regex> = LazyLock::new(|| regex(r"^Undefined control sequence\.?$"));
static CS_AT_END: LazyLock<Regex> = LazyLock::new(|| regex(r"^l\.[0-9]+ .*?(\\(?:[A-Za-z@]+|.))$"));
static STOPPED: LazyLock<Regex> = LazyLock::new(|| regex(r"^l\.([0-9]+)(?: (.*))?$"));
static FATAL: LazyLock<Regex> = LazyLock::new(|| regex(r"^\s*==> Fatal error occurred"));
static EMERGENCY: LazyLock<Regex> = LazyLock::new(|| regex(r"^Emergency stop\.?\s*$"));
static APP_NOTE: LazyLock<Regex> = LazyLock::new(|| regex(r"^\[spectrum( warning)?\] (.*)"));
static MISSING_INCLUDE: LazyLock<Regex> = LazyLock::new(|| regex(r"^No file (.+\.tex)\.$"));
static COULDNT_OPEN: LazyLock<Regex> =
    LazyLock::new(|| regex("^I couldn't open (database|style|auxiliary) file "));
static BIB_WARNING: LazyLock<Regex> = LazyLock::new(|| regex("^(?:Warning--|WARN - )(.*)$"));
static BIB_ERROR: LazyLock<Regex> = LazyLock::new(|| regex("^(ERROR) - (.*)$"));
static BUILD_FOLDER: LazyLock<Regex> = LazyLock::new(|| regex(r"^.*?(^|/)\.spectrum/build/[^/]+/"));
static CITATION: LazyLock<Regex> =
    LazyLock::new(|| regex("^Citation .*undefined|undefined citations"));
static REFERENCE: LazyLock<Regex> =
    LazyLock::new(|| regex("^Reference .*undefined|undefined references"));
static MISSING: LazyLock<Regex> =
    LazyLock::new(|| regex("^No file |File `[^']*' not found|^I couldn't open "));

// TeX opens a file with "(path" and closes it with ")"; paths may contain spaces
const FILE_EXTENSIONS: [&str; 11] = [
    "tex", "sty", "cls", "cfg", "def", "clo", "fd", "ltx", "bbl", "aux", "toc",
];

/// TeX hard-wraps its log at 79 characters (paths, messages, even line numbers); glue the
/// pieces back. Counts UTF-16 units, as 2.8 did.
fn unwrap(log: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut carry = String::new();
    for line in lines(log) {
        carry.push_str(line);
        if line.encode_utf16().count() == 79
            && !(line.starts_with("[spectrum") || line.starts_with("Compiled "))
        {
            continue;
        }
        out.push(std::mem::take(&mut carry));
    }
    if !carry.is_empty() {
        out.push(carry);
    }
    out
}

/// Lines of every TeX pass but the last: their warnings are repeats or stale ("Citation ...
/// undefined" before BibTeX ran).
fn earlier_passes(lines: &[String]) -> Vec<bool> {
    let mut passes = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if PASS_START.is_match(&lines[i]) {
            let mut end = i + 1;
            while end < lines.len() && !PASS_END.is_match(&lines[end]) {
                end += 1;
            }
            passes.push((i, end));
            i = end;
        } else {
            i += 1;
        }
    }
    let mut early = vec![false; lines.len()];
    if let Some((_, rest)) = passes.split_last() {
        for &(from, to) in rest {
            early[from..to].fill(true);
        }
    }
    early
}

/// The log's lines with TeX's wrapping undone, without the passes before the last (Preflight
/// reads what `parse_tex_log` leaves out).
pub fn last_pass(log: &str) -> Vec<String> {
    let lines = unwrap(log);
    let early = earlier_passes(&lines);
    lines
        .into_iter()
        .zip(early)
        .filter_map(|(line, early)| (!early).then_some(line))
        .collect()
}

/// The path of the file a `(` opens: the shortest run of non-bracket characters ending in a
/// TeX file extension and followed by a space, a bracket or the line's end.
fn file_after(rest: &str) -> Option<&str> {
    let run = &rest[..rest.find(['(', ')']).unwrap_or(rest.len())];
    let ends = run
        .char_indices()
        .map(|(k, _)| k)
        .skip(1)
        .chain([run.len()]);
    for end in ends {
        let followed =
            rest[end..].chars().next().is_none_or(char::is_whitespace) || end == run.len();
        let candidate = &run[..end];
        let named = candidate
            .rsplit_once('.')
            .is_some_and(|(_, ext)| FILE_EXTENSIONS.contains(&ext));
        if followed && named {
            return Some(candidate);
        }
    }
    None
}

/// Follows TeX's `(file ... )` nesting through one line (`None`: a bracket that isn't a file).
fn track_files(line: &str, files: &mut Vec<Option<String>>) {
    let mut i = 0;
    while i < line.len() {
        match line.as_bytes()[i] {
            b')' => {
                files.pop();
                i += 1;
            }
            b'(' => {
                if let Some(path) = file_after(&line[i + 1..]) {
                    files.push(Some(path.to_owned()));
                    i += 1 + path.len();
                } else {
                    files.push(None);
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }
}

/// Project-relative path: drops the project folder, the build folder and "./".
fn relative(file: &str, root: &str) -> PathBuf {
    let mut path = file.strip_prefix("./").unwrap_or(file);
    // TeX is given the project folder with forward slashes on Windows too
    let root = if cfg!(windows) {
        root.replace('\\', "/")
    } else {
        root.to_owned()
    };
    if !root.is_empty()
        && let Some(rest) = path
            .strip_prefix(root.as_str())
            .and_then(|r| r.strip_prefix('/'))
    {
        path = rest;
    }
    PathBuf::from(BUILD_FOLDER.replace(path, "").as_ref())
}

fn classify(message: &str) -> DiagnosticKind {
    if BOX.is_match(message) {
        DiagnosticKind::BadBox
    } else if CITATION.is_match(message) {
        DiagnosticKind::UndefinedCitation
    } else if REFERENCE.is_match(message) {
        DiagnosticKind::UndefinedReference
    } else if MISSING.is_match(message) {
        DiagnosticKind::MissingFile
    } else {
        DiagnosticKind::General
    }
}

/// Box warnings echo document text until a blank line, errors their `l.N ...` line and the
/// one after: brackets there don't nest files.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Echo {
    Lines(u8),
    Box,
}

struct Found<'a> {
    severity: Severity,
    message: String,
    line: Option<&'a str>,
    file: Option<&'a str>,
    context: Option<&'a str>,
    kind: Option<DiagnosticKind>,
}

impl Found<'_> {
    fn new(severity: Severity, message: impl Into<String>) -> Self {
        Self {
            severity,
            message: message.into(),
            line: None,
            file: None,
            context: None,
            kind: None,
        }
    }
}

struct TexLog<'a> {
    lines: &'a [String],
    root: String,
    found: Vec<Diagnostic>,
    loose: Vec<Diagnostic>,
    // files TeX is reading, innermost last
    files: Vec<Option<String>>,
    echo: Echo,
    early_line: bool,
}

impl<'a> TexLog<'a> {
    /// The .tex file being read, for messages that only give a line ("on input line 3").
    fn tex_file(&self) -> Option<String> {
        let file = self.files.iter().rev().find_map(Option::as_ref)?;
        let tex = file
            .rsplit_once('.')
            .is_some_and(|(_, ext)| ext.eq_ignore_ascii_case("tex"));
        tex.then(|| file.clone())
    }

    /// "Undefined control sequence." names no command: TeX's `l.N ...` line a few lines on
    /// ends with it.
    fn named(&self, message: &str, i: usize) -> String {
        let trimmed = message.trim();
        if !UNDEFINED_CS.is_match(trimmed) {
            return message.to_owned();
        }
        for line in &self.lines[i + 1..self.lines.len().min(i + 8)] {
            if let Some(cs) = CS_AT_END.captures(line).and_then(|c| c.get(1)) {
                let cs = cs.as_str();
                return match trimmed.strip_suffix('.') {
                    Some(base) => format!("{base} {cs}."),
                    None => format!("{trimmed} {cs}"),
                };
            }
        }
        message.to_owned()
    }

    /// TeX's `l.N ...` a few lines on: the line it stopped on, and what it had read of it.
    fn stopped_at(&self, i: usize) -> Option<(&'a str, Option<&'a str>)> {
        let lines: &'a [String] = self.lines;
        lines[i + 1..lines.len().min(i + 8)]
            .iter()
            .find_map(|line| {
                let m = STOPPED.captures(line)?;
                Some((m.get(1)?.as_str(), m.get(2).map(|c| c.as_str())))
            })
    }

    /// "==> Fatal error occurred", and "Emergency stop." once an error has been found, only
    /// repeat that error.
    fn aftermath(&self, message: &str) -> bool {
        FATAL.is_match(message)
            || (EMERGENCY.is_match(message)
                && self.found.iter().any(|e| e.severity == Severity::Error))
    }

    fn push(&mut self, found: &Found<'_>) {
        if found.severity == Severity::Warning && self.early_line {
            return;
        }
        let message = found.message.trim();
        if message.is_empty() {
            return;
        }
        self.found.push(Diagnostic {
            path: found
                .file
                .filter(|f| !f.is_empty())
                .map(|f| relative(f, &self.root)),
            line: found.line.and_then(|l| l.parse().ok()).filter(|&l| l != 0),
            column: None,
            severity: found.severity,
            message: message.to_owned(),
            kind: found.kind.unwrap_or_else(|| classify(message)),
            context: found.context.filter(|c| !c.is_empty()).map(str::to_owned),
        });
    }

    /// Reads line `i`; returns the last line it used.
    fn read(&mut self, i: usize, early: bool) -> usize {
        let lines: &'a [String] = self.lines;
        let line = lines[i].as_str();
        if line.trim().is_empty() {
            if self.echo == Echo::Box {
                self.echo = Echo::Lines(0);
            }
            return i;
        }
        self.early_line = early;
        if PASS_START.is_match(line) {
            self.files.clear();
        }
        if line.starts_with("l.") && line[2..].starts_with(|c: char| c.is_ascii_digit()) {
            self.echo = Echo::Lines(2);
        }
        match self.echo {
            Echo::Lines(n) if n > 0 => self.echo = Echo::Lines(n - 1),
            Echo::Lines(_) => track_files(line, &mut self.files),
            Echo::Box => {}
        }

        // the app's own explanations; [spectrum note] is only for the log
        if line.starts_with("[spectrum note] ") {
            return i;
        }
        if let Some(note) = APP_NOTE.captures(line) {
            let severity = if note.get(1).is_some() {
                Severity::Warning
            } else {
                Severity::Error
            };
            let mut found = Found::new(severity, &note[2]);
            found.kind = Some(DiagnosticKind::App);
            self.push(&found);
            return i;
        }
        if let Some(tect) = TECTONIC.captures(line) {
            self.tectonic(i, &tect[1], tect.get(2).map_or("", |m| m.as_str()));
            return i;
        }
        if let Some(at) = LOCATED.captures(line) {
            let message = at.get(3).map_or("", |m| m.as_str());
            // TeX giving up after an error already listed (a missing .sty) says so twice more
            if self.aftermath(message) {
                return i;
            }
            let number = at.get(2).map_or("", |m| m.as_str());
            let stopped = self.stopped_at(i);
            let mut found = Found::new(Severity::Error, self.named(message, i));
            found.line = Some(number);
            found.file = at.get(1).map(|m| m.as_str());
            found.context = stopped
                .filter(|(l, _)| l.parse::<u32>().ok() == number.parse().ok())
                .and_then(|(_, c)| c);
            self.push(&found);
            return i;
        }
        if let Some(rest) = line.strip_prefix('!') {
            let message = rest.trim_start_matches('!').trim_start();
            if self.aftermath(message) {
                return i;
            }
            let stopped = self.stopped_at(i);
            let file = self.tex_file();
            let mut found = Found::new(Severity::Error, self.named(message, i));
            found.line = stopped.map(|(l, _)| l);
            found.file = file.as_deref();
            found.context = stopped.and_then(|(_, c)| c);
            self.push(&found);
            return i;
        }
        self.warning(i)
    }

    fn tectonic(&mut self, i: usize, severity: &str, rest: &str) {
        let severity = if severity == "error" {
            Severity::Error
        } else {
            Severity::Warning
        };
        if let Some(at) = TECTONIC_LOCATED.captures(rest) {
            let message = at.get(3).map_or("", |m| m.as_str());
            let boxed = BOX
                .captures(message)
                .and_then(|b| b.get(1))
                .map(|b| b.as_str());
            let mut found = Found::new(severity, self.named(message, i));
            found.line = boxed.or_else(|| at.get(2).map(|m| m.as_str()));
            found.file = at.get(1).map(|m| m.as_str());
            self.push(&found);
        } else if severity == Severity::Error && !TECTONIC_SKIP.is_match(rest) {
            // "error: the XeTeX engine had an unrecoverable error": only useful when nothing
            // better was found
            let message = rest.trim();
            self.loose.push(Diagnostic {
                path: None,
                line: None,
                column: None,
                severity,
                message: message.to_owned(),
                kind: classify(message),
                context: None,
            });
        }
    }

    /// Warnings, boxes, missing includes and the bibliography tools; returns the last line used.
    fn warning(&mut self, i: usize) -> usize {
        let lines: &'a [String] = self.lines;
        let line = lines[i].as_str();
        if let Some(warn) = LATEX_WARNING.captures(line) {
            let mut text = line.to_owned();
            let mut end = i;
            // package warnings continue on lines that start with "(pkgname)"
            if let Some(pkg) = warn.get(1).or_else(|| warn.get(2)) {
                let prefix = format!("({})", pkg.as_str());
                while let Some(more) = lines.get(end + 1).and_then(|l| l.strip_prefix(&prefix)) {
                    end += 1;
                    text.push(' ');
                    text.push_str(more.trim());
                }
            }
            let message = text
                .find(" Warning: ")
                .map_or(text.as_str(), |k| &text[k + 10..]);
            let number = INPUT_LINE
                .captures(message)
                .and_then(|m| m.get(1))
                .map(|m| m.as_str().to_owned());
            let file = self.tex_file();
            let mut found = Found::new(Severity::Warning, message);
            found.line = number.as_deref();
            found.file = file.as_deref();
            self.push(&found);
            return end;
        }
        if let Some(boxed) = BOX.captures(line) {
            let file = self.tex_file();
            let mut found = Found::new(Severity::Warning, line);
            found.line = boxed.get(1).map(|m| m.as_str());
            found.file = file.as_deref();
            self.push(&found);
            self.echo = Echo::Box;
            return i;
        }
        // \include of a file that isn't there only says so in passing (.aux, .toc and the like
        // are missing on a first run, as they should be)
        if let Some(missing) = MISSING_INCLUDE.captures(line) {
            let file = self.tex_file();
            let message = format!("No file {}: \\include left it out of the PDF.", &missing[1]);
            let mut found = Found::new(Severity::Warning, message);
            found.file = file.as_deref();
            self.push(&found);
            return i;
        }
        if COULDNT_OPEN.is_match(line) {
            self.push(&Found::new(Severity::Error, line));
            return i;
        }
        let bib = BIB_WARNING
            .captures(line)
            .map(|m| (m.get(1).map_or("", |g| g.as_str()), None))
            .or_else(|| {
                BIB_ERROR
                    .captures(line)
                    .map(|m| ("ERROR", m.get(2).map(|g| g.as_str())))
            });
        if let Some((first, second)) = bib {
            let severity = if first == "ERROR" {
                Severity::Error
            } else {
                Severity::Warning
            };
            let mut found = Found::new(severity, second.unwrap_or(first));
            found.kind = Some(DiagnosticKind::Bibliography);
            self.push(&found);
        }
        i
    }

    fn finish(mut self) -> Vec<Diagnostic> {
        if !self.found.iter().any(|e| e.severity == Severity::Error) {
            self.found.append(&mut self.loose);
        }
        // Tectonic repeats every warning once per pass, and TeX's own "! ..." block repeats
        // Tectonic's located error
        let mut seen = HashSet::new();
        let unique: Vec<Diagnostic> = self
            .found
            .into_iter()
            .filter(|e| {
                let lower = e.message.to_lowercase();
                let message = lower.strip_suffix('.').unwrap_or(&lower);
                let line = e.line.map(|l| l.to_string()).unwrap_or_default();
                seen.insert(format!("{:?}|{line}|{message}", e.severity))
            })
            .collect();
        let (mut errors, warnings): (Vec<_>, Vec<_>) = unique
            .into_iter()
            .partition(|e| e.severity == Severity::Error);
        errors.extend(warnings);
        errors
    }
}

/// Errors first, then warnings. `root`: the project folder, so absolute paths in the log
/// become project paths.
pub fn parse_tex_log(log: &str, root: &Path) -> Vec<Diagnostic> {
    if log.is_empty() {
        return Vec::new();
    }
    let lines = unwrap(log);
    let early = earlier_passes(&lines);
    let mut parse = TexLog {
        lines: &lines,
        root: root.to_string_lossy().into_owned(),
        found: Vec::new(),
        loose: Vec::new(),
        files: Vec::new(),
        echo: Echo::Lines(0),
        early_line: false,
    };
    let mut i = 0;
    while i < lines.len() {
        i = parse.read(i, early[i]) + 1;
    }
    parse.finish()
}

/// The project file a log location means. TeX runs in the main file's folder, so "./main.tex"
/// or Tectonic's "sections/intro" are relative to it; files found through the project root are
/// already project paths. All paths here are project-relative with `/`.
pub fn project_file(file: &str, main_file: &str, files: &[String]) -> String {
    let dir = main_file.rfind('/').map_or("", |k| &main_file[..=k]);
    let normalise = |p: String| {
        let mut parts: Vec<&str> = Vec::new();
        for part in p.split('/') {
            match part {
                ".." => {
                    parts.pop();
                }
                "" | "." => {}
                other => parts.push(other),
            }
        }
        parts.join("/")
    };
    [
        format!("{dir}{file}"),
        format!("{dir}{file}.tex"),
        file.to_owned(),
        format!("{file}.tex"),
    ]
    .into_iter()
    .map(normalise)
    .find(|c| files.contains(c))
    .unwrap_or_else(|| file.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brackets_follow_files() {
        let mut files = Vec::new();
        track_files("(./main.tex (/usr/a b/article.cls) (x [1", &mut files);
        assert_eq!(files, [Some("./main.tex".to_owned()), None]);
        assert_eq!(file_after("./a.tex.bak (x"), None);
        assert_eq!(file_after("./a b.tex more"), Some("./a b.tex"));
        assert_eq!(file_after("x.sty)"), Some("x.sty"));
    }

    #[test]
    fn every_pattern_compiles() {
        for re in [
            &LOCATED,
            &TECTONIC,
            &TECTONIC_LOCATED,
            &TECTONIC_SKIP,
            &PASS_START,
            &PASS_END,
            &LATEX_WARNING,
            &BOX,
            &INPUT_LINE,
            &UNDEFINED_CS,
            &CS_AT_END,
            &STOPPED,
            &FATAL,
            &EMERGENCY,
            &APP_NOTE,
            &MISSING_INCLUDE,
            &COULDNT_OPEN,
            &BIB_WARNING,
            &BIB_ERROR,
            &BUILD_FOLDER,
            &CITATION,
            &REFERENCE,
            &MISSING,
        ] {
            let _ = re.is_match("");
        }
    }
}
