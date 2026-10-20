import crypto from 'crypto';
import os from 'os';
import { searchArxiv, buildArxivBibtex } from './arxivService.js';
import { runSpawn } from './compileService.js';
import { resolvePythonExecutable } from './plotService.js';
import { baseKey, detectInput, issuedFromDate, parseName, recordFor, summaryOf, toBibtex, yearOf } from './referenceService.js';
import { nativeWebSearch } from './llmService.js';
import { extractJSON } from './transferAgent/utils.js';

const TIMEOUT = 30_000;

export const SEARCH_PROVIDERS = ['llm', 'openalex', 'semanticscholar', 'serpapi', 'exa', 'tavily', 'brave', 'ddgs'];

// Papers, standards and LaTeX documentation: Brave ranks these sites higher and Tavily prefers them,
// without leaving the rest of the web out
const CITABLE_SITES = [
  'arxiv.org', 'doi.org', 'openreview.net', 'aclanthology.org', 'proceedings.neurips.cc', 'proceedings.mlr.press',
  'openaccess.thecvf.com', 'dl.acm.org', 'ieeexplore.ieee.org', 'link.springer.com', 'sciencedirect.com', 'nature.com',
  'science.org', 'pnas.org', 'jstor.org', 'pubmed.ncbi.nlm.nih.gov', 'semanticscholar.org', 'iso.org', 'rfc-editor.org',
  'w3.org', 'nist.gov', 'ctan.org', 'tex.stackexchange.com', 'latex-project.org', 'tug.org'
];

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  const host = new URL(url).host;
  // some (SerpApi, Brave) also say so when the plan's searches have run out: keep what they said
  if (res.status === 429) throw new Error(`${host} is limiting requests, or the plan’s searches have run out: ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`${host} returned ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const issued = issuedFromDate;

/** A web page keeps its address and available publication date. */
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
  // results never see the project's .bib, so their keys must not clash: AuthorYear plus a title word, or a
  // short hash of the work when there's no author or the title has no Latin word (张伟 2020 would be Ref2020Ref)
  const word = baseKey({ title: rec.title });
  const hash = crypto.createHash('sha1').update(rec.DOI || rec.URL || rec.title || '').digest('hex').slice(0, 4);
  const key = baseKey(rec) + (rec.author?.length && word !== 'Ref' ? word : hash);
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
export async function searchOpenAlex(query, limit = 5, apiKey = '', raw = false) {
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
    const result = { rec, summary: words.filter(Boolean).join(' ') };
    return raw ? result : toResult(result, 'openalex');
  });
}

const S2_CSL = { JournalArticle: 'article-journal', Review: 'article-journal', Conference: 'paper-conference', Book: 'book', BookSection: 'chapter' };

export async function searchSemanticScholar(query, limit = 5, apiKey = '', raw = false) {
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
    const result = { rec, summary: paper.abstract };
    return raw ? result : toResult(result, 'semanticscholar');
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
      author: [...names.split(',').map((n) => parseName(n.replace(/…/g, ''))).filter(Boolean), ...(/…/.test(names) ? [{ literal: 'others' }] : [])],
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
    if (!work) {
      const result = page(item.title, item.url, summary, item.publishedDate);
      result.rec.author = item.author ? [parseName(item.author)].filter(Boolean) : [];
      return result;
    }
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

async function searchTavily(query, limit, apiKey, references = true) {
  if (!apiKey) throw new Error('Tavily needs an API key');
  const data = await getJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    // advanced (2 credits) finds better passages; prefer ranks the citable sites first and keeps the rest
    body: JSON.stringify({ query, max_results: limit,
      ...(references ? { search_depth: 'advanced', include_domains: CITABLE_SITES, include_domains_mode: 'prefer', include_published_date: true } : { search_depth: 'basic' }) })
  });
  return (data.results || []).map((item) => page(item.title, item.url, item.content, item.published_date));
}

