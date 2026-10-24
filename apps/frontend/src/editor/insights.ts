import { matchBrace, withoutComments } from '../../../backend/src/latex/text.js';
import { CITE_COMMANDS } from './latexContext';
import { HEADING, HEADING_LEVEL } from './latexEditor';

// Document insights: what a document's files hold (headings, floats, equations, labels, citations and the
// submission details), each with where it is. Numbers and pages come from the last compile's .aux, by label.

/** label: the \label that names it, for its number and page; level: a heading's (0 is \chapter) */
export type InsightRow = { file: string; line: number; text: string; label?: string; level?: number };
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
const CAPTION = /\\caption\s*(?:\[[^\]]*\]\s*)?\{/g;
const LABEL = /\\label\s*\{([^{}]+)\}/g;
const FIRST_LABEL = /\\label\s*\{([^{}]+)\}/;
const CITE = /\\([A-Za-z]*[cC]ite[A-Za-z]*)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}/g;
const ARG = (name: string) => new RegExp(String.raw`\\${name}\s*(?:\[[^\]]*\]\s*)?\{`, 'g');
// what an \author holds besides the name
const NOT_NAME = /\\(?:thanks|footnote|inst|orcid|email|affiliation|IEEEauthorblockA|textsuperscript)\s*(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}/g;

/**
 * LaTeX made readable for a list: commands dropped (their arguments kept), ties, control spaces (`\LaTeX\ Guide`) and
 * braces gone, paragraphs kept.
 */
export function plainText(tex: string) {
  return tex
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

/** The text of the group whose { is at `open`, or null when it stays open. */
const group = (code: string, open: number) => {
  const close = matchBrace(code, open);
  return close === -1 ? null : code.slice(open + 1, close);
};

export function scanInsights(files: { path: string; text: string }[]): Insights {
  const out: Insights = {
    headings: [],
    figures: [],
    tables: [],
    equations: [],
    labels: [],
    citations: [],
    metadata: { title: '', authors: [], keywords: [], date: '', abstract: '' }
  };
  const cited = new Map<string, Citation>();
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
      const label = m[0].includes('*') ? undefined : /^\s*\\label\s*\{([^{}]+)\}/.exec(code.slice(open + title.length + 2, open + title.length + 400))?.[1]?.trim();
      out.headings.push(row(m.index!, plainText(title) || '(untitled)', label, HEADING_LEVEL[m[1]]));
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

    // ponytail: one row per display, numbered by its first label; an align with several numbered lines is one row
    for (const m of code.matchAll(EQUATION)) {
      const body = envBody(m.index! + m[0].length, m[1]);
      const maths = body.replace(LABEL, '').replace(/\s+/g, ' ').trim();
      out.equations.push(row(m.index!, maths.length > 90 ? `${maths.slice(0, 89)}…` : maths, firstLabel(body)));
    }

    for (const m of code.matchAll(LABEL)) out.labels.push(row(m.index!, m[1].trim(), m[1].trim()));

    for (const m of code.matchAll(CITE)) {
      if (!CITE_COMMANDS.test(m[1])) continue;
      for (const key of m[2].split(',').map((k) => k.trim())) {
        if (!key || key === '*') continue;
        const known = cited.get(key);
        if (known) known.count += 1;
        else cited.set(key, { key, count: 1, file: path, line: lineOf(m.index!) });
      }
    }

    const args = (name: string) => [...code.matchAll(ARG(name))].map((m) => group(code, m.index! + m[0].length - 1) ?? '');
    meta.title ||= plainText(args('title')[0] ?? '');
    meta.date ||= plainText((args('date')[0] ?? '').replace(/\\today\b/g, 'Today'));
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
  out.citations = [...cited.values()];
  return out;
}

/** The submission details as plain text, the way a submission form asks for them. */
export function metadataText(meta: Metadata) {
  return [
    `Title: ${meta.title}`,
    `Authors: ${meta.authors.join('; ')}`,
    `Keywords: ${meta.keywords.join('; ')}`,
    `Date: ${meta.date}`,
    '',
    'Abstract',
    meta.abstract
  ].join('\n');
}
