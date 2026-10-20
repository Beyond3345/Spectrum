import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { extractJSON, extractJsonBlock, stripCodeFences } from '../src/utils/jsonUtils.js';
import { invokeLLMForJSON } from '../src/services/transferAgent/utils.js';
import { checkLayout } from '../src/services/transferAgent/nodes/checkLayout.js';

test('shared extraction reads a complete JSON value with nested and quoted delimiters', () => {
  const value = { text: 'quoted " } ] \\', nested: [{ n: [1, 2] }] };
  const json = JSON.stringify(value);
  assert.deepEqual(extractJSON(`Result: ${json}\nOther: {"ignored":true}`), value);
  assert.deepEqual(extractJSON('```json\n[1, {"a":[2]}]\n```'), [1, { a: [2] }]);
  assert.equal(extractJSON('false'), false);
  assert.equal(stripCodeFences('```latex\n\\section{Title}\n```'), '\\section{Title}');
  assert.equal(extractJsonBlock('Result: {"text":"line\nbreak"} trailing'), '{"text":"line\nbreak"}');
});

test('truncated model instructions are never reconstructed into valid actions', () => {
  for (const raw of ['', 'text only', '{"files":[{"path":"main.tex","content":"partial', 'prefix [1,2', '{"a":[]} trailing {']) {
    if (raw === '{"a":[]} trailing {') assert.deepEqual(extractJSON(raw), { a: [] });
    else assert.equal(extractJSON(raw), null);
  }
});

test('Zod validates all JSON types and retries before accepting model output', async () => {
  const replies = ['{"count":"2","enabled":true}', '{"count":2,"enabled":"yes"}', '{"count":2,"enabled":true,"extra":"keep"}'];
  const seen = [];
  const llm = { invoke: async (messages) => { seen.push(messages); return { content: replies.shift() }; } };
  const schema = z.object({ count: z.number(), enabled: z.boolean() }).passthrough();
  const result = await invokeLLMForJSON(llm, [{ role: 'user', content: 'Plan' }], { schema });
  assert.deepEqual(result.parsed, { count: 2, enabled: true, extra: 'keep' });
  assert.equal(result.retries, 2);
  assert.match(seen[1].at(-1).content, /schema issues/);
});

test('exhausted schema retries reject invalid data', async () => {
  let calls = 0;
  const result = await invokeLLMForJSON({ invoke: async () => { calls++; return { content: '{"issues":{}}' }; } }, [], { schema: z.object({ issues: z.array(z.unknown()) }), maxRetries: 1 });
  assert.equal(result.parsed, null);
  assert.equal(calls, 2);
  assert.equal(result.raw, '{"issues":{}}');
});

test('layout validation rejects malformed issues and a model cannot override a failed check', async (t) => {
  let answer;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(new URL(url).hostname, 'layout.invalid');
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }), { status: 200 });
  });
  const state = { pageImages: [{ base64: 'test' }], llmConfig: { endpoint: 'https://layout.invalid/v1/chat/completions', model: 'test', apiKey: 'test' } };
  for (answer of [{ issues: {} }, { issues: [null] }, { issues: [{ severity: 'urgent' }] }]) {
    calls = 0;
    const result = await checkLayout(state);
    assert.equal(result.layoutCheckResult.ok, false);
    assert.equal(result.layoutCheckResult.parseError, true);
    assert.equal(calls, 3);
  }
  answer = { ok: true, issues: [{ severity: 'high', description: 'Overflow' }] };
  assert.equal((await checkLayout(state)).layoutCheckResult.ok, false);
  answer = { issues: [{ severity: 'low' }], summary: null };
  assert.equal((await checkLayout(state)).layoutCheckResult.ok, true);
});
