import { searchArxiv } from '../services/arxivService.js';

export function registerArxivRoutes(fastify) {
  fastify.post('/api/arxiv/search', async (req) => {
    const { query, maxResults } = req.body || {};
    if (!query || !String(query).trim()) {
      return { ok: false, error: 'Missing query.' };
    }
    try {
      return { ok: true, papers: await searchArxiv(query, maxResults) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}
