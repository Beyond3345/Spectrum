import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const native = ['darwin', 'win32'].includes(process.platform) && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
const fixture = fileURLToPath(new URL('./fixtures/acp-tools-agent.mjs', import.meta.url));
const hasTeX = (() => { try { execFileSync('kpsewhich', ['article.cls'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('a local agent on macOS gets Spectrum’s tools, which run inside its isolation and suggest to-dos', { skip: !native && 'Requires native macOS or Windows sandbox execution.', timeout: 120000 }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-tools-')));
  Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects') });
  const { createProject } = await import('../src/services/projectService.js');
  const { saveAgentConfig } = await import('../src/services/agentProfiles.js');
  const { newAgentRun, getAgentRun, promptAgent, pendingChanges, shutdownAgents } = await import('../src/services/agentSessionService.js');
  const requests = async (run) => (await fs.readFile(path.join(run.home, 'acp-log.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  try {
    const project = await createProject({ name: 'Tools fixture' });
    await fs.writeFile(path.join(project.path, 'main.tex'), '\\documentclass{article}\n\\begin{document}\n\\section{Method}\\label{sec:m}\nSee \\ref{sec:m} and \\cite{missing}.\n\\end{document}\n');
    await fs.mkdir(path.join(project.path, '.spectrum', 'todos'), { recursive: true });
    await fs.writeFile(path.join(project.path, '.spectrum', 'todos', 't.json'), JSON.stringify({ id: 't', text: 'Write the method', done: false, createdAt: '1', updatedAt: '1' }));
    await saveAgentConfig('qoder', { command: process.execPath, args: [fixture], runtimePaths: [path.dirname(fixture)] });
    const run = await getAgentRun((await newAgentRun({ projectId: project.id, agentId: 'qoder' })).id);
    await run.ready;
    await promptAgent(run, hasTeX ? 'use the tools and compile' : 'use the tools');
    await run.task;
    assert.equal(run.status, 'completed', JSON.stringify(run.events.filter((e) => ['state', 'notice'].includes(e.type))));
    const log = await requests(run);
    const { mcpServers } = log.find((q) => q.method === 'session/new').params;
    if (process.platform === 'win32') {
      assert.deepEqual(mcpServers, [], 'Windows agents get no Spectrum tools yet');
      return;
    }
    assert.equal(mcpServers.length, 1);
    assert.equal(mcpServers[0].name, 'spectrum');
    assert.equal(mcpServers[0].command, process.execPath);
    assert.deepEqual(mcpServers[0].args.slice(1, 3), ['--root', run.workspace]);
    const { tools } = log.find((q) => q.tools);
    assert.ok(tools.results, JSON.stringify(tools));
    const answer = (name) => JSON.parse(tools.results[name].content[0].text);
    const map = answer('project_map');
    assert.equal(map.mainFile, 'main.tex');
    assert.deepEqual(map.unresolvedCites.map((c) => c.key), ['missing']);
    assert.deepEqual(answer('list_todos'), [{ text: 'Write the method' }]);
    assert.match(answer('load_skill').body, /The compile loop/, 'the bundled skills were copied into the agent’s home');
    assert.deepEqual(run.events.filter((e) => e.type === 'todo').map((e) => e.data), [{ text: 'Cite the method', link: { file: 'main.tex', line: 3 } }]);
    if (hasTeX) {
      const compiled = answer('compile');
      assert.equal(compiled.mainFile, 'main.tex', JSON.stringify(compiled));
      assert.ok(compiled.pdf.startsWith(run.home), 'the PDF is in the agent’s home');
      assert.equal((await fs.readFile(compiled.pdf)).subarray(0, 5).toString(), '%PDF-');
    }
    assert.deepEqual(await pendingChanges(run), [], 'the tools wrote nothing into the working copy');
  } finally { await shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); }
});
