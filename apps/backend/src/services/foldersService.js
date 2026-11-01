import { promises as fs } from 'node:fs';
import path from 'node:path';
import { listFilesRecursive } from '../utils/fsUtils.js';
import { mutateProjectRoot, readMeta, touchProject, updateMeta } from './projectService.js';

// The composer's drawing on a line of its own (% for TikZ, // for Typst and %% for Mermaid): base64 JSON, then the
// hash of the text the drawing writes. It goes last, but the composer finds it anywhere (diagram/fileFormat.ts), as
// text added below it is a hand edit there
export const DIAGRAM_MARK = /^(?:%%?|\/\/) spectrum-diagram v1 [A-Za-z0-9+/=]+ [0-9a-f]{16}[ \t]*\r?$/m;

/** The folder layout a project.json records once a project has been moved to it: diagrams/ and figures/. */
const LAYOUT = 2;
const DOCUMENT = /\.(?:tex|ltx|typ|md|markdown)$/i;
// a path in a document: at the start of a word or after ../, not inside another folder's name (chapter/images/)
const before = String.raw`(?<=^|[^\w.\-/]|\.\./)`;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Spectrum 2.1 keeps the composer's diagrams in diagrams/ and Insert figure's images in figures/; before, they were in
 * figures/ and images/. Once per project, before its first compile: the composer's diagrams in figures/ (the files
 * with its drawing, and the .pdf or .png made from each) move to diagrams/, then images/ moves into figures/, and the
 * paths in the project's documents follow. Anything else in figures/, such as images put there by hand, stays. A
 * diagram whose name diagrams/ already has stays, and images/ stays whole when any of its files' names is taken in
 * figures/. Answers what moved and which documents changed, or null when nothing did.
 */
export async function moveToNewFolders(root) {
  if ((await readMeta(root)).layout === LAYOUT) return null;
  return mutateProjectRoot(root, async () => {
    const items = await listFilesRecursive(root);
    const files = new Set(items.filter((i) => i.type === 'file').map((i) => i.path));
    const moves = [];
    const stems = [];

    // the composer's diagrams, with the preview PDF or Mermaid image beside each
    for (const file of files) {
      const m = /^figures\/([^/]+)\.(tex|typ|mmd)$/i.exec(file);
      if (!m) continue;
      const text = await fs.readFile(path.join(root, file), 'utf8').catch(() => '');
      if (m[2].toLowerCase() !== 'mmd' && !DIAGRAM_MARK.test(text)) continue;
      const group = [file, `figures/${m[1]}.pdf`, `figures/${m[1]}.png`].filter((f) => files.has(f));
      const to = (f) => `diagrams/${f.slice('figures/'.length)}`;
      if (group.some((f) => files.has(to(f)))) continue;
      moves.push(...group.map((f) => [f, to(f)]));
      stems.push(m[1]);
    }
    for (const [from, to] of moves) await moveFile(root, from, to);

    // images/ into figures/, unless a name there is taken
    const images = [...files].filter((f) => f.startsWith('images/'));
    const left = new Set([...files].filter((f) => !moves.some(([from]) => from === f)));
    const imagesMove = images.length && !images.some((f) => left.has(`figures/${f.slice('images/'.length)}`));
    if (imagesMove) {
      for (const f of images) {
        const to = `figures/${f.slice('images/'.length)}`;
        await moveFile(root, f, to);
        moves.push([f, to]);
      }
    }
    if (!moves.length) {
      await updateMeta(root, (meta) => ({ ...meta, layout: LAYOUT }));
      return null;
    }
    for (const dir of ['figures', 'images']) await removeIfEmpty(root, dir);

    // the paths in the documents: each diagram by name first, so an image moved into figures/ isn't taken for one
    const rules = [
      ...stems.map((stem) => [new RegExp(`${before}figures/${escape(stem)}(?![\\w-])`, 'g'), `diagrams/${stem}`]),
      ...(imagesMove ? [[new RegExp(`${before}images/`, 'g'), 'figures/']] : [])
    ];
    const rewrote = [];
    for (const doc of [...files].filter((f) => DOCUMENT.test(f) && !moves.some(([from]) => from === f))) {
      const abs = path.join(root, doc);
      const text = await fs.readFile(abs, 'utf8').catch(() => null);
      if (text === null) continue;
      const next = rules.reduce((t, [re, to]) => t.replace(re, to), text);
      if (next === text) continue;
      await fs.writeFile(abs, next);
      rewrote.push(doc);
    }
    await updateMeta(root, (meta) => ({ ...meta, layout: LAYOUT }));
    await touchProject(root).catch(() => {});
    return { moved: moves.map(([from, to]) => ({ from, to })), rewrote };
  });
}

async function moveFile(root, from, to) {
  await fs.mkdir(path.dirname(path.join(root, to)), { recursive: true });
  await fs.rename(path.join(root, from), path.join(root, to));
}

/** Removes dir and the empty folders in it when no file is left there. */
async function removeIfEmpty(root, dir) {
  const items = await listFilesRecursive(root, dir).catch(() => null);
  if (items && !items.some((i) => i.type === 'file')) await fs.rm(path.join(root, dir), { recursive: true, force: true });
}
