// What the fluid mechanics presets (gate, manometer, tank, floating body) share: the fluids with their relative
// densities, their fills (a tint as the lecture slides shade them, or the exam papers' black and white: dashed lines
// for water, dots for oil, hatching for mercury), the ▽ free-surface mark, hatched walls and ground, dimension lines,
// and a scene whose labels are placed clear of what it draws, as Mohr's circle places its own.
import { formatValue } from '../structures/draw';
import { anchorFor, placeLabels, shapesOf } from '../structures/labels';
import type { Label, Shape, ShapeItem } from '../structures/labels';
import { num } from '../shared';
import type { FormField, FormValues } from './presets';

export type Pt = { x: number; y: number };

/** tint: a region's fill on the slides; tube: the stronger colour a thin tube shows; grey: a tube on an exam paper */
type Fluid = { name: string; rd: number; tint: string; tube: string; grey: string; exam: 'dashes' | 'dots' | 'hatch' | 'none' };
export const FLUIDS: Record<string, Fluid> = {
  water: { name: 'Water', rd: 1, tint: 'cyan!15', tube: 'cyan!45', grey: 'black!8', exam: 'dashes' },
  seawater: { name: 'Seawater', rd: 1.025, tint: 'teal!25', tube: 'teal!50', grey: 'black!16', exam: 'dashes' },
  oil: { name: 'Oil', rd: 0.85, tint: 'orange!35', tube: 'orange!70', grey: 'black!25', exam: 'dots' },
  glycerin: { name: 'Glycerin', rd: 1.26, tint: 'cyan!45', tube: 'blue!45', grey: 'black!40', exam: 'dots' },
  mercury: { name: 'Mercury', rd: 13.6, tint: 'black!45', tube: 'black!55', grey: 'black!85', exam: 'hatch' },
  air: { name: 'Air', rd: 0, tint: 'white', tube: 'white', grey: 'white', exam: 'none' }
};
const FLUID_OPTIONS = Object.entries(FLUIDS).map(([id, f]): [string, string] => [id, f.name]);

/** g, 9.81 m/s² as the course takes it */
export const G = 9.81;

/** A fluid's two fields: which fluid, and its relative density (0 takes the fluid's usual one). */
export function fluidFields(key: string, label: string, shown?: (v: FormValues) => boolean, none = false): FormField[] {
  return [
    { key, label, kind: 'choice', options: none ? [['none', 'None'], ...FLUID_OPTIONS] : FLUID_OPTIONS, ...(shown && { shown }) },
    {
      key: `${key}RD`,
      label: 'Relative density',
      kind: 'number',
      min: 0,
      max: 30,
      step: 0.01,
      hint: '0 takes the fluid’s usual one: water 1, seawater 1.025, oil 0.85, glycerin 1.26, mercury 13.6, air 0.',
      shown: (v) => (shown?.(v) ?? true) && v[key] !== 'none'
    }
  ];
}

export type FluidOf = Fluid & { id: string; rho: number; label: string };

/** The fluid a preset's fields name, with its density (kg/m³) and its label (“Oil, RD = 0.83”). */
export function fluidOf(values: FormValues, key: string): FluidOf {
  const id = String(values[key]) in FLUIDS ? String(values[key]) : 'water';
  const f = FLUIDS[id];
  const typed = Number(values[`${key}RD`]);
  const rd = typed > 0 ? typed : f.rd;
  return { ...f, id, rd, rho: rd * 1000, label: rd ? `${f.name}, RD = ${formatValue(rd, 4)}` : f.name };
}

export const LOOK_FIELD: FormField = {
  key: 'look',
  label: 'Look',
  kind: 'choice',
  options: [['colour', 'Lecture slides (tinted)'], ['exam', 'Exam paper (black and white)']]
};
export const RESULTS_FIELD: FormField = { key: 'results', label: 'Write the results under the figure', kind: 'switch' };

/** n to four significant figures, as the course's worked answers give them */
export const fmt = (n: number, figures = 4) => formatValue(n, figures);

/** A pressure in Pa written in kPa from 10 kPa up, in Pa below: [value, unit]. */
export const pressure = (pa: number): [string, string] => (Math.abs(pa) >= 1e4 ? [fmt(pa / 1000), 'kPa'] : [fmt(pa), 'Pa']);

const at = (p: Pt) => `(${num(p.x)},${num(p.y)})`;
export { at };

/** The labels' text as the spacing measures it: a Greek letter one letter wide, \mathrm and \text not at all. */
const measured = (tex: string) => tex.replace(/\\(?:mathrm|text)\b/g, '').replace(/\\(?:theta|rho|Delta|max)\b/g, 'x').replace(/\\circ\b/g, '');

