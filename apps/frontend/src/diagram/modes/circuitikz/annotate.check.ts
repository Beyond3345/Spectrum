// Self-check for Annotate: each annotation's TikZ, Text's look, the presets, currents and flows on wires, and turning,
// mirroring, moving and pasting annotations without them ever taking hold of a pin. Run:
// npx esbuild apps/frontend/src/diagram/modes/circuitikz/annotate.check.ts --bundle --platform=node --log-level=warning | node
import { PRESETS, annotationCode, dimensionGeometry, hatchSegments, presetElements } from './annotate';
import { circuitCode } from './code';
import { attach, flip, moveBy, paste, rotate } from './edit';
import { annotatesWith25, findJunctions, placeholderShape } from './model';
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

// ─── 2.5: the fluid mechanics and materials courses' tools ───

const pts = (...xy: [number, number][]) => xy.map(([x, y]) => ({ x, y }));
const tank = pts([0, 0], [8, 0], [8, 4], [0, 4]);
eq(annotationCode(ann({ shape: 'polygon', points: tank, material: 'water' })), '\\draw[fill=blue!12] (0,0) -- (2,0) -- (2,1) -- (0,1) -- cycle;', 'a body of water: the notes’ blue!12, outlined');
eq(annotationCode(ann({ shape: 'polygon', points: tank, material: 'seawater', noOutline: true })), '\\path[fill=teal!25] (0,0) -- (2,0) -- (2,1) -- (0,1) -- cycle;', 'seawater with no outline: only its fill');
eq(annotationCode(ann({ shape: 'rect', points: pts([0, 0], [8, 4]), material: 'mercury', pattern: 'hatch', colour: 'red', dash: 'dashed' })), '\\draw[pattern=spx hatch, pattern color=red, draw=red, dashed] (0,0) rectangle (2,1);', 'mercury hatched, as the exams draw it, in the line colour');
eq(annotationCode(ann({ shape: 'ellipse', points: pts([0, 0], [8, 4]), material: 'oil', fill: 'red' })), '\\draw[fill=orange!30] (1,0.5) ellipse [x radius=1, y radius=0.5];', 'a material outweighs a light fill');
eq(annotationCode(ann({ shape: 'polygon', points: tank, material: 'concrete', pattern: 'stipple', noOutline: true })), '\\path[pattern=spx stipple] (0,0) -- (2,0) -- (2,1) -- (0,1) -- cycle;', 'concrete as stipple');
eq(annotationCode(ann({ shape: 'polygon', points: tank })), '\\draw (0,0) -- (2,0) -- (2,1) -- (0,1) -- cycle;', 'a polygon with no fill');
eq(
  annotationCode(ann({ shape: 'boundary', points: pts([0, 0], [8, 0], [8, 8]) })).split('\n'),
  ['\\draw[line width=0.8pt] (0,0) -- (2,0) -- (2,2);', '\\begin{scope}[shift={(0,0)}]\\foreach \\i in {1,...,10} \\draw (0.2*\\i,0) -- ++(-0.2,-0.2);\\end{scope}', '\\begin{scope}[shift={(2,0)}, rotate=90]\\foreach \\i in {1,...,10} \\draw (0.2*\\i,0) -- ++(-0.2,-0.2);\\end{scope}'],
  'a hatched floor and wall, 0.8pt with 0.2 cm hatching as the mechanics set’s ground, on the right of the way drawn'
);
eq(
  annotationCode(ann({ shape: 'boundary', points: pts([0, 0], [-3, 3]), hatch: 'left', width: 'thick', dash: 'dashed', colour: 'blue' })).split('\n'),
  ['\\draw[draw=blue, dashed, thick] (0,0) -- (-0.75,0.75);', '\\begin{scope}[shift={(0,0)}, rotate=135]\\foreach \\i in {1,...,5} \\draw[draw=blue] (0.2*\\i,0) -- ++(-0.2,0.2);\\end{scope}'],
  'a slanted boundary, hatched on its left, in its own width, the hatching solid'
);
eq(hatchSegments(ann({ shape: 'boundary', points: pts([0, 0], [4, 0]) }))[0].strokes.map((pair) => pair.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000])), [[[0.8, 0], [0, -0.8]], [[1.6, 0], [0.8, -0.8]], [[2.4, 0], [1.6, -0.8]], [[3.2, 0], [2.4, -0.8]], [[4, 0], [3.2, -0.8]]], 'the canvas’s strokes are the code’s');
eq(
  annotationCode(ann({ shape: 'dimension', points: pts([0, 0], [8, 0], [4, -3]), text: 'h', headSize: 'small' })).split('\n'),
  ['\\draw (0,-0.05) -- (0,-0.85) (2,-0.05) -- (2,-0.85);', '\\draw[{Latex[length=1.5mm]}-{Latex[length=1.5mm]}] (0,-0.75) -- (2,-0.75) node[midway, anchor=north] {$h$};'],
  'a dimension under what it measures: extension lines from just off it to just past its line, the text beside'
);
eq(
  annotationCode(ann({ shape: 'dimension', points: pts([0, 0], [4, -8], [10, 0]), text: '5 cm', along: 'y', textAt: 'gap' })).split('\n'),
  ['\\draw (0.05,0) -- (2.6,0) (1.05,-2) -- (2.6,-2);', '\\draw[{Latex[length=2mm]}-{Latex[length=2mm]}] (2.5,0) -- (2.5,-2) node[midway, fill=white, inner sep=1pt] {5 cm};'],
  'measured up between points not above each other, as the exam’s 5 cm, its words in a gap'
);
eq(dimensionGeometry(ann({ shape: 'dimension', points: pts([0, 0], [8, 8], [0, 8]) })).ends.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]), [[-4, 4], [4, 12]], 'along a slope, its line through the third point');
eq(annotationCode(ann({ shape: 'dimension', points: pts([0, 0], [8, 0], [4, 0]) })), '\\draw[{Latex[length=2mm]}-{Latex[length=2mm]}] (0,0) -- (2,0);', 'on what it measures: no extension lines, no text');
eq(annotationCode(ann({ shape: 'surface', points: pts([4, 4]), colour: 'blue', dash: 'dashed', width: 'thick' })), '\\draw[draw=blue, thick] (1,1) -- ++(-0.15,0.26) -- ++(0.3,0) -- cycle (0.85,0.93) -- ++(0.3,0) (0.92,0.86) -- ++(0.16,0);', 'the ▽ mark, as the fluid set’s, never dashed');
eq(annotationCode(ann({ shape: 'mark', points: pts([4, 4]), text: 'CP' })), '\\fill (1,1) circle (1pt) node[right] {$CP$};', 'a point mark: the hull’s 1pt dot and its letter');
eq(annotationCode(ann({ shape: 'mark', points: pts([4, 4]), text: 'y_c', colour: 'red', width: 'thick', place: 'above' })), '\\fill[fill=red] (1,1) circle (1.5pt) node[above] {$y_c$};', 'coloured, larger, its letter above');
eq(annotationCode(ann({ shape: 'mark', points: pts([4, 4]), text: 'G', cross: true, place: 'left' })), '\\draw (0.92,0.92) -- (1.08,1.08) (0.92,1.08) -- (1.08,0.92) (1,1) node[left] {$G$};', 'a cross with its letter on the left');
eq(annotationCode(ann({ shape: 'mark', points: pts([4, 4]) })), '\\fill (1,1) circle (1pt);', 'a dot with no letter');
eq(annotationCode(ann({ shape: 'leader', points: pts([0, 0], [8, 0]), text: 'Mercury', arrows: '->' })), '\\draw[-{Latex[length=2mm]}] (0,0) node[anchor=east] {Mercury} -- (2,0);', 'a leader callout: its words before its line, an arrow to the point');
eq(annotationCode(ann({ shape: 'leader', points: pts([0, 8], [0, 4], [4, 0]), text: 'Sluice gate' })), '\\draw (0,2) node[anchor=south] {Sluice gate} -- (0,1) -- (1,0);', 'with an elbow and no arrowhead, its words above the line leaving down');

