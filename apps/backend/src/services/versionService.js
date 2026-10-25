import { promises as fs, constants as fsConstants } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { diffLines } from 'diff';
import { ensureDir, freePath, listFilesRecursive, readJson, renameOver, writeFileAtomic, writeJsonAtomic } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { appPath, httpError, serialiser } from './projectService.js';

// Content-addressed history in .spectrum/history, which a sync app may share between computers:
//   objects/<sha[0:2]>/<sha>.gz   gzipped file bytes, shared between versions
//   manifests/<id>.json           { files: { "<relPath>": "<sha>" }, skipped?, createdAt, label, reason, summary, since? }
//   index.json                    { nextId, versions: (VersionMeta & { manifestLabel? })[] } (oldest first)
// Versions are the manifests on disk, whichever computer wrote them. 1.7.0 numbered them from index.json's nextId,
// so two computers made the same number and overwrote each other's manifests. Ids are now the second and random
// digits, still whole numbers as 1.7.0 needs, and index.json is rewritten with every version on disk and a nextId
// above them all, so 1.7.0 lists them and never reuses one. Manifests 1.7.0 made have only files; their details
// stay in index.json. 1.7.0 renames a version in index.json only; manifestLabel, the label the manifest had when
// index.json was written, tells such a rename apart from an index.json that's just behind.

const MAX_TRACKED_BYTES = 50 * 1024 * 1024;
// 1.7.0's ids count from 1; every id made since is far above
const LEGACY_IDS = 1e9;
const EPOCH_2026 = Date.UTC(2026, 0, 1);
// compile: saved after a successful compile, the one automatic kind; 1.10.4 lists those as manual
const REASONS = ['manual', 'before-ai', 'before-restore', 'before-transfer', 'compile'];
const DAY_MS = 24 * 60 * 60 * 1000;
// a compile's checkpoint takes the place of the last one compiles made within this long of its first
const COMPILE_WINDOW_MS = 10 * 60 * 1000;
const TEXT_EXTENSIONS = new Set([
  '.tex', '.bib', '.sty', '.cls', '.bst', '.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.tsv',
  '.bbx', '.cbx', '.lbx', '.cfg', '.def', '.clo', '.ltx', '.mmd', '.typ', '.markdown'
]);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const isText = (relPath) => TEXT_EXTENSIONS.has(path.extname(relPath).toLowerCase());
const historyPath = (root, ...parts) => appPath(root, 'history', ...parts);
const objectPath = (root, sha) => historyPath(root, 'objects', sha.slice(0, 2), `${sha}.gz`);
const manifestPath = (root, id) => historyPath(root, 'manifests', `${id}.json`);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// one lock per project's history, which every checkpoint takes, the mirror's Before sync too: a compile's can't then
// take the place of one saved meanwhile, nor remove a stored file it uses
const locks = new Map();
const lockFor = (root) => {
  const key = path.resolve(root);
  if (!locks.has(key)) locks.set(key, serialiser());
  return locks.get(key);
};
// stored files this run of the app wrote, which a compile's checkpoint taking another's place may remove again
const written = new Set();

async function readIndex(root) {
  try {
    const data = await readJson(historyPath(root, 'index.json'));
    return { nextId: Number(data.nextId) || 1, versions: Array.isArray(data.versions) ? data.versions : [] };
  } catch (err) {
    if (err.code === 'ENOENT') return { nextId: 1, versions: [], missing: true };
    throw err;
  }
}

const details = (v) => ({ createdAt: v.createdAt, label: v.label, reason: v.reason, summary: v.summary });

const exists = (file) => fs.access(file).then(() => true, () => false);

