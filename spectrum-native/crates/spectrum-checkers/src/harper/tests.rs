use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use super::*;

fn dictionaries() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../dictionaries")
}

fn check(
    checker: &GrammarChecker,
    text: &str,
    kind: DocKind,
    options: &GrammarOptions,
) -> GrammarReport {
    checker.check(text, kind, options, &[], &AtomicBool::new(false))
}

#[test]
fn lazy_until_the_first_check() {
    let checker = GrammarChecker::new(Some(&dictionaries()));
    assert!(!checker.is_started());
    let report = check(
        &checker,
        "This is a apple.",
        DocKind::Plain,
        &GrammarOptions::default(),
    );
    assert!(checker.is_started());
    assert_eq!(
        report
            .lints
            .iter()
            .map(|l| l.rule.as_str())
            .collect::<Vec<_>>(),
        ["AnA"]
    );
}

#[test]
fn australian_no_oxford_comma_positions_in_the_source() {
    let checker = GrammarChecker::new(Some(&dictionaries()));
    let tex = "\\begin{document}\nThis is a apple. I bought milk, eggs, and bread \\cite{key}. It are \\emph{the the} best.\n\\end{document}";
    let report = check(&checker, tex, DocKind::Latex, &GrammarOptions::default());
    let by_rule: HashMap<&str, &Lint> = report.lints.iter().map(|l| (l.rule.as_str(), l)).collect();
    let an = by_rule["AnA"];
    assert_eq!(&tex[an.range.clone()], "a");
    assert_eq!(an.suggestions[0], Fix::Replace("an".to_owned()));
    assert!(an.fixable);
    assert!(
        by_rule.contains_key("NoOxfordComma"),
        "serial comma flagged"
    );
    assert!(by_rule.contains_key("PronounInflectionBe"), "It are");
    assert!(
        by_rule.contains_key("RepeatedWords"),
        "the the inside \\emph"
    );
    assert!(
        !by_rule.contains_key("SpellCheck"),
        "spelling is left to Hunspell"
    );

    let options = GrammarOptions {
        oxford: OxfordComma::Off,
        ignored_rules: vec!["AnA".to_owned()],
        ..GrammarOptions::default()
    };
    let allowed = check(&checker, tex, DocKind::Latex, &options);
    assert!(
        !allowed
            .lints
            .iter()
            .any(|l| l.rule == "NoOxfordComma" || l.rule == "AnA")
    );
}

#[test]
fn a_span_that_runs_into_markup_is_not_fixable() {
    let checker = GrammarChecker::new(None);
    let tex = "\\begin{document}\nWe saw the \\emph{the} cat.\n\\end{document}";
    let report = check(&checker, tex, DocKind::Latex, &GrammarOptions::default());
    let repeated = report
        .lints
        .iter()
        .find(|l| l.rule == "RepeatedWords")
        .unwrap();
    assert!(tex[repeated.range.clone()].contains("\\emph"));
    assert!(!repeated.fixable);
}

#[test]
fn each_dialect_and_the_serial_comma_in_each() {
    let checker = GrammarChecker::new(Some(&dictionaries()));
    let text = "Grab the flashlight and change the diaper. Fill the petrol tank. I bought milk, eggs, and bread.";
    let flagged = |dialect, oxford| -> Vec<String> {
        let options = GrammarOptions {
            dialect,
            oxford,
            style: true,
            ..GrammarOptions::default()
        };
        check(&checker, text, DocKind::Plain, &options)
            .lints
            .iter()
            .map(|l| format!("{}:{}", l.rule, &text[l.range.clone()]))
            .collect()
    };
    let au = flagged(Dialect::EnAu, OxfordComma::Avoid);
    assert!(
        au.contains(&"Regionalisms:flashlight".into())
            && au.contains(&"Regionalisms:diaper".into()),
        "{au:?}"
    );
    assert!(!au.contains(&"Regionalisms:petrol".into()));
    let us = flagged(Dialect::EnUs, OxfordComma::Avoid);
    assert!(
        us.contains(&"Regionalisms:petrol".into())
            && !us.contains(&"Regionalisms:flashlight".into()),
        "{us:?}"
    );
    assert!(flagged(Dialect::EnGb, OxfordComma::Avoid).contains(&"Regionalisms:flashlight".into()));
    assert!(flagged(Dialect::EnCa, OxfordComma::Avoid).contains(&"Regionalisms:petrol".into()));
    for dialect in Dialect::ALL {
        assert!(
            flagged(dialect, OxfordComma::Avoid).contains(&"NoOxfordComma:,".into()),
            "{dialect:?}"
        );
        assert!(
            !flagged(dialect, OxfordComma::Off)
                .iter()
                .any(|l| l.starts_with("NoOxfordComma")),
            "{dialect:?}"
        );
        assert!(
            flagged(dialect, OxfordComma::Require)
                .iter()
                .all(|l| !l.starts_with("NoOxfordComma")),
            "{dialect:?}"
        );
    }
}

