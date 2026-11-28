use super::*;

#[test]
fn escapes_and_protects_titles_without_touching_existing_tex() {
    let t = |s: &str| tex_escape(s, true);
    assert_eq!(
        t("BERT: Pre-training of Deep Bidirectional Transformers"),
        "{BERT}: Pre-training of Deep Bidirectional Transformers"
    );
    assert_eq!(t("GPT-4 Technical Report"), "{GPT-4} Technical Report");
    assert_eq!(
        t("3D U-Net: Learning dense volumetric segmentation"),
        "{3D} {U-Net}: Learning dense volumetric segmentation"
    );
    assert_eq!(
        t("Faster R-CNN: Towards Real-Time Object Detection"),
        "Faster {R-CNN}: Towards Real-Time Object Detection"
    );
    assert_eq!(
        t("Self-Supervised X-ray study of A cells"),
        "Self-Supervised {X-ray} study of A cells"
    );
    assert_eq!(
        t("An iPhone study with McDonald and AI"),
        "An {iPhone} study with {McDonald} and {AI}"
    );
    assert_eq!(
        t("Q&A over 50% of data_sets #1 for $5"),
        "Q\\&A over 50\\% of data\\_sets \\#1 for \\$5"
    );
    assert_eq!(
        t("An $O(n \\log n)$ algorithm for {DNA} and \\& friends"),
        "An $O(n \\log n)$ algorithm for {DNA} and \\& friends"
    );
    assert_eq!(
        t("\\textit{In vivo} study of RNA"),
        "\\textit{In vivo} study of {RNA}"
    );
    assert_eq!(t("Schrödinger and Ørsted"), "Schrödinger and Ørsted");
    assert_eq!(t("ATTENTION IS ALL YOU NEED"), "ATTENTION IS ALL YOU NEED");
    assert_eq!(
        t("Unbalanced } brace { here"),
        "Unbalanced \\} brace \\{ here"
    );
    assert_eq!(t("ends with \\"), "ends with \\textbackslash{}");
    assert_eq!(tex_escape("R&D_Lab", false), "R\\&D\\_Lab");
    assert_eq!(
        t("Limiting TGF-β signaling"),
        "Limiting {TGF-\\ensuremath{\\beta}} signaling"
    );
    assert_eq!(
        tex_escape("Nguyễn Văn Ánh, Łódź, Ω", false),
        "Nguy{\\~{{\\^{e}}}}n Văn Ánh, Łódź, \\ensuremath{\\Omega}"
    );
    assert_eq!(pdf_tex_safe("“Quotes” – fine"), "“Quotes” – fine");
}

#[test]
fn reads_tex_as_text() {
    assert_eq!(
        latex_to_text("Schr{\\\"o}dinger's Widgets"),
        "Schrödinger's Widgets"
    );
    assert_eq!(
        latex_to_text("{Deep} Learning for \\&-Things"),
        "Deep Learning for &-Things"
    );
    assert_eq!(
        latex_to_text("\\'{E}lan and \\c c and {\\ss}"),
        "Élan and ç and ß"
    );
    assert_eq!(
        latex_to_text("\\href{https://x.test}{the site}"),
        "the site"
    );
    assert_eq!(
        latex_to_text("\\textit{In vivo} $\\alpha$-decay"),
        "In vivo α-decay"
    );
    assert_eq!(
        normalise_title("Schrödinger’s widgets"),
        normalise_title("Schr{\\\"o}dinger's Widgets")
    );
    assert_eq!(
        normalise_title("Attention Is {All} You Need"),
        "attention is all you need"
    );
}

#[test]
fn decodes_entities_and_folds() {
    assert_eq!(
        decode_entities("An &quot;OG&quot; title &#8211; &#x2014; M&uuml;ller &bogus; &"),
        "An \"OG\" title – — Müller &bogus; &"
    );
    assert_eq!(
        fold_ascii("Müßig Ørsted Łukasiewicz Ærø"),
        "Mussig Orsted Lukasiewicz Aero"
    );
    assert_eq!(
        clean_text("Crossref &amp; <i>Friends</i>\n  x"),
        "Crossref & Friends x"
    );
    assert_eq!(without_comments("a % b\nc \\% d"), "a \nc \\% d");
    assert_eq!(match_brace("x{a{b}c}d", 1), Some(7));
}
