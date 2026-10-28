#!/usr/bin/env node
// Rebuild the bundled checkers. Sources and tools are pinned in native/checkers.lock.json.
//   node scripts/native.mjs [hunspell|harper|dictionaries|all|verify] [--update] [--archive file.tgz]
// --update refreshes the vendored Hunspell core (native/hunspell/core) from the pinned archive; Spectrum's binding stays.
// --archive supplies an offline archive for one engine; its pinned SHA-256 is still checked.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { x as extract } from 'tar';
import { createRequire } from 'node:module';
import { DICTIONARY_FILES, HARPER_FILES, hunPath, sha256 } from '../apps/backend/src/utils/checkerMetadata.js';
import { workerClient } from '../apps/backend/src/utils/workerClient.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE = join(ROOT, 'native');
const lock = JSON.parse(readFileSync(join(NATIVE, 'checkers.lock.json'), 'utf8'));
const win = process.platform === 'win32';
const json = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const digestFiles = (dir, files) => Object.fromEntries(files.map((file) => [file, sha256(readFileSync(join(dir, file)))]));

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: win && ['npm', 'npx'].includes(cmd), ...opts });
  if (res.status !== 0) throw new Error(`${cmd} failed (${res.error?.message || `exit ${res.status}`})`);
}
const versionOf = (cmd, args = ['--version']) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) throw new Error(`Cannot read ${cmd}'s version.`);
  return res.stdout.trim();
};

