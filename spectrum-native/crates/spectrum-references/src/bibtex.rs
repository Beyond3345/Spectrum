//! `.bib` files two ways. [`Bibliography`] is lossless: comments, `@string`, `@preamble`, `@comment`, field
//! order, braces or quotes and every space come back byte for byte, and an entry edited through it changes only
//! that field. [`parse_bib_entries`] is 2.8's lenient reader (`parseBibEntries`), which the duplicate checks,
//! the research search and Zotero read entries with, so they find what 2.8 found even in a half-typed file.

use std::fmt;
use std::sync::LazyLock;

use regex::Regex;

use crate::text::{match_brace, re, squash};

/// A whole `.bib` file. `to_string()` gives back exactly the text it was parsed from, plus any edits.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Bibliography {
    pub items: Vec<Item>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Item {
    /// Anything outside an entry: comments, blank lines, and an `@…` that couldn't be read as one.
    Text(String),
    Entry(Entry),
    /// `@string{name = value, …}`: its definitions in `fields`, `key` empty.
    Strings(Entry),
    /// `@preamble{…}` or `@comment{…}`, as written.
    Special {
        kind: String,
        raw: String,
    },
}

/// One `@type{key, name = value, …}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    /// From `@` to the opening `{` or `(`, as written (`@Article{`).
    prefix: String,
    /// The type, lower case.
    pub kind: String,
    key_lead: String,
    pub key: String,
    pub fields: Vec<Field>,
    /// After the last value (or the key) up to the closing delimiter: a trailing comma, a newline.
    tail: String,
    close: char,
    /// Byte offset of the `@` in the text parsed (0 for an entry made here).
    pub offset: usize,
}

/// `name = value`, with what stood before it (the comma, the newline and indent) and around the `=`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Field {
    lead: String,
    /// As written (`Title`); compare with [`Field::is`].
    pub name: String,
    sep: String,
    /// The value as written: `{…}`, `"…"`, a number, a `@string` name, or parts joined with `#`.
    pub raw: String,
}

/// One part of a value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Piece {
    Braced(String),
    Quoted(String),
    Bare(String),
}

impl Field {
    pub fn is(&self, name: &str) -> bool {
        self.name.eq_ignore_ascii_case(name)
    }

    /// The value's parts.
    pub fn pieces(&self) -> Vec<Piece> {
        let mut out = Vec::new();
        let s = self.raw.as_str();
        let mut i = 0;
        while i < s.len() {
            let rest = &s[i..];
            let skip = rest.len() - rest.trim_start_matches([' ', '\t', '\r', '\n', '#']).len();
            if skip > 0 {
                i += skip;
                continue;
            }
            let (piece, len) =
                read_piece(rest).unwrap_or((Piece::Bare(rest.to_owned()), rest.len()));
            out.push(piece);
            i += len.max(1);
        }
        out
    }

    /// The value as text: parts joined, `@string` names from `strings` (lower-cased names), braces of the
    /// outer group gone.
    pub fn value(&self, strings: &[(String, String)]) -> String {
        self.pieces()
            .into_iter()
            .map(|p| match p {
                Piece::Braced(s) | Piece::Quoted(s) => s,
                Piece::Bare(s) => strings
                    .iter()
                    .find(|(n, _)| n.eq_ignore_ascii_case(&s))
                    .map_or(s, |(_, v)| v.clone()),
            })
            .collect()
    }
}

impl Entry {
    /// A new entry, written as Spectrum writes them (`@type{key,` then one field a line, two spaces in).
    pub fn new(kind: &str, key: &str) -> Self {
        Self {
            prefix: format!("@{kind}{{"),
            kind: kind.to_ascii_lowercase(),
            key_lead: String::new(),
            key: key.to_owned(),
            fields: Vec::new(),
            tail: ",\n".to_owned(),
            close: '}',
            offset: 0,
        }
    }

    pub fn field(&self, name: &str) -> Option<&Field> {
        self.fields.iter().find(|f| f.is(name))
    }

    /// A field set to `{value}`: in its place when the entry has it, else after the last one, laid out like it.
    pub fn set(&mut self, name: &str, value: &str) {
        let raw = format!("{{{value}}}");
        if let Some(f) = self.fields.iter_mut().find(|f| f.is(name)) {
            f.raw = raw;
            return;
        }
        let (lead, sep) = self.fields.last().map_or_else(
            || (",\n  ".to_owned(), " = ".to_owned()),
            |f| (f.lead.clone(), f.sep.clone()),
        );
        // the first field's lead holds the comma after the key, as later ones' do
        let lead = if lead.trim_start().starts_with(',') {
            lead
        } else {
            format!(",{lead}")
        };
        self.fields.push(Field {
            lead,
            name: name.to_owned(),
            sep,
            raw,
        });
    }

