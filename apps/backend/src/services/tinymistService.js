import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DATA_DIR } from '../config/constants.js';
import { killGroup } from './compileService.js';
import { tinymistProgram } from './engineService.js';
import { APP_DIR, detectMainFile, getProjectRoot, httpError, readMeta, serialiser } from './projectService.js';
import { frame, readFrames } from './texlabService.js';

// Tinymist (Myriad-Dreamin/tinymist, Apache-2.0, downloaded from Settings › Engines), one for each open project whose
// editor asks: Typst's completion, hovers, definitions, references, renames, typstyle's formatting and diagnostics as
// the text changes, relayed to the editor as JSON-RPC (routes/tinymist.js) the way TexLab's are. Spectrum does the
// handshake and runs Tinymist's commands itself, so an editor can't export or make files. Its preview runs hidden, for
// exact jumps between Spectrum's own PDF and the source (jumpToSource, jumpToPdf). Without Tinymist the routes say it
// isn't available and the editor works as before.

const WINDOWS = process.platform === 'win32';
const IDLE_MS = 10 * 60_000;
// a Tinymist that stops this soon after starting isn't started again for a minute, so a broken one doesn't loop
const CRASH_MS = 10_000;
const RETRY_MS = 60_000;
// the hidden preview lays out every change, so it stops a while after the last jump; it starts again in moments
const PREVIEW_IDLE_MS = 5 * 60_000;
// a jump answers in a few milliseconds; a spot between lines gets no answer at all
const JUMP_MS = 800;

const CAPABILITIES = {
  workspace: { workspaceFolders: true, configuration: true, symbol: {} },
  window: { showDocument: { support: true } },
  textDocument: {
    synchronization: {},
    completion: { completionItem: { snippetSupport: true } },
    hover: { contentFormat: ['markdown', 'plaintext'] },
    signatureHelp: {},
    definition: {},
    references: {},
    rename: { prepareSupport: true },
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    formatting: {},
    publishDiagnostics: { versionSupport: true }
  }
};

// what the editor may ask: never a command (Tinymist's export and template ones write files)
const REQUESTS = new Set([
  'textDocument/completion',
  'completionItem/resolve',
  'textDocument/hover',
  'textDocument/signatureHelp',
  'textDocument/definition',
  'textDocument/references',
  'textDocument/prepareRename',
  'textDocument/rename',
  'textDocument/documentSymbol',
  'textDocument/documentHighlight',
  'textDocument/formatting',
  'textDocument/rangeFormatting',
  'workspace/symbol'
]);
// Tinymist's notifications the editor has no use for (the outline comes with every change)
const QUIET = new Set(['window/logMessage', '$/progress', 'telemetry/event', 'tinymist/documentOutline', 'tinymist/preview/dispose', 'tinymist/preview/windowState']);

/** Tinymist's settings: Spectrum keeps its own PDF, and the project's fonts folder is read as the compiles read it. */
const settings = (root) => {
  const fonts = path.join(root, 'fonts');
  return { formatterMode: 'typstyle', exportPdf: 'never', compileStatus: 'enable', semanticTokens: 'disable', systemFonts: true, fontPaths: existsSync(fonts) ? [fonts] : [] };
};

// project id → its session, a promise while it starts (null: no Tinymist)
const sessions = new Map();
// project id → when its Tinymist last stopped soon after starting
const failed = new Map();

/** The project's Tinymist, started if it isn't running; null when there's none to run. */
export async function tinymistSession(projectId) {
  const entry = sessions.get(projectId);
  const current = await entry;
  // its folder has moved: a Tinymist on the old one has old text
  if (current && !current.ended && sessions.get(projectId) === entry) {
    const root = await getProjectRoot(projectId).catch(() => current.root);
    if (root !== current.root && sessions.get(projectId) === entry) await stopProjectTinymist(projectId);
  }
  if (!sessions.has(projectId)) {
    const starting = start(projectId).catch(() => null);
    sessions.set(projectId, starting);
    // nothing kept: looked for again next time, as Tinymist may be downloaded meanwhile
    starting.then((session) => {
      if (!session && sessions.get(projectId) === starting) sessions.delete(projectId);
    });
  }
  return sessions.get(projectId);
}

