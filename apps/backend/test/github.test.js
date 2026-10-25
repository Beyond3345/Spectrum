// GitHub sync end to end: two server processes as two computers, each with a data and projects folder of its own and
// a fake home folder, and a stand-in GitHub (fixtures/fake-github.mjs) for the REST calls, the device sign-in and the
// repositories over Git's smart HTTP. No real GitHub. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { GOOD_TOKEN, hasGitHttpBackend, startFakeGitHub } from './fixtures/fake-github.mjs';
import { startComputer } from './fixtures/computers.mjs';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-github-')));
const home = path.join(tmp, 'home');
mkdirSync(home);
const skip = !hasGitHttpBackend() && 'needs git http-backend';
let gh;
const computers = {};

before(async () => {
  if (skip) return;
  gh = await startFakeGitHub(path.join(tmp, 'repos'));
  computers.Mac = await startComputer('Mac', { tmp, home, gh });
  computers.Windows = await startComputer('Windows', { tmp, home, gh, env: { SPECTRUM_GITHUB_CLIENT_ID: 'test-client' } });
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
  // the base is only where GitHub still has what the record agreed on (b.tex): a.tex, changed only on GitHub, is
  // a conflicted copy rather than taken, as GitHub's copy can be older than this computer's last sync
  assert.equal(result.conflicts, 2, 'a.tex and c.tex');
  assert.equal(result.deleting, 0);
  assert.equal(read(copy, 'a.tex'), 'a base\n');
  assert.equal(read(copy, 'b.tex'), 'b changed on Windows\n');
  assert.equal(read(copy, 'c.tex'), 'c changed on Windows\n');
  assert.ok((await fs.readdir(copy)).some((f) => f.startsWith('a (GitHub’s conflicted copy')));
  assert.equal(readFileSync(path.join(win.data, 'mirror', `${project.id}.json`), 'utf8'), record, 'the record is left as it was');
});

