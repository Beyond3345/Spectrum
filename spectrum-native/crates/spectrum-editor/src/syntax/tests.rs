use std::fmt::Write as _;
use std::time::Instant;

use super::*;
use crate::{Document, Edit, OutlineKind, SelectionSet, Transaction};
use HighlightRole as R;

const LATEX: &str = r"\documentclass{article}
\usepackage{amsmath}
% preamble comment
\begin{document}
\part{One}
\chapter*{Intro}
\section{Intro \emph{x}}\label{sec:intro}
Text $a+b$ and \cite{knuth84}, see \ref{sec:intro}. 50\% done.
\subsection[short]{Long \texorpdfstring{$\alpha$}{alpha}}
\begin{figure}
  \centering
  \caption{A plot~of \cite{k}}
\end{figure}
\begin{align*}
  x &= \frac{1}{2} \\
\end{align*}
\section*{Unnumbered}
\paragraph{P}
\begingroup
  \small text
\endgroup
\[ y = 2 \]
\subparagraph{SP}
\end{document}
";

const TYPST: &str = r#"#set page(width: 10cm)
= Intro <intro>
Some *bold* and _emph_ text, see @intro and $x^2 + 1$. // TODO fix
== Sub
#let f(x) = {
  if x > 1 [big] else { "small" }
}
#for i in range(3) [
  Item #i
]
#figure(
  table(columns: 2)[a][b],
  caption: [Results  so far],
)
=== Deep
"#;

