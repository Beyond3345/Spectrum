//! Renders the `PdfPanel` offscreen with the real GPU renderer and PDFium, writing PNGs (same
//! pattern as spectrum-app's snapshot test; session 4b wires the panel into the workspace):
//!
//!     SPECTRUM_SNAPSHOT=1 cargo test -p spectrum-pdf --test snapshot
//!
//! PNGs go to `target/snapshots/pdf-*.png` (or `$SPECTRUM_SNAPSHOT_DIR`). macOS only; skips
//! without PDFium (`cargo xtask fetch-pdfium`).

#![allow(clippy::unwrap_used)]

#[cfg(target_os = "macos")]
mod mac {
    use gpui_kit::{
        AppContext, AssetSource, Context, Entity, Focusable, IntoElement, ParentElement, Render,
        SharedString, Styled, VisualTestAppContext, Window, WindowHandle, base::Root, div, px,
        size,
    };
    use spectrum_pdf::{PageColour, PdfEngine, PdfPanel, Zoom};
    use spectrum_theme::{ColourStyle, SpectrumTheme, ThemeMode};
    use std::borrow::Cow;
    use std::path::PathBuf;
    use std::time::Duration;

    /// The app's assets plus the blueprint's line icons (`assets/icons`), as session 1f serves them.
    struct Assets;

    impl AssetSource for Assets {
        fn load(&self, path: &str) -> gpui_kit::Result<Option<Cow<'static, [u8]>>> {
            if path.starts_with("icons/") {
                let file = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../../assets")
                    .join(path);
                return Ok(std::fs::read(file).ok().map(Cow::Owned));
            }
            spectrum_ui::Assets.load(path)
        }

        fn list(&self, path: &str) -> gpui_kit::Result<Vec<SharedString>> {
            spectrum_ui::Assets.list(path)
        }
    }

    /// The pane as the workspace frames it: app background, 16 px panel.
    struct Frame(Entity<PdfPanel>);

    impl Render for Frame {
        fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
            let theme = cx.global::<SpectrumTheme>();
            div()
                .size_full()
                .p(px(8.))
                .bg(theme.bg_app)
                .child(spectrum_ui::panel(theme).size_full().child(self.0.clone()))
        }
    }

    fn out_dir() -> PathBuf {
        let dir = std::env::var_os("SPECTRUM_SNAPSHOT_DIR").map_or_else(
            || PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/snapshots"),
            PathBuf::from,
        );
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Lets the PDFium thread finish and the panel redraw.
    fn settle(cx: &mut VisualTestAppContext) {
        for _ in 0..40 {
            cx.run_until_parked();
            std::thread::sleep(Duration::from_millis(15));
        }
        cx.run_until_parked();
    }

    fn save(cx: &mut VisualTestAppContext, window: WindowHandle<Root>, name: &str) {
        let image = cx.capture_screenshot(window.into()).unwrap();
        let path = out_dir().join(format!("{name}.png"));
        image.save(&path).unwrap();
        eprintln!("wrote {}", path.display());
    }

    fn open(
        cx: &mut VisualTestAppContext,
        mode: ThemeMode,
        colour: PageColour,
        zoom: Zoom,
    ) -> (WindowHandle<Root>, Entity<PdfPanel>) {
        cx.update(|cx| SpectrumTheme::apply(mode, ColourStyle::Spectrum, cx));
        let mut panel = None;
        let window = cx
            .open_offscreen_window(size(px(640.), px(820.)), |window, cx| {
                let view = cx.new(|cx| PdfPanel::new(window, cx));
                panel = Some(view.clone());
                let frame = cx.new(|_| Frame(view));
                cx.new(|cx| Root::new(frame, window, cx))
            })
            .unwrap();
        let panel = panel.unwrap();
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/three-pages.pdf");
        cx.update(|cx| {
            panel.update(cx, |p, cx| {
                p.set_page_colour(colour, cx);
                p.set_zoom(zoom, cx);
                p.open(fixture, cx);
            });
        });
        settle(cx);
        (window, panel)
    }

    pub fn main() {
        if std::env::var_os("SPECTRUM_SNAPSHOT").is_none() {
            eprintln!("snapshot: skipped (set SPECTRUM_SNAPSHOT=1 to render)");
            return;
        }
        if let Err(e) = PdfEngine::shared() {
            eprintln!("snapshot: skipped ({e})");
            return;
        }
        let platform = gpui_kit::platform::current_platform(false);
        let mut cx = VisualTestAppContext::with_asset_source(platform, std::sync::Arc::new(Assets));
        cx.update(|cx| {
            spectrum_theme::init(cx);
            spectrum_pdf::bind_keys(cx);
        });

        let (window, panel) = open(&mut cx, ThemeMode::Light, PageColour::White, Zoom::FitWidth);
        save(&mut cx, window, "pdf-light");
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/three-pages.pdf");

        // a reload keeps the drawn pages until the new ones are ready: no white flash
        cx.update(|cx| panel.update(cx, |p, cx| p.open(fixture.clone(), cx)));
        cx.run_until_parked();
        let (held, _) = cx.read(|cx| panel.read(cx).cache_bytes());
        assert!(held > 0, "the old pages stay while the reload draws");
        save(&mut cx, window, "pdf-reloading-light");
        settle(&mut cx);

        // Cmd+= zooms in from fit width
        cx.update_window(window.into(), |_, window, cx| {
            window.focus(&panel.focus_handle(cx), cx);
        })
        .unwrap();
        cx.simulate_keystrokes(window.into(), "cmd-=");
        settle(&mut cx);
        let zoom = cx.read(|cx| panel.read(cx).zoom());
        assert!(matches!(zoom, Zoom::Scale(_)), "Cmd+= zooms: {zoom:?}");
        save(&mut cx, window, "pdf-zoomed-light");

        let (window, _) = open(&mut cx, ThemeMode::Light, PageColour::Sepia, Zoom::FitPage);
        save(&mut cx, window, "pdf-sepia-fit-page");
        let (window, _) = open(&mut cx, ThemeMode::Dark, PageColour::Dark, Zoom::FitWidth);
        save(&mut cx, window, "pdf-dark");
        let (window, panel) = open(
            &mut cx,
            ThemeMode::Dark,
            PageColour::Black,
            Zoom::Scale(0.5),
        );
        save(&mut cx, window, "pdf-black-50");
        let pages = cx.read(|cx| panel.read(cx).page());
        assert_eq!(pages, Some((0, 3)));
    }
}

#[cfg(target_os = "macos")]
fn main() {
    mac::main();
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("snapshot: skipped (GPUI's visual test context is macOS-only)");
}
