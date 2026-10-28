import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import os from 'node:os';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
// unstable: plan_update, plan_removed and the systemPrompt session capability, which the stable entry lacks
import { client, ndJsonStream } from '@agentclientprotocol/sdk/unstable';
import { APP_VERSION, DATA_DIR } from '../config/constants.js';
import { appPath, cachePath, detectMainFile, getProjectRoot, mutateProjectFiles, readMeta } from './projectService.js';
import { compileFolder, findExecutable, SUPPORTED_ENGINES } from './compileService.js';
import { builtInTectonic, builtInTypst } from './engineService.js';
import { readProjectSettings } from './projectSettings.js';
import { openTodos, suggestedTodo } from './agentService.js';
import { AGENT_DIR, profileFor, agentConfigs, agentHome } from './agentProfiles.js';
import { spawnAgentProcess, killAgentProcess, resolveExecutable, isolationAvailable } from './agentSandbox.js';
import { initialiseWorkspace, workspaceChanges, applyWorkspaceChanges, captureAgentProposal, readCurrent, rebaseChange, refreshDraft } from './agentWorkspace.js';
import { ITEM_ID, readItems } from '../routes/todos.js';
import { activeSkills, listSkills, loadSkill, SKILL_ID } from './skillService.js';
import { agentHidden, safeJoin } from '../utils/pathUtils.js';
import { writeJsonAtomic } from '../utils/fsUtils.js';

const execFileAsync = promisify(execFile);
const runs = new Map();
/** A direct session's turn is changing the project's own files now, which a GitHub pull waits for. */
export const directTurn = (projectId) => [...runs.values()].some((r) => r.projectId === projectId && r.mode === 'direct' && r.busy);
const ID = /^[a-f0-9-]{36}$/;
const textLimit = (value, max = 100000) => typeof value === 'string' ? value.slice(0, max) : '';
const metadata = (r) => ({ id: r.id, projectId: r.projectId, agentId: r.agentId, mode: r.mode, createdAt: r.createdAt, updatedAt: r.updatedAt, status: r.status, events: r.events, remoteId: r.remoteId, resolved: [...r.resolved], turnCount: r.turnCount, ...(r.title && { title: r.title }), ...(r.persona && { persona: r.persona }), ...(r.notes?.length && { notes: r.notes }) });
const persist = (r) => {
  r.saveChain = (r.saveChain || Promise.resolve()).catch(() => {}).then(() => writeJsonAtomic(path.join(r.dir, 'session.json'), metadata(r)));
  return r.saveChain;
};
// a direct-mode change the user has seen, until the agent changes that file again
const changeKey = (c) => `${c.path}\0${c.afterHash}`;
export const pendingChanges = async (r) => (await workspaceChanges(r)).filter((c) => !r.resolved.has(changeKey(c)));

const MAX_EVENTS = 1000;
const MAX_EVENT_BYTES = 2 * 1024 * 1024;
const CHUNKS = ['user_message_chunk', 'agent_message_chunk', 'agent_thought_chunk'];
// what session/load replays of the conversation, which the transcript already holds; its commands, modes and settings
// still count
const HISTORY = [...CHUNKS, 'tool_call', 'tool_call_update', 'plan', 'plan_update', 'plan_removed'];
const eventBytes = new WeakMap();
const sizeOf = (event) => eventBytes.get(event) ?? JSON.stringify(event).length;
/** The next piece of a message streamed into the last one, or the next update of the same tool call: one stored event. */
function joined(last, type, data) {
  if (type !== 'update' || last?.type !== 'update' || last.data?.sessionUpdate !== data?.sessionUpdate) return null;
  if (CHUNKS.includes(data.sessionUpdate)) {
    // a message past half the cap goes on in a stored event of its own, which the cap can shed in turn
    if (sizeOf(last) > MAX_EVENT_BYTES / 2) return null;
    if (last.data.content?.type !== 'text' || data.content?.type !== 'text' || (last.data.messageId ?? null) !== (data.messageId ?? null)) return null;
    return { ...last.data, content: { ...last.data.content, text: last.data.content.text + data.content.text } };
  }
  return data.sessionUpdate === 'tool_call_update' && last.data.toolCallId === data.toolCallId ? { ...last.data, ...data } : null;
}
// Listeners hear every piece as it comes. The store keeps one event per message, so a long turn keeps its start under
// the caps: it takes the latest piece's id and names its first in `first`, and a client replaying the store drops the
// pieces it already had, from first to id.
const emit = (r, type, data) => {
  r.updatedAt = new Date().toISOString();
  const event = { id: ++r.sequence, type, data, at: r.updatedAt };
  const last = r.events.at(-1);
  const whole = joined(last, type, data);
  if (whole) {
    const stored = { ...event, first: last.first ?? last.id, data: whole };
    // a piece adds only its text (as JSON, less the quotes); a tool call's update may replace what it had
    eventBytes.set(stored, CHUNKS.includes(data.sessionUpdate) ? sizeOf(last) + JSON.stringify(data.content.text).length - 2 : JSON.stringify(stored).length);
    r.eventBytes -= sizeOf(last);
    r.events[r.events.length - 1] = stored;
  } else r.events.push(event);
  r.eventBytes += sizeOf(r.events.at(-1));
  while (r.events.length > MAX_EVENTS || (r.events.length > 1 && r.eventBytes > MAX_EVENT_BYTES)) r.eventBytes -= sizeOf(r.events.shift());
  for (const listener of r.listeners) listener(event);
  return event;
};
/** A session's title: its first task's first line, as a chat's is. */
const firstLine = (text) => {
  const line = String(text || '').trim().split('\n')[0].trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
};
const state = (r, status, error) => { r.status = status; emit(r, 'state', { status, ...(error && { error }) }); void persist(r); };
const busyProject = (r) => [...runs.values()].some((other) => other !== r && other.projectId === r.projectId && (other.busy || other.reviewing));

