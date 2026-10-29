import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from '../config/constants.js';
import { writeJsonAtomic } from '../utils/fsUtils.js';
import { resolveExecutable, isolationAvailable, SYSTEM_READS } from './agentSandbox.js';
import { safeJoin } from '../utils/pathUtils.js';
// each adapter's whole tree, every package pinned with its checksum (npm install --package-lock-only from the version)
import codexLock from '../data/adapters/codex/package-lock.json' with { type: 'json' };
import claudeLock from '../data/adapters/claude/package-lock.json' with { type: 'json' };
import piLock from '../data/adapters/pi/package-lock.json' with { type: 'json' };
import zcodeLock from '../data/adapters/zcode/package-lock.json' with { type: 'json' };

export const ADAPTER_LOCKS = { codex: codexLock, claude: claudeLock, pi: piLock, zcode: zcodeLock };

export const AGENT_DIR = path.join(DATA_DIR, 'agents');
// the variables a saved key may go in; each profile's keys are the ones its card offers
const PROVIDER_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'KIMI_API_KEY', 'ZAI_API_KEY', 'QODER_PERSONAL_ACCESS_TOKEN', 'CURSOR_API_KEY', 'GH_TOKEN'];
const NODE_ON_WINDOWS = 'This agent’s adapter starts another program through Node.js, which stalls inside Windows isolation. It works on a Mac.';
const ACP_PROJECT = 'the Agent Client Protocol project';
/**
 * In picker order. alt: other names of the program; signIn: the command that signs in, then: what to do in it;
 * install: the command that installs it, which Spectrum only shows; adapter: the ACP adapter Spectrum can install,
 * pinned to its version and npm checksum, with its size for each Mac; needs: a program the adapter starts, passed to it
 * in env, or the app it drives; app: the agent's desktop app, by name, and bin: the agent program inside the Mac app,
 * when it carries one; experimental, windows and planned: why the agent is experimental, off on Windows or not yet
 * startable.
 */
