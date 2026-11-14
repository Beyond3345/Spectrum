// Self-check for the circuit mode's export, snapping and junctions. Run:
// npx esbuild apps/frontend/src/diagram/modes/circuitikz/circuitikz.check.ts --bundle --platform=node --log-level=warning | node
import { symbolGeometry, symbolRequest } from './symbolGeometry';
import { circuitCode, readStyle, symbolOptions } from './code';
import { attach, detach, moveBy, newPathPart, paste, remove, rotate } from './edit';
import { pinLabelSpots, plusAtStart, sideName } from './labels';
import { CATALOGUE, PARTS, PT_PER_GRID, circuitBounds, findJunctions, locator, pathFrame, placeNodeOffset, placeholderShape, snapDelta, wirePath } from './model';
import type { CircuitModel, Shape } from './model';
import { astable, astable555, bridgeRectifier, centreTapRectifier, commonEmitterStage, conversionRatio, converter, differenceAmplifier, differenceGain, differentiator, feedbackLoop, figure, halfWaveRectifier, hybridPi, integrator, invertingAmplifier, invertingGain, massSpringDamper, monostable, monostable555, nonInvertingAmplifier, nonInvertingGain, rcLadder, summingAmplifier, voltageFollower } from './templates';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const near = (actual: { x: number; y: number }, expected: { x: number; y: number }, what: string) => {
  if (Math.abs(actual.x - expected.x) > 1e-6 || Math.abs(actual.y - expected.y) > 1e-6) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ─── style ───

eq(readStyle({}), { preset: 'american' }, 'American by default');
eq(readStyle({ preset: 'european', inductors: 'european', voltageDir: 'noold', diodes: 'empty', labels: 'smart', length: 1.4 }), { preset: 'european' }, 'defaults are dropped');
eq(readStyle({ inductors: 'cute', voltageDir: 'RP', siunitx: true, diodes: 'full', labels: 'straight', length: 1.2 }), { preset: 'american', inductors: 'cute', voltageDir: 'RP', siunitx: true, diodes: 'full', labels: 'straight', length: 1.2 }, 'overrides kept');
eq(readStyle({ preset: 'british', length: 99, voltageDir: 'up' }), { preset: 'american' }, 'nonsense dropped');
eq(symbolOptions(readStyle({ inductors: 'cute', voltageDir: 'RP', diodes: 'full', length: 1.2 })), 'american, cute inductors, circuitikz/diode=full, circuitikz/bipoles/length=1.2cm', 'only what changes the symbols goes to the generator');

// ─── export ───

const circuit: CircuitModel = {
  elements: [
    { id: 'e1', kind: 'node', type: 'op-amp', at: { x: 8, y: 4 }, rotate: 90, flipX: true, name: 'U1', options: ['noinv input up'] },
    { id: 'e2', kind: 'path', type: 'resistor', a: { x: 0, y: 0 }, b: { x: 8, y: 0 }, label: { text: 'R_1' }, value: '4.7<\\kilo\\ohm>', voltage: { text: 'v_1', side: '_', dir: '<' }, current: { text: 'i', dir: '>' }, poles: ['*', 'o'], mirror: true, invert: true, size: 1.5, name: 'Rin' },
    { id: 'e3', kind: 'path', type: 'capacitor', a: { part: 'e1', pin: 'out' }, b: { x: 14, y: 4 }, label: { text: '$C$ here', side: '_' } },
    { id: 'e4', kind: 'path', type: 'potentiometer', a: { x: 0, y: 8 }, b: { x: 8, y: 8 } },
    { id: 'e5', kind: 'wire', points: [{ part: 'e2', pin: 'b' }, { x: 8, y: 2 }, { part: 'e1', pin: '-' }], routes: ['--', '-|'] },
    { id: 'e6', kind: 'wire', points: [{ part: 'e4', pin: 'wiper' }, { part: 'e3', pin: 'a' }], routes: ['|-'] },
    { id: 'e7', kind: 'node', type: 'ground', at: { x: 0, y: -2 } },
    { id: 'e8', kind: 'wire', points: [{ x: 0, y: 0 }, { part: 'e7', pin: 'center' }], routes: ['--'] }
  ],
  junctions: [{ x: 8, y: 0 }, { part: 'e1', pin: 'out' }]
};
eq(
  circuitCode(circuit, { voltageDir: 'RP', siunitx: true, labels: 'straight', length: 1.2 }).body.split('\n'),
  [
    '\\begin{circuitikz}[american, american inductors, american resistors, american voltages, voltage dir=RP]',
    '\\ctikzset{label/align=straight, diode=empty, bipoles/length=1.2cm}',
    '\\node[op amp, noinv input up, rotate=90, xscale=-1] (U1) at (2,1) {};',
    '\\node[ground] (e7) at (0,-0.5) {};',
    '\\draw (0,0) to[R, mirror, invert, *-o, bipoles/length=1.8cm, name=Rin, l={$R_1$}, a={\\SI{4.7}{\\kilo\\ohm}}, v_<={$v_1$}, i>={$i$}] (2,0);',
    '\\draw (U1.out) to[C, l_={$C$ here}] (3.5,1);',
    '\\draw (0,2) to[pR, name=e4] (2,2);',
    '\\draw (2,0) -- (2,0.5) -| (U1.-);',
    '\\draw (e4.wiper) |- (U1.out);',
    '\\draw (0,0) -- (e7.center);',
    '\\node[circ] at (2,0) {};',
    '\\node[circ] at (U1.out) {};',
    '\\end{circuitikz}'
  ],
  'one line per element, nodes first, options in circuitikz order'
);
eq(circuitCode(circuit, { voltageDir: 'RP', siunitx: true }).packages, ['circuitikz', 'siunitx'], 'siunitx when a value used it');
eq(circuitCode(circuit, {}).packages, ['circuitikz'], 'no siunitx when it is off');
eq(circuitCode(circuit, {}).body.includes('a={$4.7<\\kilo\\ohm>$}'), true, 'a value is maths when siunitx is off');
eq(circuitCode({ elements: [], junctions: [] }, { preset: 'european' }).body, '\\begin{circuitikz}[european, european inductors, european resistors, european voltages, voltage dir=noold]\n\\ctikzset{label/align=smart, diode=empty, bipoles/length=1.4cm}\n\\end{circuitikz}', 'an empty circuit: every style key written, defaults too');

// siunitx (Write units with siunitx): a value that reads as a number and a unit as \qty, the rest as maths
{
  const on = circuitCode(circuit, { siUnits: true });
  eq(on.body.includes('a={\\qty{4.7}{\\kilo\\ohm}}'), true, 'circuitikz’s own <…> as \\qty');
  eq(on.packages, ['circuitikz', 'siunitx'], 'siunitx loaded');
  const typed: CircuitModel = { elements: [{ id: 'c', kind: 'path', type: 'capacitor', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, value: '4.7 µF', voltage: { text: '5 V' }, current: { text: 'i_1' } }], junctions: [] };
  const line = circuitCode(typed, { siUnits: true }).body.split('\n')[2];
  eq(line, '\\draw (0,0) to[C, a={\\qty{4.7}{\\micro\\farad}}, v={\\qty{5}{\\volt}}, i={$i_1$}] (1,0);', 'values, voltages and currents');
  eq(circuitCode(typed, {}).packages, ['circuitikz'], 'off: no siunitx');
  eq(readStyle({ siUnits: true, siunitx: true }), { preset: 'american', siunitx: true, siUnits: true }, 'both kept: siUnits wins');
}

// logic gates: only when chosen, after the preset; the NOT symbol only for European gates
eq(readStyle({ preset: 'european', logic: 'european', notSymbol: 'circle' }), { preset: 'european', notSymbol: 'circle' }, 'the preset’s own gates dropped');
eq(readStyle({ logic: 'british' }), { preset: 'american' }, 'unknown gates dropped');
eq(circuitCode({ elements: [], junctions: [] }, { preset: 'european', logic: 'ieee' }).body.split('\n')[0], '\\begin{circuitikz}[european, european inductors, european resistors, european voltages, voltage dir=noold, ieee ports]', 'IEEE gates');
eq(circuitCode({ elements: [], junctions: [] }, { logic: 'european', notSymbol: 'circle' }).body.split('\n').slice(0, 2), ['\\begin{circuitikz}[american, american inductors, american resistors, american voltages, voltage dir=noold, european ports]', '\\ctikzset{tripoles/european not symbol=circle, label/align=smart, diode=empty, bipoles/length=1.4cm}'], 'European gates in an American drawing, circled');
eq(circuitCode({ elements: [], junctions: [] }, { logic: 'ieee', notSymbol: 'circle' }).body.includes('not symbol'), false, 'no NOT symbol for IEEE gates');
eq(symbolOptions(readStyle({ preset: 'european', notSymbol: 'circle' })), 'european, circuitikz/tripoles/european not symbol=circle', 'the canvas draws the chosen gates');
eq(symbolOptions(readStyle({ logic: 'ieee' })), 'american, ieee ports', 'and IEEE ones');
// what apps/backend/test/diagram.test.js draws, all of it valid on the generator's circuitikz picture
eq(symbolOptions(readStyle({ preset: 'european', notSymbol: 'circle', diodes: 'full', length: 1.2 })), 'european, circuitikz/tripoles/european not symbol=circle, circuitikz/diode=full, circuitikz/bipoles/length=1.2cm', 'the picture’s options');

// resistor and voltage styles: kept only when they differ from the preset, written as picture keys
eq(readStyle({ preset: 'european', resistors: 'european', voltages: 'raised' }), { preset: 'european', voltages: 'raised' }, 'the preset’s own resistors are dropped');
eq(readStyle({ resistors: 'british', voltages: 'curly' }), { preset: 'american' }, 'unknown resistor and voltage styles dropped');
eq(circuitCode({ elements: [], junctions: [] }, { preset: 'american', resistors: 'european', voltages: 'straight', inductors: 'cute' }).body.split('\n')[0], '\\begin{circuitikz}[american, cute inductors, european resistors, straight voltages, voltage dir=noold]', 'overrides after the preset');
eq(symbolOptions(readStyle({ resistors: 'european', voltages: 'raised' })), 'american, european resistors', 'resistors change the symbols, voltages don’t');

// text inside a part, flow arrows, Text on its own, and arrowheads on wires
const blocks: CircuitModel = {
  elements: [
    { id: 'g', kind: 'path', type: 'block', a: { x: 0, y: 0 }, b: { x: 8, y: 0 }, text: '$G(s)$', flow: { text: 'P', side: '_', dir: '<' } },
    { id: 'f', kind: 'path', type: 'lowpass', a: { x: 8, y: 0 }, b: { x: 16, y: 0 }, text: 'ignored' },
    { id: 'u', kind: 'node', type: 'chip-8', at: { x: 0, y: 12 }, name: 'U1', text: '555' },
    { id: 't', kind: 'node', type: 'text', at: { x: 4, y: -4 }, text: '$A_v = -10$' },
    { id: 'r', kind: 'node', type: 'text', at: { x: 4, y: -8 }, rotate: 90, text: 'up' },
    { id: 's', kind: 'node', type: 'adder', at: { x: 20, y: 0 }, text: 'no' },
    { id: 'w1', kind: 'wire', points: [{ x: 16, y: 0 }, { part: 's', pin: 'west' }], routes: ['--'], arrows: '->' },
    { id: 'w2', kind: 'wire', points: [{ part: 'u', pin: 'pin 3' }, { x: -8, y: 0 }], routes: ['-|'], arrows: '<->' }
  ],
  junctions: []
};
eq(circuitCode(blocks, {}).body.split('\n').slice(2), [
  '\\node[dipchip, num pins=8] (U1) at (0,3) {555};',
  '\\node at (1,-1) {$A_v = -10$};',
  '\\node[rotate=90] at (1,-2) {up};',
  '\\node[adder] (s) at (5,0) {};',
  '\\draw (0,0) to[twoport, t={$G(s)$}, f_<={$P$}] (2,0);',
  '\\draw (2,0) to[lowpass] (4,0);',
  '\\draw[-latex] (4,0) -- (s.west);',
  '\\draw[latex-latex] (U1.pin 3) -| (-2,0);',
  '\\end{circuitikz}'
], 'text only where a part takes it, Text as a plain node, arrowheads from the core arrows');

// every catalogue part writes a key TeX knows, or is Text; a part's pins are its own
for (const part of CATALOGUE) {
  eq(part.tikz ? !/[{}\\;]/.test(part.tikz) : part.id === 'text', true, `${part.id}: a plain circuitikz key or pic`);
  eq(new Set(part.pins ?? []).size, (part.pins ?? []).length, `${part.id}: its pins are named once`);
}

const repeatedNames: CircuitModel = {
  elements: [
    { id: 'u1', kind: 'node', type: 'op-amp', name: 'U1', at: { x: 0, y: 0 } },
    { id: 'u2', kind: 'node', type: 'op-amp', name: 'U1', at: { x: 20, y: 0 } },
    { id: 'w', kind: 'wire', points: [{ part: 'u1', pin: 'out' }, { part: 'u2', pin: '+' }], routes: ['--'] }
  ], junctions: []
};
eq(circuitCode(repeatedNames, {}).body.includes('\\draw (U1.out) -- (U1_2.+);'), true, 'repeated names keep each wire on its own part');

// ─── geometry ───

// measured from circuitikz: op amp's - input at (-33.85857pt, 13.94173pt); with rotate=90, xscale=-1 it lands at (-13.94173pt, 33.85857pt)
const minus = { x: -33.85857 / PT_PER_GRID, y: 13.94173 / PT_PER_GRID };
near(placeNodeOffset({ rotate: 90, flipX: true }, minus), { x: -13.94173 / PT_PER_GRID, y: 33.85857 / PT_PER_GRID }, 'flip first, then rotate, as TikZ does');
near(placeNodeOffset({ rotate: 90, flipX: false }, { x: 1, y: 0 }), { x: 0, y: 1 }, 'a quarter turn anticlockwise');

const shapes: Record<string, Shape> = {
  'op-amp': { pins: { '-': { x: -4, y: 2 }, '+': { x: -4, y: -2 }, out: { x: 4, y: 0 } } },
  potentiometer: { length: 4, pins: { wiper: { x: 0, y: 2 } } },
  ground: { pins: { center: { x: 0, y: 0 } } }
};
const shapeOf = (type: string) => shapes[type] || placeholderShape(type);
const { pos } = locator(circuit, shapeOf);
// out at (4,0): flipped to (-4,0), then a quarter turn to (0,-4)
near(pos({ part: 'e1', pin: 'out' }), { x: 8, y: 0 }, 'node pin flipped and turned with the node');
near(pos({ part: 'e3', pin: 'a' }), { x: 8, y: 0 }, 'a path part end on a node pin follows it');
near(pos({ part: 'e4', pin: 'wiper' }), { x: 4, y: 10 }, 'an extra pin of a path part');
const flipped: CircuitModel = { elements: [{ id: 'p', kind: 'path', type: 'potentiometer', a: { x: 0, y: 0 }, b: { x: 0, y: 8 }, mirror: true, size: 2 }], junctions: [] };
near(locator(flipped, shapeOf).pos({ part: 'p', pin: 'wiper' }), { x: 4, y: 4 }, 'mirror flips an extra pin across an upright part, size scales it');

eq(wirePath([{ x: 0, y: 0 }, { x: 4, y: 2 }, { x: 6, y: 6 }, { x: 8, y: 6 }], ['-|', '|-', '-|']), [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 4, y: 6 }, { x: 6, y: 6 }, { x: 8, y: 6 }], 'bends of -| and |-, none on a straight run');

