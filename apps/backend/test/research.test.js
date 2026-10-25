// Research: every source searched at once and merged into a session in .spectrum/research, the session routes'
// field-by-field changes, adds through the references resolver, triage with a stubbed model, notes and PDFs.
// In-process, with a fake fetch per source, throwaway data and projects folders and a fake home folder. No network.
// Run: node --test apps/backend/test/research.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-research-')));
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  USERPROFILE: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
delete process.env.SPECTRUM_LLM_API_KEY;
const { default: Fastify } = await import('fastify');
const { registerResearchRoutes } = await import('../src/routes/research.js');
const { createProject } = await import('../src/services/projectService.js');
const { keywords, markInBib, mergeResults, parsePubmed } = await import('../src/services/researchService.js');
const { buildBibIndex } = await import('../src/services/referenceService.js');
const { searchArxiv } = await import('../src/services/arxivService.js');

const app = Fastify();
registerResearchRoutes(app);
after(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

// Every request goes to the first route whose pattern matches its URL; anything else is a 404.
const calls = [];
let routes = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const route = routes.find(([pattern]) => pattern.test(String(url)));
  return route ? route[1](String(url), init) : new Response('not found', { status: 404 });
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const serve = (...r) => {
  calls.length = 0;
  routes = r;
};
const callTo = (host) => calls.find((c) => new URL(c.url).host === host);

async function api(url, method = 'GET', body) {
  const res = await app.inject({ url, method, ...(body !== undefined && { payload: body }) });
  return { status: res.statusCode, json: res.json() };
}

const newProject = (name, files) => createProject({
  name,
  populate: async (root) => {
    for (const [rel, text] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await fs.writeFile(path.join(root, rel), text);
    }
  }
});
const MAIN = '\\documentclass{article}\n\\begin{document}\n\\bibliography{references}\n\\end{document}\n';

// One paper three sources know (by DOI, arXiv id and title), and one each of their own.
const OPENALEX = {
  results: [
    {
      id: 'https://openalex.org/W1', doi: 'https://doi.org/10.5555/attn', display_name: 'Attention Is All You Need', publication_year: 2017, type: 'article',
      authorships: [{ author: { display_name: 'Ashish Vaswani' } }], primary_location: { landing_page_url: 'https://doi.org/10.5555/attn', source: { display_name: 'NeurIPS', type: 'conference' } },
      cited_by_count: 900, open_access: { is_oa: true, oa_url: 'https://arxiv.org/pdf/1706.03762v7' }
    },
    {
      id: 'https://openalex.org/W2', doi: 'https://doi.org/10.5555/gnn', display_name: 'Graph networks for molecules', publication_year: 2020, type: 'article',
      authorships: [{ author: { display_name: 'Ada Lovelace' } }], primary_location: { source: { display_name: 'Chemistry Letters' } },
      abstract_inverted_index: { Graph: [0], networks: [1] }, cited_by_count: 12, open_access: { is_oa: true, oa_url: 'https://203.0.113.7/gnn.pdf' }
    }
  ]
};
const SEMANTIC = {
  data: [{
    title: 'Attention is all you need', url: 'https://www.semanticscholar.org/paper/1', year: 2017, venue: 'Neural Information Processing Systems',
    authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }], externalIds: { ArXiv: '1706.03762', DOI: '10.5555/attn' },
    abstract: 'The dominant sequence transduction models are based on complex recurrent networks.', citationCount: 1000, publicationTypes: ['Conference']
  }]
};
const ARXIV = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
<entry><id>http://arxiv.org/abs/1706.03762v7</id><published>2017-06-12T17:57:34Z</published><title>Attention Is All You Need</title>
<summary>The dominant sequence transduction models.</summary><author><name>Ashish Vaswani</name></author></entry>
<entry><id>http://arxiv.org/abs/2401.00001v1</id><published>2024-01-01T00:00:00Z</published><title>A preprint on attention</title>
<summary>Only a preprint.</summary><author><name>Grace Hopper</name></author></entry></feed>`;
const CROSSREF = {
  message: {
    items: [
      { DOI: '10.5555/ATTN', title: ['Attention is All you Need'], author: [{ given: 'Ashish', family: 'Vaswani' }], issued: { 'date-parts': [[2017]] }, 'container-title': ['Advances in Neural Information Processing Systems'], type: 'proceedings-article', 'is-referenced-by-count': 950 },
      { DOI: '10.5555/fig1', title: ['Figure 1'], type: 'component' },
      { DOI: '10.5555/sorting', title: ['Sorting attention'], author: [{ given: 'Alan', family: 'Turing' }], issued: { 'date-parts': [[2019]] }, type: 'journal-article', abstract: '<jats:p>Sorting <jats:italic>fast</jats:italic>.</jats:p>' }
    ]
  }
};
const PUBMED = `<?xml version="1.0" ?><PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">42</PMID><Article>
<Journal><JournalIssue><PubDate><Year>2021</Year></PubDate></JournalIssue><Title>Journal of Attention</Title></Journal>
<ArticleTitle>Attention in <i>Drosophila</i> &amp; mice.</ArticleTitle><Abstract><AbstractText Label="BACKGROUND">Flies <sup>2</sup> attend.</AbstractText><AbstractText Label="RESULTS">They do.</AbstractText></Abstract>
<AuthorList><Author><LastName>Curie</LastName><ForeName>Marie</ForeName></Author><Author><CollectiveName>Fly Consortium</CollectiveName></Author></AuthorList>
<PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation>
<PubmedData><ArticleIdList><ArticleId IdType="pubmed">42</ArticleId><ArticleId IdType="doi">10.5555/fly</ArticleId><ArticleId IdType="pmc">PMC123</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;

