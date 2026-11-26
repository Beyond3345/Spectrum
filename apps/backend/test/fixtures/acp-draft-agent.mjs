// An ACP agent that keeps a draft: each "draft" prompt adds a line to main.tex in its workspace, streamed back in
// pieces. --embedded and --system-prompt turn those capabilities on, and --fresh-ids gives each new session an id of
// its own, and --lose-sessions loads none (an agent that no longer has the session). A prompt ending in please-fail fails, please-ask asks for permission and ends the turn without waiting,
// please-hang never answers, please-link leaves a link in the workspace, please-agents writes an AGENTS.md of its own, and please-flood and please-huge stream a
// long message (30,000 short pieces, or 40 of 64 KB), and please-plan sends a plan_update and asks an elicitation/create
// question without waiting (both only in ACP's unstable schema), and please-usage reports the context's use and the
// turn's tokens. please-codex-error ends a turn as codex-acp 2.7.0 does after a fatal error, to a client without
// JetBrains' extension: its retries flagged in session_info_update _meta.codex.error, the error itself only as words,
// then end_turn; please-codex-retry is flagged once and then works (a tool call; with "draft", an edit). The shapes are
// 2.7.0's, the texts made up. --auth-methods offers codex-acp's api-key and chat-gpt methods, takes authenticate, and
// logs on session/new what it was started with (a key, CODEX_HOME, whether $HOME/.codex/auth.json can be read). To a
// client that declares JetBrains' AIR sessionFailure, please-air-fail warns of a retry and then ends the turn with a
// sessionFailure error, please-air-retry warns and then answers, please-login-refused fails as an expired ChatGPT login
// does; to one that doesn't, the first two are please-codex-error and please-codex-retry. please-auth asks for
// authentication (-32000). please-agy-key and please-agy-error end a turn as agy acp does after its model refused it. please-air-run asks permission for a long command as codex-acp does to an AIR client (the
// title "Run command", the command in rawInput) and please-air-question asks a question in its AIR form (choices as
// oneOf, no "None of the above", a note field), each waiting for the answer. Every request it gets, and every answer,
// goes to $HOME/acp-log.jsonl.
import readline from 'node:readline';
import { appendFileSync, readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
const lines = readline.createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
let sessionId = 'draft-session';
let opened = 0;
const update = (u) => send({ method: 'session/update', params: { sessionId, update: u } });
const log = (entry) => appendFileSync(path.join(process.env.HOME, 'acp-log.jsonl'), `${JSON.stringify(entry)}\n`);
let workspace;
const methods = process.argv.includes('--auth-methods');
let air = false;
const readable = (file) => { try { readFileSync(file); return true; } catch { return false; } };
const airMeta = (failure) => ({ jetbrains: { air: { version: 1, sessionFailure: { id: 'turn-1:error', revision: 1, actions: [], ...failure } } } });
// the answers to what it asked the client, by request id
const waiting = new Map();
const askClient = (id, method, params) => new Promise((resolve) => { waiting.set(id, resolve); send({ id, method, params }); });
const LONG_COMMAND = `latexmk -pdf -interaction=nonstopmode ${'-e "$x" '.repeat(60)}main.tex`;
lines.on('line', async (line) => {
  const m = JSON.parse(line);
  if (m.method) log({ method: m.method, params: m.params });
  else if (m.id !== undefined && waiting.has(m.id)) { log({ answered: m.id, result: m.result, error: m.error }); waiting.get(m.id)(m.result); waiting.delete(m.id); return; }
  if (m.method === 'initialize') {
    air = !!m.params.clientCapabilities?._meta?.jetbrains?.air?.capabilities?.includes('sessionFailure');
    const authMethods = methods ? [{ id: 'api-key', name: 'API Key', _meta: { 'api-key': { provider: 'openai' } } }, { id: 'chat-gpt', name: 'ChatGPT' }] : [];
    send({ id: m.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true, promptCapabilities: { embeddedContext: process.argv.includes('--embedded'), image: process.argv.includes('--embedded') }, sessionCapabilities: process.argv.includes('--system-prompt') ? { systemPrompt: {} } : {} }, agentInfo: { name: 'Draft fixture', version: '1' }, authMethods } });
  } else if (m.method === 'authenticate' && methods) {
    send({ id: m.id, result: {} });
  } else if (m.method === 'session/load' && process.argv.includes('--lose-sessions')) {
    send({ id: m.id, error: { code: -32002, message: 'Session not found' } });
  } else if (m.method === 'session/new' || m.method === 'session/load') {
    workspace = m.params.cwd;
    if (methods) log({ started: { key: process.env.OPENAI_API_KEY || null, codexHome: process.env.CODEX_HOME || null, suggestions: process.env.CODEX_ACP_PROMPT_SUGGESTIONS || null, login: readable(path.join(process.env.HOME, '.codex', 'auth.json')) } });
    sessionId = m.method === 'session/load' ? m.params.sessionId : process.argv.includes('--fresh-ids') ? `draft-session-${process.pid}-${++opened}` : 'draft-session';
    // a load replays the conversation, which the client already has
    if (m.method === 'session/load') update({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'replayed' } });
    // sent before the answer that names the session
    update({ sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'review', description: 'Review the draft' }] });
    send({ id: m.id, result: { sessionId } });
  } else if (m.method === 'session/prompt' && process.argv.includes('--auth-on-prompt')) {
    send({ id: m.id, error: { code: -32000, message: 'Authentication required' } });
  } else if (m.method === 'session/prompt') {
    const text = m.params.prompt[0].text;
    const asked = text.split('\n\n').at(-1);
    if (asked.endsWith('please-fail')) return send({ id: m.id, error: { code: -32603, message: 'The fixture failed on purpose.' } });
    if (asked.endsWith('please-hang')) return;
    if (asked.endsWith('please-ask')) send({ id: 700, method: 'session/request_permission', params: { sessionId, toolCall: { toolCallId: 'edit', title: 'Edit project files', status: 'pending' }, options: [{ optionId: 'yes', name: 'Allow once', kind: 'allow_once' }] } });
    if (asked.endsWith('please-plan')) {
      update({ sessionUpdate: 'plan_update', plan: { type: 'items', planId: 'plan-1', entries: [{ content: 'Outline the section', priority: 'medium', status: 'pending' }] } });
      send({ id: 800, method: 'elicitation/create', params: { sessionId, mode: 'form', message: 'Which section?', requestedSchema: { type: 'object', properties: { section: { type: 'string' } } } } });
    }
    const retry = (n) => update({ sessionUpdate: 'session_info_update', _meta: { codex: { error: { message: `Reconnecting... ${n}/5`, codexErrorInfo: null, additionalDetails: 'workspace routing discovery failed', turnId: 'turn-1', willRetry: true } } } });
    if (asked.endsWith('please-air-run')) {
      await askClient(901, 'session/request_permission', { sessionId, toolCall: { toolCallId: 'cmd-1', title: 'Run command', rawInput: { command: LONG_COMMAND, cwd: workspace } }, options: [{ optionId: 'approved', name: 'Yes', kind: 'allow_once' }, { optionId: 'abort', name: 'No', kind: 'reject_once' }] });
    }
    if (asked.endsWith('please-air-question')) {
      await askClient(902, 'elicitation/create', { sessionId, toolCallId: 'q-1', mode: 'form', message: 'Codex needs your input to continue.', requestedSchema: { type: 'object', required: ['section'], properties: {
        section: { title: 'Which section?', type: 'string', oneOf: [{ const: 'Introduction', title: 'Introduction' }, { const: 'Methods', title: 'Methods' }], _meta: { codex: { isOther: true, isSecret: false } } },
        section_note: { type: 'string', title: 'Additional answer or note', _meta: { codex: { questionId: 'section', role: 'user_note', isSecret: false }, _askUserQuestionCustomAnswer: true, jetbrains: { air: { version: 1, customAnswer: true } } } }
      } } });
    }
    if (asked.endsWith('please-auth')) return send({ id: m.id, error: { code: -32000, message: 'Authentication required' } });
    // agy acp 1.5.18 after its model refused the request: the error as its only reply, and end_turn
    const agy = { 'please-agy-key': 'generating and executing: Error 400, Message: API key not valid. Please pass a valid API key., Status: INVALID_ARGUMENT, Details: [map[@type:type.googleapis.com/google.rpc.ErrorInfo domain:googleapis.com metadata:map[service:generativelanguage.googleapis.com] reason:API_KEY_INVALID]]', 'please-agy-error': 'generating and executing: doRequest: error sending request: Post "https://generativelanguage.googleapis.com/v1beta/models"' };
    const said = Object.keys(agy).find((k) => asked.endsWith(k));
    if (said) {
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `\n⚠ agent executor error: ${agy[said]}\n` } });
      return send({ id: m.id, result: { stopReason: 'end_turn' } });
    }
    const warn = () => update({ sessionUpdate: 'session_info_update', _meta: airMeta({ category: 'connection', severity: 'warning', title: 'Reconnecting... 1/5' }) });
    if (air && asked.endsWith('please-air-fail')) {
      warn();
      return send({ id: m.id, result: { stopReason: 'end_turn', usage: null, _meta: { quota: { token_count: null, model_usage: [] }, ...airMeta({ category: 'connection', severity: 'error', title: 'Codex can’t reach chatgpt.com to look up your ChatGPT workspace. (workspace routing discovery failed)', actions: ['retry', 'new_session'] }) } } });
    }
    if (air && asked.endsWith('please-login-refused')) return send({ id: m.id, result: { stopReason: 'end_turn', usage: null, _meta: { quota: { token_count: null, model_usage: [] }, ...airMeta({ category: 'service', severity: 'error', title: 'workspace routing discovery unauthorized (401)' }) } } });
    if (air && asked.endsWith('please-air-retry')) warn();
    if (asked.endsWith('please-codex-error') || (!air && asked.endsWith('please-air-fail'))) {
      retry(1); retry(2);
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Codex can’t reach chatgpt.com to look up your ChatGPT workspace. (workspace routing discovery failed)\n\n' } });
      return send({ id: m.id, result: { stopReason: 'end_turn', usage: null, _meta: { quota: { token_count: null, model_usage: [] } } } });
    }
    if (asked.endsWith('please-codex-retry') || (!air && asked.endsWith('please-air-retry'))) {
      retry(1);
      update({ sessionUpdate: 'tool_call', toolCallId: 'call-1', title: 'Read main.tex', kind: 'read', status: 'in_progress' });
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'call-1', status: 'completed' });
    }
    if (asked.endsWith('please-link')) await fs.symlink('main.tex', path.join(workspace, 'alias.tex'));
    if (asked.endsWith('please-agents')) await fs.writeFile(path.join(workspace, 'AGENTS.md'), 'Agent’s rules.\n');
    if (text.includes('draft')) {
      const file = path.join(workspace, 'main.tex');
      const before = await fs.readFile(file, 'utf8');
      const n = before.split('agent line').length;
      await fs.writeFile(file, `${before}agent line ${n}\n`);
    }
    const pieces = asked.endsWith('please-flood') ? Array(30000).fill('ab ') : asked.endsWith('please-huge') ? Array(40).fill('x'.repeat(65536)) : Array.from({ length: 30 }, (_, i) => `piece-${i} `);
    for (const piece of pieces) update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: piece } });
    if (asked.endsWith('please-usage')) {
      update({ sessionUpdate: 'usage_update', used: 53000, size: 200000, cost: { amount: 0.42, currency: 'USD' } });
      return send({ id: m.id, result: { stopReason: 'end_turn', usage: { totalTokens: 1500, inputTokens: 1200, outputTokens: 300 } } });
    }
    send({ id: m.id, result: { stopReason: 'end_turn' } });
  } else if (m.id !== undefined && m.method) send({ id: m.id, error: { code: -32601, message: 'Unsupported fixture method' } });
});
