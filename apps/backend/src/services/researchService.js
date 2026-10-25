// Research: a question searched in every chosen source at once, the results merged into a session the project keeps
// in .spectrum/research/<id>.json (1.10.4 never looks there), and kept papers added to the .bib through the
// references resolver, so a paper found twice never lands under two keys.
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { latexToText } from '../latex/conversion.js';
import { ITEM_ID } from '../routes/todos.js';
import { listFilesRecursive, readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { STOPWORDS, searchArxiv } from './arxivService.js';
import { callOpenAICompatible } from './llmService.js';
import { appPath, httpError, mutateProjectFiles } from './projectService.js';
import {
  baseKey, buildBibIndex, cleanDoi, crossrefBase, decodeEntities, detectInput, findDuplicate, get, getPage, normaliseTitle,
  parseBibEntries, parseName, resolveItems, summaryOf
} from './referenceService.js';
import { getJson, searchOpenAlex, searchSemanticScholar, searchWithFallback } from './searchService.js';
import { extractJSON } from './transferAgent/utils.js';

export const RESEARCH_SOURCES = ['openalex', 'semanticscholar', 'arxiv', 'crossref', 'pubmed', 'web', 'bib'];
export const SOURCE_NAMES = { openalex: 'OpenAlex', semanticscholar: 'Semantic Scholar', arxiv: 'arXiv', crossref: 'Crossref', pubmed: 'PubMed', web: 'the web', bib: 'the project’s .bib' };
// ponytail: 10 a source keeps one search quick and polite; Search again with other words reaches further
const PER_SOURCE = 10;
const TIMEOUT = 30_000;
const MAX_PDF = 50 * 1024 * 1024;

// a block (JATS's <jats:p>, a <br>) parts words, inline markup (<i>, <sup>) doesn't
const plain = (value) => decodeEntities(String(value ?? '').replace(/<\/?(?:[\w-]+:)?(?:p|sec|title|br|div|list-item)\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const arxivOfDoi = (doi) => String(doi || '').match(/^10\.48550\/arxiv\.(.+)$/i)?.[1] || '';
// an abs or pdf link's id, without its version
const arxivOfUrl = (url) => String(url || '').match(/arxiv\.org\/(?:abs|pdf)\/(.+?)(?:v\d+)?(?:\.pdf)?\/?$/i)?.[1] || '';
const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
/** A result without its empty fields. */
const tidy = (r) => Object.fromEntries(Object.entries(r).filter(([, v]) => !empty(v)));

/** The question's search words, lowercased and folded, without stop words: at most 8. */
export function keywords(question) {
  return normaliseTitle(question).split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w)).slice(0, 8);
}

// ─── Sources: each gives { title, authors, year, venue, doi, arxiv, url, abstract, citations, openAccess, preprint } ───
// preprint: true for a preprint, false when the source knows the work as published, missing when it can't tell

// a preprint server's record that its source files as an article
const PREPRINT_VENUE = /\b(?:arxiv|biorxiv|medrxiv|chemrxiv|ssrn|research square|preprints?)\b/i;

/** From a CSL record as the OpenAlex and Semantic Scholar searches return them (raw), or a Crossref work. */
function fromRecord({ rec, summary, citations, openAccess, preprint }, source) {
  const meta = summaryOf(rec);
  const venue = plain([rec['container-title']].flat()[0]);
  return tidy({
    ...meta,
    venue,
    // a published paper's open copy on arXiv says which preprint it is
    arxiv: rec._arxiv?.id || arxivOfDoi(meta.doi) || arxivOfUrl(openAccess) || arxivOfUrl(rec.URL),
    url: rec.URL,
    abstract: plain(summary),
    citations: Number.isFinite(citations) ? citations : undefined,
    openAccess,
    preprint: preprint || PREPRINT_VENUE.test(venue) ? true : venue ? false : undefined,
    sources: [source]
  });
}

async function fromArxiv(question, { yearFrom, yearTo }) {
  const words = keywords(question);
  const papers = await searchArxiv(words.length ? words.join(' ') : question, PER_SOURCE, { yearFrom, yearTo });
  return papers.map((p) => {
    // the id from the address keeps an old-style archive (hep-th/9901001), and loses its version
    const id = String(p.url).replace(/^.*arxiv\.org\/abs\//i, '').replace(/v\d+$/i, '');
    return tidy({
      title: p.title,
      authors: p.authors,
      year: p.year,
      venue: p.journalRef,
      doi: p.doi,
      arxiv: id,
      url: `https://arxiv.org/abs/${id}`,
      abstract: p.abstract,
      openAccess: `https://arxiv.org/pdf/${id}`,
      preprint: !p.doi && !p.journalRef,
      sources: ['arxiv']
    });
  });
}

// figures, peer reviews, grants and datasets crowd out the papers themselves
const NOT_A_WORK = new Set(['component', 'peer-review', 'grant', 'dataset', 'journal', 'journal-issue', 'journal-volume']);

async function fromCrossref(question, { yearFrom, yearTo }) {
  const filter = [yearFrom && `from-pub-date:${yearFrom}`, yearTo && `until-pub-date:${yearTo}`].filter(Boolean).join(',');
  const params = new URLSearchParams({
    'query.bibliographic': question,
    rows: String(PER_SOURCE),
    select: 'DOI,title,author,issued,container-title,type,abstract,is-referenced-by-count,URL',
    ...(filter && { filter })
  });
  // through the references resolver's queue: Crossref's public pool takes one request at a time
  const res = await get(`${crossrefBase()}/works?${params}`, 'application/json');
  if (!res.ok) throw new Error(`Crossref returned ${res.status}.`);
  const items = (await res.json().catch(() => null))?.message?.items;
  return (Array.isArray(items) ? items : [])
    .filter((it) => it?.DOI && [it.title].flat()[0] && !NOT_A_WORK.has(it.type))
    .map((it) => fromRecord({ rec: it, summary: it.abstract, citations: it['is-referenced-by-count'], preprint: it.type === 'posted-content' }, 'crossref'));
}

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const PUBMED_LISTS = new Set(['PubmedArticle', 'Author', 'AbstractText', 'ArticleId', 'PublicationType']);

/** PubMed's efetch XML: title and abstract kept whole (they hold <i> and <sup>), every value as text. */
export function parsePubmed(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    stopNodes: ['*.ArticleTitle', '*.AbstractText'],
    isArray: (name) => PUBMED_LISTS.has(name)
  });
  const text = (v) => plain(v && typeof v === 'object' ? v['#text'] : v);
  return (parser.parse(xml)?.PubmedArticleSet?.PubmedArticle || []).map((a) => {
    const citation = a.MedlineCitation || {};
    const article = citation.Article || {};
    const ids = a.PubmedData?.ArticleIdList?.ArticleId || [];
    const idOf = (type) => text(ids.find((i) => i?.['@_IdType'] === type));
    const date = article.Journal?.JournalIssue?.PubDate || {};
    const pmid = text(citation.PMID);
    const pmc = idOf('pmc');
    return tidy({
      title: text(article.ArticleTitle).replace(/\.$/, ''),
      authors: (article.AuthorList?.Author || []).map((au) => text(au.CollectiveName) || [text(au.ForeName), text(au.LastName)].filter(Boolean).join(' ')).filter(Boolean),
      year: (text(date.Year) || text(date.MedlineDate)).match(/\d{4}/)?.[0],
      venue: text(article.Journal?.Title),
      doi: idOf('doi') ? cleanDoi(idOf('doi')) : undefined,
      url: pmid && `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      // a structured abstract keeps its headings
      abstract: (article.Abstract?.AbstractText || []).map((t) => [t?.['@_Label'] && `${t['@_Label']}:`, text(t)].filter(Boolean).join(' ')).join(' '),
      openAccess: pmc ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmc}/` : undefined,
      preprint: (article.PublicationTypeList?.PublicationType || []).some((t) => text(t) === 'Preprint'),
      sources: ['pubmed']
    });
  });
}

