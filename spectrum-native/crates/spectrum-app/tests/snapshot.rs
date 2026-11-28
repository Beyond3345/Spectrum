//! Renders views offscreen with the real GPU renderer and writes PNGs, so a session can look at
//! what it built without a screen recording permission. It opens real (offscreen) windows, so the
//! gate's plain `cargo test` skips it; run it on a Mac with:
//!
//!     SPECTRUM_SNAPSHOT=1 cargo test -p spectrum-app --test snapshot
//!
//! PNGs go to `target/snapshots/` (or `$SPECTRUM_SNAPSHOT_DIR`). GPUI's visual test context is
//! macOS-only, so elsewhere this binary only says it skipped.

// a test binary with its own main (see Cargo.toml), so clippy's test exemption doesn't reach it
#![allow(clippy::unwrap_used)]

#[cfg(target_os = "macos")]
mod mac {
    use gpui_kit::{AppContext, Entity, VisualTestAppContext, WindowHandle, base::Root, px, size};
    use spectrum_app::shell::ShellView;
    use spectrum_app::theme_preview::ThemePreviewView;
    use spectrum_core::AppPaths;
    use spectrum_theme::{ColourStyle, ThemeMode};
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    fn out_dir() -> PathBuf {
        let dir = std::env::var_os("SPECTRUM_SNAPSHOT_DIR").map_or_else(
            || PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/snapshots"),
            PathBuf::from,
        );
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Lets background file IO finish and the views redraw.
    fn settle(cx: &mut VisualTestAppContext) {
        for _ in 0..20 {
            cx.run_until_parked();
            std::thread::sleep(Duration::from_millis(15));
        }
        cx.run_until_parked();
    }

    fn save(cx: &mut VisualTestAppContext, window: WindowHandle<Root>, name: &str) {
        settle(cx);
        let image = cx.capture_screenshot(window.into()).unwrap();
        let path = out_dir().join(format!("{name}.png"));
        image.save(&path).unwrap();
        eprintln!("wrote {}", path.display());
    }

    /// The mockup's project: main.tex, refs.bib, diagrams/circuit.tex, figures/plot.pdf.
    fn mockup_project(dir: &Path) -> PathBuf {
        let root = dir.join("thesis-2026");
        for (rel, text) in [
            (
                "main.tex",
                "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n",
            ),
            ("refs.bib", "@book{knuth, title={The TeXbook}}\n"),
            (
                "diagrams/circuit.tex",
                "\\begin{circuitikz}\\end{circuitikz}\n",
            ),
            ("figures/plot.pdf", "%PDF-1.4\n"),
        ] {
            let file = root.join(rel);
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(file, text).unwrap();
        }
        root
    }

    fn app_paths(dir: &Path) -> AppPaths {
        AppPaths::new(dir.join("data"), dir.join("logs"), dir.join("Spectrum"))
    }

    fn open_shell(
        cx: &mut VisualTestAppContext,
        paths: AppPaths,
    ) -> (WindowHandle<Root>, Entity<ShellView>) {
        let mut shell = None;
        let window = cx
            .open_offscreen_window(size(px(1280.), px(800.)), |window, cx| {
                let view = cx.new(|cx| ShellView::new(paths, window, cx));
                shell = Some(view.clone());
                cx.new(|cx| Root::new(view, window, cx))
            })
            .unwrap();
        (window, shell.unwrap())
    }

    fn set_theme(cx: &mut VisualTestAppContext, mode: ThemeMode, style: ColourStyle) {
        cx.update(|cx| spectrum_app::init(mode, style, cx));
    }

    pub fn main() {
        if std::env::var_os("SPECTRUM_SNAPSHOT").is_none() {
            eprintln!("snapshot: skipped (set SPECTRUM_SNAPSHOT=1 to render)");
            return;
        }
        let platform = gpui_kit::platform::current_platform(false);
        let mut cx = VisualTestAppContext::with_asset_source(
            platform,
            std::sync::Arc::new(spectrum_ui::Assets),
        );

        for (name, mode, style) in [
            ("theme-light", ThemeMode::Light, ColourStyle::Spectrum),
            ("theme-dark", ThemeMode::Dark, ColourStyle::Spectrum),
            ("theme-dark-simple", ThemeMode::Dark, ColourStyle::Simple),
        ] {
            set_theme(&mut cx, mode, style);
            let window = cx
                .open_offscreen_window(size(px(1180.), px(760.)), |window, cx| {
                    let view = cx.new(|cx| ThemePreviewView::new(window, cx));
                    cx.new(|cx| Root::new(view, window, cx))
                })
                .unwrap();
            save(&mut cx, window, name);
        }

        let temp = tempfile::tempdir().unwrap();
        let paths = app_paths(temp.path());
        for name in [
            "thesis-2026",
            "Algebra notes",
            "Circuits lab report",
            "Typst slides",
        ] {
            spectrum_app::home::new_project(&paths, name).unwrap();
        }
        let project = mockup_project(temp.path());

        for (suffix, mode) in [("light", ThemeMode::Light), ("dark", ThemeMode::Dark)] {
            set_theme(&mut cx, mode, ColourStyle::Spectrum);
            let (window, _) = open_shell(&mut cx, paths.clone());
            save(&mut cx, window, &format!("home-{suffix}"));

            let (window, shell) = open_shell(&mut cx, paths.clone());
            cx.update_window(window.into(), |_, window, cx| {
                shell.update(cx, |s, cx| s.open_project(project.clone(), window, cx));
            })
            .unwrap();
            save(&mut cx, window, &format!("workspace-{suffix}"));

            // the real key binding opens the palette
            cx.simulate_keystrokes(window.into(), "cmd-shift-p");
            settle(&mut cx);
            assert!(
                cx.read(|cx| shell.read(cx).palette().is_some()),
                "Cmd+Shift+P opens the Command Palette"
            );
            save(&mut cx, window, &format!("palette-{suffix}"));
            cx.simulate_keystrokes(window.into(), "escape");
            settle(&mut cx);
            assert!(
                cx.read(|cx| shell.read(cx).palette().is_none()),
                "Escape closes it"
            );

            // Quick Open finds a file by a few letters
            cx.simulate_keystrokes(window.into(), "cmd-p");
            settle(&mut cx);
            cx.simulate_input(window.into(), "circ");
            settle(&mut cx);
            let listed = cx.read(|cx| {
                let palette = shell.read(cx).palette().unwrap();
                palette.read(cx).listed().len()
            });
            assert_eq!(listed, 1, "Quick Open narrows to diagrams/circuit.tex");
            save(&mut cx, window, &format!("quick-open-{suffix}"));
        }
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
