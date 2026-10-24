import { useEffect, useMemo, useRef, useState } from 'react';
import {
  answerLocalAgent,
  createLocalAgentSession,
  getLocalAgentChanges,
  getLocalAgentSession,
  listLocalAgentSessions,
  listLocalAgents,
  listVersions,
  previewLocalAgentDraft,
  recoverLocalAgentApply,
  reviewLocalAgentChanges,
  sendLocalAgentPrompt,
  setLocalAgentOption,
  stopLocalAgentSession
} from '../../api/client';
import type { AgentChange, AgentEvent, AgentPersona, AgentPromptContext, AgentUserRequest, LocalAgent, LocalAgentSession } from '../../api/client';
import type { Section } from '../../app/SettingsSheet';
import Icon from '../../app/Icon';
import Select from '../../app/Select';
import { MenuButton } from '../../app/Menu';
import { useEditor } from '../EditorContext';
import type { TodosState } from '../TodosList';
import { resolveInstructions } from '../personas';
import { AGENTS_CHANGED, VERSIONS_CHANGED, errorText, relativeTime } from '../shared';
import { AgentComposer, ChangesTray, PersonaPicker, PlanStrip, ReviewView, Transcript, Welcome, readStored as read, taskPersona, useFollow, useSkills, writeStored as write } from './parts';
import type { ContextKind, Draft, TrayChange } from './parts';
import { RUNNING, addEvent, project } from './transcript';
import type { Checkpoint } from './transcript';

export type AgentStatus = 'running' | 'waiting' | 'changes' | null;

const monogram = (name: string) => name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2);

