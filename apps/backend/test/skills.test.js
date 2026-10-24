// Skills: the bundled set copied from the app's resources, the user's own, on and off per computer and per project,
// and the links for agents run outside Spectrum. In-process, against throwaway data, projects and seed folders and a
// fake home folder. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-skills-')));
const home = path.join(tmp, 'home');
const seed = path.join(tmp, 'seed');
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_SKILLS_SEED_DIR: seed
});
const write = async (file, text) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };
await write(path.join(seed, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: "Finds papers: fast"\nlicense: MIT license\ncompatibility: Python 3.11+\nmetadata:\n  version: "2.4"\n  skill-author: K-Dense Inc.\n---\n\n# Alpha\n\nSearch first.\n');
await write(path.join(seed, 'alpha', 'references', 'apis.md'), 'APIs');
await write(path.join(seed, 'beta', 'SKILL.md'), '---\nname: beta\ndescription: >-\n  Reviews\n  manuscripts.\n---\nReview carefully.\n');
await write(path.join(seed, 'manifest.json'), JSON.stringify({ skills: { beta: { licence: 'MIT', author: 'K-Dense Inc.' } } }));
await write(path.join(seed, 'README.md'), 'not a skill');

const { default: Fastify } = await import('fastify');
const { registerProjectRoutes } = await import('../src/routes/projects.js');
const { registerSkillRoutes } = await import('../src/routes/skills.js');
const { createProject } = await import('../src/services/projectService.js');
const { activeSkills, loadSkill, readSkillFile, SKILLS_DIR } = await import('../src/services/skillService.js');
const app = Fastify();
// as the server answers: the error's own message
app.setErrorHandler(async (err, req, reply) => reply.code(err.statusCode || 500).send({ ok: false, error: err.message }));
registerProjectRoutes(app);
registerSkillRoutes(app);
after(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});
async function api(url, method = 'GET', body) {
  const res = await app.inject({ url, method, ...(body !== undefined && { payload: body }) });
  return { status: res.statusCode, json: res.json() };
}
const skills = async (project) => (await api(`/api/skills${project ? `?project=${project}` : ''}`)).json.skills;
const byId = async (id, project) => (await skills(project)).find((s) => s.id === id);

test('bundled skills list with their author, licence, version and files, and switch off per computer or per project', async () => {
  const listed = await skills();
  assert.deepEqual(listed.map((s) => s.id), ['alpha', 'beta']);
  assert.deepEqual(listed[0], { id: 'alpha', name: 'alpha', description: 'Finds papers: fast', author: 'K-Dense Inc.', licence: 'MIT license', version: '2.4', source: 'bundled', files: 2, compatibility: 'Python 3.11+', enabled: true, active: true });
  assert.equal(listed[1].description, 'Reviews manuscripts.');
  assert.equal(listed[1].licence, 'MIT', 'the shipped manifest names a licence the front matter leaves out');
  assert.equal(await fs.readFile(path.join(SKILLS_DIR, 'bundled', '.version'), 'utf8'), (await import('../src/config/constants.js')).APP_VERSION);
  await assert.rejects(fs.stat(path.join(SKILLS_DIR, 'bundled', 'README.md')));

  assert.equal((await api('/api/skills/alpha', 'PATCH', { enabled: false })).status, 200);
  assert.equal((await api('/api/skills/alpha', 'PATCH', { enabled: 'no' })).status, 400);
  assert.equal((await api('/api/skills/nope', 'PATCH', { enabled: false })).status, 404);
  assert.equal((await byId('alpha')).enabled, false);

  const p = await createProject({ name: 'Skills' });
  const url = `/api/projects/${p.id}/settings`;
  for (const bad of [{ on: ['Alpha'] }, { on: ['alpha'], off: ['alpha'] }, { maybe: [] }, ['alpha']]) assert.equal((await api(url, 'PATCH', { skills: bad })).status, 400, JSON.stringify(bad));
  const set = await api(url, 'PATCH', { compile: { draft: true }, skills: { on: ['alpha'], off: ['beta'] } });
  assert.deepEqual(set.json.settings, { compile: { draft: true }, skills: { on: ['alpha'], off: ['beta'] } });
  assert.deepEqual((await api(url, 'PATCH', { compile: { draft: null } })).json.settings, { skills: { on: ['alpha'], off: ['beta'] } }, 'other changes keep the skills');
  const inProject = await skills(p.id);
  assert.deepEqual(inProject.map(({ id, enabled, project, active }) => ({ id, enabled, project, active })), [
    { id: 'alpha', enabled: false, project: 'on', active: true },
    { id: 'beta', enabled: true, project: 'off', active: false }
  ]);
  assert.deepEqual((await activeSkills(p.path)).map((s) => s.id), ['alpha']);
  assert.deepEqual((await activeSkills()).map((s) => s.id), ['beta']);
  assert.deepEqual((await api(url, 'PATCH', { skills: null })).json.settings, {});
  assert.equal((await api('/api/skills/alpha', 'PATCH', { enabled: true })).status, 200);
});

test('own skills: create, edit, duplicate, import and delete, never touching the bundled ones', async () => {
  assert.equal((await api('/api/skills', 'POST', { id: 'Bad Id', description: 'x' })).status, 400);
  assert.equal((await api('/api/skills', 'POST', { id: 'mine', description: '' })).status, 400);
  assert.equal((await api('/api/skills', 'POST', { id: 'alpha', description: 'clash' })).status, 409);
  const made = await api('/api/skills', 'POST', { id: 'mine', name: 'My “own” skill', description: 'Does: things', body: '# Steps\n\nOne.' });
  assert.equal(made.status, 200, made.json.error);
  assert.deepEqual({ ...made.json.skill }, { id: 'mine', name: 'My “own” skill', description: 'Does: things', author: '', licence: '', version: '', source: 'own', files: 1, enabled: true, active: true });
  assert.equal((await loadSkill('mine')).body, '# Steps\n\nOne.');

  assert.equal((await api('/api/skills/alpha/file?path=SKILL.md', 'PUT', { content: 'x' })).status, 403);
  assert.equal((await api('/api/skills/mine/file?path=../escape.md', 'PUT', { content: 'x' })).status, 400);
  assert.equal((await api('/api/skills/mine/file?path=notes/extra.md', 'PUT', { content: 'Extra' })).status, 200);
  assert.deepEqual((await api('/api/skills/mine/files')).json.files.map((f) => f.path), ['notes/extra.md', 'SKILL.md']);
  assert.equal((await api('/api/skills/mine/file?path=notes/extra.md')).json.content, 'Extra');
  assert.equal((await api('/api/skills/alpha/file?path=references/apis.md')).json.content, 'APIs');
  assert.equal((await api('/api/skills/alpha/file?path=missing.md')).status, 404);
  await assert.rejects(readSkillFile('alpha', 'SKILL.md', 10), /over 0 KB/);

  const copy = (await api('/api/skills/alpha/duplicate', 'POST')).json.skill;
  assert.equal(copy.id, 'alpha-copy');
  assert.equal(copy.source, 'own');
  assert.equal(copy.licence, 'MIT license', 'the licence goes with the copy');
  assert.match(await fs.readFile(path.join(SKILLS_DIR, 'own', 'alpha-copy', 'SKILL.md'), 'utf8'), /^---\nname: alpha-copy\ndescription: "Finds papers: fast"/);
  assert.equal((await api('/api/skills/alpha/duplicate', 'POST')).json.skill.id, 'alpha-copy-2');

  const folder = path.join(tmp, 'outside', 'folder-name');
  await write(path.join(folder, 'SKILL.md'), '---\nname: imported-one\ndescription: Imported\n---\nBody');
  await write(path.join(folder, 'scripts', 'run.py'), 'print(1)');
  assert.equal((await api('/api/skills/import', 'POST', { path: 'relative/path' })).status, 400);
  const imported = await api('/api/skills/import', 'POST', { path: folder });
  assert.equal(imported.json.skill?.id, 'imported-one', imported.json.error);
  assert.equal(imported.json.skill.files, 2);
  assert.equal((await api('/api/skills/import', 'POST', { path: folder })).status, 409);
  const linked = path.join(tmp, 'outside', 'with-link');
  await write(path.join(linked, 'SKILL.md'), '---\nname: with-link\ndescription: Linked\n---\n');
  await fs.symlink(path.join(tmp, 'outside', 'folder-name', 'SKILL.md'), path.join(linked, 'alias.md'));
  const refused = await api('/api/skills/import', 'POST', { path: linked });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /alias\.md/);
  assert.equal((await api('/api/skills/import', 'POST', { path: path.join(tmp, 'outside') })).status, 400, 'no SKILL.md');
  assert.deepEqual((await fs.readdir(path.join(SKILLS_DIR, 'own'))).sort(), ['alpha-copy', 'alpha-copy-2', 'imported-one', 'mine'], 'a refused import leaves nothing behind');

  assert.equal((await api('/api/skills/alpha', 'DELETE')).status, 403);
  assert.equal((await api('/api/skills/alpha-copy-2', 'DELETE')).status, 200);
  assert.equal(await byId('alpha-copy-2'), undefined);
  assert.ok(await byId('alpha'));
});

