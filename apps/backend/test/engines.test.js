// Engines: what Settings shows (the built-in Typst and Tectonic, a Typst or pandoc on the PATH), installing a Typst
// version from a release served by a local server, its checksum, and the refusals. Throwaway data folders only.
// Run: node --test apps/backend/test/engines.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { promises as fs, mkdtempSync, realpathSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-engines-')));
const fakeBin = path.join(tmp, 'bin');
const dataDir = path.join(tmp, 'data');
const archive = path.join(tmp, 'release.tar.gz');
const ARCH = process.platform === 'win32' ? 'win-x64' : process.arch === 'arm64' ? 'arm64' : 'x64';

process.env.HOME = path.join(tmp, 'home');
process.env.SPECTRUM_DATA_DIR = dataDir;
process.env.SPECTRUM_PROJECTS_DIR = path.join(tmp, 'projects');
process.env.SPECTRUM_TEMPLATE_DIR = path.join(tmp, 'templates');
process.env.PATH = [fakeBin, process.env.PATH].join(path.delimiter);
delete process.env.SPECTRUM_TYPST;
delete process.env.SPECTRUM_TECTONIC;

const fakeScript = async (name, output) => {
  await fs.mkdir(fakeBin, { recursive: true });
  const file = path.join(fakeBin, name);
  await fs.writeFile(file, '#!/bin/sh\necho ' + JSON.stringify(output) + '\n', { mode: 0o755 });
  chmodSync(file, 0o755);
};
await fakeScript('typst', 'typst 0.13.1 (abc123)');
await fakeScript('pandoc', 'pandoc 3.1.2\nCompiled with texmath 0.12');
await fs.mkdir(path.join(tmp, 'release'), { recursive: true });
await fs.writeFile(path.join(tmp, 'release', 'typst'), '#!/bin/sh\necho typst 9.9.9\n', { mode: 0o755 });
execFileSync('tar', ['-czf', archive, '-C', path.join(tmp, 'release'), 'typst']);
const bytes = (await fs.stat(archive)).size;
const sha = createHash('sha256').update(await fs.readFile(archive)).digest('hex');

const { installTypst, listEngines, removeTypst, typstFor, useEngineList } = await import('../src/services/engineService.js');

const server = createServer(async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/gzip' });
  res.end(await fs.readFile(archive));
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
  assert.equal(engines.typst.system.version, '0.13.1');
  assert.equal(engines.typst.system.path, path.join(fakeBin, 'typst'));
  assert.deepEqual(engines.typst.available.map((v) => v.version), engines.typst.builtIn ? versions.slice(1) : versions);
  assert.equal(engines.pandoc.found.version, '3.1.2');
  assert.equal(engines.pandoc.found.fromDownload, false);
  assert.equal(engines.pandoc.downloadable, '3.12.1');
  assert.deepEqual(engines.pandoc.minimum, { latex: '3.1', typst: '3.8.3' });
  assert.ok(engines.tectonic.builtIn === null || engines.tectonic.builtIn === '0.17.0');
});

test('a Typst version installs from its verified release and can be removed', async () => {
  useEngineList(typstList([release('9.9.9', sha)], '9.9.8'));
  const installed = await installTypst('9.9.9');
  assert.equal(installed, path.join(dataDir, 'engines', 'typst', '9.9.9', process.platform === 'win32' ? 'typst.exe' : 'typst'));
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

test('the built-in version cannot be removed', async () => {
  useEngineList(typstList([release('9.9.9', sha)], '9.9.9'));
  await assert.rejects(removeTypst('9.9.9'), /built-in Typst can’t be removed/);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(tmp, { recursive: true, force: true });
});
