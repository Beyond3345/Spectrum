// Self-check for smarter typing: lists carried on by Return, maths delimiters in pairs. Run (bundle it first):
// npx esbuild apps/frontend/src/editor/smartTyping.check.ts --bundle --platform=node --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs
import { EditorSelection, EditorState } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import { continueListSpec, deletePairSpec, pairedInput } from './smartTyping';
import type { TypingKind } from './smartTyping';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

/** The text with the cursor at "|" after the spec, or null when it doesn't apply. */
function apply(text: string, spec: (state: EditorState) => TransactionSpec | null) {
  const at = text.indexOf('|');
  const state = EditorState.create({ doc: text.replace('|', ''), selection: EditorSelection.cursor(at) });
  const tr = spec(state);
  if (!tr) return null;
  const next = state.update(tr).state;
  const doc = next.doc.toString();
  const head = next.selection.main.head;
  return doc.slice(0, head) + '|' + doc.slice(head);
}
const enter = (text: string, kind: TypingKind = 'latex') => apply(text, (s) => continueListSpec(s, kind));
const type = (text: string, typed: string, kind: TypingKind = 'latex') =>
  apply(text, (s) => pairedInput(s, s.selection.main.head, s.selection.main.head, typed, kind));
const back = (text: string, kind: TypingKind = 'latex') => apply(text, (s) => deletePairSpec(s, kind));

// lists
const list = (body: string, env = 'itemize') => `\\begin{${env}}\n${body}\n\\end{${env}}`;
eq(enter(list('    \\item First|')), list('    \\item First\n    \\item |'), 'Return after an item starts the next at its indent');
eq(enter(list('    \\item Fir|st')), list('    \\item Fir\n    \\item |st'), 'the rest of the item goes with it');
eq(enter(list('    \\item |')), list('    |'), 'an empty item ends the list: its marker goes');
eq(enter(list('    \\item[] |', 'description')), list('    |', 'description'), 'an empty description item too');
eq(enter(list('    \\item[Term] Text|', 'description')), list('    \\item[Term] Text\n    \\item[|] ', 'description'), 'a description item: the cursor in the brackets');
eq(enter(list('    \\item[a)] Text|', 'enumerate')), list('    \\item[a)] Text\n    \\item |', 'enumerate'), 'an enumerate item with its own label');
eq(enter(list('    \\item A\n    more text|')), null, 'a line without \\item is left alone');
eq(enter('\\item Outside|'), null, 'only in a list');
eq(enter(list('    \\item A \\begin{tabular}{l}x|')), null, 'not in another environment inside the item');
eq(enter(list('    \\it|em A')), null, 'not inside the marker');
eq(enter(list('    \\itemsep|')), null, 'not \\itemsep');
eq(enter('- one|', 'typst'), '- one\n- |', 'Typst: a bullet');
eq(enter('  + one|', 'typst'), '  + one\n  + |', 'Typst: a numbered item');
eq(enter('9. nine|', 'typst'), '9. nine\n10. |', 'Typst: an explicit number counts on');
eq(enter('/ Term: one|', 'typst'), '/ Term: one\n/ |', 'Typst: a term');
eq(enter('- |', 'typst'), '|', 'Typst: an empty item ends the list');
eq(enter('-one|', 'typst'), null, 'Typst: a marker needs its space');

// $ pairs
eq(type('Let |', '$'), 'Let $|$', '$ pairs in text');
eq(type('Let | be', '$'), 'Let $|$ be', 'before a space too');
eq(type('Let |x', '$'), null, 'not straight before a word');
eq(type('cost \\|', '$'), null, 'not \\$');
eq(type('$x|$', '$'), '$x$|', '$ steps over the closer');
eq(type('Let $|$', '$'), 'Let $$|$$', '$ in an empty pair makes display maths');
eq(type('\\[ x = |', '$'), null, 'not in maths');
eq(type('\\newcommand{\\x}{|}', '$'), null, 'not in a definition, which may be either');
eq(type('Let |', '$', 'typst'), 'Let $|$', 'Typst: $ pairs');
eq(type('$x|$', '$', 'typst'), '$x$|', 'Typst: steps over');
eq(type('$|$', '$', 'typst'), '$$|', 'Typst: no $$ display maths, so it steps over');

// \( \[ and sized delimiters
eq(type('Let \\|', '('), 'Let \\(|\\)', '\\( brings \\)');
eq(type('\\|', '['), '\\[|\\]', '\\[ brings \\]');
eq(type('a \\\\|', '['), null, '\\\\[2pt] is a line break');
eq(type('\\|x\\)', '('), '\\(|x\\)', 'none when its closer is there');
eq(type('\\(x\\) and \\|', '('), '\\(x\\) and \\(|\\)', 'another pair on the line');
eq(type('$\\left|', '('), '$\\left(|\\right)', '\\left( brings \\right)');
eq(type('$\\bigl|', '['), '$\\bigl[|\\bigr]', '\\bigl[ brings \\bigr]');
eq(type('$\\Biggl|', '|'), '$\\Biggl||\\Biggr|', '\\Biggl| brings \\Biggr|');
eq(type('$\\left\\|', '{'), '$\\left\\{|\\right\\}', '\\left\\{ brings \\right\\}');
eq(type('$\\left( \\left|\\right)', '('), '$\\left( \\left(|\\right)\\right)', 'nested');
eq(type('$\\left| x \\right)', '('), '$\\left(| x \\right)', 'none when its \\right is there');
eq(type('$\\leftarrow|', '('), null, 'not after another command');
eq(type('Let \\|', '(', 'typst'), null, 'Typst: only $');

// stepping over a closer that's there
eq(type('\\(x\\|\\)', ')'), '\\(x\\)|', 'typing \\) over \\)');
eq(type('\\left(x\\right|\\right)', ')'), '\\left(x\\right)|', 'typing \\right) over \\right)');
eq(type('\\left\\{x\\right\\|\\right\\}', '}'), '\\left\\{x\\right\\}|', 'typing \\right\\} over \\right\\}');
eq(type('(x|)', ')'), null, 'a plain ) is CodeMirror’s');

// Backspace
eq(back('Let $|$'), 'Let |', 'an empty $ pair goes');
eq(back('$$|$$'), '$|$', 'display maths back to inline');
eq(back('$x$|$y$'), null, 'not between two maths');
eq(back('\\(|\\)'), '\\|', 'the ( and its \\)');
eq(back('\\[|\\]'), '\\|', 'the [ and its \\]');
eq(back('$\\left(|\\right)'), '$\\left|', '\\left( and its \\right)');
eq(back('$\\left\\{|\\right\\}'), '$\\left\\|', '\\left\\{ and its \\right\\}');
eq(back('\\(x|\\)'), null, 'a pair with something in it stays');
eq(back('$|$', 'typst'), '|', 'Typst: an empty $ pair');

console.log('smartTyping: all checks passed');
