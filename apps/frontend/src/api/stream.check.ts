// The window's shared event stream (stream.ts): a StreamSource behaves as an EventSource does, and no other part of
// the app opens a connection of its own for a stream. Run from the repository's root:
//   npx esbuild apps/frontend/src/api/stream.check.ts --bundle --platform=node --format=esm --outfile=/tmp/stream.check.mjs && node /tmp/stream.check.mjs
// the frontend has no Node types
// @ts-expect-error
import assert from 'node:assert/strict';
// @ts-expect-error
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error
import path from 'node:path';
import { StreamHub, StreamSource, readFrame } from './stream';
import type { StreamTransport } from './stream';

// ── a server-sent event's fields ──
assert.deepEqual(readFrame('event: hello\ndata: {"a":1}'), { type: 'hello', data: '{"a":1}', id: undefined, retry: undefined });
assert.deepEqual(readFrame('id: 7\ndata: one\ndata: two'), { type: 'message', data: 'one\ntwo', id: '7', retry: undefined });
assert.deepEqual(readFrame(': ping\nretry: 500'), { type: 'message', data: null, id: undefined, retry: 500 });
assert.equal(readFrame('data:no space').data, 'no space');
assert.equal(readFrame('data:  two spaces').data, ' two spaces');

// ── a page's side, with the backend played here ──
function world() {
  const posts: { path: string; body: any }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let on: { message(data: string): void; error(): void } | null = null;
  const outer = { readyState: 0, close() { this.readyState = 2; } };
  let connects = 0;
  // each post answers when the test lets it, to show a channel's requests go one after another
  const waiting: (() => void)[] = [];
  let hold = false;
  const transport: StreamTransport = {
    connect: (_id, handlers) => { connects += 1; on = handlers; outer.readyState = 0; return outer; },
    post: (p, body) => new Promise<void>((resolve) => { const go = () => { posts.push({ path: p.split('/').pop()!, body }); resolve(); }; if (hold) waiting.push(go); else go(); }),
    timer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    cancel: (t) => { const at = timers.indexOf(t as (typeof timers)[number]); if (at >= 0) timers.splice(at, 1); }
  };
  const hub = new StreamHub(transport);
  const say = (message: unknown) => on!.message(JSON.stringify(message));
  return { hub, posts, timers, outer, say, hello: () => { outer.readyState = 1; say({ hello: true }); }, drop: (gone = false) => { outer.readyState = gone ? 2 : 0; on!.error(); }, connects: () => connects, holdPosts: (v: boolean) => { hold = v; if (!v) while (waiting.length) waiting.shift()!(); }, waiting };
}
const last = <T>(list: T[]) => list[list.length - 1];
const tick = () => new Promise((resolve) => setTimeout(resolve));
const heard = (source: StreamSource) => {
  const log: string[] = [];
  source.onopen = () => log.push('open');
  source.onerror = () => log.push(`error:${source.readyState}`);
  source.onmessage = (e) => log.push(`message:${e.data}:${e.lastEventId}`);
  source.addEventListener('hello', (e) => log.push(`hello:${e.data}`));
  return log;
};

{
  // one connection however many streams; each asked for once the connection says hello
  const w = world();
  const a = new StreamSource('/api/projects/p/events', w.hub);
  const b = new StreamSource('/api/projects/p/lsp', w.hub);
  const logA = heard(a);
  const logB = heard(b);
  await tick();
  assert.equal(w.connects(), 1);
  assert.deepEqual(w.posts, [], 'nothing asked before the connection is there');
  assert.equal(a.readyState, StreamSource.CONNECTING);
  w.hello();
  await tick();
  assert.deepEqual(w.posts.map((p) => [p.path, p.body.channel, p.body.url]), [['open', 1, '/api/projects/p/events'], ['open', 2, '/api/projects/p/lsp']]);
  w.say({ c: 1, status: 200 });
  w.say({ c: 2, status: 200 });
  assert.equal(a.readyState, StreamSource.OPEN);
  // named events and messages go to their own stream, with the last id
  w.say({ c: 2, frame: 'event: hello\ndata: {"client":"x"}' });
  w.say({ c: 2, frame: 'id: 4\ndata: {"jsonrpc":"2.0"}' });
  w.say({ c: 1, frame: 'data: tree' });
  assert.deepEqual(logB, ['open', 'hello:{"client":"x"}', 'message:{"jsonrpc":"2.0"}:4']);
  assert.deepEqual(logA, ['open', 'message:tree:']);

  // the route ended its stream: an error, connecting, then asked for again from the last id after the pause
  w.say({ c: 2, frame: 'retry: 250' });
  w.say({ c: 2, end: true });
  assert.equal(b.readyState, StreamSource.CONNECTING);
  assert.equal(last(logB), 'error:0');
  assert.equal(w.timers.length, 1);
  assert.equal(w.timers[0].ms, 250);
  w.timers.shift()!.fn();
  await tick();
  assert.deepEqual(last(w.posts), { path: 'open', body: { channel: 2, url: '/api/projects/p/lsp', lastEventId: '4' } });
  w.say({ c: 2, status: 200 });
  assert.equal(last(logB), 'open');

  // the connection drops: every stream errors and connects again with it, each from its own last id
  const asked = w.posts.length;
  w.drop();
  assert.equal(a.readyState, StreamSource.CONNECTING);
  assert.equal(last(logA), 'error:0');
  await tick();
  assert.equal(w.posts.length, asked, 'nothing asked while it is down');
  w.hello();
  await tick();
  assert.deepEqual(w.posts.slice(asked).map((p) => [p.path, p.body.channel, p.body.lastEventId]), [['open', 1, ''], ['open', 2, '4']]);
  assert.equal(w.connects(), 1, 'the browser reconnects the one connection itself');

  // closed by the page: the backend is told, and what still arrives for the channel is dropped
  w.say({ c: 1, status: 200 });
  a.close();
  await tick();
  assert.deepEqual(last(w.posts), { path: 'close', body: { channel: 1 } });
  const before = logA.length;
  w.say({ c: 1, frame: 'data: late' });
  assert.equal(logA.length, before);
  assert.equal(a.readyState, StreamSource.CLOSED);
}

