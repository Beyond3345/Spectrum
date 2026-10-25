import { getProjectRoot, httpError } from '../services/projectService.js';
import { authorise, cancelPrompt, forgetKey, importRefs, pickCitation, searchLibrary, syncCollection, zoteroStatus } from '../services/zoteroService.js';

const ITEM_KEY = /^[A-Z0-9]{8}$/;

/** What waited in Zotero, or { cancelled: true } when Cancel stopped it. */
const unlessCancelled = (run) => run().catch((err) => (err.code === 'CANCELLED' ? { cancelled: true } : Promise.reject(err)));

const bibFileOf = (body) => {
  if (body?.bibFile != null && typeof body.bibFile !== 'string') throw httpError('That bibliography file isn’t valid.', 400);
  return body?.bibFile || undefined;
};

export function registerZoteroRoutes(fastify) {
  fastify.get('/api/zotero/status', async () => ({ ok: true, ...(await zoteroStatus()) }));

  // Zotero's Allow prompt, which waits for the user; Cancel answers it with { cancelled: true }
  fastify.post('/api/zotero/authorize', async () => ({ ok: true, ...(await unlessCancelled(authorise)) }));

  fastify.delete('/api/zotero/authorize', async () => {
    await forgetKey();
    return { ok: true, ...(await zoteroStatus()) };
  });

  fastify.post('/api/zotero/cancel', async () => {
    cancelPrompt();
    return { ok: true };
  });

  // Zotero closed or its local API off is no error here: \cite completion asks on every letter
  fastify.get('/api/zotero/search', async (req) => {
    const q = String(req.query?.q || '').trim();
    if (!q || q.length > 200) throw httpError('Type up to 200 characters to search for.', 400);
    try {
      return { ok: true, items: await searchLibrary(q) };
    } catch (err) {
      if (err.code === 'UNREACHABLE') return { ok: true, items: [], message: err.message };
      throw err;
    }
  });

  // Zotero's citation picker, for the citation command the document uses
  fastify.post('/api/projects/:id/zotero/cite', async (req) => {
    const command = req.body?.command;
    if (typeof command !== 'string' || !/^[A-Za-z]{1,30}$/.test(command)) throw httpError('Choose a citation command.', 400);
    const bibFile = bibFileOf(req.body);
    const root = await getProjectRoot(req.params.id);
    return { ok: true, ...(await unlessCancelled(() => pickCitation(root, command, bibFile))) };
  });

  fastify.post('/api/projects/:id/zotero/add', async (req) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length || items.length > 50 || items.some((k) => !ITEM_KEY.test(k))) throw httpError('Choose up to 50 items from Zotero.', 400);
    const bibFile = bibFileOf(req.body);
    const root = await getProjectRoot(req.params.id);
    return { ok: true, ...(await importRefs(root, [...new Set(items)].map((itemKey) => ({ itemKey })), bibFile)) };
  });

  // on opening the project and on window focus: entries only ever go into the collection from here
  fastify.post('/api/projects/:id/zotero/sync', async (req) => ({ ok: true, ...(await syncCollection(await getProjectRoot(req.params.id))) }));
}
