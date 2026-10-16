import crypto from 'crypto';
import os from 'os';
import { searchArxiv, buildArxivBibtex } from './arxivService.js';
import { runSpawn } from './compileService.js';
import { resolvePythonExecutable } from './plotService.js';
import { baseKey, detectInput, parseName, recordFor, summaryOf, toBibtex } from './referenceService.js';

const TIMEOUT = 30_000;

export const SEARCH_PROVIDERS = ['openalex', 'semanticscholar', 'serpapi', 'exa', 'tavily', 'brave', 'ddgs'];

// Papers, standards and LaTeX documentation: Brave ranks these sites higher and Tavily prefers them,
// without leaving the rest of the web out
const CITABLE_SITES = [
  'arxiv.org', 'doi.org', 'openreview.net', 'aclanthology.org', 'proceedings.neurips.cc', 'proceedings.mlr.press',
  'openaccess.thecvf.com', 'dl.acm.org', 'ieeexplore.ieee.org', 'link.springer.com', 'sciencedirect.com', 'nature.com',
  'science.org', 'pnas.org', 'jstor.org', 'pubmed.ncbi.nlm.nih.gov', 'semanticscholar.org', 'iso.org', 'rfc-editor.org',
  'w3.org', 'nist.gov', 'ctan.org', 'tex.stackexchange.com', 'latex-project.org', 'tug.org'
];

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  const host = new URL(url).host;
  if (res.status === 429) throw new Error(`${host} is limiting requests. Wait a minute and try again.`);
  if (!res.ok) throw new Error(`${host} returned ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const issued = (date) => (/^\d{4}/.test(String(date ?? '')) ? { 'date-parts': [[Number(String(date).slice(0, 4))]] } : undefined);

/** A web page: @misc with its address and the day it was found. */
const page = (title, url, summary, date) => ({
  // Bing and Google mark PDFs in the title
  rec: { type: 'webpage', title: String(title || '').replace(/^\[?PDF\]?\s+/, ''), URL: url, issued: issued(date), accessed: new Date().toISOString() },
  summary
});

/** A search result from a CSL record, with BibTeX made the way the references resolver makes it. */
export function toResult({ rec, summary }, source) {
  // an @article or @inproceedings without its journal or proceedings is a broken entry
  if (!rec['container-title'] && /^(article-journal|paper-conference|chapter)$/.test(rec.type)) rec = { ...rec, type: 'misc' };
  const id = detectInput(rec.DOI || rec.URL || '');
  const meta = summaryOf(rec);
  // results never see the project's .bib, so their keys must not clash: AuthorYear plus a title word,
  // or for a page with no author a short hash of its address
  const key = baseKey(rec) + (rec.author?.length ? baseKey({ title: rec.title }) : crypto.createHash('sha1').update(rec.URL || rec.title || '').digest('hex').slice(0, 4));
  return {
    ...meta,
    title: meta.title || '',
    summary: String(summary || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 600),
    url: rec.URL || (meta.doi ? `https://doi.org/${meta.doi}` : ''),
    venue: [rec['container-title']].flat()[0] || undefined,
    doi: meta.doi || id.doi,
    arxiv: rec._arxiv?.id || id.arxiv,
    bibtex: toBibtex(rec, key),
    source
  };
}

// The resolver sends doi.org one request at a time and the Research tab searches in parallel, so all
// searches share a few lookups, and one still waiting at the deadline never starts
const LOOKUPS = 4;
const LOOKUP_MS = 8000;
let lookups = 0;
const waiting = [];
async function limited(fn) {
  if (lookups < LOOKUPS) lookups++;
  else await new Promise((resolve) => waiting.push(resolve));
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else lookups--;
  }
}

