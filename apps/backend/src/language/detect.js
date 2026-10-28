// Which of the user's languages a piece of prose is in. Never one they didn't list: markup decides first, then the
// script, then (for languages that share a script) OpenCC's tables or the candidates' own dictionaries. A piece that
// can't be decided takes the language of the piece before it, else the document's fallback.
import { readFileSync } from 'node:fs';
import catalogue from '../data/languages.json' with { type: 'json' };
import { proseWords } from '../latex/mask.js';

const ENTRIES = new Map(catalogue.languages.map((entry) => [entry.tag, entry]));
export const languageEntry = (tag) => ENTRIES.get(tag);

// Variants of one language: the list (or the document's main language) chooses, as text can't tell them apart
const BASE = { hyw: 'hy' };
const baseOf = (tag) => BASE[tag] || tag.split('-')[0];

/** A catalogue tag the markup named, as one of the listed languages: itself, or a listed variant; '' if none is listed. */
export function listedFor(tag, languages) {
  if (!tag) return '';
  if (languages.includes(tag)) return tag;
  return languages.find((listed) => baseOf(listed) === baseOf(tag)) || '';
}

// ─── scripts ───

const SCRIPTS = [...new Set(catalogue.languages.map((entry) => entry.script).filter(Boolean))];
const SCRIPT_RUN = new RegExp([...SCRIPTS, 'Hiragana', 'Katakana'].map((name) => `(\\p{Script=${name}}+)`).join('|'), 'gu');
const KANA = SCRIPTS.length;

/** Letters by script, kana counted as Kana. */
function scriptCounts(text) {
  const counts = new Map();
  for (const m of text.matchAll(SCRIPT_RUN)) {
    const k = m.slice(1).findIndex(Boolean);
    const name = k >= KANA ? 'Kana' : SCRIPTS[k];
    counts.set(name, (counts.get(name) || 0) + m[0].length);
  }
  return counts;
}

/** The script of a word (its first letter's). */
export function scriptOf(word) {
  for (const name of SCRIPTS) if (new RegExp(`^\\p{Script=${name}}`, 'u').test(word)) return name;
  return null;
}

// ─── Traditional and Simplified Chinese, from OpenCC 1.1.9's tables ───

const table = (name) => readFileSync(new URL(`../data/opencc/${name}.txt`, import.meta.url), 'utf8').split('\n')
  .map((line) => line.split('\t')).filter(([from, to]) => from && to).map(([from, to]) => [from, to.trim().split(' ')]);
const ST = new Map(table('STCharacters'));
// the forms Hong Kong and Taiwan write as standard (温, 税, 户) are never stray Simplified characters
const LOCAL = new Set([...table('HKVariants'), ...table('TWVariants')].flatMap(([, to]) => to));
/** Characters that are Simplified in every standard: not their own Traditional form, not a Hong Kong or Taiwan one. */
const SIMPLIFIED_ONLY = new Set([...ST].filter(([from, to]) => !to.includes(from) && !LOCAL.has(from)).map(([from]) => from));
const TRADITIONAL_ONLY = new Set(table('TSCharacters').filter(([from, to]) => !to.includes(from)).map(([from]) => from));
export const OPENCC_COUNTS = { simplifiedOnly: SIMPLIFIED_ONLY.size, traditionalOnly: TRADITIONAL_ONLY.size };

function chineseForms(text) {
  let simplified = 0, traditional = 0;
  for (const ch of text) {
    if (SIMPLIFIED_ONLY.has(ch)) simplified += 1;
    else if (TRADITIONAL_ONLY.has(ch)) traditional += 1;
  }
  return { simplified, traditional };
}

/** Stray Simplified characters in mostly Traditional text, as [from, to] UTF-16 ranges; none in mostly Simplified text. */
export function straySimplified(text) {
  const { simplified, traditional } = chineseForms(text);
  if (!simplified || traditional <= simplified) return [];
  const out = [];
  for (let i = 0; i < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(i));
    if (SIMPLIFIED_ONLY.has(ch)) out.push([i, i + ch.length]);
    i += ch.length;
  }
  return out;
}

