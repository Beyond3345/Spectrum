// Self-check for the Venn diagram preset: each region's boundary, its area against the textbook lens, the text's place
// and the code. Run:
// npx esbuild apps/frontend/src/diagram/modes/form/venn.check.ts --bundle --platform=node --log-level=warning | node
import { formCode, newFormModel, presetFor } from './presets';
import { circlesOf, labelPoint, maskOf, regionLoops, vennCode } from './venn';
import type { Arc } from './venn';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const close = (actual: number, expected: number, what: string, tolerance = 1e-3) => {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};

/** A loop's signed area (anticlockwise positive), from its arcs sampled finely. */
function area(circles: ReturnType<typeof circlesOf>, loops: Arc[][]) {
  let total = 0;
  for (const loop of loops) {
    const points = loop.flatMap(({ c, a, b }) =>
      Array.from({ length: 400 }, (_, k) => {
        const t = ((a + ((b - a) * k) / 400) * Math.PI) / 180;
        return [circles[c].x + circles[c].r * Math.cos(t), circles[c].y + circles[c].r * Math.sin(t)];
      })
    );
    for (let i = 0; i < points.length; i += 1) {
      const [p, q] = [points[i], points[(i + 1) % points.length]];
      total += (p[0] * q[1] - q[0] * p[1]) / 2;
    }
  }
  return total;
}

// two sets: the lens of two circles of radius r, d apart, is 2r² acos(d/2r) − (d/2)√(4r² − d²)
const two = circlesOf(2);
const [r, d] = [two[0].r, two[1].x - two[0].x];
const lens = 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);
close(area(two, regionLoops(two, 3)), lens, 'A and B: the lens');
close(area(two, regionLoops(two, 1)), Math.PI * r * r - lens, 'A only: the circle less the lens');
close(area(two, regionLoops(two, 2)), Math.PI * r * r - lens, 'B only');
// outside, going round clockwise: minus the union's area
close(area(two, regionLoops(two, 0)), -(2 * Math.PI * r * r - lens), 'outside: round the union, clockwise');
eq(regionLoops(two, 3).map((loop) => loop.length), [2], 'the lens is two arcs, one loop');
eq(regionLoops(two, 4), [], 'no third set, no region');

// three sets: the seven regions make up the union; by symmetry each set's own part is the same size
const three = circlesOf(3);
const sizes = [1, 2, 4, 3, 5, 6, 7].map((mask) => area(three, regionLoops(three, mask)));
eq(sizes.every((s) => s > 0), true, 'every region is there, anticlockwise');
close(sizes[0], sizes[1], 'A only as B only');
close(sizes[1], sizes[2], 'B only as C only');
close(sizes[3], sizes[4], 'A and B only as A and C only');
close(sizes.reduce((a, b) => a + b), -area(three, regionLoops(three, 0)), 'the seven make the union');
// the union by inclusion and exclusion: three circles, less three lenses, plus the middle
const lens3 = 2 * r * r * Math.acos(Math.sqrt(3) / (2 * r)) - (Math.sqrt(3) / 2) * Math.sqrt(4 * r * r - 3);
close(sizes.reduce((a, b) => a + b), 3 * Math.PI * r * r - 3 * lens3 + sizes[6], 'inclusion and exclusion');

// each region's text is inside it, clear of the edges
for (const mask of [0, 1, 2, 3, 4, 5, 6, 7]) eq(maskOf(three, labelPoint(three, mask)), mask, `text for region ${mask} is in it`);
close(labelPoint(two, 3)[0], 0, 'the lens’s text in the middle', 1e-9);

// the code: a new drawing shades A and B; one \fill per shaded region
const venn = presetFor('venn')!;
const body = formCode(newFormModel('venn'), {}).body.split('\n');
eq(body[0], '\\begin{tikzpicture}', 'a picture');
eq([body[1].startsWith('\\fill[black!20] ('), body[1].split('arc[').length - 1, body[1].endsWith(' -- cycle;')], [true, 2, true], 'the lens, two arcs');
eq(body.slice(2), [
  '\\draw (-0.9,0) circle[radius=1.5];',
  '\\draw (0.9,0) circle[radius=1.5];',
  '\\draw (-2.9,-2) rectangle (2.9,2);',
  '\\node[anchor=315] at (-1.961,1.061) {$A$};',
  '\\node[anchor=225] at (1.961,1.061) {$B$};',
  '\\node[anchor=north west] at (-2.9,2) {$U$};',
  '\\end{tikzpicture}',
  ''
], 'the circles, the frame and the names');
const all = vennCode({ ...venn.values, sets: '3', shade: 'blue!25', ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].flatMap((m) => [[`shade${m}`, true], [`text${m}`, String(m)]])) });
eq(all.body.split('\n').filter((l) => l.startsWith('\\fill[blue!25')).length, 8, 'three sets: one \\fill per region, outside too');
eq(all.body.includes('\\fill[blue!25, even odd rule] (-2.866,-3) rectangle (2.866,2.5) ('), true, 'outside: the frame less the sets');
eq(all.body.split('\n').filter((l) => /^\\node at/.test(l)).length, 8, 'a count in each region');
eq(all.packages, ['tikz'], 'TikZ alone');
eq(vennCode({ ...venn.values, text3: '$\\mathbb{N}$' }).packages, ['tikz', 'amssymb'], 'amssymb for \\mathbb');
// two sets: the third set's regions and fields aren't there, outside only with the universal set
const twoSets = vennCode({ ...venn.values, shade4: true, text4: 'x', shade0: true, universe: false });
eq([twoSets.body.includes('{x}'), twoSets.body.includes('even odd'), twoSets.body.includes('rectangle')], [false, false, false], 'no C, no outside without the frame');
const shownWith = (values: Record<string, unknown>) => venn.fields.filter((f) => f.shown?.(values as never) ?? true).map((f) => f.key);
eq(shownWith({ sets: '2', universe: false }).filter((k) => /c$|4|5|6|7|0|^u$/.test(k)), [], 'two sets hide the third set’s fields and outside');
eq(shownWith({ sets: '3', universe: true }).length, venn.fields.length, 'three sets and the frame show them all');

console.log('venn.check: ok');
