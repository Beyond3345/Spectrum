//! The plan's targets for the document core: a 20,000-line .tex opens in under 30 ms and an edit
//! leaves nearly all of a 4 ms frame to drawing.
//! The language layer: Tree-sitter's first parse off the UI thread, then per keystroke an
//! incremental reparse, a highlight of the screen and a scope-bar update.
//! Run: `cargo test --release -p spectrum-editor --test perf -- --ignored --nocapture`

use std::fmt::Write as _;
use std::time::{Duration, Instant};

use spectrum_editor::{
    Document, Language, ParsedTree, PointUtf16, ScopeMap, Selection, SelectionSet, Syntax,
    Transaction, todos,
};

/// A paper-shaped file: sections, prose with maths, CJK and emoji, equations and lists.
fn generate_tex(lines: usize) -> String {
    let prose = [
        "The quick brown fox jumps over the lazy dog while the \\emph{editor} measures how long a frame takes to draw on screen.",
        "Let $f \\colon X \\to Y$ be a continuous map between compact Hausdorff spaces, and suppose \\cite{knuth84} holds for every $x \\in X$.",
        "我們喺呢度寫一段中文，用嚟測試 CJK 字元嘅排版同埋 UTF-16 轉換，仲有 emoji 😀 同 \\textbf{粗體}。",
        "% a comment line that explains the next environment and should be coloured as a comment",
    ];
    let mut out =
        String::from("\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n");
    for i in 0..lines - 4 {
        // writing to a String cannot fail
        let _ = match i % 12 {
            0 => writeln!(out, "\\section{{Section {i}}}\\label{{sec:{i}}}"),
            1 | 2 | 3 | 7 | 8 => writeln!(out, "{}", prose[i % 4]),
            4 => writeln!(out, "\\begin{{align*}}"),
            5 => writeln!(
                out,
                "  a_{{{i}}} &= \\int_0^1 x^{{{i}}} \\, dx + \\sum_{{k=1}}^{{n}} \\frac{{1}}{{k^2}} \\\\"
            ),
            6 => writeln!(out, "\\end{{align*}}"),
            9 => writeln!(out, "\\begin{{enumerate}}"),
            10 => writeln!(
                out,
                "  \\item Find the domain of $f$ and show that it is closed."
            ),
            _ => writeln!(out, "\\end{{enumerate}}"),
        };
    }
    out.push_str("\\end{document}\n");
    out
}

struct Timing {
    median: Duration,
    p99: Duration,
    max: Duration,
}

fn timing(label: &str, mut samples: Vec<Duration>) -> Timing {
    samples.sort();
    let t = Timing {
        median: samples[samples.len() / 2],
        p99: samples[samples.len() * 99 / 100],
        max: samples[samples.len() - 1],
    };
    eprintln!(
        "{label:<44} n={:<6} median {:>9.2?}  p99 {:>9.2?}  max {:>9.2?}",
        samples.len(),
        t.median,
        t.p99,
        t.max
    );
    t
}

fn time(f: impl FnOnce()) -> Duration {
    let start = Instant::now();
    f();
    start.elapsed()
}

#[test]
#[ignore = "timing; run in release"]
fn a_20k_line_tex_opens_and_edits_within_the_plans_targets() {
    let text = generate_tex(20_000);
    let crlf = text.replace('\n', "\r\n");
    eprintln!("{} lines, {} bytes", text.lines().count(), text.len());

    let open = timing(
        "open (Document::from_text)",
        (0..40)
            .map(|_| time(|| drop(Document::from_text(&text))))
            .collect(),
    );
    let open_crlf = timing(
        "open, CRLF file",
        (0..40)
            .map(|_| time(|| drop(Document::from_text(&crlf))))
            .collect(),
    );
    assert!(open.median < Duration::from_millis(30));
    assert!(open_crlf.median < Duration::from_millis(30));

    // typing in the middle, one keystroke a transaction, undo recorded
    let mut doc = Document::from_text(&text);
    let middle = doc.buffer().line_range(10_000).end;
    let mut sel = SelectionSet::cursor(middle);
    let mut now = Instant::now();
    let mut samples = Vec::new();
    for i in 0..10_000 {
        let key = if i % 6 == 5 { " " } else { "é" };
        now += Duration::from_millis(80);
        samples.push(time(|| {
            sel = doc
                .apply(Transaction::insert(&sel, key), &sel, now)
                .selections;
        }));
    }
    let typing = timing("type one character (apply + undo record)", samples);
    assert!(typing.median < Duration::from_micros(200));
    assert!(typing.p99 < Duration::from_millis(1));

    // what the IME and the LSP ask for on every keystroke
    let len = doc.buffer().len();
    let mut samples = Vec::new();
    let mut check = 0;
    for i in 0..100_000 {
        let offset = i * 7919 % len;
        samples.push(time(|| {
            let buffer = doc.buffer();
            let point = buffer.offset_to_point_utf16(offset);
            check += buffer.point_utf16_to_offset(point);
            check += buffer.utf16_to_offset(buffer.offset_to_utf16(offset));
            check += buffer.offset_to_char(offset);
        }));
    }
    let convert = timing("offset <-> UTF-16 point, UTF-16, char", samples);
    assert!(check > 0);
    assert!(convert.p99 < Duration::from_micros(100));
    // the text ends in a line break, so line 20,000 is the empty last line
    let last = PointUtf16 {
        line: 20_000,
        column: 0,
    };
    assert_eq!(doc.buffer().point_utf16_to_offset(last), len);

    // 100 cursors typing at once
    let cursors = (0..100)
        .map(|i| Selection::cursor(doc.buffer().line_range(i * 200).end))
        .collect();
    let mut sel = SelectionSet::new(cursors, 0);
    let mut samples = Vec::new();
    for _ in 0..200 {
        now += Duration::from_millis(80);
        samples.push(time(|| {
            sel = doc
                .apply(Transaction::insert(&sel, "x"), &sel, now)
                .selections;
        }));
    }
    let multi = timing("type one character at 100 cursors", samples);
    assert!(multi.median < Duration::from_millis(4));

    // undo everything, redo everything
    let edited = doc.buffer().text();
    let mut steps = 0;
    let undo = time(|| {
        while doc.undo().is_some() {
            steps += 1;
        }
    });
    eprintln!("undo all ({steps} steps)                        {undo:>9.2?}");
    assert_eq!(doc.buffer().text(), text);
    let redo = time(|| while doc.redo().is_some() {});
    eprintln!("redo all                                     {redo:>9.2?}");
    assert_eq!(doc.buffer().text(), edited);
    let save = timing(
        "text for saving (Buffer::file_text)",
        (0..20)
            .map(|_| time(|| drop(doc.buffer().file_text())))
            .collect(),
    );
    assert!(save.median < Duration::from_millis(30));
}

