// The skills the app ships (the repo's skills/ folder, from scripts/sync-skills.mjs plus Spectrum's own): each one
// readable as Spectrum reads it, listed with an allowed licence, and without the scripts that spend an OpenRouter key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFrontMatter, SKILL_ID } from '../src/services/skillService.js';

const pack = fileURLToPath(new URL('../../../skills/', import.meta.url));

test('every bundled skill is in the manifest with its licence and reads as an Agent Skills folder', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(pack, 'manifest.json'), 'utf8'));
  const folders = (await fs.readdir(pack, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.deepEqual(folders, Object.keys(manifest.skills).sort());
  assert.equal(folders.length, 18);
  assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  for (const id of folders) {
    assert.match(id, SKILL_ID);
    const { data, body } = readFrontMatter(await fs.readFile(path.join(pack, id, 'SKILL.md'), 'utf8'));
    assert.equal(data.name, id, `${id}'s SKILL.md names it`);
    assert.ok(data.description?.length > 20 && data.description.length <= 1024, `${id} has a description`);
    assert.ok(body.trim().length > 200, `${id} has instructions`);
    assert.ok(['MIT', 'Apache-2.0'].includes(manifest.skills[id].licence), `${id}: ${manifest.skills[id].licence}`);
    assert.ok(manifest.skills[id].author);
    const files = await fs.readdir(path.join(pack, id), { recursive: true });
    // readdir joins with path.sep, a backslash on Windows
    assert.deepEqual(files.filter((f) => /^generate_(?:schematic|slide_image).*\.py$/.test(path.basename(f))), [], `${id} leaves out the OpenRouter scripts`);
  }
  assert.ok((await fs.readFile(path.join(pack, 'K-Dense-LICENSE.md'), 'utf8')).includes('MIT'));
  if (Object.values(manifest.skills).some((s) => s.licence === 'Apache-2.0')) assert.match(await fs.readFile(path.join(pack, 'Apache-2.0.txt'), 'utf8'), /Apache License\s+Version 2\.0/);
  const notices = await fs.readFile(fileURLToPath(new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url)), 'utf8');
  for (const [id, skill] of Object.entries(manifest.skills)) if (skill.source !== 'spectrum') assert.ok(notices.includes(`| ${id} | ${skill.author} | ${skill.licence}`), `${id} is in the notices`);
});
