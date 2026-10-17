// Cloud projects kept as a mirror: the project stays in its folder on this computer, and its copy in a cloud location
// (OneDrive, Dropbox, iCloud Drive, a NAS…) is kept in step file by file, the way git merges: a file changed on one
// side goes across, one changed on both is merged by lines, or this computer's is kept and the other text put beside
// it as a conflicted copy. Deletions go across too, but only ever from a whole view of both sides.
// This computer's own records, never synced (1.7.0 and 1.8.0 never look):
//   DATA_DIR/mirror/<id>.json           { location, rel, files }: the copy at <location>/<rel>, and the base, each file
//                                       as both sides last agreed on it, keyed by its path in NFC and lower case (APFS
//                                       and NTFS ignore case): { rel, hash, l: { size, mtimeMs }, c: { size, mtimeMs },
//                                       by }, with each side's own stat then and which side wrote it ('here', 'there')
//   DATA_DIR/mirror/<id>/base/<sha>.gz  the base's text of the files a merge needs (text files and project.json)
//   DATA_DIR/mirror/<id>/incoming/      the cloud's files read during a pass, where nothing else looks
import { promises as fs, constants } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { DATA_DIR } from '../config/constants.js';
import { HIDDEN_ENTRIES, freePath, mirrorSkips, readJson, renameOver, writeFileAtomic, writeJsonAtomic } from '../utils/fsUtils.js';
import { mergeText } from '../utils/merge3.js';
import { mergeChat } from '../utils/chatMerge.js';
import { hashFile } from '../utils/projectCopy.js';
import { appPath, getProjectRoot, httpError, serialiser, updateMeta } from './projectService.js';
import { isConflictCopy, offlineMessage, otherComputersProjects, placeOf, sameFolder, within } from './syncService.js';
import { createVersionUnlocked, isText, listVersions } from './versionService.js';
import { moveToBin } from '../routes/projects.js';

const MIRROR_DIR = path.join(DATA_DIR, 'mirror');
const ID_RE = /^[A-Za-z0-9_-]+$/;
const META = '.spectrum/project.json';
const OBJECTS = '.spectrum/history/objects';
const EVERY_MS = 60_000;
const SAVE_DELAY_MS = 2000;
const VERSION_EVERY_MS = 10 * 60 * 1000;
// ponytail: a bigger text file isn't merged, only kept here with a conflicted copy; raise it if that bites
const MERGE_MAX_BYTES = 10 * 1024 * 1024;

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const exists = (p) => fs.access(p).then(() => true, () => false);

const recordPath = (id) => path.join(MIRROR_DIR, `${id}.json`);
const workDir = (id, ...parts) => path.join(MIRROR_DIR, id, ...parts);
const basePath = (id, hash) => workDir(id, 'base', `${hash}.gz`);
// folded on every system, as the two copies meet on APFS and NTFS
const keyOf = (rel) => rel.normalize('NFC').toLowerCase();
const inApp = (key) => key.startsWith('.spectrum/');
const join = (root, rel) => path.join(root, ...rel.split('/').filter(Boolean));
const stat = (s) => ({ size: s.size, mtimeMs: s.mtimeMs });
const sameStat = (a, b) => (!a && !b) || (!!a && !!b && a.size === b.size && a.mtimeMs === b.mtimeMs);
const entry = (rel, hash, l, c, by) => ({ rel, hash, l: stat(l), c: stat(c), by });
// not there (a missing folder on the way included) is null; anything else is an error
const absent = async (err) => {
  if (['ENOENT', 'ENOTDIR'].includes(err.code)) return null;
  throw err;
};
const statOf = (abs) => fs.lstat(abs).then(stat, absent);
const hashOf = (abs) => hashFile(abs).catch(absent);
const attention = (message) => ({ state: 'attention', message });

const defaults = {
  rootOf: getProjectRoot,
  // on the cloud side never through Finder, which on a volume without a Bin (a NAS) asks before deleting for good:
  // macOS 14's trash command fails there instead
  toBin: (abs, cloud) => (cloud && process.platform === 'darwin' ? execFileAsync('/usr/bin/trash', [abs]) : moveToBin(abs))
};
let hooks = defaults;

