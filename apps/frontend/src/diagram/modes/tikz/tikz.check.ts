// Self-check for the plain TikZ mode's code. Run:
// npx esbuild apps/frontend/src/diagram/modes/tikz/tikz.check.ts --bundle --platform=node --log-level=warning | node
import { fletcherCode } from '../fletcher/code';
import { FLETCHER_SHAPES, connect, copyTikz, corners, dividersOf, middleOf, moveBoxes, nextId, pasteTikz, removeTikz, tikzCode, tikzIsNewer } from './code';
import type { Box, Link, Shape, TikzModel } from './code';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const start: Box = { id: 'n1', shape: 'rounded', x: 0, y: 0, w: 8, h: 4, text: 'Start' };
const check: Box = { id: 'n2', shape: 'diamond', x: 0, y: 8, w: 8, h: 6, text: 'Ready?', fill: '#ffcc00', dash: 'dashed' };
const done: Box = { id: 'n3', shape: 'text', x: 16, y: 9, w: 6, h: 4, text: 'Two\nlines', stroke: '#ff0000' };
const sum: Box = { id: 'n4', shape: 'maths', x: 16, y: 0, w: 6, h: 2, text: '\\sum_i x_i' };
const down: Link = { id: 'e1', from: 'n1', to: 'n2', fromSide: 'b', toSide: 't', route: 'straight', heads: 'end' };
const yes: Link = { id: 'e2', from: 'n2', to: 'n3', fromSide: 'r', toSide: 'l', route: 'angled', heads: 'end', label: 'yes', width: 0.8 };
const back: Link = { id: 'e3', from: 'n3', to: 'n4', fromSide: 't', toSide: 'b', route: 'curved', heads: 'both', stroke: '#0000ff' };
const model: TikzModel = { boxes: [start, check, done, sum], links: [down, yes, back] };

const { body, packages, libraries } = tikzCode(model);
eq(packages, ['tikz'], 'packages');
eq(libraries, ['shapes.geometric', 'arrows.meta', 'positioning'], 'libraries');
eq(body.split('\n'), [
  '\\begin{tikzpicture}',
  '\\node[draw, rectangle, rounded corners, minimum width=2cm, minimum height=1cm, align=center] (n1) at (1,-0.5) {Start};',
  '\\node[draw, diamond, aspect=1.333, fill={rgb,255:red,255;green,204;blue,0}, dashed, minimum width=2cm, minimum height=1.5cm, align=center] (n2) at (1,-2.75) {Ready?};',
  '\\node[text={rgb,255:red,255;green,0;blue,0}, align=center] (n3) at (4.75,-2.75) {Two \\\\ lines};',
  '\\node[align=center] (n4) at (4.75,-0.25) {$\\sum_i x_i$};',
  '\\draw[-{Stealth}] (n1.south) -- (n2.north);',
  // level, so the two corners are one point: the middle of the route is there
  '\\draw[-{Stealth}, line width=0.8pt] (n2.east) -- node[pos=1, fill=white, inner sep=2pt] {yes} (3,-2.75) -- (n3.west);',
  '\\draw[{Stealth}-{Stealth}, draw={rgb,255:red,0;green,0;blue,255}] (n3.north) to[out=90, in=270] (n4.south);',
  '\\end{tikzpicture}',
  ''
], 'picture');

// corners: one when the arrow turns once, two halfway when it leaves and arrives along the same axis
eq(corners({ ...yes, fromSide: 'r', toSide: 't' }, check, done), [[19, 11]], 'east to north turns once');
eq(corners({ ...yes, fromSide: 'b', toSide: 'l' }, check, done), [[4, 11]], 'south to west turns once');
eq(corners({ ...yes, fromSide: 'r', toSide: 'r' }, check, done), [[24, 11], [24, 11]], 'east to east goes out past both');
eq(middleOf([[0, 0], [2, 0], [2, 6], [4, 6]]), { leg: 1, pos: 0.5 }, 'middle of the middle leg');
eq(middleOf([[0, 0], [8, 0], [8, 2]]), { leg: 0, pos: 0.625 }, 'middle on the long first leg');
eq(middleOf([[1, 1], [1, 1]]), { leg: 0, pos: 0.5 }, 'no length at all');

eq(tikzCode({ boxes: [{ id: 'n1', shape: 'circle', x: -4, y: -4, w: 5, h: 5, text: '' }], links: [] }).body.split('\n')[1],
  '\\node[draw, circle, minimum size=1.25cm, align=center] (n1) at (-0.375,0.375) {};', 'circle, above and left of the origin');
