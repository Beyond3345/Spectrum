// Self-check for the model and effort menu's logic. Run:
// npx esbuild apps/frontend/src/editor/agent/agentTuning.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --outfile=<scratch>/t.mjs && node <scratch>/t.mjs
import { LOGO, effortLevels, wavelength } from './AgentTuning';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// the Spectrum agent's efforts: "Recommended (High)" is a badge on High, not a second High, and is chosen as High
const spectrum = { id: 'effort', name: 'Thinking', currentValue: 'default', options: [{ value: 'default', name: 'Recommended (High)' }, { value: 'none', name: 'Off' }, { value: 'low', name: 'Low' }, { value: 'high', name: 'High' }, { value: 'max', name: 'Max' }] };
let r = effortLevels(spectrum);
eq(r.levels.map((c) => [c.name, !!c.recommended]), [['Off', false], ['Low', false], ['High', true], ['Max', false]], 'one High, marked recommended');
eq(r.current, 'high', 'the recommended level is chosen while it is');
r = effortLevels({ ...spectrum, currentValue: 'max' });
eq(r.current, 'max', 'another level as chosen');
// a recommended level with no level of its name stays a row of its own
r = effortLevels({ ...spectrum, options: [{ value: 'default', name: 'Recommended (Medium)' }, { value: 'low', name: 'Low' }] });
eq(r.levels.map((c) => c.name), ['Recommended (Medium)', 'Low'], 'kept where nothing else names it');
// an agent's plain levels are as they come
r = effortLevels({ id: 'reasoning_effort', name: 'Effort', currentValue: 'medium', options: [{ value: 'low', name: 'Low' }, { value: 'medium', name: 'Medium' }] });
eq([r.levels.length, r.current], [2, 'medium'], 'plain levels');

// the levels run red to purple along the logo
eq([wavelength(0, 4), wavelength(3, 4), wavelength(0, 1)], [LOGO[0], LOGO[5], LOGO[0]], 'lowest red, highest purple');

console.log('agentTuning.check: ok');
