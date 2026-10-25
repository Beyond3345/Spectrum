import { useCallback, useEffect, useState } from 'react';
import { deleteChat, listChats } from '../api/client';
import type { ChatSummary } from '../api/client';
import Icon from '../app/Icon';
import { confirmDialog } from '../app/Dialogs';
import { useEditor } from './EditorContext';
import { CHATS_CHANGED, PROJECT_DATA_CHANGED, errorText, relativeTime } from './shared';

/** Saved conversations of this project, in the bottom card's history menu; agent threads are the workspace's. */
export default function ChatsList({
  activeChatId,
  filter,
  onOpen,
  onNew,
  refreshSignal
}: {
  activeChatId: string | null;
  filter: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  refreshSignal: number;
}) {
  const { projectId, notify } = useEditor();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);

  const refresh = useCallback(() => {
    listChats(projectId)
      // Spectrum agent threads are the agent workspace's
      .then((res) => setChats((res.chats || []).filter((chat) => !chat.agent)))
      .catch((err) => {
        setChats([]);
        notify(`Couldn’t load chats: ${errorText(err)}`, 'error');
      });
    // notify is a fresh function on every editor render, so it stays out of the deps
  }, [projectId]);

  useEffect(refresh, [refresh, refreshSignal]);

  // and after a pull from GitHub brought chats in
  useEffect(() => {
    window.addEventListener(CHATS_CHANGED, refresh);
    window.addEventListener(PROJECT_DATA_CHANGED, refresh);
    return () => {
      window.removeEventListener(CHATS_CHANGED, refresh);
      window.removeEventListener(PROJECT_DATA_CHANGED, refresh);
    };
  }, [refresh]);

  const remove = async (chat: ChatSummary) => {
    const ok = await confirmDialog({
      title: `Delete “${chat.title || 'Untitled chat'}”?`,
      message: 'The conversation is removed from this project. When the project is on GitHub, its history there keeps the earlier copies.',
      confirmLabel: 'Delete',
      destructive: true
    });
    if (!ok) return;
    try {
      await deleteChat(projectId, chat.id);
      if (chat.id === activeChatId) onNew();
      refresh();
    } catch (err) {
      notify(`Couldn’t delete the chat: ${errorText(err)}`, 'error');
    }
  };

  const needle = filter.trim().toLowerCase();
  const shown = (chats || []).filter((chat) => !needle || chat.title.toLowerCase().includes(needle));

  if (chats && !shown.length) {
    return (
      <div className="chats-empty">
        <span>{needle ? 'No matching chats' : 'No chats yet'}</span>
        {!needle && (
          <button className="btn small" onClick={onNew}>
            <Icon name="plus.bubble" /> New chat
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="chats-list" role="list">
      {shown.map((chat) => (
        <div
          key={chat.id}
          role="listitem"
          tabIndex={0}
          className={`chat-row ${chat.id === activeChatId ? 'active' : ''}`}
          onClick={() => onOpen(chat.id)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen(chat.id)}
        >
          <Icon name={chat.mode === 'references' ? 'quote.opening' : 'sparkles'} className="chat-row-icon" />
          <span className="chat-row-title">{chat.title || 'Untitled chat'}</span>
          <span className="chat-row-time">{relativeTime(chat.updatedAt)}</span>
          <button
            className="icon-btn chat-row-delete"
            title="Delete chat"
            aria-label="Delete chat"
            onClick={(e) => {
              e.stopPropagation();
              remove(chat);
            }}
          >
            <Icon name="xmark" />
          </button>
        </div>
      ))}
    </div>
  );
}
