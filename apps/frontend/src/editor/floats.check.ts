// Self-check for the Floats panel's LaTeX and the preamble helper. Run:
// npx esbuild apps/frontend/src/editor/floats.check.ts --bundle --platform=node --log-level=warning | node
import { placementOf, blockAt, escapeCell, figureKind, figureLabel, figureLatex, jpegOrientation, parseDelimited, pasteCells, safeFileName, tableLabel, tableLatex, uniqueName } from './floats';
import type { TableModel } from './floats';
import { addPackages, loadedPackages, projectPackages } from './preamble';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const lines = (...l: string[]) => l.join('\n');

// ─── figures ───

eq(figureKind('a.PNG', 'image/png'), 'keep', 'PNG goes in as it is');
eq(figureKind('a.jpeg', ''), 'keep', 'JPEG');
eq(figureKind('plot.pdf', 'application/pdf'), 'keep', 'PDF');
eq(figureKind('old.eps', ''), 'keep', 'EPS (epstopdf)');
eq(figureKind('IMG_0001.HEIC', ''), 'convert', 'HEIC to PNG');
eq(figureKind('logo.svg', 'image/svg+xml'), 'convert', 'SVG to PNG');
eq(figureKind('pasted', 'image/png'), 'convert', 'an image with no extension is redrawn');
eq(figureKind('notes.txt', 'text/plain'), null, 'not an image');

eq(safeFileName('My Photo (1)', 'png'), 'My-Photo-1.png', 'spaces and brackets');
eq(safeFileName('results.final.png', 'png'), 'results-final.png', 'dots in the name, typed extension kept once');
eq(safeFileName('results.jpg', 'png'), 'results-jpg.png', 'a different typed extension is part of the name');
eq(safeFileName('Café_über', 'jpeg'), 'Cafe_uber.jpeg', 'accents dropped, underscores kept');
eq(safeFileName('  ', 'png'), 'image.png', 'nothing left');
eq(uniqueName('cat.png', ['main.tex', 'images/dog.png']), 'cat.png', 'free name');
eq(uniqueName('cat.png', ['images/cat.png', 'images/cat-2.png']), 'cat-3.png', 'next free number');
eq(uniqueName('cat.png', ['images/Cat.PNG']), 'cat-2.png', 'letter case clashes on macOS');
eq(uniqueName('cat.png', ['cat.png', 'figs/images/cat.png']), 'cat.png', 'only images/ at the root counts');
eq(figureLabel('images/My Plot.v2.png'), 'fig:My-Plot-v2', 'figure label');

// a JPEG start: SOI, an APP0, then an APP1 "Exif" whose first IFD has one entry, Orientation
const jpeg = (orientation: number | null, little = false) => {
  const u16 = (n: number) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (little ? [...u16(n & 0xffff), ...u16(n >>> 16)] : [...u16(n >>> 16), ...u16(n & 0xffff)]);
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(orientation ? 0x0112 : 0x0100), ...u16(3), ...u32(1), ...u16(orientation ?? 0), 0, 0, ...u32(0)];
  const app1 = [0xff, 0xe1, (tiff.length + 8) >> 8, (tiff.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, ...app1, 0xff, 0xda]).buffer;
};
eq(jpegOrientation(jpeg(6)), 6, 'portrait phone photo');
eq(jpegOrientation(jpeg(8, true)), 8, 'little-endian EXIF');
eq(jpegOrientation(jpeg(null)), 1, 'EXIF without an orientation');
eq(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda]).buffer), 1, 'no EXIF');
eq(jpegOrientation(new Uint8Array([0x89, 0x50]).buffer), 1, 'not a JPEG');
eq(jpegOrientation(jpeg(6).slice(0, 30)), 1, 'cut off');
eq(tableLabel('Results on \\textbf{the} test set.'), 'tab:results-on-the', 'table label from the caption');
eq(tableLabel(''), '', 'no caption, no label: two such tables would share tab:table');

