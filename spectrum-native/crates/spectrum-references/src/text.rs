//! Text helpers shared by every part of the crate: TeX to plain text (2.8's pylatexenc `latexToText`), TeX
//! escaping for titles (`texEscape`, `plainTex`), ASCII folding and title normalising, HTML entities.

use std::sync::LazyLock;

use regex::Regex;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

pub(crate) fn re(pattern: &str) -> Regex {
    // ponytail: patterns are literals checked by the tests; a bad one panics at first use in a test
    #[allow(clippy::expect_used)]
    Regex::new(pattern).expect("a valid pattern")
}

pub(crate) fn fre(pattern: &str) -> fancy_regex::Regex {
    #[allow(clippy::expect_used)]
    fancy_regex::Regex::new(pattern).expect("a valid pattern")
}

/// fancy-regex's `replace_all` with a closure, which can fail on backtracking limits: the text unchanged then.
pub(crate) fn freplace(
    re: &fancy_regex::Regex,
    text: &str,
    mut f: impl FnMut(&fancy_regex::Captures<'_, str>) -> String,
) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for caps in re.captures_iter(text) {
        let Ok(caps) = caps else {
            return text.to_owned();
        };
        let Some(m) = caps.get(0) else { continue };
        out.push_str(&text[last..m.start()]);
        out.push_str(&f(&caps));
        last = m.end();
    }
    out.push_str(&text[last..]);
    out
}

/// The first match of a fancy pattern, its groups as owned strings ("" for one that didn't take part).
pub(crate) fn fcaps(re: &fancy_regex::Regex, text: &str) -> Option<Vec<String>> {
    let caps = re.captures(text).ok().flatten()?;
    Some(
        (0..caps.len())
            .map(|i| caps.get(i).map_or(String::new(), |m| m.as_str().to_owned()))
            .collect(),
    )
}

/// Plain text for a TeX argument, keeping every character literal.
pub fn escape_tex_text(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '\\' => out.push_str("\\textbackslash{}"),
            '^' => out.push_str("\\textasciicircum{}"),
            '~' => out.push_str("\\textasciitilde{}"),
            '{' | '}' | '$' | '&' | '%' | '#' | '_' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}

/// TeX comments outside escaped characters gone; line endings kept.
pub fn without_comments(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                out.push(c);
                if let Some(n) = chars.next() {
                    out.push(n);
                }
            }
            '%' => {
                while let Some(&n) = chars.peek() {
                    if n == '\n' || n == '\r' {
                        break;
                    }
                    chars.next();
                }
            }
            _ => out.push(c),
        }
    }
    out
}

