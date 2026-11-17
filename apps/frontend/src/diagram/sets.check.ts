// Self-check for symbol sets as data, the export rules and the clash table. Run:
// npx esbuild apps/frontend/src/diagram/sets.check.ts --bundle --platform=node --log-level=warning | node
import { SYMBOL_SETS } from '../../../backend/src/data/symbolSets.js';
import { circuitCode } from './modes/circuitikz/code';
import { CATALOGUE, findJunctions, placeholderShape, railParts, usesSetsOf25, withLaterSets } from './modes/circuitikz/model';
import type { CircuitModel } from './modes/circuitikz/model';
import { symbolRequest } from './modes/circuitikz/symbolGeometry';
import { SETS, clashesWith, documentLoads, mergeLoads, setFor, setLoads } from './sets';
import { search, starterFor } from './starters';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ─── the sets ───

eq(SETS[0].id, 'circuitikz', 'the circuit catalogue is the first set');
eq(SETS.slice(0, 3).map((set) => set.id), ['circuitikz', 'circuitikz-logic', 'circuitikz-mech'], 'then its other kinds of drawing, logic and mechanical');
eq(SETS.slice(0, 3).reduce((n, set) => n + set.symbols.length, 0), CATALOGUE.filter((part) => !part.set).length, 'every circuitikz part is in one of them');
eq([setFor('circuitikz-logic')!.symbols.map((s) => s.id), setFor('circuitikz-mech')!.symbols.map((s) => s.id)], [['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor'], ['spring', 'damper', 'mass', 'inerter', 'viscoelastic', 'motor']], 'the gates, and the springs, dampers and masses');
eq(SETS.slice(0, 3).map((set) => [set.packages, set.version]), [0, 1, 2].map(() => [['circuitikz'], SYMBOL_SETS.circuitikz.version]), 'each loads circuitikz');
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

// ─── the fluid mechanics and construction materials sets ───

