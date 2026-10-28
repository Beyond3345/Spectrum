// The sync apps' folders (Synology Drive, OneDrive, Dropbox…), which projects no longer sync through but some still
// live in: finding them, where a project is in one, Move to this computer, and this computer's id and name. Against a
// fake home folder, never the real sync folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { PassThrough } from 'node:stream';

const WINDOWS = process.platform === 'win32';
// native: Windows' temp folder can have an 8.3 name in it (RUNNER~1), which the app's realpath spells out
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-sync-')));
const home = path.join(tmp, 'home');
// a classic Synology Drive task, OneDrive where each system keeps it, and Dropbox where its info.json says
const drive = path.join(home, 'SynologyDrive');
const onedrive = WINDOWS ? path.join(home, 'OneDrive') : path.join(home, 'Library', 'CloudStorage', 'OneDrive-Personal');
const dropbox = path.join(home, 'Dropbox');
const dropboxInfo = WINDOWS ? path.join(home, 'AppData', 'Roaming', 'Dropbox', 'info.json') : path.join(home, '.dropbox', 'info.json');
mkdirSync(path.join(drive, '.SynologyWorkingDirectory'), { recursive: true });
mkdirSync(onedrive, { recursive: true });
mkdirSync(dropbox);
mkdirSync(path.dirname(dropboxInfo), { recursive: true });
writeFileSync(dropboxInfo, JSON.stringify({ personal: { path: dropbox } }));
// 1.10's settings for this computer, with a cloud location
const machineId = crypto.randomUUID();
// and a NAS share 1.10 synced through, which no sync app's folder holds
const nas = path.join(tmp, 'Volumes', 'NAS');
mkdirSync(nas, { recursive: true });
const legacy = JSON.stringify({ machineId, machineName: 'MacBook', folders: [{ path: drive }, { path: nas }], hidden: [] });
mkdirSync(path.join(tmp, 'data'));
writeFileSync(path.join(tmp, 'data', 'sync.json'), legacy);
// before the app's modules load
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  OneDrive: onedrive,
  APPDATA: path.join(home, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects')
});
delete process.env.OneDriveCommercial;
delete process.env.OneDriveConsumer;
const { registerProjectRoutes } = await import('../src/routes/projects.js');
const { registerSyncRoutes } = await import('../src/routes/sync.js');
const { registerSystemRoutes } = await import('../src/routes/system.js');
const { registerChatRoutes } = await import('../src/routes/chats.js');
const { registerTodoRoutes } = await import('../src/routes/todos.js');
const { registerNoteRoutes } = await import('../src/routes/notes.js');
const { detectSyncRoots, isConflictCopy, offlineMessage } = await import('../src/services/syncService.js');
const { default: Fastify } = await import('fastify');
const { default: multipart } = await import('@fastify/multipart');

