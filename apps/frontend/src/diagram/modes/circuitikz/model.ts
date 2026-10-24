// The circuit drawing: parts, wires and junctions on a 0.25 cm grid, and the geometry the canvas, the
// snapping and the export share. Coordinates are in grid steps with y up, as TikZ draws them.
import catalogueData from './catalogue.json';

export interface CatalogueOption {
  name: string;
  label: string;
}

export interface CataloguePart {
  id: string;
  label: string;
  group: string;
  /** path: sits on a wire between two points; node: placed, with named pins */
  kind: 'path' | 'node';
  /** the circuitikz key */
  tikz: string;
  options?: CatalogueOption[];
  /** choices that exclude each other; none chosen leaves circuitikz's default */
  enumOptions?: { label: string; values: CatalogueOption[] }[];
  /** a node's anchors that wires can attach to; for a path part, the anchors besides its two ends */
  pins?: string[];
  /** the letter new parts are numbered with: R gives R_1, R_2 */
  defaultLabel?: string;
}

export const CATALOGUE = catalogueData as CataloguePart[];
export const PARTS = new Map(CATALOGUE.map((part) => [part.id, part]));

/** one grid step, 0.25 cm */
export const GRID_CM = 0.25;
/** TeX points in a grid step */
export const PT_PER_GRID = (GRID_CM / 2.54) * 72.27;

export interface Pt {
  x: number;
  y: number;
}
/** a grid point, or a pin of a part: a node's anchor, a path part's end (a or b) or one of its extra anchors */
export type End = Pt | { part: string; pin: string };
/** straight, across then up or down, up or down then across */
export type Route = '--' | '-|' | '|-';
export type Pole = '' | '*' | 'o';
/** a label, voltage or current: which side of the part (^ above, _ below, as circuitikz writes it) and which way */
export interface Mark {
  text: string;
  side?: '^' | '_';
  dir?: '>' | '<';
}

export interface PathPart {
  id: string;
  kind: 'path';
  /** catalogue id */
  type: string;
  a: End;
  b: End;
  options?: string[];
  mirror?: boolean;
  invert?: boolean;
  poles?: [Pole, Pole];
  /** the symbol's scale, 1 at the style's size */
  size?: number;
  name?: string;
  label?: Mark;
  /** the value, written as circuitikz's annotation (a) */
  value?: string;
  voltage?: Mark;
  current?: Mark;
}

export interface NodePart {
  id: string;
  kind: 'node';
  type: string;
  at: Pt;
  /** degrees, in 45° steps */
  rotate?: number;
  flipX?: boolean;
  flipY?: boolean;
  name?: string;
  options?: string[];
}

export interface Wire {
  id: string;
  kind: 'wire';
  /** the ends may be pins; the points between are grid points */
  points: End[];
  /** one per segment */
  routes: Route[];
}

export type Element = PathPart | NodePart | Wire;
export type Part = PathPart | NodePart;

export interface CircuitModel {
  elements: Element[];
  /** where three or more ends meet, worked out by the canvas after each edit */
  junctions: End[];
}

export const emptyCircuit = (): CircuitModel => ({ elements: [], junctions: [] });

/** A model read back from a file, or an empty one when it isn't a circuit. */
export const asCircuit = (model: unknown): CircuitModel => {
  const m = model as Partial<CircuitModel> | null;
  return m && Array.isArray(m.elements) ? { elements: m.elements, junctions: Array.isArray(m.junctions) ? m.junctions : [] } : emptyCircuit();
};

export const isPoint = (end: End): end is Pt => 'x' in end;
export const isPart = (el: Element): el is Part => el.kind !== 'wire';

/** A symbol variant: the part with its chosen options, sorted so the same set always gives the same key. */
export const variantKey = (type: string, options: string[] = []) => [type, ...[...options].sort()].join('|');

/**
 * Pin offsets of a symbol variant, in grid steps with y up. A node's are relative to its reference point;
 * a path part's extra pins are relative to the middle of its symbol, x along the part from a to b. A path
 * part also gives its symbol's length along the part as `length`.
 */
export interface Shape {
  pins: Record<string, Pt>;
  length?: number;
}
export type ShapeOf = (type: string, options: string[]) => Shape;

