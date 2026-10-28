// Self-check for the plain TikZ mode's code. Run:
// npx esbuild apps/frontend/src/diagram/modes/tikz/tikz.check.ts --bundle --platform=node --log-level=warning | node
import { fletcherCode } from '../fletcher/code';
import { FLETCHER_SHAPES, copyTikz, corners, middleOf, nextId, pasteTikz, removeTikz, tikzCode } from './code';
import type { Box, Link, TikzModel } from './code';

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
  eq(/node\(\(.*shape: fletcher\.shapes\.(rect|circle|ellipse|diamond|parallelogram),/.test(body), true, `fletcher writes a ${shape}`);
}

console.log('tikz.check: ok');