const app = Fastify();
await app.register(multipart, { preservePath: true });
registerProjectRoutes(app);
registerSyncRoutes(app);
registerSystemRoutes(app);
registerChatRoutes(app);
registerTodoRoutes(app);
registerNoteRoutes(app);
await app.ready();
after(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

async function api(url, { method = 'GET', body } = {}) {
  const res = await app.inject({ method, url, payload: body });
  return { status: res.statusCode, json: res.json() };
}
const listed = async (id) => (await api('/api/projects')).json.projects.find((p) => p.id === id);
const openFolder = (dir) => api('/api/projects/open-folder', { method: 'POST', body: { path: dir } }).then((r) => r.json);

/** Every file under dir with its bytes, to show nothing there changed. */
async function snapshot(dir) {
  const out = {};
  for (const rel of (await fs.readdir(dir, { recursive: true })).sort()) out[rel] = (await fs.lstat(path.join(dir, rel))).isFile() ? readFileSync(path.join(dir, rel), 'base64') : 'dir';
  return out;
}

/** A project made on another computer, as the sync app brings it: only its own files. */
function project(dir, id = crypto.randomUUID()) {
  mkdirSync(path.join(dir, '.spectrum'), { recursive: true });
  writeFileSync(path.join(dir, '.spectrum', 'project.json'), JSON.stringify({ id, name: path.basename(dir), tags: ['synced'] }));
  writeFileSync(path.join(dir, 'main.tex'), '\\documentclass{article}\\begin{document}x\\end{document}');
  return id;
}

test('this computer keeps its id and name from 1.10, whose sync.json stays as it was', async () => {
  assert.deepEqual((await api('/api/sync')).json, { machineName: 'MacBook' });
  assert.deepEqual((await api('/api/sync', { method: 'PATCH', body: { machineName: '  Study Mac  ' } })).json, { machineName: 'Study Mac' });
  assert.deepEqual(JSON.parse(readFileSync(path.join(tmp, 'data', 'computer.json'), 'utf8')), { machineId, machineName: 'Study Mac' });
  assert.equal(readFileSync(path.join(tmp, 'data', 'sync.json'), 'utf8'), legacy);
  assert.equal((await api('/api/sync', { method: 'PATCH', body: {} })).status, 400);
});

test('finds the sync apps’ folders, and a classic Synology Drive task when another entry in the home folder can’t be looked at', async () => {
  assert.deepEqual((await detectSyncRoots()).map((r) => [r.provider, r.path]).sort(), [['dropbox', dropbox], ['onedrive', onedrive], ['synology', drive]]);
  // Windows' legacy Application Data junction, which denies the open lstat needs
  const junction = path.join(home, 'Application Data');
  mkdirSync(path.join(home, 'AppData', 'Roaming'), { recursive: true });
  symlinkSync(path.join(home, 'AppData', 'Roaming'), junction, 'junction');
  const { lstat } = fs;
  fs.lstat = (p, ...rest) => (p === junction ? Promise.reject(Object.assign(new Error(`EPERM: operation not permitted, lstat '${p}'`), { code: 'EPERM' })) : lstat(p, ...rest));
  try {
    assert.ok((await detectSyncRoots()).some((r) => r.provider === 'synology' && r.path === drive));
  } finally {
    fs.lstat = lstat;
    rmSync(junction);
  }
});

test('never opens a sync app’s folder as a project, nor one in it holding projects', async () => {
  for (const folder of [drive, onedrive, dropbox]) {
    const res = await api('/api/projects/open-folder', { method: 'POST', body: { path: folder } });
    assert.equal(res.status, 400, folder);
    assert.ok(!existsSync(path.join(folder, '.spectrum')), folder);
  }
  project(path.join(drive, 'Group', 'Inner'));
  const group = await api('/api/projects/open-folder', { method: 'POST', body: { path: path.join(drive, 'Group') } });
  assert.deepEqual([group.status, group.json.message], [409, 'That folder holds other projects. Open one of them instead.']);
  rmSync(path.join(drive, 'Group'), { recursive: true });
});

test('a project in a sync app’s folder opens where it is, and nothing in the list looks for one', async () => {
  const thesis = project(path.join(drive, 'Moved', 'Thesis'));
  assert.equal((await openFolder(path.join(drive, 'Moved', 'Thesis'))).path, path.join(drive, 'Moved', 'Thesis'));
  const entry = await listed(thesis);
  assert.deepEqual([entry.missing, entry.place, entry.cloud], [false, undefined, undefined]);
  rmSync(path.join(drive, 'Moved'), { recursive: true });
  assert.equal((await listed(thesis)).missing, true);
});

test('iCloud’s Desktop & Documents counts as iCloud Drive', { skip: process.platform !== 'darwin' && 'macOS only' }, async () => {
  const icloud = path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  mkdirSync(icloud, { recursive: true });
  mkdirSync(path.join(home, 'Documents'));
  symlinkSync(path.join(home, 'Documents'), path.join(icloud, 'Documents'));
  // Settings won't take a folder there for new projects
  assert.deepEqual((await api('/api/sync/place', { method: 'POST', body: { path: path.join(home, 'Documents', 'Uni') } })).json.place, { provider: 'icloud', label: 'iCloud Drive', rel: 'Documents/Uni' });
});

test('Settings learns whether a folder for new projects is in a sync app’s folder', async () => {
  assert.deepEqual((await api('/api/sync/place', { method: 'POST', body: { path: path.join(dropbox, 'Spectrum') } })).json, { place: { provider: 'dropbox', label: 'Dropbox', rel: 'Spectrum' } });
  assert.deepEqual((await api('/api/sync/place', { method: 'POST', body: { path: path.join(tmp, 'projects') } })).json, { place: null });
  assert.equal((await api('/api/sync/place', { method: 'POST', body: { path: 'relative' } })).status, 400);
});

test('Move to this computer copies a project out of its sync app’s folder and leaves that folder as it is', async () => {
  const dir = path.join(drive, 'Spectrum', 'Grant');
  const id = project(dir);
  writeFileSync(path.join(dir, 'refs.bib'), '@book{k, title={T}}\n');
  // 1.10's presence file, which stays out of the copy
  mkdirSync(path.join(dir, '.spectrum', 'open'));
  writeFileSync(path.join(dir, '.spectrum', 'open', `${machineId}.json`), '{}');
  await openFolder(dir);

  // not into a folder that is in a sync app's folder too
  const into = await api(`/api/projects/${id}/move-here`, { method: 'POST', body: { parentDir: path.join(dropbox, 'Projects') } });
  assert.deepEqual([into.status, into.json.message], [409, 'The folder new projects go in is in Dropbox too. Choose another one in Settings › Projects first.']);
  assert.ok(!existsSync(path.join(dropbox, 'Projects', 'Grant')));

  const { json } = await api(`/api/projects/${id}/move-here`, { method: 'POST', body: {} });
  const target = path.join(tmp, 'projects', 'Grant');
  assert.equal(json.project.path, target);
  assert.equal(json.project.place, undefined);
  assert.deepEqual(json.left, { label: 'Synology Drive', path: dir });
  assert.equal(readFileSync(path.join(target, 'refs.bib'), 'utf8'), '@book{k, title={T}}\n');
  assert.ok(!existsSync(path.join(target, '.spectrum', 'open')));
  assert.ok(existsSync(path.join(dir, 'refs.bib')) && existsSync(path.join(dir, '.spectrum', 'open')), 'the folder there is left alone');
  const entry = JSON.parse(readFileSync(path.join(tmp, 'data', 'registry.json'), 'utf8')).projects.find((p) => p.id === id);
  assert.deepEqual([entry.path, entry.inPlace], [target, false]);

  // on this computer now: nothing to move
  assert.equal((await api(`/api/projects/${id}/move-here`, { method: 'POST', body: {} })).status, 400);
});

test('while a project is being moved, its folder isn’t handed to a save, and every other project carries on', async () => {
  const { whileMoving } = await import('../src/services/projectService.js');
  const dir = path.join(drive, 'Spectrum', 'Busy');
  const id = project(dir);
  await openFolder(dir);
  const other = project(path.join(tmp, 'projects', 'Elsewhere'));
  await openFolder(path.join(tmp, 'projects', 'Elsewhere'));
  let release;
  const move = whileMoving(id, () => new Promise((resolve) => (release = resolve)));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const save = await api(`/api/projects/${id}/file`, { method: 'PUT', body: { path: 'main.tex', content: 'typed during the move' } });
  assert.deepEqual([save.status, save.json.message], [409, 'This project is being moved to this computer. Try again once that’s finished.']);
  assert.notEqual(readFileSync(path.join(dir, 'main.tex'), 'utf8'), 'typed during the move');
  assert.equal((await api(`/api/projects/${id}/move-here`, { method: 'POST', body: {} })).status, 409, 'one move at a time');
  assert.equal((await api(`/api/projects/${other}/file`, { method: 'PUT', body: { path: 'main.tex', content: 'other' } })).status, 200, 'no wait for another project');
  release();
  await move;
  assert.equal((await api(`/api/projects/${id}/file`, { method: 'PUT', body: { path: 'main.tex', content: 'after' } })).status, 200);
});

test('an upload that began before a move isn’t left in the folder the move leaves behind', async () => {
  const { whileMoving } = await import('../src/services/projectService.js');
  const dir = path.join(drive, 'Spectrum', 'Uploading');
  const id = project(dir);
  await openFolder(dir);
  // the upload has the folder and is streaming when the move starts
  const body = new PassThrough();
  const upload = app.inject({ method: 'POST', url: `/api/projects/${id}/upload`, headers: { 'content-type': 'multipart/form-data; boundary=b' }, payload: body });
  body.write('--b\r\nContent-Disposition: form-data; name="files"; filename="figure.png"\r\nContent-Type: image/png\r\n\r\npart');
  await new Promise((resolve) => setTimeout(resolve, 50));
  let release;
  const move = whileMoving(id, () => new Promise((resolve) => (release = resolve)));
  await new Promise((resolve) => setTimeout(resolve, 20));
  body.end(' and the rest\r\n--b--\r\n');
  const res = await upload;
  assert.equal(res.statusCode, 409, res.body);
  assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith('figure.png')), []);
  release();
  await move;
});