const later = CATALOGUE.filter((part) => part.set === 'spx-fluid' || part.set === 'spx-mat');
eq([setFor('spx-fluid')?.symbols.length, setFor('spx-mat')?.symbols.length], [45, 22], 'forty-five fluid mechanics parts, twenty-two construction materials parts');
eq([setFor('spx-fluid')?.label, setFor('spx-mat')?.label], ['Fluid mechanics (Spectrum)', 'Construction materials (Spectrum)'], 'their names');
for (const set of ['spx-fluid', 'spx-mat']) {
  eq(Object.keys(SYMBOL_SETS[set].pics), CATALOGUE.filter((part) => part.set === set).map((part) => part.tikz), `${set}: a part for each picture, in the same order`);
  eq(starterFor('general-drawing')?.sets?.includes(set), true, `General drawing opens with ${set}`);
}
for (const part of later) {
  const pic = SYMBOL_SETS[part.set!].pics[part.tikz];
  eq([part.kind, part.style, part.group.includes('MU')], ['node', undefined, false], `${part.id} is placed, and belongs to no university style`);
  // every pin it offers is a point its picture marks, on the canvas's 0.25 cm grid, so parts join end to end and wires meet them
  const marked = [...pic.matchAll(/\\coordinate \(-([^)]+)\) at \((-?[\d.]+),(-?[\d.]+)\);/g)].map((m) => [m[1], Number(m[2]), Number(m[3])] as const);
  eq(marked.map(([name]) => name), part.pins, `${part.id}'s pins are the points its picture marks`);
  eq(marked.every(([, x, y]) => Number.isInteger(x * 4) && Number.isInteger(y * 4)), true, `${part.id}'s pins are on the grid`);
  // TikZ's core only: no library for a document to load, and the wires' own arrowhead
  eq(/pattern|decorat|Latex|Stealth|\\usetikzlibrary|#/.test(pic), false, `${part.id} needs no TikZ library`);
  // its code: declared once inside the picture (so \includestandalone carries it), then placed plain, and turned and mirrored
  const drawn = circuitCode({ elements: [{ id: 'e1', kind: 'node', type: part.id, at: { x: 0, y: 0 } }, { id: 'e2', kind: 'node', type: part.id, at: { x: 24, y: -8 }, rotate: 90, flipX: true }], junctions: [] }, {});
  eq(drawn.body.split('\n').slice(2), [`\\tikzset{${part.tikz}/.pic={${pic}}}`, `\\pic at (0,0) {${part.tikz}};`, `\\pic[rotate=90, xscale=-1] at (6,-2) {${part.tikz}};`, '\\end{circuitikz}'], `${part.id}'s code`);
  eq([drawn.packages, drawn.libraries], [['circuitikz'], []], `${part.id} is TikZ only`);
  eq(usesSetsOf25({ elements: [{ id: 'e1', kind: 'node', type: part.id, at: { x: 0, y: 0 } }], junctions: [] }), true, `${part.id} makes a drawing version 5`);
}
// pipes join by their pins, a wire reaches a pin, and a part that takes text has it as the pic's text
const piped = circuitCode({
  elements: [
    { id: 'e1', kind: 'node', type: 'fluid-pipe', at: { x: 0, y: 0 } },
    { id: 'e2', kind: 'node', type: 'fluid-reducer', at: { x: 7, y: 0 } },
    { id: 'e3', kind: 'node', type: 'fluid-gauge', at: { x: 0, y: 8 } },
    { id: 'e4', kind: 'node', type: 'fluid-section', at: { x: 0, y: 4 }, text: '1' },
    { id: 'e5', kind: 'node', type: 'fluid-control-volume', at: { x: 20, y: 0 }, text: 'CV' },
    { id: 'e6', kind: 'wire', points: [{ part: 'e3', pin: 'p' }, { part: 'e1', pin: 'top' }], routes: ['--'] },
    { id: 'e7', kind: 'wire', points: [{ part: 'e2', pin: 'out' }, { part: 'e5', pin: 'in' }], routes: ['--'] }
  ],
  junctions: []
}, {}).body.split('\n');
eq(piped.filter((l) => l.startsWith('\\tikzset')).map((l) => l.split('/.pic')[0]), ['\\tikzset{spx/fluid/pipe', '\\tikzset{spx/fluid/reducer', '\\tikzset{spx/fluid/gauge', '\\tikzset{spx/fluid/section', '\\tikzset{spx/fluid/control-volume'], 'only the pictures used, in the catalogue’s order');
eq(piped.slice(7, 14), ['\\pic (e1) at (0,0) {spx/fluid/pipe};', '\\pic (e2) at (1.75,0) {spx/fluid/reducer};', '\\pic (e3) at (0,2) {spx/fluid/gauge};', '\\pic[pic text={1}] at (0,1) {spx/fluid/section};', '\\pic[pic text={CV}] (e5) at (5,0) {spx/fluid/control-volume};', '\\draw (e3-p) -- (e1-top);', '\\draw (e2-out) -- (e5-in);'], 'a gauge tapped into a pipe, a reducer feeding a control volume');
// where pipes, a centre line and a wire meet is a joint, not a circuit's junction: no dot; three wires still make one
const joint = (type: string) => findJunctions({
  elements: [
    { id: 'e1', kind: 'node', type, at: { x: 0, y: 0 } },
    { id: 'e2', kind: 'node', type, at: { x: 0, y: 0 } },
    { id: 'e3', kind: 'node', type, at: { x: 0, y: 0 } },
    { id: 'e4', kind: 'wire', points: [{ part: 'e1', pin: 'p' }, { x: 8, y: 0 }], routes: ['--'] }
  ],
  junctions: []
}, () => ({ pins: { p: { x: 0, y: 0 } } }));
eq([joint('fluid-gauge'), joint('mat-roller'), joint('mech-ground')], [[], [], [{ part: 'e1', pin: 'p' }]], 'no junction dot where fluid or materials parts meet; the supports’ as before');
eq(placeholderShape('fluid-pipe').pins.in !== undefined, true, 'a pipe has its pins before TeX has drawn it');
// the reducer's wide end sits on the pipe's end when their pins meet: 1 cm + 0.75 cm apart, both bores 1 cm
eq([SYMBOL_SETS['spx-fluid'].pics['spx/fluid/pipe'].includes('(-out) at (1,0)'), SYMBOL_SETS['spx-fluid'].pics['spx/fluid/reducer'].includes('(-0.75,0.5)') && SYMBOL_SETS['spx-fluid'].pics['spx/fluid/reducer'].includes('(-in) at (-0.75,0)')], [true, true], 'a pipe’s end and a reducer’s wide end are the same bore');
// drawings without them write what they did, and keep their version
eq([code.body.includes('spx/fluid'), code.body.includes('spx/mat'), flow.body.includes('spx/fluid'), usesSetsOf25(mixed)], [false, false, false, false], 'nothing of the new sets in a drawing that uses none');
// found by another word for them, in the parts list (when the drawing has the set) and in the chooser
eq(railParts('elbow', ['spx-fluid'], []).map((part) => part.id), ['fluid-bend', 'fluid-bend-45'], 'elbow finds the bends');
eq(railParts('elbow', [], []), [], 'but not in a drawing without the set');
eq(railParts('modulus of rupture', ['spx-mat'], []).map((part) => part.id), ['mat-flexure-3', 'mat-flexure-4'], 'modulus of rupture finds the flexural tests');
eq(railParts('nmos', ['spx-fluid', 'spx-mat'], []).every((part) => !part.set), true, 'the circuit parts’ own search is as it was');
// a General drawing from before 2.5 lists them too; a drawing with fewer sets keeps its own
eq([withLaterSets(['spx-mech', 'spx-flow', 'spx-geom']), withLaterSets(['spx-mech']), withLaterSets([])], [['spx-mech', 'spx-flow', 'spx-geom', 'spx-fluid', 'spx-mat', 'circuitikz', 'circuitikz-logic', 'circuitikz-mech'], ['spx-mech'], []], 'an older General drawing has the later sets, the kinds of circuit among them');
eq(search('pipe').symbols.map(({ starter, symbol }) => `${symbol.label}, in ${starter.title}`), ['Pipe, in General drawing', 'Pipe (narrow), in General drawing', 'Piezometer tube, in General drawing', 'Circular hollow section, in General drawing'], 'the chooser finds a pipe in General drawing, and what else is called one');
eq(search('slump').symbols.length, 4, 'and the slump test’s four parts');
eq(search('nabla').symbols.map(({ symbol }) => symbol.id), ['fluid-surface'], 'the free surface mark by another name');

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

// physics's own \qty: Insert writes \SI, so the figure needn't go in as an image
eq(clashesWith({ packages: ['tikz', 'siunitx'], libraries: [] }, project(['physics'])), [{ with: 'physics', message: 'physics has its own \\qty, so Insert writes the figure’s values with siunitx’s \\SI instead.', fixed: true }], 'physics meets siunitx');
eq(clashesWith({ packages: ['circuitikz', 'siunitx'], libraries: [] }, project(['chronology']))[0].fixed, undefined, 'chronology isn’t put right');

console.log('sets.check: ok');
