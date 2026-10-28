// Dictionaries downloaded when asked (spellService installDictionary), Spectrum's Hunspell binding, and Harper's
// ignored rules across a rename. Against a stand-in server on 127.0.0.1 and throwaway data and projects folders.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-dictionaries-')));
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { NATIVE_DIR } = await import('../src/config/constants.js');
const { hunPath } = await import('../src/utils/checkerMetadata.js');
const spell = await import('../src/services/spellService.js');
const grammar = await import('../src/services/grammarService.js');
const { createProject, getProjectRoot } = await import('../src/services/projectService.js');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const platformModule = path.join(NATIVE_DIR, `${process.platform}-${process.arch}`, 'hunspell.node');
const { Speller } = createRequire(import.meta.url)(existsSync(platformModule) ? platformModule : path.join(NATIVE_DIR, 'hunspell.node'));

// a small Latin-1 dictionary, as LibreOffice's Indonesian one is, and its UTF-8 twin
const LATIN = {
  aff: Buffer.from('SET ISO8859-1\nTRY aeéioïuçncfdtv\n', 'latin1'),
  dic: Buffer.from('4\ncafé\nnaïve\nfaçade\ndevant\n', 'latin1'),
  licence: Buffer.from('Free to use.\n')
};

// the stand-in server: /<name> answers files[name], or a 404; serving 'trickle' sends it in four pieces 100 ms apart,
// 'stall' a byte of it and then nothing
const files = {};
let serving = 'whole';
const server = createServer((req, res) => {
  const body = files[req.url.slice(1)];
  if (!body || serving === 'whole') return res.writeHead(body ? 200 : 404).end(body);
  res.writeHead(200);
  if (serving === 'stall') return res.write(body.subarray(0, 1));
  const step = Math.ceil(body.length / 4);
  const send = (at) => (at >= body.length ? res.end() : (res.write(body.subarray(at, at + step)), setTimeout(send, 100, at + step)));
  send(0);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  server.close();
  await spell.stopSpeller();
  await grammar.stopGrammar();
  rmSync(tmp, { recursive: true, force: true });
});

/** A catalogue with Australian English and one downloadable language served from `name`. */
function catalogueFor(tag, name, dictionary = LATIN, { selfTest = ['café', 'naïve', 'devant'], hashes = {} } = {}) {
  for (const part of ['aff', 'dic', 'licence']) files[`${name}.${part}`] = dictionary[part];
  const pin = (part) => [`${base}/${name}.${part}`, hashes[part] || sha(dictionary[part]), dictionary[part].length];
  spell.useLanguageList({ schema: 1, languages: [
    { tag: 'en-AU', script: 'Latin', babel: [], harper: 'Australian', languageTool: 'en-AU', wordChars: '', spelling: { bundled: 'en_AU' } },
    { tag, script: 'Latin', babel: [], harper: null, languageTool: null, wordChars: '',
      spelling: { source: 'test', commit: name, files: { aff: pin('aff'), dic: pin('dic'), licence: pin('licence') }, encoding: 'ISO8859-1', licence: 'MIT', selfTest } }
  ] });
}
const downloads = () => path.join(tmp, 'data', 'dictionaries');
const leftovers = () => (existsSync(downloads()) ? readdirSync(downloads()).filter((f) => /\.(part|old)-/.test(f)) : []);
const stateOf = async (tag) => (await spell.listLanguages()).find((l) => l.tag === tag);

test('the binding is Hunspell 1.7.6, opens a folder whose name is not ASCII, and spells and suggests through Latin-1', () => {
  assert.equal(Speller.version(), '1.7.6');
  const dir = path.join(tmp, 'spectrum-拼写-é');
  mkdirSync(dir);
  for (const file of ['en_AU.aff', 'en_AU.dic']) writeFileSync(path.join(dir, file), readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'dictionaries', 'en_AU', file)));
  const au = new Speller(hunPath(path.join(dir, 'en_AU.aff')), hunPath(path.join(dir, 'en_AU.dic')));
  assert.deepEqual(au.spell(['colour', 'color', 'naïve']), [true, false, true]);
  writeFileSync(path.join(dir, 'l.aff'), LATIN.aff);
  writeFileSync(path.join(dir, 'l.dic'), LATIN.dic);
  const latin = new Speller(hunPath(path.join(dir, 'l.aff')), hunPath(path.join(dir, 'l.dic')));
  assert.equal(latin.encoding(), 'ISO8859-1');
  assert.deepEqual(latin.spell(['café', 'naïve', 'cafe', 'naïve€', 'façade']), [true, true, false, false, true]);
  assert.ok(latin.suggest('cafe').includes('café'));
  writeFileSync(path.join(dir, 'k.aff'), 'SET KOI8-R\n');
  writeFileSync(path.join(dir, 'k.dic'), '1\nx\n');
  assert.throws(() => new Speller(path.join(dir, 'k.aff'), path.join(dir, 'k.dic')), /Unsupported dictionary encoding KOI8-R/);
});

