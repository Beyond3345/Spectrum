// A project and templates shared between two computers through a sync folder: presence files, conflict copies,
// version history both computers write (and 1.7.0 still reads), settings and templates that follow the user.
// Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs, mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-sync-')));
const synced = path.join(tmp, 'SynologyDrive');
const shared = path.join(synced, '.spectrum-shared');
const templateDir = path.join(tmp, 'templates');
const machineId = crypto.randomUUID();
const otherId = crypto.randomUUID();
await fs.mkdir(path.join(tmp, 'data'), { recursive: true });
await fs.mkdir(synced);
await fs.writeFile(path.join(tmp, 'data', 'sync.json'), JSON.stringify({ machineId, machineName: 'MacBook', folders: [{ path: synced }], hidden: [] }));
// the services read these when they're first imported
process.env.SPECTRUM_DATA_DIR = path.join(tmp, 'data');
process.env.SPECTRUM_TEMPLATE_DIR = templateDir;
process.env.SPECTRUM_TEMPLATE_SEED_DIR = '';
const { conflictCopies } = await import('../src/utils/conflictCopies.js');
const presence = await import('../src/services/presenceService.js');
const versions = await import('../src/services/versionService.js');
const templates = await import('../src/services/templateService.js');
const { systemNames } = await import('../src/services/syncService.js');

after(() => rmSync(tmp, { recursive: true, force: true }));

const json = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const write = async (file, data) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
};
const project = async (name) => {
  const root = path.join(synced, name);
  await write(path.join(root, '.spectrum', 'project.json'), { id: crypto.randomUUID(), name });
  return root;
};
/** What a sync app does, roughly: each side's files go across, and of a file both changed (index.json) a's wins. */
async function syncFolders(a, b) {
  await fs.cp(a, b, { recursive: true, force: true });
  await fs.cp(b, a, { recursive: true, force: true });
}
const shiftClock = (ms) => {
  const real = Date.now;
  Date.now = () => real() + ms;
  return () => (Date.now = real);
};
/** The random digits of the version ids this "computer" makes. */
const randomDigits = (n) => {
  const real = crypto.randomInt;
  crypto.randomInt = () => n;
  return () => (crypto.randomInt = real);
};
// the shared paper's versions from each computer, for 1.7.0 to read below
const paper = {};

test('another computer shows as having the project open only while its file is fresh', async () => {
  const root = await project('Presence');
  const open = path.join(root, '.spectrum', 'open');
  assert.deepEqual(await presence.markOpen(root), []);
  const mine = await json(path.join(open, `${machineId}.json`));
  assert.equal(mine.host, 'MacBook');
  assert.deepEqual(mine.systemNames, await systemNames(), 'the system’s names, for OneDrive’s copies');

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await write(path.join(open, `${otherId}.json`), { host: 'DESKTOP-AB12CD', systemNames: ['DESKTOP-AB12CD'], since, at: new Date().toISOString() });
  // a stale one, left by a crash, and a sync app's conflict copy of a presence file
  await write(path.join(open, `${crypto.randomUUID()}.json`), { host: 'OLD-PC', since, at: new Date(Date.now() - 6 * 60 * 1000).toISOString() });
  await write(path.join(open, `${otherId}_DESKTOP_Oct-17-1042-2026_Conflict.json`), { host: 'COPY', since, at: new Date().toISOString() });
  assert.deepEqual(await presence.markOpen(root), [{ host: 'DESKTOP-AB12CD', since }]);
  // this computer's own "since" stays while it keeps the project open
  assert.equal((await json(path.join(open, `${machineId}.json`))).since, mine.since);

  await presence.markClosed(root);
  assert.ok(!existsSync(path.join(open, `${machineId}.json`)));
  assert.ok((await presence.knownMachineNames(root)).includes('DESKTOP-AB12CD'));
});

test('OneDrive’s copies go by the system’s name for a computer, never one typed in Settings', async () => {
  const root = await project('Names');
  await write(path.join(root, '.spectrum', 'open', `${otherId}.json`), { host: 'Work', systemNames: ['DESKTOP-AB12CD'], since: new Date().toISOString(), at: new Date().toISOString() });
  const names = await presence.knownMachineNames(root);
  assert.ok(names.includes('DESKTOP-AB12CD'));
  assert.ok(!names.includes('Work'));
  const files = ['cv.tex', 'cv-work.tex', 'main.tex', 'main-DESKTOP-AB12CD.tex'];
  assert.deepEqual(conflictCopies(files, names), { 'main-DESKTOP-AB12CD.tex': 'main.tex' });
});

