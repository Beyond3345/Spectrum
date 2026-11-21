// An MCP server's environment variables (an API key) and the ports on this computer it may reach (a local service
// such as Zotero). Against a stand-in for /usr/bin/security (never this Mac's keychain), a fixture server in plain Node
// and stand-in services listening on this computer. No network, no real service. macOS: the isolation is sandbox-exec.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import net from 'node:net';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mac = process.platform === 'darwin';
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-mcp-local-')));
const data = path.join(tmp, 'data');
const keychain = path.join(tmp, 'keychain.json');

/** A service on 127.0.0.1 at a port below the range the system hands out (which no server may reach): { port, close }. */
async function service() {
  for (;;) {
    const server = net.createServer((socket) => socket.end('hello\n'));
    const port = 20000 + Math.floor(Math.random() * 20000);
    const ok = await new Promise((resolve) => { server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => resolve(true)); });
    if (ok) return { port, close: () => new Promise((resolve) => server.close(resolve)) };
  }
}
// Spectrum's own port is a stand-in too, so a connection to it would be answered if isolation let it through
const own = await service();
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: data,
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_SECURITY: fileURLToPath(new URL('./fixtures/fake-security.mjs', import.meta.url)),
  SPECTRUM_FAKE_KEYCHAIN: keychain,
  PORT: String(own.port)
});
const servers = await import('../src/services/mcpServers.js');
const { forgetCache, registerKeyRoutes } = await import('../src/services/keyStore.js');
const { registerMcpServerRoutes } = await import('../src/routes/mcpServers.js');
const { sandboxProfile } = await import('../src/services/agentSandbox.js');
const { openGate } = await import('../src/services/agentNetwork.js');
const { default: Fastify } = await import('fastify');

after(async () => {
  servers.stopServers();
  await own.close();
  rmSync(tmp, { recursive: true, force: true });
});

// tools: has (whether MCP_TEST_KEY reached it), say (says it), reach (a port on 127.0.0.1); with LOUD set it prints
// the key and exits before answering
const SERVER = `import net from 'node:net';
import readline from 'node:readline';
if (process.env.LOUD) { console.error('refused key ' + process.env.MCP_TEST_KEY); process.exit(1); }
const tool = (name) => ({ name, description: name, inputSchema: { type: 'object', properties: { port: { type: 'number' } } }, annotations: { readOnlyHint: true } });
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  const reply = (text) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: typeof text === 'string' ? { content: [{ type: 'text', text }] } : text }) + '\\n');
  if (m.method === 'initialize') return reply({ protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'local', version: '1' } });
  if (m.method === 'tools/list') return reply({ tools: [tool('has'), tool('say'), tool('reach')] });
  const name = m.params?.name;
  if (name === 'has') return reply(process.env.MCP_TEST_KEY ? 'yes ' + process.env.MCP_TEST_KEY.length : 'no');
  if (name === 'say') return reply('my key is ' + process.env.MCP_TEST_KEY);
  reply(await new Promise((resolve) => {
    const s = net.connect(m.params.arguments.port, '127.0.0.1');
    s.on('data', () => { resolve('connected'); s.destroy(); });
    s.on('error', (e) => resolve(e.code));
    setTimeout(() => resolve('no answer'), 3000).unref();
  }));
});
`;
const file = path.join(tmp, 'fixture', 'server.mjs');
await fs.mkdir(path.dirname(file), { recursive: true });
await fs.writeFile(file, SERVER);

const KEY = 'zot-CANARY-6f1d9a2b7c3e';
const of = async (name) => (await servers.listServers()).find((s) => s.name === name);
const call = async (name, tool, input = {}) => (await servers.serverTools()).tools.find((t) => t.name === `${name}__${tool}`).run({}, input);

/** Every file under a folder, as text. */
async function filesUnder(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(full)));
    else out.push([full, await fs.readFile(full, 'latin1').catch(() => '')]);
  }
  return out;
}

