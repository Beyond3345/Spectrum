// Circuit symbols drawn by the user's own circuitikz in the diagram's style, and other sets' symbols beside them. The
// backend compiles one page per part and reads each pin back (/api/diagram/symbols); pdf.js turns the pages into
// images. Kept in memory per style, and in IndexedDB so the next window opens with them.
import { useEffect, useSyncExternalStore } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { diagramSymbols } from '../../../api/client';
import type { SymbolPage } from '../../../api/client';
import { SYMBOL_SETS } from '../../../../../backend/src/data/symbolSets.js';
import { loadSettings } from '../../../app/settings';
import { CATALOGUE, PARTS, variantKey } from './model';
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

/** pixels per PDF point in the stored images: sharp up to about four times zoom */
const RENDER_SCALE = 6;

export interface Variant {
  type: string;
  options: string[];
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
  // the TeX folder chosen in Settings › Engines › LaTeX, as the preview compiles with
  const body = { parts: variants.map(symbolRequest), style: { ctikzOptions }, texFolder: loadSettings().texFolder || undefined };
  // a set's version too, so a changed set draws afresh. ponytail: a TeX update isn't seen here, only in the backend's
  // cache; key this by circuitikz's date as well if that bites
  const versions = Object.fromEntries([...new Set(variants.map((v) => PARTS.get(v.type)?.set || 'circuitikz'))].map((set) => [set, SYMBOL_SETS[set]?.version]));
  const cacheKey = JSON.stringify({ ...body, versions });
  try {
    let found = await idb<Record<string, CircuitSymbol>>('readonly', (store) => store.get(cacheKey));
    if (!found) {
      const data = await diagramSymbols(body);
      if (!data.ok || !data.pdf || !data.pages) throw new Error(data.error || 'TeX couldn’t draw the symbols');
      const pages = data.pages;
      const images = await renderPages(data.pdf, pages);
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

/** A set's catalogue parts with no options: one request per set and style, so the backend's cache serves it again. */
const baseOf = (set: string): Variant[] => CATALOGUE.filter((part) => (part.set || 'circuitikz') === set).map((part) => ({ type: part.id, options: [] }));

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
      return PARTS.has(v.type) && !entry.symbols.has(k) && !entry.loading.has(k) && !entry.failed.has(k);
    };
    for (const set of setsKey.split('\n')) {
      const base = baseOf(set);
      if (base.some(wanted)) void load(ctikzOptions, base.filter(wanted));
    }
    const extra = new Map(used.filter((v) => v.options.length && wanted(v)).map((v) => [variantKey(v.type, v.options), v]));
    if (extra.size) void load(ctikzOptions, [...extra.values()].sort((a, b) => variantKey(a.type, a.options).localeCompare(variantKey(b.type, b.options))));
    // usedKey stands for used, setsKey for sets
  }, [ctikzOptions, usedKey, setsKey, entry]);
  return { symbol: (key: string) => entry.symbols.get(key) || latest.get(key), loading: entry.loading.size > 0, error: entry.failed.size ? entry.error : '' };
}
