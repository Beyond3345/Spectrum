// Self-check for bent members: the curve's geometry (points on it, its Bézier control points, which way a sag goes),
// loads and labels on the curve, the edits that carry a bend (mirror, turn, units, the Bent beam tool), the TikZ it
// writes and the file version. Run:
// npx esbuild apps/frontend/src/diagram/modes/structures/bend.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --outfile=/tmp/bend.mjs && node /tmp/bend.mjs
import { bendControls, bendOffset, bendPeak, connect, convertUnits, cubicPoints, frameOf, memberNear, mirror, nodeAt, placeAt, pointAlong, sampleBeam, structureNeedsVersion5, turn } from './model';
import type { Bend, Member, Pt, StructureModel } from './model';
import { buildScene, extentOf, readStyle } from './draw';
import { structureCode } from './code';
import { solve } from './solve';
import { diagramFileText, readDiagramFile } from '../../fileFormat';
import type { DiagramFile } from '../../types';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const near = (p: Pt, q: Pt, what: string, tolerance = 1e-9) => {
  if (!(Math.hypot(p.x - q.x, p.y - q.y) <= tolerance)) throw new Error(`${what}: expected ${JSON.stringify(q)}, got ${JSON.stringify(p)}`);
};

/** the sample beam (A at 0, B at 6 m, pin and roller, 10 kN/m) with its member bent */
const bent = (bend: Bend, model = sampleBeam()): StructureModel => ({ ...model, parts: model.parts.map((p) => (p.kind === 'member' ? { ...p, bend } : p)) });
const memberOf = (m: StructureModel) => m.parts.find((p): p is Member => p.kind === 'member')!;

// ─── geometry ───

{
  const par = bent({ sag: -0.6 });
  const m = memberOf(par);
  const f = frameOf(par, m);
  near(pointAlong(par, m, 3), { x: 3, y: -0.6 }, 'a parabola sags δ at mid-span');
  near(pointAlong(par, m, 1.5), { x: 1.5, y: -0.45 }, 'and 4δt(1 − t) elsewhere');
  near(pointAlong(par, m, 0), { x: 0, y: 0 }, 'through A');
  near(pointAlong(par, m, 6), { x: 6, y: 0 }, 'and B');
  const [c1, c2] = bendControls(f, m.bend!);
  // the quadratic's control point is M + 2δ, (3, −1.2); lifted to a cubic, a third and two thirds of the way to it
  near(c1, { x: 2, y: -0.8 }, 'the first control point: a third along, 4δ/3 off');
  near(c2, { x: 4, y: -0.8 }, 'the second: two thirds along, 4δ/3 off');
  // the cubic and the parabola are one curve, the parameter t being s/L
  cubicPoints(f.a, c1, c2, f.b, 12).forEach((p, i) => near(p, pointAlong(par, m, (6 * i) / 12), `on the parabola at t = ${i}/12`));

  const s = bent({ sag: 0.5, shape: 'sbend' });
  const ms = memberOf(s);
  const fs = frameOf(s, ms);
  near(pointAlong(s, ms, 3), { x: 3, y: 0 }, 'an S-bend crosses its chord at mid-span');
  const t = bendPeak(ms.bend);
  near(pointAlong(s, ms, 6 * t), { x: 6 * t, y: 0.5 }, 'its largest offset is δ, at (3 − √3)/6 along');
  near(pointAlong(s, ms, 6 * (1 - t)), { x: 6 * (1 - t), y: -0.5 }, 'and −δ as far from the other end');
  const samples = Array.from({ length: 601 }, (_, i) => bendOffset(ms.bend, i / 100, 6));
  eq(Math.max(...samples.map(Math.abs)) <= 0.5 + 1e-12, true, 'nowhere further than δ');
  const [d1, d2] = bendControls(fs, ms.bend!);
  near(d1, { x: 2, y: 0.5 * 2 * Math.sqrt(3) }, 'its control points: 2√3·δ off');
  near(d2, { x: 4, y: -0.5 * 2 * Math.sqrt(3) }, 'to opposite sides');
  cubicPoints(fs.a, d1, d2, fs.b, 12).forEach((p, i) => near(p, pointAlong(s, ms, (6 * i) / 12), `on the S-bend at t = ${i}/12`));

  // a positive sag goes up whichever way the beam was drawn, and to the left of an upright member
  const back = { ...par, parts: par.parts.map((p) => (p.kind === 'member' ? { ...p, a: p.b, b: p.a, bend: { sag: 0.6 } } : p)) };
  near(pointAlong(back, memberOf(back), 3), { x: 3, y: 0.6 }, 'drawn right to left, up');
  const upright: StructureModel = { nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 4 }], parts: [{ id: 'm', kind: 'member', a: 'b', b: 'a', bend: { sag: 0.5 } }] };
  near(pointAlong(upright, memberOf(upright), 2), { x: -0.5, y: 2 }, 'drawn downwards, still to the left');
  eq(bendOffset({ sag: 0.6 }, 3, 0), 0, 'a member of no length has no offset');
  const asBar = { ...par, parts: par.parts.map((p) => (p.kind === 'member' ? { ...p, bar: true } : p)) };
  near(pointAlong(asBar, memberOf(asBar), 3), { x: 3, y: 0 }, 'a truss bar stays straight');
}

