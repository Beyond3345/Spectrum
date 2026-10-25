// Going back to 1.10.4 with a project on GitHub: 1.10.4's server, taken from git, opens and edits a project 2.0 backed
// up to a stand-in GitHub, and 2.0 then finds it linked as before and backs up 1.10.4's edit. Throwaway data and
// projects folders and a fake home folder. Skips where git doesn't have 1.10.4 (a shallow clone). Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';
import { GOOD_TOKEN, hasGitHttpBackend, startFakeGitHub } from './fixtures/fake-github.mjs';
import { startComputer } from './fixtures/computers.mjs';

const RELEASE = '42ff62f'; // 1.10.4
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const hasRelease = (() => {
  try {
    execFileSync('git', ['cat-file', '-e', `${RELEASE}^{commit}`], { cwd: repo, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const skip = (!hasGitHttpBackend() && 'needs git http-backend') || (!hasRelease && `git doesn’t have ${RELEASE}`);

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-github-rollback-')));
const home = path.join(tmp, 'home');
mkdirSync(home);
let gh;

before(async () => {
  if (skip) return;
  gh = await startFakeGitHub(path.join(tmp, 'repos'));
});
after(async () => {
  await gh?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const ok = (res) => {
  assert.equal(res.status, 200, res.json?.error);
  return res.json;
};

test('1.10.4 opens and edits a project on GitHub, and 2.0 backs its edit up', { skip }, async () => {
  // 1.10.4's backend beside this checkout's packages, which it shares
  const old = path.join(tmp, 'spectrum-1.10.4');
  mkdirSync(old);
  execFileSync('git', ['archive', '--format=tar', '-o', path.join(tmp, 'old.tar'), RELEASE, 'apps/backend/src', 'apps/backend/package.json'], { cwd: repo });
  await tar.x({ file: path.join(tmp, 'old.tar'), cwd: old });
  await fs.symlink(realpathSync(path.join(repo, 'node_modules')), path.join(old, 'node_modules'), 'junction');

  let mac = await startComputer('Mac', { tmp, home, gh });
  ok(await mac.api('/api/github/token', { method: 'POST', body: { token: GOOD_TOKEN } }));
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Round trip' } }));
  ok(await mac.api(`/api/projects/${project.id}/file`, { method: 'PUT', body: { path: 'main.tex', content: '\\documentclass{article}\\begin{document}Hi\\end{document}\n' } }));
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  const meta = JSON.parse(await fs.readFile(path.join(project.path, '.spectrum', 'project.json'), 'utf8'));
  const settings = await fs.readFile(path.join(project.path, '.spectrum', 'settings.json'), 'utf8');
  await mac.stop();

  const v1 = await startComputer('Mac', { tmp, home, gh, entry: path.join(old, 'apps', 'backend', 'src', 'index.js') });
  const listed = ok(await v1.api('/api/projects')).projects.find((p) => p.id === project.id);
  assert.equal(listed.missing, false);
  const tree = ok(await v1.api(`/api/projects/${project.id}/tree`)).items.map((i) => i.path);
  assert.ok(tree.includes('main.tex') && tree.includes('.gitignore'));
  assert.ok(!tree.some((p) => p.startsWith('.git/') || p === '.git'), 'its file list leaves .git out');
  ok(await v1.api(`/api/projects/${project.id}/file`, { method: 'PUT', body: { path: 'main.tex', content: '\\documentclass{article}\\begin{document}Hi from 1.10.4\\end{document}\n' } }));
  ok(await v1.api(`/api/projects/${project.id}/tags`, { method: 'PATCH', body: { tags: ['thesis'] } }));
  await v1.stop();

  // 1.10.4 rewrote project.json through its own keys, and left settings.json as it was
  const after = JSON.parse(await fs.readFile(path.join(project.path, '.spectrum', 'project.json'), 'utf8'));
  assert.deepEqual(Object.keys(after).filter((k) => !Object.keys(meta).includes(k)), []);
  assert.equal(await fs.readFile(path.join(project.path, '.spectrum', 'settings.json'), 'utf8'), settings);

  mac = await startComputer('Mac', { tmp, home, gh });
  const status = ok(await mac.api(`/api/projects/${project.id}/github`));
  assert.equal(status.linked, true);
  ok(await mac.api(`/api/projects/${project.id}/github/backup`, { method: 'POST' }));
  assert.match(gh.show('octo', 'Round-trip', 'main.tex'), /Hi from 1\.10\.4/);
  assert.deepEqual(JSON.parse(gh.show('octo', 'Round-trip', '.spectrum/project.json')).tags, ['thesis']);
  await mac.stop();
});
