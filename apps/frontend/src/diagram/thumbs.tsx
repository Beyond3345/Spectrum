import type { ReactNode } from 'react';
import type { Starter, StarterMode } from './starters';

// The chooser cards' line drawings: one small picture for each kind of starter, in currentColor (the card's area colour
// in the Spectrum colour style), on a 64 × 40 grid. Checked in thumbs.check.ts.

const arrow = (x: number, y: number, dx: number, dy: number) => {
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const [hx, hy] = [x + dx, y + dy];
  return `M${x} ${y}L${hx} ${hy}M${hx - 4 * ux + 2.5 * uy} ${hy - 4 * uy - 2.5 * ux}L${hx} ${hy}L${hx - 4 * ux - 2.5 * uy} ${hy - 4 * uy + 2.5 * ux}`;
};
const p = (d: string) => <path d={d} />;
const box = (x: number, y: number, w: number, h: number, r = 2) => <rect x={x} y={y} width={w} height={h} rx={r} />;
const dot = (x: number, y: number, r = 2) => <circle cx={x} cy={y} r={r} className="fill" />;

const KINDS = {
  circuit: (
    <>
      {p('M10 32V8H24l2-3 4 6 4-6 4 6 2-3H54V32H38')}
      {p('M26 32H10M28 27v10M32 29v6')}
    </>
  ),
  opamp: (
    <>
      {p('M24 6V34L48 20Z')}
      {p('M8 14H24M8 26H24M48 20H58M28 14h4M30 12v4M28 26h4')}
      {p('M16 14V4H52V20')}
    </>
  ),
  diode: (
    <>
      {p('M6 20H24M40 20H58M24 11V29L38 20Z')}
      {p('M40 11V29')}
    </>
  ),
  chip: (
    <>
      {box(20, 6, 24, 28)}
      {p('M12 12H20M12 20H20M12 28H20M44 12H52M44 20H52M44 28H52')}
    </>
  ),
  gate: (
    <>
      {p('M20 8H32A12 12 0 0 1 32 32H20Z')}
      {p('M8 14H20M8 26H20M44 20H56')}
    </>
  ),
  blocks: (
    <>
      {p(arrow(4, 18, 8, 0) + arrow(16, 18, 6, 0) + arrow(36, 18, 8, 0) + 'M52 18H60M56 18V32H14V22')}
      <circle cx="14" cy="18" r="3" />
      {box(22, 11, 14, 14)}
      {box(44, 13, 8, 10)}
    </>
  ),
  spring: (
    <>
      {p('M6 4V34M2 34H62M6 20H12l3-6 5 12 5-12 5 12 3-6H40')}
      {box(40, 8, 18, 24)}
    </>
  ),
  beam: (
    <>
      {p('M6 24H58')}
      {p('M10 24l-4 7h8ZM54 24l-4 7h8Z')}
      {p(arrow(32, 6, 0, 16))}
      {p('M4 34H60')}
    </>
  ),
  truss: (
    <>
      {p('M6 30H58M6 30L16 10H48L58 30M16 10L26 30L32 10L38 30L48 10')}
      {p('M6 30l-3 6h6ZM58 30l-3 6h6Z')}
    </>
  ),
  frame: (
    <>
      {p('M14 34V10H50V34M10 34h8M46 34h8')}
      {p(arrow(2, 10, 9, 0))}
      {p(arrow(32, 2, 0, 6))}
    </>
  ),
  plot: (
    <>
      {p(arrow(8, 34, 52, 0) + arrow(8, 34, 0, -30))}
      {p('M10 30C22 30 26 10 34 10S44 24 56 14')}
    </>
  ),
  wave: (
    <>
      {p(arrow(4, 20, 56, 0))}
      {p('M6 20V8H18V32H30V8H42V32H54V20')}
    </>
  ),
  field: (
    <>
      {[10, 26, 42].flatMap((x) => [10, 22, 34].map((y) => <path key={`${x}-${y}`} d={arrow(x, y, 9, ((x + y) % 3) - 3)} />))}
    </>
  ),
  bell: (
    <>
      {p('M4 34H60')}
      {p('M6 33C18 33 22 6 32 6S46 33 58 33')}
      {p('M44 33V22M48 33V27M52 33V30')}
    </>
  ),
  loops: (
    <>
      <ellipse cx="32" cy="20" rx="24" ry="10" />
      {p('M32 4V36M6 20H58')}
      <ellipse cx="32" cy="20" rx="8" ry="15" />
    </>
  ),
  sequence: (
    <>
      {box(6, 4, 16, 7)}
      {box(42, 4, 16, 7)}
      {p('M14 11V36M50 11V36')}
      {p(arrow(14, 18, 34, 0) + arrow(50, 28, -34, 0))}
    </>
  ),
  gantt: (
    <>
      {p('M6 4V36')}
      {box(8, 6, 20, 6, 1.5)}
      {box(22, 17, 22, 6, 1.5)}
      {box(38, 28, 18, 6, 1.5)}
    </>
  ),
  pie: (
    <>
      <circle cx="32" cy="20" r="15" />
      {p('M32 20V5M32 20L45 27.5M32 20L19 29')}
    </>
  ),
  bars: (
    <>
      {p('M6 34H58')}
      {box(10, 20, 8, 14, 1)}
      {box(24, 10, 8, 24, 1)}
      {box(38, 16, 8, 18, 1)}
      {p('M14 18L28 8L42 14L56 6')}
    </>
  ),
  mindmap: (
    <>
      <ellipse cx="32" cy="20" rx="10" ry="6" />
      {p('M22 18L10 8M22 22L10 32M42 18L54 8M42 22L54 32')}
      {dot(10, 8)}
      {dot(10, 32)}
      {dot(54, 8)}
      {dot(54, 32)}
    </>
  ),
  git: (
    <>
      {p('M6 26H58M18 26C24 26 24 12 32 12H40C46 12 46 26 52 26')}
      {dot(6, 26, 2.5)}
      {dot(18, 26, 2.5)}
      {dot(52, 26, 2.5)}
      {dot(32, 12, 2.5)}
      {dot(40, 12, 2.5)}
    </>
  ),
  tables: (
    <>
      {box(4, 6, 20, 28)}
      {p('M4 13H24')}
      {box(40, 6, 20, 28)}
      {p('M40 13H60M24 20H40M36 16L40 20L36 24')}
    </>
  ),
  states: (
    <>
      <circle cx="14" cy="22" r="8" />
      <circle cx="48" cy="22" r="8" />
      <circle cx="48" cy="22" r="5" />
      {p(arrow(22, 19, 17, 0))}
      {p('M44 29Q31 38 18 29M18 29l4.6 0.4M18 29l2.4 -3.9')}
    </>
  ),
  layers: (
    <>
      {box(6, 8, 10, 24)}
      {box(24, 4, 10, 32)}
      {box(42, 12, 10, 16)}
      {p(arrow(16, 20, 7, 0) + arrow(34, 20, 7, 0))}
    </>
  ),
  lanes: (
    <>
      {box(4, 4, 56, 32, 2)}
      {p('M4 20H60M14 4V36')}
      {box(18, 8, 12, 8, 1.5)}
      {box(40, 24, 14, 8, 1.5)}
      {p('M30 12H36V28H40')}
    </>
  ),
  flowchart: (
    <>
      {box(20, 2, 24, 9)}
      {p('M32 11V15M32 15L42 21L32 27L22 21Z')}
      {p(arrow(32, 27, 0, 5))}
      {box(20, 32, 24, 6)}
      {p('M42 21H54V35H44')}
    </>
  ),
  square: (
    <>
      {dot(14, 8)}
      {dot(50, 8)}
      {dot(14, 32)}
      {dot(50, 32)}
      {p(arrow(18, 8, 28, 0) + arrow(14, 12, 0, 16) + arrow(50, 12, 0, 16) + arrow(18, 32, 28, 0))}
    </>
  ),
  chain: (
    <>
      {dot(6, 20)}
      {dot(22, 20)}
      {dot(38, 20)}
      {dot(54, 20)}
      {p(arrow(9, 20, 10, 0) + arrow(25, 20, 10, 0) + arrow(41, 20, 10, 0))}
    </>
  ),
  venn: (
    <>
      <circle cx="25" cy="20" r="14" />
      <circle cx="39" cy="20" r="14" />
    </>
  ),
  mohr: (
    <>
      {p('M4 20H60M14 4V36')}
      <circle cx="34" cy="20" r="14" />
      {p('M24 10L44 30')}
    </>
  ),
  fluid: (
    <>
      {p('M10 4V36H54V4')}
      {p('M10 14C18 11 22 17 32 14S46 11 54 14')}
      {p(arrow(30, 22, 0, 10))}
    </>
  ),
  grid: (
    <>
      {p('M8 34L20 6M24 34L36 6M40 34L52 6M4 30H52M10 18H58')}
    </>
  ),
  block: (
    <>
      {p('M2 32H62')}
      {box(22, 18, 20, 14)}
      {p(arrow(32, 25, 0, 13) + arrow(32, 25, 0, -21) + arrow(42, 25, 16, -6) + arrow(22, 28, -16, 0))}
    </>
  ),
  vectors: (
    <>
      {p('M8 34H58M8 34V4')}
      {p(arrow(8, 34, 38, -10) + arrow(8, 34, 14, -26))}
      {p('M22 8L46 24')}
    </>
  ),
  shape: (
    <>
      {p('M8 34L30 6L54 34Z')}
      <circle cx="31" cy="24" r="9" />
    </>
  ),
  mixed: (
    <>
      {box(4, 8, 16, 12)}
      <circle cx="32" cy="14" r="6" />
      {p('M44 20L52 6L60 20Z')}
      {p('M4 30H20l2-3 4 6 4-6 4 6 2-3H60')}
    </>
  )
} satisfies Record<string, ReactNode>;

