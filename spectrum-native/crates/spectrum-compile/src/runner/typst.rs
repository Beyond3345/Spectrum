//! A Typst document, as 2.8's `compileTypst` ran it once: one `typst compile` writes the PDF.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use super::command::DEFAULT_LIMIT;
use super::files::{self, MainFile};
use super::{CompileEvent, CompileOutcome, CompileStatus, Job};
use crate::parse_typst_diagnostics;
use crate::process::{self, Env, Spawn};

const PACKAGE_NOTE: &str = "\n[spectrum] Typst downloads a package the first time a document imports it. Connect to the internet and compile again; after that it works offline.";

/// `--font-path` for the project's `fonts/` folder, then Spectrum's fonts, each only when it is there.
fn font_args(root: &Path, more: &[PathBuf]) -> Vec<OsString> {
    std::iter::once(root.join("fonts"))
        .chain(more.iter().cloned())
        .filter(|dir| dir.is_dir())
        .flat_map(|dir| [OsString::from("--font-path"), dir.into_os_string()])
        .collect()
}

/// Typst's arguments: the project as `--root` (Typst reads nothing outside it), short diagnostics, the fonts,
/// the inputs, then the input (`-`: standard input) and the PDF.
pub(super) fn typst_args(
    root: &Path,
    fonts: Vec<OsString>,
    inputs: &[(String, String)],
    input: &Path,
    pdf: &Path,
) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec![
        "compile".into(),
        "--root".into(),
        root.into(),
        "--diagnostic-format".into(),
        "short".into(),
    ];
    args.extend(fonts);
    for (key, value) in inputs {
        args.push("--input".into());
        args.push(format!("{key}={value}").into());
    }
    args.push(input.into());
    args.push(pdf.into());
    args
}

/// Compiles `main` (or `source`, a Markdown document's Typst, from standard input in its place) and copies the
/// PDF beside the main file.
pub(super) async fn compile(
    job: &mut Job<'_>,
    main: &MainFile,
    source: Option<String>,
) -> CompileOutcome {
    let request = job.request;
    let engines = &job.tools.engines;
    let pinned = request.typst_version.as_deref().filter(|v| !v.is_empty());
    let Some(executable) = engines.typst(pinned) else {
        let error = match pinned {
            Some(v) => format!(
                "Typst {v} isn’t installed on this computer. Download it, or use the default version."
            ),
            None => "Typst isn’t available in this copy of Spectrum.".to_owned(),
        };
        return CompileOutcome::failed("typst", error, String::new());
    };
    let root = request.project_root.as_path();
    let out_dir = request.out_dir.as_path();
    if let Err(error) = files::fresh_dir(out_dir) {
        return CompileOutcome::failed("typst", error, String::new());
    }
    let base = main.base();
    let built = out_dir.join(format!("{base}.pdf"));
    let input = if source.is_some() {
        PathBuf::from("-")
    } else {
        main.abs.clone()
    };
    let mut env = Env::safe_system();
    env.set("PATH", engines.search_path());
    env.set("TYPST_PACKAGE_CACHE_PATH", &job.tools.typst_packages);
    let args = typst_args(
        root,
        font_args(root, &job.tools.typst_fonts),
        &request.typst_inputs,
        &input,
        &built,
    );
    job.sink.event(CompileEvent::Engine("typst".to_owned()));
    let exit = process::run(
        Spawn {
            program: &executable,
            args,
            cwd: main.dir(),
            env: &env,
            limit: DEFAULT_LIMIT,
            stdin: source.map(String::into_bytes),
            profile: None,
        },
        &mut job.sink,
        job.cancel,
    )
    .await;
    let exit = match exit {
        Ok(exit) => exit,
        Err(err) => {
            return CompileOutcome::failed(
                "typst",
                format!("Typst isn’t available: {err}"),
                job.take_log(),
            );
        }
    };
    if crate::regex(r"(?i)failed to (?:download|load) package").is_match(&job.sink.log) {
        job.note(PACKAGE_NOTE);
    }
    if exit.stopped {
        return CompileOutcome::stopped("typst", job.take_log());
    }
    if exit.timed_out {
        return CompileOutcome::timed_out("typst", job.take_log());
    }
    let diagnostics = parse_typst_diagnostics(&job.sink.log, root, main.dir());
    if !built.is_file() {
        let mut outcome = CompileOutcome::failed("typst", "No PDF was produced.", job.take_log());
        outcome.diagnostics = diagnostics;
        outcome.exit_code = exit.code;
        return outcome;
    }
    let pdf_copy = match files::copy_pdf(root, &built, &main.dir().join(format!("{base}.pdf"))) {
        Ok(copy) => Some(copy),
        Err(warning) => {
            job.note(&warning);
            None
        }
    };
    CompileOutcome {
        status: if exit.code == Some(0) {
            CompileStatus::Succeeded
        } else {
            CompileStatus::Failed
        },
        engine: "typst".to_owned(),
        exit_code: exit.code,
        diagnostics,
        pdf: Some(built),
        pdf_copy,
        synctex: None,
        log: job.take_log(),
        error: None,
        biber_missing: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typst_flags_match_2_8() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("fonts")).unwrap();
        let fonts = font_args(dir.path(), &[dir.path().join("missing")]);
        let args = typst_args(
            Path::new("/p"),
            fonts,
            &[("draft".into(), "true".into())],
            Path::new("/p/main.typ"),
            Path::new("/b/main.pdf"),
        );
        let fonts_dir = dir.path().join("fonts").into_os_string();
        let expected: Vec<OsString> = vec![
            "compile".into(),
            "--root".into(),
            "/p".into(),
            "--diagnostic-format".into(),
            "short".into(),
            "--font-path".into(),
            fonts_dir,
            "--input".into(),
            "draft=true".into(),
            "/p/main.typ".into(),
            "/b/main.pdf".into(),
        ];
        assert_eq!(args, expected);
    }
}
