// Symbol sets as data, and the rules for what a figure brings into the document: its packages and TikZ libraries
// merged without duplicates, TikZ's babel library always, the loads Spectrum never writes, and the known clashes
// between a package a figure needs and one the project already loads.
import { SYMBOL_SETS } from '../../../backend/src/data/symbolSets.js';
import { CATALOGUE } from './modes/circuitikz/model';

export interface SetSymbol {
  /** the circuit catalogue's id, which the canvas's tool names as part:<id> */
  id: string;
  label: string;
  group: string;
  aliases?: string[];
}

export interface SymbolSet {
  id: string;
  /** part of the symbol cache's key (apps/backend/src/data/symbolSets.js) */
  version: number;
  label: string;
  /** '<category>/<group>' ids from starters.ts, where the Symbol sets dialog lists it */
  categories: string[];
  /** bare names, never options */
  packages: string[];
  /** TikZ names; pgfplots ones as 'pgfplots.<name>' */
  libraries: string[];
  symbols: SetSymbol[];
}

const META: Record<string, Pick<SymbolSet, 'label' | 'categories'>> = {
  circuitikz: { label: 'Circuit symbols', categories: ['engineering/electrical', 'physics/electromagnetism'] },
  'spx-mech': { label: 'Mechanical supports (Spectrum)', categories: ['engineering/mechanical', 'physics/mechanics'] }
};

/** Every set, circuitikz's first: the circuit canvas's palette is its catalogue, a part's set its `set` (none: circuitikz). */
export const SETS: SymbolSet[] = Object.entries(SYMBOL_SETS).map(([id, set]) => ({
  id,
  version: set.version,
  label: META[id]?.label ?? id,
  categories: META[id]?.categories ?? [],
  packages: set.packages,
  libraries: set.libraries,
  symbols: CATALOGUE.filter((part) => (part.set || 'circuitikz') === id).map(({ id: symbol, label, group }) => ({ id: symbol, label, group }))
}));

export const setFor = (id: string) => SETS.find((set) => set.id === id);

/** What a set adds to a document, as the Symbol sets dialog shows it: “circuitikz”, “TikZ only”. */
export const setLoads = (set: Pick<SymbolSet, 'packages' | 'libraries'>) =>
  [...set.packages, ...set.libraries.map((name) => `${name} library`)].join(', ') || 'TikZ only';

// ─── what a figure brings into the document ───

export type Loads = { packages: string[]; libraries: string[] };

/** Packages and libraries merged by name, the first mention keeping its place. */
export function mergeLoads(...loads: Loads[]): Loads {
  return { packages: [...new Set(loads.flatMap((l) => l.packages))], libraries: [...new Set(loads.flatMap((l) => l.libraries))] };
}

/**
 * Loads Spectrum never writes, as packages or TikZ libraries: they break a document (fontspec, physics, mathabx and
 * the like), need shell escape or LuaLaTeX, are deprecated, or define global names that clash (stanli, kinematikz).
 * Filtered at Insert, also when added by hand in the Code tab.
 */
const NEVER_PACKAGES = ['physics', 'mathabx', 'bbold', 'sansmath', 'fontspec', 'contour', 'hobby', 'xfp', 'listofitems', 'tikz-3dplot', 'stanli', 'structmech', 'kinematikz', 'bodegraph', 'bodeplot'];
const NEVER_LIBRARIES = ['graphdrawing', 'tikz-ext', 'snakes', 'arrows'];

/**
 * What the document has to load for a figure: the figure's own loads without the ones Spectrum never writes (left
 * out, and listed so Insert can say so), and for a TikZ figure the babel library, without which a figure's labels
 * and arrows break under French, German, Spanish or Turkish babel. It is harmless when babel isn't loaded.
 */
export function documentLoads(language: string, loads: Loads): Loads & { refused: string[] } {
  const merged = mergeLoads(loads, language === 'tikz' ? { packages: [], libraries: ['babel'] } : { packages: [], libraries: [] });
  const refused = [...merged.packages.filter((p) => NEVER_PACKAGES.includes(p)), ...merged.libraries.filter((l) => NEVER_LIBRARIES.includes(l)).map((l) => `the ${l} library`)];
  return {
    packages: merged.packages.filter((p) => !NEVER_PACKAGES.includes(p)),
    libraries: merged.libraries.filter((l) => !NEVER_LIBRARIES.includes(l)),
    refused
  };
}

// ─── clashes with the project's preamble ───

/**
 * Pairs where a package a figure needs meets one the project loads and the figure comes out wrong, usually silently
 * (checked by compile tests in TeX Live 2026). Only those: a clash between two of the user's own packages shows in
 * their own compile.
 */
const CLASHES: { loads: string; library?: true; writes: string; message: string }[] = [
  { loads: 'stanli', writes: 'circuitikz', message: 'Springs draw wrongly when stanli is loaded.' },
  { loads: 'kinematikz', writes: 'circuitikz', message: 'kinematikz changes circuitikz’s ground symbol.' },
  { loads: 'circuits.ee.IEC', library: true, writes: 'circuitikz', message: 'The circuits.ee.IEC library changes circuitikz’s parts. Load it before circuitikz, or insert the figure as an image.' },
  { loads: 'quantikz', writes: 'tikz-cd', message: 'quantikz restyles every tikz-cd diagram, this one included.' },
  { loads: 'chronology', writes: 'siunitx', message: 'chronology and siunitx cannot load together. Write the value without a unit, or insert the figure as an image.' }
];

export type Clash = { with: string; message: string };

/** The clashes between what a figure writes and what the project's preamble loads (its packages and TikZ libraries). */
export function clashesWith(figure: Loads, project: { packages: Set<string>; libraries: Set<string> }): Clash[] {
  return CLASHES.filter((row) => figure.packages.includes(row.writes) && (row.library ? project.libraries : project.packages).has(row.loads)).map((row) => ({
    with: row.library ? `the ${row.loads} library` : row.loads,
    message: row.message
  }));
}
