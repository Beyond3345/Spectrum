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
import { appPath, cachePath, detectMainFile, getProjectRoot, mutateProjectRoot, readMeta } from './projectService.js';
import { compileFolder, findExecutable, SUPPORTED_ENGINES } from './compileService.js';
import { builtInTectonic, builtInTypst } from './engineService.js';
import { readProjectSettings } from './projectSettings.js';
import { checkedImages, openTodos, suggestedTodo } from './agentService.js';
import { AGENT_DIR, profileFor, agentHome, agentEntry, launchOptions, recordTest, installing, installAdapter, removeAdapter, allowAgentHost } from './agentProfiles.js';
import { spawnAgentProcess, killAgentProcess, isolationAvailable } from './agentSandbox.js';
import { proxyNote } from './agentNetwork.js';
import { initialiseWorkspace, workspaceChanges, workspaceFiles, applyWorkspaceChanges, captureAgentProposal, fileHash, readCurrent, rebaseChange, refreshDraft } from './agentWorkspace.js';
import { ITEM_ID, readItems } from '../routes/todos.js';
import { activeSkills, listSkills, loadSkill, SKILL_ID } from './skillService.js';
import { agentHidden, agentHiddenNameSource, safeJoin } from '../utils/pathUtils.js';
import { skillText, untrusted } from '../utils/outsideText.js';
import { writeFileAtomic, writeJsonAtomic } from '../utils/fsUtils.js';

const execFileAsync = promisify(execFile);
const runs = new Map();
/** A direct session's turn is changing the project's own files now, which a GitHub pull waits for. */
export const directTurn = (projectId) => [...runs.values()].some((r) => r.projectId === projectId && r.mode === 'direct' && r.busy);
const ID = /^[a-f0-9-]{36}$/;
const textLimit = (value, max = 100000) => typeof value === 'string' ? value.slice(0, max) : '';
const metadata = (r) => ({ id: r.id, projectId: r.projectId, agentId: r.agentId, mode: r.mode, createdAt: r.createdAt, updatedAt: r.updatedAt, status: r.status, events: r.events, remoteId: r.remoteId, resolved: [...r.resolved], turnCount: r.turnCount, ...(r.title && { title: r.title }), ...(r.persona && { persona: r.persona }), ...(r.compile && { compile: r.compile }), ...(r.notes?.length && { notes: r.notes }), ...(r.withheld?.length && { withheld: r.withheld }) });
const persist = (r) => {
  r.saveChain = (r.saveChain || Promise.resolve()).catch(() => {}).then(() => writeJsonAtomic(path.join(r.dir, 'session.json'), metadata(r)));
  return r.saveChain;
};
// a direct-mode change the user has seen, until the agent changes that file again
const changeKey = (c) => `${c.path}\0${c.afterHash}`;
/** The error an adapter flagged in a session/update, as a line, or '': codex-acp's _meta.codex.error. */
const adapterError = (u) => {
  const error = u?.sessionUpdate === 'session_info_update' && u._meta?.codex?.error;
  return typeof error?.message === 'string' ? `${error.message}${error.additionalDetails ? ` (${error.additionalDetails})` : ''}`.slice(0, 600) : '';
};
/**
 * The changes still to review. In a review session each text change comes with the hash of the project's file as it is
 * now (currentHash) and, where the user has changed that file since the agent started from it, its text (current, null:
 * deleted), so the review shows the agent's change against the user's file and a part of it can be applied to it.
 */
export const pendingChanges = async (r) => Promise.all((await workspaceChanges(r)).filter((c) => !r.resolved.has(changeKey(c))).map(async (c) => {
  if (r.mode !== 'review' || c.binary) return c;
  const bytes = await readCurrent(r.root, c.path).catch(() => undefined);
  if (bytes === undefined) return c;
  const text = bytes === null ? null : bytes.toString('utf8');
  // no longer text: left to applying the file whole, which says so
  if (bytes && (bytes.includes(0) || !Buffer.from(text).equals(bytes))) return c;
  return { ...c, currentHash: fileHash(bytes), ...(fileHash(bytes) !== c.beforeHash && { current: text }) };
}));

const MAX_EVENTS = 1000;
const MAX_EVENT_BYTES = 4 * 1024 * 1024;
// one stored message or output keeps its first and last CLIP characters, and says how many were left out between
const CLIP = 100 * 1024;
const CHUNKS = ['user_message_chunk', 'agent_message_chunk', 'agent_thought_chunk'];
// what session/load replays of the conversation, which the transcript already holds; its commands, modes and settings
// still count
const HISTORY = [...CHUNKS, 'tool_call', 'tool_call_update', 'plan', 'plan_update', 'plan_removed'];
// what a full store sheds first, oldest first: the detail of tool calls, thoughts and terminals, never the conversation
const detail = (e) => e.type === 'terminal' || (e.type === 'update' && ['tool_call', 'tool_call_update', 'agent_thought_chunk'].includes(e.data?.sessionUpdate));
const eventBytes = new WeakMap();
const sizeOf = (event) => {
  let size = eventBytes.get(event);
  if (size === undefined) eventBytes.set(event, size = JSON.stringify(event).length);
  return size;
};
const leftOut = (n) => `\n\n[… ${n.toLocaleString('en-AU')} characters left out …]\n\n`;
/**
 * text with more after it, its middle left out once it passes 2 × CLIP: { text, cut }. cut: how many characters text
 * already leaves out, when it is a head, the line saying so and a tail.
 */
export function clipText(text, more = '', cut = 0) {
  if (!cut && text.length + more.length <= 2 * CLIP) return { text: text + more, cut };
  const tail = (cut ? text.slice(-CLIP) : text.slice(CLIP)) + more;
  const dropped = tail.length - CLIP;
  return { text: text.slice(0, CLIP) + leftOut(cut + dropped) + tail.slice(dropped), cut: cut + dropped };
}
const clipAll = (value) => typeof value === 'string' ? clipText(value).text : Array.isArray(value) ? value.map(clipAll) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clipAll(v)])) : value;
/** The next piece of a message streamed into the last one, or the next update of the same tool call: one stored event. */
function joined(last, type, data) {
  if (type !== 'update' || last?.type !== 'update' || last.data?.sessionUpdate !== data?.sessionUpdate) return null;
  if (CHUNKS.includes(data.sessionUpdate)) {
    if (last.data.content?.type !== 'text' || data.content?.type !== 'text' || (last.data.messageId ?? null) !== (data.messageId ?? null)) return null;
    const { text, cut } = clipText(last.data.content.text, data.content.text, last.cut);
    return { data: { ...last.data, content: { ...last.data.content, text } }, cut };
  }
  return data.sessionUpdate === 'tool_call_update' && last.data.toolCallId === data.toolCallId ? { data: { ...last.data, ...data } } : null;
}
/** As the store keeps event: a message or anything else past 2 × CLIP keeps the head and tail of each long text. */
function clipped(event) {
  if (sizeOf(event) <= 2 * CLIP) return event;
  const { data } = event;
  if (!(CHUNKS.includes(data?.sessionUpdate) && data.content?.type === 'text')) return { ...event, data: clipAll(data) };
  const { text, cut } = clipText(data.content.text);
  return { ...event, data: { ...data, content: { ...data.content, text } }, ...(cut && { cut }) };
}
// Listeners hear every piece as it comes. The store keeps one event per message, so a long turn keeps its start under
// the caps: it takes the latest piece's id and names its first in `first`, and a client replaying the store drops the
// pieces it already had, from first to id. A message past 2 × CLIP is kept as its head and tail (A-20), so one output
// never pushes the conversation before it out of the store.
const emit = (r, type, data) => {
  r.updatedAt = new Date().toISOString();
  const event = { id: ++r.sequence, type, data, at: r.updatedAt };
  const last = r.events.at(-1);
  const whole = joined(last, type, data);
  if (whole) {
    const piece = CHUNKS.includes(data.sessionUpdate);
    // a message's text is clipped as it is joined
    const stored = { ...event, first: last.first ?? last.id, data: whole.data, ...(whole.cut && { cut: whole.cut }) };
    const kept = piece ? stored : clipped(stored);
    // a piece adds only its text (as JSON, less the quotes) less what was left out; a tool call's update may replace
    // what it had
    const text = (e) => e.data.content.text.length;
    eventBytes.set(kept, piece ? sizeOf(last) + JSON.stringify(data.content.text).length - 2 - (text(last) + data.content.text.length - text(stored)) : JSON.stringify(kept).length);
    r.eventBytes -= sizeOf(last);
    r.events[r.events.length - 1] = kept;
  } else r.events.push(clipped(event));
  r.eventBytes += sizeOf(r.events.at(-1));
  while (r.events.length > MAX_EVENTS || (r.events.length > 1 && r.eventBytes > MAX_EVENT_BYTES)) {
    // ponytail: past the detail, the oldest event goes, conversation and all; 4 MB is some 20 clipped floods
    const at = Math.max(0, r.events.findIndex(detail));
    r.eventBytes -= sizeOf(r.events.splice(at, 1)[0]);
  }
  for (const listener of r.listeners) listener(event);
  return event;
};
/** A session's title: its first task's first line, as a chat's is. */
const firstLine = (text) => {
  const line = String(text || '').trim().split('\n')[0].trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
};
/**
 * Once each time it changes, which instruction files (agentInstructions.js) the user has not allowed (r.withheld). An
 * Isolated session's agent hears they are left out of its copy, so it doesn't write one that would never be offered;
 * the user sees them on the Local agents tab's card. A direct session cannot leave them out: its transcript says the
 * agent can read them in the project.
 */
