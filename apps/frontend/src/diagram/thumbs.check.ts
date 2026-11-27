// Self-check for the chooser cards' line drawings. Run:
// npx esbuild apps/frontend/src/diagram/thumbs.check.ts --bundle --platform=node --log-level=warning | node
// the browser build, which has no types of its own (as sketch.check.ts)
// @ts-expect-error
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { createElement } from 'react';
import { STARTERS } from './starters';
import { StarterThumb, thumbFor } from './thumbs';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const kind = (id: string) => thumbFor(STARTERS.find((s) => s.id === id)!);

// the plan's five, and a starter of each mode by its mode
eq(['cantilever', 'circuit', 'flowchart', 'plot', 'commutative'].map(kind), ['beam', 'circuit', 'flowchart', 'plot', 'square'], 'beam, circuit, flowchart, axes and commutative grid');
eq(['inverting-amplifier', 'bridge-rectifier', 'astable-555', 'logic', 'pratt-truss', 'portal-frame', 'sequence', 'exact-sequence', 'venn', 'mermaid-pie', 'gate', 'vector-free-body'].map(kind), ['opamp', 'diode', 'chip', 'gate', 'truss', 'frame', 'sequence', 'chain', 'venn', 'pie', 'fluid', 'block'], 'pictures by starter');
// every starter gets a picture, drawn and hidden from screen readers
for (const s of STARTERS) {
  const svg = renderToStaticMarkup(createElement(StarterThumb, { starter: s }));
  if (!/^<svg class="chooser-thumb" viewBox="0 0 64 40" aria-hidden="true" focusable="false"><(path|rect|circle|ellipse)/.test(svg)) throw new Error(`${s.id}: no drawing in ${svg.slice(0, 120)}`);
  if (/NaN|undefined/.test(svg)) throw new Error(`${s.id}: a bad number in ${svg}`);
}
console.log('thumbs.check: ok');