/** index.json with every version on disk (oldest first) and a nextId above them all and any deleted, for 1.7.0. */
async function writeIndex(root, versions) {
  const old = await readIndex(root);
  const ids = new Set(versions.map((v) => v.id));
  // a manifest that couldn't be read (online-only and offline, still arriving) keeps its entry, for a 1.7.0
  // version the only copy of its details; a deleted version's manifest is gone by now
  const kept = [];
  for (const v of old.versions) if (!ids.has(v.id) && (await exists(manifestPath(root, v.id)))) kept.push(v);
  for (const v of versions) {
    if (v.manifestLabel === undefined || v.label === v.manifestLabel) continue;
    // renamed in 1.7.0: the manifest takes the label too, so it isn't only in index.json
    const data = await readJson(manifestPath(root, v.id)).catch(() => null);
    if (!data) continue;
    await writeJsonAtomic(manifestPath(root, v.id), { ...data, label: v.label });
    v.manifestLabel = v.label;
  }
  const entries = versions.map((v) => ({ id: v.id, ...details(v), ...(v.manifestLabel !== undefined && { manifestLabel: v.manifestLabel }) }));
  await writeJsonAtomic(historyPath(root, 'index.json'), {
    nextId: Math.max(old.nextId, ...[...kept, ...versions].map((v) => Number(v.id) + 1 || 0)),
    versions: [...kept, ...entries].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id - b.id)
  });
}

/**
 * Every version whose manifest is on disk, oldest first, each with its files and a number to show (1.7.0's
 * versions keep theirs; later ones count on from them by time). partial: a manifest couldn't be read, as when
 * it's still arriving from another computer. unindexed: index.json is here but misses a version this build made,
 * as when another computer's index.json won a sync conflict.
 */
async function readVersions(root) {
  const index = await readIndex(root);
  const fromIndex = new Map(index.versions.map((v) => [v.id, v]));
  const dir = historyPath(root, 'manifests');
  const versions = [];
  let partial = false;
  let unindexed = false;
  for (const name of await fs.readdir(dir).catch(() => [])) {
    // <id>.json: not a temp file, or a sync app's conflict copy
    const id = Number(name.match(/^(\d+)\.json$/)?.[1]);
    if (!Number.isSafeInteger(id) || id < 1) continue;
    let data;
    try {
      data = await readJson(path.join(dir, name));
    } catch {
      partial = true;
      continue;
    }
    const entry = fromIndex.get(id);
    const own = Boolean(data.createdAt);
    if (own && !entry && !index.missing) unindexed = true;
    const meta = own ? data : entry || { createdAt: (await fs.stat(path.join(dir, name))).mtime.toISOString() };
    const manifestLabel = own ? String(data.label || '') : undefined;
    // renamed in 1.7.0 since this build last wrote index.json
    const renamed = own && entry && entry.manifestLabel === manifestLabel && entry.label !== manifestLabel;
    versions.push({
      id,
      createdAt: String(meta.createdAt),
      label: String((renamed ? entry : meta).label || ''),
      manifestLabel,
      reason: REASONS.includes(meta.reason) ? meta.reason : 'manual',
      summary: meta.summary && typeof meta.summary === 'object' ? meta.summary : { kind: 'updated', files: [], added: 0, removed: 0 },
      files: data.files || {},
      skipped: new Set(Array.isArray(data.skipped) ? data.skipped : []),
      since: typeof data.since === 'string' ? data.since : undefined
    });
  }
  versions.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  let shown = 0;
  for (const v of versions) {
    // a 1.7.0 id another version's number already took (1.7.0 on another computer, its index.json behind) counts on
    v.number = v.id < LEGACY_IDS && v.id > shown ? v.id : shown + 1;
    shown = Math.max(shown, v.number);
  }
  return { versions, partial, unindexed };
}

const shownVersion = (v) => ({ id: v.id, number: v.number, ...details(v) });

/** One version's files, read from its manifest. */
async function readVersion(root, versionId) {
  const id = parseId(versionId);
  let data;
  try {
    data = await readJson(manifestPath(root, id));
  } catch (err) {
    if (err.code === 'ENOENT' || err instanceof SyntaxError) throw httpError('Checkpoint not found.', 404);
    throw err;
  }
  return { id, files: data.files || {}, skipped: new Set(Array.isArray(data.skipped) ? data.skipped : []) };
}

async function readObject(root, sha) {
  return gunzipAsync(await fs.readFile(objectPath(root, sha)));
}

const diskFiles = async (root) => (await listFilesRecursive(root)).filter((item) => item.type === 'file').map((item) => item.path);

