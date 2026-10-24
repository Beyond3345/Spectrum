// Circuit symbols drawn by the user's own circuitikz in the diagram's style. The backend compiles one
// page per part and reads each pin back (/api/diagram/symbols); pdf.js turns the pages into images.
// Kept in memory per style, and in IndexedDB so the next window opens with them.
import { useEffect, useSyncExternalStore } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CATALOGUE, PARTS, PT_PER_GRID, placeholderShape, variantKey } from './model';
import type { Pt, Shape } from './model';

GlobalWorkerOptions.workerSrc = pdfWorker;

/** A symbol as the canvas draws it. */
export interface CircuitSymbol {
  /** PNG data URL */
  image: string;
  /** the page's size, in pt */
  width: number;
  height: number;
  /** the reference point on the page, in pt from its top left corner (y down) */
  origin: Pt;
  /** a path part's symbol middle, between its left and right anchors, in pt from the reference point (y up); 0,0 for a node */
  middle: Pt;
  shape: Shape;
}

interface SymbolPage {
  id: string;
  page: number;
  width: number;
  height: number;
  origin: Pt;
  pins: { name: string; x: number; y: number }[];
}

/** pixels per pt in the stored images: sharp up to about four times zoom */
const RENDER_SCALE = 6;

export interface Variant {
  type: string;
  options: string[];
}

/** One request part. `pins` names the anchors to report (an addition to the route's contract: a path part's left and right ends and its extra pins, or a node's pins). */
function requestPart({ type, options }: Variant) {
  const part = PARTS.get(type)!;
  const pins = part.kind === 'path' ? ['left', 'right', ...(part.pins || [])] : part.pins || [];
  return { id: variantKey(type, options), tikz: part.tikz, kind: part.kind, ...(options.length ? { options: [...options].sort() } : null), pins };
}

function toSymbol(page: SymbolPage, image: string, type: string): CircuitSymbol {
  const part = PARTS.get(type);
  const pins = Object.fromEntries(page.pins.map((pin) => [pin.name, { x: pin.x, y: pin.y }]));
  const grid = (p: Pt) => ({ x: p.x / PT_PER_GRID, y: p.y / PT_PER_GRID });
  const base = { image, width: page.width, height: page.height, origin: page.origin };
  if (part?.kind !== 'path') return { ...base, middle: { x: 0, y: 0 }, shape: { pins: Object.fromEntries(Object.entries(pins).map(([name, p]) => [name, grid(p)])) } };
  const { left, right } = pins;
  if (!left || !right) return { ...base, middle: { x: page.width / 2 - page.origin.x, y: 0 }, shape: placeholderShape(type) };
  // the symbol is drawn from left to right along x, so its extra pins are already in the part's own frame
  const middle = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  const extras = (part.pins || []).filter((name) => pins[name]).map((name) => [name, grid({ x: pins[name].x - middle.x, y: pins[name].y - middle.y })]);
  return { ...base, middle, shape: { length: Math.abs(right.x - left.x) / PT_PER_GRID, pins: Object.fromEntries(extras) } };
}

async function renderPages(pdfBase64: string, pages: SymbolPage[]) {
  const data = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
  const task = getDocument({ data });
  try {
    const pdf = await task.promise;
    const images: string[] = [];
    for (const meta of pages) {
      const page = await pdf.getPage(meta.page);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas to draw the symbols on');
      // see-through, so the canvas behind shows and dark mode can invert the ink
      await page.render({ canvas, canvasContext: ctx, viewport, background: 'rgba(0,0,0,0)' }).promise;
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
  const body = { parts: variants.map(requestPart), style: { ctikzOptions } };
  const cacheKey = JSON.stringify(body);
  try {
    let found = await idb<Record<string, CircuitSymbol>>('readonly', (store) => store.get(cacheKey));
    if (!found) {
      const res = await fetch('/api/diagram/symbols', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cacheKey });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; pdf?: string; pages?: SymbolPage[]; error?: string };
      if (!res.ok || !data.ok || !data.pdf || !data.pages) throw new Error(data.error || 'TeX couldn’t draw the symbols');
      const pages = data.pages;
      const images = await renderPages(data.pdf, pages);
      const typeOf = new Map(variants.map((v) => [variantKey(v.type, v.options), v.type]));
      found = Object.fromEntries(pages.map((page, i) => [page.id, toSymbol(page, images[i], typeOf.get(page.id) || '')]));
      const toStore = found;
      void idb('readwrite', (store) => store.put(toStore, cacheKey));
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

/** Every catalogue part with no options: one request per style, so the backend's cache serves it again. */
const BASE: Variant[] = CATALOGUE.map((part) => ({ type: part.id, options: [] }));

/**
 * The symbols for a style, loading what's missing: the whole catalogue first, then any option variants the
 * drawing uses. Whatever fails stays an outline until the style changes or the window reopens.
 */
export function useSymbols(ctikzOptions: string, used: Variant[]) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version
  );
  const entry = forStyle(ctikzOptions);
  const usedKey = used.map((v) => variantKey(v.type, v.options)).sort().join('\n');
  useEffect(() => {
    const wanted = (v: Variant) => {
      const k = variantKey(v.type, v.options);
      return PARTS.has(v.type) && !entry.symbols.has(k) && !entry.loading.has(k) && !entry.failed.has(k);
    };
    if (BASE.some(wanted)) void load(ctikzOptions, BASE.filter(wanted));
    const extra = new Map(used.filter((v) => v.options.length && wanted(v)).map((v) => [variantKey(v.type, v.options), v]));
    if (extra.size) void load(ctikzOptions, [...extra.values()].sort((a, b) => variantKey(a.type, a.options).localeCompare(variantKey(b.type, b.options))));
    // usedKey stands for used
  }, [ctikzOptions, usedKey, entry]);
  return { symbol: (key: string) => entry.symbols.get(key) || latest.get(key), loading: entry.loading.size > 0, error: entry.failed.size ? entry.error : '' };
}
