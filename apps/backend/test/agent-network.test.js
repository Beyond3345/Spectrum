// The network gate for isolated processes: a host on the list is reached and one off it refused, with stand-in
// servers on this computer named through the gate itself. No network. The native half runs Spectrum's own Node, a
// fixture agent and a fixture MCP server inside the macOS profile.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const tmp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'spectrum-agent-network-')));
Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(tmp, 'data'), SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects') });
const { cleanHost, cleanHosts, helloName, hostAllowed, nameStandIn, openGate, thisComputer, SCHOLARLY_HOSTS } = await import('../src/services/agentNetwork.js');
const { sandboxProfile, spawnAgentProcess } = await import('../src/services/agentSandbox.js');
const { PROFILES, agentConfigs, agentEntry, allowAgentHost, agentHome, launchOptions, networkOf, profileFor, recordTest, saveAgentConfig } = await import('../src/services/agentProfiles.js');
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
after(async () => {
  const { shutdownAgents } = await import('../src/services/agentSessionService.js');
  await shutdownAgents();
  rmSync(tmp, { recursive: true, force: true });
});

const native = process.platform === 'darwin' && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';

test('a host is a name, as typed or pasted, and a list matches a name or everything below one', () => {
  assert.equal(cleanHost(' API.Example.com '), 'api.example.com');
  assert.equal(cleanHost('https://api.example.com:443/v1?x=1'), 'api.example.com');
  assert.equal(cleanHost('*.example.com'), '*.example.com');
  for (const bad of ['', 'localhost', '127.0.0.1', '192.168.1.20', '[::1]', '*', '*.com', 'a b.com', 'exa_mple.com', '-a.com', 'a..com']) assert.equal(cleanHost(bad), '', bad);
  assert.deepEqual(cleanHosts(['a.example.com', 'A.example.com', 'nope', 7, 'b.example.com']), ['a.example.com', 'b.example.com']);
  assert.deepEqual(cleanHosts('a.example.com'), []);
  assert.ok(hostAllowed('api.example.com', ['api.example.com']));
  assert.ok(hostAllowed('a.b.example.com', ['*.example.com']));
  assert.ok(!hostAllowed('example.com', ['*.example.com']));
  assert.ok(!hostAllowed('badexample.com', ['*.example.com', 'example.com']));
  assert.ok(!hostAllowed('api.example.com.evil.test', ['api.example.com']));
});

test('an address of this computer is never a way out', () => {
  for (const [address, family] of [['127.0.0.1', 4], ['127.8.9.1', 4], ['0.0.0.0', 4], ['::1', 6], ['::', 6], ['::ffff:127.0.0.1', 6]]) assert.ok(thisComputer({ address, family }), address);
  const own = Object.values(os.networkInterfaces()).flat().find((i) => !i.internal);
  if (own) assert.ok(thisComputer(own), own.address);
  assert.ok(!thisComputer({ address: '93.184.216.34', family: 4 }));
});

/** What a TLS client's first bytes are when it asks for servername. */
async function hello(servername) {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const got = new Promise((resolve) => server.once('connection', (socket) => socket.once('data', (bytes) => { resolve(bytes); socket.destroy(); })));
  const client = tls.connect({ port: server.address().port, host: '127.0.0.1', ...(servername && { servername }) });
  client.on('error', () => {});
  try { return await got; } finally { client.destroy(); server.close(); }
}

test('the host a TLS hello names is read, whole or in pieces, and other bytes are not one', async () => {
  const bytes = await hello('Allowed.Example.com');
  assert.equal(helloName(bytes), 'allowed.example.com');
  assert.equal(helloName(bytes.subarray(0, 3)), undefined);
  assert.equal(helloName(bytes.subarray(0, bytes.length - 1)), undefined);
  assert.equal(helloName(await hello('')), '');
  assert.equal(helloName(Buffer.from('GET / HTTP/1.1\r\nHost: allowed.example.com\r\n\r\n')), null);
  // a record that says it is longer than its hello, and one cut inside its extensions
  const lying = Buffer.from(bytes); lying.writeUIntBE(70000, 6, 3);
  assert.equal(helloName(lying), null);
  const cut = Buffer.concat([bytes.subarray(0, 60), Buffer.alloc(0)]); cut.writeUInt16BE(55, 3);
  assert.notEqual(helloName(cut), 'allowed.example.com');
});

