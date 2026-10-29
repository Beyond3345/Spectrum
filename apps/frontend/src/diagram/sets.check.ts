// Self-check for symbol sets as data, the export rules and the clash table. Run:
// npx esbuild apps/frontend/src/diagram/sets.check.ts --bundle --platform=node --log-level=warning | node
import { SYMBOL_SETS } from '../../../backend/src/data/symbolSets.js';
import { circuitCode } from './modes/circuitikz/code';
import { CATALOGUE } from './modes/circuitikz/model';
import type { CircuitModel } from './modes/circuitikz/model';
import { symbolRequest } from './modes/circuitikz/symbolGeometry';
import { SETS, clashesWith, documentLoads, mergeLoads, setFor, setLoads } from './sets';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ─── the sets ───

eq(SETS[0].id, 'circuitikz', 'the circuit catalogue is the first set');
eq(SETS[0].symbols.length, CATALOGUE.filter((part) => !part.set).length, 'every circuitikz part is in it');
eq(setFor('circuitikz')?.symbols.find((s) => s.id === 'resistor'), { id: 'resistor', label: 'Resistor', group: 'Resistors and impedances' }, 'a symbol keeps its catalogue id, label and group');
for (const set of SETS) {
  eq(set.label !== set.id && set.categories.length > 0, true, `${set.id} has a label and a category`);
  eq(set.packages.every((p) => /^[a-z0-9-]+$/i.test(p)), true, `${set.id}'s packages are bare names`);
  eq(set.symbols.length > 0, true, `${set.id} has symbols`);
}
for (const part of CATALOGUE.filter((p) => p.set)) {
  eq(part.set! in SYMBOL_SETS && part.tikz in SYMBOL_SETS[part.set!].pics, true, `${part.id}'s picture is its set's`);
  // rule 6: every name Spectrum defines is prefixed
  eq(part.tikz.startsWith(`spx/${part.set!.replace(/^spx-/, '')}/`), true, `${part.id} is prefixed`);
  eq(symbolRequest({ type: part.id, options: [] }), { id: part.id, tikz: part.tikz, kind: 'pic', pins: part.pins }, `${part.id} is asked for as a pic`);
}
eq(symbolRequest({ type: 'ground', options: [] }).kind, 'node', 'circuitikz’s own ground is still a node');
eq([setLoads(setFor('circuitikz')!), setLoads(setFor('spx-mech')!), setLoads({ packages: ['pgfplots'], libraries: ['pgfplots.fillbetween'] })], ['circuitikz', 'TikZ only', 'pgfplots, pgfplots.fillbetween library'], 'what a set adds, for the dialog');

// ─── a set's pictures in a circuit ───

const mixed: CircuitModel = {
  elements: [
    { id: 'e1', kind: 'node', type: 'mech-ground', at: { x: 0, y: 0 }, name: 'G' },
    { id: 'e2', kind: 'node', type: 'mech-pin', at: { x: 8, y: 0 }, rotate: 90, flipX: true },
    { id: 'e3', kind: 'path', type: 'resistor', a: { part: 'e1', pin: 'p' }, b: { part: 'e2', pin: 'p' } },
    { id: 'e4', kind: 'node', type: 'mech-ground', at: { x: 0, y: -8 } }
  ],
  junctions: []
};
const code = circuitCode(mixed, {});
const lines = code.body.split('\n');
eq(lines.slice(0, 2), ['\\begin{circuitikz}[american, american inductors, american resistors, american voltages, voltage dir=noold]', '\\ctikzset{label/align=smart, diode=empty, bipoles/length=1.4cm}'], 'the picture, every style key written');
// rule 2: definitions inside the picture, once each, only for the pictures used, in the catalogue's order
eq(lines.slice(2, 4).map((l) => l.split('={')[0]), ['\\tikzset{spx/mech/ground/.pic', '\\tikzset{spx/mech/pin/.pic'], 'each picture used is defined inside the picture');
eq(lines[2], `\\tikzset{spx/mech/ground/.pic={${SYMBOL_SETS['spx-mech'].pics['spx/mech/ground']}}}`, 'as the symbol service draws it');
eq(lines.filter((l) => l.startsWith('\\tikzset')).length, 2, 'each defined once');
eq(lines.slice(4, 7), ['\\pic (G) at (0,0) {spx/mech/ground};', '\\pic[rotate=90, xscale=-1] (e2) at (2,0) {spx/mech/pin};', '\\pic at (0,-2) {spx/mech/ground};'], 'a pic, turned and named when wired to');
eq(lines[7], '\\draw (G-p) to[R] (e2-p);', 'wires reach a pic’s pins as <name>-<pin>');
eq([code.packages, code.libraries], [['circuitikz'], []], 'spx-mech is TikZ only');
eq(circuitCode({ elements: [mixed.elements[2]], junctions: [] }, {}).body.includes('\\tikzset'), false, 'no definitions when no picture is used');
// a flowchart shape takes its text as the pic's text; a point or mark takes none
const flow = circuitCode({ elements: [{ id: 'e1', kind: 'node', type: 'flow-decision', at: { x: 0, y: 0 }, text: 'Ready?' }, { id: 'e2', kind: 'node', type: 'geom-point', at: { x: 8, y: 0 }, text: 'ignored' }, { id: 'e3', kind: 'wire', points: [{ part: 'e1', pin: 'east' }, { part: 'e2', pin: 'p' }], routes: ['--'], arrows: '->' }], junctions: [] }, {});
eq(flow.body.split('\n').slice(4, 7), ['\\pic[pic text={Ready?}] (e1) at (0,0) {spx/flow/decision};', '\\pic (e2) at (2,0) {spx/geom/point};', '\\draw[-latex] (e1-east) -- (e2-p);'], 'a decision with its text, wired to a point');
eq([flow.packages, flow.libraries], [['circuitikz'], []], 'shapes and marks are TikZ only');

