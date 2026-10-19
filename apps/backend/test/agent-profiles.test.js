import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('provider changes clear old credentials and public profiles never expose keys', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-credentials-'));
  process.env.SPECTRUM_DATA_DIR = dir;
  const { saveAgentConfig, agentConfigs, listAgents } = await import('../src/services/agentProfiles.js');
  try {
    await saveAgentConfig('opencode', { apiKey: 'private-test-key' });
    assert.equal((await agentConfigs()).opencode.keyEnv, 'OPENAI_API_KEY');
    assert.ok(!JSON.stringify(await listAgents()).includes('private-test-key'));
    await saveAgentConfig('opencode', { command: 'opencode' });
    assert.equal((await agentConfigs()).opencode.apiKey, 'private-test-key');
    await saveAgentConfig('opencode', { keyEnv: 'ANTHROPIC_API_KEY' });
    assert.equal((await agentConfigs()).opencode.apiKey, '');
    await assert.rejects(saveAgentConfig('opencode', { keyEnv: 'NODE_OPTIONS' }), /supported provider/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
