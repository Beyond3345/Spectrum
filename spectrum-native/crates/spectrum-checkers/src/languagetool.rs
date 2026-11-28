//! A client for a configured LanguageTool server (`/v2/check`), ported from 2.8's
//! `languageToolService.js` check path. No LaTeX source is ever sent: each paragraph goes as a data
//! annotation, prose as text and markup as spaces read as what the masked prose has there. Starting
//! and downloading a local server is not this crate's job.

use std::ops::Range;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::harper::GrammarReport;
use crate::masking::{mask, paragraphs};
use crate::{DocKind, Fix, Lint, LintSource};

/// Paragraphs go in parts of at most this many UTF-16 units, so a check stops between them.
pub const PART_UNITS: usize = 20_000;
const PART_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Default)]
pub struct LanguageToolOptions {
    /// LanguageTool's language code (`de-DE`, `en-AU`).
    pub language: String,
    pub disabled_rules: Vec<String>,
    /// Hunspell spells this language, so LanguageTool's TYPOS category is left out.
    pub spelt: bool,
    /// Style suggestions on: LanguageTool's picky level.
    pub style: bool,
}

pub struct LanguageTool {
    client: reqwest::Client,
    server: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(untagged)]
enum Item {
    Text {
        text: String,
    },
    Markup {
        markup: String,
        #[serde(rename = "interpretAs")]
        interpret_as: String,
    },
}

/// One request: its annotation, and where each paragraph sits in it (UTF-16) and in the file (bytes).
struct Part {
    annotation: Vec<Item>,
    table: Vec<(usize, Range<usize>)>,
    units: usize,
}

#[derive(Deserialize)]
struct Answer {
    #[serde(default)]
    matches: Vec<Match>,
}

#[derive(Deserialize)]
struct Match {
    offset: usize,
    length: usize,
    #[serde(default)]
    message: String,
    #[serde(default)]
    replacements: Vec<Replacement>,
    rule: Option<Rule>,
}

#[derive(Deserialize)]
struct Replacement {
    #[serde(default)]
    value: String,
}

#[derive(Deserialize)]
struct Rule {
    id: String,
}

fn units(s: &str) -> usize {
    s.chars().map(char::len_utf16).sum()
}

fn is_punctuation(c: Option<char>) -> bool {
    matches!(c, Some('.' | ',' | ';' | ':' | '!' | '?' | ')' | ']'))
}

/// The annotation for `source[run]`, given the masked `prose` (same byte length). Every item is as
/// long in UTF-16 as the source it stands for, so offsets in the request are offsets in the file.
fn annotate(source: &str, prose: &str, run: Range<usize>) -> Vec<Item> {
    let mut items: Vec<Item> = Vec::new();
    let chars: Vec<(usize, char)> = source[run.clone()]
        .char_indices()
        .map(|(i, c)| (i + run.start, c))
        .collect();
    let same = |&(i, c): &(usize, char)| {
        prose
            .get(i..i + c.len_utf8())
            .is_some_and(|p| p.starts_with(c))
    };
    let mut k = 0;
    while k < chars.len() {
        let kept = same(&chars[k]);
        let mut j = k + 1;
        while j < chars.len() && same(&chars[j]) == kept {
            j += 1;
        }
        let (from, to) = (chars[k].0, chars.get(j).map_or(run.end, |c| c.0));
        if kept {
            items.push(Item::Text {
                text: source[from..to].to_owned(),
            });
        } else {
            // what the prose has there, each run of whitespace one space
            let mut read = String::new();
            for c in prose.get(from..to).unwrap_or_default().chars() {
                if !c.is_whitespace() {
                    read.push(c);
                } else if !read.ends_with(' ') {
                    read.push(' ');
                }
            }
            let last = items.last().and_then(|item| match item {
                Item::Text { text } => text.chars().last(),
                Item::Markup { interpret_as, .. } => interpret_as.chars().last(),
            });
            if last.is_none_or(char::is_whitespace) {
                read = read.trim_start().to_string();
            }
            let next = chars.get(j).map(|c| c.1);
            if next.is_none_or(char::is_whitespace) || is_punctuation(next) {
                read.truncate(read.trim_end().len());
            }
            let mut length = units(&source[from..to]);
            // a citation just before punctuation takes the space before it too ("bread \cite{k}.")
            if read.is_empty()
                && is_punctuation(next)
                && let Some(Item::Text { text }) = items.last_mut()
            {
                let space = text.len() - text.trim_end_matches([' ', '\t']).len();
                if space > 0 {
                    text.truncate(text.len() - space);
                    length += space;
                    if text.is_empty() {
                        items.pop();
                    }
                }
            }
            items.push(Item::Markup {
                markup: " ".repeat(length),
                interpret_as: read,
            });
        }
        k = j;
    }
    items
}

fn item_units(item: &Item) -> usize {
    match item {
        Item::Text { text } => units(text),
        Item::Markup { markup, .. } => markup.len(),
    }
}

