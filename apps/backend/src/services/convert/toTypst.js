// LaTeX to Typst for documents written to docs/LATEX_STYLE.md, as docs/featureResearch/LATEX_TYPST_CONVERSION.md
// designs it. A pre-pass holds every house construct (floats, pictures, listings, pseudocode, theorems, units, the title
// block) as a token; pandoc reads the prose and the text of each held piece in one run; a pass over pandoc's JSON writes
// references, citations, maths and headings; then the house writers put the constructs back. Pure: the caller runs
// pandoc and the picture compiles (convertService.js).
import { tex2typst } from 'tex2typst';
import { withoutComments } from '../../latex/text.js';
import { figureSetTypst, figureTypst, tableEdges, tableTypst, typstMarkup } from '../../latex/floats.js';
import { braceArg, commandArgs, environments, inside, keyValues, lengthMm, lineAt, maskComments, mathSpans, optionalArg, rewrite, splice, splitTop, typstLength } from './latexRead.js';
import { groupDigits, siAngle, siNumber, siQuantity, siUnit } from './units.js';
import { region } from './regions.js';

const TODAY = '#datetime.today().display("[day padding:none] [month repr:long] [year]")';
// the house theorem set's LaTeX styles: plain statements are italic, remarks have an italic heading
const STYLES = { plain: ', body-style: emph', definition: '', remark: ', head-style: emph' };
// LaTeX's font sizes for an 10, 11 or 12 pt document, rounded as the title page rule card has them
const SIZES = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 0, large: 12, Large: 14, LARGE: 17, huge: 21, Huge: 25 };
const LANGUAGES = {
  australian: ['en', 'AU'], british: ['en', 'GB'], UKenglish: ['en', 'GB'], english: ['en', ''], american: ['en', 'US'], USenglish: ['en', 'US'],
  canadian: ['en', 'CA'], newzealand: ['en', 'NZ'], french: ['fr', ''], german: ['de', ''], ngerman: ['de', ''], spanish: ['es', ''],
  italian: ['it', ''], portuguese: ['pt', ''], dutch: ['nl', ''], swedish: ['sv', ''], danish: ['da', ''], norsk: ['nb', ''], finnish: ['fi', ''],
  polish: ['pl', ''], russian: ['ru', ''], greek: ['el', ''], chinese: ['zh', ''], japanese: ['ja', '']
};
// the listings languages Typst knows by another name
const LANGUAGE_NAMES = { 'c++': 'cpp', '[sharp]c': 'csharp', 'c#': 'csharp', '[latex]tex': 'latex', tex: 'latex', matlab: 'matlab', octave: 'matlab', '[ansi]c': 'c', '[objective]c': 'objc', bash: 'bash', sh: 'sh', '[5.2]lua': 'lua' };
// what a picture needs from the document's preamble when it is compiled on its own
const DRAWING = new Set(['tikz', 'pgfplots', 'pgfplotstable', 'circuitikz', 'tikz-cd', 'siunitx', 'amsmath', 'amssymb', 'amsfonts', 'mathtools', 'xcolor', 'bm', 'graphicx', 'pgf', 'tikz-3dplot', 'chemfig', 'mhchem', 'babel']);
const DRAWING_SETTINGS = ['usetikzlibrary', 'usepgfplotslibrary', 'pgfplotsset', 'tikzset', 'ctikzset', 'sisetup', 'definecolor', 'colorlet'];
const PICTURES = ['tikzpicture', 'circuitikz'];
const KEYWORDS = { if: 'if', then: 'then', else: 'else', for: 'for', forall: 'for all', do: 'do', while: 'while', repeat: 'repeat', until: 'until', loop: 'loop', return: 'return', function: 'function', procedure: 'procedure', elseif: 'else if' };

/** A Typst label for a LaTeX one: letters, digits and _ : . - only. */
export const typstLabel = (name) => String(name).trim().replace(/[^A-Za-z0-9_:.-]/g, '-');

const PAD = 48;
/** A preamble line with its comment in column 49, or one space after a line too long for that. */
const commented = (code, comment) => (code.length < PAD ? code.padEnd(PAD) : code + ' ') + '// ' + comment;

// ─── The preamble's facts ───

/**
 * What the LaTeX preamble says about the document, comments already gone: its class and options, page, language,
 * title, numbering, theorems, bibliography, macros and what a picture needs to compile on its own.
 */
