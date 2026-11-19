// chatCompletion's streamed answers and prompt caching, in each request format, against a scripted provider on this
// computer. No network. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chatCompletion } from '../src/services/llmService.js';

let server;
let base;
const seen = [];
// each: (res) => void, writing the reply itself
const replies = [];
const sse = (res, events, { end = true, named = false } = {}) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const e of events) res.write(`${named && e.type ? `event: ${e.type}\n` : ''}data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`);
  if (end) res.end();
};
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'retry-after': '0' });
  res.end(JSON.stringify(body));
};

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({ path: req.url, body: JSON.parse(body) });
      (replies.shift() || ((r) => json(r, 200, {})))(res);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (provider, opts = {}) => {
  seen.length = 0;
  const heard = [];
  const tries = [];
  return chatCompletion({ apiKey: 'k', endpoint: `${base}/v1/chat/completions`, provider, messages: [{ role: 'system', content: 'Rules.' }, { role: 'user', content: 'Hi' }], onText: (t) => heard.push(t), onRetry: (r) => tries.push(r), ...opts }).then((result) => ({ result, heard, tries }));
};
const tools = [{ type: 'function', function: { name: 'read_file', description: 'Read', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }, { type: 'function', function: { name: 'compile', description: 'Compile', parameters: { type: 'object', properties: {} } } }];
const delta = (d, more = {}) => ({ choices: [{ index: 0, delta: d, ...more }] });

test('Chat Completions: the answer is heard piece by piece, and the tool calls, reasoning and usage come back whole', async () => {
  replies.push((res) => sse(res, [
    delta({ role: 'assistant', content: '' }),
    delta({ reasoning_content: 'Thinking. ' }),
    delta({ reasoning_content: 'Done.' }),
    delta({ content: 'Let me ' }),
    delta({ content: 'look.' }),
    delta({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'read_file', arguments: '' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: '"main.tex"}' } }] }),
    delta({ tool_calls: [{ index: 1, id: 'c2', type: 'function', function: { name: 'compile', arguments: '{}' } }] }),
    delta({}, { finish_reason: 'tool_calls' }),
    { choices: [], usage: { prompt_tokens: 120, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 100 } } },
    '[DONE]'
  ]));
  const { result, heard } = await call(undefined, { tools, cache: 'thread-1' });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(heard, ['Let me ', 'look.']);
  assert.equal(result.message.content, 'Let me look.');
  assert.equal(result.message.reasoning_content, 'Thinking. Done.', 'what a tool loop must send back');
  assert.deepEqual(result.message.tool_calls, [
    { id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"main.tex"}' } },
    { id: 'c2', type: 'function', function: { name: 'compile', arguments: '{}' } }
  ]);
  assert.deepEqual(result.usage, { input: 120, output: 9, cacheRead: 100 });
  assert.equal(seen[0].body.stream, true);
  assert.deepEqual(seen[0].body.stream_options, { include_usage: true });
  assert.equal(seen[0].body.prompt_cache_key, 'thread-1', 'a server with no preset is asked as OpenAI is');
});

test('a call that asks for no stream sends none, and no cache field unless a conversation is named', async () => {
  replies.push((res) => json(res, 200, { choices: [{ message: { role: 'assistant', content: 'whole' } }] }));
  const result = await chatCompletion({ apiKey: 'k', endpoint: `${base}/v1/chat/completions`, messages: [{ role: 'user', content: 'Hi' }] });
  assert.equal(result.message.content, 'whole');
  assert.equal('stream' in seen.at(-1).body, false);
  assert.equal('prompt_cache_key' in seen.at(-1).body, false);
  // the Messages format: plain system text, no marker
  replies.push((res) => json(res, 200, { content: [{ type: 'text', text: 'whole' }], usage: { input_tokens: 3, output_tokens: 1 } }));
  const claude = await chatCompletion({ apiKey: 'k', endpoint: `${base}/v1/messages`, provider: 'anthropic', tools, messages: [{ role: 'system', content: 'Rules.' }, { role: 'user', content: 'Hi' }] });
  assert.deepEqual(claude.usage, { input: 3, output: 1 });
  assert.equal(seen.at(-1).body.system, 'Rules.');
  assert.doesNotMatch(JSON.stringify(seen.at(-1).body), /cache_control|"stream"/);
});

