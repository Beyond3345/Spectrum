// Self-check for the plot mode's code. Run:
// npx esbuild apps/frontend/src/diagram/modes/pgfplots/pgfplots.check.ts --bundle --platform=node --log-level=warning | node
import { columnsOf, emptyPlot, newSeries, plotCode, plotIsNewer, separatorOf, signalSketch, slopeField, ticksOf, waveformPoints } from './code';
import type { PlotModel, Series } from './code';

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
{
  // siunitx: an axis title's unit in brackets as \unit, when the drawing has the switch on
  const loaded = { ...emptyPlot(), xlabel: 'Displacement (mm)', ylabel: 'Load [kN]' };
  const on = plotCode(loaded, { siUnits: true });
  eq([on.body.includes('xlabel={Displacement (\\unit{\\milli\\metre})}'), on.body.includes('ylabel={Load [\\unit{\\kilo\\newton}]}'), on.packages], [true, true, ['pgfplots', 'siunitx']], 'axis units with siunitx');
  eq(plotCode(loaded).body.includes('xlabel={Displacement (mm)}'), true, 'off: as typed');
  eq(plotCode(emptyPlot(), { siUnits: true }).packages, ['pgfplots'], 'no unit, no siunitx');
}

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

// axes, scales and ticks
const axisLine = (m: PlotModel) => plotCode(m).body.split('\n')[2];
eq(axisLine({ ...emptyPlot(), axes: 'centre', xmode: 'log', ymode: 'log' }), '\\begin{axis}[xlabel={$x$}, ylabel={$y$}, grid=major, axis lines=middle, xlabel style={at={(ticklabel* cs:1)}, anchor=west}, ylabel style={at={(ticklabel* cs:1)}, anchor=south}, xmode=log, ymode=log, trig format plots=rad]', 'centred, log');
eq(axisLine({ ...emptyPlot(), axes: 'sketch', xlabel: '', yticks: '1 = $V$' }), '\\begin{axis}[ylabel={$y$}, grid=major, axis lines=middle, ylabel style={at={(ticklabel* cs:1)}, anchor=south}, ytick={1}, yticklabels={{$V$}}, xtick=\\empty, trig format plots=rad]', 'a sketch has only the ticks asked for');
eq(ticksOf('x', 'pi/2 = $\\frac{\\pi}{2}$; pi ;; 2'), ['xtick={pi/2,pi,2}', 'xticklabels={{$\\frac{\\pi}{2}$},{$\\pgfmathparse{pi}\\pgfmathprintnumber{\\pgfmathresult}$},{$2$}}'], 'ticks, one labelled, the rest their values');
eq(ticksOf('y', '0; 1'), ['ytick={0,1}'], 'ticks without labels');
eq(ticksOf('y', ' ; '), [], 'no ticks');

