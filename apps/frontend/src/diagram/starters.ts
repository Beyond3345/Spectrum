// The chooser's starters: a card each, naming the mode it opens, what it starts with, and where it's listed. The
// categories classify starters, not modes: a starter sits under its home group and is cross-listed under others.
import * as circuitTemplates from './modes/circuitikz/templates';
import { TEMPLATES } from './modes/mermaid/templates';
import { newFormModel, presetFor } from './modes/form/presets';
import { signalSketch, slopeField } from './modes/pgfplots/code';
import { sampleBeam } from './modes/structures/model';
import { modelArchitecture, stateMachine } from './modes/tikz/examples';
import { SETS } from './sets';
import type { SetSymbol } from './sets';
import type { DiagramLanguage } from './types';

export type CategoryId = 'engineering' | 'physics' | 'mathematics' | 'computing' | 'others';

/** The five categories and their groups, in the chooser's order. A group's id is '<category>/<group>'. */
export const CATEGORIES: { id: CategoryId; label: string; groups: [string, string][] }[] = [
  {
    id: 'engineering',
    label: 'Engineering',
    groups: [
      ['electrical', 'Electrical and electronics'],
      ['digital', 'Digital and computer architecture'],
      ['signals', 'Signals and control'],
      ['mechanical', 'Mechanical and structures']
    ]
  },
  {
    id: 'physics',
    label: 'Physics',
    groups: [
      ['mechanics', 'Mechanics and fluids'],
      ['waves', 'Waves and acoustics'],
      ['thermodynamics', 'Thermodynamics'],
      ['electromagnetism', 'Electromagnetism'],
      ['optics', 'Optics'],
      ['astronomy', 'Astronomy and relativity'],
      ['quantum', 'Quantum, particle and solid state']
    ]
  },
  {
    id: 'mathematics',
    label: 'Mathematics',
    groups: [
      ['plots', 'Plots and analysis'],
      ['statistics', 'Statistics and probability'],
      ['geometry', 'Geometry'],
      ['algebra', 'Algebra and category theory'],
      ['discrete', 'Discrete maths']
    ]
  },
  {
    id: 'computing',
    label: 'Computing',
    groups: [
      ['software', 'Software and automata'],
      ['learning', 'Machine learning']
    ]
  },
  {
    id: 'others',
    label: 'Others',
    groups: [
      ['flowcharts', 'Flowcharts and block diagrams'],
      ['planning', 'Planning'],
      ['charts', 'Charts'],
      ['images', 'Images'],
      ['chemistry', 'Chemistry and life sciences']
    ]
  }
];

export type StarterMode = 'circuitikz' | 'pgfplots' | 'tikz' | 'tikz-cd' | 'mermaid' | 'fletcher' | 'form' | 'structures';

export interface Starter {
  id: string;
  mode: StarterMode;
  title: string;
  /** one line on the card */
  blurb: string;
  /** '<category>/<group>': where it's listed in All */
  home: string;
  /** the other groups it's listed under in a category's view */
  also?: string[];
  /** what search finds it by, besides its title, groups and packages: FBD, Bode, DFA, MOSFET */
  aliases?: string[];
  /** the start of a new file's name: circuit gives figures/circuit-1.tex */
  file: string;
  /** the drawing it starts with; none: the mode's empty one */
  model?: () => unknown;
  /** other symbol sets it opens with, always on in its drawings */
  sets?: string[];
  /** listed in development builds only */
  dev?: boolean;
}

/** What a mode writes in, for the card's badge, and the packages it names on the card and that search finds. */
export const MODE_FACTS: Record<StarterMode, { language: DiagramLanguage; packages: string[] }> = {
  circuitikz: { language: 'tikz', packages: ['circuitikz'] },
  pgfplots: { language: 'tikz', packages: ['pgfplots'] },
  tikz: { language: 'tikz', packages: ['TikZ'] },
  'tikz-cd': { language: 'tikz', packages: ['tikz-cd'] },
  mermaid: { language: 'mermaid', packages: ['Mermaid'] },
  fletcher: { language: 'typst', packages: ['fletcher'] },
  form: { language: 'tikz', packages: ['TikZ'] },
  structures: { language: 'tikz', packages: ['TikZ'] }
};

const mermaid = (id: string) => () => ({ code: TEMPLATES.find(([t]) => t === id)?.[2] ?? TEMPLATES[0][2] });

/** Circuits that open pre-drawn (modes/circuitikz/templates), with what they compute written beside them. */
const circuit = (id: string, title: string, blurb: string, model: () => unknown, aliases: string[], home = 'engineering/electrical'): Starter =>
  ({ id, mode: 'circuitikz', title, blurb, home, aliases, file: id, model });
