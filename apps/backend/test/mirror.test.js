// Mirrored cloud projects: a project here kept in step with its copy in a cloud location, file by file; what a pass
// does with each file, the guards that keep a missing or half-seen side from reading as everything deleted, the app's
// own files, and two computers (two data folders) sharing one cloud copy, their passes taking turns. Against a fake
// home folder and scratch data folders, never the real sync folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WINDOWS = process.platform === 'win32';
const here = path.dirname(fileURLToPath(import.meta.url));
// native: Windows' temp folder can have an 8.3 name in it (RUNNER~1), which the app's realpath spells out
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-mirror-')));
const home = path.join(tmp, 'home');
// a classic Synology Drive task, whose marker gives the location its name on every system
const location = path.join(home, 'SynologyDrive');
const LABEL = 'Synology Drive';
mkdirSync(path.join(location, '.SynologyWorkingDirectory'), { recursive: true });
/** A computer's data folder, with the location set up in it. */
const dataDir = (name) => {
  const dir = path.join(tmp, `data-${name}`);
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'sync.json'), JSON.stringify({ machineId: crypto.randomUUID(), machineName: name, folders: [{ path: location }], hidden: [] }));
  return dir;
};
// before the app's modules load
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  // somewhere that isn't there, so Windows' registry isn't asked for the real one
  OneDrive: path.join(home, 'OneDrive'),
  APPDATA: path.join(home, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  SPECTRUM_DATA_DIR: dataDir('MacBook'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
delete process.env.OneDriveCommercial;
delete process.env.OneDriveConsumer;
const mirrorUrl = pathToFileURL(path.join(here, '..', 'src', 'services', 'mirrorService.js')).href;
const mirror = await import(mirrorUrl);
const { copyProject, preflight } = await import('../src/utils/projectCopy.js');
const versions = await import('../src/services/versionService.js');
const { conflictCopies } = await import('../src/utils/conflictCopies.js');

// this computer's project folders by id, as the registry would give them
const roots = new Map();
// what went to the Bin: [{ abs, cloud }]; binFails: the cloud side's volume has none
const binned = [];
let binFails = false;
// run as a file goes to the Bin, which a pass does before anything else: to change a file mid-pass
let onBin = null;
mirror.mirrorHooks({
  rootOf: async (id) => {
    const root = roots.get(id);
    if (!root || !existsSync(path.join(root, '.spectrum', 'project.json'))) throw Object.assign(new Error('Folder missing.'), { code: 'PROJECT_MISSING' });
    return root;
  },
  toBin: async (abs, cloud) => {
    if (cloud && binFails) throw new Error('No Bin on this volume.');
    binned.push({ abs, cloud, text: readFileSync(abs, 'utf8') });
    await fs.rm(abs);
    await onBin?.();
  }
});

const workers = [];
after(async () => {
  mirror.stopMirroring();
  await Promise.all(workers.map((w) => w.terminate()));
  rmSync(tmp, { recursive: true, force: true });
});

const write = async (file, data) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
};
const read = (file) => readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const meta = (root) => json(path.join(root, '.spectrum', 'project.json'));
const writeMeta = (root, data) => write(path.join(root, '.spectrum', 'project.json'), JSON.stringify(data, null, 2));
/** Every file under root, '/'-separated, but this computer's presence. */
const tree = (root, rel = '') =>
  readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? tree(root, r) : [r];
  }).sort();
const userFiles = (root) => tree(root).filter((r) => !r.startsWith('.spectrum/'));
const sameTree = (a, b) => assert.deepEqual(tree(a).filter((r) => !r.startsWith('.spectrum/open/')), tree(b).filter((r) => !r.startsWith('.spectrum/open/')));

/** A project here, as Spectrum makes one: [{ id, root, cloud }]. */
async function project(name, files = {}) {
  const root = path.join(tmp, 'mac', name);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await writeMeta(root, { id, name, createdAt: now, updatedAt: now, tags: [], archived: false, fileOrder: {} });
  for (const [rel, text] of Object.entries(files)) await write(path.join(root, rel), text);
  roots.set(id, root);
  return { id, root, name, cloud: path.join(location, name) };
}

/** Sync to: the project copied into the location and mirrored there, then its first pass. */
async function syncTo(p) {
  const { files } = await copyProject(p.root, p.cloud);
  await mirror.linkMirror(p.id, { location, rel: p.name, files });
  return mirror.syncProject(p.id);
}

const synced = (status) => assert.equal(status?.state, 'synced', JSON.stringify(status));
const latestLabels = async (root) => (await versions.listVersions(root)).map((v) => v.label);

