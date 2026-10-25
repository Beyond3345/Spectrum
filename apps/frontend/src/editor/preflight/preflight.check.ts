// Self-check for Preflight. It imports latexEditor.ts, which Node can't strip, so bundle it first:
// `npx esbuild apps/frontend/src/editor/preflight/preflight.check.ts --bundle --platform=node --log-level=warning --outfile=<file>.js`, then `node <file>.js`
import { pageList, preflightGaps, runPreflight } from './run.ts';
import type { BibRecord, Finding, PdfFacts, PreflightInput } from './run.ts';
import { PDFLATEX_DESTINATIONS, PDFLATEX_TWO_PASSES, XELATEX_GLYPH } from './sampleLogs.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
/** The findings of a group, as [severity, message, place]. */
const brief = (found: Finding[], group: Finding['group']) =>
  found.filter((f) => f.group === group).map((f) => [f.severity, f.message, f.file ? `${f.file}:${f.line ?? ''}` : f.page ? `p${f.page}` : '']);
const has = (found: Finding[], group: Finding['group'], severity: Finding['severity'], message: RegExp, place = '') => {
  const rows = brief(found, group);
  if (!rows.some(([s, m, p]) => s === severity && message.test(String(m)) && (!place || p === place)))
    throw new Error(`${group}: no ${severity} ${message} ${place}\n${JSON.stringify(rows, null, 1)}`);
};
const none = (found: Finding[], group: Finding['group'], message: RegExp) => {
  const hit = brief(found, group).find(([, m]) => message.test(String(m)));
  if (hit) throw new Error(`${group}: didn’t expect ${JSON.stringify(hit)}`);
};
const input = (over: Partial<PreflightInput>): PreflightInput => ({ doc: 'main.tex', root: '/Users/me/Paper', files: [], log: '', failed: false, bib: [], pdfFacts: null, anonymous: false, ...over });

eq(pageList([1, 2, 3, 7, 9, 10]), '1–3, 7 and 9–10', 'page lists');

// ─── the compile log: the sources sampleLogs.ts was compiled from ───

const LOGGED = String.raw`\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage{graphicx}
\usepackage{hyperref}
\begin{document}
\section{Introduction}\label{sec:intro}
See \ref{sec:missing} and \cite{nobody}.
\noindent\hbox to 1.2\textwidth{This line is much too wide for the text block it lives in, really.}

Some text with a glyph the font lacks: \symbol{"2192}.
\section{Introduction}\label{sec:intro}
\setcounter{page}{1}
\newpage
Page again.
\end{document}
`;
const compiled = (log: string, over: Partial<PreflightInput> = {}) => runPreflight(input({ log, files: [{ path: 'main.tex', text: LOGGED }], ...over }));

eq(
  brief(compiled(PDFLATEX_TWO_PASSES), 'compile'),
  [
    ['error', 'Bad character code (8594).', 'main.tex:10'],
    ['warning', 'A line runs 134.9pt past the margin', 'main.tex:7'],
    ['warning', 'The PDF shows ?? for 1 citation and 1 reference the last compile couldn’t resolve: nobody and sec:missing', '']
  ],
  'pdfLaTeX: the last pass only, so the first pass’s “Rerun” is gone'
);
// the ?? link goes to the PDF's page that shows them, not the printed page number the log gives (a title page or roman
// front matter puts them out of step)
const shows = (texts: string[]): PdfFacts => ({ version: '1.5', encrypted: false, title: 'T', author: '', lang: 'en', outline: true, tagged: true, figuresWithoutAlt: 0, fonts: [], pages: texts.map((text) => ({ width: 595, height: 842, chars: 9, smallChars: 0, outside: false, text })) });
has(compiled(PDFLATEX_TWO_PASSES, { pdfFacts: shows(['Title', 'See ?? and [?]']) }), 'compile', 'warning', /^The PDF shows \?\? for/, 'p2');
const firstPass = PDFLATEX_TWO_PASSES.slice(0, PDFLATEX_TWO_PASSES.indexOf('Transcript written on') + 200);
has(compiled(firstPass.slice(0, firstPass.indexOf('\nThis is pdfTeX'))), 'compile', 'warning', /still needed another pass/);
has(compiled(PDFLATEX_TWO_PASSES, { failed: true }), 'compile', 'error', /^The last compile failed and made no PDF\.$/);
has(compiled(PDFLATEX_DESTINATIONS), 'compile', 'warning', /^Two places in the PDF share the link target page\.1/);
has(compiled(XELATEX_GLYPH), 'compile', 'warning', /^The font lmroman10-regular has no 漢 \(U\+6F22\), so it’s missing from the PDF$/);
none(compiled(XELATEX_GLYPH), 'compile', /link target/);

