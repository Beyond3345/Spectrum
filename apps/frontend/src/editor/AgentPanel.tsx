import { useEffect, useMemo, useRef, useState } from 'react';
import { listLocalAgents, configureLocalAgent, importLocalAgentLogin, listLocalAgentSessions, getLocalAgentSession, createLocalAgentSession, sendLocalAgentPrompt, stopLocalAgentSession, answerLocalAgent, setLocalAgentOption, getLocalAgentChanges, reviewLocalAgentChanges, recoverLocalAgentApply } from '../api/client';
import type { LocalAgent, LocalAgentSession, AgentEvent, AgentChange, AgentUserRequest } from '../api/client';
import Select from '../app/Select';
import Sheet from '../app/Sheet';
import Icon from '../app/Icon';
import SplitDiffView from './SplitDiffView';
import { useEditor } from './EditorContext';
import { Markdown, buildProjectContext, errorText } from './shared';

const running = (status?: string) => ['starting', 'running', 'stopping'].includes(status || '');

function AgentQuestion({ request, onAnswer }: { request: AgentUserRequest; onAnswer: (answer: unknown) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (answer: unknown) => { setBusy(true); setError(''); try { await onAnswer(answer); } catch (err) { setError(errorText(err)); setBusy(false); } };
  const params = request.params;
  const properties = params.requestedSchema?.properties || {};
  return <div className="agent-request">
    <strong>{request.kind === 'permission' ? params.toolCall?.title || 'Permission requested' : request.kind === 'plan' ? 'Review the agent’s plan' : params.message || 'The agent needs your input'}</strong>
    {params.toolCall?.rawInput && <details><summary>Details</summary><pre>{JSON.stringify(params.toolCall.rawInput, null, 2)}</pre></details>}
    {request.kind === 'plan' && <Markdown>{params.plan || params.content || params.title || 'Approve this plan to continue.'}</Markdown>}
    {request.kind === 'permission' ? <div className="row wrap">{(params.options || []).map((o: any) => <button className="btn small" disabled={busy} key={o.optionId} onClick={() => void send({ optionId: o.optionId })}>{o.name}</button>)}<button className="btn small" disabled={busy} onClick={() => void send({ cancelled: true })}>Cancel</button></div>
      : request.kind === 'plan' ? <div className="row"><button className="btn small" disabled={busy} onClick={() => void send({ approved: true })}>Approve</button><button className="btn small" disabled={busy} onClick={() => void send({ approved: false })}>Decline</button></div>
      : <>
        {params.mode === 'url' ? <p>Continue at <a href={/^https:\/\//i.test(params.url || '') ? params.url : undefined} target="_blank" rel="noreferrer">{params.url}</a>. Only proceed if you trust this agent and website.</p>
          : Object.entries(properties).length ? Object.entries(properties).map(([key, schema]: [string, any]) => <label className="field" key={key}>{schema.title || key}{schema.description && <span className="field-hint">{schema.description}</span>}{schema.type === 'boolean' ? <input type="checkbox" checked={values[key] === true} onChange={(e) => setValues({ ...values, [key]: e.target.checked })} /> : schema.enum ? <select value={String(values[key] ?? '')} onChange={(e) => setValues({ ...values, [key]: e.target.value })}><option value="">Choose…</option>{schema.enum.map((v: string) => <option key={v}>{v}</option>)}</select> : <input value={String(values[key] ?? '')} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />}</label>)
          : (params.questions || [{ id: 'answer', question: params.question || 'Your answer' }]).map((q: any, i: number) => <label className="field" key={q.id || i}>{q.question || q.text || q.header || 'Your answer'}<input value={String(values[q.id || String(i)] ?? '')} onChange={(e) => setValues({ ...values, [q.id || String(i)]: e.target.value })} /></label>)}
        <div className="row"><button className="btn small" disabled={busy} onClick={() => void send({ action: 'accept', content: values })}>{params.mode === 'url' ? 'I continued on the website' : 'Submit'}</button><button className="btn small" disabled={busy} onClick={() => void send({ action: 'decline' })}>Decline</button></div>
      </>}
    {error && <div className="field-hint error">{error}</div>}
  </div>;
}

export default function AgentPanel() {
  const api = useEditor();
  const [agents, setAgents] = useState<LocalAgent[]>([]);
  const [agentId, setAgentId] = useState('opencode');
  const [sessions, setSessions] = useState<LocalAgentSession[]>([]);
  const [session, setSession] = useState<LocalAgentSession | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [pending, setPending] = useState<AgentUserRequest[]>([]);
  const [changes, setChanges] = useState<AgentChange[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'review' | 'direct'>('review');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [setup, setSetup] = useState(false);
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('[]');
  const [runtimePaths, setRuntimePaths] = useState('');
  const [key, setKey] = useState('');
  const [keyEnv, setKeyEnv] = useState('');
  const [review, setReview] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const current = agents.find((a) => a.id === agentId);
  const busy = working || running(session?.status);
  const refreshAgents = () => listLocalAgents().then((r) => setAgents(r.agents));
  const refreshSessions = () => listLocalAgentSessions(api.projectId).then((r) => setSessions(r.sessions));
  const fail = (err: unknown) => setError(errorText(err));
  const chooseSession = async (id: string) => {
    if (!id) { setSession(null); setEvents([]); setPending([]); setChanges([]); localStorage.removeItem(`spectrum-agent:${api.projectId}`); return; }
    const r = await getLocalAgentSession(id);
    if (r.session.projectId !== api.projectId) throw new Error('This session belongs to another project.');
    setSession(r.session); setAgentId(r.session.agentId); setEvents(r.session.events); setPending(r.session.pending || []);
    setChanges((await getLocalAgentChanges(id)).changes);
    localStorage.setItem(`spectrum-agent:${api.projectId}`, id);
  };
  useEffect(() => {
    void refreshAgents().catch(fail); void refreshSessions().catch(fail);
    const id = localStorage.getItem(`spectrum-agent:${api.projectId}`);
    if (id) void chooseSession(id).catch(fail);
  }, [api.projectId]);
  useEffect(() => {
    if (!current) return;
    setCommand(current.command); setArgs(JSON.stringify(current.args)); setRuntimePaths(current.runtimePaths.join('\n')); setKey(''); setKeyEnv(current.keyEnv);
  }, [current?.id, current?.command, current?.keyEnv, JSON.stringify(current?.args), JSON.stringify(current?.runtimePaths)]);
  useEffect(() => {
    if (!session) return;
    const source = new EventSource(`/api/agent-sessions/${session.id}/events?after=${session.events[session.events.length - 1]?.id || 0}`);
    source.onmessage = (message) => {
      const e = JSON.parse(message.data) as AgentEvent;
      setEvents((old) => old.some((item) => item.id === e.id) ? old : [...old, e].slice(-1000));
      if (e.type === 'state') {
        setSession((old) => old ? { ...old, status: e.data.status } : old);
        if (!running(e.data.status)) { setPending([]); void refreshSessions().catch(fail); }
        if (e.data.error) setError(e.data.error);
      }
      if (e.type === 'request') setPending((old) => [...old.filter((p) => p.requestId !== e.data.requestId), e.data]);
      if (e.type === 'answered') setPending((old) => old.filter((p) => p.requestId !== e.data.requestId));
      if (e.type === 'changes') { setChanges(e.data.changes); if (session.mode === 'direct') void api.reloadProject().catch(fail); }
    };
    source.onerror = () => { /* EventSource retries with Last-Event-ID; completion is a protocol event. */ };
    return () => source.close();
  }, [session?.id]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [events.length, events[events.length - 1]?.id]);
  const messages = useMemo(() => {
    const out: { kind: string; text: string }[] = [];
    for (const e of events) {
      let kind = '', text = '';
      if (e.type === 'user') { kind = 'user'; text = e.data.text; }
      else if (e.type === 'update') {
        const u = e.data;
        if (u.sessionUpdate === 'agent_message_chunk') { kind = 'assistant'; text = u.content?.text || ''; }
        if (u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update') { kind = 'activity'; text = [u.title, u.status].filter(Boolean).join(' · '); }
        if (u.sessionUpdate === 'plan') { kind = 'activity'; text = (u.entries || []).map((p: any) => `${p.status === 'completed' ? '✓' : '•'} ${p.content}`).join('\n'); }
      } else if (e.type === 'notice') { kind = 'activity'; text = e.data.error || e.data.message || ''; }
      if (!text) continue;
      if (kind === 'assistant' && out[out.length - 1]?.kind === kind) out[out.length - 1].text += text;
      else out.push({ kind, text });
    }
    return out;
  }, [events]);
  const options = [...events].reverse().find((e) => e.type === 'session' && e.data.configOptions)?.data.configOptions || [];
  const send = async () => {
    if (!session || !input.trim() || busy) return;
    setError(''); setWorking(true);
    try {
      await api.prepareAgent();
      const context = await buildProjectContext(api);
      const prompt = [input.trim(), api.activePath && `Active file: ${api.activePath}`, api.selectionText && `Selected text:\n${api.selectionText}`, context].filter(Boolean).join('\n\n');
      await sendLocalAgentPrompt(session.id, prompt); setInput('');
    } catch (err) { fail(err); } finally { setWorking(false); }
  };
  const start = async () => {
    setError(''); setWorking(true);
    try {
      await api.prepareAgent();
      const r = await createLocalAgentSession(api.projectId, agentId, mode);
      await chooseSession(r.session.id); await refreshSessions();
    } catch (err) { fail(err); } finally { setWorking(false); }
  };
  const resolveChanges = async (action: 'apply' | 'reject', picked: AgentChange[]) => {
    if (!session) return;
    setWorking(true); setError('');
    try { await api.prepareAgent(); const r = await reviewLocalAgentChanges(session.id, action, picked); setChanges(r.changes); if (action === 'apply') await api.reloadProject(); if (!r.changes.length) setReview(false); }
    catch (err) { fail(err); const snapshot = await getLocalAgentSession(session.id).catch(() => null); if (snapshot) setSession(snapshot.session); throw err; } finally { setWorking(false); }
  };
  const file = changes.find((c) => c.path === selectedFile) || changes[0];
  return <div className="agent-panel">
    <div className="agent-toolbar">
      <span id="agent-pick-label" className="sr-only">Agent</span>
      <Select labelId="agent-pick-label" value={agentId} disabled={busy} options={agents.map((a) => [a.id, `${a.name}${a.experimental ? ' · Experimental' : ''}${a.unavailable ? (a.id === 'workbuddy' ? ' · Planned' : ' · Unavailable') : ''}`])} onChange={(id) => { setAgentId(id); void chooseSession('').catch(fail); setError(''); }} />
      <button className="btn small" onClick={() => setSetup((v) => !v)} disabled={busy}>Setup</button>
      <span className="grow" />
      {session && <button className="btn small" disabled={busy} onClick={() => void chooseSession('').catch(fail)}>New session</button>}
    </div>
    {setup && current && <div className="agent-setup">
      <p>{current.unavailable || current.note} <a href={current.url} target="_blank" rel="noreferrer">Setup guide</a></p>
      {!current.unavailable && <>
        <label className="field">Executable<input value={command} onChange={(e) => setCommand(e.target.value)} placeholder={current.command} /></label>
        <div className="field"><label id="agent-key-provider">Provider credential</label><Select labelId="agent-key-provider" value={keyEnv} options={current.keyEnvs.map((name) => [name, name.replace(/_(API_KEY|PERSONAL_ACCESS_TOKEN)$/, '').replace(/_/g, ' ')])} onChange={setKeyEnv} /></div>
        <label className="field">API key or access token<input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={current.hasKey && keyEnv === current.keyEnv ? 'Saved on this computer; leave blank to keep' : 'Optional if an imported login is available'} /></label>
        {current.hasKey && keyEnv !== current.keyEnv && <p className="field-hint">Saving a different provider clears the previous key. Enter the new provider’s key here.</p>}
        <details><summary>Advanced setup</summary><label className="field">Launcher arguments (JSON array)<input value={args} onChange={(e) => setArgs(e.target.value)} /></label><label className="field">Runtime folders, one per line<textarea rows={2} value={runtimePaths} onChange={(e) => setRuntimePaths(e.target.value)} /></label><p className="field-hint">Read access for this agent’s installed libraries. Choose specific runtime folders. Your home and live project are not granted.</p></details>
        <div className="row wrap"><button className="btn small" disabled={busy} onClick={async () => { setWorking(true); setError(''); try { await configureLocalAgent(agentId, { command, args: JSON.parse(args), runtimePaths: runtimePaths.split('\n').map((p) => p.trim()).filter(Boolean), keyEnv, ...(key && { apiKey: key }) }); setKey(''); await refreshAgents(); } catch (err) { fail(err); } finally { setWorking(false); } }}>Save setup</button>
          {current.canImport && <button className="btn small" disabled={busy} onClick={async () => { setWorking(true); setError(''); try { const r = await importLocalAgentLogin(agentId); api.notify(`Copied ${r.files} login/configuration files into this agent’s private state.`, 'success'); } catch (err) { fail(err); } finally { setWorking(false); } }}>Copy existing login</button>}
          {current.hasKey && <button className="btn small" disabled={busy} onClick={async () => { try { await configureLocalAgent(agentId, { command, args: JSON.parse(args), runtimePaths: current.runtimePaths, apiKey: '' }); await refreshAgents(); } catch (err) { fail(err); } }}>Remove saved key</button>}
        </div><p className="field-hint">Login copies and keys stay in Spectrum’s private data on this computer. Agent tools and commands remain isolated; existing external MCP services are not granted host access.</p>
      </>}
    </div>}
    {sessions.length > 0 && <div className="agent-toolbar"><span id="agent-session-label">Session</span><Select labelId="agent-session-label" value={session?.id || ''} disabled={busy} options={[[ '', 'New session' ], ...sessions.map((s): [string, string] => [s.id, `${agents.find((a) => a.id === s.agentId)?.name || s.agentId} · ${new Date(s.createdAt).toLocaleString()} · ${s.mode}`])]} onChange={(id) => void chooseSession(id).catch(fail)} /></div>}
    {!session && <div className="agent-start"><p>{current?.unavailable || 'Give an agent a project task. Review mode works in an isolated copy; you decide which changes enter your project.'}</p><div className="row"><span id="agent-edit-label">Editing</span><Select labelId="agent-edit-label" value={mode} options={[[ 'review', 'Review changes first' ], [ 'direct', 'Edit this project directly' ]]} onChange={(v) => setMode(v as typeof mode)} /><button className="btn primary small" disabled={busy || !current?.installed || !current?.supported} onClick={() => void start()}>Start session</button></div>{mode === 'direct' && <p className="field-hint">The agent can change your project immediately. A recoverable copy is saved before each task.</p>}{current && !current.installed && !current.unavailable && <p className="field-hint">Agent not found. Open Setup to install it or choose its executable.</p>}{current && !current.supported && !current.unavailable && <p className="field-hint">Native agent isolation is unavailable. Repair or reinstall Spectrum before starting an agent.</p>}</div>}
    {session && <>
      <div className="agent-transcript" ref={log} role="log" aria-live="polite">{messages.map((m, i) => <div className={`composer-msg ${m.kind}`} key={i}>{m.kind === 'activity' ? <div className="agent-activity">{m.text}</div> : m.kind === 'user' ? <div className="composer-bubble">{m.text}</div> : <Markdown>{m.text}</Markdown>}</div>)}{running(session.status) && <div className="agent-activity"><span className="spinner" /> {session.status === 'starting' ? 'Connecting to the agent…' : 'Agent working…'}</div>}</div>
      {pending.map((p) => <AgentQuestion key={p.requestId} request={p} onAnswer={async (answer) => { await answerLocalAgent(session.id, p.requestId, answer); }} />)}
      <div className="agent-toolbar"><span className="badge">{session.mode === 'review' ? 'Isolated review' : 'Direct editing'} · {session.status}</span>{changes.length > 0 && session.mode === 'review' && <button className="btn small" disabled={busy} onClick={() => setReview(true)}>Review {changes.length} file{changes.length === 1 ? '' : 's'}</button>}{changes.length > 0 && session.mode === 'direct' && <span className="field-hint">{changes.length} files changed in the project</span>}</div>
      <div className="agent-toolbar wrap">{options.map((o: any) => <Select key={o.id} title={o.description || o.name} value={o.currentValue} disabled={busy} options={(o.options || []).flatMap((v: any) => v.options || [v]).map((v: any) => [v.value, v.name])} onChange={(value) => void setLocalAgentOption(session.id, o.id, value).catch(fail)} />)}</div>
      <textarea className="composer-input" aria-label="Agent task" rows={2} value={input} placeholder="Describe what you want the agent to do…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
      <div className="agent-toolbar"><span className="field-hint">Uses your saved agent configuration</span><span className="grow" />{running(session.status) ? <button className="btn small" onClick={() => void stopLocalAgentSession(session.id).catch(fail)}>Stop</button> : <button className="btn primary small" disabled={busy || !input.trim() || (session.mode === 'review' && changes.length > 0)} onClick={() => void send()}>Send</button>}</div>
    </>}
    {error && <div className="agent-error" role="alert">{error}</div>}
    {session?.recoveries?.map((r) => <div className="agent-request" key={r.id}><p>A file application was interrupted. Recover its previous file contents without overwriting newer edits.</p><button className="btn small" disabled={busy} onClick={async () => { setWorking(true); try { await api.prepareAgent(); await recoverLocalAgentApply(session.id, r.id); await api.reloadProject(); await chooseSession(session.id); setError(''); } catch (err) { fail(err); } finally { setWorking(false); } }}>Recover {r.files.length} files</button></div>)}
    {review && file && <Sheet title={`Agent changes · ${changes.length} files`} width={1080} onClose={() => setReview(false)} actions={<><button className="btn" disabled={busy} onClick={() => void resolveChanges('reject', changes).catch(() => {})}>Reject all</button><button className="btn primary" disabled={busy} onClick={() => void resolveChanges('apply', changes).catch(() => {})}>Apply all</button></>}>
      <div className="review-layout"><div className="review-files">{changes.map((c) => <button className={`review-file ${c.path === file.path ? 'active' : ''}`} key={c.path} onClick={() => setSelectedFile(c.path)}><Icon name="doc.text" /><span className="review-file-name">{c.path}</span><span className="badge">{c.kind}</span></button>)}</div><div className="review-diff"><div className="review-diff-bar"><span>{file.path}</span><span className="grow" /><button className="btn small" disabled={busy} onClick={() => void resolveChanges('reject', [file]).catch(() => {})}>Reject</button><button className="btn small" disabled={busy} onClick={() => void resolveChanges('apply', [file]).catch(() => {})}>Apply</button></div>{file.binary ? <div className="agent-start">Binary file · {file.kind} · {(file.size / 1024).toFixed(1)} KB. Its bytes are preserved when applied.</div> : <SplitDiffView original={file.original || ''} proposed={file.proposed || ''} leftLabel="Before agent" rightLabel="Agent proposal" />}</div></div>
    </Sheet>}
  </div>;
}
