// Tools › Review's routes: a document's PDF against its source, the .bib entries Preflight checks and the AI review
// (one read-only call, its anchors checked, Cancel stopping it). In-process, against a scripted model on this computer
// and throwaway data and projects. No network. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-review-')));
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  USERPROFILE: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_LLM_ENDPOINT: '',
  SPECTRUM_LLM_API_KEY: ''
});
const write = async (file, text) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
};

const { default: Fastify } = await import('fastify');
const { registerReviewRoutes } = await import('../src/routes/review.js');
const { createProject } = await import('../src/services/projectService.js');
const { REVIEW_BUDGET, anchor, readReview } = await import('../src/services/reviewService.js');
const { inlineInputs } = await import('../src/utils/texUtils.js');
const app = Fastify();
app.setErrorHandler(async (err, req, reply) => reply.code(err.statusCode || 500).send({ ok: false, error: err.message }));
registerReviewRoutes(app);

const MAIN = String.raw`\documentclass{article}
\begin{document}
% \input{old}
\section{Introduction}
We train a model on many images.
\input{sections/intro}
Our method is faster than every earlier one.
\bibliography{refs}
\end{document}
`;
const INTRO = String.raw`\section{Method}
The network has three layers.
It reaches 93.2\% accuracy on the test set.
`;
const BIB = `@article{smith20,
  author = {Smith, Ann},
  title = {Fast Models},
  journal = {Journal of Tests},
  year = {2020},
  doi = {10.1234/fast}
}
@misc{smith-again,
  title = {Fast models},
  doi = {10.1234/FAST}
}
@book{jones19, title = {A Book}, year = 2019}
`;

