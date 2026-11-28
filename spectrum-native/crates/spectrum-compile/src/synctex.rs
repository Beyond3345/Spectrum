//! A reader for the .synctex.gz files TeX engines write with -synctex=1 (format: synctex(5)),
//! for jumping between the source and the PDF. Positions in and out are PDF points from the
//! page's top-left corner. A port of 2.8's `apps/backend/src/services/synctex.js`, which follows
//! the synctex tool's own parser (1.21) choice for choice.

mod forward;
mod inverse;
mod store;

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;

pub use store::{EditHit, SynctexError, SynctexStore};

use crate::regex;

// scaled points per PDF point (big point): 65536 sp/pt × 72.27 pt/in ÷ 72 bp/in
const SP_PER_BP: f64 = 65_781.76;
// <type><tag>,<line>[,<column>]:<h>,<v>[:<W>[,<H>,<D>]]; v is '=' when it repeats the last one
static RECORD: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r"^([\[(hvxkg$r])([0-9]+),(-?[0-9]+)(?:,(-?[0-9]+))?:(-?[0-9]+),(-?[0-9]+|=)(?::(-?[0-9]+)(?:,(-?[0-9]+),(-?[0-9]+))?)?",
    )
});
// JavaScript's '.' stops at these, so a name ending in '\r' doesn't match there either
static INPUT: LazyLock<Regex> =
    LazyLock::new(|| regex("^Input:([0-9]+):([^\r\n\u{2028}\u{2029}]*)$"));
static PREAMBLE: LazyLock<Regex> =
    LazyLock::new(|| regex(r"^(Unit|Magnification|X Offset|Y Offset):(-?[0-9.]+)"));

/// One rectangle in the PDF, in points from the page's top-left corner.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SyncBox {
    pub page: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A place in the source: the input's tag in the SyncTeX file, its line and column (if any).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyncHit {
    pub tag: i64,
    pub line: i64,
    pub column: Option<i64>,
}

/// A record: '[' vboxes and '(' hboxes with kids, and leaves 'h'/'v' (void boxes), 'x'
/// (current position), 'k' kern, 'g' glue, '$' math, 'r' rule, 'b' an hbox's boundary.
/// x0..y1 are an hbox's extent, grown to cover what it holds.
#[derive(Debug, Clone, Default)]
struct Node {
    t: u8,
    tag: i64,
    line: i64,
    col: i64,
    h: i64,
    v: i64,
    w: i64,
    ht: i64,
    d: i64,
    x0: i64,
    x1: i64,
    y0: i64,
    y1: i64,
    parent: Option<usize>,
    /// `Some` for boxes and the sheet, even when empty
    kids: Option<Vec<usize>>,
}

#[derive(Clone, Copy)]
struct Rect {
    x0: i64,
    x1: i64,
    y0: i64,
    y1: i64,
}

fn rect(a: i64, b: i64, c: i64, d: i64) -> Rect {
    Rect {
        x0: a.min(b),
        x1: a.max(b),
        y0: c.min(d),
        y1: c.max(d),
    }
}

/// One page's records; node 0 is the sheet itself.
#[derive(Debug, Clone)]
struct Sheet {
    page: Option<i64>,
    nodes: Vec<Node>,
    /// in the order they closed
    hboxes: Vec<usize>,
}

impl Sheet {
    fn new(page: Option<i64>) -> Self {
        let root = Node {
            t: b'{',
            kids: Some(Vec::new()),
            ..Node::default()
        };
        Self {
            page,
            nodes: vec![root],
            hboxes: Vec::new(),
        }
    }

    fn kids(&self, n: usize) -> &[usize] {
        self.nodes[n].kids.as_deref().unwrap_or(&[])
    }

    fn extent(&self, n: usize) -> Rect {
        let node = &self.nodes[n];
        Rect {
            x0: node.x0,
            x1: node.x1,
            y0: node.y0,
            y1: node.y1,
        }
    }

