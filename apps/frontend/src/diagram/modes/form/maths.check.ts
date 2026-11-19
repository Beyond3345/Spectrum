// Self-check for the maths presets (conic section, linear transformation): their numbers against the worked examples
// in MATH2150SEF's notes, tutorials, practice paper and Assignment 1, the working they write, the drawings' labels
// clear of each other and of what's drawn, and the file version. Run:
// npx esbuild apps/frontend/src/diagram/modes/form/maths.check.ts --bundle --platform=node --log-level=warning | node
import { diagramFileText, readDiagramFile } from '../../fileFormat';
import { clashes } from '../structures/labels';
import { asymptotes, conic, conicDrawing, conicWorking, equationTex, lineTex, standardConic, CONIC } from './conics';
import type { Conic } from './conics';
import type { Pt } from './fluids';
import { clipLine, niceStep, viewOf } from './plane';
import { formCode, newFormModel } from './presets';
import { linearMap, linearWorking, transformationDrawing, TRANSFORMATION } from './transformation';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const close = (actual: number, expected: number, what: string, tolerance = 1e-9) => {
  if (!(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)))) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};
const at = (actual: Pt, x: number, y: number, what: string, tolerance = 1e-9) => {
  close(actual.x, x, `${what}, x`, tolerance);
  close(actual.y, y, `${what}, y`, tolerance);
};
/** two points, whichever way round */
const pair = (actual: [Pt, Pt], p: [number, number], q: [number, number], what: string, tolerance = 1e-9) => {
  const [first, second] = Math.hypot(actual[0].x - p[0], actual[0].y - p[1]) <= Math.hypot(actual[1].x - p[0], actual[1].y - p[1]) ? actual : [actual[1], actual[0]];
  at(first, p[0], p[1], what, tolerance);
  at(second, q[0], q[1], what, tolerance);
};
/** along the same line, either way */
const along = (v: Pt, x: number, y: number, what: string) => close((v.x * y - v.y * x) / (Math.hypot(v.x, v.y) * Math.hypot(x, y)), 0, what);
const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;
const of = (A: number, B: number, C: number, D: number, E: number, F: number) => conic({ A, B, C, D, E, F });
/** the conic, which must be of this kind */
function kind<K extends Conic['kind']>(q: Conic, k: K, what: string): Extract<Conic, { kind: K }> {
  eq(q.kind, k, what);
  return q as Extract<Conic, { kind: K }>;
}
const central = (q: Conic, k: 'circle' | 'ellipse' | 'hyperbola', what: string) => {
  eq(q.kind, k, what);
  return q as Conic & { centre: Pt; a: number; b: number; c: number; e: number; axis: Pt; foci: [Pt, Pt]; vertices: [Pt, Pt] };
};

// ─── Conics with an xy term ───
{
  // Notes, Section 5, Example “Ellipse with a cross term” (the Eigenvectors deck's question, p53–54):
  // 5x² + 4xy + 5y² + 20x + 8y − 1 = 0. Eigenvalues 7 and 3 along (1,1)/√2 and (−1,1)/√2, the linear row (14√2, −6√2),
  // 7(u + √2)² + 3(v − √2)² = 21, that is (u + √2)²/3 + (v − √2)²/7 = 1, centre (−2, 0) in the original axes
  const q = central(of(5, 4, 5, 20, 8, -1), 'ellipse', 'cross-term ellipse');
  close(q.theta, 45, 'turned 45°');
  eq([round(q.l1, 9), round(q.l2, 9)], [7, 3], 'eigenvalues 7 and 3');
  close(q.g1, 14 * Math.SQRT2, 'linear row, u');
  close(q.g2, -6 * Math.SQRT2, 'linear row, v');
  at(q.centre, -2, 0, 'centre (−2, 0)');
  close(q.a, Math.sqrt(7), 'a = √7');
  close(q.b, Math.sqrt(3), 'b = √3');
  along(q.axis, -1, 1, 'the major axis along V');
  close(q.c, 2, 'c = 2');
  close(q.e, 2 / Math.sqrt(7), 'e');
  pair(q.foci, [-2 - Math.SQRT2, Math.SQRT2], [-2 + Math.SQRT2, -Math.SQRT2], 'foci');
  eq(conicWorking(q), [
    'Ellipse: $B^2 - 4AC = -84 < 0$',
    'axes turned by $\\theta = 45^\\circ$, where $\\cot 2\\theta = \\frac{A - C}{B}$',
    '$7(U + 1.414)^2 + 3(V - 1.414)^2 = 21$',
    '$\\frac{(U + 1.414)^2}{3} + \\frac{(V - 1.414)^2}{7} = 1$',
    'centre $C(-2, 0)$, $a = 2.646$, $b = 1.732$, $c = 2$, $e = 0.7559$'
  ], 'the working, as the notes complete the squares');
  // every point of the curve the picture samples satisfies the equation
  const f = (p: Pt) => 5 * p.x * p.x + 4 * p.x * p.y + 5 * p.y * p.y + 20 * p.x + 8 * p.y - 1;
  for (const t of [0, 1, 2, 3, 4, 5]) close(f({ x: q.centre.x + q.axis.x * q.a * Math.cos(t) - q.axis.y * q.b * Math.sin(t), y: q.centre.y + q.axis.y * q.a * Math.cos(t) + q.axis.x * q.b * Math.sin(t) }), 0, `a point on it, t = ${t}`, 1e-9);

  // Notes, Section 1: “xy = 1 is a hyperbola whose axes are rotated by 45°”: a = b = √2, foci (±√2, ±√2), and its
  // asymptotes are the coordinate axes
  const h = central(of(0, 1, 0, 0, 0, -1), 'hyperbola', 'xy = 1');
  close(h.theta, 45, 'xy = 1 turned 45°');
  eq([round(h.a, 9), round(h.b, 9), round(h.c, 9), round(h.e, 9)], [round(Math.SQRT2, 9), round(Math.SQRT2, 9), 2, round(Math.SQRT2, 9)], 'xy = 1: a, b, c, e');
  pair(h.foci, [-Math.SQRT2, -Math.SQRT2], [Math.SQRT2, Math.SQRT2], 'xy = 1 foci');
  pair(h.vertices, [-1, -1], [1, 1], 'xy = 1 vertices');
  eq(asymptotes(h).map((d) => lineTex(h.centre, d)).sort(), ['x = 0', 'y = 0'], 'xy = 1: the axes are its asymptotes');
  // a hyperbola with a cross term, from the same method: x² + 4xy + y² = 3 is 3u² − v² = 3
  const r = central(of(1, 4, 1, 0, 0, -3), 'hyperbola', 'x² + 4xy + y² = 3');
  eq([round(r.l1, 9), round(r.l2, 9), round(r.a, 9), round(r.b, 9), round(r.c, 9)], [3, -1, 1, round(Math.sqrt(3), 9), 2], 'its eigenvalues and semi-axes');
  // a parabola with a cross term: x² − 2xy + y² − 8x − 8y = 0 is v² = 4√2 u, vertex at the origin, opening along (1, 1)
  const p = kind(of(1, -2, 1, -8, -8, 0), 'parabola', 'a turned parabola');
  at(p.vertex, 0, 0, 'its vertex');
  close(p.a, Math.SQRT2, 'its focal length');
  at(p.focus, 1, 1, 'its focus');
  eq(lineTex(p.foot, { x: -p.axis.y, y: p.axis.x }), 'y = -x - 2', 'its directrix');
}

