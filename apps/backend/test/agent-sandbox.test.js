import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { spawnAgentProcess } from '../src/services/agentSandbox.js';

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
      for (const file of ['.ENV', '.env.local', '.GIT', '.SPECTRUM', 'secret.KEY', '.Claude']) assert.throws(()=>fs.writeFileSync(file,'secret'));
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
