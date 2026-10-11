import { LEVELS, effortFields, providerFor } from './providers.js';

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
 * provider: a preset id, otherwise it's worked out from the endpoint's host.
 */
export async function chatCompletion({ messages, model, endpoint, apiKey, tools, temperature = 0.2, reasoningEffort, provider: providerId }) {
  const resolved = resolveLLMConfig({ endpoint, apiKey, model });
  if (!resolved.apiKey) {
    return { ok: false, error: NO_API_KEY };
  }
  const url = normalizeChatEndpoint(resolved.endpoint);
  const provider = providerFor(url, providerId);
  const adapter = ADAPTERS[provider?.api || 'chat'];
  const options = {
    // several presets reject any temperature but their own
    temperature: provider ? undefined : temperature,
    extra: provider ? effortFields(provider, resolved.model, reasoningEffort) : LEVELS.includes(reasoningEffort) ? { reasoning_effort: reasoningEffort } : {}
  };
  let res;
  let text;
  try {
    // Each retry drops one parameter the provider rejected, so this ends after at most three calls.
    for (;;) {
      res = await fetch(adapter.url(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adapter.headers(resolved.apiKey) },
        body: JSON.stringify(adapter.body({ model: resolved.model, messages, tools, ...options })),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
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
        : `Couldn’t reach ${host}. Check the endpoint in Settings → Models.`
    };
  }
  if (!res.ok) {
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
