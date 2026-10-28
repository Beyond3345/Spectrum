// The GitHub pull's merge, at the engine (gitService.js): two computers' working copies of one project and a stand-in
// GitHub (git http-backend over a scratch bare repository), each computer committing, pushing, fetching and merging
// as a Back up, Pull or Sync does. In scratch folders with a fake home folder. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs, chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
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

/** fn as the Windows computer would run it: process.platform says win32 meanwhile. */
async function asWindows(fn) {
  const real = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...real, value: 'win32' });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process, 'platform', real);
  }
}

/**
 * A commit on GitHub's main with files by their exact names, made in the bare repository, as no Mac disk keeps both of
 * two spellings. A file given as { link } is a symbolic link to it.
 */
function commitOnGitHub(repo, files) {
  const dir = gh.bare('octo', repo);
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, `index-${repo}`), GIT_AUTHOR_NAME: 'Other', GIT_AUTHOR_EMAIL: 'o@x', GIT_COMMITTER_NAME: 'Other', GIT_COMMITTER_EMAIL: 'o@x' };
  const run = (args, input) => execFileSync('git', ['-c', 'core.ignorecase=false', ...args], { cwd: dir, env, input }).toString().trim();
  run(['read-tree', 'main']);
  for (const [rel, text] of Object.entries(files)) {
    const link = typeof text === 'object' && text.link;
    run(['update-index', '--add', '--cacheinfo', `${link ? '120000' : '100644'},${run(['hash-object', '-w', '--stdin'], link || text)},${rel}`]);
  }
  run(['update-ref', 'refs/heads/main', run(['commit-tree', run(['write-tree']), '-p', 'main', '-m', 'From another computer'])]);
}

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

test('two names for one file from GitHub are kept there by the pull and the next backups, and after a clone', { skip }, async () => {
  const { A, B, repo } = await pair({ 'main.tex': 'x\n' });
  commitOnGitHub(repo, { 'figures/Plot.pdf': 'PDF upper', 'figures/plot.pdf': 'PDF lower' });
  const result = await sync(B);
  assert.ok(result.problems.some((p) => /differ only in letter case/.test(p)));
  write(B, 'main.tex', 'x, edited on B\n');
  await sync(B);
  for (const f of ['figures/Plot.pdf', 'figures/plot.pdf']) assert.ok(gh.files('octo', repo).includes(f), f);
  // a clone, whose disk keeps one of the two
  const C = path.join(tmp, `C${n}`);
  mkdirSync(C);
  await g.cloneInto(C, `${gh.web}/octo/${repo}.git`, token);
  write(C, 'main.tex', 'x, edited on C\n');
  const { left } = await g.commitAll(C, { message: 'Backup', author });
  assert.ok(left.some((l) => /differ only in letter case/.test(l)), 'named for a rename');
  await g.pushOrigin(C, token);
  for (const f of ['figures/Plot.pdf', 'figures/plot.pdf']) assert.ok(gh.files('octo', repo).includes(f), f);
  assert.equal(read(A, 'main.tex'), 'x\n');
});

test('on Windows, a name it can’t have is left on GitHub and named, and the pull’s other changes come in', { skip }, async () => {
  const { A, B, repo } = await pair({ 'main.tex': 'one\n', 'other.tex': 'other\n' });
  write(A, 'main.tex', 'one, from the Mac\n');
  await sync(A);
  // on GitHub itself, as a Windows disk (the CI's own) can't hold it
  commitOnGitHub(repo, { 'Why?.tex': 'why\n' });
  const result = await asWindows(() => sync(B));
  assert.ok(result.problems.some((p) => /“Why\?\.tex” can’t be a file name on Windows/.test(p)));
  assert.equal(read(B, 'main.tex'), 'one, from the Mac\n');
  assert.equal(read(B, 'Why?.tex'), null, 'never written here');
  write(B, 'other.tex', 'other, from Windows\n');
  await asWindows(() => sync(B));
  assert.ok(gh.files('octo', repo).includes('Why?.tex'), 'not deleted from GitHub');
  assert.equal(gh.show('octo', repo, 'other.tex'), 'other, from Windows\n');
});

