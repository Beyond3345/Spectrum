// The kept Typst (typstService.js): which compiles it serves, and when it is kept or stopped after missing a change.
// A stand-in Typst (fixtures/fake-typst.mjs) hears or misses changes on cue, so each rule is tested without waiting on
// the system's file events; the real Typst's own compiles are in typst.test.js.
// Run: node --test apps/backend/test/typst-watch.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skip = process.platform === 'win32' ? 'a script stands in for Typst' : false;
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-typst-watch-')));
const log = path.join(tmp, 'typst.log');
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_TYPST: fileURLToPath(new URL('./fixtures/fake-typst.mjs', import.meta.url)),
  FAKE_TYPST_LOG: log
});
const { stopTypstWatch } = await import('../src/services/typstService.js');
const { runCompile } = await import('../src/services/compileService.js');
const { createProject } = await import('../src/services/projectService.js');

after(async () => {
  await stopTypstWatch();
  rmSync(tmp, { recursive: true, force: true });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// (a file written within 50 ms of a compile's start may not be in it, so that compile is never taken as its answer;
// the stand-in starts faster than Typst does)
const project = async (name) => {
  const p = await createProject({ name, meta: { mainFile: 'main.typ' }, populate: (root) => fs.writeFile(path.join(root, 'main.typ'), 'one\n') });
  await sleep(120);
  return p;
};
// every Typst started since `from`: [{ command, pid }]
const started = (from = 0) => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []).slice(from);
const count = () => started().length;
const compile = (p, options = {}) => runCompile({ projectId: p.id, mainFile: 'main.typ', engine: 'auto', ...options });
const text = (result) => Buffer.from(result.pdf, 'base64').toString('utf8').split('\n').slice(1, -3).join('\n');
const edit = (p, words) => fs.writeFile(path.join(p.path, 'main.typ'), `${words}\n`);

test('a change missed while the watcher was still setting its watches compiles in a fresh Typst, and the watcher is kept', { skip }, async () => {
  process.env.FAKE_TYPST_DEAF_MS = '700';
  const p = await project('Warm');
  let from = count();
  assert.equal(text(await compile(p)), 'one');
  assert.deepEqual(started(from).map((s) => s.command), ['watch']);
  const watcher = started(from)[0].pid;

  // missed: never a stale PDF, and the same watcher still runs
  from = count();
  await edit(p, 'two');
  assert.equal(text(await compile(p)), 'two');
  assert.deepEqual(started(from).map((s) => s.command), ['compile'], 'a fresh Typst, and no new watcher');
  // asked again with nothing changed since: the watcher's PDF is older than the change, so it is not the answer
  from = count();
  assert.equal(text(await compile(p)), 'two');
  assert.deepEqual(started(from).map((s) => s.command), ['compile']);

  // once it hears, the next change is the watcher's own compile
  await sleep(800);
  from = count();
  await edit(p, 'three');
  assert.equal(text(await compile(p)), 'three');
  assert.deepEqual(started(from), [], 'no Typst was started');
  assert.equal(text(await compile(p)), 'three');
  assert.deepEqual(started(from), []);
  assert.doesNotThrow(() => process.kill(watcher, 0), 'the first watcher is still the one');
  await stopTypstWatch({ root: p.path });
});

test('a watcher that has had its time and still misses a change is stopped, and the next compile starts another', { skip }, async () => {
  process.env.FAKE_TYPST_DEAF_MS = 'forever';
  const p = await project('Deaf');
  let from = count();
  assert.equal(text(await compile(p)), 'one');
  const [first] = started(from);
  // within its first seconds a miss is forgiven
  await edit(p, 'two');
  assert.equal(text(await compile(p)), 'two');
  assert.doesNotThrow(() => process.kill(first.pid, 0));
  // after them, a change it doesn't hear shows it is deaf
  await sleep(2100);
  from = count();
  await edit(p, 'three');
  assert.equal(text(await compile(p)), 'three');
  assert.deepEqual(started(from).map((s) => s.command), ['compile']);
  await sleep(300);
  assert.throws(() => process.kill(first.pid, 0), 'the deaf watcher was stopped');
  from = count();
  assert.equal(text(await compile(p)), 'three');
  assert.deepEqual(started(from).map((s) => s.command), ['watch'], 'a new watcher');
  await stopTypstWatch({ root: p.path });
});

test('Compile with page colour is watched too, through a file of Spectrum’s own in the project', { skip }, async () => {
  process.env.FAKE_TYPST_DEAF_MS = '0';
  const p = await project('Colour');
  const wrapper = path.join(p.path, '.spectrum', 'compile', 'main.typ');
  let from = count();
  const first = await compile(p, { pageColour: '#fdf6e3' });
  assert.equal(text(first), '#set page(fill: rgb("#fdf6e3"))\n#include "/main.typ"');
  assert.equal(await fs.readFile(wrapper, 'utf8'), '#set page(fill: rgb("#fdf6e3"))\n#include "/main.typ"\n');
  assert.deepEqual(started(from).map((s) => s.command), ['watch']);
  // nothing changed: no Typst runs, and the wrapper isn't written again
  const written = (await fs.stat(wrapper)).mtimeMs;
  from = count();
  await compile(p, { pageColour: '#fdf6e3' });
  assert.deepEqual(started(from), []);
  assert.equal((await fs.stat(wrapper)).mtimeMs, written);
  // another colour is another text for the same watcher
  await sleep(100);
  const blue = await compile(p, { pageColour: '#0000ff' });
  assert.match(text(blue), /#0000ff/);
  assert.deepEqual(started(from), []);
  // without the colour the document itself is compiled, by a watcher of its own
  from = count();
  assert.equal(text(await compile(p)), 'one');
  assert.deepEqual(started(from).map((s) => s.command), ['watch']);
  // the project's files are as they were but for the PDF and Spectrum's own folder
  assert.deepEqual((await fs.readdir(p.path)).sort(), ['.spectrum', 'main.pdf', 'main.typ']);
  await stopTypstWatch({ root: p.path });
});

test('a Markdown document set through Typst is watched too, as the Typst pandoc made of it', { skip }, async (t) => {
  process.env.FAKE_TYPST_DEAF_MS = '0';
  // a pandoc that passes Spectrum's version check and writes the .md's own text as its Typst
  const shim = path.join(tmp, 'pandoc-shim');
  await fs.mkdir(shim, { recursive: true });
  await fs.writeFile(path.join(shim, 'pandoc'), [
    '#!/bin/sh',
    'if [ "$1" = --version ]; then echo "pandoc 3.12.1"; exit 0; fi',
    'first="$1"',
    'for a; do [ "$prev" = -o ] && cat "$first" > "$a"; prev="$a"; done',
    ''
  ].join('\n'), { mode: 0o755 });
  const realPath = process.env.PATH;
  process.env.PATH = shim + path.delimiter + realPath;
  t.after(() => (process.env.PATH = realPath));
  const p = await createProject({ name: 'Markdown', meta: { mainFile: 'main.md' }, populate: (root) => fs.writeFile(path.join(root, 'main.md'), 'First words.\n') });
  const run = () => runCompile({ projectId: p.id, mainFile: 'main.md', engine: 'auto', markdownEngine: 'typst' });
  let from = count();
  const first = await run();
  assert.ok(first.ok, first.error || first.log);
  assert.equal(text(first), 'First words.');
  assert.deepEqual(started(from).map((s) => s.command), ['watch']);
  assert.equal(await fs.readFile(path.join(p.path, '.spectrum', 'compile', 'main.md.typ'), 'utf8'), 'First words.\n');
  // an edit is the watcher's own compile, and nothing changed is no compile at all
  await sleep(100);
  from = count();
  await fs.writeFile(path.join(p.path, 'main.md'), 'Second words.\n');
  assert.equal(text(await run()), 'Second words.');
  assert.deepEqual(started(from), [], 'the edit');
  assert.equal(text(await run()), 'Second words.');
  assert.deepEqual(started(from), [], 'nothing changed');
  assert.deepEqual((await fs.readdir(p.path)).sort(), ['.spectrum', 'main.md', 'main.pdf']);
  await stopTypstWatch({ root: p.path });
});
