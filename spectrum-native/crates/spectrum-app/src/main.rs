//! Spectrum: windows, menus, Tokio bridge and workspace.

use gpui_kit::{
    AppContext, Bounds, WindowBackgroundAppearance, WindowBounds, WindowOptions, px, size,
};
use spectrum_app::shell::ShellView;
use spectrum_core::AppPaths;
use spectrum_theme::{ColourStyle, ThemeMode};
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
    let paths = match AppPaths::system() {
        Ok(paths) => paths,
        Err(err) => {
            tracing::error!(%err, "can't find the app's folders");
            return ExitCode::FAILURE;
        }
    };

    gpui_kit::application()
        .with_assets(spectrum_ui::Assets)
        .run(move |cx| {
            tracing::debug!(elapsed_ms = started.elapsed().as_millis(), "platform up");
            spectrum_app::init(ThemeMode::System, ColourStyle::Spectrum, cx);
            tracing::debug!(elapsed_ms = started.elapsed().as_millis(), "theme applied");

            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    size(px(1280.), px(800.)),
                    cx,
                ))),
                titlebar: Some(spectrum_ui::titlebar_options("Spectrum")),
                // the title bar moves the window itself (spectrum_ui::TitleBar)
                app_owns_titlebar_drag: true,
                window_background: WindowBackgroundAppearance::Blurred,
                window_min_size: Some(size(px(860.), px(520.))),
                app_id: Some("com.beyond3345.spectrum".into()),
                ..WindowOptions::default()
            };
            let opened = gpui_kit::open_window(options, cx, |window, cx| {
                cx.new(|cx| ShellView::new(paths, window, cx))
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
