// Zotero: reading the library through Zotero's local API and Better BibTeX (the citation picker, a search, entries for
// the .bib under their Zotero keys), and keeping a Spectrum › <project> collection in step with each project's .bib
// through the local API's writes, which Zotero 10 added. The .bib stays the source of truth: nothing here edits it from
// Zotero's side, deletes a Zotero item, or makes a compile wait. Every call goes to 127.0.0.1, never localhost, which
// Node may look up as ::1 first, where Zotero doesn't listen.
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/constants.js';
import { latexToText } from '../latex/conversion.js';
import { citeKeys, matchBrace } from '../latex/text.js';
import { listFilesRecursive, writeJsonAtomic } from '../utils/fsUtils.js';
import { httpError, readMeta, serialiser } from './projectService.js';
import { readProjectSettings, updateProjectSettings } from './projectSettings.js';
import { appendEntries, baseKey, bibIdentity, cleanDoi, normaliseTitle, parseBibEntries, parseName } from './referenceService.js';

// tests point it at a mock Zotero
const base = () => (process.env.SPECTRUM_ZOTERO_BASE || 'http://127.0.0.1:23119').replace(/\/+$/, '');
// My Library, as the local API names it on every computer
const LIBRARY = 'users/0';
const LIB = `/api/${LIBRARY}`;
const TIMEOUT_MS = 10_000;
// Zotero's Allow prompt and the citation picker wait for the user, though not for ever
const PROMPT_MS = 10 * 60 * 1000;
// the permission Zotero gave, on this computer only and never sent to the window
const keyFile = () => path.join(DATA_DIR, 'zotero.json');

const NOT_OPEN = 'Zotero isn’t open. Start Zotero, then try again.';
const API_OFF = 'Zotero’s local API is off. In Zotero’s Settings › Advanced, tick “Allow other applications on this computer to communicate with Zotero”.';
const KEY_REFUSED = 'Zotero no longer accepts Spectrum’s permission. Allow Spectrum again in Settings › Zotero, and choose Always Allow.';
const WAITING = 'Waiting for Zotero to sync this project’s collection';
const needsTen = (version) =>
  `${version ? `Zotero ${version}` : 'This version of Zotero'} lets Spectrum read your library. Keeping a collection for each project needs Zotero 10.`;

// ─── Requests ───

