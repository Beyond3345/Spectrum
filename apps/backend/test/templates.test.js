// The shipped template manifest, and seeding it into an install that already has templates. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shippedDir = path.join(here, '..', '..', '..', 'templates');
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-templates-')));
const userDir = path.join(tmp, 'templates');
// the service reads these when it's first imported
process.env.SPECTRUM_TEMPLATE_DIR = userDir;
process.env.SPECTRUM_TEMPLATE_SEED_DIR = shippedDir;
const { seedTemplates, readTemplateManifest } = await import('../src/services/templateService.js');
const shipped = JSON.parse(await fs.readFile(path.join(shippedDir, 'manifest.json'), 'utf8'));
const readManifest = async () => JSON.parse(await fs.readFile(path.join(userDir, 'manifest.json'), 'utf8'));

after(() => rmSync(tmp, { recursive: true, force: true }));

test('the shipped manifest has a folder and a known category for every template', () => {
  assert.deepEqual(shipped.categories.map((c) => c.id), ['all', 'notes', 'reports', 'letters', 'slides', 'cv', 'academic']);
  const ids = new Set(shipped.categories.map((c) => c.id));
  for (const t of shipped.templates) {
    assert.ok(existsSync(path.join(shippedDir, t.id, t.mainFile)), `${t.id}/${t.mainFile}`);
    assert.ok(ids.has(t.category) && t.category !== 'all', `${t.id} is in ${t.category}`);
  }
  for (const id of ['acl', 'cvpr', 'neurips', 'icml', 'arxiv']) {
    const t = shipped.templates.find((x) => x.id === id);
    assert.equal(t.category, 'academic');
    assert.equal(t.featured, false);
  }
});

test('seeding an existing install adds new templates, refreshes shipped entries and keeps uploads', async () => {
  // an install from before the new templates: an old ACL entry, an upload, and an upload that took the "cv" id
  const acl = shipped.templates.find((t) => t.id === 'acl');
  await fs.mkdir(path.join(userDir, 'acl'), { recursive: true });
  await fs.writeFile(path.join(userDir, 'acl', 'main.tex'), 'old acl');
  await fs.mkdir(path.join(userDir, 'mine'));
  await fs.writeFile(path.join(userDir, 'mine', 'main.tex'), 'mine');
  await fs.mkdir(path.join(userDir, 'cv'));
  await fs.writeFile(path.join(userDir, 'cv', 'cv.tex'), 'my cv');
  const mine = { id: 'mine', label: 'Mine', mainFile: 'main.tex', category: 'academic', description: 'Mine', tags: [], author: 'User', featured: false };
  const myCv = { ...mine, id: 'cv', label: 'My CV', mainFile: 'cv.tex' };
  await fs.writeFile(path.join(userDir, 'manifest.json'), JSON.stringify({
    templates: [{ ...acl, featured: true, descriptionEn: 'old' }, mine, myCv],
    categories: [{ id: 'all', label: 'All' }, { id: 'academic', label: 'Academic' }, { id: 'resume', label: 'Resume' }]
  }));

  await seedTemplates();
  const manifest = await readManifest();
  assert.deepEqual(manifest.categories, shipped.categories);
  assert.deepEqual(manifest.templates.find((t) => t.id === 'acl'), acl);
  assert.deepEqual(manifest.templates.find((t) => t.id === 'mine'), mine);
  assert.deepEqual(manifest.templates.find((t) => t.id === 'cv'), myCv);
  assert.deepEqual(manifest.templates.map((t) => t.id).sort(), [...new Set([...shipped.templates.map((t) => t.id), 'mine'])].sort());
  assert.ok(existsSync(path.join(userDir, 'report-thesis', 'main.tex')));
  assert.deepEqual(await fs.readdir(path.join(userDir, 'cv')), ['cv.tex']);
  assert.equal(await fs.readFile(path.join(userDir, 'mine', 'main.tex'), 'utf8'), 'mine');

  // nothing left to change on the next start
  const before = await fs.readFile(path.join(userDir, 'manifest.json'), 'utf8');
  await seedTemplates();
  assert.equal(await fs.readFile(path.join(userDir, 'manifest.json'), 'utf8'), before);

  const { templates, categories } = await readTemplateManifest();
  const firstPlain = templates.findIndex((t) => !t.featured);
  assert.ok(firstPlain > 0 && templates.slice(firstPlain).every((t) => !t.featured), 'featured templates come first');
  assert.ok(categories.every((c) => c.id === 'all' || templates.some((t) => t.category === c.id)));
  assert.ok(categories.some((c) => c.id === 'reports'));
});
