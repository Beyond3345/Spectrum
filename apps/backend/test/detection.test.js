// The language of each piece of prose: markup (markup.js), detection limited to the user's list (detect.js) with
// stand-in dictionaries, and spelling by piece (spellService checkPieces) with the bundled English dictionaries and a
// small French one served from 127.0.0.1. A throwaway data folder; no network.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-detection-')));
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { languageMarkup, languageTag, prosePieces } = await import('../src/language/markup.js');
const detect = await import('../src/language/detect.js');
const spell = await import('../src/services/spellService.js');
const { maskLatex } = await import('../src/latex/mask.js');

const server = createServer((req, res) => {
  const body = files[req.url.slice(1)];
  res.writeHead(body ? 200 : 404).end(body);
});
const files = {};
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
after(async () => {
  server.close();
  await spell.stopSpeller();
  rmSync(tmp, { recursive: true, force: true });
});

// ─── markup ───

test('babel and polyglossia name the main language and the stretches in others', () => {
  const tex = String.raw`\documentclass{article}
\usepackage[french,main=british]{babel}
% \selectlanguage{german} in a comment counts for nothing
\begin{document}
Hello \foreignlanguage{french}{Bonjour \emph{le} monde} again.
\begin{otherlanguage*}{ngerman}Guten Tag\end{otherlanguage*}
\textgreek{Καλημέρα} and \begin{spanish}Hola\end{spanish}
\selectlanguage{american}Color.
\end{document}`;
  const { main, ranges } = languageMarkup(tex, 'latex');
  assert.equal(main, 'en-GB');
  const at = (lang) => ranges.filter((r) => r.lang === lang).map((r) => tex.slice(r.from, r.to));
  assert.deepEqual(at('fr'), ['Bonjour \\emph{le} monde']);
  assert.deepEqual(at('de'), ['Guten Tag']);
  assert.deepEqual(at('el'), ['Καλημέρα']);
  assert.deepEqual(at('es'), ['Hola']);
  assert.ok(at('en-US')[0].startsWith('Color.'));
  // the last babel option is the main language when main= isn't given; polyglossia's variant picks the English
  assert.equal(languageMarkup('\\usepackage[ngerman,australian]{babel}', 'latex').main, 'en-AU');
  assert.equal(languageMarkup('\\setmainlanguage[variant=british]{english}', 'latex').main, 'en-GB');
  // \selectlanguage inside \foreignlanguage: the innermost wins
  const nested = '\\selectlanguage{french}Un \\foreignlanguage{english}{word} deux';
  assert.deepEqual(languageMarkup(nested, 'latex').ranges.map((r) => [nested.slice(r.from, r.to), r.lang]), [['Un \\foreignlanguage{english}{', 'fr'], ['word', 'en-US'], ['} deux', 'fr']]);
});

test('Typst text(lang:, region:) and Markdown front matter, spans and divs', () => {
  const typ = '#set text(lang: "zh", region: "tw")\n= 標題\nHi #text(lang: "fr", region: "ca")[Bonjour] and #text(size: 9pt)[small].';
  const t = languageMarkup(typ, 'typst');
  assert.equal(t.main, 'zh-TW');
  assert.deepEqual(t.ranges.map((r) => [typ.slice(r.from, r.to), r.lang]), [['Bonjour', 'fr']]);
  const md = '---\ntitle: x\nlang: pt-BR\n---\nHi [Bonjour]{lang=fr} there.\n\n::: {.note lang="de"}\nGuten Tag\n:::\nEnd.\n';
  const m = languageMarkup(md, 'markdown');
  assert.equal(m.main, 'pt-BR');
  assert.deepEqual(m.ranges.map((r) => [md.slice(r.from, r.to), r.lang]), [['Bonjour', 'fr'], ['Guten Tag\n', 'de']]);
  // Chinese regions: TW, HK and MO are Traditional, CN and SG Simplified
  assert.deepEqual(['zh-HK', 'zh-Hant', 'zh-SG', 'zh-Hans-CN', 'zh'].map((tag) => languageTag(tag)), ['zh-TW', 'zh-TW', 'zh-CN', 'zh-CN', 'zh']);
});

test('pieces are paragraphs, cut again where markup starts and ends', () => {
  const tex = 'First paragraph here.\n\nSecond with \\foreignlanguage{french}{du texte} inside.\n\n\\label{x}\n\nThird.';
  const prose = maskLatex(tex);
  const pieces = prosePieces(prose, languageMarkup(tex, 'latex').ranges);
  assert.deepEqual(pieces.map((p) => [prose.slice(p.from, p.to).trim(), p.lang]), [
    ['First paragraph here.', undefined], ['Second with', undefined], ['du texte', 'fr'], ['inside.', undefined], ['Third.', undefined]
  ]);
});

