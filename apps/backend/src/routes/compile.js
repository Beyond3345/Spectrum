import { listenLog } from '../services/compileLog.js';
import { BIB_TOOLS, runCompile, stopCompile, SUPPORTED_ENGINES } from '../services/compileService.js';
import { moveToNewFolders } from '../services/foldersService.js';
import { getProjectRoot, readMeta } from '../services/projectService.js';
import { synctexEdit, synctexView } from '../services/synctex.js';
import { auxKept } from '../services/texlabService.js';

const isCount = (n) => Number.isInteger(n) && n > 0;
// Typst's sys.inputs: a few short names and values, which the composer uses for its standalone flag
const isTypstInputs = (v) => v == null || (!!v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length <= 8
  && Object.entries(v).every(([key, value]) => /^[a-z][a-z0-9-]{0,31}$/.test(key) && typeof value === 'string' && value.length <= 200 && !/[\r\n]/.test(value)));
// the app's defaults, for a project without its own: '' is the built-in Typst
const isTypstVersion = (v) => v == null || v === '' || (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v));
const isMarkdownEngine = (v) => v == null || v === 'latex' || v === 'typst';
// doc is the project-relative .tex whose PDF is showing; without it, the main file's
const isDoc = (doc) => doc == null || (typeof doc === 'string' && !!doc);
const docOrMain = async (root, doc) => doc ?? ((await readMeta(root)).mainFile || 'main.tex');

export function registerCompileRoutes(fastify) {
  // the options are each optional: an editor from before them compiles as it always did
  fastify.post('/api/compile', async (req) => {
    const { projectId, mainFile = 'main.tex', engine = 'pdflatex', compileId, haltOnError, bibTool = 'auto', draft, fresh, texFolder, xjyutpingFolder, checkpoint, typstInputs, typstVersion, markdownEngine } = req.body || {};
    if (!projectId) {
      return { ok: false, error: 'Missing projectId.' };
    }
    if (!SUPPORTED_ENGINES.includes(engine)) {
      return { ok: false, error: `Unsupported engine: ${engine}. Supported: ${SUPPORTED_ENGINES.join(', ')}` };
    }
    if (!BIB_TOOLS.includes(bibTool)) {
      return { ok: false, error: `Unsupported bibliography tool: ${bibTool}. Supported: ${BIB_TOOLS.join(', ')}` };
    }
    if (!isTypstInputs(typstInputs)) {
      return { ok: false, error: 'Invalid typstInputs.' };
    }
    if (!isTypstVersion(typstVersion)) {
      return { ok: false, error: 'Invalid typstVersion.' };
    }
    if (!isMarkdownEngine(markdownEngine)) {
      return { ok: false, error: 'Invalid markdownEngine.' };
    }
    // a project from before 2.1: its diagrams to diagrams/ and its images to figures/, on its first compile. Not on a
    // composer preview's, which compiles the very diagram that would move
    const folders = /^(?:figures|diagrams)\//i.test(mainFile) ? null : await moveToNewFolders(await getProjectRoot(projectId));
    const res = await runCompile({
      projectId,
      mainFile,
      engine,
      compileId: typeof compileId === 'string' && compileId ? compileId : undefined,
      haltOnError: haltOnError === true,
      bibTool,
      draft: draft === true,
      fresh: fresh === true,
      texFolder: typeof texFolder === 'string' ? texFolder : undefined,
      // a folder holding the user's own xjyutping, used in place of Spectrum's when it holds the package
      xjyutpingFolder: typeof xjyutpingFolder === 'string' && xjyutpingFolder ? xjyutpingFolder : undefined,
      checkpoint: checkpoint === true,
      typstInputs: typstInputs ?? undefined,
      typstVersion: typstVersion || undefined,
      markdownEngine: markdownEngine ?? undefined
    });
    if (res.ok) auxKept(projectId);
    return folders ? { ...res, folders } : res;
  });

  // by the id the editor gave the compile: a stop that arrives before its compile still stops it
  fastify.post('/api/compile/stop', async (req, reply) => {
    const { compileId } = req.body || {};
    if (typeof compileId !== 'string' || !compileId) return reply.code(400).send({ ok: false, error: 'Missing compileId.' });
    return { ok: stopCompile(compileId) };
  });

  // A compile's output as it comes, by its id, as server-sent events: engine (the one running, first), output (text),
  // status (Spectrum's own line, such as a Biber download's), then end. It can be opened before its compile starts, and one opened late gets the output so far first.
  fastify.get('/api/compile/:compileId/log', async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    reply.raw.write(': compiling\n\n');
    const stop = listenLog(req.params.compileId, (event, data) => {
      if (reply.raw.writableEnded) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (event === 'end') reply.raw.end();
    });
    reply.raw.on('close', stop);
    return reply;
  });

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
