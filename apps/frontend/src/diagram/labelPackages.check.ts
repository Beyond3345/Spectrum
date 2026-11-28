// Self-check: a label's own siunitx (\qty, \SI, \num, \unit) or \mathbb loads its package in every mode's figure.
// Run: npx esbuild apps/frontend/src/diagram/labelPackages.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --outfile=<scratch>.mjs && node <scratch>.mjs [out.tex]
import { writeFileSync } from 'node:fs';
import { circuitCode } from './modes/circuitikz/code';
import { mathsPackages } from './modes/shared';
import { tikzDocument } from '../../../backend/src/latex/flowchart.js';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// what a label may type
eq(mathsPackages(['\\qty{1}{\\kilo\\ohm}']), ['siunitx'], '\\qty');
eq(mathsPackages(['$\\SI{4.7}{\\micro\\farad}$', '\\num{3e8}', '\\unit{\\metre\\per\\second}', '\\ang{30}']), ['siunitx'], 'the other commands');
eq(mathsPackages(['$\\sin\\theta$', '$\\angle A$', '\\unitlength', 'plain']), [], 'not \\sin, \\angle or \\unitlength');
eq(mathsPackages(['$\\mathbb{R}$', '\\qtyrange{1}{2}{\\volt}']), ['amssymb', 'siunitx'], 'both');

// a resistor labelled 1 kΩ with siunitx typed in, without the units switch: the figure loads siunitx and compiles
const model = { elements: [{ id: 'e1', kind: 'path', type: 'resistor', a: { x: 0, y: 0 }, b: { x: 8, y: 0 }, label: { text: 'R_1' }, value: '\\qty{1}{\\kilo\\ohm}' }], junctions: [] };
const code = circuitCode(model as never, { preset: 'european' });
eq(code.packages.includes('siunitx'), true, 'a circuit with a typed \\qty loads siunitx');
eq(/\\qty\{1\}\{\\kilo\\ohm\}/.test(code.body), true, 'the value as typed');
// a plain value still needs nothing more
eq(circuitCode({ ...model, elements: [{ ...model.elements[0], value: '1k\\Omega' }] } as never, { preset: 'european' }).packages, ['circuitikz'], 'a plain value');
if (process.argv[2]) writeFileSync(process.argv[2], tikzDocument(code));

console.log('labelPackages.check: ok');
