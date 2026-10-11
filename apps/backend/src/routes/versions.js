import { getProjectRoot, touchProject } from '../services/projectService.js';
import {
  listVersions,
  createVersion,
  versionChanges,
  compareWithCurrent,
  readVersionFile,
  restoreVersion,
  renameVersion,
  deleteVersion
} from '../services/versionService.js';

export function registerVersionRoutes(fastify) {
  fastify.get('/api/projects/:id/versions', async (req) => {
    const root = await getProjectRoot(req.params.id);
    return { ok: true, versions: await listVersions(root) };
  });

  fastify.post('/api/projects/:id/versions', async (req) => {
    const root = await getProjectRoot(req.params.id);
    const { label, reason } = req.body || {};
    return { ok: true, ...(await createVersion(root, { label, reason })) };
  });

  fastify.get('/api/projects/:id/versions/:vid/changes', async (req) => {
    const root = await getProjectRoot(req.params.id);
    return { ok: true, files: await versionChanges(root, req.params.vid) };
  });

  fastify.get('/api/projects/:id/versions/:vid/compare', async (req) => {
    const root = await getProjectRoot(req.params.id);
    return { ok: true, files: await compareWithCurrent(root, req.params.vid) };
  });

  fastify.get('/api/projects/:id/versions/:vid/file', async (req) => {
    const root = await getProjectRoot(req.params.id);
    return readVersionFile(root, req.params.vid, String(req.query?.path || ''));
  });

  fastify.post('/api/projects/:id/versions/:vid/restore', async (req) => {
    const root = await getProjectRoot(req.params.id);
    const result = await restoreVersion(root, req.params.vid, req.body?.path || '');
    await touchProject(root).catch(() => {});
    return { ok: true, ...result };
  });

  fastify.patch('/api/projects/:id/versions/:vid', async (req) => {
    const root = await getProjectRoot(req.params.id);
    return { ok: true, version: await renameVersion(root, req.params.vid, req.body?.label) };
  });

  fastify.delete('/api/projects/:id/versions/:vid', async (req) => {
    const root = await getProjectRoot(req.params.id);
    await deleteVersion(root, req.params.vid);
    return { ok: true };
  });
}
