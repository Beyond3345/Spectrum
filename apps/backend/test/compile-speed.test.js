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
// (every import up here: a test declared after a later await would start once the ones before it had ended)
const { formatsSettled, pdfObjects, preambleOf, samePages } = await import('../src/services/preambleFormat.js');

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
  assert.doesNotMatch(second.log, /^\[spectrum\] /m, 'a note, not a line the editor lists as an error');
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

// ─── the precompiled preamble ───

const FROM_FORMAT = /This compile starts from a format of the preamble/;
const fmtDir = (p) => path.join(dataDir, 'cache', p.id, 'build-files', 'main.tex', 'pdflatex.format');
const fmtState = async (p) => JSON.parse(await fs.readFile(path.join(fmtDir(p), 'state.json'), 'utf8').catch(() => 'null'))?.status ?? null;
const pre = (p, options = {}) => compile(p, { precompile: true, ...options });
// a compile, then the format it asked for behind it made and tried
const preSettled = async (p, options) => {
  const result = await pre(p, options);
  await formatsSettled();
  return result;
};
const notes = (body, preamble = '') => [
  '\\documentclass{article}',
  '\\usepackage{amsmath,graphicx,xcolor}',
  '\\usepackage[hidelinks]{hyperref}',
  preamble,
  '\\begin{document}',
  '\\tableofcontents',
  '\\section{One}\\label{one}',
  body,
  '\\end{document}',
  ''
].join('\n');
const pages = (result) => Buffer.from(result.pdf, 'base64');

test('the preamble of a main file ends at its \\begin{document}, and some files have none to precompile', () => {
  assert.equal(preambleOf('\\documentclass{article}\n\\usepackage{x}\n\\begin{document}\nHi\n\\end{document}\n'), '\\documentclass{article}\n\\usepackage{x}\n');
  assert.equal(preambleOf('\\documentclass{article}\n% \\begin{document}\n\\newcommand{\\x}{1\\%}\\begin{document}Hi'), '\\documentclass{article}\n% \\begin{document}\n\\newcommand{\\x}{1\\%}');
  assert.equal(preambleOf('\\documentclass{article}\n\\input{body}\n'), null, 'the document begins in another file');
  assert.equal(preambleOf('\\input{preamble}\n\\begin{document}Hi\\end{document}'), null, 'no \\documentclass of its own');
  assert.equal(preambleOf('%&myformat\n\\documentclass{article}\\begin{document}Hi\\end{document}'), null, 'a format of its own');
});

test('a format of the preamble is made behind the first compile and used from the next, with the same pages and files', { skip: needs('pdflatex') }, async () => {
  const p = await newProject({ 'main.tex': notes('Words \\textcolor{blue}{in blue} and $a^2+b^2$, see Section~\\ref{one}.') });
  const first = await pre(p);
  assert.equal(first.status, 0, first.log);
  assert.doesNotMatch(first.log, FROM_FORMAT, 'none yet');
  await formatsSettled();
  assert.equal(await fmtState(p), 'ready');
  const second = await pre(p);
  assert.equal(second.status, 0, second.log);
  assert.match(second.log, FROM_FORMAT);
  assert.equal(passes(second.log), 1);
  assert.match(second.log, /\(preloaded format=[^)]*pdflatex\.format\/main\)/);
  // nothing Spectrum says of its shortcuts is a line the editor lists as an error
  assert.doesNotMatch(second.log, /^\[spectrum\] /m);
  // the preamble's own log comes with it, so its warnings are still listed
  assert.match(second.log, /hyperref\.sty/);
  // the same pages as a compile without it, and the same kept files
  const plain = await compile(p, { precompile: false });
  assert.doesNotMatch(plain.log, FROM_FORMAT);
  assert.ok(samePages(pages(second), pages(plain)), 'the pages match');
  assert.ok(pdfObjects(pages(second)).size > 5);
  // an edit to the text still starts from the format, and is in the PDF
  await write(p, 'main.tex', notes('Other words, see Section~\\ref{one}.'));
  const edit = await pre(p);
  assert.match(edit.log, FROM_FORMAT);
  assert.ok(!samePages(pages(edit), pages(second)), 'the new text is there');
  assert.ok(samePages(pages(edit), pages(await compile(p, { precompile: false }))));
  // SyncTeX still knows the lines of the main file
  assert.ok(existsSync(path.join(dataDir, 'cache', p.id, 'synctex')));
});

