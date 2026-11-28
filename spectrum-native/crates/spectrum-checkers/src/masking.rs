//! Markup to plain prose for the spell and grammar checkers, ported from 2.8's `latex/mask.js`.
//! Markup, maths, comments, keys and code become spaces, every byte of a character becoming one
//! space, so a byte offset in the result is the same byte offset in the source and newlines stay
//! where they were. Prose inside `\section`, `\emph`, `#emph[…]`, link text and the like is kept.

mod latex;
mod markdown;
mod typst;

use std::ops::Range;
use std::sync::LazyLock;

use regex::Regex;

use crate::DocKind;

/// `source` with its markup blanked, the same length in bytes. Plain text comes back unchanged.
pub fn mask(source: &str, kind: DocKind) -> String {
    match kind {
        DocKind::Latex => latex::mask(source),
        DocKind::Typst => typst::mask(source),
        DocKind::Markdown => markdown::mask(source),
        DocKind::Plain => source.to_owned(),
    }
}

// letters of the scripts written without spaces between words make no words: a run of them is a
// sentence, not a word Hunspell could check
const LETTER: &str =
    r"[\p{L}\p{M}--[\p{Han}\p{Hiragana}\p{Katakana}\p{Thai}\p{Lao}\p{Khmer}\p{Myanmar}]]+";
static WORD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(&format!("{LETTER}(?:['’]{LETTER})*")).unwrap_or_else(|_| never()));

/// The words of masked prose for the spell checker, as byte ranges (an apostrophe joins letters).
pub fn prose_words(masked: &str) -> Vec<Range<usize>> {
    WORD.find_iter(masked).map(|m| m.range()).collect()
}

static PARAGRAPH_BREAK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\n[ \t\r]*\n").unwrap_or_else(|_| never()));
static LETTER_OR_DIGIT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\p{L}\p{N}]").unwrap_or_else(|_| never()));

/// The masked prose cut into paragraphs at blank lines, leaving out those with no letters or digits.
pub(crate) fn paragraphs(prose: &str) -> Vec<Range<usize>> {
    let mut cuts = vec![0];
    cuts.extend(PARAGRAPH_BREAK.find_iter(prose).map(|m| m.start() + 1));
    cuts.push(prose.len());
    cuts.windows(2)
        .map(|w| w[0]..w[1])
        .filter(|r| LETTER_OR_DIGIT.is_match(&prose[r.clone()]))
        .collect()
}

/// A regex that matches nothing, for a pattern that failed to compile (they are constants, tested).
pub(crate) fn never() -> Regex {
    Regex::new(r"[^\s\S]").unwrap_or_else(|_| unreachable!("a constant pattern"))
}

/// The output being built: a copy of the source whose bytes are blanked in place.
pub(crate) struct Out(Vec<u8>);

impl Out {
    fn new(source: &str) -> Self {
        Self(source.as_bytes().to_vec())
    }

    /// Spaces over `from..to`, newlines kept.
    fn blank(&mut self, from: usize, to: usize) {
        let to = to.min(self.0.len());
        for b in self.0.iter_mut().take(to).skip(from) {
            if *b != b'\n' {
                *b = b' ';
            }
        }
    }

    fn finish(self) -> String {
        // every blanked range starts and ends at an ASCII byte or an end, so this is UTF-8; should a
        // bug ever split a character, its stray bytes go too rather than shifting any offset
        String::from_utf8(self.0).unwrap_or_else(|e| {
            e.into_bytes()
                .into_iter()
                .map(|b| if b < 0x80 { char::from(b) } else { ' ' })
                .collect()
        })
    }
}

/// The byte at `i`, or 0 past the end (JavaScript's `s[i]` being undefined).
fn at(s: &[u8], i: usize) -> u8 {
    s.get(i).copied().unwrap_or(0)
}

/// Index of `needle` at or after `from`.
fn find(s: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if from > s.len() {
        return None;
    }
    s[from..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|p| p + from)
}

fn find_byte(s: &[u8], byte: u8, from: usize) -> Option<usize> {
    s.get(from..)?
        .iter()
        .position(|&b| b == byte)
        .map(|p| p + from)
}

/// Index of the newline at or after `i`, or the end.
fn line_end(s: &[u8], i: usize) -> usize {
    find_byte(s, b'\n', i).unwrap_or(s.len())
}

/// Whether everything between the start of `i`'s line and `i` is spaces or tabs.
fn at_line_start(s: &[u8], i: usize) -> bool {
    s[..i]
        .iter()
        .rev()
        .take_while(|&&b| b != b'\n')
        .all(|&b| b == b' ' || b == b'\t')
}

/// The byte length of the UTF-8 character whose first byte is `b`.
fn char_len(b: u8) -> usize {
    match b {
        0xF0.. => 4,
        0xE0.. => 3,
        0xC0.. => 2,
        _ => 1,
    }
}

/// Index just past the URL starting at `i`: up to whitespace, `)`, `]` or `>`.
fn url_stop(s: &[u8], i: usize, end: usize) -> usize {
    let mut j = i;
    while j < end
        && !matches!(
            s[j],
            b' ' | b'\t' | b'\n' | b'\r' | 0x0B | 0x0C | b')' | b']' | b'>'
        )
    {
        j += 1;
    }
    j
}

fn starts_url(s: &[u8], i: usize) -> bool {
    s[i..].starts_with(b"http://") || s[i..].starts_with(b"https://")
}

/// Index just past the raw text (or fenced block) whose backticks start at `i`.
fn raw_stop(s: &[u8], i: usize, end: usize) -> usize {
    let run = s[i..].iter().take_while(|&&b| b == b'`').count();
    find(s, &s[i..i + run], i + run).map_or(end, |close| end.min(close + run))
}

/// Index just past `$…$` or `$$…$$` starting at `i` (a `\$` doesn't close).
fn math_stop(s: &[u8], i: usize, end: usize) -> usize {
    let delim: &[u8] = if at(s, i + 1) == b'$' { b"$$" } else { b"$" };
    let mut j = i + delim.len();
    while j < end && !(s[j..].starts_with(delim) && s[j - 1] != b'\\') {
        j += 1;
    }
    end.min(j + delim.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn words(masked: &str) -> Vec<&str> {
        prose_words(masked)
            .into_iter()
            .map(|r| &masked[r])
            .collect()
    }

    pub(super) fn same_shape(source: &str, masked: &str) {
        assert_eq!(masked.len(), source.len(), "same length");
        let newlines = |s: &str| s.match_indices('\n').map(|(i, _)| i).collect::<Vec<_>>();
        assert_eq!(newlines(masked), newlines(source), "newlines in place");
    }

    #[test]
    fn runs_of_chinese_japanese_and_thai_make_no_words() {
        let text = "我们研究了这个问题的历史与发展。We tested it. 日本語の文章です。ภาษาไทยไม่มีช่องว่าง 한국어 문장 😀 don’t";
        assert_eq!(
            words(text),
            ["We", "tested", "it", "한국어", "문장", "don’t"]
        );
        let tex = "\\begin{document}\n研究結果顯示 the colour\\end{document}";
        assert_eq!(words(&mask(tex, DocKind::Latex)), ["the", "colour"]);
    }

    #[test]
    fn paragraphs_split_at_blank_lines_and_skip_empty_ones() {
        let prose = "One two.\nthree\n\n   \n\nFour.\n\n%%\n";
        let found: Vec<&str> = paragraphs(prose).into_iter().map(|r| &prose[r]).collect();
        assert_eq!(found, ["One two.\nthree\n", "\nFour.\n"]);
    }
}
