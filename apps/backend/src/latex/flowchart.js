// The diagram composer's flowcharts and block diagrams written out: as plain TikZ and as fletcher (a Typst package), from
// the one model both modes draw on. Shared by the composer (apps/frontend/src/diagram/modes/tikz/code.ts and
// fletcher/code.ts import it) and the converter, which writes a drawing again in the other language. Pure; checked in
// tikz.check.ts and fletcher.check.ts. One grid unit is 0.25 cm, y down on the canvas and up in TikZ and fletcher.

import { typstMarkup as content } from './floats.js';

// ─── small pieces the TikZ modes' code writers share ───

/** A length or coordinate for TikZ: at most three decimals, no trailing zeros, never "-0". */
export function num(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}

/** amssymb when the maths uses its letters (\mathbb, \mathfrak), which LaTeX alone doesn't have. */
export const mathsPackages = (texts) => (texts.some((t) => /\\math(?:bb|frak)\b/.test(t)) ? ['amssymb'] : []);

/** '#rrggbb' as an xcolor colour written in place, so the picture needs no \definecolor. */
export function latexColour(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
  return `{rgb,255:red,${r};green,${g};blue,${b}}`;
}

/** The standalone document a TikZ diagram compiles as, and \includestandalone takes the picture from. */
export function tikzDocument({ body, packages, libraries }) {
  return [
    // Crop the whole picture; the tikz option only captures tikzpicture, missing wrapper environments such as circuitikz.
    '\\documentclass[border=2pt]{standalone}',
    ...packages.map((name) => `\\usepackage{${name}}`),
    ...(libraries.length ? [`\\usetikzlibrary{${libraries.join(',')}}`] : []),
    '\\begin{document}',
    body.trimEnd(),
    '\\end{document}',
    ''
  ].join('\n');
}

// ─── the shapes and where arrows meet them ───

/** Shapes whose text is maths, written without $. */
export const MATHS_SHAPES = ['maths', 'state', 'accepting', 'operator'];
/** Shapes drawn as their text alone, without a box. */
export const plainShape = (shape) => shape === 'text' || shape === 'maths';
/** Shapes that can have a start arrow. */
export const stateShape = (shape) => shape === 'state' || shape === 'accepting';

export const CM_PER_UNIT = 0.25;
const ANCHOR = { t: 'north', r: 'east', b: 'south', l: 'west' };
const ANGLE = { r: 0, t: 90, l: 180, b: 270 };
const DIRECTION = { r: [1, 0], t: [0, -1], l: [-1, 0], b: [0, 1] };
const horizontal = (side) => side === 'r' || side === 'l';

/** Where a side's anchor is, in grid units. */
export function anchorOf(box, side) {
  const [dx, dy] = DIRECTION[side];
  return [box.x + (box.w * (1 + dx)) / 2, box.y + (box.h * (1 + dy)) / 2];
}

/**
 * The corners a right-angled arrow turns at, in grid units: one when it leaves along one axis and arrives along the
 * other, two (halfway between, or out past both boxes when both sides face the same way) when it leaves and arrives
 * along the same one. ponytail: the route can cross the boxes it joins; route round them if that bites.
 */
export function corners(link, from, to) {
  const [ax, ay] = anchorOf(from, link.fromSide);
  const [bx, by] = anchorOf(to, link.toSide);
  if (horizontal(link.fromSide) !== horizontal(link.toSide)) return horizontal(link.fromSide) ? [[bx, ay]] : [[ax, by]];
  if (horizontal(link.fromSide)) {
    const mx = link.fromSide === link.toSide ? (link.fromSide === 'r' ? Math.max(ax, bx) + 2 : Math.min(ax, bx) - 2) : (ax + bx) / 2;
    return [[mx, ay], [mx, by]];
  }
  const my = link.fromSide === link.toSide ? (link.fromSide === 'b' ? Math.max(ay, by) + 2 : Math.min(ay, by) - 2) : (ay + by) / 2;
  return [[ax, my], [bx, my]];
}

