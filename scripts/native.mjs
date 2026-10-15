#!/usr/bin/env node
// Builds the compiled parts of the spell and grammar checkers into native/:
//   native/nodehun.node             nodehun (Hunspell), universal arm64 + x86_64, ad-hoc signed
//   native/win32-x64/nodehun.node   on Windows: nodehun for x64 (not committed; CI builds it for the installer)
//   native/harper/harper_wasm.js    Harper's WebAssembly engine without the thesaurus or Typst
//   native/harper/harper_wasm_bg.wasm
// The results are committed, so `npm start` and the desktop build need no compiler.
//
//   node scripts/native.mjs [nodehun|harper|all]
//
// nodehun needs Xcode, or Visual Studio's C++ tools on Windows, and Python 3 (node-gyp comes through npx). Harper needs
// Rust with the wasm32-unknown-unknown target and wasm-pack, and is built from ../harper-master unless HARPER_DIR says otherwise.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE = join(ROOT, 'native');
const work = mkdtempSync(join(tmpdir(), 'spectrum-native-'));
const win = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  // npm and npx are .cmd scripts on Windows, which only run through a shell
  const shell = win && ['npm', 'npx'].includes(cmd);
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell, ...opts });
  if (res.status !== 0) throw new Error(`${cmd} failed (${res.error?.message || `exit ${res.status}`})`);
}

/** Two builds, one per architecture, joined with Apple's lipo (not the one some Python installs put first on PATH); one x64 build on Windows. */
function buildNodehun() {
  const dir = join(NATIVE, 'nodehun');
  if (!existsSync(join(dir, 'node_modules', 'node-addon-api'))) run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir });
  const slices = [];
  for (const arch of win ? ['x64'] : ['arm64', 'x64']) {
    run('npx', ['--yes', 'node-gyp@12', 'rebuild', `--arch=${arch}`, '-j', '8'], { cwd: dir });
    const slice = join(work, `nodehun-${arch}.node`);
    copyFileSync(join(dir, 'build', 'Release', 'Nodehun.node'), slice);
    slices.push(slice);
  }
  const out = win ? join(NATIVE, 'win32-x64', 'nodehun.node') : join(NATIVE, 'nodehun.node');
  if (win) {
    mkdirSync(dirname(out), { recursive: true });
    copyFileSync(slices[0], out);
  } else {
    run('/usr/bin/lipo', ['-create', ...slices, '-output', out]);
    // Tauri doesn't sign files in Resources, and the hardened runtime only loads signed code
    run('/usr/bin/codesign', ['--force', '--sign', '-', out]);
  }
  rmSync(join(dir, 'build'), { recursive: true, force: true });
  console.log(`Wrote ${out}`);
}

function buildHarper() {
  const harper = resolve(process.env.HARPER_DIR || join(ROOT, '..', 'harper-master'));
  if (!existsSync(join(harper, 'harper-wasm'))) throw new Error(`No Harper checkout at ${harper}. Set HARPER_DIR.`);
  const wasmPack = spawnSync('wasm-pack', ['--version']).status === 0 ? 'wasm-pack' : join(homedir(), '.cargo', 'bin', 'wasm-pack');
  const out = join(work, 'harper');
  run(wasmPack, ['build', join(harper, 'harper-wasm'), '--target', 'web', '--release', '--out-dir', out, '--out-name', 'harper_wasm', '--no-default-features']);
  const dest = join(NATIVE, 'harper');
  mkdirSync(dest, { recursive: true });
  for (const file of ['harper_wasm.js', 'harper_wasm_bg.wasm']) copyFileSync(join(out, file), join(dest, file));
  copyFileSync(join(harper, 'LICENSE'), join(dest, 'LICENSE'));
  // wasm-bindgen writes an ES module; this saves Node guessing
  writeFileSync(join(dest, 'package.json'), '{ "type": "module" }\n');
  console.log(`Wrote ${dest}`);
}

const which = process.argv[2] || 'all';
try {
  if (which === 'nodehun' || which === 'all') buildNodehun();
  if (which === 'harper' || which === 'all') buildHarper();
} finally {
  rmSync(work, { recursive: true, force: true });
}
