// The first start of 2.0 on a computer that synced projects through 1.10's cloud mirror: mirrored projects become
// ordinary ones, what their cloud copies have that this computer never received is listed (never merged), projects
// used in place keep working there, and nothing in DATA_DIR/mirror, sync.json or a cloud copy is written. Against a
// fake home folder and scratch folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-migration-')));
const home = path.join(tmp, 'home');
// a classic Synology Drive task, with 1.10's cloud location in it
const drive = path.join(home, 'SynologyDrive');
const loc = path.join(drive, 'Spectrum');
const data = path.join(tmp, 'data');
mkdirSync(path.join(drive, '.SynologyWorkingDirectory'), { recursive: true });
mkdirSync(loc);
mkdirSync(path.join(data, 'mirror'), { recursive: true });
writeFileSync(path.join(data, 'sync.json'), JSON.stringify({ machineId: crypto.randomUUID(), machineName: 'MacBook', folders: [{ path: loc }], hidden: [] }));
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  APPDATA: path.join(home, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  SPECTRUM_DATA_DIR: data,
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects')
});
const mirror = await import('../src/services/mirrorService.js');
const projects = await import('../src/services/projectService.js');
const { keyOf } = await import('../src/services/mergeRules.js');
after(() => rmSync(tmp, { recursive: true, force: true }));

const write = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const sha = (file) => crypto.createHash('sha256').update(readFileSync(file)).digest('hex');
const stat = async (file) => {
  const s = await fs.lstat(file);
  return { size: s.size, mtimeMs: s.mtimeMs };
};
/** A project's folder here and its copy in the location, the same files in each. */
async function both(name, files) {
  const id = crypto.randomUUID();
  const local = path.join(tmp, 'projects', name);
  const cloud = path.join(loc, name);
  for (const root of [local, cloud]) {
    write(path.join(root, '.spectrum', 'project.json'), JSON.stringify({ id, name }));
    for (const [rel, text] of Object.entries(files)) write(path.join(root, rel), text);
  }
  await projects.openFolder(local);
  return { id, local, cloud };
}
/** 1.10's record of the project, as a pass leaves it once both copies agree. */
async function record({ id, local, cloud }, extra = {}) {
  const files = {};
  for (const rel of ['.spectrum/project.json', ...(await fs.readdir(local, { recursive: true }))]) {
    const abs = path.join(local, rel);
    if (rel === '.spectrum' || (await fs.stat(abs)).isDirectory()) continue;
    const posix = rel.split(path.sep).join('/');
    files[keyOf(posix)] = { rel: posix, hash: sha(abs), l: await stat(abs), c: await stat(path.join(cloud, rel)), by: 'here' };
  }
  writeFileSync(path.join(data, 'mirror', `${id}.json`), JSON.stringify({ location: loc, rel: path.basename(cloud), files: { ...files, ...extra } }));
}
/** Every file under dir with its bytes and time, to show nothing there changed. */
async function snapshot(dir) {
  const out = {};
  for (const rel of (await fs.readdir(dir, { recursive: true })).sort()) {
    const abs = path.join(dir, rel);
    const s = await fs.lstat(abs);
    out[rel] = s.isFile() ? [sha(abs), s.mtimeMs] : 'dir';
  }
  return out;
}

const thesis = await both('Thesis', { 'main.tex': 'thesis\n', 'refs.bib': '@book{a}\n', 'figs/a.png': 'png', 'Notes.md': 'n\n' });
await record(thesis);
const paper = await both('Paper', { 'main.tex': 'paper\n' });
// the last pass merged main.tex and wrote it there, leaving its stat to take again
await record(paper, { 'main.tex': { rel: 'main.tex', hash: sha(path.join(paper.local, 'main.tex')), by: 'here' } });
const gone = await both('Gone', { 'main.tex': 'gone\n' });
await record(gone);
rmSync(gone.cloud, { recursive: true });
// one used in place in the location, one only there (another computer's), and a record 1.10 has yet to forget
const grant = path.join(loc, 'Grant');
write(path.join(grant, '.spectrum', 'project.json'), JSON.stringify({ id: crypto.randomUUID(), name: 'Grant' }));
write(path.join(grant, 'main.tex'), 'grant\n');
const grantId = (await projects.openFolder(grant)).id;
write(path.join(loc, 'Other', '.spectrum', 'project.json'), JSON.stringify({ id: crypto.randomUUID(), name: 'Other' }));
const removed = await both('Removed', { 'main.tex': 'removed\n' });
await record(removed);
await projects.unregister(removed.id);

