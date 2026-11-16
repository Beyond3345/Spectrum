// Plain TikZ: boxes and the arrows between them, written as absolute coordinates. One grid unit is 0.25 cm, y down on
// the canvas and up in TikZ. The writers live in the backend's latex/flowchart.js, which the converter uses too, to
// write a drawing again as fletcher.
import { BAND, holds } from '../../../../../backend/src/latex/flowchart.js';
import type { Box, Link, Shape, Side, TikzModel } from '../../../../../backend/src/latex/flowchart.js';

export type { Box, Dash, Heads, LabelSide, Line, Link, Route, Shape, Side, TikzModel } from '../../../../../backend/src/latex/flowchart.js';
export {
  BAND,
  BEND,
  CM_PER_UNIT,
  SIGN_AT,
  along,
  bandOf,
  holds,
  polygonOf,
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
export const FLETCHER_SHAPES: Shape[] = ['rectangle', 'rounded', 'circle', 'ellipse', 'diamond', 'parallelogram', 'text', 'maths', 'state', 'accepting', 'cylinder', 'trapezium', 'operator', 'container', 'terminal', 'manualInput', 'offPage', 'gain', 'takeoff', 'swimlane'];

/** The shapes there were before the automata, flowchart and model architecture ones. */
const FIRST_SHAPES: Shape[] = ['rectangle', 'rounded', 'circle', 'ellipse', 'diamond', 'parallelogram', 'text', 'maths'];
/**
 * The drawing uses something a build from before these shapes doesn't know and would write without: its file is then
 * version 2, which such a build opens as code instead of saving it with parts missing.
 */
export const tikzIsNewer = (model: TikzModel) =>
  model.boxes.some((b) => !FIRST_SHAPES.includes(b.shape) || b.initial || b.wrap || b.cells || b.repeat) ||
  model.links.some((l) => l.route === 'bend' || l.from === l.to);

/** The shapes 2.5 added. */
const SHAPES_25: Shape[] = ['terminal', 'manualInput', 'offPage', 'gain', 'takeoff', 'swimlane'];
/** The drawing uses something 2.5 added (fileFormat.ts's version 5), which builds up to 2.4 would write without. */
export const tikzNeedsVersion5 = (model: TikzModel) =>
  model.boxes.some((b) => SHAPES_25.includes(b.shape) || b.dir) || model.links.some((l) => l.labelSide || l.labelPos !== undefined || l.sign);

export const emptyTikz = (): TikzModel => ({ boxes: [], links: [] });

/** A swimlane's title band as [x, y, w, h] in grid units from its top-left corner, which a click on picks the lane up by. */
export function bandArea(box: Box): [number, number, number, number] {
  const band = Math.min(BAND, box.w, box.h);
  switch (box.dir ?? 't') {
    case 'b':
      return [0, box.h - band, box.w, band];
    case 'l':
      return [0, 0, band, box.h];
    case 'r':
      return [box.w - band, 0, band, box.h];
    default:
      return [0, 0, box.w, band];
  }
}

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
  container: [20, 14, 'Block'],
  terminal: [8, 4, 'Start'],
  manualInput: [8, 4, 'Input'],
  offPage: [4, 4, 'A'],
  gain: [6, 6, 'K'],
  takeoff: [2, 2, ''],
  swimlane: [16, 24, 'Lane']
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

// ─── turning and mirroring a selection ───

export type Turn = 'left' | 'right' | 'across' | 'over';
/** Each side turned: a quarter turn left (anticlockwise) or right, or mirrored left to right (across) or top to bottom (over). */
const TURNED: Record<Turn, Record<Side, Side>> = {
  right: { t: 'r', r: 'b', b: 'l', l: 't' },
  left: { t: 'l', l: 'b', b: 'r', r: 't' },
  across: { t: 't', b: 'b', l: 'r', r: 'l' },
  over: { t: 'b', b: 't', l: 'l', r: 'r' }
};

/**
 * The selected boxes turned a quarter or mirrored about the middle of the space they take, each box's centre carried
 * round (and a container's, swimlane's or gain's width and height swapped by a turn); the sides arrows leave and reach them by, loops, start arrows, a
 * gain's tip and a swimlane's band go round with them, and a mirror puts labels beside an arrow on its other side.
 * ponytail: a parallelogram's slant, a manual input's sloped top, a bent arrow's side and a sign's side (always on the
 * left of its arrow) stay as they were, as the model has no field for them.
 */
export function turnTikz(model: TikzModel, ids: string[], how: Turn): TikzModel {
  const picked = model.boxes.filter((b) => ids.includes(b.id));
  if (!picked.length) return model;
  const [x0, y0] = [Math.min(...picked.map((b) => b.x)), Math.min(...picked.map((b) => b.y))];
  const [x1, y1] = [Math.max(...picked.map((b) => b.x + b.w)), Math.max(...picked.map((b) => b.y + b.h))];
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const side = TURNED[how];
  const quarter = how === 'left' || how === 'right';
  const boxes = model.boxes.map((b) => {
    if (!ids.includes(b.id)) return b;
    const [bx, by] = [b.x + b.w / 2 - cx, b.y + b.h / 2 - cy];
    // on the canvas, whose y goes down, a turn to the right is clockwise
    const [nx, ny] = how === 'right' ? [-by, bx] : how === 'left' ? [by, -bx] : how === 'across' ? [-bx, by] : [bx, -by];
    // boxes of text keep their size, to read as before; what holds others, and a gain, turn with them
    const [w, h] = quarter && (holds(b.shape) || b.shape === 'gain') ? [b.h, b.w] : [b.w, b.h];
    const turned: Box = { ...b, x: Math.round(cx + nx - w / 2), y: Math.round(cy + ny - h / 2), w, h };
    if (b.initial) turned.initial = side[b.initial];
    if (b.shape === 'gain' || b.shape === 'swimlane') {
      const dir = side[b.dir ?? (b.shape === 'gain' ? 'r' : 't')];
      turned.dir = dir === (b.shape === 'gain' ? 'r' : 't') ? undefined : dir;
    }
    return turned;
  });
  const links = model.links.map((l) => {
    const [a, b] = [ids.includes(l.from), ids.includes(l.to)];
    if (!a && !b) return l;
    const turned = { ...l, fromSide: a ? side[l.fromSide] : l.fromSide, toSide: b ? side[l.toSide] : l.toSide };
    // a mirror image has its labels on the other side of the way the arrow goes
    if (a && b && !quarter && (l.labelSide === 'left' || l.labelSide === 'right')) turned.labelSide = l.labelSide === 'left' ? 'right' : 'left';
    return turned;
  });
  return { boxes, links };
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

/**
 * The sides of two boxes that face each other, for an arrow between them: left and right when they are further apart
 * across than up and down, otherwise top and bottom; a box with itself, a loop above it.
 */
export function facing(from: Box, to: Box): [Side, Side] {
  if (from === to) return ['t', 't'];
  const [dx, dy] = [to.x + to.w / 2 - (from.x + from.w / 2), to.y + to.h / 2 - (from.y + from.h / 2)];
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  return dy >= 0 ? ['b', 't'] : ['t', 'b'];
}

/** Boxes moved to these top-left corners, in grid units. A container moved takes the boxes whose centres are in it along. */
export function moveBoxes(boxes: Box[], moves: { id: string; x: number; y: number }[]): Box[] {
  const moved = new Map(moves.map((m) => [m.id, m]));
  const along = new Map<string, [number, number]>();
  for (const box of boxes) {
    const m = moved.get(box.id);
    if (!m || !holds(box.shape) || (m.x === box.x && m.y === box.y)) continue;
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
