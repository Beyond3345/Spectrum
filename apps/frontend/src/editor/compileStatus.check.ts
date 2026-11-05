// Self-check for the status line over a running compile, with output captured from TeX Live 2026 on a Mac (paths
// shortened) and MiKTeX's own example of installing a package. Run:
// npx esbuild apps/frontend/src/editor/compileStatus.check.ts --bundle --platform=node --log-level=warning --outfile=<scratch>/compileStatus.cjs && node <scratch>/compileStatus.cjs
import { compileStatus } from './compileStatus';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const lines = (...text: string[]) => text.join('\n') + '\n';

// Tectonic
eq(compileStatus('tectonic', ''), 'Starting…', 'nothing yet');
eq(compileStatus('tectonic', 'note: downloading tectonic-format-latex.tex\n'), 'Downloading tectonic-format-latex.tex… (1 file so far)', 'one download');
eq(
  compileStatus('tectonic', 'note: downloading xelatex.ini\r\nnote: downloading latex.ltx\r\nsome TeX output\r\nnote: downloading article.cls'),
  'Downloading article.cls… (3 files so far)',
  'downloads counted, Windows line ends'
);
eq(compileStatus('tectonic', 'note: downloading a.tex\nnote: Running TeX ...\n(./main.tex'), 'Running TeX', 'TeX');
eq(
  compileStatus('tectonic', Array.from({ length: 20 }, (_, i) => `note: downloading f${i}.sty\n`).join('')),
  'Downloading f19.sty… (20 files so far). The first compile downloads the packages it needs; later ones are quick.',
  'a first compile’s many downloads'
);
eq(compileStatus('tectonic', 'note: Rerunning TeX because "main.aux" changed ...\n'), 'Running TeX again', 'rerun');
eq(compileStatus('tectonic', 'note: Running external tool biber ...\n'), 'Running Biber', 'Biber');
eq(compileStatus('tectonic', 'note: Running external tool bibtex ...\n'), 'Running BibTeX', 'BibTeX');
eq(compileStatus('tectonic', 'note: Running xdvipdfmx ...\n'), 'Running xdvipdfmx', 'xdvipdfmx');
eq(compileStatus('tectonic', 'note: Writing `main.pdf` (5.47 KiB)\n'), 'Writing the PDF', 'writing');
eq(compileStatus('tectonic', 'note: connecting to https://relay.fullyjustified.net\n'), 'Connecting to https://relay.fullyjustified.net', 'any other note');
eq(compileStatus('tectonic', 'a line that mentions note: downloading x\n'), 'Starting…', 'only notes at a line’s start');

// pdfLaTeX
const pdfStart = lines(
  'This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex)',
  ' restricted \\write18 enabled.',
  'entering extended mode'
);
eq(compileStatus('pdflatex', ''), 'Starting…', 'pdfLaTeX, nothing yet');
eq(compileStatus('pdflatex', pdfStart), 'Running pdfLaTeX, pass 1: starting', 'banner');
const pdfReading =
  pdfStart +
  lines(
    '(./main.tex',
    'LaTeX2e <2026-06-01>',
    'L3 programming layer <2026-09-09>',
    '(/usr/local/texlive/2026/texmf-dist/tex/latex/base/article.cls',
    'Document Class: article 2025/01/22 v1.4n Standard LaTeX document class',
    '(/usr/local/texlive/2026/texmf-dist/tex/latex/base/size10.clo))',
    '(/usr/local/texlive/2026/texmf-dist/tex/latex/base/makeidx.sty)',
    'Writing index file main.idx',
    '(/usr/local/texlive/2026/texmf-dist/tex/latex/biblatex/biblatex.sty'
  );
