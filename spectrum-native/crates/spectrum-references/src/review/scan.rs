//! What Review reads out of LaTeX source: code without comments and verbatim text, what a file loads and
//! labels, its floats, headings, abstract and keywords, and the to-dos left in it (2.8's `scanTex`,
//! `scanInsights` and `scanTodos`, the parts Review uses).

use std::sync::LazyLock;

use regex::Regex;

use crate::text::{match_brace, re, without_comments};

const VERBATIM_ENVS: &[&str] = &[
    "verbatim",
    "verbatim*",
    "lstlisting",
    "minted",
    "comment",
    "Verbatim",
    "Verbatim*",
];

fn blank(s: &mut [u8], from: usize, to: usize) {
    let end = to.min(s.len());
    for b in &mut s[from..end] {
        if *b != b'\n' {
            *b = b' ';
        }
    }
}

/// A source's code: comments gone, what verbatim environments and `\verb` show blanked, line breaks kept.
pub(crate) fn code_of(text: &str) -> String {
    let code = without_comments(text);
    let mut bytes = code.clone().into_bytes();
    for env in VERBATIM_ENVS {
        let mut from = 0;
        while let Some(at) = find_begin(&code, env, from) {
            let close = format!("\\end{{{env}}}");
            let end = code[at..]
                .find(&close)
                .map_or(code.len(), |k| at + k + close.len());
            blank(&mut bytes, at, end);
            from = end;
        }
    }
    let mut from = 0;
    while let Some(k) = code[from..].find("\\verb") {
        let at = from + k;
        let mut i = at + 5;
        if code.as_bytes().get(i) == Some(&b'*') {
            i += 1;
        }
        from = i;
        let Some(delim) = code[i..]
            .chars()
            .next()
            .filter(|c| !c.is_ascii_alphabetic() && !c.is_whitespace())
        else {
            continue;
        };
        let body = i + delim.len_utf8();
        let line_end = code[body..].find('\n').map_or(code.len(), |e| body + e);
        if let Some(e) = code[body..line_end].find(delim) {
            blank(&mut bytes, at, body + e + delim.len_utf8());
            from = body + e + delim.len_utf8();
        }
    }
    // only ASCII was blanked, so the text stays UTF-8
    String::from_utf8(bytes).unwrap_or(code)
}

fn find_begin(code: &str, env: &str, from: usize) -> Option<usize> {
    let mut i = from;
    while let Some(k) = code[i..].find("\\begin") {
        let at = i + k;
        let rest = code[at + 6..].trim_start();
        if let Some(r) = rest.strip_prefix('{')
            && r.strip_prefix(env).is_some_and(|t| t.starts_with('}'))
        {
            return Some(at);
        }
        i = at + 6;
    }
    None
}

/// The line (from 1) of each byte offset.
pub(crate) struct Lines(Vec<usize>);

impl Lines {
    pub fn new(text: &str) -> Self {
        Self(text.match_indices('\n').map(|(i, _)| i).collect())
    }
    pub fn at(&self, offset: usize) -> usize {
        self.0.partition_point(|&b| b < offset) + 1
    }
}

static LOAD: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"\\(usepackage|RequirePackage|documentclass|LoadClass)(?:WithOptions)?\s*(?:\[[^\]]*\]\s*)?\{([^}]+)\}",
    )
});
pub(crate) static INPUT: LazyLock<Regex> = LazyLock::new(|| {
    re(r"\\(?:input|include|subfile)\s*\{([^}]+)\}|\\(?:sub)?import\*?\s*\{([^}]*)\}\s*\{([^}]+)\}")
});
static LABEL_PLAIN: LazyLock<Regex> = LazyLock::new(|| re(r"\\label\s*\{([^{}#\\]+)\}"));
static EXTERNAL: LazyLock<Regex> = LazyLock::new(|| {
    re(r"\\z?externaldocument\*?\s*(?:\[([^\]]*)\]\s*)?(?:\[[^\]]*\]\s*)*\{([^}]+)\}")
});
static BIB: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\(?:bibliography|addbibresource)\s*(?:\[[^\]]*\]\s*)?\{([^}]+)\}"));

