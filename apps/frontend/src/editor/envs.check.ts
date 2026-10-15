// Self-check for \begin{ completion: what a project loads and defines, and what the list offers. Run:
// npx esbuild apps/frontend/src/editor/envs.check.ts --bundle --platform=node --log-level=warning | node
import { EditorSelection, EditorState } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { latexCompletionSource } from './latexEditor';
import { COMMON_ENVS, ENV_SNIPPETS, KERNEL_ENVS, NO_PROJECT, PACKAGE_ENVS, availableEnvs, scanProject, scanTex } from './latexEnvs';
import type { TexScan } from './latexEnvs';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const envs = (...sources: string[]) => availableEnvs(sources.map(scanTex));
const pick = (map: Map<string, string>, ...names: string[]) => names.map((n) => map.get(n) ?? null);

eq(pick(envs(''), 'equation*', 'align*', 'gather', 'document', 'lstlisting'), ['amsmath', 'amsmath', 'amsmath', '', null], 'a blank document still offers the amsmath displays');
eq(pick(envs('\\usepackage[inline]{amsmath, tikz-cd,\n  listings}'), 'tikzcd', 'tikzpicture', 'lstlisting', 'xalignat'), ['tikz-cd', 'tikz', 'listings', 'amsmath'], 'comma lists, options and implied packages');
eq(pick(envs('% \\usepackage{listings}\n50\\% \\usepackage{minted} \\\\% \\usepackage{tabularx}'), 'lstlisting', 'minted', 'tabularx'), [null, 'minted', null], 'commented out, after \\% and after \\\\');
eq(pick(envs('\\documentclass[11pt]{beamer}'), 'frame', 'proof'), ['beamer', 'amsthm'], 'a class and what it loads');
eq(pick(envs('\\usetikzlibrary{arrows, cd}\\tcbuselibrary{most}'), 'tikzcd', 'tcbraster'), ['tikz', 'tcolorbox'], 'libraries');
eq(
  scanTex('\\newtheorem{theorem}{Theorem}[section]\n\\newtheorem*{remark}{Remark}\n\\declaretheorem[style=definition]{definition, example}\n\\newtcbtheorem[number within=section]{lem}{Lemma}{}{lem}\n\\newenvironment{notes}{}{}\n\\newenvironment{#1}{}{}\n\\newtheoremstyle{plain2}').defined,
  ['notes', 'theorem', 'remark', 'definition', 'example', 'lem', 'lem*'],
  'definitions'
);
eq(
  scanTex('\\externaldocument[notes:]{ELEC2410_Lecture_Notes}\n\\zexternaldocument*[A-][http://x.org/a.pdf]{sub/other.tex}\n\\externaldocument{plain}\n% \\externaldocument[x:]{gone}').externals,
  [['notes:', 'ELEC2410_Lecture_Notes'], ['A-', 'sub/other.tex'], ['', 'plain']],
  'xr externals: the prefix, further options, none commented out'
);
const known = new Set([...COMMON_ENVS, ...KERNEL_ENVS, ...Object.values(PACKAGE_ENVS).flat()]);
eq(Object.keys(ENV_SNIPPETS).filter((n) => !known.has(n)), [], 'every snippet is for an environment the lists offer');

/** The completion source's options for the text before the cursor ("|", or the end). */
function complete(text: string, scans: TexScan[] = []) {
  const at = text.includes('|') ? text.indexOf('|') : text.length;
  const state = EditorState.create({ doc: text.replace('|', '') });
  return latexCompletionSource(() => ({ ...NO_PROJECT, scans }))(new CompletionContext(state, at, false));
}
const labels = (text: string, scans?: TexScan[]) => complete(text, scans)?.options.map((o) => o.label) ?? [];

eq(['\\begin{align*}', '\\begin{gather}', '\\begin{equation*}'].every((l) => labels('\\begin{al').includes(l)), true, '\\begin{al offers the common ones');
eq(labels('\\begin{al').includes('\\begin{algorithm}'), false, 'not packages that aren’t loaded');
eq(labels('\\usepackage{algorithm2e}\n\\begin{al').includes('\\begin{algorithm}'), true, 'the open file’s own packages');
eq(labels('\\begin{al', [scanTex('\\newtheorem{claim2-b}{Claim}')]).includes('\\begin{claim2-b}'), true, 'the project’s own, digits and hyphens included');
eq(complete('\\begin{claim2-b')?.from, 0, 'a name with digits and a hyphen keeps the list');
const slash = complete('see /sec')?.options.find((o) => o.label === '/section{}');
eq([slash?.displayLabel, complete('see /sec')?.from], ['\\section{}', 4], '"/" matches labels that start with "/" and shows them with "\\"');
eq(complete('http://x'), null, 'never in URLs');
// a bare trigger matches every label alike, so CodeMirror orders the list by boost, then label
const first = (text: string) => [...complete(text)!.options].sort((a, b) => (b.boost ?? 0) - (a.boost ?? 0) || a.label.localeCompare(b.label))[0].label;
eq([first('see \\'), first('see /')], ['\\appendix', '/appendix'], 'a bare "\\" or "/" lists the common commands first');
eq(labels('see \\').some((l) => l.startsWith('\\begin{')), false, 'and environments only from "\\beg" on');

