// The vector drawing: points, free or constructed from others (a midpoint, a point dividing a segment, the foot of a
// projection, u + v and v − u, where two lines meet, a scalar multiple, a reflection, a line's intercepts), and the
// things drawn between them (vectors, segments, lines, lines from equations, circles, arcs, polygons, axes and marks),
// in panels set side by side. Coordinates are in cm with y up, each panel's own; a constructed point is worked out
// from its parents every time, so it stays exact as they move.
import type { Pt } from '../circuitikz/model';
import { num } from '../shared';

export type { Pt };

/** Where a label sits, as TikZ names it: above puts the label above the point. */
export type Side = 'above' | 'below' | 'left' | 'right' | 'above left' | 'above right' | 'below left' | 'below right';
export const SIDES: Side[] = ['above', 'above right', 'right', 'below right', 'below', 'below left', 'left', 'above left'];

/** LaTeX's sizes, \tiny to \Large, as a label's font */
export type FontSize = 'tiny' | 'scriptsize' | 'footnotesize' | 'small' | 'normalsize' | 'large' | 'Large';
export const FONT_SIZES: FontSize[] = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large'];

/** A label's look; each left out is the document's own (black, normal size). */
export interface TextStyle {
  size?: FontSize;
  colour?: string;
}

export interface Label extends TextStyle {
  /** TeX, as in the document: $A$, $U(2,5)$ */
  text: string;
  side?: Side;
  /** extra distance from the point, in pt */
  dist?: number;
}

export type Construction =
  | { kind: 'mid'; a: string; b: string }
  /** the point dividing AB with AM : MB = m : n; marks: the m and n written along each part, on that side */
  | { kind: 'ratio'; a: string; b: string; m: number; n: number; marks?: Side }
  /** the foot of the perpendicular from p to the line ab */
  | { kind: 'foot'; p: string; a: string; b: string }
  /** the tip of u + v, u and v drawn from o (the panel's origin when left out) */
  | { kind: 'sum'; u: string; v: string; o?: string }
  /** the tip of v − u drawn from o */
  | { kind: 'diff'; u: string; v: string; o?: string }
  /** where the lines AB and CD cross; nowhere while they're parallel */
  | { kind: 'meet'; a: string; b: string; c: string; d: string }
  /** A + k(B − A): the tip of k times the vector AB drawn from A; k may be negative */
  | { kind: 'scale'; a: string; b: string; k: number }
  /** the reflection of p in the line ab */
  | { kind: 'reflect'; p: string; a: string; b: string }
  /** p plus AB turned a quarter anticlockwise: with p, a line through p square to AB */
  | { kind: 'perp'; p: string; a: string; b: string }
  /** where a line from its equation (an eqline item) crosses the x or y axis; nowhere when it runs along it */
  | { kind: 'intercept'; line: string; axis: 'x' | 'y' };

/** The constructions 2.5 added, which builds up to 2.4 can't place. */
const NEW_CONSTRUCTIONS: Construction['kind'][] = ['meet', 'scale', 'reflect', 'perp', 'intercept'];

export interface VPoint {
  id: string;
  /** the coordinate's name in the code: letters and digits */
  name: string;
  /** a free point's place; a constructed point's is worked out from its parents */
  x: number;
  y: number;
  of?: Construction;
  panel: string;
  /** drawn as a dot */
  dot?: boolean;
  /** the dot's radius in pt; the Style's point size when left out */
  size?: number;
  /** filled when left out */
  shape?: PointShape;
  colour?: string;
  label?: Label;
}

export type PointShape = 'filled' | 'open' | 'cross';

/** TikZ's line widths by name, thinnest first */
export type Width = 'ultra thin' | 'very thin' | 'thin' | 'semithick' | 'thick' | 'very thick' | 'ultra thick';
export const WIDTHS: Width[] = ['ultra thin', 'very thin', 'thin', 'semithick', 'thick', 'very thick', 'ultra thick'];
/** each name's width in pt */
export const WIDTH_PT: Record<Width, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
/** a TikZ name, or a width in pt */
export type Thickness = Width | number;

/** a TikZ dash name, or a custom pattern: on and off lengths in pt */
export type Dash = 'solid' | 'dashed' | 'dotted' | 'dash dot' | [number, number];

/** An arrow tip, as arrows.meta names them (stealth, latex and to are also TikZ's own, for >=). */
export type Tip = 'none' | 'stealth' | 'latex' | 'to' | 'triangle' | 'open triangle' | 'bar';
export const TIPS: Tip[] = ['none', 'stealth', 'latex', 'to', 'triangle', 'open triangle', 'bar'];

/** How a line is drawn; what's left out is the Style's default, or TikZ's. */
export interface Stroke {
  colour?: string;
  width?: Thickness;
  dash?: Dash;
  /** 0 to 1 */
  opacity?: number;
}

/** The tips at a line's ends and middle; a vector's end is the Style's tip when left out. */
export interface Tips {
  start?: Tip;
  end?: Tip;
  /** 1 is the usual size */
  tipSize?: number;
  /** an arrow halfway along */
  middle?: boolean;
}

/** xcolor names, as the code writes them; blue!50 is half blue */
export const COLOURS = ['black', 'blue', 'red', 'teal', 'orange', 'violet', 'gray', 'blue!50', 'red!50'];

export interface EdgeLabel extends TextStyle {
  text: string;
  /** 0 at the start to 1 at the end; 0.5 when left out */
  pos?: number;
  /** beside: on whichever side of the line is clear, written as TikZ's auto; left out: placed clear (labels.ts) */
  side?: Side | 'beside';
}

/** vector: an arrow; line: through a and b, out to the panel's frame; highlight: thick and light, for a projection */
export type LinkKind = 'vector' | 'segment' | 'line' | 'highlight';

export interface Link extends Stroke, Tips {
  id: string;
  kind: LinkKind;
  a: string;
  b: string;
  /** as 2.0 first wrote a dashed line; dash takes over once it's set */
  dashed?: boolean;
  label?: EdgeLabel;
  /** 1 to 3 equal-length ticks across its middle */
  ticks?: number;
}

export interface Polygon extends Stroke {
  id: string;
  kind: 'polygon';
  points: string[];
  fill?: string;
  /** 0 to 1 */
  fillOpacity?: number;
}

export interface Note extends TextStyle {
  id: string;
  kind: 'text';
  panel: string;
  x: number;
  y: number;
  text: string;
}

