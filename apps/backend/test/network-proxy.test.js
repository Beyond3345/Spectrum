// The user's proxy: where Spectrum learns it (typed, the Mac's settings, the login shell), the gate and the backend's
// own requests going on through it (an HTTP CONNECT and a SOCKS5 stand-in proxy here, which alone know the stand-in
// servers' names), loopback never through it, its name and password never shown. No network. The native half runs a
// program inside the agents' isolation.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const tmp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'spectrum-network-proxy-')));
Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(tmp, 'data'), SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects') });
delete process.env.SPECTRUM_SCUTIL;
delete process.env.SPECTRUM_LOGIN_SHELL;
const np = await import('../src/services/networkProxy.js');
const { openGate, helloName, throughProxy } = await import('../src/services/agentNetwork.js');
const { spawnAgentProcess } = await import('../src/services/agentSandbox.js');
const native = process.platform === 'darwin' && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
const mac = process.platform !== 'darwin' && 'the proxy is used on a Mac only';
after(async () => { await np.applyProxy(null); rmSync(tmp, { recursive: true, force: true }); });

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
/** Names only the stand-in proxies know: name → port on this computer. */
const names = new Map();
const USER = 'me', PASS = 'hunter2-proxy';

/** A stand-in HTTP proxy: CONNECT and plain requests to the names it knows, with a name and password if asked. */
async function httpProxy({ auth = false } = {}) {
  const asked = [];
  const good = `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`;
  const server = http.createServer((req, res) => {
    const target = new URL(req.url);
    asked.push(`GET ${target.host}`);
    if (auth && req.headers['proxy-authorization'] !== good) return res.writeHead(407).end();
    const onward = http.request({ host: '127.0.0.1', port: names.get(target.hostname), path: target.pathname, headers: req.headers }, (answer) => { res.writeHead(answer.statusCode, answer.headers); answer.pipe(res); });
    onward.on('error', () => res.writeHead(502).end());
    req.pipe(onward);
  });
  server.on('connect', (req, client) => {
    client.on('error', () => {});
    const [host, port] = req.url.split(':');
    asked.push(`CONNECT ${req.url}`);
    if (auth && req.headers['proxy-authorization'] !== good) return client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
    if (!names.has(host) || port !== '443') return client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    const upstream = net.connect(names.get(host), '127.0.0.1', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); client.pipe(upstream); upstream.pipe(client); });
    upstream.on('error', () => client.destroy());
  });
  return { asked, port: await listen(server), close: () => { server.closeAllConnections(); server.close(); } };
}

/** A stand-in SOCKS5 proxy, names given to it to look up, with a name and password if asked. */
async function socksProxy({ auth = false } = {}) {
  const asked = [];
  const server = net.createServer((client) => {
    client.on('error', () => {});
    let got = Buffer.alloc(0), step = 0;
    client.on('data', (chunk) => {
      got = Buffer.concat([got, chunk]);
      if (step === 0 && got.length >= 2 + got[1]) {
        const offered = [...got.subarray(2, 2 + got[1])];
        got = got.subarray(2 + got[1]);
        if (auth && !offered.includes(2)) return client.end(Buffer.from([5, 0xff]));
        step = auth ? 1 : 2;
        client.write(Buffer.from([5, auth ? 2 : 0]));
      }
      if (step === 1 && got.length >= 2 && got.length >= 3 + got[1] + got[2 + got[1]]) {
        const user = got.toString('utf8', 2, 2 + got[1]), pass = got.toString('utf8', 3 + got[1], 3 + got[1] + got[2 + got[1]]);
        got = got.subarray(3 + got[1] + got[2 + got[1]]);
        if (user !== USER || pass !== PASS) return client.end(Buffer.from([1, 1]));
        step = 2;
        client.write(Buffer.from([1, 0]));
      }
      if (step === 2 && got.length >= 7 && got[3] === 3 && got.length >= 7 + got[4]) {
        const host = got.toString('utf8', 5, 5 + got[4]), port = got.readUInt16BE(5 + got[4]);
        asked.push(`${host}:${port}`);
        got = got.subarray(7 + got[4]);
        step = 3;
        if (!names.has(host)) return client.end(Buffer.from([5, 4, 0, 1, 0, 0, 0, 0, 0, 0]));
        const upstream = net.connect(names.get(host), '127.0.0.1', () => { client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0])); client.removeAllListeners('data'); client.pipe(upstream); upstream.pipe(client); });
        upstream.on('error', () => client.destroy());
      }
    });
  });
  return { asked, port: await listen(server), close: () => server.close() };
}

