import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chatCompletion } from '../src/services/llmService.js';
import { PROVIDERS, effortFor, providerFor } from '../src/services/providers.js';

// A fake provider: records each request and answers with whatever the test queued.
let server;
let base;
const seen = [];
const replies = [];

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({ path: req.url, headers: req.headers, body: JSON.parse(body) });
      const [status, reply] = replies.shift() || [200, {}];
      res.writeHead(status, { 'Content-Type': 'application/json' });
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
  for (const p of PROVIDERS) {
    assert.equal(id(p.endpoint), p.id, `${p.id} preset endpoint`);
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
