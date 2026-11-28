use std::time::Instant;

use super::*;
use crate::{Document, Edit, SelectionSet, Transaction};

fn depths(language: Language, text: &str) -> Vec<u8> {
    let buffer = Buffer::from_text(text);
    let map = ScopeMap::new(language, &buffer);
    (0..buffer.len_lines()).map(|l| map.depth(l)).collect()
}

#[test]
fn latex_environments_carry_their_bar_from_begin_to_end() {
    let text = "\\documentclass{article}\n\
                \\begin{document}\n\
                Text 50\\% % \\begin{fake}\n\
                \\begin{enumerate}\n\
                \\item $x$\n\
                \\end{enumerate} \\begin{align*}\n\
                a\n\
                \\end{align*}\n\
                \\begin{x}one line\\end{x}\n\
                \\end{document}\n";
    assert_eq!(
        depths(Language::Latex, text),
        vec![0, 1, 1, 2, 2, 2, 2, 2, 1, 1, 0]
    );
}

#[test]
fn deep_nesting_shows_at_most_eight_bars() {
    let text = "\\begin{a}\n".repeat(10) + "x\n" + &"\\end{a}\n".repeat(10);
    let d = depths(Language::Latex, &text);
    assert_eq!(d[10], 8);
    assert_eq!(d[0], 1);
    assert_eq!(*d.last().unwrap_or(&9), 0);
}

#[test]
fn a_stray_end_does_not_go_below_zero() {
    assert_eq!(
        depths(Language::Latex, "\\end{x}\n\\begin{y}\n"),
        vec![0, 1, 1]
    );
}

#[test]
fn typst_blocks() {
    let text = "#let f(x) = {\n\
                \x20 if x > 1 [big] else {\n\
                \x20   \"}\" // }\n\
                \x20 }\n\
                }\n\
                #for i in range(3) [\n\
                \x20 $[0, 1)$ see https://x.org/[a]\n\
                ]\n\
                /* [ */ ```\n\
                {\n\
                ```\n\
                done\n";
    assert_eq!(
        depths(Language::Typst, text),
        vec![1, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0]
    );
}

#[test]
fn markdown_fences() {
    let text = "# A\n```rust\nfn f() {}\n~~~\n```\ntext\n~~~~\n```\n~~~~~\nafter\n";
    assert_eq!(
        depths(Language::Markdown, text),
        vec![0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0]
    );
}

#[test]
fn innermost_scope_and_bar_clicks() {
    let text = "\\begin{document}\n\
                \\begin{a}\n\
                x\n\
                \\end{a}\\begin{b}\n\
                y\n\
                \\end{b}\n\
                \\end{document}\n";
    let buffer = Buffer::from_text(text);
    let map = ScopeMap::new(Language::Latex, &buffer);
    let scope = |open_line, close_line, level| {
        Some(Scope {
            level,
            open_line,
            close_line,
        })
    };
    assert_eq!(map.innermost(2), scope(1, 3, 2));
    // the line that closes one and opens the next belongs to the one it opens
    assert_eq!(map.innermost(3), scope(3, 5, 2));
    assert_eq!(map.innermost(4), scope(3, 5, 2));
    assert_eq!(map.scope(4, 1), scope(0, 6, 1));
    assert_eq!(map.innermost(0), scope(0, 6, 1));
    assert_eq!(map.innermost(7), None);
    assert_eq!(map.scope(2, 3), None);
}

#[test]
fn an_unclosed_scope_runs_to_the_last_line() {
    let buffer = Buffer::from_text("\\begin{a}\nx\ny");
    let map = ScopeMap::new(Language::Latex, &buffer);
    assert_eq!(
        map.innermost(1),
        Some(Scope {
            level: 1,
            open_line: 0,
            close_line: 2
        })
    );
}

