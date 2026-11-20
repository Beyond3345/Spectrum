// Self-check for Settings › Editor › Keys. Run:
// npx esbuild apps/frontend/src/editor/keymaps.check.ts --bundle --platform=node --format=esm --outfile=/tmp/keymaps.mjs --loader:.svg=text --loader:.css=empty && node /tmp/keymaps.mjs
import { EditorState } from '@codemirror/state';
import { EDITOR_KEYMAPS, editorKeymap, keymapCompartment, keymapExtension } from './keymaps';
import { loadSettings } from '../app/settings';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(EDITOR_KEYMAPS.map(([id]) => id), ['default', 'vim', 'emacs'], 'the three choices');
eq([editorKeymap('vim'), editorKeymap('emacs'), editorKeymap('default'), editorKeymap('VIM'), editorKeymap(3)], ['vim', 'emacs', 'default', 'default', 'default'], 'a stored value read back');

// off by default, and a stored choice that isn't one reads as the standard keys
const stored = (value: unknown) => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: () => JSON.stringify(value) } } });
  return loadSettings().editorKeymap;
};
eq(stored({}), 'default', 'no choice stored');
eq(stored({ editorKeymap: 'emacs' }), 'emacs', 'Emacs stored');
eq(stored({ editorKeymap: 'nano' }), 'default', 'an unknown choice');

// each package loads (an empty list would mean it failed and the standard keys stayed); the standard keys add nothing
const loaded = async (mode: 'default' | 'vim' | 'emacs') => {
  const ext = await keymapExtension(mode, () => undefined);
  EditorState.create({ extensions: keymapCompartment.of(ext) });
  return !(Array.isArray(ext) && ext.length === 0);
};
eq(await loaded('default'), false, 'standard keys add nothing');
eq(await loaded('vim'), true, 'Vim loads');
eq(await loaded('emacs'), true, 'Emacs loads');

console.log('keymaps.check: ok');
