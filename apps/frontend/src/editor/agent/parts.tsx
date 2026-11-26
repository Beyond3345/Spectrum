import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { listSkills, restoreVersion } from '../../api/client';
import type { AgentMemory, AgentUserRequest, Skill, SuggestedTodo, TodoLink } from '../../api/client';
import Icon from '../../app/Icon';
import { MenuButton } from '../../app/Menu';
import { TAG_COLOURS } from '../../app/appearance';
import type { TagColour } from '../../app/settings';
import { confirmDialog, promptDialog } from '../../app/Dialogs';
import Sheet from '../../app/Sheet';
import SplitDiffView, { DiffCount, countChanges } from '../SplitDiffView';
import HunkList, { PdfCompare, reviewPdfs } from '../HunkReview';
import type { Pdf, ReviewKeys } from '../HunkReview';
import { countOf as hunkCount, renames, review, settle, target } from '../reviewHunks';
import type { Choice } from '../reviewHunks';
import { keptAsideNote } from '../tools/VersionsTab';
import { useEditor } from '../EditorContext';
import type { TodosState } from '../TodosList';
import { Markdown, VERSIONS_CHANGED, errorText } from '../shared';
import type { AgentCommand, Checkpoint, Item, PlanEntry, ToolCall } from './transcript';
import { choicesOf, permissionShows } from './transcript';
import { MAX_PICTURES, PictureChips, PictureStrip, ToolPicture, picturesOf } from './pictures';
import type { Picture } from './pictures';

// The pieces both agent tabs are made of: transcript cards, plan strip, changes tray and review, composer.

