// The chunked Typst parser (typstChunks.ts) makes the tree the package's own parser makes of the whole file, for the
// handbook's chapters and for texts built to break it, first time and after each of a few thousand random edits; and
// after an edit it parses only the chunks the edit touched. Run from the repository's root:
//   npx esbuild apps/frontend/src/editor/typstChunks.check.ts --bundle --platform=node --format=esm --outfile=/tmp/typstChunks.check.mjs && node /tmp/typstChunks.check.mjs
// the frontend has no Node types
// @ts-expect-error
import { readFileSync, readdirSync } from 'node:fs';
import { Parser, TreeFragment } from '@lezer/common';
import type { Tree } from '@lezer/common';
import { typstParser } from 'codemirror-lang-typst/lezer';
import { ChunkedParser } from './typstChunks';

const fail = (message: string): never => {
  throw new Error(message);
};
const top = typstParser.nodeSet.types.find((type) => type.isTop)!;
// every node by name and place, as the highlighter, folding and the linter walk them
const nodes = (tree: Tree) => {
  const out: string[] = [];
  tree.iterate({ enter: (node) => void out.push(`${node.name}:${node.from}-${node.to}`) });
  return out;
};
const firstDifference = (a: string[], b: string[]) => {
  const at = a.findIndex((node, i) => node !== b[i]);
  return at < 0 && a.length === b.length ? null : `${a[at < 0 ? b.length : at]} against ${b[at < 0 ? a.length : at]}`;
};
// the package's parser, counting the characters it is given
let parsedChars = 0;
const counting = new (class extends Parser {
  createParse(...args: Parameters<Parser['createParse']>) {
    return typstParser.createParse(...args);
  }
  parse(...args: Parameters<Parser['parse']>) {
    parsedChars += (args[0] as string).length;
    return typstParser.parse(...args);
  }
})();
const same = (text: string, tree: Tree, what: string) => {
  if (tree.length !== text.length) fail(`${what}: the tree covers ${tree.length} of ${text.length} characters`);
  const difference = firstDifference(nodes(tree), nodes(typstParser.parse(text)));
  if (difference) fail(`${what}: ${difference}`);
};

// ── texts that would break a chunk cut in the wrong place ──
const NASTY = [
  '= Heading\n\nA paragraph of *strong* and _emph_ text with $x^2$ maths.\n\n',
  '```python\ndef f():\n\n    return 1\n\n```\n\n',
  '/* a comment\n\nwith a break in it */\n\n',
  '#let f(x) = {\n  let y = x\n\n  y + 1\n}\n\n',
  '#figure(\n  image("a.png"),\n\n  caption: [A caption\n\n  in two paragraphs],\n)\n\n',
  '- an item\n\n  carried on after a break\n- another\n\n  + nested\n\n    deeper still\n\n',
  '#if true {\n  [yes]\n}\n\nelse {\n  [no]\n}\n\n',
  '#text(red)[one]\n\n.fields()\n\n',
  '$ sum_(k=1)^n k\n\n = (n(n+1))/2 $\n\n',
  '/ Term: its description\n\n  goes on here\n\n',
  'A line.\n\n#!not a shebang here\n\n',
  '#table(\n  columns: 2,\n\n  [a], [b],\n)\n\n',
  'Text with a #link("https://example.com")[link] and a @ref and a <label>.\n\n',
  '#show heading: it => [\n\n  #it.body\n\n]\n\n',
  '  indented line after a break\n\nelse where\n\n',
  '`raw` and "quotes" and \\* escapes \\\n\n'
];
// CHUNKS_SEED=n tries another run of texts and edits
// @ts-expect-error
let seed = Number(process.env.CHUNKS_SEED) || 7;
const random = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
const built = (parts: number) => Array.from({ length: parts }, () => NASTY[random(NASTY.length)]).join('');

