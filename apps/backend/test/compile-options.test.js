// The compile's options and kept build files, with the TeX installed on this computer (each test skips without the
// programs it needs). In-process, against throwaway data and projects folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-compile-')));
const dataDir = path.join(tmp, 'data');
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: dataDir,
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject } = await import('../src/services/projectService.js');
const { findExecutable, runCompile, stopCompile } = await import('../src/services/compileService.js');
const { documentLabels, projectStats } = await import('../src/services/statsService.js');
const { compile: compileTarget } = await import('../src/services/transferAgent/nodes/compile.js');
const { registerSystemRoutes } = await import('../src/routes/system.js');
const { default: Fastify } = await import('fastify');
const WINDOWS = process.platform === 'win32';

after(() => rmSync(tmp, { recursive: true, force: true }));

const tools = {};
for (const name of ['pdflatex', 'bibtex', 'biber', 'makeindex', 'makeglossaries', 'makeglossaries-lite', 'latexmk', 'tectonic']) tools[name] = await findExecutable(name);
const needs = (...names) => names.filter((name) => !tools[name]).map((name) => `needs ${name}`)[0] || false;

const newProject = (files) => createProject({
  name: 'Compile options',
  populate: async (root) => {
    for (const [rel, text] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await fs.writeFile(path.join(root, rel), text);
    }
  }
});
const compile = (p, options = {}) => runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex', ...options });
// each pdfLaTeX run starts with its banner
const passes = (log) => (log.match(/^This is pdfTeX, Version/gm) || []).length;
const lastPass = (log) => log.slice(log.lastIndexOf('This is pdfTeX, Version'));
const kept = (p, ...parts) => path.join(dataDir, 'cache', p.id, 'build-files', 'main.tex', 'pdflatex', ...parts);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const paper = (extra = '') => [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\tableofcontents',
  '\\section{One}\\label{one} See section~\\ref{one} and \\cite{Knuth1984}.',
  extra,
  '\\bibliographystyle{plain}',
  '\\bibliography{refs}',
  '\\end{document}',
  ''
].join('\n');
const refs = '@book{Knuth1984, author = {Knuth, Donald}, title = {The TeXbook}, publisher = {Addison-Wesley}, year = {1984}}\n';

test('a document whose kept files are current compiles in one pass, and in full when they change or from scratch', { skip: needs('pdflatex', 'bibtex') }, async () => {
  const p = await newProject({ 'main.tex': paper(), 'refs.bib': refs });
  const first = await compile(p);
  assert.ok(first.ok, first.error || first.log);
  assert.equal(first.status, 0, first.log);
  assert.ok(passes(first.log) >= 2);
  assert.doesNotMatch(lastPass(first.log), /undefined/);
  assert.ok(existsSync(kept(p, '.complete')));
  assert.ok(existsSync(kept(p, 'main.bbl')));

  const again = await compile(p);
  assert.equal(again.status, 0, again.log);
  assert.equal(passes(again.log), 1);
  assert.doesNotMatch(again.log, /undefined/);
  // nothing in the project but the PDF, as before
  assert.deepEqual((await fs.readdir(p.path)).sort(), ['.spectrum', 'main.pdf', 'main.tex', 'refs.bib']);

  await fs.writeFile(path.join(p.path, 'main.tex'), paper('\\section{Two}\\label{two} And section~\\ref{two}.'));
  const edited = await compile(p);
  assert.ok(passes(edited.log) >= 2);
  assert.doesNotMatch(lastPass(edited.log), /undefined/);

  const fresh = await compile(p, { fresh: true });
  assert.ok(passes(fresh.log) >= 2);
  assert.doesNotMatch(lastPass(fresh.log), /undefined/);
});

test('a list a package reads back from a file of its own is kept, so a one-pass compile still shows it', { skip: needs('pdflatex') }, async () => {
  // \@starttoc{xyz} reads main.xyz back, as \lstlistoflistings reads main.lol
  const p = await newProject({
    'main.tex': '\\documentclass{article}\\makeatletter\\begin{document}\\@starttoc{xyz}\\addtocontents{xyz}{\\protect\\typeout{read-from-xyz}}Hi\\end{document}\n'
  });
  assert.equal((await compile(p)).status, 0);
  const again = await compile(p);
  assert.equal(passes(again.log), 1);
  assert.match(again.log, /read-from-xyz/);
  assert.ok(existsSync(kept(p, 'main.xyz')));
});

