// Self-check for the Floats panel's LaTeX and the preamble helper. Run:
// npx esbuild apps/frontend/src/editor/floats.check.ts --bundle --platform=node --log-level=warning | node
import { blockAt, figureSetLabel, figureSetLatex, figureSetPackages, figureSetTypst, graphicsOptions, panelWidth, fitMerges, headerRows, numberFormat, tableNotes, tablePackages, withMerge, diagramImageLatex, diagramLatex, escapeCell, figureKind, figureLabel, figureLatex, figureMarkdown, figureTypst, figureTypstInclude, jpegOrientation, parseDelimited, pasteCells, placementOf, safeFileName, tableEdges, tableLabel, tableLatex, tableMarkdown, tableRules, tableTypst, typstMarkup, uniqueName } from './floats';
import type { FigureSet, FigureSize, TableModel } from './floats';
import { addLibraries, addPackages, changeBetween, loadedLibraries, loadedPackages, projectPackages } from './preamble';

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
eq(uniqueName('cat.png', ['main.tex', 'figures/dog.png']), 'cat.png', 'free name');
eq(uniqueName('cat.png', ['figures/cat.png', 'figures/cat-2.png']), 'cat-3.png', 'next free number');
eq(uniqueName('cat.png', ['figures/Cat.PNG']), 'cat-2.png', 'letter case clashes on macOS');
eq(uniqueName('cat.png', ['cat.png', 'figs/figures/cat.png', 'images/cat.png']), 'cat.png', 'only figures/ at the root counts');
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

// ─── diagrams ───

const amp = { path: 'figures/amp.tex', width: null, caption: 'An amplifier.', label: figureLabel('figures/amp.tex'), placement: 'H' };
eq(
  diagramLatex(amp),
  lines('\\begin{figure}[H]', '    \\centering', '    \\includestandalone{figures/amp}', '    \\caption{An amplifier.}', '    \\label{fig:amp}', '\\end{figure}'),
  'a diagram at its own size: no width, the path without .tex'
);
eq(diagramLatex({ ...amp, width: 0.5 }).split('\n')[2], '    \\includestandalone[width=0.5\\linewidth]{figures/amp}', 'a diagram scaled to half the line');
eq(diagramLatex({ ...amp, placement: 'tb', span: true }).split('\n')[0], '\\begin{figure*}[t]', 'a diagram across both columns');
eq(diagramImageLatex({ ...amp, path: 'figures/amp.pdf' }).split('\n')[2], '    \\includegraphics{figures/amp.pdf}', 'a diagram inserted as its PDF, at its own size');
eq(diagramImageLatex({ ...amp, path: 'figures/amp.pdf', width: 0.5 }).split('\n')[2], '    \\includegraphics[width=0.5\\linewidth]{figures/amp.pdf}', 'or scaled');

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
eq(addPackages(titled, ['float']).source.split('\n').slice(1, 4), ['\\usepackage{amsmath}', '\\usepackage{float}', '\\title{T}'], 'after the last \\usepackage, not after \\title');
eq(addPackages(lines('\\documentclass{article}', '\\title{T}', '\\begin{document}'), ['float']).source.split('\n').slice(1, 3), ['\\title{T}', '\\usepackage{float}'], 'with no \\usepackage, just before \\begin{document}');