    /// Takes a field out, with what stood before it.
    pub fn remove(&mut self, name: &str) {
        self.fields.retain(|f| !f.is(name));
    }

    /// The key changed, the rest kept.
    pub fn set_key(&mut self, key: &str) {
        key.clone_into(&mut self.key);
    }
}

impl fmt::Display for Entry {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.prefix)?;
        f.write_str(&self.key_lead)?;
        f.write_str(&self.key)?;
        for field in &self.fields {
            write!(f, "{}{}{}{}", field.lead, field.name, field.sep, field.raw)?;
        }
        f.write_str(&self.tail)?;
        write!(f, "{}", self.close)
    }
}

impl fmt::Display for Bibliography {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for item in &self.items {
            match item {
                Item::Text(t) | Item::Special { raw: t, .. } => f.write_str(t)?,
                Item::Entry(e) | Item::Strings(e) => write!(f, "{e}")?,
            }
        }
        Ok(())
    }
}

impl Bibliography {
    /// Reads a whole file; never fails: what can't be read as an entry stays as text.
    pub fn parse(text: &str) -> Self {
        let mut items: Vec<Item> = Vec::new();
        let mut plain = String::new();
        let mut i = 0;
        while let Some(off) = text[i..].find('@') {
            let at = i + off;
            plain.push_str(&text[i..at]);
            if let Some((item, end)) = read_item(text, at) {
                if !plain.is_empty() {
                    items.push(Item::Text(std::mem::take(&mut plain)));
                }
                items.push(item);
                i = end;
            } else {
                plain.push('@');
                i = at + 1;
            }
        }
        plain.push_str(&text[i..]);
        if !plain.is_empty() {
            items.push(Item::Text(plain));
        }
        Self { items }
    }

    pub fn entries(&self) -> impl Iterator<Item = &Entry> {
        self.items.iter().filter_map(|i| match i {
            Item::Entry(e) => Some(e),
            _ => None,
        })
    }

    pub fn entries_mut(&mut self) -> impl Iterator<Item = &mut Entry> {
        self.items.iter_mut().filter_map(|i| match i {
            Item::Entry(e) => Some(e),
            _ => None,
        })
    }

    /// The `@string` definitions, in order, names lower case, each read with the ones before it.
    pub fn strings(&self) -> Vec<(String, String)> {
        let mut out: Vec<(String, String)> = Vec::new();
        for item in &self.items {
            if let Item::Strings(e) = item {
                for f in &e.fields {
                    let value = f.value(&out);
                    out.push((f.name.to_ascii_lowercase(), value));
                }
            }
        }
        out
    }

    /// An entry appended as 2.8's `appendEntry` does: one blank line between entries, the file's line ending.
    pub fn push(&mut self, entry: &str) {
        let existing = self.to_string();
        let eol = if existing.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        };
        let sep = if existing.trim().is_empty()
            || existing.ends_with("\n\n")
            || existing.ends_with("\r\n\r\n")
        {
            String::new()
        } else if existing.ends_with('\n') {
            eol.to_owned()
        } else {
            format!("{eol}{eol}")
        };
        let added = format!("{sep}{}{eol}", entry.replace('\n', eol));
        let mut more = Self::parse(&added);
        // offsets from the end of the file as it was
        for item in &mut more.items {
            if let Item::Entry(e) = item {
                e.offset += existing.len();
            }
        }
        self.items.extend(more.items);
    }
}

fn is_space(c: u8) -> bool {
    c.is_ascii_whitespace()
}

fn skip_space(s: &str, mut i: usize) -> usize {
    while i < s.len() && is_space(s.as_bytes()[i]) {
        i += 1;
    }
    i
}

/// One piece of a value at the start of `s`, and its length.
fn read_piece(s: &str) -> Option<(Piece, usize)> {
    match s.as_bytes().first()? {
        b'{' => {
            let end = match_brace(s, 0)?;
            Some((Piece::Braced(s[1..end].to_owned()), end + 1))
        }
        b'"' => {
            let bytes = s.as_bytes();
            let mut depth = 0i32;
            let mut j = 1;
            while j < bytes.len() {
                match bytes[j] {
                    b'\\' => j += 1,
                    b'{' => depth += 1,
                    b'}' => depth -= 1,
                    b'"' if depth <= 0 => return Some((Piece::Quoted(s[1..j].to_owned()), j + 1)),
                    _ => {}
                }
                j += 1;
            }
            None
        }
        _ => {
            let len = s
                .find(|c: char| {
                    c.is_whitespace() || matches!(c, ',' | '#' | '}' | ')' | '{' | '(' | '"' | '=')
                })
                .unwrap_or(s.len());
            (len > 0).then(|| (Piece::Bare(s[..len].to_owned()), len))
        }
    }
}

