import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { auxStore, findExecutable, texPath } from './compileService.js';
import { cachePath } from './projectService.js';
import { listFilesRecursive } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { inlineInputs } from '../utils/texUtils.js';
import { matchBrace } from '../latex/text.js';

const execFileAsync = promisify(execFile);

const TEXCOUNT_FIELDS = {
  wordsInText: 'Words in text',
  wordsInHeaders: 'Words in headers',
  wordsOutsideText: 'Words outside text (captions, etc.)',
  headers: 'Number of headers',
  floats: 'Number of floats/tables/figures',
  mathInline: 'Number of math inlines',
  mathDisplay: 'Number of math displayed'
};

export function parseTexcount(output) {
  const stats = { ok: true, source: 'texcount' };
  for (const [key, label] of Object.entries(TEXCOUNT_FIELDS)) {
    const line = output.split('\n').find((l) => l.startsWith(`${label}:`));
    stats[key] = line ? Number(line.slice(label.length + 1).trim()) || 0 : 0;
  }
  stats.words = stats.wordsInText + stats.wordsInHeaders + stats.wordsOutsideText;
  return stats;
}

// ─── Estimate for machines without texcount ───

const ARG = String.raw`\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}`; // a brace group, two levels of nesting
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const countWords = (text) => (text.match(WORD) || []).length;

export function estimateStats(tex) {
  let body = tex;
  const start = body.indexOf('\\begin{document}');
  if (start !== -1) body = body.slice(start + '\\begin{document}'.length);
  const end = body.lastIndexOf('\\end{document}');
  if (end !== -1) body = body.slice(0, end);

  let mathDisplay = 0;
  const displayPatterns = [
    /\$\$[\s\S]*?\$\$/g,
    /\\\[[\s\S]*?\\\]/g,
    /\\begin\{(equation|align|gather|multline|eqnarray|displaymath)(\*?)\}[\s\S]*?\\end\{\1\2\}/g
  ];
  for (const re of displayPatterns) {
    body = body.replace(re, () => {
      mathDisplay += 1;
      return ' ';
    });
  }
  let mathInline = 0;
  body = body.replace(/\$[^$]+?\$|\\\([\s\S]*?\\\)/g, () => {
    mathInline += 1;
    return ' ';
  });

  const floats = (body.match(/\\begin\{(figure|table)\*?\}/g) || []).length;

  const prose = (text) => text
    .replace(/\\(label|ref|eqref|autoref|cref|Cref|pageref|cite\w*|includegraphics|usepackage|input|include|bibliography\w*|addbibresource|url|begin|end|vspace|hspace|setlength|newcommand|renewcommand)\*?(\[[^\]]*\])*(\{[^{}]*\})*/g, ' ')
    .replace(/\\[a-zA-Z@]+\*?|\\./g, ' ');

  let wordsOutsideText = 0;
  body = body.replace(new RegExp(String.raw`\\caption\*?(?:\[[^\]]*\])?${ARG}`, 'g'), (_, caption) => {
    wordsOutsideText += countWords(prose(caption));
    return ' ';
  });

  let headers = 0;
  let wordsInHeaders = 0;
  body = body.replace(new RegExp(String.raw`\\(?:part|chapter|(?:sub)*section|(?:sub)?paragraph)\*?(?:\[[^\]]*\])?${ARG}`, 'g'), (_, title) => {
    headers += 1;
    wordsInHeaders += countWords(prose(title));
    return ' ';
  });

  const wordsInText = countWords(prose(body));
  return {
    ok: true,
    source: 'estimate',
    words: wordsInText + wordsInHeaders + wordsOutsideText,
    wordsInText,
    wordsInHeaders,
    wordsOutsideText,
    headers,
    floats,
    mathInline,
    mathDisplay
  };
}

/** texFolder: Settings › Engines › LaTeX's TeX folder, where texcount is looked for first. */
export async function projectStats(root, mainFile, texFolder) {
  try {
    await fs.access(safeJoin(root, mainFile));
  } catch (err) {
    if (err.statusCode) throw err;
    throw Object.assign(new Error(`The main file “${mainFile}” doesn’t exist.`), { statusCode: 404 });
  }
  const texcount = await findExecutable('texcount', await texPath(texFolder));
  if (texcount) {
    try {
      // -dir: included files are relative to the main file's folder, as in the compile
      const { stdout } = await execFileAsync(texcount, ['-inc', '-total', '-utf8', '-dir', `./${mainFile}`], { cwd: root, timeout: 20_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true });
      return parseTexcount(stdout);
    } catch {
      // fall back to the estimate
    }
  }
  return estimateStats(await inlineInputs(root, mainFile, { stripComments: true }));
}

// ─── Numbers and pages from the last compile ───

// a label's number or page as text: \textup {(a)} gives (a)
const plain = (tex) => tex.replace(/\\[a-zA-Z@]+\s*|[{}]/g, '').trim();

/** The labels an .aux defines, \newlabel{key}{{number}{page}…}: { key: { number, page } }. cleveref's copies are left out. */
export function parseLabels(aux) {
  const labels = {};
  for (const match of aux.matchAll(/\\newlabel(?=\{)/g)) {
    const keyStart = match.index + match[0].length;
    const keyEnd = matchBrace(aux, keyStart);
    // the value's group, then its first two: the number and the page
    const value = keyEnd + 1;
    const numberEnd = aux[value] === '{' && aux[value + 1] === '{' ? matchBrace(aux, value + 1) : -1;
    const pageEnd = numberEnd > 0 && aux[numberEnd + 1] === '{' ? matchBrace(aux, numberEnd + 1) : -1;
    if (keyEnd < 0 || pageEnd < 0) continue;
    const key = aux.slice(keyStart + 1, keyEnd);
    if (key.endsWith('@cref')) continue;
    labels[key] = { number: plain(aux.slice(value + 2, numberEnd)), page: plain(aux.slice(numberEnd + 2, pageEnd)) };
  }
  return labels;
}

/**
 * The document's labels from its last good compile's .aux files, an \include'd chapter's too: { labels, auxAt,
 * stale }. auxAt: when that compile wrote them (ms), or null; stale: it has never compiled, or a .tex or .bib in the
 * project changed since. ponytail: any .tex or .bib counts, not only the document's own inputs
 */
export async function documentLabels(root, doc) {
  const store = auxStore(await cachePath(root), doc);
  const labels = {};
  for (const { path: rel, type } of await listFilesRecursive(store).catch(() => [])) {
    if (type === 'file' && rel.endsWith('.aux')) Object.assign(labels, parseLabels(await fs.readFile(path.join(store, rel), 'utf8').catch(() => '')));
  }
  const aux = await fs.stat(path.join(store, `${path.basename(doc, path.extname(doc))}.aux`)).catch(() => null);
  const auxAt = aux ? Math.round(aux.mtimeMs) : null;
  let stale = auxAt === null;
  for (const { path: rel, type } of stale ? [] : await listFilesRecursive(root)) {
    if (type !== 'file' || !/\.(tex|bib)$/i.test(rel)) continue;
    const stat = await fs.stat(path.join(root, rel)).catch(() => null);
    if (stat && stat.mtimeMs > aux.mtimeMs) {
      stale = true;
      break;
    }
  }
  return { labels, auxAt, stale };
}