/// The runs cut into parts of at most `limit` UTF-16 units, at the end of a run.
fn parts(source: &str, prose: &str, runs: &[Range<usize>], limit: usize) -> Vec<Part> {
    let mut out: Vec<Part> = Vec::new();
    for run in runs {
        let size = units(&source[run.clone()]);
        let fits = out.last().is_some_and(|p| p.units + size + 2 <= limit);
        if fits {
            if let Some(part) = out.last_mut() {
                part.annotation.push(Item::Markup {
                    markup: "\n\n".to_owned(),
                    interpret_as: "\n\n".to_owned(),
                });
                part.units += 2;
            }
        } else {
            out.push(Part {
                annotation: Vec::new(),
                table: Vec::new(),
                units: 0,
            });
        }
        if let Some(part) = out.last_mut() {
            part.table.push((part.units, run.clone()));
            for item in annotate(source, prose, run.clone()) {
                part.units += item_units(&item);
                part.annotation.push(item);
            }
        }
    }
    out
}

/// The byte offset `units` UTF-16 units into `s` from byte `from`.
fn byte_at(s: &str, from: usize, units: usize) -> usize {
    let mut left = units;
    for (i, c) in s[from..].char_indices() {
        if left == 0 {
            return from + i;
        }
        left = left.saturating_sub(c.len_utf16());
    }
    s.len()
}

/// A match's request offsets as a file byte range, or None where it crosses from one run into another.
fn to_file(
    source: &str,
    table: &[(usize, Range<usize>)],
    offset: usize,
    length: usize,
) -> Option<Range<usize>> {
    let (data, run) = table.iter().find(|(data, run)| {
        offset >= *data && offset + length <= data + units(&source[run.clone()])
    })?;
    let from = byte_at(source, run.start, offset - data);
    Some(from..byte_at(source, from, length))
}

impl LanguageTool {
    /// A client for the server at `server` (as `http://127.0.0.1:8081`, no trailing `/v2`).
    pub fn new(server: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            server: server.into().trim_end_matches('/').to_owned(),
        }
    }

    /// `source`'s issues in `options.language`, masked as `kind`, part by part. Stops between parts
    /// once `cancel` is set (dropping the future stops the part in flight too). A failure ends the
    /// check with what was found so far and a message in `failure`.
    pub async fn check(
        &self,
        source: &str,
        kind: DocKind,
        options: &LanguageToolOptions,
        cancel: &AtomicBool,
    ) -> GrammarReport {
        let prose = mask(source, kind);
        let chunks = parts(source, &prose, &paragraphs(&prose), PART_UNITS);
        let mut report = GrammarReport {
            parts: chunks.len(),
            ..GrammarReport::default()
        };
        for part in &chunks {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let answer = match self.ask(part, options).await {
                Ok(answer) => answer,
                Err(message) => {
                    tracing::warn!(%message, "LanguageTool check failed");
                    report.failure = Some(message);
                    break;
                }
            };
            for m in answer.matches {
                let Some(range) = to_file(source, &part.table, m.offset, m.length) else {
                    continue;
                };
                report.lints.push(Lint {
                    fixable: source.get(range.clone()) == prose.get(range.clone()),
                    range,
                    message: m.message,
                    suggestions: m
                        .replacements
                        .into_iter()
                        .take(5)
                        .map(|r| Fix::Replace(r.value))
                        .collect(),
                    source: LintSource::Grammar,
                    rule: m.rule.map_or_else(|| "LANGUAGETOOL".to_owned(), |r| r.id),
                });
            }
            report.done += 1;
        }
        report.lints.sort_by_key(|l| l.range.start);
        report
    }

    async fn ask(&self, part: &Part, options: &LanguageToolOptions) -> Result<Answer, String> {
        let data = serde_json::json!({ "annotation": part.annotation }).to_string();
        let mut form = vec![("data", data), ("language", options.language.clone())];
        if !options.disabled_rules.is_empty() {
            form.push(("disabledRules", options.disabled_rules.join(",")));
        }
        if options.spelt {
            form.push(("disabledCategories", "TYPOS".to_owned()));
        }
        if options.style {
            form.push(("level", "picky".to_owned()));
        }
        let response = self
            .client
            .post(format!("{}/v2/check", self.server))
            .form(&form)
            .timeout(PART_TIMEOUT)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    "LanguageTool took too long to answer.".to_owned()
                } else {
                    "LanguageTool stopped before it finished.".to_owned()
                }
            })?;
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|_| "LanguageTool stopped before it finished.".to_owned())?;
        if !status.is_success() {
            let detail: String = body.chars().take(200).collect();
            return Err(format!(
                "LanguageTool couldn’t check this ({}: {}).",
                status.as_u16(),
                detail.trim()
            ));
        }
        serde_json::from_str(&body)
            .map_err(|_| "LanguageTool gave an answer Spectrum couldn’t read.".to_owned())
    }
}

#[cfg(test)]
mod tests;