export interface Axes {
  id: string;
  kind: 'axes';
  panel: string;
  /** where each axis's arrow starts and ends */
  x: [number, number];
  y: [number, number];
  names?: [string, string];
  /** tick marks and numbers at each whole number but 0 */
  ticks?: boolean;
  /** O at the origin */
  origin?: boolean;
  /** the axes' and ticks' colour and width */
  colour?: string;
  width?: Thickness;
  /** the tip at each axis's end; the Style's when left out */
  tip?: Tip;
  /** how far each tick reaches either side of its axis, in cm; 0.08 when left out */
  tick?: number;
  /** the gap between ticks; 1 when left out */
  step?: number;
  /** the numbers' size; \small when left out */
  numbers?: FontSize;
  /** a grid behind, a line at each tick */
  grid?: boolean;
  /** the grid's colour and width: gray!30 and very thin when left out */
  gridColour?: string;
  gridWidth?: Thickness;
}

/** A right-angle mark at a point, one side towards another point and the other turned anticlockwise (clockwise when flipped). */
export interface RightMark extends Stroke {
  id: string;
  kind: 'right';
  at: string;
  toward: string;
  flip?: boolean;
}

/** A dashed line from a point straight down (or across) to an axis, or to both. */
export interface Drop extends Stroke {
  id: string;
  kind: 'drop';
  from: string;
  axis: 'x' | 'y' | 'both';
}

/** An angle's arc at a corner, turning anticlockwise from the side through one point to the side through another. */
export interface Angle extends Stroke {
  id: string;
  kind: 'angle';
  at: string;
  from: string;
  to: string;
  /** in cm; 0.6 when left out */
  radius?: number;
  /** written beside the arc's middle: $\theta$ */
  label?: TextStyle & { text: string };
  /** a second arc just outside the first */
  double?: boolean;
  /** an arrow at the arc's end, for a turn */
  arrow?: boolean;
}

/** A circle about a centre through a point; with to, only its arc from that point anticlockwise round to to's side. */
export interface Circle extends Stroke {
  id: string;
  kind: 'circle';
  centre: string;
  through: string;
  to?: string;
  fill?: string;
  fillOpacity?: number;
}

/** The line ax + by + c = 0, out to its panel's frame. */
export interface EqLine extends Stroke {
  id: string;
  kind: 'eqline';
  panel: string;
  a: number;
  b: number;
  c: number;
  label?: EdgeLabel;
}

export type Item = Link | Polygon | Note | Axes | RightMark | Drop | Angle | Circle | EqLine;

export interface Panel {
  id: string;
  /** how far right of the first, in cm, written as the scope's xshift */
  shift: number;
  /** written under it: (a) */
  caption?: string;
}

export interface VectorModel {
  panels: Panel[];
  points: VPoint[];
  items: Item[];
}

export const emptyVectors = (): VectorModel => ({ panels: [{ id: 'g1', shift: 0 }], points: [], items: [] });

/** A model read back from a file, or an empty one when it isn't a vector drawing. */
export function asVectors(model: unknown): VectorModel {
  const m = model as Partial<VectorModel> | null;
  if (!m || !Array.isArray(m.points) || !Array.isArray(m.items)) return emptyVectors();
  return { panels: Array.isArray(m.panels) && m.panels.length ? m.panels : emptyVectors().panels, points: m.points, items: m.items };
}

export const isLink = (item: Item): item is Link => item.kind === 'vector' || item.kind === 'segment' || item.kind === 'line' || item.kind === 'highlight';

// ─── geometry ───

export const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);

/** The points a construction is made from (an intercept's line, an item). */
export function parentsOf(c: Construction): string[] {
  switch (c.kind) {
    case 'foot':
    case 'reflect':
    case 'perp':
      return [c.p, c.a, c.b];
    case 'sum':
    case 'diff':
      return [c.u, c.v, ...(c.o ? [c.o] : [])];
    case 'meet':
      return [c.a, c.b, c.c, c.d];
    case 'intercept':
      return [c.line];
    default:
      return [c.a, c.b];
  }
}

const NOWHERE: Pt = { x: NaN, y: NaN };
/** A place that's there: a construction with none (parallel lines' meet) is NaN, and is left out of the drawing. */
export const placed = (p: Pt | undefined): p is Pt => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** The foot of the perpendicular from P to the line AB. */
const footOf = (P: Pt, A: Pt, B: Pt): Pt => {
  const d = { x: B.x - A.x, y: B.y - A.y };
  const len2 = d.x * d.x + d.y * d.y;
  const t = len2 ? ((P.x - A.x) * d.x + (P.y - A.y) * d.y) / len2 : 0;
  return { x: A.x + t * d.x, y: A.y + t * d.y };
};

/** Where the line ax + by + c = 0 crosses an axis, or nowhere. */
export function interceptOf(line: Pick<EqLine, 'a' | 'b' | 'c'>, axis: 'x' | 'y'): Pt {
  const k = axis === 'x' ? line.a : line.b;
  if (Math.abs(k) < 1e-12) return NOWHERE;
  return axis === 'x' ? { x: -line.c / k, y: 0 } : { x: 0, y: -line.c / k };
}

/** Where a construction puts its point, from its parents' places (and an intercept's line). */
export function construct(c: Construction, at: (id: string) => Pt, line?: (id: string) => EqLine | undefined): Pt {
  const O = 'o' in c && c.o ? at(c.o) : { x: 0, y: 0 };
  switch (c.kind) {
    case 'mid': {
      const [A, B] = [at(c.a), at(c.b)];
      return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    }
    case 'ratio': {
      const [A, B] = [at(c.a), at(c.b)];
      const t = c.m + c.n ? c.m / (c.m + c.n) : 0.5;
      return { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
    }
    case 'foot':
      return footOf(at(c.p), at(c.a), at(c.b));
    case 'sum': {
      const [U, V] = [at(c.u), at(c.v)];
      return { x: U.x + V.x - O.x, y: U.y + V.y - O.y };
    }
    case 'diff': {
      const [U, V] = [at(c.u), at(c.v)];
      return { x: O.x + V.x - U.x, y: O.y + V.y - U.y };
    }
    case 'meet': {
      const [A, B, C, D] = [at(c.a), at(c.b), at(c.c), at(c.d)];
      const [r, s] = [{ x: B.x - A.x, y: B.y - A.y }, { x: D.x - C.x, y: D.y - C.y }];
      const cross = r.x * s.y - r.y * s.x;
      if (Math.abs(cross) < 1e-12 * Math.max(1, Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y))) return NOWHERE;
      const t = ((C.x - A.x) * s.y - (C.y - A.y) * s.x) / cross;
      return { x: A.x + t * r.x, y: A.y + t * r.y };
    }
    case 'scale': {
      const [A, B] = [at(c.a), at(c.b)];
      return { x: A.x + c.k * (B.x - A.x), y: A.y + c.k * (B.y - A.y) };
    }
    case 'reflect': {
      const [P, F] = [at(c.p), footOf(at(c.p), at(c.a), at(c.b))];
      return { x: 2 * F.x - P.x, y: 2 * F.y - P.y };
    }
    case 'perp': {
      const [P, A, B] = [at(c.p), at(c.a), at(c.b)];
      return { x: P.x - (B.y - A.y), y: P.y + (B.x - A.x) };
    }
    case 'intercept': {
      const l = line?.(c.line);
      return l ? interceptOf(l, c.axis) : NOWHERE;
    }
  }
}

