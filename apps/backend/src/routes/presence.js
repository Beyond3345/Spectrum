import { promises as fs } from 'fs';
import { appPath, getProjectRoot, httpError, touchProject } from '../services/projectService.js';
import { cloudRootOf, readMirror } from '../services/mirrorService.js';
import { knownMachineNames, markClosed, markOpen, sharedSettings, shareSettings } from '../services/presenceService.js';
import { listFilesRecursive, renameOver } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { conflictCopies } from '../utils/conflictCopies.js';
import { moveToBin } from './projects.js';

/** A sync app's conflict copy in the project, and its original: both absolute, and the original's path. */
async function conflictCopy(req) {
  const root = await getProjectRoot(req.params.id);
  const copy = String(req.body?.path || '');
  const files = (await listFilesRecursive(root)).filter((i) => i.type === 'file').map((i) => i.path);
  const original = conflictCopies(files, await knownMachineNames(root))[copy];
  if (!original) throw httpError('That file isn’t a conflict copy.', 400);
  return { root, abs: safeJoin(root, copy), original, originalAbs: safeJoin(root, original) };
}

/**
 * Where the project's presence goes: a mirrored project's into its cloud copy once that's there (the mirror passes
 * .spectrum/open by), where the other computers look, whether they mirror it or work on it in place.
 */
async function presenceRoot(id) {
  const mirror = await readMirror(id);
  const cloud = mirror && cloudRootOf(mirror);
  if (cloud && (await fs.access(appPath(cloud, 'project.json')).then(() => true, () => false))) return cloud;
  return getProjectRoot(id);
}

export function registerPresenceRoutes(fastify) {
  // the open editor says so every 2 minutes, and hears which other computers have the project open
  fastify.post('/api/projects/:id/presence', async (req) => ({ ok: true, others: await markOpen(await presenceRoot(req.params.id)) }));

  fastify.delete('/api/projects/:id/presence', async (req) => {
    await markClosed(await presenceRoot(req.params.id));
    return { ok: true };
  });

  // the copy takes the original's place (the editor saved a version first)
  fastify.post('/api/projects/:id/conflict-copy/use', async (req) => {
    const { root, abs, original, originalAbs } = await conflictCopy(req);
    await renameOver(abs, originalAbs);
    await touchProject(root).catch(() => {});
    return { ok: true, original };
  });

  fastify.post('/api/projects/:id/conflict-copy/bin', async (req) => {
    if (!['darwin', 'win32'].includes(process.platform)) return { ok: false, error: 'Moving to the Bin is only supported on macOS and Windows.' };
    const { abs } = await conflictCopy(req);
    try {
      await fs.access(abs);
      await moveToBin(abs);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    return { ok: true };
  });

  // settings that follow the user to their other computers (settings.ts chooses which)
  fastify.get('/api/shared/settings', async () => ({ ok: true, ...(await sharedSettings()) }));

  fastify.put('/api/shared/settings', async (req) => {
    const settings = req.body?.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw httpError('Missing settings.', 400);
    const updatedAt = await shareSettings(settings);
    return { ok: true, shared: !!updatedAt, updatedAt };
  });
}
