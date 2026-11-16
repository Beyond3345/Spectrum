// Annotate: lines, arrows, frames, ellipses and crosses drawn over a circuit, the look of Text, and the presets that
// put a styled group of them down in one click. All in plain TikZ after the circuit, so they sit above it; arrowheads
// from arrows.meta, which the picture loads only when one is drawn. Spectrum 2.5 adds the fluid mechanics and materials
// courses' drawing tools: a closed shape filled with a liquid or solid (a tint, or a pattern from the patterns library,
// both written before the circuit so they sit behind its parts), a hatched boundary, a dimension, the ▽ free-surface mark,
// point marks and leader callouts.
import { tikzColour } from '../shared';
import { anchorFor } from './labels';
import { GRID_CM, newId } from './model';
import type { Annotation, CircuitModel, Element, Material, NodePart, Pattern, Pt } from './model';

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

// ─── 2.5: fills, boundaries, dimensions, marks and leaders ───

/** A closed shape's materials: the name, and the tint the user's notes and the slides give it. */
export const MATERIALS: Record<Material, [string, string]> = {
  water: ['Water', 'blue!12'],
  seawater: ['Seawater', 'teal!25'],
  oil: ['Oil', 'orange!30'],
  mercury: ['Mercury', 'gray!45'],
  air: ['Air', 'cyan!6'],
  concrete: ['Concrete', 'gray!25']
};

/**
 * The patterns, as the exam papers draw them: a tile w by h mm, its strokes (x1, y1, x2, y2), dots and rings (x, y, r)
 * in mm. Liquids as staggered dashes, mercury and walls hatched, concrete as stipple with a few aggregate rings.
 */
export const PATTERNS: Record<Pattern, { label: string; w: number; h: number; lines?: number[][]; dots?: number[][]; rings?: number[][] }> = {
  dashes: { label: 'Dashes', w: 4, h: 2, lines: [[0.25, 0.5, 1.75, 0.5], [2.25, 1.5, 3.75, 1.5]] },
  dots: { label: 'Dots', w: 2, h: 2, dots: [[0.5, 0.5], [1.5, 1.5]] },
  hatch: { label: 'Hatching', w: 2, h: 2, lines: [[-0.1, -0.1, 2.1, 2.1]] },
  crosshatch: { label: 'Cross hatching', w: 2, h: 2, lines: [[-0.1, -0.1, 2.1, 2.1], [-0.1, 2.1, 2.1, -0.1]] },
  stipple: { label: 'Stipple', w: 4, h: 4, dots: [[0.6, 0.8], [2.6, 1.4], [1.5, 3.1], [3.5, 3.4], [0.3, 2.4], [2.9, 2.6]], rings: [[1.6, 1.9, 0.45], [3.3, 0.5, 0.3]] }
};
/** a pattern's dot radius and line widths, pt */
export const PATTERN_PT = { dot: 0.35, line: 0.4, ring: 0.3 };

/** A pattern's declaration, written in the picture that uses it; a second picture in the same document skips it. */
export function patternDefinition(pattern: Pattern) {
  const t = PATTERNS[pattern];
  const pt = (x: number, y: number) => `\\pgfqpoint{${num(x)}mm}{${num(y)}mm}`;
  const lines = t.lines ? `\\pgfsetlinewidth{${PATTERN_PT.line}pt}${t.lines.map(([a, b, c, d]) => `\\pgfpathmoveto{${pt(a, b)}}\\pgfpathlineto{${pt(c, d)}}`).join('')}\\pgfusepath{stroke}` : '';
  const dots = t.dots ? `${t.dots.map(([x, y]) => `\\pgfpathcircle{${pt(x, y)}}{${PATTERN_PT.dot}pt}`).join('')}\\pgfusepath{fill}` : '';
  const rings = t.rings ? `\\pgfsetlinewidth{${PATTERN_PT.ring}pt}${t.rings.map(([x, y, r]) => `\\pgfpathcircle{${pt(x, y)}}{${num(r)}mm}`).join('')}\\pgfusepath{stroke}` : '';
  const name = `spx ${pattern}`;
  return `\\ifcsname pgf@pattern@name@${name}\\endcsname\\else\\pgfdeclarepatternformonly{${name}}{${pt(-0.1, -0.1)}}{${pt(t.w + 0.1, t.h + 0.1)}}{${pt(t.w, t.h)}}{${lines}${dots}${rings}}\\fi`;
}

