// Self-check for the local agent transcript. Run:
// npx esbuild apps/frontend/src/editor/agent/transcript.check.ts --bundle --platform=node --log-level=warning --outfile=<scratch>/transcript.cjs && node <scratch>/transcript.cjs
import type { AgentEvent } from '../../api/client';
import { addEvent, openChanges, project } from './transcript';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
let id = 0;
const at = (n: number, ms = 0) => new Date(Date.UTC(2026, 9, 24, 10, 0, n, ms)).toISOString();
const ev = (type: string, data: unknown): AgentEvent => ({ id: ++id, type, data, at: at(id) });
const up = (data: Record<string, unknown>) => ev('update', data);
const chunk = (sessionUpdate: string, text: string) => up({ sessionUpdate, content: { type: 'text', text } });
const shape = (events: AgentEvent[], extra?: Parameters<typeof project>[1]) =>
  project(events, extra).items.map((i) => [i.type, 'text' in i ? i.text : i.type === 'tool' ? `${i.call.title}:${i.call.status}` : i.type === 'todo' ? i.todo.text : i.type === 'request' ? i.answered : i.type === 'checkpoint' ? i.checkpoint.number : '']);

// messages: chunks join; a thought is its own item; a new user turn starts a new reply
eq(
  shape([ev('user', { text: 'Fix it' }), chunk('agent_thought_chunk', 'Hmm, '), chunk('agent_thought_chunk', 'the intro.'), chunk('agent_message_chunk', 'Done '), chunk('agent_message_chunk', 'now.'), ev('user', { text: 'Again' }), chunk('agent_message_chunk', 'Sure.')]),
  [['user', 'Fix it'], ['thought', 'Hmm, the intro.'], ['assistant', 'Done now.'], ['user', 'Again'], ['assistant', 'Sure.']],
  'chunks'
);

