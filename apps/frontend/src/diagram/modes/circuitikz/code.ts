// The circuit as circuitikz code: one \draw or \node per element with plain coordinates in cm, and the
// style as picture options and \ctikzset, so the document's preamble needs only \usepackage{circuitikz}. A part from
// another symbol set is a \pic, defined inside the picture (only the ones used), its set's packages and libraries
// added to what the document loads.
import { SYMBOL_SETS, picDefinition } from '../../../../../backend/src/data/symbolSets.js';
import { unitWriter } from '../../units';
import { CATALOGUE, GRID_CM, PARTS, isPoint } from './model';
import type { CircuitModel, Element, End, Mark, NodePart, PathPart, Wire } from './model';

export interface CircuitStyle {
  preset: 'american' | 'european';
  /** left out: the preset's own */
  inductors?: 'cute' | 'american' | 'european';
  /** left out: the preset's own */
  resistors?: 'american' | 'european';
  /** how a voltage is marked: + and − (american), an arrow (european), a straight arrow, or + and − raised off the
   * part; left out: the preset's own */
  voltages?: 'american' | 'european' | 'straight' | 'raised';
  /** left out: circuitikz's default, noold */
  voltageDir?: 'noold' | 'RP' | 'EF';
  /** before siUnits: values typed as 4.7<\kilo\ohm> are written with siunitx's \SI (a drawing that has it keeps it) */
  siunitx?: boolean;
  /** values that read as a number and a unit (10 kΩ, 4.7 µF) are written with siunitx's \qty (units.ts) */
  siUnits?: boolean;
  /** with siUnits, values as \SI, as the document the drawing went in loads physics (units.ts) */
  physics?: boolean;
  /** logic gates: left out, as the symbols; ieee needs circuitikz 1.1 (2020) */
  logic?: 'american' | 'european' | 'ieee';
  /** a European gate's inverted output: left out, circuitikz's triangle */
  notSymbol?: 'circle';
  /** left out: circuitikz's default, empty */
  diodes?: 'full' | 'empty' | 'stroke';
  /** left out: circuitikz's default, smart */
  labels?: 'smart' | 'straight' | 'rotate';
  /** bipoles/length in cm; circuitikz's default is 1.4 */
  length?: number;
}

export const DEFAULT_LENGTH = 1.4;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

/** The style kept in the diagram file, with anything unknown or default dropped. */
export function readStyle(raw: Record<string, unknown>): CircuitStyle {
  const preset = raw.preset === 'european' ? 'european' : 'american';
  const inductors = oneOf(raw.inductors, ['cute', 'american', 'european'] as const);
  const resistors = oneOf(raw.resistors, ['american', 'european'] as const);
  const voltages = oneOf(raw.voltages, ['american', 'european', 'straight', 'raised'] as const);
  const voltageDir = oneOf(raw.voltageDir, ['RP', 'EF'] as const);
  const diodes = oneOf(raw.diodes, ['full', 'stroke'] as const);
  const labels = oneOf(raw.labels, ['straight', 'rotate'] as const);
  const logic = oneOf(raw.logic, ['american', 'european', 'ieee'] as const);
  const length = typeof raw.length === 'number' && raw.length >= 0.5 && raw.length <= 4 && raw.length !== DEFAULT_LENGTH ? raw.length : undefined;
  return {
    preset,
    ...(inductors && inductors !== preset ? { inductors } : null),
    ...(resistors && resistors !== preset ? { resistors } : null),
    ...(voltages && voltages !== preset ? { voltages } : null),
    ...(voltageDir ? { voltageDir } : null),
    ...(raw.siunitx === true ? { siunitx: true } : null),
    ...(raw.siUnits === true ? { siUnits: true } : null),
    ...(raw.physics === true ? { physics: true } : null),
    ...(logic && logic !== preset ? { logic } : null),
    ...(raw.notSymbol === 'circle' ? { notSymbol: 'circle' as const } : null),
    ...(diodes ? { diodes } : null),
    ...(labels ? { labels } : null),
    ...(length ? { length } : null)
  };
}

