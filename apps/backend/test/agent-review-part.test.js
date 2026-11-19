import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const native = ['darwin', 'win32'].includes(process.platform) && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
const hasTeX = (() => { try { execFileSync('kpsewhich', ['article.cls'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const fixture = fileURLToPath(new URL('./fixtures/acp-draft-agent.mjs', import.meta.url));
const lines = (edit = {}) => Array.from({ length: 6 }, (_, i) => `${edit[i + 1] ?? `line ${i + 1}`}\n`).join('');

test('a change settled in part: the chosen text is written, the rest stays to review, and the agent is told', { skip: !native && 'Requires native macOS or Windows sandbox execution.', timeout: 120000 }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-part-')));
  Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects'), SPECTRUM_SKILLS_SEED_DIR: path.join(dir, 'no-skills') });
  const { createProject } = await import('../src/services/projectService.js');
  const { saveAgentConfig } = await import('../src/services/agentProfiles.js');
  const { listVersions } = await import('../src/services/versionService.js');
  const { captureAgentProposal } = await import('../src/services/agentWorkspace.js');
  const { newAgentRun, getAgentRun, reviewAgentChanges, pendingChanges, shutdownAgents } = await import('../src/services/agentSessionService.js');
  try {
    const project = await createProject({ name: 'Part fixture' });
    const file = path.join(project.path, 'main.tex');
    await fs.writeFile(file, lines());
    await saveAgentConfig('qoder', { command: process.execPath, args: [fixture], runtimePaths: [path.dirname(fixture)] });
    const run = await getAgentRun((await newAgentRun({ projectId: project.id, agentId: 'qoder' })).id);
    await run.ready;
    // the agent's change, put in its copy as a turn would leave it: two separate lines
    const proposal = lines({ 2: 'agent 2', 5: 'agent 5' });
    await fs.writeFile(path.join(run.workspace, 'main.tex'), proposal);
    await captureAgentProposal(run);
    let [change] = await pendingChanges(run);
    assert.equal(change.proposed, proposal);
    assert.equal(change.currentHash, change.beforeHash, 'the project’s file is still what the agent started from');
    assert.equal('current' in change, false);
    const part = (body) => reviewAgentChanges(run, { action: 'part', path: 'main.tex', expected: change.afterHash, current: change.currentHash, ...body });

    // the first of the two applied: the file holds it alone, and the other is what is left
    const first = lines({ 2: 'agent 2' });
    const versions = (await listVersions(project.path)).length;
    [change] = await part({ content: first, original: first, proposed: proposal });
    assert.equal(await fs.readFile(file, 'utf8'), first);
    assert.deepEqual([change.original, change.proposed], [first, proposal], 'the rest is measured from the file as written');
    assert.equal((await listVersions(project.path)).length, versions + 1, 'a checkpoint was saved before the write');
    assert.match(run.notes.join('\n'), /applied part of your changes to “main.tex”.*still waits/);

    // the user edits the same line the agent changed: the review gets their file, and a stale answer is refused
    const mine = lines({ 2: 'agent 2', 5: 'mine 5' });
    await fs.writeFile(file, mine);
    const stale = change;
    [change] = await pendingChanges(run);
    assert.equal(change.current, mine);
    await assert.rejects(reviewAgentChanges(run, { action: 'part', path: 'main.tex', expected: stale.afterHash, current: stale.currentHash, content: proposal, original: proposal, proposed: proposal }), /changed in your project while you were reviewing/);
    assert.equal(await fs.readFile(file, 'utf8'), mine, 'the user’s file was left as it was');
    await assert.rejects(part({ content: proposal, original: proposal, proposed: proposal, expected: 'not-the-proposal' }), /changed after the review opened/);
    await assert.rejects(part({ content: 7, original: proposal, proposed: proposal }), /Choose the text/);

    // both lines kept, the user's first: written, nothing left, and the agent's copy holds the same
    const both = lines({ 2: 'agent 2', 5: 'mine 5\nagent 5' });
    assert.deepEqual(await part({ content: both, original: both, proposed: both }), []);
    assert.equal(await fs.readFile(file, 'utf8'), both);
    assert.equal(await fs.readFile(path.join(run.workspace, 'main.tex'), 'utf8'), both);
    assert.match(run.notes.join('\n'), /the file as it is in their project/);

    // a part rejected: nothing is written to the project, and the agent's copy loses it
    const again = lines({ 1: 'agent 1', 2: 'agent 2', 5: 'mine 5\nagent 5', 6: 'agent 6' });
    await fs.writeFile(path.join(run.workspace, 'main.tex'), again);
    await captureAgentProposal(run);
    [change] = await pendingChanges(run);
    const kept = again.replace('agent 6', 'line 6');
    const notes = run.notes.length;
    [change] = await part({ original: both, proposed: kept });
    assert.equal(await fs.readFile(file, 'utf8'), both);
    assert.deepEqual([change.original, change.proposed], [both, kept]);
    assert.equal(await fs.readFile(path.join(run.workspace, 'main.tex'), 'utf8'), kept);
    assert.match(run.notes.at(-1), /rejected part of your changes/);
    // the same said once however many parts are settled
    await part({ original: both, proposed: kept });
    assert.equal(run.notes.length, notes + 1);
  } finally { await shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('a project’s review is previewed on a copy with the proposed files, inside isolation, the project untouched', { skip: (!native && 'Requires native macOS or Windows sandbox execution.') || (!hasTeX && 'Needs a TeX installation.'), timeout: 300000 }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-review-preview-')));
  Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects'), SPECTRUM_SKILLS_SEED_DIR: path.join(dir, 'no-skills') });
  const { createProject } = await import('../src/services/projectService.js');
  const { previewProposal, shutdownAgents } = await import('../src/services/agentSessionService.js');
  try {
    const secret = path.join(dir, 'outside', 'secret.tex').split(path.sep).join('/');
    await fs.mkdir(path.dirname(secret), { recursive: true });
    await fs.writeFile(secret, '\\typeout{SECRET-READ}Outside the project.');
    const project = await createProject({ name: 'Review preview' });
    const doc = (body) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\IfFileExists{${secret}}{\\input{${secret}}}{\\typeout{SECRET-HIDDEN}}\n\\end{document}\n`;
    await fs.writeFile(path.join(project.path, 'main.tex'), doc('\\typeout{IS-BEFORE}Before. \\input{part}'));
    await fs.writeFile(path.join(project.path, 'part.tex'), 'A part.\n');
    const files = (await fs.readdir(project.path, { recursive: true })).sort();

    // both at once: one waits for the other, and each compiles its own copy
    const [before, after] = await Promise.all([
      previewProposal(project.id, { which: 'before', engine: 'pdflatex' }),
      previewProposal(project.id, { engine: 'pdflatex', files: [{ path: 'main.tex', content: doc('\\typeout{IS-AFTER}After.') }, { path: 'part.tex', content: null }, { path: 'new/added.tex', content: 'New.\n' }] })
    ]);
    for (const preview of [before, after]) {
      assert.equal(preview.ok, true, preview.log);
      assert.equal(Buffer.from(preview.pdf, 'base64').subarray(0, 5).toString(), '%PDF-');
      // on Windows TeX is told to read only below the copy; macOS's isolation keeps it there
      assert.doesNotMatch(preview.log, /SECRET-READ/, 'TeX could not read the file outside the copy');
      assert.match(preview.log, /SECRET-HIDDEN/);
    }
    assert.match(before.log, /IS-BEFORE/);
    assert.match(after.log, /IS-AFTER/);
    assert.deepEqual((await fs.readdir(project.path, { recursive: true })).sort(), files, 'nothing was written into the project');
    assert.match(await fs.readFile(path.join(project.path, 'main.tex'), 'utf8'), /IS-BEFORE/);

    await assert.rejects(previewProposal(project.id, { files: [{ path: '../escape.tex', content: 'x' }] }), /Invalid path/);
    await assert.rejects(previewProposal(project.id, { files: [{ path: 'main.tex' }] }), { statusCode: 400 });
    await assert.rejects(previewProposal(project.id, { engine: 'troff' }), /Unsupported engine/);
  } finally { await shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); }
});
