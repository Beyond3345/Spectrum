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

const PAD = 20;
const GAP = 14;
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
 * column resizes resize the boxes at once and redraw the visible pages.
 */
const PdfPreview = forwardRef<
  PdfHandle,
  {
    url: string;
    zoom: PdfZoom;
    spread: boolean;
    annotateMode: boolean;
    annotations: PdfAnnotation[];
    onAddAnnotation(page: number, x: number, y: number): void;
    onTextClick(text: string): void;
    onLoad(info: { pages: number; outline: PdfOutlineItem[] }): void;
    onScale(scale: number): void;
    onPage(page: number): void;
  }
>(function PdfPreview({ url, zoom, spread, annotateMode, annotations, onAddAnnotation, onTextClick, onLoad, onScale, onPage }, ref) {
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
  const cb = useRef({ onLoad, onScale, onPage });
  cb.current = { onLoad, onScale, onPage };

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
            drawPage(box, layoutRef.current);
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
        scale = Math.max(0.1, scale);

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
        scroller.scrollTop = ratio * scroller.scrollHeight;
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
      className={`pdf-scroll ${annotateMode ? 'annotate' : ''} ${spread ? 'spread' : ''}`}
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
