// Self-check for the Mohr's circle preset: the circle's numbers against textbook cases (checked with SymPy 1.14), the
// three shear-axis conventions and the stress elements. Run:
// npx esbuild apps/frontend/src/diagram/modes/form/mohr.check.ts --bundle --platform=node --log-level=warning | node
import { clashes } from '../structures/labels';
import { MOHR, mohr, mohrDrawing } from './mohr';
import { formCode, formNeedsVersion5, formStyle, newFormModel, presetFor } from './presets';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const close = (actual: number, expected: number, what: string, tolerance = 1e-9) => {
  if (!(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)))) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};

// σx 80, σy −40, τxy 25 MPa: C 20, R 65, σ1 85, σ2 −45, θp 11.31°
{
  const m = mohr({ sigmaX: 80, sigmaY: -40, tauXY: 25 });
  close(m.C, 20, 'C');
  close(m.R, 65, 'R');
  close(m.sigma1, 85, 'σ1');
  close(m.sigma2, -45, 'σ2');
  close(m.tauMax, 65, 'τmax');
  close(Number(m.thetaP.toFixed(2)), 11.31, 'θp');
  close(m.thetaS, m.thetaP - 45, 'θs is 45° from θp');
  // rotating by θp gives the principal state: no shear, σ1 on x
  const p = mohr({ sigmaX: 80, sigmaY: -40, tauXY: 25, theta: m.thetaP }).rotated;
  close(p.sigmaX, 85, 'rotated by θp: σ1', 1e-9);
  close(p.tauXY, 0, 'rotated by θp: no shear', 1e-9);
  // the invariant: σx' + σy' = σx + σy
  const r = mohr({ sigmaX: 80, sigmaY: -40, tauXY: 25, theta: 30 }).rotated;
  close(r.sigmaX + r.sigmaY, 40, 'σx′ + σy′');
}

// σx 50, σy −10, τxy 40: C 20, R 50, σ1 70, σ2 −30, θp 26.57°
{
  const m = mohr({ sigmaX: 50, sigmaY: -10, tauXY: 40 });
  close(m.C, 20, 'second case: C');
  close(m.R, 50, 'second case: R');
  close(m.sigma1, 70, 'second case: σ1');
  close(m.sigma2, -30, 'second case: σ2');
  close(Number(m.thetaP.toFixed(2)), 26.57, 'second case: θp');
}

// σx 50, σy 30, τxy 0: in-plane τmax 10; with σz 0, the absolute τmax 25
{
  const m = mohr({ sigmaX: 50, sigmaY: 30, tauXY: 0, sigmaZ: 0 });
  close(m.tauMax, 10, 'in-plane τmax');
  eq(m.threeD!.sigma, [50, 30, 0], 'σ1 ≥ σ2 ≥ σ3');
  close(m.threeD!.tauMax, 25, 'absolute τmax');
  eq(mohr({ sigmaX: 50, sigmaY: 30, tauXY: 0 }).threeD, null, 'no σz, no 3D state');
}

// the preset: a new drawing takes the shear axis from Settings › Composer
eq(presetFor('mohr'), MOHR, 'the preset is listed');
eq(formStyle({ moments: 'tension', mohrShear: 'down', siUnits: true }, newFormModel('mohr')), { mohrShear: 'down', siUnits: true }, 'τ positive downward and siunitx by default');
eq(formStyle({ moments: 'tension', mohrShear: 'up', siUnits: false }, newFormModel('mohr')), { mohrShear: 'up', siUnits: false }, 'or as the settings say');