{
  // an answer that is not a stream ends it for good, as an EventSource gives up (a run the backend no longer has)
  const w = world();
  const run = new StreamSource('/api/agent/runs/r/events', w.hub);
  const log = heard(run);
  w.hello();
  await tick();
  w.say({ c: 1, status: 404 });
  assert.equal(run.readyState, StreamSource.CLOSED);
  assert.deepEqual(log, ['error:2']);
  assert.equal(w.timers.length, 0, 'not tried again');

  // a stream closed in its own error handler isn't asked for again
  const log2: string[] = [];
  const logStream = new StreamSource('/api/compile/c/log', w.hub);
  logStream.onerror = () => { log2.push('error'); logStream.close(); };
  await tick();
  w.say({ c: 2, status: 200 });
  w.say({ c: 2, end: true });
  assert.equal(w.timers.length, 0);
  assert.deepEqual(log2, ['error']);

  // an event the route names "error" reaches onerror with its data (the arXiv import's)
  const imp = new StreamSource('/api/projects/import-arxiv-sse', w.hub);
  const got: unknown[] = [];
  imp.addEventListener('error', (e) => got.push((e as MessageEvent).data));
  await tick();
  w.say({ c: 3, status: 200 });
  w.say({ c: 3, frame: 'event: error\ndata: {"error":"Invalid arXiv ID."}' });
  assert.deepEqual(got, ['{"error":"Invalid arXiv ID."}']);

  // the connection refused outright (the desktop app's session gone): every stream is over, and a later one starts anew
  const still = new StreamSource('/api/projects/p/events', w.hub);
  w.drop(true);
  assert.equal(still.readyState, StreamSource.CLOSED);
  new StreamSource('/api/projects/p/events', w.hub);
  assert.equal(w.connects(), 2);
}

{
  // a stream opened and closed at once (an effect run twice): its close is sent only after its open has been answered
  const w = world();
  w.holdPosts(true);
  const first = new StreamSource('/api/compile/c/log', w.hub);
  w.hello();
  first.close();
  await tick();
  assert.equal(w.waiting.length, 1, 'only the open is on its way');
  w.holdPosts(false);
  await tick();
  await tick();
  assert.deepEqual(w.posts.map((p) => p.path), ['open', 'close']);
}

// ── every stream of the app goes through the window's one ──
const src = 'apps/frontend/src';
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e: { name: string; isDirectory(): boolean }) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.check\.ts$/.test(e.name) ? [path.join(dir, e.name)] : []));
const own = files(src).filter((file) => /\bnew\s+EventSource\b/.test(readFileSync(file, 'utf8')));
assert.deepEqual(own, [path.join(src, 'api', 'stream.ts')], 'a stream opened with its own EventSource holds a connection of the window’s six: use StreamSource');
// a fetch read as a stream would hold one too
const readers = files(src).filter((file) => /\.body\s*\.\s*getReader\(|\.body\s*\)\s*\.getReader\(/.test(readFileSync(file, 'utf8')));
assert.deepEqual(readers, [], 'a response read as a stream holds a connection for as long as it lasts');

console.log('stream.check: ok');
