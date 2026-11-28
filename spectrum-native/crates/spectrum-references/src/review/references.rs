//! References and assets: missing entries and labels, labels used twice, the `.bib`'s own problems and keys
//! never cited, missing images, floats never referred to, and TexLab's findings the scan missed; for LaTeX,
//! Markdown and Typst documents.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;

use super::scan::{INPUT, LABEL, Lines, TexScan, code_of, input_name, scan_insights, scan_tex};
use super::{Found, Group, ReviewInput, Severity, listed, plural, quoted};
use crate::dedupe::BibRecord;
use crate::project::{folder_of, normalise};
use crate::text::{re, without_comments};

#[derive(Debug, Clone)]
pub(crate) struct Place {
    pub file: String,
    pub line: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct Keyed {
    pub key: String,
    pub file: String,
    pub line: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct Image {
    pub name: String,
    pub options: String,
    pub file: String,
    pub line: usize,
}

/// A name looked up as the compile looks for it: the file, or one that differs only in letter case.
#[derive(Debug, Clone, Default)]
pub(crate) struct Hit {
    pub path: Option<String>,
    pub folded: Option<String>,
}

/// What the checks share: the files, the document's source and what it holds, and what the log says.
pub(crate) struct Context {
    pub paths: Vec<String>,
    path_set: HashSet<String>,
    folded: HashMap<String, String>,
    pub texts: HashMap<String, String>,
    pub doc_files: Vec<String>,
    pub sources: Vec<(String, String)>,
    pub scans: Vec<TexScan>,
    pub labels: Vec<(String, Vec<Place>)>,
    pub refs: Vec<Keyed>,
    pub cites: Vec<Keyed>,
    pub images: Vec<Image>,
    pub included: Vec<(String, String, Place)>,
    pub bibitems: HashSet<String>,
    graphics_dirs: Vec<String>,
    pub cites_all: bool,
    pub insights: super::scan::Insights,
    /// The last pass of a compile that made its PDF.
    pub clean: String,
    pub unresolved_citations: Vec<String>,
    pub unresolved_references: Vec<String>,
    pub no_database: bool,
}

const REF_COMMANDS: &[&str] = &[
    "ref",
    "eqref",
    "pageref",
    "cref",
    "Cref",
    "autoref",
    "nameref",
    "vref",
    "Vref",
    "labelcref",
    "cpageref",
    "Cpageref",
    "namecref",
    "nameCref",
];

fn is_cite_command(name: &str) -> bool {
    (name.contains("cite") || name.contains("Cite"))
        && !name.contains("style")
        && name.chars().all(|c| c.is_ascii_alphabetic())
}

static OPTION_LABEL: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"\\(?:begin\s*\{(?:lstlisting|minted|tcolorbox)\}|lstinputlisting|inputminted)[^\n]*?\blabel\s*=\s*\{?([^,{}\]\s]+)",
    )
});
static COMMAND_ARG: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\([A-Za-z]+)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}"));
static BIBITEM: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\bibitem\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}"));
static GRAPHICS: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\includegraphics\*?\s*(?:\[([^\]]*)\]\s*){0,2}\{([^{}]+)\}"));
static GRAPHICSPATH: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\graphicspath\s*\{((?:\s*\{[^{}]*\})+)\s*\}"));
static BRACED: LazyLock<Regex> = LazyLock::new(|| re(r"\{([^{}]*)\}"));
static UNRESOLVED: LazyLock<Regex> =
    LazyLock::new(|| re(r"(Citation|Reference) [`'‘]([^'’]+)['’] on page \S+ undefined"));
static NO_DATABASE: LazyLock<Regex> =
    LazyLock::new(|| re(r"I couldn't open database file|ERROR - Cannot find '[^']*'"));
const IMAGE_EXTS: &[&str] = &[
    ".pdf", ".png", ".jpg", ".jpeg", ".mps", ".eps", ".jbig2", ".jb2",
];
static IMAGE_FILE: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?i)\.(?:pdf|png|jpe?g|mps|eps|ps|jbig2|jb2|svg|gif|tiff?|bmp|webp|heic|heif)$")
});
static HAS_EXT: LazyLock<Regex> = LazyLock::new(|| re(r"\.[A-Za-z0-9]+$"));

