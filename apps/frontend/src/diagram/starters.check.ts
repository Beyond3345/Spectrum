// Self-check for the chooser's data: the categories, the starters, the gallery's sections and search. Run:
// npx esbuild apps/frontend/src/diagram/starters.check.ts --bundle --platform=node --log-level=warning | node
import { fletcherCode } from './modes/fletcher/code';
import { presetFor } from './modes/form/presets';
import { plotCode } from './modes/pgfplots/code';
import type { PlotModel } from './modes/pgfplots/code';
import { FLETCHER_SHAPES, tikzCode } from './modes/tikz/code';
import type { TikzModel } from './modes/tikz/code';
import { vectorCode } from './modes/vectors/code';
import { SETS } from './sets';
import { cdCode } from './modes/tikzcd/code';
import type { CdModel } from './modes/tikzcd/code';
import { CATEGORIES, MODE_FACTS, STANDARD, STARTERS, search, sectionsFor, starterFor, usedNow } from './starters';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(CATEGORIES.map((c) => c.label), ['Engineering', 'Physics', 'Mathematics', 'Computing', 'Others'], 'five categories');
const groups = new Set(CATEGORIES.flatMap((c) => c.groups.map(([id]) => `${c.id}/${id}`)));
eq(new Set(STARTERS.map((s) => s.id)).size, STARTERS.length, 'starter ids are unique');
for (const s of STARTERS) {
  for (const group of [s.home, ...(s.also ?? [])]) eq(groups.has(group), true, `${s.id} is listed under ${group}, a group`);
  eq(s.also?.includes(s.home) ?? false, false, `${s.id} isn't cross-listed under its home`);
  eq(s.mode in MODE_FACTS, true, `${s.id}'s mode is known`);
  eq(/^[a-z][a-z0-9-]*$/.test(s.file), true, `${s.id}'s file name`);
}
// every mode there was before the chooser still has a starter
for (const mode of ['circuitikz', 'pgfplots', 'tikz', 'tikz-cd', 'mermaid', 'fletcher']) eq(STARTERS.some((s) => s.mode === mode && !s.dev), true, `${mode} has a starter`);
// section 1.3's homes
eq(['circuit', 'plot', 'flowchart', 'commutative', 'mermaid', 'flowchart-typst', 'sequence', 'gantt'].map((id) => starterFor(id)?.home), [
  'engineering/electrical',
  'mathematics/plots',
  'others/flowcharts',
  'mathematics/algebra',
  'others/flowcharts',
  'others/flowcharts',
  'computing/software',
  'others/planning'
], 'homes');

// All lists each starter once, under its home; a category also lists the starters cross-listed in it
const all = sectionsFor('all');
eq(all.flatMap((s) => s.starters.map((x) => x.id)).sort(), STARTERS.map((s) => s.id).sort(), 'All has each starter once');
eq([all[0].id, all[0].label, all[0].starters[0]], ['engineering/electrical', 'Engineering › Electrical and electronics', starterFor('circuit')], 'All is headed by category and group');
const physics = sectionsFor('physics');
eq(physics.find((s) => s.id === 'physics/electromagnetism')?.starters.map((s) => s.id), ['circuit'], 'Circuit is cross-listed under Physics › Electromagnetism');
eq(physics.find((s) => s.id === 'physics/electromagnetism')?.label, 'Electromagnetism', 'a category’s view heads by group alone');
eq(sectionsFor('physics').every((s) => s.starters.length > 0), true, 'no empty groups');
eq(sectionsFor('mathematics').find((s) => s.id === 'mathematics/statistics')?.starters.map((s) => s.id), ['plot', 'venn', 'normal-curve'], 'Plot under Statistics too, beside Venn diagram and Normal curve');

