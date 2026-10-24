import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
    const run = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-copy-'));
    try {
      const workspace = await initialiseWorkspace(dir, run, 'review');
      await assert.rejects(fs.stat(path.join(workspace, '.env')), { code: 'ENOENT' });
      await assert.rejects(fs.stat(path.join(workspace, '.ENV.local')), { code: 'ENOENT' });
      await assert.rejects(fs.stat(path.join(workspace, '.spectrum')), { code: 'ENOENT' });
      await fs.symlink(path.join(dir, 'main.tex'), path.join(dir, 'alias.tex'));
      await assert.rejects(initialiseWorkspace(dir, path.join(run, 'bad'), 'review'), /symbolic link|reparse point/);
    } finally { await fs.rm(run, { recursive: true, force: true }); }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
