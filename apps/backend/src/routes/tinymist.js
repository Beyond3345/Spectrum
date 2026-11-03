import { getProjectRoot, httpError } from '../services/projectService.js';
import { connectClient, fromClient, jumpToPdf, jumpToSource, tinymistSession } from '../services/tinymistService.js';

// The editor's line to the project's Tinymist (services/tinymistService.js), as the lsp route is to TexLab's: JSON-RPC
// down an event stream and up by POST, and the jumps between the PDF and the source through its hidden preview.
export function registerTinymistRoutes(fastify) {
  // First `hello` with the editor's client id and the project's root URI, then each message of Tinymist's as data. 503
  // without Tinymist, which tells an EventSource not to try again; when Tinymist stops, the stream ends and it reconnects.
  fastify.get('/api/projects/:id/tinymist', async (req, reply) => {
    await getProjectRoot(req.params.id);
    const session = await tinymistSession(req.params.id);
    if (!session) return reply.code(503).send({ ok: false, available: false, error: 'Tinymist isn’t available.' });
    reply.hijack();
    // the editor went away while Tinymist started
    if (reply.raw.destroyed) return reply;
    const out = reply.raw;
    const send = (text) => !out.writableEnded && !out.destroyed && out.write(text);
    out.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const client = connectClient(session, (message) => send(`data: ${JSON.stringify(message)}\n\n`), () => out.end());
    send(`event: hello\ndata: ${JSON.stringify({ client: client.id, rootUri: client.rootUri })}\n\n`);
    const ping = setInterval(() => send(': ping\n\n'), 30_000);
    out.on('close', () => {
      clearInterval(ping);
      client.end();
    });
    return reply;
  });

  // ?client= from hello; the body is one message or a list of them, sent to Tinymist in order
  fastify.post('/api/projects/:id/tinymist', async (req) => {
    const session = await tinymistSession(req.params.id);
    if (!session) throw httpError('Tinymist isn’t available.', 503);
    fromClient(session, String(req.query?.client || ''), req.body);
    return { ok: true };
  });

  // PDF → source: { doc, page, x, y } (points from the page's top-left) → { ok, file, line, column }, ok false for a spot
  // with nothing there
  fastify.post('/api/projects/:id/tinymist/source', async (req) => {
    const { doc, page, x, y } = req.body || {};
    const found = await jumpToSource(req.params.id, String(doc || ''), { page, x, y });
    return found ? { ok: true, ...found } : { ok: false };
  });

  // source → PDF: { doc, file, line, column } (from 1) → { ok, page, x, y }, y on the baseline
  fastify.post('/api/projects/:id/tinymist/pdf', async (req) => {
    const { doc, file, line, column } = req.body || {};
    const found = await jumpToPdf(req.params.id, String(doc || ''), { file: String(file || ''), line, column });
    return found ? { ok: true, ...found } : { ok: false };
  });
}
