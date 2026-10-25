// A stand-in for TexLab for test/texlab.test.js: the LSP's framing on stdin and stdout, a line of JSON in
// FAKE_TEXLAB_LOG for each message it gets, and just enough answers to show the bridge passes them on.
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const log = (entry) => appendFileSync(process.env.FAKE_TEXLAB_LOG, `${JSON.stringify(entry)}\n`);
const send = (message) => {
  const body = JSON.stringify({ jsonrpc: '2.0', ...message });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};
const diagnose = (uri, text) => {
  const open = (text.match(/\{/g) || []).length - (text.match(/\}/g) || []).length;
  send({
    method: 'textDocument/publishDiagnostics',
    params: {
      uri,
      diagnostics: open
        ? [{ range: { start: { line: 1, character: 4 }, end: { line: 1, character: 5 } }, severity: 1, code: 2, source: 'texlab', message: 'Expecting a curly bracket: "}"' }]
        : []
    }
  });
};

let root = '';
log({ path: process.env.PATH, args: process.argv.slice(2), cwd: process.cwd() });
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
    root = params.rootUri;
    send({ id, result: { capabilities: { hoverProvider: true, renameProvider: true, textDocumentSync: { openClose: true, change: 2 } }, serverInfo: { name: 'Fake TexLab' } } });
  } else if (method === 'initialized') {
    // a request of its own, a log line the editor never sees, and the project's diagnostics
    send({ id: 'config-1', method: 'workspace/configuration', params: { items: [{ section: 'texlab' }] } });
    send({ method: 'window/logMessage', params: { type: 3, message: 'started' } });
    // Reproduce TexLab discovering only the spelling used by an \input on a case-insensitive disk.
    if (process.env.FAKE_TEXLAB_CASE_ALIAS) diagnose(`${root}/Chapters/Intro.tex`, '{');
    send({
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: `${root}/main.tex`,
        diagnostics: [
          { range: { start: { line: 2, character: 0 }, end: { line: 3, character: 15 } }, severity: 1, code: 3, source: 'texlab', message: 'Mismatched environment' },
          { range: { start: { line: 5, character: 7 }, end: { line: 5, character: 12 } }, severity: 4, code: 9, source: 'texlab', message: 'Unused label' }
        ]
      }
    });
    send({ method: 'textDocument/publishDiagnostics', params: { uri: 'file:///elsewhere/other.tex', diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, message: 'Not in the project' }] } });
  } else if (method === 'workspace/didChangeWatchedFiles' && process.env.FAKE_TEXLAB_CASE_ALIAS) {
    for (const { uri } of params.changes) {
      if (!uri.endsWith('/chapters/intro.tex')) continue;
      setTimeout(() => {
        diagnose(uri, readFileSync(fileURLToPath(uri), 'utf8'));
        // This entry is never reread by TexLab; it keeps publishing its original text's marks.
        diagnose(`${root}/Chapters/Intro.tex`, '{');
      }, 100);
    }
  } else if (method === 'textDocument/didOpen') diagnose(params.textDocument.uri, params.textDocument.text);
  else if (method === 'textDocument/didChange') diagnose(params.textDocument.uri, params.contentChanges.at(-1).text);
  else if (method === 'textDocument/hover') send({ id, result: { contents: { kind: 'plaintext', value: `Hover at ${params.position.line}:${params.position.character}` } } });
  else if (method === 'shutdown') send({ id, result: null });
  else if (method === 'exit') process.exit(0);
  else if (id !== undefined && method) send({ id, error: { code: -32601, message: `No ${method}` } });
}
