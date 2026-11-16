// Self-check for the vector diagrams mode: constructions stay exact as their points move, the tools' edits, and the
// TikZ each starter writes. Run:
// npx esbuild apps/frontend/src/diagram/modes/vectors/vectors.check.ts --bundle --platform=node --log-level=warning | node
import { isColour } from '../shared';
import { eqLineEnds, notate, vectorCode, readStyle, styledVectors } from './code';
import { COLOURS, addPanel, addPoint, applyTool, dropUnused, equationText, frameOf, nameFree, newEqLine, setEquation, vectorsNeedVersion5, withText, clipLine, copyIds, dividingSegment, lineThroughPoints, newAxes, pasteInto, projections, removeIds, resolve, rightCorners, triangleMidpoints } from './model';
import type { Item, Link, VPoint, VectorModel } from './model';

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
  eq(vec.model.items.find((i) => i.id === vec.id), { id: vec.id, kind: 'vector', a: 'O', b: 'B' }, 'a vector, its look left to the Style');
  const old = applyTool(m, 'vector', ['O', 'B'], false)!;
  eq(old.model.items.find((i) => i.id === old.id), { id: old.id, kind: 'vector', a: 'O', b: 'B', width: 'very thick' }, 'very thick where the Style has no vector thickness');
  eq(applyTool(m, 'vector', ['O', 'O']), null, 'not to itself');
  eq(applyTool(m, 'polygon', ['O', 'A']), null, 'a polygon needs three');
  const axes = newAxes(m, 'g1');
  eq(axes.model.items.find((i) => i.id === axes.id), { id: axes.id, kind: 'axes', panel: 'g1', x: [-1.5, 6.5], y: [-1.5, 4.5], ticks: true }, 'axes past the points, no second O');
  const two = addPanel(dividingSegment());
  eq(two.panels.map((p) => [p.shift, p.caption]), [[0, "(a)"], [8.5, "(b)"]], 'a second panel to the right, both captioned');
}

// ─── the code ───

const code = (m: VectorModel, style: Record<string, unknown> = {}) => vectorCode(m, style);
eq(readStyle({}), { scale: 1, grid: 0.5, tips: 'stealth', tipSize: 1, pointSize: 2 }, 'default style');
eq(readStyle({ width: 'huge', vectorWidth: 1.5, colour: ' ', tips: 'none' }), { scale: 1, grid: 0.5, tips: 'stealth', tipSize: 1, pointSize: 2, vectorWidth: 1.5 }, 'a style read back keeps what it can');

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

// ─── every look its own ───

