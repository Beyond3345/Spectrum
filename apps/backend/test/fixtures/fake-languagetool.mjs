// A stand-in for LanguageTool's HTTP server: GET /v2/languages, and POST /v2/check flagging every "teh" and "das das"
// in the text items of the request's data annotation, at offsets over the whole data (markup included), as
// LanguageTool counts them. Run as `node fake-languagetool.mjs --port N` (what Spectrum starts in place of Java), or
// imported for its handler. FAKE_LT_LOG names a file each request is appended to, as a line of JSON.
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

export function languageToolHandler({ log = process.env.FAKE_LT_LOG, requests = [], answer } = {}) {
  return (req, res) => {
    if (req.method === 'GET' && req.url === '/v2/languages') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([{ name: 'German', code: 'de', longCode: 'de-DE' }]));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v2/check') return void res.writeHead(404).end();
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      const form = Object.fromEntries(new URLSearchParams(body));
      requests.push(form);
      if (log) appendFileSync(log, `${JSON.stringify(form)}\n`);
      if (answer) return answer(form, res);
      const { annotation } = JSON.parse(form.data);
      const matches = [];
      let at = 0;
      for (const item of annotation) {
        if (item.text !== undefined) {
          for (const m of item.text.matchAll(/\bteh\b|\bdas das\b/g)) {
            matches.push({ message: `Possible typo: ${m[0]}`, offset: at + m.index, length: m[0].length,
              replacements: [{ value: m[0] === 'teh' ? 'the' : 'das' }], rule: { id: m[0] === 'teh' ? 'TEH' : 'DOPPELTES_WORT', category: { id: 'GRAMMAR' } } });
          }
        }
        at += (item.text ?? item.markup).length;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ software: { version: '6.8' }, matches }));
    });
  };
}

const flag = process.argv.indexOf('--port');
if (flag > 0) {
  const server = createServer(languageToolHandler());
  server.listen(Number(process.argv[flag + 1]), '127.0.0.1');
  process.on('SIGTERM', () => process.exit(0));
}
