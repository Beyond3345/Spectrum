// models.dev's prices as CC Switch takes them, from a local stand-in for its list
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, realpathSync, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'spectrum-models-dev-')));
let asked = 0;
const LIST = {
  anthropic: { models: { 'claude-sonnet-4-5': { name: 'Claude Sonnet 4.5', cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 }, limit: { context: 200000, output: 64000 } } } },
  openrouter: { models: { 'anthropic/claude-sonnet-4-5': { canonical_model_id: 'anthropic/claude-sonnet-4-5', cost: { input: 9, output: 9 } }, 'deepseek/deepseek-chat:free': { cost: { input: 0, output: 0 } } } },
  deepseek: { models: { 'deepseek-chat': { cost: { input: 0.27, output: 1.1, cache_read: 0.07 } } } },
  openai: { models: { 'gpt-image-1': { cost: { input: 5, output: 40 } }, 'tts-1': { cost: { input: 15 } }, 'gpt-5': { cost: { input: 1.25, output: 10 }, modalities: { output: ['text'] } }, 'old-model': { status: 'deprecated', cost: { input: 1, output: 1 } } } }
};
const server = createServer((req, res) => { asked++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(LIST)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
Object.assign(process.env, { SPECTRUM_DATA_DIR: dir, SPECTRUM_MODELS_DEV_URL: `http://127.0.0.1:${server.address().port}/api.json` });
const { modelsDevPrices, normalizeModelId, pricesOf } = await import('../src/services/modelsDev.js');
after(async () => { server.close(); await fs.rm(dir, { recursive: true, force: true }); });

test('a model’s name without its vendor, variant or 1M mark', () => {
  assert.deepEqual(['anthropic/claude-sonnet-4-5', 'deepseek-chat:free', 'Claude-Opus[1m]', 'gpt@5'].map(normalizeModelId), ['claude-sonnet-4-5', 'deepseek-chat', 'claude-opus', 'gpt-5']);
});

test('text models only, each at its maker’s price, cache prices kept', () => {
  const prices = pricesOf(LIST);
  assert.deepEqual(prices['claude-sonnet-4-5'], { input: 3, output: 15, context: 200000, cacheRead: 0.3, cacheWrite: 3.75 }, 'the maker’s, not a reseller’s, with its context window');
  assert.deepEqual(Object.keys(prices).sort(), ['claude-sonnet-4-5', 'deepseek-chat', 'gpt-5']);
  assert.deepEqual(prices['deepseek-chat'], { input: 0.27, output: 1.1, cacheRead: 0.07 }, 'a free listing does not stand in for the priced one');
});

test('the list is kept and asked for again only when six hours old, or when asked', async () => {
  const first = await modelsDevPrices();
  assert.equal(first.prices['gpt-5'].output, 10);
  await modelsDevPrices();
  assert.equal(asked, 1, 'kept');
  await modelsDevPrices({ refresh: true });
  assert.equal(asked, 2, 'Update now');
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'models-dev.json'), 'utf8'));
  assert.ok(saved.syncedAt && saved.prices['claude-sonnet-4-5']);
});
