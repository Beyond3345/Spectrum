// The converter's optional AI tidying (docs/featureResearch/LATEX_TYPST_CONVERSION.md section 9): the region markers,
// the strict answer and the checks of 9.4 on their own, then the protocol run against a fake OpenAI-compatible server
// with scripted answers, as section 9.6 tested it: the eight cases, a word the converter lost, the run's limits, and
// that no answer reaches a file before it passes. With pandoc, the converter's markers on a document with one of each
// region, and the route with the option on. No real model is called. Throwaway folders only.
// Run: SPECTRUM_PANDOC=<pandoc 3.12.1> node --test apps/backend/test/convert-tidy.test.js
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Fastify from 'fastify';
import { existsSync, mkdirSync, mkdtempSync, promises as fs, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-tidy-')));
const repo = path.join(import.meta.dirname, '..', '..', '..');
const pandoc = [process.env.SPECTRUM_PANDOC, path.join(repo, 'data', 'engines', 'pandoc', 'pandoc' + (process.platform === 'win32' ? '.exe' : ''))].find((file) => file && existsSync(file));
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
if (pandoc) {
  mkdirSync(path.join(tmp, 'data', 'engines', 'pandoc'), { recursive: true });
  symlinkSync(pandoc, path.join(tmp, 'data', 'engines', 'pandoc', path.basename(pandoc)));
}
const { checkReplacement, readAnswer, regionAt, replaceRegion, systemMessage, tidyRegions } = await import('../src/services/convertTidy.js');
const { finishRegions } = await import('../src/services/convert/regions.js');
const { latexToTypst, typstToLatex } = await import('../src/services/convertService.js');
const { builtInTypst } = await import('../src/services/engineService.js');
const { findExecutable } = await import('../src/services/compileService.js');
const { createProject } = await import('../src/services/projectService.js');
const { listVersions } = await import('../src/services/versionService.js');
const { registerConvertRoutes } = await import('../src/routes/convert.js');

const fixtures = path.join(import.meta.dirname, 'fixtures', 'convert');
const noTypst = !builtInTypst() && 'needs the built-in Typst';
const skip = !pandoc ? 'needs pandoc: download it in Settings › Engines › Markdown, or set SPECTRUM_PANDOC' : noTypst;
// the LaTeX made from Typst is checked by compiling it
const skipLatex = skip || (!(await findExecutable('tectonic')) && !(await findExecutable('xelatex')) && 'needs a LaTeX engine');

// ─── A fake model: an OpenAI-compatible server whose answers a test scripts ───

let answer = () => 'SKIP r1';
const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    const json = JSON.parse(body);
    requests.push(json);
    const content = await answer(json, requests.length);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
  });
});
before(() => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)));
after(() => {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});
const llmConfig = () => ({ endpoint: 'http://127.0.0.1:' + server.address().port + '/v1', model: 'fake-model', apiKey: '' });
/** The region asked about in a request, and the text it was given. */
const asked = (json) => ({ id: /^Region (r\d+),/m.exec(json.messages[1].content)?.[1], user: json.messages[1].content, system: json.messages[0].content });

// ─── The region of section 9.6: the converted report's title page ───

const ORIGINAL = [
  '\\begin{titlepage}',
  '  \\centering',
  '  \\vspace*{30mm}',
  '  {\\LARGE\\bfseries Rooftop solar output across a Melbourne year\\par}',
  '  \\vspace{12mm}',
  '  {\\Large Your Name\\par}',
  '  \\vfill',
  '  School of Engineering\\par',
  '  Your University',
  '\\end{titlepage}'
].join('\n');
const CONVERTED = [
  '#page(numbering: none)[',
  '  #align(center)[',
  '    #v(30mm) #text(size: 17pt, weight: "bold")[Rooftop solar output across a Melbourne year] \\',
  '    #v(12mm) #text(size: 14pt)[Your Name] \\',
  '    #v(1fr) School of Engineering \\',
  '    Your University',
  '  ]',
  ']'
].join('\n');
const GOOD = [
  '#page(numbering: none)[',
  '  #align(center)[',
  '    #v(30mm)',
  '    #text(size: 17pt, weight: "bold")[Rooftop solar output across a Melbourne year]',
  '    #v(12mm)',
  '    #text(size: 14pt)[Your Name]',
  '    #v(1fr)',
  '    School of Engineering \\',
  '    Your University',
  '  ]',
  ']'
].join('\n');
const block = (text, id = 'r1') => '<<<REPLACE ' + id + '\n' + text + '\n>>>';
const MAIN = [
  '#set page(paper: "a4", margin: 25mm)',
  '#set text(size: 11pt, lang: "en", region: "AU")',
  '#set heading(numbering: "1.1")',
  '',
  '// spectrum:region r1 start kind=titlepage',
  CONVERTED,
  '// spectrum:region r1 end',
  '',
  '= Introduction <sec:intro>',
  '',
  'The panels lost about four per cent of their output, as @sec:intro says.',
  ''
].join('\n');

