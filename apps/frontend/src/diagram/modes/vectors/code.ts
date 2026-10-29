// The vector drawing as TikZ, written the way people write these figures by hand: a named \coordinate for each point
// (a constructed one with the calc library, so it stays exact in the code too), \draw[->, very thick, blue] for a
// vector, \fill … circle (2pt) for a dot with its label as a node, and each panel in a scope shifted right with its
// caption under it. Each look an item or the Style leaves out is written as 2.0 first wrote it, so older drawings
// keep their code; arrows.meta and decorations.markings are loaded only by the tips and middle arrows that need them.
import type { DiagramCode } from '../../fileFormat';
import { latexColour, mathsPackages, num } from '../shared';
import { TIPS, WIDTHS, clipLine, frameOf, isLink, panelOf, parentsOf, resolve, rightCorners } from './model';
import type { Axes, Construction, Dash, Item, Label, Link, Pt, Stroke, TextStyle, Thickness, Tip, Tips, VPoint, VectorModel } from './model';
import { asVectors } from './model';

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
}

export const GRIDS = [0.25, 0.5, 1];

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
    ...(colour && { colour })
  };
}

const at = (p: Pt) => `(${num(p.x)},${num(p.y)})`;
const safeName = (name: string) => name.replace(/[^A-Za-z0-9]/g, '') || 'P';

/** A label's node options: its side, and how far when it's set. */
const side = (label: Pick<Label, 'side' | 'dist'>, fallback = 'above right') => `${label.side || fallback}${label.dist ? `=${num(label.dist)}pt` : ''}`;

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
  // the libraries it uses, found as it's written
  let [calc, meta, markings] = [false, false, false] as boolean[];

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
  /** an arrow halfway along, pointing the way the line runs */
  const middleOption = (t: Tips) => {
    if (!t.middle) return '';
    markings = true;
    const tip = t.end && t.end !== 'none' ? t.end : style.tips;
    return `postaction={decorate, decoration={markings, mark=at position 0.5 with {\\arrow{${tipCode(tip, t.tipSize ?? style.tipSize)}}}}}`;
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

  const constructionCode = (c: Construction) => {
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

  const edgeLabel = (link: Link) => {
    if (!link.label?.text.trim()) return '';
    texts.push(link.label.text);
    const pos = link.label.pos ?? 0.5;
    return ` node[${[pos === 0.5 ? 'midway' : `pos=${num(pos)}`, link.label.side || 'above', ...textOptions(link.label)].join(', ')}] {${link.label.text}}`;
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
      return `\\draw${options} ${at(ends[0])} -- ${at(ends[1])}${edgeLabel(link)};`;
    }
    return `\\draw${options} ${ref(link.a)} -- ${ref(link.b)}${edgeLabel(link)};`;
  };

  const axesLines = (axes: Axes) => {
    const lines: string[] = [];
    const [xName, yName] = axes.names ?? ['$x$', '$y$'];
    texts.push(xName, yName);
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
    const options = p.label?.text.trim() ? [side(p.label!), ...textOptions(p.label!)].join(', ') : '';
    if (options) texts.push(p.label!.text);
    const node = () => `\\node[${options}] at ${ref(p.id)} {${p.label!.text}};`;
    if (!p.dot) return options ? [node()] : [];
    const r = `${num(p.size ?? style.pointSize)}pt`;
    const colour = colourOption(p.colour ?? style.colour);
    const label = options ? ` node[${options}] {${p.label!.text}}` : '';
    if (p.shape === 'open') return [`\\draw${bracket([colour, 'fill=white'])} ${ref(p.id)} circle (${r})${label};`];
    if (p.shape === 'cross') {
      const d = `${num(2 * (p.size ?? style.pointSize))}pt`;
      return [`\\draw${bracket([colour])} ${ref(p.id)} ++(-${r},-${r}) -- ++(${d},${d}) ++(-${d},0) -- ++(${d},-${d});`, ...(options ? [node()] : [])];
    }
    return [`\\fill${bracket([colour])} ${ref(p.id)} circle (${r})${label};`];
  };

  /** the order things are drawn in, bottom first: highlights under the lines, dots and labels on top */
  const LAYERS: Item['kind'][] = ['axes', 'highlight', 'polygon', 'line', 'segment', 'drop', 'right', 'vector', 'text'];

  const panelLines = (panel: string) => {
    const lines: string[] = [];
    const points = ordered.filter((p) => p.panel === panel);
    for (const p of points) lines.push(`\\coordinate (${plain(p.id)}) at ${p.of ? constructionCode(p.of) : at(p)};`);
    const items = model.items.filter((i) => panelOf(model, i) === panel);
    for (const layer of LAYERS) {
      for (const item of items.filter((i) => i.kind === layer)) {
        if (isLink(item)) lines.push(linkCode(item, panel));
        else if (item.kind === 'polygon') {
          const fill = item.fill ? [colourOption(item.fill, 'fill') || 'fill=black', opacityOption(item.fillOpacity, 'fill opacity')] : [];
          const [width, dash, colour] = strokeOptions(item);
          lines.push(`\\draw${bracket([...fill, width, dash, colour, opacityOption(item.opacity, 'draw opacity')])} ${item.points.map(ref).join(' -- ')} -- cycle;`);
        } else if (item.kind === 'drop') lines.push(`\\draw${bracket(strokeOptions(item, style.width, 'dashed'))} ${ref(item.from)} -- (${plain(item.from)} ${item.axis === 'x' ? '|-' : '-|'} 0,0);`);
        else if (item.kind === 'right') lines.push(`\\draw${bracket(strokeOptions(item))} ${rightCorners(places.get(item.at)!, places.get(item.toward)!, !!item.flip).map(at).join(' -- ')};`);
        else if (item.kind === 'text') {
          texts.push(item.text);
          lines.push(`\\node${bracket(textOptions(item))} at ${at(item)} {${item.text}};`);
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
      texts.push(panel.caption);
      lines.push(`\\node at (${num((f.minX + f.maxX) / 2)},${num(f.minY - (model.items.some((i) => i.kind === 'axes' && i.panel === panel.id) ? 0.6 : 0))}) {${panel.caption}};`);
    }
    if (scoped) body.push(`  \\begin{scope}${panel.shift ? `[xshift=${num(panel.shift)}cm]` : ''}`, ...lines.map((l) => `    ${l}`), '  \\end{scope}');
    else body.push(...lines.map((l) => `  ${l}`));
  }
  // the Style's tip: TikZ's own stealth, latex or to at the usual size, else arrows.meta's
  const tips = ['stealth', 'latex', 'to'].includes(style.tips) && style.tipSize === 1 ? style.tips : `{${tipCode(style.tips, style.tipSize)}}`;
  body[0] = `\\begin{tikzpicture}[${[style.scale !== 1 && `scale=${num(style.scale)}`, `>=${tips}`].filter(Boolean).join(', ')}]`;
  body.push('\\end{tikzpicture}', '');
  const libraries = [calc && 'calc', meta && 'arrows.meta', markings && 'decorations.markings'].filter((l): l is string => !!l);
  return { body: body.join('\n'), packages: ['tikz', ...mathsPackages(texts)], libraries };
}
