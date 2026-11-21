// read_source: a paper's open full text, page by page, for the Spectrum agent (Deep research, Verify claims). The copy
// comes only from where a scholarly source says it is (arXiv for an arXiv id, OpenAlex's open-access locations for a
// DOI, a PDF in the project), never from an address a model gives, and is fetched as Get PDF fetches one: no address
// on this computer or the local network, each redirect checked, 50 MB at most. Without an open copy the abstract is
// read, and the answer says so. What it returns is the paper's text, which the agent's loop marks as untrusted.
import { promises as fs } from 'fs';
import { allBibEntries } from '../mcp/tools.js';
import { safeJoin } from '../utils/pathUtils.js';
import { bibIdentity, cleanDoi, detectInput } from './referenceService.js';
import { downloadPdf } from './researchService.js';
import { getJson, openAlexBase } from './searchService.js';

// what one call returns: this many pages, and at most this many characters of them
const MAX_PAGES = 8;
const MAX_CHARS = 40000;
// ponytail: every page of a document is read on its first use and kept for the next calls (the last 6 documents);
// a 300-page book is read in about three seconds, which a lazy read per page would save
const MAX_DOC_PAGES = 400;
const kept = new Map();
const KEEP = 6;

const arxivPdf = (id) => `${(process.env.SPECTRUM_ARXIV_BASE || 'https://arxiv.org').replace(/\/+$/, '')}/pdf/${id}`;
const arxivOfDoi = (doi) => String(doi || '').match(/^10\.48550\/arxiv\.(.+)$/i)?.[1] || '';
const arxivOfUrl = (url) => String(url || '').match(/arxiv\.org\/(?:abs|pdf)\/(.+?)(?:v\d+)?(?:\.pdf)?\/?$/i)?.[1] || '';
const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

let pdfjs = null;
/** pdf.js in Node: its worker's code run in this thread, which a bundle can carry (no worker file to find). */
async function loadPdfjs() {
  if (!pdfjs) {
    const [lib, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.mjs')]);
    globalThis.pdfjsWorker ??= worker;
    pdfjs = lib;
  }
  return pdfjs;
}

/** The text of each page of a PDF, in reading order as pdf.js gives it; lines kept, runs of spaces made one. */
export async function pdfPages(bytes) {
  const { getDocument } = await loadPdfjs();
  // no font is turned into code, nothing is drawn: text only
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, MAX_DOC_PAGES); i += 1) {
      const page = await doc.getPage(i);
      const { items } = await page.getTextContent();
      pages.push(items.map((item) => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim());
      page.cleanup();
    }
    return { pages, total: doc.numPages };
  } finally {
    await task.destroy();
  }
}

/** Where a work's open copy is: arXiv's PDF, then OpenAlex's open locations with a PDF; and its abstract. */
async function openCopies(doi) {
  const work = await getJson(`${openAlexBase()}/works/doi:${doi.split('/').map(encodeURIComponent).join('/')}?select=id,display_name,is_retracted,best_oa_location,locations,abstract_inverted_index`).catch(() => null);
  if (!work) return { links: [], abstract: '' };
  const locations = [work.best_oa_location, ...(work.locations || [])].filter(Boolean);
  const arxiv = locations.map((l) => arxivOfUrl(l.landing_page_url) || arxivOfUrl(l.pdf_url)).find(Boolean);
  const words = [];
  for (const [word, at] of Object.entries(work.abstract_inverted_index || {})) for (const i of at) words[i] = word;
  return {
    title: work.display_name,
    retracted: work.is_retracted === true,
    links: [...new Set([arxiv && arxivPdf(arxiv), ...locations.filter((l) => l.is_oa !== false).map((l) => l.pdf_url)].filter(Boolean))],
    abstract: words.filter(Boolean).join(' ')
  };
}

/** "3", "3-5", "3–5" as [from, to], within the document's pages. */
function pageRange(pages, total) {
  const m = String(pages ?? '').match(/^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/);
  const from = Math.max(1, Math.min(total, m ? Number(m[1]) : 1));
  const to = Math.max(from, Math.min(total, from + MAX_PAGES - 1, m?.[2] ? Number(m[2]) : from + (m ? 0 : 3)));
  return [from, to];
}

/**
 * A document's pages: from the cache, else made by load() and kept. kind: 'full text'; where: the address or the
 * project's path, what the user opens to see it.
 */
async function document(id, load) {
  if (kept.has(id)) {
    const doc = kept.get(id);
    kept.delete(id);
    kept.set(id, doc);
    return doc;
  }
  const doc = await load();
  if (doc) {
    kept.set(id, doc);
    if (kept.size > KEEP) kept.delete(kept.keys().next().value);
  }
  return doc;
}

const fromPdf = (where) => async (bytes) => (bytes ? { ...(await pdfPages(bytes)), where } : null);