/** An HTTPS stand-in for names, with a certificate made here; and a plain HTTP one. */
async function httpsStandIn(hostNames, answer = (req, res) => res.end(`stand-in for ${req.headers.host}${req.url}`)) {
  const key = path.join(tmp, `key-${hostNames[0]}.pem`), cert = path.join(tmp, `cert-${hostNames[0]}.pem`);
  execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-subj', `/CN=${hostNames[0]}`, '-days', '2', '-addext', `subjectAltName=${hostNames.map((n) => `DNS:${n}`).join(',')}`], { stdio: 'ignore' });
  const server = https.createServer({ key: await fs.readFile(key), cert: await fs.readFile(cert) }, answer);
  const port = await listen(server);
  for (const name of hostNames) names.set(name, port);
  return { port, cert, close: () => { server.closeAllConnections(); server.close(); } };
}

test('a proxy is written http:// or socks5://, with a port; its name and password are never shown', () => {
  assert.deepEqual(np.parseProxy('http://127.0.0.1:7890'), { scheme: 'http', host: '127.0.0.1', port: 7890 });
  assert.deepEqual(np.parseProxy('socks5://me:p%40ss@proxy.example.com:1080'), { scheme: 'socks5', host: 'proxy.example.com', port: 1080, user: 'me', pass: 'p@ss' });
  assert.equal(np.parseProxy('socks5h://[::1]:1080').host, '::1');
  for (const bad of ['', 'proxy.example.com:8080', 'https://p.example.com:443', 'http://p.example.com', 'http://p.example.com:8080/path', 'ftp://p:21', 'http://a b:1']) assert.equal(np.parseProxy(bad), null, bad);
  assert.deepEqual(np.parseProxy('127.0.0.1:7890', { bare: true }), { scheme: 'http', host: '127.0.0.1', port: 7890 }, 'a variable may leave out http://');
  assert.equal(np.proxyText(np.parseProxy(`http://${USER}:${PASS}@127.0.0.1:7890`)), 'http://•••@127.0.0.1:7890');
  assert.equal(np.proxyText(np.parseProxy('socks5://[::1]:1080')), 'socks5://[::1]:1080');
  assert.ok(np.bypasses('a.corp.example', np.noProxyList('localhost, .corp.example')));
  assert.ok(np.bypasses('corp.example', ['*.corp.example']));
  assert.ok(!np.bypasses('corp.example.org', ['corp.example']));
  assert.ok(np.bypasses('anything.test', ['*']));
});

test('the Mac’s settings give their HTTPS proxy, else their SOCKS one, with their exceptions; an automatic configuration is not read', () => {
  const text = (body) => `<dictionary> {\n${body}}\n`;
  assert.deepEqual(np.systemProxy(text('  ExceptionsList : <array> {\n    0 : *.local\n    1 : 169.254/16\n  }\n  HTTPSEnable : 1\n  HTTPSPort : 7890\n  HTTPSProxy : 127.0.0.1\n  SOCKSEnable : 1\n  SOCKSPort : 7891\n  SOCKSProxy : 127.0.0.1\n')),
    { scheme: 'http', host: '127.0.0.1', port: 7890, noProxy: ['*.local', '169.254/16'] });
  assert.deepEqual(np.systemProxy(text('  SOCKSEnable : 1\n  SOCKSPort : 7891\n  SOCKSProxy : 127.0.0.1\n')), { scheme: 'socks5', host: '127.0.0.1', port: 7891, noProxy: [] });
  assert.equal(np.systemProxy(text('  ProxyAutoConfigEnable : 1\n  ProxyAutoConfigURLString : http://127.0.0.1:7890/pac\n  HTTPSEnable : 0\n')), null);
  assert.equal(np.systemProxy(''), null);
});

