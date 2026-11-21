// References checked by code: fetch_bibtex's title match, the references check (each .bib entry against its record,
// with retractions), read_source (a paper's open copy, page by page) and the claims ledger. Against a stand-in for
// OpenAlex, Crossref, doi.org and arXiv on this computer, serving answers recorded from the real services (trimmed,
// in test/fixtures/scholarly). No network. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-refcheck-')));
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  USERPROFILE: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects')
});
const fixture = (name) => readFileSync(new URL(`./fixtures/scholarly/${name}`, import.meta.url));
const json = (name) => JSON.parse(fixture(name));

// what each source was asked, to show what a check read
const asked = [];
// what the scripted model was sent, and what it calls in turn
const models = [];
const SCRIPT = [
  ['read_source', { arxiv: '1706.03762', pages: '2' }],
  ['record_claim', { file: 'main.tex', line: 3, claim: 'The big transformer reached a BLEU score of 28.4 on WMT 2014', keys: ['Transformer2017'], rating: 'supported', quote: 'establishing a new state-of-the-art BLEU score of 28.4', source: { key: 'Transformer2017' }, page: 1 }],
  ['record_claim', { file: 'main.tex', line: 3, claim: 'The big transformer reached a BLEU score of 28.4 on WMT 2014', keys: ['Transformer2017'], rating: 'supported', quote: 'the transformer beats every model ever made by ten BLEU', source: { key: 'Transformer2017' } }]
];
let server;
before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    asked.push(url.pathname + url.search);
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    const doi = (prefix) => decodeURIComponent(url.pathname.slice(prefix.length)).toLowerCase();
    if (url.pathname.startsWith('/crossref/works/')) {
      const file = { '10.1016/s0140-6736(97)11096-0': 'crossref-work-wakefield.json', '10.1016/s0140-6736(10)60175-4': 'crossref-work-retraction-notice.json', '10.1371/journal.pmed.0020124': 'crossref-work-ioannidis.json' }[doi('/crossref/works/')];
      return file ? send(200, json(file)) : send(404, 'Resource not found.', 'text/plain');
    }
    if (url.pathname.startsWith('/doi/')) return send(404, 'DOI not found', 'text/plain');
    if (url.pathname.startsWith('/openalex/works/doi:')) {
      const file = { '10.1016/s0140-6736(97)11096-0': 'openalex-work-wakefield.json', '10.1371/journal.pmed.0020124': 'openalex-work-ioannidis.json' }[doi('/openalex/works/doi:')];
      if (!file) return send(404, { error: 'not found' });
      // the open copy's address, here; the retracted paper's abstract, which its recorded answer was not asked for
      const work = JSON.parse(fixture(file).toString().replaceAll('https://journals.plos.org', `http://${req.headers.host}/plos`));
      if (/wakefield/.test(file)) work.abstract_inverted_index = { We: [0], investigated: [1], a: [2], consecutive: [3], series: [4], of: [5], children: [6] };
      return send(200, work);
    }
    if (url.pathname === '/plos/plosmedicine/article/file' || url.pathname === '/arxiv/pdf/1706.03762') return send(200, fixture('paper.pdf'), 'application/pdf');
    if (url.pathname === '/v1/chat/completions') {
      let body = '';
      req.on('data', (c) => (body += c));
      return req.on('end', () => {
        const payload = JSON.parse(body);
        models.push(payload);
        const done = payload.messages.filter((m) => m.role === 'tool').length;
        const step = SCRIPT[done];
        send(200, { choices: [{ message: step ? { role: 'assistant', content: null, tool_calls: [{ id: `c${done}`, type: 'function', function: { name: step[0], arguments: JSON.stringify(step[1]) } }] } : { role: 'assistant', content: 'Checked.' } }] });
      });
    }
    if (url.pathname === '/arxiv/api/query') {
      return send(200, url.searchParams.get('id_list') === '1706.03762' ? fixture('arxiv-1706.03762.xml') : '<feed xmlns="http://www.w3.org/2005/Atom"></feed>', 'application/atom+xml');
    }
    if (url.pathname === '/openalex/works') {
      return send(200, json(/attention is all you need/i.test(url.searchParams.get('search')) ? 'openalex-search-attention.json' : 'openalex-search-made-up.json'));
    }
    return send(404, 'not found', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  Object.assign(process.env, { SPECTRUM_OPENALEX_BASE: `${base}/openalex`, SPECTRUM_CROSSREF_BASE: `${base}/crossref`, SPECTRUM_DOI_BASE: `${base}/doi`, SPECTRUM_ARXIV_BASE: `${base}/arxiv` });
});
after(() => {
  server?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('fetch_bibtex gives a title’s BibTeX only for a work that matches it, and says when others share the title', async () => {
  const { fetchBibtex } = await import('../src/services/researchTools.js');
  const exact = await fetchBibtex('Attention is all you need', { author: 'Ashish Vaswani', year: 2017 });
  assert.equal(exact.match, 'exact');
  assert.equal(exact.found.year, '2017');
  assert.match(exact.bibtex, /^@\w+\{Vaswani2017/);
  assert.equal(exact.note, undefined);

  // the same title is also a 2025 book chapter: without author and year, the answer says so
  const alone = await fetchBibtex('Attention Is All You Need');
  assert.equal(alone.match, 'exact');
  assert.match(alone.note, /2 works have this title; this one is Ashish Vaswani, 2017\. The others: J\. M\. Bishop, 2025/);
  // asked with the chapter's author, the chapter is the one given
  assert.match((await fetchBibtex('Attention Is All You Need', { author: 'Bishop' })).bibtex, /Bishop2025/);

  // a subtitle the model left out is close, not exact
  const close = await fetchBibtex('Attention is all you need in speech separation: a study', { author: 'Subakan' });
  assert.equal(close.match, 'close');
  assert.match(close.note, /check it is the one you mean/);

  // the right title under the wrong author or year is no match
  await assert.rejects(fetchBibtex('Attention is all you need', { author: 'Hinton', year: 2017 }), /No work was found whose title, first author and year match/);
  // a title the model made up comes back refused, with the nearest works listed and no BibTeX
  await assert.rejects(fetchBibtex('Quantum widgets for self-healing concrete in lunar habitats'), (err) => {
    assert.match(err.message, /so no BibTeX is given\. The nearest:\n1\. Unprimed stem completion/);
    assert.match(err.message, /doi 10\.3758\/bf03200594/);
    assert.doesNotMatch(err.message, /@\w+\{/);
    return true;
  });
});

const BIB = String.raw`@article{Wakefield1998,
  author = {Wakefield, A. J. and Murch, S. H.},
  title = {Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children},
  journal = {The Lancet},
  year = {1998},
  doi = {10.1016/S0140-6736(97)11096-0}
}

@article{Ioannidis2005,
  author = {Ioannidis, John P. A.},
  title = {Why most published research findings are false},
  journal = {PLoS Medicine},
  year = {2015},
  doi = {10.1371/journal.pmed.0020124}
}

@article{Notice2010,
  title = {Retraction—Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children},
  journal = {The Lancet},
  year = {2010},
  doi = {10.1016/S0140-6736(10)60175-4}
}

@inproceedings{Vaswani2017,
  author = {Vaswani, Ashish and Shazeer, Noam},
  title = {Attention is All you Need},
  booktitle = {Advances in Neural Information Processing Systems},
  year = {2017}
}

@misc{Transformer2017,
  author = {Vaswani, Ashish},
  title = {Attention Is All You Need},
  year = {2017},
  eprint = {1706.03762},
  archivePrefix = {arXiv}
}

@article{Smith2024,
  author = {Smith, Jane},
  title = {Quantum widgets for self-healing concrete in lunar habitats},
  journal = {Journal of Lunar Building},
  year = {2024}
}

@article{Ghost2023,
  author = {Doe, John},
  title = {A paper with a made-up DOI},
  year = {2023},
  doi = {10.9999/no.such.work}
}

@online{Site,
  url = {https://example.org}
}
`;

test('References exist: each entry against its record, with what differs, retractions and where each was read', async () => {
  const { default: Fastify } = await import('fastify');
  const { registerReferenceRoutes } = await import('../src/routes/references.js');
  const { createProject, getProjectRoot } = await import('../src/services/projectService.js');
  const app = Fastify();
  registerReferenceRoutes(app);
  const p = await createProject({ name: 'Checked' });
  const root = await getProjectRoot(p.id);
  await fs.writeFile(path.join(root, 'main.tex'), '\\documentclass{article}\\begin{document}\\cite{Wakefield1998}\\bibliography{refs}\\end{document}\n');
  await fs.writeFile(path.join(root, 'refs.bib'), BIB);

  const res = await app.inject({ url: '/api/references/check', method: 'POST', payload: { projectId: p.id } });
  assert.equal(res.statusCode, 200);
  const { rows, bibFiles } = res.json();
  assert.deepEqual(bibFiles, ['refs.bib']);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual(rows.map((r) => [r.key, r.status]), [
    ['Wakefield1998', 'retracted'], ['Ioannidis2005', 'differs'], ['Notice2010', 'found'], ['Vaswani2017', 'found'],
    ['Transformer2017', 'found'], ['Smith2024', 'not-found'], ['Ghost2023', 'not-found'], ['Site', 'unchecked']
  ]);

  // the retraction, from Retraction Watch through Crossref, with its notice to open; the correction listed apart
  const w = by.Wakefield1998;
  assert.deepEqual(w.retraction, { label: 'Retraction', date: '2010-02-06', notice: '10.1016/s0140-6736(10)60175-4', url: 'https://doi.org/10.1016/s0140-6736(10)60175-4', from: 'Retraction Watch, through Crossref' });
  assert.deepEqual(w.notices.map((n) => n.label), ['Correction']);
  assert.deepEqual(w.read, { from: 'Crossref', url: 'https://doi.org/10.1016/s0140-6736(97)11096-0' });
  assert.match(w.record.title, /^RETRACTED: Ileal/);
  assert.equal(w.line, 1);

  // the year differs, with both sides shown; the title (other case) does not
  assert.deepEqual(by.Ioannidis2005.differences, [{ field: 'year', bib: '2015', record: '2005' }]);
  assert.equal(by.Ioannidis2005.record.authors[0], 'John P. A. Ioannidis');
  assert.equal(by.Ioannidis2005.line, 9);
  // a DOI that is a retraction notice's own
  assert.match(by.Notice2010.note, /This DOI is the retraction notice of 10\.1016\/s0140-6736\(97\)11096-0, not the work itself\./);
  // a title alone, found in OpenAlex, its page to open
  assert.deepEqual(by.Vaswani2017.read, { from: 'OpenAlex, by title', url: 'https://openalex.org/W2626778328' });
  assert.equal(by.Transformer2017.read.url, 'https://arxiv.org/abs/1706.03762');
  assert.match(by.Smith2024.note, /OpenAlex has no work with this title/);
  assert.match(by.Ghost2023.note, /neither Crossref nor doi\.org has a record/);
  assert.match(by.Site.note, /A web page/);

  // the keys asked for alone, and the tool's answer for a model
  const { checkReferences, checkSummary } = await import('../src/services/referenceCheck.js');
  const some = checkSummary(await checkReferences(root, { keys: ['Ioannidis2005', 'Vaswani2017'] }));
  assert.deepEqual(some.found, ['Vaswani2017']);
  assert.deepEqual(some.problems.map((x) => [x.key, x.at, x.status]), [['Ioannidis2005', 'refs.bib:9', 'differs']]);
  assert.equal((await app.inject({ url: '/api/references/check', method: 'POST', payload: { projectId: p.id, keys: 'all' } })).statusCode, 400);
  await app.close();
});

const MAIN = String.raw`\documentclass{article}
\begin{document}
The big transformer reached a BLEU score of 28.4 on WMT 2014 \cite{Transformer2017}.
Most published findings are false \cite{Ioannidis2005}.
\bibliography{refs}
\end{document}
`;

test('read_source reads an open copy page by page, from arXiv, OpenAlex’s open location or the project, else the abstract', async () => {
  const { createProject, getProjectRoot } = await import('../src/services/projectService.js');
  const { readSource } = await import('../src/services/sourceReader.js');
  const root = await getProjectRoot((await createProject({ name: 'Read' })).id);
  await fs.writeFile(path.join(root, 'main.tex'), MAIN);
  await fs.writeFile(path.join(root, 'refs.bib'), BIB);

  const arxiv = await readSource(root, { arxiv: '1706.03762' });
  // what was read, where, and the line a note takes; the pages under their numbers
  assert.match(arxiv.text, /^Full text, 3 pages, from https:\/\/arxiv\.org\/pdf\/1706\.03762\. Below: pages 1–3\.\nRead: full text, pages 1–3 of 3, from https:\/\/arxiv\.org\/pdf\/1706\.03762, \d+ \w+ 20\d\d\n\n--- Page 1 ---\nAttention Is All You Need/);
  assert.match(arxiv.text, /--- Page 2 ---\nResults\nOn the WMT 2014/);
  assert.equal(arxiv.shown, 'Pages 1–3 of 3, from https://arxiv.org/pdf/1706.03762');
  const two = await readSource(root, { arxiv: 'arXiv:1706.03762v7', pages: '2' });
  assert.match(two.text, /Below: page 2\. Read on with pages: "3-3"\.\nRead: full text, page 2 of 3/);
  assert.doesNotMatch(two.text, /Page 1 ---/);

  // a DOI: the open copy OpenAlex knows of, fetched from the address it gives
  const doi = await readSource(root, { doi: '10.1371/journal.pmed.0020124', pages: '3' });
  assert.match(doi.text, /^Full text of “Why Most Published Research Findings Are False”, 3 pages, from http:\/\/127\.0\.0\.1:\d+\/plos\/plosmedicine\/article\/file\?id=10\.1371/);
  // no open copy: the abstract alone, said so, and the retraction OpenAlex marks
  const abstract = await readSource(root, { doi: '10.1016/S0140-6736(97)11096-0' });
  assert.match(abstract.text, /^OpenAlex marks this work as retracted\. Say so wherever you use it\.\nNo open full text was found: this is the abstract alone, from OpenAlex\./);
  assert.match(abstract.text, /Read: abstract, from https:\/\/doi\.org\/10\.1016\/S0140-6736\(97\)11096-0, .*\n\nWe investigated a consecutive series of children$/);

  // a .bib key: its arXiv id; or the PDF Get PDF saved under its key, read from the project
  assert.match((await readSource(root, { key: 'Transformer2017', pages: '1' })).text, /from https:\/\/arxiv\.org\/pdf\/1706\.03762/);
  await fs.mkdir(path.join(root, 'research/papers'), { recursive: true });
  await fs.copyFile(new URL('./fixtures/scholarly/paper.pdf', import.meta.url), path.join(root, 'research/papers/Ioannidis2005.pdf'));
  assert.match((await readSource(root, { key: 'Ioannidis2005' })).text, /from research\/papers\/Ioannidis2005\.pdf\./);
  await assert.rejects(readSource(root, { key: 'Smith2024' }), /Smith2024 has no DOI or arXiv id/);
  await assert.rejects(readSource(root, { key: 'Nobody' }), /no entry Nobody/);
  await assert.rejects(readSource(root, { path: 'main.tex' }), /reads PDFs/);
  await assert.rejects(readSource(root, { doi: '10.9999/no.such.work' }), /No open copy or abstract/);
  await assert.rejects(readSource(root, {}), /Give a doi/);
});

test('record_claim keeps a claim only at its line, with keys in the .bib and a quote the source holds, and finds its page', async () => {
  const { createProject, getProjectRoot } = await import('../src/services/projectService.js');
  const { recordClaim, listClaims } = await import('../src/services/claimsLedger.js');
  const p = await createProject({ name: 'Ledger' });
  const root = await getProjectRoot(p.id);
  await fs.writeFile(path.join(root, 'main.tex'), MAIN);
  await fs.writeFile(path.join(root, 'refs.bib'), BIB);
  const claim = { file: 'main.tex', line: 3, claim: 'The big transformer reached a BLEU score of 28.4 on WMT 2014', keys: ['Transformer2017'] };

  // the quote is on page 2, though the model said page 1, across a line break of the PDF
  const row = await recordClaim(root, { ...claim, rating: 'supported', quote: 'outperforms the best previously reported models including ensembles by more than 2.0 BLEU', source: { key: 'Transformer2017' }, page: 1 });
  assert.deepEqual(row.read, { kind: 'full text', page: 2, where: 'https://arxiv.org/pdf/1706.03762' });
  // a quote the source does not hold, a quote too short to be evidence, the wrong line, a key not in the .bib
  await assert.rejects(recordClaim(root, { ...claim, rating: 'supported', quote: 'the transformer beats every model ever made by ten BLEU', source: { key: 'Transformer2017' } }), /The quote is not in the full text of https:\/\/arxiv\.org\/pdf\/1706\.03762 word for word/);
  await assert.rejects(recordClaim(root, { ...claim, rating: 'partly', quote: 'BLEU score of 28.4', source: { key: 'Transformer2017' } }), /at least 6 words/);
  await assert.rejects(recordClaim(root, { ...claim, rating: 'supported', quote: 'outperforms the best previously reported models including ensembles' }), /Name the source/);
  await assert.rejects(recordClaim(root, { ...claim, line: 5, rating: 'needs-source' }), /The claim is not at main\.tex:5/);
  await assert.rejects(recordClaim(root, { ...claim, keys: ['Nobody'], rating: 'needs-source' }), /The bibliography has no Nobody/);
  await assert.rejects(recordClaim(root, { ...claim, rating: 'fine' }), /rating is one of/);
  // only the abstract could be read: a quote from it is marked so
  const fromAbstract = await recordClaim(root, { file: 'main.tex', line: 4, claim: 'Most published findings are false', rating: 'unsupported', quote: 'We investigated a consecutive series of children', source: { doi: '10.1016/S0140-6736(97)11096-0' }, note: 'The abstract is about another question.' });
  assert.deepEqual(fromAbstract.read, { kind: 'abstract', where: 'https://doi.org/10.1016/S0140-6736(97)11096-0' });
  // a rating that says nothing of the source needs no quote
  await recordClaim(root, { ...claim, rating: 'not-checkable', note: 'Behind a paywall.' });

  assert.deepEqual((await listClaims(root)).map((c) => [c.line, c.rating]), [[3, 'supported'], [4, 'unsupported'], [3, 'not-checkable']]);
  // one file per claim, beside the research sessions, which a sync joins
  assert.equal((await fs.readdir(path.join(root, '.spectrum/research/claims'))).length, 3);

  const { default: Fastify } = await import('fastify');
  const { registerResearchRoutes } = await import('../src/routes/research.js');
  const app = Fastify();
  registerResearchRoutes(app);
  const listed = (await app.inject({ url: `/api/projects/${p.id}/claims` })).json().claims;
  assert.equal(listed.length, 3);
  assert.equal((await app.inject({ url: `/api/projects/${p.id}/claims/${listed[0].id}`, method: 'DELETE' })).statusCode, 200);
  assert.equal((await app.inject({ url: `/api/projects/${p.id}/claims/..%2Fx`, method: 'DELETE' })).statusCode, 400);
  assert.equal((await listClaims(root)).length, 2);
  // the research sessions' list does not take the ledger for a session
  assert.deepEqual((await app.inject({ url: `/api/projects/${p.id}/research` })).json().sessions, []);
  await app.close();
});

test('The Spectrum agent reads a source as untrusted text and records a claim, and a quote it made up is refused', async () => {
  const { createProject, getProjectRoot } = await import('../src/services/projectService.js');
  const { runToolAgent } = await import('../src/services/agentService.js');
  const p = await createProject({ name: 'Agent' });
  const root = await getProjectRoot(p.id);
  await fs.writeFile(path.join(root, 'main.tex'), MAIN);
  await fs.writeFile(path.join(root, 'refs.bib'), BIB);
  const out = await runToolAgent({ projectId: p.id, task: 'verify', prompt: 'Check the claims', llmConfig: { endpoint: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'test', model: 'scripted' } });
  assert.equal(out.reply, 'Checked.');
  assert.deepEqual(out.steps.map((s) => [s.tool, s.ok, s.about]), [['read_source', true, '1706.03762'], ['record_claim', true, 'main.tex:3'], ['record_claim', false, 'main.tex:3']]);
  // the card says what was read and where; the recorded claim says where its quote is
  assert.match(out.steps[0].show.text, /^Read: full text, page 2 of 3, from https:\/\/arxiv\.org\/pdf\/1706\.03762/);
  assert.match(out.steps[1].show.text, /^Recorded: main\.tex:3 is supported, the quote found in the full text on page 2 of https:\/\/arxiv\.org\/pdf\/1706\.03762\./);
  const tools = models.at(-1).messages.filter((m) => m.role === 'tool');
  // the paper's text reaches the model marked as material, not instructions
  assert.match(tools[0].content, /^<untrusted source="read_source 1706\.03762">\nFull text, 3 pages/);
  assert.match(tools[2].content, /Error: The quote is not in the full text/);
  assert.ok(models[0].tools.some((t) => t.function.name === 'read_source') && models[0].tools.some((t) => t.function.name === 'record_claim'));
  const { listClaims } = await import('../src/services/claimsLedger.js');
  assert.equal((await listClaims(root)).length, 1);
});

test('the bibliography read is the one the document in question loads, whatever its name, and the answer says which', async () => {
  const { documentBib, allBibEntries } = await import('../src/mcp/tools.js');
  const { checkReferences, checkSummary } = await import('../src/services/referenceCheck.js');
  const entry = (key) => `@misc{${key},\n  title = {Work ${key}},\n  howpublished = {\\url{https://example.org/${key}}}\n}\n`;
  let n = 0;
  const project = async (files) => {
    const root = path.join(tmp, `bibs-${n++}`);
    for (const [file, text] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), text);
    }
    return root;
  };
  const doc = (load) => `\\documentclass{article}\n${load}\n\\begin{document}\n\\cite{probeA}\n\\end{document}\n`;
  const read = async (root, file, state) => {
    const { document, bibs, entries } = await documentBib(root, state, file);
    return [document, bibs, entries.map((e) => e.key)];
  };

  // the owner's project: a template's main.tex that loads a references.bib it does not have, and a second paper
  const probe = await project({
    'main.tex': doc('\\usepackage{biblatex}\n\\addbibresource{references.bib}'),
    'research-probe.tex': doc('\\usepackage{biblatex}\n\\addbibresource{research-probe.bib}'),
    'research-probe.bib': entry('probeA') + entry('probeB')
  });
  const agent = { mainFile: 'main.tex' };
  // the agent names the document it works on: its own .bib is checked
  const named = checkSummary(await checkReferences(probe, { state: agent, file: 'research-probe.tex' }));
  assert.equal(named.checked, 2);
  assert.equal(named.document, 'research-probe.tex');
  assert.deepEqual(named.bibFiles, ['research-probe.bib']);
  assert.equal(named.note, undefined);
  // left to the main file, it reads that one's, and says why there was nothing, never a bare 0
  const left = checkSummary(await checkReferences(probe, { state: agent }));
  assert.equal(left.checked, 0);
  assert.equal(left.document, 'main.tex');
  assert.deepEqual(left.bibFiles, []);
  assert.equal(left.note, 'main.tex loads references.bib, which is not in the project.');
  // keys asked for that the main file's bibliography lacks are named, with the way to the other document
  const keys = checkSummary(await checkReferences(probe, { state: agent, keys: ['probeA'] }));
  assert.match(keys.note, /probeA is not in any \.bib file read\. If another document loads it, check again with that document as file\./);
  await assert.rejects(checkReferences(probe, { state: agent, file: 'nowhere.tex' }), /There is no document nowhere\.tex/);
  // a key the agent reads a source by, or records a claim with, is found whichever document loads it
  assert.deepEqual((await allBibEntries(probe)).map((e) => e.key), ['probeA', 'probeB']);

  // \bibliography without the extension, Typst, Markdown (one name or a list)
  assert.deepEqual(await read(await project({ 'p.tex': doc('\\bibliography{research-probe}'), 'research-probe.bib': entry('a'), 'other.bib': entry('z') }), 'p.tex'), ['p.tex', ['research-probe.bib'], ['a']]);
  assert.deepEqual(await read(await project({ 'paper.typ': '= Hi\n@a\n#bibliography("x.bib")\n', 'x.bib': entry('a'), 'other.bib': entry('z') })), ['paper.typ', ['x.bib'], ['a']]);
  assert.deepEqual(await read(await project({ 'paper.md': '---\ntitle: T\nbibliography: x.bib\n---\n\n[@a]\n', 'x.bib': entry('a'), 'other.bib': entry('z') })), ['paper.md', ['x.bib'], ['a']]);
  assert.deepEqual(await read(await project({ 'paper.md': '---\nbibliography: [x.bib, y.bib]\n---\n\n[@a]\n', 'x.bib': entry('a'), 'y.bib': entry('b'), 'other.bib': entry('z') })), ['paper.md', ['x.bib', 'y.bib'], ['a', 'b']]);
  // a .bib in a subfolder: by its path, from a document in a folder of its own, or found by name as BIBINPUTS would
  assert.deepEqual(await read(await project({ 'p.tex': doc('\\addbibresource{bib/refs.bib}'), 'bib/refs.bib': entry('a'), 'refs.bib': entry('z') }), 'p.tex'), ['p.tex', ['bib/refs.bib'], ['a']]);
  assert.deepEqual(await read(await project({ 'paper/p.tex': doc('\\bibliography{refs}'), 'paper/refs.bib': entry('a'), 'refs.bib': entry('z') }), 'paper/p.tex'), ['paper/p.tex', ['paper/refs.bib'], ['a']]);
  assert.deepEqual(await read(await project({ 'p.tex': doc('\\bibliography{refs}'), 'bib/refs.bib': entry('a') }), 'p.tex'), ['p.tex', ['bib/refs.bib'], ['a']]);
  // two .bib files loaded, both read, and one left out is not
  const two = await project({ 'p.tex': doc('\\addbibresource{a.bib}\n\\addbibresource{b.bib}'), 'a.bib': entry('a'), 'b.bib': entry('b'), 'c.bib': entry('c') });
  assert.deepEqual(await read(two, 'p.tex'), ['p.tex', ['a.bib', 'b.bib'], ['a', 'b']]);
  // none named: every .bib, said; none at all, said
  assert.equal(checkSummary(await checkReferences(await project({ 'p.tex': doc(''), 'a.bib': entry('a') }), { file: 'p.tex' })).note, 'p.tex loads no .bib file, so every .bib in the project was read.');
  assert.equal(checkSummary(await checkReferences(await project({ 'p.tex': doc('') }), { file: 'p.tex' })).note, 'p.tex loads no .bib file and the project has none.');

  // Review's References exist checks the document reviewed, and says what it read
  const { default: Fastify } = await import('fastify');
  const { registerReferenceRoutes } = await import('../src/routes/references.js');
  const { createProject, getProjectRoot } = await import('../src/services/projectService.js');
  const app = Fastify();
  registerReferenceRoutes(app);
  const p = await createProject({ name: 'Probe' });
  const root = await getProjectRoot(p.id);
  await fs.writeFile(path.join(root, 'main.tex'), doc('\\addbibresource{references.bib}'));
  await fs.rm(path.join(root, 'references.bib'), { force: true });
  await fs.writeFile(path.join(root, 'research-probe.tex'), doc('\\addbibresource{research-probe.bib}'));
  await fs.writeFile(path.join(root, 'research-probe.bib'), entry('probeA'));
  const reviewed = (await app.inject({ url: '/api/references/check', method: 'POST', payload: { projectId: p.id, doc: 'research-probe.tex' } })).json();
  assert.deepEqual([reviewed.bibFiles, reviewed.rows.map((r) => r.key), reviewed.note], [['research-probe.bib'], ['probeA'], '']);
  const main = (await app.inject({ url: '/api/references/check', method: 'POST', payload: { projectId: p.id } })).json();
  assert.equal(main.note, 'main.tex loads references.bib, which is not in the project.');
  assert.equal((await app.inject({ url: '/api/references/check', method: 'POST', payload: { projectId: p.id, doc: 7 } })).statusCode, 400);
  await app.close();
});
