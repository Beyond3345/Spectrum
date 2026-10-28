// Self-check for the chooser's data: the categories, the starters, the gallery's sections and search. Run:
// npx esbuild apps/frontend/src/diagram/starters.check.ts --bundle --platform=node --log-level=warning | node
import { CATEGORIES, MODE_FACTS, STARTERS, search, sectionsFor, starterFor, usedNow } from './starters';

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
eq(sectionsFor('mathematics').find((s) => s.id === 'mathematics/statistics')?.starters.map((s) => s.id), ['plot'], 'Plot under Statistics too');

// search: titles, aliases, groups, categories, packages; symbols with the starter they open in
const ids = (q: string) => search(q).starters.map((s) => s.id);
eq(ids('MOSFET'), ['circuit'], 'an alias');
eq(ids('gantt'), ['gantt'], 'a title, any case');
eq(ids('circuitikz').slice(0, 2), ['circuit', 'logic'], 'a package name');
eq(ids('circuitikz').length, STARTERS.filter((s) => s.mode === 'circuitikz').length, 'every circuitikz starter');
eq(ids('category theory'), ['commutative'], 'two words');
eq(ids('electromagnetism'), ['circuit'], 'a group it is cross-listed in');
eq(ids('fletcher').includes('flowchart-typst'), true, 'fletcher');
eq(ids('Zwölf'), [], 'nothing matches');
const resistor = search('resistor');
eq(resistor.symbols.map(({ starter, symbol }) => `${symbol.label}, in ${starter.title}`), ['Resistor, in Circuit', 'Variable resistor, in Circuit'], 'symbols, each in the starter it opens in');
eq(search('pinned support').symbols.map(({ starter, symbol }) => `${symbol.label}, in ${starter.title}`), ['Pinned support, in Mass, spring and damper'], 'a set’s symbol, in the starter that opens the set');
// the circuit templates: each opens the circuit canvas pre-drawn, the mass, spring and damper with its supports set
const templates = STARTERS.filter((s) => s.mode === 'circuitikz' && s.model);
eq(templates.length, 20, 'twenty circuit templates');
eq(templates.every((s) => (s.model!() as { elements: unknown[] }).elements.length > 0), true, 'each pre-drawn');
eq([starterFor('block-diagram')?.home, starterFor('mass-spring-damper')?.home, starterFor('mass-spring-damper')?.also, starterFor('mass-spring-damper')?.sets], ['engineering/signals', 'engineering/mechanical', ['physics/mechanics'], ['spx-mech']], 'Block diagram under Signals and control; Mass, spring and damper under Mechanical and Physics, with its supports');
eq(ids('555'), ['astable-555', 'monostable-555'], 'templates found by alias');
eq(ids('buck').slice(0, 2), ['buck-converter', 'buck-boost-converter'], 'converters by name');
eq(search('   ').starters, [], 'blank finds nothing');

eq(usedNow(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'], 'Recently used puts it first');
eq(usedNow(['1', '2', '3', '4', '5', '6', '7', '8'], '9').length, 8, 'at most eight');

console.log('starters.check: ok');
