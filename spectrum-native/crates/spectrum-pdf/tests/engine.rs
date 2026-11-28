//! The PDFium thread on a real pdfLaTeX PDF (`fixtures/three-pages.pdf`). Skips, saying why,
//! when PDFium hasn't been fetched (`cargo xtask fetch-pdfium`).

use futures::executor::block_on;
use spectrum_pdf::{PageColour, PdfDoc, PdfEngine, PdfError, PixelRect, RenderRequest};
use std::path::PathBuf;

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/three-pages.pdf")
}

fn engine() -> Option<PdfEngine> {
    match PdfEngine::shared() {
        Ok(engine) => Some(engine),
        Err(e) => {
            eprintln!("skipped: {e}");
            None
        }
    }
}

fn full(doc: &PdfDoc, page: u32, scale: f32, colour: PageColour) -> RenderRequest {
    let (width, height) = spectrum_pdf::page_pixels(doc.pages[page as usize], scale);
    RenderRequest {
        doc: doc.id,
        page,
        scale,
        colour,
        rects: vec![PixelRect {
            x: 0,
            y: 0,
            width,
            height,
        }],
    }
}

fn pixel(bgra: &[u8], width: u32, x: u32, y: u32) -> [u8; 3] {
    let i = ((y * width + x) * 4) as usize;
    [bgra[i + 2], bgra[i + 1], bgra[i]]
}

#[test]
fn opens_a_multi_page_pdf_with_its_page_sizes() {
    let Some(engine) = engine() else { return };
    let doc = block_on(engine.open(fixture())).unwrap();
    assert_eq!(doc.pages.len(), 3);
    let (a5w, a5h) = (419.53, 595.28);
    assert!((doc.pages[0].width - a5w).abs() < 0.1 && (doc.pages[0].height - a5h).abs() < 0.1);
    assert!(
        (doc.pages[2].width - a5h).abs() < 0.1,
        "page 3 is landscape"
    );
    let again = block_on(engine.open(fixture())).unwrap();
    assert_ne!(doc.id, again.id, "a reload is a new document");
    engine.close(doc.id);
    engine.close(again.id);
}

#[test]
fn renders_pages_and_regions_with_colours() {
    let Some(engine) = engine() else { return };
    let doc = block_on(engine.open(fixture())).unwrap();
    let request = full(&doc, 1, 1.5, PageColour::White);
    let rect = request.rects[0];
    let page = block_on(engine.render(request)).unwrap().remove(0);
    assert_eq!(page.bgra.len(), (rect.width * rect.height * 4) as usize);
    assert_eq!(pixel(&page.bgra, rect.width, 2, 2), [255, 255, 255]);
    let inked = page
        .bgra
        .as_chunks::<4>()
        .0
        .iter()
        .filter(|p| p[0] < 128 && p[2] > 200) // the red curve and orange dots
        .count();
    assert!(inked > 100, "the TikZ figure is drawn ({inked} red pixels)");

    // a region is the same pixels as that part of the whole page
    let region = PixelRect {
        x: 100,
        y: 150,
        width: 200,
        height: 120,
    };
    let tile = block_on(engine.render(RenderRequest {
        rects: vec![region],
        ..full(&doc, 1, 1.5, PageColour::White)
    }))
    .unwrap()
    .remove(0);
    let mut differ = 0;
    for y in 0..region.height {
        for x in 0..region.width {
            let a = pixel(&tile.bgra, region.width, x, y);
            let b = pixel(&page.bgra, rect.width, region.x + x, region.y + y);
            if a.iter().zip(b).any(|(a, b)| a.abs_diff(b) > 8) {
                differ += 1;
            }
        }
    }
    assert!(differ < 20, "{differ} pixels differ from the full render");

    let dark = block_on(engine.render(full(&doc, 0, 1., PageColour::Dark)))
        .unwrap()
        .remove(0);
    assert_eq!(
        pixel(&dark.bgra, dark.rect.width, 1, 1),
        PageColour::Dark.paper()
    );
    engine.close(doc.id);
}

#[test]
fn errors_say_what_happened() {
    let Some(engine) = engine() else { return };
    let missing = block_on(engine.open("/no/such/file.pdf"));
    assert!(matches!(missing, Err(PdfError::Open { .. })));
    let dir = std::env::temp_dir().join(format!("spectrum-pdf-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let half = dir.join("half.pdf");
    let bytes = std::fs::read(fixture()).unwrap();
    std::fs::write(&half, &bytes[..bytes.len() / 3]).unwrap();
    // a half-written PDF either opens what it can or fails; it never takes the engine down
    let _ = block_on(engine.open(&half));
    std::fs::write(&half, b"not a pdf").unwrap();
    assert!(matches!(
        block_on(engine.open(&half)),
        Err(PdfError::Open { .. })
    ));
    let doc = block_on(engine.open(fixture())).unwrap();
    engine.close(doc.id);
    let closed = block_on(engine.render(full(&doc, 0, 1., PageColour::White)));
    assert!(matches!(closed, Err(PdfError::Closed)));
    let _ = std::fs::remove_dir_all(dir);
}
