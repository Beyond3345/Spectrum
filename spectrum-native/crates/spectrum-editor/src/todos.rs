//! To-dos a file's source leaves for later, as 2.8's `scanTodos` found them: `\todo` and its kin,
//! and `TODO`, `FIXME` or `XXX` in a comment (`% TODO` in LaTeX and BibTeX, `// TODO` in Typst,
//! `<!-- TODO -->` in Markdown).

use crate::buffer::Buffer;
use crate::syntax::Language;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Todo {
    /// The line it is on, from 0.
    pub line: usize,
    /// Byte offset of the command's `\` or of the marker word.
    pub offset: usize,
    /// `todo`, `missingfigure`, `fixme`, `fxnote`, `fxwarning`, `fxerror`, `fxfatal`, or the
    /// marker: `TODO`, `FIXME`, `XXX`.
    pub kind: &'static str,
    /// The note: the command's argument or the comment's words after the marker, white space
    /// collapsed; the command or marker itself when there are none.
    pub text: String,
}

/// todonotes' `\todo` and `\missingfigure`, `\fixme`, and the fixme package's notes.
const COMMANDS: [&str; 7] = [
    "todo",
    "missingfigure",
    "fixme",
    "fxnote",
    "fxwarning",
    "fxerror",
    "fxfatal",
];
const MARKERS: [&str; 3] = ["TODO", "FIXME", "XXX"];
/// Commands that define another, so `\newcommand{\todo}` is not a to-do.
const DEFINERS: [&str; 13] = [
    "newcommand",
    "renewcommand",
    "providecommand",
    "DeclareRobustCommand",
    "NewDocumentCommand",
    "RenewDocumentCommand",
    "ProvideDocumentCommand",
    "DeclareDocumentCommand",
    "def",
    "edef",
    "gdef",
    "xdef",
    "let",
];

/// The file's to-dos in source order. Walks the whole text: call it when edits settle.
pub fn todos(language: Language, buffer: &Buffer) -> Vec<Todo> {
    let text = buffer.text();
    let mut found = match language {
        Language::Latex | Language::Bibtex => latex(&text),
        Language::Typst => typst(&text),
        Language::Markdown => markdown(&text),
    };
    found.sort_by_key(|t| t.offset);
    for todo in &mut found {
        todo.line = buffer.offset_to_point(todo.offset).line;
    }
    found
}

fn collapse(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_word(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// The first `TODO`, `FIXME` or `XXX` standing as a word of its own (not after a `\`), then an
/// optional `(who)`, separators, and the rest as the note. Returns (offset in `s`, kind, note).
fn marker(s: &str) -> Option<(usize, &'static str, String)> {
    let bytes = s.as_bytes();
    for (at, _) in s.char_indices() {
        let Some(kind) = MARKERS.into_iter().find(|m| s[at..].starts_with(m)) else {
            continue;
        };
        let before_ok = at == 0 || !(is_word(bytes[at - 1]) || bytes[at - 1] == b'\\');
        let end = at + kind.len();
        if !before_ok || bytes.get(end).is_some_and(|&b| is_word(b)) {
            continue;
        }
        let mut rest = &s[end..];
        if rest.starts_with('(')
            && let Some(close) = rest.find(')')
        {
            rest = &rest[close + 1..];
        }
        let rest = rest.trim_start_matches(|c: char| c.is_whitespace() || ":.-–—".contains(c));
        let note = collapse(rest);
        return Some((
            at,
            kind,
            if note.is_empty() {
                kind.to_owned()
            } else {
                note
            },
        ));
    }
    None
}

/// The text with each LaTeX comment blanked to spaces, so offsets stay as they were, and the
/// comments' (start, text).
fn split_comments(text: &str) -> (String, Vec<(usize, &str)>) {
    let mut code = String::with_capacity(text.len());
    let mut comments = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    let mut copied = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 2,
            b'%' => {
                let end = text[i..].find('\n').map_or(text.len(), |p| i + p);
                code.push_str(&text[copied..i]);
                code.extend(std::iter::repeat_n(' ', end - i));
                comments.push((i, &text[i..end]));
                copied = end;
                i = end;
            }
            _ => i += 1,
        }
    }
    code.push_str(&text[copied.min(text.len())..]);
    (code, comments)
}

fn latex(text: &str) -> Vec<Todo> {
    let (code, comments) = split_comments(text);
    let mut found = Vec::new();
    let bytes = code.as_bytes();
    for (at, _) in code.match_indices('\\') {
        let rest = &code[at + 1..];
        let Some(kind) = COMMANDS.into_iter().find(|c| {
            rest.starts_with(c)
                && !rest[c.len()..]
                    .bytes()
                    .next()
                    .is_some_and(|b| b.is_ascii_alphabetic() || b == b'@')
        }) else {
            continue;
        };
        if at > 0 && bytes[at - 1] == b'\\' || defined_here(&code[at.saturating_sub(40)..at]) {
            continue;
        }
        let mut after = &rest[kind.len()..];
        after = after.strip_prefix('*').unwrap_or(after);
        let Some(arg) = argument(after) else {
            continue;
        };
        // \todo{#1} inside another command's definition
        if arg
            .as_bytes()
            .windows(2)
            .any(|w| w[0] == b'#' && w[1].is_ascii_digit())
        {
            continue;
        }
        let note = collapse(&arg);
        found.push(Todo {
            line: 0,
            offset: at,
            kind,
            text: if note.is_empty() {
                format!("\\{kind}")
            } else {
                note
            },
        });
    }
    for (start, comment) in comments {
        if let Some((at, kind, text)) = marker(comment) {
            found.push(Todo {
                line: 0,
                offset: start + at,
                kind,
                text,
            });
        }
    }
    found
}