/** The Traditional forms of a Simplified character (发 gives 發 and 髮). */
export const traditionalOf = (ch) => (SIMPLIFIED_ONLY.has(ch) ? ST.get(ch) : []);

// ─── verdicts ───

// how many of a piece's words the dictionaries vote on
const VOTE_WORDS = 40;
const cache = new Map();

/**
 * One piece's language from its own text alone: a listed tag, '' when it's in no listed language (not checked) or
 * null when it can't be told (it inherits). explicit is the catalogue tag markup gave it; main the document's main
 * language. vote(words, candidates) answers { words, accepted: { tag: n }, missing: [tags] } from the dictionaries
 * on this computer, or null when the spell checker isn't running.
 */
export async function verdict(text, { languages, main = null, explicit, vote }) {
  if (explicit) return listedFor(explicit, languages);
  const key = JSON.stringify([text, main, languages]);
  if (cache.has(key)) return cache.get(key);
  const { value, final } = await decide(text, { languages, main, vote });
  if (final) {
    // ponytail: cleared whole when full, an LRU if editing long documents shows it
    if (cache.size > 20_000) cache.clear();
    cache.set(key, value);
  }
  return value;
}

async function decide(text, { languages, main, vote }) {
  const counts = scriptCounts(text);
  if (!counts.size) return { value: null, final: true };
  const kana = counts.has('Kana');
  let script = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  if (script === 'Kana') script = 'Han';
  let candidates = languages.filter((tag) => ENTRIES.get(tag)?.script === script);
  // Han with kana is Japanese; without, Chinese
  if (script === 'Han') candidates = candidates.filter((tag) => (tag === 'ja') === kana);
  if (!candidates.length) return { value: '', final: true };
  // one language per base, the variant being the document's main language if listed, else the first listed; the two
  // Chinese forms are told apart by their characters instead
  const preferred = listedFor(main, languages);
  const groups = script === 'Han' ? candidates : [...new Set(candidates.map(baseOf))].map((base) =>
    (preferred && baseOf(preferred) === base ? preferred : candidates.find((tag) => baseOf(tag) === base)));
  if (groups.length === 1) return { value: groups[0], final: true };
  if (script === 'Han') {
    const { simplified, traditional } = chineseForms(text);
    const winner = simplified === traditional ? null : simplified > traditional ? 'zh-CN' : 'zh-TW';
    return { value: winner && groups.includes(winner) ? winner : null, final: true };
  }
  return voted(text, groups, vote);
}

/**
 * The candidates' dictionaries vote on the first 40 words: the one that accepts most wins if it accepts at least half
 * and leads the next by a quarter of the words (one at least). While a candidate's dictionary is missing, the winner
 * must accept 80 per cent, else the piece waits.
 */
async function voted(text, candidates, vote) {
  const words = proseWords(text).slice(0, VOTE_WORDS).map(([word]) => word);
  if (!words.length || !vote) return { value: null, final: true };
  const answer = await vote(words, candidates).catch(() => null);
  if (!answer || !answer.words) return { value: null, final: false };
  const n = answer.words;
  const ranked = Object.entries(answer.accepted).sort((a, b) => b[1] - a[1]);
  const [best, second] = [ranked[0], ranked[1]];
  const final = !answer.missing.length;
  if (!best || best[1] < n / 2 || best[1] - (second?.[1] || 0) < Math.max(1, n / 4)) return { value: null, final };
  if (!final && best[1] < 0.8 * n) return { value: null, final };
  return { value: best[0], final };
}

/** Verdicts in document order resolved: an undecided piece takes the language before it, else the fallback. */
export function resolve(verdicts, fallback) {
  let previous = fallback;
  return verdicts.map((value) => {
    if (value === null) return previous;
    if (value) previous = value;
    return value;
  });
}

/** The document's fallback: its main language as a listed one, else the first listed. */
export const fallbackOf = (languages, main) => listedFor(main, languages) || languages[0] || '';

/** The listed languages as catalogue tags, in order, at most 20, with Australian English when none is. */
export function listedLanguages(value) {
  const list = Array.isArray(value) ? [...new Set(value.filter((tag) => typeof tag === 'string' && ENTRIES.has(tag)))].slice(0, 20) : [];
  return list.length ? list : ['en-AU'];
}
