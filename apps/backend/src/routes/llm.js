import { callOpenAICompatible, listLiveModels } from '../services/llmService.js';
import { PROVIDERS, providerFor } from '../services/providers.js';

export function registerLLMRoutes(fastify) {
  fastify.post('/api/llm', async (req) => {
    const { messages, model, llmConfig, reasoningEffort } = req.body || {};
    const result = await callOpenAICompatible({
      messages,
      model: llmConfig?.model || model,
      endpoint: llmConfig?.endpoint,
      apiKey: llmConfig?.apiKey,
      reasoningEffort
    });
    return result;
  });

  // the presets for Settings → Models, without the request-building parts
  fastify.get('/api/llm/providers', async () => ({
    providers: PROVIDERS.map(({ hosts, fields: _fields, api: _api, ...preset }) => ({ ...preset, hosts: hosts.map((re) => re.source) }))
  }));

  // the models an Ollama server has right now; the page can't ask it itself, since it's another origin
  fastify.post('/api/llm/models', async (req) => {
    const { provider, endpoint } = req.body || {};
    const preset = providerFor('', provider);
    if (!preset?.live) return { ok: false, error: `Unknown provider: ${provider}` };
    return listLiveModels(preset, typeof endpoint === 'string' ? endpoint : '');
  });
}
