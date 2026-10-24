import type { AgentEvent, AgentUserRequest, ChatThread, SuggestedTodo } from '../../api/client';

// A local agent's stored events (agentSessionService.js) as the workspace shows them: messages with their streamed
// chunks joined, one card per tool call updated in place, the latest plan, commands and options. And what a Spectrum
// agent thread's messages keep, with the proposals in it still waiting for the tray.

/** What a tool call shows: text, a file's change, or a terminal Spectrum ran for it (ACP ToolCallContent) */
export type ToolContent =
  | { type: 'content'; content: { type: string; text?: string } }
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
}

export type PlanEntry = { content: string; priority?: string; status: string };
export type AgentCommand = { name: string; description: string; input?: { hint?: string } };
/** A "Before AI changes" checkpoint, shown where it was saved */
export type Checkpoint = { id: number; number: number; label: string; createdAt: string };

type Said<T> = { type: T; key: string; text: string };
export type Item =
  | Said<'user'>
  | Said<'assistant'>
  | Said<'thought'>
  | { type: 'tool'; key: string; call: ToolCall }
  | { type: 'todo'; key: string; todo: SuggestedTodo }
  | { type: 'request'; key: string; request: AgentUserRequest; answered: boolean }
  | { type: 'notice'; key: string; text: string; error: boolean }
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
    else if (e.type === 'todo' && typeof d.text === 'string') items.push({ type: 'todo', key: `todo-${e.id}`, todo: { text: d.text, ...(d.link && { link: d.link }) } });
    else if (e.type === 'request') {
      // answered, or left when its turn ended: only one still pending waits for an answer
      const item = { type: 'request' as const, key: `request-${d.requestId}`, request: d as AgentUserRequest, answered: !pending.some((p) => p.requestId === d.requestId) };
      requests.set(d.requestId, item);
      items.push(item);
    } else if (e.type === 'answered') {
      const item = requests.get(d.requestId);
      if (item) item.answered = true;
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

/** What a Spectrum agent thread keeps in ChatMessage.meta; changes as the bottom card's Edit chats kept them */
export type ThreadMeta = {
  changes?: { filePath: string; proposed: string; status?: 'applied' | 'rejected' }[];
  todos?: SuggestedTodo[];
  checkpoints?: Checkpoint[];
  error?: boolean;
};
export const metaOf = (m: { meta?: Record<string, unknown> }) => (m.meta || {}) as ThreadMeta;

/** Each file's latest proposal not applied or rejected yet, against the file as it is now (read). */
export async function openChanges(chat: ChatThread, read: (path: string) => Promise<string>) {
  const proposed = new Map<string, string>();
  for (const m of chat.messages)
    for (const c of metaOf(m).changes || []) {
      if (c.status) proposed.delete(c.filePath);
      else proposed.set(c.filePath, c.proposed);
    }
  const list = await Promise.all([...proposed].map(async ([filePath, text]) => ({ filePath, original: await read(filePath).catch(() => ''), proposed: text, source: 'Spectrum agent' })));
  return list.filter((c) => c.original !== c.proposed);
}
