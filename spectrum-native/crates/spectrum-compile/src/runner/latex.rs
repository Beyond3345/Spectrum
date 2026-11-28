//! A LaTeX document, as 2.8's `compileDocument` and `buildWith`: the engine's passes from the main file's
//! folder, BibTeX or Biber and the index and glossary programs between them while a pass asks for another or
//! changed what TeX reads back, then the PDF beside the source.

mod bibliography;

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use super::command::{self, PassOptions, build_args, slashed};
use super::files::{self, MainFile};
use super::{CompileEvent, CompileOutcome, CompileStatus, Job, LatexEngine};
use crate::process::{self, Env, Exit, Spawn};
use crate::{CompileError, parse_tex_log};

const TECTONIC_DOWNLOAD_ERROR: &str = "Tectonic couldn’t reach its server to download the TeX packages this document needs. Check the internet connection and compile again, or install TeX Live (MacTeX on a Mac, MiKTeX on Windows).";
const BIBLATEX_NOTE: &str = "\n[spectrum] biblatex with Biber needs the Biber that matches the built-in Tectonic, which isn’t downloaded. Download it from Settings › Engines › LaTeX, or install TeX Live or MiKTeX.";
const BIBLATEX_VERSION_NOTE: &str = "\n[spectrum] This document uses biblatex, and Tectonic’s bundled biblatex needs a different biber version than the one installed. Compile it with Auto, pdfLaTeX or XeLaTeX instead.";

/// A Markdown document's LaTeX: the .md it came from, whose folder TeX also searches and beside which the PDF
/// goes, and latexmk's engine for CJK text.
#[derive(Debug, Clone, Copy, Default)]
pub(super) struct FromMarkdown<'a> {
    pub(super) source: Option<&'a Path>,
    pub(super) latexmk_engine: Option<&'static str>,
}

/// Auto picks the engine; any other engine compiles as asked.
pub(super) async fn compile_document(
    job: &mut Job<'_>,
    engine: LatexEngine,
    main: &MainFile,
    markdown: Option<FromMarkdown<'_>>,
) -> CompileOutcome {
    let markdown = markdown.unwrap_or_default();
    if engine != LatexEngine::Auto {
        return build_with(job, engine, main, markdown).await;
    }
    let tex = read_text(&main.abs);
    let candidates = auto_candidates(job, &tex);
    let Some(&first) = candidates.first() else {
        let tex_name = if cfg!(windows) { "MiKTeX" } else { "MacTeX" };
        return CompileOutcome::failed(
            "auto",
            format!("No LaTeX engine found. Install {tex_name}, TeX Live or Tectonic."),
            String::new(),
        );
    };
    let result = build_with(job, first, main, markdown).await;
    // fontspec & co. may sit in an \input'd preamble or a local .sty, which the guess can't see
    let fallback = candidates
        .iter()
        .copied()
        .find(|e| matches!(e, LatexEngine::XeLatex | LatexEngine::LuaLatex));
    if let Some(fallback) = fallback
        && result.pdf.is_none()
        && result.status != CompileStatus::Stopped
        && first == LatexEngine::PdfLatex
        && command::needs_unicode_engine(&result.log)
    {
        return build_with(job, fallback, main, markdown).await;
    }
    result
}

/// Auto's engines in order, those installed only. biblatex with Biber can't run under the built-in Tectonic,
/// which another engine can.
fn auto_candidates(job: &Job<'_>, tex: &str) -> Vec<LatexEngine> {
    let engines = &job.tools.engines;
    let mut installed: Vec<LatexEngine> = command::auto_order(tex)
        .into_iter()
        .filter(|&e| match e {
            LatexEngine::Tectonic => engines.tectonic().is_some(),
            other => engines.find(other.name()).is_some(),
        })
        .collect();
    if command::needs_biber(tex) && installed.iter().any(|&e| e != LatexEngine::Tectonic) {
        installed.retain(|&e| e != LatexEngine::Tectonic);
    }
    installed
}

pub(super) fn read_text(path: &Path) -> String {
    std::fs::read(path)
        .map(|b| String::from_utf8_lossy(&b).into_owned())
        .unwrap_or_default()
}

/// The program an engine runs as: the built-in Tectonic when Spectrum carries one, else its name on the PATH.
fn program_of(job: &Job<'_>, engine: LatexEngine) -> PathBuf {
    match engine {
        LatexEngine::Tectonic => job
            .tools
            .engines
            .tectonic()
            .unwrap_or_else(|| PathBuf::from("tectonic")),
        other => PathBuf::from(other.name()),
    }
}