#[test]
fn inline_chinese_and_emoji_never_error() {
    let checker = GrammarChecker::new(None);
    let text =
        "We measured the 研究結果 carefully 😀 and wrote 日本語の文章 down. This is a apple.";
    let report = check(
        &checker,
        text,
        DocKind::Plain,
        &GrammarOptions {
            style: true,
            ..GrammarOptions::default()
        },
    );
    let rules: Vec<(&str, &str)> = report
        .lints
        .iter()
        .map(|l| (l.rule.as_str(), &text[l.range.clone()]))
        .collect();
    assert_eq!(rules, [("AnA", "a")]);
}

#[test]
fn own_words_and_markdown() {
    let checker = GrammarChecker::new(None);
    let words = vec!["Spectrumish".to_owned()];
    let report = checker.check(
        "# Notes\n\nThis is a apple, see `the the`.",
        DocKind::Markdown,
        &GrammarOptions::default(),
        &words,
        &AtomicBool::new(false),
    );
    assert_eq!(
        report
            .lints
            .iter()
            .map(|l| l.rule.as_str())
            .collect::<Vec<_>>(),
        ["AnA"]
    );
}

#[test]
fn a_long_file_goes_in_parts_at_file_positions_and_cancels_between_them() {
    let paragraph = "This is a apple that the team have measured. We analysed the results, and they was consistent with the model. ";
    let text = vec![paragraph.repeat(2); 600].join("\n\n");
    let checker = GrammarChecker::new(None);
    let whole = check(&checker, &text, DocKind::Plain, &GrammarOptions::default());
    assert!(
        whole.parts > 2 && whole.done == whole.parts && !whole.cancelled(),
        "{} of {}",
        whole.done,
        whole.parts
    );
    let apples: Vec<&Lint> = whole.lints.iter().filter(|l| l.rule == "AnA").collect();
    assert_eq!(apples.len(), 1200);
    let last = apples[apples.len() - 1];
    assert_eq!(&text[last.range.start..last.range.end + 6], "a apple");
    assert!(last.range.start > text.len() - paragraph.len() * 2);

    let stopped = AtomicBool::new(true);
    let none = checker.check(
        &text,
        DocKind::Plain,
        &GrammarOptions::default(),
        &[],
        &stopped,
    );
    assert_eq!(
        (none.done, none.parts, none.lints.len()),
        (0, whole.parts, 0)
    );

    // a fresh linter and new text, so no part is answered from Harper's cache
    let fresh = GrammarChecker::new(None);
    let other = text.replace("apple", "orange");
    let cancel = AtomicBool::new(false);
    let report = std::thread::scope(|scope| {
        scope.spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(5));
            cancel.store(true, Ordering::Relaxed);
        });
        fresh.check(
            &other,
            DocKind::Plain,
            &GrammarOptions::default(),
            &[],
            &cancel,
        )
    });
    assert!(report.cancelled(), "{} of {}", report.done, report.parts);
    let next = check(
        &checker,
        "This is a apple.",
        DocKind::Plain,
        &GrammarOptions::default(),
    );
    assert_eq!(next.lints.len(), 1);
}
