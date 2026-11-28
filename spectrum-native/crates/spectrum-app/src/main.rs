//! Spectrum: windows, menus, Tokio bridge and workspace.

use gpui_kit::{
    AppContext, Bounds, TitlebarOptions, WindowBackgroundAppearance, WindowBounds, WindowOptions,
    point, px, size,
};
use spectrum_app::theme_preview::ThemePreviewView;
use spectrum_theme::{ColourStyle, SpectrumTheme, ThemeMode};
use std::process::ExitCode;
use std::time::Instant;

fn main() -> ExitCode {
    let started = Instant::now();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();
    if let Err(err) = spectrum_app::runtime::init() {
        tracing::error!(%err, "can't start");
        return ExitCode::FAILURE;
    }

    gpui_kit::application()
        .with_assets(gpui_kit::assets::Assets)
        .run(move |cx| {
            tracing::debug!(elapsed_ms = started.elapsed().as_millis(), "platform up");
            spectrum_theme::init(cx);
            tracing::debug!(
                elapsed_ms = started.elapsed().as_millis(),
                "kit initialised"
            );
            SpectrumTheme::apply(ThemeMode::System, ColourStyle::Spectrum, cx);
            tracing::debug!(elapsed_ms = started.elapsed().as_millis(), "theme applied");

            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    size(px(1180.), px(760.)),
                    cx,
                ))),
                titlebar: Some(TitlebarOptions {
                    title: Some("Spectrum".into()),
                    appears_transparent: true,
                    traffic_light_position: Some(point(px(14.), px(14.))),
                }),
                window_background: WindowBackgroundAppearance::Blurred,
                window_min_size: Some(size(px(720.), px(480.))),
                app_id: Some("com.beyond3345.spectrum".into()),
                ..WindowOptions::default()
            };
            let opened = gpui_kit::open_window(options, cx, |window, cx| {
                cx.new(|cx| ThemePreviewView::new(window, cx))
            });
            match opened {
                Ok(_) => tracing::info!(elapsed_ms = started.elapsed().as_millis(), "window open"),
                Err(err) => {
                    tracing::error!(%err, "can't open the window");
                    cx.quit();
                }
            }
        });
    ExitCode::SUCCESS
}
