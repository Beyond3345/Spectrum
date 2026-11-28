use super::*;

const EXISTING_BIB: &str = "@Article{Smith2020,\n  author = {Smith, Jane},\n  title = {{Deep} Learning for \\&-Things},\n  year = 2020,\n  doi = {10.9999/EXISTING}\n}\n\n@misc{Vaswani2017,\n  title = \"Attention Is {All} You Need\",\n  author = \"Vaswani, Ashish\",\n  eprint = {1706.03762v5},\n  archivePrefix = {arXiv},\n  year = {2017}\n}\n@inproceedings{Lee2019, title={Schr{\\\"o}dinger's Widgets}, year={2019}, note={arXiv:1901.00001}}";

fn id(f: impl FnOnce(&mut Identity)) -> Identity {
    let mut i = Identity::default();
    f(&mut i);
    i
}

#[test]
fn finds_duplicates_by_doi_arxiv_id_or_title_and_year() {
    let index = build_bib_index(&[BibFile {
        file: "references.bib".into(),
        text: EXISTING_BIB.into(),
    }]);
    let key = |i: Identity| find_duplicate(&index, &i).map(|e| e.key.clone());
    assert_eq!(
        key(id(|i| i.doi = "10.9999/existing".into())).as_deref(),
        Some("Smith2020")
    );
    assert_eq!(
        key(id(|i| i.arxiv = "1706.03762".into())).as_deref(),
        Some("Vaswani2017")
    );
    assert_eq!(
        key(id(|i| i.arxiv = "1901.00001".into())).as_deref(),
        Some("Lee2019")
    );
    assert_eq!(
        key(id(|i| {
            i.title = normalise_title("Attention is all you need!");
            i.year = "2017".into();
        }))
        .as_deref(),
        Some("Vaswani2017")
    );
    assert_eq!(
        key(id(|i| {
            i.title = normalise_title("Schrödinger’s widgets");
            i.year = "2019".into();
        }))
        .as_deref(),
        Some("Lee2019")
    );
    assert_eq!(
        key(id(|i| {
            i.title = normalise_title("Attention is all you need");
            i.year = "2018".into();
        })),
        None
    );
    assert_eq!(key(id(|i| i.doi = "10.9999/other".into())), None);

    let generic = build_bib_index(&[BibFile { file: "r.bib".into(), text: "@article{LeCun2015, author = {LeCun, Yann and Bengio, Yoshua}, title = {Deep learning}, year = {2015}, doi = {10.1038/nature14539}}".into() }]);
    let deep = |doi: &str, first: &str| {
        let i = Identity {
            doi: doi.into(),
            title: normalise_title("Deep Learning"),
            year: "2015".into(),
            first_author: first.into(),
            ..Identity::default()
        };
        find_duplicate(&generic, &i).map(|e| e.key.clone())
    };
    assert_eq!(deep("10.4249/scholarpedia.32832", "schmidhuber"), None);
    assert_eq!(deep("10.4249/scholarpedia.32832", ""), None);
    assert_eq!(
        deep("10.1101/preprint.1", "lecun").as_deref(),
        Some("LeCun2015")
    );
    assert_eq!(deep("", "someone").as_deref(), Some("LeCun2015"));
}

#[test]
fn detects_whether_a_source_loads_the_bib() {
    let t = |src: &str, bib: &str| tex_includes_bib(&[src.to_owned()], bib);
    assert!(t("\\bibliography{refs, references}", "references.bib"));
    assert!(t(
        "\\addbibresource[location=local]{bib/references.bib}",
        "references.bib"
    ));
    assert!(!t("% \\bibliography{references}", "references.bib"));
    assert!(!t("\\bibliographystyle{references}", "references.bib"));
    assert!(!t("\\bibliography{other}", "refs/references.bib"));
    assert!(t(
        "#bibliography(\"refs/references.bib\")",
        "references.bib"
    ));
    assert!(t(
        "#bibliography((\"a.bib\", \"references.bib\"), style: \"apa\")",
        "references.bib"
    ));
    assert!(!t("// #bibliography(\"references.bib\")", "references.bib"));
    assert!(t(
        "---\ntitle: T\nbibliography: references.bib\n---\n",
        "references.bib"
    ));
    assert!(t(
        "---\nbibliography:\n  - a.bib\n  - \"refs/references.bib\"\n---\n",
        "references.bib"
    ));
    assert!(!t("---\nbibliography: a.bib\n---\n", "references.bib"));
}

#[test]
fn picks_the_target_bib() {
    let v = |a: &[&str]| a.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
    assert_eq!(
        pick_bib_target(&v(&["a.bib", "references.bib"]), "", &[], false).unwrap(),
        "references.bib"
    );
    assert_eq!(
        pick_bib_target(&v(&["sub/z.bib", "b.bib", "a.tex"]), "", &[], false).unwrap(),
        "b.bib"
    );
    assert_eq!(
        pick_bib_target(&v(&["main.tex"]), "", &[], false).unwrap(),
        "references.bib"
    );
    assert_eq!(
        pick_bib_target(&[], "refs/new.bib", &[], false).unwrap(),
        "refs/new.bib"
    );
    assert_eq!(
        pick_bib_target(&v(&["main.typ"]), "", &[], true).unwrap(),
        "refs.bib"
    );
    assert_eq!(
        pick_bib_target(&v(&["main.typ", "a.bib"]), "", &[], true).unwrap(),
        "a.bib"
    );
    assert_eq!(
        pick_bib_target(
            &v(&["references.bib", "a.bib", "chapters/thesis.bib"]),
            "",
            &v(&["\\bibliography{chapters/thesis}"]),
            false
        )
        .unwrap(),
        "chapters/thesis.bib"
    );
    assert_eq!(
        pick_bib_target(
            &v(&["a.bib", "references.bib"]),
            "",
            &v(&["% \\bibliography{a}"]),
            false
        )
        .unwrap(),
        "references.bib"
    );
    for bad in [
        "../x.bib",
        "/etc/x.bib",
        "x.tex",
        ".spectrum/x.bib",
        ".Spectrum/x.bib",
    ] {
        assert_eq!(
            pick_bib_target(&[], bad, &[], false),
            Err(BadBibFile),
            "{bad}"
        );
    }
}

#[test]
fn records_carry_the_entry_they_duplicate() {
    let text = "@article{knuth84, title = {Literate Programming}, year = 1984, doi = {10.1000/xyz}}\n@article{knuth-again, title = {Other}, doi = {10.1000/XYZ}}\n";
    let recs = bib_records(&[BibFile {
        file: "refs.bib".into(),
        text: text.into(),
    }]);
    assert_eq!(recs[1].line, 2);
    assert_eq!(
        recs[1].duplicate_of,
        Some(DuplicateOf {
            key: "knuth84".into(),
            file: "refs.bib".into(),
            by: "DOI".into()
        })
    );
    assert_eq!(recs[0].fields, ["title", "year", "doi"]);
}
