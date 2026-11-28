//! Harper grammar, Hunspell spelling and LanguageTool.
//!
//! Every checker reads LaTeX, Typst and Markdown through [`mask`], which turns markup into spaces at
//! the same byte offsets, and answers [`Lint`]s whose `range` is a byte range in the source.

mod harper;
#[allow(unsafe_code)]
mod hunspell_ffi;
mod languagetool;
mod masking;
mod spelling;

use std::ops::Range;
use std::path::Path;

pub use harper::{GrammarChecker, GrammarOptions, GrammarReport, OxfordComma};
pub use hunspell_ffi::SpellChecker;
pub use languagetool::{LanguageTool, LanguageToolOptions};
pub use masking::{mask, prose_words};
pub use spelling::EnglishSpeller;

/// Which checker found a [`Lint`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LintSource {
    Grammar,
    Spelling,
}

/// One suggested edit for a lint's range.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Fix {
    Replace(String),
    Remove,
    InsertAfter(String),
}

/// A problem in the source. `range` is a byte range into the text that was checked; `fixable` is
/// false when it runs into markup, where a fix written for the prose would break the source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lint {
    pub range: Range<usize>,
    pub message: String,
    pub suggestions: Vec<Fix>,
    pub fixable: bool,
    pub source: LintSource,
    /// The rule's id (Harper's group name, LanguageTool's rule id, `Spelling` for Hunspell).
    pub rule: String,
}

/// The markup a file is written in, which decides how it is masked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocKind {
    Latex,
    Typst,
    Markdown,
    Plain,
}

impl DocKind {
    /// By extension, as 2.8: `.tex`/`.ltx`, `.typ`, `.md`/`.markdown`, anything else plain text.
    pub fn from_path(path: &Path) -> Self {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        match ext.as_str() {
            "tex" | "ltx" => Self::Latex,
            "typ" => Self::Typst,
            "md" | "markdown" => Self::Markdown,
            _ => Self::Plain,
        }
    }
}

/// The five English dialects Harper and the bundled dictionaries cover; Australian is the default.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Dialect {
    #[default]
    EnAu,
    EnUs,
    EnGb,
    EnCa,
    EnIn,
}

impl Dialect {
    pub const ALL: [Self; 5] = [Self::EnAu, Self::EnUs, Self::EnGb, Self::EnCa, Self::EnIn];

    /// From a language tag (`en-AU`); None for a tag that isn't one of the five.
    pub fn from_tag(tag: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|d| d.tag().eq_ignore_ascii_case(tag))
    }

    pub fn tag(self) -> &'static str {
        match self {
            Self::EnAu => "en-AU",
            Self::EnUs => "en-US",
            Self::EnGb => "en-GB",
            Self::EnCa => "en-CA",
            Self::EnIn => "en-IN",
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CheckerError {
    #[error("{0}")]
    Dictionary(String),
    #[error("Unsupported dictionary encoding {0}")]
    Encoding(String),
    #[error("Hunspell can’t take the word {0:?}")]
    Word(String),
    #[error("The {dialect} dictionary gave wrong answers for: {words}")]
    SelfTest {
        dialect: &'static str,
        words: String,
    },
}
