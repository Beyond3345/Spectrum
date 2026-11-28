//! Tree-sitter: one syntax tree per document, kept in step with every change.
//!
//! A small file is parsed on the spot ([`Syntax::parse`]). A big one is parsed off the UI thread:
//! the view hands [`ParsedTree::parse`] a rope snapshot (`buffer.rope().clone()` is O(1)) on a
//! background task and gives the result to [`Syntax::accept`]. Edits made meanwhile are kept and
//! replayed onto the new tree, so typing during the parse loses nothing. After that every change
//! reparses incrementally on the UI thread ([`Syntax::edit`]).

mod folds;
mod highlight;
mod language;
mod outline;

use ropey::Rope;
use tree_sitter::{InputEdit, Node, Parser, Tree};

use crate::buffer::{Buffer, Change, Point};

pub use folds::FoldRange;
pub use highlight::{HIGHLIGHT_OVERSCAN, HighlightRole, HighlightSpan};
pub use language::Language;
pub use outline::{OutlineItem, OutlineKind};

/// Files at least this big should get their first parse on a background task (about 10 ms of
/// parsing on an M-series Mac); smaller ones can call [`Syntax::parse`] directly.
pub const BACKGROUND_PARSE_BYTES: usize = 100_000;

/// A tree parsed from a snapshot, on any thread, waiting for [`Syntax::accept`].
#[derive(Debug)]
pub struct ParsedTree {
    language: Language,
    version: u64,
    tree: Option<Tree>,
}

impl ParsedTree {
    /// Parses a snapshot from scratch. Slow for big files (about 120 ms for 20,000 lines of
    /// LaTeX), so call it from a background task. `version` is the buffer's version when the
    /// snapshot was taken.
    pub fn parse(language: Language, rope: &Rope, version: u64) -> Self {
        // compiling the highlight query takes tens of milliseconds once per run: do it here too
        highlight::warm(language);
        Self {
            language,
            version,
            tree: new_parser(language).and_then(|mut parser| parse_rope(&mut parser, rope, None)),
        }
    }

    pub fn version(&self) -> u64 {
        self.version
    }
}

/// The syntax tree of one document and the parser that keeps it current.
pub struct Syntax {
    language: Language,
    parser: Option<Parser>,
    tree: Option<Tree>,
    /// The buffer version `tree` describes, or that `pending` has reached while there is none.
    version: u64,
    /// Edits made while waiting for a background parse, each with the version it produced.
    pending: Vec<(u64, InputEdit)>,
}

impl std::fmt::Debug for Syntax {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Syntax")
            .field("language", &self.language)
            .field("version", &self.version)
            .field("has_tree", &self.tree.is_some())
            .field("pending", &self.pending.len())
            .finish_non_exhaustive()
    }
}

impl Syntax {
    /// No tree yet: call [`Syntax::parse`], or run [`ParsedTree::parse`] in the background and
    /// [`Syntax::accept`] its result. `buffer` is the one the tree will describe.
    pub fn new(language: Language, buffer: &Buffer) -> Self {
        Self {
            language,
            parser: new_parser(language),
            tree: None,
            version: buffer.version(),
            pending: Vec::new(),
        }
    }

    pub fn language(&self) -> Language {
        self.language
    }

    /// The tree, once there is one. It describes the buffer at [`Syntax::version`].
    pub fn tree(&self) -> Option<&Tree> {
        self.tree.as_ref()
    }

    pub fn version(&self) -> u64 {
        self.version
    }

    /// Parses the whole buffer now, on this thread.
    pub fn parse(&mut self, buffer: &Buffer) {
        self.tree = self
            .parser
            .as_mut()
            .and_then(|parser| parse_rope(parser, buffer.rope(), None));
        self.version = buffer.version();
        self.pending.clear();
    }

    /// Takes a background parse. Edits made since its snapshot are replayed onto it and
    /// reparsed incrementally. Returns false, and changes nothing, when the result is for another
    /// language, a tree is already here, or an edit since the snapshot is missing (the caller
    /// then parses again).
    pub fn accept(&mut self, parsed: ParsedTree, buffer: &Buffer) -> bool {
        let Some(mut tree) = parsed.tree else {
            return false;
        };
        let since = buffer.version().saturating_sub(parsed.version);
        let replay: Vec<&InputEdit> = self
            .pending
            .iter()
            .filter(|(version, _)| *version > parsed.version)
            .map(|(_, edit)| edit)
            .collect();
        if parsed.language != self.language
            || self.tree.is_some()
            || parsed.version > buffer.version()
            || self.version != buffer.version()
            || replay.len() as u64 != since
        {
            return false;
        }
        for edit in replay {
            tree.edit(edit);
        }
        if since > 0 {
            let Some(parser) = self.parser.as_mut() else {
                return false;
            };
            match parse_rope(parser, buffer.rope(), Some(&tree)) {
                Some(new) => tree = new,
                None => return false,
            }
        }
        self.tree = Some(tree);
        self.pending.clear();
        true
    }

