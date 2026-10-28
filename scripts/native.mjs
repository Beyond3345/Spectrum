#!/usr/bin/env node
// Rebuild the bundled checkers. Sources and tools are pinned in native/checkers.lock.json.
//   node scripts/native.mjs [hunspell|harper|dictionaries|catalogue|all|verify] [--update] [--archive file.tgz] [--check]
// catalogue writes the language list with its pinned dictionaries; catalogue --check downloads them again and compares.
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

// ─── the language catalogue (apps/backend/src/data/languages.json) ───

// Each language's babel and polyglossia names and its LanguageTool code, where it has them. The dictionary sources
// and their pins are in checkers.lock.json's dictionarySources; a language here with no dictionary is offered for
// LanguageTool's grammar only (or, Traditional Chinese, for marks of its own).
const LANGUAGES = {
  'en-AU': [['australian'], 'en-AU'], 'en-US': [['american', 'english', 'USenglish'], 'en-US'], 'en-GB': [['british', 'UKenglish'], 'en-GB'],
  'en-CA': [['canadian'], 'en-CA'], 'en-IN': [[], 'en-GB'],
  af: [['afrikaans']], an: [[]], ar: [['arabic'], 'ar'], as: [['assamese']], ast: [['asturian'], 'ast-ES'], be: [['belarusian'], 'be-BY'],
  bg: [['bulgarian']], bn: [['bengali']], br: [['breton'], 'br-FR'], bs: [['bosnian']], ca: [['catalan'], 'ca-ES'], ckb: [['kurdish']],
  crh: [[], 'crh-UA'], cs: [['czech']], cy: [['welsh']], da: [['danish'], 'da-DK'], de: [['ngerman', 'german'], 'de-DE'], el: [['greek'], 'el-GR'],
  eo: [['esperanto'], 'eo'], es: [['spanish'], 'es'], et: [['estonian']], eu: [['basque']], fa: [['persian', 'farsi'], 'fa'], fo: [['faroese']],
  fr: [['french', 'francais'], 'fr'], fur: [['friulan']], fy: [[]], ga: [['irish'], 'ga-IE'], gd: [['scottish']], gl: [['galician'], 'gl-ES'],
  gu: [[]], he: [['hebrew']], hi: [['hindi']], hr: [['croatian']], hu: [['magyar', 'hungarian']], hy: [['armenian']], hyw: [[]],
  ia: [['interlingua']], id: [['indonesian', 'bahasai']], ie: [[]], is: [['icelandic']], it: [['italian'], 'it'], ja: [['japanese'], 'ja-JP'],
  ka: [['georgian']], km: [['khmer'], 'km-KH'], kmr: [['kurmanji']], kn: [['kannada']], ko: [['korean']], la: [['latin']], lb: [['luxembourgish']],
  lij: [[]], lt: [['lithuanian']], ltg: [[]], lv: [['latvian']], mk: [['macedonian']], mn: [['mongolian']], mr: [['marathi']],
  nb: [['norsk', 'norwegian', 'bokmal']], nds: [[]], ne: [['nepali']], nl: [['dutch'], 'nl'], nn: [['nynorsk']], oc: [['occitan']],
  pl: [['polish'], 'pl-PL'], 'pt-BR': [['brazilian', 'brazil'], 'pt-BR'], 'pt-PT': [['portuguese', 'portuges'], 'pt-PT'], ro: [['romanian'], 'ro-RO'],
  ru: [['russian'], 'ru-RU'], rw: [[]], si: [['sinhala']], sk: [['slovak'], 'sk-SK'], sl: [['slovene', 'slovenian'], 'sl-SI'], sq: [['albanian']],
  'sr-Cyrl': [['serbianc']], 'sr-Latn': [['serbian']], sv: [['swedish'], 'sv'], sw: [['swahili']], ta: [['tamil'], 'ta-IN'], te: [['telugu']],
  th: [['thai']], tk: [['turkmen']], tl: [[], 'tl-PH'], tr: [['turkish']], uk: [['ukrainian'], 'uk-UA'], vi: [['vietnamese']],
  'zh-CN': [[], 'zh-CN'], 'zh-TW': [[]]
};
const ENGLISH = { 'en-AU': ['Australian', 'en_AU'], 'en-US': ['American', 'en_US'], 'en-GB': ['British', 'en_GB'], 'en-CA': ['Canadian', 'en_CA'], 'en-IN': ['Indian', 'en_GB'] };
// the script of a language with no dictionary to read it from (Japanese is Han with kana; detection knows)
const SCRIPTS = { ast: 'Latin', crh: 'Latin', ja: 'Han', km: 'Khmer', tl: 'Latin', 'zh-CN': 'Han', 'zh-TW': 'Han' };
const CANDIDATE_SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Armenian', 'Georgian', 'Devanagari', 'Bengali', 'Gujarati', 'Kannada', 'Tamil', 'Telugu', 'Sinhala', 'Thai', 'Lao', 'Khmer', 'Hangul', 'Han'];

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Where each catalogued dictionary's three files come from, by tag. */
function dictionaryFiles() {
  const out = {};
  const { wooorm, libreoffice } = lock.dictionarySources;
  for (const [tag, pin] of Object.entries(wooorm.tags)) {
    const { dir, licence = 'license' } = typeof pin === 'string' ? { dir: pin } : pin;
    out[tag] = { source: 'wooorm/dictionaries', commit: wooorm.commit, aff: `${wooorm.base}${dir}/index.aff`, dic: `${wooorm.base}${dir}/index.dic`, licence: `${wooorm.base}${dir}/${licence}`, spdx: `${wooorm.base}${dir}/package.json` };
  }
  for (const [tag, { dictionary, licence, spdx }] of Object.entries(libreoffice.tags)) {
    out[tag] = { source: 'LibreOffice/dictionaries', commit: libreoffice.commit, aff: `${libreoffice.base}${dictionary}.aff`, dic: `${libreoffice.base}${dictionary}.dic`, licence: `${libreoffice.base}${licence}`, spdx };
  }
  return out;
}

