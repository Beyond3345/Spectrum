//! Compile and layout, privacy and blind review, accessibility, submission readiness.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;

use super::references::Context;
use super::scan::{Lines, code_of, plain_text, scan_todos};
use super::{Found, Group, ReviewInput, Severity, listed, page_list, plural, quoted};
use crate::text::{match_brace, re, without_comments};

static BOX: LazyLock<Regex> =
    LazyLock::new(|| re(r"Overfull \\([hv])box \((\d+(?:\.\d+)?)pt too (?:wide|high)\)"));
static RERUN: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)Rerun to get|rerun LaTeX|Please rerun|Label\(s\) may have changed"));
static GLYPH: LazyLock<Regex> =
    LazyLock::new(|| re(r"^Missing character: There is no (.+?) in font (.+?)!"));
static DESTINATION: LazyLock<Regex> =
    LazyLock::new(|| re(r"destination with the same identifier \((?:name\{)?([^)}]*)\}?\)"));
static FONT_FILE: LazyLock<Regex> = LazyLock::new(|| re(r"^\[([^\]]*)\].*$"));
static FONT_FEATURES: LazyLock<Regex> = LazyLock::new(|| re(r"/(?:OT|AAT|GR|ICU)?:.*$"));
static CODE_POINT: LazyLock<Regex> = LazyLock::new(|| re(r" \(U\+[0-9A-F]+\)$"));
const PAPER: &[(&str, f64, f64)] = &[
    ("A4", 595.0, 842.0),
    ("US Letter", 612.0, 792.0),
    ("A5", 420.0, 595.0),
    ("US Legal", 612.0, 1008.0),
    ("A3", 842.0, 1191.0),
];

