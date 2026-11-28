//! Grammar through harper-core, ported from 2.8's `grammarService.js` and `grammarWorker.mjs`.
//! Nothing of Harper is allocated until the first check. One linter per dialect in use, each kept
//! warm with its own config and words, rebuilt only when the words change. A long file is read in
//! parts of about 50,000 characters of its paragraphs, and a check stops between parts when its
//! cancel flag is set; two checks take turns part by part. Each paragraph is linted as its own
//! document and its lints are kept by its text, so a check after an edit re-lints only that paragraph.

use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, OnceLock};

use harper_core::linting::{LintGroup, LintKind, Suggestion};
use harper_core::parsers::{Markdown, PlainEnglish};
use harper_core::spell::{FstDictionary, MergedDictionary, MutableDictionary};
use harper_core::{DictWordMetadata, Document};
use parking_lot::Mutex;
use regex::Regex;

use crate::masking::{mask, never, paragraphs};
use crate::{Dialect, DocKind, Fix, Lint, LintSource};

/// Harper reads a long file in parts of about this many characters.
pub const PART_CHARS: usize = 50_000;

/// The serial-comma house rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OxfordComma {
    #[default]
    Avoid,
    Require,
    Off,
}

#[derive(Debug, Clone, Default)]
pub struct GrammarOptions {
    pub dialect: Dialect,
    pub oxford: OxfordComma,
    /// Show what Harper files as style (style, readability, enhancement, redundancy, formatting).
    pub style: bool,
    /// Harper rules the user turned off for the project.
    pub ignored_rules: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct GrammarReport {
    pub lints: Vec<Lint>,
    pub parts: usize,
    pub done: usize,
    /// Why the check ended early, other than being cancelled (LanguageTool only).
    pub failure: Option<String>,
}

impl GrammarReport {
    /// Whether the check stopped before its last part.
    pub fn cancelled(&self) -> bool {
        self.done < self.parts
    }
}

struct Linter {
    group: LintGroup,
    dictionary: Arc<MergedDictionary>,
    dialect: harper_core::Dialect,
    oxford: Option<OxfordComma>,
    words: String,
    /// Each paragraph's lints (byte ranges in the paragraph) by a hash of its text, so a check after
    /// an edit lints only the paragraphs that changed. Cleared when the config or words change.
    cache: HashMap<u64, Vec<Found>>,
}

// ponytail: cleared whole when full; an LRU if several big projects are checked in turn
const CACHE_PARAGRAPHS: usize = 8192;

impl Linter {
    fn new(dialect: harper_core::Dialect, words: &[String], key: &str) -> Self {
        let dictionary = merged(words);
        let group = LintGroup::new_curated(dictionary.clone(), dialect);
        Self {
            group,
            dictionary,
            dialect,
            oxford: None,
            words: key.to_owned(),
            cache: HashMap::new(),
        }
    }

    /// Applies the serial-comma mode and the words, rebuilding the group's dictionary only when the
    /// words changed.
    fn prepare(&mut self, oxford: OxfordComma, words: &[String], key: &str) {
        if self.words != key {
            *self = Self::new(self.dialect, words, key);
        }
        if self.oxford != Some(oxford) {
            let config = &mut self.group.config;
            // spelling belongs to Hunspell; LaTeX source is full of spacing that means nothing
            for rule in ["SpellCheck", "Spaces", "NoFrenchSpaces"] {
                config.set_rule_enabled(rule, false);
            }
            config.set_rule_enabled("OxfordComma", oxford == OxfordComma::Require);
            config.set_rule_enabled("NoOxfordComma", oxford == OxfordComma::Avoid);
            self.oxford = Some(oxford);
            self.cache.clear();
        }
    }