/// The byte index of the `}` closing the `{` at `start`, skipping escaped characters; `None` when it never closes.
pub fn match_brace(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut depth = 0i32;
    let mut i = start;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

const FOLD: &[(char, &str)] = &[
    ('ß', "ss"),
    ('æ', "ae"),
    ('Æ', "Ae"),
    ('œ', "oe"),
    ('Œ', "Oe"),
    ('ø', "o"),
    ('Ø', "O"),
    ('ł', "l"),
    ('Ł', "L"),
    ('đ', "d"),
    ('Đ', "D"),
    ('þ', "th"),
    ('Þ', "Th"),
    ('ı', "i"),
];

/// Letters without their accents, and the letters NFD can't split written out (ß → ss, Ø → O).
pub fn fold_ascii(s: &str) -> String {
    let mut folded = String::with_capacity(s.len());
    for c in s.chars() {
        match FOLD.iter().find(|(f, _)| *f == c) {
            Some((_, to)) => folded.push_str(to),
            None => folded.push(c),
        }
    }
    folded.nfd().filter(|c| !is_combining_mark(*c)).collect()
}

/// A title as titles are compared: TeX read, accents folded, lower case, only letters and digits.
pub fn normalise_title(s: &str) -> String {
    let text = fold_ascii(&latex_to_text(s)).to_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut gap = false;
    for c in text.chars() {
        if c.is_alphanumeric() {
            if gap && !out.is_empty() {
                out.push(' ');
            }
            gap = false;
            out.push(c);
        } else {
            gap = true;
        }
    }
    out
}

/// Whitespace runs as one space, ends trimmed.
pub(crate) fn squash(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

static TAG: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)</?[a-z][^>]*>"));

/// Provider strings may carry HTML or `MathML` tags and entities: the text alone, on one line.
pub fn clean_text(s: &str) -> String {
    squash(&decode_entities(&TAG.replace_all(s, "")))
}

// Latin-1's named entities, from U+00A0, then the others publishers' pages use
const LATIN1: [&str; 96] = [
    "nbsp", "iexcl", "cent", "pound", "curren", "yen", "brvbar", "sect", "uml", "copy", "ordf",
    "laquo", "not", "shy", "reg", "macr", "deg", "plusmn", "sup2", "sup3", "acute", "micro",
    "para", "middot", "cedil", "sup1", "ordm", "raquo", "frac14", "frac12", "frac34", "iquest",
    "Agrave", "Aacute", "Acirc", "Atilde", "Auml", "Aring", "AElig", "Ccedil", "Egrave", "Eacute",
    "Ecirc", "Euml", "Igrave", "Iacute", "Icirc", "Iuml", "ETH", "Ntilde", "Ograve", "Oacute",
    "Ocirc", "Otilde", "Ouml", "times", "Oslash", "Ugrave", "Uacute", "Ucirc", "Uuml", "Yacute",
    "THORN", "szlig", "agrave", "aacute", "acirc", "atilde", "auml", "aring", "aelig", "ccedil",
    "egrave", "eacute", "ecirc", "euml", "igrave", "iacute", "icirc", "iuml", "eth", "ntilde",
    "ograve", "oacute", "ocirc", "otilde", "ouml", "divide", "oslash", "ugrave", "uacute", "ucirc",
    "uuml", "yacute", "thorn", "yuml",
];
const NAMED: &[(&str, &str)] = &[
    ("amp", "&"),
    ("lt", "<"),
    ("gt", ">"),
    ("quot", "\""),
    ("apos", "'"),
    ("ndash", "–"),
    ("mdash", "—"),
    ("lsquo", "‘"),
    ("rsquo", "’"),
    ("ldquo", "“"),
    ("rdquo", "”"),
    ("sbquo", "‚"),
    ("bdquo", "„"),
    ("hellip", "…"),
    ("trade", "™"),
    ("bull", "•"),
    ("prime", "′"),
    ("Prime", "″"),
    ("minus", "−"),
    ("thinsp", "\u{2009}"),
    ("ensp", "\u{2002}"),
    ("emsp", "\u{2003}"),
    ("zwj", "\u{200d}"),
    ("zwnj", "\u{200c}"),
    ("OElig", "Œ"),
    ("oelig", "œ"),
    ("Scaron", "Š"),
    ("scaron", "š"),
    ("Yuml", "Ÿ"),
    ("euro", "€"),
    ("dagger", "†"),
    ("Dagger", "‡"),
    ("permil", "‰"),
    ("lsaquo", "‹"),
    ("rsaquo", "›"),
];

fn entity(name: &str) -> Option<String> {
    if let Some(num) = name.strip_prefix('#') {
        let code = match num.strip_prefix(['x', 'X']) {
            Some(hex) => u32::from_str_radix(hex, 16).ok()?,
            None => num.parse().ok()?,
        };
        return Some(char::from_u32(code).unwrap_or('\u{fffd}').to_string());
    }
    if let Some(i) = LATIN1.iter().position(|n| *n == name) {
        return char::from_u32(0xa0 + u32::try_from(i).ok()?).map(String::from);
    }
    if let Some((_, v)) = NAMED.iter().find(|(n, _)| *n == name) {
        return Some((*v).to_owned());
    }
    greek_entity(name)
}

fn greek_entity(name: &str) -> Option<String> {
    GREEK
        .iter()
        .find(|(_, tex)| tex.trim_start_matches('\\') == name)
        .map(|(c, _)| c.to_string())
}

/// HTML entities decoded (`&amp;`, `&#8211;`, `&uuml;`); an unknown one stays as written.
pub fn decode_entities(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        let tail = &rest[at + 1..];
        let end = tail
            .char_indices()
            .take(32)
            .find(|(_, c)| !(c.is_ascii_alphanumeric() || *c == '#'))
            .map(|(i, _)| i);
        if let Some((e, v)) = end.and_then(|e| entity(&tail[..e]).map(|v| (e, v))) {
            out.push_str(&v);
            rest = &tail[e + usize::from(tail[e..].starts_with(';'))..];
        } else {
            out.push('&');
            rest = tail;
        }
    }
    out.push_str(rest);
    out
}