// a session being loaded, so the history list and the session opened with it get the same one
const loading = new Map();
export async function getAgentRun(id) {
  if (!ID.test(id)) throw new Error('Invalid agent session id.');
  if (runs.has(id)) return runs.get(id);
  if (!loading.has(id)) loading.set(id, loadAgentRun(id).finally(() => loading.delete(id)));
  return loading.get(id);
}
async function loadAgentRun(id) {
  const dir = path.join(AGENT_DIR, 'runs', id);
  const data = JSON.parse(await fs.readFile(path.join(dir, 'session.json'), 'utf8'));
  profileFor(data.agentId);
  const root = await getProjectRoot(data.projectId);
  const r = { ...data, id, dir, root, workspace: data.mode === 'direct' ? root : path.join(dir, 'work'), home: await agentHome(data.agentId), resolved: new Set(data.resolved || []), events: data.events || [], sequence: data.events?.at(-1)?.id || 0, listeners: new Set(), pending: new Map(), terminals: new Map(), busy: false, turnCount: data.turnCount || 0, notes: data.notes || [] };
  r.eventBytes = r.events.reduce((total, e) => total + sizeOf(e), 0);
  // 1.10 kept a change it had seen by its path alone, and rebuilt the copy on the next prompt
  const legacy = [...r.resolved].filter((key) => !key.includes('\0'));
  if (legacy.length) {
    const changes = await workspaceChanges(r).catch(() => []);
    for (const rel of legacy) {
      r.resolved.delete(rel);
      const change = changes.find((c) => c.path === rel);
      // a review session's copy still holds what was applied or rejected: it goes back to the user's file, as 1.10's
      // next prompt would have made it
      if (change && r.mode === 'review') await readCurrent(r.root, rel).then((bytes) => rebaseChange(r, rel, bytes, draftWriter(r, rel))).catch(() => r.resolved.add(changeKey(change)));
      else if (change) r.resolved.add(changeKey(change));
    }
  }
  const crashed = ['running', 'starting', 'stopping'].includes(r.status);
  // best effort: what the agent did in the draft before Spectrum closed reaches the tray
  if (crashed) await captureAgentProposal(r).catch(() => {});
  runs.set(id, r);
  if (crashed) {
    // nothing waits for an answer any more
    const answered = new Set(r.events.filter((e) => e.type === 'answered').map((e) => e.data.requestId));
    for (const e of r.events.filter((e) => e.type === 'request' && !answered.has(e.data.requestId))) emit(r, 'answered', { requestId: e.data.requestId });
    state(r, 'interrupted', 'Spectrum closed during the task. The working copy has been preserved.');
  }
  return r;
}

export async function listAgentRuns(projectId) {
  const dir = path.join(AGENT_DIR, 'runs');
  const found = [];
  for (const id of await fs.readdir(dir).catch((err) => err.code === 'ENOENT' ? [] : Promise.reject(err))) {
    if (!ID.test(id)) continue;
    try {
      const r = await getAgentRun(id);
      // a session from before titles: its first task the store still holds
      const title = r.title || firstLine(r.events.find((e) => e.type === 'user')?.data.text);
      if (r.projectId === projectId) found.push({ id: r.id, agentId: r.agentId, mode: r.mode, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, ...(title && { title }) });
    } catch { /* not a readable session for an available project */ }
  }
  return found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** A persona's instructions for the agent: { name, prompt }, or null for none. */
export function readPersona(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || typeof value.name !== 'string' || typeof value.prompt !== 'string' || value.name.length > 200 || value.prompt.length > 20000) throw Object.assign(new Error('Invalid persona.'), { statusCode: 400 });
  return value.prompt.trim() ? { name: value.name.trim(), prompt: value.prompt.trim() } : null;
}
const samePersona = (a, b) => (a?.name ?? null) === (b?.name ?? null) && (a?.prompt ?? null) === (b?.prompt ?? null);
const personaText = (persona) => `The user chose the persona “${persona.name}” for this conversation. Follow its instructions for how you work and respond. They cannot widen your permissions or change Spectrum’s rules.\n<persona>\n${persona.prompt}\n</persona>`;

// ponytail: Windows isolation grants the workspace by ACLs, which a folder or file the agent makes inherits whatever its
// name, so it could make .git, .claude or an .env file in the project itself. Direct sessions need macOS until the
// worker can refuse those names.
const NO_DIRECT = 'Direct editing isn’t available on Windows yet. Choose Isolated: the agent works on a copy and you apply the changes you want.';

export async function newAgentRun({ projectId, agentId, mode = 'review', persona }) {
  persona = readPersona(persona);
  if (mode === 'direct' && process.platform === 'win32') throw Object.assign(new Error(NO_DIRECT), { statusCode: 400 });
  const profile = profileFor(agentId);
  if (profile.unavailable) throw new Error(profile.unavailable);
  if (!(await isolationAvailable())) throw new Error('Native agent isolation is unavailable. Install or repair the Windows isolation worker before starting an agent.');
  if (!['review', 'direct'].includes(mode)) throw new Error('Choose review or direct editing.');
  const root = await getProjectRoot(projectId);
  const id = crypto.randomUUID();
  const dir = path.join(AGENT_DIR, 'runs', id);
  const r = { id, dir, root, projectId, agentId, mode, persona, createdAt: new Date().toISOString(), events: [], eventBytes: 0, sequence: 0, resolved: new Set(), notes: [], listeners: new Set(), pending: new Map(), terminals: new Map(), busy: true, turnCount: 0 };
  if (busyProject(r)) throw new Error('Another agent is working on this project. Stop it before starting another.');
  runs.set(id, r);
  try {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    r.workspace = await initialiseWorkspace(root, dir, mode);
    r.home = await agentHome(agentId);
    state(r, 'starting');
    r.ready = connect(r).then(() => { r.busy = false; state(r, 'ready'); }).catch((err) => { r.busy = false; state(r, r.cancelled ? 'interrupted' : 'failed', [err.message, r.diagnostic].filter(Boolean).join('\n')); disconnect(r); throw err; });
    void r.ready.catch(() => {});
    return metadata(r);
  } catch (err) { runs.delete(id); throw err; }
}

function sessionPath(r, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('Agent file paths must be absolute.');
  const rel = path.relative(r.workspace, value);
  if (!rel || agentHidden(rel)) throw new Error('This path is not available to the agent.');
  return safeJoin(r.workspace, rel);
}

function requestUser(r, kind, params) {
  if (r.cancelled) return Promise.reject(new Error('Task cancelled.'));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    r.pending.set(requestId, { kind, params, resolve, reject });
    emit(r, 'request', { requestId, kind, params });
    void persist(r);
  });
}

export function answerAgentRequest(r, requestId, answer) {
  const pending = r.pending.get(requestId);
  if (!pending) throw new Error('That request is no longer waiting for an answer.');
  let response;
  if (pending.kind === 'permission') {
    if (answer?.cancelled) response = { outcome: { outcome: 'cancelled' } };
    else {
      const option = pending.params.options?.find((o) => o.optionId === answer?.optionId);
      if (!option) throw new Error('Choose one of the agent’s permission options.');
      response = { outcome: { outcome: 'selected', optionId: option.optionId } };
    }
  } else if (pending.kind === 'plan') response = { approved: answer?.approved === true };
  else if (pending.kind === 'cursor-question') response = { answers: answer?.content || {} };
  else {
    if (!['accept', 'decline', 'cancel'].includes(answer?.action)) throw new Error('Invalid answer.');
    response = { action: answer.action, ...(answer.action === 'accept' && { content: answer.content || {} }) };
  }
  r.pending.delete(requestId);
  emit(r, 'answered', { requestId });
  pending.resolve(response);
}

