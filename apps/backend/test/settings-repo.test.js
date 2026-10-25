// The settings repository: two computers' settings, personas, own skills and templates following the user through a
// private spectrum-settings repository on a stand-in GitHub. Server processes as the computers, with scratch folders
// and a fake home folder. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GOOD_TOKEN, hasGitHttpBackend, startFakeGitHub } from './fixtures/fake-github.mjs';
import { startComputer } from './fixtures/computers.mjs';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-settings-repo-')));
const home = path.join(tmp, 'home');
mkdirSync(home);
const skip = !hasGitHttpBackend() && 'needs git http-backend';
let gh;
let mac;
let win;

before(async () => {
  if (skip) return;
  gh = await startFakeGitHub(path.join(tmp, 'repos'));
  mac = await startComputer('Mac', { tmp, home, gh });
  win = await startComputer('Windows', { tmp, home, gh });
});
after(async () => {
  await mac?.stop();
  await win?.stop();
  await gh?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const ok = (res) => {
  assert.equal(res.status, 200, res.json?.error);
  return res.json;
};
const sync = async (c) => ok(await c.api('/api/github/settings/sync', { method: 'POST', body: { force: true } }));
const persona = (id, name, prompt = 'p') => ({ id, name, colour: 'blue', prompt });

test('signed out, settings stay on this computer', { skip }, async () => {
  assert.deepEqual(await sync(mac), { ok: true, ready: false, first: false });
  assert.equal(ok(await mac.api('/api/shared/settings')).shared, false);
  assert.deepEqual(ok(await mac.api('/api/github/personas', { method: 'POST', body: { personas: [persona('a', 'A')] } })), { ok: true, personas: [persona('a', 'A')], changed: false });
});

test('the first sign-in makes a private repository, and settings go across without keys', { skip }, async () => {
  for (const c of [mac, win]) ok(await c.api('/api/github/token', { method: 'POST', body: { token: GOOD_TOKEN } }));
  const first = await sync(mac);
  assert.equal(first.ready, true, first.error);
  assert.equal(first.first, true, 'nothing of this computer’s in it yet');
  assert.equal(gh.state.repos.get('octo/spectrum-settings')?.private, true);
  ok(await mac.api('/api/shared/settings', { method: 'PUT', body: { settings: { theme: 'dark', llmApiKey: 'sk-secret', tagColours: { thesis: 'red' } } } }));
  assert.equal((await sync(mac)).first, false);
  const file = gh.files('octo', 'spectrum-settings').find((f) => f.startsWith('settings/'));
  assert.ok(file);
  assert.ok(!gh.show('octo', 'spectrum-settings', file).includes('sk-secret'), 'never a key');
  const theirs = await sync(win);
  assert.equal(theirs.first, true, 'Windows takes the repository’s first');
  const { latest } = ok(await win.api('/api/shared/settings'));
  assert.equal(latest.machineName, 'Mac');
  assert.deepEqual(latest.settings, { theme: 'dark', tagColours: { thesis: 'red' } });
});

test('personas go one file each, a deletion stays deleted and the newer change wins', { skip }, async () => {
  const post = async (c, personas) => ok(await c.api('/api/github/personas', { method: 'POST', body: { personas } }));
  const a = persona('a', 'Reviewer');
  const b = persona('b', 'Editor');
  const starter = persona('research-writer', 'Research writer');
  assert.deepEqual((await post(mac, [a, b])).personas, [a, b]);
  await sync(mac);
  assert.ok(gh.files('octo', 'spectrum-settings').includes('personas/a.json'));
  await sync(win);
  // the first time, the repository's come in, and Windows' own go to it
  const joined = await post(win, [starter]);
  assert.deepEqual(joined.personas, [starter, a, b]);
  assert.equal(joined.changed, true);
  await sync(win);
  await sync(mac);
  assert.deepEqual((await post(mac, [a, b])).personas, [a, b, starter]);
  // deleted on the Mac, so on Windows too
  await post(mac, [a, starter]);
  await sync(mac);
  await sync(win);
  assert.deepEqual((await post(win, [starter, a, b])).personas, [starter, a]);
  assert.match(gh.show('octo', 'spectrum-settings', 'personas/b.json'), /"deleted": true/);
  // changed on both: the one synced last is the newer
  await post(mac, [{ ...a, prompt: 'Mac’s' }, starter]);
  await sync(mac);
  await post(win, [starter, { ...a, prompt: 'Windows’' }]);
  await sync(win);
  await sync(mac);
  assert.deepEqual((await post(mac, [{ ...a, prompt: 'Mac’s' }, starter])).personas.find((p) => p.id === 'a').prompt, 'Windows’');
});

test('the user’s own skills follow, deletions too, and never by line', { skip }, async () => {
  const skill = path.join(mac.data, 'skills', 'own', 'my-skill');
  mkdirSync(skill, { recursive: true });
  writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: my-skill\ndescription: Mine\n---\nDo it this way.\n');
  // a file that looks like keys, which the repository never takes: the skill goes across without it
  writeFileSync(path.join(skill, '.env.example'), 'API_KEY=\n');
  await sync(mac);
  assert.ok(gh.files('octo', 'spectrum-settings').includes('skills/my-skill/files/SKILL.md'));
  assert.ok(!gh.files('octo', 'spectrum-settings').some((f) => f.endsWith('.env.example')));
  await sync(win);
  const there = path.join(win.data, 'skills', 'own', 'my-skill', 'SKILL.md');
  assert.match(readFileSync(there, 'utf8'), /Do it this way/);
  assert.ok(existsSync(path.join(skill, '.env.example')), 'still on the Mac');
  rmSync(path.dirname(there), { recursive: true });
  await sync(win);
  await sync(mac);
  assert.ok(!existsSync(skill), 'deleted on both');
});

test('a template of the user’s own follows through the repository', { skip }, async () => {
  const project = ok(await mac.api('/api/projects', { method: 'POST', body: { name: 'Lab report' } }));
  writeFileSync(path.join(project.path, 'main.tex'), '\\documentclass{article}\\begin{document}Lab\\end{document}\n');
  // a sample document with its PDF beside it, which the template keeps (only main.pdf is a compile's)
  writeFileSync(path.join(project.path, 'sample.tex'), '\\documentclass{article}\\begin{document}Sample\\end{document}\n');
  writeFileSync(path.join(project.path, 'sample.pdf'), '%PDF-1.5 sample');
  // a shipped template, so the gallery has a section to save into
  mkdirSync(path.join(tmp, 'templates-Mac', 'starter'), { recursive: true });
  writeFileSync(path.join(tmp, 'templates-Mac', 'starter', 'main.tex'), '\\documentclass{article}\\begin{document}\\end{document}\n');
  writeFileSync(path.join(tmp, 'templates-Mac', 'manifest.json'), JSON.stringify({ templates: [{ id: 'starter', label: 'Starter', mainFile: 'main.tex', category: 'reports' }], categories: [{ id: 'reports', label: 'Reports' }] }));
  const { template } = ok(await mac.api('/api/templates', { method: 'POST', body: { projectId: project.id, label: 'Lab report', category: 'reports' } }));
  await sync(mac);
  assert.ok(gh.files('octo', 'spectrum-settings').includes(`templates/${template.id}/files/sample.pdf`));
  await sync(win);
  const { templates } = ok(await win.api('/api/templates'));
  assert.ok(templates.some((t) => t.id === template.id));
  assert.equal(readFileSync(path.join(tmp, 'templates-Windows', template.id, 'sample.pdf'), 'utf8'), '%PDF-1.5 sample');
});

test('a settings repository made public on GitHub gets nothing more, its clone here notwithstanding', { skip }, async () => {
  const repo = gh.state.repos.get('octo/spectrum-settings');
  repo.private = false;
  try {
    ok(await mac.api('/api/github/personas', { method: 'POST', body: { personas: [persona('confidential', 'Reviewer', 'Confidential reviewer notes')] } }));
    const refused = await sync(mac);
    assert.match(refused.error, /spectrum-settings repository on GitHub is public/);
    assert.ok(!gh.files('octo', 'spectrum-settings').includes('personas/confidential.json'));
    assert.equal(ok(await mac.api('/api/shared/settings')).shared, false, 'settings aren’t shared through it meanwhile');
  } finally {
    repo.private = true;
  }
  assert.equal((await sync(mac)).error, undefined);
  assert.ok(gh.files('octo', 'spectrum-settings').includes('personas/confidential.json'), 'private again, it goes up');
});
