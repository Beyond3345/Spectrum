// Self-check for the Typst and Markdown outlines. Run:
// npx esbuild apps/frontend/src/editor/outlines.check.ts --bundle --platform=node --log-level=warning | node
import { includedPath, numberTypstOutline, typstTableRows, parseMarkdownOutline, parseTypstOutline, typstDocumentOutline, typstFigure } from './outlines.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(what + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
};
const brief = (items: { level: number; title: string; line: number }[]) => items.map((h) => [h.level, h.title, h.line]);
const fence = '```';
const NEWLINE = String.fromCharCode(10);

eq(
  brief(parseTypstOutline(['= One', '== Two', '=== Three <sec:three>', fence, '= Not a heading', fence, '// = Not a heading', '/*', '= Not a heading either', '*/', '= Four // comment', ''].join(NEWLINE))),
  [[0, 'One', 1], [1, 'Two', 2], [2, 'Three', 3], [0, 'Four', 11]],
  'Typst headings'
);
eq(parseTypstOutline('= One' + NEWLINE)[0].pos, 0, 'Typst position');
eq(parseTypstOutline('Text' + NEWLINE + '== Two' + NEWLINE)[0].pos, 5, 'Typst position after a line');

eq(
  brief(parseMarkdownOutline(['---', 'title: A title', '---', '# One', '## Two', fence, '# Not a heading', fence, '# Three {#three}', ''].join(NEWLINE))),
  [[0, 'One', 4], [1, 'Two', 5], [0, 'Three', 9]],
  'Markdown headings'
);
eq(parseMarkdownOutline('## Two' + NEWLINE)[0].pos, 0, 'Markdown position');
eq(includedPath('chapters/main.typ', '../figures/x.typ'), 'figures/x.typ', 'an include above its folder');
eq(includedPath('main.typ', 'chapters/one.typ'), 'chapters/one.typ', 'an include below its folder');

eq(includedPath('chapters/one.typ', '/figures/x.typ'), 'figures/x.typ', 'an include from the root');

// a figure's caption and kind, from its own arguments only
const fig = (text: string) => typstFigure(text, 0);
eq(fig('#figure(image("a(1).png", width: 80%), caption: [The *first* run, see @fig:b.]) <fig:a>'), { supplement: 'Figure', caption: 'The first run, see @fig:b.' }, 'an image');
eq(fig('#figure(\n  table(columns: 2, [a], [b]),\n  caption: [Results],\n)'), { supplement: 'Table', caption: 'Results' }, 'a table over lines');
eq(fig('#figure(caption: [Code])[```py\nx = 1\n```]'), { supplement: 'Listing', caption: 'Code' }, 'a trailing body');
eq(fig('#figure(grid(figure(image("a.png"), caption: [Inner])), caption: [Outer], kind: "algorithm")'), { supplement: 'Algorithm', caption: 'Outer' }, 'its own caption and kind, not an inner figure’s');
eq(fig('#figure(image("a.png"))'), null, 'no caption, not in the outline');

// a selected Typst table's cells, for Table → chart
eq(
  typstTableRows('#figure(\n  table(\n    columns: (auto, 1fr),\n    stroke: none,\n    table.hline(),\n    table.header([*Month*], [Energy (kWh)]),\n    [Jan], [$612$],\n    table.cell(colspan: 2)[Winter, below],\n    "Feb", [540],\n  ),\n  caption: [Energy],\n)'),
  [['Month', 'Energy (kWh)'], ['Jan', '612'], ['Winter, below', ''], ['Feb', '540']],
  'a Typst table'
);
eq(typstTableRows('#table(columns: 2)[a][b][c][d]'), [['a', 'b'], ['c', 'd']], 'cells as trailing content blocks');
eq(typstTableRows('A paragraph, no table.'), null, 'no table');
eq(typstTableRows('#let table-x = 1'), null, 'not a table call');

// the whole document: includes at any depth, in place, each once; figures a level below their heading
const tree = new Map([
  ['main.typ', ['= Intro', '#include "chapters/one.typ"', '// #include "chapters/gone.typ"', '= End', '#include "chapters/one.typ"', ''].join(NEWLINE)],
  ['chapters/one.typ', ['= One', '#include "/chapters/deep/part.typ"', ''].join(NEWLINE)],
  ['chapters/deep/part.typ', ['== Part', '#figure(table(columns: 1, [x]), caption: [Temps]) <tab:t>', ''].join(NEWLINE)],
  ['chapters/gone.typ', '= Gone' + NEWLINE]
]);
const seen = new Set<string>();
typstDocumentOutline('main.typ', new Set(tree.keys()), async (path) => tree.get(path) ?? '', seen).then((items) => {
  eq(items.map((i) => [i.level, i.title, i.file, i.line, !!i.float]), [
    [0, 'Intro', 'main.typ', 1, false],
    [0, 'One', 'chapters/one.typ', 1, false],
    [1, 'Part', 'chapters/deep/part.typ', 1, false],
    [2, 'Table: Temps', 'chapters/deep/part.typ', 2, true],
    [0, 'End', 'main.typ', 4, false]
  ], 'the document across its includes');
  eq([...seen].sort(), ['chapters/deep/part.typ', 'chapters/one.typ', 'main.typ'], 'the files read');
  // the compile's numbers, by text; Contents (a template's) is passed over and a heading Typst doesn't have goes bare
  const numbered = numberTypstOutline(items, {
    headings: [{ number: '', title: 'Contents' }, { number: '1', title: 'Intro' }, { number: '2', title: 'One' }, { number: '2.1', title: 'Part' }],
    figures: [{ supplement: 'Tabelle', number: '2.1', caption: 'Temps' }]
  });
  eq(numbered.map((i) => i.title), ['1 Intro', '2 One', '2.1 Part', 'Tabelle 2.1: Temps', 'End'], 'numbered');
  eq(numberTypstOutline(items, null), items, 'before a compile');
  console.log('outlines: all checks passed');
});