test('the login shell’s proxy variables: HTTPS_PROXY, else ALL_PROXY, else HTTP_PROXY, either case, and NO_PROXY', async () => {
  assert.deepEqual(np.shellProxy({ http_proxy: 'http://127.0.0.1:1', ALL_PROXY: 'socks5://127.0.0.1:2', no_proxy: 'localhost,.lan' }), { scheme: 'socks5', host: '127.0.0.1', port: 2, noProxy: ['localhost', '.lan'] });
  assert.deepEqual(np.shellProxy({ https_proxy: '127.0.0.1:7890' }), { scheme: 'http', host: '127.0.0.1', port: 7890, noProxy: [] });
  assert.equal(np.shellProxy({ PATH: '/usr/bin' }), null);
  // a stand-in login shell: rc files that print noise, the variables, and a job that keeps its output open
  const shell = path.join(tmp, 'login-shell');
  await fs.writeFile(shell, `#!/bin/sh\necho "welcome from the rc files"\nexport HTTPS_PROXY=http://127.0.0.1:7890 no_proxy=localhost SECRET_TOKEN=do-not-keep\nsleep 30 &\neval "$2"\n`, { mode: 0o755 });
  process.env.SPECTRUM_LOGIN_SHELL = shell;
  np.forgetShell();
  try {
    const started = Date.now();
    assert.deepEqual(await np.loginShellVariables(), { HTTPS_PROXY: 'http://127.0.0.1:7890', no_proxy: 'localhost' }, 'only the proxy variables are kept');
    assert.ok(Date.now() - started < 3500, 'read without waiting for the job it left running');
  } finally { delete process.env.SPECTRUM_LOGIN_SHELL; np.forgetShell(); }
});

test('Spectrum goes through the proxy typed in Settings, else the Mac’s, else the shell’s, and through none without one', { skip: mac }, async () => {
  const scutil = path.join(tmp, 'scutil'), shell = path.join(tmp, 'shell');
  await fs.writeFile(scutil, '#!/bin/sh\nprintf "<dictionary> {\\n  HTTPSEnable : 1\\n  HTTPSPort : 3128\\n  HTTPSProxy : 10.0.0.2\\n}\\n"\n', { mode: 0o755 });
  await fs.writeFile(shell, '#!/bin/sh\nexport ALL_PROXY=socks5://127.0.0.1:7891\neval "$2"\n', { mode: 0o755 });
  try {
    assert.equal(await np.currentProxy(), null, 'nothing found: as before');
    process.env.SPECTRUM_LOGIN_SHELL = shell; np.forgetShell();
    assert.deepEqual(await np.currentProxy(), { scheme: 'socks5', host: '127.0.0.1', port: 7891, noProxy: [], source: 'shell', from: 'From your shell', text: 'socks5://127.0.0.1:7891' });
    process.env.SPECTRUM_SCUTIL = scutil;
    assert.equal((await np.currentProxy()).text, 'http://10.0.0.2:3128');
    assert.equal((await np.currentProxy()).from, 'From this Mac’s network settings');
    await np.saveTypedProxy(`http://${USER}:${PASS}@proxy.example.com:8080`);
    const typed = await np.currentProxy();
    assert.deepEqual([typed.source, typed.from, typed.text, typed.pass], ['typed', 'Set by you', 'http://•••@proxy.example.com:8080', PASS]);
    await assert.rejects(np.saveTypedProxy('proxy.example.com'), /http:\/\/host:port or socks5:\/\/host:port/);
    await np.saveTypedProxy('');
    assert.equal((await np.currentProxy()).source, 'system', 'cleared, the Mac’s again');
  } finally { delete process.env.SPECTRUM_SCUTIL; delete process.env.SPECTRUM_LOGIN_SHELL; np.forgetShell(); }
});

test('a tunnel through an HTTP or a SOCKS5 proxy, with a name and password, to a name only the proxy knows', async () => {
  const echo = net.createServer((s) => s.pipe(s));
  names.set('echo.test', await listen(echo));
  const proxies = [await httpProxy({ auth: true }), await socksProxy({ auth: true })];
  try {
    for (const [proxy, scheme] of [[proxies[0], 'http'], [proxies[1], 'socks5']]) {
      const socket = await throughProxy({ scheme, host: '127.0.0.1', port: proxy.port, user: USER, pass: PASS }, 'echo.test', 443);
      socket.write('ping');
      assert.equal(String(await new Promise((resolve) => socket.once('data', resolve))), 'ping', scheme);
      socket.destroy();
      await assert.rejects(throughProxy({ scheme, host: '127.0.0.1', port: proxy.port, user: USER, pass: 'wrong' }, 'echo.test', 443), /refused/, `${scheme}: a wrong password`);
      await assert.rejects(throughProxy({ scheme, host: '127.0.0.1', port: proxy.port, user: USER, pass: PASS }, 'unknown.test', 443), /refused/, `${scheme}: a name it can't reach`);
    }
  } finally { for (const p of proxies) p.close(); echo.close(); names.delete('echo.test'); }
});

