// Cloud projects: cloud locations, Sync to (mirrored or moved), Download, Stop syncing and Sync now, and the cloud
// copy of a mirrored project never becoming a project of its own. Against a fake home folder and Bin, never the real
// ones. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const WINDOWS = process.platform === 'win32';
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-cloud-')));
const home = path.join(tmp, 'home');
const onedrive = WINDOWS ? path.join(home, 'OneDrive') : path.join(home, 'Library', 'CloudStorage', 'OneDrive-Personal');
const drive = path.join(home, 'SynologyDrive');
const projectsDir = path.join(tmp, 'projects');
const bin = path.join(tmp, 'Bin');
const tools = path.join(tmp, 'tools');
mkdirSync(onedrive, { recursive: true });
mkdirSync(path.join(drive, '.SynologyWorkingDirectory'), { recursive: true });
mkdirSync(path.join(tmp, 'templates', 'plain'), { recursive: true });
writeFileSync(path.join(tmp, 'templates', 'plain', 'main.tex'), '\\documentclass{article}\\begin{document}\\end{document}');
// a TeX engine that takes its time
mkdirSync(tools);
writeFileSync(path.join(tools, 'tectonic'), '#!/bin/sh\nsleep 2\n', { mode: 0o755 });
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  OneDrive: onedrive,
  APPDATA: path.join(home, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: projectsDir,
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_TEST_BIN_DIR: bin,
  PATH: `${tools}${path.delimiter}${process.env.PATH}`
});
delete process.env.OneDriveCommercial;
delete process.env.OneDriveConsumer;
const { registerProjectRoutes } = await import('../src/routes/projects.js');
const { registerSyncRoutes } = await import('../src/routes/sync.js');
const { registerCloudRoutes } = await import('../src/routes/cloud.js');
const { registerCompileRoutes } = await import('../src/routes/compile.js');
const { registerTransferRoutes } = await import('../src/routes/transfer.js');
const { registerPresenceRoutes } = await import('../src/routes/presence.js');
const { readMirror, syncProject } = await import('../src/services/mirrorService.js');
const { default: Fastify } = await import('fastify');