// ─── Tutorial 1, “Classifying four conics” (also the notes' Example, Section 1) ───
{
  // (a) x² + y² − 8x + 2y − 19 = 0: a circle, centre (4, −1), radius 6
  const a = central(of(1, 0, 1, -8, 2, -19), 'circle', 'T1(a)');
  at(a.centre, 4, -1, 'T1(a) centre');
  close(a.a, 6, 'T1(a) radius');
  eq(conicWorking(a), ['Circle: $B^2 - 4AC = -4 < 0$', '$(x - 4)^2 + (y + 1)^2 = 36$', 'centre $C(4, -1)$, radius $6$'], 'T1(a) working');
  // (b) x² + 2y² − 4x + 3y − 15 = 0: (x − 2)² + 2(y + 3/4)² = 161/8; centre (2, −3/4), a ≈ 4.49, b ≈ 3.17,
  // c = √161/4, foci ≈ (5.17, −0.75) and (−1.17, −0.75)
  const b = central(of(1, 0, 2, -4, 3, -15), 'ellipse', 'T1(b)');
  at(b.centre, 2, -0.75, 'T1(b) centre');
  close(b.a, Math.sqrt(161 / 8), 'T1(b) a');
  close(b.b, Math.sqrt(161) / 4, 'T1(b) b');
  close(b.c, Math.sqrt(161) / 4, 'T1(b) c');
  eq([round(b.a, 2), round(b.b, 2), b.foci.map((f) => [round(f.x, 2), f.y])], [4.49, 3.17, [[-1.17, -0.75], [5.17, -0.75]]], 'T1(b) as the tutorial rounds them');
  eq(conicWorking(b)[1], '$(x - 2)^2 + 2(y + 0.75)^2 = 20.13$', 'T1(b) completed squares (161/8)');
  // (c) x² − 2y² − 4x + 3y + 1 = 0: (x − 2)² − 2(y − 3/4)² = 15/8; centre (2, 3/4), a ≈ 1.37, b ≈ 0.968, vertices
  // ≈ (3.37, 0.75) and (0.63, 0.75), asymptotes y − 3/4 = ±(x − 2)/√2, c = 3√5/4, foci ≈ (3.68, 0.75) and (0.32, 0.75)
  const c = central(of(1, 0, -2, -4, 3, 1), 'hyperbola', 'T1(c)');
  at(c.centre, 2, 0.75, 'T1(c) centre');
  close(c.a, Math.sqrt(15 / 8), 'T1(c) a');
  close(c.b, Math.sqrt(15 / 16), 'T1(c) b');
  close(c.c, (3 * Math.sqrt(5)) / 4, 'T1(c) c');
  eq([c.vertices.map((p) => round(p.x, 2)), c.foci.map((p) => round(p.x, 2))], [[0.63, 3.37], [0.32, 3.68]], 'T1(c) vertices and foci');
  eq(asymptotes(c).map((d) => round(d.y / d.x, 5)).sort(), [-0.70711, 0.70711], 'T1(c) asymptotes of slope ±1/√2');
  for (const d of asymptotes(c)) close(c.centre.y + (d.y / d.x) * (5 - c.centre.x), 0.75 + (d.y / d.x) * 3, 'through the centre');
  eq(conicWorking(c).slice(-1), ['asymptotes $y = 0.7071x - 0.6642$ and $y = -0.7071x + 2.164$'], 'T1(c) asymptotes written out');
  // (d) x² − 4x + 3y − 1 = 0: (x − 2)² = −3(y − 5/3); vertex (2, 5/3), 4a = 3, focus (2, 11/12), directrix y = 29/12
  const d = kind(of(1, 0, 0, -4, 3, -1), 'parabola', 'T1(d)');
  at(d.vertex, 2, 5 / 3, 'T1(d) vertex');
  close(d.a, 0.75, 'T1(d) a');
  at(d.axis, 0, -1, 'T1(d) opens downwards');
  at(d.focus, 2, 11 / 12, 'T1(d) focus');
  at(d.foot, 2, 29 / 12, 'T1(d) directrix y = 29/12');
  eq(conicWorking(d), ['Parabola: $B^2 - 4AC = 0$', '$(x - 2)^2 = -3(y - 1.667)$', 'vertex $V(2, 1.667)$, $4a = 3$, $a = 0.75$, focus $F(2, 0.9167)$', 'directrix $y = 2.417$, $e = 1$'], 'T1(d) working');
}