    fn add(&mut self, node: Node) -> usize {
        let id = self.nodes.len();
        if let Some(kids) = node.parent.and_then(|p| self.nodes[p].kids.as_mut()) {
            kids.push(id);
        }
        self.nodes.push(node);
        id
    }

    /// Adds a record under its parent; returns it when it is a box, the new parent.
    fn insert(&mut self, mut node: Node) -> Option<usize> {
        let up = node.parent?;
        let (tag, line, col) = (node.tag, node.line, node.col);
        let extent = rect(node.h, node.h + node.w, node.v - node.ht, node.v + node.d);
        match node.t {
            b'[' => {
                node.kids = Some(Vec::new());
                Some(self.add(node))
            }
            b'(' => {
                (node.x0, node.x1, node.y0, node.y1) = (extent.x0, extent.x1, extent.y0, extent.y1);
                node.kids = Some(Vec::new());
                let id = self.add(node);
                self.add(Node {
                    t: b'b',
                    tag,
                    line,
                    col,
                    parent: Some(id),
                    ..Node::default()
                });
                Some(id)
            }
            kind => {
                let (h, v, w) = (node.h, node.v, node.w);
                self.add(node);
                match kind {
                    b'k' => self.grow(up, rect(h - w, h, v, v)),
                    b'h' => self.grow(up, extent),
                    b'r' | b'v' => {}
                    _ => self.grow(up, rect(h, h, v, v)),
                }
                None
            }
        }
    }

    fn grow(&mut self, n: usize, r: Rect) {
        let node = &mut self.nodes[n];
        if node.t != b'(' {
            return;
        }
        node.x0 = node.x0.min(r.x0);
        node.x1 = node.x1.max(r.x1);
        node.y0 = node.y0.min(r.y0);
        node.y1 = node.y1.max(r.y1);
    }

    fn copy_link(&mut self, to: usize, from: usize) {
        let (tag, line, col) = (
            self.nodes[from].tag,
            self.nodes[from].line,
            self.nodes[from].col,
        );
        let node = &mut self.nodes[to];
        (node.tag, node.line, node.col) = (tag, line, col);
    }

    /// The tool's fix-ups when an hbox closes, which decide what a click near its edges answers.
    fn close_hbox(&mut self, b: usize) {
        let all = self.kids(b).to_vec();
        let Some((&open, kids)) = all.split_first() else {
            return;
        };
        let last = kids.last().copied().unwrap_or(b);
        let close = Node {
            t: b'b',
            tag: self.nodes[last].tag,
            line: self.nodes[last].line,
            col: self.nodes[last].col,
            h: self.nodes[b].x1,
            v: self.nodes[b].v,
            parent: Some(b),
            ..Node::default()
        };
        // x records opening a box carry whatever link TeX had last; they take the next record's
        if let Some(first) = kids.iter().position(|&k| self.nodes[k].t != b'x') {
            for &k in &kids[..first] {
                self.copy_link(k, kids[first]);
            }
        }
        // the tool pairs the box's file with the first kid's line, which can name a line in the
        // wrong file; take both from the kid
        self.copy_link(open, kids.first().copied().unwrap_or(b));
        (self.nodes[open].h, self.nodes[open].v) = (self.nodes[b].x0, self.nodes[b].v);
        // a trailing kern and glue (\parfillskip & co) belong to the text before them
        let n = kids.len();
        if n >= 2 && self.nodes[kids[n - 2]].t == b'k' && self.nodes[kids[n - 1]].t == b'g' {
            let before = if n >= 3 { kids[n - 3] } else { open };
            self.copy_link(kids[n - 2], before);
            self.copy_link(kids[n - 1], before);
        }
        self.add(close);
    }
}

/// A parsed SyncTeX file. Coordinates stay in the file's units; `unit` and the offsets turn
/// them into points.
#[derive(Debug, Clone)]
pub struct Synctex {
    inputs: HashMap<i64, String>,
    /// in the order the file first names each page
    sheets: Vec<Sheet>,
    unit: f64,
    x_offset: f64,
    y_offset: f64,
}