/** Every point's place in its panel, constructed ones from their parents (a point whose parents are gone stays where it was). */
export function resolve(model: VectorModel): Map<string, Pt> {
  const byId = new Map(model.points.map((p) => [p.id, p]));
  const lines = new Map(model.items.filter((i): i is EqLine => i.kind === 'eqline').map((i) => [i.id, i]));
  const places = new Map<string, Pt>();
  const placing = new Set<string>();
  const at = (id: string): Pt => {
    const known = places.get(id);
    if (known) return known;
    const p = byId.get(id);
    if (!p) return { x: 0, y: 0 };
    // a loop (never made by the tools) leaves the point where it was
    const parentsThere = p.of?.kind === 'intercept' ? lines.has(p.of.line) : p.of && parentsOf(p.of).every((parent) => byId.has(parent));
    if (!p.of || placing.has(id) || !parentsThere) {
      places.set(id, { x: p.x, y: p.y });
      return places.get(id)!;
    }
    placing.add(id);
    const place = construct(p.of, at, (line) => lines.get(line));
    placing.delete(id);
    places.set(id, place);
    return place;
  };
  model.points.forEach((p) => at(p.id));
  return places;
}

/** The panel a thing is in: its own, or its first point's. */
export function panelOf(model: VectorModel, item: Item | VPoint): string {
  if ('panel' in item) return item.panel;
  const first = pointsOf(item)[0];
  return model.points.find((p) => p.id === first)?.panel ?? model.panels[0].id;
}

