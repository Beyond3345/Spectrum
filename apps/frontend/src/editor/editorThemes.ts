import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { highlightCode, tagHighlighter, tags } from '@lezer/highlight';
import { SETTINGS_CHANGE_EVENT, loadSettings } from '../app/settings';
import type { AppSettings, EditorColourRole } from '../app/settings';
import { latex } from '../latex/lang';

export type EditorMode = 'light' | 'dark';
export type EditorTheme = { id: string; label: string; mode: EditorMode; colours: Record<EditorColourRole, string> };

/** Every colour a theme sets: its label in Settings and the CSS variable the editor reads (editor-theme.css). */
export const COLOUR_ROLES: [EditorColourRole, string, string][] = [
  ['bg', 'Background', 'editor-bg'],
  ['fg', 'Text', 'editor-fg'],
  ['gutter', 'Line numbers', 'editor-gutter'],
  ['activeLine', 'Current line', 'editor-active-line'],
  ['selection', 'Selection', 'editor-selection'],
  ['cursor', 'Cursor', 'editor-cursor'],
  ['command', 'Commands', 'syntax-command'],
  ['comment', 'Comments', 'syntax-comment'],
  ['bracket', 'Brackets', 'syntax-bracket'],
  ['math', 'Maths', 'syntax-math'],
  ['arg', 'Arguments', 'syntax-arg'],
  ['env', 'Environments', 'syntax-env']
];

// colours in COLOUR_ROLES order; 8-digit hex carries alpha
const theme = (id: string, label: string, mode: EditorMode, ...colours: string[]): EditorTheme => ({
  id,
  label,
  mode,
  colours: Object.fromEntries(COLOUR_ROLES.map(([role], i) => [role, colours[i]])) as Record<EditorColourRole, string>
});

// Spectrum's selection follows the accent, as the rest of the app does
const ACCENT_SELECTION = 'color-mix(in srgb, var(--accent) 22%, transparent)';