const sources = () => [
  [/api\.openalex\.org/, () => json(OPENALEX)],
  [/api\.semanticscholar\.org/, () => json(SEMANTIC)],
  [/export\.arxiv\.org/, () => new Response(ARXIV)],
  [/api\.crossref\.org/, () => json(CROSSREF)],
  [/esearch\.fcgi/, () => json({ esearchresult: { idlist: ['42'] } })],
  [/efetch\.fcgi/, () => new Response(PUBMED)],
  [/api\.search\.brave\.com/, () => json({ web: { results: [{ title: 'Attention (machine learning) explained', url: 'https://example.com/attention', description: 'A blog post' }] } })]
];
const ALL = ['openalex', 'semanticscholar', 'arxiv', 'crossref', 'pubmed', 'web', 'bib'];
const WEB = { provider: 'brave', connections: [{ provider: 'brave', apiKey: 'brave-secret-key' }] };

test('the question’s words for arXiv and the .bib leave out stop words', () => {
  assert.deepEqual(keywords('What are the effects of Graph Neural Networks on molécules?'), ['effects', 'graph', 'neural', 'networks', 'molecules']);
});

test('arXiv is asked for every word but the stop words, which would match nothing', async () => {
  serve([/export\.arxiv\.org/, () => new Response(ARXIV)]);
  await searchArxiv('Diffusion models for image generation?', 5);
  assert.match(calls[0].url, /search_query=all:Diffusion\+AND\+all:models\+AND\+all:image\+AND\+all:generation&/);
  await searchArxiv('the', 5);
  assert.match(calls[1].url, /search_query=all:the&/, 'a query of stop words alone is asked as it is');
});

test('PubMed records keep their markup-free title, structured abstract, group authors and PMC copy', () => {
  assert.deepEqual(parsePubmed(PUBMED), [{
    title: 'Attention in Drosophila & mice',
    authors: ['Marie Curie', 'Fly Consortium'],
    year: '2021',
    venue: 'Journal of Attention',
    doi: '10.5555/fly',
    url: 'https://pubmed.ncbi.nlm.nih.gov/42/',
    abstract: 'BACKGROUND: Flies 2 attend. RESULTS: They do.',
    openAccess: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC123/',
    preprint: false,
    sources: ['pubmed']
  }]);
});

