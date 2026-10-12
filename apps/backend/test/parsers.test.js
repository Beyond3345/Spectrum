// PDF parser adapters against a local fake of each API: what they send, and the markdown and images they return.
// Run: node --test apps/backend/test/parsers.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parsePdf, resolveParserConfig } from '../src/services/parsers/index.js';
import { dollarMaths, download, send } from '../src/services/parsers/common.js';

// Never let a developer's own .env token into these tests.
delete process.env.SPECTRUM_MINERU_TOKEN;
delete process.env.SPECTRUM_MINERU_API_BASE;

const tmp = mkdtempSync(path.join(tmpdir(), 'spectrum-parsers-'));
const pdfPath = path.join(tmp, 'source.pdf');
const PDF = Buffer.from('%PDF-1.4 a tiny test paper');
const b64 = (text) => Buffer.from(text).toString('base64');

// "METHOD /path" → replies, each [status, body, headers?] or a 200 body; the last one repeats. Every request is kept in seen.
let server;
let base;
let port;
let routes = {};
const seen = [];

before(async () => {
  await fs.writeFile(pdfPath, PDF);
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({ method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      const queue = routes[`${req.method} ${req.url}`] || [[404, { error: `no route for ${req.method} ${req.url}` }]];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      const [status, body, headers] = Array.isArray(next) ? next : [200, next];
      res.writeHead(status, { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json', ...headers });
      res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});
after(() => {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** Sets the fake's replies and runs the parser, polling without waiting. */
async function run(raw, replies) {
  routes = Object.fromEntries(Object.entries(replies).map(([key, list]) => [key, [...list]]));
  seen.length = 0;
  const outputDir = path.join(tmp, `out-${raw.id}`);
  const result = await parsePdf(pdfPath, { ...resolveParserConfig(raw), pollMs: 1 }, outputDir);
  for (const img of result.images) assert.ok(img.localPath.startsWith(outputDir), `${img.name} is saved in the output folder`);
  return result;
}

const sent = (method, url) => seen.find((r) => r.method === method && r.path === url);
const formOf = (r) => new Response(r.body, { headers: { 'content-type': r.headers['content-type'] } }).formData();
const contents = (images) => Promise.all(images.map(async (img) => [img.name, await fs.readFile(img.localPath, 'utf8')]));
const noKeyTo = (prefix) => assert.ok(seen.filter((r) => r.path.startsWith(prefix)).every((r) => !r.headers.authorization), `no key sent to ${prefix}`);

const hasZip = (() => {
  try {
    execFileSync('zip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

async function zipOf(files) {
  const dir = await fs.mkdtemp(path.join(tmp, 'zip-'));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
  execFileSync('zip', ['-qr', 'out.zip', ...Object.keys(files)], { cwd: dir });
  return fs.readFile(path.join(dir, 'out.zip'));
}

test('MinerU: upload link, PUT, poll, zip', { skip: !hasZip && 'zip not installed' }, async () => {
  const zip = await zipOf({ 'full.md': '# Paper\n\nEnergy $E=mc^2$.\n\n![](images/fig1.jpg)\n', 'images/fig1.jpg': 'jpg1', 'layout.json': '{}' });
  const result = await run({ id: 'mineru', endpoint: `${base}/mineru/`, key: 'tok' }, {
    'POST /mineru/file-urls/batch': [{ code: 0, data: { batch_id: 'b1', file_urls: [`${base}/storage/upload`] } }],
    'PUT /storage/upload': [{}],
    'GET /mineru/extract-results/batch/b1': [{ code: 0, data: { extract_result: [{ state: 'running' }] } }, { code: 0, data: { extract_result: [{ state: 'done', full_zip_url: `${base}/storage/result.zip` }] } }],
    'GET /storage/result.zip': [zip]
  });
  const asked = sent('POST', '/mineru/file-urls/batch');
  assert.equal(asked.headers.authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(asked.body), { files: [{ name: 'source.pdf' }], model_version: 'vlm', enable_formula: true, enable_table: true });
  assert.deepEqual(sent('PUT', '/storage/upload').body, PDF);
  assert.equal(sent('GET', '/mineru/extract-results/batch/b1').headers.authorization, 'Bearer tok');
  noKeyTo('/storage/');
  assert.equal(result.markdownContent, '# Paper\n\nEnergy $E=mc^2$.\n\n![](fig1.jpg)\n');
  assert.deepEqual(await contents(result.images), [['fig1.jpg', 'jpg1']]);
});

test('Mathpix: app_id and app_key, md.zip, \\( \\[ maths as $', { skip: !hasZip && 'zip not installed' }, async () => {
  const zip = await zipOf({ 'p1.md': 'Inline \\( a+b \\) and\n\\[\nx^2 \\\\[2pt] y\n\\]\n![](./images/eq.jpg)', 'images/eq.jpg': 'eq' });
  const result = await run({ id: 'mathpix', key: 'mkey', appId: 'mid', endpoint: base }, {
    'POST /v3/pdf': [{ pdf_id: 'p1' }],
    'GET /v3/pdf/p1': [{ status: 'split' }, { status: 'completed' }],
    'GET /v3/converter/p1': [{ conversion_status: { 'md.zip': { status: 'processing' } } }, { conversion_status: { 'md.zip': { status: 'completed' } } }],
    'GET /v3/pdf/p1.md.zip': [zip]
  });
  const upload = sent('POST', '/v3/pdf');
  assert.deepEqual([upload.headers.app_id, upload.headers.app_key], ['mid', 'mkey']);
  const fields = await formOf(upload);
  assert.deepEqual(JSON.parse(fields.get('options_json')).conversion_formats, { 'md.zip': true });
  assert.deepEqual(Buffer.from(await fields.get('file').arrayBuffer()), PDF);
  assert.equal(sent('GET', '/v3/pdf/p1.md.zip').headers.app_key, 'mkey');
  assert.equal(result.markdownContent, 'Inline $a+b$ and\n$$\nx^2 \\\\[2pt] y\n$$\n![](eq.jpg)');
  assert.deepEqual(await contents(result.images), [['eq.jpg', 'eq']]);
});

test('Mistral OCR: one request with a data URI; same image IDs on two pages get two names', async () => {
  const result = await run({ id: 'mistral', endpoint: `${base}/mistral/v1`, key: 'mk' }, {
    'POST /mistral/v1/ocr': [{
      pages: [
        { index: 0, markdown: '# Title\n\n![img-0.jpeg](img-0.jpeg)', images: [{ id: 'img-0.jpeg', image_base64: `data:image/jpeg;base64,${b64('A')}` }] },
        { index: 1, markdown: 'More ![img-0.jpeg](img-0.jpeg)', images: [{ id: 'img-0.jpeg', image_base64: b64('B') }] }
      ]
    }]
  });
  const req = sent('POST', '/mistral/v1/ocr');
  assert.equal(req.headers.authorization, 'Bearer mk');
  const body = JSON.parse(req.body);
  assert.equal(body.model, 'mistral-ocr-latest');
  assert.equal(body.include_image_base64, true);
  assert.equal(body.document.type, 'document_url');
  assert.equal(body.document.document_url, `data:application/pdf;base64,${PDF.toString('base64')}`);
  assert.equal(result.markdownContent, '# Title\n\n![img-0.jpeg](img-0.jpeg)\n\nMore ![img-0.jpeg](img-0-2.jpeg)');
  assert.deepEqual(await contents(result.images), [['img-0.jpeg', 'A'], ['img-0-2.jpeg', 'B']]);
});

test('Datalab: X-API-Key, accurate mode, polls request_check_url, base64 images', async () => {
  const result = await run({ id: 'datalab', endpoint: `${base}/datalab`, key: 'dk' }, {
    'POST /datalab/convert': [{ success: true, request_id: 'r1', request_check_url: `${base}/datalab/check/r1` }],
    'GET /datalab/check/r1': [{ status: 'processing' }, { status: 'complete', success: true, markdown: 'Text $$E$$ ![](_page_0_Picture_1.jpeg)', images: { '_page_0_Picture_1.jpeg': b64('C') } }]
  });
  const upload = sent('POST', '/datalab/convert');
  assert.equal(upload.headers['x-api-key'], 'dk');
  const fields = await formOf(upload);
  assert.deepEqual([fields.get('mode'), fields.get('output_format')], ['accurate', 'markdown']);
  assert.equal(sent('GET', '/datalab/check/r1').headers['x-api-key'], 'dk');
  assert.equal(result.markdownContent, 'Text $$E$$ ![](_page_0_Picture_1.jpeg)');
  assert.deepEqual(await contents(result.images), [['_page_0_Picture_1.jpeg', 'C']]);
});

test('a key never follows a link to another host', async () => {
  // localhost and 127.0.0.1 reach the same fake, but they are different hosts
  await run({ id: 'datalab', endpoint: `${base}/datalab`, key: 'dk' }, {
    'POST /datalab/convert': [{ success: true, request_id: 'r2', request_check_url: `http://localhost:${port}/elsewhere/r2` }],
    'GET /datalab/convert/r2': [{ status: 'complete', success: true, markdown: 'ok', images: {} }]
  });
  assert.ok(!seen.some((r) => r.path.startsWith('/elsewhere')), 'the check URL on another host is not used');
  assert.equal(sent('GET', '/datalab/convert/r2').headers['x-api-key'], 'dk');
  // nor to the same host on another scheme (there, https instead of http; the fake only speaks http)
  await run({ id: 'datalab', endpoint: `${base}/datalab`, key: 'dk' }, {
    'POST /datalab/convert': [{ success: true, request_id: 'r3', request_check_url: `https://127.0.0.1:${port}/datalab/check/r3` }],
    'GET /datalab/convert/r3': [{ status: 'complete', success: true, markdown: 'ok', images: {} }]
  });
  assert.equal(sent('GET', '/datalab/convert/r3').headers['x-api-key'], 'dk');
});

test('redirects keep the key on the same origin only, and a moved POST becomes a GET', async () => {
  // a second server, as a CDN or storage host the download is sent on to
  const landed = [];
  const other = http.createServer((req, res) => {
    landed.push(req.headers);
    res.end('zip bytes');
  });
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
  try {
    routes = {
      'GET /v3/pdf/p1.md.zip': [[302, {}, { Location: '/moved/p1.md.zip' }]],
      'GET /moved/p1.md.zip': [[302, {}, { Location: `http://127.0.0.1:${other.address().port}/bucket/p1.md.zip` }]],
      'POST /convert': [[303, {}, { Location: '/convert/r1' }]],
      'GET /convert/r1': [{ status: 'ok' }],
      'PUT /upload': [[307, {}, { Location: '/upload/2' }]],
      'PUT /upload/2': [{}],
      'GET /loop': [[302, {}, { Location: '/loop' }]]
    };
    seen.length = 0;
    const keys = { app_id: 'mid', app_key: 'mkey', 'X-API-Key': 'dk', Authorization: 'Bearer t' };
    assert.equal((await download('Mathpix', `${base}/v3/pdf/p1.md.zip`, keys)).toString(), 'zip bytes');
    assert.equal(sent('GET', '/moved/p1.md.zip').headers.app_key, 'mkey');
    assert.equal(landed.length, 1);
    for (const header of ['app_id', 'app_key', 'x-api-key', 'authorization']) assert.equal(landed[0][header], undefined, `${header} stays behind`);

    await send('Datalab', `${base}/convert`, { method: 'POST', headers: keys, body: 'pdf' });
    assert.deepEqual([sent('GET', '/convert/r1').body.length, sent('GET', '/convert/r1').headers['x-api-key']], [0, 'dk']);
    await send('MinerU', `${base}/upload`, { method: 'PUT', body: 'pdf' });
    assert.equal(sent('PUT', '/upload/2').body.toString(), 'pdf');
    await assert.rejects(send('Docling', `${base}/loop`), { message: 'Docling returned HTTP 302: {}' });
  } finally {
    other.close();
  }
});

test('LlamaParse: agentic tier, poll, then markdown and presigned images without the key', async () => {
  const result = await run({ id: 'llamaparse', endpoint: `${base}/llama`, key: 'llx' }, {
    'POST /llama/api/v2/parse/upload': [{ id: 'j1', status: 'PENDING' }],
    'GET /llama/api/v2/parse/j1': [{ job: { id: 'j1', status: 'RUNNING' } }, { job: { id: 'j1', status: 'COMPLETED' } }],
    'GET /llama/api/v2/parse/j1?expand=markdown_full,images_content_metadata': [{
      job: { id: 'j1', status: 'COMPLETED' },
      markdown_full: 'See \\(x\\).\n\n![](img_p0_1.png)',
      images_content_metadata: { images: [{ filename: 'img_p0_1.png', presigned_url: `${base}/storage/img_p0_1.png?sig=1` }] }
    }],
    'GET /storage/img_p0_1.png?sig=1': [Buffer.from('png')]
  });
  const upload = sent('POST', '/llama/api/v2/parse/upload');
  assert.equal(upload.headers.authorization, 'Bearer llx');
  const configuration = JSON.parse((await formOf(upload)).get('configuration'));
  assert.deepEqual([configuration.tier, configuration.output_options], ['agentic', { images_to_save: ['layout'] }]);
  noKeyTo('/storage/');
  assert.equal(result.markdownContent, 'See $x$.\n\n![](img_p0_1.png)');
  assert.deepEqual(await contents(result.images), [['img_p0_1.png', 'png']]);
});

test('PaddleOCR-VL: job, poll, JSONL pages with <img> links', async () => {
  const line = (text, images) => JSON.stringify({ result: { layoutParsingResults: [{ markdown: { text, images } }] } });
  const jsonl = [line('## One\n<img src="imgs/a.jpg" alt="Image" />', { 'imgs/a.jpg': `${base}/storage/a.jpg` }), line('$$y$$', {})].join('\n');
  const result = await run({ id: 'paddleocr', endpoint: `${base}/paddle`, key: 'pk' }, {
    'POST /paddle/api/v2/ocr/jobs': [{ code: 0, msg: 'success', data: { jobId: 'pj' } }],
    'GET /paddle/api/v2/ocr/jobs/pj': [{ code: 0, data: { state: 'running' } }, { code: 0, data: { state: 'done', resultUrl: { jsonUrl: `${base}/storage/res.jsonl` } } }],
    'GET /storage/res.jsonl': [Buffer.from(jsonl)],
    'GET /storage/a.jpg': [Buffer.from('a')]
  });
  const upload = sent('POST', '/paddle/api/v2/ocr/jobs');
  assert.equal(upload.headers.authorization, 'Bearer pk');
  assert.equal((await formOf(upload)).get('model'), 'PaddleOCR-VL-1.5');
  noKeyTo('/storage/');
  assert.equal(result.markdownContent, '## One\n<img src="a.jpg" alt="Image" />\n\n$$y$$');
  assert.deepEqual(await contents(result.images), [['a.jpg', 'a']]);
});

test('Docling: async convert with formulas and embedded images; no key header without a key', async () => {
  const result = await run({ id: 'docling', endpoint: `${base}/docling` }, {
    'POST /docling/v1/convert/file/async': [{ task_id: 't1', task_status: 'pending' }],
    'GET /docling/v1/status/poll/t1': [{ task_status: 'started' }, { task_status: 'success' }],
    'GET /docling/v1/result/t1': [{ status: 'success', document: { md_content: `## Intro\n\n$$a$$\n\n![Image](data:image/png;base64,${b64('D')})` } }]
  });
  const upload = sent('POST', '/docling/v1/convert/file/async');
  assert.equal(upload.headers['x-api-key'], undefined);
  const fields = await formOf(upload);
  assert.deepEqual([fields.get('to_formats'), fields.get('image_export_mode'), fields.get('do_formula_enrichment')], ['md', 'embedded', 'true']);
  assert.ok(fields.get('files'));
  assert.equal(result.markdownContent, '## Intro\n\n$$a$$\n\n![Image](image-1.png)');
  assert.deepEqual(await contents(result.images), [['image-1.png', 'D']]);
});

test('errors name the parser, the HTTP status and the reply', async () => {
  await assert.rejects(
    run({ id: 'mineru', endpoint: `${base}/mineru`, key: 'bad' }, { 'POST /mineru/file-urls/batch': [[401, { msg: 'token expired' }]] }),
    { message: 'MinerU returned HTTP 401: {"msg":"token expired"}' }
  );
  await assert.rejects(
    run({ id: 'mineru', endpoint: `${base}/mineru`, key: 'tok' }, {
      'POST /mineru/file-urls/batch': [{ code: 0, data: { batch_id: 'b9', file_urls: [`${base}/storage/upload`] } }],
      'PUT /storage/upload': [{}],
      'GET /mineru/extract-results/batch/b9': [{ code: 0, data: { extract_result: [{ state: 'failed', err_msg: 'encrypted PDF' }] } }]
    }),
    { message: 'MinerU couldn’t read the PDF: encrypted PDF.' }
  );
  // a bad token comes back as HTTP 200 with a code, in either wrapper
  await assert.rejects(run({ id: 'paddleocr', endpoint: `${base}/paddle`, key: 'bad' }, { 'POST /paddle/api/v2/ocr/jobs': [{ code: 10003, msg: 'token invalid', data: null }] }), {
    message: 'PaddleOCR-VL returned an error: token invalid'
  });
  await assert.rejects(
    run({ id: 'paddleocr', endpoint: `${base}/paddle`, key: 'pk' }, {
      'POST /paddle/api/v2/ocr/jobs': [{ code: 0, data: { jobId: 'pk1' } }],
      'GET /paddle/api/v2/ocr/jobs/pk1': [{ errorCode: 401, errorMsg: 'token expired' }]
    }),
    { message: 'PaddleOCR-VL returned an error: token expired' }
  );
  await assert.rejects(run({ id: 'custom', protocol: 'docling', endpoint: 'http://127.0.0.1:9' }, {}), /^Error: Couldn’t reach Docling \(custom\) at 127\.0\.0\.1:9 \(/);
  await assert.rejects(run({ id: 'mistral', endpoint: `${base}/mistral/v1`, key: 'mk' }, { 'POST /mistral/v1/ocr': [{ pages: [{ markdown: '  ' }] }] }), {
    message: 'Mistral OCR found no text in the PDF.'
  });
});

test('a PDF over the parser’s limit is refused before it is sent', async () => {
  const big = path.join(tmp, 'big.pdf');
  await fs.writeFile(big, '');
  await fs.truncate(big, 51 * 1048576);
  seen.length = 0;
  await assert.rejects(parsePdf(big, resolveParserConfig({ id: 'paddleocr', endpoint: `${base}/paddle`, key: 'pk' }), path.join(tmp, 'out-big')), {
    message: 'The PDF is too large for PaddleOCR-VL (51 MB; the limit is 50 MB).'
  });
  assert.equal(seen.length, 0);
});

test('the parser, its address and its key are checked before a transfer starts', () => {
  assert.throws(() => resolveParserConfig({ id: 'nope' }), { message: 'Unknown parser: nope.' });
  assert.throws(() => resolveParserConfig({ id: 'custom', protocol: 'nope', endpoint: base }), { message: 'Unknown parser: nope.' });
  assert.throws(() => resolveParserConfig({ id: 'docling', endpoint: 'file:///etc/passwd' }), { message: 'The address for Docling must start with http:// or https://.' });
  assert.throws(() => resolveParserConfig({ id: 'mistral', endpoint: 'not a url', key: 'k' }), /must start with http/);
  assert.throws(() => resolveParserConfig({ id: 'mathpix', key: 'k' }), { message: 'Add your Mathpix app ID and app key in Settings → Template transfer first.' });
  assert.throws(() => resolveParserConfig({ id: 'paddleocr' }), { message: 'Add your PaddleOCR-VL access token in Settings → Template transfer first.' });
  assert.throws(() => resolveParserConfig({ id: 'custom', protocol: 'docling' }), { message: 'Add the parser’s address in Settings → Template transfer first.' });
  // self-hosted servers may need no key
  assert.equal(resolveParserConfig({ id: 'docling' }).endpoint, 'http://localhost:5001');
  assert.deepEqual(resolveParserConfig({ id: 'custom', protocol: 'mistral', endpoint: 'http://gpu.local:8000/v1/' }), {
    id: 'custom', protocol: 'mistral', name: 'Mistral OCR (custom)', endpoint: 'http://gpu.local:8000/v1', key: '', appId: ''
  });
});

test('the .env MinerU token only goes to the .env MinerU host', () => {
  const saved = { ...process.env };
  try {
    process.env.SPECTRUM_MINERU_TOKEN = 'env-tok';
    delete process.env.SPECTRUM_MINERU_API_BASE;
    assert.deepEqual(resolveParserConfig({}), { id: 'mineru', protocol: 'mineru', name: 'MinerU', endpoint: 'https://mineru.net/api/v4', key: 'env-tok', appId: '' });
    assert.equal(resolveParserConfig({ id: 'mineru', endpoint: 'https://mineru.net/api/v4/' }).key, 'env-tok');
    // same host, but plain http: anyone on the network could read it
    assert.throws(() => resolveParserConfig({ id: 'mineru', endpoint: 'http://mineru.net/api/v4' }), /Add your MinerU token/);
    assert.throws(() => resolveParserConfig({ id: 'mineru', endpoint: 'https://mirror.example/api/v4' }), /Add your MinerU token/);
    assert.equal(resolveParserConfig({ id: 'custom', protocol: 'mineru', endpoint: 'https://mirror.example/api/v4' }).key, '');
    assert.throws(() => resolveParserConfig({ id: 'mistral' }), /Add your Mistral OCR API key/);

    process.env.SPECTRUM_MINERU_API_BASE = 'https://mirror.example/api/v4';
    assert.deepEqual([resolveParserConfig({}).endpoint, resolveParserConfig({}).key], ['https://mirror.example/api/v4', 'env-tok']);
    assert.throws(() => resolveParserConfig({ id: 'mineru', endpoint: 'https://mineru.net/api/v4' }), /Add your MinerU token/);
    // a key typed in Settings goes to the endpoint it was typed for, not the .env one
    assert.deepEqual([resolveParserConfig({ key: 'mine' }).endpoint, resolveParserConfig({ key: 'mine' }).key], ['https://mineru.net/api/v4', 'mine']);
  } finally {
    for (const k of ['SPECTRUM_MINERU_TOKEN', 'SPECTRUM_MINERU_API_BASE']) {
      if (k in saved) process.env[k] = saved[k];
      else delete process.env[k];
    }
  }
});

test('maths delimiters become $ and $$; line breaks, code and escaped citations stay', () => {
  assert.equal(dollarMaths('\\( x \\) \\[y\\] a \\\\[3pt] b \\\\(c)'), '$x$ $$y$$ a \\\\[3pt] b \\\\(c)');
  const code = '```python\nm = re.match(r"\\((\\d+)\\)", s)\n```\nWith `\\[a-z\\]+` and \\(x\\).';
  assert.equal(dollarMaths(code), code.replace('\\(x\\)', '$x$'));
  assert.equal(dollarMaths('see \\[1\\] and \\[2, 3–5\\], then \\[ 2x \\]'), 'see \\[1\\] and \\[2, 3–5\\], then $$ 2x $$');
});
