// Self-check for labels as they print (sketch.tsx): subscripts and superscripts come out as their own runs, markup is
// dropped, and the SVG and HTML forms set them. Run:
// npx esbuild apps/frontend/src/diagram/sketch.check.ts --bundle --platform=node --format=esm --log-level=warning | node --input-type=module
// the browser build (the node one needs require(), which a check's ESM bundle hasn't), which has no types of its own
// @ts-expect-error
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { createElement } from 'react';
import { htmlRuns, labelSize, plain, scriptRuns, svgRuns } from './sketch';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ─── sub and superscripts ───

eq(scriptRuns('C_1'), [{ text: 'C' }, { text: '1', shift: 'sub' }], 'C_1');
eq(scriptRuns('$R_{in}$'), [{ text: 'R' }, { text: 'in', shift: 'sub' }], 'R_{in}');
eq(scriptRuns('V^2'), [{ text: 'V' }, { text: '2', shift: 'super' }], 'V^2');
eq(scriptRuns('R_{\\text{load}} = 4.7\\,\\Omega'), [{ text: 'R' }, { text: 'load', shift: 'sub' }, { text: ' = 4.7 Ω' }], 'a nested group and a unit');
eq(scriptRuns('v_\\mu'), [{ text: 'v' }, { text: 'µ', shift: 'sub' }], 'a command as the script');
eq(scriptRuns('10 kΩ'), [{ text: '10 kΩ' }], 'no scripts');
// the other canvases' labels: a reaction, a load, a vector's component
eq(scriptRuns('$A_y$'), [{ text: 'A' }, { text: 'y', shift: 'sub' }], 'A_y');
eq(scriptRuns('q_0 = 5\\,\\text{kN/m}'), [{ text: 'q' }, { text: '0', shift: 'sub' }, { text: ' = 5 kN/m' }], 'q_0 with its value');
eq(scriptRuns('F_{1x}^2'), [{ text: 'F' }, { text: '1x', shift: 'sub' }, { text: '2', shift: 'super' }], 'both on one letter');
eq(scriptRuns('\\vec{F}_1'), [{ text: 'F' }, { text: '1', shift: 'sub' }], 'markup around the letter dropped');

// ─── as one string ───

eq(plain('$A_y$'), 'Ay', 'no markup and no underscore, for a name read out');
eq(plain('\\theta_{\\max} = 30\\degree'), 'θ = 30°', 'Greek and a degree sign; an unknown command leaves nothing');
eq(plain('\\frac{wL^2}{8}'), '(wL2)/(8)', 'a fraction on one line');
eq(plain('\\small 4.7\\,\\mathrm{k}\\Omega, 5\\%'), '4.7 kΩ, 5%', 'a font size, a thin space, a unit and a per cent');

// ─── drawn ───

eq(renderToStaticMarkup(createElement('text', null, svgRuns('q_0'))), '<text>q<tspan baseline-shift="sub" font-size="70%">0</tspan></text>', 'SVG: a tspan set lower and smaller');
eq(renderToStaticMarkup(createElement('span', null, htmlRuns('$A_y + x^2$'))), '<span>A<sub>y</sub> + x<sup>2</sup></span>', 'HTML: sub and sup');
eq(renderToStaticMarkup(createElement('span', null, htmlRuns('Start'))), '<span>Start</span>', 'plain text stays as it is');

// ─── measured ───

eq(labelSize(scriptRuns('R'), 1), { w: 0.6, h: 1.1 }, 'one letter');
eq(labelSize(scriptRuns('A_y'), 10), { w: 0.6 * 10 * 1.7, h: 14 }, 'a script is narrower, and the label taller');

console.log('sketch: ok');
