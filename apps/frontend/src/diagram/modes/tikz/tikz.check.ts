// Self-check for the plain TikZ mode's code. Run:
// npx esbuild apps/frontend/src/diagram/modes/tikz/tikz.check.ts --bundle --platform=node --log-level=warning | node
import { fletcherCode } from '../fletcher/code';
import { FLETCHER_SHAPES, NEW, along, bandArea, connect, copyTikz, corners, dividersOf, facing, middleOf, moveBoxes, nextId, pasteTikz, removeTikz, resized, tikzCode, tikzIsNewer, tikzNeedsVersion5, turnTikz } from './code';
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

// the Typst canvas offers only what fletcher writes: each such shape becomes a node of one of fletcher's shapes, or a
// polygon of its own drawn with fletcher's CeTZ
for (const shape of FLETCHER_SHAPES) {
  const body = fletcherCode({ boxes: [{ ...start, shape }], links: [] }).body;
  eq(/node\(\(.*shape: (fletcher\.shapes\.(rect|circle|ellipse|diamond|parallelogram|cylinder|trapezium|pill)|\(node, extrude\) => fletcher\.cetz\.draw\.group\(fletcher\.cetz\.draw\.line\(.*, close: true\)\)),/.test(body), true, `fletcher writes a ${shape}`);
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

// texts with LaTeX's special characters compile: % & # _ escaped, unless they are already, outside $…$ maths
const special = tikzCode({
  boxes: [{ ...start, text: '50% done\nR&D #1 a_b $x_1$ 10\\%' }, { ...shapes.boxes[0], text: 'Q&A' }, { ...sum, id: 'n5', text: 'a_1' }],
  links: [{ ...down, from: 'n1', to: 'c1', label: '5% & $y_2$' }]
}).body;
eq(special.includes('{50\\% done \\\\ R\\&D \\#1 a\\_b $x_1$ 10\\%}'), true, 'box text escaped, its maths kept');
eq(special.includes('north west:{Q\\&A}'), true, 'a container title escaped');
eq(special.includes('{$a_1$}'), true, 'a maths box as it is');
eq(special.includes('{5\\% \\& $y_2$}'), true, 'a label escaped');

// new boxes are even both ways, so a box's centre is on the grid and arrows between boxes in line are straight
eq(Object.entries(NEW).filter(([, [w, h]]) => w % 2 || h % 2), [], 'every new size even');
// resizing: in steps of 2; from the left or top, the opposite edge stays put and the move isn't lost
eq(resized(start, 9.2, 4), { ...start, w: 10 }, 'from the right, wider');
eq(resized(start, 12, 6, { x: -4, y: -2 }), { ...start, x: -4, y: -2, w: 12, h: 6 }, 'from the top-left, bigger and moved');
eq(resized({ ...start, w: 5 }, 7, 4, { x: -2, y: 0 }), { ...start, x: -3, w: 8 }, 'an odd box from the left: its right edge kept');

// 2.5: block diagrams, the new flowchart shapes and a swimlane, each drawn as it writes
const block: TikzModel = {
  boxes: [
    { id: 't1', shape: 'terminal', x: 0, y: 0, w: 8, h: 4, text: 'Start' },
    { id: 's1', shape: 'operator', x: 12, y: 0, w: 4, h: 4, text: '' },
    { id: 'g1', shape: 'gain', x: 20, y: -1, w: 6, h: 6, text: 'K' },
    { id: 'p1', shape: 'takeoff', x: 30, y: 1, w: 2, h: 2, text: '' },
    { id: 'g2', shape: 'gain', x: 20, y: 10, w: 6, h: 6, text: 'H', dir: 'l', stroke: '#0000ff' },
    { id: 'm1', shape: 'manualInput', x: 0, y: 10, w: 8, h: 4, text: 'Type it', fill: '#eeeeee' },
    { id: 'o1', shape: 'offPage', x: 36, y: 0, w: 4, h: 4, text: 'A' }
  ],
  links: [
    { id: 'e1', from: 't1', to: 's1', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end', label: '$r$', labelSide: 'left', labelPos: 0.3, sign: '+' },
    { id: 'e2', from: 's1', to: 'g1', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end', label: 'e', labelSide: 'right' },
    { id: 'e3', from: 'g1', to: 'p1', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'none' },
    { id: 'e4', from: 'p1', to: 'g2', fromSide: 'b', toSide: 'r', route: 'angled', heads: 'end' },
    { id: 'e5', from: 'g2', to: 's1', fromSide: 'l', toSide: 'b', route: 'angled', heads: 'end', sign: '-', label: 'y', labelSide: 'on', labelPos: 0.2 },
    { id: 'e6', from: 'p1', to: 'o1', fromSide: 'r', toSide: 'l', route: 'curved', heads: 'end', label: 'z', labelPos: 0.25, sign: '+' }
  ]
};
eq(tikzCode(block).body.split('\n').slice(1, -2), [
  '\\node[draw, rectangle, rounded corners=0.5cm, minimum width=2cm, minimum height=1cm, align=center] (t1) at (1,-0.5) {Start};',
  '\\node[draw, circle, inner sep=0pt, minimum size=1cm, align=center] (s1) at (3.5,-0.5) {};',
  // a polygon's outline, then its node with the text over it
  '\\draw (5,0.25) -- (6.5,-0.5) -- (5,-1.25) -- cycle;',
  '\\node[rectangle, minimum width=1.5cm, minimum height=1.5cm, align=center] (g1) at (5.75,-0.5) {$K$};',
  '\\node[fill, circle, inner sep=0pt, minimum size=1.2mm, align=center] (p1) at (7.75,-0.5) {};',
  '\\draw[draw={rgb,255:red,0;green,0;blue,255}] (6.5,-2.5) -- (5,-3.25) -- (6.5,-4) -- cycle;',
  '\\node[rectangle, minimum width=1.5cm, minimum height=1.5cm, align=center] (g2) at (5.75,-3.25) {$H$};',
  '\\draw[fill={rgb,255:red,238;green,238;blue,238}] (0,-2.75) -- (2,-2.5) -- (2,-3.5) -- (0,-3.5) -- cycle;',
  '\\node[rectangle, minimum width=2cm, minimum height=1cm, align=center] (m1) at (1,-3) {Type it};',
  '\\draw (9,0) -- (10,0) -- (10,-0.6) -- (9.5,-1) -- (9,-0.6) -- cycle;',
  '\\node[rectangle, minimum width=1cm, minimum height=1cm, align=center] (o1) at (9.5,-0.5) {A};',
  // beside the line on its left, 30% along, and a + on the left near the end
  '\\draw[-{Stealth}] (t1.east) -- node[pos=0.3, auto] {$r$} node[pos=0.85, auto] {$+$} (s1.west);',
  '\\draw[-{Stealth}] (s1.east) -- node[midway, auto, swap] {e} (g1.west);',
  '\\draw (g1.east) -- (p1.west);',
  // a takeoff point's anchors are its centre, so the route's corner is straight under it
  '\\draw[-{Stealth}] (p1.south) -- (7.75,-3.25) -- (g2.east);',
  // each mark on the leg its place along the route falls on
  '\\draw[-{Stealth}] (g2.west) -- node[midway, fill=white, inner sep=2pt] {y} (3.5,-3.25) -- node[pos=0.75, auto] {$-$} (s1.south);',
  '\\draw[-{Stealth}] (p1.east) to[out=0, in=180] node[pos=0.25, fill=white, inner sep=2pt] {z} node[pos=0.85, auto] {$+$} (o1.west);'
], 'block diagram parts, new shapes, label sides and places, and signs');
eq(tikzCode(block).libraries, ['shapes.geometric', 'arrows.meta', 'positioning'], 'the new shapes need no new library');
eq(along([[0, 0], [8, 0], [8, 2]], 0.9), { leg: 1, pos: 0.5 }, 'nine tenths of the way along');
eq(tikzCode({ boxes: [{ ...block.boxes[0], w: 4, h: 8 }], links: [] }).body.includes('rounded corners=0.5cm, minimum width=1cm, minimum height=2cm'), true, 'a tall terminal rounds by half its width');

const lanes: TikzModel = {
  boxes: [
    { id: 'l1', shape: 'swimlane', x: 0, y: 0, w: 16, h: 24, text: 'Student' },
    { id: 'l2', shape: 'swimlane', x: 16, y: 0, w: 16, h: 24, text: 'R&D', dir: 'l', fill: '#eef4ff', dash: 'dashed' },
    { id: 'a', shape: 'rectangle', x: 4, y: 6, w: 8, h: 4, text: 'Submit' }
  ],
  links: []
};
eq(tikzCode(lanes).body.split('\n').slice(1, -2), [
  '\\node[draw, rectangle, minimum width=4cm, minimum height=6cm, align=center] (l1) at (2,-3) {};',
  '\\draw (0,-0.75) -- (4,-0.75);',
  '\\node[align=center] at (2,-0.375) {Student};',
  '\\node[draw, rectangle, fill={rgb,255:red,238;green,244;blue,255}, dashed, minimum width=4cm, minimum height=6cm, align=center] (l2) at (6,-3) {};',
  '\\draw[dashed] (4.75,0) -- (4.75,-6);',
  '\\node[rotate=90, align=center] at (4.375,-3) {R\\&D};',
  '\\node[draw, rectangle, minimum width=2cm, minimum height=1cm, align=center] (a) at (2,-2) {Submit};'
], 'swimlanes, a title band on top and one on the left, drawn first');
eq(moveBoxes(lanes.boxes, [{ id: 'l1', x: 2, y: 0 }])[2].x, 6, 'moving a swimlane takes its boxes along');

// turning and mirroring a selection about its middle
const pair: TikzModel = {
  boxes: [
    { id: 'a', shape: 'rectangle', x: 0, y: 0, w: 8, h: 4, text: 'A' },
    { id: 'b', shape: 'gain', x: 0, y: 8, w: 6, h: 4, text: 'K' },
    { id: 'c', shape: 'rectangle', x: 20, y: 0, w: 8, h: 4, text: 'C' }
  ],
  links: [
    { id: 'e1', from: 'a', to: 'b', fromSide: 'b', toSide: 't', route: 'straight', heads: 'end', label: 'x', labelSide: 'left' },
    { id: 'e2', from: 'b', to: 'c', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end' },
    { id: 'e3', from: 'a', to: 'a', fromSide: 't', toSide: 't', route: 'straight', heads: 'end' }
  ]
};
const right = turnTikz(pair, ['a', 'b'], 'right');
// the two take 8 × 12 about (4, 6): a's centre (4, 2) goes to (8, 6), b's (3, 10) to (0, 5); b, a gain, turns 4 × 6
eq(right.boxes.map((b) => [b.id, b.x, b.y, b.w, b.h, b.dir]), [['a', 4, 4, 8, 4, undefined], ['b', -2, 2, 4, 6, 'b'], ['c', 20, 0, 8, 4, undefined]], 'a quarter turn to the right');
eq(right.links.map((l) => [l.fromSide, l.toSide, l.labelSide]), [['l', 'r', 'left'], ['b', 'l', undefined], ['r', 'r', undefined]], 'the sides go round, the end outside the selection keeps its side');
// a turn back lays them out as they were, though the middle of the space they take has moved, so they may sit apart
const turnedBack = turnTikz(right, ['a', 'b'], 'left').boxes;
eq([turnedBack[1].x - turnedBack[0].x, turnedBack[1].y - turnedBack[0].y, turnedBack[1].w, turnedBack[1].h, turnedBack[1].dir], [0, 8, 6, 4, undefined], 'a turn back lays them out as they were');
const across = turnTikz(pair, ['a', 'b'], 'across');
eq([across.boxes[1].x, across.boxes[1].dir, across.links[0].labelSide, across.links[1].fromSide], [2, 'l', 'right', 'l'], 'a mirror: the gain points left, the label beside goes to the other side');
eq(turnTikz(pair, ['a'], 'over').links[2], { ...pair.links[2], fromSide: 'b', toSide: 'b' }, 'a loop goes round with its box');
eq(turnTikz(pair, ['e1'], 'right'), pair, 'no boxes, nothing turns');
eq(turnTikz({ boxes: [lanes.boxes[0]], links: [] }, ['l1'], 'left').boxes[0].dir, 'l', 'a swimlane’s band goes round');

// version 5: a drawing with any of 2.5's additions; one without has nothing new
eq(tikzNeedsVersion5(model), false, 'the first drawing needs no version 5');
eq(tikzNeedsVersion5(shapes), false, 'nor do the shapes from before 2.5');
eq(block.boxes.map((b) => tikzNeedsVersion5({ boxes: [b], links: [] })), [true, false, true, true, true, true, true], 'each new shape (the operator circle is older)');
eq([{ labelSide: 'on' }, { labelPos: 0.5 }, { sign: '-' }].map((x) => tikzNeedsVersion5({ boxes: [start, check], links: [{ ...down, ...x } as Link] })), [true, true, true], 'a label’s side or place, a sign');
eq(tikzNeedsVersion5(lanes), true, 'a swimlane');

// Connect (the W tool): the arrow joins the sides that face each other, and a shape clicked twice gets a loop above it
eq(facing(start, check), ['b', 't'], 'below, down to the top');
eq(facing(check, start), ['t', 'b'], 'above, up to the bottom');
eq(facing(check, done), ['r', 'l'], 'to the right, across');
eq(facing(done, check), ['l', 'r'], 'to the left, across');
eq(facing(start, start), ['t', 't'], 'itself, a loop above');
const joined = connect(model, 'n2', 'n3', ...facing(check, done));
eq(tikzCode(joined).body.includes('\\draw[-{Stealth}] (n2.east) -- (n3.west);'), true, 'a connected arrow writes as one dragged between those sides');

// a swimlane is picked up by its title band as well as its outline: the band on the side it is on, 3 units deep
const lane: Box = { id: 'l1', shape: 'swimlane', x: 4, y: 2, w: 16, h: 24, text: 'Shop' };
eq([undefined, 'b', 'l', 'r'].map((dir) => bandArea({ ...lane, dir } as Box)), [[0, 0, 16, 3], [0, 21, 16, 3], [0, 0, 3, 24], [13, 0, 3, 24]], 'a swimlane’s title band');
eq(bandArea({ ...lane, w: 2 }), [0, 0, 2, 2], 'no deeper than a small lane');

console.log('tikz.check: ok');