test('a hyperref document whose kept files are current compiles in one pass', { skip: needs('pdflatex') }, async () => {
  const p = await newProject({ 'main.tex': '\\documentclass{article}\\usepackage{hyperref}\\begin{document}\\section{A}\\label{a}\\ref{a}\\end{document}\n' });
  assert.equal((await compile(p)).status, 0);
  assert.equal(passes((await compile(p)).log), 1);
});

test('BibTeX runs when the citations and \\bibliography are in \\include’d chapters', { skip: needs('pdflatex', 'bibtex') }, async () => {
  const p = await newProject({
    'main.tex': '\\documentclass{report}\\begin{document}\\include{chapters/one}\\include{chapters/back}\\end{document}\n',
    'chapters/one.tex': '\\chapter{One} See \\cite{Knuth1984}.\n',
    'chapters/back.tex': '\\bibliographystyle{plain}\\bibliography{refs}\n',
    'refs.bib': refs
  });
  const res = await compile(p, { fresh: true });
  assert.equal(res.status, 0, res.log);
  assert.match(res.log, /This is BibTeX/);
  assert.doesNotMatch(lastPass(res.log), /undefined/);
});

test('nothing cited, no BibTeX run', { skip: needs('pdflatex') }, async () => {
  const p = await newProject({ 'main.tex': '\\documentclass{article}\\begin{document}\\section{A}\\label{a}\\ref{a}\\end{document}\n' });
  const res = await compile(p);
  assert.equal(res.status, 0, res.log);
  assert.doesNotMatch(res.log, /BibTeX|bibtex/);
});

