//! Code editor. So far the document core (buffer, selections, undo) and the language layer
//! (syntax trees, highlighting, outline, folds, scope bars, to-dos). See `DESIGN.md`.

mod buffer;
mod document;
mod history;
mod scope;
mod selection;
mod syntax;
mod todos;

pub use buffer::{Bias, Buffer, Change, LineEnding, Point, PointUtf16};
pub use document::{Applied, Document, Edit, Transaction};
pub use history::{EditKind, GROUP_INTERVAL};
pub use scope::{MAX_SCOPE_DEPTH, Scope, ScopeMap};
pub use selection::{Selection, SelectionSet};
pub use syntax::{
    BACKGROUND_PARSE_BYTES, FoldRange, HIGHLIGHT_OVERSCAN, HighlightRole, HighlightSpan, Language,
    OutlineItem, OutlineKind, ParsedTree, Syntax,
};
pub use todos::{Todo, todos};
