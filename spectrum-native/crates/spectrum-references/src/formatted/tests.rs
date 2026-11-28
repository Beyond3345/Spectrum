use super::*;
use crate::detect::{ItemKind, classify_line};

const CITATIONS: &[(&str, &str)] = &[
    (
        "apaBook",
        "Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C. (2022). Introduction to algorithms (4th ed.). MIT Press.",
    ),
    (
        "apaArticle",
        "LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.",
    ),
    (
        "apaChapter",
        "Smith, J. A. (2020). A chapter on things. In B. Editor & C. Other (Eds.), The book of things (pp. 10–20). Springer.",
    ),
    (
        "ieeePaper",
        "[1] A. Vaswani, N. Shazeer, and N. Parmar, “Attention is all you need,” in Proc. NeurIPS, 2017, pp. 5998–6008.",
    ),
    (
        "ieeeBook",
        "[2] T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, Introduction to Algorithms, 4th ed. Cambridge, MA, USA: MIT Press, 2022.",
    ),
    (
        "ieeeArticle",
        "[3] Y. LeCun, Y. Bengio, and G. Hinton, \"Deep learning,\" Nature, vol. 521, no. 7553, pp. 436–444, 2015.",
    ),
    (
        "chicagoBook",
        "Cormen, Thomas H., Charles E. Leiserson, Ronald L. Rivest, and Clifford Stein. Introduction to Algorithms. 4th ed. Cambridge, MA: MIT Press, 2022.",
    ),
    (
        "chicagoDate",
        "Cormen, Thomas H., Charles E. Leiserson, Ronald L. Rivest, and Clifford Stein. 2022. Introduction to Algorithms. 4th ed. Cambridge, MA: MIT Press.",
    ),
    (
        "chicagoArticle",
        "LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. “Deep Learning.” Nature 521, no. 7553 (2015): 436–44.",
    ),
    (
        "mlaArticle",
        "Vaswani, Ashish, et al. “Attention Is All You Need.” Advances in Neural Information Processing Systems, vol. 30, 2017, pp. 5998–6008.",
    ),
    (
        "mlaBook",
        "Cormen, Thomas H., et al. Introduction to Algorithms. 4th ed., MIT Press, 2022.",
    ),
    (
        "thesis",
        "Doe, Jane. \"Learning Things.\" PhD dissertation, University of Melbourne, 2019.",
    ),
];

fn p(key: &str) -> Record {
    let text = CITATIONS
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, v)| *v)
        .unwrap();
    parse_formatted(text).unwrap_or_else(|| panic!("{key} reads"))
}

fn names(rec: &Record) -> Vec<String> {
    rec.author
        .iter()
        .map(|a| {
            if a.literal.is_empty() {
                format!("{}, {}", a.family, a.given).trim().to_owned()
            } else {
                a.literal.clone()
            }
        })
        .collect()
}

#[test]
fn apa_ieee_chicago_and_mla_citations_are_read_into_their_fields() {
    for k in [
        "apaBook",
        "ieeeBook",
        "chicagoBook",
        "chicagoDate",
        "mlaBook",
    ] {
        let r = p(k);
        assert_eq!(r.kind, "book", "{k}");
        assert_eq!(
            r.title,
            if k == "apaBook" {
                "Introduction to algorithms"
            } else {
                "Introduction to Algorithms"
            },
            "{k}"
        );
        assert_eq!(r.edition, "4", "{k}");
        assert_eq!(r.publisher, "MIT Press", "{k}");
        assert_eq!(r.issued, vec![2022], "{k}");
    }
    assert_eq!(
        names(&p("apaBook")),
        [
            "Cormen, T. H.",
            "Leiserson, C. E.",
            "Rivest, R. L.",
            "Stein, C."
        ]
    );
    assert_eq!(
        names(&p("chicagoBook")),
        [
            "Cormen, Thomas H.",
            "Leiserson, Charles E.",
            "Rivest, Ronald L.",
            "Stein, Clifford"
        ]
    );
    assert_eq!(
        names(&p("ieeeBook")),
        [
            "Cormen, T. H.",
            "Leiserson, C. E.",
            "Rivest, R. L.",
            "Stein, C."
        ]
    );
    assert_eq!(names(&p("mlaBook")), ["Cormen, Thomas H.", "others"]);
    assert_eq!(p("ieeeBook").place, "Cambridge, MA, USA");
    assert_eq!(p("chicagoBook").place, "Cambridge, MA");
    for k in ["apaArticle", "ieeeArticle", "chicagoArticle"] {
        let r = p(k);
        assert_eq!(r.kind, "article-journal", "{k}");
        assert_eq!(
            (
                r.container.as_str(),
                r.volume.as_str(),
                r.issue.as_str(),
                r.issued[0]
            ),
            ("Nature", "521", "7553", 2015),
            "{k}"
        );
        assert!(
            r.page.starts_with("436-44") || r.page.starts_with("436–44"),
            "{k}: {}",
            r.page
        );
    }
    let paper = p("ieeePaper");
    assert_eq!(
        (
            paper.kind.as_str(),
            paper.container.as_str(),
            paper.page.as_str()
        ),
        ("paper-conference", "Proc. NeurIPS", "5998–6008")
    );
    let mla = p("mlaArticle");
    assert_eq!(
        (mla.kind.as_str(), mla.volume.as_str(), mla.title.as_str()),
        ("paper-conference", "30", "Attention Is All You Need")
    );
    let chapter = p("apaChapter");
    let editors: Vec<_> = chapter.editor.iter().map(|e| e.family.as_str()).collect();
    assert_eq!(
        (
            chapter.kind.as_str(),
            chapter.container.as_str(),
            chapter.publisher.as_str()
        ),
        ("chapter", "The book of things", "Springer")
    );
    assert_eq!(editors, ["Editor", "Other"]);
    let thesis = p("thesis");
    assert_eq!(
        (thesis.kind.as_str(), thesis.publisher.as_str()),
        ("thesis", "University of Melbourne")
    );
    for text in [
        "Attention is all you need",
        "Deep learning review 2017",
        "The quick brown fox jumps over the lazy dog. 2020. Something else.",
        "Doe J. Another study. 2021",
    ] {
        assert!(parse_formatted(text).is_none(), "{text}");
    }
    for (k, c) in CITATIONS {
        assert_eq!(classify_line(c).kind, ItemKind::Citation, "{k}");
    }
    let with_doi = classify_line(&format!(
        "{} https://doi.org/10.1038/nature14539",
        CITATIONS[1].1
    ));
    assert_eq!(
        (with_doi.kind, with_doi.id.as_str()),
        (ItemKind::Doi, "10.1038/nature14539")
    );
    assert_eq!(with_doi.parsed.unwrap().title, "Deep learning");
    assert_eq!(edition_of("Fourth edition"), "4");
    let families: Vec<_> = split_authors("Smith, J., & van der Berg, K.")
        .into_iter()
        .map(|a| a.family)
        .collect();
    assert_eq!(families, ["Smith", "van der Berg"]);
}
