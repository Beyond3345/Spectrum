//! The programs between TeX passes: BibTeX or Biber (2.8's `runBibliography`), and the index and glossaries.

use std::collections::BTreeMap;
use std::path::Path;

use super::super::command::{self, DEFAULT_LIMIT};
use super::super::{BibTool, Job};
use super::{Build, aux_with_inputs, is_miktex, kept_files, read_text};

/// BibTeX or Biber after a pass, when the .aux cites anything or names a bibliography: the tool chosen, else a
/// `% !BIB program = biber` comment's, else Biber for biblatex. 0, or Biber's code when it failed.
pub(super) async fn run(job: &mut Job<'_>, build: &Build<'_>, tex: &str, dirs: &[&Path]) -> i32 {
    let out_dir = build.out_dir;
    let base = &build.base;
    let aux = aux_with_inputs(out_dir, &format!("{base}.aux"));
    // biblatex writes \abx@aux@... into the .aux; BibTeX's documents \citation and \bibdata
    if !crate::regex(r"\\(?:citation|bibdata)\{|\\abx@aux@").is_match(&aux) {
        return 0;
    }
    let magic = crate::regex(r"(?i)%\s*!BIB\s+(?:TS-)?program\s*=\s*(\w+)")
        .captures(tex)
        .map(|c| c[1].to_lowercase())
        .filter(|m| m == "bibtex" || m == "biber");
    let chosen = match job.request.bib_tool {
        BibTool::Biber => Some(true),
        BibTool::Bibtex => Some(false),
        BibTool::Auto => magic.map(|m| m == "biber"),
    };
    let use_biber = chosen.unwrap_or_else(|| {
        aux.contains("\\abx@aux@")
            || crate::regex(r"\\usepackage(\[.*?\])?\{biblatex\}").is_match(tex)
    });
    let program = Path::new(if use_biber { "biber" } else { "bibtex" });
    // run in the build folder on the bare name (openout_any=p blocks absolute paths); both find the project's
    // .bib files through BIBINPUTS. Biber must not get --input-directory: it looks for the .bcf there
    let mut args = vec![base.into()];
    if use_biber && cfg!(windows) {
        bib_copies(out_dir, base, dirs);
    }
    // MiKTeX's bibtex asks before installing a missing .bst, as its engines do
    if !use_biber && is_miktex(job, &build.env, program) {
        args.insert(0, "--enable-installer".into());
    }
    match build.run(job, program, args, out_dir, DEFAULT_LIMIT).await {
        // a Stop ended it, or came before it started: Biber didn't fail
        Ok(_) if job.cancel.is_cancelled() => 0,
        Ok(exit) if use_biber && (exit.code != Some(0) || exit.timed_out) => {
            job.note(
                "[spectrum] Biber failed. Fix the bibliography errors above and compile again.",
            );
            exit.code.unwrap_or(1).max(1)
        }
        Ok(_) => 0,
        Err(err) if use_biber => {
            job.note(&format!("[spectrum] Biber could not run: {err}. Install Biber with your TeX distribution and compile again."));
            1
        }
        Err(_) => {
            job.note("[warn] bibtex not available, skipping bibliography pass.");
            0
        }
    }
}

