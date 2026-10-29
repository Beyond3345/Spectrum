// Self-check for the Structures mode: the model's edits, the solver against textbook cases (values checked with SymPy
// 1.14), the instability reports, the views and the TikZ they write. Run:
// npx esbuild apps/frontend/src/diagram/modes/structures/structures.check.ts --bundle --platform=node --log-level=warning | node
import { axialForce, extremesInside, evalPoly, forcesAt, indeterminacy, solve } from './solve';
import type { Solution } from './solve';
import { connect, copyIds, fitLoads, nodeAt, pasteInto, placeTool, removeIds, sampleBeam, settleNode, splitMember } from './model';
import type { Part, SNode, StructureModel, SupportType } from './model';
import { buildScene, cutSection, formatValue, readStyle } from './draw';
import type { Item } from './draw';
import { structureCode, structureStyle } from './code';
import { diagramFileText, readDiagramFile } from '../../fileFormat';
import type { DiagramFile } from '../../types';

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
  // simply supported 6 m, 10 kN at 3 m pointing 30° below the horizontal, to the right: 8.66 kN along, 5 kN down;
  // 2.5 kN up at each end, the pin takes the 8.66 kN; 7.5 kN·m at mid-span
  const s = solve({ nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), { id: 'P', kind: 'force', on: { member: 'm', at: 3 }, value: 10, angle: -30 }] });
  close(reaction(s, 'a').force.y, 2.5, 'angled: A up');
  close(reaction(s, 'b').force.y, 2.5, 'angled: B up');
  close(reaction(s, 'a').force.x, -5 * Math.sqrt(3), 'angled: A takes the push along');
  close(maxMoment(s, 'm').M, 7.5, 'angled: M at mid-span');
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

{
  // a load right beside a member's end: still stable; within a thousandth of the member it acts at the end
  const cantilever = (at: number): StructureModel => ({ nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'fixed', -90), down('P', 'm', at, 10)] });
  for (const [at, moment] of [[5.99, 59.9], [5.98, 59.8], [5.9999, 60], [1e-4, 0], [0.01, 0.1]]) {
    const s = solve(cantilever(at));
    eq(s.status.kind, 'ok', `cantilever, 10 kN at ${at} m: stable`);
    close(reaction(s, 'a').moment, moment, `cantilever, 10 kN at ${at} m: fixed end moment`);
  }
  const partial = solve({ nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'fixed', -90), udl('w', 'm', 0, 5.99, 10)] });
  close(reaction(partial, 'a').force.y, 59.9, 'cantilever, 10 kN/m to 5.99 m');
  const mm = solve({ nodes: [node('A', 0, 0), node('B', 6000, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), down('P', 'm', 5999.9, 10)] });
  eq(mm.status.kind, 'ok', 'mm beam, a load 0.1 mm from its end: stable');
  close(reaction(mm, 'b').force.y, 10, 'mm beam: at B');
}

// ─── edits ───

