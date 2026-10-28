// The structures' symbols, once: each a list of lines and circles in centimetres, with the point it attaches by at the
// origin and the structure above it. The export writes each as a pic in the picture's options (spx/struct/<name>), and
// the canvas draws the same shapes as SVG, so the canvas matches the PDF without a TeX round trip.
import { num } from '../shared';
import type { Pt } from './model';

type Shape =
  | { line: [number, number][]; closed?: boolean; fill?: 'paper' | 'ink'; heavy?: boolean }
  | { circle: [number, number]; r: number; fill?: 'paper' | 'ink' };

/** A hatched surface from x0 to x1 at height y, hatched below. */
function ground(x0: number, x1: number, y: number): Shape[] {
  const ticks: Shape[] = [];
  for (let x = x0 + 0.15; x <= x1 + 1e-9; x += 0.15) ticks.push({ line: [[x, y], [x - 0.13, y - 0.13]] });
  return [{ line: [[x0, y], [x1, y]], heavy: true }, ...ticks];
}

function zigzag(from: number, to: number): [number, number][] {
  const points: [number, number][] = [[0, from], [0, from - 0.08]];
  const steps = 6;
  const pitch = (from - to - 0.16) / steps;
  for (let i = 0; i < steps; i += 1) points.push([i % 2 ? -0.1 : 0.1, from - 0.08 - pitch * (i + 0.5)]);
  points.push([0, to + 0.08], [0, to]);
  return points;
}

function spiral(): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= 36; i += 1) {
    const t = (i / 36) * 3 * Math.PI;
    const r = 0.06 + (0.16 * i) / 36;
    points.push([r * Math.cos(t + Math.PI / 2), r * Math.sin(t + Math.PI / 2)]);
  }
  return points;
}

export const SYMBOLS: Record<string, Shape[]> = {
  pin: [{ line: [[0, 0], [-0.25, -0.4], [0.25, -0.4]], closed: true, fill: 'paper' }, ...ground(-0.4, 0.4, -0.4), { circle: [0, 0], r: 0.06, fill: 'paper' }],
  roller: [
    { line: [[0, 0], [-0.25, -0.34], [0.25, -0.34]], closed: true, fill: 'paper' },
    { circle: [-0.13, -0.41], r: 0.07, fill: 'paper' },
    { circle: [0.13, -0.41], r: 0.07, fill: 'paper' },
    ...ground(-0.4, 0.4, -0.48),
    { circle: [0, 0], r: 0.06, fill: 'paper' }
  ],
  fixed: ground(-0.4, 0.4, 0),
  guided: [{ line: [[-0.3, 0], [0.3, 0]], heavy: true }, { circle: [-0.15, -0.08], r: 0.07, fill: 'paper' }, { circle: [0.15, -0.08], r: 0.07, fill: 'paper' }, ...ground(-0.4, 0.4, -0.15)],
  spring: [{ line: zigzag(0, -0.6) }, ...ground(-0.3, 0.3, -0.6), { circle: [0, 0], r: 0.06, fill: 'paper' }],
  rotspring: [{ line: spiral() }, { line: [[0.22, 0], [0.22, -0.45]] }, { line: [[0, 0], [-0.2, -0.45], [0.2, -0.45]], closed: true }, ...ground(-0.4, 0.4, -0.45), { circle: [0, 0], r: 0.06, fill: 'paper' }],
  hinge: [{ circle: [0, 0], r: 0.07, fill: 'paper' }]
};

/** How far below its node a support reaches, for spacing what's drawn under it. */
export const SUPPORT_DEPTH = 0.65;

// ─── TikZ ───

const pt = ([x, y]: [number, number]) => `(${num(x)},${num(y)})`;

function shapeTikz(shape: Shape) {
  if ('circle' in shape) return `\\draw${shape.fill === 'ink' ? '[fill]' : shape.fill === 'paper' ? '[fill=white]' : ''} ${pt(shape.circle)} circle (${num(shape.r)});`;
  const options = [shape.heavy && 'line width=0.8pt', shape.fill === 'paper' && 'fill=white', shape.fill === 'ink' && 'fill'].filter(Boolean);
  return `\\draw${options.length ? `[${options.join(', ')}]` : ''} ${shape.line.map(pt).join(' -- ')}${shape.closed ? ' -- cycle' : ''};`;
}

/** The pic key for a symbol. */
export const picName = (name: string) => `spx/struct/${name}`;

/** A symbol's definition for the picture's options: spx/struct/pin/.pic={…}. */
export const picDefinition = (name: string) => `${picName(name)}/.pic={${SYMBOLS[name].map(shapeTikz).join(' ')}}`;

// ─── SVG ───

/** A symbol as SVG pieces in centimetres with y up (the canvas flips and scales them). */
export function symbolSvg(name: string): { d: string; fill?: 'paper' | 'ink'; heavy?: boolean; circle?: { c: Pt; r: number } }[] {
  return (SYMBOLS[name] ?? []).map((shape) =>
    'circle' in shape
      ? { d: '', fill: shape.fill, circle: { c: { x: shape.circle[0], y: shape.circle[1] }, r: shape.r } }
      : { d: `M${shape.line.map(([x, y]) => `${x},${y}`).join(' L')}${shape.closed ? ' Z' : ''}`, fill: shape.fill, heavy: shape.heavy }
  );
}
