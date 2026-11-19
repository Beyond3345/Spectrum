// Self-check for the fluid mechanics presets (gate, manometer, accelerating tank, floating body): their numbers against
// the worked examples in ENGG 2002SEF's lectures, tutorials and past papers, the drawings' labels clear of each other
// and of what's drawn, and the file version. Run:
// npx esbuild apps/frontend/src/diagram/modes/form/fluids.check.ts --bundle --platform=node --log-level=warning | node
import { diagramFileText, readDiagramFile } from '../../fileFormat';
import { clashes } from '../structures/labels';
import { floating, floatingDrawing, FLOATING } from './floating';
import { gate, gateDrawing, GATE } from './gate';
import { manometerDrawing, MANOMETER, pressureWalk } from './manometer';
import { formCode, newFormModel } from './presets';
import { tank, tankDrawing, TANK } from './tank';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
/** within a relative tolerance: the course's answers are rounded, to 3 or 4 figures */
const close = (actual: number, expected: number, what: string, tolerance = 1e-9) => {
  if (!(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)))) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};
const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

// ─── Gate ───
const water = 1000;
const vertical = { shape: 'rectangle', width: 1, angle: 90, rho: water, hinge: 'top' } as const;
{
  // Tutorial 3, Q21(a): 3 m gate hinged at its top edge 2 m under water, ridge at B: F_R = 103,005 N, y_p = 3.71 m,
  // F_B = 58.71 kN (the course takes y_p as 3.71 before its moment; unrounded, 58.86 kN)
  const r = gate({ ...vertical, length: 3, top: 2 });
  close(r.F1, 103005, 'Q21a F_R', 1e-6);
  eq(round(r.yp1, 2), 3.71, 'Q21a y_p');
  close((r.F1 * (round(r.yp1, 2) - 2)) / 3, 58712.85, 'Q21a F_B, with the course’s rounding', 1e-6);
  close(r.stop!, (103005 * (1.5 + 0.75 / 3.5)) / 3, 'Q21a F_B', 1e-9);
  close(r.hinge!, r.F1 - r.stop!, 'Q21a hinge');
  // Q21(b): water 2 m deep, 1 m below the hinge: F_R = 19,620 N, y_p = 1.33 m, F_B = 15.24 kN (with y_p 1.33)
  const b = gate({ ...vertical, length: 3, top: -1 });
  close(b.F1, 19620, 'Q21b F_R', 1e-6);
  eq(round(b.yp1, 2), 1.33, 'Q21b y_p');
  close((b.F1 * (1 + round(b.yp1, 2))) / 3, 15238.2, 'Q21b F_B, with the course’s rounding', 1e-6);
  // Q18: 5 m plate hinged 1 m above the water, 4 m deep: F_R = 78,480 N, y_p = 2.67 m, F_ridge = 57.60 kN (with 2.67)
  const q18 = gate({ ...vertical, length: 5, top: -1 });
  close(q18.F1, 78480, 'Q18 F_R', 1e-6);
  eq(round(q18.yp1, 2), 2.67, 'Q18 y_p');
  close(round((q18.F1 * (1 + round(q18.yp1, 2))) / 5 / 1000, 2), 57.6, 'Q18 F_ridge, with the course’s rounding', 1e-3);
  // Lecture 5 Example 2: a car door 1.2 m high, 1 m wide, its top 8 m down: F_R = 101.3 kN, y_p = 8.61 m
  const door = gate({ ...vertical, hinge: 'none', length: 1.2, top: 8 });
  eq([round(door.F1 / 1000, 1), round(door.yp1, 2), door.stop], [101.2, 8.61, null], 'Example 2 door (the course rounds P_avg to 84.4 kPa first: 101.3)');
  close((84.4 * 1.2), 101.28, 'Example 2 with the course’s P_avg', 1e-9);
  // Lecture 5 Example 3 (Final 2025, Fig 2.1): sluice gate hinged 1.5 m above 3.5 m of fresh water, 2.5 m of seawater
  // (RD 1.035) on the other side: 60.08 kN at y_p 2.33 m, 31.73 kN at y_p 1.67 m
  const sluice = gate({ ...vertical, length: 5, top: -1.5, other: { rho: 1035, depth: 2.5 } });
  eq([round(sluice.F1 / 1000, 2), round(sluice.yp1, 2), round(sluice.F2 / 1000, 2), round(sluice.yp2, 2)], [60.09, 2.33, 31.73, 1.67], 'Example 3 sluice (the course truncates 60.086 to 60.08)');
  close(sluice.stop!, (sluice.F1 * (1.5 + sluice.yp1) - sluice.F2 * (5 - 2.5 + sluice.yp2)) / 5, 'Example 3 moment about A');
  // Tutorial 3, Q19: water on one side (top 1.6 m down), oil RD 0.88 on the other (top 0.6 m down), 2 m × 1.5 m: net 35.08 kN
  const q19 = gate({ ...vertical, width: 1.5, hinge: 'none', length: 2, top: 1.6, other: { rho: 880, depth: 2.6 } });
  // (the course rounds the oil's average pressure to 13,812 Pa first: unrounded, 41,437 N)
  close(q19.F1, 76518, 'Q19 water', 1e-6);
  close(q19.F2, 41436, 'Q19 oil', 1e-4);
  close(q19.net, 35082, 'Q19 net', 1e-4);
  // Tutorial 3, Q3: the end of a 2 m cylinder full of water: 30.82 kN; Q1: a 3 m gate with water at its top, y_p 2 m
  close(round(gate({ ...vertical, shape: 'circle', hinge: 'none', length: 2, top: 0 }).F1 / 1000, 2), 30.82, 'Q3 circle');
  close(gate({ ...vertical, width: 2.5, hinge: 'none', length: 3, top: 0 }).yp1, 2, 'Q1 centre of pressure', 1e-12);
  // a circle under the surface: F = ρg·h_c·A and y_p = y_c + R²/(4y_c), exactly
  const circle = gate({ ...vertical, shape: 'circle', hinge: 'none', length: 2, top: 3 });
  close(circle.F1, water * 9.81 * 4 * Math.PI, 'circle F', 1e-9);
  close(circle.yp1, 4 + 1 / 16, 'circle y_p', 1e-9);
  // a sloping plate (Lecture 5 Example 1): F_R = ρg(s + b/2) sin θ · ab, y_p = s + b/2 + b²/(12(s + b/2))
  const slope = gate({ ...vertical, hinge: 'none', angle: 30, length: 2, width: 1.5, top: 1 * Math.sin(Math.PI / 6) });
  close(slope.F1, water * 9.81 * (1 + 1) * 0.5 * 3, 'Example 1 F_R', 1e-9);
  close(slope.yp1, 2 + 4 / 24, 'Example 1 y_p', 1e-9);
}

