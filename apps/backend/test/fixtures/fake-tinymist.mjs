// A stand-in for Tinymist for test/tinymist.test.js: the LSP's framing on stdin and stdout, a line of JSON in
// FAKE_TINYMIST_LOG for each message it gets, and just enough answers to show the bridge passes them on.
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const log = (entry) => appendFileSync(process.env.FAKE_TINYMIST_LOG, `${JSON.stringify(entry)}\n`);
const send = (message) => {
  const body = JSON.stringify({ jsonrpc: '2.0', ...message });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};

log({ args: process.argv.slice(2), cwd: process.cwd(), cache: process.env.TYPST_PACKAGE_CACHE_PATH });
let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const end = buffer.indexOf('\r\n\r\n');
    if (end < 0) return;
    const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, end).toString())[1]);
    if (buffer.length < end + 4 + length) return;
    const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString());
    buffer = buffer.subarray(end + 4 + length);
    log(message);
    handle(message);
  }
});

function handle({ id, method, params }) {
  if (method === 'initialize') {
    send({ id, result: { capabilities: { hoverProvider: true, completionProvider: { triggerCharacters: ['#', '@'] } }, serverInfo: { name: 'Fake Tinymist' } } });
  } else if (method === 'initialized') {
    // a request of its own, and notifications the editor sees or doesn't
    send({ id: 'config-1', method: 'workspace/configuration', params: { items: [{ section: 'tinymist' }] } });
    send({ method: 'window/logMessage', params: { type: 3, message: 'started' } });
    send({ method: 'tinymist/documentOutline', params: { items: [] } });
  } else if (method === 'workspace/executeCommand' && params.command === 'tinymist.pinMain') {
    // the main document's check, which finds something in a chapter no editor has open yet
    const chapter = new URL('chapter.typ', pathToFileURL(params.arguments[0])).href;
    send({ method: 'textDocument/publishDiagnostics', params: { uri: chapter, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, message: 'unknown variable' }] } });
    send({ id, result: null });
  } else if (method === 'textDocument/didOpen' || method === 'textDocument/didChange') {
    const text = params.textDocument.text ?? params.contentChanges.at(-1).text;
    const words = text.split(/\s+/).filter(Boolean).length;
    send({ method: 'tinymist/compileStatus', params: { status: 'compileSuccess', path: '/main.typ', pageCount: 1, wordsCount: { words, chars: text.length, cjkChars: 0, spaces: 0 } } });
  } else if (method === 'textDocument/hover') send({ id, result: { contents: `Hover at ${params.position.line}:${params.position.character}` } });
  else if (method === 'workspace/executeCommand' && params.command === 'tinymist.doStartPreview') {
    // a preview as Tinymist 0.15 serves it: one port for its page and its data plane, a page of its own origin with no
    // frame headers, whose script connects back to its own address; the data plane takes a WebSocket and says nothing
    const page = http.createServer((req, res) => {
      log({ preview: 'page', url: req.url, host: req.headers.host });
      res.end('<!doctype html><title>Fake preview</title><script>new WebSocket(new URL("/", location.href).href.replace("http", "ws"))</script>');
    });
    page.on('upgrade', (req, socket) => {
      log({ preview: 'connected', origin: req.headers.origin });
      const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    });
    page.listen(0, '127.0.0.1', () => send({ id, result: { dataPlanePort: page.address().port, staticServerPort: page.address().port } }));
  } else if (method === 'workspace/executeCommand') send({ id, result: null });
  else if (method === 'shutdown') send({ id, result: null });
  else if (method === 'exit') process.exit(0);
  else if (id !== undefined && method) send({ id, error: { code: -32601, message: `No ${method}` } });
}