#[allow(clippy::too_many_lines)]
pub(crate) fn compile(input: &ReviewInput, cx: &Context, found: &mut Found) {
    let g = Group::Compile;
    if !input.log.is_empty() {
        if input.failed {
            found.plain(
                g,
                Severity::Error,
                "The last compile failed and made no PDF.".into(),
                true,
            );
        }
        let mut rerun = false;
        for d in spectrum_compile::parse_tex_log(&input.log, &input.root) {
            let file = d.path.as_ref().map(|p| {
                spectrum_compile::project_file(&crate::project::slashed(p), &input.doc, &cx.paths)
            });
            let line = d.line.map(|l| l as usize);
            let at = |found: &mut Found, severity, message: String, fixable| {
                found.add(super::Finding {
                    group: g,
                    severity,
                    message,
                    file: file.clone(),
                    line,
                    page: None,
                    fixable,
                });
            };
            if d.severity == spectrum_compile::Severity::Error {
                at(found, Severity::Error, d.message.clone(), true);
                continue;
            }
            if let Some(c) = BOX.captures(&d.message) {
                let pt = (c[2].parse::<f64>().unwrap_or(0.0) * 10.0).round() / 10.0;
                let message = if &c[1] == "h" {
                    format!("A line runs {pt}pt past the margin")
                } else {
                    format!("A page’s content is {pt}pt too tall")
                };
                at(
                    found,
                    if pt >= 1.0 {
                        Severity::Warning
                    } else {
                        Severity::Info
                    },
                    message,
                    true,
                );
            } else if RERUN.is_match(&d.message) {
                rerun = true;
            }
        }
        let keys: Vec<String> = cx
            .unresolved_citations
            .iter()
            .chain(&cx.unresolved_references)
            .cloned()
            .collect();
        if !keys.is_empty() {
            let what = [
                (!cx.unresolved_citations.is_empty())
                    .then(|| plural(cx.unresolved_citations.len(), "citation", "citations")),
                (!cx.unresolved_references.is_empty())
                    .then(|| plural(cx.unresolved_references.len(), "reference", "references")),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" and ");
            // the page in the PDF that shows them, not the log's printed page number
            let shown = input
                .pdf
                .as_ref()
                .and_then(|p| p.pages.iter().position(|pg| pg.text.contains("??")))
                .map(|i| i + 1);
            found.page(
                g,
                Severity::Warning,
                format!(
                    "The PDF shows ?? for {what} the last compile couldn’t resolve: {}",
                    listed(&keys, 5, "and")
                ),
                shown,
                false,
            );
        }
        if rerun {
            found.plain(g, Severity::Warning, "The last compile still needed another pass, so references or the contents may be out of date. Compile again.".into(), false);
        }
        // one card a font, naming the characters it lacks
        let mut glyphs: Vec<(String, Vec<String>)> = Vec::new();
        let mut destinations: Vec<String> = Vec::new();
        for line in spectrum_compile::last_pass(&input.log) {
            if let Some(c) = GLYPH.captures(&line) {
                let font = FONT_FEATURES
                    .replace(&FONT_FILE.replace(&c[2], "$1"), "")
                    .rsplit(['/', '\\'])
                    .next()
                    .unwrap_or("")
                    .to_owned();
                let i = glyphs
                    .iter()
                    .position(|(f, _)| *f == font)
                    .unwrap_or_else(|| {
                        glyphs.push((font, Vec::new()));
                        glyphs.len() - 1
                    });
                if !glyphs[i].1.contains(&c[1].to_owned()) {
                    glyphs[i].1.push(c[1].to_owned());
                }
            }
            if let Some(c) = DESTINATION.captures(&line)
                && !destinations.contains(&c[1].to_owned())
            {
                destinations.push(c[1].to_owned());
            }
        }
        for (font, set) in glyphs {
            let chars: Vec<String> = set
                .iter()
                .map(|ch| {
                    if set.len() > 1 {
                        CODE_POINT.replace(ch, "").into_owned()
                    } else {
                        ch.clone()
                    }
                })
                .collect();
            let they = if chars.len() > 1 {
                "they’re"
            } else {
                "it’s"
            };
            found.plain(
                g,
                Severity::Warning,
                format!(
                    "The font {font} has no {}, so {they} missing from the PDF",
                    listed(&chars, 12, "and")
                ),
                true,
            );
        }
        for id in destinations {
            found.plain(g, Severity::Warning, format!("Two places in the PDF share the link target {id}, so a link may go to the wrong one"), true);
        }
    }
    if let Some(pdf) = &input.pdf {
        let mut sizes: Vec<((i64, i64), Vec<usize>)> = Vec::new();
        for (i, p) in pdf.pages.iter().enumerate() {
            #[allow(clippy::cast_possible_truncation)]
            let (a, b) = (p.width.round() as i64, p.height.round() as i64);
            let key = (a.min(b), a.max(b));
            match sizes.iter_mut().find(|(k, _)| *k == key) {
                Some((_, pages)) => pages.push(i + 1),
                None => sizes.push((key, vec![i + 1])),
            }
        }
        if sizes.len() > 1 {
            #[allow(clippy::cast_precision_loss)]
            let named = |(short, long): (i64, i64)| {
                let size = format!("{short} × {long}");
                PAPER
                    .iter()
                    .find(|(_, w, h)| {
                        (w - short as f64).abs() <= 2.0 && (h - long as f64).abs() <= 2.0
                    })
                    .map_or_else(
                        || format!("{size} pt"),
                        |(name, _, _)| format!("{name} ({size} pt)"),
                    )
            };
            sizes.sort_by_key(|(_, pages)| std::cmp::Reverse(pages.len()));
            let common = sizes[0].0;
            for (size, pages) in &sizes[1..] {
                let (word, verb) = if pages.len() == 1 {
                    ("Page", "is")
                } else {
                    ("Pages", "are")
                };
                found.page(
                    g,
                    Severity::Warning,
                    format!(
                        "{word} {} {verb} {}, unlike the rest, which are {}",
                        page_list(pages),
                        named(*size),
                        named(common)
                    ),
                    Some(pages[0]),
                    false,
                );
            }
        }
        for (i, _) in pdf
            .pages
            .iter()
            .enumerate()
            .filter(|(_, p)| p.outside)
            .take(20)
        {
            found.page(
                g,
                Severity::Warning,
                format!("Text runs past the edge of page {}", i + 1),
                Some(i + 1),
                true,
            );
        }
    }
}

