// What a structure drawing shows in each view, as a list of lines, arcs, symbols and labels in centimetres. The export
// writes it as TikZ (code.ts) and the canvas draws the same list as SVG, so the live overlays are the export's own
// polylines.
import { unitWriter } from '../../units';
import { anchorFor, overlap, placeLabels, shapesOf, textBox } from './labels';
import type { Anchor, Box } from './labels';
import { SUPPORT_DEPTH } from './symbols';
import { UNITS, frameOf, loadDirection, memberName, members, nodeMap, placeAt, supports } from './model';
import type { Cut, Load, Member, Pt, StructureModel, Support, Units } from './model';
import { evalPoly, extremesInside, forcesAt } from './solve';
import type { Piece, Solution } from './solve';
import { readLooks } from './looks';
import type { DiagramLooks } from '../../types';

export { anchorFor };
export type { Anchor };

// ─── style ───

export type View = 'loading' | 'fbd' | 'diagrams' | 'forces' | 'joint' | 'section';

export const VIEWS: [View, string][] = [
  ['loading', 'Loading diagram'],
  ['fbd', 'Free-body diagram'],
  ['diagrams', 'Free-body diagram with shear and bending moment diagrams'],
  ['forces', 'Member forces'],
  ['joint', 'Joint free-body diagram'],
  ['section', 'Section free-body diagram']
];

export interface StructStyle {
  view: View;
  /** bending moments on the tension side (sagging below) or positive up */
  moments: 'tension' | 'positive';
  units: Units;
  /** significant figures in the values */
  figures: number;
  /** values as \\qty and units as \\unit (units.ts); off in a drawing from before the switch */
  siUnits: boolean;
  /** node letters shown */
  names: boolean;
  /** the structure's larger side, in cm */
  width: number;
  /** the canvas grid, an index into the unit's steps */
  grid: number;
  /** the force diagrams drawn, and their fills (left out of the file while they're the defaults) */
  diagrams: DiagramLooks;
  /** the joint or cut the joint and section views show */
  joint?: string;
  cut?: string;
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** The style kept in the file, anything unknown replaced by its default. */
export function readStyle(raw: Record<string, unknown>): StructStyle {
  const n = (value: unknown, min: number, max: number, fallback: number) => (typeof value === 'number' && value >= min && value <= max ? value : fallback);
  return {
    view: oneOf(raw.view, VIEWS.map(([v]) => v), 'diagrams'),
    moments: oneOf(raw.moments, ['tension', 'positive'] as const, 'tension'),
    units: oneOf(raw.units, Object.keys(UNITS) as Units[], 'kN-m'),
    figures: Math.round(n(raw.figures, 2, 5, 3)),
    siUnits: raw.siUnits === true,
    names: raw.names !== false,
    width: n(raw.width, 3, 20, 8),
    grid: Math.round(n(raw.grid, 0, 3, 1)),
    diagrams: readLooks(raw.diagrams),
    ...(typeof raw.joint === 'string' && { joint: raw.joint }),
    ...(typeof raw.cut === 'string' && { cut: raw.cut })
  };
}

// ─── the display list ───

export type Ink = 'member' | 'bar' | 'zero' | 'line' | 'load' | 'reaction' | 'force' | 'dimension' | 'cut' | 'faint' | 'axis';
export type Fill = 'shear' | 'moment' | 'axial' | 'load';

export type Item =
  | { t: 'line'; pts: Pt[]; ink: Ink; closed?: boolean; fill?: Fill; arrow?: '->' | '<->'; id?: string }
  /** an arc with an arrowhead at its `to` end; angles in degrees */
  | { t: 'arc'; c: Pt; r: number; from: number; to: number; ink: Ink; id?: string }
  | { t: 'pic'; name: string; at: Pt; rotate: number; id?: string; faint?: boolean }
  /** a label; one with `around` may move around that point to keep clear of the drawing (labels.ts) */
  | { t: 'text'; at: Pt; tex: string; anchor: Anchor; id?: string; around?: Pt; optional?: boolean }
  | { t: 'dot'; at: Pt; r: number; open: boolean };

/** A part of the picture: a comment heads it in the export, and a shift puts it in a scope. */
export interface Block {
  title: string;
  items: Item[];
  shift?: Pt;
}

export interface Scene {
  blocks: Block[];
  /** why a joint or section view couldn't be drawn, or a warning about it */
  message?: string;
  /** centimetres a drawing unit */
  scale: number;
  /** its text uses siunitx's \\qty, \\unit or \\num */
  siunitx?: boolean;
}

// ─── helpers ───

const add = (p: Pt, q: Pt) => ({ x: p.x + q.x, y: p.y + q.y });
const times = (p: Pt, k: number) => ({ x: p.x * k, y: p.y * k });
const unit = (p: Pt) => {
  const l = Math.hypot(p.x, p.y);
  return l ? { x: p.x / l, y: p.y / l } : { x: 0, y: 0 };
};

/** A value in the style's significant figures, without trailing zeros: 6.67, 45, -31.3. */
export function formatValue(value: number, figures: number) {
  if (Math.abs(value) < 1e-12) return '0';
  return String(Number(value.toPrecision(figures)));
}

/** The structure's extent in drawing units. */
function boundsOf(model: StructureModel) {
  const points = [...model.nodes, ...model.parts.flatMap((p) => (p.kind === 'cut' ? [p.p, p.q] : p.kind === 'label' || p.kind === 'axes' ? [p.at] : []))];
  if (!points.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return { minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)) };
}

/** Centimetres a drawing unit for the export: the larger side of the nodes fills the style's width. */
export function fitScale(model: StructureModel, width: number) {
  const nodes = model.nodes.length ? model.nodes : [{ x: 0, y: 0 }];
  const span = Math.max(Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x)), Math.max(...nodes.map((n) => n.y)) - Math.min(...nodes.map((n) => n.y)));
  return span > 0 ? width / span : 1;
}

