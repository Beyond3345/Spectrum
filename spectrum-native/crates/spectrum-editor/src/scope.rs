//! Nesting depth per line for the gutter's scope bars: LaTeX environments, Typst `{…}` and `[…]`
//! blocks (`#for`, `#if`, `#let` bodies, content blocks), Markdown fenced code.
//!
//! Read from the text line by line, not from the syntax tree, so the bars stay put while a
//! half-typed `\begin{` leaves the tree in error. Each line keeps the scanner state it starts
//! and ends in; an edit rescans the changed lines and stops at the first line after them whose
//! starting state did not change, so a keystroke costs a few lines, not the file.

use crate::buffer::{Buffer, Change};
use crate::syntax::Language;

/// The gutter shows at most this many bars.
pub const MAX_SCOPE_DEPTH: u8 = 8;

/// One scope around a line: its bar is number `level` (1 is the outermost), drawn from
/// `open_line` to `close_line`, both included.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Scope {
    pub level: u8,
    pub open_line: usize,
    /// The last line when the scope is never closed.
    pub close_line: usize,
}

/// What a scan carries from one line to the next.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct State {
    depth: u16,
    /// Typst: inside a block comment, raw block or maths. Markdown: the open fence.
    mode: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Line {
    start: State,
    end: State,
    /// The lowest depth reached on the line, so `\end{a}\begin{b}` both closes and opens.
    low: u16,
    dirty: bool,
}

const DIRTY: Line = Line {
    start: State { depth: 0, mode: 0 },
    end: State { depth: 0, mode: 0 },
    low: 0,
    dirty: true,
};

/// The depth table of one document, for one buffer version.
#[derive(Clone, Debug)]
pub struct ScopeMap {
    language: Language,
    version: u64,
    lines: Vec<Line>,
    scratch: Vec<u8>,
}

impl ScopeMap {
    pub fn new(language: Language, buffer: &Buffer) -> Self {
        let mut map = Self {
            language,
            version: buffer.version(),
            lines: vec![DIRTY; buffer.len_lines()],
            scratch: Vec::new(),
        };
        map.rescan(buffer);
        map
    }

    /// The buffer version the table describes.
    pub fn version(&self) -> u64 {
        self.version
    }

    /// Follows one transaction, undo or redo (`Applied::changes`, in order); `buffer` is the
    /// buffer after them. A table that missed a change is rebuilt.
    pub fn update(&mut self, buffer: &Buffer, changes: &[Change]) {
        if self.version + changes.len() as u64 != buffer.version() {
            *self = Self::new(self.language, buffer);
            return;
        }
        for change in changes {
            let first = change.start_point.line;
            let old_last = change.old_end_point.line;
            let new_last = change.new_end_point.line;
            self.lines.splice(
                first..=old_last.min(self.lines.len().saturating_sub(1)),
                std::iter::repeat_n(DIRTY, new_last - first + 1),
            );
        }
        self.version = buffer.version();
        if self.lines.len() != buffer.len_lines() {
            tracing::error!("scope table lost track of the lines; rebuilding");
            *self = Self::new(self.language, buffer);
            return;
        }
        self.rescan(buffer);
    }

    /// The number of bars on a line, 0 to [`MAX_SCOPE_DEPTH`].
    pub fn depth(&self, line: usize) -> u8 {
        self.lines.get(line).map_or(0, |l| {
            u8::try_from(shown(l).min(u16::from(MAX_SCOPE_DEPTH))).unwrap_or(MAX_SCOPE_DEPTH)
        })
    }

    /// The innermost scope drawn on a line (for the brighter active bar), if any.
    pub fn innermost(&self, line: usize) -> Option<Scope> {
        let depth = self.depth(line);
        (depth > 0).then(|| self.scope(line, depth)).flatten()
    }