/** A CONNECT through the gate: the status line, and the socket when it opened. */
function connect(port, target) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    socket.once('data', (bytes) => resolve({ status: Number(String(bytes).split(' ')[1]), socket }));
    socket.once('error', reject);
  });
}

test('the gate opens a tunnel to a listed host on port 443 only, and only for a hello that names it', async () => {
  const reached = [];
  const standIn = net.createServer((socket) => { socket.on('error', () => {}); socket.once('data', (bytes) => { reached.push(helloName(bytes)); socket.end(); }); });
  await new Promise((resolve) => standIn.listen(0, '127.0.0.1', resolve));
  nameStandIn('listed.test', standIn.address().port);
  nameStandIn('unlisted.test', standIn.address().port);
  let list = ['listed.test'];
  const refused = [];
  const gate = await openGate({ hosts: () => list, onRefused: (host) => refused.push(host) });
  try {
    const through = async (target, servername) => {
      const { status, socket } = await connect(gate.port, target);
      if (status !== 200) { socket.destroy(); return status; }
      const client = tls.connect({ socket, servername });
      await new Promise((resolve) => { client.on('error', resolve); client.on('close', resolve); });
      return status;
    };
    assert.equal(await through('listed.test:443', 'listed.test'), 200);
    assert.deepEqual(reached, ['listed.test']);
    // off the list, then allowed by the user: no restart, the list is read at each connection
    assert.equal(await through('unlisted.test:443', 'unlisted.test'), 403);
    assert.deepEqual(refused, ['unlisted.test']);
    list = ['listed.test', 'unlisted.test'];
    assert.equal(await through('unlisted.test:443', 'unlisted.test'), 200);
    assert.deepEqual(reached, ['listed.test', 'unlisted.test']);
    // another port, an address, this computer by name, and a hello for another site through a listed host's tunnel
    for (const target of ['listed.test:80', 'listed.test:8443', '127.0.0.1:443', 'localhost:443', '[::1]:443', 'listed.test']) assert.equal(await through(target, 'listed.test'), 403, target);
    assert.equal(await through('listed.test:443', 'unlisted.test'), 200);
    assert.deepEqual(reached, ['listed.test', 'unlisted.test'], 'nothing of a hello for another host went through');
    // and plain bytes, which are no hello
    const { socket } = await connect(gate.port, 'listed.test:443');
    socket.write('POST /upload HTTP/1.1\r\nHost: listed.test\r\n\r\nthe manuscript');
    await new Promise((resolve) => socket.on('close', resolve));
    assert.equal(reached.length, 2);
    // a plain request is no CONNECT
    const plain = await new Promise((resolve) => { const s = net.connect(gate.port, '127.0.0.1', () => s.write('GET http://listed.test/ HTTP/1.1\r\nHost: listed.test\r\n\r\n')); s.once('data', (bytes) => { resolve(String(bytes)); s.destroy(); }); });
    assert.match(plain, /^HTTP\/1\.1 403/);
  } finally { gate.close(); standIn.close(); nameStandIn('listed.test'); nameStandIn('unlisted.test'); }
});

test('a profile with a gate opens that port and nothing else of the network', () => {
  const base = { workspace: '/w', home: '/h', executable: '/usr/bin/true' };
  const open = sandboxProfile(base), gated = sandboxProfile({ ...base, gatePort: 50123 }), offline = sandboxProfile({ ...base, offline: true, gatePort: 50123 });
  assert.match(open, /remote tcp "\*:443"/);
  assert.match(open, /mDNSResponder/);
  assert.match(gated, /\(allow network-outbound \(remote tcp "localhost:50123"\)\)/);
  for (const rule of [/\*:443/, /\*:53/, /mDNSResponder/]) assert.doesNotMatch(gated, rule);
  assert.doesNotMatch(offline, /network-outbound/);
});

