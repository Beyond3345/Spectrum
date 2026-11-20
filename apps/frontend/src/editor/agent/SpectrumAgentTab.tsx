import { useEffect, useMemo, useRef, useState } from 'react';
import { reviewSitting } from '../reviewHunks';
import { ApiError, addAgentMemory, agentRunEventsUrl, approveAgentInstructions, continueAgentRun, deleteAgentMemory, editAgentMemory, findAgentRun, getAgentInstructions, getAgentMemory, getChat, getResearch, listChats, startAgentTurn, steerAgentRun, stopAgentRun } from '../../api/client';
import type { AgentEvent, AgentInstructions, AgentMemory, AgentRunResult, AgentUserRequest, ChatSummary, ChatThread, ResearchSession } from '../../api/client';
import type { Section } from '../../app/SettingsSheet';
import Icon from '../../app/Icon';
import { MenuButton } from '../../app/Menu';
import { confirmDialog } from '../../app/Dialogs';
import { loadSettings, searchConfigFor } from '../../app/settings';
import { useEditor } from '../EditorContext';
import type { PendingChange } from '../EditorContext';
import type { TodosState } from '../TodosList';
import { chatMessage, useChatThread } from '../chatThread';
import { resolveInstructions } from '../personas';
import { untrusted } from '../../../../backend/src/utils/outsideText.js';
import { docLanguage } from '../../../../backend/src/utils/docLanguage.js';
import { CHATS_CHANGED, errorText, isDeletion, patchesToChanges, relativeTime } from '../shared';
import { AgentComposer, ChangesTray, MemorySheet, PersonaPicker, PlanStrip, ReviewView, Transcript, Welcome, openTodos, readStored, taskPersona, useFollow, useSkills, writeStored } from './parts';
import type { ContextKind, Draft, Memory, PlanActions, TaskRequest, TrayChange, TrayPart } from './parts';
import type { AgentStatus } from './LocalAgentTab';
import { RESUME_HINT, RUNNING, addRunEvent, askAnswer, closeChanges, metaOf, openChanges, planOf, planPrompt, resumeNote, runView, storedChanges, threadItems } from './transcript';
import type { Checkpoint, ThreadMeta as Meta } from './transcript';
import { INSTRUCTIONS_FILE, starterInstructions } from './instructions';
import AgentHeader, { useTurnChoice } from './AgentHeader';
import type { TurnChoice } from './usage';

/** plan: the composer's Plan was on, so the turn only reads and ends with a plan or a question */
type SendOptions = { skill?: string; research?: string; context: Record<ContextKind, boolean>; plan?: boolean };
/** A message typed while the agent works on its thread: the next turn's, unless Steer now hands it over between steps */
type Queued = { id: number; thread: string; text: string; opts: SendOptions; steering?: boolean };
/** What a card's button sends besides the words the thread shows: the request as the model reads it, and the message's own record */
type Sent = { prompt?: string; meta?: Meta };
// what goes with an answer or an approval: the open file's name, and nothing the user did not choose again
const ANSWER: SendOptions = { context: { file: true, selection: false, log: false, todos: false } };

/** The waiting messages, kept through a reload of the page (this window's session storage, which may be blocked). */
const storedQueue = (key: string): Queued[] => {
  try {
    const list = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(list) ? list.filter((q) => q && typeof q.id === 'number' && typeof q.thread === 'string' && typeof q.text === 'string' && q.opts?.context) : [];
  } catch {
    return [];
  }
};


/** A research session as the agent reads it: its question, runs and results, abstracts cut short. */
const sessionContext = ({ question, runs, results }: ResearchSession) =>
  JSON.stringify({
    question,
    runs: runs.map(({ at, queries, perSource }) => ({ at, queries, perSource })),
    // ponytail: 100 results with 400-character abstracts; a local agent gets the whole file
    results: results.slice(0, 100).map(({ abstract, ...r }) => ({ ...r, ...(abstract && { abstract: abstract.slice(0, 400) }) }))
  });

const trayOf = (c: PendingChange): TrayChange => ({ path: c.filePath, kind: isDeletion(c) ? 'deleted' : c.original ? 'modified' : 'created', binary: false, original: c.original, proposed: c.proposed, size: c.proposed.length });
const draftsOf = (tray: PendingChange[]) => tray.map((c) => ({ path: c.filePath, original: c.original, proposed: c.proposed, ...(isDeletion(c) && { deleted: true }) }));

/**
 * The built-in agent (the bottom card's Edit before 2.0): it reads the project and proposes changes through the
 * main model's tools, which wait in the same tray as a local agent's. Threads are chats marked `agent`.
 */
