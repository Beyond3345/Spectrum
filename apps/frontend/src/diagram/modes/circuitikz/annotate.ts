// Annotate: lines, arrows, frames, ellipses and crosses drawn over a circuit, the look of Text, and the presets that
// put a styled group of them down in one click. All in plain TikZ after the circuit, so they sit above it; arrowheads
// from arrows.meta, which the picture loads only when one is drawn.
import { tikzColour } from '../shared';
import { GRID_CM, newId } from './model';
import type { Annotation, CircuitModel, Element, NodePart, Pt } from './model';

/** The palette: the course's dark red first (RGB 176, 57, 44), then xcolor's own; black is the fallback. */
export const ANNOTATION_COLOURS = ['#b0392c', 'red', 'magenta', 'blue', 'green!50!black', 'orange', 'gray'];
const DARK_RED = '#b0392c';

/** arrows.meta's tips, by the model's name for them */
export const HEADS = { latex: 'Latex', stealth: 'Stealth', triangle: 'Triangle[open]', to: 'To' } as const;
/** a tip's length in cm: small, medium, large */
export const HEAD_CM = { small: 0.15, medium: 0.2, large: 0.3 } as const;
/** TikZ's line widths in pt */
export const WIDTH_PT = { thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2 } as const;
export const FONT_SCALE = { scriptsize: 0.7, footnotesize: 0.8, small: 0.9, large: 1.2 } as const;
/** a rectangle's rounded corners, cm */
export const ROUNDED_CM = 0.25;
/** a loop current's arrowhead: half the short line it tips, cm */
const LOOP_HALF_CM = 0.15;

