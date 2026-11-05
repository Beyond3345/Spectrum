// The built-in Tectonic's background warm-up: when it runs (no TeX installation, online, not done for this Tectonic and
// these templates), what it compiles, its marker, and how it gives way to a compile of the user's. A Node script stands
// in for Tectonic, in throwaway data and template folders. Run: node --test apps/backend/test/tectonic-warmup.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const WINDOWS = process.platform === 'win32';
const skip = WINDOWS ? 'a script stands in for Tectonic' : false;
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-warm-up-test-')));
const templates = path.join(tmp, 'templates');
const bin = path.join(tmp, 'bin');
const runs = path.join(tmp, 'runs.log');
const realPath = process.env.PATH;
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'user-templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: templates,
  SPECTRUM_TECTONIC: path.join(tmp, 'tectonic'),
  // nothing is downloaded here
  SPECTRUM_ENGINE_DOWNLOAD_BASE: 'http://127.0.0.1:9',
  PATH: bin
});
const { warmUpTectonic, warmUpState, latexTemplates } = await import('../src/services/tectonicWarmUp.js');
const { createProject } = await import('../src/services/projectService.js');
const { runCompile } = await import('../src/services/compileService.js');
const marker = path.join(tmp, 'data', 'engines', 'tectonic-warm-up.json');

after(() => {
  process.env.PATH = realPath;
  rmSync(tmp, { recursive: true, force: true });
});

// Tectonic: its version, or a compile that notes where it ran ('start' and 'done'), takes SLOW_MS, and writes a PDF
// unless the document says NO PDF
await fs.writeFile(process.env.SPECTRUM_TECTONIC, [
  '#!' + process.execPath,
  "const fs = require('fs');",
  "const path = require('path');",
  'const args = process.argv.slice(2);',
  "if (args[0] === '--version') { console.log('Tectonic 0.17.0'); process.exit(0); }",
  "const out = args[args.indexOf('--outdir') + 1];",
  `const note = (what) => fs.appendFileSync(${JSON.stringify(runs)}, what + ' ' + path.basename(process.cwd()) + '\\n');`,
  "note('start');",
  'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.SLOW_MS || 0));',
  "fs.writeFileSync(path.join(out, 'main.log'), 'fake\\n');",
  "if (!fs.readFileSync('main.tex', 'utf8').includes('NO PDF')) fs.writeFileSync(path.join(out, 'main.pdf'), '%PDF-1.4\\n%%EOF\\n');",
  "note('done');",
  ''
].join('\n'), { mode: 0o755 });
// Spectrum's Biber is there already, so nothing is downloaded
await fs.mkdir(path.join(tmp, 'data', 'engines', 'biber'), { recursive: true });
await fs.writeFile(path.join(tmp, 'data', 'engines', 'biber', 'biber'), '#!/bin/sh\n', { mode: 0o755 });
await fs.mkdir(bin, { recursive: true });

