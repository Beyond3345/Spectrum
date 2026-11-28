use super::*;

fn draft(kind: &str, fields: &[(&str, &str)]) -> Draft {
    Draft {
        kind: kind.into(),
        key: "K".into(),
        fields: fields
            .iter()
            .map(|(a, b)| ((*a).into(), (*b).into()))
            .collect(),
    }
}

#[test]
fn writes_biber_or_classic_bibtex() {
    let web = draft(
        "online",
        &[
            ("title", "A page"),
            ("url", "https://x.test"),
            ("urldate", "2026-11-27"),
            ("date", "2024-03-02"),
        ],
    );
    assert_eq!(
        format_entry(&web, Style::default()),
        "@misc{K,\n  title = {A page},\n  year  = {2024},\n  date  = {2024-03-02},\n  url   = {https://x.test},\n  note  = {Accessed 2026-11-27},\n}"
    );
    let legacy = format_entry(
        &web,
        Style {
            biblatex: false,
            legacy_urls: true,
        },
    );
    assert!(
        legacy.contains("howpublished = {\\url{https://x.test}}") && !legacy.contains("  url "),
        "{legacy}"
    );
    let thesis = draft(
        "thesis",
        &[
            ("title", "T"),
            ("institution", "Uni"),
            ("type", "Master's thesis"),
            ("year", "2019"),
        ],
    );
    assert!(
        format_entry(&thesis, Style::default()).starts_with(
            "@mastersthesis{K,\n  title  = {T},\n  year   = {2019},\n  school = {Uni},"
        )
    );
    let bl = format_entry(
        &draft(
            "article",
            &[("journal", "J"), ("title", "T & U"), ("year", "2020")],
        ),
        Style {
            biblatex: true,
            legacy_urls: false,
        },
    );
    assert_eq!(
        bl,
        "@article{K,\n  title        = {T \\& U},\n  journaltitle = {J},\n  date         = {2020},\n}"
    );
}

#[test]
fn suggests_keys_and_finds_problems() {
    let f = |pairs: &[(&str, &str)]| {
        pairs
            .iter()
            .map(|(a, b)| ((*a).to_owned(), (*b).to_owned()))
            .collect::<Vec<_>>()
    };
    assert_eq!(
        suggest_key(&f(&[
            ("author", "Cormen, Thomas and Leiserson, Charles"),
            ("year", "2022")
        ])),
        "Cormen2022"
    );
    assert_eq!(
        suggest_key(&f(&[("organization", "{IEEE}"), ("date", "2019-01-01")])),
        "IEEE2019"
    );
    assert_eq!(
        suggest_key(&f(&[("author", "Gabriel García Márquez")])),
        "Marquez"
    );
    assert_eq!(suggest_key(&f(&[("title", "On the Widgets")])), "Widgets");
    let taken = std::collections::HashSet::from(["cormen2022".to_owned()]);
    let p = draft_problems(
        &Draft {
            kind: "article".into(),
            key: String::new(),
            fields: f(&[("author", "Cormen, T"), ("year", "2022"), ("title", "{x")]),
        },
        &taken,
    );
    assert_eq!(
        p.key.as_deref(),
        Some("Cormen2022 is already used in the project")
    );
    assert_eq!(
        p.fields,
        vec![("title".to_owned(), "Each { needs its }".to_owned())]
    );
    assert!(
        draft_problems(
            &Draft {
                kind: "x1".into(),
                key: "a b".into(),
                fields: vec![]
            },
            &taken
        )
        .kind
        .is_some()
    );
}

#[test]
fn labels_and_applies_editions() {
    let e = Edition {
        isbn: "9780262046305".into(),
        year: "2022".into(),
        publisher: "MIT Press".into(),
        edition: "4".into(),
        ..Edition::default()
    };
    assert_eq!(
        edition_label(&e),
        "2022 · 4th ed. · MIT Press · 9780262046305"
    );
    assert_eq!(
        edition_label(&Edition {
            edition: "12".into(),
            ..Edition::default()
        }),
        "12th ed."
    );
    let d = Draft {
        kind: "book".into(),
        key: "Cormen2009".into(),
        fields: vec![
            ("author".into(), "Cormen, T".into()),
            ("year".into(), "2009".into()),
        ],
    };
    let next = apply_edition(&d, &e);
    assert_eq!(next.key, "Cormen2022");
    assert_eq!(next.get("isbn"), "9780262046305");
}
