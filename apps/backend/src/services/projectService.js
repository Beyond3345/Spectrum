import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { DATA_DIR, PROJECTS_DIR } from '../config/constants.js';
import { HIDDEN_ENTRIES, ensureDir, listFilesRecursive, readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { isDocumentFile } from '../utils/texUtils.js';
import {
  hideProject,
  inSyncFolder,
  isConflictCopy,
  otherComputersProjects,
  placeOf,
  providerHere,
  publishProjects,
  readSyncConfig,
  sameFolder,
  syncFolderRoots,
  syncedProjectsDir,
  unhideProject,
  within
} from './syncService.js';

// Projects are ordinary folders anywhere on disk. DATA_DIR/registry.json lists them;
// each folder keeps its own metadata, history and chats in a hidden .spectrum/ folder.
const REGISTRY_PATH = path.join(DATA_DIR, 'registry.json');
const ID_RE = /^[A-Za-z0-9_-]+$/;
export const APP_DIR = '.spectrum';

export const appPath = (root, ...parts) => path.join(root, APP_DIR, ...parts);
const metaPath = (root) => appPath(root, 'project.json');

export function httpError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

const exists = (p) => fs.access(p).then(() => true, () => false);

/** Run read-modify-write cycles one at a time so concurrent requests never lose updates. */
export function serialiser() {
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(fn);
    tail = run.catch(() => {});
    return run;
  };
}
const registryLock = serialiser();
// ponytail: one lock for every project's metadata; per-project locks if it ever becomes a bottleneck
const metaLock = serialiser();

// ─── Registry ───

async function readRegistry() {
  try {
    const data = await readJson(REGISTRY_PATH);
    return { version: 1, projects: Array.isArray(data?.projects) ? data.projects : [] };
  } catch (err) {
    if (err.code === 'ENOENT') return { version: 1, projects: [] };
    throw err;
  }
}

function updateRegistry(fn) {
  return registryLock(async () => {
    const registry = await readRegistry();
    const before = JSON.stringify(registry);
    const result = await fn(registry);
    if (JSON.stringify(registry) !== before) await writeJsonAtomic(REGISTRY_PATH, registry);
    return result;
  });
}

// The registry keeps name, tags and archived so a project whose folder is missing still lists right.
const cached = (meta) => ({ name: meta.name, tags: meta.tags, archived: meta.archived });

async function register(id, root, meta) {
  await updateRegistry((registry) => {
    const previous = registry.projects.find((p) => p.id === id);
    registry.projects = registry.projects.filter((p) => p.id !== id && p.path !== root);
    registry.projects.push({ id, path: root, ...cached(meta), addedAt: previous?.addedAt || new Date().toISOString() });
  });
}

function cacheMeta(meta) {
  return updateRegistry((registry) => {
    const entry = registry.projects.find((p) => p.id === meta.id);
    if (entry) Object.assign(entry, cached(meta));
  });
}

/** Forget a project; its folder stays where it is. */
export async function unregister(id) {
  const entry = await findEntry(id);
  await updateRegistry((registry) => {
    registry.projects = registry.projects.filter((p) => p.id !== id);
  });
  // or the next scan of the synced folders brings it back
  if (await inSyncFolder(entry.path)) await hideProject(id);
}

async function findEntry(id) {
  if (!ID_RE.test(String(id || ''))) throw httpError('Project not found.', 404, 'PROJECT_NOT_FOUND');
  const entry = (await readRegistry()).projects.find((p) => p.id === id);
  if (!entry) throw httpError('Project not found.', 404, 'PROJECT_NOT_FOUND');
  return entry;
}

export async function getProjectRoot(id) {
  const entry = await findEntry(id);
  if (!(await exists(metaPath(entry.path)))) {
    throw httpError(`The folder for “${entry.name}” is missing. It may have been moved, renamed or deleted.`, 404, 'PROJECT_MISSING');
  }
  return entry.path;
}

// ─── Metadata ───

function normaliseMeta(meta) {
  const now = new Date().toISOString();
  const next = {
    id: meta.id,
    name: String(meta.name || 'Untitled'),
    createdAt: meta.createdAt || now,
    updatedAt: meta.updatedAt || meta.createdAt || now,
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    archived: !!meta.archived,
    fileOrder: meta.fileOrder && typeof meta.fileOrder === 'object' ? meta.fileOrder : {}
  };
  // templateDraft: the project is a working copy of that template (templateService), last saved to it at templateSavedAt
  for (const key of ['mainFile', 'templateDraft', 'templateSavedAt', 'templateHash']) if (typeof meta[key] === 'string' && meta[key]) next[key] = meta[key];
  return next;
}