export function latexFacts(preamble) {
  const text = withoutComments(preamble);
  const cls = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/.exec(text);
  const options = (cls?.[1] ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const command = (name, spec) => {
    const at = new RegExp('\\\\' + name + '(?![A-Za-z])', 'g');
    const found = [];
    for (let m; (m = at.exec(text)); ) {
      const parsed = commandArgs(text, m.index + m[0].length, spec);
      if (parsed) found.push({ args: parsed.args, start: m.index, end: parsed.end });
    }
    return found;
  };
  const packages = command('usepackage', 'om').flatMap(({ args: [opts, list], start, end }) =>
    list.split(',').map((name) => ({ name: name.trim(), options: opts ?? '', single: !list.includes(','), source: text.slice(start, end) })));
  const used = (name) => packages.find((p) => p.name === name);
  const geometry = keyValues([used('geometry')?.options, ...command('geometry', 'm').map((c) => c.args[0])].filter(Boolean).join(','));
  const babel = used('babel')?.options.split(',').map((o) => o.trim()).filter(Boolean).pop() ?? '';
  const hyper = keyValues(command('hypersetup', 'm').map((c) => c.args[0]).join(','));
  const biblatex = keyValues(used('biblatex')?.options);
  // \theoremstyle sets the style of the \newtheorem lines after it
  const theorems = new Map();
  let style = 'plain';
  for (const m of text.matchAll(/\\theoremstyle\s*\{(\w+)\}|\\newtheorem(\*?)(?![A-Za-z])/g)) {
    if (m[1]) {
      style = m[1];
      continue;
    }
    const parsed = commandArgs(text, m.index + m[0].length, 'mom');
    if (parsed) theorems.set(parsed.args[0].trim(), { display: parsed.args[2], style: STYLES[style] === undefined ? 'plain' : style, numbered: !m[2] });
  }
  const margins = ['left', 'right', 'top', 'bottom'].map((side) => [side, typstLength(geometry.get(side) ?? geometry.get(side === 'left' || side === 'right' ? 'hmargin' : 'vmargin') ?? geometry.get('margin'))]);
  const margin = margins.every(([, v]) => v && v === margins[0][1]) ? margins[0][1] : margins.some(([, v]) => v) ? '(' + margins.filter(([, v]) => v).map(([side, v]) => side + ': ' + v).join(', ') + ')' : null;
  const paper = options.includes('letterpaper') || geometry.has('letterpaper') ? 'us-letter' : options.includes('a5paper') || geometry.has('a5paper') ? 'a5' : 'a4';
  const marginMm = lengthMm(geometry.get('margin') ?? geometry.get('hmargin') ?? geometry.get('left')) ?? 25;
  const pictureLines = [
    ...packages.filter((p) => DRAWING.has(p.name)).map((p) => (p.single ? p.source : '\\usepackage' + (p.options ? '[' + p.options + ']' : '') + '{' + p.name + '}')),
    ...DRAWING_SETTINGS.flatMap((name) => command(name, name === 'definecolor' ? 'mmm' : name === 'colorlet' ? 'mm' : 'om').map(({ start, end }) => text.slice(start, end)))
  ];
  return {
    klass: cls?.[2].trim() ?? 'article',
    options,
    size: Number(/^(\d+)pt$/.exec(options.find((o) => /^\d+pt$/.test(o)) ?? '')?.[1] ?? 10),
    paper,
    margin,
    textWidthMm: { a4: 210, 'us-letter': 215.9, a5: 148 }[paper] - 2 * marginMm,
    language: LANGUAGES[babel] ?? (babel ? null : ['en', '']),
    babel,
    title: command('title', 'om').at(-1)?.args[1] ?? null,
    author: command('author', 'om').at(-1)?.args[1] ?? null,
    date: command('date', 'm').at(-1)?.args[0] ?? null,
    pdfTitle: hyper.get('pdftitle') ?? null,
    pdfAuthor: hyper.get('pdfauthor') ?? null,
    numberWithin: new Set([...text.matchAll(/\\numberwithin\s*\{(\w+)\}\s*\{(?:section|chapter)\}/g)].map((m) => m[1])),
    theorems,
    solution: /\\newenvironment\s*\{solution\}/.test(text),
    pageNumbers: !/\\pagestyle\s*\{empty\}/.test(text),
    sectionNumbers: !/\\setcounter\s*\{secnumdepth\}\s*\{0\}/.test(text) && !/\\titleformat\*?\s*\{\\section\}(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*\{\}/.test(text),
    bibFiles: [...command('addbibresource', 'om').map((c) => c.args[1]), ...command('bibliography', 'm').flatMap((c) => c.args[0].split(','))].map((f) => f.trim()).filter(Boolean),
    bibStyle: biblatex.get('style') ?? biblatex.get('citestyle') ?? null,
    graphicsPaths: command('graphicspath', 'm').flatMap((c) => [...c.args[0].matchAll(/\{([^{}]*)\}/g)].map((m) => m[1])),
    macros: macroDefinitions(text),
    picturePreamble: pictureLines.join('\n'),
    lstLanguage: [...text.matchAll(/\\lst(?:set|definestyle\s*\{[^}]*\})\s*\{([\s\S]*?)\n\}/g)].map((m) => keyValues(m[1].replace(/%[^\n]*/g, '')).get('language')).find(Boolean) ?? null,
    beamer: /^beamer/.test(cls?.[2].trim() ?? '')
  };
}

/** The document's own macro definitions, for pandoc to expand: \newcommand and the like, \DeclareMathOperator and \def. */
function macroDefinitions(text) {
  const found = [];
  for (const m of text.matchAll(/\\(newcommand|renewcommand|providecommand|DeclareRobustCommand|DeclareMathOperator|newenvironment|renewenvironment|def)(\*?)(?![A-Za-z])/g)) {
    let end = m.index + m[0].length;
    let name = '';
    if (m[1] === 'def') {
      const def = /^\s*(\\[A-Za-z@]+)([^{]*)/.exec(text.slice(end));
      if (!def) continue;
      name = def[1];
      end += def[0].length;
      const body = braceArg(text, end);
      if (!body) continue;
      end = body.end;
    } else {
      const head = braceArg(text, end) ?? (/^\s*(\\[A-Za-z@]+)/.exec(text.slice(end)) && { arg: /^\s*(\\[A-Za-z@]+)/.exec(text.slice(end))[1], end: end + /^\s*(\\[A-Za-z@]+)/.exec(text.slice(end))[0].length });
      if (!head) continue;
      name = head.arg.trim();
      end = head.end;
      for (let more = optionalArg(text, end); more; more = optionalArg(text, end)) end = more.end;
      const bodies = /environment$/.test(m[1]) ? 2 : 1;
      let ok = true;
      for (let k = 0; k < bodies; k += 1) {
        const body = braceArg(text, end);
        if (!body) ok = false;
        else end = body.end;
      }
      if (!ok) continue;
    }
    // LaTeX's internals and the environments the converter writes itself are left to it
    if (name.includes('@') || ['solution', 'familydefault', '\\familydefault'].includes(name.replace(/^\\/, ''))) continue;
    found.push(text.slice(m.index, end));
  }
  return found.join('\n');
}

// ─── The pre-pass ───

/**
 * One file's state through the conversion: the constructs held as tokens (blocks), the typed text standing in for an
 * inline token (inlines: { text, maths }), the pieces of LaTeX pandoc writes as Typst, and the text kept out of every
 * pass (held).
 */
function newState(file, source) {
  const st = { file, source, blocks: [], inlines: [], pieces: [], held: [] };
  st.block = (record) => {
    st.blocks.push(record);
    return '\n\nSPXB' + (st.blocks.length - 1) + 'X\n\n';
  };
  st.inline = (text, maths = '#[' + text + ']') => {
    st.inlines.push({ text, maths });
    return 'SPXI' + (st.inlines.length - 1) + 'X';
  };
  st.hold = (text) => {
    st.held.push(text);
    return 'SPXH' + (st.held.length - 1) + 'X';
  };
  st.restore = (text) => text.replace(/SPXH(\d+)X/g, (_, n) => st.restore(st.held[n]));
  return st;
}

/** The line of a construct in its file, found by its first characters. */
const lineOf = (st, snippet) => {
  const at = st.source.indexOf(String(snippet).trim().slice(0, 60));
  return at === -1 ? null : lineAt(st.source, at);
};

/**
 * One LaTeX file made ready for pandoc: { input, state }. main: the document's main file, whose body is what lies
 * between \begin{document} and \end{document}; another file (an \input or \include) is all body.
 */
export function prepareLatex(source, ctx, { file, main = false }) {
  const st = newState(file, source);
  const begin = source.indexOf('\\begin{document}');
  const end = source.lastIndexOf('\\end{document}');
  let body = main && begin !== -1 ? source.slice(begin + '\\begin{document}'.length, end === -1 ? undefined : end) : source;
  body = holdRaw(body, st, ctx);
  body = holdVerbatim(body, st);
  body = comments(body, st);
  body = inlinePass(body, st, ctx);
  body = blockPass(body, st, ctx);
  const later = (latex) => piece(st, ctx, inlinePass(holdVerbatim(latex, st), st, ctx));
  for (const record of st.blocks) if (record.kind === 'listing' && typeof record.caption === 'string') record.caption = later(record.caption);
  if (main) {
    const f = ctx.facts;
    st.meta = { title: f.title === null ? null : later(f.title), author: f.author === null ? null : later(f.author), date: f.date === null ? 'today' : f.date.trim() ? later(f.date) : null };
  }
  const macros = inlinePass(holdVerbatim(ctx.facts.macros, st), st, ctx);
  const pieces = st.pieces.map((piece, n) => '\\begin{spxpiece' + n + '}\n' + piece + '\n\\end{spxpiece' + n + '}').join('\n');
  const input = '\\documentclass{' + (ctx.facts.klass === 'report' || ctx.facts.klass === 'book' ? ctx.facts.klass : 'article') + '}\n' + macros + '\n\\begin{document}\n' + body + '\n' + pieces + '\n\\end{document}\n';
  return { input: st.restore(input), state: st };
}

/**
 * Listings and pictures, found where TeX sees them (not in comments) and held with their source as it is: a listing
 * as a block, a picture as a token the figure around it reads (or a picture of its own).
 */
function holdRaw(text, st, ctx) {
  const masked = maskComments(text);
  const found = environments(masked, ['lstlisting', ...PICTURES]);
  return splice(text, found, (env) => {
    const source = text.slice(env.start, env.end);
    if (env.name === 'lstlisting') {
      const options = optionalArg(text, env.bodyStart);
      const code = text.slice(options ? options.end : env.bodyStart, env.end - '\\end{lstlisting}'.length).replace(/^[ \t]*\n/, '').replace(/\n[ \t]*$/, '');
      const kv = keyValues(options?.arg);
      return st.block({ kind: 'listing', code, language: kv.get('language') ?? ctx.facts.lstLanguage ?? '', caption: kv.has('caption') ? kv.get('caption') : null, label: kv.get('label') ?? null, line: lineOf(st, source) });
    }
    ctx.pictures.push({ source, env: env.name, file: st.file, line: lineOf(st, source) });
    return 'SPXR' + (ctx.pictures.length - 1) + 'X';
  });
}

/** \verb, \lstinline and the verbatim environments, kept out of every pass and given back for pandoc. */
function holdVerbatim(text, st) {
  return text
    .replace(/\\begin\{(verbatim\*?|Verbatim)\}[\s\S]*?\\end\{\1\}/g, (m) => st.hold(m))
    .replace(/\\(?:verb\*?|lstinline(?:\[[^\]]*\])?)([^\sA-Za-z{])[^\n]*?\1/g, (m) => st.hold(m))
    .replace(/\\lstinline(?:\[[^\]]*\])?\{[^{}\n]*\}/g, (m) => st.hold(m));
}

/**
 * A comment on lines of its own, between paragraphs and outside every environment, comes over as a // comment; any
 * other comment goes, as it does for TeX.
 */
function comments(text, st) {
  const lines = text.split('\n');
  let depth = 0;
  const out = lines.map((line, i) => {
    const whole = /^[ \t]*%(.*)$/.exec(line);
    const at = depth;
    depth += (line.match(/\\begin\s*\{/g)?.length ?? 0) - (line.match(/\\end\s*\{/g)?.length ?? 0);
    if (!whole || at > 0) return line;
    const lone = (k, step) => {
      for (let j = k + step; j >= 0 && j < lines.length; j += step) {
        if (!/^[ \t]*%/.test(lines[j])) return !lines[j].trim();
      }
      return true;
    };
    if (!lone(i, -1) && !lone(i, 1)) return line;
    const words = whole[1].replace(/^%+/, '').trim();
    return words ? st.block({ kind: 'raw', typst: '// ' + words }) : line;
  });
  return withoutComments(out.join('\n'));
}

/**
 * The inline constructs: siunitx's quantities, \hfill, \today, \pageref, \enquote, \nocite, \Call and the like, each a
 * token with its Typst text (and its text in maths), or a block token for the page-level commands.
 */
function inlinePass(text, st, ctx) {
  const spans = mathSpans(text);
  const token = (index, typst, maths) => (inside(spans, index) ? '\\text{' + st.inline(typst, maths) + '}' : st.inline(typst, maths));
  let out = rewrite(text, /\\(qty|SI|num|unit|si|ang)(?![A-Za-z])/g, (m, t) => {
    const spec = { qty: 'omm', SI: 'omom', num: 'om', unit: 'om', si: 'om', ang: 'om' }[m[1]];
    const parsed = commandArgs(t, m.index + m[0].length, spec);
    if (!parsed || parsed.args.some((a) => a?.includes('#'))) return null;
    const [, a, b, c] = parsed.args;
    // each as text and as maths, as TYPST_STYLE.md writes a quantity in prose and in an equation
    const number = m[1] === 'num' ? siNumber(a) : null;
    const unit = m[1] === 'unit' || m[1] === 'si' ? siUnit(a) : null;
    const angle = m[1] === 'ang' ? siAngle(a) : null;
    const typst = m[1] === 'qty' ? siQuantity(a, b) : m[1] === 'SI' ? siQuantity(a, c) : number ? { text: number.text, maths: number.maths } : unit ? { text: unit, maths: JSON.stringify(unit) } : angle ? { text: angle, maths: '#[' + angle + ']' } : null;
    if (!typst) {
      ctx.note(st, t.slice(m.index, parsed.end), 'A unit Spectrum does not know was left to pandoc: ' + t.slice(m.index, parsed.end));
      return null;
    }
    return { text: token(m.index, typst.text, typst.maths), end: parsed.end };
  });
  const replaced = (pattern, fn) => {
    out = rewrite(out, pattern, fn);
  };
  const simple = (pattern, typst) => replaced(pattern, (m) => ({ text: ' ' + st.inline(typst) + ' ', end: m.index + m[0].length }));
  simple(/[ \t]*\\hfill(?![A-Za-z])[ \t]*/g, '#h(1fr)');
  simple(/[ \t]*\\vfill(?![A-Za-z])[ \t]*/g, '#v(1fr)');
  replaced(/\\(big|med|small)skip(?![A-Za-z])/g, (m) => ({ text: ' ' + st.inline('#v(' + { big: 12, med: 6, small: 3 }[m[1]] + 'pt)') + ' ', end: m.index + m[0].length }));
  replaced(/\\today(?![A-Za-z])/g, (m) => ({ text: st.inline(TODAY), end: m.index + m[0].length }));
  replaced(/\\vspace\*?(?![A-Za-z])/g, (m, t) => {
    const arg = braceArg(t, m.index + m[0].length);
    if (!arg) return null;
    const length = typstLength(arg.arg);
    return { text: length ? ' ' + st.inline('#v(' + length + ')') + ' ' : '', end: arg.end };
  });
  replaced(/\\rule(?![A-Za-z])/g, (m, t) => {
    const parsed = commandArgs(t, m.index + m[0].length, 'omm');
    if (!parsed) return null;
    const width = typstLength(parsed.args[1]);
    return { text: width ? st.inline('#line(length: ' + width + ', stroke: ' + (typstLength(parsed.args[2]) ?? '0.4pt') + ')') : '', end: parsed.end };
  });
  replaced(/\\pageref\*?(?![A-Za-z])/g, (m, t) => {
    const arg = braceArg(t, m.index + m[0].length);
    if (!arg) return null;
    ctx.refsOut.push(arg.arg.trim());
    return { text: ctx.labels.has(arg.arg.trim()) ? st.inline('#ref(<' + typstLabel(arg.arg) + '>, form: "page")') : '??', end: arg.end };
  });
  replaced(/\\enquote\*?(?![A-Za-z])/g, (m, t) => {
    const arg = braceArg(t, m.index + m[0].length);
    return arg && { text: '`' + arg.arg + "'", end: arg.end };
  });
  replaced(/\\nocite(?![A-Za-z])/g, (m, t) => {
    const arg = braceArg(t, m.index + m[0].length);
    if (!arg) return null;
    const keys = arg.arg.split(',').map((k) => k.trim()).filter(Boolean);
    if (keys.includes('*')) ctx.nociteAll = true;
    const cited = keys.filter((k) => k !== '*' && ctx.bibKeys.has(k));
    ctx.citesOut.push(...cited);
    return { text: cited.map((k) => st.inline('#cite(<' + k + '>, form: none)')).join(' '), end: arg.end };
  });
  replaced(/\\tnote(?![A-Za-z])/g, (m, t) => {
    const arg = braceArg(t, m.index + m[0].length);
    return arg && { text: '\\textsuperscript{' + arg.arg + '}', end: arg.end };
  });
  const callSpans = mathSpans(out);
  replaced(/\\Call(?![A-Za-z])/g, (m, t) => {
    const parsed = commandArgs(t, m.index + m[0].length, 'mm');
    if (!parsed) return null;
    const name = '#smallcaps[' + typstMarkup(parsed.args[0]) + '];';
    return { text: (inside(callSpans, m.index) ? '\\text{' + st.inline(name, name) + '}' : st.inline(name, name)) + '(' + parsed.args[1] + ')', end: parsed.end };
  });
  // the name typed before a reference, which Typst prints itself: Figure~\ref{fig:x}
  out = out.replace(/\b(?:Figures?|Fig\.|Tables?|Sections?|Chapters?|Equations?|Eqs?\.|Listings?|Algorithms?|Appendix|Theorems?|Lemmas?|Definitions?|Examples?)(?:~|\s+)\\(ref|eqref)\{/g, '\\$1{');
  out = out.replace(/(\d)\\,(?=\s*[A-Za-zµ°%Ω])/g, '$1~');
  out = out.replace(/\\(?:noindent|centering|phantomsection|raggedright|raggedleft|thispagestyle\s*\{[^}]*\}|bibliographystyle\s*\{[^}]*\})(?![A-Za-z])/g, '');
  replaced(/\\addcontentsline(?![A-Za-z])/g, (m, t) => {
    const parsed = commandArgs(t, m.index + m[0].length, 'mmm');
    return parsed && { text: '', end: parsed.end };
  });
  // the page-level commands, each a block of its own
  const page = (pattern, record) => replaced(pattern, (m, t) => {
    const r = record(m, t);
    return r && { text: st.block(r.record), end: r.end };
  });
  page(/\\(?:clearpage|cleardoublepage|newpage|pagebreak)(?![A-Za-z])/g, (m) => ({ record: { kind: 'raw', typst: '#pagebreak(weak: true)' }, end: m.index + m[0].length }));
  page(/\\(maketitle|tableofcontents|listoffigures|listoftables|appendix)(?![A-Za-z])/g, (m) => ({ record: { kind: m[1] }, end: m.index + m[0].length }));
  page(/\\pagenumbering(?![A-Za-z])/g, (m, t) => {
    const arg = braceArg(t, m.index + m[0].length);
    return arg && { record: { kind: 'numbering', style: arg.arg.trim() }, end: arg.end };
  });
  page(/\\pagestyle(?![A-Za-z])/g, (m, t) => {
    const arg = braceArg(t, m.index + m[0].length);
    return arg && { record: { kind: 'raw', typst: arg.arg.trim() === 'empty' ? '#set page(numbering: none)' : '' }, end: arg.end };
  });
  page(/\\printbibliography(?![A-Za-z])/g, (m, t) => {
    const opts = optionalArg(t, m.index + m[0].length);
    return { record: { kind: 'bibliography', title: keyValues(opts?.arg).get('title') ?? null }, end: opts ? opts.end : m.index + m[0].length };
  });
  page(/\\bibliography(?![A-Za-z])/g, (m, t) => {
    const arg = braceArg(t, m.index + m[0].length);
    return arg && { record: { kind: 'bibliography', title: null }, end: arg.end };
  });
  page(/\\(include|input)(?![A-Za-z])/g, (m, t) => {
    const arg = braceArg(t, m.index + m[0].length);
    if (!arg) return null;
    const target = ctx.include(st, arg.arg.trim());
    return { record: target ? { kind: 'include', path: target } : { kind: 'raw', typst: '' }, end: arg.end };
  });
  return out;
}

// ─── The block constructs ───

/** The figures, tables, pseudocode, theorems, title page and abstract in text, each held as a block with its pieces. */
function blockPass(text, st, ctx) {
  const theorems = [...ctx.facts.theorems.keys(), 'proof', ...(ctx.facts.solution ? ['solution'] : [])];
  const names = ['figure', 'figure*', 'table', 'table*', 'algorithm', 'titlepage', 'abstract', 'tabular', 'tabularx', 'xltabular', 'threeparttable', ...theorems];
  return splice(text, environments(text, names), (env) => {
    const line = lineOf(st, '\\begin{' + env.name + '}');
    let record;
    if (env.name.startsWith('figure')) record = figureRecord(env.body, st, ctx);
    else if (env.name.startsWith('table') || ['tabular', 'tabularx', 'xltabular', 'threeparttable'].includes(env.name)) record = tableRecord(env, st, ctx);
    else if (env.name === 'algorithm') record = algorithmRecord(env.body, st, ctx);
    else if (env.name === 'titlepage') record = titlepageRecord(env.body, st, ctx);
    else if (env.name === 'abstract') record = { kind: 'abstract', body: piece(st, ctx, env.body, true) };
    else record = theoremRecord(env.name, env.body, st, ctx);
    return st.block({ ...record, line });
  });
}

/** A piece of LaTeX for pandoc to write as Typst: its number. block: it may hold paragraphs and constructs of its own. */
function piece(st, ctx, latex, block = false) {
  st.pieces.push(block ? blockPass(latex, st, ctx) : latex.trim());
  return st.pieces.length - 1;
}

/** A command's last (or first) use in text outside the given spans: its arguments, or null. */
function commandIn(text, name, spec, { last = false } = {}) {
  const at = new RegExp('\\\\' + name + '(?![A-Za-z*])', 'g');
  let found = null;
  for (let m; (m = at.exec(text)); ) {
    const parsed = commandArgs(text, m.index + m[0].length, spec);
    if (!parsed) continue;
    found = { args: parsed.args, start: m.index, end: parsed.end };
    if (!last) break;
  }
  return found;
}

/** text without the spans of the given environments. */
const without = (text, envs) => splice(text, envs, () => ' ');

/** \includegraphics options as a FigureSize, or null for the image's own size. trim is kept, for the notes. */
function imageSize(options) {
  const kv = keyValues(options);
  const share = (v) => /^(\d*\.?\d*)\s*\\(?:linewidth|textwidth|columnwidth|hsize)$/.exec(v ?? '');
  const width = kv.get('width');
  const height = kv.get('height');
  const trim = kv.has('trim') || kv.has('viewport') ? kv.get('trim') ?? kv.get('viewport') : null;
  const size = (s) => ({ fraction: 1, width: 0, height: 0, scale: 1, ...s, trim: trim ? [1, 1, 1, 1] : null });
  if (width && share(width)) return size({ mode: 'line', fraction: share(width)[1] === '' ? 1 : Number(share(width)[1]) });
  if (width && lengthMm(width) !== null && height && lengthMm(height) !== null) return size({ mode: 'box', width: lengthMm(width), height: lengthMm(height) });
  if (width && lengthMm(width) !== null) return size({ mode: 'width', width: lengthMm(width) });
  if (!width && height && lengthMm(height) !== null) return size({ mode: 'height', height: lengthMm(height) });
  if (kv.has('scale')) return size({ mode: 'scale', scale: Number(kv.get('scale')) || 1 });
  return trim ? size({ mode: 'natural' }) : null;
}

/** The picture in a figure's or panel's LaTeX: an image, a picture token, or a composer diagram; or null. */
function graphicIn(text, st, ctx) {
  const picture = /SPXR(\d+)X/.exec(text);
  if (picture) return { kind: 'picture', n: Number(picture[1]) };
  const standalone = commandIn(text, 'includestandalone', 'om');
  if (standalone) {
    // the composer's PDF beside its drawing, or the drawing compiled now
    const target = ctx.standalone(st, standalone.args[1].trim());
    return typeof target === 'number' ? { kind: 'picture', n: target } : { kind: 'standalone', path: target, size: imageSize(standalone.args[0]) };
  }
  const image = commandIn(text, 'includegraphics', 'om');
  if (image) {
    const size = imageSize(image.args[0]);
    if (size?.trim) ctx.note(st, '\\includegraphics', 'Typst cannot crop an image, so ' + image.args[1].trim() + ' is shown whole. Crop the file itself.');
    return { kind: 'image', path: ctx.image(st, image.args[1].trim()), size };
  }
  return null;
}

/** A figure: one picture, sub-figures (a), (b), side-by-side figures or pictures under one caption, or any content. */
function figureRecord(body, st, ctx) {
  const placement = optionalArg(body, 0);
  const inner = placement ? body.slice(placement.end) : body;
  const subs = environments(inner, ['subfigure']);
  const minis = subs.length ? [] : environments(inner, ['minipage']);
  const own = without(inner, [...subs, ...minis]);
  const caption = commandIn(own, 'caption', 'om', { last: true });
  const label = commandIn(own, 'label', 'm');
  const base = { kind: 'figure', placement: placement?.arg ?? '', caption: caption ? piece(st, ctx, caption.args[1]) : null, label: label?.args[0].trim() ?? null };
  const panelsOf = (envs) => envs.map((env) => {
    const args = commandArgs(env.body, 0, 'oom') ?? { args: [], end: 0 };
    const panelBody = env.body.slice(args.end);
    const panelCaption = commandIn(panelBody, 'caption', 'om', { last: true });
    return {
      graphic: graphicIn(panelBody, st, ctx),
      width: args.args[2] ?? '',
      top: /\\vtop/.test(panelBody),
      centre: (args.args[0] ?? '').trim() === 'c',
      caption: panelCaption ? piece(st, ctx, panelCaption.args[1]) : null,
      label: commandIn(panelBody, 'label', 'm')?.args[0].trim() ?? null
    };
  });
  // a new row of panels after \par, a blank line or \\
  const rows = (envs) => {
    let count = 1;
    for (let i = 1; i < envs.length; i += 1) {
      if (/\\par\b|\n[ \t]*\n|\\\\/.test(inner.slice(envs[i - 1].end, envs[i].start))) break;
      count += 1;
    }
    return count;
  };
  if (subs.length) return { ...base, layout: 'sub', panels: panelsOf(subs), columns: rows(subs) };
  if (minis.length > 1) {
    const panels = panelsOf(minis);
    if (panels.every((p) => p.graphic)) return { ...base, layout: panels.some((p) => p.caption !== null) ? 'separate' : 'none', panels, columns: rows(minis) };
  }
  const graphic = graphicIn(own, st, ctx);
  if (graphic) return { ...base, layout: 'single', graphic };
  // anything else (text, a box) goes in the figure as it is
  return { ...base, layout: 'content', content: piece(st, ctx, own.replace(/\\caption\s*(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}|\\label\s*\{[^}]*\}/g, ''), true) };
}

/** A column specification as align letters and Typst widths: l c r, S for siunitx's numbers, X and p{…} for widths. */
function columnSpec(spec) {
  let s = String(spec);
  for (let k = 0; k < 5 && /\*\s*\{/.test(s); k += 1) s = s.replace(/\*\s*\{(\d+)\}\s*\{([^{}]*)\}/g, (_, n, x) => x.repeat(Number(n)));
  const cols = [];
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (/[\s|]/.test(ch)) continue;
    if ('@!<>'.includes(ch)) {
      const group = braceArg(s, i + 1);
      if (group) i = group.end - 1;
      continue;
    }
    if (ch === 'S' || ch === 's') {
      const opts = optionalArg(s, i + 1);
      if (opts) i = opts.end - 1;
      cols.push({ align: 'S', width: 'auto' });
    } else if ('pmb'.includes(ch)) {
      const group = braceArg(s, i + 1);
      if (group) i = group.end - 1;
      cols.push({ align: 'l', width: typstLength(group?.arg) ?? 'auto' });
    } else if (ch === 'X') cols.push({ align: 'X', width: '1fr' });
    else cols.push({ align: 'lcr'.includes(ch) ? ch : 'LCR'.includes(ch) ? ch.toLowerCase() : 'l', width: 'auto' });
  }
  return cols;
}

// the rules a booktabs table draws, and the older ones read as the same
const RULE = /^\s*\\(toprule|midrule|bottomrule|hline|cmidrule|cline|addlinespace|morecmidrules|specialrule)(?![A-Za-z])/;

/** A tabular's rows, each { cells, before } with the rules drawn above it, and the rules below the last as one more row. */
function tableRows(body) {
  const rows = [];
  let depth = 0;
  let start = 0;
  const parts = [];
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\\') {
      if (depth === 0 && (body[i + 1] === '\\' || body.startsWith('\\tabularnewline', i))) {
        parts.push(body.slice(start, i));
        i += body[i + 1] === '\\' ? 2 : '\\tabularnewline'.length;
        const space = optionalArg(body, i);
        if (space && /^[\d.\s]*[a-z]+$/i.test(space.arg)) i = space.end;
        start = i;
        i -= 1;
        continue;
      }
      i += 1;
    } else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
  }
  parts.push(body.slice(start));
  for (const part of parts) {
    let rest = part;
    const rules = [];
    for (let m = RULE.exec(rest); m; m = RULE.exec(rest)) {
      let end = m[0].length;
      const opts = optionalArg(rest, end);
      if (opts) end = opts.end;
      const trim = /^\s*\([lr]*\)/.exec(rest.slice(end));
      if (trim) end += trim[0].length;
      const range = ['cmidrule', 'cline', 'specialrule'].includes(m[1]) ? braceArg(rest, end) : null;
      if (range) end = range.end;
      if (m[1] === 'specialrule') for (let k = 0; k < 2; k += 1) end = braceArg(rest, end)?.end ?? end;
      if (['toprule', 'midrule', 'bottomrule', 'hline', 'specialrule'].includes(m[1])) rules.push('full');
      else if (range && /^\s*\d+\s*-\s*\d+\s*$/.test(range.arg)) rules.push(range.arg.split('-').map((n) => Number(n.trim()) - 1));
      rest = rest.slice(end);
    }
    rows.push({ before: rules, text: rest });
  }
  // the last part holds only the rules under the last row
  const last = rows.at(-1);
  const out = rows.filter((row, i) => i < rows.length - 1 || row.text.trim());
  if (!last.text.trim()) out.push({ before: last.before, text: null });
  else out.push({ before: [], text: null });
  return out;
}

