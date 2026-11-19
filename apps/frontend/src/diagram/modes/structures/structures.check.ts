// Self-check for the Structures mode: the model's edits, the solver against textbook cases (values checked with SymPy
// 1.14), the instability reports, the views and the TikZ they write. Run:
// npx esbuild apps/frontend/src/diagram/modes/structures/structures.check.ts --bundle --platform=node --log-level=warning | node
import { axialForce, displacementAt, extremesInside, evalPoly, forcesAt, indeterminacy, solve } from './solve';
import type { Solution } from './solve';
import { centreOf, connect, convertUnits, copyIds, fitLoads, inBox, mirror, moveBy, nodeAt, nodesOf, pasteInto, placeTool, removeIds, restyleIds, sampleBeam, settleNode, snapOnMember, splitMember, structureNeedsVersion5, turn } from './model';
import type { Part, SNode, StructureModel, SupportType } from './model';
import { buildScene, cutSection, extentOf, fitScale, formatValue, readStyle } from './draw';
import * as templates from './templates';
import type { Item } from './draw';
import { structureCode, structureStyle } from './code';
import { DIAGRAM_LOOKS, changedLooks, readLooks } from './looks';
import { unitsAsText } from '../../units';
import { colourCss, isColour } from '../shared';
import { INNER_SEP, clashes, shapesOf, textBox } from './labels';
import { diagramFileText, readDiagramFile } from '../../fileFormat';
import type { DiagramFile } from '../../types';
import structures from './index';
import { setShown } from './store';

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
  eq(readStyle({}), { view: 'diagrams', moments: 'tension', units: 'kN-m', figures: 3, siUnits: false, physics: false, names: true, width: 8, grid: 1, diagrams: DIAGRAM_LOOKS }, 'the style’s defaults');
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
  // the canvas places the export's text, and shows it as siunitx prints it
  eq([canvas.includes('\\qty{10}{\\kilo\\newton\\per\\metre}'), canvas.map(unitsAsText).includes('10 kN m⁻¹')], [true, true], 'the canvas measures what the export sets');
}

{
  // the force diagrams: each can be left out, the rest closing up, and each has its fill and opacity
  const model = sampleBeam();
  const s = solve(model);
  // each diagram's title and the top of what it draws
  const tops = (style: Record<string, unknown>) =>
    buildScene(model, s, readStyle({ view: 'diagrams', ...style })).blocks.filter((b) => b.shift).map((b) => [b.title, Number((b.shift!.y + Math.max(extentOf(b.items).maxY, 0.35)).toFixed(6))]);
  const both = tops({});
  eq(both.map(([title]) => title), ['Shear force', 'Bending moment'], 'a beam: shear and moment');
  eq(tops({ diagrams: { shear: { on: false } } }), [['Bending moment', both[0][1]]], 'without shear the moment takes its place');
  eq(tops({ diagrams: { shear: { on: false }, moment: { on: false } } }), [], 'neither: the free-body diagram alone');
  const portal: StructureModel = {
    nodes: [node('A', 0, 0), node('B', 0, 4), node('C', 6, 4), node('D', 6, 0)],
    parts: [beam('m1', 'A', 'B'), beam('m2', 'B', 'C'), beam('m3', 'C', 'D'), support('a', 'A', 'pin'), support('d', 'D', 'roller'), udl('w', 'm2', 0, 6, 10)]
  };
  const frame = (style: Record<string, unknown>) => buildScene(portal, solve(portal), readStyle({ view: 'diagrams', ...style })).blocks.filter((b) => b.shift);
  const spots = frame({}).map((b) => b.shift);
  eq(frame({ diagrams: { axial: { on: false } } }).map((b) => [b.title, b.shift]), [['Shear force', spots[0]], ['Bending moment', spots[1]]], 'a frame without axial force: the others move up the grid');
  // fills: today's by default, any xcolor mix or picked colour, an opacity under 1 written
  const fills = (style: Record<string, unknown>) => structureCode(model, { view: 'diagrams', ...style }).body.split('\n').filter((l) => /(shear|moment) fill\/\.style/.test(l)).map((l) => l.trim().replace(/,$/, ''));
  eq(fills({}), ['struct shear fill/.style={fill=blue!12}', 'struct moment fill/.style={fill=red!12}'], 'today’s fills');
  eq(fills({ diagrams: { shear: { fill: 'orange!30!yellow', opacity: 0.5 }, moment: { fill: '#336699' } } }), ['struct shear fill/.style={fill=orange!30!yellow, fill opacity=0.5}', 'struct moment fill/.style={fill={rgb,255:red,51;green,102;blue,153}}'], 'a mix with an opacity, and a picked colour');
  eq(readLooks({ shear: { fill: 'red]{\\x', opacity: 3, on: 'no' } }).shear, DIAGRAM_LOOKS.shear, 'anything else is the default');
  eq(changedLooks(readLooks({ moment: { fill: 'red!12', on: false } })), { moment: { on: false } }, 'a file keeps only what differs');
  // a new drawing copies Settings › Composer's diagrams, only where they differ
  eq(structureStyle({ moments: 'tension', mohrShear: 'down', siUnits: true, diagrams: DIAGRAM_LOOKS }), { view: 'diagrams', moments: 'tension', siUnits: true }, 'the defaults: nothing kept');
  eq(structureStyle({ moments: 'tension', mohrShear: 'down', siUnits: true, diagrams: readLooks({ axial: { on: false } }) }).diagrams, { axial: { on: false } }, 'axial force off');
  eq([colourCss('blue!12'), colourCss('red!30!yellow'), colourCss('#336699'), colourCss('RoyalBlue!50')], ['rgb(224, 224, 255)', 'rgb(255, 179, 0)', '#336699', 'rgb(191, 191, 191)'], 'the canvas’s colours, mixed with white as xcolor does');
  eq(['blue!15', 'red!30!yellow', 'black!50!white', '#336699', 'RoyalBlue', 'thick', 'blue!50!thick', 'Blue', 'constructor'].map(isColour), [true, true, true, true, false, false, false, false, false], 'xcolor’s own names only');
}

