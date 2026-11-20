import { latexToText } from '../latex/conversion.js';
import { normaliseTitle } from './referenceService.js';

// Whether a work found in a source is the one asked for: its title, first author and year against the ones wanted,
// compared by code, so a title the model made up never comes back as a real entry. Used by fetch_bibtex (a title to
// BibTeX) and by the references check (each .bib entry against its record).

/** A title's words, without the mark a publisher puts before a retracted one's ("RETRACTED: …"). */
const words = (title) => normaliseTitle(String(title || '').replace(RETRACTED_MARK, '')).split(' ').filter(Boolean);
export const RETRACTED_MARK = /^\s*(?:retracted|withdrawn)(?:\s+article)?\s*[:.\u2013\u2014-]\s*/i;

/**
 * How two titles compare: 'same' once normalised (case, accents, LaTeX and punctuation aside), 'close' when most of
 * their words are shared (a Dice coefficient of 0.8) or one is the other with a subtitle, else 'differs'.
 */
export function titleLevel(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return 'differs';
  if (x.join(' ') === y.join(' ')) return 'same';
  const [short, long, longTitle] = x.length <= y.length ? [x, y, b] : [y, x, a];
  // "Attention is all you need" and "Attention is all you need: a study", but not "… in speech separation", nor a
  // two-word "Deep learning"
  if (short.length >= 3 && words(String(longTitle).split(/\s*[:\u2013\u2014]\s+|\s+-\s+|[?!.]\s+/)[0]).join(' ') === short.join(' ')) return 'close';
  const set = new Set(long);
  const shared = new Set(short.filter((w) => set.has(w))).size;
  return (2 * shared) / (new Set(short).size + set.size) >= 0.8 ? 'close' : 'differs';
}

/** The surname of a name as a .bib, a record or a model writes it ("Vaswani, Ashish", "Ashish Vaswani", "{OpenAI}"), folded. */
export function surname(name) {
  const text = latexToText(String(name || '')).replace(/[{}]/g, '').trim();
  const family = text.includes(',') ? text.split(',')[0] : text;
  return normaliseTitle(family).split(' ').at(-1) || '';
}

/** The first author's surname from a BibTeX author field ("A and B and others"). */
export const firstAuthorOf = (field) => surname(String(field || '').split(/\s+and\s+/i)[0]);

/**
 * want and got: { title, author (a surname, or ''), year (or '') }. Each field: 'same', 'differs' or null when one side
 * has none; a year a year apart is 'near' (a preprint and its paper, online and in print).
 */
export function compareWork(want, got) {
  const author = want.author && got.author ? (want.author === got.author ? 'same' : 'differs') : null;
  const gap = want.year && got.year ? Math.abs(Number(want.year) - Number(got.year)) : null;
  return {
    title: titleLevel(want.title, got.title),
    author,
    year: gap === null ? null : gap === 0 ? 'same' : gap === 1 ? 'near' : 'differs'
  };
}

/** 'exact', 'close' or 'weak': how far a compareWork result lets the found work stand for the one wanted. */
export function matchLevel(cmp) {
  if (cmp.title === 'differs' || cmp.author === 'differs' || cmp.year === 'differs') return 'weak';
  return cmp.title === 'same' && cmp.year !== 'near' ? 'exact' : 'close';
}
