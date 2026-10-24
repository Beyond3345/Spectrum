import { baseKey, detectInput, recordFor, toBibtex } from './referenceService.js';
import { searchPapers } from './searchService.js';

// Paper search and BibTeX without API keys, for the Spectrum agent's tools and the bundled MCP server's

/** Up to limit (10 at most) papers for a query, as an agent reads them. */
export async function literatureSearch(query, limit = 5) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('Give a search query.');
  const papers = await searchPapers(query.trim().slice(0, 500), Math.max(1, Math.min(10, Number(limit) || 5)));
  return papers.map((p) => ({
    title: p.title,
    authors: Array.isArray(p.authors) ? p.authors.slice(0, 8) : p.authors,
    year: p.year,
    venue: p.venue,
    doi: p.doi,
    arxiv: p.arxiv,
    url: p.url,
    summary: String(p.summary || '').slice(0, 400),
    source: p.source
  }));
}

/** BibTeX for a DOI, an arXiv id or link, or else the best match for a title. */
export async function fetchBibtex(id) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Give a DOI, an arXiv id or a title.');
  const item = detectInput(id.trim());
  if (item.kind === 'doi' || item.kind === 'arxiv') {
    const record = await recordFor(item);
    return toBibtex(record, baseKey(record));
  }
  const [best] = await searchPapers(id.trim().slice(0, 500), 1);
  if (!best?.bibtex) throw new Error('No matching work was found.');
  return best.bibtex;
}