// ─── Manometer: P_end − P_start, Pa ───
{
  const g = 9.81;
  // Lecture 4 Example 7: B (oil 0.8) down 13 cm, mercury down 8 cm, oil 0.7 up 31 cm to A: P_A − P_B = 9564.75 Pa
  close(pressureWalk([{ rho: 800, h: 0.13, down: true }, { rho: 13600, h: 0.08, down: true }, { rho: 700, h: 0.31, down: false }], g), 9564.75, 'Example 7', 1e-6);
  // Example 8: M up 9.5 cm of water, oil 0.83 down 3.5 cm, water down 18 cm to N: 1118.83 Pa (its terms, 284.98 +
  // 1765.80 − 931.95; the slide prints their sum as 1119.13)
  close(pressureWalk([{ rho: 1000, h: 0.095, down: false }, { rho: 830, h: 0.035, down: true }, { rho: 1000, h: 0.18, down: true }], g), 284.98 + 1765.8 - 931.95, 'Example 8', 1e-5);
  // Example 5: from the air–water surface, water 0.1 m and oil 0.2 m down, mercury 0.35 m up to the open end at 85.6 kPa: 130 kPa
  close(round(85.6 - pressureWalk([{ rho: 1000, h: 0.1, down: true }, { rho: 850, h: 0.2, down: true }, { rho: 13600, h: 0.35, down: false }], g) / 1000, 0), 130, 'Example 5');
  // Example 6: open, oil 0.9 down 70 cm, water 30 cm down, glycerin 1.26 up 70 cm to A: 0.471 kPa
  close(round(pressureWalk([{ rho: 900, h: 0.7, down: true }, { rho: 1000, h: 0.3, down: true }, { rho: 1260, h: 0.7, down: false }], g) / 1000, 3), 0.471, 'Example 6');
  // Example 4: a gas tank, a fluid of SG 0.85 standing 55 mm up the open side, 96 kPa outside: 96.5 kPa
  close(round(96 - pressureWalk([{ rho: 0, h: 0.02, down: true }, { rho: 850, h: 0.055, down: false }], g) / 1000, 1), 96.5, 'Example 4');
  // the drawing writes the same, and turns: a U filled with mercury, an inverted U with the oil
  const ex7 = manometerDrawing(MANOMETER.values, {}).code.body;
  eq(ex7.includes('$P_{A} - P_{B} = $ $9565$\\,Pa'), true, 'Example 7 drawn');
  eq((ex7.match(/arc\[start angle=180, end angle=360/g) ?? []).length, 3, 'one U: its outline twice and the mercury');
  eq(/black!55, line join=round\] \([^)]*\) -- \([^)]*\) arc/.test(ex7), true, 'the U is mercury');
  const ex8 = manometerDrawing({ ...MANOMETER.values, startName: '$M$', fluid1: 'water', fluid1RD: 0, h1: 9.5, dir1: 'up', fluid2: 'oil', fluid2RD: 0.83, h2: 3.5, dir2: 'down', fluid3: 'water', fluid3RD: 0, h3: 18, dir3: 'down', endName: '$N$' }, {}).code.body;
  eq([ex8.includes('end angle=0'), /orange!70, line join=round\] \([^)]*\) -- \([^)]*\) arc/.test(ex8), ex8.includes('$P_{N} - P_{M} = $ $1119$\\,Pa')], [true, true, true], 'Example 8: an inverted U of oil');
  const ex5 = manometerDrawing({ ...MANOMETER.values, unit: 'm', startName: '$1$', fluid1: 'water', fluid1RD: 0, h1: 0.1, dir1: 'down', fluid2: 'oil', fluid2RD: 0, h2: 0.2, dir2: 'down', fluid3: 'mercury', fluid3RD: 0, h3: 0.35, dir3: 'up', endEnd: 'open', patm: 85.6 }, {}).code.body;
  eq([ex5.includes('$P_{1} = $ $129.6$\\,kPa (absolute)'), ex5.includes('{Open}')], [true, true], 'Example 5: absolute, and the open end');
  // a column of none ends the walk there, and hides the ones after it
  const shown = (v: Record<string, unknown>) => MANOMETER.fields.filter((f) => f.shown?.(v as never) ?? true).map((f) => f.key);
  eq(shown({ ...MANOMETER.values, fluid2: 'none' }).filter((k) => /[34]$/.test(k)), [], 'columns after a none hidden');
  eq(shown(MANOMETER.values).includes('fluid4') && !shown(MANOMETER.values).includes('h4'), true, 'the fourth offered, its height not');
}