export const PROFILES = [
  { id: 'opencode', name: 'OpenCode', command: 'opencode', args: ['acp'], url: 'https://opencode.ai/docs/acp/', keys: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'DEEPSEEK_API_KEY'], login: ['.local/share/opencode/auth.json', '.config/opencode/opencode.json'], signIn: 'opencode auth login', then: 'In OpenCode 2, type /connect inside opencode instead.', install: 'brew install anomalyco/tap/opencode-v2', windows: 'OpenCode does not run inside Windows isolation yet. Its runtime needs to read the top of drive C:, and its internal server has not passed Spectrum’s Windows checks. Spectrum never runs an agent outside isolation.' },
  { id: 'codex', name: 'Codex', command: 'codex-acp', args: [], url: 'https://github.com/agentclientprotocol/codex-acp', keys: ['OPENAI_API_KEY'], login: ['.codex/auth.json'], signIn: 'codex login', adapter: { package: '@agentclientprotocol/codex-acp', version: '2.3.0', bin: 'dist/index.js', integrity: 'sha512-VdTYaOGXqLh/aVuAKIgFG7BIzbeq537FHGo28kgBhybDbeOdFVFTtc43k/tCpScFhZyqPQWHuWf8w/QQd0qtXQ==', official: true, publisher: ACP_PROJECT, size: { arm64: '360 MB', x64: '385 MB' } }, windows: NODE_ON_WINDOWS },
  // never “Claude Code”: an API key only, with the claude.ai sign-in hidden (Anthropic's Agent SDK terms)
  { id: 'claude', name: 'Claude Agent', command: 'claude-agent-acp', args: ['--hide-claude-auth'], url: 'https://github.com/agentclientprotocol/claude-agent-acp', keys: ['ANTHROPIC_API_KEY'], login: [], adapter: { package: '@agentclientprotocol/claude-agent-acp', version: '0.98.0', bin: 'dist/index.js', integrity: 'sha512-6UGEODegNXXgS6wKX9T1v72oSLVtSmM1N/9H780ljqkaR7B+OdlfMYFdscNurfodt9l3xjGy0Bga/NtnLs/Vlw==', official: true, publisher: ACP_PROJECT, size: { arm64: '280 MB', x64: '290 MB' } }, windows: NODE_ON_WINDOWS },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', args: ['--acp'], url: 'https://github.com/google-gemini/gemini-cli', keys: ['GEMINI_API_KEY'], login: ['.gemini/settings.json', '.gemini/oauth_creds.json', '.gemini/google_accounts.json'], signIn: 'gemini', then: 'Choose Sign in with Google.', install: 'npm install -g @google/gemini-cli' },
  { id: 'copilot', name: 'GitHub Copilot CLI', command: 'copilot', args: ['--acp'], url: 'https://github.com/github/copilot-cli', keys: ['GH_TOKEN'], login: [], install: 'npm install -g @github/copilot' },
  { id: 'cursor', name: 'Cursor', command: 'cursor-agent', alt: ['agent'], args: ['acp'], url: 'https://cursor.com/docs/cli/acp', keys: ['CURSOR_API_KEY'], login: [], install: 'curl https://cursor.com/install -fsS | bash' },
  { id: 'kimi', name: 'Kimi Code', command: 'kimi', args: ['acp'], url: 'https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html', keys: ['KIMI_API_KEY'], login: ['.kimi-code/config.toml', '.kimi-code/credentials.json', '.kimi/config.toml', '.kimi/credentials.json'], signIn: 'kimi', then: 'Type /login.', install: 'npm install -g @moonshot-ai/kimi-code', app: { name: 'Kimi Code' } },
  { id: 'hermes', name: 'Hermes', command: 'hermes', args: ['acp'], url: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/acp', keys: ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'], login: ['.hermes/config.yaml', '.hermes/auth.json', '.hermes/.env'], signIn: 'hermes model', install: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash' },
  { id: 'qoder', name: 'Qoder', command: 'qoder', alt: ['qodercli'], args: ['--acp'], url: 'https://docs.qoder.com/cli/acp', keys: ['QODER_PERSONAL_ACCESS_TOKEN'], login: [], install: 'npm install -g @qoder-ai/qodercli', app: { name: 'Qoder' }, experimental: 'The ACP registry has paused Qoder because its ACP start failed in some releases. Test checks the version you have.' },
  { id: 'pi', name: 'Pi', command: 'pi-acp', args: [], url: 'https://github.com/svkozak/pi-acp', keys: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'], login: ['.pi/agent/auth.json', '.pi/agent/models.json', '.pi/agent/settings.json'], signIn: 'pi', then: 'Type /login.', adapter: { package: 'pi-acp', version: '0.0.34', bin: 'dist/index.js', integrity: 'sha512-MrCp37UbpUzkTkzTIMJQf1RYrT+kr4fgGDGFoLmBN26UupuCZp0XxVIY+7XYsMo3yDnzDeZUJ0jPyM3Si6Bkkg==', official: false, publisher: 'svkozak', size: { arm64: '7 MB', x64: '7 MB' } }, needs: { name: 'Pi', command: 'pi', install: 'npm install -g @earendil-works/pi-coding-agent', env: 'PI_ACP_PI_COMMAND' }, experimental: 'Uses a community adapter. Pi edits files and runs commands itself, so Spectrum does not show them as they happen, and Spectrum’s tools do not reach it.', windows: NODE_ON_WINDOWS },
  { id: 'deepseek', name: 'DeepSeek Harness', command: 'dsh', args: ['--profile', 'acp'], url: 'https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/acp', keys: ['DEEPSEEK_API_KEY'], login: [], install: 'npm install -g @deepseek-ai/dsh@next', app: { name: 'DeepSeek Harness', bin: 'Contents/Resources/runtime/cli/bin/dsh' }, experimental: 'A pre-release on npm. Its ACP mode is built for automation, so the workspace shows no plans, questions or terminals for it.' },
  // the adapter's own default lets ZCode act without asking, so it always starts in build mode
  { id: 'zcode', name: 'ZCode', command: 'zcode-acp-server', args: [], url: 'https://github.com/william0wang/zcode-acp', keys: [], login: ['.zcode/v2/config.json', '.zcode/v2/credentials.json'], appSignIn: true, adapter: { package: 'zcode-acp-server', version: '0.76.3', bin: 'dist/cli.js', integrity: 'sha512-ClEiDU4z+TQLGM0RselWe7qw7m5WuRQoapoKng/L1Bkpbdkn/k5k5/BCU4INVHSyvF374Wvyny10GX56axuctQ==', official: false, publisher: 'william0wang', size: { arm64: '330 MB', x64: '330 MB' } }, needs: { name: 'ZCode', command: 'zcode', app: 'ZCode', install: 'Install the ZCode app from Z.ai.', env: 'ZCODE_BIN' }, experimental: 'Uses a community adapter that drives ZCode’s internal app server. The adapter also installs about 330 MB of packages from other publishers, including a community DeepSeek harness. Spectrum always starts it in build mode, as its own default lets it act without asking.', windows: NODE_ON_WINDOWS },
  { id: 'workbuddy', name: 'WorkBuddy', command: '', args: [], url: 'https://open.workbuddy.cn/en/docs/openapi', keys: [], login: [], planned: 'Planned. WorkBuddy needs a registered application secret that cannot live in a desktop app, so it will connect through its official platform with remote support in a later release.' }
];

