import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { maskLatex, proseWords } from '../src/latex/mask.js';

// the word list lives in a scratch data folder; the dictionaries and engines are the repo's own
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'spectrum-language-'));
process.env.SPECTRUM_DATA_DIR = dataDir;
let spell;
let grammar;

before(async () => {
  spell = await import('../src/services/spellService.js');
  grammar = await import('../src/services/grammarService.js');
});
after(async () => {
  await spell.stopSpeller();
  await grammar.stopGrammar();
  rmSync(dataDir, { recursive: true, force: true });
});

const words = (tex) => proseWords(maskLatex(tex)).map(([w]) => w);

test('the mask keeps every position', () => {
  const tex = '\\documentclass{article}\n\\begin{document}\nA $x^2$ test.\n\\end{document}\n';
  const masked = maskLatex(tex);
  assert.equal(masked.length, tex.length);
  // a newline only ever stays or becomes a space (where a line of pure markup joins the next)
  assert.ok([...masked].every((c, i) => c !== '\n' || tex[i] === '\n'), 'no newline moves');
});

test('the mask keeps prose and drops markup', () => {
  const tex = [
    '\\documentclass{article}\\usepackage{amsmath}',
    '\\begin{document}',
    '\\section[Short]{Results of the \\emph{first} trial}\\label{sec:results}',
    'As shown by \\citet[p.~4]{smith2020} and in Figure~\\ref{fig:one}, the \\textbf{colour} changes.%  a comment here',
    'We measured $\\alpha + \\beta$ and',
    '\\begin{equation}\\label{eq:x} E = mc^2 \\end{equation}',
    'then \\[ y = mx \\] holds \\(z\\) times.\\footnote{See the \\href{https://example.org}{project page}.}',
    '\\begin{figure}[htbp]\\includegraphics[width=0.5\\textwidth]{figs/plot}\\caption{A {nested} caption}\\end{figure}',
    '\\begin{tabular}{lll} one & two \\\\ \\end{tabular}',
    '\\begin{verbatim}code_here = 1\\end{verbatim}',
    "\\verb|x_y| and ``quoted'' words, \\LaTeX\\ too.",
    '\\end{document}',
    'trailing'
  ].join('\n');
  assert.deepEqual(words(tex), [
    'Short', 'Results', 'of', 'the', 'first', 'trial',
    'As', 'shown', 'by', 'and', 'in', 'Figure', 'the', 'colour', 'changes',
    'We', 'measured', 'x', 'and',
    'then', 'holds', 'x', 'times', 'See', 'the', 'project', 'page',
    'A', 'nested', 'caption',
    'one', 'two',
    'and', 'quoted', 'words', 'LaTeX', 'too'
  ]);
});

test('a line that was all markup joins its neighbours instead of breaking the paragraph', () => {
  const tex = 'The sentence goes\n\\label{x}\non here.\n\nNext paragraph.';
  const masked = maskLatex(tex);
  assert.equal(masked.split('\n').length, 4, 'one line joined, the blank line kept');
  assert.match(masked, /goes\n\s+on here\.\n\nNext/);
});

test('unknown commands: a key is dropped, prose is kept', () => {
  assert.deepEqual(words('\\begin{document}\\mymacro{key-thing} and \\myemph{some words}\\end{document}'), ['and', 'some', 'words']);
});

test('spelling follows Australian English', async () => {
  const status = await spell.spellStatus();
  assert.equal(status.available, true, status.error);
  const misspelt = await spell.checkWords(['colour', 'color', 'organise', 'organize', 'defence', 'defense', 'arvo', 'Wagga', 'recieve', 'CSIRO', 'LaTeX', 'iPhone', 'x2'], undefined);
  assert.deepEqual(misspelt.sort(), ['color', 'defense', 'organize', 'recieve']);
  assert.ok((await spell.suggestWord('recieve')).includes('receive'));
  assert.ok((await spell.suggestWord('organize')).includes('organise'));
});

test('a word added to the list is accepted, and removed again', async () => {
  assert.deepEqual(await spell.checkWords(['Spectrumish'], undefined), ['Spectrumish']);
  const lists = await spell.changeWord({ word: 'Spectrumish' });
  assert.deepEqual(lists.global, ['Spectrumish']);
  assert.deepEqual(await spell.checkWords(['Spectrumish'], undefined), []);
  await spell.changeWord({ word: 'Spectrumish', remove: true });
  assert.deepEqual(await spell.checkWords(['Spectrumish'], undefined), ['Spectrumish']);
  await assert.rejects(() => spell.changeWord({ word: 'two words' }), /single word/);
});

test('asking for Harper’s status doesn’t start it; the first check does', async () => {
  await grammar.stopGrammar();
  const status = await grammar.grammarStatus();
  assert.deepEqual([status.available, status.started, status.engine, status.diagnostics.assets.integrity], [true, false, 'Harper', 'verified']);
  await grammar.checkGrammar({ text: 'This is a apple.' });
  assert.equal((await grammar.grammarStatus()).started, undefined, 'running now');
});