/// Greek letters and their TeX names, for TeX → text and pdfLaTeX's `\ensuremath{…}`.
pub(crate) const GREEK: &[(char, &str)] = &[
    ('α', "\\alpha"),
    ('β', "\\beta"),
    ('γ', "\\gamma"),
    ('δ', "\\delta"),
    ('ε', "\\epsilon"),
    ('ζ', "\\zeta"),
    ('η', "\\eta"),
    ('θ', "\\theta"),
    ('ι', "\\iota"),
    ('κ', "\\kappa"),
    ('λ', "\\lambda"),
    ('μ', "\\mu"),
    ('ν', "\\nu"),
    ('ξ', "\\xi"),
    ('ο', "o"),
    ('π', "\\pi"),
    ('ρ', "\\rho"),
    ('ς', "\\varsigma"),
    ('σ', "\\sigma"),
    ('τ', "\\tau"),
    ('υ', "\\upsilon"),
    ('φ', "\\phi"),
    ('χ', "\\chi"),
    ('ψ', "\\psi"),
    ('ω', "\\omega"),
    ('Γ', "\\Gamma"),
    ('Δ', "\\Delta"),
    ('Θ', "\\Theta"),
    ('Λ', "\\Lambda"),
    ('Ξ', "\\Xi"),
    ('Π', "\\Pi"),
    ('Σ', "\\Sigma"),
    ('Υ', "\\Upsilon"),
    ('Φ', "\\Phi"),
    ('Ψ', "\\Psi"),
    ('Ω', "\\Omega"),
    ('ϑ', "\\vartheta"),
    ('ϕ', "\\varphi"),
    ('ϖ', "\\varpi"),
    ('ϱ', "\\varrho"),
    ('ϵ', "\\varepsilon"),
    ('Α', "A"),
    ('Β', "B"),
    ('Ε', "E"),
    ('Ζ', "Z"),
    ('Η', "H"),
    ('Ι', "I"),
    ('Κ', "K"),
    ('Μ', "M"),
    ('Ν', "N"),
    ('Ο', "O"),
    ('Ρ', "P"),
    ('Τ', "T"),
    ('Χ', "X"),
];

// accent macros and the combining mark each one puts on its letter
const ACCENTS: &[(&str, char)] = &[
    ("`", '\u{300}'),
    ("'", '\u{301}'),
    ("^", '\u{302}'),
    ("~", '\u{303}'),
    ("=", '\u{304}'),
    ("u", '\u{306}'),
    (".", '\u{307}'),
    ("\"", '\u{308}'),
    ("r", '\u{30a}'),
    ("H", '\u{30b}'),
    ("v", '\u{30c}'),
    ("d", '\u{323}'),
    ("c", '\u{327}'),
    ("k", '\u{328}'),
    ("b", '\u{331}'),
];

// macros that stand for text
const SYMBOLS: &[(&str, &str)] = &[
    ("ss", "ß"),
    ("o", "ø"),
    ("O", "Ø"),
    ("ae", "æ"),
    ("AE", "Æ"),
    ("oe", "œ"),
    ("OE", "Œ"),
    ("aa", "å"),
    ("AA", "Å"),
    ("l", "ł"),
    ("L", "Ł"),
    ("i", "ı"),
    ("j", "ȷ"),
    ("dh", "ð"),
    ("DH", "Ð"),
    ("th", "þ"),
    ("TH", "Þ"),
    ("LaTeX", "LaTeX"),
    ("TeX", "TeX"),
    ("LaTeXe", "LaTeX2e"),
    ("textasciicircum", "^"),
    ("textasciitilde", "~"),
    ("textbackslash", "\\"),
    ("textendash", "–"),
    ("textemdash", "—"),
    ("textquoteleft", "‘"),
    ("textquoteright", "’"),
    ("textquotedblleft", "“"),
    ("textquotedblright", "”"),
    ("ldots", "…"),
    ("dots", "…"),
    ("textellipsis", "…"),
    ("S", "§"),
    ("P", "¶"),
    ("copyright", "©"),
    ("textregistered", "®"),
    ("texttrademark", "™"),
    ("textdegree", "°"),
    ("pounds", "£"),
    ("euro", "€"),
    ("textbar", "|"),
    ("textless", "<"),
    ("textgreater", ">"),
    ("textunderscore", "_"),
    ("quad", " "),
    ("qquad", " "),
    ("times", "×"),
    ("cdot", "·"),
    ("pm", "±"),
    ("infty", "∞"),
    ("leq", "≤"),
    ("geq", "≥"),
    ("neq", "≠"),
    ("approx", "≈"),
    ("to", "→"),
    ("rightarrow", "→"),
    ("leftarrow", "←"),
];

