import { unitWriter } from '../../units';
import { escapeTex, latexColour, num } from '../shared';

// Plots (pgfplots): a form rather than a drawing. Each series is a function of x over a domain, two columns of a data
// file in the project, or one of the kinds below; annotations mark points, tangents, secants, lines, areas and labels
// on the function series. Spectrum computes nothing from the expressions: TeX does, through declared functions.

/**
 * parametric: x = exprX, y = expr in t; polar: r = expr in t; piecewise: pieces, each over its own x range; signal:
 * a waveform; quiver: arrows (u, v) = (exprX, expr) in x and y on a grid from `from` to `to` both ways, `samples` a side;
 * points: typed in `points`; fit: the least-squares line through the points of the series `of`.
 */
export type SeriesSource = 'function' | 'data' | 'parametric' | 'polar' | 'piecewise' | 'signal' | 'quiver' | 'points' | 'fit';
/** pgfplots' mark names: * filled, o open */
export type MarkShape = '*' | 'o' | 'x' | '+' | 'square*' | 'square' | 'triangle*' | 'triangle' | 'diamond*' | 'diamond';
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
  /** none: marks alone (a scatter) */
  line: 'solid' | 'dashed' | 'dotted' | 'dashdotted' | 'none';
  marks: boolean;
  /** the marks' shape, none for pgfplots' own */
  mark?: MarkShape;
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
  /** points typed in, one a line or split by semicolons: "x, y", "x, y, error", each with "= label" if wanted */
  points?: string;
  /** a fit's points series, and whether its line goes through the origin */
  of?: string;
  origin?: boolean;
  /** points or a data file: a smooth curve through them, bars, and a data file's error column */
  smooth?: boolean;
  bars?: boolean;
  yerr?: string;
  /** a data file split by semicolons, saved when its columns are picked (comma as the decimal point) */
  sep?: 'semicolon';
  /** a function broken at its asymptotes, with no y range set */
  breaks?: boolean;
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

export type LegendPos = 'north east' | 'north west' | 'south east' | 'south west' | 'outer north east' | 'below';

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
  /** cm, as width */
  height?: string;
  /** one unit the same length on both axes, so a circle is round */
  equal?: boolean;
  /** x increasing to the left */
  xReverse?: boolean;
  /** black lines told apart by dashes and marks */
  bw?: boolean;
  /** tick numbers: no ×10ⁿ or thousands separator (and 0.3, not 10^-0.52, on a log axis), a fixed count of decimals, a decimal comma */
  tickPlain?: boolean;
  tickDecimals?: string;
  tickComma?: boolean;
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
  // beside the plot, where no curve can be
  legendPos: 'outer north east',
  width: ''
});

/**
 * A series turned into a kind it has not been yet, keeping what the kinds share. Marks are each kind's own: on for typed
 * points, off for the rest, so a curve does not take a mark at every sample from the points it was.
 */
export function asKind(s: Series, source: SeriesSource): Partial<Series> {
  switch (source) {
    case 'parametric':
      return { source, exprX: s.exprX || 'cos(t)', expr: 'sin(t)', from: '0', to: '2*pi', marks: false };
    case 'polar':
      return { source, expr: '1+cos(t)', from: '0', to: '2*pi', marks: false };
    case 'piecewise':
      return { source, pieces: s.pieces?.length ? s.pieces : [{ expr: '-x', from: '-2', to: '0' }, { expr: 'x^2', from: '0', to: '2' }], marks: false };
    case 'signal':
      return { source, signal: s.signal ?? 'square', amplitude: s.amplitude ?? '1', period: s.period ?? '2', duty: s.duty ?? '0.5', from: '0', to: '6', marks: false };
    case 'quiver':
      return { source, exprX: '1', expr: 'x - y', from: '-2', to: '2', samples: 15, normalise: true, marks: false };
    case 'function':
      // a data series keeps the function it was
      return s.source === 'data' ? { source, marks: false } : { source, expr: 'x^2', from: '-2', to: '2', samples: 100, marks: false };
    case 'points':
      return { source, points: s.points ?? '0, 1\n1, 3\n2, 4\n3, 7', marks: true };
    case 'fit':
      return { source, of: s.of, from: '', to: '', marks: false };
    default:
      return { source, marks: false };
  }
}

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

/**
 * The Stress–strain curve starter, as the mild-steel sketch in ENGG3042 lecture 2: elastic to the yield point, a short
 * plateau, hardening to the ultimate strength and necking to fracture, the named points marked, an unloading line
 * parallel to the elastic one to the permanent strain, and the area under the curve shaded.
 */
