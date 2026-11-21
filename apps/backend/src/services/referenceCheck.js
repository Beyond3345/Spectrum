// Tools › Review's “References exist” and the agents' check_references: each entry of the project's bibliography
// looked up in the source its identifier names (Crossref or doi.org for a DOI, arXiv for an arXiv id, OpenAlex for a
// title alone) and compared with it by code, field by field, with retractions read from Crossref's updates (Retraction
// Watch's among them) and OpenAlex's flag. No model is used. Each row carries what was read and where, so the user can
// open the record and see the difference for themselves.
import { latexToText } from '../latex/conversion.js';
import { documentBib } from '../mcp/tools.js';
import { bibIdentity, crossrefBase, get, recordFor, summaryOf, yearOf } from './referenceService.js';
import { RETRACTED_MARK, compareWork, firstAuthorOf, surname } from './referenceMatch.js';
import { getJson, openAlexBase } from './searchService.js';

// ponytail: a bibliography of more than 300 entries is checked in its first 300; the rest are listed as not checked
const MAX_ENTRIES = 300;
// OpenAlex takes ten requests a second; Crossref's go through the resolver's own queue, one at a time
const AT_ONCE = 4;
// updates to a work that withdraw it, and ones that only add to it, as Crossref names them
const WITHDRAWN = new Set(['retraction', 'withdrawal', 'removal', 'partial_retraction']);
const NOTICES = new Set(['correction', 'erratum', 'expression_of_concern', 'addendum', 'corrigendum']);

const plainText = (s) => latexToText(String(s || '')).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
const encodeDoi = (doi) => doi.split('/').map(encodeURIComponent).join('/');
const dateOf = (d) => (d?.['date-parts']?.[0] || []).filter(Boolean).map((n, i) => (i ? String(n).padStart(2, '0') : n)).join('-');
const label = (type) => ({ expression_of_concern: 'Expression of concern', partial_retraction: 'Partial retraction' }[type] || type.charAt(0).toUpperCase() + type.slice(1));

/** A Crossref work, or null when Crossref has no record of the DOI (a DataCite DOI, or none at all). */
async function crossrefWork(doi) {
  const res = await get(`${crossrefBase()}/works/${encodeDoi(doi)}`, 'application/json');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Crossref answered ${res.status}.`);
  return (await res.json()).message || null;
}

/** OpenAlex's work for a DOI, its retraction flag and id: null when it has none. */
async function openAlexWork(doi) {
  return getJson(`${openAlexBase()}/works/doi:${encodeDoi(doi)}?select=id,is_retracted`).catch(() => null);
}

/** The works OpenAlex finds for a title, retracted ones included, as CSL-like records with their OpenAlex page. */
async function openAlexByTitle(title) {
  const params = new URLSearchParams({ search: title.slice(0, 300), per_page: '5', select: 'id,doi,display_name,publication_year,authorships,is_retracted,primary_location' });
  const data = await getJson(`${openAlexBase()}/works?${params}`);
  return (data.results || []).map((w) => ({
    title: w.display_name,
    authors: (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean),
    year: String(w.publication_year || ''),
    doi: String(w.doi || '').replace(/^https?:\/\/doi\.org\//i, ''),
    venue: w.primary_location?.source?.display_name,
    retracted: w.is_retracted === true,
    url: w.id
  }));
}

/** Crossref's updates of a work: the ones that withdraw it, then the rest, each with its notice. */
function updatesOf(work) {
  const all = [...(work?.['updated-by'] || [])].filter((u) => u?.type);
  const withdrawn = all.filter((u) => WITHDRAWN.has(u.type));
  return {
    retraction: withdrawn.map((u) => ({ label: u.label || label(u.type), date: dateOf(u.updated), notice: u.DOI, url: u.DOI ? `https://doi.org/${u.DOI}` : '', from: u.source === 'retraction-watch' ? 'Retraction Watch, through Crossref' : 'the publisher, through Crossref' }))[0],
    notices: all.filter((u) => NOTICES.has(u.type)).map((u) => ({ label: u.label || label(u.type), date: dateOf(u.updated), notice: u.DOI, url: u.DOI ? `https://doi.org/${u.DOI}` : '' }))
  };
}

const brief = (rec) => {
  const meta = summaryOf(rec);
  return { title: meta.title || '', authors: meta.authors.slice(0, 3), year: meta.year || '', ...(meta.doi && { doi: meta.doi }), ...([rec['container-title']].flat()[0] && { venue: plainText([rec['container-title']].flat()[0]) }) };
};

