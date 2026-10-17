// Cloud locations (Synology Drive, OneDrive, Dropbox…): finding the sync apps' folders, finding the projects in the
// locations, where a project is, and what this computer tells the others. Against a fake home folder, never the real
// sync folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

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
const { registerCloudRoutes } = await import('../src/routes/cloud.js');
const { registerSystemRoutes } = await import('../src/routes/system.js');
const { detectSyncRoots, isConflictCopy, offlineMessage, sharedDir } = await import('../src/services/syncService.js');
const { default: Fastify } = await import('fastify');

const app = Fastify();
registerProjectRoutes(app);
registerSyncRoutes(app);
registerCloudRoutes(app);
registerSystemRoutes(app);
await app.ready();
after(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

async function api(url, { method = 'GET', body } = {}) {
  const res = await app.inject({ method, url, payload: body });
  return { status: res.statusCode, json: res.json() };
}
const list = (scan = true) => api(`/api/projects${scan ? '?scan=1' : ''}`).then((r) => r.json);
const listed = async (id) => (await list()).projects.find((p) => p.id === id);
const setFolders = (folders) => api('/api/sync', { method: 'PATCH', body: { folders } });
const syncJson = () => JSON.parse(readFileSync(path.join(tmp, 'data', 'sync.json'), 'utf8'));
const openFolder = (dir) => api('/api/projects/open-folder', { method: 'POST', body: { path: dir } }).then((r) => r.json);

/** A project made on another computer, as the sync app brings it: only its own files. */
function project(dir, id = crypto.randomUUID()) {
  mkdirSync(path.join(dir, '.spectrum'), { recursive: true });
  writeFileSync(path.join(dir, '.spectrum', 'project.json'), JSON.stringify({ id, name: path.basename(dir), tags: ['synced'] }));
  writeFileSync(path.join(dir, 'main.tex'), '\\documentclass{article}\\begin{document}x\\end{document}');
  return id;
}

const ids = {};

test('does nothing about cloud locations until one is set up', async () => {
  const other = project(path.join(drive, 'Spectrum', 'Early'));
  const res = await list();
  assert.deepEqual(res.cloudOnly, []);
  assert.ok(!res.projects.some((p) => p.id === other));
  rmSync(path.join(drive, 'Spectrum', 'Early'), { recursive: true });
});

test('suggests the sync apps’ folders, each with where it would go, and adds one', async () => {
  // a 1.8.0 computer shares settings and templates through Dropbox's own folder, so that's where this one goes too
  mkdirSync(path.join(dropbox, '.spectrum-shared'));
  const { suggestions, folders } = (await api('/api/sync')).json;
  assert.deepEqual(folders, []);
  for (const [p, provider, label, target] of [
    [drive, 'synology', 'Synology Drive', path.join(drive, 'Spectrum')],
    [onedrive, 'onedrive', 'OneDrive', path.join(onedrive, 'Spectrum')],
    [dropbox, 'dropbox', 'Dropbox', dropbox]
  ]) {
    assert.ok(suggestions.some((s) => s.path === p && s.provider === provider && s.label === label && s.target === target), `${label} at ${p}`);
  }

  for (const bad of [home, path.join(tmp, 'nope'), 'relative']) assert.equal((await setFolders([bad])).status, 400, bad);
  const added = (await setFolders([drive])).json;
  assert.deepEqual(added.folders, [{ path: drive, label: 'Synology Drive', found: true, place: { provider: 'synology', label: 'Synology Drive', rel: '' }, mirrored: 0 }]);
  assert.ok(!added.suggestions.some((s) => s.path === drive));
  assert.equal((await setFolders([drive, path.join(drive)])).status, 409);
  mkdirSync(path.join(drive, 'Spectrum'), { recursive: true });
  assert.match((await setFolders([drive, path.join(drive, 'Spectrum')])).json.message, /is inside/);
  assert.deepEqual(syncJson().folders, [{ path: drive, place: { provider: 'synology', label: 'Synology Drive', rel: '' } }]);
});

test('a classic Synology Drive task is found in the home folder when another entry there can’t be looked at', async () => {
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

test('lists the projects in a cloud location, three levels deep, for Download, without adding or writing to them', async () => {
  ids.thesis = project(path.join(drive, 'Spectrum', 'Thesis'));
  ids.deep = project(path.join(drive, 'a', 'b', 'Deep'));
  const tooDeep = project(path.join(drive, 'a', 'b', 'c', 'TooDeep'));
  const nested = project(path.join(drive, 'Spectrum', 'Thesis', 'chapters', 'Nested'));
  const hidden = project(path.join(drive, '.hidden', 'Secret'));
  const nas = project(path.join(drive, '@eaDir', 'Thumbs'));
  const conflict = project(path.join(drive, 'Spectrum', 'Thesis_MacBook_Oct-17-1042-2026_Conflict'));
  const before = readFileSync(path.join(drive, 'Spectrum', 'Thesis', '.spectrum', 'project.json'), 'utf8');

  const { projects, cloudOnly } = await list();
  assert.deepEqual(projects, []);
  const thesis = cloudOnly.find((p) => p.id === ids.thesis);
  assert.deepEqual(thesis, { id: ids.thesis, name: 'Thesis', label: 'Synology Drive', rel: 'Spectrum/Thesis', location: drive, updatedAt: thesis.updatedAt });
  assert.ok(cloudOnly.some((p) => p.id === ids.deep && p.rel === 'a/b/Deep'));
  for (const id of [tooDeep, nested, hidden, nas, conflict]) assert.ok(!cloudOnly.some((p) => p.id === id), id);

  assert.equal(readFileSync(path.join(drive, 'Spectrum', 'Thesis', '.spectrum', 'project.json'), 'utf8'), before);
  assert.deepEqual(readdirSync(path.join(drive, 'Spectrum', 'Thesis', '.spectrum')), ['project.json']);
});

test('a project downloaded in place stays where it is and follows itself when moved, and of two copies the listed one stays', async () => {
  const res = await api('/api/cloud/download', { method: 'POST', body: { location: drive, rel: 'Spectrum/Thesis', id: ids.thesis, mode: 'move' } });
  const thesis = res.json.project;
  assert.equal(thesis.path, path.join(drive, 'Spectrum', 'Thesis'));
  assert.deepEqual(thesis.tags, ['synced']);
  assert.deepEqual(thesis.place, { provider: 'synology', label: 'Synology Drive', rel: 'Spectrum/Thesis', here: true });
  assert.deepEqual(thesis.cloud, { mode: 'move', label: 'Synology Drive', rel: 'Spectrum/Thesis', location: drive });
  assert.ok(!(await list()).cloudOnly.some((p) => p.id === ids.thesis));
  // 1.7.0 rewrites the registry with only the fields it knows, so nothing else goes in it but inPlace, which the scan
  // works out again from the path when it's gone
  const registry = JSON.parse(readFileSync(path.join(tmp, 'data', 'registry.json'), 'utf8'));
  for (const entry of registry.projects) assert.deepEqual(Object.keys(entry).sort(), ['addedAt', 'archived', 'id', 'inPlace', 'name', 'path', 'tags']);

  await fs.mkdir(path.join(drive, 'Moved'));
  await fs.rename(path.join(drive, 'Spectrum', 'Thesis'), path.join(drive, 'Moved', 'Thesis'));
  assert.equal((await listed(ids.thesis)).path, path.join(drive, 'Moved', 'Thesis'));

  await fs.cp(path.join(drive, 'Moved', 'Thesis'), path.join(drive, 'Copy', 'Thesis'), { recursive: true });
  const { projects, cloudOnly } = await list();
  assert.deepEqual(projects.filter((p) => p.id === ids.thesis).map((p) => p.path), [path.join(drive, 'Moved', 'Thesis')]);
  assert.ok(!projects.some((p) => p.path === path.join(drive, 'Copy', 'Thesis')));
  assert.ok(!cloudOnly.some((p) => p.id === ids.thesis));
});

test('a project removed from the list stays out of Cloud projects until it’s opened again, whoever else lists it', async () => {
  assert.equal((await openFolder(path.join(drive, 'a', 'b', 'Deep'))).id, ids.deep);
  // another computer that has it changes nothing here
  mkdirSync(path.join(drive, '.spectrum-shared', 'machines'), { recursive: true });
  writeFileSync(path.join(drive, '.spectrum-shared', 'machines', `${crypto.randomUUID()}.json`), JSON.stringify({
    machineName: 'Laptop', updatedAt: new Date().toISOString(), projects: [{ id: ids.deep, name: 'Deep', place: null, mirror: true }]
  }));
  assert.equal((await api(`/api/projects/${ids.deep}/remove`, { method: 'POST', body: {} })).status, 200);
  const res = await list();
  assert.ok(!res.projects.some((p) => p.id === ids.deep) && !res.cloudOnly.some((p) => p.id === ids.deep));
  assert.ok(syncJson().hidden.includes(ids.deep));

  const opened = await openFolder(path.join(drive, 'a', 'b', 'Deep'));
  assert.equal(opened.id, ids.deep);
  assert.ok(!syncJson().hidden.includes(ids.deep));
  assert.ok(await listed(ids.deep));
});

test('never opens a cloud location or a sync app’s folder as a project', async () => {
  await setFolders([drive, onedrive]);
  for (const folder of [drive, onedrive, dropbox]) {
    const res = await api('/api/projects/open-folder', { method: 'POST', body: { path: folder } });
    assert.equal(res.status, 400, folder);
    assert.ok(!existsSync(path.join(folder, '.spectrum')), folder);
  }
});

test('says where a missing project is, and whether its sync app’s folder is here', async () => {
  // the copy would take over a listed project whose folder has gone
  rmSync(path.join(drive, 'Copy'), { recursive: true });
  rmSync(path.join(drive, 'Moved', 'Thesis'), { recursive: true });
  const waiting = await listed(ids.thesis);
  assert.equal(waiting.missing, true);
  assert.deepEqual(waiting.place, { provider: 'synology', label: 'Synology Drive', rel: 'Moved/Thesis', here: true });

  ids.paper = project(path.join(onedrive, 'Notes', 'Paper'));
  await openFolder(path.join(onedrive, 'Notes', 'Paper'));
  assert.deepEqual((await listed(ids.paper)).place, { provider: 'onedrive', label: 'OneDrive', rel: 'Notes/Paper', here: true });
  rmSync(onedrive, { recursive: true });
  const gone = await listed(ids.paper);
  assert.equal(gone.missing, true);
  assert.deepEqual(gone.place, { provider: 'onedrive', label: 'OneDrive', rel: 'Notes/Paper', here: false });
  assert.equal((await api('/api/sync')).json.folders.find((f) => f.path === onedrive).found, false);

  // outside the cloud locations, as before
  const plain = (await api('/api/projects', { method: 'POST', body: { name: 'Plain', parentDir: path.join(tmp, 'elsewhere') } })).json;
  rmSync(plain.path, { recursive: true });
  const missing = await listed(plain.id);
  assert.equal(missing.missing, true);
  assert.equal(missing.place, undefined);
  assert.equal(missing.cloud, undefined);
});

test('new projects go in the projects folder, never a cloud location', async () => {
  const fresh = (await api('/api/projects', { method: 'POST', body: { name: 'Fresh' } })).json;
  assert.equal(fresh.path, path.join(tmp, 'projects', 'Fresh'));
  assert.equal(fresh.cloud, undefined);
  assert.equal((await api('/api/system/check')).json.projectsDir, path.join(tmp, 'projects'));
  ids.fresh = fresh.id;
});

test('tells the other computers only about its cloud projects, and whether it keeps a copy of its own', async () => {
  const machines = path.join(drive, '.spectrum-shared', 'machines');
  const { machineId } = syncJson();
  const ownFile = path.join(machines, `${machineId}.json`);
  const before = await list();
  const own = JSON.parse(readFileSync(ownFile, 'utf8'));
  assert.equal(typeof own.machineName, 'string');
  assert.deepEqual(own.projects.find((p) => p.id === ids.deep), { id: ids.deep, name: 'Deep', place: { provider: 'synology', label: 'Synology Drive', rel: 'a/b/Deep' }, mirror: false });
  // missing here, and in place, so its cloud copy is all there was
  assert.equal(own.projects.find((p) => p.id === ids.thesis)?.mirror, false);
  assert.ok(!own.projects.some((p) => p.id === ids.fresh), 'a project on this computer only is its own');
  const written = statSync(ownFile).mtimeMs;

  // another computer's projects never show here as theirs: only the cloud locations do
  const only = crypto.randomUUID();
  writeFileSync(path.join(machines, `${crypto.randomUUID()}.json`), JSON.stringify({
    machineName: 'Study PC',
    updatedAt: new Date().toISOString(),
    projects: [{ id: only, name: 'Only there', place: null }, { id: ids.deep, name: 'Deep', place: null }]
  }));
  const after = await list();
  assert.equal(after.elsewhere, undefined);
  assert.ok(![...after.projects, ...after.cloudOnly].some((p) => p.id === only));
  assert.deepEqual(after.projects.map((p) => p.id).sort(), before.projects.map((p) => p.id).sort());
  assert.equal(statSync(ownFile).mtimeMs, written, 'an unchanged list isn’t written again');

  // a new name is the other computers' to see
  await api('/api/sync', { method: 'PATCH', body: { machineName: '  MacBook  ' } });
  await list();
  assert.equal(JSON.parse(readFileSync(ownFile, 'utf8')).machineName, 'MacBook');
});

test('hides sync apps’ and the NAS’s own files from the file tree', async () => {
  const dir = path.join(drive, 'Spectrum', 'Tidy');
  ids.tidy = project(dir);
  for (const name of ['@eaDir', '#recycle', '.SynologyWorkingDirectory', '.dropbox.cache']) mkdirSync(path.join(dir, name, 'x'), { recursive: true });
  await openFolder(dir);
  const { items } = (await api(`/api/projects/${ids.tidy}/tree`)).json;
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

test('never takes a project’s folder, or one inside it, as a cloud location', async () => {
  const notes = path.join(tmp, 'OneDrive notes', 'Notes');
  project(notes);
  mkdirSync(path.join(notes, 'chapters'));
  for (const folder of [notes, path.join(notes, 'chapters')]) {
    const res = await setFolders([drive, folder]);
    assert.equal(res.status, 400, folder);
    assert.match(res.json.message, /a project\. Choose the folder that holds your projects/);
  }
  assert.deepEqual(syncJson().folders.map((f) => f.path), [drive, onedrive]);
});

test('a Finder copy never takes a listed project’s place, nor does a project.json that can’t be read for a moment', async () => {
  const spectrum = path.join(drive, 'Spectrum');
  const report = path.join(spectrum, 'Report');
  const id = project(report);
  await openFolder(report);
  assert.equal((await listed(id)).path, report);
  // a backup made in Finder carries the same id; then the original is renamed
  await fs.cp(report, path.join(spectrum, 'Report backup'), { recursive: true });
  await fs.rename(report, path.join(spectrum, 'Report final'));
  const entry = await listed(id);
  assert.deepEqual([entry.path, entry.missing], [report, true], 'two folders hold it: the user chooses');
  rmSync(path.join(spectrum, 'Report backup'), { recursive: true });
  assert.equal((await listed(id)).path, path.join(spectrum, 'Report final'), 'one does: it follows');

  if (WINDOWS) return;
  await fs.cp(path.join(spectrum, 'Report final'), path.join(spectrum, 'Report old'), { recursive: true });
  const meta = path.join(spectrum, 'Report final', '.spectrum', 'project.json');
  await fs.chmod(meta, 0o000);
  try {
    assert.equal((await listed(id)).path, path.join(spectrum, 'Report final'));
  } finally {
    await fs.chmod(meta, 0o644);
  }
  rmSync(path.join(spectrum, 'Report old'), { recursive: true });
});

test('archived cloud projects are still listed for the other computers', async () => {
  const p = (await api('/api/projects', { method: 'POST', body: { name: 'Old course', parentDir: path.join(drive, 'Spectrum') } })).json;
  assert.equal(p.cloud.mode, 'move');
  const ownFile = path.join(drive, '.spectrum-shared', 'machines', `${syncJson().machineId}.json`);
  await list();
  assert.ok(JSON.parse(readFileSync(ownFile, 'utf8')).projects.some((x) => x.id === p.id));
  assert.equal((await api(`/api/projects/${p.id}/archive`, { method: 'PATCH', body: { archived: true } })).status, 200);
  await list();
  // or another computer could delete the only copy, believing nobody else needs it
  assert.ok(JSON.parse(readFileSync(ownFile, 'utf8')).projects.some((x) => x.id === p.id));
});

test('settings and templates go through the same cloud location on each computer, whatever order its locations are in', async () => {
  for (const folders of [[drive, dropbox], [dropbox, drive]]) {
    await setFolders(folders);
    assert.equal(await sharedDir(), path.join(dropbox, '.spectrum-shared'), folders.join(', '));
  }
  assert.equal((await api('/api/sync')).json.sharedFolder, dropbox, 'and Settings says which');
  // new projects still go in the projects folder
  assert.equal((await api('/api/system/check')).json.projectsDir, path.join(tmp, 'projects'));
  await setFolders([drive]);
});
