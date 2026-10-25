// The TexLab bridge (services/texlabService.js, routes/texlab.js): with a stand-in server, and with the real TexLab
// when one is on the PATH (skipped otherwise). In-process, against throwaway data and projects folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-texlab-')));
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject, cachePath, moveEntry } = await import('../src/services/projectService.js');
const { auxStore, findExecutable } = await import('../src/services/compileService.js');
const { writeFileAtomic } = await import('../src/utils/fsUtils.js');
const { auxKept, frame, readFrames, stopProjectTexlab, stopTexlab } = await import('../src/services/texlabService.js');
const { registerTexlabRoutes } = await import('../src/routes/texlab.js');
const { default: Fastify } = await import('fastify');
const { PassThrough } = await import('node:stream');

const fixture = fileURLToPath(new URL('./fixtures/fake-texlab.mjs', import.meta.url));
const realTexlab = await findExecutable('texlab');
const WINDOWS = process.platform === 'win32';

const app = Fastify();
app.setErrorHandler(async (err, req, reply) => reply.code(err.statusCode || 500).send({ ok: false, error: err.message }));
registerTexlabRoutes(app);
await app.listen({ port: 0, host: '127.0.0.1' });
const base = `http://127.0.0.1:${app.server.address().port}`;

after(async () => {
  await stopTexlab();
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

const newProject = (files) =>
  createProject({
    name: 'TexLab bridge',
    populate: async (root) => {
      for (const [rel, text] of Object.entries(files)) await fs.writeFile(path.join(root, rel), text);
    }
  });
const diagnostics = async (p) => (await fetch(`${base}/api/projects/${p.id}/diagnostics`)).json();
const post = (p, client, body) => fetch(`${base}/api/projects/${p.id}/lsp?client=${client}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const until = async (check, what, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((resolve) => setTimeout(resolve, 25))) {
    const value = await check();
    if (value) return value;
  }
  throw new Error(`never ${what}`);
};

/** The lsp route's event stream: each event's name and data, and next(test) for the first one (from now on, or already in) that passes. */
async function connect(p) {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/projects/${p.id}/lsp`, { signal: controller.signal });
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

test('the framing reads messages split anywhere and several to a chunk', async () => {
  const stream = new PassThrough();
  const got = [];
  readFrames(stream, (message) => got.push(message));
  const text = frame({ id: 1, result: 'héllo' }) + frame({ method: 'x', params: { long: 'y'.repeat(70_000) } }) + 'Content-Length: 3\r\n\r\nnot' + frame({ id: 2 });
  const bytes = Buffer.from(text);
  for (let i = 0; i < bytes.length; i += 4096) stream.write(bytes.subarray(i, i + 4096));
  stream.write(Buffer.from(frame({ id: 3 }).repeat(2)));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(got.map((m) => m.id ?? m.method), [1, 'x', 2, 3, 3]);
  assert.equal(got[0].result, 'héllo');
  assert.equal(got[1].params.long.length, 70_000);
});

test('without TexLab the routes say it isn’t available', async () => {
  const p = await newProject({ 'main.tex': '\\documentclass{article}\n' });
  const was = process.env.PATH;
  Object.assign(process.env, { SPECTRUM_TEXLAB: path.join(tmp, 'no-texlab'), PATH: path.join(tmp, 'empty') });
  try {
    assert.deepEqual(await diagnostics(p), { ok: true, available: false, files: {} });
    assert.equal((await connect(p)).status, 503);
  } finally {
    process.env.PATH = was;
  }
});

test('the bridge does the handshake, relays an editor’s messages and keeps the diagnostics', async () => {
  const logFile = path.join(tmp, 'fake.log');
  Object.assign(process.env, { SPECTRUM_TEXLAB: fixture, FAKE_TEXLAB_LOG: logFile });
  const received = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  const p = await newProject({ 'main.tex': '\\documentclass{article}\n\\begin{document}\n\\begin{itemize}\n\\end{enumerate}\n\\end{document}\n' });
  const rootUri = pathToFileURL(p.path).href;

  // TexLab starts for the route, and its first diagnostics come back with lines from 1, by project path
  const first = await diagnostics(p);
  assert.equal(first.available, true);
  assert.deepEqual(first.files, {
    'main.tex': [
      { line: 3, col: 1, endLine: 4, endCol: 16, severity: 'error', message: 'Mismatched environment', code: 'mismatched-environment', source: 'texlab' },
      { line: 6, col: 8, endLine: 6, endCol: 13, severity: 'info', message: 'Unused label', code: 'unused-label', source: 'texlab' }
    ]
  });
  // the stand-in logs as it reads, which can be after the diagnostics came back; its own request and the settings
  // Spectrum sends can come either way round
  const log = await until(() => received().length >= 6 && received(), 'the handshake logged');
  const [start, initialize, initialized] = log;
  const configuration = log.find((m) => m.method === 'workspace/didChangeConfiguration');
  const seeded = log.find((m) => m.method === 'workspace/didChangeWatchedFiles');
  const answer = log.find((m) => m.id === 'config-1');
  assert.equal(start.path, WINDOWS ? `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}` : '/usr/bin:/bin');
  assert.deepEqual(start.args, ['run']);
  // not in the project's folder, which Windows then couldn't move or bin while it runs
  assert.equal(start.cwd.toLowerCase(), realpathSync.native(tmpdir()).toLowerCase());
  assert.equal(initialize.method, 'initialize');
  assert.equal(initialize.params.rootUri, rootUri);
  assert.deepEqual(initialize.params.workspaceFolders, [{ uri: rootUri, name: path.basename(p.path) }]);
  assert.deepEqual(initialize.params.initializationOptions, { skipDistro: true });
  assert.deepEqual(initialize.params.capabilities.textDocument.hover, { contentFormat: ['plaintext'] });
  assert.equal(initialized.method, 'initialized');
  const settings = configuration.params.settings.texlab;
  assert.equal(configuration.method, 'workspace/didChangeConfiguration');
  assert.deepEqual([settings.build.onSave, settings.chktex.onOpenAndSave, settings.diagnosticsDelay, settings.latexFormatter], [false, false, 500, 'none']);
  assert.ok(['Verbatim', 'comment', 'filecontents'].every((env) => settings.experimental.verbatimEnvironments.includes(env)));
  assert.equal(settings.build.auxDirectory, `${pathToFileURL(auxStore(await cachePath(p.path), 'main.tex')).href}/`);
  // the main document, which TexLab only reads the files around
  assert.deepEqual(seeded.params, { changes: [{ uri: `${rootUri}/main.tex`, type: 1 }] });
  // its own request is answered here, with the same settings
  assert.deepEqual(answer, { jsonrpc: '2.0', id: 'config-1', result: [settings] });

  const editor = await connect(p);
  assert.equal(editor.status, 200);
  const { client, rootUri: told } = (await editor.next((e) => e.event === 'hello', 'hello')).data;
  assert.equal(told, rootUri);
  const uri = `${rootUri}/main.tex`;
  await post(p, client, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: 'file:///somewhere/else', capabilities: {} } },
    { jsonrpc: '2.0', method: 'initialized', params: {} },
    { jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'latex', version: 0, text: 'A\n{ unclosed\n' } } },
    { jsonrpc: '2.0', id: 2, method: 'textDocument/hover', params: { textDocument: { uri }, position: { line: 1, character: 2 } } },
    { jsonrpc: '2.0', id: 3, method: 'workspace/executeCommand', params: { command: 'texlab.cleanAuxiliary' } },
    { jsonrpc: '2.0', id: 4, method: 'textDocument/hover', params: { textDocument: { uri: 'file:///elsewhere/x.tex' }, position: { line: 0, character: 0 } } },
    { jsonrpc: '2.0', method: 'textDocument/didChange', params: { textDocument: { uri: `${rootUri}/chap.tex`, version: 1 }, contentChanges: [{ text: 'x' }] } },
    { jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: 'file:///elsewhere/x.tex', languageId: 'latex', version: 0, text: 'secret' } } }
  ]);
  // the handshake was TexLab's already: the editor gets its answer under its own id
  assert.equal((await editor.next((e) => e.data.id === 1, 'initialize answered')).data.result.serverInfo.name, 'Fake TexLab');
  assert.equal((await editor.next((e) => e.data.id === 2, 'hover answered')).data.result.contents.value, 'Hover at 1:2');
  assert.match((await editor.next((e) => e.data.id === 3, 'command refused')).data.error.message, /isn’t available/);
  assert.ok((await editor.next((e) => e.data.id === 4, 'outside refused')).data.error);
  await editor.next((e) => e.data.method === 'textDocument/publishDiagnostics' && e.data.params.uri === uri && e.data.params.diagnostics.length === 1, 'diagnostics of the open text');
  assert.ok(!editor.events.some((e) => e.data.method === 'window/logMessage' || e.data.method === 'workspace/configuration'));
  const now = await diagnostics(p);
  assert.deepEqual(now.files['main.tex'].map((d) => [d.line, d.code]), [[2, 'missing-brace']]);
  const methods = received().map((m) => `${m.method} ${m.params?.textDocument?.uri ?? ''}`.trim());
  assert.equal(methods.filter((m) => m === 'initialize').length, 1);
  assert.ok(methods.includes(`textDocument/didOpen ${uri}`));
  assert.ok(!methods.some((m) => m.includes('elsewhere') || m.includes('chap.tex') || m.includes('executeCommand')), methods.join('\n'));
  assert.equal((await post(p, 'nobody', { jsonrpc: '2.0', method: 'initialized' })).status, 404);

  // a TeX file replaced on disk, as Spectrum saves, is read again; app data and other files aren't TexLab's business
  await writeFileAtomic(path.join(p.path, 'chap.tex'), 'Chapter\n');
  await writeFileAtomic(path.join(p.path, '.spectrum', 'notes.tex'), 'x');
  await writeFileAtomic(path.join(p.path, 'figure.png'), 'x');
  const reread = () => received().filter((m) => m.method === 'workspace/didChangeWatchedFiles').flatMap((m) => m.params.changes);
  await until(() => reread().some((c) => c.uri === `${rootUri}/chap.tex` && c.type === 2), 'chap.tex read again');
  assert.ok(!reread().some((c) => /\.spectrum|figure/.test(c.uri)), JSON.stringify(reread()));

  // the editor goes: what it had open goes back to the disk's text, which TexLab 5.26 only takes as a change, and so do
  // later changes on disk
  editor.close();
  await until(() => received().some((m) => m.method === 'textDocument/didClose' && m.params.textDocument.uri === uri), 'didClose');
  const changedTo = (text) => received().some((m) => m.method === 'textDocument/didChange' && m.params.textDocument.uri === uri && m.params.contentChanges[0].text === text);
  await until(() => changedTo(readFileSync(path.join(p.path, 'main.tex'), 'utf8')), 'the disk’s text');
  await writeFileAtomic(path.join(p.path, 'main.tex'), 'Rewritten\n');
  await until(() => changedTo('Rewritten\n'), 'the new text on disk');
  await stopTexlab();
});