// the other kinds of series
const one = (s: Partial<Series>) => plotCode({ ...emptyPlot(), series: [{ ...newSeries('s1'), ...s }] }).body.split('\n').slice(3, -3);
eq(one({ source: 'parametric', exprX: 'cos(t)', expr: 'sin(t)', from: '0', to: '2*pi' }), ['\\addplot+[domain=0:{2*pi}, samples=100, variable=t, no markers] ({cos(t)}, {sin(t)});'], 'parametric');
eq(one({ source: 'polar', expr: '1+cos(t)', from: '0', to: '6.283' }), ['\\addplot+[domain=0:6.283, samples=100, variable=t, no markers] ({(1+cos(t))*cos(t)}, {(1+cos(t))*sin(t)});'], 'polar, on these axes');
eq(one({ source: 'polar', from: '0', to: '\\input{x}' })[0].includes('domain'), false, 'a bound that isn’t maths is left out');
eq(one({ source: 'piecewise', colour: '#ff0000', pieces: [{ expr: '-x', from: '-1', to: '0' }, { expr: 'x^2', from: '0', to: '1' }, { expr: '', from: '1', to: '2' }] }), [
  // the second piece first, forgotten, so both take the first's colour and legend entry
  '\\addplot+[forget plot, domain=0:1, samples=100, color={rgb,255:red,255;green,0;blue,0}, no markers] {x^2};',
  '\\addplot+[domain=-1:0, samples=100, color={rgb,255:red,255;green,0;blue,0}, no markers] {-x};'
], 'piecewise, an empty piece left out');
eq(one({ source: 'piecewise', pieces: [] }), [], 'no pieces, no plot');
eq(one({ stem: true, samples: 5 }), ['\\addplot+[domain=-2:2, samples=5, ycomb] {x^2};'], 'stems');
eq(one({ source: 'signal', signal: 'square', amplitude: '2', period: '2', from: '0', to: '3' }), ['\\addplot+[no markers] coordinates {(0,2) (1,2) (1,-2) (2,-2) (2,2) (3,2)};'], 'a square wave');
eq(one({ source: 'signal', signal: 'sine', amplitude: '2', period: '4', from: '0', to: '8' }), ['\\addplot+[domain=0:8, samples=100, no markers] {2*sin(2*pi*x/4)};'], 'a sine wave');
eq(one({ source: 'signal', signal: 'rectified', from: '0', to: '2' }), ['\\addplot+[domain=0:2, samples=100, no markers] {abs(1*sin(2*pi*x/1))};'], 'a rectified sine');
eq(one({ source: 'quiver', exprX: '1', expr: 'x-y', from: '-2', to: '2', samples: 5, normalise: true }), [
  '\\addplot3+[quiver={u={(1)/(sqrt((1)^2+(x-y)^2)+1e-9)}, v={(x-y)/(sqrt((1)^2+(x-y)^2)+1e-9)}, scale arrows=0.8}, -stealth, domain=-2:2, y domain=-2:2, samples=5, no markers] {0};'
], 'a slope field');
eq(axisLine(slopeField()).includes('view={0}{90}'), true, 'a quiver is seen from above');
eq(one({ source: 'quiver', exprX: '-y', expr: 'x', samples: 3 })[0].startsWith('\\addplot3+[quiver={u={-y}, v={x}}, -stealth, domain=-2:2'), true, 'a vector field');

// waveforms, each jump two points at one t
const wave = (signal: Series['signal'], over: Partial<Series> = {}) => waveformPoints({ ...newSeries('w'), source: 'signal', signal, amplitude: '1', period: '4', from: '0', to: '4', ...over });
eq(wave('triangle'), [[0, 0], [1, 1], [3, -1], [4, 0]], 'triangle, up first as a sine');
eq(wave('sawtooth'), [[0, 0], [2, 1], [2, -1], [4, 0]], 'sawtooth');
eq(wave('pulse', { duty: '0.25' }), [[0, 1], [1, 1], [1, 0], [4, 0]], 'pulse train, a quarter high');
eq(wave('step', { period: '1' }), [[0, 0], [1, 0], [1, 1], [4, 1]], 'step at t = 1');
eq(wave('square', { from: '4', to: '0' }), [[0, 1], [2, 1], [2, -1], [4, -1]], 'from and to either way round, ending as it comes in');