test('Sync to copies the project, leaving this computer’s presence out, and the first pass changes nothing', async () => {
  const p = await project('First', { 'main.tex': '\\documentclass{article}\n', 'figs/a.png': 'PNG' });
  await write(path.join(p.root, '.spectrum', 'open', 'me.json'), '{}');
  await versions.createVersion(p.root, { label: 'One' });
  assert.equal(mirror.mirrorStatus(p.id).state, 'syncing');
  synced(await syncTo(p));
  assert.ok(!existsSync(path.join(p.cloud, '.spectrum', 'open')));
  assert.deepEqual(tree(p.cloud), tree(p.root).filter((r) => !r.startsWith('.spectrum/open/')));
  assert.equal(meta(p.cloud).id, p.id);
  const record = await mirror.readMirror(p.id);
  assert.equal(record.rel, 'First');
  assert.ok(record.files['figs/a.png'].l && record.files['figs/a.png'].c, 'each side’s stat in the base');
  assert.ok(!Object.keys(record.files).some((k) => k.includes('/objects/')), 'objects go by name, not in the base');
  assert.deepEqual(await mirror.listMirrored(), [{ id: p.id, location, rel: 'First' }]);
  assert.deepEqual(await mirror.cloudCopyOwner(path.join(p.cloud, 'figs', 'a.png')), { id: p.id, rel: 'figs/a.png' });
  assert.equal(await mirror.cloudCopyOwner(path.join(location, 'Other', 'x.tex')), null);
  assert.equal(mirror.mirrorStatus(p.id).state, 'synced');
});

test('each file gets what its row says: copied, deleted, the changed one kept over a deletion', async () => {
  const files = Object.fromEntries(['same', 'here', 'there', 'goneHere', 'goneThere', 'keptHere', 'keptThere', 'bothGone'].map((n) => [`${n}.tex`, `${n}\n`]));
  const p = await project('Table', files);
  // so this computer's history holds them all
  await versions.createVersion(p.root);
  synced(await syncTo(p));
  const L = (f) => path.join(p.root, f);
  const C = (f) => path.join(p.cloud, f);
  await write(L('here.tex'), 'here, changed here\n');
  await write(C('there.tex'), 'there, changed there\n');
  await fs.rm(L('goneHere.tex'));
  await fs.rm(C('goneThere.tex'));
  await fs.rm(L('keptHere.tex'));
  await write(C('keptHere.tex'), 'keptHere, changed there\n');
  await fs.rm(C('keptThere.tex'));
  await write(L('keptThere.tex'), 'keptThere, changed here\n');
  await fs.rm(L('bothGone.tex'));
  await fs.rm(C('bothGone.tex'));
  await write(L('new/newHere.tex'), 'new here\n');
  await write(C('new/newThere.tex'), 'new there\n');
  await write(L('bothNew.tex'), 'the same\n');
  await write(C('bothNew.tex'), 'the same\n');
  synced(await mirror.syncProject(p.id));
  assert.deepEqual(userFiles(p.cloud), userFiles(p.root));
  assert.deepEqual(userFiles(p.root), ['bothNew.tex', 'here.tex', 'keptHere.tex', 'keptThere.tex', 'new/newHere.tex', 'new/newThere.tex', 'same.tex', 'there.tex']);
  for (const [f, text] of [['here.tex', 'here, changed here\n'], ['there.tex', 'there, changed there\n'], ['keptHere.tex', 'keptHere, changed there\n'], ['keptThere.tex', 'keptThere, changed here\n'], ['same.tex', 'same\n']]) {
    assert.equal(read(L(f)), text, f);
    assert.equal(read(C(f)), text, f);
  }
  // deleted for good, as this computer's versions hold them: the one deleted there by the "Before sync" version
  assert.deepEqual(binned, []);
  assert.ok((await latestLabels(p.root)).includes(`Before sync from ${LABEL}`));
  const [before] = await versions.listVersions(p.root);
  assert.equal((await versions.readVersionFile(p.root, before.id, 'goneThere.tex')).content, 'goneThere\n');
  assert.ok(!(await mirror.readMirror(p.id)).files['bothgone.tex']);
  // the version goes across with the next pass, and then there's nothing left to do
  synced(await mirror.syncProject(p.id));
  sameTree(p.root, p.cloud);
});