/// Tectonic 0.17 runs a tectonic-biber in the folder it runs from, then one on the PATH, before any biber.
fn holds_tectonic_biber(dir: &Path) -> bool {
    let exts: &[&str] = if cfg!(windows) {
        &["", ".exe", ".com", ".bat", ".cmd"]
    } else {
        &[""]
    };
    exts.iter()
        .any(|ext| dir.join(format!("tectonic-biber{ext}")).exists())
}

/// The PATH with Spectrum's Biber first (Tectonic runs biber from there), leaving off any folder holding a
/// tectonic-biber, which Tectonic would run in its place.
pub(super) fn with_biber(env: &mut Env, biber: &Path, cache: &Path) {
    let rest = std::env::split_paths(&env.path())
        .filter(|dir| !dir.as_os_str().is_empty() && !holds_tectonic_biber(dir))
        .collect::<Vec<_>>();
    let dirs = biber
        .parent()
        .map(Path::to_path_buf)
        .into_iter()
        .chain(rest);
    if let Ok(path) = std::env::join_paths(dirs) {
        env.set("PATH", path);
    }
    env.set("PAR_GLOBAL_TMPDIR", cache);
}

/// `dirs` (with `/`) before the variable's own value, the empty end meaning TeX's default search path.
fn before(dirs: &[&Path], name: &str) -> OsString {
    let sep = if cfg!(windows) { ";" } else { ":" };
    let own = std::env::var(name).unwrap_or_default();
    dirs.iter()
        .map(|d| slashed(d))
        .chain(std::iter::once(own))
        .collect::<Vec<_>>()
        .join(sep)
        .into()
}

/// Windows has no font system Tectonic knows, so it is pointed at the Windows and per-user font folders by one
/// small fontconfig file, written once. ponytail: a font put in a folder later isn't seen until the file goes.
#[cfg_attr(
    not(windows),
    allow(dead_code, reason = "Windows only; tested everywhere")
)]
fn fontconfig_xml(system_root: &Path, local: Option<&Path>, cache: &Path) -> String {
    let xml = |p: &Path| {
        p.to_string_lossy()
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    };
    let mut lines = vec![
        r#"<?xml version="1.0"?>"#.to_owned(),
        r#"<!DOCTYPE fontconfig SYSTEM "fonts.dtd">"#.to_owned(),
        "<fontconfig>".to_owned(),
        format!("  <dir>{}</dir>", xml(&system_root.join("Fonts"))),
    ];
    if let Some(local) = local {
        lines.push(format!(
            "  <dir>{}</dir>",
            xml(&local.join("Microsoft").join("Windows").join("Fonts"))
        ));
    }
    lines.push(format!("  <cachedir>{}</cachedir>", xml(cache)));
    lines.push("</fontconfig>".to_owned());
    lines.push(String::new());
    lines.join("\n")
}

#[cfg(windows)]
fn tectonic_fontconfig(engines_dir: &Path) -> Option<PathBuf> {
    let file = engines_dir.join("fonts.conf");
    if !file.exists() {
        let root = std::env::var_os("SystemRoot")
            .map_or_else(|| PathBuf::from(r"C:\Windows"), PathBuf::from);
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
        let text = fontconfig_xml(
            &root,
            local.as_deref(),
            &engines_dir.join("fontconfig-cache"),
        );
        std::fs::create_dir_all(engines_dir).ok()?;
        std::fs::write(&file, text).ok()?;
    }
    Some(file)
}

