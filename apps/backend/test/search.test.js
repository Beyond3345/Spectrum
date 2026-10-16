// Web search providers: request shapes, result mapping, BibTeX and the DOI/arXiv upgrade, against a
// fake fetch; DDGS against the real Python with a fake ddgs module. No network.
// Run: node --test apps/backend/test/search.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolvePythonExecutable } from '../src/services/plotService.js';
import { searchDdgs, searchOpenAlex, toResult, upgradeResult, webSearch } from '../src/services/searchService.js';

// Every request goes to the first route whose pattern matches its URL; anything else is a 404.
const calls = [];
let routes = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const route = routes.find(([pattern]) => pattern.test(String(url)));
  return route ? route[1](String(url), init) : new Response('not found', { status: 404 });
};
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const serve = (...r) => {
  calls.length = 0;
  routes = r;
};
const fields = (bib) => Object.fromEntries([...bib.matchAll(/^ {2}(\w+)\s+= \{(.*)\},$/gm)].map((m) => [m[1], m[2]]));
const typeAndKey = (bib) => bib.match(/^@(\w+)\{([^,]+),/).slice(1);

const CSL = {
  type: 'article-journal',
  title: 'Deep Learning',
  author: [{ family: 'LeCun', given: 'Yann' }, { family: 'Bengio', given: 'Yoshua' }],
  issued: { 'date-parts': [[2015]] },
  'container-title': 'Nature',
  volume: '521',
  page: '436-444',
  DOI: '10.1038/nature14539'
};

test('Exa: publications for research questions, the whole web otherwise, DOIs looked up', async () => {
  serve(
    [/api\.exa\.ai/, () => json({
      results: [
        {
          title: 'Deep learning | Nature',
          url: 'https://www.nature.com/articles/nature14539',
          entities: [{ type: 'publication', properties: { title: 'Deep learning', year: 2015, type: 'article', authors: [{ name: 'Yann LeCun' }], doi: '10.1038/nature14539', abstract: 'Deep learning allows…' } }]
        },
        { title: 'circuitikz – CTAN', url: 'https://ctan.org/pkg/circuitikz', publishedDate: '2024-05-01T00:00:00.000Z', highlights: ['Draw electrical networks', 'with TikZ'] }
      ]
    })],
    [/doi\.org\/10\.1038\/nature14539/, () => json(CSL)]
  );
  const results = await webSearch({ provider: 'exa', query: 'deep learning review', apiKey: 'exa-key', maxResults: 3 });
  const exa = calls.find((c) => c.url.includes('exa.ai'));
  assert.equal(exa.url, 'https://api.exa.ai/search');
  assert.equal(exa.init.method, 'POST');
  assert.equal(exa.init.headers['x-api-key'], 'exa-key');
  assert.deepEqual(JSON.parse(exa.init.body), { query: 'deep learning review', numResults: 3, category: 'publication', contents: { highlights: { maxCharacters: 600 } } });

  const [paper, page] = results;
  assert.deepEqual(typeAndKey(paper.bibtex), ['article', 'LeCun2015Deep']);
  assert.equal(fields(paper.bibtex).journal, 'Nature');
  assert.equal(paper.url, 'https://www.nature.com/articles/nature14539');
  assert.equal(paper.summary, 'Deep learning allows…');
  assert.deepEqual([paper.doi, paper.year, paper.venue], ['10.1038/nature14539', '2015', 'Nature']);
  assert.equal(typeAndKey(page.bibtex)[0], 'misc');
  assert.equal(fields(page.bibtex).howpublished, '\\url{https://ctan.org/pkg/circuitikz}');
  assert.match(fields(page.bibtex).note, /^Accessed \d+ \w+ \d{4}$/);
  assert.equal(fields(page.bibtex).year, '2024');
  assert.equal(page.summary, 'Draw electrical networks … with TikZ');

  // a LaTeX question searches the whole web
  serve([/api\.exa\.ai/, () => json({ results: [] })]);
  await webSearch({ provider: 'exa', query: 'circuitikz resistor', apiKey: 'exa-key', scholarly: false });
  assert.equal(JSON.parse(calls[0].init.body).category, undefined);
  await assert.rejects(webSearch({ provider: 'exa', query: 'x' }), /Exa needs an API key/);
});

test('Brave and Tavily favour citable sites without leaving the rest out', async () => {
  serve([/brave\.com/, () => json({ web: { results: [{ title: 'T', url: 'https://tex.stackexchange.com/q/1', description: '<strong>T</strong> answer' }] } })]);
  const [brave] = await webSearch({ provider: 'brave', query: 'q', apiKey: 'b' });
  const params = new URL(calls[0].url).searchParams;
  assert.equal(params.get('text_decorations'), 'false');
  assert.match(params.get('goggles'), /^\$boost=3,site=arxiv\.org\n(.+\n)*\$boost=3,site=ctan\.org\n/);
  assert.equal(brave.summary, 'T answer');

  serve([/tavily\.com/, () => json({ results: [] })]);
  await webSearch({ provider: 'tavily', query: 'q', apiKey: 't' });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.include_domains_mode, 'prefer');
  assert.ok(body.include_domains.includes('tex.stackexchange.com'));
  assert.equal(body.search_depth, 'advanced');
});

