// A conic section, a Form preset: from the general equation Ax² + Bxy + Cy² + Dx + Ey + F = 0, or from an ellipse's,
// hyperbola's or parabola's own numbers. It is classified (the degenerate cases too: a point, two lines, nothing),
// its axes are turned by θ when there is an xy term (cot 2θ = (A − C)/B, which is turning to the eigenvectors of
// [[A, B/2], [B/2, C]]), and the squares are completed, as MATH2150's notes do it. Drawn as the notes draw theirs: the
// curve thick and teal on axes through the origin, the centre or vertex a dot, the foci red crosses, the asymptotes and
// the directrix dashed grey, and the turned axes U and V dashed through the centre.
import { escapeTex, num } from '../shared';
import { at, fmt, pictureOf, results, RESULTS_FIELD, scene } from './fluids';
import type { Pt } from './fluids';
import { clipLine, plain, plane, viewOf } from './plane';
import type { FormField, FormPreset, FormValues } from './presets';

export type ConicInput = { A: number; B: number; C: number; D: number; E: number; F: number };

const add = (p: Pt, d: Pt, t = 1): Pt => ({ x: p.x + d.x * t, y: p.y + d.y * t });
const perp = (d: Pt): Pt => ({ x: -d.y, y: d.x });
const unit = (d: Pt): Pt => ({ x: d.x / Math.hypot(d.x, d.y), y: d.y / Math.hypot(d.x, d.y) });

/**
 * The equation in axes turned by theta (degrees, 0 ≤ θ < 90), u and v along them: λ1u² + λ2v² + g1u + g2v + F = 0.
 * family: what the squares alone say (the sign of B² − 4AC), before the constant decides whether it is degenerate.
 */
type Frame = { theta: number; u: Pt; v: Pt; l1: number; l2: number; g1: number; g2: number; F: number; disc: number; family: 'ellipse' | 'hyperbola' | 'parabola' | 'none' };
export type Conic = Frame &
  (
    | { kind: 'circle' | 'ellipse' | 'hyperbola'; centre: Pt; a: number; b: number; c: number; e: number; /** along the major or transverse axis */ axis: Pt; foci: [Pt, Pt]; vertices: [Pt, Pt] }
    | { kind: 'parabola'; vertex: Pt; /** vertex to focus */ a: number; /** the way it opens */ axis: Pt; focus: Pt; /** where the axis meets the directrix */ foot: Pt; e: 1 }
    | { kind: 'point'; centre: Pt }
    | { kind: 'lines'; centre: Pt; dirs: [Pt, Pt] }
    | { kind: 'parallel'; through: [Pt, Pt]; dir: Pt }
    /** twice: a parabola's equation gone flat; not twice: no second-degree term at all */
    | { kind: 'line'; through: Pt; dir: Pt; twice: boolean }
    | { kind: 'none' }
  );

