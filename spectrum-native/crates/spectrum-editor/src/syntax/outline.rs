//! The document outline from the syntax tree: headings, captioned floats and BibTeX entries.

use std::ops::Range;

use tree_sitter::Node;

use super::{Language, Syntax, node_text, walk};
use crate::buffer::Buffer;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutlineKind {
    Heading,
    /// A figure, table, algorithm or listing with a caption; one level below the heading before it.
    Float,
    /// A BibTeX entry (`@article{key, …}`); `detail` holds its type.
    Entry,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OutlineItem {
    pub kind: OutlineKind,
    /// LaTeX: `\part` 0, `\chapter` 1, `\section` 2 … `\subparagraph` 6. Typst and Markdown: the
    /// number of `=` or `#` (a setext heading is 1 or 2). Floats: the heading before them + 1.
    /// BibTeX entries: 1.
    pub level: u8,
    /// As the outline shows it: `\texorpdfstring` as its plain form, `\emph{x}` as `x`, a
    /// reference or citation as `…`, `~` as a space. Floats read "Figure: caption".
    pub title: String,
    /// A BibTeX entry's type in lower case (`article`); empty for everything else.
    pub detail: String,
    /// The whole section, float or entry, so "which heading is the cursor in" is a range test.
    pub range: Range<usize>,
    /// The line the heading, float or entry starts on.
    pub line: usize,
}

impl Syntax {
    /// The outline in reading order. Empty while there is no tree for this version of the buffer.
    /// Walks the tree's structure (not its prose), so call it when edits settle.
    pub fn outline(&self, buffer: &Buffer) -> Vec<OutlineItem> {
        let Some(tree) = self.current_tree(buffer) else {
            return Vec::new();
        };
        let mut items = Vec::new();
        walk(tree, |node| {
            let kind = node.kind();
            // a node on one line holds no heading below it, unless it is one (`\part{A}\chapter{B}`)
            let multi_line = node.end_position().row > node.start_position().row;
            match self.language {
                Language::Latex => {
                    if latex_level(kind).is_some() {
                        items.extend(latex_heading(buffer, node));
                        return true;
                    }
                    if kind == "generic_environment" {
                        items.extend(latex_float(buffer, node));
                        return true;
                    }
                    multi_line && kind != "text"
                }
                Language::Typst => match kind {
                    "heading" => {
                        items.extend(typst_heading(buffer, node));
                        false
                    }
                    "call" => {
                        items.extend(typst_figure(buffer, node));
                        multi_line
                    }
                    "code" => true,
                    _ => multi_line,
                },
                Language::Markdown => match kind {
                    "atx_heading" | "setext_heading" => {
                        items.extend(markdown_heading(buffer, node));
                        false
                    }
                    _ => multi_line,
                },
                Language::Bibtex => {
                    if kind == "entry" {
                        items.extend(bibtex_entry(buffer, node));
                        false
                    } else {
                        kind == "document"
                    }
                }
            }
        });
        // a float sits one level below the heading before it
        let mut level = 0;
        for item in &mut items {
            match item.kind {
                OutlineKind::Heading => level = item.level,
                OutlineKind::Float => item.level = level + 1,
                OutlineKind::Entry => {}
            }
        }
        items
    }
}

fn item(kind: OutlineKind, level: u8, title: String, node: Node<'_>) -> OutlineItem {
    OutlineItem {
        kind,
        level,
        title,
        detail: String::new(),
        range: node.byte_range(),
        line: node.start_position().row,
    }
}

/// The text between a group's brackets.
fn inside(buffer: &Buffer, group: Node<'_>) -> String {
    let text = node_text(buffer, group);
    let text = text.strip_prefix(['{', '[']).unwrap_or(&text);
    text.strip_suffix(['}', ']']).unwrap_or(text).to_owned()
}

fn latex_level(kind: &str) -> Option<u8> {
    Some(match kind {
        "part" => 0,
        "chapter" => 1,
        "section" => 2,
        "subsection" => 3,
        "subsubsection" => 4,
        "paragraph" => 5,
        "subparagraph" => 6,
        _ => return None,
    })
}

fn latex_heading(buffer: &Buffer, node: Node<'_>) -> Option<OutlineItem> {
    let level = latex_level(node.kind())?;
    let title = node
        .child_by_field_name("text")
        .map(|group| clean_title(&inside(buffer, group)))
        .unwrap_or_default();
    Some(item(OutlineKind::Heading, level, untitled(title), node))
}

/// A float environment with a `\caption` of its own (not one inside a nested `subfigure`).
fn latex_float(buffer: &Buffer, env: Node<'_>) -> Option<OutlineItem> {
    let name = env
        .child_by_field_name("begin")?
        .child_by_field_name("name")?
        .child_by_field_name("text")?;
    let mut walk = env.walk();
    let caption = env
        .children(&mut walk)
        .find(|c| c.kind() == "caption")?
        .child_by_field_name("long")?;
    let name = node_text(buffer, name);
    let name = name.trim_end_matches('*');
    let supplement = if name.ends_with("figure") {
        "Figure"
    } else if name.ends_with("table") {
        "Table"
    } else if name.starts_with("algorithm") {
        "Algorithm"
    } else if name.ends_with("listing") {
        "Listing"
    } else {
        return None;
    };
    let caption = clean_title(&inside(buffer, caption));
    Some(item(
        OutlineKind::Float,
        0,
        format!("{supplement}: {caption}"),
        env,
    ))
}

/// A heading item whose range is the section the heading opens (Typst and Markdown wrap them in
/// `section` nodes; a Markdown setext heading opens none), or the heading alone.
fn heading_item(level: u8, title: String, node: Node<'_>) -> OutlineItem {
    let mut item = item(OutlineKind::Heading, level, untitled(title), node);
    if let Some(section) = node
        .parent()
        .filter(|p| p.kind() == "section" && p.start_byte() == node.start_byte())
    {
        item.range = section.byte_range();
    }
    item
}

fn typst_heading(buffer: &Buffer, node: Node<'_>) -> Option<OutlineItem> {
    let marker = node.child(0)?;
    let level = u8::try_from(marker.kind().len()).ok()?;
    let mut end = node.end_byte();
    let mut walk = node.walk();
    if let Some(label) = node.children(&mut walk).find(|c| c.kind() == "label") {
        end = label.start_byte();
    }
    let title = collapse(&buffer.slice(marker.end_byte()..end).to_string());
    Some(heading_item(level, title, node))
}

/// `#figure(body, caption: [...])`; `kind:` or the body (`table(…)`, raw) names its supplement.
fn typst_figure(buffer: &Buffer, call: Node<'_>) -> Option<OutlineItem> {
    let callee = call.child_by_field_name("item")?;
    if callee.kind() != "ident" || node_text(buffer, callee) != "figure" {
        return None;
    }
    let mut walk = call.walk();
    let args = call.children(&mut walk).find(|c| c.kind() == "group")?;
    let mut caption = None;
    let mut supplement = None;
    let mut walk = args.walk();
    for arg in args.named_children(&mut walk) {
        if arg.kind() == "tagged" {
            let key = arg
                .child_by_field_name("field")
                .map(|k| node_text(buffer, k));
            let value = arg.named_child(1);
            match (key.as_deref(), value) {
                (Some("caption"), Some(value)) => caption = Some(value),
                (Some("kind"), Some(value)) => {
                    supplement = supplement_of(&node_text(buffer, value));
                }
                _ => {}
            }
        } else if supplement.is_none() {
            supplement = match arg.kind() {
                "raw_blck" | "raw_span" => Some("Listing"),
                "call" => {
                    // `table(columns: 2)[a][b]` is a call of a call
                    let mut item = arg.child_by_field_name("item");
                    while let Some(inner) = item.filter(|i| i.kind() == "call") {
                        item = inner.child_by_field_name("item");
                    }
                    item.and_then(|f| supplement_of(&node_text(buffer, f)))
                }
                _ => None,
            };
        }
    }
    let caption = caption?;
    let text = if caption.kind() == "content" {
        inside(buffer, caption)
    } else {
        node_text(buffer, caption).trim_matches('"').to_owned()
    };
    let title = format!("{}: {}", supplement.unwrap_or("Figure"), collapse(&text));
    Some(item(OutlineKind::Float, 0, title, call))
}

fn supplement_of(kind: &str) -> Option<&'static str> {
    match kind {
        "image" => Some("Figure"),
        "table" => Some("Table"),
        "raw" => Some("Listing"),
        _ => None,
    }
}

