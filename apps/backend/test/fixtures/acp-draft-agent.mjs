// An ACP agent that keeps a draft: each "draft" prompt adds a line to main.tex in its workspace, streamed back in
// pieces. --embedded and --system-prompt turn those capabilities on. Every request it gets goes to $HOME/acp-log.jsonl.
import readline from 'node:readline';
import { appendFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
const lines = readline.createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const update = (u) => send({ method: 'session/update', params: { sessionId: 'draft-session', update: u } });
const log = (entry) => appendFileSync(path.join(process.env.HOME, 'acp-log.jsonl'), `${JSON.stringify(entry)}\n`);
let workspace;
lines.on('line', async (line) => {
  const m = JSON.parse(line);
  if (m.method) log({ method: m.method, params: m.params });
  if (m.method === 'initialize') {
    send({ id: m.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true, promptCapabilities: { embeddedContext: process.argv.includes('--embedded') }, sessionCapabilities: process.argv.includes('--system-prompt') ? { systemPrompt: {} } : {} }, agentInfo: { name: 'Draft fixture', version: '1' }, authMethods: [] } });
  } else if (m.method === 'session/new' || m.method === 'session/load') {
    workspace = m.params.cwd;
    // a load replays the conversation, which the client already has
    if (m.method === 'session/load') update({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'replayed' } });
    update({ sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'review', description: 'Review the draft' }] });
    send({ id: m.id, result: { sessionId: 'draft-session' } });
  } else if (m.method === 'session/prompt') {
    const text = m.params.prompt[0].text;
    if (text.includes('draft')) {
      const file = path.join(workspace, 'main.tex');
      const before = await fs.readFile(file, 'utf8');
      const n = before.split('agent line').length;
      await fs.writeFile(file, `${before}agent line ${n}\n`);
    }
    for (let i = 0; i < 30; i++) update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `piece-${i} ` } });
    send({ id: m.id, result: { stopReason: 'end_turn' } });
  } else if (m.id !== undefined && m.method) send({ id: m.id, error: { code: -32601, message: 'Unsupported fixture method' } });
});
