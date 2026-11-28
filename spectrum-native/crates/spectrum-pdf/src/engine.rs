//! The PDFium actor: one thread owns the library and every open document, and works through a
//! crossbeam queue. PDFium isn't thread-safe and pdfium-render binds it once per process, so
//! [`PdfEngine::start`] starts that thread once and every handle shares it. No `unsafe` is needed:
//! pdfium-render's API is safe.
//!
//! A document is read into memory before PDFium opens it, so the file stays free for the next
//! compile to overwrite (Windows locks open files) and a half-written PDF fails cleanly. Reloading
//! is opening the new file as another document: the caller keeps showing the old one's tiles until
//! the new ones are ready, then closes the old one.

use crate::colour::PageColour;
use crossbeam_channel::{Receiver, Sender, unbounded};
use futures::channel::oneshot;
use pdfium_render::prelude::{PdfBitmap, PdfBitmapFormat, PdfDocument, PdfRenderConfig, Pdfium};
use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

#[derive(Debug, Clone, thiserror::Error)]
pub enum PdfError {
    #[error("PDFium isn't installed (looked for {0}); run `cargo xtask fetch-pdfium`")]
    NoLibrary(String),
    #[error("Couldn't load PDFium from {path}: {detail}")]
    Library { path: PathBuf, detail: String },
    #[error("Couldn't open {path}: {detail}")]
    Open { path: PathBuf, detail: String },
    #[error("Couldn't draw page {page}: {detail}")]
    Render { page: u32, detail: String },
    /// The document was closed, or the PDFium thread stopped.
    #[error("The PDF is no longer open")]
    Closed,
}

/// One open document. A reload is a new one, so it doubles as the document's version.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct DocId(u64);

#[cfg(test)]
impl DocId {
    pub(crate) fn test(id: u64) -> Self {
        Self(id)
    }
}

/// A page's size in PDF points (1/72 in), after its rotation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PageSize {
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone)]
pub struct PdfDoc {
    pub id: DocId,
    pub path: PathBuf,
    pub pages: Vec<PageSize>,
}

/// A rectangle in a page's pixels at some scale, from its top left.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PixelRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Rendered pixels: BGRA (PDFium's order and GPUI's), `rect.width * rect.height * 4` bytes, opaque.
#[derive(Debug, Clone)]
pub struct Bitmap {
    pub rect: PixelRect,
    pub bgra: Vec<u8>,
}

/// What to draw: regions of one page, so PDFium loads the page once for all of them.
#[derive(Debug, Clone)]
pub struct RenderRequest {
    pub doc: DocId,
    /// 0-based.
    pub page: u32,
    /// Pixels per point.
    pub scale: f32,
    pub colour: PageColour,
    pub rects: Vec<PixelRect>,
}

enum Job {
    Open(PathBuf, oneshot::Sender<Result<PdfDoc, PdfError>>),
    Render(
        RenderRequest,
        oneshot::Sender<Result<Vec<Bitmap>, PdfError>>,
    ),
    Close(DocId),
}

/// A handle on the PDFium thread. Cheap to clone; every method returns at once.
#[derive(Clone)]
pub struct PdfEngine {
    jobs: Sender<Job>,
}

static ENGINE: Mutex<Option<Sender<Job>>> = Mutex::new(None);

impl PdfEngine {
    /// The process's engine, starting it with the library [`find_library`] finds.
    pub fn shared() -> Result<Self, PdfError> {
        if let Some(jobs) = ENGINE
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
        {
            return Ok(Self { jobs });
        }
        let library = find_library().ok_or_else(|| {
            PdfError::NoLibrary(
                candidates()
                    .iter()
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
            )
        })?;
        Self::start(&library)
    }

    /// Starts the PDFium thread with the library at `library`, or returns the running one.
    pub fn start(library: &Path) -> Result<Self, PdfError> {
        let mut slot = ENGINE.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(jobs) = slot.clone() {
            return Ok(Self { jobs });
        }
        let (jobs, queue) = unbounded();
        let (ready, bound) = oneshot::channel();
        let path = library.to_path_buf();
        std::thread::Builder::new()
            .name("pdfium".into())
            .spawn(move || actor(&path, &queue, ready))
            .map_err(|e| PdfError::Library {
                path: library.to_path_buf(),
                detail: e.to_string(),
            })?;
        futures::executor::block_on(bound).map_err(|_| PdfError::Closed)??;
        *slot = Some(jobs.clone());
        Ok(Self { jobs })
    }

    /// Reads and opens the PDF at `path`.
    pub fn open(
        &self,
        path: impl Into<PathBuf>,
    ) -> impl Future<Output = Result<PdfDoc, PdfError>> + Send + 'static {
        let (reply, answer) = oneshot::channel();
        let _ = self.jobs.send(Job::Open(path.into(), reply));
        async move { answer.await.map_err(|_| PdfError::Closed)? }
    }

    /// Draws regions of a page. Dropping the future before the thread reaches the job skips it,
    /// so pages scrolled past cost nothing.
    pub fn render(
        &self,
        request: RenderRequest,
    ) -> impl Future<Output = Result<Vec<Bitmap>, PdfError>> + Send + 'static {
        let (reply, answer) = oneshot::channel();
        let _ = self.jobs.send(Job::Render(request, reply));
        async move { answer.await.map_err(|_| PdfError::Closed)? }
    }

    /// Frees a document. Renders of it still queued answer [`PdfError::Closed`].
    pub fn close(&self, doc: DocId) {
        let _ = self.jobs.send(Job::Close(doc));
    }
}

