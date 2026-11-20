// Test connection (the provider's model list, never a message) against servers on this computer that answer as each
// provider documents, and the chat request's plain words for a connection that never answered. No network: a name
// under .invalid fails as the system's lookup would, before the no-network guard sees it. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { testConnection } from '../src/services/modelCheck.js';
import { BAD_KEY, chatCompletion, unreachable } from '../src/services/llmService.js';

const GOOD = 'sk-good-key-123';
const seen = [];
let server;
let base;
// the first connection of each test is reset when set
let resetNext = false;
let resets = 0;
/** The next new connection is reset as it opens; kept-alive ones are closed first, so the next request opens one. */
const resetFirst = async () => {
  server.closeIdleConnections();
  await new Promise((resolve) => setTimeout(resolve, 50));
  resets = 0;
  resetNext = true;
};

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const bearer = (req) => req.headers.authorization === `Bearer ${GOOD}`;

before(async () => {
  server = http.createServer((req, res) => {
    seen.push({ method: req.method, path: req.url, auth: req.headers.authorization, xkey: req.headers['x-api-key'], version: req.headers['anthropic-version'] });
    const url = req.url;
    // OpenAI, DeepSeek and the other …/models lists that check the key
    if (url === '/v1/models' || url === '/models') return bearer(req) ? send(res, 200, { object: 'list', data: [{ id: 'gpt-6-sol', object: 'model' }, { id: 'gpt-6-luna', object: 'model' }, { id: 'house-model', object: 'model' }] }) : send(res, 401, { error: { message: 'Incorrect API key provided', code: 'invalid_api_key' } });
    // Anthropic: x-api-key and a version, one page of up to 1000
    if (url === '/v1/models?limit=1000') {
      if (req.headers['x-api-key'] !== GOOD || !req.headers['anthropic-version']) return send(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      return send(res, 200, { data: [{ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' });
    }
    // Gemini's compatible layer: ids under models/, and a bad key as a 400 that names it
    if (url === '/v1beta/openai/models') return bearer(req) ? send(res, 200, { object: 'list', data: [{ id: 'models/gemini-3.8-flash', object: 'model', owned_by: 'google' }] }) : send(res, 400, [{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }]);
    // OpenRouter: a public list, and the key checked at /key
    if (url === '/api/v1/models') return send(res, 200, { data: [{ id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5' }, { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna' }] });
    if (url === '/api/v1/key') return bearer(req) ? send(res, 200, { data: { label: 'sk-or…', usage: 0, limit: null } }) : send(res, 401, { error: { code: 401, message: 'User not found.' } });
    // Ollama Cloud: public tags, the key checked at /api/balance
    if (url === '/api/tags') return send(res, 200, { models: [{ name: 'kimi-k3', model: 'kimi-k3' }, { name: 'gemma4:31b', model: 'gemma4:31b' }] });
    if (url === '/api/balance') return bearer(req) ? send(res, 200, { purchased: { balance_usd: 0 } }) : send(res, 401, { error: 'unauthorized' });
    // a provider that answers models with the key it was sent
    if (url === '/echo/models') return send(res, 500, { error: { message: `bad gateway for ${req.headers.authorization}` } });
    // a server on this computer that takes no key
    if (url === '/local/v1/models') return send(res, 200, { object: 'list', data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    if (url === '/v1/chat/completions') return send(res, 200, { choices: [{ message: { role: 'assistant', content: 'Hello' } }] });
    // Z.ai and the like: no list
    send(res, 404, { error: 'Not Found' });
  });
  server.on('connection', (socket) => {
    if (!resetNext) return;
    resetNext = false;
    resets += 1;
    socket.resetAndDestroy();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const check = (provider, endpoint, apiKey = GOOD) => {
  seen.length = 0;
  return testConnection({ provider, endpoint, apiKey });
};
const noChat = () => assert.ok(seen.every((r) => r.method === 'GET' && !/chat|messages|responses/.test(r.path)), 'only GETs of a list, never a message');

test('OpenAI and the other Chat Completions lists: connected with the count, and a bad key refused', async () => {
  const ok = await check('openai', `${base}/v1/chat/completions`);
  assert.deepEqual([ok.ok, ok.kind, ok.models], [true, 'connected', ['gpt-6-sol', 'gpt-6-luna', 'house-model']]);
  assert.match(ok.message, /^Connected to 127\.0\.0\.1:\d+\. It accepted the key, and OpenAI offers 3 models\.$/);
  assert.equal(seen[0].auth, `Bearer ${GOOD}`);
  noChat();
  // DeepSeek's address has no /v1
  const deep = await check('deepseek', `${base}/chat/completions`);
  assert.equal(deep.models.length, 3);
  assert.equal(seen[0].path, '/models');

  const bad = await check('openai', `${base}/v1/chat/completions`, 'sk-wrong-key-999');
  assert.deepEqual([bad.ok, bad.kind], [false, 'key']);
  assert.match(bad.message, /refused the key \(HTTP 401\)/);
  assert.equal(bad.models, undefined);
  // a preset with regions says the key may belong to another
  assert.match((await check('moonshot', `${base}/v1/chat/completions`, 'sk-wrong-key-999')).message, /made in this region/);
});

test('Anthropic: x-api-key and a version header, and the list of Messages API models', async () => {
  const ok = await check('anthropic', `${base}/v1/messages`);
  assert.deepEqual([ok.ok, ok.models], [true, ['claude-opus-5-5']]);
  assert.match(ok.message, /Anthropic Claude offers 1 model\.$/);
  assert.deepEqual([seen[0].xkey, seen[0].version, seen[0].auth], [GOOD, '2023-06-01', undefined]);
  noChat();
  assert.equal((await check('anthropic', `${base}/v1/messages`, 'sk-wrong-key-999')).kind, 'key');
  // a server Spectrum has no preset for, named by its …/messages address
  assert.equal((await check('custom', `${base}/v1/messages`)).kind, 'connected');
});

test('Gemini: models/ is taken off the ids, and its 400 for a bad key is a refused key', async () => {
  const ok = await check('gemini', `${base}/v1beta/openai/chat/completions`);
  assert.deepEqual(ok.models, ['gemini-3.8-flash']);
  const bad = await check('gemini', `${base}/v1beta/openai/chat/completions`, 'sk-wrong-key-999');
  assert.deepEqual([bad.kind, /HTTP 400/.test(bad.message)], ['key', true]);
});

test('a public list: OpenRouter and Ollama Cloud check the key at their free key and balance requests', async () => {
  const ok = await check('openrouter', `${base}/api/v1/chat/completions`);
  assert.deepEqual([ok.ok, ok.models.length], [true, 2]);
  assert.deepEqual(seen.map((r) => [r.path, r.auth]), [['/api/v1/models', undefined], ['/api/v1/key', `Bearer ${GOOD}`]], 'the list without the key, the key at /key');
  const bad = await check('openrouter', `${base}/api/v1/chat/completions`, 'sk-wrong-key-999');
  assert.deepEqual([bad.ok, bad.kind, bad.models.length], [false, 'key', 2], 'refused, with the public list still offered');

  const cloud = await check('ollama-cloud', `${base}/v1/chat/completions`);
  assert.deepEqual([cloud.ok, cloud.models], [true, ['kimi-k3', 'gemma4:31b']]);
  assert.deepEqual(seen.map((r) => r.path), ['/api/tags', '/api/balance']);
  assert.equal((await check('ollama-cloud', `${base}/v1/chat/completions`, 'sk-wrong-key-999')).kind, 'key');
  noChat();
});

test('no list at the address: the server was reached, and nothing more is claimed', async () => {
  const glm = await check('glm', `${base}/api/paas/v4/chat/completions`);
  assert.deepEqual([glm.ok, glm.kind], [false, 'nolist']);
  assert.match(glm.message, /answered, but it has no model list at this address \(HTTP 404\)\. The server was reached; Spectrum can’t check the key or the model further without sending a message\./);
  noChat();
  // a Responses API server lists beside its address
  assert.equal((await check('custom', `${base}/v1/responses`)).kind, 'connected');
  // a local server with no key is asked without one
  const local = await check('custom', `${base}/local/v1`, '');
  assert.deepEqual([local.kind, seen[0].auth], ['connected', undefined]);
  assert.match(local.message, /^Connected to 127\.0\.0\.1:\d+, which offers 3 models\.$/);
});

test('a key is never sent with a character no header carries, and never comes back', async () => {
  // a trailing line break is trimmed off, so the key works
  const trimmed = await check('openai', `${base}/v1/chat/completions`, `${GOOD}\n`);
  assert.equal(trimmed.kind, 'connected');
  assert.equal(seen[0].auth, `Bearer ${GOOD}`);
  for (const key of ['sk-good\nkey-123', 'sk-good’key-123', 'sk-good key-123']) {
    const res = await check('openai', `${base}/v1/chat/completions`, key);
    assert.deepEqual([res.kind, res.message, seen.length], ['header', BAD_KEY, 0], JSON.stringify(key));
    const chat = await chatCompletion({ apiKey: key, endpoint: `${base}/v1/chat/completions`, model: 'm', messages: [{ role: 'user', content: 'Hi' }] });
    assert.deepEqual([chat.error, seen.length], [BAD_KEY, 0], 'nor in a chat, and not tried again');
  }
  // a server that repeats the key in its error: never shown
  const echo = await check('custom', `${base}/echo/chat/completions`);
  assert.equal(echo.kind, 'error');
  assert.ok(!echo.message.includes(GOOD) && echo.message.includes('[API key]'), echo.message);
  assert.equal((await check('openai', '', '')).message, 'Paste the API key first.');
});

test('a connection reset before any answer is tried again, in the test and in a chat, which says the connection dropped', async () => {
  await resetFirst();
  const ok = await check('openai', `${base}/v1/chat/completions`);
  assert.deepEqual([ok.kind, resets], ['connected', 1]);

  await resetFirst();
  const tries = [];
  const chat = await chatCompletion({ apiKey: GOOD, endpoint: `${base}/v1/chat/completions`, model: 'm', messages: [{ role: 'user', content: 'Hi' }], onRetry: (r) => tries.push(r) });
  assert.equal(chat.message.content, 'Hello');
  assert.deepEqual([chat.retries, resets], [1, 1]);
  assert.deepEqual(tries, [{ attempt: 2, of: 3, waitMs: 1000, streamed: false, dropped: true }]);

  // reset every time: the cause in plain words, never the endpoint to check
  const always = (socket) => socket.resetAndDestroy();
  server.closeIdleConnections();
  await new Promise((resolve) => setTimeout(resolve, 50));
  server.on('connection', always);
  try {
    const lost = await chatCompletion({ apiKey: GOOD, endpoint: `${base}/v1/chat/completions`, model: 'm', messages: [{ role: 'user', content: 'Hi' }], retries: 1 });
    assert.match(lost.error, /^The connection to 127\.0\.0\.1:\d+ was dropped before it answered, which a VPN or an unsteady network can do\. Try again\. Spectrum tried 2 times\.$/);
  } finally {
    server.off('connection', always);
  }
});

test('a name that does not resolve, and a refused connection, each say so and are not mistaken for each other', async () => {
  // the system's lookup failing, as net reports it, without asking any name server
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const host = typeof first === 'object' && first?.host;
    if (host && /\.invalid$/i.test(host)) {
      queueMicrotask(() => this.destroy(Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND', syscall: 'getaddrinfo', hostname: host })));
      return this;
    }
    return connect.apply(this, args);
  };
  try {
    const name = await check('custom', 'https://api.spectrum-test.invalid/v1');
    assert.deepEqual([name.ok, name.kind], [false, 'name']);
    assert.equal(name.message, 'The name api.spectrum-test.invalid couldn’t be found. Check the endpoint in Settings › Models, and your internet or VPN connection.');
    const chat = await chatCompletion({ apiKey: GOOD, endpoint: 'https://api.spectrum-test.invalid/v1', model: 'm', messages: [{ role: 'user', content: 'Hi' }], retries: 0 });
    assert.match(chat.error, /^The name api\.spectrum-test\.invalid couldn’t be found\./);
  } finally {
    net.Socket.prototype.connect = connect;
  }
  // a port nothing listens on
  const closed = net.createServer();
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const port = closed.address().port;
  await new Promise((resolve) => closed.close(resolve));
  const refused = await check('custom', `http://127.0.0.1:${port}/v1`, '');
  assert.deepEqual([refused.kind, refused.message], ['refused', `127.0.0.1:${port} refused the connection. Check the endpoint in Settings › Models, and that the server is running.`]);
  assert.equal(seen.length, 0);
});

test('the causes undici reports, read from cause and from each address an AggregateError tried', () => {
  const failed = (cause) => Object.assign(new TypeError('fetch failed'), { cause });
  const coded = (code) => Object.assign(new Error(code), { code });
  assert.equal(unreachable(failed(coded('ECONNRESET')), 'h').kind, 'reset');
  assert.equal(unreachable(failed(coded('UND_ERR_SOCKET')), 'h').kind, 'reset');
  assert.equal(unreachable(failed(coded('UND_ERR_CONNECT_TIMEOUT')), 'h').kind, 'timeout');
  assert.equal(unreachable(failed(Object.assign(new AggregateError([coded('ETIMEDOUT'), coded('ENETUNREACH')]), {})), 'h').kind, 'timeout');
  assert.equal(unreachable(failed(coded('EHOSTUNREACH')), 'h').kind, 'network');
  const cert = unreachable(failed(coded('CERT_HAS_EXPIRED')), 'h');
  assert.deepEqual([cert.kind, /certificate couldn’t be trusted \(CERT_HAS_EXPIRED\)/.test(cert.text)], ['certificate', true]);
  assert.equal(unreachable(failed(coded('SELF_SIGNED_CERT_IN_CHAIN')), 'h').kind, 'certificate');
  assert.equal(unreachable(failed(coded('ERR_TLS_CERT_ALTNAME_INVALID')), 'h').kind, 'certificate');
  // a header fetch would not build: thrown before anything was sent, with no cause
  assert.deepEqual(unreachable(new TypeError('Headers.append: invalid header value'), 'h'), { kind: 'header', code: '', text: BAD_KEY });
  assert.match(unreachable(failed(coded('EWHATEVER')), 'h').text, /^Couldn’t reach h\. Check the endpoint/);
  // only the causes an address explains send the user to the endpoint
  for (const code of ['ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT', 'EHOSTUNREACH']) assert.doesNotMatch(unreachable(failed(coded(code)), 'h').text, /Check the endpoint/);
});
