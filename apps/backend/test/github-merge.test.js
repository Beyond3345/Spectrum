// The GitHub pull's merge, at the engine (gitService.js): two computers' working copies of one project and a stand-in
// GitHub (git http-backend over a scratch bare repository), each computer committing, pushing, fetching and merging
// as a Back up, Pull or Sync does. In scratch folders with a fake home folder. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GOOD_TOKEN, hasGitHttpBackend, startFakeGitHub } from './fixtures/fake-github.mjs';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-git-merge-')));
const home = path.join(tmp, 'home');
mkdirSync(home);
Object.assign(process.env, { HOME: home, USERPROFILE: home, SPECTRUM_DATA_DIR: path.join(tmp, 'data'), SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects') });
const skip = !hasGitHttpBackend() && 'needs git http-backend';

let gh;
let g;
const author = { name: 'Octo Cat', email: '7+octo@users.noreply.github.com' };
const token = GOOD_TOKEN;

before(async () => {
  if (skip) return;
  gh = await startFakeGitHub(path.join(tmp, 'repos'));
  g = await import('../src/services/gitService.js');
});
after(async () => {
  await gh?.close();
  rmSync(tmp, { recursive: true, force: true });
});

let n = 0;
/** Two computers' copies of a new project linked to a new repository, A's first commit pushed and B's merged in from nothing. */
async function pair(files) {
  n += 1;
  const repo = `paper${n}`;
  gh.create('octo', repo);
  const url = `${gh.web}/octo/${repo}.git`;
  const A = path.join(tmp, `A${n}`);
  const B = path.join(tmp, `B${n}`);
  for (const [rel, text] of Object.entries({ '.spectrum/project.json': JSON.stringify({ id: `p${n}`, name: 'Paper' }), ...files })) write(A, rel, text);
  await g.initRepo(A);
  await g.setRemote(A, url);
  await g.commitAll(A, { message: 'First', author });
  await g.pushOrigin(A, token);
  mkdirSync(B);
  await g.cloneInto(B, url, token);
  return { A, B, repo };
}

function write(root, rel, text) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}
const read = (root, rel) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : null);

/** What Sync does on one computer: commit, fetch, merge, push. */
async function sync(root, options = {}) {
  await g.commitAll(root, { message: 'Backup', author });
  await g.fetchOrigin(root, token);
  const result = await g.mergeOrigin(root, { author, ...options });
  if (result.state !== 'confirm') await g.pushOrigin(root, token);
  return result;
}

test('one-sided changes, text merged by lines and a binary file kept with GitHub’s beside it', { skip }, async () => {
  const lines = (k) => Array.from({ length: 12 }, (_, i) => (i === k ? `changed ${k}` : `line ${i}`)).join('\n');
  const { A, B, repo } = await pair({ 'main.tex': lines(-1), 'only.tex': 'one', 'fig.png': 'PNG\0one' });
  write(A, 'main.tex', lines(1));
  write(A, 'fig.png', 'PNG\0from A');
  await sync(A);
  write(B, 'main.tex', lines(10));
  write(B, 'only.tex', 'B changed');
  write(B, 'fig.png', 'PNG\0from B');
  const result = await sync(B);
  assert.equal(result.state, 'merged');
  assert.equal(result.conflicts, 1);
  assert.equal(read(B, 'main.tex'), lines(1).replace('line 10', 'changed 10'));
  assert.equal(read(B, 'only.tex'), 'B changed');
  assert.equal(read(B, 'fig.png'), 'PNG\0from B', 'this computer’s binary file stays');
  const copy = (await fs.readdir(B)).find((f) => f.startsWith('fig (GitHub’s conflicted copy'));
  assert.ok(copy, 'GitHub’s beside it');
  assert.equal(read(B, copy), 'PNG\0from A');
  assert.ok(gh.files('octo', repo).includes(copy), 'the conflicted copy is committed');
  assert.equal(gh.parents('octo', repo), 2, 'a two-parent commit');
  assert.equal(gh.fsck('octo', repo), '', 'a sound repository');
  // and A takes it all in
  await sync(A);
  assert.equal(read(A, 'main.tex'), read(B, 'main.tex'));
  assert.equal(read(A, copy), 'PNG\0from A');
  assert.equal(read(A, 'fig.png'), 'PNG\0from B');
  // nothing left to commit on either side
  for (const root of [A, B]) assert.equal((await g.commitAll(root, { message: 'x', author })).committed, false);
});

