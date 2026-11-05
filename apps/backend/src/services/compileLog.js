// A running compile's output as it comes, by the id the editor gave the compile, for the editor to show while
// Tectonic downloads and runs. The engine goes first, then the output in chunks, and a status line of Spectrum's own
// ('' when there's none) while it downloads something itself; a listener that arrives late gets the engine, the last
// BUFFER_CHARS of output and the status first. Nothing is kept once the compile ends.
const BUFFER_CHARS = 64_000;
// a listener that comes before its compile (the editor saves first) waits this long for it
const WAIT_MS = 60_000;
const logs = new Map();

const entry = (compileId) => {
  let log = logs.get(compileId);
  if (!log) logs.set(compileId, (log = { started: false, engine: null, status: '', chunks: [], size: 0, listeners: new Set(), timer: null }));
  return log;
};

/** The compile has started: what it sends now reaches its listeners. */
export function openLog(compileId) {
  const log = entry(compileId);
  log.started = true;
  clearTimeout(log.timer);
  log.timer = null;
  return log;
}

/** Sends an event ('engine', 'output' or 'status') to the compile's listeners, and keeps it for those who come later. */
export function sendLog(log, event, data) {
  if (!log) return;
  if (event === 'engine') log.engine = data;
  else if (event === 'status') log.status = data;
  else {
    log.chunks.push(data);
    log.size += data.length;
    while (log.size > BUFFER_CHARS && log.chunks.length > 1) log.size -= log.chunks.shift().length;
  }
  for (const listener of log.listeners) listener(event, data);
}

/** The compile has ended: its listeners hear 'end' and nothing of it is kept. */
export function closeLog(compileId) {
  const log = logs.get(compileId);
  if (!log) return;
  logs.delete(compileId);
  clearTimeout(log.timer);
  for (const listener of log.listeners) listener('end', {});
}

/** Calls listener(event, data) with what the compile sent so far and what it sends next; returns the unsubscribe. */
export function listenLog(compileId, listener) {
  const log = entry(compileId);
  if (log.engine) listener('engine', log.engine);
  if (log.chunks.length) listener('output', log.chunks.join(''));
  if (log.status) listener('status', log.status);
  log.listeners.add(listener);
  if (!log.started) {
    clearTimeout(log.timer);
    log.timer = setTimeout(() => closeLog(compileId), WAIT_MS);
    log.timer.unref();
  }
  return () => {
    log.listeners.delete(listener);
    // nobody waits any more for a compile that hasn't come
    if (!log.started && !log.listeners.size && logs.get(compileId) === log) closeLog(compileId);
  };
}

/** The ids with something kept, for tests. */
export const keptLogs = () => [...logs.keys()];
