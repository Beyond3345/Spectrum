// The shipped template manifest, and seeding it into an install that already has templates. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

test('every shipped template has APA 7 references and a usable bibliography resource', async () => {
  for (const template of shipped.templates) {
    // the Typst and Markdown starters carry their own bibliography, checked below
    if (!/\.tex$/i.test(template.mainFile)) continue;
    const dir = path.join(shippedDir, template.id);
    const main = await fs.readFile(path.join(dir, template.mainFile), 'utf8');
    let source = main;
    for (const style of ['acl', 'cvpr']) if (main.includes(`{${style}}`)) source += await fs.readFile(path.join(dir, `${style}.sty`), 'utf8');
    source = source.replace(/(^|[^\\])%.*$/gm, '$1');
    const options = source.match(/\\(?:usepackage|RequirePackage)\[([^\]]+)\]\{biblatex\}/)?.[1];
    assert.ok(options?.includes('style=apa') && options.includes('backend=biber'), template.id);
    assert.doesNotMatch(source, /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{natbib\}/, template.id);
    const xurl = source.search(/\\(?:usepackage|RequirePackage)\{xurl\}/);
    assert.ok(xurl > source.indexOf('{biblatex}'), `${template.id}: xurl follows biblatex`);
    const bib = main.match(/\\addbibresource\{([^}]+)\}/)?.[1];
    assert.ok(bib && existsSync(path.join(dir, bib)), `${template.id}: bibliography exists`);
    assert.match(main, /\\printbibliography/, template.id);
    if (source.includes('australian')) assert.match(source, /\\DeclareLanguageMapping\{australian\}\{british-apa\}/, template.id);
  }
  const simple = await fs.readFile(path.join(shippedDir, 'simple-document', 'main.tex'), 'utf8');
  assert.match(simple, /\\documentclass\[11pt,a4paper\]\{article\}/);
  assert.match(simple, /margin=25mm/);
  assert.doesNotMatch(simple, /\\onehalfspacing/);
});

for (const style of ['apa', 'plainnat', 'plainurl', 'plain']) test(`${style} bibliography wraps long URLs and preserves their link targets`, { timeout: 120_000 }, async (t) => {
  const processor = style === 'apa' ? 'biber' : 'bibtex';
  for (const cmd of ['pdflatex', processor]) {
    if (spawnSync(cmd, ['--version'], { windowsHide: true }).status !== 0) return t.skip(`needs ${cmd}`);
  }
  const dir = await fs.mkdtemp(path.join(tmp, `url-${style}-`));
  let preamble = (await fs.readFile(path.join(shippedDir, 'simple-document/main.tex'), 'utf8')).split('\\begin{document}')[0];
  preamble = preamble.replace('margin=25mm', 'textwidth=85mm,marginparwidth=0pt');
  if (style !== 'apa') preamble = preamble.replace(/\\usepackage\[[^\]]+\]\{biblatex\}/, '\\usepackage[numbers]{natbib}').replace('\\addbibresource{references.bib}', '').replace('\\DeclareLanguageMapping{australian}{british-apa}', '');
  const bibliography = style === 'apa' ? '\\printbibliography' : `\\bibliographystyle{${style}}\n\\bibliography{references}`;
  await fs.writeFile(path.join(dir, 'main.tex'), `${preamble}\n\\begin{document}\n\\nocite{*}\n${bibliography}\n\\end{document}\n`);
  const urls = [
    'https://www.anthropic.com/news/anthropic-education-report-how-university-students-use-claude',
    'https://www.businessinsider.com/what-are-loops-ai-engineering-tips-2026-6',
    `https://example.com/${'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(4)}`
  ];
  const { toBibtex } = await import('../src/services/referenceService.js');
  await fs.writeFile(path.join(dir, 'references.bib'), urls.map((URL, i) => toBibtex({ type: 'webpage', title: 'URL wrapping', author: [{ literal: 'Example' }], issued: { 'date-parts': [[2026]] }, URL }, `URL${i}`, style === 'plain')).join('\n\n'));
  for (const [cmd, args] of [
    ['pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'main.tex']],
    [processor, ['main']],
    ['pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'main.tex']],
    ['pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'main.tex']]
  ]) {
    const result = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    assert.equal(result.status, 0, result.error?.message || `${result.stdout}\n${result.stderr}`);
  }
  const log = await fs.readFile(path.join(dir, 'main.log'), 'utf8');
  assert.doesNotMatch(log, /Overfull \\hbox|undefined citations|australian-apa\.lbx|Ignoring mapping/i);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await fs.readFile(path.join(dir, 'main.pdf'))) });
  const document = await task.promise;
  try {
    const links = [];
    let text = '';
    for (let page = 1; page <= document.numPages; page++) {
      const pdfPage = await document.getPage(page);
      links.push(...await pdfPage.getAnnotations());
      text += (await pdfPage.getTextContent()).items.map((item) => item.str || '').join('');
    }
    for (const url of urls) {
      assert.ok(links.filter((link) => (link.unsafeUrl || link.url) === url).length > 1, `${url}: clickable URL spans multiple lines`);
      assert.equal(text.replace(/\s/g, '').split(url).length - 1, 1, `${url}: URL printed once`);
    }
  } finally {
    await task.destroy();
  }
});

