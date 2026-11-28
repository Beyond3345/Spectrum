use std::time::Duration;

use super::*;
use crate::history::GROUP_INTERVAL;

/// A document with one view's selections and a clock, typed into the way a person would.
struct Typist {
    doc: Document,
    sel: SelectionSet,
    now: Instant,
}

impl Typist {
    fn new(text: &str, at: usize) -> Self {
        Self {
            doc: Document::from_text(text),
            sel: SelectionSet::cursor(at),
            now: Instant::now(),
        }
    }

    fn wait(&mut self, ms: u64) {
        self.now += Duration::from_millis(ms);
    }

    /// Types `text` one character at a time, 50 ms apart.
    fn type_text(&mut self, text: &str) {
        for c in text.chars() {
            self.wait(50);
            let tx = Transaction::insert(&self.sel, &c.to_string());
            self.sel = self.doc.apply(tx, &self.sel, self.now).selections;
        }
    }

    fn backspace(&mut self) {
        self.wait(50);
        let edits = self
            .sel
            .iter()
            .map(|s| Edit::new(s.head.saturating_sub(1)..s.head, ""))
            .collect();
        let tx = Transaction::new(edits).with_kind(EditKind::DeleteBackward);
        self.sel = self.doc.apply(tx, &self.sel, self.now).selections;
    }

    fn undo(&mut self) -> bool {
        let Some(applied) = self.doc.undo() else {
            return false;
        };
        self.sel = applied.selections;
        true
    }

    fn redo(&mut self) -> bool {
        let Some(applied) = self.doc.redo() else {
            return false;
        };
        self.sel = applied.selections;
        true
    }

    fn text(&self) -> String {
        self.doc.buffer().text()
    }

    fn cursors(&self) -> Vec<usize> {
        self.sel.iter().map(|s| s.head).collect()
    }
}

#[test]
fn an_empty_document_has_nothing_to_undo() {
    let mut doc = Document::new();
    assert!(!doc.can_undo() && !doc.can_redo() && !doc.is_dirty());
    assert!(doc.undo().is_none() && doc.redo().is_none());
    assert_eq!(doc.version(), 0);
    // a transaction that changes nothing is not an undo step
    let sel = SelectionSet::cursor(0);
    let applied = doc.apply(Transaction::insert(&sel, ""), &sel, Instant::now());
    assert_eq!(applied.changes, vec![]);
    assert!(!doc.can_undo() && doc.version() == 0);
}

#[test]
fn typing_is_undone_a_word_at_a_time() {
    let mut t = Typist::new("", 0);
    t.type_text("hello world again");
    assert_eq!(
        (t.text().as_str(), t.cursors()),
        ("hello world again", vec![17])
    );
    assert!(t.undo());
    assert_eq!((t.text().as_str(), t.cursors()), ("hello world", vec![11]));
    assert!(t.undo());
    assert_eq!((t.text().as_str(), t.cursors()), ("hello", vec![5]));
    assert!(t.undo());
    assert_eq!((t.text().as_str(), t.cursors()), ("", vec![0]));
    assert!(!t.undo());
    assert!(t.redo() && t.redo());
    assert_eq!((t.text().as_str(), t.cursors()), ("hello world", vec![11]));
    assert!(t.redo() && !t.redo());
    assert_eq!(t.text(), "hello world again");
}

#[test]
fn a_pause_longer_than_the_interval_starts_a_new_step() {
    let mut t = Typist::new("", 0);
    t.type_text("abc");
    t.now += GROUP_INTERVAL + Duration::from_millis(1);
    t.type_text("def");
    assert!(t.undo());
    // the pause came before `d`: `d` waited 50 ms more than the interval
    assert_eq!(t.text(), "abc");

    // exactly the interval still joins
    let mut t = Typist::new("", 0);
    t.type_text("abc");
    assert_eq!(GROUP_INTERVAL, Duration::from_millis(400));
    t.wait(350);
    t.type_text("d");
    assert!(t.undo());
    assert_eq!(t.text(), "");
}

