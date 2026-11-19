import { callOpenAICompatible } from '../services/llmService.js';
import { runToolAgent, languageLine, llmErrorMessage, namedMainFile, projectContext, userInstructions } from '../services/agentService.js';
import { getProjectRoot } from '../services/projectService.js';
import { getRun, runOfThread, runSnapshot, startTurn, steerRun, stopRun, subscribeRun } from '../services/agentRunService.js';
import { approveInstructions, instructionsStatus } from '../services/agentInstructions.js';
import { docLanguage, hasDocument } from '../utils/docLanguage.js';
import { DATA_RULE, untrusted } from '../utils/outsideText.js';

/** Says so when a rewrite stopped at the output limit: half a rewrite is never offered as the change. */
const CUT_OFF = 'The answer was cut off by the model’s output limit before it finished. Try a smaller selection, or a lower effort.';

/**
 * A turn's request as the run takes it: the persona's or default instructions for the agent's own, and a skill picked
 * with / as a block that goes with this request alone (checked here, so a skill that is off or missing is refused
 * before the turn starts).
 */
async function turnBody(body = {}) {
  const { projectId, threadId, prompt, shown, selection, activePath, compileLog, llmConfig, model, reasoningEffort, searchConfig, history, instructions, skill, drafts, compile, planFirst, plan, eachFile } = body;
  return {
    projectId, threadId, prompt, shown, selection, activePath, compileLog, llmConfig, model, reasoningEffort, searchConfig, history, drafts, compile,
    planFirst: planFirst === true,
    // the approved plan's steps as the thread has them, and whether the run pauses before each new file
    plan: Array.isArray(plan) ? plan : null,
    eachFile: eachFile === true,
    instructions: await userInstructions({ instructions }),
    skillBlock: skill ? await userInstructions({ skill, projectRoot: await getProjectRoot(projectId) }) : ''
  };
}

