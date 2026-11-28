//! Inverse search: a point in the PDF to the source line under it, as the synctex tool answers.

use super::{Rect, Sheet, SyncHit, Synctex, fround, rect};

/// JavaScript's `Infinity` in 2.8: "not measurable", which still ties with itself.
const FAR: i64 = i64::MAX;

#[derive(Clone, Copy)]
struct Hit {
    h: i64,
    v: i64,
}

/// A record and its distance from the hit.
type Near = (usize, i64);

fn span(at: i64, min: i64, max: i64) -> i64 {
    if at < min {
        min - at
    } else if at > max {
        max - at
    } else {
        0
    }
}

// Manhattan distance to a rectangle, with the tool's edge tests
fn to_rect(hit: Hit, r: Rect) -> i64 {
    let dh = if hit.h < r.x0 {
        r.x0 - hit.h
    } else if hit.h <= r.x1 {
        0
    } else {
        hit.h - r.x1
    };
    let dv = if hit.v < r.y0 {
        r.y0 - hit.v
    } else if hit.v <= r.y1 {
        0
    } else {
        hit.v - r.y1
    };
    dh + dv
}

impl Sheet {
    fn has_kids(&self, n: usize) -> bool {
        !self.kids(n).is_empty()
    }

    fn declared(&self, n: usize) -> Rect {
        let node = &self.nodes[n];
        rect(
            node.h,
            node.h + node.w.abs(),
            node.v - node.ht.abs(),
            node.v + node.d.abs(),
        )
    }

    // leaves are as tall and deep as the box they sit in
    fn parent_height(&self, n: usize) -> i64 {
        let Some(p) = self.nodes[n].parent else {
            return 0;
        };
        let p = &self.nodes[p];
        if p.t == b'(' { p.v - p.y0 } else { p.ht.abs() }
    }

    fn parent_depth(&self, n: usize) -> i64 {
        let Some(p) = self.nodes[n].parent else {
            return 0;
        };
        let p = &self.nodes[p];
        if p.t == b'(' { p.y1 - p.v } else { p.d.abs() }
    }

    /// Signed horizontal distance: > 0 when the record is right of the hit, < 0 left, 0 across it.
    fn h_ordered(&self, hit: Hit, n: usize) -> i64 {
        let node = &self.nodes[n];
        match node.t {
            b'(' => span(hit.h, node.x0, node.x1),
            b'[' | b'h' | b'v' => span(hit.h, node.h, node.h + node.w.abs()),
            b'k' => {
                // a kern rarely holds text: measure to its nearer edge, a little further than
                // anything else
                let min = node.h.min(node.h - node.w);
                let max = node.h.max(node.h - node.w);
                if hit.h < min {
                    min - hit.h + 1
                } else if hit.h > max {
                    max - hit.h - 1
                } else if hit.h > i64::midpoint(min, max) {
                    max - hit.h + 1
                } else {
                    min - hit.h - 1
                }
            }
            b'r' | b'g' | b'$' | b'x' | b'b' => node.h - hit.h,
            _ => FAR,
        }
    }

    /// Signed vertical distance: > 0 when the record is below the hit, < 0 above, 0 level with it.
    fn v_ordered(&self, hit: Hit, n: usize) -> i64 {
        let node = &self.nodes[n];
        match node.t {
            b'(' => span(hit.v, node.y0, node.y1),
            b'[' | b'h' | b'v' => span(hit.v, node.v - node.ht.abs(), node.v + node.d.abs()),
            b'r' | b'k' | b'g' | b'$' => span(
                hit.v,
                node.v - self.parent_height(n),
                node.v + self.parent_depth(n),
            ),
            _ => FAR,
        }
    }

    fn in_box(&self, hit: Hit, n: usize) -> bool {
        self.h_ordered(hit, n) == 0 && self.v_ordered(hit, n) == 0
    }

    fn distance(&self, hit: Hit, n: usize) -> i64 {
        let node = &self.nodes[n];
        let stroke = |h: i64| to_rect(hit, rect(h, h, node.v - self.parent_height(n), node.v));
        match node.t {
            b'(' => to_rect(hit, self.extent(n)),
            b'[' => to_rect(hit, self.declared(n)),
            b'h' | b'v' => {
                let r = self.declared(n);
                to_rect(hit, Rect { x1: r.x0, ..r }).min(to_rect(hit, Rect { x0: r.x1, ..r }))
            }
            b'k' => stroke(node.h).min(stroke(node.h - node.w)),
            b'g' | b'$' | b'x' | b'b' => stroke(node.h),
            _ => FAR,
        }
    }

    /// Of two hboxes holding the hit: the smaller area, then the wider, then the shorter.
    fn smaller(&self, a: usize, b: usize) -> usize {
        let (ra, rb) = (self.extent(a), self.extent(b));
        let (wa, wb) = (ra.x1 - ra.x0, rb.x1 - rb.x0);
        let (ha, hb) = (ra.y1 - ra.y0, rb.y1 - rb.y0);
        if wa * ha != wb * hb {
            return if wa * ha < wb * hb { a } else { b };
        }
        if wa != wb {
            return if wa > wb { a } else { b };
        }
        if hb < ha { b } else { a }
    }

