use std::collections::{BTreeMap, HashSet};

use serde_json::json;

use super::*;

fn rec(v: &Value) -> Record {
    Record::from_value(v)
}

fn fields_of(bib: &str) -> BTreeMap<String, String> {
    bib.lines()
        .filter_map(|l| {
            let l = l.strip_prefix("  ")?;
            let (name, value) = l.split_once(" = {")?;
            Some((name.trim().to_owned(), value.strip_suffix("},")?.to_owned()))
        })
        .collect()
}

fn type_of(bib: &str) -> &str {
    &bib[1..bib.find('{').unwrap_or(1)]
}

fn classic(r: &Record, key: &str) -> String {
    to_bibtex(r, key, Style::default())
}

#[test]
fn builds_author_surname_year_keys() {
    let key = |author: Value, y: Option<i64>, title: Option<Value>| {
        let mut v = json!({ "author": if author.is_null() { json!([]) } else { json!([author]) } });
        if let Some(y) = y {
            v["issued"] = json!({ "date-parts": [[y]] });
        }
        if let Some(t) = title {
            v["title"] = t;
        }
        base_key(&rec(&v))
    };
    assert_eq!(
        key(
            json!({"family": "Vaswani", "given": "Ashish"}),
            Some(2017),
            None
        ),
        "Vaswani2017"
    );
    assert_eq!(
        key(
            json!({"family": "García-Márquez", "given": "Gabriel"}),
            Some(1967),
            None
        ),
        "GarciaMarquez1967"
    );
    assert_eq!(
        key(
            json!({"family": "van der Waals", "given": "Johannes"}),
            Some(1873),
            None
        ),
        "VanderWaals1873"
    );
    assert_eq!(
        key(
            json!({"family": "Waals", "non-dropping-particle": "van der", "given": "J."}),
            Some(1873),
            None
        ),
        "VanderWaals1873"
    );
    assert_eq!(
        key(
            json!({"family": "O'Brien", "given": "Flann"}),
            Some(1967),
            None
        ),
        "OBrien1967"
    );
    assert_eq!(
        key(json!({"family": "Müßig"}), Some(2001), None),
        "Mussig2001"
    );
    assert_eq!(
        key(json!({"family": "Ørsted"}), Some(1820), None),
        "Orsted1820"
    );
    assert_eq!(
        key(json!({"family": "Łukasiewicz"}), Some(1920), None),
        "Lukasiewicz1920"
    );
    assert_eq!(key(json!({"family": "Ærø"}), Some(2000), None), "Aero2000");
    assert_eq!(
        key(json!({"literal": "OpenAI"}), Some(2023), None),
        "OpenAI2023"
    );
    assert_eq!(
        key(
            json!({"name": "World Health Organization"}),
            Some(2020),
            None
        ),
        "WorldHealth2020"
    );
    assert_eq!(
        key(
            json!({"literal": "The ATLAS Collaboration"}),
            Some(2012),
            None
        ),
        "ATLASCollaboration2012"
    );
    assert_eq!(key(json!({"family": "Smith"}), None, None), "Smith");
    assert_eq!(
        key(
            Value::Null,
            Some(2021),
            Some(json!("A Survey of Transformers"))
        ),
        "Survey2021"
    );
    assert_eq!(
        key(Value::Null, None, Some(json!(["The Élan of Things"]))),
        "Elan"
    );
    assert_eq!(
        key(
            json!({"family": "Oord", "given": "Aaron van den"}),
            Some(2016),
            None
        ),
        "VandenOord2016"
    );
    let gemini = Record {
        author: vec![parse_name("Gemini Team").unwrap()],
        issued: vec![2023],
        ..Record::default()
    };
    assert_eq!(base_key(&gemini), "GeminiTeam2023");
    assert_eq!(
        parse_name("ATLAS Collaboration"),
        Some(Name::literal("ATLAS Collaboration"))
    );
    let wavenet = rec(
        &json!({"type": "article", "title": "WaveNet", "author": [{"family": "Oord", "given": "Aaron van den"}]}),
    );
    assert!(classic(&wavenet, "K").contains("author = {van den Oord, Aaron}"));
}

