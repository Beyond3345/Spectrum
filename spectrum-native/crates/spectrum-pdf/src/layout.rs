//! Where pages sit in the scrolling column and which tiles a view needs: plain geometry, shared by
//! the panel and the perf test. Units are logical pixels (1 at 100% zoom = 1 PDF point) unless a
//! name says device pixels.

use crate::engine::{PageSize, PixelRect, page_pixels};
use std::ops::Range;

/// Padding round the column and the gap between pages (2.8's `.pdf-pages`).
pub const PAD: f32 = 12.;
pub const GAP: f32 = 12.;
/// 2.8's zoom range; the fit modes are kept in it too.
pub const MIN_ZOOM: f32 = 0.1;
pub const MAX_ZOOM: f32 = 4.;
/// Tile side in device pixels: a page up to this size is one tile and one PDFium pass.
pub const TILE: u32 = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum Zoom {
    /// The first page as wide as the column (2.8's default).
    #[default]
    FitWidth,
    /// The whole first page in view.
    FitPage,
    /// 1 = 100%.
    Scale(f32),
}

impl Zoom {
    /// 2.8's zoom step: ×1.1 per step from the scale showing, to two decimals.
    pub fn stepped(scale: f32, steps: i32) -> Self {
        let to = (scale * 1.1f32.powi(steps)).clamp(MIN_ZOOM, MAX_ZOOM);
        Self::Scale((to * 100.).round() / 100.)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    fn intersects(&self, o: &Rect) -> bool {
        self.x < o.x + o.w && o.x < self.x + self.w && self.y < o.y + o.h && o.y < self.y + self.h
    }
}

/// One tile a view wants: its grid cell and pixels at the render scale.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WantedTile {
    pub page: u32,
    pub tile: (u32, u32),
    pub rect: PixelRect,
}

#[derive(Debug, Clone, Default)]
pub struct Layout {
    /// Logical pixels per point.
    pub scale: f32,
    pub sizes: Vec<PageSize>,
    /// Each page's box in the column.
    pub pages: Vec<Rect>,
    pub width: f32,
    pub height: f32,
}

impl Layout {
    /// Pages in a centred column for a `viewport` (w, h) of logical pixels.
    pub fn new(sizes: &[PageSize], zoom: Zoom, viewport: (f32, f32)) -> Self {
        let first = sizes.first().copied().unwrap_or(PageSize {
            width: 612.,
            height: 792.,
        });
        let fit_width = (viewport.0 - PAD * 2.) / first.width;
        let scale = match zoom {
            Zoom::Scale(s) => s,
            Zoom::FitWidth => fit_width,
            Zoom::FitPage => fit_width.min((viewport.1 - PAD * 2.) / first.height),
        }
        .clamp(MIN_ZOOM, MAX_ZOOM);
        let widest = sizes.iter().map(|s| s.width).fold(0., f32::max) * scale;
        let width = viewport.0.max(widest + PAD * 2.);
        let mut y = PAD;
        let pages = sizes
            .iter()
            .map(|s| {
                let (w, h) = (s.width * scale, s.height * scale);
                let rect = Rect {
                    x: ((width - w) / 2.).round(),
                    y,
                    w,
                    h,
                };
                y += h + GAP;
                rect
            })
            .collect();
        Self {
            scale,
            sizes: sizes.to_vec(),
            pages,
            width,
            height: y - GAP + PAD,
        }
    }

    /// The pages whose boxes meet `top..bottom`.
    pub fn visible(&self, top: f32, bottom: f32) -> Range<usize> {
        let start = self.pages.partition_point(|p| p.y + p.h < top);
        let end = self.pages.partition_point(|p| p.y <= bottom);
        start..end.max(start)
    }

    /// The page at height `y` (the one below a gap), clamped to the last.
    pub fn page_at(&self, y: f32) -> usize {
        self.pages
            .partition_point(|p| p.y + p.h + GAP <= y)
            .min(self.pages.len().saturating_sub(1))
    }

    /// The render scale (device pixels per point) in thousandths, the cache's scale bucket.
    pub fn bucket(&self, scale_factor: f32) -> u32 {
        (self.scale * scale_factor * 1000.).round() as u32
    }

