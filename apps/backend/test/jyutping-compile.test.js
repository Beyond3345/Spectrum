// Jyutping (xjyutping) in real compiles: auto mode's copy with XeLaTeX and LuaLaTeX, the readings it gives, Spectrum's
// own package winning over an installed one, the log and SyncTeX naming the project's files, the engine a document
// that loads xjyutping gets, and the bundled fonts by file name in Tectonic. Engines, packages or fonts that aren't
// here are skipped (node scripts/desktop.mjs fonts fetches the fonts). Run: node --test apps/backend/test/jyutping-compile.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-jyutping-')));
process.env.SPECTRUM_DATA_DIR = path.join(tmp, 'data');
process.env.SPECTRUM_PROJECTS_DIR = path.join(tmp, 'projects');
const { findExecutable, runCompile, compileFolder } = await import('../src/services/compileService.js');
const { createProject } = await import('../src/services/projectService.js');
const { updateProjectSettings } = await import('../src/services/projectSettings.js');
const { synctexEdit, synctexView } = await import('../src/services/synctex.js');
const { TEX_DIR, CJK_FONTS_DIR } = await import('../src/config/constants.js');
after(() => rmSync(tmp, { recursive: true, force: true }));

const run = promisify(execFile);
const kpsewhich = await findExecutable('kpsewhich');
const has = async (file) => !!kpsewhich && (await run(kpsewhich, [file]).then(({ stdout }) => !!stdout.trim(), () => false));
const engines = {
  xelatex: (await findExecutable('xelatex')) && (await has('xeCJK.sty')),
  lualatex: (await findExecutable('lualatex')) && (await has('luatexja-fontspec.sty')),
  tectonic: await findExecutable('tectonic')
};
const fonts = existsSync(path.join(CJK_FONTS_DIR, 'NotoSerifTC-Regular.otf'));
const SLOW = process.platform === 'win32' ? 3 : 1;
const skipFor = (engine) => (!engines[engine] ? `needs ${engine} with its CJK package` : !fonts ? 'needs the bundled fonts (node scripts/desktop.mjs fonts)' : false);

// xjyutping's debug log goes to the log file only; here to the terminal too, which the compile's log is
const TERMINAL = '\\ExplSyntaxOn\\cs_gset_protected:Npn\\iow_log:e#1{\\iow_term:e{#1}}\\ExplSyntaxOff';
const MAIN = [
  '\\documentclass{article}',
  TERMINAL,
  '\\begin{document}',
  '我哋去銀行。',
  '',
  '\\begin{verbatim}',
  'verbatim 行 { stays',
  '\\end{verbatim}',
  'Some \\verb|50%| text.',
  '\\input{chapters/one}',
  '校長喺學校長大。',
  '\\end{document}',
  ''
].join('\n');
const CHAPTER = ['\\section{一章}', '行路返屋企。', ''].join('\n');

async function project(name, files, jyutping) {
  const made = await createProject({
    name,
    parentDir: path.join(tmp, 'projects'),
    populate: async (root) => {
      for (const [file, text] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await fs.writeFile(path.join(root, file), text);
      }
    }
  });
  if (jyutping) await updateProjectSettings(made.path, (settings) => ({ ...settings, jyutping }));
  return made;
}

// the log as one line: TeX breaks it every 79 characters, wherever that falls
const flat = (log) => log.replace(/\r?\n/g, '');

