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
 * A message as disk has it, with what the other copy marked on it since: a Spectrum agent thread's proposals applied or
 * rejected there (disk's mark first) and the checkpoints saved with them.
 */
function withMarks(m, twin) {
  const theirs = twin?.meta;
  if (!theirs || typeof theirs !== 'object') return m;
  const meta = m.meta && typeof m.meta === 'object' ? m.meta : {};
  const changes = Array.isArray(meta.changes) ? meta.changes.map((c, i) => {
    const status = c?.status ?? theirs.changes?.[i]?.status;
    return status ? { ...c, status } : c;
  }) : undefined;
  const ids = new Set((Array.isArray(meta.checkpoints) ? meta.checkpoints : []).map((c) => c?.id));
  const more = (Array.isArray(theirs.checkpoints) ? theirs.checkpoints : []).filter((c) => !ids.has(c?.id));
  if (!changes && !more.length) return m;
  return { ...m, meta: { ...meta, ...(changes && { changes }), ...(more.length && { checkpoints: [...(meta.checkpoints || []), ...more] }) } };
}