/** Picks the named entry for the text with the cursor at "|" and returns the result with the cursor marked. */
function accept(text: string, label: string) {
  const at = text.indexOf('|');
  let state = EditorState.create({ doc: text.replace('|', ''), selection: EditorSelection.cursor(at) });
  const result = complete(text)!;
  const option = result.options.find((o) => o.label === label)! as Completion & { apply: (...args: unknown[]) => void };
  const view = { get state() { return state; }, dispatch: (...specs: TransactionSpec[]) => (state = state.update(...specs).state) } as unknown as EditorView;
  option.apply(view, option, result.from, at);
  const doc = state.doc.toString();
  return doc.slice(0, state.selection.main.head) + '|' + doc.slice(state.selection.main.head);
}
eq(accept('    \\begin{tab|}', '\\begin{tabular}'), '    \\begin{tabular}{lcc}\n        |\n    \\end{tabular}', 'arguments, the indent and the } closeBrackets added');
eq(accept('\\begin{fig|', '\\begin{figure}'), '\\begin{figure}\n    \\centering\n    \\includegraphics[width=0.9\\linewidth]{|}\n    \\caption{}\n    \\label{fig:}\n\\end{figure}', 'the cursor goes into the {} that ends its line');
eq(accept('\\usepackage{algorithm2e}\n\\begin{algorithm*|', '\\begin{algorithm*}').includes('\\KwIn{}'), true, 'algorithm2e’s body for algorithm* too');
eq(accept('/beg|', '/begin{subequations}'), '\\begin{subequations}\n    \\begin{align}\n        |\n    \\end{align}\n\\end{subequations}', 'nested environments from "/"');

// the walk: \input from the main file's folder, then the root; local packages, and what they load
const tree: Record<string, string> = {
  'paper/main.tex': '\\documentclass{article}\n\\usepackage{house}\n\\input{sections/intro}\n\\input{shared}\n% \\input{gone}\n\\input{figs/plot.pgf}\n\\input{appendix.tex}',
  'paper/sections/intro.tex': '\\newtheorem{lemma}{Lemma}',
  'shared.tex': '\\usepackage{wrapfig}',
  'house.sty': '\\RequirePackage{tcolorbox}\n\\newtcolorbox{note}{}',
  'gone.tex': '\\newtheorem{gone}{Gone}',
  'paper/figs/plot.pgf': '\\newtheorem{plot}{Plot}',
  'paper/appendix.tex': '\\newtheorem{extra}{Extra}'
};
const files = new Set(Object.keys(tree));
const reads: string[] = [];
const read = async (path: string) => (reads.push(path), tree[path]);
(async () => {
  const { scans } = await scanProject('paper/main.tex', files, read);
  eq(pick(availableEnvs(scans), 'lemma', 'note', 'tcolorbox', 'wrapfigure', 'gone', 'extra', 'plot'), ['this project', 'this project', 'tcolorbox', 'wrapfig', null, 'this project', null], 'the project walk');
  eq(reads.includes('paper/figs/plot.pgf'), false, 'an \\input figure that isn’t .tex is never read');
  const { scans: again } = await scanProject('paper/main.tex', files, read);
  eq(again.every((scan, i) => scan === scans[i]), true, 'an unchanged rescan reuses every scan');
  tree['shared.tex'] = '\\newtheorem{fresh}{Fresh}';
  const { scans: changed } = await scanProject('paper/main.tex', files, read);
  eq([changed.filter((scan, i) => scan !== scans[i]).length, pick(availableEnvs(changed), 'fresh')], [1, ['this project']], 'a rescan scans only the changed file');
  // xr: the tutorial offers the notes' labels (and those of the files they \input) prefixed, and nothing else of theirs;
  // the notes link back, which isn't followed
  const docs: Record<string, string> = {
    'unit/tutorial.tex': '\\documentclass{article}\n\\usepackage{xr-hyper}\n\\externaldocument[notes:]{notes}\n\\label{q:one}',
    'unit/notes.tex': '\\documentclass{article}\n\\usepackage{tikz}\n\\externaldocument[tut:]{tutorial}\n\\newcommand\\ohm{\\Omega}\n\\label{eq:ohm}\n\\input{ch1}',
    'unit/ch1.tex': '\\label{sec:one}'
  };
  const docRead = async (path: string) => docs[path];
  const { scans: linked } = await scanProject('unit/tutorial.tex', new Set(Object.keys(docs)), docRead);
  eq(complete('\\eqref{notes:|}', linked)?.options.map((o) => [o.label, o.detail]), [['notes:eq:ohm', 'notes.tex'], ['notes:sec:one', 'notes.tex'], ['q:one', 'tutorial.tex']], 'prefixed labels');
  eq([pick(availableEnvs(linked), 'tikzpicture'), linked.flatMap((s) => s.commands)], [[null], []], 'only labels from the other document');
  const { scans: back } = await scanProject('unit/notes.tex', new Set(Object.keys(docs)), docRead);
  eq(back.flatMap((s) => s.labels).filter((l) => l.startsWith('tut:')), ['tut:q:one'], 'and the other way, without looping');
  console.log('envs.check: ok');
})();
