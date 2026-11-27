// Self-check for reading tables out of documents, and Plot's Import table that makes series of them. Run:
// npx esbuild apps/frontend/src/editor/tableRows.check.ts --bundle --platform=node --log-level=warning | node
import { emptyPlot, plotCode, tableSeries } from '../diagram/modes/pgfplots/code';
import { cellNumber, latexTableRows, plainCell, tableKind, tablesIn } from './tableRows';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const lines = (...l: string[]) => l.join('\n');

// ─── LaTeX ───
const booktabs = lines(
  '\\begin{table}[ht]',
  '  \\caption{Error and \\emph{time}}',
  '  \\begin{tabular}{@{}l c r@{}}',
  '    \\toprule',
  '    \\textbf{Method} & RMSE & Time (s) \\\\',
  '    \\midrule',
  '    Baseline & 0.42 & 1.8 \\\\ % a comment & not a cell',
  '    \\multicolumn{2}{c}{Both} & 3 \\\\[2pt]',
  '    \\cmidrule(lr){1-2}',
  '    \\multirow{2}{*}{Ours} & $0.19$ & \\num{2.4} \\\\',
  '    A \\& B & {x & y} & 1\\%',
  '    \\\\ \\bottomrule',
  '  \\end{tabular}',
  '\\end{table}'
);
eq(
  latexTableRows(booktabs),
  [['\\textbf{Method}', 'RMSE', 'Time (s)'], ['Baseline', '0.42', '1.8'], ['Both', '', '3'], ['Ours', '$0.19$', '\\num{2.4}'], ['A \\& B', '{x & y}', '1\\%']],
  'rows of a booktabs tabular: rules, comments, spans and escapes'
);
eq(latexTableRows('\\begin{tabularx}{\\linewidth}{lX}\na & b \\tabularnewline\n\\hline c & d\n\\end{tabularx}'), [['a', 'b'], ['c', 'd']], 'tabularx and \\tabularnewline');
eq(latexTableRows('\\begin{longtable}{ll}\n\\caption{Long}\\label{t}\\\\\nh & i \\\\ \\endhead\n1 & 2 \\\\\n\\end{longtable}'), [['h', 'i'], ['1', '2']], 'longtable’s caption and head markers');
eq(latexTableRows('No table here.'), null, 'no tabular');

eq(plainCell('\\textbf{Method}'), 'Method', 'bold');
eq(plainCell('\\SI{3}{\\metre}'), '3', 'a quantity’s number');
eq(cellNumber('$0.19$'), 0.19, 'maths');
eq(cellNumber('\\num{2.4}'), 2.4, 'siunitx');
eq(cellNumber('$-1.5\\times10^{3}$'), -1500, 'times ten to a power');
eq(cellNumber('−2'), -2, 'a typographic minus');
eq(cellNumber('12\\%'), 12, 'a percentage');
eq(cellNumber('Baseline'), null, 'words');
eq(cellNumber(''), null, 'empty');

// every table in a document, with the caption of the float around it
const doc = lines('\\begin{document}', booktabs, '% \\begin{tabular}{l} commented & out \\end{tabular}', 'Then \\begin{tabular}{cc} 0 & 1 \\\\ 5 & 2 \\end{tabular}.', '\\end{document}');
eq(tablesIn(doc, 'latex').map((t) => [t.caption, t.rows.length]), [['Error and time', 5], ['', 2]], 'LaTeX: two tables, the commented one left out');

// ─── Typst and Markdown ───
const typst = lines('#figure(', '  table(', '    columns: 2,', '    table.header[*t*][*v*],', '    [0], [0],', '    [1], [2.1],', '  ),', '  caption: [Speed],', ') <tab:v>', '#table(columns: (auto, auto), [a], [b])');
eq(tablesIn(typst, 'typst'), [{ rows: [['t', 'v'], ['0', '0'], ['1', '2.1']], caption: 'Speed' }, { rows: [['a', 'b']], caption: '' }], 'Typst: a table in a figure, then one on its own');
const markdown = lines('# Data', '', '| **Year** | Sales |', '|---|---:|', '| 2021 | 10 |', '| 2022 | 14 |', '', 'Table: Sales by year', '', 'A line with a | in it.');
eq(tablesIn(markdown, 'markdown'), [{ rows: [['Year', 'Sales'], ['2021', '10'], ['2022', '14']], caption: 'Sales by year' }], 'Markdown: a pipe table and its caption');
eq([tableKind('a/main.tex'), tableKind('n.typ'), tableKind('R.md'), tableKind('d.csv')], ['latex', 'typst', 'markdown', null], 'kinds by extension');

// ─── Plot's Import table ───
const results = latexTableRows(booktabs)!.slice(0, 2).concat([['Ours, tuned; best', '$0.19$', '\\num{2.4}']]);
const one = tableSeries(results, 0, [1], { header: true, latex: true, ids: [] });
eq(one.series.map((s) => [s.id, s.source, s.points, s.legend, s.bars]), [['s1', 'points', '1, 0.42\n2, 0.19', '', true]], 'words on x: at 1, 2, as bars for one series');
eq([one.xlabel, one.ylabel, one.xticks], ['Method', 'RMSE', '1 = Baseline; 2 = Ours, tuned, best'], 'LaTeX headers without their bold, the words as ticks');
const two = tableSeries(results, 0, [1, 2], { header: true, latex: true, ids: ['s1'] });
eq(two.series.map((s) => [s.id, s.legend, s.bars ?? false]), [['s2', 'RMSE', false], ['s3', 'Time (s)', false]], 'two series: new ids, legends, lines not bars');
eq(two.ylabel, '', 'no y label for two series');
const csv = [['x (m)', 'y_1', 'note'], ['0', '1', 'a'], ['1', '', 'b'], ['2', '4', 'c']];
const numbers = tableSeries(csv, 0, [1], { header: true, latex: false, ids: [] });
eq([numbers.series[0].points, numbers.xlabel, numbers.ylabel, numbers.xticks], ['0, 1\n2, 4', 'x (m)', 'y\\_1', undefined], 'numbers on x, an empty cell skipped, CSV headers escaped');
eq(tableSeries([['1', '2'], ['3', '4']], 0, [1], { header: false, latex: false, ids: [] }).series[0].points, '1, 2\n3, 4', 'no header row');
// what it writes compiles as any typed points do
const code = plotCode({ ...emptyPlot(), ...one }).body;
eq([code.includes('\\addplot+[ybar, fill=.!30, area legend] coordinates {(1,0.42) (2,0.19)};'), code.includes('xticklabels={{Baseline},{Ours, tuned, best}}')], [true, true], 'the plot’s code: bars and the tick labels');

console.log('tableRows.check: ok');
