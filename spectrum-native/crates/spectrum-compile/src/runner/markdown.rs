//! Markdown in two steps, as 2.8's `compileMarkdown`: pandoc writes LaTeX (or Beamer slides) or Typst, which
//! then compiles like any document, with the PDF beside the .md.

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::command::DEFAULT_LIMIT;
use super::files::{self, MainFile};
use super::latex::{self, FromMarkdown, read_text};
use super::{CompileOutcome, Job, LatexEngine, MarkdownEngine};
use crate::engines::{at_least, version_of};
use crate::paths::{relative_under, resolve, to_slash};
use crate::process::{self, Env, Spawn};

const PANDOC_MISSING: &str =
    "Markdown needs pandoc. Download it from Settings › Engines › Markdown.";
const PANDOC_UNREADABLE: &str = "pandoc couldn’t read this Markdown.";

/// A front matter field: one value or a list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Field {
    One(String),
    List(Vec<String>),
}

impl Field {
    fn values(&self) -> Vec<&str> {
        match self {
            Self::One(v) => vec![v.as_str()],
            Self::List(list) => list.iter().map(String::as_str).collect(),
        }
    }

    /// Has a value (an empty field is an empty list).
    fn named(&self) -> bool {
        self.values().iter().any(|v| !v.is_empty())
    }
}

/// The YAML front matter's scalar and list fields (between a first `---` and the next `---` or `...`), as 2.8's
/// `parseFrontMatter` read them.
pub(super) fn front_matter(source: &str) -> BTreeMap<String, Field> {
    let lines: Vec<&str> = source.lines().collect();
    let mut meta = BTreeMap::new();
    if lines.first().map(|l| l.trim()) != Some("---") {
        return meta;
    }
    let Some(end) = lines
        .iter()
        .skip(1)
        .position(|l| crate::regex(r"^(?:---|\.\.\.)\s*$").is_match(l))
    else {
        return meta;
    };
    let unquote = |value: &str| {
        let text = value.trim();
        let quoted = text.len() > 1
            && ((text.starts_with('"') && text.ends_with('"'))
                || (text.starts_with('\'') && text.ends_with('\'')));
        if quoted {
            text[1..text.len() - 1].to_owned()
        } else {
            text.to_owned()
        }
    };
    let mut field: Option<String> = None;
    for line in &lines[1..=end] {
        if let (Some(c), Some(name)) = (crate::regex(r"^\s*-\s+(.*)$").captures(line), &field) {
            let entry = meta.entry(name.clone()).or_insert(Field::List(Vec::new()));
            if let Field::One(one) = entry {
                *entry = Field::List(if one.is_empty() {
                    vec![]
                } else {
                    vec![one.clone()]
                });
            }
            if let Field::List(list) = entry {
                list.push(unquote(&c[1]));
            }
            continue;
        }
        let Some(pair) = crate::regex(r"^([A-Za-z][\w-]*)\s*:\s*(.*)$").captures(line) else {
            continue;
        };
        let name = pair[1].to_owned();
        let raw = pair[2].trim();
        // a quoted value keeps its '#'; otherwise ' # …' (or a value that is only that) is a comment
        let value = if raw.starts_with(['"', '\'']) {
            raw.to_owned()
        } else {
            crate::regex(r"(?:^|\s)#.*$")
                .replace(&pair[2], "")
                .trim()
                .to_owned()
        };
        let parsed = if value.is_empty() {
            Field::List(Vec::new())
        } else if value.starts_with('[') && value.ends_with(']') {
            Field::List(
                value[1..value.len() - 1]
                    .split(',')
                    .map(unquote)
                    .filter(|v| !v.is_empty())
                    .collect(),
            )
        } else {
            Field::One(unquote(&value))
        };
        meta.insert(name.clone(), parsed);
        field = Some(name);
    }
    meta
}

/// slides: true (or yes, beamer) makes Beamer slides, which always go through LaTeX.
fn is_slides(meta: &BTreeMap<String, Field>) -> bool {
    meta.get("slides")
        .and_then(|f| f.values().first().map(|v| v.to_lowercase()))
        .is_some_and(|v| matches!(v.as_str(), "true" | "yes" | "beamer"))
}

/// The .md, then the files its front matter's `include:` names (from its folder, in the project, each once).
fn inputs(root: &Path, main: &Path, meta: &BTreeMap<String, Field>) -> Vec<PathBuf> {
    let mut files = vec![main.to_path_buf()];
    let dir = main.parent().unwrap_or(root);
    for name in meta.get("include").map(Field::values).unwrap_or_default() {
        let abs = resolve(dir, Path::new(name));
        if relative_under(root, &abs).is_some() && abs.is_file() && !files.contains(&abs) {
            files.push(abs);
        }
    }
    files
}

