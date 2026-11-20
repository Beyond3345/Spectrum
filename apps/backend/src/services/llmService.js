import { LEVELS, effortFields, ollamaModel, providerFor } from './providers.js';

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-6-sol';
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

export function normalizeChatEndpoint(endpoint) {
  if (!endpoint) return DEFAULT_ENDPOINT;
  let url = endpoint.trim();
  if (!url) return DEFAULT_ENDPOINT;
  url = url.replace(/\/+$/, '');
  if (/\/(chat\/completions|messages)$/i.test(url)) return url;
  // …/v1, Z.ai's …/v4 and Gemini's …/v1beta/openai
  if (/\/v\d+[a-z]*(\/openai)?$/i.test(url)) return `${url}/chat/completions`;
  if (/\/v1\//i.test(url)) return url;
  return `${url}/v1/chat/completions`;
}

export function normalizeBaseURL(endpoint) {
  if (!endpoint) return undefined;
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.replace(/\/chat\/completions$/i, '');
}

const hostOf = (endpoint) => {
  try {
    return new URL(normalizeChatEndpoint(endpoint)).host;
  } catch {
    return '';
  }
};

export function resolveLLMConfig(llmConfig) {
  const envEndpoint = (process.env.SPECTRUM_LLM_ENDPOINT || DEFAULT_ENDPOINT).trim();
  const endpoint = (llmConfig?.endpoint || envEndpoint).trim();
  // the .env key and model belong to the .env endpoint, so another provider never gets them
  const env = hostOf(endpoint) === hostOf(envEndpoint);
  return {
    endpoint,
    // a pasted key often brings a line break or an invisible space along at either end
    apiKey: (llmConfig?.apiKey || (env && process.env.SPECTRUM_LLM_API_KEY) || '').replace(/^[\s\u200b-\u200d\u2060\ufeff]+|[\s\u200b-\u200d\u2060\ufeff]+$/g, ''),
    // with no model named, a known provider gets its recommended one
    model: (llmConfig?.model || (env && process.env.SPECTRUM_LLM_MODEL) || providerFor(normalizeChatEndpoint(endpoint))?.recommended.main || DEFAULT_MODEL).trim()
  };
}

/** A key with a character no header can carry (a space, a line break or a curly quote inside it) is never sent. */
export const badKey = (key) => /[^\x21-\x7e]/.test(key);
export const BAD_KEY = 'The API key has a character that can’t be sent. Paste it again.';

export const NO_API_KEY = 'No AI model is set up yet. Add an endpoint, model and API key in Settings › Models.';

/** A resolved config that can't work without a key. Local servers such as Ollama speak plain http and take none. */
export const missingKey = (config) => !config.apiKey && !/^http:\/\//i.test(config.endpoint);

const NO_OLLAMA = 'Start Ollama, or install it from ollama.com.';
const ollamaBase = (endpoint) => normalizeChatEndpoint(endpoint).replace(/\/v1\/chat\/completions$/i, '');

async function ollamaJson(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// /api/show answers, kept for the session; ollama.com answers it without a key
const shown = new Map();
function ollamaShow(base, name) {
  const key = `${base} ${name}`;
  if (!shown.has(key)) {
    shown.set(key, ollamaJson(`${base}/api/show`, { model: name }).catch((err) => {
      shown.delete(key);
      throw err;
    }));
  }
  return shown.get(key);
}

/** A live preset's model as its server describes it, or null when it can't say. */
const liveModel = (endpoint, name) => ollamaShow(ollamaBase(endpoint), name).then((show) => ollamaModel(name, show, ''), () => null);

/** The models a live preset's server lists, as preset models with recommendations, for Settings. */
export async function listLiveModels(preset, endpoint) {
  const base = ollamaBase(endpoint || preset.endpoint);
  let tags;
  try {
    tags = (await ollamaJson(`${base}/api/tags`)).models || [];
  } catch {
    return { ok: false, error: preset.local ? `Couldn’t reach Ollama. ${NO_OLLAMA}` : 'Couldn’t reach ollama.com for its models.' };
  }
  const shows = await Promise.all(tags.map((t) => ollamaShow(base, t.name).catch(() => ({ capabilities: t.capabilities }))));
  const models = tags.flatMap((t, i) => {
    // embedding models can't chat
    if (shows[i].capabilities && !shows[i].capabilities.includes('completion')) return [];
    const known = preset.models.find((m) => m.id === t.name);
    const size = [t.details?.parameter_size, t.details?.quantization_level].filter(Boolean).join(', ');
    const note = known?.note || (t.remote_host ? 'Runs on Ollama’s servers' : size);
    return [{ ...ollamaModel(t.name, shows[i], note), ...(known && { label: known.label }) }];
  });
  if (!models.length) return { ok: false, error: preset.local ? 'Ollama has no models yet. Download one in the Ollama app, or with ollama pull.' : 'ollama.com listed no models.' };
  const listed = (id) => (models.some((m) => m.id === id) ? id : '');
  // the local app's :cloud models run on ollama.com: recommend what runs here before them
  const here = models.filter((m) => !tags.find((t) => t.name === m.id)?.remote_host);
  // Ollama lists the newest first
  const main = listed(preset.recommended.main) || (here[0] || models[0]).id;
  // for quick jobs, the smallest model that runs here
  const smallest = tags.filter((t) => listed(t.name) && !t.remote_host).sort((a, b) => a.size - b.size)[0]?.name;
  const fast = listed(preset.recommended.fast) || smallest || main;
  return {
    ok: true,
    models,
    recommended: { main, fast, vision: listed(preset.recommended.vision) || (here.find((m) => m.vision) || models.find((m) => m.vision))?.id || main, references: fast }
  };
}

const spentQuota = (text) => /quota|billing|credit|balance/i.test(text);

// A busy provider: the same request a little later usually works, so it is sent again, twice at most. A rejected key
// (401, 403), a wrong address (404) and a spent quota are never sent again: waiting mends none of them.
const BUSY = [429, 500, 502, 503, 504, 529];
const MAX_RETRIES = 2;
// the longest one wait; a provider that asks for longer is not waited for
const MAX_WAIT_MS = 20000;
export const BACKOFF_MS = [1000, 3000];
// the causes of a failed connection that trying again never mends
export const FINAL = ['refused', 'certificate', 'header', 'port'];

/** How long a reply asks to be left alone, in ms, from Retry-After (seconds or a date) or OpenAI's retry-after-ms; null when it doesn't say. */
export function retryAfterMs(headers, now = Date.now()) {
  const ms = Number(headers.get('retry-after-ms'));
  if (headers.get('retry-after-ms') && Number.isFinite(ms)) return Math.max(0, ms);
  const value = headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** Whether a failed reply is worth sending again: a busy status the provider hasn't marked final, and not a spent quota. */
function busy(res, text) {
  if (!BUSY.includes(res.status) || res.headers.get('x-should-retry') === 'false') return false;
  // a 429 that names a wait is a rate limit whatever its words; one that names quota or credit and no wait is spent
  return res.status !== 429 || res.headers.get('retry-after') !== null || res.headers.get('retry-after-ms') !== null || !spentQuota(text);
}

/** Waits ms, or until the signal aborts. */
const pause = (ms, signal) => new Promise((resolve) => {
  if (!ms || signal?.aborted) return resolve();
  const done = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', done);
    resolve();
  };
  const timer = setTimeout(done, ms);
  signal?.addEventListener('abort', done, { once: true });
});

const about = (ms) => (ms < 90000 ? `${Math.ceil(ms / 1000)} seconds` : `${Math.ceil(ms / 60000)} minutes`);

/** A provider's non-2xx answer as one plain sentence, never the raw body. */
export function providerError(status, text) {
  if (status === 401 || status === 403) return 'The API key was rejected. Check it in Settings › Models.';
  if (status === 404) return 'The endpoint or model wasn’t found. Check Settings › Models.';
  // a 429 is also how providers say the account has run out, which waiting never mends
  if (status === 429) return spentQuota(text) ? 'The provider says this account has no quota or credit left. Check your plan and billing with the provider.' : 'The provider is limiting requests. Try again shortly.';
  let detail = '';
  try {
    // Gemini wraps the error in an array
    const parsed = JSON.parse(text);
    const error = (Array.isArray(parsed) ? parsed[0] : parsed)?.error;
    detail = String((typeof error === 'string' ? error : error?.message) || '').trim().replace(/\.$/, '');
  } catch {
    // not JSON
  }
  return `The model provider returned an error (HTTP ${status})${detail ? `: ${detail}` : ''}.`;
}

/**
 * Why a request got no answer at all, from what fetch threw: undici puts the system's code in `cause`, and an
 * AggregateError there holds one error per address tried. kind is name, refused, reset, timeout, network, certificate,
 * header (a key no header can carry), port (one fetch won't open) or other; only name, refused and other point at a mistake in the endpoint, so only they say to check it.
 */
export function unreachable(err, host) {
  // a header fetch refused to build is thrown before anything is sent, with no cause
  if (err?.name === 'TypeError' && !err.cause) return { kind: 'header', code: '', text: BAD_KEY };
  const errors = [err?.cause, ...(err?.cause?.errors || []), err].filter(Boolean);
  const code = String(errors.map((e) => e.code).find(Boolean) || '');
  const kinds = [
    ['name', /^(ENOTFOUND|EAI_AGAIN|EAI_NONAME|EAI_FAIL)$/, `The name ${host} couldn’t be found. Check the endpoint in Settings › Models, and your internet or VPN connection.`],
    ['refused', /^ECONNREFUSED$/, `${host} refused the connection. Check the endpoint in Settings › Models, and that the server is running.`],
    ['reset', /^(ECONNRESET|EPIPE|ECONNABORTED|UND_ERR_SOCKET|UND_ERR_CLOSED)$/, `The connection to ${host} was dropped before it answered, which a VPN or an unsteady network can do. Try again.`],
    ['timeout', /^(ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)$/, `Connecting to ${host} timed out. Check your internet or VPN connection, then try again.`],
    ['network', /^(EHOSTUNREACH|ENETUNREACH|ENETDOWN)$/, `This computer has no route to ${host}. Check your internet or VPN connection.`],
    ['certificate', /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/, `The secure connection to ${host} failed because its certificate couldn’t be trusted (${code}). Check the endpoint; a VPN or proxy that inspects traffic can also cause this.`]
  ];
  const other = `Couldn’t reach ${host}. Check the endpoint in Settings › Models.`;
  // fetch never opens a port the web keeps closed (such as 9 or 25)
  if (err?.cause?.message === 'bad port') return { kind: 'port', code: '', text: other };
  const [kind, , text] = kinds.find(([, re]) => re.test(code)) || ['other', null, other];
  return { kind, code, text };
}

const textOf = (content) => (typeof content === 'string' ? content : flattenContent(content));
const parseArgs = (args) => {
  try {
    return JSON.parse(args || '{}');
  } catch {
    return {};
  }
};
const functionsOf = (tools) => (tools?.length ? tools.map((t) => t.function) : null);

// Prompt caching. A tool loop sends the same long prefix (tools, instructions, the conversation so far) again at every
// step: a caller that will do so passes `cache`, a key for its conversation, and each format asks for caching its own
// way. A one-off request (autocomplete, a rewrite) passes none: a cache written and never read costs more than no cache.
const CACHED = { type: 'ephemeral' };

/** A provider's event stream as its events, each one's data parsed; a keep-alive or a line that isn't JSON is passed over. */
async function* sseEvents(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  const events = function* (final) {
    for (;;) {
      const end = buffer.search(/\r?\n\r?\n/);
      if (end < 0 && !(final && buffer.trim())) return;
      const block = end < 0 ? buffer : buffer.slice(0, end);
      buffer = end < 0 ? '' : buffer.slice(end).replace(/^\r?\n\r?\n/, '');
      const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data);
      } catch {
        // not an event
      }
    }
  };
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    yield* events(false);
  }
  yield* events(true);
}