async function fromPubmed(question, { yearFrom, yearTo, keys }) {
  const common = { db: 'pubmed', tool: 'Spectrum', ...(keys.ncbiKey && { api_key: keys.ncbiKey }) };
  const params = new URLSearchParams({ ...common, term: question, retmax: String(PER_SOURCE), retmode: 'json', sort: 'relevance' });
  if (yearFrom || yearTo) {
    params.set('datetype', 'pdat');
    params.set('mindate', String(yearFrom || 1800));
    params.set('maxdate', String(yearTo || 3000));
  }
  const ids = (await getJson(`${EUTILS}/esearch.fcgi?${params}`)).esearchresult?.idlist || [];
  if (!ids.length) return [];
  const res = await fetch(`${EUTILS}/efetch.fcgi?${new URLSearchParams({ ...common, id: ids.join(','), retmode: 'xml' })}`, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`PubMed returned ${res.status}.`);
  return parsePubmed(await res.text());
}

async function fromWeb(question, { searchConfig }) {
  const { results } = await searchWithFallback({ query: question, searchConfig, purpose: 'references', maxResults: PER_SOURCE });
  return results.map((r) => tidy({ title: r.title, authors: r.authors, year: r.year, venue: r.venue, doi: r.doi, arxiv: r.arxiv, url: r.url, abstract: r.summary, sources: ['web'] }));
}

