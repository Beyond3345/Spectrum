// Self-check for the notice of a newer Spectrum: turned off, nothing is asked; hidden, that version stays hidden.
// npx esbuild apps/frontend/src/app/updateNotice.check.ts --bundle --platform=node --format=esm --outfile=/tmp/u.mjs --loader:.svg=text --loader:.css=empty && node /tmp/u.mjs
import { updateToShow } from './UpdateNotice';
import { DEFAULT_SETTINGS, loadSettings } from './settings';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

let asked = 0;
const ask = (answer: { available: boolean; version?: string; url?: string }) => async () => {
  asked += 1;
  return answer;
};
const out = { available: true, version: '2.8.0', url: 'https://github.com/Beyond3345/Spectrum/releases/tag/v2.8.0' };

eq(await updateToShow(false, '', ask(out)), null, 'off');
eq(asked, 0, 'off asks nothing');
eq(await updateToShow(true, '', ask(out)), { version: '2.8.0', url: out.url }, 'on, a newer one');
eq(await updateToShow(true, '2.8.0', ask(out)), null, 'that version hidden');
eq(await updateToShow(true, '2.7.9', ask(out)), { version: '2.8.0', url: out.url }, 'an older one hidden');
eq(await updateToShow(true, '', ask({ available: false })), null, 'none newer');

// on by default, and only a stored false turns it off
eq(DEFAULT_SETTINGS.updateCheck, true, 'default');
const stored = (value: unknown) => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: () => JSON.stringify(value) } } });
  return loadSettings().updateCheck;
};
eq([stored({}), stored({ updateCheck: false }), stored({ updateCheck: 'no' })], [true, false, true], 'stored values');

console.log('updateNotice.check: ok');