/**
 * Stand-in pins until the generated symbols arrive: a node's pins down the left and right of a box,
 * a path part's extra pins above its middle.
 */
export function placeholderShape(type: string): Shape {
  const part = PARTS.get(type);
  const pins = part?.pins || [];
  if (part?.kind === 'path') return { length: 4, pins: Object.fromEntries(pins.map((pin) => [pin, { x: 0, y: 2 }])) };
  const left = Math.ceil(pins.length / 2);
  return {
    pins: Object.fromEntries(
      pins.map((pin, i) => {
        const onLeft = i < left;
        const count = onLeft ? left : pins.length - left;
        const row = onLeft ? i : i - left;
        return [pin, pins.length === 1 ? { x: 0, y: 0 } : { x: onLeft ? -3 : 3, y: (count - 1) - row * 2 }];
      })
    )
  };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** A node part's pin offset turned the way TikZ turns it for `rotate=…, xscale=-1, yscale=-1`: flip first, then rotate. */
export function placeNodeOffset(part: Pick<NodePart, 'rotate' | 'flipX' | 'flipY'>, offset: Pt): Pt {
  const x = part.flipX ? -offset.x : offset.x;
  const y = part.flipY ? -offset.y : offset.y;
  const t = rad(part.rotate || 0);
  return { x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t) };
}

/** Where a path part's symbol sits: the middle, the unit vector from a to b, and the length between the ends. */
export function pathFrame(a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, u: length ? { x: dx / length, y: dy / length } : { x: 1, y: 0 }, length };
}

/** A path part's extra pin, from the middle of its symbol: invert turns it end for end, mirror flips it across the part. */
export function placePathOffset(part: Pick<PathPart, 'mirror' | 'invert' | 'size'>, frame: ReturnType<typeof pathFrame>, offset: Pt): Pt {
  const s = part.size || 1;
  const along = (part.invert ? -offset.x : offset.x) * s;
  const across = (part.mirror ? -offset.y : offset.y) * s;
  return { x: frame.mid.x + along * frame.u.x - across * frame.u.y, y: frame.mid.y + along * frame.u.y + across * frame.u.x };
}

/**
 * Resolves ends to grid positions for one state of the model. An end on a part that has gone, or a loop
 * of path parts on each other's ends, resolves to the origin rather than throwing.
 */
export function locator(model: CircuitModel, shapeOf: ShapeOf) {
  const byId = new Map(model.elements.map((el) => [el.id, el]));
  const pos = (end: End, depth = 0): Pt => {
    if (isPoint(end)) return end;
    const el = byId.get(end.part);
    if (!el || el.kind === 'wire' || depth > 4) return { x: 0, y: 0 };
    const shape = shapeOf(el.type, el.options || []);
    if (el.kind === 'node') {
      const offset = placeNodeOffset(el, shape.pins[end.pin] || { x: 0, y: 0 });
      return { x: el.at.x + offset.x, y: el.at.y + offset.y };
    }
    const a = pos(el.a, depth + 1);
    const b = pos(el.b, depth + 1);
    if (end.pin === 'a') return a;
    if (end.pin === 'b') return b;
    return placePathOffset(el, pathFrame(a, b), shape.pins[end.pin] || { x: 0, y: 0 });
  };
  return { pos, byId };
}

/** Every pin an element offers, by name, with its position. */
export function pinsOfElement(el: Element, shapeOf: ShapeOf, pos: (end: End) => Pt): { pin: string; at: Pt }[] {
  if (el.kind === 'wire') return [];
  const named = Object.keys(shapeOf(el.type, el.options || []).pins);
  const names = el.kind === 'path' ? ['a', 'b', ...named] : named;
  return names.map((pin) => ({ pin, at: pos({ part: el.id, pin }) }));
}

/** The corners a wire passes through: its points, with the bend of each -| or |- segment between them. */
export function wirePath(points: Pt[], routes: Route[]): Pt[] {
  const out: Pt[] = points.length ? [points[0]] : [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const route = routes[i - 1] || '--';
    if (route === '-|' && from.x !== to.x && from.y !== to.y) out.push({ x: to.x, y: from.y });
    if (route === '|-' && from.x !== to.x && from.y !== to.y) out.push({ x: from.x, y: to.y });
    out.push(to);
  }
  return out;
}

