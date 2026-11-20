// Self-check for the live preview's reading of pandoc Markdown. Run:
// npx esbuild apps/frontend/src/editor/previewText.check.ts --bundle --platform=node --format=esm --outfile=/tmp/p.mjs && node /tmp/p.mjs
import { CAPTION, CITE, DISPLAY, MATHS, NOTE, prepareMarkdown } from './previewText';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const source = [
  '---', //1
  'title: "Water use"', //2
  'author: [A Student, B Tutor]', //3
  'numbersections: true', //4
  '---', //5
  '# Introduction {#sec:intro}', //6
  '', //7
  'See @fig:plan, [@tbl:use; @eq:flow], [-@fig:plan], [see @fig:plan; @fig:flow, left] and @sec:method, @fig:none.', //8
  '', //9
  '![The plan](figures/plan.png){#fig:plan width=60%}', //10
  '', //11
  '```{.mermaid caption="The flow" #fig:flow}', //12
  'graph LR', //13
  '```', //14
  '', //15
  '## Method {#sec:method}', //16
  '', //17
  '| a | b |', //18
  '|---|---|', //19
  '| 1 | 2 |', //20
  'Table: Weekly use. {#tbl:use}', //21
  '', //22
  '$$', //23
  'Q = vA', //24
  '$$ {#eq:flow}', //25
  '', //26
  'Cost $5 and $6, maths $x_1$, a note^[Said so.] and [@knuth, p. 4].', //27
  '', //28
  '```python', //29
  'x = "$a$ @fig:plan"', //30
  '```' //31
].join('\n');
const got = prepareMarkdown(source);
const lines = got.markdown.split('\n');
eq(lines.length, 31, 'line for line');
eq(got.meta, { title: 'Water use', authors: ['A Student', 'B Tutor'], date: '' }, 'front matter');
eq(lines.slice(0, 5), ['', '', '', '', ''], 'the front matter is blank lines');
eq(lines[5], '# 1 Introduction', 'a numbered heading');
eq(lines[15], '## 1.1 Method', 'a numbered sub-heading');
eq(lines[7], 'See Figure 1, Table 1 and Equation (1), 1, see Figures 1 and 2, left and Section 1.1, ??.', 'references');
eq(lines[9], '![The plan](figures/plan.png)', 'attributes go');
eq(lines[11], '```mermaid', 'a Mermaid block with attributes is a mermaid block');
eq([...got.figures], [[10, { number: '1', caption: 'The plan' }], [12, { number: '2', caption: 'The flow' }]], 'figures by line');
eq(lines[20], `> ${CAPTION}Table 1: Weekly use.`, 'a table caption');
eq(lines.slice(22, 25), ['` ' + DISPLAY + '1|Q = vA `', '', ''], 'display maths keeps its lines');
eq(lines[26], 'Cost $5 and $6, maths ` ' + MATHS + 'x_1 `, a note` ' + NOTE + 'Said so. ` and ` ' + CITE + '@knuth, p. 4 `.', 'maths, notes and citations');
eq(lines[29], 'x = "$a$ @fig:plan"', 'code stays as it is');
eq(prepareMarkdown('# One\n\nSee @sec:one.\n').markdown, '# One\n\nSee ??.\n', 'a reference to no label');
eq(prepareMarkdown('# One {#sec:one}\n\nSee @sec:one.\n').markdown, '# One\n\nSee One.\n', 'an unnumbered heading by its title');
console.log('previewText.check: ok');