/** A table, in a float or on its own: parsed into the table tool's model, its cells and caption as pieces. */
function tableRecord(env, st, ctx) {
  const float = env.name.startsWith('table');
  let body = env.body;
  const placement = float ? optionalArg(body, 0) : null;
  if (placement) body = body.slice(placement.end);
  const tabulars = environments(env.name.startsWith('table') || env.name === 'threeparttable' ? body : env.name === 'tabular' ? '\\begin{tabular}' + body + '\\end{tabular}' : '\\begin{' + env.name + '}' + body + '\\end{' + env.name + '}', ['tabular', 'tabularx', 'xltabular', 'tabular*']);
  if (!tabulars.length) return { kind: 'figure', layout: 'content', placement: placement?.arg ?? '', caption: null, label: null, content: piece(st, ctx, body, true), table: true };
  if (tabulars.length > 1) ctx.note(st, '\\begin{' + tabulars[1].name, 'A float with more than one tabular: the tables follow each other under the one caption.');
  const notes = environments(body, ['tablenotes']).flatMap((n) => [...n.body.matchAll(/\\item\s*(?:\[([^\]]*)\])?([\s\S]*?)(?=\\item|$)/g)].map((item) => ({ mark: (item[1] ?? '').trim(), text: piece(st, ctx, item[2].trim()) })));
  const parsed = tabulars.map((tab) => tabularModel(tab, st, ctx));
  // xltabular holds its own caption
  const own = without(body, tabulars);
  const caption = commandIn(own, 'caption', 'om', { last: true }) ?? parsed.find((p) => p.caption)?.caption;
  const label = commandIn(own, 'label', 'm')?.args[0].trim() ?? parsed.find((p) => p.label)?.label ?? null;
  return {
    kind: 'table',
    float: float || !!caption,
    placement: placement?.arg ?? '',
    tables: parsed,
    caption: caption ? piece(st, ctx, caption.args[1]) : null,
    label,
    notes
  };
}