/// TeX as plain text, as 2.8's pylatexenc `latexToText` reads bibliography fields: accents composed, the
/// specials and their escapes as characters, `\href{url}{text}` as its text, other commands dropped with their
/// arguments' text kept, braces gone, maths read as text.
// ponytail: a hand port of the parts of pylatexenc that bibliography text uses; a full TeX reader if titles
// with unusual macros ever read wrong
pub fn latex_to_text(text: &str) -> String {
    if !text.contains(['\\', '{', '}', '$', '%', '~', '_', '^', '`', '\'', '-']) {
        return text.to_owned();
    }
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\\' => i = command(&chars, i + 1, &mut out),
            '{' | '}' | '$' => i += 1,
            '%' => {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
            }
            '~' => {
                out.push('\u{a0}');
                i += 1;
            }
            '-' if chars.get(i + 1) == Some(&'-') => {
                if chars.get(i + 2) == Some(&'-') {
                    out.push('—');
                    i += 3;
                } else {
                    out.push('–');
                    i += 2;
                }
            }
            '`' if chars.get(i + 1) == Some(&'`') => {
                out.push('“');
                i += 2;
            }
            '\'' if chars.get(i + 1) == Some(&'\'') => {
                out.push('”');
                i += 2;
            }
            _ => {
                out.push(c);
                i += 1;
            }
        }
    }
    out.nfc().collect()
}

/// One command from just after its backslash; returns where reading goes on.
fn command(chars: &[char], start: usize, out: &mut String) -> usize {
    let Some(&first) = chars.get(start) else {
        return start;
    };
    if !first.is_ascii_alphabetic() {
        let name = first.to_string();
        if let Some((_, mark)) = ACCENTS.iter().find(|(n, _)| *n == name) {
            return accent(chars, start + 1, *mark, out);
        }
        match first {
            '\\' => out.push('\n'),
            ' ' | ',' | ';' | ':' | '!' | '>' => out.push(' '),
            '/' | '-' | '@' => {}
            other => out.push(other),
        }
        return start + 1;
    }
    let mut end = start;
    while end < chars.len() && chars[end].is_ascii_alphabetic() {
        end += 1;
    }
    let name: String = chars[start..end].iter().collect();
    // a control word swallows the spaces after it
    let mut after = end;
    while after < chars.len() && chars[after] == ' ' {
        after += 1;
    }
    if let Some((_, mark)) = ACCENTS.iter().find(|(n, _)| *n == name) {
        return accent(chars, after, *mark, out);
    }
    if let Some((_, s)) = SYMBOLS.iter().find(|(n, _)| *n == name) {
        out.push_str(s);
        // `{\ss}` and `\ss{}`: the empty group after it goes too
        if chars.get(after) == Some(&'{') && chars.get(after + 1) == Some(&'}') {
            return after + 2;
        }
        return after;
    }
    if let Some((c, _)) = GREEK
        .iter()
        .find(|(_, tex)| tex.strip_prefix('\\') == Some(name.as_str()))
    {
        out.push(*c);
        return after;
    }
    if name == "href" || name == "url" {
        // \href{url}{text} is its text; \url{x} is x
        let (first_arg, next) = group(chars, after);
        if name == "url" {
            out.push_str(&first_arg);
            return next;
        }
        let mut n = next;
        while n < chars.len() && chars[n].is_whitespace() {
            n += 1;
        }
        let (text, next) = group(chars, n);
        out.push_str(&latex_to_text(&text));
        return next;
    }
    after
}