// what the other computer did since this one last synced: an edit, a new file, a deletion, a respelling, and a chat
await new Promise((resolve) => setTimeout(resolve, 20));
write(path.join(thesis.cloud, 'refs.bib'), '@book{a}\n@book{b}\n');
write(path.join(thesis.cloud, 'chapters', 'intro.tex'), 'intro\n');
rmSync(path.join(thesis.cloud, 'figs', 'a.png'));
await fs.rename(path.join(thesis.cloud, 'Notes.md'), path.join(thesis.cloud, 'notes.md'));
write(path.join(thesis.cloud, '.spectrum', 'chats', 'c1.json'), '{}');
// and this computer, after: not news
write(path.join(thesis.local, 'main.tex'), 'thesis, edited here\n');

test('the first start lists what each cloud copy has that this computer never got, and writes nothing there', async () => {
  const before = { mirror: await snapshot(path.join(data, 'mirror')), sync: readFileSync(path.join(data, 'sync.json'), 'utf8'), loc: await snapshot(loc) };
  const result = await mirror.migrateToV2();
  const byName = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  // not the one removed from the list
  assert.deepEqual(byName(result.mirrored), [
    { id: gone.id, name: 'Gone', label: 'Synology Drive', missing: true },
    { id: paper.id, name: 'Paper', label: 'Synology Drive', changed: [], deleted: [] },
    { id: thesis.id, name: 'Thesis', label: 'Synology Drive', changed: ['chapters/intro.tex', 'refs.bib'], deleted: ['figs/a.png'] }
  ]);
  assert.deepEqual(result.inPlace, [{ id: grantId, name: 'Grant', label: 'Synology Drive', path: grant }]);
  assert.deepEqual({ mirror: await snapshot(path.join(data, 'mirror')), sync: readFileSync(path.join(data, 'sync.json'), 'utf8'), loc: await snapshot(loc) }, before);

  // a copy that isn't there now is looked at again at the next start, until a look succeeds or the notice is dismissed
  const saved = readFileSync(path.join(data, 'v2-migration.json'), 'utf8');
  write(path.join(gone.cloud, '.spectrum', 'project.json'), JSON.stringify({ id: gone.id, name: 'Gone' }));
  write(path.join(gone.cloud, 'main.tex'), 'gone, edited there\n');
  const next = await import(`${pathToFileURL(path.join(here, '..', 'src', 'services', 'mirrorService.js')).href}?recheck`);
  assert.deepEqual((await next.migrateToV2()).mirrored.find((m) => m.id === gone.id), { id: gone.id, name: 'Gone', label: 'Synology Drive', changed: ['main.tex'], deleted: [] });
  rmSync(gone.cloud, { recursive: true });
  writeFileSync(path.join(data, 'v2-migration.json'), saved);

  // the projects page lists the projects here, never the ones only in the location
  const listed = await projects.listProjects();
  assert.deepEqual(listed.map((p) => p.name).sort(), ['Gone', 'Grant', 'Paper', 'Thesis']);
  assert.equal(listed.find((p) => p.id === thesis.id).path, thesis.local);
  assert.equal(listed.find((p) => p.id === grantId).path, grant);
});

test('the notice shows until it’s dismissed, and the move runs once unless 1.10.4 mirrored since', async () => {
  const notice = await mirror.migrationNotice();
  assert.deepEqual(notice.inPlace.map((p) => p.name), ['Grant']);
  assert.equal(notice.mirrored.length, 3);
  // moved to this computer since: no longer used in place
  await projects.moveEntry(grantId, path.join(tmp, 'projects', 'Grant'));
  assert.deepEqual((await mirror.migrationNotice()).inPlace, []);
  await projects.moveEntry(grantId, grant);
  await mirror.dismissMigrationNotice();
  assert.equal(await mirror.migrationNotice(), null);
  const saved = JSON.parse(readFileSync(path.join(data, 'v2-migration.json'), 'utf8'));
  assert.ok(saved.ranAt && saved.dismissedAt);
  assert.equal(saved.mirrored.length, 3);

  // a later start reads what it found then, and looks at no cloud copy again
  write(path.join(paper.cloud, 'late.tex'), 'late\n');
  const again = await import(`${pathToFileURL(path.join(here, '..', 'src', 'services', 'mirrorService.js')).href}?again`);
  assert.deepEqual((await again.migrateToV2()).mirrored, saved.mirrored);
  assert.equal(await again.migrationNotice(), null);

  // unless 1.10.4, gone back to, has mirrored since, which rewrites a record each pass: then it looks again
  const later = new Date(Date.now() + 1000);
  await fs.utimes(path.join(data, 'mirror', `${paper.id}.json`), later, later);
  const third = await import(`${pathToFileURL(path.join(here, '..', 'src', 'services', 'mirrorService.js')).href}?third`);
  assert.deepEqual((await third.migrationNotice()).mirrored.find((m) => m.id === paper.id).changed, ['late.tex']);
});

