// LanguageTool on this computer (languageToolService.js) and grammar by language (grammarService checkGrammar), against
// stand-in servers on 127.0.0.1: the request's annotation and fields, offsets back into the file, parts, cancelling and
// failures; the download with its checksums; and starting, using and stopping a stand-in "Java" that serves the fake
// LanguageTool. Throwaway data and projects folders; no network, no real Java.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { languageToolHandler } from './fixtures/fake-languagetool.mjs';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-languagetool-')));
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const lt = await import('../src/services/languageToolService.js');
const grammar = await import('../src/services/grammarService.js');
const spell = await import('../src/services/spellService.js');
const { maskLatex } = await import('../src/latex/mask.js');
const { createProject, getProjectRoot } = await import('../src/services/projectService.js');

const servers = [];
async function serve(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
after(async () => {
  await lt.stopLanguageTool();
  for (const server of servers) server.close();
  await spell.stopSpeller();
  await grammar.stopGrammar();
  rmSync(tmp, { recursive: true, force: true });
});

/** What LanguageTool reads from an annotation: text as it is, markup as what it's read as. */
const reads = (annotation) => annotation.map((item) => item.text ?? item.interpretAs).join('');
const sent = (annotation) => annotation.map((item) => item.text ?? item.markup).join('');

test('the annotation sends no LaTeX: prose as text, markup as spaces read as what the prose has', () => {
  const tex = String.raw`Some bread \cite{key}. With $x^2$ values and \LaTeX{} here.`;
  const prose = maskLatex(tex);
  const items = lt.annotate(tex, prose, 0, tex.length);
  assert.equal(reads(items), 'Some bread. With x values and LaTeX here.');
  assert.equal(sent(items).length, tex.length, 'each item as long as the source it stands for');
  assert.ok(!/[\\$^{}]|cite|key/.test(sent(items)), 'no LaTeX source in the request');
});

test('runs go in parts of at most 20,000 characters, cut at the end of a run', () => {
  const para = `${'Ein Satz mit Wörtern. '.repeat(45)}\n\n`;
  const text = para.repeat(50);
  const runs = [];
  for (let at = 0; at < text.length; at += para.length) runs.push([at, at + para.length - 2]);
  const chunks = lt.parts(text, text, runs);
  assert.ok(text.length > 49_000 && chunks.length === 3, `${chunks.length} parts`);
  for (const chunk of chunks) assert.ok(chunk.length <= 20_000);
  assert.equal(chunks.reduce((n, c) => n + c.table.length, 0), 50);
});

test('a check sends one language’s runs only, with its fields, and maps each match back into the file', async () => {
  const requests = [];
  const server = await serve(languageToolHandler({ requests }));
  const source = 'English first 😀 teh line.\r\n\r\nDas ist das das Haus 😀 und teh Ende.\r\n\r\n% Kommentar teh\r\nNoch \\cite{x}. das das';
  const prose = maskLatex(source);
  const second = source.indexOf('Das');
  const third = source.indexOf('Noch');
  const runs = [[second, source.indexOf('\r\n\r\n%')], [third, source.length]];
  const res = await lt.checkWithLanguageTool({ server, source, prose, runs, code: 'de-DE', lang: 'de', ignored: ['A', 'B'], spelt: true, style: false });
  assert.equal(res.state, 'checked');
  assert.deepEqual(res.issues.map((i) => source.slice(i.from, i.to)), ['das das', 'teh', 'das das']);
  assert.deepEqual(res.issues.map((i) => [i.engine, i.lang, i.kind, i.fixable]), Array(3).fill(['languagetool', 'de', 'Grammar', true]));
  const [form] = requests;
  assert.equal(form.language, 'de-DE');
  assert.equal(form.disabledRules, 'A,B');
  assert.equal(form.disabledCategories, 'TYPOS');
  assert.equal(form.level, undefined, 'picky only with style suggestions');
  const data = sent(JSON.parse(form.data).annotation);
  assert.ok(!data.includes('English') && !data.includes('Kommentar') && !data.includes('cite'), 'no English, comment or LaTeX source');
  await lt.checkWithLanguageTool({ server, source, prose, runs, code: 'de-DE', lang: 'de', style: true });
  assert.equal(requests[1].level, 'picky');
  assert.equal(requests[1].disabledCategories, undefined);
});

test('cancelling stops between parts; failures say what happened and keep the parts already checked', async () => {
  const requests = [];
  const controller = new AbortController();
  const slow = await serve(languageToolHandler({ requests, answer: (form, res) => {
    controller.abort();
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ matches: [] }));
  } }));
  const text = `${'Wort '.repeat(3000)}\n\n`.repeat(3);
  const runs = [0, 1, 2].map((k) => [k * 15002, k * 15002 + 15000]);
  const cancelled = await lt.checkWithLanguageTool({ server: slow, source: text, prose: text, runs, code: 'de-DE', lang: 'de', signal: controller.signal });
  // the part in flight is dropped, and no further part is sent
  assert.deepEqual([cancelled.state, cancelled.parts, requests.length], ['cancelled', 3, 1]);
  assert.equal(cancelled.message, `Cancelled: ${cancelled.done} of 3 parts checked.`);

  let calls = 0;
  const flaky = await serve((req, res) => {
    req.resume();
    req.on('end', () => (++calls === 1 ? res.writeHead(200).end('{"matches":[]}') : res.writeHead(200).end('not json')));
  });
  const bad = await lt.checkWithLanguageTool({ server: flaky, source: text, prose: text, runs, code: 'de-DE', lang: 'de' });
  assert.deepEqual([bad.state, bad.done, bad.message], ['failed', 1, 'LanguageTool gave an answer Spectrum couldn’t read.']);
  const refused = await lt.checkWithLanguageTool({ server: 'http://127.0.0.1:9', source: text, prose: text, runs, code: 'de-DE', lang: 'de' });
  assert.equal(refused.state, 'failed');
  const error = await serve((req, res) => res.writeHead(500).end('broken'));
  assert.match((await lt.checkWithLanguageTool({ server: error, source: text, prose: text, runs, code: 'de-DE', lang: 'de' })).message, /500: broken/);
});