{
  // a member drawn from a free point onto the middle of another splits it there
  const beamModel = sampleBeam();
  const drawn = connect(beamModel, 'beam', { x: 3, y: 4 }, { x: 3, y: 0 }, 0.05)!;
  eq(drawn.model.nodes.length, 4, 'a new joint at each end');
  eq(drawn.model.parts.filter((p) => p.kind === 'member').length, 3, 'the beam split in two, plus the new member');
  eq(drawn.model.parts.filter((p) => p.kind === 'dist').map((p) => p.kind === 'dist' && [p.from, p.to]), [[0, 3], [0, 3]], 'its load split with it');
  // a support on a joint replaces the one there; a fixed support faces its member
  const fixed = placeTool(beamModel, 'support:fixed', { x: 0, y: 0 }, 0.05)!;
  eq(fixed.model.parts.filter((p) => p.kind === 'support' && p.node === 'n1').map((p) => p.kind === 'support' && [p.type, p.angle]), [['fixed', -90]], 'fixed, its wall behind the beam');
  // a force on a member at a point along it
  const force = placeTool(beamModel, 'force', { x: 2, y: 0 }, 0.05)!;
  eq(force.model.parts.find((p) => p.id === force.id), { id: force.id, kind: 'force', on: { member: 'm1', at: 2 }, value: 10, angle: -90 }, 'a force on the member');
  eq(placeTool(beamModel, 'force', { x: 2, y: 3 }, 0.05), null, 'a force needs something to act on');
  const hinge = placeTool(beamModel, 'hinge', { x: 3, y: 0 }, 0.05)!;
  eq(hinge.model.nodes.find((n) => n.id === hinge.id)?.hinge, true, 'a hinge on a member makes a joint there');
  const released = placeTool(beamModel, 'release', { x: 5.5, y: 0 }, 0.05)!;
  eq(released.model.parts.find((p) => p.id === 'm1'), { id: 'm1', kind: 'member', a: 'n1', b: 'n2', release: [false, true] }, 'the end nearer the click released');
  // a node dragged onto another merges into it
  const twoBeams = connect(beamModel, 'beam', { x: 6, y: 0 }, { x: 9, y: 0 }, 0.05)!.model;
  const c = twoBeams.nodes.find((n) => n.name === 'C')!;
  const merged = settleNode({ ...twoBeams, nodes: twoBeams.nodes.map((n) => (n.id === c.id ? { ...n, x: 6, y: 0 } : n)) }, c.id, 0.05);
  eq([merged.nodes.length, merged.parts.filter((p) => p.kind === 'member').length], [2, 1], 'merged, and the member between them gone');
  // a node dropped on a member splits it
  const free = nodeAt(beamModel, { x: 2, y: 2 }, 0.05);
  const dropped = settleNode({ ...free.model, nodes: free.model.nodes.map((n) => (n.id === free.node ? { ...n, y: 0 } : n)) }, free.node, 0.05);
  eq(dropped.parts.filter((p) => p.kind === 'member').length, 2, 'dropped on the beam, splitting it');
  // a joint moved in to shorten its member takes the loads along with it
  const moveB = (m: StructureModel, x: number) => ({ ...m, nodes: m.nodes.map((n) => (n.id === 'n2' ? { ...n, x } : n)) });
  const shorter = settleNode(moveB(beamModel, 4), 'n2', 0.05);
  eq(shorter.parts.filter((p) => p.kind === 'dist').map((p) => p.kind === 'dist' && [p.from, p.to, p.w1, p.w2]), [[0, 4, 10, 10]], 'the UDL fits the shorter beam');
  close(reaction(solve(shorter), 'p2').force.y, 20, 'and solves: 20 kN each');
  eq(solve(moveB(beamModel, 4)).status.kind, 'ok', 'a load past the end balances (cut off at the end)');
  const sloped: StructureModel = { ...beamModel, parts: [...beamModel.parts.filter((p) => p.kind !== 'dist'), udl('t', 'm1', 0, 6, 0, 12), down('P', 'm1', 5, 10)] };
  eq(fitLoads(moveB(sloped, 3)).parts.flatMap((p): (number | number[])[] => (p.kind === 'dist' ? [[p.from, p.to, p.w1, p.w2]] : p.kind === 'force' && 'member' in p.on ? [p.on.at] : [])), [[0, 3, 0, 6], 3], 'a triangle cut off part way; a point load to the end');
  eq(fitLoads(beamModel), beamModel, 'loads that fit stay as they are');
  // removing a member takes its loads and its free ends; removing a node takes what hangs on it
  eq(removeIds(beamModel, ['m1']).parts.map((p) => p.id), ['p1', 'p2', 'p4'], 'a member takes its load; the joints keep their supports');
  eq(removeIds({ nodes: beamModel.nodes, parts: [beamModel.parts[0]] }, ['m1']), { nodes: [], parts: [] }, 'and its bare joints go with it');
  eq(removeIds(beamModel, ['n2']).parts.map((p) => p.id), ['p1'], 'a node takes its member, support, load and dimension');
  // copy and paste: fresh ids and letters, loads along
  const pasted = pasteInto(beamModel, copyIds(beamModel, ['m1']), { x: 0, y: -3 });
  eq(pasted.model.nodes.map((n) => n.name), ['A', 'B', 'C', 'D'], 'pasted joints get the next letters');
  eq(pasted.model.parts.length, beamModel.parts.length * 2 - 1, 'the member, its supports and its load (not the dimension)');
  eq(pasteInto(beamModel, copyIds(beamModel, ['p3', 'p4']), { x: 0, y: -3 }).model, beamModel, 'a load or dimension copied alone isn’t pasted onto the original');
  eq(new Set([...pasted.model.nodes.map((n) => n.id), ...pasted.model.parts.map((p) => p.id)]).size, pasted.model.nodes.length + pasted.model.parts.length, 'ids stay unique');
}