// Hash the actual build inputs, excluding generated output and dependency caches.
export function sourceHash(dir, roots = ['.']) {
  const hash = createHash('sha256');
  const visit = (relative) => {
    for (const entry of readdirSync(join(dir, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (['.git', 'target', 'node_modules', 'pkg', '.DS_Store'].includes(entry.name)) continue;
      const file = relative === '.' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) hash.update(file).update('\0').update(readFileSync(join(dir, file))).update('\0');
      else throw new Error(`Unsupported source entry: ${file}`);
    }
  };
  for (const root of [...roots].sort()) {
    const entry = lstatSync(join(dir, root));
    if (entry.isDirectory()) visit(root);
    else if (entry.isFile()) hash.update(root).update('\0').update(readFileSync(join(dir, root))).update('\0');
    else throw new Error(`Unsupported source entry: ${root}`);
  }
  return hash.digest('hex');
}
const CORE_INPUTS = ['src/hunspell', 'COPYING', 'COPYING.LESSER', 'COPYING.MPL', 'license.hunspell', 'license.myspell', 'AUTHORS'];
const BINDING_INPUTS = ['binding.cc', 'binding.gyp', 'package.json', 'package-lock.json'];

async function sourceArchive(pin, work, archive) {
  const bytes = archive ? readFileSync(resolve(archive)) : Buffer.from(await (async () => {
    const res = await fetch(pin.url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`${pin.url}: HTTP ${res.status}`);
    return res.arrayBuffer();
  })());
  if (sha256(bytes) !== pin.sha256) throw new Error(`Source archive checksum mismatch (got ${sha256(bytes)}). Nothing was installed.`);
  const packed = join(work, 'source.tgz');
  writeFileSync(packed, bytes);
  const dir = join(work, 'source');
  mkdirSync(dir);
  await extract({ file: packed, cwd: dir, strip: 1, strict: true, filter: (_name, entry) => ['File', 'Directory'].includes(entry.type) });
  return dir;
}

async function smoke(worker, workerData, request, check) {
  const client = workerClient(new URL(`../apps/backend/src/services/${worker}`, import.meta.url), workerData, { unavailable: 'Checker build self-test failed' });
  let timer;
  try {
    const result = await Promise.race([client.call(request), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Checker build self-test timed out.')), 60_000); })]);
    if (!check(result)) throw new Error('Checker build gave unexpected answers. Nothing was installed.');
  } finally {
    clearTimeout(timer);
    await client.terminate();
  }
}

function installFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  const staged = `${to}.new`;
  copyFileSync(from, staged);
  renameSync(staged, to);
}

// the English answers every build must give: en-AU's own words, American spellings and a misspelling flagged
const AU_CHECK = { op: 'check', words: ['colour', 'color', 'organise', 'recieve', 'defence'] };
const AU_ANSWER = (words) => words.join(',') === 'color,recieve';

async function buildHunspell(work, update, archive) {
  const original = join(NATIVE, 'hunspell');
  const dir = join(work, 'hunspell');
  mkdirSync(dir);
  for (const file of BINDING_INPUTS) cpSync(join(original, file), join(dir, file));
  const core = update ? await sourceArchive(lock.hunspell, work, archive) : join(original, 'core');
  const hash = sourceHash(core, CORE_INPUTS);
  if (hash !== lock.hunspell.sourceHash) throw new Error(`Hunspell source differs from its pin (got ${hash}). Use --update, or review and repin the new source.`);
  for (const file of CORE_INPUTS) cpSync(join(core, file), join(dir, 'core', file), { recursive: true });
  if (!existsSync(join(original, 'node_modules', 'node-addon-api'))) run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: original });
  cpSync(join(original, 'node_modules', 'node-addon-api'), join(dir, 'node_modules', 'node-addon-api'), { recursive: true });
  const slices = [];
  for (const arch of win ? ['x64'] : ['arm64', 'x64']) {
    run('npx', ['--yes', `node-gyp@${lock.tools.nodeGyp}`, 'rebuild', `--arch=${arch}`, '-j', '8'], { cwd: dir });
    const slice = join(work, `hunspell-${arch}.node`);
    copyFileSync(join(dir, 'build', 'Release', 'hunspell.node'), slice);
    slices.push(slice);
  }
  const staged = join(work, 'hunspell.node');
  if (win) copyFileSync(slices[0], staged);
  else {
    run('/usr/bin/lipo', ['-create', ...slices, '-output', staged]);
    run('/usr/bin/codesign', ['--force', '--sign', '-', staged]);
  }
  // the library's own version, and en_AU opened from a folder whose name is not ASCII (on Windows, the \\?\ path)
  const { Speller } = createRequire(import.meta.url)(staged);
  if (Speller.version() !== lock.hunspell.version) throw new Error(`The binding reports Hunspell ${Speller.version()}, not ${lock.hunspell.version}. Nothing was installed.`);
  const unicode = join(work, 'spectrum-拼写-é');
  mkdirSync(unicode);
  for (const file of ['en_AU.aff', 'en_AU.dic']) copyFileSync(join(ROOT, 'dictionaries', 'en_AU', file), join(unicode, file));
  const au = new Speller(hunPath(join(unicode, 'en_AU.aff')), hunPath(join(unicode, 'en_AU.dic')));
  if (au.encoding() !== 'UTF-8' || au.spell(['colour', 'color', 'naïve']).join() !== 'true,false,true') throw new Error('en_AU did not open from a folder with letters outside ASCII. Nothing was installed.');
  await smoke('spellWorker.mjs', { nativeDir: work, dictDir: join(ROOT, 'dictionaries') }, AU_CHECK, AU_ANSWER);
  const manifest = join(work, 'hunspell.manifest.json');
  const { version: bindingVersion } = JSON.parse(readFileSync(join(dir, 'package.json')));
  json(manifest, { schema: 1, engine: 'Hunspell', version: lock.hunspell.version, binding: { name: 'spectrum-hunspell', version: bindingVersion, sourceHash: sourceHash(dir, BINDING_INPUTS) }, source: lock.hunspell,
    build: { node: process.version, nodeGyp: lock.tools.nodeGyp, nodeAddonApi: JSON.parse(readFileSync(join(dir, 'node_modules/node-addon-api/package.json'))).version, platform: process.platform, architectures: win ? ['x64'] : ['arm64', 'x64'], selfTest: 'passed' }, files: digestFiles(work, ['hunspell.node']) });
  if (update) {
    rmSync(join(original, 'core'), { recursive: true, force: true });
    for (const file of CORE_INPUTS) cpSync(join(core, file), join(original, 'core', file), { recursive: true });
  }
  const dest = win ? join(NATIVE, 'win32-x64') : NATIVE;
  installFile(staged, join(dest, 'hunspell.node'));
  installFile(manifest, join(dest, 'hunspell.manifest.json'));
  console.log(`Hunspell ${lock.hunspell.version}: built, self-tested and installed.`);
}

