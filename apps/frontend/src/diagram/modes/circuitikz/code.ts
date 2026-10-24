// The circuit as circuitikz code: one \draw or \node per element with plain coordinates in cm, and the
// style as picture options and \ctikzset, so the document's preamble needs only \usepackage{circuitikz}.
import { GRID_CM, PARTS, isPoint } from './model';
import type { CircuitModel, Element, End, Mark, NodePart, PathPart, Wire } from './model';

export interface CircuitStyle {
  preset: 'american' | 'european';
  /** left out: the preset's own */
  inductors?: 'cute' | 'american' | 'european';
  /** left out: circuitikz's default, noold */
  voltageDir?: 'noold' | 'RP' | 'EF';
  /** values typed as 4.7<\kilo\ohm> are written with siunitx's \SI */
  siunitx?: boolean;
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
  const voltageDir = oneOf(raw.voltageDir, ['RP', 'EF'] as const);
  const diodes = oneOf(raw.diodes, ['full', 'stroke'] as const);
  const labels = oneOf(raw.labels, ['straight', 'rotate'] as const);
  const length = typeof raw.length === 'number' && raw.length >= 0.5 && raw.length <= 4 && raw.length !== DEFAULT_LENGTH ? raw.length : undefined;
  return {
    preset,
    ...(inductors && inductors !== preset ? { inductors } : null),
    ...(voltageDir ? { voltageDir } : null),
    ...(raw.siunitx === true ? { siunitx: true } : null),
    ...(diodes ? { diodes } : null),
    ...(labels ? { labels } : null),
    ...(length ? { length } : null)
  };
}

const num = (v: number) => {
  const rounded = Math.round(v * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

/** The keys that change how symbols look, valid inside \ctikzset{…}: what the symbol generator is given. */
export function symbolOptions(style: CircuitStyle) {
  return [
    style.preset,
    style.inductors && `${style.inductors} inductors`,
    style.diodes && `diode=${style.diodes}`,
    style.length && `bipoles/length=${num(style.length)}cm`
  ]
    .filter(Boolean)
    .join(', ');
}

/** TikZ-level keys go on the picture; circuitikz's own go in \ctikzset at its start. */
function styleCode(style: CircuitStyle) {
  const picture = [style.preset, style.inductors && `${style.inductors} inductors`, style.voltageDir && `voltage dir=${style.voltageDir}`].filter(Boolean);
  const ctikz = [style.labels && `label/align=${style.labels}`, style.diodes && `diode=${style.diodes}`, style.length && `bipoles/length=${num(style.length)}cm`].filter(Boolean);
  return { picture: picture.join(', '), ctikz: ctikz.length ? `\\ctikzset{${ctikz.join(', ')}}` : '' };
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
  const nameOf = (el: Element) => safeName((el.kind !== 'wire' && el.name) || el.id);

  const at = (end: End, depth = 0): string => {
    if (isPoint(end)) return `(${num(end.x * GRID_CM)},${num(end.y * GRID_CM)})`;
    const el = byId.get(end.part);
    if (!el || el.kind === 'wire' || depth > 4) return '(0,0)';
    if (el.kind === 'path' && (end.pin === 'a' || end.pin === 'b')) return at(el[end.pin], depth + 1);
    return `(${nameOf(el)}.${end.pin})`;
  };

  const value = (text: string) => {
    const si = style.siunitx && /^\s*([^<>]*)<([^<>]+)>\s*$/.exec(text);
    if (!si) return maths(text);
    siunitxUsed = true;
    return `\\SI{${si[1].trim()}}{${si[2].trim()}}`;
  };
  const mark = (letter: string, m: Mark | undefined) => (m?.text.trim() ? `${letter}${m.side || ''}${m.dir || ''}={${value(m.text)}}` : '');

  // the order circuitikz reads them in: part, options, mirror, invert, poles, size, name, label, voltage, current
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
      el.label?.text.trim() && `l${el.label.side === '_' ? '_' : ''}={${maths(el.label.text)}}`,
      el.value?.trim() && `a={${value(el.value)}}`,
      mark('v', el.voltage),
      mark('i', el.current)
    ].filter(Boolean);
    return `\\draw ${at(el.a)} to[${keys.join(', ')}] ${at(el.b)};`;
  };

  const nodeCode = (el: NodePart) => {
    const rotate = (((el.rotate || 0) % 360) + 360) % 360;
    const keys = [PARTS.get(el.type)?.tikz || 'circ', ...(el.options || []), rotate && `rotate=${rotate}`, el.flipX && 'xscale=-1', el.flipY && 'yscale=-1'].filter(Boolean);
    const name = el.name || named.has(el.id) ? ` (${nameOf(el)})` : '';
    return `\\node[${keys.join(', ')}]${name} at ${at(el.at)} {};`;
  };

  const { picture, ctikz } = styleCode(style);
  const lines = [
    // nodes first, so wires and parts can reach their anchors
    ...model.elements.filter((el): el is NodePart => el.kind === 'node').map(nodeCode),
    ...model.elements.filter((el): el is PathPart => el.kind === 'path').map(pathCode),
    ...model.elements
      .filter((el): el is Wire => el.kind === 'wire' && el.points.length > 1)
      .map((el) => `\\draw ${el.points.map((p, i) => (i ? `${el.routes[i - 1] || '--'} ${at(p)}` : at(p))).join(' ')};`),
    ...model.junctions.map((j) => `\\node[circ] at ${at(j)} {};`)
  ];
  const body = [`\\begin{circuitikz}[${picture}]`, ...(ctikz ? [ctikz] : []), ...lines, '\\end{circuitikz}'].join('\n');
  return { body, packages: siunitxUsed ? ['circuitikz', 'siunitx'] : ['circuitikz'], libraries: [] };
}
