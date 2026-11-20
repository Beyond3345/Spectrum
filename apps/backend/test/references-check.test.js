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
      return file ? send(200, json(file)) : send(404, { error: 'not found' });
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
