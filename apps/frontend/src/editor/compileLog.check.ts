// Self-check for the log parser: `node apps/frontend/src/editor/compileLog.check.ts` (Node ≥ 23 strips the types).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EditorState, Text } from '@codemirror/state';
import { parseCompileLog, projectFile } from './compileLog.ts';
import { compileLint, compileMarks, compileMarksField, setCompileMarks } from './compileMarks.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const brief = (log: string, root?: string) => parseCompileLog(log, root).map((e) => [e.severity, e.file ?? '', e.line ?? 0, e.message]);

// Tectonic: repeated passes collapse, located error beats TeX's own "!" block and the generic summary
eq(
  brief(
    [
      'note: Running TeX ...',
      'warning: main.tex:363: Underfull \\hbox (badness 3019) in paragraph at lines 345--363',
      'error: main.tex:3: Undefined control sequence',
      'error: something bad happened inside XeTeX; its output follows:',
      '! Undefined control sequence.',
      'l.3 Hello \\foo',
      'error: the XeTeX engine had an unrecoverable error',
      'note: Rerunning TeX because "main.aux" changed ...',
      'warning: main.tex:363: Underfull \\hbox (badness 3019) in paragraph at lines 345--363',
      'warning: warnings were issued by the TeX engine; use --print and/or --keep-logs for details.'
    ].join('\n')
  ),
  [
    ['error', 'main.tex', 3, 'Undefined control sequence \\foo'],
    ['warning', 'main.tex', 345, 'Underfull \\hbox (badness 3019) in paragraph at lines 345--363']
  ],
  'tectonic'
);

// pdfLaTeX with -file-line-error, package warnings with continuation lines, boxes
eq(
  brief(
    [
      './chapters/intro.tex:12: Undefined control sequence.',
      'l.12 \\foo',
      'LaTeX Warning: Reference `fig:x\' on page 1 undefined on input line 40.',
      'Package hyperref Warning: Token not allowed in a PDF string (Unicode):',
      '(hyperref)                removing `\\\\\' on input line 5.',
      'Overfull \\hbox (12.3pt too wide) in paragraph at lines 10--12',
      '! LaTeX Error: File `l3backend-pdftex.def\' not found.',
      '',
      'l.2 \\begin{document}',
      '!  ==> Fatal error occurred, no output PDF file produced!'
    ].join('\n')
  ),
  [
    ['error', 'chapters/intro.tex', 12, 'Undefined control sequence \\foo.'],
    ['error', '', 2, "LaTeX Error: File `l3backend-pdftex.def' not found."],
    ['warning', '', 40, "Reference `fig:x' on page 1 undefined on input line 40."],
    ['warning', '', 5, "Token not allowed in a PDF string (Unicode): removing `\\\\' on input line 5."],
    ['warning', '', 10, 'Overfull \\hbox (12.3pt too wide) in paragraph at lines 10--12']
  ],
  'pdflatex'
);

// pdfLaTeX wraps at 79 columns, even inside absolute paths and line numbers; build-folder files lose their prefix
const root = '/Users/me/Documents/Spectrum/ACL paper';
const wrap = (text: string) => text.match(/.{1,79}/g)!.join('\n');
eq(
  brief(
    [
      wrap(`${root}/main.tex:109: Undefined control sequence.`),
      'l.109 \\undefinedmacro',
      wrap(`${root}/.spectrum/build/3bfa42e6-1587-490e-9ae4-083dbd6778d9/main.bbl:4: LaTeX Error: Something's wrong--perhaps a missing \\item.`),
      "I couldn't open database file custom.bib"
    ].join('\n'),
    root
  ),
  [
    ['error', 'main.tex', 109, 'Undefined control sequence \\undefinedmacro.'],
    ['error', 'main.bbl', 4, "LaTeX Error: Something's wrong--perhaps a missing \\item."],
    ['error', '', 0, "I couldn't open database file custom.bib"]
  ],
  'wrapped pdflatex'
);

