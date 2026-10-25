// Typst and Markdown masks for the spell and grammar checkers: the words that must survive, and the markup that
// must not, with every position kept. Run: node --test apps/backend/test/mask.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskMarkdown, maskTypst, proseWords } from '../src/latex/mask.js';

const words = (masked) => proseWords(masked).map(([word]) => word);
const sameShape = (source, masked) => {
  assert.equal(masked.length, source.length, 'same length');
  assert.deepEqual([...masked].flatMap((c, i) => (c === '\n' ? [i] : [])), [...source].flatMap((c, i) => (c === '\n' ? [i] : [])), 'newlines in place');
};
const NEWLINE = String.fromCharCode(10);
const fence = '```';

test('Typst keeps prose, captions and heading text, and drops markup, maths, raw and comments', () => {
  const source = [
    '= A Heading',
    '// hidden comment',
    '#let secret = "hidden"',
    'This is prose with @cite and <label>.',
    '#figure(image("fig.png"), caption: [A caption with café.])',
    '$ x + y $',
    '/* block comment */',
    fence + 'raw words' + fence,
    'A \\# hashtag and https://example.com',
    'Text with #emph[emphasis] and #text(fill: red)[coloured words].',
    ''
  ].join(NEWLINE);
  const masked = maskTypst(source);
  sameShape(source, masked);
  const kept = words(masked);
  for (const word of ['Heading', 'prose', 'caption', 'café', 'hashtag', 'emphasis', 'coloured', 'words']) assert.ok(kept.includes(word), word + ' survives');
  for (const word of ['comment', 'secret', 'hidden', 'fig', 'label', 'cite', 'raw', 'example']) assert.ok(!kept.includes(word), word + ' is masked');
});

test('Markdown keeps prose and link text, and drops front matter, code, maths, URLs and citations', () => {
  const source = [
    '---',
    'title: Secret',
    '---',
    '# A Heading',
    'Some prose with [a link](https://example.com) and `code_word`.',
    '$$',
    'x + y',
    '$$',
    '![alt text](image.png){#fig:x}',
    '<!-- hidden comment -->',
    '    indented code',
    '[@citation]',
    '- a list item',
    '',
    fence + 'fenced code' + NEWLINE + '= not a heading' + NEWLINE + fence,
    'An escape \\* and a plain_word.',
    ''
  ].join(NEWLINE);
  const masked = maskMarkdown(source);
  sameShape(source, masked);
  const kept = words(masked);
  for (const word of ['Heading', 'prose', 'link', 'list', 'item', 'escape', 'plain', 'word']) assert.ok(kept.includes(word), word + ' survives');
  for (const word of ['Secret', 'code_word', 'alt', 'image', 'hidden', 'comment', 'indented', 'citation', 'fenced', 'heading', 'example']) assert.ok(!kept.includes(word), word + ' is masked');
});