{
  // labels clear of the drawing: on a portal frame with a point load and a UDL, and a beam with a varying load and a
  // point load, every label's box (as TikZ sets it at \footnotesize) misses the members, arrows, supports, diagram
  // outlines and the other labels, in the export and on the canvas
  const portal: StructureModel = {
    nodes: [node('A', 0, 0), node('B', 0, 4), node('C', 6, 4), node('D', 6, 0)],
    parts: [beam('m1', 'A', 'B'), beam('m2', 'B', 'C'), beam('m3', 'C', 'D'), support('a', 'A', 'pin'), support('d', 'D', 'roller'), udl('w', 'm2', 0, 6, 10), { id: 'P', kind: 'force', on: { node: 'B' }, value: 15, angle: 0 }, down('Q', 'm2', 2, 12), { id: 'dim', kind: 'dim', a: 'A', b: 'D', dir: 'h', offset: -1.6 }]
  };
  const varying: StructureModel = {
    nodes: [node('A', 0, 0), node('B', 8, 0), node('C', 10, 0)],
    parts: [beam('m1', 'A', 'B'), beam('m2', 'B', 'C'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), udl('w', 'm1', 0, 8, 0, 12), { id: 'P', kind: 'force', on: { node: 'C' }, value: 20, angle: -90 }, { id: 'dim', kind: 'dim', a: 'A', b: 'C', dir: 'h', offset: -1.6 }]
  };
  const measured = (scene: ReturnType<typeof buildScene>) => {
    const at = (b: (typeof scene.blocks)[number]) => b.shift ?? { x: 0, y: 0 };
    const shapes = shapesOf(scene.blocks.flatMap((b) => b.items.flatMap((item) => (item.t === 'text' ? [] : [{ item, shift: at(b) }]))));
    return clashes(scene.blocks.flatMap((b) => b.items.flatMap((item) => (item.t === 'text' ? [{ label: item, shift: at(b) }] : []))), shapes);
  };
  for (const [name, model] of [['portal', portal], ['beam', varying]] as const) {
    for (const view of ['loading', 'fbd', 'diagrams'] as const) {
      for (const canvas of [false, true]) eq(measured(buildScene(model, solve(model), readStyle({ view, siUnits: true }), canvas)), [], `${name}, ${view}${canvas ? ' on the canvas' : ''}: labels clear`);
    }
  }
  // what moved: B off the varying load's arrows, A and D off their columns; the moment's values all still there
  const label = (model: StructureModel, tex: string) => items(buildScene(model, solve(model), readStyle({ view: 'diagrams' }))).find((i) => i.t === 'text' && i.tex === tex) as Extract<Item, { t: 'text' }>;
  eq(label(varying, '$B$').anchor !== 'south', true, 'B beside the load, not under its arrows');
  eq([label(portal, '$A$').anchor, label(portal, '$D$').anchor].every((a) => a !== 'south'), true, 'A and D beside their columns');
  eq(texts(buildScene(varying, solve(varying), readStyle({ view: 'diagrams' })).blocks.find((b) => b.title === 'Bending moment')!.items).filter((t) => /^\$-?\d/.test(t)), ['$28.1$', '$-40$'], 'the moment’s values');
  // a label set inside TikZ's inner sep from its anchor: the box starts that far in
  eq(textBox({ at: { x: 0, y: 0 }, tex: '$A$', anchor: 'south west' }).x0, INNER_SEP, 'the inner sep');
}

// ─── 2.5 fixes ───

{
  // a beam drawn right to left: the moment is labelled sagging positive, as one drawn left to right (+45, not −45)
  const moments = (model: StructureModel, moments: 'tension' | 'positive') => texts(buildScene(model, solve(model), readStyle({ view: 'diagrams', moments })).blocks.find((b) => b.title === 'Bending moment')!.items).filter((t) => /^\$-?\d/.test(t));
  const reversed: StructureModel = { nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'B', 'A'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), udl('w', 'm', 0, 6, 10)] };
  for (const c of ['tension', 'positive'] as const) eq(moments(reversed, c), ['$45$'], `reversed beam, ${c}: +45`);
  // A to B drawn left to right, C to B right to left; 12 kN 3 m from C: 3.6 kN at A, so 14.4 at B and 25.2 under the load
  const mixed: StructureModel = { nodes: [node('A', 0, 0), node('B', 4, 0), node('C', 10, 0)], parts: [beam('m1', 'A', 'B'), beam('m2', 'C', 'B'), support('a', 'A', 'pin'), support('c', 'C', 'roller'), down('f', 'm2', 3, 12)] };
  eq(moments(mixed, 'tension'), ['$14.4$', '$25.2$'], 'members drawn both ways: both moments sagging positive');
}

{
  // a spring's stiffness doesn't hang on the longest member: a 4 m cantilever, EI 1, a tip spring k 1, 10 kN at the tip.
  // By hand the spring takes 10·k/(k + 3EI/L³) = 9.552 kN, with or without an unloaded stub behind the wall
  const cantilever = (stub: number): StructureModel => ({
    nodes: [node('O', 0, 0), node('A', 4, 0), ...(stub ? [node('S', -stub, 0)] : [])],
    parts: [beam('m', 'O', 'A'), ...(stub ? [beam('s', 'O', 'S')] : []), support('o', 'O', 'fixed'), { id: 'k', kind: 'support', node: 'A', type: 'spring' }, { id: 'f', kind: 'force', on: { node: 'A' }, value: 10, angle: -90 }]
  });
  for (const stub of [0, 2, 10]) close(reaction(solve(cantilever(stub)), 'k').force.y, 10 / (1 + 3 / 64), `tip spring, stub ${stub} m`);
  // a rotational spring k 1 at B, A fixed, 10 kN at mid-span: (4EI/L + k)θ = PL/8 gives θ = 2.5, so the spring holds
  // 2.5 kN m and B carries P/2 − (6.25 − 2.5)/L = 4.0625 kN
  const turning = (stub: number): StructureModel => ({
    nodes: [node('A', 0, 0), node('B', 4, 0), ...(stub ? [node('S', -stub, 0)] : [])],
    parts: [beam('m', 'A', 'B'), ...(stub ? [beam('s', 'A', 'S')] : []), support('a', 'A', 'fixed'), { id: 'b', kind: 'support', node: 'B', type: 'rotspring' }, down('f', 'm', 2, 10)]
  });
  for (const stub of [0, 10]) {
    const s = solve(turning(stub));
    close(reaction(s, 'b').moment, -2.5, `rotational spring, stub ${stub} m: its moment`);
    close(reaction(s, 'b').force.y, 4.0625, `rotational spring, stub ${stub} m: B`);
  }
}

{
  // a load from 10 down to −10 kN/m: the first half's arrows point down, the second half's up
  const model: StructureModel = { nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), udl('w', 'm', 0, 6, 10, -10)] };
  const arrows = items(buildScene(model, solve(model), readStyle({ view: 'loading' }))).filter((i): i is Extract<Item, { t: 'line' }> => i.t === 'line' && i.id === 'w' && !!i.arrow);
  const ways = arrows.map((a) => Math.sign(a.pts[1].y - a.pts[0].y));
  eq([ways.includes(-1), ways.includes(1)], [true, true], 'arrows both ways');
  const mid = (Math.min(...arrows.map((a) => a.pts[0].x)) + Math.max(...arrows.map((a) => a.pts[0].x))) / 2;
  eq(arrows.every((a) => (a.pts[0].x < mid ? a.pts[1].y < a.pts[0].y : a.pts[1].y > a.pts[0].y)), true, 'down on the left half, up on the right');
  eq(items(buildScene(model, solve(model), readStyle({ view: 'loading' }))).filter((i) => i.t === 'line' && i.id === 'w' && i.closed).length, 2, 'a band each side');
}

{
  // paste: two grid steps along and down, in the drawing's units (500 mm in N-mm, not 1 mm on top of the original)
  setShown(sampleBeam(), readStyle({ units: 'N-mm' }));
  const pasted = structures.paste!(sampleBeam(), copyIds(sampleBeam(), ['m1'])) as { model: StructureModel };
  eq(pasted.model.nodes.slice(2).map((n) => [n.x, n.y]), [[500, -500], [506, -500]], 'pasted 500 mm along and down');
}

// ─── 2.5 features, each against a hand calculation ───

const withEI = (model: StructureModel, EI: number): StructureModel => ({ ...model, parts: model.parts.map((p) => (p.kind === 'member' ? { ...p, EI } : p)) });
const settling = (model: StructureModel, id: string, settle: number): StructureModel => ({ ...model, parts: model.parts.map((p) => (p.id === id && p.kind === 'support' ? { ...p, settle } : p)) });
const blockTexts = (model: StructureModel, style: Record<string, unknown>, title: string) => texts(buildScene(model, solve(model), readStyle({ view: 'diagrams', ...style })).blocks.find((b) => b.title === title)?.items ?? []);

