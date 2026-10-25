// Zotero: the status, the Allow prompt and its key, the library search, entries into the .bib under their Zotero keys
// (Better BibTeX's export or Zotero's own), Better BibTeX's citation picker, the project's collection kept in step with
// its .bib, and Research's Zotero source. Against a mock Zotero on 127.0.0.1 (its local API, Better BibTeX's JSON-RPC
// and picker), with throwaway data and projects folders and a fake home folder. Never the real Zotero.
// Run: node --test apps/backend/test/zotero.test.js
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ─── The mock Zotero ───

const SERVER_ID = 'server-7f3a';
const KEY = 'zoteroLocalKey123';
const mock = {};
let itemCount = 0;
let collectionCount = 0;

function reset(over = {}) {
  Object.assign(mock, {
    version: '10.0.6',
    localApi: true,
    bbt: true,
    // what the Allow prompt answers: a promise, so a test can hold it
    allow: () => Promise.resolve(true),
    cayw: () => Promise.resolve(''),
    bbtKeys: {},
    conflictOnce: new Set(),
    items: new Map(),
    collections: new Map(),
    requests: []
  }, over);
}

function addItem(data) {
  itemCount += 1;
  const key = `ITEM${String(itemCount).padStart(4, '0')}`;
  const item = { key, version: 1, library: { type: 'user', id: 0 }, data: { key, version: 1, itemType: 'journalArticle', creators: [], collections: [], ...data } };
  mock.items.set(key, item);
  return item;
}

function addCollection(name, parentCollection = false) {
  collectionCount += 1;
  const key = `COLL${String(collectionCount).padStart(4, '0')}`;
  const collection = { key, version: 1, data: { key, name, parentCollection } };
  mock.collections.set(key, collection);
  return collection;
}

const yearOf = (d) => String(d.date || '').match(/\d{4}/)?.[0];

function exportOf(item, format) {
  const d = item.data;
  const names = d.creators.map((c) => (c.name ? `{${c.name}}` : `${c.lastName}, ${c.firstName}`)).join(' and ');
  const fields = [
    ['title', d.title],
    ['author', names],
    format === 'biblatex' ? ['date', yearOf(d)] : ['year', yearOf(d)],
    ['doi', d.DOI],
    ['file', '/Users/someone/Zotero/storage/ABCD1234/paper.pdf:application/pdf']
  ];
  return `@article{${d.citationKey || `zotero${item.key.toLowerCase()}`},\n${fields.filter(([, v]) => v).map(([n, v]) => `  ${n} = {${v}}`).join(',\n')}\n}\n`;
}

const matches = (item, q) => {
  const text = JSON.stringify(item.data).toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w));
};

