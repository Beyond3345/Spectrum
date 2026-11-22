import { promises as fs } from 'fs';
import path from 'path';
import { appPath, getProjectRoot, httpError, mutateProjectFiles } from '../services/projectService.js';
import { readProjectSettings, updateProjectSettings } from '../services/projectSettings.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';

// One file per item, .spectrum/todos/<id>.json (and notes/<id>.json, routes/notes.js), so two computers' lists join
// rather than one replacing the other. 1.10.4 never looks in either folder.
export const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_TEXT = 2000;
// a to-do's note, since 2.6 (MAX_NOTE in the editor's todos.ts); 2.5 passes it through as a field it doesn't know
const MAX_NOTE = 4000;

export const isText = (value, max) => typeof value === 'string' && value.length <= max;
const isCount = (value) => Number.isInteger(value) && value > 0;
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// The user's to-do groups, since 2.6: settings.json's todoGroups, { id: { name, order } }, which a GitHub pull merges
// group by group (mergeRules.js mergeMeta) and an older Spectrum's settings save keeps. A to-do names its group by id
// in its own field, group; one whose group is gone (deleted here or on another computer) is in no group.
export const MAX_GROUP_NAME = 80;
const MAX_GROUPS = 100;
// a group's or a to-do's colour, since 2.7: a place on the Spectrum wheel (the editor's todos.ts TODO_HUES), with
// room for a later version's wider wheel
const MAX_HUE = 63;
const isHue = (h) => h == null || (Number.isInteger(h) && h >= 0 && h <= MAX_HUE);
const isGroup = (g) => isObject(g) && isText(g.name, MAX_GROUP_NAME) && !!g.name.trim() && Number.isFinite(g.order) && isHue(g.hue);

/** The project's to-do groups as settings hold them, each one that can't be read left out. */
export function todoGroups(settings) {
  const groups = isObject(settings?.todoGroups) ? settings.todoGroups : {};
  return Object.fromEntries(Object.entries(groups).filter(([id, g]) => ITEM_ID.test(id) && isGroup(g)));
}

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

/**
 * PDF notes' documents and to-dos' files and documents follow a rename of `from` (a file, or a folder's files) to `to`.
 * Resolves how many couldn't be rewritten, each passed by so the rest still move.
 */
export async function followRename(root, from, to) {
  const moved = (p) => (typeof p === 'string' && (p === from || p.startsWith(`${from}/`)) ? to + p.slice(from.length) : null);
  let unmoved = 0;
  const write = (file, item) => writeJsonAtomic(file, item).catch(() => {
    unmoved += 1;
  });
  for (const note of await readItems(root, 'notes')) {
    const doc = moved(note.doc);
    if (doc) await write(appPath(root, 'notes', `${note.id}.json`), { ...note, doc });
  }
  for (const todo of await readItems(root, 'todos')) {
    const file = moved(todo.link?.file);
    const doc = moved(todo.link?.doc);
    if (file || doc) await write(appPath(root, 'todos', `${todo.id}.json`), { ...todo, link: { ...todo.link, ...(file && { file }), ...(doc && { doc }) } });
  }
  return unmoved;
}

// the words a line link was added on, since 2.7: all of col, endLine, endCol (columns from 0) and text (the words,
// at most MAX_TEXT, which find them again) or none; removed, set when the words were deleted. 2.6 keeps them as fields
// it doesn't know
const MAX_COLUMN = 100000;
const isColumn = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_COLUMN;
function isRange(link) {
  const { col, endLine, endCol, text, removed } = link;
  if (removed != null && typeof removed !== 'boolean') return false;
  if ([col, endLine, endCol, text].every((v) => v == null)) return true;
  return isColumn(col) && isColumn(endCol) && isCount(endLine) && typeof text === 'string' && !!text && text.length <= MAX_TEXT &&
    (endLine > link.line || (endLine === link.line && endCol > col));
}

