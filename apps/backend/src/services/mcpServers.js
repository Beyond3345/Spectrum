// The user's own MCP servers, for the Spectrum agent: a program the user typed (stdio), added off and started only
// when the user checks it in Settings › Agents or a turn of the agent needs it while it is on. It runs inside the
// agents' isolation (its own home and an empty folder, never the project) and reaches only the hosts the user listed
// for it, through the gate (agentNetwork.js), or any public HTTPS host when the user chose that; a host it asked for
// and was refused is kept to show beside it. It is stopped after a few minutes unused. Its tools reach the model as server__tool, their answers marked as material
// (the tool loop's untrusted()); a tool the server does not mark read-only asks the user first (agentService.js). The
// list of tools is pinned when the user checks it: a server whose tools change gives none until it is checked again.
// Its environment variables (an API key) are kept where the API keys are (keyStore.js), given to its process alone and
// hidden from what it says; changing one switches it off until it is checked again. On a Mac it may also reach the
// ports on this computer the user named for it (a local service such as Zotero), never one of Spectrum's own.
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { APP_VERSION, DATA_DIR, PORT } from '../config/constants.js';
import { readJson, renameOver, writeJsonAtomic } from '../utils/fsUtils.js';
import { httpError } from './projectService.js';
import { killAgentProcess, spawnAgentProcess } from './agentSandbox.js';
import { cleanHost, cleanHosts, hostAllowed } from './agentNetwork.js';
import { heldValues, holdValues } from './keyStore.js';

const FILE = path.join(DATA_DIR, 'mcp-servers.json');
const NAME = /^[a-z0-9-]{1,24}$/;
const IDLE_MS = 5 * 60 * 1000;
const CALL_MS = 60 * 1000;

// ── Environment variables and local ports ──

const VARIABLE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
// what Spectrum sets for isolation and the gate, what the starting shell and the system's loader and allocator read
// (they run before the sandbox does), the proxy variables, and Spectrum's own
const RESERVED = /^(PATH|PATHEXT|HOME|TMPDIR|TEMP|TMP|LANG|TERM|USERPROFILE|APPDATA|LOCALAPPDATA|SYSTEMROOT|WINDIR|COMSPEC|NODE_OPTIONS|NODE_PATH|NODE_USE_ENV_PROXY|ENV|BASH_ENV|SHELLOPTS|BASHOPTS|IFS|PS4|CDPATH|XDG_\w*|DYLD_\w*|LD_\w*|MALLOC\w*|SPECTRUM_\w*|\w*_PROXY)$/i;
/** Why a variable's name is refused, or ''. */
export function variableRefused(name) {
  if (typeof name !== 'string' || !VARIABLE.test(name)) return `“${String(name).slice(0, 80)}” is not a variable name: letters, digits and underscores, not starting with a digit.`;
  return RESERVED.test(name) ? `${name} is set by Spectrum or changes how the server is isolated, so it cannot be given.` : '';
}
/** Why a port on this computer is refused, or '': Spectrum's backend, the ports the app takes at launch, the page the dev server passes /api on from, and the range the system hands out as programs ask (each gate, a tools server). */
export function portRefused(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return `“${String(port).slice(0, 20)}” is not a port: give a number from 1 to 65535.`;
  if (port >= 49152) return `Ports from 49152 up are handed out by the system as programs ask, Spectrum’s own among them, so a server may not reach ${port}.`;
  if (port === PORT || port === (Number(process.env.VITE_PORT) || 5173) || (port >= 38787 && port <= 38796)) return `Port ${port} is Spectrum’s own, so no server may reach it.`;
  return '';
}

/** The servers: [{ name, command, args, on, tools? (the pinned hash), hosts (the ones it may reach), anyHost?, env (variable names), envWhy?, ports }]. */
export async function listServers() {
  const data = await readJson(FILE).catch(() => null);
  return (Array.isArray(data?.servers) ? data.servers : []).filter((s) => NAME.test(s?.name) && typeof s.command === 'string' && Array.isArray(s.args)).map((s) => ({
    ...s,
    hosts: cleanHosts(s.hosts),
    env: (Array.isArray(s.env) ? s.env : []).filter((n) => !variableRefused(n)),
    // as it is read, so a port saved by hand, or Spectrum's own since, is never used
    ports: [...new Set(Array.isArray(s.ports) ? s.ports : [])].filter((p) => !portRefused(p)).slice(0, 20)
  }));
}
const save = (servers) => writeJsonAtomic(FILE, { servers });

