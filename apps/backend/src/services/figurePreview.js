import path from 'path';
import { promises as fs, realpathSync } from 'fs';
import { ensureDir } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { withoutComments } from '../utils/texUtils.js';
import { compileFolder } from './compileService.js';
import { cachePath, getProjectRoot } from './projectService.js';
import { projectPaths } from './jyutpingService.js';

// Preview this figure: a piece of a LaTeX document (a tikzpicture, a table, a selection) compiled on its own with the
// document's preamble, as the preview package crops it. It's a copy: the document's main file is copied with the
// piece in place of its body, and compiled in a scratch build (compileFolder) that writes nothing into the project
// and keeps nothing, confined on a Mac however the project is trusted. TeX still reads the project's files, so the
// piece's images and \input files are found.

export const PREVIEW_MAX = 100_000;

/**
 * The document for the preview: tex's preamble, the preview package (active, cropped to the piece with a small
 * border), and the piece alone in its body; null when tex has no \documentclass or \begin{document}.
 */
export function previewDocument(tex, piece) {
  const code = withoutComments(tex);
  if (!/\\documentclass\b/.test(code)) return null;
  // where the body starts, in the source with its comments (a commented-out \begin{document} doesn't count)
  const lines = tex.split('\n');
  let at = -1;
  for (let i = 0, offset = 0; i < lines.length; offset += lines[i].length + 1, i += 1) {
    const m = /\\begin\s*\{document\}/.exec(withoutComments(lines[i]));
    if (m) {
      at = offset + lines[i].indexOf(m[0]);
      break;
    }
  }
  if (at === -1) return null;
  return [
    tex.slice(0, at),
    '\\PassOptionsToPackage{active,tightpage}{preview}\\usepackage{preview}\\setlength\\PreviewBorder{4pt}',
    '\\begin{document}',
    '\\begin{preview}',
    piece,
    '\\end{preview}',
    '\\end{document}',
    ''
  ].join('\n');
}

/**
 * The piece compiled with the preamble of `file` (a project-relative .tex), as { ok, pdf (base64), log } or
 * { ok: false, error, log }. Built from a copy of `file` in the project's cache, beside which TeX looks first.
 */
export async function previewFigure({ projectId, file, piece, engine = 'auto', texFolder, signal }) {
  const root = await getProjectRoot(projectId);
  const absMain = safeJoin(root, String(file || ''));
  if (!/\.(?:tex|ltx)$/i.test(absMain)) return { ok: false, error: 'A preview takes its preamble from a LaTeX file.' };
  const tex = await fs.readFile(absMain, 'utf8').catch(() => null);
  if (tex == null) return { ok: false, error: `“${file}” couldn’t be read.` };
  const doc = previewDocument(tex, piece);
  if (!doc) return { ok: false, error: `“${file}” has no \\documentclass and \\begin{document} to take a preamble from.` };
  const base = await cachePath(root, 'preview');
  await ensureDir(base);
  // without 8.3 names (RUNNER~1), whose ~ TeX would read as a space
  const copy = realpathSync.native(await fs.mkdtemp(path.join(base, 'copy-')));
  const main = path.join(copy, path.relative(root, absMain));
  try {
    await ensureDir(path.dirname(main));
    await fs.writeFile(main, doc);
    const result = await compileFolder({ root, mainFile: path.relative(root, absMain), engine, texFolder, signal, sourceCopy: { root: copy, main }, trusted: false });
    return { ...result, log: projectPaths(result.log ?? '', copy, root) };
  } finally {
    await fs.rm(copy, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}
