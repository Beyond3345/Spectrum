// Self-check for the plot mode's code. Run:
// npx esbuild apps/frontend/src/diagram/modes/pgfplots/pgfplots.check.ts --bundle --platform=node --log-level=warning | node
import { asKind, axesFolded, bodeMagnitude, columnsOf, conics, dampedOscillation, emptyPlot, lissajous, normalCurve, phasePortrait, polarRose, seriesFolded, evaluate, fitEquation, gradingCurve, isSemicolonCsv, leastSquares, newSeries, plotCode, plotIsNewer, plotNeedsVersion5, pointsOf, separatorOf, signalSketch, slopeField, smoothThrough, stressStrain, ticksOf, waveformPoints } from './code';
import type { Annotation, PlotModel, Series } from './code';

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
const axisLine = (m: PlotModel) => plotCode(m).body.split('\n')[2];
const one = (s: Partial<Series>, m: Partial<PlotModel> = {}) => plotCode({ ...emptyPlot(), ...m, series: [{ ...newSeries('s1'), ...s }] }).body.split('\n').slice(3, -3);
eq(plotCode(model).body.split('\n').slice(2, -3), [
  '\\begin{axis}[title={Results}, xlabel={$x$}, ylabel={$y$}, xmin=0, xmax=10.5, grid=both, legend pos=south east, width=8cm, trig format plots=rad]',
  '\\addplot+[domain=0:6.283, samples=2, color={rgb,255:red,255;green,0;blue,0}, dashed, no markers] {sin(x)};',
  '\\addplot+[] table[x={time}, y={value (V)}, col sep=comma] {data/run 1.csv};',
  '\\addplot+[no markers] table[x={t}, y={v}] {data/run.dat};',
  // a series without a legend among some with: one \legend, whose empty entry takes no row
  '\\legend{{$\\sin x$},,{run}}'
], 'functions and data; a data series with no file yet is left out');
{
  // every series with a legend: each its own entry, as before
  const both = plotCode({ ...emptyPlot(), series: [{ ...newSeries('s1'), legend: 'a' }, { ...newSeries('s2'), legend: 'b, c' }] }).body;
  eq([both.includes('\\addlegendentry{a}'), both.includes('\\addlegendentry{b, c}'), both.includes('\\legend')], [true, true, false], 'all legended: an entry each');
  eq(axisLine(emptyPlot()), axisLine({ ...emptyPlot(), legendPos: 'north west' }), 'no legend text, no legend');
  eq(emptyPlot().legendPos, 'outer north east', 'a new plot’s legend beside it, off every curve');
}

// a bare % in any text is written \%, so it doesn't comment out the rest of the figure
{
  const percent = plotCode({
    ...emptyPlot(),
    title: '50% done',
    ylabel: 'Percent passing (%) by mass',
    xticks: '1 = 10%',
    series: [{ ...newSeries('s1'), legend: '5% line' }],
    annotations: [{ id: 'a1', kind: 'line', series: '', at: '1', text: '1%' }]
  }).body;
  eq(['title={50\\% done}', 'ylabel={Percent passing (\\%) by mass}', 'xticklabels={{10\\%}}', '\\addlegendentry{5\\% line}', '{1\\%};'].map((t) => percent.includes(t)), [true, true, true, true, true], 'every text escaped');
  eq(/[^\\]%/.test(percent), false, 'no bare % left');
  eq(plotCode({ ...emptyPlot(), ylabel: 'Passing (%)' }, { siUnits: true }).body.includes('ylabel={Passing (\\unit{\\percent})}'), true, 'siunitx’s own percent kept');
}

// a domain or a limit typed as an expression
{
  const pi = plotCode({ ...emptyPlot(), series: [{ ...newSeries('s1'), expr: 'sin(x)', from: '0', to: '2*pi' }], xmin: '0', xmax: '2*pi', ymin: 'oops' }).body;
  eq([pi.includes('domain=0:{2*pi}'), pi.includes('xmax={2*pi}'), pi.includes('ymin')], [true, true, false], 'function domain and axis limits; text that isn’t maths still left out');
}

