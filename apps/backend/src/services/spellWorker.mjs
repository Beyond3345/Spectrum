// The spell checker's own thread. Hunspell 1.3.3 keeps state between calls, so it must never run
// two at once: every request lands here and is answered in turn.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const platformModule = join(workerData.nativeDir, `${process.platform}-${process.arch}`, 'nodehun.node');
const nodehun = require(existsSync(platformModule) ? platformModule : join(workerData.nativeDir, 'nodehun.node'));
const Nodehun = nodehun.Nodehun || nodehun;
const read = (...parts) => readFileSync(join(workerData.dictDir, ...parts));

// en_AU decides; AussieDic adds Australian words; en_US only says which of those are American spellings
const au = new Nodehun(read('en_AU', 'en_AU.aff'), read('en_AU', 'en_AU.dic'));
au.addDictionarySync(read('spectrum-extra.dic'));
const aussie = new Nodehun(read('aussiedic', 'AussieDic.aff'), read('aussiedic', 'AussieDic.dic'));
const us = new Nodehun(read('en_US', 'en_US.aff'), read('en_US', 'en_US.dic'));

// SCOWL marks slurs with the never-suggest flag (!); AussieDic doesn't, so its suggestions are filtered by these
const blocked = new Set();
for (const dic of [['en_AU', 'en_AU.dic'], ['en_US', 'en_US.dic']]) {
  for (const line of read(...dic).toString('utf8').split('\n')) {
    const slash = line.indexOf('/');
    if (slash > 0 && line.slice(slash + 1).includes('!')) blocked.add(line.slice(0, slash).toLowerCase());
  }
}
const isBlocked = (word) => {
  const w = word.toLowerCase();
  return blocked.has(w) || blocked.has(w.replace(/(?:'s|s|es)$/, ''));
};

const accepted = (word) => au.spellSync(word) || (aussie.spellSync(word) && !us.spellSync(word));

/** Words the checker leaves alone: initials, acronyms, camelCase names, anything with a digit. */
const skip = (word) => word.length < 2 || /\d/.test(word) || /^[\p{Lu}']+$/u.test(word) || /\p{Ll}\p{Lu}/u.test(word);

// a half-loaded dictionary only shows up as wrong answers, so check a few before saying ready
const selfTest = [
  ['colour', true],
  ['color', false],
  ['organise', true],
  ['organize', false],
  ['defence', true]
];
const failed = selfTest.filter(([word, ok]) => accepted(word) !== ok).map(([word]) => word);
if (failed.length) throw new Error(`The Australian dictionary gave wrong answers for: ${failed.join(', ')}`);

parentPort.on('message', ({ id, op, words, word }) => {
  try {
    let result;
    if (op === 'check') {
      result = [];
      for (const raw of words) {
        const w = String(raw).replace(/’/g, "'").replace(/^'+|'+$/g, '');
        if (!skip(w) && !accepted(w)) result.push(raw);
      }
    } else if (op === 'suggest') {
      const w = String(word).replace(/’/g, "'");
      // AussieDic carries slang and slurs with no never-suggest marks, so only its proper nouns
      // (places, names, organisations) are offered; its other words are still accepted when typed
      const all = [...(au.suggestSync(w) || []), ...(aussie.suggestSync(w) || []).filter((s) => /^\p{Lu}/u.test(s))];
      result = [...new Set(all)].filter((s) => accepted(s) && !isBlocked(s)).slice(0, 8);
    } else {
      throw new Error(`Unknown request ${op}`);
    }
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
parentPort.postMessage({ ready: true });
