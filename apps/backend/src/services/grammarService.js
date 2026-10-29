import fs from 'fs/promises';
import path from 'path';
import { APP_VERSION, DICT_DIR, NATIVE_DIR } from '../config/constants.js';
import { maskLatex, maskMarkdown, maskTypst } from '../latex/mask.js';
import { APP_DIR, getProjectRoot } from './projectService.js';
import { writeFileAtomic } from '../utils/fsUtils.js';
import { workerClient } from '../utils/workerClient.js';
import { HARPER_FILES, inspectCheckerAssets } from '../utils/checkerMetadata.js';
import { languagesOf, ownWords } from './spellService.js';
import { languageMarkup, prosePieces } from '../language/markup.js';
import { languageEntry } from '../language/detect.js';
import { checkWithLanguageTool, ensureServer, readConnection } from './languageToolService.js';
import { readProjectSettings, updateProjectSettings } from './projectSettings.js';

// Grammar by paragraph, each in the listed language detection gives it: English through Harper on its own thread
// (grammarWorker.mjs) in its dialect, or through LanguageTool if the user chose that; other languages through
// LanguageTool when it's on this computer. LaTeX and Typst are reduced to their prose first, so the checkers read
// sentences, not markup, at the same positions.
const harper = workerClient(new URL('./grammarWorker.mjs', import.meta.url), { nativeDir: NATIVE_DIR, dictDir: DICT_DIR }, {
  unavailable: 'Grammar check isn’t available',
  timeoutMs: 60_000
});

export const MAX_GRAMMAR_CHARS = 2_000_000;

// what Harper files as style rather than error; shown only when style suggestions are on
const STYLE_KINDS = new Set(['Style', 'Readability', 'Enhancement', 'Redundancy', 'Formatting']);
// the serial comma is a house rule the user picked, whatever kind Harper gives it
const ALWAYS = new Set(['OxfordComma', 'NoOxfordComma']);
const OXFORD = new Set(['avoid', 'require', 'off']);
// the five English dialects Harper 3 has, by language tag; Australian English is the default
export const HARPER_DIALECTS = { 'en-AU': 'Australian', 'en-US': 'American', 'en-GB': 'British', 'en-CA': 'Canadian', 'en-IN': 'Indian' };

/**
 * Harper's engine, version and files. It's started only by the first check, or start (checkers:verify): Settings
 * asking keeps it from holding some 200 MB for the rest of the session; started: false until then.
 */
export async function grammarStatus({ start = false } = {}) {
  const assets = await inspectCheckerAssets(path.join(NATIVE_DIR, 'harper'), 'manifest.json', HARPER_FILES);
  const status = start || harper.running() ? await harper.status() : { available: assets.integrity === 'verified', started: false };
  return { ...status, languages: Object.keys(HARPER_DIALECTS), engine: 'Harper', version: assets.version,
    diagnostics: { appVersion: APP_VERSION, node: process.version, platform: process.platform, arch: process.arch, assets } };
}

export const stopGrammar = () => harper.terminate();

// Harper reads a long file in parts of about this many characters of its runs, so a check stops between parts when
// cancelled and other checks don't wait behind a whole thesis
export const HARPER_PART_CHARS = 50_000;

/**
 * Harper's issues for one dialect, part by part, each part's text with everything but that dialect's runs blanked.
 * Stops between parts when signal aborts; answers { issues, parts, done }.
 */
async function harperIssues({ base, runs, markdown, oxford, dialect, words, signal }) {
  const parts = [];
  let size = Infinity;
  for (const run of runs) {
    if (size >= HARPER_PART_CHARS) {
      parts.push([]);
      size = 0;
    }
    parts.at(-1).push(run);
    size += run[1] - run[0];
  }
  const issues = [];
  let done = 0;
  for (const part of parts) {
    if (signal?.aborted) break;
    // only its runs, and in them no letters of another script (a Chinese term in English prose is blanked)
    const at = part[0][0];
    let text = '';
    let end = at;
    for (const [from, to] of part) {
      text += base.slice(end, from).replace(/[^\n]/g, ' ');
      for (let i = from; i < to; i += 1) text += base[i] === '\n' || !OTHER_SCRIPT.test(base[i]) ? base[i] : ' ';
      end = to;
    }
    let found;
    try {
      found = await harper.call({ text, oxford: OXFORD.has(oxford) ? oxford : 'avoid', markdown, dialect: HARPER_DIALECTS[dialect], words }, signal);
    } catch (err) {
      if (signal?.aborted) break;
      throw err;
    }
    for (const issue of found) issues.push({ ...issue, from: issue.from + at, to: issue.to + at });
    done += 1;
  }
  return { issues, parts: parts.length, done };
}
// a letter (or half of one) that isn't Latin
const OTHER_SCRIPT = /(?=[\p{L}\p{M}])\P{Script=Latin}|[\uD800-\uDFFF]/u;