// annotations, all worked out by TeX from declared functions
const annotated: PlotModel = {
  ...emptyPlot(),
  series: [{ ...newSeries('s1'), expr: 'sin(x)', from: '0', to: '4' }, { ...newSeries('s2'), expr: 'x/2' }, { ...newSeries('d'), source: 'data', file: 'a.csv' }],
  annotations: [
    { id: 'a1', kind: 'point', series: 's1', at: '1', text: '$P$' },
    { id: 'a2', kind: 'tangent', series: 's1', at: '2' },
    { id: 'a3', kind: 'secant', series: 's2', at: '1', to: '3', colour: '#0000ff' },
    { id: 'a4', kind: 'line', series: '', at: '0.5', axis: 'y', text: 'half' },
    { id: 'a5', kind: 'area', series: 's1', series2: 's2', at: '0', to: '2' },
    { id: 'a6', kind: 'area', series: 's1', at: '2', to: '3' },
    { id: 'a7', kind: 'label', series: 's2', at: '1', text: '$g$', place: 'left' },
    { id: 'a8', kind: 'point', series: 'd', at: '1' },
    { id: 'a9', kind: 'tangent', series: 's1', at: 'one' },
    { id: 'a10', kind: 'secant', series: 's1', at: '1', to: '1' }
  ]
};
const code = plotCode(annotated);
eq(code.libraries, ['pgfplots.fillbetween'], 'fillbetween only for an area between two curves');
eq(plotCode({ ...annotated, annotations: annotated.annotations!.slice(0, 4) }).libraries, [], 'no library otherwise');
eq(axisLine(annotated).includes('declare function={spxfa(\\x)=sin(\\x); spxfb(\\x)=\\x/2;}'), true, 'each annotated function declared');
eq(axisLine(emptyPlot()).includes('declare'), false, 'none when nothing is annotated');
const after = code.body.split('\n').slice(code.body.split('\n').indexOf('\\addplot+[no markers] table[col sep=comma] {a.csv};') + 1, -3);
eq(after, [
  // a point from a plot, where sin takes radians, with lines to the frame's corner
  '\\addplot[draw=none, forget plot, samples at={1}] {spxfa(x)} coordinate[pos=0] (spx-a1);',
  '\\coordinate (spx-a1-o) at (rel axis cs:0,0);',
  '\\draw[dashed] (spx-a1 -| spx-a1-o) -- (spx-a1) -- (spx-a1 |- spx-a1-o);',
  '\\addplot[only marks, mark=*, forget plot, samples at={1}] {spxfa(x)};',
  '\\node[above right] at (spx-a1) {$P$};',
  '\\addplot[forget plot, domain=1:3, samples=2] {spxfa(2)+(spxfa(2+0.002)-spxfa(2-0.002))/(2*0.002)*(x-(2))};',
  '\\addplot[only marks, mark=*, forget plot, samples at={2}] {spxfa(x)};',
  '\\addplot[forget plot, domain=0.5:3.5, samples=2, color={rgb,255:red,0;green,0;blue,255}] {spxfb(1)+(spxfb(3)-spxfb(1))/(2)*(x-(1))};',
  '\\addplot[only marks, mark=*, forget plot, color={rgb,255:red,0;green,0;blue,255}, samples at={1,3}] {spxfb(x)};',
  '\\coordinate (spx-a4) at (axis cs:1,0.5);',
  '\\coordinate (spx-a4-a) at (rel axis cs:0,0);',
  '\\coordinate (spx-a4-b) at (rel axis cs:1,1);',
  '\\draw[dashed] (spx-a4 -| spx-a4-a) -- (spx-a4 -| spx-a4-b) node[pos=1, above left] {half};',
  '\\addplot[draw=none, forget plot, name path=spx-a5-a, domain=0:2, samples=50] {spxfa(x)};',
  '\\addplot[draw=none, forget plot, name path=spx-a5-b, domain=0:2, samples=50] {spxfb(x)};',
  '\\addplot[fill=gray, fill opacity=0.3, forget plot] fill between[of=spx-a5-a and spx-a5-b];',
  '\\addplot[fill=gray, fill opacity=0.3, draw=none, forget plot, domain=2:3, samples=50] {spxfa(x)} \\closedcycle;',
  '\\addplot[draw=none, forget plot, samples at={1}] {spxfb(x)} coordinate[pos=0] (spx-a7);',
  '\\node[left] at (spx-a7) {$g$};'
  // a8 is on a data series, a9 has no x and a10's ends are one point: all left out
], 'annotations');
eq(plotCode({ ...annotated, axes: 'centre', annotations: [annotated.annotations![0]] }).body.includes('(spx-a1-o) at (axis cs:0,0)'), true, 'centred axes: lines to the axes');

// a plot with any of these is version 2; one without is as before
eq(plotIsNewer(model), false, 'functions and data');
eq([signalSketch(), slopeField(), { ...emptyPlot(), xmode: 'log' as const }, { ...emptyPlot(), xticks: '1' }, annotated, { ...emptyPlot(), series: [{ ...newSeries('s'), stem: true }] }].map(plotIsNewer), [true, true, true, true, true, true], 'each addition');

console.log('pgfplots.check: ok');
