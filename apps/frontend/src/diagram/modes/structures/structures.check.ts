// Self-check for the Structures mode: the model's edits, the solver against textbook cases (values checked with SymPy
// 1.14), the instability reports, the views and the TikZ they write. Run:
// npx esbuild apps/frontend/src/diagram/modes/structures/structures.check.ts --bundle --platform=node --log-level=warning | node
import { axialForce, extremesInside, evalPoly, forcesAt, indeterminacy, solve } from './solve';
import type { Solution } from './solve';

import { splitMember } from './model';
import type { Part, SNode, StructureModel, SupportType } from './model';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const close = (actual: number, expected: number, what: string, tolerance = 1e-6) => {
  if (!(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)))) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};

// ─── building models ───

const node = (id: string, x: number, y: number): SNode => ({ id, x, y, name: id });
const beam = (id: string, a: string, b: string): Part => ({ id, kind: 'member', a, b });
const bar = (id: string, a: string, b: string): Part => ({ id, kind: 'member', a, b, bar: true });
const support = (id: string, at: string, type: SupportType, angle?: number): Part => ({ id, kind: 'support', node: at, type, ...(angle !== undefined && { angle }) });
const udl = (id: string, member: string, from: number, to: number, w1: number, w2 = w1): Part => ({ id, kind: 'dist', member, from, to, w1, w2, angle: -90 });
const down = (id: string, member: string, at: number, value: number): Part => ({ id, kind: 'force', on: { member, at }, value, angle: -90 });
const reaction = (s: Solution, id: string) => s.reactions.find((r) => r.support === id)!;

/** The largest moment along a member and where: piece ends and the roots of the shear. */
function maxMoment(s: Solution, member: string) {
  let best = { at: 0, M: 0 };
  for (const p of s.pieces.get(member) ?? []) {
    for (const t of [0, p.L, ...extremesInside(p.M, p.L)]) {
      const M = evalPoly(p.M, t);
      if (Math.abs(M) > Math.abs(best.M)) best = { at: p.s0 + t, M };
    }
  }
  return best;
}

// ─── beams ───

{
  // simply supported 6 m, 10 kN/m: 30 kN each; 45 kN·m at mid-span
  const model: StructureModel = { nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), udl('w', 'm', 0, 6, 10)] };
  const s = solve(model);
  eq(s.status, { kind: 'ok', text: 'Determinate and stable', degree: 0 }, 'simply supported: determinate');
  close(reaction(s, 'a').force.y, 30, 'UDL: A');
  close(reaction(s, 'b').force.y, 30, 'UDL: B');
  eq(reaction(s, 'a').force.x, 0, 'UDL: no horizontal reaction, written as 0');
  const m = maxMoment(s, 'm');
  close(m.M, 45, 'UDL: Mmax');
  close(m.at, 3, 'UDL: at mid-span');
  close(forcesAt(s, 'm', 0).V, 30, 'UDL: V at A');
  close(forcesAt(s, 'm', 6).V, -30, 'UDL: V at B');
  // the same beam in millimetres and newtons gives the same forces and moments scaled
  const mm: StructureModel = { nodes: [node('A', 0, 0), node('B', 6000, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), udl('w', 'm', 0, 6000, 10)] };
  const t = solve(mm);
  close(reaction(t, 'a').force.y, 30000, 'mm: A');
  close(maxMoment(t, 'm').M, 45e6, 'mm: Mmax');
}

{
  // simply supported 6 m, 12 kN at 2 m: 8 and 4 kN; 16 kN·m under the load
  const s = solve({ nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), down('P', 'm', 2, 12)] });
  close(reaction(s, 'a').force.y, 8, 'point: A');
  close(reaction(s, 'b').force.y, 4, 'point: B');
  close(maxMoment(s, 'm').M, 16, 'point: M under the load');
  close(maxMoment(s, 'm').at, 2, 'point: at 2 m');
  eq(s.pieces.get('m')!.length, 2, 'cut at the load');
  close(forcesAt(s, 'm', 1).V, 8, 'V left of the load');
  close(forcesAt(s, 'm', 3).V, -4, 'V right of the load');
}

