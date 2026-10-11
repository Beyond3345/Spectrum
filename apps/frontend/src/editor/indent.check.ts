// Self-check for Tab and the automatic \end{…}. Run (latexEditor imports CodeMirror, so bundle it first):
// npx esbuild apps/frontend/src/editor/indent.check.ts --bundle --platform=node --log-level=warning | node
import { EditorSelection, EditorState } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { closeEnvironment, indentation, insertIndent, sharedStart } from './latexEditor';

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
console.log('indent.check: ok');
