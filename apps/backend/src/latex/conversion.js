import { Worker } from 'node:worker_threads';

let worker;
let warned = false;
const cache = new Map();

function convert(value, operation) {
  const text = String(value ?? '');
  if (!text || operation === 'decode' && !/[\\{}$%~_^`']/.test(text)) return text;
  // shortcut: references longer than 64 KiB stay verbatim; use an async batch parser if full documents need conversion.
  if (text.length > 65_536) return text;
  const key = `${operation}:${text}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  try {
    if (!worker) {
      const current = new Worker(new URL('./latexTextWorker.mjs', import.meta.url), { execArgv: [] });
      current.on('error', () => { if (worker === current) worker = undefined; });
      current.unref();
      worker = current;
    }
    const buffer = new SharedArrayBuffer(8 + Math.max(4096, Buffer.byteLength(text) * 32));
    const state = new Int32Array(buffer, 0, 2);
    worker.postMessage({ text, operation, buffer });
    if (Atomics.wait(state, 0, 0, 2000) === 'timed-out') {
      stopLatexConverter();
      throw new Error('LaTeX conversion timed out');
    }
    if (Atomics.load(state, 0) !== 1) throw new Error('LaTeX conversion failed');
    const result = new TextDecoder().decode(new Uint8Array(buffer, 8, Atomics.load(state, 1)));
    if (cache.size >= 1024) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
  } catch {
    if (!warned) console.warn('Some reference text could not be converted from LaTeX; its original text was kept.');
    warned = true;
    return text;
  }
}

export const latexToText = (text) => convert(text, 'decode');
export const unicodeToLatex = (text) => convert(text, 'encode');
export function stopLatexConverter() {
  const current = worker;
  worker = undefined;
  current?.terminate().catch(() => {});
}
