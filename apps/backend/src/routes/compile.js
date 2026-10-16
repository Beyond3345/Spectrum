import { runCompile, stopCompile, SUPPORTED_ENGINES } from '../services/compileService.js';
import { getProjectRoot, readMeta } from '../services/projectService.js';
import { synctexEdit, synctexView } from '../services/synctex.js';

const isCount = (n) => Number.isInteger(n) && n > 0;
// doc is the project-relative .tex whose PDF is showing; without it, the main file's
const isDoc = (doc) => doc == null || (typeof doc === 'string' && !!doc);
const docOrMain = async (root, doc) => doc ?? ((await readMeta(root)).mainFile || 'main.tex');

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

  fastify.post('/api/compile/stop', async (req) => ({ ok: stopCompile(String(req.body?.projectId || '')) }));

  // PDF → source: page is 1-based, x and y are points from the page's top-left corner
  fastify.post('/api/projects/:id/synctex/edit', async (req, reply) => {
    const { page, x, y, doc } = req.body || {};
    if (!isCount(page) || !Number.isFinite(x) || !Number.isFinite(y) || !isDoc(doc)) {
      return reply.code(400).send({ ok: false, error: 'Invalid position.' });
    }
    const root = await getProjectRoot(req.params.id);
    return synctexEdit(root, await docOrMain(root, doc), page, x, y);
  });

  // source → PDF: file is project-relative, line 1-based; engines rarely record columns, so column goes unused
  fastify.post('/api/projects/:id/synctex/view', async (req, reply) => {
    const { file, line, column, doc } = req.body || {};
    if (typeof file !== 'string' || !file || !isCount(line) || (column != null && !Number.isFinite(column)) || !isDoc(doc)) {
      return reply.code(400).send({ ok: false, error: 'Invalid position.' });
    }
    const root = await getProjectRoot(req.params.id);
    return synctexView(root, await docOrMain(root, doc), file, line);
  });
}
