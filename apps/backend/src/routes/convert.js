import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { createProject, getProjectRoot, httpError, readMeta } from '../services/projectService.js';
import { safeJoin } from '../utils/pathUtils.js';
import { closeLog, openLog, sendLog } from '../services/compileLog.js';
import { SUPPORTED_ENGINES } from '../services/compileService.js';
import { latexToTypst } from '../services/convertService.js';

const KINDS = {
  typst: { from: /\.(?:tex|ltx)$/i, convert: latexToTypst, suffix: ' (Typst)', wrong: 'Only a LaTeX document (.tex) converts to Typst.' }
};

export function registerConvertRoutes(fastify) {
  // A new project of the other kind from one of this project's documents, which stays as it is: { to: 'typst', doc,
  // engine (the LaTeX engine for pictures), convertId }. The steps arrive as they start at /api/compile/:convertId/log.
  fastify.post('/api/projects/:id/convert', async (req) => {
    const { to, doc, engine = 'auto', convertId } = req.body || {};
    const kind = KINDS[to];
    if (!kind) throw httpError('Choose what to convert to.', 400);
    if (!SUPPORTED_ENGINES.includes(engine)) throw httpError('Unsupported engine: ' + engine, 400);
    const root = await getProjectRoot(req.params.id);
    const rel = String(doc || '');
    if (!kind.from.test(rel)) throw httpError(kind.wrong, 400);
    if (!(await fs.stat(safeJoin(root, rel)).catch(() => null))?.isFile()) throw httpError('That document doesn’t exist.', 404);
    const meta = await readMeta(root);
    const log = typeof convertId === 'string' && convertId ? openLog(convertId) : null;
    const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-convert-'));
    try {
      const result = await kind.convert(root, rel, staging, { engine, onStep: (step) => sendLog(log, 'output', step + '\n') });
      const project = await createProject({
        name: meta.name + kind.suffix,
        meta: { mainFile: result.mainFile },
        populate: (target) => fs.cp(staging, target, { recursive: true })
      });
      return { ok: true, project, checks: result.checks };
    } finally {
      if (log) closeLog(convertId);
      await fs.rm(staging, { recursive: true, force: true });
    }
  });
}