eq(tikzCode({ boxes: [start], links: [{ ...down, to: 'gone' }] }).body.split('\n').length, 4, 'an arrow to a missing box is left out');

// copy, paste, delete
eq(nextId('n', ['n1', 'n7', 'e9', 'x']), 'n8', 'next id');
const clip = copyTikz(model, ['n2', 'n3']);
eq([clip.boxes.map((b) => b.id), clip.links.map((l) => l.id)], [['n2', 'n3'], ['e2']], 'copy keeps the arrows inside the selection');
const pasted = pasteTikz(model, JSON.parse(JSON.stringify(clip)));
eq(pasted.ids, ['n5', 'n6', 'e4'], 'pasted ids');
eq(pasted.model.links.find((l) => l.id === 'e4'), { ...yes, id: 'e4', from: 'n5', to: 'n6' }, 'the pasted arrow joins the pasted boxes');
eq([pasted.model.boxes[4].x, pasted.model.boxes[4].y], [4, 12], 'pasted 1 cm down and right');
eq(pasteTikz(model, null).ids, [], 'nothing to paste');
const left = removeTikz(model, ['n2', 'e3']);
eq([left.boxes.map((b) => b.id), left.links.map((l) => l.id)], [['n1', 'n3', 'n4'], []], 'deleting a box takes its arrows');

