//! `PdfPanel`: the PDF pane. A continuous column of pages ([`Layout`]) drawn from cached tiles
//! that the PDFium thread renders at zoom × the screen's scale factor; scrolling and zoom never
//! wait for it. Undrawn pages show their paper colour; a zoom shows the old tiles stretched until
//! sharp ones arrive; a reload keeps the old document on screen until the new one's visible tiles
//! are ready (no white flash).
//!
//! Session 4b adds selection, links, search, the SyncTeX pulse and page navigation; 4c the
//! outline sidebar, two-page view, presentation and page memory.

mod toolbar;

use crate::cache::{DEFAULT_BUDGET, Focus, TileCache, TileKey};
use crate::colour::PageColour;
use crate::engine::{Bitmap, DocId, PdfDoc, PdfEngine, PdfError, RenderRequest, page_pixels};
use crate::layout::{Layout, MAX_ZOOM, MIN_ZOOM, WantedTile, Zoom};
use gpui_kit::{
    App, Bounds, Context, EventEmitter, FocusHandle, Focusable, Hsla, InteractiveElement,
    IntoElement, KeyBinding, MouseButton, ParentElement, PinchEvent, Pixels, Point, Render,
    RenderImage, ScrollDelta, ScrollEvent, Styled, Subscription, Task, TouchPhase, Window, canvas,
    div, img, point, prelude::*, px, rgb,
};
use spectrum_theme::SpectrumTheme;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

gpui_kit::actions!(pdf, [ZoomIn, ZoomOut, FitWidth, FitPage]);

/// 2.8's shortcuts in the `PdfPanel` context: Cmd (Ctrl) = / − to zoom, 0 fit width, 9 fit page.
pub fn bind_keys(cx: &mut App) {
    #[cfg(target_os = "macos")]
    macro_rules! keys {
        ($k:literal) => {
            concat!("cmd-", $k)
        };
    }
    #[cfg(not(target_os = "macos"))]
    macro_rules! keys {
        ($k:literal) => {
            concat!("ctrl-", $k)
        };
    }
    let ctx = Some("PdfPanel");
    cx.bind_keys([
        KeyBinding::new(keys!("="), ZoomIn, ctx),
        KeyBinding::new(keys!("+"), ZoomIn, ctx),
        KeyBinding::new(keys!("-"), ZoomOut, ctx),
        KeyBinding::new(keys!("0"), FitWidth, ctx),
        KeyBinding::new(keys!("9"), FitPage, ctx),
    ]);
}

pub enum PdfPanelEvent {
    /// A PDF is showing (first open or a finished reload).
    Loaded { pages: usize },
    /// Opening or reloading failed; a shown PDF stays.
    Failed(PdfError),
    /// The zoom changed (for the per-project layout memory).
    ZoomChanged(Zoom),
}

/// After a pinch or ⌘-scroll stops this long, pages are drawn at the new scale.
const SETTLE: Duration = Duration::from_millis(150);
/// Lines of a mouse wheel notch.
const LINE: f32 = 20.;

type Image = Arc<RenderImage>;

struct Job {
    keys: Vec<TileKey>,
    _task: Task<()>,
}

pub struct PdfPanel {
    focus_handle: FocusHandle,
    _subscriptions: Vec<Subscription>,
    engine: Result<PdfEngine, PdfError>,
    shown: Option<PdfDoc>,
    /// A reload waiting for its visible tiles.
    pending: Option<PdfDoc>,
    error: Option<PdfError>,
    zoom: Zoom,
    colour: PageColour,
    scroll: Point<f32>,
    viewport: Bounds<Pixels>,
    cache: TileCache<Image>,
    jobs: HashMap<u64, Job>,
    next_job: u64,
    failed: HashSet<TileKey>,
    settling: Option<Task<()>>,
    /// Centre the column across the view at the next layout (a PDF wider than the view
    /// starts in its middle rather than at its left edge).
    recentre: bool,
    opening_task: Option<Task<()>>,
}