test('merging: by DOI, then arXiv id, then title; a title alone never joins two DOIs, and the user’s fields stay', () => {
  const merged = mergeResults(
    [{ id: 'old', title: 'Deep learning', doi: '10.1038/nature14539', year: '2015', decision: 'keep', reason: 'Key review', sources: ['openalex'] }],
    [
      { title: 'Deep Learning', doi: '10.1038/NATURE14539', year: '2015', abstract: 'A longer abstract than none.', authors: ['Yann LeCun', 'Yoshua Bengio'], citations: 5, sources: ['crossref'] },
      { title: 'Deep learning', doi: '10.7551/mitpress/book', year: '2016', sources: ['crossref'] },
      { title: 'Deep learning', arxiv: '1234.5678v2', year: '2015', sources: ['arxiv'] },
      { title: 'Attention', doi: '10.48550/arXiv.1234.5678', sources: ['openalex'] }
    ]
  );
  assert.equal(merged.length, 2, 'the book stays apart; the preprint joins the review by title and its arXiv DOI after it');
  assert.deepEqual(
    { ...merged[0], id: undefined },
    { id: undefined, title: 'Deep learning', doi: '10.1038/nature14539', year: '2015', decision: 'keep', reason: 'Key review', sources: ['openalex', 'crossref', 'arxiv'], abstract: 'A longer abstract than none.', authors: ['Yann LeCun', 'Yoshua Bengio'], citations: 5, arxiv: '1234.5678v2' }
  );
  assert.equal(merged[0].id, 'old');
  assert.equal(merged[1].doi, '10.7551/mitpress/book');
  assert.match(merged[1].id, /^[0-9a-f]{12}$/);
  // the same paper gets the same id in another computer's session
  assert.equal(mergeResults([], [{ title: 'Deep learning', doi: '10.7551/mitpress/book' }])[0].id, merged[1].id);

  // a bioRxiv preprint joins its published version by title, which it then shows; two publishers' DOIs still don't join
  const [paper, other] = mergeResults([], [
    { title: 'Folding proteins', doi: '10.1101/2021.01.01.1', year: '2021', venue: 'bioRxiv', url: 'https://www.biorxiv.org/1', preprint: true, abstract: 'The preprint’s longer abstract.', sources: ['crossref'] },
    { title: 'Folding proteins', doi: '10.1038/s1', year: '2022', venue: 'Nature', preprint: false, sources: ['openalex'] },
    { title: 'Folding proteins', doi: '10.1016/other', year: '2022', venue: 'Cell', preprint: false, sources: ['openalex'] }
  ]);
  assert.deepEqual([paper.doi, paper.venue, paper.year, paper.url, paper.preprint, paper.abstract], ['10.1038/s1', 'Nature', '2022', 'https://www.biorxiv.org/1', false, 'The preprint’s longer abstract.']);
  assert.equal(other.doi, '10.1016/other');
  // a preprint can come out years before the paper; two papers can't
  assert.equal(mergeResults([], [
    { title: 'Slow review', arxiv: '2201.00001', year: '2022', preprint: true },
    { title: 'Slow review', doi: '10.1000/slow', year: '2025', preprint: false },
    { title: 'Slow review', doi: '10.1000/later', year: '2029', preprint: false }
  ]).length, 2);
});

