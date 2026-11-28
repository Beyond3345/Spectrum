//! Tools › Review's static checks (2.8's `preflight/run.ts`): compile and layout from the last compile's log
//! (through spectrum-compile's log parser), references and assets, privacy and blind review, accessibility
//! and submission readiness, each finding with its file and line (or PDF page) for click-to-jump. The PDF's
//! facts come from the caller (session 7c reads them with spectrum-pdf); nothing here reads a PDF.

mod check;
mod groups;
mod other_docs;
mod references;
mod scan;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::Serialize;

pub use check::{CheckRow, CheckStatus, check_entry, check_references};

use crate::dedupe::{BibFile, BibRecord, bib_records};
use crate::error::RefError;
use crate::project::{normalise, project_files, safe_join};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Group {
    Compile,
    References,
    Privacy,
    Accessibility,
    Submission,
}

impl Group {
    pub const ALL: [Self; 5] = [
        Self::Compile,
        Self::References,
        Self::Privacy,
        Self::Accessibility,
        Self::Submission,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Compile => "Compile and layout",
            Self::References => "References and assets",
            Self::Privacy => "Privacy and blind review",
            Self::Accessibility => "Accessibility",
            Self::Submission => "Submission readiness",
        }
    }

    /// The groups whose checks read the PDF (the compile's, its log too).
    pub fn needs_pdf(self, anonymous: bool) -> bool {
        matches!(self, Self::Compile | Self::Accessibility | Self::Submission)
            || (self == Self::Privacy && anonymous)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

/// One finding. `fixable`: Fix with AI can do something about it in the source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Finding {
    pub group: Group,
    pub severity: Severity,
    pub message: String,
    pub file: Option<String>,
    /// From 1.
    pub line: Option<usize>,
    /// A PDF page, from 1.
    pub page: Option<usize>,
    pub fixable: bool,
}

/// A page as the PDF reader measures it, in points.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PdfPage {
    pub width: f64,
    pub height: f64,
    pub chars: usize,
    /// Characters set under 6 pt.
    pub small_chars: usize,
    /// Text runs past its edge.
    pub outside: bool,
    pub text: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PdfFont {
    pub name: String,
    pub embedded: bool,
    pub type3: bool,
}

/// What the PDF says about itself.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PdfFacts {
    pub version: String,
    pub encrypted: bool,
    pub title: String,
    pub author: String,
    pub lang: String,
    pub outline: bool,
    pub tagged: bool,
    /// Figures in a tagged PDF's structure without alternative text.
    pub figures_without_alt: usize,
    /// `None`: they couldn't be inspected.
    pub fonts: Option<Vec<PdfFont>>,
    pub pages: Vec<PdfPage>,
}

impl PdfFacts {
    /// A PDF that couldn't be opened for its password: nothing but that it's encrypted was read.
    pub(crate) fn unreadable(&self) -> bool {
        self.encrypted && self.pages.is_empty()
    }
}

/// One of TexLab's diagnostics, lines and columns from 1.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TexlabDiagnostic {
    pub line: usize,
    pub col: usize,
    pub end_line: usize,
    pub end_col: usize,
    pub message: String,
    pub code: String,
}

/// What Review checks.
#[derive(Debug, Clone, Default)]
pub struct ReviewInput {
    /// The document reviewed, and the project folder as its log names it.
    pub doc: String,
    pub root: PathBuf,
    /// Every project file, with the text of those read.
    pub files: Vec<(String, Option<String>)>,
    /// The last compile's log ('' for none), and whether that compile made no PDF.
    pub log: String,
    pub failed: bool,
    /// `None`: the entries couldn't be read.
    pub bib: Option<Vec<BibRecord>>,
    pub pdf: Option<PdfFacts>,
    /// TexLab's, by project file, when it runs.
    pub diagnostics: HashMap<String, Vec<TexlabDiagnostic>>,
    /// Anonymous review: what names the authors counts too.
    pub anonymous: bool,
    /// Accessibility's optional checks: a tagged PDF, alt text in its tags, `alt=` on every image.
    pub accessibility_tags: bool,
}

