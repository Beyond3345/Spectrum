import { listAgents, saveAgentConfig, importAgentLogin } from '../services/agentProfiles.js';
import { changeAdapter, testAgent, getAgentRun, listAgentRuns, newAgentRun, previewDraft, promptAgent, readContext, stopAgentRun, answerAgentRequest, setAgentOption, reviewAgentChanges, pendingChanges, runSnapshot, subscribeAgent } from '../services/agentSessionService.js';
import { agentRecoveries, recoverAgentApply } from '../services/agentWorkspace.js';
import { mutateProjectRoot } from '../services/projectService.js';

export function registerAgentSessionRoutes(fastify) {
  fastify.get('/api/agents', async () => ({ ok: true, agents: await listAgents() }));
  fastify.put('/api/agents/:id', async (req) => { await saveAgentConfig(req.params.id, req.body); return { ok: true }; });
  fastify.post('/api/agents/:id/import-login', async (req) => ({ ok: true, files: await importAgentLogin(req.params.id) }));
  // starts the agent in isolation without a prompt, and stores what happened
  fastify.post('/api/agents/:id/test', async (req) => ({ ok: true, agent: await testAgent(req.params.id) }));
  // the profile's pinned adapter: the request names no package or version
  fastify.post('/api/agents/:id/adapter', async (req) => ({ ok: true, agent: await changeAdapter(req.params.id, 'install') }));
  fastify.delete('/api/agents/:id/adapter', async (req) => ({ ok: true, agent: await changeAdapter(req.params.id, 'remove') }));
  fastify.get('/api/agent-sessions', async (req) => ({ ok: true, sessions: await listAgentRuns(String(req.query.projectId || '')) }));
  fastify.post('/api/agent-sessions', async (req) => ({ ok: true, session: await newAgentRun(req.body || {}) }));
  fastify.get('/api/agent-sessions/:id', async (req) => {
    const run = await getAgentRun(req.params.id);
    return { ok: true, session: { ...runSnapshot(run), recoveries: await agentRecoveries(run) } };
  });
  fastify.post('/api/agent-sessions/:id/recover', async (req) => {
    const run = await getAgentRun(req.params.id);
    if (run.busy || run.reviewing) throw new Error('Stop the agent before recovering files.');
    run.reviewing = true;
    try { await mutateProjectRoot(run.root, () => recoverAgentApply(run, req.body?.recoveryId)); }
    finally { run.reviewing = false; }
    return { ok: true };
  });
  // context: the editor's (readContext), sent as ACP resources; persona: { name, prompt } or null, kept for the session
  fastify.post('/api/agent-sessions/:id/prompt', async (req) => {
    const run = await getAgentRun(req.params.id);
    return promptAgent(run, req.body?.prompt, { context: await readContext(run, req.body?.context), persona: req.body?.persona });
  });
  fastify.post('/api/agent-sessions/:id/stop', async (req) => { await stopAgentRun(await getAgentRun(req.params.id)); return { ok: true }; });
  fastify.post('/api/agent-sessions/:id/answer', async (req) => { answerAgentRequest(await getAgentRun(req.params.id), req.body?.requestId, req.body?.answer); return { ok: true }; });
  fastify.post('/api/agent-sessions/:id/option', async (req) => ({ ok: true, ...(await setAgentOption(await getAgentRun(req.params.id), req.body?.configId, req.body?.value)) }));
  fastify.get('/api/agent-sessions/:id/changes', async (req) => {
    const run = await getAgentRun(req.params.id);
    return { ok: true, changes: await pendingChanges(run) };
  });
  fastify.post('/api/agent-sessions/:id/review', async (req) => ({ ok: true, changes: await reviewAgentChanges(await getAgentRun(req.params.id), req.body || {}) }));
  // the draft compiled on its own: { ok, pdf (base64, or null), log }; mainFile and engine default to the project's
  fastify.get('/api/agent-sessions/:id/preview', async (req) => previewDraft(await getAgentRun(req.params.id), { mainFile: req.query.mainFile || undefined, engine: req.query.engine || undefined }));
  fastify.get('/api/agent-sessions/:id/events', async (req, reply) => {
    const run = await getAgentRun(req.params.id);
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const after = Number(req.headers['last-event-id'] || req.query.after || 0);
    const send = (e) => reply.raw.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
    const end = subscribeAgent(run, send);
    for (const event of run.events) if (event.id > after) send(event);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15000);
    reply.raw.on('close', () => { clearInterval(ping); end(); });
    return reply;
  });
}