for (const engine of ['xelatex', 'lualatex']) {
  test(`${engine}: auto mode reads 銀行 and 行路 with Spectrum’s xjyutping, and the log and SyncTeX name the project’s files`, { skip: skipFor(engine), timeout: 300000 * SLOW }, async () => {
    const made = await project(`auto-${engine}`, { 'main.tex': MAIN, 'chapters/one.tex': CHAPTER }, { mode: 'auto', options: { debug: true }, cjkFont: 'bundled:noto-serif-tc' });
    const res = await runCompile({ projectId: made.id, mainFile: 'main.tex', engine });
    assert.ok(res.ok && res.status === 0, res.error || res.log);
    assert.equal(res.engine, engine);
    const log = flat(res.log);
    assert.match(log, /銀ngan4:w行hong4:w/);
    assert.match(log, /行haang4:w路lou6:w/);
    assert.match(log, /校haau6:w長zoeng2:w/);
    // the package that was loaded is Spectrum's, though TeX may have one of its own
    const sty = log.match(/\(([^()]*?xjyutping\.sty)/)?.[1];
    assert.equal(path.resolve(sty), path.join(TEX_DIR, 'xjyutping', 'xjyutping.sty'));
    // the copy's paths aren't in the log (it's in the cache, and gone): the project's are
    assert.ok(!log.includes(path.join(tmp, 'data', 'cache').split(path.sep).join('/')), 'no path of the copy');
    assert.deepEqual(await fs.readdir(path.join(tmp, 'data', 'cache', made.id, 'jyutping')), []);
    // MiKTeX joins a search folder and a file with \, as in tex/latex/base\article.cls
    assert.ok(log.replace(/\\(?=chapters\/)/g, '/').includes(`${made.path.split(path.sep).join('/')}/chapters/one.tex`), 'the chapter by its path in the project');
    // the source is as it was, and the PDF is beside it
    assert.equal(await fs.readFile(path.join(made.path, 'main.tex'), 'utf8'), MAIN);
    assert.ok(existsSync(path.join(made.path, 'main.pdf')));
    // SyncTeX both ways, in the project's files
    const view = await synctexView(made.path, 'main.tex', 'chapters/one.tex', 2);
    assert.ok(view.ok, view.error);
    const box = view.boxes[0];
    const edit = await synctexEdit(made.path, 'main.tex', box.page, box.x + box.width / 2, box.y + box.height / 2);
    assert.deepEqual([edit.ok, edit.file, edit.line], [true, 'chapters/one.tex', 2]);
    const main = await synctexView(made.path, 'main.tex', 'main.tex', 11);
    assert.ok(main.ok, main.error);
  });
}

// TeX reads a scope whole before typesetting it, so an error in it is reported on the line that ends the scope
test('an error in auto mode’s copy points at the project’s file, on the line that ends its paragraph', { skip: skipFor('xelatex'), timeout: 300000 * SLOW }, async () => {
  const made = await project('auto-error', { 'main.tex': MAIN, 'chapters/one.tex': '\\section{一章}\n行路\\undefinedcommand 返屋企。\n' }, { mode: 'auto' });
  const res = await runCompile({ projectId: made.id, mainFile: 'main.tex', engine: 'xelatex' });
  const root = made.path.split(path.sep).join('/');
  assert.ok(flat(res.log).replace(/\\(?=chapters\/)/g, '/').includes(`${root}/chapters/one.tex:2: Undefined control sequence`), res.log);
});

test('auto mode compiles \\include’d chapters and a beamer deck with a fragile frame', { skip: skipFor('xelatex'), timeout: 300000 * SLOW }, async () => {
  const book = ['\\documentclass{report}', TERMINAL, '\\begin{document}', '前言', '\\include{chapters/one}', '\\include{chapters/two}', '\\end{document}', ''].join('\n');
  const made = await project('include', { 'main.tex': book, 'chapters/one.tex': CHAPTER, 'chapters/two.tex': '\\chapter{二}\n校長喺學校長大。\n' }, { mode: 'auto', options: { debug: true } });
  const res = await runCompile({ projectId: made.id, mainFile: 'main.tex', engine: 'auto' });
  assert.ok(res.ok && res.status === 0, res.error || res.log);
  assert.match(flat(res.log), /行haang4:w路lou6:w/);
  assert.match(flat(res.log), /校haau6:w長zoeng2:w/);
  const deck = ['\\documentclass{beamer}', '\\begin{document}', '\\begin{frame}{標題}', '銀行', '\\begin{itemize}', '\\item<2-> 行路', '\\end{itemize}', '\\end{frame}',
    '\\begin{frame}[fragile]', '\\begin{verbatim}', 'x % y', '\\end{verbatim}', '\\end{frame}', '\\end{document}', ''].join('\n');
  const slides = await project('beamer', { 'main.tex': deck }, { mode: 'auto' });
  const shown = await runCompile({ projectId: slides.id, mainFile: 'main.tex', engine: 'auto' });
  assert.ok(shown.ok && shown.status === 0, shown.error || shown.log);
});

test('a document that loads xjyutping compiles with XeLaTeX when the project says pdfLaTeX, and the log says so', { skip: skipFor('xelatex'), timeout: 300000 * SLOW }, async () => {
  const doc = ['\\documentclass{article}', '\\usepackage{xeCJK}', '\\setCJKmainfont{NotoSansTC-Regular.otf}', '\\usepackage{xjyutping}', '\\begin{document}', '\\begin{jyutpingscope}銀行\\end{jyutpingscope}', '\\end{document}', ''].join('\n');
  const made = await project('manual', { 'main.tex': doc });
  const res = await runCompile({ projectId: made.id, mainFile: 'main.tex', engine: 'pdflatex' });
  assert.ok(res.ok && res.status === 0, res.error || res.log);
  assert.equal(res.engine, 'xelatex');
  assert.match(res.log, /^\[spectrum note\] This compile used XeLaTeX, as Jyutping \(xjyutping\) needs XeLaTeX or LuaLaTeX\./);
});

test('auto mode leaves a document without Chinese as it is', { skip: skipFor('xelatex'), timeout: 120000 * SLOW }, async () => {
  const made = await project('no-chinese', { 'main.tex': '\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n' }, { mode: 'auto' });
  const res = await runCompile({ projectId: made.id, mainFile: 'main.tex', engine: 'auto' });
  assert.ok(res.ok, res.error);
  assert.doesNotMatch(res.log, /xjyutping|\[spectrum\]/);
});

test('Tectonic finds a bundled font by its file name', { skip: !engines.tectonic ? 'needs tectonic' : !fonts && 'needs the bundled fonts', timeout: 900000 }, async (t) => {
  const doc = ['\\documentclass{article}', '\\usepackage{xeCJK}', '\\setCJKmainfont{NotoSerifTC-Regular.otf}[BoldFont=NotoSerifTC-Bold.otf]', '\\begin{document}', '銀行\\textbf{行路}', '\\end{document}', ''].join('\n');
  const dir = path.join(tmp, 'tectonic-font');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'main.tex'), doc);
  const res = await compileFolder({ root: dir, mainFile: 'main.tex', engine: 'tectonic' });
  if (!res.ok && /download/i.test(res.error || '')) return t.skip('Tectonic couldn’t download its bundle');
  assert.ok(res.ok && res.status === 0, res.error || res.log);
});

test('with neither XeLaTeX nor LuaLaTeX, a document that loads xjyutping says what it needs', async () => {
  const empty = path.join(tmp, 'no-engines');
  await fs.mkdir(empty, { recursive: true });
  await fs.writeFile(path.join(empty, 'main.tex'), '\\documentclass{article}\n\\usepackage{xjyutping}\n\\begin{document}\n銀行\n\\end{document}\n');
  const PATH = process.env.PATH;
  process.env.PATH = empty;
  try {
    const res = await compileFolder({ root: empty, mainFile: 'main.tex', engine: 'tectonic', without: [] });
    assert.equal(res.ok, false);
    assert.match(res.error, /needs XeLaTeX or LuaLaTeX from a TeX installation/);
  } finally {
    process.env.PATH = PATH;
  }
});