// the Typst canvas offers only what fletcher writes: each such shape becomes a node of one of fletcher's shapes
for (const shape of FLETCHER_SHAPES) {
  const body = fletcherCode({ boxes: [{ ...start, shape }], links: [] }).body;
  eq(/node\(\(.*shape: fletcher\.shapes\.(rect|circle|ellipse|diamond|parallelogram|cylinder|trapezium),/.test(body), true, `fletcher writes a ${shape}`);
}
eq(['document', 'stack'].some((s) => FLETCHER_SHAPES.includes(s as Shape)), false, 'the document and the stack are TikZ only');

// the automata, flowchart and model architecture shapes
const shapes: TikzModel = {
  boxes: [
    { id: 'c1', shape: 'container', x: -2, y: 14, w: 22, h: 12, text: 'Encoder', repeat: 'N' },
    { id: 'q0', shape: 'state', x: 0, y: 0, w: 5, h: 5, text: 'q_0', initial: 'l' },
    { id: 'q1', shape: 'accepting', x: 14, y: 0, w: 6, h: 5, text: 'q_1' },
    { id: 'd1', shape: 'cylinder', x: 26, y: 0, w: 6, h: 6, text: 'Data' },
    { id: 'd2', shape: 'document', x: 36, y: 0, w: 8, h: 5, text: 'Report' },
    { id: 'd3', shape: 'trapezium', x: 26, y: 10, w: 8, h: 4, text: 'Manual', wrap: true },
    { id: 'o1', shape: 'operator', x: 2, y: 17, w: 3, h: 3, text: '\\oplus' },
    { id: 's1', shape: 'stack', x: 12, y: 16, w: 3, h: 8, text: '$h$', cells: 4 }
  ],
  links: [
    { id: 'e1', from: 'q0', to: 'q1', fromSide: 'r', toSide: 'l', route: 'bend', heads: 'end', label: 'a' },
    { id: 'e2', from: 'q0', to: 'q0', fromSide: 't', toSide: 't', route: 'straight', heads: 'end', label: 'b' },
    { id: 'e3', from: 'q1', to: 'q1', fromSide: 'b', toSide: 'b', route: 'straight', heads: 'none' }
  ]
};
const drawn = tikzCode(shapes);
eq(drawn.libraries, ['shapes.geometric', 'arrows.meta', 'positioning', 'automata', 'shapes.symbols'], 'automata and shapes.symbols only when used');
eq(tikzCode({ boxes: [shapes.boxes[3]], links: [] }).libraries, ['shapes.geometric', 'arrows.meta', 'positioning'], 'a cylinder needs nothing new');
eq(drawn.packages, ['tikz'], '\\oplus is LaTeX’s own');
eq(tikzCode({ boxes: [{ ...shapes.boxes[0], repeat: '\\mathbb{N}' }], links: [] }).packages, ['tikz', 'amssymb'], 'a ×N in \\mathbb loads amssymb');
eq(drawn.body.split('\n').slice(1, -2), [
  // the container first, under the rest
  '\\node[draw, rectangle, rounded corners, minimum width=5.5cm, minimum height=3cm, label={[anchor=north west]north west:{Encoder}}, label={east:{$\\times N$}}, align=center] (c1) at (2.25,-5) {};',
  '\\node[draw, state, minimum size=1.25cm, initial, initial where=left, initial text=, align=center] (q0) at (0.625,-0.625) {$q_0$};',
  '\\node[draw, state, accepting, minimum size=1.25cm, align=center] (q1) at (4.25,-0.625) {$q_1$};',
  '\\node[draw, cylinder, shape border rotate=90, aspect=0.25, minimum width=1.5cm, minimum height=1.5cm, align=center] (d1) at (7.25,-0.75) {Data};',
  '\\node[draw, tape, tape bend top=none, minimum width=2cm, minimum height=1.25cm, align=center] (d2) at (10,-0.625) {Report};',
  '\\node[draw, trapezium, trapezium left angle=70, trapezium right angle=70, trapezium stretches=true, minimum width=2cm, minimum height=1cm, text width=1.75cm, align=center] (d3) at (7.5,-3) {Manual};',
  '\\node[draw, circle, inner sep=0pt, minimum size=0.75cm, align=center] (o1) at (0.875,-4.625) {$\\oplus$};',
  '\\node[draw, rectangle, minimum width=0.75cm, minimum height=2cm, label={below:{$h$}}, align=center] (s1) at (3.375,-5) {};',
  '\\draw (3,-4.5) -- (3.75,-4.5);',
  '\\draw (3,-5) -- (3.75,-5);',
  '\\draw (3,-5.5) -- (3.75,-5.5);',
  '\\draw[-{Stealth}] (q0) to[bend left=20] node[midway, fill=white, inner sep=2pt] {a} (q1);',
  '\\draw[-{Stealth}] (q0) to[out=105, in=75, looseness=8, min distance=5mm] node[midway, fill=white, inner sep=2pt] {b} (q0);',
  '\\draw (q1) to[out=285, in=255, looseness=8, min distance=5mm] (q1);'
], 'the new shapes, a bent arrow and loops');

// a drawing with any of them is version 2; one without is as before
eq(tikzIsNewer(model), false, 'the first drawing has nothing new');
eq(shapes.boxes.map((b) => tikzIsNewer({ boxes: [b], links: [] })), [true, true, true, true, true, true, true, true], 'each new shape');
eq(tikzIsNewer({ boxes: [{ ...start, wrap: true }], links: [] }), true, 'wrapped text');
eq(tikzIsNewer({ boxes: [start, check], links: [{ ...down, route: 'bend' }] }), true, 'a bent arrow');
eq(tikzIsNewer({ boxes: [start], links: [{ ...down, to: 'n1' }] }), true, 'a loop');

// a new arrow: a loop on its side, or a bent pair with the straight arrow going the other way
const looped = connect(model, 'n1', 'n1', 't', 'b');
eq(looped.links[3], { id: 'e4', from: 'n1', to: 'n1', fromSide: 't', toSide: 't', route: 'straight', heads: 'end' }, 'a loop keeps to one side');
const paired = connect(model, 'n2', 'n1', 't', 'b');
eq([paired.links[0].route, paired.links[3].route], ['bend', 'bend'], 'an arrow back makes a bent pair');
eq(connect({ ...model, links: [{ ...down, route: 'curved' }] }, 'n2', 'n1', 't', 'b').links.map((l) => l.route), ['curved', 'bend'], 'a curve chosen by hand stays');
eq(connect(model, 'n1', 'n3', 'r', 'l').links[3].route, 'straight', 'no pair, straight');

// moving a container takes the boxes in it along
const boxed = [shapes.boxes[0], { ...start, x: 2, y: 16 }, { ...done, x: 30, y: 30 }];
eq(moveBoxes(boxed, [{ id: 'c1', x: 0, y: 10 }]).map((b) => [b.id, b.x, b.y]), [['c1', 0, 10], ['n1', 4, 12], ['n3', 30, 30]], 'what’s inside moves with it');
eq(moveBoxes(boxed, [{ id: 'c1', x: 0, y: 10 }, { id: 'n1', x: 9, y: 9 }]).map((b) => [b.x, b.y]), [[0, 10], [9, 9], [30, 30]], 'a box dragged with it goes where it’s dragged');
eq(moveBoxes(boxed, [{ id: 'n1', x: 5, y: 5 }])[0], boxed[0], 'moving a box leaves its container');
eq(dividersOf({ ...shapes.boxes[7], cells: 1 }), [], 'one cell, no lines');

console.log('tikz.check: ok');
