import { getProjectRoot, httpError } from '../services/projectService.js';
import { connectClient, fromClient, projectDiagnostics, texlabSession } from '../services/texlabService.js';

// The editor's line to the project's TexLab (services/texlabService.js): JSON-RPC down an event stream and up by POST.
export function registerTexlabRoutes(fastify) {
  // First `hello` with the editor's client id and the project's root URI, then each message of TexLab's as data. 503
  // without TexLab, which tells an EventSource not to try again; when TexLab stops, the stream ends and it reconnects.
  fastify.get('/api/projects/:id/lsp', async (req, reply) => {
    await getProjectRoot(req.params.id);
    const session = await texlabSession(req.params.id);
    if (!session) return reply.code(503).send({ ok: false, available: false, error: 'TexLab isn’t available.' });
    reply.hijack();
    // the editor went away while TexLab started
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

  // ?client= from hello; the body is one message or a list of them, sent to TexLab in order
  fastify.post('/api/projects/:id/lsp', async (req) => {
    const session = await texlabSession(req.params.id);
    if (!session) throw httpError('TexLab isn’t available.', 503);
    fromClient(session, String(req.query?.client || ''), req.body);
    return { ok: true };
  });

  // { ok, available, files: { [path]: [{ line, col, endLine, endCol, severity, message, code?, source }] } }, lines and
  // columns from 1, once TexLab has caught up with the latest edit
  fastify.get('/api/projects/:id/diagnostics', async (req) => {
    await getProjectRoot(req.params.id);
    return { ok: true, ...(await projectDiagnostics(req.params.id)) };
  });
}
