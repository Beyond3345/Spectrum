import { callOpenAICompatible } from '../services/llmService.js';
import { runToolAgent, languageLine, llmErrorMessage, namedMainFile, projectContext, userInstructions } from '../services/agentService.js';
import { getProjectRoot } from '../services/projectService.js';
import { docLanguage, hasDocument } from '../utils/docLanguage.js';
import { DATA_RULE, untrusted } from '../utils/outsideText.js';

/** Says so when a rewrite stopped at the output limit: half a rewrite is never offered as the change. */
const CUT_OFF = 'The answer was cut off by the model’s output limit before it finished. Try a smaller selection, or a lower effort.';

export function registerAgentRoutes(fastify) {
  fastify.post('/api/agent/run', async (req) => {
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
      drafts
    } = req.body || {};
    const extra = task === 'autocomplete' ? '' : await userInstructions({ instructions, skill, projectRoot: skill && projectId ? await getProjectRoot(projectId) : null });

    if (interaction === 'chat') {
      if (searchConfig) return { ...(await runToolAgent({ projectId, activePath, task, prompt, selection, content, compileLog, llmConfig, reasoningEffort, searchConfig, history, readOnly: true, instructions: extra })), suggestion: '' };
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
      return runToolAgent({ projectId, activePath, task, prompt, selection, compileLog, llmConfig, reasoningEffort, searchConfig, history, instructions: extra, drafts });
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

    const result = await callOpenAICompatible({
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
