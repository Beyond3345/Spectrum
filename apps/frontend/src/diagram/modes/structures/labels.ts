// Labels kept clear of the drawing. Each label's text has a box as TikZ sets it at \footnotesize; the shapes it must not
// touch are the members, arrows, supports, dimension lines, diagram outlines and the labels placed before it. A label
// that touches one moves to the nearest place around the point it labels that touches none, so the canvas and the
// export (which draw the same scene) both show it clear. A label already clear stays where it was.
import { unitsAsText } from '../../units';
import type { Pt } from './model';
import { SYMBOLS } from './symbols';

export type Anchor = 'center' | 'north' | 'south' | 'east' | 'west' | 'north east' | 'north west' | 'south east' | 'south west';

/** what a label needs from the scene: where it is, its anchor and text, and the point it labels when it may move */
export interface Label {
  at: Pt;
  tex: string;
  anchor: Anchor;
  /** the point it labels: it may move around it, keeping at least its distance */
  around?: Pt;
  /** left out when nowhere near its point is clear (a diagram's value, where another value nearby says enough) */
  optional?: boolean;
}

/** The anchor that puts a label beyond a point in direction d. */
export function anchorFor(d: Pt): Anchor {
  if (!d.x && !d.y) return 'center';
  const sector = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4));
  const names: Anchor[] = ['west', 'south west', 'south', 'south east', 'east', 'north east', 'north', 'north west'];
  return names[(sector + 8) % 8];
}

export type Box = { x0: number; x1: number; y0: number; y1: number };

/** TikZ's inner sep at \footnotesize (0.3333em of 8 pt) in cm: a node's text sits this far inside its anchor. */
export const INNER_SEP = 0.094;
/** the text's height and depth together, and the gap a label keeps from any shape, in cm */
const TEXT_HEIGHT = 0.25;
const CLEARANCE = 0.04;

/** The width of a label's text in cm: about 1.7 mm a letter or digit at \footnotesize, more for a minus or an equals sign. */
function textWidth(tex: string) {
  const text = unitsAsText(tex).replace(/\\,/g, ' ');
  const visible = text.replace(/[$\\{}^]|_(?=\{?.)/g, '');
  const wide = (visible.match(/[-=−]/g) ?? []).length;
  const thin = (visible.match(/[\s.,()]/g) ?? []).length;
  return (visible.length - wide - thin) * 0.17 + wide * 0.3 + thin * 0.08;
}

/** A label's text as set: the box of its letters, inside the node anchored at its point. */
export function textBox(label: Label): Box {
  const [w, h] = [textWidth(label.tex), TEXT_HEIGHT];
  const [W, H] = [w + 2 * INNER_SEP, h + 2 * INNER_SEP];
  const x0 = label.anchor.includes('west') ? label.at.x : label.anchor.includes('east') ? label.at.x - W : label.at.x - W / 2;
  const y0 = label.anchor.includes('south') ? label.at.y : label.anchor.includes('north') ? label.at.y - H : label.at.y - H / 2;
  return { x0: x0 + INNER_SEP, x1: x0 + W - INNER_SEP, y0: y0 + INNER_SEP, y1: y0 + H - INNER_SEP };
}

export const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const grow = (b: Box, d: number): Box => ({ x0: b.x0 - d, x1: b.x1 + d, y0: b.y0 - d, y1: b.y1 + d });

// ─── the shapes a label keeps clear of ───

/** Segments a label mustn't cross, and areas (a filled outline, a support, a dot) it mustn't sit in. */
export interface Shape {
  segments: [Pt, Pt][];
  area?: Pt[];
  box: Box;
}

const boxAround = (pts: Pt[]): Box => ({ x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) });

function shapeOf(pts: Pt[], closed: boolean, area: boolean): Shape {
  const segments: [Pt, Pt][] = pts.slice(1).map((p, i) => [pts[i], p]);
  if (closed && pts.length > 2) segments.push([pts[pts.length - 1], pts[0]]);
  return { segments, ...(area && { area: pts }), box: boxAround(pts) };
}

/** a symbol's outline as the rectangle around its lines and circles, turned with it */
function symbolArea(name: string, at: Pt, rotate: number): Pt[] {
  const pts = (SYMBOLS[name] ?? []).flatMap((s) => ('circle' in s ? [[s.circle[0] - s.r, s.circle[1] - s.r], [s.circle[0] + s.r, s.circle[1] + s.r]] : s.line));
  if (!pts.length) return [];
  const b = boxAround(pts.map(([x, y]) => ({ x, y })));
  const t = (rotate * Math.PI) / 180;
  return [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }].map((p) => ({ x: at.x + p.x * Math.cos(t) - p.y * Math.sin(t), y: at.y + p.x * Math.sin(t) + p.y * Math.cos(t) }));
}

