// Cloud projects: Sync to (a copy in a cloud location that Spectrum mirrors, or the folder moved there), Download (a
// project another computer put in one), Stop syncing and Sync now. Every copy is checked file by file, and a folder
// that moves goes to the Bin only once its copy is whole.
import { promises as fs } from 'fs';
import path from 'path';
import { PROJECTS_DIR } from '../config/constants.js';
import {
  appPath,
  cachePath,
  findSyncedProjects,
  getProject,
  getProjectRoot,
  httpError,
  keptHere,
  makeUniqueFolder,
  moveEntry,
  readMeta,
  register,
  sanitiseFolderName
} from '../services/projectService.js';
import { cloudRootOf, cloudToBin, linkMirror, readMirror, syncProject, unlinkMirror } from '../services/mirrorService.js';
import {
  locationLabel,
  locationOf,
  offlineMessage,
  olderComputers,
  otherComputersProjects,
  placeOf,
  readSyncConfig,
  relFrom,
  sameFolder,
  unhideProject
} from '../services/syncService.js';
import { othersOpen } from '../services/presenceService.js';
import { compiling } from '../services/compileService.js';
import { copyProject, preflight } from '../utils/projectCopy.js';
import { mirrorSkips } from '../utils/fsUtils.js';
import { moveToBin } from './projects.js';
import { transferring } from './transfer.js';

const ID_RE = /^[A-Za-z0-9_-]+$/;
const isDir = (p) => fs.stat(p).then((s) => s.isDirectory(), () => false);
// what went wrong, in the sync app's terms for a file that's online-only
const why = async (err) => (await offlineMessage(err).catch(() => null)) || err.message;

/** One of this computer's cloud locations, which must be here now: { path, label }. */
async function cloudLocation(input) {
  const location = (await readSyncConfig()).folders.find((f) => typeof input === 'string' && sameFolder(f.path, input));
  if (!location) throw httpError('That cloud location isn’t in Settings › Projects.', 400);
  const label = await locationLabel(location.path);
  if (!(await isDir(location.path))) throw httpError(`${label} isn’t on this computer right now.`, 409);
  return { path: location.path, label };
}

/** A free `<parent>/<from's name>` (or `<name> 2`…) for copyProject to make. */
async function freeFolder(parent, from) {
  const target = await makeUniqueFolder(parent, sanitiseFolderName(path.basename(from)));
  await fs.rmdir(target);
  return target;
}

/**
 * A project's folder copied to `to` and checked file by file; nothing is left at `to` when it fails. exclude: what
 * stays out, the mirror's skip rule for a copy Spectrum mirrors, else this computer's presence.
 */
async function copyChecked(from, to, exclude = ['.spectrum/open']) {
  try {
    await preflight(from, { windows: process.platform === 'win32', to, exclude });
    return await copyProject(from, to, { exclude });
  } catch (err) {
    throw httpError(await why(err), err.statusCode || 409);
  }
}

// the projects whose Sync to, Download or Stop syncing is under way, so two at once can't each make a copy with its id
const busy = new Set();

/** The route's handler, one request at a time for each project. */
function alone(handler) {
  return async (req) => {
    const id = String(req.params?.id ?? req.body?.id ?? '');
    if (busy.has(id)) throw httpError('That project is already being synced. Try again once that’s finished.', 409);
    busy.add(id);
    try {
      return await handler(req);
    } finally {
      busy.delete(id);
    }
  };
}

/** The first pass, which most projects finish in moments; a big or slow one carries on, showing that it's syncing. */
const firstPass = (id) => Promise.race([syncProject(id).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 10_000).unref())]);

/** The folder is about to move: nothing may be compiling in it, or converting from or into it, with the old path. */
function refuseBusy(id, name) {
  if (compiling(id) || transferring(id)) throw httpError(`“${name}” is compiling or being converted. Try again once that’s finished.`, 409);
}

/**
 * Delete it from the cloud location only when no other computer has it open, and every other computer that lists it
 * keeps a copy of its own: for one that works on the cloud copy itself (in place, or moved there), it would be gone.
 * An older Spectrum's list can't say (1.8.0 leaves archived projects out of it), so no such computer may be about.
 * keep: what to do instead.
 */
export async function refuseDelete(id, name, cloudRoot, label, keep = `keep the copy in ${label}`) {
  const instead = `${keep[0].toUpperCase()}${keep.slice(1)} instead.`;
  const open = await othersOpen(cloudRoot);
  if (open.length) throw httpError(`“${name}” is open on ${open[0].host}. Close it there, or ${keep}.`, 409);
  const user = (await otherComputersProjects()).find((p) => p.id === id && !p.mirror);
  if (user) throw httpError(`${user.machineName} works on the copy in ${label} itself, so deleting it would delete “${name}” there too. ${instead}`, 409);
  const [older] = await olderComputers();
  if (older) throw httpError(`${older} runs an older Spectrum, which may use the copy in ${label} itself. ${instead}`, 409);
}