/// Where PDFium is looked for, in order: `$SPECTRUM_PDFIUM` (the library file), the app bundle's
/// Frameworks (macOS) or beside the executable, then `cargo xtask fetch-pdfium`'s cache.
pub fn candidates() -> Vec<PathBuf> {
    let name = Pdfium::pdfium_platform_library_name();
    let mut paths = Vec::new();
    if let Some(path) = std::env::var_os("SPECTRUM_PDFIUM") {
        paths.push(PathBuf::from(path));
    }
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(Path::to_path_buf))
    {
        if cfg!(target_os = "macos") {
            paths.push(dir.join("../Frameworks").join(&name));
        }
        paths.push(dir.join(&name));
    }
    let triple = if cfg!(windows) {
        "x86_64-pc-windows-msvc"
    } else {
        "aarch64-apple-darwin"
    };
    paths.push(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../target/pdfium")
            .join(triple)
            .join(&name),
    );
    paths
}

/// The first of [`candidates`] that exists.
pub fn find_library() -> Option<PathBuf> {
    candidates().into_iter().find(|p| p.is_file())
}

fn actor(library: &Path, queue: &Receiver<Job>, ready: oneshot::Sender<Result<(), PdfError>>) {
    let pdfium = match Pdfium::bind_to_library(library) {
        Ok(bindings) => Pdfium::new(bindings),
        Err(e) => {
            let _ = ready.send(Err(PdfError::Library {
                path: library.to_path_buf(),
                detail: e.to_string(),
            }));
            return;
        }
    };
    let _ = ready.send(Ok(()));
    let mut docs: HashMap<DocId, PdfDocument<'_>> = HashMap::new();
    let mut next = 0;
    for job in queue {
        match job {
            Job::Open(path, reply) => {
                let opened = open(&pdfium, &path);
                let _ = reply.send(opened.map(|(doc, pages)| {
                    next += 1;
                    let id = DocId(next);
                    docs.insert(id, doc);
                    PdfDoc { id, path, pages }
                }));
            }
            Job::Render(request, reply) => {
                if reply.is_canceled() {
                    continue;
                }
                let result = docs
                    .get(&request.doc)
                    .ok_or(PdfError::Closed)
                    .and_then(|doc| render(doc, &request));
                let _ = reply.send(result);
            }
            Job::Close(id) => {
                docs.remove(&id);
            }
        }
    }
}

fn open<'a>(pdfium: &'a Pdfium, path: &Path) -> Result<(PdfDocument<'a>, Vec<PageSize>), PdfError> {
    let fail = |detail: String| PdfError::Open {
        path: path.to_path_buf(),
        detail,
    };
    let bytes = std::fs::read(path).map_err(|e| fail(e.to_string()))?;
    let doc = pdfium
        .load_pdf_from_byte_vec(bytes, None)
        .map_err(|e| fail(e.to_string()))?;
    let pages = doc
        .pages()
        .page_sizes()
        .map_err(|e| fail(e.to_string()))?
        .iter()
        .map(|r| PageSize {
            width: r.width().value,
            height: r.height().value,
        })
        .collect::<Vec<_>>();
    if pages.is_empty() {
        return Err(fail("it has no pages".into()));
    }
    Ok((doc, pages))
}

/// The page's size in pixels at `scale`, as [`RenderRequest`] rects count it.
pub fn page_pixels(size: PageSize, scale: f32) -> (u32, u32) {
    let px = |pt: f32| ((pt * scale).round() as u32).max(1);
    (px(size.width), px(size.height))
}

fn render(doc: &PdfDocument<'_>, request: &RenderRequest) -> Result<Vec<Bitmap>, PdfError> {
    let fail = |detail: String| PdfError::Render {
        page: request.page + 1,
        detail,
    };
    let index = i32::try_from(request.page).map_err(|e| fail(e.to_string()))?;
    let page = doc.pages().get(index).map_err(|e| fail(e.to_string()))?;
    let (width, height) = page_pixels(
        PageSize {
            width: page.width().value,
            height: page.height().value,
        },
        request.scale,
    );
    let int = |v: u32| i32::try_from(v).map_err(|e| fail(e.to_string()));
    let mut out = Vec::with_capacity(request.rects.len());
    for &rect in &request.rects {
        // paper first: PDFium draws onto what's there (transparent pages show white, as in 2.8)
        let mut bgra = vec![255u8; rect.width as usize * rect.height as usize * 4];
        {
            let mut bitmap = PdfBitmap::from_bytes(
                int(rect.width)?,
                int(rect.height)?,
                PdfBitmapFormat::BGRA,
                &mut bgra,
            )
            .map_err(|e| fail(e.to_string()))?;
            let config = PdfRenderConfig::new()
                .set_fixed_size(int(width)?, int(height)?)
                .set_origin(-int(rect.x)?, -int(rect.y)?)
                .clear_before_rendering(false)
                // pdfium-render asks for RGBA by default; GPUI wants PDFium's own BGRA
                .set_reverse_byte_order(false);
            page.render_into_bitmap_with_config(&mut bitmap, &config)
                .map_err(|e| fail(e.to_string()))?;
        }
        request.colour.apply(&mut bgra);
        out.push(Bitmap { rect, bgra });
    }
    Ok(out)
}