test('a format is not used once anything it was made from has changed, and another is made', { skip: needs('pdflatex') }, async () => {
  const body = 'Words \\mine{} and \\theirs{}.';
  const p = await newProject({
    'main.tex': notes(body, '\\usepackage{mystyle}\n\\input{macros}'),
    'mystyle.sty': '\\ProvidesPackage{mystyle}\n\\newcommand{\\mine}{first}\n',
    'macros.tex': '\\newcommand{\\theirs}{first}\n'
  });
  const usedNext = async (what, options) => {
    assert.match((await pre(p, options)).log, FROM_FORMAT, `used: ${what}`);
  };
  // after a change: the compile right after it runs the whole preamble, and is right; the one after that has a new format
  const remade = async (what, options) => {
    const after = await preSettled(p, options);
    assert.equal(after.status, 0, after.log);
    assert.doesNotMatch(after.log, FROM_FORMAT, `not used after ${what}`);
    assert.ok(samePages(pages(after), pages(await compile(p, { ...options, precompile: false }))), `right after ${what}`);
    await usedNext(what, options);
  };
  await preSettled(p);
  await usedNext('nothing changed');

  await write(p, 'main.tex', notes(body, '\\usepackage{mystyle}\n\\input{macros}\n\\newcommand{\\more}{more}'));
  await remade('a changed preamble');
  await write(p, 'mystyle.sty', '\\ProvidesPackage{mystyle}\n\\newcommand{\\mine}{second}\n');
  await remade('a changed package of the project’s');
  await write(p, 'macros.tex', '\\newcommand{\\theirs}{second}\n');
  await remade('a changed file the preamble inputs');
  await write(p, 'hyperref.cfg', '% found before TeX’s own\n');
  await remade('a new file TeX would find first');
  await setTrusted(p.id, p.path, true);
  await remade('the project trusted');
  await setTrusted(p.id, p.path, false);
  await remade('the project confined again');

  // never for what a format wasn't made for: a draft, the page colour, another engine, the document's own options
  assert.doesNotMatch((await pre(p, { draft: true })).log, FROM_FORMAT);
  assert.doesNotMatch((await pre(p, { pageColour: '#fdf6e3' })).log, FROM_FORMAT);
  if (tools.xelatex) assert.doesNotMatch((await pre(p, { engine: 'xelatex' })).log, FROM_FORMAT);
  await formatsSettled();
  assert.ok(!existsSync(path.join(dataDir, 'cache', p.id, 'build-files', 'main.tex', 'xelatex.format')));
  await usedNext('after those');
  const source = await fs.readFile(path.join(p.path, 'main.tex'), 'utf8');
  await write(p, 'main.tex', '% !TEX options = -8bit\n' + source);
  assert.doesNotMatch((await preSettled(p)).log, FROM_FORMAT);
  assert.doesNotMatch((await pre(p)).log, FROM_FORMAT, 'with engine options of its own');
  await write(p, 'main.tex', '% !TEX recipe = pdflatex; pdflatex\n' + source);
  assert.doesNotMatch((await preSettled(p)).log, FROM_FORMAT);
  assert.doesNotMatch((await pre(p)).log, FROM_FORMAT, 'with a recipe of its own');
  // Recompile from scratch clears it with the other kept files
  await write(p, 'main.tex', source);
  await preSettled(p);
  await usedNext('back to Spectrum’s own passes');
  assert.doesNotMatch((await pre(p, { fresh: true })).log, FROM_FORMAT);
});

test('a preamble a format can’t carry is found out before the format is ever used', { skip: needs('pdflatex') }, async () => {
  // a colour set in the preamble is lost in a format: the two trial passes differ, twice, and that is the end of it
  const red = await newProject({ 'main.tex': notes('Red from the preamble.', '\\color{red}') });
  for (let i = 0; i < 3; i += 1) {
    const result = await preSettled(red);
    assert.doesNotMatch(result.log, FROM_FORMAT);
    assert.ok(samePages(pages(result), pages(await compile(red, { precompile: false }))));
  }
  assert.equal(await fmtState(red), 'differs');
  // an image put in a box in the preamble is a PDF object the format doesn't hold
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const boxed = await newProject({ 'main.tex': notes('Logo \\usebox\\logo.', '\\newsavebox\\logo\\sbox\\logo{\\includegraphics{dot.png}}') });
  await fs.writeFile(path.join(boxed.path, 'dot.png'), PNG);
  assert.equal((await preSettled(boxed)).status, 0);
  assert.equal(await fmtState(boxed), 'refused');
  assert.doesNotMatch((await pre(boxed)).log, FROM_FORMAT);
});