/** The conic an equation is: its kind, and where everything on it is. */
export function conic({ A, B, C, D, E, F }: ConicInput): Conic {
  const scale = Math.max(Math.abs(A), Math.abs(B), Math.abs(C));
  const zero = (value: number, against: number) => Math.abs(value) <= 1e-9 * against;
  // the acute turn that removes the xy term
  let t = zero(B, scale) ? 0 : Math.atan2(B, A - C) / 2;
  if (t < 0) t += Math.PI / 2;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const [u, v] = [{ x: c, y: s }, { x: -s, y: c }];
  const [l1, l2, g1, g2] = [A * c * c + B * s * c + C * s * s, A * s * s - B * s * c + C * c * c, D * c + E * s, -D * s + E * c];
  const flat1 = zero(l1, scale);
  const flat2 = zero(l2, scale);
  const frame: Frame = { theta: (t * 180) / Math.PI, u, v, l1, l2, g1, g2, F, disc: B * B - 4 * A * C, family: !scale ? 'none' : flat1 || flat2 ? 'parabola' : l1 * l2 > 0 ? 'ellipse' : 'hyperbola' };
  const on = (p: Pt, q: Pt, P: number, Q: number): Pt => ({ x: P * p.x + Q * q.x, y: P * p.y + Q * q.y });
  if (!scale) {
    const n = Math.hypot(D, E);
    return n ? { ...frame, kind: 'line', through: { x: (-F * D) / (n * n), y: (-F * E) / (n * n) }, dir: { x: -E / n, y: D / n }, twice: false } : { ...frame, kind: 'none' };
  }
  if (!flat1 && !flat2) {
    // λ1(u − U0)² + λ2(v − V0)² = K
    const [k1, k2] = [(g1 * g1) / (4 * l1), (g2 * g2) / (4 * l2)];
    const K = k1 + k2 - F;
    const centre = on(u, v, -g1 / (2 * l1), -g2 / (2 * l2));
    const flat = zero(K, Math.abs(k1) + Math.abs(k2) + Math.abs(F));
    const ends = (axis: Pt, d: number): [Pt, Pt] => [add(centre, axis, -d), add(centre, axis, d)];
    if (l1 * l2 > 0) {
      if (flat) return { ...frame, kind: 'point', centre };
      if (K / l1 < 0) return { ...frame, kind: 'none' };
      const [su, sv] = [Math.sqrt(K / l1), Math.sqrt(K / l2)];
      const round = zero(l1 - l2, scale);
      const [a, b, axis] = su >= sv ? [su, sv, u] : [sv, su, v];
      const focal = round ? 0 : Math.sqrt(a * a - b * b);
      return { ...frame, kind: round ? 'circle' : 'ellipse', centre, a, b, c: focal, e: focal / a, axis, foci: ends(axis, focal), vertices: ends(axis, a) };
    }
    if (flat) {
      const r = Math.sqrt(-l1 / l2);
      return { ...frame, kind: 'lines', centre, dirs: [unit(add(u, v, r)), unit(add(u, v, -r))] };
    }
    const [across, along, axis] = K / l1 > 0 ? [l1, l2, u] : [l2, l1, v];
    const [a, b] = [Math.sqrt(K / across), Math.sqrt(-K / along)];
    const focal = Math.hypot(a, b);
    return { ...frame, kind: 'hyperbola', centre, a, b, c: focal, e: focal / a, axis, foci: ends(axis, focal), vertices: ends(axis, a) };
  }
  // one square only: sq·s² + gs·s + gl·l + F = 0, s along the squared axis and l along the other
  const [sq, gs, gl, sAxis, lAxis] = flat2 ? [l1, g1, g2, u, v] : [l2, g2, g1, v, u];
  const S0 = -gs / (2 * sq);
  const rest = (gs * gs) / (4 * sq) - F;
  if (!zero(gl, Math.hypot(D, E))) {
    // (s − S0)² = −(gl/sq)(l − rest/gl)
    const vertex = on(sAxis, lAxis, S0, rest / gl);
    const a = Math.abs(gl / sq) / 4;
    const axis = gl / sq < 0 ? lAxis : { x: -lAxis.x, y: -lAxis.y };
    return { ...frame, kind: 'parabola', vertex, a, axis, focus: add(vertex, axis, a), foot: add(vertex, axis, -a), e: 1 };
  }
  // (s − S0)² = rest/sq
  if (zero(rest, Math.abs(F) + Math.abs((gs * gs) / (4 * sq)))) return { ...frame, kind: 'line', through: on(sAxis, lAxis, S0, 0), dir: lAxis, twice: true };
  if (rest / sq < 0) return { ...frame, kind: 'none' };
  const r = Math.sqrt(rest / sq);
  return { ...frame, kind: 'parallel', through: [on(sAxis, lAxis, S0 - r, 0), on(sAxis, lAxis, S0 + r, 0)], dir: lAxis };
}

