import { StringDecoder } from 'string_decoder';

// One event stream for each window. A browser, and the desktop app's WebKit, allow six connections to the backend,
// and every server-sent stream holds one for as long as it lasts: the project's events, TexLab, Tinymist, an agent's
// run, a local agent's session and a compile's log, with the compile's own request, used all six, and a save made
// meanwhile waited for the compile to end. So a window holds one stream, GET /api/stream/<window>, and asks for the
// others as channels on it, each with a short request: open { channel, url, lastEventId } and close { channel }.
// A channel is the route at url itself, reached inside the server (fastify.inject) with the asking request's own
// headers, so it is checked and answered exactly as it would be over a connection of its own. Down the window's
// stream go, as JSON: { hello } first, then for a channel c { c, status } (the route's answer: anything but 200 is
// the end of it), { c, frame } (one event of the route's stream, as the route wrote it) and { c, end } (the route
// ended its stream). The page's side is api/stream.ts.

const windows = new Map();
const WINDOW = /^[0-9a-f]{32}$/;
// never sent on to a channel's own request: the asking request's body, and what a stream's request has of its own
const NOT_FORWARDED = new Set(['content-length', 'content-type', 'transfer-encoding', 'connection', 'accept', 'last-event-id', 'expect']);
const MAX_CHANNELS = 64;

/** The streams held open now, for the tests: { windows, channels }. */
export const openStreams = () => ({ windows: windows.size, channels: [...windows.values()].reduce((n, w) => n + w.channels.size, 0) });

export function registerStreamRoutes(fastify) {
  fastify.get('/api/stream/:window', async (req, reply) => {
    const id = req.params.window;
    if (!WINDOW.test(id)) return reply.code(400).send({ ok: false, error: 'Invalid window.' });
    reply.hijack();
    const out = reply.raw;
    out.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    // the page connected again while the old connection was still thought open: that one's channels end with it
    windows.get(id)?.end();
    const channels = new Map();
    const win = {
      channels,
      send: (message) => !out.writableEnded && !out.destroyed && out.write(`data: ${JSON.stringify(message)}\n\n`),
      end() {
        if (windows.get(id) === win) windows.delete(id);
        for (const close of [...channels.values()]) close();
        channels.clear();
        if (!out.writableEnded) out.end();
      }
    };
    windows.set(id, win);
    win.send({ hello: true });
    const ping = setInterval(() => !out.writableEnded && out.write(': ping\n\n'), 25_000);
    out.on('close', () => {
      clearInterval(ping);
      win.end();
    });
    return reply;
  });

  const windowOf = (req, reply) => {
    const win = windows.get(req.params.window);
    // the stream isn't connected (the backend restarted): the page opens its channels again once it is
    if (!win) reply.code(409).send({ ok: false, error: 'This window’s stream isn’t connected.' });
    return win;
  };

  fastify.post('/api/stream/:window/open', async (req, reply) => {
    const win = windowOf(req, reply);
    if (!win) return reply;
    const { channel, url, lastEventId } = req.body || {};
    // a route of this server's own, and never a stream of streams
    if (!Number.isInteger(channel) || typeof url !== 'string' || !/^\/api\/(?!stream\/)[^\s]*$/.test(url) || (!win.channels.has(channel) && win.channels.size >= MAX_CHANNELS)) {
      return reply.code(400).send({ ok: false, error: 'Invalid channel.' });
    }
    win.channels.get(channel)?.();
    let closed = false;
    let inner = null;
    const close = () => {
      closed = true;
      // the route hears its stream close, as it does when a connection drops
      inner?.raw.res.destroy();
    };
    win.channels.set(channel, close);
    const mine = () => win.channels.get(channel) === close;
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !NOT_FORWARDED.has(name)));
    fastify.inject({
      method: 'GET',
      url,
      headers: { ...headers, accept: 'text/event-stream', ...(typeof lastEventId === 'string' && lastEventId && { 'last-event-id': lastEventId }) },
      remoteAddress: req.socket.remoteAddress,
      payloadAsStream: true
    }).then((res) => {
      inner = res;
      const stream = res.stream();
      // closing it ends the stream with an error of the injection's own
      stream.on('error', () => {});
      if (closed) return close();
      win.send({ c: channel, status: res.statusCode });
      if (res.statusCode !== 200) {
        stream.resume();
        if (mine()) win.channels.delete(channel);
        return;
      }
      const decoder = new StringDecoder('utf8');
      let pending = '';
      stream.on('data', (chunk) => {
        if (closed) return;
        const frames = (pending + decoder.write(chunk)).split(/\r\n\r\n|\n\n|\r\r/);
        pending = frames.pop();
        // a comment alone (a route's ping) keeps nothing alive here: the window's stream has its own
        for (const frame of frames) if (/^(?!:)./m.test(frame)) win.send({ c: channel, frame });
      });
      stream.on('close', () => {
        if (!mine()) return;
        win.channels.delete(channel);
        win.send({ c: channel, end: true });
      });
    }, () => {
      if (mine()) win.channels.delete(channel);
      if (!closed) win.send({ c: channel, status: 500 });
    });
    return { ok: true };
  });

  fastify.post('/api/stream/:window/close', async (req, reply) => {
    const win = windowOf(req, reply);
    if (!win) return reply;
    const close = win.channels.get(req.body?.channel);
    win.channels.delete(req.body?.channel);
    close?.();
    return { ok: true };
  });
}