fn markdown_heading(buffer: &Buffer, node: Node<'_>) -> Option<OutlineItem> {
    let mut walk = node.walk();
    let level = node.children(&mut walk).find_map(|c| match c.kind() {
        "atx_h1_marker" | "setext_h1_underline" => Some(1),
        "atx_h2_marker" | "setext_h2_underline" => Some(2),
        "atx_h3_marker" => Some(3),
        "atx_h4_marker" => Some(4),
        "atx_h5_marker" => Some(5),
        "atx_h6_marker" => Some(6),
        _ => None,
    })?;
    let mut title = node
        .child_by_field_name("heading_content")
        .map(|c| collapse(&node_text(buffer, c)))
        .unwrap_or_default();
    // closing #s and a {#id .class} attribute block are not part of the title
    if title.ends_with('}')
        && let Some(open) = title.rfind('{')
    {
        title.truncate(open);
    }
    let trimmed = title.trim_end().trim_end_matches('#');
    if trimmed.is_empty() || trimmed.ends_with(' ') {
        title.truncate(trimmed.len());
    }
    Some(heading_item(level, title.trim().to_owned(), node))
}

fn bibtex_entry(buffer: &Buffer, entry: Node<'_>) -> Option<OutlineItem> {
    let ty = entry.child_by_field_name("ty")?;
    let key = entry.child_by_field_name("key")?;
    let mut item = item(OutlineKind::Entry, 1, node_text(buffer, key), entry);
    item.detail = node_text(buffer, ty)
        .trim_start_matches('@')
        .to_ascii_lowercase();
    Some(item)
}