/// What a LaTeX file loads, labels and links.
#[derive(Debug, Default)]
pub(crate) struct TexScan {
    pub classes: Vec<String>,
    pub inputs: Vec<String>,
    pub labels: Vec<String>,
    pub bibs: Vec<String>,
    /// `\externaldocument[prefix]{name}`.
    pub externals: Vec<(String, String)>,
}

/// The name an [`INPUT`] match pulls in; `\import`'s folder and file joined.
pub(crate) fn input_name(c: &regex::Captures) -> String {
    c.get(1).map_or_else(
        || {
            format!(
                "{}/{}",
                c.get(2)
                    .map_or("", |m| m.as_str().trim())
                    .trim_end_matches('/'),
                c.get(3).map_or("", |m| m.as_str().trim())
            )
            .trim_start_matches('/')
            .to_owned()
        },
        |m| m.as_str().trim().to_owned(),
    )
}

fn names(list: &str) -> Vec<String> {
    list.split(',')
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(str::to_owned)
        .collect()
}

pub(crate) fn scan_tex(src: &str) -> TexScan {
    let src = without_comments(src);
    let mut scan = TexScan::default();
    for c in LOAD.captures_iter(&src) {
        if c[1].to_lowercase().contains("class") {
            scan.classes.extend(names(&c[2]));
        }
    }
    scan.inputs = INPUT.captures_iter(&src).map(|c| input_name(&c)).collect();
    scan.labels = LABEL_PLAIN
        .captures_iter(&src)
        .map(|c| c[1].trim().to_owned())
        .collect();
    scan.bibs = BIB.captures_iter(&src).flat_map(|c| names(&c[1])).collect();
    scan.externals = EXTERNAL
        .captures_iter(&src)
        .map(|c| {
            (
                c.get(1).map_or("", |m| m.as_str().trim()).to_owned(),
                c[2].trim().to_owned(),
            )
        })
        .collect();
    scan
}

/// A float or heading row: where, its text, its label, its level.
#[derive(Debug, Clone, Default)]
pub(crate) struct Row {
    pub file: String,
    pub line: usize,
    pub text: String,
    pub label: Option<String>,
    pub level: Option<usize>,
}

#[derive(Debug, Default)]
pub(crate) struct Insights {
    pub headings: Vec<Row>,
    pub figures: Vec<Row>,
    pub tables: Vec<Row>,
    pub abstract_text: String,
    pub keywords: Vec<String>,
}

static HEADING: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\(chapter|section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{"));
static FLOAT: LazyLock<Regex> = LazyLock::new(|| {
    re(r"\\begin\s*\{(figure|table|wrapfigure|wraptable|sidewaysfigure|sidewaystable)\*?\}")
});
static CAPTION: LazyLock<Regex> = LazyLock::new(|| re(r"\\caption\s*(?:\[[^\]]*\]\s*)?\{"));
pub(crate) static LABEL: LazyLock<Regex> = LazyLock::new(|| re(r"\\label\s*\{([^{}]+)\}"));
static KEYWORDS_ENV: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?s)\\begin\s*\{(?:keywords?|IEEEkeywords)\}(.*?)\\end\s*\{(?:keywords?|IEEEkeywords)\}")
});
static ABSTRACT_ENV: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?s)\\begin\s*\{abstract\}(.*?)\\end\s*\{abstract\}"));
static KEYWORD_SEP: LazyLock<Regex> = LazyLock::new(|| re(r"\\sep\b|\\and\b|[,;·]"));

fn group_after(code: &str, open: usize) -> Option<String> {
    let close = match_brace(code, open)?;
    Some(code[open + 1..close].to_owned())
}

