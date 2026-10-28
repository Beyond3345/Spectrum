import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createWriteStream, existsSync, promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from '../config/constants.js';
import { listFilesRecursive, renameOver } from '../utils/fsUtils.js';
import { killGroup } from './compileService.js';
import { httpError, serialiser } from './projectService.js';
import engineList from '../data/engines.json' with { type: 'json' };

// LanguageTool 6.8 on this computer, only once the user downloads it: its jars from Maven Central and a Temurin Java
// runtime, each pinned by SHA-256 in engines.json, kept in DATA_DIR/engines/languagetool. Started the first time a
// grammar check needs it, on a free port that answers this computer only, and stopped after 10 minutes without a
// check and when Spectrum quits. Nothing goes to LanguageTool's servers: a user's own server address and Premium
// are not in this release, and the free public server is never used.

const execFileAsync = promisify(execFile);
const WINDOWS = process.platform === 'win32';
const ARCH = WINDOWS ? 'win-x64' : process.arch === 'arm64' ? 'arm64' : 'x64';
const IDLE_MS = 10 * 60_000;
const READY_MS = 120_000;
const PART_MS = 120_000;
// LanguageTool's own limit for one request on a server of its defaults is far above this; parts this size keep a
// check cancellable between them and a long thesis from holding the server for minutes
export const PART_CHARS = 20_000;
const DOWNLOAD_FAILED = 'Could not download LanguageTool. Check the internet connection and try again.';
const CHECKSUM_FAILED = 'The download did not match its checksum, so it was not installed.';

const root = () => path.join(DATA_DIR, 'engines', 'languagetool');
const connectionFile = () => path.join(DATA_DIR, 'languagetool.json');

// Tests point these at jars and a Java they serve themselves
let pins = engineList.languagetool;
/** Use other pins, as engines.json's languagetool has, for this process (tests). */
export function useLanguageToolPins(next) {
  pins = next;
}

const javaPin = () => pins.java[ARCH];
/** What an installed copy must have been made from: a repin downloads it again. */
const pinDigest = () => crypto.createHash('sha256').update(JSON.stringify([pins.version, pins.jars, javaPin()])).digest('hex');
const folder = () => path.join(root(), pins.version);
const downloadBytes = () => pins.jars.reduce((sum, [, , bytes]) => sum + bytes, 0) + (javaPin()?.[2] || 0);

// ─── the connection: Off, or On this computer ───

/** { mode: 'off' | 'local' }, Off unless the user chose otherwise. Kept on this computer only, never shared. */
export async function readConnection() {
  try {
    const { mode } = JSON.parse(await fs.readFile(connectionFile(), 'utf8'));
    return { mode: mode === 'local' ? 'local' : 'off' };
  } catch {
    return { mode: 'off' };
  }
}

const connectionLock = serialiser();
export function saveConnection({ mode }) {
  if (!['off', 'local'].includes(mode)) throw httpError('Choose Off or On this computer.', 400);
  return connectionLock(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${connectionFile()}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmp, `${JSON.stringify({ mode }, null, 2)}\n`, { mode: 0o600 });
      await renameOver(tmp, connectionFile());
    } finally {
      await fs.rm(tmp, { force: true });
    }
    if (mode === 'off') await stopLanguageTool();
    return languageToolStatus();
  });
}

// ─── downloading ───

let download = null;
let failure = null;

/** The installed copy's Java, or null when there's none (or one made from other pins). */
async function installedJava() {
  try {
    const found = JSON.parse(await fs.readFile(path.join(folder(), 'installed.json'), 'utf8'));
    const java = path.join(folder(), found.java);
    return found.pins === pinDigest() && existsSync(java) ? java : null;
  } catch {
    return null;
  }
}