// behind the parts, patterns only when used
const water = ann({ shape: 'polygon', points: tank, material: 'water' }, 'w1');
const hatched = ann({ shape: 'rect', points: tank, material: 'mercury', pattern: 'hatch' }, 'w2');
const tankPart: Element = { id: 't', kind: 'node', type: 'fluid-tank', at: { x: 4, y: 2 } };
const filled = circuitCode({ elements: [tankPart, ann({ shape: 'dimension', points: pts([0, 0], [8, 0], [4, -3]) }, 'd'), water, hatched], junctions: [] }, {});
const filledLines = filled.body.split('\n');
eq(filledLines.findIndex((l) => l.startsWith('\\draw[fill=blue!12]')) < filledLines.findIndex((l) => l.startsWith('\\pic')), true, 'the water before the tank, so it sits behind it');
eq(filledLines.findIndex((l) => l.startsWith('\\draw[pattern=spx hatch]')) < filledLines.findIndex((l) => l.startsWith('\\pic')), true, 'and the mercury');
eq(filledLines.findIndex((l) => l.includes('Latex[length')) > filledLines.findIndex((l) => l.startsWith('\\pic')), true, 'the rest over it');
eq(filledLines.filter((l) => l.includes('\\pgfdeclarepatternformonly')).length, 1, 'one pattern declared, the one used');
eq(filledLines.some((l) => l.startsWith('\\ifcsname pgf@pattern@name@spx hatch\\endcsname\\else\\pgfdeclarepatternformonly{spx hatch}')), true, 'declared once in a document, whatever pictures use it');
eq([...filled.libraries].sort(), ['arrows.meta', 'patterns'], 'the patterns library with a pattern, arrows.meta with a dimension');
eq(circuitCode({ elements: [water], junctions: [] }, {}).libraries, [], 'a tint needs neither');
eq(circuitCode({ elements: [water], junctions: [] }, {}).body.includes('pgfdeclarepattern'), false, 'nor declares a pattern');