const fig = { path: 'images/cat.png', width: 0.75, caption: 'A cat, $x_1$.', label: 'fig:cat', placement: 'H' };
eq(
  figureLatex(fig),
  lines(
    '\\begin{figure}[H]',
    '    \\centering',
    '    \\includegraphics[width=0.75\\linewidth,height=0.8\\textheight,keepaspectratio]{images/cat.png}',
    '    \\caption{A cat, $x_1$.}',
    '    \\label{fig:cat}',
    '\\end{figure}'
  ),
  'figure with [H], no taller than the page'
);
const graphics = (width: string) => `    \\includegraphics[width=${width},height=0.8\\textheight,keepaspectratio]{images/cat.png}`;
eq(figureLatex({ ...fig, width: 1 }).split('\n')[2], graphics('\\linewidth'), 'full width');
eq(figureLatex({ ...fig, width: 0.5 }).split('\n')[2], graphics('0.5\\linewidth'), 'half');
eq(figureLatex({ ...fig, width: 1 / 3 }).split('\n')[2], graphics('0.33\\linewidth'), 'third');
eq(figureLatex({ ...fig, width: 0.6 }).split('\n')[2], graphics('0.6\\linewidth'), 'custom 60%');
for (const p of ['h', 't', 'b', 'p', 'htbp']) eq(figureLatex({ ...fig, placement: p }).split('\n')[0], `\\begin{figure}[${p}]`, `placement ${p}`);
eq(figureLatex({ ...fig, placement: '' }).split('\n')[0], '\\begin{figure}', 'no placement option');
eq(figureLatex({ ...fig, caption: '', label: '' }).split('\n').slice(3), ['    \\caption{}', '\\end{figure}'], 'empty caption kept, empty label left out');
eq(figureLatex({ ...fig, caption: 'Two\n\nlines' }).split('\n')[3], '    \\caption{Two lines}', 'no paragraph break in a caption');
eq(figureLatex({ ...fig, caption: 'Growth of 50% in R&D, see Fig.~\\ref{fig:IMG_1234}' }).split('\n')[3], '    \\caption{Growth of 50\\% in R\\&D, see Fig.~\\ref{fig:IMG_1234}}', 'caption escaped, tie and key kept');

// ─── tables ───

