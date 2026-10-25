import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { promises as fs, realpathSync, watch } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auxStore, findExecutable, killGroup } from './compileService.js';
import { APP_DIR, cachePath, detectMainFile, getProjectRoot, httpError, readMeta } from './projectService.js';

// TexLab (latex-lsp/texlab, GPL-3.0-only, shipped as a program of its own beside Spectrum), one for each open project:
// started when the editor or the diagnostics route first asks, and relayed to the editor as JSON-RPC (routes/texlab.js).
// Spectrum does the handshake and answers TexLab's own requests, so the editors of a project share one TexLab, and keeps
// its latest diagnostics for Document insights, Review and the syntax check before compiling. Without TexLab (no
// SPECTRUM_TEXLAB and none on the PATH) everything says it isn't available and the editor works as before.

const WINDOWS = process.platform === 'win32';
const IDLE_MS = 10 * 60_000;
const DIAGNOSTICS_DELAY = 500;
// a TexLab that stops this soon after starting isn't started again for a minute, so a broken one doesn't loop
const CRASH_MS = 10_000;
const RETRY_MS = 60_000;
// TexLab 5.26 never lets go of a file an editor has had open: its didClose leaves the file as the editor's (the
// document set keeps the old entry), so it never reads that file from disk again. The bridge keeps such a file's text
// up to date itself, sending the disk's text as a change whenever it changes there (and when the last editor closes
// it), and tells TexLab of other TeX files that change too, after TexLab's own one-second debounce.
// ponytail: TexLab can't forget such a file, so one deleted stays with no text
const WATCHED = /\.(tex|sty|cls|ltx|dtx|bib)$/i;
const REREAD_MS = 2000;

// TexLab reads a project's latexmkrc by running latexmk on it, and a latexmkrc is Perl that can do anything (compiles
// run latexmk with -norc for the same reason). With only the system's own folders on its PATH it finds no latexmk,
// chktex or latexindent, and skipDistro spares it looking for kpsewhich. ponytail: TeX's own files (a .bib or .sty in
// TEXMF) are then unknown to it, which only costs hovers and links into them
const SYSTEM_ROOT = process.env.SystemRoot || 'C:\\Windows';
const SAFE_PATH = WINDOWS ? [path.join(SYSTEM_ROOT, 'System32'), SYSTEM_ROOT].join(';') : '/usr/bin:/bin';

const CAPABILITIES = {
  workspace: { workspaceFolders: true, symbol: {} },
  textDocument: {
    synchronization: {},
    // plain text, which the editor shows escaped: a citation's hover quotes the .bib, which could hold HTML
    hover: { contentFormat: ['plaintext'] },
    definition: {},
    references: {},
    rename: { prepareSupport: true },
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    documentLink: {},
    publishDiagnostics: {}
  }
};

// what the editor may ask: never a build, a formatting or a command (texlab.cleanAuxiliary deletes files)
const REQUESTS = new Set([
  'textDocument/hover',
  'textDocument/definition',
  'textDocument/references',
  'textDocument/prepareRename',
  'textDocument/rename',
  'textDocument/documentSymbol',
  'textDocument/documentLink',
  'textDocument/documentHighlight',
  'workspace/symbol'
]);
// TexLab's notifications the editor has no use for
const QUIET = new Set(['window/logMessage', '$/progress', 'telemetry/event']);

// TexLab's diagnostic codes, by name
const CODES = {
  1: 'unexpected-brace',
  2: 'missing-brace',
  3: 'mismatched-environment',
  4: 'bib-syntax',
  5: 'bib-syntax',
  6: 'bib-syntax',
  7: 'bib-syntax',
  8: 'bib-syntax',
  9: 'unused-label',
  10: 'undefined-label',
  11: 'undefined-citation',
  12: 'unused-entry',
  13: 'duplicate-entry',
  14: 'duplicate-label'
};

// The .aux files the main document's last good compile kept, for section and float numbers, and its folder for logs
// too, so a stray .log in the project never shows as errors. ponytail: the main document's only; another document's
// outline has no numbers
const settings = (auxUri) => ({
  build: { onSave: false, forwardSearchAfter: false, ...(auxUri && { auxDirectory: auxUri, logDirectory: auxUri }) },
  chktex: { onOpenAndSave: false, onEdit: false },
  diagnosticsDelay: DIAGNOSTICS_DELAY,
  latexFormatter: 'none',
  bibtexFormatter: 'none',
  // code in these isn't LaTeX, so a lone brace there is no error (TexLab knows verbatim, lstlisting and minted itself)
  experimental: {
    verbatimEnvironments: ['Verbatim', 'Verbatim*', 'BVerbatim', 'LVerbatim', 'SaveVerbatim', 'VerbatimOut', 'comment', 'filecontents', 'filecontents*', 'tcblisting']
  }
});

