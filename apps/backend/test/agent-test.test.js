// Settings › Agents' Test: the fixture agent started in native isolation without a prompt, each outcome stored, the
// result a session leaves, and the Test kept apart from that agent's turns and adapter changes. Scratch data, projects
// and home folders; no model is called.
// Run: SPECTRUM_NATIVE_AGENT_TESTS=1 node --test test/agent-test.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const native = ['darwin', 'win32'].includes(process.platform) && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
const fixture = fileURLToPath(new URL('./fixtures/acp-agent.mjs', import.meta.url));
const wait = async (until, what) => {
  const deadline = Date.now() + 10000;
  while (!(await until())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

test('Test stores each outcome; sessions store theirs; Tests, turns and installs keep apart', { skip: !native && 'Requires native macOS or Windows sandbox execution.', timeout: 120000 }, async () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'spectrum-agent-test-')));
  process.env.SPECTRUM_DATA_DIR = path.join(dir, 'data');
  process.env.SPECTRUM_PROJECTS_DIR = path.join(dir, 'projects');
  process.env.HOME = path.join(dir, 'home');
  const { createProject } = await import('../src/services/projectService.js');
  const { saveAgentConfig, agentConfigs } = await import('../src/services/agentProfiles.js');
  const { testAgent, changeAdapter, newAgentRun, getAgentRun, promptAgent, stopAgentRun, shutdownAgents } = await import('../src/services/agentSessionService.js');
  const setUp = (id, ...flags) => saveAgentConfig(id, { command: process.execPath, args: [fixture, ...flags], runtimePaths: [path.dirname(fixture)] });
  try {
    await setUp('qoder');
    let agent = await testAgent('qoder');
    assert.deepEqual([agent.state, agent.setUp, agent.test.code, agent.test.version], ['ready', true, 'ready', '1']);
    assert.deepEqual(await fs.readdir(path.join(dir, 'data', 'agents', 'homes', 'qoder', 'tmp')), [], 'the Test’s folder is gone');

    await setUp('qoder', '--auth-required');
    agent = await testAgent('qoder');
    assert.deepEqual([agent.state, agent.test.code], ['sign-in', 'sign-in']);
    await setUp('qoder', '--error');
    agent = await testAgent('qoder');
    assert.deepEqual([agent.state, agent.test.code, agent.test.detail], ['failed', 'error', 'Invalid API key']);

    await saveAgentConfig('qoder', { args: [fixture, '--exit'], apiKey: 'qoder-secret-123' });
    agent = await testAgent('qoder');
    assert.deepEqual([agent.state, agent.setUp, agent.test.code], ['failed', true, 'exited'], 'a configured agent whose Test failed stays set up');
    assert.match(agent.test.detail, /QODER_PERSONAL_ACCESS_TOKEN=\[hidden\]/);
    assert.doesNotMatch(JSON.stringify(await agentConfigs()).replace(/"apiKey":"qoder-secret-123"/, ''), /qoder-secret-123/, 'the key is hidden in what was stored');

    await saveAgentConfig('qoder', { args: [fixture, '--silent'] });
    agent = await testAgent('qoder', { limit: 1000 });
    assert.equal(agent.test.code, 'timeout');

    // Tests of different agents run one after the other
    await setUp('hermes', '--silent');
    await setUp('kimi', '--silent');
    let started = Date.now();
    await Promise.all([testAgent('hermes', { limit: 1000 }), testAgent('kimi', { limit: 1000 })]);
    assert.ok(Date.now() - started >= 2000, 'one at a time');

    // sessions store what they found
    const project = await createProject({ name: 'Test fixture' });
    await fs.writeFile(path.join(project.path, 'main.tex'), 'original\n');
    await setUp('gemini', '--auth-required');
    const refused = await getAgentRun((await newAgentRun({ projectId: project.id, agentId: 'gemini' })).id);
    await assert.rejects(refused.ready, /Agent setup failed/);
    assert.equal((await agentConfigs()).gemini.test.code, 'sign-in');
    await setUp('qoder');
    const run = await getAgentRun((await newAgentRun({ projectId: project.id, agentId: 'qoder' })).id);
    await run.ready;
    assert.equal((await agentConfigs()).qoder.test.code, 'ready');

    // a Test, and an adapter change, wait for that agent's turn to finish
    await promptAgent(run, 'wait forever');
    assert.throws(() => testAgent('qoder'), /in use/);
    await setUp('codex');
    await stopAgentRun(run);
    await assert.rejects(changeAdapter('opencode', 'install'), /installs only/);

    // a turn waits for that agent's Test
    await setUp('codex', '--silent');
    started = Date.now();
    const testing = testAgent('codex', { limit: 2000 });
    await wait(async () => (await fs.readdir(path.join(dir, 'data', 'agents', 'homes', 'codex', 'tmp')).catch(() => [])).length, 'the Test to start');
    await assert.rejects(changeAdapter('codex', 'install'), /in use/);
    await setUp('codex');
    const other = await createProject({ name: 'Waiting fixture' });
    const waiting = await getAgentRun((await newAgentRun({ projectId: other.id, agentId: 'codex' })).id);
    await waiting.ready;
    assert.ok(Date.now() - started >= 1900, 'the session opened after the Test');
    await testing;
    await stopAgentRun(waiting);

    // an old session can't start an agent its card calls unavailable
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      await promptAgent(waiting, 'hello');
      await waiting.task;
    } finally { Object.defineProperty(process, 'platform', platform); }
    assert.equal(waiting.status, 'failed');
    assert.match(waiting.events.findLast((e) => e.type === 'state').data.error, /Windows isolation/);
  } finally { await shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); }
});
