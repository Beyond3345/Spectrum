// The user's other computers: what the system calls them, for the conflict copies a sync app names after them, and the
// settings they share. Each computer writes only its own file, so the copies never clash:
//   <shared>/settings/<machine id>.json          { updatedAt, machineName, systemNames, settings }, the settings that
//                                                follow the user (settings.ts picks them: never keys, paths or the
//                                                window's look)
//   <project>/.spectrum/open/<machine id>.json   { host, systemNames, since, at }, which 1.10 writes while it has the
//                                                project open, read here for the names alone
// systemNames: the system's names for the computer (syncService), which OneDrive's conflict copies carry
import { promises as fs } from 'fs';
import path from 'path';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { readSyncConfig, sharedDir, systemNames } from './syncService.js';

// projectService's APP_DIR, spelt out: projectService reads machine names from here for detectMainFile
const openDir = (root) => path.join(root, '.spectrum', 'open');
const MACHINE_FILE = /^([0-9a-f-]{8,})\.json$/i;

/** The other computers' files in a folder of them, one per computer. */
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

/**
 * The system's names for this computer and the others, for OneDrive's conflict copies: this one's, and the ones in
 * the shared settings and the project's files from 1.10. Never a name set in Settings ('Work', 'Mac'), which OneDrive
 * doesn't use and an ordinary file name could end in.
 */
export async function knownMachineNames(root) {
  const { machineId } = await readSyncConfig();
  const names = [...(await systemNames())];
  for (const dir of [openDir(root), await settingsDir()].filter(Boolean)) for (const m of await readMachineFiles(dir, machineId)) if (Array.isArray(m.systemNames)) names.push(...m.systemNames);
  return names.filter((n) => typeof n === 'string' && n.trim());
}

const settingsDir = async () => {
  const shared = await sharedDir().catch(() => null);
  return shared ? path.join(shared, 'settings') : '';
};
// what settings.ts already leaves out, checked again here: none of these may leave this computer
const SECRET = /key|token|secret|password|saved|dir$|path/i;

/** The newest settings another computer shared, or null; shared: false when there's nowhere they're shared. */
export async function sharedSettings() {
  const dir = await settingsDir();
  if (!dir) return { shared: false, latest: null };
  const { machineId } = await readSyncConfig();
  const latest = (await readMachineFiles(dir, machineId))
    .filter((s) => typeof s.updatedAt === 'string' && s.settings && typeof s.settings === 'object')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return { shared: true, latest: latest || null };
}

/** This computer's settings for the others; returns when they were shared, or null with nowhere to share them. */
export async function shareSettings(settings) {
  const dir = await settingsDir();
  if (!dir) return null;
  const { machineId, machineName } = await readSyncConfig();
  const updatedAt = new Date().toISOString();
  const kept = Object.fromEntries(Object.entries(settings).filter(([key]) => !SECRET.test(key)));
  await writeJsonAtomic(path.join(dir, `${machineId}.json`), { updatedAt, machineName, systemNames: await systemNames(), settings: kept });
  return updatedAt;
}
