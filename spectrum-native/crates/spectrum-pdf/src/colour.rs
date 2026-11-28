//! Page colours (Settings → Appearance → PDF pages), applied to rendered pixels on the PDFium
//! thread. Each is 2.8's CSS (`editor.css`, `[data-pdf-page]`) as a 3×3 colour matrix plus an
//! offset, so the pages look the same as in 2.8:
//!
//! - Cream / Sepia / Grey: the drawing multiplied onto paper of that colour (`mix-blend-mode: multiply`).
//! - Dark: `invert(0.88) hue-rotate(180deg)`; Black: `invert(1) hue-rotate(180deg)`. The ink turns
//!   light and colours keep their hue.
//! - Dimmed: `brightness(0.81)`, the page's own colours a little darker.

use spectrum_core::settings::{PdfPageDark, PdfPageLight};

/// How a page's pixels are tinted. `White` leaves them as PDFium draws them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum PageColour {
    #[default]
    White,
    Cream,
    Sepia,
    Grey,
    Dark,
    Black,
    Dimmed,
}

impl From<PdfPageLight> for PageColour {
    fn from(page: PdfPageLight) -> Self {
        match page {
            PdfPageLight::White => Self::White,
            PdfPageLight::Cream => Self::Cream,
            PdfPageLight::Sepia => Self::Sepia,
            PdfPageLight::Grey => Self::Grey,
        }
    }
}

impl From<PdfPageDark> for PageColour {
    fn from(page: PdfPageDark) -> Self {
        match page {
            PdfPageDark::Dark => Self::Dark,
            PdfPageDark::Black => Self::Black,
            PdfPageDark::Dimmed => Self::Dimmed,
            PdfPageDark::White => Self::White,
        }
    }
}

/// `hue-rotate(180deg)` from the Filter Effects spec (cos = −1, sin = 0), rows R, G, B.
const HUE_180: [[f32; 3]; 3] = [
    [-0.574, 1.430, 0.144],
    [0.426, 0.430, 0.144],
    [0.426, 1.430, -0.856],
];

impl PageColour {
    /// `out = m · rgb + offset`, all in 0–1 sRGB, clamped.
    fn matrix(self) -> ([[f32; 3]; 3], [f32; 3]) {
        let diag = |r: f32, g: f32, b: f32| ([[r, 0., 0.], [0., g, 0.], [0., 0., b]], [0.; 3]);
        let rgb = |hex: u32| {
            let c = |shift: u32| ((hex >> shift) & 0xff) as f32 / 255.;
            diag(c(16), c(8), c(0))
        };
        // invert(a) is a + (1 − 2a)·c per channel; hue-rotate's rows sum to 1, so it keeps a
        let invert_rotated = |a: f32| (HUE_180.map(|row| row.map(|v| v * (1. - 2. * a))), [a; 3]);
        match self {
            Self::White => diag(1., 1., 1.),
            Self::Cream => rgb(0xf8_f1e1),
            Self::Sepia => rgb(0xef_e0c2),
            Self::Grey => rgb(0xe3_e3e5),
            Self::Dark => invert_rotated(0.88),
            Self::Black => invert_rotated(1.),
            Self::Dimmed => diag(0.81, 0.81, 0.81),
        }
    }

    /// The colour of blank paper (white through the transform), `[r, g, b]`: what an undrawn
    /// page shows. Dark gives 2.8's `#1f1f1f`, Dimmed `#cfcfcf`.
    pub fn paper(self) -> [u8; 3] {
        let mut px = [255, 255, 255, 255];
        self.apply(&mut px);
        [px[2], px[1], px[0]]
    }

