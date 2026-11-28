//! The 2.8 log parser's checks (apps/frontend/src/editor/compileLog.check.ts and
//! apps/backend/test/typst.test.js), plus real logs whose expected rows 2.8's parser printed.
#![allow(clippy::unwrap_used, reason = "test helpers outside #[test] functions")]

use std::path::Path;

use spectrum_compile::{
    Diagnostic, DiagnosticKind, Severity, last_pass, parse_tex_log, parse_typst_diagnostics,
    project_file,
};

type Row = (&'static str, String, u32, String);

fn row(d: &Diagnostic) -> Row {
    let severity = if d.severity == Severity::Error {
        "error"
    } else {
        "warning"
    };
    let file = d
        .path
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    (severity, file, d.line.unwrap_or(0), d.message.clone())
}

fn brief_in(log: &str, root: &str) -> Vec<Row> {
    parse_tex_log(log, Path::new(root))
        .iter()
        .map(row)
        .collect()
}

fn brief(log: &str) -> Vec<Row> {
    brief_in(log, "")
}

fn r(severity: &'static str, file: &str, line: u32, message: &str) -> Row {
    (severity, file.to_owned(), line, message.to_owned())
}

fn wrap(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    chars
        .chunks(79)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn tectonic_passes_collapse() {
    let log = [
        "note: Running TeX ...",
        r"warning: main.tex:363: Underfull \hbox (badness 3019) in paragraph at lines 345--363",
        "error: main.tex:3: Undefined control sequence",
        "error: something bad happened inside XeTeX; its output follows:",
        "! Undefined control sequence.",
        r"l.3 Hello \foo",
        "error: the XeTeX engine had an unrecoverable error",
        "note: Rerunning TeX because \"main.aux\" changed ...",
        r"warning: main.tex:363: Underfull \hbox (badness 3019) in paragraph at lines 345--363",
        "warning: warnings were issued by the TeX engine; use --print and/or --keep-logs for details.",
    ]
    .join("\n");
    assert_eq!(
        brief(&log),
        [
            r("error", "main.tex", 3, r"Undefined control sequence \foo"),
            r(
                "warning",
                "main.tex",
                345,
                r"Underfull \hbox (badness 3019) in paragraph at lines 345--363"
            ),
        ]
    );
    let kinds: Vec<_> = parse_tex_log(&log, Path::new(""))
        .iter()
        .map(|d| d.kind)
        .collect();
    assert_eq!(kinds, [DiagnosticKind::General, DiagnosticKind::BadBox]);
}

#[test]
fn pdflatex_file_line_error() {
    let log = [
        "./chapters/intro.tex:12: Undefined control sequence.",
        r"l.12 \foo",
        "LaTeX Warning: Reference `fig:x' on page 1 undefined on input line 40.",
        "Package hyperref Warning: Token not allowed in a PDF string (Unicode):",
        r"(hyperref)                removing `\\' on input line 5.",
        r"Overfull \hbox (12.3pt too wide) in paragraph at lines 10--12",
        "! LaTeX Error: File `l3backend-pdftex.def' not found.",
        "",
        r"l.2 \begin{document}",
        "!  ==> Fatal error occurred, no output PDF file produced!",
    ]
    .join("\n");
    let parsed = parse_tex_log(&log, Path::new(""));
    assert_eq!(
        parsed.iter().map(row).collect::<Vec<_>>(),
        [
            r(
                "error",
                "chapters/intro.tex",
                12,
                r"Undefined control sequence \foo."
            ),
            r(
                "error",
                "",
                2,
                "LaTeX Error: File `l3backend-pdftex.def' not found."
            ),
            r(
                "warning",
                "",
                40,
                "Reference `fig:x' on page 1 undefined on input line 40."
            ),
            r(
                "warning",
                "",
                5,
                r"Token not allowed in a PDF string (Unicode): removing `\\' on input line 5."
            ),
            r(
                "warning",
                "",
                10,
                r"Overfull \hbox (12.3pt too wide) in paragraph at lines 10--12"
            ),
        ]
    );
    let kinds: Vec<_> = parsed.iter().map(|d| d.kind).collect();
    assert_eq!(
        kinds,
        [
            DiagnosticKind::General,
            DiagnosticKind::MissingFile,
            DiagnosticKind::UndefinedReference,
            DiagnosticKind::General,
            DiagnosticKind::BadBox,
        ]
    );
}

#[test]
fn wrapped_lines_and_build_folder() {
    let root = "/Users/me/Documents/Spectrum/ACL paper";
    let log = [
        wrap(&format!("{root}/main.tex:109: Undefined control sequence.")),
        r"l.109 \undefinedmacro".to_owned(),
        wrap(&format!(
            r"{root}/.spectrum/build/3bfa42e6-1587-490e-9ae4-083dbd6778d9/main.bbl:4: LaTeX Error: Something's wrong--perhaps a missing \item."
        )),
        "I couldn't open database file custom.bib".to_owned(),
    ]
    .join("\n");
    assert_eq!(
        brief_in(&log, root),
        [
            r(
                "error",
                "main.tex",
                109,
                r"Undefined control sequence \undefinedmacro."
            ),
            r(
                "error",
                "main.bbl",
                4,
                r"LaTeX Error: Something's wrong--perhaps a missing \item."
            ),
            r("error", "", 0, "I couldn't open database file custom.bib"),
        ]
    );
}

#[test]
fn named_command_after_other_text() {
    let log = "./main.tex:153: Undefined control sequence.\nl.153 ...ter's cut-off. The gain is \\gainval\n                                         {} here.";
    assert_eq!(
        brief(log),
        [r(
            "error",
            "main.tex",
            153,
            r"Undefined control sequence \gainval."
        )]
    );
}

#[test]
fn missing_include_but_not_first_run_files() {
    let parsed = parse_tex_log(
        "No file main.toc.\nNo file chapters/intro.tex.\n(./chapters/methods.tex)",
        Path::new(""),
    );
    assert_eq!(
        parsed.iter().map(row).collect::<Vec<_>>(),
        [r(
            "warning",
            "",
            0,
            r"No file chapters/intro.tex: \include left it out of the PDF."
        )]
    );
    assert_eq!(parsed[0].kind, DiagnosticKind::MissingFile);
}

#[test]
fn missing_package_is_one_error() {
    let log = [
        "! LaTeX Error: File `notarealpackage.sty' not found.",
        "",
        "Enter file name: ",
        "./main.tex:4: Emergency stop.",
        "<read *> ",
        r"l.4 \usepackage",
        "./main.tex:4:  ==> Fatal error occurred, no output PDF file produced!",
    ]
    .join("\n");
    assert_eq!(
        brief(&log),
        [r(
            "error",
            "",
            4,
            "LaTeX Error: File `notarealpackage.sty' not found."
        )]
    );
    assert_eq!(
        brief("./main.tex:9: Emergency stop.\nl.9 \\end"),
        [r("error", "main.tex", 9, "Emergency stop.")]
    );
}

#[test]
fn warnings_from_the_last_pass_only() {
    let pass = |warning: &str| {
        [
            "This is pdfTeX, Version 3.141592653-2.6-1.40.28 (TeX Live 2026)",
            warning,
            "./main.tex:7: Undefined control sequence.",
            "Transcript written on main.log.",
        ]
        .join("\n")
    };
    let log = [
        pass("LaTeX Warning: Citation `Knuth1984' on page 1 undefined on input line 2."),
        "This is BibTeX, Version 0.99d".to_owned(),
        "I couldn't open style file x.bst".to_owned(),
        pass(""),
        pass(r"Overfull \hbox (1pt too wide) in paragraph at lines 3--4"),
    ]
    .join("\n");
    assert_eq!(
        brief(&log),
        [
            r("error", "main.tex", 7, "Undefined control sequence."),
            r("error", "", 0, "I couldn't open style file x.bst"),
            r(
                "warning",
                "",
                3,
                r"Overfull \hbox (1pt too wide) in paragraph at lines 3--4"
            ),
        ]
    );
    // a pass runs up to its "Transcript written on" line, which stays
    let last = last_pass(&log);
    let third = pass(r"Overfull \hbox (1pt too wide) in paragraph at lines 3--4");
    let mut expected = vec![
        "Transcript written on main.log.",
        "This is BibTeX, Version 0.99d",
        "I couldn't open style file x.bst",
        "Transcript written on main.log.",
    ];
    expected.extend(third.lines());
    assert_eq!(last, expected);
}

#[test]
fn tectonic_without_extension_and_project_file() {
    let log = "note: Running TeX ...\nwarning: sections/intro:2: Overfull \\hbox (78.5pt too wide) detected at line 2\nerror: sections/broken:2: Undefined control sequence";
    assert_eq!(
        brief(log),
        [
            r("error", "sections/broken", 2, "Undefined control sequence"),
            r(
                "warning",
                "sections/intro",
                2,
                r"Overfull \hbox (78.5pt too wide) detected at line 2"
            ),
        ]
    );
    let files: Vec<String> = [
        "paper/main.tex",
        "paper/sections/intro.tex",
        "shared/macros.tex",
        "main.tex",
    ]
    .map(String::from)
    .to_vec();
    let found: Vec<String> = [
        "sections/intro",
        "main.tex",
        "shared/macros.tex",
        "../shared/macros.tex",
        "lineno.sty",
    ]
    .iter()
    .map(|f| project_file(f, "paper/main.tex", &files))
    .collect();
    assert_eq!(
        found,
        [
            "paper/sections/intro.tex",
            "paper/main.tex",
            "shared/macros.tex",
            "shared/macros.tex",
            "lineno.sty"
        ]
    );
    assert_eq!(project_file("main.tex", "main.tex", &files), "main.tex");
}

#[test]
fn file_nesting_names_the_file_being_read() {
    let root = "/Users/me/Documents/Spectrum/ACL paper";
    let log = [
        "This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex 2026.10.11)".to_owned(),
        wrap(&format!("({root}/main.tex")),
        "LaTeX2e <2026-06-01>".to_owned(),
        "(/usr/local/texlive/2026/texmf-dist/tex/latex/base/article.cls".to_owned(),
        "Document Class: article 2025/01/22 v1.4n Standard LaTeX document class".to_owned(),
        "(/usr/local/texlive/2026/texmf-dist/tex/latex/base/size10.clo".to_owned(),
        "File: size10.clo 2025/01/22 v1.4n Standard LaTeX file (size option)".to_owned(),
        ")".to_owned(),
        ")".to_owned(),
        "Package hyperref Warning: Option `pdfborder' has already been used on input line 7.".to_owned(),
        "(./sections/intro.tex".to_owned(),
        String::new(),
        "LaTeX Warning: Citation `ghost' on page 1 undefined on input line 3.".to_owned(),
        String::new(),
        r"Overfull \hbox (94.75012pt too wide) detected at line 4".to_owned(),
        r"\OT1/cmr/m/n/10 an (unbalanced bracket in the text".to_owned(),
        " []".to_owned(),
        String::new(),
        ")".to_owned(),
        String::new(),
        "LaTeX Warning: Reference `alsomissing' on page 1 undefined on input line 5.".to_owned(),
        String::new(),
        "[1".to_owned(),
        String::new(),
        "{/usr/local/texlive/2026/texmf-var/fonts/map/pdftex/updmap/pdftex.map}]".to_owned(),
        "(./main.aux)".to_owned(),
        String::new(),
        "LaTeX Warning: There were undefined references.".to_owned(),
        String::new(),
        " ) ".to_owned(),
    ]
    .join("\n");
    let parsed = parse_tex_log(&log, Path::new(root));
    assert_eq!(
        parsed.iter().map(row).collect::<Vec<_>>(),
        [
            r(
                "warning",
                "main.tex",
                7,
                "Option `pdfborder' has already been used on input line 7."
            ),
            r(
                "warning",
                "sections/intro.tex",
                3,
                "Citation `ghost' on page 1 undefined on input line 3."
            ),
            r(
                "warning",
                "sections/intro.tex",
                4,
                r"Overfull \hbox (94.75012pt too wide) detected at line 4"
            ),
            r(
                "warning",
                "main.tex",
                5,
                "Reference `alsomissing' on page 1 undefined on input line 5."
            ),
            r("warning", "main.tex", 0, "There were undefined references."),
        ]
    );
    let kinds: Vec<_> = parsed.iter().map(|d| d.kind).collect();
    assert_eq!(
        kinds,
        [
            DiagnosticKind::General,
            DiagnosticKind::UndefinedCitation,
            DiagnosticKind::BadBox,
            DiagnosticKind::UndefinedReference,
            DiagnosticKind::UndefinedReference,
        ]
    );
}

#[test]
fn app_notes_and_loose_errors() {
    assert_eq!(
        brief("error: couldn't open main.tex"),
        [r("error", "", 0, "couldn't open main.tex")]
    );
    assert_eq!(brief("[spectrum note] This compile used XeLaTeX."), []);
    let app = parse_tex_log("[spectrum] Compile it with Auto instead.", Path::new(""));
    assert_eq!(
        app.iter().map(row).collect::<Vec<_>>(),
        [r("error", "", 0, "Compile it with Auto instead.")]
    );
    assert_eq!(app[0].kind, DiagnosticKind::App);
    assert_eq!(
        brief("[spectrum warning] notes.tex didn’t compile."),
        [r("warning", "", 0, "notes.tex didn’t compile.")]
    );
    assert_eq!(
        brief("Compiled notes.tex first for its cross-references."),
        []
    );
    for line in [
        "[spectrum note] Recipe: pdflatex",
        "[spectrum note] Downloaded Biber 2.17.",
        "[spectrum note] A file kept from the last compile couldn’t be read, so this compiled again from scratch.",
    ] {
        assert_eq!(brief(line), [], "{line}");
    }
    // a 79-character note isn't glued to the next line as TeX's own wrapped lines are
    let note = "[spectrum warning] main.tex didn’t compile, so references to it may show as ??.";
    assert_eq!(note.encode_utf16().count(), 79);
    let found = brief(&format!(
        "{note}\nThis is pdfTeX, Version 3.141592653-2.6-1.40.26\n! Undefined control sequence."
    ));
    assert_eq!(
        found
            .iter()
            .find(|e| e.0 == "warning")
            .map(|e| e.3.as_str()),
        Some(&note[19..])
    );
}

#[test]
fn recipe_passes() {
    let log = [
        "",
        "[spectrum note] Recipe: pdflatex",
        "This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex)",
        "(./recipe-probe.tex",
        "No file recipe-probe.aux.",
        "LaTeX Warning: Reference `sec:one' on page 1 undefined on input line 5.",
        "",
        "LaTeX Warning: There were undefined references.",
        "SyncTeX written on /tmp/b/recipe-probe.synctex.gz.Transcript written on /tmp/b/recipe-probe.log.",
        "",
        "[spectrum note] Recipe: pdflatex",
        "This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex)",
        "(./recipe-probe.tex (/tmp/b/recipe-probe.aux) [1] (/tmp/b/recipe-probe.aux) )",
        "Output written on /tmp/b/recipe-probe.pdf (1 page, 21950 bytes).",
        "SyncTeX written on /tmp/b/recipe-probe.synctex.gz.Transcript written on /tmp/b/recipe-probe.log.",
    ]
    .join("\n");
    assert_eq!(brief(&log), []);
}

#[test]
fn bibliography_tools() {
    let parsed = parse_tex_log(
        "Warning--empty journal in knuth84\nWARN - Duplicate entry\nERROR - Cannot find 'x.bib'!",
        Path::new(""),
    );
    assert_eq!(
        parsed.iter().map(row).collect::<Vec<_>>(),
        [
            r("error", "", 0, "Cannot find 'x.bib'!"),
            r("warning", "", 0, "empty journal in knuth84"),
            r("warning", "", 0, "Duplicate entry"),
        ]
    );
    assert!(
        parsed
            .iter()
            .all(|d| d.kind == DiagnosticKind::Bibliography)
    );
}

#[test]
fn windows_drive_paths() {
    assert_eq!(
        brief_in(
            "C:/Users/me/thesis/chapters/intro.tex:12: Undefined control sequence.",
            "C:/Users/me/thesis"
        ),
        [r(
            "error",
            "chapters/intro.tex",
            12,
            "Undefined control sequence."
        )]
    );
}

#[test]
fn what_tex_had_read() {
    let log = [
        "./chapters/intro.tex:3: Undefined control sequence.",
        r"l.3 The gain is \gainval",
        "                       {} here.",
        "./chapters/intro.tex:5: Missing $ inserted.",
        "l.5 The value x_",
        "                {1} is small.",
        "! Undefined control sequence.",
        r"l.7 ...s is a long line that TeX shortened at the start \oops",
        "",
    ]
    .join("\n");
    let found: Vec<(Option<u32>, Option<String>)> = parse_tex_log(&log, Path::new(""))
        .into_iter()
        .map(|d| (d.line, d.context))
        .collect();
    assert_eq!(
        found,
        [
            (Some(3), Some(r"The gain is \gainval".to_owned())),
            (Some(5), Some("The value x_".to_owned())),
            (
                Some(7),
                Some(r"...s is a long line that TeX shortened at the start \oops".to_owned())
            ),
        ]
    );
}

#[test]
fn every_box_warning_is_listed() {
    let log = [
        "(./main.tex",
        r"Overfull \hbox (12.3pt too wide) in paragraph at lines 2--2",
        r"[]\T1/cmr/m/n/10 A long line",
        "",
        r"Underfull \vbox (badness 10000) has occurred while \output is active []",
        "",
        "LaTeX Warning: Reference `fig:x' on page 1 undefined on input line 3.",
        ")",
        r"warning: main.tex:1: Underfull \hbox (badness 10000) in paragraph at lines 1--1",
    ]
    .join("\n");
    assert_eq!(parse_tex_log(&log, Path::new("")).len(), 4);
}

/// Logs from real pdfLaTeX, XeLaTeX and Tectonic runs on tests/fixtures/logs/broken.tex; the
/// expected rows are what 2.8's parseCompileLog printed for each.
#[test]
fn real_logs_match_2_8() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/logs");
    let expected: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(dir.join("expected.json")).unwrap()).unwrap();
    for (name, rows) in expected.as_object().unwrap() {
        let log = String::from_utf8_lossy(&std::fs::read(dir.join(name)).unwrap()).into_owned();
        let got: Vec<serde_json::Value> = parse_tex_log(&log, Path::new(""))
            .iter()
            .map(|d| {
                let (severity, file, line, message) = row(d);
                serde_json::json!([
                    severity,
                    file,
                    line,
                    message,
                    d.context.clone().unwrap_or_default()
                ])
            })
            .collect();
        assert_eq!(&serde_json::Value::Array(got), rows, "{name}");
    }
}

