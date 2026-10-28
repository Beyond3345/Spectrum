// The structure solved: a 2D direct-stiffness solver with three freedoms a node (two for a truss joint), frame elements
// with released ends by static condensation, truss bars, consistent loads for point, uniform and linearly varying
// loads, supports as constrained freedoms (turned for inclined ones) and springs on the diagonal, solved by Gaussian
// elimination with partial pivoting. A determinate structure gets its exact equilibrium answer whatever its stiffnesses;
// an indeterminate one uses the relative EI and EA. Members are cut at every load so the forces along each piece are
// exact polynomials (axial and shear up to quadratic, moment up to cubic).
import { frameOf, loadDirection, memberName, members, nodeMap, supports } from './model';
import type { Member, Pt, StructureModel, Support } from './model';

/** Forces along a piece of a member, as polynomials in s, 0 to L from the piece's start (N tension, V and M beam signs). */
export interface Piece {
  /** where it starts along its member */
  s0: number;
  L: number;
  N: number[];
  V: number[];
  M: number[];
}

export interface Reaction {
  support: string;
  node: string;
  /** the support's force on the structure */
  force: Pt;
  /** anticlockwise */
  moment: number;
  /** the force along the support's own directions: [along its surface, out of it] */
  local: [number, number];
}

/** What a member's end does to its node (the reverse of the node's force on the member). */
export interface EndForce {
  force: Pt;
  moment: number;
}

export type Status =
  | { kind: 'empty'; text: string }
  | { kind: 'ok'; text: string; degree: number }
  | { kind: 'unstable'; text: string; node?: string }
  | { kind: 'error'; text: string };

export interface Solution {
  status: Status;
  reactions: Reaction[];
  pieces: Map<string, Piece[]>;
  /** each member's ends, [a, b] */
  ends: Map<string, [EndForce, EndForce]>;
  /** results this small are zero: a millionth of the largest load */
  tiny: number;
  /** the same for moments: times the longest member */
  tinyMoment: number;
  /** notes beside the status: a moment on a hinge, a load off its member */
  notes: string[];
}

// ─── small helpers ───

export const evalPoly = (c: number[], s: number) => c.reduceRight((acc, k) => acc * s + k, 0);
const derivative = (c: number[]) => c.slice(1).map((k, i) => k * (i + 1));

/** The real roots of a polynomial of degree at most two strictly inside (0, L). */
export function rootsInside(c: number[], L: number): number[] {
  const [c0 = 0, c1 = 0, c2 = 0] = c;
  const scale = Math.max(Math.abs(c0), Math.abs(c1) * L, Math.abs(c2) * L * L);
  if (!scale) return [];
  let roots: number[] = [];
  if (Math.abs(c2) * L * L < 1e-12 * scale) roots = Math.abs(c1) * L < 1e-12 * scale ? [] : [-c0 / c1];
  else {
    const disc = c1 * c1 - 4 * c2 * c0;
    if (disc >= 0) roots = [(-c1 + Math.sqrt(disc)) / (2 * c2), (-c1 - Math.sqrt(disc)) / (2 * c2)];
  }
  return roots.filter((r) => r > L * 1e-9 && r < L * (1 - 1e-9)).sort((x, y) => x - y);
}

/** Where a force polynomial has an extreme inside its piece: the roots of its derivative. */
export const extremesInside = (c: number[], L: number) => rootsInside(derivative(c), L);

// ─── the solve ───

/** Members are this much stiffer along their length than across, unless EA says otherwise: rigid, as by hand. */
const AXIAL = 1e4;

type Element = {
  member: Member;
  s0: number;
  /** real length, and length in the solve's units */
  L: number;
  nodes: [number, number];
  released: [boolean, boolean];
  bar: boolean;
  EI: number;
  EA: number;
  c: number;
  s: number;
  /** distributed load at each end, along (p) and across (q) the member, per real length */
  p: [number, number];
  q: [number, number];
};

