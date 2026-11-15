// Self-check for Annotate: each annotation's TikZ, Text's look, the presets, currents and flows on wires, and turning,
// mirroring, moving and pasting annotations without them ever taking hold of a pin. Run:
// npx esbuild apps/frontend/src/diagram/modes/circuitikz/annotate.check.ts --bundle --platform=node --log-level=warning | node
import { PRESETS, annotationCode, presetElements } from './annotate';
import { circuitCode } from './code';
import { attach, flip, moveBy, paste, rotate } from './edit';
import { findJunctions, placeholderShape } from './model';
import type { Annotation, CircuitModel, Element, NodePart, Wire } from './model';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const shapeOf = (type: string) => placeholderShape(type);
const ann = (a: Omit<Annotation, 'id' | 'kind'>, id = 'a1'): Annotation => ({ id, kind: 'annotation', ...a });
const body = (elements: Element[]) => circuitCode({ elements, junctions: [] }, {}).body.split('\n').slice(2, -1);

// ─── each kind's TikZ ───

eq(annotationCode(ann({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] })), '\\draw (0,0) -- (1,0);', 'a plain line: circuitikz’s own width and black');
eq(
  annotationCode(ann({ shape: 'line', points: [{ x: 9, y: 18 }, { x: 9, y: 16 }, { x: 13, y: 16 }], arrows: '->', width: 'thick', colour: '#b0392c' })),
  '\\draw[-{Latex[length=2mm]}, draw={rgb,255:red,176;green,57;blue,44}, thick] (2.25,4.5) -- (2.25,4) -- (3.25,4);',
  'an L-shaped arrow in the dark red, as the solutions’ resistance arrow'
);
eq(annotationCode(ann({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], arrows: '<->', head: 'stealth', headSize: 'large' })), '\\draw[{Stealth[length=3mm]}-{Stealth[length=3mm]}] (0,0) -- (1,0);', 'both ends, Stealth, large');
eq(annotationCode(ann({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], arrows: '<-', head: 'triangle', headSize: 'small' })), '\\draw[{Triangle[open, length=1.5mm]}-] (0,0) -- (1,0);', 'at the start, open triangle, small');
eq(annotationCode(ann({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], arrows: '->', head: 'to' })), '\\draw[-{To[length=2mm]}] (0,0) -- (1,0);', 'the plain >');
eq(annotationCode(ann({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 8, y: 0 }], bend: -30, dash: 'dash dot', colour: 'magenta' })), '\\draw[draw=magenta, dash dot] (0,0) to[bend right=30] (1,0) to[bend right=30] (2,0);', 'a curve, bent right on each segment');
eq(annotationCode(ann({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], dash: 'dotted', width: 'very thick' })), '\\draw[dotted, very thick] (0,0) -- (1,0);', 'dotted, very thick');
eq(annotationCode(ann({ shape: 'rect', points: [{ x: 4, y: -2 }, { x: -4, y: 2 }], dash: 'dashed' })), '\\draw[dashed] (-1,-0.5) rectangle (1,0.5);', 'a frame, either way its corners were drawn');
eq(
  annotationCode(ann({ shape: 'rect', points: [{ x: -3, y: -5 }, { x: 3, y: 5 }], rounded: true, fill: 'blue', loop: 'cw' })),
  '\\draw[rounded corners=2.5mm, fill=blue, fill opacity=0.15] (-0.75,-1.25) rectangle (0.75,1.25);\n\\draw[-{Latex[length=2mm]}] (0.75,0.15) -- (0.75,-0.15);',
  'a mesh marker: rounded, lightly filled, its arrowhead down the right side'
);
eq(
  annotationCode(ann({ shape: 'ellipse', points: [{ x: -4, y: -4 }, { x: 4, y: 4 }], loop: 'ccw', dash: 'dashed', colour: 'red', width: 'thick' })),
  '\\draw[draw=red, dashed, thick] (0,0) ellipse [x radius=1, y radius=1];\n\\draw[-{Latex[length=2mm]}, draw=red, thick] (1,-0.15) -- (1,0.15);',
  'a loop current anticlockwise: the arrowhead solid, in the outline’s colour and width'
);
eq(annotationCode(ann({ shape: 'ellipse', points: [{ x: 0, y: 0 }, { x: 6, y: 4 }], fill: '#ff0000' })), '\\draw[fill={rgb,255:red,255;green,0;blue,0}, fill opacity=0.15] (0.75,0.5) ellipse [x radius=0.75, y radius=0.5];', 'a custom fill colour');
eq(annotationCode(ann({ shape: 'cross', points: [{ x: 4, y: 4 }], width: 'very thick' })), '\\draw[very thick] (0.875,0.875) -- (1.125,1.125) (0.875,1.125) -- (1.125,0.875);', 'a cross, 0.25 cm across');
eq(annotationCode(ann({ shape: 'cross', points: [{ x: 0, y: 0 }], size: 1 })), '\\draw (-0.25,-0.25) -- (0.25,0.25) (-0.25,0.25) -- (0.25,-0.25);', 'a larger cross');

