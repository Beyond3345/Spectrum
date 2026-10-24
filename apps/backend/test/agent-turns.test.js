// Local agent turns that go wrong or run long: the stored events' caps, a review draft kept up with the project, what
// the agent is told after a failed prompt, links left in the draft, requests a turn left open, 1.10 sessions, a direct
// turn that failed, a new session's early updates and Stop. Native isolation, with the draft fixture.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const native = ['darwin', 'win32'].includes(process.platform) && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
const skip = !native && 'Requires native macOS or Windows sandbox execution.';
const fixture = fileURLToPath(new URL('./fixtures/acp-draft-agent.mjs', import.meta.url));

let ready;
const setup = () => (ready ??= (async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-turns-')));
  Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects'), SPECTRUM_SKILLS_SEED_DIR: path.join(dir, 'no-skills') });
  const s = await import('../src/services/agentSessionService.js');
  const { createProject } = await import('../src/services/projectService.js');
  const { saveAgentConfig, AGENT_DIR } = await import('../src/services/agentProfiles.js');
  const open = async (files, { args = [], mode = 'review', persona } = {}) => {
    await saveAgentConfig('qoder', { command: process.execPath, args: [fixture, ...args], runtimePaths: [path.dirname(fixture)] });
    const project = await createProject({ name: `Turns ${crypto.randomUUID().slice(0, 8)}` });
    for (const [rel, text] of Object.entries(files)) await fs.writeFile(path.join(project.path, rel), text);
    const run = await s.getAgentRun((await s.newAgentRun({ projectId: project.id, agentId: 'qoder', mode, persona })).id);
    await run.ready;
    return { run, root: project.path };
  };
  const turn = async (run, prompt, status = 'completed', options) => {
    await s.promptAgent(run, prompt, options);
    await run.task;
    if (status) assert.equal(run.status, status, JSON.stringify(run.events.filter((e) => ['state', 'notice'].includes(e.type)).slice(-4)));
  };
  const lastPrompt = async (run) => (await fs.readFile(path.join(run.home, 'acp-log.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l)).filter((q) => q.method === 'session/prompt').at(-1).params.prompt[0].text;
  const stored = async (run) => JSON.parse(await fs.readFile(path.join(run.dir, 'session.json'), 'utf8'));
  // another computer's copy of the session as Spectrum finds it on disk: its folder under a new id, changed by edit
  const reopen = async (run, edit) => {
    const id = crypto.randomUUID();
    await fs.cp(run.dir, path.join(AGENT_DIR, 'runs', id), { recursive: true });
    const file = path.join(AGENT_DIR, 'runs', id, 'session.json');
    await fs.writeFile(file, JSON.stringify(edit({ ...JSON.parse(await fs.readFile(file, 'utf8')), id })));
    return s.getAgentRun(id);
  };
  after(async () => { await s.shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); });
  return { ...s, open, turn, lastPrompt, stored, reopen };
})());

test('a long streamed message keeps the turn’s start, and a huge one is stored in parts under the caps', { skip, timeout: 120000 }, async () => {
  const { open, turn, stored } = await setup();
  const { run } = await open({ 'main.tex': 'original\n' });
  await turn(run, 'hello');
  await turn(run, 'please-flood');
  const users = (events) => events.filter((e) => e.type === 'user').map((e) => e.data.text);
  assert.deepEqual(users(run.events), ['hello', 'please-flood'], 'each piece counts only its text');
  assert.deepEqual(users((await stored(run)).events), ['hello', 'please-flood']);
  const message = run.events.findLast((e) => e.data?.sessionUpdate === 'agent_message_chunk');
  assert.equal(message.data.content.text, 'ab '.repeat(30000));

  await turn(run, 'please-huge');
  const parts = run.events.filter((e) => e.data?.content?.text?.startsWith('xxx'));
  assert.ok(parts.length >= 2, 'the message went on in a stored event of its own');
  for (const e of run.events) assert.ok(JSON.stringify(e).length < 1.2 * 1024 * 1024, `event ${e.id} is under half the cap and a piece`);
  assert.ok((await fs.stat(path.join(run.dir, 'session.json'))).size < 2.2 * 1024 * 1024);
});

test('a review turn starts from the project as it is, for every file the agent hasn’t changed', { skip, timeout: 120000 }, async () => {
  const { open, turn, pendingChanges } = await setup();
  const { run, root } = await open({ 'main.tex': 'original\n', 'other.tex': 'other v1\n', 'gone.tex': 'bye\n' });
  await turn(run, 'draft one');
  await fs.writeFile(path.join(root, 'other.tex'), 'other v2\n');
  await fs.writeFile(path.join(root, 'new.tex'), 'new\n');
  await fs.rm(path.join(root, 'gone.tex'));
  await fs.writeFile(path.join(root, 'main.tex'), 'user edit\noriginal\n');
  await turn(run, 'hello');
  const draft = (rel) => fs.readFile(path.join(run.workspace, rel), 'utf8');
  assert.equal(await draft('other.tex'), 'other v2\n');
  assert.equal(await draft('new.tex'), 'new\n');
  await assert.rejects(draft('gone.tex'));
  assert.equal(await draft('main.tex'), 'original\nagent line 1\n', 'the agent’s change stays, to merge on apply');
  assert.deepEqual((await pendingChanges(run)).map((c) => c.path), ['main.tex']);
});

test('a 1.10 review session’s applied or rejected file goes back to the user’s, and its text doesn’t return', { skip, timeout: 120000 }, async () => {
  const { open, turn, reopen, pendingChanges } = await setup();
  const { run } = await open({ 'main.tex': 'original\n' });
  await turn(run, 'draft one');
  const legacy = await reopen(run, (data) => ({ ...data, resolved: ['main.tex'] }));
  assert.deepEqual(await pendingChanges(legacy), []);
  assert.equal(await fs.readFile(path.join(legacy.workspace, 'main.tex'), 'utf8'), 'original\n');
  await turn(legacy, 'draft two');
  assert.equal((await pendingChanges(legacy))[0].proposed, 'original\nagent line 1\n');
});

test('a direct turn that fails while measuring the project doesn’t fail the turns after it', { skip, timeout: 120000 }, async () => {
  const { open, turn } = await setup();
  const { run, root } = await open({ 'main.tex': 'original\n' }, { mode: 'direct' });
  await turn(run, 'hello');
  await fs.symlink('main.tex', path.join(root, 'alias.tex'));
  await turn(run, 'hello', 'failed');
  await fs.rm(path.join(root, 'alias.tex'));
  await turn(run, 'hello');
  await turn(run, 'hello');
});