test('a pass that fails with an error of pdfTeX’s own under a format runs again without it, and the format is dropped', { skip: needs('pdflatex') }, async () => {
  const p = await newProject({ 'main.tex': notes('Words.') });
  await preSettled(p);
  assert.match((await pre(p)).log, FROM_FORMAT);
  // a format that no longer suits the engine (as after an update the key didn't see)
  await fs.writeFile(path.join(fmtDir(p), 'main.fmt'), 'not a format');
  const saved = await pre(p);
  assert.equal(saved.status, 0, saved.log);
  assert.doesNotMatch(saved.log, FROM_FORMAT);
  assert.equal(await fmtState(p), 'refused');
  // an error of the document's own is the document's: the format stays
  const q = await newProject({ 'main.tex': notes('Words.') });
  await preSettled(q);
  await write(q, 'main.tex', notes('Words \\undefinedthing.'));
  const broken = await pre(q);
  assert.notEqual(broken.status, 0);
  assert.match(broken.log, FROM_FORMAT);
  assert.equal(passes(broken.log), 1, 'the format’s own pass, and no second without it');
  assert.equal(await fmtState(q), 'ready');
});

test('an edit saved while a format is being made neither spoils it nor gets into it', { skip: needs('pdflatex') }, async () => {
  const doc = (word, body) => notes(`${body} \\word.`, `\\newcommand{\\word}{${word}}`);
  // the text edited while the format is made and tried: it is tried on the project as it was, and is ready
  const p = await newProject({ 'main.tex': doc('old', 'First words') });
  assert.equal((await pre(p)).status, 0);
  await write(p, 'main.tex', doc('old', 'Second words'));
  await formatsSettled();
  assert.equal(await fmtState(p), 'ready');
  const next = await pre(p);
  assert.match(next.log, FROM_FORMAT);
  assert.ok(samePages(pages(next), pages(await compile(p, { precompile: false }))));

  // the preamble edited while it is made: whichever preamble the copy caught, no format ever holds another's
  const q = await newProject({ 'main.tex': doc('old', 'Words') });
  assert.equal((await pre(q)).status, 0);
  await write(q, 'main.tex', doc('new', 'Words'));
  await formatsSettled();
  for (const word of ['old', 'new', 'old']) {
    await write(q, 'main.tex', doc(word, 'Words'));
    const result = await preSettled(q);
    assert.ok(samePages(pages(result), pages(await compile(q, { precompile: false }))), `the pages of “${word}”`);
  }
});

// ─── only the open chapter ───

const pageCount = (result) => [...pdfObjects(pages(result)).values()].filter((body) => /\/Type\s*\/Page\b(?!s)/.test(body)).length;
const ONLY = /Only chapters\/two was typeset/;
const book = (extra = '') => [
  '\\documentclass{report}',
  '\\usepackage[backend=biber]{biblatex}',
  '\\addbibresource{refs.bib}',
  '\\begin{document}',
  '\\tableofcontents',
  '\\include{chapters/one}',
  '\\include{chapters/two}',
  '\\include{chapters/three}',
  extra,
  '\\printbibliography',
  '\\end{document}',
  ''
].join('\n');
const chapter = (n, more = '') => `\\chapter{Chapter ${n}}\\label{ch:${n}}\nText of chapter ${n} \\cite{knuth}, see Chapter~\\ref{ch:one}. ${more}\n\\newpage More of chapter ${n}.\n`;
const bookFiles = () => ({ 'main.tex': book(), 'refs.bib': entry('knuth', 'The TeXbook') + entry('lamport', 'LaTeX'), 'chapters/one.tex': chapter('one'), 'chapters/two.tex': chapter('two'), 'chapters/three.tex': chapter('three'), 'notes.tex': 'Notes.\n' });

