// Model prices from models.dev's public list (https://models.dev/api.json), the way CC Switch (MIT) takes them: text
// models only, each under its name without a vendor prefix, a ":variant" or "[1m]", in US dollars per million tokens of
// input, output, cache reads and cache writes. Spectrum keeps the last list in its data folder and asks again at most
// every six hours, through the user's proxy like every other request. Prices the user types in Settings come first.
import path from 'node:path';
import { DATA_DIR } from '../config/constants.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';

const FILE = path.join(DATA_DIR, 'models-dev.json');
const EVERY = 6 * 60 * 60 * 1000;
const MAX_BYTES = 30 * 1024 * 1024;
// a stand-in list for the tests, which never reach the network
const URL_ = (process.env.NODE_ENV !== 'production' && process.env.SPECTRUM_MODELS_DEV_URL) || 'https://models.dev/api.json';

const NON_TEXT = ['audio', 'deprecated', 'embedding', 'image', 'moderation', 'realtime', 'transcribe', 'tts', 'video'];

/** A model's name as prices are kept under it: no vendor prefix, ":variant" or "[1m]", "@" as "-", lower case */
export function normalizeModelId(id) {
  let name = String(id).slice(String(id).lastIndexOf('/') + 1).split(':')[0].trim().replace(/@/g, '-').toLowerCase();
  if (name.endsWith('[1m]')) name = name.slice(0, -4).trim();
  return name;
}

const isText = (id, model) => {
  if (String(model?.status || '').toLowerCase() === 'deprecated') return false;
  const out = (model?.modalities?.output || []).filter((m) => typeof m === 'string').map((m) => m.toLowerCase());
  if (out.length && (!out.includes('text') || out.some((m) => ['audio', 'image', 'video'].includes(m)))) return false;
  const name = `${id} ${model?.name || ''}`.toLowerCase();
  return !NON_TEXT.some((marker) => name.includes(marker));
};

/**
 * models.dev's providers as one price per model name. A name many providers sell takes its maker's price, the entry no
 * other names as its original (canonical_model_id), else the first met.
 */
export function pricesOf(data) {
  const prices = {};
  const original = new Set();
  for (const provider of Object.values(data && typeof data === 'object' ? data : {})) {
    for (const [id, model] of Object.entries(provider?.models || {})) {
      if (!isText(id, model)) continue;
      const cost = model?.cost || {};
      const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
      if (num(cost.input) === undefined && num(cost.output) === undefined) continue;
      const key = normalizeModelId(id);
      if (!key) continue;
      const own = !model.canonical_model_id;
      // a free listing (OpenRouter's :free) never stands in for a priced one
      const free = !num(cost.input) && !num(cost.output);
      const was = prices[key];
      if (was && (free || ((original.has(key) || !own) && (was.input || was.output)))) continue;
      prices[key] = { input: num(cost.input) ?? 0, output: num(cost.output) ?? 0, ...(num(model.limit?.context) && { context: model.limit.context }), ...(num(cost.cache_read) !== undefined && { cacheRead: cost.cache_read }), ...(num(cost.cache_write) !== undefined && { cacheWrite: cost.cache_write }) };
      if (own) original.add(key);
    }
  }
  return prices;
}

let asking = null;
/**
 * The prices as last taken ({ syncedAt, prices, error? }), taken again when more than six hours old or when asked
 * (refresh). A failure keeps the last list and says why.
 */
export async function modelsDevPrices({ refresh = false } = {}) {
  const kept = (await readJson(FILE).catch(() => null)) || { syncedAt: null, prices: {} };
  if (!refresh && kept.syncedAt && Date.now() - kept.syncedAt < EVERY) return kept;
  // after a failure, not again for ten minutes unless asked
  if (!refresh && kept.triedAt && Date.now() - kept.triedAt < 10 * 60 * 1000) return kept;
  asking ??= (async () => {
    try {
      const res = await fetch(URL_, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`models.dev answered ${res.status}`);
      if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('models.dev’s list is larger than Spectrum takes');
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new Error('models.dev’s list is larger than Spectrum takes');
      const next = { syncedAt: Date.now(), prices: pricesOf(JSON.parse(text)) };
      await writeJsonAtomic(FILE, next);
      return next;
    } catch (err) {
      const failed = { ...kept, triedAt: Date.now(), error: err.message };
      await writeJsonAtomic(FILE, failed).catch(() => {});
      return failed;
    } finally { asking = null; }
  })();
  return asking;
}
