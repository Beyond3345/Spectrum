// Self-check for the to-do scanner, link finding, and your own to-dos' notes, search, counts and order. Run:
// npx esbuild apps/frontend/src/editor/todos.check.ts --bundle --platform=node --log-level=warning --outfile=<scratch>/todos.cjs && node <scratch>/todos.cjs
import type { Todo } from '../api/client';
import { isSource } from './shared';
import { MAX_NOTE, emptyText, findKey, findLine, scanTodos, snippetOf, sortTodos, todoCounts, todoMatches, withNote } from './todos';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const lines = (...l: string[]) => l.join('\n');
const scan = (text: string) => scanTodos([{ path: 'a.tex', text }]).map((t) => [t.line, t.kind, t.text]);

// ─── commands ───

eq(scan('Text \\todo{Cite Smith} more.'), [[1, 'todo', 'Cite Smith']], 'todo');
eq(scan('\\todo[inline, color={red!20}]{Check\n   the   numbers}'), [[1, 'todo', 'Check the numbers']], 'options with braces, a multi-line argument');
eq(scan('\\missingfigure{Plot of $x^2$}'), [[1, 'missingfigure', 'Plot of $x^2$']], 'missing figure');
eq(scan('\\missingfigure{}'), [[1, 'missingfigure', '\\missingfigure']], 'an empty argument shows the command');
eq(scan('\\fixme{units}\n\\fxnote{a}\n\\fxwarning{b}\n\\fxerror{c}\n\\fxfatal{d}').map((t) => t[1]), ['fixme', 'fxnote', 'fxwarning', 'fxerror', 'fxfatal'], 'fixme package');
eq(scan('\\fxnote*{Too vague}{the result}'), [[1, 'fxnote', 'Too vague']], 'starred fixme note: the note');
eq(scan('\\todo{a {nested} group}'), [[1, 'todo', 'a {nested} group']], 'nested braces');
eq(scan('\\listoftodos \\todototoc \\todos'), [], 'other commands');
eq(scan('% \\todo{commented out}'), [], 'a commented-out command');
eq(scan('\\todo{keep % not this\n this}'), [[1, 'todo', 'keep this']], 'a comment inside the argument');
eq(scan('\\newcommand{\\todo}[1]{#1}\n\\renewcommand*\\fixme[1]{}\n\\def\\fxnote#1{}\n\\let\\todo\\relax'), [], 'definitions');
eq(scan('\\newcommand{\\mytodo}[1]{\\todo[color=red]{#1}}'), [], 'inside a definition');
eq(scan('\\todo'), [], 'no argument');
eq(scan('\\todo{never closed'), [], 'unclosed argument');

// ─── comments ───

eq(scan('x % TODO: cite this'), [[1, 'TODO', 'cite this']], 'TODO comment');
eq(scan('% FIXME(dan) - units\n%XXX'), [[1, 'FIXME', 'units'], [2, 'XXX', 'XXX']], 'FIXME with a name, a bare XXX');
eq(scan('50\\% TODO not a comment'), [], 'an escaped percent');
eq(scan('\\\\% TODO after a line break'), [[1, 'TODO', 'after a line break']], 'a comment after \\\\');
eq(scan('% todo lower case, TODOS, MYTODO'), [], 'only the capitals, as words');
eq(scan('% \\renewcommand{\\TODO}[1]{}'), [], 'a command named TODO');
eq(scan('% first TODO wins TODO'), [[1, 'TODO', 'wins TODO']], 'one per comment');

// ─── order and lines ───

eq(
  scan(lines('a', '% TODO one', 'b \\todo{two} % FIXME three', '', '\\todo{four}')),
  [[2, 'TODO', 'one'], [3, 'todo', 'two'], [3, 'FIXME', 'three'], [5, 'todo', 'four']],
  'in place order, lines counted'
);
eq(
  scanTodos([
    { path: 'main.tex', text: '\\todo{m}' },
    { path: 'refs.bib', text: '% TODO add DOI' }
  ]).map((t) => t.file),
  ['main.tex', 'refs.bib'],
  'file order kept'
);

// ─── links ───