// what a streamed Chat Completions piece repeats whole rather than continues
const WHOLE = ['id', 'type', 'name', 'role', 'index'];
/** A Chat Completions delta added to the message so far: text and arguments continue, a list's items join by index. */
function mergeDelta(target, delta) {
  for (const [key, value] of Object.entries(delta || {})) {
    if (value == null) continue;
    if (typeof value === 'string') target[key] = WHOLE.includes(key) ? value || target[key] : (target[key] || '') + value;
    else if (Array.isArray(value)) {
      const list = (target[key] ||= []);
      for (const item of value) {
        if (item === null || typeof item !== 'object') { list.push(item); continue; }
        // a server that numbers nothing sends each tool call whole, or continues the last one
        const known = item.id ? list.findIndex((x) => x?.id === item.id) : -1;
        const at = Number.isInteger(item.index) ? item.index : known >= 0 ? known : item.id ? list.length : Math.max(0, list.length - 1);
        const { index, ...rest } = item;
        list[at] = mergeDelta(list[at] || {}, rest);
      }
    } else if (typeof value === 'object') target[key] = mergeDelta(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
    else target[key] = value;
  }
  return target;
}

// Request formats. Each turns OpenAI-style messages and tools into its own body, and its reply back
// into an OpenAI-style message. The raw reply items ride along on the message (_anthropic, _responses)
// so a tool loop can send them back unchanged, as both APIs require for reasoning.
const ADAPTERS = {
  chat: {
    url: (url) => url,
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    body: ({ model, messages, tools, temperature, extra, cacheKey }) => ({
      model,
      // another format's own reply items (a run whose model changed) are not this one's to send
      messages: messages.map(({ _anthropic, _responses, ...m }) => m),
      ...(temperature !== undefined && { temperature }),
      ...(tools?.length && { tools }),
      ...(cacheKey && { prompt_cache_key: cacheKey }),
      ...extra
    }),
    // a stream's pieces put back together as the reply a request without one gets
    stream: {
      fields: { stream: true, stream_options: { include_usage: true } },
      open: () => ({ choices: [{ message: { role: 'assistant' } }] }),
      add(data, event) {
        if (event.error) data.error = event.error;
        if (event.usage) data.usage = event.usage;
        const choice = event.choices?.[0];
        if (!choice) return '';
        if (choice.finish_reason) data.choices[0].finish_reason = choice.finish_reason;
        mergeDelta(data.choices[0].message, choice.delta);
        return typeof choice.delta?.content === 'string' ? choice.delta.content : '';
      }
    },
    // a refusal comes with no content and its reason beside it
    message: (data) => data?.choices?.[0]?.message && { ...data.choices[0].message, ...(!data.choices[0].message.content && data.choices[0].message.refusal && { content: data.choices[0].message.refusal }), truncated: data.choices[0].finish_reason === 'length' }
  },

  // Anthropic Messages API
  anthropic: {
    url: (url) => (/\/messages$/.test(url) ? url : `${new URL(url).origin}/v1/messages`),
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    body: ({ model, messages, tools, extra, cache }) => {
      const system = [];
      const turns = [];
      const add = (role, blocks) => {
        // empty turns are refused, so drop them and let the neighbours merge
        if (!blocks.length) return;
        const last = turns[turns.length - 1];
        if (last?.role === role) last.content.push(...blocks);
        else turns.push({ role, content: [...blocks] });
      };
      for (const m of messages) {
        if (m.role === 'system' || m.role === 'developer') system.push(textOf(m.content));
        else if (m.role === 'tool') add('user', [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content ?? '') }]);
        else if (m.role === 'assistant') {
          add('assistant', m._anthropic || [
            ...(m.content ? [{ type: 'text', text: textOf(m.content) }] : []),
            ...(m.tool_calls || []).map((c) => ({ type: 'tool_use', id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) }))
          ]);
        } else {
          const parts = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content || [];
          add('user', parts.flatMap((part) => {
            if (part.type !== 'image_url') return part.text ? [{ type: 'text', text: part.text }] : [];
            const url = part.image_url?.url || '';
            const data = url.match(/^data:([^;,]+);base64,(.*)$/s);
            return [{ type: 'image', source: data ? { type: 'base64', media_type: data[1], data: data[2] } : { type: 'url', url } }];
          }));
        }
      }
      const defs = functionsOf(tools)?.map((f) => ({ name: f.name, description: f.description, input_schema: f.parameters }));
      if (cache) {
        // three of the four breakpoints a request may have: the tools, the instructions after them, and the
        // conversation up to its last block, which the next step of the loop reads back and adds to
        if (defs) defs[defs.length - 1] = { ...defs.at(-1), cache_control: CACHED };
        const last = turns.at(-1)?.content;
        const at = last ? last.findLastIndex((b) => !['thinking', 'redacted_thinking'].includes(b.type)) : -1;
        if (at >= 0) last[at] = { ...last[at], cache_control: CACHED };
      }
      return {
        model,
        // required by the API; generous because thinking counts towards it
        max_tokens: ['xhigh', 'max'].includes(extra.output_config?.effort) ? 32000 : 16000,
        ...(system.length && { system: cache ? [{ type: 'text', text: system.join('\n\n'), cache_control: CACHED }] : system.join('\n\n') }),
        messages: turns,
        ...(defs && { tools: defs }),
        ...extra
      };
    },
    stream: {
      fields: { stream: true },
      open: () => ({ content: [], usage: {} }),
      add(data, event) {
        const block = data.content[event.index];
        if (event.type === 'error') data.error = event.error || { message: 'The stream failed.' };
        else if (event.type === 'message_start') Object.assign(data.usage, event.message?.usage);
        else if (event.type === 'content_block_start') data.content[event.index] = { ...event.content_block };
        else if (event.type === 'content_block_delta' && block) {
          const d = event.delta || {};
          if (d.type === 'text_delta') {
            block.text = (block.text || '') + d.text;
            return d.text;
          }
          // a tool call's input arrives as pieces of its JSON, read when the block ends
          if (d.type === 'input_json_delta') block._json = (block._json || '') + d.partial_json;
          else if (d.type === 'thinking_delta') block.thinking = (block.thinking || '') + d.thinking;
          else if (d.type === 'signature_delta') block.signature = d.signature;
          else if (d.type === 'citations_delta') (block.citations ||= []).push(d.citation);
        } else if (event.type === 'content_block_stop' && block && '_json' in block) {
          block.input = parseArgs(block._json);
          delete block._json;
        } else if (event.type === 'message_delta') {
          Object.assign(data, event.delta);
          Object.assign(data.usage, event.usage);
        }
        return '';
      }
    },
    message: (data) => {
      if (!Array.isArray(data?.content)) return null;
      // anything cut short by a refusal is to be discarded
      if (data.stop_reason === 'refusal') return { role: 'assistant', content: data.stop_details?.explanation || 'Claude declined this request.' };
      const calls = data.content.filter((b) => b.type === 'tool_use');
      return {
        role: 'assistant',
        content: data.content.filter((b) => b.type === 'text').map((b) => b.text).join(''),
        tool_calls: calls.length ? calls.map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } })) : undefined,
        truncated: data.stop_reason === 'max_tokens' || data.stop_reason === 'model_context_window_exceeded',
        _anthropic: data.content
      };
    }
  },

  // OpenAI Responses API, stateless (store: false) so manuscripts aren't kept on OpenAI's servers
  responses: {
    url: (url) => url.replace(/\/chat\/completions$/, '/responses'),
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    body: ({ model, messages, tools, extra, cache }) => ({
      model,
      ...(cache && { prompt_cache_key: cache }),
      input: messages.flatMap((m) => {
        if (m.role === 'tool') return [{ type: 'function_call_output', call_id: m.tool_call_id, output: String(m.content ?? '') }];
        if (m.role === 'assistant') {
          return m._responses || [
            ...(m.content ? [{ role: 'assistant', content: textOf(m.content) }] : []),
            ...(m.tool_calls || []).map((c) => ({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments }))
          ];
        }
        const content = typeof m.content === 'string'
          ? m.content
          : (m.content || []).map((p) => (p.type === 'image_url' ? { type: 'input_image', image_url: p.image_url?.url } : { type: 'input_text', text: p.text ?? '' }));
        return [{ role: m.role, content }];
      }),
      ...(functionsOf(tools) && { tools: functionsOf(tools).map((f) => ({ type: 'function', name: f.name, description: f.description, parameters: f.parameters })) }),
      store: false,
      // reasoning items come back encrypted so the next turn of a tool loop can return them
      ...(extra.reasoning && { include: ['reasoning.encrypted_content'] }),
      ...extra
    }),
    stream: {
      fields: { stream: true },
      open: () => ({}),
      add(data, event) {
        if (event.type === 'response.output_text.delta') return event.delta || '';
        // the last event carries the whole response, as a request without a stream returns it
        if (['response.completed', 'response.incomplete', 'response.failed'].includes(event.type)) Object.assign(data, event.response);
        else if (event.type === 'error') data.error = { message: event.message || event.error?.message };
        return '';
      }
    },
    message: (data) => {
      if (!Array.isArray(data?.output)) return null;
      const calls = data.output.filter((item) => item.type === 'function_call');
      return {
        role: 'assistant',
        content: data.output.filter((item) => item.type === 'message').flatMap((item) => item.content || []).map((part) => part.text ?? part.refusal ?? '').join(''),
        tool_calls: calls.length ? calls.map((c) => ({ id: c.call_id, type: 'function', function: { name: c.name, arguments: c.arguments } })) : undefined,
        truncated: data.status === 'incomplete',
        _responses: data.output
      };
    }
  }
};