/** The patterns a drawing's annotations use, in PATTERNS' order. */
export const patternsUsed = (els: Element[]) => (Object.keys(PATTERNS) as Pattern[]).filter((p) => els.some((el) => el.kind === 'annotation' && el.material && el.pattern === p));

/** A filled shape sits behind the circuit's parts, as a tank's water behind the tank. */
export const isBehind = (a: Annotation) => !!a.material;

const dot = (p: Pt, q: Pt) => p.x * q.x + p.y * q.y;
const plus = (p: Pt, q: Pt, s = 1) => ({ x: p.x + q.x * s, y: p.y + q.y * s });
const unit = (d: Pt) => {
  const len = Math.hypot(d.x, d.y);
  return len ? { x: d.x / len, y: d.y / len } : { x: 1, y: 0 };
};
/** a way snapped to the eight compass points TikZ's anchors name: within 22.5° of an axis is along it */
export const compass = (d: Pt): Pt => {
  const u = unit(d);
  return { x: Math.abs(u.x) > 0.38 ? Math.sign(u.x) : 0, y: Math.abs(u.y) > 0.38 ? Math.sign(u.y) : 0 };
};

/** a boundary's hatching: strokes 0.2 cm long and 0.2 cm apart at 45°, as the mechanics set's ground */
export const HATCH_CM = 0.2;
/** each boundary segment: its start, its angle in degrees, its length in cm, and its strokes' start and end */
export function hatchSegments(a: Annotation) {
  const step = HATCH_CM / GRID_CM;
  return a.points.slice(1).map((q, i) => {
    const p = a.points[i];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const u = unit({ x: q.x - p.x, y: q.y - p.y });
    const side = a.hatch === 'left' ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
    const lean = { x: (side.x - u.x) * step, y: (side.y - u.y) * step };
    const count = Math.floor((len * GRID_CM) / HATCH_CM + 1e-6);
    const strokes = Array.from({ length: count }, (_, k): [Pt, Pt] => {
      const from = plus(p, u, (k + 1) * step);
      return [from, plus(from, lean)];
    });
    return { p, angle: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI, cm: len * GRID_CM, strokes };
  });
}

/** a dimension's extension lines start this far from what they measure, and go this far past its line, cm */
export const DIMENSION_GAP_CM = 0.05;
export const DIMENSION_OVER_CM = 0.1;
/**
 * A dimension: its line's two ends (through its third point, across the way it measures), its extension lines, and the
 * way out from what it measures, where its text goes. Measured along the line between its points, across (x) or up (y).
 */
export function dimensionGeometry(a: Annotation) {
  const p = a.points[0];
  const q = a.points[1] ?? p;
  const u = a.along === 'x' ? { x: Math.sign(q.x - p.x) || 1, y: 0 } : a.along === 'y' ? { x: 0, y: Math.sign(q.y - p.y) || 1 } : unit({ x: q.x - p.x, y: q.y - p.y });
  const n = { x: -u.y, y: u.x };
  const c = dot(n, a.points[2] ?? p);
  const ends = [p, q].map((e) => plus(e, n, c - dot(n, e))) as [Pt, Pt];
  const [gap, over] = [DIMENSION_GAP_CM / GRID_CM, DIMENSION_OVER_CM / GRID_CM];
  const extensions = [p, q].flatMap((e, i): [Pt, Pt][] => {
    const d = c - dot(n, e);
    return Math.abs(d) > gap + 1e-6 ? [[plus(e, n, Math.sign(d) * gap), plus(ends[i], n, Math.sign(d) * over)]] : [];
  });
  const out = Math.sign(c - (dot(n, p) + dot(n, q)) / 2) || 1;
  return { ends, extensions, mid: plus(ends[0], { x: ends[1].x - ends[0].x, y: ends[1].y - ends[0].y }, 0.5), out: { x: n.x * out, y: n.y * out } };
}