// what a project shouldn't carry to GitHub or an arXiv upload. Not .key: that's a Keynote deck.
static SECRET_FILE: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"(?i)(?:^|/)(?:\.env(?:\.[\w-]+)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|p12|pfx|jks|keystore)|\.netrc|\.npmrc|\.pypirc|credentials(?:\.json)?|service[-_]account[^/]*\.json)$",
    )
});
static SECRETS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (
            re(r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----"),
            "a private key",
        ),
        (re(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"), "an AWS access key"),
        (
            re(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b"),
            "a GitHub token",
        ),
        (re(r"\bglpat-[A-Za-z0-9_-]{20,}\b"), "a GitLab token"),
        (
            re(r"\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b"),
            "an API key",
        ),
        (re(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b"), "a Slack token"),
        (re(r"\bAIza[0-9A-Za-z_-]{35}\b"), "a Google API key"),
    ]
});
static HL: LazyLock<Regex> = LazyLock::new(|| re(r"\\hl\s*\{"));
static HIDES_AUTHORS: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"\\documentclass\s*\[[^\]]*\banonymous\b|\\usepackage\s*\[[^\]]*\breview\b[^\]]*\]\s*\{(?:cvpr|iccv|eccv|acl)\}",
    )
});
static AUTHOR: LazyLock<Regex> = LazyLock::new(|| re(r"\\author\s*(?:\[[^\]]*\]\s*)?\{"));
static AUTHOR_DETAILS: LazyLock<Regex> = LazyLock::new(|| {
    re(r"\\(thanks|affiliation|email|orcid|institute|IEEEauthorblock[NA]|address)\b")
});
static ACKNOWLEDGEMENTS: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"(?i)\\(?:section|subsection|chapter|paragraph)\*?\s*\{\s*Acknowledge?ments?\s*\}|\\begin\s*\{(?:acks|acknowledge?ments?)\}|\\acknowledge?ments?\b",
    )
});

#[allow(clippy::too_many_lines)]
pub(crate) fn privacy(input: &ReviewInput, cx: &Context, found: &mut Found) {
    let g = Group::Privacy;
    for path in &cx.paths {
        if SECRET_FILE.is_match(path) {
            found.plain(g, Severity::Warning, format!("{path} looks like it holds a key or password, and goes wherever the project goes (GitHub, an arXiv upload)"), false);
        }
    }
    for (path, text) in input
        .files
        .iter()
        .filter_map(|(p, t)| Some((p, t.as_ref()?)))
    {
        let lines = Lines::new(text);
        for (pattern, what) in SECRETS.iter() {
            for m in pattern.find_iter(text) {
                found.at(
                    g,
                    Severity::Error,
                    format!("This line holds what looks like {what}"),
                    path,
                    lines.at(m.start()),
                    true,
                );
            }
        }
    }
    for todo in scan_todos(&cx.sources) {
        let comment = matches!(todo.kind.as_str(), "TODO" | "FIXME" | "XXX");
        let message = if comment {
            format!("{} comment: {}", todo.kind, quoted(&todo.text, 80))
        } else {
            format!(
                "A \\{} note is left in: {}",
                todo.kind,
                quoted(&todo.text, 80)
            )
        };
        found.at(
            g,
            if comment {
                Severity::Info
            } else {
                Severity::Warning
            },
            message,
            &todo.file,
            todo.line,
            false,
        );
    }
    for (path, text) in &cx.sources {
        let code = code_of(text);
        let lines = Lines::new(&code);
        for m in HL.find_iter(&code) {
            found.at(
                g,
                Severity::Warning,
                "Highlighted text (\\hl) is left in".into(),
                path,
                lines.at(m.start()),
                true,
            );
        }
    }
    if !input.anonymous {
        return;
    }
    // a class's anonymous option leaves the authors out itself, and so does a venue style's review option
    let hidden = cx
        .sources
        .iter()
        .any(|(_, t)| HIDES_AUTHORS.is_match(&without_comments(t)));
    for (path, text) in cx.sources.iter().filter(|_| !hidden) {
        let code = code_of(text);
        let lines = Lines::new(&code);
        for m in AUTHOR.find_iter(&code) {
            let open = m.end() - 1;
            let close = match_brace(&code, open).unwrap_or(open);
            let names = plain_text(&code[open + 1..close.max(open + 1)]);
            if !names.is_empty() && !names.to_lowercase().starts_with("anonymous") {
                found.at(
                    g,
                    Severity::Warning,
                    format!("\\author names the authors: {}", quoted(&names, 60)),
                    path,
                    lines.at(m.start()),
                    true,
                );
            }
        }
        let mut details = HashSet::new();
        for c in AUTHOR_DETAILS.captures_iter(&code) {
            if details.insert(c[1].to_owned()) {
                found.at(
                    g,
                    Severity::Warning,
                    format!("\\{} can identify the authors", &c[1]),
                    path,
                    lines.at(c.get(0).map_or(0, |m| m.start())),
                    true,
                );
            }
        }
        for m in ACKNOWLEDGEMENTS.find_iter(&code) {
            found.at(
                g,
                Severity::Warning,
                "The acknowledgements can identify the authors".into(),
                path,
                lines.at(m.start()),
                true,
            );
        }
    }
    if let Some(author) = input
        .pdf
        .as_ref()
        .map(|p| p.author.trim())
        .filter(|a| !a.is_empty() && !a.to_lowercase().starts_with("anonymous"))
    {
        found.plain(
            g,
            Severity::Warning,
            format!("The PDF’s Author field says {}", quoted(author, 60)),
            true,
        );
    }
}