/** For tests: where a project's folder is, without the registry, and a Bin of their own. */
export function mirrorHooks(next = {}) {
  hooks = { ...defaults, ...next };
}

// ─── Records ───

/** The project's mirror record, { location, rel, files }, or null when it isn't mirrored. */
export async function readMirror(id) {
  if (!ID_RE.test(String(id || ''))) return null;
  const data = await readJson(recordPath(id)).catch(() => null);
  if (typeof data?.location !== 'string' || !path.isAbsolute(data.location) || typeof data.rel !== 'string' || data.rel.split('/').includes('..')) return null;
  return { location: data.location, rel: data.rel, files: data.files && typeof data.files === 'object' ? data.files : {} };
}

/** Every mirrored project: [{ id, location, rel }]. */
export async function listMirrored() {
  const found = [];
  for (const name of await fs.readdir(MIRROR_DIR).catch(() => [])) {
    const id = name.match(/^(.+)\.json$/)?.[1];
    const record = id && (await readMirror(id));
    if (record) found.push({ id, location: record.location, rel: record.rel });
  }
  return found;
}

export const cloudRootOf = (record) => join(record.location, record.rel);

/**
 * Mirror the project into <location>/<rel>, rel '/'-separated. files: the copy's files as copyProject gives them,
 * which both sides then have as they are; none (Download, or a copy that was already there) and the first pass keeps
 * everything on either side and deletes nothing.
 */
export function linkMirror(id, { location, rel, files = {} }) {
  if (!ID_RE.test(String(id || ''))) throw httpError('Project not found.', 404);
  return lockOf(id)(async () => {
    const base = {};
    for (const [fileRel, { hash }] of Object.entries(files)) {
      if (!mirrorSkips(fileRel) && !keyOf(fileRel).startsWith(`${OBJECTS}/`)) base[keyOf(fileRel)] = { rel: fileRel, hash, by: 'here' };
    }
    await fs.rm(workDir(id), { recursive: true, force: true });
    await writeJsonAtomic(recordPath(id), { location, rel, files: base });
    statuses.delete(id);
    unreadFor.delete(id);
  });
}

/** Stop mirroring the project; both copies stay as they are. */
export function unlinkMirror(id) {
  if (!ID_RE.test(String(id || ''))) throw httpError('Project not found.', 404);
  return lockOf(id)(() => forget(id));
}

async function forget(id) {
  await fs.rm(recordPath(id), { force: true });
  await fs.rm(workDir(id), { recursive: true, force: true });
  statuses.delete(id);
  unreadFor.delete(id);
  versionedAt.delete(id);
}

/** The mirrored project whose cloud copy p is in, and p's '/'-separated path in it; null outside them all. */
export async function cloudCopyOwner(p) {
  for (const m of await listMirrored()) {
    const root = cloudRootOf(m);
    if (within(p, root)) return { id: m.id, rel: p.slice(root.length + 1).split(path.sep).join('/') };
  }
  return null;
}

// ─── Passes ───

// one pass at a time across every project, so at most one waits on a sync app that's downloading or out of reach
const queue = serialiser();
const waiting = new Map();
// and per project, so linking and unlinking never land in the middle of a pass
const locks = new Map();
const lockOf = (id) => locks.get(id) || locks.set(id, serialiser()).get(id);
const statuses = new Map();
// the files a pass couldn't read, by project: key → passes in a row
const unreadFor = new Map();
// when each project last had a "Before sync" version
const versionedAt = new Map();

/**
 * How the project's mirror is: { state: 'synced'|'syncing'|'waiting'|'attention'|'missing'|'not-found', message?, at? },
 * 'syncing' until its first pass is done.
 */
export function mirrorStatus(id) {
  return statuses.get(id) || { state: 'syncing' };
}

/**
 * Bring the project and its cloud copy into step after any pass before it, whichever project's; resolves to the
 * status, or null when it isn't mirrored. A project already waiting for its turn goes once. force: Sync anyway, past
 * the brake on deleting many files.
 */
