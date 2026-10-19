import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const developmentWorker = fileURLToPath(new URL('../../../../native/agent-sandbox/bin/Spectrum.AgentWorker.exe', import.meta.url));
const packagedWorker = fileURLToPath(new URL('./Spectrum.AgentWorker.exe', import.meta.url));
export async function windowsWorker() {
  for (const file of [packagedWorker, developmentWorker]) {
    if (await fs.stat(file).then((s) => s.isFile(), () => false)) return file;
  }
  throw new Error('The native Windows isolation worker is missing. Build it with node scripts/build-agent-sandbox.mjs. Agents cannot start without it.');
}
const inside = (file, root) => file.toLowerCase() === root.toLowerCase() || file.toLowerCase().startsWith(root.toLowerCase() + path.sep);
export async function spawnWindowsAgent({ executable, args, workspace, home, runtimeExecutable, runtimePaths, forbiddenRoots, cwd, env }) {
  const worker = await windowsWorker();
  const workRoot = await fs.realpath(workspace), homeRoot = await fs.realpath(home);
  const roots = [...new Set(await Promise.all([runtimeExecutable || executable, ...runtimePaths].map((p) => fs.realpath(p))))];
  for (const root of roots) {
    if (inside(os.homedir(), root) || root === path.parse(root).root || inside(workRoot, root) || inside(homeRoot, root) || forbiddenRoots.some((p) => inside(p, root) || inside(root, p))) {
      throw new Error('Choose a specific runtime folder that does not include a home folder, project, or private agent state.');
    }
  }
  if (![workRoot, homeRoot, ...roots, path.join(process.env.SystemRoot, 'System32')].some((root) => inside(executable, root))) throw new Error('This command is outside the approved runtime folders. Add its specific runtime folder in Setup.');
  // This directory belongs to the trusted backend, outside every agent grant.
  const controlRoot = path.join(os.tmpdir(), 'spectrum-agent-control');
  await fs.mkdir(controlRoot, { recursive: true });
  const control = await fs.mkdtemp(path.join(controlRoot, crypto.randomUUID() + '-'));
  if ([workRoot, homeRoot, ...roots].some((root) => inside(control, root))) throw new Error('The launch manifest must be outside the agent grants.');
  const manifest = path.join(control, 'launch.json'), cancel = path.join(control, 'cancel');
  const system = process.env.SystemRoot;
  const cleanEnv = {
    PATH: [path.dirname(executable), ...runtimePaths, path.join(system, 'System32'), system].join(path.delimiter),
    SystemRoot: system, WINDIR: system, COMSPEC: path.join(system, 'System32/cmd.exe'),
    HOME: homeRoot, USERPROFILE: homeRoot, APPDATA: path.join(homeRoot, '.config'), LOCALAPPDATA: path.join(homeRoot, '.local'),
    TEMP: path.join(homeRoot, 'tmp'), TMP: path.join(homeRoot, 'tmp'),
    XDG_CONFIG_HOME: path.join(homeRoot, '.config'), XDG_DATA_HOME: path.join(homeRoot, '.local/share'), XDG_CACHE_HOME: path.join(homeRoot, '.cache'),
    LANG: 'en_US.UTF-8', TERM: 'dumb', ...env
  };
  // Never permit an ACP terminal request to replace the clean environment roots.
  for (const [key, value] of Object.entries(env)) {
    if (/^(SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|PATH|NODE_OPTIONS|NODE_PATH|XDG_.*)$/i.test(key)) throw new Error(`Agent environment cannot override ${key}.`);
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key) || typeof value !== 'string' || value.includes('\0')) throw new Error('Invalid agent environment.');
  }
  // Node's realpath walk would require metadata access to C:\ and the host home.
  // Keep script resolution within the explicit runtime grants instead.
  const launchArgs = /^node(?:\.exe|-)/i.test(path.basename(executable)) ? ['--preserve-symlinks', '--preserve-symlinks-main', ...args] : args;
  await fs.writeFile(manifest, JSON.stringify({ executable, args: launchArgs, cwd, workspace: workRoot, home: homeRoot, reads: roots, forbidden: forbiddenRoots, env: cleanEnv, cancel, parent: process.pid }), { mode: 0o600 });
  const child = spawn(worker, [manifest], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.spectrumCancel = () => fs.writeFile(cancel, '').catch(() => {});
  child.once('close', () => fs.rm(control, { recursive: true, force: true }).catch(() => {}));
  return child;
}