test('a moved project gets a TexLab on its new folder, one can be stopped before a move, and a name TexLab can’t take goes without', async () => {
  const logFile = path.join(tmp, 'fake-moved.log');
  Object.assign(process.env, { SPECTRUM_TEXLAB: fixture, FAKE_TEXLAB_LOG: logFile });
  const roots = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []).filter((m) => m.method === 'initialize').map((m) => m.params.rootUri);
  const p = await newProject({ 'main.tex': '\\documentclass{article}\n' });
  assert.equal((await diagnostics(p)).available, true);
  // Relocate or a cloud move: the registry points elsewhere, and the TexLab on the old folder makes way
  const moved = path.join(tmp, 'projects', 'Moved here');
  await fs.rename(p.path, moved);
  await moveEntry(p.id, moved);
  assert.equal((await diagnostics(p)).available, true);
  assert.deepEqual(roots(), [pathToFileURL(p.path).href, pathToFileURL(moved).href]);
  // stopped, and gone once it's said so
  await stopProjectTexlab(p.id);
  assert.equal((await diagnostics(p)).available, true);
  assert.equal(roots().length, 3);
  await stopProjectTexlab(p.id);

  // TexLab 5.26 panics on a file URI with [, ] or ^ in it
  const odd = await createProject({ name: 'Thesis [draft]', populate: (root) => fs.writeFile(path.join(root, 'main.tex'), 'x') });
  assert.match(odd.path, /\[draft\]/);
  assert.deepEqual(await diagnostics(odd), { ok: true, available: false, files: {} });
  assert.equal((await connect(odd)).status, 503);
  assert.equal(roots().length, 3);
  await stopTexlab();
});