/** A converted project (and its scratch copy) holding files, with notes and a record as the converter writes them. */
async function project(files) {
  const root = mkdtempSync(path.join(tmp, 'project-'));
  const scratch = mkdtempSync(path.join(tmp, 'scratch-'));
  for (const dir of [root, scratch]) {
    for (const [rel, text] of Object.entries({ ...files, 'conversion/notes.md': '# Conversion notes\n', '.spectrum/conversion.json': '{ "version": 1 }\n' })) {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), text);
    }
  }
  return { root, scratch };
}

const titleRegion = { id: 'r1', kind: 'titlepage', file: 'main.typ', from: 'main.tex:12', original: ORIGINAL };

test('the answer is one REPLACE block for the region, or SKIP, and nothing else', () => {
  assert.deepEqual(readAnswer(block(GOOD), 'r1'), { text: GOOD });
  assert.deepEqual(readAnswer('  SKIP r1\n', 'r1'), { skip: true });
  assert.match(readAnswer('Sure:\n```typst\n' + GOOD + '\n```', 'r1').fault, /exactly one <<<REPLACE r1 \.\.\. >>> block, or SKIP r1\. You gave 0\./);
  assert.match(readAnswer(block(GOOD) + '\n' + block(GOOD), 'r1').fault, /You gave 2\./);
  assert.match(readAnswer('```\n' + block(GOOD) + '\n```', 'r1').fault, /nothing before or after/);
  assert.equal(readAnswer(block(GOOD, 'r2'), 'r1').fault, 'The block must be for r1, not r2.');
  assert.equal(readAnswer('SKIP r2', 'r1').fault, 'The answer must be for r1, not r2.');
  assert.match(readAnswer(block('// spectrum:region r1 start kind=titlepage\n' + GOOD), 'r1').fault, /marker/);
});

