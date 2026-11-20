// Self-check for the user's snippets: what loads, how a body becomes CodeMirror's template, and Tab after a trigger.
// Run: npx esbuild apps/frontend/src/editor/userSnippets.check.ts --bundle --platform=node --format=esm --outfile=/tmp/s.mjs && node /tmp/s.mjs
import { EditorSelection, EditorState } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { DEFAULT_SNIPPETS, cleanSnippets, expandTrigger, snippetTemplate, triggerBefore } from './userSnippets';
import type { UserSnippet } from './userSnippets';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// loading
eq(cleanSnippets(undefined), DEFAULT_SNIPPETS, 'nothing stored: the starters');
eq(cleanSnippets('x'), DEFAULT_SNIPPETS, 'not a list: the starters');
eq(cleanSnippets([]), [], 'an emptied list stays empty');
const one = { id: 'a', name: 'A', trigger: 'aa', kinds: ['latex'], body: 'x' };
eq(cleanSnippets([one, { ...one, name: 'again' }]), [one], 'an id once');
eq(cleanSnippets([{ ...one, kinds: ['latex', 'word', 'typst'] }])[0].kinds, ['latex', 'typst'], 'kinds Spectrum knows');
eq(cleanSnippets([{ ...one, kinds: ['word'] }]), [], 'no kind it knows: left out');
eq(cleanSnippets([{ ...one, trigger: 'two words' }])[0].trigger, '', 'a trigger that isn’t a word is dropped, the snippet kept');
eq(cleanSnippets([{ ...one, body: '' }, { ...one, id: 'b', name: ' ' }, null, 3]), [], 'no body, no name, not a snippet');
eq(cleanSnippets([{ ...one, body: 'x'.repeat(20_000) }])[0].body.length, 10_000, 'a body cut to its limit');
for (const s of DEFAULT_SNIPPETS) eq('template' in snippetTemplate(s.body), true, `the starter ${s.name} parses`);

// bodies as templates
const t = (body: string) => snippetTemplate(body);
eq(t('\\frac{${1:a}}{${2}}${0}'), { template: '\\frac\\{${1:a}\\}\\{${2}\\}${0}' }, 'fields, and the text’s braces escaped');
eq(t('$x$ costs $1'), { template: '$x$ costs $1' }, 'a bare $1 is text');
eq(t('${}^{14}C'), { template: '$\\{\\}^\\{14\\}C' }, '${} is text');
eq(t('\\{${1:x}\\}'), { template: '\\\\{${1:x}\\\\}' }, 'LaTeX’s \\{ stays');
eq(t('${1:n} and ${1}'), { template: '${1:n} and ${1:n}' }, 'a number twice: both filled in');
eq('error' in t('${1:\\textbf{x}}'), true, 'a placeholder can’t hold braces');

// triggers
const list: UserSnippet[] = [
  { id: '1', name: 'Theorem', trigger: 'thm', kinds: ['latex'], body: '\\begin{theorem}\n    ${1:Statement}\n\\end{theorem}${0}' },
  { id: '2', name: 'Fig', trigger: 'fig', kinds: ['typst'], body: '#figure(${1})' }
];
eq(triggerBefore('Here thm', 'latex', list)?.id, '1', 'after a space');
eq(triggerBefore('thm', 'latex', list)?.id, '1', 'at the start of the line');
eq(triggerBefore('\\thm', 'latex', list), null, 'not a command');
eq(triggerBefore('xthm', 'latex', list), null, 'not inside a word');
eq(triggerBefore('fig', 'latex', list), null, 'not another kind’s');
eq(triggerBefore('fig', 'typst', list)?.id, '2', 'its own kind’s');

// Tab after a trigger in an editor
let state = EditorState.create({ doc: '    thm', selection: EditorSelection.cursor(7) });
const view = { get state() { return state; }, dispatch: (...specs: TransactionSpec[]) => (state = state.update(...specs).state) } as unknown as EditorView;
eq(expandTrigger(() => list, () => 'latex')(view), true, 'Tab takes the trigger');
eq(state.doc.toString(), '    \\begin{theorem}\n        Statement\n    \\end{theorem}', 'the body at the line’s indent');
eq(state.sliceDoc(state.selection.main.from, state.selection.main.to), 'Statement', 'the first field selected');
state = EditorState.create({ doc: 'nothing', selection: EditorSelection.cursor(7) });
eq(expandTrigger(() => list, () => 'latex')(view), false, 'no trigger: Tab does what it does');

console.log('userSnippets: all checks passed');
