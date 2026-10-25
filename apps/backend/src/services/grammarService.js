import fs from 'fs/promises';
import path from 'path';
import { APP_VERSION, NATIVE_DIR } from '../config/constants.js';
import { maskLatex } from '../latex/mask.js';
import { APP_DIR, getProjectRoot } from './projectService.js';
import { writeFileAtomic } from '../utils/fsUtils.js';
import { workerClient } from '../utils/workerClient.js';
import { HARPER_FILES, inspectCheckerAssets } from '../utils/checkerMetadata.js';

// Grammar through Harper (Australian dialect) on its own thread (grammarWorker.mjs). LaTeX is
// reduced to its prose first, so Harper reads sentences, not markup, at the same positions.
const harper = workerClient(new URL('./grammarWorker.mjs', import.meta.url), { nativeDir: NATIVE_DIR }, {
  unavailable: 'Grammar check isn’t available',
  timeoutMs: 60_000
});

export const MAX_GRAMMAR_CHARS = 2_000_000;

// what Harper files as style rather than error; shown only when style suggestions are on
const STYLE_KINDS = new Set(['Style', 'Readability', 'Enhancement', 'Redundancy', 'Formatting']);
// the serial comma is a house rule the user picked, whatever kind Harper gives it
const ALWAYS = new Set(['OxfordComma', 'NoOxfordComma']);
const OXFORD = new Set(['avoid', 'require', 'off']);

export async function grammarStatus() {
  const [status, assets] = await Promise.all([harper.status(), inspectCheckerAssets(path.join(NATIVE_DIR, 'harper'), 'manifest.json', HARPER_FILES)]);
  return { ...status, language: 'en-AU', engine: 'Harper', version: assets.version,
    diagnostics: { appVersion: APP_VERSION, node: process.version, platform: process.platform, arch: process.arch, assets } };
}

export const stopGrammar = () => harper.terminate();

/**
 * Issues in `text` as { rule, kind, from, to, message, suggestions, fixable }, with from/to as
 * UTF-16 offsets into `text`. fixable is false when the span runs into markup, where a suggestion
 * written for the prose would break the LaTeX.
 */
export async function checkGrammar({ text, file = '', style = false, oxford = 'avoid', ignoredRules = [] }) {
  const source = String(text);
  const tex = /\.(tex|ltx)$/i.test(file);
  const prose = tex ? maskLatex(source) : source;
  const issues = await harper.call({ text: prose, oxford: OXFORD.has(oxford) ? oxford : 'avoid', markdown: /\.(md|markdown)$/i.test(file) });
  const ignored = new Set(ignoredRules);
  return issues
    .filter((issue) => !ignored.has(issue.rule))
    .filter((issue) => ALWAYS.has(issue.rule) || style || !STYLE_KINDS.has(issue.kind))
    // Harper sometimes reacts to the blanks left where markup was
    .filter((issue) => issue.to === issue.from || prose.slice(issue.from, issue.to).trim())
    .map((issue) => ({ ...issue, fixable: source.slice(issue.from, issue.to) === prose.slice(issue.from, issue.to) }));
}

// ─── rules the user turned off for a project (.spectrum/grammar.json) ───

const settingsFile = async (projectId) => path.join(await getProjectRoot(projectId), APP_DIR, 'grammar.json');

export async function readIgnoredRules(projectId) {
  try {
    const rules = JSON.parse(await fs.readFile(await settingsFile(projectId), 'utf8')).ignoredRules;
    return Array.isArray(rules) ? rules.filter((r) => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export async function changeIgnoredRule(projectId, rule, remove = false) {
  const rules = new Set(await readIgnoredRules(projectId));
  if (remove) rules.delete(rule);
  else rules.add(String(rule).slice(0, 200));
  const file = await settingsFile(projectId);
  await writeFileAtomic(file, `${JSON.stringify({ ignoredRules: [...rules].sort() }, null, 2)}\n`);
  return [...rules].sort();
}
