// Self-check for the plot mode's code. Run:
// npx esbuild apps/frontend/src/diagram/modes/pgfplots/pgfplots.check.ts --bundle --platform=node --log-level=warning | node
import { columnsOf, emptyPlot, newSeries, plotCode, separatorOf } from './code';
import type { PlotModel } from './code';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(plotCode(emptyPlot()).body.split('\n'), [
  '\\pgfplotsset{compat=1.18}',
  '\\begin{tikzpicture}',
  '\\begin{axis}[xlabel={$x$}, ylabel={$y$}, grid=major, trig format plots=rad]',
  '\\addplot+[domain=-2:2, samples=100, no markers] {x^2};',
  '\\end{axis}',
  '\\end{tikzpicture}',
  ''
], 'a new plot');
eq(plotCode(emptyPlot()).packages, ['pgfplots'], 'packages');

const model: PlotModel = {
  ...emptyPlot(),
  title: 'Results',
  xmin: '0',
  xmax: '10.5',
  ymin: 'oops',
  grid: 'both',
  legendPos: 'south east',
  width: '8',
  series: [
    { ...newSeries('s1'), expr: 'sin(x)', from: '0', to: '6.2832', samples: 1.5, colour: '#ff0000', legend: '$\\sin x$', line: 'dashed' },
    { ...newSeries('s2'), source: 'data', file: 'data/run 1.csv', x: 'time', y: 'value (V)', marks: true },
    { ...newSeries('s3'), source: 'data', file: 'data/run.dat', x: 't', y: 'v', legend: 'run' },
    { ...newSeries('s4'), source: 'data', file: '' }
  ]
};
eq(plotCode(model).body.split('\n').slice(2, -3), [
  '\\begin{axis}[title={Results}, xlabel={$x$}, ylabel={$y$}, xmin=0, xmax=10.5, grid=both, legend pos=south east, width=8cm, trig format plots=rad]',
  '\\addplot+[domain=0:6.283, samples=2, color={rgb,255:red,255;green,0;blue,0}, dashed, no markers] {sin(x)};',
  '\\addlegendentry{$\\sin x$}',
  // a series without a legend keeps its place in it, so the next legend goes with its own plot
  '\\addplot+[] table[x={time}, y={value (V)}, col sep=comma] {data/run 1.csv};',
  '\\addlegendentry{}',
  '\\addplot+[no markers] table[x={t}, y={v}] {data/run.dat};',
  '\\addlegendentry{run}'
], 'functions and data; a data series with no file yet is left out');

eq([separatorOf('a.CSV'), separatorOf('b.tsv'), separatorOf('c.dat')], ['comma', 'tab', null], 'separators');
eq(columnsOf('a.csv', '# made by hand\n"time", value (V)\n0,1\n'), ['time', 'value (V)'], 'CSV header, after a comment');
eq(columnsOf('a.tsv', 'x\ty\n1\t2'), ['x', 'y'], 'TSV header');
eq(columnsOf('a.dat', '  t   v  \n1 2'), ['t', 'v'], 'whitespace header');

console.log('pgfplots.check: ok');
