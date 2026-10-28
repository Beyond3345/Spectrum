// The agent list, the setup saved for each agent (1.10.4's and 2.0's entries included), finding programs in the
// known folders, the state each card shows and adapter installs with a fake npm. Against a scratch data folder and a
// fake home folder; nothing is started or downloaded.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'spectrum-agent-profiles-')));
const home = path.join(dir, 'home');
process.env.SPECTRUM_DATA_DIR = path.join(dir, 'data');
process.env.HOME = home;
process.env.PATH = '/usr/bin:/bin';
const { PROFILES, profileFor, saveAgentConfig, agentConfigs, listAgents, agentEntry, agentState, launchOptions, installAdapter, removeAdapter, recordTest, AGENT_DIR } = await import('../src/services/agentProfiles.js');
after(() => fs.rm(dir, { recursive: true, force: true }));

/** An executable at rel under the fake home; its first line is shebang. */
async function program(rel, shebang = '#!/bin/sh') {
  const file = path.join(home, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${shebang}\nexit 0\n`, { mode: 0o755 });
  return file;
}
const writeConfig = async (config) => { await fs.mkdir(AGENT_DIR, { recursive: true }); await fs.writeFile(path.join(AGENT_DIR, 'config.json'), JSON.stringify(config)); };
const listed = async (id) => (await listAgents()).find((a) => a.id === id);

test('the agent list: names, reasons, adapters and Windows', async () => {
  assert.equal(new Set(PROFILES.map((p) => p.id)).size, PROFILES.length);
  assert.deepEqual(PROFILES.map((p) => p.id), ['opencode', 'codex', 'claude', 'gemini', 'copilot', 'cursor', 'kimi', 'hermes', 'qoder', 'pi', 'deepseek', 'zcode', 'workbuddy']);
  assert.ok(profileFor('workbuddy').planned && profileFor('workbuddy').unavailable, 'WorkBuddy is planned and never startable');
  assert.equal(profileFor('claude').name, 'Claude Agent');
  assert.ok(profileFor('claude').args.includes('--hide-claude-auth'));
  assert.doesNotMatch(JSON.stringify(PROFILES), /Claude Code/i);
  for (const p of PROFILES) {
    if (p.experimental || p.planned || p.windows) assert.ok((p.experimental || p.planned || p.windows).length > 40, p.id);
    if (p.adapter) assert.match(`${p.adapter.version} ${p.adapter.integrity}`, /^\d+\.\d+\.\d+ sha512-[A-Za-z0-9+/]+=*$/, p.id);
  }
  assert.deepEqual(PROFILES.filter((p) => p.adapter).map((p) => p.id), ['codex', 'claude', 'pi', 'zcode']);
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    // Gemini CLI and GitHub Copilot CLI are left to the Test on Windows
    assert.deepEqual(PROFILES.filter((p) => profileFor(p.id).unavailable).map((p) => p.id), ['opencode', 'codex', 'claude', 'pi', 'zcode', 'workbuddy']);
  } finally { Object.defineProperty(process, 'platform', platform); }
});

test('entries saved by 1.10.4 and 2.0: default commands are no choice, and a key sets an agent up', async () => {
  await program('.local/bin/codex-acp');
  await writeConfig({
    codex: { command: 'codex-acp', args: [], runtimePaths: [], apiKey: '', keyEnv: 'OPENAI_API_KEY' },
    cursor: { command: 'agent', args: ['acp'], runtimePaths: [], apiKey: '', keyEnv: 'CURSOR_API_KEY' },
    // a key ZCode no longer lists
    zcode: { command: 'zcode-acp-server', args: [], runtimePaths: [], apiKey: 'zai-private', keyEnv: 'ZAI_API_KEY' }
  });
  let codex = await listed('codex');
  assert.deepEqual([codex.command, codex.source, codex.configured, codex.state, codex.setUp], ['', 'found', false, 'sign-in', false]);
  assert.equal((await listed('cursor')).command, '');
  const zcode = await listed('zcode');
  assert.ok(zcode.keyEnvs.includes('ZAI_API_KEY') && zcode.hasKey, 'a key saved under a variable no longer offered can still be removed');
  await saveAgentConfig('codex', { apiKey: 'openai-private' });
  codex = await listed('codex');
  assert.deepEqual([codex.state, codex.setUp], ['untested', true]);
  assert.equal((await agentConfigs()).codex.command, '');
  assert.ok(!('args' in (await agentConfigs()).codex), 'the profile’s own arguments are not saved');
  assert.doesNotMatch(JSON.stringify(await listAgents()), /openai-private|zai-private/, 'keys never leave the backend');
});

test('finding programs in the known folders, other names and a chosen program', async () => {
  await program('.local/bin/cursor-agent');
  assert.deepEqual([(await listed('cursor')).source, (await listed('cursor')).program], ['found', path.join(home, '.local/bin/cursor-agent')]);
  await program('.npm-global/bin/qodercli');
  assert.equal((await listed('qoder')).program, path.join(home, '.npm-global/bin/qodercli'), 'qodercli when there is no qoder');
  const chosen = await program('elsewhere/my-gemini');
  await saveAgentConfig('gemini', { command: chosen });
  const gemini = await listed('gemini');
  assert.deepEqual([gemini.source, gemini.command, gemini.configured, gemini.state], ['chosen', chosen, true, 'untested']);
  await saveAgentConfig('gemini', { command: '' });
  assert.equal((await listed('gemini')).state, 'missing');
});

test('Claude Agent always starts with the claude.ai sign-in hidden', async () => {
  await program('.local/bin/claude-agent-acp');
  // what 1.10.4 saved
  await saveAgentConfig('claude', { command: 'claude-agent-acp', args: [] });
  const options = await launchOptions('claude', { workspace: dir, home: dir });
  assert.ok(options.args.includes('--hide-claude-auth'));
});

test('Pi: the adapter is told where Pi is, with its package readable and never the home folder', async () => {
  await program('.local/bin/pi-acp');
  assert.equal((await listed('pi')).state, 'missing', 'pi-acp alone is not enough');
  // Pi in a package under the home folder, run by an interpreter installed in the home folder itself
  const interpreter = await program('bin/fakenode');
  const pi = await program('tools/node_modules/@earendil-works/pi-coding-agent/dist/cli.js', `#!${interpreter}`);
  await fs.writeFile(path.join(home, 'tools/node_modules/@earendil-works/pi-coding-agent/package.json'), '{}');
  await fs.mkdir(path.join(home, '.pi/agent/bin'), { recursive: true });
  await fs.symlink(pi, path.join(home, '.pi/agent/bin/pi'));
  const options = await launchOptions('pi', { workspace: dir, home: dir });
  assert.equal(options.env.PI_ACP_PI_COMMAND, pi);
  assert.ok(options.runtimePaths.includes(path.join(home, 'tools/node_modules/@earendil-works/pi-coding-agent')));
  assert.ok(!options.runtimePaths.includes(home), 'a derived home folder is refused');
  assert.equal((await listed('pi')).state, 'sign-in');
});