test('the real TexLab finds a project’s errors, follows the editor, renames across files and reads a compile’s .aux', { skip: !realTexlab && 'needs texlab on the PATH', timeout: 60_000 }, async () => {
  process.env.SPECTRUM_TEXLAB = realTexlab;
  const marker = path.join(tmp, 'latexmkrc-ran');
  const p = await newProject({
    'main.tex': '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\\label{sec:intro}\nSee \\ref{sec:missing} and \\ref{sec:intro}.\n\\input{chap}\n\\end{document}\n',
    'chap.tex': '\\section{Chapter}\nText {unbalanced\n\\begin{itemize}\n\\end{enumerate}\nBack to \\ref{sec:intro}.\n',
    // Perl, which latexmk would run: TexLab runs it to read a latexmkrc unless, as here, it can't find latexmk
    '.latexmkrc': `system("touch '${marker.replace(/\\/g, '/')}'");\n$aux_dir = 'build';\n`
  });
  // the main document's .aux from a compile, for numbers
  const aux = auxStore(await cachePath(p.path), 'main.tex');
  await fs.mkdir(aux, { recursive: true });
  await fs.writeFile(path.join(aux, 'main.aux'), '\\relax\n\\newlabel{sec:intro}{{1}{1}}\n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}Intro}{1}{}\\protected@file@percent }\n\\@writefile{toc}{\\contentsline {section}{\\numberline {2}Chapter}{1}{}\\protected@file@percent }\n');

  const codes = (files, name) => (files[name] ?? []).map((d) => `${d.line} ${d.code}`).sort();
  const first = await until(async () => {
    const res = await diagnostics(p);
    return res.files['chap.tex'] && res;
  }, 'diagnostics');
  assert.equal(first.available, true);
  assert.ok(codes(first.files, 'chap.tex').includes('3 mismatched-environment'), JSON.stringify(first.files));
  assert.ok(codes(first.files, 'chap.tex').some((c) => c.endsWith('missing-brace')), JSON.stringify(first.files));
  assert.ok(codes(first.files, 'main.tex').includes('4 undefined-label'), JSON.stringify(first.files));

  const editor = await connect(p);
  const { client, rootUri } = (await editor.next((e) => e.event === 'hello', 'hello')).data;
  const chap = `${rootUri}/chap.tex`;
  const main = `${rootUri}/main.tex`;
  await post(p, client, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } },
    { jsonrpc: '2.0', method: 'initialized', params: {} },
    // main.tex first, which the editor shows and then leaves for chap.tex
    { jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: main, languageId: 'latex', version: 0, text: readFileSync(path.join(p.path, 'main.tex'), 'utf8') } } },
    { jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri: main } } },
    { jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: chap, languageId: 'latex', version: 0, text: '\\section{Chapter}\nFixed.\nBack to \\ref{sec:intro}.\n' } } }
  ]);
  await editor.next((e) => e.data.id === 1, 'initialize answered');
  // the editor's text, not the disk's, once TexLab has caught up
  assert.deepEqual(codes((await diagnostics(p)).files, 'chap.tex'), []);

  await post(p, client, [
    { jsonrpc: '2.0', id: 2, method: 'textDocument/rename', params: { textDocument: { uri: main }, position: { line: 2, character: 23 }, newName: 'sec:start' } },
    { jsonrpc: '2.0', id: 3, method: 'textDocument/documentSymbol', params: { textDocument: { uri: main } } }
  ]);
  const { changes } = (await editor.next((e) => e.data.id === 2, 'rename')).data.result;
  const edits = Object.fromEntries(Object.entries(changes).map(([uri, list]) => [path.basename(fileURLToPath(uri)), list.length]));
  assert.deepEqual(edits, { 'main.tex': 2, 'chap.tex': 1 });
  const symbols = (await editor.next((e) => e.data.id === 3, 'symbols')).data.result;
  assert.equal(symbols[0].name, '1 Intro');
  assert.ok(symbols[0].selectionRange);

  // a compile's .aux, renamed into a fresh store as compiles keep them, which TexLab's own watcher takes for a removal
  await fs.rm(aux, { recursive: true, force: true });
  await fs.mkdir(aux, { recursive: true });
  await fs.writeFile(path.join(tmp, 'main.aux'), '\\relax\n\\@writefile{toc}{\\contentsline {section}{\\numberline {3}Intro}{1}{}\\protected@file@percent }\n');
  await fs.rename(path.join(tmp, 'main.aux'), path.join(aux, 'main.aux'));
  auxKept(p.id);
  let asked = 10;
  await until(
    async () => {
      await post(p, client, { jsonrpc: '2.0', id: ++asked, method: 'textDocument/documentSymbol', params: { textDocument: { uri: main } } });
      return (await editor.next((e) => e.data.id === asked, 'symbols')).data.result[0]?.name === '3 Intro';
    },
    'the new .aux read',
    10_000
  );

  // main.tex replaced on disk, as Spectrum saves it: TexLab, which had it from the editor, gets the new text
  await writeFileAtomic(path.join(p.path, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nSee \\ref{sec:elsewhere}.\n\\section{Intro}\\label{sec:intro}\n\\input{chap}\n\\end{document}\n');
  await until(async () => codes((await diagnostics(p)).files, 'main.tex').join() === '3 undefined-label', 'the new main.tex read', 15_000);
  assert.ok(!existsSync(marker), 'the project’s latexmkrc was run');
  editor.close();
  await stopTexlab();
});

