import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const hasTeX = (() => {
  try {
    execFileSync('kpsewhich', ['preview.sty'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-figure-preview-')));
Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects'), SPECTRUM_SKILLS_SEED_DIR: path.join(dir, 'no-skills') });
const { previewDocument, previewFigure } = await import('../src/services/figurePreview.js');

test('a preview keeps the preamble and puts only the piece in the body', () => {
  const tex = '\\documentclass{article}\n\\usepackage{tikz} % \\begin{document}\n\\begin{document}\nThe body.\n\\end{document}\n';
  const doc = previewDocument(tex, '\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}');
  assert.match(doc, /^\\documentclass\{article\}\n\\usepackage\{tikz\} % \\begin\{document\}\n/);
  assert.match(doc, /\\usepackage\{preview\}/);
  assert.match(doc, /\\begin\{preview\}\n\\begin\{tikzpicture\}.*\\end\{tikzpicture\}\n\\end\{preview\}\n\\end\{document\}\n$/);
  assert.doesNotMatch(doc, /The body/);
  assert.equal(previewDocument('\\begin{document}x\\end{document}', 'x'), null, 'no class');
  assert.equal(previewDocument('\\documentclass{article}\n% \\begin{document}\n', 'x'), null, 'no body');
});

test('a figure compiles alone from a copy, finds the project’s files and leaves the project as it was', { skip: !hasTeX && 'Needs TeX Live with the preview package.', timeout: 120000 }, async () => {
  const { createProject } = await import('../src/services/projectService.js');
  const project = await createProject({ name: 'Preview' });
  const main = '\\documentclass{article}\n\\usepackage{tikz}\n\\newcommand{\\side}{2}\n\\begin{document}\nBody.\n\\end{document}\n';
  await fs.writeFile(path.join(project.path, 'main.tex'), main);
  await fs.mkdir(path.join(project.path, 'parts'));
  await fs.writeFile(path.join(project.path, 'parts', 'shape.tex'), '\\draw (0,0) rectangle (\\side,1);');
  const before = (await fs.readdir(project.path, { recursive: true })).sort();
  const written = path.join(project.path, 'written.tex');

  const ok = await previewFigure({
    projectId: project.id,
    file: 'main.tex',
    engine: 'pdflatex',
    piece: '\\begin{tikzpicture}\\input{parts/shape}\\end{tikzpicture}'
  });
  assert.equal(ok.ok, true, ok.log);
  const pdf = Buffer.from(ok.pdf, 'base64');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  // cropped to the picture: a 2 cm by 1 cm rectangle and its border, far from a page
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(pdf) });
  try {
    const doc = await task.promise;
    const { width, height } = (await doc.getPage(1)).getViewport({ scale: 1 });
    assert.equal(doc.numPages, 1);
    assert.ok(width < 100 && height < 50, `cropped page: ${width} × ${height}`);
  } finally {
    await task.destroy();
  }
  assert.deepEqual((await fs.readdir(project.path, { recursive: true })).sort(), before, 'nothing written into the project');
  assert.equal(await fs.readFile(path.join(project.path, 'main.tex'), 'utf8'), main);
  const { cachePath } = await import('../src/services/projectService.js');
  assert.deepEqual(await fs.readdir(await cachePath(project.path, 'preview')), [], 'the copy is gone');

  // a piece can't write into the project
  const write = await previewFigure({ projectId: project.id, file: 'main.tex', engine: 'pdflatex', piece: `\\newwrite\\f\\immediate\\openout\\f=${written.split(path.sep).join('/')}\\immediate\\write\\f{x}\\immediate\\closeout\\f x` });
  assert.equal(await fs.stat(written).catch(() => null), null, write.log);

  const bad = await previewFigure({ projectId: project.id, file: 'main.tex', engine: 'pdflatex', piece: '\\undefinedthing' });
  assert.match(bad.log, /Undefined\s+control\s+sequence/);
  const none = await previewFigure({ projectId: project.id, file: 'parts/shape.tex', piece: 'x' });
  assert.equal(none.ok, false);
});

test.after(() => fs.rm(dir, { recursive: true, force: true }));
