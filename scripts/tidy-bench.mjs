#!/usr/bin/env node
// Measures how well AI models do the converter's optional tidying (docs/featureResearch/LATEX_TYPST_CONVERSION.md
// section 9) on the test set in apps/backend/test/fixtures/tidy-bench:
//   node scripts/tidy-bench.mjs --models <file.json> [--regions <filter>] [--out <dir>] [--concurrency <n>] [--timeout <seconds>] [--dry-run]
//   node scripts/tidy-bench.mjs --recheck <results.json> [--out <dir>]
// Each region goes to each model as Spectrum's own tidying sends it (convertTidy.js: the skill's checklist and rule
// card, the user message, up to three answers), and each answer meets the same checks, the compile in a scratch copy
// of the converted document included. Keys come only from the environment variables the models file names; --dry-run
// sends nothing anywhere and answers from a script instead; --recheck sends nothing either, and puts the answers saved in
// an earlier run's results.json through the current checks. Writes results.json, report.md and review.html.
import { cpSync, mkdtempSync, promises as fs, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bench = path.join(repo, 'apps', 'backend', 'test', 'fixtures', 'tidy-bench');
const USAGE = 'Usage: node scripts/tidy-bench.mjs --models <file.json> [--regions <filter>] [--out <dir>] [--concurrency <n>] [--timeout <seconds>] [--dry-run]\n       node scripts/tidy-bench.mjs --recheck <results.json> [--out <dir>]';

const { values: opts } = parseArgs({
  options: { models: { type: 'string' }, regions: { type: 'string' }, out: { type: 'string' }, concurrency: { type: 'string', default: '1' }, timeout: { type: 'string', default: '120' }, recheck: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, help: { type: 'boolean', default: false } }
});
const timeoutMs = Math.max(10, Number(opts.timeout) || 120) * 1000;
if (opts.help || (!opts.models && !opts['dry-run'] && !opts.recheck)) {
  console.log(USAGE + '\nSee apps/backend/test/fixtures/tidy-bench/README.md.');
  process.exit(opts.help ? 0 : 1);
}

// Spectrum's services run against a throwaway data folder (the skill comes from the repo's skills/), and never with
// the key or model of a .env, so a key reaches a model only through the models file
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-tidy-bench-')));
for (const name of ['SPECTRUM_LLM_ENDPOINT', 'SPECTRUM_LLM_API_KEY', 'SPECTRUM_LLM_MODEL']) delete process.env[name];
Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(tmp, 'data'), SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'), SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'), SPECTRUM_TEMPLATE_SEED_DIR: '' });
const { MAX_ANSWERS, checkReplacement, compileErrors, readAnswer, regionAt, replaceRegion, skillParts, systemMessage, userMessage } = await import('../apps/backend/src/services/convertTidy.js');
const { chatCompletion } = await import('../apps/backend/src/services/llmService.js');
const { PROVIDERS } = await import('../apps/backend/src/services/providers.js');

// ─── Models ───

// besides Spectrum's presets: any OpenAI-compatible server, and LM Studio's own address
const OTHER = { 'openai-compatible': null, lmstudio: 'http://localhost:1234/v1' };