{
  // settlement. A propped cantilever, 6 m, EI 20000 kN m², whose prop B settles 10 mm: by hand the prop pulls down
  // 3EIδ/L³ = 2.778 kN and the wall takes 3EIδ/L² = 16.67 kN m; with 10 kN/m as well, R_B = 22.5 − 2.778 = 19.72 kN and
  // M_A = 45 + 16.67 = 61.67 kN m. The beam's end follows the ground: 10 mm down at B
  const propped: StructureModel = withEI({ nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'fixed', -90), support('b', 'B', 'roller')] }, 20000);
  const alone = solve(settling(propped, 'b', 0.01));
  close(reaction(alone, 'b').force.y, -3 * 20000 * 0.01 / 216, 'settlement alone: the prop pulls down 3EIδ/L³');
  close(reaction(alone, 'a').force.y, 3 * 20000 * 0.01 / 216, 'settlement alone: the wall pushes up as much');
  close(reaction(alone, 'a').moment, 3 * 20000 * 0.01 / 36, 'settlement alone: the wall’s moment 3EIδ/L²');
  close(displacementAt(alone, 'm', 6).v, -0.01, 'the beam follows the prop down');
  close(displacementAt(alone, 'm', 0).v, 0, 'and stays put at the wall');
  eq(alone.status.text, 'Indeterminate to degree 1 (EI used)', 'the status says EI itself was used');
  const loaded = solve(settling({ ...propped, parts: [...propped.parts, udl('w', 'm', 0, 6, 10)] }, 'b', 0.01));
  close(reaction(loaded, 'b').force.y, 22.5 - 50 / 18, 'settlement and load: R_B = 19.72 kN');
  close(reaction(loaded, 'a').moment, 45 + 50 / 3, 'settlement and load: M_A = 61.67 kN m');
  // two 5 m spans, EI 20000, the middle support settling 10 mm: it lets go of 48EIδ/(2L)³ = 9.6 kN, the ends take 4.8
  const spans: StructureModel = withEI({ nodes: [node('A', 0, 0), node('B', 5, 0), node('C', 10, 0)], parts: [beam('ab', 'A', 'B'), beam('bc', 'B', 'C'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), support('c', 'C', 'roller'), udl('w1', 'ab', 0, 5, 10), udl('w2', 'bc', 0, 5, 10)] }, 20000);
  const sunk = solve(settling(spans, 'b', 0.01));
  close(reaction(sunk, 'b').force.y, 62.5 - 9.6, 'two spans, B settles: 52.9 kN');
  close(reaction(sunk, 'a').force.y, 18.75 + 4.8, 'two spans, B settles: 23.55 kN at A');
  // a determinate beam just turns: the same reactions, and its middle drops half the settlement more
  const simple = withEI(sampleBeam(), 20000);
  const turned = solve(settling(simple, 'p2', 0.01));
  close(reaction(turned, 'p2').force.y, 30, 'determinate: no forces from a settlement');
  close(displacementAt(turned, 'm1', 3).v, -5 * 10 * 6 ** 4 / (384 * 20000) - 0.005, 'determinate: 5wL⁴/384EI plus half the settlement');
  // a settlement on a support turned to face a wall still moves it down; a horizontal roller ignores it
  const wall = solve(settling({ nodes: [node('A', 0, 0), node('B', 4, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'fixed', -90), { id: 'b', kind: 'support', node: 'B', type: 'roller' }] }, 'a', 0.02));
  close(displacementAt(wall, 'm', 0).v, -0.02, 'a fixed support turned −90° settles down, not sideways');
  close(displacementAt(wall, 'm', 4).v, 0, 'the prop holds its end');
  // shown under the support, with its letter
  eq(texts(items(buildScene(settling(simple, 'p2', 0.01), turned, readStyle({ view: 'loading' })))).includes('$\\Delta_{B} = 0.01$\\,m'), true, 'the settlement labelled');
}

{
  // a load per horizontal length: a 4 m by 3 m rafter (5 m long), pinned at the eaves, a roller at the ridge, 2 kN/m of
  // snow on plan. By hand 8 kN in all: 4 kN at each end, M = wL²/8 = 4 kN m at mid-length. Per length of rafter it
  // would be 10 kN: 5 kN each, 5 kN m
  const rafter = (projected: boolean): StructureModel => ({ nodes: [node('A', 0, 0), node('B', 4, 3)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), { id: 'w', kind: 'dist', member: 'm', from: 0, to: 5, w1: 2, w2: 2, angle: -90, ...(projected && { projected: true }) }] });
  const snow = solve(rafter(true));
  close(reaction(snow, 'a').force.y, 4, 'snow on plan: 4 kN at the eaves');
  close(reaction(snow, 'b').force.y, 4, 'snow on plan: 4 kN at the ridge');
  close(reaction(snow, 'a').force.x, 0, 'snow on plan: nothing sideways');
  close(maxMoment(snow, 'm').M, 4, 'snow on plan: wL²/8 = 4 kN m');
  close(maxMoment(snow, 'm').at, 2.5, 'snow on plan: at mid-length');
  close(reaction(solve(rafter(false)), 'a').force.y, 5, 'per length of rafter: 5 kN');
  close(maxMoment(solve(rafter(false)), 'm').M, 5, 'per length of rafter: 5 kN m');
  // drawn on plan, as snow is: a level band floating just over the rafter's highest point, its arrows short and alike
  const planned = buildScene(rafter(true), snow, readStyle({ view: 'loading' }));
  const band = items(planned).find((i) => i.t === 'line' && i.id === 'w' && i.closed) as Extract<Item, { t: 'line' }>;
  close(band.pts[2].y, band.pts[3].y, 'snow on plan: a level band');
  close(band.pts[0].y, band.pts[1].y, 'snow on plan: its underside level too');
  eq(band.pts[0].y >= 3 * planned.scale, true, 'snow on plan: over the ridge, not down at the eaves');
  const arrows = items(planned).filter((i): i is Extract<Item, { t: 'line' }> => i.t === 'line' && i.id === 'w' && i.arrow === '->');
  eq(new Set(arrows.map((a) => (a.pts[0].y - a.pts[1].y).toFixed(9))).size, 1, 'snow on plan: arrows of one length');
  const sloped = items(buildScene(rafter(false), solve(rafter(false)), readStyle({ view: 'loading' }))).find((i) => i.t === 'line' && i.id === 'w' && i.closed) as Extract<Item, { t: 'line' }>;
  eq(Math.abs(sloped.pts[2].y - sloped.pts[3].y) > 1, true, 'per length: the band follows the rafter');
}