/// The braced group at `at` (its inside, raw) and where reading goes on; a single character when unbraced.
fn group(chars: &[char], at: usize) -> (String, usize) {
    match chars.get(at) {
        Some('{') => {
            let mut depth = 0;
            for (k, &c) in chars.iter().enumerate().skip(at) {
                match c {
                    '{' => depth += 1,
                    '}' => {
                        depth -= 1;
                        if depth == 0 {
                            return (chars[at + 1..k].iter().collect(), k + 1);
                        }
                    }
                    _ => {}
                }
            }
            (chars[at + 1..].iter().collect(), chars.len())
        }
        Some(&c) => (c.to_string(), at + 1),
        None => (String::new(), at),
    }
}

fn accent(chars: &[char], at: usize, mark: char, out: &mut String) -> usize {
    let (arg, next) = group(chars, at);
    let text = latex_to_text(&arg);
    let mut letters = text.chars();
    match letters.next() {
        Some(first) => {
            out.push(first);
            out.push(mark);
            out.extend(letters);
        }
        None => out.push(mark),
    }
    next
}

/// Greek written as pdfLaTeX's `\ensuremath{…}` (pylatexenc's `unicodeToLatex` for those letters).
fn greek_to_latex(c: char) -> Option<String> {
    let (_, tex) = GREEK.iter().find(|(g, _)| *g == c)?;
    Some(if tex.starts_with('\\') {
        format!("\\ensuremath{{{tex}}}")
    } else {
        (*tex).to_owned()
    })
}

const ACCENT_MACROS: &[(char, char)] = &[
    ('\u{300}', '`'),
    ('\u{301}', '\''),
    ('\u{302}', '^'),
    ('\u{303}', '~'),
    ('\u{304}', '='),
    ('\u{306}', 'u'),
    ('\u{307}', '.'),
    ('\u{308}', '"'),
    ('\u{30a}', 'r'),
    ('\u{30b}', 'H'),
    ('\u{30c}', 'v'),
    ('\u{323}', 'd'),
    ('\u{327}', 'c'),
    ('\u{328}', 'k'),
];

/// Greek and compound Latin accents encoded for pdfLaTeX (which knows characters up to Latin Extended-A);
/// other Unicode kept.
pub fn pdf_tex_safe(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        if u32::from(ch) <= 0x17f {
            out.push(ch);
            continue;
        }
        if let Some(tex) = greek_to_latex(ch) {
            out.push_str(&tex);
            continue;
        }
        let parts: Vec<char> = ch.nfd().collect();
        let (letter, marks) = (parts[0], &parts[1..]);
        let macros: Option<Vec<char>> = marks
            .iter()
            .map(|m| ACCENT_MACROS.iter().find(|(c, _)| c == m).map(|(_, a)| *a))
            .collect();
        match macros {
            Some(macros) if !marks.is_empty() && u32::from(letter) <= 0x17f => {
                let mut inner = letter.to_string();
                for (i, a) in macros.iter().enumerate() {
                    inner = if i == 0 {
                        format!("\\{a}{{{inner}}}")
                    } else {
                        format!("\\{a}{{{{{inner}}}}}")
                    };
                }
                out.push('{');
                out.push_str(&inner);
                out.push('}');
            }
            _ => out.push(ch),
        }
    }
    out
}

