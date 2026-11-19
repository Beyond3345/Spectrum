import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chatCompletion, listLiveModels, retryAfterMs } from '../src/services/llmService.js';
import { PROVIDERS, effortFor, ollamaModel, providerFor } from '../src/services/providers.js';

// A fake provider: records each request and answers with whatever the test queued.
// It's also a fake Ollama, answering /api/show from `shows` by model name.
let server;
let base;
const seen = [];
const replies = [];
const shows = {};

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({ path: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      const show = req.url === '/api/show' && shows[JSON.parse(body).model];
      const [status, reply, headers] = req.url === '/api/show' ? (show ? [200, show] : [404, { error: 'not found' }]) : replies.shift() || [200, {}];
      // 'cut': the headers and half a body, then the connection closes
      if (status === 'cut') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"choices":[{"message":{"role":"assistant","content":"This reply stops half');
        return setTimeout(() => res.destroy(), 20);
      }
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (provider, opts) => {
  seen.length = 0;
  return chatCompletion({ apiKey: 'k', endpoint: `${base}/v1/chat/completions`, provider, messages: [{ role: 'user', content: 'Hi' }], ...opts });
};
const chatReply = (content) => [200, { choices: [{ message: { role: 'assistant', content } }] }];

test('effort levels clamp to what each model accepts', () => {
  const find = (p, m) => PROVIDERS.find((x) => x.id === p).models.find((x) => x.id === m);
  assert.equal(effortFor(find('moonshot', 'kimi-k3'), 'none'), 'low');
  assert.equal(effortFor(find('moonshot', 'kimi-k3'), 'default'), 'high');
  assert.equal(effortFor(find('deepseek', 'deepseek-flash'), 'medium'), 'high');
  assert.equal(effortFor(find('openai', 'gpt-6-astra'), 'fast'), 'low');
  assert.equal(effortFor(find('gemini', 'gemini-3.8-flash'), 'max'), 'high');
  assert.equal(effortFor(find('qwen', 'qwen3.8-max'), 'high'), 'xhigh');
  // a model Spectrum doesn't know only gets an explicit level
  assert.equal(effortFor(undefined, 'high'), 'high');
  assert.equal(effortFor(undefined, 'fast'), null);
  assert.equal(effortFor(undefined, 'default'), null);
});

test('providers are recognised from the endpoint host', () => {
  const id = (url) => providerFor(url)?.id ?? null;
  assert.equal(id('https://api.anthropic.com/v1/messages'), 'anthropic');
  assert.equal(id('https://eu.api.openai.com/v1/chat/completions'), 'openai');
  assert.equal(id('https://open.bigmodel.cn/api/paas/v4/chat/completions'), 'glm');
  assert.equal(id('https://abc123.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions'), 'qwen');
  assert.equal(id('https://api.moonshot.cn/v1/chat/completions'), 'moonshot');
  assert.equal(id('http://localhost:1234/v1/chat/completions'), null);
  assert.equal(id('http://192.168.1.20:11434'), 'ollama', 'an Ollama on another computer');
  for (const p of PROVIDERS) {
    assert.equal(id(p.endpoint), p.id, `${p.id} preset endpoint`);
    // a local Ollama's models are only known once it lists them
    if (!p.models.length) continue;
    for (const role of ['main', 'fast', 'vision', 'references']) assert.ok(p.models.some((m) => m.id === p.recommended[role]), `${p.id} ${role} model is listed`);
    assert.ok(p.models.find((m) => m.id === p.recommended.vision).vision, `${p.id} vision model reads images`);
  }
});

test('chat presets send their own effort fields and no temperature', async () => {
  replies.push(chatReply('ok'));
  await call('deepseek', { model: 'deepseek-flash', reasoningEffort: 'fast' });
  assert.deepEqual(seen[0].body.thinking, { type: 'disabled' });
  assert.equal('temperature' in seen[0].body, false);

  replies.push(chatReply('ok'));
  await call('moonshot', { model: 'kimi-k3' });
  assert.equal(seen[0].body.reasoning_effort, 'high', 'K3 always gets an effort, since none means Max');

  replies.push(chatReply('ok'));
  await call('qwen', { model: 'qwen3.7-plus', reasoningEffort: 'low' });
  assert.equal(seen[0].body.enable_thinking, true);
  assert.equal(seen[0].body.thinking_budget, 4096);

  replies.push(chatReply('ok'));
  await call('openrouter', { model: 'anthropic/claude-sonnet-5.5', reasoningEffort: 'xhigh' });
  assert.deepEqual(seen[0].body.reasoning, { effort: 'xhigh' });
});

test('other endpoints keep temperature and only get an explicit effort', async () => {
  replies.push(chatReply('ok'));
  await call(undefined, { model: 'local', reasoningEffort: 'fast' });
  assert.equal(seen[0].body.temperature, 0.2);
  assert.equal('reasoning_effort' in seen[0].body, false);

  // a model that rejects the effort is asked again without it
  replies.push([400, { error: { message: 'Unrecognized request argument supplied: reasoning_effort' } }], chatReply('ok'));
  const res = await call(undefined, { model: 'local', reasoningEffort: 'high' });
  assert.equal(res.ok, true);
  assert.equal(seen.length, 2);
  assert.equal('reasoning_effort' in seen[1].body, false);
});

test('Claude goes through the Messages API and round-trips a tool loop', async () => {
  const content = [
    { type: 'thinking', thinking: '…', signature: 'sig' },
    { type: 'text', text: 'Reading it.' },
    { type: 'tool_use', id: 'tu_1', name: 'read_file', input: { path: 'main.tex' } }
  ];
  replies.push([200, { content, stop_reason: 'tool_use' }]);
  const tools = [{ type: 'function', function: { name: 'read_file', description: 'Read', parameters: { type: 'object', properties: {} } } }];
  const first = await call('anthropic', {
    model: 'claude-opus-5-5',
    tools,
    messages: [
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: [{ type: 'text', text: 'Convert' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }
    ]
  });
  const sent = seen[0];
  assert.equal(sent.path, '/v1/messages');
  assert.equal(sent.headers['x-api-key'], 'k');
  assert.equal(sent.headers['anthropic-version'], '2023-06-01');
  assert.equal(sent.body.system, 'Be brief.');
  assert.deepEqual(sent.body.output_config, { effort: 'medium' });
  assert.deepEqual(sent.body.messages[0].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
  assert.deepEqual(sent.body.tools[0], { name: 'read_file', description: 'Read', input_schema: { type: 'object', properties: {} } });
  assert.equal(first.message.content, 'Reading it.');
  assert.deepEqual(first.message.tool_calls[0], { id: 'tu_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"main.tex"}' } });

  // the agent sends the whole message back, then two tool results that share one user turn
  replies.push([200, { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' }]);
  await call('anthropic', {
    model: 'claude-haiku-5-5',
    reasoningEffort: 'fast',
    tools,
    messages: [
      { role: 'user', content: 'Convert' },
      first.message,
      { role: 'tool', tool_call_id: 'tu_1', content: 'text' },
      { role: 'tool', tool_call_id: 'tu_2', content: 'more' }
    ]
  });
  const turns = seen[0].body.messages;
  assert.deepEqual(turns[1].content, content, 'thinking blocks go back unchanged');
  assert.deepEqual(turns[2].content.map((b) => b.tool_use_id), ['tu_1', 'tu_2']);
  assert.deepEqual(seen[0].body.thinking, { type: 'disabled' }, 'Haiku can turn thinking off for quick tasks');
});

test('OpenAI goes through the Responses API without storing anything', async () => {
  const output = [
    { type: 'reasoning', id: 'rs_1', encrypted_content: 'enc', summary: [] },
    { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'read_file', arguments: '{"path":"a.tex"}' }
  ];
  replies.push([200, { output }]);
  const tools = [{ type: 'function', function: { name: 'read_file', description: 'Read', parameters: { type: 'object' } } }];
  const first = await call('openai', { model: 'gpt-6-sol', tools, reasoningEffort: 'high' });
  const sent = seen[0];
  assert.equal(sent.path, '/v1/responses');
  assert.equal(sent.body.store, false);
  assert.deepEqual(sent.body.reasoning, { effort: 'high' });
  assert.deepEqual(sent.body.include, ['reasoning.encrypted_content']);
  assert.deepEqual(sent.body.tools[0], { type: 'function', name: 'read_file', description: 'Read', parameters: { type: 'object' } });
  assert.deepEqual(sent.body.input, [{ role: 'user', content: 'Hi' }]);
  assert.equal(first.message.tool_calls[0].id, 'call_1');

  replies.push([200, { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done.' }] }] }]);
  const second = await call('openai', {
    model: 'gpt-6-sol',
    tools,
    messages: [{ role: 'user', content: 'Hi' }, first.message, { role: 'tool', tool_call_id: 'call_1', content: 'text' }]
  });
  assert.deepEqual(seen[0].body.input.slice(1), [...output, { type: 'function_call_output', call_id: 'call_1', output: 'text' }]);
  assert.equal(second.message.content, 'Done.');
});

test('errors read the same across providers', async () => {
  // Gemini wraps its error in an array
  replies.push([400, [{ error: { code: 400, message: 'Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }]]);
  const gemini = await call('gemini', { model: 'gemini-3.8-flash' });
  assert.match(gemini.error, /HTTP 400\): Please pass a valid API key\./);

  // OpenRouter reports a failure after routing as a 200
  replies.push([200, { error: { message: 'Provider returned error', code: 502 } }]);
  const openrouter = await call('openrouter', { model: 'openai/gpt-6-luna' });
  assert.equal(openrouter.error, 'Provider returned error');
});

test('a spent quota is not worded as a rate limit', async () => {
  replies.push([429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', code: 'insufficient_quota' } }]);
  assert.match((await call(undefined, { model: 'm' })).error, /no quota or credit left/);
  // a spent quota is never sent again
  assert.equal(seen.length, 1);
  replies.push([429, { error: { message: 'Rate limit reached for requests', type: 'rate_limit_error' } }]);
  assert.equal((await call(undefined, { model: 'm', retries: 0 })).error, 'The provider is limiting requests. Try again shortly.');
});

const NOW = [['retry-after', '0']];
const busyReply = (status, headers = NOW) => [status, { error: { message: 'Overloaded', type: 'overloaded_error' } }, Object.fromEntries(headers)];

test('a busy provider is tried again on every request format, after the wait it names', async () => {
  const good = {
    anthropic: [200, { content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' }],
    openai: [200, { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }], status: 'completed' }],
    deepseek: chatReply('Hello')
  };
  for (const [provider, model, status] of [['anthropic', 'claude-opus-5-5', 529], ['openai', 'gpt-6-sol', 429], ['deepseek', 'deepseek-flash', 503]]) {
    replies.push(busyReply(status), busyReply(500), good[provider]);
    const res = await call(provider, { model });
    assert.equal(res.ok, true, provider);
    assert.equal(res.message.content, 'Hello');
    assert.equal(res.retries, 2);
    assert.equal(seen.length, 3);
    // the same request each time
    assert.deepEqual(seen[2].body, seen[0].body);
  }
  // with no wait named: 1 s before the second try
  replies.push([500, { error: { message: 'Server error' } }], chatReply('Hello'));
  const started = Date.now();
  assert.equal((await call(undefined, { model: 'm' })).ok, true);
  assert.ok(Date.now() - started >= 900, 'backs off a second');
});

test('a provider still busy after three tries says so, and what cannot be mended by waiting is sent once', async () => {
  replies.push(busyReply(529), busyReply(529), busyReply(529));
  const still = await call('anthropic', { model: 'claude-opus-5-5' });
  assert.equal(still.ok, false);
  assert.match(still.error, /HTTP 529\): Overloaded\. Spectrum tried 3 times\./);
  assert.equal(seen.length, 3);

  for (const [reply, wording] of [
    [[401, { error: { message: 'Incorrect API key' } }], /API key was rejected/],
    [[403, { error: { message: 'Forbidden' } }], /API key was rejected/],
    [[404, { error: { message: 'No such model' } }], /wasn’t found/],
    [[429, { error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } }], /no quota or credit left/],
    // the provider says not to
    [[503, { error: { message: 'Down for the day' } }, { 'x-should-retry': 'false' }], /HTTP 503/],
    // asked to wait longer than Spectrum will
    [[429, { error: { message: 'Rate limit reached' } }, { 'retry-after': '120' }], /asks for a wait of about 2 minutes/]
  ]) {
    replies.push(reply, chatReply('never asked for'));
    const res = await call(undefined, { model: 'm' });
    assert.equal(res.ok, false);
    assert.match(res.error, wording);
    assert.doesNotMatch(res.error, /tried/);
    assert.equal(seen.length, 1, wording.source);
    replies.length = 0;
  }

  // a caller that must be quick asks for no second try
  replies.push(busyReply(529), chatReply('never asked for'));
  assert.equal((await call(undefined, { model: 'm', retries: 0 })).ok, false);
  assert.equal(seen.length, 1);
  replies.length = 0;
});

test('a wait for a busy provider ends when the request is stopped', async () => {
  replies.push([429, { error: { message: 'Rate limit reached' } }, { 'retry-after': '15' }], chatReply('never asked for'));
  const abort = new AbortController();
  setTimeout(() => abort.abort(), 50);
  const started = Date.now();
  const res = await call(undefined, { model: 'm', signal: abort.signal });
  assert.equal(res.stopped, true);
  assert.ok(Date.now() - started < 2000);
  assert.equal(seen.length, 1);
  replies.length = 0;
});

test('Retry-After is read as seconds, as a date and as OpenAI’s milliseconds', () => {
  const h = (entries) => new Headers(entries);
  assert.equal(retryAfterMs(h({ 'retry-after': '2' })), 2000);
  assert.equal(retryAfterMs(h({ 'retry-after': '1.5' })), 1500);
  assert.equal(retryAfterMs(h({ 'retry-after-ms': '250', 'retry-after': '9' })), 250);
  assert.equal(retryAfterMs(h({ 'retry-after': 'Wed, 21 Oct 2026 07:28:10 GMT' }), Date.parse('Wed, 21 Oct 2026 07:28:00 GMT')), 10000);
  assert.equal(retryAfterMs(h({ 'retry-after': 'soon' })), null);
  assert.equal(retryAfterMs(h({})), null);
});

test('a connection lost part-way through the answer is tried again, and never worded as a wrong address', async () => {
  replies.push(['cut'], chatReply('Whole this time'));
  const res = await call(undefined, { model: 'm' });
  assert.equal(res.message.content, 'Whole this time');
  assert.equal(res.retries, 1);

  replies.push(['cut']);
  const lost = await call(undefined, { model: 'm', retries: 0 });
  assert.equal(lost.ok, false);
  assert.match(lost.error, /^The connection to 127\.0\.0\.1:\d+ was lost part-way through the answer\. Try again\.$/);

  // nothing listening is still the address to check
  const none = await chatCompletion({ apiKey: 'k', endpoint: 'http://127.0.0.1:9/v1/chat/completions', model: 'm', messages: [{ role: 'user', content: 'Hi' }] });
  assert.match(none.error, /Couldn’t reach 127\.0\.0\.1:9\. Check the endpoint/);
});

test('an answer that stopped at the output limit says so on every request format', async () => {
  replies.push([200, { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: 'Half a sent' } }] }]);
  const chat = await call(undefined, { model: 'm' });
  assert.deepEqual([chat.ok, chat.truncated, chat.message.content], [true, true, 'Half a sent']);
  replies.push([200, { content: [{ type: 'text', text: 'Half a sent' }], stop_reason: 'max_tokens' }]);
  assert.equal((await call('anthropic', { model: 'claude-opus-5-5' })).truncated, true);
  replies.push([200, { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Half a sent' }] }], status: 'incomplete' }]);
  assert.equal((await call('openai', { model: 'gpt-6-sol' })).truncated, true);
  // a whole answer carries no mark
  replies.push(chatReply('All of it.'));
  assert.equal('truncated' in (await call(undefined, { model: 'm' })), false);
});

test('a refusal on the Chat Completions format is the answer', async () => {
  replies.push([200, { choices: [{ message: { role: 'assistant', content: null, refusal: 'I can’t help with that.' } }] }]);
  assert.equal((await call(undefined, { model: 'm' })).message.content, 'I can’t help with that.');
});

test('thinking at the start of an answer, in <think> tags, is left out', async () => {
  replies.push(chatReply('<think>\nfirst this, then that\n</think>\n\nThe answer, with <think> named in it.'));
  assert.equal((await call(undefined, { model: 'm' })).message.content, 'The answer, with <think> named in it.');
});

test('a reply cut off part-way never runs its tool calls', async () => {
  const tools = [{ type: 'function', function: { name: 'propose_patch', description: 'Patch', parameters: { type: 'object' } } }];
  replies.push([200, { content: [{ type: 'tool_use', id: 'tu_1', name: 'propose_patch', input: { path: 'a.tex' } }], stop_reason: 'max_tokens' }]);
  const claude = await call('anthropic', { model: 'claude-opus-5-5', tools });
  assert.equal(claude.ok, false);
  assert.match(claude.error, /cut off/);

  replies.push([200, { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: '', tool_calls: [{ id: 'c', type: 'function', function: { name: 'propose_patch', arguments: '{"pa' } }] } }] }]);
  const chat = await call('deepseek', { model: 'deepseek-flash', tools });
  assert.equal(chat.ok, false);

  // a refusal drops whatever came before it
  replies.push([200, { content: [{ type: 'text', text: 'Sure' }, { type: 'tool_use', id: 'tu_2', name: 'propose_patch', input: {} }], stop_reason: 'refusal', stop_details: { explanation: 'Declined.' } }]);
  const refused = await call('anthropic', { model: 'claude-opus-5-5', tools });
  assert.equal(refused.message.content, 'Declined.');
  assert.equal(refused.message.tool_calls, undefined);

  // a cut-off answer with text and no tool calls is still worth showing
  replies.push([200, { content: [{ type: 'text', text: 'Most of an answer' }], stop_reason: 'max_tokens' }]);
  assert.equal((await call('anthropic', { model: 'claude-opus-5-5' })).message.content, 'Most of an answer');
});

test('empty turns are left out of a Claude request', async () => {
  replies.push([200, { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' }]);
  await call('anthropic', {
    model: 'claude-opus-5-5',
    messages: [{ role: 'user', content: 'Return JSON' }, { role: 'assistant', content: '' }, { role: 'user', content: 'Only JSON, please' }]
  });
  assert.deepEqual(seen[0].body.messages, [{ role: 'user', content: [{ type: 'text', text: 'Return JSON' }, { type: 'text', text: 'Only JSON, please' }] }]);
});

test('the .env key and model only go to the .env endpoint', async () => {
  const { resolveLLMConfig } = await import('../src/services/llmService.js');
  const saved = { ...process.env };
  try {
    process.env.SPECTRUM_LLM_ENDPOINT = 'https://api.openai.com/v1';
    process.env.SPECTRUM_LLM_API_KEY = 'sk-env';
    process.env.SPECTRUM_LLM_MODEL = 'gpt-env';
    assert.deepEqual(resolveLLMConfig({}), { endpoint: 'https://api.openai.com/v1', apiKey: 'sk-env', model: 'gpt-env' });
    assert.equal(resolveLLMConfig({ endpoint: 'https://api.openai.com/v1/chat/completions' }).apiKey, 'sk-env');
    const gemini = resolveLLMConfig({ endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' });
    assert.equal(gemini.apiKey, '', 'no OpenAI key for Gemini');
    assert.equal(gemini.model, 'gemini-3.8-flash', 'and its own recommended model');
  } finally {
    for (const k of ['SPECTRUM_LLM_ENDPOINT', 'SPECTRUM_LLM_API_KEY', 'SPECTRUM_LLM_MODEL']) {
      if (k in saved) process.env[k] = saved[k];
      else delete process.env[k];
    }
  }
});

test('Meta lists its Muse models, without the Contributor ones', () => {
  const meta = PROVIDERS.find((p) => p.id === 'meta');
  assert.equal(meta.name, 'Meta');
  assert.deepEqual(meta.models.map((m) => m.id), ['muse-wonder-1.0', 'muse-spark-1.3', 'muse-spark-1.2', 'muse-spark-1.1']);
  assert.ok(meta.models.every((m) => m.vision && m.levels[0] === 'minimal'), 'all read images and always think');
  assert.deepEqual(meta.models.filter((m) => m.levels.includes('max')).map((m) => m.id), ['muse-wonder-1.0', 'muse-spark-1.3']);
  const openrouter = PROVIDERS.find((p) => p.id === 'openrouter').models.map((m) => m.id);
  assert.ok(openrouter.includes('meta/muse-wonder') && !openrouter.some((id) => id.endsWith('-contributor')));
});

// what a local Ollama answers for /api/tags and /api/show
const tag = (name, size, details = {}, extra = {}) => ({ name, model: name, size, details, ...extra });
const TAGS = {
  models: [
    tag('gemma4:e4b', 9.6e9, { parameter_size: '8.0B', quantization_level: 'Q4_K_M' }),
    tag('gpt-oss:20b', 13.8e9, { parameter_size: '20.9B', quantization_level: 'MXFP4' }),
    tag('nomic-embed-text', 2.7e8),
    tag('llama3.2:1b', 1.3e9, { parameter_size: '1.2B', quantization_level: 'Q8_0' }),
    tag('kimi-k3:cloud', 384, {}, { remote_host: 'https://ollama.com:443', remote_model: 'kimi-k3' })
  ]
};
Object.assign(shows, {
  'gemma4:e4b': { capabilities: ['completion', 'vision', 'thinking'], thinking: { values: [false, true], default: true } },
  'gpt-oss:20b': { capabilities: ['completion', 'tools', 'thinking'], thinking: { values: ['low', 'medium', 'high'], default: 'medium' } },
  'nomic-embed-text': { capabilities: ['embedding'] },
  'llama3.2:1b': { capabilities: ['completion', 'tools'] },
  'kimi-k3:cloud': { capabilities: ['completion', 'tools', 'thinking', 'vision'], thinking: { values: [false, 'low', 'high', 'max'], default: 'max' } }
});
const ollama = PROVIDERS.find((p) => p.id === 'ollama');

test('Ollama lists the installed models it can chat with, with their effort levels', async () => {
  replies.push([200, TAGS]);
  const list = await listLiveModels(ollama, base);
  assert.equal(list.ok, true);
  const by = Object.fromEntries(list.models.map((m) => [m.id, m]));
  assert.deepEqual(Object.keys(by), ['gemma4:e4b', 'gpt-oss:20b', 'llama3.2:1b', 'kimi-k3:cloud'], 'no embedding model');
  assert.deepEqual(by['gemma4:e4b'], { id: 'gemma4:e4b', label: 'gemma4:e4b', note: '8.0B, Q4_K_M', vision: true, levels: ['none', 'high'], effort: 'high' });
  assert.deepEqual([by['gpt-oss:20b'].levels, by['gpt-oss:20b'].effort], [['low', 'medium', 'high'], 'medium']);
  assert.deepEqual([by['llama3.2:1b'].levels, by['llama3.2:1b'].vision], [[], false], 'no thinking, no effort');
  assert.deepEqual([by['kimi-k3:cloud'].levels, by['kimi-k3:cloud'].effort], [['none', 'low', 'high', 'max'], 'high'], 'a Max default is capped at High');
  assert.equal(by['kimi-k3:cloud'].note, 'Runs on Ollama’s servers');
  assert.deepEqual(list.recommended, { main: 'gemma4:e4b', fast: 'llama3.2:1b', vision: 'gemma4:e4b', references: 'llama3.2:1b' });
  // older Ollama versions give no thinking details
  assert.deepEqual(ollamaModel('qwen3', { capabilities: ['completion', 'thinking'] }, '').levels, ['none', 'low', 'medium', 'high']);

  const down = await listLiveModels(ollama, 'http://127.0.0.1:1');
  assert.equal(down.ok, false);
  assert.match(down.error, /Start Ollama, or install it from ollama\.com/);
});

test('a local Ollama gets no key and each model’s own effort', async () => {
  replies.push(chatReply('ok'));
  const res = await call('ollama', { apiKey: 'sk-secret', model: 'gpt-oss:20b', reasoningEffort: 'fast' });
  assert.equal(res.ok, true);
  const chat = seen.find((r) => r.path === '/v1/chat/completions');
  assert.equal(chat.headers.authorization, undefined, 'the key stays behind');
  assert.equal(chat.body.reasoning_effort, 'low', 'gpt-oss can’t turn thinking off');
  assert.equal('temperature' in chat.body, false);

  replies.push(chatReply('ok'));
  await call('ollama', { model: 'gemma4:e4b', reasoningEffort: 'fast' });
  assert.equal(seen.find((r) => r.path === '/v1/chat/completions').body.reasoning_effort, 'none');

  replies.push(chatReply('ok'));
  await call('ollama', { model: 'llama3.2:1b', reasoningEffort: 'high' });
  assert.equal('reasoning_effort' in seen.find((r) => r.path === '/v1/chat/completions').body, false, 'a model that can’t think gets no effort');

  // no key is needed for a server on plain http, but is for anything else
  replies.push(chatReply('ok'));
  assert.equal((await call(undefined, { apiKey: '', model: 'local' })).ok, true);
  assert.equal(seen[0].headers.authorization, undefined);
  assert.match((await chatCompletion({ apiKey: '', endpoint: 'https://example.com/v1', messages: [] })).error, /No AI model is set up/);

  const down = await chatCompletion({ endpoint: 'http://127.0.0.1:1', provider: 'ollama', model: 'gemma4', messages: [] });
  assert.equal(down.error, 'Couldn’t reach Ollama at 127.0.0.1:1. Start Ollama, or install it from ollama.com.');
});
