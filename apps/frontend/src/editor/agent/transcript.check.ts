// Self-check for the local agent transcript. Run:
// npx esbuild apps/frontend/src/editor/agent/transcript.check.ts --bundle --platform=node --log-level=warning --outfile=<scratch>/transcript.cjs && node <scratch>/transcript.cjs
import type { AgentEvent } from '../../api/client';
import { addEvent, addRunEvent, askAnswer, askRequest, closeChanges, metaOf, openChanges, planOf, planPrompt, project, resumeNote, retryLine, runView, stepCall, storedChanges, threadItems } from './transcript';

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

// a run that ended before its answer: the thread keeps its steps and changes with the failure, they stay open for
// review, and the next run is told where it got to
{
  const failed = { changes: storedChanges([{ filePath: 'main.typ', original: 'a', proposed: 'b' }]), steps: [{ tool: 'read_file', about: 'main.typ', ok: true }, { tool: 'read_file', about: '.env', ok: false }, { tool: 'propose_patch', about: 'main.typ', ok: true }], error: true, resume: 'failed' as const };
  eq(
    resumeNote(failed),
    'Your last run stopped before its answer, at a request to the model that failed. Steps it had finished: read_file main.typ; propose_patch main.typ. The changes it prepared (main.typ) are still open: read_file shows each file with them, and a new change builds on them. Go on from there. Do not redo what is finished.',
    'a failed run'
  );
  eq(resumeNote({ resume: 'steps' }), 'Your last run stopped at its limit of 25 steps, before its answer. Go on from there. Do not redo what is finished.', 'the step limit');
  eq(resumeNote({ resume: 'cut' }), 'Your last answer was cut off by the output limit: go on from where it stops, without repeating it.', 'a cut-off answer');
  eq(resumeNote({ steps: [{ tool: 'read_file', ok: true }] }), '', 'a finished run');
  const chat = { id: 'c', title: '', createdAt: '', updatedAt: '', mode: 'assistant' as const, messages: [{ role: 'user' as const, content: 'go', createdAt: '' }, { role: 'assistant' as const, content: 'Request failed: Overloaded.', createdAt: '', meta: failed }] };
  eq(metaOf(chat.messages[1]).resume, 'failed', 'kept with the message');
  void openChanges(chat, async () => 'a').then((open) => eq(open.map((c) => [c.filePath, c.original, c.proposed]), [['main.typ', 'a', 'b']], 'a failed run’s change stays open'));
}

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

// requests: answered in place; one still waiting whose event is gone is added; one its turn left, or Spectrum closing,
// waits no more
eq(
  shape([ev('request', { requestId: 'r1', kind: 'permission', params: {} }), ev('answered', { requestId: 'r1' })], { pending: [{ requestId: 'r1', kind: 'permission', params: {} }, { requestId: 'r2', kind: 'question', params: {} }] }),
  [['request', true], ['request', false]],
  'requests'
);
eq(shape([ev('request', { requestId: 'r3', kind: 'permission', params: {} }), ev('state', { status: 'completed' })]), [['request', true]], 'not pending: not waiting');

// a turn stopped mid-call leaves its card failed, not waiting
eq(
  shape([ev('user', { text: 'Go' }), up({ sessionUpdate: 'tool_call', toolCallId: 'w', title: 'Write', status: 'pending' }), up({ sessionUpdate: 'tool_call', toolCallId: 'r', title: 'Read', status: 'in_progress' }), up({ sessionUpdate: 'tool_call', toolCallId: 'd', title: 'Done', status: 'completed' }), ev('state', { status: 'interrupted', error: 'Stopped.' })]),
  [['user', 'Go'], ['tool', 'Write:failed'], ['tool', 'Read:failed'], ['tool', 'Done:completed'], ['notice', 'Stopped.']],
  'stopped'
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
  const later = addEvent(joined, piece(1003, ' four'));
  eq(shape(later), [['user', 'Go'], ['assistant', 'One two three four']], 'a later piece joins on');
  eq([later.length, later[later.length - 1].first], [2, 1000], 'held as one event that names its first piece');
  // a reconnect's stored event over the joined one
  eq(addEvent(later, piece(1004, 'One two three four five', 1000)).map((e) => e.id), [held[0].id, 1004], 'replayed over');
  // tool call updates of one call join; another call's don't
  const call = (n: number, toolCallId: string, status: string): AgentEvent => ({ id: n, type: 'update', data: { sessionUpdate: 'tool_call_update', toolCallId, status }, at: at(n) });
  eq(addEvent(addEvent([call(1, 'a', 'pending')], call(2, 'a', 'completed')), call(3, 'b', 'pending')).map((e) => [e.id, e.data.status]), [[2, 'completed'], [3, 'pending']], 'tool updates');
}

