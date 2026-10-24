import { useRef, useState } from 'react';
import { saveChat } from '../api/client';
import type { ChatMessage, ChatThread } from '../api/client';
import { CHATS_CHANGED, errorText } from './shared';

export const newChatId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const chatMessage = (role: ChatMessage['role'], content: string, meta?: object): ChatMessage => ({
  role,
  content,
  createdAt: new Date().toISOString(),
  ...(meta ? { meta: meta as Record<string, unknown> } : null)
});

/**
 * The open chat of the bottom card or the Spectrum agent: shown, added to and saved in order, so a reply that lands
 * after the user switched chats still goes in its own chat. fresh: a new chat's own fields (its mode, its marker).
 */
export function useChatThread({
  projectId,
  notify,
  fresh,
  onCreate
}: {
  projectId: string;
  notify(message: string, tone?: 'info' | 'success' | 'error'): void;
  fresh(): Partial<ChatThread>;
  /** a chat was started by the first message added to none */
  onCreate?(id: string): void;
}) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const threadRef = useRef<ChatThread | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  // async callers read the newest props, not the ones from when they started
  const latest = useRef({ projectId, notify, fresh, onCreate });
  latest.current = { projectId, notify, fresh, onCreate };

  const show = (next: ChatThread | null) => {
    threadRef.current = next;
    setThread(next);
  };

  /** from: the copy next was made from, so the server can tell when another computer saved the chat since. */
  const save = (next: ChatThread, from: ChatThread) => {
    const { projectId: id, notify: say } = latest.current;
    saveChain.current = saveChain.current
      .then(() => saveChat(id, next, from.updatedAt))
      .then((res) => {
        // with what another computer added: shown unless there's more here since
        if (res.chat && threadRef.current === next) show(res.chat);
        window.dispatchEvent(new Event(CHATS_CHANGED));
      })
      .catch((err) => say(`Couldn’t save the chat: ${errorText(err)}`, 'error'));
  };

  /** Adds messages to a chat (starting a new one when base is null), saves it and shows it if it's still open. */
  const append = (base: ChatThread | null, ...messages: ChatMessage[]) => {
    const now = new Date().toISOString();
    // the open copy is the newest, with any other computer's messages a save brought in
    const newest = base && threadRef.current?.id === base.id ? threadRef.current : base;
    const start: ChatThread = newest ?? { id: newChatId(), title: '', mode: 'assistant', createdAt: now, updatedAt: now, messages: [], ...latest.current.fresh() };
    const next = { ...start, updatedAt: now, messages: [...start.messages, ...messages] };
    if (!next.title) {
      const first = next.messages.find((m) => m.role === 'user')?.content.trim() || '';
      next.title = first.length > 60 ? `${first.slice(0, 59)}…` : first;
    }
    if (!base) {
      show(next);
      latest.current.onCreate?.(next.id);
    } else if (threadRef.current?.id === next.id) {
      show(next);
    } else {
      latest.current.notify(`Reply added to “${next.title}”`);
    }
    save(next, start);
    return next;
  };

  /** Changes a saved chat (owner: as it was when the action started; the user may have switched chats since). */
  const update = (owner: ChatThread, change: (chat: ChatThread) => ChatThread) => {
    const current = threadRef.current?.id === owner.id ? threadRef.current : owner;
    const next = { ...change(current), updatedAt: new Date().toISOString() };
    if (current === threadRef.current) show(next);
    save(next, current);
    return next;
  };

  return { thread, threadRef, show, append, update };
}
