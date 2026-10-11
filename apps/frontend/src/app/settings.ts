import { useEffect, useState, useSyncExternalStore } from 'react';
import { listProviders } from '../api/client';
import type { CompileEngine, EffortLevel, LLMConfig, ProviderModel, ProviderPreset, ReasoningEffort, SearchProvider } from '../api/client';
import { setNativeTheme } from './desktop';

export { IS_DESKTOP } from './desktop';

export type Theme = 'system' | 'light' | 'dark';

export type AppSettings = {
  theme: Theme;
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
  mineruApiBase: string;
  mineruToken: string;
  /** shortcut id → key, only for the ones changed in Settings ('' = removed) */
  shortcuts: Record<string, string>;
};

export const SETTINGS_KEY = 'spectrum-settings-v1';
const CHANGE_EVENT = 'spectrum-settings-change';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
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
  mineruApiBase: '',
  mineruToken: '',
  shortcuts: {}
};

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
    const { ngrokToken: _dropped, ...parsed } = JSON.parse(raw) as Partial<AppSettings> & { ngrokToken?: string };
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    if (!COMPILE_ENGINES.some(([value]) => value === merged.compileEngine)) merged.compileEngine = DEFAULT_SETTINGS.compileEngine;
    if (!['system', 'light', 'dark'].includes(merged.theme)) merged.theme = 'system';
    if (!REASONING_EFFORTS.some(([value]) => value === merged.reasoningEffort)) merged.reasoningEffort = 'default';
    if (!Number.isFinite(merged.editorFontSize)) merged.editorFontSize = DEFAULT_SETTINGS.editorFontSize;
    if (typeof merged.shortcuts !== 'object' || !merged.shortcuts) merged.shortcuts = {};
    if (typeof merged.providerSaved !== 'object' || !merged.providerSaved) merged.providerSaved = {};
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
  // no endpoint of its own: the main model's provider and key, with its own model if it has one
  if (!endpoint) return { ...main, model: model || main.model };
  return {
    endpoint,
    // a key only ever goes to the endpoint it was entered for
    apiKey: apiKey || (endpoint === main.endpoint ? main.apiKey : undefined),
    model: model || main.model
  };
}

export type ModelRole = 'quick' | 'vision';

/** The settings behind each role's model, and the preset recommendation that fills it. */
export const ROLE_FIELDS = {
  quick: { provider: 'referencesProvider', endpoint: 'referencesEndpoint', apiKey: 'referencesApiKey', model: 'referencesModel', recommended: 'references' },
  vision: { provider: 'visionProvider', endpoint: 'visionEndpoint', apiKey: 'visionApiKey', model: 'visionModel', recommended: 'vision' }
} as const;

/** True when a role uses the main model's provider, so it follows the main provider when that changes. */
export function followsMain(settings: AppSettings, role: ModelRole) {
  const f = ROLE_FIELDS[role];
  return !settings[f.provider] && !settings[f.endpoint];
}

/** A role's own preset (null for Other), or the main one while it follows the main provider. */
export function rolePresetOf(providers: ProviderPreset[], settings: AppSettings, role: ModelRole) {
  const f = ROLE_FIELDS[role];
  if (followsMain(settings, role)) return presetOf(providers, settings);
  const id = settings[f.provider];
  if (id) return providers.find((p) => p.id === id) || null;
  // saved before roles had a provider: work it out from the endpoint
  return presetOf(providers, { ...settings, llmProvider: '', llmEndpoint: settings[f.endpoint] });
}

/** The model a preset recommends for a role; for vision always one that reads images. */
export function recommendedFor(preset: ProviderPreset | null, role: ModelRole) {
  if (!preset) return '';
  const id = preset.recommended[ROLE_FIELDS[role].recommended];
  if (role === 'quick' || modelOf(preset, id)?.vision) return id;
  return preset.models.find((m) => m.vision)?.id || '';
}

/**
 * Points a role at a provider: 'same' (the main model's), a preset id or 'custom'. A provider used before
 * brings back its key and region, so a key never goes to another provider's host.
 */
export function rolePatch(settings: AppSettings, providers: ProviderPreset[], role: ModelRole, id: string): Partial<AppSettings> {
  const f = ROLE_FIELDS[role];
  if (id === 'same') return { [f.provider]: '', [f.endpoint]: '', [f.apiKey]: '', [f.model]: recommendedFor(presetOf(providers, settings), role) };
  const next = providers.find((p) => p.id === id) || null;
  const mainId = presetOf(providers, settings)?.id || 'custom';
  const back = mainId === id ? { key: settings.llmApiKey, endpoint: settings.llmEndpoint, model: settings.llmModel } : settings.providerSaved[id];
  const own = next ? [next.endpoint, ...(next.regions || []).map((r) => r.endpoint)] : [];
  return {
    [f.provider]: next ? id : 'custom',
    [f.endpoint]: next ? (back && own.includes(back.endpoint) ? back.endpoint : next.endpoint) : back?.endpoint || '',
    [f.apiKey]: back?.key || '',
    [f.model]: next ? recommendedFor(next, role) : ''
  };
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

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** The chosen preset, or null for Custom. Settings saved before presets existed are matched by host. */
export function presetOf(providers: ProviderPreset[], settings: AppSettings) {
  if (settings.llmProvider) return providers.find((p) => p.id === settings.llmProvider) || null;
  const host = hostOf(settings.llmEndpoint);
  return providers.find((p) => [p.endpoint, ...(p.regions || []).map((r) => r.endpoint)].some((e) => hostOf(e) === host)) || null;
}

export function modelOf(preset: ProviderPreset | null, id: string) {
  return preset?.models.find((m) => m.id === id) || null;
}

/** Switches provider: back to what was last used with it, or to its endpoint, recommended models and effort. */
export function presetPatch(settings: AppSettings, providers: ProviderPreset[], next: ProviderPreset | null): Partial<AppSettings> {
  const id = next?.id || 'custom';
  const providerSaved = {
    ...settings.providerSaved,
    [presetOf(providers, settings)?.id || 'custom']: { key: settings.llmApiKey, endpoint: settings.llmEndpoint, model: settings.llmModel }
  };
  const back = providerSaved[id];
  // a preset only takes back one of its own endpoints (its region), so a key never goes to another host
  const own = next ? [next.endpoint, ...(next.regions || []).map((r) => r.endpoint)] : [];
  const endpoint = next ? (back && own.includes(back.endpoint) ? back.endpoint : next.endpoint) : back?.endpoint || '';
  // a key entered for this provider under the quick or vision model counts too
  const roleKey = (['quick', 'vision'] as const).map((r) => ROLE_FIELDS[r]).find((f) => settings[f.provider] === id && settings[f.apiKey])?.apiKey;
  return {
    llmProvider: id,
    providerSaved,
    llmApiKey: back?.key || (roleKey ? settings[roleKey] : ''),
    llmEndpoint: endpoint,
    llmModel: back?.model || next?.recommended.main || '',
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