#[test]
fn clashing_keys_get_letter_suffixes() {
    let set = |a: &[&str]| a.iter().map(|s| (*s).to_owned()).collect::<HashSet<_>>();
    assert_eq!(unique_key("Smith2020", &set(&[])), "Smith2020");
    assert_eq!(unique_key("Smith2020", &set(&["smith2020"])), "Smith2020a");
    assert_eq!(
        unique_key("Smith2020", &set(&["smith2020", "smith2020a"])),
        "Smith2020b"
    );
    let mut az = set(&["x"]);
    for c in 'a'..='z' {
        az.insert(format!("x{c}"));
    }
    assert_eq!(unique_key("X", &az), "Xaa");
}

#[test]
fn formats_an_article_exactly() {
    let r = rec(&json!({
        "type": "article-journal",
        "title": "BERT & ImageNet: 50% of GPT-4_x #1",
        "author": [{"family": "Vaswani", "given": "Ashish"}, {"family": "Waals", "non-dropping-particle": "van der", "given": "J.", "suffix": "Jr"}, {"literal": "OpenAI"}],
        "issued": {"date-parts": [[2017]]},
        "container-title": "Advances in Neural Information Processing Systems",
        "volume": "30", "issue": "2", "page": "5998–6008", "publisher": "Curran & Associates",
        "DOI": "10.5555/3295222.3295349", "URL": "https://example.com/ignored-when-doi"
    }));
    assert_eq!(
        classic(&r, "Vaswani2017"),
        [
            "@article{Vaswani2017,",
            "  author    = {Vaswani, Ashish and van der Waals, Jr, J. and {OpenAI}},",
            "  title     = {{BERT} \\& {ImageNet}: 50\\% of {GPT-4}\\_x \\#1},",
            "  journal   = {Advances in Neural Information Processing Systems},",
            "  year      = {2017},",
            "  volume    = {30},",
            "  number    = {2},",
            "  pages     = {5998--6008},",
            "  publisher = {Curran \\& Associates},",
            "  doi       = {10.5555/3295222.3295349},",
            "}",
        ]
        .join("\n")
    );
}

#[test]
fn maps_each_csl_type_to_a_bibtex_type() {
    let cases = [
        ("journal-article", "article", "journal"),
        ("article-journal", "article", "journal"),
        ("proceedings-article", "inproceedings", "booktitle"),
        ("paper-conference", "inproceedings", "booktitle"),
        ("book", "book", "publisher"),
        ("chapter", "incollection", "booktitle"),
        ("book-chapter", "incollection", "booktitle"),
        ("report", "techreport", "institution"),
        ("thesis", "phdthesis", "school"),
        ("dissertation", "phdthesis", "school"),
        ("dataset", "misc", "url"),
        ("posted-content", "misc", "doi"),
        ("other", "misc", "doi"),
    ];
    for (csl, bib_type, field) in cases {
        let r = rec(
            &json!({"type": csl, "title": "T", "author": [{"family": "A", "given": "B"}], "issued": {"date-parts": [[2020]]}, "container-title": "C", "publisher": "P", "DOI": "10.1/x", "URL": "https://x.test/1"}),
        );
        let bib = classic(&r, "K");
        assert_eq!(type_of(&bib), bib_type, "{csl}");
        assert!(
            fields_of(&bib).contains_key(field),
            "{csl} has {field}: {bib}"
        );
    }
    let crossref = rec(
        &json!({"type": "journal-article", "title": ["Crossref &amp; <i>Friends</i>"], "container-title": ["J. Tests"], "author": [{"name": "ATLAS Collaboration"}], "issued": {"date-parts": [[2012]]}, "DOI": "10.1/y"}),
    );
    let f = fields_of(&classic(&crossref, "K"));
    assert_eq!(f["title"], "Crossref \\& Friends");
    assert_eq!(f["author"], "{ATLAS Collaboration}");
    assert_eq!(f["journal"], "J. Tests");
    let dataset = rec(&json!({"type": "dataset", "title": "T", "URL": "https://x.test/d"}));
    assert_eq!(
        fields_of(&classic(&dataset, "K"))["url"],
        "https://x.test/d"
    );
    let article = rec(
        &json!({"type": "journal-article", "title": "T", "DOI": "10.1/x", "URL": "https://x.test/a"}),
    );
    assert!(!fields_of(&classic(&article, "K")).contains_key("url"));
}

