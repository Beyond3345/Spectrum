// Self-check for the SyncTeX jump maths. Run (bundle it first, like the other checks):
// npx esbuild apps/frontend/src/editor/synctex.check.ts --bundle --platform=node --log-level=warning | node
import { highlightColour, overlayStyle, pdfPoint } from './synctex';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const A4 = { width: 595, height: 842 };
// at 150% the page is drawn 892.5 × 1263 px; here it sits 40 px in and 100 px down
eq(pdfPoint(40 + 150, 100 + 300, { left: 40, top: 100, width: 892.5, height: 1263 }, A4), { x: 100, y: 200 }, 'zoomed page');
// a pinch stretching that page to twice its size: the same spot is twice as far from the corner
eq(pdfPoint(40 + 300, 100 + 600, { left: 40, top: 100, width: 1785, height: 2526 }, A4), { x: 100, y: 200 }, 'mid-pinch');
// the right page of a two-page row at 100%
eq(pdfPoint(620 + 59.5, 12, { left: 620, top: 12, width: 595, height: 842 }, A4), { x: 59.5, y: 0 }, 'right page, top edge');

eq(
  overlayStyle({ page: 2, x: 59.5, y: 84.2, width: 297.5, height: 8.42 }, A4),
  { left: '10%', top: '10%', width: '50%', height: '1%' },
  'box as percent of the page'
);
// the click and the box agree: a box drawn where pdfPoint says the click was
const at = pdfPoint(100 + 297.5, 200 + 842, { left: 100, top: 200, width: 1190, height: 1684 }, A4);
eq(overlayStyle({ page: 1, ...at, width: 0, height: 0 }, A4), { left: '25%', top: '50%', width: '0%', height: '0%' }, 'round trip');

eq(highlightColour({ syncHighlightColour: 'yellow', syncHighlightCustom: '#123456' }, false), '#ffcc00', 'yellow, light');
eq(highlightColour({ syncHighlightColour: 'yellow', syncHighlightCustom: '#123456' }, true), '#ffd60a', 'yellow, dark');
eq(highlightColour({ syncHighlightColour: 'accent', syncHighlightCustom: '#123456' }, true), 'var(--accent)', 'accent');
eq(highlightColour({ syncHighlightColour: 'custom', syncHighlightCustom: '#123456' }, false), '#123456', 'custom');
console.log('synctex.check: ok');
