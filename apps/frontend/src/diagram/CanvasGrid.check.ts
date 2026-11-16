// Self-check for the counting grid (CanvasGrid.tsx): the circuit canvas's four backgrounds come out as they were drawn
// before the grid was shared, a composer's own interval (a metre, a centimetre) keeps its marks on the dots, and the
// origin lines pass through the grid's point. Run:
// npx esbuild apps/frontend/src/diagram/CanvasGrid.check.ts --bundle --platform=node --format=esm --log-level=warning --loader:.css=empty | node --input-type=module
import { createElement } from 'react';
// the browser build (the node one needs require(), which a check's ESM bundle hasn't), which has no types of its own
// @ts-expect-error
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { GridMarks, gridSpacing } from './CanvasGrid';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const draw = (props: Parameters<typeof GridMarks>[0]) => renderToStaticMarkup(createElement('svg', null, createElement(GridMarks, props)));

// ─── spacing ───

// every few dots (Settings › Every): the canvas's step as given, never thinned, as the circuit canvas has always drawn
eq(gridSpacing(10, 5), { minor: 10, major: 50 }, '100 %: every fifth dot');
eq(gridSpacing(6, 5), { minor: 6, major: 30 }, 'a close step is the canvas’s own business');
eq(gridSpacing(24, 4), { minor: 24, major: 96 }, 'another interval');
// a composer's own interval, in px: the marks keep to it whatever Every says
eq(gridSpacing(20, 5, 40), { minor: 20, major: 40 }, 'a 0.5 m grid, a mark every metre');
eq(gridSpacing(10, 5, 40), { minor: 10, major: 40 }, 'a 0.25 m grid, a mark every metre');
eq(gridSpacing(9.45, 5, 37.8), { minor: 9.45, major: 37.8 }, 'a 0.25 cm grid, a mark every centimetre');
// zoomed out, the dots thin to the fewest steps that still land on every mark
eq(gridSpacing(5, 5, 40), { minor: 10, major: 40 }, 'every second step');
eq(gridSpacing(3, 5, 30), { minor: 15, major: 30 }, 'ten steps to a mark: every fifth step, not every third');
eq(gridSpacing(2, 5, 24), { minor: 8, major: 24 }, 'twelve steps to a mark: every fourth');
// further out the marks go to every 2nd, 5th, 10th… interval
eq(gridSpacing(5, 5, 20), { minor: 10, major: 40 }, 'every second metre');
eq(gridSpacing(1.25, 5, 5), { minor: 12.5, major: 25 }, 'every fifth');
eq(gridSpacing(0.5, 5, 2), { minor: 8, major: 40 }, 'every twentieth');
for (const [step, major] of [[20, 40], [5, 40], [3, 30], [2, 24], [5, 20], [1.25, 5], [0.5, 2], [0.07, 0.28]]) {
  const s = gridSpacing(step, 5, major);
  const [perMark, intervals, steps] = [s.major / s.minor, s.major / major, s.minor / step];
  eq([Math.abs(perMark - Math.round(perMark)) < 1e-6, Math.abs(intervals - Math.round(intervals)) < 1e-6, Math.abs(steps - Math.round(steps)) < 1e-6], [true, true, true], `${step} px steps, ${major} px interval: dots on steps, marks on dots and on whole intervals`);
  eq([s.minor >= 8, s.major >= 24], [true, true], `${step} px steps, ${major} px interval: far enough apart to count`);
}
// an interval that isn't a whole number of steps: the dots stay on the steps while they can
eq(gridSpacing(12, 5, 40), { minor: 12, major: 40 }, 'a 0.3 m grid: dots on the grid, marks on the metres');
eq(gridSpacing(3, 5, 40), { minor: 40, major: 40 }, 'and only the marks once the dots would crowd');
eq(gridSpacing(10, 5, 0), { minor: 10, major: 50 }, 'no interval: every few dots');

// ─── drawn: the circuit canvas's backgrounds as they were ───

const was = (kind: string, minor: number, major: number, x: number, y: number) =>
  '<svg><defs>' +
  `<pattern id="ckt-dots" width="${minor}" height="${minor}" patternUnits="userSpaceOnUse" x="${x}" y="${y}">` +
  (kind === 'lines' ? `<path d="M0.75,0 V${minor} M0,0.75 H${minor}" class="canvas-grid-line"></path>` : '<circle cx="0.75" cy="0.75" r="0.75" class="canvas-grid-dot"></circle>') +
  '</pattern>' +
  (kind === 'dots'
    ? ''
    : `<pattern id="ckt-major" width="${major}" height="${major}" patternUnits="userSpaceOnUse" x="${x - 3}" y="${y - 3}">` +
      (kind === 'major-dots' ? '<circle cx="3.75" cy="3.75" r="1.6" class="canvas-grid-dot"></circle>' : `<path d="M3.75,0 V${major} M0,3.75 H${major}" class="canvas-grid-line canvas-grid-major"></path>`) +
      '</pattern>') +
  '</defs><rect width="100%" height="100%" fill="url(#ckt-dots)"></rect>' +
  (kind === 'dots' ? '' : '<rect width="100%" height="100%" fill="url(#ckt-major)"></rect>') +
  '</svg>';
for (const kind of ['major-dots', 'major-lines', 'lines', 'dots'] as const) {
  // 100 % and 40 % (where the circuit draws every fourth step), panned
  for (const [k, gridStep, x, y] of [[10, 1, 412.5, 300], [4, 4, -1260.25, 87]]) {
    eq(draw({ id: 'ckt', kind, ...gridSpacing(k * gridStep, 5), x, y }), was(kind, k * gridStep, k * gridStep * 5, x, y), `${kind} at ${k} px a step`);
  }
}
// two canvases' patterns never share an id
eq(draw({ id: 'st', kind: 'major-dots', minor: 10, major: 40, x: 0, y: 0 }).match(/(?:id="|url\(#)[^")]+/g), ['id="st-dots', 'id="st-major', 'url(#st-dots', 'url(#st-major'], 'ids from the canvas’s prefix');

// ─── the origin ───

const withOrigin = draw({ id: 'vec', kind: 'dots', minor: 10, major: 40, x: 120, y: 80, origin: true });
eq(withOrigin.includes('<g class="canvas-grid-origin"><line x1="120.75" y1="0" x2="120.75" y2="100%"></line><line x1="0" y1="80.75" x2="100%" y2="80.75"></line></g>'), true, 'x = 0 and y = 0 through the grid’s point, on its dots');
eq(draw({ id: 'vec', kind: 'dots', minor: 10, major: 40, x: 120, y: 80 }).includes('origin'), false, 'none unless asked');

console.log('CanvasGrid.check: ok');