// ─── Accelerating tank ───
{
  // Lecture 5 Example 7 (Final 2025, Fig 4.1): 5 m tank, 2 m high, 1 m of water, 3 m/s² up a 40° ramp: θ = 11.08°,
  // rise 0.49 m, P_D = 17.49 kPa and P_A = 5.986 kPa (with the rise as 0.49), a_max = 7.71 m/s²
  const r = tank({ length: 5, height: 2, depth: 1, a: 3, angle: 40, rho: 1000 })!;
  eq([round(r.theta, 2), round(r.rear - 1, 2), round(1 - r.front, 2), round(r.aMax, 2), r.spills], [11.08, 0.49, 0.49, 7.71, false], 'Example 7');
  close(1000 * (9.81 + r.az) * (1 + round(r.rear - 1, 2)), 17490, 'Example 7 P_D, with the course’s rounding', 1e-3);
  close(1000 * (9.81 + r.az) * (1 - round(r.rear - 1, 2)), 5986, 'Example 7 P_A, with the course’s rounding', 1e-3);
  // Example 6: a fish tank 0.8 m high, 2 m long (or 0.6 m), 0 to 90 km/h in 10 s: 0.545 m (0.724 m) of water at most
  for (const [L, d0] of [[2, 0.8 - (2 * 2.5) / (2 * 9.81)], [0.6, 0.8 - (0.6 * 2.5) / (2 * 9.81)]]) {
    const fish = tank({ length: L, height: 0.8, depth: d0, a: 2.5, angle: 0, rho: 1000 })!;
    close(fish.aMax, 2.5, `fish tank ${L} m: spills from 2.5 m/s²`, 1e-9);
    close(fish.rear, 0.8, `fish tank ${L} m: at the rim`, 1e-9);
  }
  close(round(0.8 - (2 * 2.5) / (2 * 9.81), 3), 0.545, 'fish tank, long side');
  close(round(0.8 - (0.6 * 2.5) / (2 * 9.81), 3), 0.724, 'fish tank, short side');
  // the lecture notes' braking tank: 4 m, 1 m deep, a_x = −2: ends 0.592 m and 1.408 m, 13.8 kPa at the front
  const brake = tank({ length: 4, height: 2, depth: 1, a: -2, angle: 0, rho: 1000 })!;
  eq([round(brake.rear, 3), round(brake.front, 3), round(brake.pFront / 1000, 1)], [0.592, 1.408, 13.8], 'braking tank');
  // the front dries: a triangle keeping the volume; too much: it spills to the rim
  const dry = tank({ length: 4, height: 3, depth: 0.3, a: 6, angle: 0, rho: 1000 })!;
  close((dry.wet * dry.rear) / 2, 4 * 0.3, 'dry front keeps the volume', 1e-9);
  eq([dry.front, dry.spills], [0, false], 'dry front');
  const spill = tank({ length: 4, height: 1, depth: 0.8, a: 5, angle: 0, rho: 1000 })!;
  eq([spill.spills, spill.rear], [true, 1], 'spills to the rim');
  eq(tank({ length: 4, height: 1, depth: 0.5, a: 20, angle: -90, rho: 1000 }), null, 'falling faster than g: no surface');
  eq(/NaN|Infinity/.test(tankDrawing({ ...TANK.values, a: 0 }, {}).code.body), false, 'at rest');
}

