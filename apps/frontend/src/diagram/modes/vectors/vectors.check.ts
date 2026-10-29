// Self-check for the vector diagrams mode: constructions stay exact as their points move, the tools' edits, and the
// TikZ each starter writes. Run:
// npx esbuild apps/frontend/src/diagram/modes/vectors/vectors.check.ts --bundle --platform=node --log-level=warning | node
import { vectorCode, readStyle } from './code';
import { addPanel, applyTool, clipLine, copyIds, dividingSegment, lineThroughPoints, newAxes, pasteInto, projections, removeIds, resolve, rightCorners, triangleMidpoints } from './model';
import type { VectorModel } from './model';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const close = (actual: number, expected: number, what: string) => {
  if (!(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)))) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};
const closePt = (p: { x: number; y: number } | undefined, x: number, y: number, what: string) => {
  close(p!.x, x, `${what} x`);
  close(p!.y, y, `${what} y`);
};
const move = (m: VectorModel, id: string, x: number, y: number): VectorModel => ({ ...m, points: m.points.map((p) => (p.id === id ? { ...p, x, y } : p)) });

// ─── constructions, exact and live ───

{
  const m = dividingSegment();
  closePt(resolve(m).get('M'), 4, 4 / 3, 'M divides AB 1:2');
  const moved = move(move(m, 'A', 6, 3), 'B', 0, 0);
  closePt(resolve(moved).get('M'), 4, 2, 'M follows A and B');
  const two = { ...m, points: m.points.map((p) => (p.id === 'M' ? { ...p, of: { kind: 'ratio' as const, a: 'A', b: 'B', m: 3, n: 1 } } : p)) };
  closePt(resolve(two).get('M'), 2.75, 3, 'a 3:1 ratio');
}
{
  const m = triangleMidpoints();
  const at = resolve(m);
  closePt(at.get('P'), 3, 0, 'P is the midpoint of OA');
  closePt(at.get('Q'), 1, 2, 'Q is the midpoint of OB');
  // PQ is half AB and parallel to it, wherever the corners go
  const moved = resolve(move(move(m, 'A', 7.3, -1.1), 'B', -2.2, 5.9));
  const [P, Q, A, B] = ['P', 'Q', 'A', 'B'].map((id) => moved.get(id)!);
  close(2 * (Q.x - P.x), B.x - A.x, 'PQ is half AB in x');
  close(2 * (Q.y - P.y), B.y - A.y, 'and in y');
}
{
  const m = projections();
  const at = resolve(m);
  closePt(at.get('aF'), 2.5, 0, '(a) the foot is under B');
  closePt(at.get('bF'), 0, 0, '(b) at a right angle the foot is O');
  closePt(at.get('cF'), -2, 0, '(c) obtuse: behind O');
  // the foot of a slanting line: from P(1,3) to the line through (0,0) and (4,2), at (2,1)
  const slant = move(move(m, 'aA', 4, 2), 'aB', 1, 3);
  closePt(resolve(slant).get('aF'), 2, 1, 'the foot on a slanting line');
  const F = resolve(slant).get('aF')!;
  close((1 - F.x) * 4 + (3 - F.y) * 2, 0, 'BF is square to OA');
}
{
  // u + v and v − u, from O and from the panel's origin
  let m = lineThroughPoints();
  const sum = applyTool(m, 'sum', ['U', 'V'])!;
  m = sum.model;
  closePt(resolve(m).get(sum.id), 1, 11, 'u + v');
  eq(m.items.filter((i) => i.kind === 'vector' && i.b === sum.id).map((i) => 'a' in i && i.a), ['O'], 'drawn from O');
  const diff = applyTool(m, 'diff', ['U', 'V'])!;
  closePt(resolve(diff.model).get(diff.id), -3, 1, 'v − u');
  const shifted = move(diff.model, 'O', 1, 1);
  closePt(resolve(shifted).get(diff.id), -2, 2, 'v − u from a moved O');
  closePt(resolve(shifted).get(sum.id), 0, 10, 'u + v from a moved O');
}

// ─── geometry ───

