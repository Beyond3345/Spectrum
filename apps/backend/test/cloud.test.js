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
  assert.deepEqual(project.cloud, { mode: 'mirror', label: 'OneDrive', rel: 'Thesis', location: loc, status: { state: 'synced', at: project.cloud.status.at } }, 'its first pass done');
  const copy = path.join(loc, 'Thesis');
  assert.ok(!existsSync(path.join(copy, '.git')));
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
  // nor a folder in a location that holds projects (another computer's, say), which it would hide
  theirs(path.join(loc, 'Group', 'Inner'));
  const group = await post('/api/projects/open-folder', { path: path.join(loc, 'Group') });
  assert.deepEqual([group.status, group.json.message], [409, 'That folder holds other projects. Open one of them instead.']);
  rmSync(path.join(loc, 'Group'), { recursive: true });
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

  // a rename, like any change through the file routes, starts a pass 2 s later
  assert.equal((await post(`/api/projects/${ids.thesis}/rename`, { from: 'added there.tex', to: 'renamed.tex' })).json.ok, true);
  for (let i = 0; i < 50 && !existsSync(path.join(loc, 'Thesis', 'renamed.tex')); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(read(loc, 'Thesis', 'renamed.tex'), 'later\n');
  assert.ok(!existsSync(path.join(loc, 'Thesis', 'added there.tex')));
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
  if (['darwin', 'win32'].includes(process.platform)) {
    // Move to Bin deletes it on every computer, so it checks what Stop syncing › Delete does
    const presence = path.join(loc, 'Moving', '.spectrum', 'open', `${otherPc}.json`);
    const now = new Date().toISOString();
    mkdirSync(path.dirname(presence), { recursive: true });
    writeFileSync(presence, JSON.stringify({ host: 'Study PC', since: now, at: now }));
    const trash = await post(`/api/projects/${p.id}/trash`);
    assert.deepEqual([trash.status, trash.json.message], [409, '“Moving” is open on Study PC. Close it there, or remove it from the list.']);
    assert.ok(existsSync(path.join(loc, 'Moving', 'main.tex')));
    rmSync(presence);
  }

  // a copy with its id there already (kept by Stop syncing): moving would make two
  const kept = await local('Kept');
  await post(`/api/projects/${kept.id}/cloud`, { location: loc });
  await post(`/api/projects/${kept.id}/cloud/stop`, { deleteCloud: false });
  assert.equal((await post(`/api/projects/${kept.id}/cloud`, { location: loc, mode: 'move' })).json.message, 'Already in OneDrive as Kept.');
  // its folder here gone (renamed, a drive unplugged): Folder missing, never the copy kept there
  await fs.rename(kept.path, path.join(tmp, 'Kept away'));
  try {
    const missing = await listed(kept.id);
    assert.deepEqual([missing.path, missing.missing, missing.cloud], [kept.path, true, undefined]);
  } finally {
    await fs.rename(path.join(tmp, 'Kept away'), kept.path);
  }
});