export function syncProject(id, { force = false } = {}) {
  let next = waiting.get(id);
  if (!next) {
    next = { force: false };
    next.done = queue(() => {
      waiting.delete(id);
      return lockOf(id)(() => pass(id, next.force));
    });
    waiting.set(id, next);
  }
  next.force ||= force;
  return next.done;
}

const saveTimers = new Map();

/** A file of the project was saved: a pass 2 s after the last save, if it's mirrored. */
export function afterSave(id) {
  clearTimeout(saveTimers.get(id));
  const timer = setTimeout(async () => {
    saveTimers.delete(id);
    if (await readMirror(id)) syncProject(id);
  }, SAVE_DELAY_MS);
  saveTimers.set(id, timer.unref());
}

let ticker = null;

/** A pass for every mirrored project now, then every minute. */
export function startMirroring() {
  stopMirroring();
  const all = async () => {
    for (const { id } of await listMirrored()) syncProject(id);
  };
  all();
  ticker = setInterval(all, EVERY_MS).unref();
}

export function stopMirroring() {
  clearInterval(ticker);
  ticker = null;
  for (const timer of saveTimers.values()) clearTimeout(timer);
  saveTimers.clear();
}

async function pass(id, force) {
  const record = await readMirror(id);
  if (!record) return null;
  const label = await labelOf(record.location);
  let status;
  try {
    status = await mirror(id, record, label, force);
  } catch (err) {
    const offline = await offlineMessage(err).catch(() => null);
    if (offline) status = { state: 'waiting', message: offline };
    else status = attention(['EPERM', 'EACCES'].includes(err.code) ? `Spectrum needs access to ${label}.` : err.message);
  } finally {
    await fs.rm(workDir(id, 'incoming'), { recursive: true, force: true }).catch(() => {});
  }
  if (status) statuses.set(id, status);
  return status;
}

/** What the user calls the location: its sync app's name, or the folder's own (a NAS share, anywhere else). */
const labelOf = async (location) => (await placeOf(location).catch(() => null))?.label || path.basename(location);

/** The project's folder somewhere else in the location (moved or renamed there), up to 3 levels down: its rel, or null unless just one. */
async function findCopy(location, id) {
  const found = [];
  const look = async (dir, depth) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || HIDDEN_ENTRIES.has(entry.name) || isConflictCopy(entry.name)) continue;
      const sub = path.join(dir, entry.name);
      const meta = await readJson(join(sub, META)).catch(() => null);
      if (meta) {
        if (meta.id === id) found.push(sub);
      } else if (depth < 3) await look(sub, depth + 1);
    }
  };
  await look(location, 1);
  return found.length === 1 ? found[0].slice(location.length + 1).split(path.sep).join('/') : null;
}

