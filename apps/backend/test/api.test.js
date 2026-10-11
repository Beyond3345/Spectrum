// End-to-end checks against a real server process with throwaway data and projects
// folders and a mock OpenAI-compatible endpoint. No network. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { promises as fs, mkdtempSync, realpathSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = realpathSync(mkdtempSync(path.join(tmpdir(), 'spectrum-test-')));
const dataDir = path.join(tmp, 'data');
const projectsDir = path.join(tmp, 'projects');
// uploads write templates, so never into the repo's own folder
const templateDir = path.join(tmp, 'templates');
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
const legacyId = crypto.randomUUID();
let server;
let mock;
let mockPort;
const mockCalls = [];
// resolves when the server drops the endless arXiv download
let arxivDropped;

// Fake arXiv e-prints: 2401.00001 is a gzipped .tex, anything else starts and never finishes.
function fakeArxiv(req, res) {
  if (req.url.endsWith('/2401.00001')) {
    res.writeHead(200, { 'content-type': 'application/x-gzip' });
    return res.end(gzipSync('\\documentclass{article}\\begin{document}From arXiv\\end{document}\n'));
  }
  arxivDropped = new Promise((resolve) => res.on('close', resolve));
  res.writeHead(200, { 'content-length': String(10 * 1024 * 1024) });
  res.write(Buffer.alloc(64 * 1024));
}

// Scripted LLM: with tools it first reads a file, then proposes a patch, then answers.
// Model "picky" rejects temperature and model "plain" rejects reasoning_effort, like real providers do.
function startMockLLM() {
  return new Promise((resolve) => {
    mock = createServer((req, res) => {
      if (req.url.startsWith('/arxiv/e-print/')) return fakeArxiv(req, res);
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const payload = JSON.parse(body);
        mockCalls.push(payload);
        const reply = (message, status = 200) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(status === 200 ? { choices: [{ message }] } : message));
        };
        if (payload.model === 'picky' && payload.temperature !== undefined) {
          return reply({ error: { message: "Unsupported value: 'temperature' does not support 0.2" } }, 400);
        }
        if (payload.model === 'denied') return reply({ error: { message: 'Incorrect API key provided: bad', code: 'invalid_api_key' } }, 401);
        if (payload.model === 'broken') return reply({ error: { message: 'boom' } }, 500);
        if (payload.model === 'plain' && payload.reasoning_effort !== undefined) {
          return reply({ error: { message: 'Unrecognized request argument supplied: reasoning_effort' } }, 400);
        }
        const toolResults = payload.messages.filter((m) => m.role === 'tool').length;
        if (payload.tools && toolResults === 0) {
          return reply({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"main.tex"}' } }] });
        }
        if (payload.tools && toolResults === 1) {
          return reply({ role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'propose_patch', arguments: JSON.stringify({ path: 'main.tex', content: 'patched' }) } }] });
        }
        return reply({ role: 'assistant', content: 'done' });
      });
    }).listen(0, '127.0.0.1', () => {
      mockPort = mock.address().port;
      resolve();
    });
  });
}

async function api(url, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // binary body
  }
  return { status: res.status, json, headers: res.headers };
}

before(async () => {
  // an upstream-layout project waiting to be migrated
  const legacyRoot = path.join(dataDir, legacyId);
  mkdirSync(path.join(legacyRoot, '.snapshots', 'old'), { recursive: true });
  writeFileSync(path.join(legacyRoot, 'project.json'), JSON.stringify({ id: legacyId, name: 'Legacy paper', createdAt: '2025-01-01T00:00:00.000Z', tags: ['old'] }));
  writeFileSync(path.join(legacyRoot, 'main.tex'), 'legacy');

  await fs.cp(path.join(here, '..', '..', '..', 'templates'), templateDir, { recursive: true });
  await startMockLLM();
  await startServer();
});

