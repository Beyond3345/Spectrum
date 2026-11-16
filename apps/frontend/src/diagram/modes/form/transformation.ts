// A linear transformation of the plane, a Form preset: a 2×2 matrix A, with the unit square (or a grid) before and
// after, the images of e1 and e2 (A's columns), the determinant, and the real eigenvectors as lines through the origin.
// Drawn as MATH2150's notes draw theirs: the original a blue dashed outline, its image red and thick over a light red
// fill, the eigenlines grey with v in black and Av coloured along them.
import { escapeTex } from '../shared';
import { at, fmt, pictureOf, results, RESULTS_FIELD, scene } from './fluids';
import type { Pt } from './fluids';
import { clipLine, plain, plane, viewOf } from './plane';
import type { FormField, FormPreset, FormValues } from './presets';

/** [[a, b], [c, d]] */
export type Matrix = { a: number; b: number; c: number; d: number };

/** A direction as the course writes an eigenvector: its smaller part ±1 and its first part positive, (1, −2). */
function tidy(v: Pt): Pt {
  const big = Math.max(Math.abs(v.x), Math.abs(v.y));
  const [x, y] = [Math.abs(v.x) < 1e-9 * big ? 0 : v.x, Math.abs(v.y) < 1e-9 * big ? 0 : v.y];
  const by = Math.min(...[x, y].filter(Boolean).map(Math.abs)) * Math.sign(x || y);
  return { x: x / by, y: y / by };
}

export type Eigen =
  | { kind: 'real'; values: [number, number]; vectors: [Pt, Pt] }
  /** one eigenvalue twice: a single line of eigenvectors, or (vector null) every vector, as for 2I */
  | { kind: 'repeated'; value: number; vector: Pt | null }
  | { kind: 'complex'; re: number; im: number };

/** The matrix's numbers: where e1 and e2 go, the determinant, and its eigenvalues with their real eigenvectors. */
export function linearMap({ a, b, c, d }: Matrix) {
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  const det = a * d - b * c;
  const trace = a + d;
  // λ² − (tr A)λ + det A = 0, whose discriminant is (a − d)² + 4bc
  const disc = (a - d) ** 2 + 4 * b * c;
  /** along the null space of A − λI: at right angles to its longer row */
  const vectorFor = (l: number) => {
    const row = Math.hypot(a - l, b) >= Math.hypot(c, d - l) ? { x: a - l, y: b } : { x: c, y: d - l };
    return tidy({ x: row.y, y: -row.x });
  };
  let eigen: Eigen;
  if (disc < -1e-12 * scale * scale) eigen = { kind: 'complex', re: trace / 2, im: Math.sqrt(-disc) / 2 };
  else if (disc <= 1e-12 * scale * scale) {
    const l = trace / 2;
    eigen = { kind: 'repeated', value: l, vector: Math.max(Math.abs(a - l), Math.abs(b), Math.abs(c), Math.abs(d - l)) <= 1e-9 * scale ? null : vectorFor(l) };
  } else {
    const values: [number, number] = [(trace + Math.sqrt(disc)) / 2, (trace - Math.sqrt(disc)) / 2];
    eigen = { kind: 'real', values, vectors: [vectorFor(values[0]), vectorFor(values[1])] };
  }
  return { det, trace, singular: Math.abs(det) <= 1e-12 * scale * scale, e1: { x: a, y: c }, e2: { x: b, y: d }, eigen };
}

const point = (p: Pt) => `(${fmt(p.x)}, ${fmt(p.y)})`;

