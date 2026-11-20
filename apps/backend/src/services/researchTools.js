import { baseKey, detectInput, recordFor, summaryOf, toBibtex } from './referenceService.js';
import { compareWork, matchLevel, surname } from './referenceMatch.js';
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

const MATCH_NOTE = {
  close: 'The work found differs a little from what you gave (a subtitle, a word, a year apart): check it is the one you mean before you cite it.'
};

/**
 * BibTeX for a DOI, an arXiv id or link, or else for a title, with what the code found of the match: { bibtex, match,
 * found, note? }. A DOI or an arXiv id is the work itself ('exact'). A title is searched, and each of the first five
 * hits is scored against it (title, and the first author's surname and the year when given): the best is 'exact' or
 * 'close', and a 'weak' best is refused with the nearest hits listed, so a title the model made up never comes back
 * dressed as a real entry.
 */
export async function fetchBibtex(id, { author = '', year = '' } = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Give a DOI, an arXiv id or a title.');
  const item = detectInput(id.trim());
  if (item.kind === 'doi' || item.kind === 'arxiv') {
    const record = await recordFor(item);
    const meta = summaryOf(record);
    return { bibtex: toBibtex(record, baseKey(record)), match: 'exact', found: { title: meta.title, authors: meta.authors.slice(0, 8), year: meta.year, doi: meta.doi } };
  }
  const want = { title: id.trim(), author: surname(author), year: String(year || '').match(/\d{4}/)?.[0] || '' };
  const hits = (await searchPapers(id.trim().slice(0, 500), 5)).filter((p) => p?.bibtex);
  const scored = hits.map((p) => {
    const match = matchLevel(compareWork(want, { title: p.title, author: surname([p.authors].flat()[0]), year: String(p.year || '') }));
    return { p, match, rank: { exact: 0, close: 1, weak: 2 }[match] };
  }).sort((a, b) => a.rank - b.rank);
  const best = scored[0];
  const found = (p) => ({ title: p.title, authors: [p.authors].flat().filter(Boolean).slice(0, 8), year: p.year, ...(p.doi && { doi: p.doi }), ...(p.arxiv && { arxiv: p.arxiv }) });
  if (!best || best.match === 'weak') {
    const near = scored.slice(0, 5).map(({ p }, i) => `${i + 1}. ${p.title} (${[[p.authors].flat()[0], p.year].filter(Boolean).join(', ')}${p.doi ? `, doi ${p.doi}` : p.arxiv ? `, arXiv ${p.arxiv}` : ''})`);
    throw new Error(`No work was found whose title${want.author ? ', first author' : ''}${want.year ? ' and year' : ''} match “${want.title.slice(0, 200)}”, so no BibTeX is given.${near.length ? ` The nearest:\n${near.join('\n')}\nIf one of these is the work, ask again with its DOI or arXiv id.` : ''} Never cite a work you cannot find.`);
  }
  // "Attention Is All You Need" is a 2017 paper and a 2025 book chapter: without an author or a year, say there are others
  const others = scored.filter((s) => s !== best && s.match === best.match && surname([s.p.authors].flat()[0]) !== surname([best.p.authors].flat()[0]));
  const note = [MATCH_NOTE[best.match], others.length && !(want.author && want.year) ? `${others.length + 1} works have this title; this one is ${[[best.p.authors].flat()[0], best.p.year].filter(Boolean).join(', ')}. The others: ${others.map(({ p }) => [[p.authors].flat()[0], p.year].filter(Boolean).join(', ')).join('; ')}. Give the author and year to be sure.` : ''].filter(Boolean).join(' ');
  return { bibtex: best.p.bibtex, match: best.match, found: found(best.p), ...(note && { note }) };
}