#[test]
fn typst_short_format() {
    let root = Path::new("/p/project");
    let log = "main.typ:5:1: error: unknown variable: foo\nchapters/one.typ:3:1: error: unknown variable: bar\nmain.typ:3:16: warning: unknown font family: no such font";
    let found: Vec<_> = parse_typst_diagnostics(log, root, root)
        .into_iter()
        .map(|d| {
            (
                d.severity,
                d.path.unwrap().to_string_lossy().into_owned(),
                d.line,
                d.column,
                d.message,
                d.kind,
            )
        })
        .collect();
    assert_eq!(
        found,
        [
            (
                Severity::Error,
                "main.typ".to_owned(),
                Some(5),
                Some(1),
                "unknown variable: foo".to_owned(),
                DiagnosticKind::Typst
            ),
            (
                Severity::Error,
                "chapters/one.typ".to_owned(),
                Some(3),
                Some(1),
                "unknown variable: bar".to_owned(),
                DiagnosticKind::Typst
            ),
            (
                Severity::Warning,
                "main.typ".to_owned(),
                Some(3),
                Some(16),
                "unknown font family: no such font".to_owned(),
                DiagnosticKind::Typst
            ),
        ]
    );
}

#[test]
fn typst_hints_and_absolute_paths() {
    let root = Path::new("/p/project");
    let log = "/p/project/chapters/two.typ:2:3: error: unexpected argument: capton\n  hint: did you mean caption?\nmain.typ:1:1: error: unclosed delimiter\n/elsewhere/lib.typ:1:1: error: outside";
    let d = parse_typst_diagnostics(log, root, &root.join("chapters"));
    assert_eq!(d[0].path.as_deref(), Some(Path::new("chapters/two.typ")));
    assert_eq!(
        d[0].message,
        "unexpected argument: capton\nHint: did you mean caption?"
    );
    // Typst ran in the main file's folder
    assert_eq!(d[1].path.as_deref(), Some(Path::new("chapters/main.typ")));
    assert_eq!(d[1].message, "unclosed delimiter");
    assert_eq!(d[2].path.as_deref(), Some(Path::new("/elsewhere/lib.typ")));
}

