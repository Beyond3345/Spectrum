// One event stream for each window (routes/stream.js): how many connections a window holds at its busiest, and that
// each channel behaves as the route's own stream would. Over real sockets, with the six connections a browser and
// the desktop app's WebKit allow one host; stand-ins for TexLab, Tinymist and the engine, so no TeX is needed.
// Run: node --test apps/backend/test/stream.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WINDOWS = process.platform === 'win32';
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-stream-')));
const realPath = process.env.PATH;
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_TEXLAB: fixture('fake-texlab.mjs'),
  FAKE_TEXLAB_LOG: path.join(tmp, 'texlab.log'),
  SPECTRUM_TINYMIST: fixture('fake-tinymist.mjs'),
  FAKE_TINYMIST_LOG: path.join(tmp, 'tinymist.log')
});
const { createProject } = await import('../src/services/projectService.js');
const { registerProjectRoutes } = await import('../src/routes/projects.js');
const { registerCompileRoutes } = await import('../src/routes/compile.js');
const { registerTexlabRoutes } = await import('../src/routes/texlab.js');
const { registerTinymistRoutes } = await import('../src/routes/tinymist.js');
const { registerStreamRoutes, openStreams } = await import('../src/routes/stream.js');
const { stopTexlab } = await import('../src/services/texlabService.js');
const { stopTinymist } = await import('../src/services/tinymistService.js');
const { default: Fastify } = await import('fastify');

// a pdflatex that takes a second and a half, long enough for a save to land while it runs
const bin = path.join(tmp, 'bin');
await fs.mkdir(bin);
await fs.writeFile(path.join(bin, 'pdflatex'), [
  '#!/bin/sh',
  'for a in "$@"; do case "$a" in -output-directory=*) out="${a#-output-directory=}";; esac; done',
  'echo "This is fake TeX"',
  'sleep 1.5',
  'echo "This is fake TeX" > "$out/main.log"',
  "printf '%%PDF-1.4\\n%%%%EOF\\n' > \"$out/main.pdf\"",
  ''
].join('\n'), { mode: 0o755 });
process.env.PATH = [bin, '/usr/bin', '/bin'].join(path.delimiter);

const app = Fastify();
// as the desktop app's hook does: every request of a window carries its cookie, a channel's own request too
app.addHook('onRequest', async (req, reply) => {
  if (req.headers.cookie !== 'spectrum_session=test') return reply.code(403).send({ ok: false, error: 'No session.' });
});
registerProjectRoutes(app);
registerCompileRoutes(app);
registerTexlabRoutes(app);
registerTinymistRoutes(app);
registerStreamRoutes(app);
// An agent's run and a local agent's session, which need a model or an agent to exist: streams of the same shape
// (numbered events, kept from the last id on, a ping), held open until the page closes them.
// ponytail: stand-ins; agent-runs.test.js and agent-sessions.test.js cover the real routes' own events
const held = { open: 0, lastIds: [] };
for (const route of ['/api/agent/runs/:id/events', '/api/agent-sessions/:id/events']) {
  app.get(route, async (req, reply) => {
    if (req.params.id === 'gone') return reply.code(404).send({ ok: false, error: 'No such run.' });
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream' });
    held.open += 1;
    held.lastIds.push(req.headers['last-event-id'] ?? null);
    const after = Number(req.headers['last-event-id'] || 0);
    for (const id of [1, 2, 3]) if (id > after) reply.raw.write(`id: ${id}\ndata: ${JSON.stringify({ id, text: 'héllo €' })}\n\n`);
    reply.raw.write(': ping\n\n');
    if (req.params.id === 'ends') reply.raw.end();
    reply.raw.on('close', () => (held.open -= 1));
    return reply;
  });
}
await app.listen({ port: 0, host: '127.0.0.1' });
const { port } = app.server.address();

