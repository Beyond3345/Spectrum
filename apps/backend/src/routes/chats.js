import { promises as fs } from 'fs';
import path from 'path';
import { appPath, getProjectRoot, httpError } from '../services/projectService.js';
import { readJson, writeFileAtomic } from '../utils/fsUtils.js';

const CHAT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_CHAT_BYTES = 5 * 1024 * 1024;

async function chatFile(req) {
  const { id, cid } = req.params;
  const root = await getProjectRoot(id);
  if (!CHAT_ID.test(String(cid || ''))) throw httpError('Invalid chat id.', 400);
  return appPath(root, 'chats', `${cid}.json`);
}

export function registerChatRoutes(fastify) {
  fastify.get('/api/projects/:id/chats', async (req) => {
    const dir = appPath(await getProjectRoot(req.params.id), 'chats');
    const chats = [];
    for (const name of await fs.readdir(dir).catch(() => [])) {
      if (!name.endsWith('.json')) continue;
      try {
        const chat = await readJson(path.join(dir, name));
        // each chat is its own file, and two computers' chats have different ids; a sync app's conflict copy
        // of one (the same chat continued on both) isn't listed twice
        if (name !== `${chat.id}.json`) continue;
        chats.push({
          id: chat.id,
          title: chat.title || 'Untitled chat',
          mode: chat.mode === 'references' ? 'references' : 'assistant',
          updatedAt: chat.updatedAt || chat.createdAt || '',
          messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0
        });
      } catch {
        // half-written or hand-edited file
      }
    }
    chats.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return { ok: true, chats };
  });

  fastify.get('/api/projects/:id/chats/:cid', async (req) => {
    const file = await chatFile(req);
    try {
      return { ok: true, chat: await readJson(file) };
    } catch {
      throw httpError('Chat not found.', 404);
    }
  });

  // base: the updatedAt of the copy this chat was made from. Saved since (on another computer, say), the
  // messages there stay and this copy's new ones go after them, as chats only ever gain messages; the
  // answer then has the chat as saved.
  fastify.put('/api/projects/:id/chats/:cid', async (req) => {
    const file = await chatFile(req);
    let chat = req.body?.chat;
    if (!chat || typeof chat !== 'object' || chat.id !== req.params.cid) {
      throw httpError('The chat’s id doesn’t match the address.', 400);
    }
    // ponytail: a copy that can't be read (online-only and offline) is replaced, as before
    const disk = await readJson(file).catch(() => null);
    const merged = disk?.id === chat.id && Array.isArray(disk.messages) && disk.updatedAt !== req.body.base;
    if (merged) {
      const key = (m) => JSON.stringify([m?.role, m?.createdAt, m?.content]);
      const there = new Set(disk.messages.map(key));
      const added = (Array.isArray(chat.messages) ? chat.messages : []).filter((m) => !there.has(key(m)));
      // later than the copy sent, so a save made from that copy merges too
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(chat.updatedAt) + 1 || 0)).toISOString();
      chat = { ...chat, messages: [...disk.messages, ...added], updatedAt };
    }
    const data = JSON.stringify(chat);
    if (Buffer.byteLength(data) > MAX_CHAT_BYTES) throw httpError('This chat is too large to save (over 5 MB).', 413);
    await writeFileAtomic(file, data);
    return { ok: true, ...(merged && { chat }) };
  });

  fastify.delete('/api/projects/:id/chats/:cid', async (req) => {
    await fs.rm(await chatFile(req), { force: true });
    return { ok: true };
  });
}