test('the gate goes on through the proxy: a listed host, any host for an agent on Any host, never a host off the list, and only for a hello that names it', async () => {
  const reached = [];
  const server = net.createServer((s) => { s.on('error', () => {}); s.once('data', (b) => { reached.push(helloName(b)); s.end(); }); });
  names.set('listed.test', await listen(server));
  names.set('other.test', names.get('listed.test'));
  for (const make of [httpProxy, socksProxy]) {
    const proxy = await make({ auth: true });
    const upstream = { scheme: make === httpProxy ? 'http' : 'socks5', host: '127.0.0.1', port: proxy.port, user: USER, pass: PASS, noProxy: [] };
    reached.length = 0;
    const through = async (gate, target, servername) => {
      const socket = net.connect(gate.port, '127.0.0.1', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
      const status = Number(String(await new Promise((resolve) => socket.once('data', resolve))).split(' ')[1]);
      if (status === 200) { const t = tls.connect({ socket, servername }); await new Promise((resolve) => { t.on('error', resolve); t.on('close', resolve); }); }
      socket.destroy();
      return status;
    };
    const refused = [];
    const listed = await openGate({ hosts: () => ['listed.test'], onRefused: (h) => refused.push(h), proxy: upstream });
    const any = await openGate({ hosts: null, proxy: upstream });
    try {
      assert.equal(await through(listed, 'listed.test:443', 'listed.test'), 200);
      assert.equal(await through(listed, 'other.test:443', 'other.test'), 403);
      assert.deepEqual(refused, ['other.test']);
      assert.ok(!proxy.asked.some((a) => a.includes('other.test')), 'a host off the list is refused before the proxy is asked');
      assert.equal(await through(any, 'other.test:443', 'other.test'), 200, 'any host, through the proxy');
      assert.equal(await through(any, 'other.test:443', 'listed.test'), 200);
      assert.deepEqual(reached, ['listed.test', 'other.test'], 'a hello naming another host goes nowhere');
      for (const target of ['other.test:80', 'localhost:443', '127.0.0.1:443']) assert.equal(await through(any, target, 'other.test'), 403, target);
      assert.ok(proxy.asked.every((a) => /(listed|other)\.test:443$/.test(a)), JSON.stringify(proxy.asked));
    } finally { listed.close(); any.close(); proxy.close(); }
  }
  server.close(); names.delete('listed.test'); names.delete('other.test');
});

test('the backend’s own requests go through the proxy when there is one, and directly when there is none; this computer never through it', { skip: mac }, async () => {
  const proxy = await httpProxy({ auth: true });
  const openalex = await httpsStandIn(['api.openalex.org', 'models.test'], (req, res) => {
    if (req.headers.host === 'api.openalex.org') return res.end(JSON.stringify({ results: [{ id: 'https://openalex.org/W1', display_name: 'Through the proxy', publication_year: 2026, authorships: [] }] }));
    res.end(JSON.stringify({ data: [{ id: 'stand-in-model' }] }));
  });
  const local = http.createServer((req, res) => res.end('this computer'));
  const localPort = await listen(local);
  const defaults = tls.getCACertificates('default');
  tls.setDefaultCACertificates([...defaults, await fs.readFile(openalex.cert, 'utf8')]);
  try {
    const { searchOpenAlex } = await import('../src/services/searchService.js');
    const { testConnection } = await import('../src/services/modelCheck.js');
    await np.saveTypedProxy(`http://${USER}:${PASS}@127.0.0.1:${proxy.port}`);
    assert.equal((await np.applyProxy()).source, 'typed');
    const found = await searchOpenAlex('attention', 1);
    assert.equal(found[0].title, 'Through the proxy');
    assert.equal((await testConnection({ endpoint: 'https://models.test/v1/chat/completions', apiKey: 'sk-test-0123456789' })).ok, true, 'a model request');
    assert.equal(await (await fetch(`http://127.0.0.1:${localPort}/`)).text(), 'this computer');
    assert.deepEqual(proxy.asked, ['CONNECT api.openalex.org:443', 'CONNECT models.test:443'], 'this computer was reached directly');
    // npm, started outside isolation for an adapter, gets the relay, never the proxy's name and password
    const vars = np.proxyVariables();
    assert.match(vars.HTTPS_PROXY, /^http:\/\/spectrum:[\w-]+@127\.0\.0\.1:\d+$/);
    assert.ok(!JSON.stringify(vars).includes(PASS));
    // none: as before
    await np.saveTypedProxy('');
    assert.equal(await np.applyProxy(), null);
    assert.deepEqual(np.proxyVariables(), {});
    assert.equal(await (await fetch(`http://127.0.0.1:${localPort}/`)).text(), 'this computer');
    assert.equal(proxy.asked.length, 2, 'without a proxy nothing goes to it (the network guard refuses a direct try at a public name, so none is made here)');
  } finally {
    tls.setDefaultCACertificates(defaults);
    await np.saveTypedProxy(''); await np.applyProxy(null);
    proxy.close(); openalex.close(); local.close(); names.delete('api.openalex.org'); names.delete('models.test');
  }
});

test('npm installing an adapter is given the relay, through which it reaches the registry', { skip: mac }, async () => {
  const proxy = await socksProxy();
  const seen = path.join(tmp, 'npm-env.json');
  const npm = path.join(tmp, 'fake-npm.js');
  await fs.writeFile(npm, `require('node:fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ https: process.env.HTTPS_PROXY, no: process.env.NO_PROXY })); process.exit(1);\n`);
  try {
    await np.saveTypedProxy(`socks5://127.0.0.1:${proxy.port}`);
    await np.applyProxy();
    const { installAdapter } = await import('../src/services/agentProfiles.js');
    await assert.rejects(installAdapter('codex', { npm }));
    const env = JSON.parse(await fs.readFile(seen, 'utf8'));
    assert.match(env.https, /^http:\/\/spectrum:[\w-]+@127\.0\.0\.1:\d+$/);
    assert.match(env.no, /^localhost,127\.0\.0\.1,::1/);
  } finally { await np.saveTypedProxy(''); await np.applyProxy(null); proxy.close(); }
});

test('inside isolation, a program reaches a host only through the gate and the proxy, on its list or on any host; this computer stays closed', { skip: !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.', timeout: 60000 }, async () => {
  const root = path.join(tmp, 'program');
  await fs.mkdir(path.join(root, 'home', 'tmp'), { recursive: true }); await fs.mkdir(path.join(root, 'work'), { recursive: true });
  const standIn = await httpsStandIn(['listed.test', 'unlisted.test']);
  const proxy = await socksProxy({ auth: true });
  // where isolation lets the program read it
  const cert = path.join(root, 'home', 'stand-in.pem');
  await fs.copyFile(standIn.cert, cert);
  const upstream = { scheme: 'socks5', host: '127.0.0.1', port: proxy.port, user: USER, pass: PASS, noProxy: [] };
  const script = `
    const net = require('node:net');
    const get = (url) => fetch(url).then(async (r) => r.status + ' ' + await r.text(), () => 'failed');
    const socket = (...to) => new Promise((resolve) => { const s = net.connect(...to); s.on('connect', () => resolve('connected')); s.on('error', (e) => resolve(e.code)); setTimeout(() => resolve('no answer'), 3000).unref(); });
    (async () => console.log(JSON.stringify({
      listed: await get('https://listed.test/'), unlisted: await get('https://unlisted.test/'),
      standIn: await socket(${standIn.port}, '127.0.0.1'), proxy: await socket(${proxy.port}, '127.0.0.1')
    })))();
  `;
  const run = async (hosts) => {
    const refused = [];
    const child = await spawnAgentProcess({ command: process.execPath, args: ['-e', script], workspace: path.join(root, 'work'), home: path.join(root, 'home'), env: { NODE_EXTRA_CA_CERTS: cert }, hosts, onRefused: (h) => refused.push(h), proxy: upstream });
    let out = '', err = '';
    child.stdout.on('data', (c) => out += c); child.stderr.on('data', (c) => err += c);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0, err);
    return { ...JSON.parse(out), refused };
  };
  try {
    assert.deepEqual(await run(() => ['listed.test']), { listed: '200 stand-in for listed.test/', unlisted: 'failed', standIn: 'EPERM', proxy: 'EPERM', refused: ['unlisted.test'] });
    assert.deepEqual(proxy.asked, ['listed.test:443'], 'the host off the list never reached the proxy');
    assert.deepEqual(await run(undefined), { listed: '200 stand-in for listed.test/', unlisted: '200 stand-in for unlisted.test/', standIn: 'EPERM', proxy: 'EPERM', refused: [] });
  } finally { standIn.close(); proxy.close(); names.delete('listed.test'); names.delete('unlisted.test'); }
});