/** One pass: the guards, both walks, what each file needs, a version before anything here is replaced, then doing it. */
async function mirror(id, record, label, force) {
  // both sides there, and both this project, else a missing or emptied one would read as everything deleted
  let localRoot;
  try {
    localRoot = await hooks.rootOf(id);
  } catch {
    return { state: 'missing', message: 'Folder missing' };
  }
  // the folder is in the location itself (moved there, or Locate… chose the cloud copy): a project used in place
  if (within(localRoot, record.location)) {
    await forget(id);
    return null;
  }
  if ((await readJson(join(localRoot, META)).catch(() => null))?.id !== id) return attention('This project’s folder holds another project now.');
  try {
    await fs.stat(record.location);
  } catch (err) {
    await absent(err);
    return { state: 'waiting', message: `Waiting for ${label}` };
  }
  let cloudRoot = cloudRootOf(record);
  const cloudMeta = await readJson(join(cloudRoot, META)).catch((err) => (err instanceof SyntaxError ? {} : absent(err)));
  if (!cloudMeta) {
    // moved or renamed in the location: followed there, never unlinked by itself (the sync app may be bringing it back)
    const rel = await findCopy(record.location, id);
    if (rel === null) return { state: 'not-found', message: `Not in ${label}` };
    record.rel = rel;
    cloudRoot = cloudRootOf(record);
    await writeJsonAtomic(recordPath(id), record);
  } else if (cloudMeta.id !== id) return attention(`The copy in ${label} holds another project now.`);

  const here = await walk(localRoot);
  const there = await walk(cloudRoot);
  const ctx = { id, label, record, localRoot, cloudRoot, here, incoming: workDir(id, 'incoming'), fetched: 0, made: new Set() };
  await fs.rm(ctx.incoming, { recursive: true, force: true });
  await fs.mkdir(ctx.incoming, { recursive: true });
  const next = {};
  const problems = [];
  const unread = new Map();
  const items = [];
  for (const key of new Set([...here.files.keys(), ...there.files.keys(), ...Object.keys(record.files)])) {
    const base = record.files[key];
    const [l, ...moreHere] = here.files.get(key) || [];
    const [c, ...moreThere] = there.files.get(key) || [];
    // left as they are, with their base: two names for one key, a link, or a file that can't be read now
    const keep = () => base && (next[key] = base);
    if (moreHere.length || moreThere.length) {
      const [a, b] = moreHere.length ? [l, moreHere[0]] : [c, moreThere[0]];
      problems.push(`“${a.rel}” and “${b.rel}” differ only in letter case, which macOS and Windows can’t keep apart. Rename one of them.`);
      keep();
      continue;
    }
    if (l?.link || c?.link) {
      keep();
      continue;
    }
    const stub = l?.stub || c?.stub;
    if (stub) {
      // iCloud Drive moved it off this Mac: asked for it back, for a later pass
      if (process.platform === 'darwin') execFile('/usr/bin/brctl', ['download', stub], () => {});
      unread.set(key, Object.assign(new Error('Not downloaded.'), { code: 'ETIMEDOUT', syscall: 'open', path: stub }));
      keep();
      continue;
    }
    const it = { key, base, l, c };
    try {
      if (l && c && l.rel.normalize('NFC') !== c.rel.normalize('NFC')) await respell(ctx, it);
      if (l) l.hash = sameStat(l, base?.l) ? base.hash : await hashFile(join(localRoot, l.rel));
      if (c) c.hash = sameStat(c, base?.c) ? base.hash : await fetchCloud(ctx, it);
      it.action = decide(it);
      if (it.action === 'merge') await merge(ctx, it);
      if (it.action === 'toLocal' && key === META) {
        it.meta = JSON.parse(await fs.readFile(it.fetched, 'utf8'));
        it.action = 'meta';
      }
    } catch (err) {
      // gone or still changing since the walk: the next pass sees it as it is then
      if (!['ENOENT', 'CHANGED'].includes(err.code)) unread.set(key, err);
      keep();
      continue;
    }
    items.push(it);
  }

  // a pass that would delete a good part of a side is more likely a sync app halfway through than the user
  const count = (action) => items.filter((it) => it.action === action).length;
  const brake = [[count('deleteLocal'), here.files.size, 'on this computer'], [count('deleteCloud'), there.files.size, `in ${label}`]].find(([n, of]) => n > 5 && n > of / 4);
  if (brake && !force) {
    problems.push(`Syncing would delete ${brake[0]} files ${brake[2]}, so nothing has been deleted. Check the project, then choose Sync anyway if that’s right.`);
    for (const it of items) if (it.action.startsWith('delete')) it.action = 'keep';
  }
  const replaced = items.filter((it) => it.l && !inApp(it.key) && ['toLocal', 'write', 'deleteLocal'].includes(it.action));
  const held = replaced.length ? await keepBefore(ctx, replaced) : {};

  // history objects are named by their content: whichever side lacks one gets it, and none is ever deleted (so a
  // clean-up on one computer, 1.7.0's or 1.8.0's, doesn't spread)
  let history = false;
  for (const [name, rel] of here.objects) if (!there.objects.has(name)) await place(ctx, cloudRoot, join(localRoot, rel), join(cloudRoot, rel)).catch(() => {});
  for (const [name, rel] of there.objects) {
    if (!here.objects.has(name)) history = (await place(ctx, localRoot, join(cloudRoot, rel), join(localRoot, rel)).then(() => true, () => false)) || history;
  }
  // deletions first, so a file can become a folder of the same name
  items.sort((a, b) => Number(b.action.startsWith('delete')) - Number(a.action.startsWith('delete')));
  for (const it of items) {
    try {
      const done = await apply(ctx, it, held);
      if (done) next[it.key] = done;
      if (it.key.startsWith('.spectrum/history/') && ['toLocal', 'deleteLocal'].includes(it.action)) history = true;
    } catch (err) {
      unread.set(it.key, err);
      if (it.base) next[it.key] = it.base;
    }
  }
  // 1.7.0 lists the versions in index.json, which this computer's copy (kept on a conflict) may lack
  if (history) await listVersions(localRoot).catch(() => {});
  await writeJsonAtomic(recordPath(id), { ...record, files: next });
  await storeBases(ctx, next);

  // a file that couldn't be read 3 passes running (OneDrive's download notice turned off, say) needs the user
  const before = unreadFor.get(id) || new Map();
  const runs = new Map([...unread.keys()].map((key) => [key, (before.get(key) || 0) + 1]));
  unreadFor.set(id, runs);
  const stuck = [...runs].find(([, n]) => n >= 3)?.[0];
  if (stuck) {
    const err = unread.get(stuck);
    problems.push((await offlineMessage(err).catch(() => null)) || `“${path.basename(stuck)}” hasn’t synced: ${err.message}`);
  }
  return problems.length ? attention(problems[0]) : { state: 'synced', at: new Date().toISOString() };
}

