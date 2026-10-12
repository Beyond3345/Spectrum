// Self-check for context-aware completion: maths or text at the cursor, the braces of \ref and \cite, and what
// the list offers there. Run:
// npx esbuild apps/frontend/src/editor/context.check.ts --bundle --platform=node --log-level=warning | node
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import { CompletionContext, nextSnippetField } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { MATH_COMMANDS, TEXT_COMMANDS } from './latexCommands';
import { argContext, texContext } from './latexContext';
import { latexCompletionSource, sharedStart } from './latexEditor';
import { NO_PROJECT, parseBib, scanProject, scanTex } from './latexEnvs';
import type { Project } from './latexEnvs';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
/** The context at "|" (or the end). */
const at = (text: string) => texContext(text.replace('|', ''), text.includes('|') ? text.indexOf('|') : text.length);
const mode = (text: string) => at(text).mode;

// maths delimiters
eq([mode('$x + \\al'), mode('$x$ and '), mode('$$ a '), mode('$$a$$ b')], ['math', 'text', 'math', 'text'], '$ and $$');
eq([mode('\\( a '), mode('\\(a\\) b'), mode('\\[ a '), mode('\\[a\\] b')], ['math', 'text', 'math', 'text'], '\\( \\) and \\[ \\]');
eq([mode('a \\\\[2pt] b'), mode('$x$$y')], ['text', 'math'], '\\\\[2pt] is a line break; $x$$y is two inline formulas');
// environments
eq(at('\\begin{equation} a'), { mode: 'math', mathEnv: 'equation', numbered: true, display: true, preamble: false, openEnvs: ['equation'] }, 'equation');
eq(at('\\begin{align*} a'), { mode: 'math', mathEnv: 'align*', numbered: false, display: true, preamble: false, openEnvs: ['align*'] }, 'align*');
eq([at('\\begin{gather} a').numbered, at('\\begin{math} a').numbered, at('\\[ a').numbered, at('$a').mathEnv], [true, false, false, null], 'numbered or not');
eq([at('\\[ a').display, at('$$ a').display, at('$a').display, at('\\begin{math} a').display, at('\\begin{tikzcd} a').display], [true, true, false, false, false], 'display or inline');
eq(at('\\begin{document}\n\\begin{itemize}\n\\item $'), { mode: 'math', mathEnv: null, numbered: false, display: false, preamble: false, openEnvs: ['document', 'itemize'] }, 'nested');
eq([mode('\\begin{tikzcd} A \\arrow[r, "\\alp'), mode('\\begin{mathpar} '), mode('\\begin{numcases}{f(x)=} '), at('\\begin{tikzcd} a').numbered], ['math', 'math', 'math', false], 'tikzcd, mathpar and numcases are maths');
eq([at('\\begin{equation}\\begin{aligned} a').mathEnv, at('\\begin{figure}\\end{figure} ').openEnvs], ['equation', []], 'the innermost maths environment, and closed ones');
// text inside maths, and maths inside that
eq([mode('\\begin{align} \\text{for '), mode('\\begin{align} \\text{for} '), mode('\\begin{align} \\text{if $x'), mode('$\\operatorname*{ar')], ['text', 'math', 'math', 'text'], '\\text{} in maths');
eq([mode('\\mbox{$x$ and '), mode('$\\frac{a}{\\text{b}} + ')], ['text', 'math'], 'braces');
// escapes, comments, verbatim
eq([mode('\\$ '), mode('$a \\$ b'), mode('50\\% $x')], ['text', 'math', 'math'], '\\$ and \\%');
eq([mode('% $ comment\n'), mode('$x % $\n')], ['text', 'math'], 'a $ in a comment');
eq([mode('\\begin{verbatim}$\\end{verbatim} '), at('\\begin{verbatim} $').openEnvs, mode('\\verb|$| '), mode('\\verb*+$+ ')], ['text', ['verbatim'], 'text', 'text'], 'verbatim');
eq(
  ['Run \\lstinline{echo $HOME} ', '\\lstinline[style=x]!a $ b! ', '\\mintinline{bash}{echo $HOME} ', '\\mintinline{bash}!echo $HOME! ', '\\url{a$b} ', '\\href{a$b}{c} ', '\\verb@$@ '].map(mode),
  ['text', 'text', 'text', 'text', 'text', 'text', 'text'],
  'inline verbatim'
);
eq([mode('\\url{https://x.org/a%20b} where $x\n= '), mode('\\href{a}{$x'), mode('\\url{a$')], ['math', 'math', 'text'], 'a % in a URL, \\href’s text, an open \\url');
eq([mode('$x\n\ny'), mode('$x\ny')], ['text', 'math'], 'a blank line ends a stray $');
// the preamble
// definitions: their body is either, and \\begin, \\end and $ in it open nothing
eq([mode('\\newcommand{\\R}{\\mathb'), mode('\\DeclareMathOperator{\\Tr}{\\mathr'), mode('\\newcommand{\\abs}[1]{\\left\\lvert #1 \\rig'), mode('\\def\\x#1{a')], ['both', 'both', 'both', 'both'], 'in a definition');
eq([mode('\\newcommand{\\R}{\\mathbb{R}} '), mode('\\newcommand\\R{x} '), mode('\\newenvironment{x}\n  {\\begin{center}}\n  {\\end{center}} '), mode('\\newcommand{\\be}%\n  {\\begin{equation}}% x\n ')], ['text', 'text', 'text', 'text'], 'after a definition');
eq(at('\\newcommand{\\ee}{\\end{equation}}\\newcommand{\\be}{\\begin{equation}}\\begin{document}\ntext \\sec'), { mode: 'text', mathEnv: null, numbered: false, display: false, preamble: false, openEnvs: ['document'] }, '\\begin and \\end in definitions');
eq([mode('\\def\\@x{$} a'), mode('\\ensuremath{\\alp'), mode('\\ensuremath{a} '), mode('$\\ensuremath{a} ')], ['text', 'math', 'text', 'math'], '$ in a definition, and \\ensuremath');
const doc = '\\documentclass{article}\n|\n\\begin{document}\nx\n\\end{document}';
eq([at(doc).preamble, at(doc.replace('|', '').replace('x', '|')).preamble, at('\\usepackage{x}\n|').preamble], [true, false, false], 'preamble');