test('a Windows path to Hunspell takes the \\\\?\\ form', () => {
  assert.equal(hunPath('C:/Users/张/AppData/x.aff', 'win32'), '\\\\?\\C:\\Users\\张\\AppData\\x.aff');
  assert.equal(hunPath('\\\\server\\share\\x.dic', 'win32'), '\\\\?\\UNC\\server\\share\\x.dic');
  assert.equal(hunPath('\\\\?\\C:\\x.dic', 'win32'), '\\\\?\\C:\\x.dic');
  assert.equal(hunPath('/Users/a/x.dic', 'darwin'), '/Users/a/x.dic');
});

test('a dictionary downloads only when asked, is checked and installed with its source.json, and spells', async () => {
  catalogueFor('xx', 'one');
  assert.equal((await stateOf('xx')).state, 'available');
  assert.equal((await stateOf('en-AU')).state, 'bundled');
  await assert.rejects(() => spell.checkWords(['café'], undefined, 'xx'), /isn’t downloaded/);
  assert.deepEqual(await spell.installDictionary('xx'), { tag: 'xx', state: 'downloaded' });
  const installed = path.join(downloads(), 'xx');
  assert.deepEqual(readdirSync(installed).sort(), ['LICENSE', 'dictionary.aff', 'dictionary.dic', 'source.json']);
  assert.deepEqual(JSON.parse(readFileSync(path.join(installed, 'source.json'), 'utf8')),
    { tag: 'xx', source: 'test', commit: 'one', files: { 'dictionary.aff': sha(LATIN.aff), 'dictionary.dic': sha(LATIN.dic), LICENSE: sha(LATIN.licence) } });
  assert.deepEqual(await stateOf('xx'), { tag: 'xx', script: 'Latin', harper: null, languageTool: null, state: 'downloaded', bytes: LATIN.aff.length + LATIN.dic.length + LATIN.licence.length, licence: 'MIT', source: 'test' });
  assert.deepEqual(await spell.checkWords(['café', 'cafe', 'naïve', 'LaTeX'], undefined, 'xx'), ['cafe']);
  assert.ok((await spell.suggestWord('cafe', 'xx')).includes('café'));
  assert.deepEqual(await spell.checkWords(['colour', 'color']), ['color'], 'Australian English as before');
  assert.deepEqual(leftovers(), []);
});

test('an abbreviation the dictionary keeps with its full stop passes before one, and only there', async () => {
  const words = Buffer.from('5\nBrot\nund\nusw.\nca.\nNr.\n');
  catalogueFor('de', 'abbreviations', { ...LATIN, aff: Buffer.from('SET UTF-8\n'), dic: words }, { selfTest: ['Brot'] });
  await spell.installDictionary('de');
  const text = 'Brot usw. und ca. Nr. 5, Brot usw und Brot.';
  const { pieces: [piece] } = await spell.checkPieces({ languages: ['de'], main: 'de', pieces: [{ text }] });
  assert.deepEqual(piece.misspelt.map(([from, to]) => text.slice(from, to)), ['usw']);
  assert.deepEqual(await spell.pruneDictionaries(['en-AU', 'xx']), { removed: ['de'] });
});

test('a repinned dictionary counts as not downloaded, and downloading it replaces the old folder', async () => {
  const newer = { ...LATIN, dic: Buffer.from('5\ncafé\nnaïve\nfaçade\ndevant\nchâteau\n', 'latin1') };
  catalogueFor('xx', 'two', newer);
  assert.equal((await stateOf('xx')).state, 'available');
  await spell.installDictionary('xx');
  assert.equal(JSON.parse(readFileSync(path.join(downloads(), 'xx', 'source.json'), 'utf8')).commit, 'two');
  assert.deepEqual(await spell.checkWords(['château', 'chateau'], undefined, 'xx'), ['chateau'], 'the new copy is the one used');
  assert.deepEqual(leftovers(), []);
});