// ─── loads and labels on the curve ───

{
  const par = bent({ sag: -0.6 });
  const withForce: StructureModel = { ...par, parts: [...par.parts, { id: 'f', kind: 'force', on: { member: 'm1', at: 1.5 }, value: 20, angle: -90 }] };
  near(placeAt(withForce, { member: 'm1', at: 1.5 }), { x: 1.5, y: -0.45 }, 'a point load sits on the curve');
  const scale = 8 / 6;
  const items = buildScene(withForce, solve(withForce), readStyle({ view: 'loading' })).blocks.flatMap((b) => b.items);
  const arrows = items.filter((i) => i.t === 'line' && i.id === 'f');
  eq(arrows.length, 1, 'one arrow for the force');
  const tip = arrows[0].t === 'line' ? arrows[0].pts[1] : { x: 0, y: 0 };
  near(tip, { x: 1.5 * scale, y: -0.45 * scale + 0.06 }, 'its tip just above the curve', 1e-6);
  // a distributed load's arrows end just above the curve, and its band follows it
  const udl = items.filter((i) => i.t === 'line' && i.id === 'p3' && !i.closed);
  for (const a of udl) if (a.t === 'line') near(a.pts[1], { x: a.pts[1].x, y: pointAlong(par, memberOf(par), a.pts[1].x / scale).y * scale + 0.06 }, 'a load arrow ends on the curve', 1e-6);
  const band = items.find((i) => i.t === 'line' && i.id === 'p3' && i.closed);
  eq(band?.t === 'line' && band.pts.length, 34, 'the band, 17 points along the curve and 17 back');
  // the clicked point on the curve finds the member; a joint there doesn't split it
  eq(memberNear(par, { x: 1.5, y: -0.45 }, 0.05)?.member.id, 'm1', 'a point on the curve is on the member');
  eq(memberNear(par, { x: 1.5, y: 0 }, 0.05), null, 'its chord is not');
  const placed = nodeAt(par, { x: 3, y: -0.6 }, 0.05);
  eq([placed.model.parts.filter((p) => p.kind === 'member').length, placed.model.nodes.length], [1, 3], 'a joint on a bent member leaves it whole');
  // the canvas and the label placer see the curve, not its control points: it reaches δ below, not 4δ/3
  const curve = items.find((i) => i.t === 'line' && i.ink === 'member');
  eq(curve?.t === 'line' && !!curve.controls, true, 'the member is drawn as a curve');
  const e = extentOf([curve!]);
  eq(Math.abs(e.minY + 0.6 * scale) < 1e-3, true, 'its extent reaches δ below the chord');
  // a released end's circle on the curve
  const released = bent({ sag: -0.6 }, { ...par, parts: par.parts.map((p) => (p.kind === 'member' ? { ...p, release: [false, true] as [boolean, boolean] } : p)) });
  const dot = buildScene(released, solve(released), readStyle({ view: 'loading' })).blocks.flatMap((b) => b.items).find((i) => i.t === 'dot');
  near(dot?.t === 'dot' ? dot.at : { x: 0, y: 0 }, { x: 8 - 0.15, y: pointAlong(par, memberOf(par), 6 - 0.15 / scale).y * scale }, 'a released end, on the curve', 1e-9);
}

