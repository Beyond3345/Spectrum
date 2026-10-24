// Self-check for the circuit mode's export, snapping and junctions. Run:
// npx esbuild apps/frontend/src/diagram/modes/circuitikz/circuitikz.check.ts --bundle --platform=node --log-level=warning | node
import { circuitCode, readStyle, symbolOptions } from './code';
import { attach, detach, moveBy, paste, remove } from './edit';
import { PT_PER_GRID, findJunctions, locator, placeNodeOffset, placeholderShape, snapDelta, wirePath } from './model';
import type { CircuitModel, Shape } from './model';

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
    '\\begin{circuitikz}[american, voltage dir=RP]',
    '\\ctikzset{label/align=straight, bipoles/length=1.2cm}',
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
eq(circuitCode({ elements: [], junctions: [] }, { preset: 'european' }).body, '\\begin{circuitikz}[european]\n\\end{circuitikz}', 'an empty circuit');

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

console.log('circuitikz.check: ok');
