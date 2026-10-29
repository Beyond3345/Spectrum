import { unitWriter } from '../../units';
import { latexColour, num } from '../shared';

// Plots (pgfplots): a form rather than a drawing. Each series is a function of x over a domain, two columns of a data
// file in the project, or one of the kinds below; annotations mark points, tangents, secants, lines, areas and labels
// on the function series. Spectrum computes nothing from the expressions: TeX does, through declared functions.

/**
 * parametric: x = exprX, y = expr in t; polar: r = expr in t; piecewise: pieces, each over its own x range; signal:
 * a waveform; quiver: arrows (u, v) = (exprX, expr) in x and y on a grid from `from` to `to` both ways, `samples` a side.
 */
export type SeriesSource = 'function' | 'data' | 'parametric' | 'polar' | 'piecewise' | 'signal' | 'quiver';
export type Signal = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pulse' | 'rectified' | 'step';
export type Piece = { expr: string; from: string; to: string };

export type Series = {
  id: string;
  source: SeriesSource;
  /** in x, as pgfplots reads it: x^2, sin(x) (radians), exp(-x) */
  expr: string;
  from: string;
  to: string;
  samples: number;
  /** project-relative, e.g. data/results.csv */
  file: string;
  x: string;
  y: string;
  legend: string;
  line: 'solid' | 'dashed' | 'dotted';
  marks: boolean;
  /** '#rrggbb', or none for pgfplots' own next colour */
  colour?: string;
  /** a parametric series' x(t), a quiver's u(x, y) */
  exprX?: string;
  pieces?: Piece[];
  signal?: Signal;
  /** a signal's height, period (a step's time), and a pulse train's fraction of the period high */
  amplitude?: string;
  period?: string;
  duty?: string;
  /** a function or data drawn as stems (ycomb) */
  stem?: boolean;
  /** a quiver's arrows all the same length */
  normalise?: boolean;
};

export type AnnotationKind = 'point' | 'tangent' | 'secant' | 'line' | 'area' | 'label';
/**
 * On the function series `series` at x = at (a point with drop lines, a tangent, a label); from at to `to` (a secant,
 * an area under it, or between it and `series2`); a reference line x = at or y = at (axis). text: a label's, a point's
 * or a line's.
 */
export type Annotation = {
  id: string;
  kind: AnnotationKind;
  series: string;
  series2?: string;
  at: string;
  to?: string;
  axis?: 'x' | 'y';
  text?: string;
  place?: 'above' | 'below' | 'left' | 'right' | 'above right';
  colour?: string;
};

export type LegendPos = 'north east' | 'north west' | 'south east' | 'south west' | 'outer north east';

export type PlotModel = {
  series: Series[];
  title: string;
  xlabel: string;
  ylabel: string;
  xmin: string;
  xmax: string;
  ymin: string;
  ymax: string;
  grid: 'none' | 'major' | 'both';
  legendPos: LegendPos;
  /** cm, '' for pgfplots' own */
  width: string;
  /** box: a frame (none: pgfplots' own), centre: axes through the origin, sketch: those with arrows and no ticks */
  axes?: 'box' | 'centre' | 'sketch';
  xmode?: 'linear' | 'log';
  ymode?: 'linear' | 'log';
  /** ticks where they're wanted, with labels: "pi/2 = $\frac{\pi}{2}$; pi = $\pi$" (a label is optional) */
  xticks?: string;
  yticks?: string;
  annotations?: Annotation[];
};

export const newSeries = (id: string): Series => ({ id, source: 'function', expr: 'x^2', from: '-2', to: '2', samples: 100, file: '', x: '', y: '', legend: '', line: 'solid', marks: false });

export const emptyPlot = (): PlotModel => ({
  series: [newSeries('s1')],
  title: '',
  xlabel: '$x$',
  ylabel: '$y$',
  xmin: '',
  xmax: '',
  ymin: '',
  ymax: '',
  grid: 'major',
  legendPos: 'north west',
  width: ''
});