test('CRLF line ends from a Git for Windows checkout neither block a pull nor go up', { skip }, async () => {
  const { A, B, repo } = await pair({ 'refs.bib': 'a\nb\n' });
  // Git for Windows' checkout, which its own config reads as LF
  execFileSync('git', ['config', 'core.autocrlf', 'true'], { cwd: B });
  write(B, 'refs.bib', 'a\r\nb\r\n');
  assert.equal((await g.commitAll(B, { message: 'Backup', author })).committed, false);
  write(A, 'refs.bib', 'a\nb\nc\n');
  await sync(A);
  const result = await sync(B);
  assert.equal(result.state, 'merged');
  assert.equal(read(B, 'refs.bib'), 'a\nb\nc\n');
  // Windows' own repository gets that setting, so a CRLF-only change commits nothing and an edit goes up as LF
  const C = path.join(tmp, `W${n}`);
  mkdirSync(C);
  await g.cloneInto(C, `${gh.web}/octo/${repo}.git`, token);
  write(C, 'refs.bib', 'a\r\nb\r\nc\r\n');
  await asWindows(async () => {
    assert.equal((await g.commitAll(C, { message: 'Backup', author })).committed, false);
    write(C, 'refs.bib', 'a\r\nb\r\nc\r\nd\r\n');
    assert.equal((await g.commitAll(C, { message: 'Backup', author })).committed, true);
  });
  assert.equal(execFileSync('git', ['config', 'core.autocrlf'], { cwd: C }).toString().trim(), 'true');
  await g.pushOrigin(C, token);
  assert.equal(gh.show('octo', repo, 'refs.bib'), 'a\nb\nc\nd\n');
});

test('a link comes through as a link, a script keeps its execute bit from Windows, and a clone’s scripts follow the umask', { skip: skip || (process.platform === 'win32' && 'links need Developer Mode, and Windows keeps no execute bit or umask (its side runs as Windows here)') }, async () => {
  const { A, B, repo } = await pair({ 'main.tex': 'x\n' });
  symlinkSync('../shared/library.bib', path.join(A, 'refs.bib'));
  write(A, 'run.sh', '#!/bin/sh\necho 1\n');
  chmodSync(path.join(A, 'run.sh'), 0o755);
  await sync(A);
  await sync(B);
  assert.ok(lstatSync(path.join(B, 'refs.bib')).isSymbolicLink());
  assert.equal(readlinkSync(path.join(B, 'refs.bib')), '../shared/library.bib');
  rmSync(path.join(A, 'refs.bib'));
  symlinkSync('../shared/other.bib', path.join(A, 'refs.bib'));
  await sync(A);
  assert.equal((await sync(B)).state, 'merged', 'a changed link pulls');
  assert.equal(readlinkSync(path.join(B, 'refs.bib')), '../shared/other.bib');
  // Windows: no execute bit on disk
  chmodSync(path.join(B, 'run.sh'), 0o644);
  write(B, 'run.sh', '#!/bin/sh\necho 2\n');
  await asWindows(() => g.commitAll(B, { message: 'Backup', author }));
  assert.equal((await g.treeFiles(B, await g.headOid(B))).get('run.sh').mode, '100755');
  const C = path.join(tmp, `X${n}`);
  mkdirSync(C);
  await g.cloneInto(C, `${gh.web}/octo/${repo}.git`, token);
  assert.equal(statSync(path.join(C, 'run.sh')).mode & 0o777, 0o755);
});

test('a decomposed name from a Mac’s disk is committed composed', { skip: skip || (process.platform !== 'darwin' && 'only a Mac’s names are composed: NTFS keeps a decomposed name apart') }, async () => {
  const { A } = await pair({ 'main.tex': 'x\n' });
  write(A, 'figures/cafe\u0301.png', 'PNG');
  await g.commitAll(A, { message: 'Backup', author });
  assert.ok((await g.treeFiles(A, await g.headOid(A))).has('figures/caf\u00e9.png'));
  assert.equal((await g.commitAll(A, { message: 'Backup', author })).committed, false);
});

