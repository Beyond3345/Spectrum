//! The text of each open document, kept so a restarted server can be given it again.

use lsp_types::{Position, TextDocumentContentChangeEvent};

pub(crate) struct OpenDocument {
    pub(crate) language_id: String,
    pub(crate) version: i32,
    pub(crate) text: String,
}

/// Applies an edit as the server will: a range in UTF-16 code units, or the whole text when there's none.
pub(crate) fn apply_change(text: &mut String, change: &TextDocumentContentChangeEvent) {
    match change.range {
        Some(range) => {
            let start = byte_offset(text, range.start);
            let end = byte_offset(text, range.end).max(start);
            text.replace_range(start..end, &change.text);
        }
        None => text.clone_from(&change.text),
    }
}

/// The byte offset of an LSP position. Lines end at `\n`, `\r\n` or `\r`; a character past the line's end is
/// its end, and a line past the text's end is the text's end. A position inside a surrogate pair rounds forward.
pub(crate) fn byte_offset(text: &str, position: Position) -> usize {
    let bytes = text.as_bytes();
    let mut line_start = 0;
    for _ in 0..position.line {
        let Some(nl) = bytes[line_start..]
            .iter()
            .position(|&b| b == b'\n' || b == b'\r')
        else {
            return text.len();
        };
        let mut next = line_start + nl + 1;
        if bytes[line_start + nl] == b'\r' && bytes.get(next) == Some(&b'\n') {
            next += 1;
        }
        line_start = next;
    }
    let mut units = 0;
    for (i, c) in text[line_start..].char_indices() {
        if units >= position.character as usize || c == '\n' || c == '\r' {
            return line_start + i;
        }
        units += c.len_utf16();
    }
    text.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use lsp_types::Range;

    fn pos(line: u32, character: u32) -> Position {
        Position { line, character }
    }

    fn edit(text: &str, start: Position, end: Position, new: &str) -> String {
        let mut s = text.to_owned();
        apply_change(
            &mut s,
            &TextDocumentContentChangeEvent {
                range: Some(Range { start, end }),
                range_length: None,
                text: new.to_owned(),
            },
        );
        s
    }

    #[test]
    fn offsets_count_utf16_units() {
        let text = "a😀b\n数学x";
        assert_eq!(byte_offset(text, pos(0, 1)), 1);
        assert_eq!(byte_offset(text, pos(0, 3)), 5); // after the emoji (2 units)
        assert_eq!(byte_offset(text, pos(1, 2)), "a😀b\n数学".len());
        assert_eq!(byte_offset(text, pos(1, 99)), text.len());
        assert_eq!(byte_offset(text, pos(7, 0)), text.len());
    }

    #[test]
    fn line_endings() {
        let text = "ab\r\ncd\ref\ngh";
        assert_eq!(byte_offset(text, pos(1, 0)), 4);
        assert_eq!(byte_offset(text, pos(2, 1)), 8);
        assert_eq!(byte_offset(text, pos(3, 0)), 10);
        assert_eq!(byte_offset(text, pos(0, 9)), 2); // clamps before the \r
    }

    #[test]
    fn incremental_and_full_changes() {
        let s = edit("\\section{Intro}\n", pos(0, 9), pos(0, 14), "Einführung");
        assert_eq!(s, "\\section{Einführung}\n");
        let s = edit(&s, pos(1, 0), pos(1, 0), "😀 ok");
        let s = edit(&s, pos(1, 2), pos(1, 3), "");
        assert_eq!(s, "\\section{Einführung}\n😀ok");
        let mut s = s;
        apply_change(
            &mut s,
            &TextDocumentContentChangeEvent {
                range: None,
                range_length: None,
                text: "new".into(),
            },
        );
        assert_eq!(s, "new");
    }
}
