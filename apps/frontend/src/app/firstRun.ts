import { SETTINGS_KEY } from './settings';
import type { AppSettings } from './settings';

// The setup page Spectrum opens on the first time it starts on a computer (FirstRunPage.tsx), and its rows, each ticked
// from what the app already knows. Pure but for noteStart, setupShown and setupDone, for its check.

/**
 * In the window's storage, so never synced: SHOWN while the page has shown but not been finished or skipped, which
 * keeps it due (whatever Settings › Models or sync saved meanwhile); a date once it has been.
 */
export const DONE_KEY = 'spectrum-first-run';
export const SHOWN = 'shown';

/**
 * What only use leaves in the window's storage: settings, the projects page's view (with 2.6's Get started hidden),
 * settings sync, the editor's layout. Nothing writes these on a first start (the accent, which appearance.ts writes on
 * every start, is left out).
 */
const USED_KEYS = [SETTINGS_KEY, 'spectrum-projects-view', 'spectrum-settings-sync', 'spectrum-editor-layout'];

/**
 * Whether the setup page is due: no project listed, and either shown here without being finished or skipped, or
 * nothing in the window's storage from use.
 */
export const setupDue = (stored: (key: string) => string | null, projects: number) =>
  projects === 0 && (stored(DONE_KEY) === SHOWN || ![DONE_KEY, ...USED_KEYS].some((key) => stored(key) !== null));

// the storage as it was at start (main.tsx), before settings sync can write any: a second computer's first start
// shows the page even once its settings have arrived
let fresh = false;
export function noteStart() {
  try {
    fresh = setupDue((key) => window.localStorage.getItem(key), 0);
  } catch {
    // no storage: nothing can mark the page done, so it never shows
  }
  // marked now, before sync or Settings can save anything: quitting, a reload or Esc isn't seeing the page, so it
  // opens again next start (and settles, with the projects listed, in ProjectPage)
  if (fresh) mark(SHOWN);
}

/** Whether this start may open on the setup page, until the projects are listed (setupDue with their number). */
export const startedFresh = () => fresh;

function mark(value: string) {
  try {
    window.localStorage.setItem(DONE_KEY, value);
  } catch {
    // no storage: noteStart found none either
  }
}

/** Skipped or finished (Continue, or a first project from the page), or not wanted: it doesn't open by itself again. */
export function setupDone() {
  fresh = false;
  mark(new Date().toISOString());
}

/**
 * The TeX the compiles use, by the folder its pdflatex (or latexmk, or xelatex) is in, links followed (real): "TeX Live
 * 2026", "MiKTeX", MacTeX's "TeX Live", or null when there is none (the built-in Tectonic then compiles).
 */
export function texName(tools: Record<string, string | null>, real?: string | null) {
  const found = real || tools.pdflatex || tools.latexmk || tools.xelatex || tools.lualatex;
  if (!found) return null;
  const year = found.match(/texlive[\\/](\d{4})[\\/]/i)?.[1];
  if (year) return `TeX Live ${year}`;
  if (/miktex/i.test(found)) return 'MiKTeX';
  // MacTeX's /Library/TeX/texbin, and a TeX Live without its year in the path
  return /texbin|texlive/i.test(found) ? 'TeX Live' : 'the TeX on this computer';
}

/** Whether a model for the assistant and agents is set: a provider chosen, or a key given. */
export const hasModel = (settings: Pick<AppSettings, 'llmProvider' | 'llmApiKey'>) => !!(settings.llmProvider || settings.llmApiKey);