/** A message in the LSP's framing. */
export const frame = (message) => {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
};

/** Calls back with each JSON-RPC message of a stream in the LSP's framing (Content-Length headers); one that isn't JSON is dropped. */
export function readFrames(stream, onMessage) {
  let chunks = [];
  let size = 0;
  // the bytes the message being read needs, so a long one is joined once it has all come
  let need = 0;
  stream.on('data', (chunk) => {
    chunks.push(chunk);
    size += chunk.length;
    if (size < need) return;
    let buffer = Buffer.concat(chunks, size);
    need = 0;
    const messages = [];
    for (;;) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) break;
      const length = Number(/content-length:\s*(\d+)/i.exec(buffer.subarray(0, end).toString('latin1'))?.[1]);
      if (!Number.isInteger(length)) {
        buffer = buffer.subarray(end + 4);
        continue;
      }
      if (buffer.length < end + 4 + length) {
        need = end + 4 + length;
        break;
      }
      try {
        messages.push(JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString('utf8')));
      } catch {
        // not JSON
      }
      buffer = buffer.subarray(end + 4 + length);
    }
    chunks = [buffer];
    size = buffer.length;
    for (const message of messages) onMessage(message);
  });
}

/** The TexLab to run: SPECTRUM_TEXLAB (the app's own), else one on the PATH; null when there's none. */
export async function texlabProgram() {
  const given = process.env.SPECTRUM_TEXLAB;
  if (given && (await fs.stat(given).catch(() => null))?.isFile()) return given;
  return findExecutable('texlab', process.env.PATH);
}

// project id → its session, a promise while it starts (null: no TexLab)
const sessions = new Map();
// project id → when its TexLab last stopped soon after starting
const failed = new Map();

/** The project's TexLab, started if it isn't running; null when there's none to run. */
export async function texlabSession(projectId) {
  const entry = sessions.get(projectId);
  const current = await entry;
  // its folder has moved (Relocate, Move to this computer): a TexLab on the old one has old text, and F2 would plan against it
  if (current && !current.ended && sessions.get(projectId) === entry) {
    const root = await getProjectRoot(projectId).catch(() => current.root);
    if (root !== current.root && sessions.get(projectId) === entry) await stopProjectTexlab(projectId);
  }
  if (!sessions.has(projectId)) {
    const starting = start(projectId).catch(() => null);
    sessions.set(projectId, starting);
    // nothing kept: looked for again next time, as TexLab may be installed meanwhile
    starting.then((session) => {
      if (!session && sessions.get(projectId) === starting) sessions.delete(projectId);
    });
  }
  return sessions.get(projectId);
}

async function start(projectId) {
  if (Date.now() - (failed.get(projectId) ?? 0) < RETRY_MS) return null;
  const program = await texlabProgram();
  if (!program) return null;
  const root = await getProjectRoot(projectId);
  // ponytail: TexLab 5.26 panics on a file URI with [, ], ^ or | in it (and Spectrum would start it again each minute),
  // so such a project goes without; drop this when TexLab handles them
  if (/[[\]^|]/.test(root)) return null;
  // tests stand a Node script in for it
  const [file, args] = /\.m?js$/i.test(program) ? [process.execPath, [program, 'run']] : [program, ['run']];
  // not the project's folder, which Windows wouldn't then let be moved or binned while TexLab runs (it only runs
  // latexindent there, which is off)
  const proc = spawn(file, args, { cwd: os.tmpdir(), env: { ...process.env, PATH: SAFE_PATH }, stdio: ['pipe', 'pipe', 'ignore'], detached: !WINDOWS, windowsHide: true });
  const session = {
    projectId,
    root,
    rootUri: pathToFileURL(root).href,
    proc,
    started: Date.now(),
    result: null,
    settings: settings(''),
    nextId: 0,
    // TexLab's own requests from Spectrum, and the editors' requests waiting for TexLab, by the id TexLab has
    own: new Map(),
    pending: new Map(),
    clients: new Map(),
    // project path → the editors that have it open
    opened: new Map(),
    // project path → its URI, for each file an editor has had open, which TexLab holds as the editor's from then on
    adopted: new Map(),
    versions: 0,
    // URI → its project path and TexLab's latest diagnostics for it
    diagnostics: new Map(),
    // a change (or the start) TexLab hasn't published diagnostics for yet, and when they'd have come by
    stale: true,
    settleBy: Date.now() + 5000,
    waiters: [],
    settling: null,
    idle: null,
    stopping: false,
    ended: false
  };
  session.watcher = watchFiles(session);
  proc.on('error', () => ended(session));
  proc.on('exit', () => ended(session));
  // after it stops, writes fail with EPIPE
  proc.stdin.on('error', () => {});
  readFrames(proc.stdout, (message) => fromServer(session, message));
  try {
    // ready for TexLab's first ask, which can come before configure has sent them
    await mainSettings(session);
    session.result = await ownRequest(session, 'initialize', {
      processId: process.pid,
      clientInfo: { name: 'Spectrum' },
      rootUri: session.rootUri,
      workspaceFolders: [{ uri: session.rootUri, name: path.basename(root) }],
      initializationOptions: { skipDistro: true },
      capabilities: CAPABILITIES
    });
    write(session, { jsonrpc: '2.0', method: 'initialized', params: {} });
    await configure(session);
  } catch (err) {
    killGroup(proc);
    throw err;
  }
  session.settleBy = Date.now() + 3000;
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
      reject(new Error(`TexLab didn’t answer ${method}.`));
    }, timeout);
    session.own.set(id, { resolve, reject, timer });
    write(session, { jsonrpc: '2.0', id, method, params });
  });
}

