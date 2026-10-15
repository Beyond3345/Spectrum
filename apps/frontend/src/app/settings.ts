import { useEffect, useState, useSyncExternalStore } from 'react';
import { listProviders } from '../api/client';
import type { CompileEngine, EffortLevel, LLMConfig, OxfordComma, ProviderModel, ProviderPreset, ReasoningEffort, SearchProvider } from '../api/client';
import { setNativeTheme } from './desktop';

export { IS_DESKTOP } from './desktop';

export type Theme = 'system' | 'light' | 'dark';
/** 'system' follows the macOS accent colour */
export type Accent = 'system' | 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'graphite' | 'custom';
export type PdfPageLight = 'white' | 'cream' | 'sepia' | 'grey';
export type PdfPageDark = 'dark' | 'black' | 'dimmed' | 'white';
/** The colours an editor theme sets, each of which can be changed on its own in Settings. */
export type EditorColourRole = 'bg' | 'fg' | 'gutter' | 'activeLine' | 'selection' | 'cursor' | 'command' | 'comment' | 'bracket' | 'math' | 'arg' | 'env';
export type EditorColours = Partial<Record<EditorColourRole, string>>;
/** the highlight left after a jump between the source and the PDF */
export type SyncHighlight = 'accent' | 'yellow' | 'green' | 'pink' | 'blue' | 'custom';

const ACCENTS: Accent[] = ['system', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'graphite', 'custom'];
const HEX = /^#[0-9a-f]{6}$/i;

export type AppSettings = {
  theme: Theme;
  accent: Accent;
  /** '#rrggbb' for the Custom accent */
  accentCustom: string;
  /** see-through window (Liquid Glass on macOS 26 and later, vibrancy before) */
  glass: boolean;
  /** 0 = least see-through, 100 = clearest */
  glassClarity: number;
  /** PDF page colour in light mode and in dark mode */
  pdfPageLight: PdfPageLight;
  pdfPageDark: PdfPageDark;
  /** editor font id (a system or bundled font), or 'custom' for editorFontCustom */
  editorFont: string;
  /** the name of an installed font, used when editorFont is 'custom' */
  editorFontCustom: string;
  /** editor theme ids for each mode, picked separately so any light theme goes with any dark one */
  editorThemeLight: string;
  editorThemeDark: string;
  /** colours changed from the chosen theme, per mode */
  editorColours: { light: EditorColours; dark: EditorColours };
  /** preset id from Settings → Template transfer */
  parser: string;
  /** each parser's endpoint ('' = the preset's own) and key, kept when switching between them */
  parserSaved: Record<string, { endpoint: string; key: string; appId?: string }>;
  /** the API a custom parser speaks (a preset id) */
  parserProtocol: string;
  /** preset id from Settings → Models, 'custom', or '' to work it out from the endpoint */
  llmProvider: string;
  /** each provider's key, endpoint and model, kept when switching between them */
  providerSaved: Record<string, { key: string; endpoint: string; model: string }>;
  llmEndpoint: string;
  llmApiKey: string;
  llmModel: string;
  reasoningEffort: ReasoningEffort;
  searchEndpoint: string;
  searchApiKey: string;
  searchModel: string;
  /** '' = the main model's provider (its endpoint and key), otherwise a preset id or 'custom' */
  visionProvider: string;
  visionEndpoint: string;
  visionApiKey: string;
  visionModel: string;
  // the quick model (autocomplete, pasted references); named for its first use
  referencesProvider: string;
  referencesEndpoint: string;
  referencesApiKey: string;
  referencesModel: string;
  autoInsertCite: boolean;
  compileEngine: CompileEngine;
  editorFontSize: number;
  /** parent folder for new projects; '' = the backend default (~/Documents/Spectrum) */
  projectsDir: string;
  searchProvider: SearchProvider;
  searchProviderKey: string;
  serpEngine: 'google' | 'google_scholar' | 'baidu';
  /** shortcut id → key, only for the ones changed in Settings ('' = removed) */
  shortcuts: Record<string, string>;
  /** spell checking as you type, in Australian English */
  spellCheck: boolean;
  /** Harper's style suggestions (long sentences, wordiness, readability) besides grammar */
  grammarStyle: boolean;
  /** the serial comma: flag it (Australian Government style), require it, or leave it */
  oxfordComma: OxfordComma;
  /** a double-click in the source or the PDF jumps to the same place in the other (SyncTeX) */
  syncDoubleClick: boolean;
  syncHighlightColour: SyncHighlight;
  /** '#rrggbb' for the Custom highlight */
  syncHighlightCustom: string;
  /** how long the highlight stays before it fades, 1 to 10 */
  syncHighlightSeconds: number;
};