// one card per tool call, updated in place where it started
{
  const p = project([
    up({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Read main.tex', kind: 'read', status: 'pending' }),
    chunk('agent_message_chunk', 'Reading.'),
    up({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', content: [{ type: 'diff', path: 'main.tex', oldText: 'a', newText: 'b' }] })
  ]);
  eq(p.items.map((i) => i.type), ['tool', 'assistant'], 'the update stays in the first card');
  const call = p.items[0].type === 'tool' ? p.items[0].call : null;
  eq([call?.kind, call?.status, call?.content.length], ['read', 'completed', 1], 'fields merged, kind kept');
}
eq(shape([up({ sessionUpdate: 'tool_call_update', toolCallId: 'late', title: 'Search', status: 'in_progress' })]), [['tool', 'Search:in_progress']], 'an update before its call');
eq(
  shape([ev('user', { text: 'One' }), up({ sessionUpdate: 'tool_call', toolCallId: 'call-1', title: 'Edit a.tex', status: 'completed' }), ev('user', { text: 'Two' }), up({ sessionUpdate: 'tool_call', toolCallId: 'call-1', title: 'Edit b.tex', status: 'completed' })]),
  [['user', 'One'], ['tool', 'Edit a.tex:completed'], ['user', 'Two'], ['tool', 'Edit b.tex:completed']],
  'a new turn’s call with an id used before is a card of its own'
);

// a loaded session's replay of the conversation is left out; commands and options from it are kept
{
  const p = project([
    ev('user', { text: 'First' }),
    chunk('agent_message_chunk', 'One.'),
    ev('initialized', {}),
    chunk('user_message_chunk', 'First'),
    chunk('agent_message_chunk', 'One.'),
    up({ sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'review', description: 'Review the code' }] }),
    ev('session', { configOptions: [{ id: 'model', currentValue: 'a' }], modes: { currentModeId: 'ask', availableModes: [{ id: 'ask', name: 'Ask' }] } }),
    ev('user', { text: 'Second' }),
    chunk('agent_message_chunk', 'Two.'),
    up({ sessionUpdate: 'current_mode_update', currentModeId: 'code' }),
    ev('session', {})
  ]);
  eq(p.items.map((i) => ('text' in i ? i.text : i.type)), ['First', 'One.', 'Second', 'Two.'], 'replay skipped');
  eq(p.commands.map((c) => c.name), ['review'], 'commands');
  eq([p.configOptions.length, p.modes?.currentModeId], [1, 'code'], 'options kept through a session event without them');
}

// the plan is replaced by each update
eq(
  project([up({ sessionUpdate: 'plan', entries: [{ content: 'A', status: 'pending' }] }), up({ sessionUpdate: 'plan', entries: [{ content: 'B', status: 'in_progress' }] })]).plan,
  [{ content: 'B', status: 'in_progress' }],
  'plan'
);

// requests: answered in place; one still waiting whose event is gone is added
eq(
  shape([ev('request', { requestId: 'r1', kind: 'permission', params: {} }), ev('answered', { requestId: 'r1' })], { pending: [{ requestId: 'r2', kind: 'question', params: {} }] }),
  [['request', true], ['request', false]],
  'requests'
);

// notices and failures
eq(
  project([ev('notice', { message: 'Note' }), ev('notice', { error: 'Capture failed' }), ev('state', { status: 'failed', error: 'Agent exited' }), ev('state', { status: 'interrupted', error: 'The agent disconnected.' }), ev('state', { status: 'ready' })]).items.map((i) => (i.type === 'notice' ? [i.text, i.error] : i.type)),
  [['Note', false], ['Capture failed', true], ['Agent exited', true], ['The agent disconnected.', false]],
  'notices: only failures are errors'
);

// suggested to-dos come from the MCP tool, by its name or title
eq(
  shape([up({ sessionUpdate: 'tool_call', toolCallId: 's', title: 'mcp__spectrum__suggest_todo', status: 'completed', rawInput: { text: 'Cite Smith' } }), ev('todo', { text: 'Cite Smith', link: { file: 'a.tex', line: 3 } })]),
  [['tool', 'mcp__spectrum__suggest_todo:completed'], ['todo', 'Cite Smith']],
  'suggest_todo: its call is a card, and the suggestion read back at the turn’s end a to-do'
);

eq(shape([ev('reset', { paths: ['a.tex'] })]), [['notice', 'Rejected: the agent’s copy of “a.tex” is back to your version, and the agent is told with its next task.']], 'a rejection');

// a stored event that joins pieces replaces the ones held from its first on; a live piece is added; a repeat is not
{
  const piece = (n: number, text: string, first?: number): AgentEvent => ({ id: n, type: 'update', data: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }, at: at(n), ...(first && { first }) });
  const held = [ev('user', { text: 'Go' }), piece(1000, 'One '), piece(1001, 'two ')];
  const joined = addEvent(held, piece(1002, 'One two three', 1000));
  eq(joined.map((e) => e.id), [held[0].id, 1002], 'pieces replaced');
  eq(addEvent(joined, piece(1002, 'One two three', 1000)), joined, 'a repeat');
  eq(shape(addEvent(joined, piece(1003, ' four'))), [['user', 'Go'], ['assistant', 'One two three four']], 'a later piece joins on');
}

// checkpoints go where they were saved
eq(
  shape([ev('user', { text: 'Go' }), ev('user', { text: 'More' })], { checkpoints: [{ id: 9, number: 4, label: 'Before applying agent changes', createdAt: at(id - 1, 500) }, { id: 10, number: 5, label: '', createdAt: '2027-01-01T00:00:00.000Z' }] }),
  [['user', 'Go'], ['checkpoint', 4], ['user', 'More'], ['checkpoint', 5]],
  'checkpoints'
);

// terminals
eq(project([ev('terminal', { terminalId: 'x', command: 'latexmk', args: ['-pdf', 'main.tex'] })]).terminals, { x: 'latexmk -pdf main.tex' }, 'terminal');

// a Spectrum agent thread's open proposals: each file's latest, until applied or rejected; one already in the file is done
{
  const message = (changes: object[]) => ({ role: 'assistant' as const, content: '', createdAt: '', meta: { changes } });
  const chat = {
    id: 'c', title: '', mode: 'assistant' as const, createdAt: '', updatedAt: '', agent: true as const,
    messages: [
      message([{ filePath: 'a.tex', proposed: 'A1' }, { filePath: 'b.tex', proposed: 'B1' }, { filePath: 'gone.tex', proposed: 'G' }]),
      message([{ filePath: 'a.tex', proposed: 'A2' }, { filePath: 'b.tex', proposed: 'B2', status: 'applied' }, { filePath: 'c.tex', proposed: 'C1', status: 'rejected' }]),
      message([{ filePath: 'd.tex', proposed: 'same' }])
    ]
  };
  const disk: Record<string, string> = { 'a.tex': 'A0', 'b.tex': 'B2', 'd.tex': 'same' };
  void openChanges(chat, async (p) => (p in disk ? disk[p] : Promise.reject(new Error('missing')))).then((open) => {
    eq(open.map((c) => [c.filePath, c.original, c.proposed]), [['a.tex', 'A0', 'A2'], ['gone.tex', '', 'G']], 'open proposals');
    console.log('transcript: all checks passed');
  });
}