// the code: X drawn below the σ axis for τ positive downward and clockwise shear above, above it for τ positive upward
const code = (style: Record<string, unknown>, values = {}) => formCode({ preset: 'mohr', values: { ...MOHR.values, ...values } }, style);
const xPoint = (body: string) => body.match(/\\node\[anchor=[a-z ]+\] at \((-?[\d.]+),(-?[\d.]+)\) \{\$X\(/)!.slice(1).map(Number);
const down = code({ mohrShear: 'down' });
eq(xPoint(down.body)[1] < 0, true, 'τ down: X below the axis');
eq(down.body.includes('node[anchor=north] {$\\tau$}'), true, 'τ down: the axis points down');
eq(xPoint(code({ mohrShear: 'clockwise-above' }).body)[1] < 0, true, 'clockwise above: X (anticlockwise on its element) below');
eq(code({ mohrShear: 'clockwise-above' }).body.includes('{$\\tau$ (clockwise)}'), true, 'clockwise above: the axis says so');
eq(xPoint(code({ mohrShear: 'up' }).body)[1] > 0, true, 'τ up: X above the axis');
eq(code({}).body, down.body, 'no convention: τ positive downward');
eq(down.packages, ['tikz'], 'plain TikZ');
eq(down.libraries, ['arrows.meta', 'babel'], 'two libraries');
eq(/\$C = 20\$/.test(down.body) && /\\sigma_1 = 85\$/.test(down.body) && /\\sigma_2 = -45\$/.test(down.body) && /2\\theta_p = 22\.6\^\\circ/.test(down.body), true, 'the labels');
// stress elements
const count = (body: string) => (body.match(/% Stress element/g) ?? []).length;
eq(count(code({}, { elements: 'none' }).body), 0, 'no elements');
eq(count(down.body), 1, 'the original');
eq(count(code({}, { elements: 'rotated', theta: 30 }).body), 2, 'original and rotated');
eq(count(code({}, { elements: 'rotated' }).body), 1, 'no rotation, no rotated element');
eq(count(code({}, { elements: 'all', theta: 30 }).body), 4, 'all four');
eq(code({}, { theta: 30 }).body.includes("$X'("), true, 'the rotated state');
eq(code({}, { threeD: true, sigmaZ: 0 }).body.includes('\\tau_{\\mathrm{abs}}'), true, 'the 3D state');
// σz between σ1 and σ2: the in-plane circle is the largest, so its top is both; one label there
const between = code({}, { threeD: true, sigmaZ: 0 }).body;
eq([between.includes('$\\tau_{\\max} = \\tau_{\\mathrm{abs}} = 65$'), (between.match(/\\tau_\{\\m/g) ?? []).length], [true, 2], 'σz between: one label for both');
const outside = code({}, { threeD: true, sigmaZ: 100 }).body;
eq([outside.includes('$\\tau_{\\max} = 65$'), outside.includes('$\\tau_{\\mathrm{abs}} = 72.5$')], [true, true], 'σz outside: a label each');
eq((code({}, { threeD: true, sigmaZ: 0 }).body.match(/\\draw\[line width=[^\]]*\] \([^)]*\) circle/g) ?? []).length, 3, 'three circles');
// siunitx: the element's stresses as \qty, the axis's unit as \unit; a drawing from before the switch as it was
const si = code({ siUnits: true });
eq(si.packages, ['tikz', 'siunitx'], 'siunitx loaded');
eq([si.body.includes('{\\qty{80}{\\mega\\pascal}}'), si.body.includes('{(\\unit{\\mega\\pascal})}')], [true, true], 'stresses and the unit');
eq(down.body.includes('{$80$\\,MPa}') && down.body.includes('{(MPa)}'), true, 'off: as typed');
eq(code({ siUnits: true }, { unit: 'ksi' }).body.includes('\\qty{80}{ksi}'), true, 'an unknown unit literally');
// a pure hydrostatic state: a point, nothing to divide by zero
eq(/NaN|Infinity/.test(code({}, { sigmaX: 10, sigmaY: 10, tauXY: 0, elements: 'all' }).body), false, 'a point circle');

// labels clear of the circle, the axes, the diameter, the dots and each other: small shear (Y was over σ2 and the
// diameter struck 2θp), pure shear (Y over τmax on the τ axis, C crossed by it), the default (C crossed by the diameter)
for (const [what, v] of [
  ['small shear', { sigmaX: 80, sigmaY: -40, tauXY: 5 }],
  ['pure shear', { sigmaX: 0, sigmaY: 0, tauXY: 50 }],
  ['the default', {}],
  ['rotated', { theta: 30 }],
  ['3D', { threeD: true, sigmaZ: 100 }],
  ['τ up', { sigmaX: -20, sigmaY: 60, tauXY: -30 }]
] as [string, object][]) {
  for (const mohrShear of ['down', 'up']) {
    const { labels, shapes } = mohrDrawing({ ...MOHR.values, ...v }, { mohrShear });
    eq(clashes(labels.map((label) => ({ label, shift: { x: 0, y: 0 } })), shapes), [], `${what}, τ ${mohrShear}: no label touches`);
  }
}
// a % in the unit is written \%
eq(code({}, { unit: '%' }).body.includes('{$80$\\,\\%}'), true, 'a % unit escaped');

// σz is asked for only with the three-dimensional state, as its switch says
const shownKeys = (v: Record<string, unknown>) => MOHR.fields.filter((f) => f.shown?.(v as never) ?? true).map((f) => f.key);
eq([shownKeys(MOHR.values).includes('sigmaZ'), shownKeys({ ...MOHR.values, threeD: true }).includes('sigmaZ')], [false, true], 'σz with the 3D switch only');

// the points' names (2.6): as before unless changed, which makes the drawing file version 5 (a 2.4 build would lose them)
{
  const named = code({}, { xName: 'A', yName: 'B', cName: 'O' }).body;
  eq([named.includes('$A(80, 25)$'), named.includes('$B(-40, -25)$'), named.includes('$O = 20$'), /\$[XY]\(/.test(named)], [true, true, true, false], 'X, Y and C renamed');
  const rotated = code({}, { theta: 30, xName: 'A', yName: '' }).body;
  eq([rotated.includes("$A'("), /\$-?[0-9.]+, -?[0-9.]+\)\$|\$B|\$Y/.test(rotated)], [true, false], 'the rotated point takes the prime; an empty name, no label');
  eq([formNeedsVersion5(newFormModel('mohr')), formNeedsVersion5({ preset: 'mohr', values: { ...MOHR.values, cName: 'O' } }), formNeedsVersion5({ preset: 'mohr', values: { sigmaX: 1 } })], [false, true, false], 'version 5 only with a name of its own');
}

console.log('mohr.check: ok');
