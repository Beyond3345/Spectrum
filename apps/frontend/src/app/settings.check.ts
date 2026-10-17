// Self-check for where model requests and keys go. Run (it imports React, so bundle it first):
// npx esbuild apps/frontend/src/app/settings.check.ts --bundle --platform=node --log-level=warning | node
import { DEFAULT_SETTINGS, keysBackFromOlder, llmConfigFor, presetForEndpoint, presetPatch, rolePatch, searchProviderPatch, sharedPart, takeInShared, withShared } from './settings';
import { NO_FOLDERS } from './folders';
import type { AppSettings } from './settings';
import type { ProviderPreset } from '../api/client';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const preset = (id: string, endpoint: string, hosts: string[], extra: Partial<ProviderPreset> = {}): ProviderPreset => ({
  id,
  name: id,
  endpoint,
  hosts,
  keyUrl: '',
  note: '',
  models: [{ id: `${id}-main`, label: '', note: '', vision: true, levels: [], effort: 'low' }],
  recommended: { main: `${id}-main`, fast: `${id}-main`, vision: `${id}-main`, references: `${id}-main` },
  ...extra
});
const OPENAI = 'https://api.openai.com/v1/chat/completions';
const DEEPSEEK = 'https://api.deepseek.com/chat/completions';
const KIMI = 'https://api.moonshot.ai/v1/chat/completions';
const KIMI_CN = 'https://api.moonshot.cn/v1/chat/completions';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const QWEN = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const OLLAMA = 'http://localhost:11434';
const providers = [
  preset('openai', OPENAI, ['(^|\\.)api\\.openai\\.com$']),
  preset('deepseek', DEEPSEEK, ['^api\\.deepseek\\.com$']),
  preset('moonshot', KIMI, ['^api\\.moonshot\\.(ai|cn)$'], { regions: [{ label: 'China', endpoint: KIMI_CN }] }),
  preset('gemini', GEMINI, ['^generativelanguage\\.googleapis\\.com$']),
  preset('qwen', QWEN, ['(^|\\.)dashscope(-intl|-us)?\\.aliyuncs\\.com$', '\\.maas\\.aliyuncs\\.com$']),
  preset('ollama', OLLAMA, [':11434$'], { local: true, live: true })
];
const at = (patch: Partial<AppSettings>, base: AppSettings = { ...DEFAULT_SETTINGS, llmProvider: 'openai', llmApiKey: 'sk-openai' }) => ({ ...base, ...patch });

// typing another provider's address switches to it: the OpenAI key stays behind, saved
let s = at(presetPatch(at({}), providers, presetForEndpoint(providers, DEEPSEEK), DEEPSEEK));
eq([s.llmProvider, s.llmEndpoint, s.llmApiKey], ['deepseek', DEEPSEEK, ''], 'typed DeepSeek address');
eq(llmConfigFor(s, 'main').apiKey, undefined, 'no key goes to DeepSeek');
eq(at(presetPatch(s, providers, providers[0]), s).llmApiKey, 'sk-openai', 'switching back restores the OpenAI key');

// a Qwen workspace address belongs to Qwen, as the backend sees it
eq(presetForEndpoint(providers, 'https://ws1.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')?.id, 'qwen', 'workspace host');
// Ollama is known by its port, on any computer
eq(presetForEndpoint(providers, 'http://192.168.1.20:11434')?.id, 'ollama', 'Ollama on the network');
eq(presetForEndpoint(providers, 'http://localhost:1234/v1')?.id, undefined, 'LM Studio stays Other');

// a key typed for an address under Other never follows it into the local Ollama, which has no key field
const other = at({ llmProvider: 'custom', llmEndpoint: OLLAMA, llmApiKey: 'sk-local' });
const o = at(presetPatch(other, providers, providers[5]), other);
eq([o.llmProvider, o.llmEndpoint, o.llmApiKey], ['ollama', OLLAMA, ''], 'Ollama starts without a key');
eq(at(rolePatch(other, providers, 'quick', 'ollama'), other).referencesApiKey, '', 'nor does a quick model there');

// the main model borrows a quick or vision key only with that model's own region
let v = at(rolePatch(at({}), providers, 'vision', 'moonshot'));
v = at({ visionEndpoint: KIMI_CN, visionApiKey: 'sk-kimi-cn' }, v);
s = at(presetPatch(v, providers, providers[2]), v);
eq([s.llmEndpoint, s.llmApiKey], [KIMI_CN, 'sk-kimi-cn'], 'China key comes with the China endpoint');

