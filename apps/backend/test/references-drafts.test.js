// References card: every input kind (ISBN, pasted BibTeX and RIS, formatted citations, book titles, a blank entry),
// drafts that write nothing, the commit that writes one, and each entry type written for Biber and for classic BibTeX.
// Open Library, Google Books, Crossref and doi.org are local stubs: no test reaches the network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const data = mkdtempSync(path.join(tmpdir(), 'spectrum-drafts-data-'));
process.env.SPECTRUM_DATA_DIR = data;
delete process.env.SPECTRUM_LLM_API_KEY;
after(() => rmSync(data, { recursive: true, force: true }));

const {
  isbnOf, classifyLine, splitInput, parseFormatted, parseRis, splitAuthors, editionOf, recordToDraft,
  resolveReferences, addReference, commitReference, newEntry
} = await import('../src/services/referenceService.js');
const { ENTRY_TYPES, formatEntry, draftProblems, hasProblems, texValue, bracesBalanced, suggestKey, fieldsShown } = await import('../src/services/bibEntry.js');
const { register } = await import('../src/services/projectService.js');
const { default: Fastify } = await import('fastify');
const { registerReferenceRoutes } = await import('../src/routes/references.js');

const fieldsOf = (bib) => Object.fromEntries([...bib.matchAll(/^ {2}(\w+)\s+= \{(.*)\},$/gm)].map((m) => [m[1], m[2]]));
const typeOf = (bib) => bib.match(/^@(\w+)\{/)[1];

// ─── ISBNs ───

test('ISBN-10 and ISBN-13 are known by their check digit, and given as 13 digits', () => {
  assert.equal(isbnOf('978-0-262-04630-5'), '9780262046305');
  assert.equal(isbnOf('0-262-04630-X'), '9780262046305', 'X stands for 10');
  assert.equal(isbnOf('0262033844'), '9780262033848');
    assert.equal(isbnOf('978-0-262-04630-4'), '', 'a wrong check digit');
  assert.equal(isbnOf('0262033845'), '');
  assert.equal(isbnOf('1234567890123'), '', 'not 978 or 979');
  assert.deepEqual(['ISBN 978-0-262-04630-5', 'ISBN-10: 0262033844', '9780262046305', '978 0 262 04630 5'].map((s) => classifyLine(s).kind), ['isbn', 'isbn', 'isbn', 'isbn']);
  assert.equal(classifyLine('978-0-262-04630-4').kind, 'query', 'a number that isn’t an ISBN is searched as written');
});

// ─── Formatted citations ───

const CITATIONS = {
  apaBook: 'Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C. (2022). Introduction to algorithms (4th ed.). MIT Press.',
  apaArticle: 'LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.',
  apaChapter: 'Smith, J. A. (2020). A chapter on things. In B. Editor & C. Other (Eds.), The book of things (pp. 10–20). Springer.',
  ieeePaper: '[1] A. Vaswani, N. Shazeer, and N. Parmar, “Attention is all you need,” in Proc. NeurIPS, 2017, pp. 5998–6008.',
  ieeeBook: '[2] T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, Introduction to Algorithms, 4th ed. Cambridge, MA, USA: MIT Press, 2022.',
  ieeeArticle: '[3] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436–444, 2015.',
  chicagoBook: 'Cormen, Thomas H., Charles E. Leiserson, Ronald L. Rivest, and Clifford Stein. Introduction to Algorithms. 4th ed. Cambridge, MA: MIT Press, 2022.',
  chicagoDate: 'Cormen, Thomas H., Charles E. Leiserson, Ronald L. Rivest, and Clifford Stein. 2022. Introduction to Algorithms. 4th ed. Cambridge, MA: MIT Press.',
  chicagoArticle: 'LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. “Deep Learning.” Nature 521, no. 7553 (2015): 436–44.',
  mlaArticle: 'Vaswani, Ashish, et al. “Attention Is All You Need.” Advances in Neural Information Processing Systems, vol. 30, 2017, pp. 5998–6008.',
  mlaBook: 'Cormen, Thomas H., et al. Introduction to Algorithms. 4th ed., MIT Press, 2022.',
  thesis: 'Doe, Jane. "Learning Things." PhD dissertation, University of Melbourne, 2019.'
};

test('APA, IEEE, Chicago and MLA citations are read into their fields', () => {
  const p = Object.fromEntries(Object.entries(CITATIONS).map(([k, v]) => [k, parseFormatted(v)]));
  const names = (rec) => rec.author.map((a) => a.literal || `${a.family}, ${a.given || ''}`.trim());
  for (const k of ['apaBook', 'ieeeBook', 'chicagoBook', 'chicagoDate', 'mlaBook']) {
    assert.equal(p[k].type, 'book', k);
    assert.equal(p[k].title, k === 'apaBook' ? 'Introduction to algorithms' : 'Introduction to Algorithms', k);
    assert.equal(p[k].edition, '4', k);
    assert.equal(p[k].publisher, 'MIT Press', k);
    assert.deepEqual(p[k].issued, { 'date-parts': [[2022]] }, k);
  }
  assert.deepEqual(names(p.apaBook), ['Cormen, T. H.', 'Leiserson, C. E.', 'Rivest, R. L.', 'Stein, C.']);
  assert.deepEqual(names(p.chicagoBook), ['Cormen, Thomas H.', 'Leiserson, Charles E.', 'Rivest, Ronald L.', 'Stein, Clifford']);
  assert.deepEqual(names(p.ieeeBook), ['Cormen, T. H.', 'Leiserson, C. E.', 'Rivest, R. L.', 'Stein, C.']);
  assert.deepEqual(names(p.mlaBook), ['Cormen, Thomas H.', 'others'], 'et al. is BibTeX’s and others');
  assert.equal(p.ieeeBook['publisher-place'], 'Cambridge, MA, USA');
  assert.equal(p.chicagoBook['publisher-place'], 'Cambridge, MA');
  for (const k of ['apaArticle', 'ieeeArticle', 'chicagoArticle']) {
    assert.equal(p[k].type, 'article-journal', k);
    assert.deepEqual([p[k]['container-title'], p[k].volume, p[k].issue, p[k].issued['date-parts'][0][0]], ['Nature', '521', '7553', 2015], k);
    assert.match(p[k].page, /^436[-–]44/, k);
  }
  assert.deepEqual([p.ieeePaper.type, p.ieeePaper['container-title'], p.ieeePaper.page], ['paper-conference', 'Proc. NeurIPS', '5998–6008']);
  assert.deepEqual([p.mlaArticle.type, p.mlaArticle.volume, p.mlaArticle.title], ['paper-conference', '30', 'Attention Is All You Need']);
  assert.deepEqual([p.apaChapter.type, p.apaChapter['container-title'], p.apaChapter.publisher, p.apaChapter.editor.map((e) => e.family)], ['chapter', 'The book of things', 'Springer', ['Editor', 'Other']]);
  assert.deepEqual([p.thesis.type, p.thesis.publisher], ['thesis', 'University of Melbourne']);
  // a bare title, a sentence or a list of words is not a citation
  for (const text of ['Attention is all you need', 'Deep learning review 2017', 'The quick brown fox jumps over the lazy dog. 2020. Something else.', 'Doe J. Another study. 2021']) {
    assert.equal(parseFormatted(text), null, text);
  }
  assert.deepEqual(Object.values(CITATIONS).map((c) => classifyLine(c).kind), Array(Object.keys(CITATIONS).length).fill('citation'));
  // one with a DOI is looked up by it, and kept as it reads if that fails
  const withDoi = classifyLine(`${CITATIONS.apaArticle} https://doi.org/10.1038/nature14539`);
  assert.deepEqual([withDoi.kind, withDoi.doi, withDoi.parsed.title], ['doi', '10.1038/nature14539', 'Deep learning']);
  assert.equal(editionOf('Fourth edition'), '4');
  assert.deepEqual(splitAuthors('Smith, J., & van der Berg, K.').map((a) => a.family), ['Smith', 'van der Berg']);
});

// ─── Pasted BibTeX and RIS ───

const PASTED_BIB = `@book{cormen2022,
  author    = {Cormen, Thomas H. and Leiserson, Charles E.},
  title     = {Introduction to Algorithms},
  edition   = {4},
  publisher = {MIT Press},
  year      = {2022},
  isbn      = {978-0-262-04630-5}
}

@phdthesis{doe2019,
  author = {Doe, Jane},
  title  = {Learning Things},
  school = {University of Melbourne},
  year   = 2019
}`;

const PASTED_RIS = `TY  - JOUR
AU  - LeCun, Yann
AU  - Bengio, Yoshua
TI  - Deep learning
JO  - Nature
VL  - 521
IS  - 7553
SP  - 436
EP  - 444
PY  - 2015/05/27/
DO  - 10.1038/nature14539
ER  -

TY  - BOOK
AU  - Cormen, Thomas H.
TI  - Introduction to Algorithms
ET  - 4
PB  - MIT Press
CY  - Cambridge, MA
SN  - 9780262046305
PY  - 2022
ER  - `;

test('pasted BibTeX and RIS are taken whole, entry by entry, never line by line', async () => {
  const bib = await splitInput(PASTED_BIB);
  assert.deepEqual(bib.map((it) => [it.kind, it.entry.key]), [['bibtex', 'cormen2022'], ['bibtex', 'doe2019']]);
  const ris = await splitInput(PASTED_RIS);
  assert.deepEqual(ris.map((it) => it.kind), ['ris', 'ris']);
  const [article, book] = parseRis(PASTED_RIS);
  assert.deepEqual([article.type, article['container-title'], article.page, article.DOI, article.issued], ['article-journal', 'Nature', '436-444', '10.1038/nature14539', { 'date-parts': [[2015, 5, 27]] }]);
  assert.deepEqual([book.type, book.edition, book.publisher, book['publisher-place'], book.ISBN], ['book', '4', 'MIT Press', 'Cambridge, MA', ['9780262046305']]);
  const draft = recordToDraft(book, 'Cormen2022');
  assert.deepEqual([draft.type, draft.fields.edition, draft.fields.address, draft.fields.isbn], ['book', '4', 'Cambridge, MA', '9780262046305']);
});

// ─── Entry types, for Biber and for classic BibTeX ───

test('each entry type is written for Biber and, with its fallback, for classic BibTeX', () => {
  const all = { author: 'Doe, Jane', title: 'A Work', year: '2024', url: 'https://x.test/a_b', urldate: '2026-11-27', version: '1.2', type: '', organization: 'Org', institution: 'Uni', journal: 'J. Things', booktitle: 'The Book', chapter: '3', pages: '42--45', edition: '2', publisher: 'Pub', address: 'Melbourne', isbn: '9780262046305', date: '2024-05-01', number: 'TR-7', doi: '10.1/x', howpublished: 'Online', note: '', editor: 'Roe, Rick', volume: '3', series: 'S', eprint: '1706.03762' };
  const write = (type, biblatex, legacyUrls = false) => {
    const own = Object.fromEntries(ENTRY_TYPES.find((t) => t.id === type).fields.map((f) => [f, all[f]]));
    return formatEntry({ type, key: 'K', fields: own }, { biblatex, legacyUrls });
  };
  const heads = Object.fromEntries(ENTRY_TYPES.map((t) => [t.id, [typeOf(write(t.id, true)), typeOf(write(t.id, false))]]));
  assert.deepEqual(heads, {
    article: ['article', 'article'], inproceedings: ['inproceedings', 'inproceedings'], book: ['book', 'book'], inbook: ['inbook', 'inbook'],
    incollection: ['incollection', 'incollection'], manual: ['manual', 'manual'], software: ['software', 'misc'], online: ['online', 'misc'],
    report: ['report', 'techreport'], thesis: ['thesis', 'phdthesis'], misc: ['misc', 'misc']
  });
  // Biber's names; BibTeX's
  const article = [fieldsOf(write('article', true)), fieldsOf(write('article', false))];
  assert.deepEqual([article[0].journaltitle, article[0].date, article[0].journal, article[0].year], ['J. Things', '2024', undefined, undefined]);
  assert.deepEqual([article[1].journal, article[1].year, article[1].journaltitle], ['J. Things', '2024', undefined]);
  const book = [fieldsOf(write('book', true)), fieldsOf(write('book', false))];
  assert.deepEqual([book[0].location, book[1].address, book[0].isbn, book[0].edition], ['Melbourne', 'Melbourne', '9780262046305', '2']);
  const thesis = [fieldsOf(write('thesis', true)), fieldsOf(write('thesis', false))];
  assert.deepEqual([thesis[0].type, thesis[0].institution, thesis[1].school, thesis[1].type], ['phdthesis', 'Uni', 'Uni', undefined]);
  assert.equal(typeOf(formatEntry({ type: 'thesis', key: 'K', fields: { title: 'T', type: 'mastersthesis' } })), 'mastersthesis');
  assert.equal(fieldsOf(formatEntry({ type: 'thesis', key: 'K', fields: { title: 'T', type: 'mastersthesis' } }, { biblatex: true })).type, 'mathesis');
  assert.equal(fieldsOf(write('report', true)).type, 'techreport');
  // what classic BibTeX has no field for goes in note; a style that ignores url gets the address in howpublished
  const online = [fieldsOf(write('online', true)), fieldsOf(write('online', false)), fieldsOf(write('online', false, true))];
  assert.deepEqual([online[0].urldate, online[0].url, online[0].date], ['2026-11-27', 'https://x.test/a_b', '2024-05-01']);
  assert.deepEqual([online[1].note, online[1].year, online[1].url], ['Accessed 2026-11-27', '2024', 'https://x.test/a_b']);
  assert.deepEqual([online[2].howpublished, online[2].url], ['\\url{https://x.test/a_b}', undefined]);
  assert.deepEqual([fieldsOf(write('software', true)).version, fieldsOf(write('software', false)).note], ['1.2', 'Version 1.2']);
  assert.equal(fieldsOf(write('manual', false)).note, 'Version 1.2. Accessed 2026-11-27');
  const chapter = fieldsOf(write('inbook', true));
  assert.deepEqual([chapter.booktitle, chapter.chapter, chapter.pages, chapter.editor], ['The Book', '3', '42--45', 'Roe, Rick']);
});

test('typed text is escaped once, braces are checked and a key is suggested', () => {
  assert.equal(texValue('title', 'R&D: 50% of #1 a_b, $x_1$, \\& kept'), 'R\\&D: 50\\% of \\#1 a\\_b, $x_1$, \\& kept');
  assert.equal(texValue('title', texValue('title', 'A & B')), 'A \\& B');
  assert.equal(texValue('url', 'https://x.test/a_b#c'), 'https://x.test/a_b#c');
  assert.equal(bracesBalanced('{BERT} and \\{ x'), true);
  assert.equal(bracesBalanced('{BERT'), false);
  assert.equal(bracesBalanced('}{'), false);
  assert.equal(suggestKey({ author: 'Cormen, Thomas H. and Stein, C.', year: '2022' }), 'Cormen2022');
  assert.equal(suggestKey({ author: 'Ada Lovelace', date: '1843-01-01' }), 'Lovelace1843');
  assert.equal(suggestKey({ author: '{Texas Instruments}', year: '2021' }), 'Instruments2021');
  assert.equal(suggestKey({ author: 'Müller, Hans' }), 'Muller');
  assert.equal(suggestKey({ title: 'A Guide to Things' }), 'Guide');
  const taken = new Set(['cormen2022']);
  assert.match(draftProblems({ type: 'book', key: 'Cormen2022', fields: { title: 'T' } }, taken).key, /already used/);
  assert.match(draftProblems({ type: 'book', key: 'has space', fields: { title: 'T' } }).key, /can’t hold/);
  assert.equal(draftProblems({ type: 'book', key: 'K', fields: { title: '{Open' } }).fields.title, 'Each { needs its }');
  assert.equal(draftProblems({ type: 'book', key: 'K', fields: {} }).fields.title, 'Give the entry a title');
  assert.equal(hasProblems(draftProblems({ type: 'book', key: '', fields: { title: 'T', author: 'Doe, J.' } })), false);
  assert.deepEqual(fieldsShown('software', { title: 'x', eprint: '1', note: '' }), ['author', 'title', 'version', 'year', 'url', 'doi', 'eprint']);
});

// ─── Lookups on stubs ───

let stub;
let base;
const asked = [];
const OL_BOOK = {
  title: 'Introduction to Algorithms', subtitle: '', edition_name: 'Fourth edition', authors: [{ name: 'Thomas H. Cormen' }, { name: 'Charles E. Leiserson' }],
  publishers: [{ name: 'MIT Press' }], publish_places: [{ name: 'Cambridge, MA' }], publish_date: 'April 5, 2022', url: 'https://openlibrary.org/books/OL1M'
};
const GB_BOOK = { title: 'Signals and Systems', subtitle: 'Second edition', authors: ['Alan V. Oppenheim'], publisher: 'Prentice Hall', publishedDate: '1997', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780138147570' }] };
const CR_BOOK = { DOI: '10.1007/978-3-030-00001-1', type: 'monograph', title: ['A Springer Book'], author: [{ family: 'Weber', given: 'Max' }], publisher: 'Springer', issued: { 'date-parts': [[2019]] } };

before(async () => {
  stub = createServer((req, res) => {
    const url = new URL(req.url, 'http://stub');
    asked.push(url.pathname + url.search);
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/ol/api/books') {
      const bibkey = url.searchParams.get('bibkeys');
      return send(200, bibkey === 'ISBN:9780262046305' ? { [bibkey]: OL_BOOK } : {});
    }
    if (url.pathname === '/ol/search.json') {
      const q = url.searchParams.get('q');
      return send(200, { docs: /algorithms/i.test(q) ? [
        { title: 'Introduction to Algorithms', author_name: ['Thomas H. Cormen'], first_publish_year: 1990, publisher: ['MIT Press'], isbn: ['9780262046305'] },
        { title: 'Introduction to Algorithms', author_name: ['Thomas H. Cormen'], first_publish_year: 2009, publisher: ['MIT Press'], isbn: ['9780262033848'] }
      ] : [] });
    }
    if (url.pathname === '/gb/volumes') {
      const q = url.searchParams.get('q');
      return send(200, q === 'isbn:9780138147570' ? { items: [{ volumeInfo: GB_BOOK }] } : { totalItems: 0 });
    }
    if (url.pathname === '/crossref/works') {
      if (url.searchParams.get('filter') === 'isbn:9783030000011') return send(200, { message: { items: [CR_BOOK] } });
      const q = url.searchParams.get('query.bibliographic') || '';
      if (/Deep learning/i.test(q)) return send(200, { message: { items: [{ DOI: '10.1038/nature14539', title: ['Deep learning'], author: [{ family: 'LeCun', given: 'Yann' }], issued: { 'date-parts': [[2015]] }, type: 'journal-article' }] } });
      return send(200, { message: { items: [] } });
    }
    if (url.pathname === '/doi/10.1038/nature14539') {
      return send(200, { type: 'article-journal', title: 'Deep learning', author: [{ family: 'LeCun', given: 'Yann' }, { family: 'Bengio', given: 'Yoshua' }], issued: { 'date-parts': [[2015, 5]] }, 'container-title': 'Nature', volume: '521', issue: '7553', page: '436-444', DOI: '10.1038/nature14539' });
    }
    return send(404, { error: 'nope' });
  });
  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${stub.address().port}`;
  process.env.SPECTRUM_OPENLIBRARY_BASE = `${base}/ol`;
  process.env.SPECTRUM_GOOGLEBOOKS_BASE = `${base}/gb`;
  process.env.SPECTRUM_CROSSREF_BASE = `${base}/crossref`;
  process.env.SPECTRUM_DOI_BASE = `${base}/doi`;
  process.env.SPECTRUM_ARXIV_BASE = `${base}/arxiv`;
});
after(() => stub?.close());

async function tempProject(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'spectrum-drafts-'));
  const meta = { id: path.basename(root), name: 'Paper' };
  for (const [rel, content] of Object.entries({ '.spectrum/project.json': JSON.stringify(meta), ...files })) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), content);
  }
  await register(meta.id, root, meta);
  return root;
}

const BIBLATEX_MAIN = '\\documentclass{article}\n\\usepackage{biblatex}\n\\addbibresource{refs.bib}\n\\begin{document}\\end{document}\n';
const BIBTEX_MAIN = '\\documentclass{article}\n\\begin{document}\n\\bibliographystyle{plainnat}\n\\bibliography{refs}\n\\end{document}\n';

test('a preview makes drafts and writes nothing; the commit writes one, a duplicate and a taken key are caught', async (t) => {
  const root = await tempProject({ 'main.tex': BIBLATEX_MAIN, 'refs.bib': '@article{Cormen2022,\n  title = {Something else},\n  year = {2022}\n}\n' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const before = readFileSync(path.join(root, 'refs.bib'), 'utf8');
  const out = await resolveReferences({ projectRoot: root, input: 'ISBN 978-0-262-04630-5', preview: true });
  assert.equal(readFileSync(path.join(root, 'refs.bib'), 'utf8'), before, 'nothing written');
  const [r] = out.results;
  assert.deepEqual([r.status, r.source, r.key, out.biblatex, out.keys], ['draft', 'Open Library', 'Cormen2022a', true, ['cormen2022']]);
  assert.deepEqual(r.draft.fields, {
    author: 'Cormen, Thomas H. and Leiserson, Charles E.', title: 'Introduction to Algorithms', edition: '4', year: '2022',
    publisher: 'MIT Press', address: 'Cambridge, MA', isbn: '9780262046305', url: 'https://openlibrary.org/books/OL1M'
  });
  // the user edits the draft, then adds it under a key the project already uses: it goes in under the next free one
  const draft = { ...r.draft, key: 'Cormen2022', fields: { ...r.draft.fields, series: 'Classics & More' } };
  const added = await commitReference({ projectRoot: root, draft, input: r.input });
  assert.deepEqual([added.result.status, added.result.key, added.bibFile], ['added', 'Cormen2022a', 'refs.bib']);
  const written = readFileSync(path.join(root, 'refs.bib'), 'utf8');
  assert.ok(written.startsWith(before), 'appended after what was there');
  assert.match(written, /@book\{Cormen2022a,/);
  assert.match(written, /location {2}= \{Cambridge, MA\}/, 'Biber’s location');
  assert.match(written, /series {4}= \{Classics \\& More\}/, 'a typed & escaped');
  // the same book again: already there, by its ISBN
  assert.equal((await resolveReferences({ projectRoot: root, input: '9780262046305', preview: true })).results[0].status, 'duplicate');
  assert.equal((await commitReference({ projectRoot: root, draft })).result.status, 'duplicate');
  await assert.rejects(commitReference({ projectRoot: root, draft: { ...draft, fields: { title: '{broken' } } }), (err) => err.statusCode === 400);
  await assert.rejects(commitReference({ projectRoot: root, draft: { ...draft, key: 'a b' } }), (err) => err.statusCode === 400);
});

test('ISBNs: Google Books when Open Library has none, and Crossref for an academic publisher’s book', async (t) => {
  const root = await tempProject({ 'main.tex': BIBTEX_MAIN });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const [gb, cr, none] = (await resolveReferences({ projectRoot: root, input: 'ISBN 978-0-13-814757-0\nISBN 978-3-030-00001-1\nISBN 978-0-00-000000-2', preview: true })).results;
  assert.deepEqual([gb.status, gb.source, gb.draft.fields.title, gb.draft.fields.edition, gb.draft.fields.isbn], ['draft', 'Google Books', 'Signals and Systems', '2', '9780138147570']);
  assert.deepEqual([cr.status, cr.source, cr.draft.type, cr.draft.fields.doi], ['draft', 'Crossref', 'book', '10.1007/978-3-030-00001-1']);
  assert.deepEqual([none.status, none.message], ['not_found', 'No book found for ISBN 9780000000002.']);
  assert.deepEqual(['refs.bib', 'references.bib'].map((f) => existsSync(path.join(root, f))), [false, false], 'a preview makes no .bib');
});

test('a book title finds books to choose from, each fetched again by its ISBN', async (t) => {
  const root = await tempProject({ 'main.tex': BIBTEX_MAIN });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const [r] = (await resolveReferences({ projectRoot: root, input: 'Introduction to Algorithms', preview: true })).results;
  assert.equal(r.status, 'choose');
  assert.deepEqual(r.candidates.map((c) => [c.id, c.venue]), [['ISBN 9780262046305', 'MIT Press'], ['ISBN 9780262033848', 'MIT Press']]);
  const picked = await addReference({ projectRoot: root, candidateId: r.candidates[0].id, preview: true });
  assert.deepEqual([picked.result.status, picked.result.draft.type, picked.result.draft.fields.edition], ['draft', 'book', '4']);
  assert.equal(existsSync(path.join(root, 'refs.bib')), false);
});

test('a formatted citation is checked on Crossref, and kept as it reads when no source has it', async (t) => {
  const root = await tempProject({ 'main.tex': BIBTEX_MAIN });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const [found, kept] = (await resolveReferences({ projectRoot: root, input: `${CITATIONS.apaArticle}\n${CITATIONS.thesis}`, preview: true })).results;
  assert.deepEqual([found.status, found.source, found.verified, found.draft.fields.doi, found.draft.fields.author], ['draft', 'Crossref', undefined, '10.1038/nature14539', 'LeCun, Yann and Bengio, Yoshua']);
  assert.deepEqual([kept.status, kept.verified, kept.source, kept.draft.type, kept.draft.fields.institution, kept.key], ['draft', false, 'the citation as pasted', 'thesis', 'University of Melbourne', 'Doe2019']);
  // a book whose citation no source knows keeps its edition and publisher
  const [book] = (await resolveReferences({ projectRoot: root, input: 'Smith, John. A Rare Book. 2nd ed. Sydney: Small Press, 2001.', preview: true })).results;
  assert.deepEqual([book.verified, book.draft.type, book.draft.fields.edition, book.draft.fields.publisher, book.draft.fields.address], [false, 'book', '2', 'Small Press', 'Sydney']);
});

test('pasted BibTeX keeps its key and fields; RIS becomes drafts; a blank entry starts empty', async (t) => {
  const root = await tempProject({ 'main.tex': BIBTEX_MAIN, 'refs.bib': '@misc{doe2019,\n  title = {Other},\n  year = {2001}\n}\n' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bib = await resolveReferences({ projectRoot: root, input: PASTED_BIB, preview: true });
  assert.deepEqual(bib.results.map((r) => [r.status, r.key, r.draft.type]), [['draft', 'cormen2022', 'book'], ['draft', 'doe2019a', 'thesis']]);
  assert.deepEqual(bib.results[1].draft.fields, { author: 'Doe, Jane', title: 'Learning Things', school: 'University of Melbourne', year: '2019', type: 'phdthesis' });
  assert.equal(bib.legacyUrls, false);
  assert.equal(bib.biblatex, false, 'a LaTeX project without biblatex is written for BibTeX');
  const thesis = await commitReference({ projectRoot: root, draft: bib.results[1].draft });
  assert.match(thesis.result.bibtex, /^@phdthesis\{doe2019a,\n {2}author = \{Doe, Jane\},/);
  const ris = await resolveReferences({ projectRoot: root, input: PASTED_RIS, preview: true });
  assert.deepEqual(ris.results.map((r) => [r.status, r.draft?.type, r.key]), [['draft', 'article', 'LeCun2015'], ['draft', 'book', 'Cormen2022']]);
  const blank = await newEntry({ projectRoot: root });
  assert.deepEqual([blank.results[0].status, blank.results[0].draft, blank.bibFile], ['draft', { type: 'article', key: '', fields: {} }, 'refs.bib']);
  // a blank entry filled in and added under its suggested key
  const manual = await commitReference({ projectRoot: root, draft: { type: 'manual', key: '', fields: { title: 'MSP430 User’s Guide', organization: 'Texas Instruments', version: '2.1', year: '2021', urldate: '2026-11-27' } } });
  assert.equal(manual.result.key, 'Instruments2021', 'no author: the organisation');
  assert.match(manual.result.bibtex, /note {9}= \{Version 2\.1\. Accessed 2026-11-27\}/);
});

test('a Typst project gets Biber’s types, as Typst reads them', async (t) => {
  const root = await tempProject({ 'main.typ': '#bibliography("refs.bib")\n', '.spectrum/settings.json': '{}' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const out = await commitReference({ projectRoot: root, draft: { type: 'online', key: 'Typst2024', fields: { title: 'Typst docs', url: 'https://typst.app/docs', urldate: '2026-11-27' } } });
  assert.match(out.result.bibtex, /^@online\{Typst2024,[\s\S]*urldate = \{2026-11-27\}/);
  assert.equal(out.bibFile, 'refs.bib');
});

test('the routes: preview, a blank entry and the commit, which refuses what it can’t read', async (t) => {
  const root = await tempProject({ 'main.tex': BIBTEX_MAIN });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = Fastify();
  registerReferenceRoutes(app);
  t.after(() => app.close());
  const post = (url, payload) => app.inject({ url, method: 'POST', payload });
  const projectId = path.basename(root);
  const preview = (await post('/api/references/resolve', { projectId, input: 'ISBN 9780262046305', preview: true })).json();
  assert.deepEqual([preview.ok, preview.results[0].status], [true, 'draft']);
  assert.equal(existsSync(path.join(root, 'references.bib')), false);
  assert.equal((await post('/api/references/resolve', { projectId, manual: true })).json().results[0].input, 'New entry');
  assert.equal((await post('/api/references/commit', { projectId, draft: { type: 'book', key: 'K', fields: [] } })).statusCode, 400);
  assert.equal((await post('/api/references/commit', { projectId, draft: { type: 'book', key: 'K', fields: { title: 7 } } })).statusCode, 400);
  const added = (await post('/api/references/commit', { projectId, draft: preview.results[0].draft })).json();
  assert.deepEqual([added.ok, added.result.status, added.result.key], [true, 'added', 'Cormen2022']);
  assert.match(readFileSync(path.join(root, 'references.bib'), 'utf8'), /^@book\{Cormen2022,\n {2}author {4}= /);
});