// the command TeX could not find is named from the end of its "l.N" line, here after other text
eq(brief(['./main.tex:153: Undefined control sequence.', 'l.153 ...ter\'s cut-off. The gain is \\gainval', '                                         {} here.'].join('\n')), [['error', 'main.tex', 153, 'Undefined control sequence \\gainval.']], 'named command');

// a chapter \include could not find is a warning, while a first run's missing .toc is nothing
eq(brief(['No file main.toc.', 'No file chapters/intro.tex.', '(./chapters/methods.tex)'].join('\n')), [['warning', '', 0, 'No file chapters/intro.tex: \\include left it out of the PDF.']], 'missing include');

// a missing package is one error, not three: TeX's emergency stop and fatal error after it only repeat it
eq(
  brief(["! LaTeX Error: File `notarealpackage.sty' not found.", '', 'Enter file name: ', './main.tex:4: Emergency stop.', '<read *> ', 'l.4 \\usepackage', './main.tex:4:  ==> Fatal error occurred, no output PDF file produced!'].join('\n')),
  [['error', '', 4, "LaTeX Error: File `notarealpackage.sty' not found."]],
  'missing package'
);
// an emergency stop with nothing before it is still an error
eq(brief(['./main.tex:9: Emergency stop.', 'l.9 \\end'].join('\n')), [['error', 'main.tex', 9, 'Emergency stop.']], 'lone emergency stop');

// warnings count from the last TeX pass only (earlier ones are repeats or fixed by BibTeX); errors from any pass
const pass = (warning: string) =>
  ['This is pdfTeX, Version 3.141592653-2.6-1.40.28 (TeX Live 2026)', warning, './main.tex:7: Undefined control sequence.', 'Transcript written on main.log.'].join('\n');
eq(
  brief([pass("LaTeX Warning: Citation `Knuth1984' on page 1 undefined on input line 2."), 'This is BibTeX, Version 0.99d', "I couldn't open style file x.bst", pass(''), pass('Overfull \\hbox (1pt too wide) in paragraph at lines 3--4')].join('\n')),
  [
    ['error', 'main.tex', 7, 'Undefined control sequence.'],
    ['error', '', 0, "I couldn't open style file x.bst"],
    ['warning', '', 3, 'Overfull \\hbox (1pt too wide) in paragraph at lines 3--4']
  ],
  'last pass'
);

// Tectonic names \input files without ".tex"; locations resolve against the main file's folder
eq(
  brief(['note: Running TeX ...', 'warning: sections/intro:2: Overfull \\hbox (78.5pt too wide) detected at line 2', 'error: sections/broken:2: Undefined control sequence'].join('\n')),
  [
    ['error', 'sections/broken', 2, 'Undefined control sequence'],
    ['warning', 'sections/intro', 2, 'Overfull \\hbox (78.5pt too wide) detected at line 2']
  ],
  'tectonic without extension'
);
const files = ['paper/main.tex', 'paper/sections/intro.tex', 'shared/macros.tex', 'main.tex'];
eq(
  ['sections/intro', 'main.tex', 'shared/macros.tex', '../shared/macros.tex', 'lineno.sty'].map((f) => projectFile(f, 'paper/main.tex', files)),
  ['paper/sections/intro.tex', 'paper/main.tex', 'shared/macros.tex', 'shared/macros.tex', 'lineno.sty'],
  'projectFile'
);
eq(projectFile('main.tex', 'main.tex', files), 'main.tex', 'projectFile at the root');