// ─── detection, with stand-in dictionaries ───

const DICTS = {
  'en-AU': new Set('the of samples colour results show we tested it introduction conclusion methods and a in is this paragraph english written'.split(' ')),
  fr: new Set('méthodes les résultats montrent que nous avons testé introduction conclusion et la le de une phrase en français écrite'.split(' '))
};
/** A vote from the stand-in dictionaries; tags in `missing` have no dictionary on this computer yet. */
const voter = (missing = []) => async (words, candidates) => ({
  words: words.length,
  accepted: Object.fromEntries(candidates.filter((t) => !missing.includes(t)).map((t) => [t, words.filter((w) => DICTS[t]?.has(w.toLowerCase())).length])),
  missing: candidates.filter((t) => missing.includes(t))
});
const decideAll = async (texts, { languages, main = null, vote = voter(), explicit = [] }) => {
  const verdicts = [];
  for (const [i, text] of texts.entries()) verdicts.push(await detect.verdict(text, { languages, main, vote, explicit: explicit[i] }));
  return detect.resolve(verdicts, detect.fallbackOf(languages, main));
};

test('your example: Australian English and Traditional Chinese, never US English or Simplified Chinese', async () => {
  const languages = ['en-AU', 'zh-TW'];
  const texts = ['The colour of the samples', 'The color of the samples', '研究結果顯示', '研究结果显示', '香港的溫度和稅率，温和税', 'the term 關係 means', '日本語の文章です。', 'Les résultats montrent que'];
  assert.deepEqual(await decideAll(texts, { languages }), ['en-AU', 'en-AU', 'zh-TW', 'zh-TW', 'zh-TW', 'en-AU', '', 'en-AU']);
  // \foreignlanguage{french}: French isn't listed, so it isn't checked
  assert.deepEqual(await decideAll(['Les résultats'], { languages, explicit: ['fr'] }), ['']);
  // british with only Australian English listed is checked as Australian English
  assert.deepEqual(await decideAll(['Colour'], { languages, explicit: ['en-GB'] }), ['en-AU']);
  // stray Simplified characters only in mostly Traditional text, and never Hong Kong or Taiwan forms
  assert.deepEqual(detect.straySimplified('研究結果顯示发现這個問題'), [[6, 7], [7, 8]]);
  assert.deepEqual(detect.straySimplified('研究结果显示這'), []);
  assert.deepEqual(detect.straySimplified('香港的溫度和稅率，温和税與戶户'), []);
  assert.deepEqual(detect.traditionalOf('发'), ['發', '髮']);
  assert.ok(detect.OPENCC_COUNTS.simplifiedOnly > 3000 && detect.OPENCC_COUNTS.traditionalOnly > 3000);
});

test('the first listed language is the fallback, and both Chinese forms are told apart by OpenCC', async () => {
  const languages = ['zh-CN', 'en-AU', 'zh-TW'];
  assert.deepEqual(await decideAll(['研究結果顯示', '研究方法', '研究结果显示', '研究方法'], { languages }), ['zh-TW', 'zh-TW', 'zh-CN', 'zh-CN']);
  assert.deepEqual(await decideAll(['研究方法'], { languages }), ['zh-CN']);
  // Japanese (Han with kana) only when listed
  assert.deepEqual(await decideAll(['日本語の文章です。'], { languages: ['en-AU', 'ja'] }), ['ja']);
  assert.deepEqual(await decideAll(['日本語の文章です。'], { languages }), ['']);
});

