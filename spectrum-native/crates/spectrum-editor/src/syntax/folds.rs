//! Foldable ranges from the syntax tree, plus LaTeX's `\begingroup` and `\if…\fi`, which the
//! grammar leaves as plain commands.

use std::collections::BTreeMap;
use std::ops::Range;

use tree_sitter::Node;

use super::{Language, Syntax, last_line, walk};
use crate::buffer::Buffer;
use crate::scope::strip_latex_comment;

/// A range that can fold away. The fold chevron sits on `start_line`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FoldRange {
    pub start_line: usize,
    /// The last line the construct touches. When it ends with a closing token (`\end{…}`, `}`,
    /// a closing fence) that line stays visible after the placeholder.
    pub end_line: usize,
    /// What folding hides: from the end of `start_line` to the closing token, or to the end of
    /// the construct (trailing blank lines kept visible) when there is none.
    pub hidden: Range<usize>,
}

/// How a node folds: keeping its closing token (`\end{…}`, `}`, a fence) in view, or whole.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Fold {
    Delimited,
    Whole,
}

fn fold_kind(language: Language, kind: &str) -> Option<Fold> {
    use Fold::{Delimited, Whole};
    Some(match (language, kind) {
        (
            Language::Latex,
            "part" | "chapter" | "section" | "subsection" | "subsubsection" | "paragraph"
            | "subparagraph",
        )
        | (Language::Typst, "section" | "comment")
        | (Language::Markdown, "section" | "indented_code_block" | "html_block" | "block_quote") => {
            Whole
        }
        (Language::Latex, "displayed_equation" | "block_comment")
        | (Language::Typst, "block" | "content" | "group" | "raw_blck" | "math")
        | (Language::Markdown, "fenced_code_block" | "minus_metadata" | "plus_metadata")
        | (Language::Bibtex, "entry" | "string" | "preamble") => Delimited,
        (Language::Latex, k) if k.ends_with("_environment") => Delimited,
        _ => return None,
    })
}

impl Syntax {
    /// Every fold, sorted by start line, at most one per line (the biggest). Walks the tree's
    /// multi-line nodes, so call it after edits settle, not per frame.
    pub fn folds(&self, buffer: &Buffer) -> Vec<FoldRange> {
        let Some(tree) = self.current_tree(buffer) else {
            return Vec::new();
        };
        let mut by_line: BTreeMap<usize, FoldRange> = BTreeMap::new();
        let mut add = |fold: FoldRange| {
            if fold.end_line > fold.start_line && fold.hidden.start < fold.hidden.end {
                let keep = by_line
                    .get(&fold.start_line)
                    .is_none_or(|old| fold.hidden.end > old.hidden.end);
                if keep {
                    by_line.insert(fold.start_line, fold);
                }
            }
        };
        walk(tree, |node| {
            // a node on one line can neither fold nor hold anything that does
            if node.end_position().row == node.start_position().row {
                return false;
            }
            if let Some(how) = fold_kind(self.language, node.kind())
                && let Some(fold) = node_fold(buffer, node, how == Fold::Whole)
            {
                add(fold);
            }
            true
        });
        if self.language == Language::Latex {
            latex_pairs(buffer, &mut add);
        }
        by_line.into_values().collect()
    }
}

fn node_fold(buffer: &Buffer, node: Node<'_>, whole: bool) -> Option<FoldRange> {
    let start_line = node.start_position().row;
    let end_line = last_line(node);
    if end_line <= start_line {
        return None;
    }
    let from = buffer.line_range(start_line).end;
    let closer = node
        .child_count()
        .checked_sub(1)
        .and_then(|last| node.child(u32::try_from(last).ok()?))
        .filter(|c| {
            !whole && c.start_position().row == end_line && c.start_position().row > start_line
        });
    let to = match closer {
        Some(closer) => closer.start_byte(),
        None => trim_end(buffer, from, node.end_byte()),
    };
    Some(FoldRange {
        start_line,
        end_line,
        hidden: from..to,
    })
}

/// `end` moved back over trailing white space, but not before `floor`.
fn trim_end(buffer: &Buffer, floor: usize, end: usize) -> usize {
    let text = buffer.slice(floor..end).to_string();
    floor + text.trim_end().len()
}

/// `\begingroup…\endgroup` and `\if…\fi` spanning lines, as 2.8 folded them. `\iffalse` is the
/// grammar's block comment; `\iff` and `\ifthenelse` are not conditionals.
fn latex_pairs(buffer: &Buffer, add: &mut impl FnMut(FoldRange)) {
    let mut groups: Vec<usize> = Vec::new();
    let mut ifs: Vec<usize> = Vec::new();
    let mut line_text = String::new();
    for line in 0..buffer.len_lines() {
        line_text.clear();
        for chunk in buffer.line(line).chunks() {
            line_text.push_str(chunk);
        }
        let code = strip_latex_comment(line_text.as_bytes());
        let line_start = buffer.line_range(line).start;
        let mut i = 0;
        while i < code.len() {
            if code[i] != b'\\' {
                i += 1;
                continue;
            }
            let name_end = code[i + 1..]
                .iter()
                .position(|b| !b.is_ascii_alphabetic() && *b != b'@')
                .map_or(code.len(), |p| i + 1 + p);
            let name = &code[i + 1..name_end];
            let stack = match name {
                b"begingroup" | b"endgroup" => Some(&mut groups),
                b"fi" => Some(&mut ifs),
                b"iff" | b"ifthenelse" | b"iffalse" => None,
                _ if name.starts_with(b"if") => Some(&mut ifs),
                _ => None,
            };
            if let Some(stack) = stack {
                if name == b"begingroup" || (name.starts_with(b"if") && name != b"fi") {
                    stack.push(line);
                } else if let Some(open) = stack.pop()
                    && open < line
                {
                    add(FoldRange {
                        start_line: open,
                        end_line: line,
                        hidden: buffer.line_range(open).end..line_start + i,
                    });
                }
            }
            i = name_end.max(i + 2);
        }
    }
}
