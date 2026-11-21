// A document's own build recipe and engine options (buildRecipe.js): what an untrusted project gets, and that every
// step runs in the compile's confinement. Shell scripts stand in for pdflatex and makeindex, as in
// compile-sandbox.test.js; the last test uses the TeX installed here. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAC = process.platform === 'darwin';
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-recipe-')));
const realPath = process.env.PATH;
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  OUTSIDE_FILE: path.join(tmp, 'outside', 'written.txt')
});
await fs.mkdir(path.join(tmp, 'outside'), { recursive: true });
const { documentRecipe } = await import('../src/services/buildRecipe.js');
const { createProject } = await import('../src/services/projectService.js');
const { findExecutable, runCompile } = await import('../src/services/compileService.js');
const { setTrusted } = await import('../src/services/trustService.js');
const realPdflatex = await findExecutable('pdflatex');

after(() => {
  process.env.PATH = realPath;
  rmSync(tmp, { recursive: true, force: true });
});

const recipe = (line, more) => documentRecipe(`% !TEX recipe = ${line}\n\\documentclass{article}`, more);
const CONFINED = { confined: true };

test('no comments: Spectrum’s own passes, nothing to say', () => {
  assert.deepEqual(documentRecipe('\\documentclass{article}', CONFINED), { steps: null, options: [], warning: '' });
});

test('a recipe’s steps and options are read as written', () => {
  const tex = '% !TEX options = -8bit\n%  !TEX recipe = pdflatex ; pythontex %DOC% ;makeindex -s style.ist %DOC%; pdflatex\n';
  assert.deepEqual(documentRecipe(tex, CONFINED), {
    steps: [{ program: 'pdflatex', args: [] }, { program: 'pythontex', args: ['%DOC%'] }, { program: 'makeindex', args: ['-s', 'style.ist', '%DOC%'] }, { program: 'pdflatex', args: [] }],
    options: ['-8bit'],
    warning: ''
  });
});

test('an untrusted project gets TeX’s own programs and safe options, never shell escape', () => {
  for (const line of ['pdflatex -shell-escape', 'pdflatex --shell-escape', 'pdflatex -enable-write18', 'pdflatex -cnf-line=shell_escape=t', 'xelatex -output-driver=sh', 'lualatex --lua=start.lua', 'pdflatex -jobname=other', 'pdflatex; pythontex --shell %DOC%']) {
    const { steps, warning } = recipe(line, CONFINED);
    assert.equal(steps, null, line);
    assert.match(warning, /only a trusted project gets.*Trust this project.*Spectrum’s own passes instead/, line);
  }
  const other = recipe('pdflatex; python3 figures.py; pdflatex', CONFINED);
  assert.equal(other.steps, null);
  assert.match(other.warning, /runs “python3”, which Spectrum runs only for a trusted project/);
  const flags = documentRecipe('% !TEX options = -8bit -shell-escape -recorder', CONFINED);
  assert.deepEqual(flags.options, ['-8bit', '-recorder']);
  assert.match(flags.warning, /asks for “-shell-escape”, which only a trusted project gets, so it was left out/);
});

test('where compiles aren’t confined (Windows), only a trusted project runs a recipe', () => {
  const { steps, warning } = recipe('pdflatex; makeindex %DOC%; pdflatex', { confined: false });
  assert.equal(steps, null);
  assert.match(warning, /runs only in a trusted project on this computer, whose compiles aren’t confined/);
  assert.equal(recipe('pdflatex; makeindex %DOC%; pdflatex', { confined: false, trusted: true }).steps.length, 3);
});

test('a trusted project runs any program by its name, never by a path', () => {
  assert.deepEqual(recipe('pdflatex -shell-escape; python3 %DIR%/figures.py; pdflatex', { trusted: true }).steps[1], { program: 'python3', args: ['%DIR%/figures.py'] });
  for (const line of ['/bin/sh -c x; pdflatex', '../tool; pdflatex', 'C:\\tool.exe; pdflatex']) assert.match(recipe(line, { trusted: true }).warning, /isn’t a program’s name/, line);
  assert.match(recipe('makeindex %DOC%', { trusted: true }).warning, /needs a pdflatex, xelatex or lualatex step/);
  assert.match(recipe(Array(21).fill('pdflatex').join(';'), { trusted: true }).warning, /between 1 and 20 steps/);
});

// shell scripts as pdflatex and makeindex: each prints its arguments and tries to write outside its build folder
const FAKE = (name, makes) => ['#!/bin/sh', `echo "${name} ARGS $*"`, 'echo x > "$OUTSIDE_FILE"', ...makes, ''].join('\n');
const ENGINE = FAKE('pdflatex', ['for a in "$@"; do case "$a" in -output-directory=*) out="${a#-output-directory=}";; esac; done', 'echo "This is fake TeX" > "$out/main.log"', "printf '%%PDF-1.4\\n%%%%EOF\\n' > \"$out/main.pdf\""]);
const project = async (name, tex) => {
  const bin = path.join(tmp, 'bin');
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(path.join(bin, 'pdflatex'), ENGINE, { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'makeindex'), FAKE('makeindex', []), { mode: 0o755 });
  process.env.PATH = [bin, '/usr/bin', '/bin'].join(path.delimiter);
  return createProject({ name, populate: (root) => fs.writeFile(path.join(root, 'main.tex'), tex) });
};

