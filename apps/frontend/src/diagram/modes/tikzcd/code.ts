import { mathsPackages } from '../shared';
import { sideName } from '../circuitikz/labels';
import { nextId } from '../tikz/code';

// Commutative diagrams (tikz-cd): maths objects on a grid of rows and columns, and labelled arrows between them

export type Cell = { id: string; row: number; col: number; text: string };
/** An arrow's kind besides the plain one: ⇒, ↦, =, ↣ and ⇀ (tikz-cd's Rightarrow, mapsto, equal, tail and harpoon). */
export type CdKind = 'double' | 'mapsto' | 'equal' | 'tail' | 'harpoon';
/** Where a loop (an arrow from an object to itself) goes round. */
export type CdLoop = 'above' | 'right' | 'below' | 'left';
/**
 * swap: the label on the other side (below a rightward arrow). kind: none is the plain arrow. shift: moved a little to
 * its left or right, as each of two arrows between the same objects is. loop: an arrow to itself goes round this side,
 * above when none.
 */
export type CdArrow = { id: string; from: string; to: string; label?: string; swap?: boolean; hook?: boolean; twoHeads?: boolean; dashed?: boolean; kind?: CdKind; shift?: 'left' | 'right'; loop?: CdLoop };
export type CdModel = { cells: Cell[]; arrows: CdArrow[] };

export const emptyCd = (): CdModel => ({ cells: [], arrows: [] });

/** tikz-cd's direction letters from one cell to another: "r", "dd", "rd", … */
export function direction(from: Cell, to: Cell) {
  const cols = to.col - from.col;
  const rows = to.row - from.row;
  return (cols > 0 ? 'r' : 'l').repeat(Math.abs(cols)) + (rows > 0 ? 'd' : 'u').repeat(Math.abs(rows));
}