// The API supplies start/end at the glyph edges, not TikZ's internal left/right anchors.
eq(symbolRequest({ type: 'resistor', options: [] }).pins, [], 'path endpoints need no extra anchor requests');
const measured = symbolGeometry({ width: 50, origin: { x: 25, y: 2 }, pins: [{ name: 'start', x: -20, y: 0 }, { name: 'end', x: 20, y: 0 }, { name: 'wiper', x: 0, y: 7 }] }, 'potentiometer');
near(measured.middle, { x: 0, y: 0 }, 'glyph centred between its actual endpoints');
eq(measured.shape.length, 40 / PT_PER_GRID, 'actual glyph length, instead of the stand-in');
near(measured.shape.pins.wiper, { x: 0, y: 7 / PT_PER_GRID }, 'extra pin measured from the glyph centre');
const missingPin = symbolGeometry({ width: 10, origin: { x: 5, y: 5 }, pins: [{ name: 'out', x: 7, y: 0 }] }, 'op-amp');
near(missingPin.shape.pins.out, { x: 7 / PT_PER_GRID, y: 0 }, 'reported pin keeps its measured geometry');
eq(!!missingPin.shape.pins['+'], true, 'a missing reported pin stays reachable until its symbol can be measured');

eq(circuitBounds({ elements: [], junctions: [] }, shapeOf), null, 'an empty overview has no drawing bounds');
eq(circuitBounds({ elements: [{ id: 'w', kind: 'wire', points: [{ x: -8, y: -2 }, { x: 12, y: 4 }], routes: ['--'] }], junctions: [] }, shapeOf), { minX: -12, maxX: 16, minY: -6, maxY: 8 }, 'overview includes negative coordinates with padding');
const wide = circuitBounds({ elements: [{ id: 'u', kind: 'node', type: 'op-amp', at: { x: 0, y: 0 } }], junctions: [] }, () => ({ pins: { out: { x: 12, y: 0 } } }));
eq(wide?.maxX, 16, 'Fit includes a measured pin beyond a stand-in box');

