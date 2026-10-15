import { EditorSelection, EditorState } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view';
import type { Command } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  copyLineDown,
  copyLineUp,
  cursorMatchingBracket,
  deleteLine,
  indentLess,
  indentMore,
  moveLineDown,
  moveLineUp,
  toggleComment,
  addCursorAbove,
  addCursorBelow
} from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, foldAll, foldCode, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting, unfoldAll, unfoldCode } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { gotoLine, highlightSelectionMatches, searchKeymap, selectNextOccurrence, selectSelectionMatches } from '@codemirror/search';

// Keyboard shortcuts in CodeMirror notation ("Mod-Shift-k": Mod is ⌘ on a Mac, Ctrl elsewhere).
// Settings stores only the ones the user changed; '' means the user removed the shortcut.

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export type AppCommand =
  | 'save'
  | 'saveVersion'
  | 'compile'
  | 'compileOpen'
  | 'assistant'
  | 'grammar'
  | 'suggest'
  | 'sidebar'
  | 'viewEditor'
  | 'viewSplit'
  | 'viewPdf'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomWidth';

export type Shortcut = {
  id: string;
  label: string;
  group: 'Editing' | 'Selection' | 'Folding' | 'PDF' | 'App';
  key: string;
  /** editor commands; app commands are run by the page that owns them */
  run?: Command;
};

/** Wraps each selection in \cmd{…}, or inserts \cmd{} with the cursor inside. */
function wrapIn(cmd: string): Command {
  return (view) => {
    view.dispatch(
      view.state.changeByRange((range) => {
        const text = view.state.sliceDoc(range.from, range.to);
        const start = range.from + cmd.length + 2;
        return {
          changes: { from: range.from, to: range.to, insert: `\\${cmd}{${text}}` },
          range: EditorSelection.range(start, start + text.length)
        };
      }),
      { scrollIntoView: true, userEvent: 'input' }
    );
    return true;
  };
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'indent', label: 'Indent lines', group: 'Editing', key: 'Mod-]', run: indentMore },
  { id: 'unindent', label: 'Unindent lines', group: 'Editing', key: 'Mod-[', run: indentLess },
  { id: 'comment', label: 'Comment or uncomment lines', group: 'Editing', key: 'Mod-/', run: toggleComment },
  { id: 'moveUp', label: 'Move lines up', group: 'Editing', key: 'Alt-ArrowUp', run: moveLineUp },
  { id: 'moveDown', label: 'Move lines down', group: 'Editing', key: 'Alt-ArrowDown', run: moveLineDown },
  { id: 'copyUp', label: 'Duplicate lines above', group: 'Editing', key: 'Shift-Alt-ArrowUp', run: copyLineUp },
  { id: 'copyDown', label: 'Duplicate lines below', group: 'Editing', key: 'Shift-Alt-ArrowDown', run: copyLineDown },
  { id: 'deleteLine', label: 'Delete lines', group: 'Editing', key: 'Shift-Mod-k', run: deleteLine },
  { id: 'bold', label: 'Bold (\\textbf)', group: 'Editing', key: 'Mod-b', run: wrapIn('textbf') },
  { id: 'italic', label: 'Italic (\\textit)', group: 'Editing', key: 'Mod-i', run: wrapIn('textit') },
  { id: 'emph', label: 'Emphasis (\\emph)', group: 'Editing', key: 'Shift-Mod-e', run: wrapIn('emph') },
  { id: 'nextMatch', label: 'Add next match to selection', group: 'Selection', key: 'Mod-d', run: selectNextOccurrence },
  { id: 'allMatches', label: 'Select all matches', group: 'Selection', key: 'Shift-Mod-l', run: selectSelectionMatches },
  { id: 'cursorAbove', label: 'Add cursor above', group: 'Selection', key: 'Mod-Alt-ArrowUp', run: addCursorAbove },
  { id: 'cursorBelow', label: 'Add cursor below', group: 'Selection', key: 'Mod-Alt-ArrowDown', run: addCursorBelow },
  { id: 'matchingBracket', label: 'Go to matching bracket', group: 'Selection', key: 'Shift-Mod-\\', run: cursorMatchingBracket },
  { id: 'gotoLine', label: 'Go to line', group: 'Selection', key: 'Ctrl-g', run: gotoLine },
  { id: 'fold', label: 'Fold', group: 'Folding', key: 'Mod-Alt-[', run: foldCode },
  { id: 'unfold', label: 'Unfold', group: 'Folding', key: 'Mod-Alt-]', run: unfoldCode },
  { id: 'foldAll', label: 'Fold all', group: 'Folding', key: 'Ctrl-Alt-[', run: foldAll },
  { id: 'unfoldAll', label: 'Unfold all', group: 'Folding', key: 'Ctrl-Alt-]', run: unfoldAll },
  { id: 'zoomIn', label: 'Zoom in', group: 'PDF', key: 'Mod-=' },
  { id: 'zoomOut', label: 'Zoom out', group: 'PDF', key: 'Mod--' },
  { id: 'zoomWidth', label: 'Fit width', group: 'PDF', key: 'Mod-0' },
  { id: 'save', label: 'Save', group: 'App', key: 'Mod-s' },
  { id: 'saveVersion', label: 'Save version', group: 'App', key: 'Shift-Mod-s' },
  { id: 'compile', label: 'Compile', group: 'App', key: 'Mod-Enter' },
  // the open file when it has a \documentclass of its own, else the main file
  { id: 'compileOpen', label: 'Compile open document', group: 'App', key: 'Shift-Mod-Enter' },
  { id: 'assistant', label: 'Show or hide the assistant', group: 'App', key: 'Mod-l' },
  // ⇧⌘; is macOS's own Spelling and Grammar shortcut
  { id: 'grammar', label: 'Check grammar', group: 'App', key: 'Shift-Mod-;' },
  { id: 'suggest', label: 'AI autocomplete', group: 'App', key: 'Alt-/' },
  { id: 'sidebar', label: 'Show or hide the sidebar', group: 'App', key: 'Mod-\\' },
  { id: 'viewEditor', label: 'Show the editor only', group: 'App', key: 'Mod-1' },
  { id: 'viewSplit', label: 'Show the editor and PDF', group: 'App', key: 'Mod-2' },
  { id: 'viewPdf', label: 'Show the PDF only', group: 'App', key: 'Mod-3' }
];

