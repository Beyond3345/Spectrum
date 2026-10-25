import { promises as fs } from 'fs';
import { getProjectRoot, httpError, mutateProjectFiles } from '../services/projectService.js';
import { writeJsonAtomic } from '../utils/fsUtils.js';
import { MAX_TEXT, isText, itemFile, readItems } from './todos.js';

// PDF notes, one file each in .spectrum/notes. doc: the document whose PDF it's on; x and y: where on the page, in PDF
// points from its top-left corner, as the editor places them
export function registerNoteRoutes(fastify) {
  fastify.get('/api/projects/:id/notes', async (req) => {
    const notes = await readItems(await getProjectRoot(req.params.id), 'notes');
    const doc = req.query?.doc;
    return { ok: true, notes: doc ? notes.filter((note) => note.doc === doc) : notes };
  });

  fastify.put('/api/projects/:id/notes/:nid', async (req) => {
    const file = await itemFile(req, 'notes', req.params.nid);
    // the rest: fields a later version adds, which a save here keeps
    const { id, doc, page, x, y, text, colour, createdAt, updatedAt, ...rest } = req.body || {};
    if (id !== req.params.nid) throw httpError('The note’s id doesn’t match the address.', 400);
    if (!isText(text, MAX_TEXT)) throw httpError(`A note’s text is at most ${MAX_TEXT} characters.`, 400);
    const valid = isText(doc, 1024) && doc && Number.isInteger(page) && page > 0 && Number.isFinite(x) && Number.isFinite(y)
      && (colour == null || isText(colour, 32)) && isText(createdAt, 40) && isText(updatedAt, 40);
    if (!valid) throw httpError('Invalid note.', 400);
    const note = { ...rest, id, doc, page, x, y, text, ...(colour != null && { colour }), createdAt, updatedAt };
    // in the project files' lock, which a GitHub pull holds while it merges notes
    await mutateProjectFiles(() => writeJsonAtomic(file, note));
    return { ok: true, note };
  });

  fastify.delete('/api/projects/:id/notes/:nid', async (req) => {
    const file = await itemFile(req, 'notes', req.params.nid);
    await mutateProjectFiles(() => fs.rm(file, { force: true }));
    return { ok: true };
  });
}