export const stressStrain = (): PlotModel => {
  const line = (id: string, points: string, more: Partial<Series> = {}): Series => ({ ...newSeries(id), source: 'points', points, colour: '#000000', ...more });
  return {
    ...emptyPlot(),
    series: [
      line('s1', '0, 0\n1, 3'),
      line('s2', '1, 3\n3, 3.1\n5, 3.6\n6.5, 3.9\n9, 4.2\n11, 3.9\n12, 3.3', { smooth: true }),
      line('s3', '5, 3.6\n3.8, 0', { line: 'dashed' }),
      line('s4', '1, 3 = Yield\n5, 3.6 = Unloading\n9, 4.2 = Ultimate\n12, 3.3 = Fracture', { line: 'none', marks: true, mark: '*' })
    ],
    // the area under the curve: the work absorbed per unit volume
    annotations: [
      { id: 'a1', kind: 'area', series: 's1', at: '0', to: '1' },
      { id: 'a2', kind: 'area', series: 's2', at: '1', to: '12' }
    ],
    xlabel: 'Strain $\\varepsilon$',
    ylabel: 'Stress $\\sigma$',
    xmin: '0',
    xmax: '13.5',
    ymin: '0',
    ymax: '5',
    // the permanent strain where the unloading line meets the axis (3.6 / 3 short of 5)
    xticks: '3.8 = $\\varepsilon_p$',
    grid: 'none',
    axes: 'sketch',
    width: '9',
    height: '6'
  };
};

/**
 * The Grading curve starter: percent passing against sieve opening on a log axis (the practice paper's sand), each
 * point labelled, inside the ASTM C33 limits for fine aggregate as a shaded band.
 */
export const gradingCurve = (): PlotModel => {
  const limit = (id: string, points: string, legend = ''): Series => ({ ...newSeries(id), source: 'points', points, legend, line: 'dashed', colour: '#2e7d32' });
  return {
    ...emptyPlot(),
    series: [
      limit('s1', '0.15, 10\n0.3, 30\n0.6, 60\n1.18, 85\n2.36, 100\n4.75, 100\n9.5, 100', 'ASTM C33 limits'),
      limit('s2', '0.15, 0\n0.3, 5\n0.6, 25\n1.18, 50\n2.36, 80\n4.75, 95\n9.5, 100'),
      { ...newSeries('s3'), source: 'points', points: '0.15, 5 = 5\n0.3, 21 = 21\n0.6, 47 = 47\n1.18, 73 = 73\n2.36, 90 = 90\n4.75, 98 = 98', marks: true, mark: '*', colour: '#1f4e9c', legend: 'Sample' }
    ],
    annotations: [{ id: 'a1', kind: 'area', series: 's1', series2: 's2', at: '', to: '', colour: '#66bb6a' }],
    xlabel: 'Sieve opening (mm)',
    ylabel: 'Passing (%)',
    xmin: '0.1',
    xmax: '10',
    ymin: '0',
    ymax: '105',
    xmode: 'log',
    xticks: '0.15; 0.3; 0.6; 1.18; 2.36; 4.75; 9.5',
    yticks: '0; 20; 40; 60; 80; 100',
    tickPlain: true,
    legendPos: 'below',
    width: '11',
    height: '7'
  };
};

// The chooser's other plot starters, each a plot the form can make

/** A function series. */
const fn = (id: string, expr: string, from: string, to: string, more: Partial<Series> = {}): Series => ({ ...newSeries(id), expr, from, to, ...more });

/** The Normal curve starter: the standard normal density with its upper 5 % tail shaded beyond z = 1.645. */
export const normalCurve = (): PlotModel => ({
  ...emptyPlot(),
  series: [fn('s1', 'exp(-x^2/2)/sqrt(2*pi)', '-3.5', '3.5', { colour: '#1f4e9c' })],
  annotations: [
    { id: 'a1', kind: 'area', series: 's1', at: '1.645', to: '3.5', colour: '#1f4e9c' },
    { id: 'a2', kind: 'label', series: 's1', at: '1.9', text: '$\\alpha = 0.05$', place: 'above right' }
  ],
  xlabel: '$z$',
  ylabel: '$\\varphi(z)$',
  xmin: '-3.5',
  xmax: '3.5',
  ymin: '0',
  ymax: '0.45',
  xticks: '-3; -2; -1; 0; 1; 1.645 = $z_{\\alpha}$; 3',
  grid: 'none',
  width: '9',
  height: '5.5'
});

/** The Bode magnitude starter: a first-order low-pass with its asymptotes, its corner ωc at 100 rad/s. */
export const bodeMagnitude = (): PlotModel => ({
  ...emptyPlot(),
  series: [
    fn('s1', '-10*log10(1+(x/100)^2)', '1', '10000', { samples: 200, legend: 'Exact' }),
    { ...newSeries('s2'), source: 'points', points: '1, 0\n100, 0\n10000, -40', line: 'dashed', colour: '#000000', legend: 'Asymptotes' }
  ],
  xlabel: 'Frequency $\\omega$ (rad/s)',
  ylabel: 'Magnitude (dB)',
  xmin: '1',
  xmax: '10000',
  ymin: '-45',
  ymax: '5',
  xmode: 'log',
  // 1000 rad/s, not 10 to a power, and the corner named
  tickPlain: true,
  xticks: '1; 10; 100 = $\\omega_c$; 1000; 10000',
  grid: 'both',
  legendPos: 'south west',
  width: '10',
  height: '6'
});