/** HTTPS stand-ins on this computer for names, with a certificate made here (left at cert for whoever must trust it): { port, close }. */
async function standIns(names, cert, answer = (req, res) => res.end(`stand-in for ${req.headers.host}`)) {
  const key = path.join(tmp, `key-${names[0]}.pem`);
  await fs.mkdir(path.dirname(cert), { recursive: true });
  execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-subj', `/CN=${names[0]}`, '-days', '2', '-addext', `subjectAltName=${names.map((n) => `DNS:${n}`).join(',')}`], { stdio: 'ignore' });
  const server = https.createServer({ key: await fs.readFile(key), cert: await fs.readFile(cert) }, answer);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  for (const name of names) nameStandIn(name, server.address().port);
  return { port: server.address().port, close: () => { for (const name of names) nameStandIn(name); server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); } };
}
const skip = !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.';

test('inside isolation, a program reaches a listed host through the gate and nothing else', { skip, timeout: 60000 }, async () => {
  const root = path.join(tmp, 'program');
  await fs.mkdir(path.join(root, 'home', 'tmp'), { recursive: true }); await fs.mkdir(path.join(root, 'work'));
  const cert = path.join(root, 'home', 'stand-in.pem');
  const standIn = await standIns(['listed.test', 'unlisted.test'], cert);
  const port = standIn.port;
  try {
    const script = `
      const net = require('node:net'), { spawnSync } = require('node:child_process');
      const get = (url) => fetch(url).then(async (r) => r.status + ' ' + await r.text(), (e) => 'failed');
      const socket = (...to) => new Promise((resolve) => { const s = net.connect(...to); s.on('connect', () => resolve('connected')); s.on('error', (e) => resolve(e.code)); setTimeout(() => resolve('no answer'), 3000).unref(); });
      (async () => console.log(JSON.stringify({
        listed: await get('https://listed.test/'),
        unlisted: await get('https://unlisted.test/'),
        plain: (await get('http://listed.test/')).startsWith('200'),
        curl: spawnSync('/usr/bin/curl', ['-sS', '--cacert', process.env.NODE_EXTRA_CA_CERTS, 'https://listed.test/']).stdout.toString(),
        curlUnlisted: spawnSync('/usr/bin/curl', ['-sS', '-o', '/dev/null', '-w', '%{http_connect}', 'https://unlisted.test/']).stdout.toString(),
        standIn: await socket(${port}, '127.0.0.1'),
        elsewhere: await socket(443, '192.0.2.1'),
        resolver: await socket('/private/var/run/mDNSResponder'),
        lookup: await new Promise((resolve) => require('node:dns').lookup('listed.test', (err) => resolve(err ? err.code : 'found')))
      })))();
    `;
    const refused = [];
    const child = await spawnAgentProcess({ command: process.execPath, args: ['-e', script], workspace: path.join(root, 'work'), home: path.join(root, 'home'), env: { NODE_EXTRA_CA_CERTS: cert }, hosts: () => ['listed.test'], onRefused: (host) => refused.push(host) });
    let output = '', errors = '';
    child.stdout.on('data', (c) => output += c); child.stderr.on('data', (c) => errors += c);
    assert.equal(await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }), 0, errors);
    assert.deepEqual(JSON.parse(output), {
      listed: '200 stand-in for listed.test', unlisted: 'failed', plain: false,
      curl: 'stand-in for listed.test', curlUnlisted: '403',
      standIn: 'EPERM', elsewhere: 'EPERM', resolver: 'EPERM', lookup: 'ENOTFOUND'
    });
    assert.deepEqual([...new Set(refused)], ['unlisted.test']);
  } finally { await standIn.close(); }
});