/**
 * Files a version captures: the visible tree minus compiled PDFs, anything over 50 MB (those go in `large`), and
 * anything that can't be read (broken or outside links, no permission) rather than failing;
 * those go in `skipped`.
 */
async function trackedFiles(root, skipped = [], large = []) {
  const files = await diskFiles(root);
  const present = new Set(files);
  const tracked = [];
  for (const rel of files) {
    if (path.extname(rel).toLowerCase() === '.pdf' && present.has(`${rel.slice(0, -4)}.tex`)) continue;
    try {
      const abs = safeJoin(root, rel);
      const stat = await fs.stat(abs);
      await fs.access(abs, fsConstants.R_OK);
      if (stat.isFile()) (stat.size <= MAX_TRACKED_BYTES ? tracked : large).push(rel);
    } catch {
      skipped.push(rel);
    }
  }
  return tracked.sort();
}

/** Hash the tracked files; with store=true also save their contents as objects. Unreadable ones go in `skipped`. */
async function snapshotDisk(root, store, skipped = [], large = []) {
  const files = {};
  for (const rel of await trackedFiles(root, skipped, large)) {
    let buf;
    try {
      buf = await fs.readFile(path.join(root, rel));
    } catch {
      skipped.push(rel); // unreadable (online-only and offline, say): leave it out
      continue;
    }
    const sha = sha256(buf);
    files[rel] = sha;
    if (store) {
      const target = objectPath(root, sha);
      try {
        await fs.access(target);
      } catch {
        await writeFileAtomic(target, await gzipAsync(buf));
        written.add(target);
      }
    }
  }
  return files;
}

const sameFiles = (a, b) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

const lineCount = (text) => (text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0);

function countLines(before, after) {
  // huge rewrites can make the diff slow; past the time limit count every line as changed
  const parts = diffLines(before, after, { timeout: 2000 });
  if (!parts) return { added: lineCount(after), removed: lineCount(before) };
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    if (part.added) added += part.count;
    if (part.removed) removed += part.count;
  }
  return { added, removed };
}

/**
 * Per-file changes going from `from` to `to`. Each side is { files, read(rel, sha) }.
 */
async function diffManifests(from, to) {
  const paths = [...new Set([...Object.keys(from.files), ...Object.keys(to.files)])].sort();
  const changes = [];
  for (const rel of paths) {
    const a = from.files[rel];
    const b = to.files[rel];
    if (a === b) continue;
    const status = !a ? 'added' : !b ? 'removed' : 'modified';
    const binary = !isText(rel);
    let counts = { added: 0, removed: 0 };
    if (!binary) {
      try {
        const before = a ? (await from.read(rel, a)).toString('utf8') : '';
        const after = b ? (await to.read(rel, b)).toString('utf8') : '';
        // a file added or removed is all its lines, which diffing against nothing takes seconds to say for a big .csv
        counts = !a ? { added: lineCount(after), removed: 0 } : !b ? { added: 0, removed: lineCount(before) } : countLines(before, after);
      } catch {
        // a stored file still to arrive from another computer: no line counts, rather than no new version
      }
    }
    changes.push({ path: rel, status, ...counts, binary });
  }
  return changes;
}

const fromHistory = (root, files) => ({ files, read: (_rel, sha) => readObject(root, sha) });
const fromDisk = (root, files) => ({ files, read: (rel) => fs.readFile(path.join(root, rel)) });

function parseId(versionId) {
  const id = Number(versionId);
  if (!Number.isSafeInteger(id) || id < 1) throw httpError('Checkpoint not found.', 404);
  return id;
}

function findVersion(versions, versionId) {
  const id = parseId(versionId);
  const position = versions.findIndex((v) => v.id === id);
  if (position === -1) throw httpError('Checkpoint not found.', 404);
  return { version: versions[position], position };
}

