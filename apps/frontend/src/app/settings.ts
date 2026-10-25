import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSharedSettings, listLiveModels, listProviders, shareSettings } from '../api/client';
import type {
  BibTool,
  CompileEngine,
  CompileOptions,
  EffortLevel,
  LLMConfig,
  OxfordComma,
  ProviderModel,
  ProviderPreset,
  ReasoningEffort,
  ResearchKeys,
  SearchConfig,
  SearchProvider,
  SharedSettings
} from '../api/client';
import { setNativeTheme } from './desktop';
import { NO_FOLDERS, cleanFolders } from './folders';
import type { ProjectFolders } from './folders';
import { STARTER_PERSONAS, isUnchangedStarter } from '../editor/personas';
import type { Persona } from '../editor/personas';

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
  /** what a project compiles with until it makes its own choice in the compile menu (Settings › Engines › LaTeX) */
  compileDefaults: CompileDefaults;
  /** a second TeX installation's folder, tried first by every compile ('' = none) */
  texFolder: string;
  /** a failed compile opens Tools › Logs */
  openLogsOnFail: boolean;
  /** a checkpoint after each successful compile, and a notice when one can't be saved */
  checkpointOnCompile: boolean;
  checkpointNotice: boolean;
  /** switching to another document's .tex shows that document's PDF, and Compile builds it */
  pdfFollowsFile: boolean;
  editorFontSize: number;
  /** parent folder for new projects; '' = the backend default (~/Documents/Spectrum) */
  projectsDir: string;
  searchProvider: SearchProvider;
  /** the key for searchProvider; the others' keys wait in searchProviderKeys */
  searchProviderKey: string;
  searchProviderKeys: Partial<Record<SearchProvider, string>>;
  searchConnections: SearchProvider[];
  serpEngine: 'google' | 'google_scholar' | 'baidu';
  /** Research's sources (Settings › Search), on this computer only; its OpenAlex and Semantic Scholar keys are the connections' */
  openalexEmail: string;
  ncbiKey: string;
  unpaywallEmail: string;
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
  /** settings follow the user to their other computers through the settings repository on GitHub (SHARED_KEYS) */
  syncSettings: boolean;
  /** the folders on the Projects page (folders.ts) */
  projectFolders: ProjectFolders;
  /** a colour chosen for a tag; the others get one from their name */
  tagColours: Record<string, TagColour>;
  /** Settings › Personas, picked per chat; the starters are seeded once */
  personas: Persona[];
  /** what the assistant and the Spectrum agent are told while a chat has no persona (never autocomplete) */
  defaultInstructions: string;
};

export type CompileDefaults = Required<CompileOptions>;

export const TAG_COLOUR_NAMES = ['blue', 'green', 'orange', 'red', 'yellow', 'purple', 'teal'] as const;
export type TagColour = (typeof TAG_COLOUR_NAMES)[number];

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
  // a new setting, so 1.x's saved compiler (compileEngine, left in place for it) doesn't carry over
  compileDefaults: { engine: 'auto', autoCompile: 0, haltOnError: false, bibTool: 'auto', draft: false, syntaxCheck: true },
  texFolder: '',
  openLogsOnFail: false,
  checkpointOnCompile: true,
  checkpointNotice: true,
  pdfFollowsFile: true,
  editorFontSize: 13,
  projectsDir: '',
  searchProvider: 'llm',
  searchProviderKey: '',
  searchProviderKeys: {},
  searchConnections: ['llm'],
  // Scholar finds papers to cite; settings saved before this keep the engine they had
  serpEngine: 'google_scholar',
  openalexEmail: '',
  ncbiKey: '',
  unpaywallEmail: '',
  shortcuts: {},
  spellCheck: true,
  grammarStyle: false,
  oxfordComma: 'avoid',
  syncDoubleClick: true,
  syncHighlightColour: 'yellow',
  syncHighlightCustom: '#ffd60a',
  syncHighlightSeconds: 3,
  syncSettings: true,
  projectFolders: NO_FOLDERS,
  tagColours: {},
  personas: STARTER_PERSONAS,
  defaultInstructions: ''
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

export const BIB_TOOLS: [BibTool, string][] = [
  ['auto', 'Auto'],
  ['bibtex', 'BibTeX'],
  ['biber', 'Biber']
];

/** haltOnError's two choices */
export const ERROR_HANDLING: [boolean, string][] = [
  [false, 'Try to compile despite errors'],
  [true, 'Stop on first error']
];

