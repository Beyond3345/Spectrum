// The Venn diagram preset: two or three sets as circles, any region shaded, a count or text in any region. Each
// region's boundary is worked out here as arcs of the circles, so each shaded region is one \fill of its own.
import type { DiagramCode } from '../../fileFormat';
import { mathsPackages, num } from '../shared';
import type { FormField, FormPreset, FormValues } from './presets';

type Circle = { x: number; y: number; r: number };
/** An arc of circle `c` from angle a to b in degrees: anticlockwise when b > a, clockwise when b < a. */
export type Arc = { c: number; a: number; b: number };

const R = 1.5;
/** The circles, in cm: two side by side, or three in a triangle, the third below. */
export function circlesOf(sets: number): Circle[] {
  if (sets === 2) return [{ x: -0.9, y: 0, r: R }, { x: 0.9, y: 0, r: R }];
  return [150, 30, 270].map((deg) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180), r: R }));
}

const at = (c: Circle, deg: number): [number, number] => [c.x + c.r * Math.cos((deg * Math.PI) / 180), c.y + c.r * Math.sin((deg * Math.PI) / 180)];
/** Which circles a point is in, as bits: 1 the first, 2 the second, 4 the third. */
export const maskOf = (circles: Circle[], [x, y]: [number, number]) => circles.reduce((m, c, i) => (Math.hypot(x - c.x, y - c.y) < c.r ? m | (1 << i) : m), 0);

/** Where circle i meets the others, as its angles in degrees. */
function crossings(circles: Circle[], i: number) {
  const c = circles[i];
  return circles.flatMap((o, j) => {
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (j === i || d >= c.r + o.r || d <= Math.abs(c.r - o.r)) return [];
    const towards = Math.atan2(o.y - c.y, o.x - c.x);
    const spread = Math.acos((c.r * c.r + d * d - o.r * o.r) / (2 * c.r * d));
    return [towards - spread, towards + spread].map((t) => (((t * 180) / Math.PI) % 360 + 360) % 360);
  });
}

/**
 * The boundary of the region whose points are in exactly the circles of `mask`, as closed loops of arcs, each
 * going round with the region on its left: anticlockwise along a circle it's inside, clockwise along one it's outside.
 */
export function regionLoops(circles: Circle[], mask: number): Arc[][] {
  const arcs: Arc[] = [];
  circles.forEach((c, i) => {
    const cuts = [...new Set(crossings(circles, i).map((t) => Number(t.toFixed(9))))].sort((p, q) => p - q);
    const pieces = cuts.length ? cuts.map((t, k) => [t, k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + 360]) : [[0, 360]];
    for (const [a, b] of pieces) {
      // the other circles this arc is inside of, by its middle
      const others = maskOf(circles, at(c, (a + b) / 2)) & ~(1 << i);
      if (others === (mask & ~(1 << i))) arcs.push(mask & (1 << i) ? { c: i, a, b } : { c: i, a: b, b: a });
    }
  });
  // joined end to start into loops
  const end = (arc: Arc) => at(circles[arc.c], arc.b);
  const start = (arc: Arc) => at(circles[arc.c], arc.a);
  const near = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  const loops: Arc[][] = [];
  const left = [...arcs];
  while (left.length) {
    const loop = [left.shift()!];
    for (let next = left.findIndex((a) => near(start(a), end(loop[loop.length - 1]))); next >= 0; next = left.findIndex((a) => near(start(a), end(loop[loop.length - 1])))) {
      loop.push(...left.splice(next, 1));
    }
    loops.push(loop);
  }
  return loops;
}

/** A loop as TikZ path: its start, then each arc from where the last ended. */
function loopPath(circles: Circle[], loop: Arc[]) {
  const [x, y] = at(circles[loop[0].c], loop[0].a);
  return `(${num(x)},${num(y)}) ${loop.map((arc) => `arc[start angle=${num(arc.a)}, end angle=${num(arc.b)}, radius=${num(circles[arc.c].r)}]`).join(' ')} -- cycle`;
}

/** The frame round every circle, as its corners. */
function frameOf(circles: Circle[]): [[number, number], [number, number]] {
  const pad = 0.5;
  return [
    [Math.min(...circles.map((c) => c.x - c.r)) - pad, Math.min(...circles.map((c) => c.y - c.r)) - pad],
    [Math.max(...circles.map((c) => c.x + c.r)) + pad, Math.max(...circles.map((c) => c.y + c.r)) + pad]
  ];
}

/**
 * A point well inside the region, for its text: on a grid, the one farthest from every circle's edge (and the frame's,
 * outside the sets). ponytail: a 0.05 cm grid search, plenty for three circles.
 */
export function labelPoint(circles: Circle[], mask: number): [number, number] {
  const [[x0, y0], [x1, y1]] = frameOf(circles);
  let best: [number, number] = [0, 0];
  let score = -1;
  for (let x = x0; x <= x1; x += 0.05) {
    for (let y = y0; y <= y1; y += 0.05) {
      if (maskOf(circles, [x, y]) !== mask) continue;
      const room = Math.min(...circles.map((c) => Math.abs(Math.hypot(x - c.x, y - c.y) - c.r)), mask ? Infinity : Math.min(x - x0, x1 - x, y - y0, y1 - y));
      if (room > score) [best, score] = [[x, y], room];
    }
  }
  return best;
}

