import type { DiagramCode } from '../../fileFormat';
import type { Box, Heads, Line, Link, Shape, TikzModel } from '../tikz/code';
import { CM_PER_UNIT } from '../tikz/code';
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
  maths: 'rect'
};

/** A line's colour, thickness and dash (an edge's is in its marks) as a stroke, which fletcher lays over its default. */
function strokeOf(line: Line, dash = true) {
  const parts = [
    line.stroke && 'paint: rgb("' + line.stroke + '")',
    line.width && 'thickness: ' + num(line.width) + 'pt',
    dash && line.dash && line.dash !== 'solid' && 'dash: "' + line.dash + '"'
  ].filter(Boolean);
  return parts.length > 0 && 'stroke: (' + parts.join(', ') + ')';
}

/** The node for a box: its centre in cm (y up, as in TikZ: the canvas's y goes down), its text or maths, and its shape and size. */
function nodeCode(box: Box) {
  const plain = box.shape === 'text' || box.shape === 'maths';
  const size = box.shape === 'circle' ? Math.min(box.w, box.h) : 0;
  const width = size || box.w;
  const height = size || box.h;
  const options = [
    'shape: fletcher.shapes.' + SHAPE[box.shape],
    box.shape === 'rounded' && 'corner-radius: 4pt',
    'width: ' + num(width * CM_PER_UNIT) + 'cm',
    'height: ' + num(height * CM_PER_UNIT) + 'cm',
    plain && 'stroke: none',
    plain && 'fill: none',
    !plain && strokeOf(box),
    !plain && box.fill && 'fill: rgb("' + box.fill + '")',
    'name: <' + box.id + '>'
  ].filter(Boolean);
  const text = box.shape === 'maths' ? (box.text.trim() ? '[$' + box.text.trim() + '$]' : '[]') : '[' + content(box.text) + ']';
  // a label's colour is its text's; a box's is its border's
  const label = plain && box.stroke ? 'text(fill: rgb("' + box.stroke + '"))' + text : text;
  return 'node((' + num((box.x + box.w / 2) * CM_PER_UNIT) + 'cm, ' + num(-(box.y + box.h / 2) * CM_PER_UNIT) + 'cm), ' + label + ', ' + options.join(', ') + ')';
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
  const options = [
    link.route === 'curved' && 'bend: 30deg',
    link.route === 'angled' && 'corner: right',
    link.label?.trim() && 'label: [' + content(link.label.trim()) + ']',
    strokeOf(link, false)
  ].filter(Boolean);
  return 'edge(<' + from.id + '>, <' + to.id + '>, "' + marksOf(link) + '"' + (options.length ? ', ' + options.join(', ') : '') + ')';
}

/** A fletcher diagram as the Typst file a document includes. style.typstVersion picks the import line. */
export function fletcherCode(model: TikzModel, typstVersion = ''): DiagramCode {
  const boxes = new Map(model.boxes.map((box) => [box.id, box]));
  const lines = [
    '#import "@preview/fletcher:' + fletcherFor(typstVersion) + '" as fletcher: diagram, node, edge',
    '#set page(width: auto, height: auto, margin: 4pt) if sys.inputs.at("spectrum-diagram", default: "") == "standalone"',
    '#diagram(',
    '  node-stroke: 0.4pt,',
    ...model.boxes.map((box) => '  ' + nodeCode(box) + ','),
    ...model.links.map((link) => '  ' + edgeCode(link, boxes)).filter((line) => line.trim() !== '  ').map((line) => line + ','),
    ')',
    ''
  ];
  return { body: lines.join('\n'), packages: [], libraries: [] };
}