// ─── Tutorial 1, the second “Classifying four conics” ───
{
  // (a) −x² + y² − 19 = 0: y²/19 − x²/19 = 1, vertices (0, ±√19), asymptotes y = ±x, foci (0, ±√38)
  const a = central(of(-1, 0, 1, 0, 0, -19), 'hyperbola', 'T1b(a)');
  pair(a.vertices, [0, -Math.sqrt(19)], [0, Math.sqrt(19)], 'T1b(a) vertices');
  pair(a.foci, [0, -Math.sqrt(38)], [0, Math.sqrt(38)], 'T1b(a) foci');
  eq(asymptotes(a).map((d) => lineTex(a.centre, d)).sort(), ['y = -x', 'y = x'], 'T1b(a) asymptotes y = ±x');
  eq(conicWorking(a)[2], '$\\frac{y^2}{19} - \\frac{x^2}{19} = 1$', 'T1b(a) opens up and down');
  // (b) 2x² + 2y² + 3y − 15 = 0: a circle, centre (0, −3/4), radius √129/4
  const b = central(of(2, 0, 2, 0, 3, -15), 'circle', 'T1b(b)');
  at(b.centre, 0, -0.75, 'T1b(b) centre');
  close(b.a, Math.sqrt(129) / 4, 'T1b(b) radius');
  // (c) 19x² + 2y² − 4x + 3y + 1 = 0: a small ellipse, centre (2/19, −3/4), semi-axes √102/76 along x and √969/76
  // along y, c = 17√3/76, foci ≈ (0.105, −0.363) and (0.105, −1.137); with + 2 in place of + 1, no real points
  const c = central(of(19, 0, 2, -4, 3, 1), 'ellipse', 'T1b(c)');
  at(c.centre, 2 / 19, -0.75, 'T1b(c) centre');
  close(c.b, Math.sqrt(102) / 76, 'T1b(c) semi-axis along x');
  close(c.a, Math.sqrt(969) / 76, 'T1b(c) semi-axis along y');
  at(c.axis, 0, 1, 'T1b(c) major axis vertical', 1e-9);
  close(c.c, (17 * Math.sqrt(3)) / 76, 'T1b(c) c');
  eq(c.foci.map((f) => [round(f.x, 3), round(f.y, 3)]), [[0.105, -1.137], [0.105, -0.363]], 'T1b(c) foci');
  eq(of(19, 0, 2, -4, 3, 2).kind, 'none', 'T1b(c) with + 2: no real points');
  // (d) y² − x + y − 1 = 0: (y + 1/2)² = x + 5/4; vertex (−5/4, −1/2), focus (−1, −1/2), directrix x = −3/2
  const d = kind(of(0, 0, 1, -1, 1, -1), 'parabola', 'T1b(d)');
  at(d.vertex, -1.25, -0.5, 'T1b(d) vertex');
  at(d.focus, -1, -0.5, 'T1b(d) focus');
  eq(conicWorking(d).slice(1), ['$(y + 0.5)^2 = (x + 1.25)$', 'vertex $V(-1.25, -0.5)$, $4a = 1$, $a = 0.25$, focus $F(-1, -0.5)$', 'directrix $x = -1.5$, $e = 1$'], 'T1b(d) working');
}

// ─── Practice 1: the parabola and the ellipse ───
{
  // (y − 2)² = 8(x − 1), that is y² − 8x − 4y + 12 = 0: vertex (1, 2), focus (3, 2), directrix x = −1, opening right
  const p = kind(of(0, 0, 1, -8, -4, 12), 'parabola', 'Practice 1 parabola');
  at(p.vertex, 1, 2, 'Practice 1 vertex');
  at(p.focus, 3, 2, 'Practice 1 focus');
  at(p.axis, 1, 0, 'Practice 1 opens to the right');
  eq(lineTex(p.foot, { x: -p.axis.y, y: p.axis.x }), 'x = -1', 'Practice 1 directrix');
  // 9(x − 1)² + 4(y + 2)² = 36, that is 9x² + 4y² − 18x + 16y − 11 = 0: centre (1, −2), major axis vertical, a = 3,
  // b = 2, c = √5, vertices (1, 1) and (1, −5), foci (1, −2 ± √5), eccentricity √5/3
  const e = central(of(9, 0, 4, -18, 16, -11), 'ellipse', 'Practice 1 ellipse');
  at(e.centre, 1, -2, 'Practice 1 centre');
  eq([round(e.a, 9), round(e.b, 9)], [3, 2], 'Practice 1 a and b');
  close(e.c, Math.sqrt(5), 'Practice 1 c');
  close(e.e, Math.sqrt(5) / 3, 'Practice 1 eccentricity');
  pair(e.vertices, [1, -5], [1, 1], 'Practice 1 vertices');
  pair(e.foci, [1, -2 - Math.sqrt(5)], [1, -2 + Math.sqrt(5)], 'Practice 1 foci');
}

