// Self-check for the commutative diagram mode's code. Run:
// npx esbuild apps/frontend/src/diagram/modes/tikzcd/tikzcd.check.ts --bundle --platform=node --log-level=warning | node
import { cdCode, cdNeedsVersion5, connectCd, copyCd, direction, labelSides, pasteCd, removeCd } from './code';
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
eq(cdCode({ cells: [{ id: 'c1', row: -2, col: 5, text: 'X' }], arrows: [{ id: 'a1', from: 'c1', to: 'c1' }] }).body, '\\begin{tikzcd}\nX \\arrow[loop above]\n\\end{tikzcd}\n', 'one object; an arrow to itself is a loop (2.5)');
eq(cdCode({ cells: [], arrows: [] }).body, '\\begin{tikzcd}\n\\end{tikzcd}\n', 'nothing yet');

const clip = copyCd(square, ['c1', 'c2', 'a1', 'a3']);
eq([clip.cells.map((c) => c.id), clip.arrows.map((a) => a.id)], [['c1', 'c2'], ['a1']], 'copy keeps the arrows inside the selection');
const pasted = pasteCd(square, JSON.parse(JSON.stringify(clip)));
eq(pasted.ids, ['c6', 'c7', 'a7'], 'pasted ids');
eq(pasted.model.cells.slice(5).map((c) => [c.row, c.col]), [[1, 3], [1, 4]], 'pasted where row 1 is free');
eq(removeCd(square, ['c5', 'a1']).arrows.map((a) => a.id), ['a2', 'a3', 'a4'], 'deleting an object takes its arrows');


// the label side named as the arrow runs: tikz-cd's default (no swap) is on its left, so right of a downward arrow
eq(labelSides(square.arrows[0], square), [['above', 'Above'], ['below', 'Below']], 'a rightward arrow’s label sides');
eq(labelSides(square.arrows[1], square), [['above', 'Right'], ['below', 'Left']], 'a downward arrow’s label sides');

// 2.5: arrow kinds, loops and shifts
const two: CdModel = { cells: [{ id: 'c1', row: 0, col: 0, text: 'A' }, { id: 'c2', row: 0, col: 1, text: 'B' }], arrows: [] };
let pairs = connectCd(two, 'c1', 'c2');
eq(pairs.arrows, [{ id: 'a1', from: 'c1', to: 'c2' }], 'one arrow, not shifted');
pairs = connectCd(pairs, 'c1', 'c2');
eq(pairs.arrows.map((a) => [a.shift, a.swap]), [['left', undefined], ['right', true]], 'a second the same way: apart, its label below');
eq(connectCd(connectCd(two, 'c1', 'c2'), 'c2', 'c1').arrows.map((a) => a.shift), ['left', 'left'], 'one back: each to its own left');
eq(connectCd(two, 'c1', 'c1', 'below').arrows[0], { id: 'a1', from: 'c1', to: 'c1', loop: 'below' }, 'a loop round the side it was drawn from');
eq(connectCd(two, 'c1', 'c1', 'above').arrows[0], { id: 'a1', from: 'c1', to: 'c1' }, 'above is a loop’s own side');
const kinds: CdModel = {
  cells: two.cells,
  arrows: [
    { id: 'a1', from: 'c1', to: 'c2', kind: 'double', label: '\\alpha' },
    { id: 'a2', from: 'c1', to: 'c2', kind: 'mapsto', shift: 'left' },
    { id: 'a3', from: 'c1', to: 'c2', kind: 'equal', shift: 'right' },
    { id: 'a4', from: 'c2', to: 'c1', kind: 'tail', hook: true },
    { id: 'a5', from: 'c2', to: 'c1', kind: 'harpoon', dashed: true },
    { id: 'a6', from: 'c1', to: 'c1', label: 'f' },
    { id: 'a7', from: 'c2', to: 'c2', loop: 'right', swap: true, label: 'g' }
  ]
};
eq(cdCode(kinds).body.split('\n')[1], 'A \\arrow[r, Rightarrow, "\\alpha"] \\arrow[r, mapsto, shift left] \\arrow[r, equal, shift right] \\arrow[loop above, "f"] & B \\arrow[l, tail, hook] \\arrow[l, harpoon, dashed] \\arrow[loop right, "g"\']', 'kinds, shifts and loops');
eq(cdNeedsVersion5(square), false, 'the first drawing needs no version 5');
eq(kinds.arrows.map((a) => cdNeedsVersion5({ cells: two.cells, arrows: [a] })), [true, true, true, true, true, true, true], 'each kind, a shift and a loop need version 5');

console.log('tikzcd.check: ok');
