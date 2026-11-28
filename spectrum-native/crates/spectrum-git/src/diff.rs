//! Line and word diffs for the editor and the Versions panel, through `similar`: hunks with byte ranges in
//! both texts, so a view paints them without diffing again.

use std::ops::Range;
use std::time::{Duration, Instant};

use similar::{Algorithm, ChangeTag, DiffOp, TextDiff};

/// Past this long a diff gives up looking for the smallest one and returns a coarser one (2.8's 2 s timeout).
const DEADLINE: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HunkKind {
    Added,
    Removed,
    Changed,
}

/// A run of words that changed inside a `Changed` hunk; the range is in the old text for `Removed`, in the
/// new text for `Added`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WordChange {
    pub kind: HunkKind,
    pub range: Range<usize>,
}

/// One change: old bytes and lines `old`/`old_lines` became new bytes and lines `new`/`new_lines`. An
/// added hunk has an empty old range at the place it goes in, a removed one an empty new range.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hunk {
    pub kind: HunkKind,
    pub old: Range<usize>,
    pub new: Range<usize>,
    pub old_lines: Range<usize>,
    pub new_lines: Range<usize>,
    /// Word-level changes, for `Changed` hunks only.
    pub words: Vec<WordChange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TextChanges {
    pub hunks: Vec<Hunk>,
    /// Lines added and removed in all.
    pub added: usize,
    pub removed: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileDiff {
    Text(TextChanges),
    /// Not UTF-8 text (or a NUL in it): only whether it changed.
    Binary {
        changed: bool,
    },
}

/// Byte offset where each line starts, plus the text's length at the end.
fn line_starts(lines: &[&str]) -> Vec<usize> {
    let mut starts = Vec::with_capacity(lines.len() + 1);
    let mut at = 0;
    starts.push(0);
    for line in lines {
        at += line.len();
        starts.push(at);
    }
    starts
}

fn words(old: &str, new: &str, old_base: usize, new_base: usize) -> Vec<WordChange> {
    let diff = TextDiff::configure()
        .algorithm(Algorithm::Myers)
        .deadline(Instant::now() + DEADLINE)
        .diff_words(old, new);
    let (mut o, mut n) = (old_base, new_base);
    let mut out: Vec<WordChange> = Vec::new();
    for change in diff.iter_all_changes() {
        let len = change.value().len();
        let (kind, range) = match change.tag() {
            ChangeTag::Equal => {
                o += len;
                n += len;
                continue;
            }
            ChangeTag::Delete => {
                o += len;
                (HunkKind::Removed, o - len..o)
            }
            ChangeTag::Insert => {
                n += len;
                (HunkKind::Added, n - len..n)
            }
        };
        match out.last_mut() {
            Some(last) if last.kind == kind && last.range.end == range.start => {
                last.range.end = range.end;
            }
            _ => out.push(WordChange { kind, range }),
        }
    }
    out
}

/// The line diff of two texts, with word changes inside each changed hunk.
pub fn diff_text(old: &str, new: &str) -> TextChanges {
    let diff = TextDiff::configure()
        .algorithm(Algorithm::Myers)
        .deadline(Instant::now() + DEADLINE)
        .diff_lines(old, new);
    let old_lines: Vec<&str> = diff.old_slices().to_vec();
    let new_lines: Vec<&str> = diff.new_slices().to_vec();
    let (os, ns) = (line_starts(&old_lines), line_starts(&new_lines));
    let mut out = TextChanges::default();
    for op in diff.ops() {
        let (kind, o, n) = match *op {
            DiffOp::Equal { .. } => continue,
            DiffOp::Delete {
                old_index,
                old_len,
                new_index,
            } => (
                HunkKind::Removed,
                old_index..old_index + old_len,
                new_index..new_index,
            ),
            DiffOp::Insert {
                old_index,
                new_index,
                new_len,
            } => (
                HunkKind::Added,
                old_index..old_index,
                new_index..new_index + new_len,
            ),
            DiffOp::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => (
                HunkKind::Changed,
                old_index..old_index + old_len,
                new_index..new_index + new_len,
            ),
        };
        let old_bytes = os[o.start]..os[o.end];
        let new_bytes = ns[n.start]..ns[n.end];
        out.added += n.len();
        out.removed += o.len();
        let words = if kind == HunkKind::Changed {
            words(
                &old[old_bytes.clone()],
                &new[new_bytes.clone()],
                old_bytes.start,
                new_bytes.start,
            )
        } else {
            Vec::new()
        };
        out.hunks.push(Hunk {
            kind,
            old: old_bytes,
            new: new_bytes,
            old_lines: o,
            new_lines: n,
            words,
        });
    }
    out
}

/// A file's diff from its bytes: text when both sides are UTF-8 without a NUL (as git tells binary).
pub fn diff_bytes(old: &[u8], new: &[u8]) -> FileDiff {
    fn text(b: &[u8]) -> Option<&str> {
        if b[..b.len().min(8000)].contains(&0) {
            None
        } else {
            std::str::from_utf8(b).ok()
        }
    }
    match (text(old), text(new)) {
        (Some(o), Some(n)) => FileDiff::Text(diff_text(o, n)),
        _ => FileDiff::Binary {
            changed: old != new,
        },
    }
}

/// How many lines a change added and removed (2.8's `countLines`).
pub(crate) fn count_lines(old: &str, new: &str) -> (usize, usize) {
    let d = diff_text(old, new);
    (d.added, d.removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hunks_carry_byte_ranges_and_words() {
        let old = "one\ntwo words here\nthree\n";
        let new = "zero\none\ntwo new words here\nthree\n";
        let d = diff_text(old, new);
        assert_eq!((d.added, d.removed), (2, 1));
        let added = &d.hunks[0];
        assert_eq!(added.kind, HunkKind::Added);
        assert_eq!(&new[added.new.clone()], "zero\n");
        assert_eq!(added.old, 0..0);
        let changed = &d.hunks[1];
        assert_eq!(changed.kind, HunkKind::Changed);
        assert_eq!(&old[changed.old.clone()], "two words here\n");
        assert_eq!(changed.old_lines, 1..2);
        assert_eq!(changed.new_lines, 2..3);
        let w: Vec<_> = changed
            .words
            .iter()
            .map(|w| (w.kind, &new[w.range.clone()]))
            .collect();
        assert_eq!(w, [(HunkKind::Added, "new ")]);
    }

    #[test]
    fn removed_lines_and_non_ascii() {
        let old = "α\nβ\nγ\n";
        let new = "α\nγ\n";
        let d = diff_text(old, new);
        assert_eq!(d.hunks.len(), 1);
        assert_eq!(d.hunks[0].kind, HunkKind::Removed);
        assert_eq!(&old[d.hunks[0].old.clone()], "β\n");
        assert_eq!(d.hunks[0].new, 3..3);
    }

    #[test]
    fn binary_files_only_say_whether_they_changed() {
        assert_eq!(
            diff_bytes(b"PNG\0a", b"PNG\0b"),
            FileDiff::Binary { changed: true }
        );
        assert_eq!(
            diff_bytes(b"\xff\xfe", b"\xff\xfe"),
            FileDiff::Binary { changed: false }
        );
        assert!(matches!(diff_bytes(b"a\n", b"b\n"), FileDiff::Text(_)));
    }

    #[test]
    fn a_change_in_a_line_without_newline() {
        let d = diff_text("a\nb", "a\nc");
        assert_eq!(d.hunks.len(), 1);
        assert_eq!(d.hunks[0].kind, HunkKind::Changed);
        assert_eq!(d.hunks[0].old, 2..3);
        assert_eq!(d.hunks[0].words.len(), 2);
    }
}