/** A DOI or arXiv result gets its BibTeX from the references resolver; past the deadline it keeps what it has. */
export async function upgradeResult(result, deadline = Date.now() + LOOKUP_MS) {
  if (!result.doi && !result.arxiv) return result;
  // an arXiv id goes through its DataCite DOI: arXiv's own API allows one request every few seconds
  const item = { kind: 'doi', doi: result.doi || `10.48550/arXiv.${result.arxiv}` };
  const lookup = limited(() => (Date.now() < deadline ? recordFor(item) : null)).catch(() => null);
  const late = new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()), null).unref());
  const record = await Promise.race([lookup, late]);
  return record ? { ...toResult({ rec: record, summary: result.summary }, result.source), url: result.url || record.URL } : result;
}

// ─── Scholarly databases: full metadata, so no lookups ───

// OpenAlex work types worth citing (not paratext, errata, datasets and the like) and their CSL types
const OPENALEX_TYPES = 'article|conference-paper|preprint|review|book|book-chapter|dissertation|report|standard|reference-entry';
const OPENALEX_CSL = { article: 'article-journal', review: 'article-journal', 'conference-paper': 'paper-conference', book: 'book', 'book-chapter': 'chapter', dissertation: 'thesis', report: 'report' };

// OpenAlex: free; a free key raises the daily budget. Abstracts come as an inverted index.
export async function searchOpenAlex(query, limit = 5, apiKey = '') {
  const params = new URLSearchParams({
    search: query,
    filter: `type:${OPENALEX_TYPES},is_retracted:false`,
    per_page: String(limit),
    select: 'id,doi,display_name,publication_year,type,authorships,primary_location,biblio,abstract_inverted_index'
  });
  if (apiKey) params.set('api_key', apiKey);
  const data = await getJson(`https://api.openalex.org/works?${params}`);
  return (data.results || []).map((work) => {
    const words = [];
    for (const [word, positions] of Object.entries(work.abstract_inverted_index || {})) {
      for (const pos of positions) words[pos] = word;
    }
    const location = work.primary_location || {};
    const source = location.source;
    const { volume, issue, first_page: firstPage, last_page: lastPage } = work.biblio || {};
    const rec = {
      type: work.type === 'article' && source?.type === 'conference' ? 'paper-conference' : OPENALEX_CSL[work.type] || 'misc',
      title: work.display_name,
      author: (work.authorships || []).map((a) => parseName(a.author?.display_name)).filter(Boolean),
      issued: issued(work.publication_year),
      // the name the publisher gave (2024 IEEE/CVF Conference on…) reads better than OpenAlex's own
      'container-title': location.raw_source_name || source?.display_name,
      volume,
      issue,
      page: [firstPage, lastPage].filter(Boolean).join('-'),
      publisher: source?.host_organization_name,
      DOI: String(work.doi || '').replace(/^https?:\/\/doi\.org\//i, ''),
      URL: location.landing_page_url || work.doi || work.id
    };
    return toResult({ rec, summary: words.filter(Boolean).join(' ') }, 'openalex');
  });
}

const S2_CSL = { JournalArticle: 'article-journal', Review: 'article-journal', Conference: 'paper-conference', Book: 'book', BookSection: 'chapter' };

export async function searchSemanticScholar(query, limit = 5, apiKey = '') {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: 'title,abstract,url,year,authors,venue,publicationVenue,journal,externalIds,publicationTypes'
  });
  const data = await getJson(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`, {
    headers: apiKey ? { 'x-api-key': apiKey } : {}
  });
  return (data.data || []).map((paper) => {
    const ids = paper.externalIds || {};
    const venue = paper.journal?.name || paper.publicationVenue?.name || paper.venue;
    // S2 files arXiv preprints as journal articles in the journal "ArXiv"
    const preprint = /^arxiv/i.test(venue || '');
    const rec = {
      type: preprint ? 'misc' : (paper.publicationTypes || []).map((t) => S2_CSL[t]).find(Boolean) || 'misc',
      title: paper.title,
      author: (paper.authors || []).map((a) => parseName(a.name)).filter(Boolean),
      issued: issued(paper.year),
      'container-title': preprint ? undefined : venue,
      volume: preprint ? undefined : paper.journal?.volume,
      page: preprint ? undefined : paper.journal?.pages,
      DOI: ids.DOI,
      _arxiv: ids.ArXiv ? { id: ids.ArXiv } : undefined,
      URL: paper.url
    };
    return toResult({ rec, summary: paper.abstract }, 'semanticscholar');
  });
}

// ─── Web search: pages, plus DOI and arXiv links looked up ───

/** Scholar's line under each result: "A Vaswani, N Shazeer… - Advances in neural …, 2017 - proceedings.neurips.cc" */
function scholarHit(item) {
  const [names = '', ...rest] = String(item.publication_info?.summary || '').split(' - ');
  // with two parts the second is the site
  const venueYear = rest.length > 1 ? rest[0] : '';
  const venue = venueYear.replace(/,?\s*\d{4}\s*$/, '').trim();
  return {
    rec: {
      type: item.type === 'Book' ? 'book' : 'article-journal',
      title: item.title,
      author: names.split(',').map((n) => parseName(n.replace(/…/g, ''))).filter(Boolean),
      issued: issued(venueYear.match(/\d{4}\s*$/)?.[0]),
      // Scholar shortens long venues with …, which would go into the .bib as is
      'container-title': /^\d*$|…/.test(venue) ? undefined : venue,
      URL: item.link
    },
    summary: item.snippet
  };
}

async function searchSerpApi(query, limit, apiKey, engine) {
  if (!apiKey) throw new Error('SerpApi needs an API key');
  const params = new URLSearchParams({ engine, q: query, api_key: apiKey, num: String(limit) });
  if (engine === 'baidu') params.set('rn', String(limit));
  const data = await getJson(`https://serpapi.com/search.json?${params}`);
  return (data.organic_results || []).slice(0, limit).map((item) =>
    engine === 'google_scholar' ? scholarHit(item) : page(item.title, item.link, item.snippet || item.publication_info?.summary, item.date)
  );
}