async function buildHarper(work, archive) {
  const local = process.env.HARPER_DIR;
  const harper = local ? resolve(local) : await sourceArchive(lock.harper, work, archive);
  const version = JSON.parse(versionOf('cargo', ['metadata', '--no-deps', '--format-version', '1', '--manifest-path', join(harper, 'harper-wasm', 'Cargo.toml')])).packages.find((p) => p.name === 'harper-core')?.version;
  if (!version || version !== lock.harper.version) throw new Error(`Harper source version ${version || 'unknown'} differs from ${lock.harper.version} in checkers.lock.json.`);
  const wasmPack = spawnSync('wasm-pack', ['--version']).status === 0 ? 'wasm-pack' : join(homedir(), '.cargo', 'bin', 'wasm-pack');
  const out = join(work, 'harper');
  run(wasmPack, ['build', join(harper, 'harper-wasm'), '--target', 'web', '--release', '--out-dir', out, '--out-name', 'harper_wasm', '--no-default-features', '--locked']);
  copyFileSync(join(harper, 'LICENSE'), join(out, 'LICENSE'));
  writeFileSync(join(out, 'package.json'), '{ "type": "module" }\n');
  await smoke('grammarWorker.mjs', { nativeDir: work }, { text: 'This is a apple.', oxford: 'avoid', markdown: false }, (issues) => issues.some((i) => i.rule === 'AnA' && i.suggestions.some((s) => s.text === 'an')));
  // wasm-pack's extras, its '*' .gitignore among them, which would hide native/harper from git (a deny-list, as the
  // self-test above ran from out with whatever else Harper needs)
  for (const extra of ['.gitignore', 'README.md', 'harper_wasm.d.ts', 'harper_wasm_bg.wasm.d.ts']) rmSync(join(out, extra), { force: true });
  json(join(out, 'manifest.json'), { schema: 1, engine: 'Harper', version, source: local ? { kind: 'local override', sourceHash: sourceHash(harper) } : lock.harper,
    build: { rust: versionOf('rustc'), wasmPack: versionOf(wasmPack), target: 'wasm32-unknown-unknown', features: [], defaultFeatures: false, selfTest: 'passed' }, files: digestFiles(out, HARPER_FILES) });
  // Swap the matching JS/WASM pair as a directory; restore the old one if publication fails.
  const dest = join(NATIVE, 'harper');
  const backup = join(NATIVE, 'harper.previous');
  if (existsSync(backup)) throw new Error('native/harper.previous exists; inspect this earlier interrupted build first.');
  if (existsSync(dest)) renameSync(dest, backup);
  try { cpSync(out, dest, { recursive: true }); }
  catch (err) { rmSync(dest, { recursive: true, force: true }); if (existsSync(backup)) renameSync(backup, dest); throw err; }
  rmSync(backup, { recursive: true, force: true });
  console.log(`Harper ${version}: built, self-tested and installed.`);
}

async function dictionaries() {
  await smoke('spellWorker.mjs', { nativeDir: NATIVE, dictDir: join(ROOT, 'dictionaries') }, AU_CHECK, AU_ANSWER);
  // each English variant opens and passes its own self-test (spellWorker.mjs ENGLISH)
  for (const lang of ['en-US', 'en-GB', 'en-CA', 'en-IN']) await smoke('spellWorker.mjs', { nativeDir: NATIVE, dictDir: join(ROOT, 'dictionaries') }, { op: 'check', lang, words: [] }, (words) => Array.isArray(words));
  json(join(ROOT, 'dictionaries', 'manifest.json'), { schema: 1, version: lock.dictionaries.version, components: lock.dictionaries.components, files: digestFiles(join(ROOT, 'dictionaries'), DICTIONARY_FILES) });
  console.log('Dictionary versions and checksums recorded; Australian spelling self-test passed.');
}

async function main() {
  const [which = 'all', ...args] = process.argv.slice(2);
  if (!['hunspell', 'harper', 'dictionaries', 'all', 'verify'].includes(which)) throw new Error('Choose hunspell, harper, dictionaries, all or verify.');
  let update = false, archive;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--update') update = true;
    else if (arg === '--archive' && args[0]) archive = args.shift();
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  if (archive && !['hunspell', 'harper'].includes(which)) throw new Error('--archive requires one engine.');
  if (which === 'hunspell' && archive && !update) throw new Error('Use --update with a Hunspell source archive.');
  if (which === 'harper' && archive && process.env.HARPER_DIR) throw new Error('Choose --archive or HARPER_DIR, not both.');
  if (which === 'verify') {
    const spell = await import('../apps/backend/src/services/spellService.js');
    const grammar = await import('../apps/backend/src/services/grammarService.js');
    // the checkers' worker threads don't hold the process open (unref), so this does until both have answered
    const hold = setInterval(() => {}, 60_000);
    try {
      for (const status of await Promise.all([spell.spellStatus(), grammar.grammarStatus({ start: true })])) {
        console.log(JSON.stringify(status, null, 2));
        if (!status.available || status.diagnostics.assets.integrity !== 'verified' || (status.diagnostics.dictionaries && status.diagnostics.dictionaries.integrity !== 'verified')) process.exitCode = 1;
      }
    } finally {
      clearInterval(hold);
      await spell.stopSpeller();
      await grammar.stopGrammar();
    }
    return;
  }
  if (which === 'dictionaries') return dictionaries();
  const work = mkdtempSync(join(tmpdir(), 'spectrum-native-'));
  try {
    if (which === 'hunspell' || which === 'all') { const dir = join(work, 'spell'); mkdirSync(dir); await buildHunspell(dir, update, archive); }
    if (which === 'harper' || which === 'all') { const dir = join(work, 'grammar'); mkdirSync(dir); await buildHarper(dir, archive); }
    if (which === 'all' || which === 'hunspell') await dictionaries();
  } finally { rmSync(work, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((err) => { console.error(err.message); process.exitCode = 1; });
