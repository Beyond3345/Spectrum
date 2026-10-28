// Self-check for the fletcher code the Typst mode writes. Run:
// npx esbuild apps/frontend/src/diagram/modes/fletcher/fletcher.check.ts --bundle --platform=node --log-level=warning | node
import { fletcherCode, fletcherFor } from './code.ts';
import type { Box, Link, TikzModel } from '../tikz/code.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(what + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
};
const has = (body: string, line: string, what: string) => eq(body.includes(line), true, what + ': ' + line);

eq([fletcherFor(''), fletcherFor('0.15.1'), fletcherFor('0.14.2'), fletcherFor('0.13.1'), fletcherFor('0.12.0')], ['0.5.8', '0.5.8', '0.5.8', '0.5.8', '0.5.5'], 'the fletcher each Typst version can load');

const box = (over: Partial<Box> & Pick<Box, 'id'>): Box => ({ shape: 'rectangle', x: 0, y: 0, w: 8, h: 4, text: '', ...over });
const link = (over: Partial<Link> & Pick<Link, 'id' | 'from' | 'to'>): Link => ({ fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end', ...over });
const model: TikzModel = {
  boxes: [
    box({ id: 'n1', text: 'Start here' }),
    box({ id: 'n2', shape: 'rounded', x: 12, y: 4, text: 'A [bracket] #tag \\ $x$', fill: '#eeeeee' }),
    box({ id: 'n3', shape: 'circle', x: 0, y: 8, w: 6, h: 6, text: 'c' }),
    box({ id: 'n4', shape: 'diamond', x: 8, y: 8, w: 10, h: 6, text: 'd' }),
    box({ id: 'n5', shape: 'parallelogram', x: 20, y: 8, w: 10, h: 5, text: 'p' }),
    box({ id: 'n6', shape: 'text', x: 0, y: 16, w: 8, h: 4, text: 'label' }),
    box({ id: 'n7', shape: 'maths', x: 12, y: 16, w: 8, h: 4, text: 'x + y' })
  ],
  links: [
    link({ id: 'e1', from: 'n1', to: 'n2', label: 'yes' }),
    link({ id: 'e2', from: 'n1', to: 'n2', route: 'curved', heads: 'both' }),
    link({ id: 'e3', from: 'n2', to: 'n3', fromSide: 'b', toSide: 't', route: 'angled', heads: 'start', dash: 'dashed' }),
    link({ id: 'e4', from: 'n3', to: 'n4', heads: 'none', dash: 'dotted', label: 'no' })
  ]
};
const body = fletcherCode(model, '0.15.1').body;
has(body, '#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge', 'the import line');
has(body, '#set page(width: auto, height: auto, margin: 4pt) if sys.inputs.at("spectrum-diagram", default: "") == "standalone"', 'the standalone page');
has(body, 'node((1cm, -0.5cm), [Start here], shape: fletcher.shapes.rect, width: 2cm, height: 1cm, name: <n1>),', 'a rectangle at its centre');
has(body, '[A \\[bracket\\] \\#tag \\\\ \\$x\\$], shape: fletcher.shapes.rect, corner-radius: 4pt, width: 2cm, height: 1cm, fill: rgb("#eeeeee")', 'a rounded, filled box with its text escaped');
has(body, 'shape: fletcher.shapes.circle, width: 1.5cm, height: 1.5cm', 'a circle is as wide as it is tall');
has(body, 'shape: fletcher.shapes.diamond, width: 2.5cm, height: 1.5cm', 'a diamond');
has(body, 'shape: fletcher.shapes.parallelogram, width: 2.5cm, height: 1.25cm', 'a parallelogram');
has(body, 'shape: fletcher.shapes.rect, width: 2cm, height: 1cm, stroke: none, fill: none, name: <n6>', 'a text label, no box');
has(body, '[$x + y$], shape: fletcher.shapes.rect', 'maths in dollars');
has(body, 'edge(<n1>, <n2>, "->", label: [yes]),', 'a straight arrow with a label');
has(body, 'edge(<n1>, <n2>, "<->", bend: 30deg),', 'a curved two-headed arrow');
has(body, 'edge(<n2>, <n3>, "<--", corner: right),', 'a dashed arrow that starts, at a corner');
has(body, 'edge(<n3>, <n4>, "..", label: [no]),', 'a dotted line with no heads');
// a box lower on the canvas is lower on the page: fletcher's lengths, like TikZ's, go up
has(body, 'node((0.75cm, -2.75cm), [c]', 'the second row below the first');
eq(fletcherCode(model, '0.12.0').body.startsWith('#import "@preview/fletcher:0.5.5"'), true, 'an older Typst gets an older fletcher');
eq(fletcherCode({ boxes: [], links: [] }, '').body.includes('  node-stroke: 0.4pt,'), true, 'no boxes still makes a diagram');
// the Inspector's line colour, thickness and dash, and a label's text colour
const styled = fletcherCode({
  boxes: [
    box({ id: 's1', stroke: '#cc0000', width: 1.2, dash: 'dashed', text: 'a' }),
    box({ id: 's2', dash: 'dotted', text: 'b' }),
    box({ id: 's3', shape: 'text', stroke: '#0000cc', text: 'blue' }),
    box({ id: 's4', shape: 'maths', stroke: '#0000cc', text: 'x' })
  ],
  links: [link({ id: 's', from: 's1', to: 's2', stroke: '#00aa00', width: 2, dash: 'dashed' }), link({ id: 't', from: 's2', to: 's1', width: 0.8 })]
}, '').body;
has(styled, 'stroke: (paint: rgb("#cc0000"), thickness: 1.2pt, dash: "dashed"), name: <s1>', 'a coloured, thicker, dashed box');
has(styled, 'stroke: (dash: "dotted"), name: <s2>', 'a dotted box at the default colour and thickness');
has(styled, 'node((1cm, -0.5cm), text(fill: rgb("#0000cc"))[blue], shape: fletcher.shapes.rect, width: 2cm, height: 1cm, stroke: none', 'a label’s text colour');
has(styled, 'text(fill: rgb("#0000cc"))[$x$]', 'maths in a colour');
has(styled, 'edge(<s1>, <s2>, "-->", stroke: (paint: rgb("#00aa00"), thickness: 2pt)),', 'a coloured, thicker dashed edge, its dash in the marks');
has(styled, 'edge(<s2>, <s1>, "->", stroke: (thickness: 0.8pt)),', 'a thinner edge');
// a // would comment out the rest of the line, and @, <, ` and a leading * start a reference, label, raw text or bold
const marked = fletcherCode({ boxes: [box({ id: 'm1', text: '*Total @ref <x> `y` a/b' }), box({ id: 'm2' })], links: [link({ id: 'm', from: 'm1', to: 'm2', label: 'yes // no' })] }, '').body;
has(marked, '[\\*Total \\@ref \\<x> \\`y\\` a\\/b]', 'a box’s markup escaped');
has(marked, 'label: [yes \\/\\/ no]', 'a label’s // escaped');

// the automata, flowchart and model architecture shapes fletcher has, loops and a bent pair
const shapes = fletcherCode({
  boxes: [
    box({ id: 'q0', shape: 'state', w: 5, h: 5, text: 'q_0', initial: 'l' }),
    box({ id: 'q1', shape: 'accepting', x: 14, w: 5, h: 5, text: 'q_1', initial: 't' }),
    box({ id: 'd1', shape: 'cylinder', x: 26, w: 6, h: 6, text: 'Data' }),
    box({ id: 'd2', shape: 'trapezium', x: 0, y: 10, text: 'Manual', wrap: true }),
    box({ id: 'o1', shape: 'operator', x: 12, y: 10, w: 3, h: 3, text: 'times.o' }),
    box({ id: 'c1', shape: 'container', x: -2, y: 8, w: 22, h: 12, text: 'Block', repeat: 'N' })
  ],
  links: [
    link({ id: 'e1', from: 'q0', to: 'q1', route: 'bend', label: 'a' }),
    link({ id: 'e2', from: 'q1', to: 'q0', route: 'bend' }),
    link({ id: 'e3', from: 'q0', to: 'q0', fromSide: 't', toSide: 't' }),
    link({ id: 'e4', from: 'q1', to: 'q1', fromSide: 'b', toSide: 'b', route: 'curved' }),
    link({ id: 'e5', from: 'q1', to: 'gone' })
  ]
}, '').body;
const lines = shapes.split('\n');
// the container first, under the rest, its title in its top-left corner and its ×N beside it
eq(lines[4], '  node((2.25cm, -3.5cm), box(width: 5.5cm, height: 3cm, inset: 4pt, align(top + left)[Block]), shape: fletcher.shapes.rect, corner-radius: 4pt, width: 5.5cm, height: 3cm, inset: 0pt, layer: -1, name: <c1>),', 'a container');
eq(lines[5], '  node((5.5cm, -3.5cm), [$times N$], stroke: none, fill: none),', 'its ×N');
has(shapes, 'node((0.625cm, -0.625cm), [$q_0$], shape: fletcher.shapes.circle, width: 1.25cm, height: 1.25cm, name: <q0>),', 'a state, its text maths');
has(shapes, 'edge((-0.75cm, -0.625cm), <q0>, "->"),', 'a start arrow from the left');
has(shapes, 'shape: fletcher.shapes.circle, width: 1.25cm, height: 1.25cm, extrude: (-2.5, 0), name: <q1>),', 'an accepting state, a double circle');
has(shapes, 'edge((4.125cm, 0.75cm), <q1>, "->"),', 'a start arrow from above');
has(shapes, '[Data], shape: fletcher.shapes.cylinder, width: 1.5cm, height: 1.5cm', 'a cylinder');
has(shapes, 'box(width: 1.75cm)[Manual], shape: fletcher.shapes.trapezium, width: 2cm, height: 1cm', 'a trapezium, its text wrapped');
has(shapes, '[$times.o$], shape: fletcher.shapes.circle, width: 0.75cm, height: 0.75cm', 'an operator circle');
has(shapes, 'edge(<q0>, <q1>, "->", bend: 20deg, label: [a]),', 'a bent arrow');
has(shapes, 'edge(<q1>, <q0>, "->", bend: 20deg),', 'and the one back, to its own left');
has(shapes, 'edge(<q0>, <q0>, "->", bend: 130deg, loop-angle: 90deg),', 'a loop above');
has(shapes, 'edge(<q1>, <q1>, "->", bend: 130deg, loop-angle: -90deg),', 'a loop below, whatever its route says');
has(fletcherCode({ boxes: [box({ id: 'd1', shape: 'cylinder' })], links: [] }, '0.12.0').body, '[], shape: fletcher.shapes.rect,', 'fletcher 0.5.5 has no cylinder: a box');
eq(shapes.includes('gone'), false, 'an edge to a missing node is left out');
eq(lines.filter((l) => l.trim() === ',').length, 0, 'without an empty line in its place');

console.log('fletcher.check: ok');
