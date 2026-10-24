import type { ResearchResult, ResearchRun, ResearchSource } from '../../api/client';

export const SOURCES: [ResearchSource, string][] = [
  ['openalex', 'OpenAlex'],
  ['semanticscholar', 'Semantic Scholar'],
  ['arxiv', 'arXiv'],
  ['crossref', 'Crossref'],
  ['pubmed', 'PubMed'],
  ['web', 'Web'],
  ['bib', '.bib']
];
export const SOURCE_LABELS = Object.fromEntries(SOURCES) as Record<ResearchSource, string>;
/** Until the user picks: the scholarly databases and the project's own .bib */
export const DEFAULT_SOURCES: ResearchSource[] = ['openalex', 'semanticscholar', 'arxiv', 'crossref', 'bib'];

const number = new Intl.NumberFormat('en-AU');

/** "Ashish Vaswani, Noam Shazeer, Niki Parmar et al. · 2017 · NeurIPS" */
export const metaLine = (r: Pick<ResearchResult, 'authors' | 'year' | 'venue'>) =>
  [r.authors?.length ? `${r.authors.slice(0, 3).join(', ')}${r.authors.length > 3 ? ' et al.' : ''}` : '', r.year, r.venue].filter(Boolean).join(' · ');

export type Badge = { label: string; tone?: 'accent' | 'success' | 'warning'; title?: string };

/** What a result's row shows under its title: where it was found, how cited, whether open, and the .bib key. */
export function badges(r: ResearchResult): Badge[] {
  return [
    ...(r.inBib ? [{ label: `In .bib as ${r.inBib}`, tone: 'success' as const }] : []),
    ...r.sources.filter((s) => s !== 'bib').map((s) => ({ label: SOURCE_LABELS[s] || s })),
    ...(r.citations != null ? [{ label: `${number.format(r.citations)} ${r.citations === 1 ? 'citation' : 'citations'}` }] : []),
    ...(r.openAccess ? [{ label: 'Open access', tone: 'accent' as const }] : []),
    ...(r.preprint ? [{ label: 'Preprint', tone: 'warning' as const, title: 'No source found it published' }] : [])
  ];
}

/** "OpenAlex 10 · arXiv 2 · PubMed failed (…)", the sources in the order the chips show them. */
export function runLine(run: ResearchRun) {
  const parts = SOURCES.filter(([s]) => run.perSource[s]).map(([s, label]) => {
    const { count, error } = run.perSource[s]!;
    return error ? `${label} failed (${error})` : `${label} ${count}`;
  });
  if (run.triage) parts.push(run.triage.error ? `AI sorting failed (${run.triage.error})` : `AI sorted ${run.triage.count}`);
  return parts.join(' · ');
}

/** The year and preprint filters a run had, in words: "2017–2020, no preprints". */
export function filtersLine(run: ResearchRun) {
  const f = run.filters;
  if (!f) return '';
  const years = f.yearFrom && f.yearTo ? `${f.yearFrom}–${f.yearTo}` : f.yearFrom ? `from ${f.yearFrom}` : f.yearTo ? `to ${f.yearTo}` : '';
  return [years, f.preprints === false && 'no preprints'].filter(Boolean).join(', ');
}

export type Show = 'all' | 'keep' | 'drop' | 'undecided';

export const counts = (results: ResearchResult[]): Record<Show, number> => ({
  all: results.length,
  keep: results.filter((r) => r.decision === 'keep').length,
  drop: results.filter((r) => r.decision === 'drop').length,
  undecided: results.filter((r) => !r.decision).length
});

/**
 * The rows to show: those the filter picks whose title, authors, venue, abstract, theme or key hold the sidebar's
 * search; in All, the dropped ones last.
 */
export function shown(results: ResearchResult[], show: Show, search: string) {
  const needle = search.trim().toLowerCase();
  const said = (r: ResearchResult) => [r.title, r.authors?.join(' '), r.venue, r.abstract, r.theme, r.inBib, r.why].filter(Boolean).join(' ').toLowerCase();
  return results
    .filter((r) => (show === 'all' || (show === 'undecided' ? !r.decision : r.decision === show)) && (!needle || said(r).includes(needle)))
    .sort((a, b) => (show === 'all' ? Number(a.decision === 'drop') - Number(b.decision === 'drop') : 0));
}

/** Where a result's title links: its page, DOI or arXiv abstract. Sessions come with the project, so only web addresses. */
export const linkOf = (r: Pick<ResearchResult, 'url' | 'doi' | 'arxiv'>) =>
  [r.url, r.doi && `https://doi.org/${r.doi}`, r.arxiv && `https://arxiv.org/abs/${r.arxiv}`].find((u) => u && /^https?:\/\//i.test(u)) || '';

/** What Add kept to .bib sends: kept, and not in the .bib yet. */
export const keptToAdd = (results: ResearchResult[]) => results.filter((r) => r.decision === 'keep' && !r.inBib);

/** A year box's value as the search takes it: a whole year, or nothing. */
export function yearOf(text: string) {
  const year = Number(text.trim());
  return /^\d{4}$/.test(text.trim()) && year >= 1000 && year <= 3000 ? year : undefined;
}