// the style guide's order: each package into its group, before the next group's heading
const guided = lines(
  '\\documentclass{article}',
  '',
  '% References',
  '\\usepackage{biblatex}',
  '',
  '% Page',
  '\\usepackage[margin=25mm]{geometry}',
  '\\usepackage[australian]{babel}',
  '',
  '% Figures and tables',
  '\\usepackage{graphicx}',
  '\\usepackage{siunitx}',
  '\\sisetup{per-mode = symbol}',
  '',
  '% Links',
  '\\usepackage[hidelinks]{hyperref}',
  '\\hypersetup{pdflang = {en-AU}}',
  '\\usepackage{cleveref}',
  '',
  '\\begin{document}',
  '\\end{document}'
);
const ordered = addPackages(guided, ['multirow', 'booktabs', 'amsmath', 'titlesec', 'parskip']);
eq(ordered.added, ['multirow', 'booktabs', 'amsmath', 'titlesec', 'parskip'], 'all added');
eq(
  ordered.source.split('\n').slice(5, 25),
  [
    '% Page',
    '\\usepackage[margin=25mm]{geometry}',
    '\\usepackage{parskip}',
    '\\usepackage[australian]{babel}',
    '\\usepackage{amsmath}',
    '',
    '% Figures and tables',
    '\\usepackage{graphicx}',
    '\\usepackage{booktabs}',
    '\\usepackage{siunitx}',
    '\\sisetup{per-mode = symbol}',
    '\\usepackage{multirow}',
    '',
    '% Links',
    '\\usepackage[hidelinks]{hyperref}',
    '\\hypersetup{pdflang = {en-AU}}',
    '\\usepackage{cleveref}',
    '\\usepackage{titlesec}',
    '',
    '\\begin{document}'
  ],
  'into place: within a group, at the end of the group before it, and a package not in the guide after the last \\usepackage'
);
eq(ordered.change && guided.slice(0, ordered.change.from) + ordered.change.insert + guided.slice(ordered.change.to), ordered.source, 'one change for the live editor');
// hyperref loaded before graphicx: the guide's order can't be kept, so the package goes after the last \usepackage
const outOfOrder = lines('\\documentclass{article}', '\\usepackage{hyperref}', '\\usepackage{graphicx}', '\\begin{document}', '\\end{document}');
eq(addPackages(outOfOrder, ['booktabs']).source.split('\n').slice(1, 4), ['\\usepackage{hyperref}', '\\usepackage{graphicx}', '\\usepackage{booktabs}'], 'out of order: after the last \\usepackage');
eq(addPackages(outOfOrder, ['amsmath']).source.split('\n').slice(1, 3), ['\\usepackage{amsmath}', '\\usepackage{hyperref}'], 'before the first that comes after it, when nothing before it is loaded');
eq(addPackages(lines('\\section{A}', 'Text'), ['float']), { source: lines('\\section{A}', 'Text'), added: [], noDocument: true }, 'no \\begin{document}');
eq(addPackages(doc, ['amsmath']), { source: doc, added: [] }, 'nothing to add');
eq(addPackages('% \\begin{document}\n\\begin{document}', ['x']).source, '% \\begin{document}\n\\usepackage{x}\n\\begin{document}', 'a commented \\begin{document} is skipped');
const oneLiner = '\\documentclass{article}\\usepackage{amsmath}\\begin{document}\nHi\n\\end{document}';
const oneEdit = addPackages(oneLiner, ['float']);
eq(oneEdit.source, '\\documentclass{article}\\usepackage{amsmath}\n\\usepackage{float}\n\\begin{document}\nHi\n\\end{document}', 'one-line preamble: after \\documentclass, not above it');
eq(oneEdit.change && oneLiner.slice(0, oneEdit.change.from) + oneEdit.change.insert + oneLiner.slice(oneEdit.change.from), oneEdit.source, 'its change matches');
const shown = lines('\\documentclass{article}', '\\begin{document}', '\\begin{verbatim}', '\\usepackage{float}', '\\end{verbatim}', '\\end{document}');
eq(addPackages(shown, ['float']).added, ['float'], 'a \\usepackage in the body (verbatim) loads nothing');