impl Context {
    pub fn new(input: &ReviewInput) -> Self {
        let paths: Vec<String> = input.files.iter().map(|(p, _)| p.clone()).collect();
        let texts: HashMap<String, String> = input
            .files
            .iter()
            .filter_map(|(p, t)| Some((p.clone(), t.clone()?)))
            .collect();
        let mut cx = Self {
            path_set: paths.iter().cloned().collect(),
            folded: paths
                .iter()
                .map(|p| (p.to_lowercase(), p.clone()))
                .collect(),
            paths,
            texts,
            doc_files: Vec::new(),
            sources: Vec::new(),
            scans: Vec::new(),
            labels: Vec::new(),
            refs: Vec::new(),
            cites: Vec::new(),
            images: Vec::new(),
            included: Vec::new(),
            bibitems: HashSet::new(),
            graphics_dirs: vec![String::new()],
            cites_all: false,
            insights: super::scan::Insights::default(),
            clean: String::new(),
            unresolved_citations: Vec::new(),
            unresolved_references: Vec::new(),
            no_database: false,
        };
        cx.doc_files = cx.document_files(&input.doc);
        cx.sources = cx
            .doc_files
            .iter()
            .map(|p| (p.clone(), cx.texts[p].clone()))
            .collect();
        cx.scans = cx.sources.iter().map(|(_, t)| scan_tex(t)).collect();
        cx.read_source(&input.doc);
        cx.insights = scan_insights(&cx.sources);
        if !input.log.is_empty() && !input.failed {
            cx.clean = spectrum_compile::last_pass(&input.log).join("\n");
        }
        cx.no_database = NO_DATABASE.is_match(&cx.clean);
        for d in spectrum_compile::parse_tex_log(&input.log, &input.root) {
            if let Some(c) = UNRESOLVED.captures(&d.message) {
                let list = if &c[1] == "Citation" {
                    &mut cx.unresolved_citations
                } else {
                    &mut cx.unresolved_references
                };
                if !list.contains(&c[2].to_owned()) {
                    list.push(c[2].to_owned());
                }
            }
        }
        cx
    }

    /// The project file a set of candidates means.
    pub fn lookup(&self, candidates: &[String]) -> Hit {
        if let Some(p) = candidates.iter().find(|c| self.path_set.contains(*c)) {
            return Hit {
                path: Some(p.clone()),
                folded: None,
            };
        }
        Hit {
            path: None,
            folded: candidates
                .iter()
                .find_map(|c| self.folded.get(&c.to_lowercase()).cloned()),
        }
    }

    pub fn tex_file(&self, from: &str, name: &str) -> Hit {
        let bases = [
            normalise(&format!("{}{name}", folder_of(from))),
            normalise(name),
        ];
        let candidates: Vec<String> = bases
            .iter()
            .flat_map(|b| {
                if b.to_lowercase().ends_with(".tex") {
                    vec![b.clone()]
                } else {
                    vec![format!("{b}.tex"), b.clone()]
                }
            })
            .collect();
        self.lookup(&candidates)
    }

    pub fn image_file(&self, doc: &str, name: &str) -> Hit {
        let candidates: Vec<String> = self
            .graphics_dirs
            .iter()
            .flat_map(|dir| {
                [
                    normalise(&format!("{}{dir}{name}", folder_of(doc))),
                    normalise(&format!("{dir}{name}")),
                ]
            })
            .flat_map(|base| {
                if HAS_EXT.is_match(&base) && IMAGE_FILE.is_match(&base) {
                    vec![base]
                } else {
                    IMAGE_EXTS.iter().map(|e| format!("{base}{e}")).collect()
                }
            })
            .collect();
        self.lookup(&candidates)
    }

    /// The files a document reads, `\input` by `\input` (a Typst file's `#include`s), each once.
    pub fn document_files(&self, from: &str) -> Vec<String> {
        let mut out = Vec::new();
        self.visit(from, from, &mut out);
        out
    }

