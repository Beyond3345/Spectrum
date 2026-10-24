import { useEffect, useMemo, useRef, useState } from 'react';
import { getChat, listChats, runAgent } from '../../api/client';
import type { ChatSummary, ChatThread } from '../../api/client';
import type { Section } from '../../app/SettingsSheet';
import Icon from '../../app/Icon';
import { MenuButton } from '../../app/Menu';
import { searchConfigFor } from '../../app/settings';
import { useEditor } from '../EditorContext';
import type { PendingChange } from '../EditorContext';
import type { TodosState } from '../TodosList';
import { chatMessage, useChatThread } from '../chatThread';
import { resolveInstructions } from '../personas';
import { CHATS_CHANGED, buildProjectContext, errorText, patchesToChanges, relativeTime } from '../shared';
import { AgentComposer, ChangesTray, PersonaPicker, ReviewView, Transcript, Welcome, openTodos, taskPersona, useFollow, useSkills } from './parts';
import type { ContextKind, Draft, TrayChange } from './parts';
import type { AgentStatus } from './LocalAgentTab';
import { metaOf, openChanges } from './transcript';
import type { Checkpoint, Item, ThreadMeta as Meta } from './transcript';


const trayOf = (c: PendingChange): TrayChange => ({ path: c.filePath, kind: c.original ? 'modified' : 'created', binary: false, original: c.original, proposed: c.proposed, size: c.proposed.length });

/**
 * The built-in agent (the bottom card's Edit before 2.0): it reads the project and proposes changes through the
 * main model's tools, which wait in the same tray as a local agent's. Threads are chats marked `agent`.
 */
