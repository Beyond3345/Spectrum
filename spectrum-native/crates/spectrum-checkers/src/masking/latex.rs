//! LaTeX: the preamble, commands, keys, maths, comments and verbatim environments are blanked;
//! prose arguments (`\section{…}`, `\emph{…}`, `\caption{…}`) and inline maths as one `x` stay.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::bytes::Regex;

use super::{Out, at, char_len, find, find_byte};

/// One argument: its opening bracket and whether it is prose to keep.
#[derive(Clone, Copy)]
pub(super) struct Arg {
    open: u8,
    prose: bool,
}

/// How a command's arguments are read: listed, or `Keys`, which blanks every group that follows.
#[derive(Clone)]
pub(super) enum Spec {
    Args(Vec<Arg>),
    Keys,
}

fn spec(s: &str) -> Spec {
    if s == "K" {
        return Spec::Keys;
    }
    let b = s.as_bytes();
    Spec::Args(
        b.chunks(3)
            .map(|c| Arg {
                open: c[0],
                prose: c[1] == b'p',
            })
            .collect(),
    )
}

pub(super) static SPECS: LazyLock<HashMap<&'static str, Spec>> = LazyLock::new(|| {
    [
        ("[p]{p}", "part chapter section subsection subsubsection paragraph subparagraph caption"),
        ("[k]{p}", "footnote footnotetext marginpar hyperref"),
        ("{p}", "emph textbf textit textsl textsc textup textmd textrm textsf textnormal underline uline mbox text enquote intertext title subtitle thanks"),
        ("{k}{p}", "href scalebox"),
        ("[k]{k}{p}", "textcolor colorbox"),
        ("[k]{k}[k]{k}{p}", "fcolorbox"),
        ("{k}{k}{p}", "multicolumn multirow resizebox"),
        ("[k][k]{p}", "makebox framebox"),
        ("{k}[k][k]{p}", "raisebox"),
        ("[k][k][k]{k}{p}", "parbox"),
        ("[p]", "item"),
        ("K", "cite citep citet citealp citealt citeauthor citeyear citeyearpar autocite autocites parencite textcite footcite fullcite nocite ref eqref pageref autoref cref Cref crefrange nameref vref label url nolinkurl path input include includeonly includegraphics usepackage RequirePackage documentclass bibliography bibliographystyle addbibresource printbibliography newcommand renewcommand providecommand DeclareMathOperator newenvironment renewenvironment newtheorem def let setlength addtolength setcounter addtocounter stepcounter vspace hspace vskip hskip definecolor color pagestyle thispagestyle numberwithin geometry hypersetup graphicspath lstset captionsetup lstinputlisting inputminted bibitem texttt author date affiliation address email orcid keywords"),
    ]
    .into_iter()
    .flat_map(|(s, names)| names.split(' ').map(move |name| (name, spec(s))))
    .collect()
});

static SKIP_ENVS: LazyLock<HashSet<String>> = LazyLock::new(|| {
    "equation align alignat gather multline flalign eqnarray math displaymath verbatim Verbatim lstlisting minted comment tikzpicture filecontents algorithmic algorithmic* lstinline"
        .split(' ')
        .flat_map(|env| [env.to_owned(), format!("{env}*")])
        .collect()
});

static ENV_SPECS: LazyLock<HashMap<&'static str, Spec>> = LazyLock::new(|| {
    [
        ("tabular", "{k}"),
        ("tabular*", "{k}{k}"),
        ("tabularx", "{k}{k}"),
        ("longtable", "[k]{k}"),
        ("array", "[k]{k}"),
        ("minipage", "[k][k][k]{k}"),
        ("multicols", "{k}"),
        ("thebibliography", "{k}"),
        ("wrapfigure", "[k]{k}[k]{k}"),
        ("subfigure", "[k]{k}"),
    ]
    .into_iter()
    .map(|(env, s)| (env, spec(s)))
    .collect()
});

/// Words a few commands print, written into the same space.
fn prints(name: &[u8]) -> Option<&'static [u8]> {
    Some(match name {
        b"LaTeX" => b"LaTeX",
        b"TeX" => b"TeX",
        b"ldots" | b"dots" | b"textellipsis" => b"...",
        _ => return None,
    })
}