/** The Damped oscillation starter: e^(−0.3t) cos 2t inside its dashed envelope ±e^(−0.3t). */
export const dampedOscillation = (): PlotModel => {
  const envelope = (id: string, sign: string) => fn(id, `${sign}exp(-0.3*x)`, '0', '12', { line: 'dashed', colour: '#9e9e9e' });
  return {
    ...emptyPlot(),
    series: [fn('s1', 'exp(-0.3*x)*cos(2*x)', '0', '12', { samples: 300 }), envelope('s2', ''), envelope('s3', '-')],
    xlabel: '$t$',
    ylabel: '$x(t)$',
    xmin: '0',
    xmax: '12',
    ymin: '-1.1',
    ymax: '1.1',
    grid: 'none',
    width: '10',
    height: '5'
  };
};

/** The Polar rose starter: r = cos 3t, three petals, on equal axes. */
export const polarRose = (): PlotModel => ({
  ...emptyPlot(),
  series: [{ ...fn('s1', 'cos(3*t)', '0', 'pi', { samples: 300 }), source: 'polar' }],
  xmin: '-1.2',
  xmax: '1.2',
  ymin: '-1.2',
  ymax: '1.2',
  grid: 'none',
  axes: 'sketch',
  equal: true,
  width: '7'
});

/** The Lissajous figure starter: x = sin 3t, y = sin 2t, on equal axes. */
export const lissajous = (): PlotModel => ({
  ...emptyPlot(),
  series: [{ ...fn('s1', 'sin(2*t)', '0', '2*pi', { samples: 400 }), source: 'parametric', exprX: 'sin(3*t)' }],
  xmin: '-1.2',
  xmax: '1.2',
  ymin: '-1.2',
  ymax: '1.2',
  grid: 'none',
  axes: 'sketch',
  equal: true,
  width: '7'
});

/** The Conics starter: an ellipse, both branches of a hyperbola and a parabola, drawn parametrically on equal axes. */
export const conics = (): PlotModel => {
  const curve = (id: string, x: string, y: string, from: string, to: string, legend: string, colour: string): Series => ({ ...fn(id, y, from, to, { samples: 200, legend, colour }), source: 'parametric', exprX: x });
  return {
    ...emptyPlot(),
    series: [
      curve('s1', '2*cos(t)', 'sin(t)', '0', '2*pi', '$\\frac{x^2}{4} + y^2 = 1$', '#1f4e9c'),
      curve('s2', 'cosh(t)', 'sinh(t)', '-1.8', '1.8', '$x^2 - y^2 = 1$', '#c62828'),
      curve('s3', '-cosh(t)', 'sinh(t)', '-1.8', '1.8', '', '#c62828'),
      curve('s4', 't', 't^2/4', '-3.5', '3.5', '$x^2 = 4y$', '#2e7d32')
    ],
    xmin: '-4',
    xmax: '4',
    ymin: '-3',
    ymax: '3',
    grid: 'none',
    axes: 'centre',
    equal: true,
    width: '9'
  };
};

/** The Phase portrait starter: the field of x' = y, y' = −x − 0.4y, with one trajectory spiralling in to the origin. */
export const phasePortrait = (): PlotModel => ({
  ...emptyPlot(),
  series: [
    { ...newSeries('s1'), source: 'quiver', exprX: 'y', expr: '-x - 0.4*y', from: '-2.5', to: '2.5', samples: 15, normalise: true, colour: '#9e9e9e' },
    // x = 2 e^(−0.2t) cos ωt and its derivative, ω = √0.96
    { ...fn('s2', '2*exp(-0.2*t)*(-0.2*cos(0.9798*t) - 0.9798*sin(0.9798*t))', '0', '20', { samples: 400, colour: '#1f4e9c' }), source: 'parametric', exprX: '2*exp(-0.2*t)*cos(0.9798*t)' }
  ],
  xlabel: '$x$',
  ylabel: '$\\dot{x}$',
  xmin: '-2.5',
  xmax: '2.5',
  ymin: '-2.5',
  ymax: '2.5',
  grid: 'none',
  equal: true,
  width: '8'
});

/** A series has one of the rarer fields the form folds set: its line, marks, stems, colour, breaks, curve, bars or error bars. */
export const seriesFolded = (s: Series) =>
  !!(s.line !== 'solid' || (s.marks && s.source !== 'points') || s.mark || s.stem || s.colour || s.breaks || s.smooth || s.bars || s.yerr);

/** The axes have one of the rarer fields the form folds set: grid, size, scales, ticks and the switches. */
export const axesFolded = (m: PlotModel) =>
  !!(m.grid !== 'major' || m.width || m.height || m.equal || m.xReverse || m.bw || m.axes || m.xmode || m.ymode || m.xticks || m.yticks || m.tickDecimals || m.tickPlain || m.tickComma);

