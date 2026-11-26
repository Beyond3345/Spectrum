// Self-check for the setup page: whether it opens, and its rows. Run:
// npx esbuild apps/frontend/src/app/firstRun.check.ts --bundle --platform=node --format=esm --log-level=warning --outfile=<scratch>/firstRun.mjs && node <scratch>/firstRun.mjs
import { DONE_KEY, SHOWN, hasModel, noteStart, setupDone, setupDue, startedFresh, texName } from './firstRun';
import { SETTINGS_KEY } from './settings';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(texName({ pdflatex: '/usr/local/texlive/2026/bin/universal-darwin/pdflatex' }), 'TeX Live 2026', 'TeX Live on a Mac');
eq(texName({ pdflatex: null, latexmk: 'C:\\texlive\\2025\\bin\\windows\\latexmk.exe' }), 'TeX Live 2025', 'TeX Live on Windows');
eq(texName({ pdflatex: 'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe' }), 'MiKTeX', 'MiKTeX');
eq(texName({ pdflatex: '/Library/TeX/texbin/pdflatex' }), 'TeX Live', 'MacTeX’s texbin');
eq(texName({ pdflatex: '/Library/TeX/texbin/pdflatex' }, '/usr/local/texlive/2026/bin/universal-darwin/pdflatex'), 'TeX Live 2026', 'its link followed');
eq(texName({ pdflatex: '/opt/tex/bin/pdflatex' }), 'the TeX on this computer', 'another TeX');
eq(texName({ pdflatex: null, tectonic: '/usr/bin/tectonic' }), null, 'no TeX: Tectonic compiles');

eq(hasModel({ llmProvider: '', llmApiKey: '' }), false, 'nothing set');
eq(hasModel({ llmProvider: 'ollama', llmApiKey: '' }), true, 'a model on this computer needs no key');
eq(hasModel({ llmProvider: '', llmApiKey: 'sk-test' }), true, 'a key');

// whether the setup page opens: the window's storage as it was at start, and the projects listed
const storage = (stored: Record<string, string>) => (key: string) => stored[key] ?? null;
eq(setupDue(storage({}), 0), true, 'a fresh install');
// the accent appearance.ts writes on every start, and the update notice's, are no sign of use
eq(setupDue(storage({ 'spectrum-accent': '', 'spectrum-update-hidden': '2.6.3' }), 0), true, 'what every start writes');
eq(setupDue(storage({}), 2), false, 'updating, with projects');
eq(setupDue(storage({ [SETTINGS_KEY]: '{"theme":"dark"}' }), 0), false, 'updating, with settings saved');
eq(setupDue(storage({ 'spectrum-projects-view': '{"getStartedHidden":true}' }), 0), false, 'updating, Get started hidden');
eq(setupDue(storage({ 'spectrum-settings-sync': '{"at":"2026-11-01"}' }), 0), false, 'settings from sync');
eq(setupDue(storage({ 'spectrum-editor-layout': '{}' }), 0), false, 'a project was opened');
eq(setupDue(storage({ [DONE_KEY]: '2026-11-26T00:00:00.000Z' }), 0), false, 'after it was skipped or finished');
// shown but not skipped or finished: due again, whatever Settings › Models or sync saved meanwhile, unless projects
eq(setupDue(storage({ [DONE_KEY]: SHOWN, [SETTINGS_KEY]: '{"llmProvider":"ollama"}' }), 0), true, 'shown, a model set, then quit');
eq(setupDue(storage({ [DONE_KEY]: SHOWN }), 1), false, 'shown, then a project made elsewhere');

// starts in a row, with the window's storage kept between them (main.tsx's noteStart, ProjectPage's setupDone)
const kept = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) }
};
const start = () => (noteStart(), startedFresh());
eq(start(), true, 'first start: the page shows');
kept.set(SETTINGS_KEY, '{}'); // Settings › Engines from the page, say, or sync
eq(start(), true, 'shown then reloaded or quit (Esc does nothing): shows again');
setupDone(); // Skip, Continue, or a template made or a folder opened from the page
eq(startedFresh(), false, 'skipped or finished: gone this session');
eq(start(), false, 'and on every start after');
kept.clear();
kept.set(SETTINGS_KEY, '{"theme":"dark"}');
eq(start(), false, 'an updating computer never starts fresh');

console.log('firstRun: all checks passed');