/// Rounds through single precision, as the tool computes.
#[allow(
    clippy::cast_possible_truncation,
    reason = "single precision on purpose"
)]
fn fround(x: f64) -> f64 {
    f64::from(x as f32)
}

fn record(m: &regex::Captures<'_>, last_v: i64) -> Option<Node> {
    let num = |i: usize| m.get(i).map(|g| g.as_str().parse::<i64>()).transpose();
    let v = if &m[6] == "=" {
        last_v
    } else {
        m[6].parse().ok()?
    };
    Some(Node {
        t: m[1].as_bytes()[0],
        tag: num(2).ok()??,
        line: num(3).ok()??,
        col: num(4).ok()?.unwrap_or(-1),
        h: num(5).ok()??,
        v,
        w: num(7).ok()?.unwrap_or(0),
        ht: num(8).ok()?.unwrap_or(0),
        d: num(9).ok()?.unwrap_or(0),
        ..Node::default()
    })
}

impl Synctex {
    /// Reads a .synctex.gz. `ansi_code_page`: Windows' ANSI code page (HKLM ACP), whose
    /// spelling an engine may have used for a path that isn't UTF-8.
    pub fn read(file: &Path, ansi_code_page: Option<u32>) -> std::io::Result<Self> {
        let gz = std::fs::read(file)?;
        let mut bytes = Vec::new();
        flate2::read::MultiGzDecoder::new(gz.as_slice()).read_to_end(&mut bytes)?;
        let label = ansi_code_page.map(windows_code_page_label);
        Ok(Self::parse(&decode_synctex(&bytes, label.as_deref())))
    }

    /// Pages hold a tree of records. Like the tool, every hbox also gets 'b' boundary kids at
    /// its two ends, and its extent grows to cover what it holds.
    pub fn parse(text: &str) -> Self {
        let mut inputs = HashMap::new();
        let mut sheets: Vec<Sheet> = Vec::new();
        let (mut unit, mut magnification, mut x_offset, mut y_offset) = (8192.0, 1000.0, 0.0, 0.0);
        let mut content = false;
        let mut current: Option<usize> = None;
        let mut parent: Option<usize> = None;
        let mut last_v = 0;
        for row in text.split('\n') {
            if row.starts_with("Input:") {
                if let Some(m) = INPUT.captures(row)
                    && let Ok(tag) = m[1].parse()
                {
                    inputs.insert(tag, m[2].to_owned());
                }
                continue;
            }
            if !content {
                if let Some(m) = PREAMBLE.captures(row)
                    && let Ok(value) = m[2].parse::<f64>()
                {
                    match &m[1] {
                        "Unit" => unit = value,
                        "Magnification" => magnification = value,
                        "X Offset" => x_offset = value,
                        _ => y_offset = value,
                    }
                }
                content = row.starts_with("Content:");
                continue;
            }
            match row.as_bytes().first() {
                Some(b'{') => {
                    let rest = row[1..].trim();
                    let page = if rest.is_empty() {
                        Some(0)
                    } else {
                        rest.parse().ok()
                    };
                    let sheet = Sheet::new(page);
                    // a page named again replaces the first, where it was
                    let at = sheets.iter().position(|s| page.is_some() && s.page == page);
                    current = Some(at.unwrap_or(sheets.len()));
                    match at {
                        Some(i) => sheets[i] = sheet,
                        None => sheets.push(sheet),
                    }
                    parent = Some(0);
                }
                Some(b'}') => (current, parent) = (None, None),
                _ if parent.is_none() => {
                    if row.starts_with("Postamble:") {
                        break;
                    }
                }
                Some(b']' | b')') => {
                    let (Some(s), Some(b)) = (current, parent) else {
                        continue;
                    };
                    if b == 0 {
                        continue;
                    }
                    let sheet = &mut sheets[s];
                    parent = sheet.nodes[b].parent;
                    if sheet.nodes[b].t == b'(' {
                        sheet.close_hbox(b);
                        sheet.hboxes.push(b);
                        let extent = sheet.extent(b);
                        if let Some(p) = parent {
                            sheet.grow(p, extent);
                        }
                    }
                }
                _ => {
                    let (Some(at), Some(up)) = (current, parent) else {
                        continue;
                    };
                    let Some(caps) = RECORD.captures(row) else {
                        continue;
                    };
                    let Some(mut node) = record(&caps, last_v) else {
                        continue;
                    };
                    last_v = node.v;
                    node.parent = Some(up);
                    if let Some(boxed) = sheets[at].insert(node) {
                        parent = Some(boxed);
                    }
                }
            }
        }
        // in single precision like the tool, which decides a click right on a box's edge
        Self {
            inputs,
            sheets,
            unit: fround(fround(unit / SP_PER_BP) * (magnification / 1000.0)),
            x_offset: fround(x_offset * (unit / SP_PER_BP)),
            y_offset: fround(y_offset * (unit / SP_PER_BP)),
        }
    }