/** One tabular as the table tool's model, its cells pieces: { model, widths, long, caption, label }. */
function tabularModel(tab, st, ctx) {
  const args = commandArgs(tab.body, 0, { tabular: 'om', tabularx: 'mm', xltabular: 'omm', 'tabular*': 'mom' }[tab.name]);
  const spec = columnSpec(args?.args.at(-1) ?? '');
  let rowsText = tab.body.slice(args?.end ?? 0);
  let caption = null;
  let label = null;
  if (tab.name === 'xltabular') {
    // the caption row, and the header and footer rows repeated on each page, which Typst's table.header does itself
    const first = rowsText.indexOf('\\endfirsthead');
    const head = rowsText.indexOf('\\endhead');
    const lastFoot = rowsText.indexOf('\\endlastfoot');
    let top = first !== -1 ? rowsText.slice(0, first) : head !== -1 ? rowsText.slice(0, head) : '';
    const cap = commandIn(top, 'caption', 'om');
    if (cap) {
      caption = cap;
      label = commandIn(top, 'label', 'm')?.args[0].trim() ?? null;
      top = top.slice(0, cap.start) + top.slice(top.indexOf('\\\\', cap.end) + 2);
    }
    const foot = lastFoot !== -1 ? rowsText.slice(rowsText.indexOf('\\endfoot') + '\\endfoot'.length, lastFoot) : '';
    const rest = lastFoot !== -1 ? rowsText.slice(lastFoot + '\\endlastfoot'.length) : head !== -1 ? rowsText.slice(head + '\\endhead'.length) : rowsText;
    rowsText = top.replace(/\\label\s*\{[^}]*\}/, '') + rest + foot;
  }
  const rows = tableRows(rowsText);
  const cells = [];
  const merges = [];
  const rules = rows.map((row) => row.before);
  rows.forEach((row, r) => {
    if (row.text === null) return;
    const out = [];
    for (const raw of splitTop(row.text, '&')) {
      let text = raw.trim();
      let cols = 1;
      let rowsSpan = 1;
      const multi = /^\\multicolumn(?![A-Za-z])/.exec(text) && commandArgs(text, '\\multicolumn'.length, 'mmm');
      if (multi) {
        cols = Number(multi.args[0]) || 1;
        text = multi.args[2].trim();
      }
      const multirow = /^\\multirow(?![A-Za-z])/.exec(text) && commandArgs(text, '\\multirow'.length, 'omomm');
      if (multirow) {
        rowsSpan = Number(multirow.args[1]) || 1;
        text = multirow.args[4].trim();
      }
      const makecell = /^\\makecell(?![A-Za-z])/.exec(text) && commandArgs(text, '\\makecell'.length, 'om');
      if (makecell) text = makecell.args[1];
      const column = out.length;
      if (spec[column]?.align === 'S' && /^-?\d+(?:\.\d+)?$/.test(text)) text = text.startsWith('-') ? '-' + groupDigits(text.slice(1)) : groupDigits(text);
      text = text.replace(/^\{([\s\S]*)\}$/, '$1');
      if (cols > 1 || rowsSpan > 1) merges.push({ r: cells.length, c: column, rows: rowsSpan, cols });
      out.push(text ? piece(st, ctx, text) : null, ...Array(cols - 1).fill(null));
    }
    cells.push(out);
  });
  const width = Math.max(spec.length, ...cells.map((row) => row.length));
  for (const row of cells) while (row.length < width) row.push(null);
  // the rule above each row, and the header: the rows before the first rule across after the top
  const ruleAt = (i) => (rules[i] ?? []);
  const full = (i) => ruleAt(i).includes('full');
  const n = cells.length;
  const head = [...Array(n).keys()].slice(1).find((i) => full(i)) ?? 0;
  const header = head > 0 && head <= Math.max(1, n - 1);
  const edges = tableEdges(n, width, header).h;
  const preset = (i) => i === 0 || i === n || (header && i === 1);
  const toggled = edges.filter((_, i) => full(i) !== preset(i));
  const partRules = [...Array(n).keys()].slice(1).filter((i) => !full(i)).flatMap((i) => ruleAt(i).filter(Array.isArray).map(([from, to]) => ({ row: i - 1, from, to })));
  const widths = spec.map((c) => c.width);
  return {
    model: {
      cells,
      env: tab.name === 'tabular*' ? 'tabular' : tab.name,
      align: Array.from({ length: width }, (_, i) => spec[i]?.align ?? 'l'),
      lines: 'booktabs',
      toggled,
      header,
      float: false,
      placement: '',
      caption: '',
      label: '',
      escape: false,
      merges,
      partRules,
      markup: true
    },
    widths: widths.some((w) => w !== 'auto') ? Array.from({ length: width }, (_, i) => widths[i] ?? 'auto') : null,
    long: tab.name === 'xltabular',
    caption,
    label
  };
}

