import { latexColour, mathsPackages, num } from '../shared';

// Plain TikZ: boxes and the arrows between them, written as absolute coordinates. One grid unit is 0.25 cm, y down on
// the canvas and up in TikZ.

export type Shape = 'rectangle' | 'rounded' | 'circle' | 'ellipse' | 'diamond' | 'parallelogram' | 'text' | 'maths';
/** the side of a box an arrow leaves or reaches: north, east, south or west */
export type Side = 't' | 'r' | 'b' | 'l';
export type Dash = 'solid' | 'dashed' | 'dotted';
/** stroke: '#rrggbb', none for black; width in pt, none for TikZ's own 0.4 pt */
export type Line = { stroke?: string; dash?: Dash; width?: number };
/** x and y: the top-left corner, w and h: the size, all in grid units */
export type Box = Line & { id: string; shape: Shape; x: number; y: number; w: number; h: number; text: string; fill?: string };
export type Route = 'straight' | 'angled' | 'curved';
export type Heads = 'none' | 'end' | 'start' | 'both';
export type Link = Line & { id: string; from: string; to: string; fromSide: Side; toSide: Side; route: Route; heads: Heads; label?: string };
export type TikzModel = { boxes: Box[]; links: Link[] };

/**
 * The shapes fletcher/code.ts writes, which the Typst canvas offers (its rail and its inspector's Shape): a shape fletcher
 * has no equivalent for stays TikZ only, hidden in Typst drawings. Every shape so far has one.
 */
export const FLETCHER_SHAPES: Shape[] = ['rectangle', 'rounded', 'circle', 'ellipse', 'diamond', 'parallelogram', 'text', 'maths'];

export const CM_PER_UNIT = 0.25;
const ANCHOR: Record<Side, string> = { t: 'north', r: 'east', b: 'south', l: 'west' };
const ANGLE: Record<Side, number> = { r: 0, t: 90, l: 180, b: 270 };
const DIRECTION: Record<Side, [number, number]> = { r: [1, 0], t: [0, -1], l: [-1, 0], b: [0, 1] };
const horizontal = (side: Side) => side === 'r' || side === 'l';

export const emptyTikz = (): TikzModel => ({ boxes: [], links: [] });

/** Where a side's anchor is, in grid units. */
export function anchorOf(box: Box, side: Side): [number, number] {
  const [dx, dy] = DIRECTION[side];
  return [box.x + (box.w * (1 + dx)) / 2, box.y + (box.h * (1 + dy)) / 2];
}

/**
 * The corners a right-angled arrow turns at, in grid units: one when it leaves along one axis and arrives along the
 * other, two (halfway between, or out past both boxes when both sides face the same way) when it leaves and arrives
 * along the same one. ponytail: the route can cross the boxes it joins; route round them if that bites.
 */
export function corners(link: Link, from: Box, to: Box): [number, number][] {
  const [ax, ay] = anchorOf(from, link.fromSide);
  const [bx, by] = anchorOf(to, link.toSide);
  if (horizontal(link.fromSide) !== horizontal(link.toSide)) return horizontal(link.fromSide) ? [[bx, ay]] : [[ax, by]];
  if (horizontal(link.fromSide)) {
    const mx = link.fromSide === link.toSide ? (link.fromSide === 'r' ? Math.max(ax, bx) + 2 : Math.min(ax, bx) - 2) : (ax + bx) / 2;
    return [[mx, ay], [mx, by]];
  }
  const my = link.fromSide === link.toSide ? (link.fromSide === 'b' ? Math.max(ay, by) + 2 : Math.min(ay, by) - 2) : (ay + by) / 2;
  return [[ax, my], [bx, my]];
}

/** What a straight or right-angled arrow goes through, in grid units, anchor to anchor, without a corner twice. */
export function pathPoints(link: Link, from: Box, to: Box) {
  const a = anchorOf(from, link.fromSide);
  const b = anchorOf(to, link.toSide);
  const same = (p: [number, number], q: [number, number]) => p[0] === q[0] && p[1] === q[1];
  const points = [a];
  for (const corner of link.route === 'angled' ? corners(link, from, to) : []) {
    if (!same(corner, points[points.length - 1]) && !same(corner, b)) points.push(corner);
  }
  return [...points, b];
}

/** The control points of a curved arrow, as TikZ's to[out=…, in=…] places them (looseness 1). */
export function curveControls(link: Link, from: Box, to: Box): [[number, number], [number, number]] {
  const [ax, ay] = anchorOf(from, link.fromSide);
  const [bx, by] = anchorOf(to, link.toSide);
  const reach = 0.3915 * Math.hypot(bx - ax, by - ay);
  const [ox, oy] = DIRECTION[link.fromSide];
  const [ix, iy] = DIRECTION[link.toSide];
  return [
    [ax + ox * reach, ay + oy * reach],
    [bx + ix * reach, by + iy * reach]
  ];
}

