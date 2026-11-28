//! Compile jobs: a LaTeX document with Tectonic, pdfLaTeX, `XeLaTeX`, `LuaLaTeX` or Latexmk (or Auto), a Typst
//! document, or Markdown through pandoc and LaTeX or Typst, as 2.8's `compileService.js`, `typstService.js` and
//! `markdownService.js` ran them. Output streams as it comes; a newer compile cancels the one running.

mod command;
mod files;
mod latex;
mod markdown;
mod typst;

use std::path::{Path, PathBuf};

use tokio::sync::mpsc;

use crate::process::LogSink;
use crate::{CancelToken, Diagnostic, Engines};

/// The LaTeX engine a compile asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LatexEngine {
    /// A `% !TEX program` comment's engine, else pdfLaTeX or `XeLaTeX` by the preamble, falling back to what is
    /// installed, and to `XeLaTeX` when pdfLaTeX can't load the document's fonts.
    #[default]
    Auto,
    PdfLatex,
    XeLatex,
    LuaLatex,
    Latexmk,
    Tectonic,
}

impl LatexEngine {
    /// The program's name, as settings store it (`pdflatex`, `tectonic`, `auto`).
    pub fn name(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::PdfLatex => "pdflatex",
            Self::XeLatex => "xelatex",
            Self::LuaLatex => "lualatex",
            Self::Latexmk => "latexmk",
            Self::Tectonic => "tectonic",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        [
            Self::Auto,
            Self::PdfLatex,
            Self::XeLatex,
            Self::LuaLatex,
            Self::Latexmk,
            Self::Tectonic,
        ]
        .into_iter()
        .find(|e| e.name() == name)
    }

    /// pdfLaTeX, `XeLaTeX` and `LuaLaTeX`, which Spectrum runs pass by pass with BibTeX or Biber between.
    fn multi_pass(self) -> bool {
        matches!(self, Self::PdfLatex | Self::XeLatex | Self::LuaLatex)
    }
}

/// What a Markdown document's PDF is made with after pandoc.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MarkdownEngine {
    #[default]
    Latex,
    Typst,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BibTool {
    /// A `% !BIB program` comment's, else Biber for biblatex and BibTeX otherwise.
    #[default]
    Auto,
    Bibtex,
    Biber,
}

/// How far a compile is trusted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Trust {
    /// TeX's restricted shell escape, and on a Mac the compile sandbox.
    #[default]
    Normal,
    /// Trust this project: full shell escape, TeX writes anywhere, no sandbox.
    Trusted,
    /// An agent's draft: no shell escape at all.
    Untrusted,
}

/// One compile.
#[derive(Debug, Clone)]
pub struct CompileRequest {
    pub project_root: PathBuf,
    /// The main file, relative to the project (`chapters/thesis.tex`, `main.typ`, `notes.md`).
    pub main_file: PathBuf,
    /// The build folder this compile owns (emptied first): the engine's files, the PDF and `SyncTeX` are left
    /// here. Its siblings `<out_dir>-tmp` and `<out_dir>-md` hold temp files and pandoc's output.
    pub out_dir: PathBuf,
    pub engine: LatexEngine,
    pub markdown_engine: MarkdownEngine,
    pub bib_tool: BibTool,
    pub trust: Trust,
    /// Stop at the first error.
    pub halt_on_error: bool,
    /// One pass, images as boxes.
    pub draft: bool,
    /// The project's Typst pin (or the app's default); `None` is the built-in Typst.
    pub typst_version: Option<String>,
    /// The document's `sys.inputs`.
    pub typst_inputs: Vec<(String, String)>,
}

impl CompileRequest {
    pub fn new(project_root: PathBuf, main_file: PathBuf, out_dir: PathBuf) -> Self {
        Self {
            project_root,
            main_file,
            out_dir,
            engine: LatexEngine::Auto,
            markdown_engine: MarkdownEngine::Latex,
            bib_tool: BibTool::Auto,
            trust: Trust::Normal,
            halt_on_error: false,
            draft: false,
            typst_version: None,
            typst_inputs: Vec::new(),
        }
    }
}

/// What every compile on this computer shares.
#[derive(Debug, Clone)]
pub struct Toolchain {
    pub engines: Engines,
    /// Typst's package cache (`DATA_DIR/typst/packages`).
    pub typst_packages: PathBuf,
    /// More `--font-path` folders for Typst after the project's `fonts/` (the bundled CJK fonts).
    pub typst_fonts: Vec<PathBuf>,
    /// pandoc's default citation style (2.8's `data/csl/apa.csl`).
    pub csl: Option<PathBuf>,
    /// Spectrum's pandoc filter for `@fig:x` cross-references (2.8's `data/pandoc/crossref.lua`).
    pub crossref_filter: Option<PathBuf>,
}

impl Toolchain {
    pub fn new(engines: Engines, data_dir: &Path) -> Self {
        Self {
            engines,
            typst_packages: data_dir.join("typst").join("packages"),
            typst_fonts: Vec::new(),
            csl: None,
            crossref_filter: None,
        }
    }
}