test('a variable’s name is checked: none that Spectrum sets, or that changes how a server is isolated', async () => {
  for (const bad of ['PATH', 'Path', 'HOME', 'TMPDIR', 'LANG', 'NODE_OPTIONS', 'NODE_USE_ENV_PROXY', 'DYLD_INSERT_LIBRARIES', 'LD_PRELOAD', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'NO_PROXY', 'XDG_CONFIG_HOME', 'SHELLOPTS', 'PS4', 'BASH_ENV', 'ENV', 'IFS', 'MallocLogFile', 'SPECTRUM_DATA_DIR', 'USERPROFILE', 'SystemRoot', 'COMSPEC', '1KEY', 'A-B', 'A B', '', 'BASH_FUNC_x%%']) {
    assert.ok(servers.variableRefused(bad), bad);
  }
  for (const good of ['ZOTERO_API_KEY', 'MCP_TEST_KEY', 'api_key', '_TOKEN', 'NODE_EXTRA_CA_CERTS']) assert.equal(servers.variableRefused(good), '', good);
  await servers.addServer({ name: 'named', command: process.execPath, args: [file] });
  await assert.rejects(servers.setServerVariables('named', { PATH: '/tmp' }), /PATH is set by Spectrum/);
  await assert.rejects(servers.setServerVariables('named', { DYLD_INSERT_LIBRARIES: '/tmp/x.dylib' }), /isolated/);
  await assert.rejects(servers.setServerVariables('named', { 'NOT OK': 'x' }), /not a variable name/);
  await assert.rejects(servers.setServerVariables('named', { GOOD_NAME: '' }), /a value of up to/);
  await assert.rejects(servers.setServerVariables('named', ['x']), /names with values/);
  await assert.rejects(servers.setServerVariables('nobody', {}), /No such server/);
  // a name written into the file by hand is never used
  const saved = JSON.parse(await fs.readFile(path.join(data, 'mcp-servers.json'), 'utf8'));
  saved.servers[0].env = ['PATH', 'NODE_OPTIONS', 'FINE_NAME'];
  await fs.writeFile(path.join(data, 'mcp-servers.json'), JSON.stringify(saved));
  assert.deepEqual((await of('named')).env, ['FINE_NAME']);
  await servers.removeServer('named');
});

test('a variable reaches its server and no other process, is never sent back nor logged, and is kept in the keychain', { skip: !mac && 'macOS isolation', timeout: 60000 }, async () => {
  // the routes as the app has them, with the app's logger, its lines kept
  const lines = [];
  const app = Fastify({ logger: { level: 'info', stream: new Writable({ write(chunk, _, done) { lines.push(String(chunk)); done(); } }) } });
  registerKeyRoutes(app);
  registerMcpServerRoutes(app);
  const put = (name, body) => app.inject({ method: 'PUT', url: `/api/mcp-servers/${name}`, payload: body });
  try {
    for (const name of ['zotero', 'other']) assert.equal((await app.inject({ method: 'POST', url: '/api/mcp-servers', payload: { name, command: process.execPath, args: [file] } })).statusCode, 200);
    for (const name of ['zotero', 'other']) await servers.checkServer(name);
    await servers.setServerOn('zotero', true);
    assert.equal((await put('zotero', { env: { MCP_TEST_KEY: KEY } })).statusCode, 200);
    const refused = await put('zotero', { env: { HOME: '/tmp' } });
    assert.equal(refused.statusCode, 400);
    assert.match(refused.json().message || refused.body, /HOME is set by Spectrum/);

    // changed: off, and on only once checked again, as a changed tool list is
    const listed = (await app.inject({ url: '/api/mcp-servers' })).json().servers.find((s) => s.name === 'zotero');
    assert.deepEqual([listed.env, listed.envWhy, listed.on, listed.checked], [['MCP_TEST_KEY'], '', false, false]);
    await assert.rejects(servers.setServerOn('zotero', true), /Check the server first/);
    await servers.checkServer('zotero');
    await servers.setServerOn('zotero', true);
    await servers.setServerOn('other', true);

    // its process has it; another server's does not, nor Spectrum's own (which compiles and agents start from)
    assert.equal(await call('zotero', 'has'), `yes ${KEY.length}`);
    assert.equal(await call('other', 'has'), 'no');
    assert.ok(!Object.values(process.env).includes(KEY), 'in the backend’s environment');
    // what the server says hides it, as what reaches the model and the transcript
    assert.equal(await call('zotero', 'say'), 'my key is [hidden]');

    // a server that prints it as it fails: the error, and the log, hide it
    await put('other', { env: { MCP_TEST_KEY: KEY, LOUD: '1' } });
    const failed = await app.inject({ method: 'POST', url: '/api/mcp-servers/other/check' });
    assert.equal(failed.statusCode, 500);
    assert.match(failed.body, /did not start as an MCP server: refused key \[hidden\]/);

    // a value to replace, one to remove
    await put('other', { env: { LOUD: null, SECOND_KEY: 'second-CANARY-value' } });
    assert.deepEqual((await of('other')).env, ['MCP_TEST_KEY', 'SECOND_KEY']);

    const everything = [...lines, (await app.inject({ url: '/api/mcp-servers' })).body].join('\n');
    assert.ok(!everything.includes(KEY), 'in a log line or the list');
    assert.ok(everything.includes('did not start'), 'the failure was logged');
    for (const [name, text] of await filesUnder(data)) assert.ok(!text.includes(KEY) && !text.includes('second-CANARY'), `in ${name}`);
    const argv = await fs.readFile(`${keychain}.argv`, 'utf8');
    assert.ok(!argv.includes(KEY) && !argv.includes(Buffer.from(KEY).toString('hex')), 'on a command line');
    // in the keychain, beside the API keys, after a restart too
    forgetCache();
    servers.stopServers();
    assert.equal(await call('zotero', 'has'), `yes ${KEY.length}`);

    // removed with its server
    await servers.removeServer('zotero');
    await servers.removeServer('other');
    assert.ok(!(await fs.readFile(keychain, 'utf8')).includes(Buffer.from(KEY).toString('base64').slice(0, 12)));
  } finally { await app.close(); }
});