/** What a straight or right-angled arrow goes through, in grid units, anchor to anchor, without a corner twice. */
export function pathPoints(link, from, to) {
  const a = anchorOf(from, link.fromSide);
  const b = anchorOf(to, link.toSide);
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];
  const points = [a];
  for (const corner of link.route === 'angled' ? corners(link, from, to) : []) {
    if (!same(corner, points[points.length - 1]) && !same(corner, b)) points.push(corner);
  }
  return [...points, b];
}

/** The control points of a curved arrow, as TikZ's to[out=…, in=…] places them (looseness 1). */
export function curveControls(link, from, to) {
  const [ax, ay] = anchorOf(from, link.fromSide);
  const [bx, by] = anchorOf(to, link.toSide);
  const reach = 0.3915 * Math.hypot(bx - ax, by - ay);
  const [ox, oy] = DIRECTION[link.fromSide];
  const [ix, iy] = DIRECTION[link.toSide];
  return [
    [ax + ox * reach, ay + oy * reach],
    [bx + ix * reach, by + iy * reach]
  ];
}

/** Where along a polyline its middle falls: the leg it's on and how far along that leg (0 to 1). */
export function middleOf(points) {
  const legs = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
  let left = legs.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < legs.length; i += 1) {
    if (left <= legs[i] || i === legs.length - 1) return { leg: i, pos: legs[i] ? Math.min(1, left / legs[i]) : 0.5 };
    left -= legs[i];
  }
  return { leg: 0, pos: 0.5 };
}

/** Shapes as wide as they are tall. */
export const ROUND_SHAPES = ['circle', 'state', 'accepting', 'operator'];
/** The angles a loop on each side leaves and comes back at, as TikZ's loop above and the like have them. */
export const LOOP = { t: [105, 75], r: [15, -15], b: [285, 255], l: [195, 165] };
/** How far a bent arrow turns from the straight line, in degrees. */
export const BEND = 20;
/** Where a stack's lines between cells are, as y in grid units. */
export function dividersOf(box) {
  const cells = Math.max(1, Math.round(box.cells ?? 4));
  return Array.from({ length: cells - 1 }, (_, i) => box.y + (box.h * (i + 1)) / cells);
}
/** Containers first, so the boxes in them are drawn over them. */
export const drawingOrder = (boxes) => [...boxes.filter((b) => b.shape === 'container'), ...boxes.filter((b) => b.shape !== 'container')];

// ─── TikZ ───

const at = (x, y) => `(${num(x * CM_PER_UNIT)},${num(-y * CM_PER_UNIT)})`;

function lineOptions(line, colourKey = 'draw') {
  return [line.stroke && `${colourKey}=${latexColour(line.stroke)}`, line.dash && line.dash !== 'solid' && line.dash, line.width && `line width=${num(line.width)}pt`].filter(Boolean);
}

const TIKZ_SHAPE = {
  rectangle: 'rectangle',
  rounded: 'rectangle, rounded corners',
  circle: 'circle',
  ellipse: 'ellipse',
  diamond: 'diamond',
  parallelogram: 'trapezium, trapezium left angle=70, trapezium right angle=110, trapezium stretches=true',
  text: '',
  maths: '',
  state: 'state',
  accepting: 'state, accepting',
  cylinder: 'cylinder, shape border rotate=90, aspect=0.25',
  document: 'tape, tape bend top=none',
  trapezium: 'trapezium, trapezium left angle=70, trapezium right angle=70, trapezium stretches=true',
  operator: 'circle, inner sep=0pt',
  stack: 'rectangle',
  container: 'rectangle, rounded corners'
};

const COMPASS = { t: 'above', r: 'right', b: 'below', l: 'left' };