// a diagram's preamble: standalone first, then its packages, then its TikZ libraries after them
const classy = lines('\\documentclass[11pt,', '  a4paper]{article}', '\\usepackage{amsmath}', '\\usetikzlibrary{calc, arrows.meta}', '% \\usetikzlibrary{positioning}', '', '\\begin{document}', '\\end{document}');
eq([...loadedLibraries(classy)], ['calc', 'arrows.meta'], 'loaded libraries: comma lists, not commented-out lines');
const early = addPackages(classy, ['standalone'], { first: true });
eq(early.source.split('\n').slice(0, 4), ['\\documentclass[11pt,', '  a4paper]{article}', '\\usepackage{standalone}', '\\usepackage{amsmath}'], 'first: straight after \\documentclass, options across lines too');
eq(early.change && classy.slice(0, early.change.from) + early.change.insert + classy.slice(early.change.from), early.source, 'its change matches');
eq(addPackages(early.source, ['standalone'], { first: true }), { source: early.source, added: [] }, 'standalone only once');
eq(addPackages(oneLiner, ['standalone'], { first: true }).source, oneEdit.source.replace('float', 'standalone'), 'first in a one-line preamble: before \\begin{document}');
const packed = addPackages(early.source, ['circuitikz', 'amsmath']);
const libbed = addLibraries(packed.source, ['arrows.meta', 'positioning', 'shapes.geometric', 'positioning']);
eq(libbed.added, ['positioning', 'shapes.geometric'], 'only the libraries not loaded, each once');
eq(
  libbed.source,
  lines(
    '\\documentclass[11pt,',
    '  a4paper]{article}',
    '\\usepackage{standalone}',
    '\\usepackage{amsmath}',
    '\\usepackage{circuitikz}',
    '\\usetikzlibrary{calc, arrows.meta}',
    '\\usetikzlibrary{positioning,shapes.geometric}',
    '% \\usetikzlibrary{positioning}',
    '',
    '\\begin{document}',
    '\\end{document}'
  ),
  'packages after the last \\usepackage, before the TikZ libraries that need them, and libraries after those'
);
eq(addLibraries(libbed.source, ['calc', 'positioning']), { source: libbed.source, added: [] }, 'no library twice');
eq(addLibraries(lines('Text'), ['calc']).noDocument, true, 'no \\begin{document}, no libraries');
const whole = changeBetween(classy, libbed.source);
eq(classy.slice(0, whole.from) + whole.insert + classy.slice(whole.to), libbed.source, 'one change for the three edits, for one undo step');
eq(whole.from > classy.indexOf('{article}') && whole.to < classy.indexOf('\\begin{document}'), true, 'the change stays between \\documentclass and \\begin{document}');
eq(changeBetween('abc', 'abc'), { from: 3, to: 3, insert: '' }, 'no change');
eq(changeBetween('aXa', 'aXXa'), { from: 2, to: 2, insert: 'X' }, 'a repeated character is inserted once');

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

// ─── Typst and Markdown ───

eq(
  figureTypst({ path: 'images/cat.png', width: 0.8, caption: 'A cat, [x]', label: 'fig:cat' }),
  '#figure(image("/images/cat.png", width: 80%), caption: [A cat, \\[x\\]]) <fig:cat>',
  'a Typst figure with its width, caption and label'
);
eq(figureTypst({ path: 'images/a"b.png', width: 1, caption: '', label: '' }), '#figure(image("/images/a\\"b.png", width: 100%))', 'a Typst figure without a caption or label, its path quoted');
eq(figureTypstInclude({ path: 'figures/flow.typ', caption: 'A flow', label: 'fig:flow' }), '#figure(include "/figures/flow.typ", caption: [A flow]) <fig:flow>', 'a Typst diagram included as a figure');
eq(figureMarkdown({ path: 'images/cat.png', width: 0.75, caption: 'A cat, [x]', label: 'fig:cat' }), '![A cat, \\[x\\]](images/cat.png){#fig:cat width=75%}', 'a Markdown image with its label and width');
eq(figureMarkdown({ path: 'images/cat.png', width: 0.5, caption: 'A cat', label: '' }), '![A cat](images/cat.png){width=50%}', 'a Markdown image without a label');
eq(
  tableTypst(model),
  '#figure(table(columns: 3, align: (left, center, center), stroke: none, table.hline(y: 0, stroke: 0.08em), table.hline(y: 1, stroke: 0.05em), table.hline(y: 2, stroke: 0.08em), table.header([Method], [a_b], [Score]), [Ours], [$x_1$], [50%]), caption: [Results.]) <tab:results>',
  'a Typst table in a float, its header kept, booktabs as heavier top and bottom lines'
);
eq(
  tableTypst({ ...model, float: false, header: false }),
  '#table(columns: 3, align: (left, center, center), stroke: none, table.hline(y: 0, stroke: 0.08em), table.hline(y: 2, stroke: 0.08em), [Method], [a_b], [Score], [Ours], [$x_1$], [50%])',
  'a Typst table without its float or header'
);
eq(
  tableTypst({ ...model, cells: [['a[1]', 'b\\c]']], header: false, float: false }),
  '#table(columns: 2, align: (left, center), stroke: none, table.hline(y: 0, stroke: 0.08em), table.hline(y: 1, stroke: 0.08em), [a\\[1\\]], [b\\\\c\\]])',
  'Typst cells keep brackets and backslashes as text'
);
// each compiles to its own text with Typst 0.15.1
eq(typstMarkup('*Total'), '\\*Total', 'a star that would open bold');
eq(typstMarkup('snake_case a*b f(*x) a_ b'), 'snake_case a*b f(\\*x) a\\_ b', 'a star or underscore inside a word stays as it is');
eq(typstMarkup('and/or // not a comment /* nor this'), 'and\\/or \\/\\/ not a comment \\/\\* nor this', 'slashes');
eq(typstMarkup('see @fig <x> `code` $x$ #tag'), 'see \\@fig \\<x> \\`code\\` \\$x\\$ \\#tag', 'a reference, label, raw text, dollars and code');
eq([typstMarkup('- 5'), typstMarkup('+ x'), typstMarkup('= Results'), typstMarkup('1. first'), typstMarkup('-1'), typstMarkup('12.5')], ['\\- 5', '\\+ x', '\\= Results', '1\\. first', '-1', '12.5'], 'a list or heading marker at the start');
eq(figureTypst({ path: 'a.png', width: 1, caption: 'Mean // SD of *all* @runs', label: '' }), '#figure(image("/a.png", width: 100%), caption: [Mean \\/\\/ SD of \\*all\\* \\@runs])', 'a caption’s markup');
eq(
  tableTypst({ ...model, cells: [['*Total', '$x_1 [a]$ costs $5 and $6', '$$y$$ a_b']], header: false, float: false }).split('table.hline(y: 1, stroke: 0.08em), ')[1],
  '[\\*Total], [$x_1 \\[a\\]$ costs \\$5 and \\$6], [$$y$$ a_b])',
  'a cell’s maths stays maths, and its other markup text'
);
eq(
  tableMarkdown(model),
  lines('| Method | a_b | Score |', '| :--- | :---: | :---: |', '| Ours | $x_1$ | 50% |', '', 'Table: Results. {#tab:results}'),
  'a Markdown pipe table with its caption under it'
);
eq(tableMarkdown({ ...model, cells: [['a|b', 'c']], header: true, float: false }), lines('| a\\|b | c |', '| :--- | :---: |'), 'a pipe table escapes a pipe and has no caption');
eq(tableMarkdown({ ...model, cells: [['a', 'b']], header: true, float: false, align: ['r', 'X'] }), lines('| a | b |', '| ---: | --- |'), 'a pipe table aligns right');