/**
 * TexLab's settings, with the main document's kept .aux files, and the main document itself: TexLab only reads the
 * files beside and below the ones it has, so without it a project no editor has open would have no diagnostics. Again
 * whenever an editor connects, as the main file may have changed.
 */
async function configure(session) {
  const doc = await mainSettings(session);
  write(session, { jsonrpc: '2.0', method: 'workspace/didChangeConfiguration', params: { settings: { texlab: session.settings } } });
  // as if it had just been made: TexLab reads it from disk, and follows it there
  const uri = pathToFileURL(path.join(session.root, ...doc.split('/'))).href;
  write(session, { jsonrpc: '2.0', method: 'workspace/didChangeWatchedFiles', params: { changes: [{ uri, type: 1 }] } });
}

/** The main document, after making TexLab's settings with its kept .aux files. */
async function mainSettings(session) {
  const doc = (await readMeta(session.root).catch(() => ({}))).mainFile || (await detectMainFile(session.root).catch(() => '')) || 'main.tex';
  const aux = await cachePath(session.root).then((cache) => `${pathToFileURL(auxStore(cache, doc)).href}/`, () => '');
  session.settings = settings(aux);
  return doc;
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
      if (message.error) own.reject(new Error(message.error.message || 'TexLab refused.'));
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
  if (method === 'textDocument/publishDiagnostics') keepDiagnostics(session, message.params);
  else if (QUIET.has(method)) return;
  for (const client of session.clients.values()) client.send(message);
}

/** Spectrum's answer to a request of TexLab's. */
function answer(session, { method, params }) {
  if (method === 'workspace/configuration') return { result: (params?.items ?? []).map(() => session.settings) };
  if (method === 'window/showDocument') return { result: { success: false } };
  if (['client/registerCapability', 'client/unregisterCapability', 'window/workDoneProgress/create'].includes(method)) return { result: null };
  return { error: { code: -32601, message: `${method} isn’t supported.` } };
}

const FOLDS_CASE = WINDOWS || process.platform === 'darwin';

/**
 * A project path as the disk spells it, on a Mac or Windows disk, which ignores case: TexLab keeps the file an
 * \input{Chapters/Intro} names apart from chapters/intro.tex.
 */
function spelt(session, rel) {
  if (!FOLDS_CASE) return rel;
  try {
    const real = path.relative(realpathSync.native(session.root), realpathSync.native(path.join(session.root, ...rel.split('/')))).split(path.sep).join('/');
    // a link elsewhere keeps the name it has
    return real.toLowerCase() === rel.toLowerCase() ? real : rel;
  } catch {
    return rel;
  }
}