/** The working, a line each: the columns, the determinant and what it says, the eigenvalues and eigenvectors. */
export function linearWorking(m: Matrix, name = 'A'): string[] {
  const r = linearMap(m);
  const area = fmt(Math.abs(r.det));
  const det = r.singular
    ? `singular, the plane is squashed onto ${Math.max(Math.abs(m.a), Math.abs(m.b), Math.abs(m.c), Math.abs(m.d)) ? 'a line' : 'the origin'}`
    : `areas are ${area === '1' ? 'kept' : `multiplied by ${area}`}${r.det < 0 ? ' and the plane is turned over' : ''}`;
  const e = r.eigen;
  const eigen =
    e.kind === 'complex'
      ? `no real eigenvectors: $\\lambda = ${fmt(e.re) === '0' ? '' : fmt(e.re)} \\pm ${fmt(e.im) === '1' ? '' : fmt(e.im)}i$`
      : e.kind === 'repeated'
        ? e.vector
          ? `$\\lambda = ${fmt(e.value)}$ twice, with one line of eigenvectors along $\\mathbf{v} = ${point(e.vector)}$`
          : `$\\lambda = ${fmt(e.value)}$ twice: every vector is an eigenvector`
        : e.values.map((l, i) => `$\\lambda_${i + 1} = ${fmt(l)}$ with $\\mathbf{v}_${i + 1} = ${point(e.vectors[i])}$`).join(', ');
  return [`$${name}\\mathbf{e}_1 = ${point(r.e1)}$, $${name}\\mathbf{e}_2 = ${point(r.e2)}$`, `$\\det ${name} = ${fmt(r.singular ? 0 : r.det)}$: ${det}`, eigen];
}

/** how far each way the grid runs */
const GRID = 2;

