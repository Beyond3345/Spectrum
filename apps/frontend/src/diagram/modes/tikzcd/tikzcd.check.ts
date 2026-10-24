// Self-check for the commutative diagram mode's code. Run:
// npx esbuild apps/frontend/src/diagram/modes/tikzcd/tikzcd.check.ts --bundle --platform=node --log-level=warning | node
import { cdCode, copyCd, direction, pasteCd, removeCd } from './code';
import type { CdModel } from './code';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const square: CdModel = {
  cells: [
    { id: 'c1', row: 1, col: 1, text: 'A' },
    { id: 'c2', row: 1, col: 2, text: 'B' },
    { id: 'c3', row: 2, col: 1, text: 'C' },
    { id: 'c4', row: 2, col: 2, text: 'D' },
    { id: 'c5', row: 3, col: 3, text: '\\mathbb{Z}' }
  ],
  arrows: [
    { id: 'a1', from: 'c1', to: 'c2', label: 'f' },
    { id: 'a2', from: 'c1', to: 'c3', label: 'g', swap: true, hook: true },
    { id: 'a3', from: 'c2', to: 'c4', label: 'h', twoHeads: true },
    { id: 'a4', from: 'c3', to: 'c4', label: 'k', dashed: true },
    { id: 'a5', from: 'c1', to: 'c5', label: 'p, q' },
    { id: 'a6', from: 'c5', to: 'c2' }
  ]
};

eq(direction(square.cells[0], square.cells[4]), 'rrdd', 'two right and two down');
eq(direction(square.cells[4], square.cells[1]), 'luu', 'left and up');

const { body, packages, libraries } = cdCode(square);
eq([packages, libraries], [['tikz-cd', 'amssymb'], []], 'packages, with amssymb for \\mathbb');
eq(body.split('\n'), [
  '\\begin{tikzcd}',
  'A \\arrow[r, "f"] \\arrow[d, "g"\', hook] \\arrow[rrdd, "{p, q}"] & B \\arrow[d, "h", two heads] \\\\',
  'C \\arrow[r, "k", dashed] & D \\\\',
  ' &  & \\mathbb{Z} \\arrow[luu]',
  '\\end{tikzcd}',
  ''
], 'the grid, row by row');
eq(cdCode({ cells: [{ id: 'c1', row: -2, col: 5, text: 'X' }], arrows: [{ id: 'a1', from: 'c1', to: 'c1' }] }).body, '\\begin{tikzcd}\nX\n\\end{tikzcd}\n', 'one object; an arrow to itself is left out');
eq(cdCode({ cells: [], arrows: [] }).body, '\\begin{tikzcd}\n\\end{tikzcd}\n', 'nothing yet');

const clip = copyCd(square, ['c1', 'c2', 'a1', 'a3']);
eq([clip.cells.map((c) => c.id), clip.arrows.map((a) => a.id)], [['c1', 'c2'], ['a1']], 'copy keeps the arrows inside the selection');
const pasted = pasteCd(square, JSON.parse(JSON.stringify(clip)));
eq(pasted.ids, ['c6', 'c7', 'a7'], 'pasted ids');
eq(pasted.model.cells.slice(5).map((c) => [c.row, c.col]), [[1, 3], [1, 4]], 'pasted where row 1 is free');
eq(removeCd(square, ['c5', 'a1']).arrows.map((a) => a.id), ['a2', 'a3', 'a4'], 'deleting an object takes its arrows');

console.log('tikzcd.check: ok');
