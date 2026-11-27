// Self-check for Settings › Providers and Settings › Models: the cards and menus come from the settings as they have
// always been stored, and every change is written back in that format. Run:
// npx esbuild apps/frontend/src/app/providerCards.check.ts --bundle --platform=node --format=esm --outfile=/tmp/cards.mjs --loader:.svg=text --loader:.css=empty && node /tmp/cards.mjs
import type { ProviderPreset } from '../api/client';
import { connectPatch, connectionName, connections, contextText, credsPatch, disconnectBlock, disconnectPatch, draftConnection, hiddenPatch, isHidden, mainModelPatch, modelRows, modelUses, ready, roleAt, roleModelPatch, useText } from './providerCards';
import { DEFAULT_SETTINGS, SETTINGS_KEY, cleanHidden, followsMain, llmConfigFor, loadSettings, shownPreset } from './settings';
import type { AppSettings } from './settings';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const model = (id: string, vision = true) => ({ id, label: id.toUpperCase(), note: '', vision, levels: [], effort: 'low' as const });
const preset = (id: string, endpoint: string, hosts: string[], extra: Partial<ProviderPreset> = {}): ProviderPreset => ({
  id, name: id, endpoint, hosts, keyUrl: '', note: '',
  models: [model(`${id}-main`), model(`${id}-fast`), model(`${id}-text`, false)],
  recommended: { main: `${id}-main`, fast: `${id}-fast`, vision: `${id}-main`, references: `${id}-fast` },
  ...extra
});
const OPENAI = 'https://api.openai.com/v1/chat/completions';
const DEEPSEEK = 'https://api.deepseek.com/chat/completions';
const KIMI = 'https://api.moonshot.ai/v1/chat/completions';
const KIMI_CN = 'https://api.moonshot.cn/v1/chat/completions';
const OLLAMA = 'http://localhost:11434';
const providers = [
  preset('openai', OPENAI, ['(^|\\.)api\\.openai\\.com$']),
  preset('deepseek', DEEPSEEK, ['^api\\.deepseek\\.com$']),
  preset('moonshot', KIMI, ['^api\\.moonshot\\.(ai|cn)$'], { regions: [{ label: 'China', endpoint: KIMI_CN }] }),
  preset('ollama', OLLAMA, [':11434$'], { local: true, live: true, models: [], recommended: { main: '', fast: '', vision: '', references: '' } })
];
const at = (patch: Partial<AppSettings>, base: AppSettings = DEFAULT_SETTINGS) => ({ ...base, ...patch });
const cards = (s: AppSettings) => connections(s, providers).map((c) => `${c.at} ${c.id} ${c.uses.join('+')}${c.key ? ' key' : ''}`);

// a fresh Spectrum: OpenAI runs everything and has no key
eq(cards(DEFAULT_SETTINGS), ['main openai main+quick+vision'], 'fresh');
eq(ready(connections(DEFAULT_SETTINGS, providers)[0]), false, 'which can’t answer yet');

// settings as 2.7.0 stored them: DeepSeek main, vision on Kimi's China region with its own key, an OpenAI key and an
// Ollama kept from before, and a Gemini-like entry left without a key by a switch
const old = at({
  llmProvider: 'deepseek', llmEndpoint: DEEPSEEK, llmApiKey: 'sk-deepseek', llmModel: 'deepseek-main', referencesModel: 'deepseek-fast',
  visionProvider: 'moonshot', visionEndpoint: KIMI_CN, visionApiKey: 'sk-kimi-cn', visionModel: 'moonshot-main',
  providerSaved: {
    openai: { key: 'sk-openai', endpoint: OPENAI, model: 'openai-main' },
    ollama: { key: '', endpoint: OLLAMA, model: 'gemma' },
    deepseek: { key: 'sk-stale', endpoint: DEEPSEEK, model: 'deepseek-text' },
    moonshot: { key: '', endpoint: KIMI, model: '' },
    later: { key: 'sk-later', endpoint: 'https://later.example/v1', model: '' }
  }
});
eq(cards(old), ['main deepseek main+quick key', 'vision moonshot vision key', 'saved:openai openai  key', 'saved:ollama ollama '], 'the cards of settings stored before');
const [deepseek, kimi, openai, ollama] = connections(old, providers);
eq(connectionName(kimi), 'moonshot (China)', 'a region in the name');
eq([ready(deepseek), ready(ollama)], [true, true], 'a key, or a server that takes none');

