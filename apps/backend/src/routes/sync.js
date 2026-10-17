import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { DATA_DIR, PROJECTS_DIR } from '../config/constants.js';
import { getProject, getProjectRoot, httpError } from '../services/projectService.js';
import { listMirrored } from '../services/mirrorService.js';
import {
  SHARED_DIR_NAME,
  defaultMachineName,
  detectSyncRoots,
  hideProject,
  locationLabel,
  placeOf,
  placeOfNew,
  readSyncConfig,
  sameFolder,
  sharedDir,
  updateSyncConfig,
  within
} from '../services/syncService.js';

const ID_RE = /^[A-Za-z0-9_-]+$/;
const isDir = (p) => fs.stat(p).then((s) => s.isDirectory(), () => false);

/**
 * Where a sync app's folder is added as a cloud location: its own Spectrum folder, or the app's folder itself when a
 * 1.8.0 computer shares settings and templates through it (so both go through the same shared folder), unless it holds
 * the projects folder (Documents backed up into OneDrive, say), which a location can't.
 */
const targetIn = async (appRoot) =>
  (await isDir(path.join(appRoot, SHARED_DIR_NAME))) && !within(await fs.realpath(PROJECTS_DIR).catch(() => PROJECTS_DIR), appRoot) ? appRoot : path.join(appRoot, 'Spectrum');

/**
 * Settings › Projects: this computer's cloud locations (with how many projects mirror into each) and name, the sync
 * apps' folders it could add, and the folder settings and templates go through.
 */
async function syncSettings() {
  const { machineName, folders } = await readSyncConfig();
  const apps = await detectSyncRoots();
  const shared = await sharedDir();
  const mirrored = await listMirrored();
  return {
    machineName,
    sharedFolder: shared && path.dirname(shared),
    folders: await Promise.all(
      folders.map(async (f) => ({
        path: f.path,
        label: await locationLabel(f.path),
        found: await isDir(f.path),
        place: await placeOf(f.path),
        mirrored: mirrored.filter((m) => sameFolder(m.location, f.path)).length
      }))
    ),
    // not ones already in the list, or holding or inside one
    suggestions: await Promise.all(
      apps.filter((r) => !folders.some((f) => within(f.path, r.path) || within(r.path, f.path))).map(async (r) => ({ ...r, target: await targetIn(r.path) }))
    )
  };
}

async function checkFolder(input, projectsDir) {
  const raw = String(input || '').trim().replace(/^~(?=$|[/\\])/, os.homedir());
  if (!path.isAbsolute(raw)) throw httpError('Choose a folder using its full path.', 400);
  // a suggestion's Spectrum folder is made on Add
  for (const r of await detectSyncRoots()) if (sameFolder(path.join(r.path, 'Spectrum'), raw)) await fs.mkdir(raw, { recursive: true });
  const abs = await fs.realpath(raw).catch(() => null);
  if (!abs || !(await fs.stat(abs)).isDirectory()) throw httpError('That folder doesn’t exist.', 400);
  // Spectrum would look through all of it
  if ([path.parse(abs).root, os.homedir(), DATA_DIR].some((p) => sameFolder(p, abs))) throw httpError('Choose a folder inside it, such as the one your sync app keeps.', 400);
  // every project in the folder new projects go in would be a cloud project, and a mirror would copy them into themselves
  for (const dir of [PROJECTS_DIR, projectsDir].filter((p) => typeof p === 'string' && path.isAbsolute(p))) {
    const real = await fs.realpath(dir).catch(() => dir);
    if (within(real, abs)) throw httpError(`That folder ${sameFolder(real, abs) ? 'is' : 'holds'} the folder new projects go in. Choose a folder for cloud projects only, such as Spectrum in your sync app’s folder.`, 400);
    if (within(abs, real)) throw httpError('That folder is inside the folder new projects go in. Choose a folder in your sync app’s folder.', 400);
  }
  // new projects would go inside that project, mixing their files, versions and chats with its own
  for (let dir = abs; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (await fs.access(path.join(dir, '.spectrum', 'project.json')).then(() => true, () => false)) {
      throw httpError(`That folder ${dir === abs ? 'is' : 'is inside'} a project. Choose the folder that holds your projects.`, 400);
    }
  }
  return abs;
}

export function registerSyncRoutes(fastify) {
  fastify.get('/api/sync', syncSettings);

  // folders: the whole list, in order; machineName: '' goes back to the system's name; projectsDir: the folder new
  // projects go in when one is chosen in Settings, which a new location mustn't hold or be inside
  fastify.patch('/api/sync', async (req) => {
    const { folders, machineName, projectsDir } = req.body || {};
    const config = await readSyncConfig();
    let next = config.folders;
    if (folders !== undefined) {
      if (!Array.isArray(folders)) throw httpError('Folders must be a list.', 400);
      next = [];
      for (const input of folders) {
        const kept = config.folders.find((f) => f.path === input);
        const folder = kept || { path: await checkFolder(input, projectsDir) };
        const overlap = next.find((f) => within(f.path, folder.path) || within(folder.path, f.path));
        if (overlap && sameFolder(overlap.path, folder.path)) throw httpError('That folder is already in the list.', 409);
        if (overlap) throw httpError(`That folder ${within(folder.path, overlap.path) ? 'is inside' : 'contains'} “${overlap.path}”, which is already in the list.`, 409);
        if (!kept) {
          // its folder here would be a project used in place, and the mirror dropped without a word
          for (const m of await listMirrored()) {
            const root = await getProjectRoot(m.id).catch(() => null);
            if (root && within(root, folder.path)) throw httpError(`That folder holds “${(await getProject(m.id)).name}”, which syncs to ${await locationLabel(m.location)}. Stop syncing it first.`, 409);
          }
          const place = await placeOfNew(folder.path);
          if (place) folder.place = place;
        }
        next.push(folder);
      }
      // their mirrors would point at nothing
      const gone = config.folders.filter((f) => !next.some((n) => n.path === f.path));
      const mirrored = (await listMirrored()).filter((m) => gone.some((f) => sameFolder(f.path, m.location)));
      if (mirrored.length) {
        const names = await Promise.all(mirrored.map((m) => getProject(m.id).then((p) => `“${p.name}”`, () => 'a project')));
        throw httpError(`Stop syncing ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} first.`, 409);
      }
    }
    const name = machineName === undefined ? config.machineName : String(machineName).trim().slice(0, 60) || (await defaultMachineName());
    await updateSyncConfig((c) => ({ ...c, folders: next, machineName: name }));
    return syncSettings();
  });

  // a project in a cloud location that this computer shouldn't list in Cloud projects
  fastify.post('/api/sync/hide', async (req) => {
    const id = String(req.body?.id || '');
    if (!ID_RE.test(id)) throw httpError('Project not found.', 404);
    await hideProject(id);
    return { ok: true };
  });
}