test('Move to this computer waits for a save already under way, which the copy then holds', async () => {
  const dir = path.join(drive, 'Spectrum', 'Racing');
  const id = project(dir);
  await openFolder(dir);
  const file = path.join(dir, 'main.tex');
  const before = readFileSync(file, 'utf8');
  // the save holds the folder Move is about to copy, paused just after it checked the file
  const { readFile } = fs;
  let paused;
  let release;
  const reached = new Promise((resolve) => (paused = resolve));
  const gate = new Promise((resolve) => (release = resolve));
  fs.readFile = async function (p, ...rest) {
    if (p === file && paused) {
      paused();
      paused = null;
      await gate;
    }
    return readFile.call(this, p, ...rest);
  };
  try {
    const save = api(`/api/projects/${id}/file`, { method: 'PUT', body: { path: 'main.tex', content: 'saved during the move', base: crypto.createHash('sha256').update(before).digest('hex') } });
    await reached;
    const move = api(`/api/projects/${id}/move-here`, { method: 'POST', body: {} });
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    const [saved, moved] = await Promise.all([save, move]);
    assert.equal(saved.status, 200, saved.json.message);
    assert.equal(moved.status, 200, moved.json.message);
    assert.equal(readFileSync(path.join(moved.json.project.path, 'main.tex'), 'utf8'), 'saved during the move');
  } finally {
    release();
    fs.readFile = readFile;
  }
});

