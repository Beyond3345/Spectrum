//! Typst: comments, raw text and blocks, maths, calls and their arguments (but not the content in
//! `[…]`), labels, references and URLs are blanked. Headings keep their text, without `=`.

use super::{
    Out, at, at_line_start, find, find_byte, line_end, math_stop, raw_stop, starts_url, url_stop,
};

fn is_name(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-')
}

fn is_label(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'_' | b':' | b'.' | b'-')
}

/// Index just past the string starting at `i`, or the end of the range.
fn string_stop(s: &[u8], i: usize, end: usize) -> usize {
    let mut j = i + 1;
    while j < end && s[j] != b'"' {
        j += if s[j] == b'\\' { 2 } else { 1 };
    }
    end.min(j + 1)
}

/// Index of the closer of the balanced group at `i`, skipping escapes, strings, raw and content blocks.
fn group_close(s: &[u8], i: usize, open: u8, close: u8, end: usize) -> Option<usize> {
    let mut depth = 0i32;
    let mut j = i;
    while j < end {
        let ch = s[j];
        if ch == b'\\' {
            j += 2;
            continue;
        }
        if open == b'(' && ch == b'"' {
            j = string_stop(s, j, end);
            continue;
        }
        if open == b'(' && ch == b'`' {
            j = raw_stop(s, j, end);
            continue;
        }
        if ch == open {
            depth += 1;
        } else if ch == close {
            depth -= 1;
            if depth == 0 {
                return Some(j);
            }
        } else if open == b'(' && ch == b'[' {
            j = group_close(s, j, b'[', b']', end)?;
        }
        j += 1;
    }
    None
}

struct Typst<'a> {
    s: &'a [u8],
    out: Out,
}

