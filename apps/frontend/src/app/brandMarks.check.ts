// Self-check for the brand marks: every provider, every local agent profile and every model Spectrum lists has a line
// mark, every full logo is a file Spectrum ships, and the Logos setting falls back to line marks. Run from the
// repository root:
// npx esbuild apps/frontend/src/app/brandMarks.check.ts --bundle --platform=node --format=esm --outfile=/tmp/marks.mjs --loader:.svg=text --loader:.css=empty && node /tmp/marks.mjs
// the frontend has no Node types
// @ts-expect-error
import fs from 'node:fs';
// @ts-expect-error the backend's presets, plain data
import { PROVIDERS } from '../../../backend/src/services/providers.js';
import { FULL_LOGOS, LINE_MARKS, agentBrand, modelBrand, providerBrand } from './BrandMark';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, sharedPart, withShared } from './settings';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// every provider preset has a mark of its own, and any other server the rack
const providers = (PROVIDERS as { id: string; models: { id: string }[] }[]);
if (providers.length < 10) throw new Error('the provider presets were not read');
for (const p of providers) {
  const brand = providerBrand(p.id);
  if (brand === 'custom' || !LINE_MARKS[brand]) throw new Error(`the provider ${p.id} has no line mark`);
  // and so has every model it lists, by its family
  for (const m of p.models) if (!LINE_MARKS[modelBrand(m.id)]) throw new Error(`the model ${m.id} has no family mark`);
}
eq([providerBrand('custom'), providerBrand('something-new'), !!LINE_MARKS.custom], ['custom', 'custom', true], 'any other server');

// every local agent profile (agentProfiles.js is read as text: it starts the backend's services when imported)
const profiles = fs.readFileSync('apps/backend/src/services/agentProfiles.js', 'utf8') as string;
const agents = [...profiles.matchAll(/^\s*\{ id: '([a-z0-9-]+)', name: '/gm)].map((m) => m[1]);
if (agents.length < 14) throw new Error(`only ${agents.length} agent profiles were read`);
for (const id of agents) if (!LINE_MARKS[agentBrand(id)]) throw new Error(`the agent ${id} has no line mark`);
eq(agentBrand('my-own-agent'), '', 'an agent of the user’s own shows its letters');

// a model's family, whatever its provider calls it
eq(['anthropic/claude-sonnet-5.5', 'claude-opus-5-5', 'gpt-6-sol', 'openai/gpt-6-luna', 'gpt-oss:120b', 'gemma4:31b', 'google/gemini-3.8-flash', 'deepseek-flash', 'moonshotai/kimi-k3', 'z-ai/glm-5.3', 'qwen/qwen3.8-max-0902', 'meta/muse-wonder', 'qwen3:latest', 'local-model-7b'].map(modelBrand),
  ['claude', 'claude', 'openai', 'openai', 'openai', 'google', 'google', 'deepseek', 'moonshot', 'zai', 'qwen', 'meta', 'qwen', ''], 'families');

// a line mark is strokes alone: path data, with nothing that fills, loads or runs
for (const [brand, d] of Object.entries(LINE_MARKS)) if (!/^M[\dMmLlHhVvCcSsAaZz .,-]+$/.test(d)) throw new Error(`${brand}’s mark is not plain path data`);

// every full logo is a drawing Spectrum ships (scripts/agent-logos.mjs), each has a line mark to fall back on, and
// none ships unused
const shipped = (fs.readdirSync('apps/frontend/public/agents') as string[]).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
for (const [brand, logo] of Object.entries(FULL_LOGOS)) {
  if (!shipped.includes(logo)) throw new Error(`${brand}’s logo ${logo}.svg is not in public/agents`);
  if (!LINE_MARKS[brand]) throw new Error(`${brand} has a logo and no line mark`);
}
eq([...new Set(Object.values(FULL_LOGOS))].sort(), shipped, 'every shipped logo is used');
// with Full logos every agent that had a logo keeps it
eq(agents.filter((id) => !FULL_LOGOS[agentBrand(id)]), [], 'every agent profile has its full logo');

// the setting: line marks unless Full logos was chosen, and it follows the user as the other appearance settings do
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } } });
const stored = (value: unknown) => (store.set(SETTINGS_KEY, JSON.stringify({ theme: 'dark', logos: value })), loadSettings().logos);
eq([DEFAULT_SETTINGS.logos, stored(undefined), stored('full'), stored('line'), stored('banana'), stored(true), stored(null)], ['line', 'line', 'full', 'line', 'line', 'line', 'line'], 'the Logos setting');
eq(sharedPart({ ...DEFAULT_SETTINGS, logos: 'full' }).logos, 'full', 'it is shared');
eq([withShared(DEFAULT_SETTINGS, { logos: 'full' }).logos, withShared(DEFAULT_SETTINGS, { logos: 'sparkly' }).logos], ['full', 'line'], 'and taken in checked');

console.log('brandMarks.check: ok');