// ─── views and the TikZ they write ───

const items = (scene: ReturnType<typeof buildScene>) => scene.blocks.flatMap((b) => b.items);
const texts = (list: Item[]) => list.flatMap((i) => (i.t === 'text' ? [i.tex] : []));
{
  const model = sampleBeam();
  const s = solve(model);
  eq(readStyle({}), { view: 'diagrams', moments: 'tension', units: 'kN-m', figures: 3, siUnits: false, names: true, width: 8, grid: 1 }, 'the style’s defaults');
  eq(readStyle({ view: 'nope', figures: 9, width: -1 }).view, 'diagrams', 'anything unknown takes its default');
  // loading: supports drawn, no reactions; free-body: reactions instead of supports
  const loading = items(buildScene(model, s, readStyle({ view: 'loading' })));
  eq(loading.filter((i) => i.t === 'pic').length, 2, 'loading: two supports');
  eq(texts(loading).includes('$10$\\,kN/m'), true, 'loading: the load’s value');
  eq(texts(loading).some((t) => t.includes('A_y')), false, 'loading: no reactions');
  const fbd = items(buildScene(model, s, readStyle({ view: 'fbd' })));
  eq(fbd.filter((i) => i.t === 'pic').length, 0, 'free-body: no supports');
  eq(texts(fbd).filter((t) => /A_y = 30\$|B_y = 30\$/.test(t)).length, 2, 'free-body: both reactions, 30 kN');
  eq(texts(fbd).includes('$6$\\,m'), true, 'the dimension');
  // diagrams: shear 30 and −30; moment 45, drawn below for the tension side and above for positive up
  const diagrams = buildScene(model, s, readStyle({ view: 'diagrams' }));
  const block = (scene: ReturnType<typeof buildScene>, title: string) => scene.blocks.find((b) => b.title === title)!;
  eq(texts(block(diagrams, 'Shear force').items).filter((t) => /^\$-?\d/.test(t)), ['$30$', '$-30$'], 'shear labels');
  eq(texts(block(diagrams, 'Bending moment').items).filter((t) => /^\$-?\d/.test(t)), ['$45$'], 'moment label at mid-span');
  const deepest = (scene: ReturnType<typeof buildScene>) => {
    const shape = block(scene, 'Bending moment').items.find((i) => i.t === 'line' && i.fill === 'moment');
    return shape && shape.t === 'line' ? shape.pts.reduce((a, p) => (Math.abs(p.y) > Math.abs(a) ? p.y : a), 0) : 0;
  };
  eq(deepest(diagrams) < 0, true, 'tension side: sagging drawn below');
  eq(deepest(buildScene(model, s, readStyle({ view: 'diagrams', moments: 'positive' }))) > 0, true, 'positive up: sagging drawn above');
  eq(diagrams.blocks.map((b) => b.title), ['Structure', 'Loads', 'Reactions', 'Dimensions and labels', 'Shear force', 'Bending moment'], 'the blocks, in order');
  // units and figures
  eq(texts(items(buildScene(model, s, readStyle({ view: 'fbd', units: 'kip-ft' })))).some((t) => t.includes('30$\\,kip')), true, 'kip and ft');
  eq([formatValue(20 / 3, 3), formatValue(45, 3), formatValue(-31.25, 3), formatValue(1e-13, 3), formatValue(45e6, 3)], ['6.67', '45', '-31.3', '0', '45000000'], 'significant figures');
}

