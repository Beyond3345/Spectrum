import { getProjectRoot } from '../services/projectService.js';
import { resolveReferences, addReference } from '../services/referenceService.js';

const MAX_INPUT_CHARS = 50_000;

async function withProject(req, reply, run) {
  let projectRoot;
  try {
    projectRoot = await getProjectRoot(req.body?.projectId);
  } catch (err) {
    // PROJECT_MISSING / PROJECT_NOT_FOUND carry their own message.
    return reply.code(err.code ? err.statusCode || 404 : 404).send({ ok: false, error: err.code ? err.message : 'Project not found.' });
  }
  try {
    return { ok: true, ...(await run(projectRoot)) };
  } catch (err) {
    if (!err.statusCode) req.log.error(err);
    return reply.code(err.statusCode || 500).send({ ok: false, error: err.message || 'Something went wrong.' });
  }
}

export function registerReferenceRoutes(fastify) {
  fastify.post('/api/references/resolve', async (req, reply) => {
    const { input, bibFile, llmConfig, searchConfig } = req.body || {};
    if (typeof input !== 'string' || !input.trim()) {
      return reply.code(400).send({ ok: false, error: 'Paste a DOI, link, arXiv ID or title.' });
    }
    if (input.length > MAX_INPUT_CHARS) {
      return reply.code(400).send({ ok: false, error: 'That’s too much text. Paste fewer references at a time.' });
    }
    return withProject(req, reply, (projectRoot) => resolveReferences({ projectRoot, input, bibFile, llmConfig, searchConfig }));
  });

  fastify.post('/api/references/add', async (req, reply) => {
    const { candidateId, bibFile, searchConfig } = req.body || {};
    if (typeof candidateId !== 'string' || !candidateId.trim()) {
      return reply.code(400).send({ ok: false, error: 'Choose a reference to add.' });
    }
    return withProject(req, reply, (projectRoot) => addReference({ projectRoot, candidateId, bibFile, searchConfig }));
  });
}
