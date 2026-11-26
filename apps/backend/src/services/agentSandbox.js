import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { spawnWindowsAgent, windowsWorker } from './agentSandboxWindows.js';
import { AGENT_SECRET_EXTENSIONS, secretNamePattern } from '../utils/pathUtils.js';
import { openGate, proxyEnv } from './agentNetwork.js';
import { PORT } from '../config/constants.js';

export async function isolationAvailable() {
  if (process.platform === 'darwin') return true;
  if (process.platform === 'win32') return windowsWorker().then(() => true, () => false);
  return false;
}

export const SYSTEM_READS = ['/System', '/usr', '/bin', '/sbin', '/Library', '/opt/homebrew', '/usr/local', '/private/etc', '/private/var/db'];
let developer;
/**
 * The active developer folder's app (xcode-select -p), which /usr/bin/git and the other shims run from, or none when
 * it is under /Library already. Never the rest of /Applications.
 */
export function developerReads() {
  if (developer === undefined) {
    let dir = '';
    try { dir = process.platform === 'darwin' ? execFileSync('/usr/bin/xcode-select', ['-p'], { encoding: 'utf8' }).trim() : ''; } catch { /* no developer tools */ }
    developer = dir.startsWith('/Applications/') ? [dir.match(/^\/Applications\/[^/]+\.app(?=\/|$)/)?.[0] || dir] : [];
  }
  return developer;
}
const q = (value) => JSON.stringify(value);
// the names no agent may read or write, in a profile's pattern: Spectrum's, git's and Claude's folders and the secret
// files of pathUtils' list, each letter in either case
const HIDDEN = `\\.spectrum|\\.git|\\.claude|${secretNamePattern(AGENT_SECRET_EXTENSIONS)}`.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);

/**
 * offline: no network at all (a chart's script), where an agent has HTTPS. gatePort: the one way out is that port on
 * this computer, where Spectrum's gate checks each host against a list (agentNetwork.js): no other address, and no
 * name lookup, which would carry text out in the names asked for. localPorts: ports on this computer it may also reach
 * (an MCP server's local service), checked by the caller against Spectrum's own. loopback: the program serves itself
 * from a port on this computer that it picks (bind to port 0), which no rule can name, so it may bind, take connections
 * on and reach every port here but Spectrum's fixed ones: a profile cannot limit a connection to the port the process
 * itself bound. Only with the user's switch (agentProfiles' network.loopback).
 */