// reading them changes nothing: the stored settings come back as they were, with the new setting at its default
const store = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ ...old, hiddenModels: undefined })]]);
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } } });
eq(loadSettings(), { ...old, hiddenModels: {} }, 'existing settings load unchanged');

// a key typed into a card goes wherever the settings hold that connection, and nowhere else
let s = at(credsPatch(old, providers, deepseek, { key: 'sk-new' }), old);
eq([s.llmApiKey, s.visionApiKey, s.providerSaved.deepseek.key], ['sk-new', 'sk-kimi-cn', 'sk-stale'], 'the main provider’s key');
s = at(credsPatch(old, providers, kimi, { key: 'sk-kimi-2' }), old);
eq([s.llmApiKey, s.visionApiKey, s.providerSaved.moonshot.key], ['sk-deepseek', 'sk-kimi-2', ''], 'a vision model’s own key: the entry for the other region is left');
s = at(credsPatch(old, providers, openai, { key: 'sk-openai-2' }), old);
eq([s.providerSaved.openai, s.llmApiKey], [{ model: 'openai-main', key: 'sk-openai-2', endpoint: OPENAI }, 'sk-deepseek'], 'a provider kept for later');
// the vision model's region changed: its key goes with it, as the old Region menu did
s = at(credsPatch(old, providers, kimi, { endpoint: KIMI }), old);
eq([s.visionEndpoint, s.visionProvider, s.visionApiKey], [KIMI, 'moonshot', 'sk-kimi-cn'], 'a region chosen');
// another provider's address typed into the main card switches to that provider: the key never goes there
s = at(credsPatch(old, providers, deepseek, { endpoint: OPENAI }), old);
eq([s.llmProvider, s.llmEndpoint, s.llmApiKey, s.providerSaved.deepseek.key], ['openai', OPENAI, 'sk-openai', 'sk-deepseek'], 'another provider’s address');

// Connect: the first provider set up takes the main model at once
s = at(connectPatch(DEFAULT_SETTINGS, providers, providers[1]));
eq([s.llmProvider, s.llmEndpoint, s.llmModel, s.referencesModel], ['deepseek', DEEPSEEK, 'deepseek-main', 'deepseek-fast'], 'the first provider runs the main model');
// with a main provider that answers, a provider is a card only, and stored once its key is typed
eq(connectPatch(old, providers, providers[2]), {}, 'nothing is stored before a key');
const fresh = at({ llmProvider: 'deepseek', llmEndpoint: DEEPSEEK, llmApiKey: 'sk-deepseek', llmModel: 'deepseek-main' });
let draft = draftConnection(fresh, providers[0]);
s = at(credsPatch(fresh, providers, draft, { key: 'sk-openai' }), fresh);
eq(s.providerSaved, { openai: { model: '', key: 'sk-openai', endpoint: OPENAI } }, 'a key typed for a new provider');
eq(cards(s), ['main deepseek main+quick+vision key', 'saved:openai openai  key'], 'which is then connected');
// Ollama takes no key, so it is kept at once
s = at(connectPatch(fresh, providers, providers[3]), fresh);
eq(cards(s), ['main deepseek main+quick+vision key', 'saved:ollama ollama '], 'Ollama connected');
// a custom endpoint is kept once it has an address
draft = draftConnection(fresh, null);
s = at(credsPatch(fresh, providers, draft, { key: 'k' }), fresh);
eq([cards(s)[1], ready(connections(s, providers)[1])], ['saved:custom custom  key', false], 'a key typed first is kept, and can’t answer without an address');
s = at(credsPatch(fresh, providers, draft, { endpoint: 'http://localhost:1234/v1' }), fresh);
eq(cards(s), ['main deepseek main+quick+vision key', 'saved:custom custom '], 'a custom endpoint');
eq(ready(connections(s, providers)[1]), true, 'a local server needs no key');

// a second custom endpoint, while the vision model runs on the first: it starts empty and never takes the first's key
let two = at(credsPatch(fresh, providers, draftConnection(fresh, null), { endpoint: 'https://one.example/v1' }), fresh);
two = at(credsPatch(two, providers, connections(two, providers)[1], { key: 'sk-one' }), two);
two = at(roleModelPatch(two, providers, 'vision', connections(two, providers)[1], 'one-vision'), two);
eq(cards(two), ['main deepseek main+quick key', 'vision custom vision key'], 'the vision model on a custom endpoint');
draft = draftConnection(two, null);
eq([draft.endpoint, draft.key], ['', ''], 'another custom endpoint starts empty');
two = at(credsPatch(two, providers, draft, { endpoint: 'http://localhost:1234/v1' }), two);
eq([two.providerSaved.custom, two.visionEndpoint, two.visionApiKey], [{ model: '', key: '', endpoint: 'http://localhost:1234/v1' }, 'https://one.example/v1', 'sk-one'], 'the first’s key stays with the first');
eq(cards(two), ['main deepseek main+quick key', 'vision custom vision key', 'saved:custom custom '], 'two custom endpoints');