// ─── Degenerate cases: the notes' remark after the classification theorem, and Assignment 1, A4 ───
{
  eq(of(1, 0, 1, 0, 0, 1).kind, 'none', 'x² + y² + 1 = 0 has no real points');
  eq(conicWorking(of(1, 0, 1, 0, 0, 1)), ['No real points, so nothing to draw: $B^2 - 4AC = -4 < 0$', '$x^2 + y^2 = -1$'], 'and says so');
  at(kind(of(1, 0, 2, 0, 0, 0), 'point', 'x² + 2y² = 0').centre, 0, 0, 'the single point (0, 0)');
  eq(conicWorking(of(1, 0, 2, 0, 0, 0)), ['A single point, not a curve (a degenerate ellipse): $B^2 - 4AC = -8 < 0$', '$x^2 + 2y^2 = 0$', 'only $(0, 0)$ satisfies it'], 'the point, said plainly');
  const lines = kind(of(1, 0, -1, 0, 0, 0), 'lines', 'x² − y² = 0');
  eq(lines.dirs.map((d) => lineTex(lines.centre, d)).sort(), ['y = -x', 'y = x'], 'the pair of lines y = ±x');
  eq(conicWorking(lines)[2], 'the lines $y = x$ and $y = -x$, crossing at $(0, 0)$', 'the lines, said plainly');
  // A4: x² + (k − 1)y² − 4x + 2(k − 1)y + (k + 2) = 0 is (x − 2)² + (k − 1)(y + 1)² = 1
  const a4 = (k: number) => of(1, 0, k - 1, -4, 2 * (k - 1), k + 2);
  // k = 1: x² − 4x + 3 = 0, the parallel lines x = 1 and x = 3, “a degenerate parabola”
  const k1 = kind(a4(1), 'parallel', 'A4, k = 1');
  eq(k1.through.map((p) => lineTex(p, k1.dir)), ['x = 1', 'x = 3'], 'A4, k = 1: x = 1 and x = 3');
  eq(conicWorking(k1), ['Two parallel lines (a degenerate parabola): $B^2 - 4AC = 0$', '$(x - 2)^2 = 1$', 'the lines $x = 1$ and $x = 3$'], 'A4, k = 1 working');
  // k = 2: the circle (x − 2)² + (y + 1)² = 1; k = 5: the ellipse of semi-axes 1 and 1/2; k < 1: a hyperbola, all about (2, −1)
  const k2 = central(a4(2), 'circle', 'A4, k = 2');
  eq([round(k2.centre.x, 9), round(k2.centre.y, 9), round(k2.a, 9)], [2, -1, 1], 'A4, k = 2: centre (2, −1), radius 1');
  const k5 = central(a4(5), 'ellipse', 'A4, k = 5');
  eq([round(k5.centre.x, 9), round(k5.centre.y, 9), round(k5.a, 9), round(k5.b, 9), round(k5.axis.x, 9)], [2, -1, 1, 0.5, 1], 'A4, k = 5: semi-axes 1 along x and 1/2');
  const k0 = central(a4(0), 'hyperbola', 'A4, k = 0');
  eq([round(k0.centre.x, 9), round(k0.centre.y, 9), round(k0.a, 9), round(k0.axis.x, 9)], [2, -1, 1, 1], 'A4, k < 1: transverse axis parallel to the x-axis');
  // one line twice, a parabola's equation with no real points, and no second-degree term at all
  eq([of(1, 0, 0, -4, 0, 4).kind, of(1, 0, 0, -4, 0, 5).kind], ['line', 'none'], '(x − 2)² = 0 and (x − 2)² = −1');
  eq(conicWorking(of(0, 0, 0, 1, 2, -4)), ['Not a conic (no $x^2$, $xy$ or $y^2$ term): the straight line $y = -0.5x + 2$'], 'x + 2y − 4 = 0 is a line');
  eq(conicWorking(of(0, 0, 0, 0, 0, 1)), ['Not a conic: the equation has no $x$ or $y$'], 'nothing at all');
}

// ─── From a conic's own numbers: the notes' three figures ───
{
  const own = { kind: 'ellipse', h: 0, k: 0, a: 1, b: 1, axis: 'x', opens: 'right', turn: 0 } as const;
  // y² = 4ax with a = 1: focus F(1, 0), directrix x = −1, and (2.25, 3) is 3.25 from both
  const p = kind(conic(standardConic({ ...own, kind: 'parabola' })), 'parabola', 'y² = 4x');
  at(p.focus, 1, 0, 'y² = 4x focus');
  at(p.foot, -1, 0, 'y² = 4x directrix');
  eq([Math.hypot(2.25 - p.focus.x, 3 - p.focus.y), 2.25 - p.foot.x], [3.25, 3.25], 'the point (2.25, 3)');
  // the ellipse of semi-axes 3 and 2: F1 and F2 at (±2.236, 0)
  const e = central(conic(standardConic({ ...own, a: 3, b: 2 })), 'ellipse', 'ellipse (3 and 2)');
  eq(e.foci.map((f) => round(f.x, 3)), [-2.236, 2.236], 'its foci');
  // the hyperbola a = 1.5, b = 1: foci (±1.803, 0), asymptotes through (4.8, ±3.2)
  const h = central(conic(standardConic({ ...own, kind: 'hyperbola', a: 1.5, b: 1 })), 'hyperbola', 'hyperbola (1.5 and 1)');
  eq(h.foci.map((f) => round(f.x, 3)), [-1.803, 1.803], 'its foci');
  eq(asymptotes(h).map((d) => round((d.y / d.x) * 4.8, 9)).sort(), [-3.2, 3.2], 'its asymptotes');
  // given by its own numbers, there was no discriminant to read and no square to complete
  eq(conicWorking(h, true), ['Hyperbola: $\\frac{x^2}{2.25} - \\frac{y^2}{1} = 1$', 'centre $C(0, 0)$, $a = 1.5$, $b = 1$, $c = 1.803$, $e = 1.202$', 'asymptotes $y = 0.6667x$ and $y = -0.6667x$'], 'its working');
  eq(conicWorking(p, true), ['Parabola: $y^2 = 4x$', 'vertex $V(0, 0)$, $4a = 4$, $a = 1$, focus $F(1, 0)$', 'directrix $x = -1$, $e = 1$'], 'y² = 4x working');
  // each parabola opens the way it says, each hyperbola along its axis
  eq((['right', 'left', 'up', 'down'] as const).map((opens) => kind(conic(standardConic({ ...own, kind: 'parabola', opens })), 'parabola', opens).axis).map((d) => [round(d.x, 9), round(d.y, 9)]), [[1, 0], [-1, 0], [0, 1], [0, -1]], 'opens');
  at(central(conic(standardConic({ ...own, kind: 'hyperbola', axis: 'y' })), 'hyperbola', 'axis y').axis, 0, 1, 'a hyperbola opening up and down');
  // turned and moved, it is the notes' cross-term ellipse again: semi-axes √3 and √7 about (−2, 0), turned 45°
  const again = standardConic({ ...own, h: -2, k: 0, a: Math.sqrt(3), b: Math.sqrt(7), turn: 45 });
  eq([again.A, again.B, again.C, again.D, again.E, again.F].map((v) => round((v * 5) / again.A, 9)), [5, 4, 5, 20, 8, -1], '5x² + 4xy + 5y² + 20x + 8y − 1 = 0, to a factor');
  eq(equationTex({ A: 5, B: 4, C: 5, D: 20, E: 8, F: -1 }), '5x^2 + 4xy + 5y^2 + 20x + 8y - 1 = 0', 'the equation written out');
  eq(equationTex({ A: 1, B: -1, C: 0, D: 0, E: -1, F: 0 }), 'x^2 - xy - y = 0', 'ones and zeros left out');
}

