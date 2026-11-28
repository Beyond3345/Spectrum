//! Markdown: front matter, fenced and indented code, inline code, HTML, maths, URLs and link
//! targets, images, citations and `{#attributes}` are blanked; link text and prose stay.

use std::sync::LazyLock;

use regex::bytes::Regex;

use super::latex::{SPECS, Spec, group_end};
use super::{
    Out, at, at_line_start, find, find_byte, line_end, math_stop, raw_stop, starts_url, url_stop,
};

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).unwrap_or_else(|_| {
        Regex::new(r"[^\s\S]").unwrap_or_else(|_| unreachable!("a constant pattern"))
    })
}

static FRONT: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?msR)\A---[ \t]*\r?\n.*?\r?\n(?:---|\.\.\.)[ \t]*$"));
static FENCE: LazyLock<Regex> = LazyLock::new(|| re(r"\A[ \t]{0,3}(`{3,}|~{3,})"));
static HEADING: LazyLock<Regex> = LazyLock::new(|| re(r"\A#{1,6}[ \t]+"));
static QUOTE: LazyLock<Regex> = LazyLock::new(|| re(r"\A[ \t]{0,3}>[ \t]?"));
static ITEM: LazyLock<Regex> = LazyLock::new(|| re(r"\A[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]+"));
static TAG: LazyLock<Regex> = LazyLock::new(|| re(r"\A</?[A-Za-z][^>]*>"));
static KEY: LazyLock<Regex> = LazyLock::new(|| re(r"(?-u)\A@\w(?:[\w:.#$%&+?<>~/-]*\w)?"));
static BRACKET_CITE: LazyLock<Regex> = LazyLock::new(|| re(r"\A\[[^\]]*@[^\]]*\]"));
static ATTRIBUTES: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?-u)\A\{(?:[#.]|[A-Za-z][\w-]*=)[^}]*\}"));
static COMMAND: LazyLock<Regex> = LazyLock::new(|| re(r"\A\\([A-Za-z]+)\*?"));

/// Index just past a link's `(…)` target, balanced for parentheses in a URL.
fn paren_stop(s: &[u8], open: usize, end: usize) -> usize {
    let mut depth = 0i32;
    let mut j = open;
    while j < end {
        match s[j] {
            b'\\' => j += 1,
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return j + 1;
                }
            }
            _ => {}
        }
        j += 1;
    }
    end
}

/// Whether the character before `i` is a letter, digit or underscore.
fn word_before(s: &[u8], i: usize) -> bool {
    let Some(start) = (0..i).rev().find(|&k| s[k] & 0xC0 != 0x80) else {
        return false;
    };
    std::str::from_utf8(&s[start..i])
        .ok()
        .and_then(|c| c.chars().next())
        .is_some_and(|c| c.is_alphanumeric() || c == '_')
}

/// What a line-start construct at `i` blanks, and where scanning goes on; None when there is none.
fn line_start(s: &[u8], i: usize) -> Option<(usize, usize)> {
    let rest = &s[i..];
    if let Some(fence) = FENCE.captures(rest) {
        let run = fence.get(1)?.as_bytes();
        let close = re(&format!(
            r"(?m)^[ \t]{{0,3}}{}{{{},}}[ \t]*$",
            regex::escape(&char::from(run[0]).to_string()),
            run.len()
        ));
        let stop = close
            .find_at(s, i + fence.get(0)?.end())
            .map_or(s.len(), |m| m.end());
        return Some((stop, stop));
    }
    if rest.len() >= 4 && rest[..4].iter().all(|&b| b == b' ' || b == b'\t') {
        let stop = line_end(s, i);
        return Some((stop, stop));
    }
    [&*HEADING, &*QUOTE, &*ITEM]
        .into_iter()
        .find_map(|r| r.find(rest))
        .map(|m| (i + m.end(), i + m.end()))
}

pub(super) fn mask(source: &str) -> String {
    let s = source.as_bytes();
    let n = s.len();
    let mut out = Out::new(source);
    let mut i = 0;
    if let Some(front) = FRONT.find(s) {
        out.blank(0, front.end());
        i = front.end();
    }
    while i < n {
        if at_line_start(s, i)
            && let Some((stop, next)) = line_start(s, i)
        {
            out.blank(i, stop);
            i = next;
            continue;
        }
        let ch = s[i];
        let rest = &s[i..];
        if ch == b'`' {
            let stop = raw_stop(s, i, n);
            out.blank(i, stop);
            i = stop;
        } else if ch == b'$' {
            let stop = math_stop(s, i, n);
            out.blank(i, stop);
            i = stop;
        } else if rest.starts_with(b"<!--") {
            let stop = find(s, b"-->", i + 4).map_or(n, |c| c + 3);
            out.blank(i, stop);
            i = stop;
        } else if let Some(tag) = (ch == b'<').then(|| TAG.find(rest)).flatten() {
            let stop = i + tag.end();
            out.blank(i, stop);
            i = stop;
        } else if let Some(alt_end) = rest
            .starts_with(b"![")
            .then(|| find_byte(s, b']', i + 2))
            .flatten()
            .filter(|&e| at(s, e + 1) == b'(')
        {
            // an image's description is its caption, which is prose as LaTeX's \caption is
            let stop = paren_stop(s, alt_end + 1, n);
            out.blank(i, i + 2);
            out.blank(alt_end, stop);
            i = stop;
        } else if let Some(key) = (ch == b'@' && !word_before(s, i))
            .then(|| KEY.find(&s[i..n.min(i + 200)]))
            .flatten()
        {
            // a citation without brackets, @key, as pandoc reads one
            out.blank(i, i + key.end());
            i += key.end();
        } else if ch == b'[' {
            i = bracket(s, i, &mut out);
        } else if let Some(attr) = (ch == b'{').then(|| ATTRIBUTES.find(rest)).flatten() {
            out.blank(i, i + attr.end());
            i += attr.end();
        } else if ch == b'h' && starts_url(s, i) {
            let j = url_stop(s, i, n);
            out.blank(i, j);
            i = j;
        } else if ch == b'\\' {
            // raw LaTeX: the command's name, and the keys after \ref, \cite and the like
            if let Some(command) = COMMAND.captures(&s[i..n.min(i + 64)]) {
                let name = command
                    .get(1)
                    .map(|m| std::str::from_utf8(m.as_bytes()).unwrap_or_default())
                    .unwrap_or_default();
                let mut stop = i + command.get(0).map_or(1, |m| m.end());
                if matches!(SPECS.get(name), Some(Spec::Keys)) {
                    while matches!(at(s, stop), b'{' | b'[') {
                        let Some(end) = group_end(s, stop) else { break };
                        stop = end;
                    }
                }
                out.blank(i, stop);
                i = stop;
            } else {
                out.blank(i, i + 1);
                i += if at(s, i + 1) == b'\n' { 1 } else { 2 };
            }
        } else {
            i += 1;
        }
    }
    out.finish()
}

/// A `[`: a bracketed citation, a link's or a reference link's text (kept), or just a bracket.
fn bracket(s: &[u8], i: usize, out: &mut Out) -> usize {
    let n = s.len();
    if let Some(cite) = BRACKET_CITE.find(&s[i..]) {
        out.blank(i, i + cite.end());
        return i + cite.end();
    }
    let Some(text_end) = find_byte(s, b']', i + 1) else {
        return i + 1;
    };
    match at(s, text_end + 1) {
        b'(' => {
            let stop = paren_stop(s, text_end + 1, n);
            out.blank(i, i + 1);
            out.blank(text_end, stop);
            stop
        }
        b'[' => {
            out.blank(i, i + 1);
            if let Some(ref_end) = find_byte(s, b']', text_end + 2) {
                out.blank(text_end, ref_end + 1);
                ref_end + 1
            } else {
                text_end + 1
            }
        }
        _ => i + 1,
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::{same_shape, words};
    use super::mask;

    #[test]
    fn keeps_prose_and_link_text_and_drops_front_matter_code_maths_urls_and_citations() {
        let fence = "```";
        let source = [
            "---",
            "title: Secret",
            "---",
            "# A Heading",
            "Some prose with [a link](https://example.com) and `code_word`.",
            "$$",
            "x + y",
            "$$",
            "![alt text](image.png){#fig:x}",
            "<!-- hidden comment -->",
            "    indented code",
            "[@citation]",
            "- a list item",
            "",
            &format!("{fence}fenced code\n= not a heading\n{fence}"),
            "An escape \\* and a plain_word.",
            "",
        ]
        .join("\n");
        let masked = mask(&source);
        same_shape(&source, &masked);
        let kept = words(&masked);
        for word in [
            "Heading", "prose", "link", "list", "item", "escape", "plain", "word", "alt",
        ] {
            assert!(kept.contains(&word), "{word} survives");
        }
        for word in [
            "Secret",
            "code_word",
            "image",
            "hidden",
            "comment",
            "indented",
            "citation",
            "fenced",
            "heading",
            "example",
        ] {
            assert!(!kept.contains(&word), "{word} is masked");
        }
    }

    #[test]
    fn raw_latex_keys_bare_cites_and_attributes_are_masked_and_captions_kept() {
        let source = "See Table \\ref{tbl:use} and \\eqref{eq:flow}, as @smith2020 found, mail a@b.org.\n![Meter locatoins](figures/m.png){width=50%} \\emph{Kept} text {.unnumbered}\n";
        let masked = mask(source);
        assert_eq!(masked.len(), source.len());
        assert_eq!(
            words(&masked),
            [
                "See",
                "Table",
                "and",
                "as",
                "found",
                "mail",
                "a",
                "b",
                "org",
                "Meter",
                "locatoins",
                "Kept",
                "text"
            ]
        );
    }
}
