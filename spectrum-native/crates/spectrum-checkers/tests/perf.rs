//! The plan's target: Harper + Hunspell check a 5,000-word paper in under 15 ms after warm-up.
//! Run: `cargo test --release -p spectrum-checkers --test perf -- --ignored --nocapture`

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

use spectrum_checkers::{Dialect, DocKind, EnglishSpeller, GrammarChecker, GrammarOptions};

const WORDS: &[&str] = &[
    "the",
    "results",
    "of",
    "our",
    "analysis",
    "show",
    "that",
    "a",
    "model",
    "trained",
    "on",
    "colour",
    "images",
    "performs",
    "well",
    "across",
    "every",
    "dataset",
    "we",
    "measured",
    "and",
    "organised",
    "into",
    "groups",
    "with",
    "careful",
    "attention",
    "to",
    "bias",
    "in",
    "sampling",
    "methods",
    "while",
    "previous",
    "work",
    "reported",
    "similar",
    "findings",
    "for",
    "smaller",
    "cohorts",
    "students",
    "teachers",
    "behaviour",
    "learning",
    "outcomes",
    "improved",
    "significantly",
    "after",
    "training",
];

/// A LaTeX paper of `words` words: sections, citations, inline maths, a few errors.
fn paper(words: usize, seed: u64) -> String {
    let mut state = seed;
    let mut next = || {
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        usize::try_from(state >> 33).unwrap_or_default()
    };
    let mut out =
        String::from("\\documentclass{article}\n\\begin{document}\n\\section{Introduction}\n");
    for i in 0..words {
        let w = WORDS[next() % WORDS.len()];
        if i % 12 == 0 {
            out.push_str(&w[..1].to_uppercase());
            out.push_str(&w[1..]);
        } else {
            out.push_str(w);
        }
        match i % 12 {
            11 if i % 60 == 59 => out.push_str(" \\cite{smith2020}.\n\n"),
            11 => out.push_str(". "),
            5 if i % 36 == 5 => out.push_str(" $x^2$ "),
            _ => out.push(' '),
        }
        if i % 600 == 599 {
            out.push_str("\\section{Results}\nThis is a apple, recieve it.\n");
        }
    }
    out.push_str("\n\\end{document}\n");
    out
}

#[test]
#[ignore = "timing: run in release"]
fn harper_and_hunspell_check_a_5000_word_paper() {
    let dictionaries = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../dictionaries");
    let grammar = GrammarChecker::new(Some(&dictionaries));
    let speller = EnglishSpeller::open(&dictionaries, Dialect::EnAu).unwrap();
    let options = GrammarOptions::default();
    let cancel = AtomicBool::new(false);
    let text = paper(5000, 1);
    let check = |text: &str| {
        let started = Instant::now();
        let grammar = grammar
            .check(text, DocKind::Latex, &options, &[], &cancel)
            .lints
            .len();
        let spelling = speller.check(text, DocKind::Latex).len();
        (started.elapsed(), grammar, spelling)
    };
    let (cold, grammar_lints, spelling_lints) = check(&text);
    assert!(grammar_lints > 0 && spelling_lints > 0);

    let median = |mut times: Vec<Duration>| {
        times.sort();
        times[times.len() / 2]
    };
    // a paper Harper hasn't seen: every paragraph linted
    let (fresh, _, _) = check(&paper(5000, 2));
    let same = median((0..9).map(|_| check(&text).0).collect());
    // one word changed per check, as typing does
    let edited = median(
        (0..9)
            .map(|i| check(&text.replacen("analysis", &format!("analysis{i}"), 1)).0)
            .collect(),
    );
    eprintln!(
        "5,000 words: first check {cold:?}, unseen paper {fresh:?}, unchanged re-check {same:?}, after a one-word edit {edited:?} \
         ({grammar_lints} grammar, {spelling_lints} spelling)"
    );
    if !cfg!(debug_assertions) {
        assert!(edited < Duration::from_millis(15), "{edited:?}");
    }
}
