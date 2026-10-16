// Self-check for merging the Research tab's parallel web searches. Run:
// npx esbuild apps/frontend/src/editor/tools/research.check.ts --bundle --platform=node --log-level=warning | node
import { uniqueWorks } from './ResearchTab';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const item = (id: string, extra: { title?: string; url?: string; doi?: string; arxiv?: string }) => ({
  id, title: '', summary: '', url: '', bibtex: '', citeKey: '', meta: '', ...extra
});
const ids = (items: { id: string }[]) => items.map((i) => i.id);

eq(
  ids(uniqueWorks([
    item('abs', { title: 'Attention Is All You Need', url: 'https://arxiv.org/abs/1706.03762', arxiv: '1706.03762' }),
    // another query found the HTML view; the model gave the arXiv DOI as a link, or the id with its prefix
    item('html', { title: 'Attention is all you need.', url: 'https://arxiv.org/html/1706.03762v7', arxiv: '1706.03762v7' }),
    item('doi', { title: 'Transformers', doi: 'https://doi.org/10.48550/ARXIV.1706.03762' }),
    item('id only', { title: 'Vaswani et al.', arxiv: 'arXiv:1706.03762' }),
    item('published', { title: 'A journal paper', doi: '10.1000/ABC' }),
    item('published again', { title: 'A Journal Paper (preprint)', doi: '10.1000/abc' }),
    item('page', { title: 'Attention Is All You Need - Google Research', url: 'https://research.google/pubs/attention-is-all-you-need/' }),
    item('page again', { title: 'Something else', url: 'https://www.research.google/pubs/attention-is-all-you-need' }),
    item('untitled', { url: 'https://example.com/a' }),
    item('untitled too', { url: 'https://example.com/b' })
  ])),
  ['abs', 'published', 'page', 'untitled', 'untitled too'],
  'repeats by arXiv id, DOI, title or address'
);

// the same title on two works with their own DOIs: both stay
eq(
  ids(uniqueWorks([
    item('book', { title: 'Deep Learning', url: 'https://www.deeplearningbook.org/' }),
    item('nature', { title: 'Deep learning', doi: '10.1038/nature14539' }),
    item('other', { title: 'Deep learning', doi: '10.1000/other' })
  ])),
  ['book', 'nature', 'other'],
  'a title alone doesn’t merge works that have DOIs'
);

console.log('research.check: ok');