test('a file changed on both sides merges by lines, or stays this computer’s with the cloud’s beside it', async () => {
  const paper = '\\section{One}\nFirst.\n\n\\section{Two}\nSecond.\n\n\\section{Three}\nThird.\n';
  const p = await project('Both', { 'main.tex': paper, 'notes.tex': 'one line\n', 'pic.png': 'PNG base', 'paper.tex': '\\documentclass{article}\n', 'paper.pdf': '%PDF base' });
  synced(await syncTo(p));
  const L = (f) => path.join(p.root, f);
  const C = (f) => path.join(p.cloud, f);
  await write(L('main.tex'), paper.replace('First.', 'First, here.'));
  await write(C('main.tex'), paper.replace('Third.', 'Third, there.'));
  await write(L('notes.tex'), 'the line, here\n');
  await write(C('notes.tex'), 'the line, there\n');
  await write(L('pic.png'), 'PNG here');
  await write(C('pic.png'), 'PNG there');
  await write(L('paper.pdf'), '%PDF here');
  await write(C('paper.pdf'), '%PDF there');
  synced(await mirror.syncProject(p.id));
  const merged = paper.replace('First.', 'First, here.').replace('Third.', 'Third, there.');
  assert.equal(read(L('main.tex')), merged);
  assert.equal(read(C('main.tex')), merged);
  // conflicts: this computer's on both sides, the cloud's beside it here
  assert.equal(read(C('notes.tex')), 'the line, here\n');
  assert.equal(read(C('pic.png')), 'PNG here');
  const copies = conflictCopies(userFiles(p.root));
  assert.deepEqual(Object.values(copies).sort(), ['notes.tex', 'pic.png']);
  for (const [copy, original] of Object.entries(copies)) {
    assert.match(copy, new RegExp(`^${original.replace(/\..*$/, '')} \\(${LABEL}’s conflicted copy \\d{4}-\\d\\d-\\d\\d \\d{6}\\)\\.`));
    assert.equal(read(L(copy)), { 'notes.tex': 'the line, there\n', 'pic.png': 'PNG there' }[original]);
  }
  // a compiled PDF: this computer's, with no copy
  assert.equal(read(C('paper.pdf')), '%PDF here');
  // the copies go across with the next pass
  synced(await mirror.syncProject(p.id));
  sameTree(p.root, p.cloud);
});

test('a missing, moved or emptied side never reads as everything deleted', async () => {
  const p = await project('Guarded', { 'main.tex': 'main\n', 'figs/a.png': 'a', 'figs/b.png': 'b' });
  synced(await syncTo(p));
  const files = userFiles(p.root);

  // this computer's folder moved away: Folder missing, the cloud copy left alone
  await fs.rename(p.root, `${p.root}-moved`);
  assert.deepEqual(await mirror.syncProject(p.id), { state: 'missing', message: 'Folder missing' });
  assert.deepEqual(userFiles(p.cloud), files);
  await fs.rename(`${p.root}-moved`, p.root);

  // the location not there (the drive not plugged in, the app signed out)
  await fs.rename(location, `${location}-away`);
  assert.deepEqual(await mirror.syncProject(p.id), { state: 'waiting', message: `Waiting for ${LABEL}` });
  await fs.rename(`${location}-away`, location);
  assert.deepEqual(userFiles(p.root), files);

  // renamed in the location: followed
  await fs.mkdir(path.join(location, 'Moved'));
  await fs.rename(p.cloud, path.join(location, 'Moved', 'Guarded 2'));
  await write(path.join(location, 'Moved', 'Guarded 2', 'new.tex'), 'new\n');
  synced(await mirror.syncProject(p.id));
  assert.equal((await mirror.readMirror(p.id)).rel, 'Moved/Guarded 2');
  assert.equal(read(path.join(p.root, 'new.tex')), 'new\n');
  const cloud = path.join(location, 'Moved', 'Guarded 2');

  // gone from the location, or an empty folder where it was: Not in the location, never unlinked or deleted here
  await fs.rename(cloud, path.join(tmp, 'Guarded-out'));
  await fs.mkdir(cloud);
  assert.deepEqual(await mirror.syncProject(p.id), { state: 'not-found', message: `Not in ${LABEL}` });
  assert.ok(await mirror.readMirror(p.id));
  assert.deepEqual(userFiles(p.root), [...files, 'new.tex'].sort());
  await fs.rmdir(cloud);
  await fs.rename(path.join(tmp, 'Guarded-out'), cloud);
  synced(await mirror.syncProject(p.id));

  // another project's id on either side: needs attention, and the id never goes across
  const theirs = meta(cloud);
  await writeMeta(cloud, { ...theirs, id: crypto.randomUUID() });
  await fs.rm(path.join(p.root, 'main.tex'));
  assert.equal((await mirror.syncProject(p.id)).state, 'attention');
  assert.ok(existsSync(path.join(cloud, 'main.tex')));
  await writeMeta(cloud, theirs);
  const mine = meta(p.root);
  await writeMeta(p.root, { ...mine, id: crypto.randomUUID() });
  assert.equal((await mirror.syncProject(p.id)).state, 'attention');
  assert.equal(meta(cloud).id, p.id);
  await writeMeta(p.root, mine);
  await write(path.join(p.root, 'main.tex'), 'main\n');
  synced(await mirror.syncProject(p.id));
});