const readDiagrams = async (id) => {
  const dir = path.join(shippedDir, id, 'diagrams');
  if (!existsSync(dir)) return [];
  return Promise.all((await fs.readdir(dir)).map((f) => fs.readFile(path.join(dir, f), 'utf8')));
};

test('the Typst and Markdown starters are self-contained', async () => {
  const typst = shipped.templates.filter((t) => t.mainFile === 'main.typ').map((t) => t.id);
  assert.deepEqual(typst, ['typst-document', 'typst-report', 'typst-maths-notes', 'typst-electronics-notes', 'typst-coding-report', 'typst-letter', 'typst-cv']);
  for (const id of typst) {
    const main = await fs.readFile(path.join(shippedDir, id, 'main.typ'), 'utf8');
    assert.match(main, /#set page\(paper: "a4"/, `${id}: A4`);
    assert.match(main, /#set text\(size: 1[01]pt, lang: "en", region: "AU"\)/, `${id}: Australian English`);
    assert.match(main, /^#set document\(/m, `${id}: PDF title and author`);
    // drawings in diagrams/ are plain Typst too, so every template compiles offline
    for (const file of [main, ...await readDiagrams(id)]) assert.doesNotMatch(file, /@preview|^\s*#import/m, `${id}: no packages`);
    // letters and CVs cite nothing; everything else ends with the APA bibliography from refs.bib
    if (!['typst-letter', 'typst-cv'].includes(id)) {
      assert.match(main, /#bibliography\("refs.bib", style: "apa"\)\n$/, `${id}: bibliography`);
      assert.ok(existsSync(path.join(shippedDir, id, 'refs.bib')), `${id}/refs.bib`);
    }
  }
  const markdown = await fs.readFile(path.join(shippedDir, 'markdown-article', 'main.md'), 'utf8');
  assert.match(markdown, /^---\ntitle: /);
  assert.match(markdown, /bibliography: refs\.bib/);
  assert.match(markdown, /\[@Knuth1984\]/);
  assert.ok(existsSync(path.join(shippedDir, 'markdown-article', 'figures', 'example.png')));
  assert.ok(existsSync(path.join(shippedDir, 'markdown-article', 'refs.bib')));
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
  // and a shipped template the user edited
  const letter = { ...shipped.templates.find((t) => t.id === 'letter'), edited: true };
  await fs.mkdir(path.join(userDir, 'letter'));
  await fs.writeFile(path.join(userDir, 'letter', 'main.tex'), 'my letter');
  await fs.writeFile(path.join(userDir, 'manifest.json'), JSON.stringify({
    templates: [{ ...acl, featured: true, descriptionEn: 'old' }, mine, myCv, letter],
    categories: [{ id: 'all', label: 'All' }, { id: 'academic', label: 'Academic' }, { id: 'resume', label: 'Resume' }]
  }));

  await seedTemplates();
  const manifest = await readManifest();
  assert.deepEqual(manifest.categories, shipped.categories);
  const { shippedHash, ...aclNow } = manifest.templates.find((t) => t.id === 'acl');
  assert.deepEqual(aclNow, acl);
  assert.match(shippedHash, /^[0-9a-f]{40}$/);
  // the app's newer files reach a shipped template the user never edited, not one they did
  assert.equal(await fs.readFile(path.join(userDir, 'acl', 'main.tex'), 'utf8'), await fs.readFile(path.join(shippedDir, 'acl', 'main.tex'), 'utf8'));
  assert.deepEqual(manifest.templates.find((t) => t.id === 'letter'), letter);
  assert.equal(await fs.readFile(path.join(userDir, 'letter', 'main.tex'), 'utf8'), 'my letter');
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

test('an unreadable template list is left alone, so edited and own templates aren’t lost', async () => {
  await fs.writeFile(path.join(userDir, 'manifest.json'), '﻿{ "templates": [ broken');
  await fs.writeFile(path.join(userDir, 'letter', 'main.tex'), 'my letter, still');
  await seedTemplates();
  assert.equal(await fs.readFile(path.join(userDir, 'manifest.json'), 'utf8'), '﻿{ "templates": [ broken');
  assert.equal(await fs.readFile(path.join(userDir, 'letter', 'main.tex'), 'utf8'), 'my letter, still');
});