export const EDITOR_THEMES: EditorTheme[] = [
  // Spectrum: the 1.1 colours from tokens.css; arguments and environments from the same GitHub Primer set
  theme('spectrum-light', 'Spectrum Light', 'light', '#ffffff', '#0d0d0d', '#a1a1a6', '#00000009', ACCENT_SELECTION, '#0d0d0d', '#116329', '#8c959f', '#9a6700', '#bf3989', '#0550ae', '#8250df'),
  theme('spectrum-dark', 'Spectrum Dark', 'dark', '#0f0f0f', '#ececec', '#6e6e73', '#ffffff0a', ACCENT_SELECTION, '#ececec', '#7ee787', '#8b949e', '#f2cc60', '#ff9bce', '#79c0ff', '#d2a8ff'),
  // GitHub: primer/github-vscode-theme 6.3.5 with @primer/primitives 7.10.0 (MIT)
  theme('github-light', 'GitHub Light', 'light', '#ffffff', '#24292f', '#8c959f', '#eaeef280', '#0969da33', '#0969da', '#cf222e', '#6e7781', '#953800', '#0550ae', '#0a3069', '#8250df'),
  theme('github-dark', 'GitHub Dark', 'dark', '#0d1117', '#c9d1d9', '#6e7681', '#6e76811a', '#58a6ff33', '#58a6ff', '#ff7b72', '#8b949e', '#ffa657', '#79c0ff', '#a5d6ff', '#d2a8ff'),
  // One: atom/atom one-light-syntax and one-dark-syntax (MIT)
  theme('one-light', 'One Light', 'light', '#fafafa', '#383a42', '#9d9d9f', '#383a420d', '#e5e5e6', '#526fff', '#a626a4', '#a0a1a7', '#0184bc', '#b76b01', '#50a14f', '#4078f2'),
  theme('one-dark', 'One Dark', 'dark', '#282c34', '#abb2bf', '#636d83', '#99bbff0a', '#3e4451', '#528bff', '#c678dd', '#5c6370', '#56b6c2', '#d19a66', '#98c379', '#61afef'),
  // Solarized: altercation/solarized, mapped as in VS Code's theme-solarized (MIT)
  theme('solarized-light', 'Solarized Light', 'light', '#fdf6e3', '#657b83', '#93a1a1', '#eee8d5', '#93a1a140', '#657b83', '#859900', '#93a1a1', '#cb4b16', '#d33682', '#2aa198', '#268bd2'),
  theme('solarized-dark', 'Solarized Dark', 'dark', '#002b36', '#839496', '#586e75', '#073642', '#274642', '#d30102', '#859900', '#586e75', '#cb4b16', '#d33682', '#2aa198', '#268bd2'),
  // Xcode: the colour values of Xcode's Default (Light) and Default (Dark)
  theme('xcode-light', 'Xcode Light', 'light', '#ffffff', '#262626', '#8e8e93', '#e8f2ff', '#a4cdff', '#000000', '#9b2393', '#5d6c79', '#643820', '#1c00cf', '#c41a16', '#0b4f79'),
  theme('xcode-dark', 'Xcode Dark', 'dark', '#1f1f24', '#ddddde', '#747478', '#23252b', '#515b70', '#ffffff', '#fc5fa3', '#6c7986', '#fd8f3f', '#d0bf69', '#fc6a5d', '#5dd8ff'),
  // Tokyo Night: folke/tokyonight.nvim (Apache-2.0)
  theme('tokyo-night-day', 'Tokyo Night Day', 'light', '#e1e2e7', '#3760bf', '#a8aecb', '#c4c8da', '#b7c1e3', '#3760bf', '#9854f1', '#848cb5', '#006a83', '#b15c00', '#587539', '#2e7de9'),
  theme('tokyo-night', 'Tokyo Night', 'dark', '#1a1b26', '#c0caf5', '#3b4261', '#292e42', '#283457', '#c0caf5', '#bb9af7', '#565f89', '#89ddff', '#ff9e64', '#9ece6a', '#7aa2f7'),
  // Catppuccin: catppuccin/palette 1.8.0 and its style guide (MIT)
  theme('catppuccin-latte', 'Catppuccin Latte', 'light', '#eff1f5', '#4c4f69', '#8c8fa1', '#4c4f691a', '#7c7f9340', '#dc8a78', '#8839ef', '#7c7f93', '#7c7f93', '#fe640b', '#40a02b', '#1e66f5'),
  theme('catppuccin-mocha', 'Catppuccin Mocha', 'dark', '#1e1e2e', '#cdd6f4', '#7f849c', '#cdd6f41a', '#9399b240', '#f5e0dc', '#cba6f7', '#9399b2', '#9399b2', '#fab387', '#a6e3a1', '#89b4fa'),
  // Gruvbox: morhetz/gruvbox (MIT)
  theme('gruvbox-light', 'Gruvbox Light', 'light', '#fbf1c7', '#3c3836', '#a89984', '#ebdbb2', '#bdae93', '#3c3836', '#9d0006', '#928374', '#af3a03', '#8f3f71', '#79740e', '#b57614'),
  theme('gruvbox-dark', 'Gruvbox Dark', 'dark', '#282828', '#ebdbb2', '#7c6f64', '#3c3836', '#665c54', '#ebdbb2', '#fb4934', '#928374', '#fe8019', '#d3869b', '#b8bb26', '#fabd2f'),
  // Nord: nordtheme/nord (MIT). Nord has no light editor theme: this one uses Snow Storm with accents darkened to 4.5:1
  theme('nord-light', 'Nord Light', 'light', '#eceff4', '#2e3440', '#8c93a1', '#e5e9f0', '#d8dee9', '#5e81ac', '#4d6e96', '#616e88', '#aa5338', '#8c5d83', '#597442', '#357587'),
  theme('nord', 'Nord', 'dark', '#2e3440', '#d8dee9', '#4c566a', '#3b4252', '#434c5ecc', '#d8dee9', '#81a1c1', '#616e88', '#8fbcbb', '#b48ead', '#a3be8c', '#88c0d0'),
  // Dracula and Alucard: draculatheme.com/spec (MIT)
  theme('alucard', 'Alucard', 'light', '#fffbeb', '#1f1f1f', '#6c664b', '#efeddc', '#cfcfde', '#1f1f1f', '#a3144d', '#6c664b', '#a34d14', '#644ac9', '#846e15', '#036a96'),
  theme('dracula', 'Dracula', 'dark', '#282a36', '#f8f8f2', '#6272a4', '#44475a66', '#44475a', '#f8f8f2', '#ff79c6', '#6272a4', '#ffb86c', '#bd93f9', '#f1fa8c', '#8be9fd'),
  // Monokai: VS Code's theme-monokai (MIT), after Wimer Hazenberg's original
  theme('monokai', 'Monokai', 'dark', '#272822', '#f8f8f2', '#90908a', '#3e3d32', '#878b9180', '#f8f8f0', '#f92672', '#88846f', '#fd971f', '#ae81ff', '#e6db74', '#a6e22e'),
  // Rosé Pine: rose-pine/neovim (MIT)
  theme('rose-pine-dawn', 'Rosé Pine Dawn', 'light', '#faf4ed', '#464261', '#9893a5', '#f2e9e1', '#dfdad9', '#464261', '#286983', '#9893a5', '#797593', '#56949f', '#ea9d34', '#d7827e'),
  theme('rose-pine', 'Rosé Pine', 'dark', '#191724', '#e0def4', '#6e6a86', '#26233a', '#403d52', '#e0def4', '#31748f', '#6e6a86', '#908caa', '#9ccfd8', '#f6c177', '#ebbcba'),
  // Ayu: ayu-theme/ayu-colors 9.1.0 (MIT)
  theme('ayu-light', 'Ayu Light', 'light', '#fcfcfc', '#5c6166', '#828e9f66', '#828e9f1a', '#035bd626', '#f29718', '#fa8532', '#adaeb1', '#f2a191', '#a37acc', '#86b300', '#22a4e6'),
  theme('ayu-mirage', 'Ayu Mirage', 'dark', '#242936', '#cccac2', '#707a8c80', '#1a1f29', '#409fff40', '#ffcc66', '#ffa659', '#6e7c8f', '#f29e74', '#dfbfff', '#d5ff80', '#73d0ff'),
  // Texifier-like: Spectrum's own, from Apple's system colours; nothing taken from Texifier
  theme('texifier-light', 'Texifier-like Light', 'light', '#ffffff', '#1d1d1f', '#aeaeb2', '#f2f2f7', '#b3d7ff', '#007aff', '#0040dd', '#8e8e93', '#8944ab', '#248a3d', '#c93400', '#0071a4'),
  theme('texifier-dark', 'Texifier-like Dark', 'dark', '#1e1e1e', '#e5e5e7', '#636366', '#2c2c2e', '#3f638b', '#0a84ff', '#409cff', '#98989d', '#da8fff', '#30db5b', '#ffb340', '#5de6ff'),
  // Overleaf-like: Ace's TextMate theme (BSD-3-Clause), which Ace's LaTeX mode uses; nothing taken from Overleaf
  theme('overleaf-light', 'Overleaf-like Light', 'light', '#ffffff', '#000000', '#333333', '#00000012', '#b5d5ff', '#000000', '#0000ff', '#4c886b', '#687687', '#036a07', '#000000', '#318495')
];

