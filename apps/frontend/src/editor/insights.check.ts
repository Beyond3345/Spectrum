// Self-check for the Document insights scanner. It imports latexEditor.ts, which Node can't strip, so bundle it first:
// `npx esbuild apps/frontend/src/editor/insights.check.ts --bundle --platform=node --log-level=warning --outfile=<file>.js`, then `node <file>.js`
import { headingNumbers, inReading, metadataText, plainText, scanInsights, texlabNotes, withNumbers } from './insights.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const main = String.raw`\documentclass{article}
\title{On \emph{Small} Things\thanks{Funded by nobody.}}
\author{Ada Lovelace\inst{1} \and Charles Babbage\\ University of London}
\date{\today}
\begin{document}
\begin{abstract}
We look at small things.

Then at smaller ones.
\end{abstract}
\keywords{small things; \LaTeX{} tricks, scale}
\section{Introduction}\label{sec:intro}
As \citet{knuth84} and \cite[p.~3]{lamport94, knuth84} say % \cite{hidden}
\section*{Unnumbered}
\input{chapter}
\end{document}`;

const chapter = String.raw`\subsection{Method}
\begin{figure}[t]
  \begin{subfigure}{0.4\linewidth}\caption{Left}\label{fig:left}\end{subfigure}
  \caption{Both halves, side~by~side.}
  \label{fig:both}
\end{figure}
% \begin{table}\caption{Commented out}\end{table}
\begin{table*}
  \caption[Short]{Results \& costs}\label{tab:results}
\end{table*}
\begin{equation}
  E = mc^2 \label{eq:energy}
\end{equation}
\begin{align*}
  a &= b
