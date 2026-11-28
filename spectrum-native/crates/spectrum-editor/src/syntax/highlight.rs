//! Highlighting: semantic roles for the lines on screen, never colours. The theme (2e) maps each
//! role to a colour, so the roles stay fine-grained and a calm theme can merge them.

use std::ops::Range;
use std::sync::OnceLock;

use tree_sitter::{Parser, Query, QueryCursor, StreamingIterator};

use super::{Language, RopeText, Syntax, compile};
use crate::buffer::Buffer;

/// Lines highlighted above and below the ones asked for, so a small scroll needs no new query.
pub const HIGHLIGHT_OVERSCAN: usize = 40;

/// What a piece of text is. Text without a span is plain prose.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum HighlightRole {
    Comment,
    /// A LaTeX command (`\emph`, `\section`), a Typst function call, a BibTeX `\LaTeX`.
    Command,
    /// `\begin`/`\end`, Typst's `let`, `if`, `for`, `set`, `show`..., a BibTeX `@article`.
    Keyword,
    /// The name in `\begin{align*}`.
    Environment,
    /// `{ } [ ] ( )`.
    Bracket,
    /// `,` `;` `:` `&`, Markdown fence and emphasis markers.
    Delimiter,
    Operator,
    /// Maths content: `$…$`, `\[…\]`, `align`, Typst `$…$`, Markdown `$…$`.
    Math,
    /// `$`, `$$`, `\(`, `\)`, `\[`, `\]`.
    MathDelimiter,
    String,
    Number,
    /// `true`, `none`, `auto`, a BibTeX `@string` name.
    Constant,
    /// The title of a section or heading.
    Heading,
    /// `\section`, Typst `=`, Markdown `#` and setext underlines.
    HeadingMarker,
    /// Where a label is defined: `\label{x}`, Typst `<x>`.
    Label,
    /// A use of a label: `\ref{x}`, Typst `@x`, a Markdown link label.
    Reference,
    /// A citation key: `\cite{key}`, a BibTeX entry's key.
    Citation,
    Emphasis,
    Strong,
    Strikethrough,
    /// Verbatim and raw text: `verbatim`, `minted`, Typst and Markdown raw blocks and spans.
    Code,
    /// URLs and file paths.
    Link,
    /// A BibTeX field name, a Typst named argument, a LaTeX key in `key=value`.
    Field,
    /// A Typst or BibTeX identifier.
    Variable,
    Escape,
    /// List bullets and numbers, task boxes, thematic breaks.
    ListMarker,
    Quote,
    /// `#1` in a LaTeX definition.
    Placeholder,
}

impl HighlightRole {
    /// The role a query capture names (`@math_delimiter`). Captures starting with `_` are helpers.
    fn from_capture(name: &str) -> Option<Self> {
        Some(match name {
            "comment" => Self::Comment,
            "command" => Self::Command,
            "keyword" => Self::Keyword,
            "environment" => Self::Environment,
            "bracket" => Self::Bracket,
            "delimiter" => Self::Delimiter,
            "operator" => Self::Operator,
            "math" => Self::Math,
            "math_delimiter" => Self::MathDelimiter,
            "string" => Self::String,
            "number" => Self::Number,
            "constant" => Self::Constant,
            "heading" => Self::Heading,
            "heading_marker" => Self::HeadingMarker,
            "label" => Self::Label,
            "reference" => Self::Reference,
            "citation" => Self::Citation,
            "emphasis" => Self::Emphasis,
            "strong" => Self::Strong,
            "strikethrough" => Self::Strikethrough,
            "code" => Self::Code,
            "link" => Self::Link,
            "field" => Self::Field,
            "variable" => Self::Variable,
            "escape" => Self::Escape,
            "list_marker" => Self::ListMarker,
            "quote" => Self::Quote,
            "placeholder" => Self::Placeholder,
            _ => return None,
        })
    }
}

/// A run of text with one role. Spans are sorted, never overlap, and the innermost syntax wins
/// (a command inside maths is a `Command` span between two `Math` spans).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HighlightSpan {
    pub range: Range<usize>,
    pub role: HighlightRole,
}

struct HighlightQuery {
    query: Query,
    roles: Vec<Option<HighlightRole>>,
}

impl HighlightQuery {
    fn new(language: Language, source: &str) -> Option<Self> {
        let query = compile(language, source)?;
        let roles = query
            .capture_names()
            .iter()
            .map(|name| HighlightRole::from_capture(name))
            .collect();
        Some(Self { query, roles })
    }
}

