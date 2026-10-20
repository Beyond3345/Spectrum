import { callOpenAICompatible } from './llmService.js';
import { searchPapers, searchWithFallback } from './searchService.js';
import { extractJSON } from './transferAgent/utils.js';

function citeKey(bibtex) {
  return String(bibtex).match(/@\w+\s*\{\s*([^,\s]+)\s*,/)?.[1] || '';
}

/**
 * Citation assistant: turn a passage into search queries, find candidate papers and
 * let the model pick the ones that actually support the passage. Works without an
 * LLM too (plain keyword search, no ranking).
 */
export async function suggestCitations({ text, llmConfig, searchConfig, maxResults = 5 }) {
  const passage = String(text || '').trim().slice(0, 4000);
  const limit = Math.min(10, Math.max(1, Number(maxResults) || 5));

  let queries = [];
  const queryRes = await callOpenAICompatible({
    ...llmConfig,
    reasoningEffort: 'fast',
    messages: [
      {
        role: 'system',
        content: 'You help researchers cite prior work. Read the LaTeX passage and write 1-3 short academic search queries (keywords, no LaTeX) for the claims that need a citation. Return JSON only: {"queries":["..."]}.'
      },
      { role: 'user', content: passage }
    ]
  });
  if (queryRes.ok) {
    queries = (extractJSON(queryRes.content)?.queries || []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 3);
  }
  if (!queries.length) {
    queries = [passage.replace(/\\[a-zA-Z]+(\{[^}]*\})?|[{}$%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 12).join(' ')];
  }

  const seen = new Set();
  const candidates = [];
  for (const query of queries) {
    const papers = searchConfig ? (await searchWithFallback({ query, searchConfig, purpose: 'references', maxResults: 6 })).results : await searchPapers(query, 6);
    for (const paper of papers) {
      const id = paper.title.toLowerCase();
      if (!paper.title || seen.has(id)) continue;
      seen.add(id);
      candidates.push(paper);
    }
  }

  let picks = candidates.slice(0, limit).map((paper) => ({ paper, reason: '' }));
  if (queryRes.ok && candidates.length) {
    const rankRes = await callOpenAICompatible({
      ...llmConfig,
      messages: [
        {
          role: 'system',
          content: `Pick up to ${limit} papers that best support the passage. Skip unrelated ones. Return JSON only: {"picks":[{"index":0,"reason":"one short sentence"}]}.`
        },
        {
          role: 'user',
          content: JSON.stringify({
            passage,
            candidates: candidates.map((p, index) => ({ index, title: p.title, year: p.year, abstract: p.summary.slice(0, 300) }))
          })
        }
      ]
    });
    const ranked = rankRes.ok ? extractJSON(rankRes.content)?.picks : null;
    if (Array.isArray(ranked) && ranked.length) {
      picks = ranked
        .filter((pick) => candidates[pick?.index])
        .slice(0, limit)
        .map((pick) => ({ paper: candidates[pick.index], reason: String(pick.reason || '') }));
    }
  }

  return {
    queries,
    papers: picks.map(({ paper, reason }) => ({ ...paper, reason, citeKey: citeKey(paper.bibtex) }))
  };
}