/**
 * A cloud copy deleted: to the Bin, though through Finder only on the home folder's volume, as Finder asks before
 * deleting for good on a volume with no Bin (a NAS share). There it goes into <location>/.spectrum-bin/<date>/, which
 * the scan passes by.
 * ponytail: never emptied; clear out old days if it grows
 */
async function binCloudCopy(root, location) {
  try {
    await cloudToBin(root);
  } catch {
    const bin = path.join(location, '.spectrum-bin', new Date().toISOString().slice(0, 10));
    await fs.mkdir(bin, { recursive: true });
    await fs.rename(root, await freeFolder(bin, root));
  }
}

/**
 * The folder Download and Stop syncing copy into: the one chosen in Settings, else the projects folder. Where its
 * links lead, as the copy goes there, so a link into a cloud location counts as in it; one not made yet as typed.
 */
async function defaultFolder(parentDir) {
  const dir = typeof parentDir === 'string' && parentDir.trim() ? parentDir.trim() : PROJECTS_DIR;
  if (!path.isAbsolute(dir)) throw httpError('The location must be a full folder path.', 400);
  return fs.realpath(dir).catch(() => dir);
}

/** The project's folder copied (and checked) into `parent`, then listed there: its own cache's SyncTeX holds the old path. */
async function moveProject(id, root, parent) {
  await fs.mkdir(parent, { recursive: true });
  const target = await freeFolder(await fs.realpath(parent), root);
  await copyChecked(root, target);
  await moveEntry(id, target);
  await fs.rm(await cachePath(target, 'synctex'), { recursive: true, force: true });
  return target;
}

