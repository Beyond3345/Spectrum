import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { DATA_DIR } from '../config/constants.js';
import { httpError } from '../services/projectService.js';
import { defaultMachineName, detectSyncRoots, hideProject, placeOfNew, readSyncConfig, sameFolder, updateSyncConfig, within } from '../services/syncService.js';

const ID_RE = /^[A-Za-z0-9_-]+$/;

/** Settings › Projects: this computer's synced folders and name, and the sync apps' folders it could add. */
async function syncSettings() {
  const { machineName, folders } = await readSyncConfig();
  const apps = await detectSyncRoots();
  return {
    machineName,
    folders: await Promise.all(
      folders.map(async (f) => ({ path: f.path, label: f.place?.label, found: await fs.stat(f.path).then((s) => s.isDirectory(), () => false) }))
    ),
    // not ones already in the list, or holding or inside one
    suggestions: apps.filter((r) => !folders.some((f) => within(f.path, r.path) || within(r.path, f.path)))
  };
}

async function checkFolder(input) {
  const raw = String(input || '').trim().replace(/^~(?=$|[/\\])/, os.homedir());
  if (!path.isAbsolute(raw)) throw httpError('Choose a folder using its full path.', 400);
  const abs = await fs.realpath(raw).catch(() => null);
  if (!abs || !(await fs.stat(abs)).isDirectory()) throw httpError('That folder doesn’t exist.', 400);
  // Spectrum would look through all of it
  if ([path.parse(abs).root, os.homedir(), DATA_DIR].some((p) => sameFolder(p, abs))) throw httpError('Choose a folder inside it, such as the one your sync app keeps.', 400);
  return abs;
}

export function registerSyncRoutes(fastify) {
  fastify.get('/api/sync', syncSettings);

  // folders: the whole list, in order (new projects go in the first); machineName: '' goes back to the system's name
  fastify.patch('/api/sync', async (req) => {
    const { folders, machineName } = req.body || {};
    const config = await readSyncConfig();
    let next = config.folders;
    if (folders !== undefined) {
      if (!Array.isArray(folders)) throw httpError('Folders must be a list.', 400);
      next = [];
      for (const input of folders) {
        const kept = config.folders.find((f) => f.path === input);
        const folder = kept || { path: await checkFolder(input) };
        const overlap = next.find((f) => within(f.path, folder.path) || within(folder.path, f.path));
        if (overlap && sameFolder(overlap.path, folder.path)) throw httpError('That folder is already in the list.', 409);
        if (overlap) throw httpError(`That folder ${within(folder.path, overlap.path) ? 'is inside' : 'contains'} “${overlap.path}”, which is already in the list.`, 409);
        if (!kept) {
          const place = await placeOfNew(folder.path);
          if (place) folder.place = place;
        }
        next.push(folder);
      }
    }
    const name = machineName === undefined ? config.machineName : String(machineName).trim().slice(0, 60) || (await defaultMachineName());
    await updateSyncConfig((c) => ({ ...c, folders: next, machineName: name }));
    return syncSettings();
  });

  // a project only another computer has, which this one shouldn't list
  fastify.post('/api/sync/hide', async (req) => {
    const id = String(req.body?.id || '');
    if (!ID_RE.test(id)) throw httpError('Project not found.', 404);
    await hideProject(id);
    return { ok: true };
  });
}