    /// Tints BGRA pixels in place. Alpha is left alone.
    pub(crate) fn apply(self, bgra: &mut [u8]) {
        if self == Self::White {
            return;
        }
        // 16.16 fixed point: lut[out][in][value], so a pixel is nine lookups and adds
        let (m, offset) = self.matrix();
        let mut lut = [[[0i32; 256]; 3]; 3];
        for (o, row) in m.iter().enumerate() {
            for (i, k) in row.iter().enumerate() {
                for (v, slot) in lut[o][i].iter_mut().enumerate() {
                    *slot = (k * v as f32 * 65536.).round() as i32;
                }
            }
        }
        let base = offset.map(|a| (a * 255. * 65536.).round() as i32 + 32768);
        let channel = |o: usize, r: u8, g: u8, b: u8| {
            let v = base[o]
                + lut[o][0][usize::from(r)]
                + lut[o][1][usize::from(g)]
                + lut[o][2][usize::from(b)];
            (v >> 16).clamp(0, 255) as u8
        };
        for px in bgra.as_chunks_mut::<4>().0 {
            let (b, g, r) = (px[0], px[1], px[2]);
            px[0] = channel(2, r, g, b);
            px[1] = channel(1, r, g, b);
            px[2] = channel(0, r, g, b);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tint(colour: PageColour, [r, g, b]: [u8; 3]) -> [u8; 3] {
        let mut px = [b, g, r, 255];
        colour.apply(&mut px);
        assert_eq!(px[3], 255, "alpha kept");
        [px[2], px[1], px[0]]
    }

    /// The CSS filter chain computed directly in floats, as a browser does.
    fn css(colour: PageColour, rgb: [u8; 3]) -> [u8; 3] {
        let c = rgb.map(|v| f32::from(v) / 255.);
        let (invert, rotate, scale) = match colour {
            PageColour::Dark => (0.88, true, [1.; 3]),
            PageColour::Black => (1., true, [1.; 3]),
            PageColour::Dimmed => (0., false, [0.81; 3]),
            PageColour::Cream => (0., false, [248. / 255., 241. / 255., 225. / 255.]),
            _ => (0., false, [1.; 3]),
        };
        let inv = c.map(|v| invert + v * (1. - 2. * invert));
        let out: [f32; 3] = if rotate {
            HUE_180.map(|row| row[0] * inv[0] + row[1] * inv[1] + row[2] * inv[2])
        } else {
            [inv[0] * scale[0], inv[1] * scale[1], inv[2] * scale[2]]
        };
        out.map(|v| (v.clamp(0., 1.) * 255.).round() as u8)
    }

    #[test]
    fn paper_matches_2_8() {
        assert_eq!(PageColour::White.paper(), [255, 255, 255]);
        assert_eq!(PageColour::Cream.paper(), [0xf8, 0xf1, 0xe1]);
        assert_eq!(PageColour::Sepia.paper(), [0xef, 0xe0, 0xc2]);
        assert_eq!(PageColour::Grey.paper(), [0xe3, 0xe3, 0xe5]);
        assert_eq!(PageColour::Dark.paper(), [0x1f, 0x1f, 0x1f]);
        assert_eq!(PageColour::Black.paper(), [0, 0, 0]);
        assert_eq!(PageColour::Dimmed.paper(), [0xcf, 0xcf, 0xcf]);
    }

    #[test]
    fn lut_matches_the_css_filters() {
        let samples = [
            [0, 0, 0],
            [255, 255, 255],
            [255, 0, 0],
            [0, 128, 255],
            [12, 200, 77],
            [180, 90, 30],
            [128, 128, 128],
        ];
        for colour in [
            PageColour::Dark,
            PageColour::Black,
            PageColour::Dimmed,
            PageColour::Cream,
        ] {
            for rgb in samples {
                let (got, want) = (tint(colour, rgb), css(colour, rgb));
                for c in 0..3 {
                    assert!(
                        got[c].abs_diff(want[c]) <= 1,
                        "{colour:?} {rgb:?}: {got:?} vs {want:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn dark_pages_turn_ink_light_and_keep_hue() {
        assert_eq!(tint(PageColour::Dark, [0, 0, 0]), [224, 224, 224]);
        assert_eq!(tint(PageColour::Black, [0, 0, 0]), [255, 255, 255]);
        let [r, g, b] = tint(PageColour::Dark, [200, 30, 30]);
        assert!(
            r > g + 60 && g.abs_diff(b) <= 1,
            "red stays red: {r} {g} {b}"
        );
        let [r, g, b] = tint(PageColour::Dark, [20, 60, 200]);
        assert!(b > r + 60 && b > g, "blue stays blue: {r} {g} {b}");
    }

    #[test]
    fn multiply_keeps_ink_dark() {
        assert_eq!(tint(PageColour::Sepia, [0, 0, 0]), [0, 0, 0]);
        assert_eq!(tint(PageColour::White, [10, 20, 30]), [10, 20, 30]);
    }

    #[test]
    fn settings_map_to_colours() {
        assert_eq!(PageColour::from(PdfPageDark::White), PageColour::White);
        assert_eq!(PageColour::from(PdfPageLight::Grey), PageColour::Grey);
    }
}