/// Every edit leaves the table as a rebuild from scratch would.
#[test]
fn updates_match_a_rebuild() {
    let cases: [(Language, &str, Vec<Edit>); 3] = [
        (
            Language::Latex,
            "\\begin{document}\n\\begin{a}\nx\n\\end{a}\ny\n\\end{document}\n",
            vec![
                Edit::new(17..17, "\\begin{new}\n"),
                Edit::new(0..1, ""),
                Edit::new(0..0, "\\"),
                Edit::new(30..45, "% \n\n"),
                Edit::new(5..5, "\\end{q}"),
            ],
        ),
        (
            Language::Typst,
            "#let f = {\n  [a]\n}\ntext /* x\n*/ y\n",
            vec![
                Edit::new(10..10, "\n{"),
                Edit::new(26..26, "*/"),
                Edit::new(0..3, ""),
            ],
        ),
        (
            Language::Markdown,
            "a\n```\ncode\n```\nb\n```\nc\n```\n",
            vec![
                Edit::new(2..5, ""),
                Edit::new(2..2, "```"),
                Edit::new(0..0, "~~~\n"),
            ],
        ),
    ];
    for (language, text, edits) in cases {
        let mut doc = Document::from_text(text);
        let mut map = ScopeMap::new(language, doc.buffer());
        let mut sel = SelectionSet::cursor(0);
        for edit in edits {
            let applied = doc.apply(Transaction::new(vec![edit]), &sel, Instant::now());
            sel = applied.selections.clone();
            map.update(doc.buffer(), &applied.changes);
            let fresh = ScopeMap::new(language, doc.buffer());
            assert_eq!(
                map.lines,
                fresh.lines,
                "{language:?} after edit: {:?}",
                doc.buffer().text()
            );
            assert_eq!(map.version(), doc.version());
        }
        // several cursors in one transaction, then undo
        let edits = vec![
            Edit::new(0..0, "{\n"),
            Edit::new(4..4, "x\n}"),
            Edit::new(8..8, "\n"),
        ];
        let applied = doc.apply(Transaction::new(edits), &sel, Instant::now());
        map.update(doc.buffer(), &applied.changes);
        assert_eq!(map.lines, ScopeMap::new(language, doc.buffer()).lines);
        if let Some(undone) = doc.undo() {
            map.update(doc.buffer(), &undone.changes);
            assert_eq!(map.lines, ScopeMap::new(language, doc.buffer()).lines);
        }
    }
}

/// Lines below an edit are shifted rather than rescanned, except where a stray `\end` stopped
/// at depth 0 before or would now.
#[test]
fn shifted_lines_match_a_rebuild() {
    let text = "a\n\\begin{x}\nb\n\\end{x}\n\\end{stray}\n\\begin{y}\nc\n\\end{y}\n";
    let mut doc = Document::from_text(text);
    let mut map = ScopeMap::new(Language::Latex, doc.buffer());
    let mut sel = SelectionSet::cursor(0);
    for edit in [
        Edit::new(0..0, "\\begin{top}"),
        Edit::new(0..0, "\\begin{two}"),
        Edit::new(0..11, ""),
        Edit::new(0..11, "\\end{q}"),
    ] {
        let applied = doc.apply(Transaction::new(vec![edit]), &sel, Instant::now());
        sel = applied.selections.clone();
        map.update(doc.buffer(), &applied.changes);
        assert_eq!(
            map.lines,
            ScopeMap::new(Language::Latex, doc.buffer()).lines,
            "{:?}",
            doc.buffer().text()
        );
    }
}

#[test]
fn a_missed_change_rebuilds() {
    let mut doc = Document::from_text("\\begin{a}\nx\n");
    let mut map = ScopeMap::new(Language::Latex, doc.buffer());
    let sel = SelectionSet::cursor(0);
    doc.apply(
        Transaction::insert(&sel, "\\begin{b}\n"),
        &sel,
        Instant::now(),
    );
    let applied = doc.apply(Transaction::insert(&sel, "y"), &sel, Instant::now());
    map.update(doc.buffer(), &applied.changes);
    assert_eq!(
        map.lines,
        ScopeMap::new(Language::Latex, doc.buffer()).lines
    );
}
