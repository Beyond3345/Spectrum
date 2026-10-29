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
    assert.deepEqual(listed, ['bib_entries', 'bib_search', 'compile', 'fetch_bibtex', 'get_log', 'list_todos', 'literature_search', 'load_skill', 'project_map', 'suggest_todo']);
    const text = async (name, args = {}) => (await client.callTool({ name, arguments: args })).content[0].text;
    assert.equal(JSON.parse(await text('project_map')).mainFile, 'paper/main.tex');
    assert.equal(JSON.parse(await text('bib_search', { query: 'known' }))[0].key, 'known');
    assert.match(await text('suggest_todo', { text: 'From the server' }), /Suggested/);
    const failed = await client.callTool({ name: 'load_skill', arguments: { id: 'missing' } });
    assert.equal(failed.isError, true);
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
