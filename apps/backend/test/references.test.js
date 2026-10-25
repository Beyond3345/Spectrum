// References resolver: pure helpers plus an integration run against a local mock of
// doi.org / Crossref / arXiv / publisher pages. No network unless SPECTRUM_LIVE_TESTS=1.
// Run: node --test apps/backend/test/references.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  detectInput, splitLines, splitInput, cleanDoi, baseKey, uniqueKey, findDuplicate, buildBibIndex,
  parseBibEntries, toBibtex, texEscape, parseHtmlMeta, readHtmlCitation, pickCandidate, titleFitsPage,
  texIncludesBib, normaliseTitle, pickBibTarget, arxivRecordFromAtom, resolveReferences, addReference,
  parseName, pdfTexSafe, issuedFromDate
} from '../src/services/referenceService.js';

// Never let a developer's own key send test input to a real provider.
delete process.env.SPECTRUM_LLM_API_KEY;

const year = (y) => ({ 'date-parts': [[y]] });

// ─── Input detection ───

test('detects DOIs anywhere and cleans them', () => {
  assert.equal(detectInput('https://doi.org/10.1038/nature14539').doi, '10.1038/nature14539');
  assert.equal(detectInput('doi:10.1145/3065386.').doi, '10.1145/3065386');
  assert.equal(detectInput('(see 10.1000/xyz123)').doi, '10.1000/xyz123');
  assert.equal(detectInput('10.1016/0370-2693(82)90087-4').doi, '10.1016/0370-2693(82)90087-4');
  assert.equal(detectInput('https://onlinelibrary.wiley.com/doi/full/10.1002/anie.201915678?af=R').doi, '10.1002/anie.201915678');
  assert.equal(detectInput('https://dl.acm.org/doi/10.1145/3065386#sec-1').doi, '10.1145/3065386');
  assert.equal(detectInput('https://www.tandfonline.com/doi/abs/10.1080/1234/abstract').doi, '10.1080/1234');
  assert.equal(cleanDoi('10.1234/a%3Cb%3E'), '10.1234/a<b>');
  const arxivDoi = detectInput('10.48550/arXiv.1706.03762');
  assert.equal(arxivDoi.kind, 'doi');
  assert.equal(arxivDoi.arxiv, '1706.03762');
  // bioRxiv/medRxiv URL versions aren't part of the DOI; SICI DOIs keep their <…> part
  assert.equal(detectInput('https://www.biorxiv.org/content/10.1101/2020.06.09.141689v1').doi, '10.1101/2020.06.09.141689');
  assert.equal(detectInput('https://www.medrxiv.org/content/10.1101/2020.03.04.20031112v3.full.pdf').doi, '10.1101/2020.03.04.20031112');
  assert.equal(detectInput('10.1002/(SICI)1097-0258(19980430)17:8<857::AID-SIM777>3.0.CO;2-E').doi, '10.1002/(SICI)1097-0258(19980430)17:8<857::AID-SIM777>3.0.CO;2-E');
  assert.equal(readHtmlCitation('<title>T</title><a href="https://doi.org/10.1234/x">x</a>', 'https://x.test').doi, '10.1234/x');
});

test('detects arXiv ids, URLs and free-text queries', () => {
  assert.deepEqual(
    ['https://arxiv.org/abs/1706.03762v7', 'https://arxiv.org/pdf/hep-th/9901001v2', 'arXiv:1706.03762', '2101.00002v3', 'math.GT/0309136', 'Vaswani et al., arXiv preprint arXiv:1706.03762, 2017']
      .map((s) => [detectInput(s).kind, detectInput(s).arxiv]),
    [['arxiv', '1706.03762'], ['arxiv', 'hep-th/9901001'], ['arxiv', '1706.03762'], ['arxiv', '2101.00002'], ['arxiv', 'math.GT/0309136'], ['arxiv', '1706.03762']]
  );
  assert.deepEqual(detectInput('https://example.com/paper?id=3.').url, 'https://example.com/paper?id=3');
  assert.equal(detectInput('https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)').url, 'https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)');
  assert.equal(detectInput('(see https://x.test/a).').url, 'https://x.test/a');
  assert.deepEqual(['https://arxiv.org/html/2401.04088v1', 'https://ar5iv.labs.arxiv.org/html/1706.03762', 'https://ar5iv.org/abs/1706.03762'].map((u) => detectInput(u).arxiv), ['2401.04088', '1706.03762', '1706.03762']);
  assert.equal(detectInput('www.example.com/page').url, 'https://www.example.com/page');
  assert.equal(detectInput('Attention is all you need').kind, 'query');
  // 2017.1234 is not a valid arXiv id (month 17)
  assert.equal(detectInput('Deep learning review 2017.1234').kind, 'query');
  assert.deepEqual(splitLines('\n 10.1000/a \n\n Some title\n').map((it) => it.kind), ['doi', 'query']);
  // several ids on one line are several references
  assert.deepEqual(splitLines('10.1038/nature14539, 10.1145/3065386').map((it) => it.doi), ['10.1038/nature14539', '10.1145/3065386']);
  assert.deepEqual(splitLines('1706.03762, 1810.04805').map((it) => it.arxiv), ['1706.03762', '1810.04805']);
  assert.equal(splitLines('Vaswani et al., arXiv preprint arXiv:1706.03762, 2017').length, 1);
});

test('LLM splitting is skipped without an API key', async () => {
  const items = await splitInput('Smith J. A study of things. 2020\nDoe J. Another study. 2021', {});
  assert.deepEqual(items.map((it) => it.query), ['Smith J. A study of things. 2020', 'Doe J. Another study. 2021']);
});

// ─── Keys ───

test('builds AuthorSurnameYear keys', () => {
  const key = (author, y = 2017, extra = {}) => baseKey({ author: author ? [author] : [], issued: y ? year(y) : undefined, ...extra });
  assert.equal(key({ family: 'Vaswani', given: 'Ashish' }), 'Vaswani2017');
  assert.equal(key({ family: 'García-Márquez', given: 'Gabriel' }, 1967), 'GarciaMarquez1967');
  assert.equal(key({ family: 'van der Waals', given: 'Johannes' }, 1873), 'VanderWaals1873');
  assert.equal(key({ family: 'Waals', 'non-dropping-particle': 'van der', given: 'J.' }, 1873), 'VanderWaals1873');
  assert.equal(key({ family: "O'Brien", given: 'Flann' }, 1967), 'OBrien1967');
  assert.equal(key({ family: 'Müßig' }, 2001), 'Mussig2001');
  assert.equal(key({ family: 'Ørsted' }, 1820), 'Orsted1820');
  assert.equal(key({ family: 'Łukasiewicz' }, 1920), 'Lukasiewicz1920');
  assert.equal(key({ family: 'Ærø' }, 2000), 'Aero2000');
  assert.equal(key({ literal: 'OpenAI' }, 2023), 'OpenAI2023');
  assert.equal(key({ name: 'World Health Organization' }, 2020), 'WorldHealth2020');
  assert.equal(key({ literal: 'The ATLAS Collaboration' }, 2012), 'ATLASCollaboration2012');
  assert.equal(key({ family: 'Smith' }, null), 'Smith');
  assert.equal(key(null, 2021, { title: 'A Survey of Transformers' }), 'Survey2021');
  assert.equal(key(null, null, { title: ['The Élan of Things'] }), 'Elan');
  // DataCite puts particles in the given name; arXiv lists groups like people
  assert.equal(key({ family: 'Oord', given: 'Aaron van den' }, 2016), 'VandenOord2016');
  assert.equal(key(parseName('Gemini Team'), 2023), 'GeminiTeam2023');
  assert.deepEqual(parseName('ATLAS Collaboration'), { literal: 'ATLAS Collaboration' });
  assert.match(toBibtex({ type: 'article', title: 'WaveNet', author: [{ family: 'Oord', given: 'Aaron van den' }] }, 'K'), /author = \{van den Oord, Aaron\}/);
});