test('same-script languages are decided by their dictionaries, and a piece that can’t be told inherits', async () => {
  const languages = ['en-AU', 'fr'];
  assert.deepEqual(await decideAll(['Méthodes', 'Introduction', 'Conclusion'], { languages }), ['fr', 'fr', 'fr']);
  assert.deepEqual(await decideAll(['We tested the samples', 'Introduction', 'Conclusion'], { languages }), ['en-AU', 'en-AU', 'en-AU']);
  assert.deepEqual(await decideAll(['Introduction'], { languages }), ['en-AU']);
  // the document's main language is the fallback in place of the list's first
  assert.deepEqual(await decideAll(['Introduction', 'Conclusion'], { languages, main: 'fr' }), ['fr', 'fr']);
  // markup wins over the text
  assert.deepEqual(await decideAll(['We tested the samples'], { languages, explicit: ['fr'] }), ['fr']);
  // French's dictionary not here yet: a clearly English piece is still decided, a French one waits (inherits)
  const vote = voter(['fr']);
  assert.deepEqual(await decideAll(['The results show we tested the samples', 'Les résultats montrent que nous avons testé'], { languages, vote }), ['en-AU', 'en-AU']);
  // and no vote at all (the spell checker isn't running) leaves every same-script piece to inherit
  assert.deepEqual(await decideAll(['Les résultats montrent que'], { languages, vote: async () => { throw new Error('down'); } }), ['en-AU']);
});

test('variants are never guessed: the first listed wins, or the document’s main language', async () => {
  assert.deepEqual(await decideAll(['The color of the samples'], { languages: ['en-AU', 'en-US'] }), ['en-AU']);
  assert.deepEqual(await decideAll(['The color of the samples'], { languages: ['en-AU', 'en-US'], main: 'en-US' }), ['en-US']);
  assert.deepEqual(detect.listedLanguages(['xx', 'en-GB', 'en-GB', 3]), ['en-GB']);
  assert.deepEqual(detect.listedLanguages([]), ['en-AU']);
});

// ─── spelling by piece ───

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const FRENCH = { aff: Buffer.from('SET UTF-8\nTRY esianrtolcdugmphbyfvkwzéèàç\n'), dic: Buffer.from('7\nles\nméthodes\nrésultats\nmontrent\nque\nnous\ntesté\n'), licence: Buffer.from('MIT\n') };
for (const part of ['aff', 'dic', 'licence']) files[`fr.${part}`] = FRENCH[part];
const base = `http://127.0.0.1:${server.address().port}`;
spell.useLanguageList({ schema: 1, languages: [
  { tag: 'en-AU', script: 'Latin', babel: [], harper: 'Australian', languageTool: 'en-AU', wordChars: '', spelling: { bundled: 'en_AU' } },
  { tag: 'zh-TW', script: 'Han', babel: [], harper: null, languageTool: null, wordChars: '', spelling: null },
  { tag: 'fr', script: 'Latin', babel: ['french'], harper: null, languageTool: 'fr', wordChars: '-',
    spelling: { source: 'test', commit: 'one', files: Object.fromEntries(['aff', 'dic', 'licence'].map((p) => [p, [`${base}/fr.${p}`, sha(FRENCH[p]), FRENCH[p].length]])), encoding: 'UTF-8', licence: 'MIT', selfTest: ['méthodes', 'que', 'nous'] } }
] });

test('each piece is spelt in its own language; a missing dictionary leaves its pieces waiting and the rest checked', async () => {
  const pieces = [
    { text: 'The colour of the sampels.' },
    { text: '研究結果顯示发现這個問題 (term DNA).' },
    { text: 'Les résultats montrent que nous avons testé.' },
    { text: 'Du texte en françois', lang: 'fr' }
  ];
  const languages = ['en-AU', 'zh-TW', 'fr'];
  const before = await spell.checkPieces({ languages, pieces });
  assert.deepEqual(before.pending, ['fr']);
  assert.equal(before.pieces[0].lang, 'en-AU');
  assert.deepEqual(before.pieces[0].misspelt, [[18, 25]]);
  // stray Simplified marks; DNA, in Latin script inside the Chinese, goes to the first listed Latin language
  assert.deepEqual(before.pieces[1], { lang: 'zh-TW', misspelt: [[6, 7], [7, 8]] });
  assert.deepEqual(before.pieces[3], { lang: 'fr', misspelt: [] });
  assert.deepEqual(await spell.suggestWord('发', 'zh-TW'), ['發', '髮']);

  await spell.installDictionary('fr');
  const after = await spell.checkPieces({ languages, pieces });
  assert.deepEqual(after.pending, []);
  assert.equal(after.pieces[2].lang, 'fr');
  // avons isn't in the little French dictionary; English words in French pieces are French's to judge
  assert.deepEqual(after.pieces[2].misspelt.map(([from, to]) => pieces[2].text.slice(from, to)), ['avons']);
  assert.deepEqual(after.pieces[3].misspelt.map(([from, to]) => pieces[3].text.slice(from, to)), ['Du', 'texte', 'en', 'françois']);
  assert.deepEqual(after.pieces[0].misspelt, [[18, 25]]);
});