/**
 * One entry against its record: { key, file, line, status, title, read?, record?, differences?, retraction?, notices?,
 * note? }. status: 'found', 'differs', 'not-found', 'retracted' or 'unchecked'. read: where the record was read, as
 * { from, url } (a page the user can open). differences: [{ field, bib, record }].
 */
async function checkEntry(entry) {
  const id = bibIdentity(entry, entry.file);
  const f = entry.fields;
  const row = { key: entry.key, file: entry.file, line: entry.line, title: plainText(f.title) };
  const want = { title: plainText(f.title), author: firstAuthorOf(f.author || f.editor), year: id.year };
  let record = null;
  let read = null;
  let retraction;
  let notices = [];
  try {
    if (id.doi) {
      const work = await crossrefWork(id.doi);
      if (work) {
        record = work;
        read = { from: 'Crossref', url: `https://doi.org/${id.doi}` };
        ({ retraction, notices } = updatesOf(work));
        // the DOI cited is a retraction notice's own
        const notice = (work['update-to'] || []).find((u) => WITHDRAWN.has(u?.type));
        if (notice) row.note = `This DOI is the ${(notice.label || label(notice.type)).toLowerCase()} notice of ${notice.DOI}, not the work itself.`;
      } else {
        record = await recordFor({ kind: 'doi', doi: id.doi }).catch((err) => (err.code === 'NOT_FOUND' ? null : Promise.reject(err)));
        read = { from: 'doi.org', url: `https://doi.org/${id.doi}` };
        if (!record) return { ...row, status: 'not-found', read, note: `No registry knows the DOI ${id.doi}: neither Crossref nor doi.org has a record of it.` };
      }
      if (!retraction && (await openAlexWork(id.doi))?.is_retracted) retraction = { label: 'Retracted', from: 'OpenAlex', url: `https://doi.org/${id.doi}` };
    } else if (id.arxiv) {
      record = await recordFor({ kind: 'arxiv', arxiv: id.arxiv }).catch((err) => (err.code === 'NOT_FOUND' ? null : Promise.reject(err)));
      read = { from: 'arXiv', url: `https://arxiv.org/abs/${id.arxiv}` };
      if (!record) return { ...row, status: 'not-found', read, note: `arXiv has no paper ${id.arxiv}.` };
    } else if (want.title) {
      const found = (await openAlexByTitle(want.title)).map((w) => ({ w, cmp: compareWork(want, { title: w.title, author: surname(w.authors[0]), year: w.year }) }));
      const best = found.find((x) => x.cmp.title !== 'differs' && x.cmp.author !== 'differs') || found.find((x) => x.cmp.title !== 'differs');
      const search = { from: 'OpenAlex, by title', url: `https://openalex.org/works?search=${encodeURIComponent(want.title.slice(0, 200))}` };
      if (!best) return { ...row, status: 'not-found', read: search, note: 'OpenAlex has no work with this title. Give the entry a DOI or an arXiv id if it has one, or check the title.' };
      const { w } = best;
      return finish(row, want, { title: w.title, authors: w.authors.slice(0, 3), year: w.year, ...(w.doi && { doi: w.doi }), ...(w.venue && { venue: w.venue }) }, { from: 'OpenAlex, by title', url: w.url }, w.retracted ? { label: 'Retracted', from: 'OpenAlex', url: w.doi ? `https://doi.org/${w.doi}` : w.url } : undefined, []);
    } else {
      return { ...row, status: 'unchecked', note: f.url ? 'A web page with no DOI or title to look up: open its link to check it.' : 'This entry has no DOI, arXiv id or title to look up.' };
    }
  } catch (err) {
    return { ...row, status: 'unchecked', ...(read && { read }), note: `The lookup failed: ${err.message}` };
  }
  return finish(row, want, { ...brief(record), year: yearOf(record) }, read, retraction, notices);
}

