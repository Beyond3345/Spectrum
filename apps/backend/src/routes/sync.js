// This computer and the sync apps' folders: its name, where a folder is in a sync app's folder, Move to this computer
// for a project still used in one, and the notice about the move to 2.0.
import { promises as fs } from 'fs';
import path from 'path';
import { PROJECTS_DIR } from '../config/constants.js';
import { cachePath, getProject, httpError, makeUniqueFolder, moveEntry, sanitiseFolderName, whileMoving } from '../services/projectService.js';
import { dismissMigrationNotice, legacyLocationOf, migrationNotice } from '../services/mirrorService.js';
import { offlineMessage, placeOf, readSyncConfig, setMachineName } from '../services/syncService.js';
import { compiling } from '../services/compileService.js';
import { stopProjectTexlab } from '../services/texlabService.js';
import { copyProject, preflight } from '../utils/projectCopy.js';
import { transferring } from './transfer.js';

/**
 * The project's folder copied into parent and checked file by file, then listed there; the folder in the sync app's
 * folder stays as it is, as another computer may still use it there. Nothing is left in parent when it fails.
 */
async function moveHere(id, root, parentDir) {
  const project = await getProject(id);
  // a sync app's folder, or one 1.10 synced through (a NAS share, say)
  const place = (await placeOf(root)) || (await legacyLocationOf(root));
  if (!place) throw httpError(`“${project.name}” is already on this computer.`, 400);
  if (compiling(id) || transferring(id)) throw httpError(`“${project.name}” is compiling or being converted. Try again once that’s finished.`, 409);
  const dir = typeof parentDir === 'string' && parentDir.trim() ? parentDir.trim() : PROJECTS_DIR;
  if (!path.isAbsolute(dir)) throw httpError('The location must be a full folder path.', 400);
  await fs.mkdir(dir, { recursive: true });
  const parent = await fs.realpath(dir);
  const there = await placeOf(parent);
  if (there) throw httpError(`The folder new projects go in is in ${there.label} too. Choose another one in Settings › Projects first.`, 409);
  const target = await makeUniqueFolder(parent, sanitiseFolderName(path.basename(root)));
  await fs.rmdir(target);
  try {
    await preflight(root, { to: target });
    await copyProject(root, target);
  } catch (err) {
    throw httpError((await offlineMessage(err).catch(() => null)) || err.message, err.statusCode || 409);
  }
  await moveEntry(id, target);
  // its own cache's SyncTeX holds the old path, and its TexLab the old folder
  await fs.rm(await cachePath(target, 'synctex'), { recursive: true, force: true });
  await stopProjectTexlab(id);
  return { project: await getProject(id), left: { label: place.label, path: root } };
}

export function registerSyncRoutes(fastify) {
  fastify.get('/api/sync', async () => ({ machineName: (await readSyncConfig()).machineName }));

  // machineName: '' goes back to the system's name
  fastify.patch('/api/sync', async (req) => {
    const name = req.body?.machineName;
    if (typeof name !== 'string') throw httpError('Missing the computer’s name.', 400);
    return { machineName: (await setMachineName(name)).machineName };
  });

  // where a folder is in a sync app's folder, which Settings won't take as the folder for new projects: { place }
  fastify.post('/api/sync/place', async (req) => {
    const input = String(req.body?.path || '');
    if (!path.isAbsolute(input)) throw httpError('Choose a folder using its full path.', 400);
    return { place: await placeOf(await fs.realpath(input).catch(() => input)) };
  });

  // Move to this computer: a project used in a sync app's folder, copied into parentDir (default: the projects folder);
  // its folder isn't handed to anything else meanwhile, so two Moves can't each make a copy and no save lands behind
  fastify.post('/api/projects/:id/move-here', async (req) => whileMoving(req.params.id, (root) => moveHere(req.params.id, root, req.body?.parentDir)));

  // what the move to 2.0 did with the projects that synced through a cloud location, until dismissed
  fastify.get('/api/migration', async () => ({ notice: await migrationNotice() }));

  fastify.post('/api/migration/dismiss', async () => {
    await dismissMigrationNotice();
    return { ok: true };
  });
}
