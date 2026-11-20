// Test connection in Settings › Models: asks the provider for its model list with the key as typed, and never for a
// chat or a completion, so the test costs nothing. Model-list requests checked against each provider's API docs in
// November 2026: OpenAI, Anthropic, Gemini (OpenAI-compatible), DeepSeek, Moonshot and Meta list at …/models and check
// the key there. OpenRouter and Ollama Cloud list in public, so the key is checked at their free key and balance
// requests. Z.ai documents no model list, and Qwen's compatible mode none either: those answer “no list here”.
import { BACKOFF_MS, BAD_KEY, FINAL, badKey, normalizeChatEndpoint, providerError, resolveLLMConfig, unreachable } from './llmService.js';
import { providerFor } from './providers.js';

const TIMEOUT_MS = 15000;

// where a provider whose model list needs no key checks one without spending anything
const KEY_CHECKS = {
  openrouter: (origin) => `${origin}/api/v1/key`,
  'ollama-cloud': (origin) => `${origin}/api/balance`
};

/** A GET that tries again, twice at most, when no answer came: the cause of the last failure is thrown. */
async function get(url, headers) {
  for (let tries = 0; ; tries += 1) {
    try {
      // a redirect is not followed, so the key never goes to another host
      return await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      if (err.name === 'TimeoutError' || FINAL.includes(unreachable(err, '').kind) || tries >= BACKOFF_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[tries]));
    }
  }
}

/** The model ids in a list answer: data[].id (OpenAI, Anthropic and most others) or models[].name (Ollama). */
function idsOf(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(body?.data) ? body.data.map((m) => m?.id) : Array.isArray(body?.models) ? body.models.map((m) => m?.name || m?.model) : null;
  // Gemini's compatible layer has named its models models/gemini-…, which its chat requests don't take
  return list && [...new Set(list.filter((id) => typeof id === 'string' && id).map((id) => id.replace(/^models\//, '')))];
}

const plural = (n) => `${n} model${n === 1 ? '' : 's'}`;

/**
 * { ok, kind, message, models? }. kind: connected, key (refused), nolist (the server answered without a list), busy,
 * error (another status), or why no answer came (name, refused, reset, timeout, network, certificate, header, other).
 * models: the ids the provider lists, also when the key was refused but the list is public.
 */
export async function testConnection({ provider: id, endpoint, apiKey }) {
  const preset = providerFor('', id);
  if (!preset && !String(endpoint || '').trim()) return { ok: false, kind: 'endpoint', message: 'Type the endpoint first.' };
  const config = resolveLLMConfig({ endpoint: String(endpoint || '').trim() || preset.endpoint, apiKey: String(apiKey || ''), model: 'none' });
  const url = normalizeChatEndpoint(config.endpoint);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, kind: 'endpoint', message: 'The endpoint isn’t a web address. Check it in Settings › Models.' };
  }
  const p = providerFor(url, preset?.id);
  const api = p?.api || (/\/messages$/i.test(url) ? 'anthropic' : /\/responses$/i.test(url) ? 'responses' : 'chat');
  const key = p?.local ? '' : config.apiKey;
  const host = parsed.host;
  const name = p?.name || host;
  if (!key && !p?.local && !/^http:/i.test(url)) return { ok: false, kind: 'key', message: 'Paste the API key first.' };
  if (badKey(key)) return { ok: false, kind: 'header', message: BAD_KEY };

  const auth = !key ? {} : api === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${key}` };
  // Ollama lists at /api/tags; the others beside their chat address, Anthropic's a page of up to 1000
  const listUrl = p?.live
    ? `${normalizeChatEndpoint(config.endpoint).replace(/\/v1\/chat\/completions$/i, '')}/api/tags`
    : /\/(chat\/completions|responses|messages)$/i.test(url)
      ? `${url.replace(/\/(chat\/completions|responses|messages)$/i, '/models')}${api === 'anthropic' ? '?limit=1000' : ''}`
      : `${parsed.origin}/v1/models`;
  const keyCheck = key && KEY_CHECKS[p?.id];
  const redact = (text) => (key.length >= 8 ? text.split(key).join('[API key]') : text);
  const refused = (status) => ({
    ok: false,
    kind: 'key',
    message: `${host} refused the key (HTTP ${status}). Check that it was copied whole${p?.regions ? ' and made in this region' : ''}.`
  });

  let res, text, checked;
  try {
    res = await get(listUrl, keyCheck ? {} : auth);
    text = await res.text();
    if (keyCheck) checked = await get(keyCheck(parsed.origin), auth);
  } catch (err) {
    if (err.name === 'TimeoutError') return { ok: false, kind: 'timeout', message: `${host} took longer than ${TIMEOUT_MS / 1000} seconds to answer. Try again.` };
    const cause = unreachable(err, host);
    return { ok: false, kind: cause.kind, message: cause.text };
  }

  const ids = res.ok ? idsOf(text) : null;
  if (checked && !checked.ok) {
    if ([401, 403].includes(checked.status)) return { ...refused(checked.status), ...(ids && { models: ids }) };
  }
  if (ids) {
    const listed = ids.length ? `offers ${plural(ids.length)}` : 'lists no models';
    // a list that needs no key says nothing about the key, unless it was checked apart
    const said = !key ? `Connected to ${host}, which ${listed}.` : keyCheck && !checked?.ok ? `Connected to ${host}, which ${listed}. Spectrum couldn’t check the key (HTTP ${checked.status}).` : `Connected to ${host}. It accepted the key, and ${name} ${listed}.`;
    return { ok: true, kind: 'connected', message: said, models: ids };
  }
  if ([401, 403].includes(res.status)) return refused(res.status);
  // Google has answered a bad key with a 400 that names it
  if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(text)) return refused(400);
  if (res.status === 429) return { ok: false, kind: 'busy', message: `${host} answered, but it is limiting requests just now. Try again shortly.` };
  if (res.ok || [404, 405, 501].includes(res.status) || (res.status >= 300 && res.status < 400)) {
    return {
      ok: false,
      kind: 'nolist',
      message: `${host} answered, but it has no model list at this address${res.ok ? '' : ` (HTTP ${res.status})`}. The server was reached; Spectrum can’t check the key or the model further without sending a message.`
    };
  }
  return { ok: false, kind: 'error', message: redact(`${host} answered with an error. ${providerError(res.status, text)}`) };
}
