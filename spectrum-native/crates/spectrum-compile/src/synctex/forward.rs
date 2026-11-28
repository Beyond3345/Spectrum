//! Forward search: a source line to the boxes it made in the PDF.

use std::collections::{BTreeMap, HashMap, HashSet};

use super::{Rect, Sheet, SyncBox, Synctex};

type Hits = HashMap<i64, Vec<(usize, usize)>>;

impl Sheet {
    /// How tall a box is: an hbox as far as what it holds reaches, a vbox as TeX made it.
    fn size(&self, n: usize) -> i64 {
        let node = &self.nodes[n];
        if node.t == b'(' {
            node.y1 - node.y0
        } else {
            node.ht + node.d
        }
    }

    /// The typeset line a record sits on: the outermost hbox around it below a vbox or the page.
    fn line_box(&self, n: usize) -> Option<usize> {
        let mut b = self.nodes[n].parent?;
        while let Some(p) = self.nodes[b].parent.filter(|&p| self.nodes[p].t == b'(') {
            b = p;
        }
        (self.nodes[b].t == b'(').then_some(b)
    }
}

// a box inside another (an integral's limits in its equation, a footnote mark in its line) is part of it
fn within(a: &SyncBox, b: &SyncBox) -> bool {
    a.x >= b.x - 1.0
        && a.y >= b.y - 1.0
        && a.x + a.width <= b.x + b.width + 1.0
        && a.y + a.height <= b.y + b.height + 1.0
}

struct Walk<'a> {
    sheet: &'a Sheet,
    index: usize,
    tags: &'a HashSet<i64>,
    line: i64,
    page: usize,
    body: Option<usize>,
}

impl Walk<'_> {
    fn in_body(&self, n: Option<usize>) -> bool {
        let Some(body) = self.body else { return true };
        let Some(n) = n else { return false };
        // the box around two columns
        if self.sheet.size(n) >= self.sheet.size(body) {
            return false;
        }
        let mut p = self.sheet.nodes[n].parent;
        while let Some(at) = p {
            if at == body {
                return true;
            }
            p = self.sheet.nodes[at].parent;
        }
        false
    }

    // the output routine tags the page, its header and footer with the line it shipped on
    fn shipped(&self, n: usize) -> bool {
        let (node, page) = (&self.sheet.nodes[n], &self.sheet.nodes[self.page]);
        node.tag == page.tag && node.line == page.line
    }

    fn walk(
        &self,
        n: usize,
        by_line: &mut Hits,
        furniture: &mut Hits,
        closed: &mut Vec<(usize, usize)>,
    ) {
        let sheet = self.sheet;
        for &kid in sheet.kids(n) {
            let node = &sheet.nodes[kid];
            // a vbox carries the line that closed it (\end{table}); not a column, nor the page
            if node.t == b'['
                && node.line == self.line
                && self.tags.contains(&node.tag)
                && !self.shipped(kid)
                && self
                    .body
                    .is_none_or(|b| sheet.size(kid) * 2 < sheet.size(b))
            {
                closed.push((self.index, kid));
            }
            if !sheet.kids(kid).is_empty() {
                self.walk(kid, by_line, furniture, closed);
            } else if node.t != b'b' && self.tags.contains(&node.tag) {
                // set aside: the header and footer, rules (a tabular's struts), which keep no
                // line of their own either, and line-end kerns, which carry the line that ended
                // the paragraph
                let junk = (self.shipped(kid)
                    && (node.t == b'r' || !self.in_body(sheet.line_box(kid))))
                    || (node.t == b'k' && node.w == 0);
                let into = if junk { &mut *furniture } else { &mut *by_line };
                into.entry(node.line).or_default().push((self.index, kid));
            }
        }
    }
}

