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

test('the agent session routes take a persona and context, preview the draft and review it', { skip: !native && 'Requires native macOS or Windows sandbox execution.', timeout: 120000 }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-routes-')));
  Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects'), SPECTRUM_SKILLS_SEED_DIR: path.join(dir, 'no-skills') });
  const { default: Fastify } = await import('fastify');
  const { registerAgentSessionRoutes } = await import('../src/routes/agentSessions.js');
  const { createProject } = await import('../src/services/projectService.js');
  const { saveAgentConfig } = await import('../src/services/agentProfiles.js');
  const { shutdownAgents } = await import('../src/services/agentSessionService.js');
  const app = Fastify();
  app.setErrorHandler(async (err, req, reply) => reply.code(err.statusCode || 500).send({ ok: false, error: err.message }));
  registerAgentSessionRoutes(app);
  const api = async (url, method = 'GET', body) => {
    const res = await app.inject({ url, method, ...(body !== undefined && { payload: body }) });
    return { status: res.statusCode, json: res.json() };
  };
  const until = async (id, status) => {
    for (let i = 0; i < 500; i++) {
      const { session } = (await api(`/api/agent-sessions/${id}`)).json;
      if (session.status === status) return session;
      if (session.status === 'failed') throw new Error(JSON.stringify(session.events.filter((e) => e.type === 'state')));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`never ${status}`);
  };
  try {
    const project = await createProject({ name: 'Routes fixture' });
    await fs.writeFile(path.join(project.path, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n');
    await saveAgentConfig('qoder', { command: process.execPath, args: [fixture, '--system-prompt'], runtimePaths: [path.dirname(fixture)] });
    assert.equal((await api('/api/agent-sessions', 'POST', { projectId: project.id, agentId: 'qoder', persona: { name: 5 } })).status, 400);
    const created = await api('/api/agent-sessions', 'POST', { projectId: project.id, agentId: 'qoder', mode: 'review', persona: { name: 'Critic', prompt: 'Be blunt.' } });
    assert.equal(created.status, 200, created.json.error);
    const { id } = created.json.session;
    assert.deepEqual((await until(id, 'ready')).persona, { name: 'Critic', prompt: 'Be blunt.' });

    assert.equal((await api(`/api/agent-sessions/${id}/prompt`, 'POST', { prompt: 'draft', context: { selection: 5 } })).status, 400);
    assert.equal((await api(`/api/agent-sessions/${id}/prompt`, 'POST', { prompt: 'draft', context: { research: 'missing' } })).status, 404);
    assert.equal((await api(`/api/agent-sessions/${id}/prompt`, 'POST', { prompt: 'draft', persona: { name: 'x', prompt: 7 } })).status, 400);
    assert.equal((await api(`/api/agent-sessions/${id}/prompt`, 'POST', { prompt: 'draft one', context: { activePath: 'main.tex', todos: true } })).status, 200);
    const done = await until(id, 'completed');
    assert.deepEqual(done.events.find((e) => e.type === 'user').data, { text: 'draft one', context: ['activePath', 'todos'] });
    const changes = (await api(`/api/agent-sessions/${id}/changes`)).json.changes;
    assert.equal(changes.length, 1);

    if (hasTeX) {
      const preview = (await api(`/api/agent-sessions/${id}/preview`)).json;
      assert.equal(preview.ok, true, preview.log);
      assert.equal(Buffer.from(preview.pdf, 'base64').subarray(0, 5).toString(), '%PDF-');
    }
    assert.equal((await api(`/api/agent-sessions/${id}/preview?engine=troff`)).status, 400);

    const reviewed = await api(`/api/agent-sessions/${id}/review`, 'POST', { action: 'apply', paths: ['main.tex'], expected: { 'main.tex': changes[0].afterHash } });
    assert.deepEqual(reviewed.json, { ok: true, changes: [] });
    assert.match(await fs.readFile(path.join(project.path, 'main.tex'), 'utf8'), /agent line 1/);
    assert.equal((await api(`/api/agent-sessions/${id}/review`, 'POST', { action: 'apply', paths: ['main.tex'] })).status, 500, 'nothing left to apply');
  } finally { await shutdownAgents(); await app.close(); await fs.rm(dir, { recursive: true, force: true }); }
});
