// Self-check for getFile's reads asked for together going as one request, and each answering as its own would.
// Run: npx esbuild apps/frontend/src/api/client.check.ts --bundle --platform=node --log-level=warning | node
import { ApiError, SESSION_LOST, base64Bytes, getFile } from './client';

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

  // a window the desktop app's server refuses says so once, over the page, whatever was asked
  type Shown = { id: string; className: string; textContent: string; role?: string; lines: string[] };
  const shown: Shown[] = [];
  const element = () => {
    const el = { id: '', className: '', textContent: '', role: undefined as string | undefined, lines: [] as string[], setAttribute: (_: string, value: string) => (el.role = value), append: (child: Shown) => el.lines.push(child.textContent) };
    return el;
  };
  (globalThis as { document?: unknown }).document = { getElementById: (id: string) => shown.find((el) => el.id === id) ?? null, createElement: element, body: { append: (el: Shown) => shown.push(el) } };
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false, code: 'session', error: 'Spectrum only answers its own windows.' }), { status: 403 })) as typeof fetch;
  const refused = await Promise.allSettled([getFile('c', 'main.tex'), getFile('d', 'main.tex')]);
  eq(refused.map((r) => r.status === 'rejected' && (r.reason as ApiError).message), [SESSION_LOST, SESSION_LOST], 'a refused window says to open Spectrum again');
  eq(shown.map((el) => [el.id, el.role, el.lines[1]]), [['session-lost', 'alert', SESSION_LOST]], 'the notice is shown once');
  // another 403 (a request from elsewhere) is only its own error
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false, error: 'Spectrum only accepts requests from this computer.' }), { status: 403 })) as typeof fetch;
  eq(await getFile('e', 'main.tex').catch((err: ApiError) => err.message), 'Spectrum only accepts requests from this computer.', 'another refusal keeps its own words');
  eq(shown.length, 1, 'and shows no notice');
  console.log('client checks passed');
})();
