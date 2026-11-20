// Self-check for the command palette's lists and matching. Run:
// npx esbuild apps/frontend/src/app/commands.check.ts --bundle --platform=node --format=esm --log-level=warning --outfile=<scratch>/commands.mjs && node <scratch>/commands.mjs
import { matchScore, menuCommands, ranked, shortcutCommands } from './commands';
import { SHORTCUTS, formatShortcut } from './shortcuts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ─── a menu's items, as they are in the menu ───

let ran = '';
const run = (what: string) => () => (ran = what);
const fromMenu = menuCommands('Compile', [
  { heading: true, label: 'Compiler (this project)' },
  { label: 'XeLaTeX', checked: true, onSelect: run('xelatex') },
  { label: 'LuaLaTeX', checked: false, onSelect: run('lualatex') },
  { separator: true },
  false,
  null,
  { label: 'A folder', keepOpen: true, onSelect: run('folder') },
  { label: 'Stop compilation', disabled: true, onSelect: run('stop') },
  { label: 'Recompile from scratch', shortcut: '⌘R', onSelect: run('fresh') }
]);
eq(
  fromMenu.map((c) => [c.label, c.section, c.checked, c.disabled, c.shortcut]),
  [
    ['Compiler (this project): XeLaTeX', 'Compile', true, undefined, undefined],
    ['Compiler (this project): LuaLaTeX', 'Compile', false, undefined, undefined],
    ['Stop compilation', 'Compile', undefined, true, undefined],
    ['Recompile from scratch', 'Compile', undefined, undefined, '⌘R']
  ],
  'items under a heading are named after it, until a separator; folders and separators stay out'
);
fromMenu[3].run();
eq(ran, 'fresh', 'a command does what its menu item does');

// ─── the shortcuts, with the keys Settings has ───

const fromKeys = shortcutCommands({ bold: 'Mod-Alt-b', italic: '' }, (s) => (ran = s.id));
eq(fromKeys.length, SHORTCUTS.filter((s) => s.group !== 'Diagram').length - 2, 'every shortcut but the composer’s tool keys and the palette’s own');
eq(fromKeys.find((c) => c.label === 'Bold (\\textbf)')?.shortcut, formatShortcut('Mod-Alt-b'), 'a changed key');
eq(fromKeys.find((c) => c.label === 'Italic (\\textit)')?.shortcut, undefined, 'a removed key');
fromKeys.find((c) => c.label === 'Compile')!.run();
eq(ran, 'compile', 'runs the shortcut’s command');

// ─── matching what is typed ───

eq(matchScore('rfs', 'Recompile from scratch') !== null, true, 'the first letters of words');
eq(matchScore('scratch recompile', 'Recompile from scratch'), null, 'in order only');
eq(matchScore('XELATEX', 'Compiler: XeLaTeX') !== null, true, 'any case');
const names = ['Compile', 'Compile open document', 'Recompile from scratch', 'Save checkpoint', 'Settings Models'];
eq(ranked('comp', names, (n) => [n]).slice(0, 2), ['Compile', 'Compile open document'], 'a word’s start first, then the shorter');
eq(ranked('rec', names, (n) => [n])[0], 'Recompile from scratch', 'the start of the name');
eq(ranked('models', names, (n) => [n]), ['Settings Models'], 'a later word');
eq(ranked('', names, (n) => [n]), names, 'nothing typed: all, in order');
eq(ranked('zzz', names, (n) => [n]), [], 'no match');
// by its name first, or with where it lives: Compiler beats Compile's Recompile
const lines = [{ label: 'Recompile from scratch', section: 'Compile' }, { label: 'Compiler (this project): XeLaTeX', section: 'Compile' }, { label: 'Models', section: 'Settings' }];
const byName = (c: { label: string; section: string }) => [c.label, `${c.section} ${c.label}`];
eq(ranked('compiler', lines, byName)[0].label, 'Compiler (this project): XeLaTeX', 'the name first');
eq(ranked('settings models', lines, byName).map((c) => c.label), ['Models'], 'or its section and name');

console.log('commands: all checks passed');