for (const size of [40, 200, 1000, 3000]) {
  const parser = new ChunkedParser(counting, top, size);
  for (let i = 0; i < 30; i += 1) {
    const text = built(1 + random(40));
    same(text, parser.parse(text), `chunks of ${size}, text ${i}`);
  }
  for (const text of ['', 'x', '\n\n', 'a\n\nb', 'a\n\n', '\n\na']) same(text, parser.parse(text), `chunks of ${size}, ${JSON.stringify(text)}`);
}

// ── Spectrum's own handbook ──
const chapters = 'docs/handbook/chapters';
const handbook = (readdirSync(chapters) as string[]).filter((name) => name.endsWith('.typ')).map((name) => readFileSync(`${chapters}/${name}`, 'utf8') as string);
if (handbook.length < 5) fail('the handbook’s chapters were not found: run from the repository’s root');
for (const [i, text] of handbook.entries()) same(text, new ChunkedParser(counting, top).parse(text), `handbook chapter ${i}`);

// ── edits: the same tree as a parse of the whole text, each time ──
const SNIPPETS = ['x', ' ', '\n', '\n\n', '*', '_', '$', '`', '```', '/*', '*/', '{', '}', '(', ')', '#let a = 1', '- ', '= ', '  ', 'else', '.', '"', '#', '<l>', '@r', '\\', '[b]', '+ item\n\n  more'];
function edited(parser: ChunkedParser, start: string, edits: number, what: string) {
  let text = start;
  let tree = parser.parse(text);
  for (let i = 0; i < edits; i += 1) {
    const from = random(text.length + 1);
    const to = Math.min(text.length, from + (random(4) ? 0 : random(30)));
    const insert = random(5) ? SNIPPETS[random(SNIPPETS.length)] : '';
    const next = text.slice(0, from) + insert + text.slice(to);
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(tree), [{ fromA: from, toA: to, fromB: from, toB: from + insert.length }]);
    tree = parser.parse(next, fragments);
    same(next, tree, `${what}, edit ${i} (${JSON.stringify(insert)} over ${from} to ${to})`);
    text = next;
  }
  return { text, tree };
}
for (const size of [60, 400, 3000]) edited(new ChunkedParser(counting, top, size), built(30), 600, `chunks of ${size}`);
edited(new ChunkedParser(counting, top), handbook[2], 400, 'a handbook chapter');

// ── and only what an edit touched is parsed again ──
const long = Array.from({ length: 400 }, () => handbook[2]).join('\n\n').slice(0, 1_500_000);
const parser = new ChunkedParser(counting, top);
let tree = parser.parse(long);
same(long, tree, 'a long file');
let text = long;
let most = 0;
for (let i = 0; i < 40; i += 1) {
  // a key typed in a word somewhere in the file
  const at = text.indexOf(' the ', random(text.length - 1000)) + 2;
  const next = text.slice(0, at) + 'q' + text.slice(at);
  parsedChars = 0;
  tree = parser.parse(next, TreeFragment.applyChanges(TreeFragment.addTree(tree), [{ fromA: at, toA: at, fromB: at, toB: at + 1 }]));
  most = Math.max(most, parsedChars);
  text = next;
}
same(text, tree, 'a long file after forty keys');
if (most > 40_000) fail(`a key in a ${long.length}-character file had ${most} characters parsed again`);

// ── the parse can be stopped part way, as the editor does past the screen ──
const partial = new ChunkedParser(counting, top, 500).startParse(long.slice(0, 50_000));
partial.stopAt(4000);
let stopped: Tree | null = null;
while (!(stopped = partial.advance()));
if (stopped.length < 4000 || stopped.length > 20_000) fail(`stopped at 4000, the tree covers ${stopped.length}`);
const upTo = nodes(typstParser.parse(long.slice(0, stopped.length)));
if (firstDifference(nodes(stopped), upTo)) fail('the tree of a parse stopped part way is not that of the text it covers');

console.log(`typstChunks.check: ok (a key in ${Math.round(long.length / 1000)} thousand characters parses ${most} again)`);
