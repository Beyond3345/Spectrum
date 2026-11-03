// Typst to LaTeX for documents written to docs/TYPST_STYLE.md, as section 5.2 of docs/featureResearch/
// LATEX_TYPST_CONVERSION.md designs it, read with Typst's own parser (typstRead.js). The pre-pass walks each file's
// syntax tree: the preamble's rules become facts, every house construct (headings, equations, figures, tables,
// listings, pseudocode, theorems, the title block, units, references and citations) is held as a token, the
// document's own simple functions are expanded, and what LaTeX cannot have (a package's drawing, Typst scripting)
// becomes a picture Typst compiles. What is left for pandoc is plain Typst prose, which it writes with each held piece
// as LaTeX in one run, and the house writers of LATEX_STYLE.md put the constructs back. Pure: the caller runs pandoc and
// Typst (convertService.js).
import { diagramLatex, figureLatex, figureSetLatex, tableEdges, tableLatex } from '../../latex/floats.js';
import { arg, argsOf, callOf, calleeName, findAll, labelName, leaf, markupOf, markupText, parseTypst, significant, stringOf } from './typstRead.js';
import { braceArg, environments } from './latexRead.js';
import { typedNumber, typedUnit } from './units.js';
import { region } from './regions.js';

const TYPST_LANGUAGES = { python: 'Python', py: 'Python', c: 'C', cpp: 'C++', 'c++': 'C++', java: 'Java', matlab: 'Matlab', bash: 'bash', sh: 'bash', sql: 'SQL', javascript: 'JavaScript', js: 'JavaScript', html: 'HTML', latex: 'TeX', tex: 'TeX', r: 'R', rust: 'Rust', go: 'Go', ruby: 'Ruby', haskell: 'Haskell', fortran: 'Fortran', csharp: '[Sharp]C', xml: 'XML', typst: '' };
const COL = 40;
/** A preamble line with its comment in column 41, or one space after a line too long for that. */
const commented = (code, comment) => (code.length < COL ? code.padEnd(COL) : code + ' ') + '% ' + comment;
const LATEX_SPECIAL = /[\\{}$&%#_^~]/g;
const texText = (text) => String(text).replace(LATEX_SPECIAL, (ch) => ({ '\\': '\\textbackslash{}', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' })[ch] ?? '\\' + ch);

// the statements, which change what follows rather than print anything
const STATEMENTS = new Set(['SetRule', 'ShowRule', 'LetBinding', 'ModuleImport']);
// the house definitions, which LATEX_STYLE.md has its own of
const HOUSE = ['subfigure', 'theorem-number', 'theorem-like', 'proof', 'solution', 'by-section', 'accent'];
// what makes a function more than a template to fill in: scripting, and rules or definitions of its own
const SCRIPTING = new Set(['Closure', 'LetBinding', 'SetRule', 'ShowRule', 'Contextual', 'Conditional', 'WhileLoop', 'ForLoop', 'CodeBlock', 'FuncReturn', 'LoopBreak', 'LoopContinue', 'DestructAssignment', 'ModuleImport', 'ModuleInclude', 'Spread']);
// Typst's own functions a document calls in its text; any other name may be a package's, when one is imported with *
const BUILT_IN = new Set(['align', 'bibliography', 'block', 'box', 'circle', 'cite', 'cmyk', 'colbreak', 'color', 'columns', 'context', 'counter', 'curve', 'datetime', 'ellipse', 'emph', 'emoji', 'enum', 'figure', 'footnote', 'grid', 'h', 'heading', 'hide', 'highlight', 'image', 'label', 'layout', 'line', 'linebreak', 'link', 'list', 'lorem', 'lower', 'luma', 'math', 'measure', 'metadata', 'move', 'numbering', 'outline', 'overline', 'pad', 'pagebreak', 'parbreak', 'place', 'polygon', 'query', 'quote', 'raw', 'rect', 'ref', 'repeat', 'rgb', 'rotate', 'scale', 'skew', 'smallcaps', 'square', 'stack', 'state', 'str', 'strike', 'strong', 'sub', 'super', 'sym', 'table', 'terms', 'text', 'title', 'underline', 'upper', 'v']);

// ─── The facts of the preamble ───

/** An empty fact sheet, filled by the preamble's rules and definitions. */
export function typstFacts() {
  return { title: null, author: null, paper: 'a4', margin: null, numbering: '1', size: 11, lang: 'en', region: 'AU', headingNumbers: true, equationNumbers: false, report: false, bySection: false, bibTitle: null, theorems: new Map(), house: new Set(), definitions: [], functions: new Map(), packages: [] };
}

/** A Typst length as TeX writes it: 25mm, 1.5cm, 12pt; 1fr as \fill. */
const texLength = (value) => {
  const v = String(value ?? '').trim();
  if (/^\d*\.?\d+(?:mm|cm|pt|in|em)$/.test(v)) return v;
  if (/^\d*\.?\d+fr$/.test(v)) return '\\fill';
  const share = /^(\d*\.?\d+)%$/.exec(v);
  return share ? +(Number(share[1]) / 100).toFixed(2) + '\\linewidth' : null;
};

/** A set rule as a call: { name, args, bodies }. */
const setRule = (node) => ({ name: calleeName(node.children.find((c) => c.kind === 'Ident' || c.kind === 'FieldAccess')), ...argsOf(node.children.find((c) => c.kind === 'Args')) });

/** The names an import of a package brings in: the name it goes by, unless only items are taken, and its items; * for all. */
function importedNames(node, from) {
  const items = node.children.find((c) => c.kind === 'ImportItems');
  const as = node.children.findIndex((c) => c.kind === 'As');
  const own = as !== -1 ? node.children.slice(as + 1).find((c) => c.kind === 'Ident')?.text : items || node.children.some((c) => c.kind === 'Star') ? null : /^@[^/]+\/([^:]+)/.exec(from)?.[1];
  const taken = items ? significant(items).filter((c) => c.kind !== 'Comma').map((item) => findAll(item, (n) => n.kind === 'Ident').pop()?.text) : [];
  return [own, ...taken, ...(node.children.some((c) => c.kind === 'Star') ? ['*'] : [])].filter(Boolean);
}

/** The package a name (or the namespace before its dot) comes from, as its import has it, or null. */
function packageOf(name, facts) {
  const head = String(name ?? '').split('.')[0];
  if (!head) return null;
  const named = facts.packages.find((p) => p.names.includes(head));
  if (named) return named.from;
  const known = BUILT_IN.has(head) || HOUSE.includes(head) || facts.functions.has(head) || facts.theorems.has(head);
  return known ? null : facts.packages.find((p) => p.names.includes('*'))?.from ?? null;
}

/**
 * A #let of the document's own: { params (its closure's, null for a value), body, simple, text }. A simple one is a
 * template to fill in, with no scripting, packages or functions of its own that aren't, and no parameter it calls or
 * takes a field of; Spectrum expands it where it is used.
 */
function definitionOf(node, facts) {
  const [, bound] = significant(node);
  const closure = bound?.kind === 'Closure' ? bound : null;
  const name = closure ? (closure.children[0]?.kind === 'Ident' ? closure.children[0].text : null) : bound?.kind === 'Ident' ? bound.text : null;
  if (!name || !node.children.some((c) => c.kind === 'Eq') && !closure) return { name: null };
  const body = significant(closure ?? node).at(-1);
  const params = closure ? closure.children.find((c) => c.kind === 'Params') : null;
  const list = significant(params).filter((p) => !['LeftParen', 'RightParen', 'Comma'].includes(p.kind));
  const names = new Set(list.map((p) => (p.kind === 'Named' ? p.children[0].text : p.text)));
  const simple = list.every((p) => p.kind === 'Ident' || p.kind === 'Named') && !findAll(body, (n) => SCRIPTING.has(n.kind)
    || ((n.kind === 'FieldAccess' || n.kind === 'FuncCall') && names.has(n.children[0]?.text))
    || (n.kind === 'Ident' && (n.text === name || facts.functions.get(n.text)?.simple === false || facts.packages.some((p) => p.names.includes(n.text))))).length;
  return { name, params, body, simple, text: '#' + node.text };
}

/** One #set, #show, #let or #import read into the facts. */
function readStatement(node, facts, st, ctx) {
  if (node.kind === 'SetRule') {
    const rule = setRule(node);
    const value = (name) => arg(rule, name);
    if (rule.name === 'document') {
      if (value('title')) facts.title = markupText(value('title'));
      if (value('author')) facts.author = stringOf(value('author')) ?? significant(value('author')).map(stringOf).filter(Boolean).join(', ');
    } else if (rule.name === 'page') {
      if (value('paper')) facts.paper = stringOf(value('paper')) ?? facts.paper;
      if (value('margin')) facts.margin = value('margin').text;
      if (value('numbering')) facts.numbering = stringOf(value('numbering'));
    } else if (rule.name === 'text') {
      const size = /^(\d+(?:\.\d+)?)pt$/.exec(value('size')?.text ?? '');
      if (size) facts.size = Number(size[1]);
      if (value('lang')) facts.lang = stringOf(value('lang')) ?? facts.lang;
      if (value('region')) facts.region = stringOf(value('region')) ?? '';
    } else if (rule.name === 'heading' && value('numbering')) facts.headingNumbers = value('numbering').kind !== 'None';
    else if (rule.name === 'math.equation' || rule.name === 'figure') {
      if (rule.name === 'math.equation' && value('numbering')) facts.equationNumbers = value('numbering').kind !== 'None';
      facts.bySection ||= /by-section/.test(value('numbering')?.text ?? '');
    } else if (rule.name === 'bibliography') facts.bibTitle = markupText(value('title'));
    return;
  }
  if (node.kind === 'ShowRule') {
    if (/supplement:\s*\[Chapter\]/.test(node.text)) facts.report = true;
    // a template applied to the whole document, #show: conf.with(...), which LaTeX has no counterpart of
    if (significant(node)[1]?.kind === 'Colon' && ctx) ctx.note(st, node.text, 'The rule #' + node.text.split('\n')[0].trim() + ' styles the whole document with a function, which was left out.');
    return;
  }
  if (node.kind === 'ModuleImport') {
    const from = stringOf(node.children.find((c) => c.kind === 'Str'));
    // a package, kept for the pictures, which Typst compiles with it
    if (from?.startsWith('@')) facts.packages.push({ from, text: '#' + node.text, names: importedNames(node, from) });
    else if (from) facts.imports = [...(facts.imports ?? []), from];
    return;
  }
  if (node.kind === 'LetBinding') {
    const [, bound] = significant(node);
    const value = significant(node).at(-1);
    const like = bound?.kind === 'Ident' && callOf(value)?.name === 'theorem-like' ? callOf(value) : null;
    if (like) {
      const style = arg(like, 'head-style')?.text === 'emph' ? 'remark' : arg(like, 'body-style')?.text === 'emph' ? 'plain' : 'definition';
      facts.theorems.set(bound.text, { display: markupOf(arg(like, null, 0))?.text ?? bound.text, style });
      return;
    }
    const definition = definitionOf(node, facts);
    if (HOUSE.includes(definition.name)) {
      facts.house.add(definition.name);
      return;
    }
    // every definition goes with the pictures, which Typst compiles; the document's own are expanded where they are used
    facts.definitions.push('#' + node.text);
    if (definition.name) facts.functions.set(definition.name, definition);
  }
}

// ─── The pre-pass ───

function newState(file, source) {
  const st = { file, source, blocks: [], inlines: [], pieces: [], comments: [], body: false, depth: 0 };
  st.block = (record) => {
    st.blocks.push(record);
    return '\n\nSPXB' + (st.blocks.length - 1) + 'X\n\n';
  };
  // a comment inside a paragraph, a line of its own wherever pandoc puts it
  st.comment = (latex) => {
    st.comments.push(latex);
    return 'SPXC' + (st.comments.length - 1) + 'X';
  };
  // a token pandoc reads as a word in markup, and as a string in maths
  st.inline = (latex) => {
    st.inlines.push(latex);
    return 'SPXI' + (st.inlines.length - 1) + 'X';
  };
  // a construct that stays in its paragraph, as an equation does in LaTeX
  st.inlineBlock = (record) => {
    st.blocks.push(record);
    return 'SPXB' + (st.blocks.length - 1) + 'X';
  };
  return st;
}

/** The line of a node in its file; null for one from a function's expansion. */
const lineAt = (st, node) => (node.source === st.source ? st.source.slice(0, node.start).split('\n').length : null);

/**
 * One Typst file made ready for pandoc: { input, state }. The preamble's rules and definitions go into facts (the main
 * file's, which a chapter's own add to); every house construct is held as a block or a token.
 */
export function prepareTypst(source, ctx, { file }) {
  const st = newState(file, source);
  // a piece of markup pandoc writes on its own, which its construct puts in its place
  st.piece = (markup, block = false) => {
    st.pieces.push({ markup: pieceMarkup(markup, st, ctx).trim(), block });
    return st.pieces.length - 1;
  };
  const root = parseTypst(source);
  for (const error of findAll(root, (n) => n.kind === 'Error')) ctx.note(st, error.text, 'Typst reads this as an error (' + error.message + '), so it may not have come over as meant.');
  // paragraph by paragraph, each one's place in pandoc's input and in the source kept for the region markers
  const parts = [[]];
  for (const n of root.children) {
    if (n.kind === 'Parbreak') parts.push(n, []);
    else parts.at(-1).push(n);
  }
  let body = '';
  st.paragraphs = [];
  st.bodyNode = bodyStart(root.children);
  for (const part of parts) {
    if (!Array.isArray(part)) {
      body += part.text;
      continue;
    }
    const text = emit(part, st, ctx, true);
    const words = part.filter((n) => n.kind !== 'Space');
    if (words.length) st.paragraphs.push({ start: body.length, end: body.length + text.length, from: words[0].start, to: words.at(-1).end });
    body += text;
  }
  // the title, which \maketitle and \hypersetup print
  if (ctx.facts.title !== null && st.file === ctx.main) st.titlePiece = st.piece(ctx.facts.title);
  const pieces = st.pieces.map((p, n) => '\n\nSPXPIECESTART' + n + '\n\n' + p.markup + '\n\nSPXPIECEEND' + n + '\n').join('');
  return { input: body + '\n' + pieces, state: st };
}

/** What a piece is made of as pandoc's input: markup or a content block, a string, an equation, nodes, or markup's text. */
function pieceMarkup(markup, st, ctx) {
  if (markup === null || markup === undefined) return '';
  if (typeof markup === 'string') return emitText(markup, st, ctx);
  if (Array.isArray(markup)) return emit(markup, st, ctx);
  if (markupOf(markup)) return emit(markupOf(markup).children, st, ctx);
  if (markup.kind === 'Str') return emitText(markupText(markup), st, ctx);
  if (markup.kind === 'Equation') return maths(markup, st, ctx);
  return emitText('#' + markup.text, st, ctx);
}

/** Markup's text as pandoc's input, read with Typst's parser. */
const emitText = (text, st, ctx) => emit(parseTypst(text).children, st, ctx);

const QUIET = new Set(['Space', 'Parbreak', 'LineComment', 'BlockComment', 'Semicolon']);

/** A rule the body sets as it goes: a page's numbering alone, as a title page and the front matter have it, or the appendix's. */
function bodyRule(node) {
  if (node?.kind !== 'SetRule') return false;
  const rule = setRule(node);
  return (rule.name === 'page' && rule.args.length > 0 && rule.args.every((a) => a.name === 'numbering')) || (rule.name === 'heading' && /^"A/.test(arg(rule, 'numbering')?.text ?? ''));
}

/**
 * The first node of a file's body: past the last rule or definition before its first text, so the comments and the
 * page numbering just before the text, as a title page has them, are the body's. null for a file of definitions.
 */
function bodyStart(nodes) {
  let after = 0;
  for (let k = 0; k < nodes.length; k += 1) {
    if (QUIET.has(nodes[k].kind)) continue;
    if (nodes[k].kind !== 'Hash' || !STATEMENTS.has(nodes[k + 1]?.kind)) break;
    if (!bodyRule(nodes[k + 1])) after = k + 2;
    k += 1;
  }
  while (after < nodes.length && ['Space', 'Parbreak', 'Semicolon'].includes(nodes[after].kind)) after += 1;
  return nodes[after] ?? null;
}

/** A comment on a line of its own as LaTeX: between paragraphs a block, inside one a line of it. */
const comment = (text, between, st) => (between ? st.block({ kind: 'raw', latex: '% ' + text }) : st.comment('% ' + text));
/** Whether a comment starts its line, with only space before it. */
const ownLine = (node) => /^[ \t]*$/.test(node.source.slice(node.source.lastIndexOf('\n', node.start - 1) + 1, node.start));
/** Whether a space or paragraph break ends a line; the edge of the markup does too. */
const breaksLine = (node) => !node || node.kind === 'Parbreak' || (node.kind === 'Space' && node.text.includes('\n'));
/** Where a line of a title block or of pseudocode ends: a \, or the end of a source line. */
const lineEnd = (node) => node.kind === 'Linebreak' || node.kind === 'Parbreak' || (node.kind === 'Space' && node.text.includes('\n'));

/**
 * Markup nodes as pandoc's input: each house construct held as a block or a token, the document's own functions
 * expanded, rules and comments taken out, everything else as written. top: a file's own markup, where the statements
 * before its first text are the preamble's facts.
 */
function emit(markup, st, ctx, top = false) {
  const nodes = markup.slice();
  let out = '';
  // where the text is, which is where units are typed
  const prose = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (top && node === st.bodyNode) st.body = true;
    switch (node.kind) {
      case 'Hash': {
        const { text, next } = embedded(nodes, i, st, ctx, top);
        out += text;
        i = next - 1;
        break;
      }
      case 'Heading': {
        const { label, end } = labelAfter(nodes, i + 1);
        out += st.block({ kind: 'heading', level: node.children[0].text.length, numbered: ctx.facts.headingNumbers, title: st.piece(node.children.find((c) => c.kind === 'Markup')), label });
        i = end - 1;
        break;
      }
      case 'Equation': {
        // display maths: $ ... $ with a space inside each dollar, numbered as the preamble says
        if (node.children[1]?.kind === 'Space' && node.children.at(-2)?.kind === 'Space') {
          const { label, end } = labelAfter(nodes, i + 1);
          out += st.inlineBlock({ kind: 'equation', numbered: ctx.facts.equationNumbers, maths: st.piece(node), aligned: /&|\\\s/.test(node.text), label, line: lineAt(st, node) });
          i = end - 1;
        } else out += maths(node, st, ctx);
        break;
      }
      case 'Ref': {
        // @a @b and @a and @b, which become one command
        const run = [node];
        let and = false;
        let j = i + 1;
        for (;;) {
          let k = j;
          if (nodes[k]?.kind !== 'Space') break;
          const word = nodes[k + 1]?.kind === 'Text' && nodes[k + 1].text === 'and' && nodes[k + 2]?.kind === 'Space';
          k += word ? 3 : 1;
          if (nodes[k]?.kind !== 'Ref') break;
          and ||= word;
          run.push(nodes[k]);
          j = k + 1;
        }
        out += references(run, and, st, ctx);
        i = j - 1;
        break;
      }
      case 'Text':
      case 'Shorthand':
        prose.push([out.length, out.length + node.text.length]);
        out += node.text;
        break;
      case 'Strong':
      case 'Emph':
      case 'ListItem':
      case 'EnumItem':
      case 'TermItem':
        out += node.children.map((c) => (c.kind === 'Markup' ? emit(c.children, st, ctx) : c.text)).join('');
        break;
      case 'LineComment': {
        // a comment on a line of its own in the body comes over as one; any other goes, with its line
        const [before, after] = [nodes[i - 1], nodes[i + 1]];
        const own = breaksLine(before) && breaksLine(after);
        const text = node.text.replace(/^\/\/\s?/, '').trim();
        if (top && st.body && own && text) out += comment(text, !before || !after || before.kind === 'Parbreak' || after.kind === 'Parbreak', st);
        else if (own && after) {
          out += after.text.slice(after.text.indexOf('\n') + 1);
          i += 1;
        }
        break;
      }
      case 'BlockComment':
        break;
      default:
        out += node.text;
    }
  }
  return units(out, prose, st, ctx);
}

/** The label after a construct that ends before nodes[k], past spaces: { label, end }, end just past it. */
function labelAfter(nodes, k) {
  let j = k;
  while (nodes[j]?.kind === 'Space') j += 1;
  return nodes[j]?.kind === 'Label' ? { label: labelName(nodes[j]), end: j + 1 } : { label: null, end: k };
}

/** Whether the expression from nodes[i] up to nodes[end] is a paragraph of its own. */
function alone(nodes, i, end) {
  const quiet = (n) => n.kind === 'Space' || n.kind === 'LineComment' || n.kind === 'BlockComment' || n.kind === 'Semicolon' || n.kind === 'Label';
  let a = i - 1;
  while (a >= 0 && quiet(nodes[a])) a -= 1;
  let b = end;
  while (b < nodes.length && quiet(nodes[b])) b += 1;
  return (a < 0 || nodes[a].kind === 'Parbreak') && (b >= nodes.length || nodes[b].kind === 'Parbreak');
}

/**
 * References and citations: @label as \cref, @key as \parencite with its page supplement, a run of either as one
 * command; a key no .bib file has is left out.
 */
function references(run, and, st, ctx) {
  const parts = run.map((r) => ({ name: r.children[0].text.slice(1), supplement: markupOf(r.children.find((c) => c.kind === 'ContentBlock'))?.text ?? null }));
  const known = (p) => ctx.labels.has(p.name);
  if (parts.every(known)) {
    ctx.refsOut.push(...parts.map((p) => p.name));
    return st.inline('\\cref{' + parts.map((p) => p.name).join(',') + '}');
  }
  if (!parts.some(known) && !and) {
    const cited = parts.filter((p) => ctx.bibKeys.has(p.name));
    ctx.citesOut.push(...cited.map((p) => p.name));
    if (cited.length < parts.length) ctx.note(st, run[0].text, 'A citation of a key no .bib file has was left out: ' + parts.filter((p) => !ctx.bibKeys.has(p.name)).map((p) => p.name).join(', ') + '.');
    const page = cited.find((p) => p.supplement)?.supplement;
    return cited.length ? st.inline('\\parencite' + (page ? '[' + page + ']' : '') + '{' + cited.map((p) => p.name).join(',') + '}') : '';
  }
  // a run of both goes one at a time
  return st.inline(parts.map((p) => {
    if (known(p)) {
      ctx.refsOut.push(p.name);
      return '\\cref{' + p.name + '}';
    }
    if (!ctx.bibKeys.has(p.name)) return texText(p.name);
    ctx.citesOut.push(p.name);
    return '\\parencite' + (p.supplement ? '[' + p.supplement + ']' : '') + '{' + p.name + '}';
  }).join(and ? ' and ' : ' '));
}

/**
 * An embedded expression, #… with its hash at nodes[i], as pandoc's input: { text, next }, next the index past it. top:
 * in a file's own markup, where the comments on lines of their own inside an expression over several lines (a figure,
 * the title block) come over just before it.
 */
function embedded(nodes, i, st, ctx, top = false) {
  const node = nodes[i + 1];
  if (!node) return { text: '', next: i + 1 };
  if (STATEMENTS.has(node.kind)) return { text: statement(node, st, ctx), next: i + 2 + (nodes[i + 2]?.kind === 'Semicolon' ? 1 : 0) };
  const starts = nodes.slice(0, i).every((n) => QUIET.has(n.kind));
  const hoisted = top && st.body && node.kind !== 'ContentBlock' ? findAll(node, (n) => n.kind === 'LineComment' && ownLine(n)) : [];
  const before = hoisted.map((c) => c.text.replace(/^\/\/\s?/, '').trim()).filter(Boolean).map((c) => comment(c, starts, st) + (starts ? '' : '\n')).join('');
  const { text, next } = expression(nodes, i, st, ctx, top);
  return { text: before + text, next };
}

/** An embedded expression as embedded has it, without the comments it holds. */
function expression(nodes, i, st, ctx, top) {
  const node = nodes[i + 1];
  const semicolon = nodes[i + 2]?.kind === 'Semicolon';
  const next = i + 2 + (semicolon ? 1 : 0);
  switch (node.kind) {
    case 'ModuleInclude':
      return { text: st.block({ kind: 'include', path: ctx.include(st, stringOf(node.children.find((c) => c.kind === 'Str'))) }), next };
    case 'FuncCall':
      return embeddedCall(nodes, i, st, ctx);
    case 'ContentBlock': {
      const inner = markupOf(node).children;
      // a table that may run across pages, as the house writes xltabular: #[ #show figure: set block(breakable: true) #figure(table(…)) ]
      const breakable = inner.some((n) => n.kind === 'ShowRule' && /^show\s+figure\s*:\s*set\s+block\(\s*breakable\s*:\s*true\s*\)$/.test(n.text));
      const at = inner.findIndex((n, k) => inner[k - 1]?.kind === 'Hash' && callOf(n)?.name === 'figure' && callOf(arg(callOf(n), null, 0))?.name === 'table');
      if (breakable && at !== -1) {
        const table = figureRecord(callOf(inner[at]), st, ctx);
        table.model.env = 'xltabular';
        return { text: st.block({ ...table, label: labelAfter(inner, at + 1).label, line: lineAt(st, inner[at]) }), next };
      }
      return { text: emit(inner, st, ctx, top), next };
    }
    case 'Ident': {
      const def = ctx.facts.functions.get(node.text);
      // a function named but not called prints nothing worth having
      if (def?.params) return { text: '', next };
      if (def && !def.simple) return { text: pictureOf(node, !alone(nodes, i, next), 'the value ' + node.text + ' the document works out', st, ctx), next };
      if (def) return { text: valueMarkup(def, st, ctx), next };
      if (packageOf(node.text, ctx.facts)) return { text: pictureOf(node, !alone(nodes, i, next), 'what ' + packageOf(node.text, ctx.facts) + ' gives for ' + node.text, st, ctx), next };
      break;
    }
    case 'CodeBlock':
    case 'Contextual':
    case 'Conditional':
    case 'ForLoop':
    case 'WhileLoop':
      return { text: pictureOf(node, !alone(nodes, i, next), 'the output of Typst scripting', st, ctx), next };
  }
  return { text: '#' + code(node, st, ctx) + (semicolon ? ';' : ''), next };
}

/** A value of the document's own as the markup it stands for. */
const valueMarkup = (def, st, ctx) => (def.body.kind === 'ContentBlock' ? emit(markupOf(def.body).children, st, ctx) : def.body.kind === 'Str' ? emitText(markupText(def.body), st, ctx) : '#' + code(def.body, st, ctx));

/** A statement in markup: the preamble's are read as facts; in the body a page numbering or the appendix's is a block. */
function statement(node, st, ctx) {
  if (st.body && node.kind === 'SetRule') {
    const rule = setRule(node);
    if (rule.name === 'page' && arg(rule, 'numbering')) return st.block({ kind: 'numbering', style: stringOf(arg(rule, 'numbering')) });
    if (rule.name === 'heading' && /^"A/.test(arg(rule, 'numbering')?.text ?? '')) return st.block({ kind: 'appendix' });
    return '';
  }
  if (!(st.body && node.kind === 'ShowRule')) readStatement(node, ctx.facts, st, ctx);
  return '';
}

/** A call embedded in markup: a house construct, an inline command, the document's own function or a package's. */
function embeddedCall(nodes, i, st, ctx) {
  const node = nodes[i + 1];
  const call = callOf(node);
  const semicolon = nodes[i + 2]?.kind === 'Semicolon';
  const next = i + 2 + (semicolon ? 1 : 0);
  const record = construct(call, st, ctx);
  if (record) {
    const { label, end } = labelAfter(nodes, i + 2);
    const held = { ...record, label: record.label ?? label, line: lineAt(st, node) };
    return { text: record.kind === 'equation' ? st.inlineBlock(held) : st.block(held), next: label ? end : next };
  }
  const inline = inlineCall(call, nodes, i + 2, st, ctx);
  if (inline) return { text: inline.text, next: inline.next ?? next };
  const def = call.name && ctx.facts.functions.get(call.name);
  if (def?.params) {
    const expanded = def.simple && st.depth < 8 ? userCall(def, call, st, ctx) : null;
    if (expanded !== null) return { text: expanded, next };
    // a function with logic: the text given to it, or a picture of what it makes from none
    const contents = [...call.args.filter((a) => a.value.kind === 'ContentBlock').map((a) => a.value), ...call.bodies];
    if (!contents.length) return { text: pictureOf(node, !alone(nodes, i, next), 'the output of the document’s own function ' + call.name, st, ctx), next };
    ctx.note(st, node.text, 'The document’s own function ' + call.name + ' does more than Spectrum can write in LaTeX, so only the text given to it was kept.');
    return { text: contents.map((c) => emit(markupOf(c).children, st, ctx)).join(' '), next };
  }
  const from = call.name && packageOf(call.name, ctx.facts);
  if (from) return { text: pictureOf(node, !alone(nodes, i, next), 'a drawing made with ' + from, st, ctx), next };
  return { text: '#' + code(node, st, ctx) + (semicolon ? ';' : ''), next };
}

/** What LaTeX can't have, compiled by Typst into a picture: in its line, or a block of its own. */
function pictureOf(node, inline, what, st, ctx) {
  ctx.pictures.push({ body: node.text, file: st.file, what });
  const record = { kind: 'picture', picture: ctx.pictures.length - 1, inline };
  return inline ? st.inlineBlock(record) : st.block(record);
}

/**
 * Code as pandoc's input: its content blocks read as markup, the document's own values and functions put in and a
 * package's calls as pictures, so pandoc never meets a name it doesn't know.
 */
function code(node, st, ctx, parent = null, index = 0) {
  if (node.kind === 'ContentBlock') return '[' + emit(markupOf(node).children, st, ctx) + ']';
  if (node.kind === 'LineComment' || node.kind === 'BlockComment') return '';
  const own = !(parent?.kind === 'Named' && index === 0) && !(parent?.kind === 'FieldAccess' && index > 0);
  if (own && node.kind === 'Ident') {
    const def = ctx.facts.functions.get(node.text);
    if (def && !def.params && def.simple) return '(' + code(def.body, st, ctx) + ')';
  }
  if (node.kind === 'FuncCall') {
    const call = callOf(node);
    const def = call.name && ctx.facts.functions.get(call.name);
    const expanded = def?.params && def.simple && st.depth < 8 ? userCall(def, call, st, ctx) : null;
    if (expanded !== null) return '[' + expanded + ']';
    const from = call.name && packageOf(call.name, ctx.facts);
    if (from || def) return '[' + pictureOf(node, true, from ? 'a drawing made with ' + from : 'the output of the document’s own function ' + call.name, st, ctx) + ']';
  }
  if (!node.children) return node.text;
  return node.children.map((c, k) => code(c, st, ctx, node, k)).join('');
}

// what may stand in for a parameter without brackets around it
const ATOMIC = new Set(['ContentBlock', 'Str', 'Ident', 'FieldAccess', 'FuncCall', 'Numeric', 'Int', 'Float', 'Bool', 'None', 'Auto', 'Parenthesized', 'Array', 'Dict', 'Label', 'CodeBlock', 'Raw']);

/** A call of the document's own simple function as the markup it stands for, read again; null when its arguments don't fit. */
function userCall(def, call, st, ctx) {
  const params = significant(def.params).filter((p) => p.kind === 'Ident' || p.kind === 'Named');
  const positional = [...call.args.filter((a) => a.name === null).map((a) => a.value), ...call.bodies];
  const bound = new Map();
  for (const p of params) {
    if (p.kind === 'Ident') bound.set(p.text, positional.shift());
    else bound.set(p.children[0].text, arg(call, p.children[0].text) ?? significant(p)[2]);
  }
  if (positional.length || [...bound.values()].some((v) => !v)) return null;
  // each parameter's use, not a named argument's name or a field's, takes the argument's code
  const fill = (node, parent = null, index = 0) => {
    if (node.kind === 'Ident' && bound.has(node.text) && !(parent?.kind === 'Named' && index === 0) && !(parent?.kind === 'FieldAccess' && index > 0)) {
      const value = bound.get(node.text);
      return ATOMIC.has(value.kind) ? value.text : '(' + value.text + ')';
    }
    return node.children ? node.children.map((c, k) => fill(c, node, k)).join('') : node.text;
  };
  const text = fill(def.body);
  const markup = def.body.kind === 'ContentBlock' ? text.slice(1, -1) : '#' + (ATOMIC.has(def.body.kind) ? text : '(' + text + ')');
  st.depth += 1;
  const out = emitText(markup, st, ctx);
  st.depth -= 1;
  return out;
}

/** The calls that stay in their line: #cite, #ref, #h, #v, a full-width #line, today's date and the house \Call; { text, next } or null. */
function inlineCall(call, nodes, next, st, ctx) {
  if (/^datetime\.today\(\)/.test(call.node.text)) return { text: st.inline('\\today') };
  switch (call.name) {
    case 'cite':
    case 'ref': {
      const target = arg(call, null, 0);
      const key = labelName(target) ?? (callOf(target)?.name === 'label' ? stringOf(arg(callOf(target), null, 0)) : null);
      if (!key) return null;
      const form = arg(call, 'form');
      if (call.name === 'ref') {
        ctx.refsOut.push(key);
        return { text: st.inline((stringOf(form) === 'page' ? '\\pageref{' : '\\cref{') + key + '}') };
      }
      if (!ctx.bibKeys.has(key)) {
        ctx.note(st, call.node.text, 'A citation of ' + key + ', which no .bib file has, was left out.');
        return { text: '' };
      }
      ctx.citesOut.push(key);
      const supplement = markupOf(arg(call, 'supplement'))?.text;
      const command = form?.kind === 'None' ? 'nocite' : { prose: 'textcite', author: 'citeauthor', year: 'citeyear', full: 'fullcite' }[stringOf(form)] ?? 'parencite';
      return { text: st.inline('\\' + command + (supplement ? '[' + supplement + ']' : '') + '{' + key + '}') };
    }
    case 'h':
    case 'v': {
      const length = arg(call, null, 0)?.text ?? '';
      if (length === '1fr') return { text: st.inline(call.name === 'h' ? '\\hfill' : '\\vfill') };
      const tex = texLength(length);
      return { text: tex ? st.inline((call.name === 'h' ? '\\hspace{' : '\\vspace{') + tex + '}') : '' };
    }
    case 'line':
      return arg(call, 'length')?.text === '100%' ? { text: st.inline('\\rule{\\linewidth}{0.4pt}') } : null;
    case 'smallcaps': {
      const name = markupOf(call.bodies[0])?.text;
      if (name === undefined || call.args.length) return null;
      // #smallcaps[F]$(args)$, a \Call with its arguments in maths
      const after = nodes[next];
      const only = after?.kind === 'Equation' ? significant(after.children.find((c) => c.kind === 'Math')) : [];
      if (only.length === 1 && only[0].kind === 'MathDelimited' && only[0].children[0].text === '(') {
        return { text: st.inline('\\Call{' + name + '}{') + '$' + only[0].children.slice(1, -1).map((c) => c.text).join('') + '$' + st.inline('}'), next: next + 1 };
      }
      // #smallcaps[F];(args) or #smallcaps[F]; (args), the house \Call: its name and brackets as tokens, its arguments as they are
      let at = next + 1;
      if (nodes[next]?.kind !== 'Semicolon') return null;
      if (nodes[at]?.kind === 'Space' && !nodes[at].text.includes('\n')) at += 1;
      const open = nodes[at];
      if (open?.kind !== 'Text' || !open.text.startsWith('(')) return null;
      let depth = 0;
      for (let j = at; j < nodes.length; j += 1) {
        if (nodes[j].kind !== 'Text') continue;
        for (let k = nodes[j].start; k < nodes[j].end; k += 1) {
          const ch = nodes[j].source[k];
          if (ch === '(') depth += 1;
          else if (ch === ')' && (depth -= 1) === 0) {
            const inner = open.source.slice(open.start + 1, k);
            // the text after the bracket stays for the markup that follows
            nodes.splice(at, j - at + 1, ...(k + 1 < nodes[j].end ? [leaf('Text', nodes[j].source, k + 1, nodes[j].end)] : []));
            return { text: st.inline('\\Call{' + name + '}{') + emitText(inner, st, ctx) + st.inline('}'), next: at };
          }
        }
      }
      return null;
    }
  }
  return null;
}

/** An equation as pandoc's input: the house \Call's name and brackets as string tokens, each typed quantity one token. */
function maths(node, st, ctx) {
  const write = (n) => {
    if (!n.children) return n.text;
    let text = '';
    for (let k = 0; k < n.children.length; k += 1) {
      const c = n.children[k];
      const call = c.kind === 'Hash' ? callOf(n.children[k + 1]) : null;
      const name = call?.name === 'smallcaps' && !call.args.length ? markupOf(call.bodies[0])?.text : undefined;
      let at = k + 2 + (n.children[k + 2]?.kind === 'Semicolon' ? 1 : 0);
      if (at > k + 2 && n.children[at]?.kind === 'Space') at += 1;
      const delimited = n.children[at];
      if (name !== undefined && delimited?.kind === 'MathDelimited' && delimited.children[0].text === '(') {
        text += '"' + st.inline('\\Call{' + name + '}{') + '"' + delimited.children.slice(1, -1).map(write).join('') + '"' + st.inline('}') + '"';
        k = at;
        continue;
      }
      text += write(c);
    }
    return text;
  };
  return mathsUnits(write(node), st, ctx);
}

/** The LaTeX size command nearest a Typst text size (12pt, 1.2em) in a document of base pt; '' at the base size. */
function latexSize(size, base) {
  const m = /^(\d*\.?\d+)(pt|em)$/.exec(String(size ?? '').trim());
  if (!m) return '';
  const pt = Number(m[1]) * (m[2] === 'em' ? base : 1);
  const sizes = [['\\footnotesize', 8], ['\\small', 9.5], ['', base], ['\\large', 12], ['\\Large', 14.4], ['\\LARGE', 17.28], ['\\huge', 20.74], ['\\Huge', 24.88]];
  return sizes.reduce((best, s) => (Math.abs(s[1] - pt) < Math.abs(best[1] - pt) ? s : best))[0];
}

/** Nodes split into runs where at(node) holds, without those nodes. */
function splitAt(nodes, at) {
  const out = [[]];
  for (const n of nodes) {
    if (at(n)) out.push([]);
    else out.at(-1).push(n);
  }
  return out;
}
const filled = (line) => line.some((n) => !['Space', 'LineComment', 'BlockComment'].includes(n.kind));

/** Whether markup (a node or nodes) prints the document's title with #title(). */
const titled = (markup) => [].concat(markup).some((n) => findAll(n, (m) => callOf(m)?.name === 'title' && !callOf(m).args.length).length > 0);

/** A line that is one #v(…): its length; null for any other. */
function spaceOf(line) {
  const nodes = line.filter((n) => n.kind !== 'Space');
  const call = nodes.length === 2 && nodes[0].kind === 'Hash' ? callOf(nodes[1]) : null;
  return call?.name === 'v' ? arg(call, null, 0)?.text ?? '' : null;
}

/** A line of a title page: { space } for a #v(…), else the title or a text piece, with the size and weight a #text gives. */
function titleItem(line, st) {
  const space = spaceOf(line);
  if (space !== null) return { space };
  const nodes = line.filter((n) => n.kind !== 'Space');
  const call = nodes.length === 2 && nodes[0].kind === 'Hash' && callOf(nodes[1])?.name === 'text' ? callOf(nodes[1]) : null;
  const title = titled(line);
  return { title, size: arg(call, 'size')?.text ?? null, bold: /bold/.test(arg(call, 'weight')?.text ?? ''), italic: /italic/.test(arg(call, 'style')?.text ?? ''), text: title ? null : st.piece(call ? call.bodies[0] ?? arg(call, null, 0) : line) };
}

/** A title block's lines, at \\ or a line's end, each #v(…) that starts one a line of its own. */
const titleLines = (markup) => splitAt(markup.children, lineEnd).filter(filled).flatMap((line) => {
  const out = [];
  let k = line.findIndex((n) => n.kind !== 'Space');
  while (line[k]?.kind === 'Hash' && callOf(line[k + 1])?.name === 'v' && filled(line.slice(k + 2))) {
    out.push(line.slice(k, k + 2));
    k += 2;
    while (line[k]?.kind === 'Space') k += 1;
  }
  return [...out, line.slice(k)];
});

/** A count of columns: columns: 3, or (1fr, auto, 1fr); fallback for anything else. */
const columnCount = (node, fallback) => (node?.kind === 'Int' ? Number(node.text) : node?.kind === 'Array' ? listed(node).length : fallback);
/** The items of an array, without its brackets and commas. */
const listed = (node) => significant(node).filter((c) => !['LeftParen', 'RightParen', 'Comma'].includes(c.kind));

/** A call that is a house construct, as its record; null for anything pandoc writes itself. */
function construct(call, st, ctx) {
  switch (call.name) {
    case 'figure':
      return figureRecord(call, st, ctx);
    case 'grid':
      return gridRecord(call, st, ctx);
    case 'table':
      return tableRecord(call, null, st, ctx);
    case 'math.equation': {
      const maths = call.args.find((a) => a.name === null && a.value.kind === 'Equation')?.value;
      if (!maths || arg(call, 'block')?.text !== 'true') return null;
      const numbering = arg(call, 'numbering');
      return { kind: 'equation', numbered: numbering ? numbering.kind !== 'None' : ctx.facts.equationNumbers, maths: st.piece(maths), aligned: /&|\\\s/.test(maths.text) };
    }
    case 'heading':
      return { kind: 'heading', level: Number(arg(call, 'level')?.text ?? 1), numbered: arg(call, 'numbering')?.kind !== 'None', title: st.piece(call.bodies[0] ?? arg(call, null, 0)) };
    case 'align': {
      const markup = markupOf(call.bodies[0] ?? arg(call, null, 1));
      if (!markup || !titled(markup)) return null;
      const lines = titleLines(markup);
      // a title page fills a page of its own: centred down it, or with space pushing its foot down
      if (/horizon/.test(arg(call, null, 0)?.text ?? '') || lines.some((l) => spaceOf(l) === '1fr')) return { kind: 'titlepage', items: lines.map((l) => titleItem(l, st)) };
      // the title block: the title, then the author and date lines
      return { kind: 'maketitle', lines: lines.filter((l) => !titled(l) && spaceOf(l) === null).map((l) => st.piece(l)) };
    }
    case 'page': {
      // the title page the converter writes: #page(numbering: none)[#align(center)[...]]
      const inner = significant(markupOf(call.bodies[0]));
      const centred = inner.length === 2 && inner[0].kind === 'Hash' && callOf(inner[1])?.name === 'align' && arg(callOf(inner[1]), null, 0)?.text === 'center' ? callOf(inner[1]) : null;
      const markup = markupOf(centred?.bodies[0]);
      if (!markup || arg(call, 'numbering')?.kind !== 'None') return null;
      return { kind: 'titlepage', items: titleLines(markup).map((l) => titleItem(l, st)) };
    }
    case 'outline': {
      const target = arg(call, 'target')?.text ?? '';
      return { kind: /kind:\s*image/.test(target) ? 'listoffigures' : /kind:\s*table/.test(target) ? 'listoftables' : 'tableofcontents' };
    }
    case 'bibliography':
      ctx.bibliography = stringOf(arg(call, null, 0)) ?? 'refs.bib';
      return { kind: 'bibliography' };
    case 'pagebreak':
      return { kind: 'raw', latex: '\\clearpage' };
    case 'proof':
    case 'solution':
      return { kind: 'theorem', name: call.name, title: arg(call, 'name') ? st.piece(arg(call, 'name')) : null, body: st.piece(call.bodies[0] ?? arg(call, null, 0), true) };
    case null:
      // the counts an appendix or new page numbering starts again, which LaTeX's own commands do
      return /^counter\([\s\S]*\)\.update\(/.test(call.node.text) ? { kind: 'raw', latex: '' } : null;
    default:
      if (ctx.facts.theorems.has(call.name)) {
        ctx.used.add('theorem:' + call.name);
        return { kind: 'theorem', name: call.name, title: arg(call, 'title') ? st.piece(arg(call, 'title')) : null, body: st.piece(call.bodies[0] ?? arg(call, null, 0), true) };
      }
      return null;
  }
}

/** A Typst image call's path and its size as the table tool's FigureSize, or null. */
function imageOf(node) {
  const outer = callOf(node);
  const scaled = outer?.name === 'scale' && arg(outer, 'reflow')?.text === 'true' ? /^(\d+(?:\.\d+)?)%$/.exec(arg(outer, null, 0)?.text ?? '') : null;
  const call = callOf(scaled ? arg(outer, null, 1) : node);
  const path = call?.name === 'image' ? stringOf(arg(call, null, 0)) : null;
  if (!path) return null;
  const width = arg(call, 'width')?.text;
  const height = arg(call, 'height')?.text;
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

/** The panels made with name (subfigure or figure) in a grid's cell: { path, caption, label } each. */
function panelsOf(cell, name, st, ctx) {
  const nodes = markupOf(cell)?.children ?? [];
  return nodes.flatMap((n, k) => {
    const call = n.kind === 'Hash' ? callOf(nodes[k + 1]) : null;
    if (call?.name !== name) return [];
    const img = imageOf(arg(call, null, 0));
    if (img) ctx.images.add(img.path);
    return [{ path: img?.path ?? '', caption: arg(call, 'caption') ? st.piece(arg(call, 'caption')) : null, label: labelAfter(nodes, k + 2).label ?? '' }];
  });
}

/** A figure: an image, a table, a listing, pseudocode, sub-figures, a composer diagram, or a drawing in Typst. */
function figureRecord(call, st, ctx) {
  const body = arg(call, null, 0);
  if (!body) return null;
  const caption = arg(call, 'caption') ? st.piece(arg(call, 'caption')) : null;
  const placement = { auto: 'tbp', top: 't', bottom: 'b' }[arg(call, 'placement')?.text] ?? 'ht';
  const kind = stringOf(arg(call, 'kind')) ?? arg(call, 'kind')?.text;
  if (kind === 'algorithm') return algorithmRecord(body, caption, placement, st, ctx);
  if (body.kind === 'Raw') {
    const m = /^```(\w*)\n?([\s\S]*?)\n?\s*```$/.exec(body.text.trim());
    ctx.used.add('code');
    return { kind: 'listing', language: TYPST_LANGUAGES[(m?.[1] ?? '').toLowerCase()] ?? m?.[1] ?? '', code: m ? dedent(m[2]) : '', caption };
  }
  const image = imageOf(body);
  if (image) {
    ctx.images.add(image.path);
    return { kind: 'figure', layout: 'image', path: image.path, size: image.size, caption, placement };
  }
  const inner = callOf(body);
  if (inner?.name === 'table') return tableRecord(inner, { caption, placement }, st, ctx);
  // notes under a table, in the figure's content: [ #table(...) #text(size: 0.9em)[#super[a] ...] ]
  const content = markupOf(body)?.children ?? [];
  const at = content.findIndex((n, k) => content[k - 1]?.kind === 'Hash' && callOf(n)?.name === 'table');
  if (at !== -1) {
    const notes = content.slice(at + 1).filter((n, k, all) => all[k - 1]?.kind === 'Hash' && callOf(n)?.name === 'text').map((n) => {
      const text = callOf(n);
      const nodes = markupOf(text.bodies[0] ?? arg(text, null, 0))?.children ?? [];
      const first = nodes.findIndex((c) => c.kind !== 'Space');
      const mark = nodes[first]?.kind === 'Hash' && callOf(nodes[first + 1])?.name === 'super' ? callOf(nodes[first + 1]) : null;
      return { mark: mark ? markupOf(mark.bodies[0])?.text ?? '' : '', text: st.piece(mark ? nodes.slice(first + 2) : nodes) };
    });
    return tableRecord(callOf(content[at]), { caption, placement, notes }, st, ctx);
  }
  if (inner?.name === 'grid' && findAll(body, (n) => callOf(n)?.name === 'subfigure').length) {
    ctx.used.add('subfigure');
    const panels = inner.args.filter((a) => a.name === null).flatMap((a) => panelsOf(a.value, 'subfigure', st, ctx));
    const align = arg(inner, 'align')?.text ?? 'bottom';
    return { kind: 'figure', layout: 'sub', panels, columns: columnCount(arg(inner, 'columns'), panels.length), align: align === 'top' ? 'top' : align === 'horizon' ? 'centre' : 'bottom', caption, placement };
  }
  // anything else is drawn in Typst: a composer diagram or shapes, compiled to a picture
  const include = body.kind === 'ModuleInclude' ? stringOf(body.children.find((c) => c.kind === 'Str')) : null;
  ctx.pictures.push(include ? { include: include.replace(/^\/+/, ''), file: st.file } : { body: body.text, file: st.file });
  return { kind: 'figure', layout: 'picture', picture: ctx.pictures.length - 1, caption, placement };
}

const dedent = (code) => {
  const lines = code.replace(/^\n/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n').replace(/\s+$/, '');
};

/** A grid of separate figures, a CV-style line of text with something on the right, or a plain grid as a tabular. */
function gridRecord(call, st, ctx) {
  const cells = call.args.filter((a) => a.name === null).map((a) => a.value);
  const figureIn = (cell) => {
    const nodes = significant(markupOf(cell));
    return nodes[0]?.kind === 'Hash' && callOf(nodes[1])?.name === 'figure';
  };
  if (cells.length && cells.every(figureIn)) {
    const panels = cells.flatMap((c) => panelsOf(c, 'figure', st, ctx));
    return { kind: 'figure', layout: 'separate', panels, columns: panels.length, caption: null, placement: 'ht', keepsLabel: false };
  }
  const columns = arg(call, 'columns');
  // a cell's markup: a content block's, or that of the align(...) around it
  const cellMarkup = (c) => markupOf(c) ?? (callOf(c)?.name === 'align' ? markupOf(callOf(c).bodies[0] ?? arg(callOf(c), null, 1)) : null);
  if (columns?.kind === 'Array' && /^\(\s*1fr\s*,\s*auto\s*\)$/.test(columns.text) && cells.length === 2) {
    // what on the left and what on the right, each line of the two side by side
    const lines = (c) => (cellMarkup(c) ? splitAt(cellMarkup(c).children, (n) => n.kind === 'Linebreak').map((l) => (filled(l) ? l : null)) : [c]);
    const [left, right] = cells.map(lines);
    return { kind: 'sides', lines: Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [left[i] ? st.piece(left[i]) : null, right[i] ? st.piece(right[i]) : null]) };
  }
  return { kind: 'grid', columns: columnCount(columns, 1), cells: cells.map((c) => st.piece(cellMarkup(c) ?? c)) };
}

/**
 * A Typst table into the table tool's model: its cells pieces, its rules from table.hline (at y: or between rows, from
 * start to end), table.header's rows as the header, table.cell's spans as merges, and right-aligned numbers as S columns.
 */
function tableRecord(call, float, st, ctx) {
  const columns = arg(call, 'columns');
  const widths = columns?.kind === 'Int' ? Array(Number(columns.text)).fill('auto') : columns?.kind === 'Array' ? listed(columns).map((c) => c.text) : ['auto'];
  const cols = widths.length;
  const alignArg = arg(call, 'align');
  const word = (node) => /^\w+/.exec(node?.text ?? '')?.[0] ?? 'left';
  const aligns = alignArg?.kind === 'Array' ? listed(alignArg).map(word) : Array(cols).fill(word(alignArg));
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
  const place = (node, colspan = 1, rowspan = 1) => {
    const at = free();
    const [r, c] = [Math.floor(at / cols), at % cols];
    for (let i = 0; i < rowspan; i += 1) for (let j = 0; j < colspan; j += 1) taken.add((r + i) * cols + c + j);
    while (grid.length < r + rowspan) grid.push(Array(cols).fill(null));
    grid[r][c] = { node, markup: (markupOf(node)?.text ?? (node ? '#' + node.text : '')).trim() };
    if (colspan > 1 || rowspan > 1) merges.push({ r, c, rows: rowspan, cols: colspan });
  };
  const number = (sub, name, fallback) => {
    const n = arg(sub, name);
    return n?.kind === 'Int' ? Number(n.text) : fallback;
  };
  const visit = (items) => {
    for (const item of items) {
      if (item.name !== null) continue;
      const sub = callOf(item.value);
      const kind = /^table\.(hline|vline|header|footer|cell)$/.exec(sub?.name ?? '')?.[1];
      if (!kind) {
        place(item.value);
        continue;
      }
      if (kind === 'hline') {
        // end: none, as end left out, runs to the last column
        const edge = number(sub, 'y', rowOfNext());
        const start = number(sub, 'start', 0);
        const end = number(sub, 'end', cols);
        const list = rules.get(edge) ?? [];
        list.push(start === 0 && end >= cols ? 'full' : [start, Math.min(end, cols) - 1]);
        rules.set(edge, list);
      } else if (kind === 'header' || kind === 'footer') {
        visit(sub.args);
        if (kind === 'header') header = Math.max(header, rowOfNext());
      } else if (kind === 'cell') {
        place(sub.bodies[0] ?? arg(sub, null, 0), number(sub, 'colspan', 1), number(sub, 'rowspan', 1));
      }
    }
  };
  visit(call.args);
  const rows = grid.length;
  // a right-aligned column of numbers lines up on the decimal point, an S column
  const plain = (m) => m?.markup.replace(/^\\?-/, '-') ?? '';
  const numeric = (j) => aligns[j] === 'right' && grid.slice(header).every((row) => !row[j] || /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/.test(plain(row[j])));
  const align = widths.map((w, j) => (w.endsWith('fr') ? 'X' : numeric(j) && grid.slice(header).some((row) => row[j]) ? 'S' : { left: 'l', center: 'c', right: 'r', start: 'l', end: 'r' }[aligns[j]] ?? 'l'));
  const cells = grid.map((row, r) => row.map((cell, j) => {
    if (!cell) return null;
    if (align[j] === 'S' && r >= header) {
      const markup = plain(cell).replace(/,/g, '');
      return markup ? st.piece(markup) : null;
    }
    return cell.markup ? st.piece(cell.node) : null;
  }));
  const full = (i) => (rules.get(i) ?? []).includes('full');
  const preset = (i) => i === 0 || i === rows || (header > 0 && i === 1);
  const edges = tableEdges(rows, cols, header > 0).h;
  const toggled = edges.filter((_, i) => full(i) !== preset(i));
  const partRules = [...rules].filter(([i]) => i > 0 && !full(i)).flatMap(([i, list]) => list.filter(Array.isArray).map(([from, to]) => ({ row: i - 1, from, to })));
  ctx.used.add('table');
  const booktabs = arg(call, 'stroke')?.kind === 'None';
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
  const align = callOf(body)?.name === 'align' ? callOf(body) : null;
  const markup = markupOf(body) ?? markupOf(align?.bodies[0] ?? arg(align, null, 1));
  // each item of the list a line, and the lines before it as they break
  const texts = [];
  let line = '';
  const flush = () => {
    if (line.trim()) texts.push(line.trim());
    line = '';
  };
  for (const n of markup?.children ?? []) {
    if (n.kind === 'EnumItem' || n.kind === 'ListItem') {
      flush();
      texts.push(n.text.replace(/\s*\n\s*/g, ' ').trim());
    } else if (lineEnd(n)) flush();
    else line += n.text;
  }
  flush();
  const lines = [];
  const open = [];
  // the blocks opened at this level or deeper end here
  const close = (level) => {
    while (open.length && open[open.length - 1].level >= level) {
      const block = open.pop();
      lines.push({ command: 'End' + block.kind, level: block.level });
    }
  };
  for (const raw of texts) {
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

// ─── Inline: units ───

const QUANTITY = /(\(?[-+±−]?\d[\d,]*(?:\.\d+)?(?:~±~\d+(?:\.\d+)?\))?|\$[^$]*times\s*10\^\(?-?\d+\)?\$)~([^\s,;:!?\])}"'<]+?)(?=[\s,;:!?\])}"'<]|\.(?:\s|$)|$)/g;
const ANGLE = /(?<![\p{L}\p{N}.,~])(\d+(?:\.\d+)?)°(?![\p{L}\p{N}C])/gu;
const GROUPED = /(?<![\p{L}\p{N}.,~\\])(\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?![\p{L}\p{N},~]|\.\d)/gu;

/**
 * Typed quantities, comma-grouped numbers and angles in markup as tokens of their siunitx: each must start in text
 * (prose: where the text is), or be a power of ten in maths before its ~.
 */
function units(text, prose, st, ctx) {
  const inProse = (index) => prose.some(([s, e]) => index >= s && index < e);
  const edits = [];
  const take = (pattern, make) => {
    for (const m of text.matchAll(pattern)) {
      const end = m.index + m[0].length;
      if (edits.some((e) => m.index < e.end && end > e.start)) continue;
      const latex = make(m);
      if (latex) edits.push({ start: m.index, end, latex });
    }
  };
  take(QUANTITY, (m) => {
    const [, number, unit] = m;
    if (!inProse(m.index) && !/^\$/.test(number)) return null;
    const n = typedNumber(number.replace(/^\$|\$$/g, ''));
    const u = typedUnit(unit);
    return n !== null && u ? '\\qty{' + n + '}{' + u + '}' : null;
  });
  take(ANGLE, (m) => (inProse(m.index) ? '\\ang{' + m[1] + '}' : null));
  take(GROUPED, (m) => (inProse(m.index) ? '\\num{' + m[1].replace(/,/g, '') + '}' : null));
  if (edits.length) ctx.units = true;
  edits.sort((a, b) => a.start - b.start);
  let out = '';
  let last = 0;
  for (const e of edits) {
    out += text.slice(last, e.start) + st.inline(e.latex);
    last = e.end;
  }
  return out + text.slice(last);
}

/** Quantities in maths, 4.7 thin "kΩ" and #[4.7~kΩ], as string tokens: the token is one atom already. */
function mathsUnits(maths, st, ctx) {
  const unit = (latex) => {
    ctx.units = true;
    return st.inline(latex);
  };
  return maths
    .replace(/#\[([^\]]*)\]/g, (whole, inner) => {
      const q = /^(.+?)~(.+)$/.exec(inner);
      const n = q && typedNumber(q[1]);
      const u = q && typedUnit(q[2]);
      return n !== null && n !== undefined && u ? '"' + unit('\\qty{' + n + '}{' + u + '}') + '"' : typedNumber(inner) !== null ? '"' + unit('\\num{' + typedNumber(inner) + '}') + '"' : whole;
    })
    // a quantity in brackets of its own, (13 thin "V/µs") / ..., loses them
    .replace(/(\()?\s*((?:\(\s*)?(?:plus\.minus\s*)?\d[\d.]*(?:\s*plus\.minus\s*\d[\d.]*)?(?:\s*\))?(?:\s*times\s*10\^\(?-?\d+\)?)?)\s+thin\s+"([^"]+)"\s*(\))?/g, (whole, open, number, symbols, close) => {
      const n = typedNumber(number.replace(/plus\.minus/g, '±'));
      const u = typedUnit(symbols);
      if (n === null || !u) return whole;
      const token = '"' + unit('\\qty{' + n + '}{' + u + '}') + '"';
      return open && close ? token : (open ?? '') + token + (close ?? '');
    });
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
  out = inlineCode(out, ctx);
  out = out.replace(/([^\n]*?)[ \t]*SPXC(\d+)X[ \t]*([^\n]*)/g, (_, before, n, after) => [before, st.comments[n], after].filter((s) => s.trim()).join('\n'));
  // a new page once: after a title page, which ends its own, or where a #pagebreak and new numbering meet
  out = out.replace(/((?:\\end\{titlepage\}|^SPXV\d+X)\n(?:[ \t]*(?:%[^\n]*)?\n)*)[ \t]*\\clearpage\n/gm, '$1').replace(/\\clearpage(?:\s*\\clearpage)+/g, '\\clearpage');
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// pandoc's escapes in \texttt, and the characters they stand for
const CODE_ESCAPES = { '\\textbackslash{}': '\\', '\\textasciitilde{}': '~', '\\^{}': '^', '\\textless{}': '<', '\\textgreater{}': '>', '\\textbar{}': '|', '\\textquotesingle{}': "'", '\\textasciigrave{}': '`', '\\/': '' };

/**
 * pandoc's \texttt for code in a sentence as LATEX_STYLE.md writes it, \lstinline|…|, or as the LaTeX it came from
 * (ctx.inlineCode: its text → the \verb or \lstinline), where \lstinline works: in a paragraph, not in a command's argument (a
 * caption, a footnote) or a table, which read their text before listings can.
 */
function inlineCode(latex, ctx) {
  const skip = environments(latex, ['tabular', 'tabularx', 'xltabular', 'tabular*', 'lstlisting', 'verbatim']).map((e) => [e.start, e.end]);
  let out = '';
  let depth = 0;
  for (let i = 0; i < latex.length; i += 1) {
    const ch = latex[i];
    if (ch === '\\' && latex.startsWith('\\texttt{', i) && depth === 0 && !skip.some(([s, e]) => i >= s && i < e)) {
      const arg = braceArg(latex, i + '\\texttt'.length);
      const code = arg && codeText(arg.arg);
      const mark = code !== null && [...'|!+@='].find((c) => !code.includes(c));
      if (mark && !code.includes('\n')) {
        const written = ctx.inlineCode?.get(code) ?? '\\lstinline' + mark + code + mark;
        if (written.startsWith('\\lstinline')) ctx.used.add('code');
        out += written;
        i = arg.end - 1;
        continue;
      }
    }
    if (ch === '\\') {
      out += latex.slice(i, i + 2);
      i += 1;
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === '\n' && latex[i + 1] === '\n') depth = 0;
    out += ch;
  }
  return out;
}

/** The text of pandoc's \texttt{…} argument, or null for anything but its escapes. */
function codeText(arg) {
  let out = '';
  for (const m of arg.matchAll(/\\(?:textbackslash|textasciitilde|textless|textgreater|textbar|textquotesingle|textasciigrave)\{\}|\\\^\{\}|\\\/|\\([{}$%&#_ ])|\\[A-Za-z]+|\\.|[^\\]/g)) {
    if (m[1]) out += m[1];
    else if (m[0] in CODE_ESCAPES) out += CODE_ESCAPES[m[0]];
    else if (m[0].startsWith('\\')) return null;
    else out += m[0];
  }
  return out;
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
      if (model.env === 'tabularx' || model.env === 'xltabular') ctx.used.add(model.env);
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
    case 'picture': {
      // a drawing outside any figure, in its line or a block of its own
      const picture = ctx.pictures[record.picture];
      ctx.used.add('graphicx');
      const image = picture.ok ? '\\includegraphics{' + picture.pdf + '}' : '\\fbox{Picture not converted: ' + texText(picture.typ ?? '') + '}';
      return record.inline ? image : '\\begin{center}\n  ' + image + '\n\\end{center}';
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
  // a picture whose LaTeX sits beside its PDF: the TikZ it was made from, or the composer's drawing
  const drawn = record.layout === 'picture' ? ctx.pictures[record.picture] : null;
  const key = record.layout === 'image' ? record.path : drawn?.standalone ? drawn.pdf : null;
  const source = key ? ctx.texSources?.get(key) : null;
  if (source?.picture) {
    ctx.used.add('picture:' + key);
    // the figure indented as the picture's own lines are, by its \end line
    const indent = /\n([ \t]+)\\end\{[^}]*\}$/.exec(source.picture)?.[1] ?? '  ';
    return ['\\begin{figure}[' + record.placement + ']', indent + '\\centering', indent + source.picture, indent + '\\caption{' + caption + '}', ...(record.label ? [indent + '\\label{' + record.label + '}'] : []), '\\end{figure}'].join('\n');
  }
  if (source?.standalone) {
    ctx.used.add('picture:' + key);
    return diagramLatex({ path: source.standalone, width: record.size?.mode === 'line' ? record.size.fraction : null, caption, label: record.label ?? '', placement: record.placement, markup: true });
  }
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
  // the class and options of the LaTeX this came from, when the record has them, with the page's size and paper now
  const options = ctx.sourceClass?.options ?? [Math.round(f.size) + 'pt', paper];
  const pictures = [...ctx.used].filter((u) => u.startsWith('picture:')).map((u) => ctx.texSources.get(u.slice(8)));
  // a package the house preamble writes with its settings, when a picture needs it
  for (const name of ['siunitx', 'mathtools', 'graphicx']) if (pictures.some((p) => p.preamble.some((l) => new RegExp('^\\\\usepackage\\s*(?:\\[[^\\]]*\\])?\\s*\\{' + name + '\\}').test(l)))) ctx.used.add(name);
  groups.push([
    commented('\\documentclass' + (options.length ? '[' + options.join(',') + ']' : '') + '{' + (ctx.sourceClass?.name ?? klass) + '}', Math.round(f.size) + ' pt text on ' + paper.replace('paper', '').toUpperCase().replace('LETTER', 'US Letter') + ' paper' + (f.report ? '; chapters and a title page' : '')),
    ...(pictures.some((p) => p.standalone) ? [commented('\\usepackage{standalone}', '\\includestandalone, for the diagram composer\'s drawings')] : [])
  ]);
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
    ...(used.has('xltabular') ? [commented('\\usepackage{xltabular}', 'long tables that break across pages, with X columns')] : []),
    ...(used.has('siunitx') || ctx.units ? [commented('\\usepackage{siunitx}', 'numbers and units: \\qty{6.6}{\\kilo\\watt}, aligned table columns'), '\\sisetup{group-separator={,},group-minimum-digits=4,per-mode=symbol} % 7,790 with a comma, and V/µs'] : []),
    ...(used.has('multirow') ? [commented('\\usepackage{multirow}', 'cells merged down the rows')] : []),
    ...(used.has('makecell') ? [commented('\\usepackage{makecell}', 'a line break inside a cell')] : []),
    ...(used.has('threeparttable') ? [commented('\\usepackage{threeparttable}', 'notes under a table')] : []),
    ...pictureLines(pictures, used)
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

// what the drawing packages do, as the house preamble says it
const DRAWING_COMMENTS = { tikz: 'drawing diagrams', pgfplots: 'charts drawn from data, right in the document', circuitikz: 'circuit diagrams', 'tikz-cd': 'commutative diagrams' };

/**
 * The preamble lines the pictures put back as TikZ or \\includestandalone need, from the LaTeX documents beside their
 * PDFs: their packages and settings, each once, and the document's own commands a picture uses. The packages the house
 * preamble loads (amsmath, babel, siunitx when anything uses it, and the like) are left to it.
 */
function pictureLines(pictures, used) {
  const house = new Set(['amsmath', 'amssymb', 'babel', 'standalone', 'iftex', 'fontenc', 'lmodern', 'inputenc', ...['mathtools', 'graphicx', 'siunitx'].filter((p) => used.has(p)), ...(used.has('code') ? ['xcolor'] : [])]);
  const lines = [...new Set(pictures.flatMap((p) => p.preamble))];
  const bodies = pictures.map((p) => p.picture ?? '').join('\n');
  return lines.filter((line) => {
    const pkg = /^\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/.exec(line);
    if (pkg) return !pkg[1].split(',').every((name) => house.has(name.trim()));
    if (/^\\sisetup\b/.test(line)) return false;
    const command = /^\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand|DeclareMathOperator|def)\*?\s*\{?(\\[A-Za-z@]+)/.exec(line);
    return !command || new RegExp(command[1].replace(/\\/g, '\\\\') + '(?![A-Za-z@])').test(bodies);
  }).map((line) => {
    const pkg = /^\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}$/.exec(line);
    if (/^\\pgfplotsset\{compat=[\d.]+\}$/.test(line)) return commented(line, 'use current pgfplots behaviour (label placement and so on)');
    return pkg && DRAWING_COMMENTS[pkg[1]] ? commented(line, DRAWING_COMMENTS[pkg[1]]) : line;
  });
}

/**
 * A Typst file's prose for the word check: without its rules and definitions, comments, raw text, title block,
 * pseudocode and the drawings a package makes, whose words the LaTeX keeps in its preamble, in algorithmic or in a
 * picture, which the check leaves out there too.
 */
export function typstProse(text) {
  const root = parseTypst(text);
  const packages = findAll(root, (n) => n.kind === 'ModuleImport').map((n) => {
    const from = stringOf(n.children.find((c) => c.kind === 'Str'));
    return { from, names: from?.startsWith('@') ? importedNames(n, from) : [] };
  });
  const facts = { packages, functions: new Map(), theorems: new Map() };
  const cut = [];
  const visit = (node) => {
    const kids = node.children ?? [];
    for (let k = 0; k < kids.length; k += 1) {
      const n = kids[k];
      const hashed = n.kind === 'Hash' ? kids[k + 1] : null;
      const call = callOf(hashed ?? n);
      const drop = (hashed && STATEMENTS.has(hashed.kind)) || ['LineComment', 'BlockComment', 'Raw'].includes(n.kind)
        || (call && ((call.name === 'align' && titled(call.node)) || (call.name === 'figure' && stringOf(arg(call, 'kind')) === 'algorithm') || packageOf(call.name, facts)));
      if (!drop) {
        visit(n);
        continue;
      }
      cut.push([n.start, (hashed ?? n).end]);
      if (hashed) k += 1;
    }
  };
  visit(root);
  let out = '';
  let last = 0;
  for (const [start, end] of cut) {
    out += text.slice(last, start) + text.slice(start, end).replace(/[^\n]/g, ' ');
    last = end;
  }
  return out + text.slice(last);
}