eq(clipLine({ x: 2, y: 5 }, { x: -1, y: 6 }, { minX: -3.5, maxX: 3.5, minY: -1, maxY: 7.5 }), [{ x: 3.5, y: 4.5 }, { x: -3.5, y: 5 + 5.5 / 3 }], 'a line out to the frame');
eq(clipLine({ x: 0, y: 0 }, { x: 0, y: 0 }, { minX: -1, maxX: 1, minY: -1, maxY: 1 }), null, 'no line through one point');
eq(rightCorners({ x: 0, y: 0 }, { x: 4, y: 0 }, false), [{ x: 0.35, y: 0 }, { x: 0.35, y: 0.35 }, { x: 0, y: 0.35 }], 'a right-angle mark');
eq(rightCorners({ x: 0, y: 0 }, { x: 4, y: 0 }, true)[1], { x: 0.35, y: -0.35 }, 'flipped');

// ─── edits ───

{
  let m = dividingSegment();
  // removing A takes M (built on it), the vector to A, the segment AB and the vector to M
  const gone = removeIds(m, ['A']);
  eq(gone.points.map((p) => p.id), ['O', 'B'], 'points built on A go with it');
  eq(gone.items.map((i) => i.id), ['b'], 'and what’s drawn on them');
  // copying M brings A and B; pasted, the copy is built on the copies
  const clip = copyIds(m, ['m']);
  eq(clip.points.map((p) => p.id), ['O', 'A', 'B', 'M'], 'a vector brings its points, a constructed point its parents');
  const pasted = pasteInto(m, clip, 'g1', { x: 1, y: -1 });
  m = pasted.model;
  eq(m.points.length, 8, 'four points more');
  const copyOfM = m.points.find((p) => p.id === pasted.ids[3])!;
  eq([copyOfM.of?.kind, pasted.ids.includes((copyOfM.of as { a: string }).a)], ['ratio', true], 'the copy divides the copied segment');
  eq(new Set(m.points.map((p) => p.name)).size, 8, 'with names of their own');
  closePt(resolve(m).get(copyOfM.id), 5, 1 / 3, 'and sits a step away');
  // tools
  const vec = applyTool(m, 'vector', ['O', 'B'])!;
  eq(vec.model.items.find((i) => i.id === vec.id), { id: vec.id, kind: 'vector', a: 'O', b: 'B', width: 'very thick' }, 'a vector');
  eq(applyTool(m, 'vector', ['O', 'O']), null, 'not to itself');
  eq(applyTool(m, 'polygon', ['O', 'A']), null, 'a polygon needs three');
  const axes = newAxes(m, 'g1');
  eq(axes.model.items.find((i) => i.id === axes.id), { id: axes.id, kind: 'axes', panel: 'g1', x: [-1.5, 6.5], y: [-1.5, 4.5], ticks: true }, 'axes past the points, no second O');
  const two = addPanel(dividingSegment());
  eq(two.panels.map((p) => [p.shift, p.caption]), [[0, "(a)"], [8.5, "(b)"]], 'a second panel to the right, both captioned');
}

// ─── the code ───

const code = (m: VectorModel, style: Record<string, unknown> = {}) => vectorCode(m, style);
eq(readStyle({}), { scale: 1, grid: 0.5, tips: 'stealth' }, 'default style');