const page = (list, url) => {
  const start = Number(url.searchParams.get('start') || 0);
  return list.slice(start, start + Number(url.searchParams.get('limit') || 50));
};

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const body = raw ? JSON.parse(raw) : undefined;
  const url = new URL(req.url, 'http://127.0.0.1');
  mock.requests.push({ method: req.method, path: url.pathname, url, headers: req.headers, body });
  const send = (status, data, headers = {}) => {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': typeof data === 'string' ? 'text/plain' : 'application/json', ...headers });
    res.end(text);
  };
  const authorised = req.headers['zotero-api-key'] === KEY;
  const p = url.pathname;
  let m;

  if (p === '/connector/ping') return send(200, 'Zotero is running', { 'X-Zotero-Version': mock.version });
  if (p === '/better-bibtex/json-rpc') {
    if (!mock.bbt) return send(404, 'No endpoint found');
    const [a, b] = body.params || [];
    if (body.method === 'api.ready') return send(200, { jsonrpc: '2.0', id: body.id, result: { zotero: mock.version, betterbibtex: '7.0.30' } });
    if (body.method === 'item.citationkey') return send(200, { jsonrpc: '2.0', id: body.id, result: Object.fromEntries(a.map((k) => [k, mock.bbtKeys[k] ?? null])) });
    if (body.method === 'item.export') {
      const item = [...mock.items.values()].find((it) => (it.data.citationKey || mock.bbtKeys[it.key]) === a[0]);
      if (!item) return send(200, { jsonrpc: '2.0', id: body.id, error: { code: -32603, message: `${a[0]} not found` } });
      const text = exportOf({ ...item, data: { ...item.data, citationKey: a[0] } }, b === 'Better BibLaTeX' ? 'biblatex' : 'bibtex');
      return send(200, { jsonrpc: '2.0', id: body.id, result: text });
    }
    return send(200, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } });
  }
  if (p === '/better-bibtex/cayw') {
    if (!mock.bbt) return send(404, 'No endpoint found');
    if (url.searchParams.get('probe')) return send(200, 'ready');
    return send(200, await mock.cayw(url));
  }
  if (!p.startsWith('/api/')) return send(404, 'No endpoint found');
  if (!mock.localApi) return send(403, 'Local API is not enabled');
  const v10 = parseInt(mock.version, 10) >= 10;
  const extra = v10 ? { 'Zotero-Server-ID': SERVER_ID } : {};
  if (p === '/api/') return send(200, 'Nothing to see here.', { 'Zotero-API-Version': '3', ...extra });
  if (p === '/api/local/authorize' && req.method === 'POST') {
    if (!v10) return send(404, 'No endpoint found');
    if (req.headers['zotero-server-id'] !== SERVER_ID) return send(400, 'Missing Zotero-Server-ID');
    return (await mock.allow()) ? send(200, { key: KEY }) : send(403, 'Not allowed');
  }
  const write = req.method !== 'GET';
  if (write && (!v10 || !authorised)) return send(403, 'Forbidden');

  if (p === '/api/users/0/items' && req.method === 'GET') {
    const keys = url.searchParams.get('itemKey')?.split(',');
    const q = url.searchParams.get('q');
    let list = [...mock.items.values()].filter((it) => (!keys || keys.includes(it.key)) && (!q || matches(it, q)));
    if (url.searchParams.get('itemType') === '-attachment') list = list.filter((it) => it.data.itemType !== 'attachment');
    return send(200, page(list, url), { 'Total-Results': String(list.length) });
  }
  if (p === '/api/users/0/items' && req.method === 'POST') {
    const out = { successful: {}, success: {}, unchanged: {}, failed: {} };
    body.forEach((data, i) => {
      if (!data.itemType) {
        out.failed[i] = { code: 400, message: 'itemType missing' };
        return;
      }
      const item = addItem(data);
      out.successful[i] = item;
      out.success[i] = item.key;
    });
    return send(200, out);
  }
  if ((m = p.match(/^\/api\/users\/0\/items\/(\w+)$/))) {
    const item = mock.items.get(m[1]);
    if (!item) return send(404, 'Not found');
    if (req.method === 'GET') {
      const format = url.searchParams.get('format');
      return format ? send(200, exportOf(item, format)) : send(200, item);
    }
    if (req.method === 'PATCH') {
      if (mock.conflictOnce.delete(item.key)) {
        item.version += 1;
        item.data.version = item.version;
        return send(412, 'Item has been modified since the specified version');
      }
      if (req.headers['if-unmodified-since-version'] !== String(item.version)) return send(412, 'Item has been modified since the specified version');
      Object.assign(item.data, body);
      item.version += 1;
      item.data.version = item.version;
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'DELETE') {
      mock.items.delete(item.key);
      res.writeHead(204);
      return res.end();
    }
  }
  if (p === '/api/users/0/collections' && req.method === 'POST') {
    const made = addCollection(body[0].name, body[0].parentCollection || false);
    return send(200, { successful: { 0: made }, success: { 0: made.key }, unchanged: {}, failed: {} });
  }
  if (p === '/api/users/0/collections/top') return send(200, page([...mock.collections.values()].filter((c) => !c.data.parentCollection), url));
  if ((m = p.match(/^\/api\/users\/0\/collections\/(\w+)(\/collections|\/items)?$/))) {
    const collection = mock.collections.get(m[1]);
    if (!collection) return send(404, 'Collection not found');
    if (!m[2]) return send(200, collection);
    if (m[2] === '/collections') return send(200, page([...mock.collections.values()].filter((c) => c.data.parentCollection === m[1]), url));
    return send(200, page([...mock.items.values()].filter((it) => it.data.collections.includes(m[1])), url));
  }
  return send(404, 'No endpoint found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
reset();

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-zotero-')));
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  USERPROFILE: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_ZOTERO_BASE: `http://127.0.0.1:${server.address().port}`
});
delete process.env.SPECTRUM_LLM_API_KEY;
const { default: Fastify } = await import('fastify');
const { registerZoteroRoutes } = await import('../src/routes/zotero.js');
const { registerResearchRoutes } = await import('../src/routes/research.js');
const { createProject } = await import('../src/services/projectService.js');
const { cleanEntry, itemFromEntry, parsedWhole, sameRef, syncCollection, syncSoon } = await import('../src/services/zoteroService.js');
const { parseBibEntries } = await import('../src/services/referenceService.js');
const { citeKeys, renameCiteKeys } = await import('../src/latex/text.js');

