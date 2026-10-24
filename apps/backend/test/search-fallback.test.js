import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchWithFallback, searchReferenceRecords } from '../src/services/searchService.js';
import { nativeWebSearch } from '../src/services/llmService.js';
import { runToolAgent } from '../src/services/agentService.js';

const calls = [];
let handler;
globalThis.fetch = async (url, init = {}) => {
  const call = { url: String(url), init, body: init.body ? JSON.parse(init.body) : null };
  calls.push(call);
  return handler(call);
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const config = { provider: 'exa', connections: [{ provider: 'tavily', apiKey: 'tavily-key' }, { provider: 'exa', apiKey: 'exa-key' }] };

test('default first, fallback on errors/empty results, and each key stays with its provider', async () => {
  calls.length = 0;
  handler = (c) => c.url.includes('exa.ai') ? json({ error: 'quota for exa-key' }, 429)
    : json({ results: [{ title: 'A general result', url: 'https://example.com/news', content: 'Current news' }] });
  const result = await searchWithFallback({ query: 'today’s news', searchConfig: config, purpose: 'chat' });
  assert.deepEqual(calls.map((c) => new URL(c.url).hostname), ['api.exa.ai', 'api.tavily.com']);
  assert.equal(calls[0].init.headers['x-api-key'], 'exa-key');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer tavily-key');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(result.provider, 'tavily');
  assert.doesNotMatch(JSON.stringify(result), /exa-key|tavily-key/);
  assert.equal(result.results[0].bibtex, '');
  assert.equal(calls[0].body.category, undefined);
  assert.equal(calls[1].body.include_domains, undefined);
  assert.equal(calls[1].body.search_depth, 'basic');
  handler = (c) => c.url.includes('exa.ai') ? json({ results: [] }) : json({ results: [{ title: 'Fallback', url: 'https://example.com' }] });
  assert.equal((await searchWithFallback({ query: 'q', searchConfig: config, purpose: 'chat' })).provider, 'tavily');
  handler = () => json({ results: [] });
  await assert.rejects(searchWithFallback({ query: 'q', searchConfig: config }), /No usable results/);
});

test('reference search requests citation details; chat does not inherit academic ranking', async () => {
  calls.length = 0;
  handler = () => json({ results: [{ title: 'Reference', url: 'https://example.com/ref', published_date: '2026-06-20' }] });
  await searchWithFallback({ query: 'a reference', searchConfig: { provider: 'tavily', apiKey: 'tavily-key' }, purpose: 'references' });
  assert.equal(calls[0].body.include_published_date, true);
  assert.equal(calls[0].body.include_domains_mode, 'prefer');
  assert.equal(calls[0].body.search_depth, 'advanced');
  calls.length = 0;
  handler = () => json({ web: { results: [{ title: 'A result', url: 'https://example.com' }] } });
  await searchWithFallback({ query: 'q', searchConfig: { provider: 'brave', apiKey: 'b' }, purpose: 'chat' });
  assert.equal(new URL(calls[0].url).searchParams.has('goggles'), false);
});

test('reference URL lookup falls back across connections and rejects unrelated results', async () => {
  calls.length = 0;
  const url = 'https://example.com/story';
  handler = (c) => c.url.endsWith('/contents') ? json({ results: [{ title: 'Wrong page', url: 'https://other.test', author: 'A', publishedDate: '2000-01-01' }] })
    : json({ results: [{ title: 'The story', url, published_date: '2026-06-20' }] });
  const [record] = await searchReferenceRecords({ searchConfig: config, targetUrl: url });
  assert.equal(record.URL, url);
  assert.deepEqual(record.issued['date-parts'][0], [2026, 6, 20]);
  assert.match(calls[1].body.query, /author, original publication date/);
  assert.deepEqual(calls[0].body.urls, [url]);
  handler = (c) => c.url.endsWith('/contents') ? json({ results: [{ title: 'The story', url, author: 'Ada Lovelace' }] })
    : json({ results: [{ title: 'The story', url, published_date: '2026-06-20' }] });
  const [merged] = await searchReferenceRecords({ searchConfig: config, targetUrl: url });
  assert.equal(merged.author[0].family, 'Lovelace');
  assert.deepEqual(merged.issued['date-parts'][0], [2026, 6, 20]);
});

test('unsupported model search falls back without pretending a model-memory answer is search', async () => {
  calls.length = 0;
  handler = () => json({ results: [{ title: 'Actual result', url: 'https://example.com' }] });
  const result = await searchWithFallback({ query: 'q', purpose: 'chat', searchConfig: {
    provider: 'llm', llmConfig: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-flash', apiKey: 'model-key' },
    connections: [{ provider: 'llm' }, { provider: 'exa', apiKey: 'exa-key' }]
  } });
  assert.equal(result.provider, 'exa');
  assert.equal(calls.length, 1);
  assert.match(result.failures[0].error, /no verified built-in web search\. Turn on OpenAlex/);
});

test('native model search uses real server tools and requires provider-returned sources', async () => {
  const result = { title: 'A verified page', url: 'https://example.com/verified', summary: 'Source summary' };
  const content = JSON.stringify({ results: [result, { title: 'Invented', url: 'https://invented.test' }] });
  calls.length = 0;
  handler = () => json({ output: [{ type: 'web_search_call', action: { sources: [result] } }, { type: 'message', content: [{ type: 'output_text', text: content }] }] });
  const searchConfig = { provider: 'llm', llmConfig: { endpoint: 'https://api.openai.com/v1', apiKey: 'openai-key', model: 'configured-model' } };
  const r = await searchWithFallback({ query: 'q', searchConfig, purpose: 'chat' });
  assert.equal(r.results.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].body.store, false);
  assert.deepEqual(calls[0].body.tools, [{ type: 'web_search' }]);
  assert.equal(calls[0].body.tool_choice, 'required');
  assert.match(calls[0].body.input[0].content, /general web without academic/);
  handler = () => json({ output: [{ type: 'message', content: [{ text: content }] }] });
  await assert.rejects(nativeWebSearch({ query: 'q', llmConfig: searchConfig.llmConfig }), /no verified web sources/);
  handler = () => json({ content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', ...result }] }, { type: 'text', text: content }] });
  await nativeWebSearch({ query: 'q', purpose: 'references', llmConfig: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'configured-claude', apiKey: 'claude-key' } });
  assert.equal(calls.at(-1).body.tools[0].type, 'web_search_20250305');
  assert.match(calls.at(-1).body.messages[0].content[0].text, /citation metadata/);
  await assert.rejects(nativeWebSearch({ query: 'q', llmConfig: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'configured-gemini', apiKey: 'gemini-key' } }), /no verified built-in web search\. Turn on OpenAlex .* in Settings › Search\./);
});

