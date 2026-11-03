// Typst Universe templates: which licences count as MIT-compatible, and the newest version of each template that the
// project's Typst can compile. Run: node --test apps/backend/test/universe.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-universe-')));
process.env.SPECTRUM_DATA_DIR = path.join(tmp, 'data');
const { mitCompatible, universeTemplates } = await import('../src/services/universeService.js');

test('permissive licences pass, copyleft and unknown ones are flagged', () => {
  for (const ok of ['MIT', 'MIT-0', 'MIT AND MIT-0', 'Apache-2.0', 'MIT OR Apache-2.0', 'MIT OR LPPL-1.3c', 'BSD-3-Clause AND 0BSD', 'Unlicense']) assert.ok(mitCompatible(ok), ok);
  for (const no of ['GPL-3.0-only', 'GPL-3.0-only AND MIT-0', 'AGPL-3.0-or-later', 'MPL-2.0', 'CC-BY-SA-4.0', 'MIT AND MIT-0 AND LPPL-1.3c', '', undefined]) assert.ok(!mitCompatible(no), String(no));
});

test('each template once, at its newest version the Typst can compile; libraries left out', () => {
  const template = { path: 'template', entrypoint: 'main.typ' };
  const index = [
    { name: 'paper', version: '0.9.0', compiler: '0.12.0', license: 'MIT', template },
    { name: 'paper', version: '0.10.0', compiler: '0.13.0', license: 'MIT', template },
    { name: 'paper', version: '0.11.0', compiler: '0.16.0', license: 'MIT', template },
    { name: 'notes', version: '1.0.0', license: 'GPL-3.0-only', authors: ['Ann <https://example.org>'], template },
    { name: 'cetz', version: '0.4.0', license: 'LGPL-3.0' },
    { name: '../evil', version: '1.0.0', template }
  ];
  const list = universeTemplates(index, '0.15.1');
  assert.deepEqual(list.map((t) => `${t.name} ${t.version}`), ['notes 1.0.0', 'paper 0.10.0']);
  assert.equal(list[0].mitCompatible, false);
  assert.deepEqual(list[0].authors, ['Ann']);
  assert.equal(list[1].entrypoint, 'main.typ');
  assert.equal(universeTemplates(index, '0.16.0').find((t) => t.name === 'paper').version, '0.11.0');
});