const calls = [];
// what the scripted model answers next; "hold" waits until the request is closed
let answer = '';
let closed = null;
let mock;
let base;
before(async () => {
  mock = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push(JSON.parse(body));
      if (answer === 'hold') {
        res.on('close', () => closed?.());
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: answer } }] }));
    });
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${mock.address().port}/v1`;
});
after(async () => {
  mock?.closeAllConnections();
  mock?.close();
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

const project = (name, files) =>
  createProject({
    name,
    populate: async (root) => {
      for (const [file, text] of Object.entries(files)) await write(path.join(root, file), text);
    }
  });
const review = async (body) => {
  const res = await app.inject({ url: '/api/review', method: 'POST', payload: { llmConfig: { endpoint: base, apiKey: 'test', model: 'reviewer' }, ...body } });
  return { status: res.statusCode, json: res.json() };
};

test('review/state compares the PDF with every file the document reads and lists the .bib entries', async () => {
  const p = await project('Review state', { 'main.tex': MAIN, 'sections/intro.tex': INTRO, 'refs.bib': BIB, 'notes.txt': 'not read' });
  const state = async (query = '') => (await app.inject({ url: `/api/projects/${p.id}/review/state?doc=main.tex${query}` })).json();
  const first = await state();
  assert.equal(first.pdfAt, null, 'never compiled');
  assert.equal(typeof first.sourceAt, 'number');
  assert.equal(first.bib, undefined, 'the entries only when asked for');

  const later = new Date(Date.now() + 60_000);
  await write(path.join(p.path, 'main.pdf'), '%PDF-1.5');
  await fs.utimes(path.join(p.path, 'main.pdf'), later, later);
  const built = await state();
  assert.ok(built.pdfAt > built.sourceAt, 'the PDF is newer than the source');

  // a file the document \inputs changes; a file it doesn't read changes nothing
  const evenLater = new Date(Date.now() + 120_000);
  await fs.utimes(path.join(p.path, 'notes.txt'), evenLater, evenLater);
  assert.equal((await state()).sourceAt, built.sourceAt);
  await fs.utimes(path.join(p.path, 'sections/intro.tex'), evenLater, evenLater);
  assert.ok((await state()).sourceAt > built.pdfAt, 'an \\input file newer than the PDF');

  const { bib } = await state('&bib=1');
  assert.deepEqual(
    bib.map((e) => [e.key, e.file, e.line, e.type, e.duplicateOf ?? null]),
    [
      ['smith20', 'refs.bib', 1, 'article', null],
      ['smith-again', 'refs.bib', 8, 'misc', { key: 'smith20', file: 'refs.bib', by: 'DOI' }],
      ['jones19', 'refs.bib', 12, 'book', null]
    ]
  );
  assert.deepEqual(bib[2].fields, ['title', 'year']);
  assert.equal(bib[0].doi, '10.1234/fast');
  assert.equal(bib[0].title, 'Fast Models');

  const res = await app.inject({ url: `/api/projects/${p.id}/review/state?doc=refs.bib` });
  assert.equal(res.statusCode, 400, 'only a .tex document');
});

test('the files a document reads include \\import, \\subimport and \\input with a space', async () => {
  const p = await project('Imports', {
    'main.tex': '\\documentclass{article}\n\\usepackage{import}\n\\begin{document}\n\\import{sections/}{method}\n\\input {sections/results}\n\\input{chapters/one}\n\\end{document}\n',
    'sections/method.tex': 'Method.\n',
    'sections/results.tex': 'Results.\n',
    'chapters/one.tex': '\\subimport{parts/}{extra}\n',
    'chapters/parts/extra.tex': 'Extra.\n'
  });
  const files = new Set();
  await inlineInputs(p.path, 'main.tex', { stripComments: true, files });
  assert.deepEqual([...files].map((f) => f.split(path.sep).join('/')), ['main.tex', 'sections/method.tex', 'sections/results.tex', 'chapters/one.tex', 'chapters/parts/extra.tex']);
  // so a PDF older than one of them is compiled again before a review
  const later = new Date(Date.now() + 60_000);
  await fs.utimes(path.join(p.path, 'chapters/parts/extra.tex'), later, later);
  assert.equal((await app.inject({ url: `/api/projects/${p.id}/review/state?doc=main.tex` })).json().sourceAt, later.getTime());
});

test('the AI review reads the document in order, is told what Preflight found and checks each anchor', async () => {
  const p = await project('AI review', { 'main.tex': MAIN, 'sections/intro.tex': INTRO, 'refs.bib': BIB });
  answer = '```json\n' + JSON.stringify({
    summary: 'A short paper about models.',
    strengths: ['Clear method', 7],
    score: 6,
    confidence: 4,
    findings: [
      // three lines off: moved to the line the quote is on
      { severity: 'major', category: 'Citation needed', file: 'main.tex', line: 4, quote: 'faster than every   earlier one', issue: 'An unsupported claim.', suggestion: 'Cite a comparison.' },
      // named by its file name alone, and quoted across two lines
      { severity: 'minor', category: 'Data', file: 'intro.tex', line: 2, quote: 'has three layers. It reaches 93.2', issue: 'The accuracy differs from the abstract.', suggestion: '' },
      { severity: 'critical', category: 'Logic', file: 'main.tex', line: 5, quote: 'words that are nowhere in the file', issue: 'Something.', suggestion: '' },
      { severity: 'note', category: 'Style', file: 'main.tex', line: 5, quote: 'We train a model', issue: '' }
    ],
    limits: ['The figures could not be seen.']
  }) + '\n```';
  calls.length = 0;
  const { status, json } = await review({
    projectId: p.id,
    doc: 'main.tex',
    activePath: 'main.tex',
    reasoningEffort: 'high',
    findings: [{ group: 'compile', severity: 'warning', message: 'Overfull box: 12pt too wide', file: 'main.tex', line: 5 }]
  });
  assert.equal(status, 200, json.error);
  assert.equal(json.ok, true, json.error);

  assert.equal(calls.length, 1, 'one call');
  const sent = calls[0];
  assert.equal(sent.tools, undefined, 'no tools: the review can’t edit');
  assert.match(sent.messages[0].content, /never edit files/);
  const user = sent.messages[1].content;
  assert.ok(user.indexOf('=== main.tex ===') < user.indexOf('=== sections/intro.tex ==='), 'in reading order');
  assert.match(user, /^1\| \\documentclass\{article\}$/m, 'lines numbered');
  assert.match(user, /^3\| % \\input\{old\}$/m, 'comments kept as they are, so the numbers match');
  assert.doesNotMatch(user, /=== old/, 'a commented-out \\input isn’t followed');
  assert.match(user, /Bibliography keys: smith20, smith-again, jones19\./);
  assert.match(user, /Already reported:\n- warning: Overfull box: 12pt too wide \(main\.tex, line 5\)/);

  assert.deepEqual(
    json.findings.map((f) => [f.severity, f.file, f.line, f.anchored]),
    [
      ['major', 'main.tex', 7, true],
      ['minor', 'sections/intro.tex', 2, true],
      ['note', 'main.tex', 5, false]
    ],
    'a finding with no issue is dropped and an unknown severity is a note'
  );
  assert.deepEqual(json.strengths, ['Clear method']);
  assert.equal(json.score, 6);
  assert.equal(json.confidence, 4);
  assert.deepEqual(json.limits, ['The figures could not be seen.']);
  assert.deepEqual(json.files, ['main.tex', 'sections/intro.tex']);
  assert.equal(await fs.readFile(path.join(p.path, 'main.tex'), 'utf8'), MAIN, 'nothing is written');

  answer = 'I would rather not.';
  const unreadable = await review({ projectId: p.id, doc: 'main.tex' });
  assert.equal(unreadable.json.ok, false);
  assert.match(unreadable.json.error, /couldn’t be read as a review/);

  const noKey = await review({ projectId: p.id, doc: 'main.tex', llmConfig: { endpoint: 'https://api.example.com/v1', model: 'm' } });
  assert.equal(noKey.json.ok, false);
  assert.match(noKey.json.error, /No AI model is set up/);

  assert.equal((await review({ projectId: p.id, doc: 'missing.tex' })).json.ok, false);
});

