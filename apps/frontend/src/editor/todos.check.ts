// Self-check for the to-do scanner and link finding. Run:
// npx esbuild apps/frontend/src/editor/todos.check.ts --bundle --platform=node --log-level=warning --outfile=<scratch>/todos.cjs && node <scratch>/todos.cjs
import { findKey, findLine, scanTodos, snippetOf } from './todos';

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

console.log('todos: all checks passed');