async function connect(r) {
  r.connectionAbort = new AbortController();
  // a direct session from 1.10 included
  if (r.mode === 'direct' && process.platform === 'win32') throw new Error(NO_DIRECT);
  const profile = profileFor(r.agentId);
  const config = (await agentConfigs())[r.agentId] || {};
  const credentialVariable = config.keyEnv || profile.key;
  r.processOptions = { command: config.command || profile.command, args: config.args || profile.args, workspace: r.workspace, home: r.home, runtimePaths: config.runtimePaths || [], forbiddenRoots: r.mode === 'review' ? [r.root] : [], env: { ...(config.apiKey && credentialVariable && { [credentialVariable]: config.apiKey }), ...(r.agentId === 'zcode' && { ZCODE_ACP_MODE: 'build' }) } };
  r.processOptions.runtimeExecutable = await resolveExecutable(r.processOptions.command);
  if (r.agentId === 'opencode') {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    r.processOptions.internalPort = port;
    r.processOptions.args = [...r.processOptions.args, '--port', String(port), '--hostname', '127.0.0.1'];
    r.processOptions.env.OPENCODE_SERVER_PASSWORD = crypto.randomBytes(32).toString('hex');
  }
  await syncAgentSkills(r).catch((err) => emit(r, 'notice', { message: `The project’s skills weren’t copied for the agent: ${err.message}` }));
  const tools = await toolsServer(r).catch((err) => { emit(r, 'notice', { message: `Spectrum’s tools aren’t available to the agent this turn: ${err.message}` }); return null; });
  if (tools) r.processOptions.runtimePaths = [...r.processOptions.runtimePaths, ...tools.reads];
  if (r.cancelled) throw new Error('Task cancelled.');
  r.connectionAbort.signal.throwIfAborted();
  r.child = await spawnAgentProcess(r.processOptions);
  if (r.cancelled || r.connectionAbort.signal.aborted) { killAgentProcess(r.child); throw new Error('Task cancelled.'); }
  let stderr = '';
  const redact = (text) => [config.apiKey, r.processOptions.env.OPENCODE_SERVER_PASSWORD].filter(Boolean).reduce((value, key) => value.replaceAll(key, '[hidden]'), text);
  r.child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); r.diagnostic = redact(stderr); });
  r.child.on('error', (err) => { if (!r.cancelled) state(r, 'failed', err.message); });
  const ownedChild = r.child;
  r.child.on('exit', (code, signal) => {
    if (r.child !== ownedChild) return;
    r.connection?.close();
    r.connectionAbort.abort(new Error(`Agent exited (${signal || code}).`));
    if (!r.cancelled && r.status !== 'closed') { state(r, 'failed', `Agent exited (${signal || code}). ${redact(stderr)}`); }
  });
  // while a session opens, its updates may come before its id does
  const checkSession = (params) => { if (r.remoteId && !r.opening && params.sessionId && params.sessionId !== r.remoteId) throw new Error('Unknown agent session.'); };
  const app = client({ name: 'spectrum', version: APP_VERSION })
    .onNotification('session/update', ({ params }) => { checkSession(params); if (!(r.replaying && HISTORY.includes(params.update?.sessionUpdate))) emit(r, 'update', params.update); })
    .onRequest('session/request_permission', ({ params }) => { checkSession(params); return requestUser(r, 'permission', params); })
    .onRequest('elicitation/create', ({ params }) => requestUser(r, 'question', params))
    .onNotification('elicitation/complete', ({ params }) => emit(r, 'notice', params))
    .onRequest('fs/read_text_file', async ({ params }) => {
      checkSession(params);
      const content = await agentFile(r, 'read', sessionPath(r, params.path));
      const start = Math.max(0, (params.line || 1) - 1);
      return { content: content.split('\n').slice(start, params.limit ? start + params.limit : undefined).join('\n') };
    })
    .onRequest('fs/write_text_file', async ({ params }) => {
      checkSession(params);
      if (Buffer.byteLength(params.content) > 50 * 1024 * 1024) throw new Error('File exceeds 50 MB.');
      await agentFile(r, 'write', sessionPath(r, params.path), params.content);
      return {};
    })
    .onRequest('terminal/create', async ({ params }) => {
      checkSession(params);
      const id = crypto.randomUUID();
      const cwd = !params.cwd || path.resolve(params.cwd) === path.resolve(r.workspace) ? r.workspace : sessionPath(r, params.cwd);
      const extra = Object.fromEntries((params.env || []).filter((e) => /^[A-Z_][A-Z0-9_]*$/.test(e.name) && !/^(HOME|PATH|TMPDIR|DYLD_|NODE_OPTIONS|XDG_)/.test(e.name)).map((e) => [e.name, e.value]));
      const child = await spawnAgentProcess({ ...r.processOptions, command: params.command, args: params.args || [], cwd, env: { ...r.processOptions.env, ...extra } });
      const terminal = { child, output: '', truncated: false, exitStatus: undefined };
      const output = (chunk) => { terminal.output += chunk.toString(); if (terminal.output.length > 64000) { terminal.output = terminal.output.slice(-64000); terminal.truncated = true; } };
      child.stdout.on('data', output); child.stderr.on('data', output);
      terminal.done = new Promise((resolve) => { child.once('exit', (exitCode, signal) => { terminal.exitStatus = { ...(exitCode !== null && { exitCode }), ...(signal && { signal }) }; resolve(terminal.exitStatus); }); child.once('error', (err) => { output(Buffer.from(err.message)); terminal.exitStatus = { exitCode: 1 }; resolve(terminal.exitStatus); }); });
      r.terminals.set(id, terminal);
      emit(r, 'terminal', { terminalId: id, command: params.command, args: params.args || [] });
      return { terminalId: id };
    });
  for (const method of ['terminal/output', 'terminal/wait_for_exit', 'terminal/kill', 'terminal/release']) app.onRequest(method, async ({ params }) => {
    checkSession(params);
    const t = r.terminals.get(params.terminalId);
    if (!t) throw new Error('Unknown terminal.');
    if (method === 'terminal/output') return { output: t.output, truncated: t.truncated, ...(t.exitStatus && { exitStatus: t.exitStatus }) };
    if (method === 'terminal/wait_for_exit') return await t.done;
    killAgentProcess(t.child);
    if (method === 'terminal/release') r.terminals.delete(params.terminalId);
    return {};
  });
  for (const method of ['cursor/ask_question', '_cursor/ask_question']) app.onRequest(method, (v) => v, ({ params }) => requestUser(r, 'cursor-question', params));
  for (const method of ['cursor/create_plan', '_cursor/create_plan']) app.onRequest(method, (v) => v, ({ params }) => requestUser(r, 'plan', params));
  r.connection = app.connect(ndJsonStream(Writable.toWeb(r.child.stdin), Readable.toWeb(r.child.stdout)));
  r.peer = r.connection.agent;
  const initial = await timeout(r.peer.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true, elicitation: { form: {}, url: {} } }, clientInfo: { name: 'spectrum', title: 'Spectrum', version: APP_VERSION } }), 30000, 'The agent did not initialize.', r.connectionAbort.signal);
  if (initial.protocolVersion !== 1) throw new Error('This agent does not support ACP v1.');
  r.capabilities = initial.agentCapabilities || {};
  emit(r, 'initialized', { agentInfo: initial.agentInfo, capabilities: r.capabilities, authMethods: initial.authMethods });
  if (r.agentId === 'cursor') await timeout(r.peer.request('authenticate', { methodId: 'cursor_login' }), 30000, 'Cursor authentication did not finish. Configure its API key in Setup.', r.connectionAbort.signal);
  let session;
  // a persona goes in the agent's own system prompt where it takes one, on every new, loaded or resumed session
  const systemPrompt = r.persona && r.capabilities.sessionCapabilities?.systemPrompt ? { mode: 'append', content: [{ type: 'text', text: personaText(r.persona) }] } : undefined;
  const spec = { cwd: r.workspace, mcpServers: tools ? [tools.server] : [], ...(systemPrompt && { systemPrompt }) };
  r.opening = true;
  let loaded = false;
  try {
    if (r.remoteId && !r.forceNew && (r.capabilities.loadSession || r.capabilities.sessionCapabilities?.resume)) {
      const method = r.capabilities.loadSession ? 'session/load' : 'session/resume';
      r.replaying = method === 'session/load';
      // one the agent no longer has (or can't load) goes on in a new session below
      try { session = await timeout(r.peer.request(method, { ...spec, sessionId: r.remoteId }), 30000, 'The session could not be loaded.', r.connectionAbort.signal); loaded = true; }
      catch (err) { if (r.cancelled || r.connectionAbort.signal.aborted) throw err; }
      finally { r.replaying = false; }
    }
    if (!loaded) {
      // a new session after one the agent can't load (or a changed persona) hears the conversation so far
      r.freshSession = !!r.remoteId;
      session = await timeout(r.peer.request('session/new', spec), 30000, 'The agent did not create a session.', r.connectionAbort.signal);
      r.openedNew = true;
      r.forceNew = false;
    }
  } catch (err) { throw new Error(`Agent setup failed: ${err.message}. Configure its API key or import a supported login in Agents.`); }
  finally { r.opening = false; }
  if (session.sessionId) r.remoteId = session.sessionId;
  if (!r.remoteId) throw new Error('The agent did not return a session id.');
  emit(r, 'session', { modes: session.modes, configOptions: session.configOptions });
}