/// A value (`a # "b" # {c}`) starting at `i`; returns where it ends.
fn read_value(s: &str, i: usize) -> Option<usize> {
    let (_, len) = read_piece(&s[i..])?;
    let mut end = i + len;
    loop {
        let j = skip_space(s, end);
        if s.as_bytes().get(j) != Some(&b'#') {
            return Some(end);
        }
        let k = skip_space(s, j + 1);
        let (_, len) = read_piece(&s[k..])?;
        end = k + len;
    }
}

/// `name = value` pairs from `i` up to the closing delimiter: (fields, tail, index of the delimiter).
fn read_fields(s: &str, mut i: usize, close: u8) -> Option<(Vec<Field>, String, usize)> {
    let bytes = s.as_bytes();
    let mut fields = Vec::new();
    loop {
        let lead_start = i;
        loop {
            i = skip_space(s, i);
            if bytes.get(i) == Some(&b',') {
                i += 1;
            } else {
                break;
            }
        }
        match bytes.get(i) {
            None => return None,
            Some(&c) if c == close => return Some((fields, s[lead_start..i].to_owned(), i)),
            _ => {}
        }
        let name_end = s[i..]
            .find(|c: char| {
                c.is_whitespace() || matches!(c, '=' | ',' | '{' | '}' | '(' | ')' | '"' | '#')
            })
            .map_or(s.len(), |k| i + k);
        if name_end == i {
            return None;
        }
        let eq = skip_space(s, name_end);
        if bytes.get(eq) != Some(&b'=') {
            return None;
        }
        let value_start = skip_space(s, eq + 1);
        let value_end = read_value(s, value_start)?;
        fields.push(Field {
            lead: s[lead_start..i].to_owned(),
            name: s[i..name_end].to_owned(),
            sep: s[name_end..value_start].to_owned(),
            raw: s[value_start..value_end].to_owned(),
        });
        i = value_end;
    }
}

/// The item at the `@` at `at`, and where it ends.
fn read_item(s: &str, at: usize) -> Option<(Item, usize)> {
    let bytes = s.as_bytes();
    let name_start = skip_space(s, at + 1);
    let name_len = s[name_start..]
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-'))
        .unwrap_or(s.len() - name_start);
    if name_len == 0 || !bytes[name_start].is_ascii_alphabetic() {
        return None;
    }
    let kind = s[name_start..name_start + name_len].to_ascii_lowercase();
    let open_at = skip_space(s, name_start + name_len);
    let (close, closing) = match bytes.get(open_at) {
        Some(b'{') => (b'}', '}'),
        Some(b'(') => (b')', ')'),
        _ => return None,
    };
    let prefix = s[at..=open_at].to_owned();
    match kind.as_str() {
        "comment" | "preamble" => {
            let end = closing_delimiter(s, open_at, close)?;
            Some((
                Item::Special {
                    kind,
                    raw: s[at..=end].to_owned(),
                },
                end + 1,
            ))
        }
        "string" => {
            let (fields, tail, end) = read_fields(s, open_at + 1, close)?;
            let entry = Entry {
                prefix,
                kind,
                key_lead: String::new(),
                key: String::new(),
                fields,
                tail,
                close: closing,
                offset: at,
            };
            Some((Item::Strings(entry), end + 1))
        }
        _ => {
            let key_start = skip_space(s, open_at + 1);
            let key_end = s[key_start..]
                .find(|c: char| {
                    c.is_whitespace() || c == ',' || c == closing || matches!(c, '{' | '}')
                })
                .map_or(s.len(), |k| key_start + k);
            if key_end == key_start {
                return None;
            }
            let (fields, tail, end) = read_fields(s, key_end, close)?;
            let entry = Entry {
                prefix,
                kind,
                key_lead: s[open_at + 1..key_start].to_owned(),
                key: s[key_start..key_end].to_owned(),
                fields,
                tail,
                close: closing,
                offset: at,
            };
            Some((Item::Entry(entry), end + 1))
        }
    }
}

/// The delimiter closing the one at `open`, braces inside balanced.
fn closing_delimiter(s: &str, open: usize, close: u8) -> Option<usize> {
    if close == b'}' {
        return match_brace(s, open);
    }
    let bytes = s.as_bytes();
    let mut depth = 0i32;
    for (j, &b) in bytes.iter().enumerate().skip(open + 1) {
        match b {
            b'{' => depth += 1,
            b'}' => depth -= 1,
            b')' if depth == 0 => return Some(j),
            _ => {}
        }
    }
    None
}

// ─── 2.8's lenient reader ───