// Other gets a key only together with the address it was entered for
v = at({ referencesProvider: 'custom', referencesEndpoint: 'https://api.together.xyz/v1', referencesApiKey: 'tog', referencesModel: 'llama' });
s = at(presetPatch(v, providers, null), v);
eq([s.llmEndpoint, s.llmApiKey], ['https://api.together.xyz/v1', 'tog'], 'Other uses the quick model address and key');
s = at(presetPatch(at({}), providers, null));
eq([s.llmEndpoint, s.llmApiKey], ['', ''], 'Other with nothing known starts empty');

// a role's key is kept when it moves to another provider and back
v = at(rolePatch(at({}), providers, 'vision', 'gemini'));
v = at({ visionApiKey: 'g-key' }, v);
v = at(rolePatch(v, providers, 'vision', 'deepseek'), v);
eq(v.visionApiKey, '', 'DeepSeek starts without a key');
v = at(rolePatch(v, providers, 'vision', 'gemini'), v);
eq([v.visionEndpoint, v.visionApiKey], [GEMINI, 'g-key'], 'Gemini key comes back');

// llmConfigFor: a role never sends the main key or model name to another host
v = at({ visionProvider: 'gemini', visionEndpoint: GEMINI, visionApiKey: '', visionModel: '' });
eq(llmConfigFor(v, 'vision'), { endpoint: GEMINI, model: '' }, 'no main key or model for Gemini');
v = at({ providerSaved: { gemini: { key: 'g-saved', endpoint: GEMINI, model: '' } } }, v);
eq(llmConfigFor(v, 'vision').apiKey, 'g-saved', 'a key saved for that host is used');
v = at({ referencesProvider: 'custom', referencesEndpoint: '', referencesApiKey: 'local', referencesModel: 'llama' });
eq(llmConfigFor(v, 'quick'), llmConfigFor(v, 'main'), 'Other without an address stays on the main model');
v = at({ referencesModel: 'gpt-6-luna' });
eq(llmConfigFor(v, 'quick'), { endpoint: OPENAI, apiKey: 'sk-openai', model: 'gpt-6-luna' }, 'following the main provider');

// a search key only goes to the provider it was entered for, and comes back with it
let w = at({ searchProvider: 'serpapi', searchProviderKey: 'serp-key' });
w = at(searchProviderPatch(w, 'exa'), w);
eq([w.searchProvider, w.searchProviderKey], ['exa', ''], 'Exa starts without the SerpApi key');
w = at({ searchProviderKey: 'exa-key' }, w);
w = at(searchProviderPatch(w, 'serpapi'), w);
eq([w.searchProviderKey, w.searchProviderKeys.exa], ['serp-key', 'exa-key'], 'switching back restores the SerpApi key');

// what follows the user to the other computer: never a key, an endpoint, a path or the window's look
const mine = at({
  theme: 'dark',
  spellCheck: false,
  llmEndpoint: DEEPSEEK,
  providerSaved: { openai: { key: 'sk-openai', endpoint: OPENAI, model: '' } },
  parserSaved: { mineru: { endpoint: '', key: 'mineru-token' } },
  visionApiKey: 'v-key',
  referencesApiKey: 'q-key',
  searchApiKey: 's-key',
  searchProviderKey: 'serp-key',
  searchProviderKeys: { exa: 'exa-key' },
  projectsDir: '/Users/me/Spectrum',
  glass: true,
  editorFont: 'menlo',
  compileEngine: 'tectonic',
  cloudMode: 'move'
});
const sent = JSON.stringify(sharedPart(mine));
for (const secret of ['sk-openai', 'mineru-token', 'v-key', 'q-key', 's-key', 'serp-key', 'exa-key', '/Users/me', DEEPSEEK, 'menlo', 'tectonic', 'glass', 'syncSettings', 'cloudMode']) {
  if (sent.includes(secret)) throw new Error(`shared settings hold ${secret}`);
}
eq([sharedPart(mine).theme, sharedPart(mine).spellCheck], ['dark', false], 'theme and spelling are shared');
// taken in on a computer with its own keys, folder and window: those stay, and nothing else rides along
const theirs = at({ llmApiKey: 'sk-windows', projectsDir: 'C:\\Users\\me\\Spectrum', glass: false, syncSettings: false, editorFontSize: 13 });
const merged = withShared(theirs, { ...sharedPart(mine), editorFontSize: 99, llmApiKey: 'stolen', projectsDir: '/elsewhere' });
eq([merged.theme, merged.spellCheck, merged.editorFontSize], ['dark', false, 99], 'shared settings come in');
eq([merged.llmApiKey, merged.projectsDir, merged.glass, merged.syncSettings], ['sk-windows', theirs.projectsDir, false, false], 'this computer’s own stay');
eq(withShared(theirs, { accent: 'neon' }).accent, 'system', 'shared values are checked like stored ones');
eq(withShared(theirs, { syncHighlightSeconds: 60 }).syncHighlightSeconds, 10, 'and kept in range');