const model: TableModel = {
  cells: [
    ['Method', 'a_b', 'Score'],
    ['Ours', '$x_1$', '50%']
  ],
  env: 'tabular',
  align: ['l', 'c', 'c'],
  lines: 'booktabs',
  header: true,
  float: true,
  placement: 'H',
  caption: 'Results.',
  label: 'tab:results',
  escape: true
};
eq(
  tableLatex(model),
  lines(
    '\\begin{table}[H]',
    '    \\centering',
    '    \\caption{Results.}',
    '    \\label{tab:results}',
    '    \\begin{tabular}{lcc}',
    '        \\toprule',
    '        Method & a\\_b & Score \\\\',
    '        \\midrule',
    '        Ours & $x_1$ & 50\\% \\\\',
    '        \\bottomrule',
    '    \\end{tabular}',
    '\\end{table}'
  ),
  'booktabs table in a float, escaped outside $…$'
);
const bare = { ...model, float: false };
eq(
  tableLatex(bare),
  lines(
    '\\begin{center}',
    '    \\begin{tabular}{lcc}',
    '        \\toprule',
    '        Method & a\\_b & Score \\\\',
    '        \\midrule',
    '        Ours & $x_1$ & 50\\% \\\\',
    '        \\bottomrule',
    '    \\end{tabular}',
    '\\end{center}'
  ),
  'no float: in a center, not inline in a paragraph'
);
// the tabular inside the center
const inner = (m: TableModel) => tableLatex(m).split('\n').slice(1, -1).map((l) => l.slice(4));
eq(inner({ ...bare, header: false }), ['\\begin{tabular}{lcc}', '    \\toprule', '    Method & a\\_b & Score \\\\', '    Ours & $x_1$ & 50\\% \\\\', '    \\bottomrule', '\\end{tabular}'], 'no header rule');
eq(
  inner({ ...bare, lines: 'grid', cells: [...bare.cells, ['', '', '']] }),
  ['\\begin{tabular}{|l|c|c|}', '    \\hline', '    Method & a\\_b & Score \\\\', '    \\hline\\hline', '    Ours & $x_1$ & 50\\% \\\\', '    \\hline', '     &  &  \\\\', '    \\hline', '\\end{tabular}'],
  'grid: rules everywhere, a double one under the header, empty cells allowed'
);
eq(inner({ ...bare, lines: 'grid', header: false })[3], '    \\hline', 'grid without a header');
eq(
  inner({ ...bare, lines: 'minimal', cells: [...bare.cells, ['A', 'B', 'C']] }),
  ['\\begin{tabular}{lcc}', '    \\hline', '    Method & a\\_b & Score \\\\', '    \\hline', '    Ours & $x_1$ & 50\\% \\\\', '    A & B & C \\\\', '    \\hline', '\\end{tabular}'],
  'minimal: top, under the header, bottom'
);
eq(inner({ ...bare, lines: 'minimal', header: false }).filter((l) => l.includes('hline')).length, 2, 'minimal without a header');
eq(inner({ ...bare, env: 'tabularx', align: ['X', 'X', 'X'] })[0], '\\begin{tabularx}{\\linewidth}{XXX}', 'tabularx');
eq(inner({ ...bare, env: 'tabularx', align: ['X', 'X', 'X'] }).pop(), '\\end{tabularx}', 'tabularx ends');
eq(inner({ ...bare, env: 'tabularx', align: ['l', 'c', 'r'] })[0], '\\begin{tabularx}{\\linewidth}{lcX}', 'tabularx always has an X column');
eq(inner({ ...bare, env: 'tabularx', lines: 'grid', align: ['l', 'X', 'r'] })[0], '\\begin{tabularx}{\\linewidth}{|l|X|r|}', 'tabularx grid');
eq(tableLatex({ ...model, placement: '' }).split('\n')[0], '\\begin{table}', 'table with no placement option');
for (const p of ['h', 't', 'b', 'p', 'htbp']) eq(tableLatex({ ...model, placement: p }).split('\n')[0], `\\begin{table}[${p}]`, `table placement ${p}`);
eq(tableLatex({ ...model, label: '', caption: '' }).split('\n').slice(2, 4), ['    \\caption{}', '    \\begin{tabular}{lcc}'], 'empty label left out');
eq(inner({ ...bare, escape: false })[2], '    Method & a_b & Score \\\\', 'escaping off');
eq(
  inner({ ...bare, cells: [['A', 'B'], ['[1]', 'x'], ['*y', '[0, 1]']] }).slice(2, 6),
  ['    A & B \\\\', '    \\midrule', '    {}[1] & x \\\\', '    {}*y & [0, 1] \\\\'],
  'a row starting with [ or * is no optional argument or star of \\\\ or \\midrule'
);
eq(inner({ ...bare, header: false, escape: false, cells: [['[a]', 'b']] })[2], '    {}[a] & b \\\\', 'after \\toprule too, escaping off');
eq(tableLatex({ ...model, caption: '50% of R&D' }).split('\n')[2], '    \\caption{50\\% of R\\&D}', 'caption escaped with the cells');
eq(tableLatex({ ...model, caption: '50\\% of R\\&D', escape: false }).split('\n')[2], '    \\caption{50\\% of R\\&D}', 'caption as typed with escaping off');
eq(tableLatex({ ...model, caption: '', label: tableLabel('') }).split('\n').slice(2, 4), ['    \\caption{}', '    \\begin{tabular}{lcc}'], 'no caption, no label');

eq(escapeCell('R&D 10% #1 a_b ~ 2^3'), 'R\\&D 10\\% \\#1 a\\_b \\textasciitilde{} 2\\textasciicircum{}3', 'every special character');
eq(escapeCell('\\textbf{x_y} \\& \\_ {a}'), '\\textbf{x\\_y} \\& \\_ {a}', 'commands, escapes and braces kept');
eq(escapeCell('$a_b^2$ and a_b'), '$a_b^2$ and a\\_b', 'maths left alone');
eq(escapeCell('$$x_1$$ y_2'), '$$x_1$$ y\\_2', 'display maths');
eq(escapeCell('\\$5 a_b'), '\\$5 a\\_b', 'an escaped dollar is no maths');
eq(escapeCell('$5'), '\\$5', 'a price is no maths');
eq(escapeCell('Cost $5 & $10'), 'Cost \\$5 \\& \\$10', 'two prices');
eq(escapeCell('$5-$10'), '\\$5-\\$10', 'a price range: a digit after the closing $');
eq(escapeCell('$5 and $6'), '\\$5 and \\$6', 'a space before the closing $');
eq(escapeCell('between $a$ and $b_1$'), 'between $a$ and $b_1$', 'maths still maths');
eq(escapeCell('\\(x_1\\) and \\(x^2\\) a_b'), '\\(x_1\\) and \\(x^2\\) a\\_b', '\\( … \\) maths');
eq(escapeCell('<0.001, x | y > z'), '\\textless{}0.001, x \\textbar{} y \\textgreater{} z', '< | > print as themselves');
eq(
  escapeCell('see \\ref{fig:my_fig}, \\cite{smith_2020}, \\citep[p.~3]{a_b} and \\url{https://x.org/a_b#c}'),
  'see \\ref{fig:my_fig}, \\cite{smith_2020}, \\citep[p.~3]{a_b} and \\url{https://x.org/a_b#c}',
  'keys, labels and URLs kept'
);
eq(escapeCell('Table~\\ref{tab:my_data}, ~5% \\textbf{a_b}'), 'Table~\\ref{tab:my_data}, \\textasciitilde{}5\\% \\textbf{a\\_b}', 'a tie before a command kept, other text escaped');