const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const MAX_OUTPUT = 20000;
const clip = (text: string) => (text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…` : text);
const shown = (value: unknown) => clip(typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '');

/** Per-viewer conveniences in this browser's storage, which may be blocked: only the convenience is lost then. */
export const readStored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
export const writeStored = (key: string, value: string | undefined) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // private window or blocked storage
  }
};

// ─── Personas ───

/** The persona a chat uses, which replaces the default instructions while it's chosen. */
export function PersonaPicker({ value, onChange, onManage, disabled }: { value?: string; onChange(id: string | undefined): void; onManage(): void; disabled?: boolean }) {
  const { settings } = useEditor();
  const persona = settings.personas.find((p) => p.id === value);
  const dot = (colour?: TagColour) => <span className="persona-dot" style={{ background: colour && TAG_COLOURS[colour]?.[1] }} />;
  return (
    <MenuButton
      className="btn small ghost persona-pick"
      title="Persona: its instructions replace your default ones while it’s chosen"
      disabled={disabled}
      label={
        <>
          {dot(persona?.colour)}
          <span className="truncate">{persona?.name || 'Default instructions'}</span>
        </>
      }
      items={[
        { label: 'Default instructions', checked: !persona, onSelect: () => onChange(undefined) },
        ...settings.personas.map((p) => ({ label: <>{dot(p.colour)} {p.name}</>, checked: p.id === persona?.id, onSelect: () => onChange(p.id) })),
        { separator: true },
        { label: 'Edit personas…', onSelect: onManage }
      ]}
    />
  );
}

/** The skills switched on for this project, for the / menu and the skill chip. */
export function useSkills(projectId: string, refresh: unknown) {
  const [skills, setSkills] = useState<Skill[]>([]);
  useEffect(() => {
    let live = true;
    listSkills(projectId).then(
      (res) => live && setSkills(res.skills.filter((s) => s.active)),
      // ponytail: without the skills service the menu just has no skills
      () => live && setSkills([])
    );
    return () => {
      live = false;
    };
  }, [projectId, refresh]);
  return skills;
}

/** Keeps a conversation scrolled to its end as it grows, unless the user has scrolled up to read. */
export function useFollow(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (ref.current && follow.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, deps);
  const onScroll = (e: { currentTarget: HTMLElement }) => {
    const el = e.currentTarget;
    follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  return { ref, onScroll };
}

// ─── Welcome ───

export type AgentTask = { label: string; icon: string; skill: string; persona?: string; prompt: string };

export const TASKS: AgentTask[] = [
  {
    label: 'Literature sweep',
    icon: 'books.vertical',
    skill: 'paper-lookup',
    prompt: 'Search the literature on this project’s topic. List the most relevant papers with full references and a line on why each matters, and say which are already in the project’s bibliography.'
  },
  {
    label: 'Related work',
    icon: 'text.book.closed',
    skill: 'spectrum-related-work',
    prompt: 'Draft or improve the related work section. Group prior work by theme, cite only keys that exist in the project’s bibliography (propose entries for anything missing) and show where this project’s contribution fits.'
  },
  {
    label: 'Citation audit',
    icon: 'quote.opening',
    skill: 'citation-management',
    prompt: 'Check every citation in the project: keys that are undefined, unused or duplicated, and entries with missing or wrong details such as DOIs, years and titles. Propose fixes to the bibliography.'
  },
  {
    label: 'Manuscript review',
    icon: 'graduationcap',
    skill: 'peer-review',
    persona: 'critical-reviewer',
    prompt: 'Review this manuscript as a careful referee would. Summarise its contribution, then list major and minor concerns with the file and line of each. Don’t change any files.'
  },
  {
    label: 'Verify claims',
    icon: 'checkmark.seal',
    skill: 'spectrum-verify-claims',
    prompt: 'Check the claims in the open file against the sources they cite. Run check_references on the keys first, read each source with read_source, and record every claim with record_claim, with the source’s own words for a rating that says what it says. Don’t rewrite the text.'
  }
];

/** A task handed to the workspace from elsewhere (Research's Deep research, Draft related work and Verify claims). */
/** plan: the task starts with Plan on, so its first turn only reads and ends with a plan to approve. */
export type TaskRequest = { prompt: string; skill: string; persona?: string; research?: string; plan?: boolean; images?: Picture[]; n: number };

/** The task's persona, a starter's id (Settings › Personas), while the user still has it. */
export const taskPersona = (personas: { id: string }[], task: { persona?: string }) => personas.find((p) => p.id === task.persona)?.id;

export function Welcome({ onTask }: { onTask(task: AgentTask): void }) {
  const { projectName } = useEditor();
  return (
    <div className="agent-welcome">
      <div className="agent-welcome-title">What would you like to do today?</div>
      <div className="agent-welcome-project">Working on “{projectName}”</div>
      <div className="agent-tasks">
        {TASKS.map((task) => (
          <button key={task.label} className="agent-task" onClick={() => onTask(task)}>
            <Icon name={task.icon} />
            <span>{task.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Transcript ───

export function AgentQuestion({ request, onAnswer }: { request: AgentUserRequest; onAnswer: (answer: unknown) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (answer: unknown) => { setBusy(true); setError(''); try { await onAnswer(answer); } catch (err) { setError(errorText(err)); setBusy(false); } };
  const params = request.params;
  const properties = params.requestedSchema?.properties || {};
  const uid = useId();
  const shows = request.kind === 'permission' ? permissionShows(params.toolCall) : null;
  return <div className="agent-request">
    <strong>{request.kind === 'permission' ? params.toolCall?.title || 'Permission requested' : request.kind === 'plan' ? 'Review the agent’s plan' : params.message || 'The agent needs your input'}</strong>
    {/* what it would run or change, in full, before Allow or Deny, whatever the title says */}
    {shows?.command && <pre className="agent-output">$ {shows.command}</pre>}
    {shows && shows.paths.length > 0 && <div className="field-hint">{shows.paths.length === 1 ? 'File' : 'Files'}: <span className="mono">{shows.paths.join(', ')}</span></div>}
    {shows?.diffs.map((d, i) => <div className="agent-tool-diff" key={i}><SplitDiffView original={d.oldText || ''} proposed={d.newText || ''} leftLabel={nameOf(d.path)} rightLabel="Agent’s version" /></div>)}
    {shows?.texts.map((text, i) => <pre className="agent-output" key={i}>{text}</pre>)}
    {params.toolCall?.rawInput && <details><summary>Details</summary><pre>{JSON.stringify(params.toolCall.rawInput, null, 2)}</pre></details>}
    {request.kind === 'plan' && <Markdown>{params.plan || params.content || params.title || 'Approve this plan to continue.'}</Markdown>}
    {request.kind === 'permission' ? <div className="row wrap">{(params.options || []).map((o: any) => <button className="btn small" disabled={busy} key={o.optionId} onClick={() => void send({ optionId: o.optionId })}>{o.name}</button>)}<button className="btn small" disabled={busy} onClick={() => void send({ cancelled: true })}>Cancel</button></div>
      : request.kind === 'plan' ? <div className="row"><button className="btn small" disabled={busy} onClick={() => void send({ approved: true })}>Approve</button><button className="btn small" disabled={busy} onClick={() => void send({ approved: false })}>Decline</button></div>
      : <>
        {params.mode === 'url' ? <p>Continue at <a href={/^https:\/\//i.test(params.url || '') ? params.url : undefined} target="_blank" rel="noreferrer">{params.url}</a>. Only proceed if you trust this agent and website.</p>
          : Object.entries(properties).length ? Object.entries(properties).map(([key, schema]: [string, any]) => <label className="field" key={key}>{schema.title || key}{schema.description && <span className="field-hint">{schema.description}</span>}{schema.type === 'boolean' ? <input type="checkbox" checked={values[key] === true} onChange={(e) => setValues({ ...values, [key]: e.target.checked })} /> : schema.enum ? <select value={String(values[key] ?? '')} onChange={(e) => setValues({ ...values, [key]: e.target.value })}><option value="">Choose…</option>{schema.enum.map((v: string) => <option key={v}>{v}</option>)}</select> : choicesOf(schema) ? <>{/* a choice, or the user's own words: an agent such as Codex takes words that are no choice as the answer */}<input list={`${uid}-${key}`} placeholder="Choose, or type your own answer" value={String(values[key] ?? '')} onChange={(e) => setValues({ ...values, [key]: e.target.value })} /><datalist id={`${uid}-${key}`}>{choicesOf(schema)!.map((c) => <option key={c.value} value={c.value}>{c.label === c.value ? undefined : c.label}</option>)}</datalist></> : <input value={String(values[key] ?? '')} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />}</label>)
          : (params.questions || [{ id: 'answer', question: params.question || 'Your answer' }]).map((q: any, i: number) => <label className="field" key={q.id || i}>{q.question || q.text || q.header || 'Your answer'}<input value={String(values[q.id || String(i)] ?? '')} onChange={(e) => setValues({ ...values, [q.id || String(i)]: e.target.value })} /></label>)}
        <div className="row"><button className="btn small" disabled={busy} onClick={() => void send({ action: 'accept', content: values })}>{params.mode === 'url' ? 'I continued on the website' : 'Submit'}</button><button className="btn small" disabled={busy} onClick={() => void send({ action: 'decline' })}>Decline</button></div>
      </>}
    {error && <div className="field-hint error">{error}</div>}
  </div>;
}

const KIND_ICONS: Record<string, string> = {
  read: 'doc.text',
  edit: 'pencil',
  delete: 'trash',
  move: 'arrow.right',
  search: 'magnifyingglass',
  execute: 'terminal',
  think: 'lightbulb',
  fetch: 'globe',
  switch_mode: 'arrow.triangle.2.circlepath'
};

/** How long a step took, to a tenth of a second; nothing for one too quick to be worth saying. */
const took = (ms?: number) => (ms === undefined || ms < 50 ? '' : `${(ms / 1000).toFixed(ms < 9950 ? 1 : 0)} s`);

/** One tool call, updated in place as the agent reports on it; opens to its output, terminal or diff. */
export function ToolCard({ call, terminals }: { call: ToolCall; terminals: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const count = useMemo(() => {
    // an edit's pieces can end part-way through a line: counted as whole lines, or the last one counts as changed
    const lines = (text?: string | null) => (text && !text.endsWith('\n') ? `${text}\n` : text || '');
    const diffs = call.content.flatMap((c) => (c.type === 'diff' ? [countChanges(lines(c.oldText), lines(c.newText))] : []));
    return diffs.length ? diffs.reduce((a, b) => ({ added: a.added + b.added, removed: a.removed + b.removed })) : null;
  }, [call.content]);
  const hasBody = call.content.length > 0 || call.rawInput !== undefined || call.rawOutput !== undefined;
  const where = call.locations[0]?.path;
  return (
    <div className={`agent-tool ${call.status}`}>
      <button className="agent-tool-head" aria-expanded={hasBody ? open : undefined} disabled={!hasBody} onClick={() => setOpen((v) => !v)}>
        <Icon name={KIND_ICONS[call.kind] || 'wrench.and.screwdriver'} />
        <span className="agent-tool-title" title={where || call.title}>
          {call.title || 'Tool call'}
        </span>
        {count && <DiffCount {...count} />}
        {call.status !== 'in_progress' && took(call.ms) && <span className="agent-tool-time">{took(call.ms)}</span>}
        <span className="agent-tool-status">
          {call.status === 'completed' ? (
            <Icon name="checkmark" />
          ) : call.status === 'failed' ? (
            'Failed'
          ) : call.status === 'pending' ? (
            'Waiting'
          ) : (
            <span className="spinner" />
          )}
        </span>
      </button>
      {open && (
        <div className="agent-tool-body">
          {call.content.map((c, i) =>
            c.type === 'diff' ? (
              <div className="agent-tool-diff" key={i}>
                <SplitDiffView original={c.oldText || ''} proposed={c.newText || ''} leftLabel={nameOf(c.path)} rightLabel="Agent’s version" />
              </div>
            ) : c.type === 'terminal' ? (
              // ponytail: the output of a terminal Spectrum runs stays with the backend; agents that run their own show it as text
              <pre className="agent-output" key={i}>$ {terminals[c.terminalId] || 'Terminal'}</pre>
            ) : c.content?.type === 'text' ? (
              <pre className="agent-output" key={i}>{clip(c.content.text || '')}</pre>
            ) : c.content?.type === 'image' && c.content.data ? (
              <ToolPicture key={i} url={`data:${c.content.mimeType || 'image/png'};base64,${c.content.data}`} file={call.locations[0]?.path} />
            ) : null
          )}
          {!call.content.length && call.rawInput !== undefined && <pre className="agent-output">{shown(call.rawInput)}</pre>}
          {!call.content.length && call.rawOutput !== undefined && <pre className="agent-output">{shown(call.rawOutput)}</pre>}
        </div>
      )}
    </div>
  );
}

/** The open to-dos, the user's and the source's, as they go with a message. */
export const openTodos = (todos: TodosState): SuggestedTodo[] => [
  ...(todos.mine || []).filter((t) => !t.done).map((t) => ({ text: t.text, ...(t.link && { link: t.link }), ...(todos.groups[t.group ?? '']?.name && { group: todos.groups[t.group!].name }) })),
  ...todos.source.map((t) => ({ text: t.text, link: { file: t.file, line: t.line } }))
];

const linkText = (link: TodoLink) => ('file' in link ? `${nameOf(link.file)}, line ${link.line}` : 'doc' in link ? `${nameOf(link.doc)} PDF, page ${link.page}` : `Reference ${link.key}`);

function TodoCard({ todo, todos }: { todo: SuggestedTodo; todos: TodosState }) {
  const added = !!todos.mine?.some((t) => t.text === todo.text);
  return (
    <div className="agent-card">
      <Icon name="checklist" />
      <div className="grow">
        <div className="agent-card-label">Suggested to-do</div>
        <div>{todo.text}</div>
        {(todo.link || todo.group) && <div className="field-hint">{[todo.link && linkText(todo.link), todo.group && `In ${todo.group}`].filter(Boolean).join(' · ')}</div>}
      </div>
      {/* in the group it names, made when the project hasn't one by that name */}
      <button className="btn small" disabled={added} onClick={async () => void todos.add(todo.text, todo.link, todo.group ? await todos.groupFor(todo.group) : undefined)}>
        {added ? 'Added' : 'Add'}
      </button>
    </div>
  );
}

/** A host isolation refused the agent, with the one step that allows it for that agent. */
function NetworkCard({ host, allowed, agent = 'the agent', onAllow }: { host: string; allowed: boolean; agent?: string; onAllow?: (host: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="agent-card">
      <Icon name="globe" />
      <div className="grow">
        <div className="agent-card-label">{allowed ? 'Host allowed' : 'Host refused'}</div>
        <div>
          {allowed ? `${agent} may reach ` : `Isolation refused ${agent} the host `}
          <span className="mono">{host}</span>
          {allowed ? ' from now on, and is told so with its next task.' : ', which is not on its list.'}
        </div>
        {!allowed && <div className="field-hint">Allow it only if you would trust that host with what the agent can read: its copy of your project and its own sign-in.</div>}
        {error && <div className="field-hint error">{error}</div>}
      </div>
      {!allowed && onAllow && (
        <button
          className="btn small"
          disabled={busy}
          title={`Adds ${host} to the hosts ${agent} may reach, in every session. Settings › Agents lists them.`}
          onClick={() => {
            setBusy(true);
            setError('');
            void onAllow(host).catch((err) => setError(errorText(err))).finally(() => setBusy(false));
          }}
        >
          Allow for {agent}
        </button>
      )}
    </div>
  );
}

/**
 * What the Spectrum agent remembers for the project, as its cards and the Memory sheet need it: the lines (null until
 * they are read) and the user's changes, each resolving whether it was made.
 */
export type Memory = {
  lines: AgentMemory['lines'] | null;
  max?: AgentMemory['max'];
  add(text: string): Promise<boolean>;
  edit(id: string, text: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
};

/** A line the agent suggests to remember: kept only by this button. */
function MemoryCard({ text, memory }: { text: string; memory?: Memory }) {
  const [busy, setBusy] = useState(false);
  const added = !!memory?.lines?.some((l) => l.text === text.trim());
  return (
    <div className="agent-card">
      <Icon name="text.badge.plus" />
      <div className="grow">
        <div className="agent-card-label">Suggested to remember</div>
        <div>{text}</div>
      </div>
      {memory && (
        <button className="btn small" disabled={added || busy} title="Spectrum remembers this line for the project and gives it to the Spectrum agent with every request" onClick={() => { setBusy(true); void memory.add(text).finally(() => setBusy(false)); }}>
          {added ? 'Added' : 'Add'}
        </button>
      )}
    </div>
  );
}

/** What the Spectrum agent remembers for the project: each line to edit or delete, and a line of the user's own to add. */
export function MemorySheet({ memory, onClose }: { memory: Memory; onClose(): void }) {
  const lines = memory.lines || [];
  const full = !!memory.max && lines.length >= memory.max.lines;
  const ask = (title: string, defaultValue = '') =>
    promptDialog({ title, defaultValue, placeholder: 'Spelling: Australian English', message: `One line${memory.max ? `, up to ${memory.max.chars} characters` : ''}.`, confirmLabel: defaultValue ? 'Save' : 'Add' });
  const add = async () => {
    const text = await ask('Remember a line');
    if (text?.trim()) await memory.add(text);
  };
  const edit = async (id: string, old: string) => {
    const text = await ask('Edit the line', old);
    if (text?.trim() && text.trim() !== old) await memory.edit(id, text);
  };
  return (
    <Sheet
      title="Memory"
      width={520}
      onClose={onClose}
      actions={
        <>
          <button className="btn" disabled={full} title={full ? `Spectrum remembers ${memory.max?.lines} lines at most for a project. Delete one first.` : undefined} onClick={() => void add()}>
            <Icon name="plus" /> Add a line
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="field-hint">What the Spectrum agent remembers for this project. Spectrum keeps it on this computer, apart from the project’s files, and gives it to the agent and the assistant with every request. Local agents keep their own memory.</div>
      <div className="kv-list" role="list">
        {lines.map((line) => (
          <div key={line.id} className="kv-row persona-row" role="listitem">
            <span className="persona-text">{line.text}</span>
            <button className="icon-btn small" title="Edit" aria-label={`Edit “${line.text}”`} onClick={() => void edit(line.id, line.text)}>
              <Icon name="pencil" />
            </button>
            <button className="icon-btn small" title="Delete" aria-label={`Delete “${line.text}”`} onClick={() => void memory.remove(line.id)}>
              <Icon name="trash" />
            </button>
          </div>
        ))}
        {!lines.length && (
          <div className="kv-row">
            <span>Nothing is remembered yet. Add a line, or press Add on a line the agent suggests.</span>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** What the plan card's buttons do: the steps as the user left them and those they took out, and whether the agent stops before each new file. */
export type PlanActions = { approve(steps: string[], left: string[], eachFile: boolean, changed: boolean): void; keep(): void };

/**
 * The Spectrum agent's plan, before anything is changed: untick a step to leave it out, or edit the steps as text
 * (a step a line, so they can be reworded, reordered, added and removed), then approve it or go on planning.
 */
export function PlanCard({ steps, actions }: { steps: string[]; actions: PlanActions }) {
  const [list, setList] = useState(steps);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [text, setText] = useState<string | null>(null);
  const kept = list.filter((_, i) => !off.has(i));
  const approve = (eachFile: boolean) => actions.approve(kept, list.filter((_, i) => off.has(i)), eachFile, list.join('\n') !== steps.join('\n'));
  const done = () => {
    // a step a line; what a list would number or mark is the user's habit, not part of the step
    setList((text || '').split('\n').map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s+/, '').trim().slice(0, 300)).filter(Boolean).slice(0, 24));
    setOff(new Set());
    setText(null);
  };
  return (
    <div className="agent-request agent-plan-card">
      <div className="row">
        <strong className="grow">Plan</strong>
        <span className="field-hint">Nothing is changed yet</span>
        <button className="btn small ghost" onClick={() => (text === null ? setText(list.join('\n')) : done())}>
          {text === null ? 'Edit as text' : 'Done'}
        </button>
      </div>
      {text === null ? (
        <ol className="agent-plan-list">
          {list.map((step, i) => (
            <li key={i} className={off.has(i) ? 'off' : ''}>
              <label>
                <input type="checkbox" checked={!off.has(i)} onChange={() => setOff((old) => { const next = new Set(old); if (!next.delete(i)) next.add(i); return next; })} />
                <span>{i + 1}. {step}</span>
              </label>
            </li>
          ))}
        </ol>
      ) : (
        <textarea className="composer-input" aria-label="The plan’s steps, one a line" rows={Math.min(12, Math.max(4, text.split('\n').length + 1))} value={text} onChange={(e) => setText(e.target.value)} />
      )}
      <div className="field-hint">{text === null ? 'Untick a step to leave it out. Nothing reaches your files until you apply it in the review.' : 'One step a line: reword, reorder, add or remove.'}</div>
      <div className="row">
        <button className="btn small primary" disabled={!kept.length || text !== null} onClick={() => approve(false)}>
          Approve and run
        </button>
        <button className="btn small" disabled={!kept.length || text !== null} title="The agent stops before each new file it would change, so you can review one file’s changes before it builds on them" onClick={() => approve(true)}>
          Approve, ask before each file
        </button>
        <button className="btn small" title="Say what to change, and the agent plans again" onClick={actions.keep}>
          Keep planning
        </button>
      </div>
    </div>
  );
}

function CheckpointRow({ checkpoint }: { checkpoint: Checkpoint }) {
  const api = useEditor();
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    const ok = await confirmDialog({
      title: `Restore checkpoint ${checkpoint.number}?`,
      message: 'Every file goes back to how it was before these AI changes. A checkpoint of the current state is saved first, so this can be undone.',
      confirmLabel: 'Restore'
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await restoreVersion(api.projectId, checkpoint.id);
      if (!res.ok) throw new Error(res.error || 'Restore failed.');
      await api.reloadProject();
      window.dispatchEvent(new Event(VERSIONS_CHANGED));
      api.notify(`Restored checkpoint ${checkpoint.number}${keptAsideNote(res.keptAside)}`, 'success');
    } catch (err) {
      api.notify(`Couldn’t restore: ${errorText(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="agent-card">
      <Icon name="clock.arrow.circlepath" />
      <span className="grow">Checkpoint {checkpoint.number} · Before AI changes</span>
      <button className="btn small" disabled={busy} onClick={() => void restore()}>
        Restore
      </button>
    </div>
  );
}

export function Transcript({
  items,
  terminals = {},
  todos,
  onAnswer,
  plan,
  memory,
  agentName,
  onAllowHost
}: {
  /** a local agent's name, and what allows it a host it was refused */
  agentName?: string;
  onAllowHost?: (host: string) => Promise<void>;
  items: Item[];
  terminals?: Record<string, string>;
  todos: TodosState;
  onAnswer?: (request: AgentUserRequest, answer: unknown) => Promise<void>;
  /** the Spectrum agent's plan card's buttons */
  plan?: PlanActions;
  /** the project's memory, for the lines the Spectrum agent suggests */
  memory?: Memory;
}) {
  return (
    <>
      {items.map((item) =>
        item.type === 'user' ? (
          <div className="composer-msg user" key={item.key}>
            <div className="composer-bubble">{item.text}</div>
            <PictureStrip pictures={item.pictures} />
          </div>
        ) : item.type === 'assistant' ? (
          <div className="composer-msg assistant" key={item.key}>
            <Markdown>{item.text}</Markdown>
          </div>
        ) : item.type === 'thought' ? (
          <details className="agent-thought" key={item.key}>
            <summary>
              <Icon name="brain.head.profile" /> Thinking
            </summary>
            <Markdown>{item.text}</Markdown>
          </details>
        ) : item.type === 'tool' ? (
          <ToolCard key={item.key} call={item.call} terminals={terminals} />
        ) : item.type === 'todo' ? (
          <TodoCard key={item.key} todo={item.todo} todos={todos} />
        ) : item.type === 'request' ? (
          item.answered || !onAnswer ? (
            <div className="agent-note" key={item.key}>
              Answered: {item.request.params?.toolCall?.title || item.request.params?.message || 'the agent’s question'}
            </div>
          ) : (
            <AgentQuestion key={item.key} request={item.request} onAnswer={(answer) => onAnswer(item.request, answer)} />
          )
        ) : item.type === 'plan' ? (
          plan ? <PlanCard key={item.key} steps={item.steps} actions={plan} /> : null
        ) : item.type === 'instruction' ? (
          <MemoryCard key={item.key} text={item.text} memory={memory} />
        ) : item.type === 'network' ? (
          <NetworkCard key={item.key} host={item.host} allowed={item.allowed} agent={agentName} onAllow={onAllowHost} />
        ) : item.type === 'notice' ? (
          <div className={`agent-note ${item.error ? 'error' : ''}`} key={item.key} role={item.error ? 'alert' : undefined}>
            {item.text}
          </div>
        ) : (
          <CheckpointRow key={item.key} checkpoint={item.checkpoint} />
        )
      )}
    </>
  );
}

// ─── Plan ───

/** The agent's working plan, as last sent; its open steps can join the to-do list. */
export function PlanStrip({ entries, todos }: { entries: PlanEntry[]; todos: TodosState }) {
  const { notify } = useEditor();
  const [open, setOpen] = useState(true);
  if (!entries.length) return null;
  const done = entries.filter((e) => e.status === 'completed').length;
  const rest = entries.filter((e) => e.status !== 'completed' && !todos.mine?.some((t) => !t.done && t.text === e.content));
  const save = async () => {
    let added = 0;
    for (const entry of rest) if (await todos.add(entry.content.slice(0, 2000))) added += 1;
    if (added) notify(`Added ${plural(added, 'to-do')}`, 'success');
  };
  return (
    <div className="agent-plan">
      <div className="agent-plan-head">
        <button className="agent-plan-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon name="checklist" />
          <span>
            Plan · {done} of {entries.length} done
          </span>
          <Icon name="chevron.down" className="agent-plan-chevron" />
        </button>
        <span className="grow" />
        {rest.length > 0 && (
          <button className="btn small ghost" onClick={() => void save()}>
            Save open steps as to-dos
          </button>
        )}
      </div>
      {open && (
        <ol className="agent-plan-steps">
          {entries.map((e, i) => (
            <li key={i} className={e.status}>
              {e.status === 'completed' ? <Icon name="checkmark.circle.fill" /> : e.status === 'in_progress' ? <Icon name="ellipsis.circle" /> : <span className="agent-plan-dot" />}
              <span>{e.content}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Changes ───

/**
 * A file the agent changed, as both tabs' trays hold it; afterHash, a local agent's, tells one version of it from
 * another. current and currentHash, a local agent's in an isolated session: the project's file as it is now where the
 * user changed it since the agent started from it, and that file's hash either way.
 */
export type TrayChange = { path: string; kind: 'created' | 'modified' | 'deleted'; binary: boolean; original: string; proposed: string; size: number; afterHash?: string | null; current?: string; currentHash?: string | null };

/**
 * One file's change settled in part (reviewHunks' settle): content, when given, is written over the file, which was
 * `mine` when the user chose; original and proposed are what is left to review, the same once nothing is.
 */
export type TrayPart = { content?: string; original: string; proposed: string; mine: string };

const countOf = (c: TrayChange) => (c.binary ? { added: 0, removed: 0 } : countChanges(c.original, c.proposed));

function useCounts(changes: TrayChange[]) {
  return useMemo(() => {
    const each = new Map(changes.map((c) => [c.path, countOf(c)]));
    let added = 0;
    let removed = 0;
    for (const n of each.values()) {
      added += n.added;
      removed += n.removed;
    }
    return { each, total: { added, removed } };
  }, [changes]);
}

/** "3 files, +12 −4" above the composer; opens the review. */
export function ChangesTray({ changes, direct, onOpen }: { changes: TrayChange[]; direct?: boolean; onOpen(): void }) {
  const { total } = useCounts(changes);
  if (!changes.length) return null;
  return (
    <button className="agent-tray" onClick={onOpen} title={direct ? 'What the agent changed in your project' : 'Review the agent’s changes, one change at a time'}>
      <Icon name="plus.forwardslash.minus" />
      <span>
        {plural(changes.length, 'file')}
        {direct ? ' changed' : ','}
      </span>
      <DiffCount {...total} />
      <span className="grow" />
      <span className="agent-tray-open">{direct ? 'Show' : 'Review'}</span>
    </button>
  );
}

/**
 * The tray opened in the pane: the files in a narrow list, the chosen one's changes below, each with its own Apply,
 * Reject and Edit (HunkList), Apply and Reject per file and for all, and the PDF before and after. A change is shown
 * against the file as it is now, so the user's own edits since stay, and where they overlap the agent's both versions
 * are offered. onPart settles one file in part; without it the files can only be taken whole.
 */
export function ReviewView({
  changes,
  busy,
  direct,
  onApply,
  onReject,
  onPart,
  onClose,
  preview
}: {
  changes: TrayChange[];
  busy: boolean;
  /** already in the project: shown, not applied */
  direct?: boolean;
  onApply(list: TrayChange[]): Promise<void>;
  onReject(list: TrayChange[]): Promise<void>;
  onPart?(file: TrayChange, part: TrayPart): Promise<void>;
  onClose(): void;
  /** a local agent's copy as a PDF; without it the project is compiled with the changes laid over a copy */
  preview?: () => Promise<Pdf>;
}) {
  const api = useEditor();
  const [selected, setSelected] = useState('');
  const [showPdf, setShowPdf] = useState(false);
  const [working, setWorking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const keys: ReviewKeys = useRef(null);
  const waiting = busy || working;

  // the Spectrum agent's changes come without the file as it is now: the editor's text of each, read again as the open one changes
  const unread = direct ? [] : changes.filter((c) => c.currentHash === undefined && !c.binary && c.kind === 'modified');
  const [own, setOwn] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    Promise.all(unread.map(async (c) => [c.path, await api.ensureFileContent(c.path).catch(() => c.original)] as const)).then((list) => live && setOwn(Object.fromEntries(list)));
    return () => {
      live = false;
    };
  }, [changes, unread.some((c) => c.path === api.activePath) ? api.editorValue : '']);
  const mineOf = (c: TrayChange) => c.current ?? own[c.path] ?? c.original;

  const reviews = useMemo(() => new Map(changes.filter((c) => !c.binary).map((c) => [c.path, review(c.original, mineOf(c), c.proposed)])), [changes, own]);
  const moved = useMemo(() => renames(changes), [changes]);
  const { each, total } = useMemo(() => {
    const each = new Map(changes.map((c) => [c.path, hunkCount(reviews.get(c.path)?.hunks || [])]));
    const all = [...each.values()];
    return { each, total: { added: all.reduce((n, c) => n + c.added, 0), removed: all.reduce((n, c) => n + c.removed, 0) } };
  }, [reviews]);
  const file = changes.find((c) => c.path === selected) || changes[0];
  // what the preview was compiled from: a change applied or rejected, or another turn's draft, compiles it again
  const version = changes.map((c) => `${c.path}\0${c.afterHash ?? `${c.size}\0${c.proposed}`}\0${c.currentHash ?? mineOf(c).length}`).join('\n');
  // back to the conversation, with the focus in the message box rather than on a button that went
  const close = () => {
    const tab = ref.current?.closest('.agent-tab');
    onClose();
    requestAnimationFrame(() => tab?.querySelector<HTMLElement>('.composer-input')?.focus());
  };
  useEffect(() => {
    if (!changes.length) close();
    // a button that went with its change leaves the focus nowhere: the keys go on working
    else if (document.activeElement === document.body) ref.current?.focus({ preventScroll: true });
  }, [changes]);
  if (!file) return null;

  const run = async (work: () => Promise<unknown>) => {
    setWorking(true);
    try {
      await work();
    } finally {
      setWorking(false);
    }
  };
  /** One file's choice: the file whole where that is the same thing, else the text the choice comes to. */
  const choose = async (c: TrayChange, choice: Choice) => {
    const r = reviews.get(c.path);
    if (!r || !onPart) return;
    const mine = mineOf(c);
    const whole = !choice.reject?.length && !choice.lines?.size && (choice.apply?.length ?? 0) === r.hunks.length && (!r.eol || choice.eol === 'apply');
    // every change as the agent made it, to the file it started from: the proposal itself, byte for byte
    if (whole && mine === c.original) return onApply([c]);
    const part = settle(r, choice);
    if (part.content === undefined && part.original === part.proposed) return onReject([c]);
    // the file as written, at once: until it is read again the applied changes would show as the user's own
    if (c.currentHash === undefined && part.content !== undefined) setOwn((old) => ({ ...old, [c.path]: part.content! }));
    return onPart(c, { ...part, mine });
  };
  /** Files applied whole; where the user edited one since, its changes that don't overlap theirs, the rest left to choose. */
  const applyFiles = (list: TrayChange[]) =>
    run(async () => {
      const whole = list.filter((c) => !onPart || !reviews.get(c.path) || mineOf(c) === c.original);
      if (whole.length) await onApply(whole);
      let overlaps = 0;
      for (const c of list.filter((c) => !whole.includes(c))) {
        const r = reviews.get(c.path)!;
        const clean = r.hunks.filter((h) => !h.base);
        overlaps += r.hunks.length - clean.length;
        if (clean.length || r.eol) await choose(c, { apply: clean, ...(r.eol && { eol: 'apply' }) });
      }
      if (overlaps) api.notify(`${plural(overlaps, 'change')} overlap${overlaps === 1 ? 's' : ''} your own edits. Choose for each.`);
    });
  const step = (direction: 1 | -1) => {
    const next = changes[changes.indexOf(file) + direction];
    if (next) setSelected(next.path);
  };
  const pdfs = reviewPdfs(api, () => changes.flatMap((c) => (c.binary ? [] : [{ path: c.path, content: c.kind === 'deleted' ? null : target(reviews.get(c.path)!) }])));
  const r = reviews.get(file.path);
  const overlaps = r?.hunks.filter((h) => h.base).length || 0;

  return (
    <div className="agent-review" ref={ref} tabIndex={-1} onKeyDown={(e) => !showPdf && keys.current?.(e)}>
      <div className="agent-review-bar">
        <button className="icon-btn" title="Back to the conversation" aria-label="Back" onClick={close}>
          <Icon name="chevron.left" />
        </button>
        <span className="agent-review-title">
          {plural(changes.length, 'file')}
          {direct ? ' changed' : ','} <DiffCount {...total} />
        </span>
        <span className="grow" />
        {!direct && (
          <div className="segmented small" role="tablist" aria-label="What the review shows">
            <button role="tab" aria-selected={!showPdf} className={`segment ${showPdf ? '' : 'active'}`} onClick={() => setShowPdf(false)}>Source</button>
            <button role="tab" aria-selected={showPdf} className={`segment ${showPdf ? 'active' : ''}`} onClick={() => setShowPdf(true)}>PDF before and after</button>
          </div>
        )}
        {!direct && (
          <>
            <button className="btn small" disabled={waiting} onClick={() => void run(() => onReject(changes))}>Reject all</button>
            <button className="btn small primary" disabled={waiting} onClick={() => void applyFiles(changes)}>
              {waiting && <span className="spinner" />} Apply all
            </button>
          </>
        )}
      </div>
      {showPdf && !direct ? (
        <PdfCompare version={version} before={pdfs.before} after={preview || pdfs.after} />
      ) : (
        <>
          <div className="agent-review-files">
            {changes.map((c) => {
              const n = reviews.get(c.path)?.hunks.length;
              return (
                <button key={c.path} className={`review-file ${c.path === file.path ? 'active' : ''}`} onClick={() => setSelected(c.path)}>
                  <Icon name={c.kind === 'deleted' ? 'trash' : 'doc.text'} />
                  <span className="review-file-name" title={c.path}>{c.path}</span>
                  {moved.has(c.path) ? <span className="badge" title={`The text of ${moved.get(c.path)}, which the agent deleted`}>Moved</span> : c.kind !== 'modified' && <span className="badge">{c.kind === 'created' ? 'New' : 'Deleted'}</span>}
                  {!direct && !!n && n > 1 && <span className="review-file-n">{n} changes</span>}
                  <DiffCount {...each.get(c.path)!} />
                </button>
              );
            })}
          </div>
          <div className="review-diff">
            <div className="review-diff-bar">
              <span className="review-diff-path">{file.path}</span>
              {overlaps > 0 && <span className="badge warning" title="You changed some of the same lines while the agent worked. Choose for each: your lines, the agent’s, both, or your own edit.">{plural(overlaps, 'overlap')}</span>}
              <span className="grow" />
              {!direct && (
                <>
                  <button className="btn small" disabled={waiting} onClick={() => void run(() => onReject([file]))}>Reject</button>
                  <button className="btn small" disabled={waiting} onClick={() => void applyFiles([file])}>Apply</button>
                </>
              )}
            </div>
            {!r ? (
              <div className="agent-empty">
                Binary file · {(file.size / 1024).toFixed(1)} KB. Its bytes are kept as they are when applied.
              </div>
            ) : (
              <HunkList
                key={file.path}
                path={file.path}
                review={r}
                leftLabel={direct ? 'Before the agent' : 'Your file'}
                rightLabel="Agent’s version"
                busy={waiting}
                keys={keys}
                onChoice={direct || !onPart ? undefined : (choice) => void run(() => choose(file, choice))}
                onPast={step}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Composer ───

export type ContextKind = 'file' | 'selection' | 'log' | 'todos';
/** research: a research session's id, sent with the message; images: pictures to send with it (a page of the PDF) */
export type Draft = { text: string; skill?: string; research?: string; images?: Picture[]; n: number };

const CONTEXT_ICONS: Record<ContextKind, string> = { file: 'doc.text', selection: 'text.cursor', log: 'terminal', todos: 'checklist' };

/**
 * The workspace's message box: chips for what goes with the message (the open file, the selection, the log, the
 * to-dos), a / menu of the agent's commands and the project's skills, and the chosen skill as a chip.
 */
export function AgentComposer({
  busy,
  disabled = false,
  firstTurn,
  commands = [],
  skills,
  todoCount,
  draft,
  picker,
  placeholder,
  queues = false,
  extras,
  onSend
}: {
  /** while busy, a message is still taken (the tab queues it for the agent) and the send button stays on */
  queues?: boolean;
  busy: boolean;
  /** nothing to send to yet (no agent set up): the send button is off, without busy's spinner */
  disabled?: boolean;
  /** the to-dos go with a conversation's first message unless taken off */
  firstTurn: boolean;
  commands?: AgentCommand[];
  skills: Skill[];
  todoCount: number;
  /** text and skill put in from outside (a task button, a message that couldn't be sent) */
  draft: Draft | null;
  picker?: ReactNode;
  placeholder: string;
  /** more chips for the bar, after those for what goes with the message */
  extras?: ReactNode;
  onSend(text: string, opts: { skill?: string; research?: string; context: Record<ContextKind, boolean>; images?: Picture[] }): void;
}) {
  const api = useEditor();
  const [text, setText] = useState('');
  const [skill, setSkill] = useState<string | undefined>();
  const [research, setResearch] = useState<string | undefined>();
  const [chosen, setChosen] = useState<Partial<Record<ContextKind, boolean>>>({});
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // pictures pasted, dropped or chosen, which go with the message
  const [pictures, setPictures] = useState<Picture[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const addPictures = async (files: FileList | File[] | null | undefined) => {
    const room = MAX_PICTURES - pictures.length;
    const added = await picturesOf(files, Math.max(0, room));
    if (added.length) setPictures((old) => [...old, ...added].slice(0, MAX_PICTURES));
    else if (room <= 0) api.notify(`Up to ${MAX_PICTURES} pictures go with a message.`);
  };
  const hasImage = (list: DataTransferItemList | undefined) => Array.from(list || []).some((i) => i.kind === 'file' && i.type.startsWith('image/'));

  useEffect(() => {
    if (!draft) return;
    setText(draft.text);
    setPictures(draft.images ?? []);
    // a task's skill only while it's on for the project
    setSkill(draft.skill && skills.some((s) => s.id === draft.skill) ? draft.skill : undefined);
    setResearch(draft.research);
    inputRef.current?.focus();
  }, [draft?.n]);
  // a task that came as the workspace opened, before its skills were listed, picks its skill once they are
  useEffect(() => {
    if (draft?.skill && !skill && skills.some((s) => s.id === draft.skill)) setSkill(draft.skill);
  }, [skills]);

  // a triple click selects the line's break too
  const lines = api.selectionText ? api.selectionText.replace(/\n$/, '').split('\n').length : 0;
  const available: Record<ContextKind, string | null> = {
    file: api.activePath ? nameOf(api.activePath) : null,
    selection: lines ? `Selection, ${plural(lines, 'line')}` : null,
    log: api.compileLog ? 'Compile log' : null,
    todos: todoCount ? plural(todoCount, 'to-do') : null
  };
  const on = (k: ContextKind) => !!available[k] && (chosen[k] ?? (k === 'file' || k === 'selection' || (k === 'todos' && firstTurn)));

  // "/word" alone in the box lists what it could be
  const query = text === dismissed ? undefined : /^\/(\S*)$/.exec(text)?.[1]?.toLowerCase();
  const entries =
    query === undefined
      ? []
      : [
          ...commands.map((c) => ({ id: c.name, skill: false, hint: c.description })),
          ...skills.map((s) => ({ id: s.id, skill: true, hint: s.description }))
        ].filter((e) => e.id.toLowerCase().includes(query));
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;
  // the option chosen with the arrow keys stays in sight in the scrolling list
  useEffect(() => {
    if (entries.length) document.getElementById(optionId(Math.min(active, entries.length - 1)))?.scrollIntoView({ block: 'nearest' });
  }, [active, entries.length]);
  const pick = (entry: (typeof entries)[number]) => {
    if (entry.skill) {
      setSkill(entry.id);
      setText('');
    } else setText(`/${entry.id} `);
    setActive(0);
    inputRef.current?.focus();
  };

  const send = () => {
    let message = text.trim();
    let use = skill;
    // a skill typed out in full, "/paper-lookup find …", is the skill chip
    const typed = /^\/(\S+)\s*([\s\S]*)$/.exec(message);
    if (typed && !use && skills.some((s) => s.id === typed[1]) && !commands.some((c) => c.name === typed[1])) {
      use = typed[1];
      message = typed[2].trim();
    }
    if ((busy && !queues) || disabled || (!message && !use)) return;
    onSend(message, { skill: use, research, context: { file: on('file'), selection: on('selection'), log: on('log'), todos: on('todos') }, ...(pictures.length && { images: pictures }) });
    setText('');
    setSkill(undefined);
    setResearch(undefined);
    setPictures([]);
  };

  const skillName = skill && (skills.find((s) => s.id === skill)?.name || skill);
  return (
    <div
      className="agent-composer"
      onDragOver={(e) => {
        if (hasImage(e.dataTransfer.items)) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!hasImage(e.dataTransfer.items)) return;
        e.preventDefault();
        void addPictures(e.dataTransfer.files);
      }}
    >
      {picker}
      {entries.length > 0 && (
        <div className="agent-slash" role="listbox" id={listId} aria-label="Commands and skills">
          {entries.map((e, i) => (
            <button
              key={`${e.skill}-${e.id}`}
              id={optionId(i)}
              tabIndex={-1}
              role="option"
              aria-selected={i === active}
              className={`agent-slash-item ${i === active ? 'active' : ''}`}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => pick(e)}
            >
              <Icon name={e.skill ? 'book.pages' : 'command'} />
              <span className="agent-slash-id">/{e.id}</span>
              <span className="agent-slash-hint">{e.hint}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        className="composer-input"
        aria-label="Message the agent"
        aria-controls={entries.length ? listId : undefined}
        aria-expanded={entries.length > 0}
        aria-activedescendant={entries.length ? optionId(Math.min(active, entries.length - 1)) : undefined}
        rows={2}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onPaste={(e) => {
          // a picture pasted goes with the message; text pastes as ever
          if (!hasImage(e.clipboardData.items)) return;
          e.preventDefault();
          void addPictures(e.clipboardData.files);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (entries.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length);
          } else if (entries.length && (e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
            e.preventDefault();
            pick(entries[Math.min(active, entries.length - 1)]);
          } else if (entries.length && e.key === 'Escape') {
            e.preventDefault();
            setDismissed(text);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="agent-composer-bar">
        {skillName && (
          <span className="chip active" title="This skill’s instructions go with the message">
            <Icon name="book.pages" /> {skillName}
            <button className="chip-remove" aria-label={`Remove the ${skillName} skill`} onClick={() => setSkill(undefined)}>
              <Icon name="xmark" />
            </button>
          </span>
        )}
        {research && (
          <span className="chip active" title="The research session’s question, runs and results go with the message">
            <Icon name="books.vertical" /> Research session
            <button className="chip-remove" aria-label="Don’t send the research session" onClick={() => setResearch(undefined)}>
              <Icon name="xmark" />
            </button>
          </span>
        )}
        <PictureChips pictures={pictures} onRemove={(i) => setPictures((old) => old.filter((_, j) => j !== i))} />
        {(Object.keys(available) as ContextKind[]).map(
          (k) =>
            available[k] && (
              <button key={k} className={`chip ${on(k) ? 'active' : ''}`} aria-pressed={on(k)} title={on(k) ? 'Sent with the message' : 'Not sent'} onClick={() => setChosen({ ...chosen, [k]: !on(k) })}>
                <Icon name={CONTEXT_ICONS[k]} /> <span className="truncate">{available[k]}</span>
              </button>
            )
        )}
        {extras}
        <button className="chip" title="Add a picture for the agent to look at (or paste or drop one in the box)" aria-label="Add a picture" disabled={pictures.length >= MAX_PICTURES} onClick={() => fileRef.current?.click()}>
          <Icon name="photo" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            void addPictures(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="grow" />
        <button className="composer-send" title={busy && queues ? 'Queue for the agent (↵)' : 'Send (↵)'} aria-label={busy && queues ? 'Queue' : 'Send'} disabled={(busy && !queues) || disabled || (!text.trim() && !skill)} onClick={send}>
          {busy && !queues ? <span className="spinner" /> : <Icon name="arrow.up" />}
        </button>
      </div>
    </div>
  );
}
