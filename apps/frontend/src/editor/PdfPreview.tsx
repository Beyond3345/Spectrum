import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { GlobalWorkerOptions, TextLayer, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/legacy/web/pdf_viewer.css';
import type { PdfBox, PdfPoint } from '../api/client';
import { linger, overlayStyle, pdfPoint } from './synctex';
import { findAll, lineBoxFrom, matchBoxes, pageText } from './pdfFind';
import type { TextRun } from './pdfFind';

GlobalWorkerOptions.workerSrc = pdfWorker;

/** 'fit' = whole page visible, 'width' = page as wide as the column, or a fixed scale (1 = 100%) */
export type PdfZoom = 'fit' | 'width' | number;
/** A place in the PDF: a named destination, or pdf.js's explicit one ([page ref or index, { name: 'XYZ' }, left, top, zoom]) */
export type PdfDest = string | unknown[];
/** top: how far down its page the entry points, 0 at the top and 1 at the foot */
export type PdfOutlineItem = { title: string; page?: number; top?: number; dest?: PdfDest; level: number };
/** x and y are PDF points from the page's top-left, as PdfPoint */
export type PdfAnnotation = { id: string; page: number; x: number; y: number; text: string };
export type PdfHandle = {
  scrollToPage(page: number): void;
  /** Scrolls to the spot a link or contents entry names; with `url`, once that PDF (about to be shown) has loaded. */
  goTo(dest: PdfDest, url?: string): void;
  /** Scrolls the first box to the middle of the view and highlights every box for `seconds`. */
  highlight(boxes: PdfBox[], seconds: number): void;
  /**
   * Marks every match of `query` (none for '') and brings match `index` (counted round) into view; resolves to how
   * many there are, at most MAX_MATCHES. The marks follow the PDF through recompiles.
   */
  find(query: string, index: number): Promise<number>;
  /** The boxes of the first match of `query` in the PDF's text, for a source-to-PDF jump without SyncTeX. */
  firstMatch(query: string): Promise<PdfBox[]>;
  /** The box of the text from a spot on a baseline to the end of its line (lineBoxFrom), for Tinymist's jumps. */
  lineFrom(at: PdfPoint): Promise<PdfBox[]>;
  /** A page drawn to fit `width` × `height` CSS pixels (thumbnails, presentation mode); null until the PDF has loaded. */
  renderPage(page: number, width: number, height: number): Promise<HTMLCanvasElement | null>;
};

export const MAX_MATCHES = 1000;

// the page each document's PDF was last read at, by pageKey, for the most recent ones
const PAGES_KEY = 'spectrum-pdf-pages';
const KEPT_PAGES = 200;

function rememberedPages(): Record<string, number> {
  try {
    const pages = JSON.parse(window.localStorage.getItem(PAGES_KEY) || '{}');
    return pages && typeof pages === 'object' ? pages : {};
  } catch {
    return {};
  }
}

/** Opens `key`'s PDF at `page` the next time it is shown. */
export function rememberPage(key: string, page: number) {
  const pages = rememberedPages();
  if (pages[key] === page) return;
  // newest last, so the oldest go first
  delete pages[key];
  pages[key] = page;
  for (const old of Object.keys(pages).slice(0, -KEPT_PAGES)) delete pages[old];
  try {
    window.localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
  } catch {
    // storage unavailable: the page just isn't remembered
  }
}

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

/**
 * How far down its page an explicit destination points, 0 at the top: XYZ (left top zoom), FitH and FitBH name
 * a top, FitR (left bottom right top) its top edge; Fit and FitB show the page from its top.
 */
function destTop(explicit: unknown[], view: PageViewport) {
  const kind = (explicit[1] as { name?: string } | undefined)?.name;
  const top = kind === 'XYZ' ? explicit[3] : kind === 'FitH' || kind === 'FitBH' ? explicit[2] : kind === 'FitR' ? explicit[5] : null;
  return typeof top === 'number' ? Math.min(1, Math.max(0, view.convertToViewportPoint(0, top)[1] / view.height)) : 0;
}

async function readOutline(pdf: PDFDocumentProxy) {
  const items: PdfOutlineItem[] = [];
  const walk = async (entries: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | undefined, level: number) => {
    for (const entry of entries || []) {
      let page: number | undefined;
      let top: number | undefined;
      try {
        const dest = typeof entry.dest === 'string' ? await pdf.getDestination(entry.dest) : entry.dest;
        if (Array.isArray(dest) && dest[0]) {
          page = (await pdf.getPageIndex(dest[0])) + 1;
          top = destTop(dest, (await pdf.getPage(page)).getViewport({ scale: 1 }));
        }
      } catch {
        // an outline entry without a usable destination
      }
      items.push({ title: entry.title || '(untitled)', page, top, dest: entry.dest ?? undefined, level });
      await walk(entry.items, level + 1);
    }
  };
  await walk(await pdf.getOutline().catch(() => []), 0);
  return items;
}

/** A page drawn at `scale`, sharper by the screen's pixel ratio. */
async function drawCanvas(page: PDFPageProxy, scale: number) {
  const view = page.getViewport({ scale });
  const sharpness = Math.min(3, (window.devicePixelRatio || 1) * 1.25, Math.sqrt(MAX_CANVAS_PIXELS / (view.width * view.height)));
  const sharp = page.getViewport({ scale: scale * sharpness });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(sharp.width);
  canvas.height = Math.floor(sharp.height);
  const canvasContext = canvas.getContext('2d');
  if (canvasContext) await page.render({ canvas, canvasContext, viewport: sharp }).promise;
  return canvas;
}

/** A page's canvas and selectable text layer at `scale`. */
async function paintPage(page: PDFPageProxy, scale: number) {
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  const canvas = await drawCanvas(page, scale);
  await new TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport: page.getViewport({ scale }) }).render();
  return { canvas, textLayer };
}