// ─── Linear transformations ───
{
  const map = (a: number, b: number, c: number, d: number) => linearMap({ a, b, c, d });
  const real = (m: ReturnType<typeof linearMap>, what: string) => {
    eq(m.eigen.kind, 'real', what);
    return m.eigen as Extract<ReturnType<typeof linearMap>['eigen'], { kind: 'real' }>;
  };
  // Notes, Section 4, the horizontal shear H_x(1) = [1 1; 0 1]: the unit square goes to (1,0), (2,1), (1,1), and
  // “both have determinant 1”; its only eigenvalue is 1, along the x-axis
  const shear = map(1, 1, 0, 1);
  eq([shear.e1, shear.e2, shear.det], [{ x: 1, y: 0 }, { x: 1, y: 1 }, 1], 'shear: columns and determinant');
  eq(shear.eigen, { kind: 'repeated', value: 1, vector: { x: 1, y: 0 } }, 'shear: one line of eigenvectors');
  eq(linearWorking({ a: 1, b: 1, c: 0, d: 1 }, 'H'), ['$H\\mathbf{e}_1 = (1, 0)$, $H\\mathbf{e}_2 = (1, 1)$', '$\\det H = 1$: areas are kept', '$\\lambda = 1$ twice, with one line of eigenvectors along $\\mathbf{v} = (1, 0)$'], 'shear working');
  // Tutorial 8, Q5 (3) and (4): [1 2; 0 1] is (x, y) → (x + 2y, y), [1 0; 3 1] is (x, y) → (x, 3x + y)
  eq([map(1, 2, 0, 1).e2, map(1, 0, 3, 1).e1, map(1, 0, 3, 1).eigen], [{ x: 2, y: 1 }, { x: 1, y: 3 }, { kind: 'repeated', value: 1, vector: { x: 0, y: 1 } }], 'the two shears');

  // Notes, Section 4, R(45°): the square's corners go to (0.707, 0.707) and (−0.707, 0.707); no real eigenvectors.
  // Section 5: the quarter-turn [0 −1; 1 0] has polynomial λ² + 1, so no real eigenline, and eigenvalues ±i
  const turn = map(Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2);
  eq([round(turn.e1.x, 3), round(turn.e1.y, 3), round(turn.e2.x, 3), round(turn.e2.y, 3), round(turn.det, 12), turn.eigen.kind], [0.707, 0.707, -0.707, 0.707, 1, 'complex'], 'rotation by 45°');
  eq(map(0, -1, 1, 0).eigen, { kind: 'complex', re: 0, im: 1 }, 'the quarter-turn: ±i');
  eq(linearWorking({ a: 0, b: -1, c: 1, d: 0 })[2], 'no real eigenvectors: $\\lambda =  \\pm i$', 'and says so');

  // Tutorial 8, Q6: reflection in y = x is [0 1; 1 0] with T(1,0) = (0,1); in y = 3x it is (1/5)[−4 3; 3 4] with
  // T(1,0) = (−4/5, 3/5) and T(0,1) = (3/5, 4/5). It fixes (1, m) and reverses (−m, 1); determinant −1
  const mirror = map(-0.8, 0.6, 0.6, 0.8);
  eq([mirror.e1, mirror.e2, round(mirror.det, 12)], [{ x: -0.8, y: 0.6 }, { x: 0.6, y: 0.8 }, -1], 'reflection in y = 3x');
  eq(real(mirror, 'reflection').values.map((l) => round(l, 12)), [1, -1], 'its eigenvalues 1 and −1');
  along(real(mirror, 'reflection').vectors[0], 1, 3, 'fixed along (1, 3)');
  along(real(mirror, 'reflection').vectors[1], -3, 1, 'reversed along (−3, 1)');
  eq([map(0, 1, 1, 0).e1, map(0, 1, 1, 0).det, real(map(0, 1, 1, 0), 'y = x').vectors], [{ x: 0, y: 1 }, -1, [{ x: 1, y: 1 }, { x: 1, y: -1 }]], 'reflection in y = x');
  eq(linearWorking({ a: 0, b: 1, c: 1, d: 0 })[1], '$\\det A = -1$: areas are kept and the plane is turned over', 'a reflection turns the plane over');

  // Tutorial 9, Q7 (2): [2 6; 1 3] has polynomial λ(λ − 5): (−3, 1) at 0 and (2, 1) at 5; it is singular
  const flat = map(2, 6, 1, 3);
  eq([flat.det, flat.singular, real(flat, 'singular').values], [0, true, [5, 0]], 'singular: determinant 0, eigenvalues 5 and 0');
  along(real(flat, 'singular').vectors[0], 2, 1, '(2, 1) at 5');
  along(real(flat, 'singular').vectors[1], -3, 1, '(−3, 1) at 0');
  eq(linearWorking({ a: 2, b: 6, c: 1, d: 3 }), ['$A\\mathbf{e}_1 = (2, 1)$, $A\\mathbf{e}_2 = (6, 3)$', '$\\det A = 0$: singular, the plane is squashed onto a line', '$\\lambda_1 = 5$ with $\\mathbf{v}_1 = (2, 1)$, $\\lambda_2 = 0$ with $\\mathbf{v}_2 = (3, -1)$'], 'singular working');
  eq(linearWorking({ a: 0, b: 0, c: 0, d: 0 }).slice(1), ['$\\det A = 0$: singular, the plane is squashed onto the origin', '$\\lambda = 0$ twice: every vector is an eigenvector'], 'the zero matrix');

  // Notes, Section 5, “Two different eigenspaces”: [4 1; 2 3] has E_2 = span{(1, −2)} and E_5 = span{(1, 1)}
  eq(real(map(4, 1, 2, 3), 'eigenspaces'), { kind: 'real', values: [5, 2], vectors: [{ x: 1, y: 1 }, { x: 1, y: -2 }] }, '[4 1; 2 3]');
  // Tutorial 9, Q7 (1): [1 10; 5 6] is (λ − 11)(λ + 4): (1, 1) at 11 and (−2, 1) at −4
  eq(real(map(1, 10, 5, 6), 'T9 Q7(1)'), { kind: 'real', values: [11, -4], vectors: [{ x: 1, y: 1 }, { x: 2, y: -1 }] }, '[1 10; 5 6]');
  // Tutorial 9, Q6 (1): (3, 1) is an eigenvector of [7 3; 3 −1] with eigenvalue 8
  eq([real(map(7, 3, 3, -1), 'T9 Q6(1)').values[0], real(map(7, 3, 3, -1), 'T9 Q6(1)').vectors[0]], [8, { x: 3, y: 1 }], '[7 3; 3 −1]');
  // Notes: [1 1; 4 1] has 3 and −1 with v2 = ±2v1; the symmetric [1 4; 4 1] has 5 and −3 along (1, 1) and (−1, 1)
  eq(real(map(1, 1, 4, 1), '[1 1; 4 1]'), { kind: 'real', values: [3, -1], vectors: [{ x: 1, y: 2 }, { x: 1, y: -2 }] }, '[1 1; 4 1]');
  eq(real(map(1, 4, 4, 1), '[1 4; 4 1]'), { kind: 'real', values: [5, -3], vectors: [{ x: 1, y: 1 }, { x: 1, y: -1 }] }, '[1 4; 4 1]');
  // Notes, “Repeated roots”: [1 4; −4 −7] is (λ + 3)², with E_−3 = span{(1, −1)} of dimension one
  eq(map(1, 4, -4, -7).eigen, { kind: 'repeated', value: -3, vector: { x: 1, y: -1 } }, '[1 4; −4 −7]');
  // Notes, PCA: [7 −3; −3 1] has 4 ± 3√2 along (1, 1 − √2) and (1, 1 + √2), and determinant −2
  const pca = map(7, -3, -3, 1);
  eq([pca.det, real(pca, 'PCA').values.map((l) => round(l, 9))], [-2, [round(4 + 3 * Math.SQRT2, 9), round(4 - 3 * Math.SQRT2, 9)]], '[7 −3; −3 1]');
  along(real(pca, 'PCA').vectors[0], 1, 1 - Math.SQRT2, '(1, 1 − √2)');
  along(real(pca, 'PCA').vectors[1], 1, 1 + Math.SQRT2, '(1, 1 + √2)');
  // Notes, Section 4, composition: BA = [1 1; 0 2] sends the square to (1,0), (2,2), (1,2), with determinant 2
  const ba = map(1, 1, 0, 2);
  eq([ba.e1, ba.e2, { x: ba.e1.x + ba.e2.x, y: ba.e1.y + ba.e2.y }, ba.det], [{ x: 1, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 2 }, 2], 'shear then stretch');
  // S = 2I: every vector is an eigenvector, and areas are multiplied by 4
  eq([map(2, 0, 0, 2).eigen, linearWorking({ a: 2, b: 0, c: 0, d: 2 }, 'S')[1]], [{ kind: 'repeated', value: 2, vector: null }, '$\\det S = 4$: areas are multiplied by 4'], 'uniform scaling');
}

