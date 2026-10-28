import type { DiagramCode } from '../../fileFormat';
import type { Box, Heads, Line, Link, Shape, Side, TikzModel } from '../tikz/code';
import { BEND, CM_PER_UNIT, MATHS_SHAPES, ROUND_SHAPES, drawingOrder, plainShape, stateShape } from '../tikz/code';
import { num } from '../shared';
// Typst content text: markup escaped, on one line
import { typstMarkup as content } from '../../../editor/floats';

// Fletcher (a Typst package): the plain TikZ mode's boxes and arrows, written for Typst. Its canvas, rail and
// inspector are the TikZ mode's, so only the code is its own.

/** The newest fletcher each Typst version supports, from the package's typst.toml (compiler). */
const FLETCHER: [minimumTypst: string, fletcher: string][] = [
  ['0.13.0', '0.5.8'],
  ['0.12.0', '0.5.5']
];

const atLeast = (version: string, minimum: string) => {
  const left = String(version || '0').split('.').map(Number);
  const right = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return true;
};

/** The fletcher version a Typst version can import; the built-in Typst's when nothing is pinned. */
export function fletcherFor(typstVersion: string) {
  if (!typstVersion) return FLETCHER[0][1];
  return FLETCHER.find(([minimum]) => atLeast(typstVersion, minimum))?.[1] ?? FLETCHER[FLETCHER.length - 1][1];
}


const SHAPE: Record<Shape, string> = {
  rectangle: 'rect',
  rounded: 'rect',
  circle: 'circle',
  ellipse: 'ellipse',
  diamond: 'diamond',
  parallelogram: 'parallelogram',
  text: 'rect',
  maths: 'rect',
  state: 'circle',
  accepting: 'circle',
  cylinder: 'cylinder',
  trapezium: 'trapezium',
  operator: 'circle',
  container: 'rect',
  // not in FLETCHER_SHAPES, so the Typst canvas never offers them: a plain box should one get here
  document: 'rect',
  stack: 'rect'
};

/** Which way a loop on each side sticks out (fletcher's lengths go up, as TikZ's do). */
const LOOP_ANGLE: Record<Side, number> = { t: 90, r: 0, b: -90, l: 180 };
const OUTWARD: Record<Side, [number, number]> = { t: [0, 1], r: [1, 0], b: [0, -1], l: [-1, 0] };
const cm = (value: number) => num(value * CM_PER_UNIT) + 'cm';

/** A line's colour, thickness and dash (an edge's is in its marks) as a stroke, which fletcher lays over its default. */
function strokeOf(line: Line, dash = true) {
  const parts = [
    line.stroke && 'paint: rgb("' + line.stroke + '")',
    line.width && 'thickness: ' + num(line.width) + 'pt',
    dash && line.dash && line.dash !== 'solid' && 'dash: "' + line.dash + '"'
  ].filter(Boolean);
  return parts.length > 0 && 'stroke: (' + parts.join(', ') + ')';
}

/**
 * The node for a box: its centre in cm (y up, as in TikZ: the canvas's y goes down), its text or maths, and its shape
 * and size; then a container's ×N and a state's start arrow. version: the fletcher the import line loads, whose 0.5.5
 * (for Typst 0.12) has no cylinder, so one is a plain box there.
 */
