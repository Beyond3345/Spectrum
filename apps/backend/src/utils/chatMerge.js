/**
 * chat with the messages `disk` has that it lacks: disk's first, then chat's new ones, as chats only ever gain
 * messages. For two copies of one chat continued apart (saved from an older copy, or on two computers between
 * syncs); the rest of the chat is chat's, but a copy on disk marked as a Spectrum agent thread stays one.
 */
export function mergeChat(disk, chat) {
  const key = (m) => JSON.stringify([m?.role, m?.createdAt, m?.content]);
  const incoming = Array.isArray(chat.messages) ? chat.messages : [];
  const twins = new Map(incoming.map((m) => [key(m), m]));
  const there = new Set(disk.messages.map(key));
  const added = incoming.filter((m) => !there.has(key(m)));
  // later than the copy sent, so a save made from that copy merges too
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(chat.updatedAt) + 1 || 0)).toISOString();
  return { ...chat, ...(disk.agent === true && { agent: true }), messages: [...disk.messages.map((m) => withMarks(m, twins.get(key(m)))), ...added], updatedAt };
}

/**
 * A message as disk has it, with what the other copy marked on it since: a Spectrum agent thread's proposals applied,
 * rejected or superseded there, by file (disk's mark first), and the checkpoints saved with them. A closed proposal is
 * in `closed`, or for a thread saved by an earlier 2.0 build, in `changes` with its status.
 */
function withMarks(m, twin) {
  const theirs = twin?.meta;
  if (!theirs || typeof theirs !== 'object') return m;
  const meta = m.meta && typeof m.meta === 'object' ? m.meta : {};
  const list = (value) => (Array.isArray(value) ? value : []);
  const changes = list(meta.changes);
  const closed = [...list(meta.closed)];
  for (const c of [...list(theirs.closed), ...list(theirs.changes).filter((c) => c?.status)]) {
    const open = changes.find((d) => d?.filePath === c?.filePath && !d.status);
    if (open && !closed.some((d) => d?.filePath === c.filePath)) closed.push({ filePath: c.filePath, status: c.status });
  }
  const shut = closed.length - list(meta.closed).length;
  const ids = new Set(list(meta.checkpoints).map((c) => c?.id));
  const more = list(theirs.checkpoints).filter((c) => !ids.has(c?.id));
  if (!shut && !more.length) return m;
  const next = { ...meta, ...(more.length && { checkpoints: [...list(meta.checkpoints), ...more] }) };
  if (shut) {
    const left = changes.filter((c) => c?.status || !closed.some((d) => d.filePath === c?.filePath));
    next.closed = closed;
    if (left.length) next.changes = left;
    else delete next.changes;
  }
  return { ...m, meta: next };
}
