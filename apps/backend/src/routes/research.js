import { resolveLLMConfig } from '../services/llmService.js';
import { getProjectRoot, httpError } from '../services/projectService.js';
import {
  RESEARCH_SOURCES, addResults, deleteSession, fetchPdf, getSession, listSessions, openNote, searchResearch, updateSession
} from '../services/researchService.js';

const year = (v) => v == null || (Number.isInteger(v) && v >= 1000 && v <= 3000);
const KEY_FIELDS = ['openalexKey', 'openalexEmail', 'semanticScholarKey', 'ncbiKey'];

/** This computer's research keys from the request, as strings; they go to the sources and are never stored. */
function keysFrom(keys) {
  if (keys == null) return {};
  if (typeof keys !== 'object' || Array.isArray(keys)) throw httpError('Invalid keys.', 400);
  return Object.fromEntries(KEY_FIELDS.filter((k) => typeof keys[k] === 'string' && keys[k].trim()).map((k) => [k, keys[k].trim().slice(0, 300)]));
}

const resultIdOf = (body) => {
  if (typeof body?.resultId !== 'string' || !body.resultId) throw httpError('Choose a result.', 400);
  return body.resultId;
};

export function registerResearchRoutes(fastify) {
  fastify.post('/api/research/search', async (req) => {
    const { projectId, question, sources, yearFrom, yearTo, preprints, triage, sessionId, keys, searchConfig, llmConfig } = req.body || {};
    if (typeof question !== 'string' || !question.trim() || question.length > 500) throw httpError('Type a question of up to 500 characters.', 400);
    if (!Array.isArray(sources) || !sources.length || sources.some((s) => !RESEARCH_SOURCES.includes(s))) throw httpError('Choose at least one source.', 400);
    if (!year(yearFrom) || !year(yearTo) || (yearFrom && yearTo && yearFrom > yearTo)) throw httpError('The years aren’t a valid range.', 400);
    if (sessionId != null && typeof sessionId !== 'string') throw httpError('Invalid session.', 400);
    const root = await getProjectRoot(projectId);
    const session = await searchResearch({
      root,
      question,
      sources: [...new Set(sources)],
      yearFrom: yearFrom ?? undefined,
      yearTo: yearTo ?? undefined,
      preprints: preprints !== false,
      keys: keysFrom(keys),
      searchConfig,
      llmConfig: triage ? resolveLLMConfig(llmConfig) : undefined,
      triage: triage === true,
      sessionId: sessionId || undefined
    });
    return { ok: true, session };
  });

  fastify.get('/api/projects/:id/research', async (req) => ({ ok: true, sessions: await listSessions(await getProjectRoot(req.params.id)) }));

  fastify.get('/api/projects/:id/research/:rid', async (req) => ({ ok: true, session: await getSession(await getProjectRoot(req.params.id), req.params.rid) }));

  fastify.put('/api/projects/:id/research/:rid', async (req) => ({
    ok: true,
    session: await updateSession(await getProjectRoot(req.params.id), req.params.rid, req.body)
  }));

  fastify.delete('/api/projects/:id/research/:rid', async (req) => {
    await deleteSession(await getProjectRoot(req.params.id), req.params.rid);
    return { ok: true };
  });

  fastify.post('/api/projects/:id/research/:rid/add', async (req) => {
    const { resultIds, bibFile, searchConfig } = req.body || {};
    if (resultIds != null && (!Array.isArray(resultIds) || resultIds.some((id) => typeof id !== 'string'))) throw httpError('Invalid results.', 400);
    if (bibFile != null && typeof bibFile !== 'string') throw httpError('That bibliography file isn’t valid.', 400);
    const root = await getProjectRoot(req.params.id);
    return { ok: true, ...(await addResults({ root, id: req.params.rid, resultIds: resultIds ?? undefined, bibFile: bibFile || undefined, searchConfig })) };
  });

  fastify.post('/api/projects/:id/research/:rid/note', async (req) => {
    const root = await getProjectRoot(req.params.id);
    return { ok: true, ...(await openNote({ root, id: req.params.rid, resultId: resultIdOf(req.body) })) };
  });

  fastify.post('/api/projects/:id/research/:rid/pdf', async (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().slice(0, 300) : '';
    const root = await getProjectRoot(req.params.id);
    return { ok: true, ...(await fetchPdf({ root, id: req.params.rid, resultId: resultIdOf(req.body), email })) };
  });
}