// tan(x): with the y range set, points far beyond it break the line instead of joining across an asymptote
{
  const tan = one({ expr: 'tan(x)', from: '-3', to: '3' }, { ymin: '-5', ymax: '5' });
  eq(tan, ['\\addplot+[domain=-3:3, samples=100, unbounded coords=jump, restrict y to domain=-15:15, no markers] {tan(x)};'], 'tan(x) breaks at its asymptotes');
  eq(one({ expr: 'tan(x)' }, { ymin: '-5' })[0].includes('restrict'), false, 'only with both ends of y');
  eq(one({ expr: 'exp(x)' }, { ymin: '1', ymax: '100', ymode: 'log' })[0].includes('restrict'), false, 'not on a log axis');
}

eq([separatorOf('a.CSV'), separatorOf('b.tsv'), separatorOf('c.dat')], ['comma', 'tab', null], 'separators');
eq(columnsOf('a.csv', '# made by hand\n"time", value (V)\n0,1\n'), ['time', 'value (V)'], 'CSV header, after a comment');
eq(columnsOf('a.tsv', 'x\ty\n1\t2'), ['x', 'y'], 'TSV header');
eq(columnsOf('a.dat', '  t   v  \n1 2'), ['t', 'v'], 'whitespace header');
eq(columnsOf('a.dat', '0.1 2\n0.2 4'), ['0', '1'], 'no header: columns by place');
eq(columnsOf('a.csv', '1,2,3\n'), ['0', '1', '2'], 'a CSV without a header');
// a semicolon CSV: its columns, and the separator saved with the series, reading its decimal commas
eq([columnsOf('a.csv', 'd;p\n1,5;2'), isSemicolonCsv('a.csv', 'd;p\n1,5;2')], [['d', 'p'], true], 'a semicolon CSV');
eq([columnsOf('a.csv', '0,1;2,5\n'), columnsOf('a.csv', 'a,b;c,d\n'), isSemicolonCsv('a.csv', 'time,value\n'), isSemicolonCsv('a.dat', 'a;b')], [['0', '1'], ['a', 'b;c', 'd'], false, false], 'headerless with decimal commas; commas outnumbering semicolons; not a .csv');
eq(one({ source: 'data', file: 'a.csv', x: 'd', y: 'p', sep: 'semicolon' }), ['\\addplot+[no markers] table[x={d}, y={p}, col sep=semicolon, /pgf/number format/read comma as period] {a.csv};'], 'written with its separator');
eq(columnsOf('a.csv', 'd\n1\n'), [], 'one column: none, which the form says');
eq(one({ source: 'data', file: 'a.dat', x: '0', y: '1' }), ['\\addplot+[no markers] table[x index=0, y index=1] {a.dat};'], 'columns by place as x index');

// axes, scales and ticks
eq(axisLine({ ...emptyPlot(), axes: 'centre', xmode: 'log', ymode: 'log' }), '\\begin{axis}[xlabel={$x$}, ylabel={$y$}, grid=major, axis lines=middle, xlabel style={at={(ticklabel* cs:1)}, anchor=west}, ylabel style={at={(ticklabel* cs:1)}, anchor=south}, xmode=log, ymode=log, trig format plots=rad]', 'centred, log');
eq(axisLine({ ...emptyPlot(), axes: 'sketch', xlabel: '', yticks: '1 = $V$' }), '\\begin{axis}[ylabel={$y$}, grid=major, axis lines=middle, ylabel style={at={(ticklabel* cs:1)}, anchor=south}, ytick={1}, yticklabels={{$V$}}, xtick=\\empty, trig format plots=rad]', 'a sketch has only the ticks asked for');
eq(ticksOf('x', 'pi/2 = $\\frac{\\pi}{2}$; pi ;; 2'), ['xtick={pi/2,pi,2}', 'xticklabels={{$\\frac{\\pi}{2}$},{$\\pgfmathparse{pi}\\pgfmathprintnumber{\\pgfmathresult}$},{$2$}}'], 'ticks, one labelled, the rest their values');
eq(ticksOf('y', '0; 1'), ['ytick={0,1}'], 'ticks without labels');
eq(ticksOf('y', ' ; '), [], 'no ticks');

// the other kinds of series

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

// ---- Spectrum 2.5: data and fits, the axis and line options, areas on any series (each makes version 5)

// expressions worked out as pgfmath does, for asymptotes and annotations at pi/2
eq([evaluate('pi/2'), evaluate('-x^2', 3), evaluate('2^-1'), evaluate('2*sin(x)+e', 0), evaluate('max(1, 2*x)', 3), evaluate('1e-3*4')], [Math.PI / 2, -9, 0.5, Math.E, 6, 0.004], 'evaluate');
eq(['foo(1)', 'constructor(1)', '1+', '(1', 'x y', '\\input{x}'].map((t) => evaluate(t)), [null, null, null, null, null, null], 'what it doesn’t read is null');

