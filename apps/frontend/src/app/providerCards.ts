import type { ProviderModel, ProviderPreset } from '../api/client';
import { ROLE_FIELDS, followsMain, hostOf, keepRoleKey, modelOf, presetForEndpoint, presetOf, presetPatch, recommendedFor, rolePresetOf } from './settings';
import type { AppSettings, ModelRole } from './settings';

// Settings › Providers and Settings › Models, worked out from the settings as they have always been stored: the main
// model's provider, endpoint and key (llm…), a quick or vision model's own (references…, vision…), and what each
// other provider had when it was last used (providerSaved). Nothing here changes that format.

export const CUSTOM = 'custom';
const ROLES = ['quick', 'vision'] as const;
export type Use = 'main' | ModelRole;

/**
 * A provider the user has set up, as one card: a provider at one host, with the key entered for that host (a key only
 * ever goes to the host it was entered for, so the same provider at two hosts is two cards).
 */
export type Connection = {
  /** the first place that holds it: 'main', 'quick', 'vision' or 'saved:<id>'; it names the card while it is edited */
  at: string;
  /** a preset's id, or 'custom' for any other OpenAI-compatible server */
  id: string;
  preset: ProviderPreset | null;
  endpoint: string;
  key: string;
  /** the models that run on it; a quick or vision model that follows the main model counts */
  uses: Use[];
};

const mainId = (settings: AppSettings, providers: ProviderPreset[]) => presetOf(providers, settings)?.id || CUSTOM;
const roleId = (settings: AppSettings, providers: ProviderPreset[], role: ModelRole) => rolePresetOf(providers, settings, role)?.id || CUSTOM;
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The connections, the main model's first: every provider in use, and every other one kept with a key (or, for a server that takes none, an address). */
export function connections(settings: AppSettings, providers: ProviderPreset[]): Connection[] {
  const main = mainId(settings, providers);
  const places: { at: string; id: string; endpoint: string; key: string; use?: Use }[] = [{ at: 'main', id: main, endpoint: settings.llmEndpoint, key: settings.llmApiKey, use: 'main' }];
  for (const role of ROLES) {
    const f = ROLE_FIELDS[role];
    if (!followsMain(settings, role)) places.push({ at: role, id: roleId(settings, providers, role), endpoint: settings[f.endpoint], key: settings[f.apiKey], use: role });
  }
  for (const [id, saved] of Object.entries(settings.providerSaved)) {
    // the main provider's entry is what it had when it was last left, stale while it is the main one
    if (id === main || !saved || typeof saved !== 'object') continue;
    const preset = providers.find((p) => p.id === id);
    // a provider this Spectrum doesn't know stays stored, unshown
    if (!preset && id !== CUSTOM) continue;
    const endpoint = text(saved.endpoint) || preset?.endpoint || '';
    if (text(saved.key) || ((preset?.local || id === CUSTOM) && text(saved.endpoint))) places.push({ at: `saved:${id}`, id, endpoint, key: preset?.local ? '' : text(saved.key) });
  }
  const list: Connection[] = [];
  for (const place of places) {
    const same = list.find((c) => c.id === place.id && hostOf(c.endpoint) === hostOf(place.endpoint));
    if (same) {
      same.key ||= place.key;
      if (place.use) same.uses.push(place.use);
    } else list.push({ at: place.at, id: place.id, preset: providers.find((p) => p.id === place.id) || null, endpoint: place.endpoint, key: place.key, uses: place.use ? [place.use] : [] });
  }
  for (const role of ROLES) if (followsMain(settings, role)) list[0].uses.push(role);
  return list;
}

/** Whether a connection can answer: a key, or a server on plain http that takes none (as shared.tsx modelSetUp), and for a server of the user's own an address. */
export const ready = (conn: Pick<Connection, 'key' | 'endpoint' | 'preset'>) =>
  Boolean(conn.preset?.local) || /^http:\/\//i.test(conn.endpoint) || (Boolean(conn.key) && Boolean(conn.preset || conn.endpoint));

/** A connection's name: its provider's, with the region or, for another server, the host. */
export function connectionName(conn: Connection) {
  if (!conn.preset) return hostOf(conn.endpoint) || 'Custom endpoint';
  const region = conn.preset.regions?.find((r) => r.endpoint === conn.endpoint);
  return region ? `${conn.preset.name} (${region.label})` : conn.preset.name;
}