/** Where along a polyline its middle falls: the leg it's on and how far along that leg (0 to 1). */
export function middleOf(points: [number, number][]) {
  const legs = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
  let left = legs.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < legs.length; i += 1) {
    if (left <= legs[i] || i === legs.length - 1) return { leg: i, pos: legs[i] ? Math.min(1, left / legs[i]) : 0.5 };
    left -= legs[i];
  }
  return { leg: 0, pos: 0.5 };
}

const at = (x: number, y: number) => `(${num(x * CM_PER_UNIT)},${num(-y * CM_PER_UNIT)})`;

function lineOptions(line: Line, colourKey = 'draw') {
  return [
    line.stroke && `${colourKey}=${latexColour(line.stroke)}`,
    line.dash && line.dash !== 'solid' && line.dash,
    line.width && `line width=${num(line.width)}pt`
  ].filter(Boolean) as string[];
}

const SHAPE: Record<Shape, string> = {
  rectangle: 'rectangle',
  rounded: 'rectangle, rounded corners',
  circle: 'circle',
  ellipse: 'ellipse',
  diamond: 'diamond',
  parallelogram: 'trapezium, trapezium left angle=70, trapezium right angle=110, trapezium stretches=true',
  text: '',
  maths: ''
};

function boxLine(box: Box) {
  const plain = box.shape === 'text' || box.shape === 'maths';
  const size = box.shape === 'circle'
    ? [`minimum size=${num(Math.min(box.w, box.h) * CM_PER_UNIT)}cm`]
    : plain ? [] : [`minimum width=${num(box.w * CM_PER_UNIT)}cm`, `minimum height=${num(box.h * CM_PER_UNIT)}cm`];
  const options = [
    // a label's colour is its text's; a box's is its border's
    ...(plain ? [] : [box.stroke ? `draw=${latexColour(box.stroke)}` : 'draw']),
    SHAPE[box.shape],
    box.shape === 'diamond' && `aspect=${num(box.w / box.h)}`,
    box.fill && `fill=${latexColour(box.fill)}`,
    ...(plain ? lineOptions({ stroke: box.stroke }, 'text') : lineOptions({ dash: box.dash, width: box.width })),
    ...size,
    'align=center'
  ].filter(Boolean);
  const lines = box.text.split('\n').map((l) => l.trim());
  const text = box.shape === 'maths' ? (box.text.trim() ? `$${box.text.trim()}$` : '') : lines.join(' \\\\ ').trim();
  return `\\node[${options.join(', ')}] (${box.id}) at ${at(box.x + box.w / 2, box.y + box.h / 2)} {${text}};`;
}

const HEADS: Record<Heads, string> = { none: '', end: '-{Stealth}', start: '{Stealth}-', both: '{Stealth}-{Stealth}' };

function linkLine(link: Link, boxes: Map<string, Box>) {
  const from = boxes.get(link.from);
  const to = boxes.get(link.to);
  if (!from || !to) return '';
  const options = [HEADS[link.heads], ...lineOptions(link)].filter(Boolean);
  const start = `(${from.id}.${ANCHOR[link.fromSide]})`;
  const end = `(${to.id}.${ANCHOR[link.toSide]})`;
  const label = (pos: string) => (link.label?.trim() ? ` node[${pos}, fill=white, inner sep=2pt] {${link.label.trim()}}` : '');
  let path: string;
  if (link.route === 'curved') {
    path = `${start} to[out=${ANGLE[link.fromSide]}, in=${ANGLE[link.toSide]}]${label('midway')} ${end}`;
  } else {
    const points = pathPoints(link, from, to);
    const middle = middleOf(points);
    const targets = [...points.slice(1, -1).map(([x, y]) => at(x, y)), end];
    path = start + targets.map((target, i) => ` --${i === middle.leg ? label(middle.pos === 0.5 ? 'midway' : `pos=${num(middle.pos)}`) : ''} ${target}`).join('');
  }
  return `\\draw${options.length ? `[${options.join(', ')}]` : ''} ${path};`;
}

export function tikzCode(model: TikzModel) {
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const body = ['\\begin{tikzpicture}', ...model.boxes.map(boxLine), ...model.links.map((l) => linkLine(l, boxes)).filter(Boolean), '\\end{tikzpicture}'];
  const texts = [...model.boxes.map((b) => b.text), ...model.links.map((l) => l.label ?? '')];
  // positioning isn't used by the picture itself, but loaded for code added by hand in the TikZ way (right=of n1)
  return { body: `${body.join('\n')}\n`, packages: ['tikz', ...mathsPackages(texts)], libraries: ['shapes.geometric', 'arrows.meta', 'positioning'] };
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
