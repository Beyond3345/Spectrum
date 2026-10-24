import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import readline from 'node:readline';
import { spawnAgentProcess, killAgentProcess } from './agentSandbox.js';
import { safeJoin } from '../utils/pathUtils.js';
import { HIDDEN_ENTRIES, writeFileAtomic, writeJsonAtomic } from '../utils/fsUtils.js';
import { mergeText } from '../utils/merge3.js';
import { createVersion } from './versionService.js';

const MAX_FILE = 50 * 1024 * 1024;
const MAX_PROJECT = 500 * 1024 * 1024;
const MAX_FILES = 10000;
export const fileHash = (buf) => buf === null ? null : crypto.createHash('sha256').update(buf).digest('hex');
const binary = (buf) => buf !== null && (buf.subarray(0, 8000).includes(0) || !Buffer.from(buf.toString('utf8')).equals(buf));

// This fixed reader runs in a separate sandbox; a concurrently swapped link cannot expose host files.
async function collectWorkspace(root, excluded, maxFile, maxProject, maxFiles) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { constants } = await import('node:fs');
  let total = 0, count = 0;
  const walk = async (dir, prefix = '') => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (excluded.includes(entry.name.toLowerCase()) || /^\.env(?:\.|$)|\.(pem|key)$/i.test(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(root, rel);
      const stat = await fs.lstat(abs);
      if (stat.isSymbolicLink()) throw new Error(`“${rel}” is a symbolic link. Agent workspaces require ordinary files and folders.`);
      if (stat.isDirectory()) await walk(abs, rel);
      else if (stat.isFile()) {
        const handle = await fs.open(abs, constants.O_RDONLY | constants.O_NOFOLLOW);
        let bytes;
        try {
          const opened = await handle.stat();
          if (!opened.isFile() || opened.nlink !== 1) throw new Error(`“${rel}” is hard-linked or not an ordinary file.`);
          if (opened.size > maxFile) throw new Error(`“${rel}” exceeds the 50 MB recoverable-file limit.`);
          bytes = await handle.readFile();
        } finally { await handle.close(); }
        if (bytes.length > maxFile) throw new Error(`“${rel}” grew beyond the file limit while being read.`);
        total += bytes.length;
        if (total > maxProject || ++count > maxFiles) throw new Error('This project exceeds the agent workspace limit (500 MB or 10,000 files).');
        const line = JSON.stringify([rel, bytes.toString('base64')]) + '\n';
        if (!process.stdout.write(line)) await new Promise((resolve) => process.stdout.once('drain', resolve));
      } else throw new Error(`“${rel}” is not an ordinary file.`);
    }
  };
  await walk(root);
}

export async function workspaceFiles(root) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-workspace-reader-')));
  let child, timer;
  try {
    const excluded = [...HIDDEN_ENTRIES, 'node_modules', '.claude', '.DS_Store'].map((name) => name.toLowerCase());
    const script = `(${collectWorkspace.toString()})(process.argv[1], ${JSON.stringify(excluded)}, ${MAX_FILE}, ${MAX_PROJECT}, ${MAX_FILES}).catch(e=>{console.error(e.message);process.exitCode=1;})`;
    child = await spawnAgentProcess({ command: process.execPath, args: ['-e', script, root], workspace: root, home });
    let error = '', timedOut = false;
    child.stderr.on('data', (chunk) => { error = (error + chunk).slice(-4000); });
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    timer = setTimeout(() => { timedOut = true; killAgentProcess(child); }, 30000);
    child.stdin.end();
    const files = Object.create(null);
    for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      const [rel, bytes] = JSON.parse(line);
      safeJoin(root, rel);
      files[rel] = Buffer.from(bytes, 'base64');
    }
    const code = await done;
    if (code !== 0 || timedOut) throw new Error(timedOut ? 'The isolated workspace reader timed out.' : error.trim() || 'The isolated workspace reader failed.');
    return files;
  } finally { clearTimeout(timer); killAgentProcess(child); await fs.rm(home, { recursive: true, force: true }); }
}