test('a server that refuses the cache key or the stream’s usage is asked again without, and the key not again', async () => {
  replies.push((res) => json(res, 400, { error: { message: 'Unrecognized request argument supplied: prompt_cache_key' } }));
  replies.push((res) => json(res, 400, { error: { message: 'stream_options is not supported' } }));
  replies.push((res) => sse(res, [delta({ content: 'ok' }), '[DONE]']));
  const { result } = await call(undefined, { cache: 't' });
  assert.equal(result.message.content, 'ok');
  assert.deepEqual(seen.map((s) => ['prompt_cache_key' in s.body, 'stream_options' in s.body, s.body.stream]), [[true, true, true], [false, true, true], [false, false, true]]);
  replies.push((res) => sse(res, [delta({ content: 'ok' }), '[DONE]']));
  await call(undefined, { cache: 't' });
  assert.equal('prompt_cache_key' in seen[0].body, false, 'remembered for this server');
});

test('Messages: text, a tool call’s input and thinking are put back together; the cache is asked for at three points and its counts read', async () => {
  replies.push((res) => sse(res, [
    { type: 'message_start', message: { id: 'm', role: 'assistant', content: [], usage: { input_tokens: 12, cache_read_input_tokens: 3000, cache_creation_input_tokens: 200, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Hm.' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'ping' },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'I will ' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'read it.' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu1', name: 'read_file', input: {} } },
    { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"path": "ma' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: 'in.tex"}' } },
    { type: 'content_block_stop', index: 2 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 40 } },
    { type: 'message_stop' }
  ], { named: true }));
  const history = [
    { role: 'system', content: 'Rules.' },
    { role: 'user', content: 'Fix it' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'compile', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'a', content: 'one error' }
  ];
  const { result, heard } = await call('anthropic', { tools, cache: 'thread-1', messages: history });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(heard, ['I will ', 'read it.']);
  assert.equal(result.message.content, 'I will read it.');
  assert.deepEqual(result.message.tool_calls, [{ id: 'tu1', type: 'function', function: { name: 'read_file', arguments: '{"path":"main.tex"}' } }]);
  // as a request without a stream returns them, for the next step to send back unchanged
  assert.deepEqual(result.message._anthropic, [
    { type: 'thinking', thinking: 'Hm.', signature: 'sig' },
    { type: 'text', text: 'I will read it.' },
    { type: 'tool_use', id: 'tu1', name: 'read_file', input: { path: 'main.tex' } }
  ]);
  assert.deepEqual(result.usage, { input: 3212, output: 40, cacheRead: 3000, cacheWrite: 200 });
  const { body } = seen[0];
  assert.equal(body.stream, true);
  assert.deepEqual(body.system, [{ type: 'text', text: 'Rules.', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(body.tools.map((t) => !!t.cache_control), [false, true], 'the last tool definition');
  assert.deepEqual(body.messages.at(-1).content, [{ type: 'tool_result', tool_use_id: 'a', content: 'one error', cache_control: { type: 'ephemeral' } }], 'the conversation so far');
  assert.equal(JSON.stringify(body).match(/cache_control/g).length, 3);
  assert.equal(JSON.stringify(history).includes('cache_control'), false, 'the caller’s messages are left as they were');
});

test('Responses: text deltas are heard, the finished response is the reply, and the conversation’s key and cached tokens go and come', async () => {
  const response = { status: 'completed', output: [
    { type: 'reasoning', id: 'rs', summary: [], encrypted_content: 'enc' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Reading.' }] },
    { type: 'function_call', call_id: 'f1', name: 'read_file', arguments: '{"path":"main.typ"}' }
  ], usage: { input_tokens: 900, output_tokens: 12, input_tokens_details: { cached_tokens: 800 } } };
  replies.push((res) => sse(res, [
    { type: 'response.created', response: { status: 'in_progress' } },
    { type: 'response.output_text.delta', delta: 'Read' },
    { type: 'response.output_text.delta', delta: 'ing.' },
    { type: 'response.completed', response }
  ], { named: true }));
  const { result, heard } = await call('openai', { tools, cache: 'thread-9' });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(heard, ['Read', 'ing.']);
  assert.equal(result.message.content, 'Reading.');
  assert.deepEqual(result.message.tool_calls, [{ id: 'f1', type: 'function', function: { name: 'read_file', arguments: '{"path":"main.typ"}' } }]);
  assert.deepEqual(result.message._responses, response.output);
  assert.deepEqual(result.usage, { input: 900, output: 12, cacheRead: 800 });
  assert.equal(seen[0].path, '/v1/responses');
  assert.equal(seen[0].body.stream, true);
  assert.equal(seen[0].body.prompt_cache_key, 'thread-9');
});

test('thinking in <think> tags is never heard, split across pieces or not', async () => {
  replies.push((res) => sse(res, [delta({ content: '<thi' }), delta({ content: 'nk>secret' }), delta({ content: ' plan</think>\n\nThe ' }), delta({ content: 'answer.' }), '[DONE]']));
  const { result, heard } = await call();
  assert.equal(heard.join(''), 'The answer.');
  assert.equal(result.message.content, 'The answer.');
  replies.push((res) => sse(res, [delta({ content: '<' }), delta({ content: 'b>bold</b>' }), '[DONE]']));
  assert.equal((await call()).heard.join(''), '<b>bold</b>', 'another tag is text');
});

test('a stream that breaks off, or reports a failure inside it, is tried again, and says its text is to be dropped', async () => {
  replies.push((res) => {
    sse(res, [delta({ content: 'Half an ans' })], { end: false });
    setTimeout(() => res.destroy(), 20);
  });
  replies.push((res) => sse(res, [{ error: { message: 'Overloaded' } }]));
  replies.push((res) => sse(res, [delta({ content: 'The whole answer.' }), '[DONE]']));
  const { result, heard, tries } = await call();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.message.content, 'The whole answer.');
  assert.equal(result.retries, 2);
  assert.deepEqual(heard, ['Half an ans', 'The whole answer.']);
  assert.deepEqual(tries.map((t) => [t.attempt, t.of, t.streamed]), [[2, 3, true], [3, 3, false]]);
  assert.ok(tries.every((t) => t.waitMs > 0));
});

test('a busy provider’s wait is told before it, and Stop ends the wait and the stream at once', async () => {
  replies.push((res) => { res.writeHead(529, { 'Content-Type': 'application/json', 'retry-after': '15' }); res.end('{"error":{"message":"Overloaded"}}'); });
  const stop = new AbortController();
  const started = Date.now();
  const waiting = call(undefined, { signal: stop.signal, onRetry: (r) => { assert.deepEqual(r, { attempt: 2, of: 3, waitMs: 15000, streamed: false }); setTimeout(() => stop.abort(), 30); } });
  const { result } = await waiting;
  assert.deepEqual(result, { ok: false, error: 'Stopped.', stopped: true });
  assert.ok(Date.now() - started < 2000, 'not the 15 seconds asked for');

  // mid-stream: the provider goes on writing, the call returns
  const second = new AbortController();
  replies.push((res) => {
    sse(res, [delta({ content: 'Going ' })], { end: false });
    const timer = setInterval(() => res.write(`data: ${JSON.stringify(delta({ content: 'on ' }))}\n\n`), 20);
    res.on('close', () => clearInterval(timer));
  });
  const at = Date.now();
  const pieces = [];
  const { result: cut } = await call(undefined, { signal: second.signal, onText: (t) => { pieces.push(t); if (pieces.length === 3) second.abort(); } });
  assert.equal(cut.stopped, true);
  assert.ok(pieces.length >= 3 && Date.now() - at < 2000);
});
