// What a compile leaves out to be quick, and when it must not: each shortcut with the rule that makes it invalid.
// With the TeX installed on this computer (each test skips without the programs it needs), in-process, against
// throwaway data and projects folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-speed-')));
// a space in it, as the app's own data folder has on a Mac (Application Support): the kept folders are in there
const dataDir = path.join(tmp, 'Application Support', 'data');
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: dataDir,
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject } = await import('../src/services/projectService.js');
const { findExecutable, runCompile, stopCompile } = await import('../src/services/compileService.js');
const { setTrusted } = await import('../src/services/trustService.js');

after(() => rmSync(tmp, { recursive: true, force: true }));

const tools = {};
for (const name of ['pdflatex', 'xelatex', 'biber', 'bibtex', 'latexmk']) tools[name] = await findExecutable(name);
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

// ─── latexmk's own folder ───

const mk = (p, options = {}) => compile(p, { engine: 'latexmk', ...options });
const mkFolder = (p) => path.join(dataDir, 'cache', p.id, 'build-files', 'main.tex', 'latexmk');
const NO_PASS = /Nothing this document reads has changed, so latexmk ran no pass/;
const article = (body, preamble = '') => `\\documentclass{article}\n${preamble}\\begin{document}\n\\tableofcontents\n\\section{One}\\label{one}\n${body}\n\\end{document}\n`;
const natbib = (body) => article(`${body} \\cite{knuth}\n\\bibliographystyle{plain}\n\\bibliography{refs}`);

test('latexmk builds in a folder it keeps: nothing again when nothing changed, one pass for an edit, BibTeX for a changed .bib', { skip: needs('latexmk', 'pdflatex', 'bibtex') }, async () => {
  const p = await newProject({ 'main.tex': natbib('Words. \\rule{2\\textwidth}{1pt}'), 'refs.bib': entry('knuth', 'The TeXbook') });
  const first = await mk(p);
  assert.equal(first.status, 0, first.log);
  assert.ok(passes(first.log) >= 3, 'a full build');
  assert.match(first.log, /This is BibTeX/);
  const pdf = await fs.readFile(path.join(p.path, 'main.pdf'));

  // nothing changed: no pass, the same PDF, and the last pass's warnings still in the log for the editor
  const second = await mk(p);
  assert.equal(second.status, 0, second.log);
  assert.match(second.log, NO_PASS);
  assert.doesNotMatch(second.log.split('The last pass said:')[0], /This is pdfTeX/);
  assert.match(second.log, /Overfull \\hbox/);
  assert.ok(pdf.equals(await fs.readFile(path.join(p.path, 'main.pdf'))));
  assert.ok(pdf.equals(Buffer.from(second.pdf, 'base64')));

  // an edit to the text: one pass, no BibTeX
  await write(p, 'main.tex', natbib('Other words. \\rule{2\\textwidth}{1pt}'));
  const edit = await mk(p);
  assert.equal(edit.status, 0, edit.log);
  assert.equal(passes(edit.log), 1, edit.log);
  assert.doesNotMatch(edit.log, /This is BibTeX/);
  assert.ok(!pdf.equals(Buffer.from(edit.pdf, 'base64')), 'a new PDF');

  // a changed .bib, same size: BibTeX and the passes after it
  await write(p, 'refs.bib', entry('knuth', 'The TeXbooj'));
  const bib = await mk(p);
  assert.match(bib.log, /This is BibTeX/);
  assert.ok(passes(bib.log) >= 1);

  // a new heading: the contents need a second pass, which latexmk sees
  await write(p, 'main.tex', natbib('Other words. \\section{Two}'));
  assert.ok(passes((await mk(p)).log) >= 2);

  // from scratch starts from nothing
  const fresh = await mk(p, { fresh: true });
  assert.ok(passes(fresh.log) >= 3, fresh.log);
  assert.match(fresh.log, /This is BibTeX/);
  assert.ok(existsSync(path.join(mkFolder(p), '.complete')));
  assert.ok(!existsSync(mkFolder(p) + '.last'));
  // SyncTeX and the .aux other documents read are kept as for every engine, and latexmk's folder still has its own
  assert.ok(existsSync(path.join(dataDir, 'cache', p.id, 'aux-files', 'main.tex', 'main.aux')));
  assert.ok(existsSync(path.join(mkFolder(p), 'main.aux')));
  assert.ok(existsSync(path.join(mkFolder(p), 'main.synctex.gz')));
});

test('latexmk’s folder is built on only as a build without errors left it: an error, a Stop and a draft leave the last such build', { skip: needs('latexmk', 'pdflatex') }, async () => {
  const p = await newProject({ 'main.tex': article('Words.') });
  assert.equal((await mk(p)).status, 0);
  const good = await fs.readFile(path.join(mkFolder(p), 'main.aux'), 'utf8');

  // an error: the PDF of that build is shown, and the folder goes back to the last good build
  await write(p, 'main.tex', article('Words. \\section{Broken}\\undefinedthing'));
  const broken = await mk(p);
  assert.notEqual(broken.status, 0);
  assert.equal(await fs.readFile(path.join(mkFolder(p), 'main.aux'), 'utf8'), good);
  assert.ok(!existsSync(mkFolder(p) + '.last'));
  // and its fix is one build on from there, with the new heading in the contents
  await write(p, 'main.tex', article('Words. \\section{Mended}'));
  const mended = await mk(p);
  assert.equal(mended.status, 0, mended.log);
  assert.match(await fs.readFile(path.join(mkFolder(p), 'main.toc'), 'utf8'), /Mended/);
  assert.doesNotMatch(await fs.readFile(path.join(mkFolder(p), 'main.toc'), 'utf8'), /Broken/);

  // a Stop part way through a pass
  const kept = await fs.readFile(path.join(mkFolder(p), 'main.aux'), 'utf8');
  await write(p, 'main.tex', article('Words. \\section{Stopped}\\loop\\iftrue\\repeat'));
  const running = mk(p, { compileId: 'stop-latexmk' });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  stopCompile('stop-latexmk');
  assert.equal((await running).stopped, true);
  assert.equal(await fs.readFile(path.join(mkFolder(p), 'main.aux'), 'utf8'), kept);
  assert.ok(!existsSync(mkFolder(p) + '.last'));

  // a draft builds elsewhere, from nothing, and the next full compile has nothing to do
  await write(p, 'main.tex', article('Words. \\section{Mended}'));
  assert.equal((await mk(p)).status, 0);
  const draft = await mk(p, { draft: true });
  assert.ok(passes(draft.log) >= 2, draft.log);
  assert.match((await mk(p)).log, NO_PASS);

  // a build that never ended (a crash): the copy beside the folder is put back
  await fs.cp(mkFolder(p), mkFolder(p) + '.last', { recursive: true });
  await fs.writeFile(path.join(mkFolder(p), 'main.aux'), '\\relax \\broken{');
  assert.match((await mk(p)).log, NO_PASS);
});

