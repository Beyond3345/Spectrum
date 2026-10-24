// A project's own data in .spectrum beside project.json: its settings, to-dos and PDF notes, the labels Document
// insights reads from the last compile, and compile checkpoints. In-process, against throwaway data and projects
// folders and a fake home folder. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-data-')));
const dataDir = path.join(tmp, 'data');
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  USERPROFILE: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: dataDir,
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { default: Fastify } = await import('fastify');
const { registerProjectRoutes } = await import('../src/routes/projects.js');
const { registerVersionRoutes } = await import('../src/routes/versions.js');
const { registerTodoRoutes } = await import('../src/routes/todos.js');
const { registerNoteRoutes } = await import('../src/routes/notes.js');
const { createProject } = await import('../src/services/projectService.js');
const { createCompileCheckpoint, createVersion, listVersions, readVersionFile, restoreVersion } = await import('../src/services/versionService.js');
const { parseLabels } = await import('../src/services/statsService.js');

const app = Fastify();
registerProjectRoutes(app);
registerVersionRoutes(app);
registerTodoRoutes(app);
registerNoteRoutes(app);

after(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

async function api(url, method = 'GET', body) {
  const res = await app.inject({ url, method, ...(body !== undefined && { payload: body }) });
  return { status: res.statusCode, json: res.json() };
}

const newProject = (name, files = { 'main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}\n' }) => createProject({
  name,
  populate: async (root) => {
    for (const [rel, text] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await fs.writeFile(path.join(root, rel), text);
    }
  }
});
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

test('project settings keep only valid compile choices, and null puts one back to the default', async () => {
  const p = await newProject('Settings');
  const url = `/api/projects/${p.id}/settings`;
  assert.deepEqual((await api(url)).json, { ok: true, settings: {} });

  const set = await api(url, 'PATCH', { compile: { engine: 'xelatex', autoCompile: 3, haltOnError: true, bibTool: 'biber', draft: false, syntaxCheck: false } });
  assert.equal(set.status, 200);
  assert.deepEqual(set.json.settings, { compile: { engine: 'xelatex', autoCompile: 3, haltOnError: true, bibTool: 'biber', draft: false, syntaxCheck: false } });
  // in its own file, never project.json, which 1.10.4 rewrites through its own list of keys
  assert.deepEqual(await readJson(path.join(p.path, '.spectrum', 'settings.json')), set.json.settings);
  assert.equal((await readJson(path.join(p.path, '.spectrum', 'project.json'))).compile, undefined);

  assert.deepEqual((await api(url, 'PATCH', { compile: { engine: null, autoCompile: 0 } })).json.settings, { compile: { autoCompile: 0, haltOnError: true, bibTool: 'biber', draft: false, syntaxCheck: false } });
  for (const compile of [{ engine: 'word' }, { autoCompile: 11 }, { autoCompile: 1.5 }, { haltOnError: 'yes' }, { bibTool: 'biblatex' }, { draft: 1 }, { syntaxCheck: 'on' }, { shellEscape: true }, { constructor: true }]) {
    assert.equal((await api(url, 'PATCH', { compile })).status, 400, JSON.stringify(compile));
  }
  assert.equal((await api(url, 'PATCH', { zotero: { key: 'x' } })).status, 400);

  // what another version of Spectrum keeps there stays, and a group left empty goes
  const file = path.join(p.path, '.spectrum', 'settings.json');
  await fs.writeFile(file, JSON.stringify({ github: { owner: 'me', repo: 'paper' }, compile: { draft: true } }));
  assert.deepEqual((await api(url, 'PATCH', { compile: { draft: null } })).json.settings, { github: { owner: 'me', repo: 'paper' } });

  // one that can't be read reads as none, and isn't replaced
  await fs.writeFile(file, '{"github": {"owner"');
  assert.deepEqual((await api(url)).json.settings, {});
  assert.equal((await api(url, 'PATCH', { compile: { draft: true } })).status, 409);
  assert.equal(await fs.readFile(file, 'utf8'), '{"github": {"owner"');
});

test('project.json keeps the keys a later version wrote', async () => {
  const p = await newProject('Later keys');
  const meta = path.join(p.path, '.spectrum', 'project.json');
  await fs.writeFile(meta, JSON.stringify({ ...(await readJson(meta)), laterSetting: { on: true } }));
  assert.equal((await api(`/api/projects/${p.id}/tags`, 'PATCH', { tags: ['ml'] })).status, 200);
  const saved = await readJson(meta);
  assert.deepEqual(saved.laterSetting, { on: true });
  assert.deepEqual(saved.tags, ['ml']);
  assert.equal(saved.id, p.id);
});

test('to-dos are saved one file each and checked', async () => {
  const p = await newProject('To-dos');
  const url = `/api/projects/${p.id}/todos`;
  const todo = (id, extra = {}) => ({ id, text: 'Fix the figure', done: false, createdAt: '2026-10-24T01:00:00.000Z', updatedAt: '2026-10-24T01:00:00.000Z', ...extra });
  assert.deepEqual((await api(url)).json, { ok: true, todos: [] });

  const line = await api(`${url}/b`, 'PUT', todo('b', { link: { file: 'main.tex', line: 3, snippet: 'x'.repeat(3000) }, junk: 1 }));
  assert.equal(line.status, 200);
  assert.equal(line.json.todo.link.snippet.length, 2000);
  // a field a later version adds, and a kind of link it adds, come through a save here
  assert.equal(line.json.todo.junk, 1);
  const later = todo('l', { priority: 'high', link: { url: 'https://example.org', note: 'x' } });
  assert.deepEqual((await api(`${url}/l`, 'PUT', later)).json.todo, later);
  assert.equal((await api(`${url}/l`, 'DELETE')).status, 200);
  assert.equal((await api(`${url}/a`, 'PUT', todo('a', { createdAt: '2026-10-23T00:00:00.000Z', link: { doc: 'main.tex', page: 2 } }))).status, 200);
  assert.equal((await api(`${url}/c`, 'PUT', todo('c', { done: true, createdAt: '2026-10-25T00:00:00.000Z', link: { key: 'Knuth1984' } }))).status, 200);
  assert.deepEqual((await api(url)).json.todos.map((t) => t.id), ['a', 'b', 'c']);
  assert.deepEqual(await readJson(path.join(p.path, '.spectrum', 'todos', 'a.json')), todo('a', { createdAt: '2026-10-23T00:00:00.000Z', link: { doc: 'main.tex', page: 2 } }));

  // a sync app's conflict copy isn't listed twice, nor a half-written file
  await fs.copyFile(path.join(p.path, '.spectrum', 'todos', 'a.json'), path.join(p.path, '.spectrum', 'todos', 'a (conflicted copy).json'));
  await fs.writeFile(path.join(p.path, '.spectrum', 'todos', 'd.json'), '{"id":');
  // nor one edited by hand into something the editor can't show
  await fs.writeFile(path.join(p.path, '.spectrum', 'todos', 'f.json'), '{"id":"f","text":5,"createdAt":1}');
  assert.equal((await api(url)).json.todos.length, 3);

  for (const [id, body] of [['a', todo('b')], ['bad id', todo('bad id')], ['e', todo('e', { text: 'x'.repeat(2001) })], ['e', todo('e', { done: 'no' })],
    ['e', todo('e', { link: { file: 'main.tex', line: 0 } })], ['e', todo('e', { link: { doc: 'main.tex' } })], ['e', todo('e', { link: 'main.tex' })], ['e', { id: 'e' }]]) {
    assert.equal((await api(`${url}/${encodeURIComponent(id)}`, 'PUT', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await api(`${url}/b`, 'DELETE')).status, 200);
  assert.deepEqual((await api(url)).json.todos.map((t) => t.id), ['a', 'c']);
});

test('PDF notes are saved one file each and listed per document', async () => {
  const p = await newProject('Notes');
  const url = `/api/projects/${p.id}/notes`;
  const note = (id, doc, extra = {}) => ({ id, doc, page: 1, x: 0.25, y: 0.5, text: 'Check this', createdAt: '2026-10-24T01:00:00.000Z', updatedAt: '2026-10-24T01:00:00.000Z', ...extra });
  assert.equal((await api(`${url}/n1`, 'PUT', note('n1', 'main.tex', { colour: '#ffcc00' }))).status, 200);
  assert.equal((await api(`${url}/n2`, 'PUT', note('n2', 'chapters/notes.tex'))).status, 200);
  assert.deepEqual((await api(`${url}?doc=main.tex`)).json.notes, [note('n1', 'main.tex', { colour: '#ffcc00' })]);
  assert.equal((await api(url)).json.notes.length, 2);
  assert.ok((await fs.stat(path.join(p.path, '.spectrum', 'notes', 'n2.json'))).isFile());
  // a field a later version adds comes through a save here
  assert.equal((await api(`${url}/n2`, 'PUT', note('n2', 'chapters/notes.tex', { pinned: true }))).json.note.pinned, true);
  for (const body of [note('n3', ''), note('n3', 'main.tex', { page: 0 }), note('n3', 'main.tex', { x: 'left' }), note('n3', 'main.tex', { text: 'x'.repeat(2001) }), note('n4', 'main.tex')]) {
    assert.equal((await api(`${url}/n3`, 'PUT', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await api(`${url}/n1`, 'DELETE')).status, 200);
  assert.deepEqual((await api(`${url}?doc=main.tex`)).json.notes, []);
});

test('renaming a document or its folder takes its PDF notes and the to-dos linked to it along', async () => {
  const p = await newProject('Renamed', { 'main.tex': '\\documentclass{article}\\begin{document}\\input{chapters/one}\\end{document}\n', 'chapters/one.tex': 'One\n' });
  const at = (minute) => `2026-10-24T01:0${minute}:00.000Z`;
  const url = `/api/projects/${p.id}`;
  await api(`${url}/notes/n1`, 'PUT', { id: 'n1', doc: 'main.tex', page: 1, x: 1, y: 2, text: 'Note', createdAt: at(0), updatedAt: at(0) });
  await api(`${url}/todos/t1`, 'PUT', { id: 't1', text: 'Line', done: false, createdAt: at(1), updatedAt: at(1), link: { file: 'chapters/one.tex', line: 1, snippet: 'One' } });
  await api(`${url}/todos/t2`, 'PUT', { id: 't2', text: 'Page', done: false, createdAt: at(2), updatedAt: at(2), link: { doc: 'main.tex', page: 1 } });
  await api(`${url}/todos/t3`, 'PUT', { id: 't3', text: 'Other', done: false, createdAt: at(3), updatedAt: at(3), link: { file: 'chapters-old/one.tex', line: 1 } });
  assert.equal((await api(`${url}/rename`, 'POST', { from: 'main.tex', to: 'paper.tex' })).json.ok, true);
  assert.equal((await api(`${url}/rename`, 'POST', { from: 'chapters', to: 'parts' })).json.ok, true);
  assert.deepEqual((await api(`${url}/notes?doc=paper.tex`)).json.notes.map((n) => n.id), ['n1']);
  assert.deepEqual((await api(`${url}/todos`)).json.todos.map((t) => t.link), [
    { file: 'parts/one.tex', line: 1, snippet: 'One' },
    { doc: 'paper.tex', page: 1 },
    { file: 'chapters-old/one.tex', line: 1 }
  ]);
  // a note that can't be rewritten is passed by, the to-dos still move, and the rename says how many stayed
  if (process.platform === 'win32') return; // no read-only folders
  const notes = path.join(p.path, '.spectrum', 'notes');
  await fs.chmod(notes, 0o555);
  try {
    assert.deepEqual((await api(`${url}/rename`, 'POST', { from: 'paper.tex', to: 'thesis.tex' })).json, { ok: true, unmoved: 1 });
  } finally {
    await fs.chmod(notes, 0o755);
  }
  assert.deepEqual((await api(`${url}/notes?doc=paper.tex`)).json.notes.map((n) => n.id), ['n1']);
  assert.equal((await api(`${url}/todos`)).json.todos[1].link.doc, 'thesis.tex');
});

test('labels are read from the kept .aux files, with when they were written and whether the source is newer', async () => {
  assert.deepEqual(parseLabels([
    '\\newlabel{fig:left}{{1a}{1}{Left}{figure.caption.1}{}}',
    '\\newlabel{fig:left@cref}{{[subfigure][1][1]1a}{[1][1][]1}{}{}{}}',
    '\\newlabel{eq:a}{{\\textup {(a)}}{iv}}',
    '\\newlabel{cut}{{1}',
    '\\newlabel{app:more}{{A}{12}{More}{appendix.A}{}}'
  ].join('\n')), { 'fig:left': { number: '1a', page: '1' }, 'eq:a': { number: '(a)', page: 'iv' }, 'app:more': { number: 'A', page: '12' } });

  const p = await newProject('Insights', {
    'main.tex': '\\documentclass{article}\\begin{document}\\include{chapters/one}\\end{document}\n',
    'chapters/one.tex': '\\section{One}\\label{sec:one}\n'
  });
  const stats = async () => (await api(`/api/projects/${p.id}/stats?doc=main.tex`)).json;
  const never = await stats();
  assert.ok(never.words >= 0);
  assert.deepEqual([never.labels, never.auxAt, never.stale], [{}, null, true]);

  // as a compile keeps them: the document's own .aux and its \include'd chapters'
  const store = path.join(dataDir, 'cache', p.id, 'aux-files', 'main.tex');
  await fs.mkdir(path.join(store, 'chapters'), { recursive: true });
  await fs.writeFile(path.join(store, 'main.aux'), [
    '\\relax',
    '\\@writefile{toc}{\\contentsline {section}{Preface}{i}{section*.1}\\protected@file@percent }',
    '\\@input{chapters/one.aux}',
    '\\@writefile{toc}{\\contentsline {section}{\\numberline {2}Two}{3}{section.2}\\protected@file@percent }',
    '\\newlabel{fig:x}{{2}{3}}',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(store, 'chapters', 'one.aux'), '\\relax\n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}One}{1}{section.1}}\n\\newlabel{sec:one}{{1}{1}{One}{section.1}{}}\n');
  const later = new Date(Date.now() + 60_000);
  await fs.utimes(path.join(store, 'main.aux'), later, later);
  const fresh = await stats();
  assert.deepEqual(fresh.labels, { 'fig:x': { number: '2', page: '3' }, 'sec:one': { number: '1', page: '1' } });
  // every heading's number and page in reading order, a chapter's where it's \include'd
  assert.deepEqual(fresh.headings, [{ level: 'section', number: '', page: 'i' }, { level: 'section', number: '1', page: '1' }, { level: 'section', number: '2', page: '3' }]);
  // as precise as the disk keeps times
  assert.ok(Math.abs(fresh.auxAt - later.getTime()) < 1000, String(fresh.auxAt));
  assert.equal(fresh.stale, false);
  // a file the document doesn't read doesn't count
  await fs.writeFile(path.join(p.path, 'other.tex'), 'Elsewhere\n');
  await fs.utimes(path.join(p.path, 'other.tex'), new Date(Date.now() + 120_000), new Date(Date.now() + 120_000));
  assert.equal((await stats()).stale, false);

  const newer = new Date(Date.now() + 120_000);
  await fs.utimes(path.join(p.path, 'chapters', 'one.tex'), newer, newer);
  assert.equal((await stats()).stale, true);
  // 1.10.4's editor asked by mainFile
  assert.deepEqual((await api(`/api/projects/${p.id}/stats?mainFile=main.tex`)).json.labels, fresh.labels);
});

test('compile checkpoints: only when something changed, at most one every 10 minutes, never in place of a manual or named one', async () => {
  const p = await newProject('Checkpoints');
  const versions = async () => (await api(`/api/projects/${p.id}/versions`)).json.versions;
  const edit = (text) => fs.writeFile(path.join(p.path, 'main.tex'), text);
  const manifest = (id) => path.join(p.path, '.spectrum', 'history', 'manifests', `${id}.json`);
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  const rewrite = async (id, fields) => fs.writeFile(manifest(id), JSON.stringify({ ...(await readJson(manifest(id))), ...fields }));

  const first = await createCompileCheckpoint(p.path);
  assert.equal(first.saved, true);
  const [{ createdAt: firstAt }] = await versions();
  assert.deepEqual(await createCompileCheckpoint(p.path), { saved: false });
  // a newer compile's takes its place, its changes counted from the one before that
  await edit('one');
  const second = await createCompileCheckpoint(p.path);
  assert.equal(second.saved, true);
  assert.deepEqual((await versions()).map((v) => [v.id, v.reason, v.summary.kind]), [[second.id, 'compile', 'initial']]);
  // the 10 minutes run from the first of them, however many came since
  assert.equal((await readJson(manifest(second.id))).since, firstAt);
  await rewrite(second.id, { since: ago(11) });
  await edit('two');
  const third = await createCompileCheckpoint(p.path);
  assert.equal((await versions()).length, 2);

  // a manual one in between, or a name given, keeps the one before
  await edit('two, saved by hand');
  await createVersion(p.path, { label: '' });
  await edit('three');
  await createCompileCheckpoint(p.path);
  assert.equal((await versions()).length, 4);
  const named = (await versions())[0];
  await api(`/api/projects/${p.id}/versions/${named.id}`, 'PATCH', { label: 'Submitted' });
  await edit('four');
  await createCompileCheckpoint(p.path);
  assert.equal((await versions()).length, 5);

  // what couldn't be captured is said, so the editor can say so; it still takes the place of the one before
  const big = await fs.open(path.join(p.path, 'video.mp4'), 'w');
  await big.truncate(51 * 1024 * 1024);
  await big.close();
  await edit('five');
  assert.deepEqual((await createCompileCheckpoint(p.path)).skipped, ['video.mp4']);
  assert.equal((await versions()).length, 5);

  // Delete automatic checkpoints older than…: only compiles' without a name, only by age
  await rewrite(third.id, { createdAt: ago(8 * 24 * 60) });
  const url = `/api/projects/${p.id}/versions`;
  assert.equal((await api(`${url}?olderThanDays=7`, 'DELETE')).status, 400);
  assert.equal((await api(`${url}?automatic=1&olderThanDays=-1`, 'DELETE')).status, 400);
  const before = await versions();
  assert.deepEqual((await api(`${url}?automatic=1&olderThanDays=7`, 'DELETE')).json, { ok: true, removed: 1 });
  assert.deepEqual((await versions()).map((v) => v.id), before.filter((v) => v.id !== third.id).map((v) => v.id));
  assert.equal((await api(`${url}?automatic=1&olderThanDays=0`, 'DELETE')).json.removed, 2);
  assert.deepEqual((await versions()).map((v) => [v.reason, v.label]), [['compile', 'Submitted'], ['manual', '']]);
});

test('a checkpoint asked for with nothing changed since a compile’s becomes that one, so the next compile keeps it', async () => {
  const p = await newProject('Promoted');
  const versions = async () => listVersions(p.path);
  const edit = (text) => fs.writeFile(path.join(p.path, 'main.tex'), text);
  const holding = async (text) => {
    const held = [];
    for (const v of await versions()) if ((await readVersionFile(p.path, v.id, 'main.tex')).content === text) held.push(v.reason);
    return held;
  };
  for (const [reason, label] of [['manual', ''], ['before-ai', 'Before applying agent changes'], ['before-restore', '']]) {
    await edit(`saved: ${reason}`);
    await createCompileCheckpoint(p.path);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const asked = new Date().toISOString();
    const { unchanged } = await createVersion(p.path, { reason, label });
    assert.equal(unchanged, true);
    assert.deepEqual((await versions()).slice(0, 1).map((v) => [v.reason, v.label]), [[reason, label]]);
    assert.ok((await versions())[0].createdAt >= asked, 'dated when it was asked for, not when the compile saved it');
    await edit(`after ${reason}`);
    await createCompileCheckpoint(p.path);
    assert.deepEqual(await holding(`saved: ${reason}`), [reason]);
  }
  // a restore's safety copy too, which the restore itself makes
  await edit('before the restore');
  await createCompileCheckpoint(p.path);
  const [, older] = await versions();
  await restoreVersion(p.path, older.id);
  await edit('after the restore');
  await createCompileCheckpoint(p.path);
  assert.deepEqual(await holding('before the restore'), ['before-restore']);
});

test('a compile’s checkpoint taking another’s place removes the stored files only that one used', async () => {
  const p = await newProject('Replaced');
  const edit = (text) => fs.writeFile(path.join(p.path, 'main.tex'), text);
  const stored = (text) => {
    const sha = crypto.createHash('sha256').update(text).digest('hex');
    return existsSync(path.join(p.path, '.spectrum', 'history', 'objects', sha.slice(0, 2), `${sha}.gz`));
  };
  await edit('saved by hand');
  await createVersion(p.path, { label: '' });
  await edit('one');
  await createCompileCheckpoint(p.path);
  await edit('two');
  await createCompileCheckpoint(p.path);
  assert.deepEqual([stored('saved by hand'), stored('one'), stored('two')], [true, false, true]);
  // back to an older checkpoint's files, as a restore 1.10.4 made leaves them, which saves nothing first when nothing
  // changed since this compile's checkpoint (to it a manual one): that one, the only copy of 'two', is kept
  await edit('saved by hand');
  await createCompileCheckpoint(p.path);
  assert.deepEqual([stored('saved by hand'), stored('two')], [true, true]);
  assert.equal((await listVersions(p.path)).length, 3);
  // one the hand-saved checkpoint still uses stays
  await fs.writeFile(path.join(p.path, 'extra.txt'), 'x');
  await createCompileCheckpoint(p.path);
  await edit('three');
  await createCompileCheckpoint(p.path);
  assert.deepEqual([stored('saved by hand'), stored('two'), stored('x')], [true, true, true]);
  assert.equal((await listVersions(p.path)).length, 3);
});

test('a compile’s checkpoint is saved even when what it replaces can’t all be tidied away', { skip: process.platform === 'win32' ? 'POSIX permissions and macOS’s locked flag' : false }, async () => {
  const p = await newProject('Untidy');
  const edit = (text) => fs.writeFile(path.join(p.path, 'main.tex'), text);
  const shard = (text) => path.join(p.path, '.spectrum', 'history', 'objects', crypto.createHash('sha256').update(text).digest('hex').slice(0, 2));
  // a stored file that can't be removed is left, used by nothing
  await edit('one');
  assert.equal((await createCompileCheckpoint(p.path)).saved, true);
  await fs.chmod(shard('one'), 0o555);
  try {
    await edit('two');
    const res = await createCompileCheckpoint(p.path);
    assert.equal(res.saved, true, res.error);
  } finally {
    await fs.chmod(shard('one'), 0o755);
  }
  const [two, ...rest] = await listVersions(p.path);
  assert.equal(rest.length, 0);
  // a manifest that can't be removed (macOS's locked flag) stays an ordinary compile checkpoint, its stored files too
  if (process.platform !== 'darwin') return;
  const manifest = path.join(p.path, '.spectrum', 'history', 'manifests', `${two.id}.json`);
  execFileSync('chflags', ['uchg', manifest]);
  try {
    await edit('three');
    assert.equal((await createCompileCheckpoint(p.path)).saved, true);
  } finally {
    execFileSync('chflags', ['nouchg', manifest]);
  }
  assert.equal((await listVersions(p.path)).length, 2);
  assert.equal((await readVersionFile(p.path, two.id, 'main.tex')).content, 'two');
});