export async function readMeta(root) {
  return normaliseMeta(await readJson(metaPath(root)));
}

/** fn receives the current metadata and returns the next one. */
export function updateMeta(root, fn) {
  return metaLock(async () => {
    const meta = await readMeta(root);
    const next = normaliseMeta({ ...(await fn(meta)), id: meta.id });
    await writeJsonAtomic(metaPath(root), next);
    if (JSON.stringify(cached(next)) !== JSON.stringify(cached(meta))) await cacheMeta(next);
    return next;
  });
}

export function touchProject(root) {
  return updateMeta(root, (meta) => ({ ...meta, updatedAt: new Date().toISOString() }));
}

async function describe(entry) {
  let meta = null;
  try {
    meta = await readMeta(entry.path);
  } catch {
    // folder moved or deleted outside the app
  }
  const base = meta || { name: entry.name, createdAt: entry.addedAt, updatedAt: entry.addedAt, tags: entry.tags || [], archived: !!entry.archived };
  const thumb = meta && (await fs.stat(appPath(entry.path, 'thumbnail.png')).catch(() => null));
  const project = {
    id: entry.id,
    name: base.name,
    path: entry.path,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    tags: base.tags,
    archived: base.archived,
    missing: !meta,
    hasThumbnail: !!thumb,
    // the thumbnail URL changes with it, so a recompile shows up without a content edit
    thumbnailAt: thumb ? Math.round(thumb.mtimeMs) : null
  };
  if (base.mainFile) project.mainFile = base.mainFile;
  if (base.templateDraft) project.templateDraft = base.templateDraft;
  // here: the sync app's folder is on this computer, so a missing project may still be on its way
  const place = await placeOf(entry.path);
  if (place) project.place = { ...place, here: !!meta || (await providerHere(place.provider)) };
  return project;
}

export async function listProjects() {
  return Promise.all((await readRegistry()).projects.map(describe));
}

/**
 * The projects page: this computer's projects, with what the synced folders hold found first, and those only
 * another computer lists (`elsewhere`, shown greyed out; only once a synced folder is set up).
 */
export async function projectsPage({ scan = false } = {}) {
  const { folders, hidden } = await readSyncConfig();
  if (!folders.length) return { projects: await listProjects() };
  // a slow folder (online-only, the NAS out of reach) finishes in the background and shows next time
  await Promise.race([scanSyncFolders(scan), new Promise((resolve) => setTimeout(resolve, 2000))]);
  const projects = await listProjects();
  const own = projects.filter((p) => !p.missing && !p.templateDraft);
  await publishProjects(own.map(({ id, name, place }) => ({ id, name, place: place ? { provider: place.provider, label: place.label, rel: place.rel } : null }))).catch(() => {});
  const known = new Set([...projects.map((p) => p.id), ...hidden]);
  const elsewhere = [];
  for (const p of await otherComputersProjects()) {
    if (known.has(p.id) || !ID_RE.test(p.id)) continue;
    known.add(p.id);
    // ponytail: "not on this computer yet" when its sync app is here, without looking for the folder outside the synced folders
    elsewhere.push({ ...p, place: p.place && { ...p.place, here: await providerHere(p.place.provider) } });
  }
  return { projects, elsewhere };
}

// ─── Synced folders ───

let scanning = null;
let scannedAt = 0;

/** Every project folder up to 3 levels into a synced folder, reading only their project.json: [{ id, root, meta }]. */
async function findSyncedProjects(dir, deadline, found = [], depth = 1) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (Date.now() > deadline) break;
    if (!entry.isDirectory() || entry.name.startsWith('.') || HIDDEN_ENTRIES.has(entry.name) || isConflictCopy(entry.name)) continue;
    const sub = path.join(dir, entry.name);
    const { meta, id } = await readMetaId(sub);
    if (id) found.push({ id, root: sub, meta });
    else if (depth < 3) await findSyncedProjects(sub, deadline, found, depth + 1);
  }
  return found;
}

/**
 * List the projects in the synced folders on this computer, at most every 30 s unless forced (the window came to the
 * front). Nothing is written into the folders. A new id is added with its folder here; a listed project whose folder
 * has gone follows its id to the new one (moved, or synced to another place); the same id in two folders is a copy,
 * and the listed one wins (the copy gets its own id when it's opened, through openFolder).
 */
