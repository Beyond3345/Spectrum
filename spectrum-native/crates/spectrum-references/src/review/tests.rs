//! 2.8's `preflight.check.ts`, ported: real compile logs and a small paper with something wrong in each group.

use super::*;
use crate::dedupe::DuplicateOf;

fn log(name: &str) -> String {
    std::fs::read_to_string(format!(
        "{}/tests/fixtures/review/{name}.log",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

fn input(files: &[(&str, Option<&str>)]) -> ReviewInput {
    ReviewInput {
        doc: "main.tex".into(),
        root: PathBuf::from("/Users/me/Paper"),
        files: files
            .iter()
            .map(|(p, t)| ((*p).to_owned(), t.map(str::to_owned)))
            .collect(),
        bib: Some(Vec::new()),
        ..ReviewInput::default()
    }
}

fn place(f: &Finding) -> String {
    match (&f.file, f.line, f.page) {
        (Some(file), line, _) => {
            format!("{file}:{}", line.map(|l| l.to_string()).unwrap_or_default())
        }
        (None, _, Some(p)) => format!("p{p}"),
        _ => String::new(),
    }
}

fn brief(found: &[Finding], group: Group) -> Vec<(Severity, String, String)> {
    found
        .iter()
        .filter(|f| f.group == group)
        .map(|f| (f.severity, f.message.clone(), place(f)))
        .collect()
}

#[track_caller]
fn has(found: &[Finding], group: Group, severity: Severity, starts: &str, at: &str) {
    let rows = brief(found, group);
    assert!(
        rows.iter()
            .any(|(s, m, p)| *s == severity && m.starts_with(starts) && (at.is_empty() || p == at)),
        "{group:?}: no {severity:?} {starts:?} {at}\n{rows:#?}"
    );
}

#[track_caller]
fn none(found: &[Finding], group: Group, part: &str) {
    let rows = brief(found, group);
    assert!(
        !rows.iter().any(|(_, m, _)| m.contains(part)),
        "{group:?}: didn’t expect {part:?}\n{rows:#?}"
    );
}

const LOGGED: &str = "\\documentclass{article}\n\\usepackage[T1]{fontenc}\n\\usepackage{graphicx}\n\\usepackage{hyperref}\n\\begin{document}\n\\section{Introduction}\\label{sec:intro}\nSee \\ref{sec:missing} and \\cite{nobody}.\n\\noindent\\hbox to 1.2\\textwidth{This line is much too wide for the text block it lives in, really.}\n\nSome text with a glyph the font lacks: \\symbol{\"2192}.\n\\section{Introduction}\\label{sec:intro}\n\\setcounter{page}{1}\n\\newpage\nPage again.\n\\end{document}\n";

fn compiled(log: &str, failed: bool, pdf: Option<PdfFacts>) -> Vec<Finding> {
    run_review(&ReviewInput {
        log: log.into(),
        failed,
        pdf,
        ..input(&[("main.tex", Some(LOGGED))])
    })
}

fn page(width: f64, height: f64) -> PdfPage {
    PdfPage {
        width,
        height,
        chars: 2000,
        small_chars: 0,
        outside: false,
        text: "Text".into(),
    }
}

#[test]
fn page_lists() {
    assert_eq!(page_list(&[1, 2, 3, 7, 9, 10]), "1–3, 7 and 9–10");
}

#[test]
fn the_compile_log_gives_errors_boxes_and_unresolved_keys() {
    let found = compiled(&log("pdflatex_two_passes"), false, None);
    let rows = brief(&found, Group::Compile);
    assert!(
        rows.contains(&(
            Severity::Error,
            "Bad character code (8594).".into(),
            "main.tex:10".into()
        )),
        "{rows:#?}"
    );
    has(
        &found,
        Group::Compile,
        Severity::Warning,
        "A line runs 134.9pt past the margin",
        "main.tex:7",
    );
    has(
        &found,
        Group::Compile,
        Severity::Warning,
        "The PDF shows ?? for 1 citation and 1 reference the last compile couldn’t resolve: nobody and sec:missing",
        "",
    );
    none(&found, Group::Compile, "another pass");
    let shows = PdfFacts {
        pages: vec![
            PdfPage {
                text: "Title".into(),
                ..page(595.0, 842.0)
            },
            PdfPage {
                text: "See ?? and [?]".into(),
                ..page(595.0, 842.0)
            },
        ],
        ..PdfFacts::default()
    };
    has(
        &compiled(&log("pdflatex_two_passes"), false, Some(shows)),
        Group::Compile,
        Severity::Warning,
        "The PDF shows ?? for",
        "p2",
    );
    has(
        &compiled(&log("pdflatex_two_passes"), true, None),
        Group::Compile,
        Severity::Error,
        "The last compile failed and made no PDF.",
        "",
    );
    has(
        &compiled(&log("pdflatex_destinations"), false, None),
        Group::Compile,
        Severity::Warning,
        "Two places in the PDF share the link target page.1",
        "",
    );
    has(
        &compiled(&log("xelatex_glyph"), false, None),
        Group::Compile,
        Severity::Warning,
        "The font lmroman10-regular has no 漢 (U+6F22), so it’s missing from the PDF",
        "",
    );
    none(
        &compiled(&log("xelatex_glyph"), false, None),
        Group::Compile,
        "link target",
    );
}

#[test]
fn missing_glyphs_are_one_card_a_font() {
    let many = [
        "This is XeTeX, Version 3.141592653-2.6-0.999998 (TeX Live 2026) (preloaded format=xelatex)",
        "Missing character: There is no 本 (U+672C) in font [lmroman10-regular]:mapping=tex-text;!",
        "Missing character: There is no 報 (U+5831) in font [lmroman10-regular]:mapping=tex-text;!",
        "Missing character: There is no 本 (U+672C) in font [lmroman10-regular]:mapping=tex-text;!",
        "Missing character: There is no 한 (U+D55C) in font NotoSerifSC-Regular.otf/OT:script=hani;language=dflt;!",
        "Transcript written on glyph.log.",
    ]
    .join("\n");
    let cards: Vec<String> = compiled(&many, false, None)
        .into_iter()
        .filter(|f| f.message.contains(" has no "))
        .map(|f| f.message)
        .collect();
    assert_eq!(
        cards,
        [
            "The font lmroman10-regular has no 本 and 報, so they’re missing from the PDF",
            "The font NotoSerifSC-Regular.otf has no 한 (U+D55C), so it’s missing from the PDF",
        ]
    );
}

const MAIN: &str = r"\documentclass{article}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage{soul}
\graphicspath{{figures/}}
\title{Small Things}
\author{Ada Lovelace\thanks{Funded by nobody.}}
\begin{document}
\maketitle
\begin{abstract}
We look at small things.
\end{abstract}
\section{Introduction}\label{sec:intro}
As \citet{knuth84} and \cite{missing20} show, see Section~\ref{sec:method} and \ref{sec:nowhere}.
\todo{Check this claim}
% TODO: cite the survey
\hl{Highlighted draft text.}
\input{sections/Method}
\section{Results}\label{sec:intro}
Figure~\ref{fig:plot} shows it.
\begin{figure}
  \includegraphics[width=\linewidth]{Plot}
  \caption{A plot.}\label{fig:plot}
\end{figure}
\begin{figure}
  \includegraphics[alt={A missing chart}]{figures/chart}
  \caption{Never mentioned.}
\end{figure}
\includegraphics{/Users/me/Desktop/logo.png}
\includegraphics{scan.tif}
More at \href{https://example.com}{here}.
\section*{Acknowledgements}
Thanks to Charles.
\bibliography{refs}
\end{document}
";
const METHOD: &str =
    "\\section{Method}\\label{sec:method}\n\\subsubsection{Details}\nWe follow \\cite{knuth84}.\n";

fn bib() -> Vec<BibRecord> {
    let rec = |line: usize,
               key: &str,
               kind: &str,
               fields: &[&str],
               doi: &str,
               dup: Option<DuplicateOf>| BibRecord {
        file: "refs.bib".into(),
        line,
        key: key.into(),
        kind: kind.into(),
        fields: fields.iter().map(|f| (*f).to_owned()).collect(),
        doi: doi.into(),
        title: String::new(),
        duplicate_of: dup,
    };
    vec![
        rec(
            1,
            "knuth84",
            "article",
            &["author", "title", "journal", "year", "doi"],
            "10.1000/xyz",
            None,
        ),
        rec(
            8,
            "knuth-again",
            "article",
            &["author", "title", "journal", "year", "doi"],
            "10.1000/xyz",
            Some(DuplicateOf {
                key: "knuth84".into(),
                file: "refs.bib".into(),
                by: "DOI".into(),
            }),
        ),
        rec(
            15,
            "lamport94",
            "book",
            &["author", "title", "year"],
            "",
            None,
        ),
        rec(
            20,
            "knuth84",
            "misc",
            &["title", "doi"],
            "doi:10.5555",
            None,
        ),
    ]
}

fn facts() -> PdfFacts {
    PdfFacts {
        version: "2.0".into(),
        encrypted: true,
        author: "Ada Lovelace".into(),
        fonts: Some(vec![
            PdfFont {
                name: "ABCDEF+CMR10".into(),
                embedded: true,
                type3: false,
            },
            PdfFont {
                name: "Helvetica".into(),
                embedded: false,
                type3: false,
            },
            PdfFont {
                name: "GHIJKL+DejaVuSans".into(),
                embedded: true,
                type3: true,
            },
        ]),
        pages: vec![
            page(595.28, 841.89),
            PdfPage {
                outside: true,
                ..page(612.0, 792.0)
            },
            PdfPage {
                small_chars: 400,
                ..page(595.28, 841.89)
            },
            PdfPage {
                chars: 0,
                text: String::new(),
                ..page(595.28, 841.89)
            },
            page(841.89, 595.28),
        ],
        ..PdfFacts::default()
    }
}

fn paper(anonymous: bool, tags: bool) -> ReviewInput {
    let token = format!("gh{}_{}", 'p', "A1b2C3d4".repeat(5));
    let keys = format!("The deploy key:\ntoken = {token}\n");
    let mut i = input(&[
        ("main.tex", Some(MAIN)),
        ("sections/method.tex", Some(METHOD)),
        ("notes/keys.txt", Some(&keys)),
        ("refs.bib", Some("")),
        ("figures/plot.png", None),
        ("scan.tif", None),
        (".env", None),
    ]);
    i.bib = Some(bib());
    i.pdf = Some(facts());
    i.anonymous = anonymous;
    i.accessibility_tags = tags;
    i
}

#[test]
fn references_and_assets() {
    let found = run_review(&paper(true, false));
    let g = Group::References;
    has(
        &found,
        g,
        Severity::Warning,
        "No bibliography entry has the key “missing20”",
        "main.tex:14",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "Nothing has the label “sec:nowhere”",
        "main.tex:14",
    );
    none(&found, g, "sec:method");
    has(
        &found,
        g,
        Severity::Warning,
        "The label “sec:intro” is used 2 times (first at main.tex:13)",
        "main.tex:19",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "The key “knuth84” is in the bibliography twice (first at refs.bib:1)",
        "refs.bib:20",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "“knuth-again” looks like the same work as “knuth84” (same DOI)",
        "refs.bib:8",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "The book entry “lamport94” has no publisher",
        "refs.bib:15",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "The DOI of “knuth84” doesn’t look like one",
        "refs.bib:20",
    );
    has(
        &found,
        g,
        Severity::Info,
        "2 entries in refs.bib are never cited: knuth-again and lamport94",
        "refs.bib:8",
    );
    has(
        &found,
        g,
        Severity::Error,
        "Can’t find the image “figures/chart”",
        "main.tex:26",
    );
    has(
        &found,
        g,
        Severity::Info,
        "Figure “Never mentioned.” has no \\label",
        "main.tex:25",
    );
    none(&found, g, "A plot");
}

#[test]
fn privacy_and_blind_review() {
    let found = run_review(&paper(true, false));
    let g = Group::Privacy;
    has(
        &found,
        g,
        Severity::Warning,
        ".env looks like it holds a key or password",
        "",
    );
    has(
        &found,
        g,
        Severity::Error,
        "This line holds what looks like a GitHub token",
        "notes/keys.txt:2",
    );
    assert!(
        !found.iter().any(|f| f.message.contains("A1b2C3d4")),
        "a finding repeats the token"
    );
    has(
        &found,
        g,
        Severity::Warning,
        "A \\todo note is left in: “Check this claim”",
        "main.tex:15",
    );
    has(
        &found,
        g,
        Severity::Info,
        "TODO comment: “cite the survey”",
        "main.tex:16",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "Highlighted text",
        "main.tex:17",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "\\author names the authors: “Ada Lovelace”",
        "main.tex:7",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "\\thanks can identify the authors",
        "main.tex:7",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "The acknowledgements can identify the authors",
        "main.tex:32",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "The PDF’s Author field says “Ada Lovelace”",
        "",
    );
    let named = run_review(&paper(false, false));
    none(&named, g, "authors");
    none(&named, g, "Author field");
    let mut hidden = input(&[(
        "main.tex",
        Some(&MAIN.replace("{article}", "[anonymous]{acmart}")),
    )]);
    hidden.anonymous = true;
    let hidden = run_review(&hidden);
    none(&hidden, g, "\\author");
    none(&hidden, g, "\\thanks");
}

#[test]
fn accessibility() {
    let found = run_review(&paper(true, false));
    let g = Group::Accessibility;
    has(&found, g, Severity::Warning, "The PDF has no title", "");
    has(
        &found,
        g,
        Severity::Warning,
        "The PDF doesn’t say what language",
        "",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "Page 4 has no text a screen reader can read",
        "p4",
    );
    has(
        &found,
        g,
        Severity::Info,
        "The link text “here” doesn’t say where it goes",
        "main.tex:31",
    );
    none(&found, g, "isn’t tagged");
    none(&found, g, "alt text");
    let tagged = run_review(&paper(true, true));
    has(&tagged, g, Severity::Warning, "The PDF isn’t tagged", "");
    has(
        &tagged,
        g,
        Severity::Info,
        "The image “Plot” has no alt text",
        "main.tex:22",
    );
    none(&tagged, g, "figures/chart");
}

#[test]
fn submission_readiness() {
    let found = run_review(&paper(true, false));
    let g = Group::Submission;
    has(&found, g, Severity::Info, "The PDF is version 2.0", "");
    has(&found, g, Severity::Error, "The PDF is encrypted", "");
    has(
        &found,
        g,
        Severity::Error,
        "The font Helvetica isn’t embedded in the PDF",
        "",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "The font DejaVuSans is a Type 3 font",
        "",
    );
    none(&found, g, "CMR10");
    has(
        &found,
        g,
        Severity::Error,
        "“sections/Method” only matches sections/method.tex when letter case is ignored",
        "main.tex:18",
    );
    has(
        &found,
        g,
        Severity::Error,
        "“Plot” only matches figures/plot.png when letter case is ignored",
        "main.tex:22",
    );
    has(
        &found,
        g,
        Severity::Error,
        "The image “/Users/me/Desktop/logo.png” has an absolute path",
        "main.tex:29",
    );
    has(
        &found,
        g,
        Severity::Warning,
        "scan.tif is a .tif image, which pdfLaTeX can’t include",
        "main.tex:30",
    );
    has(
        &found,
        g,
        Severity::Info,
        "The document has no keywords",
        "",
    );
    none(&found, g, "no abstract");
    has(
        &found,
        g,
        Severity::Warning,
        "5% of the text is smaller than 6pt (page 3)",
        "p3",
    );
    has(&found, g, Severity::Warning, "The PDF has no bookmarks", "");
    has(
        &found,
        g,
        Severity::Warning,
        "“Details” jumps from a section to a subsubsection",
        "sections/method.tex:2",
    );
    let compile = Group::Compile;
    has(
        &found,
        compile,
        Severity::Warning,
        "Page 2 is US Letter (612 × 792 pt), unlike the rest, which are A4 (595 × 842 pt)",
        "p2",
    );
    has(
        &found,
        compile,
        Severity::Warning,
        "Text runs past the edge of page 2",
        "p2",
    );
    let mut order: Vec<Group> = Vec::new();
    for f in &found {
        if !order.contains(&f.group) {
            order.push(f.group);
        }
    }
    assert_eq!(order, Group::ALL);
}

#[test]
fn texlab_adds_what_the_scan_missed_and_gaps_say_compile_first() {
    let later = format!("{METHOD}Again \\ref{{sec:nowhere}} and \\subref{{sec:later}}.\n");
    let mut i = paper(false, false);
    i.files[1].1 = Some(later.clone());
    let line = 4;
    let col = later
        .lines()
        .nth(line - 1)
        .unwrap()
        .find("sec:later")
        .unwrap()
        + 1;
    i.diagnostics.insert(
        "sections/method.tex".into(),
        vec![
            TexlabDiagnostic {
                line,
                col,
                end_line: line,
                end_col: col + "sec:later".len(),
                message: "Undefined reference".into(),
                code: "undefined-label".into(),
            },
            TexlabDiagnostic {
                line,
                col: 8,
                end_line: line,
                end_col: 19,
                message: "Undefined reference".into(),
                code: "undefined-label".into(),
            },
        ],
    );
    let found = run_review(&i);
    has(
        &found,
        Group::References,
        Severity::Warning,
        "Undefined reference: “sec:later” (TexLab)",
        "sections/method.tex:4",
    );
    let gaps = review_gaps(
        &ReviewInput {
            anonymous: true,
            ..input(&[])
        },
        None,
    );
    assert_eq!(gaps[0], (Group::Compile, "Compile first.".into()));
    assert!(
        gaps.iter()
            .any(|(g, m)| *g == Group::Privacy && m.starts_with("Compile first:"))
    );
}

#[test]
fn markdown_and_typst_run_their_subsets() {
    let md = "---\ntitle: T\nbibliography: refs.bib\n---\n# Intro\nAs @knuth84 and [@missing; see @fig:one] show.\n\n![A chart](figures/Chart.png)\n[notes](notes.md)\n```\n@not-a-cite\n```\n";
    let mut i = input(&[
        ("paper.md", Some(md)),
        ("refs.bib", Some("")),
        ("figures/chart.png", None),
    ]);
    i.doc = "paper.md".into();
    i.bib = Some(bib());
    let found = run_review(&i);
    has(
        &found,
        Group::References,
        Severity::Warning,
        "No bibliography entry has the key “missing”",
        "paper.md:6",
    );
    none(&found, Group::References, "fig:one");
    none(&found, Group::References, "not-a-cite");
    has(
        &found,
        Group::References,
        Severity::Error,
        "The image “figures/Chart.png” is figures/chart.png in the project, which differs in letter case",
        "paper.md:8",
    );
    has(
        &found,
        Group::References,
        Severity::Warning,
        "The link to “notes.md” goes to no file in the project",
        "paper.md:9",
    );
    none(&found, Group::Accessibility, "");
    let typ = "= Intro <intro>\nSee @intro and @knuth84 and @nowhere.\n#image(\"figs/a.png\")\n#bibliography(\"refs.bib\")\n";
    let mut t = input(&[("main.typ", Some(typ)), ("refs.bib", Some(""))]);
    t.doc = "main.typ".into();
    t.bib = Some(bib());
    let found = run_review(&t);
    has(
        &found,
        Group::References,
        Severity::Warning,
        "Nothing has the label “nowhere”, and no bibliography entry has it as its key",
        "main.typ:2",
    );
    none(&found, Group::References, "“intro”");
    has(
        &found,
        Group::References,
        Severity::Error,
        "Can’t find the image “figs/a.png”",
        "main.typ:3",
    );
}