const CIRCUIT_TEMPLATES: Starter[] = [
  circuit('inverting-amplifier', 'Inverting amplifier', 'An op amp with its gain, −Rf/R1, written beside it', circuitTemplates.invertingAmplifier, ['op amp', 'opamp', 'gain', 'template']),
  circuit('non-inverting-amplifier', 'Non-inverting amplifier', 'An op amp with its gain, 1 + Rf/R1, written beside it', circuitTemplates.nonInvertingAmplifier, ['op amp', 'opamp', 'gain', 'template']),
  circuit('voltage-follower', 'Voltage follower', 'An op amp buffer with a gain of 1', circuitTemplates.voltageFollower, ['op amp', 'opamp', 'buffer', 'unity gain', 'template']),
  circuit('summing-amplifier', 'Summing amplifier', 'An op amp adding two inputs', circuitTemplates.summingAmplifier, ['op amp', 'opamp', 'adder', 'mixer', 'template']),
  circuit('integrator', 'Integrator', 'An op amp with a capacitor in its feedback', circuitTemplates.integrator, ['op amp', 'opamp', 'integrating', 'template']),
  circuit('differentiator', 'Differentiator', 'An op amp with a capacitor at its input', circuitTemplates.differentiator, ['op amp', 'opamp', 'differentiating', 'template']),
  circuit('difference-amplifier', 'Difference amplifier', 'An op amp giving (R2/R1)(v2 − v1)', circuitTemplates.differenceAmplifier, ['op amp', 'opamp', 'differential', 'subtractor', 'template']),
  circuit('half-wave-rectifier', 'Half-wave rectifier', 'A diode, a smoothing capacitor and a load', circuitTemplates.halfWaveRectifier, ['rectifier', 'diode', 'power supply', 'AC to DC', 'template']),
  circuit('centre-tap-rectifier', 'Centre-tap rectifier', 'Two diodes on a centre-tapped secondary, smoothed', circuitTemplates.centreTapRectifier, ['rectifier', 'full-wave', 'center tap', 'transformer', 'power supply', 'template']),
  circuit('bridge-rectifier', 'Bridge rectifier', 'Four diodes in a bridge, smoothed', circuitTemplates.bridgeRectifier, ['rectifier', 'full-wave', 'diode bridge', 'power supply', 'template']),
  circuit('common-emitter', 'Transistor amplifier stage', 'A common-emitter stage biased by a divider', circuitTemplates.commonEmitterStage, ['BJT', 'common emitter', 'NPN', 'bias', 'template']),
  circuit('hybrid-pi', 'Small-signal model', 'The hybrid-π model of a transistor', circuitTemplates.hybridPi, ['hybrid-pi', 'hybrid pi', 'BJT', 'small signal', 'transconductance', 'template']),
  circuit('astable-555', '555 astable', 'A 555 oscillating, with its frequency written beside it', circuitTemplates.astable, ['555', 'timer', 'oscillator', 'multivibrator', 'template']),
  circuit('monostable-555', '555 monostable', 'A 555 one-shot, with its pulse length written beside it', circuitTemplates.monostable, ['555', 'timer', 'one-shot', 'multivibrator', 'template']),
  circuit('buck-converter', 'Buck converter', 'A step-down converter, with M(D) written beside it', () => circuitTemplates.converter('buck'), ['buck', 'DC-DC', 'SMPS', 'step-down', 'power electronics', 'template']),
  circuit('boost-converter', 'Boost converter', 'A step-up converter, with M(D) written beside it', () => circuitTemplates.converter('boost'), ['boost', 'DC-DC', 'SMPS', 'step-up', 'power electronics', 'template']),
  circuit('buck-boost-converter', 'Buck-boost converter', 'An inverting converter, with M(D) written beside it', () => circuitTemplates.converter('buck-boost'), ['buck-boost', 'DC-DC', 'SMPS', 'inverting', 'power electronics', 'template']),
  circuit('rc-ladder', 'RC ladder', 'Three RC low-pass stages in a row', () => circuitTemplates.rcLadder(3), ['RC filter', 'low-pass', 'ladder network', 'template']),
  circuit('block-diagram', 'Block diagram', 'Blocks, adders and signals on wires with arrowheads', circuitTemplates.feedbackLoop, ['control', 'feedback', 'transfer function', 'signal flow', 'adder'], 'engineering/signals'),
  {
    ...circuit('mass-spring-damper', 'Mass, spring and damper', 'Springs, dampers and masses from a wall', circuitTemplates.massSpringDamper, ['vibration', 'oscillator', 'mechanical', 'dashpot', 'spring'], 'engineering/mechanical'),
    also: ['physics/mechanics'],
    sets: ['spx-mech']
  }
];