/** The card a provider gets while it is being connected, before it has a key: nothing is stored until one is typed. */
export const draftConnection = (settings: AppSettings, preset: ProviderPreset | null): Connection => {
  const id = preset?.id || CUSTOM;
  // a custom endpoint starts empty: what is kept under Other is a server already shown, or one that left
  return { at: `saved:${id}`, id, preset, endpoint: preset ? text(settings.providerSaved[id]?.endpoint) || preset.endpoint : '', key: '', uses: [] };
};

/**
 * Connect on a provider. While the main model has no provider that can answer, the provider takes the main model at
 * once (its recommended models, as choosing it in the old Provider menu did); a server that takes no key is kept with
 * its address; any other is stored once its key is typed (credsPatch), so the patch is empty.
 */
export function connectPatch(settings: AppSettings, providers: ProviderPreset[], preset: ProviderPreset | null): Partial<AppSettings> {
  if (!ready(connections(settings, providers)[0])) return presetPatch(settings, providers, preset);
  if (!preset?.local) return {};
  return { providerSaved: { ...settings.providerSaved, [preset.id]: { model: text(settings.providerSaved[preset.id]?.model), key: '', endpoint: text(settings.providerSaved[preset.id]?.endpoint) || preset.endpoint } } };
}

/**
 * The main model's endpoint as typed. Another provider's address switches to that provider as the old Provider menu
 * did, so the key it had never goes there.
 */
export function mainEndpointPatch(settings: AppSettings, providers: ProviderPreset[], value: string): Partial<AppSettings> {
  const preset = presetOf(providers, settings);
  const next = presetForEndpoint(providers, value);
  // an Ollama on another port is still Ollama, and has no key to leak; an empty field or an https address (a server
  // that wants a key) leaves it, so the key field shows
  if (next?.id === preset?.id || (!next && preset?.local && value.trim() && !/^https:/i.test(value.trim()))) return { llmEndpoint: value };
  return presetPatch(settings, providers, next, value);
}

/** A connection's endpoint or key as typed, written wherever the settings hold that connection. */
export function credsPatch(settings: AppSettings, providers: ProviderPreset[], conn: Connection, change: { endpoint?: string; key?: string }): Partial<AppSettings> {
  const host = hostOf(conn.endpoint);
  const within = (id: string, endpoint: string) => id === conn.id && hostOf(endpoint) === host;
  const main = mainId(settings, providers);
  const patch: Partial<AppSettings> = {};
  const onMain = within(main, settings.llmEndpoint);
  if (onMain) {
    if (change.endpoint !== undefined) Object.assign(patch, mainEndpointPatch(settings, providers, change.endpoint));
    if (change.key !== undefined) patch.llmApiKey = change.key;
  }
  for (const role of ROLES) {
    const f = ROLE_FIELDS[role];
    if (followsMain(settings, role) || !within(roleId(settings, providers, role), settings[f.endpoint])) continue;
    // pins the provider, so an address cleared to retype it keeps the role where it is
    if (change.endpoint !== undefined) Object.assign(patch, { [f.endpoint]: change.endpoint, [f.provider]: settings[f.provider] || conn.id });
    if (change.key !== undefined) Object.assign(patch, { [f.apiKey]: change.key });
  }
  // what is kept for this provider counts only at this connection's host: a key never follows to another address
  const kept = settings.providerSaved[conn.id];
  const saved = kept && hostOf(text(kept.endpoint)) === host ? kept : undefined;
  if (!onMain && conn.id !== main && (conn.at.startsWith('saved:') || saved)) {
    patch.providerSaved = {
      ...settings.providerSaved,
      [conn.id]: { model: text(saved?.model), key: change.key ?? (text(saved?.key) || conn.key), endpoint: change.endpoint ?? (text(saved?.endpoint) || conn.endpoint) }
    };
  }
  return patch;
}

/**
 * Disconnect: the connection's key is forgotten wherever the settings hold it. A quick or vision model on it goes
 * back to the main model's provider; the main model stays pointed at it, without a key, until another is chosen.
 */