// typed points: x, y, an error, a label; a line that isn't two numbers is left out
eq(pointsOf('1, 2\n3 4 0.5 = $P$; oops\n5,6,= 10%'), [{ x: 1, y: 2, label: '' }, { x: 3, y: 4, error: 0.5, label: '$P$' }, { x: 5, y: 6, label: '10%' }], 'points');
eq(one({ source: 'points', points: '1, 2\n0.00135, 300' }), ['\\addplot+[no markers] coordinates {(1,2) (0.00135,300)};'], 'a line through typed points, as typed');
eq(one({ source: 'points', points: '1, 2, 0.5 = A\n2, 3\n3, 5 = 50%', line: 'none', mark: 'o' }), [
  // errors only where given, the others' labels empty
  '\\addplot+[only marks, mark=o, error bars/y dir=both, error bars/y explicit, nodes near coords, point meta=explicit symbolic] coordinates {(1,2) +- (0,0.5) [A] (2,3) [] (3,5) [50\\%]};'
], 'a scatter with an error bar and labels');
eq(one({ source: 'points', points: 'none' }), [], 'no points, no plot');
eq(one({ source: 'points', points: '1, 2\n2, 1', bars: true }), ['\\addplot+[ybar, fill=.!30, area legend, no markers] coordinates {(1,2) (2,1)};'], 'bars');
eq(one({ source: 'points', points: '1, 2', marks: true, mark: 'x', line: 'dashdotted' }), ['\\addplot+[dashdotted, mark=x] coordinates {(1,2)};'], 'dash dot with crosses');
eq(one({ source: 'data', file: 'a.dat', x: 't', y: 'v', yerr: 'dv', bars: true }), ['\\addplot+[ybar, fill=.!30, area legend, no markers, error bars/y dir=both, error bars/y explicit] table[x={t}, y={v}, y error={dv}] {a.dat};'], 'a data file with bars and an error column');

// a smooth sketch curve: through every point typed, as TikZ's smooth would draw it, marked only at those points
{
  const typed = pointsOf('0, 0\n1, 2\n3, 1');
  const curve = smoothThrough(typed);
  eq([curve.length, curve[0], curve[12], curve[24]], [25, typed[0], typed[1], typed[2]], 'through each point, 12 lines a piece');
  eq(curve.slice(1, 12).every((c) => c.x > 0 && c.x < 1), true, 'between them in order');
  const log = smoothThrough(pointsOf('0.1, 1\n1, 2\n10, 3'), true);
  // halfway along the first piece: (−1 + 3(−0.7225) + 3(−0.555) + 0) / 8 = −0.604 in logs; in plain x it would be −0.386, off the axis
  eq([Math.abs(log[6].x - 10 ** -0.604) < 0.002, smoothThrough(pointsOf('0.1, 1\n1, 2\n10, 3'))[6].x < 0], [true, true], 'on a log axis, through the logs');
  const line = one({ source: 'points', points: '0, 0\n1, 2 = top\n3, 1', smooth: true, marks: true })[0];
  eq([line.startsWith('\\addplot+[mark indices={1,13,25}, nodes near coords, point meta=explicit symbolic] coordinates {(0,0) [] ('), line.includes('(1,2) [top]'), line.includes('smooth')], [true, true, false], 'marks and labels on the points typed');
  eq(one({ source: 'points', points: '0, 0\n1, 2', smooth: true })[0], '\\addplot+[no markers] coordinates {(0,0) (1,2)};', 'two points: a line');
}

