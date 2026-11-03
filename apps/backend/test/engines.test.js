// Engines: what Settings shows (the built-in Typst and Tectonic, a Typst or pandoc on the PATH), installing a Typst
// version or Biber from a release served by a local server, its checksum, and the refusals. Throwaway data folders only.
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

// Biber's Mac release is a universal executable: here two slices, this Mac's a script that unpacks into the cache it is
// given, the other's a marker. Windows' holds biber.exe, which nothing runs
const MAC_CPU = { arm64: 0x0100000c, x64: 0x01000007 };
// (as Biber, it uses the cache only when the folder is there)
const biberScript = '#!/bin/sh\nmkdir "$PAR_GLOBAL_TMPDIR/unpacked"\necho "biber version: 2.17"\n';
const universal = (slices) => {
  const header = Buffer.alloc(8 + 20 * slices.length);
  header.writeUInt32BE(0xcafebabe, 0);
  header.writeUInt32BE(slices.length, 4);
  let offset = header.length;
  slices.forEach(([cpu, body], i) => {
    header.writeUInt32BE(cpu, 8 + 20 * i);
    header.writeUInt32BE(offset, 8 + 20 * i + 8);
    header.writeUInt32BE(body.length, 8 + 20 * i + 12);
    offset += body.length;
  });
  return Buffer.concat([header, ...slices.map(([, body]) => body)]);
};
const biberRelease = async (name, slices) => {
  const folder = path.join(tmp, name);
  await fs.mkdir(folder, { recursive: true });
  const file = WINDOWS ? 'biber.exe' : 'biber';
  await fs.writeFile(path.join(folder, file), WINDOWS ? 'MZ' : universal(slices), { mode: 0o755 });
  const tarball = path.join(tmp, name + '.tar.gz');
  execFileSync('tar', ['-czf', tarball, '-C', folder, file]);
  const data = await fs.readFile(tarball);
  return { tarball, sha: createHash('sha256').update(data).digest('hex'), bytes: data.length };
};
const here = process.arch === 'arm64' ? 'arm64' : 'x64';
const other = here === 'arm64' ? 'x64' : 'arm64';
const biberOk = await biberRelease('biber-ok', [[MAC_CPU[other], Buffer.from('OTHER MAC')], [MAC_CPU[here], Buffer.from(biberScript)]]);
const biberElsewhere = await biberRelease('biber-elsewhere', [[MAC_CPU[other], Buffer.from('OTHER MAC')]]);

// Tinymist's release holds tinymist in a folder of its own, as the real one does
const tinymistFile = WINDOWS ? 'tinymist.exe' : 'tinymist';
await fs.mkdir(path.join(tmp, 'tinymist-release', 'tinymist-here'), { recursive: true });
await fs.writeFile(path.join(tmp, 'tinymist-release', 'tinymist-here', tinymistFile), '#!/bin/sh\necho tinymist\n', { mode: 0o755 });
const tinymistTarball = path.join(tmp, 'tinymist.tar.gz');
execFileSync('tar', ['-czf', tinymistTarball, '-C', path.join(tmp, 'tinymist-release'), 'tinymist-here']);
const tinymistSha = createHash('sha256').update(await fs.readFile(tinymistTarball)).digest('hex');

const { installBiber, installTinymist, installTypst, listEngines, removeBiber, removeTinymist, removeTypst, tectonicBiber, tinymistProgram, typstFor, useEngineList } = await import('../src/services/engineService.js');

// serving: 'stall' sends a little and then nothing, 'drop' a little and then closes the connection
let serving = 'archive';
let served = archive;
const requests = [];
const server = createServer(async (req, res) => {
  requests.push(req.url);
  res.writeHead(200, { 'Content-Type': 'application/gzip' });
  if (serving === 'archive') return res.end(await fs.readFile(served));
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
  },
  biber: { version: '2.17', assets: { [ARCH]: ['MacOS/biber-darwin_universal.tar.gz', biberOk.sha, biberOk.bytes] } },
  tinymist: { version: '9.9.9', typst: '9.9.8', assets: { [ARCH]: ['tinymist-here.tar.gz', tinymistSha, 3] } }
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

test('the Mac app is built for Apple silicon only', async () => {
  const script = await repo('scripts/desktop.mjs');
  assert.match(script, /: \{ arm64: 'aarch64-apple-darwin' \};/);
  assert.match(script, /'tauri', 'build', '--target', TRIPLES\.arm64\]/);
  assert.doesNotMatch(script, /universal-apple-darwin|x86_64-apple-darwin|'lipo'/);
});

test('the desktop script runs through a link to it', { skip: process.platform === 'win32' && 'links need Developer Mode' }, async () => {
  const link = path.join(tmp, 'desktop-link.mjs');
  await fs.symlink(path.join(import.meta.dirname, '..', '..', '..', 'scripts', 'desktop.mjs'), link);
  const run = spawnSync(process.execPath, [link], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Usage: node scripts\/desktop\.mjs/);
});