// ─── rule 4: merged without duplicates; rule 5: babel; rule 8: never written ───

eq(mergeLoads({ packages: ['circuitikz', 'siunitx'], libraries: ['arrows.meta'] }, { packages: ['tikz', 'circuitikz'], libraries: ['arrows.meta', 'patterns'] }), { packages: ['circuitikz', 'siunitx', 'tikz'], libraries: ['arrows.meta', 'patterns'] }, 'merged by name, first mention first');
eq(documentLoads('tikz', { packages: ['circuitikz'], libraries: [] }), { packages: ['circuitikz'], libraries: ['babel'], refused: [] }, 'a TikZ figure always brings the babel library');
eq(documentLoads('tikz', { packages: ['tikz'], libraries: ['babel', 'positioning'] }).libraries, ['babel', 'positioning'], 'babel once');
eq(documentLoads('typst', { packages: [], libraries: [] }).libraries, [], 'not for Typst');
eq(
  documentLoads('tikz', { packages: ['tikz', 'physics', 'fontspec', 'stanli'], libraries: ['arrows', 'arrows.meta', 'graphdrawing'] }),
  { packages: ['tikz'], libraries: ['arrows.meta', 'babel'], refused: ['physics', 'fontspec', 'stanli', 'the arrows library', 'the graphdrawing library'] },
  'what Spectrum never writes is left out, and said'
);

// ─── clashes with the project's preamble ───

const project = (packages: string[], libraries: string[] = []) => ({ packages: new Set(packages), libraries: new Set(libraries) });
eq(clashesWith({ packages: ['circuitikz'], libraries: [] }, project(['amsmath', 'stanli'])).map((c) => c.with), ['stanli'], 'stanli meets circuitikz');
eq(clashesWith({ packages: ['circuitikz'], libraries: [] }, project(['kinematikz'], ['circuits.ee.IEC'])).map((c) => c.with), ['kinematikz', 'the circuits.ee.IEC library'], 'a library in the preamble counts');
eq(clashesWith({ packages: ['circuitikz'], libraries: [] }, project([], [])), [], 'nothing loaded, no clash');
eq(clashesWith({ packages: ['tikz'], libraries: [] }, project(['stanli', 'quantikz'])), [], 'a figure without circuitikz or tikz-cd meets neither');
eq(clashesWith({ packages: ['tikz-cd', 'amssymb'], libraries: [] }, project(['quantikz'])).map((c) => c.message), ['quantikz restyles every tikz-cd diagram, this one included.'], 'quantikz meets tikz-cd');
eq(clashesWith({ packages: ['circuitikz', 'siunitx'], libraries: [] }, project(['chronology'])).length, 1, 'chronology meets siunitx');
eq(clashesWith({ packages: ['circuitikz'], libraries: [] }, project(['chronology'])).length, 0, 'but not without siunitx');

console.log('sets.check: ok');
