import { webSearch, SEARCH_PROVIDERS } from '../services/searchService.js';
import { suggestCitations } from '../services/citationService.js';
import { resolveLLMConfig } from '../services/llmService.js';

export function registerSearchRoutes(fastify) {
  fastify.post('/api/websearch', async (req) => {
    const { query, provider, apiKey, maxResults, engine } = req.body || {};
    if (!query || !String(query).trim()) return { ok: false, error: 'Missing query.' };
    if (!SEARCH_PROVIDERS.includes(provider)) return { ok: false, error: `Unknown provider: ${provider}` };
    try {
      return { ok: true, results: await webSearch({ provider, query: String(query), apiKey, maxResults, engine }) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  fastify.post('/api/citations/suggest', async (req) => {
    const { text, llmConfig, maxResults } = req.body || {};
    if (!text || !String(text).trim()) return { ok: false, error: 'Select some text first.' };
    try {
      return { ok: true, ...(await suggestCitations({ text, llmConfig: resolveLLMConfig(llmConfig), maxResults })) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}