// ─── lines between cells ───

eq(tableEdges(3, 2, true), { h: ['top', 'head', 'under-2', 'bottom'], v: ['left', 'after-1', 'right'] }, 'edge names, with a header row');
eq(tableEdges(3, 2, false).h, ['top', 'under-1', 'under-2', 'bottom'], 'edge names without one');
eq(tableEdges(1, 1, true), { h: ['top', 'bottom'], v: ['left', 'right'] }, 'one cell: its header row has no line of its own');
eq(tableRules({ ...model, lines: 'grid' }), { h: [1, 2, 1], v: [1, 1, 1, 1] }, 'grid: every line, the header’s double');
eq(tableRules({ ...model, lines: 'none' }), { h: [0, 0, 0], v: [0, 0, 0, 0] }, 'none');
eq(tableRules({ ...model, lines: 'booktabs', toggled: ['left', 'head'] }), { h: [1, 0, 1], v: [0, 0, 0, 0] }, 'booktabs: a toggled header line goes, vertical lines never come');
eq(tableRules({ ...model, lines: 'grid', toggled: ['head'] }).h, [1, 0, 1], 'a double line toggled goes altogether');
const three = { ...bare, lines: 'minimal' as const, cells: [['A', 'B', 'C'], ['1', '2', '3'], ['Total', '3', '5']], toggled: ['after-1', 'under-2'] };
eq(
  inner(three),
  ['\\begin{tabular}{l|cc}', '    \\hline', '    A & B & C \\\\', '    \\hline', '    1 & 2 & 3 \\\\', '    \\hline', '    Total & 3 & 5 \\\\', '    \\hline', '\\end{tabular}'],
  'minimal with a line after the first column and one above the total'
);
eq(inner({ ...three, lines: 'booktabs' }).slice(0, 7), ['\\begin{tabular}{lcc}', '    \\toprule', '    A & B & C \\\\', '    \\midrule', '    1 & 2 & 3 \\\\', '    \\midrule', '    Total & 3 & 5 \\\\'], 'booktabs: \\midrule between body rows, no | in the spec');
eq(inner({ ...three, lines: 'none', toggled: [] }), ['\\begin{tabular}{lcc}', '    A & B & C \\\\', '    1 & 2 & 3 \\\\', '    Total & 3 & 5 \\\\', '\\end{tabular}'], 'no lines');
eq(inner({ ...three, lines: 'none', toggled: ['left', 'right', 'top', 'bottom'] })[0], '\\begin{tabular}{|lcc|}', 'a box');
eq(inner({ ...three, lines: 'none', toggled: [], cells: [['[a]', 'b', 'c'], ['[1]', '2', '3'], ['*', '', '']] }).slice(1, 4), ['    {}[a] & b & c \\\\', '    {}[1] & 2 & 3 \\\\', '    {}* &  &  \\\\'], 'with no rule between rows, [ and * still are no argument of \\\\');
eq(
  tableTypst({ ...three, float: false, header: true }),
  '#table(columns: 3, align: (left, center, center), stroke: none, table.hline(y: 0), table.hline(y: 1), table.hline(y: 2), table.hline(y: 3), table.vline(x: 1), table.header([A], [B], [C]), [1], [2], [3], [Total], [3], [5])',
  'Typst: stroke: none and a line each'
);
eq(tableTypst({ ...three, lines: 'grid', toggled: [], float: false }).startsWith('#table(columns: 3, align: (left, center, center), table.header('), true, 'Typst grid: Typst’s own lines, its double line single');