// ─── snapping ───

near(snapDelta([{ x: 0, y: 0 }], { x: 2.3, y: -0.6 }, [], 1), { x: 2, y: -1 }, 'to the nearest grid point');
near(snapDelta([{ x: 0, y: 0 }, { x: 0.4, y: 0 }], { x: 1.5, y: 0 }, [], 1), { x: 1.6, y: 0 }, 'whichever moving pin is nearest the grid wins');
near(snapDelta([{ x: 0, y: 0 }], { x: 3.3, y: 0.2 }, [{ x: 3.45, y: 0.3 }], 1), { x: 3.45, y: 0.3 }, 'a fixed pin nearer than the grid wins');
near(snapDelta([{ x: 0, y: 0 }], { x: 3.1, y: 0 }, [{ x: 3.45, y: 0.3 }], 1), { x: 3, y: 0 }, 'the grid wins when it is nearer');
near(snapDelta([{ x: 0, y: 0 }], { x: 3.4, y: 0.4 }, [{ x: 3.45, y: 2.3 }], 1), { x: 3, y: 0 }, 'a pin outside the radius is ignored');

// ─── junctions ───

const tee: CircuitModel = {
  elements: [
    { id: 'w1', kind: 'wire', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }], routes: ['--'] },
    { id: 'w2', kind: 'wire', points: [{ x: 4, y: 0 }, { x: 4, y: 4 }], routes: ['--'] },
    { id: 'w3', kind: 'wire', points: [{ x: 8, y: 0 }, { x: 8, y: 4 }], routes: ['--'] }
  ],
  junctions: []
};
eq(findJunctions(tee, shapeOf), [{ x: 4, y: 0 }], 'a wire ending on another’s open stretch gets a dot; a plain corner of two does not');
const three: CircuitModel = {
  elements: [
    { id: 'u', kind: 'node', type: 'op-amp', at: { x: 0, y: 0 } },
    { id: 'w1', kind: 'wire', points: [{ part: 'u', pin: 'out' }, { x: 8, y: 0 }], routes: ['--'] },
    { id: 'r', kind: 'path', type: 'resistor', a: { x: 4, y: 0 }, b: { x: 4, y: 8 } },
    { id: 'w2', kind: 'wire', points: [{ x: 4, y: 8 }, { x: -8, y: 8 }, { part: 'u', pin: 'out' }], routes: ['--', '|-'] }
  ],
  junctions: []
};
eq(findJunctions(three, shapeOf), [{ part: 'u', pin: 'out' }], 'three ends at a node’s pin: the dot is kept as that pin');

