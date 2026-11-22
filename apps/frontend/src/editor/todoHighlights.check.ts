// Self-check for a to-do's highlight following edits, and Add to-do here's link. Run:
// npx esbuild apps/frontend/src/editor/todoHighlights.check.ts --bundle --platform=node --format=esm --outfile=<scratch>/hl.mjs && node <scratch>/hl.mjs
import { EditorSelection, EditorState } from '@codemirror/state';
import { linkOf, setTodoMarks, todoLinkAt, todoMarksField } from './todoHighlights';
import type { TodoMark } from './todoHighlights';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const doc = 'Intro.\nThe result holds for all n.\nEnd.';
const from = doc.indexOf('result');
const mark: TodoMark = { id: 't', file: 'main.tex', from, to: from + 6, hue: 3, title: 'Cite this', words: 'result' };
let state = EditorState.create({ doc, extensions: [todoMarksField] }).update({ effects: setTodoMarks.of([mark]) }).state;
const at = () => state.field(todoMarksField)[0];
const shown = () => (at().gone ? `(${at().gone})` : state.sliceDoc(at().from, at().to));
const edit = (changes: { from: number; to?: number; insert?: string }, userEvent?: string) => {
  state = state.update({ changes, ...(userEvent && { userEvent }) }).state;
};

edit({ from: 0, insert: 'New line.\n' }, 'input.type');
eq(shown(), 'result', 'a line typed above: the highlight follows');
edit({ from: at().from, insert: 'main ' }, 'input.type');
eq(shown(), 'result', 'typed just before it: not taken in');
edit({ from: at().to, insert: 's' }, 'input.type');
eq(shown(), 'result', 'typed just after it: not taken in');
edit({ from: at().from + 3, insert: 'ULT' }, 'input.type');
eq([shown(), at().words], ['resULTult', 'resULTult'], 'typed inside: widened, and its words follow');
edit({ from: at().from - 5, to: at().to + 1 }, 'delete.backward');
eq(shown(), '(removed)', 'its words deleted: the highlight goes');
edit({ from: at().from, insert: 'main resULTults' }, 'undo');
eq(shown(), 'resULTult', 'Undo brings the words back: so does the highlight');
eq(linkOf(state, at(), { file: 'main.tex', line: 2 }).text, 'resULTult', 'written back with its words');

// a change that isn't typing (a pull, an agent's change)
const kept = at().from;
edit({ from: 0, insert: 'Pulled line.\n' });
eq([shown(), at().from], ['resULTult', kept + 13], 'a line added elsewhere: found where it moved');
edit({ from: at().from + 1, to: at().from + 2, insert: 'X' });
eq(shown(), '(changed)', 'its words changed elsewhere: no highlight on other words');
const line = linkOf(state, at(), { file: 'main.tex', line: 2, col: 0, endLine: 2, endCol: 3, text: 'abc' });
eq([line.text, line.removed], ['abc', undefined], 'changed elsewhere: the link keeps its words, not called removed');

// a removed one's link keeps its words and its line, and says removed
let s2 = EditorState.create({ doc, extensions: [todoMarksField] }).update({ effects: setTodoMarks.of([mark]) }).state;
s2 = s2.update({ changes: { from, to: from + 6 }, userEvent: 'delete.cut' }).state;
const gone = linkOf(s2, s2.field(todoMarksField)[0], { file: 'main.tex', line: 2, col: 4, endLine: 2, endCol: 10, text: 'result' });
eq([gone.line, gone.text, gone.removed, gone.snippet], [2, 'result', true, 'The  holds for all n.'], 'removed: its line, its words kept, marked removed');

// Add to-do here
const plain = EditorState.create({ doc });
eq(todoLinkAt(plain, 'ch/main.tex', 10), { link: { file: 'ch/main.tex', line: 2, snippet: 'The result holds for all n.' }, where: 'main.tex, line 2' }, 'no selection: the line, as before');
const sel = plain.update({ selection: EditorSelection.range(from, from + 6) }).state;
eq(todoLinkAt(sel, 'main.tex', 0), {
  link: { file: 'main.tex', line: 2, col: 4, endLine: 2, endCol: 10, snippet: 'The result holds for all n.', text: 'result' },
  where: 'main.tex, line 2'
}, 'a selection: its words and where they run');
const over = plain.update({ selection: EditorSelection.range(from, doc.length) }).state;
eq(todoLinkAt(over, 'main.tex', 0).where, 'main.tex, lines 2 to 3', 'over lines');
const spaces = EditorState.create({ doc: 'a   b' }).update({ selection: EditorSelection.range(1, 4) }).state;
eq('text' in todoLinkAt(spaces, 'main.tex', 0).link, false, 'only spaces selected: the line');

console.log('todoHighlights: all checks passed');