export function registerAgentRoutes(fastify) {
  // The Spectrum agent's turns as jobs (agentRunService.js): start one, hear it, stop it, steer it, continue it.
  fastify.post('/api/agent/runs', async (req) => ({ ok: true, run: await startTurn(await turnBody(req.body)) }));
  // the run of a thread, for a page that loads while one is going or has just ended: { run } or { run: null }
  fastify.get('/api/agent/runs', async (req) => {
    const run = runOfThread(String(req.query.projectId || ''), String(req.query.threadId || ''));
    return { ok: true, run: run ? runSnapshot(run) : null };
  });
  // Continue: the same conversation, from where the last turn stopped; a 404 when the run is no longer kept
  fastify.post('/api/agent/runs/:id/continue', async (req) => {
    const run = getRun(req.params.id);
    return { ok: true, run: await startTurn(await turnBody({ ...req.body, projectId: run.projectId, threadId: run.threadId }), { resume: true, runId: run.id }) };
  });
  fastify.post('/api/agent/runs/:id/stop', async (req) => {
    stopRun(getRun(req.params.id));
    return { ok: true };
  });
  fastify.post('/api/agent/runs/:id/steer', async (req) => {
    steerRun(getRun(req.params.id), req.body?.text);
    return { ok: true };
  });
  // server-sent events, as a local agent's session sends them: the stored ones after `after`, then each as it comes
  fastify.get('/api/agent/runs/:id/events', async (req, reply) => {
    const run = getRun(req.params.id);
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const after = Number(req.headers['last-event-id'] || req.query.after || 0);
    const send = (e) => reply.raw.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
    const end = subscribeRun(run, send);
    for (const event of run.events) if (event.id > after) send(event);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15000);
    reply.raw.on('close', () => { clearInterval(ping); end(); });
    return reply;
  });

  // The project's AGENTS.md (agentInstructions.js): whether there is one, and whether the user approved it as it is;
  // and their approval of the text they were shown, by its hash.
  fastify.get('/api/projects/:id/agent-instructions', async (req) => ({ ok: true, ...(await instructionsStatus(await getProjectRoot(req.params.id))) }));
  fastify.post('/api/projects/:id/agent-instructions/approve', async (req) => {
    const root = await getProjectRoot(req.params.id);
    await approveInstructions(root, String(req.body?.hash || ''));
    return { ok: true, ...(await instructionsStatus(root)) };
  });

  fastify.post('/api/agent/run', async (req, res) => {
    const {
      task = 'polish',
      prompt = '',
      selection = '',
      content = '',
      mode = 'direct',
      projectId,
      activePath,
      compileLog,
      llmConfig,
      searchConfig,
      interaction = 'agent',
      history = [],
      reasoningEffort,
      // the persona's or default instructions, and a skill's id for its instructions in whole: never for autocomplete
      instructions,
      skill,
      // the thread's open proposals, which a tools run goes on from
      drafts,
      // Fix with AI: a run that changed something ends with a compile, answered in `build`
      verify,
      // the Typst version and Markdown engine this computer compiles with, for the agent's own compile
      compile
    } = req.body || {};
    // closing the request (the page gone, a Cancel) stops the model calls
    const cancel = new AbortController();
    res.raw.on('close', () => {
      if (!res.raw.writableEnded) cancel.abort();
    });
    const extra = task === 'autocomplete' ? '' : await userInstructions({ instructions, skill, projectRoot: skill && projectId ? await getProjectRoot(projectId) : null });

    if (interaction === 'chat') {
      if (searchConfig) return { ...(await runToolAgent({ projectId, activePath, task, prompt, selection, content, compileLog, llmConfig, reasoningEffort, searchConfig, history, readOnly: true, instructions: extra, signal: cancel.signal })), suggestion: '' };
      const safeHistory = Array.isArray(history)
        ? history.filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        : [];
      const system = [[
        'You are a helpful academic writing assistant.',
        hasDocument(activePath) ? languageLine(docLanguage(activePath)) : '',
        'This is chat-only mode: do not propose edits, patches, or JSON.',
        'Respond concisely and helpfully.',
        DATA_RULE
      ].filter(Boolean).join(' '), extra].filter(Boolean).join('\n\n');
      const user = [
        prompt ? `User Prompt: ${prompt}` : '',
        selection ? `Selection (read-only):\n${untrusted('selection', selection)}` : '',
        selection ? '' : (content ? `Current File (read-only):\n${untrusted(activePath || 'current file', content)}` : ''),
        compileLog ? `Compile Log (read-only):\n${untrusted('compile log', compileLog)}` : ''
      ].filter(Boolean).join('\n\n');

      const result = await callOpenAICompatible({
        messages: [{ role: 'system', content: system }, ...safeHistory, { role: 'user', content: user }],
        model: llmConfig?.model,
        endpoint: llmConfig?.endpoint,
        apiKey: llmConfig?.apiKey,
        reasoningEffort
      });

      if (!result.ok) {
        return {
          ok: false,
          reply: llmErrorMessage(result.error),
          suggestion: ''
        };
      }

      return { ok: true, reply: result.content || '', suggestion: '', ...(result.truncated && { incomplete: 'cut' }) };
    }

    if (mode === 'tools') {
      return runToolAgent({ projectId, activePath, task, prompt, selection, compileLog, llmConfig, reasoningEffort, searchConfig, history, instructions: extra, drafts, compile, verify: verify === true, signal: cancel.signal });
    }

    // the language of the open file, or else of the project's main file
    const auto = task === 'autocomplete';
    const root = projectId && (!auto || !hasDocument(activePath)) ? await getProjectRoot(projectId).catch(() => null) : null;
    // autocomplete's text is short and continued as it stands; everything else a rewrite reads is marked as material
    const project = auto || !root ? { mainFile: await namedMainFile(root), text: '' } : await projectContext(root, await namedMainFile(root));
    const language = docLanguage(activePath, project.mainFile);
    const system = auto
      ? [
          `You are an autocomplete engine for ${language.name}.`,
          language.rules,
          'Only return JSON with keys: reply, suggestion.',
          'suggestion must be the continuation text after the cursor.',
          'Do not include explanations or code fences.'
        ].join(' ')
      : [[
          `You are a ${language.name} writing assistant for academic papers.`,
          languageLine(language),
          'Return a concise response and a suggested rewrite for the selection or full content.',
          'Output in JSON with keys: reply, suggestion. suggestion is the rewritten text alone, never its marker.',
          DATA_RULE
        ].join(' '), extra].filter(Boolean).join('\n\n');

    const user = [
      `Task: ${task}`,
      mode === 'tools' ? 'Mode: tools (use extra reasoning)' : 'Mode: direct',
      prompt ? `User Prompt: ${prompt}` : '',
      project.text ? `Project:\n${untrusted('project outline', project.text)}` : '',
      selection ? `Selection:\n${auto ? selection : untrusted('selection', selection)}` : '',
      selection ? '' : `Full Content:\n${auto ? content : untrusted(activePath || 'current file', content)}`
    ].filter(Boolean).join('\n\n');

    // autocomplete given up in the editor (typing on, the cursor moved, Esc) closes the request: the model call stops
    // too, as every call of this route does when its request closes (cancel, above)
    const result = await callOpenAICompatible({
      signal: cancel.signal,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      model: llmConfig?.model,
      endpoint: llmConfig?.endpoint,
      apiKey: llmConfig?.apiKey,
      // autocomplete has to be quick, so it thinks as little as the model allows and never waits to try again
      reasoningEffort: auto ? 'fast' : reasoningEffort,
      ...(auto && { retries: 0 })
    });

    if (!result.ok) {
      return {
        ok: false,
        reply: llmErrorMessage(result.error),
        suggestion: ''
      };
    }

    if (result.truncated) return { ok: false, reply: CUT_OFF, suggestion: '', incomplete: 'cut' };
    let reply = '';
    let suggestion = '';
    try {
      const parsed = JSON.parse(result.content);
      reply = parsed.reply || '';
      suggestion = parsed.suggestion || '';
    } catch {
      reply = result.content;
    }

    return { ok: true, reply, suggestion };
  });
}
