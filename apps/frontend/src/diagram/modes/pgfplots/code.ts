import { latexColour, num } from '../shared';

// Plots (pgfplots): a form rather than a drawing. Each series is a function of x over a domain, or two columns of a
// data file in the project.

export type Series = {
  id: string;
  source: 'function' | 'data';
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

/** The separator pgfplots needs told for a data file, by its extension (whitespace needs none). */
export const separatorOf = (file: string) => (/\.csv$/i.test(file) ? 'comma' : /\.tsv$/i.test(file) ? 'tab' : null);

/** A data file's column names, from its first line. */
export function columnsOf(file: string, text: string) {
  const first = text.split(/\r?\n/).find((l) => l.trim() && !/^\s*[#%]/.test(l)) ?? '';
  const sep = separatorOf(file);
  return first.split(sep === 'comma' ? ',' : sep === 'tab' ? '\t' : /\s+/).map((c) => c.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
}

const isNumber = (text: string) => text.trim() !== '' && Number.isFinite(Number(text));

function seriesCode(s: Series) {
  const style = [
    s.colour && `color=${latexColour(s.colour)}`,
    s.line !== 'solid' && s.line,
    !s.marks && 'no markers'
  ];
  if (s.source === 'function') {
    const domain = isNumber(s.from) && isNumber(s.to) ? `domain=${num(Number(s.from))}:${num(Number(s.to))}` : '';
    const options = [domain, `samples=${Math.max(2, Math.round(s.samples) || 100)}`, ...style].filter(Boolean);
    return `\\addplot+[${options.join(', ')}] {${s.expr.trim() || 'x'}};`;
  }
  const sep = separatorOf(s.file);
  const table = [s.x && `x={${s.x}}`, s.y && `y={${s.y}}`, sep && `col sep=${sep}`].filter(Boolean);
  const options = style.filter(Boolean);
  return `\\addplot+[${options.join(', ')}] table${table.length ? `[${table.join(', ')}]` : ''} {${s.file}};`;
}

export function plotCode(model: PlotModel) {
  // a data series without its file can't compile: it waits until one is picked
  const series = model.series.filter((s) => s.source === 'function' || s.file);
  const legends = series.some((s) => s.legend.trim());
  const axis = [
    model.title.trim() && `title={${model.title.trim()}}`,
    model.xlabel.trim() && `xlabel={${model.xlabel.trim()}}`,
    model.ylabel.trim() && `ylabel={${model.ylabel.trim()}}`,
    ...(['xmin', 'xmax', 'ymin', 'ymax'] as const).map((key) => isNumber(model[key]) && `${key}=${num(Number(model[key]))}`),
    model.grid !== 'none' && `grid=${model.grid}`,
    legends && `legend pos=${model.legendPos}`,
    isNumber(model.width) && Number(model.width) > 0 && `width=${num(Number(model.width))}cm`,
    // sin(x) and the like in radians, as written in maths
    'trig format plots=rad'
  ].filter(Boolean);
  const lines = [
    // in the picture, so the figure looks the same inside a document that doesn't set it
    '\\pgfplotsset{compat=1.18}',
    '\\begin{tikzpicture}',
    `\\begin{axis}[${axis.join(', ')}]`,
    ...series.flatMap((s) => [seriesCode(s), ...(s.legend.trim() ? [`\\addlegendentry{${s.legend.trim()}}`] : legends ? ['\\addlegendentry{}'] : [])]),
    '\\end{axis}',
    '\\end{tikzpicture}'
  ];
  return { body: `${lines.join('\n')}\n`, packages: ['pgfplots'], libraries: [] };
}