const RESTRAINTS: Record<Support['type'], { fixed: number[]; spring?: number }> = {
  // freedoms in the support's own frame: 0 along its surface, 1 out of it, 2 turning
  pin: { fixed: [0, 1] },
  roller: { fixed: [1] },
  fixed: { fixed: [0, 1, 2] },
  guided: { fixed: [1, 2] },
  spring: { fixed: [], spring: 1 },
  rotspring: { fixed: [0, 1], spring: 2 }
};

const holdsTurning = (type: Support['type']) => type === 'fixed' || type === 'guided' || type === 'rotspring';

/** A 6×6 element stiffness in local freedoms (u, v, θ at a, then b). */
function localStiffness(e: Element, l: number) {
  const ea = (e.EA * AXIAL) / l;
  const k = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  k[0][0] = k[3][3] = ea;
  k[0][3] = k[3][0] = -ea;
  if (e.bar) return k;
  const [a, b, c, d] = [(12 * e.EI) / l ** 3, (6 * e.EI) / l ** 2, (4 * e.EI) / l, (2 * e.EI) / l];
  const rows = [
    [1, 1, a], [1, 2, b], [1, 4, -a], [1, 5, b],
    [2, 2, c], [2, 4, -b], [2, 5, d],
    [4, 4, a], [4, 5, -b],
    [5, 5, c]
  ] as const;
  for (const [i, j, v] of rows) k[i][j] = k[j][i] = v;
  return k;
}

/** The consistent loads at the ends of a piece with linear distributed loads (in the solve's units). */
function localLoads(p: [number, number], q: [number, number], l: number, bar: boolean) {
  const f = [l * (2 * p[0] + p[1]) / 6, 0, 0, l * (p[0] + 2 * p[1]) / 6, 0, 0];
  if (bar) return f;
  f[1] = (l * (7 * q[0] + 3 * q[1])) / 20;
  f[2] = (l * l * (3 * q[0] + 2 * q[1])) / 60;
  f[4] = (l * (3 * q[0] + 7 * q[1])) / 20;
  f[5] = (-l * l * (2 * q[0] + 3 * q[1])) / 60;
  return f;
}

/** Static condensation of the released turning freedoms: k and f with those rows and columns folded in (left zero). */
function condense(k: number[][], f: number[], released: number[]) {
  if (!released.length) return { k, f };
  const keep = [0, 1, 2, 3, 4, 5].filter((i) => !released.includes(i));
  const rr = released.map((i) => released.map((j) => k[i][j]));
  const inv = invertSmall(rr);
  const kc = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  const fc = new Array<number>(6).fill(0);
  for (const i of keep) {
    // row i's coupling to the released freedoms, times inverse
    const w = released.map((_, a) => released.reduce((sum, r, b) => sum + k[i][r] * inv[b][a], 0));
    for (const j of keep) kc[i][j] = k[i][j] - released.reduce((sum, r, a) => sum + w[a] * k[r][j], 0);
    fc[i] = f[i] - released.reduce((sum, r, a) => sum + w[a] * f[r], 0);
  }
  return { k: kc, f: fc };
}

function invertSmall(m: number[][]) {
  if (m.length === 1) return [[1 / m[0][0]]];
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  return [
    [m[1][1] / det, -m[0][1] / det],
    [-m[1][0] / det, m[0][0] / det]
  ];
}

/** Solves A x = b in place by Gaussian elimination with partial pivoting; a column with no usable pivot is returned. */
function gauss(A: number[][], b: number[], tolerance: number): { x: number[] } | { singular: number } {
  const n = b.length;
  const order = A.map((_, i) => i);
  for (let col = 0; col < n; col += 1) {
    let best = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[best][col])) best = r;
    if (Math.abs(A[best][col]) < tolerance) return { singular: col };
    [A[col], A[best]] = [A[best], A[col]];
    [b[col], b[best]] = [b[best], b[col]];
    [order[col], order[best]] = [order[best], order[col]];
    for (let r = col + 1; r < n; r += 1) {
      const factor = A[r][col] / A[col][col];
      if (!factor) continue;
      for (let c = col; c < n; c += 1) A[r][c] -= factor * A[col][c];
      b[r] -= factor * b[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = b[r];
    for (let c = r + 1; c < n; c += 1) sum -= A[r][c] * x[c];
    x[r] = sum / A[r][r];
  }
  return { x };
}

