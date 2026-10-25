// What's left of 1.10's cloud mirror, which kept a project here in step with a copy in a cloud location (Synology
// Drive, OneDrive, Dropbox, iCloud Drive) until 2.0 moved syncing to GitHub: its records, read and never written, so
// that going back to 1.10.4 resumes mirroring from the last state both copies agreed on, and the move to 2.0.
//   DATA_DIR/mirror/<id>.json           1.10's record of a mirrored project: { location, rel, files, folder }, the copy
//                                       at <location>/<rel>, and the base, each file as both sides last agreed on it,
//                                       keyed by its path in NFC and lower case: { rel, hash, l, c, by }, with l and c
//                                       each side's { size, mtimeMs } then (c missing where the last pass wrote the
//                                       cloud's and left it to hash again)
//   DATA_DIR/mirror/<id>/base/          the base's text, which 1.10.4 merges against
//   DATA_DIR/v2-migration.json          what the first start of 2.0 found: { ranAt, mirrored, inPlace, dismissedAt? }
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { gunzip } from 'zlib';
import { DATA_DIR } from '../config/constants.js';
import { mirrorSkips, readJson, readdirTyped, writeJsonAtomic } from '../utils/fsUtils.js';
import { hashFile } from '../utils/projectCopy.js';
import { keyOf } from './mergeRules.js';
import { getProject, listProjects } from './projectService.js';
import { placeOf, within } from './syncService.js';

const MIRROR_DIR = path.join(DATA_DIR, 'mirror');
const MIGRATION_PATH = path.join(DATA_DIR, 'v2-migration.json');
const ID_RE = /^[A-Za-z0-9_-]+$/;
// ponytail: a cloud copy that takes longer than this to look through (online-only, a NAS out of reach) isn't checked
const CHECK_MS = 20_000;

const join = (root, rel) => path.join(root, ...rel.split('/').filter(Boolean));

/** The project's mirror record, { location, rel, files, folder }, or null when 1.10 didn't mirror it. */
export async function readMirror(id) {
  if (!ID_RE.test(String(id || ''))) return null;
  const data = await readJson(path.join(MIRROR_DIR, `${id}.json`)).catch(() => null);
  if (typeof data?.location !== 'string' || !path.isAbsolute(data.location) || typeof data.rel !== 'string' || data.rel.split('/').includes('..')) return null;
  return { location: data.location, rel: data.rel, files: data.files && typeof data.files === 'object' ? data.files : {}, folder: data.folder };
}

/** Every project 1.10 mirrored: [{ id, location, rel }]. */
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

const gunzipAsync = promisify(gunzip);

/**
 * A file's bytes as both copies last agreed on them, by the SHA-256 in the record's base: kept by 1.10 for text files
 * and project.json only, so null for the rest (and one 1.10 hadn't stored yet), whose hash is all there is.
 */
export async function readMirrorBase(id, hash) {
  if (!ID_RE.test(String(id || '')) || !/^[0-9a-f]{64}$/.test(String(hash || ''))) return null;
  return fs.readFile(path.join(MIRROR_DIR, id, 'base', `${hash}.gz`)).then(gunzipAsync).catch(() => null);
}

/**
 * The mirrored project whose cloud copy p is in, and p's '/'-separated path in it; null outside them all. That copy
 * keeps the project's id, so it never becomes a project of its own, which 1.10.4 would then find holding another one.
 */
export async function cloudCopyOwner(p) {
  for (const m of await listMirrored()) {
    const root = cloudRootOf(m);
    if (within(p, root)) return { id: m.id, rel: p.slice(root.length + 1).split(path.sep).join('/') };
  }
  return null;
}

// ─── The move to 2.0 ───

const tooLong = () => Object.assign(new Error('Took too long.'), { code: 'ETIMEDOUT' });
const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(tooLong()), Math.max(0, ms)).unref());

/**
 * What the cloud copy has that this computer never received, from each of its files' size and time against the
 * base's (or, for one the last pass wrote there, its hash): { changed, deleted }, '/'-separated, the project's own
 * files only (not .spectrum). Only stats are read, and files whose stat changed are hashed only where the base
 * has no stat; nothing is written or merged.
 */