export async function listVersions(root) {
  const { versions, unindexed } = await readVersions(root);
  // put them back for 1.7.0, which otherwise doesn't list them and deletes their stored files in its clean-up
  // ponytail: a version another computer has just deleted can be written back as an entry here when its index.json
  // arrives before the manifest's deletion; the entry then lists a version that won't open (its contents are never
  // at risk). Repair only ids at or above index.json's nextId if that ever matters
  if (unindexed) {
    await lockFor(root)(async () => {
      const again = await readVersions(root);
      if (again.unindexed) await writeIndex(root, again.versions);
    }).catch(() => {}); // listing still works where index.json can't be written
  }
  return versions.map(shownVersion).reverse();
}

/** An id another computer won't also make: the second since 2026 and three random digits. */
async function newId(root, versions) {
  const taken = new Set(versions.map((v) => v.id));
  let id = Math.floor((Date.now() - EPOCH_2026) / 1000) * 1000 + crypto.randomInt(1000);
  // or a manifest still arriving
  while (taken.has(id) || (await exists(manifestPath(root, id)))) id += 1;
  return id;
}

/** createVersion inside the project's history lock (restoreVersion's). skipped: what it couldn't capture, unreadable or over 50 MB. */
async function saveVersion(root, { label = '', reason = 'manual' } = {}) {
  const { versions, partial } = await readVersions(root);
  const latest = versions.at(-1);
  const skipped = [];
  const large = [];
  const files = await snapshotDisk(root, true, skipped, large);
  // a file that can't be read now keeps what the latest version had of it, and restoring leaves it as it is
  for (const rel of skipped) if (latest?.files[rel]) files[rel] = latest.files[rel];
  if (latest && sameFiles(latest.files, files)) {
    // a checkpoint asked for that only matches a compile's, which the next compile would replace: that one becomes it,
    // dated now, as what is shown with it (an agent's Restore row) looks for one made from then on. Still the latest
    if (latest.reason === 'compile' && !latest.label && (reason !== 'compile' || label)) {
      Object.assign(latest, { createdAt: new Date().toISOString(), reason: REASONS.includes(reason) ? reason : 'manual', label: String(label || '').slice(0, 120) });
      await writeJsonAtomic(manifestPath(root, latest.id), { ...(await readJson(manifestPath(root, latest.id))), ...details(latest) });
      latest.manifestLabel = latest.label;
      await writeIndex(root, versions);
    }
    return { version: shownVersion(latest), unchanged: true, skipped: [] };
  }

  // compiles leave at most one checkpoint every 10 minutes: the latest one in that time takes the place of the others,
  // unless one was given a name. Not when the files are an older checkpoint's: a restore 1.10.4 made, which saves no
  // safety copy when nothing changed since its latest (this compile's, to it a manual one), so that one holds the
  // only copy of what the restore replaced
  const since = latest?.since || latest?.createdAt;
  const restored = versions.some((v) => v !== latest && sameFiles(v.files, files));
  const replaceable = reason === 'compile' && latest?.reason === 'compile' && !latest.label && !restored && Date.now() - Date.parse(since) < COMPILE_WINDOW_MS;
  const replaced = replaceable ? versions.pop() : null;
  const previous = versions.at(-1);
  const changes = await diffManifests(fromHistory(root, previous?.files || {}), fromHistory(root, files));
  const version = {
    id: await newId(root, versions),
    createdAt: new Date().toISOString(),
    label: String(label || '').slice(0, 120),
    reason: REASONS.includes(reason) ? reason : 'manual',
    summary: {
      kind: !previous ? 'initial' : changes.length === 1 ? 'edited' : 'updated',
      files: changes.map((c) => c.path),
      added: changes.reduce((sum, c) => sum + c.added, 0),
      removed: changes.reduce((sum, c) => sum + c.removed, 0)
    },
    number: Math.max(0, ...versions.map((v) => v.number)) + 1
  };
  version.manifestLabel = version.label;
  await writeJsonAtomic(manifestPath(root, version.id), { files, ...(skipped.length && { skipped }), ...details(version), ...(replaced && { since }) });
  // before index.json is written, which would otherwise keep an entry for it. Tidying only: one that can't be removed
  // (read-only, say) stays as an ordinary compile checkpoint, and the checkpoint just saved still counts as saved
  const gone = replaced && (await fs.rm(manifestPath(root, replaced.id), { force: true }).then(() => true, () => false));
  await writeIndex(root, [...versions, version]);
  // and the stored files only it used that this run of the app wrote, which the 90-day clean-up would keep, every
  // compile's, for months. Not while a manifest can't be read, nor when the one replaced stayed, which still uses them.
  // ponytail: a sync app's other computer that saved a checkpoint of the same text, whose manifest hasn't arrived yet,
  // loses that file of it; a list of every computer's manifests would close that
  if (gone && !partial) {
    const used = new Set([...versions.flatMap((v) => Object.values(v.files)), ...Object.values(files)]);
    for (const sha of new Set(Object.values(replaced.files))) {
      const target = objectPath(root, sha);
      // one left behind is used by nothing, and harmless
      if (!used.has(sha) && written.delete(target)) await fs.rm(target, { force: true }).catch(() => {});
    }
  }
  return { version: shownVersion(version), unchanged: false, skipped: [...skipped, ...large] };
}