const EXA_CSL = { article: 'article-journal', review: 'article-journal', book: 'book', 'book-chapter': 'chapter', dissertation: 'thesis', report: 'report' };

// Exa: the publication category returns papers with structured authors, year and DOI
async function searchExa(query, limit, apiKey, scholarly) {
  if (!apiKey) throw new Error('Exa needs an API key');
  const data = await getJson('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      query,
      numResults: limit,
      ...(scholarly && { category: 'publication' }),
      contents: { highlights: { maxCharacters: 600 } }
    })
  });
  return (data.results || []).map((item) => {
    const work = item.entities?.find((e) => e.type === 'publication')?.properties;
    const summary = work?.abstract || (item.highlights || []).join(' … ') || item.summary;
    if (!work) return page(item.title, item.url, summary, item.publishedDate);
    const rec = {
      type: EXA_CSL[work.type] || 'misc',
      title: work.title || item.title,
      author: (work.authors || []).map((a) => parseName(a.name)).filter(Boolean),
      issued: issued(work.year || work.date),
      DOI: work.doi || undefined,
      URL: item.url
    };
    return { rec, summary };
  });
}

async function searchTavily(query, limit, apiKey) {
  if (!apiKey) throw new Error('Tavily needs an API key');
  const data = await getJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    // advanced (2 credits) finds better passages; prefer ranks the citable sites first and keeps the rest
    body: JSON.stringify({ query, max_results: limit, search_depth: 'advanced', include_domains: CITABLE_SITES, include_domains_mode: 'prefer' })
  });
  return (data.results || []).map((item) => page(item.title, item.url, item.content, item.published_date));
}

async function searchBrave(query, limit, apiKey) {
  if (!apiKey) throw new Error('Brave Search needs an API key');
  const params = new URLSearchParams({
    q: query,
    count: String(limit),
    text_decorations: 'false',
    // an inline Goggle: the citable sites rank higher, nothing is dropped
    goggles: CITABLE_SITES.map((site) => `$boost=3,site=${site}`).join('\n')
  });
  const data = await getJson(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey }
  });
  return (data.web?.results || []).map((item) => page(item.title, item.url, item.description, item.page_age));
}