/** The extent of some items in centimetres, with room for labels. */
export function extentOf(items: Item[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  const take = (p: Pt, pad = 0) => {
    xs.push(p.x - pad, p.x + pad);
    ys.push(p.y - pad, p.y + pad);
  };
  for (const item of items) {
    if (item.t === 'line') item.pts.forEach((p) => take(p));
    else if (item.t === 'arc') take(item.c, item.r);
    else if (item.t === 'pic') take(item.at, SUPPORT_DEPTH);
    else if (item.t === 'dot') take(item.at, item.r);
    else take(item.at, 0.35);
  }
  if (!xs.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const boxOf = textBox;

/** Labels that would overlap one before them moved down until they don't (a few steps at most): for forces, which all matter. */
function nudge(items: Item[]): Item[] {
  const boxes: Box[] = [];
  return items.map((item) => {
    if (item.t !== 'text') return item;
    let moved = item;
    for (let i = 0; i < 4 && boxes.some((b) => overlap(boxOf(moved), b)); i += 1) moved = { ...moved, at: { x: moved.at.x, y: moved.at.y - 0.32 } };
    boxes.push(boxOf(moved));
    return moved;
  });
}

/** The component of a piece's forces. */
const component = (piece: Piece, c: 'N' | 'V' | 'M') => piece[c];

// ─── the scene ───

const LOAD = 0.9;
const GAP = 0.06;

export function buildScene(model: StructureModel, solution: Solution, style: StructStyle, canvas = false): Scene {
  const units = UNITS[style.units];
  const [F, L] = [units.force, units.length];
  const momentUnit = `${F}\\,${L}`;
  const nodes = nodeMap(model);
  const all = members(model).filter((m) => nodes.has(m.a) && nodes.has(m.b) && frameOf(model, m).length > 0);
  const scale = canvas ? units.canvasCm : fitScale(model, style.width);
  const P = (p: Pt) => ({ x: p.x * scale, y: p.y * scale });
  const fmt = (v: number) => formatValue(v, style.figures);
  // the canvas shows values as text either way
  const si = unitWriter(style.siUnits && !canvas);
  const value = (v: number, u: string) => si.qty(fmt(v), u);
  const solved = solution.status.kind === 'ok';
  const nameOf = (id: string) => nodes.get(id)?.name;

  // ─── the structure itself ───

  /** members, each between lo and hi along it when clipped */
  const memberItems = (keep: (m: Member) => [number, number] | null, zero?: Set<string>): Item[] => {
    const out: Item[] = [];
    for (const m of all) {
      const range = keep(m);
      if (!range) continue;
      const f = frameOf(model, m);
      const ends = range.map((s) => P(add(f.a, times(f.u, Math.min(s, f.length)))));
      out.push({ t: 'line', pts: ends, ink: zero?.has(m.id) ? 'zero' : m.bar ? 'bar' : 'member', id: m.id });
    }
    // hinges, released ends and truss joints, over the members
    for (const m of all) {
      const range = keep(m);
      if (!range || m.bar) continue;
      const f = frameOf(model, m);
      m.release?.forEach((released, end) => {
        const at = end ? f.length : 0;
        if (released && !nodes.get(end ? m.b : m.a)?.hinge && range[0] <= at && at <= range[1]) out.push({ t: 'dot', at: add(P(end ? f.b : f.a), times(f.u, end ? -0.15 : 0.15)), r: 0.06, open: true });
      });
    }
    const shown = new Set(all.filter((m) => keep(m)).flatMap((m) => {
      const r = keep(m)!;
      const f = frameOf(model, m);
      return [...(r[0] <= 0 ? [m.a] : []), ...(r[1] >= f.length ? [m.b] : [])];
    }));
    for (const n of model.nodes) {
      if (!shown.has(n.id)) continue;
      const on = all.filter((m) => m.a === n.id || m.b === n.id);
      if (n.hinge) out.push({ t: 'pic', name: 'hinge', at: P(n), rotate: 0 });
      else if (on.length && on.every((m) => m.bar)) out.push({ t: 'dot', at: P(n), r: 0.06, open: true });
    }
    return out;
  };

  const supportItems = (keepNode: (id: string) => boolean, faint = false): Item[] =>
    supports(model).filter((s) => nodes.has(s.node) && keepNode(s.node)).map((s) => ({ t: 'pic', name: s.type, at: P(nodes.get(s.node)!), rotate: s.angle || 0, id: s.id, faint }));

  const nameItems = (keepNode: (id: string) => boolean): Item[] => {
    if (!style.names) return [];
    return model.nodes.flatMap((n) => {
      if (!n.name || !keepNode(n.id)) return [];
      const away = all.filter((m) => m.a === n.id || m.b === n.id).reduce((sum, m) => {
        const f = frameOf(model, m);
        return add(sum, m.a === n.id ? f.u : times(f.u, -1));
      }, { x: 0, y: 0 } as Pt);
      const supported = supports(model).some((s) => s.node === n.id);
      let d = unit(times(add(away, supported ? { x: 0, y: -1.2 } : { x: 0, y: 0 }), -1));
      if (!d.x && !d.y) d = unit({ x: -1, y: 1 });
      // up and to one side reads best beside a horizontal member
      if (Math.abs(d.y) < 0.3) d = unit({ x: d.x, y: 0.8 });
      return [{ t: 'text', at: add(P(n), times(d, 0.18)), tex: `$${n.name}$`, anchor: anchorFor(d), id: n.id, around: P(n) } as Item];
    });
  };

  // ─── loads ───

  const memberOf = (id: string) => all.find((m) => m.id === id);
  const wMax = Math.max(1e-12, ...model.parts.flatMap((p) => (p.kind === 'dist' ? [Math.abs(p.w1), Math.abs(p.w2)] : [])));

  /** a force arrow ending at a point, with its label at the tail */
  const arrowTo = (at: Pt, d: Pt, tex: string, ink: Ink, id?: string, length = LOAD): Item[] => {
    const tip = add(at, times(d, -GAP));
    const tail = add(tip, times(d, -length));
    return [
      { t: 'line', pts: [tail, tip], ink, arrow: '->', id },
      { t: 'text', at: add(tail, times(d, -0.05)), tex, anchor: anchorFor(times(d, -1)), id, around: tail }
    ];
  };

  /** a moment arc around a point, anticlockwise when ccw, with its label above */
  const momentAt = (at: Pt, ccw: boolean, tex: string, ink: Ink, id?: string, r = 0.35, label: Pt = { x: 0, y: 1 }): Item[] => [
    { t: 'arc', c: at, r, from: ccw ? -60 : 210, to: ccw ? 210 : -60, ink, id },
    { t: 'text', at: add(at, times(label, r + 0.08)), tex, anchor: anchorFor(label), id, around: at }
  ];

  /** loads, those on clipped members only between lo and hi */
  const loadItems = (keepPlace: (on: Load) => [number, number] | boolean): Item[] => {
    const out: Item[] = [];
    for (const p of model.parts) {
      if (p.kind !== 'force' && p.kind !== 'moment' && p.kind !== 'dist') continue;
      const kept = keepPlace(p);
      if (!kept) continue;
      if (p.kind === 'dist') {
        const m = memberOf(p.member);
        if (!m) continue;
        const f = frameOf(model, m);
        const [lo, hi] = Array.isArray(kept) ? kept : [-Infinity, Infinity];
        const from = Math.max(Math.min(p.from, p.to), lo, 0);
        const to = Math.min(Math.max(p.from, p.to), hi, f.length);
        if (to - from <= 1e-9 * f.length) continue;
        const w = (s: number) => p.w1 + ((p.w2 - p.w1) * (s - p.from)) / (p.to - p.from || 1);
        const sign = Math.sign(p.w1 + p.w2) || 1;
        const e = times(loadDirection(p, f.u), sign);
        const base = (s: number) => add(P(add(f.a, times(f.u, s))), times(e, -GAP));
        const top = (s: number) => add(base(s), times(e, -(0.15 + (0.5 * Math.abs(w(s))) / wMax)));
        const lengthCm = (to - from) * scale;
        const count = Math.max(2, Math.round(lengthCm / 0.4) + 1);
        const stops = Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
        out.push({ t: 'line', pts: [base(from), base(to), top(to), top(from)], ink: 'line', closed: true, fill: 'load', id: p.id });
        for (const s of stops) if (Math.abs(w(s)) > 1e-9 * wMax) out.push({ t: 'line', pts: [top(s), base(s)], ink: 'load', arrow: '->', id: p.id });
        const unitTex = `${F}/${L}`;
        const label = (s: number, tex: string) => out.push({ t: 'text', at: add(top(s), times(e, -0.05)), tex, anchor: anchorFor(times(e, -1)), id: p.id, around: top(s) });
        if (p.label) label((from + to) / 2, p.label);
        else if (Math.abs(w(from) - w(to)) < 1e-9 * wMax) label((from + to) / 2, value(Math.abs(w(from)), unitTex));
        else {
          if (Math.abs(w(from)) > 1e-9 * wMax) label(from, value(Math.abs(w(from)), unitTex));
          if (Math.abs(w(to)) > 1e-9 * wMax) label(to, value(Math.abs(w(to)), unitTex));
        }
        continue;
      }
      const at = P(placeAt(model, p.on));
      if (p.kind === 'force') {
        const m = 'member' in p.on ? memberOf(p.on.member) : undefined;
        const d = times(loadDirection(p, m ? frameOf(model, m).u : undefined), p.value < 0 ? -1 : 1);
        out.push(...arrowTo(at, d, p.label || value(Math.abs(p.value), F), 'load', p.id));
      } else {
        const ccw = !p.cw === p.value >= 0;
        out.push(...momentAt(at, ccw, p.label || value(Math.abs(p.value), momentUnit), 'load', p.id));
      }
    }
    return out;
  };

  // ─── reactions ───

  const reactionItems = (keepNode: (id: string) => boolean): Item[] => {
    if (!solved) return [];
    const out: Item[] = [];
    for (const r of solution.reactions) {
      if (!keepNode(r.node) || !nodes.has(r.node)) continue;
      const support = model.parts.find((p): p is Support => p.id === r.support);
      const at = P(nodes.get(r.node)!);
      const name = nameOf(r.node);
      const tex = (sub: string, v: number, u: string) => (name ? si.equals(`${name}${sub}`, fmt(Math.abs(v)), u) : value(Math.abs(v), u));
      const single = support && (support.type === 'roller' || support.type === 'spring' || support.type === 'guided');
      const forces: [Pt, number, string][] = single
        ? [[r.force, Math.hypot(r.force.x, r.force.y), support!.angle ? '' : '_y']]
        : [[{ x: r.force.x, y: 0 }, r.force.x, '_x'], [{ x: 0, y: r.force.y }, r.force.y, '_y']];
      for (const [force, v, sub] of forces) if (Math.abs(v) > solution.tiny) out.push(...arrowTo(at, unit(force), tex(sub, v, F), 'reaction', r.support));
      if (Math.abs(r.moment) > solution.tinyMoment) out.push(...momentAt(at, r.moment > 0, name ? si.equals(`M_{${name}}`, fmt(Math.abs(r.moment)), momentUnit) : value(Math.abs(r.moment), momentUnit), 'reaction', r.support, 0.45, unit({ x: -1, y: 0.6 })));
    }
    return out;
  };

  // ─── dimensions, labels, angles, axes and cuts ───

  const noteItems = (withCuts: boolean, floor = Infinity): Item[] => {
    const out: Item[] = [];
    for (const p of model.parts) {
      if (p.kind === 'dim') {
        const [a, b] = [nodes.get(p.a), nodes.get(p.b)];
        if (!a || !b) continue;
        // the dimension line's ends, the way out from the structure to it, and the length it gives
        let [s, t] = [P(a), P(b)];
        let n: Pt;
        let length: number;
        const side = Math.sign(p.offset) || -1;
        if (p.dir === 'h') {
          const y = side < 0 ? Math.min(Math.min(s.y, t.y) + p.offset * scale, floor) : Math.max(s.y, t.y) + p.offset * scale;
          [s, t, n, length] = [{ x: s.x, y }, { x: t.x, y }, { x: 0, y: side }, Math.abs(b.x - a.x)];
        } else if (p.dir === 'v') {
          const x = (side < 0 ? Math.min(s.x, t.x) : Math.max(s.x, t.x)) + p.offset * scale;
          [s, t, n, length] = [{ x, y: s.y }, { x, y: t.y }, { x: side, y: 0 }, Math.abs(b.y - a.y)];
        } else {
          const u = unit({ x: t.x - s.x, y: t.y - s.y });
          n = times({ x: -u.y, y: u.x }, side);
          const off = times(n, Math.abs(p.offset) * scale);
          [s, t, length] = [add(s, off), add(t, off), Math.hypot(b.x - a.x, b.y - a.y)];
        }
        // short extension lines, which never cross the supports or reaction arrows above them
        for (const end of [s, t]) out.push({ t: 'line', pts: [add(end, times(n, -0.35)), add(end, times(n, 0.1))], ink: 'dimension', id: p.id });
        out.push({ t: 'line', pts: [s, t], ink: 'dimension', arrow: '<->', id: p.id });
        out.push({ t: 'text', at: add(times(add(s, t), 0.5), times(n, 0.06)), tex: p.label || value(length, L), anchor: anchorFor(n), id: p.id, around: times(add(s, t), 0.5) });
      } else if (p.kind === 'label') {
        out.push({ t: 'text', at: P(p.at), tex: p.text, anchor: 'center', id: p.id });
      } else if (p.kind === 'angle') {
        const n = nodes.get(p.node);
        if (!n) continue;
        const to = p.to > p.from ? p.to : p.to + 360;
        const c = P(n);
        out.push({ t: 'arc', c, r: 0.7, from: p.from, to, ink: 'dimension', id: p.id });
        const mid = (((p.from + to) / 2) * Math.PI) / 180;
        const d = { x: Math.cos(mid), y: Math.sin(mid) };
        if (p.label) out.push({ t: 'text', at: add(c, times(d, 0.78)), tex: p.label, anchor: anchorFor(d), id: p.id, around: c });
      } else if (p.kind === 'axes') {
        const at = P(p.at);
        out.push({ t: 'line', pts: [at, add(at, { x: 0.9, y: 0 })], ink: 'axis', arrow: '->', id: p.id });
        out.push({ t: 'line', pts: [at, add(at, { x: 0, y: 0.9 })], ink: 'axis', arrow: '->', id: p.id });
        out.push({ t: 'text', at: add(at, { x: 0.95, y: 0 }), tex: '$x$', anchor: 'west', id: p.id });
        out.push({ t: 'text', at: add(at, { x: 0, y: 0.95 }), tex: '$y$', anchor: 'south', id: p.id });
      } else if (p.kind === 'cut' && withCuts) {
        out.push({ t: 'line', pts: [P(p.p), P(p.q)], ink: 'cut', id: p.id });
      }
    }
    return out;
  };

  // ─── forces along members: diagrams and labels ───

  const sideOf = (m: Member) => {
    const n = frameOf(model, m).n;
    const sigma = n.y > 1e-9 || (Math.abs(n.y) <= 1e-9 && n.x < 0) ? 1 : -1;
    return { n, plot: times(n, sigma) };
  };

  /** the offset of a value, along the member's plotting side: V and N along it, M by the convention */
  const offsetOf = (m: Member, c: 'N' | 'V' | 'M', v: number) => {
    const { n, plot } = sideOf(m);
    if (c === 'M') return times(n, style.moments === 'tension' ? -v : v);
    return times(plot, v);
  };

  const piecesOf = (m: Member) => solution.pieces.get(m.id) ?? [];

  const sampleMember = (m: Member, c: 'N' | 'V' | 'M') => {
    const out: { s: number; v: number }[] = [];
    for (const p of piecesOf(m)) {
      const f = component(p, c);
      const ts = [...Array.from({ length: 25 }, (_, i) => (p.L * i) / 24), ...extremesInside(f, p.L)].sort((a, b) => a - b);
      for (const t of ts) out.push({ s: p.s0 + t, v: evalPoly(f, t) });
    }
    return out;
  };

  /**
   * Where to label a member's diagram: piece ends, both sides of a jump and extremes inside a piece. A value the one
   * before it already gave (a constant stretch) isn't repeated, and zeros aren't labelled. Extremes come first.
   */
  const labelsOf = (m: Member, c: 'N' | 'V' | 'M', tolerance: number) => {
    const out: { s: number; v: number; lean: number; extreme: boolean }[] = [];
    piecesOf(m).forEach((p, i, list) => {
      const f = component(p, c);
      const [v0, v1] = [evalPoly(f, 0), evalPoly(f, p.L)];
      const prev = list[i - 1] && evalPoly(component(list[i - 1], c), list[i - 1].L);
      const next = list[i + 1] && evalPoly(component(list[i + 1], c), 0);
      const jumpIn = prev !== undefined && Math.abs(prev - v0) >= tolerance;
      const jumpOut = next !== undefined && Math.abs(next - v1) >= tolerance;
      out.push({ s: p.s0, v: v0, lean: jumpIn ? 1 : 0, extreme: false });
      out.push(...extremesInside(f, p.L).map((t) => ({ s: p.s0 + t, v: evalPoly(f, t), lean: 0, extreme: true })));
      out.push({ s: p.s0 + p.L, v: v1, lean: jumpOut ? -1 : 0, extreme: false });
    });
    const kept = out.filter((x, i) => i === 0 || Math.abs(x.v - out[i - 1].v) >= tolerance || x.lean > 0);
    return kept.filter((x) => Math.abs(x.v) >= tolerance).sort((a, b) => Number(b.extreme) - Number(a.extreme));
  };

  /** labels whose boxes would overlap one kept before them are left out (a rough box: TeX text's visible letters) */
  const declutter = (items: Item[]) => {
    const boxes: Box[] = [];
    return items.filter((item) => {
      if (item.t !== 'text') return true;
      const box = boxOf(item);
      if (boxes.some((b) => overlap(box, b))) return false;
      boxes.push(box);
      return true;
    });
  };

  const maxOf = (c: 'N' | 'V' | 'M', list: Member[]) => Math.max(0, ...list.flatMap((m) => sampleMember(m, c).map((x) => Math.abs(x.v))));
  const UNIT_OF = { N: F, V: F, M: momentUnit };
  const FILL_OF: Record<'N' | 'V' | 'M', keyof DiagramLooks> = { N: 'axial', V: 'shear', M: 'moment' };
  /** the diagrams the style draws, in order: one left out leaves no gap, as the rest close up */
  const shown = (list: ('N' | 'V' | 'M')[]) => list.filter((c) => style.diagrams[FILL_OF[c]].on);

  /**
   * One member's diagram polygon and its labels, drawn from base points `base(s)` (cm) with `h` cm a unit. A frame's
   * moments on the tension side are labelled by size, the side showing their sense.
   */
  const diagramItems = (m: Member, c: 'N' | 'V' | 'M', base: (s: number) => Pt, h: number, tolerance: number, sizes = false): { shape: Item[]; labels: Item[] } => {
    const f = frameOf(model, m);
    const samples = sampleMember(m, c);
    if (!samples.length) return { shape: [], labels: [] };
    const at = (s: number, v: number) => add(base(s), times(offsetOf(m, c, v), h));
    const shape: Item[] = [{ t: 'line', pts: [base(0), ...samples.map((x) => at(x.s, x.v)), base(f.length)], ink: 'line', closed: true, fill: FILL_OF[c] }];
    const labels = labelsOf(m, c, tolerance).map((label): Item => {
      const d = unit(add(times(unit(offsetOf(m, c, label.v)), 1), times(f.u, label.lean * 0.9)));
      return { t: 'text', at: add(at(label.s, label.v), times(d, 0.08)), tex: si.num(fmt(sizes ? Math.abs(label.v) : label.v)), anchor: anchorFor(d), around: at(label.s, label.v), optional: true };
    });
    return { shape, labels };
  };

  /** every member's diagram for a component, the extremes' labels first and any that would overlap left out */
  const componentItems = (c: 'N' | 'V' | 'M', base: (m: Member) => (s: number) => Pt, h: number, tolerance: number, sizes = false) => {
    const drawn = all.map((m) => diagramItems(m, c, base(m), h, tolerance, sizes));
    return [...drawn.flatMap((d) => d.shape), ...declutter(drawn.flatMap((d) => d.labels))];
  };

  const TITLES = { N: ['Axial force', '$N$'], V: ['Shear force', '$V$'], M: ['Bending moment', '$M$'] } as const;

  /** a horizontal beam's diagrams, stacked under it on the same scale */
  const beamDiagrams = (above: Item[]): Block[] => {
    const xs = all.flatMap((m) => [P(nodes.get(m.a)!).x, P(nodes.get(m.b)!).x]);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    let cursor = extentOf(above).minY - 0.3;
    const blocks: Block[] = [];
    const wanted = shown(maxOf('N', all) > solution.tiny ? ['N', 'V', 'M'] : ['V', 'M']);
    for (const c of wanted) {
      const max = maxOf(c, all);
      const h = max > 0 ? 1 / max : 0;
      const tolerance = Math.max(max * 1e-6, solution.tiny);
      const items: Item[] = [{ t: 'line', pts: [{ x: minX, y: 0 }, { x: maxX, y: 0 }], ink: 'axis' }];
      items.push(...componentItems(c, (m) => { const f = frameOf(model, m); return (s) => ({ x: P(add(f.a, times(f.u, s))).x, y: 0 }); }, h, tolerance));
      items.push({ t: 'text', at: { x: minX - 0.25, y: 0 }, tex: `${TITLES[c][1]} (${si.unit(UNIT_OF[c])})`, anchor: 'east' });
      const e = extentOf(items);
      const y = cursor - Math.max(e.maxY, 0.35);
      blocks.push({ title: TITLES[c][0], items, shift: { x: 0, y } });
      cursor = y + Math.min(e.minY, -0.35) - 0.3;
    }
    return blocks;
  };

  /** a frame's (or truss's) diagrams, each on a copy of it, in a grid beside the free-body diagram */
  const frameDiagrams = (fbd: Item[]): Block[] => {
    const wanted = shown(all.every((m) => m.bar) ? ['N'] : ['N', 'V', 'M']);
    const pts = model.nodes.filter((n) => all.some((m) => m.a === n.id || m.b === n.id)).map(P);
    const box = { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) };
    const size = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1);
    const hMax = Math.min(1.2, 0.18 * size);
    const pad = hMax + 0.8;
    const fe = extentOf(fbd);
    const dx = Math.max(fe.maxX, box.maxX + pad) - Math.min(fe.minX, box.minX - pad) + 0.6;
    const dy = Math.max(fe.maxY, box.maxY + pad) - Math.min(fe.minY, box.minY - pad) + 0.6;
    const spots = [{ x: dx, y: 0 }, { x: 0, y: -dy }, { x: dx, y: -dy }];
    return wanted.map((c, i) => {
      const max = maxOf(c, all);
      const h = max > 0 ? hMax / max : 0;
      const tolerance = Math.max(max * 1e-6, solution.tiny);
      const items: Item[] = all.map((m) => ({ t: 'line', pts: [P(nodes.get(m.a)!), P(nodes.get(m.b)!)], ink: 'line' }) as Item);
      items.push(...componentItems(c, (m) => { const f = frameOf(model, m); return (s) => P(add(f.a, times(f.u, s))); }, h, tolerance, c === 'M' && style.moments === 'tension'));
      items.push({ t: 'text', at: { x: box.minX - pad + 0.3, y: box.maxY + pad }, tex: `${TITLES[c][0]} (${si.unit(UNIT_OF[c])})`, anchor: 'south west' });
      return { title: TITLES[c][0], items, shift: spots[i] };
    });
  };

  const isBeam = all.length > 0 && all.every((m) => !m.bar && Math.abs(frameOf(model, m).u.y) < 1e-9) && new Set(all.map((m) => nodes.get(m.a)!.y)).size === 1;

  // ─── member forces ───

  const axialOf = (m: Member) => forcesAt(solution, m.id, frameOf(model, m).length / 2).N;
  const zeroForce = (m: Member) => Math.abs(axialOf(m)) < Math.max(solution.tiny, 1e-9);
  const tc = (v: number) => (v > 0 ? ' (T)' : ' (C)');
  const forceText = (v: number) => (Math.abs(v) < solution.tiny ? '$0$' : `${value(Math.abs(v), F)}${tc(v)}`);

  const memberForceItems = (): Item[] =>
    all.map((m) => {
      const f = frameOf(model, m);
      const { plot } = sideOf(m);
      const mid = P(add(f.a, times(f.u, f.length / 2)));
      return { t: 'text', at: add(mid, times(plot, 0.1)), tex: forceText(axialOf(m)), anchor: anchorFor(plot), id: m.id, around: mid } as Item;
    });

  // ─── the whole structure, as most views draw it ───

  const everything = () => true;
  const whole = (fbd: boolean): Block[] => {
    const blocks: Block[] = [
      { title: 'Structure', items: [...memberItems(() => [0, Infinity], undefined), ...nameItems(everything)] },
      { title: 'Supports', items: fbd ? (canvas ? supportItems(everything, true) : []) : supportItems(everything) },
      { title: 'Loads', items: loadItems(() => true) },
      { title: 'Reactions', items: fbd ? reactionItems(everything) : [] }
    ];
    // dimensions below the structure go under its supports and reactions
    return [...blocks, { title: 'Dimensions and labels', items: noteItems(true, extentOf(blocks.flatMap((b) => b.items)).minY - 0.3) }];
  };
  const flat = (blocks: Block[]) => blocks.flatMap((b) => b.items);

  const view = canvas && (style.view === 'joint' || style.view === 'section') ? 'fbd' : style.view;
  const scene = (blocks: Block[], message?: string): Scene => ({ blocks: clearLabels(blocks).filter((b) => b.items.length), message, scale, ...(si.used && { siunitx: true }) });

  if (view === 'loading') return scene(whole(false));
  if (view === 'fbd') {
    const blocks = whole(true);
    if (canvas && style.view === 'joint' && style.joint && nodes.has(style.joint)) blocks.push({ title: 'Joint', items: [{ t: 'dot', at: P(nodes.get(style.joint)!), r: 0.3, open: true }] });
    return scene(blocks);
  }
  if (view === 'diagrams') {
    const blocks = whole(true);
    if (!solved) return scene(blocks);
    return scene([...blocks, ...(isBeam ? beamDiagrams(flat(blocks)) : frameDiagrams(flat(blocks)))]);
  }
  if (view === 'forces') {
    const zero = new Set(solved ? all.filter(zeroForce).map((m) => m.id) : []);
    const blocks = whole(true);
    blocks[0] = { title: 'Structure', items: [...memberItems(() => [0, Infinity], zero), ...nameItems(everything)] };
    return scene([...blocks, { title: 'Member forces', items: solved ? memberForceItems() : [] }]);
  }
  if (view === 'joint') return jointScene();
  return sectionScene();

  // ─── a joint's free-body diagram ───

  function jointScene(): Scene {
    const id = style.joint && nodes.has(style.joint) ? style.joint : all[0] && all[0].a;
    const node = id ? nodes.get(id) : undefined;
    if (!node || !solved) return scene(whole(true), solved ? 'Choose a joint in the style menu.' : undefined);
    const at = P(node);
    const items: Item[] = [];
    const name = node.name ?? '';
    for (const m of all.filter((x) => x.a === node.id || x.b === node.id)) {
      const f = frameOf(model, m);
      const out = m.a === node.id ? f.u : times(f.u, -1);
      const end = solution.ends.get(m.id)?.[m.a === node.id ? 0 : 1];
      // a bar's stub carries its force; a frame member's is longer, for its shear and moment as well
      const reach = m.bar ? 1.5 : 2.1;
      items.push({ t: 'line', pts: [add(at, times(out, 0.1)), add(at, times(out, reach))], ink: 'faint' });
      if (!end) continue;
      const axial = end.force.x * out.x + end.force.y * out.y;
      const label = `F_{${memberName(model, m)}}`;
      const tip = add(at, times(out, reach + 0.05));
      if (Math.abs(axial) < solution.tiny) items.push({ t: 'text', at: tip, tex: `$${label} = 0$`, anchor: anchorFor(out) });
      else {
        const [from, to] = axial > 0 ? [reach - 1, reach] : [reach, reach - 1];
        items.push({ t: 'line', pts: [add(at, times(out, from)), add(at, times(out, to))], ink: 'force', arrow: '->' });
        items.push({ t: 'text', at: tip, tex: `${si.equals(label, fmt(Math.abs(axial)), F)}${tc(axial)}`, anchor: anchorFor(out) });
      }
      if (m.bar) continue;
      // a frame joint: the member's shear and moment on it too, the moment's label on the side away from the shear
      const across = { x: -out.y, y: out.x };
      const shear = end.force.x * across.x + end.force.y * across.y;
      const d = times(across, Math.sign(shear) || 1);
      if (Math.abs(shear) > solution.tiny) {
        const c = add(at, times(out, 0.75));
        items.push({ t: 'line', pts: [add(c, times(d, -0.35)), add(c, times(d, 0.35))], ink: 'force', arrow: '->' });
        items.push({ t: 'text', at: add(c, times(d, 0.4)), tex: value(Math.abs(shear), F), anchor: anchorFor(d) });
      }
      if (Math.abs(end.moment) > solution.tinyMoment) items.push(...momentAt(add(at, times(out, 1.35)), end.moment > 0, value(Math.abs(end.moment), momentUnit), 'force', undefined, 0.2, times(d, -1)));
    }
    items.push({ t: 'dot', at, r: 0.08, open: false });
    if (name && style.names) items.push({ t: 'text', at: add(at, { x: -0.15, y: 0.15 }), tex: `$${name}$`, anchor: 'south east' });
    const keep = (place: Load) => place.kind !== 'dist' && 'node' in place.on && place.on.node === node.id;
    return scene([
      { title: `Joint ${name}`.trim(), items: nudge(items) },
      { title: 'Loads', items: loadItems(keep) },
      { title: 'Reactions', items: reactionItems((n) => n === node.id) }
    ]);
  }

  // ─── a section's free-body diagram ───

  function sectionScene(): Scene {
    const cut = model.parts.find((p): p is Cut => p.kind === 'cut' && p.id === style.cut) ?? model.parts.find((p): p is Cut => p.kind === 'cut');
    if (!cut) return scene(whole(true), 'Draw a section cut across the structure, then choose it in the style menu.');
    if (!solved) return scene(whole(true));
    const section = cutSection(model, cut);
    if ('error' in section) return scene(whole(true), section.error);
    const { kept, crossed } = section;
    const keepNode = (id: string) => kept.has(id);
    const ranges = new Map<string, [number, number]>();
    for (const m of all) {
      const x = crossed.find((c) => c.member.id === m.id);
      if (x) ranges.set(m.id, x.keepsA ? [0, x.s] : [x.s, frameOf(model, m).length]);
      else if (kept.has(m.a) && kept.has(m.b)) ranges.set(m.id, [0, Infinity]);
    }
    const items: Item[] = [];
    for (const x of crossed) {
      const m = x.member;
      const f = frameOf(model, m);
      const point = P(add(f.a, times(f.u, x.s)));
      const out = x.keepsA ? f.u : times(f.u, -1);
      const { N, V, M } = forcesAt(solution, m.id, x.s);
      const name = memberName(model, m);
      if (Math.abs(N) < solution.tiny) {
        if (m.bar) items.push({ t: 'text', at: add(point, times(out, 0.15)), tex: `$F_{${name}} = 0$`, anchor: anchorFor(out) });
      } else {
        const [from, to] = N > 0 ? [0.05, 1.0] : [1.0, 0.05];
        items.push({ t: 'line', pts: [add(point, times(out, from)), add(point, times(out, to))], ink: 'force', arrow: '->' });
        items.push({ t: 'text', at: add(point, times(out, 1.05)), tex: `${si.equals(m.bar ? `F_{${name}}` : 'N', fmt(Math.abs(N)), F)}${tc(N)}`, anchor: anchorFor(out) });
      }
      if (m.bar) continue;
      const sv = times(f.n, x.keepsA ? -V : V);
      const d = Math.abs(V) > solution.tiny ? unit(sv) : { x: 0, y: -1 };
      if (Math.abs(V) > solution.tiny) {
        const c = add(point, times(out, 0.65));
        items.push({ t: 'line', pts: [add(c, times(d, -0.4)), add(c, times(d, 0.4))], ink: 'force', arrow: '->' });
        // labels lean away from the cut line, out over the part taken away
        items.push({ t: 'text', at: add(c, times(d, 0.45)), tex: si.equals('V', fmt(Math.abs(V)), F), anchor: anchorFor(add(d, out)) });
      }
      const moment = x.keepsA ? M : -M;
      if (Math.abs(M) > solution.tinyMoment) items.push(...momentAt(point, moment > 0, si.equals('M', fmt(Math.abs(M)), momentUnit), 'force', undefined, 0.3, unit(add(out, times(d, -1)))));
    }
    // where two cut members' lines meet: the point to take moments about
    const meets: Pt[] = [];
    for (let i = 0; i < crossed.length; i += 1) {
      for (let j = i + 1; j < crossed.length; j += 1) {
        const p = lineMeet(model, crossed[i].member, crossed[j].member);
        if (p && !meets.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6)) meets.push(p);
      }
    }
    const b = boundsOf(model);
    const reach = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 2;
    const near = meets.filter((p) => p.x > b.minX - reach && p.x < b.maxX + reach && p.y > b.minY - reach && p.y < b.maxY + reach);
    near.forEach((p, i) => {
      items.push({ t: 'dot', at: P(p), r: 0.05, open: false });
      items.push({ t: 'text', at: add(P(p), { x: 0.08, y: 0.08 }), tex: near.length > 1 ? `$O_{${i + 1}}$` : '$O$', anchor: 'south west' });
    });
    const keepLoad = (load: Load): [number, number] | boolean => {
      if (load.kind === 'dist') return ranges.get(load.member) ?? false;
      if ('node' in load.on) return kept.has(load.on.node);
      const r = ranges.get(load.on.member);
      return !!r && load.on.at >= r[0] - 1e-9 && load.on.at <= r[1] + 1e-9;
    };
    const message = crossed.length > 3 && !concurrent(model, crossed.map((c) => c.member)) ? `The cut crosses ${crossed.length} members that don’t meet at one point, so this section alone can’t be solved by hand. The forces shown come from the whole structure.` : undefined;
    return scene(
      [
        { title: 'Part kept', items: [...memberItems((m) => ranges.get(m.id) ?? null), ...nameItems(keepNode)] },
        { title: 'Loads', items: loadItems(keepLoad) },
        { title: 'Reactions', items: reactionItems(keepNode) },
        { title: 'Forces at the cut', items: [{ t: 'line', pts: [P(cut.p), P(cut.q)], ink: 'cut', id: cut.id }, ...nudge(items)] }
      ],
      message
    );
  }
}