/** "Vaswani, Ashish" and "Ashish Vaswani" alike. */
const bibAuthor = (name) => {
  const n = parseName(latexToText(name));
  return n ? n.literal || [n.given, n.family].filter(Boolean).join(' ') : '';
};

/** The project's own entries whose title, abstract or keywords hold at least half the question's words. */
export function fromBib(question, bibs) {
  const words = keywords(question);
  if (!words.length) return [];
  const need = Math.ceil(words.length / 2);
  return bibs
    .flatMap(({ text }) => parseBibEntries(text))
    .map((entry) => {
      const f = entry.fields;
      const said = normaliseTitle([f.title, f.abstract, f.keywords].filter(Boolean).join(' ')).split(' ');
      return { entry, hits: words.filter((w) => said.some((s) => s.startsWith(w))).length };
    })
    .filter((m) => m.hits >= need)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, PER_SOURCE)
    .map(({ entry: { key, fields: f } }) => tidy({
      title: latexToText(f.title || '').replace(/[{}]/g, '').trim(),
      authors: String(f.author || '').split(/\s+and\s+/i).map(bibAuthor).filter(Boolean),
      year: String(f.year || f.date || '').match(/\d{4}/)?.[0],
      venue: latexToText(f.journal || f.booktitle || f.journaltitle || f.publisher || '').replace(/[{}]/g, '').trim(),
      doi: f.doi ? cleanDoi(f.doi) : undefined,
      arxiv: /arxiv/i.test(f.archiveprefix || f.eprinttype || '') ? f.eprint : undefined,
      url: f.url,
      abstract: latexToText(f.abstract || '').replace(/[{}]/g, '').trim(),
      inBib: key,
      sources: ['bib']
    }));
}

const SEARCHES = {
  openalex: async (q, o) => (await searchOpenAlex(q, PER_SOURCE, o.keys.openalexKey, true, { mailto: o.keys.openalexEmail, ...o })).map((r) => fromRecord(r, 'openalex')),
  semanticscholar: async (q, o) => (await searchSemanticScholar(q, PER_SOURCE, o.keys.semanticScholarKey, true, o)).map((r) => fromRecord(r, 'semanticscholar')),
  arxiv: fromArxiv,
  crossref: fromCrossref,
  pubmed: fromPubmed,
  web: fromWeb,
  bib: async (q, o) => fromBib(q, o.bibs)
};

// ─── Merging ───

function identity(r) {
  const doi = String(r.doi || '').toLowerCase();
  return { doi, arxiv: String(r.arxiv || arxivOfDoi(doi)).toLowerCase().replace(/v\d+$/, ''), title: normaliseTitle(r.title || ''), year: Number(r.year) || 0, preprint: r.preprint === true };
}

/** The same DOI or arXiv id, or the same title within a year where no publisher DOIs disagree. */
function sameWork(a, b) {
  if (a.doi && a.doi === b.doi) return true;
  if (a.arxiv && a.arxiv === b.arxiv) return true;
  if (!a.title || a.title !== b.title) return false;
  // "Deep learning" is a book and a Nature review; a preprint's DOI (arXiv's, bioRxiv's) and a publisher's stand for one paper
  const own = (x) => (x.preprint || arxivOfDoi(x.doi) ? '' : x.doi);
  if (own(a) && own(b) && own(a) !== own(b)) return false;
  // a preprint can come out years before the paper
  return !a.year || !b.year || Math.abs(a.year - b.year) <= (a.preprint === b.preprint ? 1 : 3);
}