{
  // the deflected shape. A simply supported 6 m beam, 10 kN/m: 5wL⁴/384EI at mid-span, 168.75 m with EI 1 kN m², and
  // 8.4375 mm with EI 20000; the same beam in N and mm (EI 2e13 N mm²) gives 8.4375 mm
  close(displacementAt(solve(sampleBeam()), 'm1', 3).v, -5 * 10 * 6 ** 4 / 384, 'mid-span: 5wL⁴/384EI, EI 1');
  close(displacementAt(solve(withEI(sampleBeam(), 20000)), 'm1', 3).v, -0.0084375, 'mid-span: 8.44 mm, EI 20000');
  const mm = convertUnits(withEI(sampleBeam(), 20000), 'kN-m', 'N-mm');
  close(displacementAt(solve(mm), 'm1', 3000).v, -8.4375, 'in N and mm: 8.44 mm');
  // a cantilever, 4 m, EI 1000, 10 kN at its tip: PL³/3EI = 0.2133 m; stood up as a column with the load sideways, the
  // same across, drawn up or down
  const tip = solve({ nodes: [node('A', 0, 0), node('B', 4, 0)], parts: [{ ...beam('m', 'A', 'B'), EI: 1000 } as Part, support('a', 'A', 'fixed', -90), { id: 'P', kind: 'force', on: { node: 'B' }, value: 10, angle: -90 }] });
  close(displacementAt(tip, 'm', 4).v, -10 * 64 / 3000, 'cantilever tip: PL³/3EI');
  for (const [a, b] of [['A', 'B'], ['B', 'A']]) {
    const column = solve({ nodes: [node('A', 0, 0), node('B', 0, 4)], parts: [{ ...beam('m', a, b), EI: 1000 } as Part, support('a', 'A', 'fixed'), { id: 'P', kind: 'force', on: { node: 'B' }, value: 10, angle: 0 }] });
    const top = displacementAt(column, 'm', a === 'A' ? 4 : 0);
    // across a member drawn up its left is −x; drawn down, +x
    close(a === 'A' ? -top.v : top.v, 10 * 64 / 3000, `column drawn ${a} to ${b}: PL³/3EI across`);
  }
  // a triangular load, 0 to 9 kN/m on 6 m, EI 1: the largest deflection is at x = L√(1 − √(8/15)) = 3.116 m, and is
  // 0.006522 w₀L⁴/EI = 76.08 m
  const tri = solve({ nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), udl('w', 'm', 0, 6, 0, 9)] });
  const deepest = Array.from({ length: 60001 }, (_, i) => i / 10000).reduce((a, x) => (displacementAt(tri, 'm', x).v < displacementAt(tri, 'm', a).v ? x : a), 0);
  close(deepest, 6 * Math.sqrt(1 - Math.sqrt(8 / 15)), 'triangle: x of the largest deflection', 1e-4);
  // the textbook elastic curve, v = w₀x(7L⁴ − 10L²x² + 3x⁴)/360LEI, at that x
  const x = 6 * Math.sqrt(1 - Math.sqrt(8 / 15));
  close(-displacementAt(tri, 'm', x).v, (9 * x * (7 * 6 ** 4 - 10 * 36 * x * x + 3 * x ** 4)) / (360 * 6), 'triangle: the largest deflection, 76.07 m');
  // a Gerber beam: the hinge is one point, both sides there move together
  const gerber = solve({ nodes: [node('A', 0, 0), { ...node('H', 4, 0), hinge: true }, node('B', 6, 0)], parts: [beam('ah', 'A', 'H'), beam('hb', 'H', 'B'), support('a', 'A', 'fixed', -90), support('b', 'B', 'roller'), udl('w1', 'ah', 0, 4, 10), udl('w2', 'hb', 0, 2, 10)] });
  close(displacementAt(gerber, 'ah', 4).v, displacementAt(gerber, 'hb', 0).v, 'a hinge: both sides together');
  // drawn: a block after the moment, its largest value labelled (−169 m with EI 1), and none unless asked for
  eq(diagramsTitles(sampleBeam(), { deflection: 'fit' }), ['Shear force', 'Bending moment', 'Deflected shape'], 'a beam: the deflected shape after the moment');
  eq(diagramsTitles(sampleBeam(), {}), ['Shear force', 'Bending moment'], 'not drawn unless asked for');
  eq(blockTexts(sampleBeam(), { deflection: 100 }, 'Deflected shape'), ['$-169$', '$\\delta$ (m)'], 'its largest deflection and its axis');
  const curve = (h: 'fit' | number) => (buildScene(sampleBeam(), solve(sampleBeam()), readStyle({ view: 'diagrams', deflection: h })).blocks.find((b) => b.title === 'Deflected shape')!.items.find((i) => i.t === 'line' && i.ink === 'member') as Extract<Item, { t: 'line' }>).pts;
  const scale = 8 / 6;
  close(Math.min(...curve(1).map((p) => p.y)), -168.75 * scale, '× 1: drawn to the true deflection');
  close(Math.min(...curve('fit').map((p) => p.y)), -1, 'fitted: the largest 1 cm');
  // a frame: its own block in the grid, the frame faint under it and the largest displacement labelled
  const portal: StructureModel = { nodes: [node('A', 0, 0), node('B', 0, 4), node('C', 6, 4), node('D', 6, 0)], parts: [beam('m1', 'A', 'B'), beam('m2', 'B', 'C'), beam('m3', 'C', 'D'), support('a', 'A', 'fixed'), support('d', 'D', 'fixed'), { id: 'P', kind: 'force', on: { node: 'B' }, value: 10, angle: 0 }] };
  const frame = buildScene(portal, solve(portal), readStyle({ view: 'diagrams', deflection: 10 })).blocks.filter((b) => b.shift);
  eq(frame.map((b) => b.title), ['Axial force', 'Shear force', 'Bending moment', 'Deflected shape'], 'a frame: the deflected shape fourth');
  eq(frame[3].shift!.x === 0 && frame[3].shift!.y < frame[2].shift!.y, true, 'on a new row');
  eq(texts(frame[3].items).filter((t) => t.startsWith('$\\delta')).length, 1, 'its largest displacement labelled');
  eq(texts(frame[3].items).includes('Deflected shape ($\\times 10$)'), true, 'its title gives the exaggeration');
  // EI typed in real units leaves the members as rigid along their length: a fixed portal's forces are the same with EI
  // 20000 as with 1, and its base shears share the 10 kN equally (5 kN each, by symmetry)
  const real = solve(withEI(portal, 20000));
  close(reaction(real, 'a').force.x, reaction(solve(portal), 'a').force.x, 'portal: EI 20000 as EI 1');
  close(reaction(real, 'a').force.x, -5, 'portal: half the sway load at A', 1e-3);
  // joints move together: B's displacement from AB's top and BC's start agree
  const ps = solve(portal);
  const fromAB = displacementAt(ps, 'm1', 4);
  const fromBC = displacementAt(ps, 'm2', 0);
  close(-fromAB.v, fromBC.u, 'frame joint B: sideways the same from both members');
  close(fromAB.u, fromBC.v, 'frame joint B: up and down the same from both members');
}

function diagramsTitles(model: StructureModel, style: Record<string, unknown>) {
  return buildScene(model, solve(model), readStyle({ view: 'diagrams', ...style })).blocks.filter((b) => b.shift).map((b) => b.title);
}