export function transformationDrawing(values: FormValues) {
  const m: Matrix = { a: Number(values.a11), b: Number(values.a12), c: Number(values.a21), d: Number(values.a22) };
  const r = linearMap(m);
  const name = escapeTex(String(values.name).trim()) || 'A';
  const show = (key: string) => values[key] === true;
  const T = (p: Pt): Pt => ({ x: m.a * p.x + m.b * p.y, y: m.c * p.x + m.d * p.y });
  const O = { x: 0, y: 0 };
  const square: Pt[] = [O, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const gridLines: [Pt, Pt][] =
    values.show === 'grid'
      ? Array.from({ length: 2 * GRID + 1 }, (_, i) => i - GRID).flatMap((i): [Pt, Pt][] => [
          [{ x: i, y: -GRID }, { x: i, y: GRID }],
          [{ x: -GRID, y: i }, { x: GRID, y: i }]
        ])
      : [];
  // each real eigenvector one unit long, with its eigenvalue and what its names end in
  const e = r.eigen;
  const along = (v: Pt, t: number): Pt => ({ x: (v.x * t) / Math.hypot(v.x, v.y), y: (v.y * t) / Math.hypot(v.x, v.y) });
  const eigen: { v: Pt; value: number; sub: string }[] = !show('eigen')
    ? []
    : e.kind === 'real'
      ? e.vectors.map((v, i) => ({ v: along(v, 1), value: e.values[i], sub: `_${i + 1}` }))
      : e.kind === 'repeated' && e.vector
        ? [{ v: along(e.vector, 1), value: e.value, sub: '' }]
        : [];

  const sc = scene();
  const view = viewOf([...square, ...square.map(T), ...gridLines.flat(), ...gridLines.flat().map(T), ...eigen.flatMap(({ v, value }) => [v, along(v, value)])], 1);
  const { P } = plane(sc, view, { ticks: show('ticks'), size: 6.5, most: 2.5 });
  const path = (pts: Pt[]) => pts.map((p) => at(P(p))).join(' -- ');

  if (gridLines.length) {
    sc.add('% The grid, before and after');
    sc.add(`\\draw[gray!40, very thin] ${gridLines.map((l) => path(l)).join(' ')};`);
    sc.add(`\\draw[red!45, thin] ${gridLines.map((l) => path(l.map(T))).join(' ')};`);
  }
  if (eigen.length) {
    sc.add('% The lines the eigenvectors lie along');
    for (const { v } of eigen) {
      const ends = clipLine(O, v, view);
      if (!ends) continue;
      sc.add(`\\draw[gray!55] ${path(ends)};`);
      sc.seg(ends.map(P));
    }
  }
  sc.add('% The unit square (dashed) and its image');
  sc.add(`\\fill[red!10] ${path(square.map(T))} -- cycle;`, `\\draw[blue, dashed] ${path(square)} -- cycle;`, `\\draw[red, thick] ${path(square.map(T))} -- cycle;`);
  sc.seg(square.map(P), true);
  sc.seg(square.map(T).map(P), true);

  /** an arrow from the origin, named at its tip on the side away from `from` (the shape it is an edge of) */
  const arrow = (to: Pt, style: string, tex: string, colour?: string) => {
    if (Math.hypot(to.x, to.y) < 1e-9) return;
    const [from, tip] = [P(O), P(to)];
    sc.add(`\\draw[->, ${style}] ${at(from)} -- ${at(tip)};`);
    sc.seg([from, tip]);
    sc.label(tip, tex, { x: tip.x - from.x, y: tip.y - from.y }, false, colour);
  };
  /** a vector and where it goes: both arrows, or one named for both when it stays where it is */
  const pair = (p: Pt, tex: string, colour: string, own: string, ownColour?: string) => {
    const image = T(p);
    const stays = Math.hypot(image.x - p.x, image.y - p.y) < 1e-9;
    arrow(image, `${colour}, very thick`, `$${name}${tex}${stays ? ` = ${tex}` : ''}$`, colour);
    if (!stays) arrow(p, own, `$${tex}$`, ownColour);
  };
  if (show('basis')) {
    sc.add('% e1 and e2, and where they go');
    pair({ x: 1, y: 0 }, '\\mathbf{e}_1', 'red', 'blue, thick', 'blue');
    pair({ x: 0, y: 1 }, '\\mathbf{e}_2', 'red', 'blue, thick', 'blue');
  }
  if (eigen.length) {
    sc.add('% Eigenvectors v, and Av along the same lines');
    eigen.forEach(({ v, sub }, i) => pair(v, `\\mathbf{v}${sub}`, i ? 'orange!80!black' : 'teal', 'thick'));
  }

  const working = linearWorking(m, name);
  const width = P({ x: view.x1, y: 0 }).x;
  if (show('results')) results(sc, width / 2, working);
  return { ...pictureOf(sc, [`Linear transformation: ${name} = [${fmt(m.a)} ${fmt(m.b)}; ${fmt(m.c)} ${fmt(m.d)}]`, ...working.map(plain)], false), map: r };
}

const entry = (key: string, label: string, hint?: string): FormField => ({ key, label, kind: 'number', min: -1000, max: 1000, ...(hint && { hint }) });

export const TRANSFORMATION: FormPreset = {
  id: 'transformation',
  label: 'Linear transformation',
  version5: true,
  fields: [
    entry('a11', 'a₁₁', 'The matrix is [a₁₁ a₁₂; a₂₁ a₂₂]. Its columns are where e₁ and e₂ go.'),
    entry('a12', 'a₁₂'),
    entry('a21', 'a₂₁'),
    entry('a22', 'a₂₂'),
    { key: 'name', label: 'Its name', kind: 'text', hint: 'Maths, without the dollar signs: A, R, H_x.' },
    { key: 'show', label: 'Before and after', kind: 'choice', options: [['square', 'The unit square'], ['grid', 'The unit square on a grid']] },
    { key: 'basis', label: 'Images of e₁ and e₂', kind: 'switch' },
    { key: 'eigen', label: 'Eigenvectors', kind: 'switch', hint: 'The real ones: their lines through the origin, with v and Av.' },
    { key: 'ticks', label: 'Numbers on the axes', kind: 'switch' },
    { ...RESULTS_FIELD, label: 'Write the working under the figure' }
  ],
  // the notes' shear then stretch (Section 4, composition): BA = [1 1; 0 2], the unit square to (1,0), (2,2), (1,2)
  values: { a11: 1, a12: 1, a21: 0, a22: 2, name: 'A', show: 'square', basis: true, eigen: true, ticks: true, results: true },
  toCode: (values) => transformationDrawing(values).code
};