// ─── edits that carry a bend ───

{
  const ids = (m: StructureModel) => [...m.nodes.map((n) => n.id), ...m.parts.map((p) => p.id)];
  /** each point of a member's curve, taken through an edit, lies on the edited member's curve */
  const follows = (before: StructureModel, after: StructureModel, map: (p: Pt) => Pt, what: string) => {
    const [m0, m1] = [memberOf(before), memberOf(after)];
    const L = frameOf(before, m0).length;
    const swapped = m1.a !== m0.a;
    for (let i = 0; i <= 10; i += 1) near(pointAlong(after, m1, swapped ? L - (L * i) / 10 : (L * i) / 10), map(pointAlong(before, m0, (L * i) / 10)), `${what}, at ${i}/10`, 1e-9);
  };
  for (const bend of [{ sag: -0.6 }, { sag: 0.5, shape: 'sbend' as const }]) {
    const m = bent(bend);
    const name = bend.shape ?? 'parabola';
    follows(m, mirror(m, ids(m), 'x'), (p) => ({ x: 6 - p.x, y: p.y }), `${name} mirrored left to right`);
    follows(m, mirror(m, ids(m), 'y'), (p) => ({ x: p.x, y: -p.y }), `${name} mirrored top to bottom`);
    follows(m, turn(m, ids(m), 90), (p) => ({ x: 3 - p.y, y: p.x - 3 }), `${name} turned a quarter`);
    follows(m, turn(m, ids(m), 180), (p) => ({ x: 6 - p.x, y: -p.y }), `${name} turned a half`);
  }
  eq(memberOf(mirror(bent({ sag: -0.6 }), ['n1', 'n2', 'm1'], 'y')).bend, { sag: 0.6 }, 'a sagging beam mirrored top to bottom hogs');
  eq(memberOf(mirror(bent({ sag: -0.6 }), ['n1', 'n2', 'm1'], 'x')).bend, { sag: -0.6 }, 'and left to right still sags');
  // the units: a sag is a length
  eq(memberOf(convertUnits(bent({ sag: -0.6, ghost: true }), 'kN-m', 'N-mm')).bend, { sag: -600, ghost: true }, 'm to mm');
  // the Bent beam tool: a beam sagging a tenth of its span; a beam or bar has none
  const empty: StructureModel = { nodes: [], parts: [] };
  const made = connect(empty, 'bent', { x: 0, y: 0 }, { x: 6, y: 0 }, 0.05)!;
  eq(memberOf(made.model).bend, { sag: -0.6 }, 'the Bent beam tool sags a tenth of the span');
  eq('bend' in memberOf(connect(empty, 'beam', { x: 0, y: 0 }, { x: 6, y: 0 }, 0.05)!.model), false, 'a beam is straight');
  // the solve takes a bent member as its chord
  eq(solve(bent({ sag: -0.6 })), solve(sampleBeam()), 'the same reactions and diagrams');
}

// ─── the TikZ ───