/** The regions, in the form's order: [mask, its name in the fields]. */
const REGIONS: [number, string][] = [
  [1, 'A only'],
  [2, 'B only'],
  [4, 'C only'],
  [3, 'A and B only'],
  [5, 'A and C only'],
  [6, 'B and C only'],
  [7, 'A, B and C'],
  [0, 'outside every set']
];
const three = (v: FormValues) => v.sets === '3';
/** A region the drawing has: one of the two sets' unless there are three, outside only with the universal set. */
const hasRegion = (mask: number, v: FormValues) => (mask === 0 ? v.universe === true : three(v) || mask < 4);

const SHADES: [string, string][] = [
  ['black!20', 'Grey'],
  ['blue!25', 'Blue'],
  ['red!25', 'Red'],
  ['green!30', 'Green']
];

const fields: FormField[] = [
  { key: 'sets', label: 'Sets', kind: 'choice', options: [['2', 'Two'], ['3', 'Three']] },
  { key: 'a', label: 'First set’s name (A)', kind: 'text', hint: 'LaTeX, as in the document: $A$ for maths.' },
  { key: 'b', label: 'Second set’s name (B)', kind: 'text' },
  { key: 'c', label: 'Third set’s name (C)', kind: 'text', shown: three },
  { key: 'universe', label: 'Draw the universal set', kind: 'switch' },
  { key: 'u', label: 'Its name', kind: 'text', shown: (v) => v.universe === true },
  { key: 'shade', label: 'Shading', kind: 'choice', options: SHADES },
  ...REGIONS.flatMap(([mask, name]): FormField[] => [
    { key: `shade${mask}`, label: `Shade ${name}`, kind: 'switch', shown: (v) => hasRegion(mask, v) },
    { key: `text${mask}`, label: `Count or text in ${name}`, kind: 'text', shown: (v) => hasRegion(mask, v) }
  ])
];

export function vennCode(values: FormValues): DiagramCode {
  const circles = circlesOf(three(values) ? 3 : 2);
  const names = ['a', 'b', 'c'].slice(0, circles.length).map((key) => String(values[key] ?? '').trim());
  const regions = REGIONS.filter(([mask]) => hasRegion(mask, values));
  const [[x0, y0], [x1, y1]] = frameOf(circles);
  const frame = `(${num(x0)},${num(y0)}) rectangle (${num(x1)},${num(y1)})`;
  const fill = String(values.shade);
  const shaded = regions.filter(([mask]) => values[`shade${mask}`] === true).map(([mask]) => {
    const loops = regionLoops(circles, mask).map((loop) => loopPath(circles, loop));
    // outside: the frame with the sets cut out of it
    return mask === 0 ? `\\fill[${fill}, even odd rule] ${frame} ${loops.join(' ')};` : `\\fill[${fill}] ${loops.join(' ')};`;
  });
  // each name outside its circle, up and to the left, up and to the right, or down and to the right
  const LABEL_AT = [135, 45, 315];
  const texts = regions.flatMap(([mask]) => {
    const text = String(values[`text${mask}`] ?? '').trim();
    if (!text) return [];
    const [x, y] = labelPoint(circles, mask);
    return [`\\node at (${num(x)},${num(y)}) {${text}};`];
  });
  const universe = values.universe === true;
  const body = [
    '\\begin{tikzpicture}',
    ...shaded,
    ...circles.map((c) => `\\draw (${num(c.x)},${num(c.y)}) circle[radius=${num(c.r)}];`),
    ...(universe ? [`\\draw ${frame};`] : []),
    ...circles.flatMap((c, i) => {
      if (!names[i]) return [];
      const [x, y] = at(c, LABEL_AT[i]);
      return [`\\node[anchor=${(LABEL_AT[i] + 180) % 360}] at (${num(x)},${num(y)}) {${names[i]}};`];
    }),
    ...(universe && String(values.u ?? '').trim() ? [`\\node[anchor=north west] at (${num(x0)},${num(y1)}) {${String(values.u).trim()}};`] : []),
    ...texts,
    '\\end{tikzpicture}',
    ''
  ];
  const all = [...names, String(values.u ?? ''), ...regions.map(([mask]) => String(values[`text${mask}`] ?? ''))];
  return { body: body.join('\n'), packages: ['tikz', ...mathsPackages(all)], libraries: [] };
}

export const venn: FormPreset = {
  id: 'venn',
  label: 'Venn diagram',
  fields,
  values: {
    sets: '2',
    a: '$A$',
    b: '$B$',
    c: '$C$',
    universe: true,
    u: '$U$',
    shade: 'black!20',
    ...Object.fromEntries(REGIONS.flatMap(([mask]) => [[`shade${mask}`, mask === 3], [`text${mask}`, '']]))
  },
  toCode: (values) => vennCode(values)
};