/// Typst 0.15.1's own output for the same errors, in both formats.
#[test]
fn typst_real_output_both_formats() {
    let root = Path::new("/p");
    let short = "chapters/one.typ:1:6: error: unknown variable: bar\nmain.typ:1:16: warning: unknown font family: no such font\nh6.typ:1:1: error: unknown variable: xyz";
    let human = "error: unknown variable: bar\n  ┌─ chapters/one.typ:1:6\n  │\n1 │ Some #bar text\n  │       ^^^\n\n  while including `chapters/one.typ` at main.typ:3:1\n    include \"chapters/one.typ\"\n\nwarning: unknown font family: no such font\n  ┌─ main.typ:1:16\n  │\n1 │ #set text(font: \"No Such Font\")\n  │                 ^^^^^^^^^^^^^^\n\nerror: unknown variable: xyz\n  ┌─ h6.typ:1:1\n  │\n1 │ $xyz$\n  │  ^^^\n  │\n  = hint: if you meant to display multiple letters as is, try adding spaces between each letter: `x y z`\n  = hint: or if you meant to display this as text, try placing it in quotes: `\"xyz\"`\nerror: input file not found (searched at nonexist.typ)";
    let a = parse_typst_diagnostics(short, root, root);
    let b = parse_typst_diagnostics(human, root, root);
    assert_eq!(b.len(), 3);
    for (x, y) in a.iter().zip(&b) {
        assert_eq!(
            (&x.path, x.line, x.column, x.severity),
            (&y.path, y.line, y.column, y.severity)
        );
        assert!(y.message.starts_with(&x.message));
    }
    assert_eq!(
        b[2].message,
        "unknown variable: xyz\nHint: if you meant to display multiple letters as is, try adding spaces between each letter: `x y z`\nHint: or if you meant to display this as text, try placing it in quotes: `\"xyz\"`"
    );
}