eq(compileStatus('pdflatex', pdfReading), 'Running pdfLaTeX, pass 1: reading biblatex.sty', 'the file opened last');
// TeX breaks a long path at 79 characters
const path = '(/Users/someone/Documents/Spectrum/A long project name for the paper/sections/introduction.tex';
const broken = path.match(/.{1,79}/g)!.join('\n');
eq(compileStatus('pdflatex', pdfReading + broken + '\n'), 'Running pdfLaTeX, pass 1: reading introduction.tex', 'a path TeX broke');
const pdfPages =
  pdfReading +
  lines(
    'LaTeX Warning: Citation \'knuth\' on page 1 undefined on input line 8.',
    '',
    '[1{/usr/local/texlive/2026/texmf-var/fonts/map/pdftex/updmap/pdftex.map}]',
    '[2]'
  );
eq(compileStatus('pdflatex', pdfPages), 'Running pdfLaTeX, pass 1: 2 pages so far', 'pages written');
eq(
  compileStatus('pdflatex', pdfPages + lines('No file main.ind.', '[3]', '(/private/tmp/spectrum-build/f6e4bcc2/main.aux)')),
  'Running pdfLaTeX, pass 1: reading main.aux, 3 pages so far',
  'a file after the pages'
);
eq(compileStatus('pdflatex', pdfPages + lines('(./main.ind [3] [4])')), 'Running pdfLaTeX, pass 1: 4 pages so far', 'pages on one line');
const biber = lines('INFO - This is Biber 2.22', 'INFO - Logfile is \'main.blg\'', 'INFO - Reading \'main.bcf\'');
eq(compileStatus('pdflatex', pdfPages + biber), 'Running Biber', 'Biber');
const makeindex = lines('This is makeindex, version 2.18 [TeX Live 2026] (kpathsea + Thai support).', 'Scanning input file main.idx....done (1 entries accepted, 0 rejected).');
eq(compileStatus('pdflatex', pdfPages + biber + makeindex), 'Running MakeIndex', 'MakeIndex');
eq(compileStatus('pdflatex', pdfPages + biber + makeindex + pdfStart + lines('(./main.tex')), 'Running pdfLaTeX, pass 2: reading main.tex', 'the next pass');
eq(compileStatus('pdflatex', pdfPages + lines('This is BibTeX, Version 0.99e (TeX Live 2026)', 'The top-level auxiliary file: main.aux')), 'Running BibTeX', 'BibTeX');
eq(
  compileStatus('pdflatex', pdfPages + lines('Warning: File \'g.acn\' is empty.', 'makeglossaries version 5.1 (2026-04-21)', "added glossary type 'main' (glg,gls,glo)")),
  'Running makeglossaries',
  'makeglossaries'
);
eq(compileStatus('pdflatex', pdfPages + lines('makeglossaries.lua version 5.1 (2026-04-21)', "Parsing 'g.aux'")), 'Running makeglossaries', 'makeglossaries-lite');

// XeLaTeX and LuaLaTeX
eq(
  compileStatus('xelatex', lines('This is XeTeX, Version 3.141592653-2.6-0.999998 (TeX Live 2026) (preloaded format=xelatex)', ' restricted \\write18 enabled.', 'entering extended mode', '(./main.tex', '[1] [2]')),
  'Running XeLaTeX, pass 1: 2 pages so far',
  'XeLaTeX'
);
eq(
  compileStatus('lualatex', lines('This is LuaHBTeX, Version 1.24.0 (TeX Live 2026) ', ' restricted system commands enabled.', '(./main.tex', '(/usr/local/texlive/2026/texmf-dist/tex/latex/lipsum/lipsum.sty')),
  'Running LuaLaTeX, pass 1: reading lipsum.sty',
  'LuaLaTeX'
);