// the servers that refused a prompt cache key, by host: asked once, not at every step of a run
const noCacheKey = new Set();

/**
 * Tokens as the provider counted them: all it read (input, with what the cache served and what it stored) and what it
 * wrote. With `reportsCost` (OpenRouter), also what the request cost in US dollars as the provider reports it: its
 * usage.cost (credits, which are dollars) and, on the user's own provider key, what that provider charged beside it.
 */
function usageOf(u, reportsCost) {
  if (!u) return null;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const cost = reportsCost && n(u.cost) !== null ? n(u.cost) + (n(u.cost_details?.upstream_inference_cost) ?? 0) : null;
  const cacheRead = u.cache_read_input_tokens ?? u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? u.prompt_cache_hit_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  // the Messages API counts what the cache served and stored apart from the rest; the others inside their total
  const input = u.prompt_tokens ?? (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + cacheWrite;
  return { input, output: u.completion_tokens ?? u.output_tokens ?? 0, ...(cacheRead && { cacheRead }), ...(cacheWrite && { cacheWrite }), ...(cost !== null && { cost }) };
}

/** onText for the answer's text alone: a leading <think>…</think> (open and local reasoning models) is held back until it closes. */
function visibleText(onText) {
  let raw = '';
  let sent = 0;
  return (piece) => {
    raw += piece;
    const lead = raw.trimStart();
    if (lead.length < 7 && '<think>'.startsWith(lead)) return;
    let out = raw;
    if (lead.startsWith('<think>')) {
      const end = raw.indexOf('</think>');
      if (end < 0) return;
      out = raw.slice(end + 8).trimStart();
    }
    if (out.length > sent) onText(out.slice(sent));
    sent = out.length;
  };
}

/**
 * One chat call. Returns { ok, message } where message is an OpenAI-style assistant message
 * (content and/or tool_calls), or { ok: false, error }.
 * reasoningEffort: a level from providers.js LEVELS, 'default' (the preset's level) or 'fast' (the lowest).
 * For the presets in providers.js the level is mapped to that provider's fields and temperature is left
 * to the provider; any other endpoint gets reasoning_effort for an explicit level only.
 * provider: a preset id, otherwise it's worked out from the endpoint's host. signal: aborting it stops the request.
 * A busy provider (429, 500, 502, 503, 504, 529), a connection that failed before any answer (onRetry hears `dropped`)
 * or a reply that broke off part-way is tried again, `retries` times at
 * most (twice unless told), after the wait the provider names or 1 s then 3 s; the result's `retries` says how many
 * it took. An answer that stopped at the output limit comes back with `truncated: true`.
 * onText: asks the provider for a stream and hears the answer's text as it comes, piece by piece; the result is the
 * same whole message either way. onRetry({ attempt, of, waitMs, streamed }): heard before each wait to try again
 * (attempt 2 of 3 is the second try); streamed says text of the try given up was already heard, and is to be dropped.
 * cache: a key for the conversation a tool loop sends again at each step, which asks the provider to cache its prefix.
 * usage: { input, output, cacheRead?, cacheWrite?, cost? } when the provider counts tokens; cost (US dollars) where
 * the provider reports it (OpenRouter).
 */
export async function chatCompletion({ messages, model, endpoint, apiKey, tools, temperature = 0.2, reasoningEffort, provider: providerId, signal, retries: maxRetries = MAX_RETRIES, onText, onRetry, cache }) {
  const resolved = resolveLLMConfig({ endpoint, apiKey, model });
  if (missingKey(resolved)) {
    return { ok: false, error: NO_API_KEY };
  }
  const url = normalizeChatEndpoint(resolved.endpoint);
  const provider = providerFor(url, providerId);
  // a server Spectrum has no preset for speaks the format its address names: …/messages the Messages API,
  // …/responses the Responses API, anything else Chat Completions
  const api = provider?.api || (/\/messages$/i.test(url) ? 'anthropic' : /\/responses$/i.test(url) ? 'responses' : 'chat');
  const adapter = ADAPTERS[api];
  // a local Ollama takes no key, so a key typed for another server never goes there
  const key = provider?.local ? '' : resolved.apiKey;
  if (badKey(key)) return { ok: false, error: BAD_KEY };
  // an Ollama model's effort levels come from Ollama itself
  const known = (provider?.live && (await liveModel(url, resolved.model))) || provider?.models.find((m) => m.id === resolved.model);
  let host = 'the model provider';
  try {
    host = new URL(url).host;
  } catch {
    // keep the generic name
  }
  const options = {
    // several presets reject any temperature but their own
    temperature: provider ? undefined : temperature,
    // an explicit level for a server with no preset, in its format's own words
    extra: provider ? effortFields(provider, known, reasoningEffort) : !LEVELS.includes(reasoningEffort) ? {} : api === 'anthropic' ? { output_config: { effort: reasoningEffort } } : api === 'responses' ? { reasoning: { effort: reasoningEffort } } : { reasoning_effort: reasoningEffort },
    cache: cache ? String(cache).slice(0, 64) : undefined,
    // Chat Completions has no word for caching of its own: OpenAI's key goes to a server Spectrum has no preset for
    // (most are OpenAI's API behind another address) until it refuses it; the presets cache by themselves or not at all
    cacheKey: cache && !provider && api === 'chat' && !noCacheKey.has(host) ? String(cache).slice(0, 64) : undefined,
    stream: onText ? { ...adapter.stream.fields } : null
  };
  const stopped = { ok: false, error: 'Stopped.', stopped: true };
  const tooSlow = { ok: false, error: `${host} took too long to answer. Try again.` };
  let res;
  let text;
  let data = null;
  let retries = 0;
  // asked to wait longer than Spectrum will: said in the error instead
  let longWait = null;
  // waits before another try, telling the caller; false once stopped
  const again = async (ms, streamed, dropped) => {
    onRetry?.({ attempt: retries + 2, of: maxRetries + 1, waitMs: ms, streamed, ...(dropped && { dropped }) });
    await pause(ms, signal);
    retries += 1;
    return !signal?.aborted;
  };
  // Sent again when the provider rejected a parameter (one is dropped each time) or was busy.
  for (;;) {
    data = null;
    try {
      res = await fetch(adapter.url(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key && adapter.headers(key)) },
        body: JSON.stringify({ ...adapter.body({ model: resolved.model, messages, tools, ...options }), ...options.stream }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (err) {
      if (signal?.aborted) return stopped;
      if (err.name === 'TimeoutError') return tooSlow;
      // no answer came: a connection a VPN or a busy network dropped usually opens on the next try; a server that
      // refused it, a certificate that can't be trusted or a header that can't be built never mends by waiting
      const cause = unreachable(err, host);
      if (!FINAL.includes(cause.kind) && retries < maxRetries) {
        if (!(await again(BACKOFF_MS[retries] ?? BACKOFF_MS.at(-1), false, true))) return stopped;
        continue;
      }
      return { ok: false, error: provider?.local ? `Couldn’t reach Ollama at ${host}. ${NO_OLLAMA}` : `${cause.text}${retries ? ` Spectrum tried ${retries + 1} times.` : ''}` };
    }
    // heard as it comes; a server that answers a stream request whole is read whole
    const streaming = res.ok && options.stream && /event-stream/i.test(res.headers.get('content-type') || '');
    let streamed = false;
    try {
      if (streaming) {
        const said = visibleText((piece) => {
          streamed = true;
          onText(piece);
        });
        const whole = adapter.stream.open();
        for await (const event of sseEvents(res.body)) {
          const piece = adapter.stream.add(whole, event);
          if (piece) said(piece);
        }
        // a failure said inside the stream, after the provider took the request: as a reply that broke off
        if (whole.error) throw Object.assign(new Error(String(whole.error.message || 'The stream failed.')), { provider: true });
        data = whole;
      } else text = await res.text();
    } catch (err) {
      if (signal?.aborted) return stopped;
      if (err.name === 'TimeoutError') return tooSlow;
      // the provider answered and the reply broke off: the address is right, so this is worth another try
      if (retries < maxRetries) {
        if (!(await again(BACKOFF_MS[retries] ?? BACKOFF_MS.at(-1), streamed))) return stopped;
        continue;
      }
      if (err.provider) return { ok: false, error: `The model provider reported an error part-way through the answer: ${err.message.replace(/\.$/, '')}.${retries ? ` Spectrum tried ${retries + 1} times.` : ''}` };
      return { ok: false, error: `The connection to ${host} was lost part-way through the answer${retries ? `, ${retries + 1} times running` : ''}. Try again.` };
    }
    if (streaming) break;
    if (res.status === 400 || res.status === 422) {
      // a server that takes no cache key or no usage in a stream: asked without, and this server not again
      if (options.cacheKey && /prompt_cache_key|unknown|unrecogni[sz]ed|unexpected|extra|additional|not permitted|unsupported/i.test(text)) {
        noCacheKey.add(host);
        options.cacheKey = undefined;
        continue;
      }
      if (options.stream?.stream_options && /stream_options|include_usage/i.test(text)) {
        options.stream = { stream: true };
        continue;
      }
    }
    if (res.status === 400) {
      // Models without reasoning controls reject them.
      if (Object.keys(options.extra).length && /reasoning|thinking|effort/i.test(text)) {
        options.extra = {};
        continue;
      }
      // Reasoning models often only accept the default temperature.
      if (options.temperature !== undefined && /temperature/i.test(text)) {
        options.temperature = undefined;
        continue;
      }
    }
    if (!busy(res, text) || retries >= maxRetries) break;
    const asked = retryAfterMs(res.headers);
    if (asked !== null && asked > MAX_WAIT_MS) {
      longWait = asked;
      break;
    }
    if (!(await again(asked ?? BACKOFF_MS[retries] ?? BACKOFF_MS.at(-1), false))) return stopped;
  }
  if (!res.ok) {
    // the local app has no key: a 401 is a :cloud model while it's signed out of ollama.com
    if (provider?.local && res.status === 401) return { ok: false, error: 'Ollama needs you to sign in to use its cloud models. Sign in from the Ollama app, or run ollama signin.' };
    // a provider or proxy that repeats the key in its message: the message is shown, and saved with the chat
    // (a real key is long; a short stand-in would be found inside ordinary words)
    const said = longWait !== null ? `The provider is busy and asks for a wait of about ${about(longWait)} before another request. Try again then.` : `${providerError(res.status, text)}${retries ? ` Spectrum tried ${retries + 1} times.` : ''}`;
    return { ok: false, error: resolved.apiKey?.length >= 8 ? said.split(resolved.apiKey).join('[API key]') : said, status: res.status, ...(retries && { retries }) };
  }
  if (!data) {
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: 'The model provider sent a reply that couldn’t be read.' };
    }
  }
  const reply = adapter.message(data);
  if (!reply) {
    // OpenRouter reports a failure after the provider accepted the request as a 200 with an error body
    return { ok: false, error: data?.error?.message || 'The model provider returned no answer.' };
  }
  const { truncated, ...message } = reply;
  // open and local reasoning models put their thinking at the start of the answer, in <think> tags
  const content = flattenContent(message.content).replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '');
  // a tool call cut off part-way has half its arguments, so it must never run
  if (truncated && (message.tool_calls?.length || !content)) {
    return { ok: false, error: 'The answer was cut off before it finished. Try a lower effort or a smaller request.' };
  }
  // OpenRouter reports each request's cost in its usage, unasked, in every format and in a stream's last piece
  const usage = usageOf(data.usage, provider?.id === 'openrouter');
  // a text answer that stopped at the output limit is still an answer: the caller says it was cut off
  return { ok: true, message: { ...message, content }, ...(truncated && { truncated: true }), ...(usage && { usage }), ...(retries && { retries }) };
}

