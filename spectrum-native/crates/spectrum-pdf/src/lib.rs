//! PDFium viewer, tile cache, SyncTeX overlays and notes.
//!
//! Session 4a: the PDFium thread ([`PdfEngine`]), page colours ([`PageColour`]), the byte-bounded
//! [`cache::TileCache`], the column [`layout`] and the [`PdfPanel`] view. Selection, links, search,
//! the SyncTeX pulse and notes are session 4b's.

// pixel and point geometry: sizes are far inside f32's exact range and never negative
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]

pub mod cache;
mod colour;
mod engine;
pub mod layout;

pub use colour::PageColour;
pub use engine::{
    Bitmap, DocId, PageSize, PdfDoc, PdfEngine, PdfError, PixelRect, RenderRequest, candidates,
    find_library, page_pixels,
};
