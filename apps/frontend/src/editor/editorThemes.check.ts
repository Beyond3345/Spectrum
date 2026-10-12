// Self-check for editor themes, the font list and LaTeX highlighting. Run:
// npx esbuild apps/frontend/src/editor/editorThemes.check.ts --bundle --platform=node --log-level=warning | node
import { DEFAULT_SETTINGS } from '../app/settings';
import { COLOUR_ROLES, EDITOR_THEMES, chosenColours, editorColours, editorFontFamily, highlightLines, overBackground, themeFor, wellColour } from './editorThemes';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

for (const t of EDITOR_THEMES) eq(COLOUR_ROLES.filter(([role]) => !t.colours[role]), [], `${t.id} sets every colour`);
eq(new Set(EDITOR_THEMES.map((t) => t.id)).size, EDITOR_THEMES.length, 'theme ids are unique');

eq(themeFor('dracula', 'dark').id, 'dracula', 'a dark theme for dark');
eq(themeFor('dracula', 'light').id, 'spectrum-light', 'a dark theme is never used for light');
eq(themeFor('gone', 'dark').id, 'spectrum-dark', 'an unknown theme is Spectrum');

const settings = { ...DEFAULT_SETTINGS, editorThemeLight: 'solarized-light', editorColours: { light: { comment: '#123456' }, dark: {} } };
eq(chosenColours(settings, 'light').comment, '#123456', 'a changed colour wins');
eq(chosenColours(settings, 'light').math, '#d33682', 'the rest come from the theme');
eq(chosenColours(settings, 'dark').comment, '#8b949e', 'changes stay in their mode');

// an opaque current line becomes see-through but paints the same colour over the background
const [r, g, b, a] = overBackground('#eee8d5', '#fdf6e3').match(/[\d.]+/g)!.map(Number);
eq([r, g, b].map((v, i) => Math.round([0xfd, 0xf6, 0xe3][i] * (1 - a) + v * a)), [0xee, 0xe8, 0xd5], 'see-through current line');
eq(overBackground('#383a420d', '#fafafa'), '#383a420d', 'already see-through');
eq(overBackground('#ffffff', '#ffffff'), 'transparent', 'same as the background');
eq(editorColours(settings, 'light').activeLine.startsWith('rgba('), true, 'the editor gets the see-through one');
eq(wellColour('#0969da33'), '#0969da', 'a well drops alpha');
eq(wellColour('color-mix(in srgb, var(--accent) 22%, transparent)'), '#0a84ff', 'the accent selection starts from blue');

eq(editorFontFamily(DEFAULT_SETTINGS), 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace', 'SF Mono by default');
eq(editorFontFamily({ ...DEFAULT_SETTINGS, editorFont: 'fira-code' }), '"Fira Code", ui-monospace, monospace', 'a bundled font');
eq(editorFontFamily({ ...DEFAULT_SETTINGS, editorFont: 'gone' }), editorFontFamily(DEFAULT_SETTINGS), 'an unknown font is SF Mono');
eq(editorFontFamily({ ...DEFAULT_SETTINGS, editorFont: 'custom', editorFontCustom: ' Iosevka Term ' }), '"Iosevka Term", ui-monospace, monospace', 'a typed name is quoted');
eq(editorFontFamily({ ...DEFAULT_SETTINGS, editorFont: 'custom', editorFontCustom: 'a"b\\c\n' }), '"a\\"b\\\\c", ui-monospace, monospace', 'quotes and backslashes are escaped');
eq(editorFontFamily({ ...DEFAULT_SETTINGS, editorFont: 'custom', editorFontCustom: '' }), editorFontFamily(DEFAULT_SETTINGS), 'no name yet is SF Mono');

// neighbouring pieces of one colour come out joined, as in }[
const coloured = (text: string) => highlightLines(text).map((line) => line.filter(([role]) => role).map(([role, piece]) => `${role}:${piece}`).join(' '));
eq(coloured('\\begin{figure*}[h]'), ['command:\\begin bracket:{ env:figure* bracket:}[ bracket:]'], 'environment name');
eq(coloured('\\includegraphics[width=\\linewidth]{plot.pdf}'), ['command:\\includegraphics bracket:[ command:\\linewidth bracket:]{ arg:plot.pdf bracket:}'], 'path after an option');
eq(coloured('\\citep [p.~3]{a, b} \\Cref{fig:x}'), ['command:\\citep bracket:[ bracket:]{ arg:a, b bracket:} command:\\Cref bracket:{ arg:fig:x bracket:}'], 'citation and reference keys');
eq(coloured('\\section{Intro}'), ['command:\\section bracket:{ bracket:}'], 'other arguments stay plain');
eq(coloured('50\\% off % note'), ['command:\\% comment:% note'], '\\% is not a comment');
eq(coloured('\\$5 and $x$'), ['command:\\$ command:$ math:x command:$'], '\\$ does not start maths');
eq(coloured('\\\\[2pt]'), ['command:\\\\ bracket:[ bracket:]'], 'a line break is not display maths');
console.log('editorThemes.check: ok');