\end{align*}
\nocite{*}`;

const got = scanInsights([
  { path: 'main.tex', text: main },
  { path: 'chapters/chapter.tex', text: chapter }
]);

eq(
  got.headings.map((h) => [h.text, h.level, h.label ?? null, h.file, h.line]),
  [
    ['Introduction', 1, 'sec:intro', 'main.tex', 12],
    ['Unnumbered', 1, null, 'main.tex', 14],
    ['Method', 2, null, 'chapters/chapter.tex', 1]
  ],
  'headings, their labels and lines'
);
eq(got.figures.map((f) => [f.text, f.label, f.line]), [['Both halves, side by side.', 'fig:both', 2]], 'a figure’s own caption and label, not its subfigure’s');
eq(got.tables.map((t) => [t.text, t.label]), [['Results & costs', 'tab:results']], 'a starred table with a short caption, and not one commented out');
eq(got.equations.map((e) => [e.text, e.label]), [['E = mc^2', 'eq:energy']], 'numbered displays only');
eq(got.labels.map((l) => l.label), ['sec:intro', 'fig:left', 'fig:both', 'tab:results', 'eq:energy'], 'every label');
eq(got.citations.map((c) => [c.key, c.count, c.line]), [['knuth84', 2, 13], ['lamport94', 1, 13]], 'citations counted once per key, not in comments, not \\nocite{*}');
eq(got.metadata, {
  title: 'On Small Things',
  authors: ['Ada Lovelace', 'Charles Babbage'],
  keywords: ['small things', 'LaTeX tricks', 'scale'],
  date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
  abstract: 'We look at small things.\n\nThen at smaller ones.'
}, 'submission metadata');
eq(metadataText(got.metadata).split('\n').slice(0, 2), ['Title: On Small Things', 'Authors: Ada Lovelace; Charles Babbage'], 'metadata as text');

const ieee = scanInsights([{ path: 'paper.tex', text: String.raw`\author{\IEEEauthorblockN{Grace Hopper}\IEEEauthorblockA{Navy}}
\begin{IEEEkeywords}compilers, COBOL\end{IEEEkeywords}` }]);
eq([ieee.metadata.authors, ieee.metadata.keywords], [['Grace Hopper'], ['compilers', 'COBOL']], 'IEEE authors and keywords');
eq(plainText('A {\\bf bold}~move\\\\ on 50\\% of \\$5'), 'A bold move on 50% of $5', 'plain text');
eq(plainText('The \\LaTeX\\ Author Guidelines'), 'The LaTeX Author Guidelines', 'a control space is a space, and \\LaTeX is a word');

// the bundled templates' titles, authors, headings and captions
const labels = { 'ex:design': { number: '6.2', page: '3' } };
eq(plainText(String.raw`\href{https://orcid.org/0000-0000-0000-0000}{\includegraphics[scale=0.06]{orcid.pdf}\hspace{1mm}David S.~Hippocampus}`), 'David S. Hippocampus', 'arXiv: a link keeps its text, not the image');
eq(plainText(String.raw`\LaTeX\ Author Guidelines for \confName~Proceedings`), 'LaTeX Author Guidelines for Proceedings', 'CVPR’s title');
eq(plainText(String.raw`Solving \texorpdfstring{$\mathbf{x}' = A\mathbf{x}$}{x' = Ax}`), "Solving $x' = Ax$", 'maths notes: \\texorpdfstring once');
eq(
  withNumbers(plainText(String.raw`Gain of the filter in Example~\ref{ex:design}: flat at \qty{20}{\decibel}, then falling at \qty{20}{\decibel\per\decade} above $f_c$, as in~\cite{k} and \url{https://x.org}.`), labels),
  'Gain of the filter in Example 6.2: flat at 20 decibel, then falling at 20 decibel per decade above $f_c$, as in and.',
  'electronics notes: the number from the last compile, units kept, citations and URLs gone'
);
eq(withNumbers(plainText(String.raw`See page~\pageref{ex:design} and \cref{ex:design,missing}.`), labels), 'See page 3 and 6.2, ?.', 'pages, and a label the compile hasn’t seen');
eq(plainText("``Abstract'' with $f'' = 0$ and \\SI{3}{\\kilo\\hertz}"), '“Abstract” with $f\'\' = 0$ and 3 kilohertz', 'TeX’s quotes outside maths only');
eq(
  withNumbers(plainText(String.raw`The Sallen--Key low-pass filter---see \ref{sec--a}, with $a--b$ and $Q = \qty{0.707}{}$.`), { 'sec--a': { number: '2', page: '1' } }),
  'The Sallen–Key low-pass filter—see 2, with $a--b$ and $Q = 0.707$.',
  'dashes as typeset, outside maths and a \\ref’s keys, and a quantity without a unit'
);

// an align's numbered lines, one row each; a \\ in a nested environment doesn't end one
const maths = scanInsights([{ path: 'm.tex', text: String.raw`\begin{align}
  s &= \sigma + j\omega \label{eq:sk} \\
  s_0 &= 0 \nonumber \\[2pt]
  f(s) &= \begin{cases} 1 & s > 0 \\ 0 & \text{otherwise} \end{cases} \label{eq:sk-w0}
\end{align}
\begin{multline}
  a + b \\ + c \label{eq:long}
\end{multline}` }]);
eq(
  maths.equations.map((e) => [e.text, e.label ?? null, e.line]),
  [
    ['s &= \\sigma + j\\omega', 'eq:sk', 2],
    ['f(s) &= \\begin{cases} 1 & s > 0 \\\\ 0 & \\text{otherwise} \\end{cases}', 'eq:sk-w0', 4],
    ['a + b \\\\ + c', 'eq:long', 6]
  ],
  'an align’s lines, without \\nonumber ones; a multline is one'
);

eq(
  scanInsights([{ path: 'm.tex', text: String.raw`\begin{alignat}{2}
 x &= 1 & y &= 2 \\
 z &= 3 \label{eq:z}
\end{alignat}` }]).equations.map((e) => [e.text, e.line]),
  [['x &= 1 & y &= 2', 2], ['z &= 3', 3]],
  'alignat column pairs are not equation content'
);

// reading order: a file's rows where it's \input, after the files a breadth-first walk reads first
const order = scanInsights(
  [
    { path: 'main.tex', text: '\\section{One}\n\\input{sec/a}\n\\section{Three}\n\\input{sec/b}\n' },
    { path: 'sec/b.tex', text: '\\section{Four}\n' },
    { path: 'sec/a.tex', text: '\\section{Two}\n\\input{sec/a1}\n' },
    { path: 'sec/a1.tex', text: '\\subsection{Two point one}\n' }
  ],
  'main.tex'
);
eq(order.headings.map((h) => h.text), ['One', 'Two', 'Two point one', 'Three', 'Four'], 'headings in reading order');
const citations = scanInsights([
  { path: 'main.tex', text: '\\cite{first}\n\\input{chapter}\n\\cite{shared,last}' },
  { path: 'chapter.tex', text: '\\cite{shared,middle}\n' }
], 'main.tex').citations;
eq(citations.map((c) => [c.key, c.count, c.file, c.line]), [
  ['first', 1, 'main.tex', 1], ['shared', 2, 'chapter.tex', 1], ['middle', 1, 'chapter.tex', 1], ['last', 1, 'main.tex', 3]
], 'citations follow reading order and jump to the actual first citation');
const marks = [
  { file: 'main.tex', line: 3 },
  { file: 'sec/b.tex', line: 1 },
  { file: 'sec/a1.tex', line: 1 },
  { file: 'other.tex', line: 1 }
];
inReading('main.tex', [{ path: 'main.tex', text: '\\section{One}\n\\input{sec/a}\n\\section{Three}\n\\input{sec/b}\n' }, { path: 'sec/b.tex', text: '' }, { path: 'sec/a.tex', text: '\\input{sec/a1}\n' }, { path: 'sec/a1.tex', text: '' }], marks);
eq(marks.map((m) => m.file), ['sec/a1.tex', 'main.tex', 'sec/b.tex', 'other.tex'], 'any rows in reading order, a file not reached last');

// numbers and pages for headings without a \label, from the contents, while the levels agree
const toc = [
  { level: 'section', number: '1', page: '1' },
  { level: 'section', number: '2', page: '2' },
  { level: 'subsection', number: '2.1', page: '2' },
  { level: 'section', number: '', page: '3' },
  { level: 'section', number: '3', page: '4' },
  { level: 'section', number: '4', page: '5' }
];
const numbered = scanInsights([{ path: 'main.tex', text: '\\section{One}\\section{Two}\\subsection{Two point one}\\section*{Aside}\\section{Three}\\section{Four}\\subsubsection{Deep}' }]).headings;
eq([...headingNumbers(numbered, toc)].map(([row, at]) => `${row.text} ${at.number} p. ${at.page}`), ['One 1 p. 1', 'Two 2 p. 2', 'Two point one 2.1 p. 2', 'Three 3 p. 4', 'Four 4 p. 5'], 'contents numbers by order');
eq(headingNumbers(numbered.slice(1), toc).size, 0, 'none when the source and the contents disagree');

// TexLab's diagnostics as Document insights marks its labels and citations
const d = (line: number, col: number, endCol: number, code: string) => ({ line, col, endLine: line, endCol, severity: 'warning' as const, message: '', code, source: 'texlab' as const });
const notes = texlabNotes(
  {
    'main.tex': [d(2, 8, 17, 'unused-label'), d(3, 11, 17, 'undefined-citation'), d(3, 21, 27, 'undefined-label'), d(4, 8, 13, 'duplicate-label'), d(5, 8, 13, 'duplicate-label')],
    'other.tex': [d(1, 1, 5, 'unused-label')]
  },
  [{ path: 'main.tex', text: String.raw`\section{A}
\label{sec:spare}
See \cite{nobody} and \ref{gone}.
\label{twin}
\label{twin}` }]
);
eq([...notes.labels], [['main.tex:2', 'Unused'], ['main.tex:4', 'Duplicate'], ['main.tex:5', 'Duplicate']], 'labels marked by file and line, only in the files read');
eq([...notes.missing], ['nobody'], 'the undefined citation’s key, from the text at its range');
eq(notes.unresolved, 1, 'references to no label counted');

console.log('insights: all checks passed');