export async function initialiseWorkspace(root, runDir, mode) {
  const files = await workspaceFiles(root);
  const baseDir = path.join(runDir, 'baseline');
  const workspace = mode === 'direct' ? root : path.join(runDir, 'work');
  await fs.mkdir(baseDir, { recursive: true, mode: 0o700 });
  if (mode !== 'direct') await fs.mkdir(workspace, { recursive: true, mode: 0o700 });
  for (const [rel, bytes] of Object.entries(files)) {
    await writeFileAtomic(safeJoin(baseDir, rel), bytes);
    if (mode !== 'direct') await writeFileAtomic(safeJoin(workspace, rel), bytes);
  }
  await writeJsonAtomic(path.join(runDir, 'baseline.json'), Object.fromEntries(Object.entries(files).map(([rel, bytes]) => [rel, fileHash(bytes)])));
  if (mode === 'direct') {
    const version = await createVersion(root, { reason: 'before-ai', label: 'Before agent direct editing' });
    if (version.version?.skipped?.length) throw new Error('The complete project could not be backed up. Direct editing was not started.');
  }
  return fs.realpath(workspace);
}

export async function workspaceChanges(run) {
  const before = Object.assign(Object.create(null), JSON.parse(await fs.readFile(path.join(run.dir, 'baseline.json'), 'utf8')));
  let after, manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(run.dir, 'proposal.json'), 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
  if (!manifest) return [];
  after = Object.create(null);
  for (const [rel, hash] of Object.entries(manifest)) {
    after[rel] = await fs.readFile(safeJoin(path.join(run.dir, 'proposal'), rel));
    if (fileHash(after[rel]) !== hash) throw new Error(`The saved proposal for “${rel}” is damaged. Nothing was applied.`);
  }
  const changes = [];
  for (const rel of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const bytes = after[rel] ?? null;
    const nextHash = fileHash(bytes);
    if ((before[rel] ?? null) === nextHash) continue;
    const original = before[rel] ? await fs.readFile(safeJoin(path.join(run.dir, 'baseline'), rel)) : null;
    const isBinary = binary(original) || binary(bytes);
    changes.push({ path: rel, kind: original === null ? 'created' : bytes === null ? 'deleted' : 'modified', binary: isBinary, beforeHash: before[rel] ?? null, afterHash: nextHash, size: bytes?.length || 0,
      ...(!isBinary && { original: original?.toString('utf8') || '', proposed: bytes?.toString('utf8') || '' }) });
  }
  return changes;
}

export async function captureAgentProposal(run) {
  const files = await workspaceFiles(run.workspace);
  const target = path.join(run.dir, 'proposal');
  await fs.mkdir(target, { recursive: true, mode: 0o700 });
  for (const [rel, bytes] of Object.entries(files)) await writeFileAtomic(safeJoin(target, rel), bytes);
  await writeJsonAtomic(path.join(run.dir, 'proposal.json'), Object.fromEntries(Object.entries(files).map(([rel, bytes]) => [rel, fileHash(bytes)])));
}

export async function readCurrent(root, rel) {
  const abs = safeJoin(root, rel);
  try {
    const stat = await fs.lstat(abs);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_FILE) throw new Error(`“${rel}” cannot safely be replaced.`);
    return await fs.readFile(abs);
  } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}

export async function applyWorkspaceChanges(run, selected, expected) {
  if (run.mode !== 'review' || run.busy) throw new Error('Finish the review run before applying changes.');
  const changes = await workspaceChanges(run);
  if (!Array.isArray(selected) || !selected.length || selected.some((rel) => !changes.some((c) => c.path === rel))) throw new Error('Choose changes from this run.');
  if (new Set(selected).size !== selected.length) throw new Error('Duplicate change paths.');
  const writes = [];
  for (const rel of selected) {
    const change = changes.find((c) => c.path === rel);
    if (expected?.[rel] !== change.afterHash) throw new Error(`“${rel}” changed after the review opened. Refresh and review it again.`);
    const current = await readCurrent(run.root, rel);
    let proposed = change.afterHash === null ? null : await fs.readFile(safeJoin(path.join(run.dir, 'proposal'), rel));
    if (fileHash(proposed) !== change.afterHash) throw new Error(`The saved proposal for “${rel}” is damaged. Nothing was applied.`);
    if (fileHash(current) !== change.beforeHash) {
      if (current === null || proposed === null || change.beforeHash === null) throw new Error(`“${rel}” changed in your project. Review the conflict before applying.`);
      const original = await fs.readFile(safeJoin(path.join(run.dir, 'baseline'), rel));
      proposed = mergeText(original, current, proposed);
      if (proposed === null) throw new Error(`“${rel}” has overlapping or binary changes. Keep your work and review this conflict separately.`);
    }
    writes.push({ rel, before: current, after: proposed, merged: fileHash(proposed) !== change.afterHash });
  }
  // A durable, complete backup is independent of the version service's skipped-file policy.
  const transaction = path.join(run.dir, `apply-${crypto.randomUUID()}`);
  await fs.mkdir(transaction, { mode: 0o700 });
  const journal = { state: 'prepared', files: writes.map(({ rel, before, after }) => ({ path: rel, before: fileHash(before), after: fileHash(after), applied: false })) };
  for (const { rel, before, after } of writes) {
    if (before !== null) await writeFileAtomic(safeJoin(path.join(transaction, 'before'), rel), before);
    if (after !== null) await writeFileAtomic(safeJoin(path.join(transaction, 'after'), rel), after);
  }
  await writeJsonAtomic(path.join(transaction, 'journal.json'), journal);
  await createVersion(run.root, { reason: 'before-ai', label: 'Before applying agent changes' });
  try {
    for (let i = 0; i < writes.length; i++) {
      const { rel, before, after } = writes[i];
      if (fileHash(await readCurrent(run.root, rel)) !== fileHash(before)) throw new Error(`“${rel}” changed while applying. Your newer work was preserved.`);
      const target = safeJoin(run.root, rel);
      if (after === null) await fs.unlink(target);
      else await writeFileAtomic(target, after);
      journal.files[i].applied = true;
      await writeJsonAtomic(path.join(transaction, 'journal.json'), journal);
    }
    journal.state = 'complete';
    await writeJsonAtomic(path.join(transaction, 'journal.json'), journal);
  } catch (err) {
    journal.state = 'partial';
    await writeJsonAtomic(path.join(transaction, 'journal.json'), journal);
    throw new Error(`${err.message} Recovery copies are saved in ${transaction}.`);
  }
  // what each file now holds, which may be the proposal merged with the user's own edits
  return writes.map(({ rel, after, merged }) => ({ path: rel, bytes: after, merged }));
}

