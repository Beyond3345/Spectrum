// SyncTeX: compiles small documents the way the app does, then checks both jump directions
// against the synctex command-line tool every other TeX editor relies on. Engines that aren't
// installed are skipped. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// native: Windows' temp folder can have an 8.3 name in it (RUNNER~1), which the app's realpath spells out
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-synctex-')));
// before the app's modules load, so the project registry lives in the throwaway folder
process.env.SPECTRUM_DATA_DIR = path.join(tmp, 'data');
process.env.SPECTRUM_PROJECTS_DIR = path.join(tmp, 'projects');
const { findExecutable, runCompile } = await import('../src/services/compileService.js');
const { synctexEdit, synctexView } = await import('../src/services/synctex.js');
const { createProject, updateMeta } = await import('../src/services/projectService.js');
const { registerCompileRoutes } = await import('../src/routes/compile.js');
const { default: Fastify } = await import('fastify');

const run = promisify(execFile);
const tool = await findExecutable('synctex');
// looked up before the first test: an await between tests lets the tests above finish first, and the after hook
// removes tmp before the tests below are added
const engines = Object.fromEntries(await Promise.all(['pdflatex', 'xelatex', 'lualatex', 'tectonic'].map(async (e) => [e, await findExecutable(e)])));
const NOT_YET = 'Compile the project first to jump between the source and the PDF.';
// what a compile keeps of a project, on this computer and out of its folder
const cached = (project, ...parts) => path.join(process.env.SPECTRUM_DATA_DIR, 'cache', project.id, ...parts);
after(() => rmSync(tmp, { recursive: true, force: true }));

const MAIN = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\section{Introduction}',
  'Hello world, this paragraph is long enough to wrap onto a second line in the typeset output,',
  'so one source line makes two typeset lines and each of them gets a box of its own here.',
  '',
  '% a comment before the next paragraph',
  'Second paragraph with $x^2 + y^2 = z^2$ maths inline and a footnote\\footnote{Down here.}.',
  '\\begin{itemize}',
  '\\item One',
  '\\item Two',
  '\\end{itemize}',
  '\\begin{equation}',
  'E = mc^2 + \\int_0^1 f(x)\\,dx',
  '\\end{equation}',
  '\\begin{tabular}{lr} a & b \\\\ cc & dd \\end{tabular}',
  '\\noindent\\begin{minipage}{0.4\\textwidth}Inside a minipage that wraps over a few lines of text.\\end{minipage}',
  '\\input{chapters/one}',
  '\\section{Filler}',
  '\\newcount\\n \\n=0',
  '\\loop\\ifnum\\n<60 Filler sentence number \\the\\n\\ that keeps going for a while. \\advance\\n by 1 \\repeat',
  '',
  'Final words.',
  '\\end{document}',
  ''
].join('\n');
const CHAPTER = [
  '\\section{From a chapter}',
  'This text comes from a file in a subfolder, and it is long enough to wrap onto a second line too.',
  '',
  'Short paragraph.',
  ''
].join('\n');
// lines that typeset text of their own, where the tool's boxes and ours should be the same
const TEXT_LINES = { 'main.tex': [3, 4, 5, 8, 10, 11, 14, 19, 21, 23], 'chapters/one.tex': [1, 2, 4] };

async function compiledProject(name, files, mainFile, engine) {
  const project = await createProject({
    name,
    parentDir: tmp,
    populate: async (root) => {
      for (const [file, text] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await fs.writeFile(path.join(root, file), text);
      }
    }
  });
  const res = await runCompile({ projectId: project.id, mainFile, engine });
  return { project, root: project.path, res };
}

// the tool's output, with Windows' line ends made plain
const runTool = async (args) => (await run(tool, args)).stdout.replace(/\r\n/g, '\n');

/** The tool's answers, with its file as a project-relative path. */
async function toolEdit(pdf, root, page, x, y) {
  const stdout = await runTool(['edit', '-o', `${page}:${x}:${y}:${pdf}`]);
  const m = /Input:(.*)\nLine:(-?\d+)/.exec(stdout);
  return m && { file: path.relative(root, path.resolve(root, m[1])).split(path.sep).join('/'), line: Number(m[2]) };
}