/** The kinds added since functions and data; any other source (older drawings have 'file') is written as data. */
const NEW_SOURCES: SeriesSource[] = ['parametric', 'polar', 'piecewise', 'signal', 'quiver', 'points', 'fit'];
/**
 * The plot uses something a build from before these additions would write without: its file is then version 2, which
 * such a build opens as code instead of saving it with parts missing.
 */
export const plotIsNewer = (model: PlotModel) =>
  !!(model.axes || model.xmode || model.ymode || model.xticks || model.yticks || model.annotations?.length) ||
  model.series.some((s) => NEW_SOURCES.includes(s.source) || s.stem);

/**
 * The plot uses something Spectrum 2.5 added (typed points, fits, the axis and line options, an area on any series, an
 * annotation at an expression): its file is then version 5, which builds up to 2.4 open as code.
 */
export const plotNeedsVersion5 = (model: PlotModel) =>
  !!(model.height || model.equal || model.xReverse || model.bw || model.tickPlain || model.tickDecimals || model.tickComma || model.legendPos === 'below') ||
  model.series.some((s) => s.source === 'points' || s.source === 'fit' || s.line === 'none' || s.line === 'dashdotted' || s.mark || s.smooth || s.bars || s.yerr || s.sep || s.breaks) ||
  (model.annotations ?? []).some((a) => [a.at, a.to].some((t) => !isNumber(t) && valueOf(t) !== null) || (a.kind === 'area' && [a.series, a.series2].some((id) => id && model.series.find((s) => s.id === id)?.source !== 'function')));

/** The separator pgfplots needs told for a data file, by its extension (whitespace needs none). */
const isNumber = (text: string | undefined) => text !== undefined && text.trim() !== '' && Number.isFinite(Number(text));

export const separatorOf = (file: string) => (/\.csv$/i.test(file) ? 'comma' : /\.tsv$/i.test(file) ? 'tab' : null);

const firstLine = (text: string) => text.split(/\r?\n/).find((l) => l.trim() && !/^\s*[#%]/.test(l)) ?? '';

/** A .csv split by semicolons, as a spreadsheet writes one where the comma is the decimal point. */
export function isSemicolonCsv(file: string, text: string) {
  // more semicolons than commas that split (a comma before a digit is a decimal one)
  const count = (re: RegExp) => firstLine(text).replace(/"[^"]*"/g, '').match(re)?.length ?? 0;
  return separatorOf(file) === 'comma' && count(/;/g) > count(/,(?!\d)/g);
}

/**
 * A data file's column names, from its first line; a file whose first line is numbers has no names, so its columns are
 * '0', '1', … (written as x index). None when a .csv's first line has no commas or semicolons.
 */
export function columnsOf(file: string, text: string) {
  const sep = separatorOf(file);
  const semicolons = isSemicolonCsv(file, text);
  const columns = firstLine(text).split(semicolons ? ';' : sep === 'comma' ? ',' : sep === 'tab' ? '\t' : /\s+/).map((c) => c.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  if (sep === 'comma' && columns.length < 2) return [];
  return columns.every((c) => isNumber(semicolons ? c.replace(',', '.') : c)) ? columns.map((_, i) => String(i)) : columns;
}
/** ponytail: a column named by digits alone is taken as its place, so a header of numbers reads as headerless; fine for data files */
const columnKey = (axis: string, column: string) => (/^\d+$/.test(column) ? `${axis} index=${column}` : `${axis}={${column}}`);

/** A number typed, or the fallback. */
const numberOr = (text: string | undefined, fallback: number) => (isNumber(text) ? Number(text) : fallback);
/** A domain bound or axis limit pgfmath reads: a number, or a short expression such as 2*pi; '' for anything else. */
const bound = (text: string) => (isNumber(text) ? num(Number(text)) : /^(?:[\d\s.+\-*/()]|pi|e|sqrt|exp|ln|sin|cos|tan|deg|rad)+$/i.test(text.trim()) ? `{${text.trim()}}` : '');

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: (t) => 1 / Math.cos(t), cosec: (t) => 1 / Math.sin(t), cot: (t) => 1 / Math.tan(t),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, ln: Math.log, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  deg: (t) => (t * 180) / Math.PI, rad: (t) => (t * Math.PI) / 180, min: Math.min, max: Math.max, pow: Math.pow, mod: (a, b) => a % b
};

/**
 * A pgfmath expression's value at x, as TeX works it out with trig in radians; null for one it doesn't read.
 * ponytail: the common functions and + - * / ^ only, no ternaries or comparisons; add them if a plot needs them.
 */
export function evaluate(expr: string, x = 0): number | null {
  const tokens = expr.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]\w*|\S/gi) ?? [];
  let i = 0;
  const take = (t: string) => tokens[i] === t && ++i > 0;
  const sum = (): number => {
    let v = product();
    for (;;) if (take('+')) v += product(); else if (take('-')) v -= product(); else return v;
  };
  const product = (): number => {
    let v = unary();
    for (;;) if (take('*')) v *= unary(); else if (take('/')) v /= unary(); else return v;
  };
  // -x^2 is -(x^2), and 2^-1 a half, as in pgfmath
  const unary = (): number => (take('-') ? -unary() : take('+') ? unary() : power());
  const power = (): number => {
    const base = atom();
    return take('^') ? base ** unary() : base;
  };
  const atom = (): number => {
    const t = tokens[i++] ?? '';
    if (/^[\d.]/.test(t)) return Number(t);
    if (t === '(') {
      const v = sum();
      if (!take(')')) throw new Error(')');
      return v;
    }
    const name = t.toLowerCase();
    if (name === 'x') return x;
    if (name === 'pi') return Math.PI;
    if (name === 'e') return Math.E;
    if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name) || !take('(')) throw new Error(t);
    const args = [sum()];
    while (take(',')) args.push(sum());
    if (!take(')')) throw new Error(')');
    return FUNCTIONS[name](...args);
  };
  try {
    const v = sum();
    return i === tokens.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** A number or an expression such as pi/2, as a number; null for neither. */
const valueOf = (text: string | undefined) => (isNumber(text) ? Number(text) : text && bound(text) ? evaluate(text) : null);

/** A number as typed, without rounding: strains of 0.00135 stay so. */
const exact = (v: number) => String(Number(v.toPrecision(10)));

export type Point = { x: number; y: number; error?: number; label: string };

/** A points series' text: one point a line or split by semicolons, "x, y" or "x y", a third number its error, "= label" after. */
export function pointsOf(text: string): Point[] {
  return text.split(/[\n;]/).flatMap((line) => {
    const at = line.indexOf('=');
    const [values, label] = at < 0 ? [line, ''] : [line.slice(0, at), line.slice(at + 1).trim()];
    const n = values.split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.length < 2 || n.some((v) => !Number.isFinite(v))) return [];
    return [{ x: n[0], y: n[1], ...(n.length > 2 ? { error: Math.abs(n[2]) } : {}), label }];
  });
}

