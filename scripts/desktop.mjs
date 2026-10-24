#!/usr/bin/env node
// Desktop app helper.
//   node scripts/desktop.mjs dev        run the shell against the repo backend (tauri dev)
//   node scripts/desktop.mjs build      universal Spectrum.app + .dmg on macOS, the x64 installer on Windows
//   node scripts/desktop.mjs resources  everything `build` bundles, without packaging
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { buildAgentSandbox } from './build-agent-sandbox.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = path.join(root, 'src-tauri');
const targetDir = process.env.CARGO_TARGET_DIR ? path.resolve(root, process.env.CARGO_TARGET_DIR) : path.join(tauriDir, 'target');
if (process.env.CARGO_TARGET_DIR) process.env.CARGO_TARGET_DIR = targetDir;
const resourcesDir = path.join(tauriDir, 'resources');
const binDir = path.join(tauriDir, 'binaries');
const win = process.platform === 'win32';
const cacheDir = win ? path.join(process.env.LOCALAPPDATA, 'spectrum-build') : path.join(os.homedir(), 'Library', 'Caches', 'spectrum-build');
const TRIPLES = win ? { x64: 'x86_64-pc-windows-msvc' } : { arm64: 'aarch64-apple-darwin', x64: 'x86_64-apple-darwin' };
const EXE = win ? '.exe' : '';

function run(cmd, args, opts = {}) {
  // npm and npx are .cmd scripts on Windows, which only run through a shell
  const shell = win && ['npm', 'npx'].includes(cmd);
  const res = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell, ...opts });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${res.status ?? res.signal})`);
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) throw new Error(`Missing ${path.relative(root, from)}`);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

async function bundleBackend() {
  const outDir = path.join(resourcesDir, 'backend');
  fs.rmSync(outDir, { recursive: true, force: true });
  await esbuild.build({
    // Workers run as threads of their own, from files beside server.mjs.
    entryPoints: {
      server: path.join(root, 'apps/backend/src/index.js'),
      spellWorker: path.join(root, 'apps/backend/src/services/spellWorker.mjs'),
      grammarWorker: path.join(root, 'apps/backend/src/services/grammarWorker.mjs'),
      latexTextWorker: path.join(root, 'apps/backend/src/latex/latexTextWorker.mjs')
    },
    outdir: outDir,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    minify: false,
    sourcemap: false,
    logLevel: 'warning',
    // optional S3 support in unzipper, never used
    external: ['@aws-sdk/client-s3'],
    // CommonJS dependencies call require(), which ES modules don't have
    banner: {
      js: "import { createRequire as __spectrumCreateRequire } from 'node:module';\nconst require = __spectrumCreateRequire(import.meta.url);",
    },
  });
  copyDir(path.join(root, 'apps/backend/src/latex/pylatexenc'), path.join(outDir, 'pylatexenc'));
  if (win) fs.copyFileSync(buildAgentSandbox(), path.join(outDir, 'Spectrum.AgentWorker.exe'));
  console.log(`Bundled backend → ${path.relative(root, path.join(outDir, 'server.mjs'))}`);
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function latestNode24() {
  const cached = path.join(cacheDir, 'index.json');
  let index;
  try {
    index = await (await fetchOk('https://nodejs.org/dist/index.json')).text();
    fs.writeFileSync(cached, index);
  } catch (err) {
    if (!fs.existsSync(cached)) throw err;
    console.warn(`Using the cached Node.js release list (${err.message})`);
    index = fs.readFileSync(cached, 'utf8');
  }
  const release = JSON.parse(index).find((r) => r.version.startsWith('v24.') && r.lts);
  if (!release) throw new Error('No Node.js 24 LTS release found');
  return release.version;
}

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function expectedSha(version, file) {
  const sumsFile = path.join(cacheDir, `SHASUMS256-${version}.txt`);
  if (!fs.existsSync(sumsFile)) {
    fs.writeFileSync(sumsFile, await (await fetchOk(`https://nodejs.org/dist/${version}/SHASUMS256.txt`)).text());
  }
  const line = fs.readFileSync(sumsFile, 'utf8').split('\n').find((l) => l.trim().endsWith(`  ${file}`));
  if (!line) throw new Error(`${file} isn't listed in SHASUMS256.txt for ${version}`);
  return line.split(/\s+/)[0];
}

