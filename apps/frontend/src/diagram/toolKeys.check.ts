// Self-check for the tool keys (toolKeys.ts): which shortcut a key press is, as Settings has changed it, and when a
// press is being typed. Run:
// npx esbuild apps/frontend/src/diagram/toolKeys.check.ts --bundle --platform=node --format=esm --log-level=warning | node --input-type=module
import { isTyping, toolKeyOf } from './toolKeys';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const press = (key: string, more: Partial<KeyboardEvent> = {}) =>
  ({ key, code: `Key${key.toUpperCase()}`, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, ...more }) as KeyboardEvent;

const ALL = ['diagramWire', 'diagramMember', 'diagramTruss', 'diagramPoint', 'diagramVector'];
eq(['w', 'm', 't', 'p', 'v'].map((key) => toolKeyOf(press(key), ALL, {})), ALL, 'W, M, T, P and V');
eq(toolKeyOf(press('W', { shiftKey: true }), ALL, {}), undefined, 'not with Shift');
eq([toolKeyOf(press('w', { metaKey: true }), ALL, {}), toolKeyOf(press('w', { ctrlKey: true }), ALL, {})], [undefined, undefined], 'nor with ⌘ or Ctrl: closing the window stays the system’s');
eq(toolKeyOf(press('w', { repeat: true }), ALL, {}), undefined, 'a held key picks once');
eq(toolKeyOf(press('q'), ALL, {}), undefined, 'another key is nobody’s');
// a canvas answers only its own tools
eq([toolKeyOf(press('m'), ['diagramWire'], {}), toolKeyOf(press('w'), ['diagramMember', 'diagramTruss'], {})], [undefined, undefined], 'M is nothing on the circuit canvas, W nothing in Structures');
// as changed in Settings › Diagram composer
eq([toolKeyOf(press('w'), ALL, { diagramWire: 'c' }), toolKeyOf(press('c'), ALL, { diagramWire: 'c' })], [undefined, 'diagramWire'], 'a changed key');
eq(toolKeyOf(press('m'), ALL, { diagramMember: '' }), undefined, 'a removed one');
eq(toolKeyOf(press('B', { shiftKey: true }), ALL, { diagramTruss: 'Shift-b' }), 'diagramTruss', 'with a modifier');
// only the Diagram group's: a canvas can't be handed an editor or app shortcut by mistake
eq(toolKeyOf(press('s', { metaKey: true, ctrlKey: false }), ['save'], { save: 'Mod-s' }), undefined, 'not Save');

// typing: the key stays a letter in a field, a dropdown, an editor
const inside = (selector: string | null) => ({ closest: (asked: string) => (selector && asked.split(', ').includes(selector) ? {} : null) }) as unknown as EventTarget;
eq(['input', 'textarea', 'select', '[contenteditable="true"]', '.cm-editor'].map((s) => isTyping(inside(s))), [true, true, true, true, true], 'in a field, a list or an editor');
eq([isTyping(inside(null)), isTyping(inside('button')), isTyping(null), isTyping({} as EventTarget)], [false, false, false, false], 'not on the canvas, a button, or nothing');

console.log('toolKeys.check: ok');
