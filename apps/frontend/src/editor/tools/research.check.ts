// Self-check for merging the Research tab's parallel web searches. Run:
// npx esbuild apps/frontend/src/editor/tools/research.check.ts --bundle --platform=node --log-level=warning | node
import { uniqueWorks } from './ResearchTab';
import { citationCommand, bibtexForDocument, parseJsonReply } from '../shared';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const item = (id: string, extra: { title?: string; url?: string; doi?: string; arxiv?: string }) => ({
  id, title: '', summary: '', url: '', bibtex: '', citeKey: '', meta: '', ...extra
});
const ids = (items: { id: string }[]) => items.map((i) => i.id);

eq(parseJsonReply('Here: {"items":[{"title":"Braces } [ in text"}]} trailing {"ignored":true}'), { items: [{ title: 'Braces } [ in text' }] }, 'balanced extraction uses the first complete reply');
eq(parseJsonReply('```json\n{"text":"line\nbreak"}\n```'), { text: 'line\nbreak' }, 'literal newlines from a model are still repaired');
eq(parseJsonReply('{"files":[{"content":"truncated'), null, 'incomplete instructions stay rejected');

eq(citationCommand('\\usepackage[backend=biber,style=apa]{biblatex}'), '\\parencite', 'APA uses parenthetical citations');
eq(citationCommand('\\usepackage{acl}\n\\addbibresource{custom.bib}'), '\\parencite', 'APA styles loaded through another package');
eq(citationCommand('\\usepackage[round]{natbib}'), '\\citep', 'natbib keeps its compatible command');
eq(citationCommand('% \\usepackage{biblatex}\n\\bibliography{references}'), '\\cite', 'traditional projects keep their citation command');

const webpage = '@misc{OpenAI2026,\n  title = {Paper},\n  url = {https://example.com/paper},\n}';
eq(bibtexForDocument(webpage, '\\bibliographystyle{plain}'), webpage.replace('url = {https://example.com/paper}', 'howpublished = {\\url{https://example.com/paper}}'), 'Research URLs remain visible with classic BibTeX');
for (const source of ['\\usepackage[style=apa]{biblatex}', '\\bibliographystyle{plainnat}', '\\bibliographystyle{plainurl}', '% \\bibliographystyle{plain}']) {
  eq(bibtexForDocument(webpage, source), webpage, 'URL-aware styles retain a single URL field');
}
eq(bibtexForDocument(webpage.replace('@misc', '@article'), '\\bibliographystyle{plain}'), webpage.replace('@misc', '@article'), 'article metadata is preserved');

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