const num = (v: number) => {
  const rounded = Math.round(v * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

/** The logic gates' own keys, when they differ from the preset's: the ports, and a European gate's NOT symbol. */
function logicKeys(style: CircuitStyle) {
  const ports = style.logic || style.preset;
  return [style.logic && `${style.logic} ports`, ports === 'european' && style.notSymbol && `tripoles/european not symbol=${style.notSymbol}`].filter(Boolean) as string[];
}

/**
 * The keys that change how symbols look, as picture options: what the symbol generator puts on its circuitikz picture.
 * \ctikzset's own keys go under circuitikz/, which TikZ needs for them (and bare diode= leaves the keys after it
 * looked for there twice).
 */
export function symbolOptions(style: CircuitStyle) {
  const logic = logicKeys(style);
  return [
    style.preset,
    ...logic.filter((key) => key.endsWith(' ports')),
    style.inductors && `${style.inductors} inductors`,
    style.resistors && `${style.resistors} resistors`,
    ...[...logic.filter((key) => !key.endsWith(' ports')), style.diodes && `diode=${style.diodes}`, style.length && `bipoles/length=${num(style.length)}cm`].filter(Boolean).map((key) => `circuitikz/${key}`)
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * TikZ-level keys go on the picture; circuitikz's own go in \ctikzset at its start. Every key is written, defaults
 * too, so a document's own circuitikz options or \ctikzset can't make the PDF differ from the preview.
 */
function styleCode(style: CircuitStyle) {
  const picture = [
    style.preset,
    `${style.inductors || style.preset} inductors`,
    `${style.resistors || style.preset} resistors`,
    `${style.voltages || style.preset} voltages`,
    `voltage dir=${style.voltageDir || 'noold'}`,
    // only when chosen, so a drawing from before the choice writes what it did
    ...logicKeys(style).filter((key) => key.endsWith(' ports'))
  ];
  const ctikz = [
    ...logicKeys(style).filter((key) => !key.endsWith(' ports')),
    `label/align=${style.labels || 'smart'}`, `diode=${style.diodes || 'empty'}`, `bipoles/length=${num(style.length || DEFAULT_LENGTH)}cm`];
  return { picture: picture.join(', '), ctikz: `\\ctikzset{${ctikz.join(', ')}}` };
}

/** Text the user typed is maths unless it brings its own $…$. */
const maths = (text: string) => (text.includes('$') ? text : `$${text}$`);

const safeName = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, '') || 'X';

export function circuitCode(model: CircuitModel, rawStyle: Record<string, unknown>): { body: string; packages: string[]; libraries: string[] } {
  const style = readStyle(rawStyle);
  const byId = new Map(model.elements.map((el) => [el.id, el]));
  let siunitxUsed = false;

  // a part needs a name in the code when something attaches to one of its anchors
  const named = new Set<string>();
  const note = (end: End) => {
    if (isPoint(end)) return;
    const el = byId.get(end.part);
    if (el?.kind === 'node' || (el?.kind === 'path' && end.pin !== 'a' && end.pin !== 'b')) named.add(el.id);
    if (el?.kind === 'path' && (end.pin === 'a' || end.pin === 'b')) note(el[end.pin]);
  };
  for (const el of model.elements) {
    if (el.kind === 'wire') el.points.forEach(note);
    if (el.kind === 'path') [el.a, el.b].forEach(note);
  }
  model.junctions.forEach(note);
  // Wires bind by element id; repeated or sanitised user names must not redirect them to another part.
  const names = new Map<string, string>();
  const takenNames = new Set<string>();
  for (const el of model.elements.filter((el) => el.kind !== 'wire')) {
    const base = safeName(el.name || el.id);
    let name = base;
    for (let n = 2; takenNames.has(name); n += 1) name = `${base}_${n}`;
    takenNames.add(name);
    names.set(el.id, name);
  }
  const nameOf = (el: Element) => names.get(el.id) || safeName(el.id);

  const at = (end: End, depth = 0): string => {
    if (isPoint(end)) return `(${num(end.x * GRID_CM)},${num(end.y * GRID_CM)})`;
    const el = byId.get(end.part);
    if (!el || el.kind === 'wire' || depth > 4) return '(0,0)';
    if (el.kind === 'path' && (end.pin === 'a' || end.pin === 'b')) return at(el[end.pin], depth + 1);
    // a pic names its pins' coordinates <pic>-<pin>
    return PARTS.get(el.type)?.set ? `(${nameOf(el)}-${end.pin})` : `(${nameOf(el)}.${end.pin})`;
  };

  const units = unitWriter(!!style.siUnits, !!style.physics);
  const value = (text: string) => {
    if (style.siUnits) return units.typed(text) ?? maths(text);
    const si = style.siunitx && /^\s*([^<>]*)<([^<>]+)>\s*$/.exec(text);
    if (!si) return maths(text);
    siunitxUsed = true;
    return `\\SI{${si[1].trim()}}{${si[2].trim()}}`;
  };
  const mark = (letter: string, m: Mark | undefined) => (m?.text.trim() ? `${letter}${m.side || ''}${m.dir || ''}={${value(m.text)}}` : '');

  // the order circuitikz reads them in: part, options, mirror, invert, poles, size, name, text, label, voltage,
  // current, flow
  const pathCode = (el: PathPart) => {
    const part = PARTS.get(el.type);
    const [from, to] = el.poles || ['', ''];
    const size = el.size && el.size !== 1 ? `bipoles/length=${num((style.length || DEFAULT_LENGTH) * el.size)}cm` : '';
    const keys = [
      part?.tikz || 'short',
      ...(el.options || []),
      el.mirror && 'mirror',
      el.invert && 'invert',
      (from || to) && `${from}-${to}`,
      size,
      (el.name || named.has(el.id)) && `name=${nameOf(el)}`,
      part?.text && el.text?.trim() && `t={${el.text}}`,
      el.label?.text.trim() && `l${el.label.side === '_' ? '_' : ''}={${maths(el.label.text)}}`,
      el.value?.trim() && `a={${value(el.value)}}`,
      mark('v', el.voltage),
      mark('i', el.current),
      mark('f', el.flow)
    ].filter(Boolean);
    return `\\draw ${at(el.a)} to[${keys.join(', ')}] ${at(el.b)};`;
  };

  const nodeCode = (el: NodePart) => {
    const part = PARTS.get(el.type);
    const rotate = (((el.rotate || 0) % 360) + 360) % 360;
    const turns = [rotate && `rotate=${rotate}`, el.flipX && 'xscale=-1', el.flipY && 'yscale=-1'].filter(Boolean);
    const name = el.name || named.has(el.id) ? ` (${nameOf(el)})` : '';
    // a set's shape that takes text gets it as the pic's text, which its pic sets in a node (\\tikzpictext)
    const picKeys = [...turns, ...(part?.text && el.text?.trim() ? [`pic text={${el.text}}`] : [])];
    if (part?.set) return `\\pic${picKeys.length ? `[${picKeys.join(', ')}]` : ''}${name} at ${at(el.at)} {${part.tikz}};`;
    // Text is a plain node: its keys are only the turns
    const keys = [...(part && !part.tikz ? [] : [part?.tikz || 'circ']), ...(el.options || []), ...turns];
    return `\\node${keys.length ? `[${keys.join(', ')}]` : ''}${name} at ${at(el.at)} {${part?.text ? el.text || '' : ''}};`;
  };
  const arrowKey = { '->': '-latex', '<-': 'latex-', '<->': 'latex-latex' };

  const { picture, ctikz } = styleCode(style);
  // the other sets' pictures this drawing uses, in the catalogue's order
  const usedTypes = new Set(model.elements.map((el) => el.kind === 'node' && el.type));
  const pics = CATALOGUE.filter((part) => part.set && usedTypes.has(part.id) && SYMBOL_SETS[part.set]?.pics[part.tikz]);
  const sets = [...new Set(pics.map((part) => SYMBOL_SETS[part.set!]))];
  const definitions = pics.map((part) => picDefinition(part.tikz, SYMBOL_SETS[part.set!].pics[part.tikz]));
  const lines = [
    // nodes first, so wires and parts can reach their anchors
    ...model.elements.filter((el): el is NodePart => el.kind === 'node').map(nodeCode),
    ...model.elements.filter((el): el is PathPart => el.kind === 'path').map(pathCode),
    ...model.elements
      .filter((el): el is Wire => el.kind === 'wire' && el.points.length > 1)
      .map((el) => `\\draw${el.arrows ? `[${arrowKey[el.arrows]}]` : ''} ${el.points.map((p, i) => (i ? `${el.routes[i - 1] || '--'} ${at(p)}` : at(p))).join(' ')};`),
    ...model.junctions.map((j) => `\\node[circ] at ${at(j)} {};`)
  ];
  const body = [`\\begin{circuitikz}[${picture}]`, ctikz, ...definitions, ...lines, '\\end{circuitikz}'].join('\n');
  const packages = [...new Set(['circuitikz', ...sets.flatMap((set) => set.packages), ...(siunitxUsed || units.used ? ['siunitx'] : [])])];
  return { body, packages, libraries: [...new Set(sets.flatMap((set) => set.libraries))] };
}