export const SETTINGS_KEY = 'spectrum-settings-v1';
/** Fired on window after every settings write; read the new values with loadSettings(). */
export const SETTINGS_CHANGE_EVENT = 'spectrum-settings-change';
const CHANGE_EVENT = SETTINGS_CHANGE_EVENT;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  accent: 'system',
  accentCustom: '#0a84ff',
  glass: false,
  glassClarity: 50,
  pdfPageLight: 'white',
  pdfPageDark: 'dark',
  editorFont: 'system',
  editorFontCustom: '',
  editorThemeLight: 'spectrum-light',
  editorThemeDark: 'spectrum-dark',
  editorColours: { light: {}, dark: {} },
  parser: 'mineru',
  parserSaved: {},
  parserProtocol: 'mineru',
  llmProvider: '',
  providerSaved: {},
  llmEndpoint: 'https://api.openai.com/v1/chat/completions',
  llmApiKey: '',
  llmModel: 'gpt-6-sol',
  reasoningEffort: 'default',
  searchEndpoint: '',
  searchApiKey: '',
  searchModel: '',
  visionProvider: '',
  visionEndpoint: '',
  visionApiKey: '',
  visionModel: '',
  referencesProvider: '',
  referencesEndpoint: '',
  referencesApiKey: '',
  // the OpenAI preset's quick model, to match the default main model
  referencesModel: 'gpt-6-luna',
  autoInsertCite: true,
  compileEngine: 'pdflatex',
  editorFontSize: 13,
  projectsDir: '',
  searchProvider: 'llm',
  searchProviderKey: '',
  serpEngine: 'google',
  shortcuts: {},
  spellCheck: true,
  grammarStyle: false,
  oxfordComma: 'avoid',
  syncDoubleClick: true,
  syncHighlightColour: 'yellow',
  syncHighlightCustom: '#ffd60a',
  syncHighlightSeconds: 3
};

export const SYNC_HIGHLIGHTS: [SyncHighlight, string][] = [
  ['accent', 'Accent colour'],
  ['yellow', 'Yellow'],
  ['green', 'Green'],
  ['pink', 'Pink'],
  ['blue', 'Blue'],
  ['custom', 'Custom']
];

export const COMPILE_ENGINES: [CompileEngine, string][] = [
  ['auto', 'Auto'],
  ['pdflatex', 'pdfLaTeX'],
  ['xelatex', 'XeLaTeX'],
  ['lualatex', 'LuaLaTeX'],
  ['latexmk', 'Latexmk'],
  ['tectonic', 'Tectonic']
];

