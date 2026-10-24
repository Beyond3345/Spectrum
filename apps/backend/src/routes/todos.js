import { promises as fs } from 'fs';
import path from 'path';
import { appPath, getProjectRoot, httpError } from '../services/projectService.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';

// One file per item, .spectrum/todos/<id>.json (and notes/<id>.json, routes/notes.js), so two computers' lists join
// rather than one replacing the other. 1.10.4 never looks in either folder.
export const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_TEXT = 2000;

export const isText = (value, max) => typeof value === 'string' && value.length <= max;
const isCount = (value) => Number.isInteger(value) && value > 0;

/** The file for the item the address names, in .spectrum/<folder>. */
export async function itemFile(req, folder, id) {
  const root = await getProjectRoot(req.params.id);
  if (!ITEM_ID.test(String(id || ''))) throw httpError('Invalid id.', 400);
  return appPath(root, folder, `${id}.json`);
}

/** Every item in .spectrum/<folder>, oldest first; a sync app's conflict copy of one (not named by its id) isn't listed. */
export async function readItems(root, folder) {
  const dir = appPath(root, folder);
  const items = [];
  for (const name of await fs.readdir(dir).catch(() => [])) {
    if (!name.endsWith('.json')) continue;
    const item = await readJson(path.join(dir, name)).catch(() => null); // half-written or hand-edited
    if (item && name === `${item.id}.json` && typeof item.text === 'string' && typeof item.createdAt === 'string') items.push(item);
  }
  return items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

// where a to-do points: a source line (found again by its text if lines move), a PDF page or a reference. Fields a
// later version adds go through, and a kind of link it adds is kept as it is
function todoLink(link) {
  if (link == null) return undefined;
  if (typeof link !== 'object' || Array.isArray(link)) throw httpError('Invalid to-do link.', 400);
  if ('file' in link) {
    if (!isText(link.file, 1024) || !link.file || !isCount(link.line) || (link.snippet != null && typeof link.snippet !== 'string')) throw httpError('Invalid line link.', 400);
    return { ...link, ...(link.snippet != null && { snippet: link.snippet.slice(0, MAX_TEXT) }) };
  }
  if ('doc' in link) {
    if (!isText(link.doc, 1024) || !link.doc || !isCount(link.page)) throw httpError('Invalid page link.', 400);
    return link;
  }
  if ('key' in link && (!isText(link.key, 200) || !link.key)) throw httpError('Invalid reference link.', 400);
  return link;
}

export function registerTodoRoutes(fastify) {
  fastify.get('/api/projects/:id/todos', async (req) => ({ ok: true, todos: await readItems(await getProjectRoot(req.params.id), 'todos') }));

  fastify.put('/api/projects/:id/todos/:tid', async (req) => {
    const file = await itemFile(req, 'todos', req.params.tid);
    // the rest: fields a later version adds, which a save here keeps
    const { id, text, done, createdAt, updatedAt, link, ...rest } = req.body || {};
    if (id !== req.params.tid) throw httpError('The to-do’s id doesn’t match the address.', 400);
    if (!isText(text, MAX_TEXT)) throw httpError(`A to-do’s text is at most ${MAX_TEXT} characters.`, 400);
    if (typeof done !== 'boolean' || !isText(createdAt, 40) || !isText(updatedAt, 40)) throw httpError('Invalid to-do.', 400);
    const todo = { ...rest, id, text, done, createdAt, updatedAt, ...(link != null && { link: todoLink(link) }) };
    await writeJsonAtomic(file, todo);
    return { ok: true, todo };
  });

  fastify.delete('/api/projects/:id/todos/:tid', async (req) => {
    await fs.rm(await itemFile(req, 'todos', req.params.tid), { force: true });
    return { ok: true };
  });
}