/**
 * Finds the source and reads it: { kind: 'full text', where, title?, pages: string[], total } or { kind: 'abstract',
 * where, title?, abstract }. Asked by doi, arxiv, key (a .bib entry's DOI or arXiv id, or its PDF in research/papers)
 * or path (a PDF of the project, already checked by the caller).
 */
export async function findSource(root, { doi, arxiv, key, path: file } = {}) {
  if (file) {
    if (!/\.pdf$/i.test(file)) throw new Error('read_source reads PDFs: for another file use read_file.');
    const abs = safeJoin(root, file);
    const { mtimeMs } = await fs.stat(abs).catch(() => { throw new Error(`There is no file ${file}.`); });
    return { kind: 'full text', ...(await document(`${abs}:${mtimeMs}`, async () => fromPdf(file)(await fs.readFile(abs)))) };
  }
  if (key) {
    // whichever document loads it: a project may hold a second paper with its own .bib
    const entry = (await allBibEntries(root)).find((e) => e.key === key);
    if (!entry) throw new Error(`The bibliography has no entry ${key}. Look it up with bib_search.`);
    // the paper Get PDF saved, under its key
    const saved = `research/papers/${key.replace(/[^A-Za-z0-9_-]+/g, '-')}.pdf`;
    if (await fs.stat(safeJoin(root, saved)).then((s) => s.isFile(), () => false)) return findSource(root, { path: saved });
    const id = bibIdentity(entry, entry.file);
    if (!id.doi && !id.arxiv) throw new Error(`${key} has no DOI or arXiv id to find its text by. Add one, or save its PDF in research/papers/${key}.pdf.`);
    return findSource(root, { doi: id.doi, arxiv: id.arxiv });
  }
  const theArxiv = arxiv ? detectInput(String(arxiv)).arxiv || String(arxiv).trim() : arxivOfDoi(doi);
  if (theArxiv) {
    const where = arxivPdf(theArxiv);
    const doc = await document(where, async () => fromPdf(`https://arxiv.org/pdf/${theArxiv}`)(await downloadPdf(where)));
    if (!doc) throw new Error(`arXiv gave no PDF for ${theArxiv}.`);
    return { kind: 'full text', ...doc };
  }
  if (!doi) throw new Error('Give a doi, an arxiv id, the key of a .bib entry or the path of a PDF in the project.');
  const clean = cleanDoi(doi);
  const open = await openCopies(clean);
  const failures = [];
  for (const link of open.links) {
    try {
      const doc = await document(link, async () => fromPdf(link)(await downloadPdf(link)));
      if (doc) return { kind: 'full text', title: open.title, retracted: open.retracted, ...doc };
      failures.push(`${new URL(link).host} gave no PDF`);
    } catch (err) {
      failures.push(err.message);
    }
  }
  if (!open.abstract) throw new Error(`No open copy or abstract of ${clean} was found${failures.length ? ` (${failures.join('; ')})` : ''}. Say you could not read it.`);
  return { kind: 'abstract', where: `https://doi.org/${clean}`, title: open.title, retracted: open.retracted, abstract: open.abstract, ...(failures.length && { failures }) };
}

/**
 * read_source's answer: a header that says what was read, from where, and the line a note's "Read:" takes, then the
 * pages asked for (1 to 4 unless pages says, at most 8), each under its number.
 */
export async function readSource(root, input = {}) {
  const source = await findSource(root, input);
  const today = dateFormat.format(new Date());
  const warn = source.retracted ? 'OpenAlex marks this work as retracted. Say so wherever you use it.\n' : '';
  if (source.kind === 'abstract') {
    return {
      text: `${warn}No open full text was found${source.failures ? ` (${source.failures.join('; ')})` : ''}: this is the abstract alone, from OpenAlex. A claim checked against it was checked against the abstract only.\nRead: abstract, from ${source.where}, ${today}\n\n${source.abstract}`,
      shown: `The abstract alone, from ${source.where}`
    };
  }
  const [from, to] = pageRange(input.pages, source.pages.length);
  let body = '';
  let last = from - 1;
  for (let n = from; n <= to; n += 1) {
    const page = `--- Page ${n} ---\n${source.pages[n - 1] || '(no text on this page: a figure, or a scan)'}\n\n`;
    if (body && body.length + page.length > MAX_CHARS) break;
    body += page.slice(0, MAX_CHARS);
    last = n;
  }
  const pages = from === last ? `page ${from}` : `pages ${from}–${last}`;
  const more = last < source.pages.length ? ` Read on with pages: "${last + 1}-${Math.min(source.pages.length, last + 4)}".` : '';
  return {
    text: `${warn}Full text${source.title ? ` of “${source.title}”` : ''}, ${source.total} ${source.total === 1 ? 'page' : 'pages'}, from ${source.where}. Below: ${pages}.${more}\nRead: full text, ${pages} of ${source.total}, from ${source.where}, ${today}\n\n${body.trim()}`,
    shown: `${pages.charAt(0).toUpperCase()}${pages.slice(1)} of ${source.total}, from ${source.where}`
  };
}
