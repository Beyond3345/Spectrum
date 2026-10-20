import { parentPort } from 'node:worker_threads';

// Keep the upstream ES modules intact and their prototype extensions off the main thread.
const runtime = import(new URL('./pylatexenc/index.mjs', import.meta.url));
runtime.catch(() => {});
parentPort.on('message', async ({ text, operation, buffer }) => {
  const state = new Int32Array(buffer, 0, 2);
  try {
    const converter = await runtime;
    const output = new TextEncoder().encode(operation === 'encode' ? converter.unicodeToLatex(text) : converter.latexToText(text));
    const bytes = new Uint8Array(buffer, 8);
    if (output.length > bytes.length) throw new Error('Converted text is too large');
    bytes.set(output);
    Atomics.store(state, 1, output.length);
    Atomics.store(state, 0, 1);
  } catch {
    Atomics.store(state, 0, -1);
  } finally {
    Atomics.notify(state, 0);
  }
});
