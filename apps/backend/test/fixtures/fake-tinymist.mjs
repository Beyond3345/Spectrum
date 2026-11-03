// A stand-in for Tinymist for test/tinymist.test.js: the LSP's framing on stdin and stdout, a line of JSON in
// FAKE_TINYMIST_LOG for each message it gets, and just enough answers to show the bridge passes them on.
import { appendFileSync } from 'node:fs';
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
  else if (method === 'workspace/executeCommand') send({ id, result: null });
  else if (method === 'shutdown') send({ id, result: null });
  else if (method === 'exit') process.exit(0);
  else if (id !== undefined && method) send({ id, error: { code: -32601, message: `No ${method}` } });
}
