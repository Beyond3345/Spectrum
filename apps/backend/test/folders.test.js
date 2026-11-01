// A project from before 2.1 moving to the new folders on its first compile: the composer's diagrams from figures/ to
// diagrams/, images/ to figures/, and the paths in its documents. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-folders-')));
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject, readMeta } = await import('../src/services/projectService.js');
const { registerCompileRoutes } = await import('../src/routes/compile.js');
const { default: Fastify } = await import('fastify');

const app = Fastify();
registerCompileRoutes(app);
after(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

const MARK = '% spectrum-diagram v1 e30= 0123456789abcdef\n';
const newProject = (files) =>
  createProject({
    name: 'Folders',
    populate: async (root) => {
      for (const [rel, text] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
        await fs.writeFile(path.join(root, rel), text);
      }
    }
  });
const compile = async (id, mainFile = 'main.tex') => (await app.inject({ method: 'POST', url: '/api/compile', payload: { projectId: id, mainFile, engine: 'pdflatex' } })).json();
const read = (p, rel) => fs.readFile(path.join(p.path, rel), 'utf8');

const MAIN = [
  '\\documentclass{article}',
  '\\graphicspath{{images/}}',
  '\\begin{document}',
  '\\includestandalone{figures/amp}',
  '\\includegraphics{figures/amp.pdf}',
  '\\includegraphics{figures/photo.png}',
  '\\includegraphics{images/cat.png}',
  '\\includegraphics{chapter/images/dog.png}',
  'See https://example.com/images/x.png and figures/amp-2.',
  '\\end{document}',
  ''
].join('\n');

test('the first compile moves the diagrams to diagrams/ and images/ to figures/, and follows them in the documents', async () => {
  const p = await newProject({
    'main.tex': MAIN,
    'chapter/intro.tex': '\\input{../figures/amp}\n\\includegraphics{../images/cat.png}\n',
    'figures/amp.tex': `\\documentclass{standalone}\\begin{document}x\\end{document}\n${MARK}`,
    'figures/amp.pdf': '%PDF-1.4',
    'figures/flow.mmd': 'flowchart LR\n  A --> B\n',
    'figures/photo.png': 'PNG',
    'figures/notes.tex': 'a .tex of the user’s own, without the composer’s drawing',
    'images/cat.png': 'PNG',
    'images/sub/dog.png': 'PNG',
    'chapter/images/dog.png': 'PNG'
  });
  const res = await compile(p.id);
  assert.deepEqual(res.folders.moved.map((m) => `${m.from} → ${m.to}`).sort(), [
    'figures/amp.pdf → diagrams/amp.pdf',
    'figures/amp.tex → diagrams/amp.tex',
    'figures/flow.mmd → diagrams/flow.mmd',
    'images/cat.png → figures/cat.png',
    'images/sub/dog.png → figures/sub/dog.png'
  ]);
  assert.deepEqual(res.folders.rewrote.sort(), ['chapter/intro.tex', 'main.tex']);
  for (const f of ['diagrams/amp.tex', 'diagrams/amp.pdf', 'diagrams/flow.mmd', 'figures/photo.png', 'figures/notes.tex', 'figures/cat.png', 'figures/sub/dog.png', 'chapter/images/dog.png']) {
    assert.ok(existsSync(path.join(p.path, f)), f);
  }
  assert.equal(existsSync(path.join(p.path, 'images')), false, 'the emptied images/ goes');
  assert.equal(
    await read(p, 'main.tex'),
    MAIN.replace('{images/}', '{figures/}')
      .replace('{figures/amp}', '{diagrams/amp}')
      .replace('{figures/amp.pdf}', '{diagrams/amp.pdf}')
      .replace('{images/cat.png}', '{figures/cat.png}'),
    'the paths follow; another folder’s images/, a URL and figures/amp-2 stay'
  );
  assert.equal(await read(p, 'chapter/intro.tex'), '\\input{../diagrams/amp}\n\\includegraphics{../figures/cat.png}\n', 'a path from a subfolder follows too');
  assert.equal((await readMeta(p.path)).layout, 2);
  assert.equal((await compile(p.id)).folders, undefined, 'only once');
});

test('a name already taken keeps its folder, and a composer preview moves nothing', async () => {
  const p = await newProject({
    'main.tex': '\\includegraphics{images/cat.png}\n',
    'figures/amp.tex': `x\n${MARK}`,
    'diagrams/amp.tex': 'already here',
    'figures/cat.png': 'a different cat',
    'images/cat.png': 'PNG'
  });
  assert.equal((await compile(p.id, 'figures/amp.tex')).folders, undefined, 'a preview of a diagram in figures/');
  assert.notEqual((await readMeta(p.path)).layout, 2, 'the project still moves on its own compile');
  assert.equal((await compile(p.id)).folders, undefined, 'nothing could move');
  assert.equal(await read(p, 'figures/amp.tex'), `x\n${MARK}`);
  assert.equal(await read(p, 'images/cat.png'), 'PNG');
  assert.equal(await read(p, 'main.tex'), '\\includegraphics{images/cat.png}\n');
  assert.equal((await readMeta(p.path)).layout, 2);
});

test('a new project, or one already in the new folders, is left as it is', async () => {
  const p = await newProject({ 'main.tex': 'x', 'figures/example.png': 'PNG' });
  assert.equal((await compile(p.id)).folders, undefined);
  assert.ok(existsSync(path.join(p.path, 'figures/example.png')));
});
