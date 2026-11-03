// The tidy benchmark's test set (fixtures/tidy-bench): every case has its region, each region is the converter's
// own output for its source document, and the set covers each kind in both directions with every difficulty.
// Rebuild regions.json after changing a case or the converter: SPECTRUM_PANDOC=<pandoc> node scripts/tidy-bench-regions.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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
    assert.ok(r.converted.trim() && r.document.includes(r.converted), r.id + ': the converted region is in the converted document');
    assert.ok(r.good.trim(), r.id + ': a note of what a good answer looks like');
  }
});

test('the set covers each kind in both directions, at each difficulty', () => {
  assert.ok(regions.length >= 50);
  const kinds = ['titlepage', 'cv-header', 'unknown-environment', 'unknown-command', 'table-layout'];
  for (const direction of ['latex-to-typst', 'typst-to-latex']) for (const kind of kinds) assert.ok(regions.some((r) => r.kind === kind && r.direction === direction), kind + ', ' + direction);
  for (const difficulty of ['easy', 'typical', 'hard', 'skip']) assert.ok(regions.filter((r) => r.difficulty === difficulty).length >= 5, difficulty);
});