// Some providers return content as an array of parts.
function flattenContent(content) {
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  }
  return content || '';
}

export async function callOpenAICompatible({ messages, model, endpoint, apiKey, reasoningEffort, provider, signal, retries }) {
  const result = await chatCompletion({ messages, model, endpoint, apiKey, reasoningEffort, provider, signal, retries });
  if (!result.ok) return result;
  return { ok: true, content: result.message.content, ...(result.truncated && { truncated: true }) };
}

/** Search requires provider-returned sources, not a model's claim that it browsed. */
export async function nativeWebSearch({ query, purpose = 'chat', llmConfig }) {
  const config = resolveLLMConfig(llmConfig);
  if (missingKey(config)) throw new Error(NO_API_KEY);
  if (badKey(config.apiKey)) throw new Error(BAD_KEY);
  const endpoint = normalizeChatEndpoint(config.endpoint);
  const provider = providerFor(endpoint);
  const messages = [{ role: 'user', content: [
    'Search the live web for this request. Return JSON only: {"results":[{"title":"","url":"","summary":"","authors":[],"publishedDate":"","doi":""}]} .',
    purpose === 'references'
      ? 'Find original sources and their citation metadata: complete title, named authors, original publication date (ISO format), publisher and DOI. Leave unknown fields empty; do not infer a publication date from a URL or a copyright year.'
      : 'Return useful web results for the question, with concise summaries and source links. Search the general web without academic or bibliography restrictions.',
    `Request: ${String(query).slice(0, 6000)}`
  ].join('\n') }];
  let url, headers, body;
  if (provider?.api === 'responses' || provider?.api === 'anthropic') {
    const adapter = ADAPTERS[provider.api];
    url = adapter.url(endpoint);
    headers = adapter.headers(config.apiKey);
    const extra = provider.api === 'responses'
      ? { tools: [{ type: 'web_search' }], tool_choice: 'required', include: ['web_search_call.action.sources'] }
      : { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }], max_tokens: 4000 };
    body = adapter.body({ model: config.model, messages, extra });
  } else {
    // shortcut: Gemini grounding needs its required Search Suggestions UI before native support can be enabled.
    throw new Error('This model API has no verified built-in web search. Turn on OpenAlex (no key needed) or another connection in Settings › Search.');
  }
  const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(40_000),
    headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Model web search failed (HTTP ${response.status}).`);
  const data = await response.json();
  let content, sources;
  if (provider.api === 'responses') {
    if (data.status === 'incomplete') throw new Error('Model web search was cut off.');
    content = ADAPTERS.responses.message(data)?.content;
    sources = (data.output || []).flatMap((item) => item.type === 'web_search_call' ? item.action?.sources || [] : [])
      .concat((data.output || []).flatMap((item) => (item.content || []).flatMap((part) => part.annotations || [])));
  } else {
    if (data.stop_reason === 'max_tokens' || data.stop_reason === 'pause_turn') throw new Error('Model web search did not finish.');
    content = ADAPTERS.anthropic.message(data)?.content;
    sources = (data.content || []).flatMap((item) => item.type === 'web_search_tool_result' && Array.isArray(item.content) ? item.content : []);
  }
  sources = (sources || []).filter((s) => /^https?:\/\//i.test(s.url || ''));
  if (!sources.length) throw new Error('The model returned no verified web sources.');
  return { content: content || '', sources };
}

/** Minimal `{ invoke(messages) -> { content } }` client used by the transfer workflow. */
export function createLLM(llmConfig) {
  const config = resolveLLMConfig(llmConfig);
  return {
    async invoke(messages) {
      const result = await chatCompletion({ ...config, messages });
      if (!result.ok) throw new Error(result.error);
      return { content: result.message.content };
    }
  };
}
