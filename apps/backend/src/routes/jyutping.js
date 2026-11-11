import { compileFolder } from '../services/compileService.js';
import { jyutpingInfo, jyutpingPreview } from '../services/jyutpingService.js';
import { isCjkFont, jyutpingPreamble, optionsProblem } from '../latex/jyutping.js';

const ENGINES = ['auto', 'xelatex', 'lualatex'];
const isFolder = (v) => v == null || v === '' || typeof v === 'string';
// a document's text, as the editor sends it
const MAX_TEXT = 5 * 1024 * 1024;

/** What's wrong with a request's options, cjkFont and engine, or null. */
function problem({ options, cjkFont, engine }) {
  if (engine !== undefined && !ENGINES.includes(engine)) return 'The engine must be auto, xelatex or lualatex.';
  if (cjkFont !== undefined && !isCjkFont(cjkFont)) return 'That Chinese font can’t be used.';
  return optionsProblem(options);
}

export function registerJyutpingRoutes(fastify) {
  // the package a compile uses (the folder's when it holds one) and the bundled CJK fonts
  fastify.get('/api/jyutping/info', async (req, reply) => {
    const folder = req.query?.folder;
    if (!isFolder(folder)) return reply.code(400).send({ ok: false, error: 'Invalid folder.' });
    return jyutpingInfo(folder);
  });

  // a short text with the options and font, as a PDF; JSON { ok: false, error, log } when it doesn't compile
  fastify.post('/api/jyutping/preview', async (req, reply) => {
    const { text, options = {}, cjkFont = '', engine = 'auto', folder, texFolder } = req.body || {};
    const error = problem({ options, cjkFont, engine }) || (!isFolder(folder) || !isFolder(texFolder) ? 'Invalid folder.' : null);
    if (error) return reply.code(400).send({ ok: false, error });
    const result = await jyutpingPreview({ text, options, cjkFont, engine, folder: folder || undefined, texFolder: texFolder || undefined }, compileFolder);
    if (!result.ok) return result;
    return reply.header('Content-Type', 'application/pdf').header('Cache-Control', 'no-cache').send(result.pdf);
  });

  // the document's text with xjyutping's preamble lines written in (or taken out, remove)
  fastify.post('/api/jyutping/preamble', async (req, reply) => {
    const { text, options = {}, cjkFont = '', engine = 'auto', remove = false } = req.body || {};
    const error = typeof text !== 'string' || text.length > MAX_TEXT ? 'Send the document’s text.' : typeof remove !== 'boolean' ? 'remove must be true or false.' : problem({ options, cjkFont, engine });
    if (error) return reply.code(400).send({ ok: false, error });
    return jyutpingPreamble(text, { options, cjkFont, engine, remove });
  });
}