let measurer: CanvasRenderingContext2D | null = null;

/** Text's width in a stand-in for a run's font (pdf.js names a generic family for each), for Find's boxes. */
function measure(styles: Record<string, { fontFamily?: string }>) {
  return (text: string, run: TextRun) => {
    measurer ??= document.createElement('canvas').getContext('2d');
    if (!measurer) return 0;
    measurer.font = `100px ${styles[run.fontName ?? '']?.fontFamily || 'serif'}`;
    return measurer.measureText(text).width;
  };
}

/**
 * The page's links (\\ref, \\cite, the contents, URLs) as clear areas over it, sized in percent so they hold
 * through zoom, made once per PDF. Each keeps where it goes: a destination in this PDF, a web address, or another
 * PDF (xr-hyper's links to a linked document).
 */
async function addLinks(box: HTMLElement, page: PDFPageProxy, url: string) {
  if (box.dataset.links === url) return;
  box.dataset.links = url;
  const annotations = await page.getAnnotations({ intent: 'display' }).catch(() => []);
  if (box.dataset.links !== url) return;
  box.querySelectorAll(':scope > .pdf-link').forEach((node) => node.remove());
  const view = page.getViewport({ scale: 1 });
  for (const a of annotations) {
    if (a.subtype !== 'Link' || !(a.dest || a.url || a.unsafeUrl)) continue;
    const [x1, y1] = view.convertToViewportPoint(a.rect[0], a.rect[1]);
    const [x2, y2] = view.convertToViewportPoint(a.rect[2], a.rect[3]);
    const link = document.createElement('a');
    link.className = 'pdf-link';
    Object.assign(link.style, overlayStyle({ page: page.pageNumber, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }, view));
    if (a.dest) link.dataset.dest = JSON.stringify(a.dest);
    else if (a.url) {
      link.href = a.url;
      link.title = a.url;
    } else link.dataset.file = a.unsafeUrl;
    box.append(link);
  }
}

/** Frees a page box's canvas and text (its annotation markers and links stay). */
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
      addLinks(box, page, layout.url);
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
 * The page colour is CSS on top (editor.css), so changing it never redraws.
 */
const PdfPreview = forwardRef<
  PdfHandle,
  {
    url: string;
    /** where the page being read is remembered (the project and document): a new key opens at its page */
    pageKey: string;
    zoom: PdfZoom;
    spread: boolean;
    annotateMode: boolean;
    annotations: PdfAnnotation[];
    onAddAnnotation(at: PdfPoint): void;
    /** a double-click on a page, with the text run under it (if any) */
    onDoubleClick(at: PdfPoint, text: string): void;
    /** a right-click on a page, and where the pointer is in the window */
    onPageMenu(at: PdfPoint, x: number, y: number): void;
    onLoad(info: { pages: number; outline: PdfOutlineItem[] }): void;
    /** the page count, as soon as the PDF opens (before its pages are laid out, which a hidden pane never does) */
    onPages?(pages: number): void;
    onScale(scale: number): void;
    /** a pinch or ⌘-scroll chose this scale */
    onZoom(scale: number): void;
    onPage(page: number): void;
    /** the contents entry being read changed: the last one above the upper third of the view (-1 before the first) */
    onSection(index: number): void;
    /** a link to another PDF, as written in the link: "notes.pdf#eq:ohm" */
    onFileLink(target: string): void;
  }