{
  // one line for an item, and the libraries the drawing needs
  const one = (item: Item, style: Record<string, unknown> = {}, extra: VPoint[] = []) => {
    const m: VectorModel = { panels: [{ id: 'g1', shift: 0 }], points: [{ id: 'A', name: 'A', x: 0, y: 0, panel: 'g1' }, { id: 'B', name: 'B', x: 2, y: 1, panel: 'g1' }, ...extra], items: [item] };
    const { body, libraries } = code(m, style);
    return [body.split('\n').filter((l) => l.trim() && !l.includes('\\coordinate') && !l.includes('tikzpicture')).map((l) => l.trim()), libraries, body.split('\n')[0]];
  };
  const link = (patch: Partial<Link> = {}): Link => ({ id: 'l', kind: 'vector', a: 'A', b: 'B', ...patch });
  eq(one(link()), [['\\draw[->] (A) -- (B);'], [], '\\begin{tikzpicture}[>=stealth]'], 'a plain vector, the Style’s tip');
  // thickness by name or in pt, dashes, opacity and colour (a mix, or one picked)
  eq(one(link({ width: 'semithick' }))[0], ['\\draw[->, semithick] (A) -- (B);'], 'a named thickness');
  eq(one(link({ width: 0.7 }))[0], ['\\draw[->, line width=0.7pt] (A) -- (B);'], 'a thickness in pt');
  eq(one(link({ kind: 'segment', dash: 'dotted' }))[0], ['\\draw[dotted] (A) -- (B);'], 'dotted');
  eq(one(link({ kind: 'segment', dash: 'dash dot' }))[0], ['\\draw[dash dot] (A) -- (B);'], 'dash dot');
  eq(one(link({ kind: 'segment', dash: [4, 1.5] }))[0], ['\\draw[dash pattern=on 4pt off 1.5pt] (A) -- (B);'], 'a custom dash');
  eq(one(link({ kind: 'segment', dashed: true, dash: 'solid' }))[0], ['\\draw (A) -- (B);'], 'a dash set takes over from 2.0’s dashed');
  eq(one(link({ kind: 'segment', opacity: 0.4, colour: 'green!60!black' }))[0], ['\\draw[green!60!black, opacity=0.4] (A) -- (B);'], 'opacity and a mix');
  eq(one(link({ kind: 'segment', colour: '#ff8000' }))[0], ['\\draw[color={rgb,255:red,255;green,128;blue,0}] (A) -- (B);'], 'a picked colour');
  // tips at each end, their size, double-headed, and one halfway
  eq(one(link({ end: 'latex' })), [['\\draw[-{Latex}] (A) -- (B);'], ['arrows.meta'], '\\begin{tikzpicture}[>=stealth]'], 'its own tip, from arrows.meta');
  eq(one(link({ start: 'bar', end: 'open triangle', tipSize: 1.5 }))[0], ['\\draw[{Bar[scale=1.5]}-{Triangle[open, scale=1.5]}] (A) -- (B);'], 'a tip at each end, larger');
  eq(one(link({ start: 'stealth' }))[0], ['\\draw[{Stealth}-{Stealth}] (A) -- (B);'], 'double-headed');
  eq(one(link({ end: 'none' }))[0], ['\\draw (A) -- (B);'], 'a vector with no tip');
  eq(one(link({ kind: 'segment', end: 'to' }))[0], ['\\draw[-{To}] (A) -- (B);'], 'a segment with a tip');
  eq(one(link({ kind: 'segment', middle: true })).slice(0, 2), [['\\draw[postaction={decorate, decoration={markings, mark=at position 0.5 with {\\arrow{Stealth}}}}] (A) -- (B);'], ['arrows.meta', 'decorations.markings']], 'an arrow at the middle, markings only when used');
  // the Style's defaults, for what has none of its own; an item's own wins
  const styled = { tips: 'triangle', tipSize: 2, width: 'thick', vectorWidth: 1.4, colour: 'teal', pointSize: 3 };
  eq(one(link(), styled), [['\\draw[->, line width=1.4pt, teal] (A) -- (B);'], ['arrows.meta'], '\\begin{tikzpicture}[>={Triangle[scale=2]}]'], 'a vector takes the Style');
  eq(one(link({ width: 'thin', colour: 'black' }), styled)[0], ['\\draw[->, thin] (A) -- (B);'], 'its own thickness and colour win');
  eq(one(link({ kind: 'segment' }), styled)[0], ['\\draw[thick, teal] (A) -- (B);'], 'a segment takes the line thickness');
  eq(one(link(), { tips: 'latex' })[2], '\\begin{tikzpicture}[>=latex]', 'TikZ’s own latex needs no library');
  // highlights, polygons, marks and drops
  eq(one(link({ kind: 'highlight' }), styled)[0], ['\\draw[line width=2.5pt, blue!50] (A) -- (B);'], 'a highlight keeps its look');
  eq(one(link({ kind: 'highlight', width: 4, colour: 'orange', opacity: 0.5 }))[0], ['\\draw[line width=4pt, orange, opacity=0.5] (A) -- (B);'], 'a highlight of its own');
  const C: VPoint = { id: 'C', name: 'C', x: 0, y: 2, panel: 'g1' };
  eq(one({ id: 'p', kind: 'polygon', points: ['A', 'B', 'C'], fill: 'blue!10', fillOpacity: 0.5, colour: 'blue', width: 'thick', opacity: 0.8 }, {}, [C])[0], ['\\draw[fill=blue!10, fill opacity=0.5, thick, draw=blue, draw opacity=0.8] (A) -- (B) -- (C) -- cycle;'], 'a polygon’s fill and line, the line’s colour as draw= so it fills blue!10');
  eq(one({ id: 'p', kind: 'polygon', points: ['A', 'B', 'C'], fill: '#000080' }, {}, [C])[0], ['\\draw[fill={rgb,255:red,0;green,0;blue,128}] (A) -- (B) -- (C) -- cycle;'], 'a picked fill');
  eq(one({ id: 'd', kind: 'drop', from: 'B', axis: 'x', dash: 'dotted', colour: 'gray' })[0], ['\\draw[dotted, gray] (B) -- (B |- 0,0);'], 'a dotted grey drop');
  eq(one({ id: 'd', kind: 'drop', from: 'B', axis: 'x', dash: 'solid' })[0], ['\\draw (B) -- (B |- 0,0);'], 'a solid drop');
  eq(one({ id: 'r', kind: 'right', at: 'A', toward: 'B', width: 'thick', colour: 'red' })[0][0].startsWith('\\draw[thick, red] '), true, 'a right-angle mark’s look');
  // labels' size and colour
  eq(one(link({ label: { text: '$\\mathbf{a}$', size: 'footnotesize', colour: 'red' } }))[0], ['\\draw[->] (A) -- (B) node[midway, above, font=\\footnotesize, red] {$\\mathbf{a}$};'], 'a vector’s label');
  eq(one({ id: 't', kind: 'text', panel: 'g1', x: 1, y: 1, text: 'Hi', size: 'Large', colour: '#00ff00' })[0], ['\\node[font=\\Large, color={rgb,255:red,0;green,255;blue,0}] at (1,1) {Hi};'], 'a note’s');
}
{
  // points: size, shape and colour, with the label's
  const dots = (patch: Partial<VPoint>, style: Record<string, unknown> = {}) =>
    vectorCode({ panels: [{ id: 'g1', shift: 0 }], points: [{ id: 'P', name: 'P', x: 1, y: 1, panel: 'g1', dot: true, label: { text: '$P$', side: 'above' }, ...patch }], items: [] }, style)
      .body.split('\n')
      .slice(2, -2)
      .map((l) => l.trim());
  eq(dots({}), ['\\fill (P) circle (2pt) node[above] {$P$};'], 'a dot as before');
  eq(dots({}, { pointSize: 3, colour: 'blue' }), ['\\fill[blue] (P) circle (3pt);', '\\node[above] at (P) {$P$};'], 'the Style’s size and colour, the label a node of its own so it stays black');
  eq(dots({ size: 1.5, shape: 'open', colour: 'red' }), ['\\draw[red, fill=white] (P) circle (1.5pt);', '\\node[above] at (P) {$P$};'], 'an open dot');
  eq(dots({ shape: 'cross', label: { text: '$P$', side: 'above', size: 'small', colour: 'teal' } }), ['\\draw (P) ++(-2pt,-2pt) -- ++(4pt,4pt) ++(-4pt,0) -- ++(4pt,-4pt);', '\\node[above, font=\\small, teal] at (P) {$P$};'], 'a cross, its label beside it');
}
{
  // axes: colour, thickness, tips, ticks' length and step, the numbers' size and a grid
  const lines = vectorCode(
    {
      panels: [{ id: 'g1', shift: 0 }],
      points: [],
      items: [{ id: 'ax', kind: 'axes', panel: 'g1', x: [-1, 2], y: [-1, 1.5], ticks: true, colour: 'gray', width: 'thick', tip: 'latex', tick: 0.1, step: 0.5, numbers: 'tiny', grid: true, gridColour: 'blue!20', gridWidth: 0.2 }]
    },
    {}
  ).body.split('\n');
  eq(lines.slice(1, 6).map((l) => l.trim()), [
    '\\draw[line width=0.2pt, blue!20, step=0.5] (-1,-1) grid (2,1.5);',
    '\\draw[-{Latex}, gray, thick] (-1,0) -- (2,0) node[right] {$x$};',
    '\\draw[-{Latex}, gray, thick] (0,-1) -- (0,1.5) node[above] {$y$};',
    '\\foreach \\t in {-0.5,0.5,1,1.5} \\draw[gray, thick] (\\t,0.1) -- (\\t,-0.1) node[below] {\\tiny $\\t$};',
    '\\foreach \\t in {-0.5,0.5,1} \\draw[gray, thick] (0.1,\\t) -- (-0.1,\\t) node[left] {\\tiny $\\t$};'
  ], 'axes of their own');
  const bare = vectorCode({ panels: [{ id: 'g1', shift: 0 }], points: [], items: [{ id: 'ax', kind: 'axes', panel: 'g1', x: [-1, 2], y: [-1, 1], tip: 'none', grid: true }] }, {}).body.split('\n');
  eq(bare.slice(1, 4).map((l) => l.trim()), ['\\draw[very thin, gray!30] (-1,-1) grid (2,1);', '\\draw (-1,0) -- (2,0) node[right] {$x$};', '\\draw (0,-1) -- (0,1) node[above] {$y$};'], 'no tips, a grey grid');
}
{
  // old models keep their code: 2.0's width and dashed, and no new keys, write what they did
  const old = { ...dividingSegment(), items: [...dividingSegment().items, { id: 'dd', kind: 'segment' as const, a: 'O', b: 'B', dashed: true, width: 'ultra thick' as const }] };
  eq(code(old).body.includes('  \\draw[ultra thick, dashed] (O) -- (B);'), true, '2.0’s dashed and width');
  for (const starter of [lineThroughPoints, dividingSegment, triangleMidpoints, projections]) eq(code(starter()).libraries.filter((l) => l !== 'calc'), [], `${starter.name} needs no new library`);
}