export const REASONING_EFFORTS: [ReasoningEffort, string][] = [
  ['default', 'Recommended'],
  ['none', 'Off'],
  ['minimal', 'Minimal'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['xhigh', 'Extra high'],
  ['max', 'Max']
];

const effortLabel = (level: ReasoningEffort) => REASONING_EFFORTS.find(([value]) => value === level)?.[1] || level;

/** Effort choices for a model: the levels it accepts, or all of them for a model Spectrum doesn't know. */
export function effortOptions(model: ProviderModel | null): [ReasoningEffort, string][] {
  if (!model) return [['default', 'Provider default'], ...REASONING_EFFORTS.slice(1)];
  if (!model.levels.length) return [['default', 'Set by the model']];
  return [['default', `Recommended (${effortLabel(model.effort)})`], ...model.levels.map((level): [EffortLevel, string] => [level, effortLabel(level)])];
}

function parse(raw: string | null): AppSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const { ngrokToken: _dropped, mineruApiBase, mineruToken, ...parsed } = JSON.parse(raw) as Partial<AppSettings> & {
      ngrokToken?: string;
      mineruApiBase?: string;
      mineruToken?: string;
    };
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    if (!COMPILE_ENGINES.some(([value]) => value === merged.compileEngine)) merged.compileEngine = DEFAULT_SETTINGS.compileEngine;
    if (!['system', 'light', 'dark'].includes(merged.theme)) merged.theme = 'system';
    if (!REASONING_EFFORTS.some(([value]) => value === merged.reasoningEffort)) merged.reasoningEffort = 'default';
    if (!Number.isFinite(merged.editorFontSize)) merged.editorFontSize = DEFAULT_SETTINGS.editorFontSize;
    if (typeof merged.shortcuts !== 'object' || !merged.shortcuts) merged.shortcuts = {};
    if (typeof merged.providerSaved !== 'object' || !merged.providerSaved) merged.providerSaved = {};
    if (!['avoid', 'require', 'off'].includes(merged.oxfordComma)) merged.oxfordComma = 'avoid';
    if (!ACCENTS.includes(merged.accent)) merged.accent = 'system';
    if (typeof merged.accentCustom !== 'string' || !HEX.test(merged.accentCustom)) merged.accentCustom = DEFAULT_SETTINGS.accentCustom;
    merged.glass = merged.glass === true;
    if (!Number.isFinite(merged.glassClarity)) merged.glassClarity = DEFAULT_SETTINGS.glassClarity;
    merged.glassClarity = Math.min(100, Math.max(0, merged.glassClarity));
    if (!['white', 'cream', 'sepia', 'grey'].includes(merged.pdfPageLight)) merged.pdfPageLight = 'white';
    if (!['dark', 'black', 'dimmed', 'white'].includes(merged.pdfPageDark)) merged.pdfPageDark = 'dark';
    merged.syncDoubleClick = merged.syncDoubleClick !== false;
    if (!SYNC_HIGHLIGHTS.some(([value]) => value === merged.syncHighlightColour)) merged.syncHighlightColour = DEFAULT_SETTINGS.syncHighlightColour;
    if (typeof merged.syncHighlightCustom !== 'string' || !HEX.test(merged.syncHighlightCustom)) merged.syncHighlightCustom = DEFAULT_SETTINGS.syncHighlightCustom;
    if (!Number.isFinite(merged.syncHighlightSeconds)) merged.syncHighlightSeconds = DEFAULT_SETTINGS.syncHighlightSeconds;
    merged.syncHighlightSeconds = Math.min(10, Math.max(1, Math.round(merged.syncHighlightSeconds)));
    for (const key of ['editorFont', 'editorFontCustom', 'editorThemeLight', 'editorThemeDark', 'parser', 'parserProtocol'] as const) {
      if (typeof merged[key] !== 'string') merged[key] = DEFAULT_SETTINGS[key];
    }
    const colours = (value: unknown): EditorColours =>
      Object.fromEntries(
        Object.entries(typeof value === 'object' && value ? value : {}).filter(([, colour]) => typeof colour === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(colour))
      );
    merged.editorColours = { light: colours(merged.editorColours?.light), dark: colours(merged.editorColours?.dark) };
    if (typeof merged.parserSaved !== 'object' || !merged.parserSaved) merged.parserSaved = {};
    // 1.1 kept one MinerU address and token; they become the MinerU preset's saved values
    if ((mineruApiBase || mineruToken) && !merged.parserSaved.mineru) {
      merged.parserSaved = { ...merged.parserSaved, mineru: { endpoint: mineruApiBase || '', key: mineruToken || '' } };
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function readRaw() {
  try {
    return window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    return null;
  }
}

// cached so useSyncExternalStore gets a stable object until the stored JSON changes
let cachedRaw: string | null | undefined;
let cached = DEFAULT_SETTINGS;

export function loadSettings(): AppSettings {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

export function persistSettings(settings: AppSettings) {
  const previous = loadSettings();
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private window): nothing to keep the change in
  }
  if (previous.theme !== settings.theme) applyTheme(settings.theme);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Forces light/dark on <html> (System removes the override) and tells the native window. */
export function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  setNativeTheme(theme);
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Live settings shared by every page; the setter takes a partial update. */
export function useSettings(): [AppSettings, (patch: Partial<AppSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, loadSettings);
  return [settings, updateSettings];
}

export function updateSettings(patch: Partial<AppSettings>) {
  persistSettings({ ...loadSettings(), ...patch });
}

export type LLMPurpose = 'main' | 'search' | 'vision' | 'quick';

/** Endpoint/key/model for a purpose, falling back to the main LLM settings. */
export function llmConfigFor(settings: AppSettings, purpose: LLMPurpose): Partial<LLMConfig> {
  const main = { endpoint: settings.llmEndpoint, apiKey: settings.llmApiKey || undefined, model: settings.llmModel };
  if (purpose === 'main') return main;
  const [endpoint, apiKey, model] =
    purpose === 'search'
      ? [settings.searchEndpoint, settings.searchApiKey, settings.searchModel]
      : purpose === 'vision'
        ? [settings.visionEndpoint, settings.visionApiKey, settings.visionModel]
        : [settings.referencesEndpoint, settings.referencesApiKey, settings.referencesModel];
  if (!endpoint) {
    // a role moved to Other that has no address yet stays on the main model until it has one
    if (purpose !== 'search' && !followsMain(settings, purpose)) return main;
    // otherwise the main model's provider and key, with its own model if it has one
    return { ...main, model: model || main.model };
  }
  const sameHost = hostOf(endpoint) === hostOf(main.endpoint);
  return {
    endpoint,
    // a key only ever goes to the host it was entered for
    apiKey: apiKey || (sameHost ? main.apiKey : savedKeyFor(settings, endpoint)) || undefined,
    // another provider has no use for the main model's name; the backend picks its recommended one
    model: model || (sameHost ? main.model : '')
  };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

type Known = { key: string; endpoint: string };

/** A key saved for this exact host, from when its provider was the main one or had a quick or vision key. */
function savedKeyFor(settings: AppSettings, endpoint: string) {
  return Object.values(settings.providerSaved).find((s) => s.key && hostOf(s.endpoint) === hostOf(endpoint))?.key;
}

export type ModelRole = 'quick' | 'vision';

/** The settings behind each role's model, and the preset recommendation that fills it. */
export const ROLE_FIELDS = {
  quick: { provider: 'referencesProvider', endpoint: 'referencesEndpoint', apiKey: 'referencesApiKey', model: 'referencesModel', recommended: 'references' },
  vision: { provider: 'visionProvider', endpoint: 'visionEndpoint', apiKey: 'visionApiKey', model: 'visionModel', recommended: 'vision' }
} as const;

const ROLES = ['quick', 'vision'] as const;

/** True when a role uses the main model's provider, so it follows the main provider when that changes. */
export function followsMain(settings: AppSettings, role: ModelRole) {
  const f = ROLE_FIELDS[role];
  return !settings[f.provider] && !settings[f.endpoint];
}

/** The preset an endpoint belongs to, matched the way the backend matches it (so Qwen workspaces count). */
export function presetForEndpoint(providers: ProviderPreset[], endpoint: string) {
  let host = '';
  try {
    host = new URL(endpoint).hostname;
  } catch {
    return null;
  }
  return providers.find((p) => p.hosts.some((source) => new RegExp(source).test(host))) || null;
}

/** The chosen preset, or null for Custom. Settings saved before presets existed are matched by host. */
export function presetOf(providers: ProviderPreset[], settings: AppSettings) {
  if (settings.llmProvider) return providers.find((p) => p.id === settings.llmProvider) || null;
  return presetForEndpoint(providers, settings.llmEndpoint);
}

/** A role's own preset (null for Other), or the main one while it follows the main provider. */
export function rolePresetOf(providers: ProviderPreset[], settings: AppSettings, role: ModelRole) {
  const f = ROLE_FIELDS[role];
  if (followsMain(settings, role)) return presetOf(providers, settings);
  const id = settings[f.provider];
  if (id) return providers.find((p) => p.id === id) || null;
  // saved before roles had a provider: work it out from the endpoint
  return presetForEndpoint(providers, settings[f.endpoint]);
}

export function modelOf(preset: ProviderPreset | null, id: string) {
  return preset?.models.find((m) => m.id === id) || null;
}

/** The model a preset recommends for a role; for vision always one that reads images. */
export function recommendedFor(preset: ProviderPreset | null, role: ModelRole) {
  if (!preset) return '';
  const id = preset.recommended[ROLE_FIELDS[role].recommended];
  if (role === 'quick' || modelOf(preset, id)?.vision) return id;
  return preset.models.find((m) => m.vision)?.id || '';
}

/** Every key known for a provider, each with the endpoint it was entered for. */
function knownKeys(settings: AppSettings, saved: AppSettings['providerSaved'], id: string, mainId: string): Known[] {
  return [
    mainId === id ? { key: settings.llmApiKey, endpoint: settings.llmEndpoint } : undefined,
    saved[id],
    ...ROLES.map((r) => ROLE_FIELDS[r]).filter((f) => settings[f.provider] === id).map((f) => ({ key: settings[f.apiKey], endpoint: settings[f.endpoint] }))
  ].filter((k): k is Known => !!k?.key && !!k.endpoint);
}

/**
 * Where a provider's requests go and with which key: a preset goes back to the region a known key
 * was entered for (or its own endpoint), Other to the last address used. The key is only one entered
 * for that same host, so a key never reaches another provider.
 */
function endpointAndKey(known: Known[], next: ProviderPreset | null, typed?: string) {
  const own = next ? [next.endpoint, ...(next.regions || []).map((r) => r.endpoint)] : [];
  const endpoint = typed ?? (next ? known.find((k) => own.includes(k.endpoint))?.endpoint || next.endpoint : known[0]?.endpoint || '');
  return { endpoint, key: known.find((k) => hostOf(k.endpoint) === hostOf(endpoint))?.key || '' };
}

/** The key a role leaves behind is kept for its provider, without touching the main model saved there. */
function keepRoleKey(settings: AppSettings, providers: ProviderPreset[], role: ModelRole) {
  const f = ROLE_FIELDS[role];
  if (followsMain(settings, role) || !settings[f.apiKey] || !settings[f.endpoint]) return settings.providerSaved;
  const id = rolePresetOf(providers, settings, role)?.id || 'custom';
  return { ...settings.providerSaved, [id]: { model: settings.providerSaved[id]?.model || '', key: settings[f.apiKey], endpoint: settings[f.endpoint] } };
}

/** Points a role at a provider: 'same' (the main model's), a preset id or 'custom'. */
export function rolePatch(settings: AppSettings, providers: ProviderPreset[], role: ModelRole, id: string): Partial<AppSettings> {
  const f = ROLE_FIELDS[role];
  const providerSaved = keepRoleKey(settings, providers, role);
  if (id === 'same') return { providerSaved, [f.provider]: '', [f.endpoint]: '', [f.apiKey]: '', [f.model]: recommendedFor(presetOf(providers, settings), role) };
  const next = providers.find((p) => p.id === id) || null;
  const known = knownKeys(settings, providerSaved, next ? id : 'custom', presetOf(providers, settings)?.id || 'custom');
  const { endpoint, key } = endpointAndKey(known, next);
  return { providerSaved, [f.provider]: next ? id : 'custom', [f.endpoint]: endpoint, [f.apiKey]: key, [f.model]: next ? recommendedFor(next, role) : '' };
}

let providersRequest: Promise<ProviderPreset[]> | null = null;

/** The provider presets, fetched once per launch; empty until they arrive. */
export function useProviders() {
  const [providers, setProviders] = useState<ProviderPreset[]>([]);
  useEffect(() => {
    providersRequest ??= listProviders()
      .then((res) => res.providers)
      .catch(() => {
        providersRequest = null;
        return [];
      });
    let live = true;
    providersRequest.then((list) => live && setProviders(list));
    return () => {
      live = false;
    };
  }, []);
  return providers;
}

/**
 * Switches the main provider: back to what was last used with it, or to its endpoint, recommended
 * models and effort. `typed` is an address typed into Endpoint, which is kept as it is.
 */
export function presetPatch(settings: AppSettings, providers: ProviderPreset[], next: ProviderPreset | null, typed?: string): Partial<AppSettings> {
  const id = next?.id || 'custom';
  const providerSaved = {
    ...settings.providerSaved,
    [presetOf(providers, settings)?.id || 'custom']: { key: settings.llmApiKey, endpoint: settings.llmEndpoint, model: settings.llmModel }
  };
  const { endpoint, key } = endpointAndKey(knownKeys(settings, providerSaved, id, ''), next, typed);
  return {
    llmProvider: id,
    providerSaved,
    llmApiKey: key,
    llmEndpoint: endpoint,
    llmModel: providerSaved[id]?.model || next?.recommended.main || '',
    reasoningEffort: 'default',
    // quick and vision models that follow the main provider move with it (none for Other); ones set up elsewhere stay
    ...(followsMain(settings, 'quick') && { referencesModel: recommendedFor(next, 'quick'), referencesApiKey: '' }),
    ...(followsMain(settings, 'vision') && { visionModel: recommendedFor(next, 'vision'), visionApiKey: '' })
  };
}

/** The stored effort if the main model accepts it, otherwise the recommended level. */
export function effectiveEffort(settings: AppSettings, providers: ProviderPreset[]): ReasoningEffort {
  const choices = effortOptions(modelOf(presetOf(providers, settings), settings.llmModel));
  return choices.some(([value]) => value === settings.reasoningEffort) ? settings.reasoningEffort : 'default';
}