/** where a mark's letter goes, as TikZ's node[right] and the others put it */
export const PLACES = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, above: { x: 0, y: 1 }, below: { x: 0, y: -1 } };
/** a mark's dot radius in pt, by its width */
export const MARK_PT = { thin: 1, semithick: 1.2, thick: 1.5, 'very thick': 2 };
/** a mark's cross, half its width, cm */
export const MARK_CROSS_CM = 0.08;
/** the ▽ mark's triangle (half its width and its height) and the two lines under it (their depth and half width), cm */
export const SURFACE_CM = { half: 0.15, high: 0.26, lines: [[0.07, 0.15], [0.14, 0.08]] };

/** A leader's text: where it sits, and the way from its point to the text. */
export const leaderText = (a: Annotation) => ({ at: a.points[0], way: compass({ x: a.points[0].x - (a.points[1] ?? a.points[0]).x, y: a.points[0].y - (a.points[1] ?? a.points[0]).y }) });

/** A dimension's or mark's text: maths, unless it has a space (2 m) or its own $…$. */
export const mathsUnlessWords = (text: string) => (text.includes('$') || /\s/.test(text.trim()) ? text.trim() : `$${text.trim()}$`);

/** An annotation as TikZ: a \draw, and for a loop current a second for its arrowhead. */
export function annotationCode(a: Annotation): string {
  // the keys every annotation shares: colour, dash and width, in TikZ's words
  const keys = (extra: unknown[], dash: string | null | undefined = a.dash) => {
    const all = [...extra, a.colour && `draw=${tikzColour(a.colour)}`, dash, a.width].filter(Boolean);
    return all.length ? `[${all.join(', ')}]` : '';
  };
  /** a point in cm */
  const P = (x: number, y: number) => `(${num(x)},${num(y)})`;
  if (a.shape === 'cross') {
    const s = a.size ?? 0.5;
    const { x, y } = a.points[0];
    return `\\draw${keys([])} ${at({ x: x - s, y: y - s })} -- ${at({ x: x + s, y: y + s })} ${at({ x: x - s, y: y + s })} -- ${at({ x: x + s, y: y - s })};`;
  }
  if (a.shape === 'line' || a.shape === 'leader') {
    const arrows = a.arrows && a.arrows.replace('>', tip(a)).replace('<', tip(a));
    const join = a.bend ? `to[bend ${a.bend > 0 ? 'left' : 'right'}=${num(Math.abs(a.bend))}]` : '--';
    const coords = a.points.map(at);
    // a leader's words at its first point, on the side away from the line
    if (a.shape === 'leader') coords[0] += ` node[anchor=${anchorFor(leaderText(a).way)}] {${a.text?.trim() ?? ''}}`;
    return `\\draw${keys([arrows])} ${coords.join(` ${join} `)};`;
  }
  if (a.shape === 'boundary') {
    const line = `\\draw${keys([!a.width && 'line width=0.8pt'])} ${a.points.map(at).join(' -- ')};`;
    const ink = a.colour ? `[draw=${tikzColour(a.colour)}]` : '';
    const lean = `++(${num(-HATCH_CM)},${num(a.hatch === 'left' ? HATCH_CM : -HATCH_CM)})`;
    const hatching = hatchSegments(a)
      .filter((seg) => seg.strokes.length)
      .map((seg) => `\n\\begin{scope}[shift={${at(seg.p)}}${seg.angle ? `, rotate=${num(seg.angle)}` : ''}]\\foreach \\i in {1,...,${seg.strokes.length}} \\draw${ink} (${HATCH_CM}*\\i,0) -- ${lean};\\end{scope}`);
    return line + hatching.join('');
  }
  if (a.shape === 'surface') {
    const { x, y } = { x: a.points[0].x * GRID_CM, y: a.points[0].y * GRID_CM };
    const { half, high, lines } = SURFACE_CM;
    return `\\draw${keys([], null)} ${P(x, y)} -- ++(${num(-half)},${num(high)}) -- ++(${num(2 * half)},0) -- cycle${lines.map(([down, w]) => ` ${P(x - w, y - down)} -- ++(${num(2 * w)},0)`).join('')};`;
  }
  if (a.shape === 'mark') {
    const label = a.text?.trim() ? ` node[${a.place || 'right'}] {${mathsUnlessWords(a.text)}}` : '';
    const { x, y } = { x: a.points[0].x * GRID_CM, y: a.points[0].y * GRID_CM };
    if (!a.cross) return `\\fill${a.colour ? `[fill=${tikzColour(a.colour)}]` : ''} ${at(a.points[0])} circle (${MARK_PT[a.width || 'thin']}pt)${label};`;
    const s = MARK_CROSS_CM;
    return `\\draw${keys([], null)} ${P(x - s, y - s)} -- ${P(x + s, y + s)} ${P(x - s, y + s)} -- ${P(x + s, y - s)}${label ? ` ${at(a.points[0])}${label}` : ''};`;
  }
  if (a.shape === 'dimension') {
    const g = dimensionGeometry(a);
    const ext = g.extensions.length ? `\\draw${keys([], null)} ${g.extensions.map(([p, q]) => `${at(p)} -- ${at(q)}`).join(' ')};\n` : '';
    const where = a.textAt === 'gap' ? 'fill=white, inner sep=1pt' : `anchor=${anchorFor(compass(g.out))}`;
    const label = a.text?.trim() ? ` node[midway, ${where}] {${mathsUnlessWords(a.text)}}` : '';
    return `${ext}\\draw${keys([`${tip(a)}-${tip(a)}`], null)} ${at(g.ends[0])} -- ${at(g.ends[1])}${label};`;
  }
  // a closed shape: a material's tint or pattern (written behind the circuit), or a light fill over it
  const material = a.material && (a.pattern ? [`pattern=spx ${a.pattern}`, a.colour && `pattern color=${tikzColour(a.colour)}`] : [`fill=${MATERIALS[a.material][1]}`]);
  const fill = material || (a.fill && [`fill=${tikzColour(a.fill)}`, 'fill opacity=0.15']) || [];
  // a material with no outline is only its fill
  const bare = !!(material && a.noOutline);
  const draw = (extra: unknown[]) => (bare ? `\\path[${extra.filter(Boolean).join(', ')}]` : `\\draw${keys(extra)}`);
  const { c, rx, ry } = box(a);
  const shape =
    a.shape === 'polygon'
      ? `${draw(fill)} ${a.points.map(at).join(' -- ')} -- cycle;`
      : a.shape === 'rect'
        ? `${draw([a.rounded && `rounded corners=${num(ROUNDED_CM * 10)}mm`, ...fill])} ${at({ x: c.x - rx, y: c.y - ry })} rectangle ${at({ x: c.x + rx, y: c.y + ry })};`
        : `${draw(fill)} ${at(c)} ellipse [x radius=${num(rx * GRID_CM)}, y radius=${num(ry * GRID_CM)}];`;
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
export const usesArrows = (els: Element[]) => els.some((el) => el.kind === 'annotation' && (el.arrows || el.loop || el.shape === 'dimension'));

// ─── presets ───

export const PRESETS = [
  ['resistance', 'Resistance looking in'],
  ['current', 'Current arrow'],
  ['loop', 'Loop current'],
  ['mesh', 'Mesh current marker'],
  ['frame', 'Frame'],
  ['highlight', 'Highlight'],
  // a fluid mechanics course's points: a dot and its letter
  ['C', 'Centroid C'],
  ['CP', 'Centre of pressure CP'],
  ['G', 'Centre of gravity G'],
  ['B', 'Centre of buoyancy B'],
  ['M', 'Metacentre M']
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
    default:
      add({ shape: 'mark', points: pts([0, 0]), text: preset });
  }
  return made;
}