// argument context
const arg = (text: string) => argContext(text, text.length);
eq(arg('see \\ref{sec:'), { command: 'ref', from: 9, typed: 'sec:' }, '\\ref');
eq(arg('\\cite[see][p.~3]{smith, jo'), { command: 'cite', from: 24, typed: 'jo' }, '\\cite with options and a comma list');
eq([arg('\\citep{a,b,')?.typed, arg('\\Textcite{')?.command, arg('\\autoref*{')?.command], ['', 'Textcite', 'autoref'], 'cite and ref variants');
eq(arg('\\includegraphics[width=0.5\\linewidth]{fig')?.typed, 'fig', '\\includegraphics after [width]');
eq(arg('\\usepackage[utf8]{inputenc,ams')?.typed, 'ams', '\\usepackage');
eq([arg('\\label{eq:'), arg('\\ref{a} more'), arg('\\textbf{x'), arg('\\setcitestyle{')], [null, null, null, null], 'not \\label, after the braces, or other commands');
eq(arg('\\cite{smith20, % see, also\n  jo'), { command: 'cite', from: 29, typed: 'jo' }, 'a comma in a comment');
eq([arg(`\\cite{${'abcdefghijk, '.repeat(30)}jo`)?.typed, arg('\\includegraphics<2>[width=3cm]{fig')?.typed], ['jo', 'fig'], 'a long \\cite list, and a beamer overlay');

// the command lists: each name once per mode
const seen = new Set<string>();
const twice = [...MATH_COMMANDS, ...TEXT_COMMANDS].flatMap((c) => (c.mode === 'both' ? ['math', 'text'] : [c.mode]).map((m) => `${m} \\${c.name}`)).filter((k) => seen.has(k) || !seen.add(k));
eq(twice, [], 'no command twice in a mode');

