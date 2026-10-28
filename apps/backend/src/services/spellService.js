import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { APP_VERSION, DATA_DIR, DICT_DIR, NATIVE_DIR } from '../config/constants.js';
import { APP_DIR, getProjectRoot, httpError, serialiser } from './projectService.js';
import { renameOver, writeFileAtomic } from '../utils/fsUtils.js';
import { workerClient } from '../utils/workerClient.js';
import { existsSync } from 'node:fs';
import { DICTIONARY_FILES, inspectCheckerAssets, sha256 } from '../utils/checkerMetadata.js';
import languageList from '../data/languages.json' with { type: 'json' };

// Spelling through Spectrum's Hunspell binding, on a thread of its own (spellWorker.mjs), Australian English unless
// asked for another language. If it can't start, spelling reports itself unavailable and the rest of Spectrum carries on.
const speller = workerClient(new URL('./spellWorker.mjs', import.meta.url), { nativeDir: NATIVE_DIR, dictDir: DICT_DIR }, {
  unavailable: 'Spell check isn’t available',
  timeoutMs: 20_000
});

export async function spellStatus() {
  const platformDir = path.join(NATIVE_DIR, `${process.platform}-${process.arch}`);
  const dir = existsSync(path.join(platformDir, 'hunspell.node')) ? platformDir : NATIVE_DIR;
  const [status, assets, dictionaries] = await Promise.all([
    speller.status(), inspectCheckerAssets(dir, 'hunspell.manifest.json', ['hunspell.node']),
    inspectCheckerAssets(DICT_DIR, 'manifest.json', DICTIONARY_FILES)
  ]);
  return { ...status, language: 'en-AU', engine: 'Hunspell', version: assets.version,
    diagnostics: { appVersion: APP_VERSION, node: process.version, platform: process.platform, arch: process.arch, assets, dictionaries } };
}

export const stopSpeller = () => speller.terminate();

// ─── personal word lists: one for every project, and one per project ───

const GLOBAL_FILE = () => path.join(DATA_DIR, 'dictionary.txt');
const projectFile = async (projectId) => path.join(await getProjectRoot(projectId), APP_DIR, 'dictionary.txt');
const lists = new Map();

const key = (word) => String(word).replace(/’/g, "'").trim();

async function readList(file) {
  if (lists.has(file)) return lists.get(file);
  let words = [];
  try {
    words = (await fs.readFile(file, 'utf8')).split('\n').map(key).filter(Boolean);
  } catch {
    // no list yet
  }
  const set = new Set(words);
  lists.set(file, set);
  return set;
}

async function fileFor(scope, projectId) {
  if (scope === 'project') {
    if (!projectId) throw new Error('A project word needs a project.');
    return projectFile(projectId);
  }
  return GLOBAL_FILE();
}

export async function listWords(projectId) {
  return {
    global: [...(await readList(GLOBAL_FILE()))].sort((a, b) => a.localeCompare(b, 'en-AU')),
    project: projectId ? [...(await readList(await projectFile(projectId)))].sort((a, b) => a.localeCompare(b, 'en-AU')) : []
  };
}

export async function changeWord({ word, scope = 'global', projectId, remove = false }) {
  const w = key(word);
  if (!w || w.length > 100 || /\s/.test(w)) throw new Error('That isn’t a single word.');
  const file = await fileFor(scope, projectId);
  const set = await readList(file);
  if (remove) set.delete(w);
  else set.add(w);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeFileAtomic(file, [...set].sort().join('\n') + (set.size ? '\n' : ''));
  return listWords(projectId);
}

/** The user's words and the project's, as written (Harper matches by case). */
export async function ownWords(projectId) {
  return [...new Set([...(await readList(GLOBAL_FILE())), ...(projectId ? await readList(await projectFile(projectId)) : [])])];
}

/** The words `lang` doesn't know (Australian English by default), leaving out the ones on the user's lists. */
export async function checkWords(words, projectId, lang = 'en-AU') {
  const unique = [...new Set(words.map(String).filter((w) => w && w.length <= 100))].slice(0, 5000);
  const own = new Set(await ownWords(projectId));
  const wanted = unique.filter((w) => !own.has(key(w)) && !own.has(key(w).toLowerCase()));
  if (!wanted.length) return [];
  return speller.call({ op: 'check', words: wanted, ...await spellerFor(lang) });
}

export async function suggestWord(word, lang = 'en-AU') {
  return speller.call({ op: 'suggest', word: String(word).slice(0, 100), ...await spellerFor(lang) });
}

// ─── dictionaries downloaded when asked (DATA_DIR/dictionaries/<tag>/), from the catalogue's pinned files ───

const DOWNLOADS = () => path.join(DATA_DIR, 'dictionaries');
// the names a download's files are kept under, by the catalogue's names for them
const FILES = { aff: 'dictionary.aff', dic: 'dictionary.dic', licence: 'LICENSE' };
const DOWNLOAD_FAILED = 'Check the internet connection and try again.';

// Tests point the catalogue at dictionaries they serve themselves
let catalogue = languageList;
/** Use another catalogue, as languages.json has, for this process (tests). */
export function useLanguageList(next) {
  catalogue = next;
}

const entryFor = (tag) => catalogue.languages.find((language) => language.tag === tag);
// a download that failed is not tried again until asked (Try again) or Spectrum next starts
const failures = new Map();
const downloading = new Set();
const locks = new Map();
const lockOf = (tag) => locks.get(tag) || locks.set(tag, serialiser()).get(tag);

/** What source.json must say for the catalogue's copy: a repinned dictionary no longer matches what is on disk. */
const sourceOf = ({ tag, spelling }) => ({ tag, source: spelling.source, commit: spelling.commit,
  files: Object.fromEntries(Object.entries(FILES).map(([name, file]) => [file, spelling.files[name][1]])) });