// ─── 2.5 fixes ───

{
  // Style › Vector thickness › Normal is kept as null, so new vectors stay thin; only a pre-2.0 Style has none
  const normal = JSON.parse(JSON.stringify({ vectorWidth: null }));
  eq([styledVectors(normal), styledVectors({ vectorWidth: 'very thick' }), styledVectors({})], [true, true, false], 'Normal is a vector thickness, a missing one is pre-2.0');
  eq(readStyle(normal).vectorWidth, undefined, 'and Normal writes no thickness');
  // clearing a label's text keeps its side, size and colour; a label with nothing else goes
  eq(withText({ text: '$A$', side: 'below' as const, size: 'small' as const, colour: 'red' }, ''), { text: '', side: 'below', size: 'small', colour: 'red' }, 'an emptied label keeps its look');
  eq(withText({ text: '$\\mathbf{a}$', pos: 0.3 }, ''), { text: '', pos: 0.3 }, 'and its place along the line');
  eq(withText({ text: '$A$', side: undefined }, ''), undefined, 'a label with nothing but text goes');
  eq(withText({ text: '', colour: 'red' }, 'x'), { text: 'x', colour: 'red' }, 'new text takes the kept look');
  // the swatches are colours the shared field takes
  eq(COLOURS.every(isColour), true, 'every swatch is an xcolor colour');
  // a point's name is its own in its panel
  const m = dividingSegment();
  const A = m.points.find((p) => p.id === 'A')!;
  eq([nameFree(m, A, 'B'), nameFree(m, A, 'A'), nameFree(m, A, 'Z')], [false, true, true], 'no second B in a panel');
  const two = addPanel(m);
  eq(nameFree({ ...two, points: [...two.points, { ...A, id: 'A9', panel: two.panels[1].id }] }, { ...A, id: 'A9', panel: two.panels[1].id }, 'A'), true, 'another panel may have its own A');
  // a pick given up takes away the points it made that nothing uses
  const picked = { ...m, points: [...m.points, { id: 'v9', name: 'Z', x: 9, y: 9, panel: 'g1' }] };
  eq(dropUnused(picked, ['v9']).points.length, m.points.length, 'a stray point goes');
  eq(dropUnused(m, ['A', 'B']), m, 'a point a vector or construction uses stays');
}