/// The files a pass may change that TeX reads back (everything but the PDF, `SyncTeX` and the logs), with their
/// bytes, to tell whether another pass is due.
pub(super) fn kept_files(out_dir: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(dir: &Path, rel: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let rel = rel.join(entry.file_name());
            let path = entry.path();
            if entry.file_type().is_ok_and(|t| t.is_dir()) {
                walk(&path, &rel, out);
                continue;
            }
            let name = slashed(&rel);
            let lower = name.to_lowercase();
            let skipped = [".pdf", ".log", ".blg", ".ilg", ".glg", ".synctex.gz"]
                .iter()
                .any(|ext| lower.ends_with(ext));
            if !skipped && let Ok(bytes) = std::fs::read(&path) {
                out.insert(name, bytes);
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(out_dir, Path::new(""), &mut out);
    out
}

/// The .aux with the `\include`d chapters' .aux files it `\@input`s.
pub(super) fn aux_with_inputs(out_dir: &Path, rel: &str) -> String {
    fn visit(out_dir: &Path, rel: &str, seen: &mut Vec<String>, text: &mut String) {
        if seen.iter().any(|s| s == rel) || rel.split(['/', '\\']).any(|p| p == "..") {
            return;
        }
        seen.push(rel.to_owned());
        let own = read_text(&out_dir.join(rel));
        text.push_str(&own);
        for c in crate::regex(r"\\@input\{([^}]+)\}").captures_iter(&own) {
            visit(out_dir, &c[1], seen, text);
        }
    }
    let mut text = String::new();
    visit(out_dir, rel, &mut Vec::new(), &mut text);
    text
}

/// TeX breaks its log's lines at 79 characters.
fn unwrap_log(log: &str) -> String {
    crate::regex(r"(?m)^(.{79})\r?\n")
        .replace_all(log, "$1")
        .into_owned()
}

/// A pass's log asking for another (LaTeX's labels, hyperref's outlines, natbib's citations), but not
/// rerunfilecheck's banner, which every hyperref document's log has.
fn asks_rerun(log: &str) -> bool {
    crate::regex(r"(?i)\brerun\b").find_iter(log).any(|m| {
        !log[m.end()..]
            .to_lowercase()
            .starts_with(" checks for auxiliary files")
    })
}

/// The pieces of a build every program of it shares.
pub(super) struct Build<'a> {
    pub(super) env: Env,
    pub(super) out_dir: &'a Path,
    pub(super) base: String,
    pub(super) profile: Option<String>,
}

impl Build<'_> {
    pub(super) async fn run(
        &self,
        job: &mut Job<'_>,
        program: &Path,
        args: Vec<OsString>,
        cwd: &Path,
        limit: std::time::Duration,
    ) -> Result<Exit, CompileError> {
        process::run(
            Spawn {
                program,
                args,
                cwd,
                env: &self.env,
                limit,
                stdin: None,
                profile: self.profile.as_deref(),
            },
            &mut job.sink,
            job.cancel,
        )
        .await
    }
}

/// A `MiKTeX` program, which asks in a window the hidden engine never shows before installing a missing package.
pub(super) fn is_miktex(job: &Job<'_>, env: &Env, program: &Path) -> bool {
    cfg!(windows)
        && crate::find_executable(&program.to_string_lossy(), &env.path())
            .or_else(|| program.is_absolute().then(|| program.to_path_buf()))
            .is_some_and(|p| {
                let lower = p.to_string_lossy().to_lowercase();
                lower.contains("\\miktex\\") || lower.contains("/miktex/")
            })
        && !job.cancel.is_cancelled()
}

/// The compile's sandbox profile on a Mac, with its variables set in `env`; `None` for a trusted project, or
/// where sandbox-exec doesn't work (the log then says the compile wasn't confined).
#[cfg(target_os = "macos")]
async fn confine(
    job: &mut Job<'_>,
    engine: LatexEngine,
    env: &mut Env,
    tmp_dir: &Path,
    biber: Option<&Path>,
) -> Option<String> {
    let request = job.request;
    if request.trust == super::Trust::Trusted {
        return None;
    }
    let sandbox = job.tools.sandbox.clone()?;
    let search_path = env.path();
    let confine = crate::sandbox::ConfineRequest {
        build: &request.out_dir,
        tmp: tmp_dir,
        search_path: &search_path,
        tectonic: engine == LatexEngine::Tectonic,
        root: &request.project_root,
        runs: std::iter::once(program_of(job, engine))
            .chain(biber.map(Path::to_path_buf))
            .collect(),
    };
    match sandbox.apply(env, confine).await {
        Ok(profile) => profile,
        Err(warning) => {
            job.note(warning);
            None
        }
    }
}

/// Windows has no compile sandbox in this crate (`spectrum-win-sandbox` is its own): TeX's restricted shell
/// escape is the guard.
#[cfg(not(target_os = "macos"))]
#[allow(clippy::unused_async, reason = "the Mac's version is async")]
async fn confine(
    _job: &mut Job<'_>,
    _engine: LatexEngine,
    _env: &mut Env,
    _tmp_dir: &Path,
    _biber: Option<&Path>,
) -> Option<String> {
    None
}