/**
 * A side's files by key, each [{ rel, size, mtimeMs }] (two for one key: names that differ only in case, on a
 * volume that tells them apart); { rel, link } for a link or anything else that isn't a plain file, never followed,
 * copied or replaced; { rel, stub } for the file behind iCloud Drive's stand-in for one it moved off this Mac. History
 * objects go by name only. A folder that can't be read stops the walk, so part of a side is never taken for all of it.
 */
async function walk(root) {
  const files = new Map();
  const objects = new Map();
  const add = (rel, item) => files.set(keyOf(rel), [...(files.get(keyOf(rel)) || []), { rel, ...item }]);
  // a folder gone since the one around it was listed was moved or deleted: not there
  const list = (rel) => fs.readdir(join(root, rel), { withFileTypes: true }).catch((err) => (rel ? absent(err).then(() => []) : Promise.reject(err)));
  const into = async (rel) => {
    for (const entry of await list(rel)) {
      const itemRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (mirrorSkips(itemRel)) continue;
      if (entry.isDirectory() && keyOf(itemRel) === OBJECTS) {
        for (const shard of await list(itemRel)) {
          for (const object of shard.isDirectory() ? await list(`${itemRel}/${shard.name}`) : []) {
            const objectRel = `${itemRel}/${shard.name}/${object.name}`;
            if (!mirrorSkips(objectRel)) objects.set(`${shard.name}/${object.name}`, objectRel);
          }
        }
      } else if (entry.isDirectory()) await into(itemRel);
      else if (/^\..+\.icloud$/.test(entry.name)) {
        const real = `${rel ? `${rel}/` : ''}${entry.name.slice(1, -'.icloud'.length)}`;
        if (!mirrorSkips(real)) add(real, { stub: join(root, real) });
      } else if (!entry.isFile()) add(itemRel, { link: true });
      else {
        const found = await statOf(join(root, itemRel));
        if (found) add(itemRel, found);
      }
    }
  };
  await into('');
  return { files, objects };
}

/**
 * The same file spelt in other letter case on each side (not only another Unicode form, which the systems treat as one
 * name): renamed on the side that still has the base's spelling, as the other side made the change; this computer's
 * spelling with no base yet.
 */
async function respell(ctx, { base, l, c }) {
  const same = (a, b) => a.normalize('NFC') === b.normalize('NFC');
  const [from, to, root] = !base || same(base.rel, c.rel) ? [c, l, ctx.cloudRoot] : same(base.rel, l.rel) ? [l, c, ctx.localRoot] : [];
  if (!from) return;
  const parts = from.rel.split('/');
  const want = to.rel.split('/');
  let at = root;
  for (let i = 0; i < parts.length; i++) {
    if (!same(parts[i], want[i])) {
      // a folder another file in it already renamed is no longer there by its old name on a case-sensitive volume
      await fs.rename(path.join(at, parts[i]), path.join(at, want[i])).catch(absent);
      parts[i] = want[i];
    }
    at = path.join(at, parts[i]);
  }
  from.rel = parts.join('/');
}