// algpseudocode's statements, each starting a line of the house list
const STATEMENTS = /\\(Require|Ensure|State|Statex|If|ElsIf|Else|EndIf|For|ForAll|EndFor|While|EndWhile|Repeat|Until|Loop|EndLoop|Function|EndFunction|Procedure|EndProcedure)(?![A-Za-z])/g;

/** Pseudocode: the caption, the label and each statement of the algorithmic as a line of the house list. */
function algorithmRecord(body, st, ctx) {
  const placement = optionalArg(body, 0);
  const inner = placement ? body.slice(placement.end) : body;
  const algorithmic = environments(inner, ['algorithmic'])[0];
  const own = algorithmic ? without(inner, [algorithmic]) : inner;
  const caption = commandIn(own, 'caption', 'om', { last: true });
  const label = commandIn(own, 'label', 'm')?.args[0].trim() ?? null;
  const code = algorithmic ? algorithmic.body.replace(/^\s*\[[^\]]*\]/, '') : '';
  const word = (name) => st.inline('*' + KEYWORDS[name] + '*');
  const marks = [...code.matchAll(STATEMENTS)];
  const inputs = [];
  const lines = [];
  let level = 0;
  marks.forEach((m, i) => {
    const name = m[1];
    const until = i + 1 < marks.length ? marks[i + 1].index : code.length;
    let at = m.index + m[0].length;
    const takes = ['If', 'ElsIf', 'For', 'ForAll', 'While', 'Until'].includes(name) ? 'm' : ['Function', 'Procedure'].includes(name) ? 'mm' : '';
    const parsed = takes ? commandArgs(code, at, takes) : null;
    if (parsed) at = parsed.end;
    const rest = code.slice(at, until)
      .replace(/\\Comment\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, text) => ' ' + st.inline('#h(1fr) $triangle.r$') + ' ' + text)
      .replace(/\\Return(?![A-Za-z])/g, word('return'))
      .trim();
    const text = (head) => head.filter(Boolean).join(' ');
    const call = parsed && takes === 'mm' ? st.inline('#smallcaps[' + typstMarkup(parsed.args[0]) + '];') + '(' + parsed.args[1] + ')' : '';
    switch (name) {
      case 'Require':
      case 'Ensure':
        inputs.push({ word: name === 'Require' ? 'Input:' : 'Output:', text: piece(st, ctx, rest) });
        return;
      case 'State':
      case 'Statex':
        lines.push({ level, text: piece(st, ctx, rest) });
        return;
      case 'If':
        lines.push({ level, text: piece(st, ctx, text([word('if'), parsed?.args[0], word('then'), rest])) });
        level += 1;
        return;
      case 'ElsIf':
        lines.push({ level: Math.max(0, level - 1), text: piece(st, ctx, text([word('elseif'), parsed?.args[0], word('then'), rest])) });
        return;
      case 'Else':
        lines.push({ level: Math.max(0, level - 1), text: piece(st, ctx, text([word('else'), rest])) });
        return;
      case 'For':
      case 'ForAll':
      case 'While':
        lines.push({ level, text: piece(st, ctx, text([word(name === 'For' ? 'for' : name === 'ForAll' ? 'forall' : 'while'), parsed?.args[0], word('do'), rest])) });
        level += 1;
        return;
      case 'Repeat':
      case 'Loop':
        lines.push({ level, text: piece(st, ctx, text([word(name.toLowerCase()), rest])) });
        level += 1;
        return;
      case 'Until':
        level = Math.max(0, level - 1);
        lines.push({ level, text: piece(st, ctx, text([word('until'), parsed?.args[0], rest])) });
        return;
      case 'Function':
      case 'Procedure':
        lines.push({ level, text: piece(st, ctx, text([word(name.toLowerCase()), call, rest])) });
        level += 1;
        return;
      default:
        // the block ends: algpseudocode's noend layout, where indentation shows the blocks
        level = Math.max(0, level - 1);
    }
  });
  ctx.used.add('algorithm');
  return { kind: 'algorithm', placement: placement?.arg ?? '', caption: caption ? piece(st, ctx, caption.args[1]) : null, label, inputs, lines, numbered: /^\s*\[\s*1\s*\]/.test(algorithmic?.body ?? '') };
}

/** A theorem-like environment, proof or solution: its title, label and body. */
function theoremRecord(name, body, st, ctx) {
  const title = optionalArg(body, 0);
  let rest = title ? body.slice(title.end) : body;
  // its label: the first outside maths, which belongs to the theorem rather than an equation in it
  const spans = mathSpans(rest);
  let label = null;
  rest = rest.replace(/\\label\s*\{([^}]*)\}/g, (whole, name2, at) => {
    if (label || inside(spans, at)) return whole;
    label = name2.trim();
    return '';
  });
  if (name === 'proof' || name === 'solution') ctx.used.add(name);
  else ctx.used.add('theorem:' + name);
  return { kind: 'theorem', name, title: title?.arg?.trim() ? piece(st, ctx, title.arg) : null, label, body: piece(st, ctx, rest, true) };
}

/**
 * A title page, after the rule card: centred, \vspace and \vfill as #v, {\LARGE\bfseries Text\par} as
 * #text(size: 17pt, weight: "bold")[Text], each \par a line of its own.
 */
function titlepageRecord(body, st, ctx) {
  const styled = rewrite(body, /\{(?=\s*\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge|bfseries|itshape|scshape)(?![A-Za-z]))/g, (m, t) => {
    const close = braceArg(t, m.index);
    if (!close) return null;
    let text = close.arg;
    let size = 0;
    let weight = false;
    let italic = false;
    text = text.replace(/\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge|bfseries|itshape|scshape)(?![A-Za-z])\s*/g, (_, cmd) => {
      if (cmd in SIZES) size = SIZES[cmd];
      else if (cmd === 'bfseries') weight = true;
      else if (cmd === 'itshape') italic = true;
      return '';
    });
    const settings = [...(size ? ['size: ' + size + 'pt'] : []), ...(weight ? ['weight: "bold"'] : []), ...(italic ? ['style: "italic"'] : [])];
    text = text.replace(/\\par(?![A-Za-z])\s*$/, '').trim();
    return { text: settings.length ? st.inline('#text(' + settings.join(', ') + ')[') + text + st.inline(']') + '\\par ' : text + '\\par ', end: close.end };
  });
  const lines = styled.replace(/\\par(?![A-Za-z])/g, '\n\n');
  return { kind: 'titlepage', body: piece(st, ctx, lines, true) };
}

// ─── pandoc's JSON ───

const raw = (text) => ({ t: 'RawInline', c: ['typst', text] });
const rawBlock = (text) => ({ t: 'RawBlock', c: ['typst', text] });
const isNode = (x) => x && typeof x === 'object' && !Array.isArray(x) && typeof x.t === 'string';
// text that would join a reference: Typst leaves a full stop or colon out of the label only at its end
const LABEL_CHAR = /^(?:[A-Za-z0-9_-]|[.:][A-Za-z0-9_])/;
const CITE_FORMS = [
  [/^(?:[tT]extcite|[cC]itet\*?|[cC]itealt\*?|[sS]martcite)$/, 'prose'],
  [/^[cC]iteauthor\*?$/, 'author'],
  [/^(?:citeyear|citeyearpar|citedate|citeurldate)\*?$/, 'year']
];

/**
 * pandoc's JSON for one file, with references, citations, maths, headings, inline code and the held pieces written for
 * Typst. Each piece is a Div that comes out between SPXPIECESTART and SPXPIECEEND lines.
 */
export function astToTypst(doc, st, ctx) {
  const handlers = {
    Math: ({ c: [type, tex] }) => maths(type.t === 'DisplayMath', tex, st, ctx),
    Link: (node) => reference(node, ctx),
    Cite: (node) => citation(node, st, ctx),
    Code: ({ c: [, text] }) => [raw(text.includes('`') ? '#raw(' + JSON.stringify(text) + ')' : '`' + text + '`')],
    Header: ({ c: [level, [id, classes], content] }) => {
      const body = walk(content);
      if (classes.includes('unnumbered')) return [{ t: 'Para', c: [raw('#heading(' + (level > 1 ? 'level: ' + level + ', ' : '') + 'numbering: none, outlined: false)['), ...body, raw(']')] }];
      return [{ t: 'Para', c: [raw('='.repeat(level) + ' '), ...body, ...(id && ctx.labels.has(id) ? [raw(' <' + typstLabel(id) + '>')] : [])] }];
    },
    Div: ({ c: [[, classes], content] }) => {
      const held = classes.map((c) => /^spxpiece(\d+)$/.exec(c)).find(Boolean);
      if (held) return [rawBlock('SPXPIECESTART' + held[1]), ...walk(content), rawBlock('SPXPIECEEND' + held[1])];
      if (classes.includes('center')) return [rawBlock('#align(center)['), ...walk(content), rawBlock(']')];
      // an environment pandoc doesn't know keeps its text
      return walk(content);
    },
    Image: ({ c: [attr, alt, [src, title]] }) => {
      const found = ctx.image(st, src);
      return [found ? { t: 'Image', c: [attr, walk(alt), ['/' + found, title]] } : { t: 'Str', c: '[' + src + ']' }];
    },
    BulletList: ({ c: items }) => [{ t: 'BulletList', c: items.map((item) => walk(tight(item))) }],
    OrderedList: ({ c: [attrs, items] }) => [{ t: 'OrderedList', c: [attrs, items.map((item) => walk(tight(item)))] }],
    DefinitionList: ({ c: items }) => [{ t: 'DefinitionList', c: items.map(([term, defs]) => [walk(term), defs.map((d) => walk(tight(d)))]) }],
    RawInline: () => [],
    RawBlock: () => []
  };
  // an item of one paragraph, which LaTeX's lists all are, as a tight list item
  const tight = (blocks) => (blocks.length === 1 && blocks[0].t === 'Para' ? [{ t: 'Plain', c: blocks[0].c }] : blocks);
  function walk(value) {
    if (!Array.isArray(value)) return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)])) : value;
    const out = value.flatMap((item) => (isNode(item) ? transform(item) : [walk(item)]));
    // @label straight before a letter, digit or the like would take it into its name
    return out.map((item, i) => {
      const next = out[i + 1];
      if (item?.t === 'RawInline' && /^@[^\s[]+$/.test(item.c[1]) && next?.t === 'Str' && LABEL_CHAR.test(next.c)) return raw('#ref(<' + item.c[1].slice(1) + '>)');
      return item;
    });
  }
  function transform(node) {
    const handled = handlers[node.t]?.(node);
    if (handled) return handled;
    return [{ ...node, ...(node.c !== undefined && { c: walk(node.c) }) }];
  }
  return { ...doc, blocks: walk(doc.blocks) };
}

