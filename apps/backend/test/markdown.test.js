// Markdown: pandoc's two steps, the front matter, errors traced back to the .md, and the missing and old pandoc
// refusals. The fake pandoc and TeX are scripts in a throwaway folder. Run: node --test apps/backend/test/markdown.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const WINDOWS = process.platform === 'win32';
const skip = WINDOWS ? 'scripts stand in for pandoc and TeX' : false;
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-markdown-')));
const realPath = process.env.PATH;
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject, getProjectRoot } = await import('../src/services/projectService.js');
const { runCompile, findExecutable } = await import('../src/services/compileService.js');
const { pandocPath, versionOf } = await import('../src/services/engineService.js');
const { markdownToLatex, parseFrontMatter, traceToMarkdown } = await import('../src/services/markdownService.js');

after(() => {
  process.env.PATH = realPath;
  rmSync(tmp, { recursive: true, force: true });
});

const MARKDOWN = [
  '---',
  'title: A test article',
  'author: Someone',
  'bibliography: refs.bib',
  '---',
  '',
  '# Title',
  '',
  'The line that fails here.',
  ''
].join('\n');

// Writes the LaTeX the real pandoc would, and answers --version
const PANDOC = (version) => [
  '#!' + process.execPath,
  "const fs = require('fs');",
  "const path = require('path');",
  'const args = process.argv.slice(2);',
  "if (args[0] === '--version') { console.log('pandoc " + version + "'); process.exit(0); }",
  "const at = args.indexOf('-o');",
  'if (at === -1) process.exit(2);',
  'const out = args[at + 1];',
  'const bs = String.fromCharCode(92);',
  'fs.mkdirSync(path.dirname(out), { recursive: true });',
  "fs.writeFileSync(out, ['', bs + 'documentclass{article}', bs + 'begin{document}', bs + 'section{Title}', 'The line that fails here.', bs + 'end{document}', ''].join(String.fromCharCode(10)));",
  ''
].join('\n');

// Writes the PDF and the log of a run that found an error on line 4 of the generated file
const TEX = [
  '#!' + process.execPath,
  "const fs = require('fs');",
  "const path = require('path');",
  'const args = process.argv.slice(2);',
  "let out = '';",
  'for (let i = 0; i < args.length; i += 1) {',
  "  if (args[i].startsWith('-output-directory=')) out = args[i].slice('-output-directory='.length);",
  '}',
  'const input = args[args.length - 1];',
  "console.log('FAKE TEX SAW ' + input);",
  "console.log('./main.md.tex:5: Undefined control sequence.');",
  'fs.mkdirSync(out, { recursive: true });',
  "fs.writeFileSync(path.join(out, 'main.md.log'), ['This is pdfTeX, Version 3.14 (fake)', './main.md.tex:5: Undefined control sequence.', 'Transcript written on main.md.log.', ''].join(String.fromCharCode(10)));",
  "fs.writeFileSync(path.join(out, 'main.md.pdf'), '%PDF-1.4' + String.fromCharCode(10));",
  'process.exit(1);',
  ''
].join('\n');

const bin = async (name, pandocVersion) => {
  const dir = path.join(tmp, 'bin-' + name);
  await fs.mkdir(dir, { recursive: true });
  if (pandocVersion) await fs.writeFile(path.join(dir, 'pandoc'), PANDOC(pandocVersion), { mode: 0o755 });
  await fs.writeFile(path.join(dir, 'pdflatex'), TEX, { mode: 0o755 });
  process.env.PATH = dir;
  return dir;
};
const projectWith = (source, extra = {}) => createProject({
  name: 'Markdown',
  meta: { mainFile: 'main.md' },
  populate: async (root) => {
    await fs.writeFile(path.join(root, 'main.md'), source);
    for (const [rel, text] of Object.entries(extra)) {
      await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await fs.writeFile(path.join(root, rel), text);
    }
  }
});
const compile = (p) => runCompile({ projectId: p.id, mainFile: 'main.md', engine: 'auto' });

test('front matter fields and lists are read, and the body follows', () => {
  const { meta, body } = parseFrontMatter('---\ntitle: A title\nbibliography:\n  - refs.bib\n  - more.bib\n---\n# Body\n');
  assert.equal(meta.title, 'A title');
  assert.deepEqual(meta.bibliography, ['refs.bib', 'more.bib']);
  assert.equal(body, '# Body\n');
});

test('generated lines are traced back to their .md lines', () => {
  const source = '# Title\n\nA first paragraph.\n\nThe line that fails here.\n';
  const traced = traceToMarkdown([{ severity: 'error', message: 'Undefined control sequence.', file: 'main.md.tex', line: 3 }], 'first\nsecond\nThe line that fails here.\n', source, 'main.md');
  assert.deepEqual(traced, [{ severity: 'error', message: 'Undefined control sequence.', file: 'main.md', line: 5, column: 1 }]);
});