/// pandoc's `--bibliography`: none when the front matter names one (pandoc reads it), else every .bib in the
/// project.
fn bibliography_args(
    root: &Path,
    meta: &BTreeMap<String, Field>,
    project: &[PathBuf],
) -> Vec<OsString> {
    if meta.get("bibliography").is_some_and(Field::named) {
        return Vec::new();
    }
    project
        .iter()
        .filter(|f| f.extension().is_some_and(|e| e.eq_ignore_ascii_case("bib")))
        .flat_map(|f| {
            [
                OsString::from("--bibliography"),
                root.join(f).into_os_string(),
            ]
        })
        .collect()
}

/// The shared middle of both of pandoc's command lines: the filter, citations, bibliography, style and where
/// images are found.
fn common_args(
    job: &Job<'_>,
    main: &MainFile,
    meta: &BTreeMap<String, Field>,
    project: &[PathBuf],
) -> Vec<OsString> {
    let root = job.root();
    let mut args: Vec<OsString> = vec!["--standalone".into()];
    if let Some(filter) = job.tools.crossref_filter.as_ref().filter(|f| f.is_file()) {
        let mut arg = OsString::from("--lua-filter=");
        arg.push(filter);
        args.push(arg);
    }
    args.push("--citeproc".into());
    args.extend(bibliography_args(root, meta, project));
    let own_style = ["csl", "citation-style"]
        .iter()
        .any(|k| meta.get(*k).is_some_and(Field::named));
    if let Some(csl) = job.tools.csl.as_ref().filter(|c| !own_style && c.is_file()) {
        args.push("--csl".into());
        args.push(csl.into());
    }
    let mut resource = OsString::from("--resource-path=");
    if let Ok(joined) = std::env::join_paths([main.dir(), root]) {
        resource.push(joined);
    }
    args.push(resource);
    args
}

/// Every image the .md names, as pandoc's JSON, made a full path when it's a file in the project and its
/// description otherwise (a URL, a file elsewhere on the computer), so pandoc's writer reads nothing outside
/// the project and fetches nothing.
pub(super) fn vet_images(node: &mut Value, root: &Path, md_dir: &Path) {
    match node {
        Value::Array(items) => items.iter_mut().for_each(|n| vet_images(n, root, md_dir)),
        Value::Object(map) => {
            if map.get("t").and_then(Value::as_str) == Some("Image")
                && let Some(Value::Array(c)) = map.get_mut("c")
                && c.len() == 3
            {
                let src = c[2].get(0).and_then(Value::as_str).unwrap_or("").to_owned();
                vet_images(&mut c[1], root, md_dir);
                if src.to_lowercase().starts_with("data:") {
                    return;
                }
                let scheme = crate::regex(r"^[a-zA-Z][a-zA-Z0-9+.-]*:").is_match(&src);
                let decoded = percent_decode(&src);
                let found = (!scheme)
                    .then(|| {
                        project_image(&src, root, md_dir)
                            .or_else(|| project_image(&decoded, root, md_dir))
                    })
                    .flatten();
                if let Some(abs) = found {
                    c[2][0] = Value::String(abs.to_string_lossy().into_owned());
                } else {
                    let (attr, alt) = (c[0].take(), c[1].take());
                    map.insert("t".into(), Value::String("Span".into()));
                    map.insert("c".into(), Value::Array(vec![attr, alt]));
                }
                return;
            }
            map.values_mut().for_each(|n| vet_images(n, root, md_dir));
        }
        _ => {}
    }
}

/// An image found as pandoc looks (from the .md's folder, then the project's), as a file in the project.
fn project_image(src: &str, root: &Path, md_dir: &Path) -> Option<PathBuf> {
    [md_dir, root].iter().find_map(|dir| {
        let abs = resolve(dir, Path::new(src));
        let real = crate::paths::canonical(&abs);
        (relative_under(&crate::paths::canonical(root), &real).is_some() && abs.is_file())
            .then_some(abs)
    })
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(byte) = text
                .get(i + 1..i + 3)
                .and_then(|h| u8::from_str_radix(h, 16).ok())
        {
            out.push(byte);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_owned())
}

