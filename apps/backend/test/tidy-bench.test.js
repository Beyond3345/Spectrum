// The tidy benchmark's test set (fixtures/tidy-bench): every case has its region, each region is the converter's
// own output for its source document, between the markers the converter wrote, with no word of the source lost, and the set covers each kind in
// both directions with every difficulty.
// Rebuild regions.json after changing a case or the converter: SPECTRUM_PANDOC=<pandoc> node scripts/tidy-bench-regions.mjs
// Then scripts/tidy-bench.mjs end to end against a fake OpenAI-compatible server on this computer. Throwaway folders only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { builtInTypst } from '../src/services/engineService.js';
import { regionAt } from '../src/services/convertTidy.js';

const bench = path.join(import.meta.dirname, 'fixtures', 'tidy-bench');
const cases = JSON.parse(readFileSync(path.join(bench, 'cases.json'), 'utf8'));
const regions = JSON.parse(readFileSync(path.join(bench, 'regions.json'), 'utf8'));

test('regions.json matches cases.json and the source documents', () => {
  assert.deepEqual(regions.map((r) => r.id), cases.map((c) => c.id), 'rebuild regions.json');
  for (const [i, r] of regions.entries()) {
    const c = cases[i];
    assert.deepEqual([r.kind, r.direction, r.difficulty, r.good], [c.kind, c.direction, c.difficulty, c.good], r.id);
    const source = readFileSync(path.join(bench, 'cases', r.id + (r.direction === 'latex-to-typst' ? '.tex' : '.typ')), 'utf8');
    assert.ok(r.original.trim() && source.includes(r.original), r.id + ': the original is the source document’s region');
    assert.equal(regionAt(r.document, r.region)?.text, r.converted, r.id + ': the converted region is the one the converter marked');
    assert.ok(r.good.trim(), r.id + ': a note of what a good answer looks like');
    assert.ok(!r.notes.some((n) => /lacks (?:a word|words)/.test(n)), r.id + ': the converter keeps every word, so a model never has to put one back');
  }
});

test('the set covers each kind in both directions, at each difficulty', () => {
  assert.ok(regions.length >= 50);
  const kinds = ['titlepage', 'cv-header', 'unknown-environment', 'unknown-command', 'table-layout'];
  for (const direction of ['latex-to-typst', 'typst-to-latex']) for (const kind of kinds) assert.ok(regions.some((r) => r.kind === kind && r.direction === direction), kind + ', ' + direction);
  for (const difficulty of ['easy', 'typical', 'hard', 'skip']) assert.ok(regions.filter((r) => r.difficulty === difficulty).length >= 5, difficulty);
});

