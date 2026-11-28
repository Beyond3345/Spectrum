//! A document: the buffer plus its undo history. Every change goes through a transaction.
//!
//! Selections belong to a view, not to the document, so two panes can show one document. A
//! transaction is handed the view's selections and gives back the new ones.

use std::ops::Range;
use std::time::Instant;

use crate::buffer::{Buffer, Change, LineEnding, normalise};
use crate::history::{EditKind, History};
use crate::selection::{Selection, SelectionSet};

/// One replacement asked for: a byte range of the document as it is before the transaction, and
/// the text to put there.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Edit {
    range: Range<usize>,
    text: String,
}

impl Edit {
    /// CRLF and lone CR in `text` become LF.
    pub fn new(range: Range<usize>, text: &str) -> Self {
        Self {
            range,
            text: normalise(text).into_owned(),
        }
    }

    pub fn range(&self) -> Range<usize> {
        self.range.clone()
    }

    pub fn text(&self) -> &str {
        &self.text
    }
}

/// A set of edits made together and undone together.
#[derive(Clone, Debug, Default)]
pub struct Transaction {
    edits: Vec<Edit>,
    selections: Option<SelectionSet>,
    kind: EditKind,
}

impl Transaction {
    /// `edits` are all in the coordinates of the document before the transaction and must not
    /// overlap; they may come in any order.
    pub fn new(edits: Vec<Edit>) -> Self {
        Self {
            edits,
            ..Self::default()
        }
    }

    /// Types `text` over every selection and leaves a cursor after each insertion.
    /// The selections must lie on characters inside the document ([`SelectionSet::clip`]).
    pub fn insert(selections: &SelectionSet, text: &str) -> Self {
        let text = normalise(text);
        let mut cursors = Vec::with_capacity(selections.len());
        let mut edits = Vec::with_capacity(selections.len());
        let mut end = 0;
        let mut old_end = 0;
        for s in selections {
            // `end` follows the text as it will be: what lies between two selections is kept
            end += s.start() - old_end + text.len();
            old_end = s.end();
            cursors.push(Selection::cursor(end));
            edits.push(Edit {
                range: s.range(),
                text: text.to_string(),
            });
        }
        Self {
            edits,
            selections: Some(SelectionSet::new(cursors, selections.primary_index())),
            kind: EditKind::Insert,
        }
    }

    /// The selections to leave behind. Without this they are the current ones, moved by the edits.
    #[must_use]
    pub fn with_selections(mut self, selections: SelectionSet) -> Self {
        self.selections = Some(selections);
        self
    }

    #[must_use]
    pub fn with_kind(mut self, kind: EditKind) -> Self {
        self.kind = kind;
        self
    }
}

/// What a transaction, an undo or a redo did.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Applied {
    /// The replacements in the order they were made; each describes the buffer as it was just
    /// before it. Feed them in this order to the syntax tree and the language server.
    pub changes: Vec<Change>,
    /// The selections the view should now show.
    pub selections: SelectionSet,
}

#[derive(Debug, Default)]
pub struct Document {
    buffer: Buffer,
    history: History,
}

impl Document {
    pub fn new() -> Self {
        Self::default()
    }

    /// Takes a file's text. It counts as saved, with nothing to undo.
    pub fn from_text(text: &str) -> Self {
        Self {
            buffer: Buffer::from_text(text),
            history: History::default(),
        }
    }

    pub fn buffer(&self) -> &Buffer {
        &self.buffer
    }

    /// See [`Buffer::version`].
    pub fn version(&self) -> u64 {
        self.buffer.version()
    }

    pub fn set_line_ending(&mut self, line_ending: LineEnding) {
        self.buffer.set_line_ending(line_ending);
    }

    /// Makes a transaction's edits. `selections` are the view's current ones, which undo brings
    /// back. A transaction that changes nothing leaves the history alone.
    pub fn apply(&mut self, tx: Transaction, selections: &SelectionSet, now: Instant) -> Applied {
        let mut edits = tx.edits;
        edits.sort_by_key(|e| (e.range.start, e.range.end));
        let mut changes = Vec::with_capacity(edits.len());
        let mut next_start = usize::MAX;
        // last edit first, so the ranges of the edits still to come stay true
        for edit in edits.into_iter().rev() {
            let range = self.buffer.clip_range(edit.range);
            if range.end > next_start {
                tracing::error!(?range, "dropped an edit that overlaps the next one");
                continue;
            }
            next_start = range.start;
            if range.is_empty() && edit.text.is_empty() {
                continue;
            }
            changes.push(self.buffer.replace(range, &edit.text));
        }
        let after = tx.selections.unwrap_or_else(|| selections.map(&changes));
        if !changes.is_empty() {
            self.history
                .record(&changes, selections, &after, tx.kind, now);
        }
        Applied {
            changes,
            selections: after,
        }
    }

    /// Takes back the newest undo step. `None` when there is nothing to undo.
    pub fn undo(&mut self) -> Option<Applied> {
        let entry = self.history.undo()?;
        let changes = entry
            .steps
            .iter()
            .rev()
            .map(|s| replay(&mut self.buffer, s.start, &s.inserted, &s.removed))
            .collect();
        Some(Applied {
            changes,
            selections: entry.before.clone(),
        })
    }

    /// Makes the newest undone step again. `None` when there is nothing to redo.
    pub fn redo(&mut self) -> Option<Applied> {
        let entry = self.history.redo()?;
        let changes = entry
            .steps
            .iter()
            .map(|s| replay(&mut self.buffer, s.start, &s.removed, &s.inserted))
            .collect();
        Some(Applied {
            changes,
            selections: entry.after.clone(),
        })
    }

    pub fn can_undo(&self) -> bool {
        self.history.can_undo()
    }

    pub fn can_redo(&self) -> bool {
        self.history.can_redo()
    }

    /// Makes the next transaction start a new undo step, as a click or a focus change should.
    pub fn break_undo_group(&mut self) {
        self.history.seal();
    }

    /// Everything applied until the matching [`Self::end_undo_group`] is one undo step: an IME
    /// composition, a snippet, a replace-all. Groups nest.
    pub fn begin_undo_group(&mut self) {
        self.history.begin_group();
    }

    pub fn end_undo_group(&mut self) {
        self.history.end_group();
    }

    /// The text as it is now is what is on disk.
    pub fn mark_saved(&mut self) {
        self.history.mark_saved();
    }

    /// Whether the text differs from what was last saved. Undoing back to the saved text is clean.
    pub fn is_dirty(&self) -> bool {
        self.history.is_dirty()
    }
}

/// Puts `put` where `take` stands at `start`.
fn replay(buffer: &mut Buffer, start: usize, take: &str, put: &str) -> Change {
    buffer.replace(start..start + take.len(), put)
}

#[cfg(test)]
mod tests;
