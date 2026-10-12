// The PDF parser for template transfer: which one is chosen, where its requests go and with which key.
import { useEffect, useState } from 'react';
import { listParsers } from '../api/client';
import type { ParserConfig, ParserPreset } from '../api/client';
import type { AppSettings } from './settings';

/** Settings’ Other: a self-hosted or compatible server speaking one of the presets’ APIs (parserProtocol). */
export const CUSTOM_PARSER = 'custom';

let parsersRequest: Promise<ParserPreset[]> | null = null;

/** The parser presets, fetched once per launch; empty until they arrive. */
export function useParsers() {
  const [parsers, setParsers] = useState<ParserPreset[]>([]);
  useEffect(() => {
    parsersRequest ??= listParsers()
      .then((res) => res.parsers)
      .catch(() => {
        parsersRequest = null;
        return [];
      });
    let live = true;
    parsersRequest.then((list) => live && setParsers(list));
    return () => {
      live = false;
    };
  }, []);
  return parsers;
}

/** The chosen preset, or for Other the one whose API it speaks; MinerU if the choice is unknown, null while loading. */
export function parserPreset(parsers: ParserPreset[], settings: AppSettings) {
  const id = settings.parser === CUSTOM_PARSER ? settings.parserProtocol : settings.parser;
  return parsers.find((p) => p.id === id) || parsers[0] || null;
}

/** Where the chosen parser's endpoint and key are kept in parserSaved. */
export const parserId = (settings: AppSettings, preset: ParserPreset | null) =>
  settings.parser === CUSTOM_PARSER ? CUSTOM_PARSER : preset?.id || settings.parser;

export const savedParser = (settings: AppSettings, id: string) => settings.parserSaved[id] || { endpoint: '', key: '' };

// scheme, host and port, so a key entered for https never goes over plain http
const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/**
 * A parser's new endpoint ('' = the preset's own). Its key (and app ID) were entered for the old origin,
 * so an address on another one leaves them behind; a key typed before Other had any address stays.
 */
export function parserEndpointPatch(settings: AppSettings, preset: ParserPreset | null, id: string, endpoint: string): Partial<AppSettings> {
  const was = savedParser(settings, id);
  const own = id === CUSTOM_PARSER ? '' : preset?.endpoint || '';
  // any address counts, even one that isn't a URL: its key wasn't entered for the next one either
  const before = was.endpoint || own;
  const moved = !!before && originOf(before) !== originOf(endpoint || own);
  return { parserSaved: { ...settings.parserSaved, [id]: moved ? { endpoint, key: '' } : { ...was, endpoint } } };
}

export function parserKeyPatch(settings: AppSettings, id: string, field: 'key' | 'appId', value: string): Partial<AppSettings> {
  return { parserSaved: { ...settings.parserSaved, [id]: { ...savedParser(settings, id), [field]: value } } };
}

/** The parser part of a PDF transfer request; what's left out falls back to the preset (and for MinerU, the .env file). */
export function parserConfigFor(settings: AppSettings, preset: ParserPreset | null): ParserConfig {
  const id = parserId(settings, preset);
  const { endpoint, key, appId } = savedParser(settings, id);
  return {
    id,
    ...(id === CUSTOM_PARSER && { protocol: settings.parserProtocol }),
    ...(endpoint.trim() && { endpoint: endpoint.trim() }),
    ...(key.trim() && { key: key.trim() }),
    ...(appId?.trim() && { appId: appId.trim() })
  };
}

/** What the chosen parser still needs before a PDF transfer can start, or ''. */
export function parserWarning(settings: AppSettings, preset: ParserPreset | null) {
  if (!preset) return '';
  const id = parserId(settings, preset);
  const { endpoint, key, appId } = savedParser(settings, id);
  if (id === CUSTOM_PARSER) return endpoint.trim() ? '' : 'Needs the parser’s address in Settings → Template transfer.';
  if (preset.keyOptional || (key.trim() && (!preset.appId || appId?.trim()))) return '';
  // MinerU's token can also come from the .env file
  return `Needs your ${preset.name} ${preset.appId ? 'app ID and app key' : preset.keyName} above${preset.id === 'mineru' ? ', or one in the .env file' : ''}.`;
}
