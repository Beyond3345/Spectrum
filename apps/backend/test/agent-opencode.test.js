import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveExecutable } from '../src/services/agentSandbox.js';
const native = ['darwin', 'win32'].includes(process.platform) && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
test('installed OpenCode initializes in the native sandbox without a model call', { skip: !native && 'Requires native macOS execution.', timeout: 40000 }, async (t) => {
  try { await resolveExecutable('opencode'); } catch { t.skip('OpenCode is not installed.'); return; }
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-opencode-smoke-')));
  process.env.SPECTRUM_DATA_DIR = path.join(dir, 'data'); process.env.SPECTRUM_PROJECTS_DIR = path.join(dir, 'projects');
  const { createProject } = await import('../src/services/projectService.js');
  const { newAgentRun, getAgentRun, shutdownAgents, testAgent } = await import('../src/services/agentSessionService.js');
  const { profileFor } = await import('../src/services/agentProfiles.js');
  if (profileFor('opencode').unavailable) { t.skip(profileFor('opencode').unavailable); return; }
  try {
    const project = await createProject({ name: 'OpenCode handshake' });
    const meta = await newAgentRun({ projectId: project.id, agentId: 'opencode' });
    const run = await getAgentRun(meta.id);
    try { await run.ready; } catch (err) { throw new Error(`${err.message}\n${JSON.stringify(run.events.filter((e) => e.type === 'state'))}`); }
    assert.equal(run.status, 'ready');
    assert.ok(run.remoteId);
    // Settings › Agents' Test: without a login or key OpenCode may ask for one
    await shutdownAgents();
    assert.ok(['ready', 'sign-in'].includes((await testAgent('opencode')).test?.code));
  } finally { await shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); }
});