test('Biber installs from its verified release, this Mac’s half only, unpacked into its own cache', async () => {
  useEngineList(typstList([], '9.9.8'));
  served = biberOk.tarball;
  requests.length = 0;
  try {
    assert.deepEqual((await listEngines()).biber, { installed: null, downloadable: '2.17', size: biberOk.bytes });
    // a second download asked for while the first runs finds it there
    const [first, second] = await Promise.all([installBiber(), installBiber()]);
    const biber = path.join(dataDir, 'engines', 'biber', WINDOWS ? 'biber.exe' : 'biber');
    assert.equal(first, biber);
    assert.equal(second, biber);
    assert.deepEqual(requests, ['/project/biblatex-biber/biblatex-biber/2.17/binaries/MacOS/biber-darwin_universal.tar.gz']);
    assert.equal(tectonicBiber(), biber);
    assert.equal((await listEngines()).biber.installed, '2.17');
    if (!WINDOWS) {
      assert.equal(await fs.readFile(biber, 'utf8'), biberScript);
      assert.ok((await fs.stat(path.join(dataDir, 'engines', 'biber', 'cache', 'unpacked'))).isDirectory(), 'unpacked at install');
    }
    await removeBiber();
    assert.equal(tectonicBiber(), null);
    await assert.rejects(fs.access(path.join(dataDir, 'engines', 'biber')));
  } finally {
    served = archive;
  }
});

test('a Biber download that does not match its checksum, or has no build for this Mac, leaves nothing behind', async () => {
  served = biberOk.tarball;
  try {
    useEngineList({ ...typstList([], '9.9.8'), biber: { version: '2.17', assets: { [ARCH]: ['MacOS/biber.tar.gz', '0'.repeat(64), 1] } } });
    await assert.rejects(installBiber(), /didn’t match its checksum/);
    if (!WINDOWS) {
      served = biberElsewhere.tarball;
      useEngineList({ ...typstList([], '9.9.8'), biber: { version: '2.17', assets: { [ARCH]: ['MacOS/biber.tar.gz', biberElsewhere.sha, 1] } } });
      await assert.rejects(installBiber(), /has no build for this Mac/);
    }
    await assert.rejects(fs.access(path.join(dataDir, 'engines', 'biber')));
    assert.deepEqual(await fs.readdir(path.join(dataDir, 'engines', 'tmp')).catch(() => []), []);
  } finally {
    served = archive;
  }
});

test('engines.json pins Biber 2.17, the release that matches the biblatex in Tectonic’s bundle, for every computer', async () => {
  const { default: list } = await import('../src/data/engines.json', { with: { type: 'json' } });
  assert.equal(list.biber.version, '2.17');
  assert.deepEqual(Object.keys(list.biber.assets).sort(), ['arm64', 'win-x64', 'x64']);
  for (const [file, sha256, size] of Object.values(list.biber.assets)) {
    assert.match(file, /^(MacOS|Windows)\/biber-/);
    assert.match(sha256, /^[0-9a-f]{64}$/);
    assert.ok(size > 0);
  }
});

test('Tinymist installs from its verified release into its version’s folder, and a newer pin asks for its own', async () => {
  delete process.env.SPECTRUM_TINYMIST;
  served = tinymistTarball;
  requests.length = 0;
  try {
    useEngineList(typstList([], '9.9.8'));
    assert.deepEqual((await listEngines()).tinymist, { installed: null, downloadable: '9.9.9', typst: '9.9.8', size: 3 });
    const installed = await installTinymist();
    assert.equal(installed, path.join(dataDir, 'engines', 'tinymist', '9.9.9', tinymistFile));
    assert.deepEqual(requests, ['/Myriad-Dreamin/tinymist/releases/download/v9.9.9/tinymist-here.tar.gz']);
    assert.deepEqual(tinymistProgram(), { path: installed, typst: '9.9.8' });
    assert.equal((await listEngines()).tinymist.installed, '9.9.9');
    // the next release's download takes the old one's place
    useEngineList({ ...typstList([], '9.9.8'), tinymist: { version: '9.9.10', typst: '9.9.9', assets: { [ARCH]: ['tinymist-here.tar.gz', tinymistSha, 3] } } });
    assert.equal(tinymistProgram(), null);
    await installTinymist();
    assert.deepEqual(await fs.readdir(path.join(dataDir, 'engines', 'tinymist')), ['9.9.10']);
    await removeTinymist();
    assert.equal(tinymistProgram(), null);
    useEngineList({ ...typstList([], '9.9.8'), tinymist: { version: '9.9.9', typst: '9.9.8', assets: { [ARCH]: ['tinymist-here.tar.gz', '0'.repeat(64), 3] } } });
    await assert.rejects(installTinymist(), /didn’t match its checksum/);
    await assert.rejects(fs.access(path.join(dataDir, 'engines', 'tinymist', '9.9.9')));
  } finally {
    served = archive;
  }
});

test('engines.json pins Tinymist with the Typst inside it, for Apple silicon and Windows', async () => {
  const { default: list } = await import('../src/data/engines.json', { with: { type: 'json' } });
  assert.match(list.tinymist.version, /^\d+\.\d+\.\d+$/);
  // its minor version follows Typst's
  assert.equal(list.tinymist.typst.split('.').slice(0, 2).join('.'), list.tinymist.version.split('.').slice(0, 2).join('.'));
  assert.deepEqual(Object.keys(list.tinymist.assets).sort(), ['arm64', 'win-x64']);
  for (const [file, sha256, size] of Object.values(list.tinymist.assets)) {
    assert.match(file, /^tinymist-(aarch64-apple-darwin\.tar\.gz|x86_64-pc-windows-msvc\.zip)$/);
    assert.match(sha256, /^[0-9a-f]{64}$/);
    assert.ok(size > 0);
  }
});

test('the built-in version cannot be removed', async () => {
  useEngineList(typstList([release('9.9.9', sha)], '9.9.9'));
  await assert.rejects(removeTypst('9.9.9'), /built-in Typst can’t be removed/);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(tmp, { recursive: true, force: true });
});