export const STARTERS: Starter[] = [
  {
    id: 'circuit',
    mode: 'circuitikz',
    title: 'Circuit',
    blurb: 'Resistors, sources, switches, transistors and gates, wired on a grid',
    home: 'engineering/electrical',
    also: ['physics/electromagnetism'],
    aliases: ['schematic', 'electric', 'electronics', 'MOSFET', 'transistor', 'op amp', 'resistor'],
    file: 'circuit'
  },
  {
    id: 'logic',
    mode: 'circuitikz',
    title: 'Logic schematic',
    blurb: 'AND, OR, NOT and the other gates, wired on a grid',
    home: 'engineering/digital',
    aliases: ['gates', 'digital', 'boolean', 'NAND', 'XOR'],
    file: 'logic'
  },
  ...CIRCUIT_TEMPLATES,
  {
    id: 'plot',
    mode: 'pgfplots',
    title: 'Plot',
    blurb: 'Functions and data from the project, on axes',
    home: 'mathematics/plots',
    also: ['mathematics/statistics', 'engineering/signals', 'physics/mechanics', 'physics/waves', 'physics/thermodynamics'],
    aliases: ['graph', 'function', 'chart', 'axes', 'data', 'CSV', 'curve'],
    file: 'plot'
  },
  {
    id: 'commutative',
    mode: 'tikz-cd',
    title: 'Commutative diagram',
    blurb: 'Maths objects on a grid, with labelled arrows',
    home: 'mathematics/algebra',
    aliases: ['category theory', 'exact sequence', 'morphism', 'square'],
    file: 'square'
  },
  {
    id: 'flowchart',
    mode: 'tikz',
    title: 'Flowchart',
    blurb: 'Boxes and arrows, compiled with your document’s fonts',
    home: 'others/flowcharts',
    aliases: ['flow chart', 'block diagram', 'process', 'boxes', 'arrows'],
    file: 'diagram'
  },
  {
    id: 'flowchart-typst',
    mode: 'fletcher',
    title: 'Flowchart in Typst',
    blurb: 'Boxes and arrows for a Typst document',
    home: 'others/flowcharts',
    aliases: ['flow chart', 'block diagram', 'process', 'Typst'],
    file: 'flow'
  },
  {
    id: 'mermaid',
    mode: 'mermaid',
    title: 'Mermaid diagram',
    blurb: 'Flowcharts, class and state diagrams, written as text',
    home: 'others/flowcharts',
    also: ['computing/software'],
    aliases: ['text', 'class diagram', 'state diagram', 'UML'],
    file: 'mermaid'
  },
  {
    id: 'sequence',
    mode: 'mermaid',
    title: 'Sequence diagram',
    blurb: 'Messages between people or systems over time, written as text',
    home: 'computing/software',
    aliases: ['UML', 'messages', 'protocol', 'interaction'],
    file: 'sequence',
    model: mermaid('sequence')
  },
  {
    id: 'gantt',
    mode: 'mermaid',
    title: 'Gantt chart',
    blurb: 'Tasks and milestones on a timeline, written as text',
    home: 'others/planning',
    aliases: ['Gantt', 'timeline', 'schedule', 'project plan'],
    file: 'gantt',
    model: mermaid('gantt')
  },
  // plots, automata, model architectures and Venn diagrams
  {
    id: 'signal-sketch',
    mode: 'pgfplots',
    title: 'Signal sketch',
    blurb: 'Square, triangle, sawtooth, pulse and other waveforms on sketched axes',
    home: 'engineering/signals',
    also: ['physics/waves'],
    aliases: ['waveform', 'square wave', 'sawtooth', 'pulse train', 'step', 'timing', 'signal'],
    file: 'signal',
    model: signalSketch
  },
  {
    id: 'slope-field',
    mode: 'pgfplots',
    title: 'Vector and slope field',
    blurb: 'Arrows on a grid from two expressions in x and y',
    home: 'mathematics/plots',
    aliases: ['direction field', 'quiver', 'differential equation', 'ODE', 'vector field'],
    file: 'field',
    model: slopeField
  },
  {
    id: 'venn',
    mode: 'form',
    title: presetFor('venn')!.label,
    blurb: 'Two or three sets, with regions shaded and counted',
    home: 'mathematics/statistics',
    also: ['others/charts'],
    aliases: ['sets', 'union', 'intersection', 'complement', 'probability'],
    file: 'venn',
    model: () => newFormModel('venn')
  },
  {
    id: 'state-machine',
    mode: 'tikz',
    title: 'State machine',
    blurb: 'States, accepting states, a start arrow and labelled transitions',
    home: 'computing/software',
    also: ['engineering/digital'],
    aliases: ['automaton', 'automata', 'DFA', 'NFA', 'finite state machine', 'FSM', 'transition'],
    file: 'automaton',
    model: stateMachine
  },
  {
    id: 'state-machine-typst',
    mode: 'fletcher',
    title: 'State machine in Typst',
    blurb: 'States and transitions for a Typst document',
    home: 'computing/software',
    also: ['engineering/digital'],
    aliases: ['automaton', 'automata', 'DFA', 'NFA', 'finite state machine', 'FSM', 'Typst'],
    file: 'automaton',
    model: stateMachine
  },
  {
    id: 'model-architecture',
    mode: 'tikz',
    title: 'Model architecture',
    blurb: 'Layers, operators and vectors, with blocks repeated ×N',
    home: 'computing/learning',
    aliases: ['neural network', 'transformer', 'machine learning', 'deep learning', 'encoder', 'layers'],
    file: 'model',
    model: modelArchitecture
  },
  {
    id: 'structure',
    mode: 'structures',
    title: 'Structure (beams, trusses, frames)',
    blurb: 'Supports and loads on beams, trusses and frames, solved: reactions, shear force and bending moment diagrams',
    home: 'engineering/mechanical',
    also: ['physics/mechanics'],
    aliases: ['beam', 'truss', 'frame', 'SFD', 'BMD', 'shear', 'moment', 'free-body diagram', 'FBD', 'reactions', 'method of joints', 'method of sections', 'statics'],
    file: 'structure',
    model: sampleBeam
  },
  {
    id: 'mohr',
    mode: 'form',
    title: presetFor('mohr')!.label,
    blurb: 'Principal stresses and maximum shear from σx, σy and τxy, with stress elements',
    home: 'engineering/mechanical',
    also: ['physics/mechanics'],
    aliases: ['Mohr', 'stress', 'principal stress', 'shear', 'stress transformation', 'stress element'],
    file: 'mohr',
    model: () => newFormModel('mohr')
  },
  // the Form frame's test preset, which the chooser lists in development builds only
  {
    id: 'form-test',
    mode: 'form',
    title: presetFor('test')!.label,
    blurb: 'A test of the Form frame: fields and a live preview',
    home: 'others/charts',
    file: 'form',
    model: () => newFormModel('test'),
    dev: true
  }
];