async function call(route, { method = 'GET', body, headers = {}, signal = AbortSignal.timeout(TIMEOUT_MS), key } = {}) {
  try {
    return await fetch(`${base()}${route}`, {
      method,
      headers: {
        'Zotero-API-Version': '3',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        // ponytail: both ways the Web API takes a key, as the local API's documentation doesn't say which it reads
        ...(key && { 'Zotero-API-Key': key, Authorization: `Bearer ${key}` }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (signal.aborted && signal.reason?.name !== 'TimeoutError') throw httpError('Cancelled.', 499, 'CANCELLED');
    throw httpError(err?.name === 'TimeoutError' ? 'Zotero took too long to answer.' : NOT_OPEN, 503, 'UNREACHABLE');
  }
}

const drain = (res) => res.arrayBuffer().catch(() => null);

async function json(route) {
  const res = await call(route);
  if (res.status === 404) return drain(res).then(() => null);
  if (res.status === 403) throw httpError(API_OFF, 503, 'UNREACHABLE');
  if (!res.ok) throw httpError(`Zotero answered HTTP ${res.status}.`, 502);
  return res.json();
}

/** Every page of a list (100 at a time). */
async function all(route) {
  const out = [];
  for (let start = 0; ; start += 100) {
    const page = await json(`${route}${route.includes('?') ? '&' : '?'}limit=100&start=${start}`);
    if (!Array.isArray(page)) return out;
    out.push(...page);
    if (page.length < 100) return out;
  }
}

/** Better BibTeX's JSON-RPC; throws when it isn't installed. */
async function rpc(method, params = []) {
  const res = await call('/better-bibtex/json-rpc', { method: 'POST', body: { jsonrpc: '2.0', method, params, id: 1 } });
  const data = res.ok ? await res.json().catch(() => null) : await drain(res);
  if (!data || data.error) throw httpError(data?.error?.message || 'Better BibTeX didn’t answer.', 502);
  return data.result;
}

/** A write refused for its key: the key is dropped, as Zotero takes one given without Always Allow only once. */
async function written(res) {
  if (res.ok) return res;
  const detail = (await res.text().catch(() => '')).slice(0, 200);
  if (res.status === 401 || res.status === 403) {
    await forgetKey();
    throw httpError(KEY_REFUSED, 401, 'ZOTERO_KEY');
  }
  throw httpError(`Zotero refused the change (HTTP ${res.status}${detail ? `: ${detail}` : ''}).`, 502);
}

// ─── Status and permission ───

async function readKey() {
  try {
    const { key } = JSON.parse(await fs.readFile(keyFile(), 'utf8'));
    return typeof key === 'string' ? key : '';
  } catch {
    return '';
  }
}

export const forgetKey = () => fs.rm(keyFile(), { force: true });

/** Whether Zotero runs, its version, whether its local API is on and whether it takes writes (Zotero 10). */
async function probe() {
  try {
    const ping = await call('/connector/ping');
    await drain(ping);
    const api = await call('/api/');
    await drain(api);
    const version = ping.headers.get('x-zotero-version') || '';
    const serverId = api.headers.get('zotero-server-id') || ping.headers.get('zotero-server-id') || '';
    const localApi = api.ok ? 'on' : api.status === 403 ? 'off' : 'missing';
    const major = parseInt(version, 10);
    // Zotero-Server-ID came with the local API's writes, so it stands in for a version Zotero didn't give
    return { running: true, version, serverId, localApi, writes: localApi === 'on' && (major >= 10 || (!major && !!serverId)) };
  } catch {
    return { running: false, version: '', serverId: '', localApi: null, writes: false };
  }
}

/** What Settings › Zotero shows; never the key itself. */
export async function zoteroStatus() {
  const [{ serverId: _, ...found }, key] = await Promise.all([probe(), readKey()]);
  if (!found.running) return { ...found, betterBibtex: null, cayw: false, authorised: !!key, message: NOT_OPEN };
  const bbt = await rpc('api.ready').catch(() => null);
  const cayw = !!bbt && (await call('/better-bibtex/cayw?probe=1').then((r) => r.text()).catch(() => '')).trim() === 'ready';
  const version = found.version || String(bbt?.zotero || '');
  return {
    ...found,
    version,
    betterBibtex: bbt ? String(bbt.betterbibtex || 'installed') : null,
    cayw,
    authorised: !!key,
    message: found.localApi !== 'on' ? API_OFF : found.writes ? undefined : needsTen(version)
  };
}

// the one prompt waiting in Zotero (the Allow prompt or the citation picker), which Cancel stops
let prompt = null;

function startPrompt() {
  prompt?.abort();
  prompt = new AbortController();
  return prompt;
}

export function cancelPrompt() {
  prompt?.abort();
  prompt = null;
}

/** Zotero's window to the front, where the prompt waits. ponytail: Windows may not let a background program do it. */
function bringForward() {
  // a mock Zotero in the tests is no app to bring forward
  if (process.env.SPECTRUM_ZOTERO_BASE) return;
  const command = {
    darwin: ['open', ['-b', 'org.zotero.zotero']],
    win32: ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$p = Get-Process zotero -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null }']]
  }[process.platform];
  if (!command) return;
  try {
    const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // nothing to bring forward
  }
}

/** A request that waits for the user in Zotero: Zotero comes forward, and Cancel (or ten minutes) ends it. */
async function inZotero(route, options = {}) {
  const controller = startPrompt();
  try {
    const pending = call(route, { ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(PROMPT_MS)]) });
    bringForward();
    return await pending;
  } finally {
    if (prompt === controller) prompt = null;
  }
}

/**
 * Asks Zotero (10) to let Spectrum write: Zotero shows its Allow prompt, and the key it gives is kept in the data folder.
 * Throws CANCELLED when Cancel stopped it.
 */
export async function authorise() {
  const found = await probe();
  if (!found.running) throw httpError(NOT_OPEN, 503);
  if (found.localApi !== 'on') throw httpError(API_OFF, 503);
  if (!found.writes) throw httpError(needsTen(found.version), 409);
  const res = await inZotero('/api/local/authorize', { method: 'POST', body: { name: 'Spectrum' }, headers: found.serverId ? { 'Zotero-Server-ID': found.serverId } : {} });
  const text = await res.text().catch(() => '');
  if (res.status === 403) throw httpError('Zotero didn’t allow Spectrum. Try again, and choose Always Allow.', 403);
  if (!res.ok) throw httpError(`Zotero couldn’t give Spectrum permission (HTTP ${res.status}).`, 502);
  let key = text.trim();
  try {
    const data = JSON.parse(text);
    key = data?.key || data?.apiKey || '';
  } catch {
    // a bare key
  }
  if (!/^[\w-]{8,200}$/.test(String(key))) throw httpError('Zotero’s answer had no permission in it.', 502);
  await writeJsonAtomic(keyFile(), { key });
  await fs.chmod(keyFile(), 0o600);
  return zoteroStatus();
}

// ─── Items ───

const HIDDEN_TYPES = new Set(['attachment', 'note', 'annotation']);
const visible = (items) => (Array.isArray(items) ? items : []).filter((it) => it?.key && it.data && !HIDDEN_TYPES.has(it.data.itemType));
const creatorName = (c) => c.name || [c.firstName, c.lastName].filter(Boolean).join(' ');
const arxivIn = (text) => String(text || '').match(/arxiv\.org\/(?:abs|pdf)\/([\w./-]+?)(?:v\d+)?(?:\.pdf)?(?:[?#]|$)|^arxiv:\s*(\S+)/im)?.slice(1).find(Boolean) || '';

/** What an item is known by, as bibIdentity has it for an entry: its citation key, DOI, arXiv id, title and year. */
export function itemIdentity(item) {
  const d = item.data || {};
  const extra = String(d.extra || '');
  const doi = cleanDoi(d.DOI || extra.match(/^DOI:\s*(\S+)/im)?.[1] || '').toLowerCase();
  const arxiv = doi.match(/^10\.48550\/arxiv\.(.+)$/)?.[1] || arxivIn(d.archiveID) || arxivIn(d.url) || extra.match(/^arXiv:\s*(\S+)/im)?.[1] || '';
  return {
    key: String(d.citationKey || extra.match(/^Citation Key:\s*(\S+)/im)?.[1] || ''),
    doi,
    arxiv: arxiv.replace(/v\d+$/i, '').toLowerCase(),
    title: normaliseTitle(d.title || ''),
    year: String(d.date || '').match(/\d{4}/)?.[0] || ''
  };
}

/** The same reference: one citation key, DOI or arXiv id, or the same title and year where no two DOIs disagree. */
export function sameRef(a, b) {
  if (a.key && b.key && a.key.toLowerCase() === b.key.toLowerCase()) return true;
  if ((a.doi && a.doi === b.doi) || (a.arxiv && a.arxiv === b.arxiv)) return true;
  return Boolean(a.title && a.title === b.title && a.year === b.year && !(a.doi && b.doi && a.doi !== b.doi));
}

/** Library items matching q in any field, attachments and notes left out. */
async function findItems(q, limit = 25) {
  return visible(await json(`${LIB}/items?${new URLSearchParams({ q, qmode: 'everything', itemType: '-attachment', limit: String(limit) })}`));
}

/** The items by item key, up to 50. */
async function getItems(itemKeys) {
  return itemKeys.length ? visible(await json(`${LIB}/items?itemKey=${itemKeys.map(encodeURIComponent).join(',')}`)) : [];
}

/** Each item's citation key: Zotero's own field (Zotero 8 on, where Better BibTeX keeps its keys too), then Better BibTeX's. */
async function citationKeys(items) {
  const keys = new Map(items.map((it) => [it.key, itemIdentity(it).key]));
  const missing = items.filter((it) => !keys.get(it.key)).map((it) => it.key);
  if (missing.length) {
    const found = await rpc('item.citationkey', [missing]).catch(() => null);
    for (const k of missing) if (typeof found?.[k] === 'string') keys.set(k, found[k]);
  }
  return keys;
}

/** An item as a CSL-ish record, for the AuthorYear key Spectrum gives an item with none. */
const recordOf = (d) => ({
  author: (d.creators || []).filter((c) => c.creatorType === 'author').map((c) => (c.name ? { literal: c.name } : { family: c.lastName, given: c.firstName })),
  title: d.title,
  issued: /\d{4}/.test(d.date || '') ? { 'date-parts': [[Number(String(d.date).match(/\d{4}/)[0])]] } : undefined
});

/**
 * The library searched for the picker, \cite completion and Research: each item with the key its entry goes in
 * under (Zotero's, Better BibTeX's, else the AuthorYear key Spectrum makes, which may yet get a letter).
 */
export async function searchLibrary(q, limit = 20, withKeys = true) {
  const items = await findItems(q, limit);
  // Research needs none: its adds come through importRefs
  const keys = withKeys ? await citationKeys(items) : new Map();
  return items.map((it) => {
    const d = it.data;
    const id = itemIdentity(it);
    const authors = (d.creators || []).filter((c) => c.creatorType === 'author');
    const tidy = (v) => (v ? String(v) : undefined);
    return {
      itemKey: it.key,
      key: keys.get(it.key) || id.key || baseKey(recordOf(d)),
      title: String(d.title || ''),
      authors: (authors.length ? authors : d.creators || []).map(creatorName).filter(Boolean),
      year: tidy(id.year),
      venue: tidy(d.publicationTitle || d.proceedingsTitle || d.bookTitle || d.websiteTitle || d.repository || d.publisher),
      doi: tidy(id.doi),
      arxiv: tidy(id.arxiv),
      url: tidy(d.url),
      abstract: tidy(d.abstractNote)
    };
  });
}

// ─── Entries for the .bib ───

/** The first entry of an export without its file field (paths to PDFs on this computer, which a shared .bib mustn't carry). */
export function cleanEntry(text) {
  const [entry, next] = parseBibEntries(text);
  if (!entry) return '';
  let out = text.slice(entry.at, next?.at ?? text.length).trim();
  for (let m; (m = /,\s*file\s*=\s*\{/i.exec(out)); ) {
    const end = matchBrace(out, m.index + m[0].length - 1);
    if (end < 0) break;
    out = out.slice(0, m.index) + out.slice(end + 1);
  }
  return out;
}

async function bbtExport(citekey, biblatex) {
  const out = await rpc('item.export', [[citekey], biblatex ? 'Better BibLaTeX' : 'Better BibTeX']).catch(() => null);
  // older Better BibTeX answers [status, type, text]
  const text = Array.isArray(out) ? out.at(-1) : out;
  return typeof text === 'string' ? cleanEntry(text) : '';
}

async function zoteroExport(item, biblatex) {
  const res = await call(`${LIB}/items/${encodeURIComponent(item.key)}?format=${biblatex ? 'biblatex' : 'bibtex'}`);
  if (!res.ok) {
    await drain(res);
    throw httpError(`Zotero couldn’t export “${item.data.title || item.key}” (HTTP ${res.status}).`, 502);
  }
  return cleanEntry(await res.text());
}

/**
 * Zotero references into the project's .bib through appendEntries, each under its citation key: Zotero's own, then
 * Better BibTeX's, else Spectrum's AuthorYear one. refs: { itemKey } (a search's) or { citekey } (the picker's). The
 * entry is Better BibTeX's export when it can give one, else Zotero's, as BibLaTeX or BibTeX as the project uses.
 */
export async function importRefs(root, refs, bibFile) {
  const items = new Map((await getItems(refs.filter((r) => r.itemKey).map((r) => r.itemKey))).map((it) => [it.key, it]));
  const keys = await citationKeys([...items.values()]);
  return appendEntries(root, bibFile, ({ biblatex }) => Promise.all(refs.map(async (ref) => {
    const input = ref.itemKey || ref.citekey;
    try {
      const item = ref.itemKey ? items.get(ref.itemKey) : null;
      if (ref.itemKey && !item) throw new Error('That item isn’t in your Zotero library any more.');
      const citekey = ref.citekey || keys.get(ref.itemKey) || '';
      const exported = citekey && (await bbtExport(citekey, biblatex));
      if (exported) return { input, bibtex: exported, key: citekey };
      const found = item || (await findItems(citekey, 10)).find((it) => itemIdentity(it).key === citekey);
      if (!found) throw new Error(`${citekey} isn’t in your Zotero library.`);
      return { input, bibtex: await zoteroExport(found, biblatex), key: citekey || baseKey(recordOf(found.data)) };
    } catch (err) {
      return { input, error: err.message };
    }
  })));
}

/**
 * Zotero's citation picker (Better BibTeX's Cite As You Write) for command (parencite, citep or cite): the user picks
 * in Zotero, and what was picked goes into the .bib. → { text: the citation as Zotero wrote it, results } or
 * { cancelled: true } when the picker was closed or Cancel was chosen.
 */
export async function pickCitation(root, command, bibFile) {
  const format = { parencite: 'biblatex', citep: 'natbib' }[command] || 'latex';
  const res = await inZotero(`/better-bibtex/cayw?${new URLSearchParams({ format, command })}`);
  if (!res.ok) {
    await drain(res);
    throw httpError(`Zotero’s citation picker answered HTTP ${res.status}.`, 502);
  }
  const text = (await res.text()).trim();
  const citekeys = [...new Set(citeKeys(text))];
  if (!citekeys.length) return { cancelled: true };
  return { text, ...(await importRefs(root, citekeys.map((citekey) => ({ citekey })), bibFile)) };
}

// ─── Entries as new Zotero items ───

const ITEM_TYPES = {
  article: 'journalArticle', inproceedings: 'conferencePaper', conference: 'conferencePaper', proceedings: 'book', book: 'book',
  inbook: 'bookSection', incollection: 'bookSection', phdthesis: 'thesis', mastersthesis: 'thesis', thesis: 'thesis',
  techreport: 'report', report: 'report', online: 'webpage', electronic: 'webpage', www: 'webpage', unpublished: 'manuscript'
};
// the fields each item type takes (bar title, creators, date, url, abstract and citation key, which all do), so
// Zotero accepts the item; a DOI on a type without the field goes in Extra
const FIELDS = {
  journalArticle: { container: 'publicationTitle', volume: 'volume', number: 'issue', pages: 'pages', doi: 'DOI', issn: 'ISSN' },
  conferencePaper: { container: 'proceedingsTitle', volume: 'volume', pages: 'pages', publisher: 'publisher', address: 'place', doi: 'DOI', isbn: 'ISBN' },
  book: { volume: 'volume', series: 'series', edition: 'edition', publisher: 'publisher', address: 'place', isbn: 'ISBN' },
  bookSection: { container: 'bookTitle', volume: 'volume', pages: 'pages', publisher: 'publisher', address: 'place', isbn: 'ISBN' },
  thesis: { school: 'university', address: 'place' },
  report: { number: 'reportNumber', institution: 'institution', pages: 'pages', address: 'place' },
  preprint: { repository: 'repository', archiveID: 'archiveID', doi: 'DOI' },
  webpage: { container: 'websiteTitle' },
  manuscript: { address: 'place' },
  document: { publisher: 'publisher' }
};
// the types whose editors Zotero takes as editors
const EDITED = new Set(['journalArticle', 'conferencePaper', 'book', 'bookSection', 'document']);

const plainText = (value) => latexToText(String(value || '')).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();

/** BibTeX's names ("Last, First and First Last and {An Organisation}"), split on the ands outside braces. */
function splitNames(value) {
  const names = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '{') depth += 1;
    else if (value[i] === '}') depth -= 1;
    else if (!depth && /\s/.test(value[i])) {
      const and = /^\s+and\s+/i.exec(value.slice(i));
      if (and) {
        names.push(value.slice(start, i));
        i += and[0].length - 1;
        start = i + 1;
      }
    }
  }
  names.push(value.slice(start));
  return names.map((n) => n.trim()).filter((n) => n && n !== 'others');
}

function creatorsOf(value, creatorType) {
  return splitNames(String(value || '')).map((raw) => {
    if (raw.startsWith('{') && matchBrace(raw, 0) === raw.length - 1) return { creatorType, name: plainText(raw) };
    const n = parseName(plainText(raw));
    if (!n) return null;
    return n.literal ? { creatorType, name: n.literal } : { creatorType, lastName: n.family || '', firstName: n.given || '' };
  }).filter(Boolean);
}

/** A .bib entry as a new Zotero item, through a small map of BibTeX's fields to Zotero's. */
export function itemFromEntry({ type, key, fields: f }) {
  const arxivEprint = f.eprint && /arxiv/i.test(f.archiveprefix || f.eprinttype || 'arxiv') ? f.eprint.replace(/^arxiv:\s*/i, '') : '';
  const journal = f.journal || f.journaltitle || '';
  let itemType = ITEM_TYPES[type] || 'document';
  if (arxivEprint && (['misc', 'unpublished', 'online'].includes(type) || (type === 'article' && (!journal || /arxiv/i.test(journal))))) itemType = 'preprint';
  const doi = f.doi ? cleanDoi(f.doi) : '';
  const values = {
    container: journal || f.booktitle,
    volume: f.volume,
    number: f.number || f.issue,
    pages: f.pages && f.pages.replace(/-+/g, '-'),
    publisher: f.publisher || f.organization,
    address: f.address || f.location,
    edition: f.edition,
    series: f.series,
    isbn: f.isbn,
    issn: f.issn,
    school: f.school || f.institution,
    institution: f.institution || f.organization,
    repository: arxivEprint && 'arXiv',
    archiveID: arxivEprint && `arXiv:${arxivEprint}`,
    doi
  };
  const editors = EDITED.has(itemType) ? creatorsOf(f.editor, 'editor') : [];
  const item = {
    itemType,
    title: plainText(f.title),
    creators: [...creatorsOf(f.author, 'author'), ...editors],
    date: plainText(f.date || f.year),
    url: f.url || '',
    abstractNote: plainText(f.abstract),
    citationKey: key
  };
  for (const [from, to] of Object.entries(FIELDS[itemType])) if (values[from]) item[to] = ['doi', 'archiveID'].includes(from) ? values[from] : plainText(values[from]);
  if (doi && !FIELDS[itemType].doi) item.extra = `DOI: ${doi}`;
  if (itemType === 'thesis') item.thesisType = type === 'mastersthesis' ? 'Master’s thesis' : 'PhD thesis';
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== ''));
}

// ─── The project's collection ───

/** Every .bib of the project, and whether each was read and parsed whole (so a half-written or unreadable one never strips the collection). */
async function readBibs(root) {
  const files = (await listFilesRecursive(root)).filter((it) => it.type === 'file' && /\.bib$/i.test(it.path)).map((it) => it.path);
  const entries = [];
  let complete = files.length > 0;
  for (const file of files) {
    const text = await fs.readFile(path.join(root, file), 'utf8').catch(() => null);
    if (text == null || !parsedWhole(text)) complete = false;
    for (const entry of parseBibEntries(text ?? '')) entries.push({ entry, id: bibIdentity(entry, file) });
  }
  return { entries, complete };
}

/** Whether every entry of a .bib was read: one per @head, and every brace closed. */
export function parsedWhole(text) {
  const heads = [...text.matchAll(/@\s*([A-Za-z]+)\s*[{(]/g)].filter((m) => !/^(comment|string|preamble)$/i.test(m[1])).length;
  let depth = 0;
  for (let i = 0; i < text.length && depth >= 0; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === '{') depth += 1;
    else if (text[i] === '}') depth -= 1;
  }
  return depth === 0 && heads === parseBibEntries(text).length;
}

async function createCollection(data, key) {
  const res = await written(await call(`${LIB}/collections`, { method: 'POST', key, body: [data] }));
  const out = await res.json().catch(() => ({}));
  const made = out.successful?.['0'] || (out.success?.['0'] && { key: out.success['0'], data });
  if (!made?.key) throw httpError(`Zotero didn’t make the collection: ${out.failed?.['0']?.message || 'no reason given'}.`, 502);
  return { key: made.key, data: made.data || data };
}

/**
 * A new collection for the project, inside a top-level Spectrum collection (made the first time): named after the
 * project, or "<project> (2)" and so on when a Spectrum collection already has that name.
 */
async function newCollection(projectName, key) {
  const parents = (await all(`${LIB}/collections/top`)).filter((c) => c.data?.name === 'Spectrum');
  const taken = new Set();
  for (const parent of parents) for (const c of await all(`${LIB}/collections/${parent.key}/collections`)) taken.add(c.data?.name);
  const parent = parents[0] || (await createCollection({ name: 'Spectrum' }, key));
  let name = projectName;
  for (let n = 2; taken.has(name); n += 1) name = `${projectName} (${n})`;
  return createCollection({ name, parentCollection: parent.key }, key);
}

/** An item's collections changed with change(list), against the item's version; another change first (412) is read and tried again. */
async function changeCollections(item, change, key) {
  let current = item;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = current.data.collections || [];
    const next = change(now);
    if (next.length === now.length && next.every((c, i) => c === now[i])) return;
    const res = await call(`${LIB}/items/${encodeURIComponent(current.key)}`, {
      method: 'PATCH',
      key,
      body: { collections: next },
      headers: { 'If-Unmodified-Since-Version': String(current.version ?? current.data.version) }
    });
    if (res.status !== 412) return written(res).then(drain);
    await drain(res);
    current = await json(`${LIB}/items/${encodeURIComponent(current.key)}`);
    if (!current) return;
  }
  throw httpError('Zotero kept changing an item while Spectrum added it to the collection. It’s tried again next time.', 409);
}

/** A library item that is this .bib entry: by citation key, then DOI, then arXiv id, then title and year. */
async function findInLibrary(id) {
  const tries = [[id.key, 'key'], [id.doi, 'doi'], [id.arxiv, 'arxiv'], [id.displayTitle.replace(/[{}]/g, ''), 'title']];
  for (const [q, by] of tries) {
    if (!q) continue;
    const hit = (await findItems(q)).find((it) => {
      const other = itemIdentity(it);
      return by === 'title' ? sameRef({ ...id, key: '' }, { ...other, key: '' }) : by === 'key' ? other.key.toLowerCase() === id.key.toLowerCase() : other[by] === id[by];
    });
    if (hit) return hit;
  }
  return null;
}

/**
 * The project's Spectrum collection made to match its .bib entries: each entry Zotero has (by citation key, DOI, arXiv
 * id, or title and year) goes into the collection, and an entry Zotero lacks becomes a new item there. remove: entries
 * taken out of the .bib come out of the collection, only when every .bib was read whole; their items stay in the
 * library. The collection is made when none is stored for this project (by its id, so a Finder copy gets its own); a
 * stored one this computer's Zotero doesn't have yet is waited for, never made again. → { state, message?, … }
 */
async function reconcile(root, remove) {
  const key = await readKey();
  if (!key) return { state: 'off' };
  const found = await probe();
  if (!found.running) return { state: 'unreachable', message: NOT_OPEN };
  if (found.localApi !== 'on') return { state: 'unreachable', message: API_OFF };
  if (!found.writes) return { state: 'readonly', message: needsTen(found.version) };
  const { entries, complete } = await readBibs(root);
  const meta = await readMeta(root);
  const stored = (await readProjectSettings(root)).zotero;
  // settings.json comes from GitHub too: only a collection key Zotero could have made is asked for
  const bound = stored?.projectId === meta.id && stored.library === LIBRARY && /^[A-Z0-9]{8}$/.test(stored.collectionKey || '');
  if (!bound && !entries.length) return { state: 'empty' };
  let collection;
  if (bound) {
    collection = await json(`${LIB}/collections/${encodeURIComponent(stored.collectionKey)}`);
    if (!collection) return { state: 'waiting', message: WAITING };
  } else {
    collection = await newCollection(meta.name, key);
    await updateProjectSettings(root, (settings) => ({ ...settings, zotero: { projectId: meta.id, library: LIBRARY, collectionKey: collection.key } }));
  }
  const ck = collection.key;
  const members = visible(await all(`${LIB}/collections/${encodeURIComponent(ck)}/items`)).map((item) => ({ item, id: itemIdentity(item) }));
  const counts = { added: 0, created: 0, removed: 0, failed: 0 };
  const missing = [];
  // ponytail: a search or four per entry the collection lacks; a whole-library index if large .bibs make it slow
  for (const e of entries) {
    if (members.some((m) => sameRef(e.id, m.id)) || missing.some((m) => sameRef(e.id, m.id))) continue;
    const item = await findInLibrary(e.id);
    if (!item) {
      missing.push(e);
      continue;
    }
    await changeCollections(item, (list) => (list.includes(ck) ? list : [...list, ck]), key);
    members.push({ item, id: itemIdentity(item) });
    counts.added += 1;
  }
  let failure = '';
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50).map(({ entry }) => ({ ...itemFromEntry(entry), collections: [ck] }));
    const out = await (await written(await call(`${LIB}/items`, { method: 'POST', key, body: batch }))).json().catch(() => ({}));
    counts.created += Object.keys(out.successful || out.success || {}).length;
    const failed = Object.values(out.failed || {});
    counts.failed += failed.length;
    failure ||= failed[0]?.message || '';
  }
  if (remove && complete) {
    for (const m of members) {
      if (entries.some((e) => sameRef(e.id, m.id))) continue;
      await changeCollections(m.item, (list) => list.filter((c) => c !== ck), key);
      counts.removed += 1;
    }
  }
  return {
    state: 'synced',
    collection: `Spectrum › ${collection.data?.name || meta.name}`,
    ...counts,
    ...(counts.failed && { message: `Zotero didn’t take ${counts.failed} ${counts.failed === 1 ? 'entry' : 'entries'}: ${failure || 'no reason given'}.` })
  };
}

// ponytail: one sync at a time across projects; per-project locks if several windows sync at once and it drags
const syncLock = serialiser();

export function syncCollection(root, { remove = false } = {}) {
  return syncLock(() => reconcile(root, remove).catch((err) => ({ state: 'error', message: err.message })));
}

const soon = new Map();

/** A sync shortly: after an add (remove false) or a .bib save (remove true, debounced); one waiting per project. */
export function syncSoon(root, { remove = false, delay = 1000 } = {}) {
  const pending = soon.get(root);
  clearTimeout(pending?.timer);
  const next = { remove: remove || !!pending?.remove };
  next.timer = setTimeout(() => {
    soon.delete(root);
    syncCollection(root, { remove: next.remove });
  }, delay);
  next.timer.unref?.();
  soon.set(root, next);
}