test('a cloud copy going while a pass walks it is waited for, never taken for deletions', async () => {
  const p = await project('Going', { 'main.tex': 'main\n', 'figs/a.png': 'a', 'figs/b.png': 'b' });
  await versions.createVersion(p.root);
  synced(await syncTo(p));
  const before = tree(p.root);
  const { readdir } = fs;
  // the sync app removing it file by file, project.json first, just after the pass read it
  fs.readdir = async (dir, ...rest) => {
    if (dir === p.cloud) {
      fs.readdir = readdir;
      await fs.rm(path.join(p.cloud, '.spectrum', 'project.json'));
      await fs.rm(path.join(p.cloud, 'figs'), { recursive: true });
    }
    return readdir(dir, ...rest);
  };
  try {
    assert.deepEqual(await mirror.syncProject(p.id), { state: 'waiting', message: `Waiting for ${LABEL}` });
  } finally {
    fs.readdir = readdir;
  }
  assert.deepEqual(tree(p.root), before);
  assert.deepEqual(binned, []);
});

test('Windows’ placeholders, which its readdir calls links, are walked into as what they are', async () => {
  const p = await project('Placeholders', { 'main.tex': 'main\n', 'chapters/one.tex': 'one\n' });
  synced(await syncTo(p));
  const { readdir } = fs;
  // as libuv types every reparse point, OneDrive's and Dropbox's placeholders among them
  const asLink = (e) => ({ name: e.name, isSymbolicLink: () => true, isDirectory: () => false, isFile: () => false });
  fs.readdir = async (dir, options) => {
    const entries = await readdir(dir, options);
    return options?.withFileTypes && String(dir).startsWith(p.cloud) ? entries.map(asLink) : entries;
  };
  try {
    await write(path.join(p.root, 'main.tex'), 'main, edited\n');
    synced(await mirror.syncProject(p.id));
  } finally {
    fs.readdir = readdir;
  }
  assert.deepEqual(userFiles(p.root), ['chapters/one.tex', 'main.tex']);
  assert.ok(existsSync(path.join(p.root, '.spectrum', 'project.json')));
  assert.equal(read(path.join(p.cloud, 'main.tex')), 'main, edited\n');
});

test('a folder that can’t be read stops the pass before anything is deleted', { skip: WINDOWS || process.getuid?.() === 0 }, async () => {
  const p = await project('Locked', { 'main.tex': 'main\n', 'figs/a.png': 'a' });
  synced(await syncTo(p));
  await fs.chmod(path.join(p.cloud, 'figs'), 0o000);
  try {
    assert.deepEqual(await mirror.syncProject(p.id), { state: 'attention', message: `Spectrum needs access to ${LABEL}.` });
  } finally {
    await fs.chmod(path.join(p.cloud, 'figs'), 0o755);
  }
  assert.equal(read(path.join(p.root, 'figs', 'a.png')), 'a');
  synced(await mirror.syncProject(p.id));
});

test('deleting a good part of a side waits for Sync anyway', async () => {
  const files = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`ch${i}.tex`, `chapter ${i}\n`]));
  const p = await project('Brake', files);
  await versions.createVersion(p.root);
  synced(await syncTo(p));
  for (let i = 0; i < 8; i++) await fs.rm(path.join(p.cloud, `ch${i}.tex`));
  await write(path.join(p.cloud, 'new.tex'), 'new\n');
  const status = await mirror.syncProject(p.id);
  assert.equal(status.state, 'attention');
  assert.match(status.message, /would delete 8 files on this computer/);
  // the rest still goes across
  assert.equal(read(path.join(p.root, 'new.tex')), 'new\n');
  assert.equal(userFiles(p.root).length, 11);
  assert.equal((await mirror.syncProject(p.id)).state, 'attention', 'still waiting');
  synced(await mirror.syncProject(p.id, { force: true }));
  assert.deepEqual(userFiles(p.root), ['ch8.tex', 'ch9.tex', 'new.tex']);
});

test('a name changed only in letter case is renamed on the other side, both ways', async () => {
  const p = await project('Case', { 'Intro.tex': 'intro\n', 'Figs/a.png': 'a' });
  synced(await syncTo(p));
  await fs.rename(path.join(p.root, 'Intro.tex'), path.join(p.root, 'intro.tex'));
  await fs.rename(path.join(p.root, 'Figs'), path.join(p.root, 'figs'));
  synced(await mirror.syncProject(p.id));
  assert.deepEqual(userFiles(p.cloud), ['figs/a.png', 'intro.tex']);
  assert.equal(read(path.join(p.cloud, 'intro.tex')), 'intro\n');
  await fs.rename(path.join(p.cloud, 'intro.tex'), path.join(p.cloud, 'INTRO.tex'));
  synced(await mirror.syncProject(p.id));
  assert.deepEqual(userFiles(p.root), ['INTRO.tex', 'figs/a.png']);
  synced(await mirror.syncProject(p.id));
  assert.deepEqual(userFiles(p.root), ['INTRO.tex', 'figs/a.png'], 'and it stays that way');
  assert.deepEqual(userFiles(p.cloud), ['INTRO.tex', 'figs/a.png']);
});

