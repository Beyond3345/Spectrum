// This computer, and the sync apps' folders (Synology Drive, OneDrive, Dropbox, Google Drive, iCloud Drive), which
// projects no longer sync through since 2.0 (GitHub does that) but which some still live in: this computer's id and
// name, where a folder is in a sync app's folder (for the warning before a repository goes in one), and what an
// online-only file there that can't download means.
//
// DATA_DIR/computer.json, this computer's own: { machineId, machineName }, taken from 1.10's sync.json the first time,
// which stays as it was for going back to 1.10.4 (with its cloud locations, which nothing here reads any more)
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DATA_DIR } from '../config/constants.js';
import { readJson, readdirTyped, writeJsonAtomic } from '../utils/fsUtils.js';
import { looksLikeConflictCopy } from '../utils/conflictCopies.js';

const CONFIG_PATH = path.join(DATA_DIR, 'computer.json');
const LEGACY_PATH = path.join(DATA_DIR, 'sync.json');

const execFileAsync = promisify(execFile);
let cached = null;

/** What the user calls this computer: macOS's name for it in Sharing settings, elsewhere its network name. */
export async function defaultMachineName() {
  const mac = process.platform === 'darwin' && (await execFileAsync('/usr/sbin/scutil', ['--get', 'ComputerName'], { timeout: 2000 }).then((r) => r.stdout.trim(), () => ''));
  return mac || os.hostname().replace(/\..*$/, '');
}

let systemNamesCache = null;

/**
 * The names the system gives this computer, which OneDrive puts in its conflict copies' names; never the one set in
 * Settings. ponytail: read once per run, so a computer renamed while Spectrum runs is known by its new name next time
 */
export function systemNames() {
  systemNamesCache ||= defaultMachineName().then((name) => [...new Set([name, os.hostname().replace(/\.local$/i, ''), process.env.COMPUTERNAME].filter(Boolean))]);
  return systemNamesCache;
}

