import path from 'path';
import { promises as fs } from 'fs';
import { safeJoin } from './pathUtils.js';

import { withoutComments } from '../latex/text.js';
export { withoutComments };

/** Section names for template transfer; the editor also tracks positions and uses its own parser. */
export const parseSectionOutline = (content) => [...content.matchAll(/\\(section|subsection|subsubsection)\*?\{([^}]*)\}/g)]
  .map((match) => ({ level: match[1], title: match[2].trim() }));

/** Whether a .tex file compiles on its own: a \documentclass outside a comment in its first 16 KB. */
export async function isDocumentFile(file) {
  // ponytail: 16 KB covers any preamble's start; read more if a document ever hides it further down
  let handle;
  try {
    handle = await fs.open(file);
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(16384), 0, 16384, 0);
    return /\\documentclass\b/.test(withoutComments(buffer.toString('utf8', 0, bytesRead)));
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

export function extractDocumentBody(tex) {
  const startMarker = '\\begin{document}';
  const endMarker = '\\end{document}';
  const start = tex.indexOf(startMarker);
  const end = tex.lastIndexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) return '';
  const bodyStart = start + startMarker.length;
  return tex.slice(bodyStart, end).trim();
}

export function mergeTemplateBody(template, body) {
  const startMarker = '\\begin{document}';
  const endMarker = '\\end{document}';
  const start = template.indexOf(startMarker);
  const end = template.lastIndexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) return template;
  const before = template.slice(0, start + startMarker.length);
  const after = template.slice(end);
  const nextBody = body ? `\n${body}\n` : '\n';
  return `${before}${nextBody}${after}`;
}

/**
 * The main file with its \input/\include/\subfile files inlined. Like the compile's
 * TEXINPUTS, a name is looked up from the main file's folder first, then the project root.
 */
export async function inlineInputs(root, mainFile, { stripComments = false } = {}) {
  const mainDir = path.dirname(mainFile);
  const seen = new Set();
  // null when the file can't be read, so the next place to look gets its turn
  const visit = async (rel, depth) => {
    if (depth > 10 || seen.has(rel)) return '';
    let tex;
    try {
      tex = await fs.readFile(safeJoin(root, rel), 'utf8');
    } catch {
      return null;
    }
    seen.add(rel);
    if (stripComments) tex = withoutComments(tex);
    const parts = [];
    let last = 0;
    for (const match of tex.matchAll(/\\(?:input|include|subfile)\{([^}]+)\}/g)) {
      const target = match[1].trim();
      const name = path.extname(target) ? target : `${target}.tex`;
      const child = (await visit(path.join(mainDir, name), depth + 1)) ?? (await visit(path.normalize(name), depth + 1));
      parts.push(tex.slice(last, match.index), child ?? '');
      last = match.index + match[0].length;
    }
    parts.push(tex.slice(last));
    return parts.join('\n');
  };
  return (await visit(path.normalize(mainFile), 0)) ?? '';
}
