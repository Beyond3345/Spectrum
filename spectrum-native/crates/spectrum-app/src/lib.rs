//! Spectrum's app shell. The binary (`main.rs`) opens the windows; this library holds the views
//! and what they share, starting with the Tokio bridge (`spectrum_app::runtime::spawn_tokio`).

pub mod actions;
pub mod file_ops;
pub mod home;
pub mod runtime;
pub mod shell;
pub mod theme_preview;
pub mod workspace;

/// Everything a window needs before it opens: the kit with Spectrum's fonts, the theme and the
/// key bindings.
pub fn init(
    mode: spectrum_theme::ThemeMode,
    style: spectrum_theme::ColourStyle,
    cx: &mut gpui_kit::App,
) {
    spectrum_theme::init(cx);
    spectrum_theme::SpectrumTheme::apply(mode, style, cx);
    actions::bind_keys(cx);
}
