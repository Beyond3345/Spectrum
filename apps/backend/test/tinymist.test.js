// The Tinymist bridge (services/tinymistService.js, routes/tinymist.js): with a stand-in server, and the jumps with a
// real Tinymist when SPECTRUM_TEST_TINYMIST names one (skipped otherwise). In-process, against throwaway data and
// projects folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-tinymist-')));
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject } = await import('../src/services/projectService.js');
const { stopProjectTinymist, stopTinymist } = await import('../src/services/tinymistService.js');
const { registerTinymistRoutes } = await import('../src/routes/tinymist.js');
const { default: Fastify } = await import('fastify');

const fixture = fileURLToPath(new URL('./fixtures/fake-tinymist.mjs', import.meta.url));
const realTinymist = process.env.SPECTRUM_TEST_TINYMIST && existsSync(process.env.SPECTRUM_TEST_TINYMIST) ? process.env.SPECTRUM_TEST_TINYMIST : null;

const app = Fastify();
app.setErrorHandler(async (err, req, reply) => reply.code(err.statusCode || 500).send({ ok: false, error: err.message }));
registerTinymistRoutes(app);
await app.listen({ port: 0, host: '127.0.0.1' });
const base = `http://127.0.0.1:${app.server.address().port}`;

after(async () => {
  await stopTinymist();
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

const newProject = (files) =>
  createProject({
    name: 'Tinymist bridge',
    populate: async (root) => {
      for (const [rel, text] of Object.entries(files)) await fs.writeFile(path.join(root, rel), text);
    }
  });
const post = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const until = async (check, what, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((resolve) => setTimeout(resolve, 25))) {
    const value = await check();
    if (value) return value;
  }
  throw new Error(`never ${what}`);
};

/** The tinymist route's event stream: each event's name and data, and next(test) for the first one that passes. */
async function connect(p) {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/projects/${p.id}/tinymist`, { signal: controller.signal });
  const events = [];
  if (res.ok) {
    (async () => {
      const decoder = new TextDecoder();
      let text = '';
      try {
        for await (const chunk of res.body) {
          text += decoder.decode(chunk, { stream: true });
          for (let at = text.indexOf('\n\n'); at >= 0; at = text.indexOf('\n\n')) {
            const block = text.slice(0, at);
            text = text.slice(at + 2);
            const data = /^data: (.*)$/m.exec(block)?.[1];
            if (data) events.push({ event: /^event: (.*)$/m.exec(block)?.[1] || 'message', data: JSON.parse(data) });
          }
        }
      } catch {
        // closed
      }
    })();
  }
  const next = (match, what) => until(() => events.find(match), what);
  return { status: res.status, events, next, close: () => controller.abort() };
}

test('without Tinymist the routes say it isn’t available', async () => {
  const p = await newProject({ 'main.typ': '= Hello\n' });
  process.env.SPECTRUM_TINYMIST = path.join(tmp, 'no-tinymist');
  assert.equal((await connect(p)).status, 503);
  const res = await post(`/api/projects/${p.id}/tinymist/source`, { doc: 'main.typ', page: 1, x: 10, y: 10 });
  assert.equal(res.status, 503);
});

test('the bridge does the handshake, relays an editor’s messages and runs no command of an editor’s', async () => {
  const logFile = path.join(tmp, 'fake.log');
  Object.assign(process.env, { SPECTRUM_TINYMIST: fixture, FAKE_TINYMIST_LOG: logFile });
  const received = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  const p = await newProject({ 'main.typ': '#include "chapter.typ"\n', 'chapter.typ': '= Chapter\n' });
  const uri = pathToFileURL(path.join(p.path, 'chapter.typ')).href;

  const editor = await connect(p);
  assert.equal(editor.status, 200);
  const { data: hello } = await editor.next((e) => e.event === 'hello', 'said hello');
  assert.equal(hello.rootUri, pathToFileURL(p.path).href);
  const lsp = (body) => post(`/api/projects/${p.id}/tinymist?client=${hello.client}`, body);

  // Spectrum's own handshake: Spectrum's PDF stays its own, packages go where the compiles keep them, the main
  // document is checked whole, and Tinymist's ask for settings is answered
  await until(() => received().some((m) => m.method === 'workspace/executeCommand'), 'pinned the main file');
  const [start, initialize] = received();
  assert.equal(start.cwd, realpathSync.native(tmpdir()));
  assert.equal(start.cache, path.join(tmp, 'data', 'typst', 'packages'));
  assert.deepEqual(start.args, ['lsp']);
  assert.equal(initialize.params.initializationOptions.exportPdf, 'never');
  assert.equal(initialize.params.initializationOptions.formatterMode, 'typstyle');
  assert.deepEqual(received().find((m) => m.method === 'workspace/executeCommand').params, { command: 'tinymist.pinMain', arguments: [path.join(p.path, 'main.typ')] });
  await until(() => received().find((m) => m.id === 'config-1')?.result?.[0]?.exportPdf === 'never', 'answered the settings');

  // the editor's initialize is answered from the bridge's, and its messages go through in order
  await lsp([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'typst', version: 0, text: 'one two three' } } },
    { jsonrpc: '2.0', id: 2, method: 'textDocument/hover', params: { textDocument: { uri }, position: { line: 0, character: 3 } } },
    { jsonrpc: '2.0', id: 3, method: 'workspace/executeCommand', params: { command: 'tinymist.exportPdf', arguments: [] } },
    { jsonrpc: '2.0', id: 4, method: 'textDocument/hover', params: { textDocument: { uri: 'file:///elsewhere/x.typ' }, position: { line: 0, character: 0 } } }
  ]);
  const answer = (id) => editor.next((e) => e.data.id === id, `answered ${id}`);
  assert.equal((await answer(1)).data.result.serverInfo.name, 'Fake Tinymist');
  assert.equal((await answer(2)).data.result.contents, 'Hover at 0:3');
  assert.match((await answer(3)).data.error.message, /isn’t available here/);
  assert.match((await answer(4)).data.error.message, /isn’t available here/);
  // what Tinymist found in the file before the editor opened it comes with the opening
  const kept = editor.events.filter((e) => e.data.method === 'textDocument/publishDiagnostics' && e.data.params.uri === uri);
  assert.ok(kept.length >= 1 && kept.at(-1).data.params.diagnostics[0].message === 'unknown variable');
  // the word count comes through; the outline and the log don't
  assert.equal((await editor.next((e) => e.data.method === 'tinymist/compileStatus', 'passed the status')).data.params.wordsCount.words, 3);
  assert.ok(!editor.events.some((e) => ['window/logMessage', 'tinymist/documentOutline'].includes(e.data.method)));
  assert.ok(received().filter((m) => m.method === 'workspace/executeCommand').every((m) => m.params.command === 'tinymist.pinMain'));

  // when the editor goes, the file it had open goes back to the disk's text
  editor.close();
  await until(() => received().some((m) => m.method === 'textDocument/didClose' && m.params.textDocument.uri === uri), 'closed the file');
  await stopProjectTinymist(p.id);
});

test('the hidden preview jumps from the PDF to the source and back', { skip: !realTinymist && 'set SPECTRUM_TEST_TINYMIST to a Tinymist' }, async () => {
  process.env.SPECTRUM_TINYMIST = realTinymist;
  const p = await newProject({
    'main.typ': '#set page(width: 12cm, height: 10cm)\n= Introduction\nHello world, this is the first paragraph.\n\n#include "chapter.typ"\n\nThe same words. The same words.\n',
    'chapter.typ': '== Chapter\nThe chapter text, and the same words.\n'
  });
  const editor = await connect(p);
  await editor.next((e) => e.event === 'hello', 'said hello');
  const jump = (to, body) => post(`/api/projects/${p.id}/tinymist/${to}`, { doc: 'main.typ', ...body }).then((res) => res.json());

  // source → PDF: the start of the text the place is in, on its baseline (Typst's margin is 33.75 points here)
  const intro = await jump('pdf', { file: 'main.typ', line: 3, column: 10 });
  assert.equal(intro.ok, true);
  assert.equal(intro.page, 1);
  assert.ok(Math.abs(intro.x - 33.75) < 0.1, `x ${intro.x}`);
  const chapter = await jump('pdf', { file: 'chapter.typ', line: 2, column: 5 });
  assert.equal(chapter.page, 1);
  assert.ok(chapter.y > intro.y + 20, `the chapter's text is below: ${chapter.y}`);

  // PDF → source: the very character, in an included file too, and nothing between the lines
  const there = await jump('source', { page: 1, x: intro.x + 2, y: intro.y - 3 });
  assert.deepEqual([there.file, there.line], ['main.typ', 3]);
  const inChapter = await jump('source', { page: 1, x: chapter.x + 2, y: chapter.y - 3 });
  assert.deepEqual([inChapter.file, inChapter.line, inChapter.column], ['chapter.typ', 2, 1]);
  assert.deepEqual(await jump('source', { page: 1, x: 200, y: 280 }), { ok: false });
  // a file outside the project is refused
  assert.match((await jump('pdf', { file: '../x.typ', line: 1, column: 1 })).error, /isn’t in this project/);
  editor.close();
  await stopProjectTinymist(p.id);
});
