import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { spawnAgentProcess, developerReads, sandboxProfile } from '../src/services/agentSandbox.js';
import { PORT } from '../src/config/constants.js';

const native = process.platform === 'darwin' && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';

test('native agent sandbox contains files, descendants, and local services', { skip: !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.' }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-sandbox-')));
  const workspace = path.join(root, 'work');
  const home = path.join(root, 'home');
  const outside = path.join(root, 'private.txt');
  const server = createServer((req, res) => res.end('must not be reachable'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fs.mkdir(workspace); await fs.mkdir(home); await fs.mkdir(path.join(home, 'tmp'));
    await fs.writeFile(outside, 'personal');
    await fs.symlink(outside, path.join(workspace, 'escape.txt'));
    await fs.mkdir(path.join(workspace, '.claude'));
    const externalCommand = path.join(root, 'command');
    await fs.writeFile(externalCommand, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    await assert.rejects(spawnAgentProcess({ command: externalCommand, runtimeExecutable: process.execPath, workspace, home }), /outside the approved runtime/);
    const script = `
      const fs = require('node:fs');
      const {spawnSync} = require('node:child_process');
      const net = require('node:net');
      const assert = require('node:assert/strict');
      fs.writeFileSync('allowed.txt','yes');
      for (const file of [${JSON.stringify(outside)}, 'escape.txt']) {
        assert.throws(()=>fs.readFileSync(file));
        assert.throws(()=>fs.writeFileSync(file,'changed'));
      }
      for (const file of ['.ENV', '.env.local', '.GIT', '.SPECTRUM', 'secret.KEY', '.Claude', 'id_rsa', 'ID_ED25519', '.netrc', '.npmrc', 'cert.p12', 'Store.JKS']) assert.throws(()=>fs.writeFileSync(file,'secret'), file);
      fs.writeFileSync('id_rsa.pub','a public key is no secret');
      // Claude's project settings, which Claude Code reads outside isolation: neither made nor written into
      assert.throws(()=>fs.mkdirSync('sub/.claude',{recursive:true}));
      assert.throws(()=>fs.writeFileSync('.claude/settings.json','{}'));
      const child = spawnSync('/bin/sh',['-c', 'cat "$1"; echo changed > "$1"', 'test', ${JSON.stringify(outside)}]);
      assert.notEqual(child.status,0);
      const socket = net.connect(${server.address().port},'127.0.0.1');
      socket.on('connect',()=>process.exit(2));
      socket.on('error',()=>console.log('contained'));
      setTimeout(()=>process.exit(3),3000).unref();
    `;
    const child = await spawnAgentProcess({ command: process.execPath, args: ['-e', script], workspace, home });
    let output = '', errors = '';
    child.stdout.on('data', (c) => output += c); child.stderr.on('data', (c) => errors += c);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, errors);
    assert.match(output, /contained/);
    assert.equal(await fs.readFile(outside, 'utf8'), 'personal');
    assert.equal(await fs.readFile(path.join(workspace, 'allowed.txt'), 'utf8'), 'yes');
  } finally { await new Promise((resolve) => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); }
});