/** The shapes of a scene's items other than its labels, moved by their block's shift. */
export function shapesOf(items: { item: ShapeItem; shift: Pt }[]): Shape[] {
  const out: Shape[] = [];
  for (const { item, shift } of items) {
    const move = (p: Pt) => ({ x: p.x + shift.x, y: p.y + shift.y });
    if (item.t === 'line') out.push(shapeOf(item.pts.map(move), !!item.closed, !!item.fill));
    else if (item.t === 'arc') {
      const steps = 12;
      out.push(shapeOf(Array.from({ length: steps + 1 }, (_, i) => {
        const a = ((item.from + ((item.to - item.from) * i) / steps) * Math.PI) / 180;
        return move({ x: item.c.x + item.r * Math.cos(a), y: item.c.y + item.r * Math.sin(a) });
      }), false, false));
    } else if (item.t === 'pic') {
      const area = symbolArea(item.name, move(item.at), item.rotate);
      if (area.length) out.push(shapeOf(area, true, true));
    } else if (item.t === 'dot') {
      const c = move(item.at);
      out.push(shapeOf([{ x: c.x - item.r, y: c.y - item.r }, { x: c.x + item.r, y: c.y - item.r }, { x: c.x + item.r, y: c.y + item.r }, { x: c.x - item.r, y: c.y + item.r }], true, true));
    }
  }
  return out;
}

export type ShapeItem =
  | { t: 'line'; pts: Pt[]; closed?: boolean; fill?: string }
  | { t: 'arc'; c: Pt; r: number; from: number; to: number }
  | { t: 'pic'; name: string; at: Pt; rotate: number }
  | { t: 'dot'; at: Pt; r: number };

/** whether a segment passes through a box (Liang–Barsky) */
function crosses([p, q]: [Pt, Pt], b: Box) {
  let [t0, t1] = [0, 1];
  const d = { x: q.x - p.x, y: q.y - p.y };
  for (const [num, den] of [[p.x - b.x0, -d.x], [b.x1 - p.x, d.x], [p.y - b.y0, -d.y], [b.y1 - p.y, d.y]]) {
    if (den === 0) {
      if (num < 0) return false;
      continue;
    }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function inside(p: Pt, polygon: Pt[]) {
  let odd = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = [polygon[i], polygon[j]];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd;
  }
  return odd;
}

/** Whether a label's text, with its clearance, touches a shape. */
export function touches(box: Box, shape: Shape) {
  const b = grow(box, CLEARANCE);
  if (b.x1 < shape.box.x0 || shape.box.x1 < b.x0 || b.y1 < shape.box.y0 || shape.box.y1 < b.y0) return false;
  if (shape.segments.some((s) => crosses(s, b))) return true;
  return !!shape.area && inside({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, shape.area);
}

/** how many of the shapes, and the labels placed so far, a box touches */
const hits = (box: Box, shapes: Shape[], placed: Box[]) => shapes.filter((s) => touches(box, s)).length + placed.filter((p) => overlap(grow(box, CLEARANCE), p)).length;

// ─── placing ───

/** Where a label may go, nearest first: around its point in each of eight directions, a little further out each time. */
function candidates(label: Label): Label[] {
  if (!label.around) return [label];
  const d0 = { x: label.at.x - label.around.x, y: label.at.y - label.around.y };
  const gap = Math.hypot(d0.x, d0.y);
  const a0 = Math.atan2(d0.y, d0.x);
  const out: { label: Label; cost: number }[] = [{ label, cost: 0 }];
  for (let step = 0; step <= 8; step += 1) {
    for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
      if (!step && !turn) continue;
      const a = a0 + (turn * Math.PI) / 4;
      const d = { x: Math.cos(a), y: Math.sin(a) };
      const r = gap + step * 0.08;
      out.push({ label: { ...label, at: { x: label.around.x + d.x * r, y: label.around.y + d.y * r }, anchor: anchorFor(d) }, cost: step * 0.08 + Math.abs(turn) * 0.12 });
    }
  }
  return out.sort((a, b) => a.cost - b.cost).map((c) => c.label);
}

/**
 * Labels placed in order, each clear of the shapes and of the labels before it where it can be: a label that can't
 * be is left out when it's optional, or put where it touches least. `shift` is the label's block's.
 */
export function placeLabels<L extends Label>(labels: { label: L; shift: Pt }[], shapes: Shape[]): (L | null)[] {
  const placed: Box[] = [];
  return labels.map(({ label, shift }) => {
    const boxAt = (l: Label) => {
      const b = textBox(l);
      return { x0: b.x0 + shift.x, x1: b.x1 + shift.x, y0: b.y0 + shift.y, y1: b.y1 + shift.y };
    };
    const options = candidates(label) as L[];
    let best = options.find((l) => !hits(boxAt(l), shapes, placed));
    if (!best && label.optional) return null;
    if (!best) best = options.reduce((a, b) => (hits(boxAt(b), shapes, placed) < hits(boxAt(a), shapes, placed) ? b : a));
    placed.push(boxAt(best));
    return best;
  });
}

/** For a check: every label's box that touches a shape or another label, with what it touches. */
export function clashes(labels: { label: Label; shift: Pt }[], shapes: Shape[]) {
  const boxes = labels.map(({ label, shift }) => {
    const b = textBox(label);
    return { tex: label.tex, box: { x0: b.x0 + shift.x, x1: b.x1 + shift.x, y0: b.y0 + shift.y, y1: b.y1 + shift.y } };
  });
  return boxes.flatMap((a, i) => [
    ...shapes.filter((s) => touches(a.box, s)).map(() => `${a.tex} touches a shape`),
    ...boxes.slice(i + 1).filter((b) => overlap(a.box, b.box)).map((b) => `${a.tex} overlaps ${b.tex}`)
  ]);
}
