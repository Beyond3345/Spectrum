// Self-check for shortcut matching: `node apps/frontend/src/app/shortcuts.check.ts` (Node ≥ 23 strips the types).
import { IS_MAC, canonical, formatShortcut, matchesShortcut, matchesZoomIn, shortcutFromEvent, shortcutProblem } from './shortcuts.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const press = (key: string, code: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) =>
  ({ key, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent;
const mod = IS_MAC ? { metaKey: true } : { ctrlKey: true };

eq(canonical('Mod-Shift-k'), canonical('Shift-Mod-K'), 'modifier order and letter case');
eq(matchesShortcut('Mod-]', press(']', 'BracketRight', mod)), true, 'indent');
eq(matchesShortcut('Mod-]', press(']', 'BracketRight', { ...mod, shiftKey: true })), false, 'extra Shift is a different shortcut');
// ⌥/ types "÷" and ⇧⌘K reports "K": both fall back to the physical key
eq(matchesShortcut('Alt-/', press('÷', 'Slash', { altKey: true })), true, 'option-slash');
eq(matchesShortcut('Shift-Mod-k', press('K', 'KeyK', { ...mod, shiftKey: true })), true, 'shift letter');
eq(matchesShortcut('Mod-Alt-[', press('“', 'BracketLeft', { ...mod, altKey: true })), true, 'option bracket');
eq(matchesShortcut('Alt-ArrowUp', press('ArrowUp', 'ArrowUp', { altKey: true })), true, 'named key');
eq(matchesShortcut('Mod--', press('-', 'Minus', mod)), true, 'minus key');
eq(matchesShortcut('', press('s', 'KeyS', mod)), false, 'removed shortcut');
// other layouts: Colemak's E sits on the QWERTY K key, Dvorak's K on V; Russian falls back to the physical key
eq(matchesShortcut('Shift-Mod-e', press('E', 'KeyK', { ...mod, shiftKey: true })), true, 'Colemak shift letter');
eq(matchesShortcut('Shift-Mod-k', press('E', 'KeyK', { ...mod, shiftKey: true })), false, 'Colemak, not the QWERTY position');
eq(matchesShortcut('Shift-Mod-k', press('K', 'KeyV', { ...mod, shiftKey: true })), true, 'Dvorak shift letter');
eq(matchesShortcut('Mod-d', press('в', 'KeyD', mod)), true, 'Russian layout');

// zoom in answers to ⌘= and the usual ⌘+ spellings, until it's changed
eq(matchesZoomIn({}, press('=', 'Equal', mod)), true, 'zoom in');
eq(matchesZoomIn({}, press('+', 'Equal', { ...mod, shiftKey: true })), true, 'US ⌘⇧=');
eq(matchesZoomIn({}, press('+', 'BracketRight', mod)), true, 'German + key');
eq(matchesZoomIn({}, press('+', 'NumpadAdd', mod)), true, 'keypad +');
eq(matchesZoomIn({ zoomIn: 'Ctrl-Alt-z' }, press('+', 'NumpadAdd', mod)), false, 'not once changed');
eq(shortcutFromEvent(press('Meta', 'MetaLeft', mod)), null, 'lone modifier');
eq(canonical(shortcutFromEvent(press('÷', 'Slash', { altKey: true }))!), 'Alt-/', 'recorded option-slash');
eq(shortcutProblem('Mod-c') !== '', true, 'copy is reserved');
eq(shortcutProblem('Mod-f') !== '', true, 'find is fixed');
eq(shortcutProblem('Shift-k') !== '', true, 'needs a modifier');
eq(shortcutProblem('F5'), '', 'function key alone is fine');
eq(shortcutProblem('Ctrl-Alt-]'), '', 'free shortcut');
if (IS_MAC) eq(formatShortcut('Shift-Mod-Enter'), '⇧⌘↩', 'Mac symbols');
console.log('shortcuts.check: ok');
