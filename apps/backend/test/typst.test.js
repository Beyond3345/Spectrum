// Typst: its short-format diagnostics, and, with the built-in Typst, a project that compiles and one that doesn't,
// a pinned version that isn't installed, sys.inputs, and the route's refusal of bad inputs. Throwaway folders only.
// Run: node --test apps/backend/test/typst.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-typst-')));
process.env.HOME = path.join(tmp, 'home');
process.env.SPECTRUM_DATA_DIR = path.join(tmp, 'data');
process.env.SPECTRUM_PROJECTS_DIR = path.join(tmp, 'projects');
process.env.SPECTRUM_TEMPLATE_DIR = path.join(tmp, 'templates');
delete process.env.SPECTRUM_TYPST;

const { BUILT_IN_TYPST_VERSION, builtInTypst } = await import('../src/services/engineService.js');
const { parseTypstDiagnostics } = await import('../src/services/typstService.js');
const { compileFolder, runCompile } = await import('../src/services/compileService.js');
const { createProject, getProjectRoot } = await import('../src/services/projectService.js');
const { updateProjectSettings } = await import('../src/services/projectSettings.js');
const { typstDocumentLabels } = await import('../src/services/statsService.js');
const { registerCompileRoutes } = await import('../src/routes/compile.js');

const root = path.join(tmp, 'project');
const projectWith = async (name, source) => createProject({
  name,
  meta: { mainFile: 'main.typ' },
  populate: async (dir) => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.typ'), source);
  }
});

test('short-format diagnostics become errors and warnings with project paths', () => {
  const log = [
    'main.typ:5:1: error: unknown variable: foo',
    'chapters/one.typ:3:1: error: unknown variable: bar',
    'main.typ:3:16: warning: unknown font family: no such font'
  ].join('\n');
  assert.deepEqual(parseTypstDiagnostics(log, root), [
    { severity: 'error', message: 'unknown variable: foo', file: 'main.typ', line: 5, column: 1 },
    { severity: 'error', message: 'unknown variable: bar', file: 'chapters/one.typ', line: 3, column: 1 },
    { severity: 'warning', message: 'unknown font family: no such font', file: 'main.typ', line: 3, column: 16 }
  ]);
});

test('a hint joins the diagnostic before it, and absolute paths lose the project root', () => {
  const log = [
    path.join(root, 'chapters', 'two.typ') + ':2:3: error: unexpected argument: capton',
    '  hint: did you mean caption?',
    'main.typ:1:1: error: unclosed delimiter'
  ].join('\n');
  const diagnostics = parseTypstDiagnostics(log, root);
  assert.equal(diagnostics[0].file, 'chapters/two.typ');
  assert.equal(diagnostics[0].message, 'unexpected argument: capton\nHint: did you mean caption?');
  assert.equal(diagnostics[1].message, 'unclosed delimiter');
});

test('the route refuses bad typstInputs', async () => {
  const app = Fastify();
  registerCompileRoutes(app);
  const refuse = async (typstInputs) => {
    const res = await app.inject({ method: 'POST', url: '/api/compile', payload: { projectId: 'x', typstInputs } });
    return JSON.parse(res.payload);
  };
  assert.equal((await refuse({ 'bad key': 'x' })).error, 'Invalid typstInputs.');
  assert.equal((await refuse({ x: 'line\nbreak' })).error, 'Invalid typstInputs.');
  assert.equal((await refuse(Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['k' + i, 'v'])))).error, 'Invalid typstInputs.');
  await app.close();
});

test('a Typst project compiles and writes its PDF beside the main file', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const project = await projectWith('typst-good', '= Hello\n\nText with #emph[emphasis].\n');
  const result = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto' });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.engine, 'typst');
  assert.match(result.typstVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(result.pdfPath, 'main.pdf');
  assert.ok(result.pdf.length > 100);
  assert.deepEqual(result.errors, []);
  const dir = await getProjectRoot(project.id);
  assert.ok((await fs.stat(path.join(dir, 'main.pdf'))).size > 100);
});

test('a folder compile of a Typst draft leaves its PDF alone', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const draft = path.join(tmp, 'draft');
  await fs.mkdir(draft, { recursive: true });
  await fs.writeFile(path.join(draft, 'main.typ'), '= Draft\n');
  await fs.writeFile(path.join(draft, 'main.pdf'), 'THE DRAFT’S OWN PDF');
  const result = await compileFolder({ root: draft, mainFile: 'main.typ', buildDir: path.join(tmp, 'build') });
  assert.equal(result.ok, true, result.error);
  assert.ok(result.pdf.length > 100);
  assert.equal(result.pdfPath, undefined);
  assert.equal(await fs.readFile(path.join(draft, 'main.pdf'), 'utf8'), 'THE DRAFT’S OWN PDF');
});

test('a compile never writes its PDF through a link out of the project', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const outside = path.join(tmp, 'outside.pdf');
  await fs.writeFile(outside, 'OUTSIDE');
  const project = await createProject({
    name: 'typst-link',
    meta: { mainFile: 'main.typ' },
    populate: async (dir) => {
      await fs.writeFile(path.join(dir, 'main.typ'), '= Linked\n');
      await fs.symlink(outside, path.join(dir, 'main.pdf'));
    }
  });
  const result = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto' });
  assert.equal(result.ok, true, result.error);
  assert.ok(result.pdf.length > 100);
  assert.equal(result.pdfStale, true);
  assert.match(result.log, /main\.pdf wasn’t updated/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'OUTSIDE');
});