// ─── labels clear of the drawing ───

/**
 * A scene's labels moved off its members, arrows, supports and diagram outlines (labels.ts). The last block's are placed
 * first and the structure's own (the node letters) last, so the values sit by what they belong to and a letter goes
 * where there's room.
 */
export function clearLabels(blocks: Block[]): Block[] {
  const at = (b: Block) => b.shift ?? { x: 0, y: 0 };
  const shapes = shapesOf(blocks.flatMap((b) => b.items.flatMap((item) => (item.t === 'text' ? [] : [{ item, shift: at(b) }]))));
  const labels = blocks.map((b, i) => ({ b, i })).reverse().flatMap(({ b, i }) => b.items.flatMap((item, j) => (item.t === 'text' ? [{ label: item, shift: at(b), key: `${i}:${j}` }] : [])));
  const placed = placeLabels(labels, shapes);
  const moved = new Map(labels.map((l, k) => [l.key, placed[k]]));
  return blocks.map((b, i) => ({ ...b, items: b.items.flatMap((item, j): Item[] => (item.t !== 'text' ? [item] : moved.get(`${i}:${j}`) ? [moved.get(`${i}:${j}`)!] : [])) }));
}

// ─── sections ───

/**
 * What a cut keeps: the nodes on its kept side, and the members it crosses with where. A cut must pass between the
 * nodes, and every member joining the two sides must cross it, so it splits the structure in two.
 */