async function installed(entry) {
  try {
    const found = JSON.parse(await fs.readFile(path.join(DOWNLOADS(), entry.tag, 'source.json'), 'utf8'));
    return JSON.stringify(found) === JSON.stringify(sourceOf(entry));
  } catch {
    return false;
  }
}

/** bundled, downloaded, downloading, failed, available (to download) or none (no spelling dictionary). */
export async function dictionaryState(tag) {
  const entry = entryFor(tag);
  if (entry?.spelling?.bundled) return 'bundled';
  if (!entry?.spelling?.files) return 'none';
  if (downloading.has(tag)) return 'downloading';
  if (await installed(entry)) return 'downloaded';
  return failures.has(tag) ? 'failed' : 'available';
}

/** Every catalogued language with what checks it and its dictionary's state on this computer. */
export async function listLanguages() {
  return Promise.all(catalogue.languages.map(async (entry) => {
    const files = entry.spelling?.files;
    return { tag: entry.tag, script: entry.script, harper: entry.harper, languageTool: entry.languageTool, state: await dictionaryState(entry.tag),
      ...(files && { bytes: Object.values(files).reduce((sum, [, , bytes]) => sum + bytes, 0), licence: entry.spelling.licence, source: entry.spelling.source }),
      ...(failures.has(entry.tag) && { error: failures.get(entry.tag) }) };
  }));
}

/** What the spell worker needs to open `lang`: nothing more for a bundled one, the folder for a downloaded one. */
async function spellerFor(lang) {
  const entry = typeof lang === 'string' && entryFor(lang);
  if (!entry?.spelling) throw httpError(`There is no spelling dictionary for ${lang}.`, 400);
  if (entry.spelling.bundled) return { lang };
  if (!(await installed(entry))) throw httpError(`The ${lang} dictionary isn’t downloaded.`, 409, 'not-downloaded');
  return { lang, dictionary: { dir: path.join(DOWNLOADS(), lang), selfTest: entry.spelling.selfTest, version: entry.spelling.files.dic[1] } };
}

async function fetchFile(url) {
  // a download that stalls (no data for a while) is stopped
  const res = await fetch(url, { signal: AbortSignal.timeout(Number(process.env.SPECTRUM_DOWNLOAD_IDLE_MS) || 120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Downloads `tag`'s dictionary when asked (never on its own), checks each file's SHA-256, its encoding and its
 * self-test, and only then puts it in place, replacing an older copy. Nothing is left behind when a step fails, and
 * no other language is touched. One download per language at a time.
 */
export function installDictionary(tag) {
  return lockOf(tag)(async () => {
    const entry = entryFor(tag);
    if (!entry?.spelling?.files) throw httpError(`There is no dictionary to download for ${tag}.`, 400);
    failures.delete(tag);
    downloading.add(tag);
    const root = DOWNLOADS();
    const part = path.join(root, `${tag}.part-${crypto.randomUUID()}`);
    const old = path.join(root, `${tag}.old-${crypto.randomUUID()}`);
    try {
      await fs.mkdir(part, { recursive: true });
      for (const [name, file] of Object.entries(FILES)) {
        const [url, expected] = entry.spelling.files[name];
        let bytes;
        try {
          bytes = await fetchFile(url);
        } catch {
          throw httpError(`Couldn’t download the ${tag} dictionary. ${DOWNLOAD_FAILED}`, 502);
        }
        if (sha256(bytes) !== expected) throw httpError('The download didn’t match its checksum, so it wasn’t installed.', 502);
        if (name === 'aff') {
          const set = bytes.toString('latin1').replace(/^\xEF\xBB\xBF/, '').match(/^SET[ \t]+([^ \t\r\n]+)/m)?.[1] || 'ISO8859-1';
          if (set !== 'UTF-8' && set !== 'ISO8859-1') throw httpError(`The ${tag} dictionary is in ${set}, which Spectrum can’t read, so it wasn’t installed.`, 502);
        }
        await fs.writeFile(path.join(part, file), bytes);
      }
      try {
        await speller.call({ op: 'test', lang: tag, dictionary: { dir: part, selfTest: entry.spelling.selfTest } });
      } catch {
        throw httpError(`The ${tag} dictionary didn’t pass its self-test, so it wasn’t installed.`, 502);
      }
      await fs.writeFile(path.join(part, 'source.json'), `${JSON.stringify(sourceOf(entry), null, 2)}\n`);
      // Windows can't rename a folder over another, so an older copy moves aside first
      const target = path.join(root, tag);
      const had = existsSync(target);
      if (had) await renameOver(target, old);
      await renameOver(part, target);
      if (had) await fs.rm(old, { recursive: true, force: true });
      return { tag, state: 'downloaded' };
    } catch (err) {
      failures.set(tag, err.statusCode ? err.message : `Couldn’t install the ${tag} dictionary.`);
      throw err.statusCode ? err : httpError(failures.get(tag), 500);
    } finally {
      downloading.delete(tag);
      await fs.rm(part, { recursive: true, force: true }).catch(() => {});
    }
  });
}

/** Removes downloaded dictionaries for languages not in `keep`, and anything a stopped download left. */
export async function pruneDictionaries(keep = []) {
  const removed = [];
  const entries = await fs.readdir(DOWNLOADS(), { withFileTypes: true }).catch(() => []);
  for (const item of entries) {
    if (!item.isDirectory() || keep.includes(item.name) || downloading.has(item.name.replace(/\.(part|old)-.*$/, ''))) continue;
    await fs.rm(path.join(DOWNLOADS(), item.name), { recursive: true, force: true });
    if (!/\.(part|old)-/.test(item.name)) removed.push(item.name);
  }
  return { removed };
}