/** This computer's { machineId, machineName }, with a machine id made on first use. */
export function readSyncConfig() {
  // one read for every caller, so two at once can't each make a machine id
  cached ||= loadSyncConfig().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

const validId = (id) => typeof id === 'string' && /^[0-9a-f-]{8,}$/i.test(id);
const validName = (name) => typeof name === 'string' && name.trim();

async function loadSyncConfig() {
  const read = (file) => readJson(file).catch((err) => (err.code === 'ENOENT' ? {} : Promise.reject(err)));
  const data = await read(CONFIG_PATH);
  const legacy = validId(data.machineId) ? {} : await read(LEGACY_PATH).catch(() => ({}));
  const config = {
    machineId: [data.machineId, legacy.machineId].find(validId) || crypto.randomUUID(),
    machineName: [data.machineName, legacy.machineName].find(validName)?.trim() || (await defaultMachineName())
  };
  if (config.machineId !== data.machineId) await writeJsonAtomic(CONFIG_PATH, config);
  return config;
}

/** What the user calls this computer; '' goes back to the system's name for it. */
export async function setMachineName(name) {
  const next = { ...(await readSyncConfig()), machineName: String(name).trim().slice(0, 60) || (await defaultMachineName()) };
  await writeJsonAtomic(CONFIG_PATH, next);
  cached = Promise.resolve(next);
  return next;
}

export async function machineId() {
  return (await readSyncConfig()).machineId;
}

const isDir = (p) => fs.stat(p).then((s) => s.isDirectory(), () => false);
const exists = (p) => fs.access(p).then(() => true, () => false);

let shared = null;

/**
 * The folder settings and templates follow the user through (settings/<machine id>.json, templates/<id>/): the
 * settings repository's copy once GitHub is set up, null until then, when they stay on this computer.
 */
export async function sharedDir() {
  return shared;
}

/** The settings repository's copy is ready at dir, or gone (null). */
export function useSharedDir(dir) {
  shared = dir;
}

// ─── The sync apps' folders ───

export const PROVIDERS = { synology: 'Synology Drive', onedrive: 'OneDrive', dropbox: 'Dropbox', google: 'Google Drive', icloud: 'iCloud Drive' };
// Synology's documented marker in the folder of a classic sync task
const MARKER = '.SynologyWorkingDirectory';
const ICLOUD = ['Library', 'Mobile Documents', 'com~apple~CloudDocs'];
// macOS asks before an app looks inside these, so the marker check passes them by
const PROTECTED = new Set(['Desktop', 'Documents', 'Downloads', 'Library', 'Movies', 'Music', 'Pictures']);

// APFS and NTFS ignore case
export const caseless = (p) => (process.platform === 'darwin' || process.platform === 'win32' ? p.toLowerCase() : p);
export const sameFolder = (a, b) => caseless(a) === caseless(b);
/** p is root or inside it */
export const within = (p, root) => sameFolder(p, root) || caseless(p).startsWith(caseless(root.endsWith(path.sep) ? root : root + path.sep));
/** p's place in root, '/'-separated. */
export const relFrom = (root, p) => p.slice(root.length).split(path.sep).filter(Boolean).join('/');

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
    await add(path.join(home, ...ICLOUD), 'icloud');
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
  for (const entry of await readdirTyped(home, { skipUnreadable: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || (process.platform === 'darwin' && PROTECTED.has(entry.name))) continue;
    if (await exists(path.join(home, entry.name, MARKER))) await add(path.join(home, entry.name), 'synology');
  }
  return found;
}

// ponytail: a sync app set up while Spectrum runs is seen within a minute
let roots = null;
let rootsAt = 0;
const marked = new Map();
const keptInICloud = new Map();

/** detectSyncRoots, kept for a minute. */
export async function syncRoots() {
  if (!roots || Date.now() - rootsAt > 60_000) {
    roots = detectSyncRoots();
    rootsAt = Date.now();
    marked.clear();
    keptInICloud.clear();
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

/**
 * iCloud's Desktop & Documents leaves those folders where they are and syncs them as iCloud Drive's own: its
 * Desktop and Documents are then the same folders as the home folder's.
 */
function iCloudKeeps(name) {
  if (!keptInICloud.has(name)) {
    const real = (p) => fs.realpath(p).catch(() => null);
    const both = [real(path.join(os.homedir(), ...ICLOUD, name)), real(path.join(os.homedir(), name))];
    keptInICloud.set(name, Promise.all(both).then(([a, b]) => !!a && !!b && sameFolder(a, b)));
  }
  return keptInICloud.get(name);
}

/**
 * Where a folder is in a sync app's folder: { provider, label, rel }, rel '/'-separated from the top of that folder
 * (the same on every computer), e.g. { provider: 'synology', label: 'Synology Drive', rel: 'Spectrum/Thesis' }. Null
 * outside them. Looked for only when asked (opening a folder, the warning before a repository goes in one), never
 * for every project in the list.
 */
export async function placeOf(p) {
  const appRoots = await syncRoots();
  const root = appRoots.filter((r) => within(p, r.path)).sort((a, b) => b.path.length - a.path.length)[0];
  if (root) return { provider: root.provider, label: root.label, rel: relFrom(root.path, p) };
  for (const name of process.platform === 'darwin' ? ['Desktop', 'Documents'] : []) {
    const dir = path.join(os.homedir(), name);
    if (within(p, dir) && (await iCloudKeeps(name))) return { provider: 'icloud', label: PROVIDERS.icloud, rel: [name, relFrom(dir, p)].filter(Boolean).join('/') };
  }
  const marker = await synologyRootOf(p);
  return marker ? { provider: 'synology', label: PROVIDERS.synology, rel: relFrom(marker, p) } : null;
}

/**
 * A sync app's copy of something two computers changed at once: Synology's
 * <name>_<computer>_<Mon-DD-HHMM[SS]-YYYY>_<reason>[_n] and Dropbox's "<name> (<computer>'s conflicted copy <date>)".
 */
export const isConflictCopy = (name) => looksLikeConflictCopy(name);

/**
 * Online-only files the sync app can't download right now (offline, or the NAS out of reach): macOS's File Provider
 * fails with ETIMEDOUT or EDEADLK (Apple TN3150), and Windows' cloud files errors reach Node as UNKNOWN. Null for
 * other errors and outside the sync apps' folders.
 */
export async function offlineMessage(err) {
  if (!err?.syscall || typeof err.path !== 'string') return null;
  const codes = process.platform === 'win32' ? ['UNKNOWN', 'ETIMEDOUT', 'EIO'] : ['ETIMEDOUT', 'EDEADLK'];
  if (!codes.includes(err.code)) return null;
  const place = await placeOf(err.path);
  if (!place) return null;
  return `“${path.basename(err.path)}” is online-only, and ${place.label} can’t download it right now. Connect to the internet${place.provider === 'synology' ? ' or your NAS' : ''}, or set this folder to stay on this device in ${place.label}.`;
}