test('a text conflict keeps this computer’s and puts GitHub’s beside it; app files never get a copy', { skip }, async () => {
  const chat = (messages) => JSON.stringify({ id: 'c1', title: 'Chat', messages, updatedAt: '2026-10-25T00:00:00.000Z' });
  const msg = (content, at) => ({ role: 'user', content, createdAt: at });
  const todo = (fields) => JSON.stringify({ id: 't1', text: 'Fix intro', done: false, createdAt: '2026-10-01', updatedAt: '2026-10-01', ...fields }, null, 2);
  const { A, B } = await pair({
    'main.tex': 'same line\n',
    '.spectrum/chats/c1.json': chat([msg('hello', '1')]),
    '.spectrum/todos/t1.json': todo({}),
    '.spectrum/settings.json': JSON.stringify({ compile: { engine: 'xelatex', draft: false } })
  });
  write(A, 'main.tex', 'A’s line\n');
  write(A, '.spectrum/chats/c1.json', chat([msg('hello', '1'), msg('from A', '2')]));
  write(A, '.spectrum/todos/t1.json', todo({ done: true }));
  write(A, '.spectrum/settings.json', JSON.stringify({ compile: { engine: 'lualatex', draft: false } }));
  await sync(A);
  write(B, 'main.tex', 'B’s line\n');
  write(B, '.spectrum/chats/c1.json', chat([msg('hello', '1'), msg('from B', '3')]));
  write(B, '.spectrum/todos/t1.json', todo({ text: 'Fix the intro' }));
  write(B, '.spectrum/settings.json', JSON.stringify({ compile: { engine: 'xelatex', draft: true } }));
  const result = await sync(B);
  assert.equal(result.conflicts, 1);
  assert.equal(result.changedApp, true);
  assert.equal(read(B, 'main.tex'), 'B’s line\n');
  const copy = (await fs.readdir(B)).find((f) => f.includes('GitHub’s conflicted copy'));
  assert.equal(read(B, copy), 'A’s line\n');
  assert.deepEqual(JSON.parse(read(B, '.spectrum/chats/c1.json')).messages.map((m) => m.content), ['hello', 'from A', 'from B']);
  assert.deepEqual(JSON.parse(read(B, '.spectrum/todos/t1.json')), { ...JSON.parse(todo({})), done: true, text: 'Fix the intro' });
  assert.deepEqual(JSON.parse(read(B, '.spectrum/settings.json')), { compile: { engine: 'lualatex', draft: true } }, 'one level deep');
  assert.ok(!(await fs.readdir(path.join(B, '.spectrum', 'chats'))).some((f) => f.includes('conflicted')));
});

test('a deletion wins only over an unchanged file, and a case-only rename is one rename', { skip }, async () => {
  const { A, B } = await pair({ 'Intro.tex': 'intro', 'gone.tex': 'old', 'kept.tex': 'old', 'Figs/a.png': 'PNG\0a' });
  await fs.rm(path.join(A, 'gone.tex'));
  await fs.rm(path.join(A, 'kept.tex'));
  await fs.rename(path.join(A, 'Intro.tex'), path.join(A, 'intro-tmp'));
  await fs.rename(path.join(A, 'intro-tmp'), path.join(A, 'intro.tex'));
  await sync(A);
  write(B, 'kept.tex', 'changed on B');
  await sync(B);
  assert.equal(read(B, 'gone.tex'), null);
  assert.equal(read(B, 'kept.tex'), 'changed on B', 'changed beats deleted');
  assert.ok((await fs.readdir(B)).includes('intro.tex'), 'renamed here');
  assert.ok(!(await fs.readdir(B)).includes('Intro.tex'));
  assert.equal(read(B, 'intro.tex'), 'intro');
  await sync(A);
  assert.equal(read(A, 'kept.tex'), 'changed on B');
});

