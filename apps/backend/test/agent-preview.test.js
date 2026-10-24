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

test('the draft’s preview PDF is compiled where TeX reads only the draft, into the cache, never into the draft', { skip: (!native && 'Requires native macOS or Windows sandbox execution.') || (!hasTeX && 'Needs a TeX installation.'), timeout: 180000 }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-preview-')));
  Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects'), SPECTRUM_SKILLS_SEED_DIR: path.join(dir, 'no-skills') });
  const { createProject } = await import('../src/services/projectService.js');
  const { saveAgentConfig } = await import('../src/services/agentProfiles.js');
  const { newAgentRun, getAgentRun, promptAgent, previewDraft, shutdownAgents } = await import('../src/services/agentSessionService.js');
  try {
    const secret = path.join(dir, 'outside', 'secret.tex').split(path.sep).join('/');
    await fs.mkdir(path.dirname(secret), { recursive: true });
    await fs.writeFile(secret, '\\typeout{SECRET-READ}Outside the draft.');
    const project = await createProject({ name: 'Preview fixture' });
    await fs.writeFile(path.join(project.path, 'main.tex'), `\\documentclass{article}\n\\begin{document}\nThe draft.\n\\IfFileExists{${secret}}{\\input{${secret}}}{\\typeout{SECRET-HIDDEN}}\n\\immediate\\write18{echo WRITE18-RAN}\n\\end{document}\n`);
    await saveAgentConfig('qoder', { command: process.execPath, args: [fixture], runtimePaths: [path.dirname(fixture)] });
    const run = await getAgentRun((await newAgentRun({ projectId: project.id, agentId: 'qoder' })).id);
    await run.ready;
    await promptAgent(run, 'draft one');
    await run.task;
    const before = (await fs.readdir(run.workspace, { recursive: true })).sort();

    // outside isolation the same compile reads the file, so the check below means something
    const { compile } = await import('../src/mcp/tools.js');
    const state = path.join(dir, 'unconfined');
    await fs.mkdir(state);
    await compile(run.workspace, state, { main: 'main.tex', engine: 'pdflatex' });
    assert.match(await fs.readFile(path.join(state, 'last.log'), 'utf8'), /SECRET-READ/);
    await fs.rm(path.join(dir, 'unconfined'), { recursive: true });
    const before2 = (await fs.readdir(run.workspace, { recursive: true })).sort();
    assert.deepEqual(before2, before);

    const preview = await previewDraft(run);
    assert.ok(preview.pdf, preview.log);
    assert.equal(Buffer.from(preview.pdf, 'base64').subarray(0, 5).toString(), '%PDF-');
    assert.equal(preview.ok, true, preview.log);
    assert.doesNotMatch(preview.log, /SECRET-READ/, 'TeX could not read the file outside the draft');
    assert.match(preview.log, /SECRET-HIDDEN/);
    // on Windows nothing but TeX runs, not even restricted shell escape (macOS's isolation contains what it runs)
    if (process.platform === 'win32') assert.doesNotMatch(preview.log, /write18 enabled|WRITE18-RAN\r?\n/);
    assert.deepEqual((await fs.readdir(run.workspace, { recursive: true })).sort(), before, 'nothing was written into the draft');
    await assert.rejects(previewDraft(run, { mainFile: '../escape.tex' }), /Invalid path/);
    await assert.rejects(previewDraft(run, { engine: 'troff' }), /Unsupported engine/);

    // a direct session's draft is the project itself
    const direct = await getAgentRun((await newAgentRun({ projectId: (await createProject({ name: 'Direct preview' })).id, agentId: 'qoder', mode: 'direct' })).id);
    await direct.ready;
    await assert.rejects(previewDraft(direct), { statusCode: 409 });
  } finally { await shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); }
});