// search: titles, aliases, groups, categories, packages; symbols with the starter they open in
const ids = (q: string) => search(q).starters.map((s) => s.id);
eq(ids('MOSFET'), ['circuit'], 'an alias');
eq(ids('gantt'), ['gantt'], 'a title, any case');
eq(ids('circuitikz').slice(0, 3), ['circuit', 'general-drawing', 'logic'], 'a package name');
eq(ids('circuitikz').length, STARTERS.filter((s) => s.mode === 'circuitikz').length, 'every circuitikz starter');
eq(ids('category theory'), ['commutative', 'commutative-square', 'pullback', 'exact-sequence'], 'two words');
eq(ids('electromagnetism'), ['circuit'], 'a group it is cross-listed in');
eq(ids('fletcher').includes('flowchart-typst'), true, 'fletcher');
eq(ids('Zwölf'), [], 'nothing matches');
// 2.5's plot and Mermaid starters, each opening a drawing of its own
for (const id of ['normal-curve', 'bode-magnitude', 'damped-oscillation', 'polar-rose', 'lissajous', 'conic-sections', 'phase-portrait']) eq(plotCode(starterFor(id)!.model!() as PlotModel).body.includes('\\addplot'), true, `${id} plots`);
for (const [id, first] of [['er', 'erDiagram'], ['pie', 'pie'], ['xychart', 'xychart-beta'], ['mindmap', 'mindmap'], ['timeline', 'timeline'], ['gitgraph', 'gitGraph']]) {
  eq((starterFor(`mermaid-${id}`)!.model!() as { code: string }).code.split(/\s/)[0], first, `mermaid-${id} is a ${first}`);
}
eq(ids('Bode'), ['bode-magnitude'], 'Bode finds its plot');
const resistor = search('resistor');
eq(resistor.symbols.map(({ starter, symbol }) => `${symbol.label}, in ${starter.title}`), ['Resistor, in Circuit', 'Resistor, in General drawing', 'Variable resistor, in Circuit', 'Variable resistor, in General drawing'], 'symbols, each in the starter it opens in and in General drawing');
eq(search('pinned support').symbols.map(({ starter, symbol }) => `${symbol.label}, in ${starter.title}`), ['Pinned support, in Mass, spring and damper', 'Pinned support, in General drawing'], 'a set’s symbol, in the starter that opens the set');
// a university style switched off: its parts leave the chooser's search, the rest stay
const mosfets = (off?: string[]) => [...new Set(search('mosfet', STARTERS, off).symbols.map(({ symbol }) => symbol.style ?? 'none'))];
eq([mosfets(), mosfets(['mu'])], [['none', 'mu'], ['none']], 'MU Style’s MOSFETs found while it is on, not while it is off');
eq(search('mu ac voltage', STARTERS, ['mu']).symbols, [], 'nor its sources');
// the circuit templates: each opens the circuit canvas pre-drawn, the mass, spring and damper with its supports set
const templates = STARTERS.filter((s) => s.mode === 'circuitikz' && s.model);
eq(templates.length, 20, 'twenty circuit templates');
eq(templates.every((s) => (s.model!() as { elements: unknown[] }).elements.length > 0), true, 'each pre-drawn');
eq([starterFor('block-diagram')?.home, starterFor('mass-spring-damper')?.home, starterFor('mass-spring-damper')?.also, starterFor('mass-spring-damper')?.sets], ['engineering/signals', 'engineering/mechanical', ['physics/mechanics'], ['circuitikz-mech', 'spx-mech']], 'Block diagram under Signals and control; Mass, spring and damper under Mechanical and Physics, with its springs and supports');
eq(ids('555'), ['astable-555', 'monostable-555'], 'templates found by alias');
eq(ids('buck').slice(0, 2), ['buck-converter', 'buck-boost-converter'], 'converters by name');
eq(search('   ').starters, [], 'blank finds nothing');
// by relevance: title, then blurb or aliases, then groups and packages, each rank in definition order
eq(ids('fluid statics').slice(0, 5), ['general-drawing', 'gate', 'manometer', 'tank', 'floating'], 'the fluid presets before the beams, which match only by their group');
// a short word starts a word, a longer one may sit inside one
eq(ids('op amp').includes('inclined-member') || ids('op amp').includes('damped-oscillation'), false, 'op amp finds no ramp or damped curve');
eq(search('op amp').symbols.map(({ symbol }) => symbol.label).filter((label) => !/op amp/i.test(label)), [], 'nor the Incline symbol');
eq(ids('op amp').includes('inverting-amplifier'), true, 'but the op amp stages');
eq([ids('RC').includes('rc-ladder'), ids('osfet').includes('circuit')], [true, true], 'RC at a word’s start; a long fragment anywhere');

