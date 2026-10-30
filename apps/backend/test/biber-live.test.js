// The real Biber for the built-in Tectonic: downloaded from the Biber project's files with engines.json's checksum, then
// the Simple document template compiled with Tectonic and it, in the app and (on a Mac) inside an agent's isolation.
// Throwaway data folders only. Downloads about 90 MB and Tectonic's packages.
// Run: SPECTRUM_LIVE_TESTS=1 SPECTRUM_TECTONIC=<tectonic> node --test apps/backend/test/biber-live.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-biber-')));
// Tectonic's packages, fetched by the first compile into the agent's home, where the second finds them
const home = path.join(tmp, 'agent', 'home');
Object.assign(process.env, {
  TECTONIC_CACHE_DIR: path.join(home, 'tectonic'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
delete process.env.SPECTRUM_ENGINE_DOWNLOAD_BASE;
const { builtInTectonic, installBiber, tectonicBiber } = await import('../src/services/engineService.js');
const { createProject } = await import('../src/services/projectService.js');
const { runCompile } = await import('../src/services/compileService.js');
const template = path.join(import.meta.dirname, '..', '..', '..', 'templates', 'simple-document');
const skip = process.env.SPECTRUM_LIVE_TESTS !== '1' ? 'set SPECTRUM_LIVE_TESTS=1 to run' : !builtInTectonic() && 'needs the built-in Tectonic (SPECTRUM_TECTONIC)';

after(() => rmSync(tmp, { recursive: true, force: true }));

test('live: the Simple document template compiles with the built-in Tectonic and the downloaded Biber', { skip, timeout: 30 * 60 * 1000 }, async () => {
  const biber = await installBiber();
  assert.equal(tectonicBiber(), biber);
  // unpacked at install, in its own folder
  assert.ok((await fs.readdir(path.join(tmp, 'data', 'engines', 'biber', 'cache'))).some((name) => name.startsWith('par-')));
  // nothing but the built-in Tectonic, so a TeX installation's Biber can't stand in
  const realPath = process.env.PATH;
  process.env.PATH = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin:/bin';
  try {
    const project = await createProject({ name: 'Simple', populate: (root) => fs.cp(template, root, { recursive: true }) });
    const result = await runCompile({ projectId: project.id, mainFile: 'main.tex', engine: 'auto' });
    assert.equal(result.engine, 'tectonic');
    assert.equal(result.ok, true, result.log);
    assert.equal(result.status, 0, result.log);
    assert.equal(result.code, undefined);
    assert.match(result.log, /Running external tool biber/);
    assert.doesNotMatch(result.log, /biblatex control file version|needs the Biber/);
  } finally {
    process.env.PATH = realPath;
  }
});

test('live: inside an agent’s isolation on a Mac, Tectonic runs the downloaded Biber', { skip: skip || (process.platform !== 'darwin' && 'macOS isolation only'), timeout: 30 * 60 * 1000 }, async () => {
  const { spawnAgentProcess } = await import('../src/services/agentSandbox.js');
  const { toolsLaunch } = await import('../src/services/agentSessionService.js');
  await installBiber();
  const workspace = path.join(tmp, 'agent', 'work');
  const out = path.join(tmp, 'agent', 'out');
  await fs.cp(template, workspace, { recursive: true });
  await fs.mkdir(path.join(home, 'tmp'), { recursive: true });
  await fs.mkdir(out, { recursive: true });
  const { entry, env, reads } = await toolsLaunch();
  assert.ok(reads.includes(path.join(tmp, 'data', 'engines')), 'the engines Spectrum downloaded are readable');
  const child = await spawnAgentProcess({ command: process.execPath, args: [entry, '--compile', '--root', workspace, '--state', out, '--main', 'main.tex', '--engine', 'tectonic'], workspace: out, home, cwd: out, runtimePaths: [...reads, workspace], env: { ...env, TECTONIC_CACHE_DIR: process.env.TECTONIC_CACHE_DIR } });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  child.stdin.end();
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  const log = await fs.readFile(path.join(out, 'last.log'), 'utf8').catch(() => errors);
  const result = JSON.parse(output || '{}');
  assert.equal(result.ok, true, log);
  assert.match(log, /Running external tool biber/);
  assert.doesNotMatch(log, /biblatex control file version|needs the Biber/);
  // isolation can only read what it unpacked at install, so it unpacks into the agent's temp folder, never the engines
  assert.ok((await fs.readdir(path.join(home, 'tmp'))).some((name) => name.startsWith('par-')));
});