/**
 * A smooth curve through the points as TikZ draws one (tension 0.55, each piece a cubic whose ends turn along the line
 * joining the points either side), 12 short lines a piece; on a log axis, through the logs.
 */
export function smoothThrough(points: Point[], logX = false, logY = false): (Point | { x: number; y: number })[] {
  const into = (v: number, log: boolean) => (log ? Math.log10(v) : v);
  const back = (v: number, log: boolean) => Number((log ? 10 ** v : v).toPrecision(6));
  const q = points.map((p) => [into(p.x, logX), into(p.y, logY)]);
  const k = 0.2775;
  const out: (Point | { x: number; y: number })[] = [points[0]];
  for (let i = 0; i + 1 < q.length; i += 1) {
    const [a, b, before, after] = [q[i], q[i + 1], q[i - 1] ?? q[i], q[i + 2] ?? q[i + 1]];
    const c1 = [0, 1].map((d) => a[d] + k * (b[d] - before[d]));
    const c2 = [0, 1].map((d) => b[d] - k * (after[d] - a[d]));
    for (let j = 1; j < 12; j += 1) {
      const t = j / 12;
      const at = (d: number) => (1 - t) ** 3 * a[d] + 3 * (1 - t) ** 2 * t * c1[d] + 3 * (1 - t) * t ** 2 * c2[d] + t ** 3 * b[d];
      out.push({ x: back(at(0), logX), y: back(at(1), logY) });
    }
    out.push(points[i + 1]);
  }
  return out;
}

/** The least-squares line y = a + b x through the points (a = 0 through the origin); null with too few to fix it. */
export function leastSquares(points: Point[], origin = false): { a: number; b: number } | null {
  const n = points.length;
  const [sx, sy, sxx, sxy] = points.reduce(([a, b, c, d], p) => [a + p.x, b + p.y, c + p.x * p.x, d + p.x * p.y], [0, 0, 0, 0]);
  if (origin) return n && sxx ? { a: 0, b: sxy / sxx } : null;
  const d = n * sxx - sx * sx;
  if (n < 2 || Math.abs(d) < 1e-12 * Math.max(1, n * sxx)) return null;
  const b = (n * sxy - sx * sy) / d;
  return { a: (sy - b * sx) / n, b };
}