async function timeout(promise, ms, message, signal) {
  let timer, abort;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
      abort = () => reject(signal.reason || new Error('The agent disconnected.'));
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    })]);
  } finally { clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
}

// What isolation needs to run Spectrum's own Node in the agent's grants, with none of the agent's settings or keys
const nodeRead = () => process.platform === 'win32' ? process.execPath : path.dirname(process.execPath);
const isolated = (r, args) => ({ command: process.execPath, args, workspace: r.workspace, home: r.home, runtimePaths: [nodeRead()], forbiddenRoots: r.mode === 'review' ? [r.root] : [] });

/** Writes rel's bytes (null: removes it) in the agent's copy, inside isolation. */
const draftWriter = (r, rel) => (bytes) => agentFile(r, bytes === null ? 'delete' : 'write', safeJoin(r.workspace, rel), bytes ?? '');

// Keep callbacks inside native isolation: an agent can swap a checked path while the host awaits I/O.
async function agentFile(r, operation, file, content = '') {
  const script = `const fs=require('node:fs'); const [op,file]=process.argv.slice(1);
    if(op==='read') { if(fs.statSync(file).size>1048576) throw Error('File exceeds 1 MB.'); const b=fs.readFileSync(file); if(b.length>1048576||b.includes(0)) throw Error('File is too large or is not text.'); process.stdout.write(JSON.stringify(b.toString('utf8'))); }
    else if(op==='delete') fs.rmSync(file,{force:true});
    else { const path=require('node:path'); const b=fs.readFileSync(0); if(b.length>52428800) throw Error('File exceeds 50 MB.'); fs.mkdirSync(path.dirname(file),{recursive:true}); const tmp=file+'.spectrum-agent-'+process.pid; try { fs.writeFileSync(tmp,b); fs.renameSync(tmp,file); } finally { fs.rmSync(tmp,{force:true}); } }`;
  const child = await spawnAgentProcess(isolated(r, ['-e', script, operation, file]));
  r.fileOperations ||= new Set(); r.fileOperations.add(child);
  let output = '', error = '';
  child.stdout.on('data', (chunk) => { output += chunk; if (output.length > 8 * 1024 * 1024) killAgentProcess(child); });
  child.stderr.on('data', (chunk) => { error = (error + chunk).slice(-4000); });
  const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(error || 'The isolated file operation failed.'))); });
  child.stdin.on('error', () => {}); child.stdin.end(content);
  try { await timeout(done, 10000, 'The isolated file operation timed out.'); return operation === 'read' ? JSON.parse(output) : ''; }
  catch (err) { emit(r, 'notice', { message: err.message }); throw err; }
  finally { r.fileOperations.delete(child); killAgentProcess(child); }
}

// The skills on in the project, copied into the agent's private home where agents look for them, each folder marked as
// Spectrum's so a skill the agent installed itself is never touched. It runs inside isolation, as the agent may have
// left a link anywhere in its home. While another project's session of the same agent runs, its skills stay: only
// missing ones are added. Names isolation keeps from agents (.git, .env files, keys) stay behind, as it wouldn't let
// them be written or read; a folder still held by a virus scanner on Windows is renamed again shortly. Windows has no
// Claude, so only .agents/skills there.
const SKILL_FOLDERS = process.platform === 'win32' ? ['.agents/skills'] : ['.agents/skills', '.claude/skills'];
const SKILL_MARK = '.spectrum-managed';
const copySkills = `const fs=require('node:fs'), path=require('node:path');
  const { skills, folders, mark, onlyAdd } = JSON.parse(fs.readFileSync(0, 'utf8'));
  const kept = (src) => !/^(\\.spectrum|\\.git|\\.claude|\\.env(\\..*)?)$|\\.(pem|key)$/i.test(path.basename(src));
  const rename = (from, to) => {
    for (let n = 0; ; n++) {
      try { return fs.renameSync(from, to); }
      catch (err) { if (n > 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 << n); }
    }
  };
  for (const folder of folders) {
    const dir = path.join(process.env.HOME, folder);
    fs.mkdirSync(dir, { recursive: true });
    const wanted = new Map(skills.map((s) => [s.id, s]));
    for (const name of fs.readdirSync(dir)) {
      const entry = path.join(dir, name);
      if (!fs.lstatSync(entry).isDirectory()) { wanted.delete(name); continue; }
      let stamp;
      try { stamp = fs.readFileSync(path.join(entry, mark), 'utf8'); } catch { wanted.delete(name); continue; }
      if (wanted.get(name)?.stamp === stamp || onlyAdd) { wanted.delete(name); continue; }
      fs.rmSync(entry, { recursive: true, force: true });
    }
    for (const s of wanted.values()) {
      const staged = path.join(dir, '.' + s.id + '-' + process.pid);
      fs.rmSync(staged, { recursive: true, force: true });
      fs.cpSync(s.dir, staged, { recursive: true, filter: kept });
      fs.writeFileSync(path.join(staged, mark), s.stamp);
      rename(staged, path.join(dir, s.id));
    }
  }`;
