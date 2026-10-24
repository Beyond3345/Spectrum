// Self-check for shortcut matching: `node apps/frontend/src/app/shortcuts.check.ts` (Node ≥ 23 strips the types).
import { FIND_NEXT, FIND_PREVIOUS, IS_MAC, SHORTCUTS, canonical, formatShortcut, matchesShortcut, matchesZoomIn, shortcutFromEvent, shortcutKey, shortcutProblem } from './shortcuts.ts';

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
// Find in the PDF steps with the system's find next and previous
const next = IS_MAC ? press('g', 'KeyG', mod) : press('F3', 'F3');
eq([matchesShortcut(FIND_NEXT, next), matchesShortcut(FIND_PREVIOUS, next), matchesShortcut(FIND_PREVIOUS, { ...next, shiftKey: true })], [true, false, true], 'find next and previous');
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

// ⇧⌘S saves a checkpoint, ⌘S still only saves the file
const shiftS = press('S', 'KeyS', { ...mod, shiftKey: true });
eq(matchesShortcut(shortcutKey({}, 'saveVersion'), shiftS), true, 'save checkpoint');
eq(matchesShortcut(shortcutKey({}, 'save'), shiftS), false, 'save is not save checkpoint');
// ⇧⌘↩ compiles the open document, ⌘↩ the main file
const enters = (mods: object) => SHORTCUTS.filter((s) => matchesShortcut(shortcutKey({}, s.id), press('Enter', 'Enter', { ...mod, ...mods }))).map((s) => s.id);
eq([enters({}), enters({ shiftKey: true })], [['compile'], ['compileOpen']], 'compile shortcuts');
// ⌘1, ⌘2 and ⌘3 pick the view (editor only, both, PDF only); ⌘0 still fits the PDF's width, ⌘9 its page
const digit = (n: string) => SHORTCUTS.find((s) => matchesShortcut(shortcutKey({}, s.id), press(n, `Digit${n}`, mod)))?.id;
eq(['1', '2', '3', '0', '9'].map(digit), ['viewEditor', 'viewSplit', 'viewPdf', 'zoomWidth', 'zoomPage'], 'view shortcuts');
// the defaults are free and don't clash with each other, on a Mac and elsewhere
const defaults = SHORTCUTS.map((s) => canonical(s.key));
eq(defaults.filter((k, i) => defaults.indexOf(k) !== i), [], 'default shortcuts are distinct');
eq(SHORTCUTS.filter((s) => shortcutProblem(s.key)).map((s) => s.id), [], 'default shortcuts are allowed');
if (!IS_MAC) eq([formatShortcut('Shift-Mod-Enter'), formatShortcut('Alt-ArrowUp')], ['Ctrl+Shift+Enter', 'Alt+↑'], 'key names elsewhere');
console.log('shortcuts.check: ok');