    fn visit(&self, doc: &str, path: &str, out: &mut Vec<String>) {
        if out.iter().any(|p| p == path) || !self.texts.contains_key(path) {
            return;
        }
        out.push(path.to_owned());
        let text = &self.texts[path];
        if path.to_lowercase().ends_with(".typ") {
            static INCLUDE: LazyLock<Regex> =
                LazyLock::new(|| re(r#"(?m)^\s*#include\s+"([^"]+)""#));
            for c in INCLUDE.captures_iter(text) {
                let target = if c[1].starts_with('/') {
                    normalise(&c[1])
                } else {
                    normalise(&format!("{}{}", folder_of(path), &c[1]))
                };
                self.visit(doc, &target, out);
            }
        } else {
            for name in scan_tex(text).inputs {
                let hit = self.tex_file(doc, &name);
                if let Some(p) = hit.path.or(hit.folded) {
                    self.visit(doc, &p, out);
                }
            }
        }
    }

    fn label(&mut self, key: &str, file: &str, line: usize) {
        // a key with a # in it is a \newcommand's argument, not a label of the document's
        if key.contains('#') {
            return;
        }
        match self.labels.iter_mut().find(|(k, _)| k == key) {
            Some((_, places)) => places.push(Place {
                file: file.into(),
                line,
            }),
            None => self.labels.push((
                key.into(),
                vec![Place {
                    file: file.into(),
                    line,
                }],
            )),
        }
    }

    fn read_source(&mut self, doc: &str) {
        for (path, text) in self.sources.clone() {
            let code = code_of(&text);
            let lines = Lines::new(&code);
            for c in LABEL.captures_iter(&code) {
                let at = c.get(0).map_or(0, |m| m.start());
                self.label(c[1].trim(), &path, lines.at(at));
            }
            // a listing's or box's label in its options, which code_of blanked with the listing
            for c in OPTION_LABEL.captures_iter(&without_comments(&text)) {
                let at = c.get(0).map_or(0, |m| m.start());
                self.label(c[1].trim(), &path, lines.at(at));
            }
            for c in COMMAND_ARG.captures_iter(&code) {
                let at = c.get(0).map_or(0, |m| m.start());
                let is_ref = REF_COMMANDS.contains(&&c[1]);
                if !is_ref && !is_cite_command(&c[1]) {
                    continue;
                }
                for key in c[2].split(',').map(str::trim) {
                    if key == "*" && !is_ref {
                        self.cites_all = true;
                    } else if !key.is_empty() && !key.contains('#') {
                        let k = Keyed {
                            key: key.into(),
                            file: path.clone(),
                            line: lines.at(at),
                        };
                        if is_ref {
                            self.refs.push(k);
                        } else {
                            self.cites.push(k);
                        }
                    }
                }
            }
            self.bibitems
                .extend(BIBITEM.captures_iter(&code).map(|c| c[1].trim().to_owned()));
            for c in GRAPHICSPATH.captures_iter(&code) {
                self.graphics_dirs
                    .extend(BRACED.captures_iter(&c[1]).map(|d| d[1].trim().to_owned()));
            }
            for c in GRAPHICS.captures_iter(&code) {
                if c[2].contains('#') {
                    continue;
                }
                let at = c.get(0).map_or(0, |m| m.start());
                self.images.push(Image {
                    name: c[2].trim().into(),
                    options: c.get(1).map_or("", |m| m.as_str()).into(),
                    file: path.clone(),
                    line: lines.at(at),
                });
            }
            for c in INPUT.captures_iter(&code) {
                let at = c.get(0).map_or(0, |m| m.start());
                let command = c
                    .get(0)
                    .map_or("", |m| m.as_str())
                    .trim_start_matches('\\')
                    .split(|ch: char| !ch.is_ascii_alphabetic())
                    .next()
                    .unwrap_or("")
                    .to_owned();
                self.included.push((
                    input_name(&c),
                    command,
                    Place {
                        file: path.clone(),
                        line: lines.at(at),
                    },
                ));
            }
        }
        // the labels of the documents \externaldocument links, with their prefix
        for (_, text) in self.sources.clone() {
            for (prefix, name) in scan_tex(&text).externals {
                let other = normalise(&format!(
                    "{}{}",
                    folder_of(doc),
                    if name.to_lowercase().ends_with(".tex") {
                        name.clone()
                    } else {
                        format!("{name}.tex")
                    }
                ));
                for file in self.document_files(&other) {
                    for key in scan_tex(&self.texts[&file]).labels {
                        let key = format!("{prefix}{key}");
                        if !self.labels.iter().any(|(k, _)| *k == key) {
                            self.labels.push((
                                key,
                                vec![Place {
                                    file: file.clone(),
                                    line: 0,
                                }],
                            ));
                        }
                    }
                }
            }
        }
    }

    pub fn has_label(&self, key: &str) -> bool {
        self.labels.iter().any(|(k, _)| k == key)
    }

    /// After a compile that made its PDF, the log says what TeX found in the TeX tree (a TEXMFHOME image).
    pub fn tex_found(&self, image: &str) -> bool {
        if self.clean.is_empty() {
            return false;
        }
        let e = regex::escape(image);
        let base = regex::escape(image.rsplit('/').next().unwrap_or(image));
        let missing = re(&format!(
            r"File `{e}' not found|Unable to load picture or PDF file '{e}"
        ))
        .is_match(&self.clean);
        let found = re(&format!(
            r"(?m)^File: (?:\S*/)?{base}(?:\.[A-Za-z0-9]+)? Graphic file"
        ))
        .is_match(&self.clean)
            || re(&format!(r"<(?:[^<>]*/)?{base}(?:\.[A-Za-z0-9]+)?>")).is_match(&self.clean);
        !missing && found
    }
}

static DOI_SHAPE: LazyLock<Regex> = LazyLock::new(|| re(r"^10\.\d{4,9}/\S+$"));
static DOI_PREFIX: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)"));

fn required(kind: &str) -> &'static [&'static [&'static str]] {
    match kind {
        "article" => &[
            &["author"],
            &["title"],
            &["journal", "journaltitle"],
            &["year", "date"],
        ],
        "inproceedings" | "conference" => {
            &[&["author"], &["title"], &["booktitle"], &["year", "date"]]
        }
        "incollection" => &[
            &["author"],
            &["title"],
            &["booktitle"],
            &["publisher"],
            &["year", "date"],
        ],
        "book" => &[
            &["author", "editor"],
            &["title"],
            &["publisher"],
            &["year", "date"],
        ],
        "phdthesis" | "mastersthesis" | "thesis" => &[
            &["author"],
            &["title"],
            &["school", "institution"],
            &["year", "date"],
        ],
        "techreport" | "report" => &[&["author"], &["title"], &["institution"], &["year", "date"]],
        _ => &[],
    }
}

/// The `.bib` entries' own checks (a key twice, the same work twice, a field missing, a DOI that isn't one)
/// and those never cited.
pub(crate) fn entry_checks(
    found: &mut Found,
    entries: &[&BibRecord],
    cites: &[String],
    cites_all: bool,
) {
    let g = Group::References;
    let mut by_key: Vec<&BibRecord> = Vec::new();
    for e in entries {
        if let Some(first) = by_key.iter().find(|f| f.key == e.key) {
            found.at(
                g,
                Severity::Warning,
                format!(
                    "The key {} is in the bibliography twice (first at {}:{})",
                    quoted(&e.key, 80),
                    first.file,
                    first.line
                ),
                &e.file,
                e.line,
                true,
            );
        } else {
            by_key.push(e);
        }
        if let Some(d) = &e.duplicate_of {
            found.at(
                g,
                Severity::Warning,
                format!(
                    "{} looks like the same work as {} (same {})",
                    quoted(&e.key, 80),
                    quoted(&d.key, 80),
                    d.by
                ),
                &e.file,
                e.line,
                true,
            );
        }
        let lacking: Vec<String> = required(&e.kind)
            .iter()
            .filter(|forms| !forms.iter().any(|f| e.fields.iter().any(|x| x == f)))
            .map(|forms| forms[0].to_owned())
            .collect();
        if !lacking.is_empty() {
            found.at(
                g,
                Severity::Warning,
                format!(
                    "The {} entry {} has no {}",
                    e.kind,
                    quoted(&e.key, 80),
                    listed(&lacking, usize::MAX, "or")
                ),
                &e.file,
                e.line,
                false,
            );
        }
        if !e.doi.is_empty() && !DOI_SHAPE.is_match(&DOI_PREFIX.replace(e.doi.trim(), "")) {
            found.at(
                g,
                Severity::Warning,
                format!(
                    "The DOI of {} doesn’t look like one (10.xxxx/…)",
                    quoted(&e.key, 80)
                ),
                &e.file,
                e.line,
                false,
            );
        }
    }
    if !cites.is_empty() && !cites_all {
        let mut unused: Vec<(String, Vec<&BibRecord>)> = Vec::new();
        for e in &by_key {
            if cites.contains(&e.key) {
                continue;
            }
            match unused.iter_mut().find(|(f, _)| *f == e.file) {
                Some((_, list)) => list.push(e),
                None => unused.push((e.file.clone(), vec![e])),
            }
        }
        for (file, list) in unused {
            let keys: Vec<String> = list.iter().map(|e| e.key.clone()).collect();
            let n = list.len();
            found.at(
                g,
                Severity::Info,
                format!(
                    "{} in {file} {} never cited: {}",
                    plural(n, "entry", "entries"),
                    if n == 1 { "is" } else { "are" },
                    listed(&keys, 5, "and")
                ),
                &file,
                list[0].line,
                false,
            );
        }
    }
}

fn included_file(cx: &Context, doc: &str, name: &str, ext: &str) -> Option<String> {
    let dir = folder_of(doc);
    let mut c = vec![format!("{dir}{name}{ext}"), format!("{name}{ext}")];
    if name.to_lowercase().ends_with(ext) {
        c.extend([format!("{dir}{name}"), name.to_owned()]);
    }
    c.into_iter()
        .map(|p| normalise(&p))
        .find(|p| cx.path_set.contains(p))
}

pub(crate) fn latex(input: &ReviewInput, cx: &Context, found: &mut Found) {
    let g = Group::References;
    let named: HashSet<String> = cx
        .scans
        .iter()
        .flat_map(|s| s.bibs.iter())
        .filter_map(|n| included_file(cx, &input.doc, n, ".bib"))
        .collect();
    let entries: Vec<&BibRecord> = input
        .bib
        .iter()
        .flatten()
        .filter(|e| named.is_empty() || named.contains(&e.file))
        .collect();
    let keys: HashSet<&str> = entries
        .iter()
        .map(|e| e.key.as_str())
        .chain(cx.bibitems.iter().map(String::as_str))
        .collect();
    // after a compile that made its PDF, a key the project lacks is missing only if the log says so too
    let unfound = |key: Option<&str>| {
        cx.clean.is_empty()
            || cx.no_database
            || key.map_or(!cx.unresolved_citations.is_empty(), |k| {
                cx.unresolved_citations.iter().any(|u| u == k)
            })
    };
    if input.bib.is_some() && !cx.cites.is_empty() && keys.is_empty() {
        if unfound(None) {
            let c = &cx.cites[0];
            found.at(g, Severity::Error, "The document cites sources but has no bibliography: no .bib file and no thebibliography".into(), &c.file, c.line, false);
        }
    } else if input.bib.is_some() {
        let mut seen = HashSet::new();
        for c in &cx.cites {
            if !keys.contains(c.key.as_str()) && seen.insert(c.key.clone()) && unfound(Some(&c.key))
            {
                found.at(
                    g,
                    Severity::Warning,
                    format!("No bibliography entry has the key {}", quoted(&c.key, 80)),
                    &c.file,
                    c.line,
                    true,
                );
            }
        }
    }
    let mut seen = HashSet::new();
    // a label the scan doesn't see is missing after a clean compile only if the log says so
    for r in &cx.refs {
        if !cx.has_label(&r.key)
            && seen.insert(r.key.clone())
            && (cx.clean.is_empty() || cx.unresolved_references.contains(&r.key))
        {
            found.at(
                g,
                Severity::Warning,
                format!("Nothing has the label {}", quoted(&r.key, 80)),
                &r.file,
                r.line,
                true,
            );
        }
    }
    for (key, places) in &cx.labels {
        if places.len() > 1 {
            found.at(g, Severity::Warning, format!("The label {} is used {} times (first at {}:{}), so references go to the last one", quoted(key, 80), places.len(), places[0].file, places[0].line), &places[1].file, places[1].line, true);
        }
    }
    let cited: Vec<String> = cx.cites.iter().map(|c| c.key.clone()).collect();
    entry_checks(found, &entries, &cited, cx.cites_all);
    for image in &cx.images {
        let hit = cx.image_file(&input.doc, &image.name);
        if hit.path.is_none() && hit.folded.is_none() && !cx.tex_found(&image.name) {
            found.at(
                g,
                Severity::Error,
                format!("Can’t find the image {}", quoted(&image.name, 80)),
                &image.file,
                image.line,
                false,
            );
        }
    }
    let referenced: HashSet<&str> = cx.refs.iter().map(|r| r.key.as_str()).collect();
    for (kind, rows) in [
        ("Figure", &cx.insights.figures),
        ("Table", &cx.insights.tables),
    ] {
        for row in rows {
            if row.label.as_deref().is_some_and(|l| l.contains('#')) {
                continue;
            }
            let name = if row.text.is_empty() {
                format!("A {} without a caption", kind.to_lowercase())
            } else {
                format!("{kind} {}", quoted(&row.text, 50))
            };
            match &row.label {
                None => found.at(
                    g,
                    Severity::Info,
                    format!("{name} has no \\label, so the text can’t refer to it"),
                    &row.file,
                    row.line,
                    true,
                ),
                Some(l) if !referenced.contains(l.as_str()) => found.at(
                    g,
                    Severity::Info,
                    format!("{name} is never referred to in the text"),
                    &row.file,
                    row.line,
                    true,
                ),
                Some(_) => {}
            }
        }
    }
    texlab(input, cx, found, &entries, &keys);
}

/// TexLab's undefined and duplicate labels and citations and its `.bib` syntax errors the scan missed.
fn texlab(
    input: &ReviewInput,
    cx: &Context,
    found: &mut Found,
    entries: &[&BibRecord],
    keys: &HashSet<&str>,
) {
    let g = Group::References;
    let mut files: Vec<String> = cx.doc_files.clone();
    for e in entries {
        if !files.contains(&e.file) {
            files.push(e.file.clone());
        }
    }
    for file in files {
        for d in input.diagnostics.get(&file).into_iter().flatten() {
            let kind = d.code.as_str();
            let relevant = if kind.is_empty() {
                let m = d.message.to_lowercase();
                m.contains("undefined") || m.contains("duplicate")
            } else {
                kind.starts_with("undefined-")
                    || kind.starts_with("duplicate-")
                    || kind == "bib-syntax"
            };
            if !relevant {
                continue;
            }
            let token: String = if d.end_line == d.line {
                cx.texts
                    .get(&file)
                    .and_then(|t| t.lines().nth(d.line.saturating_sub(1)))
                    .map(|l| {
                        l.chars()
                            .skip(d.col.saturating_sub(1))
                            .take(d.end_col.saturating_sub(d.col))
                            .collect::<String>()
                            .trim()
                            .to_owned()
                    })
                    .unwrap_or_default()
            } else {
                String::new()
            };
            if kind == "undefined-label"
                && (cx.has_label(&token)
                    || (!cx.clean.is_empty() && !cx.unresolved_references.contains(&token)))
            {
                continue;
            }
            if kind == "undefined-citation"
                && (keys.contains(token.as_str())
                    || (!cx.clean.is_empty()
                        && !cx.no_database
                        && !cx.unresolved_citations.contains(&token)))
            {
                continue;
            }
            let quoted_token = quoted(&token, 80);
            if found.has(|f| {
                f.group == g
                    && ((f.file.as_deref() == Some(file.as_str()) && f.line == Some(d.line))
                        || (!token.is_empty() && f.message.contains(&quoted_token)))
            }) {
                continue;
            }
            let syntax = kind == "bib-syntax";
            let message = if !token.is_empty() && !syntax {
                format!("{}: {quoted_token} (TexLab)", d.message)
            } else {
                format!("{} (TexLab)", d.message)
            };
            found.at(
                g,
                if syntax {
                    Severity::Error
                } else {
                    Severity::Warning
                },
                message,
                &file,
                d.line,
                true,
            );
        }
    }
}