test('Link from a 1.10.4 mirror record never takes an older copy on GitHub for this computer’s newer work', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  // the Mac last synced at v1; Windows synced v2 and a new chapter after it, which the record holds
  const v1 = { 'main.tex': 'Intro v1\n\nBody v1\n' };
  const v2 = { 'main.tex': 'Intro v2\n\nBody v2\n', 'chapters/intro.tex': 'Chapter\n' };
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Newer here' } }));
  for (const [rel, text] of Object.entries(v1)) write(project.path, rel, text);
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  const copy = path.join(win.projects, 'Newer here');
  await fs.cp(project.path, copy, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git`) && !src.endsWith('settings.json') });
  for (const [rel, text] of Object.entries(v2)) write(copy, rel, text);
  ok(await win.api('/api/projects/open-folder', { method: 'POST', body: { path: copy } }));
  const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
  const files = Object.fromEntries(Object.entries(v2).map(([rel, text]) => [rel, { rel, hash: sha(text), by: 'here' }]));
  mkdirSync(path.join(win.data, 'mirror'), { recursive: true });
  writeFileSync(path.join(win.data, 'mirror', `${project.id}.json`), JSON.stringify({ location: path.join(tmp, 'loc'), rel: 'Newer here', files }));
  const { result: preview } = ok(await win.api(`/api/projects/${project.id}/github/link`, { method: 'POST', body: { owner: 'octo', repo: 'Newer-here', preview: true } }));
  assert.deepEqual([preview.conflicts, preview.deleting], [1, 0]);
  ok(await win.api(`/api/projects/${project.id}/github/link`, { method: 'POST', body: { owner: 'octo', repo: 'Newer-here' } }));
  assert.equal(read(copy, 'main.tex'), v2['main.tex']);
  assert.equal(read(copy, 'chapters/intro.tex'), 'Chapter\n', 'not deleted');
  assert.ok(gh.files('octo', 'Newer-here').includes('chapters/intro.tex'));
  assert.equal(gh.show('octo', 'Newer-here', 'main.tex'), v2['main.tex']);
});

test('Get from GitHub leaves alone a project 1.10 mirrored on this computer, whose record would turn the clone into deletions', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Once mirrored' } }));
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  mkdirSync(path.join(win.data, 'mirror'), { recursive: true });
  writeFileSync(path.join(win.data, 'mirror', `${project.id}.json`), JSON.stringify({ location: path.join(tmp, 'loc'), rel: 'Once mirrored', files: {} }));
  const res = await win.api('/api/github/clone', { method: 'POST', body: { owner: 'octo', repo: 'Once-mirrored' } });
  assert.equal(res.status, 409);
  assert.match(res.json.error, /Spectrum 1\.10 kept “Once mirrored” in step with a cloud copy/);
  assert.ok(!existsSync(path.join(win.projects, 'Once mirrored')));
});

test('a project in a sync app’s folder isn’t made a repository', { skip }, async () => {
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
  // the GitHub tab offers build/p4-cloud's Move to this computer (/api/projects/:id/move-here)
  assert.equal(ok(await mac.api(`/api/projects/${project.id}/github`)).syncFolder, 'Synology Drive');
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

test('a copy of a linked project gets a repository of its own, and the original’s stays its own', { skip }, async () => {
  const mac = computers.Mac;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Original' } }));
  write(project.path, 'main.tex', 'the original\n');
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  const { project: copy } = ok(await mac.api(`/api/projects/${project.id}/copy`, { method: 'POST', body: { name: 'Original variant' } }));
  assert.ok(!existsSync(path.join(copy.path, '.git')), 'the repository stays with the original');
  write(copy.path, 'main.tex', 'the variant rewrites everything\n');
  ok(await mac.api(`/api/projects/${copy.id}/github/backup`, { method: 'POST' }));
  assert.equal(JSON.parse(read(copy.path, '.spectrum/settings.json')).github.repo, 'Original-variant');
  // a Finder copy, which carries the original's .git and its settings' link
  const finder = path.join(mac.projects, 'Original Finder copy');
  await fs.cp(project.path, finder, { recursive: true });
  write(finder, 'main.tex', 'the Finder copy\n');
  const opened = ok(await mac.api('/api/projects/open-folder', { method: 'POST', body: { path: finder } }));
  assert.notEqual(opened.id, project.id);
  assert.ok(ok(await mac.api(`/api/projects/${opened.id}/github`)).copyOf);
  ok(await mac.api(`/api/projects/${opened.id}/github/backup`, { method: 'POST' }));
  assert.notEqual(JSON.parse(read(finder, '.spectrum/settings.json')).github.repo, 'Original');
  assert.equal(gh.show('octo', 'Original', 'main.tex'), 'the original\n');
  const { result } = ok(await mac.api(`/api/projects/${project.id}/github/sync`, { method: 'POST' }));
  assert.equal(result.state, 'current');
  assert.equal(JSON.parse(read(project.path, '.spectrum/project.json')).id, project.id);
});

test('a pull brings what a shared repository holds back here, so the next backup deletes none of it', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  gh.create('octo', 'team-paper', { collaborators: 3 });
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Team paper' } }));
  write(project.path, 'main.tex', 'team\n');
  ok(await mac.api(`/api/projects/${project.id}/github/link`, { method: 'POST', body: { owner: 'octo', repo: 'team-paper' } }));
  const { project: there } = ok(await win.api('/api/github/clone', { method: 'POST', body: { owner: 'octo', repo: 'team-paper' } }));
  write(project.path, '.spectrum/todos/t1.json', JSON.stringify({ id: 't1', text: 'Mine', done: false, createdAt: '1', updatedAt: '1' }));
  write(project.path, '.spectrum/chats/c1.json', JSON.stringify({ id: 'c1', title: 'Chat', messages: [] }));
  ok(await mac.api(`/api/projects/${project.id}/github/personal`, { method: 'PUT', body: { personal: true } }));
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  assert.ok(gh.files('octo', 'team-paper').includes('.spectrum/todos/t1.json'));
  // Windows hasn't the answer yet, so holds them back; its pull still writes them here
  ok(await win.api(`/api/projects/${there.id}/github/sync`, { method: 'POST' }));
  assert.ok(read(there.path, '.spectrum/todos/t1.json'));
  assert.ok(read(there.path, '.spectrum/chats/c1.json'));
  write(there.path, 'main.tex', 'team, from Windows\n');
  ok(await win.api(`/api/projects/${there.id}/github/backup`, { method: 'POST' }));
  for (const f of ['.spectrum/todos/t1.json', '.spectrum/chats/c1.json']) assert.ok(gh.files('octo', 'team-paper').includes(f), f);
  ok(await mac.api(`/api/projects/${project.id}/github/sync`, { method: 'POST' }));
  assert.ok(read(project.path, '.spectrum/todos/t1.json') && read(project.path, '.spectrum/chats/c1.json'));
});

test('a cancelled Link leaves the project as it was, unlinked, and Back up offers that repository rather than making one', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Cancelled' } }));
  write(project.path, 'a.tex', 'a\n');
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  // 1.10.4's copy on Windows: the same id, its settings without the link
  const copy = path.join(win.projects, 'Cancelled');
  await fs.cp(project.path, copy, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git`) && !src.endsWith('settings.json') });
  write(copy, 'a.tex', 'a, Windows\n');
  ok(await win.api('/api/projects/open-folder', { method: 'POST', body: { path: copy } }));
  ok(await win.api(`/api/projects/${project.id}/github/link`, { method: 'POST', body: { owner: 'octo', repo: 'Cancelled', preview: true } }));
  assert.equal(ok(await win.api(`/api/projects/${project.id}/github`)).linked, false, 'the preview links nothing');
  assert.equal(read(copy, '.spectrum/settings.json'), null);
  assert.equal(execFileSync('git', ['remote'], { cwd: copy }).toString().trim(), '', 'its origin as it was: none');
  const res = await win.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' });
  assert.deepEqual([res.status, res.json.code, res.json.repo], [409, 'GITHUB_LINK_FIRST', { owner: 'octo', repo: 'Cancelled' }]);
  assert.ok(![...gh.state.repos.keys()].some((k) => k.startsWith('octo/Cancelled-')), 'no second repository');
});

