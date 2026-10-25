// Going back to 1.10.4: its server, taken from git, opens a project 2.0 wrote its settings, to-dos, notes and a compile
// checkpoint into, rewrites its project.json, and leaves the rest for 2.0 to find again; and it resumes mirroring a
// project into its cloud copy where 2.0, which stopped mirroring, left off. Against throwaway data and projects folders
// and a fake home folder with a sync app's folder of its own. Skips where git doesn't have 1.10.4 (a shallow clone).
// Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { promises as fs, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';

const RELEASE = '42ff62f'; // 1.10.4
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const hasRelease = (() => {
  try {
    execFileSync('git', ['cat-file', '-e', `${RELEASE}^{commit}`], { cwd: repo, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-rollback-')));
const home = path.join(tmp, 'home');
// a classic Synology Drive task, which 1.10.4 mirrors projects into
const drive = path.join(home, 'SynologyDrive');
mkdirSync(path.join(drive, '.SynologyWorkingDirectory'), { recursive: true });
mkdirSync(path.join(tmp, 'templates', 'plain'), { recursive: true });
writeFileSync(path.join(tmp, 'templates', 'plain', 'main.tex'), '\\documentclass{article}\\begin{document}\\end{document}');
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  APPDATA: path.join(home, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  SPECTRUM_HOST: '127.0.0.1',
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_TEST_BIN_DIR: path.join(tmp, 'Bin')
};
let server;

after(() => {
  server?.kill();
  rmSync(tmp, { recursive: true, force: true });
});

/** Start the server at entry; resolves an api(url, method, body) for it. */
async function start(entry) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  server = spawn(process.execPath, [entry], { env: { ...env, PORT: String(port) }, stdio: 'ignore' });
  const api = async (url, method = 'GET', body) => {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  for (let i = 0; i < 100; i += 1) {
    if (await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.ok, () => false)) return api;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${entry} did not start`);
}

async function stop() {
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await exited;
  server = null;
}

const current = path.join(here, '..', 'src', 'index.js');
const old = path.join(tmp, 'spectrum-1.10.4');
/** 1.10.4's backend beside this checkout's packages, which it shares: its index.js. */
async function release() {
  if (!existsSync(old)) {
    mkdirSync(old);
    execFileSync('git', ['archive', '--format=tar', '-o', path.join(tmp, 'old.tar'), RELEASE, 'apps/backend/src', 'apps/backend/package.json'], { cwd: repo });
    await tar.x({ file: path.join(tmp, 'old.tar'), cwd: old });
    await fs.symlink(realpathSync(path.join(repo, 'node_modules')), path.join(old, 'node_modules'), 'junction');
  }
  return path.join(old, 'apps', 'backend', 'src', 'index.js');
}

test('1.10.4 opens a project 2.0 wrote, and 2.0 finds its own data there again', { skip: !hasRelease && `git doesn’t have ${RELEASE}` }, async () => {
  const oldEntry = await release();
  let api = await start(current);
  const { json: project } = await api('/api/projects', 'POST', { name: 'Round trip' });
  assert.ok(project.id);
  assert.ok((await api(`/api/projects/${project.id}/file`, 'PUT', { path: 'main.tex', content: '\\documentclass{article}\\begin{document}Hi\\end{document}\n' })).json.ok);
  assert.ok((await api(`/api/projects/${project.id}/tags`, 'PATCH', { tags: ['thesis'] })).json.ok);
  const { settings } = (await api(`/api/projects/${project.id}/settings`, 'PATCH', { compile: { engine: 'xelatex', autoCompile: 2 } })).json;
  const { todo } = (await api(`/api/projects/${project.id}/todos/t1`, 'PUT', { id: 't1', text: 'Cite Knuth', done: false, createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', link: { file: 'main.tex', line: 1 } })).json;
  const { note } = (await api(`/api/projects/${project.id}/notes/n1`, 'PUT', { id: 'n1', doc: 'main.tex', page: 1, x: 0.1, y: 0.2, text: 'Tighten', createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z' })).json;
  assert.equal((await api(`/api/projects/${project.id}/versions`, 'POST', { reason: 'compile' })).json.version.reason, 'compile');
  const app = path.join(project.path, '.spectrum');
  const files = ['settings.json', path.join('todos', 't1.json'), path.join('notes', 'n1.json')];
  const before = await Promise.all(files.map((f) => fs.readFile(path.join(app, f), 'utf8')));
  await stop();

  api = await start(oldEntry);
  const listed = (await api('/api/projects')).json.projects.find((p) => p.id === project.id);
  assert.equal(listed.name, 'Round trip');
  assert.equal(listed.missing, false);
  assert.deepEqual(listed.tags, ['thesis']);
  assert.ok((await api(`/api/projects/${project.id}/tree`)).json.items.some((i) => i.path === 'main.tex'));
  // a compile checkpoint is a version to it
  assert.deepEqual((await api(`/api/projects/${project.id}/versions`)).json.versions.map((v) => v.reason), ['manual']);
  // it rewrites project.json through its own list of keys
  assert.ok((await api(`/api/projects/${project.id}/tags`, 'PATCH', { tags: ['thesis', 'draft'] })).json.ok);
  await stop();

  assert.deepEqual(await Promise.all(files.map((f) => fs.readFile(path.join(app, f), 'utf8'))), before);
  const meta = JSON.parse(await fs.readFile(path.join(app, 'project.json'), 'utf8'));
  assert.deepEqual([meta.id, meta.name, meta.tags], [project.id, 'Round trip', ['thesis', 'draft']]);

  api = await start(current);
  assert.deepEqual((await api(`/api/projects/${project.id}/settings`)).json.settings, settings);
  assert.deepEqual((await api(`/api/projects/${project.id}/todos`)).json.todos, [todo]);
  assert.deepEqual((await api(`/api/projects/${project.id}/notes?doc=main.tex`)).json.notes, [note]);
  assert.deepEqual((await api(`/api/projects/${project.id}/versions`)).json.versions.map((v) => v.reason), ['compile']);
  assert.deepEqual((await api('/api/projects')).json.projects.find((p) => p.id === project.id).tags, ['thesis', 'draft']);
  await stop();
});

/** Every file under dir with its bytes and time, to show nothing there changed. */
async function snapshot(dir) {
  const out = {};
  for (const rel of (await fs.readdir(dir, { recursive: true })).sort()) {
    const s = await fs.lstat(path.join(dir, rel));
    out[rel] = s.isFile() ? [await fs.readFile(path.join(dir, rel), 'base64'), s.mtimeMs] : 'dir';
  }
  return out;
}

test('going back to 1.10.4 resumes mirroring where 2.0 stopped it, with both computers’ edits', { skip: !hasRelease && `git doesn’t have ${RELEASE}` }, async () => {
  const oldEntry = await release();
  const loc = path.join(drive, 'Spectrum');
  mkdirSync(loc);
  const text = (...lines) => `${lines.join('\n\n')}\n`;
  const data = env.SPECTRUM_DATA_DIR;

  // on 1.10.4: a project mirrored into the cloud location, one used in place there
  let api = await start(oldEntry);
  assert.equal((await api('/api/sync', 'PATCH', { folders: [loc] })).status, 200);
  const { json: mirrored } = await api('/api/projects', 'POST', { name: 'Mirrored' });
  await api(`/api/projects/${mirrored.id}/file`, 'PUT', { path: 'main.tex', content: text('One.', 'Two.', 'Three.') });
  await api(`/api/projects/${mirrored.id}/file`, 'PUT', { path: 'refs.bib', content: '@book{a}\n' });
  assert.equal((await api(`/api/projects/${mirrored.id}/cloud`, 'POST', { location: loc, mode: 'mirror' })).json.project.cloud.status.state, 'synced');
  const { json: used } = await api('/api/projects', 'POST', { name: 'In place' });
  assert.equal((await api(`/api/projects/${used.id}/cloud`, 'POST', { location: loc, mode: 'move' })).json.project.cloud.mode, 'move');
  await stop();
  const copy = path.join(loc, 'Mirrored');
  const records = async () => ({ mirror: await snapshot(path.join(data, 'mirror')), sync: readFileSync(path.join(data, 'sync.json'), 'utf8') });
  const before = { ...(await records()), loc: await snapshot(loc) };

  // on 2.0: listed as they are, with the notice, and edited here; nothing goes to the cloud copy
  api = await start(current);
  const { notice } = (await api('/api/migration')).json;
  assert.deepEqual(notice.mirrored.map((m) => [m.name, m.changed, m.deleted]), [['Mirrored', [], []]]);
  assert.deepEqual(notice.inPlace.map((p) => [p.name, p.label]), [['In place', 'Synology Drive']]);
  const listed = (await api('/api/projects')).json.projects.filter((p) => [mirrored.id, used.id].includes(p.id));
  assert.deepEqual(listed.map((p) => [p.name, p.missing, p.cloud]).sort(), [['In place', false, undefined], ['Mirrored', false, undefined]]);
  assert.equal(listed.find((p) => p.id === used.id).path, path.join(loc, 'In place'));
  await api(`/api/projects/${mirrored.id}/file`, 'PUT', { path: 'main.tex', content: text('One, edited in 2.0.', 'Two.', 'Three.') });
  await api(`/api/projects/${mirrored.id}/settings`, 'PATCH', { compile: { engine: 'lualatex' } });
  await api(`/api/projects/${mirrored.id}/todos/t1`, 'PUT', { id: 't1', text: 'Cite Knuth', done: false, createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z' });
  assert.ok((await api('/api/migration/dismiss', 'POST')).json.ok);
  assert.equal((await api('/api/migration')).json.notice, null);
  await stop();
  assert.deepEqual({ ...(await records()), loc: await snapshot(loc) }, before, '2.0 wrote nothing into the records, sync.json or the location');

  // the other computer, still on 1.10.4, edits its copy meanwhile
  writeFileSync(path.join(copy, 'main.tex'), text('One.', 'Two.', 'Three, edited there.'));
  writeFileSync(path.join(copy, 'refs.bib'), '@book{a}\n@book{b}\n');

  // back on 1.10.4: its pass merges both against the base 2.0 left alone, and 2.0's own data stays here
  api = await start(oldEntry);
  let state;
  for (let i = 0; i < 150 && state !== 'synced'; i += 1) {
    state = (await api('/api/projects')).json.projects.find((p) => p.id === mirrored.id).cloud?.status?.state;
    if (state !== 'synced') await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(state, 'synced');
  const merged = text('One, edited in 2.0.', 'Two.', 'Three, edited there.');
  for (const root of [mirrored.path, copy]) {
    assert.equal(readFileSync(path.join(root, 'main.tex'), 'utf8'), merged, root);
    assert.equal(readFileSync(path.join(root, 'refs.bib'), 'utf8'), '@book{a}\n@book{b}\n', root);
  }
  for (const rel of ['settings.json', 'todos']) {
    assert.ok(existsSync(path.join(mirrored.path, '.spectrum', rel)), rel);
    assert.ok(!existsSync(path.join(copy, '.spectrum', rel)), `${rel} stays on this computer`);
  }
  assert.ok((await api(`/api/projects/${mirrored.id}/versions`)).json.versions.some((v) => v.label.startsWith('Before sync from')));
  await stop();
});