/** Fetches url into file, hashing as it goes; a download that stalls, or whose signal aborts, is stopped. Answers the SHA-256. */
async function fetchInto(url, file, onBytes, signal) {
  const controller = new AbortController();
  let idle;
  const stall = () => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(), Number(process.env.SPECTRUM_DOWNLOAD_IDLE_MS) || 60_000);
  };
  const hash = crypto.createHash('sha256');
  try {
    stall();
    const res = await fetch(url, { signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const body = Readable.fromWeb(res.body);
    body.on('data', (chunk) => {
      stall();
      hash.update(chunk);
      onBytes(chunk.length);
    });
    await pipeline(body, createWriteStream(file));
  } catch {
    throw httpError(DOWNLOAD_FAILED, 502);
  } finally {
    clearTimeout(idle);
  }
  return hash.digest('hex');
}

/** Each jar, then Java, into a .part folder, every file checked, and only then put in place. */
async function install() {
  const java = javaPin();
  if (!java) throw httpError('LanguageTool isn’t available for this computer.', 400);
  await fs.mkdir(root(), { recursive: true });
  const part = path.join(root(), `${pins.version}.part-${crypto.randomUUID()}`);
  const old = path.join(root(), `${pins.version}.old-${crypto.randomUUID()}`);
  const progress = (n) => { if (download) download.done += n; };
  try {
    await fs.mkdir(path.join(part, 'jars'), { recursive: true });
    const queue = [...pins.jars];
    // a few at a time: 172 small files one after another would take a while. The first that fails stops the others,
    // and every one has stopped before the .part folder goes
    const stop = new AbortController();
    let failed = null;
    await Promise.all(Array.from({ length: 6 }, async () => {
      try {
        for (let jar = queue.shift(); jar; jar = queue.shift()) {
          const [rel, expected] = jar;
          const digest = await fetchInto(new URL(rel, pins.base).href, path.join(part, 'jars', path.posix.basename(rel)), progress, stop.signal);
          if (digest !== expected) throw httpError(CHECKSUM_FAILED, 502);
        }
      } catch (err) {
        failed ??= err;
        queue.length = 0;
        stop.abort();
      }
    }));
    if (failed) throw failed;
    const [url, expected] = java;
    const archive = path.join(part, `java${url.endsWith('.zip') ? '.zip' : '.tar.gz'}`);
    if (await fetchInto(url, archive, progress) !== expected) throw httpError(CHECKSUM_FAILED, 502);
    await fs.mkdir(path.join(part, 'java'));
    try {
      const tar = WINDOWS ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
      await execFileAsync(tar, ['-xf', archive, '-C', path.join(part, 'java')], { timeout: 5 * 60_000, windowsHide: true });
    } catch {
      throw httpError('The Java download couldn’t be read, so it wasn’t installed.', 502);
    }
    await fs.rm(archive);
    const exe = WINDOWS ? 'java.exe' : 'java';
    const found = (await listFilesRecursive(path.join(part, 'java'))).find((item) => item.type === 'file' && /(^|\/)bin\/java(\.exe)?$/.test(item.path) && path.basename(item.path) === exe);
    if (!found) throw httpError('The Java download didn’t hold java, so it wasn’t installed.', 502);
    await fs.writeFile(path.join(part, 'installed.json'), `${JSON.stringify({ version: pins.version, java: path.join('java', found.path), pins: pinDigest() }, null, 2)}\n`);
    // Windows can't rename a folder over another, so an older copy moves aside first
    await stopLanguageTool();
    const had = existsSync(folder());
    if (had) await renameOver(folder(), old);
    await renameOver(part, folder());
    if (had) await fs.rm(old, { recursive: true, force: true });
  } finally {
    await fs.rm(part, { recursive: true, force: true }).catch(() => {});
  }
}

/** Starts the download when asked (never on its own) and answers at once; the status follows its progress. */
export function installLanguageTool() {
  if (!download) {
    failure = null;
    download = { done: 0, total: downloadBytes() };
    install()
      .catch((err) => { failure = err.statusCode ? err.message : DOWNLOAD_FAILED; })
      .finally(() => { download = null; });
  }
  return languageToolStatus();
}

/** Removes the downloaded LanguageTool and Java. */
export async function removeLanguageTool() {
  if (download) throw httpError('Wait for the download to finish.', 409);
  await stopLanguageTool();
  await fs.rm(root(), { recursive: true, force: true, maxRetries: 5 });
  failure = null;
  return languageToolStatus();
}

// ─── the server ───

let server = null;
let stopped = null;
// a start under way, so a second check while it finds Java and a port waits for it rather than starting another
let starting = null;

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer().on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

/** The server's address once it answers, starting it if it isn't running. */
export function ensureServer() {
  if (server) {
    touch();
    return server.ready;
  }
  starting ||= start().finally(() => { starting = null; });
  return starting;
}

async function start() {
  const java = await installedJava();
  if (!java) throw httpError('LanguageTool is not downloaded yet.', 409, 'not-downloaded');
  const port = await freePort();
  const child = spawn(java, ['-Xmx1g', '-cp', path.join(folder(), 'jars', '*'), 'org.languagetool.server.HTTPServer', '--port', String(port)], {
    cwd: folder(), detached: !WINDOWS, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  const lines = [];
  const keep = (chunk) => {
    lines.push(...String(chunk).split(/\r?\n/).filter(Boolean));
    lines.splice(0, Math.max(0, lines.length - 20));
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const entry = { child, url: `http://127.0.0.1:${port}`, idle: null };
  server = entry;
  stopped = null;
  const exited = new Promise((resolve) => {
    child.on('error', (err) => resolve(`LanguageTool couldn’t start (${err.message}).`));
    child.on('exit', (code, signal) => resolve(`LanguageTool stopped (${signal ? `signal ${signal}` : `exit code ${code}`}).`));
  });
  exited.then((message) => {
    if (server === entry) {
      server = null;
      stopped = { message, details: lines.join('\n') };
    }
  });
  entry.ready = (async () => {
    const deadline = Date.now() + READY_MS;
    while (Date.now() < deadline) {
      const gone = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve(null), 250))]);
      if (gone) throw httpError(gone, 502, 'stopped');
      try {
        const res = await fetch(`${entry.url}/v2/languages`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return entry.url;
      } catch {
        // not listening yet
      }
    }
    killGroup(child);
    throw httpError('LanguageTool took too long to start.', 504, 'stopped');
  })();
  entry.ready.catch(() => {});
  touch();
  return entry.ready;
}

function touch() {
  if (!server) return;
  clearTimeout(server.idle);
  server.idle = setTimeout(() => void stopLanguageTool(), IDLE_MS);
  server.idle.unref?.();
}

/** Stops the server, if it runs; it starts again with the next check. */
export async function stopLanguageTool() {
  const entry = server;
  if (!entry) return;
  server = null;
  clearTimeout(entry.idle);
  const gone = new Promise((resolve) => entry.child.once('exit', resolve));
  killGroup(entry.child);
  await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, 3000))]);
}

