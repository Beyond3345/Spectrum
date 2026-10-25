// GitHub sync end to end: two server processes as two computers, each with a data and projects folder of its own and
// a fake home folder, and a stand-in GitHub (fixtures/fake-github.mjs) for the REST calls, the device sign-in and the
// repositories over Git's smart HTTP. No real GitHub. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GOOD_TOKEN, hasGitHttpBackend, startFakeGitHub } from './fixtures/fake-github.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-github-')));
const home = path.join(tmp, 'home');
mkdirSync(home);
const skip = !hasGitHttpBackend() && 'needs git http-backend';
let gh;
const computers = {};

/** A computer: its own server process, data folder (with its name in sync.json) and projects folder. */
async function startComputer(name, env = {}) {
  const data = path.join(tmp, `data-${name}`);
  const projects = path.join(tmp, `projects-${name}`);
  mkdirSync(data, { recursive: true });
  mkdirSync(projects, { recursive: true });
  if (!existsSync(path.join(data, 'sync.json'))) writeFileSync(path.join(data, 'sync.json'), JSON.stringify({ machineId: crypto.randomUUID(), machineName: name, folders: [], hidden: [] }));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, [path.join(here, '..', 'src', 'index.js')], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      PORT: String(port),
      SPECTRUM_HOST: '127.0.0.1',
      SPECTRUM_DATA_DIR: data,
      SPECTRUM_PROJECTS_DIR: projects,
      SPECTRUM_TEMPLATE_DIR: path.join(tmp, `templates-${name}`),
      SPECTRUM_GITHUB_API: gh.api,
      SPECTRUM_GITHUB_WEB: gh.web,
      SPECTRUM_GITHUB_IDLE_MS: '1500',
      ...env
    },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    if (await fetch(`${base}/api/health`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const api = async (url, { method = 'GET', body } = {}) => {
    const res = await fetch(`${base}${url}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  computers[name] = { name, data, projects, server, api };
  return computers[name];
}

async function stopComputer(c) {
  const exited = new Promise((resolve) => c.server.once('exit', resolve));
  c.server.kill();
  await exited;
}

before(async () => {
  if (skip) return;
  gh = await startFakeGitHub(path.join(tmp, 'repos'));
  await startComputer('Mac');
  await startComputer('Windows', { SPECTRUM_GITHUB_CLIENT_ID: 'test-client' });
});
after(async () => {
  for (const c of Object.values(computers)) c.server.kill();
  await gh?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const ok = (res) => {
  assert.equal(res.status, 200, res.json?.error);
  return res.json;
};
const read = (root, rel) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : null);
const write = (root, rel, text) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};

test('a pasted token signs in, checked with GitHub, and stays in the backend', { skip }, async () => {
  const { api, data } = computers.Mac;
  assert.equal((await api('/api/github/token', { method: 'POST', body: { token: 'nope' } })).status, 400);
  assert.equal((await api('/api/github/token', { method: 'POST', body: { token: 'wrong-token-but-long-enough' } })).status, 400);
  const status = ok(await api('/api/github/token', { method: 'POST', body: { token: GOOD_TOKEN } }));
  assert.equal(status.login, 'octo');
  assert.equal(status.signedIn, true);
  assert.equal(status.deviceSignIn, false, 'no client id: paste a token only');
  assert.ok(!JSON.stringify(ok(await api('/api/github'))).includes(GOOD_TOKEN), 'never sent to the window');
  if (process.platform !== 'win32') assert.equal(statSync(path.join(data, 'github.json')).mode & 0o777, 0o600);
});

test('the device sign-in shows GitHub’s code and finishes once it’s entered', { skip }, async () => {
  const { api } = computers.Windows;
  assert.equal(ok(await api('/api/github')).deviceSignIn, true);
  gh.state.device.pending = 0;
  const flow = ok(await api('/api/github/device', { method: 'POST' }));
  assert.equal(flow.userCode, 'ABCD-1234');
  let state = 'waiting';
  // GitHub asks for at least 5 s between polls
  for (let i = 0; i < 40 && state === 'waiting'; i++) {
    await new Promise((r) => setTimeout(r, 250));
    state = ok(await api(`/api/github/device/${flow.id}`)).state;
  }
  assert.equal(state, 'done');
  assert.equal(ok(await api('/api/github')).login, 'octo');
});

let shared;
test('Back up makes a private repository, records the link in settings.json and pushes', { skip }, async () => {
  const { api } = computers.Mac;
  const project = ok(await api('/api/projects', { method: 'POST', body: { name: 'Thesis draft' } }));
  write(project.path, 'main.tex', '\\documentclass{article}\n\\begin{document}\nline 1\nline 2\nline 3\nline 4\nline 5\n\\end{document}\n');
  write(project.path, '.spectrum/todos/t1.json', JSON.stringify({ id: 't1', text: 'Fix intro', done: false, createdAt: '2026-10-01', updatedAt: '2026-10-01' }));
  write(project.path, '.spectrum/chats/c1.json', JSON.stringify({ id: 'c1', title: 'Chat', messages: [{ role: 'user', content: 'hello', createdAt: '1' }] }));
  const before = JSON.parse(read(project.path, '.spectrum/project.json'));
  ok(await api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  const repo = gh.state.repos.get('octo/Thesis-draft');
  assert.ok(repo, 'named after the project');
  assert.equal(repo.private, true);
  const settings = JSON.parse(read(project.path, '.spectrum/settings.json'));
  assert.deepEqual(settings.github, { owner: 'octo', repo: 'Thesis-draft', projectId: project.id });
  for (const f of ['main.tex', '.spectrum/project.json', '.spectrum/settings.json', '.spectrum/todos/t1.json', '.spectrum/chats/c1.json', '.gitignore']) assert.ok(gh.files('octo', 'Thesis-draft').includes(f), f);
  assert.ok(!gh.files('octo', 'Thesis-draft').some((f) => f.startsWith('.spectrum/history')));
  // 1.10.4 rewrites project.json through its own list of keys, so nothing new goes in it
  assert.deepEqual(Object.keys(JSON.parse(read(project.path, '.spectrum/project.json'))).sort(), Object.keys(before).sort());
  const status = ok(await api(`/api/projects/${project.id}/github`));
  assert.equal(status.linked, true);
  assert.equal(status.ahead, 0);
  assert.ok(status.lastBackup);
  assert.match(gh.show('octo', 'Thesis-draft', 'main.tex'), /line 3/);
  shared = project;
});

let other;
test('the GitHub view lists the repository on the other computer, and Get from GitHub keeps the project’s id', { skip }, async () => {
  const { api, projects } = computers.Windows;
  const { repos } = ok(await api('/api/github/repos'));
  const entry = repos.find((r) => r.repo === 'Thesis-draft');
  assert.ok(entry);
  assert.equal(entry.id, shared.id);
  assert.equal(entry.name, 'Thesis draft');
  assert.equal(entry.local, null);
  const { project } = ok(await api('/api/github/clone', { method: 'POST', body: { owner: 'octo', repo: 'Thesis-draft' } }));
  assert.equal(project.id, shared.id);
  assert.ok(project.path.startsWith(projects));
  assert.equal(read(project.path, '.spectrum/todos/t1.json') !== null, true);
  assert.equal(ok(await api(`/api/projects/${project.id}/github`)).linked, true);
  assert.equal((await api('/api/github/clone', { method: 'POST', body: { owner: 'octo', repo: 'Thesis-draft' } })).status, 409, 'not twice');
  const listed = ok(await api('/api/github/repos')).repos.find((r) => r.repo === 'Thesis-draft');
  assert.equal(listed.local, shared.id);
  assert.equal(listed.linked, true);
  other = project;
});

test('Sync merges edits from both computers: text by lines, chats by message, to-dos by field', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  const tex = read(shared.path, 'main.tex');
  write(shared.path, 'main.tex', tex.replace('line 1', 'line one'));
  write(shared.path, '.spectrum/todos/t1.json', JSON.stringify({ id: 't1', text: 'Fix intro', done: true, createdAt: '2026-10-01', updatedAt: '2026-10-02' }));
  write(shared.path, '.spectrum/chats/c1.json', JSON.stringify({ id: 'c1', title: 'Chat', messages: [{ role: 'user', content: 'hello', createdAt: '1' }, { role: 'user', content: 'from the Mac', createdAt: '2' }] }));
  ok(await mac.api(`/api/projects/${shared.id}/github/sync`, { method: 'POST' }));
  write(other.path, 'main.tex', tex.replace('line 5', 'line five'));
  write(other.path, '.spectrum/todos/t1.json', JSON.stringify({ id: 't1', text: 'Fix the intro', done: false, createdAt: '2026-10-01', updatedAt: '2026-10-01' }));
  write(other.path, '.spectrum/chats/c1.json', JSON.stringify({ id: 'c1', title: 'Chat', messages: [{ role: 'user', content: 'hello', createdAt: '1' }, { role: 'user', content: 'from Windows', createdAt: '3' }] }));
  const { result } = ok(await win.api(`/api/projects/${other.id}/github/sync`, { method: 'POST' }));
  assert.equal(result.state, 'merged');
  assert.equal(result.changedApp, true, 'the panels reload');
  assert.equal(read(other.path, 'main.tex'), tex.replace('line 1', 'line one').replace('line 5', 'line five'));
  assert.equal(JSON.parse(read(other.path, '.spectrum/todos/t1.json')).text, 'Fix the intro');
  assert.equal(JSON.parse(read(other.path, '.spectrum/todos/t1.json')).done, true);
  assert.deepEqual(JSON.parse(read(other.path, '.spectrum/chats/c1.json')).messages.map((m) => m.content), ['hello', 'from the Mac', 'from Windows']);
  // the Mac takes it in on its next Sync, and a checkpoint was kept first
  ok(await mac.api(`/api/projects/${shared.id}/github/sync`, { method: 'POST' }));
  assert.equal(read(shared.path, 'main.tex'), read(other.path, 'main.tex'));
  const { versions } = ok(await mac.api(`/api/projects/${shared.id}/versions`));
  assert.ok(versions.some((v) => v.label === 'Before pull from GitHub'));
  assert.equal(ok(await mac.api(`/api/projects/${shared.id}/github`)).behind, 0);
});

test('a save is backed up once editing stops, leaving chats for Sync; leaving the project commits them', { skip }, async () => {
  const mac = computers.Mac;
  ok(await mac.api(`/api/projects/${shared.id}/chats/c2`, { method: 'PUT', body: { chat: { id: 'c2', title: 'New', messages: [] } } }));
  ok(await mac.api(`/api/projects/${shared.id}/file`, { method: 'PUT', body: { path: 'intro.tex', content: 'Intro' } }));
  // the test computers wait 1.5 s rather than a minute
  for (let i = 0; i < 50 && !gh.files('octo', 'Thesis-draft').includes('intro.tex'); i++) await new Promise((r) => setTimeout(r, 200));
  assert.ok(gh.files('octo', 'Thesis-draft').includes('intro.tex'), 'backed up');
  assert.ok(!gh.files('octo', 'Thesis-draft').includes('.spectrum/chats/c2.json'), 'the chat waits');
  ok(await mac.api(`/api/projects/${shared.id}/github/left`, { method: 'POST' }));
  assert.ok(gh.files('octo', 'Thesis-draft').includes('.spectrum/chats/c2.json'));
});

test('a shared repository asks before chats, to-dos, notes and research go in, and leaves them out until then', { skip }, async () => {
  const mac = computers.Mac;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Group paper' } }));
  gh.create('octo', 'group-paper', { private: true, collaborators: 3 });
  ok(await mac.api(`/api/projects/${project.id}/github/link`, { method: 'POST', body: { owner: 'octo', repo: 'group-paper' } }));
  write(project.path, '.spectrum/todos/t9.json', JSON.stringify({ id: 't9', text: 'Mine', done: false, createdAt: '1', updatedAt: '1' }));
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  assert.equal(ok(await mac.api(`/api/projects/${project.id}/github`)).askPersonal, true);
  assert.ok(!gh.files('octo', 'group-paper').includes('.spectrum/todos/t9.json'));
  assert.ok(gh.files('octo', 'group-paper').includes('.spectrum/settings.json'));
  ok(await mac.api(`/api/projects/${project.id}/github/personal`, { method: 'PUT', body: { personal: true } }));
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  assert.ok(gh.files('octo', 'group-paper').includes('.spectrum/todos/t9.json'));
  assert.equal(ok(await mac.api(`/api/projects/${project.id}/github`)).askPersonal, false);
});

test('Link on the other computer’s own copy of a project merges from nothing in common, after a preview', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Grant' } }));
  write(project.path, 'aims.tex', 'Aim 1\n');
  write(project.path, 'same.tex', 'Same on both\n');
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  // the copy Windows already had (a mirror's, say), with its own edits
  const copy = path.join(win.projects, 'Grant');
  await fs.cp(project.path, copy, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git`) && !src.endsWith('settings.json') });
  write(copy, 'aims.tex', 'Aim 1, changed on Windows\n');
  write(copy, 'budget.tex', 'Only on Windows\n');
  const opened = ok(await win.api('/api/projects/open-folder', { method: 'POST', body: { path: copy } }));
  assert.equal(opened.id, project.id);
  const listed = ok(await win.api('/api/github/repos')).repos.find((r) => r.repo === 'Grant');
  assert.equal(listed.local, project.id);
  assert.equal(listed.linked, false);
  const { result: preview } = ok(await win.api(`/api/projects/${project.id}/github/link`, { method: 'POST', body: { owner: 'octo', repo: 'Grant', preview: true } }));
  assert.equal(preview.state, 'preview');
  assert.equal(preview.conflicts, 1, 'aims.tex differs');
  assert.equal(read(copy, 'aims.tex'), 'Aim 1, changed on Windows\n', 'nothing written yet');
  const { result } = ok(await win.api(`/api/projects/${project.id}/github/link`, { method: 'POST', body: { owner: 'octo', repo: 'Grant' } }));
  assert.equal(result.state, 'merged');
  assert.equal(read(copy, 'aims.tex'), 'Aim 1, changed on Windows\n');
  assert.ok((await fs.readdir(copy)).some((f) => f.startsWith('aims (GitHub’s conflicted copy')));
  assert.equal(read(copy, 'budget.tex'), 'Only on Windows\n');
  assert.ok(gh.files('octo', 'Grant').includes('budget.tex'), 'pushed');
  assert.equal(gh.state.repos.size, [...gh.state.repos.keys()].length);
  assert.ok(![...gh.state.repos.keys()].some((k) => k.startsWith('octo/Grant-')), 'never a second repository');
});