// warnings that only say "on input line N" belong to the file TeX is reading: follow its "(file … )" nesting
eq(
  brief(
    [
      'This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex 2026.10.11)',
      wrap(`(${root}/main.tex`),
      'LaTeX2e <2026-06-01>',
      '(/usr/local/texlive/2026/texmf-dist/tex/latex/base/article.cls',
      'Document Class: article 2025/01/22 v1.4n Standard LaTeX document class',
      '(/usr/local/texlive/2026/texmf-dist/tex/latex/base/size10.clo',
      'File: size10.clo 2025/01/22 v1.4n Standard LaTeX file (size option)',
      ')',
      ')',
      'Package hyperref Warning: Option `pdfborder\' has already been used on input line 7.',
      '(./sections/intro.tex',
      '',
      "LaTeX Warning: Citation `ghost' on page 1 undefined on input line 3.",
      '',
      'Overfull \\hbox (94.75012pt too wide) detected at line 4',
      '\\OT1/cmr/m/n/10 an (unbalanced bracket in the text',
      ' []',
      '',
      ')',
      '',
      "LaTeX Warning: Reference `alsomissing' on page 1 undefined on input line 5.",
      '',
      '[1',
      '',
      '{/usr/local/texlive/2026/texmf-var/fonts/map/pdftex/updmap/pdftex.map}]',
      '(./main.aux)',
      '',
      'LaTeX Warning: There were undefined references.',
      '',
      ' ) '
    ].join('\n'),
    root
  ),
  [
    ['warning', 'main.tex', 7, "Option `pdfborder' has already been used on input line 7."],
    ['warning', 'sections/intro.tex', 3, "Citation `ghost' on page 1 undefined on input line 3."],
    ['warning', 'sections/intro.tex', 4, 'Overfull \\hbox (94.75012pt too wide) detected at line 4'],
    ['warning', 'main.tex', 5, "Reference `alsomissing' on page 1 undefined on input line 5."],
    ['warning', 'main.tex', 0, 'There were undefined references.']
  ],
  'file nesting'
);

// a generic Tectonic error still shows when it is the only one
eq(brief('error: couldn\'t open main.tex'), [['error', '', 0, "couldn't open main.tex"]], 'loose error');
eq(brief('[spectrum note] This compile used XeLaTeX.'), [], 'log-only note');
eq(brief('[spectrum] Compile it with Auto instead.'), [['error', '', 0, 'Compile it with Auto instead.']], 'backend note');
eq(brief('[spectrum warning] notes.tex didn’t compile.'), [['warning', '', 0, 'notes.tex didn’t compile.']], 'backend warning');
eq(brief('Compiled notes.tex first for its cross-references.'), [], 'linked compile note');

// a recipe's two pdfLaTeX steps, as pdfTeX writes them when "Transcript written on" lands at the end of the SyncTeX
// line: the step lines are notes, and only the last pass's warnings count (none: the reference resolved)
eq(
  brief(
    [
      '',
      '[spectrum note] Recipe: pdflatex',
      'This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex)',
      '(./recipe-probe.tex',
      'No file recipe-probe.aux.',
      "LaTeX Warning: Reference `sec:one' on page 1 undefined on input line 5.",
      '',
      'LaTeX Warning: There were undefined references.',
      'SyncTeX written on /tmp/b/recipe-probe.synctex.gz.Transcript written on /tmp/b/recipe-probe.log.',
      '',
      '[spectrum note] Recipe: pdflatex',
      'This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex)',
      '(./recipe-probe.tex (/tmp/b/recipe-probe.aux) [1] (/tmp/b/recipe-probe.aux) )',
      'Output written on /tmp/b/recipe-probe.pdf (1 page, 21950 bytes).',
      'SyncTeX written on /tmp/b/recipe-probe.synctex.gz.Transcript written on /tmp/b/recipe-probe.log.'
    ].join('\n')
  ),
  [],
  'recipe passes'
);

