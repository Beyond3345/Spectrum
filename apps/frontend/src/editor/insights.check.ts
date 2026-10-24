// Self-check for the Document insights scanner. It imports latexEditor.ts, which Node can't strip, so bundle it first:
// `npx esbuild apps/frontend/src/editor/insights.check.ts --bundle --platform=node --log-level=warning --outfile=<file>.js`, then `node <file>.js`
import { metadataText, plainText, scanInsights } from './insights.ts';

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
  keywords: ['small things', 'tricks', 'scale'],
  date: 'Today',
  abstract: 'We look at small things.\n\nThen at smaller ones.'
}, 'submission metadata');
eq(metadataText(got.metadata).split('\n').slice(0, 2), ['Title: On Small Things', 'Authors: Ada Lovelace; Charles Babbage'], 'metadata as text');

const ieee = scanInsights([{ path: 'paper.tex', text: String.raw`\author{\IEEEauthorblockN{Grace Hopper}\IEEEauthorblockA{Navy}}
\begin{IEEEkeywords}compilers, COBOL\end{IEEEkeywords}` }]);
eq([ieee.metadata.authors, ieee.metadata.keywords], [['Grace Hopper'], ['compilers', 'COBOL']], 'IEEE authors and keywords');
eq(plainText('A {\\bf bold}~move\\\\ on 50\\% of \\$5'), 'A bold move on 50% of $5', 'plain text');

console.log('insights: all checks passed');
