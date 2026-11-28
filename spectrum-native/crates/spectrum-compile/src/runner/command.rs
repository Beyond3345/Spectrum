//! Each engine's command line, exactly as 2.8's `buildCommand` wrote it, and the checks on a document's text
//! that decide which programs run.

use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

use crate::{LatexEngine, Trust};

/// draft mode's images, as boxes of their size (Overleaf's fast mode)
pub(crate) const DRAFT_IMAGES: &str = r"\PassOptionsToPackage{draft}{graphicx}";

/// Tectonic downloads its TeX bundle on first use (over 3 minutes for the ACL template on a fresh machine)
/// and latexmk runs every pass inside one process, so they get longer limits.
pub(crate) fn pass_limit(engine: LatexEngine) -> Duration {
    Duration::from_secs(match engine {
        LatexEngine::Tectonic => 15 * 60,
        LatexEngine::Latexmk => 10 * 60,
        _ => 3 * 60,
    })
}

/// The limit for anything else a compile runs (Typst, pandoc, BibTeX, Biber, makeindex).
pub(crate) const DEFAULT_LIMIT: Duration = Duration::from_mins(3);

/// What a pass is run with besides the engine.
#[derive(Debug, Clone, Default)]
pub(crate) struct PassOptions {
    pub(crate) halt_on_error: bool,
    pub(crate) draft: bool,
    pub(crate) trust: Trust,
    /// latexmk's engine switch (`xelatex` → `-xelatex`); `-pdf` without one.
    pub(crate) latexmk_engine: Option<&'static str>,
}

/// The shell escape, always said on the command line so a setting in the TeX installation doesn't decide it
/// (`MiKTeX` takes the three as TeX Live does): the restricted kind for a compile, none for an agent's draft,
/// all of it for a project the user trusts.
pub(crate) fn shell_flag(trust: Trust) -> &'static str {
    match trust {
        Trust::Untrusted => "-no-shell-escape",
        Trust::Trusted => "-shell-escape",
        Trust::Normal => "-shell-restricted",
    }
}

/// The engine's arguments (the program itself is the caller's: the built-in Tectonic's path, or its name).
/// Every engine writes `<main>.synctex.gz` too. `out_dir` and `main` are written with `/`.
pub(crate) fn build_args(
    engine: LatexEngine,
    out_dir: &str,
    main: &str,
    options: &PassOptions,
) -> Vec<OsString> {
    let halt: &[&str] = if options.halt_on_error {
        &["-halt-on-error"]
    } else {
        &[]
    };
    let shell = shell_flag(options.trust);
    let mut args: Vec<String> = Vec::new();
    match engine {
        LatexEngine::PdfLatex
        | LatexEngine::XeLatex
        | LatexEngine::LuaLatex
        | LatexEngine::Auto => {
            // draft: images drawn as boxes, which a first line passes to graphicx; the file it inputs still names
            // the job. ponytail: a name TeX would read as code (with %, # or braces) keeps its images
            let input = if options.draft
                && !main.contains(['\\', '{', '}', '%', '#', '&', '~', '^', '$'])
            {
                format!(r"{DRAFT_IMAGES}\input{{{main}}}")
            } else {
                main.to_owned()
            };
            args.extend(
                ["-interaction=nonstopmode", "-file-line-error", "-synctex=1"].map(str::to_owned),
            );
            args.extend(halt.iter().map(|s| (*s).to_owned()));
            args.push(shell.to_owned());
            args.push(format!("-output-directory={out_dir}"));
            args.push(input);
        }
        LatexEngine::Latexmk => {
            // -norc: a project's own latexmkrc is Perl, which could run anything. ponytail: in draft mode latexmk
            // draws images as boxes but still runs as many passes as it wants
            args.push("-norc".into());
            args.push(
                options
                    .latexmk_engine
                    .map_or_else(|| "-pdf".to_owned(), |e| format!("-{e}")),
            );
            args.extend(
                ["-interaction=nonstopmode", "-file-line-error", "-synctex=1"].map(str::to_owned),
            );
            args.push(format!("-latexoption={shell}"));
            if options.halt_on_error {
                args.extend(halt.iter().map(|s| (*s).to_owned()));
            } else {
                args.push("-f".into());
            }
            if options.draft {
                args.push(format!("-usepretex={DRAFT_IMAGES}"));
            }
            args.push(format!("-outdir={out_dir}"));
            args.push(main.to_owned());
        }
        LatexEngine::Tectonic => {
            // Tectonic keeps its .aux in memory unless told otherwise, and only finds other documents' .aux in
            // out_dir when it's on the search path. It stops at the first error unless told to carry on, as the
            // other engines do; draft is one pass
            if !options.halt_on_error {
                args.extend(["-Z", "continue-on-errors"].map(str::to_owned));
            }
            if options.trust == Trust::Trusted {
                args.extend(["-Z", "shell-escape"].map(str::to_owned));
            }
            if options.draft {
                args.extend(["--reruns", "0"].map(str::to_owned));
            }
            args.extend(["-Z".to_owned(), format!("search-path={out_dir}")]);
            args.extend(["--synctex", "--keep-intermediates", "--outdir"].map(str::to_owned));
            args.push(out_dir.to_owned());
            args.push(main.to_owned());
        }
    }
    args.into_iter().map(OsString::from).collect()
}

