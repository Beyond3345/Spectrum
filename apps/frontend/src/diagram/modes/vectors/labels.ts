// Labels kept clear: a label with no side of its own goes where it touches no line, dot or other label, starting where
// 2.4 put it (a point's above right, a line's above) and moving round its point only when that touches something. A
// label beside the arrow goes on whichever side of the arrow is clear, written as TikZ's auto (or auto, swap) so it
// stays beside the arrow in the code too. The code writes each where this puts it, and the canvas draws it there.
//
// The work is the label spacing Structures, Mohr's circle and Venn use (structures/labels.ts), which measures text at
// \footnotesize: the drawing is measured here as the paper has it (Style's scale), shrunk from \normalsize to that.
import { plain } from '../../sketch';
import { anchorFor, overlap, placeLabels, shapesOf, textBox, touches } from '../structures/labels';
import type { Anchor, Label as Spaced, ShapeItem } from '../structures/labels';
import { eqLineEnds, notate } from './code';
import type { Notation } from './code';
import { clipLine, frameOf, isLink, placed, pointsOf, resolve, rightCorners, sideOffset } from './model';
import type { Pt, Side, VectorModel } from './model';

/** \normalsize over \footnotesize: the label spacing's measure. ponytail: every label measured at \normalsize */
const SIZE = 1.25;
const PT_PER_CM = 28.45;

const ANCHOR_OF: Record<Side, Anchor> = {
  above: 'south',
  below: 'north',
  left: 'east',
  right: 'west',
  'above right': 'south west',
  'above left': 'south east',
  'below right': 'north west',
  'below left': 'north east'
};
const SIDE_OF = Object.fromEntries(Object.entries(ANCHOR_OF).map(([side, anchor]) => [anchor, side])) as Record<Anchor, Side>;

/** Where a label went: its side (as the canvas draws it), how far in pt along each axis, and its node options in the code. */
export interface Spot {
  side: Side;
  dist: number;
  code: string;
}

/**
 * The side TikZ's auto gives a node on a line running in direction d: to the left of the way it runs, or to the right
 * with swap. A slanting line puts it off a corner, as TikZ does.
 */
export function besideSide(d: Pt, swap: boolean): Side {
  const e = 1e-9 * Math.hypot(d.x, d.y);
  const sign = (v: number) => (v > e ? 1 : v < -e ? -1 : 0);
  const [x, y] = swap ? [-sign(d.x), -sign(d.y)] : [sign(d.x), sign(d.y)];
  return SIDE_OF[anchorFor({ x: -y, y: x })];
}

/**
 * Each label that has no side of its own, or is beside its arrow, placed: by its point's or item's id. Labels with a
 * side, tick numbers, axis names, angle labels, notes and captions stay put, and the placed ones keep clear of them.
 */