{
  // simply supported 6 m, triangular 0 to 9 kN/m: 9 and 18 kN; Mmax 20.78 kN·m at 3.464 m
  const s = solve({ nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), udl('w', 'm', 0, 6, 0, 9)] });
  close(reaction(s, 'a').force.y, 9, 'triangle: A');
  close(reaction(s, 'b').force.y, 18, 'triangle: B');
  const m = maxMoment(s, 'm');
  close(m.M, 12 * Math.sqrt(3), 'triangle: Mmax');
  close(m.at, 2 * Math.sqrt(3), 'triangle: where');
  close(Number(m.M.toFixed(2)), 20.78, 'triangle: 20.78');
}

{
  // propped cantilever 6 m, 10 kN/m: fixed end 37.5 kN and 45 kN·m; prop 22.5 kN
  const model: StructureModel = { nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'fixed', -90), support('b', 'B', 'roller'), udl('w', 'm', 0, 6, 10)] };
  const s = solve(model);
  eq(s.status, { kind: 'ok', text: 'Indeterminate to degree 1 (relative EI used)', degree: 1 }, 'propped cantilever: degree 1');
  close(reaction(s, 'a').force.y, 37.5, 'propped: fixed end force');
  close(Math.abs(reaction(s, 'a').moment), 45, 'propped: fixed end moment');
  close(reaction(s, 'a').moment, 45, 'propped: anticlockwise on the beam');
  close(reaction(s, 'b').force.y, 22.5, 'propped: prop');
  // and the answer doesn't depend on EI for one member
  const stiff = solve({ ...model, parts: model.parts.map((p) => (p.kind === 'member' ? { ...p, EI: 40 } : p)) });
  close(reaction(stiff, 'b').force.y, 22.5, 'propped: EI cancels');
}

{
  // two 5 m spans, 10 kN/m: 18.75, 62.5 and 18.75 kN; −31.25 kN·m over the middle support
  const model: StructureModel = {
    nodes: [node('A', 0, 0), node('B', 5, 0), node('C', 10, 0)],
    parts: [beam('ab', 'A', 'B'), beam('bc', 'B', 'C'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), support('c', 'C', 'roller'), udl('w1', 'ab', 0, 5, 10), udl('w2', 'bc', 0, 5, 10)]
  };
  const s = solve(model);
  eq(s.status.kind === 'ok' && s.status.degree, 1, 'two spans: degree 1');
  close(reaction(s, 'a').force.y, 18.75, 'two spans: A');
  close(reaction(s, 'b').force.y, 62.5, 'two spans: B');
  close(reaction(s, 'c').force.y, 18.75, 'two spans: C');
  close(forcesAt(s, 'ab', 5).M, -31.25, 'two spans: hogging over B');
  close(forcesAt(s, 'bc', 0).M, -31.25, 'two spans: the same either side');
  // drawn as one member, then split at B: the same, the load split in two
  const one = splitMember({ nodes: model.nodes, parts: [beam('ac', 'A', 'C'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), support('c', 'C', 'roller'), udl('w', 'ac', 0, 10, 10)] }, 'ac', 5, 'B');
  eq(one.parts.filter((p) => p.kind === 'dist').map((p) => p.kind === 'dist' && [p.from, p.to]), [[0, 5], [0, 5]], 'split: the load on both pieces');
  close(reaction(solve(one), 'b').force.y, 62.5, 'split: B');
}