const LATEX: &str = include_str!("queries/latex.scm");
const TYPST: &str = include_str!("queries/typst.scm");
const MARKDOWN: &str = include_str!("queries/markdown.scm");
const MARKDOWN_INLINE: &str = include_str!("queries/markdown_inline.scm");
const BIBTEX: &str = include_str!("queries/bibtex.scm");

fn query(language: Language) -> Option<&'static HighlightQuery> {
    static QUERIES: [OnceLock<Option<HighlightQuery>>; 4] = [
        OnceLock::new(),
        OnceLock::new(),
        OnceLock::new(),
        OnceLock::new(),
    ];
    let (slot, source) = match language {
        Language::Latex => (0, LATEX),
        Language::Typst => (1, TYPST),
        Language::Markdown => (2, MARKDOWN),
        Language::Bibtex => (3, BIBTEX),
    };
    QUERIES[slot]
        .get_or_init(|| HighlightQuery::new(language, source))
        .as_ref()
}

/// Compiles a language's queries now, so the first highlight on the UI thread does not.
pub(super) fn warm(language: Language) {
    query(language);
    if language == Language::Markdown {
        inline_query();
    }
}

fn inline_query() -> Option<&'static (tree_sitter::Language, HighlightQuery)> {
    static QUERY: OnceLock<Option<(tree_sitter::Language, HighlightQuery)>> = OnceLock::new();
    QUERY
        .get_or_init(|| {
            let grammar: tree_sitter::Language = tree_sitter_md::INLINE_LANGUAGE.into();
            let query = match Query::new(&grammar, MARKDOWN_INLINE) {
                Ok(query) => query,
                Err(error) => {
                    tracing::error!(%error, "Markdown inline query does not compile");
                    return None;
                }
            };
            let roles = query
                .capture_names()
                .iter()
                .map(|name| HighlightRole::from_capture(name))
                .collect();
            Some((grammar, HighlightQuery { query, roles }))
        })
        .as_ref()
}

impl Syntax {
    /// The spans for `lines` (0-based, end exclusive) widened by [`HIGHLIGHT_OVERSCAN`] each
    /// way. Empty while there is no tree for this version of the buffer.
    pub fn highlight(&self, buffer: &Buffer, lines: Range<usize>) -> Vec<HighlightSpan> {
        let Some(tree) = self.current_tree(buffer) else {
            return Vec::new();
        };
        let Some(query) = query(self.language) else {
            return Vec::new();
        };
        let first = lines.start.saturating_sub(HIGHLIGHT_OVERSCAN);
        let last = lines
            .end
            .max(lines.start + 1)
            .saturating_add(HIGHLIGHT_OVERSCAN)
            .min(buffer.len_lines())
            - 1;
        let range = buffer.line_range(first).start..buffer.line_range(last).end;

        let mut raw = Vec::new();
        captures(query, tree.root_node(), buffer, range.clone(), &mut raw);
        if self.language == Language::Markdown {
            markdown_inline(tree, buffer, range.clone(), &mut raw);
        }
        flatten(raw, &range)
    }
}

/// Every capture with a role in `range`, as (range, role, order of discovery).
fn captures(
    query: &HighlightQuery,
    root: tree_sitter::Node<'_>,
    buffer: &Buffer,
    range: Range<usize>,
    out: &mut Vec<Raw>,
) {
    let mut cursor = QueryCursor::new();
    cursor.set_byte_range(range);
    let mut found = cursor.captures(&query.query, root, RopeText(buffer.rope()));
    while let Some((m, index)) = found.next() {
        let capture = m.captures[*index];
        if let Some(Some(role)) = query.roles.get(capture.index as usize) {
            out.push((capture.node.byte_range(), *role, capture.node.id()));
        }
    }
}

/// Markdown's inline syntax (emphasis, code spans, links, maths) lives in a second grammar. Only
/// the inline nodes near the screen are parsed, in one parse over all of them.
fn markdown_inline(
    tree: &tree_sitter::Tree,
    buffer: &Buffer,
    range: Range<usize>,
    out: &mut Vec<Raw>,
) {
    static INLINE_NODES: OnceLock<Option<Query>> = OnceLock::new();
    let Some((grammar, query)) = inline_query() else {
        return;
    };
    let Some(inline_nodes) = INLINE_NODES
        .get_or_init(|| compile(Language::Markdown, "(inline) @inline"))
        .as_ref()
    else {
        return;
    };
    let mut ranges = Vec::new();
    let mut cursor = QueryCursor::new();
    cursor.set_byte_range(range.clone());
    let mut found = cursor.captures(inline_nodes, tree.root_node(), RopeText(buffer.rope()));
    while let Some((m, index)) = found.next() {
        ranges.push(m.captures[*index].node.range());
    }
    if ranges.is_empty() {
        return;
    }
    let mut parser = Parser::new();
    if parser.set_language(grammar).is_err() || parser.set_included_ranges(&ranges).is_err() {
        return;
    }
    let rope = buffer.rope();
    let Some(inline) =
        parser.parse_with_options(&mut |byte, _| super::rope_bytes(rope, byte), None, None)
    else {
        return;
    };
    captures(query, inline.root_node(), buffer, range, out);
}

