// The notice of a newer Spectrum, against a local stand-in for the release page: asked at most once a day, with
// nothing about the user, and only a notice. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'spectrum-update-')));
const asked = [];
let latest = 'v99.1.0';
let down = false;
const server = http.createServer((req, res) => {
  asked.push({ method: req.method, url: req.url, headers: req.headers });
  if (down) return req.socket.destroy();
  res.writeHead(302, { Location: `https://github.com/Beyond3345/Spectrum/releases/tag/${latest}` }).end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(tmp, 'data'), SPECTRUM_UPDATE_URL: `http://127.0.0.1:${server.address().port}/Beyond3345/Spectrum/releases/latest` });
const { newer, updateNotice } = await import('../src/services/updateService.js');
const { APP_VERSION } = await import('../src/config/constants.js');

after(() => {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});

const DAY = 24 * 60 * 60 * 1000;

test('versions compare part by part', () => {
  assert.equal(newer('2.10.0', '2.9.9'), true);
  assert.equal(newer('2.6.0', '2.6.0'), false);
  assert.equal(newer('2.5.9', '2.6.0'), false);
  assert.equal(newer('3.0.0', '2.99.99'), true);
});

test('a newer release is named with its page, and the address is asked once a day', async () => {
  const start = Date.UTC(2026, 10, 20, 9);
  const first = await updateNotice(start);
  assert.deepEqual(first, { available: true, version: '99.1.0', url: 'https://github.com/Beyond3345/Spectrum/releases/tag/v99.1.0' });
  assert.equal(asked.length, 1);
  // the same day, however often: the kept answer
  for (const later of [start + 1000, start + DAY - 1]) assert.deepEqual(await updateNotice(later), first);
  assert.equal(asked.length, 1);
  // the next day it is asked again, and a release the same as this one isn't news
  latest = `v${APP_VERSION}`;
  assert.deepEqual(await updateNotice(start + DAY), { available: false });
  assert.equal(asked.length, 2);
  // a clock put back is asked again rather than trusting a date from the future
  latest = 'v99.2.0';
  assert.equal((await updateNotice(start)).version, '99.2.0');
  assert.equal(asked.length, 3);
});

test('the request says nothing about the user, the computer or a project', async () => {
  asked.length = 0;
  await updateNotice(Date.UTC(2026, 10, 21, 10));
  assert.equal(asked.length, 1);
  const [{ method, url, headers }] = asked;
  assert.equal(method, 'HEAD');
  assert.equal(url, '/Beyond3345/Spectrum/releases/latest');
  // only what any fetch sends; no cookie, no version, no name
  const allowed = new Set(['host', 'connection', 'accept', 'accept-language', 'sec-fetch-mode', 'user-agent', 'accept-encoding']);
  assert.deepEqual(Object.keys(headers).filter((name) => !allowed.has(name)), []);
  const said = JSON.stringify(headers);
  for (const private_ of [APP_VERSION, os.userInfo().username, os.hostname(), os.homedir()]) assert.ok(!said.includes(private_), `sent ${private_}`);
});

test('offline is no notice, and counts as the day’s ask', async () => {
  asked.length = 0;
  down = true;
  const at = Date.UTC(2026, 10, 23);
  assert.deepEqual(await updateNotice(at), { available: false });
  assert.deepEqual(await updateNotice(at + 60_000), { available: false });
  assert.equal(asked.length, 1);
  down = false;
});

test('an answer that is not a release tag is no notice', async () => {
  latest = 'v99.0.0/../../evil';
  assert.deepEqual(await updateNotice(Date.UTC(2026, 10, 25)), { available: false });
});