test('the runner sends each region through Spectrum’s checks and reports what the model did', { skip: !builtInTypst() && 'needs the built-in Typst' }, async () => {
  const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-tidy-bench-test-')));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  // busy once, then every answer the converted text itself, which passes every check
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      if (seen.length === 1) {
        res.writeHead(429, { 'Content-Type': 'application/json' }).end('{"error":{"message":"slow down"}}');
        return;
      }
      const user = seen.at(-1).body.messages[1].content;
      const id = /^Region (r\d+),/m.exec(user)[1];
      const converted = /the only text you may change:\n([\s\S]*?)\n\nAnswer with exactly one block:/.exec(user)[1];
      const content = '<<<REPLACE ' + id + '\n' + converted + '\n>>>';
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());
  const models = path.join(tmp, 'models.json');
  writeFileSync(models, JSON.stringify([{ name: 'Fake', provider: 'openai-compatible', model: 'fake-1', baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1', apiKeyEnv: 'FAKE_TIDY_KEY', price: { input: 1, output: 2 } }]));
  const out = path.join(tmp, 'out');
  const script = path.join(import.meta.dirname, '..', '..', '..', 'scripts', 'tidy-bench.mjs');
  await promisify(execFile)(process.execPath, [script, '--models', models, '--regions', 'l2t-unknown-environment-1,l2t-table-layout-1', '--out', out], { env: { ...process.env, FAKE_TIDY_KEY: 'test-key' }, timeout: 120_000 });

  const results = JSON.parse(readFileSync(path.join(out, 'results.json'), 'utf8'));
  assert.equal(results.models[0].apiKey, undefined, 'the key stays out of the results');
  assert.deepEqual(results.models[0].regions.map((r) => [r.id, r.result, r.answers]), [['l2t-unknown-environment-1', 'first', 1], ['l2t-table-layout-1', 'first', 1]]);
  const { summary } = results.models[0];
  assert.deepEqual([summary.first, summary.withinThree, summary.tokensIn, summary.tokensOut, summary.estimatedTokens], [2, 2, 200, 40, false]);
  assert.equal(seen.length, 3, 'the 429 was tried again');
  assert.ok(seen.every((s) => s.auth === 'Bearer test-key' && s.body.model === 'fake-1' && s.body.temperature === 0));
  assert.match(seen[1].body.messages[0].content, /^## Checklist before you answer/);
  assert.match(readFileSync(path.join(out, 'report.md'), 'utf8'), /\| Fake \| 2 \| 2 \(100%\) \| 2 \(100%\) \|.*\| \$0\.0003 \|/);
  assert.match(readFileSync(path.join(out, 'review.html'), 'utf8'), /l2t-table-layout-1/);
});

test('--recheck puts a run’s saved answers through the current checks, and a change to a skip region is never right', { skip: !builtInTypst() && 'needs the built-in Typst' }, async () => {
  const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-tidy-bench-recheck-')));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  const result = (id, answer, extra = {}) => {
    const r = regions.find((x) => x.id === id);
    const lastAnswer = '<<<REPLACE ' + r.region + '\n' + answer + '\n>>>';
    return { id, kind: r.kind, direction: r.direction, difficulty: r.difficulty, result: 'first', answers: 1, faults: [], tokensIn: 10, tokensOut: 5, estimatedTokens: false, ms: 1000, accepted: answer, lastAnswer, error: null, ...extra };
  };
  const saved = {
    date: '2026-10-30T00:00:00.000Z',
    regions: 3,
    filter: null,
    dry: false,
    models: [{ name: 'Old', model: 'old-1', endpoint: 'http://127.0.0.1:9/v1', summary: { regions: 3, first: 3, withinThree: 3, skipped: 0, skippedRightly: 0, failed: 0, errors: 0, faults: {}, tokensIn: 30, tokensOut: 15, estimatedTokens: false, secondsPerRegion: 1 }, regions: [
      // still right; the whole sentence highlighted on a skip region; a skip region left as it was but for its TODO line
      result('l2t-unknown-environment-1', '#block(inset: 0.6em, stroke: 0.5pt + luma(180))[\nRinse each probe in clean water before you move to the next site.\n]'),
      result('l2t-unknown-command-4', '#highlight(fill: yellow)[Check the drain valve before each run, and close it again afterwards.]'),
      result('l2t-unknown-environment-7', '+ Dig a hole 60 centimetres deep.\n+ Push the probe into the side wall.\n+ Backfill in the order the soil came out.')
    ] }]
  };
  const file = path.join(tmp, 'results.json');
  writeFileSync(file, JSON.stringify(saved));
  const out = path.join(tmp, 'out');
  const script = path.join(import.meta.dirname, '..', '..', '..', 'scripts', 'tidy-bench.mjs');
  await promisify(execFile)(process.execPath, [script, '--recheck', file, '--out', out], { timeout: 120_000 });

  const now = JSON.parse(readFileSync(path.join(out, 'results.json'), 'utf8')).models[0];
  assert.deepEqual(now.regions.map((r) => [r.id, r.result, r.faults]), [['l2t-unknown-environment-1', 'first', []], ['l2t-unknown-command-4', 'failed', ['formatting']], ['l2t-unknown-environment-7', 'first', []]]);
  assert.deepEqual([now.summary.first, now.summary.withinThree, now.summary.changedSkip, now.summary.failed], [1, 1, 1, 1]);
  const report = readFileSync(path.join(out, 'report.md'), 'utf8');
  assert.match(report, /\| Old \| as run, old scoring \| 3 \| 3 \(100%\) \| 3 \(100%\) \| 0 \(0 right\) \| 0 \| 0 \| 0 \|/);
  assert.match(report, /\| Old \| as run, scored now \| 3 \| 1 \(33%\) \| 1 \(33%\) \| 0 \(0 right\) \| 2 \| 0 \| 0 \|/);
  assert.match(report, /\| Old \| re-checked \| 3 \| 1 \(33%\) \| 1 \(33%\) \| 0 \(0 right\) \| 1 \| 1 \| 0 \|/);
  assert.match(report, /- Old, l2t-unknown-command-4 \(skip\): first → failed\. The formatting changed/);
  assert.match(report, /\| Kind \| Direction \| Regions \| Right first \| Right within three \| Skipped \(right\) \| Changed a skip region \|/);
});