// ─── the source: a small paper with something wrong in each group ───

const MAIN = String.raw`\documentclass{article}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage{soul}
\graphicspath{{figures/}}
\title{Small Things}
\author{Ada Lovelace\thanks{Funded by nobody.}}
\begin{document}
\maketitle
\begin{abstract}
We look at small things.
\end{abstract}
\section{Introduction}\label{sec:intro}
As \citet{knuth84} and \cite{missing20} show, see Section~\ref{sec:method} and \ref{sec:nowhere}.
\todo{Check this claim}
% TODO: cite the survey
\hl{Highlighted draft text.}
\input{sections/Method}
\section{Results}\label{sec:intro}
Figure~\ref{fig:plot} shows it.
\begin{figure}
  \includegraphics[width=\linewidth]{Plot}
  \caption{A plot.}\label{fig:plot}
\end{figure}
\begin{figure}
  \includegraphics[alt={A missing chart}]{figures/chart}
  \caption{Never mentioned.}
\end{figure}
\includegraphics{/Users/me/Desktop/logo.png}
\includegraphics{scan.tif}
More at \href{https://example.com}{here}.
\section*{Acknowledgements}
Thanks to Charles.
\bibliography{refs}
\end{document}
`;
const METHOD = String.raw`\section{Method}\label{sec:method}
\subsubsection{Details}
We follow \cite{knuth84}.
`;
// made here, so nothing that looks like a real token is in the source
const TOKEN = `gh${'p'}_${'A1b2C3d4'.repeat(5)}`;
const BIB: BibRecord[] = [
  { file: 'refs.bib', line: 1, key: 'knuth84', type: 'article', fields: ['author', 'title', 'journal', 'year', 'doi'], doi: '10.1000/xyz' },
  { file: 'refs.bib', line: 8, key: 'knuth-again', type: 'article', fields: ['author', 'title', 'journal', 'year', 'doi'], doi: '10.1000/xyz', duplicateOf: { key: 'knuth84', file: 'refs.bib', by: 'DOI' } },
  { file: 'refs.bib', line: 15, key: 'lamport94', type: 'book', fields: ['author', 'title', 'year'] },
  { file: 'refs.bib', line: 20, key: 'knuth84', type: 'misc', fields: ['title', 'doi'], doi: 'doi:10.5555' }
];
const page = (over: Partial<PdfFacts['pages'][number]> = {}) => ({ width: 595.28, height: 841.89, chars: 2000, smallChars: 0, outside: false, text: 'Text', ...over });
const FACTS: PdfFacts = {
  version: '2.0',
  encrypted: true,
  title: '',
  author: 'Ada Lovelace',
  lang: '',
  outline: false,
  tagged: false,
  figuresWithoutAlt: 0,
  fonts: [
    { name: 'ABCDEF+CMR10', embedded: true, type3: false },
    { name: 'Helvetica', embedded: false, type3: false },
    { name: 'GHIJKL+DejaVuSans', embedded: true, type3: true }
  ],
  pages: [page(), page({ width: 612, height: 792, outside: true }), page({ smallChars: 400 }), page({ chars: 0, text: '' }), page({ width: 841.89, height: 595.28 })]
};
const FILES = [
  { path: 'main.tex', text: MAIN },
  { path: 'sections/method.tex', text: METHOD },
  { path: 'notes/keys.txt', text: `The deploy key:\ntoken = ${TOKEN}\n` },
  { path: 'refs.bib', text: '' },
  { path: 'figures/plot.png' },
  { path: 'scan.tif' },
  { path: '.env' }
];
const found = runPreflight(input({ files: FILES, bib: BIB, pdfFacts: FACTS, anonymous: true }));