/** The box a panel's lines run out to: its axes when it has them, otherwise its points with a centimetre round them. */
export function frameOf(model: VectorModel, panel: string, places = resolve(model)) {
  const axes = model.items.find((i): i is Axes => i.kind === 'axes' && i.panel === panel);
  if (axes) return { minX: Math.min(...axes.x), maxX: Math.max(...axes.x), minY: Math.min(...axes.y), maxY: Math.max(...axes.y) };
  // not a point that's only there to aim a line (a parallel's or perpendicular's), which would stretch the line
  const used = new Set([...model.items.filter((i) => i.kind !== 'line').flatMap(pointsOf), ...model.points.flatMap((p) => (p.of ? parentsOf(p.of) : []))]);
  const aims = (p: VPoint) => !!p.of && !p.dot && !p.label?.text.trim() && !used.has(p.id);
  const pts = model.points.filter((p) => p.panel === panel && !aims(p)).map((p) => places.get(p.id)!).filter(placed);
  if (!pts.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  return { minX: Math.min(...pts.map((p) => p.x)) - 1, maxX: Math.max(...pts.map((p) => p.x)) + 1, minY: Math.min(...pts.map((p) => p.y)) - 1, maxY: Math.max(...pts.map((p) => p.y)) + 1 };
}

/** The line through A and B cut off at a frame, from the end behind A to the end past B; null when A and B meet. */
export function clipLine(A: Pt, B: Pt, frame: { minX: number; maxX: number; minY: number; maxY: number }): [Pt, Pt] | null {
  const d = { x: B.x - A.x, y: B.y - A.y };
  if (Math.hypot(d.x, d.y) < 1e-9) return null;
  let lo = -Infinity;
  let hi = Infinity;
  for (const [p, q, min, max] of [[A.x, d.x, frame.minX, frame.maxX], [A.y, d.y, frame.minY, frame.maxY]] as const) {
    if (Math.abs(q) < 1e-12) continue;
    const [t1, t2] = [(min - p) / q, (max - p) / q].sort((m, n) => m - n);
    lo = Math.max(lo, t1);
    hi = Math.min(hi, t2);
  }
  if (lo > hi) return [A, B];
  return [{ x: A.x + lo * d.x, y: A.y + lo * d.y }, { x: A.x + hi * d.x, y: A.y + hi * d.y }];
}

/** A right-angle mark's three corners, size s along each side. */
export function rightCorners(at: Pt, toward: Pt, flip: boolean, s = 0.35): [Pt, Pt, Pt] {
  const len = dist(at, toward) || 1;
  const u = { x: (toward.x - at.x) / len, y: (toward.y - at.y) / len };
  const n = flip ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
  return [
    { x: at.x + s * u.x, y: at.y + s * u.y },
    { x: at.x + s * (u.x + n.x), y: at.y + s * (u.y + n.y) },
    { x: at.x + s * n.x, y: at.y + s * n.y }
  ];
}

/** A unit offset towards a side, y up. */
export function sideOffset(side: Side): Pt {
  const x = side.includes('left') ? -1 : side.includes('right') ? 1 : 0;
  const y = side.includes('above') ? 1 : side.includes('below') ? -1 : 0;
  return { x, y };
}

// ─── names and ids ───

let counter = 0;
/** A fresh id, unique in the model. */
export function newId(model: VectorModel, prefix: string) {
  const ids = new Set([...model.panels.map((p) => p.id), ...model.points.map((p) => p.id), ...model.items.map((i) => i.id)]);
  do counter += 1;
  while (ids.has(`${prefix}${counter}`));
  return `${prefix}${counter}`;
}

/** The next free point name in a panel: A to Z (O last, kept for the origin), then A1, B1… */
export function nextName(model: VectorModel, panel: string) {
  const taken = new Set(model.points.filter((p) => p.panel === panel).map((p) => p.name));
  const letters = 'ABCDEFGHIJKLMNPQRSTUVWXYZO';
  for (let round = 0; ; round += 1) {
    for (const letter of letters) {
      const name = letter + (round ? String(round) : '');
      if (!taken.has(name)) return name;
    }
  }
}

/** A label with its text changed: emptied, it stays while it has a side, size or colour, so they're kept for new text. */
export const withText = <L extends { text: string }>(label: L, text: string): L | undefined =>
  text || Object.entries(label).some(([key, value]) => key !== 'text' && value !== undefined) ? { ...label, text } : undefined;

/** Whether a point can take a name: no other point in its panel has it. */
export const nameFree = (model: VectorModel, point: VPoint, name: string) => !model.points.some((p) => p.id !== point.id && p.panel === point.panel && p.name === name);

/** A name typed for a point: letters and digits only. */
export const cleanName = (typed: string) => typed.replace(/[^A-Za-z0-9]/g, '');

// ─── edits ───

/** A new free point at a place in a panel, named (O at the origin), with a dot and its letter unless it's bare (made by a tool). */
export function addPoint(model: VectorModel, panel: string, at: Pt, bare = false): { model: VectorModel; id: string } {
  const id = newId(model, 'v');
  const origin = Math.abs(at.x) < 1e-9 && Math.abs(at.y) < 1e-9 && !model.points.some((p) => p.panel === panel && p.name === 'O');
  const name = origin ? 'O' : nextName(model, panel);
  // its letter where it's clear (labels.ts), but O below left of the origin, where it's always written
  const point: VPoint = bare ? { id, name, x: at.x, y: at.y, panel } : { id, name, x: at.x, y: at.y, panel, dot: true, label: { text: `$${name}$`, ...(origin && { side: 'below left' as Side }) } };
  return { model: { ...model, points: [...model.points, point] }, id };
}

/** The point near a place in a panel, if any. */
export function pointNear(model: VectorModel, panel: string, at: Pt, tolerance: number, places = resolve(model)) {
  let best: { id: string; d: number } | null = null;
  for (const p of model.points) {
    if (p.panel !== panel) continue;
    const d = dist(places.get(p.id)!, at);
    if (d <= tolerance && (!best || d < best.d)) best = { id: p.id, d };
  }
  return best?.id ?? null;
}

/** How many points each tool picks before it's done; a polygon goes on until it's closed. */
export const PICKS: Record<string, number> = {
  point: 1,
  text: 1,
  axes: 1,
  drop: 1,
  vector: 2,
  segment: 2,
  line: 2,
  highlight: 2,
  right: 2,
  mid: 2,
  ratio: 2,
  sum: 2,
  diff: 2,
  foot: 3,
  polygon: Infinity,
  dropBoth: 1,
  ticks: 2,
  circle: 2,
  scale: 2,
  angle: 3,
  arc: 3,
  place: 3,
  reflect: 3,
  parallel: 3,
  perp: 3,
  meet: 4
};

/** A construction's point, from its picked parents; bare: no dot or letter, a point a line is drawn through. */
function constructed(model: VectorModel, panel: string, of: Construction, bare = false): { model: VectorModel; id: string } {
  const id = newId(model, 'v');
  const name = nextName(model, panel);
  const places = resolve({ ...model, points: [...model.points, { id, name, x: 0, y: 0, of, panel }] });
  // a place kept for when the parents are gone; JSON has no NaN
  const place = placed(places.get(id)) ? places.get(id)! : { x: 0, y: 0 };
  const point: VPoint = bare ? { id, name, x: place.x, y: place.y, of, panel } : { id, name, x: place.x, y: place.y, of, panel, dot: true, label: { text: `$${name}$` } };
  return { model: { ...model, points: [...model.points, point] }, id };
}

/** The model with an item added. */
const withItem = (made: { model: VectorModel; id: string }, item: Item) => ({ ...made.model, items: [...made.model.items, item] });

/**
 * A vector's name, as a label writes it without the $: the label of a vector from a to b when there is one, else
 * \mathbf{a} for the position vector of A (from O), else \mathbf{AB}. Style › Vector names writes \mathbf its own way.
 */
export function vectorName(model: VectorModel, a: string, b: string) {
  const own = model.items.find((i): i is Link => i.kind === 'vector' && i.a === a && i.b === b && !!i.label?.text.trim());
  if (own) return own.label!.text.trim().replace(/^\$(.*)\$$/, '$1');
  const [A, B] = [a, b].map((id) => model.points.find((p) => p.id === id)?.name ?? '');
  return A === 'O' ? `\\mathbf{${B.toLowerCase()}}` : `\\mathbf{${A}${B}}`;
}

/** k times a vector's name: 2\mathbf{v}, -\mathbf{v}, 0.5\mathbf{v}, as a label. */
export const scaledName = (k: number, name: string) => `$${k === 1 ? '' : k === -1 ? '-' : num(k)}${name}$`;

/** ax + by + c = 0 as TeX: $x+2y-4=0$ */
export function equationText({ a, b, c }: Pick<EqLine, 'a' | 'b' | 'c'>) {
  const terms = ([[a, 'x'], [b, 'y'], [c, '']] as [number, string][]).filter(([k]) => k);
  const tex = terms
    .map(([k, v], i) => {
      const size = Math.abs(k) === 1 && v ? '' : num(Math.abs(k));
      return `${k < 0 ? '-' : i ? '+' : ''}${size}${v}`;
    })
    .join('');
  return `$${tex || '0'}=0$`;
}

/** An intercept's label: its coordinates, $(4,0)$ */
export const interceptText = (p: Pt) => `$(${num(p.x)},${num(p.y)})$`;

/**
 * A line from its equation changed: its label, and its intercepts' labels, follow while they're still the ones
 * written for the old equation.
 */
export function setEquation(model: VectorModel, id: string, patch: Partial<Pick<EqLine, 'a' | 'b' | 'c'>>): VectorModel {
  const line = model.items.find((i): i is EqLine => i.id === id && i.kind === 'eqline');
  if (!line) return model;
  const next = { ...line, ...patch };
  const label = line.label && line.label.text === equationText(line) ? { ...line.label, text: equationText(next) } : line.label;
  const points = model.points.map((p) => {
    if (p.of?.kind !== 'intercept' || p.of.line !== id || !p.label) return p;
    const [was, now] = [interceptOf(line, p.of.axis), interceptOf(next, p.of.axis)];
    return placed(was) && placed(now) && p.label.text === interceptText(was) ? { ...p, label: { ...p.label, text: interceptText(now) } } : p;
  });
  return { ...model, points, items: model.items.map((i) => (i.id === id ? { ...next, ...(label && { label }) } : i)) };
}

/** A line from its equation, x + 2y − 4 = 0 to start, with its intercepts marked by crosses and their coordinates. */
export function newEqLine(model: VectorModel, panel: string): { model: VectorModel; id: string } {
  const id = newId(model, 'i');
  const line: EqLine = { id, kind: 'eqline', panel, a: 1, b: 2, c: -4, label: { text: equationText({ a: 1, b: 2, c: -4 }) } };
  let next: VectorModel = { ...model, items: [...model.items, line] };
  for (const axis of ['x', 'y'] as const) {
    const made = constructed(next, panel, { kind: 'intercept', line: id, axis }, true);
    const p = made.model.points.find((q) => q.id === made.id)!;
    next = { ...made.model, points: made.model.points.map((q) => (q.id === made.id ? { ...p, dot: true, shape: 'cross', label: { text: interceptText(p) } } : q)) };
  }
  return { model: next, id };
}

/** Whether the anticlockwise turn from the side through a to the side through b, at v, is more than a half turn. */
const reflex = (v: Pt, a: Pt, b: Pt) => (a.x - v.x) * (b.y - v.y) - (a.y - v.y) * (b.x - v.x) < 0;

/**
 * A tool used with its picked points (ids, all in one panel): gives the model and the id to select, or null when the
 * picks make nothing (the same point twice). A new item leaves its look to the Style, but a vector in a drawing whose
 * Style has no vector thickness (one made before there was one) is very thick, as vectors were then.
 */
export function applyTool(model: VectorModel, tool: string, picks: string[], styled = true): { model: VectorModel; id: string } | null {
  const panel = model.points.find((p) => p.id === picks[0])?.panel ?? model.panels[0].id;
  const [a, b, c] = picks;
  const id = newId(model, 'i');
  const add = (item: Item) => ({ model: { ...model, items: [...model.items, item] }, id });
  const origin = model.points.find((p) => p.panel === panel && p.name === 'O')?.id;
  const thick = !styled && { width: 'very thick' as Width };
  switch (tool) {
    case 'vector':
    case 'segment':
    case 'line':
    case 'highlight':
      if (a === b) return null;
      return add({ id, kind: tool, a, b, ...(tool === 'vector' && thick), ...(tool === 'highlight' && { colour: 'blue!50' }) });
    case 'drop':
      return add({ id, kind: 'drop', from: a, axis: 'x' });
    case 'right':
      return a === b ? null : add({ id, kind: 'right', at: a, toward: b });
    case 'polygon':
      return picks.length < 3 ? null : add({ id, kind: 'polygon', points: picks });
    case 'mid':
      return a === b ? null : constructed(model, panel, { kind: 'mid', a, b });
    case 'ratio':
      return a === b ? null : constructed(model, panel, { kind: 'ratio', a, b, m: 1, n: 2 });
    case 'foot':
      return b === c ? null : constructed(model, panel, { kind: 'foot', p: a, a: b, b: c });
    case 'sum':
    case 'diff': {
      if (a === b) return null;
      const made = constructed(model, panel, { kind: tool, u: a, v: b, ...(origin && origin !== a && origin !== b && { o: origin }) });
      if (!origin) return made;
      // drawn as a vector from the origin
      const vid = newId(made.model, 'i');
      return { model: { ...made.model, items: [...made.model.items, { id: vid, kind: 'vector', a: origin, b: made.id, ...thick }] }, id: made.id };
    }
    case 'dropBoth': {
      // dotted, in the point's colour, as the slides draw them
      const colour = model.points.find((p) => p.id === a)?.colour;
      return add({ id, kind: 'drop', from: a, axis: 'both', dash: 'dotted', ...(colour && { colour }) });
    }
    case 'ticks': {
      if (a === b) return null;
      // on the line already between them, one more tick (back to one after three); else a segment with one
      const on = model.items.find((i): i is Link => isLink(i) && i.kind !== 'line' && ((i.a === a && i.b === b) || (i.a === b && i.b === a)));
      if (!on) return add({ id, kind: 'segment', a, b, ticks: 1 });
      return { model: { ...model, items: model.items.map((i) => (i === on ? { ...on, ticks: ((on.ticks ?? 0) % 3) + 1 } : i)) }, id: on.id };
    }
    case 'circle':
      return a === b ? null : add({ id, kind: 'circle', centre: a, through: b });
    case 'arc':
      return a === b || a === c || b === c ? null : add({ id, kind: 'circle', centre: a, through: b, to: c });
    case 'angle': {
      if (a === b || a === c || b === c) return null;
      const places = resolve(model);
      // the angle less than a half turn: from the side it turns anticlockwise from
      const [from, to] = reflex(places.get(a)!, places.get(b)!, places.get(c)!) ? [c, b] : [b, c];
      return add({ id, kind: 'angle', at: a, from, to, label: { text: '$\\theta$' } });
    }
    case 'meet':
      return a === b || c === picks[3] ? null : constructed(model, panel, { kind: 'meet', a, b, c, d: picks[3] });
    case 'reflect':
      return b === c ? null : constructed(model, panel, { kind: 'reflect', p: a, a: b, b: c });
    case 'scale': {
      // 2 times AB, drawn from A over it
      if (a === b) return null;
      const made = constructed(model, panel, { kind: 'scale', a, b, k: 2 }, true);
      return { model: withItem(made, { id: newId(made.model, 'i'), kind: 'vector', a, b: made.id, ...thick, label: { text: scaledName(2, vectorName(model, a, b)) } }), id: made.id };
    }
    case 'place': {
      // AB drawn again from P: P + B − A, as v − u from P
      if (a === b) return null;
      const made = constructed(model, panel, { kind: 'diff', u: a, v: b, o: c }, true);
      return { model: withItem(made, { id: newId(made.model, 'i'), kind: 'vector', a: c, b: made.id, ...thick, label: { text: `$${vectorName(model, a, b)}$` } }), id: made.id };
    }
    case 'parallel':
    case 'perp': {
      // a bare point that, with P, makes the line; the line is selected
      if (a === b) return null;
      const made = constructed(model, panel, tool === 'parallel' ? { kind: 'diff', u: a, v: b, o: c } : { kind: 'perp', p: c, a, b }, true);
      const lid = newId(made.model, 'i');
      return { model: withItem(made, { id: lid, kind: 'line', a: c, b: made.id }), id: lid };
    }
  }
  return null;
}

/** Axes for a panel, reaching a little past its points. */
export function newAxes(model: VectorModel, panel: string): { model: VectorModel; id: string } {
  const places = resolve(model);
  const pts = [{ x: 0, y: 0 }, ...model.points.filter((p) => p.panel === panel).map((p) => places.get(p.id)!)];
  const span = (vs: number[]): [number, number] => [Math.floor(Math.min(-1, ...vs)) - 0.5, Math.ceil(Math.max(3, ...vs)) + 0.5];
  const id = newId(model, 'i');
  const hasO = model.points.some((p) => p.panel === panel && p.name === 'O');
  const axes: Axes = { id, kind: 'axes', panel, x: span(pts.map((p) => p.x)), y: span(pts.map((p) => p.y)), ticks: true, ...(!hasO && { origin: true }) };
  return { model: { ...model, items: [...model.items.filter((i) => !(i.kind === 'axes' && i.panel === panel)), axes] }, id };
}

/** The points an item stands on. */
export function pointsOf(item: Item): string[] {
  if (isLink(item)) return [item.a, item.b];
  switch (item.kind) {
    case 'polygon':
      return item.points;
    case 'right':
      return [item.at, item.toward];
    case 'drop':
      return [item.from];
    case 'angle':
      return [item.at, item.from, item.to];
    case 'circle':
      return [item.centre, item.through, ...(item.to ? [item.to] : [])];
    default:
      return [];
  }
}

/** The model without those of these points that nothing draws or builds on (left by a pick that was given up). */
export const dropUnused = (model: VectorModel, ids: string[]) => {
  const used = new Set([...model.items.flatMap(pointsOf), ...model.points.flatMap((p) => (p.of ? parentsOf(p.of) : []))]);
  const stray = ids.filter((id) => !used.has(id));
  return stray.length ? removeIds(model, stray) : model;
};

/** The model without these points, items and panels, and without what's built on them. */
export function removeIds(model: VectorModel, ids: string[]): VectorModel {
  const gone = new Set(ids);
  for (const p of model.points) if (gone.has(p.panel)) gone.add(p.id);
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of model.points) {
      if (!gone.has(p.id) && p.of && parentsOf(p.of).some((id) => gone.has(id))) {
        gone.add(p.id);
        changed = true;
      }
    }
  }
  const panels = model.panels.filter((p) => !gone.has(p.id));
  return {
    panels: panels.length ? panels : emptyVectors().panels,
    points: model.points.filter((p) => !gone.has(p.id)),
    items: model.items.filter((i) => !gone.has(i.id) && !('panel' in i && gone.has(i.panel)) && !pointsOf(i).some((id) => gone.has(id)))
  };
}

