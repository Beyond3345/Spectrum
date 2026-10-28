// The structure as plain TikZ: numeric coordinates in cm, its styles and symbols defined in the picture's options (so
// nothing reaches the document's preamble but tikz and two libraries), and a comment heading each part so the Code
// tab is easy to edit. Nothing in it is newer than PGF 3.0 or uses calc.
import type { DiagramCode } from '../../fileFormat';
import { mathsPackages, num } from '../shared';
import { VIEWS, buildScene, readStyle } from './draw';
import type { Fill, Ink, Item, Scene } from './draw';
import { asStructure } from './model';
import { solve } from './solve';
import { picDefinition, picName } from './symbols';

const INKS: Record<Ink, string> = {
  member: 'line width=1.2pt',
  bar: 'line width=0.9pt',
  zero: 'line width=0.9pt, dashed',
  line: 'line width=0.4pt',
  load: 'line width=0.6pt',
  reaction: 'line width=0.8pt',
  force: 'line width=0.8pt',
  dimension: 'line width=0.3pt',
  cut: 'line width=0.8pt, dashed',
  faint: 'line width=0.4pt, black!35',
  axis: 'line width=0.4pt'
};

const FILLS: Record<Fill, string> = {
  shear: 'fill=blue!12',
  moment: 'fill=red!12',
  axial: 'fill=green!15',
  load: 'fill=black!6'
};

const at = (p: { x: number; y: number }) => `(${num(p.x)},${num(p.y)})`;

function itemTikz(item: Item): string {
  switch (item.t) {
    case 'line': {
      const options = [`struct ${item.ink}`, item.fill && `struct ${item.fill} fill`, item.arrow].filter(Boolean).join(', ');
      return `\\draw[${options}] ${item.pts.map(at).join(' -- ')}${item.closed ? ' -- cycle' : ''};`;
    }
    case 'arc': {
      const t = (item.from * Math.PI) / 180;
      const start = { x: item.c.x + item.r * Math.cos(t), y: item.c.y + item.r * Math.sin(t) };
      return `\\draw[struct ${item.ink}, ->] ${at(start)} arc[start angle=${num(item.from)}, end angle=${num(item.to)}, radius=${num(item.r)}];`;
    }
    case 'pic':
      return `\\pic${item.rotate ? `[rotate=${num(item.rotate)}]` : ''} at ${at(item.at)} {${picName(item.name)}};`;
    case 'text':
      return `\\node${item.anchor === 'center' ? '' : `[anchor=${item.anchor}]`} at ${at(item.at)} {${item.tex}};`;
    case 'dot':
      return `\\draw[${item.open ? 'fill=white' : 'fill'}] ${at(item.at)} circle (${num(item.r)});`;
  }
}

/** A scene as a tikzpicture: the styles and the pics it uses in the options, then each block under its comment. */
export function sceneTikz(scene: Scene, heading: string) {
  const items = scene.blocks.flatMap((b) => b.items);
  const inks = [...new Set(items.flatMap((i) => (i.t === 'line' || i.t === 'arc' ? [i.ink] : [])))];
  const fills = [...new Set(items.flatMap((i) => (i.t === 'line' && i.fill ? [i.fill] : [])))];
  const pics = [...new Set(items.flatMap((i) => (i.t === 'pic' ? [i.name] : [])))].sort();
  const options = [
    '>={Stealth[length=1.8mm]}',
    'font=\\footnotesize',
    ...inks.map((ink) => `struct ${ink}/.style={${INKS[ink]}}`),
    ...fills.map((fill) => `struct ${fill} fill/.style={${FILLS[fill]}}`),
    ...pics.map(picDefinition)
  ];
  const lines = [`% ${heading}`, '\\begin{tikzpicture}[', ...options.map((o, i) => `  ${o}${i < options.length - 1 ? ',' : ''}`), ']'];
  if (scene.message) lines.push(`% ${scene.message}`);
  for (const block of scene.blocks) {
    lines.push(`% ${block.title}`);
    const body = block.items.map(itemTikz);
    if (block.shift && (block.shift.x || block.shift.y)) lines.push(`\\begin{scope}[shift={${at(block.shift)}}]`, ...body, '\\end{scope}');
    else lines.push(...body);
  }
  lines.push('\\end{tikzpicture}', '');
  return { body: lines.join('\n'), texts: items.flatMap((i) => (i.t === 'text' ? [i.tex] : [])) };
}

export function structureCode(raw: unknown, rawStyle: Record<string, unknown>): DiagramCode {
  const model = asStructure(raw);
  const style = readStyle(rawStyle);
  const solution = solve(model);
  const scene = buildScene(model, solution, style);
  const view = VIEWS.find(([v]) => v === style.view)![1];
  const status = solution.status.kind === 'empty' ? '' : `: ${solution.status.text}`;
  const { body, texts } = sceneTikz(scene, `Structure, ${view.toLowerCase()}${status}`);
  return { body, packages: ['tikz', ...mathsPackages(texts)], libraries: ['arrows.meta', 'babel'] };
}