// References and assets
has(found, 'references', 'warning', /^No bibliography entry has the key “missing20”$/, 'main.tex:14');
has(found, 'references', 'warning', /^Nothing has the label “sec:nowhere”$/, 'main.tex:14');
none(found, 'references', /sec:method/);
has(found, 'references', 'warning', /^The label “sec:intro” is used 2 times \(first at main\.tex:13\)/, 'main.tex:19');
has(found, 'references', 'warning', /^The key “knuth84” is in the bibliography twice \(first at refs\.bib:1\)$/, 'refs.bib:20');
has(found, 'references', 'warning', /^“knuth-again” looks like the same work as “knuth84” \(same DOI\)$/, 'refs.bib:8');
has(found, 'references', 'warning', /^The book entry “lamport94” has no publisher$/, 'refs.bib:15');
has(found, 'references', 'warning', /^The DOI of “knuth84” doesn’t look like one/, 'refs.bib:20');
has(found, 'references', 'info', /^2 entries in refs\.bib are never cited: knuth-again and lamport94$/, 'refs.bib:8');
has(found, 'references', 'error', /^Can’t find the image “figures\/chart”$/, 'main.tex:26');
has(found, 'references', 'info', /^Figure “Never mentioned\.” has no \\label/, 'main.tex:25');
none(found, 'references', /A plot|Plot/);

// Privacy and blind review
has(found, 'privacy', 'warning', /^\.env looks like it holds a key or password/);
has(found, 'privacy', 'error', /^This line holds what looks like a GitHub token$/, 'notes/keys.txt:2');
if (found.some((f) => f.message.includes(TOKEN))) throw new Error('a finding repeats the token');
has(found, 'privacy', 'warning', /^A \\todo note is left in: “Check this claim”$/, 'main.tex:15');
has(found, 'privacy', 'info', /^TODO comment: “cite the survey”$/, 'main.tex:16');
has(found, 'privacy', 'warning', /^Highlighted text/, 'main.tex:17');
has(found, 'privacy', 'warning', /^\\author names the authors: “Ada Lovelace”$/, 'main.tex:7');
has(found, 'privacy', 'warning', /^\\thanks can identify the authors$/, 'main.tex:7');
has(found, 'privacy', 'warning', /^The acknowledgements can identify the authors$/, 'main.tex:32');
has(found, 'privacy', 'warning', /^The PDF’s Author field says “Ada Lovelace”$/);
const named = runPreflight(input({ files: FILES, bib: BIB, pdfFacts: FACTS, anonymous: false }));
none(named, 'privacy', /authors|Author field/);
const hidden = runPreflight(input({ files: [{ path: 'main.tex', text: MAIN.replace('{article}', '[anonymous]{acmart}') }], anonymous: true }));
none(hidden, 'privacy', /\\author|\\thanks/);

