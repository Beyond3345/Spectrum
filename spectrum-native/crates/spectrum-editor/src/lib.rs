//! Code editor. So far the document core: buffer, selections, undo. See `DESIGN.md`.

mod buffer;
mod document;
mod history;
mod selection;

pub use buffer::{Bias, Buffer, Change, LineEnding, Point, PointUtf16};
pub use document::{Applied, Document, Edit, Transaction};
pub use history::{EditKind, GROUP_INTERVAL};
pub use selection::{Selection, SelectionSet};