test('each agent has its provider’s hosts; only one whose documentation is sure starts held to them', () => {
  for (const p of PROFILES.filter((p) => !p.planned)) {
    assert.ok(p.hosts.length && p.hosts.every((h) => cleanHost(h) === h), `${p.id} names its provider’s hosts`);
  }
  assert.deepEqual(PROFILES.filter((p) => p.network === 'hosts').map((p) => p.id), ['claude']);
  const claude = networkOf(profileFor('claude'));
  assert.deepEqual({ mode: claude.mode, provider: claude.provider, tools: claude.tools, hosts: claude.hosts }, { mode: 'hosts', provider: ['api.anthropic.com'], tools: SCHOLARLY_HOSTS, hosts: [] });
  assert.equal(claude.enforced, process.platform === 'darwin');
  // the two the owner's tests left as they are: any host, with the list ready
  for (const id of ['deepseek', 'codex']) assert.equal(networkOf(profileFor(id)).mode, 'any', id);
  assert.deepEqual(networkOf(profileFor('deepseek')).provider, ['api.deepseek.com']);
  // a saved choice that is no choice, and hosts that are no hosts, fall back
  assert.deepEqual(networkOf(profileFor('codex'), { network: { mode: 'everything', hosts: ['x.example.com', 'localhost', 5] } }), { ...networkOf(profileFor('codex')), hosts: ['x.example.com'] });
});

test('an agent’s network setting: saved only where it differs, a list checked, a Test kept for an added host', async () => {
  const fixture = path.join(fixtures, 'acp-agent.mjs');
  await saveAgentConfig('qoder', { command: process.execPath, args: [fixture], runtimePaths: [fixtures] });
  const home = await agentHome('qoder');
  const launch = () => launchOptions('qoder', { workspace: path.join(home, 'tmp'), home });
  let options = await launch();
  assert.equal(options.network, 'any');
  assert.equal(options.hosts, undefined, 'on any host there is no list, and so no gate');
  assert.equal((await agentConfigs()).qoder.network, undefined, 'the profile’s own choice is not saved');
  await recordTest('qoder', { ok: true, code: 'ready', program: options.program }, { setup: options.setup });

  await assert.rejects(saveAgentConfig('qoder', { network: { mode: 'hosts', hosts: ['fine.example.com', 'not a host'] } }), /“not a host” is not a host name/);
  await assert.rejects(saveAgentConfig('qoder', { network: { mode: 'sometimes' } }), /Invalid network settings/);
  await saveAgentConfig('qoder', { network: { mode: 'hosts', hosts: ['https://Models.Example.com/v1'] } });
  assert.deepEqual((await agentConfigs()).qoder.network, { mode: 'hosts', hosts: ['models.example.com'] });
  assert.equal((await agentConfigs()).qoder.test, undefined, 'held to a list, it is to be tested again');
  options = await launch();
  if (process.platform === 'darwin') {
    assert.equal(options.network, 'hosts');
    assert.deepEqual(await options.hosts(), [...profileFor('qoder').hosts, ...SCHOLARLY_HOSTS, 'models.example.com']);
    await recordTest('qoder', { ok: true, code: 'ready', program: options.program }, { setup: options.setup });
    // a host allowed from a session: on the list at once, and the Test stands
    assert.equal(await allowAgentHost('qoder', 'Extra.Example.com:443'), 'extra.example.com');
    assert.ok((await options.hosts()).includes('extra.example.com'));
    assert.equal((await agentConfigs()).qoder.test?.code, 'ready');
    assert.equal((await launch()).setup, options.setup);
  } else assert.equal(options.network, 'any', 'only macOS can hold an agent to a list');
  await assert.rejects(allowAgentHost('qoder', '127.0.0.1'), /not a host name/);
  const entry = await agentEntry('qoder');
  assert.equal(entry.network.mode, 'hosts');
  assert.ok(entry.network.hosts.includes('models.example.com'));
  // other settings keep the list, and back on any host only the added hosts stay saved
  await saveAgentConfig('qoder', { runtimePaths: [fixtures] });
  assert.equal((await agentConfigs()).qoder.network.mode, 'hosts');
  await saveAgentConfig('qoder', { network: { mode: 'any' } });
  assert.equal((await agentConfigs()).qoder.network.mode, undefined);
  assert.ok((await agentConfigs()).qoder.network.hosts.includes('models.example.com'));
  assert.equal((await launch()).hosts, undefined);
});