/**
 * A drawing being written: its lines, the shapes its labels keep clear of, and its labels, each written where its
 * marker is once all are placed (in the order they were added, fixed ones staying where they are).
 */
export function scene(look = 'colour') {
  const lines: string[] = [];
  const items: ShapeItem[] = [];
  const labels: Label[] = [];
  let patterns = false;
  const s = {
    lines,
    items,
    add: (...l: string[]) => void lines.push(...l),
    /** a line or outline the labels keep clear of */
    seg: (pts: Pt[], closed = false) => void items.push({ t: 'line', pts, closed }),
    dot: (p: Pt, r = 0.05) => {
      items.push({ t: 'dot', at: p, r });
      lines.push(`\\fill ${at(p)} circle (${num(r)});`);
    },
    /** a label beside p towards d, moved round p when that side is taken; or, fixed, anchored there whatever it touches */
    label(p: Pt, tex: string, d: Pt, fixed = false) {
      const n = Math.hypot(d.x, d.y) || 1;
      labels.push({ at: { x: p.x + (d.x / n) * 1e-4, y: p.y + (d.y / n) * 1e-4 }, tex, anchor: anchorFor(d), ...(!fixed && { around: p }) });
      lines.push(`\u0000${labels.length - 1}`);
    },
    /** a fluid's fill over a closed outline, as the look has it */
    fill(poly: Pt[], f: FluidOf, look: string) {
      const path = `${poly.map(at).join(' -- ')} -- cycle`;
      if (look !== 'exam') {
        if (f.id !== 'air') lines.push(`\\fill[${f.tint}] ${path};`);
        return;
      }
      if (f.exam === 'hatch' || f.exam === 'dots') {
        patterns = true;
        lines.push(`\\fill[pattern=${f.exam === 'hatch' ? 'north east lines' : 'dots'}, pattern color=black!60] ${path};`);
      } else if (f.exam === 'dashes') {
        const ys = poly.map((p) => p.y);
        const [x0, x1] = [Math.min(...poly.map((p) => p.x)), Math.max(...poly.map((p) => p.x))];
        const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
        if (y1 - y0 < 0.1) return;
        lines.push(
          `\\begin{scope}\\clip ${path};`,
          `\\foreach \\y in {${num(y1 - 0.1)},${num(y1 - 0.25)},...,${num(y0)}} \\draw[black!55, line width=0.3pt, dash pattern=on 2pt off 1.5pt] (${num(x0)},\\y) -- (${num(x1)},\\y);`,
          '\\end{scope}'
        );
      }
    },
    /** the ▽ mark with its apex on the free surface at p, and two short lines under it */
    surface(p: Pt) {
      const { x, y } = p;
      lines.push(`\\draw[line width=0.4pt, fill=white] (${num(x - 0.12)},${num(y + 0.21)}) -- (${num(x + 0.12)},${num(y + 0.21)}) -- ${at(p)} -- cycle;`);
      lines.push(`\\draw[line width=0.4pt] (${num(x - 0.15)},${num(y - 0.07)}) -- (${num(x + 0.15)},${num(y - 0.07)}) (${num(x - 0.08)},${num(y - 0.14)}) -- (${num(x + 0.08)},${num(y - 0.14)});`);
      items.push({ t: 'line', pts: [{ x: x - 0.15, y: y - 0.14 }, { x: x + 0.15, y: y - 0.14 }, { x: x + 0.15, y: y + 0.21 }, { x: x - 0.15, y: y + 0.21 }], closed: true, fill: 'white' });
    },
    /** a wall or the ground from p to q, its hatching on the left of p → q (side 1) or the right (−1) */
    hatched(p: Pt, q: Pt, side: 1 | -1) {
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
      const n = { x: -d.y * side, y: d.x * side };
      const ticks = Array.from({ length: Math.max(1, Math.floor(len / 0.15)) }, (_, i) => {
        const a = { x: p.x + d.x * (0.08 + i * 0.15), y: p.y + d.y * (0.08 + i * 0.15) };
        return `${at(a)} -- ${at({ x: a.x + n.x * 0.14 - d.x * 0.1, y: a.y + n.y * 0.14 - d.y * 0.1 })}`;
      });
      lines.push(`\\draw[thick] ${at(p)} -- ${at(q)};`, `\\draw[line width=0.3pt] ${ticks.join(' ')};`);
      items.push({ t: 'line', pts: [p, q, { x: q.x + n.x * 0.14, y: q.y + n.y * 0.14 }, { x: p.x + n.x * 0.14, y: p.y + n.y * 0.14 }], closed: true, fill: 'white' });
    },
    /** a dimension from p to q set off by `off`, with extension lines from the points and its text beyond it */
    dimension(p: Pt, q: Pt, off: Pt, tex: string) {
      if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) return;
      const n = Math.hypot(off.x, off.y) || 1;
      const e = { x: (off.x / n) * 0.1, y: (off.y / n) * 0.1 };
      const [a, b] = [{ x: p.x + off.x, y: p.y + off.y }, { x: q.x + off.x, y: q.y + off.y }];
      // extension lines from a little off the points, past the dimension line
      const gap = Math.min(0.1, n / 3);
      const from = (o: Pt) => at({ x: o.x + (off.x / n) * gap, y: o.y + (off.y / n) * gap });
      lines.push(`\\draw[line width=0.3pt] ${from(p)} -- ${at({ x: a.x + e.x, y: a.y + e.y })} ${from(q)} -- ${at({ x: b.x + e.x, y: b.y + e.y })};`);
      lines.push(`\\draw[<->, line width=0.4pt] ${at(a)} -- ${at(b)};`);
      items.push({ t: 'line', pts: [a, b] });
      s.label({ x: (a.x + b.x) / 2 + e.x * 0.5, y: (a.y + b.y) / 2 + e.y * 0.5 }, tex, off, true);
    },
    /** the code with each label where it's placed, the labels as placed (their text as measured) and the shapes, for a check */
    finish() {
      const shapes: Shape[] = shapesOf(items.map((item) => ({ item, shift: { x: 0, y: 0 } })));
      // the fixed labels (dimensions') first, so the others keep clear of them
      const order = labels.map((l, i) => i).sort((i, j) => Number(!!labels[i].around) - Number(!!labels[j].around));
      const inOrder = placeLabels(order.map((i) => ({ label: { ...labels[i], tex: measured(labels[i].tex) }, shift: { x: 0, y: 0 } })), shapes);
      const placed: (Label | null)[] = [];
      order.forEach((i, k) => (placed[i] = inOrder[k]));
      const body = lines.map((line) => {
        if (!line.startsWith('\u0000')) return line;
        const i = Number(line.slice(1));
        const p = placed[i] ?? labels[i];
        // on an exam paper's black and white, a label over a fluid's lines sits on white, as the papers' do
        return `\\node[anchor=${p.anchor}${look === 'exam' ? ', fill=white' : ''}] at ${at(p.at)} {${labels[i].tex}};`;
      });
      return { body, patterns, labels: placed.map((l, i) => l ?? { ...labels[i], tex: measured(labels[i].tex) }), shapes };
    }
  };
  return s;
}