/** Save a version unless nothing changed since the latest one. */
export function createVersion(root, options) {
  return lockFor(root)(() => saveVersion(root, options));
}

/**
 * A checkpoint after a successful compile, unless nothing changed since the latest one: { saved, id?, skipped?, error? }.
 * skipped: files it couldn't capture; error: it couldn't be saved at all.
 */
export async function createCompileCheckpoint(root) {
  try {
    const { version, unchanged, skipped } = await createVersion(root, { reason: 'compile' });
    return unchanged ? { saved: false } : { saved: true, id: version.id, ...(skipped.length && { skipped }) };
  } catch (err) {
    return { saved: false, error: err.message };
  }
}

/** What a version changed compared with the version before it. */
export async function versionChanges(root, versionId) {
  const { versions } = await readVersions(root);
  const { version, position } = findVersion(versions, versionId);
  const before = position > 0 ? versions[position - 1].files : {};
  return diffManifests(fromHistory(root, before), fromHistory(root, version.files));
}

/** Files on disk that versions don't capture (too big, compiled PDFs, unreadable). */
async function untrackedFiles(root) {
  const tracked = new Set(await trackedFiles(root));
  return new Set((await diskFiles(root)).filter((rel) => !tracked.has(rel)));
}

/**
 * What differs going from a version to the files on disk now. A file the version has that
 * is still on disk but no longer tracked is 'untracked', not 'removed'.
 */
export async function compareWithCurrent(root, versionId) {
  const { files } = await readVersion(root, versionId);
  const changes = await diffManifests(fromHistory(root, files), fromDisk(root, await snapshotDisk(root, false)));
  const untracked = await untrackedFiles(root);
  return changes.map((c) => (c.status === 'removed' && untracked.has(c.path) ? { ...c, status: 'untracked', added: 0, removed: 0 } : c));
}

export async function readVersionFile(root, versionId, relPath) {
  const sha = (await readVersion(root, versionId)).files[relPath];
  if (!sha) return { ok: false, error: 'That file isn’t in this checkpoint.' };
  if (!isText(relPath)) return { ok: false, error: 'Binary files can’t be shown.' };
  return { ok: true, content: (await readObject(root, sha)).toString('utf8') };
}