impl PdfPanel {
    pub fn new(_window: &mut Window, cx: &mut Context<Self>) -> Self {
        let release = cx.on_release(|this: &mut Self, cx| {
            for image in this.cache.clear() {
                cx.drop_image(image, None);
            }
            if let Ok(engine) = &this.engine {
                for doc in this.shown.iter().chain(&this.pending) {
                    engine.close(doc.id);
                }
            }
        });
        Self {
            focus_handle: cx.focus_handle(),
            _subscriptions: vec![release],
            engine: PdfEngine::shared(),
            shown: None,
            pending: None,
            error: None,
            zoom: Zoom::FitWidth,
            colour: PageColour::White,
            scroll: Point::default(),
            viewport: Bounds::default(),
            cache: TileCache::new(DEFAULT_BUDGET),
            jobs: HashMap::new(),
            next_job: 0,
            failed: HashSet::new(),
            settling: None,
            recentre: true,
            opening_task: None,
        }
    }

    /// Opens a PDF, or reloads it after a compile: the PDF showing stays until the new one's
    /// pages are drawn, at the same scroll position and zoom.
    pub fn open(&mut self, path: impl Into<PathBuf>, cx: &mut Context<Self>) {
        let Ok(engine) = &self.engine else { return };
        let opening = engine.open(path);
        self.opening_task = Some(cx.spawn(async move |this, cx| {
            let result = opening.await;
            let _ = this.update(cx, |panel, cx| panel.opened(result, cx));
        }));
    }

    fn opened(&mut self, result: Result<PdfDoc, PdfError>, cx: &mut Context<Self>) {
        match result {
            Ok(doc) if self.shown.is_none() => {
                cx.emit(PdfPanelEvent::Loaded {
                    pages: doc.pages.len(),
                });
                self.shown = Some(doc);
                self.error = None;
            }
            Ok(doc) => {
                if let Some(old) = self.pending.replace(doc) {
                    self.forget(old.id, cx);
                }
            }
            Err(e) => {
                cx.emit(PdfPanelEvent::Failed(e.clone()));
                self.error = Some(e);
            }
        }
        cx.notify();
    }

    /// Closes a document and drops its tiles and queued renders.
    fn forget(&mut self, doc: DocId, cx: &mut Context<Self>) {
        if let Ok(engine) = &self.engine {
            engine.close(doc);
        }
        self.jobs
            .retain(|_, job| job.keys.iter().all(|k| k.doc != doc));
        for image in self.cache.retain(|k| k.doc != doc) {
            cx.drop_image(image, None);
        }
    }

    pub fn set_page_colour(&mut self, colour: PageColour, cx: &mut Context<Self>) {
        if colour != self.colour {
            self.colour = colour;
            cx.notify();
        }
    }

    pub fn zoom(&self) -> Zoom {
        self.zoom
    }

    pub fn set_zoom(&mut self, zoom: Zoom, cx: &mut Context<Self>) {
        self.zoom_about(zoom, None, cx);
    }

    /// The page in view (0-based) and the page count, once a PDF shows.
    pub fn page(&self) -> Option<(usize, usize)> {
        let layout = self.layout(self.shown.as_ref()?);
        Some((
            layout.page_at(self.scroll.y + self.view_size().1 / 3.),
            layout.pages.len(),
        ))
    }

    /// Bytes of tiles held now and at most so far.
    pub fn cache_bytes(&self) -> (usize, usize) {
        (self.cache.bytes(), self.cache.peak())
    }

    /// Frees every tile and its GPU texture: call when the pane is hidden or the window
    /// minimised. Pages redraw when it shows again.
    pub fn release_textures(&mut self, cx: &mut Context<Self>) {
        self.jobs.clear();
        for image in self.cache.clear() {
            cx.drop_image(image, None);
        }
    }

    fn view_size(&self) -> (f32, f32) {
        let s = self.viewport.size;
        (f32::from(s.width), f32::from(s.height))
    }

    fn layout(&self, doc: &PdfDoc) -> Layout {
        Layout::new(&doc.pages, self.zoom, self.view_size())
    }

    /// Changes the zoom keeping the spot under `anchor` (viewport-relative; the middle when
    /// `None`) still.
    #[allow(clippy::many_single_char_names)]
    fn zoom_about(&mut self, zoom: Zoom, anchor: Option<Point<f32>>, cx: &mut Context<Self>) {
        let (w, h) = self.view_size();
        let gesture = anchor.is_some();
        let anchor = anchor.unwrap_or(point(w / 2., h / 2.));
        if let Some(doc) = &self.shown {
            let before = self.layout(doc);
            let (x, y) = (self.scroll.x + anchor.x, self.scroll.y + anchor.y);
            let i = before.page_at(y);
            let b = before.pages[i];
            let (fx, fy) = ((x - b.x) / b.w, (y - b.y) / b.h);
            self.zoom = zoom;
            let a = self.layout(doc).pages[i];
            self.scroll = point(a.x + fx * a.w - anchor.x, a.y + fy * a.h - anchor.y);
            self.recentre = !gesture;
        } else {
            self.zoom = zoom;
        }
        cx.emit(PdfPanelEvent::ZoomChanged(zoom));
        cx.notify();
    }