// project data
eq(scanTex('\\label{fig:a} \\label{#1}').labels, ['fig:a'], 'labels');
eq(
  scanTex('\\newcommand{\\norm}[1]{}\\newcommand\\abs[2][x]{}\\NewDocumentCommand{\\set}{O{} m m}{}\\DeclareMathOperator*{\\argmax}{arg\\,max}\\DeclarePairedDelimiter{\\ceil}{\\lceil}{\\rceil}\\def\\eps{}\\let\\oldsec\\section').commands,
  [['norm', 1, false], ['abs', 1, false], ['set', 2, false], ['argmax', 0, true], ['ceil', 1, true], ['eps', 0, false], ['oldsec', 0, false]],
  'commands'
);
eq(scanTex('\\def\\thesis@title{}\\def\\ps@thesis{}\\let\\NAT@parse\\undefined\\newcommand\\text@hook{}').commands, [], 'not internal \\name@part macros');
const bib = '@string{jfm = "J. Fluid Mech."}\n@comment{x}\n@article{smith20,\n  author = {Smith, John and Doe, Jane},\n  title = {The {GPU} Story},\n  year = 2020,\n}\n@book{public19, author = "Jane Q. Public", date = {2019-05-01}, title = "A Book"}';
eq(parseBib(bib), [{ key: 'smith20', author: 'Smith', year: '2020', title: 'The GPU Story' }, { key: 'public19', author: 'Public', year: '2019', title: 'A Book' }], 'parseBib');

// completion
const project: Project = {
  mainFile: 'paper/main.tex',
  files: ['paper/main.tex', 'paper/sections/intro.tex', 'paper/figs/a.png', 'logo.pdf', 'paper/refs.bib', 'house.sty'],
  scans: [{ ...scanTex('\\label{sec:intro}\\newcommand{\\R}{\\mathbb{R}}\\DeclareMathOperator{\\Tr}{Tr}'), file: 'paper/sections/intro.tex' }],
  bib: parseBib(bib)
};
function complete(text: string, p: Project = NO_PROJECT, open = '') {
  const pos = text.includes('|') ? text.indexOf('|') : text.length;
  return latexCompletionSource(() => p, () => open)(new CompletionContext(EditorState.create({ doc: text.replace('|', '') }), pos, false));
}
/** The labels in the order the list shows them (prefix matches before fuzzy ones, then by boost and label). */
function shown(text: string, p?: Project, open?: string) {
  const result = complete(text, p, open);
  if (!result) return [];
  const typed = text.slice(result.from, text.includes('|') ? text.indexOf('|') : text.length);
  const score = (o: Completion) => (o.label.startsWith(typed) ? 1000 : 0) + (o.boost ?? 0);
  return result.options.filter((o) => o.label.startsWith(typed)).sort((a, b) => score(b) - score(a) || a.label.localeCompare(b.label)).map((o) => o.label);
}

eq([shown('$\\ve').includes('\\vec{}'), shown('$\\ve').some((l) => l.startsWith('\\begin'))], [true, false], '$\\ve offers \\vec, not \\begin{verse}');
eq(complete('$\\ve')!.options.some((o) => o.label.startsWith('\\begin')), false, 'no environment at all, even a fuzzy one');
const unnumbered = shown('\\begin{align*}\n  r_x &= 1+2\\la');
eq([unnumbered[0], unnumbered.includes('\\label{}')], ['\\lambda', false], 'in align*, \\lambda first and no \\label');
const numbered = shown('\\begin{align}\n  a &= \\la');
eq([numbered[0], numbered.includes('\\label{}')], ['\\lambda', true], 'in align, \\lambda before \\label');
eq(numbered.indexOf('\\lambda') < numbered.indexOf('\\label{}'), true, 'symbols outrank \\label');
eq([shown('see \\ve').some((l) => l.startsWith('\\begin')), shown('see \\ve').includes('\\vec{}'), shown('see \\ve').includes('\\verb')], [false, false, false], 'text \\ve offers no \\begin{verse} and no maths');
// a scattered fuzzy match is dropped, and a name no command holds lists the environments it starts
eq(shown('see \\ali').includes('\\smallskip'), false, '\\ali does not find \\smallskip');
eq(shown('see \\ali').slice(0, 2), ['\\align', '\\align*'], '\\ali offers align and align*');
eq(complete('see \\ali')!.options.find((o) => o.label === '\\align')?.displayLabel, '\\begin{align}', 'shown as \\begin{align}');
eq(sharedStart('\\ali', complete('see \\ali')!.options.map((o) => o.label)), null, 'Tab picks \\align rather than filling in');
eq(complete('see /ali')!.options.find((o) => o.label === '/align')?.displayLabel, '\\begin{align}', 'after /, still shown as \\begin{align}');
eq(complete('$\\eps')!.options.some((o) => o.label === '\\varepsilon'), true, 'a name inside another still counts: \\eps finds \\varepsilon');