/** The cloud's file read into this pass's incoming folder; its hash. */
async function fetchCloud(ctx, it) {
  const tmp = path.join(ctx.incoming, String(ctx.fetched++));
  const abs = join(ctx.cloudRoot, it.c.rel);
  await fs.copyFile(abs, tmp);
  // the sync app was still writing it
  if (!sameStat(await statOf(abs), it.c)) throw Object.assign(new Error('Changed while it was read.'), { code: 'CHANGED' });
  it.fetched = tmp;
  return hashFile(tmp);
}

/** What a file needs, from each side's hash against the base's. */
function decide({ base, l, c }) {
  if (!l && !c) return 'drop';
  if (l && c && l.hash === c.hash) return 'equal';
  // no base (just linked, or new on both sides): everything on either side stays, and nothing is deleted
  if (!base) return !c ? 'toCloud' : !l ? 'toLocal' : 'merge';
  const changedHere = l && l.hash !== base.hash;
  const changedThere = c && c.hash !== base.hash;
  // deleted on one side and changed on the other: the changed one stays
  if (!l) return changedThere ? 'toLocal' : 'deleteCloud';
  if (!c) return changedHere ? 'toCloud' : 'deleteLocal';
  return !changedThere ? 'toCloud' : !changedHere ? 'toLocal' : 'merge';
}

/** Each field from the side that changed it, this computer's where both did; never the id. */
function mergeMeta(base, local, cloud) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const merged = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const value = same(local[key], base[key]) ? cloud[key] : local[key];
    if (value !== undefined) merged[key] = value;
  }
  return { ...merged, id: local.id };
}

const readBase = (id, hash) => fs.readFile(basePath(id, hash)).then(gunzipAsync).catch(() => null);

/**
 * Changed on both sides. Of the app's files never a conflicted copy, which no one would see: project.json field by
 * field, a chat with every message from both, a version's manifest the newer, index.json and the rest this computer's.
 * A compiled PDF stays this computer's. Any other text file is merged by lines; one that doesn't merge (or isn't text)
 * stays this computer's, and the cloud's goes beside it as a conflicted copy.
 */
async function merge(ctx, it) {
  const { key } = it;
  const local = join(ctx.localRoot, it.l.rel);
  it.action = 'toCloud';
  if (key === META) {
    const base = it.base && (await readBase(ctx.id, it.base.hash));
    if (!base) return;
    // ponytail: a tag change made on both computers between passes keeps this computer's tags, the other's lost
    it.meta = mergeMeta(JSON.parse(base), await readJson(local), await readJson(it.fetched));
    it.action = 'meta';
  } else if (/^\.spectrum\/chats\/[^/]+\.json$/.test(key)) {
    const [mine, theirs] = await Promise.all([readJson(local), readJson(it.fetched)]).catch(() => []);
    const chat = (x) => typeof x?.id === 'string' && Array.isArray(x.messages);
    if (!chat(mine) || !chat(theirs) || mine.id !== theirs.id) return;
    it.data = Buffer.from(JSON.stringify(mergeChat(theirs, mine)));
    it.action = 'write';
  } else if (key.startsWith('.spectrum/history/manifests/')) {
    if (it.c.mtimeMs > it.l.mtimeMs) it.action = 'toLocal';
  } else if (!inApp(key) && !(key.endsWith('.pdf') && ctx.here.files.has(`${key.slice(0, -4)}.tex`))) {
    const base = it.base && isText(it.l.rel) && (await readBase(ctx.id, it.base.hash));
    it.data = base && mergeText(base, await fs.readFile(local), await fs.readFile(it.fetched));
    it.action = it.data ? 'write' : 'conflict';
  }
}

/**
 * "Before sync from <computer>": a version before this pass replaces or deletes files here (none when nothing changed
 * since the latest). Always for a merge, a deletion or what this computer wrote; for files just as they came from the
 * cloud only when the latest version lacks one and at most every 10 minutes, or each pass would add one while another
 * computer is typing. Returns the files of the version that holds them.
 */