test('sharing links the user’s skills that are on into agent folders that exist, and never replaces anything', async () => {
  const claude = path.join(home, '.claude', 'skills');
  await fs.mkdir(path.join(claude, 'mine'), { recursive: true }); // the user's own folder of that name
  await fs.writeFile(path.join(claude, 'mine', 'SKILL.md'), 'theirs');
  await fs.symlink(path.join(tmp, 'outside'), path.join(claude, 'their-link'));
  const off = await api('/api/skills/share');
  assert.deepEqual(off.json, { ok: true, enabled: false, targets: [
    { agent: 'agents', path: path.join(home, '.agents', 'skills'), exists: false, linked: false },
    { agent: 'claude', path: claude, exists: true, linked: false }
  ] });
  assert.equal((await api('/api/skills/share', 'PUT', { enabled: 'yes' })).status, 400);
  const on = await api('/api/skills/share', 'PUT', { enabled: true });
  assert.equal(on.json.enabled, true);
  assert.deepEqual(on.json.targets.map((t) => t.linked), [false, true]);
  await assert.rejects(fs.stat(path.join(home, '.agents')), 'a missing agent folder is never made');
  assert.equal(await fs.readFile(path.join(claude, 'mine', 'SKILL.md'), 'utf8'), 'theirs');
  assert.equal(await fs.readlink(path.join(claude, 'imported-one')), path.join(SKILLS_DIR, 'own', 'imported-one'));
  await assert.rejects(fs.lstat(path.join(claude, 'alpha')), 'built-in skills are not shared');

  await api('/api/skills/imported-one', 'PATCH', { enabled: false });
  await assert.rejects(fs.lstat(path.join(claude, 'imported-one')), 'a skill switched off loses its link');
  await api('/api/skills/imported-one', 'PATCH', { enabled: true });
  await api('/api/skills', 'POST', { id: 'later', description: 'Made while sharing' });
  assert.ok((await fs.lstat(path.join(claude, 'later'))).isSymbolicLink());
  await api('/api/skills/later', 'DELETE');
  await assert.rejects(fs.lstat(path.join(claude, 'later')));

  const stopped = await api('/api/skills/share', 'PUT', { enabled: false });
  assert.deepEqual(stopped.json.targets.map((t) => t.linked), [false, false]);
  assert.deepEqual((await fs.readdir(claude)).sort(), ['mine', 'their-link'], 'only our links go');
});
