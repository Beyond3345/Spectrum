// The network gate for isolated processes: a host on the list is reached and one off it refused, with stand-in
// servers on this computer named through the gate itself. No network. The native half runs Spectrum's own Node inside
// the macOS profile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { cleanHost, cleanHosts, helloName, hostAllowed, nameStandIn, openGate, thisComputer } from '../src/services/agentNetwork.js';
import { sandboxProfile, spawnAgentProcess } from '../src/services/agentSandbox.js';

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

test('inside isolation, a program reaches a listed host through the gate and nothing else', { skip: !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.', timeout: 60000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-network-')));
  const key = path.join(root, 'key.pem'), cert = path.join(root, 'home', 'stand-in.pem');
  await fs.mkdir(path.join(root, 'home', 'tmp'), { recursive: true }); await fs.mkdir(path.join(root, 'work'));
  // a certificate for the stand-ins, made here and trusted only by the script below
  execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-subj', '/CN=listed.test', '-days', '2', '-addext', 'subjectAltName=DNS:listed.test,DNS:unlisted.test'], { stdio: 'ignore' });
  const server = https.createServer({ key: await fs.readFile(key), cert: await fs.readFile(cert) }, (req, res) => res.end(`stand-in for ${req.headers.host}`));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  nameStandIn('listed.test', port);
  nameStandIn('unlisted.test', port);
  try {
    const script = `
      const net = require('node:net'), { spawnSync } = require('node:child_process');
      const get = (url) => fetch(url).then(async (r) => r.status + ' ' + await r.text(), (e) => 'failed');
      const socket = (...to) => new Promise((resolve) => { const s = net.connect(...to); s.on('connect', () => resolve('connected')); s.on('error', (e) => resolve(e.code)); setTimeout(() => resolve('no answer'), 3000).unref(); });
      (async () => console.log(JSON.stringify({
        listed: await get('https://listed.test/'),
        unlisted: await get('https://unlisted.test/'),
        plain: (await get('http://listed.test/')).slice(0, 3),
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
      listed: '200 stand-in for listed.test', unlisted: 'failed', plain: '403',
      curl: 'stand-in for listed.test', curlUnlisted: '403',
      standIn: 'EPERM', elsewhere: 'EPERM', resolver: 'EPERM', lookup: 'ENOTFOUND'
    });
    assert.deepEqual([...new Set(refused)], ['unlisted.test']);
  } finally { nameStandIn('listed.test'); nameStandIn('unlisted.test'); await new Promise((resolve) => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); }
});