    fn scale_now(&self) -> f32 {
        self.shown.as_ref().map_or(1., |doc| self.layout(doc).scale)
    }

    fn step(&mut self, steps: i32, cx: &mut Context<Self>) {
        let zoom = Zoom::stepped(self.scale_now(), steps);
        self.zoom_about(zoom, None, cx);
    }

    /// A pinch or ⌘-scroll: zoom live, draw sharp tiles once it stops.
    fn gesture_zoom(&mut self, factor: f32, at: Point<Pixels>, cx: &mut Context<Self>) {
        let scale = (self.scale_now() * factor).clamp(MIN_ZOOM, MAX_ZOOM);
        let origin = self.viewport.origin;
        let anchor = point(f32::from(at.x - origin.x), f32::from(at.y - origin.y));
        self.zoom_about(Zoom::Scale(scale), Some(anchor), cx);
        self.settling = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(SETTLE).await;
            let _ = this.update(cx, |panel, cx| {
                // 2.8 keeps a pinched zoom to two decimals
                if let Zoom::Scale(s) = panel.zoom {
                    panel.zoom = Zoom::Scale((s * 100.).round() / 100.);
                }
                panel.settling = None;
                cx.notify();
            });
        }));
    }

    fn on_scroll(&mut self, e: &ScrollEvent, _: &mut Window, cx: &mut Context<Self>) {
        let delta = e.delta.pixel_delta(px(LINE));
        let (dx, dy) = (f32::from(delta.x), f32::from(delta.y));
        if e.modifiers.platform || e.modifiers.control {
            // a Windows touchpad pinch arrives as Ctrl + wheel; ⌘ + wheel zooms with a mouse
            let per = if matches!(e.delta, ScrollDelta::Lines(_)) {
                0.05 / LINE
            } else {
                0.01
            };
            self.gesture_zoom((dy * per).exp(), e.position, cx);
        } else {
            self.scroll.x -= dx;
            self.scroll.y -= dy;
            cx.notify();
        }
    }

    fn on_pinch(&mut self, e: &PinchEvent, _: &mut Window, cx: &mut Context<Self>) {
        if e.phase != TouchPhase::Cancelled {
            self.gesture_zoom(1. + e.delta, e.position, cx);
        }
    }

    /// Keeps the scroll inside the column.
    fn clamp_scroll(&mut self, layout: &Layout) {
        let (w, h) = self.view_size();
        self.scroll.x = self.scroll.x.clamp(0., (layout.width - w).max(0.));
        self.scroll.y = self.scroll.y.clamp(0., (layout.height - h).max(0.));
    }

    fn focus(&self, page: usize, bucket: u32) -> Option<Focus> {
        Some(Focus {
            doc: self.shown.as_ref()?.id,
            page: page as u32,
            scale: bucket,
            colour: self.colour,
        })
    }

    /// Asks the PDFium thread for the tiles `doc` needs here and isn't drawing yet. Returns
    /// whether every tile in view is cached.
    fn request(
        &mut self,
        doc: &PdfDoc,
        layout: &Layout,
        bucket: u32,
        cx: &mut Context<Self>,
    ) -> bool {
        let Ok(engine) = &self.engine else {
            return false;
        };
        let size = self.view_size();
        let wanted = layout.wanted((self.scroll.x, self.scroll.y), size, bucket);
        let key = |t: &WantedTile| TileKey {
            doc: doc.id,
            page: t.page,
            scale: bucket,
            colour: self.colour,
            tile: t.tile,
        };
        let busy: HashSet<TileKey> = self.jobs.values().flat_map(|j| j.keys.clone()).collect();
        let in_view = layout.visible(self.scroll.y, self.scroll.y + size.1);
        let mut ready = true;
        let mut by_page: Vec<(u32, Vec<WantedTile>)> = Vec::new();
        for t in &wanted {
            let k = key(t);
            if self.cache.contains(&k) || self.failed.contains(&k) {
                continue;
            }
            if in_view.contains(&(t.page as usize)) {
                ready = false;
            }
            if busy.contains(&k) {
                continue;
            }
            match by_page.iter_mut().find(|(p, _)| *p == t.page) {
                Some((_, tiles)) => tiles.push(*t),
                None => by_page.push((t.page, vec![*t])),
            }
        }
        for (page, tiles) in by_page {
            let keys: Vec<TileKey> = tiles.iter().map(key).collect();
            let rendering = engine.render(RenderRequest {
                doc: doc.id,
                page,
                scale: bucket as f32 / 1000.,
                colour: self.colour,
                rects: tiles.iter().map(|t| t.rect).collect(),
            });
            self.next_job += 1;
            let id = self.next_job;
            let job_keys = keys.clone();
            let task = cx.spawn(async move |this, cx| {
                let result = rendering.await;
                let _ = this.update(cx, |panel, cx| panel.rendered(id, &job_keys, result, cx));
            });
            self.jobs.insert(id, Job { keys, _task: task });
        }
        // renders for tiles no longer wanted are dropped, which cancels them
        let wanted_keys: HashSet<TileKey> = wanted.iter().map(key).collect();
        self.jobs.retain(|_, job| {
            job.keys
                .iter()
                .any(|k| k.doc != doc.id || wanted_keys.contains(k))
        });
        ready
    }

    fn rendered(
        &mut self,
        id: u64,
        keys: &[TileKey],
        result: Result<Vec<Bitmap>, PdfError>,
        cx: &mut Context<Self>,
    ) {
        self.jobs.remove(&id);
        match result {
            Ok(bitmaps) => {
                let page = self.page().map_or(0, |(p, _)| p);
                let focus = keys.first().and_then(|k| self.focus(page, k.scale));
                for (key, bitmap) in keys.iter().zip(bitmaps) {
                    let bytes = bitmap.bgra.len();
                    let Some(image) = to_image(bitmap) else {
                        continue;
                    };
                    let focus = focus.unwrap_or(Focus {
                        doc: key.doc,
                        page: key.page,
                        scale: key.scale,
                        colour: key.colour,
                    });
                    for old in self.cache.insert(*key, image, bytes, focus) {
                        cx.drop_image(old, None);
                    }
                }
            }
            Err(PdfError::Closed) => {}
            Err(e) => {
                tracing::warn!("PDF page didn't render: {e}");
                self.failed.extend(keys.iter().copied());
            }
        }
        cx.notify();
    }
}