// latexmk
const latexmk = lines(
  'Rc files read (in order):',
  '  NONE',
  'Latexmk: This is Latexmk, John Collins, 9 March 2026. Version 4.88.',
  "No existing .aux file, so I'll make a simple one, and require run of *latex.",
  "Latexmk: applying rule 'pdflatex'...",
  "Rule 'pdflatex':  Reasons for rerun",
  '------------',
  "Run number 1 of rule 'pdflatex'",
  '------------',
  '------------',
  'Running \'pdflatex  -interaction=nonstopmode -file-line-error -synctex=1 -recorder -output-directory="/private/tmp/spectrum-build/ea883a45"  "./main.tex"\''
);
eq(compileStatus('latexmk', latexmk.split('\n').slice(0, 4).join('\n')), 'Starting…', 'latexmk before its first rule');
eq(compileStatus('latexmk', latexmk), 'Running pdfLaTeX (run 1)', 'latexmk’s rule');
eq(compileStatus('latexmk', latexmk + pdfStart + lines('(./main.tex', '[1]')), 'Running pdfLaTeX, pass 1: 1 page so far', 'latexmk’s TeX');
eq(
  compileStatus('latexmk', latexmk + pdfStart + lines("Latexmk: applying rule 'biber /private/tmp/spectrum-build/ea883a45/main'...", '------------', "Run number 1 of rule 'biber /private/tmp/spectrum-build/ea883a45/main'", '------------')),
  'Running Biber (run 1)',
  'latexmk’s Biber'
);
eq(compileStatus('latexmk', lines("Run number 1 of rule 'makeindex /private/tmp/spectrum-build/ea883a45/main.idx'")), 'Running MakeIndex (run 1)', 'latexmk’s MakeIndex');
eq(compileStatus('latexmk', lines("Run number 3 of rule 'pdflatex'")), 'Running pdfLaTeX (run 3)', 'a later run');

// MiKTeX installing a package TeX asked for (miktex.org/kb/just-enough-tex), then TeX carrying on
const rule = '='.repeat(70);
const miktex = [
  rule,
  'starting package maintenance...',
  'installation directory: ~/miktex/texmfs/user/install',
  'package repository: https://ctanmirror/ctan/systems/win32/miktex/tm/packages/next/',
  'visiting repository https://ctanmirror/systems/win32/miktex/tm/packages/next/...',
  'repository type: remote package repository',
  'loading lightweight database...',
  'downloading https://ctanmirror/systems/win32/miktex/tm/packages/next/miktex-zzdb1-2.9.tar.lzma...',
  '173544 bytes, 459.29 KB/Sec',
  'lightweight database digest: a59926f76b83fcc2ac8f84b6d3d792de',
  'going to download 9376605 bytes',
  'going to install 209 file(s) (1 package(s))',
  'downloading https://ctanmirror/systems/win32/miktex/tm/packages/next/ltxbase.tar.lzma...',
  '9376605 bytes, 4152.76 KB/Sec',
  'extracting files from ltxbase.tar.lzma...',
  rule
];
const miktexStart = lines('This is pdfTeX, Version 3.141592653-2.6-1.40.27 (MiKTeX 25.4) (preloaded format=pdflatex.fmt)', 'entering extended mode', '(main.tex');
const upTo = (text: string) => miktexStart + lines(...miktex.slice(0, miktex.indexOf(text) + 1));
eq(compileStatus('pdflatex', upTo('starting package maintenance...')), 'MiKTeX is installing packages…', 'MiKTeX starts');
eq(compileStatus('pdflatex', upTo('loading lightweight database...')), 'MiKTeX is installing packages…', 'MiKTeX’s details');
eq(compileStatus('pdflatex', upTo('173544 bytes, 459.29 KB/Sec')), 'MiKTeX is reading its package list…', 'MiKTeX’s package list');
eq(compileStatus('pdflatex', upTo('9376605 bytes, 4152.76 KB/Sec')), 'MiKTeX is installing ltxbase…', 'MiKTeX downloads');
eq(compileStatus('pdflatex', upTo('extracting files from ltxbase.tar.lzma...')), 'MiKTeX is installing ltxbase…', 'MiKTeX extracts');
eq(
  compileStatus('pdflatex', miktexStart + lines(...miktex, '("C:\\Program Files\\MiKTeX\\tex/latex/base\\article.cls"')),
  'Running pdfLaTeX, pass 1: reading article.cls',
  'TeX carries on after MiKTeX'
);

console.log('compileStatus: ok');