test('the real TexLab takes code in Verbatim and the like as code, and a file’s marks come under its own name', { skip: !realTexlab && 'needs texlab on the PATH', timeout: 60_000 }, async () => {
  process.env.SPECTRUM_TEXLAB = realTexlab;
  const p = await newProject({
    'main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{Chapters/Intro}\nSee \\ref{sec:a}.\n\\input{code}\n\\input{broken}\n\\end{document}\n',
    'code.tex': '\\begin{Verbatim}\nprintf("{");\n\\end{Verbatim}\n\\begin{comment}\n{\n\\end{comment}\n\\begin{filecontents}{x.dat}\n{\n\\end{filecontents}\n',
    'broken.tex': 'Text {unbalanced\n'
  });
  await fs.mkdir(path.join(p.path, 'chapters'));
  await fs.writeFile(path.join(p.path, 'chapters', 'intro.tex'), '\\section{A}\\label{sec:a}\nText {open\n');
  const errors = (files, name) => (files[name] ?? []).filter((d) => d.severity === 'error').map((d) => d.code);
  const found = await until(async () => {
    const res = await diagnostics(p);
    return res.files['broken.tex'] && res;
  }, 'diagnostics');
  assert.deepEqual(errors(found.files, 'code.tex'), [], JSON.stringify(found.files));
  assert.deepEqual(errors(found.files, 'broken.tex'), ['missing-brace']);
  if (WINDOWS || process.platform === 'darwin') {
    // a disk that ignores case: \input{Chapters/Intro} is chapters/intro.tex, which TexLab keeps as a file of its own,
    // read once; the marks are the disk's spelling's, and go once the file is fixed
    assert.ok(!Object.keys(found.files).some((f) => f !== f.toLowerCase()), JSON.stringify(Object.keys(found.files)));
    await until(async () => errors((await diagnostics(p)).files, 'chapters/intro.tex').includes('missing-brace'), 'the brace left open in chapters/intro.tex');
    await writeFileAtomic(path.join(p.path, 'chapters', 'intro.tex'), '\\section{A}\\label{sec:a}\nText {closed}\n');
    await until(async () => !errors((await diagnostics(p)).files, 'chapters/intro.tex').length, 'chapters/intro.tex fixed', 15_000);
  }
  await stopTexlab();
});