test('a name in another Unicode form is the same file on both sides', async () => {
  const nfc = 'Caf\u00e9.tex';
  const nfd = 'Cafe\u0301.tex';
  const p = await project('Unicode', { [nfc]: 'café\n' });
  await write(path.join(p.cloud, nfd), 'café\n');
  await fs.cp(path.join(p.root, '.spectrum'), path.join(p.cloud, '.spectrum'), { recursive: true });
  await mirror.linkMirror(p.id, { location, rel: p.name });
  synced(await mirror.syncProject(p.id));
  assert.deepEqual(userFiles(p.cloud).map((n) => n.normalize('NFC')), [nfc]);
  await write(path.join(p.root, nfc), 'café, changed\n');
  synced(await mirror.syncProject(p.id));
  assert.deepEqual(userFiles(p.cloud).map((n) => n.normalize('NFC')), [nfc], 'no second file');
  assert.equal(read(path.join(p.cloud, userFiles(p.cloud)[0])), 'café, changed\n');
});

test('an iCloud Drive stand-in is a file not readable yet, never a deletion', async () => {
  const p = await project('Evicted', { 'big.tex': 'big\n', 'main.tex': 'main\n' });
  synced(await syncTo(p));
  await fs.rm(path.join(p.cloud, 'big.tex'));
  await write(path.join(p.cloud, '.big.tex.icloud'), 'bplist');
  synced(await mirror.syncProject(p.id));
  assert.equal(read(path.join(p.root, 'big.tex')), 'big\n');
  assert.ok(!existsSync(path.join(p.root, '.big.tex.icloud')), 'the stand-in isn’t copied');
  synced(await mirror.syncProject(p.id));
  // three passes running: the user is asked to keep it on this device
  const status = await mirror.syncProject(p.id);
  assert.equal(status.state, 'attention');
  assert.match(status.message, /“big\.tex” is online-only, and Synology Drive can’t download it right now/);
  await fs.rm(path.join(p.cloud, '.big.tex.icloud'));
  await write(path.join(p.cloud, 'big.tex'), 'big\n');
  synced(await mirror.syncProject(p.id));
});

test('the app’s own files: objects come back, project.json and chats merge, and never a conflicted copy', async () => {
  const p = await project('App', { 'main.tex': 'main\n' });
  const chat = { id: 'c1', title: 'Help', mode: 'assistant', updatedAt: '2026-10-01T00:00:00.000Z', messages: [{ role: 'user', createdAt: '1', content: 'one' }] };
  await write(path.join(p.root, '.spectrum', 'chats', 'c1.json'), JSON.stringify(chat));
  await versions.createVersion(p.root, { label: 'Start' });
  synced(await syncTo(p));
  const objects = (root) => tree(root).filter((r) => r.includes('/objects/'));
  const [object] = objects(p.root);

  // an object deleted on either side (1.7.0's clean-up, say) comes back from the other
  await fs.rm(path.join(p.root, object));
  synced(await mirror.syncProject(p.id));
  assert.ok(existsSync(path.join(p.root, object)));
  await fs.rm(path.join(p.cloud, object));
  synced(await mirror.syncProject(p.id));
  assert.ok(existsSync(path.join(p.cloud, object)));

  // project.json changed on both: each field from the side that changed it, the id never
  await writeMeta(p.root, { ...meta(p.root), name: 'Renamed here', tags: ['here'] });
  await writeMeta(p.cloud, { ...meta(p.cloud), tags: ['there'], mainFile: 'main.tex' });
  // a chat continued on both
  const said = (who) => ({ ...chat, messages: [...chat.messages, { role: 'user', createdAt: who, content: who }] });
  await write(path.join(p.root, '.spectrum', 'chats', 'c1.json'), JSON.stringify(said('here')));
  await write(path.join(p.cloud, '.spectrum', 'chats', 'c1.json'), JSON.stringify(said('there')));
  // and index.json on both: this computer's, which listVersions keeps whole
  await write(path.join(p.root, 'main.tex'), 'main, changed\n');
  await versions.createVersion(p.root, { label: 'Here' });
  await write(path.join(p.cloud, '.spectrum', 'history', 'index.json'), JSON.stringify({ nextId: 1, versions: [] }));
  synced(await mirror.syncProject(p.id));
  for (const root of [p.root, p.cloud]) {
    const m = meta(root);
    assert.equal(m.id, p.id);
    assert.equal(m.name, 'Renamed here');
    assert.deepEqual(m.tags, ['here'], 'both changed tags: this computer’s');
    assert.equal(m.mainFile, 'main.tex');
    assert.deepEqual(json(path.join(root, '.spectrum', 'chats', 'c1.json')).messages.map((x) => x.content), ['one', 'there', 'here']);
  }
  assert.ok(json(path.join(p.cloud, '.spectrum', 'history', 'index.json')).versions.length >= 2);
  synced(await mirror.syncProject(p.id));
  sameTree(p.root, p.cloud);
  assert.deepEqual(Object.keys(conflictCopies(tree(p.root))), []);
  assert.ok(!tree(p.root).some((r) => r.includes('conflicted copy')));
  assert.ok(!existsSync(path.join(p.cloud, '.spectrum', 'open')));
});