function nodeCode(box: Box, version: string) {
  const plain = plainShape(box.shape);
  const size = ROUND_SHAPES.includes(box.shape) ? Math.min(box.w, box.h) : 0;
  const width = size || box.w;
  const height = size || box.h;
  const container = box.shape === 'container';
  const options = [
    'shape: fletcher.shapes.' + (box.shape === 'cylinder' && !atLeast(version, '0.5.8') ? 'rect' : SHAPE[box.shape]),
    (box.shape === 'rounded' || container) && 'corner-radius: 4pt',
    'width: ' + cm(width),
    'height: ' + cm(height),
    // a double circle, as TikZ's accepting state
    box.shape === 'accepting' && 'extrude: (-2.5, 0)',
    // its title fills it from the top-left corner, under the other nodes and the edges
    container && 'inset: 0pt',
    container && 'layer: -1',
    plain && 'stroke: none',
    plain && 'fill: none',
    !plain && strokeOf(box),
    !plain && box.fill && 'fill: rgb("' + box.fill + '")',
    'name: <' + box.id + '>'
  ].filter(Boolean);
  const maths = MATHS_SHAPES.includes(box.shape);
  let text = maths ? (box.text.trim() ? '[$' + box.text.trim() + '$]' : '[]') : '[' + content(box.text) + ']';
  if (container) text = 'box(width: ' + cm(box.w) + ', height: ' + cm(box.h) + ', inset: 4pt, align(top + left)' + text + ')';
  else if (box.wrap && !plain) text = 'box(width: ' + cm(Math.max(1, box.w - 1)) + ')' + text;
  // a label's colour is its text's; a box's is its border's
  const label = plain && box.stroke ? 'text(fill: rgb("' + box.stroke + '"))' + text : text;
  const [x, y] = [box.x + box.w / 2, -(box.y + box.h / 2)];
  const lines = ['node((' + cm(x) + ', ' + cm(y) + '), ' + label + ', ' + options.join(', ') + ')'];
  // a container's ×N, outside on the right
  if (container && box.repeat?.trim()) lines.push('node((' + cm(x + box.w / 2 + 2) + ', ' + cm(y) + '), [$times ' + box.repeat.trim() + '$], stroke: none, fill: none)');
  // a start arrow, from a little way out on its side
  if (stateShape(box.shape) && box.initial) {
    const [dx, dy] = OUTWARD[box.initial];
    lines.push('edge((' + cm(x + dx * (width / 2 + 3)) + ', ' + cm(y + dy * (height / 2 + 3)) + '), <' + box.id + '>, "->")');
  }
  return lines;
}

const HEADS: Record<Heads, string> = { none: '', end: '>', start: '<', both: '<>' };

/** The line and marks shorthand fletcher reads: ->, <->, -->, <..>, and so on. */
const marksOf = (link: Link) => {
  const line = link.dash === 'dashed' ? '--' : link.dash === 'dotted' ? '..' : '-';
  const heads = HEADS[link.heads];
  return (heads.startsWith('<') ? '<' : '') + line + (heads.endsWith('>') ? '>' : '');
};

/** The edge between two boxes, with its label and route. */
function edgeCode(link: Link, boxes: Map<string, Box>) {
  const from = boxes.get(link.from);
  const to = boxes.get(link.to);
  if (!from || !to) return '';
  const loop = from === to;
  // a corner between boxes in line would sit on one of them, which fletcher refuses: straight there
  const centre = (box: Box) => [cm(box.x + box.w / 2), cm(box.y + box.h / 2)];
  const inLine = centre(from).some((v, i) => v === centre(to)[i]);
  const options = [
    !loop && link.route === 'curved' && 'bend: 30deg',
    // to the same side as TikZ's bend left, with lengths that go up
    !loop && link.route === 'bend' && 'bend: ' + BEND + 'deg',
    !loop && !inLine && link.route === 'angled' && 'corner: right',
    loop && 'bend: 130deg, loop-angle: ' + LOOP_ANGLE[link.fromSide] + 'deg',
    link.label?.trim() && 'label: [' + content(link.label.trim()) + ']',
    strokeOf(link, false)
  ].filter(Boolean);
  return 'edge(<' + from.id + '>, <' + to.id + '>, "' + marksOf(link) + '"' + (options.length ? ', ' + options.join(', ') : '') + ')';
}

/** A fletcher diagram as the Typst file a document includes. style.typstVersion picks the import line. */
export function fletcherCode(model: TikzModel, typstVersion = ''): DiagramCode {
  const boxes = new Map(model.boxes.map((box) => [box.id, box]));
  const version = fletcherFor(typstVersion);
  const lines = [
    '#import "@preview/fletcher:' + version + '" as fletcher: diagram, node, edge',
    '#set page(width: auto, height: auto, margin: 4pt) if sys.inputs.at("spectrum-diagram", default: "") == "standalone"',
    '#diagram(',
    '  node-stroke: 0.4pt,',
    ...drawingOrder(model.boxes).flatMap((box) => nodeCode(box, version)).map((line) => '  ' + line + ','),
    ...model.links.map((link) => edgeCode(link, boxes)).filter(Boolean).map((line) => '  ' + line + ','),
    ')',
    ''
  ];
  return { body: lines.join('\n'), packages: [], libraries: [] };
}