static BEGIN_DOCUMENT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\begin\s*\{document\}").unwrap_or_else(|_| never()));
static END_DOCUMENT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\end\s*\{document\}").unwrap_or_else(|_| never()));

fn never() -> Regex {
    Regex::new(r"[^\s\S]").unwrap_or_else(|_| unreachable!("a constant pattern"))
}

fn is_escaped(s: &[u8], i: usize) -> bool {
    s[..i].iter().rev().take_while(|&&b| b == b'\\').count() % 2 == 1
}

fn is_letter(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'@'
}

/// Index just past the `{…}` or `[…]` group opening at `i` (braces nest; escaped ones don't count).
pub(super) fn group_end(s: &[u8], i: usize) -> Option<usize> {
    let bracket = at(s, i) == b'[';
    let mut braces = 0i32;
    let mut j = i;
    while j < s.len() {
        match s[j] {
            b'\\' => j += 1,
            b'%' => {
                while j < s.len() && s[j] != b'\n' {
                    j += 1;
                }
            }
            b'{' => braces += 1,
            b'}' => {
                braces -= 1;
                if !bracket && braces == 0 {
                    return Some(j + 1);
                }
                if braces < 0 {
                    return None;
                }
            }
            b']' if bracket && braces == 0 => return Some(j + 1),
            _ => {}
        }
        j += 1;
    }
    None
}

struct Latex<'a> {
    s: &'a [u8],
    out: Out,
}

impl Latex<'_> {
    fn skip_spaces(&self, mut i: usize) -> usize {
        while matches!(at(self.s, i), b' ' | b'\t' | b'\n') {
            i += 1;
        }
        i
    }

    fn skip_inline(&self, mut i: usize) -> usize {
        while matches!(at(self.s, i), b' ' | b'\t') {
            i += 1;
        }
        i
    }

    /// Maths the reader still needs a word for: one `x` in place of the formula.
    fn inline_math(&mut self, from: usize, to: usize, open: usize, close: usize) {
        self.out.blank(from, to);
        if from + open + close < to {
            self.out.0[from + open] = b'x';
        }
    }

    /// Applies an argument spec after a command or `\begin`; returns where scanning carries on.
    fn args(&mut self, mut pos: usize, spec: &Spec) -> usize {
        let s = self.s;
        let Spec::Args(list) = spec else {
            // on the command's own line: {\Large Title} on the next one is text, not an argument
            let mut k = self.skip_inline(pos);
            while matches!(at(s, k), b'{' | b'[' | b'*') {
                let end = if s[k] == b'*' {
                    Some(k + 1)
                } else {
                    group_end(s, k)
                };
                let Some(end) = end else { break };
                self.out.blank(k, end);
                pos = end;
                k = self.skip_inline(pos);
            }
            return pos;
        };
        for arg in list {
            let k = self.skip_spaces(pos);
            if at(s, k) != arg.open {
                if arg.open == b'[' {
                    continue;
                }
                break;
            }
            let Some(end) = group_end(s, k) else { break };
            if arg.prose {
                // only the delimiters go; the main scan then reads the prose inside
                self.out.blank(k, k + 1);
                if arg.open == b'[' {
                    self.out.blank(end - 1, end);
                }
                return k + 1;
            }
            self.out.blank(k, end);
            pos = end;
        }
        pos
    }

    /// Unknown commands: adjacent `[..]` groups are options; a `{..}` with a space in it is prose,
    /// one without is a key.
    fn unknown_args(&mut self, mut pos: usize) -> usize {
        let s = self.s;
        while matches!(at(s, pos), b'[' | b'{') {
            let Some(end) = group_end(s, pos) else {
                return pos;
            };
            if s[pos] == b'{' && s[pos + 1..end - 1].iter().any(u8::is_ascii_whitespace) {
                self.out.blank(pos, pos + 1);
                return pos + 1;
            }
            self.out.blank(pos, end);
            pos = end;
        }
        pos
    }

    fn command(&mut self, i: usize) -> usize {
        let s = self.s;
        let Some(&next) = s.get(i + 1) else {
            return i + 1;
        };
        // \( \) and \[ \] maths
        if next == b'(' || next == b'[' {
            let close: &[u8] = if next == b'(' { b"\\)" } else { b"\\]" };
            let end = find(s, close, i + 2).map_or(s.len(), |e| e + 2);
            if next == b'(' {
                self.inline_math(i, end, 2, 2);
            } else {
                self.out.blank(i, end);
            }
            return end;
        }
        if !is_letter(next) {
            // \\ (with its optional [length]), \%, \&, \,, accents and the like
            let mut end = i + 1 + char_len(next);
            if next == b'\\' {
                if at(s, end) == b'*' {
                    end += 1;
                }
                if at(s, end) == b'[' {
                    end = end.max(group_end(s, end).unwrap_or(0));
                }
            }
            if next == b' ' {
                end = i + 1;
            }
            self.out.blank(i, end);
            return end;
        }
        let mut j = i + 1;
        while j < s.len() && is_letter(s[j]) {
            j += 1;
        }
        let name = &s[i + 1..j];
        if at(s, j) == b'*' {
            j += 1;
        }
        if let Some(word) = prints(name) {
            self.out.blank(i, j);
            for (k, &b) in word.iter().enumerate().take(j - i) {
                self.out.0[i + k] = b;
            }
            return j;
        }
        if name == b"verb" {
            let delim = at(s, j);
            let stop = if delim.is_ascii() && delim != 0 {
                find_byte(s, delim, j + 1).map_or(j, |e| e + 1)
            } else {
                j
            };
            self.out.blank(i, stop);
            return stop;
        }
        let name = std::str::from_utf8(name).unwrap_or_default();
        if name == "begin" || name == "end" {
            let k = self.skip_spaces(j);
            let end = if at(s, k) == b'{' {
                group_end(s, k)
            } else {
                None
            };
            let Some(end) = end else {
                self.out.blank(i, j);
                return j;
            };
            let env = String::from_utf8_lossy(&s[k + 1..end - 1])
                .trim()
                .to_owned();
            self.out.blank(i, end);
            if name == "end" {
                return end;
            }
            if SKIP_ENVS.contains(&env) {
                let close = format!("\\end{{{env}}}");
                let stop = find(s, close.as_bytes(), end).map_or(s.len(), |c| c + close.len());
                self.out.blank(end, stop);
                return stop;
            }
            return match ENV_SPECS.get(env.as_str()) {
                Some(spec) => self.args(end, spec),
                None => self.unknown_args(end),
            };
        }
        self.out.blank(i, j);
        match SPECS.get(name) {
            Some(spec) => self.args(j, spec),
            None => self.unknown_args(j),
        }
    }
}

