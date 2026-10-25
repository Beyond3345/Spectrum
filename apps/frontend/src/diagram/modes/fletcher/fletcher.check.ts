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
has(body, 'node((1cm, 0.5cm), [Start here], shape: fletcher.shapes.rect, width: 2cm, height: 1cm, name: <n1>),', 'a rectangle at its centre');
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
eq(fletcherCode(model, '0.12.0').body.startsWith('#import "@preview/fletcher:0.5.5"'), true, 'an older Typst gets an older fletcher');
eq(fletcherCode({ boxes: [], links: [] }, '').body.includes('  node-stroke: 0.4pt,'), true, 'no boxes still makes a diagram');

console.log('fletcher.check: ok');
