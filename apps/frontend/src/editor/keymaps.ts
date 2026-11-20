import { Compartment, Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

// Vim or Emacs keys in the source editor (Settings › Editor › Keys), off by default. Each package loads the first time
// it is chosen, and goes in ahead of Spectrum's own keys, so Vim's normal mode has Tab, Enter and Escape first.

export type EditorKeymap = 'default' | 'vim' | 'emacs';
export const EDITOR_KEYMAPS: [EditorKeymap, string][] = [
  ['default', 'Standard'],
  ['vim', 'Vim'],
  ['emacs', 'Emacs']
];

export const keymapCompartment = new Compartment();

/** A stored value as a keymap: anything but Vim or Emacs is the standard keys. */
export const editorKeymap = (value: unknown): EditorKeymap => (value === 'vim' || value === 'emacs' ? value : 'default');

let save: () => void = () => undefined;
let vimReady = false;

/** The extension for a keymap, [] for the standard keys or when its package can't load. onSave: Vim's :w. */
export async function keymapExtension(mode: EditorKeymap, onSave: () => void): Promise<Extension> {
  save = onSave;
  try {
    if (mode === 'vim') {
      const { vim, Vim } = await import('@replit/codemirror-vim');
      if (!vimReady) {
        Vim.defineEx('write', 'w', () => save());
        vimReady = true;
      }
      return Prec.highest(vim({ status: true }));
    }
    if (mode === 'emacs') {
      const { emacs } = await import('@replit/codemirror-emacs');
      return Prec.highest(emacs());
    }
  } catch {
    // the editor works on with the standard keys
  }
  return [];
}