/// An entry as 2.8's `parseBibEntries` reads it: field names lower case, each value's first part with its
/// whitespace squashed, the first of a name twice kept.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BibEntry {
    pub kind: String,
    pub key: String,
    pub fields: Vec<(String, String)>,
    /// Byte offset of the `@`.
    pub at: usize,
}

impl BibEntry {
    /// The field's value, or "".
    pub fn get(&self, name: &str) -> &str {
        self.fields
            .iter()
            .find(|(n, _)| n == name)
            .map_or("", |(_, v)| v.as_str())
    }

    pub fn has(&self, name: &str) -> bool {
        self.fields.iter().any(|(n, _)| n == name)
    }
}

static HEAD: LazyLock<Regex> = LazyLock::new(|| re(r#"@([A-Za-z]+)\s*[{(]\s*([^,\s{}()"=]+)\s*,"#));
static FIELD: LazyLock<Regex> = LazyLock::new(|| re(r"([A-Za-z][\w:-]*)\s*=\s*"));

fn lenient_value(s: &str, i: usize) -> (String, usize) {
    let bytes = s.as_bytes();
    match bytes.get(i) {
        Some(b'{') => match match_brace(s, i) {
            Some(end) => (s[i + 1..end].to_owned(), end + 1),
            None => (s[i + 1..].to_owned(), s.len()),
        },
        Some(b'"') => {
            let mut depth = 0i32;
            let mut j = i + 1;
            while j < bytes.len() {
                match bytes[j] {
                    b'\\' => j += 1,
                    b'{' => depth += 1,
                    b'}' => depth -= 1,
                    b'"' if depth <= 0 => break,
                    _ => {}
                }
                j += 1;
            }
            let end = j.min(s.len());
            (s[i + 1..end].to_owned(), (j + 1).min(s.len()))
        }
        _ => {
            let len = s[i..]
                .find(|c: char| c == ',' || c == '}' || c.is_whitespace())
                .unwrap_or(s.len() - i);
            (s[i..i + len].to_owned(), i + len)
        }
    }
}

/// Every entry 2.8 would read (`@string`, `@comment` and `@preamble` skipped), even from a broken file.
pub fn parse_bib_entries(text: &str) -> Vec<BibEntry> {
    let heads: Vec<_> = HEAD
        .captures_iter(text)
        .filter(|c| {
            !matches!(
                c[1].to_ascii_lowercase().as_str(),
                "comment" | "string" | "preamble"
            )
        })
        .collect();
    heads
        .iter()
        .enumerate()
        .map(|(n, c)| {
            let Some(whole) = c.get(0) else {
                return BibEntry {
                    kind: String::new(),
                    key: String::new(),
                    fields: Vec::new(),
                    at: 0,
                };
            };
            let end = heads
                .get(n + 1)
                .and_then(|h| h.get(0))
                .map_or(text.len(), |m| m.start());
            let body = &text[whole.end()..end];
            let mut fields: Vec<(String, String)> = Vec::new();
            let mut pos = 0;
            while let Some(f) = FIELD.captures_at(body, pos) {
                let Some(m) = f.get(0) else { break };
                let (value, vend) = lenient_value(body, m.end());
                let name = f[1].to_ascii_lowercase();
                if !fields.iter().any(|(n, _)| *n == name) {
                    fields.push((name, squash(&value)));
                }
                pos = vend.max(m.end());
                if pos >= body.len() {
                    break;
                }
            }
            BibEntry {
                kind: c[1].to_ascii_lowercase(),
                key: c[2].to_owned(),
                fields,
                at: whole.start(),
            }
        })
        .collect()
}

static ANY_HEAD: LazyLock<Regex> = LazyLock::new(|| re(r"@\s*([A-Za-z]+)\s*[{(]"));

/// Whether every entry of a `.bib` was read: one per `@head`, and every brace closed (2.8's `parsedWhole`).
pub fn parsed_whole(text: &str) -> bool {
    let heads = ANY_HEAD
        .captures_iter(text)
        .filter(|c| {
            !matches!(
                c[1].to_ascii_lowercase().as_str(),
                "comment" | "string" | "preamble"
            )
        })
        .count();
    let bytes = text.as_bytes();
    let mut depth = 0i32;
    let mut i = 0;
    while i < bytes.len() && depth >= 0 {
        match bytes[i] {
            b'\\' => i += 1,
            b'{' => depth += 1,
            b'}' => depth -= 1,
            _ => {}
        }
        i += 1;
    }
    depth == 0 && heads == parse_bib_entries(text).len()
}

/// The line (from 1) of a byte offset.
pub fn line_of(text: &str, at: usize) -> usize {
    text[..at.min(text.len())].matches('\n').count() + 1
}

#[cfg(test)]
mod tests;