#[test]
fn arxiv_dois_become_article_and_eprint() {
    let r = rec(&json!({
        "type": "article", "title": "Attention Is All You Need", "DOI": "10.48550/ARXIV.1706.03762", "publisher": "arXiv",
        "categories": ["Computation and Language (cs.CL)", "Machine Learning (cs.LG)"],
        "author": [{"family": "Vaswani", "given": "Ashish"}], "issued": {"date-parts": [[2017]]}, "URL": "https://arxiv.org/abs/1706.03762"
    }));
    assert_eq!(
        classic(&r, "Vaswani2017"),
        [
            "@article{Vaswani2017,",
            "  author        = {Vaswani, Ashish},",
            "  title         = {Attention Is All You Need},",
            "  journal       = {arXiv preprint arXiv:1706.03762},",
            "  year          = {2017},",
            "  doi           = {10.48550/arXiv.1706.03762},",
            "  url           = {https://arxiv.org/abs/1706.03762},",
            "  eprint        = {1706.03762},",
            "  archivePrefix = {arXiv},",
            "  primaryClass  = {cs.CL},",
            "}",
        ]
        .join("\n")
    );
}

#[test]
fn article_numbers_and_arxiv_links() {
    let r = rec(
        &json!({"type": "article-journal", "title": "GW150914", "container-title": "Phys. Rev. Lett.", "volume": "116", "issue": "6", "article-number": "061102", "DOI": "10.1103/PhysRevLett.116.061102"}),
    );
    assert_eq!(fields_of(&classic(&r, "K"))["pages"], "061102");
    let mut published = rec(
        &json!({"type": "article-journal", "title": "Published paper", "DOI": "10.1234/published"}),
    );
    published.arxiv = Some(ArxivRef {
        id: "2101.00001".into(),
        primary_class: String::new(),
    });
    let f = fields_of(&classic(&published, "K"));
    assert_eq!(f["url"], "https://arxiv.org/abs/2101.00001");
    assert_eq!(f["doi"], "10.1234/published");
}

#[test]
fn imported_titles_use_tex_quotes() {
    let title = |text: &str, kind: &str| {
        fields_of(&classic(&rec(&json!({"type": kind, "title": text})), "K"))["title"].clone()
    };
    assert_eq!(
        title(
            "Forget prompts: 'Loop engineering' is all the rage now",
            "webpage"
        ),
        "Forget prompts: `Loop engineering' is all the rage now"
    );
    assert_eq!(
        title("“Loop engineering” and ‘AI’", "webpage"),
        "``Loop engineering'' and `{AI}'"
    );
    assert_eq!(
        title("About \"Loop engineering\"", "webpage"),
        "About ``Loop engineering''"
    );
    assert_eq!(
        title("'It's O'Brien's idea' and authors' rights", "webpage"),
        "`It's O'Brien's idea' and authors' rights"
    );
    assert_eq!(
        title("Already `quoted' and ``double quoted''", "webpage"),
        "Already `quoted' and ``double quoted''"
    );
    assert_eq!(
        title("A 'quoted' $O(n)$ algorithm", "article"),
        "A `quoted' $O(n)$ algorithm"
    );
}

#[test]
fn publication_dates_keep_their_precision() {
    assert_eq!(
        issued_from_date("2026-06-20T09:01:01.239Z"),
        Some(vec![2026, 6, 20])
    );
    assert_eq!(issued_from_date("2026/06"), Some(vec![2026, 6]));
    assert_eq!(issued_from_date("2026-02-30"), None);
    assert_eq!(issued_from_date("2026-13-20"), None);
    assert_eq!(issued_from_date("Copyright 2026"), None);
}
