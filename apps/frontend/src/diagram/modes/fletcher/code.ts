import type { DiagramCode } from '../../fileFormat';
import type { Box, Heads, Link, Shape, TikzModel } from '../tikz/code';
import { CM_PER_UNIT } from '../tikz/code';
import { num } from '../shared';

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

/** Typst content: ] # \ and $ escaped, and a line break made a space. */
const content = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/\\|\[|\]|#|\$/g, (m) => '\\' + m);

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

/** The node for a box: its centre in cm, its text or maths, and its shape and size. */
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
    !plain && box.stroke && 'stroke: rgb("' + box.stroke + '")',
    !plain && box.fill && 'fill: rgb("' + box.fill + '")',
    'name: <' + box.id + '>'
  ].filter(Boolean);
  const label = box.shape === 'maths' ? (box.text.trim() ? '[$' + box.text.trim() + '$]' : '[]') : '[' + content(box.text) + ']';
  return 'node((' + num((box.x + box.w / 2) * CM_PER_UNIT) + 'cm, ' + num((box.y + box.h / 2) * CM_PER_UNIT) + 'cm), ' + label + ', ' + options.join(', ') + ')';
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
    link.stroke && 'stroke: rgb("' + link.stroke + '")'
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