const filled = (r) => Object.values(r).filter((v) => !empty(v)).length;
const USER_FIELDS = ['id', 'decision', 'reason', 'why', 'suggest', 'theme', 'note', 'pdf'];

/** One work's two records: the fuller one's fields, the other's for its gaps, the longer abstract and author list. */
function combine(old, next) {
  const [base, other] = filled(next) > filled(old) ? [next, old] : [old, next];
  const out = { ...other, ...base };
  const longer = (k) => ((old[k]?.length || 0) >= (next[k]?.length || 0) ? old[k] : next[k]);
  out.abstract = longer('abstract');
  out.authors = longer('authors');
  out.citations = Math.max(old.citations ?? -1, next.citations ?? -1);
  if (out.citations < 0) delete out.citations;
  out.sources = [...new Set([...(old.sources || []), ...(next.sources || [])])];
  // published once any source knows it so, and then shown as published rather than as its preprint
  const published = [old, next].find((r) => r.preprint === false);
  if (published && [old, next].some((r) => r.preprint === true)) for (const k of ['doi', 'venue', 'year', 'url']) if (published[k]) out[k] = published[k];
  out.preprint = old.preprint === false || next.preprint === false ? false : old.preprint || next.preprint || undefined;
  for (const k of USER_FIELDS) if (old[k] !== undefined) out[k] = old[k];
  return tidy(out);
}

const resultId = (r) => {
  const id = identity(r);
  const basis = id.doi ? `doi:${id.doi}` : id.arxiv ? `arxiv:${id.arxiv}` : `title:${id.title}:${id.year}`;
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 12);
};

/**
 * The session's results with the new ones merged in, by DOI, then arXiv id, then title: a match keeps its id and the
 * user's decision; the others come after, each with an id from what it is, so the same paper has the same id in a
 * session another computer searched.
 */
export function mergeResults(results, incoming) {
  const out = results.map((r) => ({ ...r }));
  for (const next of incoming) {
    const id = identity(next);
    let i = out.findIndex((r) => sameWork(identity(r), id));
    if (i >= 0) {
      out[i] = combine(out[i], next);
      // a record that links two rows (a preprint's arXiv id and the paper's DOI) makes them one work
      for (let j = out.length - 1; j >= 0; j -= 1) {
        if (j === i || !sameWork(identity(out[i]), identity(out[j]))) continue;
        out[i] = combine(out[i], out[j]);
        out.splice(j, 1);
        if (j < i) i -= 1;
      }
    } else {
      let rid = resultId(next);
      while (out.some((r) => r.id === rid)) rid = crypto.createHash('sha1').update(rid).digest('hex').slice(0, 12);
      out.push({ id: rid, ...next });
    }
  }
  return out;
}

/** Marks each result found in the project's .bib with its key, and unmarks the ones taken out since. */
export function markInBib(results, index) {
  for (const r of results) {
    const id = identity(r);
    const firstAuthor = normaliseTitle(r.authors?.[0] || '').split(' ').at(-1) || '';
    const found =
      findDuplicate(index, { doi: id.doi, arxiv: id.arxiv, title: id.title, year: r.year || '', firstAuthor }) ||
      // a preprint whose published version the .bib has without a DOI or eprint, a year or more later: the same title
      // and first author, within the years sameWork allows a preprint
      (id.title && firstAuthor && id.year
        ? index.find((e) => e.title === id.title && e.firstAuthor === firstAuthor && e.year && Math.abs(Number(e.year) - id.year) <= 3 && !(e.doi && id.doi && e.doi !== id.doi))
        : null);
    if (found) r.inBib = found.key;
    else delete r.inBib;
  }
  return results;
}

async function readBibs(root) {
  const files = (await listFilesRecursive(root)).filter((it) => it.type === 'file' && /\.bib$/i.test(it.path));
  const bibs = [];
  for (const { path: file } of files) {
    const text = await fs.readFile(path.join(root, file), 'utf8').catch(() => null);
    if (text != null) bibs.push({ file, text });
  }
  return bibs;
}

