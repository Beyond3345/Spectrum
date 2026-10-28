// Engines: what Settings shows (the built-in Typst and Tectonic, a Typst or pandoc on the PATH), installing a Typst
// version from a release served by a local server, its checksum, and the refusals. Throwaway data folders only.
// Run: node --test apps/backend/test/engines.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { promises as fs, mkdtempSync, realpathSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-engines-')));
const fakeBin = path.join(tmp, 'bin');
const dataDir = path.join(tmp, 'data');
const archive = path.join(tmp, 'release.tar.gz');
const WINDOWS = process.platform === 'win32';
const ARCH = WINDOWS ? 'win-x64' : process.arch === 'arm64' ? 'arm64' : 'x64';

process.env.HOME = path.join(tmp, 'home');
process.env.SPECTRUM_DATA_DIR = dataDir;
process.env.SPECTRUM_PROJECTS_DIR = path.join(tmp, 'projects');
process.env.SPECTRUM_TEMPLATE_DIR = path.join(tmp, 'templates');
process.env.PATH = [fakeBin, process.env.PATH].join(path.delimiter);
delete process.env.SPECTRUM_TYPST;
delete process.env.SPECTRUM_TECTONIC;

// Windows can't run a #!/bin/sh script, so there it is a .cmd, which findExecutable finds by its name
const fakeScript = async (name, output) => {
  await fs.mkdir(fakeBin, { recursive: true });
  const file = path.join(fakeBin, name + (WINDOWS ? '.cmd' : ''));
  await fs.writeFile(file, WINDOWS ? '@echo off\r\n' + output.split('\n').map((line) => 'echo ' + line + '\r\n').join('') : '#!/bin/sh\necho ' + JSON.stringify(output) + '\n', { mode: 0o755 });
  chmodSync(file, 0o755);
};
await fakeScript('typst', 'typst 0.13.1 (abc123)');
await fakeScript('pandoc', 'pandoc 3.1.2\nCompiled with texmath 0.12');
await fs.mkdir(path.join(tmp, 'release'), { recursive: true });
// the release holds typst.exe on Windows; nothing runs it
const releaseTypst = WINDOWS ? 'typst.exe' : 'typst';
await fs.writeFile(path.join(tmp, 'release', releaseTypst), '#!/bin/sh\necho typst 9.9.9\n', { mode: 0o755 });
execFileSync('tar', ['-czf', archive, '-C', path.join(tmp, 'release'), releaseTypst]);
const bytes = (await fs.stat(archive)).size;
const sha = createHash('sha256').update(await fs.readFile(archive)).digest('hex');

const { installTypst, listEngines, removeTypst, typstFor, useEngineList } = await import('../src/services/engineService.js');