/** The hosts as the user gave them, or the one that is no host name refused. */
function hostList(hosts) {
  if (!Array.isArray(hosts) || hosts.length > 100) throw httpError('The hosts are a list of up to 100 names.', 400);
  const bad = hosts.find((h) => !cleanHost(h));
  if (bad !== undefined) throw httpError(`“${String(bad).slice(0, 80)}” is not a host name. Give a name such as api.example.com, or *.example.com for every host below one.`, 400);
  return cleanHosts(hosts);
}
// name → the hosts it asked for and was refused, since Spectrum started
const refused = new Map();
/** The hosts a server was refused that its list still leaves out: what Settings offers to allow. */
export const refusedHosts = (server) => (server.anyHost ? [] : [...refused.get(server.name) || []].filter((host) => !hostAllowed(host, server.hosts)));

// Where the values go when the key store cannot hold them (a keychain that will not open; a system with none): a file
// in the data folder only this account can read, said beside the server with the store's reason
const FALLBACK = path.join(DATA_DIR, 'mcp-variables.json');
async function writeFallback(data) {
  const tmp = `${FALLBACK}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    await renameOver(tmp, FALLBACK);
  } finally { await fs.rm(tmp, { force: true }); }
}
/** A server's variables with their values, as its process is given them. */
async function variablesOf(server) {
  if (!server.env.length) return {};
  const values = server.envWhy ? (await readJson(FALLBACK).catch(() => null))?.[server.name] || {} : await heldValues(`mcp:${server.name}`);
  return Object.fromEntries(server.env.filter((n) => typeof values[n] === 'string').map((n) => [n, values[n]]));
}
/** Keeps a server's values: '' when the key store has them, or why it could not. */
async function keepVariables(name, values) {
  const file = (await readJson(FALLBACK).catch(() => null)) || {};
  try {
    await holdValues(`mcp:${name}`, values);
    if (file[name]) { delete file[name]; await writeFallback(file); }
    return '';
  } catch (err) {
    if (Object.keys(values).length) file[name] = values; else delete file[name];
    await writeFallback(file);
    return Object.keys(values).length ? err.message : '';
  }
}
// ponytail: a value under 6 characters is left in what a server says, as hiding it would blank ordinary words
const hide = (text, values) => values.filter((v) => v.length >= 6).reduce((t, v) => t.replaceAll(v, '[hidden]'), String(text));

/** Adds a server, off: name, the command line as the program and its arguments, and the hosts it may reach (none unless given). */
export async function addServer({ name, command, args = [], hosts = [], anyHost = false } = {}) {
  if (typeof name !== 'string' || !NAME.test(name)) throw httpError('A name is up to 24 lower-case letters, digits and hyphens.', 400);
  if (typeof command !== 'string' || !command.trim() || command.length > 1000) throw httpError('Give the command that starts the server.', 400);
  if (!Array.isArray(args) || args.length > 50 || !args.every((a) => typeof a === 'string' && a.length <= 1000)) throw httpError('The arguments are a list of up to 50 words.', 400);
  const servers = await listServers();
  if (servers.some((s) => s.name === name)) throw httpError(`There is a server named “${name}” already.`, 409);
  await save([...servers, { name, command: command.trim(), args, on: false, hosts: hostList(hosts), ...(anyHost === true && { anyHost: true }) }]);
}

export async function removeServer(name) {
  stop(name);
  refused.delete(name);
  await keepVariables(name, {}).catch(() => {});
  await save((await listServers()).filter((s) => s.name !== name));
}

/** Off stops it; on needs a checked list of tools. */
export async function setServerOn(name, on) {
  const servers = await listServers();
  const server = servers.find((s) => s.name === name);
  if (!server) throw httpError('No such server.', 404);
  if (on && !server.tools) throw httpError('Check the server first, to see its tools.', 400);
  if (!on) stop(name);
  await save(servers.map((s) => (s.name === name ? { ...s, on: on === true } : s)));
}

/**
 * Where a server may connect: its hosts, or any host, and the ports on this computer it may reach. A running one hears a
 * changed list at its next connection; any host, back to a list, or changed ports start it again.
 */
export async function setServerNetwork(name, { hosts, anyHost, ports } = {}) {
  const servers = await listServers();
  const server = servers.find((s) => s.name === name);
  if (!server) throw httpError('No such server.', 404);
  if (ports !== undefined) {
    if (process.platform === 'win32') throw httpError('On Windows, isolation refuses every address of this computer, so a server cannot reach a local service there.', 400);
    if (!Array.isArray(ports) || ports.length > 20) throw httpError('The ports are a list of up to 20 numbers.', 400);
    const bad = ports.map(portRefused).find(Boolean);
    if (bad) throw httpError(bad, 400);
  }
  const { anyHost: was, ...rest } = server;
  const any = anyHost === undefined ? !!was : anyHost === true;
  const local = ports === undefined ? server.ports : [...new Set(ports)];
  if (any !== !!was || String(local) !== String(server.ports)) stop(name);
  await save(servers.map((s) => (s === server ? { ...rest, hosts: hosts === undefined ? server.hosts : hostList(hosts), ports: local, ...(any && { anyHost: true }) } : s)));
}

/**
 * Sets or removes a server's environment variables: { NAME: value } sets one, { NAME: null } removes it. The values go
 * to the key store, the names to the list; the server is stopped and switched off until it is checked again.
 */
export async function setServerVariables(name, changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw httpError('The variables are names with values.', 400);
  const servers = await listServers();
  const server = servers.find((s) => s.name === name);
  if (!server) throw httpError('No such server.', 404);
  const values = await variablesOf(server);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) { delete values[key]; continue; }
    const why = variableRefused(key);
    if (why) throw httpError(why, 400);
    if (typeof value !== 'string' || !value || value.length > 32768 || value.includes('\0')) throw httpError(`Give ${key} a value of up to 32,768 characters.`, 400);
    values[key] = value;
  }
  if (Object.keys(values).length > 50) throw httpError('A server takes up to 50 variables.', 400);
  stop(name);
  const envWhy = await keepVariables(name, values);
  const { tools, envWhy: was, ...rest } = server;
  await save(servers.map((s) => (s === server ? { ...rest, on: false, env: Object.keys(values), ...(envWhy && { envWhy }) } : s)));
}

// ── Running them ──

/** The SDK's client over a child's stdin and stdout, one JSON-RPC message a line. */
function childTransport(child) {
  const buffer = new ReadBuffer();
  const transport = {
    async start() {
      child.stdout.on('data', (chunk) => {
        buffer.append(chunk);
        for (let message; (message = buffer.readMessage()); ) transport.onmessage?.(message);
      });
      child.once('exit', () => transport.onclose?.());
      child.stdin.on('error', (err) => transport.onerror?.(err));
    },
    send: (message) => new Promise((resolve) => child.stdin.write(serializeMessage(message), resolve)),
    async close() { killAgentProcess(child); }
  };
  return transport;
}

// name → { client, child, idle }
const running = new Map();
function stop(name) {
  const run = running.get(name);
  running.delete(name);
  if (!run) return;
  clearTimeout(run.idle);
  killAgentProcess(run.child);
}
export const stopServers = () => [...running.keys()].forEach(stop);

async function started(server) {
  let run = running.get(server.name);
  if (!run) {
    const dir = path.join(DATA_DIR, 'mcp', server.name);
    for (const sub of ['home/tmp', 'work']) await fs.mkdir(path.join(dir, sub), { recursive: true });
    // a script or folder the command line names is read where it is (the folder that holds it, read-only)
    const named = [];
    for (const arg of server.args) if (path.isAbsolute(arg) && (await fs.stat(arg).catch(() => null))) named.push(path.dirname(arg));
    const env = await variablesOf(server);
    // the hosts the gate refused this process: what a failure names first
    const asked = new Set();
    const child = await spawnAgentProcess({
      command: server.command, args: server.args, workspace: path.join(dir, 'work'), home: path.join(dir, 'home'), runtimePaths: [...new Set(named)],
      env, localPorts: server.ports,
      // its own list, as it is at each connection
      ...(!server.anyHost && {
        hosts: async () => (await listServers()).find((s) => s.name === server.name)?.hosts || [],
        // ponytail: the first 20 it asks for are kept to offer
        onRefused: (host) => { asked.add(host); const set = refused.get(server.name) || new Set(); if (set.size < 20) refused.set(server.name, set.add(host)); }
      })
    });
    const client = new Client({ name: 'spectrum', version: APP_VERSION });
    run = { client, child, server, secrets: Object.values(env), asked, stderr: '' };
    child.stderr.on('data', (chunk) => { run.stderr = (run.stderr + chunk).slice(-4000); });
    running.set(server.name, run);
    child.once('exit', () => running.get(server.name) === run && running.delete(server.name));
    try {
      await client.connect(childTransport(child), { timeout: 30000 });
    } catch (err) {
      throw await failure(run, err);
    }
  }
  clearTimeout(run.idle);
  run.idle = setTimeout(() => stop(server.name), IDLE_MS);
  run.idle.unref?.();
  return run;
}

/**
 * Why a server's process failed, stopping it: the hosts the gate refused it first, as a program that cannot download
 * what it runs (npx, uvx) says only its own long error, then that error. err.refused and err.details (the program's
 * own words) go to Settings, which offers Allow for each host and keeps the details under a disclosure.
 */
async function failure(run, err) {
  stop(run.server.name);
  // what it printed as it ended arrives after its exit: wait for its output to close, a second at most
  if (run.child.stderr.readable) await new Promise((resolve) => { run.child.once('close', resolve); setTimeout(resolve, 1000).unref(); });
  const { name, hosts } = run.server;
  const details = hide(run.stderr.trim() || err.message, run.secrets);
  const asked = [...run.asked].filter((host) => !hostAllowed(host, hosts));
  const them = asked.length > 1 ? 'them' : 'it';
  const message = asked.length
    ? `“${name}” stopped before it gave its tools. It asked for ${asked.join(', ')}, which Spectrum’s isolation refused as ${asked.length > 1 ? 'they are' : 'it is'} not on its list. Allow ${them} for this server in Settings › Agents › MCP servers and check it again.`
    : `“${name}” did not start as an MCP server: ${details.split('\n').at(-1).slice(0, 300)}`;
  return Object.assign(new Error(message), { refused: asked, details: details.slice(-4000) });
}

const hashOf = (tools) => crypto.createHash('sha256').update(JSON.stringify(tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })))).digest('hex');

/** Starts the server and lists its tools, pinning them: what Check in Settings shows the user. */
export async function checkServer(name) {
  const servers = await listServers();
  const server = servers.find((s) => s.name === name);
  if (!server) throw httpError('No such server.', 404);
  const run = await started(server);
  let tools;
  // a server that ends while it is asked is a failure too
  try { ({ tools } = await run.client.listTools()); } catch (err) { throw await failure(run, err); }
  const { secrets } = run;
  await save(servers.map((s) => (s.name === name ? { ...s, tools: hashOf(tools) } : s)));
  return tools.map((t) => ({ name: t.name, description: hide(String(t.description || '').slice(0, 300), secrets), readOnly: t.annotations?.readOnlyHint === true }));
}

/**
 * The tools of the servers that are on, as the tool loop's registry has them: { name: server__tool, description,
 * jsonSchema, readOnly, mcp: { server, tool }, run }. notes: why a server gave none (it failed, or its tools changed).
 */
export async function serverTools() {
  const tools = [];
  const notes = [];
  for (const server of (await listServers()).filter((s) => s.on)) {
    try {
      const { client, secrets } = await started(server);
      const listed = (await client.listTools()).tools;
      if (hashOf(listed) !== server.tools) {
        notes.push(`The MCP server “${server.name}” changed its tools since you checked it, so the agent was given none of them. Check it again in Settings › Agents.`);
        continue;
      }
      for (const t of listed) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(t.name)) continue;
        tools.push({
          name: `${server.name.replace(/-/g, '_')}__${t.name}`,
          description: `From the user’s MCP server “${server.name}”: ${hide(String(t.description || '').slice(0, 1000), secrets)}`,
          jsonSchema: t.inputSchema,
          readOnly: t.annotations?.readOnlyHint === true,
          mcp: { server: server.name, tool: t.name },
          run: async (ctx, input) => {
            const before = new Set(refused.get(server.name));
            // what the call was refused, said with its answer so the user hears why it came up short
            const told = () => {
              const hosts = [...refused.get(server.name) || []].filter((host) => !before.has(host));
              return hosts.length ? `\n[Spectrum’s isolation refused “${server.name}” the host${hosts.length > 1 ? 's' : ''} ${hosts.join(', ')}. The user can allow ${hosts.length > 1 ? 'them' : 'it'} for this server in Settings › Agents › MCP servers.]` : '';
            };
            let result;
            try { result = await (await started(server)).client.callTool({ name: t.name, arguments: input }, undefined, { timeout: CALL_MS, signal: ctx.signal }); }
            catch (err) { throw new Error(hide(err.message, secrets) + told()); }
            const text = hide((result.content || []).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n'), secrets);
            if (result.isError) throw new Error((text || 'The tool failed.') + told());
            return text + told();
          }
        });
      }
    } catch (err) {
      notes.push(err.message);
    }
  }
  return { tools, notes };
}