const inYears = (r, { yearFrom, yearTo }) => !r.year || ((!yearFrom || Number(r.year) >= yearFrom) && (!yearTo || Number(r.year) <= yearTo));

// ─── Triage: one optional AI pass ───

const TRIAGE_PROMPT = [
  'You help a researcher sort search results for their question.',
  'Judge each paper from its title, venue and abstract.',
  'For each, write one sentence on what it offers for the question, suggest keep or drop, and give it a theme of two to four words.',
  'Suggest drop for papers that are off the question; give papers that belong together the same theme, worded the same way.',
  'Return JSON only: {"results":[{"index":0,"why":"…","suggest":"keep","theme":"…"}]}.'
].join(' ');

/** id → { why, suggest, theme } for up to 60 results, from one model call. */
async function triageResults(question, results, llmConfig) {
  const batch = results.slice(0, 60);
  const reply = await callOpenAICompatible({
    ...llmConfig,
    messages: [
      { role: 'system', content: TRIAGE_PROMPT },
      { role: 'user', content: JSON.stringify({ question, papers: batch.map((r, index) => ({ index, title: r.title, year: r.year, venue: r.venue, abstract: r.abstract?.slice(0, 500) })) }) }
    ]
  });
  if (!reply.ok) throw new Error(reply.error || 'The model didn’t answer.');
  const rows = extractJSON(reply.content)?.results;
  if (!Array.isArray(rows)) throw new Error('The model’s answer couldn’t be read.');
  const notes = new Map();
  for (const row of rows) {
    const r = batch[row?.index];
    if (!r || !['keep', 'drop'].includes(row.suggest)) continue;
    notes.set(r.id, tidy({ why: String(row.why || '').slice(0, 500), suggest: row.suggest, theme: String(row.theme || '').slice(0, 100) }));
  }
  return notes;
}

// ─── Sessions ───

// ponytail: one lock for every session's read-merge-write (searches and lookups run outside it); per-file if it bites.
// Each write also takes the project files' lock, which a GitHub pull holds while it merges sessions
let lock = Promise.resolve();
function locked(fn) {
  const run = lock.then(() => mutateProjectFiles(fn), () => mutateProjectFiles(fn));
  lock = run.catch(() => {});
  return run;
}

function sessionFile(root, id) {
  if (!ITEM_ID.test(String(id || ''))) throw httpError('Invalid id.', 400);
  return appPath(root, 'research', `${id}.json`);
}

async function readSession(root, id) {
  const session = await readJson(sessionFile(root, id)).catch((err) => {
    if (err.statusCode) throw err;
    throw httpError('That research session wasn’t found.', 404);
  });
  if (!Array.isArray(session.results)) session.results = [];
  if (!Array.isArray(session.runs)) session.runs = [];
  return session;
}

/** A session with its results marked against the .bib as it is now. */
export async function getSession(root, id) {
  const session = await readSession(root, id);
  markInBib(session.results, buildBibIndex(await readBibs(root)));
  return session;
}

/** Newest first, without their results; a sync app's conflict copy of one (not named by its id) isn't listed. */
export async function listSessions(root) {
  const dir = appPath(root, 'research');
  const out = [];
  for (const name of await fs.readdir(dir).catch(() => [])) {
    if (!name.endsWith('.json')) continue;
    const s = await readJson(path.join(dir, name)).catch(() => null);
    if (!s || name !== `${s.id}.json` || typeof s.question !== 'string') continue;
    const results = Array.isArray(s.results) ? s.results : [];
    out.push({ id: s.id, question: s.question, sources: s.sources, createdAt: s.createdAt, updatedAt: s.updatedAt, count: results.length, kept: results.filter((r) => r.decision === 'keep').length });
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function deleteSession(root, id) {
  await mutateProjectFiles(() => fs.rm(sessionFile(root, id), { force: true }));
}

const text = (max) => (v) => typeof v === 'string' && v.length <= max;
const choice = (v) => v === 'keep' || v === 'drop';
const EDITABLE = { decision: choice, suggest: choice, reason: text(2000), why: text(500), theme: text(100) };

/**
 * Merges a change into the stored session field by field, as to-dos keep what another save added: the question,
 * and per result (by id) its decision, reason, why, suggestion and theme; null takes a field out. Results the change
 * doesn't name, and ones it names that are gone, are left as they are.
 */
export async function updateSession(root, id, change) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) throw httpError('Invalid change.', 400);
  const { question, results = [] } = change;
  if (question != null && (!text(500)(question) || !question.trim())) throw httpError('A question is 1 to 500 characters.', 400);
  if (!Array.isArray(results)) throw httpError('Invalid results.', 400);
  for (const r of results) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string') throw httpError('Each result needs its id.', 400);
    for (const [k, v] of Object.entries(r)) {
      if (k !== 'id' && (!EDITABLE[k] || (v !== null && !EDITABLE[k](v)))) throw httpError(`A result’s ${k} can’t be set to that.`, 400);
    }
  }
  const file = sessionFile(root, id);
  await locked(async () => {
    const session = await readSession(root, id);
    if (question != null) session.question = question.trim();
    for (const { id: rid, ...fields } of results) {
      const r = session.results.find((x) => x.id === rid);
      if (!r) continue;
      for (const [k, v] of Object.entries(fields)) {
        if (v === null) delete r[k];
        else r[k] = v;
      }
    }
    session.updatedAt = new Date().toISOString();
    await writeJsonAtomic(file, session);
  });
  return getSession(root, id);
}