async function startServer() {
  server = spawn(process.execPath, [path.join(here, '..', 'src', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      SPECTRUM_HOST: '127.0.0.1',
      SPECTRUM_DATA_DIR: dataDir,
      SPECTRUM_PROJECTS_DIR: projectsDir,
      SPECTRUM_TEMPLATE_DIR: templateDir,
      SPECTRUM_LLM_API_KEY: '',
      SPECTRUM_MINERU_TOKEN: '',
      SPECTRUM_ARXIV_BASE: `http://127.0.0.1:${mockPort}/arxiv`
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

async function restartServer() {
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await exited;
  await startServer();
}

after(() => {
  server?.kill();
  mock?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const llmConfig = (model = 'mock') => ({ endpoint: `http://127.0.0.1:${mockPort}/v1`, apiKey: 'test', model });

async function newProject(name = 'Paper', extra = {}) {
  const { status, json } = await api('/api/projects', { method: 'POST', body: { name, ...extra } });
  assert.equal(status, 200, json?.error);
  assert.ok(json.id);
  return json;
}

const writeFile = (id, filePath, content) => api(`/api/projects/${id}/file`, { method: 'PUT', body: { path: filePath, content } });
const readFile = async (id, filePath) => (await api(`/api/projects/${id}/file?path=${encodeURIComponent(filePath)}`)).json?.content;
const listIds = async () => (await api('/api/projects')).json.projects.map((p) => p.id);

test('migrates upstream projects in place', async () => {
  const legacyRoot = path.join(dataDir, legacyId);
  const project = (await api('/api/projects')).json.projects.find((p) => p.id === legacyId);
  assert.ok(project, 'legacy project registered');
  assert.equal(project.name, 'Legacy paper');
  assert.equal(project.path, legacyRoot);
  assert.deepEqual(project.tags, ['old']);
  assert.equal(project.missing, false);
  assert.ok(existsSync(path.join(legacyRoot, '.spectrum', 'project.json')));
  assert.ok(!existsSync(path.join(legacyRoot, 'project.json')));
  assert.ok(!existsSync(path.join(legacyRoot, '.snapshots')));
  assert.equal(await readFile(legacyId, 'main.tex'), 'legacy');
});

test('creates projects in the chosen folder with safe, unique folder names', async () => {
  const parent = path.join(tmp, 'chosen', 'nested');
  const a = await newProject('Draft: v1/final', { template: 'acl', parentDir: parent });
  assert.equal(a.path, path.join(parent, 'Draft v1final'));
  assert.equal(a.name, 'Draft: v1/final');
  assert.equal(a.mainFile, 'main.tex');
  assert.equal(a.missing, false);
  assert.ok(existsSync(path.join(a.path, 'main.tex')));
  assert.ok(existsSync(path.join(a.path, '.spectrum', 'project.json')));

  const b = await newProject('Draft: v1/final', { parentDir: parent });
  assert.equal(b.path, path.join(parent, 'Draft v1final 2'));
  const c = await newProject('..');
  assert.equal(c.path, path.join(projectsDir, 'Untitled'));

  assert.equal((await api('/api/projects', { method: 'POST', body: { name: 'x', template: '../..' } })).status, 400);
  assert.equal((await api('/api/projects', { method: 'POST', body: { name: 'x', parentDir: 'relative/dir' } })).status, 400);
  assert.equal((await api('/api/projects/../tree')).status, 404);
  assert.equal((await api('/api/projects/no-such-project/tree')).status, 404);
});

test('tree hides app data, VCS internals and Finder litter', async () => {
  const p = await newProject('Tree');
  await fs.mkdir(path.join(p.path, '.git'));
  await fs.writeFile(path.join(p.path, '.git', 'config'), '');
  await fs.writeFile(path.join(p.path, '.DS_Store'), '');
  await fs.writeFile(path.join(p.path, '.latexmkrc'), '');
  await writeFile(p.id, 'main.tex', 'x');
  const tree = (await api(`/api/projects/${p.id}/tree`)).json;
  const paths = tree.items.map((i) => i.path).sort();
  assert.deepEqual(paths, ['.latexmkrc', 'main.tex']);
  assert.equal(tree.mainFile, undefined);
  assert.equal((await writeFile(p.id, '.spectrum/project.json', '{}')).status, 400);
  assert.equal((await api(`/api/projects/${p.id}/file?path=.`, { method: 'DELETE' })).status, 400);
});

test('adopts an existing folder and recognises it again later', async () => {
  const folder = path.join(tmp, 'existing', 'My thesis');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'main.tex'), 'hello');
  const opened = (await api('/api/projects/open-folder', { method: 'POST', body: { path: folder } })).json;
  assert.equal(opened.name, 'My thesis');
  assert.equal(opened.path, folder);
  assert.ok(existsSync(path.join(folder, '.spectrum', 'project.json')));
  assert.equal(await readFile(opened.id, 'main.tex'), 'hello');

  const again = (await api('/api/projects/open-folder', { method: 'POST', body: { path: folder } })).json;
  assert.equal(again.id, opened.id);
  assert.equal((await listIds()).filter((id) => id === opened.id).length, 1);

  // a Finder copy carries the same id but is a different project
  const copy = path.join(tmp, 'existing', 'My thesis copy');
  await fs.cp(folder, copy, { recursive: true });
  const copied = (await api('/api/projects/open-folder', { method: 'POST', body: { path: copy } })).json;
  assert.notEqual(copied.id, opened.id);
  assert.equal((await api(`/api/projects/${opened.id}/tree`)).status, 200);

  for (const bad of [dataDir, '/', path.join(tmp, 'nope'), 'relative']) {
    assert.equal((await api('/api/projects/open-folder', { method: 'POST', body: { path: bad } })).status, 400, bad);
  }
});

test('flags missing folders and relocates them', async () => {
  const p = await newProject('Wanderer');
  await writeFile(p.id, 'main.tex', 'still here');
  const moved = path.join(tmp, 'moved-wanderer');
  await fs.rename(p.path, moved);

  const listed = (await api('/api/projects')).json.projects.find((x) => x.id === p.id);
  assert.equal(listed.missing, true);
  assert.equal(listed.name, 'Wanderer');
  const tree = await api(`/api/projects/${p.id}/tree`);
  assert.equal(tree.status, 404);
  assert.equal(tree.json.ok, false);

  const res = (await api(`/api/projects/${p.id}/relocate`, { method: 'POST', body: { path: moved } })).json;
  assert.ok(res.ok, res.error);
  assert.equal(res.project.path, moved);
  assert.equal(res.project.missing, false);
  assert.equal(await readFile(p.id, 'main.tex'), 'still here');
});

test('never opens or relocates to the projects folder, or a folder inside or holding a project', async () => {
  const nest = path.join(tmp, 'nest');
  const outer = await newProject('Outer', { parentDir: nest });
  const inner = path.join(outer.path, 'figures');
  await fs.mkdir(inner);
  const open = (folder) => api('/api/projects/open-folder', { method: 'POST', body: { path: folder } });

  await fs.symlink(projectsDir, path.join(tmp, 'projects alias'));
  assert.equal((await open(projectsDir)).status, 400);
  assert.equal((await open(path.join(tmp, 'projects alias'))).status, 400);
  const inside = await open(inner);
  assert.equal(inside.status, 409);
  assert.match(inside.json.error, /inside “Outer”/);
  const holding = await open(nest);
  assert.equal(holding.status, 409);
  assert.match(holding.json.error, /contains “Outer”/);

  const mover = await newProject('Mover');
  const relocate = (folder) => api(`/api/projects/${mover.id}/relocate`, { method: 'POST', body: { path: folder } });
  assert.equal((await relocate(inner)).status, 409);
  assert.equal((await relocate(nest)).status, 409);
  assert.ok(!existsSync(path.join(inner, '.spectrum')));
  assert.ok(!existsSync(path.join(nest, '.spectrum')));
  assert.equal((await api(`/api/projects/${mover.id}/tree`)).status, 200);
});

test('removes from the list without touching the folder', async () => {
  const p = await newProject('Keep my files');
  assert.ok((await api(`/api/projects/${p.id}/remove`, { method: 'POST', body: {} })).json.ok);
  assert.ok(!(await listIds()).includes(p.id));
  assert.ok(existsSync(p.path));
  assert.equal((await api(`/api/projects/${p.id}/remove`, { method: 'POST', body: {} })).status, 404);
});

// opt-in: on macOS this really moves a small temp folder into the user's Bin
const binSkip = process.platform !== 'darwin' ? 'macOS only' : process.env.SPECTRUM_TEST_BIN !== '1' && 'set SPECTRUM_TEST_BIN=1 to run';
test('moves a project to the Bin', { skip: binSkip }, async () => {
  const p = await newProject(`Spectrum test ${crypto.randomUUID().slice(0, 8)}`);
  const res = (await api(`/api/projects/${p.id}/trash`, { method: 'POST', body: {} })).json;
  assert.ok(res.ok, res.error);
  assert.ok(!existsSync(p.path));
  assert.ok(!(await listIds()).includes(p.id));
});

test('renames, tags, archives, sets the main file and duplicates', async () => {
  const p = await newProject('Original');
  await writeFile(p.id, 'main.tex', 'body');
  await api(`/api/projects/${p.id}/versions`, { method: 'POST', body: {} });

  const renamed = (await api(`/api/projects/${p.id}/rename-project`, { method: 'POST', body: { name: 'Renamed' } })).json;
  assert.equal(renamed.project.name, 'Renamed');
  assert.equal(renamed.project.path, p.path);
  assert.equal((await api('/api/projects')).json.projects.find((x) => x.id === p.id).name, 'Renamed');

  const tagged = (await api(`/api/projects/${p.id}/tags`, { method: 'PATCH', body: { tags: [' ml ', 'ml', 'nlp', ''] } })).json;
  assert.deepEqual(tagged.project.tags, ['ml', 'nlp']);
  const archived = (await api(`/api/projects/${p.id}/archive`, { method: 'PATCH', body: { archived: true } })).json;
  assert.equal(archived.project.archived, true);
  assert.ok((await api(`/api/projects/${p.id}/main-file`, { method: 'PATCH', body: { mainFile: 'main.tex' } })).json.ok);
  assert.equal((await api(`/api/projects/${p.id}/tree`)).json.mainFile, 'main.tex');
  assert.equal((await api(`/api/projects/${p.id}/main-file`, { method: 'PATCH', body: { mainFile: '../escape.tex' } })).status, 400);

  const copy = (await api(`/api/projects/${p.id}/copy`, { method: 'POST', body: {} })).json.project;
  assert.notEqual(copy.id, p.id);
  assert.equal(copy.name, 'Renamed copy');
  assert.equal(copy.path, path.join(path.dirname(p.path), 'Renamed copy'));
  assert.deepEqual(copy.tags, ['ml', 'nlp']);
  assert.equal(await readFile(copy.id, 'main.tex'), 'body');
  assert.deepEqual((await api(`/api/projects/${copy.id}/versions`)).json.versions, []);
});

test('compiles next to the main file and cleans the build folder', async (t) => {
  const check = (await api('/api/system/check')).json;
  assert.equal(check.projectsDir, projectsDir);
  assert.ok('texcount' in check.tools);
  if (!check.tools.pdflatex && !check.tools.tectonic) return t.skip('no LaTeX engine on this machine');
  const p = await newProject('Compile me');
  await writeFile(p.id, 'main.tex', '\\documentclass{article}\\begin{document}Hello\\end{document}\n');
  const res = (await api('/api/compile', { method: 'POST', body: { projectId: p.id, mainFile: 'main.tex', engine: 'auto' } })).json;
  assert.ok(res.ok, res.error || res.log);
  assert.ok(['pdflatex', 'tectonic'].includes(res.engine));
  assert.equal(res.pdfPath, 'main.pdf');
  assert.equal(Buffer.from(res.pdf, 'base64').subarray(0, 4).toString(), '%PDF');
  assert.equal((await fs.readFile(path.join(p.path, 'main.pdf'))).subarray(0, 4).toString(), '%PDF');
  const build = path.join(p.path, '.spectrum', 'build');
  assert.ok(!existsSync(build) || (await fs.readdir(build)).length === 0);

  // the compiled PDF isn't part of version history
  const version = (await api(`/api/projects/${p.id}/versions`, { method: 'POST', body: {} })).json.version;
  assert.deepEqual(version.summary.files, ['main.tex']);
});

test('compiles a main file in a subfolder with biblatex, local and root-relative inputs', async (t) => {
  const { tools } = (await api('/api/system/check')).json;
  if (!tools.pdflatex || !tools.biber) return t.skip('needs pdflatex and biber');
  const p = await newProject('Subfolder');
  await writeFile(p.id, 'paper/main.tex', [
    '\\documentclass{article}',
    '\\usepackage[backend=biber]{biblatex}',
    '\\addbibresource{refs.bib}',
    '\\begin{document}',
    '\\input{shared/macros}',
    '\\include{chapters/one}',
    '\\printbibliography',
    '\\end{document}',
    ''
  ].join('\n'));
  await writeFile(p.id, 'paper/chapters/one.tex', '\\section{One} Built with \\project~\\cite{Knuth1984}.\n');
  await writeFile(p.id, 'paper/refs.bib', '@book{Knuth1984, author = {Knuth, Donald}, title = {The TeXbook}, publisher = {Addison-Wesley}, year = {1984}}\n');
  await writeFile(p.id, 'shared/macros.tex', '\\newcommand{\\project}{Spectrum}\n');
  const res = (await api('/api/compile', { method: 'POST', body: { projectId: p.id, mainFile: 'paper/main.tex', engine: 'pdflatex' } })).json;
  assert.ok(res.ok, res.error || res.log);
  assert.equal(res.pdfPath, 'paper/main.pdf');
  // the citation is resolved by the final pass, so biber found the .bcf and the .bib
  const lastPass = res.log.slice(res.log.lastIndexOf('This is pdfTeX'));
  assert.doesNotMatch(lastPass, /Citation .* undefined/);
});

test('Tectonic compiles a main file in a subfolder with BibTeX, local and root-relative inputs', async (t) => {
  const { tools, problems } = (await api('/api/system/check')).json;
  if (!tools.tectonic || problems?.tectonic) return t.skip('needs a working tectonic');
  const p = await newProject('Tectonic subfolder');
  await writeFile(p.id, 'paper/main.tex', [
    '\\documentclass{article}',
    '\\input{shared/macros}',
    '\\begin{document}',
    '\\input{sections/intro}',
    '\\bibliographystyle{plain}',
    '\\bibliography{refs}',
    '\\end{document}',
    ''
  ].join('\n'));
  await writeFile(p.id, 'paper/sections/intro.tex', 'Built with \\project~\\cite{Knuth1984}.\n');
  await writeFile(p.id, 'paper/refs.bib', '@book{Knuth1984, author = {Knuth, Donald}, title = {The TeXbook}, publisher = {Addison-Wesley}, year = {1984}}\n');
  await writeFile(p.id, 'shared/macros.tex', '\\newcommand{\\project}{Spectrum}\n');
  const res = (await api('/api/compile', { method: 'POST', body: { projectId: p.id, mainFile: 'paper/main.tex', engine: 'tectonic' } })).json;
  assert.ok(res.ok, res.error || res.log);
  assert.equal(res.pdfPath, 'paper/main.pdf');
  assert.equal((await fs.readFile(path.join(p.path, 'paper', 'main.pdf'))).subarray(0, 4).toString(), '%PDF');
  assert.match(res.log, /Running BibTeX/);
  assert.doesNotMatch(res.log, /^error:/m);
});

test('stores and serves the thumbnail', async () => {
  const p = await newProject('Thumb');
  assert.equal((await api(`/api/projects/${p.id}/thumbnail`)).status, 404);
  assert.equal(p.thumbnailAt, null);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  assert.ok((await api(`/api/projects/${p.id}/thumbnail`, { method: 'PUT', body: { png } })).json.ok);
  const res = await fetch(`${base}/api/projects/${p.id}/thumbnail`);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(png, 'base64'));
  const listed = (await api('/api/projects')).json.projects.find((x) => x.id === p.id);
  assert.equal(listed.hasThumbnail, true);
  assert.equal(typeof listed.thumbnailAt, 'number'); // the frontend's cache-buster
  assert.equal((await api(`/api/projects/${p.id}/thumbnail`, { method: 'PUT', body: { png: Buffer.from('nope').toString('base64') } })).status, 400);
});

test('counts words', async () => {
  const p = await newProject('Stats', { template: 'acl' });
  const stats = (await api(`/api/projects/${p.id}/stats?mainFile=main.tex`)).json;
  assert.ok(stats.ok);
  assert.ok(['texcount', 'estimate'].includes(stats.source));
  assert.ok(stats.words > 100);
  assert.equal(stats.words, stats.wordsInText + stats.wordsInHeaders + stats.wordsOutsideText);
  assert.ok(stats.headers > 0);
  assert.equal((await api(`/api/projects/${p.id}/stats?mainFile=nope.tex`)).status, 404);
});

test('parses texcount output and estimates without it', async () => {
  const { parseTexcount, estimateStats } = await import('../src/services/statsService.js');
  const texcount = parseTexcount([
    'Total', 'Words in text: 1012', 'Words in headers: 26', 'Words outside text (captions, etc.): 94',
    'Number of headers: 17', 'Number of floats/tables/figures: 4', 'Number of math inlines: 3', 'Number of math displayed: 1'
  ].join('\n'));
  assert.deepEqual(texcount, {
    ok: true, source: 'texcount', words: 1132, wordsInText: 1012, wordsInHeaders: 26, wordsOutsideText: 94,
    headers: 17, floats: 4, mathInline: 3, mathDisplay: 1
  });
  const tex = String.raw`\documentclass{article}\usepackage{amsmath}\begin{document}
\section{Intro Words}Hello world, it's $x$ and \(y\). % not counted
\begin{equation}a\end{equation}\begin{figure}\caption{A \textbf{bold} cap}\label{f}\end{figure}\cite{k}
\end{document}`;
  assert.deepEqual(estimateStats(tex.replace(/(?<!\\)%.*$/gm, '')), {
    ok: true, source: 'estimate', words: 9, wordsInText: 4, wordsInHeaders: 2, wordsOutsideText: 3,
    headers: 1, floats: 1, mathInline: 2, mathDisplay: 1
  });
});

test('version history: save, compare, restore, rename, delete', async () => {
  const p = await newProject('History');
  const versions = `/api/projects/${p.id}/versions`;
  await writeFile(p.id, 'main.tex', 'a\nb\n');
  await writeFile(p.id, 'refs.bib', '@misc{x}\n');
  await fs.writeFile(path.join(p.path, 'figure.png'), Buffer.from([1, 2, 3]));

  const v1 = (await api(versions, { method: 'POST', body: { label: 'First' } })).json;
  assert.equal(v1.unchanged, false);
  assert.equal(v1.version.id, 1);
  assert.equal(v1.version.label, 'First');
  assert.deepEqual(v1.version.summary, { kind: 'initial', files: ['figure.png', 'main.tex', 'refs.bib'], added: 3, removed: 0 });

  const same = (await api(versions, { method: 'POST', body: {} })).json;
  assert.equal(same.unchanged, true);
  assert.equal(same.version.id, 1);

  await writeFile(p.id, 'main.tex', 'a\nB\nc\n');
  const v2 = (await api(versions, { method: 'POST', body: { reason: 'before-ai' } })).json.version;
  assert.equal(v2.reason, 'before-ai');
  assert.deepEqual(v2.summary, { kind: 'edited', files: ['main.tex'], added: 2, removed: 1 });

  await writeFile(p.id, 'new.txt', 'n\n');
  await api(`/api/projects/${p.id}/file?path=refs.bib`, { method: 'DELETE' });
  const v3 = (await api(versions, { method: 'POST', body: {} })).json.version;
  assert.equal(v3.summary.kind, 'updated');
  assert.deepEqual(v3.summary.files, ['new.txt', 'refs.bib']);

  assert.deepEqual((await api(versions)).json.versions.map((v) => v.id), [3, 2, 1]);
  assert.deepEqual((await api(`${versions}/2/changes`)).json.files, [
    { path: 'main.tex', status: 'modified', added: 2, removed: 1, binary: false }
  ]);
  const compare = (await api(`${versions}/1/compare`)).json.files;
  assert.deepEqual(compare.map((f) => [f.path, f.status]), [['main.tex', 'modified'], ['new.txt', 'added'], ['refs.bib', 'removed']]);
  assert.equal((await api(`${versions}/1/file?path=main.tex`)).json.content, 'a\nb\n');
  assert.equal((await api(`${versions}/1/file?path=figure.png`)).json.ok, false);

  // one file: nothing changed since v3, so no safety version is needed
  const single = (await api(`${versions}/1/restore`, { method: 'POST', body: { path: 'refs.bib' } })).json;
  assert.ok(single.ok);
  assert.equal(single.safety, null);
  assert.equal(await readFile(p.id, 'refs.bib'), '@misc{x}\n');
  assert.equal(await readFile(p.id, 'main.tex'), 'a\nB\nc\n');

  // whole project: the restored .bib makes this a change, so a safety version is saved first
  const all = (await api(`${versions}/1/restore`, { method: 'POST', body: {} })).json;
  assert.ok(all.ok);
  assert.equal(all.safety.id, 4);
  assert.equal(all.safety.reason, 'before-restore');
  assert.equal(await readFile(p.id, 'main.tex'), 'a\nb\n');
  assert.ok(!existsSync(path.join(p.path, 'new.txt')));
  assert.deepEqual((await api(`${versions}/1/compare`)).json.files, []);

  const renamed = (await api(`${versions}/2`, { method: 'PATCH', body: { label: 'Before polish' } })).json;
  assert.equal(renamed.version.label, 'Before polish');

  const objects = async () => {
    const root = path.join(p.path, '.spectrum', 'history', 'objects');
    let count = 0;
    for (const shard of await fs.readdir(root)) count += (await fs.readdir(path.join(root, shard))).length;
    return count;
  };
  assert.equal(await objects(), 5);
  for (const id of [2, 3, 4]) assert.ok((await api(`${versions}/${id}`, { method: 'DELETE' })).json.ok);
  assert.deepEqual((await api(versions)).json.versions.map((v) => v.id), [1]);
  assert.equal(await objects(), 3);
  assert.equal((await api(`${versions}/2`, { method: 'DELETE' })).status, 404);
  assert.equal((await api(`${versions}/abc/changes`)).status, 404);
});

test('saves, lists and deletes chats', async () => {
  const p = await newProject('Chats');
  const chats = `/api/projects/${p.id}/chats`;
  const chat = {
    id: 'chat_1',
    title: 'Fix the intro',
    mode: 'assistant',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    messages: [{ role: 'user', content: 'hi', createdAt: '2026-01-01T00:00:00.000Z' }]
  };
  assert.ok((await api(`${chats}/chat_1`, { method: 'PUT', body: { chat } })).json.ok);
  await api(`${chats}/chat_2`, { method: 'PUT', body: { chat: { ...chat, id: 'chat_2', mode: 'references', updatedAt: '2026-01-03T00:00:00.000Z' } } });
  const list = (await api(chats)).json.chats;
  assert.deepEqual(list.map((c) => c.id), ['chat_2', 'chat_1']);
  assert.deepEqual(list[1], { id: 'chat_1', title: 'Fix the intro', mode: 'assistant', updatedAt: chat.updatedAt, messageCount: 1 });
  assert.deepEqual((await api(`${chats}/chat_1`)).json.chat, chat);

  assert.equal((await api(`${chats}/chat_1`, { method: 'PUT', body: { chat: { ...chat, id: 'other' } } })).status, 400);
  assert.equal((await api(`${chats}/bad.id`, { method: 'PUT', body: { chat: { ...chat, id: 'bad.id' } } })).status, 400);
  assert.equal((await api(`${chats}/nope`)).status, 404);
  assert.ok((await api(`${chats}/chat_1`, { method: 'DELETE' })).json.ok);
  assert.deepEqual((await api(chats)).json.chats.map((c) => c.id), ['chat_2']);
});

test('imports a zip, unwrapping a single top-level folder', async (t) => {
  try {
    execFileSync('zip', ['-v'], { stdio: 'ignore' });
  } catch {
    return t.skip('zip not installed');
  }
  const src = path.join(tmp, 'zipsrc');
  await fs.mkdir(path.join(src, 'paper', 'sections'), { recursive: true });
  await fs.mkdir(path.join(src, 'paper', '.spectrum'), { recursive: true });
  await fs.writeFile(path.join(src, 'paper', 'main.tex'), 'zipped');
  await fs.writeFile(path.join(src, 'paper', 'sections', 'intro.tex'), 'intro');
  await fs.writeFile(path.join(src, 'paper', '.spectrum', 'project.json'), '{"id":"hijack"}');
  const zipPath = path.join(tmp, 'paper.zip');
  execFileSync('zip', ['-qr', zipPath, 'paper'], { cwd: src });

  const form = new FormData();
  form.append('parentDir', path.join(tmp, 'imports'));
  form.append('zip', new Blob([await fs.readFile(zipPath)]), 'paper.zip');
  const res = await (await fetch(`${base}/api/projects/import-zip`, { method: 'POST', body: form })).json();
  assert.ok(res.ok, res.error);
  assert.equal(res.project.name, 'paper');
  assert.equal(res.project.path, path.join(tmp, 'imports', 'paper'));
  assert.notEqual(res.project.id, 'hijack');
  const paths = (await api(`/api/projects/${res.project.id}/tree`)).json.items.map((i) => i.path).sort();
  assert.deepEqual(paths, ['main.tex', 'sections', 'sections/intro.tex']);
});

test('refuses requests that did not come from this computer', async () => {
  assert.equal((await api('/api/projects', { headers: { 'x-forwarded-for': '203.0.113.9' } })).status, 403);
  assert.equal((await api('/api/projects', { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await api('/api/health', { headers: { 'x-forwarded-for': '203.0.113.9' } })).status, 403);
  // DNS rebinding: right socket, wrong Host (fetch won't let us set Host, so go raw)
  const rebound = await new Promise((resolve) => {
    request({ port, host: '127.0.0.1', path: '/api/projects', headers: { host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).end();
  });
  assert.equal(rebound, 403);
  assert.equal((await api('/api/projects', { headers: { origin: 'http://localhost:5173' } })).status, 200);
});

test('tool agent runs the tool loop and returns proposed patches', async () => {
  const p = await newProject('Agent');
  await writeFile(p.id, 'main.tex', 'original');
  const res = (await api('/api/agent/run', {
    method: 'POST',
    body: { task: 'polish', prompt: 'tidy', mode: 'tools', projectId: p.id, activePath: 'main.tex', llmConfig: llmConfig() }
  })).json;
  assert.ok(res.ok, res.reply);
  assert.equal(res.reply, 'done');
  assert.equal(res.patches.length, 1);
  assert.equal(res.patches[0].original, 'original');
  assert.equal(res.patches[0].content, 'patched');
});

test('retries without temperature for models that reject it', async () => {
  mockCalls.length = 0;
  const res = (await api('/api/llm', {
    method: 'POST',
    body: { messages: [{ role: 'user', content: 'hi' }], llmConfig: llmConfig('picky') }
  })).json;
  assert.ok(res.ok, res.error);
  assert.equal(mockCalls.length, 2);
  assert.equal(mockCalls[1].temperature, undefined);
});

test('sends reasoning_effort and retries without it when the model rejects it', async () => {
  const chat = (model, reasoningEffort) => api('/api/agent/run', {
    method: 'POST',
    body: { task: 'chat', prompt: 'hi', selection: '', content: '', mode: 'direct', interaction: 'chat', llmConfig: llmConfig(model), reasoningEffort }
  });

  mockCalls.length = 0;
  assert.ok((await chat('mock', 'high')).json.ok);
  assert.equal(mockCalls.length, 1);
  assert.equal(mockCalls[0].reasoning_effort, 'high');

  mockCalls.length = 0;
  assert.ok((await chat('mock', 'default')).json.ok);
  assert.equal(mockCalls[0].reasoning_effort, undefined);

  mockCalls.length = 0;
  const res = (await chat('plain', 'low')).json;
  assert.ok(res.ok, res.reply);
  assert.equal(res.reply, 'done');
  assert.equal(mockCalls.length, 2);
  assert.equal(mockCalls[0].reasoning_effort, 'low');
  assert.equal(mockCalls[1].reasoning_effort, undefined);
});

// ─── Fixes: data safety ───

const visionLatex = (projectId, mode, name, contents, model = 'mock') => {
  const form = new FormData();
  form.append('projectId', projectId);
  form.append('mode', mode);
  if (model) form.append('llmConfig', JSON.stringify(llmConfig(model)));
  form.append('image', new Blob([contents]), name);
  return fetch(`${base}/api/vision/latex`, { method: 'POST', body: form }).then((r) => r.json());
};

test('image → LaTeX never replaces a project image and only keeps figures', async () => {
  const p = await newProject('Paste');
  const first = await visionLatex(p.id, 'figure', 'image.png', 'FIRST-FIGURE');
  const second = await visionLatex(p.id, 'figure', 'image.png', 'SECOND-FIGURE');
  assert.deepEqual([first.assetPath, second.assetPath], ['assets/image.png', 'assets/image-2.png']);
  assert.equal(await fs.readFile(path.join(p.path, 'assets/image.png'), 'utf8'), 'FIRST-FIGURE');
  assert.equal(await fs.readFile(path.join(p.path, 'assets/image-2.png'), 'utf8'), 'SECOND-FIGURE');

  const equation = await visionLatex(p.id, 'equation', 'image.png', 'EQUATION');
  assert.ok(equation.ok);
  assert.equal(equation.assetPath, undefined);
  const noKey = await visionLatex(p.id, 'figure', 'other.png', 'X', '');
  assert.equal(noKey.ok, false);
  assert.deepEqual((await fs.readdir(path.join(p.path, 'assets'))).sort(), ['image-2.png', 'image.png']);

  const plot = (await api('/api/plot/from-table', { method: 'POST', body: { projectId: p.id, tableLatex: 'a & b' } })).json;
  assert.equal(plot.ok, false);
  assert.ok(!existsSync(path.join(p.path, 'assets', 'plots')));
});

test('create and rename never replace another file, in any letter case', async () => {
  const p = await newProject('No clobber');
  await writeFile(p.id, 'References.bib', '@misc{mine}\n');
  await writeFile(p.id, 'main.tex', 'main');
  await writeFile(p.id, 'notes.tex', 'notes');
  const create = (filePath) => api(`/api/projects/${p.id}/file`, { method: 'PUT', body: { path: filePath, content: '% new', create: true } });
  assert.equal((await create('references.bib')).status, 409);
  assert.equal((await create('Main.tex')).status, 409);
  assert.equal((await create('fresh.tex')).status, 200);
  assert.equal(await readFile(p.id, 'References.bib'), '@misc{mine}\n');

  const rename = (from, to) => api(`/api/projects/${p.id}/rename`, { method: 'POST', body: { from, to } });
  assert.equal((await rename('notes.tex', 'Main.tex')).status, 409);
  assert.equal((await rename('notes.tex', 'main.tex')).status, 409);
  assert.equal(await readFile(p.id, 'main.tex'), 'main');
  // a case-only rename is the same file
  assert.equal((await rename('notes.tex', 'Notes.tex')).status, 200);
  assert.ok((await fs.readdir(p.path)).includes('Notes.tex'));

  // app data is off limits whatever its letter case
  assert.equal((await writeFile(p.id, '.SPECTRUM/history/index.json', 'garbage')).status, 400);
  assert.equal((await writeFile(p.id, '.Spectrum/project.json', '{}')).status, 400);
  assert.equal((await api(`/api/projects/${p.id}/file?path=.Spectrum`, { method: 'DELETE' })).status, 400);
  assert.ok((await api(`/api/projects/${p.id}/versions`)).json.ok);
});

test('saving replaces a file in one step and keeps its links and permissions', async () => {
  const p = await newProject('Atomic save');
  const script = path.join(p.path, 'run.sh');
  await writeFile(p.id, 'run.sh', 'old');
  await fs.chmod(script, 0o755);
  const before = await fs.stat(script);
  assert.ok((await writeFile(p.id, 'run.sh', 'new')).json.ok);
  const after = await fs.stat(script);
  assert.notEqual(after.ino, before.ino, 'a new file renamed into place, not the old one rewritten');
  assert.equal(after.mode & 0o777, 0o755);
  assert.equal(await readFile(p.id, 'run.sh'), 'new');

  await fs.symlink('run.sh', path.join(p.path, 'link.sh'));
  assert.ok((await writeFile(p.id, 'link.sh', 'through the link')).json.ok);
  assert.ok((await fs.lstat(path.join(p.path, 'link.sh'))).isSymbolicLink());
  assert.equal(await fs.readFile(script, 'utf8'), 'through the link');
  assert.deepEqual((await fs.readdir(p.path)).filter((n) => n.endsWith('.tmp')), []);
});

test('an upload that fails part-way leaves the existing file alone', async () => {
  const p = await newProject('Uploads');
  await fs.writeFile(path.join(p.path, 'video.mp4'), 'original figure');
  const boundary = 'spectrum-boundary';
  await new Promise((resolve) => {
    const req = request({ port, host: '127.0.0.1', method: 'POST', path: `/api/projects/${p.id}/upload`, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    req.on('error', resolve);
    req.on('response', (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.write(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
    req.write(Buffer.alloc(256 * 1024, 7));
    setTimeout(() => req.destroy(), 200);
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await fs.readFile(path.join(p.path, 'video.mp4'), 'utf8'), 'original figure');
  assert.deepEqual((await fs.readdir(p.path)).filter((n) => n.endsWith('.upload')), []);

  const form = new FormData();
  form.append('files', new Blob(['new video']), 'video.mp4');
  const res = await (await fetch(`${base}/api/projects/${p.id}/upload`, { method: 'POST', body: form })).json();
  assert.deepEqual(res.files, ['video.mp4']);
  assert.equal(await fs.readFile(path.join(p.path, 'video.mp4'), 'utf8'), 'new video');
});

test('a compile that runs too long stops everything it started', async () => {
  const { runSpawn } = await import('../src/services/compileService.js');
  const log = [];
  const started = Date.now();
  // the child leaves a grandchild holding the output pipes, like latexmk's pdflatex
  const result = await runSpawn('sh', ['-c', 'sleep 30 & echo started; sleep 30'], tmp, (c) => log.push(String(c)), process.env, 500);
  assert.ok(Date.now() - started < 5000, 'returned promptly');
  assert.equal(result.timedOut, true);
  assert.match(log.join(''), /started[\s\S]*was stopped after 1s/);
  const quick = await runSpawn('sh', ['-c', 'echo hi'], tmp, (c) => log.push(String(c)), process.env, 5000);
  assert.deepEqual(quick, { code: 0, timedOut: false });

  // quitting stops whatever is still running, grandchildren included
  const { killAllChildren } = await import('../src/services/compileService.js');
  const running = runSpawn('sh', ['-c', 'sleep 30 & sleep 30'], tmp, () => {}, process.env, 60_000);
  await new Promise((r) => setTimeout(r, 200));
  const stopping = Date.now();
  killAllChildren();
  assert.equal((await running).timedOut, false);
  assert.ok(Date.now() - stopping < 5000, 'stopped promptly');
});

test('a main file named like an option is refused', async () => {
  const p = await newProject('Dash');
  await writeFile(p.id, '-version.tex', '\\documentclass{article}\\begin{document}x\\end{document}');
  const res = (await api('/api/compile', { method: 'POST', body: { projectId: p.id, mainFile: '-version.tex', engine: 'pdflatex' } })).json;
  assert.equal(res.ok, false);
  assert.match(res.error, /can’t start with/);
  assert.equal((await api(`/api/projects/${p.id}/main-file`, { method: 'PATCH', body: { mainFile: 'sub/-x.tex' } })).status, 400);
});

test('Auto switches to XeLaTeX when an \\input preamble needs it', async (t) => {
  const { tools } = (await api('/api/system/check')).json;
  if (!tools.pdflatex || !tools.xelatex) return t.skip('needs pdflatex and xelatex');
  const p = await newProject('Fontspec');
  await writeFile(p.id, 'main.tex', '\\documentclass{article}\n\\input{preamble}\n\\begin{document}Hello\\end{document}\n');
  await writeFile(p.id, 'preamble.tex', '\\usepackage{fontspec}\n');
  const res = (await api('/api/compile', { method: 'POST', body: { projectId: p.id, mainFile: 'main.tex', engine: 'auto' } })).json;
  assert.ok(res.ok, res.error || res.log);
  assert.equal(res.engine, 'xelatex');
});

test('restore moves aside files versions never captured instead of overwriting them', async () => {
  const p = await newProject('Big data');
  const versions = `/api/projects/${p.id}/versions`;
  await fs.writeFile(path.join(p.path, 'data.csv'), 'a,b\n1,2\n');
  await writeFile(p.id, 'main.tex', 'v1');
  assert.ok((await api(versions, { method: 'POST', body: {} })).json.version);
  const big = Buffer.alloc(51 * 1024 * 1024, 120);
  await fs.writeFile(path.join(p.path, 'data.csv'), big);

  const compare = (await api(`${versions}/1/compare`)).json.files;
  assert.deepEqual(compare.find((f) => f.path === 'data.csv')?.status, 'untracked');
  const res = (await api(`${versions}/1/restore`, { method: 'POST', body: {} })).json;
  assert.ok(res.ok);
  assert.deepEqual(res.keptAside, ['data (before restore).csv']);
  assert.equal(await fs.readFile(path.join(p.path, 'data.csv'), 'utf8'), 'a,b\n1,2\n');
  assert.equal((await fs.stat(path.join(p.path, 'data (before restore).csv'))).size, big.length);
});

test('a broken link or unreadable file does not block versions', async () => {
  const p = await newProject('Broken link');
  await writeFile(p.id, 'main.tex', 'hello');
  await fs.symlink('/Volumes/NotMounted/refs.bib', path.join(p.path, 'refs.bib'));
  await fs.writeFile(path.join(p.path, 'locked.log'), 'secret');
  await fs.chmod(path.join(p.path, 'locked.log'), 0o000);
  try {
    const v = (await api(`/api/projects/${p.id}/versions`, { method: 'POST', body: {} })).json;
    assert.ok(v.ok, v.error);
    assert.ok(v.version.summary.files.includes('main.tex'));
    assert.ok(!v.version.summary.files.includes('refs.bib'));
    assert.ok((await api(`/api/projects/${p.id}/versions/1/compare`)).json.ok);
    assert.ok((await api(`/api/projects/${p.id}/versions/1/restore`, { method: 'POST', body: {} })).json.ok);
    assert.ok(existsSync(path.join(p.path, 'locked.log')), 'restore leaves an unreadable file alone');
    // the link itself can still be removed
    assert.ok((await api(`/api/projects/${p.id}/file?path=refs.bib`, { method: 'DELETE' })).json.ok);
  } finally {
    await fs.chmod(path.join(p.path, 'locked.log'), 0o644);
  }
});

test('quick template switch keeps the user\'s own files', async () => {
  const p = await newProject('Switch');
  await writeFile(p.id, 'references.bib', '@article{mine2024, title = {Mine}}\n');
  await writeFile(p.id, 'paper.tex', '\\documentclass{article}\\begin{document}My body\\end{document}');
  await writeFile(p.id, 'main.tex', 'unrelated notes');
  const res = (await api(`/api/projects/${p.id}/convert-template`, { method: 'POST', body: { targetTemplate: 'neurips', mainFile: 'paper.tex' } })).json;
  assert.ok(res.ok, res.error);
  assert.equal(res.mainFile, 'paper.tex');
  assert.match(await readFile(p.id, 'references.bib'), /mine2024/);
  assert.equal(await readFile(p.id, 'main.tex'), 'unrelated notes');
  assert.match(await readFile(p.id, 'paper.tex'), /^\\documentclass\[11pt\]\{article\}[\s\S]*My body/);
  assert.ok(!res.changedFiles.includes('references.bib'));
});

test('startup migration leaves a later project.json alone', async () => {
  const legacyRoot = path.join(dataDir, legacyId);
  assert.ok((await writeFile(legacyId, 'project.json', '{"experiment":"results I need"}')).json.ok);
  await restartServer();
  assert.equal(await fs.readFile(path.join(legacyRoot, 'project.json'), 'utf8'), '{"experiment":"results I need"}');
});

test('duplicating keeps links inside the project relative', async () => {
  const p = await newProject('Link src');
  await writeFile(p.id, 'shared/macros.tex', 'original');
  await fs.symlink('shared/macros.tex', path.join(p.path, 'macros.tex'));
  const copy = (await api(`/api/projects/${p.id}/copy`, { method: 'POST', body: {} })).json.project;
  assert.equal(await fs.readlink(path.join(copy.path, 'macros.tex')), 'shared/macros.tex');
  assert.ok((await writeFile(copy.id, 'macros.tex', 'edited in the copy')).json.ok);
  assert.equal(await readFile(p.id, 'shared/macros.tex'), 'original');
});

// ─── Fixes: projects and templates ───

test('imports record the main file, not the first fragment', async (t) => {
  try {
    execFileSync('zip', ['-v'], { stdio: 'ignore' });
  } catch {
    return t.skip('zip not installed');
  }
  const src = path.join(tmp, 'arxivlike');
  await fs.mkdir(src, { recursive: true });
  await fs.writeFile(path.join(src, 'background.tex'), '\\section{Background} text');
  await fs.writeFile(path.join(src, 'ms.tex'), '% \\documentclass{fake}\n\\documentclass{article}\n\\begin{document}\\input{background}\\end{document}');
  const zipPath = path.join(tmp, 'arxivlike.zip');
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: src });
  const form = new FormData();
  form.append('zip', new Blob([await fs.readFile(zipPath)]), 'arxivlike.zip');
  const res = await (await fetch(`${base}/api/projects/import-zip`, { method: 'POST', body: form })).json();
  assert.ok(res.ok, res.error);
  assert.equal(res.project.mainFile, 'ms.tex');

  const bad = new FormData();
  bad.append('zip', new Blob(['not a zip at all']), 'broken.zip');
  const broken = await (await fetch(`${base}/api/projects/import-zip`, { method: 'POST', body: bad })).json();
  assert.deepEqual(broken, { ok: false, error: 'That file isn’t a valid .zip archive.' });
});

test('arXiv sources never bring links along', async () => {
  const { extractArxivSource } = await import('../src/routes/projects.js');
  const src = path.join(tmp, 'tarsrc');
  await fs.mkdir(src, { recursive: true });
  await fs.writeFile(path.join(src, 'main.tex'), 'paper');
  await fs.symlink('/etc/hosts', path.join(src, 'refs.tex'));
  const tarball = path.join(tmp, 'source.tar');
  execFileSync('tar', ['-cf', tarball, '-C', src, 'main.tex', 'refs.tex'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const out = path.join(tmp, 'tarout');
  await fs.mkdir(out);
  await extractArxivSource(tarball, out);
  assert.deepEqual((await fs.readdir(out)).sort(), ['main.tex']);
});

test('imports from arXiv, and a cancelled import stops the download and leaves nothing behind', { timeout: 15000 }, async () => {
  const parentDir = path.join(tmp, 'arxiv-imports');
  const sse = (id, signal) => fetch(`${base}/api/projects/import-arxiv-sse?${new URLSearchParams({ arxivIdOrUrl: id, parentDir })}`, { signal });

  const stream = await (await sse('2401.00001')).text();
  const { project } = JSON.parse(stream.match(/^event: done\ndata: (.*)$/m)[1]);
  assert.equal(project.mainFile, 'main.tex');
  assert.match(await readFile(project.id, 'main.tex'), /From arXiv/);

  const cancel = new AbortController();
  const reader = (await sse('2401.99999', cancel.signal)).body.getReader();
  let text = '';
  while (!text.includes('"received":')) text += new TextDecoder().decode((await reader.read()).value);
  cancel.abort();
  await arxivDropped; // the server stopped its own download
  for (let i = 0; i < 50 && (await fs.readdir(parentDir)).length > 1; i += 1) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(await fs.readdir(parentDir), [path.basename(project.path)]);
  assert.ok(!(await api('/api/projects')).json.projects.some((p) => p.name === 'arXiv 2401.99999'));
});

test('template uploads unwrap Finder zips and never replace a template', async (t) => {
  try {
    execFileSync('zip', ['-v'], { stdio: 'ignore' });
  } catch {
    return t.skip('zip not installed');
  }
  const src = path.join(tmp, 'tplsrc');
  await fs.mkdir(path.join(src, 'My Template'), { recursive: true });
  await fs.mkdir(path.join(src, '__MACOSX', 'My Template'), { recursive: true });
  await fs.writeFile(path.join(src, 'My Template', 'paper_latex.tex'), '\\documentclass{article}\\begin{document}T\\end{document}');
  await fs.writeFile(path.join(src, '__MACOSX', 'My Template', '._paper_latex.tex'), 'junk');
  const zipPath = path.join(tmp, 'MyTemplate.zip');
  execFileSync('zip', ['-qr', zipPath, 'My Template', '__MACOSX'], { cwd: src });
  const upload = async (id) => {
    const form = new FormData();
    form.append('templateId', id);
    form.append('templateLabel', 'My template');
    form.append('file', new Blob([await fs.readFile(zipPath)]), 'MyTemplate.zip');
    const res = await fetch(`${base}/api/templates/upload`, { method: 'POST', body: form });
    return { status: res.status, json: await res.json() };
  };
  const ok = await upload('mytemplate');
  assert.ok(ok.json.ok, ok.json.error);
  assert.deepEqual(await fs.readdir(path.join(templateDir, 'mytemplate')), ['paper_latex.tex']);
  const { templates, categories } = (await api('/api/templates')).json;
  assert.equal(templates.find((x) => x.id === 'mytemplate').mainFile, 'paper_latex.tex');
  assert.deepEqual(categories.map((c) => c.id), ['all', 'academic']);
  assert.equal(templates.find((x) => x.id === 'arxiv').label, 'arXiv preprint');

  assert.equal((await upload('mytemplate')).status, 409);
  assert.equal((await upload('ACL')).status, 409);
  assert.equal(templates.find((x) => x.id === 'acl').label, (await api('/api/templates')).json.templates.find((x) => x.id === 'acl').label);
  assert.ok(!(await fs.readdir(path.join(templateDir, 'acl'))).includes('paper_latex.tex'));

  const p = await newProject('From upload', { template: 'mytemplate' });
  const res = (await api(`/api/projects/${p.id}/convert-template`, { method: 'POST', body: { targetTemplate: 'mytemplate', mainFile: 'paper_latex.tex' } })).json;
  assert.ok(res.ok, res.error);

  // the merged document goes back into the project's own main file; the template's isn't added
  const q = await newProject('Own main');
  await writeFile(q.id, 'main.tex', '\\documentclass{book}\\begin{document}Kept body\\end{document}');
  const switched = (await api(`/api/projects/${q.id}/convert-template`, { method: 'POST', body: { targetTemplate: 'mytemplate', mainFile: 'main.tex' } })).json;
  assert.ok(switched.ok, switched.error);
  assert.equal(switched.mainFile, 'main.tex');
  assert.equal(await readFile(q.id, 'main.tex'), '\\documentclass{article}\\begin{document}\nKept body\n\\end{document}');
  assert.ok(!existsSync(path.join(q.path, 'paper_latex.tex')));
});

test('word count follows \\input from the main file\'s folder', async () => {
  const p = await newProject('Thesis');
  await writeFile(p.id, 'thesis/main.tex', '\\documentclass{article}\\begin{document}\nSeven words live in the main file.\n\\input{chapters/intro}\n\\end{document}\n');
  await writeFile(p.id, 'thesis/chapters/intro.tex', 'Ten more words are in the chapter file right here today.\n');
  const stats = (await api(`/api/projects/${p.id}/stats?mainFile=thesis/main.tex`)).json;
  assert.ok(stats.words >= 17, JSON.stringify(stats));

  const { inlineInputs } = await import('../src/utils/texUtils.js');
  await writeFile(p.id, 'shared/defs.tex', 'ROOT-RELATIVE');
  await writeFile(p.id, 'thesis/two.tex', '\\input{chapters/intro}\\input{shared/defs}% \\input{nope}');
  const inlined = await inlineInputs(p.path, 'thesis/two.tex', { stripComments: true });
  assert.match(inlined, /Ten more words[\s\S]*ROOT-RELATIVE/);
});

test('tags and archive keep Modified, and a missing folder keeps both', async () => {
  const p = await newProject('Metadata');
  const before = (await api('/api/projects')).json.projects.find((x) => x.id === p.id);
  await api(`/api/projects/${p.id}/tags`, { method: 'PATCH', body: { tags: ['2024'] } });
  await api(`/api/projects/${p.id}/archive`, { method: 'PATCH', body: { archived: true } });
  const after = (await api('/api/projects')).json.projects.find((x) => x.id === p.id);
  assert.equal(after.updatedAt, before.updatedAt);

  await fs.rename(p.path, `${p.path} moved`);
  const missing = (await api('/api/projects')).json.projects.find((x) => x.id === p.id);
  assert.deepEqual([missing.missing, missing.tags, missing.archived], [true, ['2024'], true]);
  await fs.rename(`${p.path} moved`, p.path);
});

// ─── Fixes: transfer ───

test('copyAssets finds figures without an extension or through \\graphicspath', async () => {
  const { copyAssets } = await import('../src/services/transferAgent/nodes/copyAssets.js');
  const { compiledCleanly } = await import('../src/services/transferAgent/nodes/compile.js');
  const { finalize } = await import('../src/services/transferAgent/nodes/finalize.js');
  const source = path.join(tmp, 'xfer-src');
  const target = path.join(tmp, 'xfer-dst');
  await fs.mkdir(path.join(source, 'paper', 'figs'), { recursive: true });
  await fs.mkdir(path.join(source, 'paper', 'img'), { recursive: true });
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(source, 'paper', 'figs', 'plot.png'), 'png');
  await fs.writeFile(path.join(source, 'paper', 'img', 'logo.pdf'), 'pdf');
  await fs.writeFile(path.join(source, 'paper', 'refs.bib'), '@misc{x}');
  const out = await copyAssets({
    sourceProjectRoot: source,
    targetProjectRoot: target,
    sourceMainFile: 'paper/main.tex',
    sourceAssets: { bib: ['refs.bib'], images: ['figs/plot', 'logo', 'missing'], graphicsPaths: ['img/'], styles: [] }
  });
  assert.equal(out.progressLog, 'Copied 3 files from the source; 1 couldn’t be found.');
  assert.deepEqual((await fs.readdir(target)).sort(), ['figs', 'logo.pdf', 'refs.bib']);
  assert.ok(existsSync(path.join(target, 'figs', 'plot.png')));

  // a PDF with LaTeX errors isn't a successful transfer
  assert.equal(compiledCleanly({ ok: true, status: 1 }), false);
  assert.equal(compiledCleanly({ ok: true, status: 0 }), true);
  assert.equal((await finalize({ compileResult: { ok: true, status: 1, pdf: 'x' }, compileAttempt: 5 })).status, 'failed');
});

test('a template change without a model creates nothing; one that errors leaves nothing behind', async () => {
  const src = await newProject('Beta notes');
  await writeFile(src.id, 'main.tex', '\\documentclass{article}\\begin{document}\\section{Intro}Hi\\end{document}');
  const count = async () => (await listIds()).length;
  const before = await count();
  const body = { sourceProjectId: src.id, sourceMainFile: 'main.tex', targetTemplateId: 'cvpr', targetMainFile: 'main.tex' };
  const noKey = await api('/api/transfer/start', { method: 'POST', body });
  assert.equal(noKey.status, 400);
  assert.match(noKey.json.error, /No AI model is set up yet/);
  assert.equal((await api('/api/transfer/start-mineru', { method: 'POST', body: { ...body, llmConfig: llmConfig() } })).status, 400);
  assert.equal(await count(), before);

  const started = (await api('/api/transfer/start', { method: 'POST', body: { ...body, llmConfig: llmConfig('broken') } })).json;
  const target = (await api('/api/projects')).json.projects.find((x) => x.id === started.newProjectId);
  assert.equal(target.name, 'Beta notes (CVPR)');
  const step = await api('/api/transfer/step', { method: 'POST', body: { jobId: started.jobId } });
  assert.equal(step.status, 500);
  assert.ok(step.json.progressLog.length > 0);
  assert.ok(step.json.progressLog.every((line) => !line.startsWith('[')), step.json.progressLog.join('\n'));
  assert.equal(await count(), before);
  assert.ok(!existsSync(target.path));
});

test('model errors are plain sentences', async () => {
  const chat = (config) => api('/api/agent/run', {
    method: 'POST',
    body: { task: 'chat', prompt: 'hi', mode: 'direct', interaction: 'chat', llmConfig: config }
  });
  assert.equal((await chat(llmConfig('denied'))).json.reply, 'The API key was rejected. Check it in Settings → Models.');
  assert.equal((await chat(llmConfig('broken'))).json.reply, 'The model provider returned an error (HTTP 500): boom.');
  assert.equal((await chat({})).json.reply, 'No AI model is set up yet. Add an endpoint, model and API key in Settings → Models.');
  assert.match((await chat({ endpoint: 'http://127.0.0.1:9/v1', apiKey: 'k', model: 'm' })).json.reply, /^Couldn’t reach 127\.0\.0\.1:9\./);
});

test('removed routes are gone', async () => {
  const p = await newProject('Routes');
  assert.equal((await api(`/api/projects/${p.id}/files`)).status, 404);
  assert.equal((await api('/api/arxiv/bibtex', { method: 'POST', body: { arxivId: '1706.03762' } })).status, 404);
  assert.equal((await api('/api/transfer/status/abc')).status, 404);
});

// ─── Fixes: security ───

const raw = (rawPath, headers = {}) => new Promise((resolve) => {
  request({ port, host: '127.0.0.1', path: rawPath, headers }, (res) => {
    res.resume();
    resolve(res.statusCode);
  }).end();
});

test('the local-only gate holds however the path is spelt', async () => {
  assert.equal(await raw('/%61pi/projects', { host: 'evil.example' }), 403);
  assert.equal(await raw('/%61pi/projects', { origin: 'https://evil.example' }), 403);
  assert.equal(await raw('/api/projects', { origin: 'null' }), 403);
  // <img src> and links from other sites carry no Origin, but browsers mark them cross-site
  assert.equal(await raw('/api/projects/import-arxiv-sse?arxivIdOrUrl=x', { 'sec-fetch-site': 'cross-site' }), 403);
  assert.equal(await raw('/api/projects', { 'sec-fetch-site': 'same-origin' }), 200);
});

test('file routes do not follow links out of the project', async () => {
  const p = await newProject('Links out');
  const outside = path.join(tmp, 'outside-secret.txt');
  await fs.writeFile(outside, 'secret');
  await fs.symlink(outside, path.join(p.path, 'link.tex'));
  assert.equal((await api(`/api/projects/${p.id}/file?path=link.tex`)).status, 400);
  assert.equal((await writeFile(p.id, 'link.tex', 'overwritten-through-link')).status, 400);
  assert.equal(await fs.readFile(outside, 'utf8'), 'secret');
  await fs.symlink(tmp, path.join(p.path, 'dir-link'));
  assert.equal((await writeFile(p.id, 'dir-link/escape.txt', 'x')).status, 400);
  assert.ok(!existsSync(path.join(tmp, 'escape.txt')));
});
