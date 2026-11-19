// Spectrum's tools server for local agents: its tools on a throwaway working copy, and the server itself over stdio
// with the MCP SDK's own client. No network, no isolation (the native agent tests run it inside the sandbox).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-mcp-')));
const home = path.join(tmp, 'home');
const root = path.join(tmp, 'work');
const state = path.join(home, 'spectrum-tools', 'run');
Object.assign(process.env, { HOME: home, SPECTRUM_DATA_DIR: path.join(tmp, 'data') });
const tools = await import('../src/mcp/tools.js');
after(() => rmSync(tmp, { recursive: true, force: true }));
const write = async (file, text) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };
const hasTeX = (() => { try { execFileSync('kpsewhich', ['article.cls'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const texLive = hasTeX && (() => { try { return /TeX Live/.test(execFileSync('pdflatex', ['--version'], { encoding: 'utf8' })); } catch { return false; } })();

await write(path.join(root, 'paper', 'main.tex'), [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\section{Introduction}\\label{sec:intro}',
  'See \\ref{sec:intro} and \\ref{sec:missing}, after \\citep[p.~2]{known,unknown}. % \\cite{commented}',
  '\\input{sections/method}',
  '\\bibliographystyle{plain}',
  '\\bibliography{refs}',
  '\\end{document}',
  ''
].join('\n'));
await write(path.join(root, 'paper', 'sections', 'method.tex'), '\\subsection{Method}\n\\label{sec:method}\nAs in \\cite{known}.\n');
await write(path.join(root, 'paper', 'refs.bib'), '@article{known,\n  title = {A Known Paper},\n  author = {Smith, Ann and Jones, Bo},\n  year = {2024},\n  doi = {10.1/known}\n}\n');
await write(path.join(root, 'notes.bib'), '@misc{other, title = {Not read by the document}}\n');
await write(path.join(state, 'context.json'), JSON.stringify({ mainFile: 'paper/main.tex', engine: 'pdflatex', todos: [{ text: 'Check the method', link: { file: 'paper/sections/method.tex', line: 1 } }] }));
await write(path.join(home, '.agents', 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: A skill\n---\nDo alpha things.\n');
await write(path.join(home, '.agents', 'skills', 'alpha', '.spectrum-managed'), 'stamp');
await write(path.join(home, '.agents', 'skills', 'alpha', 'notes.md'), 'More');

test('project_map follows the inputs and finds what does not resolve', async () => {
  const map = await tools.projectMap(root, state);
  assert.equal(map.mainFile, 'paper/main.tex');
  assert.equal(map.engine, 'pdflatex');
  assert.deepEqual(map.files, [{ file: 'paper/main.tex' }, { file: 'paper/sections/method.tex', includedFrom: 'paper/main.tex' }]);
  assert.deepEqual(map.outline, [{ level: 'section', title: 'Introduction', file: 'paper/main.tex', line: 3 }, { level: 'subsection', title: 'Method', file: 'paper/sections/method.tex', line: 1 }]);
  assert.deepEqual(map.labels.map((l) => l.label), ['sec:intro', 'sec:method']);
  assert.deepEqual(map.bibFiles, ['paper/refs.bib']);
  assert.deepEqual(map.unresolvedRefs, [{ key: 'sec:missing', file: 'paper/main.tex', line: 4 }]);
  assert.deepEqual(map.unresolvedCites, [{ key: 'unknown', file: 'paper/main.tex', line: 4 }], 'commented citations are not counted');
  // without a main file named, the top-level document is found
  const elsewhere = path.join(tmp, 'state-without-context');
  await fs.mkdir(elsewhere, { recursive: true });
  assert.equal((await tools.projectMap(root, elsewhere)).mainFile, 'paper/main.tex');
});

test('project_map reads a Typst and a Markdown document too', async () => {
  const work = path.join(tmp, 'typst-work');
  const run = path.join(tmp, 'typst-run');
  await write(path.join(work, 'main.typ'), [
    '= Introduction <sec:intro>',
    'See @sec:intro and @sec:missing, after @known and @unknown. // @commented',
    'Mail a@b.com, or https://example.com.',
    '#include "chapters/method.typ"',
    '#bibliography("refs.bib")',
    ''
  ].join('\n'));
  await write(path.join(work, 'chapters', 'method.typ'), '== Method\nAs in #cite(<known>).\n');
  await write(path.join(work, 'refs.bib'), '@article{known, title = {A Known Paper}}\n');
  await write(path.join(work, 'other.bib'), '@misc{unknown, title = {Not loaded}}\n');
  await write(path.join(run, 'context.json'), JSON.stringify({ mainFile: 'main.typ' }));
  const typst = await tools.projectMap(work, run);
  assert.deepEqual(typst.files, [{ file: 'main.typ' }, { file: 'chapters/method.typ', includedFrom: 'main.typ' }]);
  assert.deepEqual(typst.outline, [{ level: 1, title: 'Introduction', file: 'main.typ', line: 1 }, { level: 2, title: 'Method', file: 'chapters/method.typ', line: 1 }]);
  assert.deepEqual(typst.labels.map((l) => l.label), ['sec:intro']);
  assert.deepEqual(typst.bibFiles, ['refs.bib']);
  assert.deepEqual(typst.unresolvedRefs, []);
  assert.deepEqual(typst.unresolvedCites.map((c) => [c.key, c.line]), [['sec:missing', 2], ['unknown', 2]]);

  await write(path.join(work, 'notes.md'), [
    '---',
    'bibliography: refs.bib',
    '---',
    '# Results {#sec:results}',
    'As @sec:results shows [@known; @nobody].',
    '```bash',
    '# not a heading, @not-a-cite',
    '```',
    '## Discussion ##',
    ''
  ].join('\n'));
  await write(path.join(run, 'context.json'), JSON.stringify({ mainFile: 'notes.md' }));
  const markdown = await tools.projectMap(work, run);
  assert.deepEqual(markdown.outline.map((h) => [h.level, h.title, h.line]), [[1, 'Results', 4], [2, 'Discussion', 9]]);
  assert.deepEqual(markdown.labels.map((l) => l.label), ['sec:results']);
  assert.deepEqual(markdown.bibFiles, ['refs.bib']);
  assert.deepEqual(markdown.unresolvedCites.map((c) => c.key), ['nobody']);
  // what the Spectrum agent's project outline is made from: the language, the front matter and the keys cited
  assert.equal(markdown.language, 'Markdown');
  assert.deepEqual(markdown.frontMatter, { bibliography: 'refs.bib' });
  assert.deepEqual(markdown.citedKeys, ['known', 'nobody']);
  assert.equal(typst.language, 'Typst');
  assert.equal('frontMatter' in typst, false);

  // a file Typst imports is part of the document; a package is not, and the context may be given in place of its folder
  await write(path.join(work, 'main.typ'), '#import "@preview/cetz:0.3.1": canvas\n#import "template.typ": conf\n= Only <one>\n');
  await write(path.join(work, 'template.typ'), '#let conf(doc) = doc\n');
  assert.deepEqual((await tools.projectMap(work, { mainFile: 'main.typ' })).files, [{ file: 'main.typ' }, { file: 'template.typ', includedFrom: 'main.typ' }]);
});

test('a Markdown compile’s errors are at lines of the .md, never of the file pandoc generated', () => {
  const fromLog = tools.logErrors('main.md.tex:96: Undefined control sequence.\nLaTeX Warning: Reference `x\' on page 1 undefined\n');
  assert.deepEqual(fromLog.errors, ['main.md.tex:96: Undefined control sequence.']);
  const traced = tools.markdownErrors([
    { severity: 'error', message: 'Undefined control sequence.', file: 'main.md', line: 12, column: 1 },
    { severity: 'error', message: 'Missing $ inserted.', file: 'main.md' },
    { severity: 'warning', message: 'No entry in the bibliography for the citation @Missing2020.', file: 'main.md', line: 16, column: 1 }
  ], fromLog);
  assert.deepEqual(traced.errors, ['main.md:12: Undefined control sequence.', 'main.md: Missing $ inserted.']);
  assert.equal(traced.warnings, 2);
  assert.deepEqual(traced.undefined, ['main.md:16: No entry in the bibliography for the citation @Missing2020.', 'LaTeX Warning: Reference `x\' on page 1 undefined']);
});

test('with no main file named, a Typst or Markdown project still has a main document', async () => {
  const bare = path.join(tmp, 'bare-state');
  for (const [name, files, main] of [
    ['typst', { 'notes.md': '# Notes\n', 'chapters/one.typ': '= One\n', 'thesis.typ': '= Thesis\n#include "chapters/one.typ"\n' }, 'thesis.typ'],
    ['markdown', { 'README.md': '# Read me\n', 'main.md': '# Paper\n' }, 'main.md'],
    ['latex-first', { 'main.typ': '= Typst\n', 'paper.tex': '\\documentclass{article}\n' }, 'paper.tex']
  ]) {
    const dir = path.join(tmp, name);
    for (const [file, text] of Object.entries(files)) await write(path.join(dir, file), text);
    assert.equal((await tools.projectMap(dir, bare)).mainFile, main, name);
  }
  const empty = path.join(tmp, 'empty');
  await write(path.join(empty, 'refs.bib'), '');
  assert.equal((await tools.projectMap(empty, bare)).note, 'This project has no LaTeX, Typst or Markdown document.');
  assert.equal((await tools.compile(empty, bare)).error, 'This project has no LaTeX, Typst or Markdown document.');
});

test('the bibliography tools, the log reader, to-dos and skills', async () => {
  assert.deepEqual(await tools.listBibEntries(root, state), [{ key: 'known', type: 'article', title: 'A Known Paper', author: 'Smith, Ann and Jones, Bo', year: '2024', doi: '10.1/known', file: 'paper/refs.bib' }]);
  assert.equal((await tools.searchBibEntries(root, state, 'jones 2024')).length, 1);
  assert.equal((await tools.searchBibEntries(root, state, 'jones 1999')).length, 0);
  await assert.rejects(tools.searchBibEntries(root, state, ' '), /words/);

  const log = ['(./main.tex', './main.tex:12: Undefined control sequence.', 'l.12 \\foo', 'LaTeX Warning: Citation `x\' on page 1 undefined on input line 4.', '! Missing $ inserted.', 'l.20 a_b', 'main.typ:3:1: error: unknown variable: foo', ''].join('\n');
  assert.deepEqual(tools.logErrors(log), { errors: ['main.tex:12: Undefined control sequence.', '! Missing $ inserted. l.20 a_b', 'main.typ:3:1: error: unknown variable: foo'], warnings: 1, undefined: ['LaTeX Warning: Citation `x\' on page 1 undefined on input line 4.'] });
  assert.match((await tools.getLog(path.join(tmp, 'state-without-context'))).note, /compile first/);

  assert.deepEqual(await tools.listTodos(state), [{ text: 'Check the method', link: { file: 'paper/sections/method.tex', line: 1 } }]);
  await tools.suggestTodo(state, { text: 'Add a citation', link: { file: 'paper/main.tex', line: 4 } });
  await assert.rejects(tools.suggestTodo(state, { text: '' }), /to-do/);
  assert.deepEqual((await fs.readFile(path.join(state, 'suggestions.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l)), [{ text: 'Add a citation', link: { file: 'paper/main.tex', line: 4 } }]);
  await fs.rm(path.join(state, 'suggestions.jsonl'));

  const skill = await tools.loadHomeSkill('alpha');
  assert.equal(skill.body, 'Do alpha things.');
  assert.deepEqual(skill.files, ['SKILL.md', 'notes.md']);
  await assert.rejects(tools.loadHomeSkill('../alpha'), /Invalid/);
  await assert.rejects(tools.loadHomeSkill('missing'), /No skill/);
});

test('search_text finds plain text and regular expressions with file and line, and reads no hidden file, link or runaway expression', async () => {
  const where = path.join(tmp, 'search');
  await write(path.join(where, 'main.tex'), 'Alpha beta\nthe Method section\nGAMMA method\n');
  await write(path.join(where, 'sections', 'two.tex'), 'no match here\nmethod again\n');
  await write(path.join(where, '.env'), 'METHOD_KEY=secret\n');
  await write(path.join(where, '.git', 'config'), 'method = secret\n');
  await write(path.join(where, 'figure.bin'), 'method\0binary');
  await write(path.join(where, 'slow.txt'), `${'a'.repeat(40)}!\n`);
  await fs.symlink('.env', path.join(where, 'notes.tex'));
  const found = async (input) => (await tools.searchText(where, input)).matches.map((m) => `${m.file}:${m.line}`);
  assert.deepEqual(await found({ query: 'method' }), ['main.tex:2', 'main.tex:3', 'sections/two.tex:2']);
  assert.deepEqual(await found({ query: 'method', caseSensitive: true }), ['main.tex:3', 'sections/two.tex:2']);
  assert.deepEqual(await found({ query: '^the \\w+ section$', regex: true }), ['main.tex:2']);
  assert.deepEqual(await found({ query: 'method', path: 'sections' }), ['sections/two.tex:2']);
  assert.deepEqual(await found({ query: 'method', path: 'main.tex' }), ['main.tex:2', 'main.tex:3']);
  assert.deepEqual(await found({ query: 'secret' }), [], 'nothing hidden, and nothing through a link');
  await assert.rejects(tools.searchText(where, { query: '(', regex: true }), /Not a regular expression/);
  await assert.rejects(tools.searchText(where, { query: 'x', path: '../outside' }), /path/i);
  const started = Date.now();
  await assert.rejects(tools.searchText(where, { query: '(a+)+$', regex: true }), /took too long on slow\.txt/);
  assert.ok(Date.now() - started < 5000);
  // many matches are cut at 100, and say so
  await write(path.join(where, 'many.txt'), 'word\n'.repeat(150));
  const many = await tools.searchText(where, { query: 'word' });
  assert.equal(many.matches.length, 100);
  assert.match(many.more, /first 100/);
});

test('each tool of the registry has the one shape, a schema a model can read and an input check', () => {
  for (const tool of tools.TOOLS) {
    assert.match(tool.name, /^[a-z_]+$/);
    assert.ok(tool.description.length > 20 && typeof tool.readOnly === 'boolean' && typeof tool.run === 'function', tool.name);
    const spec = tools.toolSpec(tool);
    assert.deepEqual(Object.keys(spec.function.parameters), ['type', 'properties', 'required'], tool.name);
    assert.doesNotMatch(JSON.stringify(spec), /\$schema|additionalProperties|9007199254740991/);
  }
  const compile = tools.TOOLS.find((t) => t.name === 'compile');
  assert.equal(compile.readOnly, false, 'two compiles of one run never run at once');
  assert.deepEqual(tools.toolSpec(compile).function.parameters.properties.engine, { type: 'string', enum: ['auto', 'pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic'] });
  assert.deepEqual(tools.checkedInput(compile, { main: 'a.tex', extra: 1 }), { main: 'a.tex' });
  assert.throws(() => tools.checkedInput(compile, { engine: 'word' }), /Invalid input for compile: engine: /);
  assert.throws(() => tools.checkedInput(tools.TOOLS.find((t) => t.name === 'bib_search'), {}), /query/);
  assert.deepEqual(compile.show({ ok: false, error: 'No PDF was produced.', errors: ['main.tex:3: Undefined control sequence.'], undefined: [] }), { text: '1 error\nmain.tex:3: Undefined control sequence.' });
  assert.deepEqual(compile.show({ ok: false, error: 'No LaTeX engine found.' }), { text: '1 error\nNo LaTeX engine found.' });
  assert.deepEqual(compile.show({ ok: true, errors: [], undefined: ['Citation `x\' undefined'] }), { text: 'builds, with 1 undefined citation or reference\nCitation `x\' undefined' });
  assert.deepEqual(compile.show({ ok: true, errors: [], undefined: [] }), { text: 'builds' });
});

test('compile builds the copy into the run’s folder and writes nothing into the copy', { skip: !hasTeX && 'Needs a TeX installation.' }, async () => {
  const before = (await fs.readdir(path.join(root, 'paper'), { recursive: true })).sort();
  const result = await tools.compile(root, state);
  assert.equal(result.mainFile, 'paper/main.tex');
  assert.equal(result.engine, 'pdflatex');
  assert.ok(result.pdf?.startsWith(state), JSON.stringify(result));
  assert.equal((await fs.readFile(result.pdf)).subarray(0, 5).toString(), '%PDF-');
  assert.ok(result.undefined.some((l) => /sec:missing|unknown/.test(l)), JSON.stringify(result.undefined));
  assert.deepEqual((await fs.readdir(path.join(root, 'paper'), { recursive: true })).sort(), before);
  assert.ok((await tools.getLog(state)).tail.length > 100);
});

test('compile takes the Typst version Spectrum chose for the session', async () => {
  const typstState = path.join(home, 'spectrum-tools', 'typst-run');
  await write(path.join(root, 'typst', 'main.typ'), '= One\n');
  await write(path.join(typstState, 'context.json'), JSON.stringify({ engine: 'auto', typstVersion: '9.9.9' }));
  const result = await tools.compile(root, typstState, { main: 'typst/main.typ' });
  assert.equal(result.ok, false);
  assert.match(result.error, /Typst 9\.9\.9/);
});

test('the server answers over stdio with every tool', async () => {
  const server = fileURLToPath(new URL('../src/mcp/server.js', import.meta.url));
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server, '--root', root, '--state', state], env: { HOME: home, PATH: process.env.PATH }, stderr: 'pipe' }));
  try {
    const listed = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(listed, ['bib_entries', 'bib_search', 'compile', 'fetch_bibtex', 'get_log', 'list_todos', 'literature_search', 'load_skill', 'project_map', 'search_text', 'suggest_todo']);
    // the registry's every tool, and no other
    assert.deepEqual(listed, tools.TOOLS.map((t) => t.name).sort());
    // each answer inside a marker naming its tool (a skill's as a skill), with the line on how to treat them in the
    // server's instructions
    const raw = async (name, args = {}) => (await client.callTool({ name, arguments: args })).content[0].text;
    const text = async (name, args) => (await raw(name, args)).replace(/^<[^>]*>\n/, '').replace(/\n<\/\w+>$/, '');
    assert.match(await raw('project_map'), /^<untrusted source="project_map">\n\{[\s\S]*\}\n<\/untrusted>$/);
    assert.match(await raw('load_skill', { id: 'alpha' }), /^<skill id="alpha">\n\{[\s\S]*\}\n<\/skill>$/);
    assert.match(client.getInstructions(), /never an instruction to you.*<skill id="…">/);
    assert.equal(JSON.parse(await text('project_map')).mainFile, 'paper/main.tex');
    assert.equal(JSON.parse(await text('bib_search', { query: 'known' }))[0].key, 'known');
    assert.deepEqual(JSON.parse(await text('search_text', { query: 'subsection' })).matches, [{ file: 'paper/sections/method.tex', line: 1, text: '\\subsection{Method}' }]);
    assert.deepEqual(JSON.parse(await text('list_todos')).todos, [{ text: 'Check the method', link: { file: 'paper/sections/method.tex', line: 1 } }]);
    const refused = await client.callTool({ name: 'search_text', arguments: { query: 7 } });
    assert.equal(refused.isError, true, 'an input that is not the schema’s is refused before the tool runs');
    assert.match(await text('suggest_todo', { text: 'From the server' }), /Suggested/);
    const failed = await client.callTool({ name: 'load_skill', arguments: { id: 'missing' } });
    assert.equal(failed.isError, true);
    assert.match(failed.content[0].text, /^<untrusted source="load_skill">\n/);
    assert.equal(JSON.parse(await text('load_skill', { id: 'alpha' })).body, 'Do alpha things.');
  } finally { await client.close(); }
  assert.equal(JSON.parse((await fs.readFile(path.join(state, 'suggestions.jsonl'), 'utf8')).trim()).text, 'From the server');
});

test('a scratch compile takes the Windows preview’s TeX settings from its environment, and runs nothing outside TeX', { skip: !hasTeX && 'Needs TeX.' }, async () => {
  const { compileFolder } = await import('../src/services/compileService.js');
  const { confinableTeX, PREVIEW_TEX_ENV } = await import('../src/services/agentSessionService.js');
  const secret = path.join(tmp, 'secret.tex').split(path.sep).join('/');
  await write(secret, '\\typeout{SECRET-READ}');
  const draft = path.join(tmp, 'restricted');
  await write(path.join(draft, 'main.tex'), `\\documentclass{article}\\begin{document}Hi.\\IfFileExists{${secret}}{\\input{${secret}}}{\\typeout{SECRET-HIDDEN}}\\immediate\\write18{echo WRITE18-RAN}\\end{document}\n`);
  const version = execFileSync('pdflatex', ['--version'], { encoding: 'utf8' });
  if (texLive) assert.match((await compileFolder({ root: draft, mainFile: 'main.tex', engine: 'pdflatex' })).log, /restricted \\write18 enabled/);
  const restricted = await compileFolder({ root: draft, mainFile: 'main.tex', engine: 'pdflatex', untrusted: true, env: PREVIEW_TEX_ENV });
  assert.ok(restricted.pdf, restricted.log);
  assert.doesNotMatch(restricted.log, /write18 enabled/, 'no shell escape at all');
  assert.doesNotMatch(restricted.log, /WRITE18-RAN\n/);
  // TeX Live 2026 made openin_any a no-op, which is why the Windows preview refuses it. ponytail: MiKTeX's [Core]
  // settings are checked here by the Windows build machine, the only place with MiKTeX
  assert.match(restricted.log, confinableTeX(version) ? /SECRET-HIDDEN/ : /SECRET-READ/);
  assert.deepEqual(await fs.readdir(draft), ['main.tex'], 'nothing was written beside it');
});

test('an untrusted compile runs no Biber, which reads and writes wherever the document says', { skip: !hasTeX && 'Needs TeX.' }, async () => {
  const { compileFolder } = await import('../src/services/compileService.js');
  const outside = path.join(tmp, 'outside-bib', 'secret.bib').split(path.sep).join('/');
  await write(outside, '@book{secret, title = {SECRET-BIB}, author = {A}, year = {2020}}\n');
  const draft = path.join(tmp, 'biber-draft');
  await write(path.join(draft, 'main.tex'), `\\documentclass{article}\\usepackage[backend=biber]{biblatex}\\addbibresource{${outside}}\\begin{document}\\cite{secret}\\printbibliography\\end{document}\n`);
  const result = await compileFolder({ root: draft, mainFile: 'main.tex', engine: 'pdflatex', untrusted: true, env: { openin_any: 'p', openout_any: 'p', shell_escape: 'f' } });
  assert.match(result.log, /Biber doesn’t run for a preview/);
  assert.doesNotMatch(result.log, /Found BibTeX data source/);
});

test('the Windows preview compiles only with a TeX that can be told to read only the draft', async () => {
  const { confinableTeX } = await import('../src/services/agentSessionService.js');
  assert.equal(confinableTeX('MiKTeX-pdfTeX 4.20 (MiKTeX 25.4)'), true);
  assert.equal(confinableTeX('pdfTeX 3.141592653-2.6-1.40.27 (TeX Live 2025)'), true);
  assert.equal(confinableTeX('pdfTeX 3.141592653-2.6-1.40.29 (TeX Live 2026)'), false);
  assert.equal(confinableTeX(''), false, 'no TeX, or one that would not say, is refused');
});