// ─── edits ───

const amp: CircuitModel = {
  elements: [
    { id: 'u', kind: 'node', type: 'op-amp', at: { x: 0, y: 0 }, name: 'U1' },
    { id: 'r', kind: 'path', type: 'resistor', a: { x: 4, y: 0 }, b: { x: 12, y: 0 } },
    { id: 'w', kind: 'wire', points: [{ x: -4, y: 2 }, { x: -8, y: 2 }], routes: ['--'] }
  ],
  junctions: []
};
const held = attach(amp, new Set(['r', 'w']), shapeOf);
eq(held.elements.map((el) => (el.kind === 'path' ? el.a : el.kind === 'wire' ? el.points[0] : null)), [null, { part: 'u', pin: 'out' }, { part: 'u', pin: '-' }], 'ends that landed on pins take hold of them');
const moved = moveBy(held, new Set(['u']), { x: 0, y: 4 });
eq(locator(moved, shapeOf).pos({ part: 'r', pin: 'a' }), { x: 4, y: 4 }, 'a part’s end follows the pin it holds');
eq(moveBy(detach(held, new Set(['r']), shapeOf), new Set(['r']), { x: 1, y: 0 }).elements[1], { id: 'r', kind: 'path', type: 'resistor', a: { x: 5, y: 0 }, b: { x: 13, y: 0 } }, 'moving a part on its own lets go of the pin');
eq((remove(held, new Set(['u']), shapeOf).elements[1] as { points: unknown[] }).points[0], { x: -4, y: 2 }, 'deleting a part leaves what held it where it was');
const pasted = paste(held, held.elements.filter((el) => el.id !== 'w'), { x: 2, y: -2 });
eq(pasted.model.elements.slice(3).map((el) => (el.kind === 'node' ? el.name : el.kind === 'path' ? el.a : null)), ['U2', { part: pasted.ids[0], pin: 'out' }], 'a pasted copy gets the next name and keeps hold of its own copies');

const deletedLabel: CircuitModel = { elements: [
  { id: 'r1', kind: 'path', type: 'resistor', a: { x: 0, y: 0 }, b: { x: 8, y: 0 }, label: { text: 'R_1' } },
  { id: 'r3', kind: 'path', type: 'resistor', a: { x: 0, y: 4 }, b: { x: 8, y: 4 }, label: { text: 'R_3' } }
], junctions: [] };
eq(newPathPart(deletedLabel, 'resistor', { x: 0, y: 8 }, { x: 8, y: 8 }).label?.text, 'R_2', 'a replacement gets an unused label after a deletion');

// ─── templates ───

// the computed labels, against textbook values
eq([conversionRatio('buck', 0.5), conversionRatio('boost', 0.5), conversionRatio('buck-boost', 0.5)], [0.5, 2, -1], 'M(D) at D = 0.5');
eq([invertingGain(10e3, 100e3), nonInvertingGain(10e3, 100e3), differenceGain(10e3, 100e3)], [-10, 11, 10], 'op-amp gains');
eq([figure(astable555(1e3, 10e3, 1e-6).frequency), figure(astable555(1e3, 10e3, 1e-6).duty), figure(monostable555(100e3, 10e-6))], ['68.6', '0.524', '1.1'], '555 frequency, duty and pulse');
eq([figure(-1), figure(2 / 3), figure(1234.5)], ['-1', '0.667', '1230'], 'three significant figures');