test('clashing keys get a, b, … suffixes', () => {
  assert.equal(uniqueKey('Smith2020', new Set()), 'Smith2020');
  assert.equal(uniqueKey('Smith2020', new Set(['smith2020'])), 'Smith2020a');
  assert.equal(uniqueKey('Smith2020', new Set(['smith2020', 'smith2020a'])), 'Smith2020b');
  const az = new Set(['x', ...[...'abcdefghijklmnopqrstuvwxyz'].map((c) => `x${c}`)]);
  assert.equal(uniqueKey('X', az), 'Xaa');
});

// ─── Existing .bib parsing and duplicates ───

const EXISTING_BIB = `% my refs
@string{jt = "Journal of Tests"}
@Article{Smith2020,
  author = {Smith, Jane},
  title = {{Deep} Learning for \\&-Things},
  journal = jt,
  year = 2020,
  doi = {10.9999/EXISTING}
}

@misc{Vaswani2017,
  title = "Attention Is {All} You Need",
  author = "Vaswani, Ashish",
  eprint = {1706.03762v5},
  archivePrefix = {arXiv},
  year = {2017}
}
@inproceedings{Lee2019, title={Schr{\\"o}dinger's Widgets}, year={2019}, note={arXiv:1901.00001}}`;

test('parses existing .bib files leniently', () => {
  const entries = parseBibEntries(EXISTING_BIB);
  assert.deepEqual(entries.map((e) => e.key), ['Smith2020', 'Vaswani2017', 'Lee2019']);
  assert.equal(entries[0].fields.year, '2020');
  assert.equal(entries[0].fields.journal, 'jt');
  assert.equal(entries[1].fields.title, 'Attention Is {All} You Need');
  assert.equal(entries[2].fields.title, 'Schr{\\"o}dinger\'s Widgets');
});

test('finds duplicates by DOI, arXiv id or title + year', () => {
  const index = buildBibIndex([{ file: 'references.bib', text: EXISTING_BIB }]);
  assert.equal(findDuplicate(index, { doi: '10.9999/existing' })?.key, 'Smith2020');
  assert.equal(findDuplicate(index, { arxiv: '1706.03762' })?.key, 'Vaswani2017');
  assert.equal(findDuplicate(index, { arxiv: '1901.00001' })?.key, 'Lee2019');
  assert.equal(findDuplicate(index, { title: normaliseTitle('Attention is all you need!'), year: '2017' })?.key, 'Vaswani2017');
  assert.equal(findDuplicate(index, { title: normaliseTitle('Schrödinger’s widgets'), year: '2019' })?.key, 'Lee2019');
  assert.equal(findDuplicate(index, { title: normaliseTitle('Attention is all you need'), year: '2018' }), null);
  assert.equal(findDuplicate(index, { doi: '10.9999/other', arxiv: '', title: '' }), null);

  // a generic title under another DOI is another work unless the first author matches too
  const generic = buildBibIndex([{ file: 'r.bib', text: '@article{LeCun2015, author = {LeCun, Yann and Bengio, Yoshua}, title = {Deep learning}, year = {2015}, doi = {10.1038/nature14539}}' }]);
  const deep = (doi, firstAuthor) => findDuplicate(generic, { doi, title: normaliseTitle('Deep Learning'), year: '2015', firstAuthor });
  assert.equal(deep('10.4249/scholarpedia.32832', 'schmidhuber'), null);
  assert.equal(deep('10.4249/scholarpedia.32832', ''), null);
  assert.equal(deep('10.1101/preprint.1', 'lecun')?.key, 'LeCun2015');
  assert.equal(deep('', 'someone')?.key, 'LeCun2015');
});

// ─── CSL → BibTeX ───

test('formats an article exactly', () => {
  const bib = toBibtex({
    type: 'article-journal',
    title: 'BERT & ImageNet: 50% of GPT-4_x #1',
    author: [{ family: 'Vaswani', given: 'Ashish' }, { family: 'Waals', 'non-dropping-particle': 'van der', given: 'J.', suffix: 'Jr' }, { literal: 'OpenAI' }],
    issued: year(2017),
    'container-title': 'Advances in Neural Information Processing Systems',
    volume: '30',
    issue: '2',
    page: '5998–6008',
    publisher: 'Curran & Associates',
    DOI: '10.5555/3295222.3295349',
    URL: 'https://example.com/ignored-when-doi'
  }, 'Vaswani2017');
  assert.equal(bib, [
    '@article{Vaswani2017,',
    '  author    = {Vaswani, Ashish and van der Waals, Jr, J. and {OpenAI}},',
    '  title     = {{BERT} \\& {ImageNet}: 50\\% of {GPT-4}\\_x \\#1},',
    '  journal   = {Advances in Neural Information Processing Systems},',
    '  year      = {2017},',
    '  volume    = {30},',
    '  number    = {2},',
    '  pages     = {5998--6008},',
    '  publisher = {Curran \\& Associates},',
    '  doi       = {10.5555/3295222.3295349},',
    '}'
  ].join('\n'));
});

