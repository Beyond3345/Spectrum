import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { spawnAgentProcess, killAgentProcess, resolveExecutable } from '../src/services/agentSandbox.js';

const native = process.platform === 'win32' && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
function completion(child) {
  let output = '', error = '';
  child.stdout.on('data', (b) => output += b);
  child.stderr.on('data', (b) => error += b);
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output, error }));
  });
  child.stdin.end();
  return done;
}

test('Windows LPAC denies host files, links, live project, loopback and descendants; revokes grants', { skip: !native, timeout: 30000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-win-isolation-'));
  const workspace = path.join(root, 'work'), home = path.join(root, 'home');
  const live = path.join(root, 'live'), outside = path.join(root, 'personal.txt');
  const publicFile = path.join(root, 'public.txt');
  const server = createServer((socket) => socket.end('host authority'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fs.mkdir(workspace); await fs.mkdir(home); await fs.mkdir(live); await fs.mkdir(path.join(home, 'tmp'));
    await fs.writeFile(outside, 'private'); await fs.writeFile(path.join(live, 'main.tex'), 'live');
    await fs.writeFile(publicFile, 'world-readable host file');
    execFileSync(path.join(process.env.SystemRoot, 'System32', 'icacls.exe'), [publicFile, '/grant', '*S-1-1-0:F'], { windowsHide: true });
    await fs.writeFile(path.join(workspace, '.env'), 'secret');
    await fs.mkdir(path.join(workspace, '.spectrum')); await fs.writeFile(path.join(workspace, '.spectrum', 'identity'), 'private');
    await fs.link(outside, path.join(workspace, 'hardlink'));
    await fs.symlink(live, path.join(workspace, 'junction'), 'junction');
    const denied = [outside, publicFile, path.join(live, 'main.tex'), path.join(workspace, 'junction', 'main.tex'), '.env', '.spectrum/identity'];
    const script = `
      const fs=require('node:fs'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
      fs.writeFileSync('allowed.txt','yes');
      for(const file of ${JSON.stringify(denied)}) {
        assert.throws(()=>fs.readFileSync(file),file+' read');
        assert.throws(()=>fs.writeFileSync(file,'changed'),file+' write');
      }
      // A hardlink does not create a grant on an unrelated existing inode.
      assert.throws(()=>fs.readFileSync('hardlink'));
      assert.throws(()=>fs.writeFileSync(${JSON.stringify(path.join(root, 'new.txt'))},'no'));
      try {fs.symlinkSync(${JSON.stringify(live)},'escape','junction')} catch(e) {assert.ok(['EPERM','EACCES'].includes(e.code),e.message)}
      assert.throws(()=>fs.readFileSync('escape/main.tex'));
      const nested=spawnSync(process.execPath,['-e',${JSON.stringify(`const fs=require('fs');try{fs.readFileSync(${JSON.stringify(outside)});process.exit(7)}catch{};try{fs.writeFileSync(${JSON.stringify(outside)},'bad');process.exit(8)}catch{};console.log('child-contained')`)}],{stdio:'inherit',windowsHide:true,timeout:5000});
      assert.equal(nested.status,0);
      const net=require('node:net'),socket=net.connect(${server.address().port},'127.0.0.1');
      socket.on('connect',()=>process.exit(9));socket.on('error',()=>console.log('contained'));
      setTimeout(()=>process.exit(10),4000).unref();
    `;
    // A hardlink in a writable grant would add permissions to its external inode.
    // The worker must reject this workspace before granting anything.
    const linked = await completion(await spawnAgentProcess({ command: process.execPath, args: ['-e', script], workspace, home, forbiddenRoots: [live] }));
    assert.notEqual(linked.code, 0, 'hardlinked workspace must be refused');
    await fs.unlink(path.join(workspace, 'hardlink'));
    await fs.unlink(path.join(workspace, 'junction'));
    const result = await completion(await spawnAgentProcess({ command: process.execPath, args: ['-e', script.replace("assert.throws(()=>fs.readFileSync('hardlink'));", '')], workspace, home, forbiddenRoots: [live] }));
    assert.equal(result.code, 0, result.error); assert.match(result.output, /child-contained/); assert.match(result.output, /\ncontained/);
    assert.equal(await fs.readFile(outside, 'utf8'), 'private');
    assert.equal(await fs.readFile(path.join(live, 'main.tex'), 'utf8'), 'live');
    assert.equal(await fs.readFile(path.join(workspace, 'allowed.txt'), 'utf8'), 'yes');
    const acls = execFileSync(path.join(process.env.SystemRoot, 'System32', 'icacls.exe'), [workspace, '/T', '/L'], { encoding: 'utf8', windowsHide: true });
    assert.doesNotMatch(acls, /S-1-15-2-\d+-\d+-\d+-/, 'temporary package grants must be removed');
    await assert.rejects(spawnAgentProcess({ command: process.execPath, workspace, home, runtimePaths: [os.homedir()] }), /specific runtime/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Windows cancellation kills background descendants and preserves ordinary project access', { skip: !native, timeout: 15000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-win-cancel-'));
  const workspace = path.join(root, 'work'), home = path.join(root, 'home');
  await fs.mkdir(workspace); await fs.mkdir(home); await fs.mkdir(path.join(home, 'tmp'));
  // the descendant is an ordinary child left running, not a detached one: isolation refuses a detached child (spawn
  // EPERM, as it may not make a process group of its own), and the job object holds the ordinary one all the same.
  // It inherits the agent's stdio: ignored stdio is opened on NUL, which the AppContainer seems unable to open (spawn EPERM),
  // and new pipes stall (docs/WINDOWS_AGENT_VALIDATION.md)
  const script = `const {spawn}=require('child_process');const child=spawn(process.execPath,['-e',"setInterval(()=>require('fs').appendFileSync('heartbeat','x'),20)"],{stdio:'inherit'});child.unref();console.log('ready');setInterval(()=>{},1000);`;
  try {
    const child = await spawnAgentProcess({ command: process.execPath, args: ['-e', script], workspace, home });
    const done = completion(child);
    await Promise.race([new Promise((resolve) => child.stdout.once('data', resolve)), done.then((r) => { throw new Error(r.error || 'Agent exited before ready.'); })]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    killAgentProcess(child);
    const result = await done; assert.equal(result.code, 130, result.error);
    const heartbeat = path.join(workspace, 'heartbeat'), before = await fs.readFile(heartbeat, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await fs.readFile(heartbeat, 'utf8'), before);
    await fs.writeFile(path.join(workspace, 'after.txt'), 'ordinary user can write');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

// Probes for docs/WINDOWS_AGENT_CHECKS.md: what decides whether the Node adapters and Spectrum's tools server can run in
// Windows isolation. Marked todo, so a stall is reported, not failed; the owner sends back each one's lines.
async function probe(t, options, wanted) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-win-probe-'));
  const workspace = path.join(root, 'work'), home = path.join(root, 'home');
  await fs.mkdir(workspace); await fs.mkdir(home); await fs.mkdir(path.join(home, 'tmp'));
  try {
    await options.prepare?.(workspace);
    const child = await spawnAgentProcess({ workspace, home, ...options });
    const done = completion(child);
    const timer = setTimeout(() => killAgentProcess(child), 10000);
    const result = await done.finally(() => clearTimeout(timer));
    t.diagnostic(`exit ${result.code}; out: ${JSON.stringify(result.output)}; err: ${JSON.stringify(result.error.slice(-800))}`);
    assert.match(result.output, wanted, 'stalled or failed (exit 130 is the 10 second stop)');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('Windows probe: a Node program in isolation starts a child with new pipes (the adapters’ way)', { skip: !native, todo: 'stalled in 2.0 (docs/WINDOWS_AGENT_VALIDATION.md)', timeout: 30000 }, async (t) => {
  // which pipe names isolation lets Node make (an AppContainer's own are under LOCAL), then the spawn itself
  const script = `const net=require('node:net');
    const make=(name)=>new Promise((res)=>{const s=net.createServer();s.once('error',(e)=>res(e.code));s.listen(name,()=>s.close(()=>res('ok')));});
    (async()=>{
      console.log('global-pipe '+await make('\\\\\\\\.\\\\pipe\\\\spectrum-probe-'+process.pid));
      console.log('local-pipe '+await make('\\\\\\\\.\\\\pipe\\\\LOCAL\\\\spectrum-probe-'+process.pid));
      console.log('spawning');
      const c=require('node:child_process').spawn(process.execPath,['-e','process.stdin.pipe(process.stdout)'],{stdio:['pipe','pipe','inherit']});
      console.log('spawned');
      c.stdout.on('data',(d)=>{console.log('echoed '+d);process.exit(0);});
      c.stdin.end('ping');
    })();`;
  await probe(t, { command: process.execPath, args: ['-e', script] }, /echoed ping/);
});

test('Windows probe: a native program in isolation feeds a Node child through a pipe (the tools server’s way, under a native agent)', { skip: !native, todo: 'not yet seen on Windows', timeout: 30000 }, async (t) => {
  // cmd's | is an anonymous pipe, as most native programs make; Node only reads it
  const node = process.execPath;
  await probe(t, {
    command: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), args: ['/d', '/c', 'probe.cmd'], runtimePaths: [node],
    prepare: (workspace) => fs.writeFile(path.join(workspace, 'probe.cmd'), `@echo ping| "${node}" --preserve-symlinks --preserve-symlinks-main -e "process.stdin.pipe(process.stdout)"\r\n`)
  }, /ping/);
});

// Windows' rules, run on any system with process.platform as Windows reports it
const asWindows = async (fn) => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  try { return await fn(); } finally { Object.defineProperty(process, 'platform', platform); }
};

test('on Windows, short names, streams and names Windows trims count as hidden ones', async () => {
  const { agentHidden } = await import('../src/utils/pathUtils.js');
  const hidden = ['GIT~1/config', 'SPECTR~1/chats/c.json', 'CLAUDE~1', 'ENV~1', '.env::$DATA', 'main.tex:secret', '.git./config', '.env ', 'sub\\.git\\config'];
  const shown = ['main.tex', 'figures/fig~a.png', 'notes~.tex', 'chapter 1/intro.tex'];
  await asWindows(() => {
    for (const rel of hidden) assert.equal(agentHidden(rel), true, rel);
    for (const rel of shown) assert.equal(agentHidden(rel), false, rel);
  });
  if (process.platform !== 'win32') for (const rel of ['GIT~1/config', 'a:b.tex', 'notes.']) assert.equal(agentHidden(rel), false, `${rel}, elsewhere`);
});

test('on Windows, a name finds npm’s .cmd shim, never the extensionless one beside it', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-win-shim-')));
  try {
    for (const name of ['gemini', 'gemini.cmd']) await fs.writeFile(path.join(dir, name), '', { mode: 0o755 });
    assert.equal(await asWindows(() => resolveExecutable('gemini', dir)), path.join(dir, 'gemini.cmd'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('on Windows, a direct session is refused, as isolation there can’t keep the agent from making .git or .env', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-win-direct-')));
  Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects') });
  try {
    const { newAgentRun } = await import('../src/services/agentSessionService.js');
    await asWindows(() => assert.rejects(newAgentRun({ projectId: 'any', agentId: 'qoder', mode: 'direct' }), /Direct editing isn’t available on Windows/));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