/** Verified `bin/node` from the official darwin tarball (`node.exe` from the Windows zip), cached per version. */
async function nodeBinary(version, arch) {
  const name = `node-${version}-${win ? 'win' : 'darwin'}-${arch}`;
  const file = `${name}.${win ? 'zip' : 'tar.gz'}`;
  const outDir = path.join(cacheDir, name);
  const out = path.join(outDir, `node${EXE}`);
  if (fs.existsSync(out)) return out;

  const archive = path.join(cacheDir, file);
  const expected = await expectedSha(version, file);
  if (!fs.existsSync(archive) || sha256(archive) !== expected) {
    console.log(`Downloading ${file}…`);
    const res = await fetchOk(`https://nodejs.org/dist/${version}/${file}`);
    fs.writeFileSync(`${archive}.part`, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(`${archive}.part`, archive);
    if (sha256(archive) !== expected) {
      fs.rmSync(archive);
      throw new Error(`Checksum mismatch for ${file}`);
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  // Windows' own tar reads zips; the GNU tar that Git for Windows puts on PATH doesn't
  if (win) run(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xf', archive, '-C', outDir, '--strip-components', '1', `${name}/node.exe`]);
  else run('tar', ['-xzf', archive, '-C', outDir, '--strip-components', '2', `${name}/bin/node`]);
  return out;
}

/** Writes binaries/node-<triple> for each arch, plus the universal binary when both are asked for. */
async function nodeRuntime(arches) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  const version = await latestNode24();
  const bins = {};
  for (const arch of arches) {
    bins[arch] = await nodeBinary(version, arch);
    const dest = path.join(binDir, `node-${TRIPLES[arch]}${EXE}`);
    fs.copyFileSync(bins[arch], dest);
    fs.chmodSync(dest, 0o755);
  }
  if (bins.arm64 && bins.x64) {
    const universal = path.join(binDir, 'node-universal-apple-darwin');
    run('lipo', ['-create', bins.arm64, bins.x64, '-output', universal]);
    fs.chmodSync(universal, 0o755);
  }
  console.log(`Node.js ${version} (${arches.join(', ')}) → ${path.relative(root, binDir)}`);
}

async function resources() {
  run('npm', ['run', 'build']);
  await bundleBackend();
  copyDir(path.join(root, 'apps/frontend/dist'), path.join(resourcesDir, 'frontend'));
  // each platform its own icons: SF Symbols may only ship in apps for Apple platforms
  fs.rmSync(path.join(resourcesDir, 'frontend', win ? 'sf' : 'fluent'), { recursive: true, force: true });
  copyDir(path.join(root, 'templates'), path.join(resourcesDir, 'templates'));
  copyDir(path.join(root, 'dictionaries'), path.join(resourcesDir, 'dictionaries'));
  // the bundled skills (scripts/sync-skills.mjs), with their licences
  copyDir(path.join(root, 'skills'), path.join(resourcesDir, 'skills'));
  // the built nodehun and Harper only, not nodehun's sources
  const native = path.join(resourcesDir, 'native');
  fs.rmSync(native, { recursive: true, force: true });
  fs.mkdirSync(native, { recursive: true });
  copyDir(path.join(root, 'native/harper'), path.join(native, 'harper'));
  const nodehun = path.join(root, win ? 'native/win32-x64/nodehun.node' : 'native/nodehun.node');
  // the backend carries on without the spell checker, and says why
  if (win && !fs.existsSync(nodehun)) console.warn(`\nWARNING: no ${path.relative(root, nodehun)} (node scripts/native.mjs nodehun builds it), so this build has no spell checker.\n`);
  else fs.copyFileSync(nodehun, path.join(native, 'nodehun.node'));
  await nodeRuntime(Object.keys(TRIPLES));
}

async function build() {
  await resources();
  if (win) {
    run('npx', ['tauri', 'build', '--target', TRIPLES.x64]);
    const nsisDir = path.join(targetDir, `${TRIPLES.x64}/release/bundle/nsis`);
    for (const f of fs.readdirSync(nsisDir).filter((f) => f.endsWith('.exe'))) {
      console.log(`\nInstaller: ${path.join(nsisDir, f)}`);
    }
    return;
  }
  // CI skips the Finder AppleScript that lays out the DMG window
  run('npx', ['tauri', 'build', '--target', 'universal-apple-darwin'], { env: { ...process.env, CI: 'true' } });
  const bundle = path.join(targetDir, 'universal-apple-darwin/release/bundle');
  const dmgDir = path.join(bundle, 'dmg');
  console.log(`\nApp: ${path.join(bundle, 'macos/Spectrum.app')}`);
  for (const f of fs.readdirSync(dmgDir).filter((f) => f.endsWith('.dmg'))) {
    console.log(`DMG: ${path.join(dmgDir, f)}`);
  }
}

async function dev() {
  // the debug backend serves apps/frontend/dist from the repo
  run('npm', ['run', 'build']);
  // bundle inputs aren't used in dev, but tauri-build insists they exist
  for (const dir of ['backend', 'frontend', 'templates', 'native', 'dictionaries', 'skills']) fs.mkdirSync(path.join(resourcesDir, dir), { recursive: true });
  if (!fs.existsSync(path.join(binDir, `node-${TRIPLES[process.arch]}${EXE}`))) await nodeRuntime([process.arch]);
  run('npx', ['tauri', 'dev']);
}

const commands = { dev, build, resources };
const command = commands[process.argv[2]];
if (!command) {
  console.error('Usage: node scripts/desktop.mjs dev|build|resources');
  process.exit(1);
}
try {
  await command();
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