/** The Signal sketch starter: a square wave on axes with arrows and no ticks. */
export const signalSketch = (): PlotModel => ({
  ...emptyPlot(),
  series: [{ ...newSeries('s1'), source: 'signal', signal: 'square', amplitude: '1', period: '2', duty: '0.5', from: '0', to: '6' }],
  xlabel: '$t$',
  ylabel: '$v(t)$',
  ymin: '-1.5',
  ymax: '1.5',
  grid: 'none',
  axes: 'sketch',
  width: '8'
});

/** The Vector and slope field starter: dy/dx = x − y as arrows of one length. */
export const slopeField = (): PlotModel => ({
  ...emptyPlot(),
  series: [{ ...newSeries('s1'), source: 'quiver', exprX: '1', expr: 'x - y', from: '-2', to: '2', samples: 15, normalise: true }],
  grid: 'none'
});

/** The kinds added since functions and data; any other source (older drawings have 'file') is written as data. */
const NEW_SOURCES: SeriesSource[] = ['parametric', 'polar', 'piecewise', 'signal', 'quiver'];
/**
 * The plot uses something a build from before these additions would write without: its file is then version 2, which
 * such a build opens as code instead of saving it with parts missing.
 */
export const plotIsNewer = (model: PlotModel) =>
  !!(model.axes || model.xmode || model.ymode || model.xticks || model.yticks || model.annotations?.length) ||
  model.series.some((s) => NEW_SOURCES.includes(s.source) || s.stem);

/** The separator pgfplots needs told for a data file, by its extension (whitespace needs none). */
export const separatorOf = (file: string) => (/\.csv$/i.test(file) ? 'comma' : /\.tsv$/i.test(file) ? 'tab' : null);