function keepDiagnostics(session, params) {
  const rel = projectPath(session, params?.uri);
  // by URI, as TexLab has them: two spellings of one file's name are two files to it, and the one the disk doesn't
  // spell it by TexLab read once and never again, so its marks are stale (the disk's spelling has the file's own)
  if (rel && params.diagnostics?.length && spelt(session, rel) === rel) session.diagnostics.set(params.uri, { rel, list: params.diagnostics });
  else session.diagnostics.delete(params?.uri);
  session.stale = false;
  // TexLab publishes a file at a time; the rest of the round comes within moments
  clearTimeout(session.settling);
  session.settling = setTimeout(() => {
    for (const resolve of session.waiters.splice(0)) resolve();
  }, 50);
}

/**
 * An editor connected through the lsp route: send(message) passes it TexLab's notifications and the answers to its
 * requests, close() ends its stream. end() when it goes: the files it had open go back to their text on disk.
 */
export function connectClient(session, send, close) {
  const client = { id: crypto.randomUUID(), send, close, open: new Map() };
  session.clients.set(client.id, client);
  clearTimeout(session.idle);
  configure(session).catch(() => {});
  return { id: client.id, rootUri: session.rootUri, end: () => disconnect(session, client) };
}

function disconnect(session, client) {
  if (!session.clients.delete(client.id)) return;
  for (const [rel, uri] of client.open) {
    const holders = session.opened.get(rel);
    holders?.delete(client.id);
    if (holders?.size) continue;
    session.opened.delete(rel);
    changed(session);
    write(session, { jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri } } });
    adopt(session, rel, uri);
  }
  for (const [id, waiting] of session.pending) if (waiting.client === client) session.pending.delete(id);
  scheduleIdle(session);
}

/** A message (or a list of them, in order) from a connected editor. */
export function fromClient(session, clientId, message) {
  const client = session.clients.get(clientId);
  if (!client) throw httpError('That editor isn’t connected to TexLab any more.', 404);
  for (const one of Array.isArray(message) ? message : [message]) relay(session, client, one);
}

function relay(session, client, message) {
  // an answer to a request of TexLab's: Spectrum has answered them all already
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

/** An editor's open file: TexLab has its text from the editor while one has it open, and the disk's otherwise. */
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
  changed(session);
  write(session, { jsonrpc: '2.0', method, params });
  if (method === 'textDocument/didClose') adopt(session, rel, uri);
}

/** A file no editor has open any more, which TexLab still holds as the editor's: it gets the disk's text, now and when that changes. */
function adopt(session, rel, uri) {
  session.adopted.set(rel, uri);
  reread(session, rel).catch(() => {});
}

async function reread(session, rel) {
  const text = await fs.readFile(path.join(session.root, ...rel.split('/')), 'utf8').catch(() => '');
  // an editor has it open again meanwhile: its text counts
  if (session.ended || session.opened.has(rel)) return;
  changed(session);
  const textDocument = { uri: session.adopted.get(rel), version: ++session.versions };
  write(session, { jsonrpc: '2.0', method: 'textDocument/didChange', params: { textDocument, contentChanges: [{ text }] } });
}

function changed(session) {
  session.stale = true;
  session.settleBy = Date.now() + DIAGNOSTICS_DELAY + 400;
}

/**
 * Each TeX file that changes in the project (not in its app data), REREAD_MS after the last change: an adopted one's
 * new text, and TexLab told to read the others again. An open file's text is the editor's.
 */
function watchFiles(session) {
  let pending = new Set();
  let timer = null;
  const flush = async () => {
    const paths = [...pending].filter((rel) => !session.opened.has(rel));
    pending = new Set();
    const changes = [];
    for (const rel of paths) {
      if (session.adopted.has(rel)) {
        await reread(session, rel);
        continue;
      }
      const file = path.join(session.root, ...rel.split('/'));
      const there = await fs.stat(file).then((stat) => stat.isFile(), () => false);
      changes.push({ uri: pathToFileURL(file).href, type: there ? 2 : 3 });
    }
    if (session.ended || !changes.length) return;
    changed(session);
    write(session, { jsonrpc: '2.0', method: 'workspace/didChangeWatchedFiles', params: { changes } });
  };
  try {
    const watcher = watch(session.root, { recursive: true }, (type, name) => {
      const rel = name ? String(name).split(path.sep).join('/') : '';
      if (!WATCHED.test(rel) || rel.split('/')[0].toLowerCase() === APP_DIR) return;
      pending.add(rel);
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(() => {}), REREAD_MS);
    });
    // the folder went away, or the system ran out of watches: TexLab's own watcher is left
    watcher.on('error', () => watcher.close());
    return {
      close: () => {
        clearTimeout(timer);
        watcher.close();
      }
    };
  } catch {
    return { close: () => {} };
  }
}