test('a kept file TeX can’t read is cleared, and the document compiles again from scratch', { skip: needs('pdflatex', 'bibtex') }, async () => {
  const p = await newProject({ 'main.tex': paper(), 'refs.bib': refs });
  assert.equal((await compile(p)).status, 0);
  for (const [file, text] of [['main.aux', '\\relax\n\\bogusmacro\n'], ['main.toc', '\\contentsline {section}{\\numberline {1}One}{1\n']]) {
    await fs.writeFile(kept(p, file), text);
    const res = await compile(p);
    assert.ok(res.ok, res.log);
    assert.equal(res.status, 0, res.log);
    assert.match(res.log, /compiled again from scratch/);
    assert.doesNotMatch(await fs.readFile(kept(p, file), 'utf8'), /bogusmacro|\{1\n$/);
  }
  // cut short in the middle of an argument, which TeX blames on the main file
  const aux = await fs.readFile(kept(p, 'main.aux'), 'utf8');
  await fs.writeFile(kept(p, 'main.aux'), aux.slice(0, aux.indexOf('\\newlabel') + 20));
  const cut = await compile(p);
  assert.equal(cut.status, 0, cut.log);
  assert.match(cut.log, /compiled again from scratch/);
});

test('an ordinary error just after hyperref reads its kept file compiles once', { skip: needs('pdflatex') }, async () => {
  const doc = (body) => `\\documentclass{article}\\usepackage{hyperref}\n\\begin{document}\n${body}\n\\section{S}\\label{s} See \\ref{s}.\n\\end{document}\n`;
  const p = await newProject({ 'main.tex': doc('Text.') });
  assert.equal((await compile(p)).status, 0);
  await fs.writeFile(path.join(p.path, 'main.tex'), doc('Text \\foo.'));
  const res = await compile(p);
  assert.notEqual(res.status, 0);
  assert.doesNotMatch(res.log, /compiled again from scratch/);
});

test('Stop on first error ends after the first pass; carrying on still makes the PDF, and keeps nothing', { skip: needs('pdflatex') }, async () => {
  const p = await newProject({ 'main.tex': '\\documentclass{article}\\begin{document}\\section{A}\\label{a}\\ref{a}\\end{document}\n' });
  assert.equal((await compile(p)).status, 0);
  await fs.writeFile(path.join(p.path, 'main.tex'), '\\documentclass{article}\\begin{document}\\undefinedthing Hi \\ref{a}\\end{document}\n');
  const halted = await compile(p, { haltOnError: true });
  assert.equal(passes(halted.log), 1);
  assert.notEqual(halted.status, 0);
  const carried = await compile(p);
  assert.ok(carried.ok, carried.error);
  assert.notEqual(carried.status, 0);
  assert.ok(!existsSync(kept(p, '.complete')));
});

test('draft mode is one pass with images as boxes', { skip: needs('pdflatex') }, async () => {
  const p = await newProject({ 'main.tex': '\\documentclass{article}\\usepackage{graphicx}\\begin{document}\\includegraphics{pic}\\end{document}\n' });
  await fs.writeFile(path.join(p.path, 'pic.png'), PNG);
  const full = await compile(p);
  assert.equal(full.status, 0, full.log);
  assert.match(full.log, /pic\.png/);
  const draft = await compile(p, { draft: true, fresh: true });
  assert.ok(draft.ok, draft.log);
  assert.equal(draft.pdfPath, 'main.pdf');
  assert.equal(passes(draft.log), 1);
  assert.doesNotMatch(draft.log, /pic\.png/);
});

test('the bibliography tool can be chosen, or named in the main file', { skip: needs('pdflatex', 'bibtex', 'biber') }, async () => {
  const p = await newProject({ 'main.tex': paper(), 'refs.bib': refs });
  // Biber on a BibTeX document fails, which shows it ran
  assert.match((await compile(p, { bibTool: 'biber' })).log, /Biber failed/);
  await fs.writeFile(path.join(p.path, 'main.tex'), `% !BIB program = biber\n${paper()}`);
  assert.match((await compile(p, { fresh: true })).log, /Biber failed/);
  const bibtex = await compile(p, { bibTool: 'bibtex', fresh: true });
  assert.equal(bibtex.status, 0, bibtex.log);
  assert.match(bibtex.log, /This is BibTeX/);
});

test('makeindex and makeglossaries run when their files appear, and not again while nothing changed', { skip: needs('pdflatex', 'makeindex', 'makeglossaries') }, async () => {
  const p = await newProject({
    'main.tex': [
      '\\documentclass{article}',
      '\\usepackage{makeidx}\\makeindex',
      '\\usepackage{glossaries}\\makeglossaries',
      '\\newglossaryentry{tex}{name=TeX,description={a typesetting system}}',
      '\\begin{document}',
      'Words\\index{words} about \\gls{tex}.',
      '\\printglossaries',
      '\\printindex',
      '\\end{document}',
      ''
    ].join('\n')
  });
  const first = await compile(p);
  assert.equal(first.status, 0, first.log);
  assert.match(first.log, /This is makeindex/);
  assert.match(first.log, /makeglossaries/);
  assert.ok(existsSync(kept(p, 'main.ind')));
  assert.ok(existsSync(kept(p, 'main.gls')));
  const again = await compile(p);
  assert.equal(passes(again.log), 1);
  assert.doesNotMatch(again.log, /This is makeindex|makeglossaries/);
});

test('the acronyms’ list is kept, and a new acronym runs makeglossaries', { skip: needs('pdflatex', 'makeglossaries') }, async () => {
  const doc = (extra) => [
    '\\documentclass{article}',
    '\\usepackage[acronym]{glossaries}\\makeglossaries',
    '\\newacronym{cpu}{CPU}{central processing unit}\\newacronym{gpu}{GPU}{graphics processing unit}',
    '\\begin{document}',
    `\\printglossary[type=\\acronymtype] Uses \\gls{cpu}. ${extra}`,
    '\\end{document}',
    ''
  ].join('\n');
  const p = await newProject({ 'main.tex': doc('') });
  assert.equal((await compile(p)).status, 0);
  const again = await compile(p);
  assert.equal(passes(again.log), 1);
  assert.doesNotMatch(again.log, /makeglossaries/);
  assert.match(await fs.readFile(kept(p, 'main.acr'), 'utf8'), /glossentry\{cpu\}/);
  await fs.writeFile(path.join(p.path, 'main.tex'), doc('And \\gls{gpu}.'));
  const added = await compile(p);
  assert.match(added.log, /makeglossaries/);
  assert.match(await fs.readFile(kept(p, 'main.acr'), 'utf8'), /glossentry\{gpu\}/);
});

test('makeglossaries-lite stands in for a makeglossaries that fails, and a warning says when neither ran', { skip: WINDOWS ? 'shell scripts stand in for makeglossaries' : needs('pdflatex', 'makeglossaries-lite') }, async () => {
  const bin = path.join(tmp, 'no Perl');
  await fs.mkdir(bin);
  // MiKTeX's makeglossaries without Perl
  await fs.writeFile(path.join(bin, 'makeglossaries'), '#!/bin/sh\necho "makeglossaries: perl.exe not found"\nexit 1\n', { mode: 0o755 });
  const main = '\\documentclass{article}\\usepackage{glossaries}\\makeglossaries\\newglossaryentry{tex}{name=TeX,description={a typesetting system}}\\begin{document}\\gls{tex}\\printglossaries\\end{document}\n';
  const p = await newProject({ 'main.tex': main });
  const lite = await compile(p, { texFolder: bin });
  assert.equal(lite.status, 0, lite.log);
  assert.match(await fs.readFile(kept(p, 'main.gls'), 'utf8'), /glossentry\{tex\}/);
  assert.doesNotMatch(lite.log, /\[spectrum warning\]/);
  await fs.writeFile(path.join(bin, 'makeglossaries-lite'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const neither = await compile(p, { texFolder: bin, fresh: true });
  assert.match(neither.log, /\[spectrum warning\] makeglossaries didn’t run, so the glossaries weren’t built/);
});

test('a chapter naming its document with % !TEX root compiles the document', { skip: needs('pdflatex') }, async () => {
  const p = await newProject({
    'main.tex': '\\documentclass{article}\\begin{document}\\input{chapters/one}\\end{document}\n',
    'chapters/one.tex': '% !TEX root = ../main.tex\n\\section{One}\\label{sec:one}\n',
    'chapters/lost.tex': '% !TEX root = ../missing.tex\nText\n',
    // as Windows writes it
    'chapters/two.tex': '% !TEX root = ..\\main.tex\nText\n',
    // a document showing the comment
    'guide.tex': '\\documentclass{article}\\begin{document}\n\\begin{verbatim}\n% !TEX root = ../thesis.tex\n\\end{verbatim}\n\\end{document}\n'
  });
  const res = await runCompile({ projectId: p.id, mainFile: 'chapters/one.tex', engine: 'pdflatex' });
  assert.ok(res.ok, res.error || res.log);
  assert.equal(res.doc, 'main.tex');
  assert.equal(res.pdfPath, 'main.pdf');
  assert.ok(!existsSync(path.join(p.path, 'chapters', 'one.pdf')));
  // its labels, for Document insights
  const { labels, stale } = await documentLabels(p.path, 'main.tex');
  assert.deepEqual(labels['sec:one'], { number: '1', page: '1' });
  assert.equal(stale, false);
  const lost = await runCompile({ projectId: p.id, mainFile: 'chapters/lost.tex', engine: 'pdflatex' });
  assert.equal(lost.ok, false);
  assert.match(lost.error, /names “\.\.\/missing\.tex”/);
  assert.equal((await runCompile({ projectId: p.id, mainFile: 'chapters/two.tex', engine: 'pdflatex' })).doc, 'main.tex');
  const guide = await runCompile({ projectId: p.id, mainFile: 'guide.tex', engine: 'pdflatex' });
  assert.ok(guide.ok, guide.error || guide.log);
  assert.equal(guide.doc, 'guide.tex');
});

test('a TeX folder comes first on the PATH, and one that isn’t a folder is passed by', { skip: needs('pdflatex') }, async () => {
  const bin = path.join(tmp, 'other TeX');
  await fs.mkdir(bin);
  // a batch file on Windows, which runSpawn runs through cmd.exe
  const fake = path.join(bin, WINDOWS ? 'pdflatex.cmd' : 'pdflatex');
  await fs.writeFile(fake, WINDOWS ? '@echo the other TeX ran\r\n@exit /b 1\r\n' : '#!/bin/sh\necho "the other TeX ran"\nexit 1\n', { mode: 0o755 });
  const p = await newProject({ 'main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}\n' });
  assert.match((await compile(p, { texFolder: bin })).log, /the other TeX ran/);
  for (const texFolder of [fake, 'other TeX', path.join(tmp, 'nowhere')]) {
    const res = await compile(p, { texFolder });
    assert.equal(res.status, 0, res.log);
  }
});

test('the system check, texcount and a transfer’s compiles look in the TeX folder too', { skip: WINDOWS ? 'shell scripts stand in for TeX' : false }, async () => {
  const bin = path.join(tmp, 'folder TeX');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'texcount'), '#!/bin/sh\necho "Words in text: 42"\n', { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'pdflatex'), '#!/bin/sh\necho "the folder’s TeX ran"\nexit 1\n', { mode: 0o755 });
  const p = await newProject({ 'main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}\n' });
  const app = Fastify();
  registerSystemRoutes(app);
  const check = (await app.inject({ url: `/api/system/check?${new URLSearchParams({ texFolder: bin })}` })).json();
  await app.close();
  assert.equal(check.tools.texcount, path.join(bin, 'texcount'));
  assert.equal((await projectStats(p.path, 'main.tex', bin)).wordsInText, 42);
  const { compileResult } = await compileTarget({ targetProjectId: p.id, targetMainFile: 'main.tex', engine: 'pdflatex', texFolder: bin });
  assert.match(compileResult.log, /the folder’s TeX ran/);
});

test('latexmk never reads a project’s own latexmkrc', { skip: needs('latexmk', 'pdflatex') }, async () => {
  const p = await newProject({
    'main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}\n',
    latexmkrc: "open(my $f, '>', 'ran.txt'); close($f);\n"
  });
  for (const draft of [false, true]) {
    const res = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'latexmk', draft });
    assert.ok(res.ok, res.error || res.log);
  }
  assert.ok(!existsSync(path.join(p.path, 'ran.txt')));
});