test('conflict copies of each sync app are recognised, and ordinary names aren’t', () => {
  const files = [
    'main.tex',
    'main_Andy-PC_Jan-03-0901-2013_CaseConflict_1.tex',
    'chapters/intro.tex',
    'chapters/intro_DESKTOP-AB12CD_Oct-17-104233-2026_Conflict.tex',
    'my_notes.md',
    'my_notes_MacBook_Feb-28-2359-2026_Conflict.md',
    'refs.bib',
    'refs (Andy’s conflicted copy 2013-01-03).bib',
    'draft (old).tex',
    'draft (old) (conflicted copy 2023-01-01 (1)).tex',
    'figure (Case Conflict).png',
    'thesis.tex',
    'thesis-DESKTOP-AB12CD.tex',
    'thesis-desktop-ab12cd-2.tex',
    'paper-DESKTOP-AB12CD.tex',
    'report.tex',
    'report-final.tex',
    'notes_2026_draft.tex',
    'data_Jan-03.csv',
    'results (2).csv'
  ];
  assert.deepEqual(conflictCopies(files, ['DESKTOP-AB12CD', 'MacBook']), {
    'main_Andy-PC_Jan-03-0901-2013_CaseConflict_1.tex': 'main.tex',
    'chapters/intro_DESKTOP-AB12CD_Oct-17-104233-2026_Conflict.tex': 'chapters/intro.tex',
    'my_notes_MacBook_Feb-28-2359-2026_Conflict.md': 'my_notes.md',
    'refs (Andy’s conflicted copy 2013-01-03).bib': 'refs.bib',
    'draft (old) (conflicted copy 2023-01-01 (1)).tex': 'draft (old).tex',
    'figure (Case Conflict).png': 'figure.png',
    'thesis-DESKTOP-AB12CD.tex': 'thesis.tex',
    'thesis-desktop-ab12cd-2.tex': 'thesis.tex'
  });
  // OneDrive's dash only counts for a computer Spectrum has seen
  assert.deepEqual(conflictCopies(['report.tex', 'report-final.tex']), {});
});

test('two computers’ versions in one history: both listed on both, none overwritten', async () => {
  const mac = await project('Shared paper');
  const pc = path.join(tmp, 'pc', 'Shared paper');
  await write(path.join(mac, 'main.tex'), 'one\n');
  await versions.createVersion(mac, { label: 'Before the trip' });
  await syncFolders(mac, pc);

  // apart (the MacBook offline), in the same second: each saves the next version
  let back = randomDigits(0);
  await write(path.join(mac, 'main.tex'), 'one\ntwo on the Mac\n');
  const fromMac = (await versions.createVersion(mac, {})).version;
  back();
  back = randomDigits(500);
  await write(path.join(pc, 'main.tex'), 'one\ntwo on the PC\n');
  await write(path.join(pc, 'pc.png'), Buffer.from([1, 2, 3]));
  const fromPc = (await versions.createVersion(pc, {})).version;
  back();
  paper.fromPc = fromPc.id;
  assert.notEqual(fromMac.id, fromPc.id);
  assert.equal(fromMac.number, 2);
  assert.equal(fromPc.number, 2);

  await syncFolders(mac, pc);
  for (const root of [mac, pc]) {
    const list = await versions.listVersions(root);
    assert.deepEqual(list.map((v) => v.id), [fromPc.id, fromMac.id, list[2].id]);
    assert.deepEqual(list.map((v) => v.number), [3, 2, 1]);
    assert.equal(list[2].label, 'Before the trip');
  }
  assert.equal((await versions.readVersionFile(mac, fromPc.id, 'main.tex')).content, 'one\ntwo on the PC\n');
  await versions.restoreVersion(mac, fromPc.id);
  assert.equal(await fs.readFile(path.join(mac, 'main.tex'), 'utf8'), 'one\ntwo on the PC\n');

  // index.json, which 1.7.0 reads, lists every version, oldest first, under a nextId above them all
  const index = await json(path.join(mac, '.spectrum', 'history', 'index.json'));
  assert.deepEqual(index.versions.map((v) => v.id), (await versions.listVersions(mac)).map((v) => v.id).reverse());
  assert.ok(index.versions.every((v) => Number.isSafeInteger(v.id) && v.createdAt && v.summary));
  assert.ok(index.nextId > Math.max(...index.versions.map((v) => v.id)));
});