test('OpenAlex and Semantic Scholar build BibTeX from their own metadata', async () => {
  serve([/openalex\.org/, () => json({
    results: [{
      id: 'https://openalex.org/W1',
      doi: 'https://doi.org/10.1109/cvpr.2016.90',
      display_name: 'Deep Residual Learning for Image Recognition',
      publication_year: 2016,
      type: 'article',
      authorships: [{ author: { display_name: 'Kaiming He' } }, { author: { display_name: 'Xiangyu Zhang' } }],
      primary_location: { landing_page_url: 'https://doi.org/10.1109/cvpr.2016.90', raw_source_name: '2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)', source: { display_name: 'CVPR', type: 'conference', host_organization_name: 'IEEE' } },
      biblio: { first_page: '770', last_page: '778' },
      abstract_inverted_index: { Deeper: [0], networks: [1] }
    }]
  })]);
  const [work] = await searchOpenAlex('resnet', 5, 'oa-key');
  const params = new URL(calls[0].url).searchParams;
  assert.match(params.get('filter'), /^type:article\|conference-paper\|preprint\|.*,is_retracted:false$/);
  assert.equal(params.get('api_key'), 'oa-key');
  assert.equal(calls.length, 1, 'no lookups for OpenAlex');
  assert.deepEqual(typeAndKey(work.bibtex), ['inproceedings', 'He2016Deep']);
  assert.deepEqual(fields(work.bibtex), {
    author: 'He, Kaiming and Zhang, Xiangyu',
    title: 'Deep Residual Learning for Image Recognition',
    booktitle: '2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)',
    year: '2016',
    pages: '770--778',
    publisher: 'IEEE',
    doi: '10.1109/cvpr.2016.90'
  });
  assert.equal(work.summary, 'Deeper networks');

  serve([/semanticscholar\.org/, () => json({
    data: [{
      title: 'Attention Is All You Need', url: 'https://www.semanticscholar.org/paper/1', year: 2017, venue: 'arXiv.org',
      journal: { name: 'ArXiv', volume: 'abs/1706.03762' }, publicationTypes: ['JournalArticle'],
      authors: [{ name: 'Ashish Vaswani' }], externalIds: { ArXiv: '1706.03762', DOI: '10.48550/arXiv.1706.03762' }
    }]
  })]);
  const [paper] = await webSearch({ provider: 'semanticscholar', query: 'attention' });
  assert.equal(calls.length, 1, 'no lookups for Semantic Scholar');
  assert.equal(fields(paper.bibtex).journal, 'arXiv preprint arXiv:1706.03762');
  assert.equal(fields(paper.bibtex).eprint, '1706.03762');
  assert.equal(fields(paper.bibtex).volume, undefined);
  assert.equal(paper.arxiv, '1706.03762');
});

test('Google Scholar results become entries, and arXiv links are looked up through their DOI', async () => {
  serve(
    [/serpapi\.com/, () => json({
      organic_results: [
        { title: 'Attention is all you need', link: 'https://arxiv.org/abs/1706.03762v7', snippet: 'The dominant…', publication_info: { summary: 'A Vaswani, N Shazeer… - arXiv preprint, 2017 - arxiv.org' } },
        { title: 'The TeXbook', type: 'Book', link: 'https://example.com/texbook', publication_info: { summary: 'DE Knuth - 1984 - Addison-Wesley' } },
        { title: 'A paper', link: 'https://proceedings.example/p1', publication_info: { summary: 'J Doe, R Roe - Advances in neural …, 2020 - proceedings.example' } },
        { title: 'Notes', link: 'https://example.com/notes', publication_info: { summary: 'J Doe - example.com' } }
      ]
    })],
    [/doi\.org\/10\.48550\/arXiv\.1706\.03762/, () => json({
      type: 'article', title: 'Attention Is All You Need', DOI: '10.48550/ARXIV.1706.03762', categories: ['Computation and Language (cs.CL)'],
      author: [{ family: 'Vaswani', given: 'Ashish' }, { family: 'Shazeer', given: 'Noam' }], issued: { 'date-parts': [[2017]] }
    })]
  );
  const [attention, book, cut, notes] = await webSearch({ provider: 'serpapi', query: 'attention', apiKey: 's' });
  assert.equal(new URL(calls[0].url).searchParams.get('engine'), 'google_scholar');
  assert.equal(fields(attention.bibtex).author, 'Vaswani, Ashish and Shazeer, Noam');
  assert.equal(fields(attention.bibtex).primaryClass, 'cs.CL');
  assert.equal(attention.url, 'https://arxiv.org/abs/1706.03762v7');
  assert.deepEqual(typeAndKey(book.bibtex), ['book', 'Knuth1984TeXbook']);
  // a venue Scholar cut short isn't written as a journal, so the entry is @misc
  assert.equal(typeAndKey(cut.bibtex)[0], 'misc');
  assert.equal(fields(cut.bibtex).author, 'Doe, J and Roe, R');
  // and the site isn't a journal either
  assert.equal(typeAndKey(notes.bibtex)[0], 'misc');
});

