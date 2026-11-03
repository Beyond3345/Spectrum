// The regions of a converted document that Spectrum's rules could not place well, marked for the optional AI tidying
// of docs/featureResearch/LATEX_TYPST_CONVERSION.md section 9: a title page beyond the title page rule, a CV header,
// an unknown environment, a paragraph with an unknown command and an approximated table. Each goes between two comment
// lines, // spectrum:region r3 start kind=titlepage and // spectrum:region r3 end (% in LaTeX), and its original source
// goes into the conversion record. Pure.
import { commandArgs, environments, lineAt, maskComments } from './latexRead.js';
import { expressionEnd } from './typstRead.js';

export const REGION_LINES = 60;
export const KIND_NAMES = { titlepage: 'title page', 'cv-header': 'CV header', 'unknown-environment': 'unknown environment', 'unknown-command': 'paragraph with an unknown command', 'table-layout': 'table' };
// a marker anywhere in a line; one that starts its line is a region's
export const MARKER = /[ \t]*(?:\/\/|%) spectrum:region (r\d+) (?:start kind=([a-z-]+)|end)[ \t]*/;

const markerLine = (format, id, kind) => (format === 'typst' ? '//' : '%') + ' spectrum:region ' + id + (kind ? ' start kind=' + kind : ' end');

/** A new region in ctx.regions: its id, numbered again in file order by finishRegions. */
function newRegion(ctx, kind, st, line, original) {
  ctx.regions ??= [];
  const id = 'r' + (ctx.regions.length + 1);
  ctx.regions.push({ id, kind, src: st.file, line, original });
  return id;
}

// ─── Held constructs, as the writers render them ───

// what the title page rule of toTypst.js writes itself; any other command in a title page is beyond it
const TITLE_RULE_LATEX = /^(?:vspace|vfill|par|centering|tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge|bfseries|itshape|scshape|today|newline|null|noindent|thispagestyle|textbf|textit|emph)$/;
// and of toLatex.js, in a Typst title block
const TITLE_RULE_TYPST = /^(?:align|v|text|title|linebreak|emph|strong)$/;
const TABLES = ['table', 'table*', 'tabular', 'tabularx', 'xltabular', 'threeparttable'];
const TABULARS = { tabular: 'om', 'tabular*': 'mom', tabularx: 'mm', xltabular: 'omm' };

/**
 * A LaTeX table the rules approximated: vertical or old-style rules, colour, a cell over several rows (centred in
 * LaTeX, at the top in Typst), trimmed partial rules, or more than one tabular under a caption.
 */