/** Copies of these points and items, with the points they stand on, for the clipboard. */
export function copyIds(model: VectorModel, ids: string[]): VectorModel {
  const picked = new Set(ids);
  const items = model.items.filter((i) => picked.has(i.id));
  const needed = new Set([...ids, ...items.flatMap(pointsOf)]);
  const byId = new Map(model.points.map((p) => [p.id, p]));
  // a constructed point brings its parents
  const add = (id: string) => {
    const p = byId.get(id);
    p?.of && parentsOf(p.of).forEach((parent) => !needed.has(parent) && (needed.add(parent), add(parent)));
  };
  [...needed].forEach(add);
  return { panels: [], points: model.points.filter((p) => needed.has(p.id)), items };
}

/** Pastes copied points and items into a panel, free points and notes moved by an offset, with fresh ids and names. */
export function pasteInto(model: VectorModel, clip: VectorModel, panel: string, offset: Pt): { model: VectorModel; ids: string[] } {
  // newId's counter only rises, so each new id differs from the ones before it too
  const ids = new Map([...clip.points.map((p) => [p.id, newId(model, 'v')] as const), ...clip.items.map((i) => [i.id, newId(model, 'i')] as const)]);
  const map = (id: string) => ids.get(id) ?? id;
  let points = model.points;
  for (const p of clip.points) {
    const name = nextName({ ...model, points }, panel);
    const of = p.of && (Object.fromEntries(Object.entries(p.of).map(([k, v]) => [k, ['a', 'b', 'c', 'd', 'p', 'u', 'v', 'o', 'line'].includes(k) ? map(v as string) : v])) as Construction);
    const label = p.label && { ...p.label, text: p.label.text === `$${p.name}$` ? `$${name}$` : p.label.text };
    points = [...points, { ...p, id: map(p.id), name, panel, x: p.x + offset.x, y: p.y + offset.y, ...(of && { of }), ...(label && { label }) }];
  }
  const items = clip.items.map((i): Item => {
    const id = map(i.id);
    if (isLink(i)) return { ...i, id, a: map(i.a), b: map(i.b) };
    if (i.kind === 'polygon') return { ...i, id, points: i.points.map(map) };
    if (i.kind === 'right') return { ...i, id, at: map(i.at), toward: map(i.toward) };
    if (i.kind === 'drop') return { ...i, id, from: map(i.from) };
    if (i.kind === 'angle') return { ...i, id, at: map(i.at), from: map(i.from), to: map(i.to) };
    if (i.kind === 'circle') return { ...i, id, centre: map(i.centre), through: map(i.through), ...(i.to && { to: map(i.to) }) };
    if (i.kind === 'text') return { ...i, id, panel, x: i.x + offset.x, y: i.y + offset.y };
    return { ...i, id, panel };
  });
  return { model: { ...model, points, items: [...model.items, ...items] }, ids: [...clip.points.map((p) => map(p.id)), ...items.map((i) => i.id)] };
}