static HREF: LazyLock<Regex> = LazyLock::new(|| re(r"\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}"));
static VAGUE_LINK: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)^(?:here|click here|this|this link|link|more|read more|see here)$"));
static ALT: LazyLock<Regex> = LazyLock::new(|| re(r"(?:^|,)\s*alt\s*="));

pub(crate) fn accessibility(input: &ReviewInput, cx: &Context, found: &mut Found) {
    let g = Group::Accessibility;
    if let Some(pdf) = input.pdf.as_ref().filter(|p| !p.unreadable()) {
        if pdf.title.trim().is_empty() {
            found.plain(g, Severity::Warning, "The PDF has no title in its properties, so readers and screen readers show its file name".into(), true);
        }
        if pdf.lang.trim().is_empty() {
            found.plain(g, Severity::Warning, "The PDF doesn’t say what language it’s in, so a screen reader may read it in the wrong one".into(), true);
        }
        if input.accessibility_tags && !pdf.tagged {
            found.plain(g, Severity::Warning, "The PDF isn’t tagged, so screen readers can’t follow its headings, lists and figures".into(), true);
        } else if input.accessibility_tags && pdf.figures_without_alt > 0 {
            let n = pdf.figures_without_alt;
            found.plain(
                g,
                Severity::Warning,
                format!(
                    "{} in the PDF’s tags {} no alternative text",
                    plural(n, "figure", "figures"),
                    if n == 1 { "has" } else { "have" }
                ),
                true,
            );
        }
        let blank: Vec<usize> = pdf
            .pages
            .iter()
            .enumerate()
            .filter(|(_, p)| p.chars == 0)
            .map(|(i, _)| i + 1)
            .collect();
        if !blank.is_empty() {
            let (word, verb) = if blank.len() == 1 {
                ("Page", "has")
            } else {
                ("Pages", "have")
            };
            found.page(
                g,
                Severity::Warning,
                format!(
                    "{word} {} {verb} no text a screen reader can read",
                    page_list(&blank)
                ),
                Some(blank[0]),
                false,
            );
        }
    }
    if input.accessibility_tags {
        for image in cx.images.iter().filter(|i| !ALT.is_match(&i.options)) {
            found.at(
                g,
                Severity::Info,
                format!("The image {} has no alt text", quoted(&image.name, 50)),
                &image.file,
                image.line,
                true,
            );
        }
    }
    for (path, text) in &cx.sources {
        let code = code_of(text);
        let lines = Lines::new(&code);
        for c in HREF.captures_iter(&code) {
            let words = plain_text(&c[1]);
            if VAGUE_LINK.is_match(&words) {
                found.at(
                    g,
                    Severity::Info,
                    format!(
                        "The link text {} doesn’t say where it goes",
                        quoted(&words, 80)
                    ),
                    path,
                    lines.at(c.get(0).map_or(0, |m| m.start())),
                    true,
                );
            }
        }
    }
}

