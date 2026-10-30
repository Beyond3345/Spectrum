// The built-in Tectonic in Auto's choices, the biblatex guard, Spectrum's Biber and Tectonic's download failure, with Node scripts
// standing in for the engines in a throwaway data folder. Run: node --test apps/backend/test/compile-engines.test.js
import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const WINDOWS = process.platform === 'win32';
const skip = WINDOWS ? 'scripts stand in for the engines' : false;
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-engines-')));
const realPath = process.env.PATH;
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject } = await import('../src/services/projectService.js');
const { runCompile, tectonicFontconfig, withBiber } = await import('../src/services/compileService.js');
const { tectonicBiber } = await import('../src/services/engineService.js');
const biberDir = path.join(tmp, 'data', 'engines', 'biber');

after(() => {
  process.env.PATH = realPath;
  delete process.env.SPECTRUM_TECTONIC;
  rmSync(tmp, { recursive: true, force: true });
});

// Each engine's script finds the output folder it was given, prints its marker, then writes the PDF and log the
// compile reads back
const ENGINE = (marker, code = 0) => [
  '#!' + process.execPath,
  "const fs = require('fs');",
  "const path = require('path');",
  'const args = process.argv.slice(2);',
  "let out = '';",
  'for (let i = 0; i < args.length; i += 1) {',
  "  if (args[i].startsWith('-output-directory=')) out = args[i].slice('-output-directory='.length);",
  "  else if (args[i].startsWith('-outdir=')) out = args[i].slice('-outdir='.length);",
  "  else if (args[i] === '--outdir') out = args[i + 1];",
  '}',
  'console.log(' + JSON.stringify(marker) + ');',
  'if (out) {',
  '  fs.mkdirSync(out, { recursive: true });',
  "  fs.writeFileSync(path.join(out, 'main.log'), 'This is fake TeX, Version 3.14\\nTranscript written on main.log.\\n');",
  "  fs.writeFileSync(path.join(out, 'main.pdf'), '%PDF-1.4\\n1 0 obj<</Type/Catalog>>endobj\\ntrailer<</Root 1 0 R>>\\n%%EOF\\n');",
  '}',
  'process.exit(' + code + ');',
  ''
].join('\n');

const binWith = async (name, ...engines) => {
  const bin = path.join(tmp, 'bin-' + name);
  await fs.mkdir(bin, { recursive: true });
  for (const engine of engines) await fs.writeFile(path.join(bin, engine.name), ENGINE(engine.marker, engine.code), { mode: 0o755 });
  process.env.PATH = bin;
  return bin;
};
const builtIn = async (name, marker, code = 0) => {
  const file = path.join(tmp, 'tectonic-' + name);
  await fs.writeFile(file, ENGINE(marker, code), { mode: 0o755 });
  process.env.SPECTRUM_TECTONIC = file;
  return file;
};
const projectWith = (source, name = 'Engines') => createProject({
  name,
  populate: async (root) => fs.writeFile(path.join(root, 'main.tex'), source)
});
const compile = (p) => runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'auto' });
const plain = '\\documentclass{article}\\begin{document}Hi\\end{document}\n';
const withBiblatex = (extra = '') => '\\documentclass{article}\\usepackage{biblatex}' + extra + '\\begin{document}Hi\\end{document}\n';

test('Auto picks the fake pdfLaTeX over the built-in Tectonic', { skip }, async () => {
  await binWith('pdflatex', { name: 'pdflatex', marker: 'PDFLATEX RAN' });
  await builtIn('pdf-first', 'TECTONIC RAN');
  const p = await projectWith(plain);
  const result = await compile(p);
  assert.equal(result.engine, 'pdflatex');
  assert.match(result.log, /PDFLATEX RAN/);
  assert.doesNotMatch(result.log, /TECTONIC RAN/);
});

test('with only the built-in Tectonic, Auto picks it', { skip }, async () => {
  await binWith('none');
  await builtIn('only', 'TECTONIC RAN');
  const p = await projectWith(plain);
  const result = await compile(p);
  assert.equal(result.engine, 'tectonic');
  assert.match(result.log, /TECTONIC RAN/);
  assert.equal(result.pdfPath, 'main.pdf');
});

test('a biblatex document skips Tectonic when another engine is installed', { skip }, async () => {
  await binWith('latexmk', { name: 'latexmk', marker: 'LATEXMK RAN' });
  await builtIn('skip', 'TECTONIC RAN');
  const p = await projectWith(withBiblatex());
  const result = await compile(p);
  assert.equal(result.engine, 'latexmk');
  assert.match(result.log, /LATEXMK RAN/);
  assert.doesNotMatch(result.log, /TECTONIC RAN/);
});

test('with only Tectonic and no Biber of Spectrum’s, a biblatex document compiles with the Biber note and its button', { skip }, async () => {
  await binWith('biblatex');
  await builtIn('biblatex', 'TECTONIC RAN');
  const p = await projectWith(withBiblatex());
  const result = await compile(p);
  assert.equal(result.engine, 'tectonic');
  assert.match(result.log, /\[spectrum\] biblatex with Biber needs the Biber that matches the built-in Tectonic\. Download Biber from Logs or Settings › Engines › LaTeX/);
  assert.equal(result.code, 'BIBER_MISSING');
  // backend=bibtex needs none
  const bibtex = await compile(await projectWith(withBiblatex().replace('{biblatex}', '[backend=bibtex]{biblatex}'), 'BibTeX'));
  assert.equal(bibtex.code, undefined);
});

