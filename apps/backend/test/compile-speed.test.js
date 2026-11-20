// What a compile leaves out to be quick, and when it must not: each shortcut with the rule that makes it invalid.
// With the TeX installed on this computer (each test skips without the programs it needs), in-process, against
// throwaway data and projects folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-speed-')));
const dataDir = path.join(tmp, 'data');
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: dataDir,
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject } = await import('../src/services/projectService.js');
const { findExecutable, runCompile } = await import('../src/services/compileService.js');

after(() => rmSync(tmp, { recursive: true, force: true }));

const tools = {};
for (const name of ['pdflatex', 'xelatex', 'biber', 'latexmk']) tools[name] = await findExecutable(name);
const needs = (...names) => names.filter((name) => !tools[name]).map((name) => `needs ${name}`)[0] || false;

const newProject = (files) => createProject({
  name: 'Compile speed',
  populate: async (root) => {
    for (const [rel, text] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await fs.writeFile(path.join(root, rel), text);
    }
  }
});
const compile = (p, options = {}) => runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex', ...options });
const write = (p, rel, text) => fs.writeFile(path.join(p.path, rel), text);
const passes = (log) => (log.match(/^This is (?:pdfTeX|XeTeX), Version/gm) || []).length;
const biberRuns = (log) => (log.match(/INFO - This is Biber/g) || []).length;
const SKIPPED = /The bibliography is unchanged, so Biber wasn’t run/;

const cited = (body = 'Text \\cite{knuth}.', preamble = '') => [
  '\\documentclass{article}',
  '\\usepackage[backend=biber,style=numeric]{biblatex}',
  '\\addbibresource{refs.bib}',
  preamble,
  '\\begin{document}',
  body,
  '\\printbibliography',
  '\\end{document}',
  ''
].join('\n');
const entry = (key, title) => `@book{${key}, author = {Knuth, Donald}, title = {${title}}, publisher = {Addison-Wesley}, year = {1984}}\n`;

test('Biber is left out while the citations, the .bib files and Biber are as they were, and runs when any of them changes', { skip: needs('pdflatex', 'biber') }, async () => {
  const p = await newProject({ 'main.tex': cited(), 'refs.bib': entry('knuth', 'The TeXbook') + entry('lamport', 'LaTeX') });
  const first = await compile(p);
  assert.equal(first.status, 0, first.log);
  assert.equal(biberRuns(first.log), 1);

  // nothing changed, and an edit that cites nothing new: one pass, no Biber, the bibliography still there
  const second = await compile(p);
  assert.equal(second.status, 0, second.log);
  assert.equal(biberRuns(second.log), 0, second.log);
  assert.match(second.log, SKIPPED);
  assert.equal(passes(second.log), 1);
  await write(p, 'main.tex', cited('Other words \\cite{knuth}.'));
  const edit = await compile(p);
  assert.equal(biberRuns(edit.log), 0, edit.log);
  assert.doesNotMatch(edit.log, /undefined/i);

  // a changed .bib, with its size as it was (a sync client can put an old time back, so the bytes are what count)
  await write(p, 'refs.bib', entry('knuth', 'The TeXbooj') + entry('lamport', 'LaTeX'));
  const bib = await compile(p);
  assert.equal(biberRuns(bib.log), 1, bib.log);
  assert.equal(bib.status, 0);
  assert.equal(biberRuns((await compile(p)).log), 0);

  // a new citation
  await write(p, 'main.tex', cited('Other words \\cite{knuth} and \\cite{lamport}.'));
  const more = await compile(p);
  assert.equal(biberRuns(more.log), 1, more.log);
  assert.doesNotMatch(more.log.slice(more.log.lastIndexOf('This is pdfTeX')), /Citation .* undefined/);

  // another style: the control file holds its sorting and data model
  await write(p, 'main.tex', cited('Other words \\cite{knuth} and \\cite{lamport}.').replace('style=numeric', 'style=authoryear'));
  assert.equal(biberRuns((await compile(p)).log), 1);
  assert.equal(biberRuns((await compile(p)).log), 0);

  // from scratch, and another engine's own kept files, start from nothing
  assert.equal(biberRuns((await compile(p, { fresh: true })).log), 1);
  if (tools.xelatex) assert.equal(biberRuns((await compile(p, { engine: 'xelatex' })).log), 1);
});

test('Biber runs again after it failed, after a .bbl that went missing, and whenever a source can’t be read here', { skip: needs('pdflatex', 'biber') }, async () => {
  const p = await newProject({ 'main.tex': cited(), 'refs.bib': entry('knuth', 'The TeXbook') });
  assert.equal((await compile(p)).status, 0);
  // a .bib Biber can't read: it fails, and the next compile runs it again though nothing changed since
  await write(p, 'refs.bib', '@book{knuth, title = {Unclosed\n');
  const broken = await compile(p);
  assert.match(broken.log, /Biber failed/);
  assert.equal(biberRuns((await compile(p)).log), 1);
  await write(p, 'refs.bib', entry('knuth', 'The TeXbook'));
  assert.equal((await compile(p)).status, 0);
  assert.equal(biberRuns((await compile(p)).log), 0);

  // the kept .bbl gone (a store another version cleared in part)
  const store = path.join(dataDir, 'cache', p.id, 'build-files', 'main.tex', 'pdflatex');
  await fs.rm(path.join(store, 'main.bbl'));
  assert.equal(biberRuns((await compile(p)).log), 1);

  // a source named by a pattern: what it matches can't be told from here, so Biber always runs
  await write(p, 'main.tex', cited().replace('\\addbibresource{refs.bib}', '\\addbibresource[glob]{ref*.bib}'));
  assert.equal(biberRuns((await compile(p)).log), 1);
  assert.equal(biberRuns((await compile(p)).log), 1);
});

test('a .bib in the main file’s folder or the project’s is read where Biber finds it', { skip: needs('pdflatex', 'biber') }, async () => {
  const p = await newProject({ 'paper/main.tex': cited(), 'refs.bib': entry('knuth', 'The TeXbook') });
  const run = () => runCompile({ projectId: p.id, mainFile: 'paper/main.tex', engine: 'pdflatex' });
  assert.equal((await run()).status, 0);
  assert.equal(biberRuns((await run()).log), 0);
  // one beside the main file now comes first on BIBINPUTS
  await write(p, 'paper/refs.bib', entry('knuth', 'Another Book'));
  assert.equal(biberRuns((await run()).log), 1);
  assert.equal(biberRuns((await run()).log), 0);
});
