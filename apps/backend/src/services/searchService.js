import crypto from 'crypto';
import { searchArxiv, buildArxivBibtex } from './arxivService.js';

const TIMEOUT = 30_000;

export const SEARCH_PROVIDERS = ['openalex', 'semanticscholar', 'serpapi', 'tavily', 'brave'];

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function slug(text) {
  const word = String(text || '').toLowerCase().match(/[a-z]{4,}/)?.[0] || 'ref';
  return word.slice(0, 12);
}

function escapeBib(value) {
  return String(value || '').replace(/[{}]/g, '');
}

/** BibTeX for a plain web page. */
export function webBibtex({ title, url }) {
  const key = `${slug(title)}${crypto.createHash('sha1').update(url || title || '').digest('hex').slice(0, 4)}`;
  const today = new Date().toISOString().slice(0, 10);
  return `@misc{${key},\n  title={${escapeBib(title)}},\n  howpublished={\\url{${url}}},\n  note={Accessed ${today}}\n}`;
}

function paperBibtex({ title, authors = [], year, venue, url }) {
  const first = String(authors[0] || 'anon').split(/\s+/).pop().toLowerCase().replace(/[^a-z]/g, '') || 'anon';
  const key = `${first}${year || ''}${slug(title)}`;
  const lines = [`  title={${escapeBib(title)}}`, `  author={${authors.map(escapeBib).join(' and ')}}`];
  if (year) lines.push(`  year={${year}}`);
  if (venue) lines.push(`  journal={${escapeBib(venue)}}`);
  if (url) lines.push(`  url={${url}}`);
  return `@article{${key},\n${lines.join(',\n')}\n}`;
}

// Semantic Scholar sometimes emits entry types like @['JournalArticle']{...}
function cleanS2Bibtex(bibtex) {
  return String(bibtex || '').replace(/^@\s*\[[^\]]*\]\s*\{/, '@article{').trim();
}

// OpenAlex: free, no key, generous limits. Abstracts come as an inverted index.
export async function searchOpenAlex(query, limit = 5) {
  const params = new URLSearchParams({
    search: query,
    per_page: String(limit),
    select: 'id,doi,display_name,publication_year,authorships,primary_location,abstract_inverted_index'
  });
  const data = await getJson(`https://api.openalex.org/works?${params}`);
  return (data.results || []).map((work) => {
    const words = [];
    for (const [word, positions] of Object.entries(work.abstract_inverted_index || {})) {
      for (const pos of positions) words[pos] = word;
    }
    const authors = (work.authorships || []).map((a) => a.author?.display_name).filter(Boolean);
    const url = work.doi || work.primary_location?.landing_page_url || work.id || '';
    const year = work.publication_year ? String(work.publication_year) : '';
    const title = work.display_name || '';
    return {
      title,
      summary: words.filter(Boolean).join(' ').slice(0, 600),
      url,
      authors,
      year,
      bibtex: paperBibtex({ title, authors, year, venue: work.primary_location?.source?.display_name, url }),
      source: 'openalex'
    };
  });
}

export async function searchSemanticScholar(query, limit = 5, apiKey = '') {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: 'title,abstract,url,year,authors,venue,externalIds,citationStyles'
  });
  const data = await getJson(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`, {
    headers: apiKey ? { 'x-api-key': apiKey } : {}
  });
  return (data.data || []).map((paper) => {
    const authors = (paper.authors || []).map((a) => a.name);
    const url = paper.url || (paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : '');
    return {
      title: paper.title || '',
      summary: String(paper.abstract || '').slice(0, 600),
      url,
      authors,
      year: paper.year ? String(paper.year) : '',
      bibtex: cleanS2Bibtex(paper.citationStyles?.bibtex) || paperBibtex({ ...paper, authors, url }),
      source: 'semanticscholar'
    };
  });
}

async function searchSerpApi(query, limit, apiKey, engine = 'google') {
  if (!apiKey) throw new Error('SerpApi needs an API key');
  const params = new URLSearchParams({ engine, q: query, api_key: apiKey, num: String(limit) });
  if (engine === 'baidu') params.set('rn', String(limit));
  const data = await getJson(`https://serpapi.com/search.json?${params}`);
  return (data.organic_results || []).slice(0, limit).map((item) => ({
    title: item.title || '',
    summary: item.snippet || item.publication_info?.summary || '',
    url: item.link || '',
    bibtex: webBibtex({ title: item.title, url: item.link }),
    source: `serpapi:${engine}`
  }));
}

async function searchTavily(query, limit, apiKey) {
  if (!apiKey) throw new Error('Tavily needs an API key');
  const data = await getJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: limit })
  });
  return (data.results || []).map((item) => ({
    title: item.title || '',
    summary: String(item.content || '').slice(0, 600),
    url: item.url || '',
    bibtex: webBibtex(item),
    source: 'tavily'
  }));
}

async function searchBrave(query, limit, apiKey) {
  if (!apiKey) throw new Error('Brave Search needs an API key');
  const params = new URLSearchParams({ q: query, count: String(limit) });
  const data = await getJson(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey }
  });
  return (data.web?.results || []).map((item) => ({
    title: item.title || '',
    summary: String(item.description || '').replace(/<[^>]+>/g, ''),
    url: item.url || '',
    bibtex: webBibtex(item),
    source: 'brave'
  }));
}

export async function webSearch({ provider = 'openalex', query, maxResults = 5, apiKey = '', engine }) {
  const limit = Math.min(10, Math.max(1, Number(maxResults) || 5));
  switch (provider) {
    case 'openalex':
      return searchOpenAlex(query, limit);
    case 'semanticscholar':
      return searchSemanticScholar(query, limit, apiKey);
    case 'serpapi':
      return searchSerpApi(query, limit, apiKey, engine || 'google');
    case 'tavily':
      return searchTavily(query, limit, apiKey);
    case 'brave':
      return searchBrave(query, limit, apiKey);
    default:
      throw new Error(`Unknown search provider "${provider}"`);
  }
}

/** Papers for a query: OpenAlex, then Semantic Scholar, then arXiv if both are down. */
export async function searchPapers(query, limit = 5) {
  for (const search of [searchOpenAlex, searchSemanticScholar]) {
    try {
      const results = await search(query, limit);
      if (results.length) return results;
    } catch {
      // try the next source
    }
  }
  const papers = await searchArxiv(query, limit);
  return papers.map((paper) => ({
    title: paper.title,
    summary: paper.abstract.slice(0, 600),
    url: paper.url,
    authors: paper.authors,
    year: paper.year,
    bibtex: buildArxivBibtex(paper),
    source: 'arxiv'
  }));
}