async function cloudChanges(record, deadline) {
  const root = cloudRootOf(record);
  const changed = [];
  const seen = new Set();
  const into = async (rel) => {
    for (const entry of await readdirTyped(join(root, rel))) {
      if (Date.now() > deadline) throw tooLong();
      const itemRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (keyOf(itemRel) === '.spectrum' || mirrorSkips(itemRel)) continue;
      // iCloud Drive's stand-in for a file it moved off this Mac, which can't be compared without downloading it
      const stub = /^\.(.+)\.icloud$/.exec(entry.name);
      if (stub) seen.add(keyOf(rel ? `${rel}/${stub[1]}` : stub[1]));
      else if (entry.isDirectory()) await into(itemRel);
      else if (entry.isFile()) {
        const key = keyOf(itemRel);
        seen.add(key);
        const base = record.files[key];
        const now = await fs.lstat(join(root, itemRel));
        if (base?.c ? base.c.size === now.size && base.c.mtimeMs === now.mtimeMs : base && (await Promise.race([hashFile(join(root, itemRel)), timeout(deadline - Date.now())])) === base.hash) continue;
        changed.push(itemRel);
      }
    }
  };
  await into('');
  const deleted = Object.entries(record.files)
    .filter(([key, base]) => !key.startsWith('.spectrum/') && !seen.has(key) && typeof base?.rel === 'string')
    .map(([, base]) => base.rel);
  return { changed: changed.sort(), deleted: deleted.sort() };
}

/** 1.10.4 has mirrored since at (gone back to after 2.0's first start): it rewrites a record on every pass. */
async function mirroredSince(at) {
  for (const name of await fs.readdir(MIRROR_DIR).catch(() => [])) {
    if (name.endsWith('.json') && (await fs.stat(path.join(MIRROR_DIR, name)).then((s) => s.mtimeMs > at, () => false))) return true;
  }
  return false;
}

let migrating = null;

/**
 * Once, on the first start of 2.0, which stops mirroring, and again after going back to 1.10.4 mirrored since: what became of each cloud project, for the projects page's
 * notice. A mirrored one is an ordinary project here now, and its copy in the cloud location is left as it is:
 * { id, name, label, changed, deleted } with what that copy has that this computer never received, or missing: the
 * copy isn't there, or unchecked: it couldn't be looked through. One used in place, in a cloud location, keeps
 * working there: { id, name, label, path }. Nothing is written into DATA_DIR/mirror, sync.json or a cloud copy.
 */
export function migrateToV2() {
  migrating ||= (async () => {
    const done = await readJson(MIGRATION_PATH).catch(() => null);
    if (done && !(await mirroredSince(Date.parse(done.ranAt)))) return done;
    const projects = await listProjects();
    const deadline = Date.now() + CHECK_MS;
    const labelOf = async (folder) => (await placeOf(folder).catch(() => null))?.label || path.basename(folder);
    const mirrored = [];
    for (const { id } of await listMirrored()) {
      const project = projects.find((p) => p.id === id && !p.templateDraft);
      const record = project && (await readMirror(id));
      if (!record) continue;
      const found = await cloudChanges(record, deadline).catch((err) => (['ENOENT', 'ENOTDIR'].includes(err.code) ? { missing: true } : { unchecked: true }));
      mirrored.push({ id, name: project.name, label: await labelOf(record.location), ...found });
    }
    // 1.10's cloud locations, read for this alone
    const { folders = [] } = (await readJson(path.join(DATA_DIR, 'sync.json')).catch(() => null)) || {};
    const locations = (Array.isArray(folders) ? folders : []).map((f) => f?.path).filter((p) => typeof p === 'string' && path.isAbsolute(p));
    const inPlace = [];
    for (const p of projects) {
      const location = locations.find((l) => within(p.path, l));
      if (location && !p.templateDraft && !mirrored.some((m) => m.id === p.id)) inPlace.push({ id: p.id, name: p.name, label: await labelOf(p.path), path: p.path });
    }
    const result = { ranAt: new Date().toISOString(), mirrored, inPlace };
    await writeJsonAtomic(MIGRATION_PATH, result);
    return result;
  })().catch((err) => {
    migrating = null;
    throw err;
  });
  return migrating;
}

/** The move to 2.0's notice, until it's dismissed, without the projects moved to this computer since: null when there's nothing to say. */
export async function migrationNotice() {
  const data = await migrateToV2();
  if (data.dismissedAt) return null;
  const inPlace = [];
  for (const p of data.inPlace || []) if ((await getProject(p.id).catch(() => null))?.path === p.path) inPlace.push(p);
  const mirrored = data.mirrored || [];
  return mirrored.length || inPlace.length ? { mirrored, inPlace } : null;
}

export async function dismissMigrationNotice() {
  const data = await migrateToV2();
  migrating = Promise.resolve({ ...data, dismissedAt: new Date().toISOString() });
  await writeJsonAtomic(MIGRATION_PATH, await migrating);
}