// ─── table additions: S columns, merged cells, short rules, xltabular, makecell and threeparttable ───

const grouped: TableModel = {
  cells: [
    ['Season', 'Energy (kWh)', ''],
    ['', 'Measured', 'Modelled'],
    ['Summer', '2740', '2810.5'],
    ['Winter', '-1110', 'n/a']
  ],
  env: 'tabular',
  align: ['l', 'S', 'S'],
  lines: 'booktabs',
  toggled: ['under-2'],
  header: true,
  float: false,
  placement: '',
  caption: '',
  label: '',
  escape: true,
  merges: [
    { r: 0, c: 1, rows: 1, cols: 2 },
    { r: 0, c: 0, rows: 2, cols: 1 }
  ]
};
eq(numberFormat(grouped.cells, 1, (r) => r < 2), '-4.0', 'S column format: a sign and four digits');
eq(numberFormat(grouped.cells, 2, (r) => r < 2), '4.1', 'S column format: text left out, one decimal');
eq(numberFormat([['1e5']], 0, () => false), '', 'an exponent leaves the format to siunitx');
eq(numberFormat([['7,790']], 0, () => false), '', 'a comma is text, not a number');
eq(
  inner(grouped),
  [
    '\\begin{tabular}{lS[table-format=-4.0]S[table-format=4.1]}',
    '    \\toprule',
    '    \\multirow{2}{*}{Season} & \\multicolumn{2}{c}{Energy (kWh)} \\\\',
    '    \\cmidrule{2-3}',
    '     & {Measured} & {Modelled} \\\\',
    '    \\midrule',
    '    Summer & 2740 & 2810.5 \\\\',
    '    Winter & -1110 & {n/a} \\\\',
    '    \\bottomrule',
    '\\end{tabular}'
  ],
  'merged header: multirow, multicolumn, a rule stopping short of the merged cell, and text braced in S columns'
);
eq(
  inner({ ...grouped, toggled: [], merges: [{ r: 0, c: 1, rows: 1, cols: 2 }], partRules: [{ row: 0, from: 1, to: 2 }], header: false }).slice(1, 4),
  ['    \\toprule', '    Season & \\multicolumn{2}{c}{Energy (kWh)} \\\\', '    \\cmidrule(lr){2-3}'],
  'a short rule under a merged group heading'
);
eq(
  inner({ ...grouped, lines: 'grid', toggled: [], align: ['l', 'c', 'c'], merges: [{ r: 0, c: 1, rows: 1, cols: 2 }] }).slice(0, 4),
  ['\\begin{tabular}{|l|c|c|}', '    \\hline', '    Season & \\multicolumn{2}{c|}{Energy (kWh)} \\\\', '    \\hline\\hline'],
  'grid: a multicolumn keeps the line after it'
);
eq(
  inner({ ...grouped, lines: 'grid', toggled: [], align: ['l', 'c', 'c'], merges: [{ r: 1, c: 0, rows: 2, cols: 1 }] })[5],
  '    \\cline{2-3}',
  'grid: a line beside a cell merged down is a cline'
);
eq(
  inner({ ...grouped, lines: 'none', toggled: [], align: ['l', 'c', 'c'], merges: [], partRules: [{ row: 1, from: 0, to: 1 }] }).filter((l) => l.includes('cline')),
  ['    \\cline{1-2}'],
  'a short rule without booktabs is a cline'
);
eq(withMerge([{ r: 0, c: 1, rows: 1, cols: 2 }], { r: 0, c: 0, rows: 1, cols: 2 }), [{ r: 0, c: 0, rows: 1, cols: 3 }], 'a merge takes in one it overlaps');
eq(fitMerges([{ r: 0, c: 0, rows: 2, cols: 2 }, { r: 3, c: 0, rows: 2, cols: 1 }], 2, 1), [{ r: 0, c: 0, rows: 2, cols: 1 }], 'merges cut to a smaller grid');
eq(tablePackages(grouped), ['booktabs', 'siunitx', 'multirow'], 'packages for S columns and a cell merged down');