// 20,000 live pieces are added and shown in well under a second
{
  let events: AgentEvent[] = [ev('user', { text: 'Long' })];
  const started = Date.now();
  for (let n = 0; n < 20000; n++) {
    events = addEvent(events, { id: 5000 + n, type: 'update', data: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ab ' } }, at: at(1) });
    if (n % 100 === 0) project(events);
  }
  eq([events.length, String(shape(events)[1][1]).length], [2, 60000], 'one message');
  if (Date.now() - started > 3000) throw new Error(`20,000 pieces took ${Date.now() - started} ms`);
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
      message([{ filePath: 'd.tex', proposed: 'same' }]),
      // proposed against the file as it was then, so Apply merges the edits made since
      message([{ filePath: 'e.tex', original: 'E0', proposed: 'E1' }])
    ]
  };
  const disk: Record<string, string> = { 'a.tex': 'A0', 'b.tex': 'B2', 'd.tex': 'same', 'e.tex': 'user edit\nE0' };
  // closed (applied, rejected, or superseded by a turn's proposal from the same base), a change moves to closed with no
  // texts, and an earlier build's closed ones in the same message with it; changes keeps only those still open, which
  // 1.10.4 offers to review
  const closed = closeChanges(chat.messages, ['a.tex', 'e.tex'], 'superseded');
  eq(closed.last, 3, 'the last message closed in');
  eq(closed.messages.map((m) => m.meta), [
    { changes: [{ filePath: 'b.tex', proposed: 'B1' }, { filePath: 'gone.tex', proposed: 'G' }], closed: [{ filePath: 'a.tex', status: 'superseded' }] },
    { closed: [{ filePath: 'a.tex', status: 'superseded' }, { filePath: 'b.tex', status: 'applied' }, { filePath: 'c.tex', status: 'rejected' }] },
    { changes: [{ filePath: 'd.tex', proposed: 'same' }] },
    { closed: [{ filePath: 'e.tex', status: 'superseded' }] }
  ], 'only the open changes to those files, without their texts');
  eq(closeChanges(chat.messages, ['c.tex'], 'applied').messages, chat.messages, 'nothing open: unchanged');
  eq(closeChanges(closed.messages, ['gone.tex'], 'rejected').messages[0].meta, { changes: [{ filePath: 'b.tex', proposed: 'B1' }], closed: [{ filePath: 'a.tex', status: 'superseded' }, { filePath: 'gone.tex', status: 'rejected' }] }, 'closed again');
  const next = { ...chat, messages: [...closed.messages, message([{ filePath: 'a.tex', original: 'A0', proposed: 'A3' }])] };

  // a large file's base kept as the patch back to it from the proposal, which takes it back exactly
  const bib = Array.from({ length: 30000 }, (_, i) => `@article{key${i},\n  title = {Paper ${i}},\n  year = {20${String(i % 100).padStart(2, '0')}}\n}\n`).join('\n');
  const added = bib.replace('@article{key15000,', '@article{new,\n  title = {New}\n}\n\n@article{key15000,');
  const [big, small, created] = storedChanges([{ filePath: 'refs.bib', original: bib, proposed: added }, { filePath: 'e.tex', original: 'E0', proposed: 'E1' }, { filePath: 'n.tex', original: '', proposed: 'N' }]);
  eq([big.original, typeof big.originalPatch, big.proposed === added, big.originalPatch!.length < 1000], [undefined, 'string', true, true], 'a large file keeps a patch');
  eq([small, created], [{ filePath: 'e.tex', proposed: 'E1', original: 'E0' }, { filePath: 'n.tex', proposed: 'N', original: '' }], 'others their base');
  const large = { ...chat, messages: [message([big])] };

  void Promise.all([openChanges(chat, async (p) => (p in disk ? disk[p] : Promise.reject(new Error('missing')))), openChanges(next, async (p) => disk[p] ?? ''), openChanges(large, async () => 'the file now')]).then(([open, after, reopened]) => {
    eq(open.map((c) => [c.filePath, c.original, c.proposed]), [['a.tex', 'A0', 'A2'], ['gone.tex', '', 'G'], ['e.tex', 'E0', 'E1']], 'open proposals');
    eq(after.map((c) => [c.filePath, c.original, c.proposed]), [['gone.tex', '', 'G'], ['a.tex', 'A0', 'A3']], 'a superseded one is closed');
    eq(reopened.map((c) => [c.filePath, c.original === bib, c.proposed === added]), [['refs.bib', true, true]], 'the base back from its patch');
    // ─── a Spectrum agent turn, heard as events while it happens ───
{
  let n = 0;
  const lastOf = <T,>(list: T[]): T | undefined => list[list.length - 1];
  const rev = (type: string, data: unknown, first?: number): AgentEvent => ({ id: ++n, type, data, at: at(n), ...(first !== undefined && { first }) });
  const said = (items: ReturnType<typeof runView>['items']) => items.map((i) => [i.type, 'text' in i ? i.text : i.type === 'tool' ? `${i.call.title}|${i.call.status}` : i.type === 'todo' ? i.todo.text : '']);
  const turn = [
    rev('state', { status: 'running', turn: 1 }),
    rev('user', { text: 'Fix the errors' }),
    rev('text', { text: 'Looking ' }),
    rev('text', { text: 'around.' }),
    rev('step', { id: 's0-0', tool: 'read_file', about: 'main.tex', status: 'started' }),
    rev('step', { id: 's0-1', tool: 'search_text', about: 'citep', status: 'started' }),
    rev('step', { id: 's0-0', tool: 'read_file', about: 'main.tex', ok: true, ms: 12, status: 'done' }),
    rev('usage', { input: 100, output: 5, total: { input: 100, output: 5, cacheRead: 0, cacheWrite: 0 }, model: 'm' })
  ];
  let held = turn.reduce(addRunEvent, [] as AgentEvent[]);
  eq(held.length, 7, 'the pieces of a message are held as one event');
  eq(held[2].first, 3, 'which names its first piece');
  eq(turn.reduce(addRunEvent, held).length, 7, 'an event heard already is passed over');
  let view = runView(held);
  // the turn's own request is the thread's last message already
  eq(said(view.items), [['assistant', 'Looking around.'], ['tool', 'Read “main.tex”|completed'], ['tool', 'Search the project for “citep”|in_progress']], 'steps appear as they start and are updated in place');
  eq(view.items[1].type === 'tool' && view.items[1].call.ms, 12, 'with how long each took');
  eq([view.status, view.waiting, view.usage?.input, view.result], ['running', '', 100, null], 'still going');

  // a busy provider: the wait is said, and the half answer of the try given up is dropped
  const busy = [rev('step', { id: 's0-1', tool: 'search_text', about: 'citep', ok: true, ms: 3, status: 'done' }), rev('text', { text: 'Half an ans' }), rev('retry', { attempt: 2, of: 3, waitMs: 4000, streamed: true })];
  held = busy.reduce(addRunEvent, held);
  view = runView(held);
  eq(view.waiting, 'The provider is busy. Retrying in 4 s, 2 of 3…', 'the wait');
  eq(lastOf(view.items)?.type, 'tool', 'the half answer is gone');
  eq(retryLine({ attempt: 3, of: 3, waitMs: 0 }), 'The provider is busy. Trying again, 3 of 3…', 'no wait to speak of');

  // the edit with its diff, a compile that says how it went, a message steered in, a to-do, then the result
  const rest = [
    rev('step', { id: 's1-0', tool: 'edit_file', about: 'main.tex', status: 'started' }),
    rev('step', { id: 's1-0', tool: 'edit_file', about: 'main.tex', ok: true, ms: 1, status: 'done', show: { diff: { path: 'main.tex', oldText: '\\citep', newText: '\\parencite' } } }),
    rev('user', { text: 'Keep the passive voice', steered: true }),
    rev('step', { id: 's2-0', tool: 'compile', status: 'started' }),
    rev('step', { id: 's2-0', tool: 'compile', ok: true, ms: 3400, status: 'done', show: { text: '2 errors\nmethod.tex:41: Undefined control sequence\nmethod.tex:88: Missing $ inserted' } }),
    rev('todo', { text: 'Check the figure', link: { file: 'main.tex', line: 3 } }),
    rev('step', { id: 's3-0', tool: 'compile', status: 'started' }),
    rev('text', { text: 'It builds ' }),
    rev('text', { text: 'now.' })
  ];
  held = rest.reduce(addRunEvent, held);
  view = runView(held);
  eq(view.waiting, '', 'the wait is over once the next thing happens');
  eq(said(view.items).slice(3), [['tool', 'Edit “main.tex”|completed'], ['user', 'Keep the passive voice'], ['tool', 'Compiled the draft: 2 errors|completed'], ['todo', 'Check the figure'], ['tool', 'Compile the draft|in_progress'], ['assistant', 'It builds now.']], 'the rest of the turn');
  const edit = view.items[3];
  eq(edit.type === 'tool' && edit.call.content, [{ type: 'diff', path: 'main.tex', oldText: '\\citep', newText: '\\parencite' }], 'an edit opens to its two sides');
  const compiled = view.items[5];
  eq(compiled.type === 'tool' && [compiled.call.kind, compiled.call.ms, compiled.call.content[0]], ['execute', 3400, { type: 'content', content: { type: 'text', text: '2 errors\nmethod.tex:41: Undefined control sequence\nmethod.tex:88: Missing $ inserted' } }], 'a compile opens to its errors');

  // a page that connects later is sent the answer whole, in place of the pieces it had
  const whole = { id: n + 1, type: 'text', data: { text: 'It builds now. All of it.' }, at: at(n + 1), first: n - 1 };
  n += 1;
  held = addRunEvent(held, whole);
  eq(lastOf(runView(held).items), { type: 'assistant', key: `rt${whole.first}`, text: 'It builds now. All of it.' }, 'the stored message replaces its pieces');

  // Stop: the step still going is no longer, and the result is the turn's
  const result = { turn: 1, ok: false, reply: 'Stopped.', incomplete: 'stopped', patches: [], steps: [] };
  held = [rev('state', { status: 'stopping', turn: 1 }), rev('result', result), rev('state', { status: 'stopped', turn: 1, incomplete: 'stopped' })].reduce(addRunEvent, held);
  view = runView(held);
  eq(view.status, 'stopped', 'the run’s state');
  eq(lastOf(view.items.filter((i) => i.type === 'tool'))?.call.status, 'failed', 'no step is left going');
  eq([view.result?.incomplete, view.result?.at], ['stopped', at(n - 1)], 'the outcome, dated by the backend');
}

// a finished turn in the thread reads as it did while it happened: what was said between the steps is in its place
{
  const steps = [{ tool: 'read_file', about: 'main.tex', ok: true, ms: 12 }, { tool: 'compile', ok: true, ms: 900, show: { text: 'builds' } }, { tool: 'delete_file', about: 'old.tex', ok: false }];
  const items = threadItems([
    { role: 'user', content: 'Fix it', createdAt: '' },
    { role: 'assistant', content: 'Done.', createdAt: '', meta: { steps, says: [{ before: 0, text: 'Looking around.' }, { before: 1, text: 'Keep it short', user: true }, { before: 3, text: 'One left.' }], todos: [{ text: 'Check' }] } },
    { role: 'assistant', content: 'Request failed: Overloaded.', createdAt: '', meta: { error: true, resume: 'failed' } },
    // a thread saved before 2.6: steps with no time, nothing said between them
    { role: 'assistant', content: 'Earlier.', createdAt: '', meta: { steps: [{ tool: 'apply_patch', about: 'a.tex', ok: true }, { tool: 'get_compile_log', ok: true }] } }
  ]);
  eq(
    items.map((i) => [i.type, 'text' in i ? i.text : i.type === 'tool' ? i.call.title : i.type === 'todo' ? i.todo.text : '']),
    [['user', 'Fix it'], ['assistant', 'Looking around.'], ['tool', 'Read “main.tex”'], ['user', 'Keep it short'], ['tool', 'Compiled the draft: builds'], ['tool', 'Propose deleting “old.tex”'], ['assistant', 'One left.'], ['assistant', 'Done.'], ['todo', 'Check'], ['notice', 'Request failed: Overloaded.'], ['tool', 'Propose a change to “a.tex”'], ['tool', 'Read the compile log'], ['assistant', 'Earlier.']],
    'a thread’s items'
  );
  eq(new Set(items.map((i) => i.key)).size, items.length, 'each with its own key');
  eq(stepCall({ tool: 'some_new_tool', ok: true }, 'x').title, 'some_new_tool', 'a tool this build has no words for is named as it is');
  // a proposed deletion stays one through the thread's store
  const stored = storedChanges([{ filePath: 'old.tex', original: 'x', proposed: '', deleted: true }]);
  eq(stored, [{ filePath: 'old.tex', proposed: '', deleted: true, original: 'x' }], 'kept as a deletion');
  void openChanges({ id: 'd', title: '', createdAt: '', updatedAt: '', mode: 'assistant', messages: [{ role: 'assistant', content: '', createdAt: '', meta: { changes: stored } }] }, async () => 'x').then((open) => eq(open.map((c) => [c.filePath, c.deleted]), [['old.tex', true]], 'and offered again as one'));
  eq(resumeNote({ resume: 'stopped' }), 'The user stopped your last run before its answer. Go on from there. Do not redo what is finished.', 'a stopped run');
}

// a question, a plan and the pause before the next file: the turn's last word, a card while it waits for its answer
{
  const user = (content: string, meta?: Record<string, unknown>) => ({ role: 'user' as const, content, createdAt: '', ...(meta && { meta }) });
  const reply = (content: string, meta?: Record<string, unknown>) => ({ role: 'assistant' as const, content, createdAt: '', ...(meta && { meta }) });
  const shape = (messages: Parameters<typeof threadItems>[0]) => threadItems(messages).map((i) => [i.type, 'text' in i ? i.text : i.type === 'plan' ? i.steps.join('|') : i.type === 'request' ? `${i.request.kind}:${i.request.params.toolCall?.title || i.request.params.message}:${i.answered}` : '']);
  const question = { kind: 'question' as const, question: 'Which voice?', options: ['We', 'Passive'] };
  const asked = [user('Fix the tone'), reply('Which voice?\n- We\n- Passive', { ask: question, steps: [{ tool: 'ask_user', ok: true }] })];
  eq(shape(asked), [['user', 'Fix the tone'], ['tool', ''], ['request', 'permission:Which voice?:false']], 'a question waits as a card');
  eq(threadItems(asked)[1].type === 'tool' && (threadItems(asked)[1] as any).call.title, 'Ask you a question', 'its step has words');
  // answered: the question reads as the agent's text, and the answer is the user's next message
  eq(shape([...asked, user('We')]).slice(2), [['assistant', 'Which voice?\n- We\n- Passive'], ['user', 'We']], 'answered, it is text');
  eq(shape([user('x'), reply('Which voice?', { ask: { ...question, dismissed: true } })])[1], ['assistant', 'Which voice?'], 'closed unanswered, it is text');
  // the card local agents' questions use: options as buttons, or a box to type in
  eq(askRequest(question, 'q1').params.options, [{ optionId: 'We', name: 'We' }, { optionId: 'Passive', name: 'Passive' }], 'options are buttons');
  eq(askRequest({ kind: 'question', question: 'Which journal?' }, 'q2'), { requestId: 'q2', kind: 'question', params: { message: 'Which journal?', questions: [{ id: 'answer', question: 'Your answer' }] } }, 'no options: a box');
  eq([askAnswer(question, { optionId: 'Passive' }), askAnswer(question, { cancelled: true }), askAnswer(question, { action: 'accept', content: { answer: ' Both ' } }), askAnswer(question, { action: 'decline' })], ['Passive', null, 'Both', null], 'what was chosen is the next message');
  let empty = '';
  try { askAnswer(question, { action: 'accept', content: {} }); } catch (err) { empty = (err as Error).message; }
  eq(empty, 'Type an answer first.', 'nothing typed is no answer');
  const next = { kind: 'next' as const, path: 'method.tex' };
  eq(askRequest(next, 'q3').params.options, [{ optionId: 'go', name: 'Go on' }], 'the next file: Go on, or Cancel');
  eq([askAnswer(next, { optionId: 'go' }), askAnswer(next, { cancelled: true })], ['Go on with method.tex.', null], 'Go on names the file');

  // a plan: a card while it waits; approved, the thread's plan, which the turns after tick
  const plan = { kind: 'plan' as const, steps: ['Add refs', 'Rewrite 3.2', 'Rename the macro'] };
  const planned = [user('Restructure'), reply('Plan:\n1. Add refs\n2. Rewrite 3.2\n3. Rename the macro', { ask: plan })];
  eq(shape(planned)[1], ['plan', 'Add refs|Rewrite 3.2|Rename the macro'], 'a plan waits as a card');
  eq(planOf(planned), { entries: [], open: false, eachFile: false }, 'a plan not approved is no plan yet');
  const pending = [{ content: 'Add refs', status: 'pending' }, { content: 'Rewrite 3.2', status: 'pending' }];
  const approved = [...planned, user('Approve, ask before each file', { plan: pending, eachFile: true })];
  eq(shape(approved)[1], ['assistant', 'Plan:\n1. Add refs\n2. Rewrite 3.2\n3. Rename the macro'], 'approved, the plan reads as text');
  eq(planOf(approved), { entries: pending, open: true, eachFile: true }, 'the approved steps are the plan');
  const half = [{ content: 'Add refs', status: 'completed' }, { content: 'Rewrite 3.2', status: 'pending' }];
  const paused = [...approved, reply('The changes to refs.bib are ready to review. Next: method.tex.', { plan: half, ask: next })];
  eq(planOf(paused), { entries: half, open: true, eachFile: true }, 'as the last turn left them');
  eq(shape(paused).slice(-1), [['request', 'permission:Go on to method.tex? The changes ready so far wait in the tray: review them first if you like.:false']], 'the pause before the next file');
  // Cancel on that card: the rest of the plan runs without stopping
  eq(planOf([...approved, reply('Next: method.tex.', { plan: half, ask: { ...next, dismissed: true } })]).eachFile, false, 'Cancel ends the pauses');
  const done = half.map((e) => ({ ...e, status: 'completed' }));
  eq(planOf([...paused, user('Go on'), reply('Done.', { plan: done })]), { entries: done, open: false, eachFile: false }, 'a finished plan asks for nothing more');
  // a new approval replaces the plan
  eq(planOf([...paused, user('Approve and run', { plan: [{ content: 'Other', status: 'pending' }] })]), { entries: [{ content: 'Other', status: 'pending' }], open: true, eachFile: false }, 'the latest approval is the plan');
  eq(planPrompt([], false), 'The plan is approved: carry out its steps in order.', 'approved as it was');
  eq(planPrompt(['Rename the macro'], true), 'The plan is approved, as the user changed it: carry out its steps in order. The user left out, so do not do: Rename the macro.', 'approved with a step left out');

  // while the turn happens: a tick is the plan's new state, a suggested line is a card
  let n = 100;
  const live = [{ id: ++n, type: 'state', data: { status: 'running', turn: 2 }, at: '' }, { id: ++n, type: 'plan', data: { entries: half }, at: '' }, { id: ++n, type: 'instruction', data: { text: 'Use \\qty for units.' }, at: '' }, { id: ++n, type: 'plan', data: { entries: done }, at: '' }].reduce(addRunEvent, [] as AgentEvent[]);
  const view = runView(live);
  eq(view.plan, done, 'the plan as last ticked');
  eq(view.items.map((i) => [i.type, 'text' in i ? i.text : '']), [['instruction', 'Use \\qty for units.']], 'a suggested instruction');
  eq(runView([]).plan, null, 'no tick, no plan from the turn');
  // in the thread, a suggested line stays a card after the reply
  eq(shape([user('x'), reply('Noted.', { instructions: ['Use \\qty for units.'] })]).slice(1), [['assistant', 'Noted.'], ['instruction', 'Use \\qty for units.']], 'kept with the reply');
}

console.log('transcript: all checks passed');
  });
}