/// What a running compile reports.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompileEvent {
    /// The engine a compile (or Auto's retry) is running.
    Engine(String),
    /// One line of output, as it came.
    Output(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompileStatus {
    /// A PDF, and the engine exited without errors.
    Succeeded,
    /// Errors; `pdf` may still be there (TeX carries on past errors).
    Failed,
    Stopped,
    TimedOut,
}

#[derive(Debug, Clone)]
pub struct CompileOutcome {
    pub status: CompileStatus,
    /// The engine that ran (`pdflatex`, `typst`, …), which Auto and Markdown decide.
    pub engine: String,
    pub exit_code: Option<i32>,
    /// Errors first. Paths are the project's files where the log's names can be matched to one.
    pub diagnostics: Vec<Diagnostic>,
    /// The fresh PDF in the build folder.
    pub pdf: Option<PathBuf>,
    /// The copy beside the source (`chapters/thesis.pdf`); `None` when it couldn't be written (open in another
    /// program on Windows), which the log says.
    pub pdf_copy: Option<PathBuf>,
    /// `<out_dir>/<main>.synctex.gz` (LaTeX only), for [`crate::SynctexStore::keep`].
    pub synctex: Option<PathBuf>,
    /// The output, up to 200 kB.
    pub log: String,
    /// What to tell the user when there's no PDF or the compile didn't run.
    pub error: Option<String>,
    /// The built-in Tectonic needs Spectrum's Biber for this document, and it isn't downloaded.
    pub biber_missing: bool,
}

impl CompileOutcome {
    fn failed(engine: &str, error: impl Into<String>, log: String) -> Self {
        Self {
            status: CompileStatus::Failed,
            engine: engine.to_owned(),
            exit_code: None,
            diagnostics: Vec::new(),
            pdf: None,
            pdf_copy: None,
            synctex: None,
            log,
            error: Some(error.into()),
            biber_missing: false,
        }
    }

    fn stopped(engine: &str, log: String) -> Self {
        Self {
            status: CompileStatus::Stopped,
            ..Self::failed(engine, "The compile was stopped.", log)
        }
    }

    fn timed_out(engine: &str, log: String) -> Self {
        Self {
            status: CompileStatus::TimedOut,
            ..Self::failed(engine, "The compile took too long and was stopped.", log)
        }
    }
}

/// Runs a project's compiles one at a time: a new one cancels the one running (killing its programs) and starts
/// once it has wound down.
#[derive(Debug, Default)]
pub struct Runner {
    current: std::sync::Mutex<Option<CancelToken>>,
    slot: tokio::sync::Mutex<()>,
}

impl Runner {
    pub fn new() -> Self {
        Self::default()
    }

    /// Cancels the compile running, if any.
    pub fn cancel(&self) {
        if let Some(token) = self.lock().as_ref() {
            token.cancel();
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<CancelToken>> {
        self.current
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    pub async fn compile(
        &self,
        toolchain: &Toolchain,
        request: &CompileRequest,
        events: Option<mpsc::UnboundedSender<CompileEvent>>,
    ) -> CompileOutcome {
        let token = CancelToken::new();
        if let Some(old) = self.lock().replace(token.clone()) {
            old.cancel();
        }
        let _slot = self.slot.lock().await;
        let outcome = compile(toolchain, request, events, &token).await;
        // a later compile may have put its own token there already
        let mut current = self.lock();
        if current.as_ref().is_some_and(|t| t.same(&token)) {
            *current = None;
        }
        outcome
    }
}

/// Runs one compile to its end, a cancel or a time limit.
pub async fn compile(
    toolchain: &Toolchain,
    request: &CompileRequest,
    events: Option<mpsc::UnboundedSender<CompileEvent>>,
    cancel: &CancelToken,
) -> CompileOutcome {
    let mut job = Job {
        tools: toolchain,
        request,
        sink: LogSink::new(events),
        cancel,
    };
    let main = match files::main_file(&request.project_root, &request.main_file) {
        Ok(main) => main,
        Err(error) => return CompileOutcome::failed(request.engine.name(), error, String::new()),
    };
    match files::kind_of(&main.abs) {
        files::Kind::Typst => typst::compile(&mut job, &main, None).await,
        files::Kind::Markdown => markdown::compile(&mut job, &main).await,
        files::Kind::Latex => latex::compile_document(&mut job, request.engine, &main, None).await,
    }
}

/// A compile as it runs: its request, its log and its cancel.
struct Job<'a> {
    tools: &'a Toolchain,
    request: &'a CompileRequest,
    sink: LogSink,
    cancel: &'a CancelToken,
}

impl Job<'_> {
    fn root(&self) -> &Path {
        &self.request.project_root
    }

    /// A line for the log alone (`[spectrum note] …`), streamed like the engine's.
    fn note(&mut self, text: &str) {
        self.sink.line(text);
    }

    fn take_log(&mut self) -> String {
        std::mem::take(&mut self.sink.log)
    }
}