/** A fit's line, "-91 + 8.75x", to `digits` significant figures; null when it has none. */
export function fitEquation(s: Series, model: PlotModel, digits = 4) {
  const of = model.series.find((p) => p.id === s.of && p.source === 'points');
  const fit = of && leastSquares(pointsOf(of.points ?? ''), s.origin);
  if (!fit) return null;
  const f = (v: number) => String(Number(v.toPrecision(digits)));
  // an intercept that is rounding error is none
  const a = Math.abs(fit.a) < 1e-9 * Math.max(1, Math.abs(fit.b)) ? 0 : fit.a;
  const slope = `${f(Math.abs(fit.b))}x`;
  return { ...fit, text: s.origin || a === 0 ? `${fit.b < 0 ? '-' : ''}${slope}` : `${f(a)} ${fit.b < 0 ? '-' : '+'} ${slope}` };
}

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
  // a scatter has marks whatever the switch says
  const marks = s.marks || s.line === 'none';
  return [
    s.colour && `color=${latexColour(s.colour)}`,
    s.line === 'none' ? 'only marks' : s.line !== 'solid' && s.line,
    marks && s.mark && `mark=${s.mark}`,
    // a filled mark in the series' own colour: pgfplots' cycle list would fill it in the colour of the series' place
    marks && s.colour && `every mark/.append style={fill=${latexColour(s.colour)}}`,
    // bars filled in a tint of their own colour, and shown so in the legend
    s.bars ? 'ybar, fill=.!30, area legend' : s.stem ? 'ycomb' : !marks && 'no markers',
    ...(s.bars && !marks ? ['no markers'] : [])
  ];
}

/**
 * Where a function broken at its asymptotes is cut, with no y range set: its values worked out here, beyond the middle
 * 80 % of them by that spread again. None when the expression is one this doesn't read.
 */
function breaksOf(s: Series, samples: number) {
  const [a, b] = [valueOf(s.from), valueOf(s.to)];
  if (a === null || b === null || a === b) return null;
  const ys = Array.from({ length: samples }, (_, i) => evaluate(s.expr, a + ((b - a) * i) / (samples - 1))).filter((y): y is number => y !== null).sort((p, q) => p - q);
  if (ys.length < 2) return null;
  const [lo, hi] = [ys[Math.floor(ys.length * 0.1)], ys[Math.ceil(ys.length * 0.9) - 1]];
  const span = hi - lo || 1;
  return [lo - span, hi + span];
}

/** The path a series other than a function draws, named for an area on it. */
const pathOf = (id: string) => `spx-${id}`;