/** The degree of indeterminacy: unknown forces (3 a beam, 1 a bar, less each released end, plus reactions) less equations. */
export function indeterminacy(model: StructureModel) {
  const all = members(model).filter((m) => m.a !== m.b);
  const used = new Set(all.flatMap((m) => [m.a, m.b]));
  const nodes = nodeMap(model);
  const hinge = (id: string) => !!nodes.get(id)?.hinge;
  const endReleased = (m: Member, end: 0 | 1) => !m.bar && (!!m.release?.[end] || hinge(end ? m.b : m.a));
  const sups = supports(model).filter((s) => used.has(s.node));
  const turns = (id: string) => all.some((m) => !m.bar && ((m.a === id && !endReleased(m, 0)) || (m.b === id && !endReleased(m, 1)))) || sups.some((s) => s.node === id && holdsTurning(s.type));
  const unknowns = all.reduce((n, m) => n + (m.bar ? 1 : 3 - (endReleased(m, 0) ? 1 : 0) - (endReleased(m, 1) ? 1 : 0)), 0);
  const reactions = sups.reduce((n, s) => n + RESTRAINTS[s.type].fixed.length + (RESTRAINTS[s.type].spring !== undefined ? 1 : 0), 0);
  const equations = [...used].reduce((n, id) => n + (turns(id) ? 3 : 2), 0);
  return unknowns + reactions - equations;
}

const DIRECTIONS = ['sideways', 'up and down', 'by turning'];