// The tool reports the box around each record it finds (h, v at its bottom, W, H); a box
// inside another (a superscript, a footnote mark) is part of that line, like ours.
async function toolView(pdf, root, file, line) {
  // by full path: the tool misses a relative name that TeX found through TEXINPUTS
  const stdout = await runTool(['view', '-i', `${line}:0:${path.join(root, file)}`, '-o', pdf]);
  const boxes = [...stdout.matchAll(/Page:(\d+)\nx:.*\ny:.*\nh:(.*)\nv:(.*)\nW:(.*)\nH:(.*)/g)]
    .map(([, page, h, v, W, H]) => ({ page: +page, x: +h, y: +v - +H, width: +W, height: +H }))
    .filter((b) => b.width > 0 || b.height > 0);
  const within = (a, b) => a.page === b.page && a.x >= b.x - 1 && a.y >= b.y - 1
    && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;
  return boxes.filter((a, i) => !boxes.some((b, j) => j !== i && within(a, b) && !(j > i && within(b, a))));
}

// Windows starts processes several times slower (MiKTeX's engines and its synctex tool included), so
// its compiles get longer and the cross-check samples every other grid point
const SLOW = process.platform === 'win32' ? 3 : 1;
const GRID = process.platform === 'win32' ? 26 : 13;

const close = (a, b) => a.page === b.page && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 2);

