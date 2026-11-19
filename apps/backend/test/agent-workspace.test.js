import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SECRET_NAME, agentHiddenName, agentHiddenNameSource } from '../src/utils/pathUtils.js';
import { secretLooking } from '../src/services/gitService.js';
import { sandboxProfile } from '../src/services/agentSandbox.js';
import { initialiseWorkspace, workspaceChanges, captureAgentProposal, applyWorkspaceChanges, agentRecoveries, recoverAgentApply, rebaseChange } from '../src/services/agentWorkspace.js';

test('review snapshots preserve bytes, reject stale proposals, and protect concurrent edits', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-review-')));
  const root = path.join(dir, 'project');
  const runDir = path.join(dir, 'run');
  try {
    await fs.mkdir(root); await fs.mkdir(runDir);
    await fs.writeFile(path.join(root, 'main.tex'), 'original\n');
    await fs.writeFile(path.join(root, 'delete.txt'), 'keep until approved');
    const run = { root, dir: runDir, mode: 'review', busy: false };
    run.workspace = await initialiseWorkspace(root, runDir, 'review');
    await fs.writeFile(path.join(run.workspace, 'main.tex'), 'agent\n');
    await fs.writeFile(path.join(run.workspace, 'figure.bin'), Buffer.from([0, 255, 1]));
    await fs.unlink(path.join(run.workspace, 'delete.txt'));
    await captureAgentProposal(run);
    const changes = await workspaceChanges(run);
    assert.equal(changes.length, 3);
    assert.equal(changes.find((c) => c.path === 'figure.bin').binary, true);
    assert.equal(await fs.readFile(path.join(root, 'main.tex'), 'utf8'), 'original\n');
    await fs.writeFile(path.join(run.workspace, 'main.tex'), 'unreviewed late edit\n');
    assert.equal((await workspaceChanges(run)).find((c) => c.path === 'main.tex').proposed, 'agent\n');
    const expected = Object.fromEntries(changes.map((c) => [c.path, c.afterHash]));
    await assert.rejects(applyWorkspaceChanges(run, ['main.tex'], { 'main.tex': 'old-review' }), /changed after/);
    await fs.writeFile(path.join(root, 'main.tex'), 'new user work\n');
    await assert.rejects(applyWorkspaceChanges(run, ['main.tex'], expected), /overlapping/);
    assert.equal(await fs.readFile(path.join(root, 'main.tex'), 'utf8'), 'new user work\n');
    await applyWorkspaceChanges(run, ['figure.bin', 'delete.txt'], expected);
    assert.deepEqual(await fs.readFile(path.join(root, 'figure.bin')), Buffer.from([0, 255, 1]));
    await assert.rejects(fs.stat(path.join(root, 'delete.txt')), { code: 'ENOENT' });
    const txn = (await fs.readdir(runDir)).find((p) => p.startsWith('apply-'));
    assert.equal(await fs.readFile(path.join(runDir, txn, 'before', 'delete.txt'), 'utf8'), 'keep until approved');
    const journalPath = path.join(runDir, txn, 'journal.json');
    const journal = JSON.parse(await fs.readFile(journalPath, 'utf8'));
    journal.state = 'prepared'; // Simulate a crash after writes but before the final journal update.
    await fs.writeFile(journalPath, JSON.stringify(journal));
    assert.equal((await agentRecoveries(run)).length, 1);
    await fs.writeFile(path.join(root, 'figure.bin'), Buffer.from([0, 4]));
    await assert.rejects(recoverAgentApply(run, txn), /newer changes/);
    await fs.writeFile(path.join(root, 'figure.bin'), Buffer.from([0, 255, 1]));
    await recoverAgentApply(run, txn);
    assert.equal(await fs.readFile(path.join(root, 'delete.txt'), 'utf8'), 'keep until approved');
    await assert.rejects(fs.stat(path.join(root, 'figure.bin')), { code: 'ENOENT' });
    assert.equal((await agentRecoveries(run)).length, 0);
    await fs.writeFile(path.join(runDir, 'proposal', 'main.tex'), 'damaged proposal');
    await assert.rejects(workspaceChanges(run), /damaged/);
    await fs.unlink(path.join(runDir, 'proposal', 'main.tex'));
    await assert.rejects(workspaceChanges(run), { code: 'ENOENT' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('a change the user made too (the same file deleted, or made with the same text) applies and settles', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-same-')));
  const root = path.join(dir, 'project');
  const runDir = path.join(dir, 'run');
  try {
    await fs.mkdir(root); await fs.mkdir(runDir);
    await fs.writeFile(path.join(root, 'gone.tex'), 'bye\n');
    const run = { root, dir: runDir, mode: 'review', busy: false };
    run.workspace = await initialiseWorkspace(root, runDir, 'review');
    await fs.unlink(path.join(run.workspace, 'gone.tex'));
    await fs.writeFile(path.join(run.workspace, 'new.tex'), 'same\n');
    await captureAgentProposal(run);
    await fs.unlink(path.join(root, 'gone.tex'));
    await fs.writeFile(path.join(root, 'new.tex'), 'same\n');
    const changes = await workspaceChanges(run);
    const applied = await applyWorkspaceChanges(run, ['gone.tex', 'new.tex'], Object.fromEntries(changes.map((c) => [c.path, c.afterHash])));
    assert.deepEqual(applied.map((a) => [a.path, a.bytes?.toString() ?? null, a.merged]), [['gone.tex', null, false], ['new.tex', 'same\n', false]]);
    await assert.rejects(fs.stat(path.join(root, 'gone.tex')), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(root, 'new.tex'), 'utf8'), 'same\n');
    // the draft already holds them
    for (const { path: rel, bytes } of applied) await rebaseChange(run, rel, bytes, () => assert.fail('the draft was written'));
    assert.deepEqual(await workspaceChanges(run), []);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('workspace creation refuses links and omits secrets and app identity', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-paths-')));
  try {
    await fs.writeFile(path.join(dir, 'main.tex'), 'safe');
    await fs.writeFile(path.join(dir, '.env'), 'do not copy');
    await fs.writeFile(path.join(dir, '.ENV.local'), 'do not copy either');
    await fs.mkdir(path.join(dir, '.spectrum')); await fs.writeFile(path.join(dir, '.spectrum/project.json'), 'identity');
    // a key by a name APFS would take for id.key (with a Kelvin sign)
    await fs.writeFile(path.join(dir, 'id.Key'), 'do not copy');
    // the key and credential files the GitHub backup leaves out, by the same list
    for (const name of ['id_rsa', 'ID_ED25519', '.netrc', '.npmrc', '.pypirc', 'cert.p12', 'Store.JKS', 'putty.ppk']) await fs.writeFile(path.join(dir, name), 'do not copy');
    const run = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-copy-'));
    try {
      const workspace = await initialiseWorkspace(dir, run, 'review');
      await assert.rejects(fs.stat(path.join(workspace, '.env')), { code: 'ENOENT' });
      await assert.rejects(fs.stat(path.join(workspace, '.ENV.local')), { code: 'ENOENT' });
      await assert.rejects(fs.stat(path.join(workspace, '.spectrum')), { code: 'ENOENT' });
      assert.deepEqual(await fs.readdir(workspace), ['main.tex']);
      await fs.symlink(path.join(dir, 'main.tex'), path.join(dir, 'alias.tex'));
      await assert.rejects(initialiseWorkspace(dir, path.join(run, 'bad'), 'review'), /symbolic link|reparse point/);
    } finally { await fs.rm(run, { recursive: true, force: true }); }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('direct editing does not start when the checkpoint before it could not hold a file the agent can change', { skip: process.platform === 'win32' && 'chmod cannot make a file unreadable on Windows' }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-direct-')));
  const run = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-direct-run-'));
  try {
    await fs.writeFile(path.join(dir, 'main.tex'), 'safe');
    // the workspace reader leaves node_modules out, a checkpoint doesn't, and a direct agent can write there
    await fs.mkdir(path.join(dir, 'node_modules'));
    await fs.writeFile(path.join(dir, 'node_modules', 'locked.js'), 'x');
    await fs.chmod(path.join(dir, 'node_modules', 'locked.js'), 0);
    // nor when the same files were checkpointed already (an unchanged checkpoint reports what it left out too)
    for (const attempt of ['first', 'again']) await assert.rejects(initialiseWorkspace(dir, path.join(run, attempt), 'direct'), /node_modules\/locked\.js couldn’t be read/);
    await fs.chmod(path.join(dir, 'node_modules', 'locked.js'), 0o600);
    // a file only an agent can never reach doesn't stop it
    await fs.writeFile(path.join(dir, '.env'), 'secret');
    await fs.chmod(path.join(dir, '.env'), 0);
    assert.equal(await initialiseWorkspace(dir, path.join(run, 'ok'), 'direct'), dir);
  } finally {
    await fs.chmod(path.join(dir, '.env'), 0o600).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true }); await fs.rm(run, { recursive: true, force: true });
  }
});

test('one list says what a secret file is called, for the GitHub backup and for every way an agent reaches a file', () => {
  const secrets = ['.env', '.env.local', '.ENV', '.netrc', '.npmrc', '.pypirc', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'server.pem', 'cert.p12', 'cert.PFX', 'release.keystore', 'trust.jks', 'putty.ppk'];
  const plain = ['main.tex', 'environment.tex', 'id_rsa.pub', 'pem', 'keynote.txt', 'refs.bib', '.gitignore', 'npmrc.md'];
  for (const name of secrets) {
    assert.equal(SECRET_NAME.test(name), true, name);
    assert.equal(secretLooking(`keys/${name}`), true, name);
    // whatever the backup leaves out, no agent reads
    assert.equal(agentHiddenName(name), true, name);
  }
  for (const name of plain) {
    assert.equal(SECRET_NAME.test(name), false, name);
    assert.equal(agentHiddenName(name), false, name);
  }
  // a .key file: kept from agents whatever it holds, backed up unless it holds a key (Keynote's decks are .key too)
  assert.equal(agentHiddenName('slides.key'), true);
  assert.equal(SECRET_NAME.test('slides.key'), false);
  // the same function as text, as the isolated workspace reader and the skills copier run it
  const alone = new Function(`return ${agentHiddenNameSource}`)();
  for (const name of [...secrets, ...plain, 'slides.key', '.git', '.Spectrum', '.claude', 'id.\u212Aey']) assert.equal(alone(name), agentHiddenName(name), name);
  // and the sandbox's own rule, written from the list
  const rule = sandboxProfile({ workspace: '/w', home: '/h', executable: '/usr/bin/true' }).split('\n').find((line) => line.includes('[sS][pP][eE][cC]'));
  const pattern = new RegExp(JSON.parse(rule.match(/\(regex (".*")\)\)$/)[1]));
  for (const name of [...secrets, 'slides.key', 'ID_RSA', 'Server.PEM']) assert.equal(pattern.test(`/w/sub/${name}`), true, name);
  for (const name of plain) assert.equal(pattern.test(`/w/sub/${name}`), false, name);
});
