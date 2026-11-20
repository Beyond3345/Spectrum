// The user's own MCP servers, for the Spectrum agent: a program the user typed (stdio), added off and started only
// when the user checks it in Settings › Agents or a turn of the agent needs it while it is on. It runs inside the
// agents' isolation (its own home and an empty folder, never the project; HTTPS out as a local agent has), and is
// stopped after a few minutes unused. Its tools reach the model as server__tool, their answers marked as material
// (the tool loop's untrusted()); a tool the server does not mark read-only asks the user first (agentService.js). The
// list of tools is pinned when the user checks it: a server whose tools change gives none until it is checked again.
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { APP_VERSION, DATA_DIR } from '../config/constants.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { httpError } from './projectService.js';
import { killAgentProcess, spawnAgentProcess } from './agentSandbox.js';

const FILE = path.join(DATA_DIR, 'mcp-servers.json');
const NAME = /^[a-z0-9-]{1,24}$/;
const IDLE_MS = 5 * 60 * 1000;
const CALL_MS = 60 * 1000;

/** The servers: [{ name, command, args, on, tools? (the pinned hash) }]. */
export async function listServers() {
  const data = await readJson(FILE).catch(() => null);
  return (Array.isArray(data?.servers) ? data.servers : []).filter((s) => NAME.test(s?.name) && typeof s.command === 'string' && Array.isArray(s.args));
}
const save = (servers) => writeJsonAtomic(FILE, { servers });

/** Adds a server, off: name, and the command line as the program and its arguments. */
export async function addServer({ name, command, args = [] } = {}) {
  if (typeof name !== 'string' || !NAME.test(name)) throw httpError('A name is up to 24 lower-case letters, digits and hyphens.', 400);
  if (typeof command !== 'string' || !command.trim() || command.length > 1000) throw httpError('Give the command that starts the server.', 400);
  if (!Array.isArray(args) || args.length > 50 || !args.every((a) => typeof a === 'string' && a.length <= 1000)) throw httpError('The arguments are a list of up to 50 words.', 400);
  const servers = await listServers();
  if (servers.some((s) => s.name === name)) throw httpError(`There is a server named “${name}” already.`, 409);
  await save([...servers, { name, command: command.trim(), args, on: false }]);
}

export async function removeServer(name) {
  stop(name);
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
    const child = await spawnAgentProcess({ command: server.command, args: server.args, workspace: path.join(dir, 'work'), home: path.join(dir, 'home'), runtimePaths: [...new Set(named)] });
    let error = '';
    child.stderr.on('data', (chunk) => { error = (error + chunk).slice(-2000); });
    const client = new Client({ name: 'spectrum', version: APP_VERSION });
    run = { client, child };
    running.set(server.name, run);
    child.once('exit', () => running.get(server.name) === run && running.delete(server.name));
    try {
      await client.connect(childTransport(child), { timeout: 30000 });
    } catch (err) {
      stop(server.name);
      throw new Error(`“${server.name}” did not start as an MCP server: ${(error.trim().split('\n').at(-1) || err.message).slice(0, 300)}`);
    }
  }
  clearTimeout(run.idle);
  run.idle = setTimeout(() => stop(server.name), IDLE_MS);
  run.idle.unref?.();
  return run.client;
}

const hashOf = (tools) => crypto.createHash('sha256').update(JSON.stringify(tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })))).digest('hex');

/** Starts the server and lists its tools, pinning them: what Check in Settings shows the user. */
export async function checkServer(name) {
  const servers = await listServers();
  const server = servers.find((s) => s.name === name);
  if (!server) throw httpError('No such server.', 404);
  const { tools } = await (await started(server)).listTools();
  await save(servers.map((s) => (s.name === name ? { ...s, tools: hashOf(tools) } : s)));
  return tools.map((t) => ({ name: t.name, description: String(t.description || '').slice(0, 300), readOnly: t.annotations?.readOnlyHint === true }));
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
      const client = await started(server);
      const listed = (await client.listTools()).tools;
      if (hashOf(listed) !== server.tools) {
        notes.push(`The MCP server “${server.name}” changed its tools since you checked it, so the agent was given none of them. Check it again in Settings › Agents.`);
        continue;
      }
      for (const t of listed) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(t.name)) continue;
        tools.push({
          name: `${server.name.replace(/-/g, '_')}__${t.name}`,
          description: `From the user’s MCP server “${server.name}”: ${String(t.description || '').slice(0, 1000)}`,
          jsonSchema: t.inputSchema,
          readOnly: t.annotations?.readOnlyHint === true,
          mcp: { server: server.name, tool: t.name },
          run: async (ctx, input) => {
            const result = await (await started(server)).callTool({ name: t.name, arguments: input }, undefined, { timeout: CALL_MS, signal: ctx.signal });
            const text = (result.content || []).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n');
            if (result.isError) throw new Error(text || 'The tool failed.');
            return text;
          }
        });
      }
    } catch (err) {
      notes.push(err.message);
    }
  }
  return { tools, notes };
}
