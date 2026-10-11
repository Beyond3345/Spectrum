import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { GlobalWorkerOptions, TextLayer, getDocument } from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';

GlobalWorkerOptions.workerSrc = pdfWorker;

/** 'fit' = whole page visible, 'width' = page as wide as the column, or a fixed scale (1 = 100%) */
export type PdfZoom = 'fit' | 'width' | number;
export type PdfOutlineItem = { title: string; page?: number; level: number };
export type PdfAnnotation = { id: string; page: number; x: number; y: number; text: string };
export type PdfHandle = { scrollToPage(page: number): void };

// keep in step with .pdf-pages padding and gap in editor.css
const PAD = 12;
const GAP = 12;
// the fit modes are kept in this range too, so a zoom step from them never jumps the wrong way
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
const clampZoom = (scale: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

/** WebKit's trackpad pinch (Safari and the macOS app); Chromium sends ctrl + wheel instead. */
type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };
// pdf.js's own cap on a page canvas (maxCanvasPixels); bigger ones fail or get the web view killed
const MAX_CANVAS_PIXELS = 16_777_216;

async function readOutline(pdf: PDFDocumentProxy) {
  const items: PdfOutlineItem[] = [];
  const walk = async (entries: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | undefined, level: number) => {
    for (const entry of entries || []) {
      let page: number | undefined;
      try {
        const dest = typeof entry.dest === 'string' ? await pdf.getDestination(entry.dest) : entry.dest;
        if (Array.isArray(dest) && dest[0]) page = (await pdf.getPageIndex(dest[0])) + 1;
      } catch {
        // an outline entry without a usable destination
      }
      items.push({ title: entry.title || '(untitled)', page, level });
      await walk(entry.items, level + 1);
    }
  };
  await walk(await pdf.getOutline().catch(() => []), 0);
  return items;
}

/** A page's canvas and selectable text layer at `scale`. */
async function paintPage(page: PDFPageProxy, scale: number) {
  const view = page.getViewport({ scale });
  const sharpness = Math.min(3, (window.devicePixelRatio || 1) * 1.25, Math.sqrt(MAX_CANVAS_PIXELS / (view.width * view.height)));
  const sharp = page.getViewport({ scale: scale * sharpness });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(sharp.width);
  canvas.height = Math.floor(sharp.height);
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  const canvasContext = canvas.getContext('2d');
  if (canvasContext) await page.render({ canvas, canvasContext, viewport: sharp }).promise;
  await new TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport: view }).render();
  return { canvas, textLayer };
}

/** Frees a page box's canvas and text (its annotation markers stay). */
function clearPage(box: HTMLElement) {
  box.querySelectorAll<HTMLElement>(':scope > canvas, :scope > .textLayer').forEach((node) => {
    if (node instanceof HTMLCanvasElement) node.width = node.height = 0;
    node.remove();
  });
  delete box.dataset.drawn;
  delete box.dataset.drawing;
}

type Layout = { url: string; scale: number; pages: PDFPageProxy[]; boxes: HTMLElement[] };

/** The point under the fingers: a page box and where on it, and where in the view it sits. */
type Anchor = { box: HTMLElement; fx: number; fy: number; vx: number; vy: number };

/** Draws a page box for the current document and scale, unless it already shows them. Until then it keeps what it had. */
function drawPage(box: HTMLElement, layout: Layout | null) {
  const page = layout?.pages[Number(box.dataset.pageNumber) - 1];
  if (!layout || !page) return;
  const key = `${layout.url}@${layout.scale}`;
  if (box.dataset.drawn === key || box.dataset.drawing === key) return;
  box.dataset.drawing = key;
  paintPage(page, layout.scale).then(
    ({ canvas, textLayer }) => {
      // zoomed again, scrolled away or a newer PDF meanwhile
      if (box.dataset.drawing !== key) {
        canvas.width = canvas.height = 0;
        return;
      }
      clearPage(box);
      box.prepend(canvas, textLayer);
      box.dataset.drawn = key;
    },
    () => {
      if (box.dataset.drawing === key) delete box.dataset.drawing;
    }
  );
}

/** Page 1 as a base64 PNG (no data: prefix), ~`width` px wide, for the projects list. */
export async function pdfThumbnail(url: string, width = 240) {
  const task = getDocument({ url });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) throw new Error('No canvas');
    await page.render({ canvas, canvasContext, viewport }).promise;
    return canvas.toDataURL('image/png').split(',')[1];
  } finally {
    task.destroy();
  }
}