    /// The scope whose bar number `level` passes `line`: what a click on that bar jumps between.
    pub fn scope(&self, line: usize, level: u8) -> Option<Scope> {
        let at = *self.lines.get(line)?;
        let lv = u16::from(level);
        if level == 0 || shown(&at) < lv {
            return None;
        }
        let opens = |l: &Line| l.low < lv && lv <= l.end.depth;
        let closes = |l: &Line| l.start.depth >= lv && lv > l.low;
        let (open_line, search_from) = if opens(&at) {
            (line, line + 1)
        } else {
            let open = (0..line)
                .rev()
                .find(|&i| opens(&self.lines[i]))
                .unwrap_or(0);
            (open, line)
        };
        let close_line = (search_from..self.lines.len())
            .find(|&i| closes(&self.lines[i]))
            .unwrap_or(self.lines.len() - 1);
        Some(Scope {
            level,
            open_line,
            close_line,
        })
    }

    /// Scans the dirty lines, then on until a line starts as it did before.
    fn rescan(&mut self, buffer: &Buffer) {
        let Some(first) = self.lines.iter().position(|l| l.dirty) else {
            return;
        };
        let last = self.lines.iter().rposition(|l| l.dirty).unwrap_or(first);
        let mut state = if first == 0 {
            State::default()
        } else {
            self.lines[first - 1].end
        };
        for i in first..self.lines.len() {
            let old = self.lines[i];
            if !old.dirty && old.start == state {
                if i > last {
                    break;
                }
                state = old.end;
                continue;
            }
            // an unchanged line that only starts deeper or shallower (a `\begin` typed above it)
            // scans the same, shifted, unless the old scan or the new one stopped at 0
            if !old.dirty && old.start.mode == state.mode && old.low > 0 {
                let delta = i32::from(state.depth) - i32::from(old.start.depth);
                let shift = |d: u16| u16::try_from(i32::from(d) + delta).ok();
                if let (Some(low), Some(end)) = (shift(old.low), shift(old.end.depth)) {
                    self.lines[i] = Line {
                        start: state,
                        end: State {
                            depth: end,
                            ..old.end
                        },
                        low,
                        dirty: false,
                    };
                    state = self.lines[i].end;
                    continue;
                }
            }
            self.scratch.clear();
            for chunk in buffer.line(i).chunks() {
                self.scratch.extend_from_slice(chunk.as_bytes());
            }
            let (end, low) = scan(self.language, &self.scratch, state);
            self.lines[i] = Line {
                start: state,
                end,
                low,
                dirty: false,
            };
            state = end;
        }
    }
}

/// A line's bars reach the deeper of its two ends, so `\begin` and `\end` lines carry their bar.
fn shown(line: &Line) -> u16 {
    line.start.depth.max(line.end.depth)
}

fn scan(language: Language, line: &[u8], start: State) -> (State, u16) {
    match language {
        Language::Latex => scan_latex(line, start),
        Language::Typst => scan_typst(line, start),
        Language::Markdown => scan_markdown(line, start),
        Language::Bibtex => (start, start.depth),
    }
}

/// A LaTeX line up to its comment: `%` not escaped by a backslash.
pub(crate) fn strip_latex_comment(line: &[u8]) -> &[u8] {
    let mut i = 0;
    while i < line.len() {
        match line[i] {
            b'\\' => i += 2,
            b'%' => return &line[..i],
            _ => i += 1,
        }
    }
    line
}

/// `\begin{name}` and `\end{name}`, as 2.8 counted them (names are not matched up).
fn scan_latex(line: &[u8], start: State) -> (State, u16) {
    let code = strip_latex_comment(line);
    let mut depth = start.depth;
    let mut low = depth;
    let mut i = 0;
    while i < code.len() {
        if code[i] != b'\\' {
            i += 1;
            continue;
        }
        let rest = &code[i + 1..];
        let (begin, word) = if rest.starts_with(b"begin{") {
            (true, 6)
        } else if rest.starts_with(b"end{") {
            (false, 4)
        } else {
            i += 2;
            continue;
        };
        let name = &rest[word..];
        match name.iter().position(|&b| b == b'}') {
            Some(close) if close > 0 => {
                if begin {
                    depth += 1;
                } else {
                    depth = depth.saturating_sub(1);
                    low = low.min(depth);
                }
                i += 1 + word + close + 1;
            }
            _ => i += 1 + word,
        }
    }
    (State { depth, mode: 0 }, low)
}