/**
 * bytes (null: no file) become rel's baseline and proposal once the user applied or rejected its change, so the change
 * shows no more and the agent's next one to the file is measured from there. writeDraft puts them in the agent's copy
 * first, when they differ from what it holds; only isolation may write there.
 */
export async function rebaseChange(run, rel, bytes, writeDraft) {
  const manifest = async (name) => Object.assign(Object.create(null), JSON.parse(await fs.readFile(path.join(run.dir, name), 'utf8')));
  const proposal = await manifest('proposal.json');
  if ((proposal[rel] ?? null) !== fileHash(bytes)) await writeDraft(bytes);
  for (const folder of ['proposal', 'baseline']) {
    const file = safeJoin(path.join(run.dir, folder), rel);
    if (bytes === null) await fs.rm(file, { force: true });
    else await writeFileAtomic(file, bytes);
    const hashes = await manifest(`${folder}.json`);
    if (bytes === null) delete hashes[rel];
    else hashes[rel] = fileHash(bytes);
    await writeJsonAtomic(path.join(run.dir, `${folder}.json`), hashes);
  }
}

export async function agentRecoveries(run) {
  const found = [];
  for (const id of await fs.readdir(run.dir)) {
    if (!/^apply-[a-f0-9-]{36}$/.test(id)) continue;
    const journal = JSON.parse(await fs.readFile(path.join(run.dir, id, 'journal.json'), 'utf8'));
    if (!['complete', 'recovered'].includes(journal.state)) found.push({ id, files: journal.files.map((f) => f.path) });
  }
  return found;
}

export async function recoverAgentApply(run, id) {
  if (!/^apply-[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid recovery id.');
  const transaction = path.join(run.dir, id);
  const journal = JSON.parse(await fs.readFile(path.join(transaction, 'journal.json'), 'utf8'));
  if (journal.state === 'complete' || journal.state === 'recovered') throw new Error('This application does not need recovery.');
  const restore = [];
  for (const file of journal.files) {
    const current = await readCurrent(run.root, file.path);
    if (fileHash(current) === file.before) continue;
    if (fileHash(current) !== file.after) throw new Error(`“${file.path}” has newer changes. Recovery will not overwrite them.`);
    const before = file.before === null ? null : await fs.readFile(safeJoin(path.join(transaction, 'before'), file.path));
    if (fileHash(before) !== file.before) throw new Error('A recovery copy is damaged. Nothing was restored.');
    restore.push({ path: file.path, before, current });
  }
  for (const item of restore.reverse()) {
    if (fileHash(await readCurrent(run.root, item.path)) !== fileHash(item.current)) throw new Error(`“${item.path}” changed during recovery. Your newer work was kept.`);
    const target = safeJoin(run.root, item.path);
    if (item.before === null) await fs.unlink(target);
    else await writeFileAtomic(target, item.before);
  }
  journal.state = 'recovered';
  await writeJsonAtomic(path.join(transaction, 'journal.json'), journal);
}
