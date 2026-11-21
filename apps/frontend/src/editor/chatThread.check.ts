// Self-check for telling an Edit chat from before 2.0 from an Assistant chat with Polish or Translate changes. Run:
// npx esbuild apps/frontend/src/editor/chatThread.check.ts --bundle --platform=node --log-level=warning | node
import { assistantSaid, isEditChat } from './chatThread';
import type { ChatMessage } from '../api/client';

const at = '2026-11-17T00:00:00.000Z';
const user = (content: string): ChatMessage => ({ role: 'user', content, createdAt: at });
const reply = (meta?: Record<string, unknown>): ChatMessage => ({ role: 'assistant', content: 'Done.', createdAt: at, ...(meta && { meta }) });
const change = [{ filePath: 'main.tex', proposed: 'x' }];
const check = (actual: boolean, expected: boolean, what: string) => {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};

check(isEditChat([user('Tighten the method'), reply({ changes: change })]), true, 'an Edit chat from before 2.0');
check(isEditChat([user('Polish the selection'), reply({ changes: change, quick: true })]), false, 'a Polish result');
check(isEditChat([user('What does eq. 1 mean?'), reply()]), false, 'a question');
check(isEditChat([user('Edit'), reply({ changes: [] })]), false, 'no changes');

// a rewrite with nothing the user must know says nothing: its change stands alone, with no chat message
const said = (actual: string, expected: string, what: string) => {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
said(assistantSaid({ ok: true, reply: '' }, false, true), '', 'a rewrite with an empty reply');
said(assistantSaid({ ok: true, reply: '  ' }, false, true), '', 'a reply of spaces is empty');
said(assistantSaid({ ok: true, reply: 'The last sentence was left: it is a quotation.' }, false, true), 'The last sentence was left: it is a quotation.', 'something the user must know');
said(assistantSaid({ ok: true, reply: '' }, false, false), 'No changes were suggested.', 'a rewrite that changed nothing says so');
said(assistantSaid({ ok: true, reply: '' }, true, false), 'No reply.', 'a chat answer is never silent');
said(assistantSaid({ ok: false, reply: 'Overloaded.' }, false, true), 'The request failed part-way: Overloaded. The changes made before it are ready to review.', 'a failure');

console.log('chatThread.check: ok');
