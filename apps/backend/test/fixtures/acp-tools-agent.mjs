// An ACP agent that, asked to, starts the MCP servers its session was given, as a real agent would inside its own
// isolation, calls Spectrum's tools and logs what they answered to $HOME/acp-log.jsonl. Asked to "reach" a host, it
// asks that host for a page over HTTPS and logs what came of it.
import readline from 'node:readline';
import https from 'node:https';
import { appendFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
const lines = readline.createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const log = (entry) => appendFileSync(path.join(process.env.HOME, 'acp-log.jsonl'), `${JSON.stringify(entry)}\n`);
let servers = [];
// a test's stand-in servers answer with a certificate the test left in the home
const standInCa = path.join(process.env.HOME, 'stand-in.pem');
const reach = (host) => new Promise((resolve) => https.get(`https://${host}/`, { rejectUnauthorized: false }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', (err) => resolve(err.code || err.message)));

async function callTools(server, calls) {
  const child = spawn(server.command, server.args, { env: { ...Object.fromEntries(server.env.map((e) => [e.name, e.value])), ...(existsSync(standInCa) && { NODE_EXTRA_CA_CERTS: standInCa }) }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  const waiting = new Map();
  readline.createInterface({ input: child.stdout }).on('line', (l) => { const m = JSON.parse(l); waiting.get(m.id)?.(m); });
  let id = 0;
  const request = (method, params) => new Promise((resolve) => {
    const n = ++id;
    waiting.set(n, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`);
    setTimeout(() => resolve({ error: { message: `timed out: ${stderr}` } }), 60000).unref();
  });
  const results = {};
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } });
  if (init.error) return { error: init.error.message, stderr };
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  for (const [name, args] of calls) results[name] = (await request('tools/call', { name, arguments: args })).result;
  child.kill();
  return { results, stderr };
}

lines.on('line', async (line) => {
  const m = JSON.parse(line);
  if (m.method) log({ method: m.method, params: m.params });
  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true }, agentInfo: { name: 'Tools fixture', version: '1' }, authMethods: [] } });
  else if (m.method === 'session/new' || m.method === 'session/load') { servers = m.params.mcpServers; send({ id: m.id, result: { sessionId: 'tools-session' } }); }
  else if (m.method === 'session/prompt') {
    if (servers.length) {
      const calls = [['project_map', {}], ['list_todos', {}], ['suggest_todo', { text: 'Cite the method', link: { file: 'main.tex', line: 3 } }], ['load_skill', { id: 'spectrum-latex' }]];
      const asked = m.params.prompt.map((p) => p.text || '').join('\n');
      if (asked.includes('compile')) calls.push(['compile', {}]);
      // words no instruction of Spectrum's holds, so no other test ever searches or reaches
      if (asked.includes('SEARCH-THE-STAND-IN')) calls.push(['literature_search', { query: 'attention is all you need' }]);
      const host = asked.match(/REACH-HOST (\S+)/)?.[1];
      if (host) log({ reach: host, result: await reach(host) });
      log({ tools: await callTools(servers[0], calls) });
    }
    send({ id: m.id, result: { stopReason: 'end_turn' } });
  } else if (m.id !== undefined && m.method) send({ id: m.id, error: { code: -32601, message: 'Unsupported fixture method' } });
});
