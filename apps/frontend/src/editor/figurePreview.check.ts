// Self-check for Preview this figure's choice of piece. Run (bundle it first):
// npx esbuild apps/frontend/src/editor/figurePreview.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --outfile=/tmp/f.mjs && node /tmp/f.mjs
import { figureAt } from './figurePreview';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const at = (text: string) => figureAt(text.replace('|', ''), text.indexOf('|'));

const tikz = '\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}';
const doc = `\\begin{document}\nText.\n\\begin{figure}[htbp]\n  \\centering\n  ${tikz}\n  \\caption{A line}\n\\end{figure}\n\\end{document}`;
eq(at(doc.replace('(1,1)', '(1,|1)')), { piece: tikz, name: 'tikzpicture' }, 'the innermost picture, whole');
eq(
  at(doc.replace('\\caption{A', '\\caption{|A')),
  { piece: `\\makeatletter\\def\\@captype{figure}\\makeatother\n\n  \\centering\n  ${tikz}\n  \\caption{A line}\n`, name: 'figure' },
  'on the caption: the float’s body, without [htbp], with its caption type'
);
eq(at(doc.replace('Text.', 'Te|xt.')), null, 'in text: nothing');
eq(at('\\begin{tabular}{ll}\n a & |b \\\\\n\\end{tabular}'), { piece: '\\begin{tabular}{ll}\n a & b \\\\\n\\end{tabular}', name: 'tabular' }, 'a table');
eq(at('\\begin{align*}\n a &= |b\n\\end{align*}')?.name, 'align*', 'display maths');
const nested = '\\begin{tabular}{l}\\begin{tabular}{l}x\\end{tabular} |y\\end{tabular}';
eq(at(nested)?.piece, nested.replace('|', ''), 'past a nested one of the same name');
eq(at('\\begin{tikzpicture} \\draw |(0,0);'), null, 'not closed yet');
eq(figureAt('one two three', 4, 7), { piece: 'two', name: 'selection' }, 'a selection as it is');
eq(figureAt('one   three', 3, 6), null, 'a blank selection');

console.log('figurePreview: all checks passed');
