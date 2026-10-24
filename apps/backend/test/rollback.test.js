// Going back to 1.10.4: its server, taken from git, opens a project 2.0 wrote its settings, to-dos, notes and a compile
// checkpoint into, rewrites its project.json, and leaves the rest for 2.0 to find again. Against throwaway data and
// projects folders and a fake home folder. Skips where git doesn't have 1.10.4 (a shallow clone). Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { promises as fs, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
  SPECTRUM_TEMPLATE_SEED_DIR: ''
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

test('1.10.4 opens a project 2.0 wrote, and 2.0 finds its own data there again', { skip: !hasRelease && `git doesn’t have ${RELEASE}` }, async () => {
  // 1.10.4's backend beside this checkout's packages, which it shares
  const old = path.join(tmp, 'spectrum-1.10.4');
  mkdirSync(old);
  execFileSync('git', ['archive', '--format=tar', '-o', path.join(tmp, 'old.tar'), RELEASE, 'apps/backend/src', 'apps/backend/package.json'], { cwd: repo });
  await tar.x({ file: path.join(tmp, 'old.tar'), cwd: old });
  await fs.symlink(realpathSync(path.join(repo, 'node_modules')), path.join(old, 'node_modules'), 'junction');

  let api = await start(path.join(here, '..', 'src', 'index.js'));
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

  api = await start(path.join(old, 'apps', 'backend', 'src', 'index.js'));
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

  api = await start(path.join(here, '..', 'src', 'index.js'));
  assert.deepEqual((await api(`/api/projects/${project.id}/settings`)).json.settings, settings);
  assert.deepEqual((await api(`/api/projects/${project.id}/todos`)).json.todos, [todo]);
  assert.deepEqual((await api(`/api/projects/${project.id}/notes?doc=main.tex`)).json.notes, [note]);
  assert.deepEqual((await api(`/api/projects/${project.id}/versions`)).json.versions.map((v) => v.reason), ['compile']);
  assert.deepEqual((await api('/api/projects')).json.projects.find((p) => p.id === project.id).tags, ['thesis', 'draft']);
  await stop();
});