/// TeX reads `\` as a command, and every engine on Windows takes `/` as well.
pub(crate) fn slashed(path: &Path) -> String {
    crate::paths::to_slash(path)
}

/// The text without `%` comments (`\%` isn't one).
pub(crate) fn without_comments(tex: &str) -> String {
    let mut out = String::with_capacity(tex.len());
    let mut chars = tex.chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                out.push(c);
                if let Some(next) = chars.next() {
                    out.push(next);
                }
            }
            '%' => {
                for rest in chars.by_ref() {
                    if rest == '\n' || rest == '\r' {
                        out.push(rest);
                        break;
                    }
                }
            }
            _ => out.push(c),
        }
    }
    out
}

/// biblatex with Biber (`backend=bibtex` runs BibTeX instead), which for Tectonic's biblatex must be Biber 2.17.
pub(crate) fn needs_biber(tex: &str) -> bool {
    crate::regex(
        r"\\addbibresource\b|\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{biblatex\}",
    )
    .is_match(&without_comments(tex))
        && !crate::regex(r"backend\s*=\s*bibtex").is_match(tex)
}

/// "Auto": a `% !TEX program = xelatex` comment's engine, else `XeLaTeX` for documents that need Unicode fonts and
/// pdfLaTeX for everything else, then the rest, in order. The caller keeps the ones installed.
pub(crate) fn auto_order(tex: &str) -> Vec<LatexEngine> {
    let magic = crate::regex(r"(?i)%\s*!TEX\s+(?:TS-)?program\s*=\s*(\w+)")
        .captures(tex)
        .and_then(|c| LatexEngine::from_name(&c[1].to_lowercase()));
    let unicode = crate::regex(
        r"\\usepackage(\[[^\]]*\])?\{(fontspec|xeCJK|ctex|unicode-math|polyglossia)\}|\\documentclass(\[[^\]]*\])?\{ctex",
    )
    .is_match(tex);
    let (first, second) = if unicode {
        (LatexEngine::XeLatex, LatexEngine::LuaLatex)
    } else {
        (LatexEngine::PdfLatex, LatexEngine::XeLatex)
    };
    let mut order = Vec::new();
    for engine in magic.into_iter().chain([
        first,
        second,
        LatexEngine::LuaLatex,
        LatexEngine::Tectonic,
        LatexEngine::Latexmk,
    ]) {
        if engine != LatexEngine::Auto && !order.contains(&engine) {
            order.push(engine);
        }
    }
    order
}