const text = lines('\\section{Intro}', 'We show that', 'it works.', 'We show that');
eq(snippetOf(`   ${'x'.repeat(200)}  `).length, 120, 'snippet capped');
eq(findLine(text, 2, 'We show that'), 2, 'line unchanged');
eq(findLine(lines('new line', text), 2, 'We show that'), 3, 'moved down: the nearest match');
eq(findLine(lines('a', 'b', 'c', 'd', text), 3, 'We show that'), 6, 'nearest of two');
eq(findLine(text, 2, 'Gone now'), 2, 'not found: the line as it was');
eq(findLine(text, 3), 3, 'no snippet');
eq(findLine(text, 9, 'it works.'), 3, 'past the end');

const files = [
  { path: 'main.tex', text: lines('a', '\\label{ sec:intro }', 'see smith2020') },
  { path: 'refs.bib', text: lines('', '@Article{smith2020,', '  title = {T}', '}') }
];
eq(findKey(files, 'sec:intro'), { file: 'main.tex', line: 2 }, 'label');
eq(findKey(files, 'smith2020'), { file: 'refs.bib', line: 2 }, 'bib entry, not the mention');
eq(findKey(files, 'nope'), null, 'missing key');

// ─── Typst and Markdown ───

// the files the editor looks for to-dos in, as it picks them from the tree
const project = [
  { path: 'main.typ', text: '#image("a.png", width: 80%) // TODO: a sharper photo\n\\todo{not Typst}' },
  { path: 'notes.md', text: 'Up 50%, TODO the source.\n<!-- FIXME check\n the numbers -->' },
  { path: 'main.tex', text: '% TODO: cite' },
  { path: 'figures/a.png', text: '' }
];
eq(
  scanTodos(project.filter((f) => isSource(f.path))).map((t) => [t.file, t.line, t.kind, t.text]),
  [['main.typ', 1, 'TODO', 'a sharper photo'], ['notes.md', 2, 'FIXME', 'check the numbers'], ['main.tex', 1, 'TODO', 'cite']],
  'Typst and Markdown sources, once each, without LaTeX’s % comments or \\todo'
);

// ─── your own to-dos: the note, search, counts, order, what an empty tab says ───

const at = (n: number) => `2026-11-0${n}T00:00:00.000Z`;
const own: Todo = { id: 'a', text: 'Fix the caption', done: false, createdAt: at(1), updatedAt: at(1) };
eq(withNote(own, '  See p. 3\n  and the table  \n'), { ...own, note: 'See p. 3\n  and the table' }, 'a note is trimmed, its lines kept');
eq(withNote({ ...own, note: 'old' }, ' \n '), own, 'an emptied note is taken off, not kept empty');
eq(withNote(own, 'x'.repeat(MAX_NOTE + 50)).note?.length, MAX_NOTE, 'a note is capped as the backend caps it');
eq(withNote({ ...own, link: { key: 'k' }, later: 1 } as Todo, 'n'), { ...own, link: { key: 'k' }, later: 1, note: 'n' }, 'the rest of the to-do, a later version’s fields too, stays');

eq(todoMatches('', own), true, 'no search finds everything');
eq(todoMatches('table', { ...own, note: 'See the Table on p. 3' }), true, 'search finds a note');
eq(todoMatches('caption', own), true, 'search finds the text');
eq(todoMatches('main.tex', own, 'main.tex:6'), true, 'search finds what the link shows');
eq(todoMatches('nope', { ...own, note: 'x' }, 'p. 2'), false, 'nothing found');

eq(todoCounts([own, { ...own, done: true }, { ...own, done: true }], [{}, {}]), { open: 3, done: 2, all: 5 }, 'counts: the source’s are open');
eq(todoCounts([], []), { open: 0, done: 0, all: 0 }, 'counts of none');

const order = sortTodos([
  { ...own, id: 'done-old', done: true, createdAt: at(1) },
  { ...own, id: 'new', createdAt: at(3) },
  { ...own, id: 'old', createdAt: at(2) }
]).map((t) => t.id);
eq(order, ['old', 'new', 'done-old'], 'open first, oldest first');

eq(emptyText({ total: 0, show: 'open', search: '' }).startsWith('Nothing to do yet.'), true, 'empty: the first hint');
eq(emptyText({ total: 3, show: 'open', search: 'zz' }), 'No to-dos match “zz”.', 'empty: a search');
eq(emptyText({ total: 3, show: 'open', search: '' }), 'All done. Ticked ones are under Done.', 'empty: nothing open');
eq(emptyText({ total: 3, show: 'done', search: '' }), 'Nothing ticked off yet.', 'empty: nothing done');

console.log('todos: all checks passed');
