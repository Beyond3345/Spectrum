import readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const lines = readline.createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
let workspace;
let promptId;
let terminalId;
async function finish() {
  await fs.writeFile(path.join(workspace, 'new.bib'), '@article{test}\n');
  await fs.writeFile(path.join(workspace, 'figure.bin'), Buffer.from([0, 255, 1]));
  await fs.unlink(path.join(workspace, 'delete.txt')).catch(() => {});
  send({ method: 'session/update', params: { sessionId: 'test-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Finished the project edits.' } } } });
  send({ id: promptId, result: { stopReason: 'end_turn' } });
}
lines.on('line', async (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true }, agentInfo: { name: 'Spectrum fixture', version: '1' }, authMethods: [] } });
  else if (m.method === 'session/new' || m.method === 'session/load') { workspace = m.params.cwd; send({ id: m.id, result: { sessionId: 'test-session' } }); }
  else if (m.method === 'session/prompt') {
    promptId = m.id;
    if (m.params.prompt[0].text.includes('wait forever')) return;
    send({ id: 900, method: 'session/request_permission', params: { sessionId: 'test-session', toolCall: { toolCallId: 'edit', title: 'Edit project files', status: 'pending' }, options: [{ optionId: 'yes', name: 'Allow once', kind: 'allow_once' }, { optionId: 'no', name: 'Decline', kind: 'reject_once' }] } });
  } else if (m.id === 900 && m.result) {
    if (m.result.outcome?.optionId === 'yes') send({ id: 901, method: 'fs/write_text_file', params: { sessionId: 'test-session', path: path.join(workspace, 'main.tex'), content: 'agent draft\n' } });
    else send({ id: promptId, result: { stopReason: 'cancelled' } });
  } else if (m.id === 901 && m.result) {
    send({ id: 902, method: 'fs/read_text_file', params: { sessionId: 'test-session', path: path.join(workspace, 'main.tex') } });
  } else if (m.id === 902 && m.result?.content === 'agent draft\n') {
    send({ id: 903, method: 'terminal/create', params: { sessionId: 'test-session', command: process.execPath, args: ['-e', `const fs=require('fs'),path=require('path');fs.writeFileSync(path.join(process.env.HOME,'terminal.pid'),String(process.pid));console.log('terminal-ready');setInterval(()=>{},1000);`] } });
  } else if (m.id === 903 && m.result?.terminalId) {
    terminalId = m.result.terminalId;
    send({ id: 904, method: 'terminal/output', params: { sessionId: 'test-session', terminalId } });
  } else if (m.id === 904 && m.result) {
    if (m.result.output.includes('terminal-ready')) await finish();
    else setTimeout(() => send({ id: 904, method: 'terminal/output', params: { sessionId: 'test-session', terminalId } }), 20);
  } else if (m.error) {
    send({ id: promptId, error: m.error });
  } else if (m.method === 'session/cancel' && promptId !== undefined) send({ id: promptId, result: { stopReason: 'cancelled' } });
  else if (m.id !== undefined && m.method) send({ id: m.id, error: { code: -32601, message: 'Unsupported fixture method' } });
});