eq(parseDelimited('a\tb\tc\n1\t2\t3\n'), [['a', 'b', 'c'], ['1', '2', '3']], 'tabs from Numbers or Excel');
eq(parseDelimited('a,"b, c","say ""hi"""\r\n1,,3'), [['a', 'b, c', 'say "hi"'], ['1', '', '3']], 'CSV with quotes');
eq(parseDelimited('"two\nlines"\tx'), [['two\nlines', 'x']], 'quoted line break');
eq(
  pasteCells([['a', 'b'], ['c', 'd']], 1, 1, [['1', '2'], ['3', '4']]),
  [['a', 'b', ''], ['c', '1', '2'], ['', '3', '4']],
  'paste grows the grid from the focused cell'
);
eq(pasteCells([['a', 'b'], ['c', 'd']], 0, 0, [['x']]), [['x', 'b'], ['c', 'd']], 'paste inside the grid');

// ─── placing a block ───

const block = '\\begin{x}\n    y\n\\end{x}';
const at = (text: string) => {
  const from = text.indexOf('|');
  const to = text.includes('^') ? text.indexOf('^') - 1 : from;
  const doc = text.replace('|', '').replace('^', '');
  const insert = blockAt(doc, from, to, block);
  return doc.slice(0, from) + insert + doc.slice(to);
};
eq(at('a\n|\nb'), 'a\n\\begin{x}\n    y\n\\end{x}\nb', 'empty line');
eq(at('\\begin{document}\n    |\n'), '\\begin{document}\n    \\begin{x}\n        y\n    \\end{x}\n', 'indented blank line');
eq(at('    |text'), '    \\begin{x}\n        y\n    \\end{x}\n    text', 'start of an indented line');
eq(at('  |  text'), '    \\begin{x}\n        y\n    \\end{x}\n    text', 'inside the indent');
eq(at('    Some text.|'), '    Some text.\n    \\begin{x}\n        y\n    \\end{x}', 'end of a line');
eq(at('    one| two'), '    one\n    \\begin{x}\n        y\n    \\end{x}\n     two', 'middle of a line');
eq(at('a |sel^ b'), 'a \n\\begin{x}\n    y\n\\end{x}\n b', 'replaces the selection');

// ─── packages ───

eq([...loadedPackages('\\usepackage[margin=1in]{geometry}\n\\usepackage{amsmath, graphicx}\n% \\usepackage{float}\n\\RequirePackage{booktabs}')], ['geometry', 'amsmath', 'graphicx', 'booktabs'], 'loaded packages');
eq(loadedPackages('50\\% \\usepackage{x}').has('x'), true, '\\% is not a comment');