const long: TableModel = { ...model, env: 'xltabular', align: ['l', 'c', 'X'], cells: [['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']] };
eq(
  tableLatex(long).split('\n'),
  [
    '\\begin{xltabular}{\\linewidth}{lcX}',
    '    \\caption{Results.}\\label{tab:results} \\\\',
    '    \\toprule',
    '    A & B & C \\\\',
    '    \\midrule',
    '    \\endfirsthead',
    '    \\toprule',
    '    A & B & C \\\\',
    '    \\midrule',
    '    \\endhead',
    '    \\multicolumn{3}{r}{\\emph{Continued on the next page}} \\\\',
    '    \\endfoot',
    '    \\bottomrule',
    '    \\endlastfoot',
    '    1 & 2 & 3 \\\\',
    '    4 & 5 & 6 \\\\',
    '\\end{xltabular}'
  ],
  'xltabular: the caption inside, the header repeated on each page'
);
eq(headerRows(grouped, grouped.merges!), 2, 'a cell merged down from the header takes its row into the header');
eq(
  tableLatex({ ...grouped, env: 'xltabular', float: false }).split('\n').slice(1, 9),
  [
    '    \\toprule',
    '    \\multirow{2}{*}{Season} & \\multicolumn{2}{c}{Energy (kWh)} \\\\',
    '    \\cmidrule{2-3}',
    '     & {Measured} & {Modelled} \\\\',
    '    \\midrule',
    '    \\endfirsthead',
    '    \\toprule',
    '    \\multirow{2}{*}{Season} & \\multicolumn{2}{c}{Energy (kWh)} \\\\'
  ],
  'xltabular repeats both rows of a header with a cell merged down'
);
eq(tableLatex({ ...long, align: ['l', 'c', 'c'] }).split('\n')[0], '\\begin{xltabular}{\\linewidth}{lcX}', 'xltabular always has an X column');
eq(tablePackages(long), ['booktabs', 'xltabular'], 'xltabular package');

eq(inner({ ...bare, breaks: true, cells: [['Two \\\\ lines', 'b', 'c']], header: false })[2], '    \\makecell{Two \\\\ lines} & b & c \\\\', 'makecell around a cell with a line break');
eq(tablePackages({ ...bare, breaks: true, cells: [['Two \\\\ lines']] }), ['booktabs', 'makecell'], 'makecell only when a cell breaks');
eq(
  tableNotes('a: Measured at noon.\n\n[b] Estimated.\nSource: the logger.'),
  [
    { mark: 'a', text: 'Measured at noon.' },
    { mark: 'b', text: 'Estimated.' },
    { mark: '', text: 'Source: the logger.' }
  ],
  'table notes'
);
eq(
  tableLatex({ ...model, notes: 'a: 50% of runs.' }).split('\n'),
  [
    '\\begin{table}[H]',
    '    \\centering',
    '    \\begin{threeparttable}',
    '        \\caption{Results.}',
    '        \\label{tab:results}',
    '        \\begin{tabular}{lcc}',
    '            \\toprule',
    '            Method & a\\_b & Score \\\\',
    '            \\midrule',
    '            Ours & $x_1$ & 50\\% \\\\',
    '            \\bottomrule',
    '        \\end{tabular}',
    '        \\begin{tablenotes}',
    '            \\small',
    '            \\item[a] 50\\% of runs.',
    '        \\end{tablenotes}',
    '    \\end{threeparttable}',
    '\\end{table}'
  ],
  'threeparttable notes under the table'
);
eq(tablePackages({ ...long, notes: 'a: x' }), ['booktabs', 'xltabular'], 'no threeparttable in xltabular');