// ─── in the picture ───

const resistor: Element = { id: 'r', kind: 'path', type: 'resistor', a: { x: 0, y: 0 }, b: { x: 8, y: 0 } };
const arrow = ann({ shape: 'line', points: [{ x: 0, y: 2 }, { x: 8, y: 2 }], arrows: '->' });
const out = circuitCode({ elements: [arrow, resistor], junctions: [{ x: 0, y: 0 }] }, {});
eq(out.body.split('\n').slice(2, -1), ['\\draw (0,0) to[R] (2,0);', '\\node[circ] at (0,0) {};', '\\draw[-{Latex[length=2mm]}] (0,0.5) -- (2,0.5);'], 'annotations last, over the circuit and its dots');
eq(out.libraries, ['arrows.meta'], 'arrows.meta when an arrowhead is drawn');
eq(circuitCode({ elements: [resistor, ann({ shape: 'cross', points: [{ x: 0, y: 0 }] })], junctions: [] }, {}).libraries, [], 'and not otherwise');
eq(circuitCode({ elements: [resistor, ann({ shape: 'ellipse', points: [{ x: 0, y: 0 }, { x: 4, y: 4 }], loop: 'cw' })], junctions: [] }, {}).libraries, ['arrows.meta'], 'a loop’s arrowhead loads it too');

// ─── Text's look ───

const text = (look: Partial<NodePart>): NodePart => ({ id: 't', kind: 'node', type: 'text', at: { x: 4, y: 4 }, text: '$R_\\mathrm{in}$', ...look });
eq(body([text({})]), ['\\node at (1,1) {$R_\\mathrm{in}$};'], 'Text with no look writes what it did');
eq(body([text({ colour: '#b0392c', bold: true })]), ['\\node[text={rgb,255:red,176;green,57;blue,44}, font=\\bfseries] at (1,1) {$R_\\mathrm{in}$};'], 'the solutions’ circuit annotation style');
eq(body([text({ colour: 'blue', italic: true, font: 'scriptsize', rotate: 90 })]), ['\\node[text=blue, font=\\itshape\\scriptsize, rotate=90] at (1,1) {$R_\\mathrm{in}$};'], 'italic, small, then its turn');

// ─── currents and flows on wires ───

const wire = (extra: Partial<Wire>): Wire => ({ id: 'w', kind: 'wire', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 12, y: 4 }], routes: ['--', '-|'], ...extra });
eq(body([wire({})]), ['\\draw (0,0) -- (2,0) -| (3,1);'], 'a wire without marks writes what it did');
eq(body([wire({ currents: [{ text: 'i_b', dir: '>' }, null] })]), ['\\draw (0,0) to[short, i>={$i_b$}] (2,0) -| (3,1);'], 'a current on a straight segment');
eq(body([wire({ flows: [null, { text: 'I_D', side: '_' }], arrows: '->' })]), ['\\draw[-latex] (0,0) -- (2,0) to[short, f_={$I_D$}] (2,0 -| 3,1) -- (3,1);'], 'a flow on a bent segment, on its first leg');
eq(body([wire({ routes: ['--', '|-'], currents: [null, { text: 'i' }], flows: [null, { text: 'f' }] })]), ['\\draw (0,0) -- (2,0) to[short, i={$i$}, f_={$f$}] (2,0 |- 3,1) -- (3,1);'], 'both, up then across, the flow across the wire from the current');

// ─── presets ───

const empty: CircuitModel = { elements: [], junctions: [] };
for (const [preset, label] of PRESETS) {
  const made = presetElements(empty, preset, { x: 8, y: 8 });
  eq(new Set(made.map((el) => el.id)).size, made.length, `${label}: fresh ids`);
  eq(made.every((el) => el.kind === 'annotation' || (el.kind === 'node' && el.type === 'text')), true, `${label}: annotations and Text only`);
}
eq(
  body(presetElements(empty, 'resistance', { x: 8, y: 8 })),
  [
    '\\node[text={rgb,255:red,176;green,57;blue,44}, font=\\bfseries] at (1.75,0.7) {$R_{\\mathrm{in}}$};',
    '\\draw[draw={rgb,255:red,176;green,57;blue,44}, thick] (1.875,1.875) -- (2.125,2.125) (1.875,2.125) -- (2.125,1.875);',
    '\\draw[-{Latex[length=2mm]}, draw={rgb,255:red,176;green,57;blue,44}, thick] (1.75,1) -- (1.75,1.75) -- (2.75,1.75);'
  ],
  'Resistance looking in: a cut, a hooked arrow and R_in, in the dark red'
);
eq(
  body(presetElements(empty, 'mesh', { x: 0, y: 0 })),
  ['\\node at (0,0) {\\textcircled{1}};', '\\draw[rounded corners=2.5mm, fill=blue, fill opacity=0.15] (-0.75,-1.25) rectangle (0.75,1.25);', '\\draw[-{Latex[length=2mm]}] (0.75,0.15) -- (0.75,-0.15);'],
  'Mesh current marker: a shaded rounded box, a circled number, an arrowhead on one side'
);
eq(body(presetElements(empty, 'frame', { x: 0, y: 0 })), ['\\node at (0,1.8) {Feedback network};', '\\draw[dashed] (-2,-1.5) rectangle (2,1.5);'], 'Frame: dashed, with its caption above');
eq(body(presetElements(empty, 'highlight', { x: 0, y: 0 })), ['\\draw[draw=red, thick] (0,0) ellipse [x radius=0.75, y radius=0.5];'], 'Highlight: a red ellipse');
eq(body(presetElements(empty, 'loop', { x: 0, y: 0 })).length, 3, 'Loop current: a circle, its arrowhead and i_1');
eq(body(presetElements(empty, 'current', { x: 0, y: 0 }))[1], '\\draw[-{Latex[length=2mm]}, draw={rgb,255:red,176;green,57;blue,44}, thick] (0,0) -- (1,0);', 'Current arrow');