function seriesLines(s: Series, model: PlotModel): string[] {
  const style = styleOf(s);
  const named = s.source !== 'function' && (model.annotations ?? []).some((a) => a.kind === 'area' && (a.series === s.id || a.series2 === s.id)) && `name path=${pathOf(s.id)}`;
  const samples = `samples=${Math.max(2, Math.round(s.samples) || 100)}`;
  const domainOf = (from: string, to: string) => {
    const [a, b] = [bound(from), bound(to)];
    return a && b ? `domain=${a}:${b}` : '';
  };
  const plot = (options: unknown[], what: string) => `\\addplot+[${options.filter(Boolean).join(', ')}] ${what};`;
  switch (s.source) {
    case 'function': {
      // with the y range set, a point far beyond it breaks the line, so tan(x) is not joined across its asymptotes
      const [lo, hi] = [model.ymin, model.ymax].map(Number);
      const span = hi - lo;
      const ranged = isNumber(model.ymin) && isNumber(model.ymax) && span > 0;
      const cut = ranged ? [lo - span, hi + span] : s.breaks ? breaksOf(s, Math.max(2, Math.round(s.samples) || 100)) : null;
      const breaks = cut && model.ymode !== 'log' && ['unbounded coords=jump', `restrict y to domain=${num(cut[0])}:${num(cut[1])}`];
      return [plot([domainOf(s.from, s.to), samples, ...(breaks || []), ...style], `{${s.expr.trim() || 'x'}}`)];
    }
    case 'parametric':
      return [plot([domainOf(s.from, s.to), samples, 'variable=t', ...style, named], `({${s.exprX?.trim() || 't'}}, {${s.expr.trim() || 't'}})`)];
    case 'polar': {
      const r = s.expr.trim() || '1';
      return [plot([domainOf(s.from, s.to), samples, 'variable=t', ...style, named], `({(${r})*cos(t)}, {(${r})*sin(t)})`)];
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
        return [plot([domainOf(s.from, s.to), samples, ...style, named], `{${s.signal === 'sine' ? wave : `abs(${wave})`}}`)];
      }
      return [plot([...style, named], `coordinates {${waveformPoints(s).map(([t, v]) => `(${num(t)},${num(v)})`).join(' ')}}`)];
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
    case 'points': {
      const points = pointsOf(s.points ?? '');
      if (!points.length) return [];
      const errors = points.some((p) => p.error !== undefined);
      const labels = points.some((p) => p.label);
      // a smooth curve as many short lines, which pgfplots can clip and fill under (its own smooth curve it can't)
      const drawn = s.smooth && points.length > 2 ? smoothThrough(points, model.xmode === 'log', model.ymode === 'log') : points;
      const typed = (c: { x: number; y: number }): c is Point => 'label' in c;
      const coordinates = drawn.map((c) => `(${exact(c.x)},${exact(c.y)})${typed(c) && c.error !== undefined ? ` +- (0,${exact(c.error)})` : ''}${labels ? ` [${typed(c) ? escapeTex(c.label) : ''}]` : ''}`);
      // marks on the points typed, not on the curve between them
      const marks = drawn !== points && (s.marks || s.line === 'none') && `mark indices={${drawn.flatMap((c, i) => (typed(c) ? [i + 1] : [])).join(',')}}`;
      return [plot([...style, marks, named, errors && 'error bars/y dir=both, error bars/y explicit', labels && 'nodes near coords, point meta=explicit symbolic'], `coordinates {${coordinates.join(' ')}}`)];
    }
    case 'fit': {
      const fit = fitEquation(s, model, 6);
      const of = model.series.find((p) => p.id === s.of);
      const xs = pointsOf(of?.points ?? '').map((p) => p.x);
      if (!fit || !xs.length) return [];
      // over the points, unless a range is typed
      const domain = domainOf(s.from, s.to) || `domain=${exact(Math.min(...xs))}:${exact(Math.max(...xs))}`;
      const expr = fit.a === 0 || s.origin ? `${exact(fit.b)}*x` : `${exact(fit.a)}${fit.b < 0 ? '-' : '+'}${exact(Math.abs(fit.b))}*x`;
      return [plot([domain, 'samples=2', ...style, named], `{${expr}}`)];
    }
    default: {
      const sep = s.sep === 'semicolon' ? 'semicolon' : separatorOf(s.file);
      const table = [s.x && columnKey('x', s.x), s.y && columnKey('y', s.y), s.yerr && columnKey('y error', s.yerr), sep && `col sep=${sep}`, s.sep && '/pgf/number format/read comma as period'].filter(Boolean);
      const options = [...style, named, s.yerr && 'error bars/y dir=both, error bars/y explicit'].filter(Boolean);
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
  return [`${axis}tick={${ticks.map((t) => t.at).join(',')}}`, ...(ticks.some((t) => t.label) ? [`${axis}ticklabels={${ticks.map((t) => `{${escapeTex(t.label) || value(t.at)}}`).join(',')}}`] : [])];
}

/** What an annotation draws, after the series: TeX works out every value from the declared functions. */
function annotationLines(a: Annotation, model: PlotModel, functions: Map<string, string>): string[] {
  const f = functions.get(a.series);
  const colour = a.colour ? `color=${latexColour(a.colour)}` : '';
  const text = a.text?.trim() && escapeTex(a.text.trim());
  const opts = (...more: unknown[]) => [...more, colour].filter(Boolean).join(', ');
  const name = `spx-${a.id}`;
  const [v0, v1] = [valueOf(a.at), valueOf(a.to)];
  const onPath = (id: string | undefined) => !!id && !!model.series.find((s) => s.id === id && s.source !== 'function');
  if (a.kind === 'area' && (onPath(a.series) || onPath(a.series2))) {
    // an area on points, a data file or any series but a function: between the paths the series draw, or down to y = 0,
    // clipped to x from, to when they are given
    const range = v0 !== null && v1 !== null && v0 !== v1 && ([Math.min(v0, v1), Math.max(v0, v1)].map(exact) as [string, string]);
    const pathFor = (id: string | undefined, end: 'a' | 'b'): string[] | null => {
      if (onPath(id)) return [];
      const g = id ? functions.get(id) : undefined;
      if (!range) return null;
      return [g ? `\\addplot[draw=none, forget plot, name path=${name}-${end}, domain=${range[0]}:${range[1]}, samples=50] {${g}(x)};` : `\\path[name path=${name}-${end}] (axis cs:${range[0]},0) -- (axis cs:${range[1]},0);`];
    };
    const [first, second] = [pathFor(a.series, 'a'), pathFor(a.series2, 'b')];
    if (!first || !second || !model.series.some((s) => s.id === a.series)) return [];
    const of = [onPath(a.series) ? pathOf(a.series) : `${name}-a`, onPath(a.series2) ? pathOf(a.series2!) : `${name}-b`];
    const clip = range ? `, soft clip={domain=${range[0]}:${range[1]}}` : '';
    return [...first, ...second, `\\addplot[${a.colour ? `fill=${latexColour(a.colour)}` : 'fill=gray'}, fill opacity=0.3, forget plot] fill between[of=${of[0]} and ${of[1]}${clip}];`];
  }
  if (v0 === null) return [];
  const x0 = v0;
  const centred = !!model.axes && model.axes !== 'box';
  // where the axes are: the origin for centred axes, else the frame's bottom-left corner
  const base = centred && model.xmode !== 'log' && model.ymode !== 'log' ? 'axis cs:0,0' : 'rel axis cs:0,0';
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
      if (v1 === null || v1 === x0) return [];
      const x1 = v1;
      const over = Math.abs(x1 - x0) / 4;
      const [lo, hi] = [Math.min(x0, x1) - over, Math.max(x0, x1) + over];
      return [`\\addplot[${opts('forget plot', `domain=${num(lo)}:${num(hi)}`, 'samples=2')}] {${f}(${num(x0)})+(${f}(${num(x1)})-${f}(${num(x0)}))/(${num(x1 - x0)})*(x-(${num(x0)}))};`, mark([x0, x1])];
    }
    case 'area': {
      if (v1 === null) return [];
      const domain = `domain=${num(Math.min(x0, v1))}:${num(Math.max(x0, v1))}`;
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

/** Where the legend goes: below sits under the x label, in a row. */
function legendKeys(model: PlotModel) {
  if (model.legendPos !== 'below') return [`legend pos=${model.legendPos}`];
  const row = 'anchor=north, legend columns=-1';
  // a box's x label is named, to sit the legend under; centred axes have their labels inside, so under the frame
  if (!model.axes || model.axes === 'box') {
    if (model.xlabel.trim()) return ['xlabel style={name=spx-xlabel}', `legend style={at={(spx-xlabel.south)}, ${row}}`];
    return [`legend style={at={(xticklabel cs:0.5)}, ${row}}`];
  }
  return [`legend style={at={(0.5,0)}, ${row}}`];
}

/** The tick numbers' format, from the Axes' choices. */
function tickFormat(model: PlotModel) {
  const decimals = isNumber(model.tickDecimals) ? Math.max(0, Math.min(6, Math.round(Number(model.tickDecimals)))) : null;
  const format = [
    model.tickComma && 'use comma',
    model.tickPlain && decimals === null && 'fixed',
    decimals !== null && `fixed, fixed zerofill, precision=${decimals}`,
    model.tickPlain && '1000 sep={}'
  ].filter(Boolean);
  return [
    (model.tickPlain || decimals !== null) && 'scaled ticks=false',
    // a log axis's ticks as 0.3, not 10^-0.52
    model.tickPlain && (model.xmode === 'log' || model.ymode === 'log') && 'log ticks with fixed point',
    format.length && `tick label style={/pgf/number format/.cd, ${format.join(', ')}}`
  ];
}

/** style.siUnits: an axis title's unit in brackets, Load (kN), written with \\unit */
export function plotCode(model: PlotModel, style: Record<string, unknown> = {}) {
  const si = unitWriter(style.siUnits === true);
  // a data series without its file can't compile: it waits until one is picked
  const series = model.series.filter((s) => s.source === 'function' || NEW_SOURCES.includes(s.source) || s.file);
  // each series drawn, with its legend
  // a fit without a legend shows its equation
  const legendOf = (s: Series) => escapeTex(s.legend.trim()) || (s.source === 'fit' && fitEquation(s, model) ? `$y = ${fitEquation(s, model)!.text}$` : '');
  const drawn = series.map((s) => ({ lines: seriesLines(s, model), legend: legendOf(s) })).filter((d) => d.lines.length);
  const legends = drawn.some((d) => d.legend);
  // a series without a legend among some with: one \legend, where an empty entry takes no row
  const mixed = legends && drawn.some((d) => !d.legend);
  const annotations = model.annotations ?? [];
  // each function series an annotation is on, declared as a function TeX can evaluate anywhere: spxfa, spxfb, …
  const used = new Set(annotations.flatMap((a) => (a.kind === 'line' ? [] : [a.series, ...(a.kind === 'area' && a.series2 ? [a.series2] : [])])));
  const declared = series.filter((s) => s.source === 'function' && used.has(s.id));
  const functions = new Map(declared.map((s, i) => [s.id, `spxf${String.fromCharCode(97 + (i % 26)).repeat(1 + Math.floor(i / 26))}`]));
  const centred = !!model.axes && model.axes !== 'box';
  const axis = [
    model.title.trim() && `title={${escapeTex(model.title.trim())}}`,
    model.xlabel.trim() && `xlabel={${escapeTex(si.title(model.xlabel.trim()))}}`,
    model.ylabel.trim() && `ylabel={${escapeTex(si.title(model.ylabel.trim()))}}`,
    ...(['xmin', 'xmax', 'ymin', 'ymax'] as const).map((key) => bound(model[key]) && `${key}=${bound(model[key])}`),
    model.grid !== 'none' && `grid=${model.grid}`,
    ...(legends ? legendKeys(model) : []),
    isNumber(model.width) && Number(model.width) > 0 && `width=${num(Number(model.width))}cm`,
    isNumber(model.height) && Number(model.height) > 0 && `height=${num(Number(model.height))}cm`,
    model.equal && 'axis equal image',
    model.xReverse && 'x dir=reverse',
    model.bw && 'cycle list name=black white',
    ...tickFormat(model),
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
    ...drawn.flatMap((d) => [...d.lines, ...(d.legend && !mixed ? [`\\addlegendentry{${d.legend}}`] : [])]),
    ...(mixed ? [`\\legend{${drawn.map((d) => (d.legend ? `{${d.legend}}` : '')).join(',')}}`] : []),
    ...annotations.flatMap((a) => annotationLines(a, model, functions)),
    '\\end{axis}',
    '\\end{tikzpicture}'
  ];
  const between = lines.some((l) => l.includes('fill between['));
  return { body: `${lines.join('\n')}\n`, packages: ['pgfplots', ...(si.used ? ['siunitx'] : [])], libraries: between ? ['pgfplots.fillbetween'] : [] };
}