async function keepBefore(ctx, replaced) {
  const [latest] = await listVersions(ctx.localRoot);
  const files = latest ? await versionFiles(ctx.localRoot, latest.id) : {};
  const due = Date.now() - (versionedAt.get(ctx.id) || 0) >= VERSION_EVERY_MS;
  const always = replaced.some((it) => it.action !== 'toLocal' || it.base?.by !== 'there');
  if (!always && !(due && replaced.some((it) => files[it.l.rel] !== it.l.hash))) return files;
  // the computer it came from, when only one other mirrors the project
  const others = [...new Set((await otherComputersProjects().catch(() => [])).filter((p) => p.id === ctx.id).map((p) => p.machineName))];
  const { version } = await createVersionUnlocked(ctx.localRoot, { label: `Before sync from ${others.length === 1 ? others[0] : ctx.label}` });
  versionedAt.set(ctx.id, Date.now());
  return versionFiles(ctx.localRoot, version.id);
}

const versionFiles = async (root, id) => (await readJson(appPath(root, 'history', 'manifests', `${id}.json`)).catch(() => null))?.files || {};

/** The folder dir in root, made as needed but never root itself, so a cloud copy gone during the pass isn't made again. */
async function folderIn(ctx, root, dir) {
  if (ctx.made.has(dir)) return;
  let at = root;
  for (const part of path.relative(root, dir).split(path.sep).filter(Boolean)) {
    at = path.join(at, part);
    await fs.mkdir(at).catch((err) => {
      if (err.code !== 'EEXIST') throw err;
    });
  }
  ctx.made.add(dir);
}