// where a to-do points: a source line (found again by its text if lines move), a PDF page or a reference. Fields a
// later version adds go through, and a kind of link it adds is kept as it is
function todoLink(link) {
  if (link == null) return undefined;
  if (typeof link !== 'object' || Array.isArray(link)) throw httpError('Invalid to-do link.', 400);
  if ('file' in link) {
    if (!isText(link.file, 1024) || !link.file || !isCount(link.line) || (link.snippet != null && typeof link.snippet !== 'string')) throw httpError('Invalid line link.', 400);
    if (!isRange(link)) throw httpError('Invalid range in a line link.', 400);
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
  fastify.get('/api/projects/:id/todos', async (req) => {
    const root = await getProjectRoot(req.params.id);
    return { ok: true, todos: await readItems(root, 'todos'), groups: todoGroups(await readProjectSettings(root)) };
  });

  // groups: { id: { name, order } | null }, each one given added or changed (fields a later version adds kept), null
  // deleting it; the others stay as they are. Its to-dos keep their group field, so they come back with an Undo.
  fastify.patch('/api/projects/:id/todo-groups', async (req) => {
    const { groups } = req.body || {};
    if (!isObject(groups)) throw httpError('Give the groups to change.', 400);
    for (const [id, g] of Object.entries(groups)) {
      if (!ITEM_ID.test(id)) throw httpError('Invalid group id.', 400);
      if (g !== null && !isGroup(g)) throw httpError(`A group has a name of up to ${MAX_GROUP_NAME} characters and a place in the order.`, 400);
    }
    const settings = await updateProjectSettings(await getProjectRoot(req.params.id), (old) => {
      const next = { ...(isObject(old.todoGroups) ? old.todoGroups : {}) };
      for (const [id, g] of Object.entries(groups)) {
        if (g === null) delete next[id];
        else next[id] = { ...(isObject(next[id]) ? next[id] : {}), ...g, name: g.name.trim() };
      }
      if (Object.keys(next).length > MAX_GROUPS) throw httpError(`A project has at most ${MAX_GROUPS} to-do groups.`, 400);
      const { todoGroups: _old, ...rest } = old;
      return { ...rest, ...(Object.keys(next).length && { todoGroups: next }) };
    });
    return { ok: true, groups: todoGroups(settings) };
  });

  fastify.put('/api/projects/:id/todos/:tid', async (req) => {
    // the rest: fields a later version adds, which a save here keeps
    const { id, text, done, createdAt, updatedAt, link, ...rest } = req.body || {};
    if (id !== req.params.tid) throw httpError('The to-do’s id doesn’t match the address.', 400);
    if (!isText(text, MAX_TEXT)) throw httpError(`A to-do’s text is at most ${MAX_TEXT} characters.`, 400);
    if (rest.note != null && !isText(rest.note, MAX_NOTE)) throw httpError(`A to-do’s note is at most ${MAX_NOTE} characters.`, 400);
    // its group's id, since 2.6; 2.5 passes it through as a field it doesn't know
    if (rest.group != null && (typeof rest.group !== 'string' || !ITEM_ID.test(rest.group))) throw httpError('Invalid to-do group.', 400);
    // its colour in no group and its place in its list, since 2.7
    if (!isHue(rest.hue)) throw httpError('Invalid to-do colour.', 400);
    if (rest.order != null && !Number.isFinite(rest.order)) throw httpError('Invalid to-do order.', 400);
    if (typeof done !== 'boolean' || !isText(createdAt, 40) || !isText(updatedAt, 40)) throw httpError('Invalid to-do.', 400);
    const todo = { ...rest, id, text, done, createdAt, updatedAt, ...(link != null && { link: todoLink(link) }) };
    // in the project files' lock, which a GitHub pull holds while it merges to-dos, with the folder looked up there
    await mutateProjectFiles(async () => writeJsonAtomic(await itemFile(req, 'todos', req.params.tid), todo));
    return { ok: true, todo };
  });

  fastify.delete('/api/projects/:id/todos/:tid', async (req) => {
    await mutateProjectFiles(async () => fs.rm(await itemFile(req, 'todos', req.params.tid), { force: true }));
    return { ok: true };
  });
}
