// Self-check for the to-do scanner, link finding, and your own to-dos' notes, search, counts and order. Run:
// npx esbuild apps/frontend/src/editor/todos.check.ts --bundle --platform=node --log-level=warning --outfile=<scratch>/todos.cjs && node <scratch>/todos.cjs
import type { Todo } from '../api/client';
import { isSource } from './shared';
import { contrast, mixHex } from '../app/appearance';
import { EDITOR_THEMES } from './editorThemes';
import { AUTO_HUES, MAX_RANGE_TEXT, NEAR, PICKER_HUES, TODO_HUES, WASH, dropGroup, dropIndex, findRange, groupHues, hueCss, hueDistance, hueOf, isRange, newOrder, orderOf, washLab, placeAt, placeOf, quoteOf, rangeLabel, rangeLink, todoHues } from './todos';
import { MAX_GROUP_NAME, MAX_NOTE, STARTER_GROUPS, STARTER_HUES, emptyText, findKey, findLine, groupName, groupNamed, groupOf, moveGroup, newGroup, orderedGroups, scanTodos, snippetOf, sortTodos, todoCounts, todoMatches, withNote } from './todos';

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

// ─── groups ───

const groups = { b: { name: 'Spelling', order: 2 }, a: { name: 'Checking', order: 1 }, c: { name: 'References', order: 2 } };
eq(orderedGroups(groups).map((g) => g.id), ['a', 'c', 'b'], 'groups in their order, by name where two share a place');
eq(groupOf({ ...own, group: 'a' }, groups), 'a', 'a to-do in a group');
eq(groupOf(own, groups), '', 'a to-do in none');
eq(groupOf({ ...own, group: 'gone' }, groups), '', 'a group deleted on another computer: in none, not lost');
eq(groupOf({ ...own, group: 'toString' }, groups), '', 'not a group: what every object has');
eq(groupNamed(groups, '  spelling '), 'b', 'a group found by its name in any case');
eq(groupNamed(groups, 'Figures'), '', 'no group by that name');
eq(groupName(`  Still\n to   write ${'x'.repeat(100)}`).length, MAX_GROUP_NAME, 'a name is one line, capped');
eq([newGroup(groups, ' Figures ').name, newGroup(groups, ' Figures ').order], ['Figures', 3], 'a new group goes last');
eq(newGroup({}, 'Checking'), { name: 'Checking', order: 1, hue: 0 }, 'the first group, in the first colour');
eq(moveGroup(groups, 'b', -1), { c: { name: 'References', order: 3 } }, 'move up past one sharing its place: renumbered, only what changed');
eq(orderedGroups({ ...groups, ...moveGroup(groups, 'a', 1) }).map((g) => g.id), ['c', 'a', 'b'], 'move down');
eq(moveGroup(groups, 'a', -1), {}, 'the first moves no higher');
eq(moveGroup(groups, 'b', 1), {}, 'the last moves no lower');
eq(moveGroup(groups, 'gone', 1), {}, 'a group that is gone stays gone');
eq(STARTER_GROUPS, ['Checking', 'Spelling', 'References', 'Still to write'], 'the groups offered at first');
eq(todoMatches('spell', own, '', 'Spelling'), true, 'search finds a to-do by its group’s name');

// ─── a to-do on selected words: its range, found again by its words ───

const src = lines('\\section{Intro}', 'The result holds for all n.', 'See the result.');
const words = rangeLink(src, 'main.tex', 20, 26);
eq(words, { file: 'main.tex', line: 2, col: 4, endLine: 2, endCol: 10, snippet: 'The result holds for all n.', text: 'result' }, 'a range: line and columns, its words, its line’s snippet');
eq(isRange(words), true, 'a range');
eq(isRange({ file: 'main.tex', line: 2, snippet: 'x' }), false, 'a line link is no range');
eq(isRange({ ...words, endCol: 4 }), false, 'an empty range');
eq(isRange({ ...words, endLine: 1 }), false, 'an end before the start');
eq(isRange({ ...words, text: 'x'.repeat(MAX_RANGE_TEXT + 1) }), false, 'words over the cap');
eq(isRange({ ...words, col: 1.5 }), false, 'a column is whole');
eq(findRange(src, words), { from: 20, to: 26 }, 'the words where they were');
eq(findRange(`New line\n${src}`, words), { from: 29, to: 35 }, 'a line added above: found again by the words');
eq(findRange(src.replace('The result', 'A result'), words), { from: 18, to: 24 }, 'moved along the line');
eq(findRange(lines('result far away', '', '', src), { ...words, line: 5 }), { from: 38, to: 44 }, 'the nearest of two to where it was');
eq(findRange(src.replace(/result/g, 'outcome'), words), null, 'the words are gone: not found, no other words taken');
eq(findRange('short', words), null, 'a file that lost the line');
eq(placeOf(src, 20, 44), { line: 2, col: 4, endLine: 3, endCol: 0 }, 'a place over two lines');
eq(quoteOf('  the   result\nholds '), '“the result holds”', 'quoted words on one line');
eq(quoteOf('x'.repeat(60)).length, 42, 'long words clamped with …');
eq(rangeLabel('main.tex', { file: 'main.tex', line: 33 }, { line: 34, found: true }), 'main.tex:34', 'a line link reads as before');
eq(rangeLabel('main.tex', words, { line: 33, endLine: 33, found: true }), 'main.tex, line 33: “result”', 'a range on one line');
eq(rangeLabel('main.tex', words, { line: 33, endLine: 35, found: true }), 'main.tex, lines 33 to 35: “result”', 'a range over lines');
eq(rangeLabel('main.tex', words, { line: 33, found: false }), 'main.tex, line 33: text changed', 'the words changed elsewhere');
eq(rangeLabel('main.tex', { ...words, removed: true }, { line: 33, found: false }), 'main.tex, line 33: text removed', 'the words deleted here');