const TYPST_CODE: u8 = 0;
const TYPST_COMMENT: u8 = 1;
const TYPST_RAW: u8 = 2;
const TYPST_MATH: u8 = 3;

/// Typst `{ }` and `[ ]`, skipping comments, strings, raw text and maths (whose brackets need
/// not balance: `$[0, 1)$`).
fn scan_typst(line: &[u8], start: State) -> (State, u16) {
    let mut depth = start.depth;
    let mut low = depth;
    let mut mode = start.mode;
    let mut i = 0;
    let at = |i: usize, s: &[u8]| line[i..].starts_with(s);
    while i < line.len() {
        match mode {
            TYPST_COMMENT => match line[i..].windows(2).position(|w| w == b"*/") {
                Some(p) => {
                    mode = TYPST_CODE;
                    i += p + 2;
                }
                None => break,
            },
            TYPST_RAW => match line[i..].windows(3).position(|w| w == b"```") {
                Some(p) => {
                    mode = TYPST_CODE;
                    i += p + 3;
                }
                None => break,
            },
            _ => {
                let math = mode == TYPST_MATH;
                match line[i] {
                    b'\\' => i += 2,
                    // `https://` in markup is a link, not a comment
                    b'/' if at(i, b"//") && (i == 0 || line[i - 1] != b':') => break,
                    b'/' if at(i, b"/*") => {
                        mode = TYPST_COMMENT;
                        i += 2;
                    }
                    b'`' if at(i, b"```") => {
                        mode = TYPST_RAW;
                        i += 3;
                    }
                    b'`' => {
                        i += 1;
                        if let Some(p) = line[i..].iter().position(|&b| b == b'`') {
                            i += p + 1;
                        }
                    }
                    b'"' => {
                        i += 1;
                        while i < line.len() && line[i] != b'"' {
                            i += if line[i] == b'\\' { 2 } else { 1 };
                        }
                        i += 1;
                    }
                    b'$' => {
                        mode = if math { TYPST_CODE } else { TYPST_MATH };
                        i += 1;
                    }
                    b'{' | b'[' if !math => {
                        depth += 1;
                        i += 1;
                    }
                    b'}' | b']' if !math => {
                        depth = depth.saturating_sub(1);
                        low = low.min(depth);
                        i += 1;
                    }
                    _ => i += 1,
                }
            }
        }
    }
    (State { depth, mode }, low)
}

/// Markdown fenced code: three or more backticks or tildes, closed by at least as many of the
/// same. `mode` holds the open fence: its character in bit 7 (set for `~`), its length below.
fn scan_markdown(line: &[u8], start: State) -> (State, u16) {
    let indent = line.iter().take_while(|&&b| b == b' ').count();
    let body = &line[indent.min(line.len())..];
    let fence = match body.first() {
        Some(&c @ (b'`' | b'~')) if indent <= 3 => {
            let len = body.iter().take_while(|&&b| b == c).count();
            (len >= 3).then_some((c, len))
        }
        _ => None,
    };
    let open = start.mode != 0;
    match fence {
        Some((c, len)) if open => {
            let open_char = if start.mode & 0x80 != 0 { b'~' } else { b'`' };
            let open_len = usize::from(start.mode & 0x7f);
            let closes = c == open_char
                && len >= open_len
                && body[len..].iter().all(u8::is_ascii_whitespace);
            if closes {
                (State::default(), 0)
            } else {
                (start, start.depth)
            }
        }
        // an info string with a backtick does not open a backtick fence
        Some((c, len)) if !(c == b'`' && body[len..].contains(&b'`')) => {
            let len = u8::try_from(len.min(0x7f)).unwrap_or(0x7f);
            let mode = len | if c == b'~' { 0x80 } else { 0 };
            (State { depth: 1, mode }, 0)
        }
        _ => (start, start.depth),
    }
}

#[cfg(test)]
mod tests;