test('latexmk carries on past an error unless told to stop, as the other engines do', { skip: needs('latexmk', 'pdflatex', 'bibtex') }, async () => {
  const p = await newProject({ 'main.tex': paper('\\undefinedthing'), 'refs.bib': refs });
  const carried = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'latexmk' });
  assert.ok(carried.ok, carried.error || carried.log);
  assert.ok(passes(carried.log) >= 2, carried.log);
  assert.match(carried.log, /This is BibTeX/);
  const halted = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'latexmk', haltOnError: true });
  assert.equal(passes(halted.log), 1);
});

test('Stop during Biber says nothing about Biber failing', { skip: WINDOWS ? 'a shell script stands in for Biber' : needs('pdflatex') }, async () => {
  const bin = path.join(tmp, 'slow Biber');
  await fs.mkdir(bin);
  const started = path.join(bin, 'started');
  await fs.writeFile(path.join(bin, 'biber'), `#!/bin/sh\ntouch "${started}"\nsleep 30\n`, { mode: 0o755 });
  const p = await newProject({
    'main.tex': '\\documentclass{article}\\usepackage{biblatex}\\addbibresource{refs.bib}\\begin{document}\\cite{Knuth1984}\\printbibliography\\end{document}\n',
    'refs.bib': refs
  });
  const run = runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex', compileId: 'stop-biber', texFolder: bin });
  while (!existsSync(started)) await new Promise((resolve) => setTimeout(resolve, 50));
  stopCompile('stop-biber');
  const res = await run;
  assert.equal(res.stopped, true);
  assert.doesNotMatch(res.log, /Biber failed/);
});

