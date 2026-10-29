// The circuit canvas's labels: TeX sketched as text with its subscripts and superscripts, and placed beside a part
// clear of the symbol's drawn outline (symbolGeometry.ts), whichever way the part runs or turns.
import { placeNodeOffset } from './model';
import type { NodePart, PathPart, Pt, pathFrame } from './model';
import type { Box } from './symbolGeometry';

const SYMBOLS: Record<string, string> = { Omega: 'Ω', mu: 'µ', pi: 'π', int: '∫', approx: '≈', cdot: '·', times: '×', '%': '%' };

/** TeX as the canvas sketches it: the common maths and units read as text, font sizes and the rest of the markup dropped. */
export const plain = (text: string) =>
  text
    .replace(/\$/g, '')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\[,;!]/g, ' ')
    .replace(/\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large)\s*/g, '')
    .replace(/\\(Omega|mu|pi|int|approx|cdot|times|%)/g, (_, name: string) => SYMBOLS[name])
    .replace(/\\[A-Za-z]+/g, '')
    .replace(/[{}]/g, '');

export type Run = { text: string; shift?: 'sub' | 'super' };

/** TeX as runs of text, a subscript or superscript its own run as the preview sets it: C_1, R_{in}, V^2. */
export function scriptRuns(tex: string): Run[] {
  const runs: Run[] = [];
  const push = (text: string, shift?: Run['shift']) => {
    const shown = plain(text);
    if (shown) runs.push(shift ? { text: shown, shift } : { text: shown });
  };
  let last = 0;
  for (const m of tex.matchAll(/([_^])(?:\{((?:[^{}]|\{[^{}]*\})*)\}|(\\[A-Za-z]+|[^\s{}]))/g)) {
    push(tex.slice(last, m.index));
    push(m[2] ?? m[3], m[1] === '_' ? 'sub' : 'super');
    last = m.index! + m[0].length;
  }
  push(tex.slice(last));
  return runs;
}

/** A label's size in grid steps, for text `font` grid steps high: a script run is set smaller. */
export function labelSize(runs: Run[], font: number) {
  const chars = runs.reduce((n, run) => n + run.text.length * (run.shift ? 0.7 : 1), 0);
  return { w: chars * 0.6 * font, h: font * (runs.some((run) => run.shift) ? 1.4 : 1.1) };
}

/** grid steps between a label and the outline */
const GAP = 0.3;

/**
 * Where a path part's label goes (its centre): on `side` (1 the left of a→b, circuitikz's ^; -1 its _), clear of the
 * symbol's outline (from the middle, x along the part) as mirror, invert and size draw it.
 */
export function pathLabelAt(part: Pick<PathPart, 'mirror' | 'size'>, frame: ReturnType<typeof pathFrame>, outline: Box, side: 1 | -1, size: { w: number; h: number }): Pt {
  const s = part.size || 1;
  const [low, high] = part.mirror ? [-outline.maxY * s, -outline.minY * s] : [outline.minY * s, outline.maxY * s];
  // how far the outline reaches that way, then half the label's extent that way: they can't overlap along it
  const reach = Math.max(0, side > 0 ? high : -low);
  const d = { x: -frame.u.y * side, y: frame.u.x * side };
  const t = reach + (Math.abs(d.x) * size.w) / 2 + (Math.abs(d.y) * size.h) / 2 + GAP;
  return { x: frame.mid.x + d.x * t, y: frame.mid.y + d.y * t };
}

/** Where a node part's name goes (its centre): above the outline as the part is turned and flipped. */
export function nodeNameAt(part: Pick<NodePart, 'at' | 'rotate' | 'flipX' | 'flipY'>, outline: Box, size: { w: number; h: number }): Pt {
  const corners = [
    { x: outline.minX, y: outline.minY },
    { x: outline.maxX, y: outline.minY },
    { x: outline.maxX, y: outline.maxY },
    { x: outline.minX, y: outline.maxY }
  ].map((p) => placeNodeOffset(part, p));
  const xs = corners.map((p) => p.x);
  const top = Math.max(...corners.map((p) => p.y));
  return { x: part.at.x + (Math.min(...xs) + Math.max(...xs)) / 2, y: part.at.y + top + size.h / 2 + GAP };
}