/**
 * A PDF as a scrolling column of page boxes. Only pages within about two screens of the view are drawn
 * (canvas + selectable text layer); the others are freed. Zoom, two-page view and, in the fit modes,
 * column resizes resize the boxes at once and redraw the visible pages. A pinch or ⌘-scroll zooms
 * around the pointer: the pages are stretched while the fingers move, then laid out and drawn sharp.
 */
const PdfPreview = forwardRef<
  PdfHandle,
  {
    url: string;
    zoom: PdfZoom;
    spread: boolean;
    /** in dark mode, shows the pages dark (the colours inverted) */
    darkPages: boolean;
    annotateMode: boolean;
    annotations: PdfAnnotation[];
    onAddAnnotation(page: number, x: number, y: number): void;
    onTextClick(text: string): void;
    onLoad(info: { pages: number; outline: PdfOutlineItem[] }): void;
    onScale(scale: number): void;
    /** a pinch or ⌘-scroll chose this scale */
    onZoom(scale: number): void;
    onPage(page: number): void;
  }
>(function PdfPreview({ url, zoom, spread, darkPages, annotateMode, annotations, onAddAnnotation, onTextClick, onLoad, onScale, onZoom, onPage }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [error, setError] = useState('');
  const [rendered, setRendered] = useState(0);
  const layoutRef = useRef<Layout | null>(null);
  const visibleRef = useRef(new Set<HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  // callbacks change on every parent render; the effects read the latest ones
  const cb = useRef({ onLoad, onScale, onZoom, onPage });
  cb.current = { onLoad, onScale, onZoom, onPage };
  // the point to keep still when the next layout applies a pinch
  const anchorRef = useRef<Anchor | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToPage(page) {
      const el = pagesRef.current?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${page}"]`);
      const scroller = scrollRef.current;
      if (el && scroller) scroller.scrollTo({ top: el.offsetTop - PAD, behavior: 'smooth' });
    }
  }));

  // the column size only matters for the fit modes; hidden (0 × 0) means "keep what we have"
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!el.clientWidth) return;
        setWidth((w) => (Math.abs(w - el.clientWidth) > 2 ? el.clientWidth : w));
        setHeight((h) => (Math.abs(h - el.clientHeight) > 2 ? el.clientHeight : h));
      }, 120);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  // draw pages coming near the view, free those moving far from it
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const visible = visibleRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const box = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            visible.add(box);
            // not while a pinch stretches the pages: the scale is about to change, and the layout redraws these
            if (!pagesRef.current?.style.transform) drawPage(box, layoutRef.current);
          } else {
            visible.delete(box);
            clearPage(box);
          }
        }
      },
      // two screens up and down; one across, for zoomed two-page rows wider than the column
      { root: scroller, rootMargin: '200% 100%' }
    );
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  // pinch and ⌘-scroll zoom
  useEffect(() => {
    const scroller = scrollRef.current;
    const host = pagesRef.current;
    if (!scroller || !host) return;
    let pinch: { from: number; to: number; base: number; anchor: Anchor; timer: number } | null = null;
    let gesturing = false;
    let lastScroll = -Infinity;
    let gestureTarget: EventTarget | null = null;

    const begin = (x: number, y: number) => {
      const from = layoutRef.current?.scale;
      if (pinch || !from) return pinch;
      const view = scroller.getBoundingClientRect();
      const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('.pdf-page');
      // between pages or beside them: the page nearest the pointer's height
      const boxes = layoutRef.current?.boxes || [];
      const box = under || (boxes.length ? boxes.reduce((best, b) => (Math.abs(mid(b) - y) < Math.abs(mid(best) - y) ? b : best)) : null);
      if (!box) return null;
      const r = box.getBoundingClientRect();
      const anchor = { box, fx: (x - r.left) / r.width, fy: (y - r.top) / r.height, vx: x - view.left, vy: y - view.top };
      host.style.transformOrigin = `${x - view.left + scroller.scrollLeft}px ${y - view.top + scroller.scrollTop}px`;
      pinch = { from, to: from, base: from, anchor, timer: 0 };
      return pinch;
    };
    const mid = (b: HTMLElement) => {
      const r = b.getBoundingClientRect();
      return r.top + r.height / 2;
    };
    const stretch = (to: number) => {
      if (!pinch) return;
      pinch.to = clampZoom(to);
      host.style.transform = `scale(${pinch.to / pinch.from})`;
    };
    const finish = () => {
      if (!pinch) return;
      const { from, to, anchor, timer } = pinch;
      window.clearTimeout(timer);
      pinch = null;
      if (Math.abs(to - from) < 0.005) {
        host.style.transform = '';
        visibleRef.current.forEach((b) => drawPage(b, layoutRef.current));
        return;
      }
      // the layout for the new scale clears the stretch and scrolls the anchor back under the pointer
      anchorRef.current = anchor;
      cb.current.onZoom(Math.round(to * 1000) / 1000);
    };

    const onWheel = (e: WheelEvent) => {
      // a pinch arrives as ctrl + wheel (Chromium); ⌘ + wheel zooms with a mouse
      if (!e.ctrlKey && !e.metaKey) {
        lastScroll = e.timeStamp;
        return;
      }
      // ⌘ pressed (say for ⌘S) while a trackpad scroll still coasts: the momentum keeps scrolling
      if (!pinch && e.timeStamp - lastScroll < 250) {
        lastScroll = e.timeStamp;
        return;
      }
      e.preventDefault();
      if (gesturing || !begin(e.clientX, e.clientY)) return;
      stretch(pinch!.to * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01)));
      window.clearTimeout(pinch!.timer);
      pinch!.timer = window.setTimeout(finish, 180);
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (pinch) stretch(pinch.base * (e as GestureEvent).scale);
    };
    const detachTarget = () => {
      gestureTarget?.removeEventListener('gesturechange', onGestureChange);
      gestureTarget?.removeEventListener('gestureend', onGestureEnd);
      gestureTarget = null;
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      detachTarget();
      gesturing = false;
      finish();
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      // WebKit sends the rest of a gesture to the node it started on, even after a redraw removes that
      // node from the page, so listen there as well (on the page too the repeat is harmless)
      detachTarget();
      gestureTarget = e.target;
      gestureTarget?.addEventListener('gesturechange', onGestureChange);
      gestureTarget?.addEventListener('gestureend', onGestureEnd);
      gesturing = true;
      if (begin(g.clientX, g.clientY)) pinch!.base = pinch!.to;
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('gesturestart', onGestureStart);
    scroller.addEventListener('gesturechange', onGestureChange);
    scroller.addEventListener('gestureend', onGestureEnd);
    return () => {
      if (pinch) window.clearTimeout(pinch.timer);
      detachTarget();
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('gesturestart', onGestureStart);
      scroller.removeEventListener('gesturechange', onGestureChange);
      scroller.removeEventListener('gestureend', onGestureEnd);
    };
  }, []);

  const docRef = useRef<{ url: string; task: PDFDocumentLoadingTask } | null>(null);
  useEffect(
    () => () => {
      docRef.current?.task.destroy();
      docRef.current = null;
      layoutRef.current?.boxes.forEach(clearPage);
    },
    []
  );

  const fitWidth = typeof zoom === 'number' ? 0 : width;
  const fitHeight = zoom === 'fit' ? height : 0;

  useEffect(() => {
    const scroller = scrollRef.current;
    const host = pagesRef.current;
    if (!scroller || !host || !url || (typeof zoom !== 'number' && !fitWidth)) return;
    let cancelled = false;

    if (docRef.current?.url !== url) {
      docRef.current?.task.destroy();
      const task = getDocument({ url });
      docRef.current = { url, task };
      task.promise
        .then(async (doc) => {
          const outline = await readOutline(doc);
          if (docRef.current?.url === url) cb.current.onLoad({ pages: doc.numPages, outline });
        })
        .catch(() => undefined);
    }

    (async () => {
      try {
        const pdf = await docRef.current!.task.promise;
        if (cancelled) return;
        let layout = layoutRef.current;
        if (layout?.url !== url) {
          const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
          if (cancelled) return;
          // a recompiled PDF reuses the page boxes, which show the old pages until the new ones are drawn
          const old = layout?.boxes || [];
          for (const box of old.slice(pages.length)) {
            observerRef.current?.unobserve(box);
            visibleRef.current.delete(box);
            clearPage(box);
          }
          const boxes = pages.map((page, i) => {
            const box = old[i] || document.createElement('div');
            box.className = 'pdf-page';
            box.dataset.pageNumber = String(page.pageNumber);
            return box;
          });
          layout = { url, scale: 0, pages, boxes };
        }
        const base = layout.pages[0].getViewport({ scale: 1 });
        let scale: number;
        if (typeof zoom === 'number') scale = zoom;
        else {
          const across = spread ? (fitWidth - PAD * 2 - GAP) / 2 : fitWidth - PAD * 2;
          scale = across / base.width;
          if (zoom === 'fit' && fitHeight) scale = Math.min(scale, (fitHeight - PAD * 2) / base.height);
        }
        scale = clampZoom(scale);

        // keep the reading position
        const ratio = scroller.scrollHeight > scroller.clientHeight ? scroller.scrollTop / scroller.scrollHeight : 0;
        const { pages, boxes } = layout;
        boxes.forEach((box, i) => {
          const view = pages[i].getViewport({ scale });
          box.style.width = `${view.width}px`;
          box.style.height = `${view.height}px`;
          // pdf.js sizes the text layer with this, so a stretched old drawing still lines up
          box.style.setProperty('--total-scale-factor', String(scale));
        });
        layoutRef.current = { ...layout, scale };
        const rows: HTMLElement[] = [];
        if (spread) {
          for (let i = 0; i < boxes.length; i += 2) {
            const row = document.createElement('div');
            row.className = 'pdf-spread';
            row.append(...boxes.slice(i, i + 2));
            rows.push(row);
          }
        }
        host.replaceChildren(...(spread ? rows : boxes));
        boxes.forEach((box) => observerRef.current?.observe(box));
        host.style.transform = '';
        const anchor = anchorRef.current;
        anchorRef.current = null;
        if (anchor && boxes.includes(anchor.box)) {
          // a pinch: put the point that was under the fingers back under them
          const view = scroller.getBoundingClientRect();
          const r = anchor.box.getBoundingClientRect();
          scroller.scrollLeft += r.left + anchor.fx * r.width - (view.left + anchor.vx);
          scroller.scrollTop += r.top + anchor.fy * r.height - (view.top + anchor.vy);
        } else scroller.scrollTop = ratio * scroller.scrollHeight;
        // pages already near the view don't cross the observer's edge again: redraw them now
        visibleRef.current.forEach((box) => drawPage(box, layoutRef.current));
        setError('');
        setRendered((n) => n + 1);
        cb.current.onScale(scale);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, zoom, spread, fitWidth, fitHeight]);

  // annotation markers sit on top of the rendered pages
  useEffect(() => {
    const host = pagesRef.current;
    if (!host) return;
    host.querySelectorAll('.pdf-annotation').forEach((node) => node.remove());
    for (const note of annotations) {
      const page = host.querySelector(`.pdf-page[data-page-number="${note.page}"]`);
      if (!page) continue;
      const marker = document.createElement('div');
      marker.className = 'pdf-annotation';
      marker.style.left = `${note.x * 100}%`;
      marker.style.top = `${note.y * 100}%`;
      marker.title = note.text;
      page.appendChild(marker);
    }
  }, [annotations, rendered]);

  // current page = the one crossing the upper third of the view
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = scroller.scrollTop + scroller.clientHeight / 3;
        let current = 1;
        let rowTop = -1;
        // in two-page view the left page of a row counts
        scroller.querySelectorAll<HTMLElement>('.pdf-page').forEach((page) => {
          const top = page.offsetTop;
          if (top <= line && top !== rowTop) current = Number(page.dataset.pageNumber) || current;
          rowTop = top;
        });
        cb.current.onPage(current);
      });
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', update);
      cancelAnimationFrame(frame);
    };
  }, [rendered]);

  return (
    <div
      ref={scrollRef}
      className={`pdf-scroll ${annotateMode ? 'annotate' : ''} ${spread ? 'spread' : ''} ${darkPages ? 'dark-pages' : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        const page = target.closest<HTMLElement>('.pdf-page');
        if (annotateMode && page) {
          const rect = page.getBoundingClientRect();
          onAddAnnotation(Number(page.dataset.pageNumber), (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
          return;
        }
        // a click (not a drag-selection) on a word jumps to the source
        if (target.tagName === 'SPAN' && target.closest('.textLayer') && !window.getSelection()?.toString()) {
          const text = (target.textContent || '').trim();
          if (text.length >= 3) onTextClick(text);
        }
      }}
    >
      <div ref={pagesRef} className="pdf-pages" />
      {error && <div className="pdf-error">Couldn’t show the PDF: {error}</div>}
    </div>
  );
});

export default PdfPreview;