/** A models file entry checked and resolved: { name, model, endpoint, provider, apiKey, temperature, effort, price }. */
function resolveModel(entry, dry) {
  const where = 'Model ' + JSON.stringify(entry.name ?? entry.model);
  if (!entry.name || !entry.model || !entry.provider) throw new Error(where + ' needs a name, a provider and a model.');
  const preset = PROVIDERS.find((p) => p.id === entry.provider);
  if (!preset && !(entry.provider in OTHER)) throw new Error(where + ': unknown provider ' + entry.provider + '. Use one of ' + [...PROVIDERS.map((p) => p.id), ...Object.keys(OTHER)].join(', ') + '.');
  const endpoint = entry.baseUrl ?? preset?.endpoint ?? OTHER[entry.provider];
  if (!endpoint) throw new Error(where + ' needs a baseUrl.');
  const apiKey = !dry && entry.apiKeyEnv ? (process.env[entry.apiKeyEnv] ?? '') : '';
  if (!dry && !apiKey && !/^http:\/\//i.test(endpoint) && !preset?.local) throw new Error(where + ' needs its key in the environment variable ' + (entry.apiKeyEnv ?? '(apiKeyEnv is not set)') + '.');
  return { name: entry.name, model: entry.model, endpoint, provider: preset?.id, apiKey, temperature: entry.temperature ?? 0, effort: entry.effort ?? 'fast', price: entry.price ?? null };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request, again after a pause when the provider is busy (429), failing (5xx) or silent for --timeout seconds
 * (a request can otherwise hang for the app's 10 minutes): { ok, content, usage, error }.
 */
async function ask(m, messages) {
  for (let attempt = 0; ; attempt += 1) {
    const reply = await chatCompletion({ endpoint: m.endpoint, apiKey: m.apiKey, model: m.model, provider: m.provider, messages, temperature: m.temperature, reasoningEffort: m.effort, signal: AbortSignal.timeout(timeoutMs) });
    if (reply.ok) return { ok: true, content: reply.message.content, usage: reply.usage ?? null };
    if (reply.stopped) reply.error = `No answer within ${timeoutMs / 1000} s.`;
    if (!(reply.stopped || reply.status === 429 || reply.status >= 500) || attempt >= 5) return reply;
    await sleep(1000 * 2 ** attempt);
  }
}

/**
 * The scripted answers of --dry-run, by the region's place in the set: right first time, right after an answer in
 * chat and a fence, SKIP, or a word added every time.
 */
function scripted(region, index, n, converted) {
  const block = (text) => '<<<REPLACE ' + region.region + '\n' + text + '\n>>>';
  switch (index % 4) {
    case 0:
      return block(converted);
    case 1:
      return n === 1 ? 'Sure, here is the tidied region:\n```\n' + converted + '\n```' : block(converted);
    case 2:
      return 'SKIP ' + region.region;
    default:
      return block(converted + '\nZebra');
  }
}

// ─── One region ───

const KINDS_OF_FAULT = [[/^(?:Answer with|The answer must be|The block must be|Leave out)/, 'form'], [/^The words/, 'words'], [/^The formatting/, 'formatting'], [/^The labels/, 'labels'], [/^A reference or citation/, 'references'], [/^The maths/, 'maths'], [/^Do not add/, 'settings'], [/^The answer is too long/, 'length'], [/^It does not compile/, 'compile']];
const faultKind = (fault) => KINDS_OF_FAULT.find(([re]) => re.test(fault))?.[1] ?? 'other';

const baselines = new Map();

/** A copy of the region's converted document to compile in, and its errors as converted (worked out once). */
async function scratchFor(region) {
  const mainFile = region.direction === 'latex-to-typst' ? 'main.typ' : 'main.tex';
  const dir = mkdtempSync(path.join(tmp, region.id + '-'));
  cpSync(path.join(bench, 'refs.bib'), path.join(dir, 'refs.bib'));
  await fs.writeFile(path.join(dir, mainFile), region.document);
  if (!baselines.has(region.id)) baselines.set(region.id, compileErrors(dir, mainFile, 'auto'));
  return { dir, mainFile, errors: await baselines.get(region.id) };
}

/** An answer for a region through Spectrum's checks, the compile included: { skip }, { text } or { fault }. */
async function checkAnswer(region, at, to, content) {
  const answer = readAnswer(content, region.region);
  if (answer.skip) return { skip: true };
  let fault = answer.fault ?? checkReplacement(at.text, answer.text, to, region.original, region.kind);
  if (!fault) {
    // check 6: no compile error that the converted document did not have
    const scratch = await scratchFor(region);
    await fs.writeFile(path.join(scratch.dir, scratch.mainFile), replaceRegion(region.document, at, answer.text));
    const left = [...scratch.errors];
    const added = (await compileErrors(scratch.dir, scratch.mainFile, 'auto')).filter((e) => (left.includes(e) ? !left.splice(left.indexOf(e), 1) : true));
    rmSync(scratch.dir, { recursive: true, force: true });
    if (added.length) fault = 'It does not compile: ' + added[0];
  }
  return fault ? { fault } : { text: answer.text };
}

/** Spectrum's tidying loop for one region and model, as tidyRegions runs it, with what it cost. */
async function runRegion(m, region, index, skill, dry) {
  const to = region.direction === 'latex-to-typst' ? 'typst' : 'latex';
  const started = Date.now();
  const out = { id: region.id, kind: region.kind, direction: region.direction, difficulty: region.difficulty, result: 'failed', answers: 0, faults: [], tokensIn: 0, tokensOut: 0, estimatedTokens: false, ms: 0, accepted: null, lastAnswer: null, error: null };
  const at = regionAt(region.document, region.region);
  const system = systemMessage(skill, region.kind, to);
  let fault = null;
  while (out.answers < MAX_ANSWERS) {
    const messages = [{ role: 'system', content: system }, { role: 'user', content: userMessage({ id: region.region, kind: region.kind, original: region.original }, at.text, to, fault) }];
    const reply = dry ? { ok: true, content: scripted(region, index, out.answers + 1, at.text), usage: null } : await ask(m, messages);
    if (!reply.ok) {
      Object.assign(out, { result: 'error', error: reply.error });
      break;
    }
    out.answers += 1;
    out.lastAnswer = reply.content;
    // tokens as the provider counted them, or as convertTidy.js estimates them (characters / 4)
    if (reply.usage) {
      out.tokensIn += reply.usage.input;
      out.tokensOut += reply.usage.output;
    } else {
      out.estimatedTokens = true;
      out.tokensIn += Math.ceil((system.length + messages[1].content.length) / 4);
      out.tokensOut += Math.ceil(reply.content.length / 4);
    }
    const answer = await checkAnswer(region, at, to, reply.content);
    if (answer.skip) {
      out.result = 'skipped';
      break;
    }
    fault = answer.fault;
    if (!fault) {
      Object.assign(out, { result: out.answers === 1 ? 'first' : 'later', accepted: answer.text });
      break;
    }
    out.faults.push(faultKind(fault));
  }
  out.ms = Date.now() - started;
  return out;
}

// ─── The report ───

const pct = (n, of) => (of ? Math.round((100 * n) / of) + '%' : '');
const money = (m, s) => (Number.isFinite(m.price?.input) && Number.isFinite(m.price?.output) ? '$' + ((s.tokensIn * m.price.input + s.tokensOut * m.price.output) / 1e6).toFixed(4) : '');

/**
 * Re-checks one saved region result: its last answer through the current checks, as no model is asked again. An answer
 * the checks now reject leaves the region failed; a failed one they now pass is accepted.
 */
async function recheckRegion(saved, region) {
  if (!region || !['first', 'later', 'failed'].includes(saved.result) || saved.lastAnswer == null) return { ...saved };
  const to = region.direction === 'latex-to-typst' ? 'typst' : 'latex';
  const answer = await checkAnswer(region, regionAt(region.document, region.region), to, saved.lastAnswer);
  const faults = saved.result === 'failed' ? saved.faults.slice(0, -1) : [...saved.faults];
  if (answer.skip) return { ...saved, result: 'skipped', accepted: null, faults };
  if (answer.text !== undefined) return { ...saved, result: saved.answers === 1 ? 'first' : 'later', accepted: answer.text, faults, fault: undefined };
  return { ...saved, result: 'failed', accepted: null, faults: [...faults, faultKind(answer.fault)], fault: answer.fault };
}

// an accepted change where SKIP was the right answer
const accepted = (r) => r.result === 'first' || r.result === 'later';
const changedSkip = (r) => accepted(r) && r.difficulty === 'skip';

/** The numbers for a list of region results; a change to a region that should have been skipped is never right. */
function summarise(results) {
  const n = (test) => results.filter(test).length;
  const faults = {};
  for (const r of results) for (const f of r.faults) faults[f] = (faults[f] ?? 0) + 1;
  return {
    regions: results.length,
    first: n((r) => r.result === 'first' && !changedSkip(r)),
    withinThree: n((r) => accepted(r) && !changedSkip(r)),
    changedSkip: n(changedSkip),
    skipped: n((r) => r.result === 'skipped'),
    skippedRightly: n((r) => r.result === 'skipped' && r.difficulty === 'skip'),
    failed: n((r) => r.result === 'failed'),
    errors: n((r) => r.result === 'error'),
    faults,
    tokensIn: results.reduce((t, r) => t + r.tokensIn, 0),
    tokensOut: results.reduce((t, r) => t + r.tokensOut, 0),
    estimatedTokens: results.some((r) => r.estimatedTokens),
    secondsPerRegion: results.length ? +(results.reduce((t, r) => t + r.ms, 0) / results.length / 1000).toFixed(1) : 0
  };
}

function reportMarkdown(runs, meta) {
  const row = (cells) => '| ' + cells.join(' | ') + ' |';
  const head = (cells) => [row(cells), row(cells.map(() => '---'))];
  const faults = (f) => Object.entries(f).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ') || 'none';
  const line = (s) => [s.regions, s.first + ' (' + pct(s.first, s.regions) + ')', s.withinThree + ' (' + pct(s.withinThree, s.regions) + ')', s.skipped + ' (' + s.skippedRightly + ' right)', s.changedSkip ?? 0, s.failed, s.errors];
  const columns = ['Right first', 'Right within three', 'Skipped (right)', 'Changed a skip region', 'Failed after three', 'API errors'];
  const out = [
    '# Tidy benchmark',
    '',
    meta.date + ', ' + meta.regions + ' regions' + (meta.filter ? ' matching “' + meta.filter + '”' : '') + (meta.dry ? ', dry run (scripted answers, no model)' : '') + '.',
    ...(meta.recheck ? ['Re-check of ' + meta.recheck.file + ' (run ' + meta.recheck.date + '): the answers it saved, through the current checks, with no model called. A saved answer the checks now reject counts as failed, as the model is not asked again; tokens and times are the run’s.'] : []),
    '“Right first” and “right within three” count answers Spectrum accepted: the checks of section 9.4 passed and the document still compiled. An accepted change to a region whose right answer is SKIP is not right: it counts under “changed a skip region”. “Skipped (right)” counts SKIP answers, and how many were on regions where SKIP is the right answer. Tokens marked * are estimated (characters / 4), as the provider did not report them.',
    ...(meta.recheck ? ['', '## Re-check', '', ...head(['Model', 'Scores', 'Regions', ...columns]), ...meta.recheck.rows.map((r) => row([r.model, r.label, ...line(r.summary)])), '', ...(meta.recheck.changes.length ? meta.recheck.changes.map((c) => '- ' + c) : ['No region’s result changed.'])] : []),
    '',
    '## Comparison',
    '',
    ...head(['Model', 'Regions', ...columns, 'Tokens in / out', 'Seconds per region', 'Cost']),
    ...runs.map(({ model: m, summary: s }) => row([m.name, ...line(s), s.tokensIn + ' / ' + s.tokensOut + (s.estimatedTokens ? '*' : ''), s.secondsPerRegion, money(m, s)]))
  ];
  for (const { model: m, summary: s, results } of runs) {
    out.push('', '## ' + m.name, '', m.model + ' at ' + m.endpoint + '. Failure reasons, one per rejected answer: ' + faults(s.faults) + '.', '');
    out.push(...head(['Kind', 'Direction', 'Regions', ...columns]));
    const groups = Map.groupBy(results, (r) => r.kind + '\n' + r.direction);
    for (const [key, list] of groups) out.push(row([...key.split('\n').map((k) => k.replace('latex-to-typst', 'LaTeX to Typst').replace('typst-to-latex', 'Typst to LaTeX')), ...line(summarise(list))]));
    out.push('', ...head(['Difficulty', 'Regions', ...columns]));
    for (const [difficulty, list] of Map.groupBy(results, (r) => r.difficulty)) out.push(row([difficulty, ...line(summarise(list))]));
    const errors = [...new Set(results.filter((r) => r.error).map((r) => r.error))];
    if (errors.length) out.push('', 'API errors: ' + errors.join(' '));
  }
  return out.join('\n') + '\n';
}

const escape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Each region with an accepted edit: the original, the converted text, each model's edit and the good-answer note. */
function reviewHtml(runs, regions) {
  const cards = regions.map((region) => {
    const edits = runs.map(({ model, results }) => ({ model, r: results.find((x) => x.id === region.id) })).filter(({ r }) => r?.accepted !== null && r?.accepted !== undefined);
    if (!edits.length) return '';
    const pane = (title, text) => '<div><h3>' + escape(title) + '</h3><pre>' + escape(text) + '</pre></div>';
    return '<section><h2>' + escape(region.id) + ' <small>' + escape(region.kind + ', ' + region.difficulty) + '</small></h2><p class="good">' + escape(region.good) + '</p><div class="panes">'
      + pane('Original', region.original) + pane('Converted', regionAt(region.document, region.region).text)
      + edits.map(({ model, r }) => pane(model.name + (r.result === 'first' ? '' : ' (answer ' + r.answers + ')'), r.accepted)).join('') + '</div></section>';
  }).join('\n');
  return '<!doctype html>\n<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tidy benchmark review</title><style>'
    + ':root{color-scheme:light dark;--bg:#fff;--fg:#1d1d1f;--pane:#f4f4f6;--muted:#6e6e73}@media (prefers-color-scheme:dark){:root{--bg:#1c1c1e;--fg:#f2f2f7;--pane:#2c2c2e;--muted:#a1a1a6}}'
    + 'body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1600px;padding:16px}small,.good{color:var(--muted)}'
    + '.panes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}pre{background:var(--pane);padding:10px;border-radius:6px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}h3{font-size:13px;margin:0 0 4px}section{margin-bottom:32px}'
    + '</style></head><body><h1>Tidy benchmark review</h1><p>Every edit Spectrum accepted, beside the original, the converted text and a note of what a good answer looks like.</p>\n'
    + (cards || '<p>No edit was accepted.</p>') + '\n</body></html>\n';
}

// ─── The run ───

const dry = opts['dry-run'];
let regions = JSON.parse(await fs.readFile(path.join(bench, 'regions.json'), 'utf8'));
if (opts.regions) {
  const parts = opts.regions.split(',').map((p) => p.trim()).filter(Boolean);
  regions = regions.filter((r) => parts.some((p) => r.id.includes(p) || r.kind === p || r.difficulty === p || r.direction === p));
}
const entries = opts.models ? JSON.parse(await fs.readFile(opts.models, 'utf8')) : [{ name: 'dry run', provider: 'openai-compatible', model: 'scripted', baseUrl: 'http://localhost' }];
const concurrency = Math.max(1, Number(opts.concurrency) || 1);
const outDir = path.resolve(opts.out ?? path.join('tidy-bench-results', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')));
try {
  if (!regions.length) throw new Error('No region matches “' + opts.regions + '”.');
  let runs;
  let meta;
  if (opts.recheck) {
    // the saved answers through the current checks, each model's scores before and after
    const saved = JSON.parse(await fs.readFile(opts.recheck, 'utf8'));
    const byId = new Map(regions.map((r) => [r.id, r]));
    const rows = [];
    const changes = [];
    runs = [];
    for (const { summary, regions: results, ...model } of saved.models ?? []) {
      const now = [];
      for (const r of results) {
        const x = await recheckRegion(r, byId.get(r.id));
        now.push(x);
        if (x.result !== r.result) changes.push(model.name + ', ' + r.id + ' (' + r.difficulty + '): ' + r.result + ' → ' + x.result + (x.fault ? '. ' + x.fault : '.'));
      }
      rows.push({ model: model.name, label: 'as run, old scoring', summary }, { model: model.name, label: 'as run, scored now', summary: summarise(results) }, { model: model.name, label: 're-checked', summary: summarise(now) });
      runs.push({ model, results: now, summary: summarise(now) });
    }
    if (!runs.length) throw new Error(opts.recheck + ' has no model’s results.');
    meta = { date: new Date().toISOString(), regions: saved.regions, filter: saved.filter ?? null, dry: saved.dry, recheck: { file: path.basename(opts.recheck), date: saved.date, rows, changes } };
  } else {
    const models = (Array.isArray(entries) ? entries : entries.models ?? []).map((e) => resolveModel(e, dry));
    if (!models.length) throw new Error('The models file lists no model.');
    const skill = await skillParts();
    runs = models.map((model) => ({ model, results: new Array(regions.length) }));
    const tasks = runs.flatMap((run) => regions.map((region, i) => ({ run, region, i })));
    let done = 0;
    const worker = async () => {
      for (let task = tasks.shift(); task; task = tasks.shift()) {
        const r = await runRegion(task.run.model, task.region, task.i, skill, dry);
        task.run.results[task.i] = r;
        done += 1;
        console.log('[' + done + '/' + runs.length * regions.length + '] ' + task.run.model.name + '  ' + r.id + '  ' + r.result + (r.answers ? ' (' + r.answers + ' answer' + (r.answers === 1 ? '' : 's') + ')' : '') + (r.error ? ': ' + r.error : ''));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    for (const run of runs) run.summary = summarise(run.results);
    meta = { date: new Date().toISOString(), regions: regions.length, filter: opts.regions ?? null, dry };
  }
  await fs.mkdir(outDir, { recursive: true });
  // the key never goes into the results
  const publicModel = ({ apiKey, ...m }) => m;
  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify({ ...meta, models: runs.map((r) => ({ ...publicModel(r.model), summary: r.summary, regions: r.results })) }, null, 2) + '\n');
  const report = reportMarkdown(runs, meta);
  await fs.writeFile(path.join(outDir, 'report.md'), report);
  await fs.writeFile(path.join(outDir, 'review.html'), reviewHtml(runs, regions));
  // the re-check and the comparison
  const sections = report.split('\n## ');
  console.log('\n' + sections.slice(1, sections.findIndex((t) => t.startsWith('Comparison')) + 1).map((t) => '## ' + t).join('\n'));
  console.log('Written to ' + outDir);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