// ─── The plane they are drawn on ───
eq([niceStep(0.13), niceStep(0.3), niceStep(0.6), niceStep(8)], [0.1, 0.2, 0.5, 10], 'steps of 1, 2 and 5');
eq(clipLine({ x: 0, y: 0 }, { x: 1, y: 1 }, { x0: -1, x1: 2, y0: -3, y1: 3 }), [{ x: -1, y: -1 }, { x: 2, y: 2 }], 'a line cut to the view');
eq(clipLine({ x: 5, y: 0 }, { x: 0, y: 1 }, { x0: -1, x1: 2, y0: -3, y1: 3 }), null, 'a line that misses it');
// the origin is in view when it is near, and left out when the conic is far from it
eq([viewOf([{ x: 1, y: 1 }, { x: 3, y: 2 }]).x0 < 0, viewOf([{ x: 100, y: 100 }, { x: 103, y: 102 }]).x0 > 0], [true, true], 'the origin in view');

// ─── Drawings: what is shown or hidden, the labels clear, the notes' ways of drawing ───
const g = (A: number, B: number, C: number, D: number, E: number, F: number, more = {}) => ({ ...CONIC.values, A, B, C, D, E, F, ...more });
{
  const body = conicDrawing(CONIC.values).code.body;
  eq(body.includes('\\draw[very thick, teal, rotate around={135:(3.5,3.5)}] (3.5,3.5) ellipse [x radius=3.341, y radius=2.187];'), true, 'the ellipse, thick and teal, turned to its axes');
  eq((body.match(/\\draw\[red, line width=0.8pt\]/g) ?? []).length, 2, 'two foci as red crosses');
  eq((body.match(/\\draw\[->, dashed\]/g) ?? []).length, 2, 'the turned axes dashed');
  eq(['{$U$}', '{$V$}', '{$C$}', '{$F_1$}', '{$F_2$}', '{$V_1$}', '{$V_2$}'].filter((name) => !body.includes(name)), [], 'named: the turned axes U and V as the notes draw them, the centre, foci and vertices');
  // not A and B, the letters of B² − 4AC in the working under it
  eq(body.match(/\{\$[AB]\$\}/g), null, 'no point named A or B');
  eq(body.includes('% centre C(-2, 0), a = 2.646, b = 1.732, c = 2, e = 0.7559'), true, 'the working in the code’s comments');
  const hidden = conicDrawing({ ...CONIC.values, foci: false, vertices: false, axes: false, ticks: false, results: false }).code.body;
  eq([/red/.test(hidden), /dashed/.test(hidden), /\$V_/.test(hidden), /foreach/.test(hidden), /align=center/.test(hidden)], [false, false, false, false, false], 'each can be hidden');
  const hyperbola = conicDrawing(g(1, 0, -2, -4, 3, 1)).code.body;
  eq([(hyperbola.match(/\\draw\[dashed, gray\]/g) ?? []).length, (hyperbola.match(/cosh/g) ?? []).length], [2, 2], 'a hyperbola’s asymptotes dashed grey, and both branches');
  eq(/dashed, gray/.test(conicDrawing(g(1, 0, -2, -4, 3, 1, { asymptotes: false })).code.body), false, 'asymptotes hidden');
  const parabola = conicDrawing(g(1, 0, 0, -4, 3, -1)).code.body;
  eq([(parabola.match(/\\draw\[dashed, gray\]/g) ?? []).length, parabola.includes('{directrix}'), parabola.includes('{$V$}'), parabola.includes('{$F$}')], [1, true, true, true], 'a parabola’s directrix dashed grey, its vertex and focus');
  eq(/dashed, gray/.test(conicDrawing(g(1, 0, 0, -4, 3, -1, { directrix: false })).code.body), false, 'directrix hidden');
  // ─── names: typed, switched, hidden, and kept apart ───
  const named = (more: object, A = 5, B = 4, C = 5, D = 20, E = 8, F = -1) => conicDrawing(g(A, B, C, D, E, F, more)).code.body;
  const lower = named({ axisNames: 'uv' });
  eq([lower.includes('{$u$}'), lower.includes('{$v$}'), lower.includes('$7(u + 1.414)^2 + 3(v - 1.414)^2 = 21$'), lower.includes('% 7(u + 1.414)^2')], [true, true, true, true], 'u and v: the axes, the working and the comments');
  const typed = named({ axisNames: 'own', axisU: "X'", axisV: "Y'", centre: 'O', vertex1: 'A_1', vertex2: 'A_2', focus1: 'S', focus2: "S'" });
  eq(["{$X'$}", "{$Y'$}", '{$O$}', '{$A_1$}', '{$A_2$}', '{$S$}', "{$S'$}", "7(X' + 1.414)^2", "centre $O(-2, 0)$"].filter((name) => !typed.includes(name)), [], 'every name typed, in the figure and the working');
  eq(named({ axisNames: 'own', axisU: "X'", centre: '', coordinates: true }).match(/\{\$\((-2, 0)\)\$\}|\{\$Y'\$\}|\{\$C/g), null, 'an empty name hides its label, coordinates too');
  eq(named({ centre: '' }).includes('centre $(-2, 0)$'), true, 'and the working gives the coordinates alone');
  eq(named({ centre: '50% $C$' }).includes('{$50\\% C$}'), true, 'a name escaped as the form’s other text is, with no $ of its own');
  const turnedHyperbola = conicDrawing({ ...CONIC.values, input: 'standard', kind: 'hyperbola', a: 1.5, b: 1, turn: 30, axisNames: 'own', axisU: 'U_1', axisV: "V'" }).code.body;
  eq([turnedHyperbola.includes('\\frac{{U_1}^2}{2.25} - \\frac{{V\'}^2}{1} = 1'), turnedHyperbola.includes('{$U_1$}')], [true, true], 'a longer name squared in braces, so it takes its square');
  eq(/\{\$[UVuv]\$\}/.test(named({}, 1, 0, 1, -8, 2, -19)), false, 'no turn, no turned axes named');
  // a parabola turned 45°: U and V would put V on an axis and the vertex, so the axes are u and v; typed, as typed
  const turnedParabola = named({}, 1, -2, 1, -8, -8, 0);
  eq([turnedParabola.includes('{$u$}'), turnedParabola.includes('{$v$}'), turnedParabola.includes('{$V$}'), turnedParabola.includes('$v^2 = 5.657u$')], [true, true, true, true], 'a turned parabola’s axes u and v beside its vertex V');
  eq(named({ vertex: 'P' }, 1, -2, 1, -8, -8, 0).includes('{$U$}'), true, 'U and V again once the vertex is P');
  eq(named({ axisNames: 'own' }, 1, -2, 1, -8, -8, 0).includes('{$U$}'), true, 'typed U and V kept as typed');
  eq(['{$F(2, 0.9167)$}', '{$V(2, 1.667)$}'].filter((name) => !conicDrawing(g(1, 0, 0, -4, 3, -1, { coordinates: true })).code.body.includes(name)), [], 'coordinates beside the names');
  eq(['{$V_1(0.6307, 0.75)$}', '{$V_2(3.369, 0.75)$}', '{$C(2, 0.75)$}'].filter((name) => !conicDrawing(g(1, 0, -2, -4, 3, 1, { coordinates: true })).code.body.includes(name)), [], 'a hyperbola’s vertices V₁ and V₂ with theirs');
  eq(conicDrawing(g(1, 0, 1, 0, 0, 1, { results: false })).code.body.includes('{No real points}'), true, 'no real points: the figure says so');
  eq(conicDrawing(g(1, 0, 1, -8, 2, -19, { title: '50% (a) circle' })).code.body.includes('{50\\% (a) circle}'), true, 'a % in the title escaped');
  // a conic far from the origin keeps its size, with the axes along the view's edges
  eq(/NaN|Infinity/.test(conicDrawing(g(1, 0, 1, -200, -200, 19999)).code.body), false, 'far from the origin');
  for (const [what, values] of [
    ['nothing second-degree', g(0, 0, 0, 1, 2, -4)],
    ['nothing at all', g(0, 0, 0, 0, 0, 0)],
    ['a tiny ellipse', g(19, 0, 2, -4, 3, 1)],
    ['a parabola turned 30°', { ...CONIC.values, input: 'standard', kind: 'parabola', h: 1, k: 1, a: 0.5, opens: 'up', turn: 30 }],
    ['one line twice', g(1, 0, 0, -4, 0, 4)]
  ] as const) eq(/NaN|Infinity|undefined/.test(conicDrawing(values).code.body), false, what);
}
{
  const body = transformationDrawing(TRANSFORMATION.values).code.body;
  eq(body.includes('\\draw[blue, dashed] (0.6,0.6) -- (3.1,0.6) -- (3.1,3.1) -- (0.6,3.1) -- cycle;'), true, 'the unit square blue and dashed');
  eq([body.includes('\\fill[red!10]'), body.includes('\\draw[red, thick]'), (body.match(/\\draw\[gray!55\]/g) ?? []).length], [true, true, 2], 'its image red over a light fill, two eigenlines grey');
  eq(['{$A\\mathbf{e}_2$}', '{$\\mathbf{e}_2$}', '{$A\\mathbf{v}_1$}', '{$\\mathbf{v}_1$}', '{$A\\mathbf{e}_1 = \\mathbf{e}_1$}'].every((name) => body.includes(name)), true, 'vectors named, one that stays named once');
  const bare = transformationDrawing({ ...TRANSFORMATION.values, basis: false, eigen: false, ticks: false, results: false }).code.body;
  eq([/mathbf/.test(bare), /gray!55/.test(bare), /foreach/.test(bare), /align=center/.test(bare)], [false, false, false, false], 'each can be hidden');
  eq(/gray!55/.test(transformationDrawing({ ...TRANSFORMATION.values, a11: 0, a12: -1, a21: 1, a22: 0 }).code.body), false, 'a rotation has no eigenlines to draw');
  eq((transformationDrawing({ ...TRANSFORMATION.values, show: 'grid' }).code.body.match(/very thin|red!45/g) ?? []).length, 2, 'a grid before and after');
  eq(transformationDrawing({ ...TRANSFORMATION.values, name: 'H_x(1)' }).code.body.includes('$\\det H_x(1) = 2$'), true, 'its name in the working');
  eq(formCode({ preset: 'transformation', values: { ...TRANSFORMATION.values, name: '50%' } }, {}).body.includes('$50\\%\\mathbf{e}_2$'), true, 'a % in the name escaped');
  // the vectors' names: \hat{\imath}-style or any, in the figure and the working; empty leaves the arrows unnamed
  const hats = transformationDrawing({ ...TRANSFORMATION.values, basisName: '\\hat{e}', eigenName: '\\vec{u}' }).code.body;
  eq(['{$A\\hat{e}_2$}', '{$\\hat{e}_2$}', '{$A\\vec{u}_1$}', '$A\\hat{e}_1 = (1, 0)$', '$\\vec{u}_1 = '].filter((t) => !hats.includes(t)), [], 'e and v renamed in the figure and the working');
  const unnamed = transformationDrawing({ ...TRANSFORMATION.values, basisName: '', eigenName: '' }).code.body;
  eq([['{$A\\mathbf{e}_2$}', '{$\\mathbf{e}_2$}', '{$A\\mathbf{v}_1$}', '{$\\mathbf{v}_1$}'].some((t) => unnamed.includes(t)), unnamed.includes('$A\\mathbf{e}_1 = (1, 0)$')], [false, true], 'empty: no names on the arrows, the working with e and v')
  for (const [a11, a12, a21, a22] of [[0, 0, 0, 0], [2, 6, 1, 3], [1, 0, 0, 1], [-0.8, 0.6, 0.6, 0.8], [1000, 0, 0, 0.001]]) eq(/NaN|Infinity|undefined/.test(transformationDrawing({ ...TRANSFORMATION.values, a11, a12, a21, a22 }).code.body), false, `[${a11} ${a12}; ${a21} ${a22}]`);
}
const drawings: [string, ReturnType<typeof conicDrawing> | ReturnType<typeof transformationDrawing>][] = [
  ['the cross-term ellipse', conicDrawing(CONIC.values)],
  ['xy = 1', conicDrawing(g(0, 1, 0, 0, 0, -1))],
  ['T1(a) circle', conicDrawing(g(1, 0, 1, -8, 2, -19))],
  ['T1(b) ellipse', conicDrawing(g(1, 0, 2, -4, 3, -15))],
  ['T1(c) hyperbola', conicDrawing(g(1, 0, -2, -4, 3, 1))],
  ['T1(d) parabola', conicDrawing(g(1, 0, 0, -4, 3, -1))],
  ['T1b(a) hyperbola', conicDrawing(g(-1, 0, 1, 0, 0, -19))],
  ['T1b(d) parabola, with coordinates', conicDrawing(g(0, 0, 1, -1, 1, -1, { coordinates: true }))],
  ['x² − y² = 0', conicDrawing(g(1, 0, -1, 0, 0, 0))],
  ['x² + 2y² = 0', conicDrawing(g(1, 0, 2, 0, 0, 0))],
  ['A4, k = 1', conicDrawing(g(1, 0, 0, -4, 0, 3))],
  ['y² = 4x', conicDrawing({ ...CONIC.values, input: 'standard', kind: 'parabola', a: 1 })],
  ['ellipse (3 and 2)', conicDrawing({ ...CONIC.values, input: 'standard' })],
  ['x² + 4xy + y² = 3', conicDrawing(g(1, 4, 1, 0, 0, -3))],
  ['shear then stretch', transformationDrawing(TRANSFORMATION.values)],
  ['H_x(1)', transformationDrawing({ ...TRANSFORMATION.values, a22: 1 })],
  ['R(45°)', transformationDrawing({ ...TRANSFORMATION.values, a11: Math.SQRT1_2, a12: -Math.SQRT1_2, a21: Math.SQRT1_2, a22: Math.SQRT1_2 })],
  ['reflection in y = 3x', transformationDrawing({ ...TRANSFORMATION.values, a11: -0.8, a12: 0.6, a21: 0.6, a22: 0.8 })],
  ['[2 6; 1 3]', transformationDrawing({ ...TRANSFORMATION.values, a11: 2, a12: 6, a21: 1, a22: 3 })],
  ['2I', transformationDrawing({ ...TRANSFORMATION.values, a11: 2, a12: 0, a21: 0, a22: 2 })]
];
for (const [what, drawing] of drawings) {
  eq(clashes(drawing.labels.map((label) => ({ label, shift: { x: 0, y: 0 } })), drawing.shapes), [], `${what}: no label touches`);
}

// ─── File: both presets are new in 2.5, so their drawings are version 5 and 2.4 opens them as code ───
eq([CONIC.version5, TRANSFORMATION.version5, conicDrawing(CONIC.values).code.packages, transformationDrawing(TRANSFORMATION.values).code.libraries], [true, true, ['tikz'], ['arrows.meta', 'babel']], 'plain TikZ');
(async () => {
  for (const id of ['conic', 'transformation']) {
    const model = newFormModel(id);
    const text = await diagramFileText({ language: 'tikz', pkg: 'form', style: {}, model, version: 1 }, formCode(model, {}));
    eq((await readDiagramFile(text)).diagram?.version, 5, `${id}: version 5`);
  }
  console.log('maths.check: ok');
})();