>(function PdfPreview({ url, pageKey, zoom, spread, annotateMode, annotations, onAddAnnotation, onDoubleClick, onPageMenu, onLoad, onPages, onScale, onZoom, onPage, onSection, onFileLink }, ref) {
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
  const cb = useRef({ onLoad, onPages, onScale, onZoom, onPage, onSection });
  cb.current = { onLoad, onPages, onScale, onZoom, onPage, onSection };
  // the PDF's contents, for the section being read
  const outlineRef = useRef<PdfOutlineItem[]>([]);
  // the point to keep still when the next layout applies a pinch
  const anchorRef = useRef<Anchor | null>(null);
  // stops the current highlight's timers
  const unlingerRef = useRef(() => {});
  // a place to go once the PDF at `url` has loaded
  const pendingRef = useRef<{ url: string; dest: PdfDest } | null>(null);
  // a link is followed once a double-click (the jump to the source) can no longer be on its way
  const linkTimerRef = useRef(0);
  const keyRef = useRef(pageKey);
  keyRef.current = pageKey;
  // the pageKey of the document the pages show, once they're laid out
  const shownKeyRef = useRef('');
  // the page scrollToPage last went to, and what works out the current page, for a scroll that can't move
  const askedRef = useRef(0);
  const updatePageRef = useRef(() => {});
  // Find: what's asked for, and each page's text runs for the PDF they came from
  const findRef = useRef({ query: '', index: 0 });
  const textRef = useRef<{ url: string; pages: Promise<{ runs: TextRun[]; measure: ReturnType<typeof measure> }[]> } | null>(null);

  /** Brings a mark on a page to the middle of the view, unless it's in view already. */
  const reveal = (mark: HTMLElement) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const [r, s] = [mark.getBoundingClientRect(), scroller.getBoundingClientRect()];
    if (r.top >= s.top && r.bottom <= s.bottom && r.left >= s.left && r.right <= s.right) return;
    // a page box's offsets count from the scroller (neither .pdf-pages nor a two-page row is positioned), a mark's from its page
    const box = mark.parentElement!;
    scroller.scrollTo({
      left: box.offsetLeft + mark.offsetLeft + mark.offsetWidth / 2 - scroller.clientWidth / 2,
      top: box.offsetTop + mark.offsetTop + mark.offsetHeight / 2 - scroller.clientHeight / 2,
      // the reduced-motion CSS doesn't reach a script's smooth scroll
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  };

  /** Each page's text runs, read once for each PDF: Find's matches, and the line a Typst jump lands on. */
  const pageTexts = (layout: NonNullable<typeof layoutRef.current>) => {
    if (textRef.current?.url !== layout.url) {
      const pages = Promise.all(
        layout.pages.map(async (page) => {
          const content = await page.getTextContent();
          return { runs: content.items.filter((item) => 'str' in item), measure: measure(content.styles) };
        })
      );
      textRef.current = { url: layout.url, pages };
    }
    return textRef.current.pages.catch(() => []);
  };

  /** Marks Find's matches on the pages laid out now, and brings the chosen one into view when `show`. */
  const markMatches = async (show: boolean) => {
    const layout = layoutRef.current;
    const asked = findRef.current;
    pagesRef.current?.querySelectorAll('.pdf-find-box').forEach((node) => node.remove());
    if (!layout || !asked.query.trim()) return 0;
    const texts = await pageTexts(layout);
    // asked again, or another PDF, meanwhile: that call marks its own
    if (findRef.current !== asked || layoutRef.current?.url !== layout.url) return 0;
    const matches: HTMLElement[][] = [];
    texts.forEach(({ runs, measure }, i) => {
      const { text, starts } = pageText(runs);
      const view = layout.pages[i].getViewport({ scale: 1 });
      for (const match of findAll(text, asked.query)) {
        if (matches.length >= MAX_MATCHES) return;
        const boxes = matchBoxes(runs, starts, match, i + 1, (x, y) => view.convertToViewportPoint(x, y), measure);
        matches.push(
          boxes.map((b) => {
            const mark = document.createElement('div');
            mark.className = 'pdf-find-box';
            Object.assign(mark.style, overlayStyle(b, view));
            layout.boxes[i].append(mark);
            return mark;
          })
        );
      }
    });
    const chosen = matches[((asked.index % matches.length) + matches.length) % matches.length] || [];
    chosen.forEach((mark) => mark.classList.add('current'));
    if (show && chosen[0]) reveal(chosen[0]);
    return matches.length;
  };

  const goTo = async (dest: PdfDest) => {
    const pdf = await docRef.current?.task.promise.catch(() => null);
    const layout = layoutRef.current;
    const scroller = scrollRef.current;
    if (!pdf || !layout || !scroller) return;
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest).catch(() => null) : dest;
    if (!Array.isArray(explicit) || explicit[0] == null) return;
    const index = typeof explicit[0] === 'number' ? explicit[0] : await pdf.getPageIndex(explicit[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0]).catch(() => -1);
    const box = layout.boxes[index];
    const page = layout.pages[index];
    if (!box || !page) return;
    const fy = destTop(explicit, page.getViewport({ scale: 1 }));
    // a page box's offsets count from the scroller (see highlight)
    scroller.scrollTo({
      top: Math.max(0, box.offsetTop + fy * box.offsetHeight - PAD),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  };

  useImperativeHandle(ref, () => ({
    goTo(dest, target) {
      if (target && target !== layoutRef.current?.url) pendingRef.current = { url: target, dest };
      else goTo(dest);
    },
    scrollToPage(page) {
      const el = pagesRef.current?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${page}"]`);
      const scroller = scrollRef.current;
      if (!el || !scroller) return;
      askedRef.current = page;
      scroller.scrollTo({ top: el.offsetTop - PAD, behavior: 'smooth' });
      // a scroll that can't move (the last pages already in view) sends no scroll event
      updatePageRef.current();
    },
    highlight(boxes, seconds) {
      const layout = layoutRef.current;
      const scroller = scrollRef.current;
      unlingerRef.current();
      pagesRef.current?.querySelectorAll('.pdf-sync-box').forEach((node) => node.remove());
      if (!layout || !scroller) return;
      // inside the page boxes, which keep them through zoom, scrolling and redraws (clearPage leaves them)
      const marks = boxes.flatMap((b) => {
        const box = layout.boxes[b.page - 1];
        const page = layout.pages[b.page - 1];
        if (!box || !page) return [];
        const mark = document.createElement('div');
        mark.className = 'pdf-sync-box';
        Object.assign(mark.style, overlayStyle(b, page.getViewport({ scale: 1 })));
        box.append(mark);
        return [mark];
      });
      if (!marks[0]) return;
      // already in view: leave the PDF where it is, as a double-click also selects a word in the source
      reveal(marks[0]);
      unlingerRef.current = linger(
        seconds,
        () => marks.forEach((mark) => mark.classList.add('fading')),
        () => marks.forEach((mark) => mark.remove())
      );
    },
    find(query, index) {
      // only a new search or another match moves the view
      const moved = query !== findRef.current.query || index !== findRef.current.index;
      findRef.current = { query, index };
      return markMatches(moved);
    },
    async firstMatch(query) {
      const layout = layoutRef.current;
      if (!layout || !query.trim()) return [];
      const texts = await pageTexts(layout);
      for (let i = 0; i < texts.length; i += 1) {
        const { runs, measure } = texts[i];
        const { text, starts } = pageText(runs);
        const match = findAll(text, query)[0];
        if (!match) continue;
        const view = layout.pages[i].getViewport({ scale: 1 });
        return matchBoxes(runs, starts, match, i + 1, (x, y) => view.convertToViewportPoint(x, y), measure);
      }
      return [];
    },
    async lineFrom({ page, x, y }) {
      const layout = layoutRef.current;
      const runs = layout && (await pageTexts(layout))[page - 1]?.runs;
      if (!layout || !runs) return [];
      const view = layout.pages[page - 1].getViewport({ scale: 1 });
      return lineBoxFrom(runs, page, (px, py) => view.convertToViewportPoint(px, py), x, y);
    },
    async renderPage(number, width, height) {
      const page = layoutRef.current?.pages[number - 1];
      if (!page) return null;
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(width / base.width, height / base.height);
      const canvas = await drawCanvas(page, scale);
      canvas.style.width = `${Math.floor(base.width * scale)}px`;
      canvas.style.height = `${Math.floor(base.height * scale)}px`;
      return canvas;
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
      unlingerRef.current();
      docRef.current?.task.destroy();
      docRef.current = null;
      layoutRef.current?.boxes.forEach(clearPage);
    },
    []
  );

  const fitWidth = typeof zoom === 'number' ? 0 : width;
  const fitHeight = zoom === 'fit' ? height : 0;

  // the document opens, and its page count is known, even while a panel hides the pane and it has no width to lay out
  useEffect(() => {
    if (!url) return;
    if (docRef.current?.url !== url) {
      docRef.current?.task.destroy();
      docRef.current = { url, task: getDocument({ url }) };
    }
    let live = true;
    docRef.current.task.promise.then(
      (pdf) => live && cb.current.onPages?.(pdf.numPages),
      () => undefined // the layout below shows the error
    );
    return () => {
      live = false;
    };
  }, [url]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const host = pagesRef.current;
    if (!scroller || !host || !url || (typeof zoom !== 'number' && !fitWidth)) return;
    let cancelled = false;

    if (docRef.current?.url !== url) {
      docRef.current?.task.destroy();
      docRef.current = { url, task: getDocument({ url }) };
    }

    (async () => {
      try {
        const pdf = await docRef.current!.task.promise;
        if (cancelled) return;
        let layout = layoutRef.current;
        // a new PDF: its matches are marked again; another document's opens at its remembered page (or its top)
        const fresh = layout?.url !== url;
        const opening = fresh && shownKeyRef.current !== keyRef.current;
        const outline = fresh ? readOutline(pdf) : null;
        if (!layout || fresh) {
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
          shownKeyRef.current = keyRef.current;
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
        } else if (opening) scroller.scrollTop = Math.max(0, (boxes[(rememberedPages()[keyRef.current] || 1) - 1]?.offsetTop ?? PAD) - PAD);
        else scroller.scrollTop = ratio * scroller.scrollHeight;
        // pages already near the view don't cross the observer's edge again: redraw them now
        visibleRef.current.forEach((box) => drawPage(box, layoutRef.current));
        if (fresh && findRef.current.query) markMatches(false);
        // a link from another PDF said where to go in this one
        if (pendingRef.current?.url === url) {
          const { dest } = pendingRef.current;
          pendingRef.current = null;
          goTo(dest);
        }
        setError('');
        setRendered((n) => n + 1);
        cb.current.onScale(scale);
        // once its pages are laid out, so what's drawn from them (thumbnails, slides) is this PDF's
        outline?.then((items) => {
          if (layoutRef.current?.url !== url) return;
          outlineRef.current = items;
          cb.current.onLoad({ pages: pdf.numPages, outline: items });
          // the section being read, now there are sections
          setRendered((n) => n + 1);
        });
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
    const layout = layoutRef.current;
    for (const note of annotations) {
      const box = layout?.boxes[note.page - 1];
      const page = layout?.pages[note.page - 1];
      if (!box || !page) continue;
      const view = page.getViewport({ scale: 1 });
      const marker = document.createElement('div');
      marker.className = 'pdf-annotation';
      marker.style.left = `${(note.x / view.width) * 100}%`;
      marker.style.top = `${(note.y / view.height) * 100}%`;
      marker.title = note.text;
      box.appendChild(marker);
    }
  }, [annotations, rendered]);

  // current page = the last one whose top is above the upper third of the view, or above its own middle when it's
  // shorter than two thirds of the view (slides), so the first page counts at the top and page n after going to it.
  // A page asked for (End, PgDn) counts while it's all in view, as the end of the document may not scroll to it
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let frame = 0;
    let saved = '';
    let section = -2;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current = 1;
        let down = 0;
        let rowTop = -1;
        // in two-page view the left page of a row counts
        scroller.querySelectorAll<HTMLElement>('.pdf-page').forEach((page) => {
          const top = page.offsetTop;
          const reach = scroller.scrollTop + Math.min(scroller.clientHeight / 3, page.offsetHeight / 2);
          if (top <= reach && top !== rowTop) {
            current = Number(page.dataset.pageNumber) || current;
            down = (reach - top) / (page.offsetHeight || 1);
          }
          rowTop = top;
        });
        const asked = scroller.querySelector<HTMLElement>(`.pdf-page[data-page-number="${askedRef.current}"]`);
        if (asked && asked.offsetTop >= scroller.scrollTop && asked.offsetTop + asked.offsetHeight <= scroller.scrollTop + scroller.clientHeight) {
          current = askedRef.current;
          down = 0;
        }
        cb.current.onPage(current);
        let reading = -1;
        outlineRef.current.forEach((item, i) => {
          if (item.page && (item.page < current || (item.page === current && (item.top ?? 0) <= down))) reading = i;
        });
        if (reading !== section) {
          section = reading;
          cb.current.onSection(reading);
        }
        // only once the pages are this document's
        if (shownKeyRef.current === keyRef.current && saved !== `${keyRef.current}#${current}`) {
          saved = `${keyRef.current}#${current}`;
          rememberPage(keyRef.current, current);
        }
      });
    };
    update();
    updatePageRef.current = update;
    scroller.addEventListener('scroll', update, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', update);
      cancelAnimationFrame(frame);
    };
  }, [rendered]);

  /** Where on which page the pointer is, in PDF points; null between pages. */
  const pointAt = (event: { target: EventTarget; clientX: number; clientY: number }): PdfPoint | null => {
    const box = (event.target as HTMLElement).closest<HTMLElement>('.pdf-page');
    const page = layoutRef.current?.pages[Number(box?.dataset.pageNumber) - 1];
    if (!box || !page) return null;
    return { page: page.pageNumber, ...pdfPoint(event.clientX, event.clientY, box.getBoundingClientRect(), page.getViewport({ scale: 1 })) };
  };

  return (
    <div
      ref={scrollRef}
      className={`pdf-scroll ${annotateMode ? 'annotate' : ''} ${spread ? 'spread' : ''}`}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('.pdf-link');
        if (link && !annotateMode) {
          // never a navigation of the page itself; a web address opens in the browser
          event.preventDefault();
          window.clearTimeout(linkTimerRef.current);
          if (event.detail > 1) return;
          linkTimerRef.current = window.setTimeout(() => {
            if (link.dataset.dest) goTo(JSON.parse(link.dataset.dest));
            else if (link.dataset.file) onFileLink(link.dataset.file);
            else if (link.href) window.open(link.href, '_blank', 'noopener');
          }, 250);
          return;
        }
        const at = annotateMode && pointAt(event);
        if (at) onAddAnnotation(at);
      }}
      // a single click is for reading and selecting; a double-click (which still selects the word) jumps to the source
      onDoubleClick={(event) => {
        const at = pointAt(event);
        if (annotateMode || !at || (event.target as HTMLElement).closest('.pdf-annotation')) return;
        window.clearTimeout(linkTimerRef.current);
        // on a link, the text is under it
        const span = document.elementsFromPoint(event.clientX, event.clientY).find((el) => el.tagName === 'SPAN' && el.closest('.textLayer'));
        const text = span ? (span.textContent || '').trim() : '';
        onDoubleClick(at, text);
      }}
      onContextMenu={(event) => {
        const at = pointAt(event);
        if (!at) return;
        event.preventDefault();
        onPageMenu(at, event.clientX, event.clientY);
      }}
      // a Tab stop, so the page keys and ⌘F can be reached from the keyboard and know the PDF has focus
      tabIndex={0}
    >
      <div ref={pagesRef} className="pdf-pages" />
      {error && <div className="pdf-error">Couldn’t show the PDF: {error}</div>}
    </div>
  );
});

export default PdfPreview;

/** The page box in the PDF's pill: the page being read, which ↩ goes to once it's changed; Esc puts it back. */
export function PageBox({ page, pages, onGo }: { page: number; pages: number | null; onGo(page: number): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="pdf-page-box"
      value={draft ?? String(page)}
      inputMode="numeric"
      aria-label="Page"
      style={{ width: `${String(pages ?? page).length + 1.5}ch` }}
      onFocus={(e) => {
        setDraft(String(page));
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (Number(draft) && pages) onGo(Math.min(pages, Math.max(1, Number(draft))));
        } else if (e.key !== 'Escape') return;
        e.preventDefault();
        // back to the pages, whose keys go on from there; focusing may not scroll, or it stops the scroll to the page
        e.currentTarget.closest('.pdf-body')?.querySelector<HTMLElement>('.pdf-scroll')?.focus({ preventScroll: true });
      }}
    />
  );
}