export function disconnectPatch(settings: AppSettings, providers: ProviderPreset[], conn: Connection): Partial<AppSettings> {
  const host = hostOf(conn.endpoint);
  const within = (id: string, endpoint: string) => id === conn.id && hostOf(endpoint) === host;
  const patch: Partial<AppSettings> = {};
  const { [conn.id]: saved, ...others } = settings.providerSaved;
  if (saved && (!text(saved.endpoint) || hostOf(text(saved.endpoint)) === host)) patch.providerSaved = others;
  for (const role of ROLES) {
    const f = ROLE_FIELDS[role];
    if (followsMain(settings, role) || !within(roleId(settings, providers, role), settings[f.endpoint])) continue;
    Object.assign(patch, { [f.provider]: '', [f.endpoint]: '', [f.apiKey]: '', [f.model]: recommendedFor(presetOf(providers, settings), role) });
  }
  if (within(mainId(settings, providers), settings.llmEndpoint)) patch.llmApiKey = '';
  return patch;
}

// ─── Settings › Models ───

/** A model as its provider's section lists it. known: one of Spectrum's own, with its notes; otherwise only listed by the provider. */
export type ModelRow = { id: string; label: string; note: string; vision: boolean; known: boolean };

/** A provider's models: Spectrum's own (or Ollama's live list), then the ones only the provider listed when Test connection asked. */
export function modelRows(preset: ProviderPreset | null, listed: string[]): ModelRow[] {
  const own = (preset?.models || []).map((m: ProviderModel): ModelRow => ({ id: m.id, label: m.label, note: m.note, vision: m.vision, known: true }));
  return [...own, ...listed.filter((id) => !own.some((m) => m.id === id)).map((id): ModelRow => ({ id, label: id, note: '', vision: false, known: false }))];
}

export const isHidden = (settings: Pick<AppSettings, 'hiddenModels'>, provider: string, model: string) => !!settings.hiddenModels[provider]?.includes(model);

/** Switches a model off (hidden) or back on in the model menus. */
export function hiddenPatch(settings: AppSettings, provider: string, model: string, hidden: boolean): Partial<AppSettings> {
  const { [provider]: was = [], ...others } = settings.hiddenModels;
  const next = hidden ? [...new Set([...was, model])] : was.filter((id) => id !== model);
  return { hiddenModels: next.length ? { ...others, [provider]: next } : others };
}

/**
 * The main model moved to a model of a connection: on the main model's own provider just the model, on another the
 * switch the old Provider menu made (that provider's key and address back, the quick and vision models that follow
 * the main one moved with it). A model chosen is switched on in the menus.
 */
export function mainModelPatch(settings: AppSettings, providers: ProviderPreset[], conn: Connection, model: string, preset: ProviderPreset | null = conn.preset): Partial<AppSettings> {
  const move = conn.uses.includes('main') ? {} : presetPatch(settings, providers, conn.preset, conn.endpoint);
  const next = { ...settings, ...move };
  const picked = modelOf(preset, model);
  const reader = recommendedFor(preset, 'vision');
  return {
    ...move,
    llmModel: model,
    reasoningEffort: 'default',
    // a text-only model needs somewhere to send images
    ...(picked && !picked.vision && followsMain(next, 'vision') && !next.visionModel && reader && { visionModel: reader }),
    ...(isHidden(settings, conn.id, model) && hiddenPatch(settings, conn.id, model, false))
  };
}

/**
 * The quick or vision model moved to a model of a connection. On the main model's connection (or none) it follows the
 * main provider, with this model ('' = the main model itself); on another it takes that connection's address and key.
 */
export function roleModelPatch(settings: AppSettings, providers: ProviderPreset[], role: ModelRole, conn: Connection | null, model: string): Partial<AppSettings> {
  const f = ROLE_FIELDS[role];
  const providerSaved = keepRoleKey(settings, providers, role);
  const hidden = conn && isHidden(settings, conn.id, model) ? hiddenPatch(settings, conn.id, model, false) : {};
  if (!conn || conn.uses.includes('main')) return { providerSaved, [f.provider]: '', [f.endpoint]: '', [f.apiKey]: '', [f.model]: model, ...hidden };
  return { providerSaved, [f.provider]: conn.id, [f.endpoint]: conn.endpoint, [f.apiKey]: conn.key, [f.model]: model, ...hidden };
}

/** Where a role's model runs: its connection (the main model's while it follows it) and the model's name ('' = the main model). */
export function roleAt(settings: AppSettings, conns: Connection[], role: ModelRole) {
  return { conn: conns.find((c) => c.uses.includes(role)) || conns[0], model: settings[ROLE_FIELDS[role].model] };
}

const k = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
/** A context window in tokens as a few characters: 128k, 1M, 1.5M. */
export const contextText = (tokens: number | undefined) => (typeof tokens === 'number' && tokens > 0 ? k(tokens) : '');