test('Link from a 1.10.4 mirror record’s base conflicts only on files changed on both sides', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Mirrored' } }));
  const base = { 'a.tex': 'a base\n', 'b.tex': 'b base\n', 'c.tex': 'c base\n' };
  for (const [rel, text] of Object.entries(base)) write(project.path, rel, text);
  const copy = path.join(win.projects, 'Mirrored');
  await fs.cp(project.path, copy, { recursive: true });
  write(project.path, 'a.tex', 'a changed on the Mac\n');
  write(project.path, 'c.tex', 'c changed on the Mac\n');
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  write(copy, 'b.tex', 'b changed on Windows\n');
  write(copy, 'c.tex', 'c changed on Windows\n');
  ok(await win.api('/api/projects/open-folder', { method: 'POST', body: { path: copy } }));
  // the record 1.10.4 left, with the base it agreed on (Spectrum only ever reads it)
  const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
  const files = Object.fromEntries(Object.entries(base).map(([rel, text]) => [rel, { rel, hash: sha(text), by: 'here' }]));
  mkdirSync(path.join(win.data, 'mirror', project.id, 'base'), { recursive: true });
  writeFileSync(path.join(win.data, 'mirror', `${project.id}.json`), JSON.stringify({ location: path.join(tmp, 'loc'), rel: 'Mirrored', files }));
  writeFileSync(path.join(win.data, 'mirror', project.id, 'base', `${sha(base['c.tex'])}.gz`), gzipSync(base['c.tex']));
  const record = readFileSync(path.join(win.data, 'mirror', `${project.id}.json`), 'utf8');
  const { result } = ok(await win.api(`/api/projects/${project.id}/github/link`, { method: 'POST', body: { owner: 'octo', repo: 'Mirrored' } }));
  assert.equal(result.conflicts, 1, 'c.tex only');
  assert.equal(read(copy, 'a.tex'), 'a changed on the Mac\n');
  assert.equal(read(copy, 'b.tex'), 'b changed on Windows\n');
  assert.equal(read(copy, 'c.tex'), 'c changed on Windows\n');
  assert.equal(readFileSync(path.join(win.data, 'mirror', `${project.id}.json`), 'utf8'), record, 'the record is left as it was');
});