#[allow(clippy::too_many_lines, reason = "2.8's buildWith, step by step")]
async fn build_with(
    job: &mut Job<'_>,
    engine: LatexEngine,
    main: &MainFile,
    markdown: FromMarkdown<'_>,
) -> CompileOutcome {
    let name = engine.name();
    let request = job.request;
    let root = request.project_root.clone();
    // Tectonic would run it as its Biber: a program a project brought with it
    if engine == LatexEngine::Tectonic && holds_tectonic_biber(main.dir()) {
        return CompileOutcome::failed(
            name,
            "This document’s folder has a file called tectonic-biber, which Tectonic would run as a program. Rename or remove it, or compile with another engine.",
            String::new(),
        );
    }
    let out_dir = request.out_dir.as_path();
    let tmp_dir = files::sibling(out_dir, "-tmp");
    if let Err(error) = files::fresh_dir(out_dir).and_then(|()| files::fresh_dir(&tmp_dir)) {
        return CompileOutcome::failed(name, error, String::new());
    }
    // run from the main file's folder, as TeXShop, LaTeX Workshop and Tectonic do, so \input paths are
    // relative to it; the project root stays on the search paths too
    let main_dir = main.dir().to_path_buf();
    let base = main.base();
    let md_dir = markdown.source.and_then(Path::parent);
    let mut source_dirs: Vec<&Path> = vec![&main_dir];
    if let Some(md) = md_dir.filter(|d| *d != main_dir) {
        source_dirs.push(md);
    }
    source_dirs.push(&root);

    let engines = &job.tools.engines;
    let mut env = Env::safe_system();
    env.set("PATH", engines.search_path());
    for var in ["TEXINPUTS", "BIBINPUTS", "BSTINPUTS"] {
        env.set(var, before(&source_dirs, var));
    }
    #[cfg(windows)]
    if engine == LatexEngine::Tectonic
        && let Some(file) = tectonic_fontconfig(engines.engines_dir())
    {
        env.set("FONTCONFIG_FILE", file);
    }
    let tex = read_text(&main.abs);
    let biber = if engine == LatexEngine::Tectonic {
        engines.tectonic_biber()
    } else {
        None
    };
    if let Some(biber) = &biber {
        with_biber(&mut env, biber, &engines.biber_cache());
    }
    // a trusted project's TeX writes where the document says, as its shell escape could anyway
    if request.trust == super::Trust::Trusted {
        env.set("openout_any", "a");
    }
    // on a Mac every program of the compile runs confined, unless the user trusts the project
    let profile = confine(job, engine, &mut env, &tmp_dir, biber.as_deref()).await;
    let confined = profile.is_some();
    let build = Build {
        env,
        out_dir,
        base: base.clone(),
        profile,
    };

    let options = PassOptions {
        halt_on_error: request.halt_on_error,
        draft: request.draft,
        trust: request.trust,
        latexmk_engine: markdown.latexmk_engine,
    };
    let main_name = main
        .abs
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut args = build_args(
        engine,
        &slashed(out_dir),
        &format!("./{main_name}"),
        &options,
    );
    if engine == LatexEngine::Tectonic {
        // Tectonic ignores TEXINPUTS; its unstable search-path option does the same job. It looks in the
        // folder of the file it runs first
        let mut dirs: Vec<String> = Vec::new();
        for dir in source_dirs.iter().map(|d| slashed(d)) {
            if dir != slashed(&main_dir) && !dirs.contains(&dir) {
                dirs.push(dir);
            }
        }
        let extra = dirs
            .into_iter()
            .flat_map(|d| [OsString::from("-Z"), format!("search-path={d}").into()]);
        args.splice(0..0, extra);
    }
    let program = program_of(job, engine);
    // MiKTeX asks before installing a missing package; this installs it without asking. ponytail: latexmk's
    // own engine runs still ask
    if engine.multi_pass() && is_miktex(job, &build.env, &program) {
        args.insert(0, "--enable-installer".into());
    }
    // \include{chapters/x} writes chapters/x.aux into the output folder: mirror the folders as seen from the
    // main file's folder and from the project root
    let (dirs, project_files) = files::project_entries(&root);
    for dir in &dirs {
        let _ = std::fs::create_dir_all(out_dir.join(dir));
        if let Some(from_main) = crate::paths::relative_under(&main_dir, &root.join(dir))
            && !from_main.as_os_str().is_empty()
        {
            let _ = std::fs::create_dir_all(out_dir.join(from_main));
        }
    }

    job.sink.event(CompileEvent::Engine(name.to_owned()));
    let limit = command::pass_limit(engine);
    let pass_log = |out: &Path| unwrap_log(&read_text(&out.join(format!("{base}.log"))));
    let mut before_files = kept_files(out_dir);
    let mut bib_status = 0;
    let mut pass = match build
        .run(job, &program, args.clone(), &main_dir, limit)
        .await
    {
        Ok(pass) => pass,
        Err(err) => {
            return CompileOutcome::failed(
                name,
                format!("{name} isn’t available: {err}"),
                job.take_log(),
            );
        }
    };
    let halt = request.halt_on_error;
    let carry_on = |pass: &Exit, job: &Job<'_>| {
        !(pass.timed_out || job.cancel.is_cancelled() || halt && pass.code != Some(0))
    };
    if engine.multi_pass() && !request.draft && carry_on(&pass, job) {
        // what BibTeX reads, so a citation only a kept list put there goes again
        let cites = |out: &Path| {
            crate::regex(r"(?m)^\\(?:citation|bibdata|bibstyle)\{.*$")
                .find_iter(&aux_with_inputs(out, &format!("{base}.aux")))
                .map(|m| m.as_str().to_owned())
                .collect::<Vec<_>>()
                .join("\n")
        };
        let mut cited_now = cites(out_dir);
        bib_status = bibliography::run(job, &build, &tex, &source_dirs).await;
        let mut log = pass_log(out_dir);
        for n in 2..=3 {
            if !carry_on(&pass, job) {
                break;
            }
            if n > 2 {
                let now = cites(out_dir);
                if now != cited_now {
                    cited_now = now;
                    bib_status = bibliography::run(job, &build, &tex, &source_dirs).await;
                }
            }
            let now = bibliography::run_indexers(job, &build, &before_files).await;
            if !asks_rerun(&log) && now == before_files {
                break;
            }
            before_files = now;
            pass = match build
                .run(job, &program, args.clone(), &main_dir, limit)
                .await
            {
                Ok(pass) => pass,
                Err(err) => {
                    return CompileOutcome::failed(
                        name,
                        format!("{name} isn’t available: {err}"),
                        job.take_log(),
                    );
                }
            };
            log = pass_log(out_dir);
        }
    }

    if pass.stopped || job.cancel.is_cancelled() {
        return CompileOutcome::stopped(name, job.take_log());
    }
    if pass.timed_out {
        return CompileOutcome::timed_out(name, job.take_log());
    }
    // a later TeX pass can make a PDF even when Biber failed
    let mut code = if pass.code == Some(0) {
        Some(bib_status)
    } else {
        pass.code
    };
    if engine == LatexEngine::Tectonic {
        // carrying on past errors, Tectonic still exits with 0
        if code == Some(0) && crate::regex(r"(?m)^error: ").is_match(&job.sink.log) {
            code = Some(1);
        }
        if crate::regex(r"(?i)biblatex control file version").is_match(&job.sink.log) {
            job.note(BIBLATEX_VERSION_NOTE);
        }
    }
    // what the sandbox or TeX's own limits stopped, which Trust this project would allow
    if request.trust == super::Trust::Normal {
        let notes = crate::blocked_notes(
            &unwrap_log(&job.sink.log),
            &pass_log(out_dir),
            confined,
            code != Some(0),
        );
        for line in notes.lines() {
            job.note(line);
        }
    }
    let biber_missing =
        engine == LatexEngine::Tectonic && biber.is_none() && command::needs_biber(&tex);
    if biber_missing {
        job.note(BIBLATEX_NOTE);
    }
    let diagnostics = |job: &Job<'_>| {
        files::project_paths(
            parse_tex_log(&job.sink.log, &root),
            &main.rel,
            &project_files,
        )
    };
    let tectonic_offline = engine == LatexEngine::Tectonic
        && code != Some(0)
        && crate::regex(
            r"(?i)failed to download|failure downloading|couldn't get it from the internet",
        )
        .is_match(&job.sink.log);
    let made_pdf = out_dir.join(format!("{base}.pdf"));
    if tectonic_offline || !made_pdf.is_file() {
        let error = if tectonic_offline {
            TECTONIC_DOWNLOAD_ERROR
        } else {
            "No PDF was produced."
        };
        let mut outcome = CompileOutcome::failed(name, error, String::new());
        outcome.diagnostics = diagnostics(job);
        outcome.exit_code = code;
        outcome.biber_missing = biber_missing;
        outcome.log = job.take_log();
        return outcome;
    }
    // a Markdown document's PDF goes beside the .md
    let target = match markdown.source {
        Some(md) => md.with_extension("pdf"),
        None => main_dir.join(format!("{base}.pdf")),
    };
    let pdf_copy = match files::copy_pdf(&root, &made_pdf, &target) {
        Ok(copy) => Some(copy),
        Err(warning) => {
            job.note(&warning);
            None
        }
    };
    // SyncTeX jumps don't point into the .md, so a Markdown compile keeps none
    let synctex = Some(out_dir.join(format!("{base}.synctex.gz")))
        .filter(|s| markdown.source.is_none() && s.is_file());
    CompileOutcome {
        status: if code == Some(0) {
            CompileStatus::Succeeded
        } else {
            CompileStatus::Failed
        },
        engine: name.to_owned(),
        exit_code: code,
        diagnostics: diagnostics(job),
        pdf: Some(made_pdf),
        pdf_copy,
        synctex,
        log: job.take_log(),
        error: None,
        biber_missing,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rerun_ignores_rerunfilecheck_s_banner() {
        assert!(!asks_rerun(
            "Package rerunfilecheck Info: Rerun checks for auxiliary files."
        ));
        assert!(asks_rerun(
            "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right."
        ));
        assert!(asks_rerun("(rerunfilecheck) Rerun to get outlines right"));
    }

    #[test]
    fn log_lines_broken_at_79_are_joined() {
        let long = "x".repeat(79);
        assert_eq!(
            unwrap_log(&format!("{long}\nyz\nshort\n")),
            format!("{long}yz\nshort\n")
        );
    }

    #[test]
    fn kept_files_skip_outputs_and_aux_inputs_are_followed() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path();
        std::fs::create_dir_all(out.join("chapters")).unwrap();
        std::fs::write(
            out.join("main.aux"),
            "\\@input{chapters/one.aux}\n\\citation{a}\n",
        )
        .unwrap();
        std::fs::write(
            out.join("chapters/one.aux"),
            "\\citation{b}\n\\@input{main.aux}",
        )
        .unwrap();
        for skipped in ["main.pdf", "main.log", "main.synctex.gz", "main.blg"] {
            std::fs::write(out.join(skipped), "x").unwrap();
        }
        let kept: Vec<_> = kept_files(out).into_keys().collect();
        assert_eq!(kept, ["chapters/one.aux", "main.aux"]);
        let aux = aux_with_inputs(out, "main.aux");
        assert!(aux.contains("\\citation{a}") && aux.contains("\\citation{b}"));
    }

    #[test]
    fn spectrum_s_biber_goes_first_and_tectonic_biber_folders_go() {
        let dir = tempfile::tempdir().unwrap();
        let (own, planted, other) = (
            dir.path().join("own"),
            dir.path().join("planted"),
            dir.path().join("other"),
        );
        for d in [&own, &planted, &other] {
            std::fs::create_dir_all(d).unwrap();
        }
        std::fs::write(planted.join("tectonic-biber"), "").unwrap();
        let mut env = Env::default();
        env.set("PATH", std::env::join_paths([&planted, &other]).unwrap());
        with_biber(&mut env, &own.join("biber"), Path::new("/cache"));
        let path: Vec<_> = std::env::split_paths(&env.path()).collect();
        assert_eq!(path, [own, other]);
        assert_eq!(
            env.get("PAR_GLOBAL_TMPDIR"),
            Some(std::ffi::OsStr::new("/cache"))
        );
    }

    #[test]
    fn search_paths_end_in_tex_s_default() {
        let value = before(
            &[Path::new("/p/ch"), Path::new("/p")],
            "SPECTRUM_TEST_UNSET_VAR",
        );
        let sep = if cfg!(windows) { ";" } else { ":" };
        assert_eq!(value, OsString::from(format!("/p/ch{sep}/p{sep}")));
    }

    #[test]
    fn fontconfig_names_the_windows_font_folders() {
        let xml = fontconfig_xml(
            Path::new("C:/Windows"),
            Some(Path::new("C:/Users/A&B/AppData/Local")),
            Path::new("C:/cache"),
        );
        assert!(
            xml.contains("<dir>C:/Windows/Fonts</dir>")
                || xml.contains(r"<dir>C:/Windows\Fonts</dir>")
        );
        assert!(xml.contains("A&amp;B"));
        assert!(xml.contains("<cachedir>C:/cache</cachedir>"));
    }
}
