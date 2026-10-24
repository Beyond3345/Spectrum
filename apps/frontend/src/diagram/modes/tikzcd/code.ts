import { mathsPackages } from '../shared';
import { nextId } from '../tikz/code';

// Commutative diagrams (tikz-cd): maths objects on a grid of rows and columns, and labelled arrows between them

export type Cell = { id: string; row: number; col: number; text: string };
/** swap: the label on the other side (below a rightward arrow) */
export type CdArrow = { id: string; from: string; to: string; label?: string; swap?: boolean; hook?: boolean; twoHeads?: boolean; dashed?: boolean };
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

function arrowCode(arrow: CdArrow, from: Cell, to: Cell) {
  const label = arrow.label?.trim();
  const options = [
    direction(from, to),
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
            return a.from === cell.id && to && to !== cell ? [arrowCode(a, cell, to)] : [];
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
