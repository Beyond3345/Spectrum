// The vector drawing as TikZ, written the way people write these figures by hand: a named \coordinate for each point
// (a constructed one with the calc library, so it stays exact in the code too), \draw[->, very thick, blue] for a
// vector, \fill … circle (2pt) for a dot with its label as a node, and each panel in a scope shifted right with its
// caption under it. Each look an item or the Style leaves out is written as 2.0 first wrote it, so older drawings
// keep their code; arrows.meta, decorations.markings and angles are loaded only by the tips, middle arrows, ticks and
// angles that need them. An angle is TikZ's angle pic, live on its three points; a circle, an arc and a line from its
// equation are written with the numbers they have now, as a line through two points is.
import type { DiagramCode } from '../../fileFormat';
import { latexColour, mathsPackages, num } from '../shared';
import { TIPS, WIDTHS, clipLine, dist, frameOf, isLink, panelOf, parentsOf, placed, pointsOf, resolve, rightCorners } from './model';
import type { Angle, Axes, Circle, Construction, Dash, EdgeLabel, EqLine, Item, Label, Link, Pt, Stroke, TextStyle, Thickness, Tip, Tips, VPoint, VectorModel } from './model';
import { asVectors } from './model';
import { placeVectorLabels } from './labels';

/** The drawing's look: what each item without its own takes. A default left out is TikZ's, as 2.0 first drew. */
export interface VectorStyle {
  /** the picture's scale */
  scale: number;
  /** the canvas's grid step, in cm */
  grid: number;
  /** the arrow tip of a vector or axis with none of its own, written >=stealth */
  tips: Exclude<Tip, 'none'>;
  /** its size, 1 the usual */
  tipSize: number;
  /** the thickness of lines, segments, polygons and marks */
  width?: Thickness;
  /** a vector's thickness */
  vectorWidth?: Thickness;
  /** the colour of lines, polygons and points */
  colour?: string;
  /** a dot's radius in pt */
  pointSize: number;
  /** how \mathbf{a} in a label is written; bold (as typed) when left out */
  notation?: Notation;
}

export const GRIDS = [0.25, 0.5, 1];

