// The vector drawing as TikZ, written the way people write these figures by hand: a named \coordinate for each point
// (a constructed one with the calc library, so it stays exact in the code too), \draw[->, very thick, blue] for a
// vector, \fill … circle (2pt) for a dot with its label as a node, and each panel in a scope shifted right with its
// caption under it.
import type { DiagramCode } from '../../fileFormat';
import { mathsPackages, num } from '../shared';
import { clipLine, frameOf, isLink, panelOf, parentsOf, resolve, rightCorners } from './model';
import type { Construction, Item, Label, Link, Pt, VPoint, VectorModel } from './model';
import { asVectors } from './model';

export interface VectorStyle {
  /** the picture's scale */
  scale: number;
  /** the canvas's grid step, in cm */
  grid: number;
  /** arrow tips: >=stealth */
  tips: 'stealth' | 'latex' | 'to';
}

export const GRIDS = [0.25, 0.5, 1];

export function readStyle(raw: Record<string, unknown>): VectorStyle {
  const scale = typeof raw.scale === 'number' && raw.scale >= 0.2 && raw.scale <= 5 ? raw.scale : 1;
  const grid = GRIDS.includes(raw.grid as number) ? (raw.grid as number) : 0.5;
  const tips = raw.tips === 'latex' || raw.tips === 'to' ? raw.tips : 'stealth';
  return { scale, grid, tips };
}

const at = (p: Pt) => `(${num(p.x)},${num(p.y)})`;
const safeName = (name: string) => name.replace(/[^A-Za-z0-9]/g, '') || 'P';

/** A label's node options: its side, and how far when it's set. */
const side = (label: Pick<Label, 'side' | 'dist'>, fallback = 'above right') => `${label.side || fallback}${label.dist ? `=${num(label.dist)}pt` : ''}`;

/** The fraction m/(m+n) as calc takes it: {1/3} for whole numbers, else a decimal. */
const fraction = (m: number, n: number) => (Number.isInteger(m) && Number.isInteger(n) && m + n ? `{${m}/${m + n}}` : num(m + n ? m / (m + n) : 0.5));

export function vectorCode(raw: unknown, rawStyle: Record<string, unknown>): DiagramCode {
  const model = asVectors(raw);
  const style = readStyle(rawStyle);
  const places = resolve(model);
  const byId = new Map(model.points.map((p) => [p.id, p]));
  const texts: string[] = [];
  let calc = false;

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

  const strokeOptions = (item: { colour?: string; width?: string; dashed?: boolean }, first: string[] = []) => {
    const options = [...first, item.width, item.dashed && 'dashed', item.colour && item.colour !== 'black' && item.colour].filter(Boolean);
    return options.length ? `[${options.join(', ')}]` : '';
  };
  const edgeLabel = (link: Link) => {
    if (!link.label?.text.trim()) return '';
    texts.push(link.label.text);
    const pos = link.label.pos ?? 0.5;
    return ` node[${pos === 0.5 ? 'midway' : `pos=${num(pos)}`}, ${link.label.side || 'above'}] {${link.label.text}}`;
  };

  const linkCode = (link: Link, panel: string) => {
    if (link.kind === 'highlight') return `\\draw[line width=2.5pt, ${link.colour || 'blue!50'}] ${ref(link.a)} -- ${ref(link.b)};`;
    if (link.kind === 'line') {
      const ends = clipLine(places.get(link.a)!, places.get(link.b)!, frameOf(model, panel, places));
      if (!ends) return '';
      return `\\draw${strokeOptions(link)} ${at(ends[0])} -- ${at(ends[1])}${edgeLabel(link)};`;
    }
    return `\\draw${strokeOptions(link, link.kind === 'vector' ? ['->'] : [])} ${ref(link.a)} -- ${ref(link.b)}${edgeLabel(link)};`;
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
        else if (item.kind === 'polygon') lines.push(`\\draw${strokeOptions({ colour: item.colour }, item.fill ? [`fill=${item.fill}`] : [])} ${item.points.map(ref).join(' -- ')} -- cycle;`);
        else if (item.kind === 'drop') lines.push(`\\draw[dashed] ${ref(item.from)} -- (${plain(item.from)} ${item.axis === 'x' ? '|-' : '-|'} 0,0);`);
        else if (item.kind === 'right') lines.push(`\\draw ${rightCorners(places.get(item.at)!, places.get(item.toward)!, !!item.flip).map(at).join(' -- ')};`);
        else if (item.kind === 'text') {
          texts.push(item.text);
          lines.push(`\\node at ${at(item)} {${item.text}};`);
        } else if (item.kind === 'axes') {
          const [xName, yName] = item.names ?? ['$x$', '$y$'];
          texts.push(xName, yName);
          lines.push(`\\draw[->] (${num(item.x[0])},0) -- (${num(item.x[1])},0) node[right] {${xName}};`, `\\draw[->] (0,${num(item.y[0])}) -- (0,${num(item.y[1])}) node[above] {${yName}};`);
          const whole = ([from, to]: [number, number]) => {
            const out: number[] = [];
            for (let t = Math.floor(Math.min(from, to)) + 1; t < Math.max(from, to) && out.length < 60; t += 1) if (t) out.push(t);
            return out.join(',');
          };
          if (item.ticks && whole(item.x)) lines.push(`\\foreach \\t in {${whole(item.x)}} \\draw (\\t,0.08) -- (\\t,-0.08) node[below] {\\small $\\t$};`);
          if (item.ticks && whole(item.y)) lines.push(`\\foreach \\t in {${whole(item.y)}} \\draw (0.08,\\t) -- (-0.08,\\t) node[left] {\\small $\\t$};`);
          if (item.origin) lines.push('\\node[below left] at (0,0) {$O$};');
        }
      }
    }
    // the ratio's parts, named along the segment
    for (const p of points) {
      if (p.of?.kind !== 'ratio' || !p.of.marks) continue;
      lines.push(`\\path ${ref(p.of.a)} -- ${ref(p.id)} node[midway, ${p.of.marks}] {$${num(p.of.m)}$};`, `\\path ${ref(p.id)} -- ${ref(p.of.b)} node[midway, ${p.of.marks}] {$${num(p.of.n)}$};`);
    }
    for (const p of points) {
      const label = p.label?.text.trim() ? ` node[${side(p.label!)}] {${p.label!.text}}` : '';
      if (label) texts.push(p.label!.text);
      if (p.dot) lines.push(`\\fill ${ref(p.id)} circle (2pt)${label};`);
      else if (label) lines.push(`\\node[${side(p.label!)}] at ${ref(p.id)} {${p.label!.text}};`);
    }
    return lines.filter(Boolean);
  };

  const options = [style.scale !== 1 && `scale=${num(style.scale)}`, `>=${style.tips}`].filter(Boolean).join(', ');
  const body = [`\\begin{tikzpicture}[${options}]`];
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
  body.push('\\end{tikzpicture}', '');
  return { body: body.join('\n'), packages: ['tikz', ...mathsPackages(texts)], libraries: calc ? ['calc'] : [] };
}