// serving: 'stall' sends a little and then nothing, 'drop' a little and then closes the connection
let serving = 'archive';
const server = createServer(async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/gzip' });
  if (serving === 'archive') return res.end(await fs.readFile(archive));
  res.write(Buffer.alloc(16));
  if (serving === 'drop') setTimeout(() => res.socket.destroy(), 50);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.env.SPECTRUM_ENGINE_DOWNLOAD_BASE = 'http://127.0.0.1:' + server.address().port;

const typstList = (versions, builtIn) => ({
  tectonic: { version: '0.17.0', assets: { [ARCH]: ["tectonic.tar.gz", "00"] } },
  typst: { builtIn, versions },
  pandoc: {
    version: '3.12.1',
    minimum: { latex: '3.1', typst: '3.8.3' },
    assets: { [ARCH]: ["pandoc.zip", "00"] }
  }
});
const release = (version, sha256) => ({ version, released: '2026-01-01', assets: { [ARCH]: ['release.tar.gz', sha256, bytes] } });

test('listEngines reports the built-in Typst, the one on the PATH and pandoc', async () => {
  const engines = await listEngines();
  const versions = ['0.15.1', '0.14.2', '0.13.1', '0.12.0'];
  assert.ok(engines.typst.builtIn === null || engines.typst.builtIn === '0.15.1');
  // Node runs a .cmd only through a shell, which versionOf doesn't use, so on Windows the fakes' versions are unknown
  assert.equal(engines.typst.system.version, WINDOWS ? null : '0.13.1');
  assert.equal(engines.typst.system.path, path.join(fakeBin, WINDOWS ? 'typst.cmd' : 'typst'));
  // the built-in version is never offered, even in a checkout without its binary: typstFor runs only the built-in copy
  assert.deepEqual(engines.typst.available.map((v) => v.version), versions.slice(1));
  assert.equal(engines.pandoc.found.version, WINDOWS ? null : '3.1.2');
  assert.equal(engines.pandoc.found.fromDownload, false);
  assert.equal(engines.pandoc.downloadable, '3.12.1');
  assert.deepEqual(engines.pandoc.minimum, { latex: '3.1', typst: '3.8.3' });
  assert.ok(engines.tectonic.builtIn === null || engines.tectonic.builtIn === '0.17.0');
});

test('a Typst version installs from its verified release and can be removed', async () => {
  useEngineList(typstList([release('9.9.9', sha)], '9.9.8'));
  const installed = await installTypst('9.9.9');
  assert.equal(installed, path.join(dataDir, 'engines', 'typst', '9.9.9', releaseTypst));
  assert.match(await fs.readFile(installed, 'utf8'), /typst 9\.9\.9/);
  assert.equal(typstFor('9.9.9'), installed);
  assert.deepEqual((await listEngines()).typst.installed, ['9.9.9']);
  await removeTypst('9.9.9');
  assert.equal(typstFor('9.9.9'), null);
});

test('a download that does not match its checksum leaves nothing behind', async () => {
  useEngineList(typstList([release('9.9.10', '0'.repeat(64))], '9.9.8'));
  await assert.rejects(installTypst('9.9.10'), /didn’t match its checksum/);
  await assert.rejects(fs.access(path.join(dataDir, 'engines', 'typst', '9.9.10')));
  assert.deepEqual(await fs.readdir(path.join(dataDir, 'engines', 'tmp')).catch(() => []), []);
});

test('a download that stalls or drops is a failed download, and leaves nothing behind', async () => {
  useEngineList(typstList([release('9.9.11', sha)], '9.9.8'));
  process.env.SPECTRUM_DOWNLOAD_IDLE_MS = '300';
  try {
    for (serving of ['stall', 'drop']) {
      await assert.rejects(installTypst('9.9.11'), (err) => err.statusCode === 502 && /Couldn’t download Typst 9\.9\.11/.test(err.message), serving);
      assert.deepEqual(await fs.readdir(path.join(dataDir, 'engines', 'tmp')).catch(() => []), []);
    }
  } finally {
    serving = 'archive';
    delete process.env.SPECTRUM_DOWNLOAD_IDLE_MS;
  }
  // and the next one installs
  assert.ok(await installTypst('9.9.11'));
});

test('an unknown version and a path are refused', async () => {
  useEngineList(typstList([release('9.9.9', sha)], '9.9.8'));
  await assert.rejects(installTypst('1.2.3'), /isn’t available/);
  await assert.rejects(installTypst('../x'), /Choose a Typst version/);
});

test('the desktop build takes each platform’s own engine archives', async () => {
  const { engineAsset } = await import('../../../scripts/desktop.mjs');
  const { default: list } = await import('../src/data/engines.json', { with: { type: 'json' } });
  const typst = list.typst.versions.find((v) => v.version === list.typst.builtIn).assets;
  assert.match(engineAsset(typst, 'x64', 'win32')[0], /windows-msvc\.zip$/);
  assert.match(engineAsset(list.tectonic.assets, 'x64', 'win32')[0], /windows-msvc\.zip$/);
  assert.match(engineAsset(typst, 'x64', 'darwin')[0], /^typst-x86_64-apple-darwin/);
  assert.match(engineAsset(list.tectonic.assets, 'arm64', 'darwin')[0], /aarch64-apple-darwin/);
});

const repo = (rel) => fs.readFile(path.join(import.meta.dirname, '..', '..', '..', rel), 'utf8');

test('the Windows app carries vcruntime140.dll beside its typst.exe, found with any Visual Studio that has it', async () => {
  // tauri.windows.conf.json's resources merge with the base map, and put the copy beside the app (and in tauri dev)
  const config = JSON.parse(await repo('src-tauri/tauri.windows.conf.json'));
  assert.equal(config.bundle.resources['resources/engines/vcruntime140.dll'], 'vcruntime140.dll');
  const script = await repo('scripts/desktop.mjs');
  assert.doesNotMatch(script, /copyFileSync\(windowsRuntime\(\), path\.join\(binDir/, 'nothing copied where the installer never looks');
  assert.match(script, /'-requires', 'Microsoft\.VisualStudio\.Component\.VC\.Tools\.x86\.x64'/);
  assert.match(script, /'Microsoft Visual Studio', 'Installer', 'vswhere\.exe'/);
});

test('the Windows workflow runs typst.exe by its path, and its tests after a failed set-up step', async () => {
  const workflow = await repo('.github/workflows/windows.yml');
  // GITHUB_PATH reaches only the steps after the one that writes it
  assert.match(workflow, /Add-Content \$env:GITHUB_PATH \$bin\n\s+& "\$bin\\typst\.exe" --version/);
  for (const step of ['TeX tools', 'Backend tests']) assert.match(workflow, new RegExp(`- name: ${step}\\n\\s+if: \\$\\{\\{ !cancelled\\(\\) \\}\\}`), step);
});

test('the desktop script runs through a link to it', { skip: process.platform === 'win32' && 'links need Developer Mode' }, async () => {
  const link = path.join(tmp, 'desktop-link.mjs');
  await fs.symlink(path.join(import.meta.dirname, '..', '..', '..', 'scripts', 'desktop.mjs'), link);
  const run = spawnSync(process.execPath, [link], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Usage: node scripts\/desktop\.mjs/);
});

test('the built-in version cannot be removed', async () => {
  useEngineList(typstList([release('9.9.9', sha)], '9.9.9'));
  await assert.rejects(removeTypst('9.9.9'), /built-in Typst can’t be removed/);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(tmp, { recursive: true, force: true });
});