fn arg(code: &str, name: &str) -> Option<String> {
    let r = re(&format!(r"\\{name}\s*(?:\[[^\]]*\]\s*)?\{{"));
    let m = r.find(code)?;
    group_after(code, m.end() - 1)
}

pub(crate) fn scan_insights(files: &[(String, String)]) -> Insights {
    let mut out = Insights::default();
    for (path, text) in files {
        let code = without_comments(text);
        let lines = Lines::new(&code);
        let row = |at: usize, text: String, label: Option<String>, level: Option<usize>| Row {
            file: path.clone(),
            line: lines.at(at),
            text,
            label,
            level,
        };
        for m in HEADING.captures_iter(&code) {
            let (Some(whole), Some(kind)) = (m.get(0), m.get(1)) else {
                continue;
            };
            let Some(title) = group_after(&code, whole.end() - 1) else {
                continue;
            };
            let level = ["chapter", "section", "subsection", "subsubsection"]
                .iter()
                .position(|l| *l == kind.as_str());
            let text = plain_text(&title);
            out.headings.push(row(
                whole.start(),
                if text.is_empty() {
                    "(untitled)".into()
                } else {
                    text
                },
                None,
                level,
            ));
        }
        for m in FLOAT.captures_iter(&code) {
            let (Some(whole), Some(kind)) = (m.get(0), m.get(1)) else {
                continue;
            };
            let env = &whole.as_str()
                [whole.as_str().find('{').map_or(0, |k| k + 1)..whole.as_str().len() - 1];
            let end = code[whole.start()..]
                .find(&format!("\\end{{{env}}}"))
                .map_or(code.len(), |k| whole.start() + k);
            let body = &code[whole.start()..end];
            // the last \caption is the float's own (subfigures' come first); a label before it is the fallback
            let caption = CAPTION.find_iter(body).last();
            let after = caption.map_or("", |c| &body[c.start()..]);
            let label = LABEL
                .captures(after)
                .or_else(|| LABEL.captures_iter(body).last())
                .map(|c| c[1].trim().to_owned());
            let text = caption
                .and_then(|c| group_after(body, c.end() - 1))
                .map(|t| plain_text(&t))
                .unwrap_or_default();
            let r = row(whole.start(), text, label, None);
            if kind.as_str().contains("table") {
                out.tables.push(r);
            } else {
                out.figures.push(r);
            }
        }
        if out.keywords.is_empty() {
            let list = KEYWORDS_ENV
                .captures(&code)
                .map(|c| c[1].to_owned())
                .or_else(|| arg(&code, "keywords"))
                .unwrap_or_default();
            out.keywords = KEYWORD_SEP
                .split(&list)
                .map(plain_text)
                .filter(|k| !k.is_empty())
                .collect();
        }
        if out.abstract_text.is_empty() {
            out.abstract_text = plain_text(
                &ABSTRACT_ENV
                    .captures(&code)
                    .map(|c| c[1].to_owned())
                    .or_else(|| arg(&code, "abstract"))
                    .unwrap_or_default(),
            );
        }
    }
    out
}

static HREF: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\href\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\}\s*\{([^{}]*)\}"));
static DROPPED: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"[ \t~]*\\(?:url|includegraphics|[hv]space\*?|[A-Za-z]*[cC]ite[A-Za-z]*\*?)\s*(?:\[[^\]]*\]\s*){0,2}\{[^{}]*\}",
    )
});
static REF: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\(?:page)?(?:ref|eqref|autoref|cref|Cref|vref)\*?\s*\{([^{}]*)\}"));
static LOGO: LazyLock<Regex> =
    LazyLock::new(|| re(r"\\(LaTeXe|LaTeX|TeX|BibTeX|XeLaTeX|LuaLaTeX|pdfLaTeX)(?:\{\})?"));