const doc = '\\documentclass{article}\\usepackage{biblatex}\\begin{document}Hi\\end{document}\n';
const template = async (id, mainFile, text = doc) => {
  await fs.mkdir(path.join(templates, id), { recursive: true });
  await fs.writeFile(path.join(templates, id, mainFile), text);
  return { id, mainFile };
};
await fs.writeFile(path.join(templates, 'manifest.json'), JSON.stringify({
  templates: [await template('notes', 'main.tex'), await template('report', 'main.tex'), await template('typst-notes', 'main.typ', '= Hi\n'), await template('article', 'main.md', '# Hi\n')]
}));
const ran = async () => (await fs.readFile(runs, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean);
const online = async () => true;
const reset = async () => {
  await fs.rm(runs, { force: true });
  await fs.rm(marker, { force: true });
};

test('the templates it compiles are the built-in LaTeX ones, the repo’s every .tex template', async () => {
  assert.deepEqual((await latexTemplates()).map((t) => t.id), ['notes', 'report']);
  const repo = path.join(import.meta.dirname, '..', '..', '..', 'templates');
  const manifest = JSON.parse(await fs.readFile(path.join(repo, 'manifest.json'), 'utf8'));
  const latex = await latexTemplates(repo);
  assert.deepEqual(latex.map((t) => t.id), manifest.templates.filter((t) => t.mainFile.endsWith('.tex')).map((t) => t.id));
  assert.ok(latex.length >= 10 && latex.some((t) => t.id === 'electronics-notes'));
  for (const t of latex) assert.ok(existsSync(path.join(t.root, t.mainFile)), t.id);
});

test('with a TeX installation on the PATH, or offline, it does nothing', { skip }, async () => {
  await reset();
  await fs.writeFile(path.join(bin, 'pdflatex'), '#!/bin/sh\n', { mode: 0o755 });
  try {
    assert.equal(await warmUpTectonic({ online }), null);
  } finally {
    await fs.rm(path.join(bin, 'pdflatex'));
  }
  assert.equal(await warmUpTectonic({ online: async () => false }), null);
  assert.deepEqual(await ran(), []);
  assert.ok(!existsSync(marker));
});

test('it compiles each LaTeX template once, then its marker says it’s done for this Tectonic and these templates', { skip }, async () => {
  await reset();
  assert.equal(await warmUpTectonic({ online }), 'ready');
  assert.equal(warmUpState(), 'ready');
  assert.deepEqual(await ran(), ['start notes', 'done notes', 'start report', 'done report']);
  const done = JSON.parse(await fs.readFile(marker, 'utf8'));
  assert.equal(done.tectonic, '0.17.0');
  // done: not again, not even offline
  assert.equal(await warmUpTectonic({ online: async () => false }), 'ready');
  assert.equal((await ran()).length, 4);
  // a template that changed (an update of Spectrum's) is a new set, warmed up again
  await fs.appendFile(path.join(templates, 'report', 'main.tex'), '% changed\n');
  assert.equal(await warmUpTectonic({ online }), 'ready');
  assert.equal((await ran()).length, 8);
  // a Tectonic of another version too
  await fs.writeFile(marker, JSON.stringify({ ...done, tectonic: '0.16.0' }));
  await fs.appendFile(path.join(templates, 'report', 'main.tex'), '');
  await fs.rm(runs);
  await warmUpTectonic({ online });
  assert.equal((await ran()).length, 4);
});

test('a template that makes no PDF leaves no marker, so the next start tries again', { skip }, async () => {
  await reset();
  const before = await fs.readFile(path.join(templates, 'notes', 'main.tex'), 'utf8');
  await fs.writeFile(path.join(templates, 'notes', 'main.tex'), before + '% NO PDF\n');
  try {
    assert.equal(await warmUpTectonic({ online }), null);
    assert.equal(warmUpState(), null);
    assert.ok(!existsSync(marker));
    assert.equal((await ran()).length, 4, 'the other templates still compile');
  } finally {
    await fs.writeFile(path.join(templates, 'notes', 'main.tex'), before);
  }
});

test('a compile of the user’s with Tectonic stops the warm-up’s, which carries on once it has finished', { skip }, async () => {
  await reset();
  process.env.SLOW_MS = '1500';
  try {
    const warming = warmUpTectonic({ online });
    while (!(await ran()).includes('start notes')) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(warmUpState(), 'preparing');
    const project = await createProject({ name: 'Mine', populate: (root) => fs.writeFile(path.join(root, 'main.tex'), doc) });
    const mine = await runCompile({ projectId: project.id, mainFile: 'main.tex', engine: 'tectonic' });
    assert.equal(mine.ok, true, mine.log);
    assert.equal(await warming, 'ready');
    const order = await ran();
    const folder = path.basename(project.path);
    // the warm-up's first run was stopped as the user's started, and ran again after it
    assert.deepEqual(order.slice(0, 4), ['start notes', 'start ' + folder, 'done ' + folder, 'start notes'], order.join('\n'));
    assert.deepEqual(order.slice(4), ['done notes', 'start report', 'done report']);
  } finally {
    delete process.env.SLOW_MS;
  }
});