    /// The inputs TeX read, by tag, as the file names them.
    pub fn inputs(&self) -> impl Iterator<Item = (i64, &str)> {
        self.inputs.iter().map(|(&tag, name)| (tag, name.as_str()))
    }

    pub fn input(&self, tag: i64) -> Option<&str> {
        self.inputs.get(&tag).map(String::as_str)
    }

    fn sheet(&self, page: i64) -> Option<&Sheet> {
        self.sheets.iter().find(|s| s.page == Some(page))
    }
}

/// The encoding label for a Windows ANSI code page, as 2.8 named them.
pub fn windows_code_page_label(code: u32) -> String {
    match code {
        65001 => "utf-8".into(),
        936 => "gbk".into(),
        950 => "big5".into(),
        932 => "shift_jis".into(),
        949 => "euc-kr".into(),
        874 => "windows-874".into(),
        other => format!("windows-{other}"),
    }
}

/// Windows TeX engines can write paths in the system ANSI code page. Decodes each line
/// separately so UTF-8 paths in the same file keep their spelling; `fallback` is an encoding
/// label (`windows_code_page_label`).
pub fn decode_synctex(bytes: &[u8], fallback: Option<&str>) -> String {
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_owned();
    }
    let legacy = fallback.and_then(|label| encoding_rs::Encoding::for_label(label.as_bytes()));
    let lines: Vec<String> = bytes
        .split(|&b| b == b'\n')
        .map(|raw| match std::str::from_utf8(raw) {
            Ok(line) => line.to_owned(),
            Err(_) => legacy
                .and_then(|e| e.decode_without_bom_handling_and_without_replacement(raw))
                .map_or_else(
                    || String::from_utf8_lossy(raw).into_owned(),
                    std::borrow::Cow::into_owned,
                ),
        })
        .collect();
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_each_line_on_its_own() {
        // "é" in UTF-8 on one line, "中" in GBK (0xD6 0xD0) on the next
        let bytes = b"Input:1:/a/\xC3\xA9.tex\nInput:2:/b/\xD6\xD0.tex";
        assert_eq!(
            decode_synctex(bytes, Some(&windows_code_page_label(936))),
            "Input:1:/a/é.tex\nInput:2:/b/中.tex"
        );
        assert_eq!(
            decode_synctex(bytes, None),
            "Input:1:/a/é.tex\nInput:2:/b/\u{FFFD}\u{FFFD}.tex"
        );
        // windows-1252: 0xE9 is é
        assert_eq!(
            decode_synctex(b"x\xE9", Some(&windows_code_page_label(1252))),
            "xé"
        );
    }

    #[test]
    fn every_pattern_compiles() {
        for re in [&RECORD, &INPUT, &PREAMBLE] {
            let _ = re.is_match("");
        }
    }
}