// the file version: these make version 5; the older annotations alone keep 4
eq(
  [water, hatched, ann({ shape: 'boundary', points: tank }), ann({ shape: 'mark', points: tank }), ann({ shape: 'leader', points: tank }), ann({ shape: 'surface', points: tank }), ann({ shape: 'dimension', points: tank }), ann({ shape: 'rect', points: tank, noOutline: true })].map((el) => annotatesWith25({ elements: [el], junctions: [] })),
  [true, true, true, true, true, true, true, true],
  'every 2.5 tool asks for version 5'
);
eq([arrow, ann({ shape: 'rect', points: tank, fill: 'blue', loop: 'cw' }), ann({ shape: 'cross', points: tank })].some((el) => annotatesWith25({ elements: [el], junctions: [] })), false, 'the older annotations do not');

// the presets put a point mark down with its letter
for (const letter of ['C', 'CP', 'G', 'B', 'M'] as const) eq(body(presetElements(empty, letter, { x: 4, y: 4 })), [`\\fill (1,1) circle (1pt) node[right] {$${letter}$};`], `the ${letter} preset`);

// never connected: a boundary, a dimension and a leader drawn onto pins hold none and add no dots
const onPins = [ann({ shape: 'boundary', points: pts([0, 0], [8, 0]) }, 'b'), ann({ shape: 'dimension', points: pts([0, 0], [8, 0], [4, 2]) }, 'd'), ann({ shape: 'leader', points: pts([0, 4], [0, 0]) }, 'l'), ann({ shape: 'mark', points: pts([0, 0]) }, 'm')];
const pinned: CircuitModel = { elements: [resistor, ...onPins], junctions: [] };
eq(findJunctions(pinned, shapeOf), [], 'no junction dots from the new tools');
eq(attach(pinned, new Set(onPins.map((el) => el.id)), shapeOf).elements.slice(1), onPins, 'nor a hold on a pin');

// turned and mirrored: hatching stays on its side, a mark's letter goes across, a dimension measured up then measures across
const floor = ann({ shape: 'boundary', points: pts([0, 0], [8, 0]) }, 'a');
const mirroredFloor = one(flip({ elements: [floor], junctions: [] }, new Set(['a']), 'x'));
eq([mirroredFloor.points, mirroredFloor.hatch, hatchSegments(mirroredFloor)[0].strokes[0][1].y < 0], [pts([8, 0], [0, 0]), 'left', true], 'a mirrored floor is hatched underneath still');
eq(one(flip({ elements: [mirroredFloor], junctions: [] }, new Set(['a']), 'y')).hatch, undefined, 'and mirrored top to bottom, hatched above');
const g = ann({ shape: 'mark', points: pts([0, 0]), text: 'G' }, 'a');
eq([one(flip({ elements: [g], junctions: [] }, new Set(['a']), 'x')).place, one(flip({ elements: [{ ...g, place: 'left' }], junctions: [] }, new Set(['a']), 'x')).place, one(flip({ elements: [{ ...g, place: 'above' }], junctions: [] }, new Set(['a']), 'y')).place, one(flip({ elements: [g], junctions: [] }, new Set(['a']), 'y')).place], ['left', undefined, 'below', undefined], 'a mark’s letter across the mirror');
const upright = ann({ shape: 'dimension', points: pts([0, 0], [4, -8], [10, 0]), along: 'y' }, 'a');
eq([one(rotate({ elements: [upright], junctions: [] }, new Set(['a']), 90, shapeOf)).along, one(rotate({ elements: [upright], junctions: [] }, new Set(['a']), 180, shapeOf)).along], ['x', 'y'], 'a quarter turn measures across, a half turn still up');
eq(one(moveBy({ elements: [upright], junctions: [] }, new Set(['a']), { x: 1, y: 1 })).points, pts([1, 1], [5, -7], [11, 1]), 'a dimension moves with its line');
const copied = paste({ elements: [water], junctions: [] }, [water], { x: 2, y: -2 });
eq([(copied.model.elements[1] as Annotation).material, (copied.model.elements[1] as Annotation).points[0]], ['water', { x: 2, y: -2 }], 'a fill copies with its material');

console.log('annotate.check: ok');