/** A row from the record read: the fields that differ, and found, differs or retracted. */
function finish(row, want, record, read, retraction, notices) {
  const cmp = compareWork(want, { title: record.title, author: surname(record.authors[0]), year: record.year });
  const differences = [
    cmp.title === 'differs' && { field: 'title', bib: want.title, record: record.title },
    cmp.author === 'differs' && { field: 'first author', bib: want.author, record: record.authors[0] },
    cmp.year === 'differs' && { field: 'year', bib: want.year, record: record.year }
  ].filter(Boolean);
  // a title marked RETRACTED by its publisher, where no update says so
  const marked = !retraction && RETRACTED_MARK.test(record.title || '') ? { label: 'Retracted', from: `the title ${read.from} gives it`, url: read.url } : undefined;
  const small = [
    cmp.title === 'close' && 'The title differs a little (a subtitle, a word).',
    cmp.year === 'near' && 'The year is a year apart (a preprint and its paper, or online and in print).'
  ].filter(Boolean);
  const status = retraction || marked ? 'retracted' : differences.length ? 'differs' : 'found';
  return {
    ...row,
    status,
    read,
    record,
    ...(differences.length && { differences }),
    ...((retraction || marked) && { retraction: retraction || marked }),
    ...(notices.length && { notices }),
    ...((small.length || row.note) && { note: [row.note, ...small].filter(Boolean).join(' ') })
  };
}

/**
 * Checks a document's bibliography (the .bib files it loads, else every .bib; the main file's when no document is
 * named): every entry, or the keys named. Returns { rows, document, bibFiles (the files read), missing (the ones it
 * names that are not there), everyBib, absent (keys asked for that no file read holds) }, rows in the order of the files.
 */
export async function checkReferences(root, { keys, state, file } = {}) {
  const { document, bibs, missing, everyBib, entries: all } = await documentBib(root, state, file);
  const wanted = Array.isArray(keys) && keys.length ? all.filter((e) => keys.includes(e.key)) : all;
  const entries = wanted.slice(0, MAX_ENTRIES);
  const rows = new Array(entries.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, entries.length) }, async () => {
    while (next < entries.length) {
      const i = next++;
      rows[i] = await checkEntry(entries[i]);
    }
  }));
  const more = wanted.slice(MAX_ENTRIES).map((e) => ({ key: e.key, file: e.file, line: e.line, title: plainText(e.fields.title), status: 'unchecked', note: `Only the first ${MAX_ENTRIES} entries are checked at a time.` }));
  const absent = Array.isArray(keys) ? [...new Set(keys)].filter((k) => !all.some((e) => e.key === k)) : [];
  return { rows: [...rows, ...more], document, bibFiles: bibs, missing, everyBib, absent };
}

/** What a check read, said when it is not plainly the document's own .bib files: so 0 entries is never left bare. */
export function checkNote({ document, bibFiles = [], missing = [], everyBib, absent = [], rows }) {
  const are = (list) => (list.length > 1 ? 'are' : 'is');
  if (!document) return 'The project has no LaTeX, Typst or Markdown document, so no bibliography was read.';
  const notes = [];
  if (missing.length) notes.push(`${document} loads ${missing.join(', ')}, which ${are(missing)} not in the project.`);
  if (everyBib) notes.push(bibFiles.length ? `${document} loads no .bib file, so every .bib in the project was read.` : `${document} loads no .bib file and the project has none.`);
  if (bibFiles.length && !rows.length && !absent.length) notes.push(`${bibFiles.join(', ')} ${bibFiles.length > 1 ? 'hold' : 'holds'} no entries.`);
  if (absent.length) notes.push(`${absent.join(', ')} ${are(absent)} not in ${bibFiles.join(', ') || 'any .bib file read'}. If another document loads ${absent.length > 1 ? 'them' : 'it'}, check again with that document as file.`);
  return notes.join(' ');
}

/** The rows as a model reads them: one short object each, the found ones in a list of keys. */
export function checkSummary(result) {
  const { rows } = result;
  const found = rows.filter((r) => r.status === 'found');
  const note = checkNote(result);
  return {
    document: result.document,
    bibFiles: result.bibFiles,
    ...(note && { note }),
    checked: rows.length,
    found: found.map((r) => r.key),
    problems: rows.filter((r) => r.status !== 'found').map((r) => ({
      key: r.key,
      at: `${r.file}:${r.line}`,
      status: r.status,
      ...(r.differences && { differences: r.differences }),
      ...(r.retraction && { retraction: `${r.retraction.label}${r.retraction.date ? ` (${r.retraction.date})` : ''}, from ${r.retraction.from}${r.retraction.notice ? `: notice ${r.retraction.notice}` : ''}` }),
      ...(r.record && { record: r.record }),
      ...(r.read && { readAt: r.read.url }),
      ...(r.note && { note: r.note })
    }))
  };
}
