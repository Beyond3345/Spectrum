import { callOpenAICompatible } from '../services/llmService.js';
import { PROVIDERS } from '../services/providers.js';

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
}