{
  const lines = (m: StructureModel, view = 'loading') => structureCode(m, { view }).body.split('\n');
  const straight = lines(sampleBeam());
  const curved = lines(bent({ sag: -0.6 }));
  eq(curved.includes('\\draw[struct member] (0,0) .. controls (2.667,-1.067) and (5.333,-1.067) .. (8,0);'), true, 'the member as a Bézier, in its style');
  eq(curved.some((l) => l.includes('struct chord')), false, 'no axis unless asked');
  const ghost = lines(bent({ sag: -0.6, ghost: true }));
  eq(ghost.filter((l) => l.includes('chord')), ['  struct chord/.style={line width=0.4pt, black!35, dashed},', '\\draw[struct chord] (0,0) -- (8,0);'], 'the faint dashed axis');
  // 0.3 cm to the side of mid-span, 2.775 m along, where the curve is 0.5966 m (0.796 cm) below
  eq(ghost.includes('\\draw[struct dimension, <->] (3.7,0) -- (3.7,-0.796);'), true, 'the sag marked beside mid-span');
  eq(ghost.some((l) => l.startsWith('\\node') && l.endsWith('{$\\delta$};')), true, 'labelled δ');
  const named = lines(bent({ sag: -0.6, ghost: true, label: '$v_{\\max}$' }));
  eq(named.some((l) => l.endsWith('{$v_{\\max}$};')), true, 'or as the label says');
  const unmarked = lines(bent({ sag: -0.6, ghost: true, label: '' }));
  eq([unmarked.some((l) => l.includes('struct chord]')), unmarked.some((l) => l.includes('struct dimension, <->] (3.7,0)'))], [true, false], 'an empty label: the axis without the mark');
  const sb = lines(bent({ sag: 0.5, shape: 'sbend' }));
  const k = (0.5 * 2 * Math.sqrt(3) * 8) / 6;
  eq(sb.includes(`\\draw[struct member] (0,0) .. controls (2.667,${k.toFixed(3)}) and (5.333,${(-k).toFixed(3)}) .. (8,0);`), true, 'an S-bend as a Bézier');
  // a bent member in its colour, and the section view's part kept along the curve
  const red = { ...bent({ sag: -0.6 }), parts: bent({ sag: -0.6 }).parts.map((p) => (p.kind === 'member' ? { ...p, colour: 'red' } : p)) };
  eq(lines(red).includes('\\draw[struct member, draw=red] (0,0) .. controls (2.667,-1.067) and (5.333,-1.067) .. (8,0);'), true, 'in its own colour');
  const cut: StructureModel = { ...bent({ sag: -0.6 }), parts: [...bent({ sag: -0.6 }).parts, { id: 'c', kind: 'cut', p: { x: 2, y: 1 }, q: { x: 2, y: -2 } }] };
  const section = lines(cut, 'section');
  const kept = section.find((l) => l.startsWith('\\draw[struct member]'))!;
  eq([kept.includes('controls'), kept.split(' -- ').length], [false, 25], 'a section keeps part of the curve, as points along it');
  // the rest of the picture is as before: only the member's line, the load on it and its label move
  const changed = curved.filter((l) => !straight.includes(l));
  eq([changed.length, changed.every((l) => l.includes('controls') || /^\\(draw\[struct (load|line)|node)/.test(l))], [22, true], 'the member, the band, the 19 arrows between the joints and the load’s label');
}

// ─── the file ───

(async () => {
  eq([structureNeedsVersion5(sampleBeam(), {}), structureNeedsVersion5(bent({ sag: -0.6 }), {})], [false, true], 'a bend makes it version 5');
  const diagram: DiagramFile = { language: 'tikz', pkg: 'structures', style: { view: 'diagrams', moments: 'tension' }, model: bent({ sag: -0.6, shape: 'sbend', ghost: true, label: '$v$' }), version: 1 };
  const code = structureCode(diagram.model, diagram.style);
  const back = await readDiagramFile(await diagramFileText(diagram, code));
  eq([back.diagram?.version, back.diagram?.model, back.edited], [5, diagram.model, false], 'a bent member: version 5, and it comes back as drawn');
  eq(structureCode(back.diagram!.model, back.diagram!.style), code, 'and writes the same code');
  const plain = { ...diagram, model: sampleBeam() };
  eq((await readDiagramFile(await diagramFileText(plain, structureCode(plain.model, plain.style)))).diagram?.version, 1, 'a straight one stays version 1');
  console.log('bend.check: ok');
})();