// Disconnect waits while a model runs on the provider: no role is left pointing at a provider with no key
eq([disconnectBlock(deepseek), disconnectBlock(kimi), disconnectBlock(openai), disconnectBlock(ollama)],
  ['The main model and quick model run on it. Choose others in Settings › Models first.', 'The vision model runs on it. Choose another in Settings › Models first.', '', ''], 'only a provider no model runs on can be disconnected');
eq(disconnectBlock(connections(DEFAULT_SETTINGS, providers)[0]), 'The main model, quick model and vision model run on it. Choose others in Settings › Models first.', 'a fresh Spectrum’s only provider');
// once the vision model is chosen elsewhere, its old provider can go
eq(connections(at(roleModelPatch(old, providers, 'vision', deepseek, 'deepseek-main'), old), providers).filter((c) => c.id === 'moonshot').map(disconnectBlock), [''], 'after another vision model is chosen');

// a model in use can't be switched off: the three roles, and what the open project's chats chose for themselves
{
  const conns = connections(old, providers);
  const chats = [{ title: 'Tidy the methods', model: 'deepseek-text' }, { title: 'Plot the results', model: 'deepseek-text' }, { title: 'No choice of its own' }, { title: 'Rewrite the intro', model: 'deepseek-main' }];
  const uses = (conn: (typeof conns)[number], list = chats) => [...modelUses(old, conns, conn, list)].map(([model, use]) => `${model}: ${use.role || '-'} ${use.threads.length}`);
  eq(uses(conns[0]), ['deepseek-text: - 2', 'deepseek-main: main 1', 'deepseek-fast: quick 0'], 'the main provider: its roles and the chats’ models');
  eq(uses(conns[1]), ['moonshot-main: vision 0'], 'the vision model’s provider');
  eq([uses(conns[2]), uses(conns[3])], [[], []], 'a provider no model runs on has none in use: a chat’s model is the main provider’s');
  eq(uses(conns[0], []), ['deepseek-main: main 0', 'deepseek-fast: quick 0'], 'without a project open, the roles alone');
  const main = modelUses(old, conns, conns[0], chats);
  eq(useText(main.get('deepseek-text')!), 'In use by 2 threads of this project. Choose another model there before switching this one off.', 'why, for two threads');
  eq(useText(main.get('deepseek-main')!), 'In use as the main model and by the thread “Rewrite the intro”. Choose another model there before switching this one off.', 'why, for a role and a thread');
  eq(useText(main.get('deepseek-fast')!), 'In use as the quick model. Choose another model there before switching this one off.', 'why, for a role');
  // a model that is both the main and the quick model is said once, as the main model
  const both = at({ referencesModel: 'deepseek-main' }, old);
  const bothConns = connections(both, providers);
  eq([...modelUses(both, bothConns, bothConns[0])].map(([m, u]) => `${m}: ${u.role}`), ['deepseek-main: main'], 'one model, two roles');
}

// Disconnect forgets the key wherever it is held
s = at(disconnectPatch(old, providers, openai), old);
eq(['openai' in s.providerSaved, cards(s).length], [false, 3], 'a provider kept for later goes');
s = at(disconnectPatch(old, providers, kimi), old);
eq([s.visionProvider, s.visionEndpoint, s.visionApiKey, s.visionModel, followsMain(s, 'vision')], ['', '', '', 'deepseek-main', true], 'a vision model’s provider: the model goes back to the main provider');
eq(s.providerSaved.moonshot, old.providerSaved.moonshot, 'the entry for its other region stays');
s = at(disconnectPatch(old, providers, deepseek), old);
eq([s.llmProvider, s.llmApiKey, 'deepseek' in s.providerSaved], ['deepseek', '', false], 'the main provider keeps the main model, without a key, and the key does not come back');
eq(llmConfigFor(s, 'main').apiKey, undefined, 'no key is sent');