const affLine = (aff, key) => aff.match(new RegExp(`^${key}[ \\t]+([^ \\t\\r\\n]+)`, 'm'))?.[1];

/** One dictionary checked through the binding: its encoding, script, word characters and three self-test words. */
function inspectDictionary(Speller, dir, affBytes, dicBytes) {
  const affText = affBytes.toString('latin1').replace(/^\xEF\xBB\xBF/, '');
  const set = affLine(affText, 'SET') || 'ISO8859-1';
  if (set !== 'UTF-8' && set !== 'ISO8859-1') throw new Error(`its encoding is ${set}`);
  const decode = (bytes) => bytes.toString(set === 'UTF-8' ? 'utf8' : 'latin1');
  writeFileSync(join(dir, 'dictionary.aff'), affBytes);
  writeFileSync(join(dir, 'dictionary.dic'), dicBytes);
  const speller = new Speller(hunPath(join(dir, 'dictionary.aff')), hunPath(join(dir, 'dictionary.dic')));
  const words = decode(dicBytes).split('\n').slice(1).map((line) => line.split(/[/\t ]/)[0].trim()).filter((w) => /^[\p{L}\p{M}]{3,}$/u.test(w));
  const counts = Object.fromEntries(CANDIDATE_SCRIPTS.map((s) => [s, 0]));
  for (const word of words.slice(0, 5000)) for (const s of CANDIDATE_SCRIPTS) if (new RegExp(`\\p{Script=${s}}`, 'u').test(word)) counts[s]++;
  const script = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!script[1]) throw new Error('its words are in no script Spectrum knows');
  // three words from across the list that the dictionary itself accepts; a broken or half-read copy will not
  const selfTest = [];
  for (const at of [0.25, 0.5, 0.75]) {
    const start = Math.floor(words.length * at);
    const pick = words.slice(start, start + 200).find((w) => !selfTest.includes(w) && speller.spell([w])[0]);
    if (pick) selfTest.push(pick);
  }
  if (selfTest.length < 3) throw new Error('it did not accept three of its own words');
  const wordChars = [...new Set(decode(Buffer.from(affLine(affText, 'WORDCHARS') || '', 'latin1')))].filter((c) => !/[\p{L}\p{M}\p{N}]/u.test(c)).join('');
  return { encoding: set, script: script[0], wordChars, selfTest };
}