/// pdfLaTeX can't load these; Auto then retries with `XeLaTeX` or `LuaLaTeX`.
pub(crate) fn needs_unicode_engine(log: &str) -> bool {
    crate::regex(r"(?i)fontspec Error|unicode-math Error|requires either XeTeX or|must use XeTeX")
        .is_match(log)
}

/// What makeglossaries (Perl) and makeglossaries-lite (Lua) take from the .aux and paste into a command line, or
/// open as Perl opens a name (`|program` runs it). A document writes its own .aux, so one of them (or the
/// document's name) that a shell would read as more than a name, options that aren't plain switches, or an
/// indexer that isn't one keep both from running.
pub(crate) fn glossaries_unsafe(aux: &str, base: &str) -> bool {
    let shell_reads = |s: &str| {
        s.contains([
            '$', '`', '\\', ';', '&', '|', '<', '>', '^', '%', '\r', '\n',
        ])
    };
    if shell_reads(base) {
        return true;
    }
    let setting = crate::regex(
        r"(?m)\\@(istfilename|newglossary|glsorder|xdylanguage|gls@codepage|gls@extramakeindexopts|glsmakeindexappname|input)([^A-Za-z@].*)?$",
    );
    setting.captures_iter(aux).any(|c| {
        let rest = c.get(2).map_or("", |m| m.as_str());
        let rule = match &c[1] {
            "gls@extramakeindexopts" => Some(r"^\s*(?:\[1\]\{\}|\{[\w\s-]*\})\s*$"),
            "glsmakeindexappname" => {
                Some(r"^\s*(?:\[1\]\{\}|\{(?:makeindex|upmendex|mendex)\})\s*$")
            }
            "input" => Some(r"^\{[^{}]*\}\s*$"),
            _ => None,
        };
        shell_reads(rest) || rule.is_some_and(|r| !crate::regex(r).is_match(rest))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(engine: LatexEngine, options: &PassOptions) -> Vec<String> {
        build_args(engine, "/b/out", "./main.tex", options)
            .into_iter()
            .map(|a| a.into_string().unwrap())
            .collect()
    }

    #[test]
    fn pdflatex_flags_match_2_8() {
        assert_eq!(
            args(LatexEngine::PdfLatex, &PassOptions::default()),
            [
                "-interaction=nonstopmode",
                "-file-line-error",
                "-synctex=1",
                "-shell-restricted",
                "-output-directory=/b/out",
                "./main.tex"
            ]
        );
        let halting = PassOptions {
            halt_on_error: true,
            draft: true,
            trust: Trust::Trusted,
            ..PassOptions::default()
        };
        assert_eq!(
            args(LatexEngine::XeLatex, &halting),
            [
                "-interaction=nonstopmode",
                "-file-line-error",
                "-synctex=1",
                "-halt-on-error",
                "-shell-escape",
                "-output-directory=/b/out",
                r"\PassOptionsToPackage{draft}{graphicx}\input{./main.tex}"
            ]
        );
        let draft_odd_name = build_args(
            LatexEngine::LuaLatex,
            "/o",
            "./50%.tex",
            &PassOptions {
                draft: true,
                trust: Trust::Untrusted,
                ..PassOptions::default()
            },
        );
        assert_eq!(draft_odd_name.last().unwrap(), "./50%.tex");
        assert!(draft_odd_name.contains(&"-no-shell-escape".into()));
    }

    #[test]
    fn latexmk_flags_match_2_8() {
        assert_eq!(
            args(LatexEngine::Latexmk, &PassOptions::default()),
            [
                "-norc",
                "-pdf",
                "-interaction=nonstopmode",
                "-file-line-error",
                "-synctex=1",
                "-latexoption=-shell-restricted",
                "-f",
                "-outdir=/b/out",
                "./main.tex"
            ]
        );
        let xe = PassOptions {
            halt_on_error: true,
            draft: true,
            latexmk_engine: Some("xelatex"),
            ..PassOptions::default()
        };
        assert_eq!(
            args(LatexEngine::Latexmk, &xe),
            [
                "-norc",
                "-xelatex",
                "-interaction=nonstopmode",
                "-file-line-error",
                "-synctex=1",
                "-latexoption=-shell-restricted",
                "-halt-on-error",
                r"-usepretex=\PassOptionsToPackage{draft}{graphicx}",
                "-outdir=/b/out",
                "./main.tex"
            ]
        );
    }

    #[test]
    fn tectonic_flags_match_2_8() {
        assert_eq!(
            args(LatexEngine::Tectonic, &PassOptions::default()),
            [
                "-Z",
                "continue-on-errors",
                "-Z",
                "search-path=/b/out",
                "--synctex",
                "--keep-intermediates",
                "--outdir",
                "/b/out",
                "./main.tex"
            ]
        );
        let trusted_draft = PassOptions {
            halt_on_error: true,
            draft: true,
            trust: Trust::Trusted,
            ..PassOptions::default()
        };
        assert_eq!(
            args(LatexEngine::Tectonic, &trusted_draft)[..4],
            ["-Z", "shell-escape", "--reruns", "0"]
        );
    }

    #[test]
    fn limits() {
        assert_eq!(pass_limit(LatexEngine::Tectonic).as_secs(), 900);
        assert_eq!(pass_limit(LatexEngine::Latexmk).as_secs(), 600);
        assert_eq!(pass_limit(LatexEngine::PdfLatex).as_secs(), 180);
    }

    #[test]
    fn comments_and_biber() {
        assert_eq!(without_comments("a % b\nc \\% d"), "a \nc \\% d");
        assert!(needs_biber(r"\usepackage[style=apa]{biblatex}"));
        assert!(needs_biber(r"\addbibresource{refs.bib}"));
        assert!(!needs_biber(r"% \usepackage{biblatex}"));
        assert!(!needs_biber(r"\usepackage[backend=bibtex]{biblatex}"));
        assert!(!needs_biber(r"\bibliography{refs}"));
    }

    #[test]
    fn auto_prefers_the_magic_comment_then_unicode() {
        use LatexEngine::{Latexmk, LuaLatex, PdfLatex, Tectonic, XeLatex};
        assert_eq!(
            auto_order("x"),
            [PdfLatex, XeLatex, LuaLatex, Tectonic, Latexmk]
        );
        assert_eq!(
            auto_order(r"\usepackage{fontspec}"),
            [XeLatex, LuaLatex, Tectonic, Latexmk]
        );
        assert_eq!(
            auto_order("% !TEX program = LuaLaTeX\n"),
            [LuaLatex, PdfLatex, XeLatex, Tectonic, Latexmk]
        );
        assert!(needs_unicode_engine(
            "! Fatal Package fontspec Error: The fontspec package requires either XeTeX or LuaTeX."
        ));
    }

    #[test]
    fn glossary_settings_a_shell_would_run_stop_makeglossaries() {
        let fine = "\\@newglossary{main}{glg}{gls}{glo}\n\\@istfilename{main.ist}\n\\@glsorder{word}\n\\@input{ch1.aux}\n";
        assert!(!glossaries_unsafe(fine, "main"));
        assert!(glossaries_unsafe("\\@istfilename{x;rm -rf ~}\n", "main"));
        assert!(glossaries_unsafe("\\@glsmakeindexappname{evil}\n", "main"));
        assert!(glossaries_unsafe(
            "\\@gls@extramakeindexopts{-o /etc/x}\n",
            "main"
        ));
        assert!(!glossaries_unsafe(
            "\\@gls@extramakeindexopts{-l}\n",
            "main"
        ));
        assert!(glossaries_unsafe(fine, "main;x"));
    }
}