test('many deletions at once wait for a yes', { skip }, async () => {
  const files = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}.tex`, `${i}`]));
  const { A, B } = await pair(files);
  for (let i = 0; i < 8; i++) await fs.rm(path.join(A, `s${i}.tex`));
  await sync(A);
  const asked = await sync(B);
  assert.equal(asked.state, 'confirm');
  assert.equal(asked.deleting, 8);
  assert.equal(read(B, 's0.tex'), '0', 'nothing deleted yet');
  const done = await sync(B, { allowDeletions: true });
  assert.equal(done.state, 'merged');
  assert.equal(read(B, 's0.tex'), null);
  assert.equal(read(B, 's9.tex'), '9');
});

test('a file changed after the commit puts back what the pull wrote and leaves the branch where it was', { skip }, async () => {
  const { A, B } = await pair({ 'a.tex': 'a', 'b.tex': 'b' });
  write(A, 'a.tex', 'a from A');
  write(A, 'b.tex', 'b from A');
  await sync(A);
  await g.commitAll(B, { message: 'Backup', author });
  await g.fetchOrigin(B, token);
  const before = await g.headOid(B);
  // the user types into b.tex between the commit and the pull's write
  write(B, 'b.tex', 'typed after the commit');
  await assert.rejects(g.mergeOrigin(B, { author }), (err) => err.code === 'CHANGED');
  assert.equal(read(B, 'b.tex'), 'typed after the commit', 'the edit stays');
  assert.equal(read(B, 'a.tex'), 'a', 'what was written is put back');
  assert.equal(await g.headOid(B), before, 'the branch stays');
  // the next Sync commits the edit first, and the pull goes through
  const result = await sync(B);
  assert.equal(result.state, 'merged');
  assert.equal(read(B, 'a.tex'), 'a from A');
  assert.equal(read(B, 'b.tex'), 'typed after the commit');
  assert.equal(result.conflicts, 1);
});

test('secrets, files over 100 MB, compiled PDFs and Spectrum’s own files stay out', { skip }, async () => {
  const doc = '\\documentclass{article}\\begin{document}x\\end{document}';
  const { A, repo } = await pair({ 'main.tex': doc, 'figure.tex': '\\includegraphics{plot}' });
  write(A, '.env', 'KEY=1');
  write(A, 'keys/id_rsa', 'secret');
  write(A, 'main.pdf', '%PDF compiled');
  write(A, 'plot.pdf', '%PDF figure');
  write(A, '.spectrum/history/index.json', '{}');
  write(A, '.spectrum/open/m.json', '{}');
  write(A, '.spectrum/todos/t.json', '{}');
  write(A, 'notes (Mac’s conflicted copy 2026-10-25).tex', 'sync app');
  await fs.writeFile(path.join(A, 'big.bin'), Buffer.alloc(0));
  await fs.truncate(path.join(A, 'big.bin'), 100 * 1024 * 1024 + 1);
  const { left } = await g.commitAll(A, { message: 'Backup', author });
  await g.pushOrigin(A, token);
  const files = gh.files('octo', repo);
  for (const out of ['.env', 'keys/id_rsa', 'main.pdf', 'big.bin', '.spectrum/history/index.json', '.spectrum/open/m.json', 'notes (Mac’s conflicted copy 2026-10-25).tex']) assert.ok(!files.includes(out), out);
  for (const kept of ['plot.pdf', '.spectrum/todos/t.json', '.spectrum/project.json', 'main.tex', '.gitignore']) assert.ok(files.includes(kept), kept);
  assert.equal(left.length, 3);
  assert.ok(readFileSync(path.join(A, '.git/info/exclude'), 'utf8').includes('/main.pdf'));
});

test('Spectrum leaves a repository alone while another program works in it, and refuses LFS, submodules and a detached HEAD', { skip }, async () => {
  const { A } = await pair({ 'main.tex': 'x' });
  assert.equal(await g.refusal(A), null);
  writeFileSync(path.join(A, '.git', 'index.lock'), '');
  assert.match(await g.refusal(A), /index\.lock/);
  rmSync(path.join(A, '.git', 'index.lock'));
  writeFileSync(path.join(A, '.gitattributes'), '*.psd filter=lfs diff=lfs merge=lfs -text\n');
  assert.match(await g.refusal(A), /LFS/);
  rmSync(path.join(A, '.gitattributes'));
  writeFileSync(path.join(A, '.gitmodules'), '');
  assert.match(await g.refusal(A), /submodules/);
  rmSync(path.join(A, '.gitmodules'));
  writeFileSync(path.join(A, '.git', 'HEAD'), `${await g.headOid(A)}\n`);
  assert.match(await g.refusal(A), /detached/);
  writeFileSync(path.join(A, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(path.join(A, '.git', 'MERGE_HEAD'), '');
  assert.match(await g.refusal(A), /middle of a merge/);
});