test('a version from another computer whose files haven’t all arrived isn’t half restored', async () => {
  const root = await project('Arriving');
  await write(path.join(root, 'main.tex'), 'first\n');
  const { version } = await versions.createVersion(root, {});
  const objects = path.join(root, '.spectrum', 'history', 'objects');
  for (const shard of await fs.readdir(objects)) await fs.rm(path.join(objects, shard), { recursive: true });
  await write(path.join(root, 'main.tex'), 'second\n');
  await assert.rejects(versions.restoreVersion(root, version.id), { statusCode: 409 });
  assert.equal(await fs.readFile(path.join(root, 'main.tex'), 'utf8'), 'second\n');
});

test('deleting a version keeps stored files another computer may still need for 90 days', async () => {
  const root = await project('Clean up');
  const made = [];
  for (const text of ['a\n', 'b\n', 'c\n', 'd\n']) {
    await write(path.join(root, 'main.tex'), text);
    made.push((await versions.createVersion(root, {})).version);
  }
  const objects = path.join(root, '.spectrum', 'history', 'objects');
  const count = async () => (await Promise.all((await fs.readdir(objects)).map((s) => fs.readdir(path.join(objects, s))))).flat().length;
  const days = (n) => n * 24 * 60 * 60 * 1000;

  await versions.deleteVersion(root, made[0].id);
  assert.equal(await count(), 4, 'a fresh stored file stays');
  // a laptop away for weeks may have made versions that use them
  let back = shiftClock(days(30));
  await versions.deleteVersion(root, made[1].id).finally(back);
  assert.equal(await count(), 4);
  // a manifest still arriving (half written) could use any stored file: nothing goes
  await write(path.join(root, '.spectrum', 'history', 'manifests', '99.json'), '{"files": {');
  back = shiftClock(days(91));
  try {
    await versions.deleteVersion(root, made[2].id);
    assert.equal(await count(), 4);
    await fs.rm(path.join(root, '.spectrum', 'history', 'manifests', '99.json'));
    await versions.deleteVersion(root, made[3].id);
    assert.equal(await count(), 0, '90 days on, no version uses them');
  } finally {
    back();
  }
});

test('a file that can’t be read is skipped, not removed, and a restore leaves it alone', { skip: process.platform === 'win32' && 'Windows has no unreadable mode' }, async () => {
  const root = await project('Offline');
  const online = path.join(root, 'online-only.tex');
  await write(path.join(root, 'main.tex'), 'a\n');
  await write(online, 'from the NAS\n');
  await versions.createVersion(root, {});
  await fs.chmod(online, 0o000);
  try {
    await write(path.join(root, 'main.tex'), 'b\n');
    const { version } = await versions.createVersion(root, {});
    assert.deepEqual(version.summary.files, ['main.tex'], 'not counted as removed');
    const manifest = await json(path.join(root, '.spectrum', 'history', 'manifests', `${version.id}.json`));
    assert.deepEqual(manifest.skipped, ['online-only.tex']);
    await fs.chmod(online, 0o644);
    await write(online, 'newer, downloaded since\n');
    await versions.restoreVersion(root, version.id);
    assert.equal(await fs.readFile(online, 'utf8'), 'newer, downloaded since\n');
  } finally {
    await fs.chmod(online, 0o644);
  }
});