export function cutSection(model: StructureModel, cut: Cut): { kept: Set<string>; crossed: { member: Member; s: number; keepsA: boolean }[] } | { error: string } {
  const d = { x: cut.q.x - cut.p.x, y: cut.q.y - cut.p.y };
  const length = Math.hypot(d.x, d.y);
  if (!length) return { error: 'The section cut has no length.' };
  const side = (p: Pt) => ((d.x * (p.y - cut.p.y) - d.y * (p.x - cut.p.x)) / length) * (cut.flip ? -1 : 1);
  const all = members(model);
  const used = model.nodes.filter((n) => all.some((m) => m.a === n.id || m.b === n.id));
  const scale = Math.max(1e-12, ...used.map((n) => Math.abs(n.x)), ...used.map((n) => Math.abs(n.y)), length);
  const on = used.find((n) => Math.abs(side(n)) < scale * 1e-9);
  if (on) return { error: `The cut passes through ${on.name ? `joint ${on.name}` : 'a joint'}. Move it between the joints.` };
  const kept = new Set(used.filter((n) => side(n) > 0).map((n) => n.id));
  if (!kept.size || kept.size === used.length) return { error: 'The cut doesn’t cross the structure.' };
  const crossed: { member: Member; s: number; keepsA: boolean }[] = [];
  for (const m of all) {
    if (kept.has(m.a) === kept.has(m.b)) continue;
    const f = frameOf(model, m);
    const [sa, sb] = [side(f.a), side(f.b)];
    const s = (sa / (sa - sb)) * f.length;
    const x = { x: f.a.x + f.u.x * s, y: f.a.y + f.u.y * s };
    const along = ((x.x - cut.p.x) * d.x + (x.y - cut.p.y) * d.y) / (length * length);
    if (along < -1e-9 || along > 1 + 1e-9) return { error: `The cut doesn’t split the structure in two: extend it across member ${memberName(model, m)}.` };
    crossed.push({ member: m, s, keepsA: kept.has(m.a) });
  }
  return { kept, crossed };
}

/** Where two members' lines meet, or null when they're parallel. */
function lineMeet(model: StructureModel, m1: Member, m2: Member): Pt | null {
  const [f, g] = [frameOf(model, m1), frameOf(model, m2)];
  const det = f.u.x * g.u.y - f.u.y * g.u.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((g.a.x - f.a.x) * g.u.y - (g.a.y - f.a.y) * g.u.x) / det;
  return { x: f.a.x + f.u.x * t, y: f.a.y + f.u.y * t };
}

/** Members whose lines all pass through one point. */
function concurrent(model: StructureModel, list: Member[]) {
  const p = lineMeet(model, list[0], list[1]);
  if (!p) return false;
  return list.every((m) => {
    const f = frameOf(model, m);
    return Math.abs((p.x - f.a.x) * f.n.x + (p.y - f.a.y) * f.n.y) < 1e-6 * Math.max(1, f.length);
  });
}