async function syncAgentSkills(r) {
  const skills = await activeSkills(r.root);
  const onlyAdd = [...runs.values()].some((other) => other !== r && other.agentId === r.agentId && other.projectId !== r.projectId && (other.busy || other.child));
  const stores = [...new Set(skills.map((s) => path.dirname(s.dir)))];
  // its workspace is the home's tmp: isolation keeps .claude from a workspace, and this writes .claude/skills
  const child = await spawnAgentProcess({ command: process.execPath, args: ['-e', copySkills], workspace: path.join(r.home, 'tmp'), home: r.home, runtimePaths: [nodeRead(), ...stores] });
  let error = '';
  child.stderr.on('data', (chunk) => { error = (error + chunk).slice(-4000); });
  child.stdout.resume();
  const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(error.trim().split('\n').at(-1) || 'Spectrum couldn’t copy the skills.'))); });
  child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({ skills, folders: SKILL_FOLDERS, mark: SKILL_MARK, onlyAdd }));
  try { await timeout(done, 30000, 'Copying the skills took too long.'); }
  finally { killAgentProcess(child); }
}

// Spectrum's tools server, which the agent starts inside its own isolation (macOS only: on Windows the isolation
// stalls a Node child's pipes, so agents there get none yet): the one bundled beside the desktop app's server, or the
// repository's source in development
const bundledTools = fileURLToPath(new URL('./mcp.mjs', import.meta.url));
const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const toolsState = (r) => path.join(r.home, 'spectrum-tools', r.id);
/** The tools server's file, and what isolation must also read to run it. */
async function toolsLaunch() {
  const packaged = await fs.stat(bundledTools).then((s) => s.isFile(), () => false);
  const entry = packaged ? bundledTools : path.join(repository, 'apps/backend/src/mcp/server.js');
  // Node, the server (in development the backend's source, its packages and the version in the root package.json) and
  // the user's own fonts, for a compile
  const reads = [nodeRead(), path.dirname(entry), ...(packaged ? [] : [path.join(repository, 'apps/backend'), path.join(repository, 'node_modules'), path.join(repository, 'package.json')]), path.join(os.homedir(), 'Library', 'Fonts')];
  // the engines Spectrum downloaded (pandoc, older Typst versions), and the built-in programs' own folders
  reads.push(path.join(DATA_DIR, 'engines'));
  for (const file of [builtInTectonic(), builtInTypst()]) {
    const dir = file && path.dirname(file);
    if (dir && !reads.some((read) => dir === read || dir.startsWith(read + path.sep))) reads.push(dir);
  }
  return { entry, reads: (await Promise.all(reads.map(async (p) => (await fs.stat(p).catch(() => null)) && p))).filter(Boolean) };
}
async function toolsServer(r) {
  if (process.platform !== 'darwin') return null;
  const { entry, reads } = await toolsLaunch();
  const state = toolsState(r);
  const meta = await readMeta(r.root).catch(() => ({}));
  // written by isolation, as the home is the agent's
  await agentFile(r, 'write', path.join(state, 'context.json'), JSON.stringify({
    mainFile: meta.mainFile || await detectMainFile(r.root).catch(() => null),
    engine: (await readProjectSettings(r.root)).compile?.engine || 'auto',
    todos: await openTodos(r.root)
  }));
  return {
    reads,
    // the engines' own paths and Spectrum's data folder, so a compile inside isolation finds the same programs
    server: { name: 'spectrum', command: process.execPath, args: [entry, '--root', r.workspace, '--state', state], env: [
      { name: 'HOME', value: r.home },
      { name: 'TMPDIR', value: path.join(r.home, 'tmp') },
      { name: 'PATH', value: process.env.PATH || '/usr/bin:/bin' },
      { name: 'SPECTRUM_DATA_DIR', value: DATA_DIR },
      ...[['SPECTRUM_TYPST', process.env.SPECTRUM_TYPST], ['SPECTRUM_TECTONIC', process.env.SPECTRUM_TECTONIC]].filter(([, value]) => value).map(([name, value]) => ({ name, value }))
    ] }
  };
}

/** The to-dos the agent suggested through the tools server this turn, taken from its home once the turn is over. */
async function takeSuggestions(r) {
  const file = path.join(toolsState(r), 'suggestions.jsonl');
  if (process.platform !== 'darwin' || !(await fs.lstat(file).catch(() => null))?.isFile()) return [];
  const text = await agentFile(r, 'read', file);
  await agentFile(r, 'delete', file);
  // ponytail: the first 50 a turn; a run's compiled PDFs stay in the agent's home until it is cleared
  return text.split('\n').slice(0, 50).flatMap((line) => { try { return [suggestedTodo(JSON.parse(line))]; } catch { return []; } });
}

// Whether TeX on Windows can be told to read only below the draft, by its --version: MiKTeX through AllowUnsafeInputFiles,
// TeX Live through openin_any only until 2026, which made that a no-op
export const confinableTeX = (version) => /MiKTeX/i.test(version) || Number(String(version).match(/TeX Live (\d{4})/)?.[1]) < 2026;
/**
 * What a Windows preview's TeX is told: read and write only below the draft and its build folder, and no shell escape,
 * not even the restricted kind. TeX Live reads the lower-case names, MiKTeX its [Core] settings by these names (which a
 * value set in its own configuration overrides, so previewDraft checks what MiKTeX makes of them).
 */
export const PREVIEW_TEX_ENV = { openin_any: 'p', openout_any: 'p', shell_escape: 'f', MIKTEX_CORE_ALLOWUNSAFEINPUTFILES: '0', MIKTEX_CORE_ALLOWUNSAFEOUTPUTFILES: '0', MIKTEX_CORE_SHELLCOMMANDMODE: 'Forbidden' };
const MIKTEX_EXPECTED = { AllowUnsafeInputFiles: /^(false|0)$/i, AllowUnsafeOutputFiles: /^(false|0)$/i, ShellCommandMode: /^forbidden$/i };