eq(sharedStart('\\beg', complete('see \\beg')!.options.map((o) => o.label)), '\\begin{', '"\\beg" still fills to "\\begin{"');
eq(sharedStart('\\end', complete('\\begin{itemize}\n\\begin{enumerate}\n\\end')!.options.map((o) => o.label)), '\\end{', 'and "\\end" to "\\end{"');
const inMaths = shown('\\[ \\begin{');
eq([inMaths.includes('\\begin{aligned}'), inMaths.includes('\\begin{cases}'), inMaths.includes('\\begin{pmatrix}'), inMaths.includes('\\begin{figure}'), inMaths.includes('\\begin{align}')], [true, true, true, false, false], '\\begin{ in maths');
eq([shown('\\begin{al').includes('\\begin{aligned}'), shown('\\begin{al').includes('\\begin{align}')], [false, true], '\\begin{ in text leaves out the maths-only ones');
eq([complete('$a /x'), complete('$a /'), shown('see /sec')[0]], [null, null, '/section{}'], '"/" is division in maths, a trigger in text');
eq(complete('\\begin{verbatim}\n\\al'), null, 'nothing in verbatim');
eq([shown('\\begin{verbatim}\nfoo\n\\end{'), complete('\\begin{verbatim}\n\\ref{', project)], [['\\end{verbatim}'], null], 'in verbatim, \\end{ closes it and \\ref{ lists nothing');
eq(shown('\\begin{itemize}\n\\begin{enumerate}\n\\end{'), ['\\end{enumerate}', '\\end{itemize}'], '\\end{ offers the open environments, innermost first');
eq(shown('\\begin{itemize}\n\\item a\n\\begin{itemize}\n\\item b\n\\end{'), ['\\end{itemize}'], 'a nested environment once');
eq([shown('\\begin{tabular}{cc}\na & b \\\\\\hl').includes('\\hline'), complete('a \\\\hl')], [true, null], 'a command after \\\\, not after an escaped "\\"');
eq(sharedStart('\\be', complete('see \\be')!.options.map((o) => o.label)), '\\begin{', '"\\be" fills to "\\begin{"');
eq([shown('\\begin{equation*} x = 1 \\ta').includes('\\tag{}'), shown('\\[ x \\ta').includes('\\tag{}'), shown('$x \\ta').includes('\\tag{}')], [true, true, false], '\\tag in any display, not inline');
// in a definition both kinds of command, and environments
const macros = '\\documentclass{article}\n\\newcommand{\\R}{\\mathb|}\n\\begin{document}';
eq([shown(macros).includes('\\mathbb{}'), shown(macros.replace('\\mathb|', '\\sec|')).includes('\\section{}'), shown('\\ensuremath{\\alp').includes('\\alpha')], [true, true, true], 'maths in a definition and \\ensuremath');
eq(shown('\\newcommand{\\be}{\\begin{').includes('\\begin{equation}') && shown('\\newcommand{\\be}{\\begin{').includes('\\begin{pmatrix}'), true, 'any environment in a definition');
// packages, the preamble and the project's own commands
eq([shown('$\\pd').includes('\\pdv{}{}'), shown('\\usepackage{physics}\n$\\pd').includes('\\pdv{}{}')], [false, true], 'a package’s commands once it’s loaded');
eq(complete('$\\math')!.options.find((o) => o.label === '\\mathbb{}')?.detail, 'amssymb', 'amssymb is always offered, with its name');
eq(complete('$\\lam')!.options.find((o) => o.label === '\\lambda')?.detail, 'λ', 'the glyph');
const preamble = '\\documentclass{article}\n\\use|\n\\begin{document}\n\\end{document}';
eq([shown(preamble)[0], shown(preamble.replace('\\use|\n\\begin{document}', '\\begin{document}\n\\use|')).includes('\\usepackage{}')], ['\\usepackage{}', false], 'preamble commands first in the preamble, gone after');
eq([shown('$\\R', project).includes('\\R'), shown('$\\T', project).includes('\\Tr'), shown('see \\T', project).includes('\\Tr')], [true, true, false], 'the project’s commands; \\DeclareMathOperator only in maths');
eq([shown('\\usepackage{mathtools}\\DeclarePairedDelimiter{\\abs}{\\lvert}{\\rvert}\n$\\ab')[0], shown('\\DeclarePairedDelimiter{\\abs}{\\lvert}{\\rvert}\nsee \\ab').includes('\\abs{}')], ['\\abs{}', false], '\\DeclarePairedDelimiter');
// a redefinition doesn't replace what a package defines, and a class's internals aren't offered
const redefined: Project = { ...NO_PROJECT, scans: [{ ...scanTex('\\renewcommand\\section{\\@startsection{section}{1}{\\z@}}\\renewcommand{\\phi}{\\varphi}'), file: 'house.sty' }] };
eq([shown('\\begin{document}\n\\sec', redefined)[0], shown('The \\ph', redefined).includes('\\phi'), complete('$\\ph', redefined)!.options.find((o) => o.label === '\\phi')?.detail], ['\\section{}', false, 'ϕ'], 'a redefined \\section and \\phi');
const ieee: Project = { ...NO_PROJECT, scans: [{ ...scanTex('\\documentclass{IEEEtran}'), file: 'main.tex' }, { ...scanTex('\\def\\labelenumi{}\\def\\labelitemi{}\\def\\label#1{}'), file: 'IEEEtran.cls' }] };
eq(shown('\\begin{align*}\n  r &= \\la', ieee)[0], '\\lambda', 'a shipped .cls doesn’t bury \\lambda');
// what classes and packages load
const has = (text: string, label: string) => shown(text).some((l) => l.startsWith(label));
eq(
  [has('\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}\n\\inc', '\\includegraphics'), has('\\documentclass{elsarticle}\n\\citep', '\\citep{}'), has('\\documentclass{acmart}\n\\citep', '\\citep{}'), has('\\usepackage{tikz}\n\\textcol', '\\textcolor{}{}'), has('\\usepackage{tabularx}\n\\newcolumntyp', '\\newcolumntype'), has('\\documentclass{scrreprt}\n\\KOMAo', '\\KOMAoptions')],
  [true, true, true, true, true, true],
  'packages that classes and packages load'
);
eq(
  [has('\\usepackage{biblatex}\n\\citeau', '\\citeauthor{}'), has('\\usepackage{braket}\n$\\br', '\\bra{}'), has('\\usepackage{physics}\n$\\qt', '\\qty{}{}'), has('\\documentclass{revtex4-2}\n\\affil', '\\affiliation{}'), has('\\usepackage{dsfont}\n$\\mathd', '\\mathds{}')],
  [true, true, true, true, true],
  'a command more than one package defines'
);
eq(has('\\usepackage{hyperref}\n\\begin{document}\n\\hyperse', '\\hypersetup{}'), true, '\\hypersetup in the body');
eq([shown('title = {\\ve', NO_PROJECT, 'refs.bib').includes('\\vec{}'), shown('title = {\\sec', NO_PROJECT, 'refs.bib').includes('\\section{}')], [true, true], 'a .bib isn’t read for its context: every command');
// arguments
const refs = complete('\\label{eq:a} \\ref{', project)!;
eq(refs.options.map((o) => [o.label, o.detail ?? '']), [['eq:a', ''], ['sec:intro', 'intro.tex']], '\\ref{ lists labels, with their file');
const cites = complete('\\cite{a, ', project)!;
eq([cites.from, cites.options.map((o) => [o.label, o.detail])], [9, [['smith20', 'Smith 2020'], ['public19', 'Public 2019']]], '\\cite{a, lists keys after the comma');
eq(complete('\\includegraphics[width=\\linewidth]{', project)!.options.map((o) => o.label), ['figs/a.png', 'logo.pdf'], 'images from the main file’s folder');
eq(complete('\\input{', project)!.options.map((o) => o.label), ['sections/intro'], '\\input without .tex');
eq([complete('\\bibliography{', project)!.options.map((o) => o.label), complete('\\addbibresource{', project)!.options.map((o) => o.label)], [['refs'], ['refs.bib']], '.bib files');
eq(complete('\\usepackage{ams', project)!.options.map((o) => o.label).slice(0, 2), ['house', 'amsmath'], 'the project’s own packages, then the known ones');
eq(sharedStart('/in', ['sections/intro', 'xintro']), null, 'Tab never fills a path in');