export type StandardConic = { kind: 'ellipse' | 'hyperbola' | 'parabola'; h: number; k: number; a: number; b: number; axis: 'x' | 'y'; opens: 'right' | 'left' | 'up' | 'down'; turn: number };

/**
 * The equation of a conic given by its own numbers, about (h, k) and turned by `turn` degrees: an ellipse
 * x²/a² + y²/b² = 1; a hyperbola x²/a² − y²/b² = 1 (axis x) or y²/a² − x²/b² = 1 (axis y); a parabola y² = 4ax
 * (opening right) and its three turns.
 */
export function standardConic({ kind, h, k, a, b, axis, opens, turn }: StandardConic): ConicInput {
  // about the centre, before turning: A′x² + C′y² + D′x + E′y + F′ = 0
  const [A1, C1, D1, E1, F1] =
    kind === 'ellipse'
      ? [1 / (a * a), 1 / (b * b), 0, 0, -1]
      : kind === 'hyperbola'
        ? axis === 'x'
          ? [1 / (a * a), -1 / (b * b), 0, 0, -1]
          : [-1 / (b * b), 1 / (a * a), 0, 0, -1]
        : opens === 'right' || opens === 'left'
          ? [0, 1, opens === 'right' ? -4 * a : 4 * a, 0, 0]
          : [1, 0, 0, opens === 'up' ? -4 * a : 4 * a, 0];
  const t = (turn * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const [A, B, C] = [A1 * c * c + C1 * s * s, 2 * (A1 - C1) * s * c, A1 * s * s + C1 * c * c];
  const [D0, E0] = [D1 * c - E1 * s, D1 * s + E1 * c];
  return { A, B, C, D: D0 - 2 * A * h - B * k, E: E0 - B * h - 2 * C * k, F: F1 + A * h * h + B * h * k + C * k * k - D0 * h - E0 * k };
}

// ─── the working, as the notes write it ───

/** terms added up: 5x^2 + 4xy − y, a coefficient of 1 left out before a name, a zero term left out */
function sum(terms: [number, string][]) {
  const out = terms
    .filter(([coefficient]) => fmt(coefficient) !== '0')
    .map(([coefficient, name], i) => `${coefficient < 0 ? (i ? ' - ' : '-') : i ? ' + ' : ''}${fmt(Math.abs(coefficient)) === '1' && name ? '' : fmt(Math.abs(coefficient))}${name}`)
    .join('');
  return out || '0';
}

export const equationTex = ({ A, B, C, D, E, F }: ConicInput) => `${sum([[A, 'x^2'], [B, 'xy'], [C, 'y^2'], [D, 'x'], [E, 'y'], [F, '']])} = 0`;

/** (x − 2), (y + 0.75), or the bare name when there is no shift */
const shifted = (name: string, by: number) => (fmt(by) === '0' ? name : `(${name} ${by > 0 ? '-' : '+'} ${fmt(Math.abs(by))})`);
const squared = (name: string, by: number) => `${shifted(name, by)}^2`;
const point = (p: Pt) => `(${fmt(p.x)}, ${fmt(p.y)})`;

/** The line through p along d: y = mx + c, or x = c when it is vertical. */
export function lineTex(p: Pt, d: Pt) {
  if (Math.abs(d.x) < 1e-9 * Math.hypot(d.x, d.y)) return `x = ${fmt(p.x)}`;
  const m = d.y / d.x;
  return `y = ${sum([[m, 'x'], [p.y - m * p.x, '']])}`;
}

const NAMES: Record<Conic['kind'], string> = {
  circle: 'Circle',
  ellipse: 'Ellipse',
  hyperbola: 'Hyperbola',
  parabola: 'Parabola',
  point: 'A single point, not a curve (a degenerate ellipse)',
  lines: 'Two lines that cross (a degenerate hyperbola)',
  parallel: 'Two parallel lines (a degenerate parabola)',
  line: 'One line, counted twice (a degenerate parabola)',
  none: 'No real points, so nothing to draw'
};

/**
 * What the conic is and how that was found, a line each: its kind, the turn, the completed squares, the standard form
 * and its numbers. `own`: it was given by its own numbers, so there was no discriminant to read or square to complete.
 */
export function conicWorking(q: Conic, own = false): string[] {
  const out = steps(q, own);
  // with nothing to say about how it was classified, its name leads the next line
  return own && out.length > 1 ? [`${out[0]}: ${out[1]}`, ...out.slice(2)] : out;
}

function steps(q: Conic, own: boolean): string[] {
  if (q.family === 'none') return [q.kind === 'line' ? `Not a conic (no $x^2$, $xy$ or $y^2$ term): the straight line $${lineTex(q.through, q.dir)}$` : 'Not a conic: the equation has no $x$ or $y$'];
  const turned = q.theta !== 0;
  const [p, r] = turned ? ['u', 'v'] : ['x', 'y'];
  const out = [own ? NAMES[q.kind] : `${NAMES[q.kind]}: $B^2 - 4AC = ${fmt(q.family === 'parabola' ? 0 : q.disc)}${q.family === 'ellipse' ? ' < 0' : q.family === 'hyperbola' ? ' > 0' : ''}$`];
  if (turned) out.push(`axes turned by $\\theta = ${fmt(q.theta)}^\\circ$${own ? '' : ', where $\\cot 2\\theta = \\frac{A - C}{B}$'}`);
  if (q.family !== 'parabola') {
    const [U0, V0] = [-q.g1 / (2 * q.l1), -q.g2 / (2 * q.l2)];
    const K = q.kind === 'point' || q.kind === 'lines' ? 0 : q.g1 ** 2 / (4 * q.l1) + q.g2 ** 2 / (4 * q.l2) - q.F;
    if (q.kind === 'circle') return [...out, `$${squared(p, U0)} + ${squared(r, V0)} = ${fmt(K / q.l1)}$`, `centre $${point(q.centre)}$, radius $${fmt(q.a)}$`];
    if (!own) out.push(`$${sum([[q.l1, squared(p, U0)], [q.l2, squared(r, V0)]])} = ${fmt(K)}$`);
    if (q.kind === 'ellipse' || q.kind === 'hyperbola') {
      const over = (name: string, by: number, d: number) => `\\frac{${squared(name, by)}}{${fmt(Math.abs(d))}}`;
      const [first, second] = [over(p, U0, K / q.l1), over(r, V0, K / q.l2)];
      out.push(`$${q.kind === 'ellipse' ? `${first} + ${second}` : K / q.l1 > 0 ? `${first} - ${second}` : `${second} - ${first}`} = 1$`);
      out.push(`centre $${point(q.centre)}$, $a = ${fmt(q.a)}$, $b = ${fmt(q.b)}$, $c = ${fmt(q.c)}$, $e = ${fmt(q.e)}$`);
      if (q.kind === 'hyperbola') out.push(`asymptotes ${asymptotes(q).map((d) => `$${lineTex(q.centre, d)}$`).join(' and ')}`);
    } else if (q.kind === 'point') out.push(`only $${point(q.centre)}$ satisfies it`);
    else if (q.kind === 'lines') out.push(`the lines ${q.dirs.map((d) => `$${lineTex(q.centre, d)}$`).join(' and ')}, crossing at $${point(q.centre)}$`);
    return out;
  }
  // the square is in s (x or u, y or v) and the other, l, is not squared
  const [sq, gs, gl, s, l] = Math.abs(q.l2) < Math.abs(q.l1) ? [q.l1, q.g1, q.g2, p, r] : [q.l2, q.g2, q.g1, r, p];
  const S0 = -gs / (2 * sq);
  const rest = (gs * gs) / (4 * sq) - q.F;
  if (q.kind === 'parabola') {
    const coefficient = fmt(-gl / sq);
    out.push(`$${squared(s, S0)} = ${coefficient === '1' ? '' : coefficient === '-1' ? '-' : coefficient}${shifted(l, rest / gl)}$`);
    out.push(`vertex $${point(q.vertex)}$, $4a = ${fmt(4 * q.a)}$, $a = ${fmt(q.a)}$, focus $${point(q.focus)}$`, `directrix $${lineTex(q.foot, perp(q.axis))}$, $e = 1$`);
  } else {
    out.push(`$${squared(s, S0)} = ${fmt(q.kind === 'line' ? 0 : rest / sq)}$`);
    if (q.kind === 'line') out.push(`the line $${lineTex(q.through, q.dir)}$`);
    if (q.kind === 'parallel') out.push(`the lines ${q.through.map((through) => `$${lineTex(through, q.dir)}$`).join(' and ')}`);
  }
  return out;
}

/** The ways a hyperbola's two asymptotes run from its centre. */
export const asymptotes = (q: { axis: Pt; a: number; b: number }): [Pt, Pt] => [unit(add({ x: q.axis.x * q.a, y: q.axis.y * q.a }, perp(q.axis), q.b)), unit(add({ x: q.axis.x * q.a, y: q.axis.y * q.a }, perp(q.axis), -q.b))];

// ─── the picture ───

/** The equation the form's values give: typed as it is, or made from a conic's own numbers. */
export const inputOf = (values: FormValues): ConicInput =>
  values.input === 'standard'
    ? standardConic({ kind: values.kind as StandardConic['kind'], h: Number(values.h), k: Number(values.k), a: Number(values.a), b: Number(values.b), axis: values.axis as 'x' | 'y', opens: values.opens as StandardConic['opens'], turn: Number(values.turn) })
    : { A: Number(values.A), B: Number(values.B), C: Number(values.C), D: Number(values.D), E: Number(values.E), F: Number(values.F) };

/** how far along a hyperbola's branches (the parameter of a cosh t, b sinh t) and a parabola's arms (in a) the curve is drawn */
const [BRANCH, ARM] = [1.5, 4];

export function conicDrawing(values: FormValues) {
  const input = inputOf(values);
  const q = conic(input);
  const show = (key: string) => values[key] === true;
  const sc = scene();
  const degrees = (d: Pt) => (Math.atan2(d.y, d.x) * 180) / Math.PI;

  // the curve as points, for the view and for the labels to keep clear of; and what else the view takes in
  const curves: Pt[][] = [];
  const seen: Pt[] = [];
  if (q.kind === 'circle' || q.kind === 'ellipse') {
    curves.push(Array.from({ length: 72 }, (_, i) => add(add(q.centre, q.axis, q.a * Math.cos((i * Math.PI) / 36)), perp(q.axis), q.b * Math.sin((i * Math.PI) / 36))));
  } else if (q.kind === 'hyperbola') {
    for (const side of [1, -1]) curves.push(Array.from({ length: 41 }, (_, i) => add(add(q.centre, q.axis, side * q.a * Math.cosh((i / 20 - 1) * BRANCH)), perp(q.axis), q.b * Math.sinh((i / 20 - 1) * BRANCH))));
  } else if (q.kind === 'parabola') {
    curves.push(Array.from({ length: 41 }, (_, i) => add(add(q.vertex, q.axis, ((i / 20 - 1) * ARM) ** 2 * q.a * 0.25), perp(q.axis), (i / 20 - 1) * ARM * q.a)));
    seen.push(q.focus, q.foot);
  } else if (q.kind === 'point' || q.kind === 'lines') seen.push(q.centre);
  else if (q.kind === 'line') seen.push(q.through);
  else if (q.kind === 'parallel') {
    const reach = Math.max(1, Math.hypot(q.through[1].x - q.through[0].x, q.through[1].y - q.through[0].y) / 2);
    seen.push(...q.through.flatMap((through) => [add(through, q.dir, reach), add(through, q.dir, -reach)]));
  } else seen.push({ x: 0, y: 0 });
  const v = viewOf([...seen, ...curves.flat()], curves.length ? 1e-9 : 4);
  // the turned axes go through the centre, or a parabola's vertex
  const middle = 'centre' in q ? q.centre : q.kind === 'parabola' ? q.vertex : null;
  const turnedAxes = show('axes') && q.theta !== 0 && !!middle;
  const { k, P } = plane(sc, v, { ticks: show('ticks'), colour: turnedAxes ? 'gray' : 'black' });
  const title = escapeTex(String(values.title).trim());
  if (title) sc.add(`\\node[anchor=south] at (${num(((v.x1 - v.x0) * k) / 2)},${num((v.y1 - v.y0) * k + 0.45)}) {${title}};`);

  /** the line through p along d, across the view (drawn in a little from its edges when `inset`) */
  const line = (p: Pt, d: Pt, style: string, inset = 0) => {
    const m = inset * Math.max(v.x1 - v.x0, v.y1 - v.y0);
    const ends = clipLine(p, d, { x0: v.x0 + m, x1: v.x1 - m, y0: v.y0 + m, y1: v.y1 - m });
    if (!ends) return null;
    const [from, to] = ends.map(P);
    sc.add(`\\draw[${style}] ${at(from)} -- ${at(to)};`);
    sc.seg([from, to]);
    return [from, to];
  };
  const named = (name: string, p: Pt) => (show('coordinates') ? `${name.startsWith('$') ? name.slice(0, -1) : `${name} $`}${point(p)}$` : name);

  if (q.kind === 'hyperbola' && show('asymptotes')) {
    sc.add('% Asymptotes');
    for (const d of asymptotes(q)) line(q.centre, d, 'dashed, gray');
  }
  if (turnedAxes && middle) {
    sc.add(`% The axes turned by ${fmt(q.theta)} degrees`);
    for (const [d, name] of [[q.u, '$U$'], [q.v, '$V$']] as const) {
      const ends = line(middle, d, '->, dashed', 0.03);
      if (ends) sc.label(ends[1], name, d);
    }
  }
  if (q.kind === 'parabola' && show('directrix')) {
    sc.add('% Directrix');
    const ends = line(q.foot, perp(q.axis), 'dashed, gray');
    if (ends) sc.label({ x: ends[0].x + (ends[1].x - ends[0].x) * 0.15, y: ends[0].y + (ends[1].y - ends[0].y) * 0.15 }, 'directrix', { x: -q.axis.x, y: -q.axis.y });
  }

  sc.add(`% ${NAMES[q.kind].replace(/,.*| \(.*/, '')}`);
  const curve = 'very thick, teal';
  if (q.kind === 'circle') sc.add(`\\draw[${curve}] ${at(P(q.centre))} circle [radius=${num(q.a * k)}];`);
  else if (q.kind === 'ellipse') sc.add(`\\draw[${curve}, rotate around={${num(degrees(q.axis))}:${at(P(q.centre))}}] ${at(P(q.centre))} ellipse [x radius=${num(q.a * k)}, y radius=${num(q.b * k)}];`);
  else if (q.kind === 'hyperbola') {
    const plot = `shift={${at(P(q.centre))}}, rotate=${num(degrees(q.axis))}, domain=-${BRANCH}:${BRANCH}, samples=61, smooth, variable=\\t`;
    for (const side of ['', '-']) sc.add(`\\draw[${curve}, ${plot}] plot ({${side}${num(q.a * k)}*cosh(\\t)},{${num(q.b * k)}*sinh(\\t)});`);
  } else if (q.kind === 'parabola') {
    sc.add(`\\draw[${curve}, shift={${at(P(q.vertex))}}, rotate=${num(degrees(q.axis))}, domain=-${num(ARM * q.a * k)}:${num(ARM * q.a * k)}, samples=61, smooth, variable=\\t] plot ({\\t*\\t/${num(4 * q.a * k)}},{\\t});`);
  } else if (q.kind === 'lines') for (const d of q.dirs) line(q.centre, d, curve);
  else if (q.kind === 'parallel') for (const through of q.through) line(through, q.dir, curve);
  else if (q.kind === 'line') line(q.through, q.dir, curve);
  else if (q.kind === 'point') sc.add(`\\fill[teal] ${at(P(q.centre))} circle (0.07);`);
  // nothing to draw: the figure says so itself, with the working under it or without
  else if (q.kind === 'none') sc.add(`\\node[fill=white] at (${num(((v.x1 - v.x0) * k) / 2)},${num((v.y1 - v.y0) * k * 0.78)}) {${q.family === 'none' ? 'Not a conic' : 'No real points'}};`);
  for (const pts of curves) sc.seg(pts.map(P), q.kind !== 'hyperbola' && q.kind !== 'parabola');

  // the centre or vertex a dot, the foci red crosses, each with its name
  const below = (d: Pt) => (d.y > 1e-9 || (Math.abs(d.y) <= 1e-9 && d.x < 0) ? { x: -d.x, y: -d.y } : d);
  const cross = (p: Pt) => {
    sc.add(`\\draw[red, line width=0.8pt] (${num(p.x - 0.08)},${num(p.y - 0.08)}) -- (${num(p.x + 0.08)},${num(p.y + 0.08)}) (${num(p.x - 0.08)},${num(p.y + 0.08)}) -- (${num(p.x + 0.08)},${num(p.y - 0.08)});`);
    sc.items.push({ t: 'dot', at: p, r: 0.08 });
  };
  sc.add('% Centre, vertices and foci');
  if (q.kind === 'circle' || q.kind === 'ellipse' || q.kind === 'hyperbola' || q.kind === 'lines' || q.kind === 'point') {
    if (q.kind !== 'point') sc.dot(P(q.centre));
    // below and to the right, as the notes have it; between the lines when lines cross at the centre
    const crossed = turnedAxes || q.kind === 'lines' || (q.kind === 'hyperbola' && show('asymptotes'));
    const between = ((q.theta - 22.5) * Math.PI) / 180;
    sc.label(P(q.centre), named('$C$', q.centre), crossed ? { x: Math.cos(between), y: Math.sin(between) } : { x: 1, y: -1 });
  }
  if (q.kind === 'ellipse' || q.kind === 'hyperbola') {
    const side = below(perp(q.axis));
    if (show('foci')) {
      q.foci.forEach((f, i) => {
        cross(P(f));
        sc.label(P(f), named(`$F_${i + 1}$`, f), side, false, 'red');
      });
    }
    // an ellipse's vertices named outside it, a hyperbola's between its branches
    const out = q.kind === 'ellipse' ? 1 : -1;
    if (show('vertices')) {
      q.vertices.forEach((p, i) => {
        sc.dot(P(p));
        sc.label(P(p), named(i ? '$B$' : '$A$', p), add({ x: q.axis.x * (i ? out : -out), y: q.axis.y * (i ? out : -out) }, side, q.kind === 'ellipse' ? 0 : 1));
      });
    }
  }
  if (q.kind === 'parabola') {
    if (show('vertices')) {
      sc.dot(P(q.vertex));
      sc.label(P(q.vertex), named('vertex', q.vertex), add({ x: -q.axis.x, y: -q.axis.y }, below(perp(q.axis))));
    }
    if (show('foci')) {
      cross(P(q.focus));
      sc.label(P(q.focus), named('$F$', q.focus), add(q.axis, below(perp(q.axis))), false, 'red');
    }
  }

  const working = conicWorking(q, values.input === 'standard');
  if (show('results')) results(sc, ((v.x1 - v.x0) * k) / 2, working);
  return { ...pictureOf(sc, [`Conic: ${equationTex(input)}`, ...working.map(plain)], false), conic: q };
}

const general = (v: FormValues) => v.input !== 'standard';
const standard = (v: FormValues) => v.input === 'standard';
const coefficient = (key: string, label: string, hint?: string): FormField => ({ key, label, kind: 'number', min: -1e6, max: 1e6, shown: general, ...(hint && { hint }) });

export const CONIC: FormPreset = {
  id: 'conic',
  label: 'Conic section',
  version5: true,
  fields: [
    { key: 'input', label: 'Given as', kind: 'choice', options: [['general', 'The general equation'], ['standard', 'An ellipse, hyperbola or parabola']] },
    coefficient('A', 'A, of x²', 'The equation is Ax² + Bxy + Cy² + Dx + Ey + F = 0.'),
    coefficient('B', 'B, of xy', 'Not 0 when the conic is turned: its axes are then turned to match.'),
    coefficient('C', 'C, of y²'),
    coefficient('D', 'D, of x'),
    coefficient('E', 'E, of y'),
    coefficient('F', 'F, the constant'),
    { key: 'kind', label: 'Conic', kind: 'choice', options: [['ellipse', 'Ellipse'], ['hyperbola', 'Hyperbola'], ['parabola', 'Parabola']], shown: standard },
    { key: 'h', label: 'Centre or vertex, x', kind: 'number', min: -1e6, max: 1e6, shown: standard },
    { key: 'k', label: 'Centre or vertex, y', kind: 'number', min: -1e6, max: 1e6, shown: standard },
    { key: 'a', label: 'a', kind: 'number', min: 1e-6, max: 1e6, shown: standard, hint: 'An ellipse’s semi-axis along x; a hyperbola’s centre to a vertex; a parabola’s vertex to its focus, as in y² = 4ax.' },
    { key: 'b', label: 'b', kind: 'number', min: 1e-6, max: 1e6, shown: (v) => standard(v) && v.kind !== 'parabola', hint: 'An ellipse’s semi-axis along y; a hyperbola’s other semi-axis.' },
    { key: 'axis', label: 'Opens', kind: 'choice', options: [['x', 'Left and right'], ['y', 'Up and down']], shown: (v) => standard(v) && v.kind === 'hyperbola' },
    { key: 'opens', label: 'Opens', kind: 'choice', options: [['right', 'To the right'], ['left', 'To the left'], ['up', 'Upwards'], ['down', 'Downwards']], shown: (v) => standard(v) && v.kind === 'parabola' },
    { key: 'turn', label: 'Turned by', kind: 'number', unit: '°', min: -360, max: 360, shown: standard, hint: 'Anticlockwise about the centre or vertex.' },
    { key: 'title', label: 'Title', kind: 'text', hint: 'Over the figure. LaTeX, as in the document: (a) ellipse.' },
    { key: 'foci', label: 'Foci', kind: 'switch' },
    { key: 'vertices', label: 'Vertices', kind: 'switch' },
    { key: 'directrix', label: 'Directrix', kind: 'switch', hint: 'A parabola’s.' },
    { key: 'asymptotes', label: 'Asymptotes', kind: 'switch', hint: 'A hyperbola’s.' },
    { key: 'axes', label: 'Turned axes U and V', kind: 'switch', hint: 'Through the centre, when there is an xy term.' },
    { key: 'coordinates', label: 'Coordinates beside the names', kind: 'switch' },
    { key: 'ticks', label: 'Numbers on the axes', kind: 'switch' },
    { ...RESULTS_FIELD, label: 'Write the working under the figure' }
  ],
  // the notes' rotated ellipse (Section 5, "Ellipse with a cross term"): 5x² + 4xy + 5y² + 20x + 8y − 1 = 0
  values: { input: 'general', A: 5, B: 4, C: 5, D: 20, E: 8, F: -1, kind: 'ellipse', h: 0, k: 0, a: 3, b: 2, axis: 'x', opens: 'right', turn: 0, title: '', foci: true, vertices: true, directrix: true, asymptotes: true, axes: true, coordinates: false, ticks: true, results: true },
  toCode: (values) => conicDrawing(values).code
};