export type Scene = ReturnType<typeof scene>;

/**
 * The results under the figure, one line each, centred under x and below everything drawn so far; the labels keep
 * clear of them. ponytail: their box is guessed from the longest line (about 1.8 mm a character), as labels.ts measures.
 */
export function results(sc: Scene, x: number, parts: string[]) {
  if (!parts.length) return;
  const ys = sc.items.flatMap((item) => (item.t === 'line' ? item.pts.map((p) => p.y) : item.t === 'arc' ? [item.c.y - item.r] : item.t === 'dot' ? [item.at.y - item.r] : []));
  const y = Math.min(0, ...ys) - 0.55;
  const w = Math.max(...parts.map((p) => p.replace(/\\[a-zA-Z]+|[{}$^_]/g, '').length)) * 0.18;
  sc.add(`\\node[anchor=north, align=center] at ${at({ x, y })} {${parts.join(';\\\\ ')}};`);
  sc.items.push({ t: 'line', pts: [{ x: x - w / 2, y }, { x: x + w / 2, y }, { x: x + w / 2, y: y - parts.length * 0.42 }, { x: x - w / 2, y: y - parts.length * 0.42 }], closed: true, fill: 'white' });
}

/** The picture around a scene's lines, with the libraries its fills need. */
export function pictureOf(s: Scene, comments: string[], siunitx: boolean) {
  const done = s.finish();
  return {
    code: {
      body: [...comments.map((c) => `% ${c}`), '\\begin{tikzpicture}[>={Stealth[length=1.6mm]}, font=\\footnotesize]', ...done.body, '\\end{tikzpicture}', ''].join('\n'),
      packages: ['tikz', ...(siunitx ? ['siunitx'] : [])],
      libraries: ['arrows.meta', 'babel', ...(done.patterns ? ['patterns'] : [])]
    },
    labels: done.labels,
    shapes: done.shapes
  };
}
