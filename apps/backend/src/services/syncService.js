// Projects shared between computers through a sync folder (Synology Drive, OneDrive, Dropbox, iCloud): which
// folders this computer treats as synced, this computer's id, and the shared folder for what follows the user
// (settings, templates, the list of each computer's projects).
//
// DATA_DIR/sync.json, this computer's own (never synced, and kept apart from registry.json, which 1.7.0 rewrites
// without fields it doesn't know):
//   { machineId, machineName, folders: [{ path, place? }], hidden: [projectId] }
// place is where the folder was in its sync app's folder when it was added, so a project in it still says
// which app it's waiting for after that app's folder has gone.
// <first synced folder>/.spectrum-shared/: one file per computer where several computers write (never a shared
// file two computers rewrite, which a sync client would split into conflict copies)
//   machines/<machineId>.json: { machineName, updatedAt, projects: [{ id, name, place }] }
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DATA_DIR } from '../config/constants.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { looksLikeConflictCopy } from '../utils/conflictCopies.js';

const CONFIG_PATH = path.join(DATA_DIR, 'sync.json');
export const SHARED_DIR_NAME = '.spectrum-shared';

const execFileAsync = promisify(execFile);
let cached = null;

/** What the user calls this computer: macOS's name for it in Sharing settings, elsewhere its network name. */
export async function defaultMachineName() {
  const mac = process.platform === 'darwin' && (await execFileAsync('scutil', ['--get', 'ComputerName'], { timeout: 2000 }).then((r) => r.stdout.trim(), () => ''));
  return mac || os.hostname().replace(/\..*$/, '');
}