test('an isolated agent reaches the system’s name lookup, and a program with no network does not', { skip: !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.' }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-lookup-')));
  try {
    await fs.mkdir(path.join(root, 'home', 'tmp'), { recursive: true }); await fs.mkdir(path.join(root, 'work'));
    // the socket getaddrinfo asks: without it every host is ENOTFOUND to Node, Rust and whatever else uses the system's resolver
    const script = `
      const socket = require('node:net').connect('/private/var/run/mDNSResponder');
      socket.on('connect', () => { console.log('reached'); process.exit(0); });
      socket.on('error', (err) => { console.log(err.code); process.exit(0); });
      setTimeout(() => process.exit(3), 3000).unref();
    `;
    const said = async (offline) => {
      const child = await spawnAgentProcess({ command: process.execPath, args: ['-e', script], workspace: path.join(root, 'work'), home: path.join(root, 'home'), offline });
      let output = '';
      child.stdout.on('data', (c) => output += c);
      await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
      return output.trim();
    };
    assert.equal(await said(false), 'reached');
    assert.equal(await said(true), 'EPERM');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('an isolated agent reads the system’s trusted roots, which a program checking certificates itself needs', { skip: !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.' }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-roots-')));
  try {
    await fs.mkdir(path.join(root, 'home', 'tmp'), { recursive: true }); await fs.mkdir(path.join(root, 'work'));
    // what rustls-native-certs asks on a Mac (Codex's TLS): an empty list fails every handshake, chatgpt.com's included
    const script = 'ObjC.import("Security"); var r = Ref(); var s = $.SecTrustSettingsCopyCertificates(2, r); s === 0 ? $.CFArrayGetCount(r[0]) : "status " + s';
    const child = await spawnAgentProcess({ command: '/usr/bin/osascript', args: ['-l', 'JavaScript', '-e', script], workspace: path.join(root, 'work'), home: path.join(root, 'home') });
    let output = '';
    child.stdout.on('data', (c) => output += c);
    await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.ok(Number(output.trim()) > 50, `the system roots: ${output.trim()}`);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('an agent started from an app reads and runs that bundle, not another app beside it', { skip: !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.' }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-app-')));
  const workspace = path.join(root, 'work'), home = path.join(root, 'home');
  // a fake ~/Applications: the agent's app, whose launcher runs the app's own program, and another app
  const app = path.join(root, 'Applications/Agent.app'), other = path.join(root, 'Applications/Other.app');
  const launcher = path.join(app, 'Contents/Resources/cli/bin/agent');
  try {
    for (const folder of [workspace, path.join(home, 'tmp'), path.dirname(launcher), path.join(app, 'Contents/MacOS'), path.join(other, 'Contents')]) await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(app, 'Contents/MacOS/Agent'), '#!/bin/sh\ncat "$1"\n', { mode: 0o755 });
    await fs.writeFile(path.join(app, 'Contents/Info.plist'), 'own bundle');
    await fs.writeFile(path.join(other, 'Contents/Info.plist'), 'other app');
    await fs.writeFile(launcher, `#!/bin/sh\n"${app}/Contents/MacOS/Agent" "${app}/Contents/Info.plist" || exit 2\ncat "${other}/Contents/Info.plist" 2>/dev/null && exit 3\nexit 0\n`, { mode: 0o755 });
    const child = await spawnAgentProcess({ command: launcher, runtimeExecutable: launcher, runtimePaths: [app], workspace, home });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const code = await new Promise((resolve) => child.on('close', resolve));
    assert.deepEqual([code, out], [0, 'own bundle']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('an agent runs git through the developer folder, but reads no other app in /Applications', { skip: !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.' }, async () => {
  const [developer] = developerReads();
  // an installed app other than the developer tools', only checked to exist here
  let plist;
  for (const name of (await fs.readdir('/Applications')).filter((n) => n.endsWith('.app'))) {
    const file = path.join('/Applications', name, 'Contents/Info.plist');
    if (path.join('/Applications', name) !== developer && await fs.access(file).then(() => true, () => false)) { plist = file; break; }
  }
  assert.ok(plist, 'needs an app in /Applications');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-git-')));
  const workspace = path.join(root, 'work'), home = path.join(root, 'home');
  try {
    await fs.mkdir(workspace); await fs.mkdir(path.join(home, 'tmp'), { recursive: true });
    const script = `/usr/bin/git --version || exit 2\ncat ${JSON.stringify(plist)} >/dev/null 2>&1 && exit 3\nexit 0`;
    const child = await spawnAgentProcess({ command: '/bin/sh', args: ['-c', script], runtimeExecutable: '/bin/sh', workspace, home });
    let out = '', errors = '';
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { errors += d; });
    const code = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(code, 0, errors);
    assert.match(out, /git version/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// A-19: a backend killed outright (a crash, Force Quit) takes its agents with it, and an agent that exits leaves nothing
test('an isolated process and its descendants die with the backend, and with the process itself', { skip: !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.', timeout: 30000 }, async () => {
  const { spawn } = await import('node:child_process');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-orphan-')));
  const workspace = path.join(root, 'work');
  const home = path.join(root, 'home');
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const gone = async (pid) => { for (const end = Date.now() + 5000; alive(pid); await new Promise((r) => setTimeout(r, 50))) if (Date.now() > end) return false; return true; };
  // an agent that starts a helper of its own, writes both pids and never ends, even when its input closes
  const agent = `const {spawn}=require('node:child_process');const h=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync('pids',process.pid+' '+h.pid);process.stdin.on('end',()=>{});setInterval(()=>{},1000);`;
  try {
    await fs.mkdir(workspace); await fs.mkdir(home); await fs.mkdir(path.join(home, 'tmp'));
    const sandbox = new URL('../src/services/agentSandbox.js', import.meta.url).href;
    const backend = spawn(process.execPath, ['--input-type=module', '-e', `const { spawnAgentProcess } = await import(${JSON.stringify(sandbox)}); await spawnAgentProcess({ command: process.execPath, args: ['-e', ${JSON.stringify(agent)}], workspace: ${JSON.stringify(workspace)}, home: ${JSON.stringify(home)} }); setInterval(() => {}, 1000);`], { stdio: 'ignore' });
    const pidsFile = path.join(workspace, 'pids');
    for (const end = Date.now() + 10000; !(await fs.stat(pidsFile).catch(() => null)); await new Promise((r) => setTimeout(r, 50))) if (Date.now() > end) throw new Error('The agent never started.');
    const [pid, helper] = (await fs.readFile(pidsFile, 'utf8')).split(' ').map(Number);
    assert.ok(alive(pid) && alive(helper));
    backend.kill('SIGKILL');
    assert.ok(await gone(pid), 'the agent ends with the backend');
    assert.ok(await gone(helper), 'and so does what it started');

    // an agent that exits by itself while something it started runs on
    await fs.rm(pidsFile);
    const child = await spawnAgentProcess({ command: process.execPath, args: ['-e', agent.replace('setInterval(()=>{},1000);', 'setTimeout(()=>process.exit(0),300);')], workspace, home });
    await new Promise((resolve) => child.once('close', resolve));
    const [, left] = (await fs.readFile(pidsFile, 'utf8')).split(' ').map(Number);
    assert.ok(await gone(left), 'its helper goes with it');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('an agent with its own server binds a port it picks and talks to itself only with the switch, and never reaches Spectrum’s ports', { skip: !native && 'Run with SPECTRUM_NATIVE_AGENT_TESTS=1 outside an existing sandbox.' }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-loopback-')));
  const other = createServer((req, res) => res.end('another program'));
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
  try {
    await fs.mkdir(path.join(root, 'home', 'tmp'), { recursive: true }); await fs.mkdir(path.join(root, 'work'));
    // as Antigravity's language server does: 127.0.0.1:0, else localhost:0, then a connection to itself; then the ports of others
    const script = `
      const net = require('node:net');
      const reach = (port, host = '127.0.0.1') => new Promise((r) => { const s = net.connect(port, host); s.on('connect', () => { s.destroy(); r('ok'); }); s.on('error', (e) => r(e.code)); });
      const serve = (host) => new Promise((r) => { const srv = net.createServer((c) => c.end()); srv.on('error', (e) => r(e.code)); srv.listen(0, host, () => r(srv)); });
      (async () => {
        const said = {};
        for (const host of ['127.0.0.1', '::1']) {
          const srv = await serve(host);
          said[host] = typeof srv === 'string' ? srv : await reach(srv.address().port, host);
        }
        said.other = await reach(${other.address().port});
        said.spectrum = await reach(${PORT});
        said.app = await reach(38787);
        console.log(JSON.stringify(said));
        process.exit(0);
      })();
    `;
    const said = async (options) => {
      const child = await spawnAgentProcess({ command: process.execPath, args: ['-e', script], workspace: path.join(root, 'work'), home: path.join(root, 'home'), ...options });
      let output = '';
      child.stdout.on('data', (c) => output += c);
      await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
      return JSON.parse(output);
    };
    // without it, the failure Antigravity met: no port to bind
    assert.deepEqual(await said({}), { '127.0.0.1': 'EPERM', '::1': 'EPERM', other: 'EPERM', spectrum: 'EPERM', app: 'EPERM' });
    // with it, its own server works; another program here is reachable too, which is what the switch's wording says;
    // Spectrum's own ports never are
    assert.deepEqual(await said({ loopback: true }), { '127.0.0.1': 'ok', '::1': 'ok', other: 'ok', spectrum: 'EPERM', app: 'EPERM' });
    // held to a list it is so as well, its gate included
    assert.deepEqual(await said({ loopback: true, hosts: () => [] }), { '127.0.0.1': 'ok', '::1': 'ok', other: 'ok', spectrum: 'EPERM', app: 'EPERM' });
    // a program with no network gets nothing from it
    assert.deepEqual(await said({ loopback: true, offline: true }), { '127.0.0.1': 'EPERM', '::1': 'EPERM', other: 'EPERM', spectrum: 'EPERM', app: 'EPERM' });
  } finally { await new Promise((resolve) => other.close(resolve)); await fs.rm(root, { recursive: true, force: true }); }
});

test('the switch for an agent’s own server: every local port, then Spectrum’s own refused after it, and nothing for a program with no network', () => {
  const base = { workspace: '/w', home: '/h', executable: '/usr/bin/true' };
  assert.doesNotMatch(sandboxProfile(base), /tcp "localhost:\*"/);
  const profile = sandboxProfile({ ...base, loopback: true });
  const open = profile.indexOf('(allow network-outbound (remote tcp "localhost:*"))');
  assert.ok(open > 0 && profile.includes('(allow network-bind network-inbound (local tcp "localhost:*"))'));
  // the last rule that matches wins, so each refusal comes after the opening
  for (const port of [PORT, 38787, 38796]) assert.ok(profile.indexOf(`(deny network-outbound (remote tcp "localhost:${port}"))`) > open, port);
  assert.doesNotMatch(sandboxProfile({ ...base, loopback: true, offline: true }), /localhost/);
});
