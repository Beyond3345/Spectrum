//! Which grammar a file gets, from its extension.

use std::path::Path;

/// A language the editor parses. Anything else opens as plain text (`Language::from_path` is
/// `None`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Language {
    Latex,
    Typst,
    Markdown,
    Bibtex,
}

impl Language {
    /// By extension, ignoring case. `.bst` (BibTeX's own stack language) is not BibTeX data and
    /// stays plain text.
    pub fn from_path(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?.to_ascii_lowercase();
        Some(match ext.as_str() {
            "tex" | "ltx" | "latex" | "sty" | "cls" | "clo" | "dtx" | "ins" | "def" | "bbx"
            | "cbx" | "lbx" | "dbx" => Self::Latex,
            "typ" => Self::Typst,
            "md" | "markdown" | "mmd" => Self::Markdown,
            "bib" => Self::Bibtex,
            _ => return None,
        })
    }

    pub(crate) fn grammar(self) -> tree_sitter::Language {
        match self {
            Self::Latex => codebook_tree_sitter_latex::LANGUAGE.into(),
            Self::Typst => codebook_tree_sitter_typst::LANGUAGE.into(),
            Self::Markdown => tree_sitter_md::LANGUAGE.into(),
            Self::Bibtex => bibtex::LANGUAGE.into(),
        }
    }
}

/// The vendored BibTeX grammar, compiled by `build.rs`.
#[allow(unsafe_code)]
mod bibtex {
    use tree_sitter_language::LanguageFn;

    unsafe extern "C" {
        fn tree_sitter_bibtex() -> *const ();
    }

    // SAFETY: `tree_sitter_bibtex` is the generated parser's entry point; it takes nothing and
    // returns a pointer to a static `TSLanguage`, which is what `LanguageFn` wraps.
    pub(super) const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_bibtex) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_by_extension() {
        let lang = |p: &str| Language::from_path(Path::new(p));
        assert_eq!(lang("main.tex"), Some(Language::Latex));
        assert_eq!(lang("doc/Thesis.LTX"), Some(Language::Latex));
        assert_eq!(lang("mystyle.sty"), Some(Language::Latex));
        assert_eq!(lang("article.cls"), Some(Language::Latex));
        assert_eq!(lang("pkg.dtx"), Some(Language::Latex));
        assert_eq!(lang("paper.typ"), Some(Language::Typst));
        assert_eq!(lang("README.md"), Some(Language::Markdown));
        assert_eq!(lang("notes.markdown"), Some(Language::Markdown));
        assert_eq!(lang("refs.bib"), Some(Language::Bibtex));
        assert_eq!(lang("plain.bst"), None);
        assert_eq!(lang("Makefile"), None);
        assert_eq!(lang("image.png"), None);
    }

    #[test]
    fn every_grammar_loads() {
        for language in [
            Language::Latex,
            Language::Typst,
            Language::Markdown,
            Language::Bibtex,
        ] {
            let mut parser = tree_sitter::Parser::new();
            assert!(
                parser.set_language(&language.grammar()).is_ok(),
                "{language:?}"
            );
        }
    }
}
