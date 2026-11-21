import { applyPatch, createPatch } from 'diff';
import type { AgentAsk, AgentEvent, AgentRunResult, AgentSaid, AgentStep, AgentUsage, AgentUserRequest, ChatThread, Incomplete, SuggestedTodo } from '../../api/client';

// A local agent's stored events (agentSessionService.js) as the workspace shows them: messages with their streamed
// chunks joined, one card per tool call updated in place, the latest plan, commands and options. And what a Spectrum
// agent thread's messages keep, with the proposals in it still waiting for the tray.

/** What a tool call shows: text, a file's change, or a terminal Spectrum ran for it (ACP ToolCallContent) */
export type ToolContent =
  | { type: 'content'; content: { type: string; text?: string; data?: string; mimeType?: string } }
  | { type: 'diff'; path: string; oldText?: string | null; newText: string }
  | { type: 'terminal'; terminalId: string };

export interface ToolCall {
  toolCallId: string;
  title: string;
  /** read, edit, delete, move, search, execute, think, fetch, switch_mode or other */
  kind: string;
  /** pending, in_progress, completed or failed */
  status: string;
  content: ToolContent[];
  locations: { path: string; line?: number }[];
  rawInput?: unknown;
  rawOutput?: unknown;
  /** how long it took, where the agent says (the Spectrum agent's steps) */
  ms?: number;
}

export type PlanEntry = { content: string; priority?: string; status: string };
export type AgentCommand = { name: string; description: string; input?: { hint?: string } };
/** A "Before AI changes" checkpoint, shown where it was saved */
export type Checkpoint = { id: number; number: number; label: string; createdAt: string };

type Said<T> = { type: T; key: string; text: string };
export type Item =
  | (Said<'user'> & { pictures?: string[] })
  | Said<'assistant'>
  | Said<'thought'>
  | { type: 'tool'; key: string; call: ToolCall }
  | { type: 'todo'; key: string; todo: SuggestedTodo }
  | { type: 'request'; key: string; request: AgentUserRequest; answered: boolean }
  /** the Spectrum agent's plan, waiting for the user's approval */
  | { type: 'plan'; key: string; steps: string[] }
  /** a line the Spectrum agent suggests to remember for the project */
  | { type: 'instruction'; key: string; text: string }
  | { type: 'notice'; key: string; text: string; error: boolean }
  /** a host isolation refused the agent, as it is not on its list; allowed once the user allowed it from here */
  | { type: 'network'; key: string; host: string; allowed: boolean }
  | { type: 'checkpoint'; key: string; checkpoint: Checkpoint };

export interface Projection {
  items: Item[];
  /** the agent's plan as last sent: each update replaces it */
  plan: PlanEntry[];
  commands: AgentCommand[];
  configOptions: any[];
  modes: { currentModeId: string; availableModes: { id: string; name: string; description?: string }[] } | null;
  /** each terminal Spectrum ran for the agent, by id: its command line */
  terminals: Record<string, string>;
}

export const RUNNING = ['starting', 'running', 'stopping'];