/** Run fn over items, a few at a time. */
async function pool(items, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

for (const engine of ['pdflatex', 'xelatex', 'lualatex', 'tectonic']) {
  const missing = !tool ? 'needs the synctex tool' : !engines[engine] && `needs ${engine}`;
  test(`${engine}: jumps agree with the synctex tool`, { skip: missing, timeout: 180000 * SLOW }, async (t) => {
    const { project, root, res } = await compiledProject(engine, { 'main.tex': MAIN, 'chapters/one.tex': CHAPTER }, 'main.tex', engine);
    if (engine === 'tectonic' && !res.ok) return t.skip(`tectonic didn't compile: ${res.error}`);
    assert.ok(res.ok, res.error || res.log);
    // the tool wants the PDF and its SyncTeX file side by side
    const cli = path.join(tmp, `cli-${engine}`);
    await fs.mkdir(cli);
    await fs.copyFile(path.join(root, 'main.pdf'), path.join(cli, 'main.pdf'));
    await fs.copyFile(cached(project, 'synctex', 'main.tex.gz'), path.join(cli, 'main.synctex.gz'));
    const pdf = path.join(cli, 'main.pdf');

    // PDF → source, over a grid covering both pages, margins included
    const points = [];
    for (const page of [1, 2]) {
      for (let y = 20; y < 780; y += GRID) for (let x = 20; x < 600; x += GRID) points.push({ page, x, y });
    }
    let answered = 0;
    const wrong = [];
    await pool(points, async ({ page, x, y }) => {
      const theirs = await toolEdit(pdf, root, page, x, y);
      const ours = await synctexEdit(root, 'main.tex', page, x, y);
      if (!theirs) return assert.equal(ours.ok, false);
      answered += 1;
      // Left of a line that another file finished, the tool pairs that file with this file's
      // line number; ours keeps the file the line number belongs to.
      const fine = ours.ok && ours.line === theirs.line
        && (ours.file === theirs.file || (await fs.readFile(path.join(root, ours.file), 'utf8')).split('\n').length >= ours.line);
      if (!fine) wrong.push(`${page}:${x}:${y} tool ${theirs.file}:${theirs.line}, ours ${ours.file}:${ours.line}`);
    });
    assert.ok(answered > points.length / 2, `the tool answered only ${answered} of ${points.length}`);
    assert.deepEqual(wrong, []);

    // source → PDF, line by line
    for (const [file, lines] of Object.entries(TEXT_LINES)) {
      for (const line of lines) {
        const theirs = await toolView(pdf, root, file, line);
        const ours = await synctexView(root, 'main.tex', file, line);
        assert.ok(ours.ok, `${file}:${line} ${ours.error}`);
        assert.ok(theirs.length > 0, `${file}:${line}: the tool found nothing`);
        assert.equal(ours.boxes.length, theirs.length, `${file}:${line}: ${JSON.stringify({ ours: ours.boxes, theirs })}`);
        for (const box of theirs) assert.ok(ours.boxes.some((b) => close(b, box)), `${file}:${line}: ${JSON.stringify({ ours: ours.boxes, theirs })}`);
        assert.equal(ours.page, ours.boxes[0].page);
      }
    }
    // the paragraph wraps, so its line has a box per typeset line, sorted down the page
    const wrapped = (await synctexView(root, 'main.tex', 'main.tex', 21)).boxes;
    assert.ok(wrapped.length > 10 && new Set(wrapped.map((b) => b.page)).size === 2);
    assert.deepEqual(wrapped, [...wrapped].sort((a, b) => a.page - b.page || a.y - b.y));
    // a comment goes to the next line that typeset something, past the end to the last one
    // (not a blank line: LuaTeX tags the end of the paragraph before it with the blank line)
    assert.deepEqual(await synctexView(root, 'main.tex', 'main.tex', 7), await synctexView(root, 'main.tex', 'main.tex', 8));
    assert.deepEqual(await synctexView(root, 'main.tex', 'main.tex', 999), await synctexView(root, 'main.tex', 'main.tex', 24));
    assert.equal((await synctexView(root, 'main.tex', 'missing.tex', 1)).ok, false);
    assert.equal((await synctexEdit(root, 'main.tex', 9, 100, 100)).ok, false);
  });
}

// a name the disk keeps decomposed (copied from a zip, say), which the source types precomposed;
// NTFS only matches the form a name was given in, so on Windows it's precomposed on disk too
const DECOMPOSED = process.platform === 'win32' ? 'paper/chapters/r\u00e9sum\u00e9.tex' : 'paper/chapters/re\u0301sume\u0301.tex';

test('a main file in a subfolder maps every input back to the project, and a failed compile keeps the last one', { skip: !engines.pdflatex && 'needs pdflatex', timeout: 120000 * SLOW }, async () => {
  const files = {
    // APFS finds Shared/Note and résumé whatever their case or Unicode form; jumps use the disk's names
    'paper/main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{chapters/one}\n\n\\input{Shared/Note}\n\n\\input{chapters/r\u00e9sum\u00e9}\n\\end{document}\n',
    'paper/chapters/one.tex': 'From the chapter next to the main file.\n',
    'shared/note.tex': 'From a folder at the project root.\n',
    [DECOMPOSED]: 'From a file with an accent in its name.\n'
  };
  const { project, root, res } = await compiledProject('Subfolder', files, 'paper/main.tex', 'pdflatex');
  assert.ok(res.ok, res.error || res.log);
  // nothing of the build in the project but the PDF
  assert.deepEqual(await fs.readdir(path.join(root, '.spectrum')), ['project.json']);
  for (const file of ['paper/chapters/one.tex', 'shared/note.tex', DECOMPOSED]) {
    const view = await synctexView(root, 'paper/main.tex', file, 1);
    assert.ok(view.ok, `${file}: ${view.error}`);
    const [box] = view.boxes;
    // a word in the middle of the line leads back to it
    assert.deepEqual(await synctexEdit(root, 'paper/main.tex', box.page, box.x + 40, box.y + box.height / 2), { ok: true, file, line: 1, column: null });
  }
  // a project 1.7.0 compiled: the SyncTeX it kept in the folder is read until this computer compiles it
  await fs.rename(cached(project, 'synctex'), path.join(root, '.spectrum', 'synctex'));
  assert.ok((await synctexView(root, 'paper/main.tex', 'shared/note.tex', 1)).ok);
  await fs.rename(path.join(root, '.spectrum', 'synctex'), cached(project, 'synctex'));
  // compiling it again with latexmk keeps a SyncTeX file too
  if (await findExecutable('latexmk')) {
    const again = await runCompile({ projectId: project.id, mainFile: 'paper/main.tex', engine: 'latexmk' });
    assert.ok(again.ok, again.error || again.log);
    assert.ok((await synctexView(root, 'paper/main.tex', 'shared/note.tex', 1)).ok);
  }
  await fs.writeFile(path.join(root, 'paper', 'main.tex'), '\\documentclass{article}\n\\begin{document}\n\\end{document}\n');
  const failed = await runCompile({ projectId: project.id, mainFile: 'paper/main.tex', engine: 'pdflatex' });
  assert.equal(failed.ok, false);
  // the last PDF stays on screen, and its SyncTeX file with it
  assert.ok(existsSync(cached(project, 'synctex', 'paper', 'main.tex.gz')));
  assert.ok((await synctexView(root, 'paper/main.tex', 'shared/note.tex', 1)).ok);
  // a half-written one reads as none, not as an error
  await fs.writeFile(cached(project, 'synctex', 'paper', 'main.tex.gz'), 'not gzip');
  assert.deepEqual(await synctexEdit(root, 'paper/main.tex', 1, 200, 150), { ok: false, error: NOT_YET });
  assert.deepEqual(await synctexView(root, 'paper/main.tex', 'shared/note.tex', 1), { ok: false, error: NOT_YET });
});

// A page, its header, footer and rules carry the line TeX was reading when the page went out:
// often a heading's, since LaTeX likes to break there.
for (const engine of ['pdflatex', 'xelatex', 'lualatex', 'tectonic']) {
  test(`${engine}: a page that went out on a line doesn't pull the jump back to it`, { skip: !engines[engine] && `needs ${engine}`, timeout: 120000 * SLOW }, async () => {
    const files = {
      'main.tex': '\\documentclass{report}\n\\title{A title}\\author{Me}\n\\begin{document}\n\\maketitle\n\\input{ch1}\n\\input{ch2}\n\\end{document}\n',
      'ch1.tex': ['\\chapter{One}', 'Some text for the first chapter.', '', '\\begin{table}[h]', '\\centering', '\\begin{tabular}{ll} a & b \\\\ c & d \\end{tabular}', '\\caption{A table}', '\\end{table}', '', 'More text.', ''].join('\n'),
      'ch2.tex': '\\chapter{Two}\nThe second chapter.\n'
    };
    const { root, res } = await compiledProject(`Shipped ${engine}`, files, 'main.tex', engine);
    assert.ok(res.ok, res.error || res.log);
    // the title page, without its empty header
    const title = await synctexView(root, 'main.tex', 'main.tex', 4);
    assert.ok(title.boxes.every((b) => b.page === 1 && b.height > 0), JSON.stringify(title.boxes));
    // the second chapter's heading on page 3, not page 2's header, footer or table struts
    const chapter = await synctexView(root, 'main.tex', 'ch2.tex', 1);
    assert.ok(chapter.boxes.some((b) => b.page === 3), JSON.stringify(chapter.boxes));
    // (LuaTeX tags kerns with the line too, so the chapter before it comes along)
    if (engine !== 'lualatex') assert.ok(chapter.boxes.every((b) => b.page === 3), JSON.stringify(chapter.boxes));
    // \end{table} only closes the float's box, which goes round the table and its caption
    const [table, ...more] = (await synctexView(root, 'main.tex', 'ch1.tex', 8)).boxes;
    assert.equal(more.length, 0);
    for (const line of [6, 7]) {
      for (const b of (await synctexView(root, 'main.tex', 'ch1.tex', line)).boxes) {
        assert.ok(b.page === table.page && b.y >= table.y - 1 && b.y + b.height <= table.y + table.height + 1, JSON.stringify({ table, b }));
      }
    }
  });
}

test('the jump routes check what they are given', async () => {
  const project = await createProject({ name: 'Routes', parentDir: tmp });
  const app = Fastify();
  registerCompileRoutes(app);
  const post = async (kind, payload, id = project.id) => {
    const res = await app.inject({ method: 'POST', url: `/api/projects/${id}/synctex/${kind}`, payload });
    return { status: res.statusCode, json: res.json() };
  };
  for (const bad of [{}, { page: 0, x: 1, y: 1 }, { page: 1.5, x: 1, y: 1 }, { page: 1, x: '1', y: 1 }, { page: 1, x: 1 }]) {
    assert.equal((await post('edit', bad)).status, 400, JSON.stringify(bad));
  }
  for (const bad of [{ line: 1 }, { file: 'main.tex', line: 0 }, { file: 'main.tex', line: '2' }, { file: 'main.tex', line: 2, column: 'a' }, { file: '../outside.tex', line: 1 }]) {
    assert.equal((await post('view', bad)).status, 400, JSON.stringify(bad));
  }
  for (const doc of [5, '', '../outside.tex']) {
    assert.equal((await post('edit', { page: 1, x: 1, y: 1, doc })).status, 400, JSON.stringify(doc));
    assert.equal((await post('view', { file: 'main.tex', line: 1, doc })).status, 400, JSON.stringify(doc));
  }
  assert.deepEqual(await post('view', { file: 'main.tex', line: 1, doc: 'other.tex' }), { status: 200, json: { ok: false, error: NOT_YET } });
  assert.deepEqual(await post('edit', { page: 1, x: 10, y: 10 }), { status: 200, json: { ok: false, error: NOT_YET } });
  assert.deepEqual(await post('view', { file: 'main.tex', line: 1, column: 3 }), { status: 200, json: { ok: false, error: NOT_YET } });
  assert.equal((await post('edit', { page: 1, x: 10, y: 10 }, 'nope')).status, 404);
  await app.close();
});

// Two documents in one folder, the tutorial citing the notes' equations through xr-hyper
const NOTES = [
  '\\documentclass{article}',
  '\\usepackage{amsmath}',
  '\\begin{document}',
  '\\section{Circuits}\\label{sec:circuits}',
  'Ohm’s law ties the voltage across a resistor to the current through it, as below.',
  '\\begin{equation}\\label{eq:ohm} V = IR \\end{equation}',
  '\\end{document}',
  ''
].join('\n');
const TUTORIAL = [
  '\\documentclass{article}',
  '\\usepackage{amsmath}',
  '\\usepackage{xr-hyper}',
  '\\usepackage[hidelinks]{hyperref}',
  '% \\externaldocument{missing}',
  '\\externaldocument[notes:]{notes}',
  '\\begin{document}',
  'By \\eqref{notes:eq:ohm} in Section~\\ref{notes:sec:circuits}, the current is the voltage over the resistance.',
  '\\end{document}',
  ''
].join('\n');

test('a document compiles the one it cross-references first, and each PDF keeps its own SyncTeX', { skip: !engines.pdflatex && 'needs pdflatex', timeout: 180000 * SLOW }, async () => {
  const { project, root, res } = await compiledProject('Two documents', { 'notes.tex': NOTES, 'tutorial.tex': TUTORIAL }, 'tutorial.tex', 'pdflatex');
  assert.ok(res.ok, res.error || res.log);
  assert.deepEqual(res.linked, [{ file: 'notes.tex', ok: true }]);
  assert.ok(res.log.startsWith('Compiled notes.tex first for its cross-references.\n'), res.log.slice(0, 200));
  assert.ok(existsSync(path.join(root, 'notes.pdf')));
  // every notes: reference resolved
  assert.doesNotMatch(res.log, /No file notes\.aux|Reference `notes:/);
  // each document keeps its own .aux, not the other's
  assert.ok(existsSync(cached(project, 'aux-files', 'notes.tex', 'notes.aux')));
  assert.ok(existsSync(cached(project, 'aux-files', 'tutorial.tex', 'tutorial.aux')));
  assert.ok(!existsSync(cached(project, 'aux-files', 'tutorial.tex', 'notes.aux')));
  assert.ok(!existsSync(path.join(root, '.spectrum', 'aux-files')));

  // 1.4.0's single SyncTeX file goes with the next compile
  await fs.writeFile(path.join(root, '.spectrum', 'synctex.gz'), '');
  await fs.writeFile(path.join(root, '.spectrum', 'synctex.json'), '{}');
  const again = await runCompile({ projectId: project.id, mainFile: 'tutorial.tex', engine: 'pdflatex' });
  assert.ok(again.ok, again.error || again.log);
  assert.equal(again.linked, undefined);
  assert.doesNotMatch(again.log, /\[spectrum\]|Reference `notes:/);
  assert.ok(!existsSync(path.join(root, '.spectrum', 'synctex.gz')) && !existsSync(path.join(root, '.spectrum', 'synctex.json')));

  // an edit to the notes compiles them again
  await fs.writeFile(path.join(root, 'notes.tex'), NOTES.replace('as below', 'as shown below'));
  const edited = await runCompile({ projectId: project.id, mainFile: 'tutorial.tex', engine: 'pdflatex' });
  assert.deepEqual(edited.linked, [{ file: 'notes.tex', ok: true }]);

  // each PDF jumps within its own document
  for (const [doc, line] of [['notes.tex', 5], ['tutorial.tex', 8]]) {
    const view = await synctexView(root, doc, doc, line);
    assert.ok(view.ok, `${doc}: ${view.error}`);
    const [box] = view.boxes;
    assert.deepEqual(await synctexEdit(root, doc, box.page, box.x + 40, box.y + box.height / 2), { ok: true, file: doc, line, column: null });
  }
  assert.equal((await synctexView(root, 'tutorial.tex', 'notes.tex', 5)).ok, false);
  // the routes take the document, or the main file without one
  await updateMeta(root, (meta) => ({ ...meta, mainFile: 'tutorial.tex' }));
  const app = Fastify();
  registerCompileRoutes(app);
  const view = async (payload) => (await app.inject({ method: 'POST', url: `/api/projects/${project.id}/synctex/view`, payload })).json();
  assert.ok((await view({ file: 'notes.tex', line: 5, doc: 'notes.tex' })).ok);
  assert.ok((await view({ file: 'tutorial.tex', line: 8 })).ok);
  assert.equal((await view({ file: 'notes.tex', line: 5 })).ok, false);
  await app.close();

  // a linked document that doesn't compile is said so, and the tutorial still compiles
  await fs.writeFile(path.join(root, 'broken.tex'), '\\documentclass{article}\n\\begin{document}\n\\end{document}\n');
  await fs.writeFile(path.join(root, 'tutorial.tex'), TUTORIAL.replace('\\begin{document}', '\\externaldocument[b:]{broken}\n\\begin{document}'));
  const broken = await runCompile({ projectId: project.id, mainFile: 'tutorial.tex', engine: 'pdflatex' });
  assert.ok(broken.ok, broken.error || broken.log);
  assert.deepEqual(broken.linked, [{ file: 'broken.tex', ok: false }]);
  assert.ok(broken.log.startsWith('[spectrum warning] broken.tex didn’t compile, so references to it may show as ??.\n'));
});

test('a document keeps its own .aux when another left one of the same name, and a link in another letter case finds it', { skip: !engines.pdflatex && 'needs pdflatex', timeout: 180000 * SLOW }, async () => {
  const intro = '\\section{Introduction}\\label{sec:intro} Both documents include this chapter.\n';
  const paper = '\\documentclass{article}\n\\begin{document}\n\\section{Preliminaries}\n\\include{intro}\n\\end{document}\n';
  const short = '\\documentclass{article}\n\\begin{document}\n\\include{intro}\n\\end{document}\n';
  // {Short} is short.tex on macOS
  const third = '\\documentclass{article}\n\\usepackage{xr}\n\\externaldocument[s:]{Short}\n\\begin{document}\nSection~\\ref{s:sec:intro}.\n\\end{document}\n';
  const { project, root, res } = await compiledProject('Shared chapter', { 'intro.tex': intro, 'paper.tex': paper, 'short.tex': short, 'third.tex': third }, 'paper.tex', 'pdflatex');
  assert.ok(res.ok, res.error || res.log);
  const compile = (mainFile) => runCompile({ projectId: project.id, mainFile, engine: 'pdflatex' });
  // short's own intro.aux, written over paper's copy of it, is short's
  assert.ok((await compile('short.tex')).ok);
  const kept = await fs.readFile(cached(project, 'aux-files', 'short.tex', 'intro.aux'), 'utf8');
  assert.match(kept, /\\newlabel\{sec:intro\}\{\{1\}/);

  // the link goes by the name on disk: short.tex is fresh, so nothing compiles first, and the reference resolves
  const first = await compile('third.tex');
  assert.ok(first.ok, first.error || first.log);
  assert.equal(first.linked, undefined);
  assert.doesNotMatch(first.log, /No file Short\.aux|Reference `s:sec:intro' .* undefined/);
  await fs.utimes(path.join(root, 'short.tex'), new Date(), new Date(Date.now() + 5000));
  const again = await compile('third.tex');
  assert.deepEqual(again.linked, [{ file: 'short.tex', ok: true }]);
  assert.doesNotMatch(again.log, /No file Short\.aux|Reference `s:sec:intro' .* undefined/);
  assert.ok(!existsSync(path.join(root, 'Short.pdf')) || realpathSync.native(path.join(root, 'Short.pdf')).endsWith('short.pdf'));
});