/** CodeMirror commands whose built-in bindings give way to the ones above. */
export const CUSTOMISABLE_COMMANDS = new Set<Command>(SHORTCUTS.flatMap((s) => (s.run ? [s.run] : [])));

/** codemirror's basicSetup, without the built-in bindings for commands listed above (Tab is the editor's own). */
export const editorBasics = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of(
    [...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap].filter(
      (binding) => !binding.run || !CUSTOMISABLE_COMMANDS.has(binding.run)
    )
  )
];

/** Shortcuts that can't be changed, shown in Settings so new ones don't clash with them. */
export const FIXED_SHORTCUTS: [string, string][] = [
  ['Find and replace', 'Mod-f'],
  ['Find next', 'Mod-g'],
  ['Find previous', 'Shift-Mod-g'],
  ['Undo', 'Mod-z'],
  ['Redo', 'Shift-Mod-z'],
  ['Settings', 'Mod-,']
];

/** Shortcuts macOS or the clipboard keep for themselves. */
const RESERVED = ['Mod-q', 'Mod-w', 'Mod-h', 'Mod-m', 'Mod-Tab', 'Mod-Space', 'Mod-c', 'Mod-v', 'Mod-x', 'Mod-a'];

export function shortcutKey(overrides: Record<string, string>, id: string) {
  const custom = overrides[id];
  return custom ?? SHORTCUTS.find((s) => s.id === id)?.key ?? '';
}

type Parsed = { mod: boolean; ctrl: boolean; alt: boolean; shift: boolean; key: string };

function parse(binding: string): Parsed | null {
  if (!binding) return null;
  const parts = binding.split(/-(?!$)/);
  const key = parts.pop()!;
  const has = (name: string) => parts.some((p) => p.toLowerCase() === name);
  const parsed = { mod: has('mod') || has('cmd') || has('meta'), ctrl: has('ctrl'), alt: has('alt'), shift: has('shift'), key: key.length === 1 ? key.toLowerCase() : key };
  // without a Command key, Ctrl and Mod are the same key
  if (!IS_MAC && parsed.ctrl) return { ...parsed, mod: true, ctrl: false };
  return parsed;
}