/// Every relative `image("…")` in pandoc's Typst made root relative, which is how Typst reads it from standard
/// input: from the .md's folder, else from the project's.
pub(super) fn root_relative_images(text: &str, root: &Path, md_dir: &Path) -> String {
    let folder = relative_under(root, md_dir)
        .map(|p| to_slash(&p))
        .unwrap_or_default();
    crate::regex(r#"(image\(\s*")([^"]+)(")"#)
        .replace_all(text, |c: &regex::Captures<'_>| {
            let source = &c[2];
            if crate::regex(r"^[a-zA-Z][a-zA-Z0-9+.-]*:").is_match(source)
                || source.starts_with(['/', '#'])
            {
                return c[0].to_owned();
            }
            let from_root = !md_dir.join(source).exists() && root.join(source).exists();
            let rel = if from_root || folder.is_empty() {
                source.to_owned()
            } else {
                format!("{folder}/{source}")
            };
            let normal = to_slash(&resolve(Path::new("/"), Path::new(&rel)));
            format!("{}{normal}{}", &c[1], &c[3])
        })
        .into_owned()
}

/// CJK text needs `XeLaTeX` or `LuaLaTeX` in pandoc's LaTeX: pdfLaTeX gives way to whichever is installed, and
/// latexmk runs `XeLaTeX`.
fn unicode_engine(
    job: &mut Job<'_>,
    engine: LatexEngine,
    text: &str,
) -> (LatexEngine, Option<&'static str>) {
    let cjk = crate::regex(r"[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]").is_match(text);
    match engine {
        LatexEngine::Latexmk if cjk => (engine, Some("xelatex")),
        LatexEngine::PdfLatex if cjk => {
            for (choice, name) in [
                (LatexEngine::XeLatex, "XeLaTeX"),
                (LatexEngine::LuaLatex, "LuaLaTeX"),
            ] {
                if job.tools.engines.find(choice.name()).is_some() {
                    job.note(&format!("[spectrum note] This compile used {name}, as Chinese, Japanese or Korean text needs XeLaTeX or LuaLaTeX."));
                    return (choice, None);
                }
            }
            (engine, None)
        }
        _ => (engine, None),
    }
}

async fn run_pandoc(
    job: &mut Job<'_>,
    pandoc: &Path,
    args: Vec<OsString>,
    cwd: &Path,
) -> Result<bool, String> {
    let mut env = Env::safe_system();
    env.set("PATH", job.tools.engines.search_path());
    // a ```mermaid block's picture, which the crossref filter looks for
    env.set(
        "SPECTRUM_MERMAID_DIR",
        job.root().join(".spectrum").join("mermaid"),
    );
    let exit = process::run(
        Spawn {
            program: pandoc,
            args,
            cwd,
            env: &env,
            limit: DEFAULT_LIMIT,
            stdin: None,
            profile: None,
        },
        &mut job.sink,
        job.cancel,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(exit.code == Some(0))
}

pub(super) async fn compile(job: &mut Job<'_>, main: &MainFile) -> CompileOutcome {
    let request = job.request;
    let source = read_text(&main.abs);
    let meta = front_matter(&source);
    let typst = request.markdown_engine == MarkdownEngine::Typst && !is_slides(&meta);
    let label = if typst {
        "typst"
    } else {
        request.engine.name()
    };
    let Some(pandoc) = job.tools.engines.pandoc() else {
        return CompileOutcome::failed(label, PANDOC_MISSING, String::new());
    };
    let Some(version) = version_of(&pandoc).await else {
        return CompileOutcome::failed(label, PANDOC_MISSING, String::new());
    };
    if let Some(error) = pandoc_problem(&version, typst) {
        return CompileOutcome::failed(label, error, String::new());
    }
    let generated = files::sibling(&request.out_dir, "-md");
    if let Err(error) = files::fresh_dir(&generated) {
        return CompileOutcome::failed(label, error, String::new());
    }
    let root = job.root().to_path_buf();
    let md_dir = main.dir().to_path_buf();
    let (_, project) = files::project_entries(&root);
    let inputs = inputs(&root, &main.abs, &meta);
    let text: String = inputs
        .iter()
        .map(|f| read_text(f))
        .collect::<Vec<_>>()
        .join("\n\n");
    let mut args: Vec<OsString> = Vec::new();
    let name = format!("{}.{}", main.base(), if typst { "typ" } else { "tex" });
    let out_file = generated.join(&name);
    if typst {
        args.extend(inputs.iter().map(|f| f.clone().into_os_string()));
        args.extend(["--from=markdown".into(), "--to=typst".into()]);
    } else {
        // the images go through pandoc's JSON first, so --extract-media copies none from outside the project
        let json = generated.join(format!("{}.json", main.base()));
        let mut vet: Vec<OsString> = inputs.iter().map(|f| f.clone().into_os_string()).collect();
        vet.extend([
            "--from=markdown".into(),
            "--to=json".into(),
            "--sandbox".into(),
            "-o".into(),
            json.clone().into(),
        ]);
        let read = run_pandoc(job, &pandoc, vet, &md_dir).await;
        let doc = std::fs::read(&json)
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok());
        let (Ok(true), Some(mut doc)) = (read, doc) else {
            return pandoc_failed(job, label);
        };
        vet_images(&mut doc, &root, &md_dir);
        if std::fs::write(&json, doc.to_string()).is_err() {
            return pandoc_failed(job, label);
        }
        args.extend([json.into_os_string(), "--from=json".into()]);
        args.push(
            if is_slides(&meta) {
                "--to=beamer"
            } else {
                "--to=latex"
            }
            .into(),
        );
    }
    args.extend(common_args(job, main, &meta, &project));
    if !typst {
        let mut media = OsString::from("--extract-media=");
        media.push(generated.join("media"));
        args.push(media);
    }
    args.extend(["-o".into(), out_file.clone().into_os_string()]);
    if !matches!(run_pandoc(job, &pandoc, args, &md_dir).await, Ok(true)) || !out_file.is_file() {
        return pandoc_failed(job, label);
    }
    if typst {
        let typ = root_relative_images(&read_text(&out_file), &root, &md_dir);
        return super::typst::compile(job, main, Some(typ)).await;
    }
    let (engine, latexmk_engine) = unicode_engine(job, request.engine, &text);
    let generated_main = MainFile {
        abs: out_file,
        rel: main.rel.clone(),
    };
    latex::compile_document(
        job,
        engine,
        &generated_main,
        Some(FromMarkdown {
            source: Some(&main.abs),
            latexmk_engine,
        }),
    )
    .await
}