test('checkers:verify checks both engines and their files, and fails on a file that differs', { timeout: 120_000 }, () => {
  const repo = path.join(import.meta.dirname, '..', '..', '..');
  const verify = (env = {}) => spawnSync(process.execPath, [path.join(repo, 'scripts', 'native.mjs'), 'verify'], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 100_000 });
  const ok = verify();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /"engine": "Hunspell"/);
  assert.match(ok.stdout, /"engine": "Harper"/);
  const native = path.join(dataDir, 'native-copy');
  cpSync(path.join(repo, 'native'), native, { recursive: true, filter: (src) => !src.includes(`${path.sep}node_modules`) });
  writeFileSync(path.join(native, 'harper', 'LICENSE'), 'changed');
  const bad = verify({ SPECTRUM_NATIVE_DIR: native });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /LICENSE does not match its build information/);
});

test('grammar: Australian dialect, no Oxford comma, positions in the source', async () => {
  const tex = '\\begin{document}\nThis is a apple. I bought milk, eggs, and bread \\cite{key}. It are \\emph{the the} best.\n\\end{document}';
  const issues = await grammar.checkGrammar({ text: tex, file: 'main.tex' });
  const byRule = Object.fromEntries(issues.map((i) => [i.rule, i]));
  assert.equal(tex.slice(byRule.AnA.from, byRule.AnA.to), 'a');
  assert.deepEqual(byRule.AnA.suggestions[0], { kind: 'replace', text: 'an' });
  assert.equal(byRule.AnA.fixable, true);
  assert.ok(byRule.NoOxfordComma, 'serial comma flagged');
  assert.ok(byRule.PronounInflectionBe, 'It are');
  assert.ok(byRule.RepeatedWords, 'the the inside \\emph');
  assert.ok(!issues.some((i) => i.kind === 'Spelling' && i.rule === 'SpellCheck'), 'spelling is left to Hunspell');

  const allowed = await grammar.checkGrammar({ text: tex, file: 'main.tex', oxford: 'off', ignoredRules: ['AnA'] });
  assert.ok(!allowed.some((i) => i.rule === 'NoOxfordComma' || i.rule === 'AnA'));
});

test('grammar in each English dialect, Australian by default, the serial comma in each', async () => {
  const text = 'Grab the flashlight and change the diaper. Fill the petrol tank. I bought milk, eggs, and bread.';
  const flagged = async (language, oxford) => (await grammar.checkGrammar({ text, language, oxford, style: true })).map((i) => `${i.rule}:${text.slice(i.from, i.to)}`);
  const au = await flagged(undefined);
  assert.deepEqual(au, await flagged('en-AU'));
  assert.ok(au.includes('Regionalisms:flashlight') && au.includes('Regionalisms:diaper') && !au.includes('Regionalisms:petrol'));
  const us = await flagged('en-US');
  assert.ok(us.includes('Regionalisms:petrol') && !us.includes('Regionalisms:flashlight'));
  assert.ok((await flagged('en-GB')).includes('Regionalisms:flashlight'));
  assert.ok((await flagged('en-CA')).includes('Regionalisms:petrol'));
  for (const language of ['en-AU', 'en-US', 'en-GB', 'en-CA', 'en-IN']) {
    assert.ok((await flagged(language)).includes('NoOxfordComma:,'), language);
    assert.ok(!(await flagged(language, 'off')).some((i) => i.startsWith('NoOxfordComma')), language);
  }
  assert.deepEqual((await grammar.grammarStatus()).languages, ['en-AU', 'en-US', 'en-GB', 'en-CA', 'en-IN']);
});

test('spelling in each bundled English: its own words, and the supplement in all of them', async () => {
  const words = ['colour', 'color', 'organise', 'organize', 'defence', 'defense', 'LaTeX', 'arXiv', 'Centrelink', 'recieve'];
  assert.deepEqual((await spell.checkWords(words, undefined, 'en-US')).sort(), ['Centrelink', 'colour', 'defence', 'organise', 'recieve']);
  assert.deepEqual((await spell.checkWords(words, undefined, 'en-GB')).sort(), ['Centrelink', 'color', 'defense', 'recieve']);
  assert.deepEqual((await spell.checkWords(words, undefined, 'en-IN')).sort(), ['Centrelink', 'color', 'defense', 'recieve']);
  assert.deepEqual((await spell.checkWords(words, undefined, 'en-CA')).sort(), ['Centrelink', 'organise', 'recieve']);
  assert.ok((await spell.suggestWord('colur', 'en-US')).includes('color'));
});

test('runs of Chinese, Japanese and Thai make no words; Korean splits at spaces; word characters join only between letters', () => {
  const text = '我们研究了这个问题的历史与发展。We tested it. 日本語の文章です。ภาษาไทยไม่มีช่องว่าง 한국어 문장 😀 don’t';
  assert.deepEqual(proseWords(text).map(([w]) => w), ['We', 'tested', 'it', '한국어', '문장', 'don’t']);
  for (const [word, at] of proseWords(text)) assert.equal(text.slice(at, at + word.length), word, 'UTF-16 positions, after an emoji too');
  assert.deepEqual(words('\\begin{document}\n研究結果顯示 the colour\\end{document}'), ['the', 'colour']);
  assert.deepEqual(proseWords('col·legi ·a b· x-y', 0, 100, { wordChars: '·-' }).map(([w]) => w), ['col·legi', 'a', 'b', 'x-y']);
  assert.deepEqual(proseWords('col·legi').map(([w]) => w), ['col', 'legi'], 'English keeps today’s pattern');
});
