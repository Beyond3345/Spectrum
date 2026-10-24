// Self-check for the outline parser. latexEditor.ts has TypeScript Node can't strip, so bundle it first:
// `npx esbuild apps/frontend/src/editor/outline.check.ts --bundle --platform=node --log-level=warning | node`
import { documentOutline, parseOutline } from './latexEditor.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const brief = (text: string) => parseOutline(text).map((h) => [h.level, h.title, h.line]);

eq(brief('\\section{Bib\\TeX{} Files}'), [[1, 'Bib\\TeX{} Files', 1]], 'nested empty group');
eq(brief('\\section[short]{A {nested} title}'), [[1, 'A {nested} title', 1]], 'optional argument and nested group');
eq(brief('\\chapter*{Intro}\n\\subsection{Sets \\{a\\}}'), [[0, 'Intro', 1], [2, 'Sets \\{a\\}', 2]], 'escaped braces');
eq(brief('\\section{Open {group'), [], 'unclosed heading');
eq(brief('% \\section{Hidden}\n\\section{}'), [[1, '(untitled)', 2]], 'comment and empty title');
eq(parseOutline('x\n\\section{B}')[0].pos, 2, 'position');

// a document's headings across the files it pulls in, in reading order; each file once, a commented-out one never
const tree = new Map([
  ['thesis/main.tex', '\\section{A}\n\\input{chapters/one} % \\input{chapters/gone}\n\\section{D}'],
  ['thesis/chapters/one.tex', '\\subsection{B}\\include{../thesis/main}\n\\import{./}{two.tex}'],
  ['two.tex', '\\subsection{C}'],
  ['thesis/chapters/gone.tex', '\\section{Never}']
]);
documentOutline('thesis/main.tex', new Set(tree.keys()), async (path) => tree.get(path) ?? '').then((headings) => {
  eq(
    headings.map((h) => [h.file, h.line, h.title, h.pos]),
    [
      ['thesis/main.tex', 1, 'A', 0],
      ['thesis/chapters/one.tex', 1, 'B', 0],
      ['two.tex', 1, 'C', 0],
      ['thesis/main.tex', 3, 'D', 57]
    ],
    'headings across inputs'
  );
  console.log('outline: all checks passed');
});