export function solve(model: StructureModel): Solution {
  const notes: string[] = [];
  const result = (status: Status, rest: Partial<Solution> = {}): Solution => ({ status, reactions: [], pieces: new Map(), ends: new Map(), tiny: 0, tinyMoment: 0, notes, ...rest });
  const nodes = nodeMap(model);
  const all = members(model).filter((m) => nodes.has(m.a) && nodes.has(m.b) && frameOf(model, m).length > 0);
  if (!all.length) return result({ kind: 'empty', text: 'Draw a member to start: pick Beam or Truss bar, then drag from one point to another.' });

  // lengths in the solve are fractions of the largest member, so millimetres and metres solve alike
  const Lc = Math.max(...all.map((m) => frameOf(model, m).length));
  const loads = model.parts.filter((p) => p.kind === 'force' || p.kind === 'moment' || p.kind === 'dist');

  // ─── pieces: each member cut at its loads ───
  const index = new Map<string, number>();
  const points: { at: Pt; name: string; real?: string }[] = [];
  const nodeIndex = (id: string) => {
    if (!index.has(id)) {
      const n = nodes.get(id)!;
      index.set(id, points.length);
      points.push({ at: { x: n.x, y: n.y }, name: n.name ? `node ${n.name}` : 'a node', real: id });
    }
    return index.get(id)!;
  };
  const elements: Element[] = [];
  /** where along each member its cuts are, and the point index at each */
  const cutsOf = new Map<string, { s: number; point: number }[]>();
  for (const m of all) {
    const f = frameOf(model, m);
    const L = f.length;
    // loads closer than this to a joint or each other act there: a piece much shorter swamps the solve
    const tol = L * 1e-3;
    const stops = [0, L];
    for (const p of loads) {
      if (p.kind === 'dist' && p.member === m.id) stops.push(Math.max(0, Math.min(L, p.from)), Math.max(0, Math.min(L, p.to)));
      else if (p.kind !== 'dist' && 'member' in p.on && p.on.member === m.id) stops.push(Math.max(0, Math.min(L, p.on.at)));
    }
    const sorted = stops.sort((x, y) => x - y).reduce<number[]>((kept, s) => (kept.length && s - kept[kept.length - 1] <= tol ? kept : [...kept, s]), []);
    if (sorted[sorted.length - 1] < L) sorted[sorted.length - 1] = L;
    const onBar = m.bar && (sorted.length > 2 || loads.some((p) => p.kind === 'dist' && p.member === m.id));
    if (onBar) return result({ kind: 'error', text: `Truss bar ${memberName(model, m)} carries loads at its ends only. Make it a beam member, or put the load on a joint.` });
    const cuts = sorted.map((s, i) => {
      if (i === 0) return { s, point: nodeIndex(m.a) };
      if (i === sorted.length - 1) return { s, point: nodeIndex(m.b) };
      points.push({ at: { x: f.a.x + f.u.x * s, y: f.a.y + f.u.y * s }, name: `member ${memberName(model, m)}` });
      return { s, point: points.length - 1 };
    });
    cutsOf.set(m.id, cuts);
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const [from, to] = [cuts[i].s, cuts[i + 1].s];
      const e: Element = {
        member: m,
        s0: from,
        L: to - from,
        nodes: [cuts[i].point, cuts[i + 1].point],
        released: [
          i === 0 && !m.bar && (!!m.release?.[0] || !!nodes.get(m.a)?.hinge),
          i === cuts.length - 2 && !m.bar && (!!m.release?.[1] || !!nodes.get(m.b)?.hinge)
        ],
        bar: !!m.bar,
        EI: m.EI && m.EI > 0 ? m.EI : 1,
        EA: m.EA && m.EA > 0 ? m.EA : 1,
        c: f.u.x,
        s: f.u.y,
        p: [0, 0],
        q: [0, 0]
      };
      for (const p of loads) {
        if (p.kind !== 'dist' || p.member !== m.id || p.to - p.from <= tol) continue;
        const [lo, hi] = [Math.min(p.from, p.to), Math.max(p.from, p.to)];
        if (from < lo - tol || to > hi + tol) continue;
        const w = (s: number) => p.w1 + ((p.w2 - p.w1) * (s - p.from)) / (p.to - p.from);
        const d = loadDirection(p, f.u);
        const along = d.x * f.u.x + d.y * f.u.y;
        const across = d.x * f.n.x + d.y * f.n.y;
        e.p = [e.p[0] + w(from) * along, e.p[1] + w(to) * along];
        e.q = [e.q[0] + w(from) * across, e.q[1] + w(to) * across];
      }
      elements.push(e);
    }
  }
  /** the cut nearest a distance along a member: where the solve puts a load there */
  const cutAt = (member: string, at: number) => cutsOf.get(member)?.reduce((best, c) => (Math.abs(c.s - at) < Math.abs(best.s - at) ? c : best));
  const pointAt = (place: { node: string } | { member: string; at: number }) => ('node' in place ? index.get(place.node) : cutAt(place.member, place.at)?.point);

  // ─── freedoms ───
  const sups = supports(model).filter((s) => index.has(s.node));
  const supportAt = new Map<number, Support>();
  for (const s of sups) supportAt.set(index.get(s.node)!, s);
  const turns = points.map((_, i) => elements.some((e) => !e.bar && ((e.nodes[0] === i && !e.released[0]) || (e.nodes[1] === i && !e.released[1]))) || (supportAt.has(i) && holdsTurning(supportAt.get(i)!.type)));
  const dofs: number[][] = [];
  let count = 0;
  for (let i = 0; i < points.length; i += 1) dofs.push([count++, count++, turns[i] ? count++ : -1]);
  const K = Array.from({ length: count }, () => new Array<number>(count).fill(0));
  const F = new Array<number>(count).fill(0);

  // ─── elements ───
  const transform = (e: Element) => {
    const T = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
    for (const o of [0, 3]) {
      T[o][o] = e.c;
      T[o][o + 1] = e.s;
      T[o + 1][o] = -e.s;
      T[o + 1][o + 1] = e.c;
      T[o + 2][o + 2] = 1;
    }
    return T;
  };
  const elementDofs = (e: Element) => [...dofs[e.nodes[0]], ...dofs[e.nodes[1]]];
  const prepared = elements.map((e) => {
    const l = e.L / Lc;
    const k = localStiffness(e, l);
    const f = localLoads([e.p[0] * Lc, e.p[1] * Lc], [e.q[0] * Lc, e.q[1] * Lc], l, e.bar);
    const released = e.bar ? [] : [e.released[0] && 2, e.released[1] && 5].filter((x): x is number => typeof x === 'number');
    const kept = condense(k, f, released);
    const T = transform(e);
    const map = elementDofs(e);
    for (let i = 0; i < 6; i += 1) {
      const gi = map[i];
      if (gi < 0) continue;
      F[gi] += T.reduce((sum, row, r) => sum + row[i] * kept.f[r], 0);
      for (let j = 0; j < 6; j += 1) {
        const gj = map[j];
        if (gj < 0) continue;
        let v = 0;
        for (let r = 0; r < 6; r += 1) for (let c = 0; c < 6; c += 1) v += T[r][i] * kept.k[r][c] * T[c][j];
        K[gi][gj] += v;
      }
    }
    return { e, k, f, released, T, map };
  });

  // ─── point loads and moments ───
  for (const p of loads) {
    if (p.kind === 'dist') continue;
    const at = pointAt(p.on);
    if (at === undefined) {
      notes.push('A load sits on nothing the structure carries, so it is left out.');
      continue;
    }
    if (p.kind === 'force') {
      const member = 'member' in p.on ? all.find((m) => m.id === (p.on as { member: string }).member) : undefined;
      const d = loadDirection(p, member ? frameOf(model, member).u : undefined);
      F[dofs[at][0]] += p.value * d.x;
      F[dofs[at][1]] += p.value * d.y;
    } else if (dofs[at][2] < 0) {
      notes.push(`The moment at ${points[at].name} has nothing to turn: every member end there is hinged.`);
    } else F[dofs[at][2]] += ((p.cw ? -1 : 1) * p.value) / Lc;
  }

  // ─── supports: freedoms turned into the support's frame, then held or sprung ───
  const turned = new Map<number, { c: number; s: number }>();
  for (const [i, sup] of supportAt) {
    const t = ((sup.angle || 0) * Math.PI) / 180;
    if (Math.abs(t) > 1e-12) turned.set(i, { c: Math.cos(t), s: Math.sin(t) });
  }
  // K' = Rᵀ K R and F' = Rᵀ F, where R takes the support frame (along, out) to x and y
  for (const [i, { c, s }] of turned) {
    const [x, y] = dofs[i];
    for (const row of K) [row[x], row[y]] = [row[x] * c + row[y] * s, -row[x] * s + row[y] * c];
    [K[x], K[y]] = [K[x].map((v, j) => v * c + K[y][j] * s), K[x].map((v, j) => -v * s + K[y][j] * c)];
    [F[x], F[y]] = [F[x] * c + F[y] * s, -F[x] * s + F[y] * c];
  }
  const held = new Set<number>();
  const springs: { dof: number; k: number }[] = [];
  for (const [i, sup] of supportAt) {
    const r = RESTRAINTS[sup.type];
    for (const local of r.fixed) if (dofs[i][local] >= 0) held.add(dofs[i][local]);
    if (r.spring !== undefined && dofs[i][r.spring] >= 0) {
      const k = sup.k && sup.k > 0 ? sup.k : 1;
      springs.push({ dof: dofs[i][r.spring], k });
      K[dofs[i][r.spring]][dofs[i][r.spring]] += k;
    }
  }

  // ─── solve the free freedoms ───
  const free = [...Array(count).keys()].filter((d) => !held.has(d));
  // scaled by the diagonal first, so a short piece beside a load (very stiff) doesn't swamp the tolerance
  const sc = free.map((d) => (K[d][d] ? 1 / Math.sqrt(Math.abs(K[d][d])) : 1));
  const solved = gauss(free.map((r, i) => free.map((c, j) => K[r][c] * sc[i] * sc[j])), free.map((r, i) => F[r] * sc[i]), 1e-9);
  if ('x' in solved) solved.x = solved.x.map((v, i) => v * sc[i]);
  if ('singular' in solved) {
    const dof = free[solved.singular];
    const at = dofs.findIndex((row) => row.includes(dof));
    const way = dofs[at].indexOf(dof);
    const name = points[at].name;
    return result({ kind: 'unstable', text: `Unstable: ${name} can move ${DIRECTIONS[way]}.`, node: points[at].real });
  }
  const D = new Array<number>(count).fill(0);
  free.forEach((d, i) => (D[d] = solved.x[i]));

  // ─── reactions, in each support's frame then turned back ───
  const load = Math.max(1e-300, ...F.map(Math.abs));
  const reactions: Reaction[] = [];
  for (const [i, sup] of supportAt) {
    const r = [0, 1, 2].map((local) => {
      const dof = dofs[i][local];
      if (dof < 0) return 0;
      if (held.has(dof)) return K[dof].reduce((sum, k, j) => sum + k * D[j], 0) - F[dof];
      const spring = springs.find((x) => x.dof === dof);
      return spring ? -spring.k * D[dof] : 0;
    });
    const { c, s } = turned.get(i) ?? { c: 1, s: 0 };
    reactions.push({ support: sup.id, node: sup.node, force: { x: r[0] * c - r[1] * s, y: r[0] * s + r[1] * c }, moment: r[2] * Lc, local: [r[0], r[1]] });
  }
  // displacements back to x and y
  for (const [i, { c, s }] of turned) {
    const [x, y] = dofs[i];
    [D[x], D[y]] = [D[x] * c - D[y] * s, D[x] * s + D[y] * c];
  }

  // ─── forces along each piece ───
  const pieces = new Map<string, Piece[]>();
  const ends = new Map<string, [EndForce, EndForce]>();
  for (const { e, k, f, released, T, map } of prepared) {
    const global = map.map((g) => (g >= 0 ? D[g] : 0));
    const d = T.map((row) => row.reduce((sum, v, j) => sum + v * global[j], 0));
    if (released.length) {
      // the released turns, from the rest: k_rr d_r = f_r − k_rk d_k
      const keep = [0, 1, 2, 3, 4, 5].filter((i) => !released.includes(i));
      const rhs = released.map((r) => f[r] - keep.reduce((sum, j) => sum + k[r][j] * d[j], 0));
      const inv = invertSmall(released.map((i) => released.map((j) => k[i][j])));
      released.forEach((r, a) => (d[r] = inv[a].reduce((sum, v, b) => sum + v * rhs[b], 0)));
    }
    const p = k.map((row, i) => row.reduce((sum, v, j) => sum + v * d[j], 0) - f[i]);
    const [Fx, Fy, Ma] = [p[0], p[1], p[2] * Lc];
    const { L } = e;
    const [p1, p2] = e.p;
    const [q1, q2] = e.q;
    const piece: Piece = {
      s0: e.s0,
      L,
      N: [-Fx, -p1, -(p2 - p1) / (2 * L), 0],
      V: [Fy, q1, (q2 - q1) / (2 * L), 0],
      M: [-Ma, Fy, q1 / 2, (q2 - q1) / (6 * L)]
    };
    pieces.set(e.member.id, [...(pieces.get(e.member.id) ?? []), piece]);
    // the ends' forces on their nodes (the reverse of p), back in x and y
    const back = (o: number): EndForce => ({ force: { x: -(p[o] * e.c - p[o + 1] * e.s), y: -(p[o] * e.s + p[o + 1] * e.c) }, moment: -p[o + 2] * Lc });
    const was = ends.get(e.member.id);
    ends.set(e.member.id, [was && e.s0 > 0 ? was[0] : back(0), back(3)]);
  }

  // ─── the check: the loads and reactions balance ───
  const total = { x: 0, y: 0, m: 0 };
  const add = (at: Pt, force: Pt, moment = 0) => {
    total.x += force.x;
    total.y += force.y;
    total.m += at.x * force.y - at.y * force.x + moment;
  };
  for (const r of reactions) add(nodes.get(r.node)!, r.force, r.moment);
  for (const p of loads) {
    if (p.kind === 'dist') {
      const m = all.find((x) => x.id === p.member);
      if (!m) continue;
      const f = frameOf(model, m);
      // the load as the solve carries it: its ends at their cuts (within the member), its values there
      const [from, to] = [cutAt(m.id, p.from)!.s, cutAt(m.id, p.to)!.s];
      const at = (s: number) => (p.to === p.from ? p.w1 : p.w1 + ((p.w2 - p.w1) * (s - p.from)) / (p.to - p.from));
      const [w1, w2] = [at(from), at(to)];
      const d = loadDirection(p, f.u);
      const span = to - from;
      const W = ((w1 + w2) / 2) * span;
      const centre = w1 + w2 ? from + (span * (w1 + 2 * w2)) / (3 * (w1 + w2)) : from + span / 2;
      // a load whose ends have opposite signs: its two triangles
      const parts = Math.sign(w1) * Math.sign(w2) < 0 ? [[w1, 0, from, from + (span * w1) / (w1 - w2)], [0, w2, from + (span * w1) / (w1 - w2), to]] : [[w1, w2, from, to]];
      if (parts.length === 1) add({ x: f.a.x + f.u.x * centre, y: f.a.y + f.u.y * centre }, { x: d.x * W, y: d.y * W });
      else
        for (const [v1, v2, start, end] of parts) {
          const s = end - start;
          const c = start + (s * (v1 + 2 * v2)) / (3 * (v1 + v2));
          const w = ((v1 + v2) / 2) * s;
          add({ x: f.a.x + f.u.x * c, y: f.a.y + f.u.y * c }, { x: d.x * w, y: d.y * w });
        }
    } else {
      if (pointAt(p.on) === undefined) continue;
      const member = 'member' in p.on ? all.find((m) => m.id === (p.on as { member: string }).member) : undefined;
      const at = points[pointAt(p.on)!].at;
      if (p.kind === 'force') {
        const d = loadDirection(p, member ? frameOf(model, member).u : undefined);
        add(at, { x: p.value * d.x, y: p.value * d.y });
      } else if (dofs[pointAt(p.on)!][2] >= 0) add(at, { x: 0, y: 0 }, (p.cw ? -1 : 1) * p.value);
    }
  }
  const forceScale = Math.max(load, ...reactions.map((r) => Math.hypot(r.force.x, r.force.y)));
  const tiny = forceScale * 1e-6;
  if (Math.abs(total.x) + Math.abs(total.y) > tiny * 10 || Math.abs(total.m) > tiny * 10 * Lc) {
    return result({ kind: 'error', text: 'The solve didn’t balance, so its results aren’t shown. Check for members that overlap.' });
  }
  const clean = (v: number) => (Math.abs(v) < tiny ? 0 : v);
  for (const r of reactions) {
    r.force = { x: clean(r.force.x), y: clean(r.force.y) };
    r.moment = clean(r.moment / Lc) * Lc;
    r.local = [clean(r.local[0]), clean(r.local[1])];
  }

  const degree = indeterminacy(model);
  const relative = all.some((m) => !m.bar) ? 'relative EI used' : 'relative EA used';
  const status: Status = degree > 0 ? { kind: 'ok', text: `Indeterminate to degree ${degree} (${relative})`, degree } : { kind: 'ok', text: 'Determinate and stable', degree: 0 };
  return { status, reactions, pieces, ends, tiny, tinyMoment: tiny * Lc, notes };
}

/** The forces in a member at a distance along it: the piece there, and N, V and M (the left piece at a jump). */
export function forcesAt(solution: Solution, member: string, s: number) {
  const list = solution.pieces.get(member) ?? [];
  const piece = list.find((p) => s <= p.s0 + p.L + 1e-12) ?? list[list.length - 1];
  if (!piece) return { N: 0, V: 0, M: 0 };
  const t = Math.max(0, Math.min(piece.L, s - piece.s0));
  return { N: evalPoly(piece.N, t), V: evalPoly(piece.V, t), M: evalPoly(piece.M, t) };
}

/** A bar's force (tension positive): its axial force, the same all along. */
export const axialForce = (solution: Solution, member: string) => forcesAt(solution, member, 0).N;
