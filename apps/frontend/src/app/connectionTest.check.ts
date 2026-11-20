// Self-check for the Model menu Test connection fills, and what the test says. Run (it imports React, so bundle it first):
// npx esbuild apps/frontend/src/app/connectionTest.check.ts --bundle --platform=node --format=esm --outfile=/tmp/c.mjs && node /tmp/c.mjs
import { modelChoices, testSays } from './connectionTest';
import type { ProviderModel } from '../api/client';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const model = (id: string, label: string): ProviderModel => ({ id, label, note: '', vision: true, levels: [], effort: 'low' });
const presets = [model('deepseek-flash', 'DeepSeek Flash'), model('deepseek-v4-pro', 'DeepSeek V4 Pro')];

eq(modelChoices(presets, [], 'deepseek-flash'), [['deepseek-flash', 'DeepSeek Flash (recommended)'], ['deepseek-v4-pro', 'DeepSeek V4 Pro']], 'before a test, the presets alone');
eq(
  modelChoices(presets, ['deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'], 'deepseek-flash'),
  [['deepseek-flash', 'DeepSeek Flash (recommended)'], ['deepseek-v4-pro', 'DeepSeek V4 Pro'], ['deepseek-chat', 'deepseek-chat'], ['deepseek-reasoner', 'deepseek-reasoner']],
  'a preset keeps its label and place; a model only the provider lists comes after, by its id'
);
eq(modelChoices([], ['a', 'b'], ''), [['a', 'a'], ['b', 'b']], 'a server with no presets');

const ok = { ok: true, kind: 'connected', message: 'Connected to api.deepseek.com. It accepted the key, and DeepSeek offers 2 models.', models: ['deepseek-chat', 'deepseek-reasoner'] };
eq(testSays(ok, 'deepseek-flash'), `${ok.message} The model “deepseek-flash” isn’t in that list.`, 'a chosen model the provider does not list is named');
eq(testSays(ok, 'deepseek-chat'), ok.message, 'a listed one is not');
eq(testSays(ok, ''), ok.message, 'nor an empty name');
const refused = { ok: false, kind: 'key', message: 'api.deepseek.com refused the key (HTTP 401).', models: ['x'] };
eq(testSays(refused, 'deepseek-flash'), refused.message, 'a failed test says only why');

console.log('connectionTest.check: ok');