const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Snapping: every moving pin is tried against the nearest grid point and against the fixed pins within
 * `radius` (grid steps), and the shortest correction wins and moves them all. Returns the snapped offset.
 */
export function snapDelta(moving: Pt[], delta: Pt, fixed: Pt[], radius: number): Pt {
  if (!moving.length) return { x: Math.round(delta.x), y: Math.round(delta.y) };
  let best: Pt | null = null;
  let bestDist = Infinity;
  const consider = (target: Pt, to: Pt) => {
    const d = dist(target, to);
    if (d < bestDist) {
      bestDist = d;
      best = { x: to.x - target.x, y: to.y - target.y };
    }
  };
  for (const m of moving) {
    const target = { x: m.x + delta.x, y: m.y + delta.y };
    // ponytail: every fixed pin is checked against every moving one; a spatial index if circuits grow to thousands of parts
    for (const f of fixed) if (dist(target, f) <= radius) consider(target, f);
    consider(target, { x: Math.round(target.x), y: Math.round(target.y) });
  }
  const fix = best as Pt | null;
  return fix ? { x: delta.x + fix.x, y: delta.y + fix.y } : delta;
}

const key = (p: Pt) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

/** On the open stretch of a horizontal, vertical or slanted leg, not at either end. */
function insideLeg(p: Pt, from: Pt, to: Pt) {
  const len = dist(from, to);
  if (len < 1e-6) return false;
  const cross = ((to.x - from.x) * (p.y - from.y) - (to.y - from.y) * (p.x - from.x)) / len;
  const t = ((p.x - from.x) * (to.x - from.x) + (p.y - from.y) * (to.y - from.y)) / (len * len);
  return Math.abs(cross) < 1e-3 && t > 1e-3 && t < 1 - 1e-3;
}

/**
 * Junction dots: wherever three or more ends meet. A wire's end counts one and a bend it passes through
 * two; a path part's end and a node's pin count one; a point on the open stretch of a wire adds two,
 * since that wire carries on both sides. A dot on a node's pin is kept as that pin, so it follows the part.
 */
export function findJunctions(model: CircuitModel, shapeOf: ShapeOf): End[] {
  const { pos } = locator(model, shapeOf);
  const spots = new Map<string, { at: Pt; count: number; pin?: End }>();
  const add = (at: Pt, count: number, pin?: End) => {
    const k = key(at);
    const spot = spots.get(k) || { at, count: 0 };
    spot.count += count;
    if (pin && !spot.pin) spot.pin = pin;
    spots.set(k, spot);
  };
  const legs: [Pt, Pt][] = [];
  for (const el of model.elements) {
    if (el.kind === 'wire') {
      const path = wirePath(el.points.map((p) => pos(p)), el.routes);
      path.forEach((p, i) => add(p, i === 0 || i === path.length - 1 ? 1 : 2));
      for (let i = 1; i < path.length; i += 1) legs.push([path[i - 1], path[i]]);
    } else if (el.kind === 'path') {
      add(pos(el.a), 1, isPoint(el.a) ? undefined : el.a);
      add(pos(el.b), 1, isPoint(el.b) ? undefined : el.b);
    } else {
      for (const { pin, at } of pinsOfElement(el, shapeOf, pos)) add(at, 1, { part: el.id, pin });
    }
  }
  const out: End[] = [];
  for (const spot of spots.values()) {
    const count = spot.count + legs.reduce((n, [from, to]) => n + (insideLeg(spot.at, from, to) ? 2 : 0), 0);
    if (count >= 3) out.push(spot.pin || { x: Math.round(spot.at.x * 1000) / 1000, y: Math.round(spot.at.y * 1000) / 1000 });
  }
  return out;
}

/** The next free name with this prefix: R1, R2… */
export function nextName(model: CircuitModel, prefix: string) {
  const taken = new Set(model.elements.map((el) => (el.kind !== 'wire' ? el.name || '' : '')));
  for (let n = 1; ; n += 1) if (!taken.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

let counter = 0;
/** A fresh element id, unique in the model. */
export function newId(model: CircuitModel) {
  const ids = new Set(model.elements.map((el) => el.id));
  do counter += 1;
  while (ids.has(`e${counter}`));
  return `e${counter}`;
}
