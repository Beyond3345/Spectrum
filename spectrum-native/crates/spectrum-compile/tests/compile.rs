//! Real compiles of `tests/fixtures/compile` with the engines on this computer (the PATH, `MacTeX`'s texbin,
//! Homebrew). An engine that isn't installed skips its test with a line saying so.
#![allow(clippy::unwrap_used, reason = "test helpers outside #[test] functions")]

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use spectrum_compile::{
    CancelToken, CompileEvent, CompileOutcome, CompileRequest, CompileStatus, EngineManifest,
    Engines, LatexEngine, MarkdownEngine, Runner, Severity, Toolchain, compile, find_executable,
};
use spectrum_core::AppPaths;
use tokio::sync::mpsc;

fn search_path() -> OsString {
    let path = std::env::var("PATH").unwrap_or_default();
    if cfg!(windows) {
        return path.into();
    }
    spectrum_compile::unix_search_path(&path, &std::env::var("HOME").unwrap_or_default()).into()
}

/// A project copied from the fixtures, a data folder and a "bundled" folder holding the Typst and Tectonic
/// found on this computer, as the app carries them.
struct Setup {
    dir: tempfile::TempDir,
    toolchain: Toolchain,
}

impl Setup {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        copy_dir(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/compile"),
            &project,
        );
        let bundled = dir.path().join("app");
        std::fs::create_dir_all(&bundled).unwrap();
        let path = search_path();
        for name in ["typst", "tectonic"] {
            if let Some(found) = find_executable(name, &path) {
                let to = bundled.join(format!("{name}{}", std::env::consts::EXE_SUFFIX));
                #[cfg(unix)]
                std::os::unix::fs::symlink(&found, &to).unwrap();
                #[cfg(not(unix))]
                std::fs::copy(&found, &to).unwrap();
            }
        }
        let data = dir.path().join("data");
        let paths = AppPaths::new(data.clone(), data.join("logs"), dir.path().into());
        let engines = Engines::new(
            &paths,
            Some(bundled),
            path,
            &EngineManifest::bundled().unwrap(),
        );
        let toolchain = Toolchain::new(engines, &data);
        Self { dir, toolchain }
    }

    fn project(&self) -> PathBuf {
        self.dir.path().join("project")
    }

    fn request(&self, main: &str, engine: LatexEngine) -> CompileRequest {
        let mut request = CompileRequest::new(
            self.project(),
            main.into(),
            self.dir.path().join("build").join(main),
        );
        request.engine = engine;
        request
    }

    fn has(&self, program: &str) -> bool {
        let found = self.toolchain.engines.find(program).is_some();
        if !found {
            eprintln!("skipped: {program} isn't installed on this computer");
        }
        found
    }

    async fn run(&self, request: &CompileRequest) -> (CompileOutcome, Vec<CompileEvent>) {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let outcome = compile(&self.toolchain, request, Some(tx), &CancelToken::new()).await;
        let mut events = Vec::new();
        while let Ok(event) = rx.try_recv() {
            events.push(event);
        }
        (outcome, events)
    }
}

fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), &target).unwrap();
        }
    }
}

fn assert_built(setup: &Setup, outcome: &CompileOutcome, pdf_name: &str) {
    assert_eq!(
        outcome.status,
        CompileStatus::Succeeded,
        "{:?}\n{}",
        outcome.error,
        outcome.log
    );
    let pdf = outcome.pdf.as_ref().unwrap();
    assert!(std::fs::read(pdf).unwrap().starts_with(b"%PDF"));
    assert_eq!(outcome.pdf_copy, Some(setup.project().join(pdf_name)));
    assert!(setup.project().join(pdf_name).is_file());
}

/// A full LaTeX document: references, an \include'd chapter, a BibTeX bibliography, SyncTeX.
async fn full_document(engine: LatexEngine) {
    let setup = Setup::new();
    if !setup.has(engine.name()) {
        return;
    }
    let (outcome, events) = setup.run(&setup.request("main.tex", engine)).await;
    assert_built(&setup, &outcome, "main.pdf");
    assert_eq!(outcome.engine, engine.name());
    assert!(outcome.synctex.as_ref().unwrap().is_file());
    assert!(events.contains(&CompileEvent::Engine(engine.name().into())));
    assert!(
        events
            .iter()
            .any(|e| matches!(e, CompileEvent::Output(l) if l.contains("TeX")))
    );
    let unresolved: Vec<_> = outcome
        .diagnostics
        .iter()
        .filter(|d| d.message.contains("undefined"))
        .collect();
    assert!(unresolved.is_empty(), "{unresolved:?}\n{}", outcome.log);
}

#[tokio::test]
async fn pdflatex_compiles_a_full_document() {
    full_document(LatexEngine::PdfLatex).await;
}

#[tokio::test]
async fn xelatex_compiles_a_full_document() {
    full_document(LatexEngine::XeLatex).await;
}

#[tokio::test]
async fn lualatex_compiles_a_full_document() {
    full_document(LatexEngine::LuaLatex).await;
}

#[tokio::test]
async fn latexmk_compiles_a_full_document() {
    full_document(LatexEngine::Latexmk).await;
}