/** What Settings shows: the connection, the download, and whether it runs. */
export async function languageToolStatus() {
  const { mode } = await readConnection();
  const java = javaPin();
  return {
    mode,
    version: pins.version,
    java: java?.[3] || null,
    bytes: downloadBytes(),
    javaBytes: java?.[2] || 0,
    installed: !!(await installedJava()),
    downloading: download && { ...download },
    error: failure,
    running: !!server,
    stopped
  };
}

// ─── checking ───

// LanguageTool's categories as the grammar panel's kinds; STYLE and the like show only with style suggestions on
const KINDS = {
  GRAMMAR: 'Grammar', TYPOGRAPHY: 'Formatting', CASING: 'Capitalization', PUNCTUATION: 'Punctuation', TYPOS: 'Spelling',
  COMPOUNDING: 'Spelling', CONFUSED_WORDS: 'WordChoice', COLLOCATIONS: 'WordChoice', FALSE_FRIENDS: 'WordChoice',
  STYLE: 'Style', PLAIN_ENGLISH: 'Style', WIKIPEDIA: 'Style', GENDER_NEUTRALITY: 'Style', REDUNDANCY: 'Redundancy',
  REPETITIONS: 'Repetition', REPETITIONS_STYLE: 'Repetition', NONSTANDARD_PHRASES: 'Nonstandard', SEMANTICS: 'Usage'
};

const PUNCTUATION = /^[.,;:!?)\]]/;

/**
 * LanguageTool's data annotation for one run of a file, from its source and masked prose (the same length): prose
 * that is the source's own text goes as text; each masked stretch goes as markup written as spaces (no LaTeX source
 * is ever sent), read as what the prose has there (x for inline maths, LaTeX for \LaTeX) or nothing, so LaTeX leaves
 * no doubled spaces, and a citation just before punctuation takes the space before it too ("bread \cite{k}." reads
 * "bread."). Every item is as long as the source it stands for, so offsets in the request are offsets in the file.
 */