// Structures and Mohr's circle: Engineering › Mechanical and structures, cross-listed under Physics › Mechanics and fluids
for (const id of ['structure', 'mohr']) {
  eq(sectionsFor('engineering').find((s) => s.id === 'engineering/mechanical')?.starters.some((s) => s.id === id), true, `${id} under Mechanical and structures`);
  eq(sectionsFor('physics').find((s) => s.id === 'physics/mechanics')?.starters.some((s) => s.id === id), true, `${id} under Mechanics and fluids`);
}
for (const q of ['beam', 'truss', 'frame', 'SFD', 'BMD']) eq(ids(q).includes('structure'), true, `${q} finds Structure`);
// the pre-drawn structures (their reactions are checked in structures.check.ts), beside Structure
eq(STARTERS.filter((s) => s.mode === 'structures' && s.id !== 'structure').map((s) => s.id), ['cantilever', 'overhanging-beam', 'propped-cantilever', 'two-span-beam', 'hinged-beam', 'triangular-load', 'pratt-truss', 'howe-truss', 'warren-truss', 'portal-frame', 'three-hinged-frame', 'inclined-member'], 'twelve structures');
eq(ids('truss').filter((id) => starterFor(id)?.mode === 'structures'), ['structure', 'pratt-truss', 'howe-truss', 'warren-truss'], 'truss finds the trusses');
eq(ids('Gerber'), ['hinged-beam'], 'an alias');
for (const q of ['Mohr', 'stress']) eq(ids(q).includes('mohr'), true, `${q} finds Mohr’s circle`);
eq(ids('shear').includes('structure') && ids('shear').includes('mohr'), true, 'shear finds both');
// the fluid mechanics Form presets: there too, found by their words, opening their presets
for (const [q, id] of [['hydrostatic', 'gate'], ['gate', 'gate'], ['sluice', 'gate'], ['manometer', 'manometer'], ['U-tube', 'manometer'], ['accelerating', 'tank'], ['buoyancy', 'floating'], ['metacentre', 'floating']]) eq(ids(q).includes(id), true, `${q} finds ${id}`);
for (const id of ['gate', 'manometer', 'tank', 'floating']) {
  eq(sectionsFor('physics').find((s) => s.id === 'physics/mechanics')?.starters.some((s) => s.id === id), true, `${id} under Mechanics and fluids`);
  eq(starterFor(id)?.model?.(), { preset: id, values: presetFor(id)!.values }, `${id} opens its preset`);
}
// the maths Form presets, beside the Conics plot starter (which stays)
for (const [q, id] of [['conic', 'conic'], ['ellipse', 'conic'], ['hyperbola', 'conic'], ['parabola', 'conic'], ['directrix', 'conic'], ['eigenvector', 'transformation'], ['matrix', 'transformation'], ['linear map', 'transformation'], ['determinant', 'transformation']]) eq(ids(q).includes(id), true, `${q} finds ${id}`);
eq(['conic', 'ellipse', 'hyperbola', 'parabola'].every((q) => ids(q).includes('conic-sections')), true, 'the Conics plot is still found');
eq([starterFor('conic')?.home, starterFor('transformation')?.home, starterFor('conic-sections')?.mode], ['mathematics/geometry', 'mathematics/geometry', 'pgfplots'], 'their homes');
for (const id of ['conic', 'transformation']) eq(starterFor(id)?.model?.(), { preset: id, values: presetFor(id)!.values }, `${id} opens its preset`);

