import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, agentRunEventsUrl, continueAgentRun, findAgentRun, getChat, getResearch, listChats, startAgentTurn, steerAgentRun, stopAgentRun } from '../../api/client';
import type { AgentEvent, AgentRunResult, ChatSummary, ChatThread, ResearchSession } from '../../api/client';
import type { Section } from '../../app/SettingsSheet';
import Icon from '../../app/Icon';
import { MenuButton } from '../../app/Menu';
import { loadSettings, searchConfigFor } from '../../app/settings';
import { useEditor } from '../EditorContext';
import type { PendingChange } from '../EditorContext';
import type { TodosState } from '../TodosList';
import { chatMessage, useChatThread } from '../chatThread';
import { resolveInstructions } from '../personas';
import { untrusted } from '../../../../backend/src/utils/outsideText.js';
import { CHATS_CHANGED, errorText, patchesToChanges, relativeTime } from '../shared';
import { AgentComposer, ChangesTray, PersonaPicker, ReviewView, Transcript, Welcome, openTodos, readStored, taskPersona, useFollow, useSkills, writeStored } from './parts';
import type { ContextKind, Draft, TaskRequest, TrayChange } from './parts';
import type { AgentStatus } from './LocalAgentTab';
import { RESUME_HINT, RUNNING, addRunEvent, closeChanges, metaOf, openChanges, resumeNote, runView, storedChanges, threadItems } from './transcript';
import type { Checkpoint, ThreadMeta as Meta } from './transcript';

type SendOptions = { skill?: string; research?: string; context: Record<ContextKind, boolean> };
/** A message typed while the agent works: the next turn's, unless Steer now hands it over between steps */
type Queued = { id: number; text: string; opts: SendOptions; steering?: boolean };


/** A research session as the agent reads it: its question, runs and results, abstracts cut short. */
const sessionContext = ({ question, runs, results }: ResearchSession) =>
  JSON.stringify({
    question,
    runs: runs.map(({ at, queries, perSource }) => ({ at, queries, perSource })),
    // ponytail: 100 results with 400-character abstracts; a local agent gets the whole file
    results: results.slice(0, 100).map(({ abstract, ...r }) => ({ ...r, ...(abstract && { abstract: abstract.slice(0, 400) }) }))
  });