// ─── Floating body ───
{
  // Lecture 5 Example 5: an ice cube (RD 0.92) in seawater (RD 1.025), 25 cm above the surface: 2.19 m below
  const H = 0.25 / (1 - 0.92 / 1.025);
  const ice = floating({ shape: 'box', width: H, height: H, rdBody: 0.92, rdFluid: 1.025 });
  eq([round(ice.d, 2), round(H - ice.d, 2), round(ice.fraction, 3)], [2.19, 0.25, 0.898], 'Example 5 ice');
  // Tutorial 3, Q4: 900 kg/m³ in 1100 kg/m³: 0.818 of it submerged (the answer key's 0.819 rounds up)
  close(round(floating({ shape: 'box', width: 1, height: 1, rdBody: 0.9, rdFluid: 1.1 }).fraction, 3), 0.818, 'Q4 fraction');
  // the lecture notes' GM = BM − BG with BM = I/V: a 6 m × 1.5 m box, RD 0.4 in water, G 1.2 m up: d 0.6, BM 36/7.2 = 5,
  // GM = 0.3 + 5 − 1.2 = 4.1 (worked by hand; the course has no numerical GM example)
  const barge = floating({ shape: 'box', width: 6, height: 1.5, rdBody: 0.4, rdFluid: 1, kg: 1.2 });
  eq([round(barge.d, 9), round(barge.BM, 9), round(barge.GM!, 9)], [0.6, 5, 4.1], 'barge GM');
  // an upright cylinder 0.5 m across, 2 m high, RD 0.7: BM = D²/(16d) = 0.25/22.4, GM = 0.7 + 0.01116 − 1 < 0
  const pole = floating({ shape: 'cylinder', width: 0.5, height: 2, rdBody: 0.7, rdFluid: 1 });
  close(pole.GM!, 0.7 + 0.25 / 22.4 - 1, 'cylinder GM', 1e-12);
  eq(floating({ shape: 'box', width: 1, height: 1, rdBody: 7.6, rdFluid: 1 }).floats, false, 'steel sinks');
  eq(floatingDrawing({ ...FLOATING.values, bodyRD: 7.6 }, {}).code.body.includes('It sinks'), true, 'and says so');
}

