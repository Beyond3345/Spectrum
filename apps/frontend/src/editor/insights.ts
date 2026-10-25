import { matchBrace, withoutComments } from '../../../backend/src/latex/text.js';
import { CITE_COMMANDS } from './latexContext';
import { HEADING, HEADING_LEVEL } from './latexEditor';
import { INPUT_RE, includedFile, inputName } from './latexEnvs';
import { parseMarkdownOutline, parseTypstOutline } from './outlines';
import type { TexlabDiagnostic } from '../api/client';

// Document insights: what a document's files hold (headings, floats, equations, labels, citations and the
// submission details), each with where it is. Numbers and pages come from the last compile's .aux, by label.

/** label: the \label that names it, for its number and page; level: a heading's (0 is \chapter); starred: \section* */
export type InsightRow = { file: string; line: number; text: string; label?: string; level?: number; starred?: boolean };
export type Citation = { key: string; count: number; file: string; line: number };
export type Metadata = { title: string; authors: string[]; keywords: string[]; date: string; abstract: string };
export type Insights = {
  headings: InsightRow[];
  figures: InsightRow[];
  tables: InsightRow[];
  equations: InsightRow[];
  labels: InsightRow[];
  citations: Citation[];
  metadata: Metadata;
};

const FLOAT = /\\begin\s*\{(figure|table|wrapfigure|wraptable|sidewaysfigure|sidewaystable)\*?\}/g;
// the numbered displays (not their starred forms)
const EQUATION = /\\begin\s*\{(equation|align|gather|multline|flalign|alignat|eqnarray)\}/g;
// a display's lines: \\, \\* and \\[2pt], and the environments inside it, whose \\ don't end one
const LINE_END = /\\\\\*?(?:\[[^\]]*\])?/g;
const NESTED_ENV = /\\begin\s*\{([^}]*)\}[\s\S]*?\\end\s*\{\1\}/g;
const CAPTION = /\\caption\s*(?:\[[^\]]*\]\s*)?\{/g;
const LABEL = /\\label\s*\{([^{}]+)\}/g;
const FIRST_LABEL = /\\label\s*\{([^{}]+)\}/;
const CITE = /\\([A-Za-z]*[cC]ite[A-Za-z]*)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}/g;
const ARG = (name: string) => new RegExp(String.raw`\\${name}\s*(?:\[[^\]]*\]\s*)?\{`, 'g');
// what an \author holds besides the name
const NOT_NAME = /\\(?:thanks|footnote|inst|orcid|email|affiliation|IEEEauthorblockA|textsuperscript)\s*(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}/g;

// a brace group, two levels of nesting, its text the match's group
const BRACED = String.raw`\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}`;
const OPTIONS = String.raw`(?:\[[^\]]*\]\s*)?`;
const LOGOS: Record<string, string> = { LaTeXe: 'LaTeX2e', LaTeX: 'LaTeX', TeX: 'TeX', BibTeX: 'BibTeX', XeLaTeX: 'XeLaTeX', LuaLaTeX: 'LuaLaTeX', pdfLaTeX: 'pdfLaTeX' };
// a \ref's keys, kept in the text for withNumbers to put the last compile's numbers (n) or pages (p) in
const REF_MARK = /\u0001([np]):([^\u0001]*)\u0001/g;
const TYPESET: Record<string, string> = { '``': '“', "''": '”', '---': '—', '--': '–' };

/**
 * LaTeX made readable for a list: commands dropped (their arguments kept), ties, control spaces (`\LaTeX\ Guide`) and
 * braces gone, paragraphs kept. Links keep their text, a quantity its unit, \texorpdfstring its first form; URLs,
 * images, spacing and citations go, and a \ref waits for withNumbers.
 */