// the least-squares line, against the hand-worked fits in MATH2150's tutorial solutions
{
  const ac = pointsOf('24, 120\n26, 135\n28, 155\n30, 170\n32, 190');
  const close = (fit: { a: number; b: number } | null, a: number, b: number) => !!fit && Math.abs(fit.a - a) < 1e-9 && Math.abs(fit.b - b) < 1e-9;
  // x̄ = 28, ȳ = 154, Sxy = 350, Sxx = 40: b = 8.75, a = 154 − 8.75 × 28 = −91
  eq(close(leastSquares(ac), -91, 8.75), true, 'AC electricity: ŷ = −91 + 8.75x');
  // x̄ = 6, ȳ = 62, Sxy = 242, Sxx = 40: b = 6.05, a = 62 − 36.3 = 25.7
  eq(close(leastSquares(pointsOf('2, 38\n4, 49\n6, 63\n8, 74\n10, 86')), 25.7, 6.05), true, 'delivery charge: ŷ = 25.70 + 6.05x');
  // through the origin, b = Σxy / Σx² = 36 / 30
  eq(close(leastSquares(pointsOf('1, 2\n2, 3.5\n3, 3\n4, 4.5'), true), 0, 1.2), true, 'through the origin');
  eq([leastSquares(pointsOf('1, 2')), leastSquares(pointsOf('2, 1\n2, 3')), leastSquares([], true)], [null, null, null], 'too few points to fix a line');
  const fitted: PlotModel = { ...emptyPlot(), series: [{ ...newSeries('p'), source: 'points', points: '24, 120\n26, 135\n28, 155\n30, 170\n32, 190', line: 'none' }, { ...newSeries('f'), source: 'fit', of: 'p', from: '', to: '' }] };
  eq(plotCode(fitted).body.split('\n').slice(3, -3), [
    '\\addplot+[only marks] coordinates {(24,120) (26,135) (28,155) (30,170) (32,190)};',
    // over the points, with its equation as its legend
    '\\addplot+[domain=24:32, samples=2, no markers] {-91+8.75*x};',
    '\\legend{,{$y = -91 + 8.75x$}}'
  ], 'a fit and its equation');
  eq(fitEquation({ ...fitted.series[1], origin: true }, fitted)?.text, '5.533x', 'through the origin, Σxy / Σx² = 21910 / 3960, to 4 figures');
  eq(fitEquation({ ...fitted.series[1] }, { ...fitted, series: [{ ...fitted.series[0], points: '0, 3\n1, 1' }, fitted.series[1]] })?.text, '3 - 2x', 'a falling line');
  eq(one({ source: 'fit', of: 'nothing' }), [], 'a fit of nothing draws nothing');
  eq(plotCode({ ...fitted, series: [fitted.series[0], { ...fitted.series[1], legend: 'least squares', from: '22', to: '34', origin: true }] }).body.includes('\\addplot+[domain=22:34, samples=2, no markers] {5.532828283*x};\n\\legend{,{least squares}}'), true, 'its own range and legend');
}

// axis options: equal axes, height, x reversed, black and white, tick numbers, the legend below
eq(axisLine({ ...emptyPlot(), equal: true, height: '5', xReverse: true, bw: true }), '\\begin{axis}[xlabel={$x$}, ylabel={$y$}, grid=major, height=5cm, axis equal image, x dir=reverse, cycle list name=black white, trig format plots=rad]', 'equal, height, reversed, black and white');
eq(axisLine({ ...emptyPlot(), tickPlain: true, tickComma: true, xmode: 'log' }).includes('scaled ticks=false, log ticks with fixed point, tick label style={/pgf/number format/.cd, use comma, fixed, 1000 sep={}}'), true, 'plain ticks with a decimal comma, on a log axis');
eq(axisLine({ ...emptyPlot(), tickDecimals: '2' }).includes('scaled ticks=false, tick label style={/pgf/number format/.cd, fixed, fixed zerofill, precision=2}'), true, 'two decimals');
eq(axisLine({ ...emptyPlot(), tickDecimals: 'two' }).includes('tick label'), false, 'decimals that aren’t a number: none');
{
  const legended = { ...emptyPlot(), legendPos: 'below' as const, series: [{ ...newSeries('s1'), legend: 'a' }] };
  eq(axisLine(legended).includes('xlabel style={name=spx-xlabel}, legend style={at={(spx-xlabel.south)}, anchor=north, legend columns=-1}'), true, 'below the x label, in a row');
  eq(axisLine({ ...legended, xlabel: '' }).includes('legend style={at={(xticklabel cs:0.5)}, anchor=north, legend columns=-1}'), true, 'below the ticks without one');
  eq(axisLine({ ...legended, axes: 'centre' }).includes('legend style={at={(0.5,0)}, anchor=north, legend columns=-1}'), true, 'below the frame for centred axes');
}