// pins as TeX Live and Tectonic measure them (American), so the dots a template writes are where the canvas puts them
const measuredPins: Record<string, Record<string, [number, number]>> = {
  'op-amp': { '-': [-4.76, 1.96], '+': [-4.76, -1.96], out: [4.76, 0] },
  'op-amp|noinv input up': { '-': [-4.76, -1.96], '+': [-4.76, 1.96], out: [4.76, 0] },
  npn: { B: [-3.36, 0], C: [0, 3.08], E: [0, -3.08] },
  'chip-8': Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`pin ${n}`, [n <= 4 ? -6.16 : 6.16, [3.36, 1.12, -1.12, -3.36][n <= 4 ? n - 1 : 8 - n]]])),
  'jump-crossing': { west: [-0.56, 0], east: [0.56, 0], north: [0, 0.56], south: [0, -0.56] },
  adder: { west: [-1.96, 0], north: [0, 1.96], east: [1.96, 0], south: [0, -1.96] },
  ground: { center: [0, 0] },
  'supply-up': { center: [0, 0] },
  terminal: { center: [0, 0] },
  'mech-wall': { p: [0, 0] }
};
const measuredShape = (type: string, options: string[]): Shape => {
  const pins = measuredPins[options.includes('noinv input up') ? `${type}|noinv input up` : type];
  return pins ? { pins: Object.fromEntries(Object.entries(pins).map(([name, [x, y]]) => [name, { x, y }])) } : placeholderShape(type);
};
const templates: Record<string, CircuitModel> = {
  invertingAmplifier: invertingAmplifier(),
  nonInvertingAmplifier: nonInvertingAmplifier(),
  voltageFollower: voltageFollower(),
  summingAmplifier: summingAmplifier(),
  integrator: integrator(),
  differentiator: differentiator(),
  differenceAmplifier: differenceAmplifier(),
  halfWaveRectifier: halfWaveRectifier(),
  centreTapRectifier: centreTapRectifier(),
  bridgeRectifier: bridgeRectifier(),
  commonEmitterStage: commonEmitterStage(),
  hybridPi: hybridPi(),
  astable: astable(),
  monostable: monostable(),
  buck: converter('buck'),
  boost: converter('boost'),
  buckBoost: converter('buck-boost'),
  rcLadder: rcLadder(4),
  feedbackLoop: feedbackLoop(),
  massSpringDamper: massSpringDamper()
};
const spot = (p: { x: number; y: number }) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;
for (const [name, model] of Object.entries(templates)) {
  const ids = model.elements.map((el) => el.id);
  eq(new Set(ids).size, ids.length, `${name}: ids are unique`);
  for (const el of model.elements) {
    if (el.kind !== 'wire') eq(PARTS.has(el.type), true, `${name}: ${el.type} is in the catalogue`);
    const ends = el.kind === 'wire' ? el.points : el.kind === 'path' ? [el.a, el.b] : [];
    for (const end of ends) {
      if ('x' in end) continue;
      const to = model.elements.find((x) => x.id === end.part);
      eq(!!to && to.kind !== 'wire' && (to.kind === 'path' ? ['a', 'b', ...(PARTS.get(to.type)?.pins ?? [])] : PARTS.get(to.type)?.pins ?? []).includes(end.pin), true, `${name}: ${end.part}.${end.pin} is a pin`);
    }
  }
  const { pos } = locator(model, measuredShape);
  eq(model.junctions.map((j) => spot(pos(j))).sort(), findJunctions(model, measuredShape).map((j) => spot(pos(j))).sort(), `${name}: its dots are where three or more ends meet`);
  const lines = circuitCode(model, {}).body.split('\n');
  eq(lines.length, model.elements.length + model.junctions.length + 3 + lines.filter((l) => l.startsWith('\\tikzset')).length, `${name}: a line for each element and dot`);
}
eq(rcLadder(5).elements.filter((el) => el.kind === 'path' && el.type === 'capacitor').length, 5, 'an RC ladder has n stages');
eq(massSpringDamper().elements.some((el) => el.kind === 'node' && PARTS.get(el.type)?.set === 'spx-mech'), true, 'the mass, spring and damper stands on a supports wall');

// ─── transistors, pin labels, voltages, turning ───

// every MOS style circuitikz has, each with its pins and their letters
const kinds = ['nmos', 'pmos', 'nmosd', 'pmosd', 'nmos, bulk', 'pmos, bulk', 'nfet', 'pfet', 'nfetd', 'pfetd', 'nigfete', 'pigfete', 'nigfetd', 'pigfetd', 'nigfetebulk', 'pigfetebulk'];
eq(kinds.every((tikz) => CATALOGUE.some((part) => part.tikz === tikz && part.group === 'MOSFETs')), true, 'every MOS style, in its own group');
for (const part of CATALOGUE.filter((p) => p.pinLabels)) eq(Object.keys(part.pinLabels!), part.pins, `${part.id}: a letter for each pin`);
const fets: CircuitModel = { elements: [
  { id: 'm', kind: 'node', type: 'nfet', at: { x: 0, y: 0 }, name: 'M1', options: ['tr circle'] },
  { id: 'b', kind: 'node', type: 'nmos-bulk', at: { x: 12, y: 0 }, options: ['arrowmos'] },
  { id: 'q', kind: 'node', type: 'npn', at: { x: 24, y: 0 }, options: ['tr circle'] }
], junctions: [] };
eq(circuitCode(fets, {}).body.split('\n').slice(2, 5), ['\\node[nfet, tr circle] (M1) at (0,0) {};', '\\node[nmos, bulk, arrowmos] at (3,0) {};', '\\node[npn, tr circle] at (6,0) {};'], 'new parts and their options as circuitikz keys');