/** A data file's column names, from its first line. */
export function columnsOf(file: string, text: string) {
  const first = text.split(/\r?\n/).find((l) => l.trim() && !/^\s*[#%]/.test(l)) ?? '';
  const sep = separatorOf(file);
  return first.split(sep === 'comma' ? ',' : sep === 'tab' ? '\t' : /\s+/).map((c) => c.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
}

const isNumber = (text: string | undefined) => text !== undefined && text.trim() !== '' && Number.isFinite(Number(text));
/** A number typed, or the fallback. */
const numberOr = (text: string | undefined, fallback: number) => (isNumber(text) ? Number(text) : fallback);
/** A domain bound pgfmath reads: a number, or a short expression such as 2*pi. */
const bound = (text: string) => (isNumber(text) ? num(Number(text)) : /^[\d\s.+\-*/()a-z]+$/i.test(text.trim()) ? `{${text.trim()}}` : '');

/** The value of a waveform at t, and where it turns or jumps between a and b. */
function waveform(s: Series, a: number, b: number): { value(t: number): number; breaks: number[] } {
  const amplitude = numberOr(s.amplitude, 1);
  const period = Math.abs(numberOr(s.period, 1)) || 1;
  const duty = Math.min(1, Math.max(0, numberOr(s.duty, 0.5)));
  const frac = (t: number) => t - Math.floor(t);
  // multiples of the period plus each offset, from a to b
  const every = (...offsets: number[]) => {
    const out: number[] = [];
    for (let k = Math.floor(a / period) - 1; k * period <= b + period; k += 1) for (const o of offsets) out.push((k + o) * period);
    return out;
  };
  switch (s.signal) {
    case 'triangle':
      // up from 0 to the amplitude at a quarter period, as a sine
      return { value: (t) => amplitude * (4 * Math.abs(frac(t / period - 0.25) - 0.5) - 1), breaks: every(0.25, 0.75) };
    case 'sawtooth':
      return { value: (t) => amplitude * (2 * frac(t / period + 0.5) - 1), breaks: every(0.5) };
    case 'pulse':
      return { value: (t) => (frac(t / period) < duty ? amplitude : 0), breaks: every(0, duty) };
    case 'step':
      // up at t = the period field
      return { value: (t) => (t < numberOr(s.period, 0) ? 0 : amplitude), breaks: [numberOr(s.period, 0)] };
    default:
      return { value: (t) => (frac(t / period) < 0.5 ? amplitude : -amplitude), breaks: every(0, 0.5) };
  }
}

/** A straight-line waveform's corners from a to b, a jump as two points at one t. ponytail: ε-sided limits, fine at 3 decimals. */
export function waveformPoints(s: Series): [number, number][] {
  const [a, b] = [numberOr(s.from, 0), numberOr(s.to, 1)].sort((p, q) => p - q);
  const { value, breaks } = waveform(s, a, b);
  const eps = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const points: [number, number][] = [[a, value(a)]];
  for (const t of breaks.filter((t) => t > a && t < b).sort((p, q) => p - q)) {
    const [before, after] = [value(t - eps), value(t + eps)];
    points.push([t, Math.abs(before - after) > 1e-6 ? before : value(t)]);
    if (Math.abs(before - after) > 1e-6) points.push([t, after]);
  }
  // the value coming into the end, which a jump there doesn't change
  points.push([b, value(b - eps)]);
  return points.map(([t, v]) => [Number(num(t)), Number(num(v))]);
}

/** A pgfmath expression in x as the body of a declared function of \x. */
const inX = (expr: string) => (expr.trim() || 'x').replace(/(?<![\\\w])x(?!\w)/g, '\\x');

function styleOf(s: Series) {
  return [s.colour && `color=${latexColour(s.colour)}`, s.line !== 'solid' && s.line, s.stem ? 'ycomb' : !s.marks && 'no markers'];
}

function seriesLines(s: Series): string[] {
  const style = styleOf(s);
  const samples = `samples=${Math.max(2, Math.round(s.samples) || 100)}`;
  const domainOf = (from: string, to: string) => {
    const [a, b] = [bound(from), bound(to)];
    return a && b ? `domain=${a}:${b}` : '';
  };
  const plot = (options: unknown[], what: string) => `\\addplot+[${options.filter(Boolean).join(', ')}] ${what};`;
  switch (s.source) {
    case 'function': {
      const domain = isNumber(s.from) && isNumber(s.to) ? `domain=${num(Number(s.from))}:${num(Number(s.to))}` : '';
      return [plot([domain, samples, ...style], `{${s.expr.trim() || 'x'}}`)];
    }
    case 'parametric':
      return [plot([domainOf(s.from, s.to), samples, 'variable=t', ...style], `({${s.exprX?.trim() || 't'}}, {${s.expr.trim() || 't'}})`)];
    case 'polar': {
      const r = s.expr.trim() || '1';
      return [plot([domainOf(s.from, s.to), samples, 'variable=t', ...style], `({(${r})*cos(t)}, {(${r})*sin(t)})`)];
    }
    case 'piecewise': {
      // the later pieces first, forgotten, so all take the colour and the legend entry of the first, written last
      const pieces = (s.pieces ?? []).filter((p) => p.expr.trim() && domainOf(p.from, p.to));
      if (!pieces.length) return [];
      const line = (p: Piece, forget: boolean) => plot([forget && 'forget plot', domainOf(p.from, p.to), samples, ...style], `{${p.expr.trim()}}`);
      return [...pieces.slice(1).map((p) => line(p, true)), line(pieces[0], false)];
    }
    case 'signal': {
      const amplitude = num(numberOr(s.amplitude, 1));
      const period = num(Math.abs(numberOr(s.period, 1)) || 1);
      if (s.signal === 'sine' || s.signal === 'rectified') {
        const wave = `${amplitude}*sin(2*pi*x/${period})`;
        return [plot([domainOf(s.from, s.to), samples, ...style], `{${s.signal === 'sine' ? wave : `abs(${wave})`}}`)];
      }
      return [plot(style, `coordinates {${waveformPoints(s).map(([t, v]) => `(${num(t)},${num(v)})`).join(' ')}}`)];
    }
    case 'quiver': {
      const [u, v] = [s.exprX?.trim() || '1', s.expr.trim() || '0'];
      const n = Math.max(2, Math.min(40, Math.round(s.samples) || 15));
      const [a, b] = [numberOr(s.from, -2), numberOr(s.to, 2)];
      // arrows of one length fill most of the gap between grid points
      const length = s.normalise ? `sqrt((${u})^2+(${v})^2)+1e-9` : '';
      const scale = s.normalise ? `, scale arrows=${num((0.8 * Math.abs(b - a)) / (n - 1))}` : '';
      const quiver = length ? `quiver={u={(${u})/(${length})}, v={(${v})/(${length})}${scale}}` : `quiver={u={${u}}, v={${v}}}`;
      return [`\\addplot3+[${[quiver, '-stealth', `domain=${num(a)}:${num(b)}`, `y domain=${num(a)}:${num(b)}`, `samples=${n}`, ...styleOf({ ...s, marks: false, stem: false })].filter(Boolean).join(', ')}] {0};`];
    }
    default: {
      const sep = separatorOf(s.file);
      const table = [s.x && `x={${s.x}}`, s.y && `y={${s.y}}`, sep && `col sep=${sep}`].filter(Boolean);
      const options = style.filter(Boolean);
      return [`\\addplot+[${options.join(', ')}] table${table.length ? `[${table.join(', ')}]` : ''} {${s.file}};`];
    }
  }
}

/** "pi/2 = $\frac{\pi}{2}$; pi" as pgfplots' tick and tick label keys. */
export function ticksOf(axis: 'x' | 'y', text: string) {
  const ticks = text.split(';').map((t) => t.trim()).filter(Boolean).map((t) => {
    const at = t.indexOf('=');
    return at < 0 ? { at: t, label: '' } : { at: t.slice(0, at).trim(), label: t.slice(at + 1).trim() };
  }).filter((t) => t.at);
  if (!ticks.length) return [];
  // a tick without a label among labelled ones shows its value, as it would on its own
  const value = (at: string) => (isNumber(at) ? `$${num(Number(at))}$` : `$\\pgfmathparse{${at}}\\pgfmathprintnumber{\\pgfmathresult}$`);
  return [`${axis}tick={${ticks.map((t) => t.at).join(',')}}`, ...(ticks.some((t) => t.label) ? [`${axis}ticklabels={${ticks.map((t) => `{${t.label || value(t.at)}}`).join(',')}}`] : [])];
}

/** What an annotation draws, after the series: TeX works out every value from the declared functions. */
function annotationLines(a: Annotation, model: PlotModel, functions: Map<string, string>): string[] {
  const f = functions.get(a.series);
  const colour = a.colour ? `color=${latexColour(a.colour)}` : '';
  const text = a.text?.trim();
  const opts = (...more: unknown[]) => [...more, colour].filter(Boolean).join(', ');
  const x0 = Number(a.at);
  if (!isNumber(a.at)) return [];
  const centred = !!model.axes && model.axes !== 'box';
  // where the axes are: the origin for centred axes, else the frame's bottom-left corner
  const base = centred && model.xmode !== 'log' && model.ymode !== 'log' ? 'axis cs:0,0' : 'rel axis cs:0,0';
  const name = `spx-${a.id}`;
  if (a.kind === 'line') {
    // across the whole axis, at x = at or y = at: the line's point taken across to the frame's corners (1 on the other
    // axis, which a log axis can take)
    const y = a.axis === 'y';
    return [
      `\\coordinate (${name}) at (axis cs:${y ? `1,${num(x0)}` : `${num(x0)},1`});`,
      `\\coordinate (${name}-a) at (rel axis cs:0,0);`,
      `\\coordinate (${name}-b) at (rel axis cs:1,1);`,
      `\\draw[${opts('dashed')}] (${name} ${y ? '-|' : '|-'} ${name}-a) -- (${name} ${y ? '-|' : '|-'} ${name}-b)${text ? ` node[pos=1, ${y ? 'above left' : 'below right'}] {${text}}` : ''};`
    ];
  }
  if (!f) return [];
  const mark = (points: number[]) => `\\addplot[${opts('only marks', 'mark=*', 'forget plot')}, samples at={${points.map(num).join(',')}}] {${f}(x)};`;
  // the curve's point at x0, named: taken from a plot, where sin and the like take radians, as they don't in a coordinate
  const point = `\\addplot[draw=none, forget plot, samples at={${num(x0)}}] {${f}(x)} coordinate[pos=0] (${name});`;
  switch (a.kind) {
    case 'point':
      return [
        point,
        `\\coordinate (${name}-o) at (${base});`,
        `\\draw[${opts('dashed')}] (${name} -| ${name}-o) -- (${name}) -- (${name} |- ${name}-o);`,
        mark([x0]),
        ...(text ? [`\\node[${opts(a.place ?? 'above right')}] at (${name}) {${text}};`] : [])
      ];
    case 'tangent': {
      // the slope as a central difference in pgfmath, over a quarter of the series' x range each way
      const s = model.series.find((x) => x.id === a.series);
      const half = Math.abs(numberOr(s?.to, 2) - numberOr(s?.from, -2)) / 4 || 1;
      const h = num(1e-3 * Math.max(1, Math.abs(x0)));
      const slope = `(${f}(${num(x0)}+${h})-${f}(${num(x0)}-${h}))/(2*${h})`;
      return [`\\addplot[${opts('forget plot', `domain=${num(x0 - half)}:${num(x0 + half)}`, 'samples=2')}] {${f}(${num(x0)})+${slope}*(x-(${num(x0)}))};`, mark([x0])];
    }
    case 'secant': {
      if (!isNumber(a.to) || Number(a.to) === x0) return [];
      const x1 = Number(a.to);
      const over = Math.abs(x1 - x0) / 4;
      const [lo, hi] = [Math.min(x0, x1) - over, Math.max(x0, x1) + over];
      return [`\\addplot[${opts('forget plot', `domain=${num(lo)}:${num(hi)}`, 'samples=2')}] {${f}(${num(x0)})+(${f}(${num(x1)})-${f}(${num(x0)}))/(${num(x1 - x0)})*(x-(${num(x0)}))};`, mark([x0, x1])];
    }
    case 'area': {
      if (!isNumber(a.to)) return [];
      const domain = `domain=${num(Math.min(x0, Number(a.to)))}:${num(Math.max(x0, Number(a.to)))}`;
      const fill = a.colour ? `fill=${latexColour(a.colour)}` : 'fill=gray';
      const g = a.series2 ? functions.get(a.series2) : undefined;
      // under the curve down to y = 0, or between two curves with the fillbetween library
      if (!g) return [`\\addplot[${[fill, 'fill opacity=0.3', 'draw=none', 'forget plot', domain, 'samples=50'].join(', ')}] {${f}(x)} \\closedcycle;`];
      return [
        `\\addplot[draw=none, forget plot, name path=${name}-a, ${domain}, samples=50] {${f}(x)};`,
        `\\addplot[draw=none, forget plot, name path=${name}-b, ${domain}, samples=50] {${g}(x)};`,
        `\\addplot[${fill}, fill opacity=0.3, forget plot] fill between[of=${name}-a and ${name}-b];`
      ];
    }
    case 'label':
      return [point, `\\node[${opts(a.place ?? 'above')}] at (${name}) {${text ?? ''}};`];
  }
}

/** style.siUnits: an axis title's unit in brackets, Load (kN), written with \\unit */
export function plotCode(model: PlotModel, style: Record<string, unknown> = {}) {
  const si = unitWriter(style.siUnits === true);
  // a data series without its file can't compile: it waits until one is picked
  const series = model.series.filter((s) => s.source === 'function' || NEW_SOURCES.includes(s.source) || s.file);
  const legends = series.some((s) => s.legend.trim());
  const annotations = model.annotations ?? [];
  // each function series an annotation is on, declared as a function TeX can evaluate anywhere: spxfa, spxfb, …
  const used = new Set(annotations.flatMap((a) => (a.kind === 'line' ? [] : [a.series, ...(a.kind === 'area' && a.series2 ? [a.series2] : [])])));
  const declared = series.filter((s) => s.source === 'function' && used.has(s.id));
  const functions = new Map(declared.map((s, i) => [s.id, `spxf${String.fromCharCode(97 + (i % 26)).repeat(1 + Math.floor(i / 26))}`]));
  const centred = !!model.axes && model.axes !== 'box';
  const axis = [
    model.title.trim() && `title={${model.title.trim()}}`,
    model.xlabel.trim() && `xlabel={${si.title(model.xlabel.trim())}}`,
    model.ylabel.trim() && `ylabel={${si.title(model.ylabel.trim())}}`,
    ...(['xmin', 'xmax', 'ymin', 'ymax'] as const).map((key) => isNumber(model[key]) && `${key}=${num(Number(model[key]))}`),
    model.grid !== 'none' && `grid=${model.grid}`,
    legends && `legend pos=${model.legendPos}`,
    isNumber(model.width) && Number(model.width) > 0 && `width=${num(Number(model.width))}cm`,
    // axes through the origin, with their labels at the ends
    centred && 'axis lines=middle',
    centred && model.xlabel.trim() && 'xlabel style={at={(ticklabel* cs:1)}, anchor=west}',
    centred && model.ylabel.trim() && 'ylabel style={at={(ticklabel* cs:1)}, anchor=south}',
    model.xmode === 'log' && 'xmode=log',
    model.ymode === 'log' && 'ymode=log',
    ...ticksOf('x', model.xticks ?? ''),
    ...ticksOf('y', model.yticks ?? ''),
    // a sketch has no ticks but those asked for
    model.axes === 'sketch' && !ticksOf('x', model.xticks ?? '').length && 'xtick=\\empty',
    model.axes === 'sketch' && !ticksOf('y', model.yticks ?? '').length && 'ytick=\\empty',
    // a quiver's arrows are drawn by \addplot3, seen from above
    series.some((s) => s.source === 'quiver') && 'view={0}{90}',
    declared.length > 0 && `declare function={${declared.map((s) => `${functions.get(s.id)}(\\x)=${inX(s.expr)};`).join(' ')}}`,
    // sin(x) and the like in radians, as written in maths
    'trig format plots=rad'
  ].filter(Boolean);
  const lines = [
    // in the picture, so the figure looks the same inside a document that doesn't set it
    '\\pgfplotsset{compat=1.18}',
    '\\begin{tikzpicture}',
    `\\begin{axis}[${axis.join(', ')}]`,
    ...series.flatMap((s) => {
      const drawn = seriesLines(s);
      if (!drawn.length) return [];
      return [...drawn, ...(s.legend.trim() ? [`\\addlegendentry{${s.legend.trim()}}`] : legends ? ['\\addlegendentry{}'] : [])];
    }),
    ...annotations.flatMap((a) => annotationLines(a, model, functions)),
    '\\end{axis}',
    '\\end{tikzpicture}'
  ];
  const between = annotations.some((a) => a.kind === 'area' && a.series2 && functions.has(a.series2) && functions.has(a.series));
  return { body: `${lines.join('\n')}\n`, packages: ['pgfplots', ...(si.used ? ['siunitx'] : [])], libraries: between ? ['pgfplots.fillbetween'] : [] };
}