export default function SpectrumAgentTab({
  hidden,
  active,
  todos,
  openThread,
  task,
  onStatus,
  onOpenSettings
}: {
  hidden: boolean;
  active: boolean;
  todos: TodosState;
  /** a chat to carry on here (an Edit chat from the bottom card) */
  openThread: { id: string; n: number } | null;
  /** a task from elsewhere: its prompt and skill go in the message box of a new thread */
  task: TaskRequest | null;
  onStatus(status: AgentStatus): void;
  onOpenSettings(section: Section): void;
}) {
  const api = useEditor();
  const latest = useRef(api);
  latest.current = api;
  const [newPersona, setNewPersona] = useState<string | undefined>();
  // the model and effort for a thread not started yet; a thread keeps its own
  const [newChoice, setNewChoice] = useState<TurnChoice>({});
  // the thread open in each project, reopened with the workspace (a per-viewer convenience)
  const remember = (id: string | null) => writeStored(`spectrum-agent-thread:${latest.current.projectId}`, id ?? undefined);
  const { thread, threadRef, show, append, update } = useChatThread({
    projectId: api.projectId,
    notify: api.notify,
    fresh: () => ({ agent: true, ...(newPersona && { persona: newPersona }), ...newChoice }),
    onCreate: remember
  });
  const turn = useTurnChoice(thread ?? newChoice);
  const [threads, setThreads] = useState<ChatSummary[]>([]);
  const [tray, setTray] = useState<PendingChange[]>([]);
  const trayRef = useRef(tray);
  trayRef.current = tray;
  // the thread a turn is running for, and the backend's run of it, whose events are heard while it happens
  const [running, setRunning] = useState<ChatThread | null>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const [attached, setAttached] = useState<{ runId: string; base: ChatThread } | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [stopping, setStopping] = useState(false);
  const queueKey = `spectrum-agent-queue:${api.projectId}`;
  const [queue, setQueue] = useState<Queued[]>(() => storedQueue(queueKey));
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(() => {
    try {
      if (queue.length) sessionStorage.setItem(queueKey, JSON.stringify(queue));
      else sessionStorage.removeItem(queueKey);
    } catch {
      // blocked storage: the queue lives in the page alone, as before
    }
  }, [queue]);
  // Plan: the next request only reads and ends with a plan to approve
  const [planOn, setPlanOn] = useState(false);
  const planRef = useRef(planOn);
  planRef.current = planOn;
  // the project's AGENTS.md: whether the agent is given it
  const [rules, setRules] = useState<AgentInstructions | null>(null);
  const [rulesRead, setRulesRead] = useState('');
  // what the agent remembers for the project, and whether its sheet is open
  const [remembered, setRemembered] = useState<AgentMemory | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const tabRef = useRef<HTMLDivElement>(null);
  const [applying, setApplying] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // a review sitting, from when the review opens until it closes: its first apply saves the checkpoint
  const sitting = useMemo(reviewSitting, [reviewing]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const skills = useSkills(api.projectId, active);
  const personaId = thread ? thread.persona : newPersona;
  // the persona the user chose, which a task button's own persona replaces only for that task
  const picked = useRef(personaId);

  const status: AgentStatus = running ? 'running' : tray.length ? 'changes' : null;
  useEffect(() => onStatus(status), [status]);

  const refresh = () =>
    listChats(latest.current.projectId).then(
      (res) => setThreads(res.chats.filter((c) => c.agent)),
      () => undefined
    );
  const open = async (id: string | null, adopt = false) => {
    setReviewing(false);
    remember(id);
    if (!id) {
      show(null);
      setTray([]);
      picked.current = newPersona;
      return;
    }
    let { chat } = await getChat(latest.current.projectId, id);
    // an Edit chat carried on here becomes a thread of the workspace's
    if (adopt && !chat.agent) chat = { ...chat, agent: true };
    show(chat);
    picked.current = chat.persona;
    if (adopt) update(chat, (c) => c);
    setTray(await openChanges(chat, latest.current.ensureFileContent));
    // a turn of this thread that is still going, or ended while no page was there to save it: heard from the backend
    if (runningRef.current) return;
    const { run } = await findAgentRun(latest.current.projectId, chat.id).catch(() => ({ run: null }));
    if (run && threadRef.current?.id === chat.id && (RUNNING.includes(run.status) || !chat.messages.some((m) => metaOf(m).run === `${run.id}:${run.turn}`))) return attach(run.id, chat);
    // messages kept through a reload whose turn has ended since: one handed over and read is in the thread, the rest wait again
    const read = chat.messages.flatMap((m) => (metaOf(m).says || []).filter((s) => s.user).map((s) => s.text));
    setQueue((old) => old.filter((q) => q.thread !== chat.id || !q.steering || !read.includes(q.text)).map((q) => (q.thread === chat.id && q.steering ? { ...q, steering: false } : q)));
  };

  const attach = (runId: string, base: ChatThread) => {
    setEvents([]);
    setStopping(false);
    setRunning(base);
    runningRef.current = base;
    setAttached({ runId, base });
  };

  useEffect(() => {
    refresh();
    window.addEventListener(CHATS_CHANGED, refresh);
    const saved = readStored(`spectrum-agent-thread:${api.projectId}`);
    if (saved && !openThread) open(saved).catch(() => remember(null));
    return () => window.removeEventListener(CHATS_CHANGED, refresh);
  }, [api.projectId]);

  useEffect(() => {
    if (openThread) open(openThread.id, true).catch((err) => api.notify(`Couldn’t open the chat: ${errorText(err)}`, 'error'));
  }, [openThread?.n]);

  const scroll = useFollow([thread, running, reviewing, hidden, events, queue.length]);

  const refreshRules = async () => {
    const a = latest.current;
    const status = await getAgentInstructions(a.projectId).catch(() => null);
    if (status) setRules(status);
  };
  // the memory changes only through this tab (or another window's): read when the workspace is shown
  useEffect(() => {
    if (active) void getAgentMemory(api.projectId).then(setRemembered, () => undefined);
  }, [api.projectId, active]);
  // read again when the workspace is shown, a turn ends or a change is applied: each may have changed the file
  useEffect(() => {
    if (active) void refreshRules();
  }, [api.projectId, active, !!running, tray.length]);

  /** What every turn's request carries: the model, the search connection, the instructions and the open proposals. */
  const turnSettings = (base: ChatThread) => {
    const a = latest.current;
    const { typstVersion, markdownEngine } = loadSettings().compileDefaults;
    const plan = planOf(base.messages);
    return {
      llmConfig: a.llm.main,
      searchConfig: searchConfigFor(a.settings, a.llm.search),
      model: turn.current.model,
      reasoningEffort: turn.current.effort,
      instructions: resolveInstructions(a.settings, base.persona) || undefined,
      compile: { typstVersion, markdownEngine },
      // it goes on from the proposals still open, so a file it changes again keeps the earlier change
      drafts: threadRef.current?.id === base.id ? draftsOf(trayRef.current) : [],
      // the approved plan while steps of it are open, for the agent to tick, and whether it stops before each new file
      ...(plan.open && { plan: plan.entries, ...(plan.eachFile && { eachFile: true }) })
    };
  };

  const failed = (base: ChatThread, err: unknown) => {
    append(base, chatMessage('assistant', `Request failed: ${errorText(err)}`, { error: true, resume: 'failed' }));
    setRunning(null);
  };

  const send = async (text: string, { skill, research, context, plan }: SendOptions, sent: Sent = {}) => {
    const a = latest.current;
    // while the agent works on this thread, a message waits its turn
    if (runningRef.current) {
      const thread = threadRef.current?.id;
      if (thread && runningRef.current.id === thread) setQueue((old) => [...old, { id: Date.now() + old.length, thread, text: text || `/${skill}`, opts: { skill, research, context, plan } }]);
      return;
    }
    const base = append(threadRef.current, chatMessage('user', text || `/${skill}`, sent.meta));
    setEvents([]);
    setRunning(base);
    runningRef.current = base;
    try {
      let prompt = sent.prompt || text || 'Follow the skill’s instructions for this project.';
      // after a run that ended before its answer and is no longer kept, this one is told where that one got to
      const before = base.messages[base.messages.length - 2];
      const note = before ? resumeNote(metaOf(before)) : '';
      if (note) prompt += `\n\n[Earlier run] ${note}`;
      // to-dos and a research session's papers are text from outside, marked as such; the backend adds the project's outline
      const list = context.todos ? openTodos(todos) : [];
      if (list.length) prompt += `\n\n[Open to-dos]\n${untrusted('open to-dos', list.map((t) => `- ${t.text}`).join('\n'))}`;
      if (research) prompt += `\n\n[Research session]\n${untrusted('research session', sessionContext((await getResearch(a.projectId, research)).session))}`;
      // the thread's last texts, which a run without a conversation of its own starts from
      const history = base.messages
        .slice(0, -1)
        .filter((m) => m.content && !metaOf(m).error)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));
      const { run } = await startAgentTurn({
        projectId: a.projectId,
        threadId: base.id,
        prompt,
        shown: text || `/${skill}`,
        selection: context.selection ? a.selectionText : '',
        activePath: context.file ? a.activePath : '',
        compileLog: context.log ? a.compileLog : '',
        history,
        ...(skill && { skill }),
        ...(plan && { planFirst: true }),
        ...turnSettings(base)
      });
      attach(run.id, base);
    } catch (err) {
      failed(base, err);
    }
  };

  /** The turn's outcome into the thread: the reply with its steps, changes and to-dos, saved once however many pages heard it. */
  const finish = async (base: ChatThread, runId: string, res: AgentRunResult & { at: string }) => {
    const key = `${runId}:${res.turn}`;
    const newest = threadRef.current?.id === base.id ? threadRef.current : base;
    if (newest.messages.some((m) => metaOf(m).run === key)) return;
    // a run that failed part-way still hands back the steps it finished and the changes it prepared: they are kept
    // and shown, with the failure under them, and Continue goes on from there
    const changes = (await patchesToChanges(latest.current, res.patches || [], 'Spectrum agent')).filter((c) => c.deleted || c.original !== c.proposed);
    const meta: Meta = {
      run: key,
      ...(changes.length && { changes: storedChanges(changes) }),
      ...(res.todos?.length && { todos: res.todos }),
      ...(res.steps?.length && { steps: res.steps }),
      ...(res.says?.length && { says: res.says }),
      ...(res.usage && { usage: res.usage }),
      // a question, a plan or the next file: the thread's last word until the user answers it
      ...(res.ask && { ask: res.ask }),
      ...(res.plan?.length && { plan: res.plan }),
      ...(res.instructions?.length && { instructions: res.instructions }),
      // the backend words AI failures as a reply; shown as errors, kept out of the history
      ...(!res.ok && { error: true }),
      ...((res.incomplete || !res.ok) && { resume: res.incomplete || 'failed' })
    };
    // each file's new proposal goes on from the thread's open one, from the same base, which it closes in the same
    // save as the reply: a reply too large to save leaves the open one as it was
    const said = res.incomplete === 'stopped' ? 'Stopped before the agent finished.' : res.ok ? res.reply || (changes.length ? 'The changes are ready to review.' : 'No changes were suggested.') : `Request failed: ${res.reply || 'The AI request failed.'}`;
    // dated by the backend, so two pages that heard the turn save the same message, which the chat keeps once
    const reply = { ...chatMessage('assistant', said, meta), createdAt: res.at };
    update(base, (chat) => ({ ...chat, messages: [...closeChanges(chat.messages, changes.map((c) => c.filePath), 'superseded').messages, reply] }));
    if (threadRef.current?.id !== base.id) latest.current.notify(`Reply added to “${base.title}”`);
    if (changes.length && threadRef.current?.id === base.id) setTray((old) => [...old.filter((o) => !changes.some((c) => c.filePath === o.filePath)), ...changes]);
  };

  // The run's events, heard while its turn happens and shown as they come; its result is the thread's reply.
  useEffect(() => {
    if (!attached) return;
    const { runId, base } = attached;
    const source = new EventSource(agentRunEventsUrl(runId));
    let held: AgentEvent[] = [];
    let frame = 0;
    let over = false;
    // the waiting messages the agent has read in this turn
    const read = new Set<number>();
    const end = () => {
      over = true;
      source.close();
      setAttached((now) => (now?.runId === runId && now.base === base ? null : now));
      setRunning(null);
      runningRef.current = null;
      setStopping(false);
      setEvents([]);
    };
    // many pieces of an answer a second: taken in together, once a frame
    const flush = async () => {
      frame = 0;
      const batch = held;
      held = [];
      setEvents((old) => batch.reduce(addRunEvent, old));
      for (const e of batch) {
        // a message steered in has been read: it is in the transcript now
        if (e.type === 'user' && e.data.steered) {
          const done = queueRef.current.find((q) => q.steering && q.text === e.data.text && !read.has(q.id));
          if (done) read.add(done.id);
          setQueue((old) => old.filter((q) => !read.has(q.id)));
        }
        if (e.type !== 'result' || over) continue;
        const res = e.data as AgentRunResult;
        await finish(base, runId, { ...res, at: e.at }).catch((err) => latest.current.notify(`Couldn’t keep the agent’s reply: ${errorText(err)}`, 'error'));
        end();
        // steered too late to be read: they wait again
        if (res.unsent?.length) setQueue((old) => old.map((q) => (res.unsent!.includes(q.text) ? { ...q, steering: false } : q)));
        // the next message that waited is the next turn, after a turn that ended as it should
        // (a question or a plan waits for the user's own answer, which no message typed before it can be)
        const next = queueRef.current.find((q) => q.thread === base.id && !read.has(q.id));
        if (next && res.ok && !res.incomplete && !res.ask && threadRef.current?.id === base.id) {
          setQueue((old) => old.filter((q) => q.id !== next.id));
          void send(next.text === `/${next.opts.skill}` ? '' : next.text, next.opts);
        }
      }
    };
    source.onmessage = (message) => {
      held.push(JSON.parse(message.data) as AgentEvent);
      // a window in the background draws no frames and runs its timers late: there each event is taken in as it comes,
      // so the turn's result is saved on time
      if (document.hidden) void flush();
      else frame ||= requestAnimationFrame(() => void flush());
    };
    source.onerror = () => {
      // EventSource connects again by itself; once the backend no longer has the run (it was restarted), it gives up
      if (source.readyState !== EventSource.CLOSED || over) return;
      append(base, chatMessage('assistant', 'Request failed: the agent’s run was lost when Spectrum’s backend stopped. What the thread had saved is kept.', { error: true, resume: 'failed' }));
      end();
    };
    return () => {
      source.close();
      cancelAnimationFrame(frame);
    };
  }, [attached]);

  const stop = () => {
    if (!attached || stopping) return;
    setStopping(true);
    // the backend ends the model call and the tool running; the turn's result follows, with what it had done
    stopAgentRun(attached.runId).catch((err) => {
      setStopping(false);
      latest.current.notify(`Couldn’t stop the agent: ${errorText(err)}`, 'error');
    });
  };

  /** Steer now: hands a waiting message to the agent between its steps; one that comes too late stays in the queue. */
  const steer = (item: Queued) => {
    if (!attached) return;
    setQueue((old) => old.map((q) => (q.id === item.id ? { ...q, steering: true } : q)));
    steerAgentRun(attached.runId, item.text).catch(() => setQueue((old) => old.map((q) => (q.id === item.id ? { ...q, steering: false } : q))));
  };

  /** Marks the open proposals for these files applied or rejected, with the checkpoint saved before applying. */
  const mark = (owner: ChatThread, paths: string[], status: 'applied' | 'rejected', checkpoint?: Checkpoint) =>
    update(owner, (chat) => {
      const { messages, last } = closeChanges(chat.messages, paths, status);
      if (checkpoint && last >= 0) {
        const meta = metaOf(messages[last]);
        messages[last] = { ...messages[last], meta: { ...meta, checkpoints: [...(meta.checkpoints || []), checkpoint] } };
      }
      return { ...chat, messages };
    });

  const resolve = async (action: 'apply' | 'reject', list: TrayChange[]) => {
    const owner = threadRef.current;
    const picked = tray.filter((c) => list.some((l) => l.path === c.filePath));
    if (!owner || !picked.length) return;
    setApplying(true);
    try {
      if (action === 'reject') {
        setTray((old) => old.filter((c) => !picked.includes(c)));
        mark(owner, picked.map((c) => c.filePath), 'rejected');
        return;
      }
      const { applied, stale, checkpoint } = await latest.current.applyChanges(picked, sitting);
      // a file changed since: its proposal now shows against the file as it is
      setTray((old) => old.filter((c) => !applied.some((d) => d.filePath === c.filePath)).map((c) => stale.find((s) => s.filePath === c.filePath) || c));
      if (applied.length) {
        const saved = checkpoint && { id: checkpoint.id, number: checkpoint.number, label: checkpoint.label, createdAt: checkpoint.createdAt };
        mark(owner, applied.map((c) => c.filePath), 'applied', saved || undefined);
      }
    } catch (err) {
      latest.current.notify(`Couldn’t apply the changes: ${errorText(err)}`, 'error');
    } finally {
      setApplying(false);
    }
  };

  /**
   * One file's proposal settled in part in the review (some of its changes applied, perhaps edited, or rejected): what
   * was applied is written through the same path as a whole file, and what is left stays open in the tray and the thread.
   */
  const settlePart = async (file: TrayChange, part: TrayPart) => {
    const owner = threadRef.current;
    const change = tray.find((c) => c.filePath === file.path);
    if (!owner || !change) return;
    setApplying(true);
    try {
      let saved: Checkpoint | undefined;
      if (part.content !== undefined) {
        const { applied, checkpoint } = await latest.current.applyChanges([{ ...change, original: part.mine, proposed: part.content }], sitting);
        // the file is no longer what the review showed (applyChanges said so): the review reads it again
        if (!applied.length) return setTray((old) => [...old]);
        if (checkpoint) saved = { id: checkpoint.id, number: checkpoint.number, label: checkpoint.label, createdAt: checkpoint.createdAt };
      }
      const left = { ...change, original: part.original, proposed: part.proposed };
      const open = left.original !== left.proposed;
      setTray((old) => old.flatMap((c) => (c !== change ? [c] : open ? [left] : [])));
      if (!open) return void mark(owner, [file.path], part.content !== undefined ? 'applied' : 'rejected', saved);
      update(owner, (chat) => ({
        ...chat,
        messages: chat.messages.map((m) => {
          const meta = metaOf(m);
          if (!meta.changes?.some((c) => !c.status && c.filePath === file.path)) return m;
          return { ...m, meta: { ...meta, changes: meta.changes.map((c) => (!c.status && c.filePath === file.path ? storedChanges([left])[0] : c)), ...(saved && { checkpoints: [...(meta.checkpoints || []), saved] }) } };
        })
      }));
    } catch (err) {
      latest.current.notify(`Couldn’t apply the change: ${errorText(err)}`, 'error');
    } finally {
      setApplying(false);
    }
  };

  /** The answer to the agent's question, or to “Go on to …?”, as the next message; Cancel closes it unanswered. */
  const answer = async (request: AgentUserRequest, value: unknown) => {
    const owner = threadRef.current;
    const ask = owner?.messages.length ? metaOf(owner.messages[owner.messages.length - 1]).ask : undefined;
    if (!owner || !ask) return;
    const text = askAnswer(ask, value);
    if (text !== null) return send(ask.kind === 'next' ? 'Go on' : text, ANSWER, ask.kind === 'next' ? { prompt: text } : {});
    update(owner, (chat) => ({ ...chat, messages: chat.messages.map((m, i) => (i === chat.messages.length - 1 && metaOf(m).ask ? { ...m, meta: { ...metaOf(m), ask: { ...metaOf(m).ask!, dismissed: true } } } : m)) }));
  };

  const planActions: PlanActions = {
    // the approved steps are the thread's plan from here on: the strip shows them and the agent ticks them
    approve: (steps, left, eachFile, changed) => {
      setPlanOn(false);
      void send(eachFile ? 'Approve, ask before each file' : 'Approve and run', ANSWER, { prompt: planPrompt(left, changed), meta: { plan: steps.map((content) => ({ content, status: 'pending' })), ...(eachFile && { eachFile: true }) } });
    },
    // what the user types next, with Plan on, is what the plan should change
    keep: () => {
      setPlanOn(true);
      tabRef.current?.querySelector<HTMLElement>('.composer-input')?.focus();
    }
  };

  /** A change to the project's memory, from a suggestion card's Add or the Memory sheet; resolves whether it was made. */
  const changeMemory = async (change: (projectId: string) => Promise<AgentMemory>, failed: string, done?: string) => {
    const a = latest.current;
    try {
      setRemembered(await change(a.projectId));
      if (done) a.notify(done, 'success');
      return true;
    } catch (err) {
      a.notify(`${failed}: ${errorText(err)}`, 'error');
      return false;
    }
  };
  const memory: Memory = {
    lines: remembered?.lines ?? null,
    max: remembered?.max,
    add: (text) => changeMemory((id) => addAgentMemory(id, text), 'Couldn’t add the line', 'Remembered for this project'),
    edit: (line, text) => changeMemory((id) => editAgentMemory(id, line, text), 'Couldn’t save the line'),
    remove: (line) => changeMemory((id) => deleteAgentMemory(id, line), 'Couldn’t delete the line')
  };

  /** The AGENTS.md chip: opens the file, or offers to make one to start from. */
  const openRules = async () => {
    const a = latest.current;
    try {
      // as it is now: a file that has appeared since the chip was drawn is opened, never written over
      const { exists } = await getAgentInstructions(a.projectId);
      if (!exists && !a.projectFiles.includes(INSTRUCTIONS_FILE)) {
        const ok = await confirmDialog({
          title: `Create ${INSTRUCTIONS_FILE}?`,
          message: 'A short file at the top of the project for your standing instructions to agents: spelling, style, what never to touch. The Spectrum agent is given it with every request, and most local agents read it themselves. It is yours to edit.',
          confirmLabel: 'Create'
        });
        if (!ok) return;
        await a.writeProjectFile(INSTRUCTIONS_FILE, starterInstructions({ mainFile: a.mainFile, language: docLanguage(a.activePath, a.mainFile).name }));
      }
      setRulesRead((await getAgentInstructions(a.projectId)).hash || '');
      await a.openFile(INSTRUCTIONS_FILE);
    } catch (err) {
      a.notify(`Couldn’t open ${INSTRUCTIONS_FILE}: ${errorText(err)}`, 'error');
    }
    await refreshRules();
  };
  const useRules = () =>
    approveAgentInstructions(latest.current.projectId, rules?.hash || '')
      .catch((err) => latest.current.notify(`Couldn’t approve ${INSTRUCTIONS_FILE}: ${errorText(err)}`, 'error'))
      .then(refreshRules);

  const here = !!running && running.id === thread?.id;
  const live = useMemo(() => runView(events), [events]);
  // the plan the user approved: as the thread has it, and as the turn that is happening has ticked it
  const threadPlan = useMemo(() => planOf(thread?.messages || []), [thread]);
  const lastAsk = !running && thread?.messages.length ? metaOf(thread.messages[thread.messages.length - 1]).ask : undefined;
  const waitingAsk = lastAsk && !lastAsk.dismissed ? lastAsk : undefined;
  const shownPlan = (here && live.plan) || (threadPlan.open || (thread?.messages.length && metaOf(thread.messages[thread.messages.length - 1]).plan) ? threadPlan.entries : []);
  const shownQueue = queue.filter((q) => q.thread === thread?.id);
  // the thread as saved, then the turn that is happening
  const items = useMemo(() => [...threadItems(thread?.messages || []), ...(here ? live.items : [])], [thread, here, live]);

  const choosePersona = (id: string | undefined) => {
    if (thread) update(thread, (chat) => ({ ...chat, persona: id }));
    else setNewPersona(id);
  };

  // a new thread for it with its persona, unless one is still going
  useEffect(() => {
    if (!task) return;
    if (!running) {
      if (threadRef.current) void open(null);
      setNewPersona(taskPersona(api.settings.personas, task) ?? picked.current);
    }
    setDraft({ text: task.prompt, skill: task.skill, research: task.research, n: task.n });
    // Deep research: a plan to approve before it searches and reads
    if (task.plan) setPlanOn(true);
  }, [task?.n]);

  const trayChanges = useMemo(() => tray.map(trayOf), [tray]);
  // the thread's last run ended before its answer: Continue goes on from what it had done
  const lastMeta = thread?.messages.length ? metaOf(thread.messages[thread.messages.length - 1]) : null;
  const resume = !running && lastMeta?.resume;
  // nothing done before a failed request: there is nothing to continue from, only the request to send again
  const again = resume === 'failed' && !lastMeta?.steps?.length && !lastMeta?.changes?.length;
  /**
   * Continue, or Try again: the run's own conversation goes on from where it stopped, while the backend keeps it (an
   * hour, and until Spectrum closes); after that a new run is told what the last one did, with the thread's earlier
   * messages and the changes still open.
   */
  const retry = async () => {
    const owner = threadRef.current;
    const label = again ? 'Try again' : 'Continue';
    const { run } = owner ? await findAgentRun(latest.current.projectId, owner.id).catch(() => ({ run: null })) : { run: null };
    // a Plan turn goes on as one, while Plan is still on
    const anew = () => void send(label, { ...ANSWER, plan: planRef.current });
    if (!owner || !run || runningRef.current) return anew();
    setEvents([]);
    setRunning(owner);
    runningRef.current = owner;
    try {
      await continueAgentRun(run.id, { ...turnSettings(owner), ...(planRef.current && { planFirst: true }) });
    } catch (err) {
      setRunning(null);
      runningRef.current = null;
      // no longer kept after all: as a new run
      if (err instanceof ApiError && err.status === 404) return anew();
      return latest.current.notify(`Couldn’t continue: ${errorText(err)}`, 'error');
    }
    // shown as the user's word in the thread; the agent itself is only told to go on
    attach(run.id, append(owner, chatMessage('user', label)));
  };
  return (
    <div
      className="agent-tab"
      hidden={hidden}
      ref={tabRef}
      // coming back from the editor, where AGENTS.md may just have been written
      onFocus={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void refreshRules();
      }}
    >
      <div className="agent-bar">
        <MenuButton
          icon="clock"
          title="Threads"
          items={[
            { label: 'New thread', icon: 'square.and.pencil', onSelect: () => open(null) },
            threads.length > 0 && { separator: true },
            ...threads.map((t) => ({
              label: t.title || 'Untitled thread',
              shortcut: relativeTime(t.updatedAt),
              checked: t.id === thread?.id,
              onSelect: () => open(t.id).catch((err) => api.notify(`Couldn’t open the thread: ${errorText(err)}`, 'error'))
            }))
          ]}
        />
        <span className="badge" title="The Spectrum agent proposes changes; nothing reaches your files until you apply it">
          Isolated
        </span>
        <PersonaPicker
          value={personaId}
          onChange={(id) => {
            picked.current = id;
            choosePersona(id);
          }}
          onManage={() => onOpenSettings('personas')}
        />
        <span className="grow" />
        <AgentHeader
          messages={thread?.messages || []}
          live={here ? live.usage : null}
          choice={turn.current}
          onChoose={(c) => (thread ? update(thread, (chat) => ({ ...chat, ...c })) : setNewChoice((old) => ({ ...old, ...c })))}
          onManage={() => onOpenSettings('models')}
        />
        {running && (
          <button className="btn small" disabled={stopping || !attached} onClick={stop}>
            <Icon name="stop.fill" /> Stop
          </button>
        )}
      </div>

      {reviewing ? (
        <ReviewView changes={trayChanges} busy={applying} onApply={(list) => resolve('apply', list)} onReject={(list) => resolve('reject', list)} onPart={settlePart} onClose={() => setReviewing(false)} />
      ) : (
        <div className="agent-scroll" ref={scroll.ref} onScroll={scroll.onScroll} role="log">
          <PlanStrip entries={shownPlan} todos={todos} />
          {!items.length && (
            <Welcome
              onTask={(task) => {
                setDraft({ text: task.prompt, skill: task.skill, n: Date.now() });
                choosePersona(taskPersona(api.settings.personas, task) ?? picked.current);
              }}
            />
          )}
          <Transcript items={items} todos={todos} onAnswer={answer} plan={planActions} memory={memory} />
          {resume && (
            <div className="composer-hint row">
              <span className="grow">{again ? 'Nothing was changed.' : RESUME_HINT[resume]}</span>
              <button className="btn small" onClick={() => void retry()}>
                {again ? 'Try again' : 'Continue'}
              </button>
            </div>
          )}
          {here && (
            <div className="composer-msg assistant composer-thinking" aria-live="polite">
              <span className="spinner" /> {stopping ? 'Stopping…' : live.waiting || 'Working…'}
            </div>
          )}
        </div>
      )}

      <div className="agent-foot">
        {!reviewing && <ChangesTray changes={trayChanges} onOpen={() => setReviewing(true)} />}
        {rules?.exists && !rules.approved && !reviewing && (
          <div className="composer-hint row">
            <span className="grow">This project’s {INSTRUCTIONS_FILE} is not given to the agent yet: it came with the project, or was changed by an agent or outside Spectrum. Read it, then choose.</span>
            <button className="btn small" onClick={() => void openRules()}>
              Read it
            </button>
            <button className="btn small" disabled={!rulesRead || rulesRead !== rules.hash} title={rulesRead === rules.hash ? 'The agent is given this file with every request, as your standing instructions for the project' : 'Read it first'} onClick={() => void useRules()}>
              Use it
            </button>
          </div>
        )}
        {shownQueue.length > 0 && (
          <div className="agent-queue">
            {shownQueue.map((q) => (
              <div className="agent-queued" key={q.id}>
                <span className="agent-queued-label">{q.steering ? 'Steering' : 'Queued'}</span>
                <span className="agent-queued-text" title={q.text}>
                  “{q.text}”
                </span>
                {here ? (
                  <button className="btn small" disabled={q.steering || !attached || stopping} title="Hand it to the agent between its steps, without waiting for the answer" onClick={() => steer(q)}>
                    Steer now
                  </button>
                ) : (
                  <button
                    className="btn small"
                    disabled={!!running}
                    onClick={() => {
                      setQueue((old) => old.filter((o) => o.id !== q.id));
                      void send(q.text === `/${q.opts.skill}` ? '' : q.text, q.opts);
                    }}
                  >
                    Send
                  </button>
                )}
                <button className="btn small" disabled={q.steering} onClick={() => setQueue((old) => old.filter((o) => o.id !== q.id))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <AgentComposer
          busy={!!running}
          queues={here}
          firstTurn={!items.length}
          skills={skills}
          todoCount={openTodos(todos).length}
          draft={draft}
          placeholder={
            here
              ? 'Message the agent. Enter queues it while the agent works.'
              : waitingAsk?.kind === 'question'
                ? 'Answer the agent’s question here, or on its card'
                : waitingAsk?.kind === 'plan' && planOn
                  ? 'Say what the plan should change'
                  : 'Ask the Spectrum agent to work on the project, or type / for skills'
          }
          extras={
            <>
              <button className={`chip ${planOn ? 'active' : ''}`} aria-pressed={planOn} title={planOn ? 'Plan first: the agent only reads, then shows you a plan to approve before it changes anything' : 'Plan first is off: the agent plans by itself only before a larger task'} onClick={() => setPlanOn((on) => !on)}>
                <Icon name="list.number" /> Plan
              </button>
              <button
                className={`chip ${rules?.approved ? 'active' : ''}`}
                title={
                  !rules?.exists
                    ? `Create ${INSTRUCTIONS_FILE}: your standing instructions for agents in this project`
                    : rules.approved
                      ? `Given to the agent with every request, as your standing instructions for this project${rules.truncated ? ' (its first 20,000 characters: the file is longer)' : ''}. Click to open it.`
                      : `Not given to the agent until you have read it and chosen Use it. Click to open it.`
                }
                onClick={() => void openRules()}
              >
                <Icon name="list.clipboard" /> {!rules?.exists ? `Add ${INSTRUCTIONS_FILE}` : rules.approved ? `Using ${INSTRUCTIONS_FILE}` : `${INSTRUCTIONS_FILE} not used`}
              </button>
              <button className={`chip ${remembered?.lines.length ? 'active' : ''}`} title="What the Spectrum agent remembers for this project: see, edit and add lines" onClick={() => setMemoryOpen(true)}>
                <Icon name="bookmark" /> Memory{remembered?.lines.length ? ` · ${remembered.lines.length}` : ''}
              </button>
            </>
          }
          onSend={(text, opts) => void send(text, { ...opts, plan: planRef.current })}
        />
      </div>
      {memoryOpen && <MemorySheet memory={memory} onClose={() => setMemoryOpen(false)} />}
    </div>
  );
}