/** Whether MiKTeX, with PREVIEW_TEX_ENV, really limits a compile: none of its own settings put back what it takes away. */
async function mikTeXConfined() {
  const initexmf = await findExecutable('initexmf');
  if (!initexmf) return false;
  for (const [name, expected] of Object.entries(MIKTEX_EXPECTED)) {
    const { stdout } = await execFileAsync(initexmf, [`--show-config-value=[Core]${name}`], { timeout: 20000, windowsHide: true, env: { ...process.env, ...PREVIEW_TEX_ENV } }).catch(() => ({ stdout: '' }));
    if (!expected.test(stdout.trim())) return false;
  }
  return true;
}

// The document a preview compiles, and with what: the project's main file and engine unless the request names them
async function previewTarget(r, { mainFile, engine }) {
  const main = mainFile || (await readMeta(r.root).catch(() => ({}))).mainFile || await detectMainFile(r.workspace).catch(() => null);
  if (main) safeJoin(r.workspace, main);
  return { main, engine: engine || (await readProjectSettings(r.root)).compile?.engine || 'auto' };
}

/**
 * The agent's draft as a PDF: { ok, pdf (base64, or null), log }. It is compiled where it can read nothing but the draft
 * and TeX, into this computer's cache, never into the draft. On macOS inside isolation, the draft read-only; on Windows
 * with TeX told to read only below the draft's folder (MiKTeX's AllowUnsafeInputFiles, TeX Live's openin_any before
 * 2026) and run nothing, with none of the Perl and Lua helpers that ignore those limits (Biber, latexmk, the glossary
 * tools), and with no preview where TeX can't be told: Tectonic, TeX Live 2026 and later, and a MiKTeX whose own
 * settings win over the preview's.
 */
export async function previewDraft(r, options = {}) {
  if (r.mode !== 'review') throw Object.assign(new Error('A direct session works in the project itself. Compile the project to see it.'), { statusCode: 409 });
  if (r.busy || r.reviewing || busyProject(r)) throw Object.assign(new Error('Wait for the agent to finish before previewing its draft.'), { statusCode: 409 });
  if (options.engine != null && !SUPPORTED_ENGINES.includes(options.engine)) throw Object.assign(new Error('Unsupported engine.'), { statusCode: 400 });
  r.reviewing = true;
  try {
    // best effort, as before a turn: the user's edits and new files since reach the draft
    await refreshDraft(r, (rel) => draftWriter(r, rel)).catch(() => {});
    const { main, engine } = await previewTarget(r, options);
    if (!main) return { ok: false, pdf: null, log: 'The draft has no main document to compile.' };
    // a fresh folder for each, and a home kept between them for TeX's own caches
    const out = await cachePath(r.root, 'agent-preview', r.id);
    const home = await cachePath(r.root, 'agent-preview', 'home');
    await fs.rm(out, { recursive: true, force: true });
    await fs.mkdir(out, { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(home, 'tmp'), { recursive: true, mode: 0o700 });
    if (process.platform === 'win32') {
      // ponytail: Typst's own sandboxing on Windows is unexplored, and Markdown goes through pandoc on either engine
      if (/\.(typ|md|markdown)$/i.test(main)) return { ok: false, pdf: null, log: 'Preview PDF on Windows supports LaTeX drafts only for now.' };
      if (engine === 'tectonic') return { ok: false, pdf: null, log: 'Preview PDF needs TeX Live or MiKTeX on Windows.' };
      if (engine === 'latexmk') return { ok: false, pdf: null, log: 'Preview PDF on Windows doesn’t use latexmk, which runs outside the limits a preview sets. Choose Auto, pdfLaTeX, XeLaTeX or LuaLaTeX for the project, or review the changes as text.' };
      const tex = await findExecutable('pdflatex');
      const version = tex ? (await execFileAsync(tex, ['--version'], { timeout: 20000, windowsHide: true }).catch(() => ({ stdout: '' }))).stdout : '';
      if (!confinableTeX(version)) return { ok: false, pdf: null, log: 'Preview PDF on Windows needs MiKTeX, or TeX Live 2025 or earlier: later TeX Live can’t limit what a compile reads, so the draft isn’t compiled. Review its changes as text.' };
      if (/MiKTeX/i.test(version) && !(await mikTeXConfined())) return { ok: false, pdf: null, log: 'Spectrum couldn’t confirm that MiKTeX will limit what the compile reads, writes and runs (a setting in MiKTeX’s own configuration may take precedence), so the draft isn’t compiled. Review its changes as text.' };
      // ponytail: whether MiKTeX's bibtex keeps to the [Core] settings is for the Windows build machine's test to show
      const result = await compileFolder({ root: r.workspace, mainFile: main, engine, without: ['tectonic', 'latexmk'], untrusted: true, buildDir: out, env: PREVIEW_TEX_ENV });
      return { ok: result.ok && result.status === 0, pdf: result.pdf || null, log: result.log || result.error || '' };
    }
    const { entry, reads } = await toolsLaunch();
    const child = await spawnAgentProcess({ command: process.execPath, args: [entry, '--compile', '--root', r.workspace, '--state', out, '--main', main, '--engine', engine], workspace: out, home, cwd: out, runtimePaths: [...reads, r.workspace], forbiddenRoots: [r.root] });
    // stopped with the session's other processes
    r.fileOperations ||= new Set(); r.fileOperations.add(child);
    let output = '', error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error = (error + chunk).slice(-4000); });
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    child.stdin.end();
    try { await timeout(done, 10 * 60 * 1000, 'The preview took too long and was stopped.'); } finally { r.fileOperations.delete(child); killAgentProcess(child); }
    let result;
    try { result = JSON.parse(output); } catch { return { ok: false, pdf: null, log: error.trim() || 'The preview could not be compiled.' }; }
    const log = await fs.readFile(path.join(out, 'last.log'), 'utf8').catch(() => result.error || '');
    // written by isolation: only a file of its own, never a link it left
    const pdf = result.pdf && (await fs.lstat(result.pdf).catch(() => null))?.isFile() && path.dirname(result.pdf) === out ? (await fs.readFile(result.pdf)).toString('base64') : null;
    return { ok: !!result.ok, pdf, log };
  } finally { r.reviewing = false; }
}

const TEXT_URI = 'spectrum:';
/**
 * The editor's context for a prompt: activePath (the open file), selection, log (the last compile's), todos (the
 * project's open to-dos), research (a research session's id) and skill (a skill's id, whose instructions go in whole,
 * as the composer's /skill-id). Read and checked before the turn starts.
 */