test('Claude Agent held to its list leaves out its telemetry and update checks; on any host it starts as before', async () => {
  const fixture = path.join(fixtures, 'acp-agent.mjs');
  await saveAgentConfig('claude', { command: process.execPath, args: [fixture], runtimePaths: [fixtures] });
  const home = await agentHome('claude');
  const listed = await launchOptions('claude', { workspace: path.join(home, 'tmp'), home });
  assert.equal(listed.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, process.platform === 'darwin' ? '1' : undefined);
  await saveAgentConfig('claude', { network: { mode: 'any' } });
  const open = await launchOptions('claude', { workspace: path.join(home, 'tmp'), home });
  assert.equal(open.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, undefined);
  assert.equal(open.hosts, undefined);
});

test('a session’s agent held to its list: Spectrum’s tools reach the scholarly sites, a refused host is shown once and allowed in one step', { skip, timeout: 120000 }, async () => {
  const { createProject } = await import('../src/services/projectService.js');
  const { newAgentRun, getAgentRun, promptAgent, allowSessionHost } = await import('../src/services/agentSessionService.js');
  const fixture = path.join(fixtures, 'acp-tools-agent.mjs');
  const found = await fs.readFile(path.join(fixtures, 'scholarly', 'openalex-search-attention.json'));
  const asked = [];
  const cert = path.join(tmp, 'session-stand-in.pem');
  const standIn = await standIns(['api.openalex.org', 'unlisted.test'], cert, (req, res) => { asked.push(`${req.headers.host}${req.url.split('?')[0]}`); res.end(req.headers.host === 'api.openalex.org' ? found : 'stand-in'); });
  try {
    const project = await createProject({ name: 'Network fixture' });
    await fs.writeFile(path.join(project.path, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nText.\n\\end{document}\n');
    await saveAgentConfig('qoder', { command: process.execPath, args: [fixture], runtimePaths: [fixtures], network: { mode: 'hosts', hosts: [] } });
    const run = await getAgentRun((await newAgentRun({ projectId: project.id, agentId: 'qoder' })).id);
    await run.ready;
    await fs.copyFile(cert, path.join(run.home, 'stand-in.pem'));
    const log = async () => (await fs.readFile(path.join(run.home, 'acp-log.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    const network = () => run.events.filter((e) => e.type === 'network').map((e) => e.data);

    await promptAgent(run, 'SEARCH-THE-STAND-IN then REACH-HOST unlisted.test');
    await run.task;
    assert.equal(run.status, 'completed', JSON.stringify(run.events.filter((e) => ['state', 'notice'].includes(e.type))));
    // the tools server, started by the agent with the environment Spectrum named, went through the gate
    const { tools } = (await log()).find((q) => q.tools);
    assert.match(tools.results?.literature_search?.content[0].text || JSON.stringify(tools), /Attention Is All You Need/);
    assert.deepEqual(asked, ['api.openalex.org/works']);
    // the host off the list: refused, and said once however often it is asked for
    assert.notEqual((await log()).find((q) => q.reach).result, 200);
    assert.deepEqual(network(), [{ host: 'unlisted.test' }]);
    await promptAgent(run, 'REACH-HOST unlisted.test');
    await run.task;
    assert.deepEqual(network(), [{ host: 'unlisted.test' }]);

    // allowed for the agent: reached on the next try by the same running agent, which is told
    assert.equal(await allowSessionHost(run, 'unlisted.test'), 'unlisted.test');
    assert.deepEqual(network().at(-1), { host: 'unlisted.test', allowed: true });
    assert.deepEqual((await agentConfigs()).qoder.network.hosts, ['unlisted.test']);
    await promptAgent(run, 'REACH-HOST unlisted.test');
    await run.task;
    const entries = await log();
    assert.equal(entries.filter((q) => q.reach).at(-1).result, 200);
    assert.equal(entries.filter((q) => q.method === 'initialize').length, 1, 'the agent was not started again');
    assert.match(JSON.stringify(entries.filter((q) => q.method === 'session/prompt').at(-1).params.prompt), /The user now allows you to reach unlisted\.test/);
    assert.equal(asked.at(-1), 'unlisted.test/');
  } finally { await standIn.close(); }
});