eq(
  tableTypst({ ...grouped, float: false }),
  '#table(columns: 3, align: (left, right, right), stroke: none, table.hline(y: 0, stroke: 0.08em), table.hline(y: 1, start: 1, end: 3, stroke: 0.05em), table.hline(y: 2, stroke: 0.05em), table.hline(y: 4, stroke: 0.08em), table.header(table.cell(rowspan: 2)[Season], table.cell(colspan: 2)[Energy (kWh)], [Measured], [Modelled]), [Summer], [2740], [2810.5], [Winter], [-1110], [n\\/a])',
  'Typst: merged cells, a line stopping short, and a header taking both rows of a cell merged down'
);
eq(tableMarkdown({ ...grouped, float: false }).split('\n')[0], '| Season | Energy (kWh) |  |', 'Markdown: merged text in the first cell');

// ─── figure sizes and layouts ───

const share: FigureSize = { mode: 'line', fraction: 0.5, width: 60, height: 40, scale: 0.5 };
eq(graphicsOptions(share, true), 'width=0.5\\linewidth,height=0.8\\textheight,keepaspectratio', 'a single image at a share of the line stays within the page');
eq(graphicsOptions({ ...share, fraction: 1 }), 'width=\\linewidth', 'a panel image at a share of its panel');
eq(graphicsOptions({ ...share, mode: 'width' }), 'width=60mm', 'exact width');
eq(graphicsOptions({ ...share, mode: 'height' }), 'height=40mm', 'exact height');
eq(graphicsOptions({ ...share, mode: 'box' }), 'width=60mm,height=40mm,keepaspectratio', 'fit in a box');
eq(graphicsOptions({ ...share, mode: 'scale' }), 'scale=0.5', 'scale');
eq(graphicsOptions({ ...share, mode: 'width', trim: [2, 0, 2.5, 0] }), 'width=60mm,trim=2mm 0mm 2.5mm 0mm,clip', 'crop');
eq(graphicsOptions({ ...share, mode: 'width', trim: [0, 0, 0, 0] }), 'width=60mm', 'no crop when every edge is 0');
eq(figureLatex({ path: 'images/a.png', width: 0.75, caption: '', label: '', placement: 'H', size: { ...share, mode: 'scale' } }).split('\n')[2], '    \\includegraphics[scale=0.5]{images/a.png}', 'a single figure scaled');
eq([panelWidth(2), panelWidth(3), panelWidth(4)], [0.48, 0.31, 0.22], 'panel widths');
eq(figureSetLabel('Two views of the bridge'), 'fig:two-views-of', 'a set labelled from its caption');
eq(figureSetLabel('', 'images/bridge.png'), 'fig:bridge-set', 'or its first image');