// a function broken at its asymptotes with no y range: cut beyond the middle of its values, worked out here
{
  const tan = one({ expr: 'tan(x)', from: '-3', to: '3', breaks: true, samples: 200 })[0];
  const cut = tan.match(/restrict y to domain=(-?[\d.]+):(-?[\d.]+)/);
  eq([tan.includes('unbounded coords=jump'), !!cut && Number(cut[1]) < -5 && Number(cut[1]) > -30 && Number(cut[2]) > 5 && Number(cut[2]) < 30], [true, true], 'tan(x) broken with no y range');
  eq(one({ expr: 'tan(x)', from: '-3', to: '3', breaks: true }, { ymin: '-5', ymax: '5' })[0].includes('restrict y to domain=-15:15'), true, 'with a y range, as before');
  eq(one({ expr: 'mystery(x)', breaks: true })[0].includes('restrict'), false, 'an expression it can’t read: no cut');
  eq(one({ expr: 'tan(x)' })[0].includes('restrict'), false, 'switched off: as before');
}

// annotations at expressions, worked out to the same numbers as typed ones
{
  const at = (a: Partial<Annotation>) => plotCode({ ...emptyPlot(), series: [{ ...newSeries('s1'), expr: 'sin(x)' }], annotations: [{ id: 'a1', kind: 'point', series: 's1', at: '0', ...a }] }).body;
  eq(at({ at: 'pi/2' }).includes('samples at={1.571}] {spxfa(x)} coordinate[pos=0] (spx-a1);'), true, 'a point at pi/2');
  eq(at({ kind: 'line', series: '', at: '-pi/2' }).includes('\\coordinate (spx-a1) at (axis cs:-1.571,1);'), true, 'a line at -pi/2');
  eq(at({ kind: 'secant', at: '0', to: 'pi' }).includes('samples at={0,3.142}'), true, 'a secant to pi');
  eq(at({ at: 'pi/' }).includes('spx-a1'), false, 'one that isn’t maths: left out');
}

// a shaded area on any series: between the paths two series draw, or down to y = 0, clipped to x from, to
{
  const banded: PlotModel = {
    ...emptyPlot(),
    series: [
      { ...newSeries('u'), source: 'points', points: '0, 2\n2, 3' },
      { ...newSeries('l'), source: 'points', points: '0, 0\n2, 1' },
      { ...newSeries('f'), expr: 'x/2' }
    ],
    annotations: [
      { id: 'a1', kind: 'area', series: 'u', series2: 'l', at: '', to: '' },
      { id: 'a2', kind: 'area', series: 'u', at: '0.5', to: '1.5', colour: '#00ff00' },
      { id: 'a3', kind: 'area', series: 'f', series2: 'l', at: '0', to: '2' },
      { id: 'a4', kind: 'area', series: 'u', at: '', to: '' }
    ]
  };
  const code = plotCode(banded);
  const lines = code.body.split('\n');
  eq(lines.slice(3, 5), ['\\addplot+[no markers, name path=spx-u] coordinates {(0,2) (2,3)};', '\\addplot+[no markers, name path=spx-l] coordinates {(0,0) (2,1)};'], 'each series an area is on, its path named');
  eq(lines.slice(6, -3), [
    '\\addplot[fill=gray, fill opacity=0.3, forget plot] fill between[of=spx-u and spx-l];',
    '\\path[name path=spx-a2-b] (axis cs:0.5,0) -- (axis cs:1.5,0);',
    '\\addplot[fill={rgb,255:red,0;green,255;blue,0}, fill opacity=0.3, forget plot] fill between[of=spx-u and spx-a2-b, soft clip={domain=0.5:1.5}];',
    '\\addplot[draw=none, forget plot, name path=spx-a3-a, domain=0:2, samples=50] {spxfa(x)};',
    '\\addplot[fill=gray, fill opacity=0.3, forget plot] fill between[of=spx-a3-a and spx-l, soft clip={domain=0:2}];'
    // a4: down to y = 0 needs its range
  ], 'a band between two series, an area under one, and a function against points');
  eq(code.libraries, ['pgfplots.fillbetween'], 'with the fillbetween library');
}

// the course starters compile as they should; their checks are by eye beside the course's figures
{
  const steel = plotCode(stressStrain()).body;
  eq([steel.includes('mark indices'), steel.includes('nodes near coords'), steel.includes('soft clip={domain=1:12}'), steel.includes('xtick={3.8}')], [false, true, true, true], 'stress–strain: named points, the area under the curve, the permanent strain');
  const grading = plotCode(gradingCurve()).body;
  eq([grading.includes('xmode=log'), grading.includes('log ticks with fixed point'), grading.includes('fill between[of=spx-s1 and spx-s2]'), grading.includes('[47]')], [true, true, true, true], 'grading curve: log axis, plain ticks, envelope, point labels');
}