static DOUBLE_QUOTED: LazyLock<Regex> = LazyLock::new(|| re(r#"(^|[\s(\[{])"([^"\n]+)""#));
static SINGLE_QUOTED: LazyLock<fancy_regex::Regex> =
    LazyLock::new(|| fre(r"(^|[\s(\[{])'(?=\S)(.+?)'(?![\p{L}\p{N}'])"));

/// Opening quotes as TeX's backtick; apostrophes inside words stay apostrophes.
pub(crate) fn tex_quotes(s: &str) -> String {
    let mapped: String = s
        .chars()
        .map(|c| match c {
            '‘' => "`".to_owned(),
            '’' => "'".to_owned(),
            '“' => "``".to_owned(),
            '”' => "''".to_owned(),
            other => other.to_string(),
        })
        .collect();
    let doubled = DOUBLE_QUOTED.replace_all(&mapped, "$1``$2''");
    freplace(&SINGLE_QUOTED, &doubled, |c| {
        format!("{}`{}'", &c[1], &c[2])
    })
}

static COMPOUND: LazyLock<Regex> = LazyLock::new(|| re(r"[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*"));

/// Whether sentence-case styles would lowercase a word that must keep its case: a part with a capital after its
/// first character (3D, CNN, GPT-4, iPhone), or a single capital before a hyphen (R-CNN, U-Net, X-ray).
fn keeps_case(word: &str) -> bool {
    let parts: Vec<&str> = word.split('-').collect();
    parts
        .iter()
        .any(|p| p.chars().skip(1).any(char::is_uppercase))
        || (parts.len() > 1 && {
            let mut c = parts[0].chars();
            matches!((c.next(), c.next()), (Some(f), None) if f.is_uppercase())
        })
}

fn protect_words(s: &str) -> String {
    COMPOUND
        .replace_all(s, |c: &regex::Captures| {
            if keeps_case(&c[0]) {
                format!("{{{}}}", &c[0])
            } else {
                c[0].to_owned()
            }
        })
        .into_owned()
}

/// Plain text with every TeX special escaped (a web page's title is never TeX); `protect` braces words with
/// internal capitals as [`tex_escape`] does.
pub fn plain_tex(text: &str, protect: bool) -> String {
    let s = tex_quotes(text);
    let escaped = escape_tex_text(&s);
    let has_lower = s.chars().any(char::is_lowercase);
    pdf_tex_safe(&if protect && has_lower {
        protect_words(&escaped)
    } else {
        escaped
    })
}

/// `& % $ # _` escaped outside the TeX already there (commands, `{groups}`, `$maths$`) and, with `protect`,
/// words with internal capitals or all capitals braced (`{BERT}`, `{ImageNet}`); an all-capitals title is left.
pub fn tex_escape(text: &str, protect: bool) -> String {
    let protect = protect && text.chars().any(char::is_lowercase);
    let mut out = String::with_capacity(text.len() + 8);
    let mut plain = String::new();
    let flush = |plain: &mut String, out: &mut String| {
        let quoted = tex_quotes(plain);
        out.push_str(&pdf_tex_safe(&if protect {
            protect_words(&quoted)
        } else {
            quoted
        }));
        plain.clear();
    };
    let mut i = 0;
    while i < text.len() {
        let Some(ch) = text[i..].chars().next() else {
            break;
        };
        match ch {
            '\\' => {
                let rest = &text[i + 1..];
                let len = match rest.chars().next() {
                    None => 0,
                    Some(c) if c.is_ascii_alphabetic() => rest
                        .find(|c: char| !c.is_ascii_alphabetic())
                        .unwrap_or(rest.len()),
                    Some(c) => c.len_utf8(),
                };
                flush(&mut plain, &mut out);
                if len == 0 {
                    // a lone trailing backslash would swallow the field's closing brace
                    out.push_str("\\textbackslash{}");
                } else {
                    out.push_str(&text[i..=i + len]);
                }
                i += 1 + len;
            }
            '{' => {
                if let Some(end) = match_brace(text, i) {
                    flush(&mut plain, &mut out);
                    out.push_str(&text[i..=end]);
                    i = end + 1;
                } else {
                    plain.push_str("\\{");
                    i += 1;
                }
            }
            '}' => {
                plain.push_str("\\}");
                i += 1;
            }
            '$' => match text[i + 1..].find('$') {
                Some(off) if off > 0 => {
                    flush(&mut plain, &mut out);
                    out.push_str(&text[i..=i + 1 + off]);
                    i += off + 2;
                }
                _ => {
                    plain.push_str("\\$");
                    i += 1;
                }
            },
            '&' | '%' | '#' | '_' => {
                plain.push('\\');
                plain.push(ch);
                i += 1;
            }
            _ => {
                plain.push(ch);
                i += ch.len_utf8();
            }
        }
    }
    flush(&mut plain, &mut out);
    out
}

#[cfg(test)]
mod tests;