const pair: FigureSet = {
  panels: [
    { path: 'images/a.png', caption: 'Front.', label: 'fig:a' },
    { path: 'images/b.png', caption: 'Side.', label: 'fig:b' }
  ],
  layout: 'row',
  columns: 2,
  labels: 'sub',
  align: 'bottom',
  size: { ...share, fraction: 1 },
  caption: 'Two views.',
  label: 'fig:views',
  placement: 'H'
};
eq(
  figureSetLatex(pair).split('\n'),
  [
    '\\begin{figure}[H]',
    '    \\centering',
    '    \\begin{subfigure}[t]{0.48\\linewidth}',
    '        \\centering',
    '        \\includegraphics[width=\\linewidth]{images/a.png}',
    '        \\caption{Front.}',
    '        \\label{fig:a}',
    '    \\end{subfigure}\\hfill',
    '    \\begin{subfigure}[t]{0.48\\linewidth}',
    '        \\centering',
    '        \\includegraphics[width=\\linewidth]{images/b.png}',
    '        \\caption{Side.}',
    '        \\label{fig:b}',
    '    \\end{subfigure}',
    '    \\caption{Two views.}',
    '    \\label{fig:views}',
    '\\end{figure}'
  ],
  'two sub-figures side by side'
);
eq(figureSetPackages(pair), ['graphicx', 'subcaption'], 'sub-figures need subcaption');
eq(figureSetPackages({ labels: 'separate' }), ['graphicx'], 'separate figures need no extra package');
const separate = figureSetLatex({ ...pair, labels: 'separate' }).split('\n');
eq([separate[2], separate.filter((l) => l.includes('\\caption')).length, separate.includes('    \\label{fig:views}')], ['    \\begin{minipage}[t]{0.48\\linewidth}', 2, false], 'separate figures: a minipage and caption each, no shared caption');
eq(figureSetLatex({ ...pair, labels: 'none' }).split('\n').filter((l) => l.includes('\\caption')), ['    \\caption{Two views.}'], 'one caption only');
eq(figureSetLatex({ ...pair, align: 'top' }).split('\n')[4], '        \\vtop{\\vskip0pt\\hbox{\\includegraphics[width=\\linewidth]{images/a.png}}}', 'tops lined up');
eq(figureSetLatex({ ...pair, align: 'centre' }).split('\n')[2], '    \\begin{subfigure}[c]{0.48\\linewidth}', 'centres lined up');
const grid = figureSetLatex({ ...pair, layout: 'grid', panels: [...pair.panels, ...pair.panels, pair.panels[0]] }).split('\n');
eq(
  grid.filter((l) => /end\{subfigure\}|medskip/.test(l)),
  ['    \\end{subfigure}\\hfill', '    \\end{subfigure}', '    \\par\\medskip', '    \\end{subfigure}\\hfill', '    \\end{subfigure}', '    \\par\\medskip', '    \\end{subfigure}'],
  'a grid of two columns: a new row after every second image'
);
eq(
  figureSetTypst({ ...pair, panels: pair.panels.map((p) => ({ ...p, label: '' })), label: 'fig-views' }),
  '#figure(grid(columns: 2, gutter: 1em, align: bottom, stack(spacing: 0.5em, image("/images/a.png", width: 100%), [(a) Front.]), stack(spacing: 0.5em, image("/images/b.png", width: 100%), [(b) Side.])), caption: [Two views.]) <fig-views>',
  'Typst: a grid, with (a) and (b) under each image'
);
eq(
  figureSetTypst({ ...pair, labels: 'separate', panels: [{ ...pair.panels[0], label: 'fig-a' }] }),
  '#grid(columns: 1, gutter: 1em, align: bottom, [#figure(image("/images/a.png", width: 100%), caption: [Front.]) <fig-a>])',
  'Typst: separate figures each with a label'
);
eq(figureTypst({ path: 'a.png', width: 0.5, caption: '', label: '', size: { ...share, mode: 'scale' } }), '#figure(scale(50%, reflow: true, image("/a.png")))', 'Typst scale');
eq(figureMarkdown({ path: 'a.png', width: 0.5, caption: 'C', label: '', size: { ...share, mode: 'height' } }), '![C](a.png){height=40mm}', 'Markdown height');

Promise.all([
  projectPackages('paper/main.tex', new Set(Object.keys(files)), async (p) => files[p]).then((names) => {
    eq([...names].sort(), ['booktabs', 'float'], 'packages from \\input files, from the main file’s folder or the root');
  }),
  projectPackages('main.tex', new Set(Object.keys(bodied)), async (p) => bodied[p]).then((names) => {
    eq([...names], ['float'], 'only the main file’s preamble counts: not verbatim, nor a subfile’s own preamble');
  }),
  projectPackages('main.tex', new Set(['main.tex', 'preamble.tex']), async (p) => ({ 'main.tex': '\\input{preamble}\n\\usetikzlibrary{calc}\n\\begin{document}\\usetikzlibrary{fit}', 'preamble.tex': '\\usetikzlibrary{arrows.meta}' })[p]!, loadedLibraries).then((names) => {
    eq([...names].sort(), ['arrows.meta', 'calc'], 'libraries from the preamble and its \\input files');
  })
]).then(() => console.log('floats.check: ok'));