{
  // the truss: member forces, a joint and a section
  const truss: StructureModel = {
    nodes: [node('A', 0, 0), node('B', 8, 0), node('C', 4, 3), node('D', 4, 0)],
    parts: [bar('ad', 'A', 'D'), bar('db', 'D', 'B'), bar('ac', 'A', 'C'), bar('bc', 'B', 'C'), bar('cd', 'C', 'D'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), { id: 'P', kind: 'force', on: { node: 'C' }, value: 10, angle: -90 }, { id: 'cut', kind: 'cut', p: { x: 5, y: 3.5 }, q: { x: 6.5, y: -0.6 } }]
  };
  const s = solve(truss);
  const forces = items(buildScene(truss, s, readStyle({ view: 'forces' })));
  eq(texts(forces).filter((t) => t.includes('(T)')).length, 2, 'two ties');
  eq(texts(forces).filter((t) => t.includes('$8.33$\\,kN (C)')).length, 2, 'two struts, 8.33 kN');
  eq(forces.some((i) => i.t === 'line' && i.ink === 'zero' && i.id === 'cd'), true, 'CD carries nothing: drawn dashed');
  eq(texts(forces).includes('$0$'), true, 'and marked 0');
  const joint = items(buildScene(truss, s, readStyle({ view: 'joint', joint: 'C' })));
  eq(texts(joint).filter((t) => t.startsWith('$F_')).sort(), ['$F_{AC} = 8.33$\\,kN (C)', '$F_{BC} = 8.33$\\,kN (C)', '$F_{CD} = 0$'], 'joint C: its members’ forces');
  eq(texts(joint).includes('$10$\\,kN'), true, 'joint C: the load on it');
  // the cut crosses BC and DB; the part on its right keeps B
  const section = cutSection(truss, truss.parts.find((p) => p.kind === 'cut') as never);
  eq('kept' in section && [[...section.kept], section.crossed.map((x) => x.member.id).sort()], [['B'], ['bc', 'db']], 'the cut: B kept, BC and DB crossed');
  const sectionItems = items(buildScene(truss, s, readStyle({ view: 'section' })));
  eq(texts(sectionItems).filter((t) => t.startsWith('$F_')).sort(), ['$F_{BC} = 8.33$\\,kN (C)', '$F_{DB} = 6.67$\\,kN (T)'], 'the cut members’ forces');
  eq(texts(sectionItems).includes('$B_y = 5$\\,kN'), true, 'the reaction on the part');
  eq(texts(sectionItems).includes('$O$'), true, 'the moment point');
  // a cut through a joint, or one that doesn't reach across, is refused with a reason
  eq(cutSection(truss, { id: 'x', kind: 'cut', p: { x: 4, y: 4 }, q: { x: 4, y: -1 } }), { error: 'The cut passes through joint C. Move it between the joints.' }, 'through a joint');
  eq('error' in cutSection(truss, { id: 'x', kind: 'cut', p: { x: 5, y: 3.5 }, q: { x: 5.5, y: 1.5 } }), true, 'not across');
}

{
  // a beam cut at 2 m: N, V and M on the part kept
  const model: StructureModel = { nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), udl('w', 'm', 0, 6, 10), { id: 'cut', kind: 'cut', p: { x: 2, y: -1 }, q: { x: 2, y: 1 } }] };
  const kept = texts(items(buildScene(model, solve(model), readStyle({ view: 'section' }))));
  eq(kept.filter((t) => /^\$[VM] =/.test(t)), ['$V = 10$\\,kN', '$M = 40$\\,kN\\,m'], 'the section’s shear and moment');
  eq(kept.includes('$A_y = 30$\\,kN'), true, 'the part on the left, with A');
}