export function plainText(tex: string) {
  return tex
    .replace(new RegExp(String.raw`\\texorpdfstring\s*${BRACED}\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}`, 'g'), '$1')
    .replace(new RegExp(String.raw`\\href\s*${OPTIONS}\{[^{}]*\}\s*${BRACED}`, 'g'), '$1')
    .replace(new RegExp(String.raw`[ \t~]*\\(?:url|includegraphics|[hv]space\*?|[A-Za-z]*[cC]ite[A-Za-z]*\*?)\s*(?:\[[^\]]*\]\s*){0,2}\{[^{}]*\}`, 'g'), '')
    .replace(new RegExp(String.raw`\\(?:qty|SI)\s*${OPTIONS}\{([^{}]*)\}\s*\{([^{}]*)\}`, 'g'), (_, n: string, unit: string) => `${n} ${unitName(unit)}`.trim())
    .replace(new RegExp(String.raw`\\(?:unit|si)\s*${OPTIONS}\{([^{}]*)\}`, 'g'), (_, unit: string) => unitName(unit))
    .replace(/\\(page)?(?:ref|eqref|autoref|cref|Cref|vref)\*?\s*\{([^{}]*)\}/g, (_, page: string | undefined, keys: string) => `\u0001${page ? 'p' : 'n'}:${keys}\u0001`)
    .replace(/\\(LaTeXe|LaTeX|TeX|BibTeX|XeLaTeX|LuaLaTeX|pdfLaTeX)(?![A-Za-z])(?:\{\})?/g, (_, logo: string) => LOGOS[logo])
    .replace(/\\today(?![A-Za-z])/g, new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))
    // TeX's quotes and dashes as typeset, outside maths (where '' is a double prime) and a \ref's keys
    .replace(/((?<!\\)\$[^$]*(?<!\\)\$|\u0001[^\u0001]*\u0001)|``|''|---|--/g, (m, kept: string | undefined) => kept ?? TYPESET[m])
    .replace(/\\(?:label|index|footnote|thanks)\s*(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
    .replace(/\\\\(?:\[[^\]]*\])?/g, ' ')
    .replace(/\\([&%$#_{} ])/g, '$1')
    .replace(/~/g, ' ')
    .replace(/\\[A-Za-z@]+\*?\s*(?:\[[^\]]*\])?/g, '')
    .replace(/[{}]/g, '')
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** siunitx's unit as words: \kilo\hertz is kilohertz, \decibel\per\decade decibel per decade; a literal one as it is. */
const unitName = (unit: string) =>
  unit
    .replace(/\\([A-Za-z]+)\s*/g, (_, name: string) => (/^(?:kilo|mega|giga|tera|milli|micro|nano|pico|centi)$/.test(name) ? name : `${name} `))
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** plainText's text with each \ref's number (or \pageref's page) from the last compile, '?' for one it hasn't seen. */
export const withNumbers = (text: string, labels: Record<string, { number: string; page: string }>) =>
  text.replace(REF_MARK, (_, kind: string, keys: string) =>
    keys
      .split(',')
      .map((key) => labels[key.trim()]?.[kind === 'p' ? 'page' : 'number'] || '?')
      .join(', ')
  );

/** The text of the group whose { is at `open`, or null when it stays open. */
const group = (code: string, open: number) => {
  const close = matchBrace(code, open);
  return close === -1 ? null : code.slice(open + 1, close);
};

/**
 * Where each file is read in `doc`: the lines of the \input chain that reaches it ([] for the document, [3] for a file
 * \input at its line 3, [3, 2] for one \input at line 2 of that). Where a file is pulled in twice, the first place.
 */
function readingKeys(doc: string, files: { path: string; text: string }[]) {
  const texts = new Map(files.map((f) => [f.path, f.text]));
  const paths = new Set(texts.keys());
  const keys = new Map<string, number[]>();
  const visit = (path: string, key: number[]) => {
    if (keys.has(path) || !texts.has(path) || key.length > 20) return;
    keys.set(path, key);
    const code = withoutComments(texts.get(path)!);
    for (const m of code.matchAll(INPUT_RE)) {
      const child = includedFile(paths, doc, inputName(m), '.tex');
      if (child) visit(child, [...key, code.slice(0, m.index).split('\n').length]);
    }
  };
  visit(doc, []);
  return keys;
}

const inReadingOrder = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

/** Sorts each list of rows in place into the order `doc` reads them: a file's rows go where it's \input, a file not reached last. */
export function inReading(doc: string, files: { path: string; text: string }[], ...lists: { file: string; line: number }[][]) {
  const keys = readingKeys(doc, files);
  const at = (row: { file: string; line: number }) => [...(keys.get(row.file) ?? [Infinity]), row.line];
  for (const list of lists) list.sort((a, b) => inReadingOrder(at(a), at(b)));
}

/** What `files` hold; with `doc`, the document they're read in, each list in reading order. */
export function scanInsights(files: { path: string; text: string }[], doc?: string): Insights {
  if (doc && /\.typ$/i.test(doc)) return scanTypst(files, doc);
  if (doc && /\.(md|markdown)$/i.test(doc)) return scanMarkdown(files, doc);
  const out: Insights = {
    headings: [],
    figures: [],
    tables: [],
    equations: [],
    labels: [],
    citations: [],
    metadata: { title: '', authors: [], keywords: [], date: '', abstract: '' }
  };
  const meta = out.metadata;
  for (const { path, text } of files) {
    // comments go, line breaks stay, so a match's line is the same in the file
    const code = withoutComments(text);
    const breaks: number[] = [];
    for (let i = code.indexOf('\n'); i !== -1; i = code.indexOf('\n', i + 1)) breaks.push(i);
    const lineOf = (at: number) => {
      let lo = 0;
      let hi = breaks.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (breaks[mid] < at) lo = mid + 1;
        else hi = mid;
      }
      return lo + 1;
    };
    const row = (at: number, text: string, label?: string, level?: number): InsightRow => ({ file: path, line: lineOf(at), text, ...(label && { label }), ...(level !== undefined && { level }) });
    const firstLabel = (src: string) => FIRST_LABEL.exec(src)?.[1]?.trim();
    const envBody = (start: number, name: string) => {
      const end = new RegExp(String.raw`\\end\s*\{${name.replace('*', '\\*')}\}`, 'g');
      end.lastIndex = start;
      return code.slice(start, end.exec(code)?.index ?? code.length);
    };

    for (const m of code.matchAll(HEADING)) {
      const open = m.index! + m[0].length - 1;
      const title = group(code, open);
      if (title === null) continue;
      // \label{sec:x} right after the heading names it
      const starred = m[0].includes('*');
      const label = starred ? undefined : /^\s*\\label\s*\{([^{}]+)\}/.exec(code.slice(open + title.length + 2, open + title.length + 400))?.[1]?.trim();
      out.headings.push({ ...row(m.index!, plainText(title) || '(untitled)', label, HEADING_LEVEL[m[1]]), ...(starred && { starred }) });
    }

    for (const m of code.matchAll(FLOAT)) {
      const body = envBody(m.index!, m[0].slice(m[0].indexOf('{') + 1, -1));
      // ponytail: the last \caption is the float's own (subfigures' come first); a label before it is the fallback
      const captions = [...body.matchAll(CAPTION)];
      const caption = captions[captions.length - 1];
      const after = caption ? body.slice(caption.index!) : '';
      const label = firstLabel(after) ?? [...body.matchAll(LABEL)].pop()?.[1]?.trim();
      const text = caption ? plainText(group(body, caption.index! + caption[0].length - 1) ?? '') : '';
      (m[1].includes('table') ? out.tables : out.figures).push(row(m.index!, text, label));
    }

    // an equation or multline is one numbered row; an align, gather, flalign, alignat or eqnarray a row for each line
    // without \nonumber or \notag, a \\ inside a nested environment (cases, a matrix) not ending one.
    // ponytail: eqnarray's lines are read as amsmath's, so its unnumbered ones are approximate
    for (const m of code.matchAll(EQUATION)) {
      let start = m.index! + m[0].length;
      // alignat starts with the number of column pairs, not equation content.
      if (m[1] === 'alignat') start += /^\s*\{[^{}]*\}/.exec(code.slice(start))?.[0].length ?? 0;
      const body = envBody(start, m[1]);
      const push = (at: number, src: string) => {
        const maths = src.replace(LABEL, '').replace(/\s+/g, ' ').trim();
        out.equations.push(row(at, maths.length > 90 ? `${maths.slice(0, 89)}…` : maths, firstLabel(src)));
      };
      if (m[1] === 'equation' || m[1] === 'multline') {
        push(m.index!, body);
        continue;
      }
      const flat = body.replace(NESTED_ENV, (env) => ' '.repeat(env.length));
      const ends = [...flat.matchAll(LINE_END)].map((e) => [e.index!, e.index! + e[0].length]);
      let from = 0;
      for (const [end, next] of [...ends, [body.length, body.length]]) {
        const line = body.slice(from, end);
        // each at its own line in the file
        if (line.trim() && !/\\no(?:number|tag)(?![A-Za-z])/.test(line)) push(start + from + line.length - line.trimStart().length, line);
        from = next;
      }
    }

    for (const m of code.matchAll(LABEL)) out.labels.push(row(m.index!, m[1].trim(), m[1].trim()));

    for (const m of code.matchAll(CITE)) {
      if (!CITE_COMMANDS.test(m[1])) continue;
      for (const key of m[2].split(',').map((k) => k.trim())) {
        if (!key || key === '*') continue;
        out.citations.push({ key, count: 1, file: path, line: lineOf(m.index!) });
      }
    }

    const args = (name: string) => [...code.matchAll(ARG(name))].map((m) => group(code, m.index! + m[0].length - 1) ?? '');
    meta.title ||= plainText(args('title')[0] ?? '');
    meta.date ||= plainText(args('date')[0] ?? '');
    for (const author of args('author')) {
      // each name up to its first \\ (an affiliation follows)
      for (const part of author.replace(NOT_NAME, '').split(/\\(?:and|AND|And)\b/)) {
        const name = plainText(part.split('\\\\')[0]);
        if (name) meta.authors.push(name);
      }
    }
    if (!meta.keywords.length) {
      const env = /\\begin\s*\{(?:keywords?|IEEEkeywords)\}([\s\S]*?)\\end\s*\{(?:keywords?|IEEEkeywords)\}/.exec(code)?.[1];
      const list = env ?? args('keywords')[0] ?? '';
      meta.keywords = list
        .split(/\\sep\b|\\and\b|[,;·]/)
        .map(plainText)
        .filter(Boolean);
    }
    meta.abstract ||= plainText(/\\begin\s*\{abstract\}([\s\S]*?)\\end\s*\{abstract\}/.exec(code)?.[1] ?? args('abstract')[0] ?? '');
  }
  if (doc) inReading(doc, files, out.headings, out.figures, out.tables, out.equations, out.labels, out.citations);
  const cited = new Map<string, Citation>();
  for (const citation of out.citations) {
    const known = cited.get(citation.key);
    if (known) known.count += 1;
    else cited.set(citation.key, citation);
  }
  out.citations = [...cited.values()];
  return out;
}


// ─── Typst and Markdown ───

const emptyInsights = (): Insights => ({
  headings: [],
  figures: [],
  tables: [],
  equations: [],
  labels: [],
  citations: [],
  metadata: { title: '', authors: [], keywords: [], date: '', abstract: '' }
});

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const shortened = (text: string, max = 90) => (text.length > max ? text.slice(0, max - 1) + '…' : text);
/** Typst content as prose: calls, labels and markup go. */
const typstProse = (text: string) => collapse(text.replace(/#[A-Za-z][\w-]*(?:\([^)]*\))?/g, ' ').replace(/<[^>]*>/g, ' ').replace(/[*_`$]/g, ' '));
/** A Typst source with its comments and raw text blanked, line breaks and offsets kept. */
const typstCode = (text: string) =>
  text
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(`+)[\s\S]*?\1/g, (m) => m.replace(/[^\n]/g, ' '));
/** The closer of the balanced ( ) or [ ] at open, skipping strings, escapes and content blocks. */
function typstClose(text: string, open: number, openChar: string, closeChar: string): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === '"') {
      const end = text.indexOf('"', i + 1);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (text[i] === openChar) depth += 1;
    else if (text[i] === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    } else if (openChar === '(' && text[i] === '[') {
      const end = typstClose(text, i, '[', ']');
      if (end < 0) return -1;
      i = end;
    }
  }
  return -1;
}

const normalisePath = (from: string, target: string) => {
  const out: string[] = [];
  for (const part of [...from.split('/').slice(0, -1), ...target.split('/')]) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
};

/** The document and what its #include lines pull in, each once, in the order they are read. */
function typstChain(texts: Map<string, string>, doc: string) {
  const chain: string[] = [];
  const seen = new Set<string>();
  const visit = (path: string) => {
    if (seen.has(path) || !texts.has(path)) return;
    seen.add(path);
    chain.push(path);
    for (const m of texts.get(path)!.matchAll(/^\s*#include\s+"([^"]+)"/gm)) visit(normalisePath(path, m[1]));
  };
  visit(doc);
  return chain;
}

/** A Typst document's headings, figures, tables, equations, labels, citations and #set document metadata. */
function scanTypst(files: { path: string; text: string }[], doc: string): Insights {
  const out = emptyInsights();
  const texts = new Map(files.map((file) => [file.path, file.text]));
  const chain = typstChain(texts, doc);
  const labels = new Map<string, { file: string; line: number }>();
  for (const path of chain) {
    const source = texts.get(path) ?? '';
    const code = typstCode(source);
    for (const item of parseTypstOutline(source)) {
      const line = source.split('\n')[item.line - 1] ?? '';
      const label = /<\s*([A-Za-z0-9_:.-]+)\s*>\s*$/.exec(line)?.[1];
      out.headings.push({ file: path, line: item.line, text: item.title, level: item.level, ...(label && { label }) });
      if (label) labels.set(label, { file: path, line: item.line });
    }
    for (const m of code.matchAll(/#figure\s*\(/g)) {
      const open = m.index! + m[0].length - 1;
      const close = typstClose(code, open, '(', ')');
      if (close < 0) continue;
      const body = code.slice(open + 1, close);
      let text = '';
      const caption = /caption\s*:\s*\[/.exec(body);
      if (caption) {
        const at = caption.index! + caption[0].length - 1;
        const end = typstClose(body, at, '[', ']');
        if (end > at) text = typstProse(body.slice(at + 1, end));
      }
      const label = /^\s*<([^>]+)>/.exec(code.slice(close + 1))?.[1];
      const table = /#?table\s*\(/.test(body);
      (table ? out.tables : out.figures).push({ file: path, line: lineAt(code, m.index!), text: shortened(text) || (table ? '(table)' : '(figure)'), ...(label && { label }) });
    }
    for (const m of code.matchAll(/\$\s[^$]*?\s\$/g)) out.equations.push({ file: path, line: lineAt(code, m.index!), text: shortened(collapse(m[0].slice(1, -1))) });
    // a citation's <key> is a key, not a label
    const labelCode = code.replace(/#cite\s*\([^)]*\)/g, (m) => m.replace(/[^\n]/g, ' '));
    for (const m of labelCode.matchAll(/<([A-Za-z0-9_:.-]+)>/g)) if (!labels.has(m[1])) labels.set(m[1], { file: path, line: lineAt(code, m.index!) });
    const document = /#set\s+document\s*\(/.exec(code);
    if (document) {
      const open = document.index + document[0].length - 1;
      const close = typstClose(code, open, '(', ')');
      const args = code.slice(open + 1, close < 0 ? code.length : close);
      const one = (name: string) => new RegExp(name + '\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(args)?.[1]?.replace(/\\"/g, '"') ?? '';
      const list = (name: string) => {
        const hit = new RegExp(name + '\\s*:\\s*(?:"([^"]*)"|\\(([^)]*)\\))').exec(args);
        if (!hit) return [];
        return hit[1] ? [hit[1]] : [...hit[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
      };
      out.metadata.title ||= one('title');
      if (!out.metadata.authors.length) out.metadata.authors = list('author').flatMap((author) => author.split(/\s+and\s+|;\s*/)).filter(Boolean);
      if (!out.metadata.keywords.length) out.metadata.keywords = list('keywords').flatMap((word) => word.split(/[,;]/)).map((word) => word.trim()).filter(Boolean);
      out.metadata.date ||= one('date');
    }
  }
  for (const [label, place] of labels) out.labels.push({ file: place.file, line: place.line, text: label, label });
  const cited = new Map<string, Citation>();
  const cite = (key: string, file: string, line: number) => {
    const known = cited.get(key);
    if (known) known.count += 1;
    else cited.set(key, { key, count: 1, file, line });
  };
  for (const path of chain) {
    const code = typstCode(texts.get(path) ?? '');
    // both forms in the order they appear: #cite(<key>) and @key (unless that is a label's reference)
    for (const m of code.matchAll(/#cite\s*\(\s*<([^>]+)>|(?<![A-Za-z0-9])@([A-Za-z0-9_:.-]+)/g)) {
      const key = m[1] ?? m[2];
      if (m[2] && labels.has(m[2])) continue;
      cite(key, path, lineAt(code, m.index!));
    }
  }
  out.citations = [...cited.values()];
  return out;
}

const yamlValue = (value: string) => {
  const text = value.trim();
  return text.length > 1 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) ? text.slice(1, -1) : text;
};

/** A Markdown document's front matter, as submission metadata. */
function markdownMetadata(text: string): Metadata {
  const meta: Metadata = { title: '', authors: [], keywords: [], date: '', abstract: '' };
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return meta;
  const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
  if (end < 0) return meta;
  const fields: Record<string, string | string[]> = {};
  let key = '';
  for (const line of lines.slice(1, end)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && key) {
      if (!Array.isArray(fields[key])) fields[key] = fields[key] ? [fields[key] as string] : [];
      (fields[key] as string[]).push(yamlValue(item[1]));
      continue;
    }
    const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    key = pair[1];
    const value = pair[2].trim();
    fields[key] = !value ? [] : value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1).split(',').map(yamlValue) : yamlValue(value);
  }
  const one = (name: string) => (Array.isArray(fields[name]) ? (fields[name] as string[])[0] ?? '' : (fields[name] as string) ?? '');
  const many = (name: string) => (Array.isArray(fields[name]) ? (fields[name] as string[]) : fields[name] ? [fields[name] as string] : []);
  meta.title = one('title');
  meta.authors = many('author').flatMap((author) => author.split(/\s+and\s+|;\s*/)).filter(Boolean);
  meta.keywords = many('keywords').flatMap((word) => word.split(/[,;]/)).map((word) => word.trim()).filter(Boolean);
  meta.date = one('date');
  meta.abstract = one('abstract');
  return meta;
}

/** A Markdown document's headings, images, pipe tables, $$ equations, citations, labels and front matter. */
function scanMarkdown(files: { path: string; text: string }[], doc: string): Insights {
  const out = emptyInsights();
  const text = files.find((file) => file.path === doc)?.text ?? files[0]?.text ?? '';
  const lines = text.split('\n');
  out.metadata = markdownMetadata(text);
  for (const item of parseMarkdownOutline(text)) {
    const line = lines[item.line - 1] ?? '';
    const label = /\{#([A-Za-z0-9_:.-]+)/.exec(line)?.[1];
    out.headings.push({ file: doc, line: item.line, text: item.title, level: item.level, ...(label && { label }) });
    if (label) out.labels.push({ file: doc, line: item.line, text: label, label });
  }
  for (const m of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\{([^}]*)\})?/g)) {
    const label = /#([A-Za-z0-9_:.-]+)/.exec(m[3] ?? '')?.[1];
    out.figures.push({ file: doc, line: lineAt(text, m.index!), text: m[1].trim() || '(untitled)', ...(label && { label }) });
    if (label) out.labels.push({ file: doc, line: lineAt(text, m.index!), text: label, label });
  }
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) continue;
    const header = lines[i].split('|').map((cell) => cell.trim()).filter(Boolean).join(' · ');
    let j = i + 1;
    while (j + 1 < lines.length && /^\s*\|/.test(lines[j + 1])) j += 1;
    let captionAt = j + 1;
    while (captionAt < lines.length && !lines[captionAt].trim()) captionAt += 1;
    const caption = /^Table:\s*(.*?)(?:\s*\{#([A-Za-z0-9_:.-]+)\})?\s*$/.exec(lines[captionAt] ?? '');
    const label = caption?.[2];
    out.tables.push({ file: doc, line: i + 1, text: header, ...(label && { label }) });
    if (label) out.labels.push({ file: doc, line: captionAt + 1, text: label, label });
    i = j;
  }
  for (const m of text.matchAll(/\$\$([\s\S]*?)\$\$/g)) out.equations.push({ file: doc, line: lineAt(text, m.index!), text: shortened(collapse(m[1])) });
  const cited = new Map<string, Citation>();
  for (const m of text.matchAll(/\[[^\]]*@[^\]]*\]/g)) {
    for (const key of m[0].matchAll(/@([A-Za-z0-9_:.-]+)/g)) {
      const known = cited.get(key[1]);
      if (known) known.count += 1;
      else cited.set(key[1], { key: key[1], count: 1, file: doc, line: lineAt(text, m.index!) });
    }
  }
  out.citations = [...cited.values()];
  return out;
}

/**
 * What TexLab says of the labels and citations in files: labels never referred to or defined twice (by file:line, and
 * the names defined twice), the cited keys no .bib has, and how many references name no label.
 */
export function texlabNotes(found: Record<string, TexlabDiagnostic[]>, files: { path: string; text: string }[]) {
  const labels = new Map<string, 'Unused' | 'Duplicate'>();
  const twice = new Set<string>();
  const missing = new Set<string>();
  let unresolved = 0;
  for (const { path, text } of files) {
    const lines = text.split('\n');
    for (const d of found[path] ?? []) {
      const token = d.endLine === d.line ? (lines[d.line - 1]?.slice(d.col - 1, d.endCol - 1).trim() ?? '') : '';
      if (d.code === 'unused-label') labels.set(`${path}:${d.line}`, 'Unused');
      else if (d.code === 'duplicate-label') {
        labels.set(`${path}:${d.line}`, 'Duplicate');
        if (token) twice.add(token);
      } else if (d.code === 'undefined-label') unresolved += 1;
      else if (d.code === 'undefined-citation' && token) missing.add(token);
    }
  }
  return { labels, twice, missing, unresolved };
}

const TOC_LEVELS = ['chapter', 'section', 'subsection', 'subsubsection'];

/**
 * Each heading's number and page from the last compile's contents entries, for the headings without a \label: the
 * numbered entries in order against the unstarred headings at their levels, and only when the levels agree (beamer's
 * or an older compile's .aux leaves them as they are).
 */
export function headingNumbers(headings: InsightRow[], toc: { level: string; number: string; page: string }[]) {
  const numbered = toc.filter((entry) => entry.number && TOC_LEVELS.includes(entry.level));
  const levels = new Set(numbered.map((entry) => entry.level));
  const rows = headings.filter((row) => !row.starred && levels.has(TOC_LEVELS[row.level ?? -1]));
  const agree = rows.length === numbered.length && rows.every((row, i) => TOC_LEVELS[row.level!] === numbered[i].level);
  return new Map(agree ? rows.map((row, i) => [row, numbered[i]]) : []);
}

/** The submission details as plain text, the way a submission form asks for them, with the last compile's numbers. */
export function metadataText(meta: Metadata, labels: Record<string, { number: string; page: string }> = {}) {
  return withNumbers(
    [`Title: ${meta.title}`, `Authors: ${meta.authors.join('; ')}`, `Keywords: ${meta.keywords.join('; ')}`, `Date: ${meta.date}`, '', 'Abstract', meta.abstract].join('\n'),
    labels
  );
}
