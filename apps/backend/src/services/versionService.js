import { promises as fs, constants as fsConstants } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { diffLines } from 'diff';
import { ensureDir, freePath, listFilesRecursive, readJson, writeFileAtomic, writeJsonAtomic } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { appPath, httpError, serialiser } from './projectService.js';

// Content-addressed history in .spectrum/history:
//   objects/<sha[0:2]>/<sha>.gz   gzipped file bytes, shared between versions
//   manifests/<id>.json           { files: { "<relPath>": "<sha>" } }
//   index.json                    { nextId, versions: VersionMeta[] } (oldest first)

const MAX_TRACKED_BYTES = 50 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  '.tex', '.bib', '.sty', '.cls', '.bst', '.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.tsv',
  '.bbx', '.cbx', '.lbx', '.cfg', '.def', '.clo', '.ltx'
]);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const isText = (relPath) => TEXT_EXTENSIONS.has(path.extname(relPath).toLowerCase());
const historyPath = (root, ...parts) => appPath(root, 'history', ...parts);
const objectPath = (root, sha) => historyPath(root, 'objects', sha.slice(0, 2), `${sha}.gz`);
const manifestPath = (root, id) => historyPath(root, 'manifests', `${id}.json`);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ponytail: one lock for every project's history; per-project locks if it ever matters
const locked = serialiser();

async function readIndex(root) {
  try {
    const data = await readJson(historyPath(root, 'index.json'));
    return { nextId: Number(data.nextId) || 1, versions: Array.isArray(data.versions) ? data.versions : [] };
  } catch (err) {
    if (err.code === 'ENOENT') return { nextId: 1, versions: [] };
    throw err;
  }
}

const writeIndex = (root, index) => writeJsonAtomic(historyPath(root, 'index.json'), index);

async function readManifest(root, id) {
  return (await readJson(manifestPath(root, id))).files || {};
}

async function readObject(root, sha) {
  return gunzipAsync(await fs.readFile(objectPath(root, sha)));
}

const diskFiles = async (root) => (await listFilesRecursive(root)).filter((item) => item.type === 'file').map((item) => item.path);

/**
 * Files a version captures: the visible tree minus compiled PDFs, anything over 50 MB, and
 * anything that can't be read (broken or outside links, no permission) rather than failing.
 */
async function trackedFiles(root) {
  const files = await diskFiles(root);
  const present = new Set(files);
  const tracked = [];
  for (const rel of files) {
    if (path.extname(rel).toLowerCase() === '.pdf' && present.has(`${rel.slice(0, -4)}.tex`)) continue;
    try {
      const abs = safeJoin(root, rel);
      const stat = await fs.stat(abs);
      await fs.access(abs, fsConstants.R_OK);
      if (stat.isFile() && stat.size <= MAX_TRACKED_BYTES) tracked.push(rel);
    } catch {
      // skip it
    }
  }
  return tracked.sort();
}

