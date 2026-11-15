// Circuit symbols drawn by the user's own circuitikz in the diagram's style, and other sets' symbols beside them. The
// backend compiles one page per part and reads each pin back (/api/diagram/symbols); pdf.js turns the pages into
// images. Kept in memory per style, and in IndexedDB so the next window opens with them. A part the canvas shows larger
// than those images are drawn is drawn again, sharper, from the same PDF.
import { useEffect, useSyncExternalStore } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { base64Bytes, diagramSymbols } from '../../../api/client';
import { SYMBOL_SETS } from '../../../../../backend/src/data/symbolSets.js';
import { loadSettings } from '../../../app/settings';
import { CATALOGUE, PARTS, drawsSymbol, variantKey } from './model';
import { symbolGeometry, symbolRequest } from './symbolGeometry';
import type { Pt, Shape } from './model';

GlobalWorkerOptions.workerSrc = pdfWorker;

/** A symbol as the canvas draws it. */
export interface CircuitSymbol {
  /** PNG data URL */
  image: string;
  /** the page's size, in PDF points */
  width: number;
  height: number;
  /** the reference point on the page, in PDF points from its top left corner (y down) */
  origin: Pt;
  /** a path part's symbol middle, between its left and right anchors, in PDF points from the reference point (y up); 0,0 for a node */
  middle: Pt;
  shape: Shape;
}

/** pixels per PDF point in the stored images, which the rail and the canvas up to about 200 % on a 2× screen show */
const RENDER_SCALE = 6;
/** the sharper images' pixels per PDF point: the canvas at 600 % on a 2× screen shows 17 */
const SHARP_SCALES = [12, 18];

export interface Variant {
  type: string;
  options: string[];
}

async function renderPages(pdfBase64: string, pages: number[], scale = RENDER_SCALE) {
  const data = base64Bytes(pdfBase64);
  const task = getDocument({ data });
  try {
    const pdf = await task.promise;
    const images: string[] = [];
    for (const n of pages) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas to draw the symbols on');
      // see-through, so the canvas behind shows and dark mode can invert the ink. The page fills the whole pixels exactly
      // (a stretch of under 1 px): the canvas shows the image at the page's size, and an image drawn at the viewport's
      // size inside a rounded-up canvas would be squeezed, moving the leads off their pins by up to a pixel
      const transform = [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0];
      await page.render({ canvas, canvasContext: ctx, viewport, transform, background: 'rgba(0,0,0,0)' }).promise;
      images.push(canvas.toDataURL('image/png'));
    }
    return images;
  } finally {
    await task.destroy();
  }
}

// ─── IndexedDB, best effort: private windows and blocked storage just skip it ───

const DB = 'spectrum-diagram';
const STORE = 'circuit-symbols';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    } finally {
      db.close();
    }
  });
}

// ─── the store the canvas and the rail read ───

interface StyleSymbols {
  symbols: Map<string, CircuitSymbol>;
  loading: Set<string>;
  failed: Set<string>;
  error: string;
}

const styles = new Map<string, StyleSymbols>();
/** each variant as last drawn in any style: shown while a new style's symbols load, so parts don't jump to outlines */
const latest = new Map<string, CircuitSymbol>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version += 1;
  listeners.forEach((fn) => fn());
};

const forStyle = (ctikzOptions: string) => {
  let entry = styles.get(ctikzOptions);
  if (!entry) styles.set(ctikzOptions, (entry = { symbols: new Map(), loading: new Set(), failed: new Set(), error: '' }));
  return entry;
};

async function load(ctikzOptions: string, variants: Variant[]) {
  const entry = forStyle(ctikzOptions);
  const keys = variants.map((v) => variantKey(v.type, v.options));
  keys.forEach((k) => entry.loading.add(k));
  changed();
  // the TeX folder chosen in Settings › Engines › LaTeX, as the preview compiles with
  const body = { parts: variants.map(symbolRequest), style: { ctikzOptions }, texFolder: loadSettings().texFolder || undefined };
  // a set's version too, so a changed set draws afresh. ponytail: a TeX update isn't seen here, only in the backend's
  // cache; key this by circuitikz's date as well if that bites
  const versions = Object.fromEntries([...new Set(variants.map((v) => PARTS.get(v.type)?.set || 'circuitikz'))].map((set) => [set, SYMBOL_SETS[set]?.version]));
  // images: bumped when the way pages become images changes, so stored ones are drawn again
  const cacheKey = JSON.stringify({ ...body, versions, images: 2 });
  // the backend draws a part on the page of its place in the request
  keys.forEach((k, i) => sources.set(`${ctikzOptions}\n${k}`, { body, page: i + 1 }));
  try {
    let found = await idb<Record<string, CircuitSymbol>>('readonly', (store) => store.get(cacheKey));
    if (!found) {
      const data = await diagramSymbols(body);
      if (!data.ok || !data.pdf || !data.pages) throw new Error(data.error || 'TeX couldn’t draw the symbols');
      const pages = data.pages;
      pdfs.set(JSON.stringify(body), Promise.resolve(data.pdf));
      const images = await renderPages(data.pdf, pages.map((page) => page.page));
      const typeOf = new Map(variants.map((v) => [variantKey(v.type, v.options), v.type]));
      found = Object.fromEntries(pages.flatMap((page, i) => {
        if (page.error) { entry.error = page.error; return []; }
        const geometry = symbolGeometry(page, typeOf.get(page.id) || '');
        return [[page.id, { image: images[i], width: page.width, height: page.height, origin: page.origin, ...geometry }]];
      }));
      const toStore = found;
      if (Object.keys(found).length === keys.length) void idb('readwrite', (store) => store.put(toStore, cacheKey));
    }
    for (const k of keys) {
      if (!(k in found)) { entry.failed.add(k); entry.error ||= 'TeX did not draw every requested symbol.'; }
    }
    for (const [k, symbol] of Object.entries(found)) {
      entry.symbols.set(k, symbol);
      latest.set(k, symbol);
    }
  } catch (err) {
    keys.forEach((k) => entry.failed.add(k));
    entry.error = err instanceof Error ? err.message : String(err);
  } finally {
    keys.forEach((k) => entry.loading.delete(k));
    changed();
  }
}