    /// The tiles for a view at `scroll` (x, y) of `viewport` (w, h), with half a viewport more
    /// above and below so scrolling finds pages ready. Nearest the view's middle first.
    pub fn wanted(&self, scroll: (f32, f32), viewport: (f32, f32), bucket: u32) -> Vec<WantedTile> {
        let band = Rect {
            x: scroll.0,
            y: scroll.1 - viewport.1 / 2.,
            w: viewport.0,
            h: viewport.1 * 2.,
        };
        let middle = scroll.1 + viewport.1 / 2.;
        let render_scale = bucket as f32 / 1000.;
        let mut out = Vec::new();
        for page in self.visible(band.y, band.y + band.h) {
            let (bx, size) = (self.pages[page], self.sizes[page]);
            let (pw, ph) = page_pixels(size, render_scale);
            let (fx, fy) = (pw as f32 / bx.w, ph as f32 / bx.h);
            for row in 0..ph.div_ceil(TILE) {
                for col in 0..pw.div_ceil(TILE) {
                    let rect = PixelRect {
                        x: col * TILE,
                        y: row * TILE,
                        width: TILE.min(pw - col * TILE),
                        height: TILE.min(ph - row * TILE),
                    };
                    let shown = Rect {
                        x: bx.x + rect.x as f32 / fx,
                        y: bx.y + rect.y as f32 / fy,
                        w: rect.width as f32 / fx,
                        h: rect.height as f32 / fy,
                    };
                    if shown.intersects(&band) {
                        out.push((
                            (shown.y + shown.h / 2. - middle).abs(),
                            WantedTile {
                                page: page as u32,
                                tile: (col, row),
                                rect,
                            },
                        ));
                    }
                }
            }
        }
        out.sort_by(|a, b| a.0.total_cmp(&b.0));
        out.into_iter().map(|(_, t)| t).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A4: PageSize = PageSize {
        width: 595.,
        height: 842.,
    };

    #[test]
    fn fit_width_and_fit_page_follow_2_8() {
        let layout = Layout::new(&[A4; 3], Zoom::FitWidth, (619., 500.));
        assert!((layout.scale - 1.).abs() < 1e-6);
        assert_eq!(layout.pages[0].y, PAD);
        assert_eq!(layout.pages[1].y, PAD + 842. + GAP);
        assert_eq!(layout.height, PAD * 2. + 842. * 3. + GAP * 2.);
        let fit = Layout::new(&[A4; 3], Zoom::FitPage, (619., 866.));
        assert!((fit.scale - 1.).abs() < 1e-6);
        let tiny = Layout::new(&[A4], Zoom::FitWidth, (20., 20.));
        assert_eq!(tiny.scale, MIN_ZOOM);
    }

    #[test]
    fn zoom_steps_by_a_tenth() {
        assert_eq!(Zoom::stepped(1., 1), Zoom::Scale(1.1));
        assert_eq!(Zoom::stepped(1., -1), Zoom::Scale(0.91));
        assert_eq!(Zoom::stepped(3.9, 2), Zoom::Scale(MAX_ZOOM));
    }

    #[test]
    fn wide_pages_centre_and_widen_the_column() {
        let layout = Layout::new(&[A4], Zoom::Scale(2.), (600., 400.));
        assert_eq!(layout.width, 595. * 2. + PAD * 2.);
        assert_eq!(layout.pages[0].x, PAD);
        let narrow = Layout::new(&[A4], Zoom::Scale(0.5), (600., 400.));
        assert_eq!(narrow.pages[0].x, ((600. - 297.5) / 2f32).round());
    }

    #[test]
    fn finds_visible_pages_and_the_page_at_a_height() {
        let layout = Layout::new(&[A4; 10], Zoom::Scale(1.), (619., 500.));
        assert_eq!(layout.visible(0., 500.), 0..1);
        assert_eq!(layout.visible(800., 900.), 0..2);
        assert_eq!(layout.page_at(0.), 0);
        assert_eq!(layout.page_at(PAD + 842. + GAP + 1.), 1);
        assert_eq!(layout.page_at(1e9), 9);
    }

    #[test]
    fn wants_tiles_near_the_view_first_and_bounds_them() {
        // 100% on a 2× screen: 1190 × 1684 px pages, a 2 × 2 grid each
        let layout = Layout::new(&[A4; 100], Zoom::Scale(1.), (619., 800.));
        let bucket = layout.bucket(2.);
        assert_eq!(bucket, 2000);
        let scroll = (0., layout.pages[50].y);
        let wanted = layout.wanted(scroll, (619., 800.), bucket);
        assert_eq!(wanted[0].page, 50, "the page in view comes first");
        assert!(wanted.iter().all(|t| (49..=52).contains(&t.page)));
        assert!(wanted.iter().any(|t| t.page == 49), "half a view above");
        let edge = wanted
            .iter()
            .find(|t| t.tile == (1, 1))
            .map(|t| t.rect)
            .unwrap();
        assert_eq!((edge.width, edge.height), (1190 - TILE, 1684 - TILE));
        let bytes: u32 = wanted
            .iter()
            .map(|t| t.rect.width * t.rect.height * 4)
            .sum();
        assert!(bytes < 64 << 20, "{bytes} bytes for one view");
    }
}
