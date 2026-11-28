//! English spelling over the bundled `dictionaries/` folder, ported from 2.8's `spellWorker.mjs`.
//! Australian English keeps its chain: `en_AU` decides, `AussieDic` adds Australian words, and `en_US` only
//! says which of those are American spellings (so `color` is still flagged). Every dialect gets
//! Spectrum's supplement; Australian English also gets the Australian one.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, OnceLock};

use regex::Regex;

use crate::masking::{mask, never, prose_words};
use crate::{CheckerError, Dialect, DocKind, Lint, LintSource, SpellChecker};

enum Chain {
    One(SpellChecker),
    Australian {
        au: SpellChecker,
        aussie: SpellChecker,
        us: SpellChecker,
    },
}

/// One English dialect's speller. Like [`SpellChecker`] it is `Send` but not `Sync`.
pub struct EnglishSpeller {
    dialect: Dialect,
    chain: Chain,
    own: HashSet<String>,
    dir: PathBuf,
    blocked: OnceLock<HashSet<String>>,
}

static ALL_CAPS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[\p{Lu}']+$").unwrap_or_else(|_| never()));
static CAMEL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\p{Ll}\p{Lu}").unwrap_or_else(|_| never()));

/// Words the checker leaves alone: initials, acronyms, camelCase names, anything with a digit.
fn skip(word: &str) -> bool {
    word.chars().count() < 2
        || word.chars().any(|c| c.is_ascii_digit())
        || ALL_CAPS.is_match(word)
        || CAMEL.is_match(word)
}

/// A word as the dictionaries spell it: straight apostrophes, none at either end.
fn clean(raw: &str) -> String {
    raw.replace('’', "'").trim_matches('\'').to_owned()
}

impl EnglishSpeller {
    /// Opens `dialect` from `dictionaries` (the bundled folder) and checks it answers its self-test,
    /// since a half-loaded dictionary only shows up as wrong answers.
    pub fn open(dictionaries: &Path, dialect: Dialect) -> Result<Self, CheckerError> {
        let extra = dictionaries.join("spectrum-extra.dic");
        let scowl = |name: &str| -> Result<SpellChecker, CheckerError> {
            let folder = dictionaries.join(name);
            SpellChecker::new(
                &folder.join(format!("{name}.aff")),
                &folder.join(format!("{name}.dic")),
            )
        };
        let with_extra = |mut checker: SpellChecker| -> Result<SpellChecker, CheckerError> {
            checker.add_dic(&extra)?;
            Ok(checker)
        };
        let (chain, self_test): (Chain, &[(&str, bool)]) = match dialect {
            Dialect::EnAu => {
                let mut au = with_extra(scowl("en_AU")?)?;
                au.add_dic(&dictionaries.join("spectrum-extra-au.dic"))?;
                let aussie_dir = dictionaries.join("aussiedic");
                let aussie = SpellChecker::new(
                    &aussie_dir.join("AussieDic.aff"),
                    &aussie_dir.join("AussieDic.dic"),
                )?;
                let chain = Chain::Australian {
                    au,
                    aussie,
                    us: scowl("en_US")?,
                };
                (
                    chain,
                    &[
                        ("colour", true),
                        ("color", false),
                        ("organise", true),
                        ("organize", false),
                        ("defence", true),
                    ],
                )
            }
            Dialect::EnUs => (
                Chain::One(with_extra(scowl("en_US")?)?),
                &[
                    ("color", true),
                    ("colour", false),
                    ("defense", true),
                    ("defence", false),
                ],
            ),
            Dialect::EnGb | Dialect::EnIn => (
                Chain::One(with_extra(scowl("en_GB")?)?),
                &[
                    ("colour", true),
                    ("color", false),
                    ("defence", true),
                    ("defense", false),
                ],
            ),
            Dialect::EnCa => (
                Chain::One(with_extra(scowl("en_CA")?)?),
                &[
                    ("colour", true),
                    ("organize", true),
                    ("organise", false),
                    ("tyre", false),
                ],
            ),
        };
        let speller = Self {
            dialect,
            chain,
            own: HashSet::new(),
            dir: dictionaries.to_owned(),
            blocked: OnceLock::new(),
        };
        let failed: Vec<&str> = self_test
            .iter()
            .filter(|(w, ok)| speller.spell(w) != *ok)
            .map(|(w, _)| *w)
            .collect();
        if !failed.is_empty() {
            return Err(CheckerError::SelfTest {
                dialect: dialect.tag(),
                words: failed.join(", "),
            });
        }
        Ok(speller)
    }

    pub fn dialect(&self) -> Dialect {
        self.dialect
    }

    /// Adds a personal word (the user's or the project's) for as long as this speller is open.
    pub fn add_word(&mut self, word: &str) -> Result<(), CheckerError> {
        let word = clean(word);
        match &mut self.chain {
            Chain::One(checker) | Chain::Australian { au: checker, .. } => checker.add(&word)?,
        }
        self.own.insert(word);
        Ok(())
    }

    /// The dictionaries' answer, without the skip rules or personal words.
    fn spell(&self, word: &str) -> bool {
        match &self.chain {
            Chain::One(checker) => checker.check(word),
            Chain::Australian { au, aussie, us } => {
                au.check(word) || (aussie.check(word) && !us.check(word))
            }
        }
    }

    /// Whether `word` passes: skipped, a personal word (as written or in lower case), or spelt right.
    pub fn is_correct(&self, word: &str) -> bool {
        let word = clean(word);
        skip(&word)
            || self.own.contains(&word)
            || self.own.contains(&word.to_lowercase())
            || self.spell(&word)
    }

    /// Up to eight suggestions, each one the dictionary accepts and none of SCOWL's never-suggest
    /// words. From `AussieDic`, which has no such marks, only proper nouns are offered.
    pub fn suggest(&self, word: &str) -> Vec<String> {
        let w = word.replace('’', "'");
        let mut all: Vec<String> = match &self.chain {
            Chain::One(checker) => checker.suggest(&w),
            Chain::Australian { au, aussie, .. } => {
                let mut found = au.suggest(&w);
                found.extend(
                    aussie
                        .suggest(&w)
                        .into_iter()
                        .filter(|s| s.chars().next().is_some_and(char::is_uppercase)),
                );
                found
            }
        };
        let mut seen = HashSet::new();
        all.retain(|s| seen.insert(s.clone()));
        let blocked = self.blocked.get_or_init(|| blocked_words(&self.dir));
        all.into_iter()
            .filter(|s| self.spell(s) && !is_blocked(blocked, s))
            .take(8)
            .collect()
    }

    /// The misspelt words of `source`, masked as `kind`. A word before a full stop is right as
    /// itself or, failing that, with the stop (an abbreviation). Suggestions come from
    /// [`Self::suggest`] when asked for, as in 2.8, since Hunspell can take a while over one.
    pub fn check(&self, source: &str, kind: DocKind) -> Vec<Lint> {
        let prose = mask(source, kind);
        prose_words(&prose)
            .into_iter()
            .filter(|range| {
                let word = &prose[range.clone()];
                !self.is_correct(word)
                    && (prose.as_bytes().get(range.end) != Some(&b'.')
                        || !self.spell(&format!("{}.", clean(word))))
            })
            .map(|range| Lint {
                message: format!(
                    "“{}” isn’t in the {} dictionary.",
                    &source[range.clone()],
                    self.dialect.tag()
                ),
                range,
                suggestions: Vec::new(),
                fixable: true,
                source: LintSource::Spelling,
                rule: "Spelling".to_owned(),
            })
            .collect()
    }
}

/// SCOWL marks slurs with the never-suggest flag (`!`).
fn blocked_words(dir: &Path) -> HashSet<String> {
    let mut blocked = HashSet::new();
    for name in ["en_AU", "en_US", "en_GB", "en_CA"] {
        let Ok(bytes) = std::fs::read(dir.join(name).join(format!("{name}.dic"))) else {
            continue;
        };
        for line in String::from_utf8_lossy(&bytes).lines() {
            if let Some((word, flags)) = line.split_once('/')
                && !word.is_empty()
                && flags.contains('!')
            {
                blocked.insert(word.to_lowercase());
            }
        }
    }
    blocked
}

fn is_blocked(blocked: &HashSet<String>, word: &str) -> bool {
    let w = word.to_lowercase();
    blocked.contains(&w)
        || ["'s", "es", "s"].iter().any(|end| {
            w.strip_suffix(end)
                .is_some_and(|stem| blocked.contains(stem))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn dictionaries() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../dictionaries")
    }

    fn misspelt(speller: &EnglishSpeller, words: &[&str]) -> Vec<String> {
        let mut out: Vec<String> = words
            .iter()
            .filter(|w| !speller.is_correct(w))
            .map(|w| (*w).to_owned())
            .collect();
        out.sort();
        out
    }

    #[test]
    fn australian_english_by_its_chain() {
        let au = EnglishSpeller::open(&dictionaries(), Dialect::EnAu).unwrap();
        let words = [
            "colour",
            "color",
            "organise",
            "organize",
            "defence",
            "defense",
            "recieve",
            "Centrelink",
            "LaTeX",
            "arXiv",
        ];
        assert_eq!(
            misspelt(&au, &words),
            ["color", "defense", "organize", "recieve"]
        );
        assert!(au.suggest("recieve").contains(&"receive".to_owned()));
        assert!(au.suggest("organize").contains(&"organise".to_owned()));
    }

    #[test]
    fn each_bundled_english_and_the_supplement_in_all() {
        let words = [
            "colour",
            "color",
            "organise",
            "organize",
            "defence",
            "defense",
            "LaTeX",
            "arXiv",
            "Centrelink",
            "recieve",
        ];
        let open = |d| EnglishSpeller::open(&dictionaries(), d).unwrap();
        assert_eq!(
            misspelt(&open(Dialect::EnUs), &words),
            ["Centrelink", "colour", "defence", "organise", "recieve"]
        );
        assert_eq!(
            misspelt(&open(Dialect::EnGb), &words),
            ["Centrelink", "color", "defense", "recieve"]
        );
        assert_eq!(
            misspelt(&open(Dialect::EnIn), &words),
            ["Centrelink", "color", "defense", "recieve"]
        );
        assert_eq!(
            misspelt(&open(Dialect::EnCa), &words),
            ["Centrelink", "organise", "recieve"]
        );
        assert!(
            open(Dialect::EnUs)
                .suggest("colur")
                .contains(&"color".to_owned())
        );
    }

    #[test]
    fn a_personal_word_passes_and_skip_rules_hold() {
        let mut au = EnglishSpeller::open(&dictionaries(), Dialect::EnAu).unwrap();
        assert!(!au.is_correct("Spectrumish"));
        au.add_word("Spectrumish").unwrap();
        assert!(au.is_correct("Spectrumish"));
        for word in ["NASA", "iPhone", "x", "don’t", "'colour'"] {
            assert!(au.is_correct(word), "{word}");
        }
    }

    #[test]
    fn checks_a_latex_file_at_source_offsets() {
        let au = EnglishSpeller::open(&dictionaries(), Dialect::EnAu).unwrap();
        let tex = "\\begin{document}\n研究 The colour and color, \\cite{recieve} recieve e.g. this.\n\\end{document}";
        let lints = au.check(tex, DocKind::Latex);
        let found: Vec<&str> = lints.iter().map(|l| &tex[l.range.clone()]).collect();
        assert_eq!(found, ["color", "recieve"]);
        assert!(
            lints
                .iter()
                .all(|l| l.source == LintSource::Spelling && l.suggestions.is_empty())
        );
    }
}