pub(super) fn mask(source: &str) -> String {
    let s = source.as_bytes();
    let mut m = Latex {
        s,
        out: Out::new(source),
    };

    // the preamble and anything after \end{document} are settings, not prose
    let mut i = 0;
    if let Some(begin) = BEGIN_DOCUMENT.find(s) {
        m.out.blank(0, begin.end());
        i = begin.end();
    }
    let mut last = s.len();
    if let Some(finish) = END_DOCUMENT.find(s)
        && finish.start() >= i
    {
        last = finish.start();
        m.out.blank(finish.start(), s.len());
    }

    while i < last {
        match s[i] {
            b'%' if !is_escaped(s, i) => {
                let stop = find_byte(s, b'\n', i).unwrap_or(s.len());
                m.out.blank(i, stop);
                i = stop;
            }
            b'\\' => i = m.command(i),
            b'$' if !is_escaped(s, i) => {
                let delim: &[u8] = if at(s, i + 1) == b'$' { b"$$" } else { b"$" };
                let mut end = i + delim.len();
                while end < s.len() && (!s[end..].starts_with(delim) || is_escaped(s, end)) {
                    end += 1;
                }
                end = s.len().min(end + delim.len());
                if delim.len() == 2 {
                    m.out.blank(i, end);
                } else {
                    m.inline_math(i, end, 1, 1);
                }
                i = end;
            }
            b'{' | b'}' | b'&' | b'~' => {
                m.out.blank(i, i + 1);
                i += 1;
            }
            b'`' if at(s, i + 1) == b'`' => {
                m.out.blank(i, i + 2);
                i += 2;
            }
            b'\'' if at(s, i + 1) == b'\'' => {
                m.out.blank(i, i + 2);
                i += 2;
            }
            _ => i += 1,
        }
    }

    // A line that was all markup (\label{..}, a comment) would read as a paragraph break and split
    // the sentence around it, so it joins the next line instead. Blank source lines still break.
    let mut start = 0;
    for k in 0..s.len() {
        if s[k] == b'\n' {
            let had_text = !source[start..k].trim().is_empty();
            if had_text && m.out.0[start..k].iter().all(u8::is_ascii_whitespace) {
                m.out.0[k] = b' ';
            }
            start = k + 1;
        }
    }
    m.out.finish()
}