export const starterFor = (id: string) => STARTERS.find((s) => s.id === id);

const groupLabel = (group: string) => {
  const [category, id] = group.split('/');
  return CATEGORIES.find((c) => c.id === category)?.groups.find(([g]) => g === id)?.[1] ?? group;
};
const categoryLabel = (group: string) => CATEGORIES.find((c) => c.id === group.split('/')[0])?.label ?? '';

export type Section = { id: string; label: string; starters: Starter[] };

/**
 * The gallery's sections for a view, in the categories' order and each starter in the list's: in All, each starter
 * once under its home group (headed with its category); in a category, under every group of it the starter is in.
 */
export function sectionsFor(view: 'all' | CategoryId, starters: Starter[] = STARTERS): Section[] {
  const categories = view === 'all' ? CATEGORIES : CATEGORIES.filter((c) => c.id === view);
  return categories.flatMap((category) =>
    category.groups.flatMap(([id, label]) => {
      const group = `${category.id}/${id}`;
      const shown = starters.filter((s) => s.home === group || (view !== 'all' && s.also?.includes(group)));
      return shown.length ? [{ id: group, label: view === 'all' ? `${category.label} › ${label}` : label, starters: shown }] : [];
    })
  );
}

/** Lower case, without accents, for matching typed text. */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Every word typed is in the text. */
const matches = (query: string, haystack: string[]) => {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const text = fold(haystack.join(' '));
  return words.length > 0 && words.every((word) => text.includes(word));
};

/** The starter whose drawing a set's symbol is placed in: the first that opens the set. */
const starterOfSet = (set: string, starters: Starter[]) =>
  starters.find((s) => (set === 'circuitikz' ? s.mode === 'circuitikz' : s.sets?.includes(set)));

/**
 * The starters and symbols matching a search: a starter by its title, aliases, groups, categories and packages; a
 * symbol by its label or aliases, listed with the starter it opens in (“Resistor, in Circuit”).
 */
export function search(query: string, starters: Starter[] = STARTERS): { starters: Starter[]; symbols: { starter: Starter; symbol: SetSymbol }[] } {
  const found = starters.filter((s) =>
    matches(query, [s.title, s.blurb, ...(s.aliases ?? []), ...[s.home, ...(s.also ?? [])].flatMap((g) => [groupLabel(g), categoryLabel(g)]), ...MODE_FACTS[s.mode].packages, s.mode])
  );
  const symbols = SETS.flatMap((set) => {
    const starter = starterOfSet(set.id, starters);
    if (!starter) return [];
    return set.symbols.filter((symbol) => matches(query, [symbol.label, ...(symbol.aliases ?? [])])).map((symbol) => ({ starter, symbol }));
  });
  return { starters: found, symbols };
}

/** Recently used after creating from a starter: it first, at most eight. */
export const usedNow = (recent: string[], id: string) => [id, ...recent.filter((r) => r !== id)].slice(0, 8);