const fieldsOf = (bib) => Object.fromEntries([...bib.matchAll(/^ {2}(\w+)\s+= \{(.*)\},$/gm)].map((m) => [m[1], m[2]]));
const typeOf = (bib) => bib.match(/^@(\w+)\{/)[1];

test('maps each CSL type to a BibTeX type', () => {
  const base = { title: 'T', author: [{ family: 'A', given: 'B' }], issued: year(2020), 'container-title': 'C', publisher: 'P', DOI: '10.1/x' };
  const cases = [
    ['journal-article', 'article', 'journal'],
    ['article-journal', 'article', 'journal'],
    ['proceedings-article', 'inproceedings', 'booktitle'],
    ['paper-conference', 'inproceedings', 'booktitle'],
    ['book', 'book', 'publisher'],
    ['chapter', 'incollection', 'booktitle'],
    ['book-chapter', 'incollection', 'booktitle'],
    ['report', 'techreport', 'institution'],
    ['thesis', 'phdthesis', 'school'],
    ['dissertation', 'phdthesis', 'school'],
    ['dataset', 'misc', 'url'],
    ['posted-content', 'misc', 'doi'],
    ['other', 'misc', 'doi']
  ];
  for (const [cslType, bibType, field] of cases) {
    const bib = toBibtex({ ...base, type: cslType, URL: 'https://x.test/1' }, 'K');
    assert.equal(typeOf(bib), bibType, cslType);
    assert.ok(fieldsOf(bib)[field], `${cslType} has ${field}`);
  }
  // Crossref API shape: arrays and an organisation author
  const crossref = toBibtex({ type: 'journal-article', title: ['Crossref &amp; <i>Friends</i>'], 'container-title': ['J. Tests'], author: [{ name: 'ATLAS Collaboration' }], issued: year(2012), DOI: '10.1/y' }, 'K');
  assert.equal(fieldsOf(crossref).title, 'Crossref \\& Friends');
  assert.equal(fieldsOf(crossref).author, '{ATLAS Collaboration}');
  assert.equal(fieldsOf(crossref).journal, 'J. Tests');
  // misc without DOI keeps the URL; a DOI'd article drops it
  assert.equal(fieldsOf(toBibtex({ ...base, type: 'dataset', DOI: undefined, URL: 'https://x.test/d' }, 'K')).url, 'https://x.test/d');
  assert.equal(fieldsOf(toBibtex({ ...base, type: 'journal-article', URL: 'https://x.test/a' }, 'K')).url, undefined);
});

test('arXiv DOIs become article + eprint', () => {
  const bib = toBibtex({
    type: 'article', title: 'Attention Is All You Need', DOI: '10.48550/ARXIV.1706.03762', publisher: 'arXiv',
    categories: ['Computation and Language (cs.CL)', 'Machine Learning (cs.LG)'],
    author: [{ family: 'Vaswani', given: 'Ashish' }], issued: year(2017), URL: 'https://arxiv.org/abs/1706.03762'
  }, 'Vaswani2017');
  assert.equal(bib, [
    '@article{Vaswani2017,',
    '  author        = {Vaswani, Ashish},',
    '  title         = {Attention Is All You Need},',
    '  journal       = {arXiv preprint arXiv:1706.03762},',
    '  year          = {2017},',
    '  doi           = {10.48550/arXiv.1706.03762},',
    '  url           = {https://arxiv.org/abs/1706.03762},',
    '  eprint        = {1706.03762},',
    '  archivePrefix = {arXiv},',
    '  primaryClass  = {cs.CL},',
    '}'
  ].join('\n'));
});

test('escapes and protects titles without touching existing TeX', () => {
  const t = (s) => texEscape(s, { protect: true });
  assert.equal(t('BERT: Pre-training of Deep Bidirectional Transformers'), '{BERT}: Pre-training of Deep Bidirectional Transformers');
  assert.equal(t('GPT-4 Technical Report'), '{GPT-4} Technical Report');
  assert.equal(t('3D U-Net: Learning dense volumetric segmentation'), '{3D} {U-Net}: Learning dense volumetric segmentation');
  assert.equal(t('Faster R-CNN: Towards Real-Time Object Detection'), 'Faster {R-CNN}: Towards Real-Time Object Detection');
  assert.equal(t('Self-Supervised X-ray study of A cells'), 'Self-Supervised {X-ray} study of A cells');
  assert.equal(t('An iPhone study with McDonald and AI'), 'An {iPhone} study with {McDonald} and {AI}');
  assert.equal(t('Q&A over 50% of data_sets #1 for $5'), 'Q\\&A over 50\\% of data\\_sets \\#1 for \\$5');
  assert.equal(t('An $O(n \\log n)$ algorithm for {DNA} and \\& friends'), 'An $O(n \\log n)$ algorithm for {DNA} and \\& friends');
  assert.equal(t('\\textit{In vivo} study of RNA'), '\\textit{In vivo} study of {RNA}');
  assert.equal(t('Schrödinger and Ørsted'), 'Schrödinger and Ørsted');
  assert.equal(t('ATTENTION IS ALL YOU NEED'), 'ATTENTION IS ALL YOU NEED');
  assert.equal(t('Unbalanced } brace { here'), 'Unbalanced \\} brace \\{ here');
  assert.equal(t('ends with \\'), 'ends with \\textbackslash{}');
  assert.equal(texEscape('R&D_Lab'), 'R\\&D\\_Lab');
  // pdfLaTeX only knows characters up to Latin Extended-A
  assert.equal(t('Limiting TGF-β signaling'), 'Limiting {TGF-\\ensuremath{\\beta}} signaling');
  assert.equal(texEscape('Nguyễn Văn Ánh, Łódź, Ω'), 'Nguy{\\~{{\\^{e}}}}n Văn Ánh, Łódź, \\ensuremath{\\Omega}');
  assert.equal(pdfTexSafe('“Quotes” – fine'), '“Quotes” – fine');
});

test('article numbers stand in for pages', () => {
  const bib = toBibtex({ type: 'article-journal', title: 'GW150914', 'container-title': 'Phys. Rev. Lett.', volume: '116', issue: '6', 'article-number': '061102', DOI: '10.1103/PhysRevLett.116.061102' }, 'K');
  assert.equal(fieldsOf(bib).pages, '061102');
});

test('arXiv links survive a published DOI and missing provider URLs', () => {
  const bib = toBibtex({ type: 'article-journal', title: 'Published paper', DOI: '10.1234/published', _arxiv: { id: '2101.00001' } }, 'K');
  assert.equal(fieldsOf(bib).url, 'https://arxiv.org/abs/2101.00001');
  assert.equal(fieldsOf(bib).doi, '10.1234/published');
});

test('imported titles use TeX quotes without changing apostrophes or existing TeX', () => {
  const title = (text, type = 'webpage') => fieldsOf(toBibtex({ type, title: text }, 'K')).title;
  assert.equal(title("Forget prompts: 'Loop engineering' is all the rage now"), "Forget prompts: `Loop engineering' is all the rage now");
  assert.equal(title('“Loop engineering” and ‘AI’'), "``Loop engineering'' and `{AI}'");
  assert.equal(title('About "Loop engineering"'), "About ``Loop engineering''");
  assert.equal(title("'It's O'Brien's idea' and authors' rights"), "`It's O'Brien's idea' and authors' rights");
  assert.equal(title("Already `quoted' and ``double quoted''"), "Already `quoted' and ``double quoted''");
  assert.equal(title("A 'quoted' $O(n)$ algorithm", 'article'), "A `quoted' $O(n)$ algorithm");
});

test('publication dates retain available precision and reject impossible dates', () => {
  assert.deepEqual(issuedFromDate('2026-06-20T09:01:01.239Z'), { 'date-parts': [[2026, 6, 20]] });
  assert.deepEqual(issuedFromDate('2026/06'), { 'date-parts': [[2026, 6]] });
  assert.equal(issuedFromDate('2026-02-30'), undefined);
  assert.equal(issuedFromDate('2026-13-20'), undefined);
  assert.equal(issuedFromDate('Copyright 2026'), undefined);
});

// ─── HTML pages ───

test('parses <meta> tags in any attribute order and quoting', () => {
  const meta = parseHtmlMeta(`
    <meta name="citation_title" content="Widgets &amp; Gadgets">
    <meta content='M&uuml;ller, Hans' name='citation_author'>
    <META property="og:title" CONTENT="An &quot;OG&quot; title &#8211; &#x2014;">
    <meta name=citation_year content=2019>
    <meta content="x > y" name="description" />
    <meta name="citation_author" content="Johannes Diderik van der Waals">`);
  assert.deepEqual(meta.citation_title, ['Widgets & Gadgets']);
  assert.deepEqual(meta.citation_author, ['Müller, Hans', 'Johannes Diderik van der Waals']);
  assert.deepEqual(meta['og:title'], ['An "OG" title – —']);
  assert.deepEqual(meta.citation_year, ['2019']);
  assert.deepEqual(meta.description, ['x > y']);
});

test('reads citations from pages in the documented order', () => {
  assert.equal(readHtmlCitation('<meta name="citation_doi" content="doi:10.1234/abc.">', 'https://x.test').doi, '10.1234/abc');
  assert.equal(readHtmlCitation('<meta name="DC.Identifier" content="https://doi.org/10.1234/dc">', 'https://x.test').doi, '10.1234/dc');
  assert.equal(readHtmlCitation('<meta name="prism.doi" content="10.1234/prism">', 'https://x.test').doi, '10.1234/prism');
  assert.equal(readHtmlCitation('<meta name="dc.identifier" content="ISBN 123"><meta name="bepress_citation_doi" content="10.1234/bp">', 'https://x.test').doi, '10.1234/bp');
  assert.equal(readHtmlCitation('<meta name="citation_title" content="T"><meta name="citation_arxiv_id" content="2101.00002v2">', 'https://x.test').arxiv, '2101.00002');

  const { record } = readHtmlCitation(`
    <meta name="citation_title" content="Fast Widgets">
    <meta name="citation_author" content="Doe, Jane"><meta name="citation_author" content="John Roe">
    <meta name="citation_publication_date" content="2019/05/01">
    <meta name="citation_conference_title" content="WidgetConf 2019">
    <meta name="citation_firstpage" content="12"><meta name="citation_lastpage" content="34">
    <a href="https://doi.org/10.1234/cited-elsewhere">ref</a>`, 'https://x.test/p');
  const bib = toBibtex(record, baseKey(record));
  assert.equal(typeOf(bib), 'inproceedings');
  assert.match(bib, /@inproceedings\{Doe2019,/);
  assert.deepEqual(
    { author: fieldsOf(bib).author, booktitle: fieldsOf(bib).booktitle, pages: fieldsOf(bib).pages, url: fieldsOf(bib).url },
    { author: 'Doe, Jane and Roe, John', booktitle: 'WidgetConf 2019', pages: '12--34', url: 'https://x.test/p' }
  );

  // a DOI in the page body is checked against the page title later, so it needs one
  const body = readHtmlCitation('<title>In Body</title><p>Cite as <a href="https://doi.org/10.1234/in-body">x</a></p>', 'https://x.test');
  assert.deepEqual([body.doi, body.pageTitle, body.record.type], ['10.1234/in-body', 'In Body', 'webpage']);
  assert.equal(readHtmlCitation('<p>Cite as <a href="https://doi.org/10.1234/in-body">x</a></p>', 'https://x.test'), null);
  assert.equal(titleFitsPage('Widget Safety Report', 'Widget Safety Report | CSIRO'), true);
  assert.equal(titleFitsPage(['Learning representations by back-propagating errors'], 'Geoffrey Hinton - Wikipedia'), false);

  const page = readHtmlCitation('<title>Ignored</title><meta property="og:title" content="A Blog Post"><meta property="article:published_time" content="2024-03-02T10:00:00Z">', 'https://blog.test/post', new Date('2026-10-11T03:00:00Z'));
  const misc = toBibtex(page.record, baseKey(page.record));
  assert.equal(misc, [
    '@misc{Blog2024,',
    '  title = {A Blog Post},',
    '  year  = {2024},',
    '  date  = {2024-03-02},',
    '  url   = {https://blog.test/post},',
    '}'
  ].join('\n'));
  assert.equal(readHtmlCitation('<title>Only &amp; title</title>', 'https://x.test').record.title, 'Only & title');
  assert.equal(readHtmlCitation('<p>nothing</p>', 'https://x.test'), null);
});

test('alphaXiv citation exports supply authors omitted from scholarly metadata', () => {
  const url = 'https://www.alphaxiv.org/abs/2609.navier-stokes';
  const html = `<meta name="citation_title" content="Finite Time Blowup for Navier–Stokes">
    <meta name="citation_publication_date" content="2026/9/8">
    <script type="application/ld+json">${JSON.stringify({ '@type': 'ScholarlyArticle', headline: 'Finite Time Blowup for Navier–Stokes', url, author: [], publisher: { name: 'arXiv' } })}</script>
    <button aria-label="Copy BibTeX"><span><span>@misc</span>{openai-finite-time-blowup,
      <span>author</span> = {<span>OpenAI</span>},
      <span>title</span> = {Finite Time Blowup for Navier–Stokes},
      <span>publisher</span> = {OpenAI}
    }</span></button>`;
  const { record } = readHtmlCitation(html, url);
  assert.deepEqual(record.author, [{ family: 'OpenAI' }]);
  assert.deepEqual(record.issued['date-parts'][0], [2026, 9, 8]);
  assert.equal(record.publisher, 'OpenAI');
  assert.equal(baseKey(record), 'OpenAI2026');
  const fields = fieldsOf(toBibtex(record, baseKey(record)));
  assert.equal(fields.author, 'OpenAI');
  assert.equal(fields.url, url);
  assert.equal(fields.eprint, undefined, 'alphaXiv identifiers are not necessarily arXiv IDs');
});

test('citation exports match the page title, preserve grouped names, and supplement metadata only', () => {
  const url = 'https://example.com/paper';
  const metadata = '<meta name="citation_title" content="A Paper">';
  const citation = (title, author) => `<pre>@misc{k, title = {${title}}, author = {${author}}, year = {2026}}</pre>`;
  assert.deepEqual(readHtmlCitation(metadata + citation('Another Paper', 'Wrong Author'), url).record.author, []);
  assert.deepEqual(readHtmlCitation(metadata + `<script>${citation('A Paper', 'Script Author')}</script>`, url).record.author, []);
  const author = 'Doe, Jane and {Research and {Development}} and Roe, John';
  const { record } = readHtmlCitation(metadata + citation('A Paper', author), url);
  assert.deepEqual(record.author, [{ family: 'Doe', given: 'Jane' }, { literal: 'Research and Development' }, { family: 'Roe', given: 'John' }]);
  assert.equal(fieldsOf(toBibtex(record, 'K')).author, 'Doe, Jane and {Research and Development} and Roe, John');
  assert.deepEqual(readHtmlCitation(metadata + '<meta name="citation_author" content="Right Author">' + citation('A Paper', 'Wrong Author'), url).record.author, [{ family: 'Author', given: 'Right' }]);
  const structured = `<script type="application/ld+json">${JSON.stringify({ '@type': 'ScholarlyArticle', url, name: 'A Paper', author: { '@type': 'Organization', name: 'Right Organization' } })}</script>`;
  assert.deepEqual(readHtmlCitation(metadata + structured + citation('A Paper', 'Wrong Author'), url).record.author, [{ literal: 'Right Organization' }]);
});

test('JSON-LD supplies the article author, full publication date and publisher', () => {
  const url = 'https://www.businessinsider.com/what-are-loops-ai-engineering-tips-2026-6';
  const html = `<title>Short search title</title><script type="application/ld+json">${JSON.stringify({ '@graph': [
    { '@type': 'WebPage', '@id': url, name: 'Short title' },
    { '@type': 'NewsArticle', '@id': url + '#article', headline: "Forget prompts: 'Loop engineering' is all the rage now", datePublished: '2026-06-20T09:01:01.239Z', dateModified: '2026-10-20', author: { '@id': '#author' }, publisher: { '@type': 'Organization', name: 'Business Insider' } },
    { '@type': 'Person', '@id': '#author', name: 'Brent D. Griffiths' }
  ] })}</script>`;
  const { record } = readHtmlCitation(html, url);
  assert.equal(baseKey(record), 'Griffiths2026');
  assert.deepEqual(record.author, [{ given: 'Brent D.', family: 'Griffiths' }]);
  const fields = fieldsOf(toBibtex(record, baseKey(record)));
  assert.equal(fields.date, '2026-06-20');
  assert.equal(fields.organization, 'Business Insider');
  assert.equal(fields.url, url);
  assert.match(fields.title, /`Loop engineering'/);
  const organization = readHtmlCitation('<script type="application/ld+json">{"@type":"Article","headline":"A result","author":{"@type":"Organization","name":"OpenAI"},"publisher":{"name":"OpenAI"},"datePublished":"2026-09-08"}</script>', 'https://openai.com/article').record;
  assert.equal(fieldsOf(toBibtex(organization, 'K')).author, '{OpenAI}');
  assert.equal(fieldsOf(toBibtex(organization, 'K')).organization, undefined, 'APA 7 omits a repeated site name');
  assert.equal(readHtmlCitation('<script type="application/ld+json">broken</script><title>Fallback</title><time datetime="2026-06-20"></time>', url).record.issued['date-parts'][0][2], 20);
  assert.equal(readHtmlCitation('<title>No date</title><script type="application/ld+json">{"@type":"Article","url":"https://other.test/story","headline":"Other story","datePublished":"2000-01-01"}</script>', url).record.issued, undefined);
});

test('parses arXiv Atom entries', () => {
  const parsed = arxivRecordFromAtom(atom('2101.00002', { title: 'Preprint  Widgets\n  Again' }), '2101.00002');
  assert.equal(parsed.doi, '');
  assert.equal(parsed.record.title, 'Preprint Widgets Again');
  assert.deepEqual(parsed.record.author, [{ given: 'Ada', family: 'Lovelace' }, { given: 'Charles', family: 'Babbage' }]);
  assert.equal(parsed.record._arxiv.primaryClass, 'cs.LG');
  assert.equal(arxivRecordFromAtom('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', 'x'), null);
});

test('auto-picks a query only on an exact, corroborated title match', () => {
  const hit = { DOI: '10.1/a', title: ['Neural Widgets for Everyone!'], author: [{ family: 'Doe', given: 'Jane' }], issued: year(2023) };
  const items = [hit, { DOI: '10.1/b', title: ['Other'] }];
  assert.equal(pickCandidate('Doe 2023 neural widgets for éveryone', items)?.DOI, '10.1/a');
  assert.equal(pickCandidate('Neural widgets for everyone, Doe et al.', items)?.DOI, '10.1/a');
  // a bare title could be another work with the same title; a wrong year rules it out
  assert.equal(pickCandidate('neural widgets for everyone', items), null);
  assert.equal(pickCandidate('Neural widgets for everyone 2019', items), null);
  // word order matters: "Is Attention All You Need?" is not "Attention is all you need"
  const mineault = { DOI: '10.1/m', title: ['Is Attention All You Need?'], author: [{ family: 'Mineault' }], issued: year(2025) };
  assert.equal(pickCandidate('Attention is all you need 2025', [mineault]), null);
  // two hits with the title: the user chooses
  assert.equal(pickCandidate('Doe 2023 neural widgets for everyone', [hit, { ...hit, DOI: '10.1/c' }]), null);
  assert.equal(pickCandidate('widgets for everyone', items), null);
  assert.equal(pickCandidate('anything', []), null);
});

test('detects whether the .bib is loaded by a .tex file', () => {
  assert.equal(texIncludesBib(['\\bibliography{refs, references}'], 'references.bib'), true);
  assert.equal(texIncludesBib(['\\addbibresource[location=local]{bib/references.bib}'], 'references.bib'), true);
  assert.equal(texIncludesBib(['% \\bibliography{references}'], 'references.bib'), false);
  assert.equal(texIncludesBib(['\\bibliographystyle{references}'], 'references.bib'), false);
  assert.equal(texIncludesBib(['\\bibliography{other}'], 'refs/references.bib'), false);
});

test('picks the target .bib', () => {
  assert.equal(pickBibTarget('/p', ['a.bib', 'references.bib'], ''), 'references.bib');
  assert.equal(pickBibTarget('/p', ['sub/z.bib', 'b.bib', 'a.tex'], ''), 'b.bib');
  assert.equal(pickBibTarget('/p', ['main.tex'], ''), 'references.bib');
  assert.equal(pickBibTarget('/p', [], 'refs/new.bib'), 'refs/new.bib');
  // the one the document loads, ahead of references.bib and a shallower one
  assert.equal(pickBibTarget('/p', ['references.bib', 'a.bib', 'chapters/thesis.bib'], '', ['\\bibliography{chapters/thesis}']), 'chapters/thesis.bib');
  assert.equal(pickBibTarget('/p', ['a.bib', 'references.bib'], '', ['% \\bibliography{a}']), 'references.bib');
  for (const bad of ['../x.bib', '/etc/x.bib', 'x.tex', '.spectrum/x.bib', '.Spectrum/x.bib']) {
    assert.throws(() => pickBibTarget('/p', [], bad), (err) => err.statusCode === 400, bad);
  }
});

// ─── Integration against a local mock ───

function atom(id, { doi = '', title = 'Preprint Widgets' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/${id}v1</id>
    <title>${title}</title>
    <published>2021-01-01T00:00:00Z</published>
    <author><name>Ada Lovelace</name></author>
    <author><name>Charles Babbage</name></author>
    ${doi ? `<arxiv:doi>${doi}</arxiv:doi>` : ''}
    <arxiv:primary_category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;
}

const CSL = {
  '10.1234/busy': { type: 'article-journal', title: 'Busy Widgets', author: [{ family: 'Busy', given: 'B.' }], issued: year(2024), DOI: '10.1234/busy' },
  '10.1234/journal.1': { type: 'article-journal', title: 'Notes on the Analytical Engine', author: [{ family: 'Lovelace', given: 'Ada' }], issued: year(1843), 'container-title': 'Scientific Memoirs', volume: '3', page: '666-731', DOI: '10.1234/journal.1' },
  '10.1234/smith.2': { type: 'article-journal', title: 'A Different Study', author: [{ family: 'Smith', given: 'Jane' }], issued: year(2020), 'container-title': 'J. Tests', DOI: '10.1234/smith.2' },
  '10.1234/smith.3': { type: 'article-journal', title: 'Yet Another Study', author: [{ family: 'Smith', given: 'Jane' }], issued: year(2020), 'container-title': 'J. Tests', DOI: '10.1234/smith.3' },
  '10.1234/journal.2': { type: 'paper-conference', title: 'Published Widgets', author: [{ family: 'Lovelace', given: 'Ada' }], issued: year(2021), 'container-title': 'Proceedings of WidgetConf', DOI: '10.1234/journal.2' },
  '10.1234/journal.3': { type: 'chapter', title: 'A Chapter on Things', author: [{ family: 'Müller', given: 'Hans' }], issued: year(2015), 'container-title': 'The Book of Things', publisher: 'Springer', DOI: '10.1234/journal.3' },
  '10.1234/journal.4': { type: 'report', title: 'Widget Safety Report', author: [{ literal: 'CSIRO' }], issued: year(2022), publisher: 'CSIRO', number: 'TR-7', DOI: '10.1234/journal.4' },
  '10.1234/journal.5': { type: 'article-journal', title: 'Neural Widgets for Everyone', author: [{ family: 'Doe', given: 'Jane' }], issued: year(2023), 'container-title': 'Widget Letters', DOI: '10.1234/journal.5' },
  '10.1234/journal.6': { type: 'thesis', title: 'On Widgets', author: [{ family: 'Roe', given: 'John' }], issued: year(2019), publisher: 'University of Sydney', DOI: '10.1234/journal.6' }
};
const CROSSREF_ONLY = { type: 'journal-article', title: ['Crossref &amp; Friends'], author: [{ given: 'Kim', family: 'Lee' }], 'container-title': ['J. Tests'], issued: year(2018), DOI: '10.5555/crossref-only' };
const FIGURE = { type: 'component', title: 'Figure 2: Neural Widgets for Everyone', DOI: '10.1234/fig.2' };
const OPINION = { type: 'dataset', title: 'Faculty Opinions recommendation of Neural Widgets for Everyone', DOI: '10.1234/fo.1' };
const SEARCH = {
  'Neural Widgets for Everyone': [FIGURE, CSL['10.1234/journal.6'], CSL['10.1234/journal.5']],
  'Doe 2023 Neural Widgets for Everyone': [OPINION, CSL['10.1234/journal.6'], CSL['10.1234/journal.5']],
  'widgets maybe': [CSL['10.1234/journal.5'], CSL['10.1234/journal.6']]
};
let busy = 0;
const PAGES = {
  '/page/meta-doi': '<html><head><meta name="citation_doi" content="10.1234/journal.3"><title>x</title></head></html>',
  '/page/meta-full': '<meta name="citation_title" content="Fast Widgets"><meta name="citation_author" content="Doe, Jane"><meta name="citation_date" content="2019"><meta name="citation_conference_title" content="WidgetConf">',
  '/page/body-doi': '<html><head><title>Widget Safety Report – CSIRO</title></head><body>Cite: <a href="https://doi.org/10.1234/journal.4">doi</a></body></html>',
  '/page/cites-others': '<html><head><title>Widgets - Wikipedia</title></head><body>See <a href="https://doi.org/10.1234/journal.1">ref</a></body></html>',
  '/page/plain': '<html><head><title>A Plain Page</title></head></html>',
  '/page/meta-no-author': '<meta name="citation_title" content="A Paper Without Author Metadata"><meta name="citation_year" content="2026">',
  '/challenge': '<html><head><title>Verifying your browser | Widgets</title></head></html>'
};

let mock;
let base;
const hits = [];

before(async () => {
  mock = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    hits.push(url.pathname);
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (url.pathname === '/exa/contents') {
      assert.equal(req.headers['x-api-key'], 'test-exa-key');
      let text = '';
      for await (const chunk of req) text += chunk;
      const { urls } = JSON.parse(text);
      const target = new URL(urls[0]);
      return send(200, { results: target.pathname === '/page/exa-empty' ? [] : [{
        url: target.pathname === '/page/exa-wrong' ? 'https://other.test/unrelated' : urls[0],
        title: 'On the Widget Millennium Problem', author: 'OpenAI', publishedDate: '2026-09-08'
      }] });
    }
    assert.equal(req.headers['x-api-key'], undefined, 'Exa credentials must never reach a pasted page');
    if (['/page/blocked', '/page/exa-empty', '/page/exa-wrong'].includes(url.pathname)) return send(403, '<title>Access denied</title>', 'text/html');
    if (url.pathname === '/page/bot-check') return send(203, '<title>pubmed.example</title>', 'text/html');
    if (url.pathname === '/page/to-challenge') {
      res.writeHead(302, { location: '/challenge' });
      return res.end();
    }
    if (url.pathname === '/page/to-local') {
      res.writeHead(302, { location: 'http://127.0.0.1:9/internal' });
      return res.end();
    }
    if (url.pathname.startsWith('/doi/')) {
      const doi = decodeURIComponent(url.pathname.slice(5)).toLowerCase();
      // Crossref's rate limit: the first try is refused
      if (doi === '10.1234/busy' && busy++ === 0) {
        res.writeHead(429, { 'retry-after': '0' });
        return res.end();
      }
      if (!/citationstyles\.csl\+json/.test(req.headers.accept || '')) return send(406, { error: 'bad accept' });
      if (doi === '10.5555/crossref-only') return send(406, '<html>Not acceptable</html>', 'text/html');
      return CSL[doi] ? send(200, CSL[doi], 'application/vnd.citationstyles.csl+json') : send(404, 'DOI not found', 'text/plain');
    }
    if (url.pathname === '/crossref/works') {
      const items = SEARCH[url.searchParams.get('query.bibliographic')] || [];
      if (url.searchParams.get('rows') !== '20') return send(400, { error: 'rows' });
      return send(200, { status: 'ok', message: { items: items.map((it) => ({ ...it, title: [it.title], 'container-title': [it['container-title']] })) } });
    }
    if (url.pathname.startsWith('/crossref/works/')) {
      const doi = decodeURIComponent(url.pathname.slice('/crossref/works/'.length));
      return doi === '10.5555/crossref-only' ? send(200, { status: 'ok', message: CROSSREF_ONLY }) : send(404, 'Resource not found.', 'text/plain');
    }
    if (url.pathname === '/arxiv/api/query') {
      const id = url.searchParams.get('id_list');
      if (id === '2101.00001') return send(200, atom(id, { doi: '10.1234/journal.2' }), 'application/atom+xml');
      if (id === '2101.00002') return send(200, atom(id), 'application/atom+xml');
      return send(200, '<feed xmlns="http://www.w3.org/2005/Atom"></feed>', 'application/atom+xml');
    }
    if (url.pathname === '/llm/v1/chat/completions') {
      const content = JSON.stringify({ items: [{ arxiv: '2101.00002' }, { doi: '10.1234/journal.1' }, { query: 'Doe 2023 Neural Widgets for Everyone' }] });
      return send(200, { choices: [{ message: { role: 'assistant', content } }] });
    }
    if (PAGES[url.pathname]) return send(200, PAGES[url.pathname], 'text/html; charset=utf-8');
    return send(404, 'nope', 'text/plain');
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${mock.address().port}`;
  process.env.SPECTRUM_DOI_BASE = `${base}/doi`;
  process.env.SPECTRUM_CROSSREF_BASE = `${base}/crossref`;
  process.env.SPECTRUM_ARXIV_BASE = `${base}/arxiv`;
  process.env.SPECTRUM_EXA_BASE = `${base}/exa`;
});

after(() => mock?.close());

function tempProject(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'spectrum-refs-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), content);
  }
  return root;
}

test('configured Exa resolves blocked pages without inventing records or leaking keys', async () => {
  const root = tempProject({ 'main.tex': '' });
  const searchConfig = { provider: 'exa', apiKey: 'test-exa-key' };
  try {
    const run = (url, config = searchConfig) => resolveReferences({ projectRoot: root, input: url, searchConfig: config });
    const first = (await run(`${base}/page/blocked`)).results[0];
    assert.equal(first.status, 'added');
    assert.equal(first.key, 'OpenAI2026');
    assert.equal(fieldsOf(first.bibtex).date, '2026-09-08');
    assert.equal(fieldsOf(first.bibtex).url, `${base}/page/blocked`);
    assert.equal((await run(`${base}/page/exa-empty`)).results[0].status, 'error');
    assert.equal((await run(`${base}/page/exa-wrong`)).results[0].status, 'error');
    const before = hits.filter((h) => h === '/exa/contents').length;
    assert.equal((await run('http://127.0.0.1:9/private')).results[0].status, 'error');
    assert.equal((await run(`${base}/page/to-local`)).results[0].status, 'error');
    assert.equal((await run(`${base}/page/blocked`, { provider: 'brave', apiKey: 'test-exa-key' })).results[0].status, 'error');
    assert.equal((await run('https://name:password@example.com/')).results[0].status, 'error');
    assert.equal(hits.filter((h) => h === '/exa/contents').length, before);
    assert.doesNotMatch(readFileSync(path.join(root, 'references.bib'), 'utf8'), /test-exa-key/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('incomplete scholarly citation metadata can recover an author through configured search', async (t) => {
  const root = tempProject({ 'main.tex': '' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const before = hits.filter((hit) => hit === '/exa/contents').length;
  const out = await resolveReferences({ projectRoot: root, input: `${base}/page/meta-no-author`, searchConfig: { provider: 'exa', apiKey: 'test-exa-key' } });
  assert.equal(out.results[0].status, 'added');
  assert.equal(out.results[0].key, 'OpenAI2026');
  const fields = fieldsOf(out.results[0].bibtex);
  assert.equal(fields.author, 'OpenAI');
  assert.equal(fields.title, 'A Paper Without Author Metadata');
  assert.equal(fields.url, `${base}/page/meta-no-author`);
  assert.equal(hits.filter((hit) => hit === '/exa/contents').length, before + 1);
});

test('generated webpage URLs appear once, including with classic BibTeX styles', async (t) => {
  for (const style of ['apa', 'plainnat', 'plainurl', 'plain']) {
    const bibliography = style === 'apa'
      ? '\\usepackage[style=apa]{biblatex}\n\\addbibresource{references.bib}'
      : `\\bibliographystyle{${style}}\n\\bibliography{references}`;
    const root = tempProject({ 'main.tex': bibliography });
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const out = await resolveReferences({ projectRoot: root, input: `${base}/page/plain` });
    assert.equal(out.results[0].status, 'added', style);
    assert.equal(out.bibIncluded, true, style);
    const fields = fieldsOf(out.results[0].bibtex);
    assert.equal(fields.url, style === 'plain' ? undefined : `${base}/page/plain`, style);
    assert.equal(fields.howpublished, style === 'plain' ? `\\url{${base}/page/plain}` : undefined, style);
  }
});

test('resolves, deduplicates and writes references into a project', async (t) => {
  // No trailing newline on purpose: the original bytes must survive untouched.
  const original = '% keep me exactly\n@article{Smith2020,\n  title = {Old},\n  year = {2020},\n  doi = {10.9999/EXISTING}\n}';
  const root = tempProject({ 'main.tex': '\\documentclass{article}\n\\begin{document}\n\\bibliography{references}\n\\end{document}\n', 'references.bib': original });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bibPath = path.join(root, 'references.bib');
  const resolve = (input, extra = {}) => resolveReferences({ projectRoot: root, input, ...extra });
  const only = async (input) => {
    const out = await resolve(input);
    assert.equal(out.results.length, 1);
    return out.results[0];
  };

  await t.test('DOI → added, appended after one blank line', async () => {
    const out = await resolve('https://doi.org/10.1234/journal.1');
    assert.equal(out.bibFile, 'references.bib');
    assert.equal(out.bibIncluded, true);
    const [r] = out.results;
    assert.equal(r.status, 'added');
    assert.equal(r.key, 'Lovelace1843');
    assert.equal(r.title, 'Notes on the Analytical Engine');
    assert.deepEqual(r.authors, ['Ada Lovelace']);
    assert.equal(r.year, '1843');
    assert.equal(r.doi, '10.1234/journal.1');
    assert.match(r.bibtex, /^@article\{Lovelace1843,\n {2}author {2}= \{Lovelace, Ada\},/);
    const text = readFileSync(bibPath, 'utf8');
    assert.ok(text.startsWith(original));
    assert.equal(text, `${original}\n\n${r.bibtex}\n`);
  });

  await t.test('same DOI again (any case) → duplicate without a network call', async () => {
    const before = hits.length;
    const r = await only('doi:10.1234/JOURNAL.1');
    assert.equal(r.status, 'duplicate');
    assert.equal(r.key, 'Lovelace1843');
    assert.equal(r.bibFile, 'references.bib');
    assert.equal(hits.length, before);
    const existing = await only('10.9999/existing');
    assert.equal(existing.status, 'duplicate');
    assert.equal(existing.key, 'Smith2020');
  });

  await t.test('clashing keys get suffixes', async () => {
    const out = await resolve('10.1234/smith.2\n10.1234/smith.3');
    assert.deepEqual(out.results.map((r) => [r.status, r.key]), [['added', 'Smith2020a'], ['added', 'Smith2020b']]);
  });

  await t.test('arXiv with a DOI → published version', async () => {
    const r = await only('https://arxiv.org/abs/2101.00001v2');
    assert.equal(r.status, 'added');
    assert.equal(r.key, 'Lovelace2021');
    assert.match(r.bibtex, /^@inproceedings\{Lovelace2021,/);
    assert.match(r.bibtex, /booktitle +=  ?\{Proceedings of WidgetConf\}/);
    // the published entry keeps its arXiv id, so the arXiv DOI is a duplicate later
    assert.equal(fieldsOf(r.bibtex).eprint, '2101.00001');
    const again = await only('10.48550/arXiv.2101.00001');
    assert.deepEqual([again.status, again.key], ['duplicate', 'Lovelace2021']);
  });

  await t.test('arXiv without a DOI → preprint record', async () => {
    const r = await only('arXiv:2101.00002');
    assert.equal(r.status, 'added');
    assert.equal(r.key, 'Lovelace2021a');
    assert.deepEqual(fieldsOf(r.bibtex), {
      author: 'Lovelace, Ada and Babbage, Charles',
      title: 'Preprint Widgets',
      journal: 'arXiv preprint arXiv:2101.00002',
      year: '2021',
      url: 'https://arxiv.org/abs/2101.00002',
      eprint: '2101.00002',
      archivePrefix: 'arXiv',
      primaryClass: 'cs.LG'
    });
    const again = await only('2101.00002v3');
    assert.equal(again.status, 'duplicate');
    assert.equal(again.key, 'Lovelace2021a');
  });

  await t.test('link with a DOI meta tag → DOI path', async () => {
    const r = await only(`${base}/page/meta-doi`);
    assert.equal(r.status, 'added');
    assert.equal(r.key, 'Muller2015');
    assert.match(r.bibtex, /^@incollection\{Muller2015,/);
    assert.match(r.bibtex, /author {4}= \{Müller, Hans\}/);
  });

  await t.test('link with citation meta → built directly', async () => {
    const r = await only(`${base}/page/meta-full`);
    assert.equal(r.status, 'added');
    assert.equal(r.key, 'Doe2019');
    assert.match(r.bibtex, /^@inproceedings\{Doe2019,/);
    assert.match(r.bibtex, new RegExp(`url {7}= \\{${base}/page/meta-full\\}`));
  });

  await t.test('link with a DOI in the page body, and a plain page', async () => {
    const r = await only(`${base}/page/body-doi`);
    assert.equal(r.status, 'added');
    assert.equal(r.key, 'CSIRO2022');
    assert.deepEqual([typeOf(r.bibtex), fieldsOf(r.bibtex).institution, fieldsOf(r.bibtex).number], ['techreport', 'CSIRO', 'TR-7']);
    // a page that only cites a paper is a web page, not that paper
    const cites = await only(`${base}/page/cites-others`);
    assert.deepEqual([cites.status, typeOf(cites.bibtex), fieldsOf(cites.bibtex).title], ['added', 'misc', 'Widgets - Wikipedia']);
    const plain = await only(`${base}/page/plain`);
    assert.equal(plain.status, 'added');
    assert.equal(plain.key, 'Plain');
    assert.equal(fieldsOf(plain.bibtex).url, `${base}/page/plain`);
    assert.equal(fieldsOf(plain.bibtex).howpublished, undefined);
    assert.equal(fieldsOf(plain.bibtex).note, undefined, 'static web pages do not need retrieval dates in APA 7');
  });

  await t.test('bot checks, challenge pages and local addresses are refused', async () => {
    for (const page of ['bot-check', 'to-challenge']) {
      const r = await only(`${base}/page/${page}`);
      assert.equal(r.status, 'error', page);
      assert.match(r.message, /didn’t return the page/);
    }
    for (const link of [`${base}/page/to-local`, 'http://localhost:1/admin', 'http://192.168.1.1/']) {
      const r = await only(link);
      assert.equal(r.status, 'error', link);
      assert.match(r.message, /this computer or the local network/);
    }
  });

  await t.test('Crossref asks to slow down → wait and retry', async () => {
    const r = await only('10.1234/busy');
    assert.deepEqual([r.status, r.key, busy], ['added', 'Busy2024', 2]);
  });

  await t.test('title query → auto-pick on an exact, corroborated match', async () => {
    const r = await only('Doe 2023 Neural Widgets for Everyone');
    assert.equal(r.status, 'added');
    assert.equal(r.key, 'Doe2023');
    // a bare title is a choice, exact match first, figures and recommendations left out
    const bare = await only('Neural Widgets for Everyone');
    assert.equal(bare.status, 'choose');
    assert.deepEqual(bare.candidates.map((c) => c.id), ['10.1234/journal.5', '10.1234/journal.6']);
  });

  await t.test('title query → choose, then add the chosen candidate', async () => {
    const r = await only('widgets maybe');
    assert.equal(r.status, 'choose');
    assert.deepEqual(r.candidates.map((c) => c.id), ['10.1234/journal.5', '10.1234/journal.6']);
    assert.deepEqual(r.candidates[1], { id: '10.1234/journal.6', title: 'On Widgets', authors: ['John Roe'], year: '2019', venue: undefined, doi: '10.1234/journal.6' });
    const added = await addReference({ projectRoot: root, candidateId: r.candidates[1].id });
    assert.equal(added.bibFile, 'references.bib');
    assert.equal(added.bibIncluded, true);
    assert.equal(added.result.status, 'added');
    assert.equal(added.result.key, 'Roe2019');
    assert.match(added.result.bibtex, /school = \{University of Sydney\}/);
    assert.equal((await addReference({ projectRoot: root, candidateId: '10.1234/journal.6' })).result.status, 'duplicate');
    await assert.rejects(addReference({ projectRoot: root, candidateId: 'just words' }), (err) => err.statusCode === 400);
  });

  await t.test('Crossref fallback, not found and unknown arXiv ids', async () => {
    const fallback = await only('10.5555/crossref-only');
    assert.equal(fallback.status, 'added');
    assert.equal(fallback.key, 'Lee2018');
    assert.match(fallback.bibtex, /title {3}= \{Crossref \\& Friends\}/);
    assert.equal((await only('10.1234/missing')).status, 'not_found');
    assert.equal((await only('2101.09999')).status, 'not_found');
    assert.equal((await only('nothing matches this')).status, 'not_found');
  });

  await t.test('every write appended; nothing before it changed', () => {
    const text = readFileSync(bibPath, 'utf8');
    assert.ok(text.startsWith(`${original}\n\n@article{Lovelace1843,`));
    const keys = parseBibEntries(text).map((e) => e.key);
    assert.deepEqual(keys, ['Smith2020', 'Lovelace1843', 'Smith2020a', 'Smith2020b', 'Lovelace2021', 'Lovelace2021a', 'Muller2015', 'Doe2019', 'CSIRO2022', 'Widgets', 'Plain', 'Busy2024', 'Doe2023', 'Roe2019', 'Lee2018']);
    assert.doesNotMatch(text, /\n\n\n/);
  });
});

test('creates the target .bib, reports bibIncluded and honours bibFile', async (t) => {
  const root = tempProject({ 'main.tex': '\\addbibresource{other.bib}\n' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = await resolveReferences({ projectRoot: root, input: '10.1234/journal.5' });
  assert.equal(first.bibFile, 'references.bib');
  assert.equal(first.bibIncluded, false);
  assert.equal(readFileSync(path.join(root, 'references.bib'), 'utf8'), `${first.results[0].bibtex}\n`);

  const sub = await resolveReferences({ projectRoot: root, input: '10.1234/journal.6', bibFile: 'refs/other.bib' });
  assert.equal(sub.bibFile, 'refs/other.bib');
  assert.equal(sub.bibIncluded, true);
  assert.ok(existsSync(path.join(root, 'refs/other.bib')));
  // duplicates are checked across every .bib in the project
  const dup = await resolveReferences({ projectRoot: root, input: '10.1234/journal.6' });
  assert.deepEqual([dup.results[0].status, dup.results[0].bibFile], ['duplicate', 'refs/other.bib']);
  await assert.rejects(resolveReferences({ projectRoot: root, input: '10.1234/journal.1', bibFile: '../escape.bib' }), (err) => err.statusCode === 400);
});

test('with no .bib chosen, the target is one the main document loads, not another document’s', async (t) => {
  const files = { 'main.tex': '\\input{body}\n', 'body.tex': '\\bibliography{refs}\n', 'talk/slides.tex': '\\bibliography{../references}\n', 'refs.bib': '', 'references.bib': '' };
  const root = tempProject({ ...files, '.spectrum/project.json': JSON.stringify({ id: 'p', name: 'Two documents', mainFile: 'main.tex' }) });
  const unnamed = tempProject(files);
  t.after(() => [root, unnamed].forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  const out = await resolveReferences({ projectRoot: root, input: '10.1234/journal.5' });
  assert.deepEqual([out.bibFile, out.bibIncluded, out.results[0].status], ['refs.bib', true, 'added']);
  // no main file named: every .tex, as before
  assert.equal((await resolveReferences({ projectRoot: unnamed, input: '10.1234/journal.5' })).bibFile, 'references.bib');
});

test('an LLM splits free text when configured', async (t) => {
  const root = tempProject({ 'main.tex': '' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const out = await resolveReferences({
    projectRoot: root,
    input: 'Lovelace A, Babbage C. Preprint widgets. 2021.\nLovelace, Notes on the\nAnalytical Engine, 1843',
    llmConfig: { endpoint: `${base}/llm`, apiKey: 'test-key', model: 'mock' }
  });
  assert.deepEqual(out.results.map((r) => [r.input, r.status, r.key]), [
    ['2101.00002', 'added', 'Lovelace2021'],
    ['10.1234/journal.1', 'added', 'Lovelace1843'],
    ['Doe 2023 Neural Widgets for Everyone', 'added', 'Doe2023']
  ]);
});

test('reports references past the first 30 instead of dropping them', async (t) => {
  const root = tempProject({ 'references.bib': '@misc{X, doi = {10.9999/x}}\n' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const out = await resolveReferences({ projectRoot: root, input: Array(31).fill('10.9999/x').join('\n') });
  assert.equal(out.results.length, 31);
  assert.ok(out.results.slice(0, 30).every((r) => r.status === 'duplicate'));
  assert.deepEqual([out.results[30].status, out.results[30].message], ['error', 'Only the first 30 references were processed. Paste the rest separately.']);
});

test('live: arXiv DOI via doi.org', { skip: process.env.SPECTRUM_LIVE_TESTS !== '1' }, async (t) => {
  for (const name of ['SPECTRUM_DOI_BASE', 'SPECTRUM_CROSSREF_BASE', 'SPECTRUM_ARXIV_BASE']) delete process.env[name];
  const root = tempProject({});
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const out = await resolveReferences({ projectRoot: root, input: '10.48550/arXiv.1706.03762' });
  console.log(out.results[0].bibtex);
  assert.equal(out.results[0].key, 'Vaswani2017');
});