export function annotate(source, prose, from, to) {
  const items = [];
  let i = from;
  const lastChar = () => {
    const item = items.at(-1);
    return item ? (item.text ?? item.interpretAs).slice(-1) : '';
  };
  while (i < to) {
    const same = source[i] === prose[i];
    let j = i + 1;
    while (j < to && (source[j] === prose[j]) === same) j += 1;
    if (same) {
      items.push({ text: source.slice(i, j) });
    } else {
      let read = prose.slice(i, j).replace(/\s+/g, ' ');
      if (!lastChar() || /\s/.test(lastChar())) read = read.trimStart();
      if (j >= to || /\s/.test(source[j]) || PUNCTUATION.test(source[j])) read = read.trimEnd();
      let length = j - i;
      if (!read && PUNCTUATION.test(source[j] || '') && items.at(-1)?.text) {
        const before = items.at(-1);
        const space = before.text.match(/[ \t]+$/)?.[0].length || 0;
        if (space) {
          before.text = before.text.slice(0, -space);
          if (!before.text) items.pop();
          length += space;
        }
      }
      items.push({ markup: ' '.repeat(length), interpretAs: read });
    }
    i = j;
  }
  return items;
}

const itemLength = (item) => (item.text ?? item.markup).length;

/** The runs (file ranges) cut into parts of at most PART_CHARS, each with its annotation and run table. */
export function parts(source, prose, runs, limit = PART_CHARS) {
  const out = [];
  let current = null;
  for (const [from, to] of runs) {
    if (current && current.length + (to - from) + 2 > limit) current = null;
    if (!current) {
      current = { annotation: [], table: [], length: 0 };
      out.push(current);
    } else {
      current.annotation.push({ markup: '\n\n', interpretAs: '\n\n' });
      current.length += 2;
    }
    current.table.push({ data: current.length, file: from, length: to - from });
    for (const item of annotate(source, prose, from, to)) {
      current.annotation.push(item);
      current.length += itemLength(item);
    }
  }
  return out;
}

/** A match's offsets in the request as file offsets, or null where it crosses from one run into another. */
function toFile(table, offset, length) {
  const run = table.find((r) => offset >= r.data && offset + length <= r.data + r.length);
  return run ? { from: run.file + offset - run.data, to: run.file + offset - run.data + length } : null;
}

/**
 * One language's runs checked by the LanguageTool at server, part by part, stopping between parts when signal aborts.
 * spelt: Hunspell spells the language, so LanguageTool's TYPOS are left out. Answers { issues, parts, done, state,
 * message }, state being checked, cancelled or failed, with the parts already checked kept.
 */
export async function checkWithLanguageTool({ server, source, prose, runs, code, lang, ignored = [], spelt = false, style = false, signal }) {
  const chunks = parts(source, prose, runs);
  const issues = [];
  let done = 0;
  const result = (state, message = '') => ({ issues, parts: chunks.length, done, state, message });
  for (const part of chunks) {
    if (signal?.aborted) return result('cancelled', `Cancelled: ${done} of ${chunks.length} parts checked.`);
    const form = new URLSearchParams({ data: JSON.stringify({ annotation: part.annotation }), language: code });
    if (ignored.length) form.set('disabledRules', ignored.join(','));
    if (spelt) form.set('disabledCategories', 'TYPOS');
    if (style) form.set('level', 'picky');
    let answer;
    try {
      const res = await fetch(`${server}/v2/check`, {
        method: 'POST', body: form, signal: AbortSignal.any([AbortSignal.timeout(PART_MS), ...(signal ? [signal] : [])])
      });
      if (!res.ok) return result('failed', `LanguageTool couldn’t check this (${res.status}: ${(await res.text()).slice(0, 200).trim()}).`);
      answer = await res.json();
    } catch (err) {
      if (signal?.aborted) return result('cancelled', `Cancelled: ${done} of ${chunks.length} parts checked.`);
      if (err?.name === 'TimeoutError') return result('failed', 'LanguageTool took too long to answer.');
      if (err instanceof SyntaxError) return result('failed', 'LanguageTool gave an answer Spectrum couldn’t read.');
      return result('failed', stopped?.message || 'LanguageTool stopped before it finished.');
    }
    for (const match of answer?.matches || []) {
      const at = toFile(part.table, match.offset, match.length);
      if (!at) continue;
      const category = match.rule?.category?.id || '';
      issues.push({
        rule: String(match.rule?.id || 'LANGUAGETOOL'), kind: KINDS[category] || 'Miscellaneous', ...at, message: String(match.message || ''),
        suggestions: (match.replacements || []).slice(0, 5).map((r) => ({ kind: 'replace', text: String(r.value ?? '') })),
        fixable: source.slice(at.from, at.to) === prose.slice(at.from, at.to), engine: 'languagetool', lang
      });
    }
    done += 1;
  }
  return result('checked');
}
