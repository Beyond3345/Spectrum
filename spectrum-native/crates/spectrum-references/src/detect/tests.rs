use super::*;

#[test]
fn detects_dois_anywhere_and_cleans_them() {
    let d = |s: &str| detect_input(s).id;
    assert_eq!(
        d("https://doi.org/10.1038/nature14539"),
        "10.1038/nature14539"
    );
    assert_eq!(d("doi:10.1145/3065386."), "10.1145/3065386");
    assert_eq!(d("(see 10.1000/xyz123)"), "10.1000/xyz123");
    assert_eq!(
        d("10.1016/0370-2693(82)90087-4"),
        "10.1016/0370-2693(82)90087-4"
    );
    assert_eq!(
        d("https://onlinelibrary.wiley.com/doi/full/10.1002/anie.201915678?af=R"),
        "10.1002/anie.201915678"
    );
    assert_eq!(
        d("https://dl.acm.org/doi/10.1145/3065386#sec-1"),
        "10.1145/3065386"
    );
    assert_eq!(
        d("https://www.tandfonline.com/doi/abs/10.1080/1234/abstract"),
        "10.1080/1234"
    );
    assert_eq!(clean_doi("10.1234/a%3Cb%3E"), "10.1234/a<b>");
    let arxiv = detect_input("10.48550/arXiv.1706.03762");
    assert_eq!(
        (arxiv.kind, arxiv.arxiv.as_str()),
        (ItemKind::Doi, "1706.03762")
    );
    assert_eq!(
        d("https://www.biorxiv.org/content/10.1101/2020.06.09.141689v1"),
        "10.1101/2020.06.09.141689"
    );
    assert_eq!(
        d("https://www.medrxiv.org/content/10.1101/2020.03.04.20031112v3.full.pdf"),
        "10.1101/2020.03.04.20031112"
    );
    assert_eq!(
        d("10.1002/(SICI)1097-0258(19980430)17:8<857::AID-SIM777>3.0.CO;2-E"),
        "10.1002/(SICI)1097-0258(19980430)17:8<857::AID-SIM777>3.0.CO;2-E"
    );
}

#[test]
fn detects_arxiv_ids_urls_and_queries() {
    let cases = [
        ("https://arxiv.org/abs/1706.03762v7", "1706.03762"),
        ("https://arxiv.org/pdf/hep-th/9901001v2", "hep-th/9901001"),
        ("arXiv:1706.03762", "1706.03762"),
        ("2101.00002v3", "2101.00002"),
        ("math.GT/0309136", "math.GT/0309136"),
        (
            "Vaswani et al., arXiv preprint arXiv:1706.03762, 2017",
            "1706.03762",
        ),
        ("https://arxiv.org/html/2401.04088v1", "2401.04088"),
        ("https://ar5iv.labs.arxiv.org/html/1706.03762", "1706.03762"),
        ("https://ar5iv.org/abs/1706.03762", "1706.03762"),
    ];
    for (input, id) in cases {
        let item = detect_input(input);
        assert_eq!(
            (item.kind, item.id.as_str()),
            (ItemKind::Arxiv, id),
            "{input}"
        );
    }
    assert_eq!(
        detect_input("https://example.com/paper?id=3.").id,
        "https://example.com/paper?id=3"
    );
    assert_eq!(
        detect_input("https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)").id,
        "https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)"
    );
    assert_eq!(
        detect_input("(see https://x.test/a).").id,
        "https://x.test/a"
    );
    assert_eq!(
        detect_input("www.example.com/page").id,
        "https://www.example.com/page"
    );
    assert_eq!(
        detect_input("Attention is all you need").kind,
        ItemKind::Query
    );
    assert_eq!(
        detect_input("Deep learning review 2017.1234").kind,
        ItemKind::Query
    );
    let kinds: Vec<_> = split_lines("\n 10.1000/a \n\n Some title\n")
        .iter()
        .map(|i| i.kind)
        .collect();
    assert_eq!(kinds, [ItemKind::Doi, ItemKind::Query]);
    let ids: Vec<_> = split_lines("10.1038/nature14539, 10.1145/3065386")
        .into_iter()
        .map(|i| i.id)
        .collect();
    assert_eq!(ids, ["10.1038/nature14539", "10.1145/3065386"]);
    let ids: Vec<_> = split_lines("1706.03762, 1810.04805")
        .into_iter()
        .map(|i| i.id)
        .collect();
    assert_eq!(ids, ["1706.03762", "1810.04805"]);
    assert_eq!(
        split_lines("Vaswani et al., arXiv preprint arXiv:1706.03762, 2017").len(),
        1
    );
}

#[test]
fn reads_isbns_and_ris() {
    assert_eq!(isbn_of("978-0-262-04630-5"), "9780262046305");
    assert_eq!(isbn_of("0262033844"), "9780262033848");
    assert_eq!(isbn_of("0-262-04630-X"), "9780262046305");
    assert_eq!(isbn_of("978-0-262-04630-4"), "");
    assert_eq!(classify_line("ISBN 978-0-262-04630-5").kind, ItemKind::Isbn);
    let ris = "TY  - JOUR\nTI  - Widgets\nAU  - Doe, Jane\nPY  - 2019///\nJO  - J. Tests\nSP  - 1\nEP  - 9\nDO  - 10.1234/w\nER  - \n";
    let recs = parse_ris(ris);
    assert_eq!(recs.len(), 1);
    assert_eq!(
        (
            recs[0].kind.as_str(),
            recs[0].page.as_str(),
            recs[0].doi.as_str()
        ),
        ("article-journal", "1-9", "10.1234/w")
    );
    assert_eq!(recs[0].issued, vec![2019]);
}
