// Self-check for finding a Markdown document's Mermaid blocks and their keys. Run:
// npx esbuild apps/frontend/src/editor/mermaidBlocks.check.ts --bundle --platform=node --format=esm --outfile=/tmp/m.mjs && node /tmp/m.mjs
import { mermaidBlocks, mermaidKey } from './mermaidBlocks';
import { markdownIncludes } from './insights';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const doc = [
  '# Flow', //1
  '', //2
  '```mermaid', //3
  'graph TD', //4
  '\tA --> B', //5
  '```', //6
  '', //7
  '````markdown', //8
  '```mermaid', //9
  'graph LR', //10
  '```', //11
  '````', //12
  '', //13
  '~~~ {.mermaid caption="The flow" #fig:flow}', //14
  'sequenceDiagram', //15
  '~~~', //16
  '```python', //17
  'print(1)', //18
  '```' //19
].join('\n');
eq(mermaidBlocks(doc), [
  { code: 'graph TD\n\tA --> B', line: 3 },
  { code: 'sequenceDiagram', line: 14 }
], 'mermaid blocks, not one shown inside another fence or another language');
// the key crossref.lua makes of pandoc's text, whose tabs are spaces
eq(mermaidKey('graph TD\n\tA --> B'), mermaidKey('graph TD\n    A -->  B '), 'whitespace does not change the key');
eq(mermaidKey('  graph TD\n  A --> B\n'), 'graph TD A --> B', 'the key');
// the files a document joins to it, from its folder, none outside the project
eq(markdownIncludes('---\ntitle: T\ninclude: [chapters/one.md, "two.md"]\n---\n', 'thesis/main.md'), ['thesis/chapters/one.md', 'thesis/two.md'], 'include: as a list in brackets');
eq(markdownIncludes('---\ninclude:\n  - one.md\n  - ../shared/two.md\n  - ../../out.md\n---\n', 'thesis/main.md'), ['thesis/one.md', 'shared/two.md'], 'include: as items, none outside');
eq(markdownIncludes('# No front matter\n\ninclude: [x.md]\n', 'main.md'), [], 'only in the front matter');
console.log('mermaidBlocks.check: ok');