fn to_image(bitmap: Bitmap) -> Option<Image> {
    let buffer = image::RgbaImage::from_raw(bitmap.rect.width, bitmap.rect.height, bitmap.bgra)?;
    Some(Arc::new(RenderImage::new(vec![image::Frame::new(buffer)])))
}

fn paper(colour: PageColour) -> Hsla {
    let [r, g, b] = colour.paper();
    rgb(u32::from(r) << 16 | u32::from(g) << 8 | u32::from(b)).into()
}

impl EventEmitter<PdfPanelEvent> for PdfPanel {}

impl Focusable for PdfPanel {
    fn focus_handle(&self, _cx: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl Render for PdfPanel {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<SpectrumTheme>().clone();
        let scale_factor = window.scale_factor();
        let weak = cx.entity().downgrade();
        // the pane's size, measured at prepaint; a change redraws
        let measure = canvas(
            move |bounds, _, cx| {
                let _ = weak.update(cx, |panel, cx| {
                    if panel.viewport != bounds {
                        let resized = panel.viewport.size != bounds.size;
                        panel.viewport = bounds;
                        if resized {
                            cx.notify();
                        }
                    }
                });
            },
            |_, (), _, _| {},
        )
        .absolute()
        .size_full();

        let mut pages = Vec::new();
        let message = match (&self.engine, &self.shown) {
            (Err(e), _) => Some(e.to_string()),
            (Ok(_), None) => Some(self.error.as_ref().map_or_else(
                || "Compile to see the PDF here.".to_owned(),
                ToString::to_string,
            )),
            (Ok(_), Some(_)) => None,
        };
        if let Some(mut doc) = self.shown.clone()
            && self.viewport.size.width > px(0.)
        {
            let mut layout = self.layout(&doc);
            if std::mem::take(&mut self.recentre) {
                self.scroll.x = (layout.width - self.view_size().0) / 2.;
            }
            self.clamp_scroll(&layout);
            let bucket = layout.bucket(scale_factor);
            if self.settling.is_none() {
                if let Some(next) = self.pending.clone() {
                    let next_layout = self.layout(&next);
                    if self.request(&next, &next_layout, bucket, cx) {
                        // the reload's pages in view are drawn: show it in one frame
                        self.pending = None;
                        self.shown = Some(next.clone());
                        self.failed.clear();
                        self.forget(doc.id, cx);
                        cx.emit(PdfPanelEvent::Loaded {
                            pages: next.pages.len(),
                        });
                        (doc, layout) = (next, next_layout);
                        self.clamp_scroll(&layout);
                    }
                }
                self.request(&doc, &layout, bucket, cx);
            }
            pages = self.draw_pages(&doc, &layout, bucket, &theme);
        }

        div()
            .id("pdf-panel")
            .track_focus(&self.focus_handle)
            .key_context("PdfPanel")
            .on_action(cx.listener(|this, _: &ZoomIn, _, cx| this.step(1, cx)))
            .on_action(cx.listener(|this, _: &ZoomOut, _, cx| this.step(-1, cx)))
            .on_action(cx.listener(|this, _: &FitWidth, _, cx| this.set_zoom(Zoom::FitWidth, cx)))
            .on_action(cx.listener(|this, _: &FitPage, _, cx| this.set_zoom(Zoom::FitPage, cx)))
            .size_full()
            .flex()
            .flex_col()
            .bg(theme.bg_panel)
            .child(self.toolbar(&theme, cx))
            .child(
                div()
                    .id("pdf-pages")
                    .relative()
                    .flex_1()
                    .min_h_0()
                    .overflow_hidden()
                    .bg(theme.bg_subtle)
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(|this, _, window, cx| window.focus(&this.focus_handle, cx)),
                    )
                    .on_scroll(cx.listener(Self::on_scroll))
                    .on_pinch(cx.listener(Self::on_pinch))
                    .child(measure)
                    .children(pages)
                    .when_some(message, |d, text| {
                        d.child(
                            div()
                                .size_full()
                                .flex()
                                .items_center()
                                .justify_center()
                                .p(px(24.))
                                .text_size(px(13.))
                                .text_color(theme.text_secondary)
                                .child(text),
                        )
                    }),
            )
    }
}

