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
