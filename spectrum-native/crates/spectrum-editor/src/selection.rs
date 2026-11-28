//! Cursors and selections: one or many, kept sorted and merged.

use std::ops::Range;

use crate::buffer::{Bias, Buffer, Change};

/// A selection from where it was started (`anchor`) to where the cursor is (`head`), as byte
/// offsets. A plain cursor has both at the same place.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct Selection {
    pub anchor: usize,
    pub head: usize,
}

impl Selection {
    pub fn new(anchor: usize, head: usize) -> Self {
        Self { anchor, head }
    }

    pub fn cursor(at: usize) -> Self {
        Self::new(at, at)
    }

    pub fn start(&self) -> usize {
        self.anchor.min(self.head)
    }

    pub fn end(&self) -> usize {
        self.anchor.max(self.head)
    }

    pub fn range(&self) -> Range<usize> {
        self.start()..self.end()
    }

    pub fn is_empty(&self) -> bool {
        self.anchor == self.head
    }

    /// Whether the cursor is at the start, as after selecting backwards.
    pub fn is_reversed(&self) -> bool {
        self.head < self.anchor
    }

    /// The same span with the cursor at the end, or at the start when `reversed`.
    fn spanning(range: Range<usize>, reversed: bool) -> Self {
        if reversed {
            Self::new(range.end, range.start)
        } else {
            Self::new(range.start, range.end)
        }
    }

    /// Two selections are one when they overlap, or touch and one of them is a bare cursor.
    fn joins(&self, next: &Self) -> bool {
        next.start() < self.end()
            || (next.start() == self.end() && (self.is_empty() || next.is_empty()))
    }
}

/// One or more selections, sorted by position, none overlapping. One of them is the primary: the
/// one the view scrolls to and the IME composes at.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelectionSet {
    selections: Vec<Selection>,
    primary: usize,
}

impl Default for SelectionSet {
    fn default() -> Self {
        Self::cursor(0)
    }
}

impl From<Selection> for SelectionSet {
    fn from(selection: Selection) -> Self {
        Self {
            selections: vec![selection],
            primary: 0,
        }
    }
}

impl SelectionSet {
    pub fn cursor(at: usize) -> Self {
        Selection::cursor(at).into()
    }

    /// Sorts and merges `selections`; `primary` is an index into them as given. No selections at
    /// all gives a cursor at the start.
    pub fn new(selections: Vec<Selection>, primary: usize) -> Self {
        if selections.is_empty() {
            return Self::default();
        }
        let mut set = Self {
            primary: primary.min(selections.len() - 1),
            selections,
        };
        set.normalise();
        set
    }

    /// Adds a selection and makes it the primary.
    pub fn add(&mut self, selection: Selection) {
        self.selections.push(selection);
        self.primary = self.selections.len() - 1;
        self.normalise();
    }

    /// Drops every selection but the primary.
    pub fn collapse_to_primary(&mut self) {
        *self = self.primary().into();
    }

    pub fn primary(&self) -> Selection {
        self.selections[self.primary]
    }

    pub fn primary_index(&self) -> usize {
        self.primary
    }

    pub fn as_slice(&self) -> &[Selection] {
        &self.selections
    }

    pub fn iter(&self) -> std::slice::Iter<'_, Selection> {
        self.selections.iter()
    }

    /// Never 0.
    #[allow(clippy::len_without_is_empty)]
    pub fn len(&self) -> usize {
        self.selections.len()
    }

    /// Brings every end inside the buffer and onto a character boundary.
    pub fn clip(&mut self, buffer: &Buffer) {
        for s in &mut self.selections {
            *s = Selection::new(buffer.clip(s.anchor), buffer.clip(s.head));
        }
        self.normalise();
    }

    /// The selections after `changes`, which were made one after another. A cursor moves past
    /// text inserted at it; a selection does not grow when text is inserted at either edge, and
    /// one whose text was removed becomes a cursor.
    #[must_use]
    pub fn map(&self, changes: &[Change]) -> Self {
        let mut set = self.clone();
        for s in &mut set.selections {
            let empty = s.is_empty();
            let (mut start, mut end) = (s.start(), s.end());
            for change in changes {
                start = change.map_offset(start, Bias::Right);
                end = change.map_offset(end, if empty { Bias::Right } else { Bias::Left });
            }
            *s = Selection::spanning(start..end.max(start), s.is_reversed());
        }
        set.normalise();
        set
    }

    fn normalise(&mut self) {
        let mut sorted: Vec<(Selection, bool)> = self
            .selections
            .iter()
            .enumerate()
            .map(|(i, s)| (*s, i == self.primary))
            .collect();
        sorted.sort_by_key(|(s, _)| (s.start(), s.end()));
        self.selections.clear();
        let mut primary = None;
        for (next, is_primary) in sorted {
            match self.selections.last_mut() {
                Some(last) if last.joins(&next) => {
                    // the primary's direction wins, then the earlier selection's
                    let reversed = if is_primary {
                        next.is_reversed()
                    } else {
                        last.is_reversed()
                    };
                    let span = last.start()..last.end().max(next.end());
                    *last = Selection::spanning(span, reversed);
                }
                _ => self.selections.push(next),
            }
            if is_primary {
                primary = Some(self.selections.len() - 1);
            }
        }
        self.primary = primary.unwrap_or(0);
    }
}