async function searchBrave(query, limit, apiKey, references = true) {
  if (!apiKey) throw new Error('Brave Search needs an API key');
  const params = new URLSearchParams({
    q: query,
    count: String(limit),
    text_decorations: 'false',
    // an inline Goggle: the citable sites rank higher, nothing is dropped
    ...(references && { goggles: CITABLE_SITES.map((site) => `$boost=3,site=${site}`).join('\n') })
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
// not startpage: ddgs before 9.14.3 doesn't know it, and an unknown name sends the whole list back to 'auto'
const DDGS_BACKENDS = 'google,bing,brave,duckduckgo,mojeek,yahoo';

export async function searchDdgs(query, limit) {
  const python = resolvePythonExecutable();
  const args = JSON.stringify({ query, max: limit, backend: DDGS_BACKENDS });
  let output = '';
  let run;
  try {
    // runSpawn: hidden on Windows, its own process group, a time limit, and stopped when Spectrum quits
    run = await runSpawn(python, ['-c', DDGS_SCRIPT, args], os.tmpdir(), (chunk) => (output += chunk), process.env, TIMEOUT);
  } catch (err) {
    throw new Error(err.code === 'ENOENT' ? `Python wasn’t found (${python}). Install Python 3, then: ${python} -m pip install ddgs` : `Couldn’t run ${python}: ${err.message}`);
  }
  if (run.timedOut) throw new Error('DDGS took too long to answer. Try again.');
  let answer;
  try {
    answer = JSON.parse(output.trim().split(/\r?\n/).pop());
  } catch {
    throw new Error(`DDGS failed: ${output.trim().slice(0, 300) || `${python} exited with ${run.code}`}`);
  }
  // into the Python Spectrum runs, whichever pip is first on PATH
  if (answer.error === 'missing') throw new Error(`DDGS isn’t installed for ${python}. Install it with: ${python} -m pip install ddgs`);
  // ddgs says this when every engine came back empty, and a blocked or rate-limited engine comes back empty too
  if (answer.error === 'DDGSException' && answer.message === 'No results found.') {
    throw new Error('DDGS found nothing. The search engines behind it may be limiting requests: try again in a minute, or reword the search.');
  }
  if (answer.error) throw new Error(`DDGS failed: ${answer.message || answer.error}`);
  return (answer.results || []).map((item) => page(item.title, item.href, item.body));
}

async function searchRecords({ provider = 'openalex', query, maxResults = 5, apiKey = '', engine, scholarly = true, purpose = 'references', llmConfig }) {
  const limit = Math.min(10, Math.max(1, Number(maxResults) || 5));
  const references = purpose === 'references';
  if (provider === 'openalex') return searchOpenAlex(query, limit, apiKey, true);
  if (provider === 'semanticscholar') return searchSemanticScholar(query, limit, apiKey, true);
  if (provider === 'llm') {
    const { content, sources } = await nativeWebSearch({ query, purpose, llmConfig });
    const items = extractJSON(content)?.results;
    // Only provider-attested URLs can become results, even if the model invents extra JSON rows.
    return sources.slice(0, limit).map((source) => {
      const item = Array.isArray(items) ? items.find((i) => i.url === source.url) : null;
      const result = page(item?.title || source.title || source.url, source.url, item?.summary || '', item?.publishedDate);
      result.rec.author = (Array.isArray(item?.authors) ? item.authors : []).map(parseName).filter(Boolean);
      const identifier = detectInput(item?.doi || '');
      if (identifier.kind === 'doi') result.rec.DOI = identifier.doi;
      return result;
    });
  }
  const search = {
    serpapi: () => searchSerpApi(query, limit, apiKey, references ? engine || 'google_scholar' : engine === 'baidu' ? 'baidu' : 'google'),
    exa: () => searchExa(query, limit, apiKey, references && scholarly),
    tavily: () => searchTavily(query, limit, apiKey, references),
    brave: () => searchBrave(query, limit, apiKey, references),
    ddgs: () => searchDdgs(query, limit)
  }[provider];
  if (!search) throw new Error(`Unknown search provider "${provider}"`);
  return search();
}

export async function webSearch(options) {
  const { provider = 'openalex', engine, purpose = 'references' } = options;
  const source = provider === 'serpapi' ? `serpapi:${engine || (purpose === 'references' ? 'google_scholar' : 'google')}` : provider;
  const hits = (await searchRecords(options)).filter((hit) => hit?.rec?.title && (hit.rec.DOI || /^https?:\/\//i.test(hit.rec.URL || '')));
  if (purpose === 'chat') return hits.map(({ rec, summary }) => ({ title: rec.title, url: rec.URL, summary: String(summary || '').slice(0, 1200), source, bibtex: '' }));
  if (['openalex', 'semanticscholar'].includes(provider)) return hits.map((hit) => toResult(hit, source));
  const deadline = Date.now() + LOOKUP_MS;
  return Promise.all(hits.map((hit) => upgradeResult(toResult(hit, source), deadline)));
}

/** Default first, then only enabled connections. Never try another provider's key. */
export function searchConnections(config = {}) {
  const connections = Array.isArray(config.connections) ? config.connections : [config];
  const unique = new Map(connections.filter((c) => c && SEARCH_PROVIDERS.includes(c.provider)).map((c) => [c.provider, c]));
  return [...unique.values()].sort((a, b) => Number(b.provider === config.provider) - Number(a.provider === config.provider));
}

async function tryConnections(config, run) {
  const errors = [];
  for (const connection of searchConnections(config)) {
    try {
      const results = await run({ ...connection, llmConfig: config.llmConfig });
      if (results?.length) return { results, provider: connection.provider, failures: errors };
      errors.push({ provider: connection.provider, error: 'No usable results.' });
    } catch (err) {
      let error = String(err.message || 'Search failed.');
      for (const c of [...searchConnections(config), config.llmConfig || {}]) if (c.apiKey) error = error.split(c.apiKey).join('[redacted]');
      errors.push({ provider: connection.provider, error });
    }
  }
  throw new Error(errors.length ? errors.map((e) => `${e.provider}: ${e.error}`).join(' · ') : 'Set up a search connection in Settings → Search.');
}

export function searchWithFallback({ searchConfig, ...options }) {
  return tryConnections(searchConfig || {}, (connection) => webSearch({ ...options, ...connection }));
}

/** Known URLs use exact-page metadata; free queries use reference-oriented search. */
export async function searchReferenceRecords({ searchConfig, query, targetUrl }) {
  const canonical = (value) => { try { const u = new URL(value); u.hash = ''; return u.href.replace(/\/$/, ''); } catch { return ''; } };
  let partial = [];
  try {
    return (await tryConnections(searchConfig || {}, async (connection) => {
      let hits;
      if (targetUrl && connection.provider === 'exa') {
        if (!connection.apiKey) throw new Error('Exa needs an API key');
        const base = (process.env.SPECTRUM_EXA_BASE || 'https://api.exa.ai').replace(/\/+$/, '');
        const data = await getJson(`${base}/contents`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': connection.apiKey }, body: JSON.stringify({ urls: [targetUrl], text: { maxCharacters: 1000 } }) });
        hits = (data.results || []).map((item) => {
          const hit = page(item.title, item.url, '', item.publishedDate);
          hit.rec.author = item.author ? [parseName(item.author)].filter(Boolean) : [];
          return hit;
        });
      } else {
        hits = await searchRecords({ ...connection, purpose: 'references', query: targetUrl ? `Citation metadata: title, author, original publication date, publisher and DOI for ${targetUrl}` : query });
      }
      const records = hits.map((hit) => hit.rec).filter((rec) => rec.title && (!targetUrl || canonical(rec.URL) === canonical(targetUrl)));
      if (targetUrl) {
        for (const record of records) {
          const previous = partial[0];
          const merged = previous ? { ...record, ...previous,
            author: previous.author?.length ? previous.author : record.author,
            issued: yearOf(previous) ? previous.issued : record.issued,
            publisher: previous.publisher || record.publisher } : record;
          partial = [merged];
          if (merged.author?.length && yearOf(merged)) return partial;
        }
        return [];
      }
      return records;
    })).results;
  } catch (err) { if (partial.length) return partial; throw err; }
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