const REPLAYED = ['user_message_chunk', 'agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'tool_call_update', 'plan'];
const TOOL_FIELDS = ['title', 'kind', 'status', 'content', 'locations', 'rawInput', 'rawOutput'] as const;

const CHUNKS = ['user_message_chunk', 'agent_message_chunk', 'agent_thought_chunk'];

/** A live piece joined onto the event held last, as the backend stores them (agentSessionService's joined), or null. */
function joinPiece(last: AgentEvent | undefined, e: AgentEvent) {
  const [a, b] = [last?.data, e.data];
  if (e.type !== 'update' || last?.type !== 'update' || !a || !b || a.sessionUpdate !== b.sessionUpdate) return null;
  if (CHUNKS.includes(b.sessionUpdate)) {
    if (a.content?.type !== 'text' || b.content?.type !== 'text' || (a.messageId ?? null) !== (b.messageId ?? null)) return null;
    return { ...a, content: { ...a.content, text: a.content.text + b.content.text } };
  }
  return b.sessionUpdate === 'tool_call_update' && a.toolCallId === b.toolCallId ? { ...a, ...b } : null;
}

/**
 * A live event added to those held: a stored event that joins streamed pieces (first) takes the place of the pieces
 * from first on, which a reconnect replays it over. A live piece joins the one held before it the same way, so a long
 * turn holds one event per message rather than one per piece.
 */
export function addEvent(old: AgentEvent[], e: AgentEvent) {
  if (old.some((item) => item.id === e.id)) return old;
  if (e.first !== undefined) return [...old.filter((item) => item.id < e.first! || item.id > e.id), e];
  const last = old[old.length - 1];
  const data = joinPiece(last, e);
  return data ? [...old.slice(0, -1), { ...e, first: last.first ?? last.id, data }] : [...old, e];
}

export function project(events: AgentEvent[], { pending = [], checkpoints = [] }: { pending?: AgentUserRequest[]; checkpoints?: Checkpoint[] } = {}): Projection {
  const items: Item[] = [];
  const tools = new Map<string, ToolCall>();
  const requests = new Map<string, Extract<Item, { type: 'request' }>>();
  const refused = new Map<string, Extract<Item, { type: 'network' }>>();
  const out: Projection = { items, plan: [], commands: [], configOptions: [], modes: null, terminals: {} };
  const saved = [...checkpoints].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let next = 0;
  const placeCheckpoints = (at: string) => {
    for (; next < saved.length && saved[next].createdAt <= at; next++) items.push({ type: 'checkpoint', key: `checkpoint-${saved[next].id}`, checkpoint: saved[next] });
  };
  const text = (type: 'user' | 'assistant' | 'thought', key: string, chunk: string) => {
    const last = items[items.length - 1];
    if (last?.type === type && 'text' in last && type !== 'user') last.text += chunk;
    else if (chunk) items.push({ type, key, text: chunk });
  };
  // between connecting and the session being ready, an agent loading its session sends the conversation again
  let loading = false;
  for (const e of events) {
    placeCheckpoints(e.at);
    const d = e.data || {};
    if (e.type === 'user') {
      // a turn's tool calls end with it, and an agent may number them again in a new session
      tools.clear();
      text('user', `user-${e.id}`, String(d.text || ''));
    }
    else if (e.type === 'initialized') loading = true;
    // a turn that ended (stopped, say) leaves none of its tool calls still going
    else if (e.type === 'state' && !RUNNING.includes(d.status)) {
      for (const call of tools.values()) if (call.status === 'pending' || call.status === 'in_progress') call.status = 'failed';
      if (d.error) items.push({ type: 'notice', key: `notice-${e.id}`, text: String(d.error), error: d.status === 'failed' });
    }
    else if (e.type === 'session') {
      loading = false;
      if (Array.isArray(d.configOptions)) out.configOptions = d.configOptions;
      if (d.modes?.availableModes) out.modes = d.modes;
    } else if (e.type === 'terminal') out.terminals[d.terminalId] = [d.command, ...(d.args || [])].join(' ');
    else if (e.type === 'reset' && Array.isArray(d.paths)) items.push({ type: 'notice', key: `reset-${e.id}`, text: `Rejected: the agent’s copy of ${d.paths.map((p: string) => `“${p}”`).join(', ')} is back to your version, and the agent is told with its next task.`, error: false });
    // what the Spectrum tools' suggest_todo put forward, read back when the turn ends
    else if (e.type === 'todo' && typeof d.text === 'string') items.push({ type: 'todo', key: `todo-${e.id}`, todo: { text: d.text, ...(d.link && { link: d.link }), ...(typeof d.group === 'string' && d.group && { group: d.group }) } });
    else if (e.type === 'request') {
      // answered, or left when its turn ended: only one still pending waits for an answer
      const item = { type: 'request' as const, key: `request-${d.requestId}`, request: d as AgentUserRequest, answered: !pending.some((p) => p.requestId === d.requestId) };
      requests.set(d.requestId, item);
      items.push(item);
    } else if (e.type === 'answered') {
      const item = requests.get(d.requestId);
      if (item) item.answered = true;
    } else if (e.type === 'network' && typeof d.host === 'string') {
      // allowing a host answers the card that said it was refused
      const said = refused.get(d.host);
      if (d.allowed && said) said.allowed = true;
      else if (!d.allowed) {
        const item = { type: 'network' as const, key: `network-${e.id}`, host: d.host, allowed: false };
        refused.set(d.host, item);
        items.push(item);
      }
    } else if (e.type === 'notice' || (e.type === 'state' && d.error)) {
      const message = String(d.error || d.message || '');
      // a task stopped by the user ends with an error too, but only a failure is shown as one
      if (message) items.push({ type: 'notice', key: `notice-${e.id}`, text: message, error: e.type === 'notice' ? !!d.error : d.status === 'failed' });
    } else if (e.type === 'update') {
      const u = d.sessionUpdate;
      if (loading && REPLAYED.includes(u)) continue;
      if (u === 'agent_message_chunk' || u === 'agent_thought_chunk' || u === 'user_message_chunk') {
        text(u === 'agent_message_chunk' ? 'assistant' : u === 'agent_thought_chunk' ? 'thought' : 'user', `${u}-${e.id}`, d.content?.type === 'text' ? String(d.content.text || '') : '');
      } else if ((u === 'tool_call' || u === 'tool_call_update') && d.toolCallId) {
        const old = tools.get(d.toolCallId);
        const call: ToolCall = old || { toolCallId: d.toolCallId, title: '', kind: 'other', status: 'pending', content: [], locations: [] };
        for (const field of TOOL_FIELDS) if (d[field] !== undefined && d[field] !== null) (call as any)[field] = d[field];
        if (!old) {
          tools.set(d.toolCallId, call);
          items.push({ type: 'tool', key: `tool-${e.id}`, call });
        }
      } else if (u === 'plan') out.plan = Array.isArray(d.entries) ? d.entries : [];
      else if (u === 'available_commands_update') out.commands = Array.isArray(d.availableCommands) ? d.availableCommands : [];
      else if (u === 'current_mode_update' && out.modes) out.modes = { ...out.modes, currentModeId: d.currentModeId };
      else if (u === 'config_option_update' && Array.isArray(d.configOptions)) out.configOptions = d.configOptions;
    }
  }
  placeCheckpoints('\uffff');
  // a request whose event has been dropped from a long session's start
  for (const request of pending) if (!requests.has(request.requestId)) items.push({ type: 'request', key: `request-${request.requestId}`, request, answered: false });
  return out;
}

/**
 * What a Spectrum agent thread keeps in ChatMessage.meta; changes as the bottom card's Edit chats kept them, now with
 * the file each was proposed against (original, or for a large file originalPatch, which takes proposed back to it),
 * and steps its tool calls. A closed change (applied, rejected, or superseded by a later turn's proposal for its file,
 * made from the same base) moves to closed with only its file and status: a thread on a large file stays under the chat
 * cap, and 1.10.4, which offers to review every change it finds, never meets one without its text. Threads saved by
 * earlier 2.0 builds kept a closed change in changes, with its status.
 */
export type ChangeStatus = 'applied' | 'rejected' | 'superseded';
type StoredChange = { filePath: string; original?: string; originalPatch?: string; proposed?: string; status?: ChangeStatus; deleted?: boolean };
export type ThreadMeta = {
  changes?: StoredChange[];
  closed?: { filePath: string; status: ChangeStatus }[];
  todos?: SuggestedTodo[];
  checkpoints?: Checkpoint[];
  steps?: AgentStep[];
  /** what was said between the steps: the model's words, and messages steered in */
  says?: AgentSaid[];
  /** the tokens of the turn's model calls */
  usage?: AgentUsage;
  /** the run and turn this reply is the result of ("run:turn"), so a page that connects later saves it once */
  run?: string;
  error?: boolean;
  /** the run ended before its answer, and Continue goes on from it */
  resume?: Incomplete;
  /** what the turn ended with for the user to answer (a question, a plan, the next file); dismissed: closed unanswered */
  ask?: AgentAsk & { dismissed?: boolean };
  /** on the user's approval: the plan's steps; on a reply: the steps as that turn left them */
  plan?: PlanEntry[];
  /** on the user's approval: the agent stops before each new file it would change */
  eachFile?: boolean;
  /** lines the agent suggested to remember for the project */
  instructions?: string[];
  /** on the user's message: small copies of the pictures sent with it */
  pictures?: string[];
};
export const metaOf = (m: { meta?: Record<string, unknown> }) => (m.meta || {}) as ThreadMeta;

/** What the thread says under a run that ended before its answer, beside Continue. */
export const RESUME_HINT: Record<Incomplete, string> = {
  failed: 'The run stopped at a failed request. What it had done is kept.',
  steps: 'The agent stopped at its limit of 25 steps.',
  cut: 'The answer was cut off by the model’s output limit.',
  stopped: 'You stopped the agent. What it had done is kept.'
};

/**
 * What the next run is told of one that ended before its answer, so it goes on from there and does not start again:
 * why it ended, the steps it had finished and that its changes are still open. '' after a finished run.
 */
export function resumeNote(meta: ThreadMeta) {
  if (!meta.resume) return '';
  const steps = (meta.steps || []).filter((s) => s.ok).map((s) => [s.tool, s.about].filter(Boolean).join(' '));
  return [
    { failed: 'Your last run stopped before its answer, at a request to the model that failed.', steps: 'Your last run stopped at its limit of 25 steps, before its answer.', cut: 'Your last answer was cut off by the output limit: go on from where it stops, without repeating it.', stopped: 'The user stopped your last run before its answer.' }[meta.resume],
    steps.length ? `Steps it had finished: ${steps.slice(-40).join('; ')}.` : '',
    meta.changes?.length ? `The changes it prepared (${meta.changes.map((c) => c.filePath).join(', ')}) are still open: read_file shows each file with them, and a new change builds on them.` : '',
    meta.resume === 'cut' ? '' : 'Go on from there. Do not redo what is finished.'
  ].filter(Boolean).join(' ');
}

/**
 * A turn's changes as a thread keeps them: a large file's base as the patch from the proposal back to it, a few bytes
 * where the base itself would take as much of the chat cap again.
 */
export const storedChanges = (changes: { filePath: string; original: string; proposed: string; deleted?: boolean }[]): StoredChange[] =>
  changes.map(({ filePath, original, proposed, deleted }) => ({ filePath, proposed, ...(deleted && { deleted }), ...(!original || original.length + proposed.length < 1_000_000 ? { original } : { originalPatch: createPatch(filePath, proposed, original) }) }));

/**
 * Each file's latest proposal not applied or rejected yet, against the file it was proposed against, so applying it
 * merges the user's edits since; a proposal from before 2.0's review fixes, which kept no file, against the file as it
 * is now (read).
 */
export async function openChanges(chat: ChatThread, read: (path: string) => Promise<string>) {
  const proposed = new Map<string, StoredChange>();
  for (const m of chat.messages) {
    const meta = metaOf(m);
    for (const c of meta.changes || []) {
      if (c.status) proposed.delete(c.filePath);
      else proposed.set(c.filePath, c);
    }
    for (const c of meta.closed || []) proposed.delete(c.filePath);
  }
  const list = await Promise.all(
    [...proposed].map(async ([filePath, c]) => {
      const back = c.originalPatch != null && applyPatch(c.proposed ?? '', c.originalPatch);
      return { filePath, original: typeof back === 'string' ? back : c.original ?? (await read(filePath).catch(() => '')), proposed: c.proposed ?? '', source: 'Spectrum agent', ...(c.deleted && { deleted: true }) };
    })
  );
  return list.filter((c) => c.deleted || c.original !== c.proposed);
}

/**
 * The thread's open changes to these files closed with status: moved to closed with only the file and status (and an
 * earlier build's closed ones in the same message with them); last: the last message closed in (-1: none).
 */
export function closeChanges(messages: ChatThread['messages'], paths: string[], status: ChangeStatus) {
  let last = -1;
  const closed = messages.map((m, i) => {
    const meta = metaOf(m);
    if (!meta.changes?.some((c) => !c.status && paths.includes(c.filePath))) return m;
    last = i;
    const open = meta.changes.filter((c) => !c.status && !paths.includes(c.filePath));
    const next: ThreadMeta = { ...meta, closed: [...(meta.closed || []), ...meta.changes.filter((c) => !open.includes(c)).map((c) => ({ filePath: c.filePath, status: c.status ?? status }))] };
    if (open.length) next.changes = open;
    else delete next.changes;
    return { ...m, meta: next };
  });
  return { messages: closed, last };
}

// each Spectrum agent tool as a card says it: its kind, and its title alone and with what it was about
const STEPS: Record<string, [kind: string, alone: string, about?: string]> = {
  read_file: ['read', 'Read a file', 'Read'],
  list_files: ['search', 'List the project’s files', 'List the files in'],
  edit_file: ['edit', 'Edit a file', 'Edit'],
  propose_patch: ['edit', 'Propose a change', 'Propose a change to'],
  apply_patch: ['edit', 'Propose a change', 'Propose a change to'],
  delete_file: ['delete', 'Propose deleting a file', 'Propose deleting'],
  compile: ['execute', 'Compile the draft'],
  get_log: ['read', 'Read the compile log'],
  get_compile_log: ['read', 'Read the compile log'],
  search_text: ['search', 'Search the project', 'Search the project for'],
  project_map: ['read', 'Read the project’s map'],
  bib_entries: ['read', 'List the bibliography'],
  bib_search: ['search', 'Search the bibliography', 'Search the bibliography for'],
  web_search: ['search', 'Search the web', 'Search the web for'],
  arxiv_search: ['search', 'Search arXiv', 'Search arXiv for'],
  literature_search: ['search', 'Search the literature', 'Search the literature for'],
  arxiv_bibtex: ['fetch', 'Get BibTeX from arXiv', 'Get BibTeX for'],
  fetch_bibtex: ['fetch', 'Get BibTeX', 'Get BibTeX for'],
  check_references: ['search', 'Check the references against their sources'],
  read_source: ['read', 'Read a paper', 'Read'],
  record_claim: ['other', 'Record a checked claim', 'Record the claim at'],
  load_skill: ['read', 'Load a skill', 'Load the skill'],
  read_skill_file: ['read', 'Read a skill’s file', 'Read the skill file'],
  list_todos: ['read', 'List the to-dos'],
  suggest_todo: ['other', 'Suggest a to-do', 'Suggest the to-do'],
  ask_user: ['other', 'Ask you a question'],
  propose_plan: ['other', 'Propose a plan'],
  step_done: ['other', 'Tick off a step of the plan'],
  suggest_memory: ['other', 'Suggest a line to remember'],
  view_pdf_page: ['read', 'Look at a page', 'Look at'],
  preview_figure: ['read', 'Look at a figure', 'Look at']
};

// ─── The Spectrum agent's questions and plans: what a turn ended with, which the user's next message answers ───

// steps with nothing to open, which the card under them or the plan strip already shows: no card unless one failed.
// Nor for a change held back by the pause before the next file (paused), which the “Go on to …?” card stands for.
const QUIET = ['ask_user', 'propose_plan', 'step_done', 'suggest_memory'];
const quiet = (step: { tool: string; ok?: boolean; status?: string; paused?: boolean }) => !!step.paused || (QUIET.includes(step.tool) && (step.status ? step.status !== 'failed' : step.ok !== false));

/**
 * A question, or the pause before the next file, as the card local agents' questions use (AgentQuestion) takes it:
 * the options as buttons with Cancel, or a box to type the answer in.
 */
export function askRequest(ask: Exclude<AgentAsk, { kind: 'plan' }>, id: string): AgentUserRequest {
  if (ask.kind === 'next') return { requestId: id, kind: 'permission', params: { toolCall: { title: `Go on to ${ask.path}? The changes ready so far wait in the tray: review them first if you like.` }, options: [{ optionId: 'go', name: 'Go on' }] } };
  if (ask.options?.length) return { requestId: id, kind: 'permission', params: { toolCall: { title: ask.question }, options: ask.options.map((o) => ({ optionId: o, name: o })) } };
  return { requestId: id, kind: 'question', params: { message: ask.question, questions: [{ id: 'answer', question: 'Your answer' }] } };
}

/** What the user chose on that card, as their next message: null when they closed it, and an error when there is nothing to send. */
export function askAnswer(ask: AgentAsk, answer: any): string | null {
  if (answer?.cancelled || answer?.action === 'decline') return null;
  if (ask.kind === 'next') return `Go on with ${ask.path}.`;
  const text = String(answer?.optionId ?? answer?.content?.answer ?? '').trim();
  if (!text) throw new Error('Type an answer first.');
  return text;
}

/**
 * The thread's plan: the steps the user last approved, as the turns since left them, for the plan strip and for the
 * agent to tick; eachFile while the user asked to see each file's changes before the next and steps are still open.
 */
export function planOf(messages: ChatThread['messages']) {
  let entries: PlanEntry[] = [];
  let eachFile = false;
  for (const m of messages) {
    const meta = metaOf(m);
    if (meta.plan) {
      entries = meta.plan;
      if (m.role === 'user') eachFile = !!meta.eachFile;
    }
    // Cancel on “Go on to …?”: the rest runs without stopping
    if (meta.ask?.kind === 'next' && meta.ask.dismissed) eachFile = false;
  }
  const open = entries.some((e) => e.status !== 'completed');
  return { entries, open, eachFile: eachFile && open };
}

/** What the agent is told when the user approves a plan: the steps themselves go with the request (the backend lists them). */
export const planPrompt = (left: string[], changed: boolean) =>
  [`The plan is approved${changed ? ', as the user changed it' : ''}: carry out its steps in order.`, left.length ? `The user left out, so do not do: ${left.join('; ')}.` : ''].filter(Boolean).join(' ');

/**
 * A Spectrum agent's tool call as a tool card shows it: still going (status 'started', from a run's event) or done,
 * with how long it took and what it opens to. A compile's card says how the build went in its title.
 */
export function stepCall(step: AgentStep & { status?: string }, id: string): ToolCall {
  const [kind, alone, about] = STEPS[step.tool] || ['other', step.tool];
  const built = step.tool === 'compile' && step.ok ? step.show?.text?.split('\n')[0] : '';
  const title = built ? `Compiled the draft: ${built}` : about && step.about ? `${about} “${step.about}”` : alone;
  const content: ToolContent[] = step.show?.diff ? [{ type: 'diff', ...step.show.diff }] : step.show?.text ? [{ type: 'content', content: { type: 'text', text: step.show.text } }] : [];
  // a page or a figure the agent looked at, as an image block; a figure's file is where its card's composer button goes
  const picture = /^data:(image\/png);base64,(.+)$/.exec(step.show?.image || '');
  if (picture) content.push({ type: 'content', content: { type: 'image', mimeType: picture[1], data: picture[2] } });
  const locations = step.tool === 'preview_figure' && step.about ? [{ path: step.about }] : [];
  return { toolCallId: id, title, kind, status: step.status === 'started' ? 'in_progress' : step.ok ? 'completed' : 'failed', content, locations, ...(step.ms !== undefined && { ms: step.ms }) };
}

/** A Spectrum agent thread's messages as the transcript's items: each reply with its steps, and what was said between them, in their order. */
export function threadItems(messages: ChatThread['messages']): Item[] {
  return messages.flatMap((m, i): Item[] => {
    const meta = metaOf(m);
    const steps = meta.steps || [];
    const says = meta.says || [];
    const said = (j: number) => says.flatMap((s, k): Item[] => ((j < steps.length ? s.before === j : s.before >= j) ? [{ type: s.user ? 'user' : 'assistant', key: `w${i}-${k}`, text: s.text }] : []));
    // a question or a plan still waits for its answer while it is the thread's last word; after that it reads as text
    const ask = meta.ask && !meta.ask.dismissed && i === messages.length - 1 ? meta.ask : null;
    return [
      ...steps.flatMap((step, j): Item[] => [...said(j), ...(quiet(step) ? [] : [{ type: 'tool' as const, key: `s${i}-${j}`, call: stepCall(step, `${i}-${j}`) }])]),
      ...said(steps.length),
      m.role === 'user' ? { type: 'user', key: `u${i}`, text: m.content, ...(meta.pictures?.length && { pictures: meta.pictures }) } : meta.error ? { type: 'notice', key: `n${i}`, text: m.content, error: true }
        : ask?.kind === 'plan' ? { type: 'plan', key: `p${i}`, steps: ask.steps }
          : ask ? { type: 'request', key: `q${i}`, request: askRequest(ask, `q${i}`), answered: false }
            : { type: 'assistant', key: `a${i}`, text: m.content },
      ...(meta.todos || []).map((todo, j): Item => ({ type: 'todo', key: `t${i}-${j}`, todo })),
      ...(meta.instructions || []).map((text, j): Item => ({ type: 'instruction', key: `i${i}-${j}`, text })),
      ...(meta.checkpoints || []).map((checkpoint): Item => ({ type: 'checkpoint', key: `c${i}-${checkpoint.id}`, checkpoint }))
    ];
  });
}

// ─── A Spectrum agent run's events (agentRunService.js), heard while a turn happens ───

/**
 * A run's event added to those held. A text piece joins the one before it, as the backend stores them, so a long
 * answer is one event; an event that stands for earlier pieces (first, replayed to a page that connects later) takes
 * their place; one heard already is passed over.
 */
export function addRunEvent(old: AgentEvent[], e: AgentEvent) {
  const last = old[old.length - 1];
  if (last && e.id <= last.id) return old;
  if (e.first !== undefined) return [...old.filter((item) => item.id < e.first!), e];
  if (e.type === 'text' && last?.type === 'text') return [...old.slice(0, -1), { ...e, first: last.first ?? last.id, data: { text: last.data.text + e.data.text } }];
  return [...old, e];
}

/** What the page says while the agent waits to try a busy provider, or a connection that dropped, again. */
export const retryLine = ({ attempt, of, waitMs, dropped }: { attempt: number; of: number; waitMs: number; dropped?: boolean }) =>
  `${dropped ? 'The connection dropped.' : 'The provider is busy.'} ${waitMs >= 500 ? `Retrying in ${Math.ceil(waitMs / 1000)} s` : 'Trying again'}, ${attempt} of ${of}…`;

/**
 * A turn's events as the transcript shows them while it happens: the same items a finished turn has (threadItems),
 * so nothing moves when it ends. items leave out the turn's own request, which the thread already shows; waiting:
 * what to say in place of “Working…” (a retry's wait); status: the run's; usage: the turn's tokens so far; result:
 * the turn's outcome once it has ended; plan: the approved plan's steps once the turn has ticked one.
 */
export function runView(events: AgentEvent[]) {
  const items: Item[] = [];
  const calls = new Map<string, Extract<Item, { type: 'tool' }>>();
  let waiting = '';
  let status = 'running';
  let usage: AgentUsage | null = null;
  let result: (AgentRunResult & { at: string }) | null = null;
  let plan: PlanEntry[] | null = null;
  for (const e of events) {
    const d = e.data || {};
    const last = items[items.length - 1];
    if (e.type === 'usage') {
      usage = d.total;
      continue;
    }
    if (e.type === 'plan') {
      if (Array.isArray(d.entries)) plan = d.entries;
      continue;
    }
    if (e.type === 'state') status = d.status;
    else if (e.type === 'instruction') items.push({ type: 'instruction', key: `ri${e.id}`, text: String(d.text || '') });
    else if (e.type === 'result') result = { ...d, at: e.at };
    else if (e.type === 'retry') {
      // the text of the try given up is dropped: the next try says it again
      if (d.streamed && last?.type === 'assistant') items.pop();
      waiting = retryLine(d);
      continue;
    } else if (e.type === 'text') {
      if (last?.type === 'assistant') last.text += d.text;
      else items.push({ type: 'assistant', key: `rt${e.first ?? e.id}`, text: String(d.text || '') });
    } else if (e.type === 'user') {
      if (d.steered) items.push({ type: 'user', key: `ru${e.id}`, text: String(d.text || '') });
    } else if (e.type === 'step') {
      if (quiet(d)) {
        // a change that started and was then held back: its card goes
        const shown = calls.get(d.id);
        if (shown) items.splice(items.indexOf(shown), 1);
        calls.delete(d.id);
        continue;
      }
      const call = stepCall(d, `r${d.id}`);
      const held = calls.get(d.id);
      if (held) held.call = call;
      else {
        const item = { type: 'tool' as const, key: `rs${d.id}`, call };
        calls.set(d.id, item);
        items.push(item);
      }
    } else if (e.type === 'todo') items.push({ type: 'todo', key: `rd${e.id}`, todo: { text: d.text, ...(d.link && { link: d.link }), ...(typeof d.group === 'string' && d.group && { group: d.group }) } });
    else if (e.type === 'notice' && d.message) items.push({ type: 'notice', key: `rn${e.id}`, text: String(d.message), error: false });
    waiting = '';
  }
  // a turn that ended leaves none of its steps still going
  if (!RUNNING.includes(status)) for (const item of calls.values()) if (item.call.status === 'in_progress') item.call = { ...item.call, status: 'failed' };
  return { items, waiting, status, usage, result, plan };
}