const num = (v: number) => {
  const rounded = Math.round(v * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};
const at = (p: Pt) => `(${num(p.x * GRID_CM)},${num(p.y * GRID_CM)})`;

const tip = (a: Pick<Annotation, 'head' | 'headSize'>) => {
  const [name, open] = HEADS[a.head || 'latex'].split('[');
  const length = `length=${num(HEAD_CM[a.headSize || 'medium'] * 10)}mm`;
  return `{${name}[${open ? `${open.slice(0, -1)}, ` : ''}${length}]}`;
};


/** A box's centre and half sizes, from its two corners. */
export function box(a: Annotation) {
  const [p, q] = [a.points[0], a.points[1] ?? a.points[0]];
  return { c: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, rx: Math.abs(q.x - p.x) / 2, ry: Math.abs(q.y - p.y) / 2 };
}

/** A loop current's arrowhead: the short line it tips, on the box's right side, down for clockwise. */
export function loopLine(a: Annotation): [Pt, Pt] {
  const { c, rx } = box(a);
  const h = (LOOP_HALF_CM / GRID_CM) * (a.loop === 'ccw' ? -1 : 1);
  return [{ x: c.x + rx, y: c.y + h }, { x: c.x + rx, y: c.y - h }];
}

/** An annotation as TikZ: a \draw, and for a loop current a second for its arrowhead. */
export function annotationCode(a: Annotation): string {
  // the keys every annotation shares: colour, dash and width, in TikZ's words
  const keys = (extra: unknown[], dash: string | null | undefined = a.dash) => {
    const all = [...extra, a.colour && `draw=${tikzColour(a.colour)}`, dash, a.width].filter(Boolean);
    return all.length ? `[${all.join(', ')}]` : '';
  };
  if (a.shape === 'cross') {
    const s = a.size ?? 0.5;
    const { x, y } = a.points[0];
    return `\\draw${keys([])} ${at({ x: x - s, y: y - s })} -- ${at({ x: x + s, y: y + s })} ${at({ x: x - s, y: y + s })} -- ${at({ x: x + s, y: y - s })};`;
  }
  if (a.shape === 'line') {
    const arrows = a.arrows && a.arrows.replace('>', tip(a)).replace('<', tip(a));
    const join = a.bend ? `to[bend ${a.bend > 0 ? 'left' : 'right'}=${num(Math.abs(a.bend))}]` : '--';
    return `\\draw${keys([arrows])} ${a.points.map(at).join(` ${join} `)};`;
  }
  const fill = a.fill && [`fill=${tikzColour(a.fill)}`, 'fill opacity=0.15'];
  const { c, rx, ry } = box(a);
  const shape =
    a.shape === 'rect'
      ? `\\draw${keys([a.rounded && `rounded corners=${num(ROUNDED_CM * 10)}mm`, ...(fill || [])])} ${at({ x: c.x - rx, y: c.y - ry })} rectangle ${at({ x: c.x + rx, y: c.y + ry })};`
      : `\\draw${keys(fill || [])} ${at(c)} ellipse [x radius=${num(rx * GRID_CM)}, y radius=${num(ry * GRID_CM)}];`;
  if (!a.loop) return shape;
  const [from, to] = loopLine(a);
  // the arrowhead in the outline's colour and width, never its dash
  return `${shape}\n\\draw${keys([`-${tip(a)}`], null)} ${at(from)} -- ${at(to)};`;
}

/** Text's keys for its look, before its turns: nothing when it has none, so older drawings write what they did. */
export function textKeys(el: Pick<NodePart, 'colour' | 'bold' | 'italic' | 'font'>) {
  const font = `${el.bold ? '\\bfseries' : ''}${el.italic ? '\\itshape' : ''}${el.font ? `\\${el.font}` : ''}`;
  return [el.colour && `text=${tikzColour(el.colour)}`, font && `font=${font}`].filter(Boolean) as string[];
}

/** Whether any annotation draws an arrowhead: the picture then loads arrows.meta. */
export const usesArrows = (els: Element[]) => els.some((el) => el.kind === 'annotation' && (el.arrows || el.loop));

// ─── presets ───

export const PRESETS = [
  ['resistance', 'Resistance looking in'],
  ['current', 'Current arrow'],
  ['loop', 'Loop current'],
  ['mesh', 'Mesh current marker'],
  ['frame', 'Frame'],
  ['highlight', 'Highlight']
] as const;
export type Preset = (typeof PRESETS)[number][0];

const shift = (p: Pt, d: Pt) => ({ x: p.x + d.x, y: p.y + d.y });

/** A preset's elements around `c` (grid steps): annotations, and Text for its label, all new. */
export function presetElements(model: CircuitModel, preset: Preset, c: Pt): Element[] {
  const made: Element[] = [];
  const add = (el: Omit<Annotation, 'id' | 'kind'> | Omit<NodePart, 'id' | 'kind' | 'type'>, text?: boolean) => {
    const id = newId({ ...model, elements: [...model.elements, ...made] });
    made.push(text ? ({ id, kind: 'node', type: 'text', ...el } as NodePart) : ({ id, kind: 'annotation', ...el } as Annotation));
  };
  const label = (d: Pt, text: string, colour = DARK_RED) => add({ at: shift(c, d), text, colour, bold: true }, true);
  const pts = (...ds: [number, number][]) => ds.map(([x, y]) => shift(c, { x, y }));
  switch (preset) {
    case 'resistance':
      // a cut on the wire at c, and a hooked arrow coming up from below it and along the wire, as the slides draw it
      add({ shape: 'cross', points: pts([0, 0]), width: 'thick', colour: DARK_RED });
      add({ shape: 'line', points: pts([-1, -4], [-1, -1], [3, -1]), arrows: '->', width: 'thick', colour: DARK_RED });
      label({ x: -1, y: -5.2 }, '$R_{\\mathrm{in}}$');
      break;
    case 'current':
      add({ shape: 'line', points: pts([0, 0], [4, 0]), arrows: '->', width: 'thick', colour: DARK_RED });
      label({ x: 2, y: 1.4 }, '$i$');
      break;
    case 'loop':
      add({ shape: 'ellipse', points: pts([-4, -4], [4, 4]), loop: 'cw', width: 'thick', colour: DARK_RED });
      label({ x: 0, y: 0 }, '$i_1$');
      break;
    case 'mesh':
      add({ shape: 'rect', points: pts([-3, -5], [3, 5]), rounded: true, fill: 'blue', loop: 'cw' });
      add({ at: c, text: '\\textcircled{1}' }, true);
      break;
    case 'frame':
      add({ shape: 'rect', points: pts([-8, -6], [8, 6]), dash: 'dashed' });
      add({ at: shift(c, { x: 0, y: 7.2 }), text: 'Feedback network' }, true);
      break;
    case 'highlight':
      add({ shape: 'ellipse', points: pts([-3, -2], [3, 2]), width: 'thick', colour: 'red' });
      break;
  }
  return made;
}
