//! Undo and redo as a stack of transactions, with typing grouped into words.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

use crate::buffer::Change;
use crate::selection::SelectionSet;

/// Keystrokes further apart than this start a new undo step.
pub const GROUP_INTERVAL: Duration = Duration::from_millis(400);

/// The oldest steps are forgotten past this many.
const MAX_UNDO: usize = 10_000;

/// What kind of edit a transaction is, which decides whether it joins the undo step before it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum EditKind {
    /// Typed text. Joins the typing before it until a pause or a new word.
    Insert,
    /// Backspace. Joins the backspaces before it until a pause.
    DeleteBackward,
    /// Forward delete. Joins the deletes before it until a pause.
    DeleteForward,
    /// Anything else (paste, a command, an AI edit): always an undo step of its own.
    #[default]
    Other,
}

/// One replacement, kept small: where, what went and what came.
#[derive(Clone, Debug)]
pub(crate) struct Step {
    pub(crate) start: usize,
    pub(crate) removed: String,
    pub(crate) inserted: String,
}

impl From<&Change> for Step {
    fn from(change: &Change) -> Self {
        Self {
            start: change.start,
            removed: change.removed.clone(),
            inserted: change.inserted.clone(),
        }
    }
}

/// One undo step: the replacements in the order they were made, and the selections around them.
#[derive(Clone, Debug)]
pub(crate) struct Entry {
    id: u64,
    pub(crate) steps: Vec<Step>,
    pub(crate) before: SelectionSet,
    pub(crate) after: SelectionSet,
    kind: EditKind,
    /// How many replacements one keystroke made (one per cursor).
    batch: usize,
    last_edit: Instant,
    ends_in_whitespace: bool,
}

#[derive(Debug, Default)]
pub(crate) struct History {
    undo: VecDeque<Entry>,
    redo: Vec<Entry>,
    last_id: u64,
    /// The id of the step the text stood at when the oldest kept step was made.
    floor_id: u64,
    saved_id: u64,
    /// The next transaction starts a new step whatever it is.
    sealed: bool,
    group_depth: usize,
    /// A group is open and has not recorded anything yet.
    group_is_new: bool,
}

impl History {
    pub(crate) fn record(
        &mut self,
        changes: &[Change],
        before: &SelectionSet,
        after: &SelectionSet,
        kind: EditKind,
        now: Instant,
    ) {
        self.redo.clear();
        let ends_in_whitespace = changes
            .first()
            .and_then(|c| c.inserted.chars().next_back())
            .is_some_and(char::is_whitespace);
        let in_group = self.group_depth > 0;
        let joins = if in_group {
            !self.group_is_new
        } else {
            self.joins_last(changes, before, kind, now, ends_in_whitespace)
        };
        match self.undo.back_mut() {
            Some(last) if joins => {
                last.steps.extend(changes.iter().map(Step::from));
                last.after = after.clone();
                last.last_edit = now;
                last.ends_in_whitespace = ends_in_whitespace;
            }
            _ => {
                self.last_id += 1;
                self.undo.push_back(Entry {
                    id: self.last_id,
                    steps: changes.iter().map(Step::from).collect(),
                    before: before.clone(),
                    after: after.clone(),
                    kind: if in_group { EditKind::Other } else { kind },
                    batch: changes.len(),
                    last_edit: now,
                    ends_in_whitespace,
                });
                if self.undo.len() > MAX_UNDO
                    && let Some(dropped) = self.undo.pop_front()
                {
                    self.floor_id = dropped.id;
                }
            }
        }
        self.sealed = false;
        self.group_is_new = false;
    }

    /// Typing joins the step before it when nothing came between: the same kind of edit, the
    /// cursors still where that step left them, within `GROUP_INTERVAL`, and not the first white
    /// space after a word.
    fn joins_last(
        &self,
        changes: &[Change],
        before: &SelectionSet,
        kind: EditKind,
        now: Instant,
        ends_in_whitespace: bool,
    ) -> bool {
        let Some(last) = self.undo.back() else {
            return false;
        };
        !self.sealed
            && kind != EditKind::Other
            && kind == last.kind
            && changes.len() == last.batch
            && *before == last.after
            && now.saturating_duration_since(last.last_edit) <= GROUP_INTERVAL
            && !(kind == EditKind::Insert && ends_in_whitespace && !last.ends_in_whitespace)
    }

    /// Makes the next transaction start a new undo step.
    pub(crate) fn seal(&mut self) {
        self.sealed = true;
    }

    /// Everything recorded until the matching `end_group` is one undo step. Groups nest.
    pub(crate) fn begin_group(&mut self) {
        if self.group_depth == 0 {
            self.group_is_new = true;
        }
        self.group_depth += 1;
    }

    pub(crate) fn end_group(&mut self) {
        self.group_depth = self.group_depth.saturating_sub(1);
        if self.group_depth == 0 {
            self.group_is_new = false;
            self.sealed = true;
        }
    }

    pub(crate) fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub(crate) fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    /// Moves the newest step to the redo stack and hands it out to be reversed.
    pub(crate) fn undo(&mut self) -> Option<&Entry> {
        let entry = self.undo.pop_back()?;
        self.sealed = true;
        self.redo.push(entry);
        self.redo.last()
    }

    /// Moves the newest undone step back and hands it out to be made again.
    pub(crate) fn redo(&mut self) -> Option<&Entry> {
        let entry = self.redo.pop()?;
        self.sealed = true;
        self.undo.push_back(entry);
        self.undo.back()
    }

    fn state_id(&self) -> u64 {
        self.undo.back().map_or(self.floor_id, |e| e.id)
    }

    pub(crate) fn mark_saved(&mut self) {
        self.saved_id = self.state_id();
        // typing on must not change the step the saved text stands at
        self.sealed = true;
    }

    pub(crate) fn is_dirty(&self) -> bool {
        self.state_id() != self.saved_id
    }
}