const LEVELS: &[&str] = &["chapter", "section", "subsection", "subsubsection"];
// documents that have no abstract
const NO_ABSTRACT: &[&str] = &[
    "beamer",
    "letter",
    "standalone",
    "moderncv",
    "tikzposter",
    "a0poster",
    "exam",
];
static ABSOLUTE: LazyLock<Regex> = LazyLock::new(|| re(r"^(?:/|[A-Za-z]:|~)"));
static TITLED: LazyLock<Regex> = LazyLock::new(|| re(r"\\maketitle\b|\\begin\s*\{titlepage\}"));
static ABSTRACT_HEADING: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)\\(?:chapter|section)\*?\s*\{\s*Abstract\s*\}"));
static ODD_NAME: LazyLock<Regex> = LazyLock::new(|| re(r"[^A-Za-z0-9._/-]"));
const CONVERT: &[&str] = &["gif", "webp", "heic", "heif", "bmp", "tif", "tiff", "svg"];

#[allow(clippy::too_many_lines)]
pub(crate) fn submission(input: &ReviewInput, cx: &Context, found: &mut Found) {
    let g = Group::Submission;
    if let Some(pdf) = &input.pdf {
        if pdf.version.parse::<f64>().is_ok_and(|v| v > 1.7) {
            found.plain(
                g,
                Severity::Info,
                format!(
                    "The PDF is version {}. Some submission systems only take PDF 1.4 to 1.7.",
                    pdf.version
                ),
                false,
            );
        }
        if pdf.encrypted {
            found.plain(
                g,
                Severity::Error,
                "The PDF is encrypted, and submission systems refuse encrypted PDFs.".into(),
                false,
            );
        }
        let font = |n: &str| {
            let name = if n.len() > 7
                && n.as_bytes()[6] == b'+'
                && n[..6].chars().all(|c| c.is_ascii_uppercase())
            {
                &n[7..]
            } else {
                n
            };
            if name.is_empty() {
                "without a name".to_owned()
            } else {
                name.to_owned()
            }
        };
        match &pdf.fonts {
            None => found.plain(
                g,
                Severity::Info,
                "Couldn’t check whether the PDF’s fonts are embedded.".into(),
                false,
            ),
            Some(fonts) => {
                let mut seen = HashSet::new();
                for f in fonts.iter().filter(|f| !f.embedded) {
                    if seen.insert(font(&f.name)) {
                        found.plain(
                            g,
                            Severity::Error,
                            format!("The font {} isn’t embedded in the PDF", font(&f.name)),
                            false,
                        );
                    }
                }
                let mut seen = HashSet::new();
                for f in fonts.iter().filter(|f| f.type3) {
                    if seen.insert(font(&f.name)) {
                        found.plain(g, Severity::Warning, format!("The font {} is a Type 3 font, often a bitmap, which some venues (such as IEEE) refuse", font(&f.name)), false);
                    }
                }
            }
        }
        if !pdf.unreadable() {
            let chars: usize = pdf.pages.iter().map(|p| p.chars).sum();
            let small: usize = pdf.pages.iter().map(|p| p.small_chars).sum();
            if chars > 0 && small * 50 > chars {
                let pages: Vec<usize> = pdf
                    .pages
                    .iter()
                    .enumerate()
                    .filter(|(_, p)| p.small_chars > 0)
                    .map(|(i, _)| i + 1)
                    .collect();
                let percent = (small * 100 + chars / 2) / chars;
                let more = if pages.len() > 12 { " and more" } else { "" };
                let word = if pages.len() == 1 { "page" } else { "pages" };
                found.page(
                    g,
                    Severity::Warning,
                    format!(
                        "{percent}% of the text is smaller than 6pt ({word} {}{more})",
                        page_list(&pages[..pages.len().min(12)])
                    ),
                    pages.first().copied(),
                    false,
                );
            }
            if !pdf.outline && cx.insights.headings.len() >= 2 {
                found.plain(
                    g,
                    Severity::Warning,
                    "The PDF has no bookmarks, so readers can’t jump between its sections".into(),
                    true,
                );
            }
        }
    }
    let headings: Vec<_> = cx
        .insights
        .headings
        .iter()
        .filter(|h| h.level.is_some())
        .collect();
    for pair in headings.windows(2) {
        let (before, now) = (pair[0].level.unwrap_or(0), pair[1].level.unwrap_or(0));
        if now > before + 1 {
            found.at(
                g,
                Severity::Warning,
                format!(
                    "{} jumps from a {} to a {}",
                    quoted(&pair[1].text, 50),
                    LEVELS[before],
                    LEVELS[now]
                ),
                &pair[1].file,
                pair[1].line,
                true,
            );
        }
    }
    let mut used: HashSet<String> = HashSet::new();
    for (name, command, place) in &cx.included {
        if ABSOLUTE.is_match(name) {
            found.at(
                g,
                Severity::Error,
                format!(
                    "\\{command}{{{name}}} uses an absolute path, which only works on this computer"
                ),
                &place.file,
                place.line,
                true,
            );
        }
        let hit = cx.tex_file(&input.doc, name);
        if let Some(f) = &hit.folded {
            found.at(g, Severity::Error, format!("{} only matches {f} when letter case is ignored, so case-sensitive systems such as arXiv won’t find it", quoted(name, 80)), &place.file, place.line, true);
        }
        used.extend(hit.path);
    }
    for image in &cx.images {
        if ABSOLUTE.is_match(&image.name) {
            found.at(
                g,
                Severity::Error,
                format!(
                    "The image {} has an absolute path, which only works on this computer",
                    quoted(&image.name, 60)
                ),
                &image.file,
                image.line,
                true,
            );
        }
        let hit = cx.image_file(&input.doc, &image.name);
        if let Some(f) = &hit.folded {
            found.at(g, Severity::Error, format!("{} only matches {f} when letter case is ignored, so case-sensitive systems such as arXiv won’t find it", quoted(&image.name, 80)), &image.file, image.line, true);
        }
        let Some(path) = hit.path.or(hit.folded) else {
            continue;
        };
        let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
        if CONVERT.contains(&ext.as_str()) {
            found.at(g, Severity::Warning, format!("{path} is a .{ext} image, which pdfLaTeX can’t include. Convert it to PNG or PDF."), &image.file, image.line, false);
        }
        used.insert(path);
    }
    let mut odd: Vec<String> = cx
        .doc_files
        .iter()
        .cloned()
        .chain(used)
        .filter(|p| ODD_NAME.is_match(p))
        .collect();
    odd.sort();
    odd.dedup();
    for path in odd {
        found.plain(
            g,
            Severity::Warning,
            format!(
                "The file name {path} has spaces or other characters some systems handle badly"
            ),
            false,
        );
    }
    // a paper's: one with a title (a CV or a letter has none)
    let titled = cx.sources.iter().any(|(_, t)| TITLED.is_match(&code_of(t)));
    let classes: Vec<&String> = cx.scans.iter().flat_map(|s| &s.classes).collect();
    if titled && !classes.iter().any(|c| NO_ABSTRACT.contains(&c.as_str())) {
        let has_abstract = !cx.insights.abstract_text.is_empty()
            || cx
                .sources
                .iter()
                .any(|(_, t)| ABSTRACT_HEADING.is_match(&code_of(t)));
        if !has_abstract {
            found.plain(
                g,
                Severity::Info,
                "The document has no abstract".into(),
                false,
            );
        }
        if cx.insights.keywords.is_empty() {
            found.plain(
                g,
                Severity::Info,
                "The document has no keywords".into(),
                false,
            );
        }
    }
}
