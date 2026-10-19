import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--test', 'apps/backend/test/agent-sandbox.test.js', 'apps/backend/test/agent-windows.test.js', 'apps/backend/test/agent-workspace.test.js', 'apps/backend/test/agent-sessions.test.js', 'apps/backend/test/agent-opencode.test.js', 'apps/backend/test/agent-profiles.test.js'], {
  stdio: 'inherit', env: { ...process.env, SPECTRUM_NATIVE_AGENT_TESTS: ['darwin', 'win32'].includes(process.platform) ? '1' : '0' }
});
process.exit(result.status ?? 1);