fn ends_any(p: &str, exts: &[&str]) -> bool {
    let lower = p.to_lowercase();
    exts.iter().any(|e| lower.ends_with(e))
}

/// The files Review reads for the privacy scan: the source, and the other text files a key could be left in.
pub(crate) fn is_scanned(path: &str) -> bool {
    ends_any(
        path,
        &[
            ".tex",
            ".ltx",
            ".sty",
            ".cls",
            ".bib",
            ".typ",
            ".md",
            ".markdown",
            ".txt",
            ".json",
            ".yml",
            ".yaml",
            ".toml",
            ".ini",
            ".cfg",
            ".conf",
            ".py",
            ".r",
            ".jl",
            ".m",
            ".sh",
            ".js",
            ".ts",
        ],
    )
}

const MAX_READ: u64 = 2 * 1024 * 1024;

impl ReviewInput {
    /// A project's files and `.bib` entries read for `doc`, with the last compile's log and the PDF's facts.
    /// Blocking.
    pub fn read(
        root: &Path,
        doc: &str,
        log: &str,
        failed: bool,
        pdf: Option<PdfFacts>,
    ) -> Result<Self, RefError> {
        let paths = project_files(root)?;
        let files: Vec<(String, Option<String>)> = paths
            .iter()
            .map(|p| {
                let text = (is_scanned(p))
                    .then(|| safe_join(root, p))
                    .flatten()
                    .filter(|f| std::fs::metadata(f).is_ok_and(|m| m.len() <= MAX_READ))
                    .and_then(|f| std::fs::read_to_string(f).ok());
                (p.clone(), text)
            })
            .collect();
        let bibs: Vec<BibFile> = files
            .iter()
            .filter(|(p, _)| ends_any(p, &[".bib"]))
            .filter_map(|(p, t)| {
                Some(BibFile {
                    file: p.clone(),
                    text: t.clone()?,
                })
            })
            .collect();
        Ok(Self {
            doc: normalise(doc),
            root: root.to_path_buf(),
            files,
            log: log.into(),
            failed,
            bib: Some(bib_records(&bibs)),
            pdf,
            ..Self::default()
        })
    }
}

/// What a group can't check without the PDF or the log: "Compile first", and why. `pdf_error`: the PDF was
/// there but couldn't be read.
pub fn review_gaps(input: &ReviewInput, pdf_error: Option<&str>) -> Vec<(Group, String)> {
    let mut gaps = Vec::new();
    // a failed compile's PDF, if there is one, is an older one's
    let first = if input.failed {
        "The last compile made no PDF".to_owned()
    } else if let Some(e) = pdf_error {
        format!(
            "The PDF couldn’t be read ({})",
            e.chars()
                .take(160)
                .collect::<String>()
                .trim_end_matches('.')
        )
    } else {
        "Compile first".to_owned()
    };
    if input.log.is_empty() {
        gaps.push((Group::Compile, "Compile first.".to_owned()));
    } else if input.pdf.is_none() {
        gaps.push((
            Group::Compile,
            format!("{first}: the page checks need a PDF."),
        ));
    }
    match &input.pdf {
        None => {
            gaps.push((
                Group::Accessibility,
                format!("{first}: most of these checks read the PDF."),
            ));
            gaps.push((Group::Submission, format!("{first}: the PDF’s version, fonts, encryption, bookmarks and small text need a PDF.")));
            if input.anonymous {
                gaps.push((
                    Group::Privacy,
                    format!("{first}: the PDF’s Author field needs a PDF."),
                ));
            }
        }
        Some(p) if p.unreadable() => gaps.push((
            Group::Accessibility,
            "The PDF is password-protected, so its accessibility couldn’t be read.".to_owned(),
        )),
        Some(_) => {}
    }
    gaps
}