impl<'a> IntoIterator for &'a SelectionSet {
    type Item = &'a Selection;
    type IntoIter = std::slice::Iter<'a, Selection>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{Document, Edit, Transaction};
    use std::time::Instant;

    fn sel(anchor: usize, head: usize) -> Selection {
        Selection::new(anchor, head)
    }

    fn spans(set: &SelectionSet) -> Vec<(usize, usize)> {
        set.iter().map(|s| (s.anchor, s.head)).collect()
    }

    #[test]
    fn a_selection_knows_its_direction() {
        let s = sel(8, 3);
        assert_eq!((s.start(), s.end(), s.range()), (3, 8, 3..8));
        assert!(s.is_reversed() && !s.is_empty());
        assert!(Selection::cursor(4).is_empty());
    }

    #[test]
    fn selections_are_sorted_and_the_primary_is_followed() {
        let set = SelectionSet::new(vec![sel(20, 25), sel(0, 3), sel(10, 12)], 0);
        assert_eq!(spans(&set), [(0, 3), (10, 12), (20, 25)]);
        assert_eq!(set.primary(), sel(20, 25));
        assert_eq!(set.primary_index(), 2);
        assert_eq!(SelectionSet::new(vec![], 3), SelectionSet::cursor(0));
    }

    #[test]
    fn overlapping_selections_merge() {
        let set = SelectionSet::new(vec![sel(0, 5), sel(3, 9), sel(8, 12), sel(20, 22)], 3);
        assert_eq!(spans(&set), [(0, 12), (20, 22)]);
        assert_eq!(set.primary(), sel(20, 22));
        // one inside another
        let set = SelectionSet::new(vec![sel(0, 10), sel(2, 4)], 1);
        assert_eq!(spans(&set), [(0, 10)]);
        assert_eq!(set.primary_index(), 0);
    }

    #[test]
    fn touching_selections_stay_apart_but_a_cursor_on_an_edge_merges() {
        let set = SelectionSet::new(vec![sel(0, 5), sel(5, 8)], 0);
        assert_eq!(set.len(), 2);
        let set = SelectionSet::new(vec![sel(0, 5), sel(5, 5)], 0);
        assert_eq!(spans(&set), [(0, 5)]);
        let set = SelectionSet::new(vec![sel(5, 5), sel(5, 8)], 0);
        assert_eq!(spans(&set), [(5, 8)]);
        // two cursors in one place are one cursor
        let set = SelectionSet::new(vec![sel(4, 4), sel(4, 4), sel(9, 9)], 1);
        assert_eq!(spans(&set), [(4, 4), (9, 9)]);
        assert_eq!(set.primary_index(), 0);
    }

    #[test]
    fn a_merge_keeps_the_primarys_direction() {
        let set = SelectionSet::new(vec![sel(0, 6), sel(9, 4)], 1);
        assert_eq!(spans(&set), [(9, 0)]);
        let set = SelectionSet::new(vec![sel(0, 6), sel(9, 4)], 0);
        assert_eq!(spans(&set), [(0, 9)]);
    }

    #[test]
    fn add_makes_the_new_selection_primary_and_merges() {
        let mut set = SelectionSet::cursor(10);
        set.add(sel(2, 4));
        assert_eq!(spans(&set), [(2, 4), (10, 10)]);
        assert_eq!(set.primary(), sel(2, 4));
        set.add(sel(12, 3));
        assert_eq!(spans(&set), [(12, 2)]);
        set.add(sel(30, 30));
        set.collapse_to_primary();
        assert_eq!(spans(&set), [(30, 30)]);
    }

    #[test]
    fn clip_brings_selections_onto_characters_inside_the_text() {
        let buffer = Buffer::from_text("a😀b");
        let mut set = SelectionSet::new(vec![sel(0, 3), sel(4, 99), sel(200, 200)], 0);
        set.clip(&buffer);
        assert_eq!(spans(&set), [(0, 1), (1, 6)]);
    }

    #[test]
    fn selections_follow_edits_made_elsewhere() {
        let mut doc = Document::from_text("0123456789");
        let set = SelectionSet::new(vec![sel(2, 2), sel(4, 7), sel(9, 8)], 1);
        // insert at the cursor, at both edges of the selection, and delete across the last one
        let tx = Transaction::new(vec![
            Edit::new(2..2, "ab"),
            Edit::new(4..4, "<"),
            Edit::new(7..7, ">"),
            Edit::new(8..10, ""),
        ]);
        let applied = doc.apply(tx, &set, Instant::now());
        assert_eq!(doc.buffer().text(), "01ab23<456>7");
        assert_eq!(spans(&applied.selections), [(4, 4), (7, 10), (12, 12)]);
        assert_eq!(set.map(&applied.changes), applied.selections);
    }
}
