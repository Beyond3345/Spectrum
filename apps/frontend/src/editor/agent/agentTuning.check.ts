// Self-check for the model and effort menu's logic. Run:
// npx esbuild apps/frontend/src/editor/agent/agentTuning.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --outfile=<scratch>/t.mjs && node <scratch>/t.mjs
import { effortColour, effortLevels } from './AgentTuning';

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

// each level takes its colour by its name, as the plan has them; an unnamed one by its place, low to max
const lv = (name: string, value = name.toLowerCase()) => ({ value, name });
eq(['Off', 'Low', 'Medium', 'High', 'Extra', 'Max'].map((n, i) => effortColour(lv(n), i, 6)), ['var(--eff-off)', 'var(--eff-low)', 'var(--eff-med)', 'var(--eff-high)', 'var(--eff-xhigh)', 'var(--eff-max)'], 'by name');
eq(effortColour(lv('Extra high', 'xhigh'), 0, 3), 'var(--eff-xhigh)', 'extra high is extra, not high');
eq([effortColour(lv('Quick', 'q'), 0, 2), effortColour(lv('Deep', 'd'), 1, 2)], ['var(--eff-low)', 'var(--eff-max)'], 'unnamed levels by place');

console.log('agentTuning.check: ok');
