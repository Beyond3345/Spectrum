// Self-check for the outline parser. latexEditor.ts has TypeScript Node can't strip, so bundle it first:
// `npx esbuild apps/frontend/src/editor/outline.check.ts --bundle --platform=node --log-level=warning | node`
import { documentOutline, outlineTitle, parseOutline } from './latexEditor.ts';

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
// \texorpdfstring shows its plain form, as the PDF's bookmarks do; TexLab's titles too
eq(brief(String.raw`\section{Solving \texorpdfstring{$\mathbf{x}' = A\mathbf{x}$}{x' = Ax}}`), [[1, "Solving x' = Ax", 1]], 'texorpdfstring');
eq(outlineTitle('\\texorpdfstring{$a$}{a} and \\texorpdfstring {${b}$} {b}'), 'a and b', 'two texorpdfstrings, nested braces');
eq(outlineTitle(String.raw`Open \texorpdfstring{$a$}`), String.raw`Open \texorpdfstring{$a$}`, 'no plain form');
// a caption from TexLab as it reads, not its source
eq(outlineTitle(String.raw`Table 1.1: Parts for the filter in \cref{eq:gain}`), 'Table 1.1: Parts for the filter in …', 'a reference');
eq(outlineTitle(String.raw`Figure 2: Gain, as in~\eqref{eq:a} and \citet[p.~4]{smith}`), 'Figure 2: Gain, as in … and …', 'an equation and a citation');
eq(outlineTitle(String.raw`A \textbf{bold \emph{new}} method`), 'A bold new method', 'text styles, nested');
eq(outlineTitle(String.raw`Bib\TeX{} and $\mathbf{x}$`), String.raw`Bib\TeX{} and $\mathbf{x}$`, 'other commands and maths stay');
eq(outlineTitle(String.raw`Pe\~na~2`), String.raw`Pe\~na 2`, 'a tie is a space, an accent stays');

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