/** A reference link from \cref, \ref, \eqref or \autoref: @label, @a and @b, or ?? for a label the document doesn't have. */
function reference(node, ctx) {
  const [[, , attrs], , [url]] = node.c;
  const type = attrs.find(([k]) => k === 'reference-type')?.[1];
  if (!type) return null;
  const targets = (attrs.find(([k]) => k === 'reference')?.[1] ?? url.replace(/^#/, '')).split(',').map((t) => t.trim()).filter(Boolean);
  ctx.refsOut.push(...targets);
  const each = targets.map((t) => (ctx.labels.has(t) ? '@' + typstLabel(t) : '??'));
  return [raw(each.length > 1 ? each.slice(0, -1).join(', ') + ' and ' + each.at(-1) : each[0] ?? '??')];
}

/** A citation as the house writes it: @key, @key[p.~12], #cite(<key>, form: "prose"); a key not in the .bib as text. */
function citation(node, st, ctx) {
  const [citations, content] = node.c;
  const command = /^\\([A-Za-z]+\*?)/.exec(content.find((x) => x.t === 'RawInline')?.c[1] ?? '')?.[1] ?? 'parencite';
  const form = CITE_FORMS.find(([pattern]) => pattern.test(command))?.[1] ?? 'normal';
  const out = [];
  citations.forEach((c, i) => {
    const key = c.citationId;
    if (i > 0) out.push({ t: 'Space' });
    if (c.citationPrefix.length) out.push(...c.citationPrefix, { t: 'Space' });
    if (!ctx.bibKeys.has(key)) {
      ctx.note(st, key, 'The citation of ' + key + ' was left as text: no .bib file the document loads has that key.');
      out.push({ t: 'Str', c: '[' + key + ']' });
      return;
    }
    ctx.citesOut.push(key);
    const plain = /^[A-Za-z0-9_:.-]+$/.test(key);
    const target = plain ? '<' + key + '>' : 'label(' + JSON.stringify(key) + ')';
    const suffix = c.citationSuffix.filter((x, k) => !(k === 0 && x.t === 'Space'));
    if (form === 'normal') {
      out.push(raw(plain ? '@' + key : '#cite(' + target + ')'), ...(suffix.length ? [raw('['), ...suffix, raw(']')] : []));
    } else {
      out.push(raw('#cite(' + target + ', form: "' + form + '"' + (suffix.length ? ', supplement: [' : ')')), ...(suffix.length ? [...suffix, raw('])')] : []));
    }
  });
  return out;
}

// ─── Maths ───

/** A maths environment's lines, split at \\ outside braces and nested environments. */
function mathLines(tex) {
  const lines = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < tex.length; i += 1) {
    if (tex.startsWith('\\begin{', i)) depth += 1;
    else if (tex.startsWith('\\end{', i)) depth -= 1;
    const ch = tex[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '\\') {
      if (tex[i + 1] === '\\' && depth === 0) {
        lines.push(tex.slice(start, i));
        start = i + 2;
      }
      i += 1;
    }
  }
  lines.push(tex.slice(start));
  return lines.filter((line, i) => line.trim() || i < lines.length - 1);
}

/** TeX maths as Typst maths through tex2typst, after Spectrum's own rules; null when tex2typst can't read it. */
export function typstMaths(tex) {
  const arrows = (t) => rewrite(t, /\\x(right|left)arrow(?![A-Za-z])/g, (m, s) => {
    const arg = braceArg(s, m.index + m[0].length);
    return arg && { text: '\\overset{' + arg.arg + '}{\\long' + m[1] + 'arrow}', end: arg.end };
  });
  const t = arrows(tex)
    .replace(/\\mathop\s*\{\\(?:mathrm|operatorname)\s*\{([^{}]*)\}\}/g, '\\operatorname{$1}')
    .replace(/\\mathrm\s*\{([A-Za-z][A-Za-z ]+)\}/g, (whole, word) => (word.trim().length > 1 ? '\\text{' + word + '}' : whole))
    // an upright letter as a subscript is a label (v_d, the drain's), which tex2typst would take for a differential
    .replace(/([_^])\s*(?:\{\s*\\mathrm\s*\{([A-Za-z])\}\s*\}|\\mathrm\s*\{([A-Za-z])\})/g, (_, at, a, b) => at + '\\text{' + (a ?? b) + '}')
    .replace(/\\left\\lVert/g, '\\left\\|')
    .replace(/\\right\\rVert/g, '\\right\\|')
    .replace(/\\[lr]Vert(?![A-Za-z])/g, '\\|')
    .replace(/\\(begin|end)\{split\}/g, '\\$1{aligned}')
    .replace(/\\(?:nonumber|notag)(?![A-Za-z])/g, '');
  let out;
  try {
    out = tex2typst(t.trim());
  } catch {
    return null;
  }
  return out.replace(/\s*\n\s*/g, ' ').trim().replace(/\bcoloneqq\b/g, ':=').replace(/\beqqcolon\b/g, '=:');
}

/**
 * A maths node: inline maths, a numbered display (an equation, or one line of an align that has several numbers) with
 * its label, or a display Typst leaves unnumbered. tex2typst writes the maths; pandoc does when it can't.
 */
function maths(display, tex, st, ctx) {
  const env = /^\s*\\begin\{(equation|align|alignat|gather|multline|flalign|eqnarray)(\*?)\}(?:\{\d+\})?([\s\S]*)\\end\{\1\2\}\s*$/.exec(tex);
  const numbered = !!env && !env[2];
  const body = env ? env[3] : tex;
  const math = (t, block) => {
    const typst = typstMaths(t);
    return typst === null ? { t: 'Math', c: [{ t: block ? 'DisplayMath' : 'InlineMath' }, t] } : raw(block ? '$ ' + typst + ' $' : '$' + typst + '$');
  };
  if (!display) return [math(body, false)];
  const multi = env && env[1] !== 'equation';
  const lines = (multi ? mathLines(body) : [body]).map((line) => {
    const label = /\\label\s*\{([^}]*)\}/.exec(line)?.[1]?.trim() ?? null;
    return { tex: line.replace(/\\label\s*\{[^}]*\}/g, ''), label, numbered: numbered && !/\\(?:nonumber|notag)(?![A-Za-z])/.test(line) };
  });
  const join = (group) => (multi ? '\\begin{aligned}' + group.map((l) => l.tex).join(' \\\\ ') + '\\end{aligned}' : group[0].tex);
  const unnumbered = (group) => [raw('#math.equation(block: true, numbering: none, '), math(join(group), true), raw(')')];
  const labelled = (node, label) => [node, ...(label ? [raw(' <' + typstLabel(label) + '>')] : [])];
  const count = lines.filter((l) => l.numbered).length;
  if (!count) return unnumbered(lines);
  ctx.equations = true;
  if (count === 1) return labelled(math(join(lines), true), lines.find((l) => l.label)?.label ?? null);
  // Typst numbers a whole equation, so each numbered line becomes one, with the unnumbered lines before it
  ctx.note(st, tex, 'An ' + env[1] + ' with ' + count + ' numbered lines became ' + count + ' equations, which Typst numbers one by one; they no longer line up on their & marks.');
  const groups = [];
  let current = [];
  for (const line of lines) {
    current.push(line);
    if (line.numbered) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.at(-1).push(...current);
  return groups.flatMap((group, i) => [...(i ? [raw('\n')] : []), ...labelled(math(join(group), true), group.find((l) => l.label)?.label ?? null)]);
}

// ─── Typst back together ───

/** The held pieces in pandoc's Typst, by number, and the text without them. */
function takePieces(typst) {
  const pieces = [];
  const text = typst.replace(/^SPXPIECESTART(\d+)\n([\s\S]*?)^SPXPIECEEND\1$\n?/gm, (_, n, body) => {
    pieces[Number(n)] = body.trim();
    return '';
  });
  return { pieces, text };
}