// ─── never connected ───

// a line drawn from a resistor's end to an op amp's pin: no junction, no hold on either
const amp: Element = { id: 'u', kind: 'node', type: 'op-amp', at: { x: 20, y: 0 } };
const opPin = shapeOf('op-amp').pins.out;
const overlay = ann({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 20 + opPin.x, y: opPin.y }] }, 'a');
const circuit: CircuitModel = { elements: [resistor, amp, overlay, { id: 'w', kind: 'wire', points: [{ x: 0, y: 0 }, { x: 0, y: -4 }], routes: ['--'] }], junctions: [] };
eq(findJunctions(circuit, shapeOf), [], 'an annotation adds no junction dots');
eq(attach(circuit, new Set(['a']), shapeOf).elements[2], overlay, 'nor takes hold of a pin');

// ─── moving, turning, mirroring, pasting ───

const line = ann({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 4, y: 4 }], arrows: '->', bend: 30 }, 'a');
const one = (m: CircuitModel) => m.elements[0] as Annotation;
const model: CircuitModel = { elements: [line], junctions: [] };
eq(one(moveBy(model, new Set(['a']), { x: 2, y: -1 })).points, [{ x: 2, y: -1 }, { x: 2, y: 3 }, { x: 6, y: 3 }], 'moves with the selection');
eq(one(rotate(model, new Set(['a']), 90, shapeOf)).points, [{ x: 4, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 4 }], 'turns a quarter about its middle');
const mirrored = one(flip(model, new Set(['a']), 'x'));
eq([mirrored.points, mirrored.bend], [[{ x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], -30], 'mirrors about its middle, its bend the other way');
const loop = ann({ shape: 'ellipse', points: [{ x: 0, y: 0 }, { x: 8, y: 8 }], loop: 'cw' }, 'a');
eq(one(flip({ elements: [loop], junctions: [] }, new Set(['a']), 'y')).loop, 'ccw', 'a mirrored loop goes round the other way');
// a preset's group turns and mirrors as one; its label moves and stays upright and readable
const group = presetElements(empty, 'resistance', { x: 0, y: 0 });
const ids = new Set(group.map((el) => el.id));
const turned = rotate({ elements: group, junctions: [] }, ids, 90, shapeOf).elements;
eq([(turned[2] as NodePart).rotate, (turned[2] as NodePart).at, (turned[0] as Annotation).points], [undefined, { x: 3, y: -5 }, [{ x: -2, y: -4 }]], 'a turned preset: its label moved, not turned');
const flipped = flip({ elements: group, junctions: [] }, ids, 'x').elements;
eq([(flipped[2] as NodePart).flipX, (flipped[2] as NodePart).at, (flipped[1] as Annotation).points], [undefined, { x: 3, y: -5.2 }, [{ x: 3, y: -4 }, { x: 3, y: -1 }, { x: -1, y: -1 }]], 'a mirrored preset: the arrow hooks the other way, its label still readable');
// flipped with the circuit, each annotation mirrors in its place, so a highlight stays on the part it marks
const ring = ann({ shape: 'ellipse', points: [{ x: 6, y: -2 }, { x: 10, y: 2 }], loop: 'cw' }, 'h');
const withPart = flip({ elements: [resistor, ring], junctions: [] }, new Set(['r', 'h']), 'x').elements;
eq([(withPart[1] as Annotation).points, (withPart[1] as Annotation).loop, (withPart[0] as { invert?: boolean }).invert], [[{ x: 10, y: -2 }, { x: 6, y: 2 }], 'ccw', true], 'flipped with a part: in place');
const pasted = paste(model, [line], { x: 2, y: -2 });
eq([(pasted.model.elements[1] as Annotation).points[0], pasted.ids.length, pasted.ids[0] !== 'a'], [{ x: 2, y: -2 }, 1, true], 'pastes with a fresh id, moved');

console.log('annotate.check: ok');
