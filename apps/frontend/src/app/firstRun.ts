import type { AppSettings } from './settings';

// The first-run checklist on Home and All projects (GetStarted.tsx): each row ticks itself from what the app already
// knows. Pure, for its check.

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
