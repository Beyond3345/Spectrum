/**
 * chat with the messages `disk` has that it lacks: disk's first, then chat's new ones, as chats only ever gain
 * messages. For two copies of one chat continued apart (saved from an older copy, or on two computers between
 * syncs); the rest of the chat is chat's.
 */
export function mergeChat(disk, chat) {
  const key = (m) => JSON.stringify([m?.role, m?.createdAt, m?.content]);
  const there = new Set(disk.messages.map(key));
  const added = (Array.isArray(chat.messages) ? chat.messages : []).filter((m) => !there.has(key(m)));
  // later than the copy sent, so a save made from that copy merges too
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(chat.updatedAt) + 1 || 0)).toISOString();
  return { ...chat, messages: [...disk.messages, ...added], updatedAt };
}