// ddgs runs in Python: the options go in as one JSON argument, the answer comes back as one JSON line.
// -c puts the working folder first on the path, so nothing gets imported from there.
// ponytail: a python.bat shim (pyenv-win) runs through cmd.exe, which stops at the script's first line; write it to a file if that bites
const DDGS_SCRIPT = `
import sys
if sys.path and sys.path[0] == "":
    sys.path.pop(0)
import json, logging
logging.disable(logging.CRITICAL)
args = json.loads(sys.argv[1])
try:
    from ddgs import DDGS
except ImportError:
    print(json.dumps({"error": "missing"}))
    sys.exit()
try:
    print(json.dumps({"results": DDGS(timeout=10).text(args["query"], max_results=args["max"], backend=args["backend"])}))
except Exception as err:
    print(json.dumps({"error": type(err).__name__, "message": str(err)}))
`;

// the general engines: auto would put Wikipedia and Grokipedia first, and neither is a source to cite
const DDGS_BACKENDS = 'google,bing,brave,duckduckgo,startpage,mojeek,yahoo';

export async function searchDdgs(query, limit) {
  const python = resolvePythonExecutable();
  const args = JSON.stringify({ query, max: limit, backend: DDGS_BACKENDS });
  let output = '';
  let run;
  try {
    // runSpawn: hidden on Windows, its own process group, a time limit, and stopped when Spectrum quits
    run = await runSpawn(python, ['-c', DDGS_SCRIPT, args], os.tmpdir(), (chunk) => (output += chunk), process.env, TIMEOUT);
  } catch (err) {
    throw new Error(err.code === 'ENOENT' ? `Python wasn’t found (${python}). Install Python 3, then: pip install ddgs` : `Couldn’t run ${python}: ${err.message}`);
  }
  if (run.timedOut) throw new Error('DDGS took too long to answer. Try again.');
  let answer;
  try {
    answer = JSON.parse(output.trim().split(/\r?\n/).pop());
  } catch {
    throw new Error(`DDGS failed: ${output.trim().slice(0, 300) || `${python} exited with ${run.code}`}`);
  }
  if (answer.error === 'missing') throw new Error(`DDGS isn’t installed for ${python}. Install it with: pip install ddgs`);
  if (answer.error === 'RatelimitException') throw new Error('The search engines behind DDGS are limiting requests. Wait a minute and try again.');
  // ddgs raises when every engine came back empty
  if (answer.error === 'DDGSException' && answer.message === 'No results found.') return [];
  if (answer.error) throw new Error(`DDGS failed: ${answer.message || answer.error}`);
  return (answer.results || []).map((item) => page(item.title, item.href, item.body));
}

export async function webSearch({ provider = 'openalex', query, maxResults = 5, apiKey = '', engine, scholarly = true }) {
  const limit = Math.min(10, Math.max(1, Number(maxResults) || 5));
  if (provider === 'openalex') return searchOpenAlex(query, limit, apiKey);
  if (provider === 'semanticscholar') return searchSemanticScholar(query, limit, apiKey);
  const search = {
    serpapi: () => searchSerpApi(query, limit, apiKey, engine || 'google_scholar'),
    exa: () => searchExa(query, limit, apiKey, scholarly),
    tavily: () => searchTavily(query, limit, apiKey),
    brave: () => searchBrave(query, limit, apiKey),
    ddgs: () => searchDdgs(query, limit)
  }[provider];
  if (!search) throw new Error(`Unknown search provider "${provider}"`);
  const source = provider === 'serpapi' ? `serpapi:${engine || 'google_scholar'}` : provider;
  const hits = await search();
  const deadline = Date.now() + LOOKUP_MS;
  return Promise.all(hits.map((hit) => upgradeResult(toResult(hit, source), deadline)));
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
