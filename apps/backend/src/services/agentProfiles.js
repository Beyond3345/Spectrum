import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATA_DIR } from '../config/constants.js';
import { writeJsonAtomic } from '../utils/fsUtils.js';
import { resolveExecutable, isolationAvailable } from './agentSandbox.js';
import { safeJoin } from '../utils/pathUtils.js';

export const AGENT_DIR = path.join(DATA_DIR, 'agents');
const PROVIDER_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'DEEPSEEK_API_KEY', 'KIMI_API_KEY', 'ZAI_API_KEY', 'QODER_PERSONAL_ACCESS_TOKEN', 'CURSOR_API_KEY'];
export const PROFILES = [
  { id: 'opencode', name: 'OpenCode', command: 'opencode', args: ['acp'], key: 'OPENAI_API_KEY', url: 'https://opencode.ai/docs/acp/', login: ['.local/share/opencode/auth.json', '.config/opencode/opencode.json'], note: 'Sign in with OpenCode, then import its login. Provider keys can also be configured in OpenCode.' },
  { id: 'codex', name: 'Codex', command: 'codex-acp', args: [], key: 'OPENAI_API_KEY', url: 'https://github.com/agentclientprotocol/codex-acp', login: ['.codex/auth.json'], note: 'Install @agentclientprotocol/codex-acp. Import your Codex login or use an OpenAI API key.' },
  { id: 'claude', name: 'Claude Agent', command: 'claude-agent-acp', args: [], key: 'ANTHROPIC_API_KEY', url: 'https://github.com/agentclientprotocol/claude-agent-acp', login: [], note: 'Install @agentclientprotocol/claude-agent-acp. Uses an Anthropic API key; subscription login is not assumed.' },
  { id: 'qoder', name: 'Qoder', command: 'qoder', args: ['--acp'], key: 'QODER_PERSONAL_ACCESS_TOKEN', url: 'https://docs.qoder.com/cli/acp', login: [], note: 'Use a Qoder personal access token. CLI login import is not yet verified.' },
  { id: 'cursor', name: 'Cursor', command: 'agent', args: ['acp'], key: 'CURSOR_API_KEY', url: 'https://cursor.com/docs/cli/acp', login: [], note: 'Use a Cursor API key. Keychain login import is not yet verified.' },
  { id: 'kimi', name: 'Kimi Code', command: 'kimi', args: ['acp'], key: 'KIMI_API_KEY', url: 'https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html', login: ['.kimi-code/config.toml', '.kimi-code/credentials.json', '.kimi/config.toml', '.kimi/credentials.json'], note: 'Import an existing Kimi configuration/login, or configure its API key. Runtime folders may be needed for a Python installation.' },
  { id: 'hermes', name: 'Hermes', command: 'hermes', args: ['acp'], key: 'OPENROUTER_API_KEY', url: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/acp', login: ['.hermes/config.yaml', '.hermes/auth.json'], note: 'Install the Hermes ACP extra. Set a provider key or import supported configuration files.' },
  { id: 'pi', name: 'Pi', command: 'pi-acp', args: [], key: 'OPENAI_API_KEY', url: 'https://github.com/svkozak/pi-acp', login: ['.pi/agent/auth.json', '.pi/agent/models.json', '.pi/agent/settings.json'], experimental: true, note: 'Install pi-acp and Pi. The community adapter does not forward client MCP servers.' },
  { id: 'deepseek', name: 'DeepSeek Harness', command: 'dsh', args: ['--profile', 'acp'], key: 'DEEPSEEK_API_KEY', url: 'https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/acp', login: [], experimental: true, note: 'Requires a Harness installation with its official ACP profile. Source and published releases differ; set the launcher arguments for your installation.' },
  { id: 'zcode', name: 'ZCode', command: 'zcode-acp-server', args: [], key: 'ZAI_API_KEY', url: 'https://github.com/william0wang/zcode-acp', login: ['.zcode/v2/config.json', '.zcode/v2/credentials.json'], experimental: true, note: 'Requires the community adapter and ZCode runtime. Review mode remains isolated even if the adapter requests broader permissions.' },
  { id: 'workbuddy', name: 'WorkBuddy', command: '', args: [], key: '', url: 'https://open.workbuddy.cn/en/docs/openapi', login: [], unavailable: 'Official WorkBuddy integration is planned with remote support. It requires registered application access; private desktop gateways are not used.' }
];

const configFile = () => path.join(AGENT_DIR, 'config.json');
export async function agentConfigs() {
  try { return JSON.parse(await fs.readFile(configFile(), 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return {}; throw err; }
}
export function profileFor(id) {
  const profile = PROFILES.find((p) => p.id === id);
  if (!profile) throw Object.assign(new Error('Unknown agent.'), { statusCode: 400 });
  if (process.platform === 'win32' && id === 'opencode') return { ...profile, unavailable: 'OpenCode 1.19.3 is unavailable in Windows isolation: its Bun runtime requires root-directory metadata access, and its internal loopback service has not been certified. No unrestricted fallback is used.' };
  if (process.platform === 'win32' && ['codex', 'claude', 'pi', 'zcode'].includes(id)) return { ...profile, unavailable: 'This adapter is unavailable on Windows until its subprocess transport passes native isolation checks. Windows Node processes with redirected child pipes currently stall inside LPAC. The macOS integration remains available.' };
  return profile;
}
export async function listAgents() {
  const config = await agentConfigs();
  const isolated = await isolationAvailable();
  return Promise.all(PROFILES.map(async (entry) => {
    const p = profileFor(entry.id);
    const saved = config[p.id] || {};
    const command = saved.command || p.command;
    let installed = false;
    if (command) installed = await resolveExecutable(command).then(() => true, () => false);
    return { ...p, login: undefined, key: undefined, installed, command, args: saved.args || p.args, runtimePaths: saved.runtimePaths || [], keyEnv: saved.keyEnv || p.key, keyEnvs: PROVIDER_KEYS, hasKey: !!saved.apiKey, canImport: !!p.login.length, supported: isolated && !p.unavailable };
  }));
}
export async function saveAgentConfig(id, value) {
  const profile = profileFor(id);
  if (!value || typeof value !== 'object') throw new Error('Invalid agent settings.');
  const config = await agentConfigs();
  const old = config[id] || {};
  const command = String(value.command ?? old.command ?? '').trim();
  const args = value.args ?? old.args;
  const runtimePaths = value.runtimePaths ?? old.runtimePaths ?? [];
  if (command.includes('\0') || command.length > 4096 || (args && (!Array.isArray(args) || args.length > 40 || args.some((a) => typeof a !== 'string' || a.includes('\0') || a.length > 4096)))) throw new Error('Invalid executable or arguments.');
  if (!Array.isArray(runtimePaths) || runtimePaths.length > 20 || runtimePaths.some((p) => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('Runtime folders must be absolute paths.');
  const keyEnv = value.keyEnv || old.keyEnv || profile.key;
  const apiKey = value.apiKey === undefined ? (keyEnv === (old.keyEnv || profile.key) ? old.apiKey || '' : '') : String(value.apiKey);
  if (keyEnv && !PROVIDER_KEYS.includes(keyEnv)) throw new Error('Choose a supported provider credential variable.');
  if (apiKey.length > 8192 || /[\r\n\0]/.test(apiKey)) throw new Error('Invalid API key.');
  await fs.mkdir(AGENT_DIR, { recursive: true, mode: 0o700 });
  config[id] = { command, ...(args && { args }), runtimePaths, apiKey, keyEnv };
  await writeJsonAtomic(configFile(), config);
  await fs.chmod(configFile(), 0o600);
}
export async function agentHome(id) {
  profileFor(id);
  const home = path.join(AGENT_DIR, 'homes', id);
  for (const part of ['', 'tmp', '.cache', '.config', '.local/share']) await fs.mkdir(path.join(home, part), { recursive: true, mode: 0o700 });
  return fs.realpath(home);
}
export async function importAgentLogin(id) {
  const p = profileFor(id);
  if (!p.login.length) throw new Error('Login import is not supported for this agent. Use its API-key setup.');
  const home = await agentHome(id);
  let count = 0;
  for (const rel of p.login) {
    const source = path.join(os.homedir(), rel);
    let stat;
    try { stat = await fs.lstat(source); } catch (err) { if (err.code === 'ENOENT') continue; throw err; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error(`Cannot import ${rel}: expected a regular configuration file below 1 MB.`);
    const target = safeJoin(home, rel);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.copyFile(source, target);
    await fs.chmod(target, 0o600);
    count++;
  }
  if (!count) throw new Error('No supported login/configuration files were found. Sign in with the agent first, or use an API key.');
  return count;
}