async function start(projectId) {
  if (Date.now() - (failed.get(projectId) ?? 0) < RETRY_MS) return null;
  const program = tinymistProgram();
  if (!program) return null;
  const root = await getProjectRoot(projectId);
  // tests stand a Node script in for it
  const [file, args] = /\.m?js$/i.test(program.path) ? [process.execPath, [program.path, 'lsp']] : [program.path, ['lsp']];
  // not the project's folder, which Windows wouldn't then let be moved or binned while Tinymist runs; packages go
  // where the compiles keep them
  const env = { ...process.env, TYPST_PACKAGE_CACHE_PATH: path.join(DATA_DIR, 'typst', 'packages') };
  const proc = spawn(file, args, { cwd: os.tmpdir(), env, stdio: ['pipe', 'pipe', 'ignore'], detached: !WINDOWS, windowsHide: true });
  const session = {
    projectId,
    root,
    rootUri: pathToFileURL(root).href,
    typst: program.typst,
    proc,
    started: Date.now(),
    result: null,
    nextId: 0,
    // Tinymist's answers to Spectrum's own requests, and the editors' requests waiting for Tinymist, by the id Tinymist has
    own: new Map(),
    pending: new Map(),
    clients: new Map(),
    // project path → the editors that have it open
    opened: new Map(),
    // the hidden preview (a promise while it starts), its task's number, and what waits for its next jump
    preview: null,
    tasks: 0,
    shown: null,
    jumped: null,
    jumps: serialiser(),
    idle: null,
    stopping: false,
    ended: false
  };
  proc.on('error', () => ended(session));
  proc.on('exit', () => ended(session));
  // after it stops, writes fail with EPIPE
  proc.stdin.on('error', () => {});
  readFrames(proc.stdout, (message) => fromServer(session, message));
  try {
    session.result = await ownRequest(session, 'initialize', {
      processId: process.pid,
      clientInfo: { name: 'Spectrum' },
      rootUri: session.rootUri,
      workspaceFolders: [{ uri: session.rootUri, name: path.basename(root) }],
      initializationOptions: settings(root),
      capabilities: CAPABILITIES
    });
    write(session, { jsonrpc: '2.0', method: 'initialized', params: {} });
    await pinMain(session);
  } catch (err) {
    killGroup(proc);
    throw err;
  }
  scheduleIdle(session);
  return session;
}

function write(session, message) {
  if (!session.ended && session.proc.stdin.writable) session.proc.stdin.write(frame(message));
}

function ownRequest(session, method, params, timeout = 20_000) {
  const id = ++session.nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.own.delete(id);
      reject(new Error(`Tinymist didn’t answer ${method}.`));
    }, timeout);
    session.own.set(id, { resolve, reject, timer });
    write(session, { jsonrpc: '2.0', id, method, params });
  });
}

const command = (session, name, args) => ownRequest(session, 'workspace/executeCommand', { command: name, arguments: args });

/** A project path's file on disk; null for one outside the project. */
function fileOf(session, rel) {
  const file = path.join(session.root, ...String(rel).split('/'));
  return projectPath(session, pathToFileURL(file).href) ? file : null;
}

/**
 * The main Typst document checked as a whole, so editing a chapter doesn't mark what main.typ defines for it. Again
 * whenever an editor connects, as the main file may have changed; a preview pins the document it shows.
 */
async function pinMain(session) {
  const doc = (await readMeta(session.root).catch(() => ({}))).mainFile || (await detectMainFile(session.root).catch(() => ''));
  const file = /\.typ$/i.test(doc || '') && fileOf(session, doc);
  if (file) await command(session, 'tinymist.pinMain', [file]);
}

/** A file URI's path in the project, '/'-separated; null for one outside it or in its app data. */
function projectPath(session, uri) {
  if (typeof uri !== 'string' || !uri.startsWith('file:')) return null;
  let file;
  try {
    file = fileURLToPath(uri);
  } catch {
    return null;
  }
  const rel = path.relative(session.root, file);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  return parts[0].toLowerCase() === APP_DIR ? null : parts.join('/');
}

