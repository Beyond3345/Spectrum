// Projects shared between computers through a sync folder (Synology Drive, OneDrive, Dropbox, iCloud): which
// folders this computer treats as synced, this computer's id, and the shared folder for what follows the user
// (settings, templates, the list of each computer's projects).
//
// DATA_DIR/sync.json, this computer's own (never synced, and kept apart from registry.json, which 1.7.0 rewrites
// without fields it doesn't know):
//   { machineId, machineName, folders: [{ path }], hidden: [projectId] }
// <first synced folder>/.spectrum-shared/: one file per computer where several computers write (never a shared
// file two computers rewrite, which a sync client would split into conflict copies)
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from '../config/constants.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';

const CONFIG_PATH = path.join(DATA_DIR, 'sync.json');
export const SHARED_DIR_NAME = '.spectrum-shared';

let cached = null;

/** This computer's sync settings, with a machine id made on first use. */
export async function readSyncConfig() {
  if (cached) return cached;
  let data = {};
  try {
    data = await readJson(CONFIG_PATH);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const config = {
    machineId: typeof data.machineId === 'string' && /^[0-9a-f-]{8,}$/i.test(data.machineId) ? data.machineId : crypto.randomUUID(),
    machineName: typeof data.machineName === 'string' && data.machineName.trim() ? data.machineName.trim() : os.hostname().replace(/\.local$/i, ''),
    folders: Array.isArray(data.folders) ? data.folders.filter((f) => f && typeof f.path === 'string' && path.isAbsolute(f.path)) : [],
    hidden: Array.isArray(data.hidden) ? data.hidden.filter((id) => typeof id === 'string') : []
  };
  if (config.machineId !== data.machineId) await writeJsonAtomic(CONFIG_PATH, config);
  cached = config;
  return config;
}

/** Changes this computer's sync settings (fn gets a copy and returns the next one). */
export async function updateSyncConfig(fn) {
  const next = await fn(structuredClone(await readSyncConfig()));
  await writeJsonAtomic(CONFIG_PATH, next);
  cached = next;
  return next;
}

export async function machineId() {
  return (await readSyncConfig()).machineId;
}

/** The shared folder in the first synced folder that exists here, or null when none is set up. */
export async function sharedDir() {
  for (const { path: folder } of (await readSyncConfig()).folders) {
    const ok = await fs.stat(folder).then((s) => s.isDirectory(), () => false);
    if (ok) return path.join(folder, SHARED_DIR_NAME);
  }
  return null;
}