const MARKDOWN: &str = "---
title: x
---
# Title
Some *em* and `code` and [link](http://x.y) $a^2$.
<!-- TODO: write more -->
## Sub ##
```python
print(1)
```
Setext
------
";

const BIBTEX: &str = r#"% refs
@string{jgr = "J. Geophys. Res."}
@article{knuth84,
  author = {Donald E. Knuth},
  title = "Literate {P}rogramming",
  journal = jgr,
  year = 1984,
}
@book(lamport94, title={\LaTeX})
"#;

fn parsed(language: Language, text: &str) -> (Syntax, Buffer) {
    let buffer = Buffer::from_text(text);
    let mut syntax = Syntax::new(language, &buffer);
    syntax.parse(&buffer);
    (syntax, buffer)
}

fn sexp(syntax: &Syntax) -> String {
    syntax
        .tree()
        .map(|t| t.root_node().to_sexp())
        .unwrap_or_default()
}

/// The role of the span holding the first byte of the `nth` occurrence of `needle`.
fn role_at(text: &str, spans: &[HighlightSpan], needle: &str, nth: usize) -> Option<HighlightRole> {
    let at = text.match_indices(needle).nth(nth).map(|(i, _)| i)?;
    spans.iter().find(|s| s.range.contains(&at)).map(|s| s.role)
}

#[test]
fn incremental_reparse_matches_a_fresh_parse() {
    let mut doc = Document::from_text(LATEX);
    let mut syntax = Syntax::new(Language::Latex, doc.buffer());
    syntax.parse(doc.buffer());
    let mut sel = SelectionSet::cursor(0);
    let edits = [
        Edit::new(0..0, "% top\n"),
        Edit::new(120..121, ""),
        Edit::new(200..200, "\\begin{itemize}\n\\item x\n"),
        Edit::new(50..60, "ß→"),
    ];
    for edit in edits {
        let applied = doc.apply(Transaction::new(vec![edit]), &sel, Instant::now());
        sel = applied.selections.clone();
        syntax.edit(doc.buffer(), &applied.changes);
        let (fresh, _) = parsed(Language::Latex, &doc.buffer().text());
        assert_eq!(sexp(&syntax), sexp(&fresh));
        assert_eq!(syntax.version(), doc.version());
    }
    // undo goes through the same path
    let undone = doc.undo();
    assert!(undone.is_some());
    syntax.edit(doc.buffer(), &undone.map(|a| a.changes).unwrap_or_default());
    let (fresh, _) = parsed(Language::Latex, &doc.buffer().text());
    assert_eq!(sexp(&syntax), sexp(&fresh));
}

#[test]
fn a_background_parse_catches_up_with_typing() {
    let mut doc = Document::from_text(LATEX);
    let mut syntax = Syntax::new(Language::Latex, doc.buffer());
    // the snapshot goes to a background thread; typing goes on meanwhile
    let snapshot = doc.buffer().rope().clone();
    let version = doc.version();
    let worker = std::thread::spawn(move || ParsedTree::parse(Language::Latex, &snapshot, version));
    let mut sel = SelectionSet::cursor(0);
    for text in ["\\section{New}\n", "x"] {
        let applied = doc.apply(Transaction::insert(&sel, text), &sel, Instant::now());
        sel = applied.selections.clone();
        syntax.edit(doc.buffer(), &applied.changes);
        assert!(syntax.tree().is_none());
    }
    let result = worker.join();
    assert!(result.is_ok());
    if let Ok(result) = result {
        assert!(syntax.accept(result, doc.buffer()));
    }
    let (fresh, _) = parsed(Language::Latex, &doc.buffer().text());
    assert_eq!(sexp(&syntax), sexp(&fresh));
    // a second result is refused: a tree is already there
    let again = ParsedTree::parse(Language::Latex, doc.buffer().rope(), doc.version());
    assert!(!syntax.accept(again, doc.buffer()));
}

#[test]
fn a_result_with_a_gap_in_the_edits_is_refused() {
    let mut doc = Document::from_text("a");
    let snapshot = ParsedTree::parse(Language::Latex, doc.buffer().rope(), doc.version());
    let sel = SelectionSet::cursor(1);
    doc.apply(Transaction::insert(&sel, "b"), &sel, Instant::now());
    // the syntax was made after the edit, so it never saw it
    let mut syntax = Syntax::new(Language::Latex, doc.buffer());
    assert!(!syntax.accept(snapshot, doc.buffer()));
    assert!(syntax.tree().is_none());
}

#[test]
fn latex_roles() {
    let (syntax, buffer) = parsed(Language::Latex, LATEX);
    let spans = syntax.highlight(&buffer, 0..buffer.len_lines());
    let role = |needle, nth| role_at(LATEX, &spans, needle, nth);
    assert_eq!(role("% preamble", 0), Some(R::Comment));
    assert_eq!(role("\\usepackage", 0), Some(R::Command));
    assert_eq!(role("amsmath", 0), Some(R::Link));
    assert_eq!(role("\\begin{document}", 0), Some(R::Keyword));
    assert_eq!(role("document}", 1), Some(R::Environment));
    assert_eq!(role("\\section{Intro", 0), Some(R::HeadingMarker));
    assert_eq!(role("Intro \\emph", 0), Some(R::Heading));
    assert_eq!(role("\\emph", 0), Some(R::Command));
    assert_eq!(role("{Intro \\emph", 0), Some(R::Bracket));
    assert_eq!(role("sec:intro", 0), Some(R::Label));
    assert_eq!(role("sec:intro", 1), Some(R::Reference));
    assert_eq!(role("knuth84", 0), Some(R::Citation));
    assert_eq!(role("$a+b$", 0), Some(R::MathDelimiter));
    assert_eq!(role("a+b", 0), Some(R::Math));
    assert_eq!(role("+b", 0), Some(R::Operator));
    assert_eq!(role("align*", 0), Some(R::Environment));
    assert_eq!(role("x &=", 0), Some(R::Math));
    assert_eq!(role("&=", 0), Some(R::Delimiter));
    assert_eq!(role("\\frac", 0), Some(R::Command));
    assert_eq!(role("\\[", 0), Some(R::MathDelimiter));
    assert_eq!(role("Text", 0), None);
    // sorted, never overlapping
    assert!(spans.windows(2).all(|w| w[0].range.end <= w[1].range.start));
}

#[test]
fn highlighting_covers_only_the_window_and_its_overscan() {
    let mut text = String::new();
    for i in 0..300 {
        let _ = writeln!(text, "\\section{{S{i}}} text $x$");
    }
    let (syntax, buffer) = parsed(Language::Latex, &text);
    let spans = syntax.highlight(&buffer, 100..120);
    let first = buffer.line_range(100 - HIGHLIGHT_OVERSCAN).start;
    let last = buffer.line_range(120 + HIGHLIGHT_OVERSCAN - 1).end;
    assert!(
        spans
            .iter()
            .all(|s| s.range.start >= first && s.range.end <= last)
    );
    assert_eq!(spans.first().map(|s| s.range.start), Some(first));
    // an edit without telling the syntax: no spans for the wrong version
    let mut doc = Document::from_text(&text);
    let syntax = {
        let mut s = Syntax::new(Language::Latex, doc.buffer());
        s.parse(doc.buffer());
        s
    };
    let sel = SelectionSet::cursor(0);
    doc.apply(Transaction::insert(&sel, "x"), &sel, Instant::now());
    assert_eq!(syntax.highlight(doc.buffer(), 0..10), []);
}

#[test]
fn typst_roles() {
    let (syntax, buffer) = parsed(Language::Typst, TYPST);
    let spans = syntax.highlight(&buffer, 0..buffer.len_lines());
    let role = |needle, nth| role_at(TYPST, &spans, needle, nth);
    assert_eq!(role("#set", 0), Some(R::Operator));
    assert_eq!(role("set page", 0), Some(R::Keyword));
    assert_eq!(role("page(", 0), Some(R::Command));
    assert_eq!(role("width:", 0), Some(R::Field));
    assert_eq!(role("10cm", 0), Some(R::Number));
    assert_eq!(role("= Intro", 0), Some(R::HeadingMarker));
    assert_eq!(role("Intro <", 0), Some(R::Heading));
    assert_eq!(role("<intro>", 0), Some(R::Label));
    assert_eq!(role("@intro", 0), Some(R::Reference));
    assert_eq!(role("*bold*", 0), Some(R::Strong));
    assert_eq!(role("_emph_", 0), Some(R::Emphasis));
    assert_eq!(role("x^2", 0), Some(R::Math));
    assert_eq!(role("$x^2", 0), Some(R::MathDelimiter));
    assert_eq!(role("// TODO", 0), Some(R::Comment));
    assert_eq!(role("let", 0), Some(R::Keyword));
    assert_eq!(role("if x", 0), Some(R::Keyword));
    assert_eq!(role("\"small\"", 0), Some(R::String));
    assert_eq!(role("for i", 0), Some(R::Keyword));
    assert_eq!(role("{\n", 0), Some(R::Bracket));
    assert_eq!(role("Some", 0), None);
}

#[test]
fn markdown_roles_include_inline_syntax() {
    let (syntax, buffer) = parsed(Language::Markdown, MARKDOWN);
    let spans = syntax.highlight(&buffer, 0..buffer.len_lines());
    let role = |needle, nth| role_at(MARKDOWN, &spans, needle, nth);
    assert_eq!(role("title: x", 0), Some(R::Code));
    assert_eq!(role("# Title", 0), Some(R::HeadingMarker));
    assert_eq!(role("Title", 0), Some(R::Heading));
    assert_eq!(role("*em*", 0), Some(R::Delimiter));
    assert_eq!(role("em*", 0), Some(R::Emphasis));
    assert_eq!(role("code`", 0), Some(R::Code));
    assert_eq!(role("link]", 0), Some(R::Reference));
    assert_eq!(role("http://x.y", 0), Some(R::Link));
    assert_eq!(role("a^2", 0), Some(R::Math));
    assert_eq!(role("<!-- TODO", 0), Some(R::Comment));
    assert_eq!(role("print(1)", 0), Some(R::Code));
    assert_eq!(role("python", 0), Some(R::Field));
    assert_eq!(role("Setext", 0), Some(R::Heading));
    assert_eq!(role("Some", 0), None);
}

#[test]
fn bibtex_roles() {
    let (syntax, buffer) = parsed(Language::Bibtex, BIBTEX);
    let spans = syntax.highlight(&buffer, 0..buffer.len_lines());
    let role = |needle, nth| role_at(BIBTEX, &spans, needle, nth);
    assert_eq!(role("% refs", 0), Some(R::Comment));
    assert_eq!(role("@article", 0), Some(R::Keyword));
    assert_eq!(role("knuth84", 0), Some(R::Citation));
    assert_eq!(role("author", 0), Some(R::Field));
    assert_eq!(role("Donald", 0), Some(R::String));
    assert_eq!(role("1984", 0), Some(R::Number));
    assert_eq!(role("jgr,", 0), Some(R::Variable));
    assert_eq!(role("jgr =", 0), Some(R::Constant));
    assert_eq!(role("\\LaTeX", 0), Some(R::Command));
}

fn outline(language: Language, text: &str) -> Vec<(OutlineKind, u8, String, usize)> {
    let (syntax, buffer) = parsed(language, text);
    syntax
        .outline(&buffer)
        .into_iter()
        .map(|o| (o.kind, o.level, o.title, o.line))
        .collect()
}

#[test]
fn latex_outline() {
    use OutlineKind::{Float, Heading};
    assert_eq!(
        outline(Language::Latex, LATEX),
        vec![
            (Heading, 0, "One".to_owned(), 4),
            (Heading, 1, "Intro".to_owned(), 5),
            (Heading, 2, "Intro x".to_owned(), 6),
            (Heading, 3, "Long alpha".to_owned(), 8),
            (Float, 4, "Figure: A plot of …".to_owned(), 9),
            (Heading, 2, "Unnumbered".to_owned(), 16),
            (Heading, 5, "P".to_owned(), 17),
            (Heading, 6, "SP".to_owned(), 22),
        ]
    );
}

#[test]
fn a_heading_in_a_comment_is_not_in_the_outline() {
    let text = "% \\section{Old}\n\\iffalse\n\\section{Off}\n\\fi\n";
    assert_eq!(outline(Language::Latex, text), []);
}

#[test]
fn typst_outline() {
    use OutlineKind::{Float, Heading};
    assert_eq!(
        outline(Language::Typst, TYPST),
        vec![
            (Heading, 1, "Intro".to_owned(), 1),
            (Heading, 2, "Sub".to_owned(), 3),
            (Float, 3, "Table: Results so far".to_owned(), 10),
            (Heading, 3, "Deep".to_owned(), 14),
        ]
    );
}

#[test]
fn markdown_outline() {
    use OutlineKind::Heading;
    let text = format!("{MARKDOWN}```\n# not a heading\n```\n#### Four {{#id}}\n");
    assert_eq!(
        outline(Language::Markdown, &text),
        vec![
            (Heading, 1, "Title".to_owned(), 3),
            (Heading, 2, "Sub".to_owned(), 6),
            (Heading, 2, "Setext".to_owned(), 10),
            (Heading, 4, "Four".to_owned(), 15),
        ]
    );
}

#[test]
fn bibtex_outline() {
    let (syntax, buffer) = parsed(Language::Bibtex, BIBTEX);
    let items = syntax.outline(&buffer);
    let got: Vec<_> = items
        .iter()
        .map(|o| (o.title.as_str(), o.detail.as_str(), o.line))
        .collect();
    assert_eq!(
        got,
        vec![("knuth84", "article", 2), ("lamport94", "book", 8)]
    );
    assert!(items.iter().all(|o| o.kind == OutlineKind::Entry));
}

fn folds(language: Language, text: &str) -> Vec<(usize, usize, String)> {
    let (syntax, buffer) = parsed(language, text);
    syntax
        .folds(&buffer)
        .into_iter()
        .map(|f| (f.start_line, f.end_line, buffer.slice(f.hidden).to_string()))
        .collect()
}

#[test]
fn latex_folds() {
    let got = folds(Language::Latex, LATEX);
    let lines: Vec<_> = got.iter().map(|(s, e, _)| (*s, *e)).collect();
    assert_eq!(
        lines,
        vec![
            (3, 23),
            (4, 22),
            (5, 22),
            (6, 15),
            (8, 15),
            (9, 12),
            (13, 15),
            (16, 22),
            (17, 22),
            (18, 20)
        ]
    );
    // an environment keeps its \end visible; a section hides to its end
    assert_eq!(
        got[5].2,
        "\n  \\centering\n  \\caption{A plot~of \\cite{k}}\n"
    );
    assert!(got[3].2.ends_with("\\end{align*}"));
    assert_eq!(got[9].2, "\n  \\small text\n");
}

#[test]
fn typst_folds() {
    let got = folds(Language::Typst, TYPST);
    let lines: Vec<_> = got.iter().map(|(s, e, _)| (*s, *e)).collect();
    assert_eq!(lines, vec![(1, 14), (3, 14), (4, 6), (7, 9), (10, 13)]);
    assert_eq!(got[2].2, "\n  if x > 1 [big] else { \"small\" }\n");
}

#[test]
fn markdown_folds() {
    let got = folds(Language::Markdown, MARKDOWN);
    let lines: Vec<_> = got.iter().map(|(s, e, _)| (*s, *e)).collect();
    assert_eq!(lines, vec![(0, 2), (3, 11), (6, 11), (7, 9)]);
    assert_eq!(got[3].2, "\nprint(1)\n");
}

#[test]
fn bibtex_folds() {
    let got = folds(Language::Bibtex, BIBTEX);
    assert_eq!(got.len(), 1);
    assert_eq!((got[0].0, got[0].1), (2, 7));
}
