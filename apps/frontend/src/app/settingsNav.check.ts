// Self-check for Settings' sidebar: the panes other code opens are all still there, grouped, each icon's colour far
// from its neighbours', and the search finds a pane by its name or by a setting in it. Run:
// npx esbuild apps/frontend/src/app/settingsNav.check.ts --bundle --platform=node --format=esm --outfile=/tmp/nav.mjs --loader:.svg=text --loader:.css=empty && node /tmp/nav.mjs
import { ICON_COLOURS } from './appearance';
import { SECTION_GROUPS, SECTION_HUES, SECTION_LABELS, findSections } from './settingsNav';
import type { Section } from './settingsNav';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// every pane 2.7.0 had (EditorPage, ProjectPage, FirstRunPage, the agent tabs and the command palette open them by id),
// and Providers
const BEFORE: Section[] = ['appearance', 'editor', 'engines', 'checkpoints', 'composer', 'language', 'shortcuts', 'snippets', 'projects', 'github', 'models', 'personas', 'skills', 'agents', 'search', 'zotero', 'transfer', 'system'];
const rows = SECTION_GROUPS.flatMap(([, sections]) => sections);
const ids = rows.map(([id]) => id);
eq([...ids].sort(), [...BEFORE, 'providers'].sort(), 'every pane is in a group, once');
eq(SECTION_GROUPS.map(([name]) => name), ['General', 'Writing & Editor', 'Workspace & Sync', 'AI & Agents', 'Research & Import'], 'the five groups');
const groupOf = (id: Section) => SECTION_GROUPS.find(([, sections]) => sections.some(([s]) => s === id))![0];
eq([groupOf('editor'), groupOf('checkpoints'), groupOf('search'), groupOf('zotero'), groupOf('transfer'), groupOf('providers'), groupOf('models')],
  ['Writing & Editor', 'Workspace & Sync', 'Research & Import', 'Research & Import', 'Research & Import', 'AI & Agents', 'AI & Agents'], 'the panes that moved');
eq(Object.keys(SECTION_HUES).sort(), [...ids].sort(), 'a colour for every pane');
eq(Object.keys(SECTION_LABELS).sort(), [...ids].sort(), 'search words for every pane');

// neighbours in the list never share a colour, nor two that read alike (cyan beside teal, the old purple beside purple)
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  // a grey has no hue
  if (d < 0.12) return null;
  return (60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) + 360) % 360;
};
for (let i = 1; i < ids.length; i++) {
  const [a, b] = [SECTION_HUES[ids[i - 1]], SECTION_HUES[ids[i]]];
  if (a === b) throw new Error(`${ids[i - 1]} and ${ids[i]} are both ${a}`);
  for (const mode of [0, 1] as const) {
    const [ha, hb] = [hue(ICON_COLOURS[a][mode]), hue(ICON_COLOURS[b][mode])];
    if (ha === null || hb === null) continue;
    const apart = Math.abs(((ha - hb + 540) % 360) - 180);
    if (apart < 30) throw new Error(`${ids[i - 1]} (${a}) and ${ids[i]} (${b}) are ${apart.toFixed(0)}° apart in ${mode ? 'dark' : 'light'} mode`);
  }
}
// the measure itself: cyan and teal read alike, pink and green do not
eq([Math.abs(hue(ICON_COLOURS.cyan[0])! - hue(ICON_COLOURS.teal[0])!) < 30, Math.abs(hue(ICON_COLOURS.pink[0])! - hue(ICON_COLOURS.green[0])!) > 30], [true, true], 'the measure');

// the search
const found = (query: string) => [...findSections(query).keys()];
eq(found(''), ids, 'an empty search lists every pane, in order');
eq(found('   '), ids, 'so do spaces');
eq(found('proxy'), ['system'], 'a setting’s label');
eq(findSections('proxy').get('system'), 'Proxy', 'with the label that matched');
eq(findSections('editor').get('editor'), '', 'a pane’s own name needs no label');
eq(found('EDITOR').includes('editor'), true, 'whatever the case');
eq(found('writing'), ['editor', 'engines', 'language', 'snippets', 'composer'], 'a group’s name finds its panes');
eq(found('template transfer'), ['transfer'], 'the pane’s old name still finds it');
eq(found('api key').includes('providers'), true, 'two words in one label');
eq(found('models price'), ['models'], 'a word of the name and a word of a label');
eq(found('mohrs circle'), ['composer'], 'an apostrophe need not be typed');
eq(found('vim'), ['editor'], 'Vim');
eq(found('zzzz'), [], 'nothing found');

console.log('settingsNav.check: ok');