function tellWithheld(r) {
  const now = r.withheld || [];
  const was = r.toldWithheld || [];
  if (String(now) === String(was)) return;
  r.toldWithheld = now;
  const list = (rels) => rels.map((rel) => `“${rel}”`).join(', ');
  if (r.mode === 'direct') {
    if (now.length) emit(r, 'notice', { message: `This session works in your project’s folder, so the agent can read ${list(now)}, which you haven’t allowed. An Isolated session leaves ${now.length > 1 ? 'them' : 'it'} out.` });
    return;
  }
  const back = was.filter((rel) => !now.includes(rel));
  if (now.some((rel) => !was.includes(rel))) r.notes.push(`${list(now)} ${now.length > 1 ? 'are' : 'is'} left out of your copy until the user allows ${now.length > 1 ? 'them' : 'it'}. Do not write a file by ${now.length > 1 ? 'those names' : 'that name'}: it would not be offered for review.`);
  if (back.length) r.notes.push(`${list(back)} ${back.length > 1 ? 'are' : 'is'} no longer left out of your copy.`);
}
const state = (r, status, error) => { r.status = status; emit(r, 'state', { status, ...(error && { error }) }); void persist(r); };
const busyProject = (r) => [...runs.values()].some((other) => other !== r && other.projectId === r.projectId && (other.busy || other.reviewing));
/** A session of the project has a turn, a preview or a review under way (Move to this computer and Locate… wait). */
export const agentAtWork = (projectId) => [...runs.values()].some((r) => r.projectId === projectId && (r.busy || r.reviewing));

const MOVED = 'This project moved to another folder. Start a new session to go on.';
/**
 * The project's folder is root now (Move to this computer, Locate…). A review session takes its draft, previews and
 * Apply from there, and its agent starts again for the next turn, so its isolation names the new folder, going on with
 * the same conversation where the agent can load one. A direct session works in the old folder itself, so it refuses
 * its next turn.
 */
export function rehomeAgentRuns(projectId, root) {
  for (const r of runs.values()) {
    if (r.projectId !== projectId || r.root === root) continue;
    r.root = root;
    if (r.mode === 'direct') r.moved = true;
    disconnect(r);
  }
}

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
  const r = { ...data, id, dir, root, toldWithheld: data.withheld || [], workspace: data.mode === 'direct' ? root : path.join(dir, 'work'), home: await agentHome(data.agentId), resolved: new Set(data.resolved || []), events: data.events || [], sequence: data.events?.at(-1)?.id || 0, listeners: new Set(), pending: new Map(), terminals: new Map(), busy: false, turnCount: data.turnCount || 0, notes: data.notes || [] };
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

/**
 * The app's default Typst version and Markdown PDF engine, as the editor sends them with a new session, for the agent's
 * compiles of a project that chooses neither; anything else left out.
 */
export const appCompile = (value) => ({
  ...(/^\d+\.\d+\.\d+$/.test(value?.typstVersion ?? '') && { typstVersion: value.typstVersion }),
  ...(['latex', 'typst'].includes(value?.markdownEngine) && { markdownEngine: value.markdownEngine })
});

/** What an agent's compile and its draft's preview use: the project's compile settings, else the app's defaults. */
export async function compileChoices(r) {
  const own = (await readProjectSettings(r.root)).compile || {};
  return { engine: own.engine || 'auto', typstVersion: own.typstVersion || r.compile?.typstVersion, markdownEngine: own.markdownEngine || r.compile?.markdownEngine };
}

