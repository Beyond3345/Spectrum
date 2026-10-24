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
    apiKey: (llmConfig?.apiKey || (env && process.env.SPECTRUM_LLM_API_KEY) || '').trim(),
    // with no model named, a known provider gets its recommended one
    model: (llmConfig?.model || (env && process.env.SPECTRUM_LLM_MODEL) || providerFor(normalizeChatEndpoint(endpoint))?.recommended.main || DEFAULT_MODEL).trim()
  };
}

export const NO_API_KEY = 'No AI model is set up yet. Add an endpoint, model and API key in Settings → Models.';

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

/** A provider's non-2xx answer as one plain sentence, never the raw body. */
export function providerError(status, text) {
  if (status === 401 || status === 403) return 'The API key was rejected. Check it in Settings → Models.';
  if (status === 404) return 'The endpoint or model wasn’t found. Check Settings → Models.';
  if (status === 429) return 'The provider is limiting requests. Try again shortly.';
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

const textOf = (content) => (typeof content === 'string' ? content : flattenContent(content));
const parseArgs = (args) => {
  try {
    return JSON.parse(args || '{}');
  } catch {
    return {};
  }
};
const functionsOf = (tools) => (tools?.length ? tools.map((t) => t.function) : null);

// Request formats. Each turns OpenAI-style messages and tools into its own body, and its reply back
// into an OpenAI-style message. The raw reply items ride along on the message (_anthropic, _responses)
// so a tool loop can send them back unchanged, as both APIs require for reasoning.
const ADAPTERS = {
  chat: {
    url: (url) => url,
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    body: ({ model, messages, tools, temperature, extra }) => ({
      model,
      messages,
      ...(temperature !== undefined && { temperature }),
      ...(tools?.length && { tools }),
      ...extra
    }),
    message: (data) => data?.choices?.[0]?.message && { ...data.choices[0].message, truncated: data.choices[0].finish_reason === 'length' }
  },

  // Anthropic Messages API
  anthropic: {
    url: (url) => (/\/messages$/.test(url) ? url : `${new URL(url).origin}/v1/messages`),
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    body: ({ model, messages, tools, extra }) => {
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
      return {
        model,
        // required by the API; generous because thinking counts towards it
        max_tokens: ['xhigh', 'max'].includes(extra.output_config?.effort) ? 32000 : 16000,
        ...(system.length && { system: system.join('\n\n') }),
        messages: turns,
        ...(functionsOf(tools) && { tools: functionsOf(tools).map((f) => ({ name: f.name, description: f.description, input_schema: f.parameters })) }),
        ...extra
      };
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
    body: ({ model, messages, tools, extra }) => ({
      model,
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

/**
 * One chat call. Returns { ok, message } where message is an OpenAI-style assistant message
 * (content and/or tool_calls), or { ok: false, error }.
 * reasoningEffort: a level from providers.js LEVELS, 'default' (the preset's level) or 'fast' (the lowest).
 * For the presets in providers.js the level is mapped to that provider's fields and temperature is left
 * to the provider; any other endpoint gets reasoning_effort for an explicit level only.
 * provider: a preset id, otherwise it's worked out from the endpoint's host. signal: aborting it stops the request.
 */
export async function chatCompletion({ messages, model, endpoint, apiKey, tools, temperature = 0.2, reasoningEffort, provider: providerId, signal }) {
  const resolved = resolveLLMConfig({ endpoint, apiKey, model });
  if (missingKey(resolved)) {
    return { ok: false, error: NO_API_KEY };
  }
  const url = normalizeChatEndpoint(resolved.endpoint);
  const provider = providerFor(url, providerId);
  const adapter = ADAPTERS[provider?.api || 'chat'];
  // a local Ollama takes no key, so a key typed for another server never goes there
  const key = provider?.local ? '' : resolved.apiKey;
  // an Ollama model's effort levels come from Ollama itself
  const known = (provider?.live && (await liveModel(url, resolved.model))) || provider?.models.find((m) => m.id === resolved.model);
  const options = {
    // several presets reject any temperature but their own
    temperature: provider ? undefined : temperature,
    extra: provider ? effortFields(provider, known, reasoningEffort) : LEVELS.includes(reasoningEffort) ? { reasoning_effort: reasoningEffort } : {}
  };
  let res;
  let text;
  try {
    // Each retry drops one parameter the provider rejected, so this ends after at most three calls.
    for (;;) {
      res = await fetch(adapter.url(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key && adapter.headers(key)) },
        body: JSON.stringify(adapter.body({ model: resolved.model, messages, tools, ...options })),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      text = await res.text();
      if (res.status !== 400) break;
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
      break;
    }
  } catch (err) {
    if (signal?.aborted) return { ok: false, error: 'Stopped.', stopped: true };
    let host = 'the model provider';
    try {
      host = new URL(url).host;
    } catch {
      // keep the generic name
    }
    return {
      ok: false,
      error: err.name === 'TimeoutError'
        ? `${host} took too long to answer. Try again.`
        : provider?.local
          ? `Couldn’t reach Ollama at ${host}. ${NO_OLLAMA}`
          : `Couldn’t reach ${host}. Check the endpoint in Settings → Models.`
    };
  }
  if (!res.ok) {
    // the local app has no key: a 401 is a :cloud model while it's signed out of ollama.com
    if (provider?.local && res.status === 401) return { ok: false, error: 'Ollama needs you to sign in to use its cloud models. Sign in from the Ollama app, or run ollama signin.' };
    return { ok: false, error: providerError(res.status, text) };
  }
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The model provider sent a reply that couldn’t be read.' };
  }
  const reply = adapter.message(data);
  if (!reply) {
    // OpenRouter reports a failure after the provider accepted the request as a 200 with an error body
    return { ok: false, error: data?.error?.message || 'The model provider returned no answer.' };
  }
  const { truncated, ...message } = reply;
  const content = flattenContent(message.content);
  // a tool call cut off part-way has half its arguments, so it must never run
  if (truncated && (message.tool_calls?.length || !content)) {
    return { ok: false, error: 'The answer was cut off before it finished. Try a lower effort or a smaller request.' };
  }
  return { ok: true, message: { ...message, content } };
}

// Some providers return content as an array of parts.
function flattenContent(content) {
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  }
  return content || '';
}

export async function callOpenAICompatible({ messages, model, endpoint, apiKey, reasoningEffort, provider }) {
  const result = await chatCompletion({ messages, model, endpoint, apiKey, reasoningEffort, provider });
  if (!result.ok) return result;
  return { ok: true, content: result.message.content };
}

/** Search requires provider-returned sources, not a model's claim that it browsed. */
export async function nativeWebSearch({ query, purpose = 'chat', llmConfig }) {
  const config = resolveLLMConfig(llmConfig);
  if (missingKey(config)) throw new Error(NO_API_KEY);
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
    throw new Error('This model API does not support verified built-in web search.');
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
