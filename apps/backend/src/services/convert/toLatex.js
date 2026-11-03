// Typst to LaTeX for documents written to docs/TYPST_STYLE.md, on pandoc's Typst reader, as section 5.2 of
// docs/featureResearch/LATEX_TYPST_CONVERSION.md designs it. A pre-pass reads the preamble's rules as facts and holds
// every house construct (headings, equations, figures, tables, listings, pseudocode, theorems, the title block, units,
// references and citations) as a token, pandoc writes the prose and each held piece as LaTeX in one run, and the house
// writers of LATEX_STYLE.md put the constructs back. Pure: the caller runs pandoc and Typst (convertService.js).
import { figureLatex, figureSetLatex, tableEdges, tableLatex } from '../../latex/floats.js';
import { arg, callAt, contentOf, expressionEnd, groupEnd, markupSpans, statementEnd, stringOf } from './typstRead.js';
import { typedNumber, typedUnit } from './units.js';
import { region } from './regions.js';

const TYPST_LANGUAGES = { python: 'Python', py: 'Python', c: 'C', cpp: 'C++', 'c++': 'C++', java: 'Java', matlab: 'Matlab', bash: 'bash', sh: 'bash', sql: 'SQL', javascript: 'JavaScript', js: 'JavaScript', html: 'HTML', latex: 'TeX', tex: 'TeX', r: 'R', rust: 'Rust', go: 'Go', ruby: 'Ruby', haskell: 'Haskell', fortran: 'Fortran', csharp: '[Sharp]C', xml: 'XML', typst: '' };
const COL = 40;
/** A preamble line with its comment in column 41, or one space after a line too long for that. */
const commented = (code, comment) => (code.length < COL ? code.padEnd(COL) : code + ' ') + '% ' + comment;
const LATEX_SPECIAL = /[\\{}$&%#_^~]/g;
const texText = (text) => String(text).replace(LATEX_SPECIAL, (ch) => ({ '\\': '\\textbackslash{}', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' })[ch] ?? '\\' + ch);
const LABEL = /^\s*<([A-Za-z0-9_:.-]+)>/;

// ─── The facts of the preamble ───

/** An empty fact sheet, filled by the preamble's rules and definitions. */
export function typstFacts() {
  return { title: null, author: null, paper: 'a4', margin: null, numbering: '1', size: 11, lang: 'en', region: 'AU', headingNumbers: true, report: false, bySection: false, bibTitle: null, theorems: new Map(), house: new Set(), definitions: [], packages: [] };
}

/** A Typst length as TeX writes it: 25mm, 1.5cm, 12pt; 1fr as \fill. */
const texLength = (value) => {
  const v = String(value ?? '').trim();
  if (/^\d*\.?\d+(?:mm|cm|pt|in|em)$/.test(v)) return v;
  if (/^\d*\.?\d+fr$/.test(v)) return '\\fill';
  const share = /^(\d*\.?\d+)%$/.exec(v);
  return share ? +(Number(share[1]) / 100).toFixed(2) + '\\linewidth' : null;
};

/** One #set, #show, #let or #import at the top of a file, read into the facts; true when it's done with. */
function readStatement(kind, text, facts, st) {
  const call = callAt(text, text.indexOf(kind) + kind.length + 1);
  if (kind === 'set' && call) {
    const a = call.args;
    if (call.name === 'document') {
      if (arg(a, 'title') !== null) facts.title = contentOf(arg(a, 'title')) ?? stringOf(arg(a, 'title'));
      if (arg(a, 'author') !== null) facts.author = stringOf(arg(a, 'author')) ?? arg(a, 'author').replace(/[()"]/g, '').trim();
    } else if (call.name === 'page') {
      if (arg(a, 'paper')) facts.paper = stringOf(arg(a, 'paper')) ?? facts.paper;
      if (arg(a, 'margin')) facts.margin = arg(a, 'margin');
      if (arg(a, 'numbering') !== null) facts.numbering = stringOf(arg(a, 'numbering'));
    } else if (call.name === 'text') {
      const size = /^(\d+(?:\.\d+)?)pt$/.exec(arg(a, 'size') ?? '');
      if (size) facts.size = Number(size[1]);
      if (arg(a, 'lang')) facts.lang = stringOf(arg(a, 'lang'));
      if (arg(a, 'region') !== null) facts.region = stringOf(arg(a, 'region')) ?? '';
    } else if (call.name === 'heading' && arg(a, 'numbering') !== null) facts.headingNumbers = stringOf(arg(a, 'numbering')) !== null;
    else if (call.name === 'math.equation' || call.name === 'figure') facts.bySection ||= /by-section/.test(arg(a, 'numbering') ?? '');
    else if (call.name === 'bibliography') facts.bibTitle = contentOf(arg(a, 'title'));
    return true;
  }
  if (kind === 'show') {
    if (/supplement:\s*\[Chapter\]/.test(text)) facts.report = true;
    return true;
  }
  if (kind === 'import') {
    const from = stringOf(/^#import\s+("[^"]*")/.exec(text)?.[1] ?? '');
    // a package pandoc can't read, kept for the pictures, which Typst compiles with it
    if (from?.startsWith('@')) facts.packages.push({ from, text });
    else if (from) facts.imports = [...(facts.imports ?? []), from];
    return true;
  }
  if (kind === 'let') {
    const name = /^#let\s+([A-Za-z_][\w-]*)/.exec(text)?.[1];
    const like = /^#let\s+([A-Za-z_][\w-]*)\s*=\s*theorem-like\(\s*\[([^\]]*)\]\s*(?:,\s*([^)]*))?\)/.exec(text);
    if (like) {
      facts.theorems.set(like[1], { display: like[2], style: /head-style:\s*emph/.test(like[3] ?? '') ? 'remark' : /body-style:\s*emph/.test(like[3] ?? '') ? 'plain' : 'definition' });
      return true;
    }
    if (['subfigure', 'theorem-number', 'theorem-like', 'proof', 'solution', 'by-section', 'accent'].includes(name)) {
      facts.house.add(name);
      return true;
    }
    // the document's own definitions stay for pandoc, which evaluates them
    facts.definitions.push(text);
    return true;
  }
  return false;
}

// ─── The pre-pass ───

function newState(file, source) {
  const st = { file, source, blocks: [], inlines: [], pieces: [], held: [] };
  st.block = (record) => {
    st.blocks.push(record);
    return '\n\nSPXB' + (st.blocks.length - 1) + 'X\n\n';
  };
  // a token pandoc reads as a word in markup, and as a string in maths
  st.inline = (latex) => {
    st.inlines.push(latex);
    return 'SPXI' + (st.inlines.length - 1) + 'X';
  };
  st.hold = (text) => {
    st.held.push(text);
    return 'SPXH' + (st.held.length - 1) + 'X';
  };
  st.restore = (text) => text.replace(/SPXH(\d+)X/g, (_, n) => st.restore(st.held[n]));
  // a construct that stays in its paragraph, as an equation does in LaTeX
  st.inlineBlock = (record) => {
    st.blocks.push(record);
    return 'SPXB' + (st.blocks.length - 1) + 'X';
  };
  st.piece = (markup, block = false) => {
    st.pieces.push({ markup: String(markup ?? '').trim(), block });
    return st.pieces.length - 1;
  };
  return st;
}

/** The line of a construct in its file, found by its first characters. */
const lineOf = (st, snippet) => {
  const at = st.source.indexOf(String(snippet).trim().slice(0, 60));
  return at === -1 ? null : st.source.slice(0, at).split('\n').length;
};

/**
 * One Typst file made ready for pandoc: { input, state }. The preamble's rules and definitions go into facts (the main
 * file's, which a chapter's own add to); every house construct is held as a block or a token.
 */
export function prepareTypst(source, ctx, { file }) {
  const st = newState(file, source);
  // raw text first, which nothing else may read into
  let body = source.replace(/```[\s\S]*?```|`[^`\n]*`/g, (raw) => st.hold(raw));
  body = statements(body, st, ctx);
  // the title, which \maketitle and \hypersetup print
  if (ctx.facts.title !== null && st.file === ctx.main) st.titlePiece = st.piece(ctx.facts.title);
  body = blockPass(body, st, ctx);
  body = inlinePass(body, st, ctx);
  for (const p of st.pieces) p.markup = inlinePass(p.block ? blockPass(p.markup, st, ctx) : p.markup, st, ctx);
  const pieces = st.pieces.map((p, n) => '\n\nSPXPIECESTART' + n + '\n\n' + p.markup + '\n\nSPXPIECEEND' + n + '\n').join('');
  const definitions = ctx.facts.definitions.map((d) => inlinePass(d, st, ctx));
  const input = definitions.join('\n') + '\n\n' + body + '\n' + pieces;
  return { input: st.restore(input), state: st };
}

/**
 * The file's top-level statements (#set, #show, #let, #import) read as facts and taken out, and its comments: one on
 * lines of its own outside any brackets comes over as a % comment, any other goes. The rules in the body that change
 * the layout from there on (page numbering, the appendix) become blocks.
 */
function statements(text, st, ctx) {
  let out = '';
  let body = false;
  for (let i = 0; i < text.length; ) {
    const lineEnd = text.indexOf('\n', i) === -1 ? text.length : text.indexOf('\n', i);
    const line = text.slice(i, lineEnd);
    const statement = /^\s*#(set|show|let|import)\s/.exec(line);
    if (statement) {
      const start = i + line.indexOf('#');
      const end = statementEnd(text, start);
      const whole = text.slice(start, end);
      if (body && statement[1] === 'set' && /^#set\s+page\(/.test(whole)) {
        const numbering = stringOf(arg(callAt(whole, 5)?.args ?? [], 'numbering') ?? '');
        out += st.block({ kind: 'numbering', style: numbering });
      } else if (body && statement[1] === 'set' && /^#set\s+heading\(\s*numbering:\s*"A/.test(whole)) {
        out += st.block({ kind: 'appendix' });
      } else if (!(body && statement[1] === 'show')) {
        readStatement(statement[1], whole, ctx.facts, st);
      }
      i = end + 1;
      continue;
    }
    // a comment on lines of its own
    const comment = /^\s*\/\/\s?(.*)$/.exec(line);
    if (comment) {
      const prev = out.endsWith('\n\n') || !out.trim();
      const next = !text.slice(lineEnd + 1, text.indexOf('\n', lineEnd + 1) === -1 ? undefined : text.indexOf('\n', lineEnd + 1)).trim();
      if (comment[1].trim() && (prev || next) && body) out += st.block({ kind: 'raw', latex: '% ' + comment[1].trim() });
      i = lineEnd + 1;
      continue;
    }
    if (line.trim()) body = true;
    // any other line, without its comments (a URL's // is not one)
    out += line.replace(/(^|[^:\\])\/\/.*$/, '$1').replace(/\/\*.*?\*\//g, '') + '\n';
    i = lineEnd + 1;
  }
  return out;
}

/** The label right after position end, as in ) <fig:x>: { label, end }. */
function labelAfter(text, end) {
  const m = LABEL.exec(text.slice(end, end + 200));
  return m ? { label: m[1], end: end + m[0].length } : { label: null, end };
}

/**
 * The house constructs in markup, each held as a block with its pieces: headings, display equations, figures, tables,
 * theorems, pseudocode, the title block and page-level calls.
 */
function blockPass(text, st, ctx) {
  let out = '';
  let last = 0;
  const lineStart = (k) => k === 0 || text[k - 1] === '\n';
  for (let k = 0; k < text.length; k += 1) {
    const ch = text[k];
    if (ch === '\\') {
      k += 1;
      continue;
    }
    // a heading line: = Title <sec:x>
    if (ch === '=' && lineStart(k) && /^=+ /.test(text.slice(k, k + 12))) {
      const end = text.indexOf('\n', k) === -1 ? text.length : text.indexOf('\n', k);
      const m = /^(=+) ([\s\S]*?)(?:\s*<([A-Za-z0-9_:.-]+)>)?\s*$/.exec(text.slice(k, end));
      out += text.slice(last, k) + st.block({ kind: 'heading', level: m[1].length, numbered: ctx.facts.headingNumbers, title: st.piece(m[2]), label: m[3] ?? null });
      last = end;
      k = end - 1;
      continue;
    }
    // display maths: $ ... $ with a space inside each dollar
    if (ch === '$') {
      const close = mathClose(text, k);
      const inner = text.slice(k + 1, close - 1);
      if (/^\s/.test(inner) && /\s$/.test(inner)) {
        const { label, end } = labelAfter(text, close);
        out += text.slice(last, k) + st.inlineBlock({ kind: 'equation', numbered: true, maths: st.piece('$' + inner + '$'), aligned: /&|\\\s/.test(inner), label });
        last = end;
        k = end - 1;
        continue;
      }
      k = close - 1;
      continue;
    }
    if (ch !== '#') continue;
    // #include "chapters/x.typ", the one call without brackets
    const include = /^#include\s+("[^"\n]+")/.exec(text.slice(k, k + 300));
    if (include) {
      out += text.slice(last, k) + st.block({ kind: 'include', path: ctx.include(st, stringOf(include[1])) });
      last = k + include[0].length;
      k = last - 1;
      continue;
    }
    const call = callAt(text, k);
    const end = expressionEnd(text, k);
    const record = call && construct(call, text, k, st, ctx);
    if (record) {
      const { label, end: after } = labelAfter(text, end);
      const held = { ...record, label: record.label ?? label, line: lineOf(st, text.slice(k, k + 40)) };
      out += text.slice(last, k) + (record.kind === 'equation' ? st.inlineBlock(held) : st.block(held));
      last = after;
      k = after - 1;
      continue;
    }
    k = end - 1;
  }
  return out + text.slice(last);
}

/** The end (just past) of the maths opening at i. */
function mathClose(text, i) {
  for (let k = i + 1; k < text.length; k += 1) {
    if (text[k] === '\\') k += 1;
    else if (text[k] === '"') {
      for (k += 1; k < text.length && text[k] !== '"'; k += 1) if (text[k] === '\\') k += 1;
    } else if (text[k] === '#') k = expressionEnd(text, k) - 1;
    else if (text[k] === '$') return k + 1;
  }
  return text.length;
}

// the document's title, printed by #title() or inside a #text(…) that styles it
const TITLE = /(?:^|[^\w.-])title\(\)/;

/** A line of a title page: { space } for a #v(…), else the title or a text piece, with the size and weight #text gives. */
function titleItem(line, st) {
  const space = /^#v\(\s*([^)]*?)\s*\)$/.exec(line);
  if (space) return { space: space[1] };
  const call = /^#text\(/.test(line) ? callAt(line, 0) : null;
  const a = call?.args ?? [];
  const value = a.find((x) => x.name === null)?.value;
  const title = TITLE.test(line);
  return { title, size: arg(a, 'size'), bold: /bold/.test(arg(a, 'weight') ?? ''), italic: /italic/.test(arg(a, 'style') ?? ''), text: title ? null : st.piece(call ? call.bodies[0] ?? contentOf(value) ?? value ?? '' : line) };
}

/** The LaTeX size command nearest a Typst text size (12pt, 1.2em) in a document of base pt; '' at the base size. */
function latexSize(size, base) {
  const m = /^(\d*\.?\d+)(pt|em)$/.exec(String(size ?? '').trim());
  if (!m) return '';
  const pt = Number(m[1]) * (m[2] === 'em' ? base : 1);
  const sizes = [['\\footnotesize', 8], ['\\small', 9.5], ['', base], ['\\large', 12], ['\\Large', 14.4], ['\\LARGE', 17.28], ['\\huge', 20.74], ['\\Huge', 24.88]];
  return sizes.reduce((best, s) => (Math.abs(s[1] - pt) < Math.abs(best[1] - pt) ? s : best))[0];
}

/** A call that is a house construct, as its record; null for anything pandoc writes itself. */
function construct(call, text, at, st, ctx) {
  const a = call.args;
  switch (call.name) {
    case 'figure':
      return figureRecord(call, st, ctx);
    case 'grid':
      return gridRecord(call, st, ctx);
    case 'table':
      return tableRecord(call, null, st, ctx);
    case 'math.equation': {
      const maths = a.find((x) => x.name === null && x.value.startsWith('$'))?.value;
      if (!maths || arg(a, 'block') !== 'true') return null;
      return { kind: 'equation', numbered: arg(a, 'numbering') !== 'none', maths: st.piece(maths), aligned: /&|\\\s/.test(maths) };
    }
    case 'heading': {
      const level = Number(arg(a, 'level') ?? 1);
      return { kind: 'heading', level, numbered: arg(a, 'numbering') !== 'none', title: st.piece(call.bodies[0] ?? contentOf(a.find((x) => x.name === null)?.value) ?? '') };
    }
    case 'align': {
      const body = call.bodies[0] ?? contentOf(arg(a, null, 1)) ?? '';
      if (!TITLE.test(body)) return null;
      const lines = body.split(/\\\s*\n|\n/).map((l) => l.trim()).filter(Boolean);
      // a title page fills a page of its own: centred down it, or with space pushing its foot down
      if (/horizon/.test(arg(a, null, 0) ?? '') || lines.some((l) => /^#v\(\s*1fr\s*\)$/.test(l))) return { kind: 'titlepage', items: lines.map((l) => titleItem(l, st)) };
      // the title block: the title, then the author and date lines
      return { kind: 'maketitle', lines: lines.filter((l) => !TITLE.test(l) && !/^#v\(/.test(l)).map((l) => st.piece(l)) };
    }
    case 'outline': {
      const target = arg(a, 'target') ?? '';
      return { kind: /kind:\s*image/.test(target) ? 'listoffigures' : /kind:\s*table/.test(target) ? 'listoftables' : 'tableofcontents' };
    }
    case 'bibliography':
      ctx.bibliography = stringOf(a.find((x) => x.name === null)?.value) ?? 'refs.bib';
      return { kind: 'bibliography' };
    case 'pagebreak':
      return { kind: 'raw', latex: '\\clearpage' };
    case 'counter':
      // the counts an appendix or new page numbering starts again, which LaTeX's own commands do
      return /^\.update\(/.test(text.slice(call.end, call.end + 9)) ? { kind: 'raw', latex: '' } : null;
    case 'proof':
    case 'solution':
      return { kind: 'theorem', name: call.name, title: arg(a, 'name') ? st.piece(contentOf(arg(a, 'name'))) : null, body: st.piece(call.bodies[0] ?? '', true) };
    default:
      if (ctx.facts.theorems.has(call.name)) {
        ctx.used.add('theorem:' + call.name);
        return { kind: 'theorem', name: call.name, title: arg(a, 'title') ? st.piece(contentOf(arg(a, 'title'))) : null, body: st.piece(call.bodies[0] ?? contentOf(arg(a, null, 0)) ?? '', true) };
      }
      return null;
  }
}

/** A Typst image call's path and its size as the table tool's FigureSize. */
function imageOf(value) {
  const scaled = /^scale\(\s*(\d+(?:\.\d+)?)%\s*,\s*reflow:\s*true\s*,\s*([\s\S]*)\)$/.exec(value.trim());
  const call = callAt(scaled ? scaled[2] : value, 0);
  if (!call || call.name !== 'image') return null;
  const path = stringOf(arg(call.args, null, 0));
  if (!path) return null;
  const width = arg(call.args, 'width');
  const height = arg(call.args, 'height');
  const mm = (v) => {
    const m = /^(\d*\.?\d+)(mm|cm|in|pt)$/.exec(v ?? '');
    return m ? Number(m[1]) * { mm: 1, cm: 10, in: 25.4, pt: 0.3528 }[m[2]] : null;
  };
  const base = { fraction: 1, width: 0, height: 0, scale: 1 };
  const size = scaled ? { ...base, mode: 'scale', scale: Number(scaled[1]) / 100 }
    : /%$/.test(width ?? '') ? { ...base, mode: 'line', fraction: Number(width.slice(0, -1)) / 100 }
      : mm(width) !== null && mm(height) !== null ? { ...base, mode: 'box', width: mm(width), height: mm(height) }
        : mm(width) !== null ? { ...base, mode: 'width', width: mm(width) }
          : mm(height) !== null ? { ...base, mode: 'height', height: mm(height) }
            : null;
  return { path: path.replace(/^\/+/, ''), size };
}

/** A figure: an image, a table, a listing, pseudocode, sub-figures, a composer diagram, or a drawing in Typst. */
function figureRecord(call, st, ctx) {
  const a = call.args;
  const caption = arg(a, 'caption') !== null ? st.piece(contentOf(arg(a, 'caption')) ?? '') : null;
  const placement = { auto: 'tbp', top: 't', bottom: 'b' }[arg(a, 'placement')] ?? 'ht';
  const body = a.find((x) => x.name === null)?.value ?? '';
  const kind = stringOf(arg(a, 'kind') ?? '') ?? arg(a, 'kind');
  if (kind === 'algorithm') return algorithmRecord(body, caption, placement, st, ctx);
  const raw = /^SPXH(\d+)X$/.exec(body.trim());
  if (raw) {
    const m = /^```(\w*)\n?([\s\S]*?)\n?\s*```$/.exec(st.held[raw[1]].trim());
    const code = m ? dedent(m[2]) : '';
    ctx.used.add('code');
    return { kind: 'listing', language: TYPST_LANGUAGES[(m?.[1] ?? '').toLowerCase()] ?? m?.[1] ?? '', code, caption };
  }
  const image = imageOf(body);
  if (image) {
    ctx.images.add(image.path);
    return { kind: 'figure', layout: 'image', path: image.path, size: image.size, caption, placement };
  }
  const tableCall = /^table\(/.test(body.trim()) ? callAt(body.trim(), 0) : null;
  if (tableCall) return tableRecord(tableCall, { caption, placement }, st, ctx);
  // notes under a table, in the figure's content: [ #table(...) #text(size: 0.9em)[#super[a] ...] ]
  const content = contentOf(body);
  if (content !== null && /#table\(/.test(content)) {
    const at = content.indexOf('#table(');
    const inner = callAt(content, at);
    const notes = [...content.slice(inner.end).matchAll(/#text\([^)]*\)\[([\s\S]*?)\]\s*(?=#text|$)/g)].map((m) => {
      const mark = /^\s*#super\[([^\]]*)\]\s*/.exec(m[1]);
      return { mark: mark?.[1] ?? '', text: st.piece(mark ? m[1].slice(mark[0].length) : m[1]) };
    });
    return tableRecord(inner, { caption, placement, notes }, st, ctx);
  }
  const grid = /^grid\(/.test(body.trim()) ? callAt(body.trim(), 0) : null;
  if (grid && /#subfigure\(/.test(body)) {
    ctx.used.add('subfigure');
    const panels = [...body.matchAll(/#subfigure\(/g)].map((m) => {
      const sub = callAt(body, m.index);
      const img = imageOf(arg(sub.args, null, 0) ?? '');
      const after = LABEL.exec(body.slice(sub.end));
      if (img) ctx.images.add(img.path);
      return { path: img?.path ?? '', caption: arg(sub.args, 'caption') !== null ? st.piece(contentOf(arg(sub.args, 'caption'))) : null, label: after?.[1] ?? '' };
    });
    const columns = arg(grid.args, 'columns') ?? String(panels.length);
    const count = /^\d+$/.test(columns) ? Number(columns) : columns.split(',').length;
    const align = arg(grid.args, 'align') ?? 'bottom';
    return { kind: 'figure', layout: 'sub', panels, columns: count, align: align === 'top' ? 'top' : align === 'horizon' ? 'centre' : 'bottom', caption, placement };
  }
  // anything else is drawn in Typst: a composer diagram or shapes, compiled to a picture
  const include = /^include\s+("[^"]+")$/.exec(body.trim());
  ctx.pictures.push(include ? { include: stringOf(include[1]).replace(/^\/+/, ''), file: st.file } : { body, file: st.file });
  return { kind: 'figure', layout: 'picture', picture: ctx.pictures.length - 1, caption, placement };
}

const dedent = (code) => {
  const lines = code.replace(/^\n/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n').replace(/\s+$/, '');
};

/** A grid of separate figures, a CV-style line of text with something on the right, or a plain grid as a tabular. */
function gridRecord(call, st, ctx) {
  const a = call.args;
  const cells = a.filter((x) => x.name === null).map((x) => x.value);
  if (cells.length && cells.every((c) => /^\[\s*#figure\(/.test(c))) {
    const panels = cells.map((c) => {
      const inner = contentOf(c);
      const fig = callAt(inner, inner.indexOf('#figure('));
      const img = imageOf(arg(fig.args, null, 0) ?? '');
      if (img) ctx.images.add(img.path);
      return { path: img?.path ?? '', caption: arg(fig.args, 'caption') !== null ? st.piece(contentOf(arg(fig.args, 'caption'))) : null, label: LABEL.exec(inner.slice(fig.end))?.[1] ?? '' };
    });
    return { kind: 'figure', layout: 'separate', panels, columns: panels.length, caption: null, placement: 'ht', keepsLabel: false };
  }
  const columns = arg(a, 'columns') ?? '1';
  const cellText = (c) => contentOf(c) ?? (/^align\(/.test(c) ? contentOf(callAt(c, 0)?.bodies[0] !== undefined ? '[' + callAt(c, 0).bodies[0] + ']' : arg(callAt(c, 0)?.args ?? [], null, 1)) : null) ?? '#' + c;
  if (/^\(\s*1fr\s*,\s*auto\s*\)$/.test(columns) && cells.length === 2) {
    // what on the left and what on the right, each line of the two side by side
    const left = cellText(cells[0]).split(/\\\s*\n/).map((l) => l.trim());
    const right = cellText(cells[1]).split(/\\\s*\n/).map((l) => l.trim());
    return { kind: 'sides', lines: Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [left[i] ? st.piece(left[i]) : null, right[i] ? st.piece(right[i]) : null]) };
  }
  const n = /^\d+$/.test(columns) ? Number(columns) : columns.split(',').length;
  return { kind: 'grid', columns: n, cells: cells.map((c) => st.piece(cellText(c))) };
}

/**
 * A Typst table into the table tool's model: its cells pieces, its rules from table.hline (at y: or between rows),
 * table.header's rows as the header, table.cell's spans as merges, and right-aligned numbers as S columns.
 */
function tableRecord(call, float, st, ctx) {
  const a = call.args;
  const columns = arg(a, 'columns') ?? '1';
  const widths = /^\d+$/.test(columns) ? Array(Number(columns)).fill('auto') : columns.replace(/^\(|\)$/g, '').split(',').map((w) => w.trim()).filter(Boolean);
  const cols = widths.length;
  const alignArg = arg(a, 'align') ?? 'left';
  const aligns = alignArg.startsWith('(') ? alignArg.slice(1, -1).split(',').map((x) => x.trim()) : Array(cols).fill(alignArg);
  const grid = [];
  const taken = new Set();
  const merges = [];
  const rules = new Map();
  let header = 0;
  let slot = 0;
  const free = () => {
    while (taken.has(slot)) slot += 1;
    return slot;
  };
  const rowOfNext = () => Math.floor(free() / cols);
  const place = (markup, colspan = 1, rowspan = 1) => {
    const at = free();
    const [r, c] = [Math.floor(at / cols), at % cols];
    for (let i = 0; i < rowspan; i += 1) for (let j = 0; j < colspan; j += 1) taken.add((r + i) * cols + c + j);
    while (grid.length < r + rowspan) grid.push(Array(cols).fill(null));
    grid[r][c] = { markup: markup.trim() };
    if (colspan > 1 || rowspan > 1) merges.push({ r, c, rows: rowspan, cols: colspan });
  };
  const visit = (items) => {
    for (const item of items) {
      if (item.name !== null) continue;
      const v = item.value.trim();
      const sub = /^table\.(hline|vline|header|footer|cell)\b/.exec(v);
      if (!sub) {
        place(contentOf(v) ?? '#' + v);
        continue;
      }
      const c = callAt(v, 0);
      if (sub[1] === 'hline') {
        const y = arg(c.args, 'y');
        const edge = y !== null ? Number(y) : rowOfNext();
        const start = Number(arg(c.args, 'start') ?? 0);
        const end = Number(arg(c.args, 'end') ?? cols);
        const list = rules.get(edge) ?? [];
        list.push(start === 0 && end >= cols ? 'full' : [start, end - 1]);
        rules.set(edge, list);
      } else if (sub[1] === 'header' || sub[1] === 'footer') {
        visit(c.args);
        if (sub[1] === 'header') header = Math.max(header, rowOfNext());
      } else if (sub[1] === 'cell') {
        place(c.bodies[0] ?? contentOf(arg(c.args, null, 0)) ?? '', Number(arg(c.args, 'colspan') ?? 1), Number(arg(c.args, 'rowspan') ?? 1));
      }
    }
  };
  visit(a);
  const rows = grid.length;
  // a right-aligned column of numbers lines up on the decimal point, an S column
  const plain = (m) => m?.markup.replace(/^\\?-/, '-') ?? '';
  const numeric = (j) => aligns[j] === 'right' && grid.slice(header).every((row) => !row[j] || /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/.test(plain(row[j])));
  const align = widths.map((w, j) => (w.endsWith('fr') ? 'X' : numeric(j) && grid.slice(header).some((row) => row[j]) ? 'S' : { left: 'l', center: 'c', right: 'r', start: 'l', end: 'r' }[aligns[j]] ?? 'l'));
  const cells = grid.map((row, r) => row.map((cell, j) => {
    if (!cell) return null;
    const markup = align[j] === 'S' && r >= header ? plain(cell).replace(/,/g, '') : cell.markup;
    return markup ? st.piece(markup) : null;
  }));
  const full = (i) => (rules.get(i) ?? []).includes('full');
  const preset = (i) => i === 0 || i === rows || (header > 0 && i === 1);
  const edges = tableEdges(rows, cols, header > 0).h;
  const toggled = edges.filter((_, i) => full(i) !== preset(i));
  const partRules = [...rules].filter(([i]) => i > 0 && !full(i)).flatMap(([i, list]) => list.filter(Array.isArray).map(([from, to]) => ({ row: i - 1, from, to })));
  ctx.used.add('table');
  const booktabs = /stroke:\s*none/.test(call.args.map((x) => (x.name ? x.name + ': ' + x.value : '')).join(','));
  return {
    kind: 'table',
    model: { cells, env: align.includes('X') ? 'tabularx' : 'tabular', align, lines: booktabs ? 'booktabs' : 'grid', toggled: booktabs ? toggled : [], header: header > 0, float: !!float, placement: float?.placement ?? 'ht', caption: '', label: '', escape: false, merges, partRules },
    caption: float?.caption ?? null,
    notes: float?.notes ?? []
  };
}

// the house pseudocode's keywords, and the algpseudocode command each line starts with
const OPENERS = [
  [/^\*else if\*\s*([\s\S]*?)\s*\*then\*\s*$/, 'ElsIf', 'If'],
  [/^\*if\*\s*([\s\S]*?)\s*\*then\*\s*$/, 'If', 'If'],
  [/^\*else\*\s*$/, 'Else', 'If'],
  [/^\*while\*\s*([\s\S]*?)\s*\*do\*\s*$/, 'While', 'While'],
  [/^\*for (?:all|each)\*\s*([\s\S]*?)\s*\*do\*\s*$/, 'ForAll', 'For'],
  [/^\*for\*\s*([\s\S]*?)\s*\*do\*\s*$/, 'For', 'For'],
  [/^\*repeat\*\s*$/, 'Repeat', 'Repeat'],
  [/^\*until\*\s*([\s\S]*?)\s*$/, 'Until', null],
  [/^\*loop\*\s*$/, 'Loop', 'Loop'],
  [/^\*function\*\s*#smallcaps\[([^\]]*)\];?\(([\s\S]*)\)\s*$/, 'Function', 'Function'],
  [/^\*procedure\*\s*#smallcaps\[([^\]]*)\];?\(([\s\S]*)\)\s*$/, 'Procedure', 'Procedure']
];

/**
 * The house pseudocode (Input and Output lines, then a numbered list indented with #h) as algpseudocode statements, each
 * block's end put back where the indentation steps out of it.
 */
function algorithmRecord(body, caption, placement, st, ctx) {
  ctx.used.add('algorithm');
  const inner = contentOf(body) ?? (/^align\(/.test(body.trim()) ? callAt(body.trim(), 0)?.bodies[0] : null) ?? '';
  const lines = [];
  const open = [];
  // the blocks opened at this level or deeper end here
  const close = (level) => {
    while (open.length && open[open.length - 1].level >= level) {
      const block = open.pop();
      lines.push({ command: 'End' + block.kind, level: block.level });
    }
  };
  for (const raw of inner.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const io = /^\*(Input|Output):\*\s*([\s\S]*?)\s*(?:\\)?$/.exec(raw);
    if (io) {
      lines.push({ command: io[1] === 'Input' ? 'Require' : 'Ensure', text: st.piece(io[2]), level: 0 });
      continue;
    }
    const item = /^[+-]\s+((?:#h\(\s*\d*\.?\d+em\s*\)\s*)*)([\s\S]*)$/.exec(raw);
    if (!item) continue;
    const level = Math.round([...item[1].matchAll(/#h\(\s*(\d*\.?\d+)em\s*\)/g)].reduce((n, m) => n + Number(m[1]), 0) / 1.5);
    let text = item[2];
    // a comment at the end of the line
    let comment = null;
    const c = /\s*#h\(1fr\)\s*\$triangle\.r\$\s*([\s\S]*)$/.exec(text);
    if (c) {
      comment = st.piece(c[1]);
      text = text.slice(0, c.index);
    }
    // an end written out (*end if*) closes its block, as the indentation would have
    if (/^\*end(?:\s+\w+)?\*\s*$/.test(text)) {
      close(level);
      continue;
    }
    const opener = OPENERS.find(([pattern]) => pattern.test(text));
    const name = opener?.[1];
    if (name === 'Else' || name === 'ElsIf' || name === 'Until') close(level + 1);
    else close(level);
    if (name === 'Until') open.pop();
    if (opener) {
      const m = opener[0].exec(text);
      lines.push({ command: name, args: m.slice(1).map((x) => st.piece(x)), comment, level });
      if (opener[2] && name !== 'Else' && name !== 'ElsIf') open.push({ kind: opener[2], level });
      continue;
    }
    const ret = /^\*return\*\s*([\s\S]*)$/.exec(text);
    lines.push({ command: 'State', returns: !!ret, text: st.piece(ret ? ret[1] : text), comment, level });
  }
  close(0);
  return { kind: 'algorithm', lines, caption, placement };
}

// ─── Inline: references, citations and units ───

const QUANTITY = /(\(?[-+±−]?\d[\d,]*(?:\.\d+)?(?:~±~\d+(?:\.\d+)?\))?|\$[^$]*times\s*10\^\(?-?\d+\)?\$)~([^\s,;:!?\])}"'<]+?)(?=[\s,;:!?\])}"'<]|\.(?:\s|$)|$)/g;

/**
 * References, citations and units in markup as tokens of their LaTeX: @label as \cref, @key as \parencite (neighbours
 * together, a [p.~12] supplement kept), #cite forms, #ref(…, form: "page"), typed quantities, comma-grouped numbers,
 * angles and today's date. In maths a quantity is a string token. ctx null: a definition, read before any document.
 */
function inlinePass(text, st, ctx) {
  const spans = markupSpans(text);
  const outside = (index) => spans.some(([s, e]) => index >= s && index < e);
  const labels = ctx?.labels ?? new Set();
  const keys = ctx?.bibKeys ?? new Set();
  let out = '';
  let last = 0;
  // references and citations, @a @b and @a and @b runs together
  const runs = /@([A-Za-z0-9_:.-]*[A-Za-z0-9_-])(\[(?:[^\]\\]|\\.)*\])?((?:\s+(?:and\s+|,\s*)?@[A-Za-z0-9_:.-]*[A-Za-z0-9_-](?:\[(?:[^\]\\]|\\.)*\])?)*)/g;
  for (const m of text.matchAll(runs)) {
    if (!outside(m.index) || (m.index > 0 && /[\p{L}\p{N}\\]/u.test(text[m.index - 1]))) continue;
    const parts = [...m[0].matchAll(/@([A-Za-z0-9_:.-]*[A-Za-z0-9_-])(\[((?:[^\]\\]|\\.)*)\])?/g)].map((p) => ({ name: p[1], supplement: p[3] ?? null }));
    const refs = parts.filter((p) => labels.has(p.name));
    const cites = parts.filter((p) => !labels.has(p.name));
    // a run is one kind or the other; a mixed one goes one at a time
    let latex;
    if (refs.length === parts.length) {
      ctx?.refsOut.push(...refs.map((r) => r.name));
      latex = '\\cref{' + refs.map((r) => r.name).join(',') + '}';
    } else if (cites.length === parts.length && /^(?:@\S+\s*)+$/.test(m[0].replace(/\[[^\]]*\]/g, ''))) {
      const known = cites.filter((c) => keys.has(c.name));
      ctx?.citesOut.push(...known.map((c) => c.name));
      const page = known.find((c) => c.supplement)?.supplement;
      latex = known.length ? '\\parencite' + (page ? '[' + page + ']' : '') + '{' + known.map((c) => c.name).join(',') + '}' : '';
      if (known.length < cites.length) ctx?.note(st, m[0], 'A citation of a key no .bib file has was left out: ' + cites.filter((c) => !keys.has(c.name)).map((c) => c.name).join(', ') + '.');
    } else {
      latex = parts.map((p) => (labels.has(p.name) ? (ctx?.refsOut.push(p.name), '\\cref{' + p.name + '}') : keys.has(p.name) ? (ctx?.citesOut.push(p.name), '\\parencite{' + p.name + '}') : p.name)).join(m[0].includes(' and ') ? ' and ' : ' ');
    }
    out += text.slice(last, m.index) + st.inline(latex);
    last = m.index + m[0].length;
  }
  text = out + text.slice(last);
  // #cite(<key>, form: …, supplement: […]) and #ref(<label>, form: "page")
  text = text.replace(/#(cite|ref)\((<([^>]+)>|label\("([^"]+)"\))((?:\s*,\s*(?:form|supplement):\s*(?:"[^"]*"|\[[^\]]*\]|none))*)\s*\)/g, (whole, kind, _, a, b, rest) => {
    const key = a ?? b;
    const form = /form:\s*(?:"([^"]*)"|(none))/.exec(rest);
    const supplement = /supplement:\s*\[([^\]]*)\]/.exec(rest)?.[1];
    if (kind === 'ref') {
      ctx?.refsOut.push(key);
      return st.inline((form?.[1] === 'page' ? '\\pageref{' : '\\cref{') + key + '}');
    }
    if (!keys.has(key) && ctx) {
      ctx.note(st, whole, 'A citation of ' + key + ', which no .bib file has, was left out.');
      return '';
    }
    ctx?.citesOut.push(key);
    const command = form?.[2] ? 'nocite' : { prose: 'textcite', author: 'citeauthor', year: 'citeyear', full: 'fullcite' }[form?.[1]] ?? 'parencite';
    return st.inline('\\' + command + (supplement ? '[' + supplement + ']' : '') + '{' + key + '}');
  });
  // the page-level calls inside text
  text = text
    .replace(/#datetime\.today\(\)(?:\.display\([^)]*\))?/g, () => st.inline('\\today'))
    .replace(/#h\(\s*1fr\s*\)/g, () => st.inline('\\hfill'))
    .replace(/#v\(\s*1fr\s*\)/g, () => st.inline('\\vfill'))
    .replace(/#v\(\s*([^)]+?)\s*\)/g, (whole, length) => (texLength(length) ? st.inline('\\vspace{' + texLength(length) + '}') : ''))
    .replace(/#h\(\s*([^)]+?)\s*\)/g, (whole, length) => (texLength(length) ? st.inline('\\hspace{' + texLength(length) + '}') : ''))
    .replace(/#line\(\s*length:\s*100%[^)]*\)/g, () => st.inline('\\rule{\\linewidth}{0.4pt}'));
  // #smallcaps[F]$(args)$, a \Call with its arguments in maths
  text = text.replace(/#smallcaps\[([^\]]*)\]\$\(([^$]*)\)\$/g, (whole, name, args) => st.inline('\\Call{' + name + '}{') + '$' + args + '$' + st.inline('}'));
  // #smallcaps[F];(args), the house \Call: its name and brackets as tokens, its arguments as they are
  const mathsAt = [...text.matchAll(/\$[^$]*\$/g)].map((m) => [m.index, m.index + m[0].length]);
  let called = '';
  let from = 0;
  for (const m of text.matchAll(/#smallcaps\[([^\]]*)\];?\(/g)) {
    if (m.index < from) continue;
    const open = m.index + m[0].length - 1;
    const close = groupEnd(text, open);
    const quote = mathsAt.some(([s, e]) => m.index > s && m.index < e) ? '"' : '';
    called += text.slice(from, m.index) + quote + st.inline('\\Call{' + m[1] + '}{') + quote + text.slice(open + 1, close - 1) + quote + st.inline('}') + quote;
    from = close;
  }
  text = called + text.slice(from);
  // quantities and numbers, in text (and in table cells and captions) and in maths
  const prose = markupSpans(text);
  const inProse = (index) => prose.some(([s, e]) => index >= s && index < e);
  text = text.replace(QUANTITY, (whole, number, unit, at) => {
    if (!inProse(at) && !/^\$/.test(number)) return whole;
    const n = typedNumber(number.replace(/^\$|\$$/g, ''));
    const u = typedUnit(unit);
    if (n === null || !u) return whole;
    if (ctx) ctx.units = true;
    return st.inline('\\qty{' + n + '}{' + u + '}');
  });
  const unit = (latex) => {
    if (ctx) ctx.units = true;
    return st.inline(latex);
  };
  text = text.replace(/(?<![\p{L}\p{N}.,~])(\d+(?:\.\d+)?)°(?![\p{L}\p{N}C])/gu, (whole, n, at) => (inProse(at) ? unit('\\ang{' + n + '}') : whole));
  text = text.replace(/(?<![\p{L}\p{N}.,~\\])(\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?![\p{L}\p{N},~]|\.\d)/gu, (whole, n, at) => (inProse(at) ? unit('\\num{' + n.replace(/,/g, '') + '}') : whole));
  // in maths: 4.7 thin "kΩ" and #[4.7~kΩ]
  text = text.replace(/\$[^$]*\$/g, (maths) => maths
    .replace(/#\[([^\]]*)\]/g, (whole, inner) => {
      const q = /^(.+?)~(.+)$/.exec(inner);
      const n = q && typedNumber(q[1]);
      const u = q && typedUnit(q[2]);
      return n !== null && n !== undefined && u ? '"' + unit('\\qty{' + n + '}{' + u + '}') + '"' : typedNumber(inner) !== null ? '"' + unit('\\num{' + typedNumber(inner) + '}') + '"' : whole;
    })
    // a quantity in brackets of its own, (13 thin "V/µs") / ..., loses them: the token is one atom already
    .replace(/(\()?\s*((?:\(\s*)?(?:plus\.minus\s*)?\d[\d.]*(?:\s*plus\.minus\s*\d[\d.]*)?(?:\s*\))?(?:\s*times\s*10\^\(?-?\d+\)?)?)\s+thin\s+"([^"]+)"\s*(\))?/g, (whole, open, number, symbols, close) => {
      const n = typedNumber(number.replace(/plus\.minus/g, '±'));
      const u = typedUnit(symbols);
      if (n === null || !u) return whole;
      const token = '"' + unit('\\qty{' + n + '}{' + u + '}') + '"';
      return open && close ? token : (open ?? '') + token + (close ?? '');
    }));
  return text;
}

// ─── LaTeX back together ───

/** The held pieces in pandoc's LaTeX, by number, and the text without them. */
function takePieces(latex) {
  const pieces = [];
  const text = latex.replace(/^SPXPIECESTART(\d+)\n([\s\S]*?)^SPXPIECEEND\1\s*$\n?/gm, (_, n, body) => {
    pieces[Number(n)] = body.trim();
    return '';
  });
  return { pieces, text };
}

/** pandoc's LaTeX, tidied: its maths' \text{ x } spaces, ≔, list items on their \item line. */
function tidy(latex) {
  return latex
    .replace(/\\text\{\s+([^{}]*?)\s*\}|\\text\{([^{}]*?)\s+\}/g, (_, a, b) => '\\text{' + (a ?? b) + '}')
    .replace(/≔/g, '\\coloneqq ')
    // Typst's lr(…, size: #120%), which pandoc writes as \left. \left( … \right) \right.
    .replace(/\\left\.\s*\\left/g, '\\bigl')
    .replace(/\\right(\\?[)\]}|]|\\rbrack|\\rangle)\s*\\right\./g, '\\bigr$1')
    .replace(/≕/g, '\\eqqcolon ')
    .replace(/^(\s*)\\item(\[[^\]]*\])?\n[ \t]*(?=\S)/gm, '$1\\item$2 ')
    .replace(/^\\item\b/gm, '  \\item')
    .replace(/\\url\{([^}]*?)([.,;:])\}/g, '\\url{$1}$2');
}

/** The file's LaTeX: pandoc's text with the pieces taken out, each block in its token's place, each inline token's LaTeX in its place. */
export function assembleLatex(latex, st, ctx) {
  const { pieces, text } = takePieces(tidy(latex));
  const pieceText = (n) => (n === null || n === undefined ? '' : resolve(pieces[n] ?? ''));
  function resolve(source) {
    return source.replace(/SPXB(\d+)X/g, (_, n) => {
      const record = st.blocks[Number(n)];
      return resolve(region(record, renderBlock(record, pieceText, st, ctx), st, ctx, 'latex'));
    });
  }
  // the title block's text, which \maketitle and the preamble print
  if (st.titlePiece !== undefined) ctx.titleLatex = resolve(pieces[st.titlePiece] ?? '');
  let out = resolve(text);
  for (let k = 0; k < 3 && /SPXI\d+X/.test(out); k += 1) {
    out = out.replace(/\\(?:text|mathrm)\{\s*SPXI(\d+)X\s*\}(?:\\ )?|\\ SPXI(\d+)X|SPXI(\d+)X/g, (_, a, b, c) => st.inlines[a ?? b ?? c]);
  }
  const finish = (latex) => {
    let t = latex;
    for (let k = 0; k < 3 && /SPXI\d+X/.test(t); k += 1) t = t.replace(/\\(?:text|mathrm)\{\s*SPXI(\d+)X\s*\}(?:\\ )?|\\ SPXI(\d+)X|SPXI(\d+)X/g, (_, a, b, c) => st.inlines[a ?? b ?? c]);
    return t;
  };
  for (const key of ['titleLatex', 'authorLatex', 'dateLatex']) if (typeof ctx[key] === 'string') ctx[key] = finish(ctx[key]);
  // \Call's arguments go through \ifthenelse, which takes $…$ but not \(…\)
  out = out.replace(/\\Call\{([^{}]*)\}\{\\\(([\s\S]*?)\\\)\}/g, '\\Call{$1}{$$$2$$}');
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** One held construct as LaTeX. */
function renderBlock(record, pieceText, st, ctx) {
  const label = (l) => (l ? '\\label{' + l + '}' : '');
  switch (record.kind) {
    case 'raw':
      return record.latex;
    case 'heading': {
      const report = ctx.facts.report;
      const names = report ? ['chapter', 'section', 'subsection', 'subsubsection', 'paragraph'] : ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];
      const name = names[Math.min(record.level, names.length) - 1];
      return '\\' + name + (record.numbered || !ctx.facts.headingNumbers ? '' : '*') + '{' + pieceText(record.title) + '}' + label(record.label);
    }
    case 'equation': {
      const tex = pieceText(record.maths).replace(/^\\\[\s*|\s*\\\]$/g, '').replace(/^\\\(\s*|\s*\\\)$/g, '').trim();
      // lines or alignment of its own, outside any cases or matrix in it, take aligned
      let top = tex;
      for (let k = 0; k < 5 && /\\begin\{/.test(top); k += 1) top = top.replace(/\\begin\{(\w+\*?)\}(?:(?!\\begin\{)[\s\S])*?\\end\{\1\}/g, ' ');
      const aligned = record.aligned && !/\\begin\{aligned\}/.test(tex) && /&|\\\\/.test(top) ? '\\begin{aligned}\n    ' + tex.replace(/\s*\\\\\s*/g, ' \\\\\n    ') + '\n  \\end{aligned}' : tex;
      if (!record.numbered) return '\\[\n  ' + aligned + '\n\\]';
      ctx.equations += 1;
      return '\\begin{equation}' + label(record.label) + '\n  ' + aligned + '\n\\end{equation}';
    }
    case 'figure':
      return renderFigure(record, pieceText, ctx);
    case 'table': {
      const model = { ...record.model, cells: record.model.cells.map((row) => row.map((n) => (n === null ? '' : pieceText(n)))), caption: record.caption === null ? '' : pieceText(record.caption), label: record.label ?? '' };
      if (record.notes.length) {
        model.notes = record.notes.map((n) => (n.mark ? n.mark + ': ' : '') + pieceText(n.text)).join('\n');
        model.cells = model.cells.map((row) => row.map((c) => c.replace(/\\textsuperscript\{([^}]*)\}/g, '\\tnote{$1}')));
        ctx.used.add('threeparttable');
      }
      ctx.used.add('booktabs');
      if (model.align.includes('S')) ctx.used.add('siunitx');
      if (model.env === 'tabularx') ctx.used.add('tabularx');
      if (model.merges.some((g) => g.rows > 1)) ctx.used.add('multirow');
      if (model.cells.some((row) => row.some((c) => c.includes('\\\\')))) {
        model.breaks = true;
        ctx.used.add('makecell');
      }
      return tableLatex(model);
    }
    case 'listing': {
      const options = [...(record.language ? ['language=' + record.language] : []), ...(record.caption !== null ? ['caption={' + pieceText(record.caption) + '}'] : []), ...(record.label ? ['label={' + record.label + '}'] : [])];
      return '\\begin{lstlisting}' + (options.length ? '[' + options.join(', ') + ']' : '') + '\n' + record.code + '\n\\end{lstlisting}';
    }
    case 'algorithm': {
      const lines = record.lines.map((line) => {
        const indent = '    ' + '  '.repeat(line.level ?? 0);
        const comment = line.comment !== null && line.comment !== undefined ? ' \\Comment{' + pieceText(line.comment) + '}' : '';
        if (line.command === 'Require' || line.command === 'Ensure') return '    \\' + line.command + ' ' + pieceText(line.text);
        if (line.command.startsWith('End')) return indent + '\\' + line.command;
        if (line.command === 'State') return indent + '\\State ' + (line.returns ? '\\Return ' : '') + pieceText(line.text) + comment;
        if (line.command === 'Else' || line.command === 'Repeat' || line.command === 'Loop') return indent + '\\' + line.command + comment;
        if (line.command === 'Function' || line.command === 'Procedure') return indent + '\\' + line.command + '{' + pieceText(line.args[0]) + '}{' + pieceText(line.args[1]) + '}' + comment;
        return indent + '\\' + line.command + '{' + pieceText(line.args[0]) + '}' + comment;
      });
      return [
        '\\begin{algorithm}[' + record.placement + ']',
        ...(record.caption !== null ? ['  \\caption{' + pieceText(record.caption) + '}'] : []),
        ...(record.label ? ['  \\label{' + record.label + '}'] : []),
        '  \\begin{algorithmic}[1]',
        ...lines,
        '  \\end{algorithmic}',
        '\\end{algorithm}'
      ].join('\n');
    }
    case 'theorem': {
      const name = record.name;
      const title = record.title === null ? '' : '[' + pieceText(record.title) + ']';
      if (name === 'proof' || name === 'solution') ctx.used.add(name);
      return '\\begin{' + name + '}' + title + label(record.label) + '\n' + pieceText(record.body) + '\n\\end{' + name + '}';
    }
    case 'maketitle': {
      // the author lines, then the date as the last line
      const lines = record.lines.map((n) => pieceText(n));
      ctx.dateLatex = lines.length > 1 ? lines.pop() : '';
      ctx.authorLatex = lines.join(' \\\\ ');
      return '\\maketitle';
    }
    case 'titlepage': {
      const lines = record.items.map((item, i) => {
        if (item.space !== undefined) {
          if (/fr$/.test(item.space)) return '\\vfill';
          return /^\d*\.?\d+(?:mm|cm|in|pt|em)$/.test(item.space) ? '\\vspace' + (i === 0 ? '*' : '') + '{' + item.space + '}' : null;
        }
        const text = item.title ? ctx.titleLatex ?? '' : pieceText(item.text);
        // a bare #title() as Typst sets it, large and bold
        const style = item.title && !item.size && !item.bold ? '\\LARGE\\bfseries' : [latexSize(item.size, ctx.facts.size), item.bold && '\\bfseries', item.italic && '\\itshape'].filter(Boolean).join('');
        return style ? '{' + style + ' ' + text + '\\par}' : text + '\\par';
      });
      return ['\\begin{titlepage}', '  \\centering', ...lines.filter(Boolean).map((l) => '  ' + l), '\\end{titlepage}'].join('\n');
    }
    case 'tableofcontents':
    case 'listoffigures':
    case 'listoftables':
      return '\\' + record.kind;
    case 'bibliography':
      ctx.bibliographyPlaced = true;
      return ctx.citesOut.length ? '\\printbibliography' : '';
    case 'appendix':
      return '\\appendix';
    case 'numbering': {
      const style = record.style === null ? 'alph' : record.style === 'i' ? 'roman' : record.style === 'I' ? 'Roman' : 'arabic';
      return (style === 'arabic' || style === 'roman' ? '\\clearpage\n' : '') + '\\pagenumbering{' + style + '}';
    }
    case 'include':
      return record.path ? (/^chapters\//.test(record.path) ? '\\include{' : '\\input{') + record.path.replace(/\.tex$/, '') + '}' : '';
    case 'sides':
      return record.lines.map(([left, right]) => (left === null ? '' : pieceText(left)) + (right === null ? '' : ' \\hfill ' + pieceText(right))).join(' \\\\\n') + '\n';
    case 'grid': {
      const rows = [];
      for (let i = 0; i < record.cells.length; i += record.columns) rows.push(record.cells.slice(i, i + record.columns).map((n) => pieceText(n)).join(' & ') + ' \\\\');
      return '\\noindent\\begin{tabular}{@{}' + 'l'.repeat(record.columns) + '@{}}\n' + rows.map((r) => '  ' + r).join('\n') + '\n\\end{tabular}';
    }
    default:
      return '';
  }
}

/** A figure as LaTeX_STYLE.md writes it, its caption LaTeX already. */
function renderFigure(record, pieceText, ctx) {
  const caption = record.caption === null ? '' : pieceText(record.caption);
  ctx.used.add('graphicx');
  if (record.layout === 'image' || record.layout === 'picture') {
    const picture = record.layout === 'picture' ? ctx.pictures[record.picture] : null;
    if (picture && !picture.ok) return ['\\begin{figure}[' + record.placement + ']', '  \\centering', '  \\fbox{Picture not converted: ' + texText(picture.typ ?? '') + '}', '  \\caption{' + caption + '}', ...(record.label ? ['  \\label{' + record.label + '}'] : []), '\\end{figure}'].join('\n');
    const path = picture ? picture.pdf : record.path;
    const size = record.size ?? (picture ? null : { mode: 'line', fraction: 0.75, width: 0, height: 0, scale: 1 });
    if (!size) return ['\\begin{figure}[' + record.placement + ']', '  \\centering', '  \\includegraphics{' + path + '}', '  \\caption{' + caption + '}', ...(record.label ? ['  \\label{' + record.label + '}'] : []), '\\end{figure}'].join('\n');
    return figureLatex({ path, width: size.fraction, size, caption, label: record.label ?? '', placement: record.placement, markup: true });
  }
  const panels = record.panels.map((p) => ({ path: p.path, caption: p.caption === null ? '' : pieceText(p.caption), label: p.label }));
  if (record.layout === 'sub') ctx.used.add('subcaption');
  return figureSetLatex({ panels, layout: 'grid', columns: record.columns, labels: record.layout === 'sub' ? 'sub' : 'separate', align: record.align ?? 'bottom', size: { mode: 'line', fraction: 1, width: 0, height: 0, scale: 1 }, caption, label: record.label ?? '', placement: record.placement, markup: true });
}

// ─── The preamble ───

const BABEL = { 'en-AU': 'australian', 'en-GB': 'british', 'en-US': 'american', 'en-CA': 'canadian', 'en-NZ': 'newzealand', en: 'english', fr: 'french', de: 'ngerman', es: 'spanish', it: 'italian', pt: 'portuguese', nl: 'dutch' };
const STYLE_OF = { plain: 'plain', definition: 'definition', remark: 'remark' };

/** The LaTeX preamble of LATEX_STYLE.md for what the converted document uses, its groups in the house order. */
export function latexPreamble(ctx) {
  const f = ctx.facts;
  const lang = BABEL[f.lang + (f.region ? '-' + f.region : '')] ?? BABEL[f.lang] ?? 'english';
  const pdfLang = f.lang + (f.region ? '-' + f.region : '');
  const margin = !f.margin ? '25mm' : f.margin;
  const geometry = /^\d/.test(margin) ? 'margin=' + margin : (() => {
    const x = /x:\s*([\d.]+\w+)/.exec(margin)?.[1];
    const y = /y:\s*([\d.]+\w+)/.exec(margin)?.[1];
    return [x && 'hmargin=' + x, y && 'vmargin=' + y].filter(Boolean).join(',') || 'margin=25mm';
  })();
  const paper = { a4: 'a4paper', 'us-letter': 'letterpaper', a5: 'a5paper' }[f.paper] ?? 'a4paper';
  const klass = f.report ? 'report' : 'article';
  const used = ctx.used;
  const theorems = [...f.theorems].filter(([name]) => used.has('theorem:' + name));
  const groups = [];
  groups.push([commented('\\documentclass[' + Math.round(f.size) + 'pt,' + paper + ']{' + klass + '}', Math.round(f.size) + ' pt text on ' + paper.replace('paper', '').toUpperCase().replace('LETTER', 'US Letter') + ' paper' + (f.report ? '; chapters and a title page' : ''))]);
  if (ctx.hasBibliography) {
    groups.push([
      '% References',
      commented('\\usepackage{csquotes}', 'quotation marks that follow the document\'s language'),
      '\\usepackage[backend=biber,style=' + ctx.bibStyle + ',natbib=true]{biblatex} % ' + (ctx.bibStyle === 'apa' ? 'APA 7' : ctx.bibStyle) + '; compile with Biber',
      ...(lang === 'australian' && ctx.bibStyle === 'apa' ? ['\\DeclareLanguageMapping{australian}{british-apa}'] : []),
      commented('\\usepackage{xurl}', 'allow long bibliography URLs to wrap within the page'),
      '\\addbibresource{' + ctx.bibFile + '}'
    ]);
  }
  groups.push([
    '% Page',
    commented('\\usepackage[' + geometry + ']{geometry}', /^margin=25mm$/.test(geometry) ? '25 mm margins all round' : 'the Typst page\'s margins'),
    commented('\\usepackage{parskip}', 'a blank line between paragraphs instead of an indent'),
    commented('\\usepackage[' + lang + ']{babel}', lang === 'australian' ? 'Australian hyphenation, and \\today as 17 October 2026' : 'the document\'s language'),
    commented('\\usepackage{iftex}', 'tells which TeX engine is running'),
    commented('\\ifPDFTeX', 'for pdfLaTeX only:'),
    commented('  \\usepackage[T1]{fontenc}', 'proper accented letters, and text that copies cleanly from the PDF'),
    commented('  \\usepackage{lmodern}', 'Latin Modern, a crisp scalable version of the default font'),
    commented('\\fi', 'XeLaTeX, LuaLaTeX and Tectonic already use Unicode fonts'),
    commented('\\usepackage{microtype}', 'small spacing tweaks so lines break more evenly'),
    ...(f.numbering === null && !f.report ? [commented('\\pagestyle{empty}', 'no page numbers, as the Typst had none')] : [])
  ]);
  const maths = [
    commented('\\usepackage{amsmath}', 'align, cases, matrices and \\text inside maths'),
    commented('\\usepackage{amssymb}', 'extra symbols such as \\mathbb{R}'),
    ...(used.has('mathtools') ? [commented('\\usepackage{mathtools}', 'fixes and extras for amsmath, such as \\coloneqq')] : []),
    ...(theorems.length || used.has('proof') || used.has('solution') ? [commented('\\usepackage{amsthm}', 'theorem, definition and proof environments')] : [])
  ];
  groups.push(['% Maths', ...maths]);
  const figures = [
    ...(used.has('graphicx') ? [commented('\\usepackage{graphicx}', '\\includegraphics, for photos and saved plots')] : []),
    ...(used.has('subcaption') ? [commented('\\usepackage{subcaption}', 'sub-figures (a), (b), each with its own caption and label')] : []),
    ...(used.has('booktabs') ? [commented('\\usepackage{booktabs}', '\\toprule, \\midrule and \\bottomrule for clean tables')] : []),
    ...(used.has('tabularx') ? [commented('\\usepackage{tabularx}', 'tables that stretch to the line, with wrapping X columns')] : []),
    ...(used.has('siunitx') || ctx.units ? [commented('\\usepackage{siunitx}', 'numbers and units: \\qty{6.6}{\\kilo\\watt}, aligned table columns'), '\\sisetup{group-separator={,},group-minimum-digits=4,per-mode=symbol} % 7,790 with a comma, and V/µs'] : []),
    ...(used.has('multirow') ? [commented('\\usepackage{multirow}', 'cells merged down the rows')] : []),
    ...(used.has('makecell') ? [commented('\\usepackage{makecell}', 'a line break inside a cell')] : []),
    ...(used.has('threeparttable') ? [commented('\\usepackage{threeparttable}', 'notes under a table')] : [])
  ];
  if (figures.length) groups.push(['% Figures and tables', ...figures]);
  const code = [
    ...(used.has('code') ? [
      commented('\\usepackage{xcolor}', 'named colours for the code highlighting below'),
      commented('\\usepackage{listings}', 'highlighted code blocks and \\lstinline, with no shell-escape')
    ] : []),
    ...(used.has('algorithm') ? [
      commented('\\usepackage{algorithm}', 'numbered, captioned boxes for algorithms'),
      commented('\\usepackage{algpseudocode}', 'pseudocode commands: \\State, \\If, \\While, \\Function, ...'),
      '\\algrenewcommand\\algorithmicrequire{\\textbf{Input:}}    % \\Require prints Input: rather than Require:',
      '\\algrenewcommand\\algorithmicensure{\\textbf{Output:}}    % \\Ensure prints Output: rather than Ensure:'
    ] : []),
    ...(used.has('code') ? [
      '',
      '% How code looks: set language=... per listing (Python, C, Java, Matlab, bash, SQL, ...).',
      '% Under pdfLaTeX listings only reads plain ASCII, so keep accents and emoji out of code.',
      '\\lstdefinestyle{report}{',
      '  basicstyle       = \\ttfamily\\small,',
      '  keywordstyle     = \\color{blue!70!black}\\bfseries,',
      '  commentstyle     = \\color{green!40!black}\\itshape,',
      '  stringstyle      = \\color{red!60!black},',
      '  numbers          = left,              % line numbers down the left',
      '  numberstyle      = \\tiny\\color{gray},',
      '  frame            = single,',
      '  rulecolor        = \\color{gray!40},',
      '  backgroundcolor  = \\color{gray!5},',
      '  breaklines       = true,              % wrap long lines instead of running off the page',
      '  postbreak        = \\mbox{\\textcolor{gray}{$\\hookrightarrow$}\\space},',
      '  columns          = fullflexible,      % natural letter spacing, not fixed-width columns',
      '  keepspaces       = true,',
      '  showstringspaces = false,',
      '  upquote          = true,              % straight quotes, as typed',
      '  tabsize          = 4,',
      '  xleftmargin      = 1.5em,             % room for the line numbers',
      '  framexleftmargin = 0.5em',
      '}',
      '\\lstset{style=report}'
    ] : [])
  ];
  if (code.length) groups.push(['% Code', ...code]);
  const title = ctx.titleLatex ?? '';
  groups.push([
    '% Links',
    commented('\\usepackage[hidelinks]{hyperref}', 'clickable cross-references and citations, without coloured boxes'),
    commented('\\hypersetup{', 'details shown in the PDF viewer\'s document properties'),
    '  pdftitle  = {' + ctx.pdfTitle + '},',
    '  pdfauthor = {' + texText(f.author ?? '') + '},',
    '  pdflang   = {' + pdfLang + '}',
    '}',
    '\\usepackage[capitalise,noabbrev]{cleveref} % \\cref{fig:x} writes "Figure 1.1" for you; load after hyperref'
  ]);
  const own = [];
  if (f.bySection || f.report) {
    const unit = f.report ? 'chapter' : 'section';
    if (!f.report) own.push('% Number equations, figures and tables by section: (2.1), Figure 2.1, ...', '\\numberwithin{equation}{' + unit + '}', '\\numberwithin{figure}{' + unit + '}', '\\numberwithin{table}{' + unit + '}');
  }
  if (!f.headingNumbers) own.push(commented('\\setcounter{secnumdepth}{0}', 'headings without numbers, as the Typst had them'));
  if (theorems.length || used.has('solution')) {
    own.push('', '% Theorem-like environments, all sharing one counter per ' + (f.report ? 'chapter' : 'section') + ': Theorem 2.1, Example 2.2, ...');
    let first = null;
    let style = null;
    for (const [name, t] of theorems) {
      if (STYLE_OF[t.style] !== style) {
        style = STYLE_OF[t.style];
        own.push('\\theoremstyle{' + style + '}');
      }
      own.push(first ? '\\newtheorem{' + name + '}[' + first + ']{' + t.display + '}' : '\\newtheorem{' + name + '}{' + t.display + '}[' + (f.report ? 'chapter' : 'section') + ']');
      first ??= name;
    }
    if (used.has('solution')) own.push('\\newenvironment{solution}{\\begin{proof}[Solution]}{\\end{proof}}');
  }
  const head = [
    ...(title ? ['\\title{' + title + '}'] : []),
    ...(ctx.authorLatex || f.author ? ['\\author{' + (ctx.authorLatex || texText(f.author)) + '}'] : []),
    ...(ctx.dateLatex !== undefined ? ['\\date{' + ctx.dateLatex + '}'] : [])
  ];
  return [...groups.map((g) => g.join('\n')), ...(own.length ? [own.join('\n').trim()] : []), ...(head.length ? [head.join('\n')] : [])].join('\n\n');
}

/**
 * A Typst file's prose for the word check: without its rules and definitions, comments, raw text, title block and
 * pseudocode, whose words the LaTeX keeps in its preamble or in algorithmic, which the check leaves out there too.
 */
export function typstProse(text) {
  let out = '';
  for (let i = 0; i < text.length; ) {
    const lineEnd = text.indexOf('\n', i) === -1 ? text.length : text.indexOf('\n', i);
    const line = text.slice(i, lineEnd);
    if (/^\s*#(set|show|let|import)\s/.test(line)) {
      i = statementEnd(text, i + line.indexOf('#')) + 1;
      continue;
    }
    out += /^\s*\/\//.test(line) ? '\n' : line + '\n';
    i = lineEnd + 1;
  }
  out = out.replace(/```[\s\S]*?```|`[^`\n]*`/g, (raw) => ' '.repeat(raw.length));
  for (const name of ['#align(', '#figure(']) {
    for (let at = out.indexOf(name); at !== -1; at = out.indexOf(name, at + 1)) {
      const end = expressionEnd(out, at);
      const call = out.slice(at, end);
      if ((name === '#align(' && TITLE.test(call)) || (name === '#figure(' && /kind:\s*"algorithm"/.test(call))) out = out.slice(0, at) + ' '.repeat(end - at) + out.slice(end);
    }
  }
  return out;
}