test('Search runs every source at once, merges the paper they share, marks the .bib’s and logs each source', async () => {
  const p = await newProject('Search', {
    'main.tex': MAIN,
    'references.bib': '@article{Hopper2024,\n  title = {A preprint on attention},\n  author = {Hopper, Grace},\n  year = {2024}\n}\n@book{Knuth1984,\n  title = {Literate programming with attention},\n  author = {Knuth, Donald E.},\n  year = {1984},\n  abstract = {Attention to {programs}.}\n}\n'
  });
  serve(...sources(), [/api\.semanticscholar\.org/, () => json({ message: 'Too Many Requests' }, 429)]);
  routes.splice(1, 1); // Semantic Scholar is busy this time
  const res = await api('/api/research/search', 'POST', {
    projectId: p.id, question: 'attention', sources: ALL, searchConfig: WEB,
    keys: { openalexKey: 'oa-secret-key', openalexEmail: 'me@example.com', ncbiKey: 'ncbi-secret-key' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const { session } = res.json;

  const openalex = new URL(callTo('api.openalex.org').url).searchParams;
  assert.equal(openalex.get('api_key'), 'oa-secret-key');
  assert.equal(openalex.get('mailto'), 'me@example.com');
  assert.equal(new URL(callTo('eutils.ncbi.nlm.nih.gov').url).searchParams.get('api_key'), 'ncbi-secret-key');
  assert.match(callTo('export.arxiv.org').url, /search_query=all:attention&/);

  assert.deepEqual(session.runs.length, 1);
  const [run] = session.runs;
  assert.deepEqual(run.queries, ['attention']);
  assert.deepEqual(run.perSource.openalex, { count: 2 });
  assert.deepEqual(run.perSource.crossref, { count: 2 }, 'the figure is left out');
  assert.equal(run.perSource.semanticscholar.count, 0);
  assert.match(run.perSource.semanticscholar.error, /limiting requests/);
  assert.deepEqual([run.perSource.arxiv, run.perSource.pubmed, run.perSource.web, run.perSource.bib], [{ count: 2 }, { count: 1 }, { count: 1 }, { count: 2 }]);
  assert.doesNotMatch(JSON.stringify(session), /secret-key/);

  const titles = session.results.map((r) => r.title);
  assert.equal(titles.filter((t) => /^attention is all you need$/i.test(t)).length, 1, JSON.stringify(titles));
  const attention = session.results.find((r) => /^attention is all you need$/i.test(r.title));
  assert.deepEqual(attention.sources, ['openalex', 'arxiv', 'crossref']);
  assert.equal(attention.doi, '10.5555/attn');
  assert.equal(attention.arxiv, '1706.03762', 'from OpenAlex’s open copy, which arXiv’s joins');
  assert.equal(attention.citations, 950);
  assert.equal(attention.abstract, 'The dominant sequence transduction models.');
  assert.equal(attention.preprint, false, 'arXiv’s copy, but published');
  const preprint = session.results.find((r) => r.title === 'A preprint on attention');
  assert.deepEqual([preprint.inBib, preprint.preprint, preprint.sources], ['Hopper2024', true, ['arxiv', 'bib']]);
  assert.equal(session.results.find((r) => r.title === 'Literate programming with attention').inBib, 'Knuth1984');
  assert.equal(session.results.find((r) => r.doi === '10.5555/sorting').abstract, 'Sorting fast.');
  assert.equal(session.results.find((r) => r.sources.includes('web')).url, 'https://example.com/attention');
  assert.equal(new Set(session.results.map((r) => r.id)).size, session.results.length);

  // saved in the project, where 1.10.4 never looks, and listed
  const saved = JSON.parse(await fs.readFile(path.join(p.path, '.spectrum', 'research', `${session.id}.json`), 'utf8'));
  assert.equal(saved.results.length, session.results.length);
  const list = await api(`/api/projects/${p.id}/research`);
  assert.deepEqual(list.json.sessions.map((s) => [s.id, s.question, s.count, s.kept]), [[session.id, 'attention', session.results.length, 0]]);
});

test('year and preprint filters reach the sources and leave out what doesn’t fit', async () => {
  const p = await newProject('Filters', { 'main.tex': MAIN });
  serve(...sources());
  const res = await api('/api/research/search', 'POST', { projectId: p.id, question: 'attention in transformers', sources: ['openalex', 'semanticscholar', 'arxiv', 'crossref', 'pubmed'], yearFrom: 2017, yearTo: 2020, preprints: false });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const filter = new URL(callTo('api.openalex.org').url).searchParams.get('filter');
  assert.match(filter, /from_publication_date:2017-01-01,to_publication_date:2020-12-31/);
  assert.doesNotMatch(filter, /preprint/);
  assert.equal(new URL(callTo('api.semanticscholar.org').url).searchParams.get('year'), '2017-2020');
  // arXiv takes words apart as OR, so each must match
  assert.match(callTo('export.arxiv.org').url, /search_query=all:attention\+AND\+all:transformers\+AND\+submittedDate:%5B201701010000\+TO\+202012312359%5D&/);
  assert.match(new URL(callTo('api.crossref.org').url).searchParams.get('filter'), /from-pub-date:2017,until-pub-date:2020/);
  const esearch = new URL(callTo('eutils.ncbi.nlm.nih.gov').url).searchParams;
  assert.deepEqual([esearch.get('mindate'), esearch.get('maxdate'), esearch.get('datetype')], ['2017', '2020', 'pdat']);
  const { session } = res.json;
  assert.deepEqual(session.runs[0].filters, { yearFrom: 2017, yearTo: 2020, preprints: false });
  assert.ok(!session.results.some((r) => r.title === 'A preprint on attention'), 'the 2024 preprint is out');
  assert.ok(!session.results.some((r) => r.year === '2021'), 'PubMed’s 2021 paper is out');

  for (const body of [{ sources: [] }, { sources: ['scholar'] }, { question: '' }, { yearFrom: 2020, yearTo: 2010 }, { yearFrom: '2020' }]) {
    const bad = await api('/api/research/search', 'POST', { projectId: p.id, question: 'attention', sources: ['openalex'], ...body });
    assert.equal(bad.status, 400, JSON.stringify(body));
  }
});

test('session changes merge field by field, a search again keeps them, and a session can be deleted', async () => {
  const p = await newProject('Sessions', { 'main.tex': MAIN });
  serve(...sources());
  const { session } = (await api('/api/research/search', 'POST', { projectId: p.id, question: 'attention', sources: ['openalex'] })).json;
  const url = `/api/projects/${p.id}/research/${session.id}`;
  const [a, b] = session.results;

  let res = await api(url, 'PUT', { results: [{ id: a.id, decision: 'keep', reason: 'The model itself' }, { id: b.id, decision: 'drop' }, { id: 'gone', decision: 'keep' }] });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  res = await api(url, 'PUT', { question: 'attention models', results: [{ id: b.id, reason: 'Off topic' }] });
  const changed = res.json.session;
  assert.equal(changed.question, 'attention models');
  assert.deepEqual([changed.results[0].decision, changed.results[0].reason], ['keep', 'The model itself']);
  assert.deepEqual([changed.results[1].decision, changed.results[1].reason], ['drop', 'Off topic']);
  res = await api(url, 'PUT', { results: [{ id: b.id, decision: null, reason: null }] });
  assert.equal(res.json.session.results[1].decision, undefined);
  for (const body of [{ results: [{ id: a.id, decision: 'maybe' }] }, { results: [{ id: a.id, title: 'Renamed' }] }, { results: [{ decision: 'keep' }] }, { question: '' }, []]) {
    assert.equal((await api(url, 'PUT', body)).status, 400, JSON.stringify(body));
  }

  // another run of the same session: the new paper joins, the decisions stay
  OPENALEX.results.push({ id: 'https://openalex.org/W3', doi: 'https://doi.org/10.5555/new', display_name: 'A newer attention paper', publication_year: 2025, type: 'article', authorships: [] });
  try {
    res = await api('/api/research/search', 'POST', { projectId: p.id, question: 'attention mechanisms', sources: ['openalex', 'crossref'], sessionId: session.id });
  } finally {
    OPENALEX.results.pop();
  }
  const again = res.json.session;
  assert.equal(again.id, session.id);
  assert.deepEqual(again.runs.map((r) => r.queries[0]), ['attention', 'attention mechanisms']);
  assert.deepEqual(again.sources, ['openalex', 'crossref']);
  assert.equal(again.results[0].decision, 'keep');
  assert.ok(again.results.some((r) => r.title === 'A newer attention paper'));
  assert.ok(again.results.some((r) => r.doi === '10.5555/sorting'));

  assert.equal((await api(`/api/projects/${p.id}/research/not..valid`)).status, 400);
  assert.equal((await api(`/api/projects/${p.id}/research/missing`)).status, 404);
  assert.equal((await api('/api/research/search', 'POST', { projectId: p.id, question: 'x', sources: ['openalex'], sessionId: 'missing' })).status, 404);
  assert.equal((await api(url, 'DELETE')).status, 200);
  assert.equal((await api(url)).status, 404);
  assert.deepEqual((await api(`/api/projects/${p.id}/research`)).json.sessions, []);
});

test('Add kept to .bib goes through the references resolver: a duplicate keeps its key, a new paper gets one', async () => {
  const bib = '@inproceedings{Vaswani2017,\n  title = {Attention Is All You Need},\n  author = {Vaswani, Ashish},\n  year = {2017},\n  doi = {10.5555/attn}\n}\n';
  const p = await newProject('Add', { 'main.tex': MAIN, 'references.bib': bib });
  serve(...sources());
  const { session } = (await api('/api/research/search', 'POST', { projectId: p.id, question: 'attention', sources: ['openalex', 'crossref'] })).json;
  const url = `/api/projects/${p.id}/research/${session.id}`;
  const attention = session.results.find((r) => r.doi === '10.5555/attn');
  const gnn = session.results.find((r) => r.doi === '10.5555/gnn');
  const sorting = session.results.find((r) => r.doi === '10.5555/sorting');
  assert.equal(attention.inBib, 'Vaswani2017', 'already there by DOI');

  // a title-only result can't be looked up
  await fs.writeFile(path.join(p.path, '.spectrum', 'research', `${session.id}.json`), JSON.stringify({
    ...session, results: [...session.results, { id: 'titleonly', title: 'A talk', sources: ['web'], decision: 'keep' }]
  }));
  await api(url, 'PUT', { results: [attention, gnn, sorting].map((r) => ({ id: r.id, decision: 'keep' })) });

  serve([/doi\.org\/10\.5555\/gnn/, () => json({ type: 'article-journal', title: 'Graph networks for molecules', author: [{ given: 'Ada', family: 'Lovelace' }], issued: { 'date-parts': [[2020]] }, 'container-title': 'Chemistry Letters', DOI: '10.5555/gnn' })],
    [/doi\.org\/10\.5555\/sorting/, () => json({ type: 'article-journal', title: 'Sorting attention', author: [{ given: 'Alan', family: 'Turing' }], issued: { 'date-parts': [[2019]] }, DOI: '10.5555/sorting' })]);
  // the kept ones not in the .bib yet: the attention paper isn't sent
  let res = await api(`${url}/add`, 'POST', {});
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const outcome = Object.fromEntries(res.json.results.map((r) => [r.id, [r.status, r.key]]));
  assert.deepEqual(outcome, { [gnn.id]: ['added', 'Lovelace2020'], [sorting.id]: ['added', 'Turing2019'], titleonly: ['error', undefined] });
  assert.equal(res.json.bibFile, 'references.bib');
  assert.equal(res.json.bibIncluded, true);
  const after = Object.fromEntries(res.json.session.results.map((r) => [r.id, r.inBib]));
  assert.deepEqual([after[attention.id], after[gnn.id], after[sorting.id]], ['Vaswani2017', 'Lovelace2020', 'Turing2019']);
  const text = await fs.readFile(path.join(p.path, 'references.bib'), 'utf8');
  assert.ok(text.startsWith(bib));
  assert.equal(text.match(/^@/gm).length, 3);

  // named again, each is a duplicate under the key it has, with nothing looked up
  calls.length = 0;
  res = await api(`${url}/add`, 'POST', { resultIds: [attention.id, gnn.id] });
  assert.deepEqual(res.json.results.map((r) => [r.status, r.key]), [['duplicate', 'Vaswani2017'], ['duplicate', 'Lovelace2020']]);
  assert.equal(calls.length, 0);
  assert.equal((await fs.readFile(path.join(p.path, 'references.bib'), 'utf8')).match(/^@/gm).length, 3);

  // an entry taken out of the .bib is no longer marked
  await fs.writeFile(path.join(p.path, 'references.bib'), bib);
  assert.equal((await api(url)).json.session.results.find((r) => r.id === gnn.id).inBib, undefined);
});

test('triage: one model call adds why, a suggestion and a theme; a failed call is logged and the search kept', async () => {
  const p = await newProject('Triage', { 'main.tex': MAIN });
  let asked;
  serve(...sources(), [/llm\.test/, (_url, init) => {
    asked = JSON.parse(init.body);
    const papers = JSON.parse(asked.messages[1].content).papers;
    return json({ choices: [{ message: { content: JSON.stringify({ results: papers.map((x, index) => ({ index, why: `Why ${x.title}`, suggest: index ? 'drop' : 'keep', theme: 'Attention' })).concat([{ index: 99, suggest: 'keep' }]) }) }, finish_reason: 'stop' }] });
  }]);
  const llmConfig = { endpoint: 'http://llm.test/v1/chat/completions', model: 'stub' };
  let res = await api('/api/research/search', 'POST', { projectId: p.id, question: 'attention', sources: ['openalex'], triage: true, llmConfig });
  const { session } = res.json;
  assert.match(asked.messages[0].content, /suggest keep or drop/);
  assert.equal(JSON.parse(asked.messages[1].content).question, 'attention');
  assert.deepEqual(session.runs[0].triage, { count: 2 });
  assert.deepEqual(session.results.map((r) => [r.why, r.suggest, r.theme]), [
    ['Why Attention Is All You Need', 'keep', 'Attention'],
    ['Why Graph networks for molecules', 'drop', 'Attention']
  ]);

  routes = routes.filter(([pattern]) => !pattern.test('llm.test'));
  res = await api('/api/research/search', 'POST', { projectId: p.id, question: 'attention', sources: ['crossref'], triage: true, llmConfig, sessionId: session.id });
  const run = res.json.session.runs[1];
  assert.equal(run.triage.count, 0);
  assert.ok(run.triage.error);
  assert.equal(res.json.session.results.length, 3);
  assert.equal(res.json.session.results[0].why, 'Why Attention Is All You Need');
});

test('Open note makes research/notes/<key>.md once; Get PDF saves an open-access PDF into research/papers', async () => {
  const p = await newProject('Files', { 'main.tex': MAIN, 'references.bib': '@article{Vaswani2017,\n  title = {Attention Is All You Need},\n  doi = {10.5555/attn},\n  year = {2017}\n}\n' });
  serve(...sources());
  const { session } = (await api('/api/research/search', 'POST', { projectId: p.id, question: 'attention', sources: ['openalex', 'crossref'] })).json;
  const url = `/api/projects/${p.id}/research/${session.id}`;
  const attention = session.results.find((r) => r.doi === '10.5555/attn');
  const gnn = session.results.find((r) => r.doi === '10.5555/gnn');
  const sorting = session.results.find((r) => r.doi === '10.5555/sorting');

  let res = await api(`${url}/note`, 'POST', { resultId: attention.id });
  assert.deepEqual(res.json, { ok: true, path: 'research/notes/Vaswani2017.md', created: true });
  const note = await fs.readFile(path.join(p.path, 'research', 'notes', 'Vaswani2017.md'), 'utf8');
  assert.match(note, /^# Attention Is All You Need\n/);
  assert.match(note, /- DOI: \[10\.5555\/attn\]\(https:\/\/doi\.org\/10\.5555\/attn\)/);
  assert.match(note, /- Citation key: `Vaswani2017`/);
  assert.match(note, /- Found through OpenAlex, Crossref for “attention”, \d+ \w+ \d{4}/);
  await fs.writeFile(path.join(p.path, 'research', 'notes', 'Vaswani2017.md'), 'My own notes');
  res = await api(`${url}/note`, 'POST', { resultId: attention.id });
  assert.equal(res.json.created, false);
  assert.equal(await fs.readFile(path.join(p.path, 'research', 'notes', 'Vaswani2017.md'), 'utf8'), 'My own notes', 'never written over');
  assert.equal((await api(`${url}/note`, 'POST', { resultId: gnn.id })).json.path, 'research/notes/Lovelace2020Graph.md', 'not in the .bib: AuthorYear and a title word');
  assert.equal((await api(`${url}/note`, 'POST', { resultId: 'nope' })).status, 404);

  // the open copy a source named, and Unpaywall's with the user's email; a landing page isn't a PDF
  const pdf = Buffer.from('%PDF-1.7\nfake paper\n%%EOF\n');
  serve([/203\.0\.113\.7\/gnn\.pdf/, () => new Response(pdf, { headers: { 'content-type': 'application/pdf' } })],
    [/api\.unpaywall\.org\/v2\/10\.5555\/sorting/, (u) => json({ best_oa_location: { url_for_pdf: 'https://203.0.113.8/landing' }, oa_locations: [{ url_for_pdf: 'https://203.0.113.8/sorting.pdf' }], email: new URL(u).searchParams.get('email') })],
    [/203\.0\.113\.8\/landing/, () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } })],
    [/203\.0\.113\.8\/sorting\.pdf/, () => new Response(pdf)]);
  res = await api(`${url}/pdf`, 'POST', { resultId: gnn.id });
  assert.deepEqual(res.json, { ok: true, path: 'research/papers/Lovelace2020Graph.pdf' });
  assert.deepEqual(await fs.readFile(path.join(p.path, 'research', 'papers', 'Lovelace2020Graph.pdf')), pdf);
  assert.equal((await api(`${url}/pdf`, 'POST', { resultId: gnn.id })).json.existing, true);

  res = await api(`${url}/pdf`, 'POST', { resultId: sorting.id });
  assert.equal(res.status, 404);
  // the app's error handler sends this message as error; Fastify's own, here, as message
  assert.match(res.json.message, /Add your email in Settings › Search/);
  res = await api(`${url}/pdf`, 'POST', { resultId: sorting.id, email: 'me@example.com' });
  assert.equal(res.json.path, 'research/papers/Turing2019Sorting.pdf', JSON.stringify(res.json));
  assert.match(calls.find((c) => c.url.includes('unpaywall')).url, /email=me%40example\.com/);

  // arXiv's copy, its id from OpenAlex's open link
  serve([/arxiv\.org\/pdf\/1706\.03762$/, () => new Response(pdf)]);
  res = await api(`${url}/pdf`, 'POST', { resultId: attention.id });
  assert.equal(res.json.path, 'research/papers/Vaswani2017.pdf', JSON.stringify(res.json));
});

test('papers that share a name get a note and a PDF each, which keep their names once in the .bib; a slow download says so', async () => {
  const p = await newProject('Names', { 'main.tex': MAIN, 'references.bib': '' });
  serve(...sources());
  const { session } = (await api('/api/research/search', 'POST', { projectId: p.id, question: 'attention', sources: ['crossref'] })).json;
  await fs.writeFile(path.join(p.path, '.spectrum', 'research', `${session.id}.json`), JSON.stringify({
    ...session,
    results: [
      { id: 'a', title: 'Deep widgets', authors: ['J. Smith'], year: '2020', arxiv: '2001.00001', sources: ['arxiv'] },
      { id: 'b', title: 'Deep gadgets', authors: ['K. Smith'], year: '2020', arxiv: '2001.00002', openAccess: 'https://203.0.113.9/b.pdf', sources: ['openalex'] },
      // CON is a device on Windows
      { id: 'c', title: 'CON: a study', sources: ['web'] }
    ]
  }));
  const url = `/api/projects/${p.id}/research/${session.id}`;
  const note = async (resultId) => (await api(`${url}/note`, 'POST', { resultId })).json;
  assert.deepEqual(await note('a'), { ok: true, path: 'research/notes/Smith2020Deep.md', created: true });
  assert.deepEqual(await note('b'), { ok: true, path: 'research/notes/Smith2020Deep-2.md', created: true });
  assert.match(await fs.readFile(path.join(p.path, 'research', 'notes', 'Smith2020Deep-2.md'), 'utf8'), /^# Deep gadgets\n/);
  assert.deepEqual(await note('b'), { ok: true, path: 'research/notes/Smith2020Deep-2.md', created: false });
  assert.equal((await note('c')).path, 'research/notes/CON_.md');

  const pdf = Buffer.from('%PDF-1.7\nfake paper\n%%EOF\n');
  serve([/arxiv\.org\/pdf\/2001\.0000[12]$/, () => new Response(pdf)]);
  assert.equal((await api(`${url}/pdf`, 'POST', { resultId: 'a' })).json.path, 'research/papers/Smith2020Deep.pdf');
  assert.equal((await api(`${url}/pdf`, 'POST', { resultId: 'b' })).json.path, 'research/papers/Smith2020Deep-2.pdf');

  // in the .bib now, under a key: the note and the PDF it had
  await fs.writeFile(path.join(p.path, 'references.bib'), '@article{Smith2020,\n  title = {Deep widgets},\n  author = {Smith, J.},\n  year = {2020},\n  eprint = {2001.00001},\n  archiveprefix = {arXiv}\n}\n');
  assert.deepEqual(await note('a'), { ok: true, path: 'research/notes/Smith2020Deep.md', created: false });
  assert.deepEqual((await api(`${url}/pdf`, 'POST', { resultId: 'a' })).json, { ok: true, path: 'research/papers/Smith2020Deep.pdf', existing: true });

  // a copy that comes too slowly for the download's time (shortened here) is told as that, not as a page that isn't a PDF
  await fs.rm(path.join(p.path, 'research', 'papers', 'Smith2020Deep-2.pdf'));
  const trickle = (u, init) =>
    new Response(new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('%PDF-1.7\n'));
        init.signal?.addEventListener('abort', () => c.error(init.signal.reason));
      }
    }));
  serve([/arxiv\.org\/pdf\/2001\.00002$/, trickle], [/203\.0\.113\.9\/b\.pdf/, trickle]);
  process.env.SPECTRUM_PDF_TIMEOUT_MS = '300';
  try {
    const res = await api(`${url}/pdf`, 'POST', { resultId: 'b' });
    assert.equal(res.status, 404);
    assert.match(res.json.message, /^(?:arxiv\.org|203\.0\.113\.9) took too long to send the PDF\.$/);
  } finally {
    delete process.env.SPECTRUM_PDF_TIMEOUT_MS;
  }
});