// version 5 for any of these; plots without them keep their version and code
eq([emptyPlot(), model, annotated, signalSketch(), slopeField()].map(plotNeedsVersion5), [false, false, false, false, false], 'older plots: no version 5');
eq(
  [
    { series: [{ ...newSeries('s'), source: 'points' as const }] },
    { series: [{ ...newSeries('s'), source: 'fit' as const }] },
    { series: [{ ...newSeries('s'), line: 'none' as const }] },
    { series: [{ ...newSeries('s'), mark: 'o' as const }] },
    { series: [{ ...newSeries('s'), sep: 'semicolon' as const }] },
    { series: [{ ...newSeries('s'), breaks: true }] },
    { equal: true },
    { height: '5' },
    { xReverse: true },
    { bw: true },
    { tickPlain: true },
    { legendPos: 'below' as const },
    { annotations: [{ id: 'a', kind: 'point' as const, series: 's1', at: 'pi/2' }] },
    { series: [{ ...newSeries('p'), source: 'data' as const }], annotations: [{ id: 'a', kind: 'area' as const, series: 'p', at: '0', to: '1' }] }
  ].map((m) => plotNeedsVersion5({ ...emptyPlot(), ...m })),
  Array(14).fill(true),
  'each addition makes version 5'
);
eq([stressStrain(), gradingCurve()].map(plotNeedsVersion5), [true, true], 'so do the starters');

// the form folds the rarer fields, open once one is set: a new plot's are all folded
eq([axesFolded(emptyPlot()), seriesFolded(newSeries('s'))], [false, false], 'a new plot folds its rarer fields');
eq([{ grid: 'none' as const }, { width: '8' }, { xmode: 'log' as const }, { yticks: '1' }, { equal: true }, { tickComma: true }].map((m) => axesFolded({ ...emptyPlot(), ...m })), Array(6).fill(true), 'an axes field set opens the fold');
eq(
  [{ line: 'dashed' as const }, { marks: true }, { colour: '#000000' }, { stem: true }, { breaks: true }, { bars: true }, { yerr: 'e' }].map((m) => seriesFolded({ ...newSeries('s'), ...m })),
  Array(7).fill(true),
  'a series field set opens the fold'
);
eq(seriesFolded({ ...newSeries('s'), source: 'points', marks: true }), false, 'points have marks of their own');
// 2.5's starters: each uses a 2.5 addition (height, equal axes, plain ticks, a points series), so is version 5
const starters = [normalCurve(), bodeMagnitude(), dampedOscillation(), polarRose(), lissajous(), conics(), phasePortrait()];
eq(starters.map(plotNeedsVersion5), Array(7).fill(true), 'the 2.5 starters are version 5');
eq(plotCode(normalCurve()).body.includes('domain=1.645:3.5, samples=50] {spxfa(x)} \\closedcycle;'), true, 'the normal curve shades its tail');
eq(plotCode(conics()).body.includes('axis equal image'), true, 'conics on equal axes');

// a series made a new kind takes that kind's marks: typed points have them, a curve made from them does not
const typed: Series = { ...newSeries('s9'), ...asKind(newSeries('s9'), 'points') } as Series;
eq(typed.marks, true, 'typed points have marks');
eq((['function', 'parametric', 'polar', 'piecewise', 'signal', 'quiver', 'fit', 'data'] as const).map((k) => asKind(typed, k).marks), [false, false, false, false, false, false, false, false], 'no kind but points takes them on');
eq(seriesFolded({ ...typed, ...asKind(typed, 'parametric') } as Series), false, 'so its fold stays shut');

// a coloured series' filled marks take its colour, not the colour of its place in pgfplots' cycle list
const dotted = plotCode({ ...emptyPlot(), series: [{ ...newSeries('s1'), source: 'points', points: '0, 1\n1, 2', marks: true, mark: '*', colour: '#1f4e9c' }] }).body;
eq(dotted.includes('mark=*, every mark/.append style={fill={rgb,255:red,31;green,78;blue,156}}'), true, 'a coloured series fills its marks in its colour');
eq(plotCode({ ...emptyPlot(), series: [{ ...newSeries('s1'), colour: '#1f4e9c' }] }).body.includes('every mark'), false, 'nothing for a series without marks');

console.log('pgfplots.check: ok');