test('every step runs in the compile’s confinement until the project is trusted', { skip: !MAC && 'compiles are confined on macOS only' }, async () => {
  const p = await project('Recipe', '% !TEX options = -8bit\n% !TEX recipe = pdflatex -recorder; makeindex -q %DOC%; pdflatex\n\\documentclass{article}\\begin{document}x\\end{document}\n');
  await fs.rm(process.env.OUTSIDE_FILE, { force: true });
  const confined = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex' });
  assert.ok(confined.ok, confined.error || confined.log);
  // the steps in order, Spectrum's own passes not run, the options where they belong
  assert.deepEqual(confined.log.match(/^\[spectrum note\] Recipe: .*$/gm), ['[spectrum note] Recipe: pdflatex -recorder', '[spectrum note] Recipe: makeindex -q main', '[spectrum note] Recipe: pdflatex']);
  const runs = confined.log.match(/^(?:pdflatex|makeindex) ARGS .*$/gm);
  assert.equal(runs.length, 3);
  assert.match(runs[0], /-shell-restricted .*-8bit -recorder \.\/main\.tex$/);
  assert.equal(runs[1], 'makeindex ARGS -q main');
  assert.match(runs[2], /-shell-restricted .*-8bit \.\/main\.tex$/);
  assert.equal(existsSync(process.env.OUTSIDE_FILE), false, 'no step wrote outside its build folder');
  assert.match(confined.log, /Spectrum’s sandbox stopped this compile/);

  await setTrusted(p.id, p.path, true);
  const trusted = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex' });
  assert.ok(trusted.ok, trusted.error || trusted.log);
  assert.match(trusted.log, /pdflatex ARGS .*-shell-escape/);
  assert.ok(existsSync(process.env.OUTSIDE_FILE), 'a trusted project’s steps run unconfined');
});

test('a step an untrusted project may not run leaves the document to Spectrum’s own passes', { skip: !MAC && 'compiles are confined on macOS only' }, async () => {
  const p = await project('Refused', '% !TEX recipe = pdflatex -shell-escape; pdflatex\n\\documentclass{article}\\begin{document}x\\end{document}\n');
  const result = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex' });
  assert.ok(result.ok, result.error);
  assert.doesNotMatch(result.log, /Recipe:|ARGS .*-shell-escape/);
  assert.match(result.log, /\[spectrum warning\] The “% !TEX recipe” line asks for “-shell-escape”/);
});

test('with TeX: a one-pass recipe is one pass, so a reference stays unresolved; two resolve it in the PDF', { skip: !realPdflatex && 'needs pdflatex', timeout: 120_000 }, async () => {
  process.env.PATH = realPath;
  // uncompressed, so the PDF's text can be read: an unresolved \ref prints ?? there
  const body = '\\pdfcompresslevel=0\n\\documentclass{article}\\begin{document}\\section{A}\\label{a} See Section~\\ref{a}.\\end{document}\n';
  const p = await createProject({ name: 'One pass', populate: (root) => fs.writeFile(path.join(root, 'main.tex'), `% !TEX recipe = pdflatex\n${body}`) });
  const once = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex' });
  assert.ok(once.ok, once.error || once.log);
  assert.equal(once.log.match(/\[spectrum note\] Recipe:/g).length, 1);
  assert.match(once.log, /There were undefined references|Reference `a' on page 1 undefined/);
  assert.match(Buffer.from(once.pdf, 'base64').toString('latin1'), /\(\?\?\)/);
  await fs.writeFile(path.join(p.path, 'main.tex'), `% !TEX recipe = pdflatex; pdflatex\n${body}`);
  const twice = await runCompile({ projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex' });
  assert.ok(twice.ok, twice.error || twice.log);
  assert.equal(twice.log.match(/\[spectrum note\] Recipe:/g).length, 2);
  assert.equal(twice.log.match(/^This is pdfTeX, Version/gm).length, 2, 'both steps ran');
  assert.doesNotMatch(twice.log.split('[spectrum note] Recipe:').pop(), /undefined references/);
  // the second step read the first's .aux: the reference is resolved in the PDF itself
  assert.doesNotMatch(Buffer.from(twice.pdf, 'base64').toString('latin1'), /\?\?/);
  assert.doesNotMatch(twice.log, /^\[spectrum\] /m, 'nothing the editor lists as an error');
});
