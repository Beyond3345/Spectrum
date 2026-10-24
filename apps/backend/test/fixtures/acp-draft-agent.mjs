// An ACP agent that keeps a draft: each "draft" prompt adds a line to main.tex in its workspace, streamed back in
// pieces. --embedded and --system-prompt turn those capabilities on, and --fresh-ids gives each new session an id of
// its own, and --lose-sessions loads none (an agent that no longer has the session). A prompt ending in please-fail fails, please-ask asks for permission and ends the turn without waiting,
// please-hang never answers, please-link leaves a link in the workspace, and please-flood and please-huge stream a
// long message (30,000 short pieces, or 40 of 64 KB). Every request it gets goes to $HOME/acp-log.jsonl.
import readline from 'node:readline';
import { appendFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
const lines = readline.createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
let sessionId = 'draft-session';
let opened = 0;
const update = (u) => send({ method: 'session/update', params: { sessionId, update: u } });
const log = (entry) => appendFileSync(path.join(process.env.HOME, 'acp-log.jsonl'), `${JSON.stringify(entry)}\n`);
let workspace;
lines.on('line', async (line) => {
  const m = JSON.parse(line);
  if (m.method) log({ method: m.method, params: m.params });
  if (m.method === 'initialize') {
    send({ id: m.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true, promptCapabilities: { embeddedContext: process.argv.includes('--embedded') }, sessionCapabilities: process.argv.includes('--system-prompt') ? { systemPrompt: {} } : {} }, agentInfo: { name: 'Draft fixture', version: '1' }, authMethods: [] } });
  } else if (m.method === 'session/load' && process.argv.includes('--lose-sessions')) {
    send({ id: m.id, error: { code: -32002, message: 'Session not found' } });
  } else if (m.method === 'session/new' || m.method === 'session/load') {
    workspace = m.params.cwd;
    sessionId = m.method === 'session/load' ? m.params.sessionId : process.argv.includes('--fresh-ids') ? `draft-session-${process.pid}-${++opened}` : 'draft-session';
    // a load replays the conversation, which the client already has
    if (m.method === 'session/load') update({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'replayed' } });
    // sent before the answer that names the session
    update({ sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'review', description: 'Review the draft' }] });
    send({ id: m.id, result: { sessionId } });
  } else if (m.method === 'session/prompt') {
    const text = m.params.prompt[0].text;
    const asked = text.split('\n\n').at(-1);
    if (asked.endsWith('please-fail')) return send({ id: m.id, error: { code: -32603, message: 'The fixture failed on purpose.' } });
    if (asked.endsWith('please-hang')) return;
    if (asked.endsWith('please-ask')) send({ id: 700, method: 'session/request_permission', params: { sessionId, toolCall: { toolCallId: 'edit', title: 'Edit project files', status: 'pending' }, options: [{ optionId: 'yes', name: 'Allow once', kind: 'allow_once' }] } });
    if (asked.endsWith('please-link')) await fs.symlink('main.tex', path.join(workspace, 'alias.tex'));
    if (text.includes('draft')) {
      const file = path.join(workspace, 'main.tex');
      const before = await fs.readFile(file, 'utf8');
      const n = before.split('agent line').length;
      await fs.writeFile(file, `${before}agent line ${n}\n`);
    }
    const pieces = asked.endsWith('please-flood') ? Array(30000).fill('ab ') : asked.endsWith('please-huge') ? Array(40).fill('x'.repeat(65536)) : Array.from({ length: 30 }, (_, i) => `piece-${i} `);
    for (const piece of pieces) update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: piece } });
    send({ id: m.id, result: { stopReason: 'end_turn' } });
  } else if (m.id !== undefined && m.method) send({ id: m.id, error: { code: -32601, message: 'Unsupported fixture method' } });
});