const redact = (message, keys) => Object.values(keys).filter((k) => typeof k === 'string' && k.length >= 6).reduce((m, k) => m.split(k).join('[redacted]'), String(message || 'Search failed.')).slice(0, 300);

/**
 * Runs the question against every source at once; one failing doesn't stop the rest, and each one's count or error
 * goes in the run log. A new session, or with sessionId another run of that one. keys: { openalexKey, openalexEmail,
 * semanticScholarKey, ncbiKey } (this computer's, never stored). triage: one model call adds why, suggest and theme
 * to the results that have none.
 */
export async function searchResearch({ root, question, sources, yearFrom, yearTo, preprints = true, keys = {}, searchConfig, llmConfig, triage = false, sessionId }) {
  const q = question.trim();
  const filters = { yearFrom, yearTo, preprints };
  if (sessionId) await readSession(root, sessionId);
  const bibs = await readBibs(root);
  const run = { at: new Date().toISOString(), queries: [q], perSource: {} };
  if (yearFrom || yearTo || !preprints) run.filters = tidy({ yearFrom, yearTo, preprints: preprints ? undefined : false });
  const found = (await Promise.all(sources.map(async (source) => {
    try {
      const list = (await SEARCHES[source](q, { ...filters, keys, searchConfig, bibs })).filter((r) => r.title && inYears(r, filters) && (preprints || !r.preprint));
      run.perSource[source] = { count: list.length };
      return list;
    } catch (err) {
      run.perSource[source] = { count: 0, error: redact(err.message, keys) };
      return [];
    }
  }))).flat();

  let notes = new Map();
  if (triage) {
    const before = sessionId ? (await readSession(root, sessionId)).results : [];
    const unsorted = mergeResults(before, found).filter((r) => !r.suggest);
    try {
      if (unsorted.length) notes = await triageResults(q, unsorted, llmConfig);
      run.triage = { count: notes.size };
    } catch (err) {
      run.triage = { count: 0, error: err.message };
    }
  }

  const session = await locked(async () => {
    const now = new Date().toISOString();
    const s = sessionId
      ? await readSession(root, sessionId)
      : { id: crypto.randomUUID(), question: q, sources, createdAt: now, updatedAt: now, runs: [], results: [] };
    s.sources = sources;
    s.updatedAt = now;
    s.runs.push(run);
    s.results = mergeResults(s.results, found).map((r) => (notes.has(r.id) && !r.suggest ? { ...r, ...notes.get(r.id) } : r));
    markInBib(s.results, buildBibIndex(bibs));
    await writeJsonAtomic(sessionFile(root, s.id), s);
    return s;
  });
  return session;
}

// ─── Per result: the .bib, a note and the PDF ───

/**
 * Adds results (by id; the kept ones not yet in the .bib when none are named) through the references resolver, which
 * catches duplicates by DOI, arXiv id or title across every .bib. Each result gets the key it is now under.
 */