// 1.7.0's own services, from git, with their imports pointed at this checkout's (the same since)
async function oldService(name) {
  const rev = process.env.SPECTRUM_OLD_REV || 'v1.7.0';
  let code;
  try {
    code = execFileSync('git', ['show', `${rev}:apps/backend/src/services/${name}.js`], { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
  const file = path.join(tmp, `${name}-1.7.0.mjs`);
  await fs.writeFile(file, code
    .replaceAll("'../utils/", `'${pathToFileURL(path.join(src, 'utils'))}/`)
    .replaceAll("'../config/", `'${pathToFileURL(path.join(src, 'config'))}/`)
    .replace("'./projectService.js'", `'${pathToFileURL(path.join(src, 'services', 'projectService.js'))}'`)
    .replace("from 'diff'", `from '${import.meta.resolve('diff')}'`));
  return import(pathToFileURL(file));
}
const old = await oldService('versionService');
const oldTemplates = await oldService('templateService');

test('1.7.0 lists and restores versions both computers made, and its own don’t clash', { skip: !old && 'no v1.7.0 in git (set SPECTRUM_OLD_REV)' }, async () => {
  const root = path.join(synced, 'Shared paper');
  const now = await versions.listVersions(root);
  const listed = await old.listVersions(root);
  assert.deepEqual(listed.map((v) => v.id), now.map((v) => v.id));
  const fromPc = now.find((v) => v.id === paper.fromPc);
  assert.deepEqual((await old.versionChanges(root, fromPc.id)).map((c) => c.path), ['main.tex', 'pc.png']);
  await fs.writeFile(path.join(root, 'main.tex'), 'changed in 1.7.0\n');
  await old.restoreVersion(root, fromPc.id);
  assert.equal(await fs.readFile(path.join(root, 'main.tex'), 'utf8'), 'one\ntwo on the PC\n');

  // back on this build: 1.7.0's own new version is listed too, and nothing was overwritten
  await fs.writeFile(path.join(root, 'main.tex'), 'written in 1.7.0\n');
  const made = (await old.createVersion(root, {})).version;
  const after = await versions.listVersions(root);
  assert.equal(after[0].id, made.id);
  assert.equal(after.length, now.length + 2, 'the restore’s safety version and the new one');
  assert.equal((await versions.readVersionFile(root, fromPc.id, 'main.tex')).content, 'one\ntwo on the PC\n');
});

test('a 1.7.0 history keeps its numbers here, and 1.7.0 carries on after this build’s versions', { skip: !old && 'no v1.7.0 in git (set SPECTRUM_OLD_REV)' }, async () => {
  const root = await project('From 1.7.0');
  for (const text of ['a\n', 'b\n']) {
    await write(path.join(root, 'main.tex'), text);
    await old.createVersion(root, { label: text.trim() });
  }
  await write(path.join(root, 'main.tex'), 'c\n');
  const mine = (await versions.createVersion(root, {})).version;
  assert.equal(mine.number, 3);
  await versions.renameVersion(root, 1, 'First draft');
  assert.deepEqual((await old.listVersions(root)).map((v) => [v.id, v.label]), [[mine.id, ''], [2, 'b'], [1, 'First draft']]);
  await write(path.join(root, 'main.tex'), 'd\n');
  const theirs = (await old.createVersion(root, {})).version;
  assert.ok(theirs.id > mine.id);
  assert.deepEqual((await versions.listVersions(root)).map((v) => [v.number, v.label]), [[4, ''], [3, ''], [2, 'b'], [1, 'First draft']]);
});

const noOld = !old && 'no v1.7.0 in git (set SPECTRUM_OLD_REV)';
const indexOf = (root) => path.join(root, '.spectrum', 'history', 'index.json');

test('a version whose manifest can’t be read keeps its details in index.json, and 1.7.0 keeps it', { skip: noOld || (process.platform === 'win32' && 'Windows has no unreadable mode') }, async () => {
  const root = await project('Online only');
  for (const text of ['a\n', 'b\n']) {
    await write(path.join(root, 'main.tex'), text);
    await old.createVersion(root, { label: `Sent ${text.trim()}` });
  }
  // online-only and offline, say
  const first = path.join(root, '.spectrum', 'history', 'manifests', '1.json');
  await fs.chmod(first, 0o000);
  try {
    await write(path.join(root, 'main.tex'), 'c\n');
    await versions.createVersion(root, { label: 'Offline save' });
  } finally {
    await fs.chmod(first, 0o644);
  }
  assert.deepEqual((await versions.listVersions(root)).map((v) => [v.number, v.label]), [[3, 'Offline save'], [2, 'Sent b'], [1, 'Sent a']]);
  assert.deepEqual((await old.listVersions(root)).map((v) => v.label), ['Offline save', 'Sent b', 'Sent a']);
  // and 1.7.0's clean-up keeps its stored files
  await old.deleteVersion(root, 2);
  assert.equal((await old.readVersionFile(root, 1, 'main.tex')).content, 'a\n');
});

test('an index.json that lost a sync conflict gets this build’s versions back, so 1.7.0 keeps them', { skip: noOld }, async () => {
  const root = await project('Lost race');
  await write(path.join(root, 'main.tex'), 'one\n');
  const first = (await versions.createVersion(root, { label: 'One' })).version;
  const behind = await fs.readFile(indexOf(root));
  await write(path.join(root, 'main.tex'), 'two\n');
  const second = (await versions.createVersion(root, { label: 'Two' })).version;
  // the other computer's index.json, from before the second version, wins
  await fs.writeFile(indexOf(root), behind);
  assert.deepEqual((await versions.listVersions(root)).map((v) => v.id), [second.id, first.id]);
  assert.deepEqual((await old.listVersions(root)).map((v) => v.label), ['Two', 'One']);
  await old.deleteVersion(root, first.id);
  assert.equal((await versions.readVersionFile(root, second.id, 'main.tex')).content, 'two\n');
  // history still arriving, its index.json not yet here: listing doesn't make one
  await fs.rm(indexOf(root));
  await versions.listVersions(root);
  assert.ok(!existsSync(indexOf(root)));
});

test('a label renamed in 1.7.0 stays once this build saves again', { skip: noOld }, async () => {
  const root = await project('Renamed in 1.7.0');
  await write(path.join(root, 'main.tex'), 'a\n');
  const { version } = await versions.createVersion(root, { label: 'draft' });
  const behind = await fs.readFile(indexOf(root));
  await old.renameVersion(root, version.id, 'Submitted to journal');
  assert.equal((await versions.listVersions(root))[0].label, 'Submitted to journal');
  await write(path.join(root, 'main.tex'), 'b\n');
  await versions.createVersion(root, {});
  assert.equal((await versions.listVersions(root))[1].label, 'Submitted to journal');
  assert.equal((await old.listVersions(root))[1].label, 'Submitted to journal');
  // and the manifest has it now, so it doesn't rest on index.json alone
  assert.equal((await json(path.join(root, '.spectrum', 'history', 'manifests', `${version.id}.json`))).label, 'Submitted to journal');
  // renamed here since: another computer's index.json that's behind isn't taken for a rename
  await versions.renameVersion(root, version.id, 'Final');
  await fs.writeFile(indexOf(root), behind);
  assert.equal((await versions.listVersions(root)).at(-1).label, 'Final');
});

test('a 1.7.0 version made from an index.json that’s behind gets a number of its own', { skip: noOld }, async () => {
  const root = await project('Same number');
  await write(path.join(root, 'main.tex'), 'a\n');
  await old.createVersion(root, {});
  const behind = await fs.readFile(indexOf(root));
  await write(path.join(root, 'main.tex'), 'b on the Mac\n');
  const mac = (await versions.createVersion(root, {})).version;
  assert.equal(mac.number, 2);
  // the PC, still on 1.7.0, saves from its index.json before the Mac's version came
  await fs.writeFile(indexOf(root), behind);
  await write(path.join(root, 'main.tex'), 'b on the PC\n');
  assert.equal((await old.createVersion(root, {})).version.id, 2);
  assert.deepEqual((await versions.listVersions(root)).map((v) => [v.id, v.number]), [[2, 3], [mac.id, 2], [1, 1]]);
});

test('settings follow the user without keys or paths, and only another computer’s count', async () => {
  assert.deepEqual(await presence.sharedSettings(), { shared: true, latest: null });
  const at = await presence.shareSettings({ theme: 'dark', llmApiKey: 'sk-secret', searchProviderKeys: { exa: 'k' }, providerSaved: {}, projectsDir: '/x', shortcuts: {} });
  const mine = await json(path.join(shared, 'settings', `${machineId}.json`));
  assert.deepEqual(mine, { updatedAt: at, machineName: 'MacBook', systemNames: await systemNames(), settings: { theme: 'dark', shortcuts: {} } });
  // this computer's own file isn't news to it
  assert.equal((await presence.sharedSettings()).latest, null);
  const theirs = { updatedAt: new Date(Date.now() + 1000).toISOString(), machineName: 'DESKTOP-AB12CD', settings: { theme: 'light' } };
  await write(path.join(shared, 'settings', `${otherId}.json`), theirs);
  await write(path.join(shared, 'settings', `${crypto.randomUUID()}.json`), { ...theirs, updatedAt: '2020-01-01T00:00:00.000Z' });
  assert.deepEqual((await presence.sharedSettings()).latest, theirs);
});

const sharedTemplates = path.join(shared, 'templates');
const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex');
const entry = (id, extra = {}) => ({ id, label: id, mainFile: 'main.tex', category: 'academic', description: id, tags: [], author: 'User', featured: false, ...extra });
const manifest = () => json(path.join(templateDir, 'manifest.json'));
const read = (...parts) => fs.readFile(path.join(...parts), 'utf8');
/** One the PC saved, as its sync app brings it. */
async function fromPc(id, text, extra) {
  await write(path.join(sharedTemplates, id, 'files', 'main.tex'), text);
  await write(path.join(sharedTemplates, id, 'template.json'), { ...entry(id), files: { 'main.tex': sha1(text) }, ...extra });
}
/** One made here as 1.7.0 makes them: a folder and a manifest entry, never stamped. */
async function madeHere(id, text) {
  await write(path.join(templateDir, id, 'main.tex'), text);
  const m = await manifest();
  await write(path.join(templateDir, 'manifest.json'), { ...m, templates: [...m.templates, entry(id)] });
}

test('templates follow the user both ways, deletions too, and only once they’ve fully synced', async () => {
  await write(path.join(templateDir, 'manifest.json'), { templates: [], categories: [{ id: 'all', label: 'All' }, { id: 'academic', label: 'Academic' }] });

  // saved here: mirrored with its files, and the local folder stays whole
  await write(path.join(templateDir, 'mine', 'main.tex'), 'mine\n');
  await templates.addTemplateToManifest(entry('mine'));
  const mine = await json(path.join(sharedTemplates, 'mine', 'template.json'));
  assert.deepEqual(mine.files, { 'main.tex': sha1('mine\n') });
  assert.ok(mine.origin);
  assert.equal(await read(sharedTemplates, 'mine', 'files', 'main.tex'), 'mine\n');
  assert.ok(existsSync(path.join(templateDir, 'mine', 'main.tex')));

  // saved on the PC: copied in once all its files are here
  const later = new Date(Date.now() + 60_000).toISOString();
  const origin = crypto.randomUUID();
  const files = { 'main.tex': sha1('theirs\n'), 'logo.png': sha1('png') };
  await write(path.join(sharedTemplates, 'theirs', 'template.json'), { ...entry('theirs'), updatedAt: later, origin, files });
  await write(path.join(sharedTemplates, 'theirs', 'files', 'main.tex'), 'theirs\n');
  await templates.syncTemplates();
  assert.ok(!(await templates.readTemplateManifest()).templates.some((t) => t.id === 'theirs'), 'logo.png hasn’t arrived');
  await write(path.join(sharedTemplates, 'theirs', 'files', 'logo.png'), 'png');
  await templates.syncTemplates();
  assert.deepEqual((await manifest()).templates.find((t) => t.id === 'theirs'), { ...entry('theirs'), updatedAt: later, origin, files });
  assert.equal(await read(templateDir, 'theirs', 'logo.png'), 'png');

  // deleted on the PC: gone here; deleted here: a tombstone for the PC
  await write(path.join(sharedTemplates, 'mine', 'template.json'), { id: 'mine', origin: mine.origin, deleted: true, updatedAt: later });
  await templates.syncTemplates();
  assert.ok(!existsSync(path.join(templateDir, 'mine')));
  assert.ok(!(await manifest()).templates.some((t) => t.id === 'mine'));
  await templates.deleteTemplate('theirs');
  const tombstone = await json(path.join(sharedTemplates, 'theirs', 'template.json'));
  assert.deepEqual([tombstone.deleted, tombstone.origin], [true, origin]);
  assert.ok(!existsSync(path.join(sharedTemplates, 'theirs', 'files')));

  // made on both before templates followed the user, and the same: one template from now on
  await madeHere('same', 'same\n');
  await fromPc('same', 'same\n', { updatedAt: later, origin });
  await templates.syncTemplates();
  assert.equal((await manifest()).templates.find((t) => t.id === 'same').origin, origin);
  assert.equal((await manifest()).templates.filter((t) => t.id.startsWith('same')).length, 1);
  // and one that isn't in the shared folder yet goes there
  await madeHere('old', 'old\n');
  await templates.syncTemplates();
  assert.equal(await read(sharedTemplates, 'old', 'files', 'main.tex'), 'old\n');
});

test('two templates with one id made apart are both kept, and neither is saved or deleted over the other', async () => {
  await madeHere('thesis', 'my thesis\n');
  const pc = crypto.randomUUID();
  await fromPc('thesis', 'their thesis\n', { updatedAt: new Date().toISOString(), origin: pc });
  await templates.syncTemplates();
  assert.equal(await read(templateDir, 'thesis', 'main.tex'), 'their thesis\n');
  const moved = (await manifest()).templates.find((t) => t.label === 'thesis (MacBook)');
  assert.equal(moved?.id, 'thesis-macbook');
  assert.notEqual(moved.origin, pc);
  assert.equal(await read(templateDir, moved.id, 'main.tex'), 'my thesis\n');
  assert.equal(await read(sharedTemplates, moved.id, 'files', 'main.tex'), 'my thesis\n');

  // saved here: the PC's stays as it is
  await write(path.join(templateDir, moved.id, 'main.tex'), 'my thesis, edited\n');
  await templates.addTemplateToManifest(moved);
  assert.equal(await read(sharedTemplates, 'thesis', 'files', 'main.tex'), 'their thesis\n');
  assert.equal(await read(sharedTemplates, moved.id, 'files', 'main.tex'), 'my thesis, edited\n');

  // the PC deletes its own: only that one goes, and another template's deletion under this one's id deletes nothing
  const later = new Date(Date.now() + 60_000).toISOString();
  await write(path.join(sharedTemplates, 'thesis', 'template.json'), { id: 'thesis', origin: pc, deleted: true, updatedAt: later });
  await write(path.join(sharedTemplates, moved.id, 'template.json'), { id: moved.id, origin: crypto.randomUUID(), deleted: true, updatedAt: later });
  await templates.syncTemplates();
  assert.ok(!existsSync(path.join(templateDir, 'thesis')));
  assert.equal(await read(templateDir, moved.id, 'main.tex'), 'my thesis, edited\n');
  assert.equal(await read(sharedTemplates, moved.id, 'files', 'main.tex'), 'my thesis, edited\n', 'shared again');

  // stamped on both before the shared folder synced, with the same files: still one template
  await write(path.join(templateDir, 'twin', 'main.tex'), 'twin\n');
  await templates.addTemplateToManifest(entry('twin'));
  await fromPc('twin', 'twin\n', { updatedAt: later, origin: crypto.randomUUID() });
  await templates.syncTemplates();
  assert.deepEqual((await manifest()).templates.filter((t) => t.id.startsWith('twin')).map((t) => t.id), ['twin']);
});

test('a template changed in 1.7.0 is shared, and kept beside the PC’s when that changed too', async () => {
  await write(path.join(templateDir, 'lab', 'main.tex'), 'lab\n');
  await templates.addTemplateToManifest(entry('lab'));
  const first = await json(path.join(sharedTemplates, 'lab', 'template.json'));
  // a save in 1.7.0 (or, without it in git, what that save leaves): the files change, the entry keeps this build's date
  const in170 = async (text) => {
    await write(path.join(templateDir, 'lab', 'main.tex'), text);
    if (oldTemplates) await oldTemplates.addTemplateToManifest((await oldTemplates.readTemplateManifest()).templates.find((t) => t.id === 'lab'));
  };
  await in170('lab, edited in 1.7.0\n');
  assert.equal((await manifest()).templates.find((t) => t.id === 'lab').updatedAt, first.updatedAt);
  await templates.syncTemplates();
  assert.equal(await read(sharedTemplates, 'lab', 'files', 'main.tex'), 'lab, edited in 1.7.0\n');

  // again, while the PC saved it as well
  await in170('lab, edited in 1.7.0 again\n');
  await fromPc('lab', 'lab, edited on the PC\n', { updatedAt: new Date(Date.now() + 60_000).toISOString(), origin: first.origin });
  await templates.syncTemplates();
  assert.equal(await read(templateDir, 'lab', 'main.tex'), 'lab, edited on the PC\n');
  assert.equal(await read(templateDir, 'lab-macbook', 'main.tex'), 'lab, edited in 1.7.0 again\n');
  if (oldTemplates) {
    const listed = (await oldTemplates.readTemplateManifest()).templates.map((t) => t.id);
    for (const id of ['lab', 'lab-macbook', 'thesis-macbook', 'same', 'old']) assert.ok(listed.includes(id), `1.7.0 lists ${id}`);
  }
});