test('a deletion goes to the Bin unless this computer’s history holds the file', async () => {
  const p = await project('Bin', { 'main.tex': '\\documentclass{article}\n', 'main.pdf': '%PDF', 'old.tex': 'old\n', 'older.tex': 'older\n' });
  const chat = { id: 'c2', messages: [] };
  await write(path.join(p.root, '.spectrum', 'chats', 'c2.json'), JSON.stringify(chat));
  synced(await syncTo(p));
  // deleted here, never in a version: the cloud's copy goes to the Bin
  await fs.rm(path.join(p.root, 'old.tex'));
  synced(await mirror.syncProject(p.id));
  assert.deepEqual(binned.splice(0), [{ abs: path.join(p.cloud, 'old.tex'), cloud: true, text: 'old\n' }]);
  // and with no Bin on that volume, into the location's .spectrum-bin
  binFails = true;
  await fs.rm(path.join(p.root, 'older.tex'));
  try {
    synced(await mirror.syncProject(p.id));
  } finally {
    binFails = false;
  }
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(read(path.join(location, '.spectrum-bin', day, 'Bin', 'older.tex')), 'older\n');
  // deleted there: a compiled PDF versions leave out, and a chat, go to the Bin here
  await fs.rm(path.join(p.cloud, 'main.pdf'));
  await fs.rm(path.join(p.cloud, '.spectrum', 'chats', 'c2.json'));
  synced(await mirror.syncProject(p.id));
  assert.deepEqual(binned.splice(0).map((b) => [path.relative(p.root, b.abs).split(path.sep).join('/'), b.cloud]).sort(), [['.spectrum/chats/c2.json', false], ['main.pdf', false]]);
  synced(await mirror.syncProject(p.id));
  sameTree(p.root, p.cloud);
});

test('a file changed here after the walk isn’t written over, and its edit comes through after', async () => {
  const p = await project('Recheck', { 'main.tex': '\\documentclass{article}\n', 'main.pdf': '%PDF', 'b.tex': 'b\n' });
  synced(await syncTo(p));
  await fs.rm(path.join(p.cloud, 'main.pdf'));
  await write(path.join(p.cloud, 'b.tex'), 'b, there\n');
  onBin = () => write(path.join(p.root, 'b.tex'), 'b, typed here meanwhile\n');
  try {
    synced(await mirror.syncProject(p.id));
  } finally {
    onBin = null;
  }
  binned.splice(0);
  assert.equal(read(path.join(p.root, 'b.tex')), 'b, typed here meanwhile\n');
  assert.equal(read(path.join(p.cloud, 'b.tex')), 'b, there\n');
  // both changed now: this computer's, and the cloud's beside it
  synced(await mirror.syncProject(p.id));
  assert.equal(read(path.join(p.cloud, 'b.tex')), 'b, typed here meanwhile\n');
  assert.deepEqual(Object.values(conflictCopies(userFiles(p.root))), ['b.tex']);
});

test('a "Before sync" version comes before what this computer wrote is replaced, and for the cloud’s at most every 10 minutes', async () => {
  const p = await project('Versions', { 'main.tex': 'one\n' });
  synced(await syncTo(p));
  const count = async () => (await latestLabels(p.root)).filter((l) => l.startsWith('Before sync')).length;
  // this computer wrote it
  await write(path.join(p.cloud, 'main.tex'), 'two\n');
  synced(await mirror.syncProject(p.id));
  assert.equal(await count(), 1);
  // as it came from the cloud: not again within 10 minutes
  await write(path.join(p.cloud, 'main.tex'), 'three\n');
  synced(await mirror.syncProject(p.id));
  assert.equal(await count(), 1);
  const real = Date.now;
  Date.now = () => real() + 11 * 60 * 1000;
  try {
    await write(path.join(p.cloud, 'main.tex'), 'four\n');
    synced(await mirror.syncProject(p.id));
  } finally {
    Date.now = real;
  }
  assert.equal(await count(), 2);
  const [latest] = await versions.listVersions(p.root);
  assert.equal((await versions.readVersionFile(p.root, latest.id, 'main.tex')).content, 'three\n');
  assert.equal(read(path.join(p.root, 'main.tex')), 'four\n');
});

