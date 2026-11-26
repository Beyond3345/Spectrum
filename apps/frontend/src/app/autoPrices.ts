import { useEffect, useState } from 'react';
import { getModelsDevPrices } from '../api/client';
import type { AutoPrice } from '../api/client';
import type { Price, Prices } from './settings';

// models.dev's prices, once a session (the backend keeps them six hours), for the prices the user has not typed

type State = { prices: Record<string, AutoPrice>; syncedAt: number | null; error?: string };
let loaded: Promise<State> | null = null;
let latest: State = { prices: {}, syncedAt: null };
const listeners = new Set<(s: State) => void>();

function load(refresh = false) {
  if (refresh || !loaded) {
    loaded = getModelsDevPrices(refresh).then(
      (r) => ({ prices: r.prices || {}, syncedAt: r.syncedAt, ...(r.error && { error: r.error }) }),
      (err) => ({ ...latest, error: err instanceof Error ? err.message : String(err) })
    );
    void loaded.then((s) => { latest = s; listeners.forEach((l) => l(s)); });
  }
  return loaded;
}

/** models.dev's prices, when the user lets Spectrum take them (Settings › Models); refresh asks models.dev again now */
export function useAutoPrices(on: boolean) {
  const [state, setState] = useState(latest);
  useEffect(() => {
    if (!on) return;
    listeners.add(setState);
    void load();
    return () => void listeners.delete(setState);
  }, [on]);
  return { ...(on ? state : { prices: {}, syncedAt: null }), refresh: () => load(true) };
}

/** A model's name as models.dev's prices are kept under it: no vendor prefix, ":variant" or "[1m]", "@" as "-", lower case */
export function normalizeModelId(id: string) {
  let name = id.slice(id.lastIndexOf('/') + 1).split(':')[0].trim().replace(/@/g, '-').toLowerCase();
  if (name.endsWith('[1m]')) name = name.slice(0, -4).trim();
  return name;
}

/** models.dev's price for a model as Spectrum's own Price (US dollars per million tokens), or undefined */
export function autoPrice(auto: Record<string, AutoPrice>, model: string | undefined): Price | undefined {
  const p = model ? auto[normalizeModelId(model)] : undefined;
  return p && { input: p.input, output: p.output, ...(p.cacheRead !== undefined && { cached: p.cacheRead }) };
}

/** The user's prices, with models.dev's for every model they have not priced */
export function withAutoPrices(prices: Prices, auto: Record<string, AutoPrice>): Prices {
  return new Proxy(prices, { get: (target, model) => (typeof model === 'string' ? target[model] ?? autoPrice(auto, model) : undefined) });
}