{
  // the TikZ: plain, its styles and pics in the picture's options, two libraries, every view
  const code = structureCode(sampleBeam(), {});
  eq(code.packages, ['tikz'], 'only tikz');
  eq(code.libraries, ['arrows.meta', 'babel'], 'arrows.meta and babel');
  const loading = structureCode(sampleBeam(), { view: 'loading' }).body;
  eq(/spx\/struct\/pin\/\.pic=\{/.test(loading) && /\\pic at \(0,0\) \{spx\/struct\/pin\};/.test(loading), true, 'pics defined in the options and used');
  eq(/\\usetikzlibrary|\\tikzset|\\def|calc/.test(loading), false, 'nothing global, no calc');
  eq(code.body.split('\n')[0], '% Structure, free-body diagram with shear and bending moment diagrams: Determinate and stable', 'a heading with the status');
  eq(/% Shear force\n\\begin\{scope\}\[shift=\{\(0,-[\d.]+\)\}\]/.test(code.body), true, 'diagrams in scopes under the beam');
  for (const view of ['loading', 'fbd', 'diagrams', 'forces', 'joint', 'section']) eq(/NaN|Infinity|undefined/.test(structureCode(sampleBeam(), { view }).body), false, `${view}: clean numbers`);
  // an unstable drawing still writes its loading diagram, with the reason
  const unstable = structureCode({ nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'roller'), support('b', 'B', 'roller')] }, {});
  eq(unstable.body.split('\n')[0].includes('Unstable'), true, 'the reason in the heading');
  eq(/Reactions|Shear force/.test(unstable.body), false, 'no results');
  // a damaged model draws nothing rather than throwing
  eq(structureCode({ nodes: 'x' }, {}).packages, ['tikz'], 'a damaged model');
}

{
  // siunitx: values as \qty, axis titles as \unit, diagram values as \num; the canvas keeps plain text
  const on = structureCode(sampleBeam(), { view: 'diagrams', siUnits: true });
  eq(on.packages, ['tikz', 'siunitx'], 'the document loads siunitx');
  eq(on.body.includes('$A_y = \\qty{30}{\\kilo\\newton}$'), true, 'a reaction');
  eq(on.body.includes('$M$ (\\unit{\\kilo\\newton\\metre})'), true, 'an axis title');
  eq(/\\num\{-?30\}/.test(on.body), true, 'a diagram value');
  eq(structureCode(sampleBeam(), { view: 'loading', siUnits: true }).body.includes('\\qty{10}{\\kilo\\newton\\per\\metre}'), true, 'a distributed load');
  eq(/\$\d|\\,kN/.test(on.body), false, 'no value written the old way');
  const canvas = texts(items(buildScene(sampleBeam(), solve(sampleBeam()), readStyle({ view: 'loading', siUnits: true }), true)));
  eq(canvas.includes('$10$\\,kN/m'), true, 'the canvas shows plain text');
}

// ─── the file: a drawing round-trips through the diagram file (last: it waits for the hash) ───

(async () => {
  const diagram: DiagramFile = { language: 'tikz', pkg: 'structures', style: structureStyle({ moments: 'positive', mohrShear: 'down', siUnits: true }), model: sampleBeam(), version: 1 };
  eq(diagram.style, { view: 'diagrams', moments: 'positive', siUnits: true }, 'a new drawing copies the bending moment convention and siunitx');
  const code = structureCode(diagram.model, diagram.style);
  const back = await readDiagramFile(await diagramFileText(diagram, code));
  eq(back.diagram, diagram, 'the drawing comes back');
  eq(back.edited, false, 'not edited');
  eq(structureCode(back.diagram!.model, back.diagram!.style), code, 'and writes the same code');
  console.log('structures.check: ok');
})();