test('latexmk’s folder starts from nothing when the project’s trust or the TeX it runs with changes', { skip: needs('latexmk', 'pdflatex') }, async () => {
  const p = await newProject({ 'main.tex': article('Words.') });
  assert.equal((await mk(p)).status, 0);
  assert.match((await mk(p)).log, NO_PASS);
  // trusted: full shell escape, which the kept files were not made with
  await setTrusted(p.id, p.path, true);
  const trusted = await mk(p);
  assert.ok(passes(trusted.log) >= 2, trusted.log);
  assert.match((await mk(p)).log, NO_PASS);
  await setTrusted(p.id, p.path, false);
  assert.ok(passes((await mk(p)).log) >= 2);
  // another TeX folder first on the PATH
  const other = await mk(p, { texFolder: tmp });
  assert.equal(other.status, 0);
  assert.ok(passes(other.log) >= 2, other.log);
});

test('what filecontents wrote is not kept in latexmk’s folder, so the block’s new text is read', { skip: needs('latexmk', 'pdflatex') }, async () => {
  const doc = (text) => `\\begin{filecontents}{note.tex}\n${text}\n\\end{filecontents}\n` + article('\\input{note}');
  const p = await newProject({ 'main.tex': doc('First text.') });
  assert.equal((await mk(p)).status, 0);
  await write(p, 'main.tex', doc('Second text.'));
  const second = await mk(p);
  assert.equal(second.status, 0, second.log);
  // its first pass writes the new text (a pass after it in the same build then finds it there)
  assert.match(second.log.split('Run number 2')[0], /Writing file `\.\/note\.tex'/);
  assert.ok(!existsSync(path.join(mkFolder(p), 'note.tex')));
});

test('latexmk runs Biber from its kept folder, again only for a changed .bib', { skip: needs('latexmk', 'pdflatex', 'biber') }, async () => {
  const p = await newProject({ 'main.tex': cited(), 'refs.bib': entry('knuth', 'The TeXbook') });
  const first = await mk(p);
  assert.equal(first.status, 0, first.log);
  assert.equal(biberRuns(first.log), 1);
  assert.match((await mk(p)).log, NO_PASS);
  await write(p, 'main.tex', cited('Other words \\cite{knuth}.'));
  const edit = await mk(p);
  assert.equal(edit.status, 0, edit.log);
  assert.equal(biberRuns(edit.log), 0);
  await write(p, 'refs.bib', entry('knuth', 'The TeXbooj'));
  const bib = await mk(p);
  assert.equal(bib.status, 0, bib.log);
  assert.equal(biberRuns(bib.log), 1);
});

// ─── the system check ───

test('the system check never holds the server up, and runs a program that worked again only when asked or when its file changed', { skip: process.platform === 'win32' ? 'shell scripts stand in for the programs' : false }, async () => {
  const { registerSystemRoutes } = await import('../src/routes/system.js');
  const { default: Fastify } = await import('fastify');
  const bin = path.join(tmp, 'slow bin');
  const ran = path.join(tmp, 'biber-runs.txt');
  await fs.mkdir(bin);
  const biber = (exit) => fs.writeFile(path.join(bin, 'biber'), `#!/bin/sh\necho run >> "${ran}"\nsleep 1\necho "biber version: 2.21"\nexit ${exit}\n`, { mode: 0o755 });
  await biber(0);
  const runs = async () => (await fs.readFile(ran, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
  const app = Fastify();
  registerSystemRoutes(app);
  app.get('/quick', async () => ({ ok: true }));
  const check = (more = {}) => app.inject({ url: `/api/system/check?${new URLSearchParams({ texFolder: bin, ...more })}` }).then((res) => res.json());
  try {
    // another request is answered while Biber is still being tried
    const started = Date.now();
    const first = check();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await app.inject({ url: '/quick' });
    const quick = Date.now() - started;
    assert.ok(quick < 700, `a request beside the check took ${quick} ms`);
    assert.deepEqual((await first).problems, {});
    assert.equal(await runs(), 1);
    // it worked, so opening Settings again doesn't run it
    assert.equal((await check()).tools.biber, path.join(bin, 'biber'));
    assert.equal(await runs(), 1);
    // Check again does, and so does a Biber that changed
    await check({ fresh: '1' });
    assert.equal(await runs(), 2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await biber(3);
    assert.match((await check()).problems.biber, /Installed but not working/);
    assert.equal(await runs(), 3);
    // one that failed is tried every time, as the user may just have put it right
    await check();
    assert.equal(await runs(), 4);
  } finally {
    await app.close();
  }
});