{
  // x of zero shear and the largest moment: a triangular load 0 to 9 kN/m on 6 m, x = 2√3 = 3.46 m (Mmax 20.8 kN m),
  // on both diagrams; a 12 kN load 2 m from the left of a beam drawn right to left, x = 2 m from the left
  const tri: StructureModel = { nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'A', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), udl('w', 'm', 0, 6, 0, 9)] };
  eq(['Shear force', 'Bending moment'].map((t) => blockTexts(tri, { positions: true }, t).filter((x) => x.startsWith('$x'))), [['$x = 3.46$\\,m'], ['$x = 3.46$\\,m']], 'triangle: x = 3.46 m on both');
  eq(blockTexts(tri, {}, 'Bending moment').some((x) => x.startsWith('$x')), false, 'not marked unless asked for');
  const back: StructureModel = { nodes: [node('A', 0, 0), node('B', 6, 0)], parts: [beam('m', 'B', 'A'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), down('P', 'm', 4, 12)] };
  eq(blockTexts(back, { positions: true }, 'Shear force').filter((x) => x.startsWith('$x')), ['$x = 2$\\,m'], 'a point load: x where the shear changes sign, from the left');
  eq(blockTexts(sampleBeam(), { positions: true }, 'Bending moment').filter((x) => x.startsWith('$x')), ['$x = 3$\\,m'], 'a UDL: mid-span');
}

