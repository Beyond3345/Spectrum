// The download helper large downloads use instead of fetch (src/utils/download.js). Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { text } from 'node:stream/consumers';
import { get, ok } from '../src/utils/download.js';

const server = http.createServer((req, res) => {
  if (req.url === '/hop') return res.writeHead(302, { location: '/moved' }).end();
  if (req.url === '/moved') return res.writeHead(301, { location: `http://127.0.0.1:${server.address().port}/file` }).end();
  if (req.url === '/file') return res.end('the file');
  if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
  if (req.url === '/slow') {
    res.writeHead(200);
    res.write('part');
    return; // never ends
  }
  res.writeHead(404).end('no');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => {
  server.closeAllConnections();
  server.close();
});

test('follows relative and absolute redirects to the file', async () => {
  const res = await get(`${base}/hop`);
  assert.ok(ok(res));
  assert.equal(await text(res), 'the file');
});

test('answers a failed status for the caller to report', async () => {
  const res = await get(`${base}/missing`);
  assert.equal(ok(res), false);
  assert.equal(res.statusCode, 404);
  res.resume();
});

test('stops after too many redirects', async () => {
  await assert.rejects(get(`${base}/loop`), /Too many redirects/);
});

test('a signal stops the body part-way, and one already aborted stops it before it starts', async () => {
  const controller = new AbortController();
  const res = await get(`${base}/slow`, { signal: controller.signal });
  const reading = text(res);
  setTimeout(() => controller.abort(new Error('stopped')), 50);
  await assert.rejects(reading);
  await assert.rejects(get(`${base}/file`, { signal: AbortSignal.abort() }));
});