/** src's bytes at dest in root, through a temp file beside it, so neither a reader nor a sync app sees half a file. */
async function place(ctx, root, src, dest) {
  await folderIn(ctx, root, path.dirname(dest));
  const tmp = `${dest}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.copyFile(src, tmp);
    await renameOver(tmp, dest);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

/**
 * Beside rel, the cloud's text that didn't merge, named as Dropbox names a conflicted copy
 * (main (OneDrive’s conflicted copy 2026-10-18 104233).tex), so the conflict-copy banner offers it.
 * The editor's conflictCopyPath, with the location's name for the computer's.
 */
function conflictCopyPath(rel, label, at = new Date()) {
  const slash = rel.lastIndexOf('/') + 1;
  const name = rel.slice(slash);
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  const who = label.replace(/[().<>:"/\\|?*\u0000-\u001f]/g, '').trim();
  const two = (n) => String(n).padStart(2, '0');
  const when = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `${rel.slice(0, slash)}${stem} (${who ? `${who}’s ` : ''}conflicted copy ${when})${ext}`;
}

/**
 * Do what the file needs; returns its base entry now, or null when it's gone from both sides. Just before a file is
 * replaced or deleted, the one here must still have the bytes the walk hashed and the cloud one the stat it had,
 * else it's left for the next pass. ponytail: a change in the moment between that check and the write is still
 * written over, as with the save route's own check
 */
async function apply(ctx, it, held) {
  const { base, l, c } = it;
  if (it.action === 'drop') return null;
  const local = join(ctx.localRoot, l?.rel ?? c.rel);
  const cloud = join(ctx.cloudRoot, c?.rel ?? l.rel);
  const unchanged = async (sides) =>
    (!sides.includes('l') || (await hashOf(local)) === (l?.hash ?? null)) && (!sides.includes('c') || sameStat(await statOf(cloud), c));
  // left for the next pass, which hashes the file here again: an edit that kept its size and time would pass for none
  const later = () => base && { ...base, l: undefined };
  switch (it.action) {
    case 'keep':
      return base;
    case 'equal':
      return entry(l.rel, l.hash, l, c, base?.by || 'there');
    case 'toCloud':
    case 'conflict': {
      if (!(await unchanged(it.action === 'conflict' ? 'lc' : 'c'))) return later();
      if (it.action === 'conflict') await fs.copyFile(it.fetched, await freePath(join(ctx.localRoot, conflictCopyPath(l.rel, ctx.label))), constants.COPYFILE_EXCL);
      await place(ctx, ctx.cloudRoot, local, cloud);
      const now = await statOf(local);
      // changed while it was copied: the next pass copies it again
      return sameStat(now, l) ? entry(l.rel, l.hash, now, await statOf(cloud), 'here') : later();
    }
    case 'toLocal': {
      if (!(await unchanged('l'))) return later();
      await folderIn(ctx, ctx.localRoot, path.dirname(local));
      await renameOver(it.fetched, local);
      return entry(c.rel, c.hash, await statOf(local), c, 'there');
    }
    case 'meta': {
      if (!(await unchanged('lc'))) return later();
      // through updateMeta, so the list's copy of the name and tags follows (and the id stays); the cloud gets its bytes
      await updateMeta(ctx.localRoot, () => it.meta);
      const bytes = await fs.readFile(local);
      if (sha256(bytes) !== c.hash) await writeFileAtomic(cloud, bytes);
      return entry(l.rel, sha256(bytes), await statOf(local), await statOf(cloud), 'there');
    }
    case 'write': {
      if (!(await unchanged('lc'))) return later();
      await writeFileAtomic(local, it.data);
      await writeFileAtomic(cloud, it.data);
      return entry(l.rel, sha256(it.data), await statOf(local), await statOf(cloud), 'here');
    }
    case 'deleteCloud': {
      if (!(await unchanged('c'))) return later();
      await removeCloud(ctx, it, cloud);
      await pruneUp(ctx.cloudRoot, cloud);
      return null;
    }
    case 'deleteLocal': {
      if (!(await unchanged('l'))) return later();
      // for good when the version just made holds it, and the app's files but a chat, which nothing else keeps; else the Bin
      if ((inApp(it.key) && !it.key.startsWith('.spectrum/chats/')) || held[l.rel] === l.hash) await fs.rm(local, { force: true });
      else await hooks.toBin(local, false);
      await pruneUp(ctx.localRoot, local);
      return null;
    }
  }
  throw new Error(`Unknown action ${it.action}.`);
}

/**
 * Deleted here, so from the cloud copy too: for good when this computer's history holds it (and the app's files),
 * else to the Bin, or with no Bin on that volume into the location's .spectrum-bin.
 */
async function removeCloud(ctx, it, abs) {
  const { hash } = it.c;
  if (inApp(it.key) || (await exists(appPath(ctx.localRoot, 'history', 'objects', hash.slice(0, 2), `${hash}.gz`)))) return fs.rm(abs, { force: true });
  try {
    await hooks.toBin(abs, true);
  } catch {
    // ponytail: never emptied; clear out days older than a month if it grows
    const aside = await freePath(join(ctx.record.location, ['.spectrum-bin', new Date().toISOString().slice(0, 10), ctx.record.rel, it.c.rel].filter(Boolean).join('/')));
    await fs.mkdir(path.dirname(aside), { recursive: true });
    await renameOver(abs, aside);
  }
}

/** Folders a deletion left empty go too, up to the project's own. */
async function pruneUp(root, abs) {
  for (let dir = path.dirname(abs); within(dir, root) && !sameFolder(dir, root); dir = path.dirname(dir)) {
    if (!(await fs.rmdir(dir).then(() => true, () => false))) return;
  }
}

/** The base's text for the files a merge may need, kept until the base moves on from it. */
async function storeBases(ctx, files) {
  const dir = workDir(ctx.id, 'base');
  await fs.mkdir(dir, { recursive: true });
  const stored = new Set(await fs.readdir(dir));
  const wanted = new Set();
  for (const [key, f] of Object.entries(files)) {
    if (!(key === META || (!inApp(key) && isText(f.rel))) || f.l?.size > MERGE_MAX_BYTES) continue;
    const name = `${f.hash}.gz`;
    if (!stored.has(name)) {
      const bytes = await fs.readFile(join(ctx.localRoot, f.rel)).catch(() => null);
      // changed here since: a merge before the next pass has none, and keeps this computer's with a conflicted copy
      if (!bytes || sha256(bytes) !== f.hash) continue;
      await writeFileAtomic(path.join(dir, name), await gzipAsync(bytes));
    }
    wanted.add(name);
  }
  for (const name of stored) if (!wanted.has(name)) await fs.rm(path.join(dir, name), { force: true });
}