export default function SpectrumAgentTab({
  hidden,
  active,
  todos,
  openThread,
  onStatus,
  onOpenSettings
}: {
  hidden: boolean;
  active: boolean;
  todos: TodosState;
  /** a chat to carry on here (an Edit chat from the bottom card) */
  openThread: { id: string; n: number } | null;
  onStatus(status: AgentStatus): void;
  onOpenSettings(section: Section): void;
}) {
  const api = useEditor();
  const latest = useRef(api);
  latest.current = api;
  const [newPersona, setNewPersona] = useState<string | undefined>();
  const { thread, threadRef, show, append, update } = useChatThread({
    projectId: api.projectId,
    notify: api.notify,
    fresh: () => ({ agent: true, ...(newPersona && { persona: newPersona }) })
  });
  const [threads, setThreads] = useState<ChatSummary[]>([]);
  const [tray, setTray] = useState<PendingChange[]>([]);
  // the thread a request is running for; Stop leaves its answer unread
  const [running, setRunning] = useState<ChatThread | null>(null);
  const runRef = useRef(0);
  const [applying, setApplying] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const skills = useSkills(api.projectId, active);
  const personaId = thread ? thread.persona : newPersona;

  const status: AgentStatus = running ? 'running' : tray.length ? 'changes' : null;
  useEffect(() => onStatus(status), [status]);

  const refresh = () =>
    listChats(latest.current.projectId).then(
      (res) => setThreads(res.chats.filter((c) => c.agent)),
      () => undefined
    );
  useEffect(() => {
    refresh();
    window.addEventListener(CHATS_CHANGED, refresh);
    return () => window.removeEventListener(CHATS_CHANGED, refresh);
  }, [api.projectId]);

  const open = async (id: string | null, adopt = false) => {
    setReviewing(false);
    if (!id) {
      show(null);
      setTray([]);
      return;
    }
    let { chat } = await getChat(latest.current.projectId, id);
    // an Edit chat carried on here becomes a thread of the workspace's
    if (adopt && !chat.agent) chat = { ...chat, agent: true };
    show(chat);
    if (adopt) update(chat, (c) => c);
    setTray(await openChanges(chat, latest.current.ensureFileContent));
  };

  useEffect(() => {
    if (openThread) open(openThread.id, true).catch((err) => api.notify(`Couldn’t open the chat: ${errorText(err)}`, 'error'));
  }, [openThread?.n]);

  const scroll = useFollow([thread, running, reviewing, hidden]);

  const send = async (text: string, { skill, context }: { skill?: string; context: Record<ContextKind, boolean> }) => {
    const a = latest.current;
    const base = append(threadRef.current, chatMessage('user', text || `/${skill}`));
    const run = ++runRef.current;
    setRunning(base);
    try {
      let prompt = text || 'Follow the skill’s instructions for this project.';
      const list = context.todos ? openTodos(todos) : [];
      if (list.length) prompt += `\n\n[Open to-dos]\n${list.map((t) => `- ${t.text}`).join('\n')}`;
      const outline = await buildProjectContext(a);
      if (outline) prompt += `\n\n[Project Context]\n${outline}`;
      const history = base.messages
        .slice(0, -1)
        .filter((m) => m.content && !metaOf(m).error)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await runAgent({
        task: 'custom',
        prompt,
        selection: context.selection ? a.selectionText : '',
        content: a.editorValue,
        mode: 'tools',
        projectId: a.projectId,
        activePath: context.file ? a.activePath : '',
        compileLog: context.log ? a.compileLog : '',
        llmConfig: a.llm.main,
        searchConfig: searchConfigFor(a.settings, a.llm.search),
        interaction: 'agent',
        history,
        reasoningEffort: a.settings.reasoningEffort,
        instructions: resolveInstructions(a.settings, base.persona) || undefined,
        ...(skill && { skill })
      });
      if (runRef.current !== run) return;
      // the backend words AI failures as a reply; shown as errors, kept out of the history
      if (!res.ok) throw new Error(res.reply || 'The AI request failed.');
      const changes = (await patchesToChanges(latest.current, res.patches || [], 'Spectrum agent')).filter((c) => c.original !== c.proposed);
      const meta: Meta = {
        ...(changes.length && { changes: changes.map(({ filePath, proposed }) => ({ filePath, proposed })) }),
        ...(res.todos?.length && { todos: res.todos })
      };
      append(base, chatMessage('assistant', res.reply || (changes.length ? 'The changes are ready to review.' : 'No changes were suggested.'), Object.keys(meta).length ? meta : undefined));
      if (changes.length && threadRef.current?.id === base.id) setTray((old) => [...old.filter((o) => !changes.some((c) => c.filePath === o.filePath)), ...changes]);
    } catch (err) {
      if (runRef.current === run) append(base, chatMessage('assistant', `Request failed: ${errorText(err)}`, { error: true }));
    } finally {
      if (runRef.current === run) setRunning(null);
    }
  };

  const stop = () => {
    if (!running) return;
    // ponytail: the backend finishes its tool loop; the answer is left unread rather than cancelled there
    runRef.current += 1;
    append(running, chatMessage('assistant', 'Stopped before the agent finished.', { error: true }));
    setRunning(null);
  };

  /** Marks the open proposals for these files applied or rejected, with the checkpoint saved before applying. */
  const mark = (owner: ChatThread, paths: string[], status: 'applied' | 'rejected', checkpoint?: Checkpoint) =>
    update(owner, (chat) => {
      let last = -1;
      const messages = chat.messages.map((m, i) => {
        const meta = metaOf(m);
        if (!meta.changes?.some((c) => !c.status && paths.includes(c.filePath))) return m;
        last = i;
        return { ...m, meta: { ...meta, changes: meta.changes.map((c) => (!c.status && paths.includes(c.filePath) ? { ...c, status } : c)) } };
      });
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

  const items = useMemo(
    () =>
      (thread?.messages || []).flatMap((m, i): Item[] => {
        const meta = metaOf(m);
        return [
          m.role === 'user' ? { type: 'user', key: `u${i}`, text: m.content } : meta.error ? { type: 'notice', key: `n${i}`, text: m.content, error: true } : { type: 'assistant', key: `a${i}`, text: m.content },
          ...(meta.todos || []).map((todo, j): Item => ({ type: 'todo', key: `t${i}-${j}`, todo })),
          ...(meta.checkpoints || []).map((checkpoint): Item => ({ type: 'checkpoint', key: `c${i}-${checkpoint.id}`, checkpoint }))
        ];
      }),
    [thread]
  );

  const choosePersona = (id: string | undefined) => {
    if (thread) update(thread, (chat) => ({ ...chat, persona: id }));
    else setNewPersona(id);
  };

  const trayChanges = useMemo(() => tray.map(trayOf), [tray]);
  const here = running && running.id === thread?.id;
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
        <PersonaPicker value={personaId} onChange={choosePersona} onManage={() => onOpenSettings('personas')} />
        <span className="grow" />
        {running && (
          <button className="btn small" onClick={stop}>
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
                choosePersona(taskPersona(api.settings.personas, task) ?? personaId);
              }}
            />
          )}
          <Transcript items={items} todos={todos} />
          {here && (
            <div className="composer-msg assistant composer-thinking">
              <span className="spinner" /> Working…
            </div>
          )}
        </div>
      )}

      <div className="agent-foot">
        {!reviewing && <ChangesTray changes={trayChanges} onOpen={() => setReviewing(true)} />}
        <AgentComposer
          busy={!!running}
          firstTurn={!items.length}
          skills={skills}
          todoCount={openTodos(todos).length}
          draft={draft}
          placeholder="Ask the Spectrum agent to work on the project, or type / for skills"
          onSend={(text, opts) => void send(text, opts)}
        />
      </div>
    </div>
  );
}
