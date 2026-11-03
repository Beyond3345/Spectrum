// Self-check for Find in the PDF. Run:
// npx esbuild apps/frontend/src/editor/pdfFind.check.ts --bundle --platform=node --log-level=warning --outfile=<scratch>/pdfFind.cjs && node <scratch>/pdfFind.cjs
import { findAll, lineBoxFrom, matchBoxes, pageText } from './pdfFind';
import type { TextRun } from './pdfFind';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// 10 pt text: each letter 5 pt wide by the stand-in measure below, the PDF's y counting up from a 800 pt page's foot
const run = (str: string, x: number, y: number, hasEOL = false): TextRun => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, hasEOL });
const runs = [run('The quick brown', 100, 700, true), run('fox jumps', 100, 686), run(' over', 145, 686)];
const { text, starts } = pageText(runs);

eq(text, 'The quick brown\nfox jumps over', 'runs joined, a line end kept');
eq(starts, [0, 16, 25], 'where each run starts');

eq(findAll(text, 'QUICK'), [[4, 9]], 'case ignored');
eq(findAll(text, 'brown fox'), [[10, 19]], 'across a line break');
eq(findAll(text, '  jumps   over '), [[20, 30]], 'spaces in the search');
eq(findAll(text, 'o'), [[12, 13], [17, 18], [26, 27]], 'every match');
eq(findAll(text, 'a.b'), [], 'not a pattern');
eq(findAll(text, '   '), [], 'nothing to find');

const toView = (x: number, y: number) => [x, 800 - y];
const widthOf = (str: string) => str.length;
eq(matchBoxes(runs, starts, [4, 9], 1, toView, widthOf), [{ page: 1, x: 120, y: 92, width: 25, height: 10 }], 'part-way along a run');
eq(
  matchBoxes(runs, starts, [10, 19], 2, toView, widthOf).map((b) => [b.x, b.y, b.width]),
  [
    [150, 92, 25],
    [100, 106, 15]
  ],
  'one box per run, the line break in none'
);
eq(matchBoxes(runs, starts, [0, 3], 1, toView, () => 0)[0].width, 15, 'unmeasurable text: shared out by letters');

// a Typst jump's spot on a baseline (114 down the page): from there to the line's end, past the run it is in
eq(lineBoxFrom(runs, 1, toView, 120, 114), [{ page: 1, x: 120, y: 106, width: 50, height: 10 }], 'from the spot to the line’s end');
eq(lineBoxFrom(runs, 1, toView, 50, 100), [{ page: 1, x: 100, y: 92, width: 75, height: 10 }], 'from the line’s start for a spot before it');
eq(lineBoxFrom(runs, 1, toView, 120, 110), [], 'nothing on another baseline');
eq(lineBoxFrom(runs, 1, toView, 400, 114), [], 'nothing past the line’s end');

console.log('pdfFind: all checks passed');