test('entries both computers added to the end of a .bib are both kept', { skip }, async () => {
  const entry = (key, title) => `@article{${key},\n  title = {${title}},\n  year = {2015}\n}\n`;
  const { A, B } = await pair({ 'refs.bib': entry('base2010', 'Base') });
  write(A, 'refs.bib', `${entry('base2010', 'Base')}\n${entry('minsky1961steps', 'Steps')}`);
  await sync(A);
  write(B, 'refs.bib', `${entry('base2010', 'Base')}\n${entry('lecun2015deep', 'Deep learning')}`);
  const result = await sync(B);
  assert.equal(result.conflicts, 0);
  for (const key of ['base2010', 'minsky1961steps', 'lecun2015deep']) assert.match(read(B, 'refs.bib'), new RegExp(`@article\\{${key},`));
  await sync(A);
  assert.equal(read(A, 'refs.bib'), read(B, 'refs.bib'));
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

test('a settings change under way when a pull comes waits for it, so neither undoes the other', { skip }, async () => {
  const { updateProjectSettings } = await import('../src/services/projectSettings.js');
  const { mutateProjectFiles, register } = await import('../src/services/projectService.js');
  const { A, B } = await pair({ '.spectrum/settings.json': JSON.stringify({ compile: { engine: 'xelatex' } }) });
  // listed on computer B, as a settings change only goes into a listed project's folder
  await register(JSON.parse(read(B, '.spectrum/project.json')).id, B, { name: 'Paper' });
  write(A, '.spectrum/settings.json', JSON.stringify({ compile: { engine: 'lualatex' } }));
  await sync(A);
  await g.fetchOrigin(B, token);
  // a skills choice that has read the settings, paused before it writes them
  let started;
  let release;
  const reading = new Promise((resolve) => (started = resolve));
  const gate = new Promise((resolve) => (release = resolve));
  const setting = updateProjectSettings(B, async (s) => {
    started();
    await gate;
    return { ...s, skills: { on: ['my-skill'], off: [] } };
  });
  await reading;
  // as a pull does: commit and merge under the project files' lock
  const pull = mutateProjectFiles(async () => {
    await g.commitAll(B, { message: 'Backup', author });
    return g.mergeOrigin(B, { author, checkpoint: false });
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  release();
  await setting;
  assert.equal((await pull).state, 'merged');
  assert.deepEqual(JSON.parse(read(B, '.spectrum/settings.json')), { compile: { engine: 'lualatex' }, skills: { on: ['my-skill'], off: [] } });
});

test('Typst source merges by lines, as LaTeX does', { skip }, async () => {
  const lines = (k) => Array.from({ length: 12 }, (_, i) => (i === k ? `changed ${k}` : `line ${i}`)).join('\n');
  const { A, B } = await pair({ 'main.typ': lines(-1) });
  write(A, 'main.typ', lines(1));
  await sync(A);
  write(B, 'main.typ', lines(10));
  const result = await sync(B);
  assert.equal(result.conflicts, 0);
  assert.equal(read(B, 'main.typ'), lines(1).replace('line 10', 'changed 10'));
});

test('a Typst or Markdown document’s compiled PDF stays out, and a PDF either includes goes in', { skip }, async () => {
  const { A, repo } = await pair({ 'main.typ': '= Paper\n#image("figures/plot.pdf")\n', 'notes.md': '# Notes\n![Chart](chart.pdf)\n', 'report.markdown': '# Report\n' });
  for (const pdf of ['main.pdf', 'notes.pdf', 'report.pdf', 'figures/plot.pdf', 'chart.pdf']) write(A, pdf, `%PDF ${pdf}`);
  write(A, 'figures/plot.typ', '= Plot\n');
  await sync(A);
  const files = gh.files('octo', repo);
  for (const out of ['main.pdf', 'notes.pdf', 'report.pdf']) assert.ok(!files.includes(out), out);
  // figures/plot.typ's own, which main.typ includes
  for (const kept of ['figures/plot.pdf', 'chart.pdf']) assert.ok(files.includes(kept), kept);
});

test('a secret staged with Git beforehand never goes in with the next backup', { skip }, async () => {
  const { A, repo } = await pair({ 'main.tex': 'one\n' });
  write(A, '.env', 'OPENAI_API_KEY=test-only\n');
  write(A, 'keys/id_rsa', 'test-only\n');
  execFileSync('git', ['add', '.env', 'keys/id_rsa'], { cwd: A });
  write(A, 'main.tex', 'two, a longer line\n');
  const { committed, left } = await g.commitAll(A, { message: 'Backup', author });
  assert.equal(committed, true);
  assert.equal(left.length, 2);
  const tree = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: A }).toString().split('\n');
  assert.ok(!tree.includes('.env') && !tree.includes('keys/id_rsa'), tree.join(', '));
  assert.ok(tree.includes('main.tex'));
  assert.equal(read(A, '.env'), 'OPENAI_API_KEY=test-only\n', 'the file itself stays');
  await g.pushOrigin(A, token);
  assert.ok(!gh.files('octo', repo).includes('.env'));
});

test('a pull never writes through a folder that links outside the project', { skip }, async () => {
  const { A, B } = await pair({ 'main.tex': 'main\n', 'assets/old.txt': 'old\n' });
  // B's assets folder is now a link to a folder elsewhere holding the same file
  const outside = path.join(tmp, `outside${n}`);
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'old.txt'), 'old\n');
  rmSync(path.join(B, 'assets'), { recursive: true });
  symlinkSync(outside, path.join(B, 'assets'));
  // GitHub deletes one file in it, adds another, and changes one outside it
  rmSync(path.join(A, 'assets', 'old.txt'));
  write(A, 'assets/new.txt', 'from GitHub\n');
  write(A, 'main.tex', 'main, changed\n');
  await sync(A);
  await g.fetchOrigin(B, token);
  const head = await g.headOid(B);
  await assert.rejects(g.mergeOrigin(B, { author, checkpoint: false }), (err) => err.code === 'GIT_REFUSED' && /assets\//.test(err.message));
  assert.deepEqual(readdirSync(outside), ['old.txt'], 'nothing written or deleted outside');
  assert.equal(read(B, 'main.tex'), 'main\n', 'nor anything changed here');
  assert.equal(await g.headOid(B), head);

  // the same for a link this computer's .gitignore leaves out, which a backup never commits
  const { A: C, B: D } = await pair({ 'main.tex': 'main\n' });
  const elsewhere = path.join(tmp, `elsewhere${n}`);
  mkdirSync(elsewhere);
  write(D, '.gitignore', 'assets\n');
  symlinkSync(elsewhere, path.join(D, 'assets'));
  write(C, 'assets/new.txt', 'from GitHub\n');
  await sync(C);
  await g.commitAll(D, { message: 'Backup', author });
  await g.fetchOrigin(D, token);
  await assert.rejects(g.mergeOrigin(D, { author, checkpoint: false }), (err) => err.code === 'GIT_REFUSED');
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('a pull never writes through a link it brings that differs only in letter case from a folder it fills', { skip }, async () => {
  const { B, repo } = await pair({ 'main.tex': 'main\n' });
  const outside = path.join(tmp, `outside-case${n}`);
  mkdirSync(outside);
  commitOnGitHub(repo, { Assets: { link: outside }, 'assets/pwn.txt': 'from GitHub\n' });
  await g.fetchOrigin(B, token);
  const head = await g.headOid(B);
  await assert.rejects(g.mergeOrigin(B, { author, checkpoint: false }), (err) => err.code === 'GIT_REFUSED');
  assert.deepEqual(readdirSync(outside), [], 'nothing written outside');
  assert.equal(await g.headOid(B), head);
});