#[test]
fn moving_the_cursor_or_changing_the_kind_of_edit_starts_a_new_step() {
    let mut t = Typist::new("", 0);
    t.type_text("abcd");
    t.sel = SelectionSet::cursor(2);
    t.type_text("XY");
    assert_eq!(t.text(), "abXYcd");
    assert!(t.undo());
    assert_eq!((t.text().as_str(), t.cursors()), ("abcd", vec![2]));

    let mut t = Typist::new("", 0);
    t.type_text("abcd");
    t.backspace();
    t.backspace();
    assert_eq!(t.text(), "ab");
    assert!(t.undo());
    assert_eq!((t.text().as_str(), t.cursors()), ("abcd", vec![4]));
    assert!(t.undo());
    assert_eq!(t.text(), "");

    // a break asked for by the view, as on a click that lands where the cursor already is
    let mut t = Typist::new("", 0);
    t.type_text("ab");
    t.doc.break_undo_group();
    t.type_text("cd");
    assert!(t.undo());
    assert_eq!(t.text(), "ab");
}

#[test]
fn a_paste_is_its_own_step() {
    let mut t = Typist::new("", 0);
    t.type_text("ab");
    t.wait(10);
    let paste = Transaction::insert(&t.sel, "PASTED").with_kind(EditKind::Other);
    t.sel = t.doc.apply(paste, &t.sel, t.now).selections;
    t.type_text("cd");
    assert_eq!(t.text(), "abPASTEDcd");
    assert!(t.undo());
    assert_eq!(t.text(), "abPASTED");
    assert!(t.undo());
    assert_eq!(t.text(), "ab");
}

#[test]
fn a_new_edit_drops_what_could_be_redone() {
    let mut t = Typist::new("", 0);
    t.type_text("one two");
    assert!(t.undo());
    assert!(t.doc.can_redo());
    t.type_text("X");
    assert!(!t.doc.can_redo());
    assert_eq!(t.text(), "oneX");
}

#[test]
fn typing_over_selections_with_many_cursors() {
    let mut t = Typist::new("aXXb\ncXXd\ne", 0);
    t.sel = SelectionSet::new(
        vec![
            Selection::new(1, 3),
            Selection::new(8, 6),
            Selection::cursor(11),
        ],
        1,
    );
    t.type_text("我😀");
    assert_eq!(t.text(), "a我😀b\nc我😀d\ne我😀");
    assert_eq!(t.cursors(), vec![8, 18, 28]);
    assert_eq!(t.sel.primary().head, 18);
    assert!(t.undo());
    assert_eq!(t.text(), "aXXb\ncXXd\ne");
    assert_eq!(t.sel.primary(), Selection::new(8, 6));
    assert_eq!(t.sel.len(), 3);
    assert!(t.redo());
    assert_eq!(t.text(), "a我😀b\nc我😀d\ne我😀");
    assert_eq!(t.cursors(), vec![8, 18, 28]);
}

#[test]
fn a_group_is_one_step_whatever_is_in_it() {
    // an IME composition: marked text replaced several times, slowly, then committed
    let mut t = Typist::new("ab", 1);
    t.doc.begin_undo_group();
    for (range, marked) in [(1..1, "n"), (1..2, "ne"), (1..3, "nei"), (1..4, "你")] {
        t.wait(700);
        let tx = Transaction::new(vec![Edit::new(range, marked)]);
        t.sel = t.doc.apply(tx, &t.sel, t.now).selections;
    }
    t.doc.end_undo_group();
    assert_eq!(t.text(), "a你b");
    t.type_text("c");
    assert_eq!(t.text(), "a你cb");
    assert!(t.undo());
    assert_eq!(t.text(), "a你b");
    assert!(t.undo());
    assert_eq!((t.text().as_str(), t.cursors()), ("ab", vec![1]));
    assert!(t.redo());
    assert_eq!(t.text(), "a你b");

    // nested groups close together
    let mut t = Typist::new("", 0);
    t.doc.begin_undo_group();
    t.type_text("a b");
    t.doc.begin_undo_group();
    t.type_text(" c");
    t.doc.end_undo_group();
    t.type_text(" d");
    t.doc.end_undo_group();
    assert!(t.undo());
    assert_eq!(t.text(), "");
}

#[test]
fn edits_in_one_transaction_use_the_coordinates_from_before_it() {
    let mut doc = Document::from_text("0123456789");
    let sel = SelectionSet::cursor(0);
    // given out of order, with two inserts at one place
    let tx = Transaction::new(vec![
        Edit::new(8..10, "END"),
        Edit::new(5..5, "a"),
        Edit::new(0..2, ""),
        Edit::new(5..5, "b"),
    ]);
    let applied = doc.apply(tx, &sel, Instant::now());
    assert_eq!(doc.buffer().text(), "234ab567END");
    assert_eq!(applied.changes.len(), 4);
    assert_eq!(doc.version(), 4);
    // the changes replay in order on a copy of the text
    let mut replayed = String::from("0123456789");
    for c in &applied.changes {
        replayed.replace_range(c.start..c.old_end(), &c.inserted);
    }
    assert_eq!(replayed, "234ab567END");
    doc.undo().unwrap();
    assert_eq!(doc.buffer().text(), "0123456789");
    assert_eq!(doc.version(), 8);
}