test('pandoc writes LaTeX, TeX compiles it, and the PDF lands beside the .md', { skip }, async () => {
  await bin('good', '3.12.1');
  const p = await projectWith(MARKDOWN, { 'refs.bib': '@book{knuth, author = {Knuth, Donald}, title = {The TeXbook}, year = {1984}}\n' });
  const result = await compile(p);
  assert.equal(result.ok, true, result.error || result.log);
  assert.equal(result.generated, 'latex');
  assert.equal(result.pdfPath, 'main.pdf');
  assert.match(result.log, /FAKE TEX SAW \.\/main\.md\.tex/);
  const dir = await getProjectRoot(p.id);
  assert.ok(existsSync(path.join(dir, 'main.pdf')));
  const generated = path.join(process.env.SPECTRUM_DATA_DIR, 'cache', p.id, 'generated', 'main.md.tex');
  assert.ok(existsSync(generated));
});

test('a TeX error names the right line in the .md', { skip }, async () => {
  await bin('error', '3.12.1');
  const p = await projectWith(MARKDOWN);
  const result = await compile(p);
  const error = (result.errors || []).find((e) => e.severity === 'error');
  assert.ok(error, result.log);
  assert.equal(error.file, 'main.md');
  assert.equal(error.line, 9);
  assert.match(error.message, /Undefined control sequence/);
});

test('a missing pandoc is refused before anything runs', { skip }, async () => {
  process.env.PATH = path.join(tmp, 'empty');
  await fs.mkdir(process.env.PATH, { recursive: true });
  const p = await projectWith(MARKDOWN);
  const result = await compile(p);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PANDOC_MISSING');
  assert.match(result.error, /Download it from Settings › Engines › Markdown/);
});

test('an old pandoc is refused with the version to download', { skip }, async () => {
  await bin('old', '3.0.1');
  const p = await projectWith(MARKDOWN);
  const result = await compile(p);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PANDOC_OLD');
  assert.match(result.error, /This pandoc \(3\.0\.1\) is too old/);
  assert.match(result.error, /pandoc 3\.12\.1/);
});

test('real pandoc and real TeX compile an article with a citation', { skip: WINDOWS ? 'not on Windows' : false }, async (t) => {
  process.env.PATH = realPath;
  const pandoc = await pandocPath();
  const version = pandoc && (await versionOf(pandoc));
  if (!pandoc || !version || Number(version.split('.')[0]) < 3 || (Number(version.split('.')[0]) === 3 && Number(version.split('.')[1]) < 1)) return t.skip('needs pandoc 3.1 or later');
  const tex = (await findExecutable('pdflatex')) || (await findExecutable('xelatex')) || (await findExecutable('lualatex'));
  if (!tex) return t.skip('needs a TeX installation');
  const p = await projectWith('---\ntitle: A citation\nbibliography: refs.bib\n---\n\n# Heading\n\nKnuth wrote the TeXbook [@knuth].\n', {
    'refs.bib': '@book{knuth, author = {Knuth, Donald}, title = {The TeXbook}, publisher = {Addison-Wesley}, year = {1984}}\n'
  });
  const result = await compile(p);
  assert.equal(result.ok, true, result.error || result.log);
  assert.equal(result.generated, 'latex');
  const dir = await getProjectRoot(p.id);
  assert.ok(existsSync(path.join(dir, 'main.pdf')));
});

test('a bibliography the front matter names with a YAML comment still resolves', { skip: WINDOWS ? 'not on Windows' : false }, async (t) => {
  process.env.PATH = realPath;
  if (!(await pandocPath())) return t.skip('needs pandoc');
  const dir = path.join(tmp, 'yaml-comment');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'refs.bib'), '@book{one, title = {The One Book}, author = {Writer, A.}, year = {2026}}\n');
  await fs.writeFile(path.join(dir, 'other.bib'), '@book{two, title = {Not Named}, author = {Else, B.}, year = {2026}}\n');
  const absMain = path.join(dir, 'main.md');
  await fs.writeFile(absMain, '---\ntitle: Test\nbibliography: refs.bib # Sources\n---\n\nCite [@one].\n');
  const made = await markdownToLatex({ projectRoot: dir, absMain, mainFile: 'main.md', generatedDir: path.join(dir, 'generated') });
  assert.equal(made.ok, true, made.error || made.log);
  assert.match(made.text, /The One Book/);
  assert.deepEqual(parseFrontMatter('---\nbibliography: # none yet\n---\n').meta.bibliography, []);
});

test('a LaTeX project made from the .md finds the images pandoc extracted', { skip: WINDOWS ? 'not on Windows' : false }, async (t) => {
  process.env.PATH = realPath;
  if (!(await pandocPath())) return t.skip('needs pandoc');
  const { default: Fastify } = await import('fastify');
  const { registerProjectRoutes } = await import('../src/routes/projects.js');
  const app = Fastify();
  registerProjectRoutes(app);
  const p = await projectWith('# Images\n\n![A dot](images/dot.png)\n', { 'images/dot.png': 'not really a PNG' });
  const res = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/export/latex`, payload: { doc: 'main.md' } });
  await app.close();
  const made = JSON.parse(res.payload);
  assert.equal(made.ok, true, res.payload);
  const dir = await getProjectRoot(made.project.id);
  const tex = await fs.readFile(path.join(dir, 'main.tex'), 'utf8');
  const image = tex.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1];
  assert.equal(image, 'media/images/dot.png');
  assert.ok(existsSync(path.join(dir, image)));
});