function scanSyncFolders(force) {
  if (scanning || (!force && Date.now() - scannedAt < 30_000)) return scanning;
  scannedAt = Date.now();
  scanning = (async () => {
    const { folders, hidden } = await readSyncConfig();
    const deadline = Date.now() + 20_000;
    const found = [];
    for (const { path: folder } of folders) await findSyncedProjects(folder, deadline, found);
    await updateRegistry(async (registry) => {
      for (const { id, root, meta } of found) {
        // a template's working copy belongs in the app's data folder; one copied into a synced folder is left alone
        if (hidden.includes(id) || meta.templateDraft || registry.projects.some((p) => p.id !== id && (within(p.path, root) || within(root, p.path)))) continue;
        const entry = registry.projects.find((p) => p.id === id);
        if (!entry) {
          registry.projects.push({ id, path: root, ...cached(normaliseMeta({ ...meta, id })), addedAt: new Date().toISOString() });
        } else if (!sameFolder(entry.path, root) && (await readMetaId(entry.path)).id !== id) {
          Object.assign(entry, { path: root }, cached(normaliseMeta({ ...meta, id })));
        }
      }
    });
  })()
    .catch(() => {})
    .finally(() => {
      scanning = null;
    });
  return scanning;
}

export async function getProject(id) {
  return describe(await findEntry(id));
}

/** Change the display name; the folder keeps its name. */
export async function renameProject(id, name) {
  const root = await getProjectRoot(id);
  await updateMeta(root, (m) => ({ ...m, name }));
  return getProject(id);
}

// ─── Folders ───

/** Turn a display name into a safe folder name. */
export function sanitiseFolderName(name) {
  const clean = String(name || '')
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/^\.+/, '')
    .trim();
  let short = Array.from(clean).slice(0, 100).join('').trim();
  // Windows drops a trailing dot or space, and CON, AUX and the like are devices, which TeX and Explorer can't open
  if (process.platform === 'win32') short = short.replace(/[. ]+$/, '').replace(/^(con|prn|aux|nul|com\d|lpt\d)(?=\.|$)/i, '$1_');
  return short || 'Untitled';
}

function expandHome(input) {
  return String(input || '').trim().replace(/^~(?=$|\/)/, os.homedir());
}