function fromServer(session, message) {
  const { id, method } = message;
  if (method === undefined) {
    const own = session.own.get(id);
    if (own) {
      session.own.delete(id);
      clearTimeout(own.timer);
      if (message.error) own.reject(new Error(message.error.message || 'Tinymist refused.'));
      else own.resolve(message.result);
    }
    const waiting = session.pending.get(id);
    if (waiting) {
      session.pending.delete(id);
      waiting.client.send({ ...message, id: waiting.id });
    }
    return;
  }
  if (id !== undefined) {
    write(session, { jsonrpc: '2.0', id, ...answer(session, message) });
    return;
  }
  if (method === 'tinymist/preview/dispose') session.preview = null;
  if (QUIET.has(method)) return;
  for (const client of session.clients.values()) client.send(message);
}

/** Spectrum's answer to a request of Tinymist's: a preview's jump to the source goes to the jump waiting for it. */
function answer(session, { method, params }) {
  if (method === 'workspace/configuration') return { result: (params?.items ?? []).map(() => settings(session.root)) };
  if (method === 'window/showDocument') {
    const shown = session.shown;
    session.shown = null;
    shown?.(params);
    return { result: { success: Boolean(shown) } };
  }
  if (['client/registerCapability', 'client/unregisterCapability', 'window/workDoneProgress/create'].includes(method)) return { result: null };
  return { error: { code: -32601, message: `${method} isn’t supported.` } };
}

/**
 * An editor connected through the tinymist route: send(message) passes it Tinymist's notifications and the answers to
 * its requests, close() ends its stream. end() when it goes: the files it had open go back to their text on disk.
 */
export function connectClient(session, send, close) {
  const client = { id: crypto.randomUUID(), send, close, open: new Map() };
  session.clients.set(client.id, client);
  clearTimeout(session.idle);
  pinMain(session).catch(() => {});
  return { id: client.id, rootUri: session.rootUri, end: () => disconnect(session, client) };
}

function disconnect(session, client) {
  if (!session.clients.delete(client.id)) return;
  for (const [rel, uri] of client.open) {
    const holders = session.opened.get(rel);
    holders?.delete(client.id);
    if (holders?.size) continue;
    session.opened.delete(rel);
    write(session, { jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri } } });
  }
  for (const [id, waiting] of session.pending) if (waiting.client === client) session.pending.delete(id);
  scheduleIdle(session);
}

/** A message (or a list of them, in order) from a connected editor. */
export function fromClient(session, clientId, message) {
  const client = session.clients.get(clientId);
  if (!client) throw httpError('That editor isn’t connected to Tinymist any more.', 404);
  for (const one of Array.isArray(message) ? message : [message]) relay(session, client, one);
}

function relay(session, client, message) {
  // an answer to a request of Tinymist's: Spectrum has answered them all already
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return;
  const { id, method, params } = message;
  const reply = (body) => client.send({ jsonrpc: '2.0', id, ...body });
  if (method === 'initialize') return reply({ result: session.result });
  if (method === 'shutdown') return reply({ result: null });
  if (method === '$/cancelRequest') {
    const found = [...session.pending].find(([, waiting]) => waiting.client === client && waiting.id === params?.id);
    if (found) write(session, { jsonrpc: '2.0', method, params: { id: found[0] } });
    return;
  }
  if (['textDocument/didOpen', 'textDocument/didChange', 'textDocument/didClose'].includes(method)) return syncDocument(session, client, method, params);
  if (id === undefined) return;
  const uri = params?.textDocument?.uri;
  if (!REQUESTS.has(method) || (uri !== undefined && !projectPath(session, uri))) return reply({ error: { code: -32601, message: `${method} isn’t available here.` } });
  const serverId = ++session.nextId;
  session.pending.set(serverId, { client, id });
  write(session, { jsonrpc: '2.0', id: serverId, method, params });
}

