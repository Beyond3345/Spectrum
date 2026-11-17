// The chooser's starters: a card each, naming the mode it opens, what it starts with, and where it's listed. The
// categories classify starters, not modes: a starter sits under its home group and is cross-listed under others.
import * as circuitTemplates from './modes/circuitikz/templates';
import { TEMPLATES } from './modes/mermaid/templates';
import { newFormModel, presetFor } from './modes/form/presets';
import { bodeMagnitude, conics, dampedOscillation, gradingCurve, lissajous, normalCurve, phasePortrait, polarRose, signalSketch, slopeField, stressStrain } from './modes/pgfplots/code';
import { sampleBeam } from './modes/structures/model';
import * as structureTemplates from './modes/structures/templates';
import { angleBetween, cevians, dividingSegment, forcePolygon, freeBody, lineFromEquation, lineThroughPoints, parallelogramLaw, positionVectors, projections, scalarMultiples, triangleLaw, triangleMidpoints } from './modes/vectors/model';
import { decisionFlowchart, feedbackLoop, modelArchitecture, modelArchitectureTypst, stateMachine, swimlanes } from './modes/tikz/examples';
import { FLETCHER_SHAPES } from './modes/tikz/code';
import type { Shape } from './modes/tikz/code';
import { exactSequence, pullback, square } from './modes/tikzcd/examples';
import { SETS } from './sets';
import { styleHidden } from './universityStyles';
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
      ['geometry', 'Geometry and vectors'],
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
      ['general', 'General drawing'],
      ['flowcharts', 'Flowcharts and block diagrams'],
      ['planning', 'Planning'],
      ['charts', 'Charts'],
      ['images', 'Images'],
      ['chemistry', 'Chemistry and life sciences']
    ]
  }
];

export type StarterMode = 'circuitikz' | 'pgfplots' | 'tikz' | 'tikz-cd' | 'mermaid' | 'fletcher' | 'form' | 'structures' | 'vectors';

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
  /** the start of a new file's name: circuit gives diagrams/circuit-1.tex */
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
  structures: { language: 'tikz', packages: ['TikZ'] },
  vectors: { language: 'tikz', packages: ['TikZ'] }
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

/** Beams, trusses and frames that open pre-drawn and solved (modes/structures/templates). */
const structure = (id: string, title: string, blurb: string, model: () => unknown, aliases: string[]): Starter =>
  ({ id, mode: 'structures', title, blurb, home: 'engineering/mechanical', also: ['physics/mechanics'], aliases: [...aliases, 'statics', 'reactions'], file: id, model });