// Settings › Models: the main model moved to another connection's model is the old Provider menu's switch
s = at(mainModelPatch(old, providers, openai, 'openai-fast'), old);
eq([s.llmProvider, s.llmEndpoint, s.llmApiKey, s.llmModel, s.reasoningEffort], ['openai', OPENAI, 'sk-openai', 'openai-fast', 'default'], 'main model on a kept provider');
eq([s.providerSaved.deepseek, s.referencesModel, s.visionProvider], [{ key: 'sk-deepseek', endpoint: DEEPSEEK, model: 'deepseek-main' }, 'openai-fast', 'moonshot'], 'the old one is kept, a role that follows moves, one set up elsewhere stays');
s = at(mainModelPatch(old, providers, deepseek, 'deepseek-fast'), old);
eq([s.llmProvider, s.llmApiKey, s.llmModel, s.providerSaved], ['deepseek', 'sk-deepseek', 'deepseek-fast', old.providerSaved], 'another model of the same provider is only the model');
// a text-only main model sends images to a model that reads them
s = at(mainModelPatch(fresh, providers, connections(fresh, providers)[0], 'deepseek-text'), fresh);
eq(s.visionModel, 'deepseek-main', 'a text-only main model');

// the quick and vision models
s = at(roleModelPatch(old, providers, 'quick', openai, 'openai-fast'), old);
eq([s.referencesProvider, s.referencesEndpoint, s.referencesApiKey, s.referencesModel], ['openai', OPENAI, 'sk-openai', 'openai-fast'], 'a quick model on another provider takes its address and key');
eq(llmConfigFor(s, 'quick'), { endpoint: OPENAI, apiKey: 'sk-openai', model: 'openai-fast' }, 'and its requests go there');
eq(roleAt(s, connections(s, providers), 'quick').conn.id, 'openai', 'where it runs');
s = at(roleModelPatch(old, providers, 'vision', deepseek, 'deepseek-main'), old);
eq([s.visionProvider, s.visionEndpoint, s.visionApiKey, s.visionModel], ['', '', '', 'deepseek-main'], 'a vision model on the main provider follows it');
eq(s.providerSaved.moonshot, { model: '', key: 'sk-kimi-cn', endpoint: KIMI_CN }, 'the key it leaves is kept for its provider');
s = at(roleModelPatch(old, providers, 'vision', null, ''), old);
eq([followsMain(s, 'vision'), s.visionModel], [true, ''], 'Same as main model');

// the models switched off
eq(cleanHidden({ openai: ['a', 'a', 3, ''], bad: 'x', empty: [], '': ['a'] }), { openai: ['a'] }, 'the list as kept');
eq(cleanHidden(['a']), {}, 'a list is not one');
eq(cleanHidden(null), {}, 'nothing');
s = at(hiddenPatch(old, 'deepseek', 'deepseek-fast', true), old);
eq([s.hiddenModels, isHidden(s, 'deepseek', 'deepseek-fast'), isHidden(s, 'openai', 'deepseek-fast')], [{ deepseek: ['deepseek-fast'] }, true, false], 'a model switched off');
eq(at(hiddenPatch(s, 'deepseek', 'deepseek-fast', false), s).hiddenModels, {}, 'and on again');
// the menus: nothing switched off leaves the provider as it is
eq(shownPreset(providers[1], old) === providers[1], true, 'the default changes nothing');
eq(shownPreset(providers[1], s)!.models.map((m) => m.id), ['deepseek-main', 'deepseek-text'], 'the menus lose it');
eq(shownPreset(providers[1], at({ hiddenModels: { deepseek: ['deepseek-main', 'deepseek-fast'] } }, old))!.models.map((m) => m.id), ['deepseek-main', 'deepseek-text'], 'never the main model');
eq(shownPreset(null, s), null, 'no provider');
// choosing a model for a role switches it back on
eq(at(mainModelPatch(s, providers, deepseek, 'deepseek-fast'), s).hiddenModels, {}, 'a main model chosen is in the menus');
eq(at(roleModelPatch(s, providers, 'quick', deepseek, 'deepseek-fast'), s).hiddenModels, {}, 'and a quick model');

// a provider's rows: Spectrum's own, then what only the provider listed
eq(modelRows(providers[1], ['deepseek-fast', 'deepseek-new']).map((m) => `${m.id}${m.known ? '' : '?'}`), ['deepseek-main', 'deepseek-fast', 'deepseek-text', 'deepseek-new?'], 'rows');
eq(modelRows(null, ['local-7b']).map((m) => m.id), ['local-7b'], 'a custom endpoint has only what it lists');
eq([contextText(128000), contextText(200000), contextText(1000000), contextText(1048576), contextText(undefined), contextText(0)], ['128k', '200k', '1M', '1M', '', ''], 'context in a few characters');

console.log('providerCards.check: ok');
