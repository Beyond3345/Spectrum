// Plain TikZ: boxes and the arrows between them, written as absolute coordinates. One grid unit is 0.25 cm, y down on
// the canvas and up in TikZ. The writers live in the backend's latex/flowchart.js, which the converter uses too, to
// write a drawing again as fletcher.
import type { Box, Link, Shape, Side, TikzModel } from '../../../../../backend/src/latex/flowchart.js';

export type { Box, Dash, Heads, Line, Link, Route, Shape, Side, TikzModel } from '../../../../../backend/src/latex/flowchart.js';
export {
  BEND,
  CM_PER_UNIT,
  LOOP,
  MATHS_SHAPES,
  ROUND_SHAPES,
  anchorOf,
  corners,
  curveControls,
  dividersOf,
  drawingOrder,
  middleOf,
  pathPoints,
  plainShape,
  stateShape,
  tikzCode
} from '../../../../../backend/src/latex/flowchart.js';

/**
 * The shapes fletcher/code.ts writes, which the Typst canvas offers (its rail and its inspector's Shape): a shape fletcher
 * has no equivalent for (the document and the stack) stays TikZ only, hidden in Typst drawings.
 */
export const FLETCHER_SHAPES: Shape[] = ['rectangle', 'rounded', 'circle', 'ellipse', 'diamond', 'parallelogram', 'text', 'maths', 'state', 'accepting', 'cylinder', 'trapezium', 'operator', 'container'];

/** The shapes there were before the automata, flowchart and model architecture ones. */
const FIRST_SHAPES: Shape[] = ['rectangle', 'rounded', 'circle', 'ellipse', 'diamond', 'parallelogram', 'text', 'maths'];
/**
 * The drawing uses something a build from before these shapes doesn't know and would write without: its file is then
 * version 2, which such a build opens as code instead of saving it with parts missing.
 */
export const tikzIsNewer = (model: TikzModel) =>
  model.boxes.some((b) => !FIRST_SHAPES.includes(b.shape) || b.initial || b.wrap || b.cells || b.repeat) ||
  model.links.some((l) => l.route === 'bend' || l.from === l.to);

export const emptyTikz = (): TikzModel => ({ boxes: [], links: [] });

/**
 * a new shape's size in grid units, and its text. Every size even, so each box's centre is on the grid as its corner is,
 * and an arrow between two boxes in line is straight.
 */
export const NEW: Record<Shape, [number, number, string]> = {
  rectangle: [8, 4, 'Text'],
  rounded: [8, 4, 'Text'],
  circle: [6, 6, ''],
  ellipse: [8, 6, 'Text'],
  diamond: [8, 6, 'Text'],
  parallelogram: [8, 4, 'Text'],
  text: [6, 2, 'Text'],
  maths: [6, 2, 'x^2'],
  state: [6, 6, 'q_0'],
  accepting: [6, 6, 'q_1'],
  cylinder: [6, 6, 'Data'],
  document: [8, 6, 'Report'],
  trapezium: [8, 4, 'Text'],
  operator: [4, 4, '+'],
  stack: [4, 8, ''],
  container: [20, 14, 'Block']
};

/**
 * A box resized on the canvas to w × h grid units, in steps of 2 so its centre stays on the grid. at: its new top-left
 * corner, when dragged from the left or top edge, whose opposite edge then stays put. A container keeps the boxes in it
 * where they are, as a resize isn't a move.
 */
export function resized(box: Box, w: number, h: number, at?: { x: number; y: number }): Box {
  const even = (v: number) => Math.max(2, 2 * Math.round(v / 2));
  const [nw, nh] = [even(w), even(h)];
  return {
    ...box,
    x: at && Math.round(at.x) !== box.x ? box.x + box.w - nw : box.x,
    y: at && Math.round(at.y) !== box.y ? box.y + box.h - nh : box.y,
    w: nw,
    h: nh
  };
}

// ─── the selection's Copy, Paste and Delete ───

/** The next free id with this prefix: n1, n2, … */
export function nextId(prefix: string, taken: Iterable<string>) {
  let n = 0;
  for (const id of taken) {
    const m = id.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${prefix}${n + 1}`;
}

/**
 * A new arrow: a loop on its side when both ends are one box; bent to one side, as the straight arrow already going the
 * other way becomes, when it makes a pair with one.
 */
export function connect(model: TikzModel, from: string, to: string, fromSide: Side, toSide: Side): TikzModel {
  const id = nextId('e', model.links.map((l) => l.id));
  const back = (l: Link) => from !== to && l.from === to && l.to === from;
  const pair = model.links.some(back);
  const links = model.links.map((l) => (back(l) && l.route === 'straight' ? { ...l, route: 'bend' as const } : l));
  return { ...model, links: [...links, { id, from, to, fromSide, toSide: from === to ? fromSide : toSide, route: pair ? 'bend' : 'straight', heads: 'end' }] };
}

/** Boxes moved to these top-left corners, in grid units. A container moved takes the boxes whose centres are in it along. */
export function moveBoxes(boxes: Box[], moves: { id: string; x: number; y: number }[]): Box[] {
  const moved = new Map(moves.map((m) => [m.id, m]));
  const along = new Map<string, [number, number]>();
  for (const box of boxes) {
    const m = moved.get(box.id);
    if (!m || box.shape !== 'container' || (m.x === box.x && m.y === box.y)) continue;
    for (const b of boxes) {
      const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
      if (b !== box && !moved.has(b.id) && cx > box.x && cx < box.x + box.w && cy > box.y && cy < box.y + box.h) along.set(b.id, [m.x - box.x, m.y - box.y]);
    }
  }
  return boxes.map((b) => {
    const m = moved.get(b.id);
    const by = along.get(b.id);
    return m ? { ...b, x: m.x, y: m.y } : by ? { ...b, x: b.x + by[0], y: b.y + by[1] } : b;
  });
}

/** The selected boxes, and the arrows between them or selected with both their ends. */
export function copyTikz(model: TikzModel, ids: string[]): TikzModel {
  const boxes = model.boxes.filter((b) => ids.includes(b.id));
  const kept = new Set(boxes.map((b) => b.id));
  return { boxes, links: model.links.filter((l) => kept.has(l.from) && kept.has(l.to)) };
}

/** Copied boxes and arrows back in with new ids, 1 cm down and to the right. */
export function pasteTikz(model: TikzModel, clip: unknown) {
  const copied = clip as TikzModel;
  if (!copied || !Array.isArray(copied.boxes)) return { model, ids: [] };
  const boxes = [...model.boxes];
  const links = [...model.links];
  const renamed = new Map<string, string>();
  for (const box of copied.boxes) {
    const id = nextId('n', boxes.map((b) => b.id));
    renamed.set(box.id, id);
    boxes.push({ ...box, id, x: box.x + 4, y: box.y + 4 });
  }
  const added = [...renamed.values()];
  for (const link of copied.links ?? []) {
    const from = renamed.get(link.from);
    const to = renamed.get(link.to);
    if (!from || !to) continue;
    const id = nextId('e', links.map((l) => l.id));
    links.push({ ...link, id, from, to });
    added.push(id);
  }
  return { model: { boxes, links }, ids: added };
}

/** Without these boxes and arrows, nor the arrows left without an end. */
export function removeTikz(model: TikzModel, ids: string[]): TikzModel {
  const boxes = model.boxes.filter((b) => !ids.includes(b.id));
  const kept = new Set(boxes.map((b) => b.id));
  return { boxes, links: model.links.filter((l) => !ids.includes(l.id) && kept.has(l.from) && kept.has(l.to)) };
}