    /// One paragraph's lints, from the cache when its text hasn't changed.
    fn lint(&mut self, text: &str, markdown: bool) -> Vec<Found> {
        let mut hasher = DefaultHasher::new();
        (text, markdown).hash(&mut hasher);
        let hash = hasher.finish();
        if let Some(found) = self.cache.get(&hash) {
            return found.clone();
        }
        let document = if markdown {
            Document::new(text, &Markdown::default(), self.dictionary.as_ref())
        } else {
            Document::new(text, &PlainEnglish, self.dictionary.as_ref())
        };
        let offsets: Vec<usize> = text
            .char_indices()
            .map(|(i, _)| i)
            .chain([text.len()])
            .collect();
        let byte = |c: usize| offsets[c.min(offsets.len() - 1)];
        let mut found = Vec::new();
        for (rule, group) in self.group.organized_lints(&document) {
            for lint in group {
                found.push(Found {
                    kind: lint.lint_kind,
                    lint: Lint {
                        range: byte(lint.span.start)..byte(lint.span.end),
                        message: lint.message,
                        suggestions: lint.suggestions.into_iter().map(fix).collect(),
                        fixable: true,
                        source: LintSource::Grammar,
                        rule: rule.clone(),
                    },
                });
            }
        }
        if self.cache.len() >= CACHE_PARAGRAPHS {
            self.cache.clear();
        }
        self.cache.insert(hash, found.clone());
        found
    }
}

/// Harper's curated dictionary with `words` on top. Since 3.0 Harper matches by case, so each word
/// goes in as written.
fn merged(words: &[String]) -> Arc<MergedDictionary> {
    let mut own = MutableDictionary::new();
    own.extend_words(
        words
            .iter()
            .map(|w| (w.chars().collect::<Vec<_>>(), DictWordMetadata::default())),
    );
    let mut dictionary = MergedDictionary::new();
    dictionary.add_dictionary(FstDictionary::curated());
    dictionary.add_dictionary(Arc::new(own));
    Arc::new(dictionary)
}

fn harper_dialect(dialect: Dialect) -> harper_core::Dialect {
    match dialect {
        Dialect::EnAu => harper_core::Dialect::Australian,
        Dialect::EnUs => harper_core::Dialect::American,
        Dialect::EnGb => harper_core::Dialect::British,
        Dialect::EnCa => harper_core::Dialect::Canadian,
        Dialect::EnIn => harper_core::Dialect::Indian,
    }
}

/// The supplement words of a `.dic` file (no count line, no flags).
fn dic_words(file: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(file) else {
        tracing::warn!(file = %file.display(), "supplement word list missing");
        return Vec::new();
    };
    text.lines()
        .skip(1)
        .filter_map(|l| l.split('/').next())
        .map(str::trim)
        .filter(|w| !w.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Harper grammar for the five English dialects. `Send + Sync`: share one per app.
pub struct GrammarChecker {
    dictionaries: Option<PathBuf>,
    supplements: OnceLock<(Vec<String>, Vec<String>)>,
    linters: Mutex<HashMap<Dialect, Arc<Mutex<Linter>>>>,
}

// a letter that isn't Latin (a Chinese term in English prose), or a character past the BMP (an emoji)
static OTHER_SCRIPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[[\p{L}\p{M}--\p{Latin}--\p{Inherited}][\x{10000}-\x{10FFFF}]]+")
        .unwrap_or_else(|_| never())
});

// what Harper files as style rather than error; shown only when style suggestions are on
fn is_style(kind: LintKind) -> bool {
    matches!(
        kind,
        LintKind::Style
            | LintKind::Readability
            | LintKind::Enhancement
            | LintKind::Redundancy
            | LintKind::Formatting
    )
}

// Harper rules renamed since a rule could be ignored: ignoring the old name ignores the new one too
const RENAMED: [(&str, &str); 1] = [("NobelPeacePrize", "NobelNoble")];

#[derive(Clone)]
struct Found {
    lint: Lint,
    kind: LintKind,
}

impl GrammarChecker {
    /// A checker that has allocated nothing yet. `dictionaries` is the bundled folder whose
    /// `spectrum-extra.dic` (every dialect) and `spectrum-extra-au.dic` (Australian) Harper also
    /// takes as words.
    pub fn new(dictionaries: Option<&Path>) -> Self {
        Self {
            dictionaries: dictionaries.map(Path::to_owned),
            supplements: OnceLock::new(),
            linters: Mutex::new(HashMap::new()),
        }
    }

    /// Whether any check has started Harper.
    pub fn is_started(&self) -> bool {
        !self.linters.lock().is_empty()
    }