{
  // an internal shear release: fixed at A, the release at H 4 m along, a roller at B 2 m on, 10 kN/m all along. By hand
  // no shear crosses H, so B carries HB's 20 kN, H passes 20 kN m and the wall takes 40 kN and 60 kN m: determinate
  const model: StructureModel = {
    nodes: [node('A', 0, 0), { ...node('H', 4, 0), shear: true }, node('B', 6, 0)],
    parts: [beam('ah', 'A', 'H'), beam('hb', 'H', 'B'), support('a', 'A', 'fixed', -90), support('b', 'B', 'roller'), udl('w1', 'ah', 0, 4, 10), udl('w2', 'hb', 0, 2, 10)]
  };
  const s = solve(model);
  eq(s.status, { kind: 'ok', text: 'Determinate and stable', degree: 0 }, 'shear release: determinate');
  close(reaction(s, 'b').force.y, 20, 'shear release: B carries HB');
  close(reaction(s, 'a').force.y, 40, 'shear release: the wall carries AH');
  close(reaction(s, 'a').moment, 60, 'shear release: the wall’s moment');
  close(forcesAt(s, 'ah', 4).V, 0, 'no shear at H');
  close(forcesAt(s, 'ah', 4).M, 20, 'the moment passes H');
  // the two sides slide past each other at H but turn together
  const slope = (member: string, at: number) => (displacementAt(s, member, at + 1e-6).v - displacementAt(s, member, at - 1e-6).v) / 2e-6;
  close(slope('ah', 4 - 1e-5), slope('hb', 1e-5), 'the sides turn together', 1e-4);
  eq(Math.abs(displacementAt(s, 'ah', 4).v - displacementAt(s, 'hb', 0).v) > 1, true, 'and slide apart');
  // on a simply supported beam it makes a mechanism; placed from the rail like a hinge; drawn as two strokes
  eq(solve({ nodes: [node('A', 0, 0), { ...node('H', 3, 0), shear: true }, node('B', 6, 0)], parts: [beam('ah', 'A', 'H'), beam('hb', 'H', 'B'), support('a', 'A', 'pin'), support('b', 'B', 'roller'), down('P', 'ah', 1, 5)] }).status.kind, 'unstable', 'shear release on a simple beam: unstable');
  const placed = placeTool(sampleBeam(), 'shear', { x: 3, y: 0 }, 0.05)!;
  eq([placed.model.nodes.find((n) => n.id === placed.id)?.shear, placed.model.parts.filter((p) => p.kind === 'member').length], [true, 2], 'the tool splits the member and marks the joint');
  eq(/spx\/struct\/shear\/\.pic=\{\\fill\[white\]/.test(structureCode(model, { view: 'loading' }).body), true, 'drawn as its pic');
}

{
  // F13: with Positive up, a frame's moment labels don't hang on the way a member was drawn
  const portal = (up: boolean): StructureModel => ({
    nodes: [node('A', 0, 0), node('B', 0, 4), node('C', 6, 4), node('D', 6, 0)],
    parts: [beam('m1', up ? 'A' : 'B', up ? 'B' : 'A'), beam('m2', 'B', 'C'), beam('m3', 'C', 'D'), support('a', 'A', 'pin'), support('d', 'D', 'roller'), { id: 'P', kind: 'force', on: { node: 'B' }, value: 15, angle: 0 }]
  });
  const labels = (up: boolean) => blockTexts(portal(up), { moments: 'positive' }, 'Bending moment').filter((t) => /^\$-?\d/.test(t)).sort();
  eq(labels(false), labels(true), 'a column drawn down reads as one drawn up');
  eq(labels(true), ['$60$', '$60$'], 'and as before for one drawn up');
}

{
  // a member drawn to end on an inclined member lands on its line, splitting it, not on a grid point beside it
  const inclined: StructureModel = { nodes: [node('A', 0, 0), node('B', 4, 3)], parts: [beam('m', 'A', 'B')] };
  const end = snapOnMember(inclined, { x: 2.9, y: 2.1 }, 0.25, 0.185);
  close(end.x * 0.6 - end.y * 0.8, 0, 'on the line');
  close(Math.hypot(end.x, end.y), 3.5, 'at a grid step along it');
  eq(connect(inclined, 'beam', { x: 3, y: 5 }, end, 0.185)!.model.parts.filter((p) => p.kind === 'member').length, 3, 'the inclined member split there');
  eq(snapOnMember(inclined, { x: 0.04, y: 2.1 }, 0.25, 0.185), { x: 0, y: 2 }, 'away from it: the grid');
}

{
  // converting units: the same structure in other numbers, and back again as typed
  const model = settling({ ...withEI(sampleBeam(), 20000), parts: [...withEI(sampleBeam(), 20000).parts, down('P', 'm1', 2, 12), { id: 'M', kind: 'moment', on: { node: 'n2' }, value: 5 }] }, 'p1', 0.01);
  const mm = convertUnits(model, 'kN-m', 'N-mm');
  eq(mm.nodes.map((n) => [n.x, n.y]), [[0, 0], [6000, 0]], 'joints in mm');
  eq(mm.parts.map((p) => (p.kind === 'dist' ? [p.w1, p.to] : p.kind === 'force' ? [p.value, 'member' in p.on && p.on.at] : p.kind === 'moment' ? p.value : p.kind === 'dim' ? p.offset : p.kind === 'member' ? p.EI : p.kind === 'support' ? p.settle ?? null : null)), [2e13, 10, null, [10, 6000], -1600, [12000, 2000], 5e6], 'loads, EI, settlement and dimension converted');
  close(reaction(solve(mm), 'p2').force.y, 1000 * reaction(solve(model), 'p2').force.y, 'the same reactions, in N');
  eq(convertUnits(convertUnits(model, 'kN-m', 'kip-ft'), 'kip-ft', 'kN-m'), model, 'kip and ft and back: as typed');
  const plain = convertUnits(sampleBeam(), 'kN-m', 'N-mm');
  eq(plain.parts.filter((p) => p.kind === 'member').map((p) => p.kind === 'member' && [p.EI, p.EA ?? 'relative']), [[1e9, 'relative']], 'EI turns explicit; EA, relative to it, stays');
  close(maxMoment(solve(plain), 'm1').M, 45e6, 'and solve as before: 45 kN m is 45e6 N mm');
}

{
  // the new style keys: kept when set, nothing otherwise, so a drawing without them writes as before
  eq([readStyle({ deflection: 'fit' }).deflection, readStyle({ deflection: 100 }).deflection, readStyle({ deflection: -1 }).deflection, readStyle({ deflection: 'x' }).deflection, readStyle({ positions: true }).positions, readStyle({ positions: 'yes' }).positions], ['fit', 100, undefined, undefined, true, undefined], 'deflection and positions read back');
}

// ─── the starters: each stable, its reactions as a hand calculation gives them ───

{
  const at = (s: Solution, node: string) => {
    const r = s.reactions.find((x) => x.node === node)!;
    return [r.force.x, r.force.y, r.moment];
  };
  const near = (actual: number[], expected: number[], what: string) => actual.forEach((v, i) => close(v, expected[i], `${what} [${i}]`, 1e-4));
  const solved = (model: StructureModel, what: string) => {
    const s = solve(model);
    eq(s.status.kind, 'ok', `${what}: stable`);
    return s;
  };
  // cantilever: ΣF: A_y = 10; ΣM_A: M_A − 10 × 4 − 5 = 0, so 45 kN m anticlockwise
  near(at(solved(templates.cantilever(), 'cantilever'), 'A'), [0, 10, 45], 'cantilever');
  // overhang: ΣM_A: 6B − 60 × 3 − 15 × 8 = 0, B = 50; A = 60 + 15 − 50 = 25
  const overhang = solved(templates.overhangingBeam(), 'overhang');
  near([...at(overhang, 'A'), ...at(overhang, 'B')], [0, 25, 0, 0, 50, 0], 'overhang');
  // propped cantilever: B = 3wL/8 = 22.5, A = 5wL/8 = 37.5, M_A = wL²/8 = 45 anticlockwise
  const propped = solved(templates.proppedCantilever(), 'propped cantilever');
  near([...at(propped, 'A'), ...at(propped, 'B')], [0, 37.5, 45, 0, 22.5, 0], 'propped cantilever');
  // two equal spans, uniform load (three-moment equation): M_B = −wL²/8, so A = C = 3wL/8 = 18.75, B = 10wL/8 = 62.5
  const spans = solved(templates.twoSpanBeam(), 'two spans');
  near([at(spans, 'A')[1], at(spans, 'B')[1], at(spans, 'C')[1]], [18.75, 62.5, 18.75], 'two spans');
  // the hinge carries no moment: BC alone, 4C − 20 × 2 = 0, C = 10; then A = 20 + 20 − 10 = 30 and
  // ΣM_A: M_A − 20 × 2 − 20 × 6 + 10 × 8 = 0, M_A = 80 anticlockwise
  const hinged = solved(templates.hingedBeam(), 'hinged beam');
  near([...at(hinged, 'A'), at(hinged, 'C')[1]], [0, 30, 80, 10], 'hinged beam');
  // triangle: 36 kN at 4 m from A, so B = 36 × 4 / 6 = 24 and A = 12
  const triangle = solved(templates.triangularLoad(), 'triangular load');
  near([at(triangle, 'A')[1], at(triangle, 'B')[1]], [12, 24], 'triangular load');
  // trusses: 15 kN up at each end by symmetry. Sections through the second panel, moments about the joint where the
  // other two cut members meet: Pratt about F, 3 F_BC − 15 × 3 = 0, 15 kN (T); Howe about G, 3 F_BC − 15 × 6 + 10 × 3 = 0,
  // 20 kN (T); Warren (10 kN each end) about F, 3 F_BC − 10 × 6 + 10 × 2 = 0, 13.3 kN (T)
  for (const [name, model, end, force] of [['Pratt', templates.prattTruss(), 'E', 15], ['Howe', templates.howeTruss(), 'E', 20], ['Warren', templates.warrenTruss(), 'D', 40 / 3]] as const) {
    const s = solved(model, name);
    const ends = name === 'Warren' ? 10 : 15;
    near([...at(s, 'A'), at(s, end)[1]], [0, ends, 0, ends], name);
    close(axialForce(s, 'mBC'), force, `${name}: F_BC by the method of sections`, 1e-4);
    eq('error' in cutSection(model, model.parts.find((p) => p.kind === 'cut') as Extract<Part, { kind: 'cut' }>), false, `${name}: its cut splits it`);
    eq(structureStyle({ moments: 'tension', mohrShear: 'down', siUnits: false }, model).view, 'forces', `${name}: opens on its member forces`);
  }
  // portal frame, by slope-deflection (EI the same throughout, axial shortening ignored): unknowns θB, θC and the
  // sway Δ, end moments clockwise positive, ψ = Δ/h
  {
    const [h, L, P, w] = [4, 6, 10, 5];
    const F = (w * L * L) / 12;
    // joint B: (2/h)(2θB − 3ψ) + (2/L)(2θB + θC) − F = 0; joint C: (2/L)(2θC + θB) + F + (2/h)(2θC − 3ψ) = 0;
    // sway: the four column moments add to −P h
    const A = [
      [4 / h + 4 / L, 2 / L, -6 / h],
      [2 / L, 4 / L + 4 / h, -6 / h],
      [6 / h, 6 / h, -24 / h]
    ];
    const b = [F, -F, -P * h];
    const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const [tB, tC, psi] = [0, 1, 2].map((i) => det(A.map((row, r) => row.map((v, c) => (c === i ? b[r] : v)))) / det(A));
    const [MAB, MBA, MDC, MCD] = [(2 / h) * (tB - 3 * psi), (2 / h) * (2 * tB - 3 * psi), (2 / h) * (tC - 3 * psi), (2 / h) * (2 * tC - 3 * psi)];
    // a support's moment on the frame is the end moment turned round; ΣM_A gives D_y
    const [MA, MD] = [-MAB, -MDC];
    const Dy = ((w * L * L) / 2 + P * h - MA - MD) / L;
    const hand = [(MAB + MBA) / h, w * L - Dy, MA, (MDC + MCD) / h, Dy, MD];
    // with the members made stiff along their length, as the hand calculation takes them: the same to 1e-4
    const stiff = templates.portalFrame();
    const rigid = solved({ ...stiff, parts: stiff.parts.map((p) => (p.kind === 'member' ? { ...p, EA: 1e6 } : p)) }, 'portal frame, rigid members');
    near([...at(rigid, 'A'), ...at(rigid, 'D')], hand, 'portal frame, rigid members');
    // as drawn (members nearly rigid, their shortening a hand calculation leaves out): within 2 %
    const s = solved(templates.portalFrame(), 'portal frame');
    [...at(s, 'A'), ...at(s, 'D')].forEach((v, i) => close(v, hand[i], `portal frame [${i}]`, 0.02));
    eq(s.status.kind === 'ok' && s.status.degree, 3, 'portal frame: three times indeterminate');
  }
  // three-hinged frame: 40 kN of snow on plan; ΣM_A: 8E_y − 40 × 4 − 10 × 4 = 0, E_y = 25, A_y = 15; the right half about
  // the hinge C: 4 × 25 + 6E_x − 20 × 2 = 0, E_x = −10; ΣF_x: A_x = −10 − E_x = 0
  const hinged3 = solved(templates.threeHingedFrame(), 'three-hinged frame');
  near([...at(hinged3, 'A'), ...at(hinged3, 'E')], [0, 15, 0, -10, 25, 0], 'three-hinged frame');
  // inclined: 2 kN/m over 5 m, 10 kN at 2 m across; ΣM_A: 4B − 10 × 2 = 0, B = 5, A = 5
  const inclined = solved(templates.inclinedMember(), 'inclined member');
  near([...at(inclined, 'A'), at(inclined, 'B')[1]], [0, 5, 0, 5], 'inclined member');
  eq(structureStyle({ moments: 'tension', mohrShear: 'down', siUnits: false }, templates.portalFrame()).view, 'diagrams', 'a frame opens on its diagrams');
  // every starter writes TikZ that holds its reactions
  for (const make of Object.values(templates)) eq(structureCode(make(), { view: 'fbd' }).body.includes('struct reaction'), true, 'a starter’s reactions drawn');
}

// ─── group edits ───

{
  // a frame with a perpendicular load on its rafter, a support turned, a moment, a dimension, a label and a cut
  const frame: StructureModel = {
    nodes: [node('A', 0, 0), node('B', 0, 4), node('C', 3, 6)],
    parts: [
      beam('m1', 'A', 'B'),
      beam('m2', 'B', 'C'),
      support('s', 'A', 'fixed', 30),
      { id: 'p', kind: 'dist', member: 'm2', from: 0, to: 2, w1: 1, w2: 3, angle: -90, perp: true },
      { id: 'f', kind: 'force', on: { member: 'm2', at: 1 }, value: 5, angle: -60 },
      { id: 'q', kind: 'moment', on: { node: 'B' }, value: 2 },
      { id: 'd', kind: 'dim', a: 'A', b: 'B', dir: 'v', offset: -1 },
      { id: 'l', kind: 'label', at: { x: 1, y: 1 }, text: 'x' },
      { id: 'c', kind: 'cut', p: { x: -1, y: 2 }, q: { x: 1, y: 2 } }
    ]
  };
  const all = [...frame.nodes.map((n) => n.id), ...frame.parts.map((p) => p.id)];
  // what moves: the members' and the support's joints
  eq([...nodesOf(frame, ['m2'])], ['B', 'C'], 'a member moves its joints');
  eq([...nodesOf(frame, ['s', 'l'])], ['A'], 'a support its joint; a label only itself');
  eq(centreOf(frame, all), { x: 1, y: 3 }, 'the middle of the box round it all');
  // a move by a step: every joint and point by it, nothing turned
  const moved = moveBy(frame, all, { x: 0.5, y: -0.25 });
  eq(moved.nodes.map((n) => [n.x, n.y]), [[0.5, -0.25], [0.5, 3.75], [3.5, 5.75]], 'nudged joints');
  eq([moved.parts.find((p) => p.id === 'l'), moved.parts.find((p) => p.id === 'c')].map((p) => (p!.kind === 'label' ? p!.at : p!.kind === 'cut' ? p!.p : null)), [{ x: 1.5, y: 0.75 }, { x: -0.5, y: 1.75 }], 'and the label and cut with them');
  eq(moveBy(frame, ['m2'], { x: 1, y: 0 }).nodes.map((n) => n.x), [0, 1, 4], 'a member moved alone pulls only its ends');
  // mirrored left to right about x = 1, a whole member is drawn the other way, its loads measured from its other end
  const mirrored = mirror(frame, all, 'x');
  const part = (m: StructureModel, id: string) => m.parts.find((p) => p.id === id)!;
  eq(mirrored.nodes.map((n) => [n.x, n.y]), [[2, 0], [2, 4], [-1, 6]], 'mirrored joints');
  eq([part(mirrored, 'm2'), part(mirrored, 'p'), part(mirrored, 'f')], [
    beam('m2', 'C', 'B'),
    { id: 'p', kind: 'dist', member: 'm2', from: Math.hypot(3, 2) - 2, to: Math.hypot(3, 2), w1: 3, w2: 1, angle: -90, perp: true },
    { id: 'f', kind: 'force', on: { member: 'm2', at: Math.hypot(3, 2) - 1 }, value: 5, angle: -120 }
  ], 'the rafter reversed, its loads with it, the force’s angle mirrored');
  eq([part(mirrored, 's'), part(mirrored, 'q'), part(mirrored, 'd'), part(mirrored, 'c')], [support('s', 'A', 'fixed', -30), { id: 'q', kind: 'moment', on: { node: 'B' }, value: 2, cw: true }, { id: 'd', kind: 'dim', a: 'A', b: 'B', dir: 'v', offset: 1 }, { id: 'c', kind: 'cut', p: { x: 3, y: 2 }, q: { x: 1, y: 2 }, flip: true }], 'support, moment, dimension and cut mirrored');
  // the perpendicular load lands on the mirror side: its arrows are the original's mirrored
  const arrowsOf = (m: StructureModel) => items(buildScene(m, solve(m), readStyle({ view: 'loading' }), false, 1)).filter((i): i is Extract<Item, { t: 'line' }> => i.t === 'line' && i.id === 'p' && i.arrow === '->').map((a) => ({ x: Number((a.pts[1].x - a.pts[0].x).toFixed(6)), y: Number((a.pts[1].y - a.pts[0].y).toFixed(6)) }));
  eq(arrowsOf(mirrored).map((d) => `${-d.x},${d.y}`).sort(), arrowsOf(frame).map((d) => `${d.x},${d.y}`).sort(), 'the perpendicular load’s arrows mirrored');
  eq(mirror(mirrored, all, 'x'), { ...frame, parts: frame.parts.map((p) => (p.id === 'f' ? { ...p, angle: -60 } : p)) }, 'mirrored twice: as it was');
  eq(mirror(mirror(frame, all, 'y'), all, 'y'), frame, 'top to bottom twice: as it was');
  eq((part(mirror(frame, ['s'], 'y'), 's') as Extract<Part, { kind: 'support' }>).angle, 150, 'a support mirrored top to bottom stands over its joint');
  // turned: a quarter turn four times is where it started; a half turn moves joints through the middle
  const quarter = (m: StructureModel) => turn(m, all, 90);
  eq(quarter(quarter(quarter(quarter(frame)))), frame, 'four quarter turns');
  const half = turn(frame, all, 180);
  eq(half.nodes.map((n) => [n.x, n.y]), [[2, 6], [2, 2], [-1, 0]], 'a half turn about (1, 3)');
  eq([(part(half, 's') as Extract<Part, { kind: 'support' }>).angle, (part(half, 'f') as Extract<Part, { kind: 'force' }>).angle], [-150, 120], 'the support and the force turned with it');
  eq(solve(half).status.kind, solve(frame).status.kind, 'and it solves as it did');
  // a quarter turn lays a dimension down: left of the column, turned anticlockwise, is below the beam it becomes
  eq([part(turn(frame, all, 90), 'd'), part(turn(frame, all, -90), 'd')], [{ id: 'd', kind: 'dim', a: 'A', b: 'B', dir: 'h', offset: -1 }, { id: 'd', kind: 'dim', a: 'A', b: 'B', dir: 'h', offset: 1 }], 'a vertical dimension turned a quarter: horizontal, on the side it turned to');
  close(reaction(solve(turn(frame, all, 37)), 's').moment, reaction(solve(frame), 's').moment, 'a turned frame carries the same moment at its foot', 1e-6);
  // a box picks what's wholly inside it
  eq(inBox(frame, { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 4.5 }).sort(), ['A', 'B', 'd', 'm1', 'q', 's'].sort(), 'the column, its support, moment and dimension');
}

{
  // the canvas lays the drawing out at the export's own scale, so its labels sit where the PDF's do
  const model = templates.overhangingBeam();
  const style = readStyle({ view: 'diagrams' });
  eq(buildScene(model, solve(model), style, true, fitScale(model, style.width)).blocks.filter((b) => b.title !== 'Supports'), buildScene(model, solve(model), style).blocks.filter((b) => b.title !== 'Supports'), 'the canvas’s scene is the export’s');
}

// ─── colour and thickness for what's selected ───

{
  const plain = sampleBeam();
  const all = plain.parts.map((p) => p.id);
  const coloured = restyleIds(restyleIds(plain, ['n1', ...all], { colour: 'red' }), ['n1', ...all], { width: 'very thick' });
  const kinds = (m: StructureModel) => m.parts.map((p) => [p.kind, 'colour' in p ? p.colour : null, 'width' in p ? p.width : null]);
  eq(kinds(coloured), [['member', 'red', 'very thick'], ['support', 'red', null], ['support', 'red', null], ['dist', 'red', 'very thick'], ['dim', 'red', 'very thick']], 'a support takes a colour only; a joint neither');
  eq(coloured.nodes, plain.nodes, 'joints unchanged');
  eq(restyleIds(restyleIds(coloured, all, { colour: undefined }), all, { width: undefined }), plain, 'Default gives each its own again');
  eq([structureNeedsVersion5(plain, {}), structureNeedsVersion5(restyleIds(plain, ['m1'], { colour: 'red' }), {}), structureNeedsVersion5(restyleIds(plain, ['p4'], { width: 2 }), {})], [false, true, true], 'a colour or a thickness makes it version 5');
  // the solver never sees them: the same reactions and diagrams
  eq(solve(coloured), solve(plain), 'the solution unchanged');
  const lines = (m: StructureModel, view: string) => structureCode(m, { view }).body.split('\n');
  const [before, after] = [lines(plain, 'loading'), lines(coloured, 'loading')];
  eq(after.filter((l) => !before.includes(l)), [
    '\\draw[struct member, draw=red, very thick] (0,0) -- (8,0);',
    '\\pic[red] at (0,0) {spx/struct/pin};',
    '\\pic[red] at (8,0) {spx/struct/roller};',
    '\\draw[struct line, struct load fill, draw=red] (0,0.06) -- (8,0.06) -- (8,0.71) -- (0,0.71) -- cycle;',
    ...Array.from({ length: 21 }, (_, i) => `\\draw[struct load, ->, draw=red, very thick] (${formatValue(i * 0.4, 6)},0.71) -- (${formatValue(i * 0.4, 6)},0.06);`),
    '\\node[anchor=south, red] at (4,0.76) {$10$\\,kN/m};',
    '\\draw[struct dimension, draw=red, very thick] (0,-1.783) -- (0,-2.233);',
    '\\draw[struct dimension, draw=red, very thick] (8,-1.783) -- (8,-2.233);',
    '\\draw[struct dimension, <->, draw=red, very thick] (0,-2.133) -- (8,-2.133);',
    '\\node[anchor=north, red] at (4,-2.193) {$6$\\,m};'
  ], 'the loading view: each part in its colour and thickness, after its own style so they win');
  eq(after.length, before.length, 'and nothing else');
  // the reactions and the force diagrams keep theirs
  const [fbd, fbdColoured] = [lines(plain, 'diagrams'), lines(coloured, 'diagrams')];
  const after2 = (body: string[]) => body.slice(body.indexOf('% Reactions'), body.indexOf('% Dimensions and labels')).concat(body.slice(body.indexOf('% Shear force')));
  eq(after2(fbdColoured), after2(fbd), 'reactions and diagrams as before');
  // each kind that takes them, and a picked colour or width in pt
  const more: StructureModel = { nodes: plain.nodes, parts: [...plain.parts, { id: 'f', kind: 'force', on: { node: 'n2' }, value: 5, angle: -90 }, { id: 'mo', kind: 'moment', on: { node: 'n1' }, value: 3 }, { id: 'l', kind: 'label', at: { x: 3, y: 2 }, text: 'Beam' }, { id: 'an', kind: 'angle', node: 'n1', from: 0, to: 45, label: '$\\theta$' }] };
  const picked = lines(restyleIds(restyleIds(more, ['f', 'mo', 'l', 'an'], { colour: '#336699' }), ['f', 'mo', 'l', 'an'], { width: 1.5 }), 'loading');
  const [hex, drawHex] = ['color={rgb,255:red,51;green,102;blue,153}', 'draw={rgb,255:red,51;green,102;blue,153}'];
  eq(picked.filter((l) => l.includes(hex.slice(6))).map((l) => l.replace(/ (at )?\(.*$/, '')), [
    `\\draw[struct load, ->, ${drawHex}, line width=1.5pt]`,
    `\\node[anchor=south, ${hex}]`,
    `\\draw[struct load, ->, ${drawHex}, line width=1.5pt]`,
    `\\node[anchor=south east, ${hex}]`,
    `\\node[${hex}]`,
    `\\draw[struct dimension, ->, ${drawHex}, line width=1.5pt]`,
    `\\node[anchor=south, ${hex}]`
  ], 'a force, a moment, a label and an angle arc, in a picked colour and a width in pt');
  // a hand-edited file's colour or width the code can't write is left out
  const odd = restyleIds(restyleIds(plain, ['m1'], { colour: 'red, line width=9pt' }), ['m1'], { width: 'thick]' as never });
  eq(lines(odd, 'loading'), lines(plain, 'loading'), 'an unknown colour or thickness written as none');
  // on the canvas: the same items carry them
  const items = buildScene(coloured, solve(coloured), readStyle({ view: 'loading' }), true).blocks.flatMap((b) => b.items);
  eq([...new Set(items.flatMap((i) => (i.t === 'dot' ? [] : [i.colour])))], ['red', undefined], 'the canvas draws them too (the node letters keep theirs)');
}

// ─── the file: a drawing round-trips through the diagram file (last: it waits for the hash) ───

(async () => {
  const diagram: DiagramFile = { language: 'tikz', pkg: 'structures', style: structureStyle({ moments: 'positive', mohrShear: 'down', siUnits: true }), model: sampleBeam(), version: 1 };
  eq(diagram.style, { view: 'diagrams', moments: 'positive', siUnits: true }, 'a new drawing copies the bending moment convention and siunitx');
  const code = structureCode(diagram.model, diagram.style);
  const back = await readDiagramFile(await diagramFileText(diagram, code));
  eq(back.diagram, { ...diagram, version: 3 }, 'the drawing comes back, as version 3 for its siunitx');
  // as Insert left it for a document that loads physics: the mode writes \SI where it wrote \qty, so it opens as drawn
  const physics = structureCode(diagram.model, { ...diagram.style, physics: true }).body;
  eq([physics, physics.includes('\\SI{')], [code.body.replace(/\\qty(?=\{)/g, '\\SI'), true], 'physics: \\SI');
  eq(back.edited, false, 'not edited');
  eq(structureCode(back.diagram!.model, back.diagram!.style), code, 'and writes the same code');
  const red = { ...diagram, model: restyleIds(sampleBeam(), ['m1'], { colour: 'red' }) };
  const again = await readDiagramFile(await diagramFileText(red, structureCode(red.model, red.style)));
  eq([again.diagram?.version, again.diagram?.model], [5, red.model], 'a coloured member: version 5, and it comes back');
  console.log('structures.check: ok');
})();
