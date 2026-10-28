// The spell checker's own thread. Hunspell keeps state between calls, so it must never run two at once: every
// request lands here and is answered in turn. One speller per language, opened the first time it is asked for.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { hunPath } from '../utils/checkerMetadata.js';

const require = createRequire(import.meta.url);
const platformModule = join(workerData.nativeDir, `${process.platform}-${process.arch}`, 'hunspell.node');
const { Speller } = require(existsSync(platformModule) ? platformModule : join(workerData.nativeDir, 'hunspell.node'));

function open(aff, dic, ...extra) {
  for (const file of [aff, dic, ...extra]) if (!existsSync(file)) throw new Error(`Missing dictionary file ${file}`);
  const speller = new Speller(hunPath(aff), hunPath(dic));
  for (const file of extra) speller.addDic(hunPath(file));
  return speller;
}

const bundled = (...parts) => join(workerData.dictDir, ...parts);
const EXTRA = bundled('spectrum-extra.dic');
const scowl = (name) => open(bundled(name, `${name}.aff`), bundled(name, `${name}.dic`), EXTRA);

/** SCOWL marks slurs with the never-suggest flag (!); AussieDic doesn't, so its suggestions are filtered by these. */
const blocked = new Set();
for (const name of ['en_AU', 'en_US', 'en_GB', 'en_CA']) {
  const file = bundled(name, `${name}.dic`);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const slash = line.indexOf('/');
    if (slash > 0 && line.slice(slash + 1).includes('!')) blocked.add(line.slice(0, slash).toLowerCase());
  }
}
const isBlocked = (word) => {
  const w = word.toLowerCase();
  return blocked.has(w) || blocked.has(w.replace(/(?:'s|s|es)$/, ''));
};

// Each language: how to open it and a few words whose answers show it loaded whole (a half-loaded dictionary only
// shows up as wrong answers). Australian English keeps its chain: en_AU decides, AussieDic adds Australian words and
// en_US only says which of those are American spellings.
const ENGLISH = {
  'en-AU': {
    open() {
      const au = open(bundled('en_AU', 'en_AU.aff'), bundled('en_AU', 'en_AU.dic'), EXTRA, bundled('spectrum-extra-au.dic'));
      const aussie = open(bundled('aussiedic', 'AussieDic.aff'), bundled('aussiedic', 'AussieDic.dic'));
      const us = open(bundled('en_US', 'en_US.aff'), bundled('en_US', 'en_US.dic'));
      return {
        spell(words) {
          const ok = au.spell(words);
          const rest = words.filter((_, i) => !ok[i]);
          if (!rest.length) return ok;
          const [inAussie, inUs] = [aussie.spell(rest), us.spell(rest)];
          let j = 0;
          return ok.map((yes) => {
            if (yes) return true;
            const k = j++;
            return inAussie[k] && !inUs[k];
          });
        },
        // AussieDic carries slang and slurs with no never-suggest marks, so only its proper nouns (places, names,
        // organisations) are offered; its other words are still accepted when typed
        suggest: (w) => [...au.suggest(w), ...aussie.suggest(w).filter((s) => /^\p{Lu}/u.test(s))]
      };
    },
    selfTest: [['colour', true], ['color', false], ['organise', true], ['organize', false], ['defence', true]]
  },
  'en-US': { open: () => scowl('en_US'), selfTest: [['color', true], ['colour', false], ['defense', true], ['defence', false]] },
  'en-GB': { open: () => scowl('en_GB'), selfTest: [['colour', true], ['color', false], ['defence', true], ['defense', false]] },
  'en-CA': { open: () => scowl('en_CA'), selfTest: [['colour', true], ['organize', true], ['organise', false], ['tyre', false]] },
  'en-IN': { open: () => scowl('en_GB'), selfTest: [['colour', true], ['color', false], ['defence', true], ['defense', false]] }
};

// a speller not asked for in 30 minutes is dropped, except the first listed language's (Australian English until a
// list says otherwise)
const IDLE_MS = 30 * 60_000;
let keep = 'en-AU';
const spellers = new Map();

/** A speller that answers its self-test as it should, or an error naming the words it got wrong. */
function tested(lang, speller, selfTest) {
  const answers = speller.spell(selfTest.map(([w]) => w));
  const failed = selfTest.filter(([, ok], i) => answers[i] !== ok).map(([w]) => w);
  if (failed.length) throw new Error(`The ${lang} dictionary gave wrong answers for: ${failed.join(', ')}`);
  return speller;
}

/** A downloaded dictionary, { dir, selfTest: [words], version }: dictionary.aff and dictionary.dic in dir, with the supplement. */
const openDownloaded = (lang, { dir, selfTest = [] }) =>
  tested(lang, open(join(dir, 'dictionary.aff'), join(dir, 'dictionary.dic'), EXTRA), selfTest.map((w) => [w, true]));

/** The speller for `lang`, opened on first use, and again when a downloaded dictionary's version changes. */
function spellerFor(lang = 'en-AU', dictionary) {
  const now = Date.now();
  for (const [tag, entry] of spellers) if (tag !== keep && now - entry.used > IDLE_MS) spellers.delete(tag);
  let entry = spellers.get(lang);
  if (!entry || entry.version !== dictionary?.version) {
    let speller;
    if (Object.hasOwn(ENGLISH, lang)) speller = tested(lang, ENGLISH[lang].open(), ENGLISH[lang].selfTest);
    else if (dictionary?.dir) speller = openDownloaded(lang, dictionary);
    else throw new Error(`No dictionary for ${lang}`);
    entry = { speller, version: dictionary?.version };
    spellers.set(lang, entry);
  }
  entry.used = now;
  return entry.speller;
}

/** Words the checker leaves alone: initials, acronyms, camelCase names, anything with a digit. */
const skip = (word) => word.length < 2 || /\d/.test(word) || /^[\p{Lu}']+$/u.test(word) || /\p{Ll}\p{Lu}/u.test(word);
const clean = (raw) => String(raw).replace(/’/g, "'").replace(/^'+|'+$/g, '');

// Australian English is what everyone has, so it is opened (and tested) before saying ready
spellerFor('en-AU');

parentPort.on('message', ({ id, op, words, word, lang, dictionary, candidates, first }) => {
  try {
    if (first) keep = first;
    let result;
    // how many of a piece's words each candidate language accepts, for detection
    if (op === 'vote') {
      const wanted = words.map(clean).filter((w) => !skip(w));
      const accepted = Object.fromEntries(candidates.map((c) => [c.lang, spellerFor(c.lang, c.dictionary).spell(wanted).filter(Boolean).length]));
      parentPort.postMessage({ id, result: { words: wanted.length, accepted } });
      return;
    }
    // a download is opened and tested before it is put in place, and not kept
    if (op === 'test') {
      parentPort.postMessage({ id, result: openDownloaded(lang, dictionary).encoding() });
      return;
    }
    const speller = spellerFor(lang, dictionary);
    if (op === 'check') {
      // a word sent with the full stop after it ("usw.") is right as itself or, failing that, with the stop
      const bare = (raw) => clean(String(raw).replace(/\.$/, ''));
      const wanted = words.filter((raw) => !skip(bare(raw)));
      const ok = speller.spell(wanted.map(bare));
      const dotted = wanted.filter((raw, i) => !ok[i] && raw.endsWith('.'));
      const abbreviations = speller.spell(dotted.map((raw) => `${bare(raw)}.`));
      const accepted = new Set(dotted.filter((_, i) => abbreviations[i]));
      result = wanted.filter((raw, i) => !ok[i] && !accepted.has(raw));
    } else if (op === 'suggest') {
      const w = String(word).replace(/’/g, "'");
      const all = [...new Set(speller.suggest(w))];
      const ok = speller.spell(all);
      result = all.filter((s, i) => ok[i] && !isBlocked(s)).slice(0, 8);
    } else {
      throw new Error(`Unknown request ${op}`);
    }
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
parentPort.postMessage({ ready: true });