// a label with these in it goes in braces, so tikz-cd doesn't read them as its own
const quoted = (label: string) => (/[",=\]]/.test(label) ? `"{${label}}"` : `"${label}"`);

/** The two sides an arrow's label can go, named as the arrow runs: tikz-cd's default is on its left (above →, right of ↓). */
export function labelSides(arrow: CdArrow, model: CdModel): [string, string][] {
  const [from, to] = [arrow.from, arrow.to].map((id) => model.cells.find((c) => c.id === id));
  // y up, as sideName has it; the grid's rows go down
  const u = from && to ? { x: to.col - from.col, y: from.row - to.row } : { x: 1, y: 0 };
  return [
    ['above', sideName(u, 1)],
    ['below', sideName(u, -1)]
  ];
}

const KIND: Record<CdKind, string> = { double: 'Rightarrow', mapsto: 'mapsto', equal: 'equal', tail: 'tail', harpoon: 'harpoon' };

function arrowCode(arrow: CdArrow, from: Cell, to: Cell) {
  const label = arrow.label?.trim();
  const options = [
    from === to ? `loop ${arrow.loop ?? 'above'}` : direction(from, to),
    arrow.kind && KIND[arrow.kind],
    arrow.shift && `shift ${arrow.shift}`,
    label && `${quoted(label)}${arrow.swap ? "'" : ''}`,
    arrow.hook && 'hook',
    arrow.twoHeads && 'two heads',
    arrow.dashed && 'dashed'
  ].filter(Boolean);
  return `\\arrow[${options.join(', ')}]`;
}

export function cdCode(model: CdModel) {
  const cells = new Map(model.cells.map((c) => [c.id, c]));
  const rows = model.cells.map((c) => c.row);
  const cols = model.cells.map((c) => c.col);
  const [top, left] = [Math.min(...rows), Math.min(...cols)];
  const lines: string[] = [];
  for (let row = top; row <= Math.max(...rows); row += 1) {
    const entries: string[] = [];
    for (let col = left; col <= Math.max(...cols); col += 1) {
      const cell = model.cells.find((c) => c.row === row && c.col === col);
      const arrows = cell
        ? model.arrows.flatMap((a) => {
            const to = cells.get(a.to);
            return a.from === cell.id && to ? [arrowCode(a, cell, to)] : [];
          })
        : [];
      entries.push([cell?.text.trim(), ...arrows].filter(Boolean).join(' '));
    }
    // empty cells at the end of a row are left out
    while (entries.length && !entries[entries.length - 1]) entries.pop();
    lines.push(entries.join(' & '));
  }
  const body = ['\\begin{tikzcd}', lines.join(' \\\\\n'), '\\end{tikzcd}'].filter((l) => l !== '');
  const texts = [...model.cells.map((c) => c.text), ...model.arrows.map((a) => a.label ?? '')];
  return { body: `${body.join('\n')}\n`, packages: ['tikz-cd', ...mathsPackages(texts)], libraries: [] };
}

/** The drawing uses something 2.5 added (fileFormat.ts's version 5), which builds up to 2.4 would write without. */
export const cdNeedsVersion5 = (model: CdModel) => model.arrows.some((a) => a.kind || a.shift || a.from === a.to);

/**
 * A new arrow: a loop round the side it was drawn from when both ends are one object. A second arrow between the same
 * two objects, either way, shifts both apart: each to its own left when they go opposite ways, to either side when they
 * go the same way, the one on the right with its label below it.
 */
export function connectCd(model: CdModel, from: string, to: string, loop?: CdLoop): CdModel {
  const id = nextId('a', model.arrows.map((a) => a.id));
  if (from === to) return { ...model, arrows: [...model.arrows, { id, from, to, ...(loop && loop !== 'above' ? { loop } : {}) }] };
  const same = (a: CdArrow) => a.from === from && a.to === to;
  const back = (a: CdArrow) => a.from === to && a.to === from;
  const pair = model.arrows.some((a) => same(a) || back(a));
  const arrows = model.arrows.map((a) => ((same(a) || back(a)) && !a.shift ? { ...a, shift: 'left' as const } : a));
  // the one on the right, going the same way, has its label on that side too
  const shift: Partial<CdArrow> = !pair ? {} : model.arrows.some(same) ? { shift: 'right', swap: true } : { shift: 'left' };
  return { ...model, arrows: [...arrows, { id, from, to, ...shift }] };
}

// ─── the selection's Copy, Paste and Delete ───

export function copyCd(model: CdModel, ids: string[]): CdModel {
  const cells = model.cells.filter((c) => ids.includes(c.id));
  const kept = new Set(cells.map((c) => c.id));
  return { cells, arrows: model.arrows.filter((a) => kept.has(a.from) && kept.has(a.to)) };
}

/** Copied objects back in with new ids, the fewest columns to the right that are free for all of them. */
export function pasteCd(model: CdModel, clip: unknown) {
  const copied = clip as CdModel;
  if (!copied || !Array.isArray(copied.cells) || !copied.cells.length) return { model, ids: [] };
  const taken = new Set(model.cells.map((c) => `${c.row},${c.col}`));
  let shift = 1;
  while (copied.cells.some((c) => taken.has(`${c.row},${c.col + shift}`))) shift += 1;
  const cells = [...model.cells];
  const arrows = [...model.arrows];
  const renamed = new Map<string, string>();
  for (const cell of copied.cells) {
    const id = nextId('c', cells.map((c) => c.id));
    renamed.set(cell.id, id);
    cells.push({ ...cell, id, col: cell.col + shift });
  }
  const added = [...renamed.values()];
  for (const arrow of copied.arrows ?? []) {
    const from = renamed.get(arrow.from);
    const to = renamed.get(arrow.to);
    if (!from || !to) continue;
    const id = nextId('a', arrows.map((a) => a.id));
    arrows.push({ ...arrow, id, from, to });
    added.push(id);
  }
  return { model: { cells, arrows }, ids: added };
}

export function removeCd(model: CdModel, ids: string[]): CdModel {
  const cells = model.cells.filter((c) => !ids.includes(c.id));
  const kept = new Set(cells.map((c) => c.id));
  return { cells, arrows: model.arrows.filter((a) => !ids.includes(a.id) && kept.has(a.from) && kept.has(a.to)) };
}