const app = Fastify();
registerProjectRoutes(app);
registerSyncRoutes(app);
registerCloudRoutes(app);
registerCompileRoutes(app);
registerTransferRoutes(app);
registerPresenceRoutes(app);
await app.ready();
after(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

async function api(url, { method = 'GET', body } = {}) {
  const res = await app.inject({ method, url, payload: body });
  return { status: res.statusCode, json: res.json() };
}
const post = (url, body = {}) => api(url, { method: 'POST', body });
const list = () => api('/api/projects?scan=1').then((r) => r.json);
const listed = async (id) => (await list()).projects.find((p) => p.id === id);
const read = (...parts) => readFileSync(path.join(...parts), 'utf8');
const loc = path.join(onedrive, 'Spectrum');
const machines = path.join(loc, '.spectrum-shared', 'machines');
const otherPc = crypto.randomUUID();

/** A project here, with a file, a version's worth of history and this computer's presence in it. */
async function local(name) {
  const p = (await post('/api/projects', { name })).json;
  writeFileSync(path.join(p.path, 'main.tex'), `${name}\n`);
  mkdirSync(path.join(p.path, '.spectrum', 'history', 'objects'), { recursive: true });
  writeFileSync(path.join(p.path, '.spectrum', 'history', 'objects', 'abc.gz'), 'x');
  mkdirSync(path.join(p.path, '.spectrum', 'open'), { recursive: true });
  writeFileSync(path.join(p.path, '.spectrum', 'open', `${crypto.randomUUID()}.json`), '{}');
  return p;
}
/** A project another computer put in a location. */
function theirs(dir, id = crypto.randomUUID()) {
  mkdirSync(path.join(dir, '.spectrum'), { recursive: true });
  writeFileSync(path.join(dir, '.spectrum', 'project.json'), JSON.stringify({ id, name: path.basename(dir), updatedAt: '2026-10-01T00:00:00.000Z' }));
  writeFileSync(path.join(dir, 'main.tex'), 'from the PC\n');
  return id;
}
const ids = {};

test('a suggestion goes in its app’s Spectrum folder, made on Add, and a location never holds or sits in the projects folder', async () => {
  mkdirSync(projectsDir, { recursive: true });
  const { suggestions } = (await api('/api/sync')).json;
  assert.equal(suggestions.find((s) => s.provider === 'onedrive').target, loc);
  for (const [folders, message] of [[[tmp], /holds the folder new projects go in/], [[path.join(projectsDir)], /is the folder new projects go in/]]) {
    const res = await api('/api/sync', { method: 'PATCH', body: { folders } });
    assert.equal(res.status, 400);
    assert.match(res.json.message, message);
  }
  mkdirSync(path.join(projectsDir, 'Inside'));
  assert.match((await api('/api/sync', { method: 'PATCH', body: { folders: [path.join(projectsDir, 'Inside')] } })).json.message, /is inside the folder new projects go in/);
  // the default folder chosen in Settings counts too
  mkdirSync(path.join(drive, 'Papers'));
  const chosen = await api('/api/sync', { method: 'PATCH', body: { folders: [drive], projectsDir: path.join(drive, 'Papers') } });
  assert.match(chosen.json.message, /holds the folder new projects go in/);

  const added = (await api('/api/sync', { method: 'PATCH', body: { folders: [loc] } })).json;
  assert.ok(existsSync(loc));
  assert.deepEqual(added.folders, [{ path: loc, label: 'OneDrive', found: true, place: { provider: 'onedrive', label: 'OneDrive', rel: 'Spectrum' }, mirrored: 0 }]);
});

test('Sync to keeps the project here and mirrors it into a copy in the location', async () => {
  const p = await local('Thesis');
  ids.thesis = p.id;
  // what the mirror never carries, a link in it included, stays out of the copy
  mkdirSync(path.join(p.path, '.git'));
  writeFileSync(path.join(p.path, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  if (!WINDOWS) symlinkSync('HEAD', path.join(p.path, '.git', 'ORIG_HEAD'));
  const res = await post(`/api/projects/${p.id}/cloud`, { location: loc, mode: 'mirror' });
  assert.equal(res.status, 200, res.json.message);
  const { project } = res.json;
  assert.equal(project.path, p.path);
  assert.deepEqual({ ...project.cloud, status: typeof project.cloud.status }, { mode: 'mirror', label: 'OneDrive', rel: 'Thesis', location: loc, status: 'object' });
  const copy = path.join(loc, 'Thesis');
  assert.equal(read(copy, 'main.tex'), 'Thesis\n');
  assert.equal(JSON.parse(read(copy, '.spectrum', 'project.json')).id, p.id);
  assert.ok(existsSync(path.join(copy, '.spectrum', 'history', 'objects', 'abc.gz')));
  assert.ok(!existsSync(path.join(copy, '.spectrum', 'open')), 'presence is each computer’s own');
  const record = await readMirror(p.id);
  assert.deepEqual([record.location, record.rel], [loc, 'Thesis']);
  assert.ok('main.tex' in record.files, 'its base: the files copied and checked');

  // listed once, at its own folder, and the other computers hear where its cloud copy is
  const { projects, cloudOnly } = await list();
  assert.deepEqual(projects.filter((x) => x.id === p.id).map((x) => x.path), [p.path]);
  assert.ok(!cloudOnly.some((x) => x.id === p.id));
  const { machineId } = JSON.parse(read(tmp, 'data', 'sync.json'));
  const published = JSON.parse(read(machines, `${machineId}.json`)).projects;
  assert.deepEqual(published, [{ id: p.id, name: 'Thesis', place: { provider: 'onedrive', label: 'OneDrive', rel: 'Spectrum/Thesis' }, mirror: true }]);
  assert.equal((await api('/api/sync')).json.folders[0].mirrored, 1);

  assert.match((await post(`/api/projects/${p.id}/cloud`, { location: loc })).json.message, /already syncs to OneDrive/);
  // the location stays while projects mirror into it
  const remove = await api('/api/sync', { method: 'PATCH', body: { folders: [] } });
  assert.deepEqual([remove.status, remove.json.message], [409, 'Stop syncing “Thesis” first.']);
});

test('the cloud copy of a mirrored project opens the project here, and is never a project of its own', async () => {
  const copy = path.join(loc, 'Thesis');
  assert.deepEqual((await post('/api/projects/open-file', { path: path.join(copy, 'main.tex') })).json, { projectId: ids.thesis, file: 'main.tex' });
  const folder = await post('/api/projects/open-folder', { path: copy });
  assert.equal(folder.status, 409);
  assert.match(folder.json.message, /This is the cloud copy of “Thesis”/);
  const other = (await post('/api/projects', { name: 'Elsewhere' })).json;
  assert.equal((await post(`/api/projects/${other.id}/relocate`, { path: copy })).status, 409);
  assert.equal(JSON.parse(read(copy, '.spectrum', 'project.json')).id, ids.thesis);
});

test('the editor says a mirrored project is open in its cloud copy, where the other computers look', async () => {
  const { machineId } = JSON.parse(read(tmp, 'data', 'sync.json'));
  const mine = path.join(loc, 'Thesis', '.spectrum', 'open', `${machineId}.json`);
  assert.equal((await post(`/api/projects/${ids.thesis}/presence`)).status, 200);
  assert.ok(existsSync(mine));
  await api(`/api/projects/${ids.thesis}/presence`, { method: 'DELETE' });
  assert.ok(!existsSync(mine));
});

test('the scan lists another computer’s project in a location without adding it, and a mirrored project never turns into its cloud copy', async () => {
  ids.other = theirs(path.join(loc, 'Other'));
  const { projects, cloudOnly } = await list();
  assert.ok(!projects.some((p) => p.id === ids.other));
  assert.deepEqual(cloudOnly, [{ id: ids.other, name: 'Other', label: 'OneDrive', rel: 'Other', location: loc, updatedAt: '2026-10-01T00:00:00.000Z' }]);

  // the folder here moved away: Folder missing (and Locate…), not the cloud copy in its place
  const thesis = path.join(projectsDir, 'Thesis');
  await fs.rename(thesis, path.join(tmp, 'Thesis away'));
  try {
    const missing = await listed(ids.thesis);
    assert.deepEqual([missing.path, missing.missing], [thesis, true]);
  } finally {
    await fs.rename(path.join(tmp, 'Thesis away'), thesis);
  }
});

test('Sync to links to a copy with the project’s id that’s already in the location', async () => {
  const stop = await post(`/api/projects/${ids.thesis}/cloud/stop`, { deleteCloud: false });
  assert.equal(stop.json.project.cloud, undefined);
  assert.equal(await readMirror(ids.thesis), null);
  assert.ok(existsSync(path.join(loc, 'Thesis', 'main.tex')), 'kept in OneDrive');
  assert.ok(!(await list()).cloudOnly.some((p) => p.id === ids.thesis), 'it’s on this computer');

  writeFileSync(path.join(loc, 'Thesis', 'added there.tex'), 'later\n');
  const again = (await post(`/api/projects/${ids.thesis}/cloud`, { location: loc })).json.project;
  assert.equal(again.cloud.rel, 'Thesis');
  assert.ok(!existsSync(path.join(loc, 'Thesis 2')));
  await syncProject(ids.thesis);
  assert.equal(read(projectsDir, 'Thesis', 'added there.tex'), 'later\n');
  assert.equal(read(loc, 'Thesis', 'main.tex'), 'Thesis\n');
});

test('Download copies another computer’s project into the projects folder and mirrors it, or opens it in place', async () => {
  const res = await post('/api/cloud/download', { location: loc, rel: 'Other', id: ids.other, mode: 'mirror' });
  assert.equal(res.status, 200, res.json.message);
  const { project } = res.json;
  assert.equal(project.path, path.join(projectsDir, 'Other'));
  assert.equal(project.name, 'Other');
  assert.deepEqual([project.cloud.mode, project.cloud.rel], ['mirror', 'Other']);
  assert.equal(read(project.path, 'main.tex'), 'from the PC\n');
  assert.ok(!(await list()).cloudOnly.some((p) => p.id === ids.other));
  assert.equal((await post('/api/cloud/download', { location: loc, rel: 'Other', id: ids.other })).status, 409);

  // with Move, or a default folder in a sync app's folder itself, it stays where it is
  ids.inPlace = theirs(path.join(loc, 'In place'));
  ids.backedUp = theirs(path.join(loc, 'Backed up'));
  const moved = (await post('/api/cloud/download', { location: loc, rel: 'In place', id: ids.inPlace, mode: 'move' })).json.project;
  assert.deepEqual([moved.path, moved.cloud.mode], [path.join(loc, 'In place'), 'move']);
  const backedUp = (await post('/api/cloud/download', { location: loc, rel: 'Backed up', id: ids.backedUp, mode: 'mirror', parentDir: path.join(drive, 'Papers') })).json.project;
  assert.deepEqual([backedUp.path, backedUp.cloud.mode], [path.join(loc, 'Backed up'), 'move']);
  assert.equal(await readMirror(ids.backedUp), null);

  if (!WINDOWS) {
    // a default folder chosen through a link into the location is in it, so the project is used there
    ids.linked = theirs(path.join(loc, 'Linked'));
    mkdirSync(path.join(loc, 'Papers'));
    symlinkSync(path.join(loc, 'Papers'), path.join(tmp, 'Papers link'));
    const linked = (await post('/api/cloud/download', { location: loc, rel: 'Linked', id: ids.linked, mode: 'mirror', parentDir: path.join(tmp, 'Papers link') })).json.project;
    assert.deepEqual([linked.path, linked.cloud.mode], [path.join(loc, 'Linked'), 'move']);
    assert.deepEqual(readdirSync(path.join(loc, 'Papers')), []);
    // checked before anything is copied
    ids.linky = theirs(path.join(loc, 'Linky'));
    symlinkSync('main.tex', path.join(loc, 'Linky', 'link.tex'));
    const linky = await post('/api/cloud/download', { location: loc, rel: 'Linky', id: ids.linky, mode: 'mirror' });
    assert.equal(linky.status, 409);
    assert.match(linky.json.message, /“link\.tex” is a symbolic link/);
    assert.ok(!existsSync(path.join(projectsDir, 'Linky')));
    rmSync(path.join(loc, 'Linky'), { recursive: true });
  }

  for (const rel of ['../Thesis', '', 'Other/../Other']) assert.equal((await post('/api/cloud/download', { location: loc, rel, id: ids.other })).status, 404, rel);
  assert.equal((await post('/api/cloud/download', { location: path.join(home, 'Nowhere'), rel: 'Other', id: ids.other })).status, 400);
});

test('Sync to with Move moves the folder into the location, its original to the Bin', async () => {
  const p = await local('Moving');
  mkdirSync(path.join(tmp, 'data', 'cache', p.id, 'synctex'), { recursive: true });
  const res = await post(`/api/projects/${p.id}/cloud`, { location: loc, mode: 'move' });
  assert.equal(res.status, 200, res.json.message);
  const { project, warning } = res.json;
  assert.equal(warning, undefined);
  assert.deepEqual([project.path, project.cloud], [path.join(loc, 'Moving'), { mode: 'move', label: 'OneDrive', rel: 'Moving', location: loc }]);
  assert.equal(read(loc, 'Moving', 'main.tex'), 'Moving\n');
  assert.ok(!existsSync(p.path));
  assert.ok(readdirSync(bin).some((name) => name.endsWith(' Moving')));
  assert.ok(!existsSync(path.join(tmp, 'data', 'cache', p.id, 'synctex')), 'its SyncTeX had the old path');
  ids.moving = p.id;
  assert.equal((await post(`/api/projects/${p.id}/cloud`, { location: loc, mode: 'move' })).json.message, 'Already in OneDrive.');

  // a copy with its id there already (kept by Stop syncing): moving would make two
  const kept = await local('Kept');
  await post(`/api/projects/${kept.id}/cloud`, { location: loc });
  await post(`/api/projects/${kept.id}/cloud/stop`, { deleteCloud: false });
  assert.equal((await post(`/api/projects/${kept.id}/cloud`, { location: loc, mode: 'move' })).json.message, 'Already in OneDrive as Kept.');
});

test('a project in a sync app’s folder already isn’t synced to a location', async () => {
  const p = (await post('/api/projects', { name: 'On the NAS', parentDir: path.join(drive, 'Papers') })).json;
  const res = await post(`/api/projects/${p.id}/cloud`, { location: loc });
  assert.deepEqual([res.status, res.json.message], [409, 'Already in Synology Drive.']);
});

test('iCloud’s Desktop & Documents counts as iCloud Drive', { skip: process.platform !== 'darwin' && 'macOS only' }, async () => {
  const icloud = path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  mkdirSync(icloud, { recursive: true });
  mkdirSync(path.join(home, 'Documents'));
  symlinkSync(path.join(home, 'Documents'), path.join(icloud, 'Documents'));
  const p = (await post('/api/projects', { name: 'Essay', parentDir: path.join(home, 'Documents', 'Uni') })).json;
  assert.deepEqual(p.place, { provider: 'icloud', label: 'iCloud Drive', rel: 'Documents/Uni/Essay', here: true });
  assert.equal((await post(`/api/projects/${p.id}/cloud`, { location: loc })).json.message, 'Already in iCloud Drive.');
});

test('a project isn’t moved while it compiles or is being converted', { skip: WINDOWS && 'the fake engine is a shell script' }, async () => {
  const p = await local('Busy');
  const compile = post('/api/compile', { projectId: p.id, mainFile: 'main.tex', engine: 'tectonic' });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const res = await post(`/api/projects/${p.id}/cloud`, { location: loc, mode: 'move' });
  assert.deepEqual([res.status, res.json.message], [409, '“Busy” is compiling or being converted. Try again once that’s finished.']);
  await compile;
  assert.ok(existsSync(p.path));

  // a transfer keeps both projects' folders until it's done
  const llmConfig = { endpoint: 'http://127.0.0.1:9/v1', model: 'test' };
  const job = (await post('/api/transfer/start', { sourceProjectId: p.id, sourceMainFile: 'main.tex', targetTemplateId: 'plain', targetMainFile: 'main.tex', llmConfig })).json;
  assert.ok(job.newProjectId, JSON.stringify(job));
  for (const id of [p.id, job.newProjectId]) assert.equal((await post(`/api/projects/${id}/cloud`, { location: loc, mode: 'move' })).status, 409, id);
  // mirroring leaves the folder where it is
  assert.equal((await post(`/api/projects/${p.id}/cloud`, { location: loc, mode: 'mirror' })).status, 200);
});

test('Stop syncing deletes the copy in the location only when no other computer needs it', async () => {
  const copy = path.join(loc, 'Thesis');
  const now = new Date().toISOString();
  mkdirSync(path.join(copy, '.spectrum', 'open'), { recursive: true });
  writeFileSync(path.join(copy, '.spectrum', 'open', `${otherPc}.json`), JSON.stringify({ host: 'Study PC', since: now, at: now }));
  let res = await post(`/api/projects/${ids.thesis}/cloud/stop`, { deleteCloud: true });
  assert.deepEqual([res.status, res.json.message], [409, '“Thesis” is open on Study PC. Close it there, or keep the copy in OneDrive.']);
  rmSync(path.join(copy, '.spectrum', 'open', `${otherPc}.json`));

  // a computer that works on the cloud copy itself (1.8.0, or Move)
  const machine = (mirror) => writeFileSync(path.join(machines, `${otherPc}.json`), JSON.stringify({ machineName: 'Study PC', updatedAt: now, projects: [{ id: ids.thesis, name: 'Thesis', place: null, ...(mirror && { mirror }) }] }));
  machine(undefined);
  res = await post(`/api/projects/${ids.thesis}/cloud/stop`, { deleteCloud: true });
  assert.deepEqual([res.status, res.json.message], [409, 'Study PC works on the copy in OneDrive itself, so deleting it would delete “Thesis” there too. Keep the copy in OneDrive instead.']);
  assert.ok(existsSync(copy));

  machine(true);
  res = await post(`/api/projects/${ids.thesis}/cloud/stop`, { deleteCloud: true });
  assert.equal(res.status, 200, res.json.message);
  assert.equal(res.json.project.cloud, undefined);
  assert.ok(!existsSync(copy));
  assert.ok(readdirSync(bin).some((name) => name.endsWith(' Thesis')));
  assert.equal(read(projectsDir, 'Thesis', 'main.tex'), 'Thesis\n');
  assert.equal(await readMirror(ids.thesis), null);
  rmSync(path.join(machines, `${otherPc}.json`));
});

test('Stop syncing a moved project copies it back to the projects folder first', async () => {
  let res = await post(`/api/projects/${ids.moving}/cloud/stop`, { deleteCloud: false });
  assert.equal(res.status, 200, res.json.message);
  assert.deepEqual([res.json.project.path, res.json.project.cloud], [path.join(projectsDir, 'Moving'), undefined]);
  assert.equal(read(projectsDir, 'Moving', 'main.tex'), 'Moving\n');
  assert.ok(existsSync(path.join(loc, 'Moving', 'main.tex')), 'kept in OneDrive');

  res = await post(`/api/projects/${ids.inPlace}/cloud/stop`, { deleteCloud: true });
  assert.equal(res.status, 200, res.json.message);
  assert.equal(res.json.project.path, path.join(projectsDir, 'In place'));
  assert.equal(read(projectsDir, 'In place', 'main.tex'), 'from the PC\n');
  assert.ok(!existsSync(path.join(loc, 'In place')));
});

test('Sync now runs a mirrored project’s pass; a moved one syncs through its app', async () => {
  assert.equal((await post(`/api/projects/${ids.other}/cloud/sync`)).json.status.state, 'synced');
  assert.equal((await post(`/api/projects/${ids.backedUp}/cloud/sync`)).json.message, 'OneDrive keeps “Backed up” in step itself.');
  assert.equal((await post(`/api/projects/${ids.moving}/cloud/sync`)).json.message, '“Moving” isn’t syncing.');
});

test('this computer’s list goes in every cloud location, so any computer sharing one sees what it works on there', async () => {
  const nas = path.join(drive, 'Spectrum');
  mkdirSync(nas);
  assert.equal((await api('/api/sync', { method: 'PATCH', body: { folders: [loc, nas] } })).status, 200);
  await list();
  const { machineId } = JSON.parse(read(tmp, 'data', 'sync.json'));
  for (const folder of [loc, nas]) {
    const { projects } = JSON.parse(read(folder, '.spectrum-shared', 'machines', `${machineId}.json`));
    assert.ok(projects.some((p) => p.id === ids.backedUp && p.mirror === false), folder);
  }
});