// ─── colours from the wheel: told apart by how they look ───

eq(TODO_HUES.length, 11, 'the wheel’s eleven hues, no grey');
const BLUE = TODO_HUES.findIndex((c) => c.label === 'Blue');
const label = (h: number | undefined) => TODO_HUES[h!]?.label;
// blue's highlight is the selection's colour (the Spectrum accent's and macOS's default blue, at the selection's 22%)
const selection = (light: string, dark: string) => (h: number) =>
  Math.min(
    Math.hypot(...washLab(TODO_HUES[h].band, WASH.light, '#ffffff').map((v, i) => v - washLab(light, 0.22, '#ffffff')[i])),
    Math.hypot(...washLab(TODO_HUES[h].dark, WASH.dark, '#0f0f0f').map((v, i) => v - washLab(dark, 0.22, '#0f0f0f')[i]))
  );
for (const fromSelection of [selection('#0073df', '#0073df'), selection('#007aff', '#0a84ff')]) {
  eq(fromSelection(BLUE) < 4, true, 'blue reads as the selection');
  eq(TODO_HUES.every((_, h) => h === BLUE || fromSelection(h) >= 8.5), true, 'every other hue sits as far from it as two neighbours do');
}
eq(PICKER_HUES.includes(BLUE), false, 'no blue in a group’s menu');
eq(PICKER_HUES.length, 10, 'the other ten are');
eq(AUTO_HUES.map(label), ['Red', 'Amber', 'Green', 'Teal', 'Indigo'], 'the hues for to-dos in no group');
eq(AUTO_HUES.every((a) => AUTO_HUES.every((b) => a === b || hueDistance(a, b) >= NEAR)), true, 'every two of them far enough apart');
eq(PICKER_HUES.filter((h) => !AUTO_HUES.includes(h)).every((h) => AUTO_HUES.some((a) => hueDistance(a, h) < NEAR)), true, 'and no other hue but blue could join them');
eq(hueDistance(0, 1) < NEAR, true, 'red and orange are too close');
eq(hueOf(14), 3, 'a later version’s wider wheel wraps');
eq(hueOf('red'), undefined, 'not a hue');
// groups: their own colour; a stored blue shows as the nearest in the menu
const gs = { refs: { name: 'References', order: 2, hue: BLUE }, check: { name: 'Checking', order: 1, hue: 4 } };
eq(label(groupHues(gs).refs), 'Indigo', 'a group stored blue shows the nearest hue the menu has');
eq(label(groupHues(gs).check), 'Green', 'a group’s own colour');
eq(label(groupHues({ a: { name: 'A', order: 1 }, b: { name: 'B', order: 2 } }).b) !== label(0), true, 'a group from before colours takes one clear of the one above');
const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}T00:00:00.000Z`;
const loose = (n: number, extra: (i: number) => object = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, createdAt: day(i + 1), link: { file: 'main.tex', line: i + 1 }, ...extra(i) }));
// the owner's case: to-dos in no group in one file beside a blue group and a green one
const owner = todoHues([...loose(3, (i) => ({ hue: i })), { id: 'r', createdAt: day(9), group: 'refs' }, { id: 'c', createdAt: day(9), group: 'check' }], gs);
const three = ['t0', 't1', 't2'].map((id) => owner.get(id)!);
eq(three.map(label), ['Red', 'Teal', 'Amber'], 'three in no group: stored colours passed over, none beside the groups’ indigo and green');
eq(three.every((a, i) => three.every((b, j) => i === j || hueDistance(a, b) >= NEAR) && [owner.get('r')!, owner.get('c')!].every((g) => hueDistance(a, g) >= NEAR)), true, 'all far enough from each other and the groups');
// while colours are free, no two to-dos in no group are near; then the least used comes back
for (let n = 1; n <= AUTO_HUES.length; n += 1) {
  const h = [...todoHues(loose(n), {}).values()];
  eq(h.every((a, i) => h.every((b, j) => i === j || hueDistance(a, b) >= NEAR)), true, `${n} in no group: none near another`);
}
const six = [...todoHues(loose(7), {}).values()];
eq(new Set(six).size, 5, 'more than five: colours come round again');
eq(AUTO_HUES.every((h) => six.filter((x) => x === h).length <= 2), true, 'the least used first');
// the same file's neighbours count first: a to-do in another file may share a colour before one in its own does
const byFile = todoHues([...loose(4), { id: 'o', createdAt: day(20), link: { file: 'other.tex', line: 1 } }, { id: 'm', createdAt: day(21), link: { file: 'main.tex', line: 9 } }], {});
eq(byFile.get('m'), byFile.get('o'), 'all five used: the sixth shares a colour with one in another file, not with a neighbour in its own');
// ticked ones come after the open ones
const ticked = todoHues([{ id: 'd', createdAt: day(1), done: true }, { id: 'o', createdAt: day(2) }], {});
eq(label(ticked.get('o')), 'Red', 'an open one is coloured before an older ticked one');
// the same list gives the same colours
eq([...todoHues(loose(4), gs)], [...todoHues(loose(4), gs)], 'the same each time');
eq(newGroup({}, 'References', [0]).hue !== 0 && hueDistance(newGroup({}, 'References', [0]).hue!, 0) >= NEAR, true, 'a new group steers clear of the to-dos in no group');
eq(newGroup({}, 'References', []).hue !== BLUE, true, 'and is never blue');
// each starter group in its own colour, which its chip shows, while nothing in use is near it
eq(STARTER_GROUPS.map((name) => TODO_HUES[newGroup({}, name).hue!].label), ['Red', 'Amber', 'Green', 'Cyan'], 'the starters’ colours');
eq(Object.values(STARTER_HUES).every((h) => PICKER_HUES.includes(h)), true, 'each one a group can have, never blue');
const allFour = STARTER_GROUPS.reduce<Record<string, ReturnType<typeof newGroup>>>((made, name) => ({ ...made, [name]: newGroup(made, name) }), {});
eq(STARTER_GROUPS.map((name) => allFour[name].hue), Object.values(STARTER_HUES), 'all four made one after another keep their colours');
const redGroup = { r: { name: 'Ideas', order: 1, hue: STARTER_HUES.Checking } };
eq(newGroup(redGroup, 'Checking').hue !== STARTER_HUES.Checking, true, 'a starter whose colour a group has takes another');
eq(newGroup({}, 'Spelling', [STARTER_HUES.Spelling]).hue !== STARTER_HUES.Spelling, true, 'and so does one whose colour a to-do in no group has');
eq(PICKER_HUES.every((h) => newGroup({ x: { name: 'X', order: 1, hue: h } }, 'Y').hue !== BLUE), true, 'never blue whatever the others');

// readable: every editor theme's text on each highlight keeps 60% of its contrast or more, 4.5:1 where it had 7:1, and
// Spectrum's own themes 7:1; and each highlight shows on the background
for (const t of EDITOR_THEMES) {
  if (t.colours.bg.length !== 7 || t.colours.fg.length !== 7) continue;
  const dark = t.mode === 'dark';
  for (const c of TODO_HUES) {
    const wash = mixHex(t.colours.bg, dark ? c.dark : c.band, dark ? WASH.dark : WASH.light);
    const before = contrast(t.colours.fg, t.colours.bg);
    const after = contrast(t.colours.fg, wash);
    if (after < before * 0.6 || (before >= 7 && after < 4.5) || (t.id.startsWith('spectrum') && after < 7)) throw new Error(`${t.id} on ${c.label}: ${after.toFixed(2)} (was ${before.toFixed(2)})`);
    if (contrast(wash, t.colours.bg) < 1.05) throw new Error(`${t.id}: ${c.label} hardly shows`);
  }
}
eq(hueCss().split('\n').filter((l) => l.includes('.todo-hue-0 ')).length, 3, 'each hue for light, dark and the system’s dark');

// ─── order: a new to-do's place, a drag, an old list ───

const ord = (id: string, order: number | undefined, extra: object = {}) => ({ id, createdAt: day(1), ...(order !== undefined && { order }), ...extra });
const now = Date.parse(day(22));
eq(orderOf({ createdAt: day(3) }), Date.parse(day(3)), 'one from before orders: by when it was made');
eq(newOrder([ord('a', 10), ord('b', 20)], undefined, 'added', now), now, 'added: after the others');
eq(newOrder([ord('a', now + 5)], undefined, 'added', now), now + 6, 'after one later than now');
const atLines = [ord('a', 10, { link: { file: 'm.tex', line: 5 } }), ord('b', 20, { link: { file: 'o.tex', line: 1 } }), ord('c', 30, { link: { file: 'm.tex', line: 40 } }), ord('d', 40)];
eq(newOrder(atLines, { file: 'm.tex', line: 12, col: 0 }, 'line', now), 25, 'by line: between the same file’s lines 5 and 40');
eq(newOrder(atLines, { file: 'm.tex', line: 5, col: 3 }, 'line', now), 25, 'by line and column on the same line');
eq(newOrder(atLines, { file: 'm.tex', line: 2 }, 'line', now), 9, 'before the first of its file');
eq(newOrder(atLines, { file: 'm.tex', line: 90 }, 'line', now), 35, 'after the last of its file');
eq(newOrder(atLines, { file: 'x.tex', line: 9 }, 'line', now), now, 'a file with none yet: at the end');
eq(newOrder(atLines, undefined, 'line', now), now, 'no link: at the end');
eq(newOrder(atLines, { file: 'm.tex', line: 12 }, 'added', now), now, 'added ignores the line');
// a drag: one file changes, the dragged one
const list = [ord('a', 1), ord('b', 2), ord('c', 3)];
eq(placeAt(list, 1, 'x'), { x: 1.5 }, 'between two: half way');
eq(placeAt(list, 0, 'x'), { x: 0 }, 'at the top');
eq(placeAt(list, 3, 'x', 100), { x: 100 }, 'at the end');
eq(placeAt([], 0, 'x', 100), { x: 100 }, 'into an empty list');
eq(dropIndex(['a', 'b', 'c'], 'b', false), 1, 'dropped on the top half of b: before it');
eq(dropIndex(['a', 'b', 'c'], 'b', true), 2, 'on its bottom half: after it');
eq(dropIndex(['a', 'b'], null, false), 2, 'on the group’s title: at its end');
// several moves: each sets one order, and the list reads as dragged
const sorted = (l: { id: string; order?: number; createdAt: string }[]) => [...l].sort((a, b) => orderOf(a) - orderOf(b)).map((t) => t.id);
let many = [ord('a', 1), ord('b', 2), ord('c', 3), ord('d', 4)];
const drag = (id: string, index: number) => {
  const rest = [...many].sort((a, b) => orderOf(a) - orderOf(b)).filter((t) => t.id !== id);
  const changes = placeAt(rest, index, id);
  many = many.map((t) => (changes[t.id] !== undefined ? { ...t, order: changes[t.id] } : t));
  return Object.keys(changes).length;
};
eq([drag('d', 0), drag('a', 3), drag('c', 1)], [1, 1, 1], 'each move rewrites one to-do');
eq(sorted(many), ['d', 'c', 'b', 'a'], 'the list as dragged');
for (let i = 0; i < 60; i += 1) drag(i % 2 ? 'a' : 'b', 1);
eq(new Set(many.map((t) => t.order)).size, 4, 'sixty moves into one gap: no two share a place (numbered again when too close)');
// an old list with no orders keeps its order, oldest first, and a new one goes after it
const old = [ord('x', undefined, { createdAt: day(3) }), ord('y', undefined, { createdAt: day(1) })];
eq(sorted(old), ['y', 'x'], 'an old list: oldest first, as before');
eq(sorted([...old, ord('n', newOrder(old, undefined, 'added', now))]), ['y', 'x', 'n'], 'a new one after the old ones');
eq(sorted([...old, ord('m', placeAt(sorted(old).map((id) => old.find((t) => t.id === id)!), 1, 'm')['m'])]), ['y', 'm', 'x'], 'one dragged between two old ones');
eq(sortTodos([{ ...own, text: 'd', order: 5, done: true }, { ...own, text: 'o', order: 9 }, { ...own, text: 'p', order: 1, done: true }]).map((t) => t.text), ['o', 'p', 'd'], 'open above done, and the done ones in their order too');

// ─── dropping on a group ───

eq(dropGroup('refs', '', gs), 'refs', 'onto a group');
eq(dropGroup('', 'refs', gs), '', 'onto the top: out of its group');
eq(dropGroup('refs', 'refs', gs), null, 'onto its own group: stays');
eq(dropGroup('', '', gs), null, 'in no group, onto the top: stays');
eq(dropGroup('gone', '', gs), null, 'onto a group deleted meanwhile: stays');
eq(dropGroup(null, 'refs', gs), null, 'dropped outside: stays');

console.log('todos: all checks passed');