/** An editor's open file: Tinymist has its text from the editor while one has it open, and the disk's once none has. */
function syncDocument(session, client, method, params) {
  const uri = params?.textDocument?.uri;
  const rel = projectPath(session, uri);
  if (!rel) return;
  const holders = session.opened.get(rel) ?? new Set();
  if (method === 'textDocument/didOpen') {
    holders.add(client.id);
    session.opened.set(rel, holders);
    client.open.set(rel, uri);
  } else if (!holders.has(client.id)) {
    // text only for a file this editor opened
    return;
  } else if (method === 'textDocument/didClose') {
    holders.delete(client.id);
    client.open.delete(rel);
    if (holders.size) return;
    session.opened.delete(rel);
  }
  write(session, { jsonrpc: '2.0', method, params });
}

/**
 * The hidden preview of doc (a project path), started for the first jump, with its data plane connected as the
 * preview's own page would be (from the page's origin, which Tinymist checks). Its layout is the editors' text, and
 * the same Typst lays it out as Spectrum's PDF when the project's version matches Tinymist's, so its points are the PDF's.
 */
function preview(session, doc) {
  const file = fileOf(session, doc);
  if (!file || !/\.typ$/i.test(doc)) throw httpError('Choose a Typst document of this project.', 400);
  if (session.preview?.doc === doc) return session.preview.ready;
  stopPreview(session);
  const task = `spectrum-${++session.tasks}`;
  const view = { doc, task, ws: null, idle: null };
  view.ready = (async () => {
    const args = ['--task-id', task, '--data-plane-host=127.0.0.1:0', '--control-plane-host=127.0.0.1:0', '--invert-colors=never', '--no-open', file];
    const { dataPlanePort, staticServerPort } = await command(session, 'tinymist.doStartPreview', [args]);
    const ws = new WebSocket(`ws://127.0.0.1:${dataPlanePort}/`, { headers: { Origin: `http://127.0.0.1:${staticServerPort}` } });
    ws.binaryType = 'arraybuffer';
    view.ws = ws;
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('Tinymist’s preview didn’t connect.'));
    });
    // the page's drawing comes the same way and is left; only a jump's "jump,page x y" is read
    ws.onmessage = ({ data }) => {
      const bytes = typeof data === 'string' ? Buffer.from(data) : new Uint8Array(data);
      if (Buffer.from(bytes.subarray(0, 5)).toString() !== 'jump,') return;
      const jumped = session.jumped;
      session.jumped = null;
      jumped?.(Buffer.from(bytes).toString().slice(5));
    };
    ws.onclose = () => {
      if (session.preview === view) session.preview = null;
    };
    return view;
  })();
  session.preview = view;
  view.ready.catch(() => {
    if (session.preview === view) stopPreview(session);
  });
  return view.ready;
}

function stopPreview(session) {
  const view = session.preview;
  if (!view) return;
  session.preview = null;
  clearTimeout(view.idle);
  view.ws?.close();
  command(session, 'tinymist.doKillPreview', [view.task]).catch(() => {});
}

/** Runs ask with the preview of doc, waiting for what it answers through key (shown or jumped); null for none in JUMP_MS. */
function jump(projectId, doc, key, ask) {
  return tinymistSession(projectId).then((session) => {
    if (!session) throw httpError('Tinymist isn’t available.', 503);
    scheduleIdle(session);
    // one at a time, as an answer doesn't say which ask it was for
    return session.jumps(async () => {
      const view = await preview(session, doc);
      clearTimeout(view.idle);
      view.idle = setTimeout(() => session.preview === view && stopPreview(session), PREVIEW_IDLE_MS).unref();
      let timer;
      const answered = new Promise((resolve) => {
        session[key] = resolve;
        timer = setTimeout(() => resolve(null), JUMP_MS);
      });
      try {
        await ask(session, view);
        return await answered;
      } finally {
        clearTimeout(timer);
        session[key] = null;
      }
    });
  });
}

/**
 * Where a spot on doc's PDF (page from 1, x and y in points from its top-left) was written: { file, line, column }
 * (from 1, the column in UTF-16 units as the editor counts), or null for a spot with nothing there.
 */