/**
 * After a compile, the project's TexLab (if it runs) reads the main document's kept .aux files again, for the outline's
 * numbers. A compile renames them into place, which TexLab's own watcher takes for their removal, so this waits
 * REREAD_MS, past that watcher's one-second debounce.
 */
export function auxKept(projectId) {
  setTimeout(async () => {
    const session = await sessions.get(projectId);
    const dir = session?.settings.build.auxDirectory;
    if (!dir || session.ended) return;
    const folder = fileURLToPath(dir);
    const files = await fs.readdir(folder, { recursive: true }).catch(() => []);
    const changes = files.filter((f) => /\.aux$/i.test(f)).map((f) => ({ uri: pathToFileURL(path.join(folder, f)).href, type: 1 }));
    if (changes.length) write(session, { jsonrpc: '2.0', method: 'workspace/didChangeWatchedFiles', params: { changes } });
  }, REREAD_MS).unref();
}

/** Once TexLab has had its say on the latest change: its next diagnostics, or the time they'd have come by (it says nothing about a clean project). */
function settled(session) {
  const wait = session.settleBy - Date.now();
  if (!session.stale || wait <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, wait);
    session.waiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const SEVERITY = { 1: 'error', 2: 'warning', 3: 'info', 4: 'info' };

/**
 * TexLab's diagnostics for the project's files, once it has caught up with the latest edit: { available, files },
 * files by project path, each { line, col, endLine, endCol (all from 1), severity, message, code?, source }.
 */
export async function projectDiagnostics(projectId) {
  const session = await texlabSession(projectId);
  if (!session) return { available: false, files: {} };
  // the route counts as a use: without an editor, TexLab stops ten minutes after the last ask
  scheduleIdle(session);
  await settled(session);
  const files = {};
  for (const { rel, list } of session.diagnostics.values()) {
    const into = (files[rel] ??= []);
    for (const { range, severity, message, code } of list) {
      const one = {
        line: range.start.line + 1,
        col: range.start.character + 1,
        endLine: range.end.line + 1,
        endCol: range.end.character + 1,
        severity: SEVERITY[severity] ?? 'error',
        message,
        ...(code != null && { code: CODES[code] ?? String(code) }),
        source: 'texlab'
      };
      // the same mark from the file under two URIs, once
      if (!into.some((d) => JSON.stringify(d) === JSON.stringify(one))) into.push(one);
    }
  }
  return { available: !session.ended, files };
}

function scheduleIdle(session) {
  clearTimeout(session.idle);
  if (!session.clients.size) session.idle = setTimeout(() => stopSession(session), IDLE_MS).unref();
}

/** Asks TexLab to stop, and ends it and what it started if it hasn't within a few seconds. */
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
  session.watcher.close();
  clearTimeout(session.idle);
  clearTimeout(session.settling);
  if (!session.stopping && Date.now() - session.started < CRASH_MS) failed.set(session.projectId, Date.now());
  for (const own of session.own.values()) {
    clearTimeout(own.timer);
    own.reject(new Error('TexLab stopped.'));
  }
  session.own.clear();
  for (const resolve of session.waiters.splice(0)) resolve();
  // their EventSource connects again, to a new TexLab
  for (const client of session.clients.values()) client.close();
  session.clients.clear();
  // what it started, if anything is left
  killGroup(session.proc);
  forget(session);
}

/** The next ask for the project's TexLab starts a new one. */
function forget(session) {
  const entry = sessions.get(session.projectId);
  entry?.then((current) => {
    if (current === session && sessions.get(session.projectId) === entry) sessions.delete(session.projectId);
  });
}

/**
 * Ends the project's TexLab, if it runs, and waits until it has gone: before its folder is moved, binned or forgotten.
 * On Windows its watches would hold the folder, which then couldn't be moved or binned for the ten minutes it idles.
 */
export async function stopProjectTexlab(projectId) {
  const entry = sessions.get(projectId);
  const session = await entry;
  if (sessions.get(projectId) === entry) sessions.delete(projectId);
  if (!session || session.ended) return;
  session.stopping = true;
  const gone = new Promise((resolve) => session.proc.once('exit', resolve));
  killGroup(session.proc);
  await gone;
}

/** Ends every project's TexLab, when Spectrum quits. */
export async function stopTexlab() {
  const all = await Promise.all(sessions.values());
  sessions.clear();
  failed.clear();
  for (const session of all) {
    if (!session) continue;
    session.stopping = true;
    killGroup(session.proc);
  }
}