#[cfg(test)]
mod tests {
    use super::super::tests::words;
    use super::mask;

    fn latex_words(tex: &str) -> Vec<String> {
        words(&mask(tex)).into_iter().map(str::to_owned).collect()
    }

    #[test]
    fn keeps_every_position() {
        let tex = "\\documentclass{article}\n\\begin{document}\nA $x^2$ test, café 研究.\n\\end{document}\n";
        let masked = mask(tex);
        assert_eq!(masked.len(), tex.len());
        assert!(
            masked
                .char_indices()
                .all(|(i, c)| c != '\n' || tex.as_bytes()[i] == b'\n'),
            "no newline moves"
        );
        assert_eq!(&masked[tex.find("café").unwrap()..][..5], "café");
    }

    #[test]
    fn keeps_prose_and_drops_markup() {
        let tex = [
            "\\documentclass{article}\\usepackage{amsmath}",
            "\\begin{document}",
            "\\section[Short]{Results of the \\emph{first} trial}\\label{sec:results}",
            "As shown by \\citet[p.~4]{smith2020} and in Figure~\\ref{fig:one}, the \\textbf{colour} changes.%  a comment here",
            "We measured $\\alpha + \\beta$ and",
            "\\begin{equation}\\label{eq:x} E = mc^2 \\end{equation}",
            "then \\[ y = mx \\] holds \\(z\\) times.\\footnote{See the \\href{https://example.org}{project page}.}",
            "\\begin{figure}[htbp]\\includegraphics[width=0.5\\textwidth]{figs/plot}\\caption{A {nested} caption}\\end{figure}",
            "\\begin{tabular}{lll} one & two \\\\ \\end{tabular}",
            "\\begin{verbatim}code_here = 1\\end{verbatim}",
            "\\verb|x_y| and ``quoted'' words, \\LaTeX\\ too.",
            "\\end{document}",
            "trailing",
        ]
        .join("\n");
        assert_eq!(
            latex_words(&tex),
            [
                "Short", "Results", "of", "the", "first", "trial", "As", "shown", "by", "and",
                "in", "Figure", "the", "colour", "changes", "We", "measured", "x", "and", "then",
                "holds", "x", "times", "See", "the", "project", "page", "A", "nested", "caption",
                "one", "two", "and", "quoted", "words", "LaTeX", "too"
            ]
        );
    }

    #[test]
    fn a_line_of_markup_joins_its_neighbours() {
        let masked = mask("The sentence goes\n\\label{x}\non here.\n\nNext paragraph.");
        assert_eq!(
            masked.split('\n').count(),
            4,
            "one line joined, the blank line kept"
        );
        assert!(
            masked.starts_with("The sentence goes\n") && masked.contains("on here.\n\nNext"),
            "{masked:?}"
        );
    }

    #[test]
    fn unknown_commands_drop_keys_and_keep_prose() {
        let tex = "\\begin{document}\\mymacro{key-thing} and \\myemph{some words}\\end{document}";
        assert_eq!(latex_words(tex), ["and", "some", "words"]);
    }

    #[test]
    fn a_group_on_the_line_after_vspace_is_text() {
        let tex = "\\vspace*{30mm}\n{\\LARGE\\bfseries Field notes\\par}\n\\cite{a}{b} after";
        assert_eq!(mask(tex).len(), tex.len());
        assert_eq!(latex_words(tex), ["Field", "notes", "after"]);
    }

    #[test]
    fn an_accent_before_a_multibyte_letter_keeps_utf8() {
        let tex = "na\\ïve \\é and \\\\ done";
        let masked = mask(tex);
        assert_eq!(masked.len(), tex.len());
        assert_eq!(latex_words(tex), ["na", "ve", "and", "done"]);
    }
}
