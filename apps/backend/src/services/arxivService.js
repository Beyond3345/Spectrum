import { promises as fs, createWriteStream } from 'fs';
import { pipeline, Transform } from 'stream';
import { promisify } from 'util';
import { Readable } from 'stream';
import { XMLParser } from 'fast-xml-parser';

const pipelineAsync = promisify(pipeline);

export function extractArxivId(input) {
  if (!input) return '';
  const trimmed = String(input).trim();
  const match = trimmed.match(/arxiv\.org\/(abs|pdf|e-print)\/([^?#/]+)/i);
  let id = match ? match[2] : trimmed;
  id = id.replace(/\.pdf$/i, '');
  id = id.replace(/v\d+$/i, '');
  return id;
}

const ARXIV_HEADERS = { 'User-Agent': 'Spectrum/1.0' };

function parseFeedEntries(xml) {
  const data = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const entry = data?.feed?.entry;
  return Array.isArray(entry) ? entry : entry ? [entry] : [];
}

function toPaper(entry) {
  const authors = Array.isArray(entry.author) ? entry.author : [entry.author].filter(Boolean);
  const id = String(entry.id || '');
  return {
    title: String(entry.title || '').replace(/\s+/g, ' ').trim(),
    abstract: String(entry.summary || '').replace(/\s+/g, ' ').trim(),
    authors: authors.map((a) => a?.name).filter(Boolean),
    url: id,
    arxivId: id ? id.split('/').pop() : '',
    year: String(entry.published || '').slice(0, 4),
    // the published version's DOI and citation, when the authors gave them
    doi: String(entry['arxiv:doi']?.['#text'] ?? entry['arxiv:doi'] ?? '').trim() || undefined,
    journalRef: String(entry['arxiv:journal_ref']?.['#text'] ?? entry['arxiv:journal_ref'] ?? '').replace(/\s+/g, ' ').trim() || undefined
  };
}

/** Words a search leaves out: arXiv finds nothing for one when every word must match. */
export const STOPWORDS = new Set(('a an and are as at be by can do does for from has have how in into is it its of on or that the their this to '
  + 'was what when where which who why with within without using use used based between about over under via vs versus').split(' '));

/** yearFrom and yearTo limit the submission date (Research's year filter). */
export async function searchArxiv(query, maxResults = 5, { yearFrom, yearTo } = {}) {
  const max = Math.min(10, Math.max(1, Number(maxResults) || 5));
  // arXiv reads words apart as OR, and ranks half its papers for a few common words, so every word must match
  const typed = String(query).split(/\s+/).map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
  const kept = typed.filter((word) => !STOPWORDS.has(word.toLowerCase()));
  const words = (kept.length ? kept : typed.length ? typed : [String(query)]).map((word) => `all:${encodeURIComponent(word)}`);
  if (yearFrom || yearTo) words.push(`submittedDate:%5B${yearFrom || 1991}01010000+TO+${yearTo || 9999}12312359%5D`);
  const url = `https://export.arxiv.org/api/query?search_query=${words.join('+AND+')}&start=0&max_results=${max}`;
  const res = await fetch(url, { headers: ARXIV_HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`arXiv search failed: ${res.status}`);
  }
  return parseFeedEntries(await res.text()).map(toPaper);
}

export async function fetchArxivEntry(arxivId) {
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Spectrum/1.0' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) {
    throw new Error(`arXiv API failed: ${res.status}`);
  }
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);
  const entry = Array.isArray(data?.feed?.entry) ? data.feed.entry[0] : data?.feed?.entry;
  if (!entry) return null;
  const authors = Array.isArray(entry.author) ? entry.author : [entry.author].filter(Boolean);
  const authorNames = authors.map((a) => a?.name).filter(Boolean);
  const published = entry.published || '';
  const year = published ? String(published).slice(0, 4) : '';
  return {
    title: String(entry.title || '').replace(/\s+/g, ' ').trim(),
    abstract: String(entry.summary || '').replace(/\s+/g, ' ').trim(),
    authors: authorNames,
    year,
    id: String(entry.id || ''),
    arxivId
  };
}

export function buildArxivBibtex(entry) {
  if (!entry) return '';
  const key = `arxiv:${entry.arxivId}`;
  const author = entry.authors.join(' and ');
  const year = entry.year || '2024';
  return `@article{${key},\n  title={${entry.title}},\n  author={${author}},\n  journal={arXiv preprint arXiv:${entry.arxivId}},\n  year={${year}}\n}`;
}

export async function downloadArxivSource(arxivId, outputPath, onProgress, signal) {
  // tests point SPECTRUM_ARXIV_BASE at a local mock
  const base = (process.env.SPECTRUM_ARXIV_BASE || 'https://arxiv.org').replace(/\/+$/, '');
  const url = `${base}/e-print/${arxivId}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Spectrum/1.0' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000)
    });
  } catch {
    signal?.throwIfAborted();
    throw new Error('Couldn’t reach arXiv. Check the internet connection and try again.');
  }
  if (!res.ok) {
    throw new Error(res.status === 404
      ? 'arXiv has no source for that ID. Check the ID or link.'
      : `arXiv returned an error (HTTP ${res.status}). Try again later.`);
  }
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  let received = 0;
  const progress = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (onProgress) onProgress({ received, total });
      cb(null, chunk);
    }
  });
  const nodeStream = Readable.fromWeb(res.body);
  await pipelineAsync(nodeStream, progress, createWriteStream(outputPath));
}