export async function addResults({ root, id, resultIds, bibFile, searchConfig }) {
  const session = await readSession(root, id);
  markInBib(session.results, buildBibIndex(await readBibs(root)));
  const chosen = Array.isArray(resultIds) ? session.results.filter((r) => resultIds.includes(r.id)) : session.results.filter((r) => r.decision === 'keep' && !r.inBib);
  const ready = chosen.filter((r) => r.doi || r.arxiv || r.url);
  const lookups = ready.length ? await resolveItems(root, ready.map((r) => detectInput(r.doi || r.arxiv || r.url)), bibFile, searchConfig) : { results: [], bibFile: '', bibIncluded: true };
  const results = chosen.map((r) => {
    const i = ready.indexOf(r);
    if (i < 0) return { id: r.id, status: 'error', message: 'This result has no DOI, arXiv ID or link to look up.' };
    const { status, key, message } = lookups.results[i];
    return tidy({ id: r.id, status, key, message });
  });
  await locked(async () => {
    const s = await readSession(root, id);
    for (const done of results) {
      const r = s.results.find((x) => x.id === done.id);
      if (r && done.key) r.inBib = done.key;
    }
    s.updatedAt = new Date().toISOString();
    await writeJsonAtomic(sessionFile(root, id), s);
  });
  return { results, bibFile: lookups.bibFile, bibIncluded: lookups.bibIncluded, session: await getSession(root, id) };
}

function findResult(session, resultId) {
  const r = session.results.find((x) => x.id === resultId);
  if (!r) throw httpError('That result isn’t in the session.', 404);
  return r;
}

/** A file name for the paper: its .bib key, or AuthorYear and a title word as the resolver would make it. */
function stemOf(r) {
  const author = parseName(r.authors?.[0] || '');
  const rec = { author: author ? [author] : [], title: r.title, issued: r.year ? { 'date-parts': [[Number(r.year)]] } : undefined };
  const word = baseKey({ title: r.title });
  const stem = r.inBib || baseKey(rec) + (author && word !== 'Ref' ? word : '');
  // CON, AUX and the like are devices on Windows, as sanitiseFolderName has it
  return (stem.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || r.id).replace(/^(con|prn|aux|nul|com\d|lpt\d)(?=\.|$)/i, '$1_');
}

const FOLDERS = { note: ['research/notes', '.md'], pdf: ['research/papers', '.pdf'] };

/**
 * The result's note or PDF (kind), made with make(rel, result, session) unless it's there: at the path the session
 * keeps for it, or else the first free one from its name (stemOf, then -2, -3, …), which the session then keeps. So two
 * papers with the same AuthorYear and title word get a file each, and the name stays once the paper is in the .bib under
 * a key. make writes with 'wx'; { path, existing: true } when the file is there already.
 */
function keepFile(root, id, resultId, kind, make) {
  return locked(async () => {
    const session = await getSession(root, id);
    const r = findResult(session, resultId);
    const [folder, ext] = FOLDERS[kind];
    await fs.mkdir(safeJoin(root, folder), { recursive: true });
    const attempt = (rel) => make(rel, r, session).catch((err) => (err.code === 'EEXIST' ? null : Promise.reject(err)));
    if (r[kind]) return (await attempt(r[kind])) ?? { path: r[kind], existing: true };
    const stem = stemOf(r);
    for (let n = 1; ; n += 1) {
      const rel = `${folder}/${stem}${n > 1 ? `-${n}` : ''}${ext}`;
      const made = (await fs.stat(safeJoin(root, rel)).then(() => true, () => false)) ? null : await attempt(rel);
      if (!made) continue;
      r[kind] = rel;
      await writeJsonAtomic(sessionFile(root, id), session);
      return made;
    }
  });
}

const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

function noteText(r, session) {
  const run = session.runs.find((x) => r.sources?.some((s) => x.perSource?.[s]?.count)) || session.runs[0];
  return [
    `# ${r.title}`,
    '',
    [r.authors?.join(', '), r.year, r.venue && `*${r.venue}*`].filter(Boolean).join('. ') + '.',
    '',
    r.doi && `- DOI: [${r.doi}](https://doi.org/${r.doi})`,
    r.arxiv && `- arXiv: [${r.arxiv}](https://arxiv.org/abs/${r.arxiv})`,
    /^https?:\/\/\S+$/i.test(r.url || '') && !/doi\.org\/|arxiv\.org\/abs\//i.test(r.url) && `- Link: <${r.url}>`,
    r.inBib && `- Citation key: \`${r.inBib}\``,
    `- Found through ${(r.sources || []).map((s) => SOURCE_NAMES[s] || s).join(', ')} for “${session.question}”${run ? `, ${dateFormat.format(new Date(run.at))}` : ''}`,
    '',
    '## Abstract',
    '',
    r.abstract ? `> ${r.abstract}` : 'No abstract was found.',
    '',
    '## Notes',
    '',
    ''
  ].filter((line) => typeof line === 'string').join('\n');
}

