// The user's other computers: which have a project open, what they're called, and the settings they share.
// Each computer writes only its own files, so a sync app never makes conflict copies of them:
//   <project>/.spectrum/open/<machine id>.json   { host, since, at }, rewritten every 2 minutes while the editor is
//                                                open and removed when it closes; one left by a crash goes stale.
//                                                Not "*.lock" names: OneDrive refuses them.
//   <shared>/settings/<machine id>.json          { updatedAt, machineName, settings }, the settings that follow the
//                                                user (settings.ts picks them: never keys, paths or the window's look)
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { readSyncConfig, sharedDir } from './syncService.js';

// projectService's APP_DIR, spelt out: projectService reads machine names from here for detectMainFile
const openDir = (root) => path.join(root, '.spectrum', 'open');
const FRESH_MS = 5 * 60 * 1000;
const MACHINE_FILE = /^([0-9a-f-]{8,})\.json$/i;

/** The other computers' presence files in a folder of them (any one per computer, fresh or not). */
async function readMachineFiles(dir, own) {
  const found = [];
  for (const name of await fs.readdir(dir).catch(() => [])) {
    const id = name.match(MACHINE_FILE)?.[1];
    if (!id || id === own) continue;
    const data = await readJson(path.join(dir, name)).catch(() => null);
    if (data && typeof data === 'object') found.push(data);
  }
  return found;
}

const fresh = (at) => Math.abs(Date.now() - Date.parse(at)) < FRESH_MS;

/** The other computers with the project open now: [{ host, since }]. */
export async function othersOpen(root) {
  const { machineId } = await readSyncConfig();
  return (await readMachineFiles(openDir(root), machineId))
    .filter((p) => typeof p.host === 'string' && fresh(p.at))
    .map((p) => ({ host: p.host, since: typeof p.since === 'string' ? p.since : p.at }));
}

/** This computer has the project open (again, or still); returns the others that do. */
export async function markOpen(root) {
  const { machineId, machineName } = await readSyncConfig();
  const file = path.join(openDir(root), `${machineId}.json`);
  const was = await readJson(file).catch(() => null);
  const at = new Date().toISOString();
  await writeJsonAtomic(file, { host: machineName, since: was && fresh(was.at) ? was.since : at, at });
  return othersOpen(root);
}

export async function markClosed(root) {
  const { machineId } = await readSyncConfig();
  await fs.rm(path.join(openDir(root), `${machineId}.json`), { force: true });
}

/**
 * The names this computer and the others go by, for OneDrive's conflict copies: this one's, the ones in the
 * project's presence files and the ones in the shared folder's settings files.
 */
export async function knownMachineNames(root) {
  const { machineId, machineName } = await readSyncConfig();
  const names = [machineName, os.hostname().replace(/\.local$/i, ''), process.env.COMPUTERNAME];
  for (const p of await readMachineFiles(openDir(root), machineId)) names.push(p.host);
  for (const s of await readMachineFiles(await settingsDir(), machineId)) names.push(s.machineName);
  // and every computer that lists its projects in the shared folder
  const shared = await sharedDir().catch(() => null);
  if (shared) for (const m of await readMachineFiles(path.join(shared, 'machines'), machineId)) names.push(m.machineName);
  return names.filter((n) => typeof n === 'string' && n.trim());
}

const settingsDir = async () => {
  const shared = await sharedDir().catch(() => null);
  return shared ? path.join(shared, 'settings') : '';
};
// what settings.ts already leaves out, checked again here: none of these may sit on the NAS
const SECRET = /key|token|secret|password|saved|dir$|path/i;

/** The newest settings another computer shared, or null; shared: false when there's no shared folder. */
export async function sharedSettings() {
  const dir = await settingsDir();
  if (!dir) return { shared: false, latest: null };
  const { machineId } = await readSyncConfig();
  const latest = (await readMachineFiles(dir, machineId))
    .filter((s) => typeof s.updatedAt === 'string' && s.settings && typeof s.settings === 'object')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return { shared: true, latest: latest || null };
}

/** This computer's settings for the others; returns when they were shared, or null with no shared folder. */
export async function shareSettings(settings) {
  const dir = await settingsDir();
  if (!dir) return null;
  const { machineId, machineName } = await readSyncConfig();
  const updatedAt = new Date().toISOString();
  const kept = Object.fromEntries(Object.entries(settings).filter(([key]) => !SECRET.test(key)));
  await writeJsonAtomic(path.join(dir, `${machineId}.json`), { updatedAt, machineName, settings: kept });
  return updatedAt;
}