test('a first pass with no base keeps everything from both sides and deletes nothing', async () => {
  const p = await project('Union', { 'here.tex': 'here\n', 'both.tex': 'both, here\n', 'same.tex': 'same\n' });
  await fs.cp(p.root, p.cloud, { recursive: true });
  await fs.rm(path.join(p.cloud, 'here.tex'));
  await write(path.join(p.cloud, 'there.tex'), 'there\n');
  await write(path.join(p.cloud, 'both.tex'), 'both, there\n');
  await mirror.linkMirror(p.id, { location, rel: p.name });
  synced(await mirror.syncProject(p.id));
  const files = userFiles(p.root);
  assert.deepEqual(files.filter((f) => !f.includes('conflicted copy')), ['both.tex', 'here.tex', 'same.tex', 'there.tex']);
  assert.equal(read(path.join(p.root, 'both.tex')), 'both, here\n');
  assert.equal(read(path.join(p.cloud, 'both.tex')), 'both, here\n');
  assert.deepEqual(Object.values(conflictCopies(files)), ['both.tex']);
  synced(await mirror.syncProject(p.id));
  sameTree(p.root, p.cloud);
});

test('passes take turns, a project waiting goes once, and a save starts one 2 s later', async () => {
  const p = await project('Queue', { 'main.tex': 'main\n' });
  const { files } = await copyProject(p.root, p.cloud);
  await mirror.linkMirror(p.id, { location, rel: p.name, files });
  const [a, b] = [mirror.syncProject(p.id), mirror.syncProject(p.id)];
  assert.equal(a, b);
  synced(await a);
  await write(path.join(p.root, 'main.tex'), 'main, saved\n');
  mirror.afterSave(p.id);
  mirror.afterSave(p.id);
  await new Promise((resolve) => setTimeout(resolve, 2600));
  synced(await mirror.syncProject(p.id));
  assert.equal(read(path.join(p.cloud, 'main.tex')), 'main, saved\n');
  assert.equal(await mirror.syncProject(crypto.randomUUID()), null, 'not mirrored');
  await mirror.unlinkMirror(p.id);
  assert.equal(await mirror.readMirror(p.id), null);
  assert.ok(existsSync(path.join(p.cloud, 'main.tex')), 'both copies stay');
});

test('a copy is checked first, whole when done, and gone again when it fails', async () => {
  const p = await project('Copy', { 'main.tex': 'main\n', 'deep/er/file.tex': 'x\n' });
  assert.deepEqual(await preflight(p.root, { to: path.join(tmp, 'copies', 'Copy') }), { files: 3, bytes: 5 + 2 + Buffer.byteLength(read(path.join(p.root, '.spectrum', 'project.json'))) });
  await assert.rejects(preflight(p.root, { windows: true, to: path.join(tmp, 'x'.repeat(250)) }), /more than Windows allows \(259\)/);
  if (!WINDOWS) {
    await fs.symlink('main.tex', path.join(p.root, 'link.tex'));
    await assert.rejects(preflight(p.root), /“link\.tex” is a symbolic link/);
    await fs.rm(path.join(p.root, 'link.tex'));
  }
  // a folder already there with something in it is never used, or removed
  const taken = path.join(tmp, 'copies', 'Taken');
  await write(path.join(taken, 'keep.txt'), 'mine');
  await assert.rejects(copyProject(p.root, taken), /already a folder called “Taken”/);
  assert.equal(read(path.join(taken, 'keep.txt')), 'mine');
  if (!WINDOWS && process.getuid?.() !== 0) {
    await fs.chmod(path.join(p.root, 'deep', 'er', 'file.tex'), 0o000);
    await assert.rejects(copyProject(p.root, path.join(tmp, 'copies', 'Failed')));
    assert.ok(!existsSync(path.join(tmp, 'copies', 'Failed')));
    await fs.chmod(path.join(p.root, 'deep', 'er', 'file.tex'), 0o644);
  }
  const { files } = await copyProject(p.root, path.join(tmp, 'copies', 'Copy'));
  assert.deepEqual(Object.keys(files).sort(), ['.spectrum/project.json', 'deep/er/file.tex', 'main.tex']);
  assert.equal(files['main.tex'].hash, crypto.createHash('sha256').update('main\n').digest('hex'));
});