test('a chat, to-do, note or setting that looked the folder up before a Move lands in the moved project or is refused', async () => {
  const { mutateProjectFiles } = await import('../src/services/projectService.js');
  const dir = path.join(drive, 'Spectrum', 'Chatty');
  const id = project(dir);
  await openFolder(dir);
  const before = await snapshot(dir);
  const at = '2026-10-29T00:00:00.000Z';
  const saves = [
    [`/api/projects/${id}/chats/c1`, 'PUT', { chat: { id: 'c1', title: 'Late', messages: [] } }],
    [`/api/projects/${id}/todos/t1`, 'PUT', { id: 't1', text: 'Late', done: false, createdAt: at, updatedAt: at }],
    [`/api/projects/${id}/notes/n1`, 'PUT', { id: 'n1', doc: 'main.tex', page: 1, x: 1, y: 1, text: 'Late', createdAt: at, updatedAt: at }],
    [`/api/projects/${id}/settings`, 'PATCH', { compile: { engine: 'xelatex' } }]
  ];
  // each save has looked up the folder and waits for the project files' lock, which the move then waits behind
  let release;
  const held = mutateProjectFiles(() => new Promise((resolve) => (release = resolve)));
  const pending = saves.map(([url, method, body]) => api(url, { method, body }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const move = api(`/api/projects/${id}/move-here`, { method: 'POST', body: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));
  release();
  await held;
  const results = await Promise.all(pending);
  const moved = await move;
  assert.equal(moved.status, 200, moved.json.message);
  for (const { status, json } of results) assert.deepEqual([status, json.message], [409, 'This project is being moved to this computer. Try again once that’s finished.']);
  assert.deepEqual(await snapshot(dir), before, 'nothing was written in the folder left behind');
  // tried again, each lands in the moved project
  for (const [url, method, body] of saves) assert.equal((await api(url, { method, body })).status, 200);
  const target = moved.json.project.path;
  for (const rel of ['chats/c1.json', 'todos/t1.json', 'notes/n1.json', 'settings.json']) assert.ok(existsSync(path.join(target, '.spectrum', rel)), rel);
  assert.deepEqual(await snapshot(dir), before);
});

test('a project 1.10 used in place in a NAS share is named for the share, and Move to this computer takes it', async () => {
  const { migrateToV2 } = await import('../src/services/mirrorService.js');
  const dir = path.join(nas, 'Lab');
  const id = project(dir);
  await openFolder(dir);
  assert.deepEqual((await migrateToV2()).inPlace.find((p) => p.id === id), { id, name: 'Lab', label: 'NAS', path: dir });
  const { status, json } = await api(`/api/projects/${id}/move-here`, { method: 'POST', body: {} });
  assert.equal(status, 200, json.message);
  assert.equal(json.project.path, path.join(tmp, 'projects', 'Lab'));
  assert.deepEqual(json.left, { label: 'NAS', path: dir });
});

test('hides sync apps’ and the NAS’s own files from the file tree', async () => {
  const dir = path.join(drive, 'Spectrum', 'Tidy');
  const id = project(dir);
  for (const name of ['@eaDir', '#recycle', '.SynologyWorkingDirectory', '.dropbox.cache']) mkdirSync(path.join(dir, name, 'x'), { recursive: true });
  await openFolder(dir);
  const { items } = (await api(`/api/projects/${id}/tree`)).json;
  assert.deepEqual(items.map((i) => i.path), ['main.tex']);
});

test('recognises conflict copies and explains online-only files it can’t read', async () => {
  for (const name of ['Thesis_MacBook_Oct-17-1042-2026_Conflict', 'main_DESKTOP-1_Oct-7-104233-2026_Conflict_2.tex', 'Thesis (Study PC’s conflicted copy 2026-10-17)']) assert.ok(isConflictCopy(name), name);
  for (const name of ['Thesis', 'Thesis 2', 'my_notes_v2', 'ELEC2410']) assert.ok(!isConflictCopy(name), name);

  const code = WINDOWS ? 'UNKNOWN' : 'EDEADLK';
  const err = (p, c = code) => Object.assign(new Error('x'), { code: c, syscall: 'open', path: p });
  assert.match(await offlineMessage(err(path.join(drive, 'Spectrum', 'Tidy', 'main.tex'))), /^“main.tex” is online-only, and Synology Drive can’t download it right now/);
  assert.equal(await offlineMessage(err(path.join(tmp, 'elsewhere', 'main.tex'))), null);
  assert.equal(await offlineMessage(err(path.join(drive, 'main.tex'), 'ENOENT')), null);
});