/** The theme for a mode; an unknown id, or one of the other mode, gets Spectrum. */
export function themeFor(id: string, mode: EditorMode) {
  return EDITOR_THEMES.find((t) => t.id === id && t.mode === mode) || EDITOR_THEMES.find((t) => t.id === `spectrum-${mode}`)!;
}

/** The chosen theme's colours with the ones changed in Settings on top. */
export function chosenColours(settings: AppSettings, mode: EditorMode): Record<EditorColourRole, string> {
  return { ...themeFor(mode === 'light' ? settings.editorThemeLight : settings.editorThemeDark, mode).colours, ...settings.editorColours[mode] };
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * The same colour, made see-through over bg. CodeMirror draws the selection beneath the lines,
 * so an opaque current line would hide the selection on it.
 */
export function overBackground(colour: string, bg: string) {
  if (!HEX6.test(colour) || !HEX6.test(bg)) return colour;
  const c = channels(colour);
  const b = channels(bg);
  // the least alpha that still reaches the colour, then the colour that gives it at that alpha
  const alpha = Math.max(...c.map((v, i) => Math.abs(v - b[i]) / (v > b[i] ? 255 - b[i] : b[i] || 1)));
  if (!alpha) return 'transparent';
  return `rgba(${c.map((v, i) => Math.round(b[i] + (v - b[i]) / alpha)).join(', ')}, ${alpha.toFixed(4)})`;
}

/** What the editor paints for a mode. */
export function editorColours(settings: AppSettings, mode: EditorMode) {
  const colours = chosenColours(settings, mode);
  return { ...colours, activeLine: overBackground(colours.activeLine, colours.bg) };
}

/** The opaque #rrggbb a colour well can show: alpha is dropped, and Spectrum's accent selection starts from the default blue. */
export const wellColour = (colour: string) => (/^#[0-9a-f]{6}/i.test(colour) ? colour.slice(0, 7).toLowerCase() : '#0a84ff');

// Mac fonts are used by name and can't be bundled; ui-monospace is how WebKit reaches SF Mono.
// The open-source ones are bundled from @fontsource (latin, regular and italic) in main.tsx.
export const EDITOR_FONTS = [
  { id: 'system', label: 'SF Mono (System)', css: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace' },
  { id: 'menlo', label: 'Menlo', css: 'Menlo, ui-monospace, monospace' },
  { id: 'monaco', label: 'Monaco', css: 'Monaco, ui-monospace, monospace' },
  { id: 'pt-mono', label: 'PT Mono', css: '"PT Mono", ui-monospace, monospace' },
  { id: 'andale-mono', label: 'Andale Mono', css: '"Andale Mono", ui-monospace, monospace' },
  { id: 'courier-new', label: 'Courier New', css: '"Courier New", Courier, monospace' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', css: '"JetBrains Mono", ui-monospace, monospace' },
  { id: 'fira-code', label: 'Fira Code', css: '"Fira Code", ui-monospace, monospace' },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', css: '"IBM Plex Mono", ui-monospace, monospace' },
  { id: 'source-code-pro', label: 'Source Code Pro', css: '"Source Code Pro", ui-monospace, monospace' }
];

/** The editor's font-family. A typed font name is quoted, so a stray quote or backslash can't break the list. */
export function editorFontFamily(settings: AppSettings) {
  const typed = settings.editorFontCustom.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (settings.editorFont === 'custom' && typed) return `"${typed.replace(/["\\]/g, '\\$&')}", ui-monospace, monospace`;
  return (EDITOR_FONTS.find((f) => f.id === settings.editorFont) || EDITOR_FONTS[0]).css;
}

// the tags lang.ts emits, by colour (as latexHighlight colours them)
const byRole = tagHighlighter([
  { tag: tags.keyword, class: 'command' },
  { tag: tags.comment, class: 'comment' },
  { tag: tags.bracket, class: 'bracket' },
  { tag: tags.number, class: 'math' },
  { tag: tags.string, class: 'arg' },
  { tag: tags.typeName, class: 'env' }
]);

/** LaTeX as lines of [role, text] pieces, coloured as the editor colours it ('' is plain text). */
export function highlightLines(text: string) {
  const tree = ensureSyntaxTree(EditorState.create({ doc: text, extensions: latex() }), text.length, 1e9)!;
  const lines: [string, string][][] = [[]];
  highlightCode(text, tree, byRole, (piece, role) => lines[lines.length - 1].push([role, piece]), () => lines.push([]));
  return lines;
}

const kebab = (role: string) => role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Puts both modes' colours (--ed-light-*, --ed-dark-*) and the font on <html> now and after every
 * settings change. editor-theme.css picks the mode, so System switches with macOS without any script.
 */
export function followEditorTheme() {
  const apply = () => {
    const settings = loadSettings();
    const style = document.documentElement.style;
    for (const mode of ['light', 'dark'] as const) {
      const colours = editorColours(settings, mode);
      for (const [role] of COLOUR_ROLES) style.setProperty(`--ed-${mode}-${kebab(role)}`, colours[role]);
    }
    style.setProperty('--editor-font', editorFontFamily(settings));
  };
  apply();
  window.addEventListener(SETTINGS_CHANGE_EVENT, apply);
  window.addEventListener('storage', apply);
}