export async function newAgentRun({ projectId, agentId, mode = 'review', persona, compile }) {
  persona = readPersona(persona);
  if (mode === 'direct' && process.platform === 'win32') throw Object.assign(new Error(NO_DIRECT), { statusCode: 400 });
  const profile = profileFor(agentId);
  if (profile.unavailable) throw new Error(profile.unavailable);
  if (!(await isolationAvailable())) throw new Error('Native agent isolation is unavailable. Install or repair the Windows isolation worker before starting an agent.');
  if (!['review', 'direct'].includes(mode)) throw new Error('Choose review or direct editing.');
  const root = await getProjectRoot(projectId);
  const id = crypto.randomUUID();
  const dir = path.join(AGENT_DIR, 'runs', id);
  const r = { id, dir, root, projectId, agentId, mode, persona, compile: appCompile(compile), createdAt: new Date().toISOString(), events: [], eventBytes: 0, sequence: 0, resolved: new Set(), notes: [], listeners: new Set(), pending: new Map(), terminals: new Map(), busy: true, turnCount: 0 };
  if (busyProject(r)) throw new Error('Another agent is working on this project. Stop it before starting another.');
  runs.set(id, r);
  try {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    ({ workspace: r.workspace, withheld: r.withheld } = await initialiseWorkspace(root, dir, mode));
    tellWithheld(r);
    r.home = await agentHome(agentId);
    state(r, 'starting');
    r.ready = connect(r).then(() => { r.busy = false; state(r, 'ready'); idle(r); }).catch((err) => { r.busy = false; state(r, r.cancelled ? 'interrupted' : 'failed', [err.message, r.diagnostic].filter(Boolean).join('\n')); disconnect(r); throw err; });
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

/** A host off the agent's list was asked for: said once a session, until the user allows it. */
function refusedHost(r, host) {
  r.refused ||= new Set();
  // ponytail: 20 hosts a session are shown; an agent asking for more is refused them unseen, so it cannot bury the conversation in cards
  if (r.refused.has(host) || r.refused.size >= 20 || r.status === 'closed') return;
  r.refused.add(host);
  emit(r, 'network', { host });
  void persist(r);
}
/** The user allows the session's agent a host it was refused: for that agent, in every session, from its next try. */
export async function allowSessionHost(r, value) {
  const host = await allowAgentHost(r.agentId, value);
  r.refused?.delete(host);
  emit(r, 'network', { host, allowed: true });
  r.notes.push(`The user now allows you to reach ${host}. If you needed it, try again.`);
  void persist(r);
  return host;
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
  // an old session can't start an agent its card calls unavailable
  if (profile.unavailable) throw new Error(profile.unavailable);
  // they share the private home: a turn waits for that agent's Test, which is short
  await tests.get(r.agentId)?.catch(() => {});
  if (installing.has(r.agentId)) throw new Error(`${profile.name}’s adapter is being changed. Try again when it finishes.`);
  r.processOptions = await launchOptions(r.agentId, { workspace: r.workspace, home: r.home, forbiddenRoots: r.mode === 'review' ? [r.root] : [] });
  r.limits = limitsOf(r.processOptions, await skillsKey(r));
  // the port its own server may use is never opened silently: told once a session
  if (r.processOptions.loopback && !r.toldLoopback) {
    r.toldLoopback = true;
    emit(r, 'notice', { message: `${profile.name}’s own ${profile.loopback} may use a port on this computer (Settings › Agents › Network).` });
  }
  // an agent held to its list: a host off it is shown in the session, where the user can allow it
  if (r.processOptions.hosts) r.processOptions.onRefused = (host) => refusedHost(r, host);
  await syncAgentSkills(r).catch((err) => emit(r, 'notice', { message: `The project’s skills weren’t copied for the agent: ${err.message}` }));
  const tools = await toolsServer(r).catch((err) => { emit(r, 'notice', { message: `Spectrum’s tools aren’t available to the agent this turn: ${err.message}` }); return null; });
  if (tools) r.processOptions.runtimePaths = [...r.processOptions.runtimePaths, ...tools.reads];
  if (r.cancelled) throw new Error('Task cancelled.');
  r.connectionAbort.signal.throwIfAborted();
  r.child = await spawnAgentProcess(r.processOptions);
  if (r.cancelled || r.connectionAbort.signal.aborted) { killAgentProcess(r.child); throw new Error('Task cancelled.'); }
  // the tools server starts with the environment Spectrum names, so it is told of the agent's gate here
  if (tools && r.child.gateEnv) tools.server.env.push(...Object.entries(r.child.gateEnv).map(([name, value]) => ({ name, value })));
  // how Codex may find a proxy, which a run that cannot reach chatgpt.com is compared by
  if (r.agentId === 'codex') emit(r, 'notice', { message: proxyNote(profile.name, { ...r.child.gateEnv, ...r.processOptions.env }, await proxySettings(), process.env, r.processOptions.proxy) });
  let stderr = '';
  const redact = (text) => hide(text, r.processOptions.secrets);
  r.child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); r.diagnostic = redact(stderr); });
  r.child.on('error', (err) => { if (!r.cancelled) state(r, 'failed', err.message); });
  const ownedChild = r.child;
  r.child.on('exit', (code, signal) => {
    if (r.child !== ownedChild) return;
    r.connection?.close();
    r.connectionAbort.abort(new Error(`Agent exited (${signal || code}).`));
    // one kept between turns that stopped: the next turn starts it again
    if (r.kept && !r.busy) return disconnect(r);
    if (!r.cancelled && r.status !== 'closed') { state(r, 'failed', `Agent exited (${signal || code}). ${redact(stderr)}`); }
  });
  // while a session opens, its updates may come before its id does
  const checkSession = (params) => { if (r.remoteId && !r.opening && params.sessionId && params.sessionId !== r.remoteId) throw new Error('Unknown agent session.'); };
  const app = client({ name: 'spectrum', version: APP_VERSION })
    .onNotification('session/update', ({ params }) => {
      checkSession(params);
      const u = params.update;
      if (r.replaying && HISTORY.includes(u?.sessionUpdate)) return;
      // what the agent's context holds now, for a later display: { context: { used, size, cost? } }
      if (u?.sessionUpdate === 'usage_update') emit(r, 'usage', { context: { used: u.used, size: u.size, ...(u.cost && { cost: u.cost }) } });
      else emit(r, 'update', u);
    })
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
  const initial = await timeout(r.peer.request('initialize', { protocolVersion: 1, clientCapabilities: clientCapabilities(r.processOptions.air), clientInfo: { name: 'spectrum', title: 'Spectrum', version: APP_VERSION } }), 30000, 'The agent did not initialize.', r.connectionAbort.signal);
  if (initial.protocolVersion !== 1) throw new Error('This agent does not support ACP v1.');
  r.capabilities = initial.agentCapabilities || {};
  r.agentVersion = initial.agentInfo?.version ? String(initial.agentInfo.version) : undefined;
  emit(r, 'initialized', { agentInfo: initial.agentInfo, capabilities: r.capabilities, authMethods: initial.authMethods });
  let session;
  // a persona goes in the agent's own system prompt where it takes one, on every new, loaded or resumed session
  const systemPrompt = r.persona && r.capabilities.sessionCapabilities?.systemPrompt ? { mode: 'append', content: [{ type: 'text', text: personaText(r.persona) }] } : undefined;
  const spec = { cwd: r.workspace, mcpServers: tools ? [tools.server] : [], ...(systemPrompt && { systemPrompt }) };
  r.opening = true;
  let loaded = false;
  try {
    if (r.processOptions.authMethod) await timeout(r.peer.request('authenticate', { methodId: r.processOptions.authMethod }), 30000, `${profileFor(r.agentId).name} authentication did not finish. Configure its API key in Setup.`, r.connectionAbort.signal);
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
  } catch (err) {
    // the agent asked for authentication: its card says Sign-in needed
    if (err.code === -32000) throw new Error(await signInNeeded(r));
    throw new Error(`Agent setup failed: ${err.message}. Configure its API key or import a supported login in Agents.`);
  }
  finally { r.opening = false; }
  if (session.sessionId) r.remoteId = session.sessionId;
  if (!r.remoteId) throw new Error('The agent did not return a session id.');
  await recordTest(r.agentId, { ok: true, code: 'ready', program: r.processOptions.program, ...(initial.agentInfo?.version && { version: String(initial.agentInfo.version) }) }, { setup: r.processOptions.setup, fromSession: true }).catch(() => {});
  emit(r, 'session', { modes: session.modes, configOptions: session.configOptions });
}

/**
 * What Spectrum tells the agent it can do: files, terminals and forms, and to one that takes them (profile.air), the
 * capabilities of JetBrains' AIR extension, of which Spectrum reads only a failed turn's sessionFailure.
 */
const clientCapabilities = (air) => ({ fs: { readTextFile: true, writeTextFile: true }, terminal: true, elicitation: { form: {}, url: {} }, ...(air?.length && { _meta: { jetbrains: { air: { version: 1, capabilities: air } } } }) });

// codex-acp's words for a ChatGPT login that chatgpt.com no longer takes (its ACCOUNT_READ_AUTH_FAILURE_MESSAGES)
const LOGIN_REFUSED = ['workspace routing discovery unauthorized (401)', 'selected workspace missing from routing discovery', 'workspace routing requires a ChatGPT account id'];

/**
 * ACP's "authentication required" (-32000), as a session opens or a task starts, or a failure that says the copied
 * login was refused. An agent that signed in with a key or a copied login (processOptions.signIn) had it refused, and
 * its card says which, with the way to replace it; otherwise the agent has no key or login inside isolation, which its
 * own words don't say how to give. Its card says Sign-in needed; the line says where to give one.
 */