// Accessibility
has(found, 'accessibility', 'warning', /^The PDF has no title/);
has(found, 'accessibility', 'warning', /^The PDF doesn’t say what language/);
has(found, 'accessibility', 'warning', /^The PDF isn’t tagged/);
has(found, 'accessibility', 'warning', /^5% of the text is smaller than 6pt \(page 3\)$/, 'p3');
has(found, 'accessibility', 'warning', /^The PDF has no bookmarks/);
has(found, 'accessibility', 'warning', /^Page 4 has no text a screen reader can read$/, 'p4');
has(found, 'accessibility', 'info', /^The image “Plot” has no alt text$/, 'main.tex:22');
none(found, 'accessibility', /figures\/chart/);
has(found, 'accessibility', 'warning', /^“Details” jumps from a section to a subsubsection$/, 'sections/method.tex:2');
has(found, 'accessibility', 'info', /^The link text “here” doesn’t say where it goes$/, 'main.tex:31');

// Submission readiness
has(found, 'submission', 'info', /^The PDF is version 2\.0/);
has(found, 'submission', 'error', /^The PDF is encrypted/);
has(found, 'submission', 'error', /^The font Helvetica isn’t embedded in the PDF$/);
has(found, 'submission', 'warning', /^The font DejaVuSans is a Type 3 font/);
none(found, 'submission', /CMR10/);
has(found, 'submission', 'error', /^“sections\/Method” only matches sections\/method\.tex when letter case is ignored/, 'main.tex:18');
has(found, 'submission', 'error', /^“Plot” only matches figures\/plot\.png when letter case is ignored/, 'main.tex:22');
has(found, 'submission', 'error', /^The image “\/Users\/me\/Desktop\/logo\.png” has an absolute path/, 'main.tex:29');
has(found, 'submission', 'warning', /^scan\.tif is a \.tif image, which pdfLaTeX can’t include/, 'main.tex:30');
has(found, 'submission', 'info', /^The document has no keywords$/);
none(found, 'submission', /no abstract/);

// Compile and layout, from the PDF alone
has(found, 'compile', 'warning', /^Page 2 is US Letter \(612 × 792 pt\), unlike the rest, which are A4 \(595 × 842 pt\)$/, 'p2');
has(found, 'compile', 'warning', /^Text runs past the edge of page 2$/, 'p2');

// each group in order, errors first
const order = found.map((f) => f.group).filter((g, i, all) => all.indexOf(g) === i);
eq(order, ['compile', 'references', 'privacy', 'accessibility', 'submission'], 'groups in order');
const ranks = found.filter((f) => f.group === 'references').map((f) => f.severity);
eq(ranks, [...ranks].sort((a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b)), 'errors first');

// TexLab's diagnostics add what the scan missed, and nothing it found already
// \subref is one the scan doesn't know
const LATER = `${METHOD}Again \\ref{sec:nowhere} and \\subref{sec:later}.\n`;
/** A diagnostic over `word` on `line` of `text`, as the route gives it. */
const over = (text: string, line: number, word: string, message: string, code: string) => {
  const col = text.split('\n')[line - 1].indexOf(word) + 1;
  return { line, col, endLine: line, endCol: col + word.length, severity: 'error' as const, message, code, source: 'texlab' };
};
const diagnosed = runPreflight(
  input({
    files: FILES.map((f) => (f.path === 'sections/method.tex' ? { ...f, text: LATER } : f)),
    bib: BIB,
    diagnostics: {
      // found by the scan already, on the same line
      'main.tex': [over(MAIN, 14, 'sec:nowhere', 'Undefined reference', 'undefined-label'), { ...over(MAIN, 13, 'sec:intro', 'Unused label', 'unused-label'), severity: 'info' }],
      'sections/method.tex': [
        // found by the scan already, by its key
        over(LATER, 4, 'sec:nowhere', 'Undefined reference', 'undefined-label'),
        over(LATER, 4, 'sec:later', 'Undefined reference', 'undefined-label')
      ],
      'refs.bib': [{ line: 6, col: 1, endLine: 6, endCol: 2, severity: 'error', message: 'Expecting a curly bracket', code: 'bib-syntax', source: 'texlab' }],
      'other.tex': [{ line: 1, col: 1, endLine: 1, endCol: 2, severity: 'error', message: 'Undefined reference', code: 'undefined-label', source: 'texlab' }]
    }
  })
);
eq(
  brief(diagnosed, 'references').filter(([, m]) => String(m).includes('TexLab')),
  [
    ['error', 'Expecting a curly bracket (TexLab)', 'refs.bib:6'],
    ['warning', 'Undefined reference: “sec:later” (TexLab)', 'sections/method.tex:4']
  ],
  'TexLab'
);

