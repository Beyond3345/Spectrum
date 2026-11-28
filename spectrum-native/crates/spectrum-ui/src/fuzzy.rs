//! Fuzzy ranking for the command palette and Quick Open (nucleo's matcher, as Helix uses).

use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use std::ops::Range;

/// One candidate that matched: its index in the input, score, and the byte ranges that matched.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FuzzyMatch {
    pub index: usize,
    pub score: u32,
    pub ranges: Vec<Range<usize>>,
}

/// Ranks `items` against `query`, best first; equal scores keep the input order. An empty
/// query keeps every item in input order. `paths` scores `/`-separated names like file paths
/// (a match at the start of a file name ranks higher).
pub fn rank<S: AsRef<str>>(query: &str, items: &[S], paths: bool) -> Vec<FuzzyMatch> {
    let mut config = Config::DEFAULT;
    if paths {
        config.set_match_paths();
    }
    let mut matcher = Matcher::new(config);
    let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
    let (mut buf, mut indices) = (Vec::new(), Vec::new());
    let mut found: Vec<FuzzyMatch> = items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let text = item.as_ref();
            indices.clear();
            let score =
                pattern.indices(Utf32Str::new(text, &mut buf), &mut matcher, &mut indices)?;
            indices.sort_unstable();
            indices.dedup();
            Some(FuzzyMatch {
                index,
                score,
                ranges: byte_ranges(text, &indices),
            })
        })
        .collect();
    // stable, so ties stay in the order the caller gave (its own priority)
    found.sort_by_key(|m| std::cmp::Reverse(m.score));
    found
}

/// Character indices (as nucleo counts them) as merged byte ranges of `text`.
fn byte_ranges(text: &str, indices: &[u32]) -> Vec<Range<usize>> {
    let mut ranges: Vec<Range<usize>> = Vec::new();
    let mut wanted = indices.iter().copied().peekable();
    for (n, (start, ch)) in text.char_indices().enumerate() {
        let Some(&next) = wanted.peek() else { break };
        if u32::try_from(n).is_ok_and(|n| n == next) {
            wanted.next();
            let end = start + ch.len_utf8();
            match ranges.last_mut() {
                Some(last) if last.end == start => last.end = end,
                _ => ranges.push(start..end),
            }
        }
    }
    ranges
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_query_keeps_everything_in_order() {
        let found = rank("", &["b", "a"], false);
        assert_eq!(found.iter().map(|m| m.index).collect::<Vec<_>>(), [0, 1]);
    }

    #[test]
    fn ranks_tighter_matches_first_and_drops_misses() {
        let items = [
            "Toggle sidebar",
            "Show theme preview",
            "Quick open",
            "Show command palette",
        ];
        let found = rank("theme", &items, false);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].index, 1);
        assert_eq!(found[0].ranges, vec![5..10]);

        let found = rank("sh", &items, false);
        assert_eq!(found[0].index, 1, "word starts beat a scattered match");
        assert!(found.iter().all(|m| m.index != 2));
    }

    #[test]
    fn paths_prefer_file_names() {
        let items = [
            "diagrams/circuit.tex",
            "main.tex",
            "chapters/main-notes.tex",
        ];
        let found = rank("main", &items, true);
        assert_eq!(found[0].index, 1);
        assert_eq!(found.len(), 2);
    }

    #[test]
    fn ranges_are_bytes_for_non_ascii_text() {
        let found = rank("ér", &["thé rouge"], false);
        assert_eq!(found[0].ranges, [2..4, 5..6]);
        let text = "thé rouge";
        assert_eq!(&text[2..4], "é");
    }

    #[test]
    fn ties_keep_input_order() {
        let found = rank("a", &["xa", "ya"], false);
        assert_eq!(found.iter().map(|m| m.index).collect::<Vec<_>>(), [0, 1]);
    }
}