/** Another computer: the same modules with a data folder of its own, in a thread of their own. */
function computer(name, root) {
  const worker = new Worker(
    `const { parentPort, workerData } = require('node:worker_threads');
    import(workerData.url).then((m) => {
      m.mirrorHooks({ rootOf: async () => workerData.root, toBin: async () => { throw new Error('No Bin.'); } });
      parentPort.on('message', async ([fn, args]) => parentPort.postMessage(await m[fn](...args)));
      parentPort.postMessage('ready');
    });`,
    { eval: true, env: { ...process.env, SPECTRUM_DATA_DIR: dataDir(name) }, workerData: { url: mirrorUrl, root } }
  );
  workers.push(worker);
  let turn = new Promise((resolve, reject) => worker.once('message', resolve).once('error', reject));
  const call = (fn, ...args) => {
    turn = turn.then(() => new Promise((resolve, reject) => {
      worker.once('message', resolve).once('error', reject);
      worker.postMessage([fn, args]);
    }));
    return turn;
  };
  return { syncProject: (id) => call('syncProject', id), linkMirror: (id, rec) => call('linkMirror', id, rec) };
}

test('two computers sharing one cloud copy, their passes taking turns, lose nothing', async () => {
  const paper = '\\section{One}\nFirst.\n\n\\section{Two}\nSecond.\n\n\\section{Three}\nThird.\n';
  const mac = await project('Thesis', { 'main.tex': paper, 'refs.bib': '@book{a}\n', 'fig.png': 'PNG' });
  await versions.createVersion(mac.root, { label: 'Start' });
  synced(await syncTo(mac));
  // Download on the PC: a copy of the cloud's, then a first pass with no base
  const pcRoot = path.join(tmp, 'pc', 'Thesis');
  await copyProject(mac.cloud, pcRoot);
  const pc = computer('PC', pcRoot);
  await pc.linkMirror(mac.id, { location, rel: 'Thesis' });
  synced(await pc.syncProject(mac.id));
  sameTree(mac.root, pcRoot);

  // each changes its own part, the PC adds a file and deletes another
  await write(path.join(mac.root, 'main.tex'), paper.replace('First.', 'First, on the Mac.'));
  await write(path.join(pcRoot, 'main.tex'), paper.replace('Third.', 'Third, on the PC.'));
  await write(path.join(pcRoot, 'pc.tex'), 'from the PC\n');
  await fs.rm(path.join(pcRoot, 'refs.bib'));
  synced(await mirror.syncProject(mac.id));
  synced(await pc.syncProject(mac.id));
  synced(await mirror.syncProject(mac.id));
  const merged = paper.replace('First.', 'First, on the Mac.').replace('Third.', 'Third, on the PC.');
  for (const root of [mac.root, mac.cloud, pcRoot]) {
    assert.equal(read(path.join(root, 'main.tex')), merged, root);
    assert.equal(read(path.join(root, 'pc.tex')), 'from the PC\n');
    assert.ok(!existsSync(path.join(root, 'refs.bib')));
  }
  // the Mac's own text was replaced, so it's in a version first, with the file deleted there
  const [before] = await versions.listVersions(mac.root);
  assert.equal(before.label, `Before sync from ${LABEL}`);
  assert.equal((await versions.readVersionFile(mac.root, before.id, 'refs.bib')).content, '@book{a}\n');
  assert.equal((await versions.readVersionFile(mac.root, before.id, 'main.tex')).content, paper.replace('First.', 'First, on the Mac.'));

  // the same line on both: the PC (second to sync) keeps its own, the Mac's goes beside it, and the Mac takes both
  await write(path.join(mac.root, 'main.tex'), merged.replace('Second.', 'Second, Mac.'));
  await write(path.join(pcRoot, 'main.tex'), merged.replace('Second.', 'Second, PC.'));
  synced(await mirror.syncProject(mac.id));
  synced(await pc.syncProject(mac.id));
  synced(await mirror.syncProject(mac.id));
  synced(await pc.syncProject(mac.id));
  synced(await mirror.syncProject(mac.id));
  for (const root of [mac.root, mac.cloud, pcRoot]) {
    assert.equal(read(path.join(root, 'main.tex')), merged.replace('Second.', 'Second, PC.'));
    const copies = Object.entries(conflictCopies(userFiles(root)));
    assert.equal(copies.length, 1, root);
    assert.equal(read(path.join(root, copies[0][0])), merged.replace('Second.', 'Second, Mac.'));
  }
  // both computers' versions are on both
  synced(await pc.syncProject(mac.id));
  synced(await mirror.syncProject(mac.id));
  const labels = new Set([...(await latestLabels(mac.root))]);
  assert.deepEqual(new Set(await latestLabels(pcRoot)), labels);
  assert.ok(labels.has('Start'));
  sameTree(mac.root, pcRoot);
});
