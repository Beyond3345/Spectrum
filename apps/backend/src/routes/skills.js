import { getProjectRoot } from '../services/projectService.js';
import {
  createSkill,
  deleteSkill,
  duplicateSkill,
  importSkill,
  listSkills,
  readSkillFile,
  setSharing,
  setSkillEnabled,
  shareStatus,
  skillFiles,
  writeSkillFile
} from '../services/skillService.js';

export function registerSkillRoutes(fastify) {
  // project: a project's id, for its own choices (each skill's project and active)
  fastify.get('/api/skills', async (req) => ({ ok: true, skills: await listSkills(req.query.project ? await getProjectRoot(String(req.query.project)) : undefined) }));

  // on or off on this computer; a project's own choices go in its settings (PATCH /api/projects/:id/settings)
  fastify.patch('/api/skills/:id', async (req) => {
    await setSkillEnabled(req.params.id, req.body?.enabled);
    return { ok: true };
  });

  // { id, name, description, body }: one of the user's own
  fastify.post('/api/skills', async (req) => ({ ok: true, skill: await createSkill(req.body || {}) }));

  // { path }: a copy of a skill's folder on this computer
  fastify.post('/api/skills/import', async (req) => ({ ok: true, skill: await importSkill(req.body?.path) }));

  fastify.post('/api/skills/:id/duplicate', async (req) => ({ ok: true, skill: await duplicateSkill(req.params.id) }));

  fastify.delete('/api/skills/:id', async (req) => {
    await deleteSkill(req.params.id);
    return { ok: true };
  });

  fastify.get('/api/skills/:id/files', async (req) => ({ ok: true, files: await skillFiles(req.params.id) }));

  fastify.get('/api/skills/:id/file', async (req) => ({ ok: true, content: await readSkillFile(req.params.id, req.query.path) }));

  // the user's own skills only
  fastify.put('/api/skills/:id/file', async (req) => {
    await writeSkillFile(req.params.id, req.query.path, req.body?.content);
    return { ok: true };
  });

  // links for agents run outside Spectrum, in ~/.agents/skills and ~/.claude/skills
  fastify.get('/api/skills/share', async () => ({ ok: true, ...(await shareStatus()) }));
  fastify.put('/api/skills/share', async (req) => ({ ok: true, ...(await setSharing(req.body?.enabled)) }));
}