// ─── Names: the hinge and the stop, G, B and M, the user's to change ───
{
  const gateWith = (more: object) => gateDrawing({ ...GATE.values, ...more }, {}).code.body;
  const plain = gateWith({});
  eq(['{$A$}', '{$B$}', '$F_B = '].filter((t) => !plain.includes(t)), [], 'the hinge A and the stop B, as before');
  const renamed = gateWith({ hingeName: 'H', stopName: "S'" });
  eq([renamed.includes('{$H$}'), renamed.includes("{$S'$}"), renamed.includes("$F_{S'} = "), renamed.includes('$F_H = '), renamed.includes("stop S' = "), /\{\$[AB]\$\}|F_B/.test(renamed)], [true, true, true, true, true, false], 'renamed: their labels, their forces, the results and the comments');
  eq(/\{\$[AB]\$\}/.test(gateWith({ hingeName: '', stopName: '' })), false, 'an empty name hides its label');
  const float = (more: object) => floatingDrawing({ ...FLOATING.values, ...more }, {}).code.body;
  eq(['{$G$}', '{$B$}', '{$M$}', '$KB = ', '$BM = ', '$GM = '].filter((t) => !float({}).includes(t)), [], 'G, B and M, as before');
  const ship = float({ gName: 'G_1', bName: 'B_0', mName: '' });
  eq([ship.includes('{$G_1$}'), ship.includes('{$B_0$}'), /\{\$M\$\}/.test(ship), ship.includes('$KB_0 = '), ship.includes('$KG_1 = '), ship.includes('$G_1 = ')], [true, true, false, true, true, true], 'renamed, M hidden; the results use the names');
}