test('with Spectrum’s Biber, Tectonic finds it before any other on the PATH and unpacks it into its cache', { skip }, async () => {
  const bin = await binWith('biber', { name: 'biber', marker: 'MISMATCHED BIBER' });
  await fs.mkdir(biberDir, { recursive: true });
  await fs.writeFile(path.join(biberDir, 'biber'), '#!/bin/sh\n', { mode: 0o755 });
  const file = path.join(tmp, 'tectonic-env');
  await fs.writeFile(file, ENGINE('TECTONIC RAN').replace("let out = '';", "console.log('PATH=' + process.env.PATH + ' CACHE=' + process.env.PAR_GLOBAL_TMPDIR); let out = '';"), { mode: 0o755 });
  process.env.SPECTRUM_TECTONIC = file;
  try {
    const result = await compile(await projectWith(withBiblatex(), 'Biber'));
    assert.equal(result.engine, 'tectonic');
    assert.ok(result.log.includes('PATH=' + [biberDir, bin].join(path.delimiter) + ' CACHE=' + path.join(biberDir, 'cache')), result.log);
    assert.doesNotMatch(result.log, /needs the Biber/);
    assert.equal(result.code, undefined);
  } finally {
    await fs.rm(biberDir, { recursive: true, force: true });
  }
});

test('on Windows, Spectrum’s biber.exe goes first on the Path Tectonic is given', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  await fs.mkdir(biberDir, { recursive: true });
  await fs.writeFile(path.join(biberDir, 'biber.exe'), 'MZ');
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  try {
    const biber = tectonicBiber();
    assert.equal(biber, path.join(biberDir, 'biber.exe'));
    const env = withBiber({ Path: 'C:\\texlive\\2022\\bin\\win64', SystemRoot: 'C:\\Windows' }, biber);
    assert.deepEqual(env, {
      Path: [biberDir, 'C:\\texlive\\2022\\bin\\win64'].join(path.delimiter),
      SystemRoot: 'C:\\Windows',
      PAR_GLOBAL_TMPDIR: path.join(biberDir, 'cache')
    });
    assert.deepEqual(withBiber({ Path: 'C:\\Windows' }, null), { Path: 'C:\\Windows' }, 'none downloaded: the Path as it is');
  } finally {
    Object.defineProperty(process, 'platform', platform);
    await fs.rm(biberDir, { recursive: true, force: true });
  }
});

test('a Tectonic download failure says how to get the packages', { skip }, async () => {
  await binWith('download');
  await builtIn('download', "this bundle isn't cached, and we couldn't get it from the internet.", 1);
  const p = await projectWith(plain);
  const result = await compile(p);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Tectonic couldn’t reach its server to download the TeX packages this document needs. Check the internet connection and compile again, or install TeX Live (MacTeX on a Mac, MiKTeX on Windows).');
});

test('the built-in Tectonic writes its PDF beside the source', { skip }, async () => {
  await binWith('pdf');
  await builtIn('pdf', 'TECTONIC RAN');
  const p = await projectWith(plain);
  assert.equal((await compile(p)).pdfPath, 'main.pdf');
  assert.ok(existsSync(path.join(p.path, 'main.pdf')));
});

test('a pass of the built-in Tectonic gets 15 minutes, not the 3-minute default', { skip }, async () => {
  await binWith('limit');
  const started = path.join(tmp, 'limit-started');
  // it says it has started, then takes a moment of real time while the test moves the clock on
  const slow = ENGINE('TECTONIC RAN').replace("let out = '';", `require('fs').writeFileSync(${JSON.stringify(started)}, ''); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500); let out = '';`);
  const file = path.join(tmp, 'tectonic-limit');
  await fs.writeFile(file, slow, { mode: 0o755 });
  process.env.SPECTRUM_TECTONIC = file;
  const p = await projectWith(plain);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const result = compile(p);
    while (!existsSync(started)) await new Promise((resolve) => setImmediate(resolve));
    mock.timers.tick(4 * 60 * 1000);
    const { log } = await result;
    assert.doesNotMatch(log, /was stopped after/);
    assert.match(log, /TECTONIC RAN/);
  } finally {
    mock.timers.reset();
  }
});

test('on Windows, Tectonic is given a fonts.conf in the data folder listing the Windows and per-user font folders', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
  try {
    assert.equal(await tectonicFontconfig(), null, 'elsewhere it has its own font system');
  } finally {
    Object.defineProperty(process, 'platform', platform);
  }
  const env = { SystemRoot: process.env.SystemRoot, LOCALAPPDATA: process.env.LOCALAPPDATA };
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  Object.assign(process.env, { SystemRoot: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\Kim & Lee\\AppData\\Local' });
  try {
    const file = await tectonicFontconfig();
    const engines = path.join(tmp, 'data', 'engines');
    assert.equal(file, path.join(engines, 'fonts.conf'));
    const conf = await fs.readFile(file, 'utf8');
    assert.ok(conf.includes(`<dir>${path.join('C:\\Windows', 'Fonts')}</dir>`), conf);
    assert.ok(conf.includes(`<dir>${path.join('C:\\Users\\Kim &amp; Lee\\AppData\\Local', 'Microsoft', 'Windows', 'Fonts')}</dir>`), conf);
    assert.ok(conf.includes(`<cachedir>${path.join(engines, 'fontconfig-cache')}</cachedir>`), conf);
    // written once: a file the user changed stays
    await fs.writeFile(file, 'mine');
    assert.equal(await tectonicFontconfig(), file);
    assert.equal(await fs.readFile(file, 'utf8'), 'mine');
  } finally {
    Object.defineProperty(process, 'platform', platform);
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