// ─── 2.5's items: constructions, angles, circles, lines from equations, drops, ticks and vector names ───

{
  const pt = (id: string, x: number, y: number): VPoint => ({ id, name: id, x, y, panel: 'g1' });
  const four = (): VectorModel => ({ panels: [{ id: 'g1', shift: 0 }], points: [pt('O', 0, 0), pt('A', 3.8, 2.9), pt('B', 5.3, 0), pt('C', 1, 3)], items: [] });
  const body = (m: VectorModel, style: Record<string, unknown> = {}) => vectorCode(m, style).body.split('\n').map((l) => l.trim());
  const made = (m: VectorModel, tool: string, picks: string[]) => applyTool(m, tool, picks)!;
  const pointOf = (m: VectorModel, id: string) => m.points.find((p) => p.id === id)!;

  // a point made by a drawing tool has no dot or letter; the Point tool's has both
  const bare = addPoint(four(), 'g1', { x: 1, y: 1 }, true);
  eq([pointOf(bare.model, bare.id).dot, pointOf(bare.model, bare.id).label], [undefined, undefined], 'a tool’s point is bare');
  const named = addPoint(four(), 'g1', { x: 1, y: 1 });
  eq([pointOf(named.model, named.id).dot, pointOf(named.model, named.id).label?.text], [true, '$D$'], 'the Point tool’s keeps its dot and letter');

  // where two lines cross, following their points; nowhere while parallel, and left out of the code
  let m = four();
  const meet = made(m, 'meet', ['O', 'A', 'B', 'C']);
  m = meet.model;
  const X = resolve(m).get(meet.id)!;
  close((X.y / X.x) - 2.9 / 3.8, 0, 'on OA');
  close((X.y - 0) * (1 - 5.3) - (X.x - 5.3) * 3, 0, 'and on BC');
  eq(body(m).includes(`\\coordinate (D) at (intersection of O--A and B--C);`), true, 'written with TikZ’s own intersection');
  const parallel = move(m, 'C', 5.3 + 3.8, 2.9);
  eq(Number.isNaN(resolve(parallel).get(meet.id)!.x), true, 'parallel lines meet nowhere');
  eq(body({ ...parallel, items: [{ id: 'v', kind: 'vector', a: 'O', b: meet.id }] }).some((l) => l.includes('(D)')), false, 'so it and what’s drawn to it are left out');
  closePt(resolve(move(m, 'A', 1, 1)).get(meet.id), 15.9 / 7.3, 15.9 / 7.3, 'and it follows A');

  // a signed scalar multiple, drawn from the tail with its label
  m = { ...four(), points: [pt('O', 0, 0), pt('V', 1, 2)], items: [{ id: 'v', kind: 'vector', a: 'O', b: 'V', label: { text: '$\\mathbf{v}$' } }] };
  const twice = made(m, 'scale', ['O', 'V']);
  closePt(resolve(twice.model).get(twice.id), 2, 4, '2v');
  const negative = { ...twice.model, points: twice.model.points.map((p) => (p.id === twice.id ? { ...p, of: { kind: 'scale' as const, a: 'O', b: 'V', k: -2 } } : p)) };
  closePt(resolve(negative).get(twice.id), -2, -4, '−2v');
  closePt(resolve(move(negative, 'V', 1, -1)).get(twice.id), -2, 2, 'following v');
  eq(body(negative).filter((l) => l.includes('(A)')), ['\\coordinate (A) at ($(O)!-2!(V)$);', '\\draw[->] (O) -- (A) node[midway, left] {$2\\mathbf{v}$};'], 'written with calc, labelled from v’s own label');
  eq([pointOf(twice.model, twice.id).dot, pointOf(twice.model, twice.id).label], [undefined, undefined], 'its tip bare');

  // AB placed at P: v − u from P
  m = four();
  const placedAt = made(m, 'place', ['O', 'A', 'C']);
  closePt(resolve(placedAt.model).get(placedAt.id), 4.8, 5.9, 'OA from C');
  eq(placedAt.model.items.find((i) => i.kind === 'vector')!, { id: placedAt.model.items[0].id, kind: 'vector', a: 'C', b: placedAt.id, label: { text: '$\\mathbf{a}$', side: 'left' } }, 'drawn from C, named a');

  // the reflection of P(1,1) in x + y = 5 is (4,4), and follows
  m = { ...four(), points: [pt('P', 1, 1), pt('M', 0, 5), pt('N', 5, 0)] };
  const mirror = made(m, 'reflect', ['P', 'M', 'N']);
  closePt(resolve(mirror.model).get(mirror.id), 4, 4, 'P′');
  closePt(resolve(move(mirror.model, 'P', 0, 0)).get(mirror.id), 5, 5, 'F(0,0) = (5,5)');
  eq(body(mirror.model).includes('\\coordinate (A) at ($(P)!2!($(M)!(P)!(N)$)$);'), true, 'twice the way to the foot');

  // a parallel and a perpendicular through a point: a line through it and a bare point that aims it
  m = four();
  const par = made(m, 'parallel', ['O', 'B', 'C']);
  const aim = par.model.points.find((p) => !m.points.includes(p))!;
  closePt(resolve(par.model).get(aim.id), 6.3, 3, 'parallel to OB through C');
  eq(par.model.items.find((i) => i.id === par.id), { id: par.id, kind: 'line', a: 'C', b: aim.id }, 'the line is selected');
  const perp = made(m, 'perp', ['O', 'B', 'C']);
  const perpAim = perp.model.points.find((p) => !m.points.includes(p))!;
  closePt(resolve(perp.model).get(perpAim.id), 1, 8.3, 'square to OB through C');
  eq(body(perp.model).includes('\\coordinate (D) at ($(C)!1!90:($(C)+(B)-(O)$)$);'), true, 'OB turned a quarter about C');
  eq(frameOf(perp.model, 'g1'), frameOf(m, 'g1'), 'the aiming point doesn’t stretch the frame');

  // a line from its equation with its intercepts, which follow it; the label follows while it's as written
  eq([equationText({ a: 4, b: 1, c: -9 }), equationText({ a: -1, b: 0, c: 2.5 }), equationText({ a: 0, b: 0, c: 0 })], ['$4x+y-9=0$', '$-x+2.5=0$', '$0=0$'], 'equations as TeX');
  let e = newEqLine({ ...four(), points: [] }, 'g1');
  m = setEquation(setEquation(setEquation(e.model, e.id, { a: 4 }), e.id, { b: 1 }), e.id, { c: -9 });
  const [xi, yi] = m.points;
  closePt(resolve(m).get(xi.id), 2.25, 0, 'x-intercept');
  closePt(resolve(m).get(yi.id), 0, 9, 'y-intercept');
  eq([m.items[0].kind === 'eqline' && m.items[0].label?.text, xi.label?.text, yi.label?.text, xi.shape], ['$4x+y-9=0$', '$(2.25,0)$', '$(0,9)$', 'cross'], 'their labels followed, crosses');
  const own = setEquation({ ...m, points: m.points.map((p) => (p.id === xi.id ? { ...p, label: { text: '$X$' } } : p)) }, e.id, { c: -8 });
  eq(own.points.find((p) => p.id === xi.id)!.label?.text, '$X$', 'a label of its own stays');
  const flat = setEquation(m, e.id, { a: 0 });
  eq([Number.isNaN(resolve(flat).get(xi.id)!.x), body(flat).filter((l) => l.startsWith('\\coordinate')).length], [true, 1], 'a flat line has no x-intercept, left out');
  eq(body(m).filter((l) => l.startsWith('\\coordinate') || l.includes('=0$')), ['\\coordinate (A) at (2.25,0);', '\\coordinate (B) at (0,9);', '\\draw (-0.25,10) -- (2.5,-1) node[midway, above right] {$4x+y-9=0$};'], 'the line out to the frame, left to right');
  eq(eqLineEnds({ a: 1, b: 0, c: -1 }, { minX: -2, maxX: 2, minY: -2, maxY: 2 }), [{ x: 1, y: -2 }, { x: 1, y: 2 }], 'an upright line runs upwards');
  eq(eqLineEnds({ a: 1, b: 0, c: -5 }, { minX: -2, maxX: 2, minY: -2, maxY: 2 }), null, 'one outside the frame isn’t drawn');
  eq(removeIds(m, [e.id]).points, [], 'its intercepts go with it');

  // an angle: the one less than a half turn, written as the angle pic, live on its points
  m = four();
  const angle = made(m, 'angle', ['O', 'B', 'A']);
  eq(angle.model.items[0], { id: angle.id, kind: 'angle', at: 'O', from: 'B', to: 'A', label: { text: '$\\theta$' } }, 'from OB anticlockwise to OA');
  eq((made(m, 'angle', ['O', 'A', 'B']).model.items[0] as { from: string }).from, 'B', 'whichever side is clicked first');
  const theta = { ...angle.model, items: [{ ...angle.model.items[0], radius: 0.8, double: true, colour: 'red', label: { text: '$\\theta$', size: 'small' as const } }] as Item[] };
  eq(body(theta).filter((l) => l.startsWith('\\pic')), [
    '\\pic[draw, red, angle radius=0.8cm, angle eccentricity=1.313, pic text={$\\theta$}, pic text options={font=\\small}] {angle=B--O--A};',
    '\\pic[draw, red, angle radius=0.87cm] {angle=B--O--A};'
  ], 'a double arc with its label');
  eq(vectorCode(theta, {}).libraries, ['angles'], 'the angles library');

  // a circle and an arc, with the numbers they have now
  m = { ...four(), points: [pt('O', 0, 0), pt('Q', 1.2, 1.6), pt('S', -1.5, 0)] };
  const circle = made(m, 'circle', ['O', 'Q']);
  eq(body(circle.model).includes('\\draw (O) circle[radius=2];'), true, 'a circle through Q');
  eq(body(move(circle.model, 'Q', 0, 3)).includes('\\draw (O) circle[radius=3];'), true, 'following Q');
  const arc = made(m, 'arc', ['O', 'S', 'Q']);
  eq(body(arc.model).includes('\\draw (S) arc[start angle=180, end angle=413.13, radius=1.5];'), true, 'an arc from S anticlockwise round to Q’s side');

  // drop to both axes, dotted in the point's colour; equal-length ticks, one more each time
  m = { ...four(), points: [pt('O', 0, 0), { ...pt('A', 2, 3), colour: 'red' }] };
  eq(body(made(m, 'dropBoth', ['A']).model).includes('\\draw[dotted, red] (A -| 0,0) -- (A) -- (A |- 0,0);'), true, 'a drop to both axes');
  let ticked = made(m, 'ticks', ['O', 'A']);
  eq(ticked.model.items[0], { id: ticked.id, kind: 'segment', a: 'O', b: 'A', ticks: 1 }, 'a segment with one tick');
  for (const n of [2, 3, 1]) {
    ticked = made(ticked.model, 'ticks', ['A', 'O']);
    eq((ticked.model.items[0] as Link).ticks, n, `then ${n}`);
  }
  eq(body({ ...m, items: [{ id: 'v', kind: 'vector', a: 'O', b: 'A', ticks: 2 }] }).includes('\\draw[->, postaction={decorate, decoration={markings, mark=at position 0.5 with {\\draw[-] (-1pt,-3pt) -- ++(0,6pt) (1pt,-3pt) -- ++(0,6pt);}}}] (O) -- (A);'), true, 'two ticks on a vector, no tips on them');

  // vector names: each \mathbf in the labels in the chosen notation, and esvect only when \vv is written
  eq([notate('$\\mathbf{a}+\\mathbf {b}$', 'vec'), notate('$\\mathbf{OA}$', 'arrow'), notate('$\\mathbf{a}$', 'vv'), notate('$\\mathbf{a}$')], ['$\\vec{a}+\\vec {b}$', '$\\overrightarrow{OA}$', '$\\vv{a}$', '$\\mathbf{a}$'], 'notations');
  const named2 = dividingSegment();
  eq(vectorCode(named2, { notation: 'vv' }).packages, ['tikz', 'esvect'], 'esvect for \\vv');
  eq(vectorCode({ ...named2, items: [] , points: named2.points.map((p) => ({ ...p, label: undefined }))}, { notation: 'vv' }).packages, ['tikz'], 'not when nothing is written with it');
  eq(body(named2, { notation: 'arrow' }).includes('\\draw[->, very thick] (O) -- (A) node[midway, below] {$\\overrightarrow{a}$};'), true, 'a label in the notation');
  eq(vectorCode(named2, { notation: 'bold' }), vectorCode(named2, {}), 'bold writes what it did');
  eq([readStyle({ notation: 'vec' }).notation, readStyle({ notation: 'bold' }).notation, readStyle({ notation: 'hat' }).notation], ['vec', undefined, undefined], 'the Style’s notation read back');

  // copied and pasted, a construction is built on the copies
  const clip = copyIds(meet.model, [meet.id]);
  const pasted = pasteInto(meet.model, clip, 'g1', { x: 1, y: 0 });
  const copy = pasted.model.points.find((p) => p.id === pasted.ids[pasted.ids.length - 1])!;
  eq(copy.of?.kind === 'meet' && [copy.of.a, copy.of.b, copy.of.c, copy.of.d].every((id) => pasted.ids.includes(id)), true, 'a copied meet is built on the copied points');

  // version 5 only with what's new
  for (const starter of [lineThroughPoints, dividingSegment, triangleMidpoints, projections]) eq(vectorsNeedVersion5(starter()), false, `${starter.name} stays as it was`);
  eq([vectorsNeedVersion5(meet.model), vectorsNeedVersion5(theta), vectorsNeedVersion5(dividingSegment(), { notation: 'vec' }), vectorsNeedVersion5(placedAt.model)], [true, true, true, false], 'new kinds and notations make version 5; a vector placed at a point is 2.4’s v − u');
}

console.log('vectors.check: ok');
