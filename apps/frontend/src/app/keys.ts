import type { FocusEvent } from 'react';
import { ApiError, saveKeys } from '../api/client';
import { SETTINGS_CHANGE_EVENT, loadSettings, persistSettings } from './settings';
import type { AppSettings } from './settings';
import { toast } from './Toast';

// The keys typed in Settings live in the keychain (Windows: encrypted for the Windows account) through the backend;
// the settings keep a reference for each (spectrum-key:<32 hex>), which the backend swaps for the key in any request.
// A key typed or kept from before is moved there on start and a second after it is typed; one that can't be moved stays
// in the window's storage, working as before, and Settings › Models says why.

const KEY_REF = /^spectrum-key:[0-9a-f]{32}$/;
export const isKeyRef = (value: unknown) => typeof value === 'string' && KEY_REF.test(value);

/** The settings with fn applied to every key field that has a value: the models', the saved providers', search's, the parsers', NCBI's. */
export function mapKeys(settings: AppSettings, fn: (key: string) => string): AppSettings {
  const f = (value: string | undefined) => (typeof value === 'string' && value ? fn(value) : value) as string;
  const each = <T extends { key: string }>(saved: Record<string, T>) => Object.fromEntries(Object.entries(saved).map(([id, s]) => [id, { ...s, key: f(s.key) }]));
  return {
    ...settings,
    llmApiKey: f(settings.llmApiKey),
    searchApiKey: f(settings.searchApiKey),
    visionApiKey: f(settings.visionApiKey),
    referencesApiKey: f(settings.referencesApiKey),
    searchProviderKey: f(settings.searchProviderKey),
    ncbiKey: f(settings.ncbiKey),
    searchProviderKeys: Object.fromEntries(Object.entries(settings.searchProviderKeys).map(([p, key]) => [p, f(key)])),
    providerSaved: each(settings.providerSaved),
    parserSaved: each(settings.parserSaved)
  };
}

/** The keys still typed out in the settings, and the references they hold. */
export function keysIn(settings: AppSettings) {
  const plain = new Set<string>();
  const refs = new Set<string>();
  mapKeys(settings, (key) => ((isKeyRef(key) ? refs : plain).add(key), key));
  return { plain: [...plain], refs: [...refs] };
}

let failure = '';
// the keys the keychain last refused, which aren't offered again (it could ask the user each time) until they change
let refused = '';
/** Why keys stay in the window's storage, or '' when they don't (shown in Settings › Models). */
export const keyFailure = () => failure;

/** Moves the keys typed out in the settings into the keychain, leaving references in their place. */
export async function moveKeys(save = saveKeys) {
  const { plain, refs } = keysIn(loadSettings());
  if (!plain.length || refused === plain.join('\n')) return;
  let moved: string[];
  try {
    moved = (await save(plain, refs)).refs;
  } catch (err) {
    // the backend not answering yet is tried again; the keychain refusing is said, once
    if (!(err instanceof ApiError)) return;
    if (failure !== err.message) toast(`Your API keys stay in this window’s storage, as before: ${err.message}`, { tone: 'error', duration: 12_000 });
    failure = err.message;
    refused = plain.join('\n');
    return;
  }
  failure = '';
  refused = '';
  const ref = new Map(plain.map((key, i) => [key, moved[i]]));
  // read again: a key changed meanwhile keeps its new value, and moves next time
  persistSettings(mapKeys(loadSettings(), (key) => ref.get(key) ?? key));
}

/** On start, and a second after a key is typed in Settings. */
export function followKeys() {
  let timer = 0;
  window.addEventListener(SETTINGS_CHANGE_EVENT, () => {
    window.clearTimeout(timer);
    if (keysIn(loadSettings()).plain.length) timer = window.setTimeout(() => moveKeys().catch(() => undefined), 1000);
  });
  // the backend may still be starting: tried again whenever the window comes to the front
  window.addEventListener('focus', () => moveKeys().catch(() => undefined));
  moveKeys().catch(() => undefined);
}

/** A key field's focus: a saved key (its reference, shown as dots) is selected, so typing or pasting replaces it whole. */
export const selectSavedKey = (e: FocusEvent<HTMLInputElement>) => {
  if (isKeyRef(e.currentTarget.value)) e.currentTarget.select();
};
