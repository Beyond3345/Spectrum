//! Text storage: a rope that holds LF line breaks only, a version counter and offset conversions.
//!
//! Offsets are UTF-8 bytes. Every conversion is O(log n) and clamps instead of panicking: an offset
//! past the end becomes the end, one inside a character becomes that character's start, a column
//! past the end of its line becomes the line's end.

use std::borrow::Cow;
use std::ops::Range;

use ropey::{LineType, Rope, RopeSlice};

/// The buffer never holds a `\r`, so a line is exactly what `\n` separates.
const LINES: LineType = LineType::LF;

/// The line break a file is saved with. In memory it is always LF.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LineEnding {
    #[default]
    Lf,
    CrLf,
}

impl LineEnding {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lf => "\n",
            Self::CrLf => "\r\n",
        }
    }

    /// CRLF when most of the text's line breaks are CRLF.
    pub fn detect(text: &str) -> Self {
        let crlf = text.matches("\r\n").count();
        let lf = text.matches('\n').count() - crlf;
        if crlf > lf { Self::CrLf } else { Self::Lf }
    }
}

/// CRLF and lone CR become LF. Borrows when there is nothing to change.
pub(crate) fn normalise(text: &str) -> Cow<'_, str> {
    if text.contains('\r') {
        Cow::Owned(text.replace("\r\n", "\n").replace('\r', "\n"))
    } else {
        Cow::Borrowed(text)
    }
}

/// A position as a line and a byte column in it, both from 0. Tree-sitter's point.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Point {
    pub line: usize,
    pub column: usize,
}

/// A position as a line and a UTF-16 column in it, both from 0. The LSP's position.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PointUtf16 {
    pub line: usize,
    pub column: usize,
}

/// Which side a position takes when text is inserted exactly at it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Bias {
    /// Stay before the inserted text.
    Left,
    /// Move after the inserted text.
    Right,
}

/// One replacement the buffer made, with what the syntax tree and the language server need to
/// follow it. Offsets and points describe the buffer as it was just before this change.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Change {
    /// Where the replaced text began; the inserted text begins there too.
    pub start: usize,
    pub removed: String,
    pub inserted: String,
    pub start_point: Point,
    pub old_end_point: Point,
    /// The end of the inserted text, in the buffer after the change.
    pub new_end_point: Point,
    pub start_utf16: PointUtf16,
    pub old_end_utf16: PointUtf16,
}

impl Change {
    pub fn old_end(&self) -> usize {
        self.start + self.removed.len()
    }

    pub fn new_end(&self) -> usize {
        self.start + self.inserted.len()
    }

    /// Where an offset from before this change sits after it. An offset inside the removed text
    /// goes to the start of the replacement (`Left`) or its end (`Right`).
    pub fn map_offset(&self, offset: usize, bias: Bias) -> usize {
        let at_start = offset == self.start && (bias == Bias::Left || !self.removed.is_empty());
        if offset < self.start || at_start {
            offset
        } else if offset >= self.old_end() {
            offset - self.removed.len() + self.inserted.len()
        } else if bias == Bias::Left {
            self.start
        } else {
            self.new_end()
        }
    }
}

/// The text of one file.
#[derive(Clone, Debug, Default)]
pub struct Buffer {
    rope: Rope,
    version: u64,
    line_ending: LineEnding,
}