// code isn't the document: verbatim, listings, \verb and a \newcommand's body, whose # arguments aren't keys
const CODE = String.raw`\documentclass{article}
\usepackage{graphicx}
\usepackage{listings}
\newcommand{\fig}[2]{\begin{figure}\includegraphics{#1}\caption{#2}\label{fig:#1}\end{figure}}
\begin{document}
\begin{verbatim}
\includegraphics{nothere.png} see \ref{sec:none} and \cite{nobody}
\end{verbatim}
Use \verb|\cite{alsonobody}| to cite.
\begin{lstlisting}[language=Python, label={lst:python}]
print("\ref{inside}")
\end{lstlisting}
See Listing~\ref{lst:python} and \ref{lst:c}.
\lstinputlisting[label=lst:c]{code.c}
\end{document}
`;
const code = runPreflight(input({ files: [{ path: 'main.tex', text: CODE }, { path: 'code.c' }] }));
eq(
  code.filter((f) => f.group === 'references' || f.group === 'accessibility').map((f) => f.message),
  [],
  'nothing from code or a definition'
);

// after a compile that made its PDF, what TeX found outside the project (the TeX tree, a central .bib) isn't missing
const ELSEWHERE = String.raw`\documentclass{article}
\usepackage{graphicx}
\begin{document}
\includegraphics{example-image-golden} \includegraphics{gone} \cite{knuth84}
\bibliography{central}
\end{document}
`;
const usedLog = "File: example-image-golden.pdf Graphic file (type pdf)\n<use example-image-golden.pdf>\n! LaTeX Error: File `gone' not found.\n";
const elsewhere = (log: string, failed = false) => runPreflight(input({ files: [{ path: 'main.tex', text: ELSEWHERE }], log, failed, bib: [] }));
eq(
  brief(elsewhere(usedLog), 'references'),
  [['error', 'Can’t find the image “gone”', 'main.tex:4']],
  'the TeX tree’s image and a .bib found through BIBINPUTS'
);
has(elsewhere(usedLog, true), 'references', 'error', /^Can’t find the image “example-image-golden”$/);
has(elsewhere(''), 'references', 'error', /^The document cites sources but has no bibliography/);
has(elsewhere(`${usedLog}LaTeX Warning: Citation \`knuth84' on page 1 undefined on input line 4.\n`), 'references', 'error', /^The document cites sources but has no bibliography/);
has(elsewhere(`${usedLog}I couldn't open database file central.bib\n`), 'references', 'error', /^The document cites sources but has no bibliography/);

// after a clean compile a reference or citation is missing only if the log says so, from the scan or TexLab: a
// \newtcbtheorem's label the scan doesn't see, a listing's label= TexLab doesn't read, a key in a central .bib
const RESOLVED = String.raw`\documentclass{article}
\usepackage{listings}
\begin{document}
\begin{lstlisting}[label={lst:python}]
x
\end{lstlisting}
See Listing~\ref{lst:python}.
And \ref{lem:ohm}.
As \cite{knuth84} shows.
\bibliography{central}
\end{document}
`;
const resolved = (log: string) =>
  runPreflight(
    input({
      files: [{ path: 'main.tex', text: RESOLVED }],
      log,
      bib: [],
      diagnostics: {
        'main.tex': [
          over(RESOLVED, 7, 'lst:python', 'Undefined reference', 'undefined-label'),
          over(RESOLVED, 8, 'lem:ohm', 'Undefined reference', 'undefined-label'),
          over(RESOLVED, 9, 'knuth84', 'Undefined citation', 'undefined-citation')
        ]
      }
    })
  );