test('GitHub’s changes that would delete many files stop the backups with a problem shown, until Sync asks', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Many' } }));
  for (let i = 0; i < 10; i++) write(project.path, `ch${i}.tex`, `chapter ${i}\n`);
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  const { project: there } = ok(await win.api('/api/github/clone', { method: 'POST', body: { owner: 'octo', repo: 'Many' } }));
  for (let i = 0; i < 8; i++) rmSync(path.join(project.path, `ch${i}.tex`));
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  write(there.path, 'ch9.tex', 'chapter 9, edited\n');
  const res = await win.api(`/api/projects/${there.id}/github/backup`, { method: 'POST' });
  assert.deepEqual([res.status, res.json.code], [409, 'GITHUB_CONFIRM']);
  assert.match(res.json.error, /would delete 8 files here, so nothing was backed up/);
  assert.equal(ok(await win.api(`/api/projects/${there.id}/github`)).problem.state, 'attention');
  assert.equal(ok(await win.api('/api/github/problems')).problems[there.id].state, 'attention');
  const opened = ok(await win.api(`/api/projects/${there.id}/github/opened`, { method: 'POST' }));
  assert.equal(opened.result.state, 'confirm', 'for the editor to ask');
  ok(await win.api(`/api/projects/${there.id}/github/sync`, { method: 'POST', body: { allowDeletions: true } }));
  assert.equal(gh.show('octo', 'Many', 'ch9.tex'), 'chapter 9, edited\n');
});

test('a repository renamed on GitHub is linked under its new name on both computers', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Paper renamed' } }));
  write(project.path, 'main.tex', 'paper\n');
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  gh.rename('octo', 'Paper-renamed', 'phd-paper');
  const { project: there } = ok(await win.api('/api/github/clone', { method: 'POST', body: { owner: 'octo', repo: 'phd-paper' } }));
  assert.equal(ok(await win.api(`/api/projects/${there.id}/github`)).linked, false, 'its settings name the old one');
  ok(await win.api(`/api/projects/${there.id}/github/link`, { method: 'POST', body: {} }));
  assert.deepEqual(JSON.parse(read(there.path, '.spectrum/settings.json')).github, { owner: 'octo', repo: 'phd-paper', projectId: project.id });
  write(there.path, 'main.tex', 'paper, Windows\n');
  ok(await win.api(`/api/projects/${there.id}/github/backup`, { method: 'POST' }));
  // the Mac, whose origin is the old name, pulls the new link and is offered Link, which takes the new name
  ok(await mac.api(`/api/projects/${project.id}/github/pull`, { method: 'POST' }));
  assert.equal(ok(await mac.api(`/api/projects/${project.id}/github`)).linked, false);
  ok(await mac.api(`/api/projects/${project.id}/github/link`, { method: 'POST', body: {} }));
  const status = ok(await mac.api(`/api/projects/${project.id}/github`));
  assert.equal(status.linked, true);
  assert.equal(status.link.repo, 'phd-paper');
  assert.equal(read(project.path, 'main.tex'), 'paper, Windows\n');
});