function boxLines(box) {
  const plain = plainShape(box.shape);
  const size = ROUND_SHAPES.includes(box.shape)
    ? [`minimum size=${num(Math.min(box.w, box.h) * CM_PER_UNIT)}cm`]
    : plain ? [] : [`minimum width=${num(box.w * CM_PER_UNIT)}cm`, `minimum height=${num(box.h * CM_PER_UNIT)}cm`];
  const title = box.text.trim();
  const options = [
    // a label's colour is its text's; a box's is its border's
    ...(plain ? [] : [box.stroke ? `draw=${latexColour(box.stroke)}` : 'draw']),
    TIKZ_SHAPE[box.shape],
    box.shape === 'diamond' && `aspect=${num(box.w / box.h)}`,
    box.fill && `fill=${latexColour(box.fill)}`,
    ...(plain ? lineOptions({ stroke: box.stroke }, 'text') : lineOptions({ dash: box.dash, width: box.width })),
    ...size,
    stateShape(box.shape) && box.initial && `initial, initial where=${COMPASS[box.initial]}, initial text=`,
    // a container's title sits inside its top-left corner and its ×N outside on the right; a stack's caption below it
    box.shape === 'container' && title && `label={[anchor=north west]north west:{${title}}}`,
    box.shape === 'container' && box.repeat?.trim() && `label={east:{$\\times ${box.repeat.trim()}$}}`,
    box.shape === 'stack' && title && `label={below:{${title}}}`,
    box.wrap && !plain && `text width=${num(Math.max(0.25, box.w * CM_PER_UNIT - 0.25))}cm`,
    'align=center'
  ].filter(Boolean);
  const lines = box.text.split('\n').map((l) => l.trim());
  const text = box.shape === 'container' || box.shape === 'stack' ? '' : MATHS_SHAPES.includes(box.shape) ? (title ? `$${title}$` : '') : lines.join(' \\\\ ').trim();
  const node = `\\node[${options.join(', ')}] (${box.id}) at ${at(box.x + box.w / 2, box.y + box.h / 2)} {${text}};`;
  if (box.shape !== 'stack') return [node];
  const line = lineOptions(box);
  return [node, ...dividersOf(box).map((y) => `\\draw${line.length ? `[${line.join(', ')}]` : ''} ${at(box.x, y)} -- ${at(box.x + box.w, y)};`)];
}

const TIKZ_HEADS = { none: '', end: '-{Stealth}', start: '{Stealth}-', both: '{Stealth}-{Stealth}' };

function linkLine(link, boxes) {
  const from = boxes.get(link.from);
  const to = boxes.get(link.to);
  if (!from || !to) return '';
  const options = [TIKZ_HEADS[link.heads], ...lineOptions(link)].filter(Boolean);
  const start = `(${from.id}.${ANCHOR[link.fromSide]})`;
  const end = `(${to.id}.${ANCHOR[link.toSide]})`;
  const label = (pos) => (link.label?.trim() ? ` node[${pos}, fill=white, inner sep=2pt] {${link.label.trim()}}` : '');
  let path;
  if (from === to) {
    // out and back on its side as TikZ's loop above and the like do, without their every loop arrow
    const [out, back] = LOOP[link.fromSide];
    path = `(${from.id}) to[out=${out}, in=${back}, looseness=8, min distance=5mm]${label('midway')} (${to.id})`;
  } else if (link.route === 'bend') {
    // from the centres, so the two arrows of a pair meet their boxes apart
    path = `(${from.id}) to[bend left=${BEND}]${label('midway')} (${to.id})`;
  } else if (link.route === 'curved') {
    path = `${start} to[out=${ANGLE[link.fromSide]}, in=${ANGLE[link.toSide]}]${label('midway')} ${end}`;
  } else {
    const points = pathPoints(link, from, to);
    const middle = middleOf(points);
    const targets = [...points.slice(1, -1).map(([x, y]) => at(x, y)), end];
    path = start + targets.map((target, i) => ` --${i === middle.leg ? label(middle.pos === 0.5 ? 'midway' : `pos=${num(middle.pos)}`) : ''} ${target}`).join('');
  }
  return `\\draw${options.length ? `[${options.join(', ')}]` : ''} ${path};`;
}

