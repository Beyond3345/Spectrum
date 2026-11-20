import { useState } from 'react';
import { testModelConnection } from '../api/client';
import type { ConnectionTest, ProviderModel } from '../api/client';
import { errorText } from '../editor/shared';

/**
 * The Model menu: a preset's models with their labels, the recommended one marked, then the models only the provider
 * lists (from Test connection), plainly by id.
 */
export function modelChoices(models: ProviderModel[], listed: string[], recommended: string): [string, string][] {
  return [
    ...models.map((m): [string, string] => [m.id, m.id === recommended ? `${m.label} (recommended)` : m.label]),
    ...listed.filter((id) => !models.some((m) => m.id === id)).map((id): [string, string] => [id, id])
  ];
}

/** What Test connection says, with a word when the chosen model isn't among those the provider listed. */
export function testSays(result: ConnectionTest, model: string) {
  const missing = result.ok && model && result.models && !result.models.includes(model);
  return missing ? `${result.message} The model “${model}” isn’t in that list.` : result.message;
}

// each test's answer, by provider and endpoint, for this launch: never saved, and asked for only by the button
const answers = new Map<string, ConnectionTest & { key: string }>();

/**
 * Test connection for a provider ('custom' for Other), its endpoint as typed and the key as typed. models: the ids the
 * provider listed when last asked; result: what the last test said, while the key is still the one it tested.
 */
export function useConnectionTest(provider: string, endpoint: string, apiKey: string) {
  const id = `${provider} ${endpoint}`;
  const [testing, setTesting] = useState('');
  const [, heard] = useState(0);
  const got = answers.get(id);
  return {
    models: got?.models || [],
    result: got && got.key === apiKey ? got : null,
    testing: testing === id,
    run: async () => {
      setTesting(id);
      const res = await testModelConnection(provider, endpoint, apiKey).catch((err): ConnectionTest => ({ ok: false, kind: 'error', message: errorText(err) }));
      // a test that couldn't reach the list keeps the one an earlier test found
      answers.set(id, { ...res, models: res.models || answers.get(id)?.models, key: apiKey });
      setTesting('');
      heard((n) => n + 1);
    }
  };
}
