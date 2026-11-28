//! Release-mode timings: drawing a page, and scrolling a 100-page vector-heavy PDF top to bottom
//! through the layout, the PDFium thread and the 128 MB tile cache, as the panel does.
//!
//!     cargo test --release -p spectrum-pdf --test perf -- --ignored --nocapture
//!
//! The PDF is generated (400 coloured Bézier strokes, a filled plot and 40 lines of text a page,
//! like a TikZ-heavy paper). `SPECTRUM_PDF_PERF=<file.pdf>` times another PDF instead.

// timing arithmetic on small numbers
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]

use futures::executor::block_on;
use spectrum_pdf::cache::{DEFAULT_BUDGET, Focus, TileCache, TileKey};
use spectrum_pdf::layout::{Layout, Zoom};
use spectrum_pdf::{PageColour, PdfEngine, RenderRequest};
use std::fmt::Write as _;
use std::path::PathBuf;
use std::time::{Duration, Instant};

/// A minimal PDF: A4 pages with one content stream each and Helvetica.
fn write_pdf(pages: usize) -> Vec<u8> {
    let mut seed = 7u32;
    let mut rand = move |max: f32| {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (seed >> 8) as f32 / (1u32 << 24) as f32 * max
    };
    let mut objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_owned(),
        String::new(), // the page tree, once the pages are numbered
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_owned(),
    ];
    let mut kids = Vec::new();
    for p in 0..pages {
        let mut s = String::new();
        for _ in 0..400 {
            let _ = writeln!(
                s,
                "{:.3} {:.3} {:.3} RG {:.2} w {:.1} {:.1} m {:.1} {:.1} {:.1} {:.1} {:.1} {:.1} c S",
                rand(1.),
                rand(1.),
                rand(1.),
                0.2 + rand(1.5),
                40. + rand(515.),
                300. + rand(500.),
                40. + rand(515.),
                300. + rand(500.),
                40. + rand(515.),
                300. + rand(500.),
                40. + rand(515.),
                300. + rand(500.),
            );
        }
        s.push_str("0.8 0.85 1 rg 60 120 m");
        for i in 0..200 {
            let _ = write!(s, " {:.1} {:.1} l", 60. + i as f32 * 2.4, 120. + rand(140.));
        }
        s.push_str(" 540 120 l f\n0 g BT /F1 9 Tf 12 TL 60 290 Td\n");
        for line in 0..40 {
            let _ = writeln!(
                s,
                "(Page {} line {line}: the quick brown fox jumps over the lazy dog, again and again.) '",
                p + 1
            );
        }
        s.push_str("ET\n");
        let content = objects.len() + 2;
        objects.push(format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {content} 0 R >>"
        ));
        kids.push(format!("{} 0 R", objects.len()));
        objects.push(format!("<< /Length {} >>\nstream\n{s}endstream", s.len()));
    }
    objects[1] = format!(
        "<< /Type /Pages /Kids [{}] /Count {pages} >>",
        kids.join(" ")
    );
    let mut pdf = b"%PDF-1.7\n".to_vec();
    let mut offsets = Vec::new();
    for (i, body) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n{body}\nendobj\n", i + 1).as_bytes());
    }
    let xref = pdf.len();
    let mut tail = format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1);
    for o in offsets {
        let _ = writeln!(tail, "{o:010} 00000 n ");
    }
    let _ = write!(
        tail,
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
        objects.len() + 1
    );
    pdf.extend_from_slice(tail.as_bytes());
    pdf
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.
}

#[test]
#[ignore = "release-mode timing; run with --ignored --nocapture"]
fn page_render_and_scrolling_100_pages() {
    let engine = match PdfEngine::shared() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("skipped: {e}");
            return;
        }
    };
    let path = std::env::var_os("SPECTRUM_PDF_PERF").map_or_else(
        || {
            let path = std::env::temp_dir().join("spectrum-pdf-perf-100.pdf");
            std::fs::write(&path, write_pdf(100)).unwrap();
            path
        },
        PathBuf::from,
    );

    let start = Instant::now();
    let doc = block_on(engine.open(&path)).unwrap();
    eprintln!(
        "open {} pages: {:.1} ms",
        doc.pages.len(),
        ms(start.elapsed())
    );

    // a full page at fit width in a 700 px pane on a 2× screen, light and dark
    let viewport = (700., 900.);
    let layout = Layout::new(&doc.pages, Zoom::FitWidth, viewport);
    let bucket = layout.bucket(2.);
    for colour in [PageColour::White, PageColour::Dark] {
        let mut times = Vec::new();
        for page in 0..5 {
            let (width, height) = spectrum_pdf::page_pixels(doc.pages[page], bucket as f32 / 1000.);
            let start = Instant::now();
            block_on(engine.render(RenderRequest {
                doc: doc.id,
                page: page as u32,
                scale: bucket as f32 / 1000.,
                colour,
                rects: vec![spectrum_pdf::PixelRect {
                    x: 0,
                    y: 0,
                    width,
                    height,
                }],
            }))
            .unwrap();
            times.push(ms(start.elapsed()));
        }
        let (w, h) = spectrum_pdf::page_pixels(doc.pages[0], bucket as f32 / 1000.);
        eprintln!(
            "one page {w}×{h} px, {colour:?}: first {:.1} ms, mean of next 4 {:.1} ms",
            times[0],
            times[1..].iter().sum::<f64>() / 4.
        );
    }

    // scroll top to bottom 150 px a step, drawing what the panel would ask for
    let mut cache: TileCache<()> = TileCache::new(DEFAULT_BUDGET);
    let (mut tiles, mut worst) = (0, Duration::ZERO);
    let start = Instant::now();
    let mut y = 0.;
    while y < layout.height - viewport.1 {
        let step = Instant::now();
        let page = layout.page_at(y + viewport.1 / 3.) as u32;
        let focus = Focus {
            doc: doc.id,
            page,
            scale: bucket,
            colour: PageColour::Dark,
        };
        let wanted = layout.wanted((0., y), viewport, bucket);
        let mut by_page: Vec<(u32, Vec<_>)> = Vec::new();
        for t in wanted {
            let key = TileKey {
                doc: doc.id,
                page: t.page,
                scale: bucket,
                colour: PageColour::Dark,
                tile: t.tile,
            };
            if cache.get(&key).is_some() {
                continue;
            }
            match by_page.iter_mut().find(|(p, _)| *p == t.page) {
                Some((_, v)) => v.push((key, t.rect)),
                None => by_page.push((t.page, vec![(key, t.rect)])),
            }
        }
        for (page, wanted) in by_page {
            let bitmaps = block_on(engine.render(RenderRequest {
                doc: doc.id,
                page,
                scale: bucket as f32 / 1000.,
                colour: PageColour::Dark,
                rects: wanted.iter().map(|w| w.1).collect(),
            }))
            .unwrap();
            for ((key, _), bitmap) in wanted.into_iter().zip(bitmaps) {
                tiles += 1;
                cache.insert(key, (), bitmap.bgra.len(), focus);
            }
        }
        worst = worst.max(step.elapsed());
        y += 150.;
    }
    eprintln!(
        "scrolled {} pages in {:.0} ms: {tiles} tiles drawn, slowest step {:.1} ms; cache peak {:.1} MB (budget {} MB), now {:.1} MB",
        doc.pages.len(),
        ms(start.elapsed()),
        ms(worst),
        cache.peak() as f64 / f64::from(1 << 20),
        DEFAULT_BUDGET >> 20,
        cache.bytes() as f64 / f64::from(1 << 20),
    );
    assert!(cache.peak() <= DEFAULT_BUDGET);
    engine.close(doc.id);
}