export type ThumbKind = keyof typeof KINDS;

// a starter's picture by its id, in order, else its mode's
const BY_ID: [RegExp, ThumbKind][] = [
  [/^exact-sequence$/, 'chain'],
  [/amplifier|follower|integrator|differentiator/, 'opamp'],
  [/rectifier/, 'diode'],
  [/555/, 'chip'],
  [/^logic$/, 'gate'],
  [/block-diagram|feedback-loop/, 'blocks'],
  [/mass-spring/, 'spring'],
  [/truss/, 'truss'],
  [/frame/, 'frame'],
  [/signal-sketch|damped/, 'wave'],
  [/slope-field|phase-portrait/, 'field'],
  [/normal-curve/, 'bell'],
  [/polar-rose|lissajous|conic/, 'loops'],
  [/sequence$/, 'sequence'],
  [/gantt|timeline/, 'gantt'],
  [/pie/, 'pie'],
  [/xychart/, 'bars'],
  [/mindmap/, 'mindmap'],
  [/gitgraph/, 'git'],
  [/mermaid-er/, 'tables'],
  [/state-machine/, 'states'],
  [/model-architecture/, 'layers'],
  [/swimlane/, 'lanes'],
  [/^venn$/, 'venn'],
  [/^mohr$/, 'mohr'],
  [/^(gate|manometer|tank|floating)$/, 'fluid'],
  [/^transformation$/, 'grid'],
  [/free-body/, 'block'],
  [/general-drawing/, 'mixed']
];
const BY_MODE: Record<StarterMode, ThumbKind> = {
  circuitikz: 'circuit',
  pgfplots: 'plot',
  tikz: 'flowchart',
  'tikz-cd': 'square',
  mermaid: 'flowchart',
  fletcher: 'flowchart',
  form: 'shape',
  structures: 'beam',
  vectors: 'vectors'
};

export const thumbFor = (s: Pick<Starter, 'id' | 'mode'>): ThumbKind => BY_ID.find(([re]) => re.test(s.id))?.[1] ?? BY_MODE[s.mode];

/** A starter's card picture: decoration, as the card's title names it. */
export function StarterThumb({ starter }: { starter: Pick<Starter, 'id' | 'mode'> }) {
  return (
    <svg className="chooser-thumb" viewBox="0 0 64 40" aria-hidden="true" focusable="false">
      {KINDS[thumbFor(starter)]}
    </svg>
  );
}