test('a document over the budget is reviewed a file at a time, and the limits say so', async () => {
  const long = 'A line of the long chapter that goes on and on.\n'.repeat(Math.ceil(REVIEW_BUDGET / 40));
  const p = await project('Long review', { 'main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{chapter}\n\\end{document}\n', 'chapter.tex': long });
  answer = JSON.stringify({ summary: 'ok', findings: [] });
  calls.length = 0;
  const open = await review({ projectId: p.id, doc: 'main.tex', activePath: 'main.tex' });
  assert.equal(open.json.ok, true, open.json.error);
  assert.deepEqual(open.json.files, ['main.tex']);
  assert.match(open.json.limits[0], /only main\.tex was reviewed/);
  assert.doesNotMatch(calls[0].messages[1].content, /=== chapter\.tex/);

  const cut = await review({ projectId: p.id, doc: 'main.tex', activePath: 'chapter.tex' });
  assert.deepEqual(cut.json.files, ['chapter.tex']);
  assert.match(cut.json.limits[0], /only chapter\.tex up to line \d+ was reviewed/);
  assert.ok(calls[1].messages[1].content.length < REVIEW_BUDGET + 10_000);
});

test('a .pgf figure the document \\inputs isn’t sent, so it can’t push the rest over the budget', async () => {
  const pgf = '\\begin{pgfpicture}\n' + '\\pgfpathlineto{\\pgfqpoint{1.0in}{2.0in}}%\n'.repeat(Math.ceil(REVIEW_BUDGET / 40)) + '\\end{pgfpicture}\n';
  const p = await project('Figure review', {
    'main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{figures/bode.pgf}\n\\input{discussion}\n\\end{document}\n',
    'figures/bode.pgf': pgf,
    'discussion.tex': '\\section{Discussion}\nThe gain falls off.\n'
  });
  answer = JSON.stringify({ summary: 'ok', findings: [] });
  calls.length = 0;
  const { json } = await review({ projectId: p.id, doc: 'main.tex', activePath: 'main.tex' });
  assert.equal(json.ok, true, json.error);
  assert.deepEqual(json.files, ['main.tex', 'discussion.tex']);
  assert.deepEqual(json.limits, ['figures/bode.pgf is figure or data code and wasn’t sent.']);
  const user = calls[0].messages[1].content;
  assert.match(user, /The gain falls off/);
  assert.doesNotMatch(user, /pgfpathlineto|=== figures/);
});

test('closing the request stops the model call', async () => {
  const p = await project('Cancel review', { 'main.tex': MAIN, 'sections/intro.tex': INTRO });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const stopped = new Promise((resolve) => (closed = resolve));
  answer = 'hold';
  calls.length = 0;
  const cancel = new AbortController();
  const asked = fetch(`http://127.0.0.1:${app.server.address().port}/api/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: p.id, doc: 'main.tex', llmConfig: { endpoint: base, apiKey: 'test', model: 'reviewer' } }),
    signal: cancel.signal
  });
  while (!calls.length) await new Promise((r) => setTimeout(r, 20));
  cancel.abort();
  await assert.rejects(asked, { name: 'AbortError' });
  await Promise.race([stopped, new Promise((r) => setTimeout(r, 5000)).then(() => assert.fail('the model call carried on'))]);
});

test('an anchor looks about 10 lines either way, nearest first', () => {
  const files = [{ path: 'a.tex', lines: Array.from({ length: 40 }, (_, i) => (i === 4 || i === 30 ? 'the same words' : `line ${i + 1}`)) }];
  const at = (line) => anchor({ file: 'a.tex', line, quote: 'The  same words' }, files);
  assert.deepEqual([at(8).line, at(8).anchored], [5, true]);
  assert.deepEqual([at(28).line, at(28).anchored], [31, true]);
  assert.deepEqual([at(18).line, at(18).anchored], [18, false], 'too far from either');
  assert.equal(anchor({ file: 'b.tex', line: 5, quote: 'the same words' }, files).anchored, false);
});

test('a model’s answer is read past its thinking, prose, LaTeX it didn’t escape and a capital severity', () => {
  const files = [{ path: 'main.tex', lines: ['\\section{Intro}', 'As \\cite{smith20} shows, see \\ref{tab:main} for more.', 'Done.'] }];
  // the JSON as a model writes it, with \cite and \ref left single and a trailing comma
  const body = String.raw`{"summary": "Fine.", "findings": [
    {"severity": "Major", "file": "main.tex", "line": 2, "quote": "As \cite{smith20} shows", "issue": "Unsupported."},
    {"severity": "Minor", "file": "main.tex", "line": 2, "quote": "see \ref{tab:main} for more", "issue": "Vague."},
    {"severity": "Minor", "file": "main.tex", "line": 2, "quote": "see \ref{tab:main} for more", "issue": "Vague."},
  ]}`;
  const review = readReview(`<think>Let me plan {summary, findings} first.</think>Here is my review [as JSON]:\n${body}`, files);
  assert.deepEqual(
    review.findings.map((f) => [f.severity, f.line, f.anchored]),
    [
      ['major', 2, true],
      ['minor', 2, true]
    ]
  );
  assert.equal(review.summary, 'Fine.');
  assert.equal(readReview('No review today.', files), null);

  // braces in prose before the JSON
  assert.equal(readReview(`I reviewed \\section{Intro} and the rest.\n\`\`\`json\n${JSON.stringify({ summary: 'Read.', findings: [] })}\n\`\`\``, files)?.summary, 'Read.');
});