/**
 * Issues in `text` as { rule, kind, from, to, message, suggestions, fixable, engine, lang }, with from/to as UTF-16
 * offsets into `text`, and coverage: for each listed language found, { lang, engine, pieces, chars, parts, done,
 * state, message }, state being checked, none (no grammar checker), off or not-downloaded (LanguageTool isn't on or
 * isn't here), failed or cancelled. fixable is false when the span runs into markup, where a suggestion written for
 * the prose would break the LaTeX. languages is the list in effect (language, one tag, for older callers); signal
 * stops Harper and LanguageTool between parts.
 */
export async function checkGrammar({ text, file = '', style = false, oxford = 'avoid', ignoredRules = [], languageToolIgnored = {}, languages, language, englishGrammar = 'harper', projectId, signal }) {
  const source = String(text);
  const kind = /\.(tex|ltx)$/i.test(file) ? 'latex' : /\.typ$/i.test(file) ? 'typst' : /\.(md|markdown)$/i.test(file) ? 'markdown' : 'text';
  const prose = kind === 'latex' ? maskLatex(source) : kind === 'typst' ? maskTypst(source) : kind === 'markdown' ? maskMarkdown(source) : source;
  // Harper reads Markdown itself
  const base = kind === 'markdown' ? source : prose;
  const { main, ranges } = languageMarkup(source, kind);
  const cut = prosePieces(prose, ranges);
  const { langs } = await languagesOf({ languages: languages ?? (language ? [language] : undefined), main, pieces: cut.map((p) => ({ text: prose.slice(p.from, p.to), lang: p.lang })) });
  const byLang = new Map();
  cut.forEach((piece, i) => {
    if (!langs[i]) return;
    if (!byLang.has(langs[i])) byLang.set(langs[i], []);
    byLang.get(langs[i]).push([piece.from, piece.to]);
  });

  const words = await ownWords(projectId);
  const { mode } = await readConnection();
  let server = null;
  const raw = [];
  const coverage = [];
  for (const [lang, runs] of byLang) {
    const entry = languageEntry(lang);
    const about = { lang, pieces: runs.length, chars: runs.reduce((sum, [from, to]) => sum + to - from, 0) };
    const english = Object.hasOwn(HARPER_DIALECTS, lang);
    let fallback = null;
    if (entry?.languageTool && (!english || englishGrammar === 'languagetool')) {
      let checked;
      if (mode !== 'local') checked = { state: 'off', parts: 0, done: 0, issues: [] };
      else {
        try {
          server ||= await ensureServer();
          checked = await checkWithLanguageTool({ server, source, prose, runs, code: entry.languageTool, lang, ignored: languageToolIgnored[lang] || [],
            spelt: !!entry.spelling, style, signal });
        } catch (err) {
          checked = { state: err.code === 'not-downloaded' ? 'not-downloaded' : 'failed', message: err.message, parts: 0, done: 0, issues: [] };
        }
      }
      raw.push(...checked.issues);
      if (checked.state === 'checked' || checked.state === 'cancelled' || !english) {
        coverage.push({ ...about, engine: 'languagetool', parts: checked.parts, done: checked.done, state: checked.state, message: checked.message || '' });
        continue;
      }
      // English that LanguageTool couldn't check goes to Harper, and the summary says so
      fallback = { state: checked.state, message: checked.message || '' };
    }
    if (english) {
      const { issues: found, parts, done } = await harperIssues({ base, runs, markdown: kind === 'markdown', oxford, dialect: lang, words, signal });
      raw.push(...found.map((issue) => ({ ...issue, engine: 'harper', lang })));
      const state = done < parts ? 'cancelled' : 'checked';
      coverage.push({ ...about, engine: 'harper', parts, done, state, message: state === 'cancelled' ? `Cancelled: ${done} of ${parts} parts checked.` : '', ...(fallback && { fallback }) });
    } else {
      coverage.push({ ...about, engine: null, parts: 0, done: 0, state: 'none', message: '' });
    }
  }

  const ignored = new Set(ignoredRules);
  const issues = raw
    .filter((issue) => issue.engine !== 'harper' || !ignored.has(issue.rule))
    .filter((issue) => ALWAYS.has(issue.rule) || style || !STYLE_KINDS.has(issue.kind))
    // the checkers sometimes react to the blanks left where markup was
    .filter((issue) => issue.to === issue.from || base.slice(issue.from, issue.to).trim())
    .map((issue) => ({ ...issue, fixable: source.slice(issue.from, issue.to) === base.slice(issue.from, issue.to) }))
    .sort((a, b) => a.from - b.from);
  return { issues, coverage };
}

