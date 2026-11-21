// The claims ledger: what a claims check found, claim by claim, kept as evidence rather than as prose. The agent records
// each claim with record_claim, and the code checks it before it is kept: the claim is at the file and line given, its
// keys are in the bibliography, and a quote that backs a rating is in the source word for word (on which page, or in
// the abstract only), read again here, not taken on the model's word. One file per claim in .spectrum/research/claims/,
// as to-dos are kept, so two computers' ledgers join.
import crypto from 'crypto';
import { promises as fs } from 'fs';
import { allBibEntries } from '../mcp/tools.js';
import { readItems } from '../routes/todos.js';
import { writeJsonAtomic } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { appPath, httpError, mutateProjectRoot } from './projectService.js';
import { findSource } from './sourceReader.js';

export const RATINGS = ['supported', 'partly', 'unsupported', 'needs-source', 'not-checkable'];
// a rating that says what the source says needs the source's own words
const QUOTED = ['supported', 'partly', 'unsupported'];
const FOLDER = 'research/claims';
const MIN_QUOTE_WORDS = 6;

/** Letters and digits alone, lowercased, ligatures and accents kept apart: what a quote and a PDF's text agree on. */
const letters = (text) => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const wordsOf = (text) => String(text || '').toLowerCase().match(/\p{L}{4,}/gu) || [];

/** Whether most of the claim’s longer words are on its line, the one before or the two after (a LaTeX \cite in between is no matter). */
function claimAt(text, line, claim) {
  const lines = text.split(/\r?\n/);
  if (line < 1 || line > lines.length) return false;
  const near = new Set(wordsOf(lines.slice(Math.max(0, line - 2), line + 2).join(' ')));
  const want = wordsOf(claim);
  return want.length > 0 && want.filter((w) => near.has(w)).length / want.length >= 0.6;
}

/**
 * Where the quote is in the source: { kind: 'full text', page } or { kind: 'abstract' }, or null. page: the page the
 * model named, tried first, then the rest.
 */
export function quoteIn(source, quote, page) {
  const want = letters(quote);
  if (!want) return null;
  if (source.kind === 'abstract') return letters(source.abstract).includes(want) ? { kind: 'abstract' } : null;
  const order = [page, ...source.pages.map((_, i) => i + 1)].filter((n, i, all) => n >= 1 && n <= source.pages.length && all.indexOf(n) === i);
  // on one page, else running on from one page to the next
  const at = order.find((n) => letters(source.pages[n - 1]).includes(want)) || order.find((n) => n < source.pages.length && letters(source.pages[n - 1] + source.pages[n]).includes(want));
  return at ? { kind: 'full text', page: at } : null;
}

const short = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Checks a claim and keeps it: { claim, file, line, keys?, rating, quote?, source?: { doi | arxiv | key | path }, page?,
 * note? }. Throws, saying what to put right, when the claim is not at that line, a key is not in the bibliography, or
 * a rating that needs a quote has none or one the source does not hold word for word. Returns the row kept.
 */
export async function recordClaim(root, input, { checkPath = (p) => p } = {}) {
  const claim = short(input.claim, 1000);
  const rating = String(input.rating || '');
  if (!claim) throw new Error('Give the claim, as the text says it.');
  if (!RATINGS.includes(rating)) throw new Error(`rating is one of ${RATINGS.join(', ')}.`);
  const file = checkPath(String(input.file || ''));
  const line = Number(input.line);
  const text = await fs.readFile(safeJoin(root, file), 'utf8').catch(() => null);
  if (text === null) throw new Error(`There is no file ${file}.`);
  if (!Number.isInteger(line) || !claimAt(text, line, claim)) throw new Error(`The claim is not at ${file}:${line}. Give the line read_file or search_text shows it on.`);
  const keys = [...new Set((Array.isArray(input.keys) ? input.keys : []).map(String).filter(Boolean))].slice(0, 20);
  if (keys.length) {
    const known = new Set((await allBibEntries(root)).map((e) => e.key));
    const missing = keys.filter((k) => !known.has(k));
    if (missing.length) throw new Error(`The bibliography has no ${missing.join(', ')}.`);
  }
  const row = { id: crypto.randomUUID(), text: claim, file, line, keys, rating, createdAt: new Date().toISOString() };
  const note = short(input.note, 600);
  if (note) row.note = note;
  if (QUOTED.includes(rating)) {
    const quote = short(input.quote, 600);
    if ((quote.match(/[\p{L}\p{N}]+/gu) || []).length < MIN_QUOTE_WORDS) {
      throw new Error(`A claim rated ${rating} needs the source’s own words in quote: at least ${MIN_QUOTE_WORDS} words, copied from read_source’s text.`);
    }
    const s = input.source && typeof input.source === 'object' ? input.source : {};
    if (![s.doi, s.arxiv, s.key, s.path].some((v) => typeof v === 'string' && v.trim())) throw new Error('Name the source the quote is from: { key }, { doi }, { arxiv } or { path }.');
    const source = await findSource(root, { doi: s.doi, arxiv: s.arxiv, key: s.key, path: s.path && checkPath(s.path) });
    const found = quoteIn(source, quote, Number(input.page) || 0);
    if (!found) throw new Error(`The quote is not in the ${source.kind} of ${source.where} word for word, so the claim was not recorded. Copy it from read_source’s text as it is${source.kind === 'abstract' ? ' (only the abstract could be read: rate the claim not-checkable if the abstract does not cover it)' : ''}.`);
    Object.assign(row, { quote, read: { ...found, where: source.where } });
  }
  await mutateProjectRoot(root, () => writeJsonAtomic(appPath(root, FOLDER, `${row.id}.json`), row));
  return row;
}

/** The ledger, oldest first. */
export const listClaims = (root) => readItems(root, FOLDER);

export async function deleteClaim(root, id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''))) throw httpError('Invalid id.', 400);
  await mutateProjectRoot(root, () => fs.rm(appPath(root, FOLDER, `${id}.json`), { force: true }));
}