// the folders on the Projects page follow the user, checked like stored ones; what Sync to does stays on each computer
const tree = { folders: [{ id: 'f1', name: 'Thesis', parent: null }], placement: { p1: 'f1', p2: 'deleted' } };
const sorted = withShared(theirs, { projectFolders: tree, cloudMode: 'move' });
eq(sorted.projectFolders, { folders: tree.folders, placement: { p1: 'f1' } }, 'the folders come in, checked');
eq(sorted.cloudMode, 'mirror', 'Sync to’s choice stays');
eq(withShared(at({ cloudMode: 'sideways' as AppSettings['cloudMode'], projectFolders: 'junk' as never }), {}), at({}), 'an unknown choice is Mirror, and junk no folders');

// the Mac went dark since the PC last shared, then the PC changed its font size: both changes stay, and the PC's
// old theme doesn't go back to the Mac
const pcSent = JSON.stringify(sharedPart(at({ theme: 'light', editorFontSize: 13 })));
const pcNow = at({ theme: 'light', editorFontSize: 15 });
const both = takeInShared(pcNow, sharedPart(at({ theme: 'dark', editorFontSize: 13 })), pcSent);
eq([both.theme, both.editorFontSize, both.llmApiKey], ['dark', 15, 'sk-openai'], 'a newer change from the other computer under one made here');
eq(takeInShared(pcNow, { theme: 'dark' }, '').theme, 'light', 'never shared: this computer’s own stay');

// a folder tree this computer never shared (it just joined, or came from 1.8.0, whose sent has no tree) joins the
// other's, so neither empties the other's when it shares next
const macTree = { folders: [{ id: 'a', name: 'Drafts', parent: null }], placement: { alpha: 'a' } };
const pcTree = { folders: [{ id: 'b', name: 'Papers', parent: null }], placement: { beta: 'b' } };
eq(takeInShared(at({}), sharedPart(at({ projectFolders: macTree })), '').projectFolders, macTree, 'a computer just joined takes the tree in');
const sent18 = JSON.stringify({ ...sharedPart(at({ projectFolders: pcTree })), projectFolders: undefined });
const joined = takeInShared(at({ projectFolders: pcTree }), sharedPart(at({ projectFolders: macTree })), sent18);
eq(joined.projectFolders, { folders: [...macTree.folders, ...pcTree.folders], placement: { beta: 'b', alpha: 'a' } }, 'one with its own joins them');
// and the computer that shared its tree before takes the joined one in, a later change of its own still going across
eq(takeInShared(at({ projectFolders: macTree }), sharedPart(joined), JSON.stringify(sharedPart(at({ projectFolders: macTree })))).projectFolders, joined.projectFolders, 'the joined tree goes back');
eq(takeInShared(joined, sharedPart(at({})), JSON.stringify(sharedPart(joined))).projectFolders, NO_FOLDERS, 'emptied there: emptied here');
eq(takeInShared(at({}), sharedPart(joined), JSON.stringify(sharedPart(at({ projectFolders: macTree })))).projectFolders, NO_FOLDERS, 'emptied here: stays empty');

// back from 1.8.0, which last took in the Mac's file and shared without the tree: the Mac's tree, never the old one here
const macFile = { updatedAt: '2026-10-02T00:00:00.000Z', machineName: 'Mac', settings: sharedPart(at({ projectFolders: macTree })) };
const back = keysBackFromOlder(at({ projectFolders: pcTree }), macFile, macFile.updatedAt, sent18);
eq(back?.settings.projectFolders, macTree, 'the newer file’s tree comes in');
eq(back && JSON.parse(back.sent).projectFolders, macTree, 'and counts as shared');
eq(keysBackFromOlder(at({ projectFolders: pcTree }), macFile, '2026-10-03T00:00:00.000Z', sent18), null, 'shared since: its own tree goes');
eq(keysBackFromOlder(at({ projectFolders: pcTree }), macFile, macFile.updatedAt, JSON.stringify(sharedPart(at({ projectFolders: pcTree })))), null, 'nothing missing');

console.log('settings.check: ok');