function approximatedLatex(original) {
  const tabulars = environments(original, Object.keys(TABULARS));
  if (tabulars.length > 1 || /\\(?:hline|cline|vline|rowcolor|cellcolor|columncolor|arrayrulecolor|multirow)(?![A-Za-z])|\\cmidrule\s*\(/.test(original)) return true;
  return tabulars.some((t) => (commandArgs(t.body, 0, TABULARS[t.name])?.args.at(-1) ?? '').includes('|'));
}

/**
 * The k-th of a file's held records of one kind is the k-th such environment in its source, comments blanked: the
 * pre-pass holds them in document order. { original, line }, or null.
 */
function latexOriginal(record, st, names) {
  const k = st.blocks.filter((b) => b.kind === record.kind).indexOf(record);
  const env = environments(maskComments(st.source), names)[k];
  return env ? { original: st.source.slice(env.start, env.end), line: lineAt(st.source, env.start) } : null;
}

/** The Typst call that starts on the record's line, one of names, with its label: { original, line }, or null. */
function typstOriginal(record, st, names) {
  if (!record.line) return null;
  const lineStart = st.source.split('\n').slice(0, record.line - 1).reduce((n, l) => n + l.length + 1, 0);
  const lineText = st.source.slice(lineStart, st.source.indexOf('\n', lineStart) === -1 ? undefined : st.source.indexOf('\n', lineStart));
  const m = new RegExp('#(?:' + names.join('|') + ')\\(').exec(lineText);
  if (!m) return null;
  const end = expressionEnd(st.source, lineStart + m.index);
  const label = /^\s*<[A-Za-z0-9_:.-]+>/.exec(st.source.slice(end, end + 200))?.[0] ?? '';
  return { original: st.source.slice(lineStart + m.index, end + label.length), line: record.line };
}

/** The kind of region a held record makes, with its original, or null when the rules wrote it exactly. */
function flagged(record, st, format) {
  if (format === 'typst') {
    // LaTeX to Typst
    if (record.kind === 'titlepage') {
      const found = latexOriginal(record, st, ['titlepage']);
      const body = found && maskComments(found.original).replace(/\\(?:begin|end)\s*\{(?:titlepage|center)\}/g, '');
      return body && [...body.matchAll(/\\([A-Za-z]+)/g)].some((m) => !TITLE_RULE_LATEX.test(m[1])) ? { kind: 'titlepage', ...found } : null;
    }
    if (record.kind === 'table') {
      const found = latexOriginal(record, st, TABLES);
      return found && approximatedLatex(maskComments(found.original)) ? { kind: 'table-layout', ...found } : null;
    }
    return null;
  }
  // Typst to LaTeX
  if (record.kind === 'sides') {
    const found = typstOriginal(record, st, ['grid']);
    return found && { kind: 'cv-header', ...found };
  }
  if (record.kind === 'grid') {
    // two cells, the second on the right: a CV header in columns other than (1fr, auto), which became a tabular
    const found = typstOriginal(record, st, ['grid']);
    return found && record.cells.length === 2 && /,\s*align\(\s*right/.test(found.original) ? { kind: 'cv-header', ...found } : null;
  }
  if (record.kind === 'titlepage') {
    // the rule centres it: one aligned otherwise, or centred down the page too, comes out only centred across
    const found = typstOriginal(record, st, ['align']);
    const beyond = found && (!/^#align\(\s*center\s*\)/.test(found.original) || [...found.original.matchAll(/#([A-Za-z][\w.-]*)/g)].some((m) => !TITLE_RULE_TYPST.test(m[1])));
    return beyond ? { kind: 'titlepage', ...found } : null;
  }
  if (record.kind === 'table') {
    // grid lines, colour, or columns in proportion (2fr, 1fr) or of a length, which become X or l columns
    const found = typstOriginal(record, st, ['figure', 'table']);
    const widths = /columns:\s*\(([^)]*)\)/.exec(found?.original ?? '')?.[1].split(',').map((w) => w.trim()).filter(Boolean) ?? [];
    const sized = widths.some((w) => w !== 'auto' && w !== '1fr');
    return found && (record.model.lines === 'grid' || sized || /table\.vline|\bfill\s*:/.test(found.original)) ? { kind: 'table-layout', ...found } : null;
  }
  return null;
}

/** A held record's text, between region markers when the rules only approximated it. format: what text is. */
export function region(record, text, st, ctx, format) {
  const found = record && flagged(record, st, format);
  if (!found) return text;
  const id = newRegion(ctx, found.kind, st, found.line, found.original);
  return markerLine(format, id, found.kind) + '\n' + text + '\n' + markerLine(format, id);
}

// ─── Unknown LaTeX, as pandoc's input ───

/** The paragraphs of text: { start, end } of each run of lines between blank lines, without the space around it. */
function paragraphs(text) {
  const out = [];
  let last = 0;
  for (const m of [...text.matchAll(/\n[ \t]*\n/g), { index: text.length, 0: '' }]) {
    const part = text.slice(last, m.index);
    const lead = part.length - part.trimStart().length;
    if (part.trim()) out.push({ start: last + lead, end: last + part.trimEnd().length });
    last = m.index + m[0].length;
  }
  return out;
}

/** Each pair of minipages side by side, with only \hfill (or the pre-pass's token for it) or space between them: { start, end }. */
function minipagePairs(text) {
  const pages = environments(maskComments(text), ['minipage']);
  const out = [];
  for (let i = 0; i + 1 < pages.length; i += 1) {
    if (/^\s*(?:\\hfill|\\quad|~|SPXI\d+X)?\s*$/.test(maskComments(text).slice(pages[i].end, pages[i + 1].start))) {
      out.push({ start: pages[i].start, end: pages[i + 1].end });
      i += 1;
    }
  }
  return out;
}

/**
 * pandoc's input for one LaTeX file with each unknown environment, each paragraph with an unknown command and each
 * pair of minipages side by side (a CV header) between region markers, held as blocks as the pre-pass holds its own.
 * Only the body is marked, not the pieces after it, whose text goes inside other constructs. detected: pandoc's
 * unknown commands, { name or begin{name}: [raw texts] }.
 */
export function markLatexInput(input, detected, st, ctx) {
  const from = input.indexOf('\\begin{document}') + '\\begin{document}'.length;
  const pieces = input.indexOf('\\begin{spxpiece');
  const to = pieces === -1 ? input.lastIndexOf('\\end{document}') : pieces;
  if (from < '\\begin{document}'.length || to < from) return input;
  const body = input.slice(from, to);
  // the source's body, comments blanked, where the k-th of each is the original of the k-th in pandoc's input
  const begin = st.source.indexOf('\\begin{document}');
  const offset = begin === -1 ? 0 : begin;
  const source = maskComments(st.source.slice(offset));
  const floats = environments(source, ['figure', 'figure*', 'table', 'table*', 'titlepage']);
  const free = (span) => !floats.some((f) => span.start >= f.start && span.start < f.end);
  const spans = [];
  const pair = (here, there, kind, todo) => here.forEach((span, k) => there[k] && spans.push({ ...span, kind, todo, at: there[k] }));
  for (const name of detected.keys()) {
    if (name.startsWith('begin{')) {
      const env = name.slice(6, -1);
      pair(environments(body, [env]), environments(source, [env]), 'unknown-environment', 'The environment ' + env + ' is not one Spectrum knows; its text was kept as plain paragraphs.');
    } else {
      const uses = new RegExp('\\\\' + name.replace(/[@]/g, '\\$&') + '(?![A-Za-z@])');
      // a paragraph whose environments open and close inside it, holding no construct of the pre-pass
      const plain = (p, text) => {
        const t = text.slice(p.start, p.end);
        return uses.test(t) && !/SPXB\d+X/.test(t) && (t.match(/\\begin\s*\{/g)?.length ?? 0) === (t.match(/\\end\s*\{/g)?.length ?? 0);
      };
      pair(paragraphs(body).filter((p) => plain(p, body)), paragraphs(source).filter((p) => plain(p, source)), 'unknown-command', '\\' + name + ' is not a command Spectrum knows; check this paragraph.');
    }
  }
  // the document's own environments, which pandoc expands but often not as they look, and multicols, whose columns go
  const own = [...String(ctx.facts.macros ?? '').matchAll(/\\(?:re)?newenvironment\s*\{([^}]+)\}/g)].map((m) => m[1].trim());
  for (const env of new Set([...own, 'multicols', 'multicols*'])) {
    if (detected.has('begin{' + env + '}')) continue;
    pair(environments(body, [env]), environments(source, [env]), 'unknown-environment', 'The environment ' + env + (own.includes(env) ? ' is defined by this document; check how its text came out.' : ' has no Typst equivalent here; its text was kept in one column.'));
  }
  pair(minipagePairs(body), minipagePairs(source).filter(free), 'cv-header', null);
  // the first of any that overlap, each at most REGION_LINES long in the source
  const kept = [];
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    const original = st.source.slice(offset + span.at.start, offset + span.at.end);
    if (kept.some((k) => span.start < k.end) || original.split('\n').length > REGION_LINES) continue;
    kept.push({ ...span, original });
  }
  let out = '';
  let last = 0;
  for (const span of kept) {
    const id = newRegion(ctx, span.kind, st, lineAt(st.source, offset + span.at.start), span.original);
    const start = markerLine('typst', id, span.kind) + (span.todo ? '\n// TODO(spectrum): ' + span.todo : '');
    out += body.slice(last, span.start) + st.block({ kind: 'raw', typst: start }) + body.slice(span.start, span.end) + st.block({ kind: 'raw', typst: markerLine('typst', id) });
    last = span.end;
  }
  return input.slice(0, from) + out + body.slice(last) + input.slice(to);
}

// ─── Typst pandoc writes without its look, as pandoc's input ───

/**
 * pandoc's input for one Typst file with each paragraph that calls one of the document's own functions with a look
 * pandoc cannot write (a box, a fill, a stroke, a size), and each centred block that starts with a large line of text
 * (a CV header), between region markers held as blocks. A paragraph that is only the call is an unknown environment,
 * one with text around it an unknown command. Only the body is marked, not the pieces after it.
 */
export function markTypstInput(input, st, ctx) {
  const pieces = input.indexOf('\n\nSPXPIECESTART');
  const body = input.slice(0, pieces === -1 ? input.length : pieces);
  const functions = ctx.facts.definitions
    .map((d) => /^#let\s+([A-Za-z_][\w-]*)\s*\([^)]*\)\s*=\s*([\s\S]*)$/.exec(d))
    .filter((m) => m && (/\b(?:fill|stroke|inset|radius|size|weight)\s*:/.test(m[2]) || /(?:^|[^\w#.-])(?!h\()[a-z][\w.-]*\(/.test(m[2])))
    .map((m) => m[1]);
  const calls = functions.length ? new RegExp('#(' + functions.map((f) => f.replace(/[-]/g, '\\-')).join('|') + ')(?![\\w-])[([]') : null;
  const header = /^#align\(\s*center\s*\)\[\s*#text\(\s*size:/;
  const prose = (p, text) => {
    const t = text.slice(p.start, p.end);
    return !/^#(?:let|set|show|import)\s/.test(t) && !/```|^SPXB\d+X$/.test(t) && !/title\(\)/.test(t);
  };
  const spans = [];
  const sourceParagraphs = paragraphs(st.source).filter((p) => prose(p, st.source));
  const pair = (test, kindOf) => {
    const there = sourceParagraphs.filter((p) => test(st.source.slice(p.start, p.end)));
    paragraphs(body).filter((p) => prose(p, body) && test(body.slice(p.start, p.end))).forEach((p, k) => there[k] && spans.push({ ...p, at: there[k], ...kindOf(st.source.slice(there[k].start, there[k].end)) }));
  };
  if (calls) {
    pair((t) => calls.test(t), (t) => {
      const name = calls.exec(t)[1];
      const alone = new RegExp('^#' + name + '(?:\\([^\\n]*?\\))?(?:\\[[\\s\\S]*\\])+$').test(t.trim());
      return { kind: alone ? 'unknown-environment' : 'unknown-command', todo: '#' + name + ' is a function of this document; its text was kept without its look.' };
    });
  }
  pair((t) => header.test(t), () => ({ kind: 'cv-header', todo: null }));
  let out = '';
  let last = 0;
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    const original = st.source.slice(span.at.start, span.at.end);
    if (span.start < last || original.split('\n').length > REGION_LINES) continue;
    const id = newRegion(ctx, span.kind, st, lineAt(st.source, span.at.start), original);
    const start = markerLine('latex', id, span.kind) + (span.todo ? '\n% TODO(spectrum): ' + span.todo : '');
    out += body.slice(last, span.start) + st.block({ kind: 'raw', latex: start }) + body.slice(span.start, span.end) + st.block({ kind: 'raw', latex: markerLine('latex', id) });
    last = span.end;
  }
  return out + body.slice(last) + input.slice(body.length);
}

// ─── The regions as written ───

/**
 * The regions as the converted files hold them, numbered r1, r2, … in file order: one that starts and ends a line of
 * its own, inside no other and at most REGION_LINES long on both sides. Any other region's markers are taken out.
 * files: [{ src, out, [key]: text }], the text replaced. Returns [{ id, kind, file, from, original }] for the conversion record.
 */
export function finishRegions(files, key, ctx) {
  const drafts = new Map((ctx.regions ?? []).map((r) => [r.src + '\n' + r.id, r]));
  const regions = [];
  for (const file of files) {
    const lines = file[key].split('\n');
    const drop = new Set();
    const rename = new Map();
    let open = null;
    lines.forEach((line, i) => {
      const m = MARKER.exec(line);
      if (!m) return;
      const own = new RegExp('^' + MARKER.source + '$').test(line) && drafts.has(file.src + '\n' + m[1]);
      if (m[2]) {
        if (open) drop.add(i);
        else if (own) open = { id: m[1], i };
        else drop.add(i);
        return;
      }
      if (!open || open.id !== m[1] || !own) {
        drop.add(i);
        return;
      }
      const draft = drafts.get(file.src + '\n' + m[1]);
      if (i - open.i - 1 <= REGION_LINES && i - open.i > 1 && draft.original.split('\n').length <= REGION_LINES) {
        const id = 'r' + (regions.length + 1);
        rename.set(open.i, id).set(i, id);
        regions.push({ id, kind: draft.kind, file: file.out, from: draft.src + (draft.line ? ':' + draft.line : ''), original: draft.original });
      } else drop.add(open.i).add(i);
      open = null;
    });
    if (open) drop.add(open.i);
    file[key] = lines
      .map((line, i) => (rename.has(i) ? line.replace(/spectrum:region r\d+/, 'spectrum:region ' + rename.get(i)) : drop.has(i) ? line.replace(MARKER, '') : line))
      .filter((line, i) => !(drop.has(i) && !line.trim()))
      .join('\n');
  }
  return regions;
}

/** A region as conversion/notes.md lists it. */
export function regionNote(r) {
  const at = r.from.lastIndexOf(':');
  return { file: at === -1 ? r.from : r.from.slice(0, at), line: at === -1 ? null : Number(r.from.slice(at + 1)), text: 'A ' + KIND_NAMES[r.kind] + ' the rules only approximated, marked ' + r.id + ' in ' + r.file + ' for tidying by hand or with the AI model.' };
}