/** How a vector's name is written: each \mathbf{…} in the drawing's labels becomes the command, with the package it needs. */
export type Notation = 'bold' | 'vec' | 'arrow' | 'vv';
export const NOTATIONS: Record<Notation, { command: string; label: string; package?: string }> = {
  bold: { command: '\\mathbf', label: 'Bold, \\mathbf{a}' },
  vec: { command: '\\vec', label: 'Arrow, \\vec{a}' },
  arrow: { command: '\\overrightarrow', label: 'Long arrow, \\overrightarrow{OA}' },
  vv: { command: '\\vv', label: 'esvect, \\vv{a}', package: 'esvect' }
};
export const isNotation = (raw: unknown): raw is Notation => typeof raw === 'string' && Object.keys(NOTATIONS).includes(raw);
/** A label's TeX with its vector names in a notation. */
export const notate = (tex: string, notation: Notation = 'bold') => (notation === 'bold' ? tex : tex.replace(/\\mathbf(?=\s*\{)/g, NOTATIONS[notation].command));

/**
 * Whether a Style says how thick vectors are: Normal is kept as null, so only a drawing from before there was a vector
 * thickness has none, and its new vectors are very thick, as vectors were then.
 */
export const styledVectors = (raw: Record<string, unknown>) => raw.vectorWidth !== undefined;

/** A thickness read back: a TikZ name, or a width in pt. */
export const asThickness = (raw: unknown): Thickness | undefined =>
  WIDTHS.includes(raw as never) ? (raw as Thickness) : typeof raw === 'number' && raw > 0 && raw <= 20 ? raw : undefined;
const inRange = (raw: unknown, min: number, max: number, fallback: number) => (typeof raw === 'number' && raw >= min && raw <= max ? raw : fallback);

export function readStyle(raw: Record<string, unknown>): VectorStyle {
  const tips = TIPS.includes(raw.tips as Tip) && raw.tips !== 'none' ? (raw.tips as VectorStyle['tips']) : 'stealth';
  const [width, vectorWidth] = [asThickness(raw.width), asThickness(raw.vectorWidth)];
  const colour = typeof raw.colour === 'string' && raw.colour.trim() ? raw.colour.trim() : undefined;
  return {
    scale: inRange(raw.scale, 0.2, 5, 1),
    grid: GRIDS.includes(raw.grid as number) ? (raw.grid as number) : 0.5,
    tips,
    tipSize: inRange(raw.tipSize, 0.2, 5, 1),
    pointSize: inRange(raw.pointSize, 0.2, 20, 2),
    ...(width !== undefined && { width }),
    ...(vectorWidth !== undefined && { vectorWidth }),
    ...(colour && { colour }),
    ...(isNotation(raw.notation) && raw.notation !== 'bold' && { notation: raw.notation })
  };
}

const at = (p: Pt) => `(${num(p.x)},${num(p.y)})`;
const safeName = (name: string) => name.replace(/[^A-Za-z0-9]/g, '') || 'P';

/** A label's node options: its side, and how far when it's set. */
const side = (label: Pick<Label, 'side' | 'dist'>) => `${label.side}${label.dist ? `=${num(label.dist)}pt` : ''}`;

/** The fraction m/(m+n) as calc takes it: {1/3} for whole numbers, else a decimal. */
const fraction = (m: number, n: number) => (Number.isInteger(m) && Number.isInteger(n) && m + n ? `{${m}/${m + n}}` : num(m + n ? m / (m + n) : 0.5));

/** A colour as an option: blue!50 as it is, a picked one (#rrggbb) written in place; black, TikZ's own, not at all. */
export const colourOption = (colour: string | undefined, key = 'color') =>
  !colour || colour === 'black' ? '' : colour.startsWith('#') ? `${key}=${latexColour(colour)}` : key === 'color' ? colour : `${key}=${colour}`;
export const widthOption = (width?: Thickness) => (width === undefined ? '' : typeof width === 'number' ? `line width=${num(width)}pt` : width);
export const dashOption = (dash?: Dash) => (!dash || dash === 'solid' ? '' : typeof dash === 'string' ? dash : `dash pattern=on ${num(dash[0])}pt off ${num(dash[1])}pt`);
const opacityOption = (opacity: number | undefined, key = 'opacity') => (opacity === undefined || opacity >= 1 ? '' : `${key}=${num(opacity)}`);
/** a label's font and colour as node options */
const textOptions = (t: TextStyle) => [t.size && t.size !== 'normalsize' && `font=\\${t.size}`, colourOption(t.colour)].filter(Boolean) as string[];
const bracket = (options: (string | false | undefined)[]) => {
  const kept = options.filter(Boolean);
  return kept.length ? `[${kept.join(', ')}]` : '';
};

/** each tip's arrows.meta name and option */
const META: Record<Exclude<Tip, 'none'>, [string, string?]> = { stealth: ['Stealth'], latex: ['Latex'], to: ['To'], triangle: ['Triangle'], 'open triangle': ['Triangle', 'open'], bar: ['Bar'] };

export function vectorCode(raw: unknown, rawStyle: Record<string, unknown>): DiagramCode {
  const model = asVectors(raw);
  const style = readStyle(rawStyle);
  const places = resolve(model);
  const byId = new Map(model.points.map((p) => [p.id, p]));
  const texts: string[] = [];
  /** a text as it's written, its vector names in the Style's notation */
  const tex = (text: string) => {
    const written = notate(text, style.notation);
    texts.push(written);
    return written;
  };
  // the libraries it uses, found as it's written
  let [calc, meta, markings, angles] = [false, false, false, false] as boolean[];

  /** a tip as arrows.meta writes it: Stealth, Triangle[open, scale=1.5] */
  const tipCode = (tip: Exclude<Tip, 'none'>, size: number) => {
    meta = true;
    const [name, option] = META[tip];
    const options = [option, size !== 1 && `scale=${num(size)}`].filter(Boolean);
    return options.length ? `${name}[${options.join(', ')}]` : name;
  };
  /** the arrow option of a line: -> for the Style's tip at the end, else each end's tip ({Bar}-{Latex}); empty for none */
  const arrowOption = (t: Tips, styleEnd: boolean) => {
    const start = t.start && t.start !== 'none' ? t.start : undefined;
    if (!start && t.end === undefined && t.tipSize === undefined) return styleEnd ? '->' : '';
    const end = t.end ?? (styleEnd ? style.tips : 'none');
    if (!start && end === 'none') return '';
    const size = t.tipSize ?? style.tipSize;
    return `${start ? `{${tipCode(start, size)}}` : ''}-${end !== 'none' ? `{${tipCode(end, size)}}` : ''}`;
  };
  /** an arrow halfway along, pointing the way the line runs, and equal-length ticks across the middle */
  const middleOption = (t: Tips & { ticks?: number }) => {
    const marks: string[] = [];
    if (t.middle) marks.push(`mark=at position 0.5 with {\\arrow{${tipCode(t.end && t.end !== 'none' ? t.end : style.tips, t.tipSize ?? style.tipSize)}}}`);
    const n = Math.min(3, Math.max(0, Math.round(t.ticks ?? 0)));
    // 2pt apart, 6pt long; [-] so a vector's tips aren't drawn on them
    if (n) marks.push(`mark=at position 0.5 with {\\draw[-] ${Array.from({ length: n }, (_, i) => `(${num((i - (n - 1) / 2) * 2)}pt,-3pt) -- ++(0,6pt)`).join(' ')};}`);
    if (!marks.length) return '';
    markings = true;
    return `postaction={decorate, decoration={markings, ${marks.join(', ')}}}`;
  };
  /** a line's thickness, dashes, colour and opacity, each its own or the Style's */
  const strokeOptions = (s: Stroke & { dashed?: boolean }, width = style.width, dash?: Dash) => [
    widthOption(s.width ?? width),
    dashOption(s.dash ?? (s.dashed ? 'dashed' : dash)),
    colourOption(s.colour ?? style.colour),
    opacityOption(s.opacity)
  ];

  // names unique in each panel; a panel's coordinates are written before anything uses them, so panels can share names
  const names = new Map<string, string>();
  for (const panel of model.panels) {
    const taken = new Set<string>();
    for (const p of model.points.filter((x) => x.panel === panel.id)) {
      const base = safeName(p.name);
      let name = base;
      for (let n = 2; taken.has(name); n += 1) name = `${base}${n}`;
      taken.add(name);
      names.set(p.id, name);
    }
  }
  const ref = (id: string) => `(${names.get(id) ?? 'O'})`;
  const plain = (id: string) => names.get(id) ?? 'O';
  /** points that aren't anywhere now (parallel lines' meet), left out with what's drawn on them */
  const there = (id: string) => placed(places.get(id));

  const constructionCode = (c: Construction, p: VPoint) => {
    if (c.kind === 'intercept') return at(places.get(p.id)!);
    if (c.kind === 'meet') return `(intersection of ${plain(c.a)}--${plain(c.b)} and ${plain(c.c)}--${plain(c.d)})`;
    calc = true;
    const o = 'o' in c && c.o ? ref(c.o) : '';
    switch (c.kind) {
      case 'mid':
        return `($${ref(c.a)}!0.5!${ref(c.b)}$)`;
      case 'ratio':
        return `($${ref(c.a)}!${fraction(c.m, c.n)}!${ref(c.b)}$)`;
      case 'foot':
        return `($${ref(c.a)}!${ref(c.p)}!${ref(c.b)}$)`;
      case 'sum':
        return `($${ref(c.u)}+${ref(c.v)}${o && `-${o}`}$)`;
      case 'diff':
        return o ? `($${o}+${ref(c.v)}-${ref(c.u)}$)` : `($${ref(c.v)}-${ref(c.u)}$)`;
      case 'scale':
        return `($${ref(c.a)}!${num(c.k)}!${ref(c.b)}$)`;
      // twice the way to the foot
      case 'reflect':
        return `($${ref(c.p)}!2!($${ref(c.a)}!${ref(c.p)}!${ref(c.b)}$)$)`;
      // AB from P, turned a quarter about P
      case 'perp':
        return `($${ref(c.p)}!1!90:($${ref(c.p)}+${ref(c.b)}-${ref(c.a)}$)$)`;
    }
  };

  /** points in an order where each comes after its parents */
  const ordered: VPoint[] = [];
  const done = new Set<string>();
  const visit = (p: VPoint, depth = 0) => {
    if (done.has(p.id) || depth > model.points.length) return;
    if (p.of) parentsOf(p.of).forEach((id) => byId.get(id) && visit(byId.get(id)!, depth + 1));
    done.add(p.id);
    ordered.push(p);
  };
  model.points.forEach((p) => visit(p));

  // labels with no side, or beside their arrow, where they're clear (as the canvas draws them)
  const spots = placeVectorLabels(model, style, places);
  const edgeLabel = (id: string, label?: EdgeLabel) => {
    if (!label?.text.trim()) return '';
    const pos = label.pos ?? 0.5;
    const where = label.side && label.side !== 'beside' ? label.side : spots.get(id)?.code ?? 'above';
    return ` node[${[pos === 0.5 ? 'midway' : `pos=${num(pos)}`, where, ...textOptions(label)].join(', ')}] {${tex(label.text)}}`;
  };

  const linkCode = (link: Link, panel: string) => {
    if (link.kind === 'highlight') {
      const options = [widthOption(link.width ?? 2.5), colourOption(link.colour || 'blue!50'), dashOption(link.dash), opacityOption(link.opacity)];
      return `\\draw${bracket(options)} ${ref(link.a)} -- ${ref(link.b)};`;
    }
    const vector = link.kind === 'vector';
    const options = bracket([arrowOption(link, vector), ...strokeOptions(link, vector ? style.vectorWidth : style.width), middleOption(link)]);
    if (link.kind === 'line') {
      const ends = clipLine(places.get(link.a)!, places.get(link.b)!, frameOf(model, panel, places));
      if (!ends) return '';
      return `\\draw${options} ${at(ends[0])} -- ${at(ends[1])}${edgeLabel(link.id, link.label)};`;
    }
    return `\\draw${options} ${ref(link.a)} -- ${ref(link.b)}${edgeLabel(link.id, link.label)};`;
  };

  /** an angle's arc (two for a double), with its label beside the arc's middle */
  const angleLines = (angle: Angle) => {
    const [V, A, B] = [angle.at, angle.from, angle.to].map((id) => places.get(id)!);
    if (dist(V, A) < 1e-9 || dist(V, B) < 1e-9) return [];
    angles = true;
    const r = angle.radius ?? 0.6;
    const look = ['draw', ...strokeOptions(angle)];
    const text = angle.label?.text.trim() ? [`angle eccentricity=${num((r + 0.25) / r)}`, `pic text={${tex(angle.label.text)}}`] : [];
    const textLook = angle.label ? textOptions(angle.label) : [];
    const corner = `{angle=${plain(angle.from)}--${plain(angle.at)}--${plain(angle.to)}}`;
    return [
      `\\pic${bracket([...look, angle.arrow && '->', `angle radius=${num(r)}cm`, ...text, textLook.length > 0 && text.length > 0 && `pic text options={${textLook.join(', ')}}`])} ${corner};`,
      ...(angle.double ? [`\\pic${bracket([...look, `angle radius=${num(r + 0.07)}cm`])} ${corner};`] : [])
    ];
  };

  /** a circle, or its arc from one point anticlockwise round to another's side */
  const circleCode = (circle: Circle) => {
    const [C, P] = [places.get(circle.centre)!, places.get(circle.through)!];
    const r = dist(C, P);
    if (r < 1e-9) return '';
    const fill = circle.fill ? [colourOption(circle.fill, 'fill') || 'fill=black', opacityOption(circle.fillOpacity, 'fill opacity')] : [];
    const options = bracket([...fill, ...strokeOptions(circle)]);
    if (!circle.to) return `\\draw${options} ${ref(circle.centre)} circle[radius=${num(r)}];`;
    const T = places.get(circle.to)!;
    const start = (Math.atan2(P.y - C.y, P.x - C.x) * 180) / Math.PI;
    let end = (Math.atan2(T.y - C.y, T.x - C.x) * 180) / Math.PI;
    while (end <= start) end += 360;
    return `\\draw${options} ${ref(circle.through)} arc[start angle=${num(start)}, end angle=${num(end)}, radius=${num(r)}];`;
  };

  /** a line from its equation, out to its panel's frame */
  const eqLineCode = (line: EqLine) => {
    const ends = eqLineEnds(line, frameOf(model, line.panel, places));
    if (!ends) return '';
    return `\\draw${bracket(strokeOptions(line))} ${at(ends[0])} -- ${at(ends[1])}${edgeLabel(line.id, line.label)};`;
  };

  const axesLines = (axes: Axes) => {
    const lines: string[] = [];
    const [xName, yName] = (axes.names ?? ['$x$', '$y$']).map(tex);
    const step = axes.step ?? 1;
    if (axes.grid) {
      const grid = [widthOption(axes.gridWidth ?? 'very thin'), colourOption(axes.gridColour ?? 'gray!30'), step !== 1 && `step=${num(step)}`];
      lines.push(`\\draw${bracket(grid)} (${num(axes.x[0])},${num(axes.y[0])}) grid (${num(axes.x[1])},${num(axes.y[1])});`);
    }
    const look = [colourOption(axes.colour), widthOption(axes.width)];
    const arrows = bracket([arrowOption({ end: axes.tip }, true), ...look]);
    lines.push(`\\draw${arrows} (${num(axes.x[0])},0) -- (${num(axes.x[1])},0) node[right] {${xName}};`, `\\draw${arrows} (0,${num(axes.y[0])}) -- (0,${num(axes.y[1])}) node[above] {${yName}};`);
    // a tick at each step but 0
    const ticks = ([from, to]: [number, number]) => {
      const out: string[] = [];
      for (let k = Math.floor(Math.min(from, to) / step) + 1; k * step < Math.max(from, to) && out.length < 60; k += 1) if (k) out.push(num(k * step));
      return out.join(',');
    };
    const t = num(axes.tick ?? 0.08);
    const font = `\\${axes.numbers ?? 'small'}`;
    const tickLook = bracket(look);
    if (axes.ticks && ticks(axes.x)) lines.push(`\\foreach \\t in {${ticks(axes.x)}} \\draw${tickLook} (\\t,${t}) -- (\\t,-${t}) node[below] {${font} $\\t$};`);
    if (axes.ticks && ticks(axes.y)) lines.push(`\\foreach \\t in {${ticks(axes.y)}} \\draw${tickLook} (${t},\\t) -- (-${t},\\t) node[left] {${font} $\\t$};`);
    if (axes.origin) lines.push('\\node[below left] at (0,0) {$O$};');
    return lines;
  };

  /** a point's dot (filled, open or a cross) with its label, or the label alone */
  const pointLines = (p: VPoint) => {
    const options = p.label?.text.trim() ? [p.label.side ? side(p.label) : spots.get(p.id)?.code ?? 'above right', ...textOptions(p.label!)].join(', ') : '';
    const text = options ? tex(p.label!.text) : '';
    const node = () => `\\node[${options}] at ${ref(p.id)} {${text}};`;
    if (!p.dot) return options ? [node()] : [];
    const r = `${num(p.size ?? style.pointSize)}pt`;
    const colour = colourOption(p.colour ?? style.colour);
    // a node on a coloured dot's path would take its colour, so its label is a node of its own
    const label = options && !colour ? ` node[${options}] {${text}}` : '';
    const own = options && colour ? [node()] : [];
    if (p.shape === 'open') return [`\\draw${bracket([colour, 'fill=white'])} ${ref(p.id)} circle (${r})${label};`, ...own];
    if (p.shape === 'cross') {
      const d = `${num(2 * (p.size ?? style.pointSize))}pt`;
      return [`\\draw${bracket([colour])} ${ref(p.id)} ++(-${r},-${r}) -- ++(${d},${d}) ++(-${d},0) -- ++(${d},-${d});`, ...(options ? [node()] : [])];
    }
    return [`\\fill${bracket([colour])} ${ref(p.id)} circle (${r})${label};`, ...own];
  };

  /** the order things are drawn in, bottom first: highlights under the lines, dots and labels on top */
  const LAYERS: Item['kind'][] = ['axes', 'highlight', 'polygon', 'circle', 'line', 'eqline', 'segment', 'drop', 'right', 'angle', 'vector', 'text'];

  const panelLines = (panel: string) => {
    const lines: string[] = [];
    const points = ordered.filter((p) => p.panel === panel && there(p.id));
    for (const p of points) lines.push(`\\coordinate (${plain(p.id)}) at ${p.of ? constructionCode(p.of, p) : at(p)};`);
    const items = model.items.filter((i) => panelOf(model, i) === panel && pointsOf(i).every(there));
    for (const layer of LAYERS) {
      for (const item of items.filter((i) => i.kind === layer)) {
        if (isLink(item)) lines.push(linkCode(item, panel));
        else if (item.kind === 'polygon') {
          const fill = item.fill ? [colourOption(item.fill, 'fill') || 'fill=black', opacityOption(item.fillOpacity, 'fill opacity')] : [];
          const [width, dash] = strokeOptions(item);
          // draw=: a bare colour would fill it too
          const colour = colourOption(item.colour ?? style.colour, 'draw');
          lines.push(`\\draw${bracket([...fill, width, dash, colour, opacityOption(item.opacity, 'draw opacity')])} ${item.points.map(ref).join(' -- ')} -- cycle;`);
        } else if (item.kind === 'drop') {
          const [from, name, look] = [ref(item.from), plain(item.from), bracket(strokeOptions(item, style.width, 'dashed'))];
          // to both: across to the y axis, the point, down to the x axis
          lines.push(item.axis === 'both' ? `\\draw${look} (${name} -| 0,0) -- ${from} -- (${name} |- 0,0);` : `\\draw${look} ${from} -- (${name} ${item.axis === 'x' ? '|-' : '-|'} 0,0);`);
        } else if (item.kind === 'angle') lines.push(...angleLines(item));
        else if (item.kind === 'circle') lines.push(circleCode(item));
        else if (item.kind === 'eqline') lines.push(eqLineCode(item));
        else if (item.kind === 'right') lines.push(`\\draw${bracket(strokeOptions(item))} ${rightCorners(places.get(item.at)!, places.get(item.toward)!, !!item.flip).map(at).join(' -- ')};`);
        else if (item.kind === 'text') {
          lines.push(`\\node${bracket(textOptions(item))} at ${at(item)} {${tex(item.text)}};`);
        } else if (item.kind === 'axes') lines.push(...axesLines(item));
      }
    }
    // the ratio's parts, named along the segment
    for (const p of points) {
      if (p.of?.kind !== 'ratio' || !p.of.marks) continue;
      lines.push(`\\path ${ref(p.of.a)} -- ${ref(p.id)} node[midway, ${p.of.marks}] {$${num(p.of.m)}$};`, `\\path ${ref(p.id)} -- ${ref(p.of.b)} node[midway, ${p.of.marks}] {$${num(p.of.n)}$};`);
    }
    for (const p of points) lines.push(...pointLines(p));
    return lines.filter(Boolean);
  };

  const body = [''];
  const scoped = model.panels.length > 1 || model.panels.some((p) => p.shift || p.caption);
  for (const panel of model.panels) {
    const lines = panelLines(panel.id);
    if (panel.caption?.trim()) {
      const f = frameOf(model, panel.id, places);
      // under what's drawn: the axes' ends, or the points
      lines.push(`\\node at (${num((f.minX + f.maxX) / 2)},${num(f.minY - (model.items.some((i) => i.kind === 'axes' && i.panel === panel.id) ? 0.6 : 0))}) {${tex(panel.caption)}};`);
    }
    if (scoped) body.push(`  \\begin{scope}${panel.shift ? `[xshift=${num(panel.shift)}cm]` : ''}`, ...lines.map((l) => `    ${l}`), '  \\end{scope}');
    else body.push(...lines.map((l) => `  ${l}`));
  }
  // the Style's tip: TikZ's own stealth, latex or to at the usual size, else arrows.meta's
  const tips = ['stealth', 'latex', 'to'].includes(style.tips) && style.tipSize === 1 ? style.tips : `{${tipCode(style.tips, style.tipSize)}}`;
  body[0] = `\\begin{tikzpicture}[${[style.scale !== 1 && `scale=${num(style.scale)}`, `>=${tips}`].filter(Boolean).join(', ')}]`;
  body.push('\\end{tikzpicture}', '');
  const libraries = [calc && 'calc', meta && 'arrows.meta', markings && 'decorations.markings', angles && 'angles'].filter((l): l is string => !!l);
  // \vv is esvect's
  const notation = style.notation && NOTATIONS[style.notation].package;
  const needs = notation && texts.some((t) => t.includes(`${NOTATIONS[style.notation!].command}`)) ? [notation] : [];
  return { body: body.join('\n'), packages: ['tikz', ...needs, ...mathsPackages(texts)], libraries };
}

/** The ends of the line ax + by + c = 0 at a frame; null when there's no line (a = b = 0) or it misses the frame. */
export function eqLineEnds(line: Pick<EqLine, 'a' | 'b' | 'c'>, frame: { minX: number; maxX: number; minY: number; maxY: number }): [Pt, Pt] | null {
  const n2 = line.a * line.a + line.b * line.b;
  if (n2 < 1e-24) return null;
  // the point on it nearest the origin, and along it
  const P = { x: (-line.a * line.c) / n2, y: (-line.b * line.c) / n2 };
  const ends = clipLine(P, { x: P.x - line.b, y: P.y + line.a }, frame);
  const inside = (q: Pt) => q.x >= frame.minX - 1e-9 && q.x <= frame.maxX + 1e-9 && q.y >= frame.minY - 1e-9 && q.y <= frame.maxY + 1e-9;
  if (!ends || !inside(ends[0]) || !inside(ends[1])) return null;
  // left to right (upwards when it's upright), so a label's place along it doesn't hang on the signs of a, b and c
  const [p, q] = ends;
  return q.x < p.x - 1e-9 || (Math.abs(q.x - p.x) <= 1e-9 && q.y < p.y) ? [q, p] : ends;
}
