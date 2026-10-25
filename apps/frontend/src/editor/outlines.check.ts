// Self-check for the Typst and Markdown outlines. Run:
// npx esbuild apps/frontend/src/editor/outlines.check.ts --bundle --platform=node --log-level=warning | node
import { includedPath, parseMarkdownOutline, parseTypstOutline } from './outlines.ts';

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

console.log('outlines: all checks passed');