test('read-only chat can search with fallback but cannot call file-edit tools', async () => {
  let turns = 0;
  handler = (c) => {
    if (c.url.includes('model.test')) {
      assert.deepEqual(c.body.tools.map((t) => t.function.name), ['web_search']);
      if (turns++ === 0) return json({ choices: [{ message: { role: 'assistant', tool_calls: [
        { id: 'search', function: { name: 'web_search', arguments: '{"query":"local news"}' } },
        { id: 'blocked', function: { name: 'propose_patch', arguments: '{"path":"main.tex","content":"bad"}' } }
      ] } }] });
      const output = c.body.messages.filter((m) => m.role === 'tool');
      assert.match(output[0].content, /Current news/);
      assert.doesNotMatch(output[0].content, /exa-key|tavily-key/);
      assert.match(output[1].content, /Unknown tool propose_patch/);
      return json({ choices: [{ message: { content: 'News: [source](https://example.com/news)' } }] });
    }
    if (c.url.includes('exa.ai')) return json({ error: 'unavailable' }, 503);
    assert.equal(c.body.include_domains, undefined);
    return json({ results: [{ title: 'Local news', url: 'https://example.com/news', content: 'Current news' }] });
  };
  const result = await runToolAgent({ readOnly: true, prompt: 'Find current news', llmConfig: { endpoint: 'https://model.test/v1', model: 'test', apiKey: 'm' }, searchConfig: config });
  assert.equal(result.ok, true);
  assert.deepEqual(result.patches, []);
  assert.match(result.reply, /source/);
});