#[test]
#[ignore = "timing; run in release"]
fn a_20k_line_tex_parses_highlights_and_tracks_scopes_within_the_plans_targets() {
    let text = generate_tex(20_000);
    let mut doc = Document::from_text(&text);

    let first = timing(
        "first parse (background, ParsedTree::parse)",
        (0..10)
            .map(|_| {
                let rope = doc.buffer().rope().clone();
                time(|| drop(ParsedTree::parse(Language::Latex, &rope, 0)))
            })
            .collect(),
    );
    assert!(first.median < Duration::from_millis(400));
    let mut syntax = Syntax::new(Language::Latex, doc.buffer());
    let parsed = ParsedTree::parse(Language::Latex, doc.buffer().rope(), doc.version());
    assert!(syntax.accept(parsed, doc.buffer()));

    let build = timing(
        "scope map, built from scratch",
        (0..20)
            .map(|_| time(|| drop(ScopeMap::new(Language::Latex, doc.buffer()))))
            .collect(),
    );
    assert!(build.median < Duration::from_millis(20));
    let mut scopes = ScopeMap::new(Language::Latex, doc.buffer());

    // typing in the middle of the file: reparse, scope update, highlight of a 60-line screen
    let line = 10_000;
    let mut sel = SelectionSet::cursor(doc.buffer().line_range(line).end);
    let mut now = Instant::now();
    let (mut reparse, mut depth, mut paint) = (Vec::new(), Vec::new(), Vec::new());
    for i in 0..2_000 {
        // every 50th keystroke opens or closes an environment, so the depths after it change
        let key = match i % 100 {
            49 => "\\begin{x}",
            99 => "\\end{x}",
            _ if i % 6 == 5 => " ",
            _ => "a",
        };
        now += Duration::from_millis(80);
        let applied = doc.apply(Transaction::insert(&sel, key), &sel, now);
        sel = applied.selections.clone();
        reparse.push(time(|| syntax.edit(doc.buffer(), &applied.changes)));
        depth.push(time(|| scopes.update(doc.buffer(), &applied.changes)));
        paint.push(time(|| {
            drop(syntax.highlight(doc.buffer(), line - 30..line + 30));
        }));
    }
    let reparse = timing("incremental reparse after a keystroke", reparse);
    let depth = timing("scope map update after a keystroke", depth);
    let paint = timing("highlight 60 lines (+40 overscan each way)", paint);
    assert!(reparse.median < Duration::from_millis(2));
    assert!(depth.median < Duration::from_micros(200));
    assert!(paint.median < Duration::from_millis(4));
    assert!(scopes.depth(line) > 0);

    // walked over the whole tree, so run when edits settle rather than per keystroke
    let outline = timing(
        "outline (whole file)",
        (0..20)
            .map(|_| time(|| drop(syntax.outline(doc.buffer()))))
            .collect(),
    );
    let folds = timing(
        "folds (whole file)",
        (0..20)
            .map(|_| time(|| drop(syntax.folds(doc.buffer()))))
            .collect(),
    );
    let todo = timing(
        "to-dos (whole file)",
        (0..20)
            .map(|_| time(|| drop(todos(Language::Latex, doc.buffer()))))
            .collect(),
    );
    assert!(outline.median < Duration::from_millis(50));
    assert!(folds.median < Duration::from_millis(50));
    assert!(todo.median < Duration::from_millis(50));
}
