import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { spawnWindowsAgent, windowsWorker } from './agentSandboxWindows.js';

export async function isolationAvailable() {
  if (process.platform === 'darwin') return true;
  if (process.platform === 'win32') return windowsWorker().then(() => true, () => false);
  return false;
}

export const SYSTEM_READS = ['/System', '/usr', '/bin', '/sbin', '/Library', '/opt/homebrew', '/usr/local', '/private/etc', '/private/var/db', '/Applications'];
const q = (value) => JSON.stringify(value);

export function sandboxProfile({ workspace, home, executable, runtimeExecutable = executable, runtimePaths = [], forbiddenRoots = [], internalPort }) {
  const reads = [...new Set([...SYSTEM_READS, path.dirname(runtimeExecutable), ...runtimePaths])];
  return `(version 1)
(deny default)
(allow process-exec process-fork sysctl-read file-map-executable)
(allow process-info* (target same-sandbox))
(allow signal (target same-sandbox))
(allow file-read-metadata)
(allow file-read* (literal "/") ${reads.map((p) => `(subpath ${q(p)})`).join(' ')})
(allow file-read* file-write* (subpath ${q(workspace)}) (subpath ${q(home)}))
${forbiddenRoots.map((p) => `(deny file-read* file-write* (subpath ${q(p)}))`).join('\n')}
(allow file-read* file-write-data (literal "/dev/null") (literal "/dev/zero") (subpath "/dev/fd"))
(allow file-read* (literal "/dev/random") (literal "/dev/urandom"))
(deny file-read* file-write* (regex ${q(`${workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(.*/)?(\\.[sS][pP][eE][cC][tT][rR][uU][mM]|\\.[gG][iI][tT]|\\.[cC][lL][aA][uU][dD][eE]|\\.[eE][nN][vV](\\..*)?|.*\\.[pP][eE][mM]|.*\\.[kK][eE][yY])(/.*)?$`)}))
(allow mach-lookup
  (global-name "com.apple.system.opendirectoryd.libinfo")
  (global-name "com.apple.system.opendirectoryd.membership")
  (global-name "com.apple.bsd.dirhelper")
  (global-name "com.apple.system.logger")
  (global-name "com.apple.networkd")
  (global-name "com.apple.trustd.agent")
  (global-name "com.apple.TrustEvaluationAgent")
  (global-name "com.apple.SystemConfiguration.DNSConfiguration")
  (global-name "com.apple.SystemConfiguration.configd"))
(allow system-socket (require-all (socket-domain AF_SYSTEM) (socket-protocol 2)))
; HTTPS is available; local HTTP APIs and Unix sockets are not.
(allow network-outbound (require-all (remote tcp "*:443")
  (require-not (remote ip "localhost:*"))))
(allow network-outbound (remote udp "*:53"))
${Number.isInteger(internalPort) && internalPort > 0 && internalPort < 65536 ? `(allow network-bind network-inbound (local tcp "localhost:${internalPort}"))\n(allow network-outbound (remote tcp "localhost:${internalPort}"))` : ''}
`;
}

export async function resolveExecutable(command, envPath = process.env.PATH || '') {
  // never npm's extensionless shell shim, which Windows can't start
  const suffixes = process.platform === 'win32' && !path.extname(command) ? ['.exe', '.cmd', '.bat'] : [''];
  const candidates = (path.isAbsolute(command) ? [command] : envPath.split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, command))).flatMap((file) => suffixes.map((suffix) => file + suffix));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, 1);
      const real = await fs.realpath(candidate);
      if ((await fs.stat(real)).isFile()) return real;
    } catch { /* try the next PATH entry */ }
  }
  throw new Error(`“${command}” was not found. Install it or set its executable path in Agents.`);
}

export async function spawnAgentProcess({ command, args = [], workspace, home, runtimeExecutable, runtimePaths = [], forbiddenRoots = [], internalPort, cwd = workspace, env = {} }) {
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Native agent isolation is unavailable on this platform.');
  const executable = await resolveExecutable(command);
  if (process.platform === 'win32') return spawnWindowsAgent({ executable, args, workspace, home, runtimeExecutable, runtimePaths, forbiddenRoots, cwd, env });
  const roots = await Promise.all(runtimePaths.map((p) => fs.realpath(p)));
  for (const root of [...roots, path.dirname(runtimeExecutable || executable)]) {
    if (root === '/' || root === '/Users' || root === process.env.HOME || root === path.dirname(process.env.HOME || '/Users/unknown')) throw new Error('Choose a specific runtime folder, not a home folder or system root.');
  }
  const workRoot = await fs.realpath(workspace), homeRoot = await fs.realpath(home);
  const reads = [...SYSTEM_READS, workRoot, homeRoot, ...roots, path.dirname(runtimeExecutable || executable)];
  if (!reads.some((root) => executable === root || executable.startsWith(root + path.sep))) throw new Error('This command is outside the approved runtime folders. Add its specific runtime folder in Setup.');
  const profile = sandboxProfile({ workspace: workRoot, home: homeRoot, executable, runtimeExecutable, runtimePaths: roots, forbiddenRoots, internalPort });
  const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, executable, ...args], {
    cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH || '/usr/bin:/bin', HOME: home, TMPDIR: path.join(home, 'tmp'),
      XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'),
      XDG_CACHE_HOME: path.join(home, '.cache'), LANG: 'en_US.UTF-8', TERM: 'dumb',
      ...env
    }
  });
  return child;
}

export function killAgentProcess(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') { child.spectrumCancel?.(); return; }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already ended */ }
  const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already ended */ } }, 1500);
  timer.unref();
}