test('a failed or late lookup keeps the entry the provider gave', async () => {
  const page = toResult({ rec: { type: 'webpage', title: 'A DOI page', URL: 'https://doi.org/10.1234/missing', accessed: '2026-10-17T00:00:00Z' } }, 'brave');
  assert.equal(page.doi, '10.1234/missing');
  // doi.org and Crossref both answer 404
  serve();
  assert.equal(await upgradeResult(page), page);
  assert.ok(calls.some((c) => c.url.includes('doi.org/10.1234/missing')));

  serve([/doi\.org/, () => new Promise((resolve) => setTimeout(() => resolve(json(CSL)), 300))]);
  const slow = { ...page, doi: '10.1038/nature14539' };
  const started = Date.now();
  assert.equal(await upgradeResult(slow, Date.now() + 50), slow);
  assert.ok(Date.now() - started < 250, 'gave up at the deadline');
});

// ─── DDGS: the real Python, with a fake ddgs module on PYTHONPATH ───

const python = resolvePythonExecutable();
const noPython = spawnSync(python, ['--version'], { windowsHide: true }).status !== 0 && 'needs Python';
const scratch = mkdtempSync(path.join(tmpdir(), 'spectrum-search-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

function fakeDdgs(name, source) {
  mkdirSync(path.join(scratch, name, 'ddgs'), { recursive: true });
  writeFileSync(path.join(scratch, name, 'ddgs', '__init__.py'), source);
  return path.join(scratch, name);
}

test('DDGS passes the query safely and maps its results', { skip: noPython }, async (t) => {
  t.after(() => delete process.env.PYTHONPATH);
  process.env.PYTHONPATH = fakeDdgs('works', [
    'class DDGSException(Exception): pass',
    'class RatelimitException(DDGSException): pass',
    'class DDGS:',
    '    def __init__(self, timeout=None): pass',
    '    def text(self, query, max_results=10, backend="auto"):',
    '        if query == "none": raise DDGSException("No results found.")',
    '        if query == "busy": raise RatelimitException("202 Ratelimit")',
    '        return [{"title": query, "href": "https://example.com/a", "body": "%s|%s" % (backend, max_results)}]',
    ''
  ].join('\n'));
  serve();
  const tricky = 'O’Brien "quoted" $(rm -rf ~) `x` & | ; % ! \\ naïve';
  const [hit] = await webSearch({ provider: 'ddgs', query: tricky, maxResults: 4 });
  assert.equal(hit.title, tricky);
  assert.equal(hit.summary, 'google,bing,brave,duckduckgo,startpage,mojeek,yahoo|4');
  assert.equal(typeAndKey(hit.bibtex)[0], 'misc');
  assert.equal(fields(hit.bibtex).howpublished, '\\url{https://example.com/a}');
  assert.deepEqual(await searchDdgs('none', 5), []);
  await assert.rejects(searchDdgs('busy', 5), /limiting requests/);
});

test('DDGS says how to install it when the package is missing', { skip: noPython }, async (t) => {
  t.after(() => delete process.env.PYTHONPATH);
  process.env.PYTHONPATH = fakeDdgs('missing', 'raise ImportError("No module named ddgs")\n');
  await assert.rejects(searchDdgs('q', 5), /DDGS isn’t installed for .+\. Install it with: pip install ddgs/);
});

test('DDGS without Python says so', async (t) => {
  const was = process.env.SPECTRUM_PYTHON;
  t.after(() => (was === undefined ? delete process.env.SPECTRUM_PYTHON : (process.env.SPECTRUM_PYTHON = was)));
  process.env.SPECTRUM_PYTHON = path.join(scratch, 'no-such-python');
  await assert.rejects(searchDdgs('q', 5), /Python wasn’t found .+ pip install ddgs/);
});