/// Whether the text just before a command ends in a definition of it: `\newcommand{`, `\def`.
fn defined_here(before: &str) -> bool {
    let s = before.trim_end();
    let s = s.strip_suffix('{').unwrap_or(s).trim_end();
    let s = s.strip_suffix('*').unwrap_or(s);
    DEFINERS
        .iter()
        .any(|d| s.strip_suffix(d).is_some_and(|head| head.ends_with('\\')))
}

/// The `{argument}` after any spaces and `[options]`, or `None` when there is none.
fn argument(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut i = 0;
    loop {
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if bytes.get(i) != Some(&b'[') {
            break;
        }
        let mut depth = 0i32;
        while i < bytes.len() {
            match bytes[i] {
                b'\\' => i += 1,
                b'{' => depth += 1,
                b'}' => depth -= 1,
                b']' if depth <= 0 => break,
                _ => {}
            }
            i += 1;
        }
        i += 1;
    }
    if bytes.get(i) != Some(&b'{') {
        return None;
    }
    let open = i + 1;
    let mut depth = 1;
    let mut j = open;
    while j < bytes.len() {
        match bytes[j] {
            b'\\' => j += 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(s[open..j].to_owned());
                }
            }
            _ => {}
        }
        j += 1;
    }
    None
}

/// `// TODO note`: the marker right after the slashes, the note to the end of the line.
fn typst(text: &str) -> Vec<Todo> {
    let mut found = Vec::new();
    for (at, _) in text.match_indices("//") {
        let after = &text[at + 2..];
        let line_end = after.find('\n').unwrap_or(after.len());
        let comment = &after[..line_end];
        let skipped = comment.len() - comment.trim_start_matches([' ', '\t']).len();
        if let Some((0, kind, note)) = marker(&comment[skipped..]) {
            found.push(Todo {
                line: 0,
                offset: at,
                kind,
                text: note,
            });
        }
    }
    found
}

/// `<!-- TODO note -->`, which may run over several lines.
fn markdown(text: &str) -> Vec<Todo> {
    let mut found = Vec::new();
    for (at, _) in text.match_indices("<!--") {
        let after = &text[at + 4..];
        let Some(close) = after.find("-->") else {
            continue;
        };
        let comment = after[..close].trim_start();
        if let Some((0, kind, note)) = marker(comment) {
            found.push(Todo {
                line: 0,
                offset: at,
                kind,
                text: note,
            });
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan(language: Language, text: &str) -> Vec<(usize, &'static str, String)> {
        todos(language, &Buffer::from_text(text))
            .into_iter()
            .map(|t| (t.line, t.kind, t.text))
            .collect()
    }

    #[test]
    fn latex_commands_and_comments() {
        let text = "\\section{A}\n\
                    \\todo[inline]{Cite the  survey}\n\
                    Text % TODO(dan): check units\n\
                    50\\% done \\missingfigure{plot}\n\
                    \\newcommand{\\todo}[1]{\\marginpar{#1}}\n\
                    \\def\\fixme{x}\n\
                    % \\renewcommand{\\TODO}{}\n\
                    % FIXME\n\
                    % XXXL is not a marker, nor is TODOS\n\
                    \\todolist{no}\n";
        assert_eq!(
            scan(Language::Latex, text),
            vec![
                (1, "todo", "Cite the survey".to_owned()),
                (2, "TODO", "check units".to_owned()),
                (3, "missingfigure", "plot".to_owned()),
                (7, "FIXME", "FIXME".to_owned()),
            ]
        );
    }

    #[test]
    fn a_commented_out_command_is_not_a_todo() {
        assert_eq!(scan(Language::Latex, "% \\todo{old}\n"), []);
    }

    #[test]
    fn typst_line_comments() {
        let text =
            "= Intro\nSome text. // TODO: expand\n#link(\"https://x.org\")\n// note TODO later\n";
        assert_eq!(
            scan(Language::Typst, text),
            vec![(1, "TODO", "expand".to_owned())]
        );
    }

    #[test]
    fn markdown_html_comments() {
        let text = "# A\n<!-- TODO write\n   more -->\n<!-- not a TODO -->\n<!--FIXME-->\n";
        assert_eq!(
            scan(Language::Markdown, text),
            vec![
                (1, "TODO", "write more".to_owned()),
                (4, "FIXME", "FIXME".to_owned()),
            ]
        );
    }

    #[test]
    fn percent_signs_in_typst_are_not_comments() {
        assert_eq!(scan(Language::Typst, "#set text(width: 80%) TODO\n"), []);
    }
}