export async function jumpToSource(projectId, doc, { page, x, y }) {
  if (![page, x, y].every(Number.isFinite)) throw httpError('Give a page and a spot on it.', 400);
  const shown = await jump(projectId, doc, 'shown', (session, view) => view.ws.send(`src-point ${JSON.stringify({ page_no: page, x, y })}`));
  const session = await sessions.get(projectId);
  const file = shown && session && projectPath(session, shown.uri);
  if (!file) return null;
  const { line, character } = shown.selection?.start ?? {};
  return Number.isInteger(line) ? { file, line: line + 1, column: (character ?? 0) + 1 } : null;
}

/**
 * Where a place in the source (file a project path, line and column from 1) is in doc's PDF: { page, x, y } in points
 * from the page's top-left, y on the baseline, at the start of the text the place is in; null when it made nothing.
 */
export async function jumpToPdf(projectId, doc, { file, line, column }) {
  if (![line, column].every(Number.isInteger)) throw httpError('Give a line and a column.', 400);
  const at = await jump(projectId, doc, 'jumped', async (session, view) => {
    const filepath = fileOf(session, file);
    if (!filepath) throw httpError('That file isn’t in this project.', 400);
    await command(session, 'tinymist.scrollPreview', [view.task, { event: 'panelScrollTo', filepath, line: line - 1, character: column - 1 }]);
  });
  // "1 33.74578 59.166782", the first of the places there may be
  const [page, x, y] = (at ?? '').split(',')[0].trim().split(/\s+/).map(Number);
  return Number.isInteger(page) && Number.isFinite(x) && Number.isFinite(y) ? { page, x, y } : null;
}

function scheduleIdle(session) {
  clearTimeout(session.idle);
  if (!session.clients.size) session.idle = setTimeout(() => stopSession(session), IDLE_MS).unref();
}

/** Asks Tinymist to stop, and ends it and what it started if it hasn't within a few seconds. */
function stopSession(session) {
  session.stopping = true;
  forget(session);
  ownRequest(session, 'shutdown', null, 2000)
    .then(() => write(session, { jsonrpc: '2.0', method: 'exit' }))
    .catch(() => {})
    .finally(() => setTimeout(() => killGroup(session.proc), 1000).unref());
}

function ended(session) {
  if (session.ended) return;
  session.ended = true;
  clearTimeout(session.idle);
  clearTimeout(session.preview?.idle);
  session.preview?.ws?.close();
  session.preview = null;
  if (!session.stopping && Date.now() - session.started < CRASH_MS) failed.set(session.projectId, Date.now());
  for (const own of session.own.values()) {
    clearTimeout(own.timer);
    own.reject(new Error('Tinymist stopped.'));
  }
  session.own.clear();
  // their EventSource connects again, to a new Tinymist
  for (const client of session.clients.values()) client.close();
  session.clients.clear();
  killGroup(session.proc);
  forget(session);
}

/** The next ask for the project's Tinymist starts a new one. */
function forget(session) {
  const entry = sessions.get(session.projectId);
  entry?.then((current) => {
    if (current === session && sessions.get(session.projectId) === entry) sessions.delete(session.projectId);
  });
}

/** Ends the project's Tinymist, if it runs, and waits until it has gone: before its folder is moved, binned or forgotten. */
export async function stopProjectTinymist(projectId) {
  const entry = sessions.get(projectId);
  const session = await entry;
  if (sessions.get(projectId) === entry) sessions.delete(projectId);
  if (!session || session.ended) return;
  session.stopping = true;
  const gone = new Promise((resolve) => session.proc.once('exit', resolve));
  killGroup(session.proc);
  await gone;
}

/** Ends every project's Tinymist and waits until they have gone: when Spectrum quits, or before Tinymist is removed. */
export async function stopTinymist() {
  const all = await Promise.all(sessions.values());
  sessions.clear();
  failed.clear();
  await Promise.all(
    all.map((session) => {
      if (!session || session.ended) return null;
      session.stopping = true;
      const gone = new Promise((resolve) => session.proc.once('exit', resolve));
      killGroup(session.proc);
      return gone;
    })
  );
}