/** syntaxCheck's two choices */
export const SYNTAX_CHECKS: [boolean, string][] = [
  [true, 'Check before compiling'],
  [false, 'Don’t check']
];

/** Personas with a name and an id each, one per id; anything but a list is the starters again. */
function cleanPersonas(value: unknown): Persona[] {
  if (!Array.isArray(value)) return STARTER_PERSONAS;
  const ids = new Set<string>();
  return value.flatMap((p) => {
    const { id, name, colour, prompt } = (typeof p === 'object' && p ? p : {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !id || ids.has(id) || typeof name !== 'string' || !name.trim() || typeof prompt !== 'string') return [];
    ids.add(id);
    return [{ id, name, colour: TAG_COLOUR_NAMES.includes(colour as TagColour) ? (colour as TagColour) : 'blue', prompt }];
  });
}

export const autoCompileLabel = (seconds: number) => (seconds ? `After a pause of ${seconds} s` : 'Off');

/** Each compile setting from `value` where it's one Spectrum knows, else from `fallback`. */
function cleanCompile(value: unknown, fallback: CompileDefaults): CompileDefaults {
  const v = (typeof value === 'object' && value ? value : {}) as Record<string, unknown>;
  const seconds = Number(v.autoCompile);
  return {
    engine: COMPILE_ENGINES.find(([engine]) => engine === v.engine)?.[0] ?? fallback.engine,
    autoCompile: Number.isInteger(seconds) && seconds >= 0 && seconds <= 10 ? seconds : fallback.autoCompile,
    haltOnError: typeof v.haltOnError === 'boolean' ? v.haltOnError : fallback.haltOnError,
    bibTool: BIB_TOOLS.find(([tool]) => tool === v.bibTool)?.[0] ?? fallback.bibTool,
    draft: typeof v.draft === 'boolean' ? v.draft : fallback.draft,
    syntaxCheck: typeof v.syntaxCheck === 'boolean' ? v.syntaxCheck : fallback.syntaxCheck
  };
}

/** What a project compiles with: its own choices from .spectrum/settings.json, the app's defaults for the rest. */
export const effectiveCompile = (project: CompileOptions | undefined, defaults: CompileDefaults) =>
  cleanCompile(Object.fromEntries(Object.entries(project ?? {}).filter(([, value]) => value != null)), defaults);

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
    merged.compileDefaults = cleanCompile(merged.compileDefaults, DEFAULT_SETTINGS.compileDefaults);
    if (typeof merged.texFolder !== 'string') merged.texFolder = '';
    merged.openLogsOnFail = merged.openLogsOnFail === true;
    merged.checkpointOnCompile = merged.checkpointOnCompile !== false;
    merged.checkpointNotice = merged.checkpointNotice !== false;
    merged.pdfFollowsFile = merged.pdfFollowsFile !== false;
    if (!['system', 'light', 'dark'].includes(merged.theme)) merged.theme = 'system';
    if (!REASONING_EFFORTS.some(([value]) => value === merged.reasoningEffort)) merged.reasoningEffort = 'default';
    if (!Number.isFinite(merged.editorFontSize)) merged.editorFontSize = DEFAULT_SETTINGS.editorFontSize;
    if (typeof merged.shortcuts !== 'object' || !merged.shortcuts) merged.shortcuts = {};
    if (typeof merged.providerSaved !== 'object' || !merged.providerSaved) merged.providerSaved = {};
    // 1.6 kept one search key and left it in place when switching to a provider without a key field: it was
    // another provider's, and OpenAlex now sends a key it's given
    if (!parsed.searchProviderKeys && !['serpapi', 'tavily', 'brave', 'semanticscholar'].includes(String(merged.searchProvider))) merged.searchProviderKey = '';
    if (typeof merged.searchProviderKeys !== 'object' || !merged.searchProviderKeys) merged.searchProviderKeys = {};
    if (!Array.isArray(parsed.searchConnections)) merged.searchConnections = [...new Set([merged.searchProvider, ...Object.keys(merged.searchProviderKeys).filter((p) => merged.searchProviderKeys[p as SearchProvider]) as SearchProvider[]])];
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
    // 1.10's cloudMode stays stored as it was, for going back to 1.10.4
    merged.syncSettings = merged.syncSettings !== false;
    merged.projectFolders = cleanFolders(merged.projectFolders);
    merged.tagColours = Object.fromEntries(
      Object.entries(typeof merged.tagColours === 'object' && merged.tagColours ? merged.tagColours : {}).filter(([, c]) => TAG_COLOUR_NAMES.includes(c as TagColour))
    ) as AppSettings['tagColours'];
    merged.personas = cleanPersonas(merged.personas);
    if (typeof merged.defaultInstructions !== 'string') merged.defaultInstructions = '';
    for (const key of ['editorFont', 'editorFontCustom', 'editorThemeLight', 'editorThemeDark', 'parser', 'parserProtocol', 'openalexEmail', 'ncbiKey', 'unpaywallEmail'] as const) {
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

// ─── Settings that follow the user ───

/**
 * What goes to the user's other computers. Never a key, nor the providers, endpoints and models that go with the
 * keys, a path, the window's see-through look, an editor font or compiler only one computer may have, or this switch.
 */
const SHARED_KEYS = [
  'theme', 'accent', 'accentCustom', 'pdfPageLight', 'pdfPageDark', 'editorThemeLight', 'editorThemeDark', 'editorColours', 'editorFontSize',
  'autoInsertCite', 'shortcuts', 'spellCheck', 'grammarStyle', 'oxfordComma', 'syncDoubleClick', 'syncHighlightColour', 'syncHighlightCustom',
  'syncHighlightSeconds', 'projectFolders', 'tagColours', 'personas', 'defaultInstructions'
] as const satisfies readonly (keyof AppSettings)[];

export const sharedPart = (settings: AppSettings): Record<string, unknown> => Object.fromEntries(SHARED_KEYS.map((key) => [key, settings[key]]));

/** This computer's settings with another's shared ones in, checked as stored ones are; the rest stay as they are. */
export const withShared = (settings: AppSettings, shared: Record<string, unknown>) =>
  parse(JSON.stringify({ ...settings, ...Object.fromEntries(SHARED_KEYS.filter((key) => key in shared).map((key) => [key, shared[key]])) }));

/**
 * Another computer's newer shared settings taken in, except the ones changed here since this computer last shared or
 * took some in (sent: what they were then, as JSON), which stay as they are.
 */
export function takeInShared(settings: AppSettings, theirs: Record<string, unknown>, sent: string) {
  let before: Record<string, unknown> = {};
  try {
    before = JSON.parse(sent);
  } catch {
    // never shared: every one counts as changed here
  }
  const mine = SHARED_KEYS.filter((key) => JSON.stringify(settings[key]) !== JSON.stringify(before[key]));
  const kept: Record<string, unknown> = Object.fromEntries(mine.map((key) => [key, settings[key]]));
  // a tree this computer never shared (it just joined, came from 1.8.0, or the switch was just turned on) joins theirs
  // rather than replacing it, else whichever computer shares next would empty the other's
  if (!('projectFolders' in before) && 'projectFolders' in theirs) {
    const t = cleanFolders(theirs.projectFolders);
    const m = settings.projectFolders;
    kept.projectFolders = { folders: [...t.folders, ...m.folders.filter((f) => !t.folders.some((g) => g.id === f.id))], placement: { ...m.placement, ...t.placement } };
  }
  // the personas join theirs the same way, less the starters left as they were, so one deleted there stays deleted
  if (!('personas' in before) && 'personas' in theirs) {
    const t = cleanPersonas(theirs.personas);
    kept.personas = [...t, ...settings.personas.filter((p) => !t.some((q) => q.id === p.id) && !isUnchangedStarter(p))];
  }
  // the user's own text: an empty box here that was never shared doesn't empty theirs
  if (!('defaultInstructions' in before) && !settings.defaultInstructions) delete kept.defaultInstructions;
  return withShared(withShared(settings, theirs), kept);
}

/**
 * Back from an older Spectrum (1.8.0, or 1.10.4 before personas), which last took in another computer's file and kept
 * what this computer had shared without the keys it doesn't know (sent): those keys come from the newest file (latest).
 * Its own value for a key, if it took in that file last (`at`), else only while this computer's value is still the
 * default, as the older Spectrum may have shared since without it (so a tree of its own, say, stays). The settings with
 * them in and what counts as shared then, or null when nothing is to come in.
 * ponytail: when the newest file is a third computer's still on the older Spectrum, it has none of the keys either;
 * the presence service would need to hand over the newest file that has each
 */
export function keysBackFromOlder(settings: AppSettings, latest: SharedSettings | null, at: string, sent: string) {
  if (!latest) return null;
  let before: unknown;
  try {
    before = JSON.parse(sent);
  } catch {
    return null;
  }
  if (!before || typeof before !== 'object') return null;
  const missing = SHARED_KEYS.filter(
    (key) => !(key in before) && key in latest.settings && (latest.updatedAt === at || JSON.stringify(settings[key]) === JSON.stringify(DEFAULT_SETTINGS[key]))
  );
  if (!missing.length) return null;
  const next = withShared(settings, Object.fromEntries(missing.map((key) => [key, latest.settings[key]])));
  return { settings: next, sent: JSON.stringify({ ...sharedPart(next), ...before }) };
}

/**
 * part less 2.0's keys still at their default that neither what counts as shared (sent, as JSON) nor theirs (the file
 * taken in) has: a computer upgraded from 1.10.4 never sends its starters or an empty box over the others' until a file
 * brings the keys in.
 * ponytail: personas edited here before then still go across over the others' own; closing that needs sharedSettings
 * to hand over the newest file that has each key
 */
function ownShared(part: Record<string, unknown>, sent: string, theirs: Record<string, unknown> = {}) {
  let before: Record<string, unknown> = {};
  try {
    before = JSON.parse(sent) || {};
  } catch {
    // never shared
  }
  const kept = { ...part };
  for (const key of ['personas', 'defaultInstructions'] as const) {
    if (!(key in before) && !(key in theirs) && JSON.stringify(part[key]) === JSON.stringify(DEFAULT_SETTINGS[key])) delete kept[key];
  }
  return kept;
}

/**
 * One follow, without storage or requests: the settings with the newest file another computer shared (latest) taken
 * in, when this computer last shared or took some in (at) and what counted as shared then (sent) after it, and what to
 * share (null: nothing). theirsFirst: just turned on, so the other computers' settings win over this one's.
 */
export function followStep(settings: AppSettings, latest: SharedSettings | null, at: string, sent: string, theirsFirst = false) {
  const back = keysBackFromOlder(settings, latest, at, sent);
  if (back) ({ settings, sent } = back);
  if (latest && latest.updatedAt > at) {
    // first, or this computer's old values of the other settings would go back under a newer date and undo them
    // there; the folder tree and the personas join the others' all the same
    settings = takeInShared(settings, latest.settings, theirsFirst ? JSON.stringify({ ...sharedPart(settings), projectFolders: undefined, personas: undefined }) : sent);
    at = latest.updatedAt;
    sent = JSON.stringify(ownShared(sharedPart(withShared(settings, latest.settings)), sent, latest.settings));
  }
  const mine = ownShared(sharedPart(settings), sent);
  return { settings, at, sent, share: JSON.stringify(mine) === sent ? null : mine };
}

// when this computer last shared settings or took some in, and what they were (JSON)
const SYNC_KEY = 'spectrum-settings-sync';

function syncState(): { at: string; sent: string } {
  try {
    return { at: '', sent: '', ...JSON.parse(window.localStorage.getItem(SYNC_KEY) || '{}') };
  } catch {
    return { at: '', sent: '' };
  }
}

function keepSyncState(state: { at: string; sent: string }) {
  try {
    window.localStorage.setItem(SYNC_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable: they're taken in again next time
  }
}

/**
 * On start, whenever the window comes to the front and 2 s after the last change here: takes in the newest settings
 * another computer shared since this one last shared or took some (under the ones changed here since), then shares
 * this computer's if they differ. Off in Settings › Projects. ponytail: newest by each computer's clock, which is fine
 * while both keep the right time.
 */
export function followSharedSettings() {
  // theirsFirst: just turned on, so the other computers' settings win over this one's
  const follow = async (theirsFirst = false) => {
    const settings = loadSettings();
    if (!settings.syncSettings) return;
    const { shared, latest } = await getSharedSettings();
    if (!shared) return;
    const { at, sent } = syncState();
    const next = followStep(settings, latest, at, sent, theirsFirst);
    if (next.settings !== settings) {
      keepSyncState({ at: next.at, sent: next.sent });
      persistSettings(next.settings);
    }
    if (!next.share) return;
    const res = await shareSettings(next.share);
    // never before the file just taken in, so one from a computer whose clock is ahead isn't taken in twice
    if (res.updatedAt) keepSyncState({ at: res.updatedAt > next.at ? res.updatedAt : next.at, sent: JSON.stringify(next.share) });
  };
  let on = loadSettings().syncSettings;
  let turnedOn = false;
  let timer = 0;
  window.addEventListener(CHANGE_EVENT, () => {
    // turned on: the other computers' settings come first
    turnedOn ||= loadSettings().syncSettings && !on;
    on = loadSettings().syncSettings;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      follow(turnedOn).catch(() => undefined);
      turnedOn = false;
    }, 2000);
  });
  window.addEventListener('focus', () => follow().catch(() => undefined));
  follow().catch(() => undefined);
}

export const SEARCH_PROVIDERS: [SearchProvider, string][] = [
  ['llm', 'Model’s built-in web search'],
  ['openalex', 'OpenAlex (free)'],
  ['semanticscholar', 'Semantic Scholar'],
  ['serpapi', 'SerpApi (Google, Scholar, Baidu)'],
  ['exa', 'Exa'],
  ['tavily', 'Tavily'],
  ['brave', 'Brave Search'],
  ['ddgs', 'DDGS (free)']
];

/** Switches the default without losing the other connections or their keys. */
export function searchProviderPatch(settings: AppSettings, next: SearchProvider): Partial<AppSettings> {
  return {
    searchProvider: next,
    searchProviderKey: settings.searchProviderKeys[next] || '',
    searchConnections: [...new Set([...settings.searchConnections, next])],
    searchProviderKeys: { ...settings.searchProviderKeys, [settings.searchProvider]: settings.searchProviderKey }
  };
}

/** A search connection's key, kept in searchProviderKey while it's the default. */
export const providerKey = (settings: AppSettings, provider: SearchProvider) =>
  (provider === settings.searchProvider ? settings.searchProviderKey : settings.searchProviderKeys[provider]) || '';

/** Sets a connection's key wherever providerKey reads it. */
export const providerKeyPatch = (settings: AppSettings, provider: SearchProvider, key: string): Partial<AppSettings> => ({
  searchProviderKeys: { ...settings.searchProviderKeys, [provider]: key },
  ...(provider === settings.searchProvider && { searchProviderKey: key })
});

/** What Research sends to its sources with each search: the connections' OpenAlex and Semantic Scholar keys, and the rest. */
export const researchKeysFor = (settings: AppSettings): ResearchKeys => ({
  openalexKey: providerKey(settings, 'openalex'),
  openalexEmail: settings.openalexEmail,
  semanticScholarKey: providerKey(settings, 'semanticscholar'),
  ncbiKey: settings.ncbiKey
});

/** Credentials stay in the request, never in chat history or shared settings. */
export function searchConfigFor(settings: AppSettings, llmConfig?: Partial<LLMConfig>): SearchConfig {
  const keys = { ...settings.searchProviderKeys, [settings.searchProvider]: settings.searchProviderKey };
  return {
    provider: settings.searchProvider,
    connections: [settings.searchProvider, ...SEARCH_PROVIDERS.map(([provider]) => provider).filter((provider) => provider !== settings.searchProvider && settings.searchConnections.includes(provider))].map((provider) => ({ provider, apiKey: keys[provider] || '', engine: settings.serpEngine })),
    llmConfig
  };
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
    // with the port, which is all that marks an Ollama
    host = new URL(endpoint).host;
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
  // a local Ollama has no key field, so none may hide there
  return { endpoint, key: next?.local ? '' : known.find((k) => hostOf(k.endpoint) === hostOf(endpoint))?.key || '' };
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

type LiveList = Awaited<ReturnType<typeof listLiveModels>>;
// each server's list, asked for once per launch (or again on Refresh)
const liveLists = new Map<string, Promise<LiveList>>();

/**
 * A live preset (Ollama) with the models its server lists now, and why there are none if it can't
 * be reached; any other preset as it is.
 */
export function useLivePreset(preset: ProviderPreset | null, endpoint: string) {
  const key = preset?.live ? `${preset.id} ${endpoint || preset.endpoint}` : '';
  const [got, setGot] = useState<{ key: string; list: LiveList } | null>(null);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (!key || !preset) return;
    let live = true;
    if (!liveLists.has(key)) {
      liveLists.set(key, listLiveModels(preset.id, endpoint).catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) })));
    }
    liveLists.get(key)!.then((list) => {
      // a server that couldn't be reached is asked again next time
      if (!list.ok) liveLists.delete(key);
      if (live) setGot({ key, list });
    });
    return () => {
      live = false;
    };
  }, [key, asked]);
  const list = got?.key === key ? got.list : null;
  return {
    preset: preset && list?.ok && list.models ? { ...preset, models: list.models, recommended: list.recommended || preset.recommended } : preset,
    error: list?.ok ? '' : list?.error || '',
    refresh: () => {
      liveLists.delete(key);
      setAsked((n) => n + 1);
    }
  };
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