export async function readContext(r, value) {
  if (value == null) return {};
  const bad = () => Object.assign(new Error('Invalid context.'), { statusCode: 400 });
  if (typeof value !== 'object' || Array.isArray(value)) throw bad();
  const { activePath, selection, log, todos, research, skill } = value;
  for (const [text, max] of [[activePath, 1024], [selection, 100000], [log, 200000]]) if (text != null && (typeof text !== 'string' || text.length > max)) throw bad();
  if ((todos != null && typeof todos !== 'boolean') || (research != null && !ITEM_ID.test(String(research))) || (skill != null && !SKILL_ID.test(String(skill)))) throw bad();
  const context = {};
  if (activePath) {
    sessionPath(r, path.join(r.workspace, activePath));
    context.activePath = activePath.split(path.sep).join('/');
  }
  if (selection?.trim()) context.selection = selection;
  if (log?.trim()) context.log = log;
  if (todos) {
    const open = (await readItems(r.root, 'todos')).filter((t) => !t.done);
    context.todos = open.map((t) => `- [ ] ${t.text}${t.link?.file ? ` (${t.link.file}:${t.link.line})` : t.link?.doc ? ` (${t.link.doc}, page ${t.link.page})` : t.link?.key ? ` (${t.link.key})` : ''}`).join('\n') || 'No open to-dos.';
  }
  if (research) {
    const text = await fs.readFile(appPath(r.root, 'research', `${research}.json`), 'utf8').catch(() => { throw Object.assign(new Error('That research session wasn’t found.'), { statusCode: 404 }); });
    context.research = { id: research, text: text.slice(0, 200000) };
  }
  if (skill) {
    const { body } = await loadSkill(skill);
    if (!(await listSkills(r.root)).some((s) => s.id === skill && s.active)) throw Object.assign(new Error('That skill is off for this project.'), { statusCode: 403 });
    context.skill = { id: skill, text: body };
  }
  return context;
}

// The context as ACP resources: the agent reads the open file from its own copy through a link, and the rest comes
// embedded, or as plain text for an agent that can't take embedded resources
function contextBlocks(r, context) {
  const fileUri = context.activePath && pathToFileURL(path.join(r.workspace, context.activePath)).href;
  const blocks = fileUri ? [{ type: 'resource_link', uri: fileUri, name: context.activePath }] : [];
  const parts = [
    context.selection && { uri: fileUri ? `${fileUri}#selection` : `${TEXT_URI}selection`, label: `Selected text${context.activePath ? ` in ${context.activePath}` : ''}`, mimeType: 'text/plain', text: context.selection },
    context.log && { uri: `${TEXT_URI}compile-log`, label: 'The last compile log', mimeType: 'text/plain', text: context.log },
    context.todos && { uri: `${TEXT_URI}todos`, label: 'The project’s open to-dos', mimeType: 'text/markdown', text: context.todos },
    context.research && { uri: `${TEXT_URI}research/${context.research.id}`, label: 'The research session', mimeType: 'application/json', text: context.research.text },
    context.skill && { uri: `${TEXT_URI}skills/${context.skill.id}/SKILL.md`, label: `The skill “${context.skill.id}” to follow for this task`, mimeType: 'text/markdown', text: context.skill.text }
  ].filter(Boolean);
  for (const { label, ...resource } of parts) {
    blocks.push(r.capabilities?.promptCapabilities?.embeddedContext ? { type: 'resource', resource } : { type: 'text', text: `${label}:\n${resource.text}` });
  }
  return blocks;
}

/** options: context (readContext's) and persona; a persona other than the session's starts a new agent session. */
export async function promptAgent(r, prompt, { context = {}, persona } = {}) {
  prompt = textLimit(prompt);
  if (!prompt.trim()) throw new Error('Enter a task for the agent.');
  if (persona !== undefined) persona = readPersona(persona);
  if (r.busy || r.reviewing || busyProject(r)) throw new Error('An agent is already working on this project.');
  r.busy = true; r.cancelled = false;
  if (persona !== undefined && !samePersona(persona, r.persona)) {
    r.persona = persona;
    r.forceNew = true;
  }
  state(r, 'running');
  let outcome;
  const task = (async () => {
    // kept from the start, should Spectrum close, Stop be pressed or the agent fail to start
    const asked = emit(r, 'user', { text: prompt, ...(Object.keys(context).length && { context: Object.keys(context) }) });
    r.title ||= firstLine(prompt);
    void persist(r);
    try {
      // a first connect that failed was disconnected, so the agent starts again below as it is now set up
      if (r.ready) await r.ready.catch(() => {});
      // a direct session's changes are already the user's: each turn is measured from the project as it then is, with
      // a checkpoint before it, the first too (the user may have worked on since the session began, or since a first
      // turn that failed). A review session goes on from its draft.
      if (r.mode === 'direct') {
        await fs.rm(path.join(r.dir, 'baseline'), { recursive: true, force: true });
        await fs.rm(path.join(r.dir, 'proposal'), { recursive: true, force: true });
        await fs.rm(path.join(r.dir, 'proposal.json'), { force: true });
        r.workspace = await initialiseWorkspace(r.root, r.dir, r.mode);
        r.resolved.clear();
      } else if (r.mode === 'review') {
        // best effort: a link left in the draft is told of when the turn's changes are taken
        await refreshDraft(r, (rel) => draftWriter(r, rel)).catch((err) => emit(r, 'notice', { message: `The agent’s copy wasn’t brought up to date with your project: ${err.message}` }));
      }
      if (r.cancelled) throw new Error('Task cancelled.');
      if (r.forceNew) disconnect(r);
      if (!r.connection || r.connection.signal.aborted) await connect(r);
      if (r.cancelled) throw new Error('Task cancelled.');
      const earlier = r.freshSession && r.events.filter((e) => e.id < asked.id && (e.type === 'user' || (e.type === 'update' && e.data.sessionUpdate === 'agent_message_chunk'))).map((e) => e.data.text || e.data.content?.text || '').join('\n').slice(-12000);
      const intro = r.openedNew && 'You are working in Spectrum. All file and terminal operations are confined to your workspace and private runtime state. Use relative paths. Do not attempt to access the original project or other host services.';
      const persona = r.openedNew && r.persona && !r.capabilities.sessionCapabilities?.systemPrompt && personaText(r.persona);
      const notes = r.notes.length && `Since your last turn:\n${r.notes.map((note) => `- ${note}`).join('\n')}`;
      const handoff = earlier && `Previous conversation (a new agent session was required):\n${earlier}`;
      const text = [persona, intro, notes, handoff, prompt].filter(Boolean).join('\n\n');
      const result = await timeout(r.peer.request('session/prompt', { sessionId: r.remoteId, prompt: [{ type: 'text', text }, ...contextBlocks(r, context)] }), 30 * 60 * 1000, 'The agent task exceeded 30 minutes.', r.connectionAbort.signal);
      // told once the prompt is through: a failed one, or a session whose first prompt never landed, tells them again
      r.notes = [];
      r.openedNew = r.freshSession = false;
      r.turnCount++;
      emit(r, 'complete', result);
      outcome = [r.cancelled || result.stopReason === 'cancelled' || ['max_tokens', 'max_turn_requests'].includes(result.stopReason) ? 'interrupted' : result.stopReason === 'end_turn' ? 'completed' : 'failed', result.stopReason === 'refusal' ? 'The agent refused this task.' : undefined];
    } catch (err) { outcome = r.cancelled ? ['interrupted', 'Stopped.'] : ['failed', err.message]; disconnect(r); }
    finally {
      for (const [id, pending] of r.pending) { pending.reject(new Error('The task ended.')); emit(r, 'answered', { requestId: id }); }
      r.pending.clear();
      disconnect(r);
      // the event names the changes, whose texts the client asks for, so the stored events keep the transcript under
      // their cap however large the files
      try { await r.stopChain; await captureAgentProposal(r); emit(r, 'changes', { changes: (await pendingChanges(r)).map(({ original, proposed, ...c }) => c) }); }
      catch (err) {
        emit(r, 'notice', { error: err.message });
        // the user can't reach the draft to put it right, so the agent hears of it
        if (r.mode === 'review') r.notes.push(`Spectrum couldn’t take your changes for review: ${err.message} Put that right so the user can review your work.`);
      }
      for (const todo of await takeSuggestions(r).catch(() => [])) emit(r, 'todo', todo);
      // the turn's end is told once its changes are in and the next prompt can be taken
      r.busy = false;
      state(r, ...outcome);
      await persist(r);
    }
  })();
  r.task = task;
  return { ok: true };
}

