// The tidy benchmark's test set (fixtures/tidy-bench): every case has its region, each region is the converter's
// own output for its source document, between the markers the converter wrote, and the set covers each kind in both directions with every difficulty.
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