// ─── LanguageTool's ignored rules, in .spectrum/settings.json as languageToolIgnored: { "de:RULE_ID": true } ───
// One key per rule, so two computers ignoring different rules merge rule by rule (mergeMeta), and the list travels
// with the project. Harper's stay in grammar.json, on each computer, as before.

/** LanguageTool's ignored rules by language: { de: ['RULE_ID'] }. */
export async function readLanguageToolIgnored(projectId) {
  const { languageToolIgnored } = await readProjectSettings(await getProjectRoot(projectId));
  const out = {};
  for (const [key, on] of Object.entries(languageToolIgnored && typeof languageToolIgnored === 'object' ? languageToolIgnored : {})) {
    const at = key.indexOf(':');
    if (on !== true || at < 1) continue;
    (out[key.slice(0, at)] ||= []).push(key.slice(at + 1));
  }
  return out;
}

export async function changeLanguageToolIgnored(projectId, lang, rule, remove = false) {
  const key = `${String(lang).slice(0, 20)}:${String(rule).slice(0, 200)}`;
  await updateProjectSettings(await getProjectRoot(projectId), ({ languageToolIgnored, ...rest }) => {
    const next = { ...(languageToolIgnored && typeof languageToolIgnored === 'object' && !Array.isArray(languageToolIgnored) ? languageToolIgnored : {}) };
    if (remove) delete next[key];
    else next[key] = true;
    return { ...rest, ...(Object.keys(next).length && { languageToolIgnored: next }) };
  });
  return readLanguageToolIgnored(projectId);
}

// ─── rules the user turned off for a project (.spectrum/grammar.json) ───

const settingsFile = async (projectId) => path.join(await getProjectRoot(projectId), APP_DIR, 'grammar.json');

// Harper rules renamed since a rule could be ignored. The file keeps the old name (older Spectrums read it), and
// ignoring the old name ignores the new one too.
const RENAMED = { NobelPeacePrize: 'NobelNoble' };

/** The rules as the file has them. */
async function storedRules(projectId) {
  try {
    const rules = JSON.parse(await fs.readFile(await settingsFile(projectId), 'utf8')).ignoredRules;
    return Array.isArray(rules) ? rules.filter((r) => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export async function readIgnoredRules(projectId) {
  const rules = await storedRules(projectId);
  return [...new Set([...rules, ...rules.map((r) => RENAMED[r]).filter(Boolean)])];
}

export async function changeIgnoredRule(projectId, rule, remove = false) {
  const rules = new Set(await storedRules(projectId));
  if (remove) {
    rules.delete(rule);
    for (const [old, now] of Object.entries(RENAMED)) if (now === rule) rules.delete(old);
  } else rules.add(String(rule).slice(0, 200));
  const file = await settingsFile(projectId);
  await writeFileAtomic(file, `${JSON.stringify({ ignoredRules: [...rules].sort() }, null, 2)}\n`);
  return (await readIgnoredRules(projectId)).sort();
}
