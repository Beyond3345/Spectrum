// What the maths presets (conics, linear transformation) share: a view of the x–y plane fitted to what is drawn, its
// axes as the MATH2150 notes draw them (through the origin, with arrows, x and y at the tips), and lines cut to the view.
import { num } from '../shared';
import { at, fmt } from './fluids';
import type { Pt, Scene } from './fluids';

export type View = { x0: number; x1: number; y0: number; y1: number };

/** The box around some points. */
export const boxOf = (pts: Pt[]): View => ({ x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) });

/**
 * The view for what is drawn: its box (never thinner than `least`), with the origin when that is no further away than
 * the box is wide, and a margin all round.
 */
export function viewOf(pts: Pt[], least = 1e-9): View {
  let b = boxOf(pts);
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0, least);
  const away = Math.hypot(Math.max(b.x0, 0, -b.x1), Math.max(b.y0, 0, -b.y1));
  if (away <= size) b = boxOf([{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: 0, y: 0 }]);
  const pad = 0.12 * Math.max(b.x1 - b.x0, b.y1 - b.y0, least);
  // a view of one line (a single point's, say) still has both ways to look
  const thin = (lo: number, hi: number) => (hi - lo < least ? least / 2 : 0);
  return { x0: b.x0 - pad - thin(b.x0, b.x1), x1: b.x1 + pad + thin(b.x0, b.x1), y0: b.y0 - pad - thin(b.y0, b.y1), y1: b.y1 + pad + thin(b.y0, b.y1) };
}

/** The part of the line through p along d that is inside the view (Liang–Barsky), or null when it misses it. */
export function clipLine(p: Pt, d: Pt, v: View): [Pt, Pt] | null {
  let [t0, t1] = [-Infinity, Infinity];
  for (const [num, den] of [[p.x - v.x0, -d.x], [v.x1 - p.x, d.x], [p.y - v.y0, -d.y], [v.y1 - p.y, d.y]]) {
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null;
      continue;
    }
    if (den < 0) t0 = Math.max(t0, num / den);
    else t1 = Math.min(t1, num / den);
  }
  return t0 < t1 ? [{ x: p.x + d.x * t0, y: p.y + d.y * t0 }, { x: p.x + d.x * t1, y: p.y + d.y * t1 }] : null;
}

/** A step of 1, 2 or 5 times a power of ten, the nearest to raw. */
export function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}

/**
 * The plane a preset draws on: its scale (the view's longer side `size` cm, at most `most` cm a unit), P from the
 * plane's units to the picture's cm, and the axes through the origin, or along the view's nearest edge when the origin
 * is outside it, with numbers on them when asked.
 */
export function plane(sc: Scene, v: View, { ticks, colour = 'black', size = 7, most = Infinity }: { ticks: boolean; colour?: string; size?: number; most?: number }) {
  const k = Math.min(most, size / Math.max(v.x1 - v.x0, v.y1 - v.y0));
  const P = (p: Pt): Pt => ({ x: (p.x - v.x0) * k, y: (p.y - v.y0) * k });
  const o = { x: Math.min(Math.max(0, v.x0), v.x1), y: Math.min(Math.max(0, v.y0), v.y1) };
  const [l, r, b, t] = [P({ x: v.x0, y: o.y }), P({ x: v.x1, y: o.y }), P({ x: o.x, y: v.y0 }), P({ x: o.x, y: v.y1 })];
  sc.add('% Axes', `\\draw[->, ${colour}] ${at(l)} -- ${at(r)};`, `\\draw[->, ${colour}] ${at(b)} -- ${at(t)};`);
  sc.seg([l, r]);
  sc.seg([b, t]);
  sc.label(r, '$x$', { x: 1, y: 0 }, true);
  sc.label(t, '$y$', { x: 0, y: 1 }, true);
  if (ticks) {
    const step = niceStep(Math.max(v.x1 - v.x0, v.y1 - v.y0) / 6);
    // the numbers between the view's edges, but for the one where the axes cross and any under an arrow's tip
    const marks = (lo: number, hi: number, cross: number) => {
      const out: number[] = [];
      for (let n = Math.ceil((lo + 0.25 / k) / step); n * step <= hi - 0.45 / k; n += 1) if (Math.abs(n * step - cross) > step / 2) out.push(n * step);
      return out;
    };
    const [xs, ys] = [marks(v.x0, v.x1, o.x), marks(v.y0, v.y1, o.y)];
    const list = (values: number[], cm: (value: number) => number) => values.map((value) => `${num(cm(value))}/${fmt(value, 6)}`).join(', ');
    const o2 = P(o);
    if (xs.length) sc.add(`\\foreach \\x/\\n in {${list(xs, (x) => P({ x, y: 0 }).x)}} \\draw[${colour}] (\\x,${num(o2.y + 0.06)}) -- (\\x,${num(o2.y - 0.06)}) node[anchor=north, font=\\scriptsize, inner sep=1.5pt] {$\\n$};`);
    if (ys.length) sc.add(`\\foreach \\y/\\n in {${list(ys, (y) => P({ x: 0, y }).y)}} \\draw[${colour}] (${num(o2.x + 0.06)},\\y) -- (${num(o2.x - 0.06)},\\y) node[anchor=east, font=\\scriptsize, inner sep=1.5pt] {$\\n$};`);
    // each number's box (about 1.3 mm a character at \scriptsize, a minus sign 2 mm), which the labels keep clear of
    const wide = (value: number) => fmt(value, 6).length * 0.13 + (value < 0 ? 0.07 : 0);
    const box =(x0: number, x1: number, y0: number, y1: number) => sc.items.push({ t: 'line', pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true, fill: 'white' });
    for (const x of xs) {
      const [c, w] = [P({ x, y: 0 }).x, wide(x)];
      box(c - w / 2, c + w / 2, o2.y - 0.34, o2.y + 0.06);
    }
    for (const y of ys) {
      const [c, w] = [P({ x: 0, y }).y, wide(y)];
      box(o2.x - 0.12 - w, o2.x + 0.06, c - 0.11, c + 0.11);
    }
  }
  return { k, P, o };
}

/** A line of working as the code's comment has it: without its TeX. */
export const plain = (tex: string) =>
  tex.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/$2').replace(/\\mathbf\{([^{}]*)\}/g, '$1').replace(/\^\\circ/g, ' degrees').replace(/\\pm/g, '+/-').replace(/[$\\]/g, '');