static NOTES: LazyLock<Regex> = LazyLock::new(|| {
    re(r"\\(?:label|index|footnote|thanks)\s*(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}")
});
static BREAK: LazyLock<Regex> = LazyLock::new(|| re(r"\\\\(?:\[[^\]]*\])?"));
static ESCAPED: LazyLock<Regex> = LazyLock::new(|| re(r"\\([&%$#_{} ])"));
static COMMAND: LazyLock<Regex> = LazyLock::new(|| re(r"\\[A-Za-z@]+\*?\s*(?:\[[^\]]*\])?"));

/// LaTeX made readable for a list: commands dropped (their arguments kept), links their text, citations,
/// labels and notes gone, a `\ref` its key, braces gone, on one line.
pub(crate) fn plain_text(tex: &str) -> String {
    let s = HREF.replace_all(tex, "$1");
    let s = DROPPED.replace_all(&s, "");
    let s = REF.replace_all(&s, "$1");
    let s = LOGO.replace_all(&s, "$1");
    let s = s
        .replace("---", "—")
        .replace("--", "–")
        .replace("``", "“")
        .replace("''", "”");
    let s = NOTES.replace_all(&s, "");
    let s = BREAK.replace_all(&s, " ");
    let s = ESCAPED.replace_all(&s, "$1");
    let s = s.replace('~', " ");
    let s = COMMAND.replace_all(&s, "");
    crate::text::squash(&s.replace(['{', '}'], ""))
}

/// A to-do left in the source: `\todo`, `\missingfigure`, `\fixme`, the fixme package's notes, or TODO, FIXME or
/// XXX in a comment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Todo {
    pub file: String,
    pub line: usize,
    pub text: String,
    pub kind: String,
}

static TODO_COMMAND: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    crate::text::fre(
        r"\\(todo|missingfigure|fixme|fxnote|fxwarning|fxerror|fxfatal)(?![A-Za-z@])\*?",
    )
});
static DEFINED: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"\\(?:(?:re)?newcommand|providecommand|DeclareRobustCommand|(?:New|Renew|Provide|Declare)DocumentCommand|[egx]?def|let)\*?\s*\{?\s*$",
    )
});
static MARKER: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    crate::text::fre(r"(?<![\w\\])(TODO|FIXME|XXX)(?!\w)(?:\([^)]*\))?[\s:.\-–—]*(.*)")
});
static TYPST_TODO: LazyLock<Regex> =
    LazyLock::new(|| re(r"//[ \t]*(TODO|FIXME|XXX)(?:\([^)]*\))?[\s:.\-–—]*(.*)"));
static MD_TODO: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?s)<!--\s*(TODO|FIXME|XXX)(?:\([^)]*\))?[\s:.\-–—]*(.*?)-->"));

/// The argument at `i`, after any `[options]`, spaces squashed.
fn argument(code: &str, mut i: usize) -> Option<String> {
    let b = code.as_bytes();
    loop {
        while b.get(i).is_some_and(u8::is_ascii_whitespace) {
            i += 1;
        }
        if b.get(i) != Some(&b'[') {
            break;
        }
        let close = code[i..].find(']')?;
        i += close + 1;
    }
    if b.get(i) != Some(&b'{') {
        return None;
    }
    group_after(code, i).map(|t| crate::text::squash(&t))
}

