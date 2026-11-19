// The desktop app's launch secret: with one set, the API answers only a request that carries it in the session
// cookie, and the secret is never written to the log or sent in an answer. Real server processes, throwaway folders.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { readSessionSecret } from '../src/utils/authUtils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-session-')));
const servers = [];
after(() => {
  for (const { child } of servers) child.kill();
  rmSync(tmp, { recursive: true, force: true });
});

/** A server with its own folders; `secret` reaches it in the environment, or on stdin as the shell sends it. */
async function start(name, secret, { stdin = false, wait = true } = {}) {
  const dir = path.join(tmp, name);
  for (const sub of ['home', 'data', 'projects', 'templates', 'dist']) mkdirSync(path.join(dir, sub), { recursive: true });
  writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html><title>Spectrum</title>');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const { SPECTRUM_SESSION_SECRET: _secret, SPECTRUM_SESSION_STDIN: _stdin, ...env } = process.env;
  const child = spawn(process.execPath, [path.join(here, '..', 'src', 'index.js')], {
    env: {
      ...env,
      HOME: path.join(dir, 'home'),
      USERPROFILE: path.join(dir, 'home'),
      PORT: String(port),
      SPECTRUM_HOST: '127.0.0.1',
      SPECTRUM_DATA_DIR: path.join(dir, 'data'),
      SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects'),
      SPECTRUM_TEMPLATE_DIR: path.join(dir, 'templates'),
      SPECTRUM_TEMPLATE_SEED_DIR: '',
      SPECTRUM_FRONTEND_DIST: path.join(dir, 'dist'),
      ...(stdin ? { SPECTRUM_SESSION_STDIN: '1' } : secret ? { SPECTRUM_SESSION_SECRET: secret } : {})
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const server = { child, port, output: '' };
  servers.push(server);
  child.stdout.on('data', (chunk) => (server.output += chunk));
  child.stderr.on('data', (chunk) => (server.output += chunk));
  if (stdin && secret !== null) child.stdin.write(`${secret}\n`);
  for (let i = 0; wait && i < 100 && child.exitCode === null; i += 1) {
    // the static page needs no cookie, so it says the server is up whatever the secret
    if ((await get(server, '/').catch(() => null))?.status === 200) return server;
    await new Promise((r) => setTimeout(r, 100));
  }
  return server;
}

// named for the port, so two copies of Spectrum on one computer keep their own
const name = ({ port }) => `spectrum_session_${port}`;
const get = ({ port }, url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  request({ port, host: '127.0.0.1', path: url, headers, method }, (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject).end();
});

test('with a secret, the API answers only the window that carries it', async () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const server = await start('env', secret);
  const answers = [];
  const ask = async (...args) => {
    const res = await get(server, ...args);
    answers.push(res);
    return res;
  };

  assert.equal((await ask('/api/health')).status, 403);
  assert.equal((await ask('/api/health', { cookie: `${name(server)}=` })).status, 403);
  assert.equal((await ask('/api/health', { cookie: `${name(server)}=${crypto.randomBytes(32).toString('hex')}` })).status, 403);
  assert.equal((await ask('/api/health', { cookie: `${name(server)}=${secret.slice(0, -1)}` })).status, 403);
  // the secret under another name, or as a header of another kind, is not the cookie
  assert.equal((await ask('/api/health', { cookie: `spectrum_session=${secret}; spectrum_session_${server.port + 1}=${secret}` })).status, 403);
  assert.equal((await ask('/api/health', { cookie: `other=${secret}`, authorization: `Bearer ${secret}` })).status, 403);
  // however the path is spelt, and whatever the method
  assert.equal((await ask('/%61pi/projects')).status, 403);
  assert.equal((await ask('/api/projects', { 'content-type': 'text/plain' }, 'POST')).status, 403);
  const refused = await ask('/api/projects');
  assert.equal(refused.status, 403);
  assert.equal(JSON.parse(refused.body).code, 'session');

  const cookie = `theme=dark; ${name(server)}=${secret}`;
  assert.equal((await ask('/api/health', { cookie })).status, 200);
  assert.equal((await ask('/api/projects', { cookie })).status, 200);
  // the cookie does not excuse a page of another program or another site
  assert.equal((await ask('/api/projects', { cookie, origin: 'http://localhost:3000' })).status, 403);
  assert.equal((await ask('/api/projects', { cookie, 'sec-fetch-site': 'cross-site' })).status, 403);

  // the app's page itself needs no cookie, so it can say what is wrong
  assert.equal((await ask('/projects')).status, 200);

  // a window's first request: the right secret becomes an HttpOnly, SameSite=Strict cookie for this session only
  const opened = await get(server, `/session?t=${secret}&next=${encodeURIComponent('/open?path=%2Ftmp%2Fa+b%C3%A9.tex')}`);
  assert.equal(opened.status, 302);
  assert.equal(opened.headers.location, '/open?path=%2Ftmp%2Fa+b%C3%A9.tex');
  assert.equal((await get(server, `/session?t=${secret}&next=${encodeURIComponent('/open?path=/tmp/a bé.tex')}`)).headers.location, '/open?path=/tmp/a%20b%C3%A9.tex');
  assert.deepEqual(opened.headers['set-cookie'], [`${name(server)}=${secret}; Path=/; HttpOnly; SameSite=Strict`]);
  // a wrong one sets nothing and still lands on the app, which shows its message
  const wrong = await ask(`/session?t=${'0'.repeat(64)}&next=/projects`);
  assert.equal(wrong.status, 302);
  assert.equal(wrong.headers['set-cookie'], undefined);
  assert.equal((await ask('/session')).headers['set-cookie'], undefined);
  // and it only ever sends the window to a page of the app
  for (const next of ['//evil.example/', '/\\evil.example', 'https://evil.example/', '']) {
    assert.equal((await get(server, `/session?t=${secret}&next=${encodeURIComponent(next)}`)).headers.location, '/projects', next);
  }

  // nothing the server wrote or sent to a caller without the secret holds it
  assert.match(server.output, /incoming request/);
  assert.ok(!server.output.includes(secret), 'the secret is in the log');
  for (const res of answers) assert.ok(!JSON.stringify([res.headers, res.body]).includes(secret), 'the secret is in an answer');
});

test('the shell’s secret comes on stdin, and a shell that sends none stops the server', async () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const server = await start('stdin', secret, { stdin: true });
  assert.equal((await get(server, '/api/health')).status, 403);
  assert.equal((await get(server, '/api/health', { cookie: `${name(server)}=${secret}` })).status, 200);
  assert.ok(!server.output.includes(secret));

  const silent = await start('silent', null, { stdin: true, wait: false });
  const exited = new Promise((resolve) => silent.child.once('exit', resolve));
  // not listening while it waits
  await new Promise((r) => setTimeout(r, 1500));
  await assert.rejects(get(silent, '/'));
  silent.child.stdin.end('too-short\n');
  assert.equal(await exited, 1);
});

test('the secret leaves the environment as it is read, so no child process inherits it', async () => {
  const env = { SPECTRUM_SESSION_SECRET: 'from-the-environment' };
  assert.equal(await readSessionSecret(env), 'from-the-environment');
  assert.deepEqual(env, {});
  assert.equal(await readSessionSecret({}), '');

  const stdin = new PassThrough();
  const reading = readSessionSecret({ SPECTRUM_SESSION_STDIN: '1', SPECTRUM_SESSION_SECRET: 'ignored' }, stdin);
  stdin.write('a'.repeat(40));
  stdin.write('bcd\nlater lines are not the secret\n');
  assert.equal(await reading, `${'a'.repeat(40)}bcd`);
});

test('without a secret the API is open to this computer as before, and there is no session address', async () => {
  const server = await start('open', '');
  assert.equal((await get(server, '/api/health')).status, 200);
  const res = await get(server, '/session?t=x&next=/projects');
  assert.equal(res.status, 200);
  assert.match(res.body, /<title>Spectrum<\/title>/);
});