test('one Sync to at a time for a project, so two can’t each make a copy', async () => {
  const p = await local('Twice');
  const both = await Promise.all([post(`/api/projects/${p.id}/cloud`, { location: loc }), post(`/api/projects/${p.id}/cloud`, { location: loc })]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  assert.equal(both.find((r) => r.status === 409).json.message, 'That project is already being synced. Try again once that’s finished.');
  assert.ok(!existsSync(path.join(loc, 'Twice 2')));
});

test('a project in a sync app’s folder already isn’t synced to a location in that app, only copied to another’s', async () => {
  const p = (await post('/api/projects', { name: 'On the NAS', parentDir: path.join(drive, 'Papers') })).json;
  const nas = path.join(drive, 'Spectrum');
  assert.equal((await api('/api/sync', { method: 'PATCH', body: { folders: [loc, nas] } })).status, 200);
  const res = await post(`/api/projects/${p.id}/cloud`, { location: nas });
  assert.deepEqual([res.status, res.json.message], [409, 'Already in Synology Drive.']);
  // another app's location: a copy like any other
  assert.equal((await post(`/api/projects/${p.id}/cloud`, { location: loc })).json.project.cloud.mode, 'mirror');
  // a location holding its folder would drop the mirror without a word
  const holds = await api('/api/sync', { method: 'PATCH', body: { folders: [loc, nas, path.join(drive, 'Papers')] } });
  assert.deepEqual([holds.status, holds.json.message], [409, 'That folder holds “On the NAS”, which syncs to OneDrive. Stop syncing it first.']);
  assert.equal((await api('/api/sync', { method: 'PATCH', body: { folders: [loc] } })).status, 200);
});

test('iCloud’s Desktop & Documents counts as iCloud Drive', { skip: process.platform !== 'darwin' && 'macOS only' }, async () => {
  const icloud = path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  mkdirSync(icloud, { recursive: true });
  mkdirSync(path.join(home, 'Documents'));
  symlinkSync(path.join(home, 'Documents'), path.join(icloud, 'Documents'));
  const p = (await post('/api/projects', { name: 'Essay', parentDir: path.join(home, 'Documents', 'Uni') })).json;
  assert.deepEqual(p.place, { provider: 'icloud', label: 'iCloud Drive', rel: 'Documents/Uni/Essay', here: true });
  assert.equal((await post(`/api/projects/${p.id}/cloud`, { location: loc })).json.project.cloud.mode, 'mirror', 'OneDrive’s location: a copy');
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

  // a computer whose list an older Spectrum wrote (1.8.0 leaves archived projects out): it may use the copy itself
  writeFileSync(path.join(machines, `${otherPc}.json`), JSON.stringify({ machineName: 'Study PC', updatedAt: now, projects: [] }));
  res = await post(`/api/projects/${ids.thesis}/cloud/stop`, { deleteCloud: true });
  assert.deepEqual([res.status, res.json.message], [409, 'Study PC runs an older Spectrum, which may use the copy in OneDrive itself. Keep the copy in OneDrive instead.']);

  // a computer that works on the cloud copy itself (in place, or Move)
  const machine = (mirror, format = 2) => writeFileSync(path.join(machines, `${otherPc}.json`), JSON.stringify({ format, machineName: 'Study PC', updatedAt: now, projects: [{ id: ids.thesis, name: 'Thesis', place: null, ...(mirror && { mirror }) }] }));
  machine(undefined);
  res = await post(`/api/projects/${ids.thesis}/cloud/stop`, { deleteCloud: true });
  assert.deepEqual([res.status, res.json.message], [409, 'Study PC works on the copy in OneDrive itself, so deleting it would delete “Thesis” there too. Keep the copy in OneDrive instead.']);
  assert.ok(existsSync(copy));

  // with a copy of its own, in a list a later Spectrum wrote, which lists every project as this one does
  machine(true, 3);
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

  if (!WINDOWS && process.getuid?.() !== 0) {
    // the copy can't be deleted (the location's folder read-only), once the project is here again: said, not a 500
    const p = await local('Stuck');
    await post(`/api/projects/${p.id}/cloud`, { location: loc, mode: 'move' });
    await fs.chmod(loc, 0o555);
    try {
      res = await post(`/api/projects/${p.id}/cloud/stop`, { deleteCloud: true });
    } finally {
      await fs.chmod(loc, 0o755);
    }
    assert.equal(res.status, 200, res.json.message);
    assert.match(res.json.warning, /^Stopped syncing, but the copy in OneDrive couldn’t be deleted \(.+\)\. It’s still at .+Stuck\.$/);
    assert.deepEqual([res.json.project.path, res.json.project.cloud], [path.join(projectsDir, 'Stuck'), undefined]);
    assert.ok(existsSync(path.join(loc, 'Stuck', 'main.tex')));
  }
});

test('Sync now runs a mirrored project’s pass; a moved one syncs through its app', async () => {
  assert.equal((await post(`/api/projects/${ids.other}/cloud/sync`)).json.status.state, 'synced');
  assert.equal((await post(`/api/projects/${ids.backedUp}/cloud/sync`)).json.message, 'OneDrive keeps “Backed up” in step itself.');
  assert.equal((await post(`/api/projects/${ids.moving}/cloud/sync`)).json.message, '“Moving” isn’t syncing.');
});

test('this computer’s list goes in every cloud location, so any computer sharing one sees what it works on there', async () => {
  const nas = path.join(drive, 'Spectrum');
  assert.equal((await api('/api/sync', { method: 'PATCH', body: { folders: [loc, nas] } })).status, 200);
  await list();
  const { machineId } = JSON.parse(read(tmp, 'data', 'sync.json'));
  const listIn = (folder) => JSON.parse(read(folder, '.spectrum-shared', 'machines', `${machineId}.json`));
  for (const folder of [loc, nas]) {
    assert.equal(listIn(folder).format, 2);
    assert.ok(listIn(folder).projects.some((p) => p.id === ids.backedUp && p.mirror === false), folder);
  }
  // its name and place only where its copy is, so a location shared with other people doesn't list them
  assert.equal(listIn(loc).projects.find((p) => p.id === ids.backedUp).name, 'Backed up');
  assert.deepEqual(listIn(nas).projects.find((p) => p.id === ids.backedUp), { id: ids.backedUp, mirror: false });
});

test('Locate… on a mirrored project starts its mirror again, so an older copy deletes nothing in the cloud and overwrites nothing unkept', async () => {
  const p = await local('Backup');
  assert.equal((await post(`/api/projects/${p.id}/cloud`, { location: loc })).status, 200);
  const old = path.join(tmp, 'Backup old');
  await fs.cp(p.path, old, { recursive: true });
  writeFileSync(path.join(p.path, 'main.tex'), 'Backup, newer\n');
  writeFileSync(path.join(p.path, 'ch3.tex'), 'chapter three\n');
  await syncProject(p.id);
  assert.equal(read(loc, 'Backup', 'ch3.tex'), 'chapter three\n');
  // the folder here gone, and the older copy, with the same id, located in its place
  await fs.rm(p.path, { recursive: true });
  assert.equal((await post(`/api/projects/${p.id}/relocate`, { path: old })).status, 200);
  assert.equal((await syncProject(p.id)).state, 'synced');
  assert.equal(read(loc, 'Backup', 'ch3.tex'), 'chapter three\n');
  assert.equal(read(old, 'ch3.tex'), 'chapter three\n');
  // the newer text beside the older one, as a conflicted copy
  const copy = readdirSync(old).find((name) => name.startsWith('main (OneDrive’s conflicted copy '));
  assert.ok(copy, readdirSync(old).join(', '));
  assert.equal(read(old, copy), 'Backup, newer\n');
});

test('Remove from list on a mirrored project whose folder has gone leaves its cloud copy to download again', async () => {
  const p = await local('Lost');
  assert.equal((await post(`/api/projects/${p.id}/cloud`, { location: loc })).status, 200);
  // in step, so no pass is under way as the folder goes
  await syncProject(p.id);
  await fs.rm(p.path, { recursive: true });
  assert.equal((await post(`/api/projects/${p.id}/remove`)).status, 200);
  assert.ok((await list()).cloudOnly.some((c) => c.id === p.id && c.rel === 'Lost'));
  const back = await post('/api/cloud/download', { location: loc, rel: 'Lost', id: p.id, mode: 'mirror' });
  assert.equal(back.status, 200, back.json.message);
  assert.equal(read(back.json.project.path, 'main.tex'), 'Lost\n');
});

test('a project used in place follows its id when its location is added again at a new path', async () => {
  const nas = path.join(drive, 'Spectrum');
  assert.equal((await api('/api/sync', { method: 'PATCH', body: { folders: [loc, nas] } })).status, 200);
  const id = theirs(path.join(nas, 'Roaming'));
  assert.equal((await post('/api/cloud/download', { location: nas, rel: 'Roaming', id, mode: 'move' })).status, 200);
  // the location taken out, then its folder moved (a sync task set up again elsewhere) and added again there
  assert.equal((await api('/api/sync', { method: 'PATCH', body: { folders: [loc] } })).status, 200);
  const moved = path.join(drive, 'Spectrum moved');
  await fs.rename(nas, moved);
  assert.equal((await api('/api/sync', { method: 'PATCH', body: { folders: [loc, moved] } })).status, 200);
  const p = await listed(id);
  assert.deepEqual([p.path, p.missing], [path.join(moved, 'Roaming'), false]);
  assert.equal((await api('/api/sync', { method: 'PATCH', body: { folders: [loc] } })).status, 200);
});

test('Move to Bin on a mirrored project leaves its cloud copy out of Cloud projects, as Remove from list does', { skip: !['darwin', 'win32'].includes(process.platform) && 'macOS and Windows only' }, async () => {
  const p = await local('Binned');
  assert.equal((await post(`/api/projects/${p.id}/cloud`, { location: loc })).status, 200);
  await syncProject(p.id);
  assert.equal((await post(`/api/projects/${p.id}/trash`)).json.ok, true);
  assert.ok(!existsSync(p.path));
  assert.ok(existsSync(path.join(loc, 'Binned', 'main.tex')), 'its copy in OneDrive stays');
  assert.ok(!(await list()).cloudOnly.some((c) => c.id === p.id));
});