    /// Follows one transaction, undo or redo: `changes` are `Applied::changes`, in order, and
    /// `buffer` is the buffer after them. With a tree this reparses incrementally (well under a
    /// millisecond for a keystroke); without one the edits wait for [`Syntax::accept`].
    pub fn edit(&mut self, buffer: &Buffer, changes: &[Change]) {
        if self.version + changes.len() as u64 != buffer.version() {
            tracing::warn!(
                had = self.version,
                now = buffer.version(),
                changes = changes.len(),
                "syntax tree missed an edit; parsing again"
            );
            if self.tree.is_some() {
                self.parse(buffer);
            } else {
                // a background parse that is still running cannot catch up now
                self.pending.clear();
                self.version = buffer.version();
            }
            return;
        }
        for (i, change) in changes.iter().enumerate() {
            let edit = input_edit(change);
            match self.tree.as_mut() {
                Some(tree) => tree.edit(&edit),
                None => self.pending.push((self.version + i as u64 + 1, edit)),
            }
        }
        self.version = buffer.version();
        if let (Some(tree), Some(parser)) = (self.tree.as_ref(), self.parser.as_mut()) {
            self.tree = parse_rope(parser, buffer.rope(), Some(tree));
        }
    }

    /// The tree if it describes `buffer` as it is now.
    fn current_tree(&self, buffer: &Buffer) -> Option<&Tree> {
        self.tree
            .as_ref()
            .filter(|_| self.version == buffer.version())
    }
}

fn new_parser(language: Language) -> Option<Parser> {
    let mut parser = Parser::new();
    match parser.set_language(&language.grammar()) {
        Ok(()) => Some(parser),
        Err(error) => {
            tracing::error!(?language, %error, "grammar does not load");
            None
        }
    }
}

fn parse_rope(parser: &mut Parser, rope: &Rope, old: Option<&Tree>) -> Option<Tree> {
    parser.parse_with_options(&mut |byte, _| rope_bytes(rope, byte), old, None)
}

/// The rope's bytes from `byte` to the end of the chunk holding it.
fn rope_bytes(rope: &Rope, byte: usize) -> &[u8] {
    if byte >= rope.len() {
        return &[];
    }
    let (chunk, start) = rope.chunk(byte);
    &chunk.as_bytes()[byte - start..]
}

fn ts_point(point: Point) -> tree_sitter::Point {
    tree_sitter::Point::new(point.line, point.column)
}

fn input_edit(change: &Change) -> InputEdit {
    InputEdit {
        start_byte: change.start,
        old_end_byte: change.old_end(),
        new_end_byte: change.new_end(),
        start_position: ts_point(change.start_point),
        old_end_position: ts_point(change.old_end_point),
        new_end_position: ts_point(change.new_end_point),
    }
}

/// A node's text, for titles and keys. Clamped to whole characters.
fn node_text(buffer: &Buffer, node: Node<'_>) -> String {
    buffer.slice(node.byte_range()).to_string()
}

/// Lets queries with text predicates read the rope.
struct RopeText<'a>(&'a Rope);

impl<'a> tree_sitter::TextProvider<&'a [u8]> for RopeText<'a> {
    type I = std::iter::Map<ropey::iter::Chunks<'a>, fn(&'a str) -> &'a [u8]>;

    fn text(&mut self, node: Node<'_>) -> Self::I {
        let range = node.byte_range();
        let end = self.0.ceil_char_boundary(range.end.min(self.0.len()));
        let start = self.0.floor_char_boundary(range.start.min(end));
        self.0.slice(start..end).chunks().map(str::as_bytes)
    }
}

/// The line a node really ends on: Markdown blocks end at column 0 of the line after them.
fn last_line(node: Node<'_>) -> usize {
    let start = node.start_position().row;
    let end = node.end_position();
    if end.column == 0 && end.row > start {
        end.row - 1
    } else {
        end.row
    }
}

/// Visits the tree depth-first in document order; `enter(node)` says whether to go into the
/// node's children. Pruning the prose this way is what keeps outline and folds fast: a query
/// over every node of a 20k-line .tex takes about 50 ms.
fn walk<'t>(tree: &'t Tree, mut enter: impl FnMut(Node<'t>) -> bool) {
    let mut cursor = tree.walk();
    loop {
        if enter(cursor.node()) && cursor.goto_first_child() {
            continue;
        }
        loop {
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() {
                return;
            }
        }
    }
}

/// A query compiled once per process. Every query in this crate is tested to compile.
fn compile(language: Language, source: &str) -> Option<tree_sitter::Query> {
    match tree_sitter::Query::new(&language.grammar(), source) {
        Ok(query) => Some(query),
        Err(error) => {
            tracing::error!(?language, %error, "query does not compile");
            None
        }
    }
}

#[cfg(test)]
mod tests;