#[allow(clippy::case_sensitive_file_extension_comparisons)]
pub(crate) fn scan_todos(files: &[(String, String)]) -> Vec<Todo> {
    let mut found = Vec::new();
    for (path, text) in files {
        let lower = path.to_lowercase();
        let latex =
            !(lower.ends_with(".typ") || lower.ends_with(".md") || lower.ends_with(".markdown"));
        let lines = Lines::new(text);
        let mut marks: Vec<(usize, Todo)> = Vec::new();
        if latex {
            // comments blanked, offsets and lines kept
            let code = blank_comments(text);
            for m in TODO_COMMAND.captures_iter(&code).flatten() {
                let (Some(whole), Some(kind)) = (m.get(0), m.get(1)) else {
                    continue;
                };
                let at = whole.start();
                if DEFINED.is_match(&code[at.saturating_sub(40)..at]) {
                    continue;
                }
                let Some(arg) = argument(&code, whole.end()) else {
                    continue;
                };
                if arg.contains('#') {
                    continue;
                }
                let text = if arg.is_empty() {
                    format!("\\{}", kind.as_str())
                } else {
                    arg
                };
                marks.push((
                    at,
                    Todo {
                        file: path.clone(),
                        line: lines.at(at),
                        text,
                        kind: kind.as_str().into(),
                    },
                ));
            }
            for (start, comment) in comments(text) {
                let Ok(Some(m)) = MARKER.captures(comment) else {
                    continue;
                };
                let (Some(whole), Some(kind)) = (m.get(0), m.get(1)) else {
                    continue;
                };
                let rest = m.get(2).map_or("", |r| r.as_str()).trim();
                let at = start + whole.start();
                marks.push((
                    at,
                    Todo {
                        file: path.clone(),
                        line: lines.at(at),
                        text: if rest.is_empty() {
                            kind.as_str().into()
                        } else {
                            rest.into()
                        },
                        kind: kind.as_str().into(),
                    },
                ));
            }
        } else {
            let re = if lower.ends_with(".typ") {
                &*TYPST_TODO
            } else {
                &*MD_TODO
            };
            for m in re.captures_iter(text) {
                let Some(whole) = m.get(0) else { continue };
                let rest = crate::text::squash(&m[2]);
                marks.push((
                    whole.start(),
                    Todo {
                        file: path.clone(),
                        line: lines.at(whole.start()),
                        text: if rest.is_empty() {
                            m[1].to_owned()
                        } else {
                            rest
                        },
                        kind: m[1].to_owned(),
                    },
                ));
            }
        }
        marks.sort_by_key(|(at, _)| *at);
        found.extend(marks.into_iter().map(|(_, t)| t));
    }
    found
}

/// Each `%` comment and where it starts (escaped `\%` aside).
fn comments(text: &str) -> Vec<(usize, &str)> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'\\' => i += 2,
            b'%' => {
                let end = text[i..].find(['\n', '\r']).map_or(text.len(), |e| i + e);
                out.push((i, &text[i..end]));
                i = end;
            }
            _ => i += 1,
        }
    }
    out
}

fn blank_comments(text: &str) -> String {
    let mut bytes = text.as_bytes().to_vec();
    for (start, c) in comments(text) {
        blank(&mut bytes, start, start + c.len());
    }
    String::from_utf8(bytes).unwrap_or_else(|_| text.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_code_floats_and_todos() {
        let src = "\\begin{verbatim}\n\\label{fake}\n\\end{verbatim}\n\\verb|\\cite{x}| \\section{Intro}\\label{sec:i}\n\\begin{figure}\\caption{A \\emph{cat}}\\label{fig:a}\\end{figure}\n% TODO: tidy this\n\\todo{check}\n";
        let code = code_of(src);
        assert!(
            !code.contains("fake")
                && !code.contains("cite")
                && code.lines().count() == src.lines().count()
        );
        let ins = scan_insights(&[("main.tex".into(), src.into())]);
        assert_eq!(
            (ins.headings[0].text.as_str(), ins.headings[0].level),
            ("Intro", Some(1))
        );
        assert_eq!(
            (
                ins.figures[0].text.as_str(),
                ins.figures[0].label.as_deref(),
                ins.figures[0].line
            ),
            ("A cat", Some("fig:a"), 5)
        );
        let todos = scan_todos(&[("main.tex".into(), src.into())]);
        let kinds: Vec<(&str, &str, usize)> = todos
            .iter()
            .map(|t| (t.kind.as_str(), t.text.as_str(), t.line))
            .collect();
        assert_eq!(kinds, [("TODO", "tidy this", 6), ("todo", "check", 7)]);
    }
}
