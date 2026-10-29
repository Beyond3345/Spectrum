import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-win-compile-'));
process.env.SPECTRUM_DATA_DIR = path.join(tmp, 'data');
process.env.SPECTRUM_PROJECTS_DIR = path.join(tmp, 'projects');
const { runSpawn, runCompile, findExecutable } = await import('../src/services/compileService.js');
const { createProject } = await import('../src/services/projectService.js');
const { builtInTypst } = await import('../src/services/engineService.js');
const { synctexView, synctexEdit } = await import('../src/services/synctex.js');
after(() => fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }));
const windows = process.platform === 'win32';

test('a failed Windows spawn rejects without unhandled pipe errors', { skip: !windows }, async () => {
  await assert.rejects(runSpawn(process.execPath, ['-e', 'process.exit(0)'], path.join(tmp, 'missing'), () => {}), { code: 'ENOENT' });
  await new Promise((resolve) => setTimeout(resolve, 50));
});

test('Windows compiles a Typst project with a path longer than MAX_PATH', { skip: !windows || !builtInTypst() }, async () => {
  let parentDir = path.join(tmp, 'long');
  while (parentDir.length < 290) parentDir = path.join(parentDir, 'nested-directory-123456789');
  await fs.mkdir(parentDir, { recursive: true });
  const project = await createProject({ name: 'Long path', parentDir, meta: { mainFile: 'main.typ' }, populate: (root) => fs.writeFile(path.join(root, 'main.typ'), '= Windows long path\nA scratch document.') });
  assert.ok(project.path.length > 260);
  const result = await runCompile({ projectId: project.id, mainFile: 'main.typ', engine: 'auto' });
  assert.ok(result.ok, result.error || result.log);
  assert.equal(Buffer.from(result.pdf, 'base64').subarray(0, 5).toString(), '%PDF-');
});

test('Windows SyncTeX matches an ANSI-lossy project root with Chinese characters', { skip: !windows || !(await findExecutable('xelatex')), timeout: 60000 }, async () => {
  const project = await createProject({ name: 'résumé-中文', populate: (root) => fs.writeFile(path.join(root, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nHello Windows scratch project.\n\\end{document}\n') });
  const result = await runCompile({ projectId: project.id, mainFile: 'main.tex', engine: 'xelatex' });
  assert.ok(result.ok, result.error || result.log);
  const forward = await synctexView(project.path, 'main.tex', 'main.tex', 3);
  assert.ok(forward.ok, forward.error);
  const box = forward.boxes[0];
  const backward = await synctexEdit(project.path, 'main.tex', box.page, box.x + box.width / 2, box.y + box.height / 2);
  assert.ok(backward.ok, backward.error);
  assert.equal(backward.file, 'main.tex');
});