test('a project in a sync app’s folder isn’t made a repository, and can be moved out first', { skip }, async () => {
  const mac = computers.Mac;
  const synced = path.join(home, 'SynologyDrive');
  mkdirSync(path.join(synced, '.SynologyWorkingDirectory'), { recursive: true });
  write(path.join(synced, 'Paper'), 'main.tex', '\\documentclass{article}\\begin{document}x\\end{document}');
  const project = ok(await mac.api('/api/projects/open-folder', { method: 'POST', body: { path: path.join(synced, 'Paper') } }));
  for (const action of ['init', 'backup']) {
    const res = await mac.api(`/api/projects/${project.id}/github/${action}`, { method: 'POST' });
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'IN_SYNC_FOLDER');
    assert.match(res.json.error, /Synology Drive/);
  }
  assert.ok(!existsSync(path.join(synced, 'Paper', '.git')));
  assert.equal(ok(await mac.api(`/api/projects/${project.id}/github`)).syncFolder, 'Synology Drive');
  const moved = ok(await mac.api(`/api/projects/${project.id}/move-here`, { method: 'POST' })).project;
  assert.ok(moved.path.startsWith(computers.Mac.projects));
  ok(await mac.api(`/api/projects/${project.id}/github/init`, { method: 'POST' }));
  assert.ok(existsSync(path.join(moved.path, '.git')));
});