async function signInNeeded(r) {
  const refused = r.processOptions.signIn;
  await recordTest(r.agentId, { ok: false, code: 'sign-in', ...(refused && { refused }), program: r.processOptions.program, ...(r.agentVersion && { version: r.agentVersion }) }, { setup: r.processOptions.setup, fromSession: true }).catch(() => {});
  const p = profileFor(r.agentId);
  const key = p.keys.some((k) => /TOKEN/.test(k)) && !p.keys.some((k) => /API_KEY/.test(k)) ? 'personal access token' : 'API key';
  if (refused === 'key') return `${p.name} refused the saved ${key}. Replace it in Settings › Agents.`;
  if (refused === 'login') return `${p.name} refused the copied login: it may have expired or been signed out. Sign in again${p.signIn ? ` with ${p.signIn}` : ''}, then copy the login again in Settings › Agents.`;
  const how = p.keys.length && p.login.length ? `Add its ${key}, or copy its login,` : p.keys.length ? `Add its ${key}` : 'Copy its login';
  return `${p.name} needs a sign-in. ${how} in Settings › Agents.`;
}

/** This Mac's proxy settings as `scutil --proxy` gives them, read outside isolation and never sent anywhere; undefined elsewhere or when unread. */
const proxySettings = () => process.platform !== 'darwin' ? Promise.resolve(undefined)
  : execFileAsync((process.env.NODE_ENV !== 'production' && process.env.SPECTRUM_SCUTIL) || '/usr/sbin/scutil', ['--proxy'], { timeout: 3000 }).then(({ stdout }) => stdout, () => undefined);

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

const hide = (text, secrets = []) => secrets.reduce((value, key) => value.replaceAll(key, '[hidden]'), text);

// Tests now, by agent; they run one at a time across all agents
const tests = new Map();
let testQueue = Promise.resolve();
/** Refuses while the agent is at work; one idle between turns stops, and the promise is its stopping. */
const inUse = (id) => {
  if (tests.has(id) || installing.has(id) || [...runs.values()].some((r) => r.agentId === id && r.busy)) throw Object.assign(new Error(`${profileFor(id).name} is in use. Try again when it finishes.`), { statusCode: 409 });
  const idle = [...runs.values()].filter((r) => r.agentId === id && r.child);
  for (const r of idle) disconnect(r);
  return Promise.all(idle.map((r) => r.stopChain)).catch(() => {});
};

/**
 * Starts the agent exactly as a session would, inside isolation, in an empty folder of its private home, and asks for
 * a session without sending a prompt, so no model is called. Stores what happened for the program found now: ready,
 * sign-in, error, timeout, exited or not-acp. Resolves to the agent's listing.
 */
export function testAgent(id, { limit = 30000 } = {}) {
  const profile = profileFor(id);
  if (profile.unavailable) throw Object.assign(new Error(profile.unavailable), { statusCode: 400 });
  const quiet = inUse(id);
  const run = testQueue.then(() => quiet).then(() => runTest(profile, limit));
  testQueue = run.catch(() => {});
  const done = run.finally(() => tests.delete(id));
  tests.set(id, done);
  return done.then(() => agentEntry(id));
}

const tagged = (test) => Object.assign(new Error(test), { test });

async function runTest(profile, limit) {
  if (!(await isolationAvailable())) throw new Error('Native agent isolation is unavailable. Install or repair the Windows isolation worker before starting an agent.');
  const home = await agentHome(profile.id);
  const workspace = await fs.mkdtemp(path.join(home, 'tmp', 'spectrum-test-'));
  let child, connection, initial, output = '', exited = false;
  try {
    const options = await launchOptions(profile.id, { workspace, home });
    const stopped = new AbortController();
    child = await spawnAgentProcess(options);
    const ended = new Promise((resolve) => { child.once('exit', resolve); child.once('error', resolve); });
    void ended.then(() => { exited = true; stopped.abort(tagged('exited')); });
    child.stderr.on('data', (chunk) => { output = (output + chunk.toString()).slice(-12000); });
    // no prompt is sent, so the agent should ask for no files, terminals or permissions; any it asks for are refused
    connection = client({ name: 'spectrum', version: APP_VERSION }).connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
    const ask = (method, params) => timeout(connection.agent.request(method, params), limit, 'timeout', stopped.signal).catch((err) => {
      throw err.test || err.code !== undefined || err.message !== 'timeout' ? err : tagged('timeout');
    });
    let result;
    try {
      initial = await ask('initialize', { protocolVersion: 1, clientCapabilities: clientCapabilities(options.air), clientInfo: { name: 'spectrum', title: 'Spectrum', version: APP_VERSION } });
      if (initial?.protocolVersion !== 1) result = { code: 'not-acp' };
      else {
        if (options.authMethod) await ask('authenticate', { methodId: options.authMethod });
        const session = await ask('session/new', { cwd: workspace, mcpServers: [] });
        result = session?.sessionId ? { ok: true, code: 'ready' } : { code: 'not-acp' };
      }
    } catch (err) {
      // a connection that broke as the agent stopped is its stopping
      if (!err.test && typeof err.code !== 'number') await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, 500))]);
      result = err.test === 'exited' || (exited && err.test !== 'timeout') ? { code: 'exited', detail: hide(output, options.secrets).slice(-2000) }
        : err.test === 'timeout' ? { code: 'timeout' }
          : err.code === -32000 ? { code: 'sign-in', ...(initial?.authMethods?.length && { methods: initial.authMethods.map((m) => m.name || m.id).filter(Boolean) }) }
            : typeof err.code === 'number' ? { code: 'error', detail: hide(err.message, options.secrets).slice(0, 2000) }
              : { code: 'not-acp' };
    }
    const version = initial?.agentInfo?.version;
    await recordTest(profile.id, { ok: false, ...result, ...(version && { version: String(version) }), program: options.program }, { setup: options.setup });
  } finally {
    connection?.close();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child.once('close', resolve));
      killAgentProcess(child);
      await timeout(closed, 10000, 'The isolated process tree did not stop.').catch(() => {});
    }
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

