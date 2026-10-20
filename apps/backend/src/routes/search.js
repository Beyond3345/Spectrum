import { webSearch, searchWithFallback, SEARCH_PROVIDERS } from '../services/searchService.js';
import { suggestCitations } from '../services/citationService.js';
import { resolveLLMConfig } from '../services/llmService.js';

export function registerSearchRoutes(fastify) {
  fastify.post('/api/websearch', async (req) => {
    const { query, provider, apiKey, maxResults, engine, scholarly, searchConfig, purpose = 'references' } = req.body || {};
    if (!query || !String(query).trim()) return { ok: false, error: 'Missing query.' };
    if (!searchConfig && !SEARCH_PROVIDERS.includes(provider)) return { ok: false, error: `Unknown provider: ${provider}` };
    if (!['chat', 'references'].includes(purpose)) return { ok: false, error: 'Unknown search purpose.' };
    try {
      const options = { query: String(query), maxResults, scholarly: scholarly !== false, purpose };
      return { ok: true, ...(searchConfig ? await searchWithFallback({ ...options, searchConfig }) : { results: await webSearch({ ...options, provider, apiKey, engine }) }) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  fastify.post('/api/citations/suggest', async (req) => {
    const { text, llmConfig, searchConfig, maxResults } = req.body || {};
    if (!text || !String(text).trim()) return { ok: false, error: 'Select some text first.' };
    try {
      return { ok: true, ...(await suggestCitations({ text, llmConfig: resolveLLMConfig(llmConfig), searchConfig, maxResults })) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}
