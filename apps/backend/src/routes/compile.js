import { runCompile, SUPPORTED_ENGINES } from '../services/compileService.js';
import { getProjectRoot } from '../services/projectService.js';
import { synctexEdit, synctexView } from '../services/synctex.js';

const isCount = (n) => Number.isInteger(n) && n > 0;

export function registerCompileRoutes(fastify) {
  fastify.post('/api/compile', async (req) => {
    const { projectId, mainFile = 'main.tex', engine = 'pdflatex' } = req.body || {};
    if (!projectId) {
      return { ok: false, error: 'Missing projectId.' };
    }
    if (!SUPPORTED_ENGINES.includes(engine)) {
      return { ok: false, error: `Unsupported engine: ${engine}. Supported: ${SUPPORTED_ENGINES.join(', ')}` };
    }
    return runCompile({ projectId, mainFile, engine });
  });

  // PDF → source: page is 1-based, x and y are points from the page's top-left corner
  fastify.post('/api/projects/:id/synctex/edit', async (req, reply) => {
    const { page, x, y } = req.body || {};
    if (!isCount(page) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return reply.code(400).send({ ok: false, error: 'Invalid position.' });
    }
    return synctexEdit(await getProjectRoot(req.params.id), page, x, y);
  });

  // source → PDF: file is project-relative, line 1-based; engines rarely record columns, so column goes unused
  fastify.post('/api/projects/:id/synctex/view', async (req, reply) => {
    const { file, line, column } = req.body || {};
    if (typeof file !== 'string' || !file || !isCount(line) || (column != null && !Number.isFinite(column))) {
      return reply.code(400).send({ ok: false, error: 'Invalid position.' });
    }
    return synctexView(await getProjectRoot(req.params.id), file, line);
  });
}