fn pandoc_problem(version: &str, typst: bool) -> Option<String> {
    let minimum = crate::EngineManifest::bundled().ok()?.pandoc;
    let wanted = if typst {
        &minimum.minimum.typst
    } else {
        &minimum.minimum.latex
    };
    let latest = &minimum.release.version;
    if typst && !at_least(version, wanted) && at_least(version, &minimum.minimum.latex) {
        return Some(format!(
            "Typst as the PDF engine needs pandoc {wanted} or later, and this pandoc is {version}. Download pandoc {latest} from Settings › Engines › Markdown, or choose LaTeX as the PDF engine in the Compile menu."
        ));
    }
    (!at_least(version, wanted)).then(|| {
        format!("This pandoc ({version}) is too old for Spectrum. Download pandoc {latest} from Settings › Engines › Markdown.")
    })
}

fn pandoc_failed(job: &mut Job<'_>, label: &str) -> CompileOutcome {
    if job.cancel.is_cancelled() {
        return CompileOutcome::stopped(label, job.take_log());
    }
    CompileOutcome::failed(label, PANDOC_UNREADABLE, job.take_log())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn front_matter_fields() {
        let meta = front_matter(
            "---\ntitle: \"A # B\"\nslides: yes # comment\ninclude:\n  - one.md\n  - 'two.md'\ntags: [a, \"b\"]\nempty:\n---\nbody",
        );
        assert_eq!(meta["title"], Field::One("A # B".into()));
        assert!(is_slides(&meta));
        assert_eq!(
            meta["include"],
            Field::List(vec!["one.md".into(), "two.md".into()])
        );
        assert_eq!(meta["tags"], Field::List(vec!["a".into(), "b".into()]));
        assert!(!meta["empty"].named());
        assert!(front_matter("no front matter").is_empty());
        assert!(front_matter("---\nunclosed: 1\n").is_empty());
    }

    #[test]
    fn only_project_images_survive_vetting() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("p");
        std::fs::create_dir_all(root.join("img")).unwrap();
        std::fs::write(root.join("img/a b.png"), "png").unwrap();
        std::fs::write(dir.path().join("secret.png"), "x").unwrap();
        let image = |src: &str| serde_json::json!({"t": "Image", "c": [["", [], []], [{"t": "Str", "c": "alt"}], [src, ""]]});
        let mut doc = serde_json::json!([
            image("img/a%20b.png"),
            image("../secret.png"),
            image("https://x/y.png"),
            image("data:image/png;base64,AA")
        ]);
        vet_images(&mut doc, &root, &root);
        assert_eq!(
            doc[0]["c"][2][0],
            Value::String(root.join("img/a b.png").to_string_lossy().into_owned())
        );
        assert_eq!(doc[1]["t"], "Span");
        assert_eq!(doc[2]["t"], "Span");
        assert_eq!(doc[3]["t"], "Image");
    }

    #[test]
    fn typst_images_become_root_relative() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("notes")).unwrap();
        std::fs::write(root.join("logo.png"), "").unwrap();
        let md_dir = root.join("notes");
        let text = r#"#image("pic.png") #image("logo.png") #image("/abs.png") #image("https://x")"#;
        assert_eq!(
            root_relative_images(text, root, &md_dir),
            r#"#image("/notes/pic.png") #image("/logo.png") #image("/abs.png") #image("https://x")"#
        );
    }
}
