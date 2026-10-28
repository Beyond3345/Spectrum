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
  const script = `const {spawn}=require('child_process');const child=spawn(process.execPath,['-e',"setInterval(()=>require('fs').appendFileSync('heartbeat','x'),20)"],{detached:true,stdio:'ignore'});child.unref();console.log('ready');setInterval(()=>{},1000);`;
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