/// Findings collected once each (a second of the same says nothing more, and would share its row's id).
#[allow(clippy::type_complexity)]
pub(crate) struct Found {
    list: Vec<Finding>,
    seen: HashSet<(
        Group,
        Severity,
        String,
        Option<String>,
        Option<usize>,
        Option<usize>,
    )>,
}

impl Found {
    fn new() -> Self {
        Self {
            list: Vec::new(),
            seen: HashSet::new(),
        }
    }

    pub fn add(&mut self, f: Finding) {
        if self.seen.insert((
            f.group,
            f.severity,
            f.message.clone(),
            f.file.clone(),
            f.line,
            f.page,
        )) {
            self.list.push(f);
        }
    }

    pub fn at(
        &mut self,
        group: Group,
        severity: Severity,
        message: String,
        file: &str,
        line: usize,
        fixable: bool,
    ) {
        self.add(Finding {
            group,
            severity,
            message,
            file: Some(file.to_owned()),
            line: (line > 0).then_some(line),
            page: None,
            fixable,
        });
    }

    pub fn plain(&mut self, group: Group, severity: Severity, message: String, fixable: bool) {
        self.add(Finding {
            group,
            severity,
            message,
            file: None,
            line: None,
            page: None,
            fixable,
        });
    }

    pub fn page(
        &mut self,
        group: Group,
        severity: Severity,
        message: String,
        page: Option<usize>,
        fixable: bool,
    ) {
        self.add(Finding {
            group,
            severity,
            message,
            file: None,
            line: None,
            page,
            fixable,
        });
    }

    pub fn has(&self, f: impl Fn(&Finding) -> bool) -> bool {
        self.list.iter().any(f)
    }
}

pub(crate) fn plural(n: usize, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

/// “text”, cut to `max` characters.
pub(crate) fn quoted(text: &str, max: usize) -> String {
    if text.chars().count() > max {
        format!("“{}…”", text.chars().take(max - 1).collect::<String>())
    } else {
        format!("“{text}”")
    }
}

/// "a, b and 3 more".
pub(crate) fn listed(items: &[String], max: usize, and: &str) -> String {
    if items.len() <= max {
        match items {
            [] => String::new(),
            [one] => one.clone(),
            [rest @ .., last] => format!("{} {and} {last}", rest.join(", ")),
        }
    } else {
        format!("{} and {} more", items[..max].join(", "), items.len() - max)
    }
}

/// "1–3, 7 and 9".
pub fn page_list(pages: &[usize]) -> String {
    let mut runs = Vec::new();
    let mut i = 0;
    while i < pages.len() {
        let mut j = i;
        while j + 1 < pages.len() && pages[j + 1] == pages[j] + 1 {
            j += 1;
        }
        runs.push(if j > i {
            format!("{}–{}", pages[i], pages[j])
        } else {
            pages[i].to_string()
        });
        i = j + 1;
    }
    listed(&runs, usize::MAX, "and")
}

/// Every check of every group, errors first within each group.
pub fn run_review(input: &ReviewInput) -> Vec<Finding> {
    let mut found = Found::new();
    let ctx = references::Context::new(input);
    groups::compile(input, &ctx, &mut found);
    let latex = ends_any(&input.doc, &[".tex", ".ltx"]);
    if latex {
        references::latex(input, &ctx, &mut found);
    } else if ends_any(&input.doc, &[".md", ".markdown"]) {
        other_docs::markdown(input, &ctx, &mut found);
    } else if ends_any(&input.doc, &[".typ"]) {
        other_docs::typst(input, &ctx, &mut found);
    }
    groups::privacy(input, &ctx, &mut found);
    if latex {
        groups::accessibility(input, &ctx, &mut found);
        groups::submission(input, &ctx, &mut found);
    }
    let mut out = Vec::new();
    for g in Group::ALL {
        let mut in_group: Vec<Finding> = found
            .list
            .iter()
            .filter(|f| f.group == g)
            .cloned()
            .collect();
        in_group.sort_by_key(|f| f.severity);
        out.extend(in_group);
    }
    out
}

#[cfg(test)]
mod tests;