#[cfg(windows)]
#[test]
fn typst_windows_verbatim_paths() {
    let log = "\\\\?\\C:\\Users\\Ann\\Spectrum\\Paper\\main.typ:3:2: error: unknown variable: foo\n\\\\?\\UNC\\server\\share\\Paper\\chapters\\one.typ:1:1: warning: unknown font family: x\n\\\\?\\C:\\elsewhere\\lib.typ:1:1: error: outside";
    let root = Path::new(r"C:\Users\Ann\Spectrum\Paper");
    let found: Vec<_> = parse_typst_diagnostics(log, root, root)
        .into_iter()
        .map(|d| (d.path.unwrap().to_string_lossy().into_owned(), d.line))
        .collect();
    assert_eq!(
        found,
        [
            ("main.typ".to_owned(), Some(3)),
            ("//server/share/Paper/chapters/one.typ".to_owned(), Some(1)),
            ("C:/elsewhere/lib.typ".to_owned(), Some(1)),
        ]
    );
    let unc = parse_typst_diagnostics(
        log.lines().nth(1).unwrap(),
        Path::new(r"\\server\share\Paper"),
        Path::new(r"\\server\share\Paper"),
    );
    assert_eq!(unc[0].path.as_deref(), Some(Path::new("chapters/one.typ")));
}