    fn deepest_container(&self, hit: Hit, n: usize) -> Option<usize> {
        if !self.has_kids(n) {
            return None;
        }
        for &kid in self.kids(n) {
            if self.in_box(hit, kid)
                && let Some(deeper) = self.deepest_container(hit, kid)
            {
                return Some(deeper);
            }
        }
        if self.nodes[n].t == b'[' {
            let mut best = None;
            let mut best_distance = FAR;
            for &kid in self.kids(n) {
                if !self.has_kids(kid) {
                    continue;
                }
                let d = self.distance(hit, kid);
                if d <= best_distance {
                    (best, best_distance) = (Some(kid), d);
                }
            }
            if best.is_some() {
                return best;
            }
        }
        self.in_box(hit, n).then_some(n)
    }

    // the same search used to refine a neighbour, which differs in small ways
    fn deepest_container_nd(&self, hit: Hit, n: usize) -> Option<Near> {
        if !self.has_kids(n) {
            return None;
        }
        for &kid in self.kids(n) {
            if let Some(deeper) = self.deepest_container_nd(hit, kid) {
                return Some(deeper);
            }
        }
        if self.nodes[n].t == b'[' {
            let mut best: Option<Near> = None;
            for &kid in self.kids(n) {
                if !self.has_kids(kid) {
                    continue;
                }
                let d = self.distance(hit, kid);
                if best.is_none_or(|(_, bd)| d < bd) {
                    best = Some((kid, d));
                }
            }
            if best.is_some() {
                return best;
            }
        }
        self.in_box(hit, n).then_some((n, 0))
    }

    /// The leaf anywhere under `n` nearest the hit; on a tie the later one wins, unless it's a kern.
    fn closest_deep_child(&self, hit: Hit, n: usize) -> (Option<usize>, i64) {
        let mut best = (None, FAR);
        for &kid in self.kids(n) {
            let nd = if b"([hv".contains(&self.nodes[kid].t) {
                self.closest_deep_child(hit, kid)
            } else {
                (Some(kid), self.distance(hit, kid))
            };
            let kern = nd.0.is_some_and(|k| self.nodes[k].t == b'k');
            if nd.1 < best.1 || (nd.1 == best.1 && !kern) {
                best = nd;
            }
        }
        best
    }

    /// The nearest records left and right of the hit among an hbox's kids.
    fn closest_kids(&self, hit: Hit, b: usize) -> (Option<Near>, Option<Near>) {
        // the tool's vbox version never looks at the kids
        if self.nodes[b].t != b'(' {
            return (None, None);
        }
        // on a tie, the earlier line (then column) of the same file wins
        let better = |best: Option<Near>, kid: usize, d: i64| {
            let Some((node, bd)) = best else { return true };
            let (best, kid) = (&self.nodes[node], &self.nodes[kid]);
            d < bd
                || (d == bd
                    && best.tag == kid.tag
                    && (best.line > kid.line || (best.line == kid.line && best.col > kid.col)))
        };
        let (mut l, mut r) = (None, None);
        for &kid in self.kids(b) {
            let s = self.h_ordered(hit, kid);
            if s > 0 && better(r, kid, s) {
                r = Some((kid, s));
            }
            if s == 0 {
                if self.has_kids(kid) {
                    return self.closest_kids(hit, kid);
                }
                l = Some((kid, 0));
            }
            if s < 0 && better(l, kid, -s) {
                l = Some((kid, -s));
            }
        }
        let refine = |nd: Option<Near>| {
            let mut nd = nd?;
            if let Some(inside) = self.deepest_container_nd(hit, nd.0) {
                nd = inside;
            }
            Some(match self.closest_deep_child(hit, nd.0) {
                (Some(leaf), _) => (leaf, nd.1),
                (None, _) => nd,
            })
        };
        (refine(l), refine(r))
    }

    /// The record the synctex tool answers first for a hit (in file units).
    fn edit_node(&self, hit: Hit) -> Option<usize> {
        // hboxes as the tool chains them: the last one to close comes first
        let mut hboxes = self.hboxes.iter().rev().copied();
        let Some(first) = hboxes.by_ref().find(|&b| self.in_box(hit, b)) else {
            let page = self.kids(0).first()?;
            return self.closest_deep_child(hit, *page).0;
        };
        let mut b = first;
        for next in hboxes {
            if self.in_box(hit, next) {
                b = self.smaller(next, b);
            }
        }
        b = self.deepest_container(hit, b).unwrap_or(b);
        let (mut l, r) = self.closest_kids(hit, b);
        if let (Some((ln, ld)), Some((rn, rd))) = (l, r) {
            let (left, right) = (&self.nodes[ln], &self.nodes[rn]);
            let differ = left.tag != right.tag || left.line != right.line || left.col != right.col;
            let take_right = if differ {
                right.line < left.line || (right.line == left.line && ld > rd)
            } else {
                ld > rd
            };
            if take_right {
                l = r;
            }
        }
        Some(l.or(r).map_or(b, |(n, _)| n))
    }
}

impl Synctex {
    /// The source place under a point on a page (1-based; x and y in points from the top left).
    #[allow(
        clippy::cast_possible_truncation,
        reason = "truncated to whole units, as the tool does"
    )]
    pub fn inverse(&self, page: i64, x: f64, y: f64) -> Option<SyncHit> {
        let sheet = self.sheet(page)?;
        // single precision, truncated to whole units, as the tool does it
        let at =
            |p: f64, offset: f64| fround(fround(fround(p) - offset) / self.unit).trunc() as i64;
        let n = sheet.edit_node(Hit {
            h: at(x, self.x_offset),
            v: at(y, self.y_offset),
        })?;
        let node = &sheet.nodes[n];
        Some(SyncHit {
            tag: node.tag,
            line: node.line,
            column: (node.col >= 0).then_some(node.col),
        })
    }
}
