// Self-check for the API keys moved out of the window's storage. Run:
// npx esbuild apps/frontend/src/app/keys.check.ts --bundle --platform=node --format=esm --outfile=/tmp/keys.mjs --loader:.svg=text --loader:.css=empty && node /tmp/keys.mjs
import { ApiError } from '../api/client';
import { isKeyRef, keyFailure, keysIn, mapKeys, moveKeys } from './keys';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings } from './settings';
import type { AppSettings } from './settings';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  addEventListener: () => undefined,
  dispatchEvent: () => true,
  setTimeout,
  clearTimeout
} });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { dataset: {} } } });

const REF = (n: number) => `spectrum-key:${String(n).padStart(32, '0')}`;
const typed: Partial<AppSettings> = {
  llmApiKey: 'sk-main',
  searchApiKey: 'sk-search',
  visionApiKey: 'sk-vision',
  referencesApiKey: 'sk-quick',
  searchProviderKey: 'tvly-default',
  searchProviderKeys: { serpapi: 'serp-key', brave: '' },
  ncbiKey: 'ncbi-key',
  providerSaved: { openai: { key: 'sk-main', endpoint: 'https://api.openai.com/v1', model: 'm' }, kimi: { key: REF(7), endpoint: 'https://api.moonshot.ai/v1', model: 'k' } },
  parserSaved: { mathpix: { endpoint: '', key: 'mathpix-key', appId: 'app-id-not-a-secret' } }
};

// every field of the settings that holds a key is one mapKeys reaches: a key field added later without it fails here
const reached = new Set<string>();
mapKeys({ ...DEFAULT_SETTINGS, ...typed }, (key) => (reached.add(key), key));
const everyKey = Object.entries({ ...DEFAULT_SETTINGS, ...typed }).filter(([name, value]) => /key$/i.test(name) && typeof value === 'string' && value).map(([, value]) => value as string);
for (const key of everyKey) if (!reached.has(key)) throw new Error(`mapKeys misses ${key}`);
eq(keysIn({ ...DEFAULT_SETTINGS, ...typed }), {
  plain: ['sk-main', 'sk-search', 'sk-vision', 'sk-quick', 'tvly-default', 'ncbi-key', 'serp-key', 'mathpix-key'],
  refs: [REF(7)]
}, 'the keys typed out and the references held');
eq(isKeyRef(REF(1)), true, 'a reference');
eq(isKeyRef(`${REF(1)} `), false, 'not quite one');

// moved: references in their place, nothing typed out left in storage, the app ID left as it is
store.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...typed }));
let offered: [string[], string[]] | null = null;
await moveKeys(async (values, keep) => {
  offered = [values, keep];
  // a key typed meanwhile keeps its new value
  store.set(SETTINGS_KEY, JSON.stringify({ ...JSON.parse(store.get(SETTINGS_KEY)!), ncbiKey: 'ncbi-new' }));
  return { ok: true, refs: values.map((_, i) => REF(100 + i)) };
});
eq(offered, [keysIn({ ...DEFAULT_SETTINGS, ...typed }).plain, [REF(7)]], 'what was offered');
const after = loadSettings();
eq([after.llmApiKey, after.providerSaved.openai.key, after.searchProviderKeys.serpapi, after.parserSaved.mathpix.key, after.parserSaved.mathpix.appId], [REF(100), REF(100), REF(106), REF(107), 'app-id-not-a-secret'], 'references in place');
eq(after.ncbiKey, 'ncbi-new', 'a key changed during the move');
for (const key of keysIn({ ...DEFAULT_SETTINGS, ...typed }).plain) if (key !== 'ncbi-key' && store.get(SETTINGS_KEY)!.includes(`"${key}"`)) throw new Error(`${key} still stored`);

// the keychain refusing: the keys stay, working as before, Settings says why, and the same keys aren't offered again
store.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, llmApiKey: 'sk-stays' }));
let asked = 0;
const refuse = async () => {
  asked += 1;
  throw new ApiError('Spectrum couldn’t save keys in the keychain: User interaction is not allowed.', 503, { code: 'keychain' });
};
await moveKeys(refuse);
await moveKeys(refuse);
eq([loadSettings().llmApiKey, asked], ['sk-stays', 1], 'refused once, kept');
eq(keyFailure(), 'Spectrum couldn’t save keys in the keychain: User interaction is not allowed.', 'the reason shown');
// a new key typed is offered again
store.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, llmApiKey: 'sk-other' }));
await moveKeys(async (values) => ({ ok: true, refs: values.map(() => REF(9)) }));
eq([loadSettings().llmApiKey, keyFailure()], [REF(9), ''], 'moved after all');

// the backend not answering yet isn't a refusal
store.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, llmApiKey: 'sk-later' }));
await moveKeys(async () => {
  throw new Error('Spectrum’s server didn’t answer.');
});
eq([loadSettings().llmApiKey, keyFailure()], ['sk-later', ''], 'tried again later');

console.log('keys.check: ok');