// ─── on this computer: the download, then a stand-in Java serving the fake LanguageTool ───

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const unix = process.platform !== 'win32';

/** A "Java runtime" archive whose bin/java runs the fake LanguageTool with Node. */
function fakeJava() {
  const dir = path.join(tmp, 'jre', 'jdk-fake', 'Contents', 'Home', 'bin');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'java'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(import.meta.dirname, 'fixtures', 'fake-languagetool.mjs')}" "$@"\n`);
  chmodSync(path.join(dir, 'java'), 0o755);
  const archive = path.join(tmp, 'jre.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', path.join(tmp, 'jre'), 'jdk-fake']);
  return readFileSync(archive);
}

test('LanguageTool downloads only when asked, checks every file, and runs only while needed', { skip: !unix && 'a stand-in java.exe would be needed' }, async () => {
  const jar = Buffer.from('not really a jar');
  const java = fakeJava();
  const files = { 'org/languagetool/languagetool-server/6.8/languagetool-server-6.8.jar': jar, 'jre.tar.gz': java };
  const base = await serve((req, res) => {
    const body = files[req.url.slice(1)];
    res.writeHead(body ? 200 : 404).end(body);
  });
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const pin = (javaSha = sha(java)) => lt.useLanguageToolPins({ version: '6.8', base: `${base}/`,
    jars: [['org/languagetool/languagetool-server/6.8/languagetool-server-6.8.jar', sha(jar), jar.length]],
    java: { [arch]: [`${base}/jre.tar.gz`, javaSha, java.length, '21.0.13+9-LTS'] } });
  const waitForDownload = async () => {
    for (let status = await lt.languageToolStatus(); status.downloading; status = await lt.languageToolStatus()) await new Promise((r) => setTimeout(r, 20));
    return lt.languageToolStatus();
  };

  // Off, not downloaded: German is reported, English still checked by Harper
  pin();
  // German by markup, as its dictionary isn't here to vote
  const text = 'This is a apple.\n\n\\begin{otherlanguage}{ngerman}Das ist das das Haus.\\end{otherlanguage}\n\n研究結果顯示。';
  const file = 'main.tex';
  const off = await grammar.checkGrammar({ text, file, languages: ['en-AU', 'de', 'zh-TW'] });
  assert.deepEqual(off.coverage.map((c) => [c.lang, c.engine, c.state]), [['en-AU', 'harper', 'checked'], ['de', 'languagetool', 'off'], ['zh-TW', null, 'none']]);
  assert.ok(off.issues.some((i) => i.rule === 'AnA' && i.engine === 'harper' && i.lang === 'en-AU'));
  assert.equal((await lt.saveConnection({ mode: 'local' })).mode, 'local');
  assert.equal(statSync(path.join(tmp, 'data', 'languagetool.json')).mode & 0o777, 0o600);
  const missing = await grammar.checkGrammar({ text, file, languages: ['en-AU', 'de'] });
  assert.equal(missing.coverage.find((c) => c.lang === 'de').state, 'not-downloaded');
  // English set to LanguageTool, which isn't here: Harper checks it and the coverage says why
  const english = await grammar.checkGrammar({ text: 'This is a apple.', languages: ['en-AU'], englishGrammar: 'languagetool' });
  assert.deepEqual([english.coverage[0].engine, english.coverage[0].fallback.state], ['harper', 'not-downloaded']);

  // a checksum that doesn't match leaves nothing behind
  pin('0'.repeat(64));
  await lt.installLanguageTool();
  const failed = await waitForDownload();
  assert.deepEqual([failed.installed, failed.error], [false, 'The download did not match its checksum, so it was not installed.']);
  assert.deepEqual(readdirSync(path.join(tmp, 'data', 'engines', 'languagetool')), []);

  pin();
  const started = await lt.installLanguageTool();
  assert.equal(started.downloading.total, jar.length + java.length);
  const done = await waitForDownload();
  assert.deepEqual([done.installed, done.error, done.running], [true, null, false]);

  // the first check starts it; German goes to it, English to Harper, Traditional Chinese to nothing
  const log = path.join(tmp, 'lt.log');
  process.env.FAKE_LT_LOG = log;
  const checked = await grammar.checkGrammar({ text, file, languages: ['en-AU', 'de', 'zh-TW'] });
  assert.deepEqual(checked.coverage.map((c) => [c.lang, c.engine, c.state]), [['en-AU', 'harper', 'checked'], ['de', 'languagetool', 'checked'], ['zh-TW', null, 'none']]);
  const german = checked.issues.find((i) => i.engine === 'languagetool');
  assert.deepEqual([text.slice(german.from, german.to), german.lang], ['das das', 'de']);
  const form = JSON.parse(readFileSync(log, 'utf8').trim().split('\n')[0]);
  assert.ok(!form.data.includes('apple') && !form.data.includes('研究'), 'only the German went to LanguageTool');
  assert.equal((await lt.languageToolStatus()).running, true);
  await lt.stopLanguageTool();
  assert.equal((await lt.languageToolStatus()).running, false);

  // an ignored LanguageTool rule goes to the project's settings.json by language, merged rule by rule
  const project = await createProject({ name: 'Sprachen', populate: async () => {} });
  assert.deepEqual(await grammar.changeLanguageToolIgnored(project.id, 'de', 'DOPPELTES_WORT'), { de: ['DOPPELTES_WORT'] });
  const settings = JSON.parse(readFileSync(path.join(await getProjectRoot(project.id), '.spectrum', 'settings.json'), 'utf8'));
  assert.deepEqual(settings.languageToolIgnored, { 'de:DOPPELTES_WORT': true });
  await grammar.checkGrammar({ text, file, languages: ['en-AU', 'de'], languageToolIgnored: await grammar.readLanguageToolIgnored(project.id) });
  assert.equal(JSON.parse(readFileSync(log, 'utf8').trim().split('\n').at(-1)).disabledRules, 'DOPPELTES_WORT');
  assert.deepEqual(await grammar.changeLanguageToolIgnored(project.id, 'de', 'DOPPELTES_WORT', true), {});
  await lt.stopLanguageTool();

  // turning it off stops it; removing it takes the files away
  await lt.saveConnection({ mode: 'off' });
  assert.equal((await lt.removeLanguageTool()).installed, false);
  assert.ok(!existsSync(path.join(tmp, 'data', 'engines', 'languagetool')));
  delete process.env.FAKE_LT_LOG;
});