// Label pins: a small letter at each anchor, beyond the pin along its lead and to the gate's side, as the part turns
const labelled = (rotate: number, flipX = false) => circuitCode({ elements: [{ id: 'm', kind: 'node', type: 'nmos', at: { x: 0, y: 0 }, name: 'M1', rotate, flipX, pinLabels: true }], junctions: [] }, {}).body.split('\n').slice(3, 6);
const pinLine = (pin: string, anchor: string) => `\\node[font=\\scriptsize, anchor=${anchor}] at (M1.${pin}) {${pin}};`;
eq(labelled(0), [pinLine('G', 'south east'), pinLine('D', 'south east'), pinLine('S', 'north east')], 'G above its lead, D and S on the gate’s side, beyond the pins');
eq(labelled(90), [pinLine('G', 'north east'), pinLine('D', 'north east'), pinLine('S', 'north west')], 'a quarter turn: the gate at the bottom, D and S below their leads');
eq(labelled(180), [pinLine('G', 'north west'), pinLine('D', 'north west'), pinLine('S', 'south west')], 'half a turn');
eq(labelled(270), [pinLine('G', 'south west'), pinLine('D', 'south west'), pinLine('S', 'south east')], 'three quarters');
eq(labelled(0, true), [pinLine('G', 'south west'), pinLine('D', 'south west'), pinLine('S', 'north west')], 'flipped: the gate on the right');
eq(labelled(45)[0], pinLine('G', 'east'), 'turned 45°: straight beside the pin');
eq(pinLabelSpots({ type: 'nigfetebulk' }).map((spot) => spot.letter), ['G', 'D', 'S', 'B'], 'bulk is written B');
eq(pinLabelSpots({ type: 'resistor' }), [], 'only transistors have pin letters');
eq(circuitCode({ elements: [{ id: 'm', kind: 'node', type: 'pnp', at: { x: 0, y: 0 }, pinLabels: true }], junctions: [] }, {}).body.split('\n')[2], '\\node[pnp] (m) at (0,0) {};', 'a labelled part gets a name for its anchors');

// voltages: + and − at the ends, the name beside; flipped, and between two points
const volts: CircuitModel = { elements: [
  { id: 'r', kind: 'path', type: 'resistor', a: { x: 0, y: 0 }, b: { x: 0, y: 8 }, voltage: { text: 'v_R', dir: '<' } },
  { id: 'o', kind: 'path', type: 'voltage-between', a: { x: 8, y: 8 }, b: { x: 8, y: 0 }, voltage: { text: 'v_o' }, poles: ['o', 'o'] }
], junctions: [] };
eq(circuitCode(volts, {}).body.split('\n').slice(2, 4), ['\\draw (0,0) to[R, v<={$v_R$}] (0,2);', '\\draw (2,2) to[open, o-o, v={$v_o$}] (2,0);'], 'a voltage flipped, and one between two points');
eq([plusAtStart(undefined, undefined), plusAtStart('noold', '<'), plusAtStart('EF', '>'), plusAtStart('RP', '>'), plusAtStart('RP', '<')], [true, false, true, false, true], '+ at the start, as circuitikz puts it');
const placed = newPathPart(volts, 'voltage-between', { x: 12, y: 8 }, { x: 12, y: 0 });
eq([placed.voltage, placed.label], [{ text: 'v_1' }, undefined], 'a new voltage between two points is v_1');
eq(newPathPart({ ...volts, elements: [...volts.elements, placed] }, 'voltage-between', { x: 0, y: 0 }, { x: 0, y: 8 }).voltage, { text: 'v_2' }, 'then v_2');

// sides named as the part runs, so a turned resistor's label is left or right
eq([sideName({ x: 1, y: 0 }, 1), sideName({ x: 1, y: 0 }, -1), sideName({ x: 0, y: 1 }, 1), sideName({ x: 0, y: -1 }, 1), sideName({ x: -1, y: 0 }, 1)], ['Above', 'Below', 'Left', 'Right', 'Below'], 'circuitikz’s ^ side, as it looks');
const flat: CircuitModel = { elements: [{ id: 'r', kind: 'path', type: 'resistor', a: { x: 0, y: 0 }, b: { x: 8, y: 0 }, label: { text: 'R_1' } }], junctions: [] };
const upright = rotate(flat, new Set(['r']), 90, shapeOf).elements[0];
if (upright.kind !== 'path') throw new Error('a path part');
eq([upright.a, upright.b, sideName(pathFrame(upright.a as { x: number; y: number }, upright.b as { x: number; y: number }).u, 1)], [{ x: 4, y: -4 }, { x: 4, y: 4 }, 'Left'], 'a turned resistor runs up, its label to the left');
eq(circuitCode({ ...flat, elements: [upright] }, {}).body.split('\n')[2], '\\draw (1,-1) to[R, l={$R_1$}] (1,1);', 'and circuitikz puts l= there with label/align=smart');

// turned together: about their middle, text moving with the part and staying upright, a wire's bends turned too
const marked: CircuitModel = { elements: [
  { id: 'r', kind: 'path', type: 'resistor', a: { x: 0, y: -4 }, b: { x: 0, y: 4 } },
  { id: 't', kind: 'node', type: 'text', at: { x: 3, y: 0 }, text: '$v_o$' },
  { id: 'w', kind: 'wire', points: [{ part: 'r', pin: 'b' }, { x: 6, y: 8 }], routes: ['-|'] }
], junctions: [] };
const turned = rotate(marked, new Set(['r', 't', 'w']), 90, shapeOf).elements;
eq(turned, [
  { id: 'r', kind: 'path', type: 'resistor', a: { x: 9, y: -1 }, b: { x: 1, y: -1 } },
  { id: 't', kind: 'node', type: 'text', at: { x: 5, y: 2 }, text: '$v_o$' },
  { id: 'w', kind: 'wire', points: [{ part: 'r', pin: 'b' }, { x: -3, y: 5 }], routes: ['|-'] }
], 'turned about the middle of all three (3,2), the text still beside the part');
eq((rotate(marked, new Set(['t']), 90, shapeOf).elements[1] as { rotate?: number }).rotate, 90, 'Text on its own still turns');