test('a cloud copy 1.10 mirrored is never a project of its own, and its record outlasts Remove and goes aside on Locate…', async () => {
  const folder = await projects.openFolder(thesis.cloud).catch((err) => err);
  assert.equal(folder.statusCode, 409);
  assert.match(folder.message, /^This is the cloud copy of “Thesis” that Spectrum 1\.10 kept in step/);
  // a file the same in both opens in the project here; one that differs isn't shown as this computer's
  assert.deepEqual(await projects.openFile(path.join(paper.cloud, 'main.tex')), { projectId: paper.id, file: 'main.tex' });
  const differs = await projects.openFile(path.join(thesis.cloud, 'main.tex')).catch((err) => err);
  assert.equal(differs.statusCode, 409);
  assert.match(differs.message, /in the copy Spectrum 1\.10 kept in Synology Drive, which 2\.0 no longer keeps in step/);
  assert.equal((await projects.openFile(path.join(thesis.cloud, 'chapters', 'intro.tex')).catch((err) => err)).statusCode, 409, 'nor one only there');
  assert.equal((await projects.relocateProject(paper.id, thesis.cloud).catch((err) => err)).statusCode, 409);
  assert.equal(JSON.parse(readFileSync(path.join(thesis.cloud, '.spectrum', 'project.json'), 'utf8')).id, thesis.id);

  const records = await snapshot(path.join(data, 'mirror'));
  // Locate… to the same folder keeps it; to another copy puts it aside as it was, never deleted
  await projects.relocateProject(paper.id, paper.local);
  assert.deepEqual(await snapshot(path.join(data, 'mirror')), records);
  await fs.cp(paper.local, path.join(tmp, 'Paper copy'), { recursive: true });
  await projects.relocateProject(paper.id, path.join(tmp, 'Paper copy'));
  await projects.unregister(gone.id);
  const { [`${paper.id}.json`]: aside, ...kept } = records;
  assert.deepEqual(await snapshot(path.join(data, 'mirror')), kept);
  assert.deepEqual(await snapshot(path.join(data, 'mirror-aside')), { [`${paper.id}.json`]: aside });
  assert.equal(await mirror.readMirror(paper.id), null);
  assert.ok(await mirror.readMirror(gone.id));
});

test('a cloud copy whose project left the list, lost its folder or moved into it is the user’s again, as 1.10.4 has it', async () => {
  // Removed (taken out of the list before the first start) opens where it is, and leaves the notice
  const removedThere = await projects.openFolder(removed.cloud);
  assert.equal(removedThere.path, removed.cloud);
  // and the notice leaves out a project taken out of the list since (Gone, above)
  const entry = (p) => ({ id: p.id, name: p.name, label: 'Synology Drive', changed: [], deleted: [] });
  writeFileSync(path.join(data, 'v2-migration.json'), JSON.stringify({ ranAt: new Date(Date.now() + 60_000).toISOString(), mirrored: [entry({ ...gone, name: 'Gone' }), entry({ ...thesis, name: 'Thesis' })], inPlace: [] }));
  const fresh = await import(`${pathToFileURL(path.join(here, '..', 'src', 'services', 'mirrorService.js')).href}?listed`);
  assert.deepEqual((await fresh.migrationNotice()).mirrored.map((m) => m.name), ['Thesis']);
  // a project whose folder here is lost can be pointed at its cloud copy, and the copy's files open in it
  const lost = await both('Lost', { 'main.tex': 'lost\n' });
  await record(lost);
  rmSync(lost.local, { recursive: true });
  assert.equal((await projects.relocateProject(lost.id, lost.cloud)).path, lost.cloud);
  assert.deepEqual(await projects.openFile(path.join(lost.cloud, 'main.tex')), { projectId: lost.id, file: 'main.tex' });
  assert.equal(await mirror.readMirror(lost.id), null, 'the record is put aside, as 1.10.4 would forget it');
  assert.ok(existsSync(path.join(data, 'mirror-aside', `${lost.id}.json`)));
});