/** The 1.10 ACP agents (OpenCode, Codex, Claude and the others), each run isolated by agentSessionService.js. */
export default function LocalAgentTab({ hidden, active, todos, onStatus, onOpenSettings }: { hidden: boolean; active: boolean; todos: TodosState; onStatus(status: AgentStatus): void; onOpenSettings(section: Section): void }) {
  const api = useEditor();
  const latest = useRef(api);
  latest.current = api;
  const [agents, setAgents] = useState<LocalAgent[]>([]);
  const [agentId, setAgentId] = useState(() => read('spectrum-agent-pick') || 'opencode');
  const [mode, setMode] = useState<'review' | 'direct'>('review');
  const [sessions, setSessions] = useState<LocalAgentSession[]>([]);
  const [session, setSession] = useState<LocalAgentSession | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [pending, setPending] = useState<AgentUserRequest[]>([]);
  const [changes, setChanges] = useState<AgentChange[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [persona, setPersona] = useState<string | undefined>();
  // the persona the user chose, which a task button's own persona replaces only for that task
  const picked = useRef<string | undefined>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  // a new session's first message, sent once the agent is connected
  const queued = useRef<{ text: string; skill?: string; persona: AgentPersona | null; context: AgentPromptContext } | null>(null);
  const known = useRef({ session, sessions });
  known.current = { session, sessions };
  const skills = useSkills(api.projectId, active);

  // one that can run here: a pick unavailable on this computer (OpenCode on Windows) falls back to the first that is
  const current = agents.find((a) => a.id === agentId && !a.unavailable) ?? agents.find((a) => !a.unavailable);
  const currentId = current?.id ?? agentId;
  const view = useMemo(() => project(events, { pending, checkpoints }), [events, pending, checkpoints]);
  const running = working || RUNNING.includes(session?.status || '');
  const waiting = view.items.some((i) => i.type === 'request' && !i.answered);
  const status: AgentStatus = waiting ? 'waiting' : running ? 'running' : session?.mode === 'review' && changes.length ? 'changes' : null;
  const fail = (err: unknown) => setError(errorText(err));

  useEffect(() => onStatus(status), [status]);

  const refreshSessions = () => listLocalAgentSessions(latest.current.projectId).then((r) => setSessions(r.sessions));

  // the "Before AI changes" checkpoints saved while this session was the project's latest
  const loadCheckpoints = async (s = known.current.session) => {
    if (!s) return setCheckpoints([]);
    const next = known.current.sessions.map((x) => x.createdAt).filter((at) => at > s.createdAt).sort()[0] ?? '\uffff';
    const { versions } = await listVersions(latest.current.projectId);
    // ponytail: a session resumed after a newer one started loses the checkpoints saved since; label them per session if it matters
    setCheckpoints(
      versions
        .filter((v) => v.reason === 'before-ai' && /agent/i.test(v.label) && v.createdAt >= s.createdAt && v.createdAt < next)
        .map((v) => ({ id: v.id, number: v.number, label: v.label, createdAt: v.createdAt }))
    );
  };

  const choose = async (id: string) => {
    setReviewing(false);
    setError('');
    queued.current = null;
    if (!id) {
      setSession(null);
      setEvents([]);
      setPending([]);
      setChanges([]);
      setCheckpoints([]);
      write(`spectrum-agent:${latest.current.projectId}`, undefined);
      return;
    }
    const r = await getLocalAgentSession(id);
    if (r.session.projectId !== latest.current.projectId) throw new Error('This session belongs to another project.');
    setSession(r.session);
    setAgentId(r.session.agentId);
    // so Settings › Agents opens at the agent shown
    write('spectrum-agent-pick', r.session.agentId);
    setEvents(r.session.events);
    setPending(r.session.pending || []);
    picked.current = read(`spectrum-agent-persona:${id}`) || undefined;
    setPersona(picked.current);
    setChanges((await getLocalAgentChanges(id)).changes);
    write(`spectrum-agent:${latest.current.projectId}`, id);
    await loadCheckpoints(r.session).catch(() => undefined);
  };

  useEffect(() => {
    listLocalAgents().then((r) => setAgents(r.agents), fail);
    refreshSessions().catch(fail);
    const id = read(`spectrum-agent:${api.projectId}`);
    if (id) choose(id).catch(() => write(`spectrum-agent:${api.projectId}`, undefined));
  }, [api.projectId]);

  // Settings › Agents may have set one up since
  useEffect(() => {
    const refresh = () => listLocalAgents().then((r) => setAgents(r.agents), () => undefined);
    if (active) refresh();
    window.addEventListener(AGENTS_CHANGED, refresh);
    return () => window.removeEventListener(AGENTS_CHANGED, refresh);
  }, [active]);

  const deliver = async (id: string, message: NonNullable<typeof queued.current>) => {
    try {
      await sendLocalAgentPrompt(id, message.text, { persona: message.persona, context: message.context });
    } catch (err) {
      fail(err);
      setDraft({ text: message.text, skill: message.skill, n: Date.now() });
    }
  };

  useEffect(() => {
    if (!session) return;
    const id = session.id;
    const source = new EventSource(`/api/agent-sessions/${id}/events?after=${session.events[session.events.length - 1]?.id || 0}`);
    source.onmessage = (message) => {
      const e = JSON.parse(message.data) as AgentEvent;
      setEvents((old) => addEvent(old, e));
      if (e.type === 'state') {
        setSession((old) => (old ? { ...old, status: e.data.status, updatedAt: e.at } : old));
        if (!RUNNING.includes(e.data.status)) {
          setPending([]);
          refreshSessions().catch(() => undefined);
          loadCheckpoints().catch(() => undefined);
        }
        const first = queued.current;
        if (first && e.data.status === 'ready') void deliver(id, first);
        else if (first && !RUNNING.includes(e.data.status)) setDraft({ text: first.text, skill: first.skill, n: Date.now() });
        if (first && !RUNNING.includes(e.data.status)) queued.current = null;
      }
      if (e.type === 'request') setPending((old) => [...old.filter((p) => p.requestId !== e.data.requestId), e.data]);
      if (e.type === 'answered') setPending((old) => old.filter((p) => p.requestId !== e.data.requestId));
      if (e.type === 'changes') {
        setChanges(e.data.changes);
        if (session.mode === 'direct') latest.current.reloadProject().catch(fail);
      }
    };
    source.onerror = () => {
      /* EventSource retries with Last-Event-ID; completion is a protocol event. */
    };
    return () => source.close();
  }, [session?.id]);

  const scroll = useFollow([view, reviewing, hidden]);

  // null: no instructions, which also takes back a persona the session had
  const personaOf = (id: string | undefined): AgentPersona | null => {
    const { settings } = latest.current;
    const prompt = resolveInstructions(settings, id);
    return prompt ? { name: settings.personas.find((p) => p.id === id)?.name || 'Your instructions', prompt } : null;
  };

  // the backend reads the open to-dos itself and sends each part as an ACP resource
  const contextOf = (picked: Record<ContextKind, boolean>, skill?: string): AgentPromptContext => {
    const a = latest.current;
    return {
      ...(picked.file && a.activePath && { activePath: a.activePath }),
      ...(picked.selection && a.selectionText && { selection: a.selectionText }),
      ...(picked.log && a.compileLog && { log: a.compileLog }),
      ...(picked.todos && { todos: true }),
      ...(skill && { skill })
    };
  };

  const send = async (text: string, { skill, context }: { skill?: string; context: Record<ContextKind, boolean> }) => {
    const message = { text: text || `/${skill}`, skill, persona: personaOf(persona), context: contextOf(context, skill) };
    setError('');
    setWorking(true);
    try {
      await latest.current.prepareAgent();
      if (session && session.agentId === currentId) await sendLocalAgentPrompt(session.id, message.text, { persona: message.persona, context: message.context });
      else {
        const r = await createLocalAgentSession(latest.current.projectId, currentId, mode, message.persona);
        queued.current = message;
        write(`spectrum-agent-persona:${r.session.id}`, persona);
        write(`spectrum-agent:${latest.current.projectId}`, r.session.id);
        setSession(r.session);
        setEvents(r.session.events);
        setPending([]);
        setChanges([]);
        setCheckpoints([]);
        refreshSessions().catch(() => undefined);
      }
    } catch (err) {
      fail(err);
      setDraft({ text, skill, n: Date.now() });
    } finally {
      setWorking(false);
    }
  };

  const pickAgent = (id: string) => {
    setAgentId(id);
    write('spectrum-agent-pick', id);
    if (session && session.agentId !== id) choose('').catch(fail);
  };

  const choosePersona = (id: string | undefined) => {
    setPersona(id);
    if (session) write(`spectrum-agent-persona:${session.id}`, id);
  };

  const resolve = async (action: 'apply' | 'reject', list: TrayChange[]) => {
    if (!session) return;
    setWorking(true);
    setError('');
    try {
      await latest.current.prepareAgent();
      const r = await reviewLocalAgentChanges(session.id, action, changes.filter((c) => list.some((l) => l.path === c.path)));
      setChanges(r.changes);
      if (action === 'apply') {
        await latest.current.reloadProject();
        window.dispatchEvent(new Event(VERSIONS_CHANGED));
        await loadCheckpoints();
      }
    } catch (err) {
      fail(err);
      const snapshot = await getLocalAgentSession(session.id).catch(() => null);
      if (snapshot) setSession(snapshot.session);
    } finally {
      setWorking(false);
    }
  };

  const tray = useMemo(() => changes.map((c): TrayChange => ({ path: c.path, kind: c.kind, binary: c.binary, original: c.original ?? '', proposed: c.proposed ?? '', size: c.size, afterHash: c.afterHash })), [changes]);
  const ready = !!current?.installed && !!current.supported;
  const empty = !session || !view.items.length;
  const usable = agents.filter((a) => !a.unavailable);
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || id;
  const modes = view.modes && !view.configOptions.some((o) => o.category === 'mode') ? view.modes : null;

  return (
    <div className="agent-tab" hidden={hidden}>
      <div className="agent-bar">
        <MenuButton
          icon="clock"
          title="Sessions"
          items={[
            { label: 'New session', icon: 'square.and.pencil', onSelect: () => choose('').catch(fail) },
            sessions.length > 0 && { separator: true },
            ...sessions.map((s) => ({
              // by its first task, which tells two sessions of one agent apart
              label: s.title || `${agentName(s.agentId)} · ${s.mode === 'review' ? 'Isolated' : 'Direct'}`,
              shortcut: `${s.title ? `${agentName(s.agentId)} · ${s.mode === 'review' ? 'Isolated' : 'Direct'} · ` : ''}${relativeTime(s.updatedAt)}`,
              checked: s.id === session?.id,
              onSelect: () => choose(s.id).catch(fail)
            }))
          ]}
        />
        {session ? (
          <span
            className={`badge ${session.mode === 'review' ? '' : 'warning'}`}
            title={session.mode === 'review' ? 'The agent works on a copy; you choose what reaches your project' : 'The agent edits your project; a checkpoint is saved before each task'}
          >
            {session.mode === 'review' ? 'Isolated' : 'Direct'}
          </span>
        ) : (
          <Select
            className="agent-mode"
            title="Isolated: the agent works on a copy and you review its changes. Direct: it edits your project, with a checkpoint saved before each task."
            value={mode}
            options={[
              ['review', 'Isolated'],
              ['direct', 'Direct']
            ]}
            onChange={(v) => setMode(v as typeof mode)}
          />
        )}
        {session &&
          view.configOptions.map((o) => (
            <Select
              key={o.id}
              className="agent-option"
              title={o.description || o.name}
              value={o.currentValue}
              disabled={running}
              options={(o.options || []).flatMap((v: any) => v.options || [v]).map((v: any) => [v.value, v.name])}
              onChange={(value) => setLocalAgentOption(session.id, o.id, value).catch(fail)}
            />
          ))}
        {session && modes && (
          <Select
            className="agent-option"
            title="Mode"
            value={modes.currentModeId}
            disabled={running}
            options={modes.availableModes.map((m) => [m.id, m.name])}
            onChange={(value) => setLocalAgentOption(session.id, '__mode', value).catch(fail)}
          />
        )}
        <PersonaPicker
          value={persona}
          onChange={(id) => {
            picked.current = id;
            choosePersona(id);
          }}
          onManage={() => onOpenSettings('personas')}
        />
        <span className="grow" />
        {session && RUNNING.includes(session.status) && (
          <button className="btn small" onClick={() => stopLocalAgentSession(session.id).catch(fail)}>
            <Icon name="stop.fill" /> Stop
          </button>
        )}
      </div>

      {reviewing ? (
        <ReviewView
          changes={tray}
          busy={running}
          direct={session?.mode === 'direct'}
          onApply={(list) => resolve('apply', list)}
          onReject={(list) => resolve('reject', list)}
          onClose={() => setReviewing(false)}
          preview={session?.mode === 'review' ? () => previewLocalAgentDraft(session.id) : undefined}
        />
      ) : (
        <div className="agent-scroll" ref={scroll.ref} onScroll={scroll.onScroll} role="log">
          <PlanStrip entries={view.plan} todos={todos} />
          {empty && (
            <Welcome
              onTask={(task) => {
                setDraft({ text: task.prompt, skill: task.skill, n: Date.now() });
                choosePersona(taskPersona(api.settings.personas, task) ?? picked.current);
              }}
            />
          )}
          <Transcript items={view.items} terminals={view.terminals} todos={todos} onAnswer={session ? (request, answer) => answerLocalAgent(session.id, request.requestId, answer).then(() => undefined) : undefined} />
          {session && RUNNING.includes(session.status) && (
            <div className="composer-msg assistant composer-thinking">
              <span className="spinner" /> {session.status === 'starting' ? 'Connecting to the agent…' : session.status === 'stopping' ? 'Stopping…' : 'Agent working…'}
            </div>
          )}
          {session?.recoveries?.map((r) => (
            <div className="agent-request" key={r.id}>
              <p>Applying files was interrupted. Recover their previous contents without overwriting newer edits.</p>
              <button
                className="btn small"
                disabled={running}
                onClick={async () => {
                  setWorking(true);
                  try {
                    await api.prepareAgent();
                    await recoverLocalAgentApply(session.id, r.id);
                    await api.reloadProject();
                    await choose(session.id);
                  } catch (err) {
                    fail(err);
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Recover {r.files.length} files
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="agent-foot">
        {error && (
          <div className="agent-note error" role="alert">
            {error}
          </div>
        )}
        {!reviewing && <ChangesTray changes={tray} direct={session?.mode === 'direct'} onOpen={() => setReviewing(true)} />}
        {!session && mode === 'direct' && <p className="field-hint">The agent can change your project straight away. A checkpoint is saved before each task.</p>}
        <AgentComposer
          busy={running || (!session && !ready)}
          firstTurn={empty}
          commands={view.commands}
          skills={skills}
          todoCount={(todos.mine || []).filter((t) => !t.done).length}
          draft={draft}
          placeholder="Give the agent a task, or type / for commands and skills"
          onSend={(text, opts) => void send(text, opts)}
          picker={
            <div className="agent-picker">
              <div className="agent-picker-icons" role="radiogroup" aria-label="Agent">
                {usable.map((a) => (
                  <button
                    key={a.id}
                    role="radio"
                    aria-checked={a.id === agentId}
                    className={`agent-icon ${a.id === agentId ? 'active' : ''} ${a.installed && a.supported ? '' : 'missing'}`}
                    title={a.installed && a.supported ? a.name : `${a.name} · Not set up`}
                    aria-label={a.name}
                    disabled={running}
                    onClick={() => pickAgent(a.id)}
                  >
                    {monogram(a.name)}
                  </button>
                ))}
              </div>
              <span className="agent-picker-name">
                {current?.name}
                {current?.experimental && ' · Experimental'}
              </span>
              {current && !ready && (
                <button className="btn small ghost" onClick={() => onOpenSettings('agents')}>
                  Set up in Settings › Agents
                </button>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