// a drawing as the composer saved it before these (an old-style nmos at a measured, not grid, height) writes the same
const before = JSON.parse('{"elements":[{"id":"e1","kind":"node","type":"nmos","at":{"x":-9,"y":1.9199677777777773}},{"id":"e3","kind":"path","type":"resistor","a":{"x":-16,"y":6},"b":{"x":-16,"y":14},"label":{"text":"R_2"}},{"id":"e4","kind":"path","type":"resistor","a":{"x":-9,"y":6.000000000000001},"b":{"part":"e15","pin":"center"},"label":{"text":"R_C"}},{"id":"e10","kind":"wire","points":[{"part":"e1","pin":"S"},{"x":-9,"y":-2}],"routes":["--"]},{"id":"e13","kind":"wire","points":[{"part":"e1","pin":"D"},{"part":"e4","pin":"a"}],"routes":["--"]},{"id":"e14","kind":"node","type":"text","at":{"x":-8,"y":15},"text":"$V_{DD}$"},{"id":"e21","kind":"node","type":"text","at":{"x":25,"y":-4},"rotate":0,"text":"$v_0$"},{"id":"e15","kind":"node","type":"terminal","at":{"x":-9,"y":14}},{"id":"c","kind":"path","type":"controlled-current-source","a":{"x":4,"y":4},"b":{"x":4,"y":-4},"label":{"text":"g_mV_{gs}","side":"_"}}],"junctions":[{"part":"e15","pin":"center"}]}') as CircuitModel;
eq(circuitCode(before, { siUnits: true }).body.split('\n').slice(2), [
  '\\node[nmos] (e1) at (-2.25,0.48) {};',
  '\\node at (-2,3.75) {$V_{DD}$};',
  '\\node at (6.25,-1) {$v_0$};',
  '\\node[ocirc] (e15) at (-2.25,3.5) {};',
  '\\draw (-4,1.5) to[R, l={$R_2$}] (-4,3.5);',
  '\\draw (-2.25,1.5) to[R, l={$R_C$}] (e15.center);',
  '\\draw (1,1) to[cI, l_={$g_mV_{gs}$}] (1,-1);',
  '\\draw (e1.S) -- (-2.25,-0.5);',
  '\\draw (e1.D) -- (-2.25,1.5);',
  '\\node[circ] at (e15.center) {};',
  '\\end{circuitikz}'
], 'an earlier drawing writes what it did');

// MU Style MOSFETs: their own group, found by name or key; the shapes declared in the picture only when one is used,
// before the parts, and named anchors for wires and pin letters
const mu = CATALOGUE.filter((part) => part.group === 'MU Style');
eq(mu.map((part) => part.tikz), ['munmos', 'mupmos', 'nmos, arrowmos', 'pmos, arrowmos, nocircle', 'munmosb', 'mupmosb', 'munmosdb', 'mupmosdb', 'muidealdiode', 'murectisource', 'mutildesource', 'musinesource'], 'the MU Style parts');
for (const word of ['mu', 'mosfet', 'nmos', 'pmos', 'enhancement', 'depletion', 'bulk', 'ideal diode', 'current source', 'ac voltage source', 'sine']) eq(mu.some((part) => `${part.label} ${part.tikz}`.toLowerCase().includes(word)), true, `MU Style found by ${word}`);
const muCircuit: CircuitModel = { elements: [
  { id: 'n', kind: 'node', type: 'mu-nmos', at: { x: 0, y: 0 }, name: 'M1', rotate: 90, flipX: true, pinLabels: true },
  { id: 'p', kind: 'node', type: 'mu-pmos', at: { x: 12, y: 0 } },
  { id: 'r', kind: 'path', type: 'resistor', a: { part: 'n', pin: 'D' }, b: { part: 'p', pin: 'S' } }
], junctions: [] };
const muLines = circuitCode(muCircuit, {}).body.split('\n');
eq([muLines[2], muLines[muLines.length - 8]], ['\\makeatletter', '\\makeatother'], 'the shapes declared at the picture’s start');
eq(muLines.filter((line) => line.startsWith('\\spectrummumos{')), ['\\spectrummumos{munmos}{nmos}{1}{0}', '\\spectrummumos{mupmos}{pmos}{1}{0}'], 'each shape used declared once');
eq(muLines.slice(-7, -1), [
  '\\node[munmos, rotate=90, xscale=-1] (M1) at (0,0) {};',
  '\\node[font=\\scriptsize, anchor=south east] at (M1.G) {G};',
  '\\node[font=\\scriptsize, anchor=south east] at (M1.D) {D};',
  '\\node[font=\\scriptsize, anchor=south west] at (M1.S) {S};',
  '\\node[mupmos] (p) at (3,0) {};',
  '\\draw (M1.D) to[R] (p.S);'
], 'MU parts as circuitikz nodes, wired and labelled at their anchors');
eq(pinLabelSpots({ type: 'mu-pmos', rotate: 90 }), pinLabelSpots({ type: 'pmos', rotate: 90 }), 'pin letters where pmos has them');
const depletion = circuitCode({ elements: [{ id: 'd', kind: 'node', type: 'mu-nmosd', at: { x: 0, y: 0 } }, { id: 'e', kind: 'node', type: 'mu-pmosd', at: { x: 8, y: 0 } }], junctions: [] }, {});
eq(depletion.body.split('\n').slice(2, 4), ['\\node[nmos, arrowmos] at (0,0) {};', '\\node[pmos, arrowmos, nocircle] at (2,0) {};'], 'the depletion ones are circuitikz’s solid channel with the source arrow, nothing to declare');
eq([depletion.packages, circuitCode(muCircuit, {}).packages], [['circuitikz'], ['circuitikz']], 'nothing more for the preamble');
eq(circuitCode(before, {}).body.includes('makeatletter'), false, 'a drawing without them declares nothing');