test('a keychain that will not open: the value is kept in a file only this account reads, and says why', { skip: !mac && 'macOS isolation', timeout: 60000 }, async () => {
  await servers.addServer({ name: 'locked', command: process.execPath, args: [file] });
  await fs.writeFile(`${keychain}.locked`, '');
  try {
    await servers.setServerVariables('locked', { MCP_TEST_KEY: KEY });
  } finally { await fs.rm(`${keychain}.locked`); }
  const server = await of('locked');
  assert.match(server.envWhy, /keychain/);
  const fallback = path.join(data, 'mcp-variables.json');
  assert.equal((await fs.stat(fallback)).mode & 0o777, 0o600);
  await servers.checkServer('locked');
  await servers.setServerOn('locked', true);
  assert.equal(await call('locked', 'has'), `yes ${KEY.length}`);
  // the keychain open again: the next change moves them there
  await servers.setServerVariables('locked', { OTHER_KEY: 'another-value' });
  assert.equal((await of('locked')).envWhy, undefined);
  assert.ok(!(await fs.readFile(fallback, 'utf8')).includes(KEY));
  await servers.checkServer('locked');
  await servers.setServerOn('locked', true);
  assert.equal(await call('locked', 'has'), `yes ${KEY.length}`);
  await servers.removeServer('locked');
});

test('a local port is a number the user gives, never one of Spectrum’s own', async () => {
  for (const bad of [0, 65536, 23119.5, '23119', null, own.port, 38787, 38796, 49152, 50000, 65535, Number(process.env.VITE_PORT) || 5173]) assert.ok(servers.portRefused(bad), String(bad));
  for (const good of [23119, 11434, 1234, 38786, 38797, 49151]) assert.equal(servers.portRefused(good), '', String(good));
  // every gate listens where the system hands ports out
  const gate = await openGate({ hosts: () => [] });
  assert.ok(servers.portRefused(gate.port), `the gate’s port ${gate.port}`);
  gate.close();
  await servers.addServer({ name: 'ports', command: process.execPath, args: [file] });
  await assert.rejects(servers.setServerNetwork('ports', { ports: [own.port] }), /Spectrum’s own/);
  await assert.rejects(servers.setServerNetwork('ports', { ports: [50000] }), /handed out by the system/);
  await assert.rejects(servers.setServerNetwork('ports', { ports: 23119 }), /list of up to 20/);
  await servers.setServerNetwork('ports', { ports: [23119, 23119] });
  assert.deepEqual((await of('ports')).ports, [23119]);
  await servers.removeServer('ports');
  // the profile opens just those, with the gate or on any host, and nothing when offline
  const base = { workspace: '/w', home: '/h', executable: '/usr/bin/true', localPorts: [23119] };
  for (const profile of [sandboxProfile({ ...base, gatePort: 50123 }), sandboxProfile(base)]) assert.match(profile, /\(allow network-outbound \(remote tcp "localhost:23119"\)\)/);
  assert.doesNotMatch(sandboxProfile({ ...base, offline: true }), /23119/);
});

test('inside isolation, a server reaches the local ports it was given and no other, and never Spectrum’s own', { skip: !mac && 'macOS isolation', timeout: 60000 }, async () => {
  const allowed = await service();
  const other = await service();
  try {
    await servers.addServer({ name: 'local', command: process.execPath, args: [file] });
    await servers.checkServer('local');
    await servers.setServerOn('local', true);
    const reach = (port) => call('local', 'reach', { port });
    assert.equal(await reach(allowed.port), 'EPERM', 'nothing local before it is given');
    await servers.setServerNetwork('local', { ports: [allowed.port] });
    // Spectrum's own port, even written into the file by hand
    const saved = JSON.parse(await fs.readFile(path.join(data, 'mcp-servers.json'), 'utf8'));
    saved.servers.find((s) => s.name === 'local').ports.push(own.port, 50001);
    await fs.writeFile(path.join(data, 'mcp-servers.json'), JSON.stringify(saved));
    assert.deepEqual((await of('local')).ports, [allowed.port]);
    servers.stopServers();
    assert.deepEqual([await reach(allowed.port), await reach(other.port), await reach(own.port)], ['connected', 'EPERM', 'EPERM']);
    // the same on any host
    await servers.setServerNetwork('local', { anyHost: true });
    assert.deepEqual([await reach(allowed.port), await reach(other.port), await reach(own.port)], ['connected', 'EPERM', 'EPERM']);
    // taken away, it is gone at once
    await servers.setServerNetwork('local', { ports: [] });
    assert.equal(await reach(allowed.port), 'EPERM');
  } finally {
    await servers.removeServer('local');
    await allowed.close();
    await other.close();
  }
});