export function sandboxProfile({ workspace, home, executable, runtimeExecutable = executable, runtimePaths = [], forbiddenRoots = [], internalPort, offline = false, gatePort, localPorts = [], loopback = false }) {
  const reads = [...new Set([...SYSTEM_READS, ...developerReads(), path.dirname(runtimeExecutable), ...runtimePaths])];
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
(deny file-read* file-write* (regex ${q(`${workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(.*/)?(${HIDDEN})(/.*)?$`)}))
(allow mach-lookup
  (global-name "com.apple.system.opendirectoryd.libinfo")
  (global-name "com.apple.system.opendirectoryd.membership")
  (global-name "com.apple.bsd.dirhelper")
  (global-name "com.apple.system.logger")
${offline ? '' : `  (global-name "com.apple.networkd")
  (global-name "com.apple.trustd.agent")
  (global-name "com.apple.TrustEvaluationAgent")
  (global-name "com.apple.SystemConfiguration.DNSConfiguration")
  (global-name "com.apple.SystemConfiguration.configd")`})
${offline ? '' : `(allow system-socket (require-all (socket-domain AF_SYSTEM) (socket-protocol 2)))
${gatePort ? `; the gate is the only way out
(allow network-outbound (remote tcp "localhost:${Number(gatePort)}"))` : `; HTTPS is available; local HTTP APIs and Unix sockets are not.
(allow network-outbound (require-all (remote tcp "*:443")
  (require-not (remote ip "localhost:*"))))
(allow network-outbound (remote udp "*:53"))
; names go through the system's resolver, which is how most programs look one up
(allow network-outbound (literal "/private/var/run/mDNSResponder"))`}
; the kernel's sockets that say which route and source address a connection takes, as every sandboxed network client has
(allow network-outbound (control-name "com.apple.netsrc") (control-name "com.apple.network.statistics"))
${localPorts.filter((p) => Number.isInteger(p) && p > 0 && p < 65536).map((p) => `(allow network-outbound (remote tcp "localhost:${p}"))`).join('\n')}
${loopback ? `; its own server, on a port of its choosing: any port on this computer, then (the last rule that matches wins) never Spectrum's own
(allow network-bind network-inbound (local tcp "localhost:*"))
(allow network-outbound (remote tcp "localhost:*"))
${spectrumPorts().map((p) => `(deny network-outbound (remote tcp "localhost:${p}"))`).join('\n')}` : ''}`}
${Number.isInteger(internalPort) && internalPort > 0 && internalPort < 65536 ? `(allow network-bind network-inbound (local tcp "localhost:${internalPort}"))\n(allow network-outbound (remote tcp "localhost:${internalPort}"))` : ''}
`;
}

// ponytail: the fixed ones only (the backend's, the dev page's, the ones the app takes at launch); a gate or tools server
// of another agent takes a port the system picks, which the profile of a program with its own server leaves open
const spectrumPorts = () => [...new Set([PORT, Number(process.env.VITE_PORT) || 5173, ...Array.from({ length: 10 }, (_, i) => 38787 + i)])];

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

/**
 * hosts: a function giving the hosts the process may reach now, for one held to a list (none: any public HTTPS host,
 * as before); onRefused(host): it asked for one off the list. localPorts: see sandboxProfile. macOS only: the Windows
 * worker opens every public address or none and never this computer's, so there neither is enforced or reachable.
 */
export async function spawnAgentProcess({ command, args = [], workspace, home, runtimeExecutable, runtimePaths = [], forbiddenRoots = [], internalPort, cwd = workspace, env = {}, offline = false, hosts, onRefused, localPorts, loopback }) {
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Native agent isolation is unavailable on this platform.');
  const executable = await resolveExecutable(command);
  if (process.platform === 'win32') return spawnWindowsAgent({ executable, args, workspace, home, runtimeExecutable, runtimePaths, forbiddenRoots, cwd, env, offline });
  const roots = await Promise.all(runtimePaths.map((p) => fs.realpath(p)));
  for (const root of [...roots, path.dirname(runtimeExecutable || executable)]) {
    if (root === '/' || root === '/Users' || root === process.env.HOME || root === path.dirname(process.env.HOME || '/Users/unknown')) throw new Error('Choose a specific runtime folder, not a home folder or system root.');
  }
  const workRoot = await fs.realpath(workspace), homeRoot = await fs.realpath(home);
  const reads = [...SYSTEM_READS, ...developerReads(), workRoot, homeRoot, ...roots, path.dirname(runtimeExecutable || executable)];
  if (!reads.some((root) => executable === root || executable.startsWith(root + path.sep))) throw new Error('This command is outside the approved runtime folders. Add its specific runtime folder in Setup.');
  const gate = hosts && !offline ? await openGate({ hosts, onRefused }) : null;
  const profile = sandboxProfile({ workspace: workRoot, home: homeRoot, executable, runtimeExecutable, runtimePaths: roots, forbiddenRoots, internalPort, offline, gatePort: gate?.port, localPorts, loopback });
  const child = spawn('/bin/sh', ['-c', WATCHDOG, 'sh', profile, executable, ...args], {
    cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH || '/usr/bin:/bin', HOME: home, TMPDIR: path.join(home, 'tmp'),
      XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'),
      XDG_CACHE_HOME: path.join(home, '.cache'), LANG: 'en_US.UTF-8', TERM: 'dumb',
      // only a courtesy: a program that ignores or changes them reaches nothing, as the profile opens the gate alone
      ...(gate && proxyEnv(gate.port)),
      ...env
    }
  });
  // once it has exited, what it left in its group goes too
  child.once('exit', () => child.stdio[3]?.destroy());
  if (gate) {
    // for a program it starts with an environment of its own choosing (Spectrum's tools server)
    child.gateEnv = proxyEnv(gate.port);
    child.gateAsked = gate.asked;
    child.once('close', gate.close);
    child.once('error', gate.close);
  }
  return child;
}

/**
 * The process starts as a shell that leaves a watchdog in the new process group and becomes sandbox-exec (the same
 * pid). The watchdog, outside isolation, waits on a pipe whose other end only the backend holds, and kills the group
 * when it closes: when the backend is killed (a crash, Force Quit), or once the process has exited. Its own output
 * goes nowhere, so it never holds the process's pipes open. Windows: the isolation worker watches the backend itself.
 */
const WATCHDOG = '(read x <&3; kill -KILL 0) </dev/null >/dev/null 2>&1 & exec 3<&-; p=$1; shift; exec /usr/bin/sandbox-exec -p "$p" "$@"';

export function killAgentProcess(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') { child.spectrumCancel?.(); return; }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already ended */ }
  const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already ended */ } }, 1500);
  timer.unref();
}