test('a jar that fails stops the other downloads, and nothing is left behind', async () => {
  const jar = Buffer.from('not really a jar');
  const names = ['slow-1', 'slow-2', 'bad', ...Array.from({ length: 20 }, (_, i) => `ok-${i}`)].map((name) => `${name}.jar`);
  const asked = [];
  let cut = 0;
  const base = await serve((req, res) => {
    const name = req.url.slice(1);
    asked.push(name);
    if (name === 'bad.jar') return void res.writeHead(200).end('not the jar');
    if (!name.startsWith('slow')) return void setTimeout(() => res.writeHead(200).end(jar), 50);
    // a byte every 50 ms for a second, stopping early only if Spectrum hangs up
    res.writeHead(200);
    let sent = 0;
    const timer = setInterval(() => (++sent < 20 ? res.write('x') : res.end()), 50);
    res.on('close', () => {
      clearInterval(timer);
      if (sent < 20) cut += 1;
    });
  });
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  lt.useLanguageToolPins({ version: '6.8', base: `${base}/`, jars: names.map((name) => [name, sha(jar), jar.length]),
    java: { [arch]: [`${base}/jre.tar.gz`, '0'.repeat(64), 1, '21.0.13+9-LTS'] } });
  await lt.installLanguageTool();
  let status = await lt.languageToolStatus();
  while (status.downloading) {
    await new Promise((r) => setTimeout(r, 20));
    status = await lt.languageToolStatus();
  }
  assert.equal(status.error, 'The download did not match its checksum, so it was not installed.');
  // past the time the slow jars would have kept sending
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(cut, 2, 'both slow jars were stopped');
  assert.ok(asked.length < names.length, `${asked.length} of ${names.length} jars asked for`);
  assert.deepEqual(readdirSync(path.join(tmp, 'data', 'engines', 'languagetool')), []);
});