/** research/notes/<key>.md for the result, made only when it isn't there yet (keepFile). */
export async function openNote({ root, id, resultId }) {
  const res = await keepFile(root, id, resultId, 'note', async (rel, r, session) => {
    await fs.writeFile(safeJoin(root, rel), noteText(r, session), { flag: 'wx' });
    return { path: rel, created: true };
  });
  return res.existing ? { path: res.path, created: false } : res;
}

// a download's whole time, the body's reading included: 10 MB at 1 Mbit/s takes 80 s (tests make it shorter)
const pdfTimeout = () => Number(process.env.SPECTRUM_PDF_TIMEOUT_MS) || 180_000;

/** The PDF's bytes, or null when the link gives something else; throws when the download fails partway. */
async function downloadPdf(url) {
  const { res } = await getPage(url, 'application/pdf', { timeoutMs: pdfTimeout() });
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    return null;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read().catch((err) => {
      const host = new URL(url).host;
      throw new Error(err?.name === 'TimeoutError' ? `${host} took too long to send the PDF.` : `The download from ${host} broke off.`);
    });
    if (done) break;
    size += value.length;
    if (size > MAX_PDF) {
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
    // a publisher's landing page instead of the paper
    if (size >= 5 && chunks.length === 1 && Buffer.from(value.subarray(0, 5)).toString('latin1') !== '%PDF-') {
      reader.cancel().catch(() => {});
      return null;
    }
  }
  const bytes = Buffer.concat(chunks);
  return bytes.subarray(0, 5).toString('latin1') === '%PDF-' ? bytes : null;
}

/** Open-access copies from Unpaywall, best first. */
async function unpaywallLinks(doi, email) {
  const data = await getJson(`https://api.unpaywall.org/v2/${doi.split('/').map(encodeURIComponent).join('/')}?email=${encodeURIComponent(email)}`);
  return [data.best_oa_location, ...(data.oa_locations || [])].map((l) => l?.url_for_pdf).filter(Boolean);
}

/**
 * Downloads the paper's open-access PDF into research/papers/, from arXiv, Unpaywall (with the user's email) or the
 * open copy a source named; one already there is kept and named.
 */
export async function fetchPdf({ root, id, resultId, email }) {
  const session = await getSession(root, id);
  const r = findResult(session, resultId);
  if (r.pdf && (await fs.stat(safeJoin(root, r.pdf)).then(() => true, () => false))) return { path: r.pdf, existing: true };
  const own = r.doi && !arxivOfDoi(r.doi) ? r.doi : '';
  const links = [];
  if (r.arxiv) links.push(`https://arxiv.org/pdf/${r.arxiv}`);
  if (own && email) links.push(...await unpaywallLinks(own, email).catch(() => []));
  if (r.openAccess) links.push(r.openAccess);
  if (!links.length) {
    throw httpError(own && !email ? 'No open-access copy is known for this paper. Add your email in Settings › Search so Spectrum can ask Unpaywall.' : 'No open-access PDF was found for this paper.', 404);
  }
  // why each link failed: not a PDF, or the download's own error (too slow, unreachable)
  let notPdf = false;
  let failure = null;
  for (const link of new Set(links)) {
    const bytes = await downloadPdf(link).catch((err) => {
      failure = err;
      return undefined;
    });
    if (bytes === null) notPdf = true;
    if (!bytes) continue;
    return keepFile(root, id, resultId, 'pdf', async (rel) => {
      await fs.writeFile(safeJoin(root, rel), bytes, { flag: 'wx' });
      return { path: rel };
    });
  }
  throw httpError(failure && !notPdf ? failure.message : 'The open-access copies found aren’t PDFs Spectrum can download. Open the paper’s page instead.', 404);
}