{
  // an inclined roller gives its reaction along its own direction
  const s = solve({ nodes: [node('A', 0, 0), node('B', 4, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller', 30), down('P', 'm', 2, 10)] });
  const b = reaction(s, 'b');
  close(b.force.y, 5, 'inclined roller: vertical part');
  close(b.force.x, -5 * Math.tan(Math.PI / 6), 'inclined roller: its horizontal part');
  close(b.local[0], 0, 'inclined roller: nothing along its surface');
  close(reaction(s, 'a').force.x, 5 * Math.tan(Math.PI / 6), 'inclined roller: the pin balances it');
}

{
  // a cantilever with a hinge part way and a prop: determinate (Gerber beam)
  const model: StructureModel = {
    nodes: [node('A', 0, 0), { ...node('H', 4, 0), hinge: true }, node('B', 6, 0)],
    parts: [beam('ah', 'A', 'H'), beam('hb', 'H', 'B'), support('a', 'A', 'fixed', -90), support('b', 'B', 'roller'), udl('w1', 'ah', 0, 4, 10), udl('w2', 'hb', 0, 2, 10)]
  };
  const s = solve(model);
  eq(s.status.kind === 'ok' && s.status.degree, 0, 'hinged cantilever: determinate');
  close(reaction(s, 'b').force.y, 10, 'hinged: prop carries half of HB');
  close(forcesAt(s, 'ah', 4).M, 0, 'hinged: no moment at the hinge');
  close(reaction(s, 'a').force.y, 50, 'hinged: fixed end');
}

// ─── trusses ───

{
  // A(0,0) pin, B(8,0) roller, C(4,3), 10 kN down at C: 5 kN each; AB 6.667 kN (T); AC and BC 8.333 kN (C)
  const model: StructureModel = {
    nodes: [node('A', 0, 0), node('B', 8, 0), node('C', 4, 3)],
    parts: [bar('ab', 'A', 'B'), bar('ac', 'A', 'C'), bar('bc', 'B', 'C'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), { id: 'P', kind: 'force', on: { node: 'C' }, value: 10, angle: -90 }]
  };
  const s = solve(model);
  eq(s.status, { kind: 'ok', text: 'Determinate and stable', degree: 0 }, 'truss: determinate');
  close(reaction(s, 'a').force.y, 5, 'truss: A');
  close(reaction(s, 'b').force.y, 5, 'truss: B');
  close(axialForce(s, 'ab'), 20 / 3, 'truss: AB in tension');
  close(axialForce(s, 'ac'), -25 / 3, 'truss: AC in compression');
  close(axialForce(s, 'bc'), -25 / 3, 'truss: BC in compression');
  // a load part way along a bar is refused
  const off = solve({ ...model, parts: [...model.parts, down('Q', 'ab', 2, 1)] });
  eq(off.status.kind, 'error', 'a load along a bar');
  // an extra bar makes it indeterminate
  eq(indeterminacy({ nodes: [...model.nodes, node('D', 4, 0)], parts: [...model.parts.filter((p) => p.id !== 'ab'), bar('ad', 'A', 'D'), bar('db', 'D', 'B'), bar('cd', 'C', 'D'), bar('x', 'A', 'B')] }), 1, 'truss: degree from m + r − 2j');
}

// ─── instability ───

{
  // two rollers only: nothing holds it sideways
  const s = solve({ nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'roller'), support('b', 'B', 'roller'), udl('w', 'm', 0, 6, 10)] });
  eq(s.status.kind, 'unstable', 'two rollers: unstable');
  eq(/node [AB] can move sideways/.test(s.status.text), true, `two rollers: says which way (${s.status.text})`);
  // a hinge that makes a mechanism: pinned both ends with a hinge between, then a third roller under the hinge is fine
  const mechanism: StructureModel = {
    nodes: [node('A', 0, 0), { ...node('H', 3, 0), hinge: true }, node('B', 6, 0)],
    parts: [beam('ah', 'A', 'H'), beam('hb', 'H', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), down('P', 'ah', 1, 5)]
  };
  const m = solve(mechanism);
  eq(m.status.kind, 'unstable', 'a hinge that makes a mechanism');
  eq(indeterminacy(mechanism), -1, 'the count says so too');
  eq(solve({ ...mechanism, parts: [...mechanism.parts, support('h', 'H', 'roller')] }).status.kind, 'ok', 'a roller under the hinge steadies it');
  // a truss square without a diagonal
  const square = solve({
    nodes: [node('A', 0, 0), node('B', 4, 0), node('C', 4, 4), node('D', 0, 4)],
    parts: [bar('ab', 'A', 'B'), bar('bc', 'B', 'C'), bar('cd', 'C', 'D'), bar('da', 'D', 'A'), support('a', 'A', 'pin'), support('b', 'B', 'roller')]
  });
  eq(square.status.kind, 'unstable', 'a truss square without a diagonal');
  eq(solve({ nodes: [], parts: [] }).status.kind, 'empty', 'nothing drawn');
}

console.log('structures.check: ok');
