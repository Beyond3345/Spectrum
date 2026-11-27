import { getProjectRoot } from '../services/projectService.js';
import { resolveReferences, addReference, commitReference, newEntry } from '../services/referenceService.js';
import { checkNote, checkReferences } from '../services/referenceCheck.js';

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
  // Review's References exist: each entry against its record, by code
  fastify.post('/api/references/check', async (req, reply) => {
    // doc: the document reviewed, whose own .bib files are checked
    const { keys, doc } = req.body || {};
    if (keys != null && (!Array.isArray(keys) || keys.length > 300 || keys.some((k) => typeof k !== 'string'))) {
      return reply.code(400).send({ ok: false, error: 'Invalid keys.' });
    }
    if (doc != null && typeof doc !== 'string') return reply.code(400).send({ ok: false, error: 'Invalid document.' });
    return withProject(req, reply, async (projectRoot) => {
      const result = await checkReferences(projectRoot, { keys: keys ?? undefined, file: doc || undefined });
      return { ...result, note: checkNote(result) };
    });
  });

  // preview: drafts for the References card, nothing written; manual: a blank draft
  fastify.post('/api/references/resolve', async (req, reply) => {
    const { input, bibFile, llmConfig, searchConfig, preview, manual } = req.body || {};
    if (manual === true) return withProject(req, reply, (projectRoot) => newEntry({ projectRoot, bibFile }));
    if (typeof input !== 'string' || !input.trim()) {
      return reply.code(400).send({ ok: false, error: 'Paste a DOI, link, arXiv ID or title.' });
    }
    if (input.length > MAX_INPUT_CHARS) {
      return reply.code(400).send({ ok: false, error: 'That’s too much text. Paste fewer references at a time.' });
    }
    return withProject(req, reply, (projectRoot) => resolveReferences({ projectRoot, input, bibFile, llmConfig, searchConfig, preview: preview === true }));
  });

  fastify.post('/api/references/add', async (req, reply) => {
    const { candidateId, bibFile, searchConfig, preview } = req.body || {};
    if (typeof candidateId !== 'string' || !candidateId.trim()) {
      return reply.code(400).send({ ok: false, error: 'Choose a reference to add.' });
    }
    return withProject(req, reply, (projectRoot) => addReference({ projectRoot, candidateId, bibFile, searchConfig, preview: preview === true }));
  });

  // a draft the user checked in the References card: written to the .bib, a duplicate reported
  fastify.post('/api/references/commit', async (req, reply) => {
    const { draft, bibFile, input } = req.body || {};
    if (!draft || typeof draft !== 'object' || typeof draft.type !== 'string' || typeof (draft.key ?? '') !== 'string'
      || !draft.fields || typeof draft.fields !== 'object' || Array.isArray(draft.fields) || Object.keys(draft.fields).length > 80) {
      return reply.code(400).send({ ok: false, error: 'That entry can’t be read.' });
    }
    return withProject(req, reply, (projectRoot) => commitReference({ projectRoot, draft: { type: draft.type, key: draft.key || '', fields: draft.fields }, bibFile, input: typeof input === 'string' ? input.slice(0, 500) : '' }));
  });
}