after(async () => {
  await stopTexlab();
  await stopTinymist();
  await app.close();
  process.env.PATH = realPath;
  rmSync(tmp, { recursive: true, force: true });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const connections = () => new Promise((resolve) => app.server.getConnections((err, count) => resolve(count)));

/** A page, as far as its connections go: every request through one agent that allows six sockets to the host. */
function page() {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 6 });
  const request = (method, url, body) => new Promise((resolve, reject) => {
    const started = Date.now();
    const req = http.request({ agent, port, host: '127.0.0.1', method, path: url, headers: { cookie: 'spectrum_session=test', ...(body !== undefined && { 'content-type': 'application/json' }) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode, json: () => JSON.parse(text), ms: Date.now() - started }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  /** A stream held open: { events (each event's lines as one text), status (a promise), close }. */
  const stream = (url) => {
    const events = [];
    let resolve;
    const status = new Promise((r) => (resolve = r));
    const req = http.request({ agent, port, host: '127.0.0.1', path: url, headers: { cookie: 'spectrum_session=test', accept: 'text/event-stream' } }, (res) => {
      resolve(res.statusCode);
      let pending = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        const parts = (pending + chunk).split('\n\n');
        pending = parts.pop();
        events.push(...parts.filter((part) => !part.startsWith(':')));
      });
      res.on('error', () => {});
    });
    req.on('error', () => {});
    req.end();
    return { events, status, close: () => req.destroy() };
  };
  // the connections with a request on them now (one kept for the next request isn't held)
  const held = () => Object.values(agent.sockets).flat().length;
  return { request, stream, held, close: () => agent.destroy() };
}
const windowId = (n) => String(n).padStart(32, '0');
/** The window's stream, with what came down it as objects, and its channels' requests. */
async function windowStream(p, id) {
  const outer = p.stream(`/api/stream/${id}`);
  assert.equal(await outer.status, 200);
  const sent = () => outer.events.map((event) => JSON.parse(event.replace(/^data: /, '')));
  const of = (channel) => sent().filter((m) => m.c === channel);
  const until = async (fn, what) => {
    for (let i = 0; i < 400; i += 1) {
      if (fn()) return;
      await sleep(10);
    }
    assert.fail(`waited for ${what}: ${JSON.stringify(sent()).slice(0, 600)}`);
  };
  await until(() => sent().some((m) => m.hello), 'hello');
  return {
    sent,
    of,
    until,
    open: (channel, url, lastEventId) => p.request('POST', `/api/stream/${id}/open`, { channel, url, lastEventId }),
    closeChannel: (channel) => p.request('POST', `/api/stream/${id}/close`, { channel }),
    close: outer.close
  };
}
const projectWith = () => createProject({
  name: 'Streams',
  populate: async (root) => {
    await fs.writeFile(path.join(root, 'main.tex'), '\\documentclass{article}\\begin{document}x\\end{document}\n');
    await fs.writeFile(path.join(root, 'notes.typ'), '= Notes\n');
  }
});
// what a window has open at its busiest: the project's events, TexLab, Tinymist, the Spectrum agent's run, a local
// agent's session and a compile's log
const streamsOf = (id, compileId) => [
  `/api/projects/${id}/events`,
  `/api/projects/${id}/lsp`,
  `/api/projects/${id}/tinymist`,
  '/api/agent/runs/run-1/events',
  '/api/agent-sessions/session-1/events',
  `/api/compile/${compileId}/log`
];
const compileBody = (p, compileId) => ({ projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex', compileId });
const save = (p, client) => client.request('PUT', `/api/projects/${p.id}/file`, { path: 'main.tex', content: `\\documentclass{article}\\begin{document}saved ${Date.now()}\\end{document}\n` });

test('at its busiest a window holds two connections, and a save made during a compile is not kept waiting', { skip: WINDOWS && 'a shell script stands in for the engine' }, async () => {
  const p = await projectWith();
  const client = page();
  try {
    const before = await connections();
    const win = await windowStream(client, windowId(1));
    const urls = streamsOf(p.id, 'compile-one');
    for (const [i, url] of urls.entries()) assert.equal((await win.open(i + 1, url)).status, 200);
    for (const i of urls.keys()) await win.until(() => win.of(i + 1).some((m) => m.status === 200), `channel ${i + 1} to open`);
    // the six streams and nothing else: one connection
    await sleep(100);
    assert.deepEqual(openStreams(), { windows: 1, channels: 6 });
    // (the requests that opened the channels are over; their connections are kept for the next request, not held)
    const compile = client.request('POST', '/api/compile', compileBody(p, 'compile-one'));
    await win.until(() => win.of(6).some((m) => /fake TeX/.test(m.frame || '')), 'the compile’s output on its log');
    const saved = await save(p, client);
    assert.equal(saved.status, 200);
    assert.ok(saved.ms < 500, `the save took ${saved.ms} ms`);
    // held for as long as they last: the window's stream and the compile's own request, of the six allowed
    assert.equal(client.held(), 2);
    const compiled = await compile;
    assert.ok(compiled.ms > 1000 && compiled.json().ok, 'the compile was still running when the save came back');
    await win.until(() => win.of(6).some((m) => m.end), 'the log to end');
    assert.ok((await connections()) - before <= 6, 'never more than a browser allows');
  } finally {
    client.close();
  }
  await sleep(100);
  assert.deepEqual(openStreams(), { windows: 0, channels: 0 }, 'a window that goes takes its channels with it');
});

test('with a connection for each stream, as before, the same save waits for the compile to end', { skip: WINDOWS && 'a shell script stands in for the engine' }, async () => {
  const p = await projectWith();
  const client = page();
  try {
    const streams = streamsOf(p.id, 'compile-two').slice(0, 4).map((url) => client.stream(url));
    for (const s of streams) assert.equal(await s.status, 200);
    // the compile's request and its log take the fifth and sixth
    const compile = client.request('POST', '/api/compile', compileBody(p, 'compile-two'));
    const log = client.stream('/api/compile/compile-two/log');
    await log.status;
    const saved = await save(p, client);
    assert.ok(saved.ms > 1000, `the save came back in ${saved.ms} ms`);
    await compile;
    for (const s of streams) s.close();
  } finally {
    client.close();
  }
});

test('a channel is the route’s own stream: its events whole, its answer, its end, and the page’s own headers', async () => {
  const client = page();
  try {
    const win = await windowStream(client, windowId(2));
    // numbered events, with text beyond ASCII, and none of the route's pings
    await win.open(1, '/api/agent/runs/run-1/events');
    await win.until(() => win.of(1).length === 4, 'three events');
    assert.deepEqual(win.of(1), [{ c: 1, status: 200 }, ...[1, 2, 3].map((id) => ({ c: 1, frame: `id: ${id}\ndata: ${JSON.stringify({ id, text: 'héllo €' })}` }))]);
    // opened again from the last event the page had, as an EventSource asks
    await win.open(2, '/api/agent-sessions/session-1/events', '2');
    await win.until(() => win.of(2).length === 2, 'the event after the second');
    assert.equal(win.of(2)[1].frame.split('\n')[0], 'id: 3');
    assert.equal(held.lastIds.at(-1), '2');
    assert.equal(held.open, 2);
    // closed by the page: the route hears it, and nothing more is said of the channel
    await win.closeChannel(1);
    await win.until(() => held.open === 1, 'the route to hear the close');
    assert.equal(win.of(1).some((m) => m.end), false);
    // a stream the route ends, and an answer that is no stream at all
    await win.open(3, '/api/agent/runs/ends/events');
    await win.until(() => win.of(3).some((m) => m.end), 'the end');
    await win.open(4, '/api/agent/runs/gone/events');
    await win.until(() => win.of(4).length === 1, 'the answer');
    assert.deepEqual(win.of(4), [{ c: 4, status: 404 }]);
    assert.equal(openStreams().channels, 1);
    // a channel opened under a number in use takes its place
    await win.open(2, '/api/agent/runs/run-2/events');
    await win.until(() => win.of(2).filter((m) => m.status).length === 2, 'the second stream on the channel');
    assert.equal(held.open, 1);

    // only this server's own routes, never the window's stream itself, and only on a stream that is connected
    for (const url of ['http://example.com/x', '/projects', `/api/stream/${windowId(2)}`, '/api/x y']) assert.equal((await win.open(9, url)).status, 400, url);
    assert.equal((await client.request('POST', `/api/stream/${windowId(3)}/open`, { channel: 1, url: '/api/agent/runs/run-1/events' })).status, 409);
    assert.equal((await client.request('GET', '/api/stream/not-a-window')).status, 400);
    win.close();
    await win.until(() => held.open === 0, 'every channel to close with the window');
  } finally {
    client.close();
  }
  // without the page's cookie neither the stream nor a channel is answered
  const stranger = await new Promise((resolve) => http.get({ port, host: '127.0.0.1', path: `/api/stream/${windowId(4)}` }, (res) => resolve(res.statusCode)));
  assert.equal(stranger, 403);
});