/** An editor on the text with the cursor at "|": `pick` applies the named option there, `marked` marks the cursor. */
function editor(text: string) {
  let state = EditorState.create({ doc: text.replace('|', ''), selection: EditorSelection.cursor(text.indexOf('|')) });
  const view = {
    get state() {
      return state;
    },
    dispatch: (...specs: (TransactionSpec | Transaction)[]) => (state = specs[0] instanceof Transaction ? specs[0].state : state.update(...(specs as TransactionSpec[])).state)
  } as unknown as EditorView;
  return {
    view,
    type: (insert: string) => view.dispatch(state.replaceSelection(insert)),
    pick(label: string) {
      const pos = state.selection.main.head;
      const result = latexCompletionSource(() => NO_PROJECT)(new CompletionContext(state, pos, false))!;
      const option = result.options.find((o) => o.label === label)!;
      if (typeof option.apply === 'string') view.dispatch({ changes: { from: result.from, to: pos, insert: option.apply }, selection: { anchor: result.from + option.apply.length } });
      else option.apply!(view, option, result.from, pos);
    },
    marked: () => state.doc.toString().slice(0, state.selection.main.head) + '|' + state.doc.toString().slice(state.selection.main.head)
  };
}
/** Applies the named option at "|" and returns the text with the cursor marked; `tabs` presses Tab in the snippet. */
function accept(text: string, label: string, tabs = 0) {
  const e = editor(text);
  e.pick(label);
  for (let i = 0; i < tabs; i += 1) nextSnippetField(e.view);
  return e.marked();
}
eq([accept('$\\fr|', '\\frac{}{}'), accept('$\\fr|', '\\frac{}{}', 1), accept('$\\fr|', '\\frac{}{}', 2)], ['$\\frac{|}{}', '$\\frac{}{|}', '$\\frac{}{}|'], 'arguments are fields, and Tab goes on, then past the end');
eq(accept('$\\alp|', '\\alpha'), '$\\alpha|', 'a command without arguments is just its name');
eq([accept('$\\left|', '\\left( \\right)'), accept('$\\left|', '\\left\\{ \\right\\}')], ['$\\left( | \\right)', '$\\left\\{ | \\right\\}'], 'a snippet, with escaped braces');
eq(accept('\\begin{align}\n\\end{|}', '\\end{align}'), '\\begin{align}\n\\end{align}|', '\\end{ takes the } closeBrackets added');
const nested = editor('$\\fr|');
nested.pick('\\frac{}{}');
nested.type('\\sq');
nested.pick('\\sqrt{}');
nested.type('x');
nextSnippetField(nested.view);
eq(nested.marked(), '$\\frac{\\sqrt{x}}{|}', 'a command in another’s field: Tab goes on to that one’s next field');

// the walk reads the .bib files the project names, or every one when it names none
const tree: Record<string, string> = { 'main.tex': '\\bibliography{refs}', 'refs.bib': '@misc{a, title={A}}', 'old.bib': '@misc{b, title={B}}' };
const read = async (path: string) => tree[path];
(async () => {
  eq((await scanProject('main.tex', new Set(Object.keys(tree)), read)).bib.map((e) => e.key), ['a'], 'the named .bib');
  tree['main.tex'] = '';
  eq((await scanProject('main.tex', new Set(Object.keys(tree)), read)).bib.map((e) => e.key), ['a', 'b'], 'every .bib');
  console.log('context.check: ok');
})();