impl Buffer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Takes a file's text, remembering its line ending and keeping LF in memory.
    pub fn from_text(text: &str) -> Self {
        Self {
            rope: Rope::from_str(&normalise(text)),
            version: 0,
            line_ending: LineEnding::detect(text),
        }
    }

    /// Goes up by one with every change, undo and redo included. Never goes down.
    pub fn version(&self) -> u64 {
        self.version
    }

    pub fn line_ending(&self) -> LineEnding {
        self.line_ending
    }

    pub fn set_line_ending(&mut self, line_ending: LineEnding) {
        self.line_ending = line_ending;
    }

    /// The rope itself, for readers that walk chunks (Tree-sitter, search). Cloning it is O(1),
    /// which is how a background task takes a snapshot.
    pub fn rope(&self) -> &Rope {
        &self.rope
    }

    pub fn len(&self) -> usize {
        self.rope.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rope.len() == 0
    }

    pub fn len_chars(&self) -> usize {
        self.rope.len_chars()
    }

    pub fn len_utf16(&self) -> usize {
        self.rope.len_utf16()
    }

    /// At least 1: an empty buffer is one empty line, and text ending in `\n` has an empty last line.
    pub fn len_lines(&self) -> usize {
        self.rope.len_lines(LINES)
    }

    /// The whole text with LF line breaks.
    pub fn text(&self) -> String {
        self.rope.to_string()
    }

    /// The whole text with the file's own line ending, for saving.
    pub fn file_text(&self) -> String {
        match self.line_ending {
            LineEnding::Lf => self.text(),
            LineEnding::CrLf => self.text().replace('\n', "\r\n"),
        }
    }

    pub fn slice(&self, range: Range<usize>) -> RopeSlice<'_> {
        self.rope.slice(self.clip_range(range))
    }

    /// The byte range of a line without its line break. A line past the end is the last line.
    pub fn line_range(&self, line: usize) -> Range<usize> {
        let last = self.len_lines() - 1;
        let line = line.min(last);
        let start = self.rope.line_to_byte_idx(line, LINES);
        let end = if line < last {
            self.rope.line_to_byte_idx(line + 1, LINES) - 1
        } else {
            self.len()
        };
        start..end
    }

    /// A line's text without its line break.
    pub fn line(&self, line: usize) -> RopeSlice<'_> {
        self.rope.slice(self.line_range(line))
    }

    /// The nearest offset at or before `offset` that is inside the text and starts a character.
    pub fn clip(&self, offset: usize) -> usize {
        self.rope.floor_char_boundary(offset.min(self.len()))
    }

    /// A range with ordered ends, widened to whole characters.
    pub fn clip_range(&self, range: Range<usize>) -> Range<usize> {
        let start = self.clip(range.start);
        let end = self.rope.ceil_char_boundary(range.end.min(self.len()));
        start..end.max(start)
    }

    pub fn offset_to_point(&self, offset: usize) -> Point {
        let offset = self.clip(offset);
        let line = self.rope.byte_to_line_idx(offset, LINES);
        Point {
            line,
            column: offset - self.rope.line_to_byte_idx(line, LINES),
        }
    }

    pub fn point_to_offset(&self, point: Point) -> usize {
        let line = self.line_range(point.line);
        self.clip(line.start + point.column.min(line.len()))
    }

    pub fn offset_to_point_utf16(&self, offset: usize) -> PointUtf16 {
        let offset = self.clip(offset);
        let line = self.rope.byte_to_line_idx(offset, LINES);
        let line_start = self.rope.line_to_byte_idx(line, LINES);
        PointUtf16 {
            line,
            column: self.rope.byte_to_utf16_idx(offset) - self.rope.byte_to_utf16_idx(line_start),
        }
    }

    /// A column inside a surrogate pair becomes the start of that character.
    pub fn point_utf16_to_offset(&self, point: PointUtf16) -> usize {
        let line = self.line_range(point.line);
        let start = self.rope.byte_to_utf16_idx(line.start);
        let end = self.rope.byte_to_utf16_idx(line.end);
        self.rope
            .utf16_to_byte_idx(start.saturating_add(point.column).min(end))
    }

    /// The offset counted in UTF-16 code units from the start of the text, as IMEs count.
    pub fn offset_to_utf16(&self, offset: usize) -> usize {
        self.rope.byte_to_utf16_idx(self.clip(offset))
    }

    /// An index inside a surrogate pair becomes the start of that character.
    pub fn utf16_to_offset(&self, utf16: usize) -> usize {
        self.rope.utf16_to_byte_idx(utf16.min(self.len_utf16()))
    }

    pub fn range_to_utf16(&self, range: Range<usize>) -> Range<usize> {
        self.offset_to_utf16(range.start)..self.offset_to_utf16(range.end)
    }

    pub fn range_from_utf16(&self, range: Range<usize>) -> Range<usize> {
        self.utf16_to_offset(range.start)..self.utf16_to_offset(range.end)
    }

    pub fn offset_to_char(&self, offset: usize) -> usize {
        self.rope.byte_to_char_idx(self.clip(offset))
    }

    pub fn char_to_offset(&self, char_index: usize) -> usize {
        self.rope.char_to_byte_idx(char_index.min(self.len_chars()))
    }

    /// Replaces a range, the buffer's only way to change. `text` must already hold LF only;
    /// `Edit::new` sees to that.
    pub(crate) fn replace(&mut self, range: Range<usize>, text: &str) -> Change {
        debug_assert!(!text.contains('\r'), "edit text must be normalised");
        let range = self.clip_range(range);
        let start_point = self.offset_to_point(range.start);
        let start_utf16 = self.offset_to_point_utf16(range.start);
        let old_end_point = self.offset_to_point(range.end);
        let old_end_utf16 = self.offset_to_point_utf16(range.end);
        let removed = self.rope.slice(range.clone()).to_string();
        if !range.is_empty() {
            self.rope.remove(range.clone());
        }
        if !text.is_empty() {
            self.rope.insert(range.start, text);
        }
        self.version += 1;
        Change {
            start: range.start,
            removed,
            inserted: text.to_owned(),
            start_point,
            old_end_point,
            new_end_point: self.offset_to_point(range.start + text.len()),
            start_utf16,
            old_end_utf16,
        }
    }
}

#[cfg(test)]
mod tests;
