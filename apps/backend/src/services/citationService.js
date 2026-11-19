import { NO_API_KEY, callOpenAICompatible } from './llmService.js';
import { searchPapers, searchWithFallback } from './searchService.js';
import { extractJSON } from './transferAgent/utils.js';
import { latexToText } from '../latex/conversion.js';
import { DATA_RULE, untrusted } from '../utils/outsideText.js';

function citeKey(bibtex) {
  return String(bibtex).match(/@\w+\s*\{\s*([^,\s]+)\s*,/)?.[1] || '';
}

/**
 * Citation assistant: turn a passage into search queries, find candidate papers and
 * let the model pick the ones that actually support the passage. Works without an
 * LLM too (plain keyword search, no ranking), and says so in `note` when the model was
 * asked and failed: the results are then the passage's own words searched, unranked.
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
        content: `You help researchers cite prior work. Read the passage, from a paper’s LaTeX, Typst or Markdown source, and write 1-3 short academic search queries (plain keywords, no markup) for the claims that need a citation. Return JSON only: {"queries":["..."]}. ${DATA_RULE}`
      },
      { role: 'user', content: untrusted('the passage', passage) }
    ]
  });
  if (queryRes.ok) {
    queries = (extractJSON(queryRes.content)?.queries || []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 3);
  }
  if (!queries.length) {
    queries = [latexToText(passage).split(/\s+/).filter(Boolean).slice(0, 12).join(' ')];
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
  // a model that was set up and failed (a rejected key, no credit, a busy provider) is said, not hidden
  let failure = queryRes.ok || queryRes.error === NO_API_KEY ? '' : queryRes.error;
  if (queryRes.ok && candidates.length) {
    const rankRes = await callOpenAICompatible({
      ...llmConfig,
      messages: [
        {
          role: 'system',
          content: `Pick up to ${limit} papers that best support the passage. Skip unrelated ones. Return JSON only: {"picks":[{"index":0,"reason":"one short sentence"}]}. ${DATA_RULE}`
        },
        {
          role: 'user',
          content: untrusted('the passage and the papers found', JSON.stringify({
            passage,
            candidates: candidates.map((p, index) => ({ index, title: p.title, year: p.year, abstract: p.summary.slice(0, 300) }))
          }))
        }
      ]
    });
    if (!rankRes.ok) failure = rankRes.error;
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
    papers: picks.map(({ paper, reason }) => ({ ...paper, reason, citeKey: citeKey(paper.bibtex) })),
    ...(failure && { note: `The model couldn’t be asked, so these are a plain search of the passage’s words, unranked. ${failure}` })
  };
}