{
  const { body, packages, libraries } = code(dividingSegment(), { scale: 1.1 });
  eq([packages, libraries], [['tikz'], ['calc']], 'calc for the ratio');
  eq(body.split('\n'), [
    '\\begin{tikzpicture}[scale=1.1, >=stealth]',
    '  \\coordinate (O) at (0,0);',
    '  \\coordinate (A) at (5,0);',
    '  \\coordinate (B) at (2,4);',
    '  \\coordinate (M) at ($(A)!{1/3}!(B)$);',
    '  \\draw (A) -- (B);',
    '  \\draw[->, very thick] (O) -- (A) node[midway, below] {$\\mathbf{a}$};',
    '  \\draw[->, very thick] (O) -- (B) node[midway, above left] {$\\mathbf{b}$};',
    '  \\draw[->, very thick, blue] (O) -- (M) node[pos=0.55, above] {$\\mathbf{m}$};',
    '  \\path (A) -- (M) node[midway, above right] {$1$};',
    '  \\path (M) -- (B) node[midway, above right] {$2$};',
    '  \\fill (O) circle (2pt) node[below left] {$O$};',
    '  \\node[below right] at (A) {$A$};',
    '  \\node[above] at (B) {$B$};',
    '  \\fill (M) circle (2pt) node[above right] {$M$};',
    '\\end{tikzpicture}',
    ''
  ], 'dividing a segment');
}
{
  const lines = code(lineThroughPoints()).body.split('\n');
  eq(lines.slice(4, 9), [
    '  \\draw[->] (-3.5,0) -- (3.5,0) node[right] {$x$};',
    '  \\draw[->] (0,-1) -- (0,7.5) node[above] {$y$};',
    '  \\foreach \\t in {-3,-2,-1,1,2,3} \\draw (\\t,0.08) -- (\\t,-0.08) node[below] {\\small $\\t$};',
    '  \\foreach \\t in {1,2,3,4,5,6,7} \\draw (0.08,\\t) -- (-0.08,\\t) node[left] {\\small $\\t$};',
    '  \\draw (3.5,4.5) -- (-3.5,6.833) node[pos=0.96, above] {$l$};'
  ], 'axes with ticks, and the line out to them');
  eq(lines.includes('  \\draw[->, very thick] (U) -- (V) node[pos=0.35, below] {$\\mathbf{d}=\\mathbf{v}-\\mathbf{u}$};'), true, 'd = v − u');
  eq(code(lineThroughPoints()).libraries, [], 'no calc without constructions');
}
{
  const lines = code(triangleMidpoints()).body.split('\n');
  eq(lines.slice(4, 6), ['  \\coordinate (P) at ($(O)!0.5!(A)$);', '  \\coordinate (Q) at ($(O)!0.5!(B)$);'], 'midpoints');
  eq(lines.filter((l) => l.includes('red') || l.includes('blue')), ['  \\draw[->, very thick, red] (A) -- (B);', '  \\draw[->, very thick, blue] (P) -- (Q);'], 'AB red, PQ blue');
}
{
  const lines = code(projections()).body.split('\n');
  eq(lines.filter((l) => l.includes('scope')), ['  \\begin{scope}', '  \\end{scope}', '  \\begin{scope}[xshift=6.5cm]', '  \\end{scope}', '  \\begin{scope}[xshift=14cm]', '  \\end{scope}'], 'three panels side by side');
  eq(lines.filter((l) => l.includes('(F) at')), ['    \\coordinate (F) at ($(O)!(B)!(A)$);', '    \\coordinate (F) at ($(O)!(B)!(A)$);', '    \\coordinate (F) at ($(O)!(B)!(A)$);'], 'each foot, exact');
  eq(lines.filter((l) => l.includes('line width')), ['    \\draw[line width=2.5pt, blue!50] (O) -- (F);', '    \\draw[line width=2.5pt, blue!50] (O) -- (F);'], 'highlighted projections');
  eq(lines.filter((l) => l.includes('{(')), ['    \\node at (2,-1) {(a)};', '    \\node at (2,-1) {(b)};', '    \\node at (1,-1) {(c)};'], 'captions under each');
  eq(lines.find((l) => l.startsWith('    \\draw (2.85')), '    \\draw (2.85,0) -- (2.85,0.35) -- (2.5,0.35);', 'a right-angle mark at the foot');
}
{
  // a drop to the x axis stays live in the code; ids of other panels' points never leak in
  const m = lineThroughPoints();
  const dropped = { ...m, items: [...m.items, { id: 'dr', kind: 'drop' as const, from: 'U', axis: 'x' as const }] };
  eq(code(dropped).body.includes('\\draw[dashed] (U) -- (U |- 0,0);'), true, 'a dashed drop to the axis');
  const twice = { ...m, points: [...m.points, { ...m.points[1], id: 'U2' }] };
  eq(code(twice).body.includes('\\coordinate (U2) at (2,5);'), true, 'a second U in a panel is renamed');
}

console.log('vectors.check: ok');
