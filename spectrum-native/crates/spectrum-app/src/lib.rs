//! Spectrum's app shell. The binary (`main.rs`) opens the windows; this library holds the views
//! and what they share, starting with the Tokio bridge (`spectrum_app::runtime::spawn_tokio`).

pub mod runtime;
pub mod theme_preview;