eq(usedNow(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'], 'Recently used puts it first');
eq(usedNow(['1', '2', '3', '4', '5', '6', '7', '8'], '9').length, 8, 'at most eight');

// the plot, automata, model architecture and Venn starters: their homes and cross-listings, and what they open with
eq(['signal-sketch', 'slope-field', 'venn', 'state-machine', 'state-machine-typst', 'model-architecture'].map((id) => [starterFor(id)?.home, starterFor(id)?.also ?? []]), [
  ['engineering/signals', ['physics/waves']],
  ['mathematics/plots', []],
  ['mathematics/statistics', ['others/charts']],
  ['computing/software', ['engineering/digital']],
  ['computing/software', ['engineering/digital']],
  ['computing/learning', []]
], 'their homes and cross-listings');
eq(ids('DFA'), ['state-machine', 'state-machine-typst'], 'DFA finds both state machines');
eq(ids('slope field'), ['slope-field'], 'a title');
eq(ids('transformer'), ['centre-tap-rectifier', 'model-architecture', 'model-architecture-typst'], 'an alias, also the rectifier with a transformer');
eq(sectionsFor('others').find((s) => s.id === 'others/charts')?.starters.map((s) => s.id).includes('venn'), true, 'Venn under Others › Charts');
eq(starterFor('venn')?.model?.(), { preset: 'venn', values: presetFor('venn')!.values }, 'Venn opens the Form preset');
// the Typst state machine has only shapes fletcher writes, and every new starter's drawing writes code
eq((starterFor('state-machine-typst')!.model!() as TikzModel).boxes.every((b) => FLETCHER_SHAPES.includes(b.shape)), true, 'fletcher shapes only');
eq(fletcherCode(starterFor('state-machine-typst')!.model!() as TikzModel).body.includes('loop-angle'), true, 'its loops in fletcher');
eq(tikzCode(starterFor('model-architecture')!.model!() as TikzModel).body.includes('$\\times N$'), true, 'a block ×N');
eq(plotCode(starterFor('signal-sketch')!.model!() as PlotModel).body.includes('xtick=\\empty'), true, 'a sketch');

// vector diagrams: under Mathematics › Geometry and vectors, cross-listed under Physics › Mechanics and fluids
const vectorStarters = STARTERS.filter((s) => s.mode === 'vectors');
eq(
  vectorStarters.map((s) => s.id),
  ['vectors', 'vector-line', 'vector-ratio', 'vector-midpoints', 'vector-projections', 'vector-free-body', 'vector-triangle-law', 'vector-parallelogram-law', 'vector-force-polygon', 'vector-position-ij', 'vector-cevians', 'vector-angle', 'vector-eqline', 'vector-scalar-multiples'],
  'the vector composer, its four figures and nine more'
);
for (const [q, id] of [['FBD', 'vector-free-body'], ['parallelogram', 'vector-parallelogram-law'], ['resultant', 'vector-force-polygon'], ['centroid', 'vector-cevians'], ['unit vector', 'vector-position-ij'], ['dot product', 'vector-angle'], ['intercepts', 'vector-eqline'], ['scalar multiple', 'vector-scalar-multiples']]) eq(ids(q).includes(id), true, `${q} finds ${id}`);
eq(ids('parallelogram').filter((id) => id.startsWith('vector')), ['vector-parallelogram-law'], 'each figure found by its own words, not every vector figure');
eq(sectionsFor('mathematics').find((s) => s.id === 'mathematics/geometry')?.label, 'Geometry and vectors', 'the group');
eq(vectorStarters.every((s) => s.home === 'mathematics/geometry' && sectionsFor('physics').find((x) => x.id === 'physics/mechanics')!.starters.includes(s)), true, 'each under Mechanics and fluids too');
for (const q of ['vector', 'midpoint', 'projection', 'position vector']) eq(ids(q).includes('vectors'), true, `${q} finds the vector composer`);
eq(vectorStarters.filter((s) => s.model).every((s) => /\\coordinate \(\w+\) at \(0,0\);/.test(vectorCode(s.model!(), {}).body)), true, 'each figure writes code');

// General drawing: under Others, with every symbol set on and no plotters
const general = starterFor('general-drawing')!;
eq([general.home, general.mode, general.sets], ['others/general', 'circuitikz', SETS.map((s) => s.id)], 'every set on, the kinds of circuit among them');
eq(sectionsFor('others')[0].starters.map((s) => s.id), ['general-drawing'], 'first under Others');
eq(['circuitikz', 'spx-mech', 'spx-flow', 'spx-geom'].every((id) => SETS.some((s) => s.id === id)), true, 'circuits, supports, flowchart shapes, points and marks');
// search finds every symbol in it, and offers General drawing for each
for (const set of SETS) {
  for (const symbol of set.symbols) eq(search(symbol.label).symbols.some((x) => x.starter.id === 'general-drawing' && x.symbol.id === symbol.id), true, `${symbol.label} is in General drawing`);
}
// a flowchart shape: in the Flowchart composers first, with its tool, then in General drawing; “decision” opens the Flowchart
const decision = search('decision');
eq(decision.symbols.map(({ starter, symbol, tool }) => `${symbol.label}, in ${starter.title}${tool ? ` (${tool})` : ''}`), ['Diamond, in Flowchart (diamond)', 'Diamond, in Flowchart in Typst (diamond)', 'Decision, in General drawing'], 'a flowchart shape, in the Flowchart and General drawing');
eq([decision.starters[0].id, decision.starters[0].mode], ['decision-flowchart', 'tikz'], 'the first match for decision is a Flowchart');
eq(search('vector stack').symbols.map(({ starter }) => starter.id), ['flowchart'], 'a shape fletcher can’t write, in the TikZ Flowchart only');
eq(search('takeoff point').symbols.map(({ starter, tool }) => `${starter.id} ${tool}`), ['flowchart takeoff', 'flowchart-typst takeoff'], 'a 2.5 shape by its name');
eq(search('flowchart shape').symbols.filter(({ starter }) => starter.id === 'flowchart').length, 20, 'every Flowchart shape');

// the 2.5 flowchart, block diagram and commutative diagram starters: where they're listed, and code from each
eq(['decision-flowchart', 'feedback-loop', 'swimlane', 'model-architecture-typst', 'commutative-square', 'pullback', 'exact-sequence'].map((id) => [starterFor(id)?.mode, starterFor(id)?.home]), [
  ['tikz', 'others/flowcharts'],
  ['tikz', 'engineering/signals'],
  ['tikz', 'others/flowcharts'],
  ['fletcher', 'computing/learning'],
  ['tikz-cd', 'mathematics/algebra'],
  ['tikz-cd', 'mathematics/algebra'],
  ['tikz-cd', 'mathematics/algebra']
], 'the seven starters');
const flowOf = (id: string) => starterFor(id)!.model!() as TikzModel;
const feedback = tikzCode(flowOf('feedback-loop')).body;
eq(['-- cycle;', 'minimum size=1.2mm', '{$+$}', '{$-$}', 'auto] {$E(s)$}'].map((bit) => feedback.includes(bit) || bit), [true, true, true, true, true], 'the feedback loop: a gain, a takeoff point, its signs and a label beside');
eq(tikzCode(flowOf('decision-flowchart')).body.includes('diamond'), true, 'a decision');
eq(tikzCode(flowOf('swimlane')).body.match(/\\node\[align=center\]/g)?.length, 2, 'two lanes, a title each');
eq(flowOf('model-architecture-typst').boxes.every((b) => FLETCHER_SHAPES.includes(b.shape)), true, 'the Typst model architecture: fletcher shapes only');
eq(fletcherCode(flowOf('model-architecture-typst')).body.includes('$times N$'), true, 'its block ×N');
const cd = (id: string) => cdCode(starterFor(id)!.model!() as CdModel).body;
eq(cd('commutative-square').includes('A \\arrow[r, "f"] \\arrow[d, "g"\'] & B'), true, 'the square');
eq(cd('pullback').includes('\\arrow[rd, "u", dashed]'), true, 'the pullback’s dashed u');
eq(cd('exact-sequence').split('&').length, 5, 'the exact sequence, five objects in a row');
eq(search('sawtooth').starters.some((s) => s.id === 'general-drawing'), false, 'no plotters');

// the circuit canvas's starters record their kinds of drawing (sets), and a symbol opens a starter that lists it
const circuitStarters = STARTERS.filter((s) => s.mode === 'circuitikz');
eq(circuitStarters.filter((s) => !s.sets?.length || !s.sets.every((set) => SETS.some((x) => x.id === set)) || !s.sets.some((set) => set.startsWith('circuitikz'))).map((s) => s.id), [], 'each records a kind of circuit, and only sets there are');
eq(['circuit', 'logic', 'inverting-amplifier', 'block-diagram', 'mass-spring-damper'].map((id) => starterFor(id)?.sets), [['circuitikz'], ['circuitikz-logic'], ['circuitikz'], ['circuitikz'], ['circuitikz-mech', 'spx-mech']], 'Circuit and its templates, Logic schematic, and the mass, spring and damper');
eq(circuitStarters.filter((s) => !s.model).map((s) => [s.id, s.sets!.length]), [['circuit', 1], ['general-drawing', SETS.length], ['logic', 1]], 'the blank ones: Circuit, General drawing with every set, Logic schematic');
const found = (q: string) => search(q).symbols.map(({ starter, symbol }) => `${symbol.label}, in ${starter.title}`);
eq(found('nand'), ['NAND gate, in Logic schematic', 'NAND gate, in General drawing'], 'a gate opens a Logic schematic');
eq(found('damper').slice(0, 2), ['Damper, in Mass, spring and damper', 'Damper, in General drawing'], 'a damper opens the mass, spring and damper');
eq(found('signal ground'), ['Signal ground, in Circuit', 'Signal ground, in General drawing'], 'a ground opens a Circuit');

// Standard: one starter for each composer but Form, which has only presets
const standard = STANDARD.map((id) => starterFor(id)!);
eq(standard.map((s) => s.title), ['Circuit', 'Logic schematic', 'General drawing', 'Structure (beams, trusses, frames)', 'Vector diagram', 'Plot', 'Flowchart', 'Flowchart in Typst', 'Commutative diagram', 'Mermaid diagram'], 'the Standard view’s starters');
eq((Object.keys(MODE_FACTS) as (keyof typeof MODE_FACTS)[]).filter((mode) => mode !== 'form' && !standard.some((s) => s.mode === mode)), [], 'every composer but Form has one');
eq(standard.filter((s) => s.model && s.id !== 'structure').map((s) => s.id), [], 'blank, but for Structure’s sample beam');