fn untitled(title: String) -> String {
    if title.is_empty() {
        "(untitled)".to_owned()
    } else {
        title
    }
}

fn collapse(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The text from just after an opening `{` to its closing brace, or `None` if it stays open.
fn braced(text: &str, start: usize) -> Option<&str> {
    let bytes = text.as_bytes();
    let mut depth = 1;
    let mut i = start;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&text[start..i]);
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Commands whose argument stands for itself in a title; `ref`/`cite` ones read as `…`.
const SHOWN: [&str; 10] = [
    "textbf",
    "textit",
    "emph",
    "texttt",
    "textsc",
    "textsf",
    "textrm",
    "textup",
    "underline",
    "mbox",
];

/// A LaTeX title as the outline shows it, as 2.8's `outlineTitle` did: `\texorpdfstring{TeX}{plain}`
/// as `plain`, text styles as their text, references and citations as `…`, `~` as a space.
fn clean_title(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut rest = title;
    while let Some(at) = rest.find('\\') {
        out.push_str(&rest[..at]);
        let after = &rest[at + 1..];
        let name_len = after
            .find(|c: char| !c.is_ascii_alphabetic())
            .unwrap_or(after.len());
        let name = &after[..name_len];
        let mut tail = &after[name_len..];
        if name.is_empty() {
            // \~, \%, \\ and the like stay as written
            let next = after.chars().next().map_or(0, char::len_utf8);
            out.push('\\');
            out.push_str(&after[..next]);
            rest = &after[next..];
            continue;
        }
        let is_ref = name.ends_with("ref") || name.contains("cite");
        let known = name == "texorpdfstring" || is_ref || SHOWN.contains(&name);
        tail = tail.strip_prefix('*').unwrap_or(tail);
        // skip [optional] arguments
        let mut args = tail.trim_start();
        while let Some(opt) = args.strip_prefix('[') {
            let Some(close) = opt.find(']') else {
                break;
            };
            args = opt[close + 1..].trim_start();
        }
        let first = args.strip_prefix('{').and_then(|a| braced(a, 0));
        let Some(arg) = first.filter(|_| known) else {
            out.push('\\');
            out.push_str(name);
            rest = &after[name_len..];
            continue;
        };
        rest = &args[arg.len() + 2..];
        if name == "texorpdfstring" {
            let second = rest.trim_start();
            if let Some(plain) = second.strip_prefix('{').and_then(|s| braced(s, 0)) {
                out.push_str(&clean_title(plain));
                rest = &second[plain.len() + 2..];
            } else {
                out.push_str(&clean_title(arg));
            }
        } else if is_ref {
            out.push('…');
        } else {
            // the argument may hold more commands
            out.push_str(&clean_title(arg));
        }
    }
    out.push_str(rest);
    let mut spaced = String::with_capacity(out.len());
    let mut prev = ' ';
    for c in out.chars() {
        spaced.push(if c == '~' && prev != '\\' { ' ' } else { c });
        prev = c;
    }
    collapse(&spaced)
}

#[cfg(test)]
mod tests {
    use super::clean_title;

    #[test]
    fn titles_read_as_the_pdf_bookmarks_do() {
        assert_eq!(
            clean_title(r"\texorpdfstring{$\alpha$}{alpha} decay"),
            "alpha decay"
        );
        assert_eq!(clean_title(r"The \emph{best} way"), "The best way");
        assert_eq!(
            clean_title(r"See \cref{sec:x} and \cite[p.~2]{k}"),
            "See … and …"
        );
        assert_eq!(clean_title(r"Bib\TeX{} Files"), r"Bib\TeX{} Files");
        assert_eq!(clean_title(r"Fig.~1 \textbf{\emph{x}}"), "Fig. 1 x");
        assert_eq!(clean_title(r"50\% of \LaTeX"), r"50\% of \LaTeX");
    }
}