// ─── group edits: move, turn, mirror and restyle a selection ───

/** p ↦ (m[0]x + m[1]y, m[2]x + m[3]y) + t, a move, a turn or a mirror */
interface Affine {
  m: [number, number, number, number];
  t: Pt;
}
const apply = ({ m, t }: Affine, p: Pt) => ({ x: m[0] * p.x + m[1] * p.y + t.x, y: m[2] * p.x + m[3] * p.y + t.y });
const tidy = (n: number) => Math.round(n * 1e6) / 1e6 || 0;

/** What a selection moves: its free points, the free points its items stand on, its notes and lines from equations. */
export function moversOf(model: VectorModel, ids: string[]) {
  const picked = new Set(ids);
  const free = new Set(model.points.filter((p) => !p.of).map((p) => p.id));
  const points = new Set([...ids, ...model.items.filter((i) => picked.has(i.id)).flatMap(pointsOf)].filter((id) => free.has(id)));
  const items = new Set(model.items.filter((i) => picked.has(i.id) && (i.kind === 'text' || i.kind === 'eqline')).map((i) => i.id));
  return { points, items };
}

/**
 * A selection's free points, notes and lines from equations taken by an affine map (with m a turn or a mirror):
 * ax + by + c = 0 goes to its image, n·p + c = 0 with n = (a, b) becoming (Mn)·p + c − (Mn)·t = 0.
 */
function transform(model: VectorModel, ids: string[], f: Affine): VectorModel {
  const { points, items } = moversOf(model, ids);
  return {
    ...model,
    points: model.points.map((p) => {
      if (!points.has(p.id)) return p;
      const q = apply(f, p);
      return { ...p, x: tidy(q.x), y: tidy(q.y) };
    }),
    items: model.items.map((i): Item => {
      if (!items.has(i.id)) return i;
      if (i.kind === 'text') {
        const q = apply(f, i);
        return { ...i, x: tidy(q.x), y: tidy(q.y) };
      }
      if (i.kind !== 'eqline') return i;
      const n = apply({ m: f.m, t: { x: 0, y: 0 } }, { x: i.a, y: i.b });
      return { ...i, a: tidy(n.x), b: tidy(n.y), c: tidy(i.c - n.x * f.t.x - n.y * f.t.y) };
    })
  };
}

/** The selection moved by d cm. */
export const moveIds = (model: VectorModel, ids: string[], d: Pt) => transform(model, ids, { m: [1, 0, 0, 1], t: d });