test('a broken Typst line comes back with its file and line', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const project = await projectWith('typst-broken', '= Broken\n\n#foo\n');
  const result = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto' });
  const error = (result.errors || []).find((e) => e.severity === 'error');
  assert.ok(error, 'a diagnostic is returned');
  assert.equal(error.file, 'main.typ');
  assert.equal(error.line, 3);
  assert.match(error.message, /unknown variable: foo/);
});

test('a pinned Typst version that is not installed says so', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const project = await projectWith('typst-pinned', '= Pinned\n');
  const dir = await getProjectRoot(project.id);
  await updateProjectSettings(dir, (settings) => ({ ...settings, compile: { ...settings.compile, typstVersion: '9.9.9' } }));
  const result = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TYPST_VERSION_MISSING');
  assert.equal(result.version, '9.9.9');
  assert.equal(result.from, 'project');
  assert.match(result.error, /Typst 9\.9\.9 isn’t installed/);
  // the pin wins over a missing default, and says so
  assert.equal((await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto', typstVersion: '8.8.8' })).from, 'project');
});

test('a default Typst version that is not installed says it is the default', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const project = await projectWith('typst-missing-default', '= Default\n');
  const result = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto', typstVersion: '9.9.9' });
  assert.equal(result.code, 'TYPST_VERSION_MISSING');
  assert.equal(result.version, '9.9.9');
  assert.equal(result.from, 'default');
  assert.equal(result.builtIn, BUILT_IN_TYPST_VERSION);
  assert.equal(result.error, 'Typst 9.9.9 is the default version in Settings › Engines, and it isn’t installed on this computer. Download it, or use the built-in version.');
});

test('the app’s default Typst version reaches the compile, after the project’s own', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const app = Fastify();
  registerCompileRoutes(app);
  const compile = async (projectId, typstVersion) => JSON.parse((await app.inject({ method: 'POST', url: '/api/compile', payload: { projectId, mainFile: 'main.typ', engine: 'auto', typstVersion } })).payload);
  const unpinned = await projectWith('typst-default', '= Default\n');
  assert.equal((await compile(unpinned.id, '9.9.9')).code, 'TYPST_VERSION_MISSING');
  assert.equal((await compile(unpinned.id, '')).ok, true);
  const pinned = await projectWith('typst-own', '= Own\n');
  await updateProjectSettings(await getProjectRoot(pinned.id), (settings) => ({ ...settings, compile: { typstVersion: BUILT_IN_TYPST_VERSION } }));
  const own = await compile(pinned.id, '9.9.9');
  assert.equal(own.ok, true, own.error);
  assert.equal(own.typstVersion, BUILT_IN_TYPST_VERSION);
  assert.equal((await compile(unpinned.id, '../9')).error, 'Invalid typstVersion.');
  await app.close();
});

test('typstInputs reach the document and leave it compiling without them', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const project = await projectWith('typst-inputs', '#sys.inputs.at("x", default: "none")\n');
  const withInput = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto', typstInputs: { x: 'hello' } });
  assert.equal(withInput.ok, true, withInput.error);
  const without = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto' });
  assert.equal(without.ok, true, without.error);
});

test('a Typst document with one label still reads its numbers and pages', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const project = await projectWith('typst-one-label', '#set heading(numbering: "1.")\n= One <sec:one>\nText.\n');
  const result = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto' });
  assert.equal(result.ok, true, result.error);
  const dir = await getProjectRoot(project.id);
  const { labels, headings } = await typstDocumentLabels(dir, 'main.typ');
  assert.deepEqual(labels['sec:one'], { number: '1', page: '1' });
  assert.equal(headings.length, 1);
});

test('a Typst document’s headings and labels come with their pages', async (t) => {
  if (!builtInTypst()) return t.skip('the built-in Typst is not in this checkout');
  const source = [
    '#set page(paper: "a4", margin: 25mm)',
    '#set heading(numbering: "1.1")',
    '= One <sec:one>',
    'Text.',
    '#pagebreak()',
    '= Two <sec:two>',
    '#figure(rect(width: 1cm, height: 1cm), caption: [A figure]) <fig:one>',
    ''
  ].join('\n');
  const project = await projectWith('typst-stats', source);
  const result = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto' });
  assert.equal(result.ok, true, result.error);
  const dir = await getProjectRoot(project.id);
  const { labels, headings, auxAt, stale } = await typstDocumentLabels(dir, 'main.typ');
  assert.equal(headings.length, 2);
  assert.equal(headings[1].level, 'chapter');
  assert.equal(headings[1].page, '2');
  assert.deepEqual(labels['fig:one'], { number: '1', page: '2' });
  assert.deepEqual(labels['sec:two'], { number: '2', page: '2' });
  assert.ok(auxAt);
  assert.equal(stale, false);
});

test.after(async () => {
  rmSync(tmp, { recursive: true, force: true });
});