#[test]
fn an_overlapping_edit_is_dropped_not_applied_wrongly() {
    let mut doc = Document::from_text("0123456789");
    let sel = SelectionSet::cursor(0);
    let tx = Transaction::new(vec![Edit::new(2..8, "X"), Edit::new(4..5, "Y")]);
    let applied = doc.apply(tx, &sel, Instant::now());
    assert_eq!(doc.buffer().text(), "0123Y56789");
    assert_eq!(applied.changes.len(), 1);
    // a range past the end is the end
    let tx = Transaction::new(vec![Edit::new(50..60, "!")]);
    doc.apply(tx, &sel, Instant::now());
    assert_eq!(doc.buffer().text(), "0123Y56789!");
}

#[test]
fn pasted_crlf_is_stored_as_lf() {
    let mut doc = Document::from_text("a\r\nb");
    let sel = SelectionSet::cursor(3);
    let tx = Transaction::insert(&sel, "x\r\ny\rz");
    let applied = doc.apply(tx, &sel, Instant::now());
    assert_eq!(doc.buffer().text(), "a\nbx\ny\nz");
    assert_eq!(applied.selections, SelectionSet::cursor(8));
    assert_eq!(doc.buffer().file_text(), "a\r\nbx\r\ny\r\nz");
    doc.set_line_ending(LineEnding::Lf);
    assert_eq!(doc.buffer().file_text(), "a\nbx\ny\nz");
}

#[test]
fn dirty_follows_the_saved_step_through_undo_and_redo() {
    let mut t = Typist::new("", 0);
    assert!(!t.doc.is_dirty());
    t.type_text("one");
    assert!(t.doc.is_dirty());
    t.doc.mark_saved();
    assert!(!t.doc.is_dirty());
    // typing on right after a save is a new step, so undoing it is clean again
    t.type_text("two");
    assert!(t.doc.is_dirty());
    assert!(t.undo());
    assert_eq!(t.text(), "one");
    assert!(!t.doc.is_dirty());
    assert!(t.undo());
    assert!(t.doc.is_dirty());
    assert!(t.redo());
    assert!(!t.doc.is_dirty());
}

#[test]
fn the_version_only_goes_up() {
    let mut t = Typist::new("", 0);
    let mut last = t.doc.version();
    let mut step = |t: &mut Typist, what: &str| {
        assert!(t.doc.version() > last, "{what} must raise the version");
        last = t.doc.version();
    };
    t.type_text("a");
    step(&mut t, "an edit");
    t.undo();
    step(&mut t, "undo");
    t.redo();
    step(&mut t, "redo");
}

/// Random edits, then everything undone and redone: the text must come back exactly both ways.
#[test]
fn random_edits_undo_to_the_original_and_redo_to_the_result() {
    let original = "\\begin{align}\n  我們 x &= 😀 \\\\\n\\end{align}\n".repeat(20);
    let pieces = ["", "a", " ", "\n", "我", "😀", "\\frac{1}{2}", "x\ny"];
    let mut seed = 0x2545_f491_4f6c_dd1d_usize;
    let mut random = |below: usize| {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed % (below + 1)
    };
    let mut doc = Document::from_text(&original);
    let mut sel = SelectionSet::cursor(0);
    let mut now = Instant::now();
    let mut steps = 0;
    for _ in 0..400 {
        let len = doc.buffer().len();
        let start = random(len);
        let range = start..(start + random(12)).min(len);
        let text = pieces[random(pieces.len() - 1)];
        now += Duration::from_millis(u64::try_from(random(600)).unwrap());
        let tx = Transaction::new(vec![Edit::new(range, text)]).with_kind(EditKind::Insert);
        let applied = doc.apply(tx, &sel, now);
        sel = applied.selections;
        steps += applied.changes.len();
        let buffer = doc.buffer();
        assert_eq!(buffer.len(), buffer.text().len());
        assert_eq!(buffer.len_lines(), buffer.text().matches('\n').count() + 1);
    }
    assert!(steps > 300);
    let result = doc.buffer().text();
    while doc.undo().is_some() {}
    assert_eq!(doc.buffer().text(), original);
    assert!(!doc.is_dirty());
    while doc.redo().is_some() {}
    assert_eq!(doc.buffer().text(), result);
}
