import fs from 'fs/promises';
import path from 'path';
import { APP_VERSION, DATA_DIR, DICT_DIR, NATIVE_DIR } from '../config/constants.js';
import { APP_DIR, getProjectRoot } from './projectService.js';
import { writeFileAtomic } from '../utils/fsUtils.js';
import { workerClient } from '../utils/workerClient.js';
import { existsSync } from 'node:fs';
import { DICTIONARY_FILES, inspectCheckerAssets } from '../utils/checkerMetadata.js';

// Australian English spelling through nodehun, on a thread of its own (spellWorker.mjs). If it
// can't start, spelling reports itself unavailable and the rest of Spectrum carries on.
const speller = workerClient(new URL('./spellWorker.mjs', import.meta.url), { nativeDir: NATIVE_DIR, dictDir: DICT_DIR }, {
  unavailable: 'Spell check isn’t available',
  timeoutMs: 20_000
});

export async function spellStatus() {
  const platformDir = path.join(NATIVE_DIR, `${process.platform}-${process.arch}`);
  const dir = existsSync(path.join(platformDir, 'nodehun.node')) ? platformDir : NATIVE_DIR;
  const [status, assets, dictionaries] = await Promise.all([
    speller.status(), inspectCheckerAssets(dir, 'nodehun.manifest.json', ['nodehun.node']),
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

/** The words that aren't Australian English, leaving out the ones on the user's lists. */
export async function checkWords(words, projectId) {
  const unique = [...new Set(words.map(String).filter((w) => w && w.length <= 100))].slice(0, 5000);
  const own = new Set([...(await readList(GLOBAL_FILE())), ...(projectId ? await readList(await projectFile(projectId)) : [])]);
  const wanted = unique.filter((w) => !own.has(key(w)) && !own.has(key(w).toLowerCase()));
  if (!wanted.length) return [];
  return speller.call({ op: 'check', words: wanted });
}

export async function suggestWord(word) {
  return speller.call({ op: 'suggest', word: String(word).slice(0, 100) });
}
