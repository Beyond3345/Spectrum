// The Spectrum agent's runs as jobs. A run belongs to one thread of one project and takes that thread's turns one at
// a time: each turn is the model with its tools until it answers (agentService.js runToolAgent), heard as events
// while it happens. The run keeps the conversation between turns, so a later turn has the earlier ones' tool calls
// and the provider's cache its prefix, and Continue goes on from where a turn stopped. A run lives in this process
// only: it ends an hour after its last turn, or with the app, and the thread (a chat, saved by the page) is what stays.
//
// Events, each { id, type, data, at } with ids rising through the run; the store holds the current turn's:
//   state   { status, turn, model?, effort?, planFirst?, incomplete? }   status: running, stopping, or how the turn
//           ended: done, failed, stopped, steps (the step limit) or cut (the output limit)
//   user    { text, steered? }           the turn's request; steered: a message handed over between steps
//   text    { text }                     a piece of the model's words (the store joins the pieces: `first`)
//   step    { id, tool, about?, status, ms?, ok?, show? }   status: started, done or failed; show: { text } or
//           { diff: { path, oldText, newText } }, what the card opens to
//   retry   { attempt, of, waitMs, streamed }   before a wait to try the provider again; streamed: the text of the
//           try given up is to be dropped
//   usage   { input, output, cacheRead?, cacheWrite?, total, model }   one model call's tokens, and the turn's so far
//   todo    { text, link? }              a to-do the agent suggests
//   notice  { message }
//   result  { turn, ok, reply, patches, changes, todos, steps, says?, incomplete?, usage?, unsent? }   the turn's
//           whole outcome, as /api/agent/run answers; then the last `state`
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runToolAgent } from './agentService.js';
import { cachePath, getProjectRoot, httpError } from './projectService.js';

const KEEP_MS = 60 * 60 * 1000;
const RUN_ID = /^[a-f0-9-]{36}$/;
const THREAD_ID = /^[A-Za-z0-9_-]{1,64}$/;
const runs = new Map();
const threadKey = (projectId, threadId) => `${projectId}\n${threadId}`;
const RUNNING = ['running', 'stopping'];

const emit = (run, type, data) => {
  const event = { id: ++run.sequence, type, data, at: new Date().toISOString() };
  const last = run.events.at(-1);
  // the store keeps a message's pieces as one event, which a client that connects later takes in place of them
  if (type === 'text' && last?.type === 'text') run.events[run.events.length - 1] = { ...event, first: last.first ?? last.id, data: { text: last.data.text + data.text } };
  else run.events.push(event);
  for (const listener of run.listeners) listener(event);
};

export const runSnapshot = (run) => ({ id: run.id, projectId: run.projectId, threadId: run.threadId, status: run.status, turn: run.turn, lastEventId: run.sequence });

export function getRun(id) {
  const run = RUN_ID.test(String(id)) && runs.get(id);
  if (!run) throw httpError('This run is no longer kept. Send the request again.', 404);
  return run;
}

/** The run of a project's thread, while it is kept. */
export const runOfThread = (projectId, threadId) => [...runs.values()].find((r) => r.key === threadKey(projectId, threadId)) || null;

/** Whether a Spectrum agent turn is under way in the project. */
export const spectrumAgentAtWork = (projectId) => [...runs.values()].some((r) => r.projectId === projectId && RUNNING.includes(r.status));

function forget(run) {
  clearTimeout(run.timer);
  runs.delete(run.id);
  if (run.stateDir) fs.rm(run.stateDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Starts a turn: of the thread's run when it has one, else of a new run. body is what /api/agent/run takes for a
 * tools run (prompt, selection, activePath, compileLog, llmConfig, searchConfig, drafts, history, instructions,
 * skillBlock, compile), with threadId, and the turn's own model, reasoningEffort and planFirst. resume: Continue, on
 * the run's conversation as it stands. Returns the run's snapshot at once; the turn is heard through its events.
 */
export async function startTurn(body, { resume = false, runId } = {}) {
  const { projectId, threadId } = body;
  if (!THREAD_ID.test(String(threadId || ''))) throw httpError('Invalid thread id.', 400);
  const root = await getProjectRoot(projectId);
  let run = runId ? getRun(runId) : runOfThread(projectId, threadId);
  if (run && (run.projectId !== projectId || run.threadId !== threadId)) throw httpError('This run belongs to another thread.', 400);
  if (run && RUNNING.includes(run.status)) throw httpError('The agent is already working on this thread.', 409);
  if (!run) {
    const id = crypto.randomUUID();
    run = { id, key: threadKey(projectId, threadId), projectId, threadId, status: 'idle', turn: 0, events: [], sequence: 0, listeners: new Set(), steer: [], conversation: { messages: [] }, stateDir: path.join(await cachePath(root, 'agent-run'), id), timer: null };
    runs.set(id, run);
  }
  clearTimeout(run.timer);
  run.turn += 1;
  run.events = [];
  run.steer = [];
  run.controller = new AbortController();
  run.status = 'running';
  const turn = run.turn;
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : body.llmConfig?.model;
  emit(run, 'state', { status: 'running', turn, ...(model && { model }), ...(body.reasoningEffort && { effort: body.reasoningEffort }), ...(body.planFirst && { planFirst: true }), ...(resume && { resumed: true }) });
  if (!resume) emit(run, 'user', { text: String(body.shown ?? body.prompt ?? '') });
  void (async () => {
    let result;
    try {
      result = await runToolAgent({
        ...body,
        task: body.task || 'custom',
        resume,
        conversation: run.conversation,
        emit: (type, data) => emit(run, type, data),
        signal: run.controller.signal,
        steer: () => run.steer.splice(0),
        cacheKey: run.id,
        stateDir: run.stateDir
      });
    } catch (err) {
      result = { ok: false, reply: err.message || 'The run failed.', patches: [], changes: [], todos: [], steps: [], incomplete: 'failed' };
    }
    emit(run, 'result', { turn, ...result });
    run.status = result.incomplete || (result.ok ? 'done' : 'failed');
    emit(run, 'state', { status: run.status, turn, ...(result.incomplete && { incomplete: result.incomplete }) });
    run.timer = setTimeout(() => forget(run), KEEP_MS);
    run.timer.unref?.();
  })();
  return runSnapshot(run);
}

/** Stop: the model call and the tool running end at once, and the turn ends as stopped, with what it had done. */
export function stopRun(run) {
  if (run.status !== 'running') return;
  run.status = 'stopping';
  emit(run, 'state', { status: 'stopping', turn: run.turn });
  run.controller.abort();
}

/** A message for the agent to read between this turn's steps (Steer now). */
export function steerRun(run, text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw httpError('A message is text of up to 20,000 characters.', 400);
  if (run.status !== 'running') throw httpError('The agent is not working now. Send the message as a new request.', 409);
  run.steer.push(text.trim());
}

/** Hears the run's events from now on; returns the way to stop hearing. */
export function subscribeRun(run, listener) {
  run.listeners.add(listener);
  return () => run.listeners.delete(listener);
}

/** Ends every run, when the app closes. */
export function shutdownRuns() {
  for (const run of runs.values()) {
    run.controller?.abort();
    forget(run);
  }
}
