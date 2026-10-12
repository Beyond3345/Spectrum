// Self-check for Tab and the automatic \end{…}. Run (latexEditor imports CodeMirror, so bundle it first):
// npx esbuild apps/frontend/src/editor/indent.check.ts --bundle --platform=node --log-level=warning | node
import { EditorSelection, EditorState } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { closeEnvironment, indentation, insertIndent, jumpHighlight, setJumpHighlight, sharedStart, wrapInMaths } from './latexEditor';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

/** Runs a command on text with the cursor at "|" and returns the result with the cursor marked. */
function run(command: (view: EditorView) => boolean, text: string) {
  const at = text.indexOf('|');
  let state = EditorState.create({ doc: text.replace('|', ''), selection: EditorSelection.cursor(at), extensions: [indentation] });
  const view = { get state() { return state; }, dispatch: (...specs: TransactionSpec[]) => (state = state.update(...specs).state) } as unknown as EditorView;
  const handled = command(view);
  const doc = state.doc.toString();
  const head = state.selection.main.head;
  return { handled, text: doc.slice(0, head) + '|' + doc.slice(head) };
}

eq(run(insertIndent, 'ab|c'), { handled: true, text: 'ab  |c' }, 'Tab fills to the next stop of four');
eq(run(insertIndent, '    |x'), { handled: true, text: '        |x' }, 'Tab at an indent adds a full step');

eq(run(closeEnvironment, '    \\begin{align*}|'), { handled: true, text: '    \\begin{align*}\n        |\n    \\end{align*}' }, 'closes at the same indent');
eq(run(closeEnvironment, '\\begin{enumerate}[label=\\roman*.]|'), { handled: true, text: '\\begin{enumerate}[label=\\roman*.]\n    |\n\\end{enumerate}' }, 'with options');
eq(run(closeEnvironment, '\\begin{itemize}|\n\\end{itemize}').handled, false, 'already closed');
eq(run(closeEnvironment, '\\begin{itemize} text|').handled, false, 'only straight after \\begin{…}');
eq(run(closeEnvironment, '\\begin{it|emize}').handled, false, 'only at the end of the line');
const labels = ['\\section{}', '\\cite{}', '\\citep{}', '\\citet{}', '\\textbf{}', '\\textit{}', '\\begin{itemize}', '\\begin{equation}', '\\begin{enumerate}'];
eq(sharedStart('\\beg', labels), '\\begin{', 'Tab fills \\beg up to \\begin{');
eq(sharedStart('/beg', labels), '\\begin{', '/ stands for \\');
eq(sharedStart('\\cit', labels), '\\cite', 'stops where the entries differ');
eq(sharedStart('\\begin{e', labels), null, 'nothing shared past the typed text');
eq(sharedStart('\\sec', labels), null, 'a single entry is picked, not typed out');
eq(sharedStart('\\begin{eq', labels), null, 'one environment left');
eq(sharedStart('\\xyz', labels), null, 'no entry');
// "$" around a selection: each range wrapped and still selected (backwards too), plain "$" left to the editor
function wrap(doc: string, ranges: [number, number][]) {
  let state = EditorState.create({ doc, selection: EditorSelection.create(ranges.map(([a, h]) => EditorSelection.range(a, h))), extensions: [EditorState.allowMultipleSelections.of(true)] });
  const view = { get state() { return state; }, dispatch: (...specs: TransactionSpec[]) => (state = state.update(...specs).state) } as unknown as EditorView;
  const handled = wrapInMaths(view, '$');
  return { handled, doc: state.doc.toString(), ranges: state.selection.ranges.map((r) => [r.anchor, r.head]) };
}
eq(wrap('a x+y b', [[2, 5]]), { handled: true, doc: 'a $x+y$ b', ranges: [[3, 6]] }, '$ wraps the selection and keeps it selected');
eq(wrap('a x+y b', [[5, 2]]), { handled: true, doc: 'a $x+y$ b', ranges: [[6, 3]] }, 'a backwards selection too');
eq(wrap('x and y', [[0, 1], [6, 7]]), { handled: true, doc: '$x$ and $y$', ranges: [[1, 2], [9, 10]] }, 'every selection');
eq(wrap('ab', [[1, 1]]).handled, false, 'no selection: "$" is typed as usual');
// the jump highlight: whole lines, faded where they are, gone once the text changes
const highlighted = (state: EditorState) => {
  const lines: string[] = [];
  state.field(jumpHighlight).between(0, state.doc.length, (from, _to, deco) => void lines.push(`${state.doc.lineAt(from).number} ${deco.spec.class}`));
  return lines;
};
let lit = EditorState.create({ doc: 'one\ntwo\nthree\nfour', extensions: [jumpHighlight] }).update({ effects: setJumpHighlight.of({ from: 5, to: 10 }) }).state;
eq(highlighted(lit), ['2 cm-jump-highlight', '3 cm-jump-highlight'], 'the lines from–to touch');
lit = lit.update({ effects: setJumpHighlight.of('fade') }).state;
eq(highlighted(lit), ['2 cm-jump-highlight cm-jump-fading', '3 cm-jump-highlight cm-jump-fading'], 'fades in place');
eq(highlighted(lit.update({ changes: { from: 0, insert: 'x' } }).state), [], 'typing ends it');
eq(highlighted(lit.update({ effects: setJumpHighlight.of(null) }).state), [], 'cleared');
console.log('indent.check: ok');