test('the checks of 9.4: words, labels, references, maths, settings and length', () => {
  const ok = (after, before = CONVERTED, to = 'typst', original = ORIGINAL) => checkReplacement(before, after, to, original);
  assert.equal(ok(GOOD), null, 'layout may change');
  assert.match(ok(GOOD.replace('    School of Engineering \\\n', '')), /^The words changed/);
  assert.match(ok(GOOD.replace('Your Name', 'Your Name, PhD')), /^The words changed/, 'a word the original lacks');
  assert.match(ok('#import "@preview/showybox:2.0.4"\n' + GOOD), /Do not add #import/);
  assert.match(ok('#set text(red)\n' + GOOD), /#set/);
  assert.match(ok('#show: it => it\n' + GOOD), /#show/);
  assert.match(ok(GOOD + '\n// ' + 'padding '.repeat(200)), /too long/);
  const para = 'As @sec:a shows, $x^2 + 1$ grows. <para>';
  assert.equal(ok('As @sec:a shows,\n$x^2  + 1$ grows. <para>', para), null);
  assert.match(ok('As shows, $x^2 + 1$ grows. <para>', para), /reference or citation/);
  assert.match(ok('As @sec:a shows, $x^2 + 1$ grows.', para), /labels/);
  assert.match(ok('As @sec:a shows, $x^3 + 1$ grows. <para>', para), /maths/);
  // a show rule the region already had may stay
  const long = '#[\n  #show figure: set block(breakable: true)\n  #figure(table(columns: 1, [a b]))\n]';
  assert.equal(ok(long.replace('[a b]', '[a\nb]'), long), null);
  // LaTeX: \usepackage, and the words line by line, a {…} on the next line no argument of the line before
  const tex = '\\begin{titlepage}\n  \\centering\n  \\vspace*{30mm}\n  {\\LARGE\\bfseries Field notes\\par}\n\\end{titlepage}';
  assert.match(ok(tex.replace('Field notes', 'Field'), tex, 'latex', '#title()'), /words/);
  assert.match(ok('\\usepackage{xcolor}\n' + tex, tex, 'latex', ''), /\\usepackage/);
  assert.match(ok(tex.replace('{30mm}', '{30mm} \\label{x}'), tex, 'latex', ''), /labels/);
});

test('a word the converter lost may come back, if the original has it', () => {
  // \fbox{Reset} went with its text
  const original = 'Hold \\fbox{Reset} for five seconds, then release it.';
  const converted = 'Hold for five seconds, then release it.';
  assert.equal(checkReplacement(converted, 'Hold #box(stroke: 0.5pt, inset: 2pt)[Reset] for five seconds, then release it.', 'typst', original), null);
  assert.match(checkReplacement(converted, 'Hold #box[Restart] for five seconds, then release it.', 'typst', original), /words changed/);
  assert.match(checkReplacement(converted, 'Hold [Reset] [Reset] for five seconds, then release it.', 'typst', original), /words changed/, 'only as often as the original has it');
  assert.match(checkReplacement(converted, 'Hold for five seconds.', 'typst', original), /words changed/, 'every converted word stays');
});

test('a region in its file: found by its markers, replaced between them at their indent', () => {
  const text = 'a\n  // spectrum:region r1 start kind=titlepage\n  #x\n    #y\n  // spectrum:region r1 end\nb';
  const at = regionAt(text, 'r1');
  assert.equal(at.text, '#x\n  #y');
  assert.equal(replaceRegion(text, at, '#z\n#w'), 'a\n  // spectrum:region r1 start kind=titlepage\n  #z\n  #w\n  // spectrum:region r1 end\nb');
  assert.equal(regionAt(text, 'r10'), null);
});

test('the regions as written: numbered in file order, nested, oversized and stray markers taken out', () => {
  const ctx = { regions: ['r1', 'r2', 'r3', 'r4'].map((id) => ({ id, kind: 'titlepage', src: 'main.tex', line: 1, original: 'x' })) };
  const long = Array(61).fill('line').join('\n');
  const files = [{
    src: 'main.tex',
    out: 'main.typ',
    typst: ['// spectrum:region r3 start kind=titlepage', 'one', '// spectrum:region r4 start kind=titlepage', 'inner', '// spectrum:region r4 end', '// spectrum:region r3 end', '// spectrum:region r1 start kind=titlepage', long, '// spectrum:region r1 end', '// spectrum:region r9 start kind=titlepage', 'from the source', '// spectrum:region r9 end', '- // spectrum:region r2 start kind=titlepage', 'x', '// spectrum:region r2 end'].join('\n')
  }];
  assert.deepEqual(finishRegions(files, 'typst', ctx).map((r) => [r.id, r.file, r.from]), [['r1', 'main.typ', 'main.tex:1']]);
  assert.equal(files[0].typst, ['// spectrum:region r1 start kind=titlepage', 'one', 'inner', '// spectrum:region r1 end', long, 'from the source', '-', 'x'].join('\n'));
});

test('the system message is the checklist and the one rule card for the region', async () => {
  const skill = await fs.readFile(path.join(repo, 'skills', 'spectrum-convert-tidy', 'SKILL.md'), 'utf8');
  const cards = new Map([...skill.matchAll(/^### (.+)\n([\s\S]*?)(?=^### |^## )/gm)].map((m) => [m[1].trim(), m[2].trim()]));
  const checklist = /## Checklist before you answer\n([\s\S]*?)\n## /.exec(skill)[1].trim();
  const system = systemMessage({ checklist, cards }, 'titlepage', 'typst');
  assert.match(system, /Every label, such as <fig:x>/);
  assert.match(system, /Start with #page\(numbering: none\)\[/);
  assert.doesNotMatch(system, /\\begin\{titlepage\} \.\.\. \\end\{titlepage\}|cv-header|#grid/, 'no other card');
  assert.match(systemMessage({ checklist, cards }, 'cv-header', 'latex'), /minipage/);
  assert.match(systemMessage({ checklist, cards }, 'unknown-command', 'latex'), /#let/);
});

// the scripted answers of section 9.6, each over its three tries
const CASES = [
  { name: 'a correct layout', answers: [block(GOOD)], result: 'replaced', used: 1 },
  { name: 'correct after chat and a fence', answers: ['Sure, here is the improved title page:\n```typst\n' + GOOD + '\n```', block(GOOD)], result: 'replaced', used: 2, first: /You gave 0\./ },
  { name: 'a line dropped', answers: [block(GOOD.replace('    School of Engineering \\\n', ''))], result: 'kept', used: 3, first: /^The words changed/ },
  { name: 'chat and a fence every time', answers: ['Here you go:\n```\n' + GOOD + '\n```'], result: 'kept', used: 3, first: /You gave 0\./ },
  { name: 'an #import added', answers: [block('#import "@preview/showybox:2.0.4": showybox\n' + GOOD)], result: 'kept', used: 3, first: /Do not add #import/ },
  { name: 'an invalid font weight', answers: [block(GOOD.replace('weight: "bold"', 'weight: "heavyish"'))], result: 'kept', used: 3, first: /^It does not compile: / },
  { name: 'the wrong region', answers: [block(GOOD, 'r2')], result: 'kept', used: 3, first: /^The block must be for r1, not r2\.$/ },
  { name: 'SKIP', answers: ['SKIP r1'], result: 'skipped', used: 1 }
];

for (const c of CASES) {
  test('the protocol with scripted answers: ' + c.name, { skip: noTypst, timeout: 120_000 }, async () => {
    const { root, scratch } = await project({ 'main.typ': MAIN });
    requests.length = 0;
    answer = (json, n) => c.answers[Math.min(n, c.answers.length) - 1];
    const tidy = await tidyRegions({ root, scratch, mainFile: 'main.typ', to: 'typst', regions: [titleRegion], llmConfig: llmConfig() });
    assert.equal(tidy.regions[0].result, c.result);
    assert.equal(tidy.regions[0].answers, c.used);
    assert.equal(requests.length, c.used);
    assert.ok(requests.every((r) => r.temperature === 0 && r.model === 'fake-model'), 'temperature 0');
    assert.ok(requests.every((r) => asked(r).id === 'r1' && /Start with #page/.test(asked(r).system) && asked(r).user.includes('ORIGINAL (LaTeX):\n' + ORIGINAL) && asked(r).user.includes(CONVERTED)));
    if (c.first) assert.match(asked(requests[1]).user.split('\n')[0].replace(/^Your last answer was not used: | Try again\.$/g, ''), c.first);
    const main = await fs.readFile(path.join(root, 'main.typ'), 'utf8');
    if (c.result === 'replaced') {
      assert.equal(regionAt(main, 'r1').text, GOOD);
      assert.equal(main.replace(GOOD, CONVERTED), MAIN, 'nothing outside the region changed');
      assert.deepEqual(tidy.changes.map((ch) => [ch.filePath, ch.original, ch.proposed]), [['main.typ', MAIN, main]]);
      assert.ok((await fs.readdir(path.join(root, '.spectrum', 'agent-runs'))).length === 1, 'the file before the edit, kept');
    } else {
      // the converter's text, with a TODO comment above it
      assert.equal(main, MAIN.replace('// spectrum:region r1 start', '// TODO(spectrum): check this title page by hand; ' + (c.result === 'skipped' ? 'the AI model left it as converted.' : 'the AI model’s answers were not used.') + '\n// spectrum:region r1 start'));
    }
    assert.equal((await listVersions(root))[0].label, 'Before AI tidying', 'a checkpoint first');
    const notes = await fs.readFile(path.join(root, 'conversion', 'notes.md'), 'utf8');
    assert.match(notes, /## AI tidying[\s\S]*- r1 \(title page, main\.typ\): /);
    assert.equal(JSON.parse(await fs.readFile(path.join(root, '.spectrum', 'conversion.json'), 'utf8')).tidy.regions[0].result, c.result);
  });
}

test('no answer reaches a file before it passes every check', { skip: noTypst, timeout: 300_000 }, async () => {
  // four regions with a label, a reference and maths each, and answers that each fail one check
  const body = (n) => ['= Part ' + n + ' <sec:' + n + '>', '', 'As @sec:' + n + ' shows, $x^' + n + ' + 1$ grows fast.'].join('\n');
  const regions = [1, 2, 3, 4].map((n) => ({ id: 'r' + n, kind: 'unknown-command', file: 'main.typ', from: 'main.tex:' + n, original: 'As \\cref{sec:' + n + '} shows, $x^' + n + ' + 1$ grows \\fast.' }));
  const main = '#set page(paper: "a4")\n#set heading(numbering: "1.1")\n\n' + [1, 2, 3, 4].map((n) => '// spectrum:region r' + n + ' start kind=unknown-command\n' + body(n) + '\n// spectrum:region r' + n + ' end').join('\n\n') + '\n';
  const bad = {
    r1: [body(1).replace('<sec:1>', '<sec:one>'), body(1).replace(' @sec:1', ''), body(1).replace('x^1', 'y^1')].map((t) => block(t, 'r1')),
    r2: ['#set text(fill: red)\n' + body(2), '#show heading: set text(blue)\n' + body(2), body(2) + '\n// ' + 'long '.repeat(200)].map((t) => block(t, 'r2')),
    r3: [block('// spectrum:region r3 end\n' + body(3), 'r3'), 'Here it is:\n' + block(body(3), 'r3'), block(body(3).replace('grows', '#text(weight: "heavyish")[grows]'), 'r3')],
    r4: [block(body(4).replace('Part', 'Section'), 'r4'), block(body(4), 'r1'), block(body(4).replace('$x^4 + 1$', '$x^4 + 1'), 'r4')]
  };
  const { root, scratch } = await project({ 'main.typ': main });
  const unchanged = [];
  const tries = new Map();
  answer = async (json) => {
    unchanged.push((await fs.readFile(path.join(root, 'main.typ'), 'utf8')) === main);
    const { id } = asked(json);
    tries.set(id, (tries.get(id) ?? 0) + 1);
    return bad[id][tries.get(id) - 1];
  };
  requests.length = 0;
  const tidy = await tidyRegions({ root, scratch, mainFile: 'main.typ', to: 'typst', regions, llmConfig: llmConfig() });
  assert.deepEqual(tidy.regions.map((r) => [r.id, r.result, r.answers]), [['r1', 'kept', 3], ['r2', 'kept', 3], ['r3', 'kept', 3], ['r4', 'kept', 3]]);
  assert.equal(unchanged.length, 12);
  assert.ok(unchanged.every(Boolean), 'the project’s file was as converted at every request');
  // only the TODO comments, one above each region
  const now = await fs.readFile(path.join(root, 'main.typ'), 'utf8');
  assert.equal(now.split('\n').filter((l) => !l.startsWith('// TODO(spectrum): ')).join('\n'), main);
  assert.equal(now.match(/TODO\(spectrum\)/g).length, 4);
});

test('a word the converter lost, restored by the model, is kept', { skip: noTypst, timeout: 120_000 }, async () => {
  const region = { id: 'r1', kind: 'unknown-command', file: 'main.typ', from: 'main.tex:5', original: 'Hold \\fbox{Reset} for five seconds, then release it.' };
  const main = '// spectrum:region r1 start kind=unknown-command\n// TODO(spectrum): \\fbox is not a command Spectrum knows; check this paragraph.\nHold for five seconds, then release it.\n// spectrum:region r1 end\n';
  const { root, scratch } = await project({ 'main.typ': main });
  answer = () => block('Hold #box(stroke: 0.5pt, inset: 2pt)[Reset] for five seconds, then release it.');
  const tidy = await tidyRegions({ root, scratch, mainFile: 'main.typ', to: 'typst', regions: [region], llmConfig: llmConfig() });
  assert.equal(tidy.regions[0].result, 'replaced');
  assert.match(await fs.readFile(path.join(root, 'main.typ'), 'utf8'), /#box\(stroke: 0\.5pt, inset: 2pt\)\[Reset\]/);
});

test('a run stops after 20 regions, or at its token limit, and says how many were left', { skip: noTypst, timeout: 120_000 }, async () => {
  const ids = Array.from({ length: 22 }, (_, i) => 'r' + (i + 1));
  const main = ids.map((id, i) => '// spectrum:region ' + id + ' start kind=unknown-command\nWord number ' + (i + 1) + '.\n// spectrum:region ' + id + ' end').join('\n\n') + '\n';
  const regions = ids.map((id) => ({ id, kind: 'unknown-command', file: 'main.typ', from: 'main.tex:1', original: 'Word number.' }));
  answer = (json) => 'SKIP ' + asked(json).id;
  let { root, scratch } = await project({ 'main.typ': main });
  const tidy = await tidyRegions({ root, scratch, mainFile: 'main.typ', to: 'typst', regions, llmConfig: llmConfig() });
  assert.equal(tidy.regions.length, 20);
  assert.equal(tidy.left, 2);
  assert.match(await fs.readFile(path.join(root, 'conversion', 'notes.md'), 'utf8'), /2 flagged regions were left as converted/);
  ({ root, scratch } = await project({ 'main.typ': main }));
  const limited = await tidyRegions({ root, scratch, mainFile: 'main.typ', to: 'typst', regions, llmConfig: llmConfig(), tokenLimit: 1 });
  assert.deepEqual([limited.regions.length, limited.left], [1, 21]);
});

test('when the whole document fails its checks afterwards, every edit is undone', { skip: noTypst, timeout: 120_000 }, async () => {
  const { root, scratch } = await project({ 'main.typ': MAIN });
  answer = () => block(GOOD);
  const tidy = await tidyRegions({ root, scratch, mainFile: 'main.typ', to: 'typst', regions: [titleRegion], llmConfig: llmConfig(), before: { ok: true, compiles: true }, recheck: async () => ({ ok: false, compiles: true }) });
  assert.equal(tidy.regions[0].result, 'kept');
  assert.match(tidy.regions[0].fault, /no longer passed/);
  assert.doesNotMatch(await fs.readFile(path.join(root, 'main.typ'), 'utf8'), /#v\(30mm\)\n/);
});

test('the model unreachable stops the run with its error, and changes nothing', { skip: noTypst, timeout: 60_000 }, async () => {
  const { root, scratch } = await project({ 'main.typ': MAIN });
  const tidy = await tidyRegions({ root, scratch, mainFile: 'main.typ', to: 'typst', regions: [titleRegion], llmConfig: { endpoint: 'http://127.0.0.1:9/v1', model: 'none' } });
  assert.match(tidy.error, /Couldn’t reach/);
  assert.equal(tidy.regions[0].answers, 0);
  assert.equal(tidy.changes.length, 1, 'only the TODO comment');
});

// ─── With pandoc: the converter's markers, and the route ───

test('the converter marks each kind of region, with its original in the record and a line in the notes', { skip, timeout: 5 * 60 * 1000 }, async () => {
  const staging = mkdtempSync(path.join(tmp, 'out-'));
  const { record, checks } = await latexToTypst(path.join(fixtures, 'regions-latex'), 'main.tex', staging, { engine: 'auto' });
  assert.equal(checks.ok, true, JSON.stringify(checks));
  assert.deepEqual(record.regions.map((r) => [r.id, r.kind]), [['r1', 'titlepage'], ['r2', 'cv-header'], ['r3', 'unknown-environment'], ['r4', 'unknown-command'], ['r5', 'table-layout']]);
  const typst = await fs.readFile(path.join(staging, 'main.typ'), 'utf8');
  for (const r of record.regions) {
    const at = regionAt(typst, r.id);
    assert.ok(at && at.end - at.start - 1 <= 60, r.id + ' is marked');
    assert.equal(r.file, 'main.typ');
  }
  assert.match(record.regions[0].original, /^\\begin\{titlepage\}[\s\S]*\\rule\{0\.6\\linewidth\}[\s\S]*\\end\{titlepage\}$/);
  assert.match(record.regions[2].original, /^\\begin\{tcolorbox\}/);
  assert.match(record.regions[3].original, /\\hlnote\{which is more than enough\}/);
  assert.match(regionAt(typst, 'r3').text, /^\/\/ TODO\(spectrum\): The environment tcolorbox/);
  assert.match(await fs.readFile(path.join(staging, 'conversion', 'notes.md'), 'utf8'), /main\.tex line 12: A title page the rules only approximated, marked r1 in main\.typ/);
});

test('from Typst too: a title page beyond the rule, a CV header, the document’s own functions and a table in a grid', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
  const staging = mkdtempSync(path.join(tmp, 'out-'));
  const { record, checks } = await typstToLatex(path.join(fixtures, 'regions-typst'), 'main.typ', staging, { engine: 'auto' });
  assert.equal(checks.compiles, true, JSON.stringify(checks.diagnostics));
  assert.deepEqual(record.regions.map((r) => [r.id, r.kind]), [['r1', 'titlepage'], ['r2', 'cv-header'], ['r3', 'unknown-environment'], ['r4', 'unknown-command'], ['r5', 'table-layout']]);
  const latex = await fs.readFile(path.join(staging, 'main.tex'), 'utf8');
  for (const r of record.regions) assert.ok(regionAt(latex, r.id), r.id + ' is marked with %');
  assert.match(record.regions[2].original, /^#callout\[/);
  assert.match(regionAt(latex, 'r4').text, /^% TODO\(spectrum\): #kbd is a function of this document/);
});

test('the route tidies the new project with the option on, for review, and leaves the source as it was', { skip, timeout: 5 * 60 * 1000 }, async () => {
  const source = await createProject({ name: 'Regions', populate: (root) => fs.cp(path.join(fixtures, 'regions-latex'), root, { recursive: true }) });
  const sourceBefore = await fs.readFile(path.join(source.path, 'main.tex'), 'utf8');
  // the title page one call to a line; every other region skipped
  answer = (json) => {
    const { id, user } = asked(json);
    const converted = /CONVERTED \(Typst\), the only text you may change:\n([\s\S]*?)\n\nAnswer with exactly one block:/.exec(user)[1];
    return id === 'r1' ? block(converted.replace(/\) (#|School)/g, ')\n    $1')) : 'SKIP ' + id;
  };
  const app = Fastify();
  registerConvertRoutes(app);
  const res = await app.inject({ method: 'POST', url: '/api/projects/' + source.id + '/convert', payload: { to: 'typst', doc: 'main.tex', aiCleanup: true, llmConfig: llmConfig() } });
  await app.close();
  assert.equal(res.statusCode, 200, res.body);
  const { project, regions, tidy } = res.json();
  assert.equal(regions, 5);
  assert.deepEqual(tidy.regions.map((r) => r.result), ['replaced', 'skipped', 'skipped', 'skipped', 'skipped']);
  const main = await fs.readFile(path.join(project.path, 'main.typ'), 'utf8');
  assert.match(regionAt(main, 'r1').text, /#v\(30mm\)\n {4}#text\(size: 17pt/);
  assert.deepEqual(tidy.changes.map((c) => c.filePath), ['main.typ']);
  assert.equal(tidy.changes[0].proposed, main);
  assert.match(tidy.changes[0].original, /#v\(30mm\) #text\(size: 17pt/, 'the converted text, for the review');
  assert.equal((await listVersions(project.path))[0].label, 'Before AI tidying');
  assert.equal(await fs.readFile(path.join(source.path, 'main.tex'), 'utf8'), sourceBefore, 'the source project is never changed');
});