// ─── Drawings: labels clear of each other and of what's drawn, in the course's cases ───
for (const [what, drawing] of [
  ['gate Q21a', gateDrawing(GATE.values, {})],
  ['gate Q18', gateDrawing({ ...GATE.values, length: 5, top: -1 }, {})],
  ['gate, exam look', gateDrawing({ ...GATE.values, look: 'exam' }, { siUnits: true })],
  ['sluice gate', gateDrawing({ ...GATE.values, length: 5, top: -1.5, other: true, depth2: 2.5, fluid2RD: 1.035 }, {})],
  ['shallow other side', gateDrawing({ ...GATE.values, other: true }, { siUnits: true })],
  ['Q19, oil over the top', gateDrawing({ ...GATE.values, length: 2, width: 1.5, top: 1.6, hinge: 'none', other: true, fluid2: 'oil', fluid2RD: 0.88, depth2: 2.6 }, {})],
  ['sloping gate', gateDrawing({ ...GATE.values, angle: 50, top: 1.5 }, {})],
  ['manometer Example 7', manometerDrawing(MANOMETER.values, {})],
  ['manometer Example 8', manometerDrawing({ ...MANOMETER.values, startName: '$M$', fluid1: 'water', fluid1RD: 0, h1: 9.5, dir1: 'up', fluid2: 'oil', fluid2RD: 0.83, h2: 3.5, dir2: 'down', fluid3: 'water', fluid3RD: 0, h3: 18, dir3: 'down', endName: '$N$' }, {})],
  ['tank Example 7', tankDrawing(TANK.values, {})],
  ['braking tank', tankDrawing({ ...TANK.values, length: 4, a: -2, angle: 0 }, {})],
  ['ice', floatingDrawing(FLOATING.values, {})],
  ['upright cylinder', floatingDrawing({ ...FLOATING.values, shape: 'cylinder', width: 0.5, height: 2, bodyRD: 0.7, fluid: 'water' }, {})]
] as const) {
  eq(clashes(drawing.labels.map((label) => ({ label, shift: { x: 0, y: 0 } })), drawing.shapes), [], `${what}: no label touches`);
}

// ─── Style and file: siunitx as the switch says; a new preset's drawing is version 5, so 2.4 opens it as code ───
eq(gateDrawing(GATE.values, { siUnits: true }).code.body.includes('$F_R = \\qty{103}{\\kilo\\newton}$'), true, 'siunitx on');
eq(gateDrawing(GATE.values, {}).code.body.includes('$F_R = 103$\\,kN'), true, 'siunitx off');
eq(gateDrawing({ ...GATE.values, look: 'exam' }, {}).code.libraries.includes('patterns'), false, 'water’s dashes need no patterns');
eq(manometerDrawing({ ...MANOMETER.values, look: 'exam' }, {}).code.libraries, ['arrows.meta', 'babel'], 'tubes are greys');
eq(floatingDrawing({ ...FLOATING.values, fluid: 'mercury', bodyRD: 7.6, look: 'exam' }, {}).code.libraries.includes('patterns'), true, 'mercury hatched');
eq(gateDrawing({ ...GATE.values, fluid: 'oil', look: 'exam' }, {}).code.body.includes('pattern=dots'), true, 'oil dotted');
eq(formCode({ preset: 'manometer', values: { ...MANOMETER.values, endName: '50% $A$' } }, {}).body.includes('50\\% $A$'), true, 'a % in a name escaped');
// a gate clear of the fluid names no fluid and writes no NaN; a second fluid with no depth is none
const clear = gateDrawing({ ...GATE.values, top: -5 }, {}).code.body;
eq([/NaN|Infinity/.test(clear), clear.includes('Water, RD'), clear.includes('% The gate is clear of the fluid')], [false, false, true], 'a gate clear of the fluid');
eq(gateDrawing({ ...GATE.values, other: true, depth2: 0 }, {}).code.body, gateDrawing(GATE.values, {}).code.body, 'no depth on the other side: as without it');
eq(/NaN|Infinity/.test(tankDrawing({ ...TANK.values, depth: 0 }, {}).code.body + tankDrawing({ ...TANK.values, angle: 90 }, {}).code.body), false, 'an empty tank and a lift: no Infinity in the comments');
(async () => {
  for (const id of ['gate', 'manometer', 'tank', 'floating']) {
    const model = newFormModel(id);
    const text = await diagramFileText({ language: 'tikz', pkg: 'form', style: { siUnits: true }, model, version: 1 }, formCode(model, { siUnits: true }));
    eq((await readDiagramFile(text)).diagram?.version, 5, `${id}: version 5`);
  }
  for (const id of ['mohr', 'venn']) {
    const model = newFormModel(id);
    const text = await diagramFileText({ language: 'tikz', pkg: 'form', style: {}, model, version: 1 }, formCode(model, {}));
    eq((await readDiagramFile(text)).diagram?.version, 1, `${id}: still version 1`);
  }
  console.log('fluids.check: ok');
})();