/** Zoom in also answers to ⌘+ (⌘⇧= on a US keyboard, the + key or keypad + elsewhere) while it keeps its default. */
export function matchesZoomIn(overrides: Record<string, string>, e: KeyboardEvent) {
  const binding = shortcutKey(overrides, 'zoomIn');
  if (matchesShortcut(binding, e)) return true;
  return canonical(binding) === 'Mod-=' && (matchesShortcut('Mod-+', e) || matchesShortcut('Shift-Mod-=', e) || matchesShortcut('Shift-Mod-+', e));
}

/** One spelling per shortcut, for comparing and storing. */
export function canonical(binding: string) {
  const p = parse(binding);
  if (!p) return '';
  return [p.ctrl && 'Ctrl', p.alt && 'Alt', p.shift && 'Shift', p.mod && 'Mod', p.key].filter(Boolean).join('-');
}

// physical keys, so ⌥ and ⇧ (which change the typed character on a Mac) still give the base key
const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[', BracketRight: ']', Slash: '/', Backslash: '\\', Comma: ',', Period: '.', Semicolon: ';',
  Quote: "'", Backquote: '`', Minus: '-', Equal: '=', Space: 'Space'
};

function eventKey(e: KeyboardEvent) {
  // a typed Latin letter wins, so Dvorak and Colemak match the key as labelled
  if (!e.altKey && /^[a-z]$/i.test(e.key)) return e.key.toLowerCase();
  // other plain characters too, unless they're non-Latin (a Russian layout's ⌘D reports "в")
  if (e.key.length === 1 && e.key !== ' ' && e.key < '\x80' && !e.altKey && !e.shiftKey) return e.key;
  const letter = e.code.match(/^(?:Key([A-Z])|Digit(\d))$/);
  if (letter) return (letter[1] || letter[2]).toLowerCase();
  return CODE_KEYS[e.code] || (e.key === ' ' ? 'Space' : e.key);
}

export function matchesShortcut(binding: string, e: KeyboardEvent) {
  const p = parse(binding);
  if (!p) return false;
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  const ctrl = IS_MAC ? e.ctrlKey : false;
  return p.mod === mod && p.ctrl === ctrl && p.alt === e.altKey && p.shift === e.shiftKey && p.key === eventKey(e);
}

/** The shortcut a key press would record, or null for a lone modifier. */
export function shortcutFromEvent(e: KeyboardEvent) {
  if (['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Fn'].includes(e.key)) return null;
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  const ctrl = IS_MAC && e.ctrlKey;
  return [ctrl && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', mod && 'Mod', eventKey(e)].filter(Boolean).join('-');
}

/** Why a recorded shortcut can't be used, or '' when it can. */
export function shortcutProblem(binding: string) {
  const p = parse(binding);
  if (!p) return '';
  const key = canonical(binding);
  if (RESERVED.map(canonical).includes(key)) return `${formatShortcut(binding)} is kept by macOS.`;
  const fixed = FIXED_SHORTCUTS.find(([, k]) => canonical(k) === key);
  if (fixed) return `${formatShortcut(binding)} is kept for ${fixed[0].toLowerCase()}.`;
  if (!p.mod && !p.ctrl && !p.alt && !/^F\d+$/.test(p.key)) return 'Add ⌘, ⌃ or ⌥ so the key can still be typed.';
  return '';
}

const KEY_SYMBOLS: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↩', Backspace: '⌫', Delete: '⌦',
  Escape: '⎋', Tab: '⇥', Space: 'Space', PageUp: '⇞', PageDown: '⇟', Home: '↖', End: '↘'
};

/** "Compile (⌘↩)" for a tooltip, or just the label when the shortcut was removed. */
export function withShortcut(overrides: Record<string, string>, label: string, id: string) {
  const key = formatShortcut(shortcutKey(overrides, id));
  return key ? `${label} (${key})` : label;
}

/** ⌃⌥⇧⌘K on a Mac, Ctrl+Alt+Shift+K elsewhere. */
export function formatShortcut(binding: string) {
  const p = parse(binding);
  if (!p) return '';
  const key = KEY_SYMBOLS[p.key] || (p.key.length === 1 ? p.key.toUpperCase() : p.key);
  if (IS_MAC) return `${p.ctrl ? '⌃' : ''}${p.alt ? '⌥' : ''}${p.shift ? '⇧' : ''}${p.mod ? '⌘' : ''}${key}`;
  return [p.mod && 'Ctrl', p.alt && 'Alt', p.shift && 'Shift', key].filter(Boolean).join('+');
}