// ─── sharper images, of the parts the canvas shows larger than RENDER_SCALE ───

type SymbolsBody = Parameters<typeof diagramSymbols>[0];
/** where each variant was drawn, by style and key: its request and page */
const sources = new Map<string, { body: SymbolsBody; page: number }>();
/** each request's PDF, by the request: kept from the fetch, or fetched again (the backend's cache has it) */
const pdfs = new Map<string, Promise<string>>();
/** style, key and scale → the image; null while it's drawn, or when it couldn't be */
const sharpImages = new Map<string, string | null>();
/** the sharper images asked for since the last draw, by request: drawn a PDF at a time */
const wanted = new Map<string, { body: SymbolsBody; pages: { id: string; page: number; scale: number }[] }>();

async function drawSharp() {
  const batches = [...wanted.values()];
  wanted.clear();
  for (const { body, pages } of batches) {
    const id = JSON.stringify(body);
    if (!pdfs.has(id)) pdfs.set(id, diagramSymbols(body).then((data) => (data.ok && data.pdf ? data.pdf : Promise.reject(new Error(data.error)))));
    try {
      const pdf = await pdfs.get(id)!;
      for (const scale of new Set(pages.map((p) => p.scale))) {
        const these = pages.filter((p) => p.scale === scale);
        const images = await renderPages(pdf, these.map((p) => p.page), scale);
        these.forEach((p, i) => sharpImages.set(p.id, images[i]));
      }
    } catch {
      pdfs.delete(id);
    }
  }
  changed();
}

/**
 * The image of a variant drawn by this style for the canvas at `pxPerPt` CSS pixels a PDF point: the stored one, or a
 * sharper one when the screen shows it larger, once that's drawn. ponytail: the sharper images stay in memory until
 * the window closes; drop the least used if long sessions zoom over hundreds of parts.
 */
function imageFor(ctikzOptions: string, key: string, symbol: CircuitSymbol, pxPerPt: number) {
  const need = pxPerPt * (window.devicePixelRatio || 1);
  const source = sources.get(`${ctikzOptions}\n${key}`);
  if (need <= RENDER_SCALE * 1.05 || !source) return symbol.image;
  const scale = SHARP_SCALES.find((s) => s >= need) ?? SHARP_SCALES[SHARP_SCALES.length - 1];
  const id = `${ctikzOptions}\n${key}\n${scale}`;
  if (!sharpImages.has(id)) {
    sharpImages.set(id, null);
    const request = JSON.stringify(source.body);
    if (!wanted.size) setTimeout(() => void drawSharp());
    if (!wanted.has(request)) wanted.set(request, { body: source.body, pages: [] });
    wanted.get(request)!.pages.push({ id, page: source.page, scale });
  }
  return sharpImages.get(id) || symbol.image;
}

/** A set's catalogue parts with no options: one request per set and style, so the backend's cache serves it again. */
const baseOf = (set: string): Variant[] => CATALOGUE.filter((part) => part.tikz && (part.set || 'circuitikz') === set).map((part) => ({ type: part.id, options: [] }));

/**
 * The symbols for a style, loading what's missing: circuitikz's whole catalogue first, with each other set the
 * drawing has (sets) or uses, then any option variants the drawing uses. Whatever fails stays an outline until the
 * style changes or the window reopens.
 */
export function useSymbols(ctikzOptions: string, used: Variant[], sets: string[] = []) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version
  );
  const entry = forStyle(ctikzOptions);
  const usedKey = used.map((v) => variantKey(v.type, v.options)).sort().join('\n');
  const setsKey = [...new Set(['circuitikz', ...sets, ...used.map((v) => PARTS.get(v.type)?.set || 'circuitikz')])].join('\n');
  useEffect(() => {
    const wanted = (v: Variant) => {
      const k = variantKey(v.type, v.options);
      return drawsSymbol(v.type) && !entry.symbols.has(k) && !entry.loading.has(k) && !entry.failed.has(k);
    };
    for (const set of setsKey.split('\n')) {
      const base = baseOf(set);
      if (base.some(wanted)) void load(ctikzOptions, base.filter(wanted));
    }
    const extra = new Map(used.filter((v) => v.options.length && wanted(v)).map((v) => [variantKey(v.type, v.options), v]));
    if (extra.size) void load(ctikzOptions, [...extra.values()].sort((a, b) => variantKey(a.type, a.options).localeCompare(variantKey(b.type, b.options))));
    // usedKey stands for used, setsKey for sets
  }, [ctikzOptions, usedKey, setsKey, entry]);
  return {
    symbol: (key: string) => entry.symbols.get(key) || latest.get(key),
    /** the image to show a symbol with at this many CSS pixels a PDF point */
    image: (key: string, symbol: CircuitSymbol, pxPerPt: number) => imageFor(ctikzOptions, key, symbol, pxPerPt),
    loading: entry.loading.size > 0,
    error: entry.failed.size ? entry.error : ''
  };
}