/** Hash the tracked files; with store=true also save their contents as objects. */
async function snapshotDisk(root, store) {
  const files = {};
  for (const rel of await trackedFiles(root)) {
    let buf;
    try {
      buf = await fs.readFile(path.join(root, rel));
    } catch {
      continue; // unreadable: leave it out
    }
    const sha = sha256(buf);
    files[rel] = sha;
    if (store) {
      const target = objectPath(root, sha);
      try {
        await fs.access(target);
      } catch {
        await writeFileAtomic(target, await gzipAsync(buf));
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
      const before = a ? (await from.read(rel, a)).toString('utf8') : '';
      const after = b ? (await to.read(rel, b)).toString('utf8') : '';
      counts = countLines(before, after);
    }
    changes.push({ path: rel, status, ...counts, binary });
  }
  return changes;
}

const fromHistory = (root, files) => ({ files, read: (_rel, sha) => readObject(root, sha) });
const fromDisk = (root, files) => ({ files, read: (rel) => fs.readFile(path.join(root, rel)) });

function parseId(versionId) {
  const id = Number(versionId);
  if (!Number.isInteger(id) || id < 1) throw httpError('Version not found.', 404);
  return id;
}

function findVersion(index, versionId) {
  const id = parseId(versionId);
  const position = index.versions.findIndex((v) => v.id === id);
  if (position === -1) throw httpError('Version not found.', 404);
  return { version: index.versions[position], position };
}

export async function listVersions(root) {
  return (await readIndex(root)).versions.slice().reverse();
}

async function createVersionUnlocked(root, { label = '', reason = 'manual' } = {}) {
  const index = await readIndex(root);
  const latest = index.versions.at(-1);
  const previous = latest ? await readManifest(root, latest.id) : {};
  const files = await snapshotDisk(root, true);
  if (latest && sameFiles(previous, files)) return { version: latest, unchanged: true };

  const changes = await diffManifests(fromHistory(root, previous), fromHistory(root, files));
  const version = {
    id: index.nextId,
    createdAt: new Date().toISOString(),
    label: String(label || '').slice(0, 120),
    reason: ['manual', 'before-ai', 'before-restore', 'before-transfer'].includes(reason) ? reason : 'manual',
    summary: {
      kind: !latest ? 'initial' : changes.length === 1 ? 'edited' : 'updated',
      files: changes.map((c) => c.path),
      added: changes.reduce((sum, c) => sum + c.added, 0),
      removed: changes.reduce((sum, c) => sum + c.removed, 0)
    }
  };
  await writeJsonAtomic(manifestPath(root, version.id), { files });
  await writeIndex(root, { nextId: version.id + 1, versions: [...index.versions, version] });
  return { version, unchanged: false };
}

/** Save a version unless nothing changed since the latest one. */
export function createVersion(root, options) {
  return locked(() => createVersionUnlocked(root, options));
}

/** What a version changed compared with the version before it. */
export async function versionChanges(root, versionId) {
  const index = await readIndex(root);
  const { version, position } = findVersion(index, versionId);
  const before = position > 0 ? await readManifest(root, index.versions[position - 1].id) : {};
  return diffManifests(fromHistory(root, before), fromHistory(root, await readManifest(root, version.id)));
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
  const { version } = findVersion(await readIndex(root), versionId);
  const changes = await diffManifests(fromHistory(root, await readManifest(root, version.id)), fromDisk(root, await snapshotDisk(root, false)));
  const untracked = await untrackedFiles(root);
  return changes.map((c) => (c.status === 'removed' && untracked.has(c.path) ? { ...c, status: 'untracked', added: 0, removed: 0 } : c));
}

export async function readVersionFile(root, versionId, relPath) {
  const { version } = findVersion(await readIndex(root), versionId);
  const sha = (await readManifest(root, version.id))[relPath];
  if (!sha) return { ok: false, error: 'That file isn’t in this version.' };
  if (!isText(relPath)) return { ok: false, error: 'Binary files can’t be shown.' };
  return { ok: true, content: (await readObject(root, sha)).toString('utf8') };
}

/** Restore the whole project, or one file, after saving a safety version of the current state. */
export function restoreVersion(root, versionId, relPath) {
  return locked(async () => {
    const { version } = findVersion(await readIndex(root), versionId);
    const files = await readManifest(root, version.id);
    if (relPath) safeJoin(root, relPath);
    const { version: safety, unchanged } = await createVersionUnlocked(root, { reason: 'before-restore' });

    // The safety version can't hold untracked files, so move those aside instead of overwriting them.
    const untracked = await untrackedFiles(root);
    const keptAside = [];
    const targets = relPath ? [relPath] : [...new Set([...await trackedFiles(root), ...Object.keys(files)])];
    for (const rel of targets) {
      if (files[rel] && untracked.has(rel)) {
        const ext = path.extname(rel);
        const aside = await freePath(safeJoin(root, `${rel.slice(0, rel.length - ext.length)} (before restore)${ext}`));
        await fs.rename(path.join(root, rel), aside);
        keptAside.push(path.relative(root, aside).split(path.sep).join('/'));
      }
      const abs = safeJoin(root, rel);
      if (files[rel]) {
        await ensureDir(path.dirname(abs));
        await fs.writeFile(abs, await readObject(root, files[rel]));
      } else {
        await fs.rm(abs, { force: true });
      }
    }
    return { safety: unchanged ? null : safety, keptAside };
  });
}

export function renameVersion(root, versionId, label) {
  return locked(async () => {
    const index = await readIndex(root);
    const { version } = findVersion(index, versionId);
    version.label = String(label || '').slice(0, 120);
    await writeIndex(root, index);
    return version;
  });
}

/** Delete a version, then drop objects no remaining version uses. */
export function deleteVersion(root, versionId) {
  return locked(async () => {
    const index = await readIndex(root);
    const { position } = findVersion(index, versionId);
    const [removed] = index.versions.splice(position, 1);
    await writeIndex(root, index);
    await fs.rm(manifestPath(root, removed.id), { force: true });

    const used = new Set();
    for (const v of index.versions) {
      for (const sha of Object.values(await readManifest(root, v.id))) used.add(sha);
    }
    const objectsRoot = historyPath(root, 'objects');
    for (const shard of await fs.readdir(objectsRoot).catch(() => [])) {
      const dir = path.join(objectsRoot, shard);
      for (const name of await fs.readdir(dir).catch(() => [])) {
        if (!used.has(name.replace(/\.gz$/, ''))) await fs.rm(path.join(dir, name), { force: true });
      }
      await fs.rmdir(dir).catch(() => {}); // only when empty
    }
  });
}