    fn linter(&self, dialect: Dialect, words: &[String], key: &str) -> Arc<Mutex<Linter>> {
        let mut linters = self.linters.lock();
        linters
            .entry(dialect)
            .or_insert_with(|| {
                Arc::new(Mutex::new(Linter::new(harper_dialect(dialect), words, key)))
            })
            .clone()
    }

    /// `source`'s grammar issues, masked as `kind`, with `own_words` (the user's and the project's)
    /// accepted. Stops between parts once `cancel` is set; the report says how many were done.
    pub fn check(
        &self,
        source: &str,
        kind: DocKind,
        options: &GrammarOptions,
        own_words: &[String],
        cancel: &AtomicBool,
    ) -> GrammarReport {
        let prose = mask(source, kind);
        // Harper reads Markdown itself
        let base = if kind == DocKind::Markdown {
            source
        } else {
            prose.as_str()
        };

        let (supplement, supplement_au) =
            self.supplements.get_or_init(|| match &self.dictionaries {
                Some(dir) => (
                    dic_words(&dir.join("spectrum-extra.dic")),
                    dic_words(&dir.join("spectrum-extra-au.dic")),
                ),
                None => (Vec::new(), Vec::new()),
            });
        let mut words: Vec<String> = supplement.iter().chain(own_words).cloned().collect();
        if options.dialect == Dialect::EnAu {
            words.extend(supplement_au.iter().cloned());
        }
        words.sort();
        words.dedup();
        let key = words.join("\n");

        let mut parts: Vec<Vec<std::ops::Range<usize>>> = Vec::new();
        let mut size = usize::MAX;
        for run in paragraphs(&prose) {
            if size >= PART_CHARS {
                parts.push(Vec::new());
                size = 0;
            }
            size += prose[run.clone()].chars().count();
            if let Some(part) = parts.last_mut() {
                part.push(run);
            }
        }

        let linter = self.linter(options.dialect, &words, &key);
        let mut found = Vec::new();
        let mut done = 0;
        for part in &parts {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let mut linter = linter.lock();
            linter.prepare(options.oxford, &words, &key);
            for run in part {
                for mut f in linter.lint(&run_text(&base[run.clone()]), kind == DocKind::Markdown) {
                    f.lint.range = f.lint.range.start + run.start..f.lint.range.end + run.start;
                    found.push(f);
                }
            }
            drop(linter);
            done += 1;
        }

        let mut ignored: HashSet<&str> = options.ignored_rules.iter().map(String::as_str).collect();
        for (old, now) in RENAMED {
            if ignored.contains(old) {
                ignored.insert(now);
            }
        }
        let mut lints: Vec<Lint> = found
            .into_iter()
            .filter(|f| !ignored.contains(f.lint.rule.as_str()))
            .filter(|f| {
                matches!(f.lint.rule.as_str(), "OxfordComma" | "NoOxfordComma")
                    || options.style
                    || !is_style(f.kind)
            })
            .map(|f| f.lint)
            // the checker sometimes reacts to the blanks left where markup was
            .filter(|l| l.range.is_empty() || !base[l.range.clone()].trim().is_empty())
            .map(|mut l| {
                l.fixable = source.get(l.range.clone()) == base.get(l.range.clone());
                l
            })
            .collect();
        lints.sort_by_key(|l| l.range.start);
        GrammarReport {
            lints,
            parts: parts.len(),
            done,
            failure: None,
        }
    }
}

/// A paragraph with no letters of another script: a Chinese term in English prose, or an emoji,
/// becomes spaces of the same byte length.
fn run_text(piece: &str) -> String {
    let mut text = String::with_capacity(piece.len());
    let mut last = 0;
    for m in OTHER_SCRIPT.find_iter(piece) {
        text.push_str(&piece[last..m.start()]);
        text.extend(std::iter::repeat_n(' ', m.len()));
        last = m.end();
    }
    text.push_str(&piece[last..]);
    text
}

fn fix(suggestion: Suggestion) -> Fix {
    match suggestion {
        Suggestion::ReplaceWith(chars) => Fix::Replace(chars.into_iter().collect()),
        Suggestion::InsertAfter(chars) => Fix::InsertAfter(chars.into_iter().collect()),
        Suggestion::Remove => Fix::Remove,
    }
}

#[cfg(test)]
mod tests;