/** Create `<parent>/<base>`, or `<base> 2`, `<base> 3`… if that's taken. */
async function makeUniqueFolder(parent, base) {
  for (let n = 1; ; n += 1) {
    const candidate = path.join(parent, n === 1 ? base : `${base} ${n}`);
    try {
      await fs.mkdir(candidate);
      return candidate;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

async function resolveExistingFolder(input) {
  const raw = expandHome(input);
  if (!raw || !path.isAbsolute(raw)) throw httpError('Choose a folder using its full path.', 400);
  let abs;
  try {
    abs = await fs.realpath(raw);
  } catch {
    throw httpError('That folder doesn’t exist.', 400);
  }
  if (!(await fs.stat(abs)).isDirectory()) throw httpError('That path is a file, not a folder.', 400);
  const real = (p) => fs.realpath(p).catch(() => p);
  // the home folder through realpath too: on Windows that's what gives it the letter case abs has
  // and the folders a loose file usually sits in, which a double-click on it would otherwise adopt whole
  const everyday = ['Desktop', 'Downloads', 'Documents'].map((name) => real(path.join(os.homedir(), name)));
  const refused = [path.parse(abs).root, await real(DATA_DIR), await real(PROJECTS_DIR), await real(os.homedir()), ...(await Promise.all(everyday))];
  // a synced folder, or a sync app's own, holds projects
  refused.push(...(await Promise.all((await syncFolderRoots()).map(real))));
  if (refused.includes(abs)) throw httpError('That folder can’t be used as a project. Choose a folder inside it.', 400);
  return abs;
}

/** One project folder inside another would mix their files, versions and chats. */
async function refuseNested(root, projects) {
  for (const p of projects) {
    const other = await fs.realpath(p.path).catch(() => p.path);
    if (other.startsWith(root + path.sep)) {
      throw httpError(`That folder contains “${p.name}”, which is already in the project list.`, 409);
    }
    if (root.startsWith(other + path.sep)) {
      throw httpError(`That folder is inside “${p.name}”, which is already in the project list.`, 409);
    }
  }
}

/**
 * The .tex file that compiles on its own: \documentclass and \begin{document} outside
 * comments. Shallowest first, then main.tex, ms.tex, paper.tex, then by name.
 */
export async function detectMainFile(root) {
  const preferred = ['main.tex', 'ms.tex', 'paper.tex'];
  const rank = (p) => {
    const i = preferred.indexOf(path.posix.basename(p).toLowerCase());
    return i === -1 ? preferred.length : i;
  };
  const found = [];
  for (const item of await listFilesRecursive(root)) {
    if (item.type !== 'file' || !/\.tex$/i.test(item.path)) continue;
    let tex = '';
    try {
      tex = (await fs.readFile(safeJoin(root, item.path), 'utf8')).replace(/(?<!\\)%.*$/gm, '');
    } catch {
      continue;
    }
    if (/\\documentclass\b/.test(tex) && /\\begin\s*\{document\}/.test(tex)) found.push(item.path.split(path.sep).join('/'));
  }
  found.sort((a, b) => a.split('/').length - b.split('/').length || rank(a) - rank(b) || a.localeCompare(b));
  return found[0];
}

/**
 * Create a new project folder under parentDir (default PROJECTS_DIR), fill it with
 * `populate(root)`, then write metadata and register it. Nothing is left behind on failure,
 * or when `signal` aborts before the project is registered.
 */
export async function createProject({ name, parentDir, populate, signal, meta: extra = {} } = {}) {
  const parentInput = expandHome(parentDir) || (await newProjectsDir());
  if (!path.isAbsolute(parentInput)) throw httpError('The location must be a full folder path.', 400);
  await ensureDir(parentInput);
  const parent = await fs.realpath(parentInput);
  const displayName = Array.from(String(name || '').trim()).slice(0, 200).join('') || 'Untitled';
  const root = await makeUniqueFolder(parent, sanitiseFolderName(displayName));
  try {
    if (populate) await populate(root);
    const now = new Date().toISOString();
    const mainFile = extra.mainFile || await detectMainFile(root);
    const meta = normaliseMeta({ ...extra, mainFile, id: crypto.randomUUID(), name: displayName, createdAt: now, updatedAt: now });
    await writeJsonAtomic(metaPath(root), meta);
    signal?.throwIfAborted();
    await register(meta.id, root, meta);
    return getProject(meta.id);
  } catch (err) {
    await fs.rm(root, { recursive: true, force: true });
    throw err;
  }
}

async function readMetaId(root) {
  try {
    const meta = await readJson(metaPath(root));
    return ID_RE.test(String(meta?.id || '')) ? { meta, id: meta.id } : { meta, id: null };
  } catch {
    return { meta: null, id: null };
  }
}

/** Adopt an existing folder as a project without moving or copying anything. */
export async function openFolder(input) {
  const root = await resolveExistingFolder(input);
  const { meta, id: folderId } = await readMetaId(root);
  let id = folderId;
  const { projects } = await readRegistry();
  await refuseNested(root, projects);
  if (id) {
    const other = projects.find((p) => p.id === id && p.path !== root);
    // A Finder copy carries the original's id; give it its own while the original still exists.
    if (other && (await readMetaId(other.path)).id === id) id = null;
  }
  id ||= projects.find((p) => p.path === root)?.id || crypto.randomUUID();
  // a copy of a template draft's folder is a project like any other
  const next = normaliseMeta({ ...(meta || {}), templateDraft: undefined, id, name: (meta?.id === id && meta.name) || path.basename(root) });
  next.mainFile ||= await detectMainFile(root);
  await metaLock(() => writeJsonAtomic(metaPath(root), next));
  await register(id, root, next);
  await unhideProject(id);
  return getProject(id);
}

// APFS and NTFS ignore case
const caseless = (p) => (process.platform === 'darwin' || process.platform === 'win32' ? p.toLowerCase() : p);

/**
 * A .tex, .ltx or .bib file opened from Finder or Explorer: the listed project it's in (the
 * deepest), or else the folder around it adopted as one, which is the nearest with a
 * .spectrum/project.json (a project from another computer) or the file's own folder.
 * Returns the project's id and the file's path in it.
 */
export async function openFile(input) {
  const raw = expandHome(input);
  if (!raw || !path.isAbsolute(raw)) throw httpError('Open a file using its full path.', 400);
  let file;
  try {
    file = await fs.realpath(raw);
  } catch {
    throw httpError('That file doesn’t exist.', 400);
  }
  if (!/\.(tex|ltx|bib)$/i.test(file) || !(await fs.stat(file)).isFile()) throw httpError('Spectrum opens .tex, .ltx and .bib files.', 400);
  const inside = (root) => caseless(file).startsWith(caseless(root) + path.sep);
  const relative = (root) => file.slice(root.length + 1).split(path.sep).join('/');
  const { projects } = await readRegistry();
  const owner = projects.filter((p) => inside(p.path)).sort((a, b) => b.path.length - a.path.length)[0];
  if (owner) return { projectId: owner.id, file: relative(owner.path) };

  const own = path.dirname(file);
  let folder = own;
  let carried = false;
  for (let dir = own; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (await exists(metaPath(dir))) {
      folder = dir;
      carried = true;
      break;
    }
  }
  // a chapter (no \documentclass of its own) or a .bib belongs with the document that uses it: the nearest
  // folder, this one or up to three above, holding a .tex that compiles on its own
  if (!carried && !(await isDocumentFile(file))) {
    for (let dir = own, up = 0; up <= 3 && dir !== path.dirname(dir) && dir !== os.homedir(); dir = path.dirname(dir), up++) {
      const names = (await fs.readdir(dir).catch(() => [])).filter((name) => /\.(tex|ltx)$/i.test(name)).slice(0, 50);
      if (await anyDocument(dir, names)) {
        folder = dir;
        break;
      }
    }
  }
  // the home folder, the projects folder, or one holding listed projects can't be a project; a document's folder
  // that is one of those leaves the file's own folder
  for (const candidate of folder === own ? [own] : [folder, own]) {
    try {
      const project = await openFolder(candidate);
      return { projectId: project.id, file: relative(project.path) };
    } catch (err) {
      if (err.statusCode !== 400 && err.statusCode !== 409) throw err;
    }
  }
  throw httpError(`Spectrum opens a file together with the folder it’s in, and “${path.basename(own) || own}” can’t be a project. Move “${path.basename(file)}” into a folder of its own.`, 400);
}

async function anyDocument(dir, names) {
  for (const name of names) if (await isDocumentFile(path.join(dir, name))) return true;
  return false;
}

/** Point a project at a new folder, e.g. after it was moved in Finder. */
export async function relocateProject(id, input) {
  const entry = await findEntry(id);
  const root = await resolveExistingFolder(input);
  const { meta, id: folderId } = await readMetaId(root);
  const { projects } = await readRegistry();
  if (projects.some((p) => p.id !== id && (p.id === folderId || p.path === root))) {
    throw httpError('That folder belongs to another project in the list.', 409);
  }
  await refuseNested(root, projects.filter((p) => p.id !== id));
  const own = folderId === id ? meta : null;
  const next = normaliseMeta({ ...(own || { createdAt: entry.addedAt }), id, name: own?.name || entry.name });
  await metaLock(() => writeJsonAtomic(metaPath(root), next));
  await register(id, root, next);
  await unhideProject(id);
  return getProject(id);
}

/** Where new projects go unless another folder is chosen: the first synced folder, else the projects folder. */
export async function newProjectsDir() {
  return (await syncedProjectsDir()) || PROJECTS_DIR;
}

/** Where a copy of this project goes: next to it, unless it still lives in the app data folder. */
export function siblingParent(root) {
  const parent = path.dirname(root);
  return parent === DATA_DIR ? PROJECTS_DIR : parent;
}

// ─── Legacy layout ───

/** 1.5.0 kept .aux files in .spectrum/aux, a name OneDrive and Windows refuse; they're in aux-files now. */
export async function dropOldAuxFolders() {
  for (const { path: root } of (await readRegistry()).projects) {
    await fs.rm(appPath(root, 'aux'), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Upstream kept every project in DATA_DIR/<uuid>/ with project.json at the root.
 * Register those in place and move their metadata into .spectrum/. Safe to rerun.
 */
export async function migrateLegacyProjects() {
  let entries = [];
  try {
    entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !ID_RE.test(entry.name)) continue;
    const root = path.join(DATA_DIR, entry.name);
    const legacyPath = path.join(root, 'project.json');
    let legacy;
    try {
      legacy = await readJson(legacyPath);
    } catch {
      continue;
    }
    // Already migrated: a project.json here now is the user's own file.
    if (await exists(metaPath(root))) continue;
    const id = ID_RE.test(String(legacy?.id || '')) ? legacy.id : entry.name;
    // soft-deleted upstream projects come back archived rather than cluttering the list
    const meta = normaliseMeta({ ...legacy, id, archived: legacy.archived || legacy.trashed });
    await writeJsonAtomic(metaPath(root), meta);
    await fs.rm(legacyPath, { force: true });
    await fs.rm(path.join(root, '.snapshots'), { recursive: true, force: true });
    await fs.rm(path.join(root, '.compile'), { recursive: true, force: true });
    if (!(await readRegistry()).projects.some((p) => p.id === id)) await register(id, root, meta);
  }
}