// the rest of the lecture slides' symbols: MU Style shapes declared once each, after the MOSFET macro they share, and
// circuitikz's own keys and options with nothing to declare
const slides: CircuitModel = { elements: [
  { id: 'b', kind: 'node', type: 'mu-nmosb', at: { x: 0, y: 0 }, name: 'M1', pinLabels: true },
  { id: 'c', kind: 'node', type: 'mu-pmosdb', at: { x: 8, y: 0 } },
  { id: 'd', kind: 'path', type: 'mu-ideal-diode', a: { part: 'b', pin: 'bulk' }, b: { x: 4, y: -8 }, label: { text: 'D_1' }, options: ['fill=gray!25'] },
  { id: 'i', kind: 'path', type: 'mu-current-source', a: { x: 0, y: -8 }, b: { x: 0, y: -16 }, label: { text: 'I_{SS}' }, current: { text: 'I' } },
  { id: 'v', kind: 'path', type: 'mu-ac-source', a: { x: 4, y: -16 }, b: { x: 4, y: -8 }, voltage: { text: 'v_s' } },
  { id: 's', kind: 'path', type: 'mu-ac-sine-source', a: { x: 8, y: -16 }, b: { x: 8, y: -8 } },
  { id: 'r', kind: 'node', type: 'supply-up', at: { x: 0, y: 8 }, options: ['mu rail'] },
  { id: 't', kind: 'node', type: 'transformer', at: { x: 20, y: 0 }, options: ['mu dots outside'] },
  { id: 'u', kind: 'node', type: 'mu-nmosb', at: { x: 12, y: 0 } }
], junctions: [] };
const slideLines = circuitCode(slides, {}).body.split('\n');
const declared = ['% MU Style MOSFETs:', '\\def\\spectrummumos#1#2#3#4{', '\\spectrummumos{munmosb}{nmos}{1}{1}', '\\spectrummumos{mupmosdb}{pmos}{0}{1}', '% MU Style ideal diode', '% MU Style current source (box)', '% MU Style AC source (+ ~ −)', '% MU Style AC source (sine, + and −)', '\\tikzset{mu rail/', '\\tikzset{mu dots outside/'];
eq(slideLines.filter((line) => /^(\\def\\spectrummumos|\\spectrummumos\{|% MU|\\tikzset\{mu)/.test(line)).map((line, i) => line.startsWith(declared[i]) && declared[i]), declared, 'each shape and style used, once, the MOSFET macro first');
eq(slideLines.filter((line) => /^\\(node|draw)/.test(line)), [
  '\\node[munmosb] (M1) at (0,0) {};',
  '\\node[font=\\scriptsize, anchor=south east] at (M1.G) {G};',
  '\\node[font=\\scriptsize, anchor=south east] at (M1.D) {D};',
  '\\node[font=\\scriptsize, anchor=north east] at (M1.S) {S};',
  '\\node[font=\\scriptsize, anchor=south west] at (M1.bulk) {B};',
  '\\node[mupmosdb] at (2,0) {};',
  '\\node[vcc, mu rail] at (0,2) {};',
  '\\node[transformer, mu dots outside] at (5,0) {};',
  '\\node[munmosb] at (3,0) {};',
  '\\draw (M1.bulk) to[muidealdiode, fill=gray!25, l={$D_1$}] (1,-2);',
  '\\draw (0,-2) to[murectisource, l={$I_{SS}$}, i={$I$}] (0,-4);',
  '\\draw (1,-4) to[mutildesource, v={$v_s$}] (1,-2);',
  '\\draw (2,-4) to[musinesource] (2,-2);'
], 'MU parts as circuitikz keys, with labels, currents, voltages, fill and pin letters as other parts have them');
eq(circuitCode(slides, {}).packages, ['circuitikz'], 'nothing more for the preamble');
eq(circuitCode({ elements: [{ id: 'd', kind: 'path', type: 'mu-ideal-diode', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }], junctions: [] }, {}).body.split('\n').filter((line) => line.startsWith('\\def')), [], 'a two-terminal one alone leaves the MOSFET macro out');
const options = circuitCode({ elements: [
  { id: 'z', kind: 'path', type: 'zener-z', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, options: ['fill=gray!25'] },
  { id: 'x', kind: 'path', type: 'impedance-text', a: { x: 0, y: 4 }, b: { x: 8, y: 4 }, text: '$Z_1(s)$' },
  { id: 'p', kind: 'node', type: 'pmos', at: { x: 0, y: 8 }, options: ['emptycircle'] },
  { id: 'o', kind: 'node', type: 'op-amp', at: { x: 8, y: 8 }, text: '$A$', options: ['noinv input up', 'circuitikz/amplifiers/scale=3'] },
  { id: 'a', kind: 'node', type: 'amplifier', at: { x: 16, y: 8 }, text: '$A$' },
  { id: 'g', kind: 'node', type: 'ground', at: { x: 16, y: 4 } },
  { id: 'w', kind: 'wire', points: [{ part: 'a', pin: 'down' }, { part: 'g', pin: 'center' }], routes: ['--'] }
], junctions: [] }, {}).body.split('\n');
eq(options.slice(2, -1), [
  '\\node[pmos, emptycircle] at (0,2) {};',
  '\\node[op amp, noinv input up, circuitikz/amplifiers/scale=3] at (2,2) {$A$};',
  '\\node[plain mono amp] (a) at (4,2) {$A$};',
  '\\node[ground] (g) at (4,1) {};',
  '\\draw (0,0) to[zzD, fill=gray!25] (1,0);',
  '\\draw (0,1) to[twoport, bipoles/twoport/width=.8, bipoles/twoport/height=.3, t={$Z_1(s)$}] (2,1);',
  '\\draw (a.down) -- (g.center);'
], 'the circuitikz options and entries: zzD, text in a box, the gate circle, a sized op amp with text, an amplifier’s bottom pin');
for (const [id, choices] of [['pmos', 3], ['pmosd', 3], ['pmos-bulk', 3], ['op-amp', 3], ['amplifier', 3], ['transformer', 2], ['transformer-core', 2]] as const) {
  eq(PARTS.get(id)?.enumOptions?.slice(-1)[0]?.values.length, choices, `${id} offers its new choice`);
}
for (const id of ['diode', 'zener', 'zener-z', 'mu-ideal-diode']) eq(PARTS.get(id)?.options?.map((o) => o.label), ['Filled'], `${id} can be filled`);
// every option and key Spectrum declares is one the symbol route lets through (symbolService's SAFE)
for (const part of CATALOGUE) for (const key of [part.tikz, ...(part.options || []), ...(part.enumOptions || []).flatMap((group) => group.values)].map((k) => (typeof k === 'string' ? k : k.name))) eq(/^[\w .,=+\-/*<>^!|:]*$/.test(key), true, `${part.id}: ${key} is safe to send`);

console.log('circuitikz.check: ok');