impl Typst<'_> {
    /// Blanks a call's `(…)` group but keeps content blocks in it, masking their prose in turn.
    fn mask_args(&mut self, open: usize, to: usize) -> usize {
        let s = self.s;
        let close = group_close(s, open, b'(', b')', to);
        let stop = close.map_or(to, |c| to.min(c + 1));
        let mut j = open + 1;
        while j < stop {
            match s[j] {
                b'"' => {
                    let next = stop.min(string_stop(s, j, stop));
                    self.out.blank(j, next);
                    j = next;
                    continue;
                }
                b'`' => {
                    let next = stop.min(raw_stop(s, j, stop));
                    self.out.blank(j, next);
                    j = next;
                    continue;
                }
                b'[' => {
                    if let Some(inner) =
                        group_close(s, j, b'[', b']', stop).filter(|&inner| inner > j)
                    {
                        self.out.blank(j, j + 1);
                        self.mask_content(j + 1, inner);
                        self.out.blank(inner, inner + 1);
                        j = inner + 1;
                        continue;
                    }
                }
                b'#' => {
                    j = self.mask_call(j, stop);
                    continue;
                }
                _ => {}
            }
            self.out.blank(j, j + 1);
            j += 1;
        }
        self.out.blank(open, open + 1);
        if let Some(close) = close {
            self.out.blank(close, close + 1);
        }
        stop
    }

    fn spaces(&self, mut k: usize, to: usize) -> usize {
        while k < to && matches!(self.s[k], b' ' | b'\t') {
            k += 1;
        }
        k
    }

    /// Blanks `#name` and its arguments; the content blocks after or inside it stay prose.
    fn mask_call(&mut self, i: usize, to: usize) -> usize {
        let s = self.s;
        let mut j = i + 1;
        while j < to && is_name(s[j]) {
            j += 1;
        }
        self.out.blank(i, j);
        let mut k = self.spaces(j, to);
        let mut handled = false;
        if at(s, k) == b'(' {
            handled = true;
            k = self.mask_args(k, to);
        }
        // a chained field or method, as in #datetime.today().display(…)
        while at(s, k) == b'.' {
            let mut next = k + 1;
            while next < to && (s[next].is_ascii_alphanumeric() || matches!(s[next], b'_' | b'-')) {
                next += 1;
            }
            if next == k + 1 {
                break;
            }
            self.out.blank(k, next);
            k = self.spaces(next, to);
            if at(s, k) == b'(' {
                handled = true;
                k = self.mask_args(k, to);
            }
        }
        loop {
            k = self.spaces(k, to);
            if at(s, k) != b'[' {
                break;
            }
            let Some(inner) = group_close(s, k, b'[', b']', to) else {
                break;
            };
            handled = true;
            self.out.blank(k, k + 1);
            self.mask_content(k + 1, inner);
            self.out.blank(inner, inner + 1);
            k = inner + 1;
        }
        if !handled {
            let stop = to.min(line_end(s, j));
            self.out.blank(j, stop);
            return stop;
        }
        k
    }

    fn mask_content(&mut self, from: usize, to: usize) {
        let s = self.s;
        let mut i = from;
        while i < to {
            let ch = s[i];
            if s[i..].starts_with(b"//") {
                let stop = to.min(line_end(s, i));
                self.out.blank(i, stop);
                i = stop;
            } else if s[i..].starts_with(b"/*") {
                let stop = find(s, b"*/", i + 2).map_or(to, |c| to.min(c + 2));
                self.out.blank(i, stop);
                i = stop;
            } else if ch == b'`' {
                let stop = to.min(raw_stop(s, i, to));
                self.out.blank(i, stop);
                i = stop;
            } else if ch == b'$' {
                let stop = math_stop(s, i, to);
                self.out.blank(i, stop);
                i = stop;
            } else if let Some(close) = (ch == b'<')
                .then(|| find_byte(s, b'>', i))
                .flatten()
                .filter(|&c| c > i + 1 && c < to && s[i + 1..c].iter().all(|&b| is_label(b)))
            {
                self.out.blank(i, close + 1);
                i = close + 1;
            } else if ch == b'@'
                && (i == from || !s[i - 1].is_ascii_alphanumeric())
                && is_label(at(s, i + 1))
                && i + 1 < to
            {
                let mut j = i + 1;
                while j < to && is_label(s[j]) {
                    j += 1;
                }
                self.out.blank(i, j);
                i = j;
            } else if ch == b'h' && starts_url(s, i) {
                let j = url_stop(s, i, to);
                self.out.blank(i, j);
                i = j;
            } else if ch == b'=' && at_line_start(s, i) {
                let mut j = i;
                while j < to && s[j] == b'=' {
                    j += 1;
                }
                self.out.blank(i, j);
                i = j;
            } else if ch == b'#' {
                i = self.mask_call(i, to);
            } else if ch == b'\\' {
                self.out.blank(i, i + 1);
                i += if at(s, i + 1) == b'\n' { 1 } else { 2 };
            } else {
                i += 1;
            }
        }
    }
}

pub(super) fn mask(source: &str) -> String {
    let mut m = Typst {
        s: source.as_bytes(),
        out: Out::new(source),
    };
    m.mask_content(0, source.len());
    m.out.finish()
}

#[cfg(test)]
mod tests {
    use super::super::tests::{same_shape, words};
    use super::mask;

    #[test]
    fn keeps_prose_captions_and_headings_and_drops_markup() {
        let fence = "```";
        let source = [
            "= A Heading",
            "// hidden comment",
            "#let secret = \"hidden\"",
            "This is prose with @cite and <label>.",
            "#figure(image(\"fig.png\"), caption: [A caption with café.])",
            "$ x + y $",
            "/* block comment */",
            &format!("{fence}raw words{fence}"),
            "A \\# hashtag and https://example.com",
            "Text with #emph[emphasis] and #text(fill: red)[coloured words].",
            "#datetime.today().display(\"[day] [month repr:long] [year]\")",
            "",
        ]
        .join("\n");
        let masked = mask(&source);
        same_shape(&source, &masked);
        let kept = words(&masked);
        for word in [
            "Heading", "prose", "caption", "café", "hashtag", "emphasis", "coloured", "words",
        ] {
            assert!(kept.contains(&word), "{word} survives");
        }
        for word in [
            "comment", "secret", "hidden", "fig", "label", "cite", "raw", "example", "display",
            "month", "repr",
        ] {
            assert!(!kept.contains(&word), "{word} is masked");
        }
    }
}