test('each state a card shows, and which are set up', () => {
  const rows = [
    [{ planned: true }, 'planned', false],
    [{ unavailable: true, found: true }, 'unavailable', false],
    [{ found: false }, 'missing', false],
    [{ found: true, needsMissing: true, adapter: true }, 'missing', false],
    [{ found: false, adapter: true }, 'adapter', false],
    [{ found: true, test: { ok: true, code: 'ready' } }, 'ready', true],
    [{ found: true, test: { ok: false, code: 'sign-in' }, configured: true }, 'sign-in', false],
    [{ found: true, test: { ok: false, code: 'timeout' }, configured: true }, 'failed', true],
    [{ found: true, test: { ok: false, code: 'error' } }, 'failed', false],
    [{ found: true, configured: true }, 'untested', true],
    [{ found: true }, 'sign-in', false]
  ];
  for (const [input, state, setUp] of rows) assert.deepEqual(agentState(input), { state, setUp }, JSON.stringify(input));
});

test('saves at once all land, and a change forgets the last Test', async () => {
  const program = (await listed('codex')).program;
  await recordTest('codex', { ok: true, code: 'ready', version: '2.3.0', program });
  assert.equal((await listed('codex')).state, 'ready');
  await Promise.all([saveAgentConfig('hermes', { apiKey: 'one' }), saveAgentConfig('kimi', { apiKey: 'two' }), recordTest('opencode', { ok: false, code: 'timeout', program: '/x' })]);
  const config = await agentConfigs();
  assert.deepEqual([config.hermes.apiKey, config.kimi.apiKey, config.opencode.test.code], ['one', 'two', 'timeout']);
  await saveAgentConfig('codex', { runtimePaths: ['/opt/codex'] });
  assert.equal((await agentConfigs()).codex.test, undefined);
  assert.equal((await listed('codex')).state, 'untested');
});

test('provider changes clear old credentials', async () => {
  await saveAgentConfig('opencode', { apiKey: 'private-test-key' });
  assert.equal((await agentConfigs()).opencode.keyEnv, 'OPENAI_API_KEY');
  await saveAgentConfig('opencode', { command: 'opencode' });
  assert.equal((await agentConfigs()).opencode.apiKey, 'private-test-key');
  await saveAgentConfig('opencode', { keyEnv: 'ANTHROPIC_API_KEY' });
  assert.equal((await agentConfigs()).opencode.apiKey, '');
  await assert.rejects(saveAgentConfig('opencode', { keyEnv: 'NODE_OPTIONS' }), /supported provider/);
});