/** The middle of what a selection moves: of its free points and notes, or the point of its line nearest the origin. */
function middleOf(model: VectorModel, ids: string[]): Pt {
  const { points, items } = moversOf(model, ids);
  const spots: Pt[] = [
    ...model.points.filter((p) => points.has(p.id)),
    ...model.items.flatMap((i) => (!items.has(i.id) ? [] : i.kind === 'text' ? [i] : i.kind === 'eqline' && (i.a || i.b) ? [{ x: (-i.a * i.c) / (i.a ** 2 + i.b ** 2), y: (-i.b * i.c) / (i.a ** 2 + i.b ** 2) }] : []))
  ];
  if (!spots.length) return { x: 0, y: 0 };
  const xs = spots.map((p) => p.x);
  const ys = spots.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * The selection turned anticlockwise by `degrees` about its middle, as an inclined plane is drawn.
 * ponytail: a selection across panels turns about one middle of their own coordinates
 */
export function turnIds(model: VectorModel, ids: string[], degrees: number): VectorModel {
  const c = middleOf(model, ids);
  const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  return transform(model, ids, { m: [cos, -sin, sin, cos], t: { x: c.x - cos * c.x + sin * c.y, y: c.y - sin * c.x - cos * c.y } });
}

/** A side mirrored left to right (x) or top to bottom (y). */
const mirrorSide = <S extends string>(side: S, axis: 'x' | 'y'): S =>
  side.replace(axis === 'x' ? /left|right/ : /above|below/, (w) => ({ left: 'right', right: 'left', above: 'below', below: 'above' })[w]!) as S;

/**
 * The selection mirrored left to right (x) or top to bottom (y) about its middle. The labels of what went with it
 * mirror their sides too, and an angle, an arc or a right-angle mark whose points all went keeps marking its corner.
 */
export function mirrorIds(model: VectorModel, ids: string[], axis: 'x' | 'y'): VectorModel {
  const c = middleOf(model, ids);
  const f: Affine = axis === 'x' ? { m: [-1, 0, 0, 1], t: { x: 2 * c.x, y: 0 } } : { m: [1, 0, 0, -1], t: { x: 0, y: 2 * c.y } };
  const moved = transform(model, ids, f);
  const [before, after] = [resolve(model), resolve(moved)];
  const { points: movers } = moversOf(model, ids);
  const constructed = new Set(model.points.filter((p) => p.of).map((p) => p.id));
  // a free point it moved, or a constructed one that followed
  const went = (id: string) => (movers.has(id) || constructed.has(id)) && placed(before.get(id)) && dist(apply(f, before.get(id)!), after.get(id)!) < 1e-6;
  const picked = new Set(ids);
  const label = <L extends { side?: string }>(l: L | undefined) => (l?.side && l.side !== 'beside' ? { ...l, side: mirrorSide(l.side, axis) } : l);
  return {
    ...moved,
    points: moved.points.map((p) => {
      if (!went(p.id)) return p;
      const of = p.of?.kind === 'ratio' && p.of.marks ? { ...p.of, marks: mirrorSide(p.of.marks, axis) } : p.of;
      return { ...p, ...(p.label && { label: label(p.label) }), ...(of && { of }) };
    }),
    items: moved.items.map((i): Item => {
      const all = pointsOf(i).length > 0 && pointsOf(i).every(went);
      if (i.kind === 'angle' && all) return { ...i, from: i.to, to: i.from };
      if (i.kind === 'circle' && i.to && all) return { ...i, through: i.to, to: i.through };
      if (i.kind === 'right' && all) return { ...i, flip: !i.flip || undefined };
      if ((all || picked.has(i.id)) && (isLink(i) || i.kind === 'eqline') && i.label) return { ...i, label: label(i.label) };
      return i;
    })
  };
}

/** Each selected thing that takes a colour or a thickness given it (undefined: the Style's, or its own default). */
export function restyleIds(model: VectorModel, ids: string[], patch: { colour?: string; width?: Thickness }): VectorModel {
  const picked = new Set(ids);
  const keys = Object.keys(patch) as ('colour' | 'width')[];
  const set = <T extends object>(thing: T, allowed: ('colour' | 'width')[]) => {
    const next = { ...thing } as Record<string, unknown>;
    for (const key of keys.filter((key) => allowed.includes(key))) {
      if (patch[key] === undefined) delete next[key];
      else next[key] = patch[key];
    }
    return next as T;
  };
  return {
    ...model,
    points: model.points.map((p) => (picked.has(p.id) ? set(p, ['colour']) : p)),
    items: model.items.map((i) => (!picked.has(i.id) ? i : i.kind === 'text' ? set(i, ['colour']) : set(i, ['colour', 'width'])))
  };
}

/** Ids of the things inside a box (panel coordinates, its panel's): points, notes, and items whose points all are. */
export function idsInside(model: VectorModel, panel: string, box: { minX: number; maxX: number; minY: number; maxY: number }, places = resolve(model)) {
  const inside = (p: Pt | undefined) => placed(p) && p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  const panelPoints = new Set(model.points.filter((p) => p.panel === panel).map((p) => p.id));
  const points = model.points.filter((p) => panelPoints.has(p.id) && inside(places.get(p.id))).map((p) => p.id);
  const items = model.items.filter((i) => {
    if (i.kind === 'text') return i.panel === panel && inside(i);
    const pts = pointsOf(i);
    return pts.length > 0 && pts.every((id) => panelPoints.has(id) && inside(places.get(id)));
  });
  return [...points, ...items.map((i) => i.id)];
}

/** A new panel to the right of the last, captioned (b), (c)…, the first getting (a) if it had no caption. */
export function addPanel(model: VectorModel): VectorModel {
  const places = resolve(model);
  const last = model.panels[model.panels.length - 1];
  const f = frameOf(model, last.id, places);
  const id = newId(model, 'g');
  const caption = `(${String.fromCharCode(97 + model.panels.length)})`;
  const panels = model.panels.map((p, i) => (i === 0 && !p.caption ? { ...p, caption: '(a)' } : p));
  return { ...model, panels: [...panels, { id, shift: Math.ceil((last.shift + f.maxX + 1.5 - Math.min(0, f.minX)) * 2) / 2, caption }] };
}

/**
 * The drawing has what 2.5 added to what a drawing saves (the constructions, angles, circles, lines from equations,
 * drops to both axes, equal-length ticks, a label beside its arrow or a vector notation), which builds up to 2.4 would
 * save without, so it's file version 5.
 */
export function vectorsNeedVersion5(raw: unknown, style: Record<string, unknown> = {}) {
  const model = asVectors(raw);
  return (
    (typeof style.notation === 'string' && style.notation !== 'bold') ||
    model.points.some((p) => p.of && NEW_CONSTRUCTIONS.includes(p.of.kind)) ||
    model.items.some((i) => i.kind === 'angle' || i.kind === 'circle' || i.kind === 'eqline' || (i.kind === 'drop' && i.axis === 'both') || (isLink(i) && (!!i.ticks || i.label?.side === 'beside')))
  );
}

// ─── starters: the user's own four figures ───

const pt = (id: string, name: string, x: number, y: number, label?: Label | null, dot = false, panel = 'g1'): VPoint => ({
  id,
  name,
  x,
  y,
  panel,
  ...(dot && { dot }),
  ...(label !== null && { label: label ?? { text: `$${name}$`, side: 'above right' } })
});
const bold = (v: string) => `$\\mathbf{${v}}$`;

/** A line through U(2,5) and V(−1,6), with their position vectors u and v and its direction d = v − u. */
export function lineThroughPoints(): VectorModel {
  return {
    panels: [{ id: 'g1', shift: 0 }],
    points: [
      pt('O', 'O', 0, 0, { text: '$O$', side: 'below left' }, true),
      pt('U', 'U', 2, 5, { text: '$U(2,5)$', side: 'above right' }, true),
      pt('V', 'V', -1, 6, { text: '$V(-1,6)$', side: 'below left' }, true)
    ],
    items: [
      { id: 'ax', kind: 'axes', panel: 'g1', x: [-3.5, 3.5], y: [-1, 7.5], ticks: true },
      { id: 'l', kind: 'line', a: 'U', b: 'V', label: { text: '$l$', pos: 0.96, side: 'above' } },
      { id: 'u', kind: 'vector', a: 'O', b: 'U', width: 'very thick', colour: 'blue', label: { text: bold('u'), pos: 0.55, side: 'right' } },
      { id: 'v', kind: 'vector', a: 'O', b: 'V', width: 'very thick', colour: 'red', label: { text: bold('v'), pos: 0.55, side: 'left' } },
      { id: 'd', kind: 'vector', a: 'U', b: 'V', width: 'very thick', label: { text: '$\\mathbf{d}=\\mathbf{v}-\\mathbf{u}$', pos: 0.35, side: 'below' } }
    ]
  };
}

/** M on AB with AM : MB = 1 : 2, and the vectors a, b and m from O. */
export function dividingSegment(): VectorModel {
  return {
    panels: [{ id: 'g1', shift: 0 }],
    points: [
      pt('O', 'O', 0, 0, { text: '$O$', side: 'below left' }, true),
      pt('A', 'A', 5, 0, { text: '$A$', side: 'below right' }),
      pt('B', 'B', 2, 4, { text: '$B$', side: 'above' }),
      { ...pt('M', 'M', 4, 4 / 3, { text: '$M$', side: 'above right' }, true), of: { kind: 'ratio', a: 'A', b: 'B', m: 1, n: 2, marks: 'above right' } }
    ],
    items: [
      { id: 'AB', kind: 'segment', a: 'A', b: 'B' },
      { id: 'a', kind: 'vector', a: 'O', b: 'A', width: 'very thick', label: { text: bold('a'), side: 'below' } },
      { id: 'b', kind: 'vector', a: 'O', b: 'B', width: 'very thick', label: { text: bold('b'), side: 'above left' } },
      { id: 'm', kind: 'vector', a: 'O', b: 'M', width: 'very thick', colour: 'blue', label: { text: bold('m'), pos: 0.55, side: 'above' } }
    ]
  };
}

/** Triangle OAB with P and Q the midpoints of OA and OB: PQ (blue) is parallel to AB (red) and half as long. */
export function triangleMidpoints(): VectorModel {
  return {
    panels: [{ id: 'g1', shift: 0 }],
    points: [
      pt('O', 'O', 0, 0, { text: '$O$', side: 'below left' }, true),
      pt('A', 'A', 6, 0, { text: '$A$', side: 'below right' }),
      pt('B', 'B', 2, 4, { text: '$B$', side: 'above' }),
      { ...pt('P', 'P', 3, 0, { text: '$P$', side: 'below' }, true), of: { kind: 'mid', a: 'O', b: 'A' } },
      { ...pt('Q', 'Q', 1, 2, { text: '$Q$', side: 'above left' }, true), of: { kind: 'mid', a: 'O', b: 'B' } }
    ],
    items: [
      { id: 'PA', kind: 'segment', a: 'P', b: 'A' },
      { id: 'QB', kind: 'segment', a: 'Q', b: 'B' },
      { id: 'a', kind: 'vector', a: 'O', b: 'P', width: 'very thick', label: { text: '$\\frac{1}{2}\\mathbf{a}$', side: 'below' } },
      { id: 'b', kind: 'vector', a: 'O', b: 'Q', width: 'very thick', label: { text: '$\\frac{1}{2}\\mathbf{b}$', side: 'above left' } },
      { id: 'AB', kind: 'vector', a: 'A', b: 'B', width: 'very thick', colour: 'red' },
      { id: 'PQ', kind: 'vector', a: 'P', b: 'Q', width: 'very thick', colour: 'blue' }
    ]
  };
}

/** The projection of b onto a when the angle between them is acute (a), a right angle (b) and obtuse (c). */
export function projections(): VectorModel {
  const panel = (g: string, B: Pt, extra: Item[]) => ({
    points: [
      pt(`${g}O`, 'O', 0, 0, { text: '$O$', side: 'below left' }, true, g),
      pt(`${g}A`, 'A', 4, 0, null, false, g),
      pt(`${g}B`, 'B', B.x, B.y, null, false, g),
      { ...pt(`${g}F`, 'F', B.x, 0, null, false, g), of: { kind: 'foot', p: `${g}B`, a: `${g}O`, b: `${g}A` } as Construction }
    ],
    items: [
      ...extra,
      { id: `${g}a`, kind: 'vector', a: `${g}O`, b: `${g}A`, width: 'very thick', label: { text: bold('a'), side: 'below' } },
      { id: `${g}b`, kind: 'vector', a: `${g}O`, b: `${g}B`, width: 'very thick', label: { text: bold('b'), side: B.x < 0 ? 'above right' : 'above left' } }
    ] as Item[]
  });
  const a = panel('a', { x: 2.5, y: 2.5 }, [
    { id: 'ah', kind: 'highlight', a: 'aO', b: 'aF', colour: 'blue!50' },
    { id: 'ad', kind: 'segment', a: 'aB', b: 'aF', dashed: true },
    { id: 'ar', kind: 'right', at: 'aF', toward: 'aA' }
  ]);
  const b = panel('b', { x: 0, y: 3 }, [{ id: 'br', kind: 'right', at: 'bO', toward: 'bA' }]);
  const c = panel('c', { x: -2, y: 2.5 }, [
    { id: 'ch', kind: 'highlight', a: 'cO', b: 'cF', colour: 'blue!50' },
    { id: 'ce', kind: 'segment', a: 'cF', b: 'cO', dashed: true },
    { id: 'cd', kind: 'segment', a: 'cB', b: 'cF', dashed: true },
    { id: 'cr', kind: 'right', at: 'cF', toward: 'cO' }
  ]);
  return {
    panels: [
      { id: 'a', shift: 0, caption: '(a)' },
      { id: 'b', shift: 6.5, caption: '(b)' },
      { id: 'c', shift: 14, caption: '(c)' }
    ],
    points: [...a.points, ...b.points, ...c.points],
    items: [...a.items, ...b.items, ...c.items]
  };
}