/** Restore the whole project, or one file, after saving a safety version of the current state. */
export function restoreVersion(root, versionId, relPath) {
  return lockFor(root)(async () => {
    const { files, skipped } = await readVersion(root, versionId);
    if (relPath) safeJoin(root, relPath);
    if (relPath && skipped.has(relPath)) throw httpError('That file couldn’t be read when this checkpoint was saved, so it isn’t in it.', 400);
    // a version from another computer whose stored files haven't all synced yet would only half restore
    for (const sha of new Set(relPath ? [files[relPath]].filter(Boolean) : Object.values(files))) {
      if (!(await exists(objectPath(root, sha)))) {
        throw httpError('Some of this checkpoint’s files haven’t arrived from your other computer yet. Try again once syncing has finished.', 409);
      }
    }
    const { version: safety, unchanged } = await saveVersion(root, { reason: 'before-restore' });

    // The safety version can't hold untracked files, so move those aside instead of overwriting them.
    const untracked = await untrackedFiles(root);
    const keptAside = [];
    const targets = relPath ? [relPath] : [...new Set([...await trackedFiles(root), ...Object.keys(files)])];
    for (const rel of targets) {
      // couldn't be read for the version (online-only and offline, say): neither replaced nor deleted
      if (skipped.has(rel)) continue;
      if (files[rel] && untracked.has(rel)) {
        const ext = path.extname(rel);
        const aside = await freePath(safeJoin(root, `${rel.slice(0, rel.length - ext.length)} (before restore)${ext}`));
        await renameOver(path.join(root, rel), aside);
        keptAside.push(path.relative(root, aside).split(path.sep).join('/'));
      }
      const abs = safeJoin(root, rel);
      if (files[rel]) {
        await ensureDir(path.dirname(abs));
        // through a temp file, which Windows' brief locks and a read-only file don't stop; a link keeps its target
        await writeFileAtomic(await fs.realpath(abs).catch(() => abs), await readObject(root, files[rel]));
      } else {
        await fs.rm(abs, { force: true });
      }
    }
    return { safety: unchanged ? null : safety, keptAside };
  });
}

export function renameVersion(root, versionId, label) {
  return lockFor(root)(async () => {
    const { versions } = await readVersions(root);
    const { version } = findVersion(versions, versionId);
    version.label = String(label || '').slice(0, 120);
    // the manifest carries the label, and from now on the rest of a 1.7.0 version's details too
    const data = await readJson(manifestPath(root, version.id));
    await writeJsonAtomic(manifestPath(root, version.id), { ...data, ...details(version) });
    version.manifestLabel = version.label;
    await writeIndex(root, versions);
    return shownVersion(version);
  });
}

/** Delete a version, then drop stored files no remaining version uses. */
export function deleteVersion(root, versionId) {
  return lockFor(root)(async () => {
    const { versions, partial } = await readVersions(root);
    const { position } = findVersion(versions, versionId);
    const [removed] = versions.splice(position, 1);
    await removeVersions(root, [removed], versions, partial);
  });
}

/** Delete the automatic checkpoints (compiles', unless given a name) saved more than `days` days ago. Resolves how many went. */
export function deleteAutomaticVersions(root, days) {
  return lockFor(root)(async () => {
    const { versions, partial } = await readVersions(root);
    const cutoff = Date.now() - days * DAY_MS;
    const old = versions.filter((v) => v.reason === 'compile' && !v.label && Date.parse(v.createdAt) < cutoff);
    if (old.length) await removeVersions(root, old, versions.filter((v) => !old.includes(v)), partial);
    return old.length;
  });
}

/** Remove versions' manifests, then the stored files none of the rest uses. */
async function removeVersions(root, removed, versions, partial) {
  for (const v of removed) await fs.rm(manifestPath(root, v.id), { force: true });
  await writeIndex(root, versions);
  // a manifest that couldn't be read may use any of them
  if (partial) return;

  const used = new Set(versions.flatMap((v) => Object.values(v.files)));
  // ponytail: a stored file goes only when no manifest here uses it and it came more than 90 days ago (as long
  // as syncService trusts another computer's list), as a version another computer made may still be on its way,
  // even from a laptop away for weeks; one reused from longer ago isn't kept by this, which only a list of every
  // computer's versions would fix
  const cutoff = Date.now() - 90 * DAY_MS;
  const objectsRoot = historyPath(root, 'objects');
  for (const shard of await fs.readdir(objectsRoot).catch(() => [])) {
    const dir = path.join(objectsRoot, shard);
    for (const name of await fs.readdir(dir).catch(() => [])) {
      if (used.has(name.replace(/\.gz$/, ''))) continue;
      const stat = await fs.stat(path.join(dir, name)).catch(() => null);
      // ctime: when the file came to this disk, which a sync app may leave out of mtime
      if (stat && Math.max(stat.mtimeMs, stat.ctimeMs) < cutoff) await fs.rm(path.join(dir, name), { force: true });
    }
    await fs.rmdir(dir).catch(() => {}); // only when empty
  }
}