test('adapter installs: pinned, checked, in their own folder and with none of the user’s npm settings', async () => {
  const npmDir = path.join(dir, 'npm');
  await fs.mkdir(npmDir);
  const fake = path.join(npmDir, 'npm-cli.mjs');
  // records its arguments and environment, then installs as told by mode.json
  await fs.writeFile(fake, `import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const { version, integrity, fail } = JSON.parse(fs.readFileSync(path.join(here, 'mode.json'), 'utf8'));
fs.appendFileSync(path.join(here, 'calls.jsonl'), JSON.stringify({ args: process.argv.slice(2), env: process.env }) + '\\n');
if (fail) { console.error('network down'); process.exit(1); }
const prefix = process.argv[process.argv.indexOf('--prefix') + 1];
const spec = process.argv.at(-1), name = spec.slice(0, spec.lastIndexOf('@'));
const pkg = path.join(prefix, 'node_modules', name);
fs.mkdirSync(path.join(pkg, 'dist'), { recursive: true });
fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name, version }));
fs.writeFileSync(path.join(pkg, 'dist', 'index.js'), '');
fs.writeFileSync(path.join(prefix, 'package-lock.json'), JSON.stringify({ packages: { ['node_modules/' + name]: { version, integrity } } }));
`);
  const mode = (m) => fs.writeFile(path.join(npmDir, 'mode.json'), JSON.stringify(m));
  const { adapter } = profileFor('codex');
  const base = path.join(AGENT_DIR, 'adapters', 'codex');
  process.env.npm_config__authToken = 'npm-private';
  process.env.NPM_CONFIG_REGISTRY = 'http://127.0.0.1:9/';
  try {
    await mode({ version: adapter.version, integrity: 'sha512-wrong' });
    await assert.rejects(installAdapter('codex', { npm: fake }), /checksum/);
    await mode({ version: '2.2.0', integrity: adapter.integrity });
    await assert.rejects(installAdapter('codex', { npm: fake }), /checksum/);
    await mode({ fail: true });
    await assert.rejects(installAdapter('codex', { npm: fake }), /network down/);
    assert.deepEqual(await fs.readdir(base), [], 'a failed install leaves nothing behind');

    // a leftover target folder is replaced
    await fs.mkdir(path.join(base, adapter.version, 'junk'), { recursive: true });
    await fs.mkdir(path.join(base, '2.2.0'));
    await mode({ version: adapter.version, integrity: adapter.integrity });
    await installAdapter('codex', { npm: fake });
    assert.deepEqual(await fs.readdir(base), [adapter.version], 'older versions go');
    assert.deepEqual((await fs.readdir(path.join(base, adapter.version))).sort(), ['node_modules', 'package-lock.json']);
    const codex = await agentEntry('codex');
    assert.deepEqual([codex.source, codex.adapter.installed, codex.configured, codex.state], ['spectrum', adapter.version, true, 'untested']);
    const options = await launchOptions('codex', { workspace: dir, home: dir });
    assert.deepEqual([options.command, options.args[0]], [process.execPath, path.join(base, adapter.version, 'node_modules', adapter.package, adapter.bin)]);
    assert.ok(options.runtimePaths.includes(path.join(base, adapter.version)));

    const calls = (await fs.readFile(path.join(npmDir, 'calls.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    for (const { args, env } of calls) {
      for (const flag of ['--ignore-scripts', '--save-exact', '--registry=https://registry.npmjs.org/', '--no-audit']) assert.ok(args.includes(flag), flag);
      assert.equal(args.at(-1), `${adapter.package}@${adapter.version}`);
      assert.ok(env.HOME.startsWith(base) && env.npm_config_userconfig.startsWith(base) && env.npm_config_globalconfig.startsWith(base));
      assert.doesNotMatch(JSON.stringify(env), /npm-private|127\.0\.0\.1:9/, 'the user’s npm settings and tokens are never passed');
    }
    await assert.rejects(installAdapter('opencode', { npm: fake }), /installs only/);

    // 1.10.4 rewrites the entry in its own shape; the folder alone says the adapter is there
    await writeConfig({ ...(await agentConfigs()), codex: { command: 'codex-acp', args: [], runtimePaths: [], apiKey: '', keyEnv: 'OPENAI_API_KEY' } });
    assert.equal((await agentEntry('codex')).source, 'spectrum');
    await removeAdapter('codex');
    await assert.rejects(fs.access(base));
    assert.equal((await agentEntry('codex')).source, 'found');
  } finally {
    delete process.env.npm_config__authToken;
    delete process.env.NPM_CONFIG_REGISTRY;
  }
});
