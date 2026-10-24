import path from 'path';
import { promises as fs } from 'fs';
import { safeJoin } from './pathUtils.js';

import { escapeTexText, matchBrace, withoutComments } from '../latex/text.js';
import { latexToText } from '../latex/conversion.js';
export { withoutComments };

// Top-level declarations only: skip comments, definitions' brace groups and literal examples.
function* declarations(tex) {
  const visible = tex.replace(/\\.|%[^\r\n]*/g, (token) => token[0] === '%' ? ' '.repeat(token.length) : token);
  const tokens = /\\begin\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{\1\}|\\verb\*?([^\w\s])[\s\S]*?\2|\\(addbibresource|bibliography|bibliographystyle|printbibliography|title|author|date|hypersetup)\b(?:\s*\[[^\]]*\])?\s*|\\.|%[^\r\n]*|\{/g;
  let token;
  while ((token = tokens.exec(tex))) {
    if (token[0] === '{') {
      const end = matchBrace(visible, token.index);
      if (end >= 0) tokens.lastIndex = end + 1;
      continue;
    }
    const command = token[3];
    if (!command) continue;
    const start = tokens.lastIndex;
    const end = tex[start] === '{' ? matchBrace(visible, start) : -1;
    if (end < 0 && command !== 'printbibliography') continue;
    if (end >= 0) tokens.lastIndex = end + 1;
    yield { command, value: end >= 0 ? tex.slice(start + 1, end) : '', start: token.index, end: tokens.lastIndex };
  }
}

export function bibliographyFiles(tex) {
  return [...new Set([...declarations(tex)].flatMap(({command, value}) => {
    if (!['addbibresource', 'bibliography'].includes(command)) return [];
    return (command === 'bibliography' ? value.split(',') : [value]).map((name) => name.trim()).filter(Boolean)
      .map((name) => /\.bib$/i.test(name) ? name : `${name}.bib`);
  }))];
}

/** Reconnect copied source bibliographies when moving a document into a biblatex template. */
export function withBiblatexResources(tex, files) {
  const begin = tex.indexOf('\\begin{document}');
  const preamble = withoutComments(tex.slice(0, begin));
  if (!files.length || begin < 0 || !/\\addbibresource\b|\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{biblatex\}/.test(preamble)) return tex;
  const commands = [...declarations(tex)];
  let printed = commands.some((node) => node.command === 'printbibliography' && node.start >= begin);
  const edits = commands.flatMap((node) => {
    if (node.command === 'addbibresource' || node.command === 'bibliographystyle') return [{...node, text: ''}];
    if (node.command !== 'bibliography') return [];
    const text = node.start >= begin && !printed ? '\\printbibliography' : '';
    if (text) printed = true;
    return [{...node, text}];
  });
  let result = edits.reduceRight((out, node) => out.slice(0, node.start) + node.text + out.slice(node.end), tex);
  const resources = [...new Set(files)].map((file) => `\\addbibresource{${file}}`).join('\n');
  result = result.replace('\\begin{document}', `${resources}\n\n\\begin{document}`);
  if (!printed) {
    const end = result.lastIndexOf('\\end{document}');
    if (end >= 0) result = `${result.slice(0, end)}\n\\printbibliography\n${result.slice(end)}`;
  }
  return result;
}

/** Keep the source's names in the preamble and PDF properties, even if a model returns placeholders. */
export function preserveDocumentMetadata(tex, source) {
  const fields = new Map([...declarations(source || '')].filter((node) => ['title', 'author', 'date'].includes(node.command))
    .map((node) => [node.command, node.value]));
  if (!fields.size || !tex.includes('\\begin{document}')) return tex;
  const nodes = [...declarations(tex)];
  const readable = (value) => latexToText(withoutComments(value)).normalize('NFC').replace(/\s+/g, ' ').trim();
  for (const [name, value] of fields) {
    const text = readable(value);
    // shortcut: unexpanded custom metadata macros stay with the model; add class-specific extraction when needed.
    if (value.trim() && !text && value.trim() !== '\\today') { fields.delete(name); continue; }
    const adapted = nodes.find((node) => node.command === name && (node.value === value || text && readable(node.value) === text));
    if (adapted) fields.set(name, adapted.value);
  }
  if (!fields.size) return tex;
  const pdf = new Map(['title', 'author'].filter((name) => fields.has(name))
    .map((name) => [`pdf${name}`, escapeTexText(latexToText(withoutComments(fields.get(name))))]));
  const pdfOptions = [...pdf].map(([key, value]) => `${key}={${value}}`);
  const edits = nodes.flatMap((node) => {
    if (fields.has(node.command)) return [{...node, text: ''}];
    if (node.command !== 'hypersetup' || !pdf.size) return [];
    const parts = [];
    let from = 0;
    const options = node.value;
    const visible = options.replace(/\\.|%[^\r\n]*/g, (token) => token[0] === '%' ? ' '.repeat(token.length) : token);
    for (let i = 0; i < visible.length; i++) {
      if (visible[i] === '\\') i++;
      else if (visible[i] === '{') { const end = matchBrace(visible, i); if (end >= 0) i = end; }
      else if (visible[i] === ',') { parts.push(options.slice(from, i)); from = i + 1; }
    }
    parts.push(options.slice(from));
    const retained = parts.filter((part) => !pdf.has(withoutComments(part).match(/^\s*([\w]+)\s*=/)?.[1])).filter((part) => part.trim());
    return [{...node, text: `\\hypersetup{${[...retained, ...pdfOptions].join(',')}}`}];
  });
  const result = edits.reduceRight((out, node) => out.slice(0, node.start) + node.text + out.slice(node.end), tex);
  const commands = [...fields].map(([command, value]) => `\\${command}{${value}}`);
  if (pdf.size && !nodes.some((node) => node.command === 'hypersetup')) {
    commands.push(`\\ifdefined\\hypersetup\\hypersetup{${pdfOptions.join(',')}}\\fi`);
  }
  return result.replace('\\begin{document}', `${commands.join('\n')}\n\n\\begin{document}`);
}

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
 * The main file with its \input/\include/\subfile/\import/\subimport files inlined. Like the compile's
 * TEXINPUTS, a name is looked up from the main file's folder first, then the project root.
 */
export async function inlineInputs(root, mainFile, { stripComments = false, files } = {}) {
  const mainDir = path.dirname(mainFile);
  // files: a Set the caller passes gets the files read, project-relative
  const seen = files || new Set();
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
    // \input {x} too, and the import package's \import{folder}{file} and \subimport, whose folder is the file's own
    for (const match of tex.matchAll(/\\(?:input|include|subfile)\s*\{([^}]+)\}|\\(sub)?import\*?\s*\{([^}]*)\}\s*\{([^}]+)\}/g)) {
      const target = match[1]?.trim() ?? path.posix.join(match[3].trim(), match[4].trim());
      const name = path.extname(target) ? target : `${target}.tex`;
      const child =
        (match[2] ? await visit(path.join(path.dirname(rel), name), depth + 1) : null) ??
        (await visit(path.join(mainDir, name), depth + 1)) ??
        (await visit(path.normalize(name), depth + 1));
      parts.push(tex.slice(last, match.index), child ?? '');
      last = match.index + match[0].length;
    }
    parts.push(tex.slice(last));
    return parts.join('\n');
  };
  return (await visit(path.normalize(mainFile), 0)) ?? '';
}