async function catalogue(check) {
  const file = join(ROOT, 'apps', 'backend', 'src', 'data', 'languages.json');
  if (check) {
    const failed = [];
    for (const entry of JSON.parse(readFileSync(file, 'utf8')).languages) {
      for (const [name, [url, hash]] of Object.entries(entry.spelling?.files || {})) {
        const bytes = await download(url).catch(() => null);
        if (!bytes || sha256(bytes) !== hash) failed.push(`${entry.tag} ${name}`);
      }
    }
    if (failed.length) throw new Error(`These files no longer match the catalogue: ${failed.join(', ')}`);
    console.log('Every catalogued dictionary file still matches its checksum.');
    return;
  }
  const { Speller } = createRequire(import.meta.url)(existsSync(join(NATIVE, `${process.platform}-${process.arch}`, 'hunspell.node')) ? join(NATIVE, `${process.platform}-${process.arch}`, 'hunspell.node') : join(NATIVE, 'hunspell.node'));
  const sources = dictionaryFiles();
  const work = mkdtempSync(join(tmpdir(), 'spectrum-catalogue-'));
  const languages = [], refused = [];
  try {
    for (const tag of Object.keys(LANGUAGES).sort()) {
      const [babel, languageTool = null] = LANGUAGES[tag];
      const base = { tag, babel, harper: ENGLISH[tag]?.[0] || null, languageTool };
      if (ENGLISH[tag]) {
        languages.push({ ...base, script: 'Latin', wordChars: '', spelling: { bundled: ENGLISH[tag][1] } });
        continue;
      }
      const from = sources[tag];
      if (!from) {
        if (languageTool || tag === 'zh-TW') languages.push({ ...base, script: SCRIPTS[tag], wordChars: '', spelling: null });
        else refused.push(`${tag}: no dictionary and no grammar checker`);
        continue;
      }
      try {
        const [aff, dic, licence] = await Promise.all([download(from.aff), download(from.dic), download(from.licence)]);
        if (!licence.length) throw new Error('its licence file is empty');
        const spdx = from.spdx.startsWith('https:') ? JSON.parse((await download(from.spdx)).toString('utf8')).license?.replace(/^\((.*)\)$/, '$1') : from.spdx;
        if (!spdx) throw new Error('it names no licence');
        const dir = join(work, tag);
        mkdirSync(dir);
        const { encoding, script, wordChars, selfTest } = inspectDictionary(Speller, dir, aff, dic);
        const pin = (url, bytes) => [url, sha256(bytes), bytes.length];
        languages.push({ ...base, script, wordChars, spelling: { source: from.source, commit: from.commit, files: { aff: pin(from.aff, aff), dic: pin(from.dic, dic), licence: pin(from.licence, licence) }, encoding, licence: spdx, selfTest } });
        console.log(`kept ${tag}: ${script}, ${encoding}, ${spdx}, ${((aff.length + dic.length) / 1e6).toFixed(1)} MB, self-test ${selfTest.join(' ')}`);
      } catch (err) {
        if (languageTool) languages.push({ ...base, script: SCRIPTS[tag] || null, wordChars: '', spelling: null });
        refused.push(`${tag}: ${err.message}${languageTool ? ' (kept for LanguageTool’s grammar)' : ''}`);
      }
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  json(file, { schema: 1, sources: Object.fromEntries(Object.entries(lock.dictionarySources).map(([name, { commit }]) => [name, commit])), languages });
  console.log(`\n${languages.length} languages kept (${languages.filter((l) => l.spelling?.files).length} with a downloadable dictionary).`);
  if (refused.length) console.log(`Refused:\n  ${refused.join('\n  ')}`);
}

async function main() {
  const [which = 'all', ...args] = process.argv.slice(2);
  if (!['hunspell', 'harper', 'dictionaries', 'catalogue', 'all', 'verify'].includes(which)) throw new Error('Choose hunspell, harper, dictionaries, catalogue, all or verify.');
  if (which === 'catalogue') return catalogue(args.includes('--check'));
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
