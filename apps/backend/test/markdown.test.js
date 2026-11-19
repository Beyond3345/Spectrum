// Markdown: pandoc's two steps, the front matter, errors traced back to the .md, and the missing and old pandoc
// refusals. The fake pandoc and TeX are scripts in a throwaway folder. Run: node --test apps/backend/test/markdown.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdirSync, mkdtempSync, realpathSync, rmSync, existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const WINDOWS = process.platform === 'win32';
const skip = WINDOWS ? 'scripts stand in for pandoc and TeX' : false;
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-markdown-')));
const realPath = process.env.PATH;
// the bundled CJK fonts where a checkout has them (node scripts/desktop.mjs fonts), else empty stand-ins of the same names
const realFonts = path.join(import.meta.dirname, '..', '..', '..', 'src-tauri', 'resources', 'fonts', 'cjk');
const haveFonts = existsSync(path.join(realFonts, 'NotoSerifSC-Regular.otf'));
const fontsDir = path.join(tmp, 'fonts');
mkdirSync(fontsDir);
for (const name of ['NotoSerifSC-Regular.otf', 'NotoSerifSC-Bold.otf', 'NotoSerifTC-Regular.otf', 'NotoSerifTC-Bold.otf']) {
  if (haveFonts) symlinkSync(path.join(realFonts, name), path.join(fontsDir, name));
  else writeFileSync(path.join(fontsDir, name), '');
}
Object.assign(process.env, {
  SPECTRUM_FONTS_DIR: fontsDir,
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject, getProjectRoot } = await import('../src/services/projectService.js');
const { runCompile, findExecutable } = await import('../src/services/compileService.js');
const { pandocPath, versionOf } = await import('../src/services/engineService.js');
const { cjkFont, cslArgs, latexDiagnostics, latexWarnings, markdownToLatex, markdownToTypst, missingGlyphs, typstCjkFont, pandocDocx, pandocWarnings, pandocErrors, parseFrontMatter, rootRelativeImages, svgsAsPdf, traceToMarkdown } = await import('../src/services/markdownService.js');

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
  "if (args.includes('--to=json')) { fs.writeFileSync(out, JSON.stringify({ 'pandoc-api-version': [1, 23, 1], meta: {}, blocks: [] })); process.exit(0); }",
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

test('a line holding the faulty command, rewrapped by pandoc, is traced, and each pass’s repeat listed once', () => {
  const source = '# One\n\nSome text here for the first paragraph.\n\nThe value is \\badcommand{x} in this\nsentence of the document.\n';
  const generated = '\\section{One}\\label{one}\n\nSome text here for the first paragraph.\n\nThe value is \\badcommand{x} in this sentence of the document.\n';
  const error = { severity: 'error', message: 'Undefined control sequence.', file: 'main.md.tex', line: 5 };
  assert.deepEqual(traceToMarkdown([error, error], generated, source, 'main.md'), [{ severity: 'error', message: 'Undefined control sequence.', file: 'main.md', line: 5, column: 1 }]);
});

test('characters a font has no letters for are one warning a font, naming them and the font, at their line', () => {
  const log = 'Missing character: There is no 本 (U+672C) in font [lmroman10-regular]:mapping=tex-text;!\nMissing character: There is no 報 (U+5831) in font [lmroman10-regular]:mapping=tex-text;!\nMissing character: There is no 本 (U+672C) in font [lmroman10-regular]:mapping=tex-text;!\nMissing character: There is no 한 (U+D55C) in font NotoSerifSC-Regular.otf/OT:script=hani;language=dflt;!\n';
  const [latin, korean, ...rest] = missingGlyphs(log, '# One\n\nIn Chinese: 本報告.\n\n한국어\n', 'main.md');
  assert.equal(rest.length, 0);
  assert.equal(latin.severity, 'warning');
  assert.equal(latin.line, 3);
  assert.match(latin.message, /^The font lmroman10-regular has no 本 報, so the PDF leaves them out\..*CJKmainfont/);
  assert.equal(korean.line, 5);
  assert.match(korean.message, /^The font NotoSerifSC-Regular\.otf has no 한, .*no Korean letters.*CJKmainfont: /);
  assert.deepEqual(missingGlyphs('All fine.\n', '', 'main.md'), []);
});

test('pandoc’s warnings are listed once, a citation with no entry at the line that cites it', () => {
  const log = '[WARNING] Citeproc: citation fig:example not found\n[WARNING] Citeproc: citation fig:example not found\n[WARNING] Something else\n';
  const source = '# One\n\nSee @fig:examples and\n@fig:example.\n';
  assert.deepEqual(pandocWarnings(log, source, 'main.md'), [
    { severity: 'warning', message: 'No entry in the bibliography for the citation @fig:example.', file: 'main.md', line: 4, column: 1 },
    { severity: 'warning', message: 'Something else', file: 'main.md' }
  ]);
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

test('the app’s default Markdown PDF engine reaches the compile, after the project’s own', { skip }, async () => {
  await bin('engine', '3.12.1');
  const { default: Fastify } = await import('fastify');
  const { registerCompileRoutes } = await import('../src/routes/compile.js');
  const { updateProjectSettings } = await import('../src/services/projectSettings.js');
  const app = Fastify();
  registerCompileRoutes(app);
  const compileWith = async (p, markdownEngine) => JSON.parse((await app.inject({ method: 'POST', url: '/api/compile', payload: { projectId: p.id, mainFile: 'main.md', engine: 'auto', markdownEngine } })).payload);
  const p = await projectWith(MARKDOWN);
  assert.equal((await compileWith(p, 'typst')).generated, 'typst');
  assert.equal((await compileWith(p, 'latex')).generated, 'latex');
  await updateProjectSettings(await getProjectRoot(p.id), (settings) => ({ ...settings, compile: { markdownEngine: 'latex' } }));
  assert.equal((await compileWith(p, 'typst')).generated, 'latex');
  assert.equal((await compileWith(p, 'word')).error, 'Invalid markdownEngine.');
  await app.close();
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

test('a pandoc new enough for LaTeX but not Typst says so, and offers LaTeX', { skip }, async () => {
  await bin('good', '3.8');
  const p = await projectWith(MARKDOWN);
  const result = await runCompile({ projectId: p.id, mainFile: 'main.md', engine: 'auto', markdownEngine: 'typst' });
  assert.equal(result.code, 'PANDOC_OLD');
  assert.match(result.error, /Typst as the PDF engine needs pandoc 3\.8\.3 or later, and this pandoc is 3\.8\..*choose LaTeX/);
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
  // APA 7 puts a book's title in sentence case
  assert.match(made.text, /The one book/);
  assert.deepEqual(parseFrontMatter('---\nbibliography: # none yet\n---\n').meta.bibliography, []);
});

test('a LaTeX project made from the .md finds the images it includes from the project, and only those', { skip: WINDOWS ? 'not on Windows' : false }, async (t) => {
  process.env.PATH = realPath;
  if (!(await pandocPath())) return t.skip('needs pandoc');
  const { default: Fastify } = await import('fastify');
  const { registerProjectRoutes } = await import('../src/routes/projects.js');
  const app = Fastify();
  registerProjectRoutes(app);
  const p = await projectWith('', { 'images/dot.png': 'not really a PNG' });
  // and an image elsewhere on this computer stays there
  const outside = path.join(tmp, 'outside');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'id_rsa.png'), 'a secret');
  const root = await getProjectRoot(p.id);
  writeFileSync(path.join(root, 'main.md'), '# Images\n\n![A dot](images/dot.png)\n\n![A secret](' + path.relative(root, outside) + '/id_rsa.png)\n');
  const res = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/export/latex`, payload: { doc: 'main.md' } });
  await app.close();
  const made = JSON.parse(res.payload);
  assert.equal(made.ok, true, res.payload);
  const dir = await getProjectRoot(made.project.id);
  const tex = await fs.readFile(path.join(dir, 'main.tex'), 'utf8');
  const image = tex.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1];
  assert.equal(image, 'images/dot.png');
  assert.ok(existsSync(path.join(dir, image)));
  const files = await fs.readdir(dir, { recursive: true });
  assert.ok(!files.some((f) => f.includes('id_rsa')), files.join(', '));
});

test('a Markdown image named from the project’s folder is found by Typst too', () => {
  const root = path.join(tmp, 'typst-images');
  for (const dir of ['figures', 'docs/figures2']) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, 'figures', 'dot.png'), 'x');
  writeFileSync(path.join(root, 'docs', 'figures2', 'near.png'), 'x');
  const text = '#image("figures/dot.png")\n#image("figures2/near.png")\n#image("missing.png")\n#image("https://x/y.png")\n';
  assert.equal(rootRelativeImages(text, root, path.join(root, 'docs')), '#image("/figures/dot.png")\n#image("/docs/figures2/near.png")\n#image("/docs/missing.png")\n#image("https://x/y.png")\n');
});

test('an SVG in pandoc’s LaTeX becomes a PDF rsvg-convert makes, and stays without it', { skip }, async () => {
  const dir = path.join(tmp, 'svg');
  mkdirSync(path.join(dir, 'media'), { recursive: true });
  writeFileSync(path.join(dir, 'media', 'pic.svg'), '<svg/>');
  const text = '\\usepackage{svg}\n\\includesvg[keepaspectratio]{media/pic.svg}\n';
  process.env.PATH = path.join(tmp, 'empty');
  assert.equal(await svgsAsPdf(text, dir), text);
  const bin = path.join(tmp, 'bin-rsvg');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'rsvg-convert'), `#!${process.execPath}\nconst a = process.argv.slice(2);\nrequire('fs').writeFileSync(a[a.indexOf('-o') + 1], '%PDF-1.4');\n`, { mode: 0o755 });
  process.env.PATH = bin;
  assert.equal(await svgsAsPdf(text, dir), '\\includegraphics[keepaspectratio]{media/pic.pdf}\n');
  assert.ok(existsSync(path.join(dir, 'media', 'pic.pdf')));
  // one outside the folder (an absolute path, another project's) keeps its \includesvg, and nothing is written beside it
  const other = path.join(tmp, 'svg-other');
  mkdirSync(other, { recursive: true });
  writeFileSync(path.join(other, 'pic.svg'), '<svg/>');
  writeFileSync(path.join(other, 'pic.pdf'), 'theirs');
  const outside = `\\includesvg{${path.join(other, 'pic.svg')}}\n\\includesvg{../svg-other/pic.svg}\n`;
  assert.equal(await svgsAsPdf(outside, dir), outside);
  assert.equal(readFileSync(path.join(other, 'pic.pdf'), 'utf8'), 'theirs');
});

test('a Word document from a .md in a folder finds images named from the project’s folder', { skip: WINDOWS ? 'not on Windows' : false }, async (t) => {
  process.env.PATH = realPath;
  if (!(await pandocPath())) return t.skip('needs pandoc');
  const root = path.join(tmp, 'docx');
  mkdirSync(path.join(root, 'figures'), { recursive: true });
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, 'figures', 'dot.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  writeFileSync(path.join(root, 'docs', 'a.md'), '# Word\n\n![A dot](figures/dot.png)\n');
  const output = path.join(root, 'docs', 'a.docx');
  assert.equal((await pandocDocx(root, path.join(root, 'docs', 'a.md'), output)).ok, true);
  assert.match((await fs.readFile(output)).toString('latin1'), /word\/media\//);
});

test('Word and the LaTeX compile take only the project’s images, never a file elsewhere or a URL', { skip: WINDOWS ? 'not on Windows' : false }, async (t) => {
  process.env.PATH = realPath;
  if (!(await pandocPath())) return t.skip('needs pandoc');
  const root = path.join(tmp, 'vetted');
  const outside = path.join(tmp, 'vetted-outside');
  for (const dir of [path.join(root, 'figures'), outside]) mkdirSync(dir, { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  writeFileSync(path.join(root, 'figures', 'dot.png'), png);
  // a key file that is a valid PNG, so pandoc would gladly embed it
  writeFileSync(path.join(outside, 'id_rsa.png'), Buffer.concat([png, Buffer.from('SECRET-KEY-BYTES')]));
  writeFileSync(path.join(root, 'main.md'), `# Images\n\n![A dot](figures/dot.png)\n\n![Key](../vetted-outside/id_rsa.png)\n\n![Absolute](${path.join(outside, 'id_rsa.png')})\n\n![Remote](http://127.0.0.1:9/x.png)\n`);
  const output = path.join(root, 'main.docx');
  const made = await pandocDocx(root, path.join(root, 'main.md'), output);
  assert.equal(made.ok, true, made.log);
  const { default: unzipper } = await import('unzipper');
  const media = (await unzipper.Open.file(output)).files.filter((f) => f.path.startsWith('word/media/'));
  assert.equal(media.length, 1, media.map((f) => f.path).join(', '));
  assert.ok(!(await media[0].buffer()).includes('SECRET-KEY-BYTES'));
  const generatedDir = path.join(tmp, 'vetted-generated');
  const latex = await markdownToLatex({ projectRoot: root, absMain: path.join(root, 'main.md'), mainFile: 'main.md', generatedDir });
  assert.equal(latex.ok, true, latex.error || latex.log);
  assert.equal(latex.text.match(/\\includegraphics/g)?.length, 1, latex.text);
  assert.ok(!latex.text.includes('id_rsa') && !latex.text.includes('127.0.0.1'), latex.text);
  const copied = await fs.readdir(generatedDir, { recursive: true });
  assert.ok(!copied.some((f) => f.includes('id_rsa')), copied.join(', '));
});

test('a TeX error in a generated file whose name has a space is still placed', () => {
  assert.deepEqual(latexDiagnostics('./my notes.md.tex:5: Undefined control sequence.\n', 'my notes.md.tex'), [{ severity: 'error', message: 'Undefined control sequence.', file: 'my notes.md.tex', line: 5 }]);
});

test('a YAML error is placed once, at the line pandoc gives in the .md', () => {
  const log = 'Error parsing YAML metadata at "main.md" (line 5, column 1):\nYAML parse exception at line 2, column 6,\nwhile parsing a flow sequence:\n';
  assert.deepEqual(pandocErrors(log, 'main.md').map((e) => [e.line, e.column]), [[5, 1]]);
});

test('pandoc gets the bundled APA 7 style unless the front matter names one', () => {
  const [flag, file] = cslArgs({});
  assert.equal(flag, '--csl');
  assert.match(readFileSync(file, 'utf8'), /<title>APA Style 7th edition<\/title>/);
  assert.deepEqual(cslArgs({ csl: 'ieee.csl' }), []);
  assert.deepEqual(cslArgs({ 'citation-style': 'chicago.csl' }), []);
});

test('CJK text gets the bundled font: Simplified (or mixed) Noto Serif SC, Traditional TC, the front matter’s own font winning', () => {
  assert.equal(cjkFont('本報告比較三棟建築。这份报告比较了。', {})?.id, 'noto-serif-sc');
  assert.equal(cjkFont('本報告比較三棟建築的用水量。', {})?.id, 'noto-serif-tc');
  assert.equal(cjkFont('三人水木', { lang: 'zh-Hant' })?.id, 'noto-serif-tc');
  assert.equal(cjkFont('日本語の文章です。', {})?.id, 'noto-serif-sc');
  assert.equal(cjkFont('本報告', { CJKmainfont: 'Songti TC' }), null);
  assert.equal(cjkFont('本報告', { mainfont: 'Hiragino Mincho ProN' }), null);
  assert.equal(cjkFont('Only English here.', {}), null);
  assert.equal(typstCjkFont('Only English here.', {}), '');
  assert.match(typstCjkFont('本報告', {}), /^#show regex\("\[\\p\{Han\}.*set text\(font: "Noto Serif TC"\)\n$/);
  assert.match(typstCjkFont('本報告', { CJKmainfont: 'Songti TC' }), /font: "Songti TC"/);
});

test('LaTeX’s warnings from the last pass, at their generated line, and errors TeX writes without a file', () => {
  const pass = (ref) => [
    'This is XeTeX, Version 3.141592653-2.6-0.999998 (TeX Live 2026) (preloaded format=xelatex)',
    `LaTeX Warning: Reference \`${ref}' on page 1 undefined on input line 103.`,
    'Package natbib Warning: Citation `x\' on page 1 undefined on input line',
    '(natbib)                 7.',
    'Overfull \\hbox (12.5pt too wide) in paragraph at lines 108--109',
    '! File ended while scanning use of \\frac.',
    '<inserted text>',
    'l.110 ',
    'warning: main.md.tex:111: Something Tectonic located',
    'warning: accessing absolute path `/x`; build may not be reproducible',
    'Transcript written on main.md.log.'
  ].join('\n');
  assert.deepEqual(latexWarnings(pass('stale') + '\n' + pass('fig:none')), [
    { severity: 'warning', message: 'Reference `fig:none\' on page 1 undefined.', line: 103 },
    { severity: 'warning', message: 'Citation `x\' on page 1 undefined.', line: 7 },
    { severity: 'warning', message: 'Overfull \\hbox (12.5pt too wide)', line: 108 },
    { severity: 'error', message: 'File ended while scanning use of \\frac.', line: 110 },
    { severity: 'warning', message: 'Something Tectonic located', line: 111 }
  ]);
});

test('a .md with Chinese prints it in the bundled font and cites in APA 7, through pdfLaTeX’s place too', { skip: WINDOWS ? 'not on Windows' : false }, async (t) => {
  process.env.PATH = realPath;
  if (!haveFonts) return t.skip('needs the bundled fonts (node scripts/desktop.mjs fonts)');
  if (!(await pandocPath()) || !(await findExecutable('xelatex'))) return t.skip('needs pandoc and XeLaTeX');
  const p = await projectWith('---\ntitle: 用水\n---\n\n# Heading\n\n本報告比較三棟建築的用水量 [@jones].\n\nSee Figure \\ref{fig:none} for the meters in this building.\n', {
    'refs.bib': '@book{jones, author = {Jones, Peter}, title = {Building Services}, publisher = {Campus Press}, year = {2019}}\n'
  });
  const result = await runCompile({ projectId: p.id, mainFile: 'main.md', engine: 'pdflatex' });
  assert.equal(result.ok, true, result.error || result.log);
  assert.equal(result.engine, 'xelatex');
  assert.match(result.log, /This compile used XeLaTeX/);
  assert.doesNotMatch(result.log, /Missing character/);
  const reference = result.errors.find((e) => /fig:none/.test(e.message));
  assert.equal(reference?.line, 9);
  const tex = await fs.readFile(path.join(process.env.SPECTRUM_DATA_DIR, 'cache', p.id, 'generated', 'main.md.tex'), 'utf8');
  assert.match(tex, /\\setCJKmainfont\[BoldFont=NotoSerifTC-Bold\.otf\]\{NotoSerifTC-Regular\.otf\}/);
  assert.match(tex, /Jones, P\. \(2019\)\. \\emph\{Building services\}/);
});
