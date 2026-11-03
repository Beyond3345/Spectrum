// Self-check for the log parser: `node apps/frontend/src/editor/compileLog.check.ts` (Node ≥ 23 strips the types).
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
    ['error', 'main.tex', 3, 'Undefined control sequence'],
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
    ['error', 'chapters/intro.tex', 12, 'Undefined control sequence.'],
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
    ['error', 'main.tex', 109, 'Undefined control sequence.'],
    ['error', 'main.bbl', 4, "LaTeX Error: Something's wrong--perhaps a missing \\item."],
    ['error', '', 0, "I couldn't open database file custom.bib"]
  ],
  'wrapped pdflatex'
);

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
eq(brief('[spectrum] Compile it with Auto instead.'), [['error', '', 0, 'Compile it with Auto instead.']], 'backend note');
eq(brief('[spectrum warning] notes.tex didn’t compile.'), [['warning', '', 0, 'notes.tex didn’t compile.']], 'backend warning');
eq(brief('Compiled notes.tex first for its cross-references.'), [], 'linked compile note');
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
      { severity: 'error', message: 'past the end', file: 'main.typ', line: 9, column: 0 },
      { severity: 'error', message: 'LaTeX: no column', file: 'main.typ', line: 1 }
    ],
    'main.typ',
    doc
  ).map((d) => [doc.sliceString(d.from, d.to), d.severity]),
  [['foo', 'error'], ['fnt', 'error'], ['"No Such"', 'warning'], ['', 'error']],
  'compile marks underline the token Typst points at, in the open file only'
);
// the marks move with the text typed before them, and the next compile's replace them
let state = EditorState.create({ doc: 'a #foo', extensions: compileLint });
state = state.update({ effects: setCompileMarks.of([{ from: 3, to: 6, severity: 'error', message: 'm' }]) }).state;
state = state.update({ changes: { from: 0, insert: 'xx' } }).state;
eq(state.field(compileMarksField).map((d) => state.doc.sliceString(d.from, d.to)), ['foo'], 'a mark moves with the text');
eq(state.update({ effects: setCompileMarks.of([]) }).state.field(compileMarksField), [], 'the next compile replaces them');
eq(state.update({ changes: { from: 8, insert: 'x' } }).state.field(compileMarksField), [], 'an edit beside a mark takes it away');

console.log('compileLog: all checks passed');