eq(brief(resolved('Output written on main.pdf (1 page).\n'), 'references'), [], 'what a clean compile resolved');
eq(
  brief(resolved("LaTeX Warning: Reference `lem:ohm' on page 1 undefined on input line 8.\nLaTeX Warning: Citation `knuth84' on page 1 undefined on input line 9.\n"), 'references'),
  [
    ['error', 'The document cites sources but has no bibliography: no .bib file and no thebibliography', 'main.tex:9'],
    ['warning', 'Nothing has the label “lem:ohm”', 'main.tex:8']
  ],
  'what the log says it didn’t'
);
eq(
  brief(resolved(''), 'references').map(([, m]) => m),
  ['The document cites sources but has no bibliography: no .bib file and no thebibliography', 'Nothing has the label “lem:ohm”'],
  'without a compile, and never a listing’s label'
);

// the same finding twice on a line is one, which Review's Dismiss and its row keys need
const twice = runPreflight(input({ files: [{ path: 'main.tex', text: '\\documentclass{article}\n\\begin{document}\n\\hl{a} and \\hl{b}\n\\end{document}\n' }] }));
eq(brief(twice, 'privacy'), [['warning', 'Highlighted text (\\hl) is left in', 'main.tex:3']], 'once');

// a venue style's review option hides the authors itself, and an Author field of Anonymous names no one
const REVIEW = MAIN.replace('\\usepackage{soul}', '\\usepackage[review]{cvpr}');
const reviewed = runPreflight(input({ files: [{ path: 'main.tex', text: REVIEW }], pdfFacts: { ...FACTS, author: 'Anonymous CVPR submission' }, anonymous: true }));
none(reviewed, 'privacy', /\\author|\\thanks|Author field/);

// a document with no title (a CV, a letter) needs no abstract; a thesis's \chapter*{Abstract} is one; notes get a note
const story = (body: string) => runPreflight(input({ files: [{ path: 'main.tex', text: `\\documentclass{report}\n\\begin{document}\n${body}\n\\end{document}\n` }] }));
none(story('Dear Ada,'), 'submission', /abstract|keywords/);
none(story('\\maketitle\n\\chapter*{Abstract}\nWe did it.'), 'submission', /abstract/);
has(story('\\maketitle\nNotes.'), 'submission', 'info', /^The document has no abstract$/);

// a PDF pdf.js couldn't open for its password: its encryption, and nothing read from it as if it had been
const locked: PdfFacts = { ...shows([]), encrypted: true, title: '', lang: '', tagged: false, outline: false, fonts: null };
const shut = runPreflight(input({ files: FILES, bib: BIB, pdfFacts: locked }));
none(shut, 'accessibility', /The PDF/);
has(shut, 'submission', 'error', /^The PDF is encrypted/);
eq(preflightGaps({ log: 'x', failed: false, pdfFacts: locked, anonymous: false }), { accessibility: 'The PDF is password-protected, so its accessibility couldn’t be read.' }, 'a locked PDF');

// what can’t be checked yet says so
eq(
  preflightGaps({ log: '', failed: false, pdfFacts: null, anonymous: true }),
  {
    compile: 'Compile first.',
    accessibility: 'Compile first: most of these checks read the PDF.',
    submission: 'Compile first: the PDF’s version, fonts and encryption need a PDF.',
    privacy: 'Compile first: the PDF’s Author field needs a PDF.'
  },
  'gaps'
);
eq(preflightGaps({ log: 'x', failed: true, pdfFacts: null, anonymous: false }).compile, 'The last compile made no PDF: the page checks need a PDF.', 'a failed compile');
eq(preflightGaps({ log: 'x', failed: false, pdfFacts: FACTS, anonymous: true }), {}, 'no gaps');

console.log('preflight.check: ok');