/// Perl on Windows reads a folder named in BIBINPUTS through the system's code page, so Biber can't find a .bib
/// in a project whose path that code page can't spell (大學 under an English locale). Each .bib the control
/// file names by a plain relative name is copied into the build folder, where Biber looks first, when a source
/// folder's path isn't ASCII; the last run's copies go first.
pub(super) fn bib_copies(out_dir: &Path, base: &str, dirs: &[&Path]) {
    let list = out_dir.join(format!("{base}.bibcopies"));
    for rel in read_text(&list).lines().filter(|l| !l.is_empty()) {
        let _ = std::fs::remove_file(out_dir.join(rel));
    }
    let _ = std::fs::remove_file(&list);
    if !dirs.iter().any(|d| {
        d.to_string_lossy()
            .chars()
            .any(|c| !(' '..='~').contains(&c))
    }) {
        return;
    }
    let bcf = read_text(&out_dir.join(format!("{base}.bcf")));
    let mut copied = Vec::new();
    for c in crate::regex(r"<bcf:datasource\b([^>]*)>([^<]*)</bcf:datasource>").captures_iter(&bcf)
    {
        let (attributes, name) = (&c[1], c[2].trim());
        let plain = attributes.contains(r#"type="file""#)
            && !attributes.contains(r#"glob="true""#)
            && !crate::regex(r"[&*?\[\]{}]|^\w+://").is_match(name)
            && !Path::new(name).is_absolute()
            && !name.split(['/', '\\']).any(|p| p == "..");
        // already in the build folder as the document's own: left alone
        if !plain || out_dir.join(name).exists() {
            continue;
        }
        for dir in dirs {
            let from = dir.join(name);
            if from.is_file() {
                let to = out_dir.join(name);
                if let Some(parent) = to.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if std::fs::copy(&from, &to).is_ok() {
                    copied.push(name.to_owned());
                }
                break;
            }
        }
    }
    if !copied.is_empty() {
        let _ = std::fs::write(&list, copied.join("\n"));
    }
}

struct Indexer {
    input: &'static str,
    output: &'static str,
    programs: &'static [&'static str],
}

// makeglossaries is Perl, which MiKTeX doesn't come with; makeglossaries-lite is Lua
const INDEXERS: [Indexer; 2] = [
    Indexer {
        input: "idx",
        output: "ind",
        programs: &["makeindex"],
    },
    Indexer {
        input: "glo",
        output: "gls",
        programs: &["makeglossaries", "makeglossaries-lite"],
    },
];

/// Runs makeindex and the glossaries' program where a pass changed their input or they made nothing yet, and
/// returns the build's files as they are then.
pub(super) async fn run_indexers(
    job: &mut Job<'_>,
    build: &Build<'_>,
    before: &BTreeMap<String, Vec<u8>>,
) -> BTreeMap<String, Vec<u8>> {
    let out_dir = build.out_dir;
    let base = build.base.clone();
    let mut now = kept_files(out_dir);
    let aux_name = format!("{base}.aux");
    for indexer in &INDEXERS {
        let glossary = indexer.input == "glo";
        let aux_text = |files: &BTreeMap<String, Vec<u8>>| {
            files
                .get(&aux_name)
                .map(|b| String::from_utf8_lossy(b).into_owned())
                .unwrap_or_default()
        };
        // every glossary's files (the acronyms' too), or the main glossary's when the .aux names none
        let mut pairs: Vec<(String, String)> = if glossary {
            crate::regex(r"\\@newglossary\{[^}]*\}\{[^}]*\}\{([^}]*)\}\{([^}]*)\}")
                .captures_iter(&aux_text(&now))
                .map(|c| (c[2].to_owned(), c[1].to_owned()))
                .collect()
        } else {
            Vec::new()
        };
        if pairs.is_empty() {
            pairs.push((indexer.input.to_owned(), indexer.output.to_owned()));
        }
        let file = |ext: &str| format!("{base}.{ext}");
        let changed = |ext: &str| before.get(&file(ext)) != now.get(&file(ext));
        // the glossaries' sort order and style, which change the .gls but not the .glo
        let setup = |files: &BTreeMap<String, Vec<u8>>| {
            if !glossary {
                return String::new();
            }
            crate::regex(
                r"(?m)^\\@(?:newglossary|glsorder|istfilename|xdylanguage|gls@codepage)\{.*$",
            )
            .find_iter(&aux_text(files))
            .map(|m| m.as_str().to_owned())
            .collect::<Vec<_>>()
            .join("\n")
        };
        let redo = setup(before) != setup(&now) || (glossary && changed("ist"));
        let due = pairs.iter().any(|(from, out)| {
            now.get(&file(from)).is_some_and(|bytes| {
                changed(from) || redo || (!now.contains_key(&file(out)) && !bytes.is_empty())
            })
        });
        if !due {
            continue;
        }
        let args = if glossary {
            vec![base.clone().into()]
        } else {
            vec![file("idx").into()]
        };
        // a .aux that would have the glossaries' programs run something else: neither runs
        let unsafe_aux =
            glossary && command::glossaries_unsafe(&aux_with_inputs(out_dir, &aux_name), &base);
        if unsafe_aux {
            job.note("\n[spectrum warning] The glossary settings in this document’s .aux file (or its name) hold characters a command line would run, so makeglossaries wasn’t run.");
        }
        let mut ran = None;
        for program in indexer.programs.iter().filter(|_| !unsafe_aux) {
            ran = build
                .run(
                    job,
                    Path::new(program),
                    args.clone(),
                    out_dir,
                    DEFAULT_LIMIT,
                )
                .await
                .ok();
            if ran.is_some_and(|r| r.code == Some(0)) || job.cancel.is_cancelled() {
                break;
            }
        }
        if ran.is_none_or(|r| r.code != Some(0)) && !job.cancel.is_cancelled() {
            let what = if glossary {
                "glossaries weren’t"
            } else {
                "index wasn’t"
            };
            job.note(&format!(
                "\n[spectrum warning] {} didn’t run, so the {what} built.",
                indexer.programs[0]
            ));
        }
        now = kept_files(out_dir);
    }
    now
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bib_files_are_copied_only_for_non_ascii_folders() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("out");
        let project = dir.path().join("大學");
        std::fs::create_dir_all(&out).unwrap();
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(project.join("refs.bib"), "@book{a}").unwrap();
        std::fs::write(
            out.join("main.bcf"),
            r#"<bcf:datasource type="file" datatype="bibtex" glob="false">refs.bib</bcf:datasource><bcf:datasource type="file" glob="false">../x.bib</bcf:datasource>"#,
        )
        .unwrap();
        bib_copies(&out, "main", &[&project]);
        assert!(out.join("refs.bib").is_file());
        assert_eq!(read_text(&out.join("main.bibcopies")), "refs.bib");
        // the next run takes its copies away first; an ASCII project gets none
        let ascii = dir.path().join("plain");
        std::fs::create_dir_all(&ascii).unwrap();
        bib_copies(&out, "main", &[&ascii]);
        assert!(!out.join("refs.bib").exists());
        assert!(!out.join("main.bibcopies").exists());
    }
}