export function registerCloudRoutes(fastify) {
  // Sync to: mode 'mirror' keeps the folder here and mirrors it into a copy in the location (linking to the one there
  // with its id, if any), 'move' moves the folder into the location, as 1.8.0 had its projects
  fastify.post('/api/projects/:id/cloud', alone(async (req) => {
    const { id } = req.params;
    const mode = req.body?.mode === 'move' ? 'move' : 'mirror';
    const root = await getProjectRoot(id);
    const project = await getProject(id);
    if (project.templateDraft) throw httpError('A template’s working copy stays with the templates.', 400);
    if (project.cloud) throw httpError(project.cloud.mode === 'mirror' ? `“${project.name}” already syncs to ${project.cloud.label}.` : `Already in ${project.cloud.label}.`, 409);
    const location = await cloudLocation(req.body?.location);
    // in that sync app's folder already (Documents backed up by OneDrive, say): it syncs as it is. In another app's,
    // the copy is one like any other
    const place = await placeOf(root);
    if (place && place.provider === (await placeOf(location.path))?.provider) throw httpError(`Already in ${place.label}.`, 409);
    const there = (await findSyncedProjects(location.path, Date.now() + 20_000)).filter((f) => f.id === id);
    const rels = there.map((f) => relFrom(location.path, f.root));
    if (there.length > 1) throw httpError(`“${project.name}” is in ${location.label} twice, as ${rels.join(' and ')}. Keep one of them and try again.`, 409);
    if (mode === 'mirror') {
      // a copy there with its id may have moved on since, so it's linked with nothing in common: the first pass is a
      // union, which deletes nothing
      let rel = rels[0];
      let files = {};
      // only what the mirror carries, so a link in .git, say, doesn't stop it
      if (there.length) {
        await preflight(root, { to: there[0].root, exclude: mirrorSkips }).catch(async (err) => {
          throw httpError(await why(err), err.statusCode || 409);
        });
      } else {
        const target = await freeFolder(location.path, root);
        ({ files } = await copyChecked(root, target, mirrorSkips));
        rel = relFrom(location.path, target);
      }
      await linkMirror(id, { location: location.path, rel, files });
      await firstPass(id);
      return { project: await getProject(id) };
    }
    if (there.length) throw httpError(`Already in ${location.label} as ${rels[0]}.`, 409);
    refuseBusy(id, project.name);
    await moveProject(id, root, location.path);
    // the copy is whole, so the folder here goes; ponytail: a save landing between the check and the move reaches
    // the folder in the Bin, and the editor's next save then finds the file changed on disk
    const warning = await moveToBin(root).then(
      () => undefined,
      (err) => `The folder on this computer couldn’t go to the ${process.platform === 'win32' ? 'Recycle Bin' : 'Bin'} (${err.message}), so it’s still at ${root}.`
    );
    return { project: await getProject(id), ...(warning && { warning }) };
  }));

  // Download a project in a cloud location that this computer doesn't have: with mode 'mirror', a copy in the default
  // folder that Spectrum mirrors; with 'move', or a default folder that's in a sync app's folder itself, in place
  fastify.post('/api/cloud/download', alone(async (req) => {
    const { id, rel, mode, parentDir } = req.body || {};
    const location = await cloudLocation(req.body?.location);
    const parts = String(rel || '').split('/');
    if (!ID_RE.test(String(id || '')) || parts.some((s) => !s || s === '.' || s === '..' || /[\\:]/.test(s))) throw httpError('Project not found.', 404);
    const cloudRoot = path.join(location.path, ...parts);
    const meta = await readMeta(cloudRoot).catch(async (err) => {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
      throw httpError(await why(err), 409);
    });
    if (meta?.id !== id) throw httpError(`That project isn’t in ${location.label} any more.`, 404);
    if (await getProject(id).then(() => true, () => false)) throw httpError(`“${meta.name}” is already on this computer.`, 409);
    const parent = await defaultFolder(parentDir);
    if (mode === 'move' || (await placeOf(parent)) || (await locationOf(parent))) {
      await register(id, cloudRoot, meta);
    } else {
      await fs.mkdir(parent, { recursive: true });
      const target = await makeUniqueFolder(await fs.realpath(parent), sanitiseFolderName(path.basename(cloudRoot)));
      try {
        // what the mirror will bring checked first: no long paths on Windows, and room for it
        await preflight(cloudRoot, { to: target, exclude: mirrorSkips });
        // its project.json alone: the first pass brings the rest, as a union, which never takes a file it can't read
        // yet for one deleted
        await fs.mkdir(appPath(target));
        await fs.copyFile(appPath(cloudRoot, 'project.json'), appPath(target, 'project.json'));
        await register(id, target, meta);
      } catch (err) {
        await fs.rm(target, { recursive: true, force: true });
        throw httpError(await why(err), 409);
      }
      await linkMirror(id, { location: location.path, rel: parts.join('/'), files: {} });
      await firstPass(id);
    }
    await unhideProject(id);
    return { project: await getProject(id) };
  }));

  // Stop syncing: keep the copy in the location, or delete it from there. A moved project is copied back into the
  // default folder first.
  fastify.post('/api/projects/:id/cloud/stop', alone(async (req) => {
    const { id } = req.params;
    const deleteCloud = !!req.body?.deleteCloud;
    const project = await getProject(id);
    if (!project.cloud) throw httpError(`“${project.name}” isn’t syncing.`, 400);
    const { mode, label, location } = project.cloud;
    if (mode === 'mirror') {
      if (!deleteCloud) {
        await unlinkMirror(id);
        await keptHere(id);
        return { project: await getProject(id) };
      }
      // the copy here is all that will be left, so it must be here
      await getProjectRoot(id);
      const cloudRoot = cloudRootOf(await readMirror(id));
      await refuseDelete(id, project.name, cloudRoot, label);
      // the cloud copy may still hold work this computer hasn't had
      const status = await syncProject(id);
      if (status.state !== 'synced') throw httpError(`“${project.name}” isn’t in step with ${label} yet${status.message ? ` (${status.message})` : ''}. Sync it first, or keep the copy in ${label}.`, 409);
      // unlinked first, so a pass a save or the minute queued meanwhile finds no mirror, rather than the copy gone and
      // another folder with the project's id (a Finder duplicate) to follow
      await unlinkMirror(id);
      // the copy may stay, if it can't be deleted
      await keptHere(id);
      const warning = await binCloudCopy(cloudRoot, location).then(
        () => undefined,
        (err) => `Stopped syncing, but the copy in ${label} couldn’t be deleted (${err.message}). It’s still at ${cloudRoot}.`
      );
      return { project: await getProject(id), ...(warning && { warning }) };
    }
    const root = await getProjectRoot(id);
    const parent = await defaultFolder(req.body?.parentDir);
    if (await locationOf(parent)) throw httpError('The folder new projects go in is in a cloud location. Choose another one in Settings › Projects first.', 409);
    if (deleteCloud) await refuseDelete(id, project.name, root, label);
    refuseBusy(id, project.name);
    await moveProject(id, root, parent);
    await keptHere(id);
    // it's on this computer now, so a Delete that fails can't be tried again: said, with where the copy is
    const warning = deleteCloud
      ? await binCloudCopy(root, location).then(
          () => undefined,
          (err) => `Stopped syncing, but the copy in ${label} couldn’t be deleted (${err.message}). It’s still at ${root}.`
        )
      : undefined;
    return { project: await getProject(id), ...(warning && { warning }) };
  }));

  // Sync now, or with force, Sync anyway past the brake on a pass that would delete many files
  fastify.post('/api/projects/:id/cloud/sync', async (req) => {
    const project = await getProject(req.params.id);
    if (project.cloud?.mode !== 'mirror') throw httpError(project.cloud ? `${project.cloud.label} keeps “${project.name}” in step itself.` : `“${project.name}” isn’t syncing.`, 400);
    return { status: await syncProject(project.id, { force: !!req.body?.force }) };
  });
}