test('a preprint is In .bib under its published version’s key, and a record linking two rows makes them one', () => {
  const index = buildBibIndex([{ file: 'refs.bib', text: '@inproceedings{Vaswani2018,\n  title = {Attention Is All You Need},\n  author = {Vaswani, Ashish},\n  year = {2018}\n}\n' }]);
  const marked = markInBib(
    [
      { id: 'pre', title: 'Attention is all you need', authors: ['Ashish Vaswani'], year: '2017', arxiv: '1706.03762', preprint: true },
      { id: 'other', title: 'Attention is all you need', authors: ['Grace Hopper'], year: '2017' }
    ],
    index
  );
  assert.deepEqual(marked.map((r) => r.inBib), ['Vaswani2018', undefined]);
  // a preprint DOI disagrees with no publisher's: arXiv's, as OpenAlex gives it, and bioRxiv's in the .bib
  const published = buildBibIndex([{ file: 'refs.bib', text: '@inproceedings{Doe2022Sparse,\n  title = {Sparse widgets},\n  author = {Doe, Jane},\n  year = {2022},\n  doi = {10.1145/sparse}\n}\n@article{Ruiz2023Mixture,\n  title = {Mixture models of cells},\n  author = {Ruiz, Ana},\n  year = {2023},\n  doi = {10.1101/2023.01.01.000001}\n}\n' }]);
  const preprints = markInBib(
    [
      { id: 'a', title: 'Sparse widgets', authors: ['Jane Doe'], year: '2021', doi: '10.48550/arxiv.2101.00001', preprint: true },
      { id: 'b', title: 'Sparse widgets', authors: ['Jane Doe'], year: '2021', arxiv: '2101.00001', preprint: true },
      // its preprint's row merged in, which leaves the journal's DOI
      { id: 'c', title: 'Mixture models of cells', authors: ['Ana Ruiz'], year: '2024', doi: '10.1016/j.cell.2024.1', preprint: false },
      // two publishers' DOIs still disagree
      { id: 'd', title: 'Sparse widgets', authors: ['Jane Doe'], year: '2023', doi: '10.1000/other', preprint: false }
    ],
    published
  );
  assert.deepEqual(preprints.map((r) => r.inBib), ['Doe2022Sparse', 'Doe2022Sparse', 'Ruiz2023Mixture', undefined]);

  const rows = mergeResults(
    mergeResults([], [
      { title: 'Widget scaling laws', arxiv: '2001.00001', year: '2020', preprint: true, sources: ['arxiv'] },
      { title: 'Widget scaling laws revisited', doi: '10.1000/w', year: '2021', preprint: false, sources: ['crossref'] }
    ]).map((r, i) => (i === 1 ? { ...r, decision: 'keep' } : r)),
    [{ title: 'Widget scaling laws', doi: '10.1000/w', arxiv: '2001.00001', year: '2021', sources: ['semanticscholar'] }]
  );
  assert.deepEqual(rows.map((r) => [r.doi, r.arxiv, r.decision, r.sources]), [['10.1000/w', '2001.00001', 'keep', ['arxiv', 'semanticscholar', 'crossref']]]);
});