test('Only the open chapter typesets that chapter in one pass with the others’ numbers, and leaves the document’s PDF alone', { skip: needs('pdflatex', 'biber') }, async () => {
  const p = await newProject(bookFiles());
  const full = await compile(p);
  assert.equal(full.status, 0, full.log);
  const onDisk = await fs.readFile(path.join(p.path, 'main.pdf'));
  const all = pageCount(full);

  await write(p, 'chapters/two.tex', chapter('two', 'An edit.'));
  const only = await compile(p, { onlyFile: 'chapters/two.tex' });
  assert.equal(only.status, 0, only.log);
  assert.match(only.log, ONLY);
  assert.equal(only.only, 'chapters/two');
  assert.equal(passes(only.log), 1);
  assert.equal(biberRuns(only.log), 0);
  assert.ok(pageCount(only) < all, `${pageCount(only)} of ${all} pages`);
  // chapter two still starts on its page of the whole document, and its reference to chapter one still has its number
  assert.match(await fs.readFile(path.join(dataDir, 'cache', p.id, 'build-files', 'main.tex', 'pdflatex', 'chapters', 'two.aux'), 'utf8'), /\\newlabel\{ch:two\}\{\{2\}\{4\}/);
  assert.doesNotMatch(only.log, /Reference `ch:one' on page \d+ undefined/);
  // the PDF beside the source is the whole document's, and the editor is told so
  assert.ok(onDisk.equals(await fs.readFile(path.join(p.path, 'main.pdf'))));
  assert.equal(only.pdfStale, true);

  // a label added in the chapter is there for the next compile of it
  await write(p, 'chapters/two.tex', chapter('two', '\\section{New}\\label{sec:new} See Section~\\ref{sec:new}.'));
  await compile(p, { onlyFile: 'chapters/two.tex' });
  const again = await compile(p, { onlyFile: 'chapters/two.tex' });
  assert.match(again.log, ONLY);
  assert.doesNotMatch(again.log, /Reference `sec:new' on page \d+ undefined/);

  // and the next full compile is the whole document again, as one from scratch makes it: nothing a chapter's pass
  // was missing is carried into it (biblatex would go on asking for Biber, pass after pass)
  const whole = await compile(p);
  assert.equal(whole.status, 0, whole.log);
  assert.doesNotMatch(whole.log, /Only chapters/);
  assert.doesNotMatch(whole.log.slice(whole.log.lastIndexOf('This is pdfTeX')), /Please \(re\)run Biber/);
  const settled = await compile(p);
  assert.equal(passes(settled.log), 1, settled.log);
  assert.equal(biberRuns(settled.log), 0);
  assert.doesNotMatch(settled.log, /Please \(re\)run Biber|undefined references/);
  assert.equal(pageCount(whole), all + 0);
  assert.ok(Buffer.from(settled.pdf, 'base64').equals(await fs.readFile(path.join(p.path, 'main.pdf'))));
  const scratch = await compile(p, { fresh: true });
  assert.ok(samePages(pages(whole), pages(scratch)), 'the same pages as from scratch');
});

test('Only the open chapter compiles the whole document when it can’t be right', { skip: needs('pdflatex', 'biber') }, async () => {
  const p = await newProject(bookFiles());
  const wholeAfter = async (what, options) => {
    const result = await compile(p, options);
    assert.ok(result.ok, result.error || result.log);
    assert.doesNotMatch(result.log, /Only chapters/, what);
    assert.equal(result.only, undefined, what);
    return result;
  };
  // nothing kept yet to take the other chapters' numbers from
  const first = await wholeAfter('a first compile', { onlyFile: 'chapters/two.tex' });
  assert.match(first.log, /This compiled the whole document/);
  assert.ok(passes(first.log) >= 2);
  assert.match((await compile(p, { onlyFile: 'chapters/two.tex' })).log, ONLY);
  // a file that is no chapter of the document, and the document itself
  await wholeAfter('a file the document doesn’t \\include', { onlyFile: 'notes.tex' });
  await wholeAfter('the main file', { onlyFile: 'main.tex' });
  await wholeAfter('a path out of the project', { onlyFile: '../chapters/two.tex' });
  // from scratch, and the engines that choose their own passes
  await wholeAfter('from scratch', { onlyFile: 'chapters/two.tex', fresh: true });
  if (tools.latexmk) await wholeAfter('latexmk', { onlyFile: 'chapters/two.tex', engine: 'latexmk' });
  // a chapter's compile with errors keeps nothing of itself and leaves the last full compile's files, so its fix is
  // a chapter's compile again; a full compile with errors clears them, and the next is whole
  await write(p, 'chapters/two.tex', chapter('two', '\\undefinedthing'));
  assert.notEqual((await compile(p, { onlyFile: 'chapters/two.tex' })).status, 0);
  await write(p, 'chapters/two.tex', chapter('two'));
  const fixed = await compile(p, { onlyFile: 'chapters/two.tex' });
  assert.match(fixed.log, ONLY);
  assert.equal(fixed.status, 0, fixed.log);
  await write(p, 'chapters/two.tex', chapter('two', '\\undefinedthing'));
  assert.notEqual((await compile(p)).status, 0);
  await write(p, 'chapters/two.tex', chapter('two'));
  await wholeAfter('after a full compile with errors', { onlyFile: 'chapters/two.tex' });
  // with the precompiled preamble on, a chapter alone is a pass of its own without the format, and still right
  await preSettled(p);
  const withFormat = await pre(p);
  assert.match(withFormat.log, FROM_FORMAT);
  const chapterOnly = await pre(p, { onlyFile: 'chapters/two.tex' });
  assert.match(chapterOnly.log, ONLY);
  assert.doesNotMatch(chapterOnly.log, FROM_FORMAT);
  assert.equal(chapterOnly.status, 0);
});
