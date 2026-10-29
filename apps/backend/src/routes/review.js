import { aiReview, reviewState } from '../services/reviewService.js';
import { getProjectRoot, httpError, readMeta } from '../services/projectService.js';

/** The document a request names, a LaTeX, Typst or Markdown file, or the project's main file. */
async function documentOf(root, doc) {
  const named = String(doc || '') || (await readMeta(root)).mainFile || 'main.tex';
  if (!/\.(?:tex|typ|md|markdown)$/i.test(named)) throw httpError('Choose a LaTeX, Typst or Markdown document to review.', 400);
  return named;
}

export function registerReviewRoutes(fastify) {
  // whether doc's PDF is older than its source; bib=1 adds the .bib entries Preflight checks
  fastify.get('/api/projects/:id/review/state', async (req) => {
    const root = await getProjectRoot(req.params.id);
    return { ok: true, ...(await reviewState(root, await documentOf(root, req.query?.doc), { bib: req.query?.bib === '1' })) };
  });

  // The AI review. Read-only: one model call, no tools. Closing the request (Cancel) stops the call.
  fastify.post('/api/review', async (req, reply) => {
    const { projectId, doc, activePath, findings, llmConfig, reasoningEffort } = req.body || {};
    const root = await getProjectRoot(projectId);
    const cancel = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) cancel.abort();
    });
    return aiReview({ root, doc: await documentOf(root, doc), activePath: String(activePath || ''), findings, llmConfig, reasoningEffort, signal: cancel.signal });
  });
}