test('GitHub’s refusals say what to do, and a network failure only waits', { skip }, async () => {
  const mac = computers.Mac;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Errors' } }));
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  write(project.path, 'x.tex', 'x');
  gh.state.repos.delete('octo/Errors');
  let res = await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' });
  assert.equal(res.json.error, 'No access to octo/Errors.');
  gh.state.repos.set('octo/Errors', { private: true, collaborators: 1 });
  gh.state.token = 'ghp_revokedrevokedrevokedrevokedrevoked00';
  res = await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' });
  assert.equal(res.json.error, 'Sign in to GitHub again.');
  const { problems } = ok(await mac.api('/api/github/problems'));
  assert.equal(problems[project.id].message, 'Sign in to GitHub again.');
  assert.ok(problems[project.id].lastBackup, 'not backed up since then');
  gh.state.token = GOOD_TOKEN;
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  assert.equal(ok(await mac.api('/api/github/problems')).problems[project.id], undefined);
  // offline: it waits quietly, and opening the project says it couldn't check
  gh.state.down = true;
  write(project.path, 'y.tex', 'y');
  res = await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' });
  assert.equal(res.status, 503);
  assert.match(res.json.error, /Couldn’t reach GitHub/);
  assert.equal(ok(await mac.api('/api/github/problems')).problems[project.id].state, 'waiting');
  assert.equal(ok(await mac.api(`/api/projects/${project.id}/github/opened`, { method: 'POST' })).message, 'Couldn’t check GitHub, so this may not be the latest.');
  gh.state.down = false;
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  assert.ok(gh.files('octo', 'Errors').includes('y.tex'));
});

test('Initialise makes a repository on main with a first commit and TeX’s .gitignore, without GitHub', { skip }, async () => {
  const mac = computers.Mac;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Local only' } }));
  const status = ok(await mac.api(`/api/projects/${project.id}/github/init`, { method: 'POST' }));
  assert.equal(status.repo, true);
  assert.equal(status.linked, false);
  assert.equal(read(project.path, '.git/HEAD').trim(), 'ref: refs/heads/main');
  assert.match(read(project.path, '.gitignore'), /\*\.aux/);
  assert.equal((await mac.api(`/api/projects/${project.id}/github/init`, { method: 'POST' })).status, 409);
});