/** A flowchart as a tikzpicture, with the packages and TikZ libraries the document around it loads. */
export function tikzCode(model) {
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const body = ['\\begin{tikzpicture}', ...drawingOrder(model.boxes).flatMap(boxLines), ...model.links.map((l) => linkLine(l, boxes)).filter(Boolean), '\\end{tikzpicture}'];
  const texts = [...model.boxes.flatMap((b) => [b.text, b.repeat ?? '']), ...model.links.map((l) => l.label ?? '')];
  const uses = (...shapes) => model.boxes.some((b) => shapes.includes(b.shape));
  // positioning isn't used by the picture itself, but loaded for code added by hand in the TikZ way (right=of n1); the
  // others only when a shape needs them, so a drawing without those shapes asks the document for nothing new
  const libraries = ['shapes.geometric', 'arrows.meta', 'positioning', ...(uses('state', 'accepting') ? ['automata'] : []), ...(uses('document') ? ['shapes.symbols'] : [])];
  return { body: `${body.join('\n')}\n`, packages: ['tikz', ...mathsPackages(texts)], libraries };
}

// ─── fletcher ───

/** The newest fletcher each Typst version supports, from the package's typst.toml (compiler). */
const FLETCHER = [
  ['0.13.0', '0.5.8'],
  ['0.12.0', '0.5.5']
];

const atLeast = (version, minimum) => {
  const left = String(version || '0').split('.').map(Number);
  const right = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return true;
};

/** The fletcher version a Typst version can import; the built-in Typst's when nothing is pinned. */
export function fletcherFor(typstVersion) {
  if (!typstVersion) return FLETCHER[0][1];
  return FLETCHER.find(([minimum]) => atLeast(typstVersion, minimum))?.[1] ?? FLETCHER[FLETCHER.length - 1][1];
}

const FLETCHER_SHAPE = {
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
const LOOP_ANGLE = { t: 90, r: 0, b: -90, l: 180 };
const OUTWARD = { t: [0, 1], r: [1, 0], b: [0, -1], l: [-1, 0] };
const cm = (value) => num(value * CM_PER_UNIT) + 'cm';

/** A line's colour, thickness and dash (an edge's is in its marks) as a stroke, which fletcher lays over its default. */
function strokeOf(line, dash = true) {
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
function nodeCode(box, version) {
  const plain = plainShape(box.shape);
  const size = ROUND_SHAPES.includes(box.shape) ? Math.min(box.w, box.h) : 0;
  const width = size || box.w;
  const height = size || box.h;
  const container = box.shape === 'container';
  const options = [
    'shape: fletcher.shapes.' + (box.shape === 'cylinder' && !atLeast(version, '0.5.8') ? 'rect' : FLETCHER_SHAPE[box.shape]),
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

const FLETCHER_HEADS = { none: '', end: '>', start: '<', both: '<>' };

/** The line and marks shorthand fletcher reads: ->, <->, -->, <..>, and so on. */
const marksOf = (link) => {
  const line = link.dash === 'dashed' ? '--' : link.dash === 'dotted' ? '..' : '-';
  const heads = FLETCHER_HEADS[link.heads];
  return (heads.startsWith('<') ? '<' : '') + line + (heads.endsWith('>') ? '>' : '');
};

/** The edge between two boxes, with its label and route. */
function edgeCode(link, boxes) {
  const from = boxes.get(link.from);
  const to = boxes.get(link.to);
  if (!from || !to) return '';
  const loop = from === to;
  // a corner between boxes in line would sit on one of them, which fletcher refuses: straight there
  const centre = (box) => [cm(box.x + box.w / 2), cm(box.y + box.h / 2)];
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

/** A fletcher diagram as the Typst file a document includes. typstVersion picks the import line. */
export function fletcherCode(model, typstVersion = '') {
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