/** Installs or removes an agent's adapter, never while a Test or session of that agent runs. */
export async function changeAdapter(id, action, options) {
  await inUse(id);
  await (action === 'remove' ? removeAdapter(id) : installAdapter(id, options));
  return agentEntry(id);
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
// Claude, so only .agents/skills there. Antigravity looks in its own global folder, not ~/.agents.
const SKILL_FOLDERS = process.platform === 'win32' ? ['.agents/skills'] : ['.agents/skills', '.claude/skills'];
const skillFolders = (agentId) => [...SKILL_FOLDERS, ...(agentId === 'antigravity' ? ['.gemini/config/skills'] : [])];
const SKILL_MARK = '.spectrum-managed';
const copySkills = `const fs=require('node:fs'), path=require('node:path');
  const { skills, folders, mark, onlyAdd } = JSON.parse(fs.readFileSync(0, 'utf8'));
  const hidden = ${agentHiddenNameSource};
  const kept = (src) => !hidden(path.basename(src));
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
  child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({ skills, folders: skillFolders(r.agentId), mark: SKILL_MARK, onlyAdd }));
  try { await timeout(done, 30000, 'Copying the skills took too long.'); r.skillsAdded = onlyAdd; }
  finally { killAgentProcess(child); }
}

// Spectrum's tools server, which the agent starts inside its own isolation (macOS only: on Windows the isolation
// stalls a Node child's pipes, so agents there get none yet): the one bundled beside the desktop app's server, or the
// repository's source in development
const bundledTools = fileURLToPath(new URL('./mcp.mjs', import.meta.url));
const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const toolsState = (r) => path.join(r.home, 'spectrum-tools', r.id);
/** The tools server's file, its environment, and what isolation must also read to run it. */
export async function toolsLaunch(bundle = bundledTools) {
  const packaged = await fs.stat(bundle).then((s) => s.isFile(), () => false);
  const entry = packaged ? bundle : path.join(repository, 'apps/backend/src/mcp/server.js');
  // Node, the server (in development the backend's source, its packages and the version in the root package.json; in
  // the app the bundle and, beside its folder, the data it reads as it starts and gives pandoc: OpenCC's tables, the
  // APA style) and the user's own fonts, for a compile
  const reads = [nodeRead(), path.dirname(entry), ...(packaged ? [path.join(path.dirname(entry), '..', 'data')] : [path.join(repository, 'apps/backend'), path.join(repository, 'node_modules'), path.join(repository, 'package.json')]), path.join(os.homedir(), 'Library', 'Fonts')];
  // the engines Spectrum downloaded (pandoc, older Typst versions), and the built-in programs' own folders
  reads.push(path.join(DATA_DIR, 'engines'));
  for (const file of [builtInTectonic(), builtInTypst()]) {
    const dir = file && path.dirname(file);
    if (dir && !reads.some((read) => dir === read || dir.startsWith(read + path.sep))) reads.push(dir);
  }
  // the engines' own paths and Spectrum's data folder, so a compile inside isolation finds the same programs
  const env = { SPECTRUM_DATA_DIR: DATA_DIR, ...Object.fromEntries([['SPECTRUM_TYPST', process.env.SPECTRUM_TYPST], ['SPECTRUM_TECTONIC', process.env.SPECTRUM_TECTONIC]].filter(([, value]) => value)) };
  return { entry, env, reads: (await Promise.all(reads.map(async (p) => (await fs.stat(p).catch(() => null)) && p))).filter(Boolean) };
}
/** What the tools server reads for each call (the main file, the compile choices, the open to-dos), when it changed. */
async function writeToolsContext(r) {
  const meta = await readMeta(r.root).catch(() => ({}));
  const context = JSON.stringify({
    mainFile: meta.mainFile || await detectMainFile(r.root).catch(() => null),
    ...(await compileChoices(r)),
    todos: await openTodos(r.root)
  });
  if (context === r.toolsContext) return;
  // written by isolation, as the home is the agent's
  await agentFile(r, 'write', path.join(toolsState(r), 'context.json'), context);
  r.toolsContext = context;
}
async function toolsServer(r) {
  if (process.platform !== 'darwin') return null;
  const { entry, env, reads } = await toolsLaunch();
  const state = toolsState(r);
  // written at each start, and on a later turn when it changed
  r.toolsContext = undefined;
  await writeToolsContext(r);
  return {
    reads,
    server: { name: 'spectrum', command: process.execPath, args: [entry, '--root', r.workspace, '--state', state], env: [
      { name: 'HOME', value: r.home },
      { name: 'TMPDIR', value: path.join(r.home, 'tmp') },
      { name: 'PATH', value: process.env.PATH || '/usr/bin:/bin' },
      ...Object.entries(env).map(([name, value]) => ({ name, value }))
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
 * Why a Windows preview of a draft isn't compiled, or null: version is pdflatex's --version, null when there is none
 * (Auto then compiles with Tectonic, as the user's own compile does). Its engines and helpers are the user's own compile's.
 * Typst reads nothing outside its --root (the draft's copy) but fonts and packages, and runs nothing, on any system.
 * ponytail: Markdown stays refused: pandoc reads any image or bibliography a draft names, which no TeX limit reaches
 */
export function windowsPreviewRefusal(main, engine, version) {
  if (/\.(md|markdown)$/i.test(main)) return 'Preview PDF on Windows doesn’t compile Markdown drafts yet. Review its changes as text.';
  if (/\.typ$/i.test(main)) return null;
  if (engine !== 'tectonic' && version != null && !confinableTeX(version)) return 'Preview PDF on Windows needs MiKTeX, or TeX Live 2025 or earlier: later TeX Live can’t limit what a compile reads, so the draft isn’t compiled. Review its changes as text.';
  return null;
}
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
  return { main, engine: engine || (await compileChoices(r)).engine };
}

// one preview at a time for a project: they share a home for TeX's caches, and a review's two share a copy's folder
const compiling = new Map();
function inTurn(root, work) {
  const turn = (compiling.get(root) || Promise.resolve()).then(work);
  const settled = turn.catch(() => {}).finally(() => { if (compiling.get(root) === settled) compiling.delete(root); });
  compiling.set(root, settled);
  return turn;
}
// the compiles of a project's own review (no session to stop them with), ended with the app
const reviewCompiles = new Set();

/**
 * A folder as a PDF: { ok, pdf (base64, or null), log }, compiled into this computer's cache (under `name`), never into
 * the folder. On macOS inside isolation, where it can read nothing but the folder and TeX, the folder read-only and the
 * project (root) out of reach. On Windows a link-free copy of the folder, as the user's own compile is there, with the same engines and helpers
 * (Biber, latexmk, the index and glossary tools, Tectonic), but with no shell escape and TeX told to read and write
 * only below the folder (MiKTeX's AllowUnsafeInputFiles, TeX Live's openin_any before 2026), and with no preview where
 * TeX can't be told: TeX Live 2026 and later, and a MiKTeX whose own settings win over the preview's. The helpers are
 * Perl and Lua, which those limits don't reach, so they read what the user's own compile's would (Biber a .bib
 * anywhere the draft names). children: where the compile's process is kept while it runs, to be stopped from.
 */
async function compileIsolated({ root, workspace, name, main, engine, choices, children }) {
  // a fresh folder for each, and a home kept between them for TeX's own caches
  const out = await cachePath(root, 'agent-preview', name);
  const home = await cachePath(root, 'agent-preview', 'home');
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(home, 'tmp'), { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    // TeX's limits, checked where TeX runs: Tectonic (the user's own compile's engine when no TeX is installed) has none
    const tex = engine === 'tectonic' || /\.(typ|md|markdown)$/i.test(main) ? null : await findExecutable('pdflatex');
    const version = tex ? (await execFileAsync(tex, ['--version'], { timeout: 20000, windowsHide: true }).catch(() => ({ stdout: '' }))).stdout : null;
    const refused = windowsPreviewRefusal(main, engine, version);
    if (refused) return { ok: false, pdf: null, log: refused };
    if (/MiKTeX/i.test(version) && !(await mikTeXConfined())) return { ok: false, pdf: null, log: 'Spectrum couldn’t confirm that MiKTeX will limit what the compile reads, writes and runs (a setting in MiKTeX’s own configuration may take precedence), so the draft isn’t compiled. Review its changes as text.' };
    // outside isolation, so never the agent's own folder, where a link it made could lead TeX elsewhere: a copy made by
    // the isolated reader, which refuses links and leaves hidden names out
    const draft = await cachePath(root, 'agent-preview', `${name}-draft`);
    await fs.rm(draft, { recursive: true, force: true });
    for (const [rel, bytes] of Object.entries(await workspaceFiles(workspace))) await writeFileAtomic(safeJoin(draft, rel), bytes);
    const result = await compileFolder({ root: draft, mainFile: main, engine, untrusted: true, buildDir: out, env: PREVIEW_TEX_ENV });
    return { ok: result.ok && result.status === 0, pdf: result.pdf || null, log: result.log || result.error || '' };
  }
  const { entry, env, reads } = await toolsLaunch();
  // the Typst version and Markdown engine the compile reads where the tools server reads its context
  await fs.writeFile(path.join(out, 'context.json'), JSON.stringify(choices));
  const child = await spawnAgentProcess({ command: process.execPath, args: [entry, '--compile', '--root', workspace, '--state', out, '--main', main, '--engine', engine], workspace: out, home, cwd: out, runtimePaths: [...reads, workspace], forbiddenRoots: [root], env });
  children.add(child);
  let output = '', error = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { error = (error + chunk).slice(-4000); });
  const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  child.stdin.end();
  try { await timeout(done, 10 * 60 * 1000, 'The preview took too long and was stopped.'); } finally { children.delete(child); killAgentProcess(child); }
  let result;
  try { result = JSON.parse(output); } catch { return { ok: false, pdf: null, log: error.trim() || 'The preview could not be compiled.' }; }
  const log = await fs.readFile(path.join(out, 'last.log'), 'utf8').catch(() => result.error || '');
  // written by isolation: only a file of its own, never a link it left
  const pdf = result.pdf && (await fs.lstat(result.pdf).catch(() => null))?.isFile() && path.dirname(result.pdf) === out ? (await fs.readFile(result.pdf)).toString('base64') : null;
  return { ok: !!result.ok, pdf, log };
}

/** The agent's draft as a PDF, compiled on its own (compileIsolated): { ok, pdf (base64, or null), log }. */
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
    // stopped with the session's other processes
    r.fileOperations ||= new Set();
    return await inTurn(r.root, async () => compileIsolated({ root: r.root, workspace: r.workspace, name: r.id, main, engine, choices: await compileChoices(r), children: r.fileOperations }));
  } finally { r.reviewing = false; }
}

/**
 * The project as a PDF with `files` laid over it ([{ path, content }], content null: without that file): what proposed
 * changes would give once applied, or with no files the project as it is, for the page before beside the page after.
 * A copy of the project is compiled as an agent's draft is (compileIsolated); the project itself is only read.
 * which: 'before' or 'after', so one doesn't clear the other's folder. compile: the app's defaults, as a new session takes.
 * ponytail: a fresh copy for every preview; keep one and bring it up to date if large projects make that slow.
 */
export async function previewProposal(projectId, { files = [], which = 'after', mainFile, engine, compile } = {}) {
  const root = await getProjectRoot(projectId);
  if (engine != null && !SUPPORTED_ENGINES.includes(engine)) throw Object.assign(new Error('Unsupported engine.'), { statusCode: 400 });
  if (!Array.isArray(files) || files.some((f) => typeof f?.path !== 'string' || (f.content !== null && typeof f.content !== 'string'))) throw Object.assign(new Error('Each file needs a path and its text.'), { statusCode: 400 });
  if (!(await isolationAvailable())) return { ok: false, pdf: null, log: 'The preview is compiled in Spectrum’s isolation, which isn’t available on this computer.' };
  const name = which === 'before' ? 'review-before' : 'review-after';
  const work = path.join(await cachePath(root, 'agent-preview', `${name}-copy`), 'work');
  return inTurn(root, async () => {
    await fs.rm(work, { recursive: true, force: true });
    await fs.mkdir(work, { recursive: true, mode: 0o700 });
    try {
      // the same reader, with the same limits, that makes an agent's copy
      for (const [rel, bytes] of Object.entries(await workspaceFiles(root))) await writeFileAtomic(safeJoin(work, rel), bytes);
      for (const { path: rel, content } of files) {
        if (agentHidden(rel)) continue;
        if (content === null) await fs.rm(safeJoin(work, rel), { force: true });
        else await writeFileAtomic(safeJoin(work, rel), content);
      }
      const workspace = await fs.realpath(work);
      const own = (await readProjectSettings(root)).compile || {};
      const app = appCompile(compile);
      const main = mainFile || (await readMeta(root).catch(() => ({}))).mainFile || await detectMainFile(workspace).catch(() => null);
      if (!main) return { ok: false, pdf: null, log: 'The project has no main document to compile.' };
      safeJoin(workspace, main);
      return await compileIsolated({ root, workspace, name, main, engine: engine || own.engine || 'auto', choices: { engine: own.engine || 'auto', typstVersion: own.typstVersion || app.typstVersion, markdownEngine: own.markdownEngine || app.markdownEngine }, children: reviewCompiles });
    } finally { await fs.rm(work, { recursive: true, force: true }).catch(() => {}); }
  });
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
  const { activePath, selection, log, todos, research, skill, images } = value;
  for (const [text, max] of [[activePath, 1024], [selection, 100000], [log, 200000]]) if (text != null && (typeof text !== 'string' || text.length > max)) throw bad();
  if ((todos != null && typeof todos !== 'boolean') || (research != null && !ITEM_ID.test(String(research))) || (skill != null && !SKILL_ID.test(String(skill)))) throw bad();
  const context = {};
  if (activePath) {
    sessionPath(r, path.join(r.workspace, activePath));
    context.activePath = activePath.split(path.sep).join('/');
  }
  if (selection?.trim()) context.selection = selection;
  if (log?.trim()) context.log = log;
  // pictures pasted or dropped into the message, or a page of the PDF
  const pictures = checkedImages(images);
  if (pictures.length) context.images = pictures;
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
    context.skill && { uri: `${TEXT_URI}skills/${context.skill.id}/SKILL.md`, label: `The skill “${context.skill.id}” to follow for this task`, mimeType: 'text/markdown', text: context.skill.text, skill: context.skill.id }
  ].filter(Boolean);
  for (const { label, skill, ...resource } of parts) {
    // an embedded resource says what it is by its address; as plain text it goes in the marker the tools' answers use
    blocks.push(r.capabilities?.promptCapabilities?.embeddedContext ? { type: 'resource', resource } : { type: 'text', text: `${label}:\n${skill ? skillText(skill, resource.text) : untrusted(label, resource.text)}` });
  }
  // pictures as image blocks, to an agent that says it takes them; to another, a line saying they were left out
  const pictures = context.images || [];
  if (pictures.length && r.capabilities?.promptCapabilities?.image) blocks.push(...pictures.map((p) => ({ type: 'image', mimeType: p.type, data: p.data })));
  else if (pictures.length) {
    const n = pictures.length === 1 ? 'a picture' : `${pictures.length} pictures`;
    blocks.push({ type: 'text', text: `[The user attached ${n}, not sent: this agent does not take images. Say so in your answer.]` });
    emit(r, 'notice', { message: `This agent doesn’t take images, so ${pictures.length === 1 ? 'the picture wasn’t' : `the ${n} weren’t`} sent.` });
  }
  return blocks;
}

/** options: context (readContext's) and persona; a persona other than the session's starts a new agent session. */
export async function promptAgent(r, prompt, { context = {}, persona } = {}) {
  prompt = textLimit(prompt);
  if (!prompt.trim()) throw new Error('Enter a task for the agent.');
  if (persona !== undefined) persona = readPersona(persona);
  if (r.moved) throw Object.assign(new Error(MOVED), { statusCode: 409 });
  // refused while the project is being moved
  await getProjectRoot(r.projectId);
  if (r.busy || r.reviewing || busyProject(r)) throw new Error('An agent is already working on this project.');
  r.busy = true; r.cancelled = false; r.kept = false;
  clearTimeout(r.idleTimer);
  if (persona !== undefined && !samePersona(persona, r.persona)) {
    r.persona = persona;
    r.forceNew = true;
  }
  state(r, 'running');
  let outcome, sent = false, unreached = false;
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
        ({ workspace: r.workspace, withheld: r.withheld } = await initialiseWorkspace(r.root, r.dir, r.mode));
        r.resolved.clear();
      } else if (r.mode === 'review') {
        // best effort: a link left in the draft is told of when the turn's changes are taken
        await refreshDraft(r, (rel) => draftWriter(r, rel)).catch((err) => emit(r, 'notice', { message: `The agent’s copy wasn’t brought up to date with your project: ${err.message}` }));
      }
      tellWithheld(r);
      if (r.cancelled) throw new Error('Task cancelled.');
      if (r.forceNew) disconnect(r);
      // the agent kept from the last turn goes on, unless it has stopped or would now start otherwise
      if (r.connection && !(await keptAgentFits(r))) disconnect(r);
      if (!r.connection || r.connection.signal.aborted) await connect(r);
      if (r.cancelled) throw new Error('Task cancelled.');
      const earlier = r.freshSession && r.events.filter((e) => e.id < asked.id && (e.type === 'user' || (e.type === 'update' && e.data.sessionUpdate === 'agent_message_chunk'))).map((e) => e.data.text || e.data.content?.text || '').join('\n').slice(-12000);
      const intro = r.openedNew && 'You are working in Spectrum. All file and terminal operations are confined to your workspace and private runtime state. Use relative paths. Do not attempt to access the original project or other host services.';
      const persona = r.openedNew && r.persona && !r.capabilities.sessionCapabilities?.systemPrompt && personaText(r.persona);
      const notes = r.notes.length && `Since your last turn:\n${r.notes.map((note) => `- ${note}`).join('\n')}`;
      const handoff = earlier && `Previous conversation (a new agent session was required):\n${earlier}`;
      const text = [persona, intro, notes, handoff, prompt].filter(Boolean).join('\n\n');
      sent = true;
      const result = await timeout(r.peer.request('session/prompt', { sessionId: r.remoteId, prompt: [{ type: 'text', text }, ...contextBlocks(r, context)] }), 30 * 60 * 1000, 'The agent task exceeded 30 minutes.', r.connectionAbort.signal);
      // told once the prompt is through: a failed one, or a session whose first prompt never landed, tells them again
      r.notes = [];
      r.openedNew = r.freshSession = false;
      r.turnCount++;
      unreached = !!r.processOptions.hosts && r.child?.gateAsked?.() === 0;
      emit(r, 'complete', result);
      // the turn's tokens, where the agent counts them: { turn: { totalTokens, inputTokens, outputTokens, … } }
      if (result.usage) emit(r, 'usage', { turn: result.usage });
      outcome = [r.cancelled || result.stopReason === 'cancelled' || ['max_tokens', 'max_turn_requests'].includes(result.stopReason) ? 'interrupted' : result.stopReason === 'end_turn' ? 'completed' : 'failed', result.stopReason === 'refusal' ? 'The agent refused this task.' : undefined];
      // AIR's word that the turn failed, on a turn that still ends as end_turn; a warning (a retry) that it recovered from isn't
      const failure = r.processOptions.air?.includes('sessionFailure') && result._meta?.jetbrains?.air?.sessionFailure;
      if (outcome[0] === 'completed' && failure?.severity === 'error') {
        const title = String(failure.title || 'The task failed.').slice(0, 2000);
        outcome = ['failed', r.processOptions.signIn === 'login' && LOGIN_REFUSED.some((words) => title.includes(words)) ? await signInNeeded(r) : title];
      }
    } catch (err) {
      // an agent that stopped by itself is told of by its exit, with its last words: wait a moment for that, so the
      // protocol's own word for a closed pipe doesn't take its place
      const child = r.child;
      // one that never got its task, or wants a sign-in, asked for no host for that reason, which its own message covers
      unreached = sent && err.code !== -32000 && !!r.processOptions.hosts && child?.gateAsked?.() === 0;
      if (!r.cancelled && child?.pid && child.exitCode === null && child.signalCode === null) await timeout(new Promise((resolve) => child.once('exit', resolve)), 500, 'still running').catch(() => {});
      const told = r.status === 'failed' && child && (child.exitCode !== null || child.signalCode !== null);
      const signIn = err.code === -32000 && !r.cancelled ? await signInNeeded(r) : '';
      outcome = r.cancelled ? ['interrupted', 'Stopped.'] : ['failed', signIn || (told ? undefined : err.message)];
      disconnect(r);
    }
    finally {
      for (const [id, pending] of r.pending) { pending.reject(new Error('The task ended.')); emit(r, 'answered', { requestId: id }); }
      r.pending.clear();
      // A review session's agent that finished its turn is kept for the next (r-agentic-08), waiting for a prompt; its
      // terminals and file helpers stop. Anything it left running writes only in its copy, which is compared again
      // after every turn and checked by hash on Apply, so a late write still reaches the tray. A direct session's agent
      // stops, as before: what it left running would write in the project itself, outside any turn's checkpoint.
      const keep = r.mode === 'review' && outcome?.[0] === 'completed' && r.child?.exitCode === null && r.child.signalCode === null;
      disconnect(r, keep);
      const before = new Set(r.events.findLast((e) => e.type === 'changes' && e.id < asked.id)?.data.changes.map(changeKey));
      let changed = true;
      // the event names the changes, whose texts the client asks for, so the stored events keep the transcript under
      // their cap however large the files
      try {
        await r.stopChain; await captureAgentProposal(r);
        const changes = (await pendingChanges(r)).map(({ original, proposed, ...c }) => c);
        changed = changes.some((c) => !before.has(changeKey(c)));
        emit(r, 'changes', { changes });
      } catch (err) {
        emit(r, 'notice', { error: err.message });
        // the user can't reach the draft to put it right, so the agent hears of it
        if (r.mode === 'review') r.notes.push(`Spectrum couldn’t take your changes for review: ${err.message} Put that right so the user can review your work.`);
      }
      for (const todo of await takeSuggestions(r).catch(() => [])) emit(r, 'todo', todo);
      // codex-acp 2.7.0 tells a client without JetBrains' extension of a turn's fatal error only in its reply, and ends
      // the turn as end_turn; what it flags is a retry, or another turn's error. A turn that then did nothing says so,
      // rather than looking done; its words alone never make a turn fail.
      if (outcome?.[0] === 'completed' && !outcome[1] && !changed) {
        const updates = r.events.filter((e) => e.id > asked.id && e.type === 'update');
        const flagged = updates.map((e) => adapterError(e.data)).filter(Boolean).at(-1);
        if (flagged && !updates.some((e) => e.data?.sessionUpdate === 'tool_call')) outcome[1] = `Ended without changes. ${profileFor(r.agentId).name} reported a problem during this task: ${flagged}`;
      }
      // held to its list, an agent that works asks the gate for its model at least: one that asked for nothing either
      // ignores the proxy variables or never got that far, and the user is told once where the choice is
      if (unreached && !r.cancelled && !r.toldUnreached) {
        r.toldUnreached = true;
        emit(r, 'notice', { message: `${profileFor(r.agentId).name} is held to its list of hosts and asked for none of them in this task. If it could not reach its model, it may not work through the list: choose Any host for it in Settings › Agents.` });
      }
      // the turn's end is told once its changes are in and the next prompt can be taken
      r.busy = false;
      state(r, ...outcome);
      if (keep && r.child) idle(r);
      await persist(r);
    }
  })();
  r.task = task;
  return { ok: true };
}

/** Stops the session's terminals and file helpers, and its agent unless keepAgent. */
function disconnect(r, keepAgent = false) {
  let child = null;
  if (!keepAgent) {
    clearTimeout(r.idleTimer);
    r.kept = false;
    r.connectionAbort?.abort(new Error('The agent disconnected.'));
    r.connection?.close();
    r.connection = null;
    child = r.child;
    r.child = null;
  }
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

// An agent connected and waiting (kept from its last turn, started for a new session or a settings change) stops after
// IDLE, when more than KEPT wait, when its session closes in the workspace, or when Spectrum quits
const IDLE = 5 * 60 * 1000;
const KEPT = 3;
function idle(r) {
  clearTimeout(r.idleTimer);
  r.kept = true;
  r.idleSince = Date.now();
  r.idleTimer = setTimeout(() => r.reviewing ? idle(r) : closeAgentRun(r), IDLE);
  r.idleTimer.unref?.();
  const waiting = [...runs.values()].filter((o) => o.kept && o.child && !o.busy && !o.reviewing).sort((a, b) => a.idleSince - b.idleSince);
  for (const o of waiting.slice(0, Math.max(0, waiting.length - KEPT))) disconnect(o);
}
/** Stops the session's agent if it is waiting between turns; its status stays. */
export function closeAgentRun(r) {
  if (r.child && !r.busy && !r.reviewing) disconnect(r);
}
// what isolation an agent starts in and the skills it is given, less what each start makes anew (OpenCode's port and
// password)
const limitsOf = ({ internalPort, secrets, args, env, ...rest }, skills) => JSON.stringify({ ...rest, args: internalPort ? args.slice(0, -4) : args, env: { ...env, OPENCODE_SERVER_PASSWORD: undefined }, skills });
const skillsKey = async (r) => (await activeSkills(r.root).catch(() => [])).map((s) => `${s.id} ${s.stamp}`).join('\n');
/**
 * Whether the agent connected now can take the next turn: it still runs, and would start now with the same program,
 * arguments, key, folders and skills (a changed setup or adapter, or a skill turned on or off, starts it again).
 * The tools server's context is brought up to date.
 */
async function keptAgentFits(r) {
  if (r.child?.exitCode !== null || r.child.signalCode !== null || r.connection.signal.aborted || installing.has(r.agentId)) return false;
  const options = await launchOptions(r.agentId, { workspace: r.workspace, home: r.home, forbiddenRoots: r.mode === 'review' ? [r.root] : [] }).catch(() => null);
  if (!options || limitsOf(options, await skillsKey(r)) !== r.limits) return false;
  // skills only added while another project's session used the home: the ones off here go once it no longer does
  if (r.skillsAdded) await syncAgentSkills(r).catch(() => {});
  if (r.toolsContext !== undefined) await writeToolsContext(r).catch((err) => emit(r, 'notice', { message: `Spectrum’s tools may have an old view of the project this turn: ${err.message}` }));
  return true;
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
  if (r.moved) throw Object.assign(new Error(MOVED), { statusCode: 409 });
  if (r.busy || r.reviewing || busyProject(r)) throw new Error('Wait for the task to finish before changing its settings.');
  r.busy = true; r.cancelled = false; r.kept = false;
  clearTimeout(r.idleTimer);
  try {
    if (r.ready) await r.ready.catch(() => {});
    if (r.connection && !(await keptAgentFits(r))) disconnect(r);
    if (!r.connection || r.connection.signal.aborted) await connect(r);
    const result = await timeout(configId === '__mode'
      ? r.peer.request('session/set_mode', { sessionId: r.remoteId, modeId: value })
      : r.peer.request('session/set_config_option', { sessionId: r.remoteId, configId, value }), 30000, 'The agent did not change its settings.', r.connectionAbort.signal);
    emit(r, 'session', result); return result;
  } finally {
    r.busy = false;
    if (r.child) idle(r);
  }
}
/**
 * Apply or reject changes, by path. Review mode: an applied file's new contents become its baseline, and a rejected one
 * goes back to the user's file in the agent's copy too; the agent hears of both on its next turn. Direct mode's changes
 * are already in the project, so either only puts them away.
 * One text file settled in part (review mode): { action: 'part', path, expected, current, content?, original, proposed }.
 * The user applied some of the change's separate parts, perhaps edited, rejected some, or chose between their own lines
 * and the agent's. content (null: no file), when given, is what the project's file becomes, written only while that
 * file still has the hash `current` the review showed it with; proposed is what the agent's copy then holds, and
 * original what the rest is measured from (the two are the same once nothing is left). The agent is told.
 * checkpoint: false: an apply saves no checkpoint, as its review sitting saved one before its first.
 */
export async function reviewAgentChanges(r, body) {
  if (r.busy || r.reviewing || busyProject(r)) throw new Error('Wait for the agent to finish before reviewing changes.');
  if (!['apply', 'reject', 'part'].includes(body.action)) throw new Error('Choose apply or reject.');
  r.reviewing = true;
  try {
    const changes = await pendingChanges(r);
    if (body.action === 'part') {
      const rel = body.path;
      const change = changes.find((c) => c.path === rel);
      if (r.mode !== 'review' || !change || change.binary) throw new Error('Unknown change path.');
      if (body.expected !== change.afterHash) throw new Error(`“${rel}” changed after the review opened. Refresh and review it again.`);
      const bytes = (text) => { if (text !== null && typeof text !== 'string') throw new Error('Choose the text to keep.'); return text === null ? null : Buffer.from(text); };
      const [original, proposed] = [bytes(body.original), bytes(body.proposed)];
      const wrote = body.content !== undefined;
      if (wrote) await mutateProjectRoot(r.root, () => applyWorkspaceChanges(r, [rel], { [rel]: change.afterHash }, { [rel]: { bytes: bytes(body.content), current: body.current ?? null } }, body.checkpoint !== false));
      await rebaseChange(r, rel, proposed, draftWriter(r, rel), original);
      // said once for a file however many of its parts are settled one by one
      const left = fileHash(original) !== fileHash(proposed);
      const note = `The user ${wrote ? 'applied' : 'rejected'} part of your changes to “${rel}”${wrote ? ', with their own choices and edits' : ''}. Your copy of it now holds ${left ? 'what they kept and what still waits for their review' : 'the file as it is in their project'}. Re-read it before changing it again.`;
      if (!r.notes.includes(note)) r.notes.push(note);
      await persist(r);
      return pendingChanges(r);
    }
    if (!Array.isArray(body.paths) || !body.paths.length || body.paths.some((rel) => !changes.some((c) => c.path === rel))) throw new Error('Unknown change path.');
    const draft = (rel) => draftWriter(r, rel);
    if (r.mode !== 'review') {
      if (body.action === 'apply') throw new Error('Finish the review run before applying changes.');
      for (const rel of body.paths) r.resolved.add(changeKey(changes.find((c) => c.path === rel)));
    } else if (body.action === 'apply') {
      for (const { path: rel, bytes, merged } of await mutateProjectRoot(r.root, () => applyWorkspaceChanges(r, body.paths, body.expected, {}, body.checkpoint !== false))) {
        await rebaseChange(r, rel, bytes, draft(rel));
        if (merged) r.notes.push(`“${rel}” was applied with the user’s own edits to it merged in. Re-read it before changing it again.`);
      }
    } else {
      // every file read before any is reset; the agent hears of those that were, even if a later one fails
      const reset = [];
      try {
        await mutateProjectRoot(r.root, async () => {
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
 * as they were: a finished session's agent, kept for its next turn or connected by a model or mode change, is only
 * closed.
 */
export async function shutdownAgents() {
  for (const child of reviewCompiles) killAgentProcess(child);
  await Promise.allSettled([...runs.values()].filter((r) => r.busy || r.child || r.fileOperations?.size).map((r) => (r.busy || r.fileOperations?.size || r.status === 'ready' ? stopAgentRun(r) : (disconnect(r), r.stopChain))));
}