// Every "[spectrum] " line the backend writes into a compile log is listed as an error: each must be a real failure
// named here. Information or progress (a recipe's step, a download) is written "[spectrum note] ", so a new line of
// that kind written as an error fails this
const FAILURES = [
  'SVG images need rsvg-convert', // markdownService: SVG images left out of the PDF
  'Typst downloads a package the first time', // typstService: a package download failed
  '${executable} was stopped after', // typstService: time limit
  '${cmd} was stopped after', // compileService: time limit
  'biblatex with Biber needs the Biber', // compileService: no Biber for Tectonic's biblatex
  'This document uses biblatex, and Tectonic’s bundled biblatex', // compileService: Biber version mismatch
  'Couldn’t download Biber', // compileService
  'Biber failed.', // compileService
  'Biber could not run' // compileService
];
const backend = [fileURLToPath(new URL('../../../backend/src', import.meta.url)), resolve('apps/backend/src')].find((dir) => existsSync(join(dir, 'services')));
if (!backend) throw new Error('run this from the repository, where apps/backend/src is');
let audited = 0;
for (const file of readdirSync(backend, { recursive: true }) as string[]) {
  if (!file.endsWith('.js')) continue;
  for (const [, text] of readFileSync(join(backend, file), 'utf8').matchAll(/['`](?:\\n)*\[spectrum\] ([^\n'`]*)/g)) {
    audited += 1;
    if (!FAILURES.some((failure) => text.startsWith(failure))) throw new Error(`${file}: “[spectrum] ${text}” is listed as an error. Information or progress is “[spectrum note] ”; a real failure goes in FAILURES`);
  }
}
eq(audited >= FAILURES.length, true, 'the backend’s error lines were found');
for (const line of [
  '[spectrum note] Recipe: pdflatex',
  '[spectrum note] This document’s bibliography uses biblatex, which the built-in Tectonic runs with Biber. Downloading Biber 2.17 (40 MB) first, once.',
  '[spectrum note] Downloaded Biber 2.17.',
  '[spectrum note] A file kept from the last compile couldn’t be read, so this compiled again from scratch.'
]) eq(brief(line), [], line);
eq(brief('[spectrum] Biber failed. Fix the bibliography errors above and compile again.').length, 1, 'a failure is an error');

// Windows: an absolute path starts with its drive
eq(brief('C:/Users/me/thesis/chapters/intro.tex:12: Undefined control sequence.', 'C:/Users/me/thesis'), [['error', 'chapters/intro.tex', 12, 'Undefined control sequence.']], 'Windows path');
// a 79-character note isn't glued to the next line as TeX's own wrapped lines are
const note79 = '[spectrum warning] main.tex didn’t compile, so references to it may show as ??.';
eq(note79.length, 79, 'the note is 79 characters');
eq(brief(`${note79}\nThis is pdfTeX, Version 3.141592653-2.6-1.40.26\n! Undefined control sequence.`).find((e) => e[0] === 'warning')?.[3], note79.slice(19), 'note before a pass');

// Typst's errors as squiggles: line from 1, column from 0 in characters (😀 is two UTF-16 units)
const doc = Text.of(['😀 #foo', '#set text(fnt: "x")', '#text(font: "No Such")[hi]', '#']);
eq(
  compileMarks(
    [
      { severity: 'error', message: 'unknown variable: foo', file: 'main.typ', line: 1, column: 3 },
      { severity: 'error', message: 'unexpected argument: fnt', file: 'main.typ', line: 2, column: 10 },
      { severity: 'warning', message: 'unknown font family', file: 'main.typ', line: 3, column: 12 },
      { severity: 'error', message: 'at the end', file: 'main.typ', line: 4, column: 1 },
      { severity: 'error', message: 'other file', file: 'ch.typ', line: 1, column: 0 },
      { severity: 'error', message: 'past the end', file: 'main.typ', line: 9, column: 0 }
    ],
    'main.typ',
    doc
  ).map((d) => [doc.sliceString(d.from, d.to), d.severity]),
  [['foo', 'error'], ['fnt', 'error'], ['"No Such"', 'warning'], ['', 'error']],
  'compile marks underline the token Typst points at, in the open file only'
);
// TeX's: what it had read of the line kept from its "l.N …" line, the command at its end marked, else the line's text
const texLog = [
  './chapters/intro.tex:3: Undefined control sequence.',
  'l.3 The gain is \\gainval',
  '                       {} here.',
  './chapters/intro.tex:5: Missing $ inserted.',
  'l.5 The value x_',
  '                {1} is small.',
  '! Undefined control sequence.',
  'l.7 ...s is a long line that TeX shortened at the start \\oops',
  ''
].join('\n');
eq(parseCompileLog(texLog).map((e) => [e.line, e.context]), [[3, 'The gain is \\gainval'], [5, 'The value x_'], [7, '...s is a long line that TeX shortened at the start \\oops']], 'what TeX had read');
const tex = Text.of(['\\section{Intro}', '', 'The gain is \\gainval{} here.', '', '  The value x_{1} is small.', '', 'This is a long line that TeX shortened at the start \\oops and more.', 'Overfull here']);
eq(
  compileMarks(
    [
      { severity: 'error', message: 'Undefined control sequence \\gainval.', file: 'intro.tex', line: 3, context: 'The gain is \\gainval' },
      { severity: 'error', message: 'Missing $ inserted.', file: 'intro.tex', line: 5, context: 'The value x_' },
      { severity: 'error', message: 'Undefined control sequence \\oops.', file: 'intro.tex', line: 7, context: '...s is a long line that TeX shortened at the start \\oops' },
      { severity: 'warning', message: 'Overfull \\hbox', file: 'intro.tex', line: 8 },
      { severity: 'error', message: 'text since changed', file: 'intro.tex', line: 1, context: 'Something \\gone' }
    ],
    'intro.tex',
    tex,
    true
  ).map((d) => [tex.sliceString(d.from, d.to), d.severity]),
  [['\\gainval', 'error'], ['The value x_{1} is small.', 'error'], ['\\oops', 'error'], ['Overfull here', 'warning'], ['\\section{Intro}', 'error']],
  'TeX’s marks: the command it stopped after, else the line'
);

// box warnings stay in Logs but are underlined only when Settings › Engines asks (pdfTeX's and Tectonic's alike)
const boxLog = [
  '(./main.tex',
  'Overfull \\hbox (12.3pt too wide) in paragraph at lines 2--2',
  '[]\\T1/cmr/m/n/10 A long line',
  '',
  'Underfull \\vbox (badness 10000) has occurred while \\output is active []',
  '',
  'LaTeX Warning: Reference `fig:x\' on page 1 undefined on input line 3.',
  ')',
  'warning: main.tex:1: Underfull \\hbox (badness 10000) in paragraph at lines 1--1'
].join('\n');
const boxDoc = Text.of(['\\section{A}', 'A long line', 'See \\ref{fig:x}.']);
const boxErrors = parseCompileLog(boxLog).map((e) => ({ ...e, file: 'main.tex' }));
eq(boxErrors.length, 4, 'every box warning is listed in Logs');
eq(compileMarks(boxErrors, 'main.tex', boxDoc).map((d) => d.message.slice(0, 18)), ['Reference `fig:x\' '], 'box warnings are not underlined by default');
eq(compileMarks(boxErrors, 'main.tex', boxDoc, true).length, 3, 'box warnings with a line are underlined when asked');

// the marks move with the text typed before them, and the next compile's replace them
let state = EditorState.create({ doc: 'a #foo', extensions: compileLint });
state = state.update({ effects: setCompileMarks.of([{ from: 3, to: 6, severity: 'error', message: 'm' }]) }).state;
state = state.update({ changes: { from: 0, insert: 'xx' } }).state;
eq(state.field(compileMarksField).map((d) => state.doc.sliceString(d.from, d.to)), ['foo'], 'a mark moves with the text');
eq(state.update({ effects: setCompileMarks.of([]) }).state.field(compileMarksField), [], 'the next compile replaces them');
eq(state.update({ changes: { from: 8, insert: 'x' } }).state.field(compileMarksField), [], 'an edit beside a mark takes it away');

console.log('compileLog: all checks passed');