const configFile = () => path.join(AGENT_DIR, 'config.json');
export async function agentConfigs() {
  try { return JSON.parse(await fs.readFile(configFile(), 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return {}; throw err; }
}
let configChain = Promise.resolve();
/** Every change to config.json, one after another, so a Test's result and a Settings save never overwrite each other. change(entry) returns the new entry. */
export function updateConfig(id, change) {
  const next = configChain.then(async () => {
    const config = await agentConfigs();
    config[id] = await change({ ...config[id] });
    await fs.mkdir(AGENT_DIR, { recursive: true, mode: 0o700 });
    await writeJsonAtomic(configFile(), config);
    await fs.chmod(configFile(), 0o600);
  });
  configChain = next.catch(() => {});
  return next;
}
const withoutTest = ({ test, ...entry }) => entry;
const withoutProgram = ({ program, ...test }) => test;
/** An entry's setup, which launchOptions() hands on so a result is recorded only against the setup it started with. */
const setupOf = (entry) => { const setup = withoutTest(entry); return JSON.stringify(setup, Object.keys(setup).sort()); };
/**
 * A Test's result, or a session's (`ready`, or `sign-in` when the agent asked for authentication). Dropped when the
 * setup changed since launch; a session's is kept only when it says something new, so its Test's time stays.
 */
export function recordTest(id, result, { setup, fromSession } = {}) {
  return updateConfig(id, (entry) => {
    if (setup !== undefined && setupOf(entry) !== setup) return entry;
    const old = entry.test;
    if (fromSession && old && old.code === result.code && old.program === result.program && old.version === result.version && !result.detail) return entry;
    return { ...entry, test: { ...result, at: new Date().toISOString() } };
  });
}

export function profileFor(id) {
  const profile = PROFILES.find((p) => p.id === id);
  if (!profile) throw Object.assign(new Error('Unknown agent.'), { statusCode: 400 });
  const unavailable = profile.planned || (process.platform === 'win32' && profile.windows) || undefined;
  return { ...profile, key: profile.keys[0] || '', unavailable };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/**
 * The program the user chose: an absolute path, or a name other than the profile's own. 1.10.4 and 2.0 saved the
 * default name (codex-acp, agent, opencode) with every setup, which is no choice.
 */
export function chosenCommand(profile, saved) {
  const command = String(saved?.command || '').trim();
  return !command || command === profile.command || profile.alt?.includes(command) ? '' : command;
}

const home = () => os.homedir();
// where /Applications and Homebrew are; a scratch folder in tests, never in a release
const systemRoot = () => (process.env.NODE_ENV !== 'production' && process.env.SPECTRUM_SYSTEM_ROOT) || '/';
/**
 * Where the vendors' install scripts, the package managers and Homebrew put programs, as an app started from the
 * Finder has a short PATH. .qoder/local is where the Qoder app's SDK looks for qodercli.
 */
const knownDirs = () => process.platform === 'darwin' ? [
  ...['.opencode/bin', '.local/bin', '.kimi-code/bin', '.qoder/local', '.pi/agent/bin', '.npm-global/bin', '.bun/bin', 'Library/pnpm', '.yarn/bin', '.cargo/bin'].map((d) => path.join(home(), d)),
  ...[process.env.npm_config_prefix, process.env.NPM_CONFIG_PREFIX].filter(Boolean).map((d) => path.join(d, 'bin')),
  process.env.PNPM_HOME,
  ...['opt/homebrew/bin', 'usr/local/bin'].map((d) => path.join(systemRoot(), d))
].filter(Boolean) : [];
const searchPath = () => [process.env.PATH || '', ...knownDirs()].join(path.delimiter);
// where desktop apps are installed, for everyone and then for this user
const appDirs = () => process.platform === 'win32'
  ? [process.env.ProgramFiles, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean)
  : [path.join(systemRoot(), 'Applications'), path.join(home(), 'Applications')];
const exists = (file) => fs.access(file).then(() => true, () => false);
const isFile = (file) => fs.stat(file).then((s) => s.isFile(), () => false);
const systemFolder = (dir) => SYSTEM_READS.some((root) => dir === root || dir.startsWith(root + path.sep));
// isolation refuses a home folder or a system root, so neither is ever derived
const readable = (dir) => dir !== path.parse(dir).root && dir !== '/Users' && dir !== home() && dir !== path.dirname(home()) && !(home().startsWith(dir + path.sep)) && !systemFolder(dir);

/** The agent's desktop app, where installed; an app carrying the agent only on a Mac, where its layout is known. */
const agentApp = (profile) => profile.app && (process.platform === 'darwin' || !profile.app.bin) ? appFound(profile.app.name) : null;

/** Where the desktop app called name is installed, or null. */
export async function appFound(name) {
  for (const dir of appDirs()) {
    const app = path.join(dir, process.platform === 'win32' ? name : `${name}.app`);
    if (await exists(app)) return app;
  }
  return null;
}

/** The first of names on the PATH or in the known folders: { real, dir }, dir being the folder it was found in. */
async function findOnPath(names) {
  const dirs = searchPath().split(path.delimiter).filter(Boolean);
  for (const name of names) {
    for (const dir of dirs) {
      const real = await resolveExecutable(name, dir).catch(() => null);
      if (real) return { real, dir };
    }
  }
  return null;
}

/**
 * The folders an agent installed under the home folder needs besides its program's own: its package (the nearest
 * node_modules package, or Python environment, above it) and the installation of the interpreter its first line names.
 */
export async function programReads(real) {
  if (process.platform === 'win32') return [];
  // a program inside an app reads the rest of its bundle, and nothing else of the user's
  const reads = [real.match(/^(.*?\.app)\//)?.[1]].filter(Boolean);
  for (let dir = path.dirname(real); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (await exists(path.join(dir, 'pyvenv.cfg'))) { reads.push(dir); break; }
    const parent = path.dirname(dir);
    const inModules = path.basename(parent) === 'node_modules' || (path.basename(parent).startsWith('@') && path.basename(path.dirname(parent)) === 'node_modules');
    if (inModules && await exists(path.join(dir, 'package.json'))) { reads.push(dir); break; }
  }
  const head = await fs.open(real).then(async (file) => { try { const { buffer, bytesRead } = await file.read(Buffer.alloc(256), 0, 256, 0); return buffer.subarray(0, bytesRead).toString('utf8'); } finally { await file.close(); } }, () => '');
  if (head.startsWith('#!')) {
    const words = head.slice(2).split('\n')[0].trim().split(/\s+/);
    const name = path.basename(words[0]) === 'env' ? words.slice(1).find((w) => !w.startsWith('-')) : words[0];
    const interpreter = name && await resolveExecutable(name, searchPath()).catch(() => null);
    if (interpreter) {
      const bin = path.dirname(interpreter);
      reads.push(path.basename(bin) === 'bin' ? path.dirname(bin) : bin);
    }
  }
  return [...new Set(reads)].filter(readable);
}

/** The pinned adapter Spectrum installed for profile, or an older one it installed (for “Update adapter”), from its folder. */
export async function adapterFound(profile) {
  const a = profile.adapter;
  if (!a || process.platform === 'win32') return null;
  const base = path.join(AGENT_DIR, 'adapters', profile.id);
  const versions = (await fs.readdir(base).catch(() => [])).filter((v) => !v.startsWith('.'));
  for (const version of [a.version, ...versions.filter((v) => v !== a.version)]) {
    const folder = path.join(base, version);
    const pkg = await fs.readFile(path.join(folder, 'node_modules', a.package, 'package.json'), 'utf8').then(JSON.parse, () => null);
    const bin = path.join(folder, 'node_modules', a.package, a.bin);
    if (pkg?.version === version && await isFile(bin)) return { version, folder, bin, current: version === a.version };
  }
  return null;
}

/** The program a needed one (Pi, the ZCode app) is found as: { name, found, path?, install }. */
async function findNeeded(needs) {
  const found = await resolveExecutable(needs.command, searchPath()).catch(() => null);
  if (found) return { name: needs.name, found: true, path: found, install: needs.install, env: needs.env, reads: [path.dirname(found), ...await programReads(found)] };
  const app = needs.app && await appFound(needs.app);
  return { name: needs.name, found: !!app, ...(app && { path: app }), install: needs.install, reads: app ? [app].filter(readable) : [] };
}

/**
 * The program an agent starts with, first match wins: the one the user chose (a program, or the agent's Mac app), the
 * adapter Spectrum installed, the program inside the agent's app, then the profile's command and its other names on
 * the PATH and in the known folders. { program, source, where, command, args, reads, needs } or null; where: the app or
 * folder it was found in; command and args prefix what the profile adds.
 */
export async function findProgram(profile, saved = {}) {
  const needs = profile.needs && await findNeeded(profile.needs);
  const chosen = chosenCommand(profile, saved);
  const bin = process.platform === 'darwin' && profile.app?.bin;
  const result = async (real, source, where) => ({ program: real, source, ...(where && { where }), command: real, args: [], reads: await programReads(real), needs });
  if (chosen) {
    const real = await resolveExecutable(bin && /\.app\/?$/.test(chosen) ? path.join(chosen, bin) : chosen, searchPath()).catch(() => null);
    return real && result(real, 'chosen');
  }
  const managed = await adapterFound(profile);
  if (managed?.current) return { program: managed.bin, source: 'spectrum', command: process.execPath, args: [managed.bin], reads: [managed.folder], needs };
  const app = bin && await appFound(profile.app.name);
  const inApp = app && await resolveExecutable(path.join(app, bin)).catch(() => null);
  if (inApp) return result(inApp, 'app', app);
  const found = await findOnPath([profile.command, ...profile.alt || []].filter(Boolean));
  return found && result(found.real, 'found', found.dir);
}

/** Everything a session or a Test starts the agent with, through spawnAgentProcess(): its program, arguments, key and folders. */
export async function launchOptions(id, { workspace, home: agentHomeDir, forbiddenRoots = [] }) {
  const profile = profileFor(id);
  if (profile.unavailable) throw new Error(profile.unavailable);
  const saved = (await agentConfigs())[id] || {};
  const found = await findProgram(profile, saved);
  if (!found) {
    const app = await agentApp(profile);
    throw new Error(app ? `${profile.app.name} is installed, but its agent mode needs the ${profile.name} CLI. Install it, then try again.` : `${profile.name} was not found. Install it, or choose its program in Settings › Agents.`);
  }
  if (found.needs && !found.needs.found) throw new Error(`${profile.name} needs ${found.needs.name}, which was not found. Install it, then try again.`);
  const keyEnv = saved.keyEnv || profile.key;
  const args = [...found.args, ...(saved.args || profile.args)];
  // Advanced can't take it away
  if (id === 'claude' && !args.includes('--hide-claude-auth')) args.push('--hide-claude-auth');
  const env = {
    ...(saved.apiKey && keyEnv && { [keyEnv]: saved.apiKey }),
    ...(id === 'zcode' && { ZCODE_ACP_MODE: 'build' }),
    ...(found.needs?.env && found.needs.path && { [found.needs.env]: found.needs.path })
  };
  const options = {
    command: found.command, args, workspace, home: agentHomeDir, runtimeExecutable: found.command,
    runtimePaths: [...new Set([...(saved.runtimePaths || []), ...found.reads, ...found.needs?.reads || []])], forbiddenRoots, env,
    program: found.program, secrets: [saved.apiKey].filter(Boolean), setup: setupOf(saved)
  };
  if (id === 'opencode') {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    options.internalPort = port;
    options.args = [...options.args, '--port', String(port), '--hostname', '127.0.0.1'];
    options.env.OPENCODE_SERVER_PASSWORD = crypto.randomBytes(32).toString('hex');
    options.secrets.push(options.env.OPENCODE_SERVER_PASSWORD);
  }
  return options;
}

/**
 * Where an agent stands, in this order: planned, unavailable, missing (its program, or one it needs), adapter (an
 * adapter is needed), the stored result for the program found now (ready, sign-in or failed), untested when
 * configured in Spectrum, else sign-in. Set up: ready, untested, or failed while configured, so a Test that timed out
 * never hides an agent the user set up; a program that isn't an ACP agent never is.
 */
export function agentState({ planned, unavailable, found, needsMissing, adapter, test, configured }) {
  const state = planned ? 'planned'
    : unavailable ? 'unavailable'
      : needsMissing || (!found && !adapter) ? 'missing'
        : !found ? 'adapter'
          : test ? (test.ok ? 'ready' : test.code === 'sign-in' ? 'sign-in' : 'failed')
            : configured ? 'untested' : 'sign-in';
  return { state, setUp: state === 'ready' || state === 'untested' || (state === 'failed' && !!configured && test.code !== 'not-acp') };
}

const anyFile = async (root, files) => (await Promise.all(files.map((rel) => isFile(path.join(root, rel))))).some(Boolean);

/** One agent as Settings and the workspace see it. Keys never leave the backend. */
export async function agentEntry(id, config, isolated) {
  config ??= await agentConfigs();
  isolated ??= await isolationAvailable();
  const p = profileFor(id);
  const saved = config[id] || {};
  const found = p.planned ? null : await findProgram(p, saved);
  const managed = await adapterFound(p);
  const chosen = chosenCommand(p, saved);
  // the files alone could be ones the agent wrote itself during a Test
  const loginCopied = !!saved.loginCopied && await anyFile(path.join(AGENT_DIR, 'homes', id), p.login);
  const configured = !!saved.apiKey || loginCopied || path.isAbsolute(chosen) || found?.source === 'spectrum';
  const test = found && saved.test?.program === found.program ? withoutProgram(saved.test) : undefined;
  const keyEnv = saved.keyEnv || p.key;
  const needs = p.needs && (found?.needs || await findNeeded(p.needs));
  const app = await agentApp(p);
  const { state, setUp } = agentState({ planned: !!p.planned, unavailable: !!p.unavailable || !isolated, found: !!found, needsMissing: !!needs && !needs.found, adapter: !!p.adapter, test, configured });
  return {
    id, name: p.name, url: p.url, experimental: p.experimental, planned: p.planned, unavailable: p.unavailable,
    command: chosen, args: saved.args || p.args, runtimePaths: saved.runtimePaths || [], keyEnv,
    keyEnvs: [...p.keys, ...(keyEnv && !p.keys.includes(keyEnv) ? [keyEnv] : [])], hasKey: !!saved.apiKey,
    canImport: !!p.login.length, installed: !!found, supported: isolated && !p.unavailable,
    ...(found && { program: found.program, source: found.source, where: found.where, reads: found.reads }),
    ...(app && { app: { name: p.app.name, path: app } }),
    ...(needs && { needs: { name: needs.name, found: needs.found, install: needs.install, ...(needs.path && { path: needs.path }) } }),
    signIn: p.signIn, then: p.then, appSignIn: p.appSignIn, install: p.install,
    loginFound: await anyFile(home(), p.login), loginCopied, configured,
    ...(p.adapter && { adapter: { package: p.adapter.package, version: p.adapter.version, official: p.adapter.official, publisher: p.adapter.publisher, size: p.adapter.size[process.arch] || p.adapter.size.arm64, folder: path.join(AGENT_DIR, 'adapters', id, p.adapter.version), platform: `macOS, ${process.arch === 'arm64' ? 'Apple silicon' : 'Intel'}`, ...(managed && { installed: managed.version }) } }),
    ...(test && { test }), state, setUp
  };
}

export async function listAgents() {
  const config = await agentConfigs();
  const isolated = await isolationAvailable();
  return Promise.all(PROFILES.map((p) => agentEntry(p.id, config, isolated)));
}

export async function saveAgentConfig(id, value) {
  const profile = profileFor(id);
  if (!value || typeof value !== 'object') throw new Error('Invalid agent settings.');
  await updateConfig(id, (old) => {
    const command = chosenCommand(profile, { command: value.command ?? old.command });
    const args = value.args ?? old.args;
    const runtimePaths = value.runtimePaths ?? old.runtimePaths ?? [];
    if (command.includes('\0') || command.length > 4096 || (args && (!Array.isArray(args) || args.length > 40 || args.some((a) => typeof a !== 'string' || a.includes('\0') || a.length > 4096)))) throw new Error('Invalid executable or arguments.');
    // an app with no agent inside would hide the CLI found now
    if (/\.app\/?$/.test(command) && !(process.platform === 'darwin' && profile.app?.bin)) throw new Error(`${path.basename(command.replace(/\/$/, ''))} has no ${profile.name} agent inside it. Choose the ${profile.name} CLI (${profile.command}) instead.`);
    if (!Array.isArray(runtimePaths) || runtimePaths.length > 20 || runtimePaths.some((p) => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('Runtime folders must be absolute paths.');
    const keyEnv = value.keyEnv || old.keyEnv || profile.key;
    const apiKey = value.apiKey === undefined ? (keyEnv === (old.keyEnv || profile.key) ? old.apiKey || '' : '') : String(value.apiKey);
    if (keyEnv && !PROVIDER_KEYS.includes(keyEnv)) throw new Error('Choose a supported provider credential variable.');
    if (apiKey.length > 8192 || /[\r\n\0]/.test(apiKey)) throw new Error('Invalid API key.');
    // the profile's own arguments aren't saved, so a later Spectrum's take their place
    const next = { command, ...(args && !same(args, profile.args) && { args }), runtimePaths, apiKey, keyEnv, ...(old.loginCopied && { loginCopied: old.loginCopied }) };
    // a Test's result no longer holds once any of these changes
    const unchanged = command === chosenCommand(profile, old) && same(args ?? profile.args, old.args ?? profile.args) && same(runtimePaths, old.runtimePaths ?? []) && apiKey === (old.apiKey || '') && keyEnv === (old.keyEnv || profile.key);
    return unchanged && old.test ? { ...next, test: old.test } : next;
  });
}

export async function agentHome(id) {
  profileFor(id);
  const dir = path.join(AGENT_DIR, 'homes', id);
  for (const part of ['', 'tmp', '.cache', '.config', '.local/share']) await fs.mkdir(path.join(dir, part), { recursive: true, mode: 0o700 });
  return fs.realpath(dir);
}
export async function importAgentLogin(id) {
  const p = profileFor(id);
  if (!p.login.length) throw new Error('Login import is not supported for this agent. Use its API-key setup.');
  const agentHomeDir = await agentHome(id);
  let count = 0;
  for (const rel of p.login) {
    const source = path.join(home(), rel);
    let stat;
    try { stat = await fs.lstat(source); } catch (err) { if (err.code === 'ENOENT') continue; throw err; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error(`Cannot import ${rel}: expected a regular configuration file below 1 MB.`);
    const target = safeJoin(agentHomeDir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.copyFile(source, target);
    await fs.chmod(target, 0o600);
    count++;
  }
  if (!count) throw new Error('No supported login/configuration files were found. Sign in with the agent first, or use an API key.');
  await updateConfig(id, (entry) => ({ ...withoutTest(entry), loginCopied: new Date().toISOString() }));
  return count;
}

/** Adapters being installed or removed now, which a Test or a session of that agent waits out. */
export const installing = new Set();

/** The npm bundled beside the backend in the Mac app; in development, the one beside the running Node or on the PATH. */
async function bundledNpm() {
  const candidates = [fileURLToPath(new URL('./npm/bin/npm-cli.js', import.meta.url)), path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  const onPath = await resolveExecutable('npm').catch(() => null);
  if (onPath?.endsWith('npm-cli.js')) candidates.push(onPath);
  for (const file of candidates) if (await isFile(file)) return file;
  throw new Error('Spectrum’s npm is missing, so the adapter cannot be installed. Reinstall Spectrum.');
}

function adapterProfile(id) {
  const profile = profileFor(id);
  if (!profile.adapter) throw Object.assign(new Error('Spectrum installs only the Codex, Claude Agent, Pi and ZCode adapters.'), { statusCode: 400 });
  if (profile.unavailable) throw Object.assign(new Error(profile.unavailable), { statusCode: 400 });
  if (installing.has(id)) throw Object.assign(new Error(`${profile.name}’s adapter is already being changed.`), { statusCode: 409 });
  return profile;
}

/**
 * Installs profile's pinned adapter with npm ci into agents/adapters/<id>/<version>, its whole tree as Spectrum's
 * package-lock.json pins it (ADAPTER_LOCKS), from the npm registry only, with install scripts off and none of the user's
 * npm settings; every package installed is checked against the lock's checksum. Nothing of it runs until a Test or
 * session starts it in isolation. It goes in a staging folder first, so a failed install leaves nothing behind. npm:
 * its npm-cli.js.
 */
export async function installAdapter(id, { npm } = {}) {
  const profile = adapterProfile(id);
  const a = profile.adapter;
  const pinned = ADAPTER_LOCKS[id];
  installing.add(id);
  const base = path.join(AGENT_DIR, 'adapters', id);
  const staging = path.join(base, `.staging-${crypto.randomUUID()}`);
  try {
    await fs.mkdir(path.join(staging, '.home'), { recursive: true, mode: 0o700 });
    const { name, dependencies } = pinned.packages[''];
    await fs.writeFile(path.join(staging, 'package.json'), JSON.stringify({ name, private: true, dependencies }));
    await fs.writeFile(path.join(staging, 'package-lock.json'), JSON.stringify(pinned));
    // two files, as npm refuses one loaded as both
    const [rc, globalRc] = [path.join(staging, '.npmrc'), path.join(staging, '.npmrc-global')];
    for (const file of [rc, globalRc]) await fs.writeFile(file, '');
    const proxies = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(https?_proxy|no_proxy)$/i.test(k)));
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: path.join(staging, '.home'), npm_config_cache: path.join(staging, '.cache'), npm_config_userconfig: rc, npm_config_globalconfig: globalRc, ...proxies };
    // as the disk has it: through a link, npm ci takes the folder for a package the lock doesn't have
    const args = [npm || await bundledNpm(), 'ci', '--prefix', await fs.realpath(staging), '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'];
    await new Promise((resolve, reject) => execFile(process.execPath, args, { cwd: staging, env, timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 }, (err, _out, stderr) => (
      err ? reject(new Error(`npm could not install ${a.package} ${a.version}${err.killed ? ' within 10 minutes' : ''}. ${String(stderr).trim().slice(-600)}`)) : resolve()
    )));
    // what npm installed, as it records it: each package the lock's, with its checksum (one bundled inside another
    // comes with that one's)
    const installed = await fs.readFile(path.join(staging, 'node_modules', '.package-lock.json'), 'utf8').then(JSON.parse, () => ({}));
    const entries = Object.entries(installed.packages || {});
    const checked = ([rel, entry]) => {
      const want = pinned.packages[rel];
      return want && entry.version === want.version && (want.inBundle ? entry.inBundle : entry.integrity === want.integrity);
    };
    const top = installed.packages?.[`node_modules/${a.package}`];
    if (top?.version !== a.version || top?.integrity !== a.integrity || !entries.every(checked)) throw new Error(`npm did not install ${a.package} ${a.version} with the checksums Spectrum expects, so nothing was installed.`);
    if (!(await isFile(path.join(staging, 'node_modules', a.package, a.bin)))) throw new Error(`${a.package} ${a.version} has no ${a.bin}, so nothing was installed.`);
    for (const rel of ['.home', '.cache', '.npmrc', '.npmrc-global']) await fs.rm(path.join(staging, rel), { recursive: true, force: true });
    const target = path.join(base, a.version);
    if (await exists(target)) {
      const aside = path.join(base, `.old-${crypto.randomUUID()}`);
      await fs.rename(target, aside);
      await fs.rm(aside, { recursive: true, force: true });
    }
    await fs.rename(staging, target);
    // older versions, and anything an earlier attempt left
    for (const name of await fs.readdir(base)) if (name !== a.version) await fs.rm(path.join(base, name), { recursive: true, force: true });
    await updateConfig(id, withoutTest);
  } catch (err) {
    await fs.rm(staging, { recursive: true, force: true });
    throw err;
  } finally { installing.delete(id); }
}

export async function removeAdapter(id) {
  adapterProfile(id);
  installing.add(id);
  try {
    await fs.rm(path.join(AGENT_DIR, 'adapters', id), { recursive: true, force: true });
    await updateConfig(id, withoutTest);
  } finally { installing.delete(id); }
}