const doc = lines('\\documentclass{article}', '\\usepackage{amsmath,graphicx}', '% \\usepackage{float}', '', '\\begin{document}', 'Hi', '\\end{document}');
const edit = addPackages(doc, ['graphicx', 'float', 'booktabs']);
eq(edit.added, ['float', 'booktabs'], 'graphicx is loaded by a comma list; the commented-out float is not');
eq(
  edit.source,
  lines('\\documentclass{article}', '\\usepackage{amsmath,graphicx}', '\\usepackage{float}', '\\usepackage{booktabs}', '% \\usepackage{float}', '', '\\begin{document}', 'Hi', '\\end{document}'),
  'after the last \\usepackage line, past comments and blank lines'
);
eq(edit.change && doc.slice(0, edit.change.from) + edit.change.insert + doc.slice(edit.change.from), edit.source, 'the change matches the source');
const adjacent = lines('\\documentclass{article}', '\\usepackage{amsmath}', '', '\\begin{document}', '\\end{document}');
eq(
  addPackages(adjacent, ['float']).source,
  lines('\\documentclass{article}', '\\usepackage{amsmath}', '\\usepackage{float}', '', '\\begin{document}', '\\end{document}'),
  'after the \\usepackage lines'
);
const titled = lines('\\documentclass{article}', '\\usepackage{amsmath}', '\\title{T}', '\\begin{document}', '\\end{document}');
eq(addPackages(titled, ['float']).source.split('\n').slice(2, 5), ['\\title{T}', '\\usepackage{float}', '\\begin{document}'], 'just before \\begin{document}');
eq(addPackages(lines('\\section{A}', 'Text'), ['float']), { source: lines('\\section{A}', 'Text'), added: [], noDocument: true }, 'no \\begin{document}');
eq(addPackages(doc, ['amsmath']), { source: doc, added: [] }, 'nothing to add');
eq(addPackages('% \\begin{document}\n\\begin{document}', ['x']).source, '% \\begin{document}\n\\usepackage{x}\n\\begin{document}', 'a commented \\begin{document} is skipped');
const oneLiner = '\\documentclass{article}\\usepackage{amsmath}\\begin{document}\nHi\n\\end{document}';
const oneEdit = addPackages(oneLiner, ['float']);
eq(oneEdit.source, '\\documentclass{article}\\usepackage{amsmath}\n\\usepackage{float}\n\\begin{document}\nHi\n\\end{document}', 'one-line preamble: after \\documentclass, not above it');
eq(oneEdit.change && oneLiner.slice(0, oneEdit.change.from) + oneEdit.change.insert + oneLiner.slice(oneEdit.change.from), oneEdit.source, 'its change matches');
const shown = lines('\\documentclass{article}', '\\begin{document}', '\\begin{verbatim}', '\\usepackage{float}', '\\end{verbatim}', '\\end{document}');
eq(addPackages(shown, ['float']).added, ['float'], 'a \\usepackage in the body (verbatim) loads nothing');

const files: Record<string, string> = {
  'paper/main.tex': '\\input{preamble}\n\\include{chapters/one}\n% \\input{old}',
  'paper/preamble.tex': '\\usepackage{float}',
  'chapters/one.tex': '\\usepackage{booktabs}',
  'paper/old.tex': '\\usepackage{tabularx}'
};
const bodied: Record<string, string> = {
  'main.tex': '\\documentclass{article}\n\\input{preamble}\n\\begin{document}\n\\begin{verbatim}\\usepackage{tabularx}\\end{verbatim}\n\\subfile{chapter}\n\\end{document}',
  'preamble.tex': '\\usepackage{float}',
  'chapter.tex': '\\documentclass[main]{subfiles}\n\\usepackage{booktabs}\n\\begin{document}\n\\end{document}'
};
// a failure here is an unhandled rejection, which ends node with an error too
// placement letters combine in LaTeX's order; H stands alone; a float across both columns keeps !, t and p
eq(placementOf('pht!'), '!htp', 'letters in the usual order');
eq(placementOf('Ht'), 'H', 'H stands alone');
eq(placementOf('H', true), '', 'figure* cannot take H');
eq(placementOf('htbp', true), 'tp', 'figure* keeps t and p');
eq(figureLatex({ ...fig, placement: 'tb!', span: true }).split('\n')[0], '\\begin{figure*}[!t]', 'figure* with its usable letters');
eq(figureLatex({ ...fig, span: true }).split('\n').pop(), '\\end{figure*}', 'figure* closes as figure*');
eq(tableLatex({ ...model, placement: 'ht', span: true }).split('\n')[0], '\\begin{table*}[t]', 'table* with its usable letters');
eq(tableLatex({ ...model, placement: 'ht', span: true }).split('\n').pop(), '\\end{table*}', 'table* closes as table*');

Promise.all([
  projectPackages('paper/main.tex', new Set(Object.keys(files)), async (p) => files[p]).then((names) => {
    eq([...names].sort(), ['booktabs', 'float'], 'packages from \\input files, from the main file’s folder or the root');
  }),
  projectPackages('main.tex', new Set(Object.keys(bodied)), async (p) => bodied[p]).then((names) => {
    eq([...names], ['float'], 'only the main file’s preamble counts: not verbatim, nor a subfile’s own preamble');
  })
]).then(() => console.log('floats.check: ok'));