/// A capture: its text, role and node id.
type Raw = (Range<usize>, HighlightRole, usize);

/// Nested captures into flat, sorted spans clipped to `window`: the innermost node wins; of two
/// captures of the same node, the first pattern wins.
fn flatten(mut raw: Vec<Raw>, window: &Range<usize>) -> Vec<HighlightSpan> {
    // outer before inner; the stable sort keeps the cursor's order (parents first, then pattern
    // order) for equal ranges
    raw.sort_by_key(|(range, _, _)| (range.start, std::cmp::Reverse(range.end)));
    let mut out: Vec<HighlightSpan> = Vec::new();
    let mut stack: Vec<(Range<usize>, HighlightRole, usize)> = Vec::new();
    let mut pos = window.start;
    let emit = |out: &mut Vec<HighlightSpan>, start: usize, end: usize, role| {
        let (start, end) = (start.max(window.start), end.min(window.end));
        if start >= end {
            return;
        }
        match out.last_mut() {
            Some(last) if last.range.end == start && last.role == role => last.range.end = end,
            _ => out.push(HighlightSpan {
                range: start..end,
                role,
            }),
        }
    };
    for (range, role, node) in raw {
        if range.is_empty() {
            continue;
        }
        while let Some((top, top_role, _)) = stack.last().cloned() {
            if top.end > range.start {
                break;
            }
            emit(&mut out, pos.max(top.start), top.end, top_role);
            pos = pos.max(top.end);
            stack.pop();
        }
        let mut range = range;
        if let Some((top, top_role, top_node)) = stack.last().cloned() {
            if top == range {
                // the same node again: the earlier pattern stays; a child the size of its parent
                // takes over
                if top_node != node {
                    stack.pop();
                    stack.push((range, role, node));
                }
                continue;
            }
            emit(&mut out, pos.max(top.start), range.start, top_role);
            range.end = range.end.min(top.end);
        }
        pos = pos.max(range.start);
        stack.push((range, role, node));
    }
    while let Some((top, role, _)) = stack.pop() {
        emit(&mut out, pos.max(top.start), top.end, role);
        pos = pos.max(top.end);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inner_captures_split_outer_ones() {
        use HighlightRole::{Bracket, Command, Math};
        let raw = vec![
            (0..10, Math, 1),
            (2..4, Command, 2),
            (2..4, Bracket, 2), // same node, later pattern: loses
            (5..6, Bracket, 3),
            (5..6, Command, 4), // a child as big as its parent: wins
            (12..14, Command, 5),
        ];
        let spans = flatten(raw, &(0..20));
        let got: Vec<_> = spans.iter().map(|s| (s.range.clone(), s.role)).collect();
        assert_eq!(
            got,
            vec![
                (0..2, Math),
                (2..4, Command),
                (4..5, Math),
                (5..6, Command),
                (6..10, Math),
                (12..14, Command),
            ]
        );
    }

    #[test]
    fn spans_are_clipped_to_the_window() {
        let spans = flatten(vec![(0..100, HighlightRole::Comment, 1)], &(10..20));
        assert_eq!(spans[0].range, 10..20);
    }

    #[test]
    fn every_query_compiles() {
        for language in [
            Language::Latex,
            Language::Typst,
            Language::Markdown,
            Language::Bibtex,
        ] {
            let q = HighlightQuery::new(
                language,
                match language {
                    Language::Latex => LATEX,
                    Language::Typst => TYPST,
                    Language::Markdown => MARKDOWN,
                    Language::Bibtex => BIBTEX,
                },
            );
            let q = q.unwrap_or_else(|| panic!("{language:?} query"));
            for (i, name) in q.query.capture_names().iter().enumerate() {
                assert!(
                    name.starts_with('_') || q.roles[i].is_some(),
                    "{language:?}: unknown capture @{name}"
                );
            }
        }
        assert!(inline_query().is_some());
    }
}