impl Synctex {
    /// One rectangle per typeset line that `line` of the file (any of `tags`) made, or the box
    /// it closed, or the nearest line after it that made any, then the nearest before. Sorted
    /// by page, then down the page.
    pub fn forward(&self, tags: &HashSet<i64>, line: i64) -> Vec<SyncBox> {
        let mut by_line = Hits::new();
        let mut furniture = Hits::new();
        let mut closed = Vec::new();
        for (index, sheet) in self.sheets.iter().enumerate() {
            if sheet.page.is_none() {
                continue;
            }
            let Some(&page) = sheet.kids(0).first() else {
                continue;
            };
            // tectonic puts an empty hbox first
            let inner = sheet
                .kids(page)
                .iter()
                .copied()
                .find(|&k| sheet.nodes[k].t == b'[')
                .unwrap_or(page);
            let body = sheet
                .kids(inner)
                .iter()
                .copied()
                .filter(|&k| sheet.nodes[k].kids.is_some())
                .fold(None, |a: Option<usize>, b| match a {
                    Some(a) if sheet.size(b) <= sheet.size(a) => Some(a),
                    _ => Some(b),
                });
            let walk = Walk {
                sheet,
                index,
                tags,
                line,
                page,
                body,
            };
            walk.walk(0, &mut by_line, &mut furniture, &mut closed);
        }
        if by_line.is_empty() {
            by_line = furniture;
        }
        if !by_line.contains_key(&line)
            && let Some(&(index, n)) = closed.first()
        {
            // a line that only closes a box: the box, as far as the lines in it reach
            let sheet = &self.sheets[index];
            let mut area = Rect {
                x0: i64::MAX,
                x1: i64::MIN,
                y0: i64::MAX,
                y1: i64::MIN,
            };
            collect(sheet, n, &mut area);
            if area.x0 <= area.x1 {
                return vec![self.to_points(sheet.page.unwrap_or_default(), area)];
            }
        }
        let after = by_line.keys().copied().filter(|&l| l >= line).min();
        let Some(chosen) = after.or_else(|| by_line.keys().copied().max()) else {
            return Vec::new();
        };
        let mut seen = HashSet::new();
        let mut by_page: BTreeMap<i64, Vec<SyncBox>> = BTreeMap::new();
        for &(index, n) in by_line.get(&chosen).into_iter().flatten() {
            let sheet = &self.sheets[index];
            let Some(b) = sheet.line_box(n) else { continue };
            if !seen.insert((index, b)) {
                continue;
            }
            let page = sheet.page.unwrap_or_default();
            by_page
                .entry(page)
                .or_default()
                .push(self.to_points(page, sheet.extent(b)));
        }
        // of two boxes inside each other, the first one stays
        let mut merged: Vec<SyncBox> = by_page
            .values()
            .flat_map(|boxes| {
                boxes.iter().enumerate().filter_map(|(i, a)| {
                    let inside = boxes
                        .iter()
                        .enumerate()
                        .any(|(j, b)| j != i && within(a, b) && !(j > i && within(b, a)));
                    (!inside).then_some(*a)
                })
            })
            .collect();
        merged.sort_by(|a, b| {
            a.page
                .cmp(&b.page)
                .then(a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal))
        });
        merged
    }

    #[allow(clippy::cast_precision_loss, reason = "file units are far below 2^52")]
    fn to_points(&self, page: i64, b: Rect) -> SyncBox {
        let mut x = b.x0 as f64 * self.unit + self.x_offset;
        let mut y = b.y0 as f64 * self.unit + self.y_offset;
        let mut width = (b.x1 - b.x0) as f64 * self.unit;
        let mut height = (b.y1 - b.y0) as f64 * self.unit;
        // TeX can push a box past the paper's top or left edge
        if x < 0.0 {
            (width, x) = (width + x, 0.0);
        }
        if y < 0.0 {
            (height, y) = (height + y, 0.0);
        }
        SyncBox {
            page,
            x,
            y,
            width: width.max(0.0),
            height: height.max(0.0),
        }
    }
}

/// Grows `area` over the hboxes under `n`, not looking inside them.
fn collect(sheet: &Sheet, n: usize, area: &mut Rect) {
    for &k in sheet.kids(n) {
        let node = &sheet.nodes[k];
        if node.t == b'(' {
            area.x0 = area.x0.min(node.x0);
            area.x1 = area.x1.max(node.x1);
            area.y0 = area.y0.min(node.y0);
            area.y1 = area.y1.max(node.y1);
        } else if node.kids.is_some() {
            collect(sheet, k, area);
        }
    }
}