/** pandoc's #strong[…] and #emph[…] as Typst's own *…* and _…_, where nothing around them would join in. */
function plainEmphasis(text) {
  // pandoc escapes a semicolon after text, and a minus starting a cell, which Typst then prints as a hyphen
  return text.replace(/(?<=['"\p{L}\p{N}.,])\\;/gu, ';').replace(/\\-(?=\d)/g, '-')
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : part
      .replace(/(^|[^\p{L}\p{N}\\])#strong\[([^[\]#*_\n\\$`]+)\](?![\p{L}\p{N}(])/gmu, '$1*$2*')
      .replace(/(^|[^\p{L}\p{N}\\])#emph\[([^[\]#*_\n\\$`]+)\](?![\p{L}\p{N}(])/gmu, '$1_$2_')))
    .join('');
}

/** text with each line after the first indented by indent. */
const indentRest = (text, indent) => text.split('\n').map((line, i) => (i && line ? indent + line : line)).join('\n');

/**
 * The file's Typst: pandoc's text with the held pieces taken out, each block rendered by the house writers in its
 * token's place, and each inline token's text in its place, in maths or in markup.
 */
export function assembleTypst(typst, st, ctx) {
  const { pieces, text } = takePieces(typst);
  const pieceText = (n) => (n === null || n === undefined ? '' : resolve(plainEmphasis(pieces[n] ?? '')));
  function resolve(source) {
    return source
      .replace(/^(.*?)SPXB(\d+)X/gm, (_, before, n) => before + indentRest(resolve(region(st.blocks[Number(n)], renderBlock(st.blocks[Number(n)], pieceText, st, ctx), st, ctx, 'typst')), ' '.repeat(before.length)))
      // a picture on its own, outside a figure
      .replace(/SPXR(\d+)X/g, (_, n) => '#box(' + pictureImage({ kind: 'picture', n: Number(n) }, ctx) + ')');
  }
  const finish = (source) => {
    let out = source;
    for (let k = 0; k < 3 && /SPXI\d+X/.test(out); k += 1) {
      out = out
        // a quantity in maths is several atoms, so a fraction or power around it takes it in brackets (a fraction's vanish)
        .replace(/(\/\s*)?"SPXI(\d+)X"(\s*[/^_])?/g, (_, before, n, after) => {
          const maths = st.inlines[n].maths;
          return (before ?? '') + ((before || after) && /\s/.test(maths) ? '(' + maths + ')' : maths) + (after ?? '');
        })
        .replace(/SPXI(\d+)X/g, (_, n) => st.inlines[n].text);
    }
    return out;
  };
  // the title block's text, which \maketitle and the preamble's #set document print
  if (st.meta) {
    const one = (n) => finish(pieceText(n)).trim();
    ctx.titleText = st.meta.title === null ? (ctx.facts.pdfTitle ? typstMarkup(ctx.facts.pdfTitle) : null) : one(st.meta.title);
    ctx.authorText = st.meta.author === null ? null : one(st.meta.author);
    ctx.dateText = st.meta.date === 'today' ? TODAY : st.meta.date === null ? null : one(st.meta.date);
  }
  const out = finish(resolve(plainEmphasis(text)));
  return out
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

/**
 * A figure or table LaTeX may only put at the top or bottom of a page ([t], [b], [p]) floats there in Typst too. One it
 * may keep here ([h], [ht]) stays in place: Typst's floats always move, and took a table above its chapter's heading.
 */
const floating = (typst, placement) => (/[tbp]/.test(placement ?? '') && !/[hH]/.test(placement) ? typst.replace(/\)((?: <[^>]+>)?)$/, ', placement: auto)$1') : typst);
const captionArg = (text) => (text ? ', caption: [' + text + ']' : '');
const labelAfter = (label) => (label ? ' <' + typstLabel(label) + '>' : '');

/** A picture's image: the PDF it compiled to, or a box that says it couldn't be. */
function pictureImage(graphic, ctx, size = null) {
  if (graphic.kind === 'picture') {
    const picture = ctx.pictures[graphic.n];
    return picture?.ok ? 'image("/' + picture.pdf + '")' : 'rect(width: 60mm, height: 30mm, stroke: 0.5pt)[Picture not converted: ' + typstMarkup(picture?.tex ?? 'see the conversion notes') + ']';
  }
  if (!graphic.path) return 'rect(width: 60mm, height: 30mm, stroke: 0.5pt)[Missing picture]';
  const share = size?.mode === 'line' ? ', width: ' + Math.round(size.fraction * 100) + '%' : size?.mode === 'width' ? ', width: ' + +size.width.toFixed(1) + 'mm' : '';
  return 'image("/' + graphic.path + '"' + share + ')';
}

/** One held construct as Typst. */
function renderBlock(record, pieceText, st, ctx) {
  switch (record.kind) {
    case 'raw':
      return record.typst;
    case 'figure':
      return renderFigure(record, pieceText, st, ctx);
    case 'table':
      return renderTable(record, pieceText, ctx);
    case 'listing': {
      ctx.used.add('code');
      const language = LANGUAGE_NAMES[record.language.toLowerCase()] ?? record.language.toLowerCase().replace(/[^a-z0-9+#-]/g, '');
      const fence = '`'.repeat(Math.max(3, ...[...record.code.matchAll(/`+/g)].map((m) => m[0].length + 1)));
      const block = fence + language + '\n' + record.code + '\n' + fence;
      if (record.caption === null && !record.label) return block;
      const caption = record.caption === null ? '' : ',\n  caption: [' + pieceText(record.caption) + ']';
      return '#figure(\n  ' + indentRest(block, '  ') + caption + ',\n)' + labelAfter(record.label);
    }
    case 'algorithm': {
      const inputs = record.inputs.map((input, i) => '*' + input.word + '* ' + pieceText(input.text).replace(/\s*\n\s*/g, ' ') + (i < record.inputs.length - 1 ? ' \\' : ''));
      const lines = record.lines.map((line) => (record.numbered ? '+ ' : '- ') + (line.level ? '#h(' + 1.5 * line.level + 'em) ' : '') + pieceText(line.text).replace(/\s*\n\s*/g, ' '));
      const caption = record.caption === null ? '' : '  caption: [' + pieceText(record.caption) + '],\n';
      return '#figure(\n  kind: "algorithm", supplement: [Algorithm],\n' + caption + '  align(start)[\n' + [...inputs, ...lines].map((l) => '    ' + l).join('\n') + '\n  ],\n)' + labelAfter(record.label);
    }
    case 'theorem': {
      const body = pieceText(record.body);
      const title = record.title === null ? '' : pieceText(record.title);
      const call = record.name === 'proof' ? '#proof' + (title ? '(name: [' + title + '])' : '') : record.name === 'solution' ? '#solution' : '#' + record.name + (title ? '(title: [' + title + '])' : '');
      return call + (body.includes('\n') ? '[\n' + body + '\n]' : '[' + body + ']') + labelAfter(record.label);
    }
    case 'titlepage':
      return '#page(numbering: none)[\n  #align(center)[\n' + pieceText(record.body).split('\n\n').map((line) => '    ' + line.replace(/\n/g, ' ')).join(' \\\n') + '\n  ]\n]';
    case 'abstract':
      return '#heading(numbering: none, outlined: false)[Abstract]\n' + pieceText(record.body);
    case 'maketitle': {
      const lines = ['#title()', ...(ctx.authorText ? [ctx.authorText] : []), ...(ctx.dateText ? [ctx.dateText] : [])];
      return '#align(center)[\n' + lines.map((l, i) => '  ' + indentRest(l, '  ') + (i > 0 && i < lines.length - 1 ? ' \\' : '')).join('\n') + '\n]';
    }
    case 'tableofcontents':
      return '#outline(title: [Contents])';
    case 'listoffigures':
      return '#outline(title: [List of figures], target: figure.where(kind: image))';
    case 'listoftables':
      return '#outline(title: [List of tables], target: figure.where(kind: table))';
    case 'appendix':
      ctx.used.add('appendix');
      return [
        commented('#counter(heading).update(0)', 'appendices count again from A'),
        commented('#set heading(numbering: "A.1")', 'Appendix A, then A.1 for its sections'),
        commented('#show heading.where(level: 1): set heading(supplement: [Appendix])', 'references read Appendix A')
      ].join('\n');
    case 'numbering': {
      const style = { alph: 'none', Alph: 'none', roman: '"i"', Roman: '"I"', arabic: '"1"' }[record.style] ?? '"1"';
      return style === 'none' ? commented('#set page(numbering: none)', 'this page has no number') : commented('#set page(numbering: ' + style + ')', style === '"1"' ? 'numbered 1, 2, 3 from here' : 'front matter: i, ii, iii') + '\n#counter(page).update(1)';
    }
    case 'bibliography':
      ctx.bibliographyPlaced = true;
      return ctx.bibliography ? ctx.bibliography(record) : '';
    case 'include':
      return '#include "/' + record.path + '"';
    default:
      return '';
  }
}

/** A figure, after its layout. */
function renderFigure(record, pieceText, st, ctx) {
  const caption = record.caption === null ? '' : pieceText(record.caption);
  const label = record.label;
  if (record.layout === 'single') {
    const g = record.graphic;
    if (g.kind === 'image' && g.path && g.size && g.size.mode !== 'natural') return floating(figureTypst({ path: g.path, width: g.size.fraction, size: g.size, caption, label: label ? typstLabel(label) : '', markup: true }), record.placement);
    return floating('#figure(' + pictureImage(g, ctx, g.size) + captionArg(caption) + ')' + labelAfter(label), record.placement);
  }
  if (record.layout === 'sub') {
    ctx.used.add('subfigure');
    const columns = Math.max(1, Math.min(record.columns, record.panels.length));
    const align = record.panels.some((p) => p.top) ? 'top' : record.panels.some((p) => p.centre) ? 'horizon' : 'bottom';
    const panels = record.panels.map((p) => {
      const image = p.graphic?.kind === 'image' && p.graphic.path ? 'image("/' + p.graphic.path + '", width: 100%)' : p.graphic ? pictureImage(p.graphic, ctx) : 'rect(width: 100%, height: 30mm, stroke: 0.5pt)';
      return '    [#subfigure(' + image + captionArg(p.caption === null ? '' : pieceText(p.caption)) + ')' + labelAfter(p.label) + '],';
    });
    return floating('#figure(\n  grid(\n    columns: (' + Array(columns).fill('1fr').join(', ') + '), column-gutter: 1em, ' + (record.panels.length > columns ? 'row-gutter: 1em, ' : '') + 'align: ' + align + ',\n' + panels.join('\n') + '\n  )' + (caption ? ',\n  caption: [' + caption + ']' : '') + ',\n)' + labelAfter(label), record.placement);
  }
  if (record.layout === 'separate' || record.layout === 'none') {
    const panels = record.panels.map((p) => ({ path: p.graphic?.kind === 'image' ? p.graphic.path : ctx.pictures[p.graphic?.n]?.pdf ?? '', caption: p.caption === null ? '' : pieceText(p.caption), label: p.label ? typstLabel(p.label) : '' }));
    const set = figureSetTypst({ panels, layout: 'grid', columns: Math.max(1, Math.min(record.columns, panels.length)), labels: record.layout, align: 'bottom', size: { mode: 'line', fraction: 1, width: 0, height: 0, scale: 1 }, caption, label: label ? typstLabel(label) : '', placement: '', markup: true });
    return record.layout === 'none' ? floating(set, record.placement) : set;
  }
  const content = pieceText(record.content);
  return floating('#figure(\n  [\n' + content + '\n  ]' + (record.table ? ',\n  kind: table' : ',\n  kind: image') + (caption ? ',\n  caption: [' + caption + ']' : '') + ',\n)' + labelAfter(label), record.placement);
}

/** A table through the table tool's writer, with its column widths, its notes under it and room to break across pages. */
function renderTable(record, pieceText, ctx) {
  ctx.tables = true;
  const tables = record.tables.map(({ model, widths }) => {
    const cells = model.cells.map((row) => row.map((n) => (n === null ? '' : pieceText(n))));
    let typst = tableTypst({ ...model, cells });
    if (widths) typst = typst.replace('#table(columns: ' + model.align.length, '#table(columns: (' + widths.join(', ') + ')');
    // the table tool leaves out an all-left align, and a figure would then centre every cell
    if (!/^#table\(columns: (?:\([^)]*\)|\d+), align: /.test(typst)) typst = typst.replace(/^(#table\(columns: (?:\([^)]*\)|\d+)), /, '$1, align: (' + model.align.map(() => 'left').join(', ') + '), ');
    return typst;
  });
  const caption = record.caption === null ? '' : pieceText(record.caption);
  const notes = record.notes.map((n) => '#text(size: 0.9em)[' + (n.mark ? '#super[' + n.mark + '] ' : '') + pieceText(n.text) + ']');
  const long = record.tables.some((t) => t.long);
  if (!record.float && !caption) return [...tables, ...notes].join('\n');
  const body = tables.length === 1 && !notes.length ? tables[0].replace(/^#/, '') : '[\n  ' + [...tables, ...notes].join('\n  ') + '\n]';
  const figure = floating('#figure(' + body + (tables.length === 1 && !notes.length ? '' : ', kind: table') + captionArg(caption) + ')' + labelAfter(record.label), record.placement);
  return long ? '#[\n  ' + commented('#show figure: set block(breakable: true)', 'this table may run across pages') + '\n  ' + figure + '\n]' : figure;
}

// ─── The preamble ───

/** The Typst preamble of TYPST_STYLE.md for what the converted document uses, its groups in the house order. */
export function typstPreamble(ctx) {
  const f = ctx.facts;
  const report = f.klass === 'report' || f.klass === 'book';
  const groups = [];
  const title = ctx.titleText;
  const author = ctx.authorPlain;
  if (title || author) {
    groups.push(['// Document', commented('#set document(', 'the title and author, also shown in the PDF\'s properties'), ...(title ? ['  title: [' + title + '],'] : []), ...(author ? ['  author: ' + JSON.stringify(author) + ','] : []), ')']);
  }
  const bibTitle = ctx.bibliographyTitle ?? 'References';
  if (ctx.hasBibliography) groups.push(['// References', commented('#set bibliography(title: [' + bibTitle + '])', bibTitle === 'References' ? 'APA heads the list References, not Bibliography' : 'the title the LaTeX gave its bibliography')]);
  const page = [
    commented('#set page(paper: ' + JSON.stringify(f.paper) + ', margin: ' + (f.margin ?? '25mm') + ', numbering: ' + (f.pageNumbers ? '"1"' : 'none') + ')', (f.paper === 'a4' ? 'A4' : f.paper === 'a5' ? 'A5' : 'US Letter') + ', ' + (f.margin && f.margin.startsWith('(') ? 'the LaTeX margins' : (f.margin ?? '25mm').replace(/(\d)([a-z]+)$/, '$1 $2') + ' margins all round') + (f.pageNumbers ? ', page numbers at the foot' : ', no page numbers')),
    commented('#set text(size: ' + f.size + 'pt' + (f.language ? ', lang: "' + f.language[0] + '"' + (f.language[1] ? ', region: "' + f.language[1] + '"' : '') : '') + ')', f.size + ' pt text' + (f.language?.[1] === 'AU' ? '; Australian English, and en-AU in the PDF' : f.language ? '; the LaTeX\'s language' : '')),
    commented('#set par(justify: true)', 'straight right margins, as LaTeX sets them'),
    f.sectionNumbers ? commented('#set heading(numbering: "1.1")', report ? 'numbered chapters and sections: 1, 1.1, 1.1.1' : 'numbered headings: 1, 1.1, 1.1.1') : commented('#set heading(numbering: none)', 'headings without numbers, as the LaTeX had them'),
    ...(report ? [
      commented('#show heading.where(level: 1): set heading(supplement: [Chapter])', 'references to a chapter read Chapter 2'),
      commented('#show heading.where(level: 1): it => pagebreak(weak: true) + it', 'each chapter starts on a new page')
    ] : [])
  ];
  groups.push(['// Page', ...page]);
  const theorems = [...ctx.used].filter((u) => u.startsWith('theorem:')).map((u) => u.slice(8));
  const bySection = f.numberWithin.size > 0 || report;
  const maths = [];
  if (ctx.equations) maths.push(commented('#set math.equation(numbering: "(1)")', 'number display equations: (1), (2), ...'));
  if (theorems.length) {
    maths.push(
      commented('#show figure.where(kind: "theorem"): it => align(start, it.body)', 'a theorem draws its own heading, left aligned'),
      commented('#show heading.where(level: 1): it => {', 'theorems count again in each ' + (report ? 'chapter' : 'section') + ': 2.1, 2.2, ...'),
      '  counter(figure.where(kind: "theorem")).update(0)',
      '  it',
      '}'
    );
  }
  if (bySection) {
    const what = f.numberWithin.size ? f.numberWithin : new Set(['equation', 'figure', 'table']);
    maths.push(
      '',
      '// Number ' + [...what].map((w) => w + 's').join(', ').replace(/, ([^,]*)$/, ' and $1') + ' by ' + (report ? 'chapter' : 'section') + ': (2.1), Figure 2.1, ...',
      commented('#let by-section(pattern) = n => numbering(pattern, counter(heading).get().first(), n)', 'the ' + (report ? 'chapter' : 'section') + ' number, then the count'),
      ...(what.has('equation') && ctx.equations ? [commented('#set math.equation(numbering: by-section("(1.1)"))', 'equations: (2.1), (2.2), ...')] : []),
      ...(what.has('figure') || what.has('table') ? [commented('#set figure(numbering: by-section("1.1"))', 'figures, tables and listings: 2.1, 2.2, ...')] : []),
      commented('#show heading.where(level: 1): it => {', 'every ' + (report ? 'chapter' : 'section') + ' starts these counts again at 1'),
      ...(what.has('equation') ? ['  counter(math.equation).update(0)'] : []),
      ...(what.has('figure') || what.has('table') ? ['  counter(figure.where(kind: image)).update(0)', '  counter(figure.where(kind: table)).update(0)', '  counter(figure.where(kind: raw)).update(0)'] : []),
      '  it',
      '}'
    );
  }
  if (maths.length) groups.push(['// Maths', ...maths]);
  const figures = [
    ...(ctx.tables ? [commented('#show figure.where(kind: table): set figure.caption(position: top)', 'captions above tables, below figures'), commented('#show table: set text(number-width: "tabular")', 'digits of equal width, so numbers line up in columns')] : []),
    ...(ctx.used.has('algorithm') ? [commented('#show figure.where(kind: "algorithm"): set figure.caption(position: top)', 'an algorithm\'s caption above it, as LaTeX\'s box puts it')] : []),
    ...(ctx.used.has('subfigure') ? [
      commented('#show figure.caption.where(kind: "subfigure"): it => [#context it.counter.display(it.numbering) #it.body]', 'a panel\'s caption: (a) Measured output.'),
      commented('#show figure: it => {', 'each figure starts its panels again at (a)'),
      '  if it.kind != "subfigure" { counter(figure.where(kind: "subfigure")).update(0) }',
      '  it',
      '}',
      commented('#show ref: it => {', 'a reference to a panel reads Figure 1a'),
      '  let panel = it.element',
      '  if panel == none or panel.func() != figure or panel.kind != "subfigure" { return it }',
      '  let parent = query(figure.where(kind: image).before(panel.location())).last()',
      '  let number = parent.counter.display(parent.numbering, at: parent.location())',
      '  link(panel.location(), [Figure~#number#numbering("a", ..panel.counter.at(panel.location()))])',
      '}'
    ] : [])
  ];
  if (figures.length) groups.push(['// Figures and tables', ...figures]);
  if (ctx.used.has('code')) {
    groups.push([
      '// Code',
      commented('#set raw(tab-size: 4)', 'a tab in code is four spaces wide'),
      commented('#show raw.where(block: true): it => block(', 'code in a light box, with line numbers down the left'),
      '  width: 100%, fill: luma(249), stroke: 0.5pt + luma(204), inset: (x: 0.5em, y: 0.65em),',
      '  grid(columns: (auto, 1fr), column-gutter: 0.8em, row-gutter: 0.65em, align: (right, start),',
      '    ..it.lines.map(line => (text(fill: luma(128), size: 0.8em, str(line.number)), line)).flatten()),',
      ')',
      commented('#show figure.where(kind: raw): set figure.caption(position: top)', 'listing captions above the code'),
      commented('#show figure.where(kind: raw): set block(breakable: true)', 'a long listing may run onto the next page')
    ]);
  }
  return groups.map((g) => g.join('\n')).join('\n\n');
}

/** The house definitions the document uses: the sub-figure, the theorem set, the proof and the solution. */
export function typstDefinitions(ctx) {
  const lines = [];
  if (ctx.used.has('subfigure')) lines.push('// A panel of a figure: #subfigure(image(...), caption: [...]) <fig:name>, numbered (a), (b), ...', '#let subfigure = figure.with(kind: "subfigure", supplement: [Figure], numbering: "(a)")', '');
  const theorems = [...ctx.facts.theorems].filter(([name]) => ctx.used.has('theorem:' + name));
  if (theorems.length) {
    lines.push(
      '// Theorem-like environments, all sharing one counter per section: Theorem 2.1, Example 2.2, ...',
      '#let theorem-number = n => numbering("1.1", counter(heading).get().first(), n)',
      '#let theorem-like(name, head-style: strong, body-style: body => body) = (title: none, body) => figure(',
      '  kind: "theorem", supplement: name, numbering: theorem-number, outlined: false,',
      '  [',
      '    #head-style[#name #context counter(figure.where(kind: "theorem")).display(theorem-number)#if title != none [ (#title)].]',
      '    #body-style(body)',
      '  ],',
      ')'
    );
    for (const [name, t] of theorems) lines.push('#let ' + name + ' = theorem-like([' + t.display + ']' + STYLES[t.style] + ')');
  }
  if (ctx.used.has('proof') || ctx.used.has('solution')) lines.push('#let proof(body, name: [Proof]) = block(width: 100%)[_#name._ #body #h(1fr) $square$] // ends with the proof box');
  if (ctx.used.has('solution')) lines.push('#let solution = proof.with(name: [Solution])');
  return lines.join('\n').trim();
}

/** A picture as a document of its own, with what it needs from the main preamble, for Tectonic to compile to PDF. */
export function pictureDocument(picture, facts) {
  return [
    '\\documentclass[border=2pt]{standalone}',
    facts.picturePreamble,
    facts.macros,
    // the document's line width, which a plot sized 0.8\textwidth reads
    '\\setlength{\\textwidth}{' + facts.textWidthMm.toFixed(1) + 'mm}',
    '\\setlength{\\linewidth}{\\textwidth}',
    '\\begin{document}',
    picture.source,
    '\\end{document}',
    ''
  ].filter((line) => line !== '').join('\n');
}
