//! Renders views offscreen with the real GPU renderer and writes PNGs, so a session can look at
//! what it built without a screen recording permission. It opens real (offscreen) windows, so the
//! gate's plain `cargo test` skips it; run it on a Mac with:
//!
//!     SPECTRUM_SNAPSHOT=1 cargo test -p spectrum-app --test snapshot
//!
//! PNGs go to `target/snapshots/` (or `$SPECTRUM_SNAPSHOT_DIR`).

// a test binary with its own main (see Cargo.toml), so clippy's test exemption doesn't reach it
#![allow(clippy::unwrap_used)]

use gpui_kit::{AppContext, VisualTestAppContext, px, size};
use spectrum_app::theme_preview::ThemePreviewView;
use spectrum_theme::{ColourStyle, SpectrumTheme, ThemeMode};
use std::path::PathBuf;

fn out_dir() -> PathBuf {
    let dir = std::env::var_os("SPECTRUM_SNAPSHOT_DIR").map_or_else(
        || PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/snapshots"),
        PathBuf::from,
    );
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn main() {
    if std::env::var_os("SPECTRUM_SNAPSHOT").is_none() {
        eprintln!("snapshot: skipped (set SPECTRUM_SNAPSHOT=1 to render)");
        return;
    }
    let platform = gpui_kit::platform::current_platform(false);
    let mut cx = VisualTestAppContext::with_asset_source(
        platform,
        std::sync::Arc::new(gpui_kit::assets::Assets),
    );
    for (name, mode, style) in [
        ("theme-light", ThemeMode::Light, ColourStyle::Spectrum),
        ("theme-dark", ThemeMode::Dark, ColourStyle::Spectrum),
        ("theme-dark-simple", ThemeMode::Dark, ColourStyle::Simple),
    ] {
        cx.update(|cx| {
            spectrum_theme::init(cx);
            SpectrumTheme::apply(mode, style, cx);
        });
        let window = cx
            .open_offscreen_window(size(px(1180.), px(760.)), |window, cx| {
                cx.new(|cx| ThemePreviewView::new(window, cx))
            })
            .unwrap();
        cx.run_until_parked();
        let image = cx.capture_screenshot(window.into()).unwrap();
        let path = out_dir().join(format!("{name}.png"));
        image.save(&path).unwrap();
        eprintln!("wrote {}", path.display());
    }
}