const trayOf = (c: PendingChange): TrayChange => ({ path: c.filePath, kind: c.deleted ? 'deleted' : c.original ? 'modified' : 'created', binary: false, original: c.original, proposed: c.proposed, size: c.proposed.length });
const draftsOf = (tray: PendingChange[]) => tray.map((c) => ({ path: c.filePath, original: c.original, proposed: c.proposed, ...(c.deleted && { deleted: true }) }));

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
  // the thread open in each project, reopened with the workspace (a per-viewer convenience)
  const remember = (id: string | null) => writeStored(`spectrum-agent-thread:${latest.current.projectId}`, id ?? undefined);
  const { thread, threadRef, show, append, update } = useChatThread({
    projectId: api.projectId,
    notify: api.notify,
    fresh: () => ({ agent: true, ...(newPersona && { persona: newPersona }) }),
    onCreate: remember
  });
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
  const [queue, setQueue] = useState<Queued[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const [applying, setApplying] = useState(false);
  const [reviewing, setReviewing] = useState(false);
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
    if (run && threadRef.current?.id === chat.id && (RUNNING.includes(run.status) || !chat.messages.some((m) => metaOf(m).run === `${run.id}:${run.turn}`))) attach(run.id, chat);
  };

  const attach = (runId: string, base: ChatThread) => {
    setEvents([]);
    setStopping(false);
    setRunning(base);
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

  const scroll = useFollow([thread, running, reviewing, hidden]);

  /** What every turn's request carries: the model, the search connection, the instructions and the open proposals. */
  const turnSettings = (base: ChatThread) => {
    const a = latest.current;
    const { typstVersion, markdownEngine } = loadSettings().compileDefaults;
    return {
      llmConfig: a.llm.main,
      searchConfig: searchConfigFor(a.settings, a.llm.search),
      reasoningEffort: a.settings.reasoningEffort,
      instructions: resolveInstructions(a.settings, base.persona) || undefined,
      compile: { typstVersion, markdownEngine },
      // it goes on from the proposals still open, so a file it changes again keeps the earlier change
      drafts: threadRef.current?.id === base.id ? draftsOf(trayRef.current) : []
    };
  };

  const failed = (base: ChatThread, err: unknown) => {
    append(base, chatMessage('assistant', `Request failed: ${errorText(err)}`, { error: true, resume: 'failed' }));
    setRunning(null);
  };

  const send = async (text: string, { skill, research, context }: SendOptions) => {
    const a = latest.current;
    // while the agent works on this thread, a message waits its turn
    if (runningRef.current) {
      if (runningRef.current.id === threadRef.current?.id) setQueue((old) => [...old, { id: Date.now() + old.length, text: text || `/${skill}`, opts: { skill, research, context } }]);
      return;
    }
    const base = append(threadRef.current, chatMessage('user', text || `/${skill}`));
    setEvents([]);
    setRunning(base);
    runningRef.current = base;
    try {
      let prompt = text || 'Follow the skill’s instructions for this project.';
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
    let timer = 0;
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
    // many pieces of an answer a second: taken in together, a few times a second
    const flush = async () => {
      timer = 0;
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
        const next = queueRef.current.find((q) => !read.has(q.id));
        if (next && res.ok && !res.incomplete && threadRef.current?.id === base.id) {
          setQueue((old) => old.filter((q) => q.id !== next.id));
          void send(next.text === `/${next.opts.skill}` ? '' : next.text, next.opts);
        }
      }
    };
    source.onmessage = (message) => {
      held.push(JSON.parse(message.data) as AgentEvent);
      timer ||= window.setTimeout(() => void flush(), 40);
    };
    source.onerror = () => {
      // EventSource connects again by itself; once the backend no longer has the run (it was restarted), it gives up
      if (source.readyState !== EventSource.CLOSED || over) return;
      append(base, chatMessage('assistant', 'Request failed: the agent’s run was lost when Spectrum’s backend stopped. What the thread had saved is kept.', { error: true, resume: 'failed' }));
      end();
    };
    return () => {
      source.close();
      window.clearTimeout(timer);
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
      const { applied, stale, checkpoint } = await latest.current.applyChanges(picked);
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

  const here = !!running && running.id === thread?.id;
  const live = useMemo(() => runView(events), [events]);
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
    const anew = () => void send(label, { context: { file: true, selection: false, log: false, todos: false } });
    if (!owner || !run || runningRef.current) return anew();
    setEvents([]);
    setRunning(owner);
    runningRef.current = owner;
    try {
      await continueAgentRun(run.id, turnSettings(owner));
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
    <div className="agent-tab" hidden={hidden}>
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
        {running && (
          <button className="btn small" disabled={stopping || !attached} onClick={stop}>
            <Icon name="stop.fill" /> Stop
          </button>
        )}
      </div>

      {reviewing ? (
        <ReviewView changes={trayChanges} busy={applying} onApply={(list) => resolve('apply', list)} onReject={(list) => resolve('reject', list)} onClose={() => setReviewing(false)} />
      ) : (
        <div className="agent-scroll" ref={scroll.ref} onScroll={scroll.onScroll} role="log">
          {!items.length && (
            <Welcome
              onTask={(task) => {
                setDraft({ text: task.prompt, skill: task.skill, n: Date.now() });
                choosePersona(taskPersona(api.settings.personas, task) ?? picked.current);
              }}
            />
          )}
          <Transcript items={items} todos={todos} />
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
        {queue.length > 0 && (
          <div className="agent-queue">
            {queue.map((q) => (
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
          placeholder={here ? 'Message the agent. Enter queues it while the agent works.' : 'Ask the Spectrum agent to work on the project, or type / for skills'}
          onSend={(text, opts) => void send(text, opts)}
        />
      </div>
    </div>
  );
}