#[tokio::test]
async fn tectonic_compiles_a_full_document() {
    let setup = Setup::new();
    if !setup.has("tectonic") {
        return;
    }
    let (outcome, _) = setup
        .run(&setup.request("main.tex", LatexEngine::Tectonic))
        .await;
    if outcome
        .error
        .as_deref()
        .is_some_and(|e| e.contains("server"))
    {
        eprintln!("skipped: Tectonic couldn't download its bundle (offline)");
        return;
    }
    assert_built(&setup, &outcome, "main.pdf");
    assert!(outcome.synctex.as_ref().unwrap().is_file());
}

#[tokio::test]
async fn a_chapter_compiles_its_tex_root() {
    let setup = Setup::new();
    if !setup.has("pdflatex") {
        return;
    }
    let mut request = setup.request("chapters/one.tex", LatexEngine::PdfLatex);
    request.draft = true;
    let (outcome, _) = setup.run(&request).await;
    assert_built(&setup, &outcome, "main.pdf");
}

#[tokio::test]
async fn auto_picks_an_installed_engine() {
    let setup = Setup::new();
    if !setup.has("pdflatex") {
        return;
    }
    let (outcome, _) = setup
        .run(&setup.request("main.tex", LatexEngine::Auto))
        .await;
    assert_built(&setup, &outcome, "main.pdf");
    assert_eq!(outcome.engine, "pdflatex");
}

#[tokio::test]
async fn errors_come_back_as_diagnostics_at_their_line() {
    let setup = Setup::new();
    if !setup.has("pdflatex") {
        return;
    }
    let (outcome, _) = setup
        .run(&setup.request("broken.tex", LatexEngine::PdfLatex))
        .await;
    assert_eq!(outcome.status, CompileStatus::Failed);
    let error = outcome
        .diagnostics
        .iter()
        .find(|d| d.severity == Severity::Error)
        .unwrap();
    assert_eq!(error.path.as_deref(), Some(Path::new("broken.tex")));
    assert_eq!(error.line, Some(4));
    assert!(error.message.contains("Undefined control sequence"));
}

#[tokio::test]
async fn typst_compiles_and_reports_errors() {
    let setup = Setup::new();
    if setup.toolchain.engines.typst(None).is_none() {
        eprintln!("skipped: typst isn't installed on this computer");
        return;
    }
    let (outcome, events) = setup
        .run(&setup.request("main.typ", LatexEngine::Auto))
        .await;
    assert_built(&setup, &outcome, "main.pdf");
    assert_eq!(outcome.engine, "typst");
    assert!(outcome.synctex.is_none());
    assert!(events.contains(&CompileEvent::Engine("typst".into())));

    let (broken, _) = setup
        .run(&setup.request("broken.typ", LatexEngine::Auto))
        .await;
    assert_eq!(broken.status, CompileStatus::Failed);
    let error = &broken.diagnostics[0];
    assert_eq!(error.path.as_deref(), Some(Path::new("broken.typ")));
    assert_eq!(error.line, Some(2));
}

#[tokio::test]
async fn markdown_compiles_through_pandoc_and_latex() {
    let setup = Setup::new();
    if !setup.has("pandoc") || !setup.has("pdflatex") {
        return;
    }
    let (outcome, _) = setup
        .run(&setup.request("notes.md", LatexEngine::PdfLatex))
        .await;
    assert_built(&setup, &outcome, "notes.pdf");
    assert!(outcome.synctex.is_none());
}

#[tokio::test]
async fn markdown_compiles_through_pandoc_and_typst() {
    let setup = Setup::new();
    if !setup.has("pandoc") || setup.toolchain.engines.typst(None).is_none() {
        return;
    }
    let mut request = setup.request("notes.md", LatexEngine::Auto);
    request.markdown_engine = MarkdownEngine::Typst;
    let (outcome, _) = setup.run(&request).await;
    if let Some(error) = outcome.error.as_deref().filter(|e| e.contains("or later")) {
        eprintln!("skipped: {error}");
        return;
    }
    assert_built(&setup, &outcome, "notes.pdf");
    assert_eq!(outcome.engine, "typst");
}

#[tokio::test]
async fn a_newer_compile_cancels_the_running_one() {
    let setup = Setup::new();
    if !setup.has("pdflatex") {
        return;
    }
    let runner = std::sync::Arc::new(Runner::new());
    let looping = setup.request("forever.tex", LatexEngine::PdfLatex);
    let first = {
        let (runner, toolchain) = (runner.clone(), setup.toolchain.clone());
        tokio::spawn(async move { runner.compile(&toolchain, &looping, None).await })
    };
    tokio::time::sleep(Duration::from_secs(1)).await;
    let started = std::time::Instant::now();
    let second = runner
        .compile(
            &setup.toolchain,
            &setup.request("broken.tex", LatexEngine::PdfLatex),
            None,
        )
        .await;
    let first = first.await.unwrap();
    assert_eq!(first.status, CompileStatus::Stopped);
    assert_eq!(second.status, CompileStatus::Failed);
    assert!(started.elapsed() < Duration::from_secs(30));
}