export function placeVectorLabels(model: VectorModel, style: { scale: number; pointSize: number; notation?: Notation }, places = resolve(model)): Map<string, Spot> {
  const k = style.scale / SIZE;
  const panelOfPoint = new Map(model.points.map((p) => [p.id, p.panel]));
  const shiftOf = new Map(model.panels.map((p) => [p.id, p.shift]));
  const frames = new Map(model.panels.map((p) => [p.id, frameOf(model, p.id, places)]));
  /** a panel's place as the label spacing measures it */
  const paper = (p: Pt, panel: string) => ({ x: (p.x + (shiftOf.get(panel) ?? 0)) * k, y: p.y * k });
  const pointAt = (id: string) => paper(places.get(id)!, panelOfPoint.get(id) ?? '');
  const there = (id: string) => placed(places.get(id));
  // an operator measured with the space maths sets round it (the spacing counts a minus or equals sign wide, a space thin)
  const measured = (tex: string) => plain(notate(tex, style.notation)).replace(/\s*[-+=<>−·×]\s*/g, ' = ');
  /** a label on a side of a place, dist pt further along each axis, as TikZ sets above right=2pt */
  const sided = (at: Pt, tex: string, side: Side, dist = 0): Spaced => {
    const o = sideOffset(side);
    const d = dist / PT_PER_CM / SIZE;
    return { at: { x: at.x + o.x * d, y: at.y + o.y * d }, tex: measured(tex), anchor: ANCHOR_OF[side] };
  };
  const centred = (at: Pt, tex: string): Spaced => ({ at, tex: measured(tex), anchor: 'center' });

  const shapes: ShapeItem[] = [];
  const fixed: Spaced[] = [];
  const besides: { id: string; label: Spaced; d: Pt }[] = [];
  const free: { id: string; label: Spaced }[] = [];
  /** a label with no side: from where 2.4 put it, a hair along so the spacing knows which way it started */
  const loose = (id: string, at: Pt, tex: string, start: Side) => {
    const o = sideOffset(start);
    const n = Math.hypot(o.x, o.y);
    free.push({ id, label: { at: { x: at.x + (o.x / n) * 1e-4, y: at.y + (o.y / n) * 1e-4 }, tex: measured(tex), anchor: ANCHOR_OF[start], around: at } });
  };
  const edge = (id: string, a: Pt, b: Pt, label?: { text: string; pos?: number; side?: Side | 'beside' }) => {
    shapes.push({ t: 'line', pts: [a, b] });
    if (!label?.text.trim()) return;
    const pos = label.pos ?? 0.5;
    const at = { x: a.x + (b.x - a.x) * pos, y: a.y + (b.y - a.y) * pos };
    if (label.side === 'beside') besides.push({ id, label: { at, tex: measured(label.text), anchor: 'center' }, d: { x: b.x - a.x, y: b.y - a.y } });
    else if (label.side) fixed.push(sided(at, label.text, label.side));
    else loose(id, at, label.text, 'above');
  };
  const arc = (c: Pt, r: number, from: number, to: number) => shapes.push({ t: 'arc', c, r, from, to });
  const deg = (from: Pt, to: Pt) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

  for (const item of model.items) {
    if (!pointsOf(item).every(there)) continue;
    const panel = 'panel' in item ? item.panel : panelOfPoint.get(pointsOf(item)[0]) ?? model.panels[0].id;
    const P = (p: Pt) => paper(p, panel);
    if (isLink(item)) {
      const ends = item.kind === 'line' ? clipLine(places.get(item.a)!, places.get(item.b)!, frames.get(panel)!) : [places.get(item.a)!, places.get(item.b)!];
      if (ends) edge(item.id, P(ends[0]), P(ends[1]), item.kind === 'highlight' ? undefined : item.label);
    } else if (item.kind === 'eqline') {
      const ends = eqLineEnds(item, frames.get(panel)!);
      if (ends) edge(item.id, P(ends[0]), P(ends[1]), item.label);
    } else if (item.kind === 'polygon') shapes.push({ t: 'line', pts: item.points.map(pointAt), closed: true, ...(item.fill && { fill: item.fill }) });
    else if (item.kind === 'circle') {
      const [C, A] = [pointAt(item.centre), pointAt(item.through)];
      const from = deg(C, A);
      let to = item.to ? deg(C, pointAt(item.to)) : from + 360;
      while (to <= from) to += 360;
      arc(C, Math.hypot(A.x - C.x, A.y - C.y), from, to);
    } else if (item.kind === 'angle') {
      const [V, A, B] = [item.at, item.from, item.to].map(pointAt);
      const r = (item.radius ?? 0.6) * k;
      const from = deg(V, A);
      let to = deg(V, B);
      while (to <= from) to += 360;
      arc(V, r, from, to);
      const mid = (((from + to) / 2) * Math.PI) / 180;
      const e = r + 0.25 * k;
      if (item.label?.text.trim()) fixed.push(centred({ x: V.x + e * Math.cos(mid), y: V.y + e * Math.sin(mid) }, item.label.text));
    } else if (item.kind === 'right') shapes.push({ t: 'line', pts: rightCorners(places.get(item.at)!, places.get(item.toward)!, !!item.flip).map(P) });
    else if (item.kind === 'drop') {
      const from = places.get(item.from)!;
      if (item.axis !== 'y') shapes.push({ t: 'line', pts: [P(from), P({ x: from.x, y: 0 })] });
      if (item.axis !== 'x') shapes.push({ t: 'line', pts: [P(from), P({ x: 0, y: from.y })] });
    } else if (item.kind === 'text') fixed.push(centred(P(item), item.text));
    else if (item.kind === 'axes') {
      const [x0, x1, y0, y1] = [item.x[0], item.x[1], item.y[0], item.y[1]];
      shapes.push({ t: 'line', pts: [P({ x: x0, y: 0 }), P({ x: x1, y: 0 })] }, { t: 'line', pts: [P({ x: 0, y: y0 }), P({ x: 0, y: y1 })] });
      const [xName, yName] = item.names ?? ['$x$', '$y$'];
      fixed.push(sided(P({ x: x1, y: 0 }), xName, 'right'), sided(P({ x: 0, y: y1 }), yName, 'above'));
      const step = item.step ?? 1;
      const tick = item.tick ?? 0.08;
      const ticks = ([from, to]: [number, number]) => {
        const out: number[] = [];
        for (let n = Math.floor(Math.min(from, to) / step) + 1; n * step < Math.max(from, to) && out.length < 60; n += 1) if (n) out.push(Math.round(n * step * 1e6) / 1e6);
        return out;
      };
      if (item.ticks) {
        for (const t of ticks(item.x)) fixed.push(sided(P({ x: t, y: -tick }), String(t), 'below'));
        for (const t of ticks(item.y)) fixed.push(sided(P({ x: -tick, y: t }), String(t), 'left'));
      }
      if (item.origin) fixed.push(sided(P({ x: 0, y: 0 }), '$O$', 'below left'));
    }
  }
  for (const p of model.points) {
    if (!there(p.id)) continue;
    const at = pointAt(p.id);
    // half the dot's radius: a label keeps clear of another point's dot, but may sit as close to its own as TikZ sets it
    if (p.dot) shapes.push({ t: 'dot', at, r: ((p.size ?? style.pointSize) / PT_PER_CM) * k * 0.5 });
    if (p.of?.kind === 'ratio' && p.of.marks && there(p.of.a) && there(p.of.b)) {
      const [A, B] = [pointAt(p.of.a), pointAt(p.of.b)];
      fixed.push(sided({ x: (A.x + at.x) / 2, y: (A.y + at.y) / 2 }, String(p.of.m), p.of.marks), sided({ x: (at.x + B.x) / 2, y: (at.y + B.y) / 2 }, String(p.of.n), p.of.marks));
    }
    if (!p.label?.text.trim()) continue;
    if (p.label.side) fixed.push(sided(at, p.label.text, p.label.side, p.label.dist));
    else loose(p.id, at, p.label.text, 'above right');
  }
  for (const panel of model.panels) {
    if (!panel.caption?.trim()) continue;
    const f = frames.get(panel.id)!;
    const axes = model.items.some((i) => i.kind === 'axes' && i.panel === panel.id);
    fixed.push(centred(paper({ x: (f.minX + f.maxX) / 2, y: f.minY - (axes ? 0.6 : 0) }, panel.id), panel.caption));
  }

  const clear = shapesOf(shapes.map((item) => ({ item, shift: { x: 0, y: 0 } })));
  const out = new Map<string, Spot>();
  // beside the arrow: on the side that touches less, its left when both are clear
  const boxes = fixed.map(textBox);
  const hits = (label: Spaced) => {
    const b = textBox(label);
    return clear.filter((s) => touches(b, s)).length + boxes.filter((o) => overlap(b, o)).length;
  };
  const chosen = besides.map(({ id, label, d }) => {
    const [left, right] = [false, true].map((swap) => ({ ...label, anchor: ANCHOR_OF[besideSide(d, swap)] }));
    const swap = hits(right) < hits(left);
    const pick = swap ? right : left;
    boxes.push(textBox(pick));
    out.set(id, { side: besideSide(d, swap), dist: 0, code: swap ? 'auto, swap' : 'auto' });
    return pick;
  });
  const placedAll = placeLabels([...fixed, ...chosen, ...free.map((f) => f.label)].map((label) => ({ label, shift: { x: 0, y: 0 } })), clear);
  free.forEach(({ id, label }, i) => {
    const got = placedAll[fixed.length + chosen.length + i] ?? label;
    const side = SIDE_OF[got.anchor] ?? 'above right';
    const o = sideOffset(side);
    // how far it moved out, in pt along each axis as TikZ shifts it
    const r = Math.hypot(got.at.x - label.around!.x, got.at.y - label.around!.y) * SIZE * PT_PER_CM;
    const dist = Math.round((r / Math.hypot(o.x, o.y)) * 10) / 10;
    out.set(id, { side, dist, code: dist ? `${side}=${dist}pt` : side });
  });
  return out;
}