test('a checksum mismatch, an encoding Spectrum can’t read or a failed self-test leaves nothing behind', async () => {
  catalogueFor('yy', 'bad-sum', LATIN, { hashes: { dic: '0'.repeat(64) } });
  await assert.rejects(() => spell.installDictionary('yy'), /didn’t match its checksum/);
  assert.equal(existsSync(path.join(downloads(), 'yy')), false);
  assert.equal((await stateOf('yy')).state, 'failed');

  catalogueFor('yy', 'koi', { ...LATIN, aff: Buffer.from('SET KOI8-R\n') });
  await assert.rejects(() => spell.installDictionary('yy'), /in KOI8-R/);

  catalogueFor('yy', 'self-test', LATIN, { selfTest: ['café', 'unknownword', 'devant'] });
  await assert.rejects(() => spell.installDictionary('yy'), /self-test/);
  assert.equal(existsSync(path.join(downloads(), 'yy')), false);
  assert.deepEqual(leftovers(), []);
});

test('no connection gives a plain message, is not retried on its own, and other languages carry on', async () => {
  // nothing listens on port 9 (discard) on 127.0.0.1, so the connection is refused
  spell.useLanguageList({ schema: 1, languages: [
    { tag: 'en-AU', script: 'Latin', babel: [], harper: 'Australian', languageTool: 'en-AU', wordChars: '', spelling: { bundled: 'en_AU' } },
    { tag: 'zz', script: 'Latin', babel: [], harper: null, languageTool: null, wordChars: '',
      spelling: { source: 'test', commit: 'x', files: Object.fromEntries(['aff', 'dic', 'licence'].map((part) => [part, [`http://127.0.0.1:9/zz.${part}`, sha(LATIN[part]), LATIN[part].length]])), encoding: 'ISO8859-1', licence: 'MIT', selfTest: ['café'] } }
  ] });
  await assert.rejects(() => spell.installDictionary('zz'), /Couldn’t download the zz dictionary\. Check the internet connection and try again\./);
  const zz = await stateOf('zz');
  assert.equal(zz.state, 'failed');
  assert.match(zz.error, /Check the internet connection/);
  assert.equal((await stateOf('zz')).state, 'failed', 'still failed: nothing tries again until asked');
  assert.deepEqual(await spell.checkWords(['colour', 'color']), ['color']);
  assert.deepEqual(leftovers(), []);
});

test('unused dictionaries can be removed', async () => {
  catalogueFor('xx', 'one');
  await spell.installDictionary('xx');
  mkdirSync(path.join(downloads(), 'qq.part-stale'));
  assert.deepEqual(await spell.pruneDictionaries(['en-AU']), { removed: ['xx'] });
  assert.deepEqual(readdirSync(downloads()), []);
});

test('a slow but steady download finishes, and one that stalls is stopped', async () => {
  catalogueFor('ss', 'slow');
  // each file takes about 400 ms, longer than the idle time, with data every 100 ms
  process.env.SPECTRUM_DOWNLOAD_IDLE_MS = '250';
  try {
    serving = 'trickle';
    assert.deepEqual(await spell.installDictionary('ss'), { tag: 'ss', state: 'downloaded' });
    serving = 'stall';
    await assert.rejects(() => spell.installDictionary('ss'), /Couldn’t download the ss dictionary/);
  } finally {
    serving = 'whole';
    delete process.env.SPECTRUM_DOWNLOAD_IDLE_MS;
  }
  assert.deepEqual(leftovers(), []);
});

test('an ignored rule Harper has since renamed hides the new name too, and grammar.json is not rewritten', async () => {
  const project = await createProject({ name: 'Ignored rules', populate: async () => {} });
  const file = path.join(await getProjectRoot(project.id), '.spectrum', 'grammar.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '{ "ignoredRules": ["NobelPeacePrize"] }\n');
  assert.deepEqual((await grammar.readIgnoredRules(project.id)).sort(), ['NobelNoble', 'NobelPeacePrize']);
  assert.equal(readFileSync(file, 'utf8'), '{ "ignoredRules": ["NobelPeacePrize"] }\n');
  assert.deepEqual(await grammar.changeIgnoredRule(project.id, 'AnA'), ['AnA', 'NobelNoble', 'NobelPeacePrize']);
  assert.deepEqual(await grammar.changeIgnoredRule(project.id, 'NobelNoble', true), ['AnA'], 'removing the new name removes the old one');
});