const app = Fastify();
app.setErrorHandler(async (err, req, reply) => reply.code(err.statusCode || 500).send({ ok: false, error: err.message }));
registerZoteroRoutes(app);
registerResearchRoutes(app);
after(async () => {
  await app.close();
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => reset());

async function api(url, method = 'GET', body) {
  const res = await app.inject({ url, method, ...(body !== undefined && { payload: body }) });
  return { status: res.statusCode, json: res.json(), text: res.body };
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

const keyFile = () => path.join(tmp, 'data', 'zotero.json');
const allowSpectrum = () => fs.writeFile(keyFile(), JSON.stringify({ key: KEY }));
const waitFor = async (check) => {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.ok(check(), 'timed out');
};
const writes = () => mock.requests.filter((r) => r.method !== 'GET' && r.path.startsWith('/api/users'));
const BIBLATEX_MAIN = '\\documentclass{article}\n\\usepackage{biblatex}\n\\addbibresource{refs.bib}\n\\begin{document}\nHi.\n\\end{document}\n';
const BIBTEX_MAIN = '\\documentclass{article}\n\\begin{document}\nHi.\n\\bibliography{refs}\n\\end{document}\n';

// ─── Pure pieces ───

test('citation keys come out of a picker’s citation, and are renamed in place', () => {
  assert.deepEqual(citeKeys('\\parencite[p.~3]{a, b}'), ['a', 'b']);
  assert.deepEqual(citeKeys('\\parencites[see][4]{a}[5]{b}'), ['a', 'b']);
  assert.deepEqual(citeKeys(''), []);
  assert.equal(renameCiteKeys('\\parencite[p. {3}]{a, b}', { a: 'a2' }), '\\parencite[p. {3}]{a2, b}');
  assert.equal(renameCiteKeys('\\citep[see][]{a,b}', { b: 'c' }), '\\citep[see][]{a,c}');
});

test('an export keeps its first entry without file paths, and only a .bib read whole counts', () => {
  const text = '@comment{x}\n@article{k,\n  title = {T {A}},\n  file = {/Users/a/b.pdf:application/pdf},\n  year = {2020}\n}\n@book{other, title={B}}';
  assert.equal(cleanEntry(text), '@article{k,\n  title = {T {A}},\n  year = {2020}\n}');
  assert.equal(cleanEntry('@article{k,\n  file = {a{b}c}\n}'), '@article{k\n}');
  assert.equal(parsedWhole('@article{a, title={x}}\n@string{s = {y}}\n@book{b, title={z}}'), true);
  assert.equal(parsedWhole('@article{a, title={x}\n'), false, 'an unclosed brace');
  assert.equal(parsedWhole('@article{a, title={x}}\n@article{'), false, 'an entry cut off');
});

test('a .bib entry becomes a Zotero item of the right type with only the fields that type takes', () => {
  const [article, preprint, book, thesis, misc] = parseBibEntries([
    '@article{vaswani2017, author = {Vaswani, Ashish and Noam Shazeer and {Google Brain}}, title = {Attention Is {All} You Need}, journal = {NeurIPS}, volume = {30}, number = {2}, pages = {5998--6008}, year = {2017}, doi = {10.5555/x}}',
    '@misc{bert, author = {Devlin, Jacob}, title = {BERT}, eprint = {1810.04805}, archivePrefix = {arXiv}, year = {2018}}',
    '@book{knuth, editor = {Knuth, Donald}, title = {The \\TeX book}, publisher = {Addison-Wesley}, address = {Reading}, year = {1984}, doi = {10.1/b}}',
    '@mastersthesis{t, author = {Doe, Jane}, title = {On Things}, school = {ANU}, year = {2020}}',
    '@misc{m, title = {Something}, howpublished = {Online}}'
  ].join('\n'));
  assert.deepEqual(itemFromEntry(article), {
    itemType: 'journalArticle',
    title: 'Attention Is All You Need',
    creators: [
      { creatorType: 'author', lastName: 'Vaswani', firstName: 'Ashish' },
      { creatorType: 'author', lastName: 'Shazeer', firstName: 'Noam' },
      { creatorType: 'author', name: 'Google Brain' }
    ],
    date: '2017',
    citationKey: 'vaswani2017',
    publicationTitle: 'NeurIPS',
    volume: '30',
    issue: '2',
    pages: '5998-6008',
    DOI: '10.5555/x'
  });
  const p = itemFromEntry(preprint);
  assert.equal(p.itemType, 'preprint');
  assert.equal(p.archiveID, 'arXiv:1810.04805');
  assert.equal(p.repository, 'arXiv');
  const b = itemFromEntry(book);
  assert.deepEqual([b.itemType, b.creators[0].creatorType, b.publisher, b.place, b.DOI, b.extra], ['book', 'editor', 'Addison-Wesley', 'Reading', undefined, 'DOI: 10.1/b']);
  const t = itemFromEntry(thesis);
  assert.deepEqual([t.itemType, t.university, t.thesisType], ['thesis', 'ANU', 'Master’s thesis']);
  assert.equal(itemFromEntry(misc).itemType, 'document');
  assert.equal(itemFromEntry(misc).publisher, undefined, 'howpublished isn’t a publisher');
});

test('two references are the same by key, DOI, arXiv id, or title and year where DOIs agree', () => {
  const ref = (over) => ({ key: '', doi: '', arxiv: '', title: 'deep learning', year: '2015', ...over });
  assert.equal(sameRef(ref({ key: 'LeCun2015' }), ref({ key: 'lecun2015', title: 'x' })), true);
  assert.equal(sameRef(ref({ doi: '10.1/a' }), ref({ doi: '10.1/a', title: 'x' })), true);
  assert.equal(sameRef(ref(), ref()), true);
  assert.equal(sameRef(ref({ doi: '10.1/a' }), ref({ doi: '10.1/b' })), false, 'one title under two DOIs is two works');
  assert.equal(sameRef(ref(), ref({ year: '2016' })), false);
});

// ─── Status and the Allow prompt ───

test('status: Zotero closed, Zotero 9 reading only, and Zotero 10 with Better BibTeX and its picker', async () => {
  const closed = createServer();
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const port = closed.address().port;
  await new Promise((resolve) => closed.close(resolve));
  const real = process.env.SPECTRUM_ZOTERO_BASE;
  process.env.SPECTRUM_ZOTERO_BASE = `http://127.0.0.1:${port}`;
  try {
    const { json } = await api('/api/zotero/status');
    assert.equal(json.running, false);
    assert.match(json.message, /isn’t open/);
  } finally {
    process.env.SPECTRUM_ZOTERO_BASE = real;
  }

  let { json } = await api('/api/zotero/status');
  assert.deepEqual([json.running, json.version, json.localApi, json.betterBibtex, json.cayw, json.writes, json.authorised], [true, '10.0.6', 'on', '7.0.30', true, true, false]);
  assert.equal(json.message, undefined);

  reset({ version: '9.0.2', bbt: false });
  ({ json } = await api('/api/zotero/status'));
  assert.deepEqual([json.writes, json.betterBibtex, json.cayw], [false, null, false]);
  assert.match(json.message, /Zotero 9\.0\.2 lets Spectrum read your library\. Keeping a collection for each project needs Zotero 10\./);

  reset({ localApi: false });
  ({ json } = await api('/api/zotero/status'));
  assert.deepEqual([json.localApi, json.writes], ['off', false]);
  assert.match(json.message, /Allow other applications on this computer to communicate with Zotero/);
});

test('the Allow prompt waits in Zotero, its key stays in a private file and never reaches the window, and Cancel stops it', async () => {
  await fs.rm(keyFile(), { force: true });
  let answer;
  mock.allow = () => new Promise((resolve) => (answer = resolve));
  const pending = api('/api/zotero/authorize', 'POST', {});
  await waitFor(() => answer);
  const asked = mock.requests.find((r) => r.path === '/api/local/authorize');
  assert.equal(asked.headers['zotero-server-id'], SERVER_ID);
  answer(true);
  const { status, json, text } = await pending;
  assert.equal(status, 200);
  assert.equal(json.authorised, true);
  assert.ok(!text.includes(KEY), 'the key never goes to the window');
  assert.equal(JSON.parse(await fs.readFile(keyFile(), 'utf8')).key, KEY);
  if (process.platform !== 'win32') assert.equal((await fs.stat(keyFile())).mode & 0o777, 0o600);
  assert.ok(!(await api('/api/zotero/status')).text.includes(KEY));

  // Disconnect forgets it
  assert.equal((await api('/api/zotero/authorize', 'DELETE')).json.authorised, false);
  await assert.rejects(fs.stat(keyFile()));

  // Cancel while Zotero asks
  answer = null;
  const cancelled = api('/api/zotero/authorize', 'POST', {});
  await waitFor(() => answer);
  await api('/api/zotero/cancel', 'POST', {});
  assert.deepEqual((await cancelled).json, { ok: true, cancelled: true });
  await assert.rejects(fs.stat(keyFile()));

  // Allow refused, and Zotero 9 has nothing to allow
  mock.allow = () => Promise.resolve(false);
  assert.match((await api('/api/zotero/authorize', 'POST', {})).json.error, /didn’t allow Spectrum/);
  reset({ version: '9.0.2' });
  const old = await api('/api/zotero/authorize', 'POST', {});
  assert.equal(old.status, 409);
  assert.match(old.json.error, /needs Zotero 10/);
});

// ─── Reading ───

test('a search gives each item the key its entry goes in under: Zotero’s, Better BibTeX’s, else AuthorYear', async () => {
  addItem({ title: 'Attention Is All You Need', citationKey: 'vaswani2017', creators: [{ creatorType: 'author', firstName: 'Ashish', lastName: 'Vaswani' }], date: '2017', DOI: '10.5555/att' });
  const bbt = addItem({ title: 'Attention on graphs', creators: [{ creatorType: 'author', firstName: 'P', lastName: 'Velickovic' }], date: '2018' });
  addItem({ title: 'Attention in brains', creators: [{ creatorType: 'author', firstName: 'Ann', lastName: 'Smith' }], date: '2021' });
  addItem({ itemType: 'note', title: 'attention note' });
  mock.bbtKeys[bbt.key] = 'velickovic2018graph';
  const { json } = await api(`/api/zotero/search?q=${encodeURIComponent('attention')}`);
  assert.deepEqual(json.items.map((h) => h.key), ['vaswani2017', 'velickovic2018graph', 'Smith2021']);
  assert.deepEqual(json.items[0].authors, ['Ashish Vaswani']);
  assert.equal(json.items[0].doi, '10.5555/att');
  assert.ok(mock.requests.some((r) => r.path === '/api/users/0/items' && r.url.searchParams.get('qmode') === 'everything' && r.url.searchParams.get('itemType') === '-attachment'));

  reset({ localApi: false });
  const off = await api('/api/zotero/search?q=attention');
  assert.deepEqual(off.json.items, []);
  assert.match(off.json.message, /local API is off/);
});

test('items go into the .bib under their Zotero keys, without file paths, as the project’s BibLaTeX; duplicates and taken keys are caught', async () => {
  const project = await newProject('Adds', {
    'main.tex': BIBLATEX_MAIN,
    'refs.bib': '@article{Old2019,\n  title = {Something old},\n  doi = {10.1/dup},\n  year = {2019}\n}\n\n@article{taken2020,\n  title = {Another work},\n  year = {2020}\n}\n'
  });
  const att = addItem({ title: 'Attention Is All You Need', citationKey: 'vaswani2017', creators: [{ creatorType: 'author', firstName: 'Ashish', lastName: 'Vaswani' }], date: '2017' });
  const dup = addItem({ title: 'Something old', citationKey: 'whatever', DOI: '10.1/dup', date: '2019' });
  const clash = addItem({ title: 'A different work', citationKey: 'taken2020', date: '2020' });
  const nokey = addItem({ title: 'Brains', creators: [{ creatorType: 'author', firstName: 'Ann', lastName: 'Smith' }], date: '2021' });
  const { json } = await api(`/api/projects/${project.id}/zotero/add`, 'POST', { items: [att.key, dup.key, clash.key, nokey.key] });
  assert.deepEqual(json.results.map((r) => [r.status, r.key]), [['added', 'vaswani2017'], ['duplicate', 'Old2019'], ['added', 'taken2020a'], ['added', 'Smith2021']]);
  assert.equal(json.bibFile, 'refs.bib');
  const bib = await fs.readFile(path.join(project.path, 'refs.bib'), 'utf8');
  assert.match(bib, /@article\{vaswani2017,\n {2}title = \{Attention Is All You Need\}/);
  assert.match(bib, /@article\{taken2020a,/);
  assert.match(bib, /@article\{Smith2021,/);
  assert.doesNotMatch(bib, /file =|Zotero\/storage/);
  assert.match(bib, /date = \{2017\}/, 'BibLaTeX, as the document loads biblatex');
  assert.ok(mock.requests.some((r) => r.body?.method === 'item.export' && r.body.params[1] === 'Better BibLaTeX'));
  assert.ok(mock.requests.some((r) => r.path === `/api/users/0/items/${nokey.key}` && r.url.searchParams.get('format') === 'biblatex'), 'Zotero’s own export for an item Better BibTeX has no key for');

  // a BibTeX project, without Better BibTeX
  reset({ bbt: false });
  const plain = await newProject('Plain', { 'main.tex': BIBTEX_MAIN, 'refs.bib': '' });
  const item = addItem({ title: 'Plain one', citationKey: 'plain2022', date: '2022' });
  const out = await api(`/api/projects/${plain.id}/zotero/add`, 'POST', { items: [item.key] });
  assert.deepEqual(out.json.results.map((r) => [r.status, r.key]), [['added', 'plain2022']]);
  assert.match(await fs.readFile(path.join(plain.path, 'refs.bib'), 'utf8'), /@article\{plain2022,[\s\S]*year = \{2022\}/);
  assert.equal((await api(`/api/projects/${plain.id}/zotero/add`, 'POST', { items: ['nope'] })).status, 400);
});

test('Zotero’s picker is asked for the document’s command, and what was picked goes into the .bib', async () => {
  const project = await newProject('Picks', { 'main.tex': BIBLATEX_MAIN, 'refs.bib': '' });
  addItem({ title: 'Attention Is All You Need', citationKey: 'vaswani2017', creators: [{ creatorType: 'author', firstName: 'Ashish', lastName: 'Vaswani' }], date: '2017' });
  addItem({ title: 'BERT', citationKey: 'devlin2019', date: '2019' });
  let asked;
  mock.cayw = async (url) => {
    asked = url;
    return '\\parencite[p.~4]{vaswani2017,devlin2019}';
  };
  const { json } = await api(`/api/projects/${project.id}/zotero/cite`, 'POST', { command: 'parencite' });
  assert.deepEqual([asked.searchParams.get('format'), asked.searchParams.get('command')], ['biblatex', 'parencite']);
  assert.equal(json.text, '\\parencite[p.~4]{vaswani2017,devlin2019}');
  assert.deepEqual(json.results.map((r) => [r.input, r.status, r.key]), [['vaswani2017', 'added', 'vaswani2017'], ['devlin2019', 'added', 'devlin2019']]);
  assert.match(await fs.readFile(path.join(project.path, 'refs.bib'), 'utf8'), /@article\{vaswani2017,[\s\S]*@article\{devlin2019,/);

  // closed without a pick
  mock.cayw = async () => '';
  assert.deepEqual((await api(`/api/projects/${project.id}/zotero/cite`, 'POST', { command: 'citep' })).json, { ok: true, cancelled: true });
  assert.equal(asked.searchParams.get('format'), 'biblatex');

  // Cancel while the picker waits
  let release;
  mock.cayw = (url) => {
    asked = url;
    return new Promise((resolve) => (release = resolve));
  };
  const pending = api(`/api/projects/${project.id}/zotero/cite`, 'POST', { command: 'citep' });
  await waitFor(() => release);
  assert.equal(asked.searchParams.get('format'), 'natbib');
  await api('/api/zotero/cancel', 'POST', {});
  assert.deepEqual((await pending).json, { ok: true, cancelled: true });
  release('\\citep{late}');
});

// ─── The project's collection ───

const settingsOf = async (root) => JSON.parse(await fs.readFile(path.join(root, '.spectrum', 'settings.json'), 'utf8').catch(() => '{}'));
const inCollection = (key) => [...mock.items.values()].filter((it) => it.data.collections.includes(key));

test('a sync makes Spectrum › <project>, files the items Zotero has by key, DOI, arXiv id and title, and makes the rest', async () => {
  await allowSpectrum();
  const project = await newProject('Thesis', {
    'main.tex': BIBTEX_MAIN,
    'refs.bib': [
      '@article{vaswani2017, title = {Attention Is All You Need}, year = {2017}}',
      '@article{byDoi, title = {Deep learning}, doi = {https://doi.org/10.1038/nature14539}, year = {2015}}',
      '@misc{byArxiv, title = {BERT}, eprint = {1810.04805}, archivePrefix = {arXiv}, year = {2018}}',
      '@book{byTitle, title = {The {TeX}book}, year = {1984}}',
      '@inproceedings{fresh2024, author = {Nguyen, Linh}, title = {A New Idea}, booktitle = {ICML}, year = {2024}}'
    ].join('\n')
  });
  const projectJson = await fs.readFile(path.join(project.path, '.spectrum', 'project.json'), 'utf8');
  const byKey = addItem({ title: 'Attention Is All You Need', citationKey: 'vaswani2017', date: '2017' });
  const byDoi = addItem({ title: 'Deep learning', DOI: '10.1038/nature14539', date: '2015-05-27' });
  const byArxiv = addItem({ itemType: 'preprint', title: 'BERT: Pre-training', archiveID: 'arXiv:1810.04805', date: '2018' });
  const byTitle = addItem({ itemType: 'book', title: 'The TeXbook', date: '1984' });
  // another project's collection already has the name
  const parent = addCollection('Spectrum');
  addCollection('Thesis', parent.key);
  mock.conflictOnce.add(byDoi.key);

  const { json } = await api(`/api/projects/${project.id}/zotero/sync`, 'POST', {});
  assert.equal(json.state, 'synced', json.message);
  assert.equal(json.collection, 'Spectrum › Thesis (2)');
  assert.deepEqual([json.added, json.created, json.removed], [4, 1, 0]);
  const binding = (await settingsOf(project.path)).zotero;
  assert.deepEqual(Object.keys(binding).sort(), ['collectionKey', 'library', 'projectId']);
  assert.deepEqual([binding.projectId, binding.library], [project.id, 'users/0']);
  assert.equal(mock.collections.get(binding.collectionKey).data.parentCollection, parent.key);
  assert.equal(await fs.readFile(path.join(project.path, '.spectrum', 'project.json'), 'utf8'), projectJson, 'project.json is left alone');
  const members = inCollection(binding.collectionKey);
  assert.deepEqual(members.slice(0, 4).map((it) => it.key), [byKey, byDoi, byArxiv, byTitle].map((it) => it.key));
  const made = members[4];
  assert.deepEqual([made.data.itemType, made.data.citationKey, made.data.title, made.data.proceedingsTitle, made.data.creators[0].lastName], ['conferencePaper', 'fresh2024', 'A New Idea', 'ICML', 'Nguyen']);
  assert.ok(writes().every((r) => r.headers['zotero-api-key'] === KEY));
  assert.ok(writes().filter((r) => r.method === 'PATCH').every((r) => r.headers['if-unmodified-since-version']), 'each change names the version it changes');
  assert.equal(writes().filter((r) => r.path.endsWith(byDoi.key)).length, 2, 'a change refused for a newer version is read and made again');

  // again: nothing to do, and the collection isn't made twice
  mock.requests = [];
  const again = (await api(`/api/projects/${project.id}/zotero/sync`, 'POST', {})).json;
  assert.deepEqual([again.state, again.added, again.created], ['synced', 0, 0]);
  assert.deepEqual(writes(), []);
  assert.equal([...mock.collections.values()].filter((c) => c.data.parentCollection).length, 2);
});

test('entries leave the collection only after a .bib save read whole, and Zotero’s items are never deleted', async () => {
  await allowSpectrum();
  const project = await newProject('Paper', {
    'main.tex': BIBTEX_MAIN,
    'refs.bib': '@article{a2020, title = {Alpha}, year = {2020}}\n@article{b2021, title = {Beta}, year = {2021}}\n'
  });
  await syncCollection(project.path);
  const { collectionKey } = (await settingsOf(project.path)).zotero;
  assert.equal(inCollection(collectionKey).length, 2);
  const beta = inCollection(collectionKey).find((it) => it.data.citationKey === 'b2021');

  await fs.writeFile(path.join(project.path, 'refs.bib'), '@article{a2020, title = {Alpha}, year = {2020}}\n');
  assert.equal((await syncCollection(project.path)).removed, 0, 'opening and focus only add');
  assert.equal(inCollection(collectionKey).length, 2);

  // a .bib cut off partway never strips the collection
  await fs.writeFile(path.join(project.path, 'refs.bib'), '@article{a2020, title = {Alpha}, year = {2020}}\n@article{c2022, title = {Gam');
  assert.equal((await syncCollection(project.path, { remove: true })).removed, 0);
  assert.ok(beta.data.collections.includes(collectionKey));

  // a save of the .bib, debounced
  await fs.writeFile(path.join(project.path, 'refs.bib'), '@article{a2020, title = {Alpha}, year = {2020}}\n');
  syncSoon(project.path, { remove: true, delay: 10 });
  await waitFor(() => !beta.data.collections.includes(collectionKey));
  assert.deepEqual(inCollection(collectionKey).map((it) => it.data.citationKey), ['a2020']);
  assert.ok(mock.items.has(beta.key), 'the item stays in the library');
  assert.ok(!mock.requests.some((r) => r.method === 'DELETE'));
});

test('a stored collection this computer’s Zotero lacks is waited for, and a Finder copy gets its own', async () => {
  await allowSpectrum();
  const project = await newProject('Shared', { 'main.tex': BIBTEX_MAIN, 'refs.bib': '@article{a2020, title = {Alpha}, year = {2020}}\n' });
  const settings = path.join(project.path, '.spectrum', 'settings.json');
  await fs.writeFile(settings, JSON.stringify({ compile: { engine: 'xelatex' }, zotero: { projectId: project.id, library: 'users/0', collectionKey: 'COLLZZZZ' } }));
  const waiting = (await api(`/api/projects/${project.id}/zotero/sync`, 'POST', {})).json;
  assert.deepEqual([waiting.state, waiting.message], ['waiting', 'Waiting for Zotero to sync this project’s collection']);
  assert.deepEqual(writes(), [], 'nothing made meanwhile');

  // the binding was made for another project: this one (a copy) gets a collection of its own
  await fs.writeFile(settings, JSON.stringify({ compile: { engine: 'xelatex' }, zotero: { projectId: 'another-project', library: 'users/0', collectionKey: 'COLLZZZZ' } }));
  const own = (await api(`/api/projects/${project.id}/zotero/sync`, 'POST', {})).json;
  assert.equal(own.state, 'synced');
  const next = await settingsOf(project.path);
  assert.equal(next.zotero.projectId, project.id);
  assert.notEqual(next.zotero.collectionKey, 'COLLZZZZ');
  assert.deepEqual(next.compile, { engine: 'xelatex' }, 'the other settings stay');
});

test('without permission, before Zotero 10 or with a project with no references, nothing is written', async () => {
  const project = await newProject('Quiet', { 'main.tex': BIBTEX_MAIN, 'refs.bib': '@article{a2020, title = {Alpha}, year = {2020}}\n' });
  await fs.rm(keyFile(), { force: true });
  assert.equal((await syncCollection(project.path)).state, 'off');
  assert.deepEqual(mock.requests, [], 'Zotero isn’t even asked');

  await allowSpectrum();
  reset({ version: '9.0.2' });
  const old = await syncCollection(project.path);
  assert.equal(old.state, 'readonly');
  assert.match(old.message, /needs Zotero 10/);
  assert.deepEqual(writes(), []);

  reset();
  const empty = await newProject('Empty', { 'main.tex': BIBTEX_MAIN });
  assert.equal((await syncCollection(empty.path)).state, 'empty');
  assert.equal(mock.collections.size, 0, 'no collection for a project without references');

  // a key Zotero gave without Always Allow works once: refused, it's dropped
  await fs.writeFile(keyFile(), JSON.stringify({ key: 'stale-key-123' }));
  const refused = await syncCollection(project.path);
  assert.equal(refused.state, 'error');
  assert.match(refused.message, /Allow Spectrum again in Settings › Zotero/);
  await assert.rejects(fs.stat(keyFile()));
});

// ─── Research ───

test('Research’s Zotero source searches the library, and its results go into the .bib from Zotero under their keys', async () => {
  const project = await newProject('Research', { 'main.tex': BIBLATEX_MAIN, 'refs.bib': '' });
  const paper = addItem({ title: 'Attention Is All You Need', abstractNote: 'Transformers replace recurrence.', citationKey: 'vaswani2017', creators: [{ creatorType: 'author', firstName: 'Ashish', lastName: 'Vaswani' }], date: '2017', DOI: '10.5555/att' });
  addItem({ title: 'Unrelated', date: '2001' });
  // one of the question's three words isn't enough; the paper has two (its abstract has "transformers")
  addItem({ title: 'Attention spans', date: '2010' });
  const search = await api('/api/research/search', 'POST', { projectId: project.id, question: 'attention in transformers for proteins', sources: ['zotero'] });
  assert.equal(search.status, 200, search.text);
  const { session } = search.json;
  assert.deepEqual(session.results.map((r) => [r.title, r.sources, r.zotero, r.abstract]), [['Attention Is All You Need', ['zotero'], paper.key, 'Transformers replace recurrence.']]);
  assert.deepEqual(session.runs[0].perSource, { zotero: { count: 1 } });
  const added = await api(`/api/projects/${project.id}/research/${session.id}/add`, 'POST', { resultIds: [session.results[0].id] });
  assert.deepEqual(added.json.results.map((r) => [r.status, r.key]), [['added', 'vaswani2017']]);
  assert.match(await fs.readFile(path.join(project.path, 'refs.bib'), 'utf8'), /@article\{vaswani2017,/);
  assert.equal(added.json.session.results[0].inBib, 'vaswani2017');

  // Zotero closed: the source says so, the others carry on
  reset({ localApi: false });
  const closed = await api('/api/research/search', 'POST', { projectId: project.id, question: 'attention', sources: ['zotero', 'bib'] });
  assert.match(closed.json.session.runs[0].perSource.zotero.error, /local API is off/);
});