impl PdfPanel {
    /// The pages in view: paper, then any tiles held for them (other scales or colours first,
    /// stretched), then this scale's tiles on top.
    #[allow(clippy::many_single_char_names)]
    fn draw_pages(
        &mut self,
        doc: &PdfDoc,
        layout: &Layout,
        bucket: u32,
        theme: &SpectrumTheme,
    ) -> Vec<gpui_kit::AnyElement> {
        let (_, h) = self.view_size();
        let paper = paper(self.colour);
        let dark = theme.is_dark();
        let mut out = Vec::new();
        for i in layout.visible(self.scroll.y, self.scroll.y + h) {
            let b = layout.pages[i];
            let (x, y) = (b.x - self.scroll.x, b.y - self.scroll.y);
            let mut tiles: Vec<(TileKey, Image)> = self
                .cache
                .page_tiles(doc.id, i as u32)
                .map(|(k, v)| (*k, v.clone()))
                .collect();
            tiles.sort_by_key(|(k, _)| (k.scale == bucket && k.colour == self.colour, k.scale));
            let mut page = div()
                .absolute()
                .left(px(x))
                .top(px(y))
                .w(px(b.w))
                .h(px(b.h))
                .bg(paper)
                .rounded(px(2.))
                .shadow_sm()
                .overflow_hidden()
                .when(dark, |d| d.border_1().border_color(theme.border));
            for (key, image) in tiles {
                self.cache.get(&key);
                let (pw, ph) = page_pixels(doc.pages[i], key.scale as f32 / 1000.);
                let (fx, fy) = (b.w / pw as f32, b.h / ph as f32);
                let r = image.size(0);
                let (tx, ty) = (
                    key.tile.0 * crate::layout::TILE,
                    key.tile.1 * crate::layout::TILE,
                );
                page = page.child(
                    img(image)
                        .absolute()
                        .left(px(tx as f32 * fx))
                        .top(px(ty as f32 * fy))
                        .w(px(r.width.0 as f32 * fx))
                        .h(px(r.height.0 as f32 * fy)),
                );
            }
            out.push(page.into_any_element());
        }
        out
    }
}