/** This computer's sync settings, with a machine id made on first use. */
export function readSyncConfig() {
  // one read for every caller, so two at once can't each make a machine id
  cached ||= loadSyncConfig().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

async function loadSyncConfig() {
  let data = {};
  try {
    data = await readJson(CONFIG_PATH);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const config = {
    machineId: typeof data.machineId === 'string' && /^[0-9a-f-]{8,}$/i.test(data.machineId) ? data.machineId : crypto.randomUUID(),
    machineName: typeof data.machineName === 'string' && data.machineName.trim() ? data.machineName.trim() : await defaultMachineName(),
    folders: Array.isArray(data.folders) ? data.folders.filter((f) => f && typeof f.path === 'string' && path.isAbsolute(f.path)) : [],
    hidden: Array.isArray(data.hidden) ? data.hidden.filter((id) => typeof id === 'string') : []
  };
  if (config.machineId !== data.machineId) await writeJsonAtomic(CONFIG_PATH, config);
  return config;
}

/** Changes this computer's sync settings (fn gets a copy and returns the next one). */
export async function updateSyncConfig(fn) {
  const next = await fn(structuredClone(await readSyncConfig()));
  await writeJsonAtomic(CONFIG_PATH, next);
  cached = Promise.resolve(next);
  roots = null;
  return next;
}

export async function machineId() {
  return (await readSyncConfig()).machineId;
}

const isDir = (p) => fs.stat(p).then((s) => s.isDirectory(), () => false);
const exists = (p) => fs.access(p).then(() => true, () => false);

/** The shared folder in the first synced folder that exists here, or null when none is set up. */
export async function sharedDir() {
  for (const { path: folder } of (await readSyncConfig()).folders) {
    if (await isDir(folder)) return path.join(folder, SHARED_DIR_NAME);
  }
  return null;
}

// ─── The sync apps' folders ───

export const PROVIDERS = { synology: 'Synology Drive', onedrive: 'OneDrive', dropbox: 'Dropbox', google: 'Google Drive', icloud: 'iCloud Drive' };
// Synology's documented marker in the folder of a classic sync task
const MARKER = '.SynologyWorkingDirectory';
// macOS asks before an app looks inside these, so the marker check passes them by
const PROTECTED = new Set(['Desktop', 'Documents', 'Downloads', 'Library', 'Movies', 'Music', 'Pictures']);

// APFS and NTFS ignore case
const caseless = (p) => (process.platform === 'darwin' || process.platform === 'win32' ? p.toLowerCase() : p);
export const sameFolder = (a, b) => caseless(a) === caseless(b);
/** p is root or inside it */
export const within = (p, root) => sameFolder(p, root) || caseless(p).startsWith(caseless(root.endsWith(path.sep) ? root : root + path.sep));
const relFrom = (root, p) => p.slice(root.length).split(path.sep).filter(Boolean).join('/');

/** OneDrive's folders as its own settings list them, for when the environment doesn't say. */
async function oneDriveFromRegistry() {
  try {
    const { stdout } = await execFileAsync('reg', ['query', 'HKCU\\Software\\Microsoft\\OneDrive\\Accounts', '/s', '/v', 'UserFolder'], { windowsHide: true, timeout: 5000 });
    return [...stdout.matchAll(/UserFolder\s+REG_(?:EXPAND_)?SZ\s+(.+)/g)].map((m) => m[1].trim());
  } catch {
    return [];
  }
}

/** The sync apps' folders on this computer: [{ path, provider, label }]. Only names are read, never what's in them. */
export async function detectSyncRoots() {
  const home = os.homedir();
  const found = [];
  const add = async (p, provider) => {
    if (typeof p === 'string' && path.isAbsolute(p) && !found.some((r) => sameFolder(r.path, p)) && (await isDir(p))) {
      found.push({ path: p, provider, label: PROVIDERS[provider] });
    }
  };
  if (process.platform === 'darwin') {
    // File Provider folders, named <Provider>-<Account> (Synology's are its On-demand tasks)
    const cloud = path.join(home, 'Library', 'CloudStorage');
    for (const name of await fs.readdir(cloud).catch(() => [])) {
      const provider = { OneDrive: 'onedrive', SynologyDrive: 'synology', Dropbox: 'dropbox', GoogleDrive: 'google' }[name.split('-')[0]];
      if (provider) await add(path.join(cloud, name), provider);
    }
    await add(path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), 'icloud');
  }
  if (process.platform === 'win32') {
    const onedrive = ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer'].map((name) => process.env[name]).filter(Boolean);
    for (const p of onedrive.length ? onedrive : await oneDriveFromRegistry()) await add(p, 'onedrive');
    await add(path.join(home, 'iCloudDrive'), 'icloud');
  }
  // Dropbox says where its folders are (help.dropbox.com/installs/locate-dropbox-folder)
  const infos = process.platform === 'win32'
    ? [process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean).map((dir) => path.join(dir, 'Dropbox', 'info.json'))
    : [path.join(home, '.dropbox', 'info.json')];
  for (const file of infos) {
    const info = await readJson(file).catch(() => null);
    for (const account of Object.values(info && typeof info === 'object' ? info : {})) await add(account?.path, 'dropbox');
  }
  // classic Synology tasks go anywhere; ~/SynologyDrive is the default
  for (const entry of await fs.readdir(home, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || (process.platform === 'darwin' && PROTECTED.has(entry.name))) continue;
    if (await exists(path.join(home, entry.name, MARKER))) await add(path.join(home, entry.name), 'synology');
  }
  return found;
}

// ponytail: a sync app set up while Spectrum runs is seen within a minute, or when the synced folders change
let roots = null;
let rootsAt = 0;
const marked = new Map();

/** detectSyncRoots, kept for a minute, and only once a synced folder is set up: before that nothing here looks. */
async function syncRoots() {
  if (!(await readSyncConfig()).folders.length) return [];
  if (!roots || Date.now() - rootsAt > 60_000) {
    roots = detectSyncRoots();
    rootsAt = Date.now();
    marked.clear();
  }
  return roots;
}

/** The nearest folder at or above p with Synology's marker. */
async function synologyRootOf(p) {
  for (let dir = p; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (!marked.has(dir)) marked.set(dir, exists(path.join(dir, MARKER)));
    if (await marked.get(dir)) return dir;
  }
  return null;
}

async function locate(p, appRoots, folders) {
  const root = appRoots.filter((r) => within(p, r.path)).sort((a, b) => b.path.length - a.path.length)[0];
  if (root) return { provider: root.provider, label: root.label, rel: relFrom(root.path, p) };
  // a synced folder whose app's folder has gone (Drive Client signed out, a drive not plugged in)
  const known = folders.find((f) => f.place && within(p, f.path));
  if (known) return { ...known.place, rel: [known.place.rel, relFrom(known.path, p)].filter(Boolean).join('/') };
  const marker = await synologyRootOf(p);
  return marker ? { provider: 'synology', label: PROVIDERS.synology, rel: relFrom(marker, p) } : null;
}

/**
 * Where a folder is in a sync app's folder: { provider, label, rel }, rel '/'-separated from the top of that
 * folder (the same on every computer), e.g. { provider: 'synology', label: 'Synology Drive', rel: 'Spectrum/Thesis' }.
 * Null outside them, and always until a synced folder is set up.
 */
export async function placeOf(p) {
  const { folders } = await readSyncConfig();
  return folders.length ? locate(p, await syncRoots(), folders) : null;
}

/** placeOf for a folder being added, before it's one of the synced folders. */
export async function placeOfNew(p) {
  return locate(p, await detectSyncRoots(), []);
}

/** The sync app's folder is on this computer. */
export async function providerHere(provider) {
  for (const r of await syncRoots()) if (r.provider === provider && (await isDir(r.path))) return true;
  for (const f of (await readSyncConfig()).folders) if (f.place?.provider === provider && (await isDir(f.path))) return true;
  return false;
}

/** Folders that hold projects rather than being one: the synced folders and the sync apps' own. */
export async function syncFolderRoots() {
  return [...(await readSyncConfig()).folders.map((f) => f.path), ...(await syncRoots()).map((r) => r.path)];
}

/** The first synced folder that exists here, where new projects go, or null. */
export async function syncedProjectsDir() {
  const shared = await sharedDir();
  return shared && path.dirname(shared);
}

export async function inSyncFolder(p) {
  return (await readSyncConfig()).folders.some((f) => within(p, f.path));
}

/** Keep a project the user removed from the list from coming back with the next scan, or from another computer's list. */
export async function hideProject(id) {
  if (!(await readSyncConfig()).hidden.includes(id)) await updateSyncConfig((c) => ({ ...c, hidden: [...c.hidden, id] }));
}

/** List it again: the user opened it. */
export async function unhideProject(id) {
  if ((await readSyncConfig()).hidden.includes(id)) await updateSyncConfig((c) => ({ ...c, hidden: c.hidden.filter((h) => h !== id) }));
}

/**
 * A sync app's copy of something two computers changed at once: Synology's
 * <name>_<computer>_<Mon-DD-HHMM[SS]-YYYY>_<reason>[_n] and Dropbox's "<name> (<computer>'s conflicted copy <date>)".
 */
export const isConflictCopy = (name) => looksLikeConflictCopy(name);

/**
 * Online-only files the sync app can't download right now (offline, or the NAS out of reach): macOS's File Provider
 * fails with ETIMEDOUT or EDEADLK (Apple TN3150), and Windows' cloud files errors reach Node as UNKNOWN. Null for
 * other errors and outside synced folders.
 */
export async function offlineMessage(err) {
  if (!err?.syscall || typeof err.path !== 'string') return null;
  const codes = process.platform === 'win32' ? ['UNKNOWN', 'ETIMEDOUT', 'EIO'] : ['ETIMEDOUT', 'EDEADLK'];
  if (!codes.includes(err.code)) return null;
  const place = await placeOf(err.path);
  if (!place) return null;
  return `“${path.basename(err.path)}” is online-only, and ${place.label} can’t download it right now. Connect to the internet${place.provider === 'synology' ? ' or your NAS' : ''}, or set this folder to stay on this device in ${place.label}.`;
}

// ─── Each computer's projects, for the others ───

const MACHINES_DIR = 'machines';
const MAX_AGE = 90 * 24 * 3600 * 1000;
const REFRESH = 24 * 3600 * 1000;
let published = { key: '', at: 0 };

const validPlace = (place) =>
  place && Object.hasOwn(PROVIDERS, place.provider) && typeof place.rel === 'string'
    ? { provider: place.provider, label: PROVIDERS[place.provider], rel: place.rel }
    : null;

/**
 * Tell the other computers which projects this one has, [{ id, name, place }], in this computer's own file. Written when
 * the list changes, and once a day so the file doesn't go stale.
 */
export async function publishProjects(projects) {
  const shared = await sharedDir();
  if (!shared) return;
  const { machineId: id, machineName } = await readSyncConfig();
  const file = path.join(shared, MACHINES_DIR, `${id}.json`);
  const key = JSON.stringify([file, machineName, projects]);
  if (published.key !== key) {
    const old = await readJson(file).catch(() => null);
    published = { key: old && JSON.stringify([file, old.machineName, old.projects]), at: Date.parse(old?.updatedAt) || 0 };
  }
  if (published.key === key && Date.now() - published.at < REFRESH) return;
  const updatedAt = new Date();
  await writeJsonAtomic(file, { machineName, updatedAt: updatedAt.toISOString(), projects });
  published = { key, at: updatedAt.getTime() };
}

/** What the other computers list, from files updated in the last 90 days, newest first: [{ id, name, place, machineName }]. */
export async function otherComputersProjects() {
  const { machineId: own, folders } = await readSyncConfig();
  const lists = [];
  for (const { path: folder } of folders) {
    const dir = path.join(folder, SHARED_DIR_NAME, MACHINES_DIR);
    for (const name of await fs.readdir(dir).catch(() => [])) {
      // <machine id>.json only, which also passes by a sync app's conflict copy of one
      const id = /^([0-9a-f-]{8,})\.json$/i.exec(name)?.[1];
      if (!id || id === own) continue;
      const data = await readJson(path.join(dir, name)).catch(() => null);
      const at = Date.parse(data?.updatedAt);
      if (Date.now() - at < MAX_AGE && Array.isArray(data.projects)) lists.push({ at, data });
    }
  }
  return lists
    .sort((a, b) => b.at - a.at)
    .flatMap(({ data }) =>
      data.projects
        .filter((p) => typeof p?.id === 'string' && typeof p.name === 'string')
        .map((p) => ({ id: p.id, name: p.name, place: validPlace(p.place), machineName: String(data.machineName || 'another computer').slice(0, 60) }))
    );
}
