// Self-check for the maths preview: which maths the cursor is in, the document's macros, and how KaTeX is asked to
// render. Run: npx esbuild apps/frontend/src/editor/mathPreview.check.ts --bundle --platform=node --format=esm --loader:.css=empty --outfile=/tmp/m.mjs && node /tmp/m.mjs
import katex from 'katex';
import { checkMaths, katexOptions, mathsAt } from './mathPreview';
import { texMacros } from './texMacros';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const at = (text: string) => {
  const span = mathsAt(text.replace('|', ''), text.indexOf('|'));
  return span && { tex: span.tex, display: span.display, shown: text.replace('|', '').slice(span.from, span.to) };
};

// the maths at the cursor
eq(at('Let $x^|2$ be'), { tex: 'x^2', display: false, shown: '$x^2$' }, 'inline $');
eq(at('Let \\(a|+b\\) be'), { tex: 'a+b', display: false, shown: '\\(a+b\\)' }, '\\( \\)');
eq(at('$$\\frac{1}{|2}$$'), { tex: '\\frac{1}{2}', display: true, shown: '$$\\frac{1}{2}$$' }, '$$');
eq(at('\\[ x |= 1 \\]'), { tex: ' x = 1 ', display: true, shown: '\\[ x = 1 \\]' }, '\\[ \\]');
eq(at('\\begin{align}\n  a &= b \\label{eq:a}\\\\\n  c &|= d % note\n\\end{align}')?.tex, '\\begin{align*}\n  a &= b \\\\\n  c &= d \n\\end{align*}', 'an environment whole and unnumbered, without its label and comment');
eq(at('\\begin{equation}\n  E |= mc^2\n\\end{equation}')?.tex, '\n  E = mc^2\n', 'equation as its body');
eq(at('\\begin{alignat}{2} a |&= b \\end{alignat}')?.tex, '\\begin{alignat*}{2} a &= b \\end{alignat*}', 'an environment’s argument stays');
eq(at('Text |here $x$'), null, 'not in maths');
eq(at('$x + |'), null, 'no closer yet');
eq(at('$x + |\n\nlater $y$'), null, 'not past a blank line');
eq(at('$|$'), null, 'nothing in it');
eq(at('$\\text{a |b}$'), null, 'in \\text, which is text');
eq(at('$a \\$ |b$')?.tex, 'a \\$ b', 'an escaped $ isn’t the closer');
eq(at('\\newcommand{\\x}{$a|$}'), null, 'not in a definition');
eq(mathsAt('Para.\n\nLet $x$ and $y$ be', 'Para.\n\nLet $x$ and $'.length + 1, 'Para.\n\n'.length)?.tex, 'y', 'Markdown: from the paragraph');

// the document's macros
eq(
  texMacros('\\newcommand{\\R}{\\mathbb{R}}\\renewcommand\\vec[1]{\\mathbf{#1}}\\newcommand{\\opt}[2][x]{#1#2}\\def\\eps{\\varepsilon}\\DeclareMathOperator*{\\argmax}{arg\\,max}\\DeclareMathOperator{\\tr}{tr}\\DeclarePairedDelimiter\\abs{\\lvert}{\\rvert}'),
  {
    '\\R': '\\mathbb{R}',
    '\\vec': '\\mathbf{#1}',
    '\\eps': '\\varepsilon',
    '\\argmax': '\\operatorname*{arg\\,max}',
    '\\tr': '\\operatorname{tr}',
    '\\abs': '\\mathopen{\\lvert}#1\\mathclose{\\rvert}'
  },
  'definitions, without the one whose first argument is optional'
);
eq(texMacros('\\newcommand{\\broken}{\\frac{'), {}, 'one that never closes is left out');

// KaTeX as the preview asks it
const span = (tex: string) => ({ from: 0, to: 0, tex, display: false });
const html = (tex: string, macros: Record<string, string> = {}) => (checkMaths(katex, span(tex), macros), katex.renderToString(tex, katexOptions(span(tex), macros)));
const fails = (tex: string, macros: Record<string, string> = {}) => {
  try {
    html(tex, macros);
    return false;
  } catch {
    return true;
  }
};
eq(html('\\R^n', { '\\R': '\\mathbb{R}' }).includes('mathbb'), true, 'a project macro renders');
eq(fails('\\qty{3}{\\metre}'), true, 'a package’s command KaTeX doesn’t know fails rather than shows red text');
eq(fails('\\frac{1}{'), true, 'an unfinished fraction fails');
eq(fails('\\href{https://example.com}{x}'), true, 'no link from \\href with trust off: it fails');
eq(fails('\\includegraphics{x.png}'), true, 'nor an image');
eq(fails('\\loop', { '\\loop': '\\loop' }), true, 'a macro that expands for ever stops');
const macros = { '\\R': '\\mathbb{R}' };
html('\\gdef\\new{1}', macros);
eq(Object.keys(macros), ['\\R'], 'the macros given aren’t changed by \\gdef');

console.log('mathPreview: all checks passed');