test('a checkpoint after a successful compile, when asked for and the source changed', { skip: needs('pdflatex') }, async () => {
  const p = await newProject({ 'main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}\n' });
  const first = await compile(p, { checkpoint: true });
  assert.equal(first.checkpoint.saved, true);
  assert.ok(first.checkpoint.id);
  assert.deepEqual((await compile(p, { checkpoint: true })).checkpoint, { saved: false });
  assert.equal((await compile(p)).checkpoint, undefined);
  await fs.writeFile(path.join(p.path, 'main.tex'), '\\documentclass{article}\\begin{document}\\end{document}\n');
  const failed = await compile(p, { checkpoint: true });
  assert.equal(failed.ok, false);
  assert.equal(failed.checkpoint, undefined);
});

test('Tectonic carries on past an error unless told to stop, and says the compile had errors', { skip: needs('tectonic') }, async () => {
  const p = await newProject({ 'main.tex': '\\documentclass{article}\\begin{document}\\undefinedthing Hi\\end{document}\n' });
  const carried = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'tectonic' });
  // without its packages and no connection, Tectonic can't compile anything
  if (/couldn’t|failed to|network|download/i.test(carried.log || '') && !carried.ok) return;
  assert.ok(carried.ok, carried.error || carried.log);
  assert.equal(carried.status, 1);
  const halted = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'tectonic', haltOnError: true });
  assert.equal(halted.ok, false);
});
