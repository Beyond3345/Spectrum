// Self-check for the circuit mode's export, snapping and junctions. Run:
// npx esbuild apps/frontend/src/diagram/modes/circuitikz/circuitikz.check.ts --bundle --platform=node --log-level=warning | node
import { symbolGeometry, symbolRequest } from './symbolGeometry';
import { circuitCode, readStyle, symbolOptions } from './code';
import { attach, detach, moveBy, newPathPart, paste, remove } from './edit';
import { CATALOGUE, PARTS, PT_PER_GRID, circuitBounds, findJunctions, locator, placeNodeOffset, placeholderShape, snapDelta, wirePath } from './model';
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
eq(symbolOptions(readStyle({ inductors: 'cute', voltageDir: 'RP', diodes: 'full', length: 1.2 })), 'american, cute inductors, diode=full, bipoles/length=1.2cm', 'only what changes the symbols goes to the generator');

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

console.log('circuitikz.check: ok');