const STRUCTURE_TEMPLATES: Starter[] = [
  structure('cantilever', 'Cantilever', 'Fixed at one end, a point load and a moment at the other', structureTemplates.cantilever, ['beam', 'fixed support', 'SFD', 'BMD']),
  structure('overhanging-beam', 'Overhanging beam', 'A uniform load between the supports and a point load on the overhang', structureTemplates.overhangingBeam, ['beam', 'overhang', 'SFD', 'BMD']),
  structure('propped-cantilever', 'Propped cantilever', 'Fixed at one end and on a roller at the other, indeterminate', structureTemplates.proppedCantilever, ['beam', 'indeterminate', 'SFD', 'BMD']),
  structure('two-span-beam', 'Two-span beam', 'A continuous beam over three supports, indeterminate', structureTemplates.twoSpanBeam, ['beam', 'continuous beam', 'indeterminate', 'SFD', 'BMD']),
  structure('hinged-beam', 'Beam with an internal hinge', 'A Gerber beam: fixed, hinged and on a roller', structureTemplates.hingedBeam, ['beam', 'Gerber', 'internal hinge', 'compound beam', 'SFD', 'BMD']),
  structure('triangular-load', 'Triangular load', 'A simply supported beam under a linearly varying load', structureTemplates.triangularLoad, ['beam', 'linearly varying load', 'distributed load', 'SFD', 'BMD']),
  structure('pratt-truss', 'Pratt truss', 'Diagonals in tension, with a section cut placed', structureTemplates.prattTruss, ['truss', 'method of joints', 'method of sections', 'member forces']),
  structure('howe-truss', 'Howe truss', 'Diagonals in compression, with a section cut placed', structureTemplates.howeTruss, ['truss', 'method of joints', 'method of sections', 'member forces']),
  structure('warren-truss', 'Warren truss', 'Triangles without verticals, with a section cut placed', structureTemplates.warrenTruss, ['truss', 'method of joints', 'method of sections', 'member forces']),
  structure('portal-frame', 'Portal frame', 'Fixed feet, a sideways load and a load along the beam', structureTemplates.portalFrame, ['frame', 'sway', 'indeterminate', 'SFD', 'BMD']),
  structure('three-hinged-frame', 'Three-hinged frame', 'Pinned feet and a hinged ridge, snow on plan and wind', structureTemplates.threeHingedFrame, ['frame', 'three-pinned', 'arch', 'roof', 'snow', 'portal']),
  structure('inclined-member', 'Inclined member', 'A sloping beam under a load along its length', structureTemplates.inclinedMember, ['beam', 'inclined', 'rafter', 'ramp', 'stair'])
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
    // every symbol set on, for anyone unsure where a drawing belongs; plotters stay in their own composers
    id: 'general-drawing',
    mode: 'circuitikz',
    title: 'General drawing',
    blurb: 'Every symbol on one canvas: circuits, logic, supports, pipes and tanks, test specimens, flowchart shapes, points and marks, lines and arrows',
    home: 'others/general',
    aliases: ['general', 'drawing', 'sketch', 'symbols', 'mixed', 'anything', 'blank', 'shapes', 'lines', 'arrows', 'fluid mechanics', 'hydrostatics', 'construction materials'],
    file: 'drawing',
    sets: SETS.filter((set) => set.id !== 'circuitikz').map((set) => set.id)
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
    id: 'stress-strain',
    mode: 'pgfplots',
    title: 'Stress–strain curve',
    blurb: 'Yield, ultimate strength and fracture marked, with an unloading line and the area under the curve',
    home: 'engineering/mechanical',
    also: ['physics/mechanics'],
    aliases: ['tensile test', 'mild steel', 'yield point', 'toughness', 'unloading', 'elastic', 'plastic', 'materials'],
    file: 'stress-strain',
    model: stressStrain
  },
  {
    id: 'grading-curve',
    mode: 'pgfplots',
    title: 'Grading curve',
    blurb: 'Percent passing against sieve size on a log axis, inside a grading envelope',
    home: 'engineering/mechanical',
    aliases: ['particle size distribution', 'sieve analysis', 'PSD', 'aggregate', 'sand', 'gradation', 'envelope', 'ASTM C33'],
    file: 'grading',
    model: gradingCurve
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
  // flowcharts, block diagrams and commutative diagrams that open pre-drawn
  {
    id: 'decision-flowchart',
    mode: 'tikz',
    title: 'Decision flowchart',
    blurb: 'Start, an input, a yes-or-no question that loops back, and the end',
    home: 'others/flowcharts',
    also: ['computing/software'],
    aliases: ['decision', 'algorithm', 'yes no', 'branch', 'loop', 'process', 'flow chart'],
    file: 'decision',
    model: decisionFlowchart
  },
  {
    id: 'feedback-loop',
    mode: 'tikz',
    title: 'Feedback loop',
    blurb: 'A summing junction with its signs, a gain, a plant and a takeoff point back through H(s)',
    home: 'engineering/signals',
    also: ['others/flowcharts'],
    aliases: ['block diagram', 'control', 'closed loop', 'transfer function', 'summing junction', 'gain', 'takeoff point'],
    file: 'feedback',
    model: feedbackLoop
  },
  {
    id: 'swimlane',
    mode: 'tikz',
    title: 'Swimlane process',
    blurb: 'Each step in the lane of who does it',
    home: 'others/flowcharts',
    also: ['others/planning'],
    aliases: ['swimlane', 'swim lane', 'lanes', 'cross-functional', 'process', 'workflow', 'flow chart'],
    file: 'swimlane',
    model: swimlanes
  },
  {
    id: 'model-architecture-typst',
    mode: 'fletcher',
    title: 'Model architecture in Typst',
    blurb: 'Layers and operators in a block repeated ×N, for a Typst document',
    home: 'computing/learning',
    aliases: ['neural network', 'transformer', 'machine learning', 'deep learning', 'encoder', 'layers', 'Typst'],
    file: 'model',
    model: modelArchitectureTypst
  },
  {
    id: 'commutative-square',
    mode: 'tikz-cd',
    title: 'Commutative square',
    blurb: 'Four objects and the two ways round, f then h and g then k',
    home: 'mathematics/algebra',
    aliases: ['category theory', 'square', 'morphism', 'commutes'],
    file: 'square',
    model: square
  },
  {
    id: 'pullback',
    mode: 'tikz-cd',
    title: 'Pullback',
    blurb: 'P with its maps p₁ and p₂, and the one arrow u from any X',
    home: 'mathematics/algebra',
    aliases: ['category theory', 'fibre product', 'fiber product', 'universal property', 'limit'],
    file: 'pullback',
    model: pullback
  },
  {
    id: 'exact-sequence',
    mode: 'tikz-cd',
    title: 'Short exact sequence',
    blurb: '0 → A → B → C → 0, with f and g',
    home: 'mathematics/algebra',
    aliases: ['exact sequence', 'homological algebra', 'chain', 'category theory'],
    file: 'exact-sequence',
    model: exactSequence
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
  ...STRUCTURE_TEMPLATES,
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
  // more plots, and Mermaid's other kinds of diagram
  ...([
    ['normal-curve', 'Normal curve', 'The standard normal density with its upper tail shaded beyond z = 1.645', 'mathematics/statistics', [], ['normal distribution', 'bell curve', 'Gaussian', 'z-score', 'hypothesis test', 'significance', 'tail', 'p-value'], normalCurve],
    ['bode-magnitude', 'Bode magnitude plot', 'Gain in dB against frequency on a log axis, with the asymptotes and the corner', 'engineering/signals', ['engineering/electrical'], ['Bode', 'frequency response', 'decibel', 'low-pass', 'filter', 'corner frequency', 'cut-off'], bodeMagnitude],
    ['damped-oscillation', 'Damped oscillation', 'A decaying cosine inside its exponential envelope', 'physics/waves', ['physics/mechanics', 'engineering/signals'], ['damping', 'underdamped', 'decay', 'envelope', 'vibration', 'oscillator', 'transient'], dampedOscillation],
    ['polar-rose', 'Polar rose', 'r = cos 3t, three petals on equal axes', 'mathematics/plots', [], ['polar', 'rose', 'rhodonea', 'petals', 'polar curve'], polarRose],
    ['lissajous', 'Lissajous figure', 'x = sin 3t against y = sin 2t on equal axes', 'mathematics/plots', ['physics/waves', 'engineering/signals'], ['Lissajous', 'parametric', 'oscilloscope', 'XY mode', 'phase'], lissajous],
    ['conic-sections', 'Conics', 'An ellipse, a hyperbola and a parabola with their equations', 'mathematics/geometry', ['mathematics/plots'], ['conic sections', 'ellipse', 'hyperbola', 'parabola', 'parametric'], conics],
    ['phase-portrait', 'Phase portrait', 'The field of a damped oscillator with a trajectory spiralling in', 'mathematics/plots', ['physics/mechanics', 'engineering/signals'], ['phase plane', 'vector field', 'quiver', 'trajectory', 'ODE', 'differential equation', 'stability', 'spiral'], phasePortrait]
  ] as const).map(([id, title, blurb, home, also, aliases, model]): Starter => ({ id, mode: 'pgfplots', title, blurb, home, ...(also.length && { also: [...also] }), aliases: [...aliases], file: id, model })),
  ...([
    ['er', 'Entity–relationship diagram', 'Tables, their keys and how they relate, written as text', 'computing/software', ['ER', 'ERD', 'database', 'schema', 'entity', 'relationship', 'crow’s foot'], 'er-diagram'],
    ['pie', 'Pie chart', 'Shares of a whole, written as text', 'others/charts', ['pie', 'proportion', 'share', 'percentage'], 'pie'],
    ['xychart', 'Bar and line chart', 'Bars and a line over categories, written as text', 'others/charts', ['bar chart', 'line chart', 'xychart', 'column chart'], 'chart'],
    ['mindmap', 'Mind map', 'Ideas branching from one centre, written as text', 'others/planning', ['mind map', 'brainstorm', 'ideas', 'outline'], 'mindmap'],
    ['timeline', 'Timeline', 'Events by period, written as text', 'others/planning', ['timeline', 'milestones', 'history', 'chronology'], 'timeline'],
    ['gitgraph', 'Git graph', 'Commits, branches and merges, written as text', 'computing/software', ['git', 'branch', 'merge', 'commit', 'version control'], 'gitgraph']
  ] as const).map(([template, title, blurb, home, aliases, file]): Starter => ({ id: `mermaid-${template}`, mode: 'mermaid', title, blurb, home, aliases: [...aliases], file, model: mermaid(template) })),
  // fluid mechanics, worked out from a form
  ...([
    ['gate', 'The resultant force, centre of pressure and stop force on a gate, with its pressure prism', ['hydrostatic', 'gate', 'sluice', 'plane surface', 'pressure prism', 'centre of pressure', 'center of pressure', 'hinge', 'ridge', 'submerged', 'dam', 'fluid statics']],
    ['manometer', 'U-tube, differential, inverted or multi-fluid, with the pressure difference', ['manometer', 'U-tube', 'differential', 'inverted', 'mercury', 'pressure difference', 'gauge pressure', 'piezometer', 'fluid statics']],
    ['tank', 'The tilted free surface under an acceleration, with θ, the depths and pressures', ['accelerating', 'tank', 'rigid-body motion', 'rigid body', 'free surface', 'acceleration', 'truck', 'incline', 'spill', 'fluid statics']],
    ['floating', 'Draught, G, B and M of a floating block, with the metacentric height', ['buoyancy', 'floating', 'stability', 'metacentre', 'metacenter', 'metacentric height', 'Archimedes', 'draught', 'draft', 'barge', 'fluid statics']]
  ] as const).map(([id, blurb, aliases]): Starter => ({
    id,
    mode: 'form',
    title: presetFor(id)!.label,
    blurb,
    home: 'engineering/mechanical',
    also: ['physics/mechanics'],
    aliases: [...aliases],
    file: id,
    model: () => newFormModel(id)
  })),
  // maths, worked out from a form
  ...([
    ['conic', 'From its equation or its own numbers: classified, with foci, vertices, directrix, asymptotes and turned axes', ['conic', 'conics', 'conic section', 'ellipse', 'hyperbola', 'parabola', 'circle', 'focus', 'foci', 'directrix', 'asymptote', 'eccentricity', 'general equation', 'completing the square', 'rotated conic', 'quadratic form']],
    ['transformation', 'A 2×2 matrix on the unit square or a grid, with the images of e₁ and e₂, the determinant and the eigenvectors', ['matrix', 'linear map', 'linear transformation', 'eigenvector', 'eigenvalue', 'determinant', 'shear', 'rotation', 'reflection', 'unit square', 'basis', 'linear algebra']]
  ] as const).map(([id, blurb, aliases]): Starter => ({ id, mode: 'form', title: presetFor(id)!.label, blurb, home: 'mathematics/geometry', aliases: [...aliases], file: id, model: () => newFormModel(id) })),
  // vector diagrams: the user's own figures, then forces, the sum laws and 2.5's constructions
  ...([
    ['vectors', 'Vector diagram', 'Points, vectors, midpoints and projections on axes, kept exact as points move', undefined, ['axes', 'coordinates', 'geometry', 'position vector', 'midpoint', 'projection', 'construction']],
    ['vector-line', 'Line through two points', 'A line through U and V with position vectors u and v and direction d = v − u', lineThroughPoints, ['position vector', 'direction vector', 'vector equation of a line']],
    ['vector-ratio', 'Dividing a segment in a ratio', 'M on AB with AM : MB = 1 : 2, and the vectors a, b and m from O', dividingSegment, ['ratio', 'section formula', 'internal division']],
    ['vector-midpoints', 'Midpoints of a triangle', 'PQ joins the midpoints of OA and OB, parallel to AB and half as long', triangleMidpoints, ['midpoint theorem', 'midpoint']],
    ['vector-projections', 'Projections', 'The projection of b onto a in three panels: acute, right and obtuse', projections, ['projection', 'foot', 'dot product', 'scalar product']],
    ['vector-free-body', 'Free-body diagram on a block', 'A block with its weight, the normal reaction, a pull and friction', freeBody, ['FBD', 'free body', 'forces', 'friction', 'normal reaction', 'weight']],
    ['vector-triangle-law', 'Triangle law', 'b drawn from the tip of a, and the resultant a + b', triangleLaw, ['vector addition', 'head to tail', 'resultant']],
    ['vector-parallelogram-law', 'Parallelogram law', 'a and b from one point, the dashed sides and the diagonal a + b', parallelogramLaw, ['parallelogram', 'vector addition', 'resultant']],
    ['vector-force-polygon', 'Force polygon', 'Four forces head to tail and the resultant closing the polygon', forcePolygon, ['polygon of forces', 'resultant', 'equilibrium', 'forces']],
    ['vector-position-ij', 'Position vectors with i and j', 'P(3, 2) with r = 3i + 2j and the unit vectors i and j', positionVectors, ['unit vector', 'components', 'i j', 'position vector']],
    ['vector-cevians', 'Medians of a triangle', 'The medians meeting at the centroid G, each side’s halves ticked alike', cevians, ['cevian', 'centroid', 'median', 'intersection', 'equal-length ticks']],
    ['vector-angle', 'Angle between two vectors', 'θ between a and b, with cos θ from their dot product', angleBetween, ['angle', 'theta', 'dot product', 'scalar product', 'cosine']],
    ['vector-eqline', 'Line from its equation', '2x + 3y − 6 = 0 with its intercepts and its normal n', lineFromEquation, ['intercepts', 'normal vector', 'linear equation', 'ax + by + c = 0']],
    ['vector-scalar-multiples', 'Scalar multiples', 'v with 2v, −v and ½v beside it, following v as it moves', scalarMultiples, ['scalar multiple', 'parallel vectors', 'scaling']]
  ] as const).map(([id, title, blurb, model, aliases]): Starter => ({
    id,
    mode: 'vectors',
    title,
    blurb,
    home: 'mathematics/geometry',
    also: ['physics/mechanics'],
    aliases: ['vector', 'vectors', ...aliases],
    file: id === 'vectors' ? 'vectors' : id,
    ...(model && { model })
  })),
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

/**
 * Every word typed is in the text: a short one (up to three letters) at the start of a word, so "op amp" doesn't find
 * a ramp or a damped curve, and a longer one anywhere, so "mosfet" still finds nMOSFET.
 */
const matches = (query: string, haystack: string[]) => {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const text = fold(haystack.join(' '));
  // ponytail: three letters is the line between a stray fragment and a word worth finding inside another
  const atStart = (word: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(text);
  return words.length > 0 && words.every((word) => (word.length > 3 ? text.includes(word) : atStart(word)));
};

/**
 * The flowchart canvas's shapes, which search finds as it finds a set's symbols: a shape opens the Flowchart (and, for
 * one fletcher writes, the Typst one) with its tool picked. Their labels are the rail's (modes/tikz/index.tsx).
 */
const FLOW_SHAPES: [Shape, string, string[]][] = [
  ['rectangle', 'Rectangle', ['process', 'step', 'box', 'block']],
  ['rounded', 'Rounded rectangle', ['process', 'box', 'layer']],
  ['circle', 'Circle', ['node', 'connector']],
  ['ellipse', 'Ellipse', ['oval']],
  ['diamond', 'Diamond', ['decision', 'condition', 'branch', 'if']],
  ['parallelogram', 'Parallelogram', ['input', 'output', 'data', 'read', 'print']],
  ['state', 'State', ['automaton']],
  ['accepting', 'Accepting state', ['final state', 'automaton']],
  ['cylinder', 'Cylinder (data store)', ['database', 'storage']],
  ['document', 'Document', ['report', 'file']],
  ['trapezium', 'Trapezium (manual step)', ['manual operation']],
  ['operator', 'Operator circle', ['summing junction', 'adder', 'sum', 'plus']],
  ['stack', 'Vector stack', ['vector', 'embedding', 'tensor']],
  ['container', 'Container', ['group', 'block', 'repeat']],
  ['terminal', 'Terminal (start or end)', ['start', 'end', 'stop', 'begin', 'terminator']],
  ['manualInput', 'Manual input', ['keyboard', 'input']],
  ['offPage', 'Off-page connector', ['connector', 'continued']],
  ['gain', 'Gain (block diagram)', ['amplifier', 'triangle', 'control']],
  ['takeoff', 'Takeoff point', ['branch point', 'pickoff', 'junction']],
  ['swimlane', 'Swimlane', ['lane', 'pool', 'actor']]
];

/** A starter's drawings have a set's symbols: circuitikz's are in every circuit, another set's where the starter opens it. */
const holds = (s: Starter, set: string) => s.mode === 'circuitikz' && (set === 'circuitikz' || !!s.sets?.includes(set));

/** The starters a set's symbol is placed in: the first that opens the set, and General drawing, which has them all. */
const startersOfSet = (set: string, starters: Starter[]) =>
  [...new Set([starters.find((s) => s.id !== 'general-drawing' && holds(s, set)), starters.find((s) => s.id === 'general-drawing')])].filter((s): s is Starter => !!s && holds(s, set));

/**
 * The starters and symbols matching a search: a starter by its title, aliases, groups, categories and packages; a
 * symbol by its label or aliases, listed with the starter it opens in (“Resistor, in Circuit”), unless its university
 * style is switched off (stylesOff). A symbol's `tool` is the tool it opens with, when it isn't the circuit canvas's
 * part:<id> (a flowchart shape's).
 */
export function search(query: string, starters: Starter[] = STARTERS, stylesOff: string[] = []): { starters: Starter[]; symbols: { starter: Starter; symbol: SetSymbol; tool?: string }[] } {
  // by relevance: a match in the title, then in the blurb or aliases, then the rest; the sort keeps definition order within each
  const rank = (s: Starter) => (matches(query, [s.title]) ? 0 : matches(query, [s.title, s.blurb, ...(s.aliases ?? [])]) ? 1 : 2);
  const found = starters
    .filter((s) => matches(query, [s.title, s.blurb, ...(s.aliases ?? []), ...[s.home, ...(s.also ?? [])].flatMap((g) => [groupLabel(g), categoryLabel(g)]), ...MODE_FACTS[s.mode].packages, s.mode]))
    .sort((a, b) => rank(a) - rank(b));
  // the Flowchart's shapes first, so “decision” opens the Flowchart before General drawing's shape
  const flow = ['flowchart', 'flowchart-typst'].flatMap((id) => starters.filter((s) => s.id === id));
  const shapes = FLOW_SHAPES.filter(([, label, aliases]) => matches(query, [label, ...aliases, 'flowchart shape'])).flatMap(([tool, label, aliases]) =>
    flow.filter((starter) => starter.mode === 'tikz' || FLETCHER_SHAPES.includes(tool)).map((starter) => ({ starter, symbol: { id: tool, label, group: 'Flowchart shapes', aliases }, tool }))
  );
  const symbols = SETS.flatMap((set) =>
    set.symbols.filter((symbol) => !styleHidden(symbol.style, stylesOff) && matches(query, [symbol.label, ...(symbol.aliases ?? [])])).flatMap((symbol) => startersOfSet(set.id, starters).map((starter) => ({ starter, symbol })))
  );
  return { starters: found, symbols: [...shapes, ...symbols] };
}

/** Recently used after creating from a starter: it first, at most eight. */
export const usedNow = (recent: string[], id: string) => [id, ...recent.filter((r) => r !== id)].slice(0, 8);
