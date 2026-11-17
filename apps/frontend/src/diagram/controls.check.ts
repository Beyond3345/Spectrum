// Self-check for the inspectors' shared pieces (controls.tsx): the colour a colour well shows. Run:
// npx esbuild apps/frontend/src/diagram/controls.check.ts --bundle --platform=node --format=esm --log-level=warning | node --input-type=module
import { wellColour } from './controls';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(wellColour('#1a2b3c'), '#1a2b3c', 'a colour picked in the well');
eq([wellColour('red'), wellColour('blue!15')], ['#ff0000', '#d9d9ff'], 'an xcolor name or mix, as it prints, not black');
eq([wellColour(undefined), wellColour(''), wellColour('thick')], ['#000000', '#000000', '#000000'], 'none, or no colour at all');

console.log('controls.check: ok');
