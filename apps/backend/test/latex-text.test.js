import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { latexToText, unicodeToLatex, stopLatexConverter } from '../src/latex/conversion.js';
import { escapeTexText, withoutComments } from '../src/latex/text.js';
import { normaliseTitle, buildBibIndex, findDuplicate, pdfTexSafe, decodeEntities, toBibtex } from '../src/services/referenceService.js';
import { parseSectionOutline } from '../src/utils/texUtils.js';
import { suggestCitations } from '../src/services/citationService.js';

after(stopLatexConverter);

test('pylatexenc decodes reference text without modifying the main JavaScript runtime', () => {
  const builtins = [Array.prototype, String.prototype, Number.prototype, Object.prototype];
  const before = builtins.map(Object.getOwnPropertyDescriptors);
  for (const [tex, text] of [
    [String.raw`Garc\'{i}a and Schr\"{o}dinger`, 'García and Schrödinger'],
    [String.raw`{OpenAI} and \emph{Nested \textbf{Title}}`, 'OpenAI and Nested Title'],
    [String.raw`\alpha{} and $\beta^2$`, 'α and β²'],
    [String.raw`\href{https://example.com}{Visible title}`, 'Visible title'],
    [String.raw`\LaTeX{} and \TeX{}`, 'LaTeX and TeX'],
    ["``Loop engineering'' and O'Brien's work", "“Loop engineering” and O'Brien's work"],
    ['Unclosed {title', 'Unclosed title']
  ]) assert.equal(latexToText(tex), text);
  assert.deepEqual(builtins.map(Object.getOwnPropertyDescriptors), before);
  assert.equal(latexToText('plain 中文 title'), 'plain 中文 title');
  const oversized = '{' + 'a'.repeat(65_536);
  assert.equal(latexToText(oversized), oversized, 'oversized input stays intact');
});

test('real TeX decoding matches accented and Greek titles without collapsing different symbols', () => {
  const index = buildBibIndex([{ file: 'r.bib', text: String.raw`@article{G,
    title = {Schr\"{o}dinger and $\alpha$}, year = {2026}
  }` }]);
  assert.equal(index[0].displayTitle, 'Schrödinger and α');
  assert.equal(findDuplicate(index, { title: normaliseTitle('Schrödinger and α'), year: '2026' })?.key, 'G');
  assert.equal(findDuplicate(index, { title: normaliseTitle('Schrödinger and β'), year: '2026' }), null);
});

test('conversion cannot read included files or run shell commands', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'spectrum-text-security-'));
  try {
    const secret = path.join(dir, 'secret.tex');
    const output = path.join(dir, 'executed');
    writeFileSync(secret, 'SPECTRUM_PRIVATE_CONTENT');
    for (const command of ['input', 'include']) assert.equal(latexToText(`\\${command}{${secret}}Visible`), 'Visible');
    assert.doesNotMatch(latexToText(`\\write18{touch ${output}}`), /SPECTRUM_PRIVATE_CONTENT/);
    assert.equal(existsSync(output), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('literal TeX escaping retains every special character', () => {
  const text = String.raw`Path C:\notes\draft ~ ^ {title} $5 & 10% #1 _`;
  const tex = escapeTexText(text);
  assert.equal(latexToText(tex), text);
  assert.match(tex, /\\textbackslash\{\}/);
  assert.match(tex, /\\textasciitilde\{\}/);
  assert.match(tex, /\\textasciicircum\{\}/);
});

test('shared comment stripping handles escaped percent signs and slash parity', () => {
  for (let count = 0; count <= 5; count++) {
    const slashes = '\\'.repeat(count);
    assert.equal(withoutComments(`before ${slashes}% tail\r\nafter`), `before ${slashes}${count % 2 ? '% tail' : ''}\r\nafter`);
  }
  assert.equal(withoutComments('a\\%b\n% comment\nc'), 'a\\%b\n\nc');
});

test('template transfer uses one shared outline parser', () => {
  assert.deepEqual(parseSectionOutline(String.raw`\section{ Intro }\subsection*{Methods}\subsubsection{Results}`), [
    { level: 'section', title: 'Intro' }, { level: 'subsection', title: 'Methods' }, { level: 'subsubsection', title: 'Results' }
  ]);
});

test('fallback citation queries retain text inside TeX commands', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.tavily.com');
    assert.equal(JSON.parse(options.body).query, 'Study neural networks with α signals.');
    return new Response(JSON.stringify({ results: [{ title: 'A study', url: 'https://example.com/study' }] }));
  });
  const result = await suggestCitations({ text: String.raw`Study \emph{neural networks} with $\alpha$ signals.`,
    llmConfig: { endpoint: 'https://model.invalid/v1', apiKey: '', model: 'test' }, searchConfig: { provider: 'tavily', apiKey: 'test' } });
  assert.deepEqual(result.queries, ['Study neural networks with α signals.']);
  assert.equal(result.papers.length, 1);
});

test('pylatexenc replaces the Greek mapping while retaining compound Latin coverage', () => {
  for (const symbol of ['α', 'β', 'Ω', 'θ', 'ϕ', '∑']) assert.equal(latexToText(unicodeToLatex(symbol)), symbol);
  assert.equal(latexToText(pdfTexSafe('Nguyễn, Ω and β')), 'Nguyễn, Ω and β');
  assert.equal(pdfTexSafe('“Quotes” – 中文'), '“Quotes” – 中文');
});

test('generated Greek and Vietnamese references compile with pdfLaTeX and APA 7', (t) => {
  for (const command of ['pdflatex', 'biber']) if (spawnSync(command, ['--version'], { windowsHide: true }).status !== 0) return t.skip(`needs ${command}`);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'spectrum-encoded-bib-'));
  try {
    writeFileSync(path.join(dir, 'references.bib'), toBibtex({ type: 'article-journal', title: 'Greek β and Ω', author: [{ family: 'Nguyễn', given: 'An' }], issued: { 'date-parts': [[2026]] } }, 'Nguyen2026'));
    writeFileSync(path.join(dir, 'main.tex'), String.raw`\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage[backend=biber,style=apa]{biblatex}
\addbibresource{references.bib}
\begin{document}\nocite{*}\printbibliography\end{document}`);
    for (const [command, args] of [
      ['pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'main.tex']],
      ['biber', ['main']],
      ['pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'main.tex']]
    ]) {
      const result = spawnSync(command, args, { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
    }
    assert.doesNotMatch(readFileSync(path.join(dir, 'main.log'), 'utf8'), /Missing character|Unicode character .*not set up/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the standard HTML decoder supports full named entities and invalid code points', () => {
  assert.equal(decodeEntities('&CounterClockwiseContourIntegral; &NotEqualTilde; &#x1F9EA; &#0; &doesnotexist;'), '∳ ≂̸ 🧪 � &doesnotexist;');
  assert.equal(decodeEntities('https://example.com/?a=1&notit=2&amp;b=3'), 'https://example.com/?a=1&notit=2&b=3');
});
