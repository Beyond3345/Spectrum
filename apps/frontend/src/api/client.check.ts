// Self-check for getFile's reads asked for together going as one request, and each answering as its own would.
// Run: npx esbuild apps/frontend/src/api/client.check.ts --bundle --platform=node --log-level=warning | node
import { ApiError, base64Bytes, getFile } from './client';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const asked: string[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  asked.push(`${init?.method || 'GET'} ${url}`);
  const body = url.endsWith('/files')
    ? { files: (JSON.parse(String(init?.body)).paths as string[]).map((p) => (p === 'gone.tex' ? { status: 404, error: 'File not found.' } : { content: p, hash: 'h' })) }
    : { content: 'alone', hash: 'h' };
  return new Response(JSON.stringify(body), { status: 200 });
}) as typeof fetch;

eq([...base64Bytes(btoa('\u0000\u00ffPDF'))], [0, 255, 80, 68, 70], 'base64 to bytes');
const native = (Uint8Array as { fromBase64?: unknown }).fromBase64;
delete (Uint8Array as { fromBase64?: unknown }).fromBase64;
eq([...base64Bytes(btoa('\u0000\u00ffPDF'))], [0, 255, 80, 68, 70], 'base64 to bytes without the built-in decoder');
(Uint8Array as { fromBase64?: unknown }).fromBase64 = native;

// an error rejects, which ends node with a failure
void (async () => {
  const results = await Promise.allSettled([getFile('a', 'main.tex'), getFile('a', 'gone.tex'), getFile('a', 'ch1.tex'), getFile('b', 'other.tex')]);
  eq(asked, ['POST /api/projects/a/files', 'GET /api/projects/b/file?path=other.tex'], 'one request a project, a lone read as before');
  eq(results.map((r) => (r.status === 'fulfilled' ? r.value.content : (r.reason as ApiError).status)), ['main.tex', 404, 'ch1.tex', 'alone'], 'each read its own answer');
  eq((await getFile('a', 'later.tex')).content, 'alone', 'a read asked for later goes by itself');
  console.log('client checks passed');
})();