test('a backup’s label is a commit of its own, files left out are reported, and the status checks GitHub', { skip }, async () => {
  const mac = computers.Mac;
  const win = computers.Windows;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Labelled' } }));
  write(project.path, 'main.tex', 'x\n');
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST', body: { label: 'Sent to my supervisor' } }));
  assert.equal(gh.log('octo', 'Labelled'), 'Sent to my supervisor');
  // a Keynote deck goes up; a PEM key and a .env stay here, and the tab and the card say so after an idle backup
  write(project.path, 'talk.key', 'PK\u0003\u0004 Keynote');
  write(project.path, 'server.key', '-----BEGIN PRIVATE KEY-----\nabc\n');
  write(project.path, '.env', 'TOKEN=1');
  ok(await mac.api(`/api/projects/${project.id}/file`, { method: 'PUT', body: { path: 'main.tex', content: 'x, edited\n' } }));
  for (let i = 0; i < 50 && !gh.files('octo', 'Labelled').includes('talk.key'); i++) await new Promise((r) => setTimeout(r, 200));
  assert.ok(gh.files('octo', 'Labelled').includes('talk.key'));
  assert.ok(!gh.files('octo', 'Labelled').includes('server.key'));
  const status = ok(await mac.api(`/api/projects/${project.id}/github`));
  assert.deepEqual(status.left.map((l) => l.split('”')[0].slice(1)).sort(), ['.env', 'server.key']);
  assert.equal(ok(await mac.api('/api/github/problems')).problems[project.id].state, 'left');
  // the other computer's push shows as commits to pull without a pull here
  const { project: there } = ok(await win.api('/api/github/clone', { method: 'POST', body: { owner: 'octo', repo: 'Labelled' } }));
  write(there.path, 'other.tex', 'from Windows\n');
  ok(await win.api(`/api/projects/${there.id}/github/backup`, { method: 'POST' }));
  assert.equal(ok(await mac.api(`/api/projects/${project.id}/github`)).behind, 1);
});

test('GitHub having trouble, or a request that times out, waits for the connection rather than asking for attention', { skip, timeout: 60_000 }, async () => {
  const mac = computers.Mac;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Trouble' } }));
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  write(project.path, 'a.tex', 'a');
  gh.state.gitError = 502;
  let res = await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' });
  assert.equal(res.status, 503);
  assert.equal(ok(await mac.api('/api/github/problems')).problems[project.id].state, 'waiting');
  gh.state.gitError = 0;
  gh.state.hang = true;
  try {
    res = await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' });
  } finally {
    gh.state.hang = false;
  }
  assert.equal(res.status, 503, res.json?.error);
  assert.equal(ok(await mac.api('/api/github/problems')).problems[project.id].state, 'waiting');
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
});

test('a default projects folder in OneDrive (Documents backed up there) moves to the home folder, where GitHub takes projects', { skip }, async () => {
  const docs = path.join(home, 'Library', 'CloudStorage', 'OneDrive-Personal', 'Documents');
  mkdirSync(docs, { recursive: true });
  const laptop = await startComputer('Laptop', { tmp, home, gh, env: { SPECTRUM_PROJECTS_DIR: path.join(docs, 'Spectrum'), OneDrive: path.join(home, 'OneDrive') } });
  computers.Laptop = laptop;
  ok(await laptop.api('/api/github/token', { method: 'POST', body: { token: GOOD_TOKEN } }));
  const project = ok(await laptop.api('/api/projects', { method: 'POST', body: { name: 'In OneDrive' } }));
  assert.equal(path.dirname(project.path), path.join(home, 'Spectrum'));
  ok(await laptop.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
});

test('a repository of the user’s own keeps its GitHub origin, and one sending elsewhere is left alone', { skip }, async () => {
  const mac = computers.Mac;
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Own repo' } }));
  gh.create('octo', 'my-own');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project.path });
  execFileSync('git', ['remote', 'add', 'origin', `${gh.web}/octo/my-own`], { cwd: project.path });
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  assert.equal(JSON.parse(read(project.path, '.spectrum/settings.json')).github.repo, 'my-own');
  assert.ok(gh.files('octo', 'my-own').includes('.spectrum/project.json'));
  assert.ok(!gh.state.repos.has('octo/Own-repo'), 'no second repository');
  const other = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Elsewhere' } }));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: other.path });
  execFileSync('git', ['remote', 'add', 'origin', 'git@example.com:me/elsewhere.git'], { cwd: other.path });
  const res = await mac.api(`/api/projects/${other.id}/github/backup`, { method: 'POST' });
  assert.equal(res.json.code, 'GIT_REFUSED');
  assert.equal(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: other.path }).toString().trim(), 'git@example.com:me/elsewhere.git', 'its origin is left as it was');
  assert.ok(!gh.state.repos.has('octo/Elsewhere'));
});