function disconnect(r) {
  r.connectionAbort?.abort(new Error('The agent disconnected.'));
  r.connection?.close();
  r.connection = null;
  const child = r.child;
  r.child = null;
  const children = [child, ...[...r.terminals.values()].map((t) => t.child), ...r.fileOperations || []].filter(Boolean);
  const closed = children.map((owned) => {
    if (!owned.pid || owned.exitCode !== null || owned.signalCode !== null) return Promise.resolve();
    const done = new Promise((resolve) => owned.once('close', resolve));
    killAgentProcess(owned);
    return timeout(done, 10000, 'The isolated process tree did not stop. No proposal was captured.');
  });
  r.stopChain = Promise.all([r.stopChain, ...closed]);
  void r.stopChain.catch(() => {});
  r.terminals.clear();
  r.fileOperations?.clear();
}
export async function stopAgentRun(r) {
  r.cancelled = true;
  for (const [id, pending] of r.pending) { pending.reject(new Error('Task cancelled.')); emit(r, 'answered', { requestId: id }); }
  r.pending.clear();
  if (r.peer && r.remoteId) void r.peer.notify('session/cancel', { sessionId: r.remoteId }).catch(() => {});
  disconnect(r);
  await r.stopChain;
  if (r.task) {
    const finished = await timeout(r.task.then(() => true), 10000, 'The agent is still stopping.').catch(() => false);
    if (!finished) { state(r, 'stopping'); await persist(r); return; }
  }
  r.busy = false;
  state(r, 'interrupted');
  await persist(r);
}
export async function setAgentOption(r, configId, value) {
  if (r.busy || r.reviewing || busyProject(r)) throw new Error('Wait for the task to finish before changing its settings.');
  r.busy = true; r.cancelled = false;
  try {
    if (r.ready) await r.ready.catch(() => {});
    if (!r.connection || r.connection.signal.aborted) await connect(r);
    const result = await timeout(configId === '__mode'
      ? r.peer.request('session/set_mode', { sessionId: r.remoteId, modeId: value })
      : r.peer.request('session/set_config_option', { sessionId: r.remoteId, configId, value }), 30000, 'The agent did not change its settings.', r.connectionAbort.signal);
    emit(r, 'session', result); return result;
  } finally { r.busy = false; }
}
/**
 * Apply or reject changes, by path. Review mode: an applied file's new contents become its baseline, and a rejected one
 * goes back to the user's file in the agent's copy too; the agent hears of both on its next turn. Direct mode's changes
 * are already in the project, so either only puts them away.
 */
export async function reviewAgentChanges(r, body) {
  if (r.busy || r.reviewing || busyProject(r)) throw new Error('Wait for the agent to finish before reviewing changes.');
  if (!['apply', 'reject'].includes(body.action)) throw new Error('Choose apply or reject.');
  r.reviewing = true;
  try {
    const changes = await pendingChanges(r);
    if (!Array.isArray(body.paths) || !body.paths.length || body.paths.some((rel) => !changes.some((c) => c.path === rel))) throw new Error('Unknown change path.');
    const draft = (rel) => draftWriter(r, rel);
    if (r.mode !== 'review') {
      if (body.action === 'apply') throw new Error('Finish the review run before applying changes.');
      for (const rel of body.paths) r.resolved.add(changeKey(changes.find((c) => c.path === rel)));
    } else if (body.action === 'apply') {
      for (const { path: rel, bytes, merged } of await mutateProjectFiles(() => applyWorkspaceChanges(r, body.paths, body.expected))) {
        await rebaseChange(r, rel, bytes, draft(rel));
        if (merged) r.notes.push(`“${rel}” was applied with the user’s own edits to it merged in. Re-read it before changing it again.`);
      }
    } else {
      // every file read before any is reset; the agent hears of those that were, even if a later one fails
      const reset = [];
      try {
        await mutateProjectFiles(async () => {
          const live = [];
          for (const rel of body.paths) live.push([rel, await readCurrent(r.root, rel)]);
          for (const [rel, bytes] of live) {
            await rebaseChange(r, rel, bytes, draft(rel));
            reset.push(rel);
          }
        });
      } finally {
        if (reset.length) {
          const many = reset.length > 1;
          r.notes.push(`The user rejected your changes to ${reset.map((rel) => `“${rel}”`).join(', ')}. ${many ? 'They were' : 'It was'} reset to the user’s version. Re-read ${many ? 'them' : 'it'} before changing ${many ? 'them' : 'it'} again.`);
          emit(r, 'reset', { paths: reset });
        }
      }
    }
    await persist(r);
    return pendingChanges(r);
  } finally { r.reviewing = false; }
}
export function runSnapshot(r) { return { ...metadata(r), pending: [...r.pending].map(([requestId, p]) => ({ requestId, kind: p.kind, params: p.params })) }; }
export function subscribeAgent(r, fn) { r.listeners.add(fn); return () => r.listeners.delete(fn); }
/**
 * Stops the sessions with something running (a turn, a preview, an agent starting or never prompted), leaving the rest
 * as they were: a finished session's agent, still connected by a model or mode change, is only closed.
 */
export async function shutdownAgents() {
  await Promise.allSettled([...runs.values()].filter((r) => r.busy || r.child || r.fileOperations?.size).map((r) => (r.busy || r.fileOperations?.size || r.status === 'ready' ? stopAgentRun(r) : (disconnect(r), r.stopChain))));
}
